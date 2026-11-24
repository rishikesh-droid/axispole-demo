import type {
  RoomReplicaFloorMaterial,
  RoomReplicaLightingMood,
  RoomReplicaObjectType,
  RoomReplicaScene,
} from '../types/pole';
import type { ARMarkerState } from './arMeasure';
import { screenToFloorPoint3D } from './arSurfaceCalibration';
import { sanitizeRoomReplicaScene } from './roomReplica';
import {
  analyzeRoomWithVisionModels,
  preloadRoomVisionModels,
} from './roomVisionDetector';
import { reconstructRoomFromVisionAnalysis } from './spatialRoomReconstructor';

export interface RawObjectDetection {
  className: string;
  score: number;
  /** Normalized [0..1] top-left X */
  x: number;
  /** Normalized [0..1] top-left Y */
  y: number;
  /** Normalized [0..1] box width */
  w: number;
  /** Normalized [0..1] box height */
  h: number;
}

export interface LocalRoomScanInput {
  markers: ARMarkerState;
  roomWidthM: number;
  roomDepthM: number;
  ceilingHeightCm: number;
  distanceM: number;
  poleOffsetXM: number;
  floorAccuracyPct: number;
  ceilingAccuracyPct: number;
  overallAccuracyPct: number;
  previewDataUrl?: string;
  externalDetections?: RawObjectDetection[];
  /** Opt-in: add plausible furniture for unseen areas (off by default to keep the replica faithful). */
  includeUnseenCompletions?: boolean;
}

