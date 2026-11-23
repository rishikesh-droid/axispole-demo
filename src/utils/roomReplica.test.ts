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
