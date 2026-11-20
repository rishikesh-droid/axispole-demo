import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeFloorClearance,
  calculateHeightSolution,
  clampPolePosition,
  computeAssemblyOffsets,
  createInitialPoles,
  createNextPoleInstance,
  DEFAULT_CONFIG,
  ENVIRONMENT_PRESETS,
  exportBOMToCSV,
  formatHeightMetricAndImperial,
  generateBOM,
  generateMultiPoleBOM,
  getEffectiveVaultAngleRad,
  getMinPoleSeparationM,
  getWallClearanceMarginM,
  isDarkLighting,
  LIGHTING_PRESETS,
  MAX_POLE_LENGTH_CM,
  MIN_POLE_FREE_RADIUS_M,
} from './poleConfig.ts';
import type { BaseMountId, PoleFinishId } from '../types/pole.ts';

test('calculateHeightSolution solves valid extensions across 2.30m to 3.35m for tension mount', () => {
  for (let cm = 230; cm <= 335; cm += 15) {
    const sol = calculateHeightSolution(cm, 'tension', 'brass');
    assert.equal(sol.isValid, true, `Expected valid solution at ${cm}cm, got warning: ${sol.warning}`);
    assert.ok(sol.adjusterTravelMm <= 125, `Adjuster travel ${sol.adjusterTravelMm}mm exceeded 125mm at ${cm}cm`);
    assert.equal(sol.totalRigHeightMm, cm * 10);
  }
});

test('calculateHeightSolution flags out-of-range ceiling heights with warning', () => {
  const tooLow = calculateHeightSolution(205, 'tension', 'stainless');
  assert.equal(tooLow.isValid, false);
  assert.ok(tooLow.warning && tooLow.warning.length > 0);

  const tooHigh = calculateHeightSolution(355, 'tension', 'powder-black');
  assert.equal(tooHigh.isValid, false);
  assert.ok(tooHigh.warning && tooHigh.warning.length > 0);
});

test('generateBOM prices all 4 finishes and 4 mounts deterministically', () => {
  const finishes: PoleFinishId[] = ['brass', 'stainless', 'powder-black', 'silicone'];
  const mounts: BaseMountId[] = ['tension', 'permanent-ceiling', 'vaulted-beam', 'stage-podium'];

  for (const finish of finishes) {
    for (const mount of mounts) {
      const bom = generateBOM({
        ...DEFAULT_CONFIG,
        finish,
        mount,
        ceilingHeightCm: 280,
      });
      assert.ok(bom.totalPriceUsd >= 469, `Unexpected low BOM price for ${finish}/${mount}`);
      assert.ok(bom.totalWeightKg > 8, `Unexpected low BOM weight for ${finish}/${mount}`);
      assert.ok(bom.items.length >= 3);
    }
  }
});

test('analyzeFloorClearance detects optimal, tight, and restricted spaces', () => {
  const opt = analyzeFloorClearance(5.0, 5.0, 'tension');
  assert.equal(opt.status, 'optimal');

  const tight = analyzeFloorClearance(3.0, 3.0, 'tension');
  assert.equal(tight.status, 'caution');

  const restricted = analyzeFloorClearance(2.4, 2.4, 'stage-podium');
  assert.equal(restricted.status, 'restricted');
});

test('lighting presets expose Studio Daylight, Mood/Night Neon, and Professional Spotlight', () => {
  const labels = LIGHTING_PRESETS.map((p) => p.label);
  assert.deepEqual(labels, ['Studio Daylight', 'Mood/Night Neon', 'Professional Spotlight']);
  assert.equal(isDarkLighting('studio-daylight'), false);
  assert.equal(isDarkLighting('mood-neon'), true);
  assert.equal(isDarkLighting('pro-spotlight'), true);
});

test('clampPolePosition strictly enforces minimum wall clearance and inter-pole spacing', () => {
  const margin = getWallClearanceMarginM('tension');
  const clamped = clampPolePosition(4.0, -4.0, 5.0, 5.0, 'tension', []);
  assert.equal(clamped.hitWallBoundary, true);
  assert.ok(Math.abs(clamped.x) <= 5.0 / 2 - margin + 1e-3);
  assert.ok(Math.abs(clamped.z) <= 5.0 / 2 - margin + 1e-3);

  // Inter-pole separation test
  const sibling = [{ x: 0, z: 0, mount: 'tension' as BaseMountId }];
  const tooClose = clampPolePosition(0.3, 0, 5.4, 5.2, 'tension', sibling);
  assert.equal(tooClose.hitPoleBoundary, true);
  assert.ok(Math.hypot(tooClose.x, tooClose.z) >= getMinPoleSeparationM('tension', 'tension') - 0.01);
});

test('multi-pole creation and BOM aggregation sum multiple different poles cleanly', () => {
  const p1 = createInitialPoles();
  const p2 = createNextPoleInstance(p1, 5.4, 5.2);
  assert.notEqual(p2.finish, p1[0].finish);
  assert.ok(Math.hypot(p2.x - p1[0].x, p2.z - p1[0].z) >= 1.5);

  const singleBom = generateMultiPoleBOM(p1, DEFAULT_CONFIG);
  const dualBom = generateMultiPoleBOM([...p1, p2], DEFAULT_CONFIG);
  assert.ok(dualBom.totalPriceUsd > singleBom.totalPriceUsd + 400);
  assert.ok(dualBom.totalWeightKg > singleBom.totalWeightKg + 6);
});

test('computeAssemblyOffsets seats all parts to zero when assembled and expands when exploded', () => {
  const assembled = computeAssemblyOffsets(1.0, 0.0, 0);
  assert.equal(assembled.basePlateY, 0);
  assert.equal(assembled.lowerTubeY, 0);
  assert.equal(assembled.xJointY, 0);
  assert.equal(assembled.topMountY, 0);

  const exploded = computeAssemblyOffsets(1.0, 0.8, 1.5);
  assert.ok(exploded.xJointY > 0.25);
  assert.ok(exploded.topMountY > 0.65);
  assert.ok(exploded.lockPinOffset > 0.03);
});

test('formatHeightMetricAndImperial and exportBOMToCSV output expected structure', () => {
  const formatted = formatHeightMetricAndImperial(274);
  assert.ok(formatted.includes('2.74m'));
  assert.ok(formatted.includes('9′'));

  const bom = generateBOM(DEFAULT_CONFIG);
  const csv = exportBOMToCSV(bom, DEFAULT_CONFIG);
  assert.ok(csv.includes('SKU,Component,Material,Qty'));
  assert.ok(csv.includes('AXP-BRA-45'));
});

test('ENVIRONMENT_PRESETS exposes all 5 room styles and vault/max-length helpers return valid bounds', () => {
  const ids = ENVIRONMENT_PRESETS.map((p) => p.id);
  assert.deepEqual(ids, ['studio', 'home', 'penthouse', 'industrial', 'velvet-club']);
  assert.equal(MAX_POLE_LENGTH_CM, 250);
  assert.equal(MIN_POLE_FREE_RADIUS_M, 1.25);

  assert.equal(getEffectiveVaultAngleRad(274, 5.4, 'tension', 22), 0);
  assert.equal(getEffectiveVaultAngleRad(274, 5.4, 'stage-podium', 22), 0);
  assert.equal(getEffectiveVaultAngleRad(274, 5.4, 'permanent-ceiling', 22), 0);
  const vaultRad = getEffectiveVaultAngleRad(274, 5.4, 'vaulted-beam', 22);
  assert.ok(vaultRad > 0.15 && vaultRad <= (22 * Math.PI) / 180 + 1e-6);
});