export interface LocalRoomScanResult {
  scene: RoomReplicaScene;
  detectorEngine: 'segformer+depth-v2+cv' | 'external+cv' | 'pixel-cv';
  rawDetectionCount: number;
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface DraftReplicaObject {
  type: RoomReplicaObjectType;
  label: string;
  x: number;
  z: number;
  widthM: number;
  depthM: number;
  heightM: number;
  rotationDeg: number;
  primaryColor: string;
  secondaryColor: string;
  inferred: boolean;
  confidence: number;
}

interface SurfacePalette {
  ceilingColor: string;
  wallColor: string;
  accentWallColor: string;
  floorColor: string;
  trimColor: string;
  floorMaterial: RoomReplicaFloorMaterial;
  lightingMood: RoomReplicaLightingMood;
  wallRgb: RGB;
  leftWallRgb: RGB;
  rightWallRgb: RGB;
  floorRgb: RGB;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function rgbToHex({ r, g, b }: RGB): string {
  const toHex = (n: number) =>
    Math.round(clamp(n, 0, 255))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbDistance(a: RGB, b: RGB): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function rgbLuminance(c: RGB): number {
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
}

function rgbSaturation(c: RGB): number {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  if (max <= 0) return 0;
  return (max - min) / max;
}

function adjustRgb(c: RGB, factor: number): RGB {
  return {
    r: clamp(c.r * factor, 14, 245),
    g: clamp(c.g * factor, 14, 245),
    b: clamp(c.b * factor, 14, 245),
  };
}

function blendRgb(a: RGB, b: RGB, t: number): RGB {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

function sampleTrimmedMedianRgb(
  rgba: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
  x0Frac: number,
  y0Frac: number,
  x1Frac: number,
  y1Frac: number,
  opts?: { minLum?: number; maxLum?: number; stride?: number; fallback?: RGB }
): RGB {
  const minLum = opts?.minLum ?? 0;
  const maxLum = opts?.maxLum ?? 255;
  const stride = Math.max(1, opts?.stride ?? 2);
  const x0 = clamp(Math.floor(x0Frac * w), 0, w - 1);
  const x1 = clamp(Math.ceil(x1Frac * w), x0 + 1, w);
  const y0 = clamp(Math.floor(y0Frac * h), 0, h - 1);
  const y1 = clamp(Math.ceil(y1Frac * h), y0 + 1, h);

  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];

  for (let y = y0; y < y1; y += stride) {
    for (let x = x0; x < x1; x += stride) {
      const idx = (y * w + x) * 4;
      const r = rgba[idx];
      const g = rgba[idx + 1];
      const b = rgba[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum >= minLum && lum <= maxLum) {
        rs.push(r);
        gs.push(g);
        bs.push(b);
      }
    }
  }

  if (rs.length < 4) {
    // Relax luminance filter if region was very bright/dark
    for (let y = y0; y < y1; y += stride) {
      for (let x = x0; x < x1; x += stride) {
        const idx = (y * w + x) * 4;
        rs.push(rgba[idx]);
        gs.push(rgba[idx + 1]);
        bs.push(rgba[idx + 2]);
      }
    }
  }

  if (rs.length === 0) {
    return opts?.fallback ?? { r: 205, g: 200, b: 192 };
  }

  rs.sort((a, b) => a - b);
  gs.sort((a, b) => a - b);
  bs.sort((a, b) => a - b);
  const mid = Math.floor(rs.length / 2);
  return { r: rs[mid], g: gs[mid], b: bs[mid] };
}

function sampleBoxColors(
  rgba: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  fallbackPrimary: string,
  fallbackSecondary: string
): { primaryColor: string; secondaryColor: string } {
  // Sample inner 62% of box to avoid background bleed around object edges
  const padX = boxW * 0.19;
  const padY = boxH * 0.19;
  const x0 = clamp(Math.floor((boxX + padX) * w), 0, w - 1);
  const x1 = clamp(Math.ceil((boxX + boxW - padX) * w), x0 + 1, w);
  const y0 = clamp(Math.floor((boxY + padY) * h), 0, h - 1);
  const y1 = clamp(Math.ceil((boxY + boxH - padY) * h), y0 + 1, h);

  const pixels: RGB[] = [];
  const stepX = Math.max(1, Math.floor((x1 - x0) / 14));
  const stepY = Math.max(1, Math.floor((y1 - y0) / 14));

  for (let y = y0; y < y1; y += stepY) {
    for (let x = x0; x < x1; x += stepX) {
      const idx = (y * w + x) * 4;
      pixels.push({ r: rgba[idx], g: rgba[idx + 1], b: rgba[idx + 2] });
    }
  }

  if (pixels.length < 4) {
    return { primaryColor: fallbackPrimary, secondaryColor: fallbackSecondary };
  }

  // Primary color = median RGB of inner box
  const rs = pixels.map((p) => p.r).sort((a, b) => a - b);
  const gs = pixels.map((p) => p.g).sort((a, b) => a - b);
  const bs = pixels.map((p) => p.b).sort((a, b) => a - b);
  const mid = Math.floor(pixels.length / 2);
  const primary: RGB = { r: rs[mid], g: gs[mid], b: bs[mid] };

  // Secondary color = average of pixels most distinct from primary (legs, cushions, frame, trim)
  const sortedByDist = pixels
    .map((p) => ({ p, d: rgbDistance(p, primary) }))
    .sort((a, b) => b.d - a.d);

  const topCount = Math.max(2, Math.floor(sortedByDist.length * 0.2));
  let sr = 0;
  let sg = 0;
  let sb = 0;
  for (let i = 0; i < topCount; i++) {
    sr += sortedByDist[i].p.r;
    sg += sortedByDist[i].p.g;
    sb += sortedByDist[i].p.b;
  }
  const secondaryCandidate: RGB = {
    r: sr / topCount,
    g: sg / topCount,
    b: sb / topCount,
  };

  const secondary =
    rgbDistance(primary, secondaryCandidate) >= 20
      ? secondaryCandidate
      : rgbLuminance(primary) > 125
        ? adjustRgb(primary, 0.62)
        : adjustRgb(primary, 1.38);

  return {
    primaryColor: rgbToHex(primary),
    secondaryColor: rgbToHex(secondary),
  };
}

/**
 * Samples ceiling, wall, accent wall, floor, and trim colors directly from the
 * AR-segmented room planes, and classifies floor material + ambient lighting mood.
 */
export function sampleRoomPaletteAndMaterials(
  rgba: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
  markers: ARMarkerState
): SurfacePalette {
  const ceilY = clamp(markers.ceilingY, 0.08, 0.42);
  const floorY = clamp(markers.floorY, 0.56, 0.9);
  const leftX = clamp(markers.leftCornerX, 0.14, 0.4);
  const rightX = clamp(markers.rightCornerX, 0.6, 0.86);

  const ceilingRgb = sampleTrimmedMedianRgb(rgba, w, h, 0.12, 0.02, 0.88, Math.max(0.07, ceilY - 0.02), {
    minLum: 35,
    maxLum: 245,
    fallback: { r: 236, g: 234, b: 228 },
  });

  const wallBandTop = clamp(ceilY + 0.04, 0.12, floorY - 0.18);
  const wallBandBot = clamp(floorY - 0.14, wallBandTop + 0.08, floorY - 0.04);

  const centerWallRgb = sampleTrimmedMedianRgb(rgba, w, h, leftX + 0.03, wallBandTop, rightX - 0.03, wallBandBot, {
    minLum: 28,
    maxLum: 228,
    fallback: { r: 214, g: 210, b: 202 },
  });

  const leftWallRgb = sampleTrimmedMedianRgb(rgba, w, h, 0.03, wallBandTop, Math.max(0.1, leftX - 0.01), wallBandBot, {
    minLum: 24,
    maxLum: 228,
    fallback: centerWallRgb,
  });

  const rightWallRgb = sampleTrimmedMedianRgb(
    rgba,
    w,
    h,
    Math.min(0.9, rightX + 0.01),
    wallBandTop,
    0.97,
    wallBandBot,
    {
      minLum: 24,
      maxLum: 228,
      fallback: centerWallRgb,
    }
  );

  const leftDiff = rgbDistance(leftWallRgb, centerWallRgb);
  const rightDiff = rgbDistance(rightWallRgb, centerWallRgb);
  let accentWallRgb = centerWallRgb;
  if (Math.max(leftDiff, rightDiff) >= 24) {
    accentWallRgb = leftDiff >= rightDiff ? leftWallRgb : rightWallRgb;
  }

  const floorTop = clamp(floorY + 0.04, 0.6, 0.9);
  const floorRgb = sampleTrimmedMedianRgb(rgba, w, h, 0.1, floorTop, 0.9, 0.97, {
    minLum: 16,
    maxLum: 242,
    fallback: { r: 185, g: 153, b: 118 },
  });

  const trimSample = sampleTrimmedMedianRgb(
    rgba,
    w,
    h,
    0.18,
    clamp(floorY - 0.035, 0.45, 0.88),
    0.82,
    clamp(floorY + 0.008, 0.5, 0.92),
    {
      minLum: 30,
      maxLum: 248,
      fallback: blendRgb(centerWallRgb, { r: 238, g: 235, b: 228 }, 0.45),
    }
  );

  // Measure floor texture gradients (horizontal vs vertical) to distinguish wood planks, tile, carpet, concrete
  const fx0 = clamp(Math.floor(0.14 * w), 1, w - 2);
  const fx1 = clamp(Math.floor(0.86 * w), fx0 + 2, w - 1);
  const fy0 = clamp(Math.floor(floorTop * h), 1, h - 2);
  const fy1 = clamp(Math.floor(0.95 * h), fy0 + 2, h - 1);

  let sumGx = 0;
  let sumGy = 0;
  let strongEdges = 0;
  let sampleCount = 0;

  for (let y = fy0; y < fy1; y += 2) {
    for (let x = fx0; x < fx1; x += 2) {
      const i = (y * w + x) * 4;
      const iL = (y * w + (x - 1)) * 4;
      const iR = (y * w + (x + 1)) * 4;
      const iU = ((y - 1) * w + x) * 4;
      const iD = ((y + 1) * w + x) * 4;
      const lumL = 0.299 * rgba[iL] + 0.587 * rgba[iL + 1] + 0.114 * rgba[iL + 2];
      const lumR = 0.299 * rgba[iR] + 0.587 * rgba[iR + 1] + 0.114 * rgba[iR + 2];
      const lumU = 0.299 * rgba[iU] + 0.587 * rgba[iU + 1] + 0.114 * rgba[iU + 2];
      const lumD = 0.299 * rgba[iD] + 0.587 * rgba[iD + 1] + 0.114 * rgba[iD + 2];
      const gx = Math.abs(lumR - lumL);
      const gy = Math.abs(lumD - lumU);
      sumGx += gx;
      sumGy += gy;
      if (gx > 18 || gy > 18) strongEdges += 1;
      sampleCount += 1;
      void i;
    }
  }

  const meanGx = sampleCount > 0 ? sumGx / sampleCount : 0;
  const meanGy = sampleCount > 0 ? sumGy / sampleCount : 0;
  const strongEdgeRatio = sampleCount > 0 ? strongEdges / sampleCount : 0;

  const floorLum = rgbLuminance(floorRgb);
  const floorWarmth = floorRgb.r - floorRgb.b;
  const floorSat = rgbSaturation(floorRgb);

  let floorMaterial: RoomReplicaFloorMaterial = 'wood-light';
  if (floorWarmth >= 16 && floorSat >= 0.14) {
    floorMaterial = floorLum >= 120 ? 'wood-light' : 'wood-dark';
  } else if (strongEdgeRatio >= 0.085 && Math.min(meanGx, meanGy) > 4.5) {
    floorMaterial = 'tile';
  } else if (floorSat < 0.09 && meanGx < 6 && meanGy < 6) {
    floorMaterial = floorLum > 165 ? 'tile' : 'concrete';
  } else if (meanGx + meanGy >= 7 && strongEdgeRatio < 0.08) {
    floorMaterial = 'carpet';
  } else {
    floorMaterial = floorLum >= 120 ? 'wood-light' : 'wood-dark';
  }

  // Lighting mood from global luminance & color temperature
  const globalRgb = sampleTrimmedMedianRgb(rgba, w, h, 0.08, 0.08, 0.92, 0.92, {
    stride: 3,
    fallback: centerWallRgb,
  });
  const globalLum = rgbLuminance(globalRgb);
  const globalWarmth = globalRgb.r - globalRgb.b;
  let lightingMood: RoomReplicaLightingMood = 'neutral';
  if (globalLum < 86) {
    lightingMood = 'dim';
  } else if (globalWarmth >= 16) {
    lightingMood = 'warm';
  } else if (globalWarmth <= -10) {
    lightingMood = 'cool';
  } else {
    lightingMood = 'neutral';
  }

  return {
    ceilingColor: rgbToHex(ceilingRgb),
    wallColor: rgbToHex(centerWallRgb),
    accentWallColor: rgbToHex(accentWallRgb),
    floorColor: rgbToHex(floorRgb),
    trimColor: rgbToHex(trimSample),
    floorMaterial,
    lightingMood,
    wallRgb: centerWallRgb,
    leftWallRgb,
    rightWallRgb,
    floorRgb,
  };
}

/**
 * Projects a normalized image bounding box into 3D room coordinates using
 * the calibrated AR camera frustum, pinhole ground-plane ray intersection, & wall bounds.
 */
function projectBoxToRoomCoords(
  box: { x: number; y: number; w: number; h: number },
  input: LocalRoomScanInput
): {
  roomX: number;
  roomZ: number;
  estWidthM: number;
  estHeightM: number;
  rotationDeg: number;
} {
  const { markers, roomWidthM, roomDepthM, ceilingHeightCm, distanceM } = input;
  const halfW = roomWidthM / 2;
  const halfD = roomDepthM / 2;
  const ceilM = ceilingHeightCm / 100;

  const uCenter = clamp(box.x + box.w / 2, 0.03, 0.97);
  const vBottom = clamp(box.y + box.h, 0.15, 0.98);
  const leftCornerX = clamp(markers.leftCornerX, 0.12, 0.42);
  const rightCornerX = clamp(markers.rightCornerX, 0.58, 0.88);
  const floorY = clamp(markers.floorY, 0.56, 0.9);
  const ceilY = clamp(markers.ceilingY, 0.08, 0.44);

  // Horizontal projection: map [leftCornerX .. rightCornerX] across the back wall width
  const spanX = Math.max(0.25, rightCornerX - leftCornerX);
  const normX = (uCenter - 0.5) / (spanX * 0.52);
  let roomX = clamp(normX * (halfW * 0.88), -halfW + 0.25, halfW - 0.25);

  // Linear normalized floor depth progress
  const floorSpan = Math.max(0.12, 0.96 - floorY);
  const depthProgress = clamp((vBottom - (floorY - 0.04)) / floorSpan, 0, 1);
  const linearRoomZ = clamp(
    -halfD + 0.34 + depthProgress * Math.min(roomDepthM * 0.62, distanceM * 0.85),
    -halfD + 0.24,
    halfD - 0.36
  );

  // Refine depth & lateral X with pinhole ground-plane ray intersection when object base touches floor
  let roomZ = linearRoomZ;
  if (vBottom >= floorY - 0.02) {
    const floorHit = screenToFloorPoint3D(uCenter, vBottom, markers);
    const backHit = screenToFloorPoint3D(0.5, floorY, markers);
    if (floorHit && backHit) {
      const rayDzFromBack = Math.max(0, floorHit.z - backHit.z);
      const rayRoomZ = clamp(-halfD + 0.28 + rayDzFromBack, -halfD + 0.24, halfD - 0.36);
      roomZ = clamp(rayRoomZ * 0.65 + linearRoomZ * 0.35, -halfD + 0.24, halfD - 0.36);
      roomX = clamp(
        floorHit.x * 0.45 + roomX * 0.55,
        -halfW + 0.25,
        halfW - 0.25
      );
    }
  }

  // Metric width & height using vertical pixel span against AR ceiling-to-floor wall height
  const wallPixelSpan = Math.max(0.24, floorY - ceilY);
  const metersPerNormY = ceilM / wallPixelSpan;
  const depthScale = 1 - depthProgress * 0.26;
  const estHeightM = clamp(box.h * metersPerNormY * depthScale, 0.28, ceilM - 0.14);
  const estWidthM = clamp(
    (box.w / spanX) * roomWidthM * (0.85 * depthScale),
    0.32,
    Math.min(roomWidthM * 0.64, 2.4)
  );

  // Orient objects near left/right side walls inward; back-wall objects face +Z (0 deg)
  let rotationDeg = 0;
  if (uCenter < leftCornerX + 0.04) {
    rotationDeg = 90;
  } else if (uCenter > rightCornerX - 0.04) {
    rotationDeg = -90;
  }

  return { roomX, roomZ, estWidthM, estHeightM, rotationDeg };
}

function boxesOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  pad = 0
): boolean {
  return !(
    a.x + a.w + pad < b.x ||
    b.x + b.w + pad < a.x ||
    a.y + a.h + pad < b.y ||
    b.y + b.h + pad < a.y
  );
}

/**
 * Pure-pixel computer vision detector for architectural features (windows, doors/mirrors,
 * framed wall art, rugs/mats) and foreground furniture silhouettes (zero external API/network).
 */
function detectArchitecturalAndFallbackObjects(
  rgba: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
  palette: SurfacePalette,
  input: LocalRoomScanInput,
  coveredBoxes: Array<{ x: number; y: number; w: number; h: number }>,
  needFurnitureFallback: boolean
): DraftReplicaObject[] {
  const found: DraftReplicaObject[] = [];
  const { markers } = input;
  const ceilY = clamp(markers.ceilingY, 0.08, 0.42);
  const floorY = clamp(markers.floorY, 0.56, 0.9);
  const wallSpan = Math.max(0.24, floorY - ceilY);
  const wallLum = rgbLuminance(palette.wallRgb);

  // 1. WINDOW DETECTION: High-luminance, low-saturation rectangular regions in upper/mid wall
  const cols = 16;
  const rows = 8;
  const winTop = clamp(ceilY + wallSpan * 0.08, 0.1, floorY - 0.12);
  const winBot = clamp(floorY - wallSpan * 0.14, winTop + 0.12, floorY - 0.05);
  const brightGrid: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx0 = 0.05 + (c / cols) * 0.9;
      const cx1 = 0.05 + ((c + 1) / cols) * 0.9;
      const cy0 = winTop + (r / rows) * (winBot - winTop);
      const cy1 = winTop + ((r + 1) / rows) * (winBot - winTop);
      const rgb = sampleTrimmedMedianRgb(rgba, w, h, cx0, cy0, cx1, cy1, { stride: 1 });
      const lum = rgbLuminance(rgb);
      const sat = rgbSaturation(rgb);
      if (lum >= Math.max(226, wallLum + 30) && sat <= 0.3) {
        brightGrid[r][c] = true;
      }
    }
  }

