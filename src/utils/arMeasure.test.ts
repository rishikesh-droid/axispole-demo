import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateARMeasurement,
  clampARMarkers,
  DEFAULT_AR_MARKERS,
} from './arMeasure.ts';

test('calculateARMeasurement predicts realistic residential ceiling height and tension mount', () => {
  const res = calculateARMeasurement(
    {
      ...DEFAULT_AR_MARKERS,
      floorY: 0.83,
      ceilingY: 0.19,
      cameraHeightM: 1.42,
      cameraPitchDeg: 0,
      vfovDeg: 62,
      aspect: 0.52,
    },
    'brass'
  );

  assert.ok(res.distanceM >= 2.2 && res.distanceM <= 4.5, `Unexpected distance ${res.distanceM}m`);
  assert.ok(
    res.ceilingHeightCm >= 250 && res.ceilingHeightCm <= 305,
    `Unexpected ceiling height ${res.ceilingHeightCm}cm`
  );
  assert.equal(res.recommendedMount, 'tension');
  assert.equal(res.isWithinTensionRange, true);
  assert.ok(res.roomWidthM >= 3.0 && res.roomWidthM <= 7.0);
  assert.ok(res.roomDepthM >= 3.0 && res.roomDepthM <= 7.0);
});

test('calculateARMeasurement recommends permanent-ceiling mount for tall studio ceilings (>3.35m)', () => {
  const res = calculateARMeasurement(
    {
      ...DEFAULT_AR_MARKERS,
      floorY: 0.78,
      ceilingY: 0.08,
      cameraHeightM: 1.5,
      cameraPitchDeg: 4,
      vfovDeg: 64,
      aspect: 0.56,
    },
    'stainless'
  );

  assert.ok(res.ceilingHeightCm > 335, `Expected tall ceiling >335cm, got ${res.ceilingHeightCm}cm`);
  assert.equal(res.recommendedMount, 'permanent-ceiling');
  assert.equal(res.isWithinTensionRange, false);
});

test('calculateARMeasurement responds monotonically when ceiling marker moves higher', () => {
  const lower = calculateARMeasurement({ ...DEFAULT_AR_MARKERS, ceilingY: 0.28 }, 'brass');
  const higher = calculateARMeasurement({ ...DEFAULT_AR_MARKERS, ceilingY: 0.12 }, 'brass');
  assert.ok(higher.ceilingHeightCm > lower.ceilingHeightCm + 25);
});

test('clampARMarkers prevents inverted floor/ceiling markers and out-of-range angles', () => {
  const clamped = clampARMarkers({
    floorY: 0.2,
    ceilingY: 0.9,
    poleX: -0.5,
    wallSpanNorm: 2.0,
    cameraHeightM: 0.2,
    cameraPitchDeg: 90,
    vfovDeg: 140,
    aspect: 0.1,
  });

  assert.ok(clamped.floorY > clamped.ceilingY);
  assert.ok(clamped.poleX >= 0.18 && clamped.poleX <= 0.82);
  assert.ok(clamped.cameraHeightM >= 0.85);
  assert.ok(clamped.cameraPitchDeg <= 25);
});

test('calculateARMeasurement scales roomWidthM monotonically from detected left/right wall corners', () => {
  const narrow = calculateARMeasurement(
    {
      ...DEFAULT_AR_MARKERS,
      aspect: 1.5,
      vfovDeg: 48,
      leftCornerX: 0.28,
      rightCornerX: 0.72,
    },
    'brass'
  );
  const wide = calculateARMeasurement(
    {
      ...DEFAULT_AR_MARKERS,
      aspect: 1.5,
      vfovDeg: 48,
      leftCornerX: 0.1,
      rightCornerX: 0.9,
    },
    'brass'
  );
  assert.ok(
    wide.roomWidthM > narrow.roomWidthM + 0.5,
    `Expected wider wall corners (${wide.roomWidthM}m) > narrow (${narrow.roomWidthM}m)`
  );
});

