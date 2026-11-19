import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_AR_MARKERS } from './arMeasure.ts';
import {
  buildMeasurementFromSurfaceCalibration,
  getDefaultFloorCalibrationTaps,
  predictFloorQuadFromMarkers,
  screenToFloorPoint3D,
  solveFloorSurfaceCalibration,
  worldToScreenPoint2D,
} from './arSurfaceCalibration.ts';

test('screenToFloorPoint3D rejects sky/above-horizon taps and intersects ground plane accurately below horizon', () => {
  const markers = {
    ...DEFAULT_AR_MARKERS,
    cameraHeightM: 1.45,
    cameraPitchDeg: 0,
    vfovDeg: 60,
    aspect: 1.5,
  };

  // Above horizon (v = 0.25) -> must reject
  assert.equal(screenToFloorPoint3D(0.5, 0.25, markers), null);

  // Center point below horizon (v = 0.75): tan(alpha) = 0.5 * tan(30deg) = 0.288675
  // Expected Z distance = -1.45 / 0.288675 = -5.023m
  const hit = screenToFloorPoint3D(0.5, 0.75, markers);
  assert.ok(hit, 'Expected valid floor intersection');
  assert.ok(Math.abs(hit.x) < 0.01, `Expected x ~ 0, got ${hit.x}`);
  assert.ok(Math.abs(hit.z - -5.023) < 0.06, `Expected z ~ -5.023m, got ${hit.z}`);

  // Round-trip projection back to screen coordinates must match original tap
  const back = worldToScreenPoint2D(hit.x, 0, hit.z, markers);
  assert.ok(back);
  assert.ok(Math.abs(back.u - 0.5) < 0.005);
  assert.ok(Math.abs(back.v - 0.75) < 0.005);
});

test('solveFloorSurfaceCalibration sorts unsorted taps and measures accurate width, depth, area, and ceiling height', () => {
  const markers = {
    ...DEFAULT_AR_MARKERS,
    cameraHeightM: 1.42,
    cameraPitchDeg: -5,
    vfovDeg: 62,
    aspect: 1.4,
    ceilingY: 0.20,
  };

  // Intentionally scrambled tap order (Front-Left, Back-Right, Front-Right, Back-Left)
  const taps = [
    { id: 1, u: 0.14, v: 0.84 },
    { id: 2, u: 0.78, v: 0.69 },
    { id: 3, u: 0.86, v: 0.84 },
    { id: 4, u: 0.22, v: 0.69 },
  ];

  const cal = solveFloorSurfaceCalibration(taps, markers);
  assert.ok(cal && cal.valid, 'Expected valid surface calibration');
  assert.ok(cal.rawWidthM >= 2.2 && cal.rawWidthM <= 7.0, `Unexpected width ${cal.rawWidthM}m`);
  assert.ok(cal.rawDepthM >= 1.4 && cal.rawDepthM <= 6.5, `Unexpected depth ${cal.rawDepthM}m`);
  assert.ok(cal.floorAreaSqM > 4.0, `Expected realistic floor area > 4m^2, got ${cal.floorAreaSqM}`);
  assert.ok(
    cal.ceilingHeightCm >= 230 && cal.ceilingHeightCm <= 345,
    `Expected realistic ceiling height, got ${cal.ceilingHeightCm}cm`
  );
  assert.ok(cal.minEdgeClearanceM > 0.6, `Expected positive clearance, got ${cal.minEdgeClearanceM}`);

  // Building full ARMeasurementResult preserves exact calibrated height & room footprint
  const merged = buildMeasurementFromSurfaceCalibration(cal, markers, 'brass');
  assert.equal(merged.ceilingHeightCm, cal.ceilingHeightCm);
  assert.equal(merged.roomWidthM, cal.roomWidthM);
  assert.equal(merged.roomDepthM, cal.roomDepthM);
  assert.equal(merged.confidenceLabel, 'Calibrated');
});

test('solveFloorSurfaceCalibration responds monotonically to wider and deeper floor quads', () => {
  const markers = {
    ...DEFAULT_AR_MARKERS,
    cameraHeightM: 1.45,
    cameraPitchDeg: -5,
    vfovDeg: 62,
    aspect: 1.4,
  };

  const compact = solveFloorSurfaceCalibration(
    [
      { id: 1, u: 0.34, v: 0.73 },
      { id: 2, u: 0.66, v: 0.73 },
      { id: 3, u: 0.72, v: 0.80 },
      { id: 4, u: 0.28, v: 0.80 },
    ],
    markers
  );
  const spacious = solveFloorSurfaceCalibration(getDefaultFloorCalibrationTaps(1.4), markers);

  assert.ok(compact && spacious);
  assert.ok(spacious.rawWidthM > compact.rawWidthM + 0.5);
  assert.ok(spacious.rawDepthM > compact.rawDepthM + 0.4);
  assert.ok(spacious.floorAreaSqM > compact.floorAreaSqM * 1.8);
});

test('predictFloorQuadFromMarkers auto-generates a valid 4-corner calibrated floor polygon from detected markers', () => {
  const markers = {
    ...DEFAULT_AR_MARKERS,
    floorY: 0.72,
    ceilingY: 0.18,
    leftCornerX: 0.18,
    rightCornerX: 0.82,
    cameraHeightM: 1.42,
    cameraPitchDeg: -4,
    vfovDeg: 64,
    aspect: 0.52,
  };

  const predictedTaps = predictFloorQuadFromMarkers(markers);
  assert.equal(predictedTaps.length, 4);
  const cal = solveFloorSurfaceCalibration(predictedTaps, markers);
  assert.ok(cal && cal.valid, 'Predicted 4-corner floor taps must solve to a valid floor surface calibration');
  assert.ok(cal.accuracyScore >= 88, `Expected high accuracyScore >= 88%, got ${cal.accuracyScore}%`);
});