  const visitedWin: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  let windowsAdded = 0;
  for (let r = 0; r < rows && windowsAdded < 2; r++) {
    for (let c = 0; c < cols && windowsAdded < 2; c++) {
      if (!brightGrid[r][c] || visitedWin[r][c]) continue;
      // Flood fill cluster
      const stack: Array<[number, number]> = [[r, c]];
      visitedWin[r][c] = true;
      let minR = r;
      let maxR = r;
      let minC = c;
      let maxC = c;
      let cells = 0;
      while (stack.length > 0) {
        const [cr, cc] = stack.pop()!;
        cells += 1;
        minR = Math.min(minR, cr);
        maxR = Math.max(maxR, cr);
        minC = Math.min(minC, cc);
        maxC = Math.max(maxC, cc);
        for (const [dr, dc] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && brightGrid[nr][nc] && !visitedWin[nr][nc]) {
            visitedWin[nr][nc] = true;
            stack.push([nr, nc]);
          }
        }
      }
      if (cells >= 4 && maxC - minC >= 1 && maxR - minR >= 1) {
        const bx = 0.05 + (minC / cols) * 0.9;
        const bw = ((maxC - minC + 1) / cols) * 0.9;
        const by = winTop + (minR / rows) * (winBot - winTop);
        const bh = ((maxR - minR + 1) / rows) * (winBot - winTop);

        // A real window is a bright pane framed by darker wall on (almost) all sides.
        // Large bright wall planes touching the image edge/ceiling are NOT windows.
        const innerLum = rgbLuminance(
          sampleTrimmedMedianRgb(rgba, w, h, bx, by, bx + bw, by + bh, { stride: 1 })
        );
        const ring = 0.035;
        const gap = 0.025; // skip the coarse grid-edge uncertainty before sampling the frame
        const sides: Array<[number, number, number, number]> = [
          [bx - gap - ring, by, bx - gap, by + bh],
          [bx + bw + gap, by, bx + bw + gap + ring, by + bh],
          [bx, by - gap - ring, bx + bw, by - gap],
          [bx, by + bh + gap, bx + bw, by + bh + gap + ring],
        ];
        let framedSides = 0;
        for (const [sx0, sy0, sx1, sy1] of sides) {
          if (sx0 < 0.01 || sy0 < 0.01 || sx1 > 0.99 || sy1 > 0.99) continue;
          const sideLum = rgbLuminance(sampleTrimmedMedianRgb(rgba, w, h, sx0, sy0, sx1, sy1, { stride: 1 }));
          if (sideLum <= innerLum - 24) framedSides += 1;
        }
        if (framedSides < 3 || bw > 0.42) continue;

        const proj = projectBoxToRoomCoords({ x: bx, y: by, w: bw, h: bh }, input);
        const isLeft = bx + bw / 2 < markers.leftCornerX;
        found.push({
          type: 'window',
          label: 'Daylight Window',
          x: isLeft ? -input.roomWidthM / 2 + 0.06 : proj.roomX,
          z: isLeft ? proj.roomZ : -input.roomDepthM / 2 + 0.06,
          widthM: clamp(proj.estWidthM, 0.8, 2.2),
          depthM: 0.1,
          heightM: clamp(proj.estHeightM, 0.85, 1.8),
          rotationDeg: isLeft ? 90 : 0,
          primaryColor: palette.trimColor,
          secondaryColor: '#b9d6f2',
          inferred: false,
          confidence: 0.86,
        });
        coveredBoxes.push({ x: bx, y: by, w: bw, h: bh });
        windowsAdded += 1;
      }
    }
  }

  // 2. (Removed) Pixel-only door/mirror synthesis: plain wall panels and shading were misread as doors.
  //    Doors/mirrors now come only from semantic detections, never from raw colour blobs.

  // 3. 2D CONNECTED-COMPONENT FOREGROUND FURNITURE DETECTOR (per-wall adaptive background + edge energy)
  if (needFurnitureFallback) {
    const bandTop = clamp(floorY - wallSpan * 0.62, ceilY + 0.05, floorY - 0.12);
    const bandBot = clamp(floorY + 0.16, floorY + 0.04, 0.95);
    const fCols = 24;
    const fRows = 12;
    const fgGrid: boolean[][] = Array.from({ length: fRows }, () => Array(fCols).fill(false));

    for (let r = 0; r < fRows; r++) {
      const cy0 = bandTop + (r / fRows) * (bandBot - bandTop);
      const cy1 = bandTop + ((r + 1) / fRows) * (bandBot - bandTop);
      const y0 = Math.max(1, Math.floor(cy0 * h));
      const y1 = Math.min(h - 1, Math.max(y0 + 1, Math.floor(cy1 * h)));

      for (let c = 0; c < fCols; c++) {
        const cx0 = 0.03 + (c / fCols) * 0.94;
        const cx1 = 0.03 + ((c + 1) / fCols) * 0.94;
        const cellBox = { x: cx0, y: cy0, w: cx1 - cx0, h: cy1 - cy0 };
        if (coveredBoxes.some((b) => boxesOverlap(cellBox, b, -0.01))) continue;

        const uMid = (cx0 + cx1) * 0.5;
        const rawSideBg =
          uMid < markers.leftCornerX
            ? palette.leftWallRgb
            : uMid > markers.rightCornerX
              ? palette.rightWallRgb
              : palette.wallRgb;
        const localWallBg =
          rgbDistance(rawSideBg, palette.wallRgb) > 65 ? palette.wallRgb : rawSideBg;

        const x0 = Math.max(1, Math.floor(cx0 * w));
        const x1 = Math.min(w - 1, Math.max(x0 + 1, Math.floor(cx1 * w)));
        let fgCount = 0;
        let total = 0;

        for (let y = y0; y < y1; y += 2) {
          const yNorm = y / h;
          const refBg = yNorm < floorY ? localWallBg : palette.floorRgb;
          for (let x = x0; x < x1; x += 2) {
            total += 1;
            const idx = (y * w + x) * 4;
            const px: RGB = { r: rgba[idx], g: rgba[idx + 1], b: rgba[idx + 2] };
            const distBg = rgbDistance(px, refBg);
            const idxR = (y * w + (x + 1)) * 4;
            const idxD = ((y + 1) * w + x) * 4;
            const edge =
              Math.abs(rgba[idxR] - px.r) +
              Math.abs(rgba[idxD] - px.r);
            if ((distBg >= 28 || (distBg >= 20 && edge >= 22)) && rgbLuminance(px) < 238) {
              fgCount += 1;
            }
          }
        }
        if (total > 0 && fgCount / total >= 0.34) {
          fgGrid[r][c] = true;
        }
      }
    }

    const visitedFg: boolean[][] = Array.from({ length: fRows }, () => Array(fCols).fill(false));
    const clusters: Array<{ bx: number; by: number; bw: number; bh: number; cells: number }> = [];
    for (let r = 0; r < fRows; r++) {
      for (let c = 0; c < fCols; c++) {
        if (!fgGrid[r][c] || visitedFg[r][c]) continue;
        const stack: Array<[number, number]> = [[r, c]];
        visitedFg[r][c] = true;
        let minR = r;
        let maxR = r;
        let minC = c;
        let maxC = c;
        let cells = 0;
        while (stack.length > 0) {
          const [cr, cc] = stack.pop()!;
          cells += 1;
          minR = Math.min(minR, cr);
          maxR = Math.max(maxR, cr);
          minC = Math.min(minC, cc);
          maxC = Math.max(maxC, cc);
          for (const [dr, dc] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const nr = cr + dr;
            const nc = cc + dc;
            if (
              nr >= 0 &&
              nr < fRows &&
              nc >= 0 &&
              nc < fCols &&
              fgGrid[nr][nc] &&
              !visitedFg[nr][nc]
            ) {
              visitedFg[nr][nc] = true;
              stack.push([nr, nc]);
            }
          }
        }
        const spanC = maxC - minC + 1;
        const spanR = maxR - minR + 1;
        if (cells >= 4 && spanC >= 2 && spanR >= 2 && spanC <= 14) {
          clusters.push({
            bx: 0.03 + (minC / fCols) * 0.94,
            by: bandTop + (minR / fRows) * (bandBot - bandTop),
            bw: (spanC / fCols) * 0.94,
            bh: (spanR / fRows) * (bandBot - bandTop),
            cells,
          });
        }
      }
    }

    clusters.sort((a, b) => b.cells - a.cells);
    let furnitureAdded = 0;
    for (const cl of clusters) {
      if (furnitureAdded >= 6) break;
      const candidateBox = { x: cl.bx, y: cl.by, w: cl.bw, h: cl.bh };
      if (coveredBoxes.some((b) => boxesOverlap(candidateBox, b, -0.02))) continue;

      // Measure green foliage ratio inside cluster for plant classification
      let greenHits = 0;
      let pxTotal = 0;
      const gx0 = clamp(Math.floor(cl.bx * w), 0, w - 1);
      const gx1 = clamp(Math.ceil((cl.bx + cl.bw) * w), gx0 + 1, w);
      const gy0 = clamp(Math.floor(cl.by * h), 0, h - 1);
      const gy1 = clamp(Math.ceil((cl.by + cl.bh) * h), gy0 + 1, h);
      for (let y = gy0; y < gy1; y += 2) {
        for (let x = gx0; x < gx1; x += 2) {
          const idx = (y * w + x) * 4;
          pxTotal += 1;
          if (rgba[idx + 1] > rgba[idx] + 10 && rgba[idx + 1] > rgba[idx + 2] + 10) {
            greenHits += 1;
          }
        }
      }
      const greenAvg = pxTotal > 0 ? greenHits / pxTotal : 0;

      const proj = projectBoxToRoomCoords(candidateBox, input);
      const colors = sampleBoxColors(rgba, w, h, cl.bx, cl.by, cl.bw, cl.bh, '#7a5c44', '#2e333c');

      let type: RoomReplicaObjectType = 'cabinet';
      let label = 'Storage Cabinet';
      let depthM = 0.5;
      if (greenAvg >= 0.14 && proj.estWidthM <= 1.15) {
        type = 'plant';
        label = 'Indoor Plant';
        depthM = 0.44;
      } else if (proj.estWidthM >= 1.75 && proj.estHeightM <= 1.05) {
        type = 'sofa';
        label = 'Room Sofa';
        depthM = 0.86;
      } else if (proj.estWidthM >= 0.95 && proj.estHeightM <= 1.35) {
        type = 'desk';
        label = 'Work Desk';
        depthM = 0.65;
      } else if (proj.estHeightM >= 1.42) {
        type = proj.estWidthM >= 1.0 ? 'wardrobe' : 'bookshelf';
        label = type === 'wardrobe' ? 'Wardrobe' : 'Bookshelf';
        depthM = type === 'wardrobe' ? 0.56 : 0.36;
      } else if (proj.estWidthM <= 0.78) {
        type = 'chair';
        label = 'Accent Chair';
        depthM = 0.54;
      } else {
        type = 'table';
        label = 'Side Table';
        depthM = 0.62;
      }

      found.push({
        type,
        label,
        x: proj.roomX,
        z: proj.roomZ,
        widthM: type === 'plant' ? clamp(proj.estWidthM, 0.38, 0.58) : clamp(proj.estWidthM, 0.4, 2.2),
        depthM,
        heightM:
          type === 'desk'
            ? clamp(proj.estHeightM, 0.72, 0.84)
            : clamp(proj.estHeightM, 0.45, 2.15),
        rotationDeg: proj.rotationDeg,
        primaryColor: type === 'plant' ? '#366942' : colors.primaryColor,
        secondaryColor: type === 'plant' ? '#c2a383' : colors.secondaryColor,
        inferred: false,
        confidence: 0.78,
      });
      coveredBoxes.push(candidateBox);
      furnitureAdded += 1;
    }
  }

  // 3. UPPER WALL ART DETECTION: Compact floating framed blocks strictly in the upper wall zone
  const artCols = 14;
  const artRows = 6;
  const wallDiffGrid: boolean[][] = Array.from({ length: artRows }, () => Array(artCols).fill(false));
  for (let r = 0; r < artRows; r++) {
    for (let c = 0; c < artCols; c++) {
      const cx0 = 0.05 + (c / artCols) * 0.9;
      const cx1 = 0.05 + ((c + 1) / artCols) * 0.9;
      const cy0 = ceilY + 0.05 + (r / artRows) * (wallSpan * 0.52);
      const cy1 = ceilY + 0.05 + ((r + 1) / artRows) * (wallSpan * 0.52);
      const cellBox = { x: cx0, y: cy0, w: cx1 - cx0, h: cy1 - cy0 };
      if (coveredBoxes.some((b) => boxesOverlap(cellBox, b, 0.02))) continue;
      const rgb = sampleTrimmedMedianRgb(rgba, w, h, cx0, cy0, cx1, cy1, { stride: 1 });
      if (rgbDistance(rgb, palette.wallRgb) >= 40) {
        wallDiffGrid[r][c] = true;
      }
    }
  }

  const visitedArt: boolean[][] = Array.from({ length: artRows }, () => Array(artCols).fill(false));
  let wallFeaturesAdded = 0;
  for (let r = 0; r < artRows && wallFeaturesAdded < 2; r++) {
    for (let c = 0; c < artCols && wallFeaturesAdded < 2; c++) {
      if (!wallDiffGrid[r][c] || visitedArt[r][c]) continue;
      const stack: Array<[number, number]> = [[r, c]];
      visitedArt[r][c] = true;
      let minR = r;
      let maxR = r;
      let minC = c;
      let maxC = c;
      let cells = 0;
      while (stack.length > 0) {
        const [cr, cc] = stack.pop()!;
        cells += 1;
        minR = Math.min(minR, cr);
        maxR = Math.max(maxR, cr);
        minC = Math.min(minC, cc);
        maxC = Math.max(maxC, cc);
        for (const [dr, dc] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (nr >= 0 && nr < artRows && nc >= 0 && nc < artCols && wallDiffGrid[nr][nc] && !visitedArt[nr][nc]) {
            visitedArt[nr][nc] = true;
            stack.push([nr, nc]);
          }
        }
      }
      const spanR = maxR - minR + 1;
      const spanC = maxC - minC + 1;
      // Only treat compact floating rectangles (not connected down into floor furniture) as wall art
      if (cells >= 3 && spanC <= 5 && spanR <= 4 && maxR < artRows - 1 && (spanC >= 2 || spanR >= 2)) {
        const bx = 0.05 + (minC / artCols) * 0.9;
        const bw = (spanC / artCols) * 0.9;
        const by = ceilY + 0.05 + (minR / artRows) * (wallSpan * 0.52);
        const bh = (spanR / artRows) * (wallSpan * 0.52);
        const proj = projectBoxToRoomCoords({ x: bx, y: by, w: bw, h: bh }, input);
        const colors = sampleBoxColors(rgba, w, h, bx, by, bw, bh, '#2b2d34', '#d8cfc0');
        const isLeft = bx + bw / 2 < markers.leftCornerX;
        found.push({
          type: 'wall-art',
          label: 'Framed Wall Art',
          x: isLeft ? -input.roomWidthM / 2 + 0.05 : proj.roomX,
          z: isLeft ? proj.roomZ : -input.roomDepthM / 2 + 0.05,
          widthM: clamp(proj.estWidthM, 0.55, 1.45),
          depthM: 0.04,
          heightM: clamp(proj.estHeightM, 0.55, 1.15),
          rotationDeg: isLeft ? 90 : 0,
          primaryColor: colors.primaryColor,
          secondaryColor: colors.secondaryColor,
          inferred: false,
          confidence: 0.78,
        });
        coveredBoxes.push({ x: bx, y: by, w: bw, h: bh });
        wallFeaturesAdded += 1;
      }
    }
  }

  // 4. FLOOR RUG / FITNESS MAT DETECTION: Distinct contrasting zone on the floor plane
  const rugCols = 10;
  const rugRows = 4;
  const rugTop = clamp(floorY + 0.05, 0.62, 0.88);
  const rugBot = 0.96;
  let rugCells = 0;
  let rugMinC = rugCols;
  let rugMaxC = -1;
  let rugMinR = rugRows;
  let rugMaxR = -1;
  for (let r = 0; r < rugRows; r++) {
    for (let c = 0; c < rugCols; c++) {
      const cx0 = 0.1 + (c / rugCols) * 0.8;
      const cx1 = 0.1 + ((c + 1) / rugCols) * 0.8;
      const cy0 = rugTop + (r / rugRows) * (rugBot - rugTop);
      const cy1 = rugTop + ((r + 1) / rugRows) * (rugBot - rugTop);
      const rgb = sampleTrimmedMedianRgb(rgba, w, h, cx0, cy0, cx1, cy1, { stride: 1 });
      if (rgbDistance(rgb, palette.floorRgb) >= 32) {
        rugCells += 1;
        rugMinC = Math.min(rugMinC, c);
        rugMaxC = Math.max(rugMaxC, c);
        rugMinR = Math.min(rugMinR, r);
        rugMaxR = Math.max(rugMaxR, r);
      }
    }
  }
  if (rugCells >= 4 && rugCells <= 22 && rugMaxC >= rugMinC) {
    const bx = 0.1 + (rugMinC / rugCols) * 0.8;
    const bw = ((rugMaxC - rugMinC + 1) / rugCols) * 0.8;
    const by = rugTop + (rugMinR / rugRows) * (rugBot - rugTop);
    const bh = ((rugMaxR - rugMinR + 1) / rugRows) * (rugBot - rugTop);

    // A rug is a compact patch that is clearly different from the plain floor around it.
    const rugRgb = sampleTrimmedMedianRgb(rgba, w, h, bx, by, bx + bw, by + bh, { stride: 1 });
    const rugDist = rgbDistance(rugRgb, palette.floorRgb);
    const compact = bw < 0.62 && rugCells / ((rugMaxC - rugMinC + 1) * (rugMaxR - rugMinR + 1)) >= 0.6;
    if (rugDist < 48 || !compact) return found;
    const proj = projectBoxToRoomCoords({ x: bx, y: by, w: bw, h: bh }, input);
    const colors = sampleBoxColors(rgba, w, h, bx, by, bw, bh, '#b7ab9a', '#6d655c');
    const isMat = bw / Math.max(0.05, bh) >= 3.2 && proj.estWidthM < 1.95;
    found.push({
      type: isMat ? 'fitness-mat' : 'rug',
      label: isMat ? 'Floor Mat' : 'Area Rug',
      x: proj.roomX,
      z: clamp(proj.roomZ, -input.roomDepthM * 0.34, input.roomDepthM * 0.34),
      widthM: isMat ? 1.75 : clamp(proj.estWidthM, 1.2, 2.3),
      depthM: isMat ? 0.68 : clamp(proj.estWidthM * 0.72, 0.9, 1.8),
      heightM: 0.02,
      rotationDeg: 0,
      primaryColor: colors.primaryColor,
      secondaryColor: colors.secondaryColor,
      inferred: false,
      confidence: 0.76,
    });
  }

  return found;
}

