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

