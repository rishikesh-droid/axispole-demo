import type {
  RoomReplicaFloorMaterial,
  RoomReplicaLightingMood,
  RoomReplicaObject,
  RoomReplicaObjectType,
  RoomReplicaScene,
} from '../types/pole';
import { MAX_ROOM_SIZE_M, MIN_CEILING_HEIGHT_CM, MAX_CEILING_HEIGHT_CM } from './poleConfig';

export const VALID_REPLICA_OBJECT_TYPES: readonly RoomReplicaObjectType[] = [
  'desk',
  'chair',
  'office-chair',
  'table',
  'sofa',
  'bed',
  'bookshelf',
  'cabinet',
  'wardrobe',
  'tv-stand',
  'rug',
  'plant',
  'lamp',
  'window',
  'door',
  'mirror',
  'wall-art',
  'fitness-mat',
] as const;

export const VALID_FLOOR_MATERIALS: readonly RoomReplicaFloorMaterial[] = [
  'wood-light',
  'wood-dark',
  'tile',
  'carpet',
  'concrete',
] as const;

export const VALID_LIGHTING_MOODS: readonly RoomReplicaLightingMood[] = [
  'warm',
  'neutral',
  'cool',
  'dim',
] as const;

const WALL_MOUNTED_TYPES = new Set<RoomReplicaObjectType>([
  'window',
  'door',
  'mirror',
  'wall-art',
]);

const FLOOR_FLAT_TYPES = new Set<RoomReplicaObjectType>(['rug', 'fitness-mat']);

const OBJECT_TYPE_DEFAULTS: Record<
  RoomReplicaObjectType,
  { w: number; d: number; h: number; primary: string; secondary: string }
> = {
  desk: { w: 1.35, d: 0.65, h: 0.75, primary: '#8b6547', secondary: '#2c3038' },
  chair: { w: 0.5, d: 0.52, h: 0.86, primary: '#6e523a', secondary: '#c8bfb2' },
  'office-chair': { w: 0.62, d: 0.62, h: 1.05, primary: '#2b2f38', secondary: '#525866' },
  table: { w: 1.15, d: 0.72, h: 0.74, primary: '#9c7450', secondary: '#3b3733' },
  sofa: { w: 1.95, d: 0.88, h: 0.82, primary: '#5a6270', secondary: '#c7b8a3' },
  bed: { w: 1.65, d: 2.05, h: 0.62, primary: '#d9d4cc', secondary: '#6b7280' },
  bookshelf: { w: 0.9, d: 0.34, h: 1.85, primary: '#7a593d', secondary: '#353942' },
  cabinet: { w: 1.05, d: 0.45, h: 0.88, primary: '#cfc8be', secondary: '#5e4c3d' },
  wardrobe: { w: 1.15, d: 0.58, h: 2.05, primary: '#d8d2c7', secondary: '#454852' },
  'tv-stand': { w: 1.4, d: 0.42, h: 0.54, primary: '#383431', secondary: '#14171f' },
  rug: { w: 1.8, d: 1.3, h: 0.02, primary: '#b7ab9a', secondary: '#6d655c' },
  plant: { w: 0.42, d: 0.42, h: 1.1, primary: '#3d6b47', secondary: '#c9b8a3' },
  lamp: { w: 0.36, d: 0.36, h: 1.58, primary: '#2d3038', secondary: '#f4e6cc' },
  window: { w: 1.35, d: 0.1, h: 1.35, primary: '#e6e2da', secondary: '#b9d6f2' },
  door: { w: 0.86, d: 0.08, h: 2.05, primary: '#d5cdc2', secondary: '#8c8378' },
  mirror: { w: 0.85, d: 0.05, h: 1.75, primary: '#272a30', secondary: '#cbd5e1' },
  'wall-art': { w: 0.82, d: 0.04, h: 0.96, primary: '#2b2d34', secondary: '#d8cfc0' },
  'fitness-mat': { w: 1.75, d: 0.68, h: 0.025, primary: '#475569', secondary: '#334155' },
};

export interface RoomReplicaHints {
  roomWidthM: number;
  roomDepthM: number;
  ceilingHeightCm: number;
  poleOffsetXM?: number;
  floorAccuracyPct?: number;
  ceilingAccuracyPct?: number;
  overallAccuracyPct?: number;
  previewDataUrl?: string;
}