const COCO_FURNITURE_CLASSES = new Set([
  'chair',
  'couch',
  'bed',
  'dining table',
  'tv',
  'potted plant',
  'laptop',
  'keyboard',
  'mouse',
  'book',
  'bottle',
  'cup',
  'refrigerator',
  'oven',
  'microwave',
  'clock',
  'vase',
  'bench',
  // Open-vocabulary OWL-ViT indoor classes
  'desk',
  'wardrobe',
  'cabinet',
  'bookshelf',
  'door',
  'window',
  'mirror',
  'rug',
  'wall art',
]);

const DESK_CUE_CLASSES = new Set(['laptop', 'keyboard', 'mouse', 'bottle', 'cup']);

function computeBoxIoU(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): number {
  const xA = Math.max(a.x, b.x);
  const yA = Math.max(a.y, b.y);
  const xB = Math.min(a.x + a.w, b.x + b.w);
  const yB = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, xB - xA) * Math.max(0, yB - yA);
  if (inter <= 0) return 0;
  const areaA = a.w * a.h;
  const areaB = b.w * b.h;
  return inter / Math.max(1e-6, areaA + areaB - inter);
}

/**
 * Class-aware Non-Maximum Suppression that merges duplicate overlapping detections
 * across full-frame and overlapping side tiles, boosting consensus confidence when
 * confirmed in multiple scales/crops.
 */
