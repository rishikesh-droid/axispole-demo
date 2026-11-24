import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeTiledDetectionsWithNMS,
  reconstructRoomLocallyFromPixels,
  sampleRoomPaletteAndMaterials,
  type RawObjectDetection,
} from './localRoomScanner';
import {
  normalizeOpenVocabResults,
  OPEN_VOCAB_PROMPTS,
} from './openVocabDetector';
import { DEFAULT_AR_MARKERS } from './arMeasure';

function createSyntheticRoomRgba(width: number, height: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const ceilPx = Math.floor(height * 0.2);
  const floorPx = Math.floor(height * 0.74);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      let r = 216;
      let g = 210;
      let b = 200;

      if (y < ceilPx) {
        // Off-white ceiling
        r = 238;
        g = 236;
        b = 230;
      } else if (y >= floorPx) {
        // Warm light oak wood floor with subtle plank striping
        const plank = (y % 6 === 0) ? -12 : 0;
        r = 186 + plank;
        g = 152 + plank;
        b = 114 + plank;
      } else {
        // Warm beige walls
        r = 212;
        g = 204;
        b = 192;
      }

      // Bright daylight window on back-left upper wall
      if (x >= Math.floor(width * 0.2) && x <= Math.floor(width * 0.44) && y >= Math.floor(height * 0.28) && y <= Math.floor(height * 0.56)) {
        r = 242;
        g = 246;
        b = 250;
      }

      // Dark walnut desk silhouette on back-right wall touching floor
      if (x >= Math.floor(width * 0.62) && x <= Math.floor(width * 0.88) && y >= Math.floor(height * 0.54) && y <= Math.floor(height * 0.78)) {
        r = 82;
        g = 56;
        b = 40;
      }

      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = 255;
    }
  }
  return rgba;
}

