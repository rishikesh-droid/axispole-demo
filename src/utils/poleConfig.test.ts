import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeFloorClearance,
  BASE_MOUNTS,
  calculateHeightSolution,
  canFitAdditionalPole,
  clampPoleHeightCm,
  clampPolePosition,
  computeAssemblyOffsets,
  computeEffectiveVaultRad,
  computeFullRoomCamera,
  computeInRoomOrbitPosition,
  computeLocalCeilingHeightCm,
  createInitialPoles,
  createNextPoleInstance,
  DEFAULT_CONFIG,
  DEV_MIN_ROOM_SIZE_M,
  DEV_MIN_WALL_CLEARANCE_M,
  exportBOMToCSV,
  findAvailablePoleSlot,
  formatHeightMetricAndImperial,
  generateBOM,
  generateMultiPoleBOM,
  getCushionHeightCm,
  getMinPoleSeparationM,
  getMinRoomSizeM,
  getWallClearanceMarginM,
  isDarkLighting,
  isPositionValidForNewPole,
  LIGHTING_PRESETS,
  MAX_CEILING_HEIGHT_CM,
  MAX_POLE_HEIGHT_CM,
  MIN_POLE_HEIGHT_CM,
  MIN_ROOM_SIZE_M,
  MIN_WALL_CLEARANCE_M,
  reconcilePolesForCeilingHeight,
  tryCreateNextPoleInstance,
} from './poleConfig.ts';
import type { BaseMountId, CeilingType, PoleFinishId } from '../types/pole.ts';

test('calculateHeightSolution solves valid extensions across 2.30m to 3.00m for tension mount', () => {
  for (let cm = 230; cm <= 300; cm += 10) {
    const sol = calculateHeightSolution(cm, 'tension', 'brass');
    assert.equal(
      sol.isValid,
      true,
      `Expected valid solution at ${cm}cm, got warning: ${sol.warning}`
    );
    assert.ok(
      sol.adjusterTravelMm <= 125,
      `Adjuster travel ${sol.adjusterTravelMm}mm exceeded 125mm at ${cm}cm`
    );
    assert.equal(sol.totalRigHeightMm, cm * 10);
  }
});

test('calculateHeightSolution enforces 3.00m max pole height and 5.00m max ceiling with automatic cushion', () => {
  assert.equal(MAX_POLE_HEIGHT_CM, 300);
  assert.equal(MAX_CEILING_HEIGHT_CM, 500);

  const tooLow = calculateHeightSolution(120, 'tension', 'stainless');
  assert.equal(tooLow.isValid, false);
  assert.ok(tooLow.warning && tooLow.warning.length > 0);

  // Explicit pole height above 3.00m flags warning
  const poleTooHigh = calculateHeightSolution(500, 'tension', 'powder-black', 340);
  assert.equal(poleTooHigh.isValid, false);
  assert.ok(poleTooHigh.warning && poleTooHigh.warning.includes('3.00m'));

  // Room ceiling at 5.00m automatically caps pole at 3.00m and adds 2.00m cushion
  const tallRoom = calculateHeightSolution(500, 'tension', 'brass', undefined, 'top');
  assert.equal(tallRoom.isValid, true);
  assert.equal(tallRoom.poleHeightCm, MAX_POLE_HEIGHT_CM);
  assert.equal(tallRoom.cushionHeightCm, 200);
  assert.equal(tallRoom.cappedAtMaxPoleHeight, true);
  assert.equal(tallRoom.cushionPlacement, 'top');
  assert.equal(tallRoom.totalRigHeightMm, 5000);
});

