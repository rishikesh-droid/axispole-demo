import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeHexColor, sanitizeRoomReplicaScene } from './roomReplica.ts';

test('sanitizeHexColor validates 3-digit and 6-digit hex strings and rejects malformed values', () => {
  assert.equal(sanitizeHexColor('#AbC', '#000000'), '#aabbcc');
  assert.equal(sanitizeHexColor('3B82F6', '#000000'), '#3b82f6');
  assert.equal(sanitizeHexColor('javascript:alert(1)', '#d8d4cc'), '#d8d4cc');
  assert.equal(sanitizeHexColor('', '#112233'), '#112233');
});

test('sanitizeRoomReplicaScene clamps room bounds, clears pole collision zone, snaps wall items, and tallies visible vs inferred objects', () => {
  const scene = sanitizeRoomReplicaScene(
    {
      roomType: 'Home Office',
      summary: 'Bright study with oak desk and inferred reading nook.',
      floorMaterial: 'wood-light',
      floorColor: '#c2a07b',
      wallColor: '#e2dfd7',
      accentWallColor: '#d0ccc2',
      ceilingColor: '#f3f1ec',
      trimColor: '#ece9e2',
      lightingMood: 'warm',
      objects: [
        // Desk intentionally placed right on top of the pole center (0, 0) -> must be nudged clear!
        {
          type: 'desk',
          label: 'Oak Study Desk',
          x: 0.0,
          z: 0.0,
          widthM: 1.4,
          depthM: 0.65,
          heightM: 0.75,
          rotationDeg: 0,
          primaryColor: '#8f6948',
          secondaryColor: '#252932',
          inferred: false,
          confidence: 0.94,
        },
        {
          type: 'office-chair',
          label: 'Mesh Chair',
          x: -0.9,
          z: -0.6,
          widthM: 0.6,
          depthM: 0.6,
          heightM: 1.02,
          rotationDeg: 180,
          primaryColor: '#2c303a',
          secondaryColor: '#5b6170',
          inferred: false,
          confidence: 0.91,
        },
        // Window floating near back wall -> must snap cleanly onto back wall z = -halfD
        {
          type: 'window',
          label: 'North Window',
          x: 0.6,
          z: -1.4,
          widthM: 1.3,
          depthM: 0.1,
          heightM: 1.3,
          rotationDeg: 25,
          primaryColor: '#eceae4',
          secondaryColor: '#b4d6f4',
          inferred: false,
          confidence: 0.93,
        },
        // Inferred unseen bookshelf placed way outside bounds -> must clamp inside room!
        {
          type: 'bookshelf',
          label: 'Inferred Bookshelf',
          x: -9.5,
          z: 0.4,
          widthM: 0.9,
          depthM: 0.34,
          heightM: 1.85,
          rotationDeg: 90,
          primaryColor: '#7a593d',
          secondaryColor: '#30343e',
          inferred: true,
          confidence: 0.76,
        },
        // Floor rug centered under pole -> allowed to stay centered on floor!
        {
          type: 'rug',
          label: 'Woven Area Rug',
          x: 0,
          z: 0,
          widthM: 1.8,
          depthM: 1.4,
          heightM: 0.02,
          rotationDeg: 0,
          primaryColor: '#c4b8a6',
          secondaryColor: '#7d7368',
          inferred: true,
          confidence: 0.74,
        },
      ],
    },
    {
      roomWidthM: 4.0,
      roomDepthM: 3.6,
      ceilingHeightCm: 278,
      poleOffsetXM: 0,
      floorAccuracyPct: 95,
      ceilingAccuracyPct: 93,
      overallAccuracyPct: 94,
    }
  );

  assert.equal(scene.visibleObjectCount, 3);
  assert.equal(scene.inferredObjectCount, 2);
  assert.equal(scene.overallAccuracyPct, 94);

  // Desk must have been nudged clear of pole center (0, 0)
  const desk = scene.objects.find((o) => o.type === 'desk')!;
  const deskHalfX = desk.widthM / 2;
  const deskHalfZ = desk.depthM / 2;
  const collidesPole =
    Math.abs(desk.x) < deskHalfX + 0.42 && Math.abs(desk.z) < deskHalfZ + 0.42;
  assert.equal(collidesPole, false, `Desk at (${desk.x}, ${desk.z}) must not collide with pole at (0, 0)`);

  // Window must snap cleanly to back wall (z ≈ -1.74) with rotation 0
  const win = scene.objects.find((o) => o.type === 'window')!;
  assert.equal(win.rotationDeg, 0);
  assert.ok(win.z <= -1.7, `Expected window snapped to back wall, got z=${win.z}`);

  // Bookshelf must be clamped strictly inside [-2.0, +2.0] room width
  const shelf = scene.objects.find((o) => o.type === 'bookshelf')!;
  assert.ok(shelf.x >= -2.0 && shelf.x <= 2.0, `Expected clamped shelf x, got ${shelf.x}`);

  // Rug is flat on floor so it stays centered under pole
  const rug = scene.objects.find((o) => o.type === 'rug')!;
  assert.equal(rug.x, 0);
  assert.equal(rug.z, 0);
});

