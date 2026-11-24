import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_AR_MARKERS, type ARMarkerState } from './arMeasure';
import { screenToFloorPoint3D } from './arSurfaceCalibration';
import {
  calibrateDisparityMapToMeters,
  mapAdeLabelToCategory,
  reconstructRoomFromVisionAnalysis,
} from './spatialRoomReconstructor';
import type { RoomVisionAnalysis } from './roomVisionDetector';

/**
 * Generates a realistic synthetic camera frame + ADE20K SegFormer masks + Depth Anything V2
 * inverse-depth (disparity) map using true pinhole camera geometry.
 */
function buildSyntheticVisionRoom(opts: {
  width: number;
  height: number;
  markers: ARMarkerState;
  distanceM: number;
}): {
  rgba: Uint8ClampedArray;
  vision: RoomVisionAnalysis;
} {
  const { width, height, markers, distanceM } = opts;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const disparity = new Float32Array(width * height);

  const wallMask = new Uint8Array(width * height);
  const floorMask = new Uint8Array(width * height);
  const ceilingMask = new Uint8Array(width * height);
  const deskMask = new Uint8Array(width * height);
  const chairMask = new Uint8Array(width * height);
  const windowMask = new Uint8Array(width * height);
  const monitorMask = new Uint8Array(width * height);

  const ceilRow = Math.floor(height * markers.ceilingY);
  const floorRow = Math.floor(height * markers.floorY);

  // Known affine disparity scale: disp = 12.0 / depthM + 1.5
  const dispFromDepth = (zM: number) => 12.0 / Math.max(0.45, zM) + 1.5;

  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / height;
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const idx = y * width + x;

      let r = 216;
      let g = 210;
      let b = 200;
      let depthM = distanceM;

      if (y < ceilRow) {
        ceilingMask[idx] = 255;
        r = 240;
        g = 238;
        b = 232;
        depthM = Math.max(1.2, distanceM * (v / Math.max(0.05, markers.ceilingY)));
      } else if (y >= floorRow) {
        floorMask[idx] = 255;
        const plank = y % 5 === 0 ? -10 : 0;
        r = 186 + plank;
        g = 152 + plank;
        b = 114 + plank;
        const fPt = screenToFloorPoint3D(u, v, markers);
        depthM = fPt ? Math.max(0.8, -fPt.z) : distanceM * 0.7;
      } else {
        wallMask[idx] = 255;
        r = 214;
        g = 208;
        b = 198;
        depthM = distanceM;
      }

      // Daylight window on back-left wall
      if (u >= 0.16 && u <= 0.36 && v >= 0.25 && v <= 0.5) {
        wallMask[idx] = 0;
        windowMask[idx] = 255;
        r = 236;
        g = 244;
        b = 252;
        depthM = distanceM;
      }

      // Desk on the RIGHT side of the room (u in [0.64, 0.92]), closer than back wall
      if (u >= 0.64 && u <= 0.92 && v >= 0.55 && v <= 0.76) {
        wallMask[idx] = 0;
        floorMask[idx] = 0;
        deskMask[idx] = 255;
        r = 118;
        g = 82;
        b = 54;
        depthM = distanceM - 0.55;
      }

      // Computer monitor sitting on top of the right-side desk
      if (u >= 0.73 && u <= 0.83 && v >= 0.43 && v <= 0.55) {
        wallMask[idx] = 0;
        monitorMask[idx] = 255;
        r = 28;
        g = 32;
        b = 40;
        depthM = distanceM - 0.52;
      }

      // Two distinct chairs at DIFFERENT positions and depths:
      // Chair 1: office chair beside the right desk (closer: distanceM - 0.9m)
      if (u >= 0.52 && u <= 0.62 && v >= 0.58 && v <= 0.82) {
        wallMask[idx] = 0;
        floorMask[idx] = 0;
        deskMask[idx] = 0;
        chairMask[idx] = 255;
        r = 45;
        g = 50;
        b = 60;
        depthM = distanceM - 0.95;
      }

      // Chair 2: accent chair on the far LEFT side near back wall (distanceM - 0.35m)
      if (u >= 0.12 && u <= 0.25 && v >= 0.56 && v <= 0.76) {
        wallMask[idx] = 0;
        floorMask[idx] = 0;
        chairMask[idx] = 255;
        r = 140;
        g = 110;
        b = 85;
        depthM = distanceM - 0.35;
      }

      disparity[idx] = dispFromDepth(depthM);
      rgba[idx * 4] = r;
      rgba[idx * 4 + 1] = g;
      rgba[idx * 4 + 2] = b;
      rgba[idx * 4 + 3] = 255;
    }
  }

  const vision: RoomVisionAnalysis = {
    width,
    height,
    disparityMap: disparity,
    disparityIsInverseDepth: true,
    engine: 'segformer+depth-anything-v2',
    segments: [
      { label: 'wall', score: 0.96, width, height, mask: wallMask },
      { label: 'floor', score: 0.97, width, height, mask: floorMask },
      { label: 'ceiling', score: 0.94, width, height, mask: ceilingMask },
      { label: 'windowpane', score: 0.91, width, height, mask: windowMask },
      { label: 'table', score: 0.89, width, height, mask: deskMask },
      { label: 'crt screen', score: 0.86, width, height, mask: monitorMask },
      { label: 'chair', score: 0.88, width, height, mask: chairMask },
    ],
  };

  return { rgba, vision };
}

