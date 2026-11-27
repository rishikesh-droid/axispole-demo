import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeWallPixelsForWireframe,
  estimateFourWallDimensions,
  getVisibleWallSlots,
  rotateWallSlotsClockwise,
  swapWallSlots,
} from './fourWallReconstructor.ts';

describe('fourWallReconstructor', () => {
  it('maps all 4 cutaway view modes to exact wall visibility', () => {
    assert.deepEqual(getVisibleWallSlots('full'), {
      back: true,
      right: true,
      front: true,
      left: true,
    });
    assert.deepEqual(getVisibleWallSlots('front-open'), {
      back: true,
      right: true,
      front: false,
      left: true,
    });
    assert.deepEqual(getVisibleWallSlots('back-left'), {
      back: true,
      right: false,
      front: false,
      left: true,
    });
    assert.deepEqual(getVisibleWallSlots('back-right'), {
      back: true,
      right: true,
      front: false,
      left: false,
    });
  });

  it('swaps two misplaced wall slots without mutating original map', () => {
    const original = { back: 'B', right: 'R', front: 'F', left: 'L' };
    const swapped = swapWallSlots(original, 'left', 'right');
    assert.deepEqual(swapped, { back: 'B', right: 'L', front: 'F', left: 'R' });
    assert.equal(original.right, 'R');
  });

  it('rotates all 4 walls 90 degrees clockwise in one click', () => {
    const original = { back: '1', right: '2', front: '3', left: '4' };
    const rotated = rotateWallSlotsClockwise(original);
    assert.deepEqual(rotated, { back: '4', right: '1', front: '2', left: '3' });
  });

  it('estimates room width and depth automatically from 4 wall aspect ratios', () => {
    const wideRoom = estimateFourWallDimensions(
      { back: 1.8, front: 1.75, left: 1.15, right: 1.2 },
      274
    );
    assert.ok(wideRoom.roomWidthM > wideRoom.roomDepthM);
    assert.ok(wideRoom.roomWidthM >= 3.0 && wideRoom.roomWidthM <= 8.5);
    assert.ok(wideRoom.roomDepthM >= 3.0 && wideRoom.roomDepthM <= 8.5);
    assert.equal(wideRoom.ceilingHeightCm, 274);
  });

  it('extracts crisp CAD edges and floor obstacles from a synthetic wall image', () => {
    const w = 96;
    const h = 72;
    const rgba = new Uint8ClampedArray(w * h * 4);
    // Light neutral wall background with a dark rectangular doorway/cabinet in the center-bottom
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const isDarkBlock = x >= 32 && x <= 62 && y >= 34 && y <= 64;
        const val = isDarkBlock ? 45 : 235;
        rgba[o] = val;
        rgba[o + 1] = val;
        rgba[o + 2] = val;
        rgba[o + 3] = 255;
      }
    }

    const result = analyzeWallPixelsForWireframe(rgba, w, h, 'back');
    assert.equal(result.cadPixels.length, w * h * 4);
    assert.equal(result.blueprintPixels.length, w * h * 4);
    // Check that vertical edge pixels around x=32 turned dark ink (< 140) on white drafting paper (> 230)
    const edgeOffset = (48 * w + 32) * 4;
    const bgOffset = (20 * w + 10) * 4;
    assert.ok(result.cadPixels[edgeOffset] < 160, 'expected crisp dark CAD line at vertical edge');
    assert.ok(result.cadPixels[bgOffset] > 230, 'expected clean light drafting paper background');
    assert.ok(result.detectedObstacles.length >= 1, 'expected floor-resting block obstacle to be detected');
  });
});