test('calculateARMeasurement projects 3D pole top & base back to screen sightlines and evaluates lateral spin clearance', () => {
  const centered = calculateARMeasurement(
    {
      ...DEFAULT_AR_MARKERS,
      floorY: 0.76,
      ceilingY: 0.17,
      poleX: 0.5,
      leftCornerX: 0.14,
      rightCornerX: 0.86,
      cameraHeightM: 1.42,
      cameraPitchDeg: -2,
    },
    'brass'
  );

  assert.ok(Math.abs(centered.ceilingScreenV - 0.17) <= 0.015, `Expected top dome screen V near 0.17, got ${centered.ceilingScreenV}`);
  assert.ok(Math.abs(centered.floorScreenV - 0.76) <= 0.015, `Expected base hub screen V near 0.76, got ${centered.floorScreenV}`);
  assert.ok(centered.accuracyPct >= 85, `Expected high optical accuracy >= 85%, got ${centered.accuracyPct}%`);

  const shiftedNearLeftWall = calculateARMeasurement(
    {
      ...DEFAULT_AR_MARKERS,
      floorY: 0.76,
      ceilingY: 0.17,
      poleX: 0.22,
      leftCornerX: 0.14,
      rightCornerX: 0.86,
    },
    'brass'
  );

  assert.ok(
    shiftedNearLeftWall.spinRadiusClearanceM < centered.spinRadiusClearanceM,
    `Shifting pole near left wall should reduce spinRadiusClearanceM (${shiftedNearLeftWall.spinRadiusClearanceM}m vs ${centered.spinRadiusClearanceM}m)`
  );
});

test('calculateARMeasurement enforces 1.25m depth and lateral wall free-space gate (canPlacePole)', () => {
  const safe = calculateARMeasurement(DEFAULT_AR_MARKERS, 'brass');
  assert.equal(safe.canPlacePole, true, `Expected default markers to allow placement, got blocked: ${safe.placementBlockReason}`);
  assert.ok(safe.depthClearanceM >= 1.25);
  assert.ok(safe.leftClearanceM >= 1.25);
  assert.ok(safe.rightClearanceM >= 1.25);
  assert.equal(safe.placementBlockReason, null);

  // Camera too close to wall in depth (steep downward pitch + bottom floor anchor)
  const tooCloseDepth = calculateARMeasurement(
    {
      ...DEFAULT_AR_MARKERS,
      cameraPitchDeg: -22,
      floorY: 0.85,
      cameraHeightM: 1.35,
    },
    'brass'
  );
  assert.ok(tooCloseDepth.depthClearanceM < 1.25, `Expected depth < 1.25m, got ${tooCloseDepth.depthClearanceM}m`);
  assert.equal(tooCloseDepth.canPlacePole, false);
  assert.ok(
    tooCloseDepth.placementBlockReason && /wall|depth/i.test(tooCloseDepth.placementBlockReason),
    `Expected wall/depth block reason, got: ${tooCloseDepth.placementBlockReason}`
  );

  // Pole slid close to left wall
  const tooCloseLeft = calculateARMeasurement(
    {
      ...DEFAULT_AR_MARKERS,
      poleX: 0.22,
    },
    'brass'
  );
  assert.ok(tooCloseLeft.leftClearanceM < 1.25, `Expected leftClearanceM < 1.25m, got ${tooCloseLeft.leftClearanceM}m`);
  assert.equal(tooCloseLeft.canPlacePole, false);
});

test('calculateARMeasurement flags ceilings over 2.50m max pole length with exact overHeightGapCm', () => {
  const tall = calculateARMeasurement(
    {
      ...DEFAULT_AR_MARKERS,
      ceilingY: 0.14,
      floorY: 0.74,
      cameraPitchDeg: -2,
    },
    'brass'
  );
  assert.ok(tall.ceilingHeightCm > 250, `Expected ceiling > 250cm, got ${tall.ceilingHeightCm}`);
  assert.equal(tall.exceedsMaxPoleLength, true);
  assert.equal(tall.overHeightGapCm, tall.ceilingHeightCm - 250);

  const compact = calculateARMeasurement(
    {
      ...DEFAULT_AR_MARKERS,
      ceilingY: 0.31,
      floorY: 0.76,
      cameraPitchDeg: -4,
      cameraHeightM: 1.35,
    },
    'brass'
  );
  assert.ok(compact.ceilingHeightCm <= 250, `Expected ceiling <= 250cm, got ${compact.ceilingHeightCm}`);
  assert.equal(compact.exceedsMaxPoleLength, false);
  assert.equal(compact.overHeightGapCm, 0);
});