test('mapAdeLabelToCategory maps architectural surfaces and indoor furniture accurately', () => {
  assert.equal(mapAdeLabelToCategory('wall'), 'wall');
  assert.equal(mapAdeLabelToCategory('floor'), 'floor');
  assert.equal(mapAdeLabelToCategory('ceiling'), 'ceiling');
  assert.equal(mapAdeLabelToCategory('windowpane'), 'window');
  assert.equal(mapAdeLabelToCategory('desk'), 'desk');
  assert.equal(mapAdeLabelToCategory('swivel chair'), 'office-chair');
  assert.equal(mapAdeLabelToCategory('wardrobe'), 'wardrobe');
  assert.equal(mapAdeLabelToCategory('bookcase'), 'bookshelf');
  assert.equal(mapAdeLabelToCategory('crt screen'), 'monitor-cue');
});

test('calibrateDisparityMapToMeters recovers true metric distances from relative inverse depth', () => {
  const markers: ARMarkerState = {
    ...DEFAULT_AR_MARKERS,
    aspect: 1.333,
    vfovDeg: 54,
    ceilingY: 0.2,
    floorY: 0.72,
    cameraHeightM: 1.45,
    cameraPitchDeg: -10,
  };
  const backFloor = screenToFloorPoint3D(0.5, markers.floorY, markers)!;
  const trueBackDistM = Math.abs(backFloor.z);

  const { vision } = buildSyntheticVisionRoom({
    width: 160,
    height: 120,
    markers,
    distanceM: trueBackDistM,
  });

  const wallMask = vision.segments.find((s) => s.label === 'wall')!.mask;
  const floorMask = vision.segments.find((s) => s.label === 'floor')!.mask;

  const meters = calibrateDisparityMapToMeters(
    vision.disparityMap,
    vision.width,
    vision.height,
    floorMask,
    wallMask,
    markers,
    trueBackDistM
  );

  // Back wall center pixel should calibrate close to trueBackDistM
  const backWallSample = meters[Math.floor(120 * 0.4) * 160 + 80];
  assert.ok(
    Math.abs(backWallSample - trueBackDistM) < 0.45,
    `Expected back wall depth ~${trueBackDistM.toFixed(2)}m, got ${backWallSample.toFixed(2)}m`
  );

  // Foreground floor pixel should be strictly closer than back wall
  const nearFloorSample = meters[Math.floor(120 * 0.9) * 160 + 80];
  assert.ok(
    nearFloorSample < backWallSample - 0.6,
    `Expected foreground floor (${nearFloorSample.toFixed(2)}m) closer than back wall (${backWallSample.toFixed(2)}m)`
  );
});

test('reconstructRoomFromVisionAnalysis places right-side desk on the right, upgrades chair/table, and splits 2 separate chairs', () => {
  const markers: ARMarkerState = {
    ...DEFAULT_AR_MARKERS,
    aspect: 1.333,
    vfovDeg: 54,
    ceilingY: 0.2,
    floorY: 0.72,
    cameraHeightM: 1.45,
    cameraPitchDeg: -10,
  };
  const backFloor = screenToFloorPoint3D(0.5, markers.floorY, markers)!;
  const trueBackDistM = Math.abs(backFloor.z);

  const { rgba, vision } = buildSyntheticVisionRoom({
    width: 160,
    height: 120,
    markers,
    distanceM: trueBackDistM,
  });

  const result = reconstructRoomFromVisionAnalysis(rgba, 160, 120, vision, {
    markers,
    roomWidthM: 4.4,
    roomDepthM: 4.2,
    ceilingHeightCm: 280,
    distanceM: trueBackDistM,
    poleOffsetXM: 0,
    floorAccuracyPct: 95,
    ceilingAccuracyPct: 94,
    overallAccuracyPct: 95,
  });

  assert.equal(result.detectorEngine, 'segformer+depth-v2+cv');
  assert.equal(result.scene.roomType, 'Home Office');
  assert.equal(result.scene.floorMaterial, 'wood-light');

  // Desk (upgraded from table + monitor cue) must sit on the RIGHT side of the room (x > 0.35)
  const desk = result.scene.objects.find((o) => o.type === 'desk');
  assert.ok(desk, 'Should detect and upgrade table + monitor into a desk');
  assert.ok(desk.x > 0.35, `Desk on right side of photo must have x > 0.35, got x=${desk.x}`);
  assert.ok(desk.widthM >= 0.85 && desk.widthM <= 2.2, `Desk width should be realistic: ${desk.widthM}`);
  assert.ok(desk.depthM >= 0.55, `Front-surface compensation should keep desk depth >= 0.55m, got ${desk.depthM}`);

  // Depth-aware splitting must separate the two chairs under the single 'chair' SegFormer mask!
  const chairs = result.scene.objects.filter(
    (o) => o.type === 'chair' || o.type === 'office-chair'
  );
  assert.equal(chairs.length, 2, `Should split 2 spatially separate chairs, got ${chairs.length}`);

  const officeChair = chairs.find((c) => c.type === 'office-chair');
  const accentChair = chairs.find((c) => c.type === 'chair');
  assert.ok(officeChair && officeChair.x > 0, 'Chair near right-side desk should upgrade to office-chair on right');
  assert.ok(accentChair && accentChair.x < -0.4, `Left-side chair should remain on left (x=${accentChair?.x})`);

  // Window should be snapped to back/left wall
  const win = result.scene.objects.find((o) => o.type === 'window');
  assert.ok(win, 'Should detect window from SegFormer windowpane mask');
});
