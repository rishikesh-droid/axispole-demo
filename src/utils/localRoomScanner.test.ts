import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeTiledDetectionsWithNMS,
  reconstructRoomLocallyFromPixels,
  sampleRoomPaletteAndMaterials,
  type RawObjectDetection,
} from './localRoomScanner';
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
  assert.ok(result.scene.inferredObjectCount >= 2, 'Should extrapolate unseen room elements');
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
  assert.ok(result.scene.inferredObjectCount >= 3, 'Unseen zones should be completed');

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

test('hybrid detector recovers uncovered furniture, multiple desk clusters, and doors/mirrors even when COCO finds >=2 objects', () => {
  const w = 160;
  const h = 120;
  const rgba = createSyntheticRoomRgba(w, h);
  const ceilPx = Math.floor(h * 0.2);
  const floorPx = Math.floor(h * 0.74);

  // Paint a vertical dark-wood door on the left wall (x: 8%..20%, y: 24%..74%)
  for (let y = ceilPx + 5; y < floorPx; y++) {
    for (let x = Math.floor(w * 0.08); x <= Math.floor(w * 0.2); x++) {
      const idx = (y * w + x) * 4;
      rgba[idx] = 64;
      rgba[idx + 1] = 48;
      rgba[idx + 2] = 36;
    }
  }

  // Paint a tall uncovered wardrobe silhouette on far right (x: 78%..93%, y: 25%..76%)
  for (let y = ceilPx + 6; y <= floorPx + 2; y++) {
    for (let x = Math.floor(w * 0.78); x <= Math.floor(w * 0.93); x++) {
      const idx = (y * w + x) * 4;
      rgba[idx] = 52;
      rgba[idx + 1] = 56;
      rgba[idx + 2] = 66;
    }
  }

  const markers = { ...DEFAULT_AR_MARKERS, ceilingY: 0.2, floorY: 0.74 };
  const detections: RawObjectDetection[] = [
    // Two separate laptop clusters + 2 chairs -> COCO already has >= 2 objects
    { className: 'laptop', score: 0.85, x: 0.24, y: 0.48, w: 0.09, h: 0.07 },
    { className: 'laptop', score: 0.82, x: 0.56, y: 0.48, w: 0.09, h: 0.07 },
    { className: 'chair', score: 0.76, x: 0.25, y: 0.56, w: 0.1, h: 0.22 },
    { className: 'chair', score: 0.74, x: 0.57, y: 0.56, w: 0.1, h: 0.22 },
  ];

  const result = reconstructRoomLocallyFromPixels(rgba, w, h, {
    markers,
    roomWidthM: 4.6,
    roomDepthM: 4.0,
    ceilingHeightCm: 280,
    distanceM: 3.0,
    poleOffsetXM: 0,
    floorAccuracyPct: 95,
    ceilingAccuracyPct: 94,
    overallAccuracyPct: 95,
    externalDetections: detections,
  });

  const visibleDesks = result.scene.objects.filter((o) => !o.inferred && o.type === 'desk');
  assert.ok(visibleDesks.length >= 2, `Expected >=2 synthesized desks from distinct laptop clusters, got ${visibleDesks.length}`);
  assert.ok(
    result.scene.objects.some((o) => !o.inferred && o.type === 'door'),
    'Should detect left-wall door from raw pixels even when COCO-SSD has >=2 objects'
  );
  assert.ok(
    result.scene.visibleObjectCount >= 6,
    `Expected hybrid detector to find >=6 visible objects, got ${result.scene.visibleObjectCount}`
  );
});