test('vaulted-beam is removed from mounts and global ceilingType (flat/vaulted) prices all 4 finishes cleanly', () => {
  assert.equal('stage-podium' in BASE_MOUNTS, false);
  assert.equal('vaulted-beam' in BASE_MOUNTS, false);
  assert.deepEqual(Object.keys(BASE_MOUNTS).sort(), [
    'permanent-ceiling',
    'tension',
  ]);

  const finishes: PoleFinishId[] = ['brass', 'stainless', 'powder-black', 'silicone'];
  const mounts: BaseMountId[] = ['tension', 'permanent-ceiling'];
  const ceilings: CeilingType[] = ['flat', 'vaulted'];

  for (const finish of finishes) {
    for (const mount of mounts) {
      for (const ceilingType of ceilings) {
        const bom = generateBOM({
          ...DEFAULT_CONFIG,
          finish,
          mount,
          ceilingType,
          ceilingHeightCm: 280,
        });
        assert.ok(bom.totalPriceUsd >= 469, `Unexpected low BOM price for ${finish}/${mount}/${ceilingType}`);
        assert.ok(bom.totalWeightKg > 8, `Unexpected low BOM weight for ${finish}/${mount}/${ceilingType}`);
        assert.ok(bom.items.length >= 3);
        const hasVaultClevis = bom.items.some((i) => i.sku === 'MNT-VAULT-CLV');
        assert.equal(hasVaultClevis, ceilingType === 'vaulted');
      }
    }
  }
});

test('computeLocalCeilingHeightCm tracks sloped vaulted ceiling across multi-pole x offsets', () => {
  assert.equal(computeLocalCeilingHeightCm(300, 5.4, 'flat', 22, -1.5), 300);
  assert.equal(computeLocalCeilingHeightCm(300, 5.4, 'flat', 22, 1.5), 300);

  const center = computeLocalCeilingHeightCm(320, 5.4, 'vaulted', 20, 0);
  const left = computeLocalCeilingHeightCm(320, 5.4, 'vaulted', 20, -1.5);
  const right = computeLocalCeilingHeightCm(320, 5.4, 'vaulted', 20, 1.5);
  assert.equal(center, 320);
  assert.ok(left < center - 20, `Expected left eave (${left}cm) lower than center (${center}cm)`);
  assert.ok(right > center + 20, `Expected right ridge (${right}cm) higher than center (${center}cm)`);
  assert.ok(computeEffectiveVaultRad(3.2, 5.4, 'vaulted', 20) > 0.2);
  assert.equal(computeEffectiveVaultRad(3.2, 5.4, 'flat', 20), 0);
});

test('analyzeFloorClearance detects optimal, tight, restricted, and dev 1.25m bypass modes', () => {
  const opt = analyzeFloorClearance(5.0, 5.0, 'tension', true);
  assert.equal(opt.status, 'optimal');
  assert.equal(opt.minClearRadiusM, MIN_WALL_CLEARANCE_M);

  const tight = analyzeFloorClearance(3.0, 3.0, 'tension', true);
  assert.equal(tight.status, 'caution');

  const restricted = analyzeFloorClearance(2.2, 2.2, 'tension', true);
  assert.equal(restricted.status, 'restricted');

  // Compact office dev bypass disables 1.25m minimum radius check
  const devCompact = analyzeFloorClearance(1.8, 1.8, 'tension', false);
  assert.equal(devCompact.status, 'optimal');
  assert.equal(devCompact.minClearRadiusM, DEV_MIN_WALL_CLEARANCE_M);
  assert.equal(devCompact.label, '1.25m Limit Off');
});

test('lighting presets expose 5 studio & fitness presets with accurate dark/light flags', () => {
  const labels = LIGHTING_PRESETS.map((p) => p.label);
  assert.deepEqual(labels, [
    'Studio Daylight',
    'Mood/Night Neon',
    'Professional Spotlight',
    'Sunset Flow',
    'Cyber Pulse',
  ]);
  assert.equal(isDarkLighting('studio-daylight'), false);
  assert.equal(isDarkLighting('mood-neon'), true);
  assert.equal(isDarkLighting('pro-spotlight'), true);
  assert.equal(isDarkLighting('sunset-flow'), true);
  assert.equal(isDarkLighting('cyber-pulse'), true);
});