export function mergeTiledDetectionsWithNMS(
  detections: RawObjectDetection[],
  iouThreshold = 0.45
): RawObjectDetection[] {
  const normalized = detections
    .map((d) => ({
      ...d,
      className: d.className.toLowerCase(),
      x: clamp(d.x, 0, 0.98),
      y: clamp(d.y, 0, 0.98),
      w: clamp(d.w, 0.02, 1),
      h: clamp(d.h, 0.02, 1),
    }))
    .sort((a, b) => b.score - a.score);

  const kept: RawObjectDetection[] = [];
  for (const det of normalized) {
    let mergedIntoExisting = false;
    for (let i = 0; i < kept.length; i++) {
      const k = kept[i];
      const sameFamily =
        k.className === det.className ||
        (DESK_CUE_CLASSES.has(k.className) && DESK_CUE_CLASSES.has(det.className));
      if (!sameFamily) continue;

      const iou = computeBoxIoU(k, det);
      if (iou >= iouThreshold) {
        // Multi-scale/multi-tile agreement boosts confidence!
        kept[i] = {
          ...k,
          score: Math.min(0.99, Math.max(k.score, det.score) + 0.06),
        };
        mergedIntoExisting = true;
        break;
      }
    }
    if (!mergedIntoExisting) {
      kept.push(det);
    }
  }
  return kept;
}

/**
 * Converts raw COCO-SSD detections into contextually upgraded 3D room furniture
 * objects with sampled real-world colors and metric room coordinates.
 */
