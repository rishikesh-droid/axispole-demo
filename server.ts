import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import { sanitizeRoomReplicaScene } from './src/utils/roomReplica.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_DECODED_IMAGE_BYTES = 6 * 1024 * 1024; // 6 MB

const ROOM_REPLICA_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    roomType: {
      type: Type.STRING,
      description: 'Short label for the room type, e.g. Home Office, Bedroom, Living Room, Studio.',
    },
    summary: {
      type: Type.STRING,
      description: 'Concise 1-sentence architectural summary of the scanned room and extrapolated areas.',
    },
    floorMaterial: {
      type: Type.STRING,
      description: 'Must be one of: wood-light, wood-dark, tile, carpet, concrete.',
    },
    floorColor: {
      type: Type.STRING,
      description: 'Hex color string like #b8946e representing the dominant floor tone.',
    },
    wallColor: {
      type: Type.STRING,
      description: 'Hex color string like #dcd8d0 representing the primary wall paint color.',
    },
    accentWallColor: {
      type: Type.STRING,
      description: 'Hex color string representing a secondary/accent wall color if present, otherwise wallColor.',
    },
    ceilingColor: {
      type: Type.STRING,
      description: 'Hex color string like #f0eee9 representing the ceiling color.',
    },
    trimColor: {
      type: Type.STRING,
      description: 'Hex color string like #e6e3dc representing baseboards and door/window trim.',
    },
    lightingMood: {
      type: Type.STRING,
      description: 'Must be one of: warm, neutral, cool, dim.',
    },
    objects: {
      type: Type.ARRAY,
      description:
        'List of all visible furniture/architectural fixtures (inferred: false) PLUS 3 to 6 realistic architectural completions for unseen areas of the room (inferred: true).',
      items: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            description:
              'One of: desk, chair, office-chair, table, sofa, bed, bookshelf, cabinet, wardrobe, tv-stand, rug, plant, lamp, window, door, mirror, wall-art, fitness-mat.',
          },
          label: {
            type: Type.STRING,
            description: 'Short human-readable object name, e.g. Oak Work Desk, Mesh Office Chair, Window.',
          },
          x: {
            type: Type.NUMBER,
            description:
              'Horizontal X position in meters in room coordinates (-roomWidthM/2 is left wall, +roomWidthM/2 is right wall, 0 is center).',
          },
          z: {
            type: Type.NUMBER,
            description:
              'Depth Z position in meters in room coordinates (-roomDepthM/2 is back wall facing the camera, +roomDepthM/2 is front wall behind the camera, 0 is center).',
          },
          widthM: {
            type: Type.NUMBER,
            description: 'Object width in meters along its local X axis.',
          },
          depthM: {
            type: Type.NUMBER,
            description: 'Object depth in meters along its local Z axis.',
          },
          heightM: {
            type: Type.NUMBER,
            description: 'Object height in meters.',
          },
          rotationDeg: {
            type: Type.NUMBER,
            description: 'Yaw rotation in degrees (0 = facing +Z toward viewer, 90 = facing +X right, -90 = facing -X left, 180 = facing -Z back wall).',
          },
          primaryColor: {
            type: Type.STRING,
            description: 'Primary surface hex color, e.g. #8b6547.',
          },
          secondaryColor: {
            type: Type.STRING,
            description: 'Secondary accent/frame/cushion hex color, e.g. #2a2e36.',
          },
          inferred: {
            type: Type.BOOLEAN,
            description:
              'false if the object is visibly present in the captured camera image; true if extrapolated for unseen portions of the room.',
          },
          confidence: {
            type: Type.NUMBER,
            description: 'Detection or architectural inference confidence between 0.5 and 0.99.',
          },
        },
        required: [
          'type',
          'label',
          'x',
          'z',
          'widthM',
          'depthM',
          'heightM',
          'rotationDeg',
          'primaryColor',
          'secondaryColor',
          'inferred',
          'confidence',
        ],
      },
    },
  },
  required: [
    'roomType',
    'summary',
    'floorMaterial',
    'floorColor',
    'wallColor',
    'accentWallColor',
    'ceilingColor',
    'trimColor',
    'lightingMood',
    'objects',
  ],
};

function parseImagePayload(raw: unknown): { mimeType: string; data: string } | null {
  if (typeof raw !== 'string' || raw.length < 32) return null;
  const trimmed = raw.trim();
  const dataUrlMatch = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(trimmed);
  if (!dataUrlMatch) return null;

  const mimeType = dataUrlMatch[1].toLowerCase();
  const base64Data = dataUrlMatch[2];
  if (!ALLOWED_IMAGE_MIME.has(mimeType)) return null;

  const estimatedBytes = Math.floor((base64Data.length * 3) / 4);
  if (estimatedBytes <= 0 || estimatedBytes > MAX_DECODED_IMAGE_BYTES) return null;

  return { mimeType, data: base64Data };
}