test('sanitizeRoomReplicaScene preserves elevated wall cupboards without pole-axis nudging and pushes tucked chairs cleanly in front of desks', async () => {
  const { computeObjectCoverCrop } = await import('./roomReplica.ts');

  const scene = sanitizeRoomReplicaScene(
    {
      roomType: 'Home Office',
      summary: 'Built-in study with upper cupboards and front chair.',
      floorMaterial: 'tile',
      floorColor: '#98918d',
      wallColor: '#5c5c5c',
      accentWallColor: '#5c5c5c',
      ceilingColor: '#989391',
      trimColor: '#d0cdc7',
      lightingMood: 'neutral',
      objects: [
        {
          type: 'desk',
          label: 'Work Desk',
          x: -0.4,
          z: -1.65,
          widthM: 1.8,
          depthM: 0.65,
          heightM: 0.76,
          rotationDeg: 0,
          primaryColor: '#6c8b84',
          secondaryColor: '#2b2f35',
          inferred: false,
          confidence: 0.9,
        },
        {
          // Intentionally tucked inside desk footprint -> must be separated IN FRONT of desk!
          type: 'office-chair',
          label: 'Office Chair',
          x: -0.6,
          z: -1.7,
          widthM: 0.56,
          depthM: 0.56,
          heightM: 0.92,
          rotationDeg: 0,
          primaryColor: '#23262e',
          secondaryColor: '#4c525f',
          inferred: false,
          confidence: 0.88,
        },
        {
          // Elevated wall cupboard directly behind/above pole axis -> elevationM >= 1.25 stays on wall
          type: 'cabinet',
          label: 'Wall Cupboard',
          x: 0.0,
          z: -0.1,
          widthM: 1.6,
          depthM: 0.4,
          heightM: 0.78,
          elevationM: 1.48,
          rotationDeg: 0,
          primaryColor: '#585a5e',
          secondaryColor: '#2b2f35',
          inferred: false,
          confidence: 0.85,
        },
      ],
    },
    {
      roomWidthM: 3.4,
      roomDepthM: 4.0,
      ceilingHeightCm: 265,
      poleOffsetXM: 0,
      floorAccuracyPct: 90,
      ceilingAccuracyPct: 90,
      overallAccuracyPct: 90,
    }
  );

  const desk = scene.objects.find((o) => o.type === 'desk')!;
  const chair = scene.objects.find((o) => o.type === 'office-chair')!;
  const cupboard = scene.objects.find((o) => o.type === 'cabinet')!;

  assert.ok(
    chair.z >= desk.z + desk.depthM * 0.5 + chair.depthM * 0.35,
    `Tucked chair (z=${chair.z}) must be pushed in front of desk (frontZ=${(desk.z + desk.depthM * 0.5).toFixed(2)})`
  );
  assert.equal(cupboard.elevationM, 1.48);
  assert.equal(cupboard.x, 0, 'Overhead wall cabinet >= 1.25m elevation should not be nudged horizontally away from pole');

  // Verify portrait center-crop matching CSS object-cover
  const portraitCrop = computeObjectCoverCrop(3060, 4080, 0.46);
  assert.equal(portraitCrop.sy, 0);
  assert.equal(portraitCrop.sh, 4080);
  assert.ok(Math.abs(portraitCrop.sw / portraitCrop.sh - 0.46) < 0.01);
});