test('sampleRoomPaletteAndMaterials extracts real ceiling, wall, warm wood floor, and lighting mood', () => {
  const w = 160;
  const h = 120;
  const rgba = createSyntheticRoomRgba(w, h);
  const markers = { ...DEFAULT_AR_MARKERS, ceilingY: 0.2, floorY: 0.74 };

  const palette = sampleRoomPaletteAndMaterials(rgba, w, h, markers);
  assert.equal(palette.floorMaterial, 'wood-light');
  assert.equal(palette.lightingMood, 'warm');
  assert.match(palette.wallColor, /^#[0-9a-f]{6}$/);
  assert.match(palette.floorColor, /^#[0-9a-f]{6}$/);
  assert.match(palette.ceilingColor, /^#[0-9a-f]{6}$/);
});

test('reconstructRoomLocallyFromPixels works 100% offline with pure pixel CV (zero external detections)', () => {
  const w = 160;
  const h = 120;
  const rgba = createSyntheticRoomRgba(w, h);
  const markers = { ...DEFAULT_AR_MARKERS, ceilingY: 0.2, floorY: 0.74 };

  const result = reconstructRoomLocallyFromPixels(rgba, w, h, {
    markers,
    roomWidthM: 4.0,
    roomDepthM: 3.8,
    ceilingHeightCm: 274,
    distanceM: 2.8,
    poleOffsetXM: 0,
    floorAccuracyPct: 94,
    ceilingAccuracyPct: 93,
    overallAccuracyPct: 94,
    externalDetections: [],
  });

  assert.equal(result.detectorEngine, 'pixel-cv');
  assert.ok(result.scene.visibleObjectCount >= 2, 'Should detect window + desk silhouette from raw pixels');
  assert.equal(result.scene.inferredObjectCount, 0, 'Must not invent furniture that was not seen');
  assert.ok(result.scene.objects.some((o) => o.type === 'window' && !o.inferred), 'Should detect daylight window');
  assert.equal(result.scene.floorMaterial, 'wood-light');
});

test('reconstructRoomLocallyFromPixels maps COCO-SSD furniture detections into 3D Home Office with sampled colors', () => {
  const w = 160;
  const h = 120;
  const rgba = createSyntheticRoomRgba(w, h);
  const markers = { ...DEFAULT_AR_MARKERS, ceilingY: 0.2, floorY: 0.74 };

  const detections: RawObjectDetection[] = [
    { className: 'dining table', score: 0.88, x: 0.6, y: 0.54, w: 0.28, h: 0.24 },
    { className: 'laptop', score: 0.91, x: 0.68, y: 0.48, w: 0.1, h: 0.08 },
    { className: 'chair', score: 0.84, x: 0.65, y: 0.56, w: 0.14, h: 0.26 },
    { className: 'potted plant', score: 0.76, x: 0.12, y: 0.55, w: 0.1, h: 0.22 },
  ];

  const result = reconstructRoomLocallyFromPixels(rgba, w, h, {
    markers,
    roomWidthM: 4.2,
    roomDepthM: 3.8,
    ceilingHeightCm: 280,
    distanceM: 2.9,
    poleOffsetXM: 0,
    floorAccuracyPct: 95,
    ceilingAccuracyPct: 94,
    overallAccuracyPct: 95,
    externalDetections: detections,
  });

  assert.equal(result.detectorEngine, 'coco-ssd+cv');
  assert.equal(result.scene.roomType, 'Home Office');
  assert.ok(result.scene.objects.some((o) => o.type === 'desk' && !o.inferred), 'Table + laptop should upgrade to Work Desk');
  assert.ok(result.scene.objects.some((o) => o.type === 'office-chair' && !o.inferred), 'Chair near desk should upgrade to Office Chair');
  assert.ok(result.scene.objects.some((o) => o.type === 'plant' && !o.inferred), 'Potted plant should be placed');
  assert.equal(result.scene.inferredObjectCount, 0, 'Unseen zones are not filled unless opted in');

  // Verify every freestanding non-floor object respects room bounds & stays off pole axis
  for (const obj of result.scene.objects) {
    assert.ok(Math.abs(obj.x) <= result.scene.roomWidthM / 2);
    assert.ok(Math.abs(obj.z) <= result.scene.roomDepthM / 2);
  }
});

test('mergeTiledDetectionsWithNMS merges overlapping duplicate detections and boosts consensus score', () => {
  const merged = mergeTiledDetectionsWithNMS([
    { className: 'chair', score: 0.72, x: 0.2, y: 0.5, w: 0.14, h: 0.24 },
    { className: 'chair', score: 0.65, x: 0.21, y: 0.51, w: 0.13, h: 0.23 }, // duplicate from side tile
    { className: 'chair', score: 0.69, x: 0.66, y: 0.5, w: 0.14, h: 0.24 }, // distinct second chair
  ]);

  assert.equal(merged.length, 2, 'Duplicate overlapping box should merge while keeping distinct chair');
  assert.ok(merged[0].score > 0.72, 'Multi-tile consensus should boost confidence score');
});

test('replica stays faithful: detected sofa + 2 plants, no hallucinated doors/cupboards/mirrors', () => {
  const w = 160;
  const h = 120;
  const rgba = createSyntheticRoomRgba(w, h);
  const markers = { ...DEFAULT_AR_MARKERS, ceilingY: 0.2, floorY: 0.74 };
  const base = {
    markers,
    roomWidthM: 4.2,
    roomDepthM: 4.0,
    ceilingHeightCm: 285,
    distanceM: 3,
    poleOffsetXM: 0,
    floorAccuracyPct: 90,
    ceilingAccuracyPct: 90,
    overallAccuracyPct: 90,
    externalDetections: [
      { className: 'couch', score: 0.8, x: 0, y: 0.69, w: 0.32, h: 0.31 },
      { className: 'potted plant', score: 0.7, x: 0.22, y: 0.39, w: 0.19, h: 0.4 },
      { className: 'potted plant', score: 0.7, x: 0.59, y: 0.41, w: 0.18, h: 0.38 },
    ] as RawObjectDetection[],
  };

  const result = reconstructRoomLocallyFromPixels(rgba, w, h, base);
  const types = result.scene.objects.map((o) => o.type).sort();
  assert.deepEqual(
    types.filter((t) => ['sofa', 'plant'].includes(t)),
    ['plant', 'plant', 'sofa']
  );
  assert.equal(result.scene.inferredObjectCount, 0);
  for (const bad of ['door', 'mirror', 'cabinet', 'wardrobe', 'bookshelf']) {
    assert.ok(!types.includes(bad as never), `Must not invent ${bad}`);
  }

  const withCompletions = reconstructRoomLocallyFromPixels(rgba, w, h, {
    ...base,
    includeUnseenCompletions: true,
  });
  assert.ok(withCompletions.scene.inferredObjectCount >= 1, 'Opt-in completions still available');
});

test('open-vocabulary OWL-ViT normalization calibrates scores, filters background boxes, and accepts custom prompts', () => {
  const customPrompts = [
    ...OPEN_VOCAB_PROMPTS,
    { prompt: 'a custom reception counter', className: 'desk', minScore: 0.14 },
  ];
  const dets = normalizeOpenVocabResults(
    [
      { label: 'a wall cabinet or overhead cupboard', score: 0.24, box: { xmin: 0.02, ymin: 0.3, xmax: 0.44, ymax: 0.48 } },
      { label: 'a doorway or open door', score: 0.22, box: { xmin: 0.48, ymin: 0.31, xmax: 0.65, ymax: 0.82 } },
      { label: 'a closed door', score: 0.19, box: { xmin: 0.49, ymin: 0.32, xmax: 0.65, ymax: 0.81 } }, // cross-class duplicate on same doorway
      { label: 'a custom reception counter', score: 0.26, box: { xmin: 0.12, ymin: 0.62, xmax: 0.44, ymax: 0.78 } },
      { label: 'a window', score: 0.25, box: { xmin: 0.01, ymin: 0.02, xmax: 0.98, ymax: 0.95 } }, // giant whole-frame false positive -> rejected
      { label: 'a wall mirror', score: 0.09, box: { xmin: 0.72, ymin: 0.3, xmax: 0.88, ymax: 0.7 } }, // below minScore -> rejected
    ],
    640,
    480,
    customPrompts
  );

  assert.equal(dets.length, 3, 'Should keep cupboard, doorway (deduped), and custom counter while rejecting whole-frame and low-score boxes');
  assert.deepEqual(
    dets.map((d) => d.className).sort(),
    ['cabinet', 'desk', 'door']
  );

  const w = 160;
  const h = 120;
  const rgba = createSyntheticRoomRgba(w, h);
  const markers = { ...DEFAULT_AR_MARKERS, ceilingY: 0.28, floorY: 0.8 };
  const result = reconstructRoomLocallyFromPixels(rgba, w, h, {
    markers,
    roomWidthM: 4.4,
    roomDepthM: 4.0,
    ceilingHeightCm: 285,
    distanceM: 3.0,
    poleOffsetXM: 0,
    floorAccuracyPct: 93,
    ceilingAccuracyPct: 92,
    overallAccuracyPct: 93,
    externalDetections: [
      ...dets,
      { className: 'chair', score: 0.74, x: 0.02, y: 0.62, w: 0.14, h: 0.18 },
      { className: 'rug', score: 0.66, x: 0.36, y: 0.79, w: 0.38, h: 0.13 },
    ],
    openVocabUsed: true,
  });

  assert.equal(result.detectorEngine, 'owlvit+coco+cv');
  const placedTypes = new Set(result.scene.objects.map((o) => o.type));
  assert.ok(placedTypes.has('cabinet'), 'Overhead cupboard from OWL-ViT should be placed');
  assert.ok(placedTypes.has('door'), 'Doorway from OWL-ViT should be placed and snapped to wall');
  assert.ok(placedTypes.has('desk'), 'Custom prompt desk should be placed');
  assert.ok(placedTypes.has('office-chair'), 'Chair beside OWL-ViT desk should upgrade to office-chair');
  assert.equal(result.scene.inferredObjectCount, 0);
});
