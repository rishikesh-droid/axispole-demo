import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_AR_MARKERS } from './arMeasure.ts';
import {
  accumulateRoomScan,
  analyzeFrameForPointCloud,
  computeLiveARAccuracy,
  createRoomScanAccumulator,
  type FramePointCloudResult,
} from './arPointCloud.ts';

function buildSyntheticRoomRGBA(opts: {
  width: number;
  height: number;
  ceilFrac: number;
  floorFrac: number;
  leftCornerFrac: number;
  rightCornerFrac: number;
  addHangingLampClutter?: boolean;
  tiltSlope?: number;
}): Uint8ClampedArray {
  const { width, height, ceilFrac, floorFrac, leftCornerFrac, rightCornerFrac } = opts;
  const slope = opts.tiltSlope ?? 0;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const leftX = Math.round(width * leftCornerFrac);
  const rightX = Math.round(width * rightCornerFrac);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const ceilY = Math.round(height * (ceilFrac + slope * (u - 0.5)));
      const floorY = Math.round(height * (floorFrac + slope * (u - 0.5)));

      let r = 158;
      let g = 154;
      let b = 148;
      if (y < ceilY) {
        r = 236;
        g = 235;
        b = 230;
      } else if (y >= floorY) {
        r = 112;
        g = 82;
        b = 54;
      } else if (x < leftX) {
        r = 116;
        g = 114;
        b = 112;
      } else if (x > rightX) {
        r = 122;
        g = 120;
        b = 116;
      }

      if (opts.addHangingLampClutter) {
        const lampX0 = Math.round(width * 0.41);
        const lampX1 = Math.round(width * 0.59);
        const lampY0 = Math.round(height * ceilFrac) + Math.round(height * 0.08);
        const lampY1 = Math.round(height * ceilFrac) + Math.round(height * 0.16);
        if (x >= lampX0 && x <= lampX1 && y >= lampY0 && y <= lampY1) {
          r = 22;
          g = 22;
          b = 24;
        }
      }

      const idx = (y * width + x) * 4;
      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = 255;
    }
  }
  return rgba;
}

test('analyzeFrameForPointCloud rejects hanging lamp clutter and locks onto ceiling/floor/corners at 91%+ accuracy', () => {
  const W = 160;
  const H = 200;
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
    Math.abs(res.corners.ceilingY - 0.18) <= 0.015,
    `Expected ceilingY near 0.18 (not hanging lamp), got ${res.corners.ceilingY}`
  );
  assert.ok(
    Math.abs(res.corners.floorY - 0.76) <= 0.015,
    `Expected floorY near 0.76, got ${res.corners.floorY}`
  );
  assert.ok(
    Math.abs(res.corners.leftCornerX - 0.18) <= 0.025,
    `Expected leftCornerX near 0.18, got ${res.corners.leftCornerX}`
  );
  assert.ok(
    Math.abs(res.corners.rightCornerX - 0.82) <= 0.025,
    `Expected rightCornerX near 0.82, got ${res.corners.rightCornerX}`
  );
  assert.ok(
    res.accuracy.overallAccuracyPct >= 91,
    `Expected overallAccuracyPct >= 91%, got ${res.accuracy.overallAccuracyPct}%`
  );
  assert.ok(
    res.accuracy.floorAccuracyPct >= 91 && res.accuracy.ceilingAccuracyPct >= 91,
    `Expected both floor (${res.accuracy.floorAccuracyPct}%) and ceiling (${res.accuracy.ceilingAccuracyPct}%) >= 91%`
  );
  assert.equal(res.accuracy.tier, 'precision');
  assert.ok(res.clutterRejectedCount > 0, 'Should detect and reject localized lamp clutter');
});

test('analyzeFrameForPointCloud handles slightly tilted handheld camera frames via RANSAC slope fitting', () => {
  const W = 160;
  const H = 200;
  const rgba = buildSyntheticRoomRGBA({
    width: W,
    height: H,
    ceilFrac: 0.2,
    floorFrac: 0.74,
    leftCornerFrac: 0.16,
    rightCornerFrac: 0.84,
    tiltSlope: 0.03,
  });

  const res = analyzeFrameForPointCloud(rgba, W, H, DEFAULT_AR_MARKERS);
  assert.equal(res.detected, true);
  assert.ok(
    Math.abs(res.corners.ceilingY - 0.2) <= 0.02,
    `Expected tilted ceiling center near 0.20, got ${res.corners.ceilingY}`
  );
  assert.ok(
    Math.abs(res.corners.floorY - 0.74) <= 0.02,
    `Expected tilted floor center near 0.74, got ${res.corners.floorY}`
  );
  assert.ok(res.accuracy.overallAccuracyPct >= 91, `Expected >= 91% accuracy on tilted frame, got ${res.accuracy.overallAccuracyPct}%`);
});

test('accumulateRoomScan rejects corrupted outlier frames via trimmed median and locks at 91%+ accuracy', () => {
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
      ceilingConfidence: 0.93,
      floorConfidence: 0.94,
      leftCornerConfidence: 0.89,
      rightCornerConfidence: 0.88,
    },
    clutterRejectedCount: 1,
    frameQuality: 0.92,
    hasClearPlanes: true,
    detected: true,
    accuracy: {
      floorAccuracyPct: 92,
      ceilingAccuracyPct: 91,
      overallAccuracyPct: 92,
      errorMarginCm: 2.2,
      tier: 'precision',
    },
  });

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
    acc.accuracy.overallAccuracyPct >= 94,
    `Temporal convergence should lift accuracy >= 94%, got ${acc.accuracy.overallAccuracyPct}%`
  );
  assert.ok(Math.abs(acc.consensusCorners.ceilingY - 0.17) <= 0.005);
  assert.ok(Math.abs(acc.consensusCorners.floorY - 0.75) <= 0.005);

  const live = computeLiveARAccuracy({
    scanAcc: acc,
    markers: DEFAULT_AR_MARKERS,
    surfaceCalibrated: true,
    gyroActive: true,
    userAdjustedCeiling: false,
    userAdjustedFloor: false,
  });
  assert.ok(live.overallAccuracyPct >= 95, `Expected calibrated live accuracy >= 95%, got ${live.overallAccuracyPct}%`);
});