function finiteOr(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

async function startServer(): Promise<void> {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '8mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY?.trim() ?? '';
    res.json({
      ok: true,
      visionConfigured: apiKey.length > 10 && apiKey !== 'MY_GEMINI_API_KEY',
    });
  });

  app.post('/api/analyze-room', async (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown> | undefined;
      if (!body || typeof body !== 'object') {
        res.status(400).json({ error: 'Invalid JSON request payload.' });
        return;
      }

      const parsedImage = parseImagePayload(body.imageDataUrl);
      if (!parsedImage) {
        res.status(400).json({
          error: 'A valid JPEG, PNG, or WebP camera snapshot (max 6MB) is required.',
        });
        return;
      }

      const roomWidthM = finiteOr(body.roomWidthM, 3.8, 2.0, 9.0);
      const roomDepthM = finiteOr(body.roomDepthM, 3.6, 2.0, 9.0);
      const ceilingHeightCm = Math.round(finiteOr(body.ceilingHeightCm, 274, 215, 500));
      const distanceM = finiteOr(body.distanceM, 2.6, 1.0, 6.5);
      const poleOffsetXM = finiteOr(body.poleOffsetXM, 0, -roomWidthM * 0.4, roomWidthM * 0.4);
      const floorAccuracyPct = Math.round(finiteOr(body.floorAccuracyPct, 93, 50, 99));
      const ceilingAccuracyPct = Math.round(finiteOr(body.ceilingAccuracyPct, 92, 50, 99));
      const overallAccuracyPct = Math.round(finiteOr(body.overallAccuracyPct, 93, 50, 99));

      const apiKey = process.env.GEMINI_API_KEY?.trim() ?? '';
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        res.status(503).json({
          error:
            'Gemini Vision API key is not configured on the server. Set GEMINI_API_KEY in environment secrets to enable 3D Room Replica scanning.',
        });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const halfW = (roomWidthM / 2).toFixed(2);
      const halfD = (roomDepthM / 2).toFixed(2);
      const ceilM = (ceilingHeightCm / 100).toFixed(2);

      const prompt = [
        'You are an architectural 3D spatial reconstruction expert analyzing a single room photograph captured during an AR pole-fitting scan.',
        '',
        'AR Metric Room Dimensions:',
        `- Room Width (X): ${roomWidthM.toFixed(1)} m (Left wall x = -${halfW} m, Right wall x = +${halfW} m)`,
        `- Room Depth (Z): ${roomDepthM.toFixed(1)} m (Back wall facing camera z = -${halfD} m, Front wall behind camera z = +${halfD} m)`,
        `- Ceiling Height (Y): ${ceilM} m (${ceilingHeightCm} cm)`,
        `- Camera-to-wall distance: ${distanceM.toFixed(2)} m; Dance pole will stand near (x=${poleOffsetXM.toFixed(2)}, z=0.00).`,
        '',
        'Instructions:',
        '1. Faithfully identify the room type, exact floor material & hex color, wall paint hex color, accent wall color, ceiling color, baseboard trim color, and lighting mood from the photo.',
        '2. Detect EVERY visible piece of furniture and architectural feature in the photo (desks, tables, chairs, office chairs, sofas, beds, bookshelves, cabinets, wardrobes, TV stands, rugs, potted plants, lamps, windows, doors, mirrors, wall art, mats). Place each accurately in room coordinates (x, z) with realistic dimensions in meters, accurate hex colors, and inferred: false.',
        '3. Because a single camera frame rarely shows the entire room, intelligently extrapolate 3 to 6 plausible architectural & furniture items for the UNSEEN portions of the room (e.g., matching side-wall window or entry door, complementary bookshelf/cabinet/lamp/plant/rug/wall-art consistent with the detected room type and color palette). Mark extrapolated items with inferred: true.',
        '4. Keep the central dance-pole training zone around (x=' +
          poleOffsetXM.toFixed(2) +
          ', z=0) free of tall blocking furniture (rugs or mats on the floor are okay, push desks/chairs/sofas closer to walls).',
        '5. Return strictly valid JSON matching the schema.',
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: parsedImage.mimeType,
                data: parsedImage.data,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: ROOM_REPLICA_SCHEMA,
        },
      });

      const rawText = response.text?.trim();
      if (!rawText) {
        res.status(502).json({ error: 'Vision model returned an empty scene analysis.' });
        return;
      }

      let parsedJson: Record<string, unknown>;
      try {
        parsedJson = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        res.status(502).json({ error: 'Vision model returned malformed scene JSON.' });
        return;
      }

      const scene = sanitizeRoomReplicaScene(parsedJson, {
        roomWidthM,
        roomDepthM,
        ceilingHeightCm,
        poleOffsetXM,
        floorAccuracyPct,
        ceilingAccuracyPct,
        overallAccuracyPct,
      });

      res.json({ scene });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[api/analyze-room] Vision analysis failed:', msg);
      const isQuota = /429|quota|rate limit/i.test(msg);
      res.status(isQuota ? 429 : 502).json({
        error: isQuota
          ? 'Vision scan rate limit reached. Please wait a few seconds and retry.'
          : 'Could not analyze room scene right now. Please retry or apply dimensions only.',
      });
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AxisPole Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start AxisPole Studio server:', err);
  process.exit(1);
});