test('clampPolePosition enforces 1.25m wall clearance when enabled and relaxes to 0.35m when disabled', () => {
  assert.equal(getMinRoomSizeM(true), MIN_ROOM_SIZE_M);
  assert.equal(getMinRoomSizeM(false), DEV_MIN_ROOM_SIZE_M);
  assert.equal(getWallClearanceMarginM('tension', true), 1.25);
  assert.equal(getWallClearanceMarginM('tension', false), 0.35);

  const clampedOn = clampPolePosition(4.0, -4.0, 5.0, 5.0, 'tension', [], true);
  assert.equal(clampedOn.hitWallBoundary, true);
  assert.ok(Math.abs(clampedOn.x) <= 5.0 / 2 - 1.25 + 1e-3);
  assert.ok(Math.abs(clampedOn.z) <= 5.0 / 2 - 1.25 + 1e-3);

  // Disabled 1.25m limit allows dragging much closer to walls & testing in a 2.0m compact office
  const clampedOff = clampPolePosition(0.6, -0.6, 2.0, 2.0, 'tension', [], false);
  assert.equal(clampedOff.hitWallBoundary, false);
  assert.equal(clampedOff.x, 0.6);
  assert.equal(clampedOff.z, -0.6);

  // Inter-pole separation test
  const sibling = [{ x: 0, z: 0 }];
  const tooClose = clampPolePosition(0.3, 0, 5.4, 5.2, 'tension', sibling, true);
  assert.equal(tooClose.hitPoleBoundary, true);
  assert.ok(
    Math.hypot(tooClose.x, tooClose.z) >= getMinPoleSeparationM('tension', 'tension', true) - 0.01
  );
});

test('computeFullRoomCamera scales distance with room dimensions and stays below ceiling height', () => {
  const compact = computeFullRoomCamera(3.0, 3.0, 274, false, false);
  const standard = computeFullRoomCamera(5.4, 5.2, 274, false, false);
  const large = computeFullRoomCamera(7.0, 7.0, 320, false, true);

  const distCompact = Math.hypot(compact.pos[0], compact.pos[2]);
  const distStandard = Math.hypot(standard.pos[0], standard.pos[2]);
  const distLarge = Math.hypot(large.pos[0], large.pos[2]);

  assert.ok(distStandard > distCompact, 'Standard room should frame farther back than compact room');
  assert.ok(distLarge > distStandard, 'Large room should frame farther back than standard room');
  assert.ok(standard.pos[1] < 2.74 - 0.5, 'Camera Y must stay below ceiling soffit so interior stays unobstructed');
  assert.ok(distStandard >= 6.8, 'Full view should pull back far enough to display whole studio model');
});

test('computeInRoomOrbitPosition stays strictly inside room walls across all 360 degrees', () => {
  const cases = [
    { w: 5.4, d: 5.2, h: 2.74, px: 0, pz: 0, vaulted: false },
    { w: 5.4, d: 5.2, h: 2.74, px: -1.1, pz: -1.0, vaulted: true },
    { w: 2.0, d: 2.0, h: 2.5, px: 0.4, pz: -0.4, vaulted: false },
  ];

  for (const c of cases) {
    for (let deg = 0; deg < 360; deg += 5) {
      const rad = (deg * Math.PI) / 180;
      const res = computeInRoomOrbitPosition(
        rad,
        c.px,
        c.pz,
        c.w,
        c.d,
        c.h,
        deg * 0.1,
        2.25,
        c.vaulted,
        22
      );
      // Must NEVER pass behind solid back wall (-d/2) or solid left wall (-w/2)
      assert.ok(
        res.x > -c.w / 2 + 0.15,
        `Orbit clipped left wall at ${deg}deg (x=${res.x}, wall=${-c.w / 2})`
      );
      assert.ok(
        res.z > -c.d / 2 + 0.15,
        `Orbit clipped back wall at ${deg}deg (z=${res.z}, wall=${-c.d / 2})`
      );
      assert.ok(res.x < c.w / 2, `Orbit exceeded right room edge at ${deg}deg (x=${res.x})`);
      assert.ok(res.z < c.d / 2, `Orbit exceeded front room edge at ${deg}deg (z=${res.z})`);
      assert.ok(res.y >= 0.4 && res.y < c.h - 0.25, `Orbit Y out of bounds at ${deg}deg (y=${res.y})`);
    }
  }
});