function mapDetectionsToRoomObjects(
  detections: RawObjectDetection[],
  rgba: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
  input: LocalRoomScanInput
): {
  objects: DraftReplicaObject[];
  coveredBoxes: Array<{ x: number; y: number; w: number; h: number }>;
} {
  const valid = mergeTiledDetectionsWithNMS(
    detections.filter((d) => {
      const cls = d.className.toLowerCase();
      if (!COCO_FURNITURE_CLASSES.has(cls)) return false;
      const minGate =
        DESK_CUE_CLASSES.has(cls) || cls === 'book' || cls === 'clock' || cls === 'vase'
          ? 0.14
          : 0.18;
      return d.score >= minGate;
    })
  ).slice(0, 22).map((d) =>
    // A small "tv" low in frame is almost always a desk monitor -> model the workstation, not a TV console.
    d.className === 'tv' && d.w < 0.2 && d.y + d.h > 0.5 ? { ...d, className: 'laptop' } : d
  );

  const deskCueBoxes = valid.filter((d) => DESK_CUE_CLASSES.has(d.className));
  const tableBoxes = valid.filter((d) => d.className === 'dining table' || d.className === 'desk');
  const bookBoxes = valid.filter((d) => d.className === 'book');

  const objects: DraftReplicaObject[] = [];
  const coveredBoxes: Array<{ x: number; y: number; w: number; h: number }> = [];
  const coveredTableBoxes: Array<{ x: number; y: number; w: number; h: number }> = [];
  const consumedDeskCueIdx = new Set<number>();

  for (const det of valid) {
    if (det.className === 'book' || DESK_CUE_CLASSES.has(det.className)) {
      continue; // Handled contextually below
    }

    const proj = projectBoxToRoomCoords(det, input);
    let type: RoomReplicaObjectType = 'cabinet';
    let label = 'Cabinet';
    let widthM = proj.estWidthM;
    let depthM = 0.55;
    let heightM = proj.estHeightM;
    let fallbackPrimary = '#7a5c44';
    let fallbackSecondary = '#2c3038';

    switch (det.className) {
      case 'dining table': {
        // Check if a laptop/keyboard sits on or right above this table -> Work Desk!
        const hasDeskCue = deskCueBoxes.some((cue, idx) => {
          const overlapsX = cue.x + cue.w > det.x - 0.06 && cue.x < det.x + det.w + 0.06;
          const aboveOrOn = cue.y + cue.h >= det.y - 0.14 && cue.y <= det.y + det.h * 0.7;
          if (overlapsX && aboveOrOn) {
            consumedDeskCueIdx.add(idx);
            return true;
          }
          return false;
        });
        type = hasDeskCue ? 'desk' : 'table';
        label = hasDeskCue ? 'Work Desk' : 'Dining / Side Table';
        widthM = clamp(proj.estWidthM, 0.95, 2.0);
        depthM = hasDeskCue ? 0.65 : 0.78;
        heightM = clamp(proj.estHeightM, 0.68, 0.84);
        fallbackPrimary = '#8b6547';
        fallbackSecondary = '#2c3038';
        break;
      }
      case 'chair': {
        const nearDesk =
          deskCueBoxes.some((cue) => Math.abs((cue.x + cue.w / 2) - (det.x + det.w / 2)) < 0.24) ||
          tableBoxes.some((tb) => Math.abs((tb.x + tb.w / 2) - (det.x + det.w / 2)) < 0.24);
        type = nearDesk ? 'office-chair' : 'chair';
        label = nearDesk ? 'Office Chair' : 'Chair';
        widthM = clamp(proj.estWidthM, 0.48, 0.72);
        depthM = nearDesk ? 0.62 : 0.54;
        heightM = clamp(proj.estHeightM, 0.76, 1.12);
        fallbackPrimary = nearDesk ? '#2b2f38' : '#6e523a';
        fallbackSecondary = nearDesk ? '#525866' : '#c8bfb2';
        break;
      }
      case 'couch': {
        type = 'sofa';
        label = 'Sofa';
        widthM = clamp(proj.estWidthM, 1.45, 2.45);
        depthM = 0.88;
        heightM = clamp(proj.estHeightM, 0.72, 0.98);
        fallbackPrimary = '#5a6270';
        fallbackSecondary = '#c7b8a3';
        break;
      }
      case 'bed': {
        type = 'bed';
        label = 'Bed';
        widthM = clamp(proj.estWidthM, 1.35, 2.15);
        depthM = 2.0;
        heightM = clamp(proj.estHeightM, 0.52, 0.82);
        fallbackPrimary = '#d9d4cc';
        fallbackSecondary = '#6b7280';
        break;
      }
      case 'tv': {
        // If a laptop/keyboard is right below the TV/monitor, treat it as a desk monitor; otherwise TV stand
        const isMonitor = deskCueBoxes.some(
          (cue) =>
            Math.abs((cue.x + cue.w / 2) - (det.x + det.w / 2)) < 0.16 &&
            cue.y >= det.y + det.h * 0.4
        );
        if (isMonitor) {
          continue; // The desk synthesis below will model the full workstation cleanly
        }
        type = 'tv-stand';
        label = 'Media Console & TV';
        widthM = clamp(proj.estWidthM * 1.25, 1.1, 1.9);
        depthM = 0.42;
        heightM = clamp(proj.estHeightM, 0.52, 0.92);
        fallbackPrimary = '#383431';
        fallbackSecondary = '#14171f';
        break;
      }
      case 'potted plant': {
        type = 'plant';
        label = 'Potted Plant';
        widthM = clamp(proj.estWidthM, 0.34, 0.62);
        depthM = widthM;
        heightM = clamp(proj.estHeightM, 0.55, 1.55);
        fallbackPrimary = '#3d6b47';
        fallbackSecondary = '#c9b8a3';
        break;
      }
      case 'bench': {
        type = 'table';
        label = 'Studio Bench';
        widthM = clamp(proj.estWidthM, 0.9, 1.6);
        depthM = 0.45;
        heightM = 0.48;
        fallbackPrimary = '#8c6a4a';
        fallbackSecondary = '#2f343c';
        break;
      }
      case 'refrigerator':
      case 'oven':
      case 'microwave': {
        type = det.className === 'refrigerator' ? 'wardrobe' : 'cabinet';
        label = det.className === 'refrigerator' ? 'Tall Appliance / Unit' : 'Storage Cabinet';
        widthM = clamp(proj.estWidthM, 0.65, 1.15);
        depthM = 0.58;
        heightM = det.className === 'refrigerator' ? 1.85 : 0.92;
        fallbackPrimary = '#d4d0c8';
        fallbackSecondary = '#454852';
        break;
      }
      case 'clock': {
        type = 'wall-art';
        label = 'Wall Clock / Art';
        widthM = clamp(proj.estWidthM, 0.4, 0.85);
        depthM = 0.04;
        heightM = widthM;
        fallbackPrimary = '#2b2d34';
        fallbackSecondary = '#e5e0d6';
        break;
      }
      case 'vase': {
        type = 'lamp';
        label = 'Floor Lamp / Decor';
        widthM = 0.36;
        depthM = 0.36;
        heightM = clamp(proj.estHeightM, 0.9, 1.65);
        fallbackPrimary = '#2d3038';
        fallbackSecondary = '#f4e6cc';
        break;
      }
      case 'desk': {
        deskCueBoxes.forEach((cue, idx) => {
          if (Math.abs(cue.x + cue.w / 2 - (det.x + det.w / 2)) < 0.24) {
            consumedDeskCueIdx.add(idx);
          }
        });
        type = 'desk';
        label = 'Work Desk';
        widthM = clamp(proj.estWidthM, 1.0, 1.85);
        depthM = 0.65;
        heightM = clamp(proj.estHeightM, 0.7, 0.82);
        fallbackPrimary = '#8b6547';
        fallbackSecondary = '#2c3038';
        break;
      }
      case 'wardrobe': {
        type = 'wardrobe';
        label = 'Wardrobe / Cupboard';
        widthM = clamp(proj.estWidthM, 0.75, 1.85);
        depthM = 0.56;
        heightM = clamp(proj.estHeightM, 1.55, 2.25);
        fallbackPrimary = '#7a6855';
        fallbackSecondary = '#2f333b';
        break;
      }
      case 'cabinet': {
        const isOverhead = det.y + det.h < input.markers.floorY - 0.12;
        type = 'cabinet';
        label = isOverhead ? 'Wall Cupboard' : 'Storage Cabinet';
        widthM = clamp(proj.estWidthM, 0.7, 2.1);
        depthM = 0.45;
        heightM = clamp(proj.estHeightM, 0.65, 1.35);
        fallbackPrimary = '#76787d';
        fallbackSecondary = '#32363f';
        break;
      }
      case 'bookshelf': {
        type = 'bookshelf';
        label = 'Bookshelf / Shelving';
        widthM = clamp(proj.estWidthM, 0.75, 1.8);
        depthM = 0.36;
        heightM = clamp(proj.estHeightM, 1.1, 2.05);
        fallbackPrimary = '#8a6b4e';
        fallbackSecondary = '#343842';
        break;
      }
      case 'door': {
        type = 'door';
        label = 'Room Door';
        widthM = clamp(proj.estWidthM, 0.75, 1.2);
        depthM = 0.08;
        heightM = clamp(proj.estHeightM, 1.75, 2.2);
        fallbackPrimary = '#5c4d42';
        fallbackSecondary = '#8c8378';
        break;
      }
      case 'window': {
        type = 'window';
        label = 'Window';
        widthM = clamp(proj.estWidthM, 0.75, 2.2);
        depthM = 0.1;
        heightM = clamp(proj.estHeightM, 0.8, 1.8);
        fallbackPrimary = '#d8d4cc';
        fallbackSecondary = '#b9d6f2';
        break;
      }
      case 'mirror': {
        type = 'mirror';
        label = 'Wall Mirror';
        widthM = clamp(proj.estWidthM, 0.55, 1.35);
        depthM = 0.05;
        heightM = clamp(proj.estHeightM, 0.9, 1.95);
        fallbackPrimary = '#272a30';
        fallbackSecondary = '#cbd5e1';
        break;
      }
      case 'rug': {
        const isMat = det.w / Math.max(0.05, det.h) >= 2.8 && proj.estWidthM < 1.85;
        type = isMat ? 'fitness-mat' : 'rug';
        label = isMat ? 'Floor Mat' : 'Area Rug';
        widthM = isMat ? clamp(proj.estWidthM, 1.1, 1.8) : clamp(proj.estWidthM, 1.1, 2.4);
        depthM = isMat ? 0.68 : clamp(proj.estWidthM * 0.7, 0.8, 1.8);
        heightM = 0.02;
        fallbackPrimary = '#9e856d';
        fallbackSecondary = '#6d655c';
        break;
      }
      case 'wall art': {
        type = 'wall-art';
        label = 'Wall Art / Sign';
        widthM = clamp(proj.estWidthM, 0.45, 1.45);
        depthM = 0.04;
        heightM = clamp(proj.estHeightM, 0.4, 1.15);
        fallbackPrimary = '#2b2d34';
        fallbackSecondary = '#d8cfc0';
        break;
      }
      default:
        break;
    }

    const colors = sampleBoxColors(
      rgba,
      w,
      h,
      det.x,
      det.y,
      det.w,
      det.h,
      fallbackPrimary,
      fallbackSecondary
    );

    const isWallFixture =
      type === 'door' || type === 'window' || type === 'mirror' || type === 'wall-art';
    const isLeftWall = det.x + det.w / 2 < input.markers.leftCornerX;
    const objX = isWallFixture
      ? isLeftWall
        ? -input.roomWidthM / 2 + 0.05
        : proj.roomX
      : proj.roomX;
    const objZ = isWallFixture
      ? isLeftWall
        ? proj.roomZ
        : -input.roomDepthM / 2 + 0.05
      : type === 'rug' || type === 'fitness-mat'
        ? clamp(proj.roomZ, -input.roomDepthM * 0.34, input.roomDepthM * 0.34)
        : proj.roomZ;
    const objRot = isWallFixture ? (isLeftWall ? 90 : 0) : proj.rotationDeg;

    objects.push({
      type,
      label,
      x: objX,
      z: objZ,
      widthM,
      depthM,
      heightM,
      rotationDeg: objRot,
      primaryColor: colors.primaryColor,
      secondaryColor: colors.secondaryColor,
      inferred: false,
      confidence: clamp(det.score, 0.52, 0.98),
    });
    coveredBoxes.push({ x: det.x, y: det.y, w: det.w, h: det.h });
    if (type === 'desk' || type === 'table') {
      coveredTableBoxes.push({ x: det.x, y: det.y, w: det.w, h: det.h });
    }
  }

  // Synthesize a Work Desk beneath each distinct unconsumed laptop/keyboard/device cluster
  for (let i = 0; i < deskCueBoxes.length; i++) {
    if (consumedDeskCueIdx.has(i)) continue;
    const cue = deskCueBoxes[i];
    const cueCenterX = cue.x + cue.w / 2;

    // Group nearby cues on the same desk so one workstation produces one crisp desk
    consumedDeskCueIdx.add(i);
    for (let j = i + 1; j < deskCueBoxes.length; j++) {
      const otherCenterX = deskCueBoxes[j].x + deskCueBoxes[j].w / 2;
      if (Math.abs(otherCenterX - cueCenterX) < 0.22) {
        consumedDeskCueIdx.add(j);
      }
    }

    // Only synthesize from pure bottle/cup if paired with laptop/keyboard/mouse or multiple cues
    const isStrongCue =
      cue.className === 'laptop' || cue.className === 'keyboard' || cue.className === 'mouse';
    if (!isStrongCue) continue;

    // Expand downward to approximate the desk supporting the laptop/keyboard
    const deskBox = {
      x: clamp(cue.x - cue.w * 0.6, 0.04, 0.85),
      y: clamp(cue.y + cue.h * 0.4, 0.25, 0.82),
      w: clamp(cue.w * 2.2, 0.18, 0.44),
      h: clamp(Math.max(0.16, input.markers.floorY - (cue.y + cue.h * 0.4) + 0.04), 0.14, 0.35),
    };
    if (coveredTableBoxes.some((b) => boxesOverlap(deskBox, b, -0.03))) continue;

    const proj = projectBoxToRoomCoords(deskBox, input);
    const colors = sampleBoxColors(
      rgba,
      w,
      h,
      deskBox.x,
      deskBox.y,
      deskBox.w,
      deskBox.h,
      '#8b6547',
      '#2c3038'
    );
    objects.push({
      type: 'desk',
      label: 'Work Desk',
      x: proj.roomX,
      z: proj.roomZ,
      widthM: clamp(proj.estWidthM, 1.15, 1.65),
      depthM: 0.65,
      heightM: 0.75,
      rotationDeg: proj.rotationDeg,
      primaryColor: colors.primaryColor,
      secondaryColor: colors.secondaryColor,
      inferred: false,
      confidence: clamp(cue.score * 0.92, 0.55, 0.94),
    });
    coveredBoxes.push(deskBox);
    coveredTableBoxes.push(deskBox);
  }

  // If 2+ books detected close together, represent them cleanly as a Bookshelf
  if (bookBoxes.length >= 2) {
    const minX = Math.min(...bookBoxes.map((b) => b.x));
    const minY = Math.min(...bookBoxes.map((b) => b.y));
    const maxX = Math.max(...bookBoxes.map((b) => b.x + b.w));
    const maxY = Math.max(...bookBoxes.map((b) => b.y + b.h));
    const shelfBox = {
      x: minX,
      y: minY,
      w: Math.max(0.14, maxX - minX),
      h: Math.max(0.22, maxY - minY),
    };
    const proj = projectBoxToRoomCoords(shelfBox, input);
    const colors = sampleBoxColors(
      rgba,
      w,
      h,
      shelfBox.x,
      shelfBox.y,
      shelfBox.w,
      shelfBox.h,
      '#7a593d',
      '#353942'
    );
    objects.push({
      type: 'bookshelf',
      label: 'Bookshelf',
      x: proj.roomX,
      z: proj.roomZ,
      widthM: clamp(proj.estWidthM, 0.75, 1.2),
      depthM: 0.34,
      heightM: clamp(proj.estHeightM, 1.35, 1.95),
      rotationDeg: proj.rotationDeg,
      primaryColor: colors.primaryColor,
      secondaryColor: colors.secondaryColor,
      inferred: false,
      confidence: 0.8,
    });
    coveredBoxes.push(shelfBox);
  }

  return { objects, coveredBoxes };
}

