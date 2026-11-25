import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bilateralSmoothDepth,
  buildMetricDepthMesh,
  calibrateDisparityToMetricDepth,
  estimateHeuristicDepthMap,
  extractArchitecturalInkAlpha,
  measuredObjectsToReplicaObjects,
} from './depthMeshReconstructor';
import { DEFAULT_AR_MARKERS } from './arMeasure';

describe('depthMeshReconstructor — 3D architectural CAD wireframe & metric measurement', () => {
  it('bilateralSmoothDepth reduces noise on flat walls while preserving sharp foreground depth cliffs', () => {
    const w = 24;
    const h = 24;
    const depth = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Left half foreground sofa at 1.4m, right half back wall at 4.0m with +/-0.05m noise
        const base = x < 12 ? 1.4 : 4.0;
        const noise = ((x + y) % 2 === 0 ? 0.04 : -0.04);
        depth[y * w + x] = base + noise;
      }
    }
    const smoothed = bilateralSmoothDepth(depth, w, h, 2, 1.5, 0.14);

    // Flat regions should be smoothed closer to their true planes
    assert.ok(Math.abs(smoothed[12 * w + 4] - 1.4) < 0.03, 'foreground plane smoothed cleanly');
    assert.ok(Math.abs(smoothed[12 * w + 18] - 4.0) < 0.03, 'back wall plane smoothed cleanly');

    // Sharp jump across x=11 -> x=12 must stay crisp (>2.0m separation)
    const jump = smoothed[12 * w + 12] - smoothed[12 * w + 11];
    assert.ok(jump > 2.0, `Expected preserved depth cliff >2.0m, got ${jump.toFixed(2)}m`);
  });

  it('calibrateDisparityToMetricDepth converts inverse disparity into physically valid metric meters', () => {
    const w = 40;
    const h = 50;
    const disp = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Higher disparity = closer (bottom foreground sofa vs mid back wall)
        const v = y / (h - 1);
        disp[y * w + x] = v > 0.72 && x < 14 ? 0.92 : 0.25 + v * 0.2;
      }
    }

    const { depthMeters, backWallDepthM, vfovDeg } = calibrateDisparityToMetricDepth(
      disp,
      w,
      h,
      true,
      {
        ceilingHeightCm: 274,
        distanceM: 3.8,
        imageAspect: 0.75,
        markers: DEFAULT_AR_MARKERS,
      }
    );

    assert.ok(backWallDepthM >= 2.6 && backWallDepthM <= 5.6);
    assert.equal(vfovDeg, 60);

    const sofaZ = depthMeters[42 * w + 5];
    const backWallZ = depthMeters[20 * w + 20];
    assert.ok(sofaZ < backWallZ - 1.0, `Sofa (${sofaZ.toFixed(2)}m) must be closer than back wall (${backWallZ.toFixed(2)}m)`);
    assert.ok(sofaZ >= 0.85 && backWallZ <= 6.5);
  });

  it('buildMetricDepthMesh prunes depth-discontinuity triangles, grounds floor near Y=0, and measures 3D foreground objects', () => {
    const gridW = 48;
    const gridH = 60;
    const depth = new Float32Array(gridW * gridH);

    // Create a clean room: back wall at 4.0m, floor receding from 4.0m to 2.0m,
    // and a distinct foreground sofa block in bottom-left at 1.45m
    for (let gy = 0; gy < gridH; gy++) {
      const v = gy / (gridH - 1);
      for (let gx = 0; gx < gridW; gx++) {
        const u = gx / (gridW - 1);
        let z = 4.0;
        if (v > 0.78) {
          // Receding floor
          z = 4.0 - ((v - 0.78) / 0.22) * 1.8;
        }
        if (v < 0.18) {
          // Receding ceiling
          z = 4.0 - ((0.18 - v) / 0.18) * 1.6;
        }
        // Distinct foreground sofa in lower-left quadrant (1.45m)
        if (u < 0.34 && v >= 0.56 && v <= 0.88) {
          z = 1.45;
        }
        depth[gy * gridW + gx] = z;
      }
    }

    const mesh = buildMetricDepthMesh(depth, gridW, gridH, {
      ceilingHeightCm: 274,
      imageAspect: 0.75,
      vfovDeg: 60,
      backWallDepthM: 4.0,
      depthEngine: 'depth-anything-v2',
    });

    // All vertex coordinates must be finite
    for (let i = 0; i < mesh.positions.length; i++) {
      assert.ok(Number.isFinite(mesh.positions[i]), 'vertex coordinate finite');
    }

    // Total possible triangles = (gridW-1)*(gridH-1)*2; discontinuity pruning must drop boundary triangles!
    const maxTris = (gridW - 1) * (gridH - 1) * 2;
    const actualTris = mesh.indices.length / 3;
    assert.ok(actualTris < maxTris, `Expected pruned rubber-sheet triangles (${actualTris} < ${maxTris})`);
    assert.ok(actualTris > maxTris * 0.75, 'Most continuous surface triangles retained');

    // Structural wireframe, foreground quad wireframe, and 3D silhouette contours must be populated
    assert.ok(mesh.wireframePositions.length > 0, 'structural wireframe generated');
    assert.ok(mesh.foregroundWirePositions.length > 0, 'foreground quad wireframe generated');
    assert.ok(mesh.silhouettePositions.length > 0, '3D silhouette contour lines generated');

    // Floor grounded cleanly near Y = 0 and ceiling near 2.74m
    assert.ok(mesh.bounds.minY >= -0.2 && mesh.bounds.minY <= 0.15, `Floor minY near 0 (got ${mesh.bounds.minY})`);
    assert.ok(mesh.bounds.maxY >= 2.2 && mesh.bounds.maxY <= 3.8, `Ceiling maxY realistic (got ${mesh.bounds.maxY})`);

    // Measured 3D object volumes must detect the foreground sofa cluster with valid W x D x H
    assert.ok(mesh.measuredObjects.length >= 1, 'At least one foreground 3D volume measured');
    const first = mesh.measuredObjects[0];
    assert.ok(first.widthM >= 0.25 && first.widthM <= 2.8);
    assert.ok(first.heightM >= 0.3 && first.heightM <= 2.7);
    assert.ok(first.depthM >= 0.24 && first.depthM <= 2.2);

    const floorPlanObjs = measuredObjectsToReplicaObjects(mesh.measuredObjects);
    assert.equal(floorPlanObjs.length, mesh.measuredObjects.length);
  });

  it('extractArchitecturalInkAlpha cleanly isolates vertical wood slats and bold contours on white CAD background', () => {
    const w = 64;
    const h = 48;
    const rgba = new Uint8ClampedArray(w * h * 4);

    // Draw dark vertical slats (every 4px) on right half, plain bright wall on left half
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        if (x < 28) {
          rgba[p] = 242;
          rgba[p + 1] = 242;
          rgba[p + 2] = 240;
          rgba[p + 3] = 255;
        } else {
          const isGap = x % 4 === 0;
          rgba[p] = isGap ? 26 : 108;
          rgba[p + 1] = isGap ? 18 : 74;
          rgba[p + 2] = isGap ? 14 : 56;
          rgba[p + 3] = 255;
        }
      }
    }

    const ink = extractArchitecturalInkAlpha(rgba, w, h);

    // Plain wall interior must have ~0 ink (stays pure CAD white)
    assert.ok(ink[24 * w + 12] < 0.05, 'Plain wall stays clean white');

    // Slatted wall must have strong crisp ink spikes along vertical slat transitions
    let slatEdgeHits = 0;
    for (let x = 30; x < w - 2; x++) {
      if (ink[24 * w + x] > 0.35) slatEdgeHits++;
    }
    assert.ok(slatEdgeHits >= 6, `Expected strong architectural slat lines, got ${slatEdgeHits}`);
  });

  it('estimateHeuristicDepthMap builds a genuine 3D 5-plane perspective room depth map offline', () => {
    const w = 48;
    const h = 64;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        const isBackWall = x >= 12 && x <= 36 && y >= 10 && y <= 48;
        rgba[p] = isBackWall ? 95 : 220;
        rgba[p + 1] = isBackWall ? 68 : 220;
        rgba[p + 2] = isBackWall ? 52 : 218;
        rgba[p + 3] = 255;
      }
    }

    const { depthMeters, backWallDepthM } = estimateHeuristicDepthMap(rgba, w, h, {
      ceilingHeightCm: 274,
      distanceM: 3.8,
      imageAspect: 0.75,
      markers: DEFAULT_AR_MARKERS,
    });

    const centerBack = depthMeters[28 * w + 24];
    const bottomFloor = depthMeters[60 * w + 24];
    const farLeftWall = depthMeters[28 * w + 2];
    assert.ok(centerBack > bottomFloor + 0.5, 'Floor recedes closer than back wall');
    assert.ok(centerBack > farLeftWall + 0.4, 'Left side wall recedes closer than back wall');
    assert.ok(backWallDepthM >= 2.8);
  });
});