export function sanitizeHexColor(input: unknown, fallback: string): string {
  if (typeof input !== 'string') return fallback;
  const trimmed = input.trim();
  const match = /^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.exec(trimmed);
  if (!match) return fallback;
  const raw = match[1];
  if (raw.length === 3) {
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`.toLowerCase();
  }
  return `#${raw}`.toLowerCase();
}

function clampFinite(val: unknown, min: number, max: number, fallback: number): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeObjectType(rawType: unknown): RoomReplicaObjectType {
  if (typeof rawType === 'string') {
    const t = rawType.trim().toLowerCase().replace(/[_\s]+/g, '-');
    if ((VALID_REPLICA_OBJECT_TYPES as readonly string[]).includes(t)) {
      return t as RoomReplicaObjectType;
    }
    if (t.includes('desk') || t.includes('workstation')) return 'desk';
    if (t.includes('office') && t.includes('chair')) return 'office-chair';
    if (t.includes('chair') || t.includes('stool') || t.includes('armchair')) return 'chair';
    if (t.includes('table') || t.includes('nightstand') || t.includes('bench')) return 'table';
    if (t.includes('sofa') || t.includes('couch') || t.includes('loveseat')) return 'sofa';
    if (t.includes('bed') || t.includes('mattress')) return 'bed';
    if (t.includes('shelf') || t.includes('bookcase') || t.includes('rack')) return 'bookshelf';
    if (t.includes('wardrobe') || t.includes('closet') || t.includes('armoire')) return 'wardrobe';
    if (t.includes('cabinet') || t.includes('dresser') || t.includes('drawer') || t.includes('credenza')) return 'cabinet';
    if (t.includes('tv') || t.includes('media') || t.includes('console')) return 'tv-stand';
    if (t.includes('rug') || t.includes('carpet')) return 'rug';
    if (t.includes('mat')) return 'fitness-mat';
    if (t.includes('plant') || t.includes('tree') || t.includes('pot')) return 'plant';
    if (t.includes('lamp') || t.includes('light')) return 'lamp';
    if (t.includes('window') || t.includes('curtain') || t.includes('blind')) return 'window';
    if (t.includes('door')) return 'door';
    if (t.includes('mirror')) return 'mirror';
    if (t.includes('art') || t.includes('frame') || t.includes('poster') || t.includes('painting') || t.includes('clock')) return 'wall-art';
  }
  return 'cabinet';
}

function normalizeLabel(rawLabel: unknown, type: RoomReplicaObjectType): string {
  if (typeof rawLabel === 'string') {
    const cleaned = rawLabel.replace(/[^\w\s\-/&]/g, '').trim().slice(0, 36);
    if (cleaned.length >= 2) return cleaned;
  }
  return type
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

/**
 * Sanitizes, bounds-clamps, and collision-checks an on-device room reconstruction
 * against the AR-measured room dimensions and pole anchor position.
 */
export function sanitizeRoomReplicaScene(
  raw: Record<string, unknown> | null | undefined,
  hints: RoomReplicaHints
): RoomReplicaScene {
  const safeRaw = raw && typeof raw === 'object' ? raw : {};

  const roomWidthM = Number(
    clampFinite(hints.roomWidthM, 2.0, MAX_ROOM_SIZE_M, 3.8).toFixed(1)
  );
  const roomDepthM = Number(
    clampFinite(hints.roomDepthM, 2.0, MAX_ROOM_SIZE_M, 3.6).toFixed(1)
  );
  const ceilingHeightCm = Math.round(
    clampFinite(hints.ceilingHeightCm, MIN_CEILING_HEIGHT_CM, MAX_CEILING_HEIGHT_CM, 274)
  );
  const ceilingHeightM = ceilingHeightCm / 100;
  const poleX = clampFinite(hints.poleOffsetXM, -roomWidthM * 0.3, roomWidthM * 0.3, 0);
  const poleZ = 0;
  const poleClearRadius = 0.46;

  const rawFloorMat = typeof safeRaw.floorMaterial === 'string' ? safeRaw.floorMaterial.toLowerCase() : '';
  const floorMaterial: RoomReplicaFloorMaterial = (VALID_FLOOR_MATERIALS as readonly string[]).includes(
    rawFloorMat
  )
    ? (rawFloorMat as RoomReplicaFloorMaterial)
    : 'wood-light';

  const rawMood = typeof safeRaw.lightingMood === 'string' ? safeRaw.lightingMood.toLowerCase() : '';
  const lightingMood: RoomReplicaLightingMood = (VALID_LIGHTING_MOODS as readonly string[]).includes(
    rawMood
  )
    ? (rawMood as RoomReplicaLightingMood)
    : 'neutral';

  const roomTypeRaw = typeof safeRaw.roomType === 'string' ? safeRaw.roomType.trim().slice(0, 32) : '';
  const roomType = roomTypeRaw.length >= 2 ? roomTypeRaw : 'Home Room';

  const summaryRaw = typeof safeRaw.summary === 'string' ? safeRaw.summary.trim().slice(0, 140) : '';
  const summary =
    summaryRaw.length >= 4
      ? summaryRaw
      : `Scanned ${roomWidthM.toFixed(1)}×${roomDepthM.toFixed(1)}m ${roomType.toLowerCase()} with architectural completion.`;

  const floorColor = sanitizeHexColor(safeRaw.floorColor, '#b99976');
  const wallColor = sanitizeHexColor(safeRaw.wallColor, '#d8d4cc');
  const accentWallColor = sanitizeHexColor(safeRaw.accentWallColor, wallColor);
  const ceilingColor = sanitizeHexColor(safeRaw.ceilingColor, '#eceae4');
  const trimColor = sanitizeHexColor(safeRaw.trimColor, '#e2dfd8');

  const halfW = roomWidthM / 2;
  const halfD = roomDepthM / 2;

  const rawObjects = Array.isArray(safeRaw.objects) ? safeRaw.objects : [];
  const objects: RoomReplicaObject[] = [];

  for (let i = 0; i < Math.min(rawObjects.length, 24); i++) {
    const item = rawObjects[i];
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;

    const type = normalizeObjectType(rec.type);
    const defs = OBJECT_TYPE_DEFAULTS[type];
    const isWallItem = WALL_MOUNTED_TYPES.has(type);
    const isFloorFlat = FLOOR_FLAT_TYPES.has(type);

    const widthM = Number(
      clampFinite(rec.widthM, 0.2, Math.min(roomWidthM * 0.72, 2.8), defs.w).toFixed(2)
    );
    const depthM = Number(
      clampFinite(rec.depthM, isWallItem ? 0.04 : 0.2, Math.min(roomDepthM * 0.65, 2.4), defs.d).toFixed(2)
    );
    const heightM = Number(
      clampFinite(
        rec.heightM,
        isFloorFlat ? 0.012 : 0.25,
        Math.min(ceilingHeightM - 0.08, 2.55),
        Math.min(defs.h, ceilingHeightM - 0.12)
      ).toFixed(2)
    );

    const rawRot = clampFinite(rec.rotationDeg, -360, 360, 0);
    // Normalize rotation to [-180, 180]
    let rotationDeg = ((rawRot + 180) % 360 + 360) % 360 - 180;
    const rotRad = (rotationDeg * Math.PI) / 180;
    const effHalfX = Math.abs(Math.cos(rotRad)) * (widthM / 2) + Math.abs(Math.sin(rotRad)) * (depthM / 2);
    const effHalfZ = Math.abs(Math.sin(rotRad)) * (widthM / 2) + Math.abs(Math.cos(rotRad)) * (depthM / 2);

    const marginX = isWallItem ? 0.04 : Math.min(halfW - 0.12, effHalfX + 0.04);
    const marginZ = isWallItem ? 0.04 : Math.min(halfD - 0.12, effHalfZ + 0.04);

    let x = clampFinite(rec.x, -halfW + marginX, halfW - marginX, 0);
    let z = clampFinite(rec.z, -halfD + marginZ, halfD - marginZ, -halfD + marginZ);

    // Snap wall-mounted fixtures cleanly onto back wall (z = -halfD) or left wall (x = -halfW)
    // so they never float in mid-air or obstruct the open front-right cutaway camera.
    if (isWallItem) {
      const distBack = Math.abs(z - -halfD);
      const distLeft = Math.abs(x - -halfW);
      if (distBack <= distLeft) {
        z = -halfD + depthM / 2 + 0.01;
        x = clampFinite(x, -halfW + widthM / 2 + 0.12, halfW - widthM / 2 - 0.12, 0);
        rotationDeg = 0;
      } else {
        x = -halfW + depthM / 2 + 0.01;
        z = clampFinite(z, -halfD + widthM / 2 + 0.12, halfD - widthM / 2 - 0.12, 0);
        rotationDeg = 90;
      }
    } else if (!isFloorFlat) {
      // Ensure freestanding furniture never clips through the pole vertical axis at (poleX, poleZ)
      const dx = x - poleX;
      const dz = z - poleZ;
      const clearanceX = effHalfX + poleClearRadius;
      const clearanceZ = effHalfZ + poleClearRadius;

      if (Math.abs(dx) < clearanceX && Math.abs(dz) < clearanceZ) {
        const pushX = clearanceX - Math.abs(dx);
        const pushZ = clearanceZ - Math.abs(dz);
        if (pushZ <= pushX) {
          // Prefer pushing toward back wall so center floor stays open for pole dancing
          const targetZ = dz <= 0 ? poleZ - clearanceZ : poleZ + clearanceZ;
          z = clampFinite(targetZ, -halfD + marginZ, halfD - marginZ, -halfD + marginZ);
          // If still colliding (very compact room), push laterally as well
          if (Math.abs(z - poleZ) < clearanceZ - 0.05) {
            const targetX = dx <= 0 ? poleX - clearanceX : poleX + clearanceX;
            x = clampFinite(targetX, -halfW + marginX, halfW - marginX, -halfW + marginX);
          }
        } else {
          const targetX = dx <= 0 ? poleX - clearanceX : poleX + clearanceX;
          x = clampFinite(targetX, -halfW + marginX, halfW - marginX, -halfW + marginX);
        }
      }
    }

    const inferred = Boolean(rec.inferred);
    const confidence = Number(
      clampFinite(rec.confidence, 0.35, 0.99, inferred ? 0.72 : 0.9).toFixed(2)
    );

    objects.push({
      id: `replica-obj-${i + 1}`,
      type,
      label: normalizeLabel(rec.label, type),
      x: Number(x.toFixed(2)),
      z: Number(z.toFixed(2)),
      widthM,
      depthM,
      heightM,
      rotationDeg: Math.round(rotationDeg),
      primaryColor: sanitizeHexColor(rec.primaryColor, defs.primary),
      secondaryColor: sanitizeHexColor(rec.secondaryColor, defs.secondary),
      inferred,
      confidence,
    });
  }

  const visibleObjectCount = objects.filter((o) => !o.inferred).length;
  const inferredObjectCount = objects.filter((o) => o.inferred).length;

  return {
    roomType,
    summary,
    capturedAt: new Date().toISOString(),
    roomWidthM,
    roomDepthM,
    ceilingHeightCm,
    floorMaterial,
    floorColor,
    wallColor,
    accentWallColor,
    ceilingColor,
    trimColor,
    lightingMood,
    objects,
    visibleObjectCount,
    inferredObjectCount,
    floorAccuracyPct: Math.round(clampFinite(hints.floorAccuracyPct, 50, 99, 93)),
    ceilingAccuracyPct: Math.round(clampFinite(hints.ceilingAccuracyPct, 50, 99, 92)),
    overallAccuracyPct: Math.round(clampFinite(hints.overallAccuracyPct, 50, 99, 93)),
    previewDataUrl: hints.previewDataUrl,
  };
}

/**
 * Captures the current HTMLVideoElement camera feed as a crisp JPEG data URL
 * suitable for on-device room reconstruction.
 */
export function captureVideoFrameDataUrl(
  video: HTMLVideoElement | null,
  maxDim = 1024,
  quality = 0.86
): string | null {
  if (!video || video.readyState < 2 || video.videoWidth < 64 || video.videoHeight < 64) {
    return null;
  }
  try {
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.max(64, Math.round(video.videoWidth * scale));
    const h = Math.max(64, Math.round(video.videoHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return null;
  }
}

/**
 * Compresses an uploaded room photo File into a bounded JPEG data URL
 * so desktop/camera-less users can also generate an on-device 3D room replica.
 */
export async function compressImageFileToDataUrl(
  file: File,
  maxDim = 1024,
  quality = 0.86
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a JPEG, PNG, or WebP room photo.');
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode the selected image.'));
      el.src = objectUrl;
    });
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const w = Math.max(64, Math.round((img.naturalWidth || 640) * scale));
    const h = Math.max(64, Math.round((img.naturalHeight || 480) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable to process image.');
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
