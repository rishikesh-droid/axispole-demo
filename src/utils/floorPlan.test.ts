import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFloorPlanGridLines,
  computeFloorPlanRect,
  computePoleWallDistances,
  floorPlanToWorld,
  formatFloorArea,
  formatFloorPlanDim,
  worldToFloorPlan,
} from './floorPlan';
import { clampPolePosition } from './poleConfig';

test('worldToFloorPlan and floorPlanToWorld round-trip accurately', () => {
  const rect = computeFloorPlanRect(1000, 760, 5.4, 5.2, 1.0);
  const center = worldToFloorPlan(0, 0, 5.4, 5.2, rect);
  assert.ok(Math.abs(center.sx - (rect.x + rect.width / 2)) < 1e-6);
  assert.ok(Math.abs(center.sy - (rect.y + rect.height / 2)) < 1e-6);

  const sample = worldToFloorPlan(1.35, -0.8, 5.4, 5.2, rect);
  const back = floorPlanToWorld(sample.sx, sample.sy, 5.4, 5.2, rect);
  assert.ok(Math.abs(back.x - 1.35) < 1e-6);
  assert.ok(Math.abs(back.z - -0.8) < 1e-6);
});

test('computeFloorPlanRect preserves room aspect ratio and scales with zoom', () => {
  const r1 = computeFloorPlanRect(1000, 760, 6.0, 3.0, 1.0);
  assert.ok(Math.abs(r1.width / r1.height - 2.0) < 1e-6);

  const r2 = computeFloorPlanRect(1000, 760, 6.0, 3.0, 1.5);
  assert.ok(Math.abs(r2.pxPerMeter / r1.pxPerMeter - 1.5) < 1e-6);
});

test('dragging in floor plan coordinates clamps identically to 3D room bounds', () => {
  const rect = computeFloorPlanRect(1000, 760, 5.4, 5.2, 1.0);
  // Attempt to drag far past right wall
  const rawWorld = floorPlanToWorld(rect.x + rect.width + 200, rect.y + rect.height / 2, 5.4, 5.2, rect);
  const clamped = clampPolePosition(rawWorld.x, rawWorld.z, 5.4, 5.2, 'tension', [], true);
  assert.equal(clamped.hitWallBoundary, true);
  assert.ok(Math.abs(clamped.x - (5.4 / 2 - 1.25)) < 1e-3);
  assert.ok(Math.abs(clamped.z) < 1e-3);
});

test('computePoleWallDistances returns exact wall and sibling pole spacing', () => {
  const p1 = { id: 'p1', x: -0.5, z: 0.4 };
  const p2 = { id: 'p2', x: 1.5, z: 0.4 };
  const d = computePoleWallDistances(p1, 5.0, 4.0, [p1, p2]);
  assert.equal(d.leftM, 2.0);
  assert.equal(d.rightM, 3.0);
  assert.equal(d.topM, 2.4);
  assert.equal(d.bottomM, 1.6);
  assert.equal(d.nearestWallM, 1.6);
  assert.equal(d.nearestPoleM, 2.0);
});

test('computeFloorPlanGridLines creates minor 0.5m and major 1.0m lines', () => {
  const grid = computeFloorPlanGridLines(4.0, 3.0, 0.5);
  assert.equal(grid.verticals.length, 7); // 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5
  assert.equal(grid.verticals.filter((g) => g.isMajor).length, 3); // 1.0, 2.0, 3.0
  assert.equal(grid.horizontals.length, 5);
});

test('formatFloorPlanDim and formatFloorArea support metric and imperial', () => {
  assert.equal(formatFloorPlanDim(5.4, 'm'), '5.40 m');
  assert.equal(formatFloorPlanDim(3.048, 'ft'), '10 ft');
  assert.equal(formatFloorArea(5.0, 4.0, 'm'), '20.0 m²');
  assert.equal(formatFloorArea(5.0, 4.0, 'ft'), '215 sq ft');
});