function inferRoomType(objects: DraftReplicaObject[]): string {
  const types = new Set(objects.map((o) => o.type));
  if (types.has('bed')) return 'Bedroom';
  if (types.has('desk') || types.has('office-chair')) return 'Home Office';
  if (types.has('sofa') || types.has('tv-stand')) return 'Living Room';
  if (types.has('fitness-mat') || types.has('mirror')) return 'Home Studio';
  return 'Home Room';
}

/**
 * Extrapolates 3 to 5 realistic architectural & furniture completions for unseen areas
 * of the room, harmonized to the room's sampled palette and keeping the pole zone clear.
 */
function buildUnseenAreaCompletions(
  existing: DraftReplicaObject[],
  roomType: string,
  palette: SurfacePalette,
  input: LocalRoomScanInput
): DraftReplicaObject[] {
  const halfW = input.roomWidthM / 2;
  const halfD = input.roomDepthM / 2;
  const existingTypes = new Set(existing.map((o) => o.type));
  const completions: DraftReplicaObject[] = [];

  const isSpotFree = (x: number, z: number, minDist = 0.85): boolean => {
    // Keep central pole zone clear
    if (Math.hypot(x - input.poleOffsetXM, z) < 1.05) return false;
    for (const o of existing) {
      if (o.type === 'rug' || o.type === 'fitness-mat') continue;
      if (Math.hypot(o.x - x, o.z - z) < minDist) return false;
    }
    for (const o of completions) {
      if (o.type === 'rug' || o.type === 'fitness-mat') continue;
      if (Math.hypot(o.x - x, o.z - z) < minDist) return false;
    }
    return true;
  };

  // Harmonized accent colors derived from real floor & wall samples
  const woodAccent = palette.floorMaterial.startsWith('wood') ? palette.floorColor : '#8c694a';
  const trimAccent = palette.trimColor;

  // 1. Entry door on unseen left wall if no door detected
  if (!existingTypes.has('door')) {
    completions.push({
      type: 'door',
      label: 'Entry Door',
      x: -halfW + 0.05,
      z: clamp(halfD * 0.42, -halfD + 0.7, halfD - 0.65),
      widthM: 0.86,
      depthM: 0.08,
      heightM: 2.04,
      rotationDeg: 90,
      primaryColor: trimAccent,
      secondaryColor: '#6f6960',
      inferred: true,
      confidence: 0.76,
    });
  }

  // 2. Daylight window on back/left wall if none detected
  if (!existingTypes.has('window')) {
    completions.push({
      type: 'window',
      label: 'Side Window',
      x: -halfW + 0.06,
      z: clamp(-halfD * 0.25, -halfD + 0.85, halfD - 0.85),
      widthM: 1.25,
      depthM: 0.1,
      heightM: 1.32,
      rotationDeg: 90,
      primaryColor: trimAccent,
      secondaryColor: '#b9d6f2',
      inferred: true,
      confidence: 0.72,
    });
  }

  // 3. Room-type matched furniture completion in free back/side corner
  const cornerCandidates: Array<{ x: number; z: number; rot: number }> = [
    { x: halfW - 0.55, z: -halfD + 0.45, rot: 0 },
    { x: -halfW + 0.55, z: -halfD + 0.45, rot: 0 },
    { x: -halfW + 0.48, z: -halfD * 0.15, rot: 90 },
    { x: halfW - 0.5, z: halfD * 0.3, rot: -90 },
  ];

  const primaryAddon: {
    type: RoomReplicaObjectType;
    label: string;
    w: number;
    d: number;
    h: number;
    p: string;
    s: string;
  } =
    roomType === 'Home Office'
      ? {
          type: existingTypes.has('bookshelf') ? 'cabinet' : 'bookshelf',
          label: existingTypes.has('bookshelf') ? 'Storage Credenza' : 'Studio Bookshelf',
          w: 0.9,
          d: 0.36,
          h: 1.78,
          p: woodAccent,
          s: '#323640',
        }
      : roomType === 'Bedroom'
        ? {
            type: existingTypes.has('wardrobe') ? 'mirror' : 'wardrobe',
            label: existingTypes.has('wardrobe') ? 'Full-Length Mirror' : 'Closet Wardrobe',
            w: existingTypes.has('wardrobe') ? 0.78 : 1.1,
            d: existingTypes.has('wardrobe') ? 0.05 : 0.55,
            h: existingTypes.has('wardrobe') ? 1.76 : 2.0,
            p: trimAccent,
            s: '#474c57',
          }
        : roomType === 'Living Room'
          ? {
              type: existingTypes.has('bookshelf') ? 'cabinet' : 'bookshelf',
              label: existingTypes.has('bookshelf') ? 'Side Console' : 'Wall Shelving',
              w: 0.95,
              d: 0.36,
              h: 1.72,
              p: woodAccent,
              s: '#353942',
            }
          : {
              type: existingTypes.has('mirror') ? 'cabinet' : 'mirror',
              label: existingTypes.has('mirror') ? 'Gear Cabinet' : 'Practice Mirror',
              w: 0.95,
              d: 0.05,
              h: 1.82,
              p: '#262930',
              s: '#cbd5e1',
            };

  for (const spot of cornerCandidates) {
    if (isSpotFree(spot.x, spot.z, 0.8)) {
      completions.push({
        type: primaryAddon.type,
        label: primaryAddon.label,
        x: spot.x,
        z: spot.z,
        widthM: primaryAddon.w,
        depthM: primaryAddon.d,
        heightM: primaryAddon.h,
        rotationDeg: spot.rot,
        primaryColor: primaryAddon.p,
        secondaryColor: primaryAddon.s,
        inferred: true,
        confidence: 0.74,
      });
      break;
    }
  }

  // 4. Corner floor lamp or potted plant for natural depth cues
  const accentCorner = cornerCandidates.find((s) => isSpotFree(s.x, s.z, 0.75));
  if (accentCorner) {
    const addPlant = !existingTypes.has('plant');
    completions.push({
      type: addPlant ? 'plant' : 'lamp',
      label: addPlant ? 'Corner Plant' : 'Floor Lamp',
      x: accentCorner.x,
      z: accentCorner.z,
      widthM: addPlant ? 0.44 : 0.36,
      depthM: addPlant ? 0.44 : 0.36,
      heightM: addPlant ? 1.18 : 1.58,
      rotationDeg: 0,
      primaryColor: addPlant ? '#3f6e49' : '#2d3038',
      secondaryColor: addPlant ? '#c9b8a3' : '#f4e6cc',
      inferred: true,
      confidence: 0.71,
    });
  }

  // 5. Framed wall art if walls feel bare
  if (!existingTypes.has('wall-art') && completions.length < 5) {
    completions.push({
      type: 'wall-art',
      label: 'Framed Print',
      x: clamp(halfW * 0.38, -halfW + 0.65, halfW - 0.65),
      z: -halfD + 0.04,
      widthM: 0.78,
      depthM: 0.04,
      heightM: 0.92,
      rotationDeg: 0,
      primaryColor: '#2a2d35',
      secondaryColor: palette.accentWallColor !== palette.wallColor ? palette.accentWallColor : '#d8cfc0',
      inferred: true,
      confidence: 0.69,
    });
  }

  return completions.slice(0, 5);
}