test('sanitizeRoomReplicaScene preserves architecturalFeatures, multi-wall colors, and elevated shelf plants', () => {
  const scene = sanitizeRoomReplicaScene(
    {
      roomType: 'Home Office',
      summary: 'Exact office replica with soffit beam, ceiling fan, open shelf ledge, and built-in bays.',
      floorMaterial: 'tile',
      floorColor: '#dcd9d2',
      groutColor: '#b8b5ad',
      wallColor: '#e4e2dd',
      leftWallColor: '#f1f1ee',
      upperWallColor: '#595d62',
      accentWallColor: '#595d62',
      ceilingColor: '#d9d8d4',
      trimColor: '#484c52',
      lightingMood: 'neutral',
      objects: [
        {
          type: 'desk',
          label: 'Workstation Counter',
          variant: 'built-in-bays',
          hasMonitor: false,
          bayCount: 2,
          x: -0.45,
          z: -1.6,
          widthM: 2.2,
          depthM: 0.65,
          heightM: 0.76,
          rotationDeg: 0,
          primaryColor: '#73a198',
          secondaryColor: '#252930',
          inferred: false,
          confidence: 0.95,
        },
        {
          type: 'bookshelf',
          label: 'Open Wall Ledge',
          variant: 'open-wall-ledge',
          bayCount: 3,
          x: -0.45,
          z: -1.78,
          widthM: 2.2,
          depthM: 0.24,
          heightM: 0.24,
          elevationM: 1.18,
          rotationDeg: 0,
          primaryColor: '#f1f1ed',
          secondaryColor: '#dcdad4',
          inferred: false,
          confidence: 0.92,
        },
        {
          type: 'plant',
          label: 'Shelf Plant',
          variant: 'small-shelf-pot',
          x: 0.0,
          z: -1.78,
          widthM: 0.16,
          depthM: 0.16,
          heightM: 0.2,
          elevationM: 1.42,
          rotationDeg: 0,
          primaryColor: '#4f7736',
          secondaryColor: '#20242a',
          inferred: false,
          confidence: 0.9,
        },
      ],
      architecturalFeatures: [
        {
          type: 'soffit-beam',
          x: 0,
          z: 0.95,
          widthM: 3.4,
          depthM: 0.26,
          heightM: 0.36,
          elevationM: 2.19,
          rotationDeg: 0,
          primaryColor: '#dcdcd9',
          secondaryColor: '#1f2329',
          textLabel: 'DONT QUIT',
        },
        {
          type: 'ceiling-fan',
          x: -0.4,
          z: -0.65,
          widthM: 1.1,
          depthM: 1.1,
          heightM: 0.32,
          elevationM: 2.23,
          rotationDeg: 0,
          primaryColor: '#e9e8e4',
          secondaryColor: '#1e2128',
        },
      ],
    },
    {
      roomWidthM: 3.4,
      roomDepthM: 4.0,
      ceilingHeightCm: 255,
      poleOffsetXM: 0,
    }
  );

  assert.equal(scene.leftWallColor, '#f1f1ee');
  assert.equal(scene.upperWallColor, '#595d62');
  assert.equal(scene.groutColor, '#b8b5ad');
  assert.equal(scene.architecturalFeatures?.length, 2);
  assert.equal(scene.architecturalFeatures?.[0].textLabel, 'DONT QUIT');

  const desk = scene.objects.find((o) => o.type === 'desk')!;
  assert.equal(desk.variant, 'built-in-bays');
  assert.equal(desk.hasMonitor, false);
  assert.equal(desk.bayCount, 2);

  const shelfPlant = scene.objects.find((o) => o.type === 'plant')!;
  assert.equal(shelfPlant.elevationM, 1.42);
  assert.equal(shelfPlant.x, 0, 'Elevated shelf plant >= 1.25m stays centered over shelf without pole-axis push');
});


