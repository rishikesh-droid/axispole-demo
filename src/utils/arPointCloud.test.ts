import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_AR_MARKERS } from './arMeasure.ts';
import {
  accumulateRoomScan,
  analyzeFrameForPointCloud,
  createRoomScanAccumulator,
  type FramePointCloudResult,
} from './arPointCloud.ts';

/**
 * Helper: renders a synthetic room RGBA buffer with:
 *  - Bright smooth ceiling above `ceilFrac`
 *  - Medium back wall between `leftCornerFrac` and `rightCornerFrac`
 *  - Slightly darker side walls outside left/right vertical corners (90-deg dihedral illumination step)
 *  - Dark hardwood floor below `floorFrac`
 *  - Optional high-contrast localized clutter object (e.g. hanging lamp / AC unit / framed art)
 */
function buildSyntheticRoomRGBA(opts: {
  width: number;
  height: number;
  ceilFrac: number;
  floorFrac: number;
  leftCornerFrac: number;
  rightCornerFrac: number;
  addHangingLampClutter?: boolean;
}): Uint8ClampedArray {
  const { width, height, ceilFrac, floorFrac, leftCornerFrac, rightCornerFrac } = opts;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const ceilY = Math.round(height * ceilFrac);
  const floorY = Math.round(height * floorFrac);
  const leftX = Math.round(width * leftCornerFrac);
  const rightX = Math.round(width * rightCornerFrac);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let lum = 155; // smooth back wall
      if (y < ceilY) {
        lum = 228; // clean bright ceiling plane
      } else if (y >= floorY) {
        lum = 72; // hardwood floor plane
      } else if (x < leftX) {
        lum = 112; // left side wall (dihedral shadow)
      } else if (x > rightX) {
        lum = 118; // right side wall (dihedral shadow)
      }

      // Add a strong localized hanging lamp / AC clutter box below the ceiling (center 18% width)
      if (opts.addHangingLampClutter) {
        const lampX0 = Math.round(width * 0.41);
        const lampX1 = Math.round(width * 0.59);
        const lampY0 = ceilY + Math.round(height * 0.08);
        const lampY1 = ceilY + Math.round(height * 0.16);
        if (x >= lampX0 && x <= lampX1 && y >= lampY0 && y <= lampY1) {
          lum = 22; // ultra-high contrast dark object
        }
      }

      const idx = (y * width + x) * 4;
      rgba[idx] = lum;
      rgba[idx + 1] = lum;
      rgba[idx + 2] = lum;
      rgba[idx + 3] = 255;
    }
  }
  return rgba;
}

test('analyzeFrameForPointCloud rejects hanging lamp clutter and locks onto true ceiling, floor, and wall corners', () => {
  const W = 120;
  const H = 160;
  const rgba = buildSyntheticRoomRGBA({
    width: W,
    height: H,
    ceilFrac: 0.18,
    floorFrac: 0.76,
    leftCornerFrac: 0.18,
    rightCornerFrac: 0.82,
    addHangingLampClutter: true,
  });

  const res = analyzeFrameForPointCloud(rgba, W, H, DEFAULT_AR_MARKERS);

  assert.equal(res.detected, true, 'Should detect continuous ceiling and floor planes');
  assert.ok(
    Math.abs(res.corners.ceilingY - 0.18) <= 0.025,
    `Expected ceilingY near 0.18 (not hanging lamp at 0.26+), got ${res.corners.ceilingY}`
  );
  assert.ok(
    Math.abs(res.corners.floorY - 0.76) <= 0.025,
    `Expected floorY near 0.76, got ${res.corners.floorY}`
  );
  assert.ok(
    Math.abs(res.corners.leftCornerX - 0.18) <= 0.03,
    `Expected leftCornerX near 0.18, got ${res.corners.leftCornerX}`
  );
  assert.ok(
    Math.abs(res.corners.rightCornerX - 0.82) <= 0.03,
    `Expected rightCornerX near 0.82, got ${res.corners.rightCornerX}`
  );
  assert.ok(
    res.clutterRejectedCount > 0,
    'Should detect and reject localized high-contrast lamp clutter points'
  );
  assert.ok(
    res.points.some((p) => p.category === 'ceiling') &&
      res.points.some((p) => p.category === 'floor') &&
      res.points.some((p) => p.category === 'wall-corner') &&
      res.points.some((p) => p.category === 'clutter'),
    'Should emit 3D point cloud points across ceiling, floor, wall-corner, and clutter categories'
  );
});

test('accumulateRoomScan rejects corrupted outlier frames via trimmed median and locks room planes', () => {
  let acc = createRoomScanAccumulator(DEFAULT_AR_MARKERS);

  const makeFrame = (
    ceilingY: number,
    floorY: number,
    leftCornerX: number,
    rightCornerX: number
  ): FramePointCloudResult => ({
    points: [
      { u: 0.5, v: ceilingY, x: 0, y: 2.8, z: 0, category: 'ceiling', weight: 0.9 },
      { u: 0.5, v: floorY, x: 0, y: 0.01, z: 0, category: 'floor', weight: 0.9 },
      { u: leftCornerX, v: 0.45, x: -1.6, y: 1.4, z: 0, category: 'wall-corner', weight: 0.9 },
    ],
    corners: {
      ceilingY,
      floorY,
      leftCornerX,
      rightCornerX,
      ceilingConfidence: 0.92,
      floorConfidence: 0.93,
      leftCornerConfidence: 0.88,
      rightCornerConfidence: 0.87,
    },
    clutterRejectedCount: 1,
    frameQuality: 0.9,
    hasClearPlanes: true,
    detected: true,
  });

  // 8 true frames + 2 wild outlier frames (e.g. someone walking past or random lamp flash)
  const sequence = [
    makeFrame(0.17, 0.75, 0.16, 0.84),
    makeFrame(0.36, 0.62, 0.35, 0.65), // wild outlier 1
    makeFrame(0.172, 0.748, 0.162, 0.838),
    makeFrame(0.168, 0.752, 0.158, 0.842),
    makeFrame(0.09, 0.85, 0.08, 0.92), // wild outlier 2
    makeFrame(0.171, 0.75, 0.161, 0.839),
    makeFrame(0.169, 0.749, 0.159, 0.841),
    makeFrame(0.17, 0.751, 0.16, 0.84),
    makeFrame(0.17, 0.75, 0.16, 0.84),
    makeFrame(0.171, 0.75, 0.16, 0.84),
  ];

  for (const f of sequence) {
    acc = accumulateRoomScan(acc, f);
  }

  assert.equal(acc.isLocked, true, 'Should lock once multi-frame consensus stabilizes');
  assert.ok(acc.scanProgress >= 92, `Expected scanProgress >= 92, got ${acc.scanProgress}`);
  assert.ok(
    Math.abs(acc.consensusCorners.ceilingY - 0.17) <= 0.005,
    `Outliers should not skew consensus ceilingY: got ${acc.consensusCorners.ceilingY}`
  );
  assert.ok(
    Math.abs(acc.consensusCorners.floorY - 0.75) <= 0.005,
    `Outliers should not skew consensus floorY: got ${acc.consensusCorners.floorY}`
  );
  assert.ok(
    Math.abs(acc.consensusCorners.leftCornerX - 0.16) <= 0.006,
    `Expected consensus leftCornerX ~0.16, got ${acc.consensusCorners.leftCornerX}`
  );
});