/**
 * Pure, deterministic local room reconstruction engine: combines pixel-level surface/material
 * sampling, pure-CV architectural/silhouette detection, optional COCO-SSD object detections,
 * and unseen-area extrapolation into a validated 3D RoomReplicaScene (100% client-side, $0 API).
 */
export function reconstructRoomLocallyFromPixels(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  input: LocalRoomScanInput
): LocalRoomScanResult {
  const palette = sampleRoomPaletteAndMaterials(rgba, width, height, input.markers);
  const rawDetections = input.externalDetections ?? [];

  const { objects: cocoObjects, coveredBoxes } = mapDetectionsToRoomObjects(
    rawDetections,
    rgba,
    width,
    height,
    input
  );

  // Pixel-CV furniture silhouettes are only a fallback for when the semantic detector found
  // (almost) nothing; otherwise they add false objects (wall panels, shading, reflections).
  const cvObjects = detectArchitecturalAndFallbackObjects(
    rgba,
    width,
    height,
    palette,
    input,
    coveredBoxes,
    cocoObjects.length < 2
  );

  const visibleObjects = [...cocoObjects, ...cvObjects];
  const roomType = inferRoomType(visibleObjects);
  // Invented "unseen area" furniture is opt-in only: the replica must match what was actually seen.
  const unseenCompletions = input.includeUnseenCompletions
    ? buildUnseenAreaCompletions(visibleObjects, roomType, palette, input)
    : [];

  const allObjects = [...visibleObjects, ...unseenCompletions];
  const engine: LocalRoomScanResult['detectorEngine'] =
    rawDetections.length > 0 ? 'external+cv' : 'pixel-cv';

  const summary =
    visibleObjects.length > 0
      ? `On-device scan of ${input.roomWidthM.toFixed(1)}×${input.roomDepthM.toFixed(1)}m ${roomType.toLowerCase()} (${visibleObjects.length} detected, ${unseenCompletions.length} completed).`
      : `On-device ${input.roomWidthM.toFixed(1)}×${input.roomDepthM.toFixed(1)}m ${roomType.toLowerCase()} with sampled walls, floor & lighting.`;

  const scene = sanitizeRoomReplicaScene(
    {
      roomType,
      summary,
      floorMaterial: palette.floorMaterial,
      floorColor: palette.floorColor,
      wallColor: palette.wallColor,
      accentWallColor: palette.accentWallColor,
      ceilingColor: palette.ceilingColor,
      trimColor: palette.trimColor,
      lightingMood: palette.lightingMood,
      objects: allObjects,
    },
    {
      roomWidthM: input.roomWidthM,
      roomDepthM: input.roomDepthM,
      ceilingHeightCm: input.ceilingHeightCm,
      poleOffsetXM: input.poleOffsetXM,
      floorAccuracyPct: input.floorAccuracyPct,
      ceilingAccuracyPct: input.ceilingAccuracyPct,
      overallAccuracyPct: input.overallAccuracyPct,
      previewDataUrl: input.previewDataUrl,
    }
  );

  return {
    scene,
    detectorEngine: engine,
    rawDetectionCount: rawDetections.length,
  };
}

// ============================================================================
// LIGHTWEIGHT ON-DEVICE ROOM VISION SCANNER (SegFormer-B0 + Depth Anything V2)
// ============================================================================

/**
 * Silently warms up SegFormer-B0 (ADE20K room + furniture segmentation) and
 * Depth Anything V2 Small sequentially on AR entry.
 */
export function preloadLocalRoomModels(): void {
  if (typeof window === 'undefined') return;
  preloadRoomVisionModels();
}

/**
 * Full client-side browser scanner: decodes the captured camera frame or uploaded room photo,
 * runs lightweight SegFormer-B0 semantic segmentation + Depth Anything V2 Small depth estimation,
 * fits 3D oriented bounding boxes in calibrated room coordinates, and falls back to deterministic
 * pixel CV when offline.
 */
export async function scanRoomLocallyFromDataUrl(
  imageDataUrl: string,
  input: Omit<LocalRoomScanInput, 'externalDetections' | 'previewDataUrl'>,
  onStage?: (stageIndex: number) => void
): Promise<LocalRoomScanResult> {
  onStage?.(0);

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Could not decode captured room image.'));
    el.src = imageDataUrl;
  });

  const natW = Math.max(64, img.naturalWidth || 640);
  const natH = Math.max(64, img.naturalHeight || 480);

  // Canvas 1: Compact 512px canvas matching SegFormer-B0 & Depth Anything V2 optimal mobile resolution
  const detScale = Math.min(1, 512 / Math.max(natW, natH));
  const detW = Math.max(64, Math.round(natW * detScale));
  const detH = Math.max(64, Math.round(natH * detScale));
  const detCanvas = document.createElement('canvas');
  detCanvas.width = detW;
  detCanvas.height = detH;
  const detCtx = detCanvas.getContext('2d', { willReadFrequently: true });
  if (!detCtx) {
    throw new Error('Browser canvas unavailable to analyze room frame.');
  }
  detCtx.drawImage(img, 0, 0, detW, detH);
  const detDataUrl = detCanvas.toDataURL('image/jpeg', 0.88);
  const detRgba = detCtx.getImageData(0, 0, detW, detH).data;

  // Run lightweight SegFormer-B0 -> Depth Anything V2 Small sequentially
  const vision = await analyzeRoomWithVisionModels(detDataUrl, detW, detH, {
    timeoutMs: 28000,
    onStage: (stage) => {
      onStage?.(stage === 'segment' ? 0 : 1);
    },
  });

  if (vision) {
    onStage?.(2);
    const reconstructed = reconstructRoomFromVisionAnalysis(detRgba, detW, detH, vision, {
      ...input,
      previewDataUrl: imageDataUrl,
    });
    onStage?.(3);
    return reconstructed;
  }

  // Offline / model-unavailable fallback: deterministic pixel CV at 160x120
  onStage?.(1);
  const cvW = 160;
  const cvH = 120;
  const cvCanvas = document.createElement('canvas');
  cvCanvas.width = cvW;
  cvCanvas.height = cvH;
  const cvCtx = cvCanvas.getContext('2d', { willReadFrequently: true });
  if (!cvCtx) {
    throw new Error('Browser canvas unavailable to sample room surfaces.');
  }
  cvCtx.drawImage(img, 0, 0, cvW, cvH);
  const cvRgba = cvCtx.getImageData(0, 0, cvW, cvH).data;

  onStage?.(2);
  const fallback = reconstructRoomLocallyFromPixels(cvRgba, cvW, cvH, {
    ...input,
    previewDataUrl: imageDataUrl,
    externalDetections: [],
  });
  onStage?.(3);
  return fallback;
}