test('multi-pole creation and BOM aggregation sum multiple different poles cleanly', () => {
  const p1 = createInitialPoles();
  const p2 = createNextPoleInstance(p1, 5.4, 5.2, true, 274);
  assert.notEqual(p2.finish, p1[0].finish);
  assert.ok(Math.hypot(p2.x - p1[0].x, p2.z - p1[0].z) >= 1.5);

  const singleBom = generateMultiPoleBOM(p1, DEFAULT_CONFIG);
  const dualBom = generateMultiPoleBOM([...p1, p2], DEFAULT_CONFIG);
  assert.ok(dualBom.totalPriceUsd > singleBom.totalPriceUsd + 400);
  assert.ok(dualBom.totalWeightKg > singleBom.totalWeightKg + 6);
});

test('two poles maintain independent heights, widths, finishes, and separate top/below cushions under shared 2.50m ceiling', () => {
  const ceilingCm = 250;
  const p1 = {
    ...createInitialPoles()[0],
    finish: 'brass' as PoleFinishId,
    diameterMm: 45 as const,
    heightCm: 200,
    cushionPlacement: 'below' as const,
  };
  const p2 = {
    ...createNextPoleInstance([p1], 5.4, 5.2, true, ceilingCm),
    finish: 'stainless' as PoleFinishId,
    diameterMm: 50 as const,
    heightCm: 230,
    cushionPlacement: 'top' as const,
  };

  assert.equal(getCushionHeightCm(ceilingCm, p1.heightCm), 50);
  assert.equal(getCushionHeightCm(ceilingCm, p2.heightCm), 20);
  assert.equal(clampPoleHeightCm(260, ceilingCm), 250);
  assert.equal(clampPoleHeightCm(100, ceilingCm), MIN_POLE_HEIGHT_CM);

  const bom = generateMultiPoleBOM([p1, p2], { ...DEFAULT_CONFIG, ceilingHeightCm: ceilingCm });
  const skus = bom.items.map((i) => i.sku);
  assert.ok(skus.includes('CSH-BLW-50'), 'Expected 0.50m below cushion SKU for Pole 1');
  assert.ok(skus.includes('CSH-TOP-20'), 'Expected 0.20m top cushion SKU for Pole 2');

  // Reconciling ceiling height up to 3.00m preserves both poles' custom heights
  const raised = reconcilePolesForCeilingHeight([p1, p2], 250, 300);
  assert.equal(raised[0].heightCm, 200);
  assert.equal(raised[1].heightCm, 230);

  // Lowering ceiling to 2.15m preserves P1 (2.00m) and safely clamps P2 down to 2.15m
  const lowered = reconcilePolesForCeilingHeight([p1, p2], 250, 215);
  assert.equal(lowered[0].heightCm, 200);
  assert.equal(lowered[1].heightCm, 215);

  // Flush pole grows smoothly when ceiling rises past 3.00m and caps at 3.00m with 2.00m cushion at 5.00m
  const flushPole = [{ ...p1, heightCm: 274 }];
  const tallReconciled = reconcilePolesForCeilingHeight(flushPole, 274, 500);
  assert.equal(tallReconciled[0].heightCm, MAX_POLE_HEIGHT_CM);
  assert.equal(getCushionHeightCm(500, tallReconciled[0].heightCm), 200);
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

test('cushion automatically bridges difference whenever pole height is below ceiling while enforcing 3.00m pole limit', () => {
  // 2.19m pole under 2.74m ceiling -> automatic 55cm cushion
  const sol274 = calculateHeightSolution(274, 'tension', 'powder-black', 219, 'top');
  assert.equal(sol274.poleHeightCm, 219);
  assert.equal(sol274.cushionHeightCm, 55);
  assert.equal(getCushionHeightCm(274, 219), 55);

  const bom274 = generateBOM({
    ...DEFAULT_CONFIG,
    ceilingHeightCm: 274,
    poleHeightCm: 219,
    cushionPlacement: 'top',
  });
  assert.equal(
    bom274.items.some((i) => i.sku === 'CSH-TOP-55'),
    true,
    'Expected CSH-TOP-55 cushion SKU for 2.19m pole in 2.74m ceiling'
  );

  // 3.00m ceiling with 2.45m pole -> automatic 55cm cushion (Top or Below)
  const sol300Short = calculateHeightSolution(300, 'tension', 'brass', 245, 'below');
  assert.equal(sol300Short.poleHeightCm, 245);
  assert.equal(sol300Short.cushionHeightCm, 55);

  // 3.00m ceiling with 3.00m pole -> flush 0cm cushion
  const sol300Flush = calculateHeightSolution(300, 'tension', 'brass', 300, 'top');
  assert.equal(sol300Flush.poleHeightCm, 300);
  assert.equal(sol300Flush.cushionHeightCm, 0);

  // 3.50m ceiling -> pole capped at 3.00m limit + automatic 50cm cushion
  const sol350Cap = calculateHeightSolution(350, 'tension', 'brass', 350, 'top');
  assert.equal(sol350Cap.poleHeightCm, 300);
  assert.equal(sol350Cap.cushionHeightCm, 50);
  assert.equal(sol350Cap.cappedAtMaxPoleHeight, true);
});

test('space-aware pole placement fits more than 4 poles in large rooms while strictly enforcing 1.25m clearance', () => {
  // Large 7.0m x 7.0m room should easily fit > 4 poles with 1.25m wall clearance
  const largePoles = createInitialPoles();
  while (largePoles.length < 7) {
    const next = tryCreateNextPoleInstance(largePoles, 7.0, 7.0, true, 274, 'tension');
    assert.ok(next, `Expected slot for pole #${largePoles.length + 1} in 7.0m × 7.0m room`);
    // Verify 1.25m wall clearance
    assert.ok(Math.abs(next.x) <= 7.0 / 2 - 1.25 + 1e-3);
    assert.ok(Math.abs(next.z) <= 7.0 / 2 - 1.25 + 1e-3);
    // Verify separation from every existing pole
    for (const existing of largePoles) {
      assert.ok(
        Math.hypot(next.x - existing.x, next.z - existing.z) >=
          getMinPoleSeparationM('tension', 'tension', true) - 0.01
      );
    }
    largePoles.push(next);
  }
  assert.equal(largePoles.length, 7);

  // Compact 3.0m x 3.0m room with 1.25m clearance can hold only 1 pole (0.5m x 0.5m safe box < 1.65m separation)
  const smallRoomPoles = createInitialPoles();
  assert.equal(canFitAdditionalPole(smallRoomPoles, 3.0, 3.0, 'tension', true), false);
  assert.equal(findAvailablePoleSlot(smallRoomPoles, 3.0, 3.0, 'tension', true), null);

  // Right-click preferred spot validation respects 1.25m wall margin
  assert.equal(
    isPositionValidForNewPole(2.1, 2.1, createInitialPoles(), 7.0, 7.0, 'tension', true),
    true
  );
  assert.equal(
    isPositionValidForNewPole(3.0, 0, createInitialPoles(), 7.0, 7.0, 'tension', true),
    false,
    '3.0m from center in 7.0m room leaves only 0.5m wall clearance (< 1.25m)'
  );
});

