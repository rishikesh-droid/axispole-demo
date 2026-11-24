import type {
  RoomReplicaFloorMaterial,
  RoomReplicaLightingMood,
  RoomReplicaObjectType,
  RoomReplicaScene,
} from '../types/pole';
import type { ARMarkerState } from './arMeasure';
import { screenToFloorPoint3D } from './arSurfaceCalibration';
import { sanitizeRoomReplicaScene } from './roomReplica';
import type { RoomVisionAnalysis, VisionSegment } from './roomVisionDetector';

export interface SpatialReconstructInput {
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
}

export interface SpatialDraftObject {
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

type SemanticCategory =
  | RoomReplicaObjectType
  | 'wall'
  | 'floor'
  | 'ceiling'
  | 'monitor-cue'
  | 'ignore';

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface CalibratedPoint3D {
  /** Room-space X (+right, meters) */
  x: number;
  /** Room-space Y (+up from floor, meters) */
  y: number;
  /** Room-space Z (+toward camera/front, -toward back wall, meters) */
  z: number;
  /** Camera-space optical depth (meters) */
  camDepthM: number;
  u: number;
  v: number;
}

const MIN_FOOTPRINT_DEPTH_M: Partial<Record<RoomReplicaObjectType, number>> = {
  desk: 0.58,
  table: 0.62,
  sofa: 0.82,
  bed: 1.78,
  wardrobe: 0.54,
  cabinet: 0.42,
  bookshelf: 0.34,
  'tv-stand': 0.4,
  chair: 0.48,
  'office-chair': 0.56,
  plant: 0.36,
  lamp: 0.34,
};

const DEFAULT_FALLBACK_COLORS: Record<RoomReplicaObjectType, { p: string; s: string }> = {
  desk: { p: '#8b6547', s: '#2c3038' },
  chair: { p: '#6e523a', s: '#c8bfb2' },
  'office-chair': { p: '#2b2f38', s: '#525866' },
  table: { p: '#9c7450', s: '#3b3733' },
  sofa: { p: '#5a6270', s: '#c7b8a3' },
  bed: { p: '#d9d4cc', s: '#6b7280' },
  bookshelf: { p: '#7a593d', s: '#353942' },
  cabinet: { p: '#cfc8be', s: '#5e4c3d' },
  wardrobe: { p: '#7a6855', s: '#2f333b' },
  'tv-stand': { p: '#383431', s: '#14171f' },
  rug: { p: '#b7ab9a', s: '#6d655c' },
  plant: { p: '#3d6b47', s: '#c9b8a3' },
  lamp: { p: '#2d3038', s: '#f4e6cc' },
  window: { p: '#e6e2da', s: '#b9d6f2' },
  door: { p: '#5c4d42', s: '#8c8378' },
  mirror: { p: '#272a30', s: '#cbd5e1' },
  'wall-art': { p: '#2b2d34', s: '#d8cfc0' },
  'fitness-mat': { p: '#475569', s: '#334155' },
};

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
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function rgbLuminance(c: RGB): number {
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
}

function rgbSaturation(c: RGB): number {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  return max > 0 ? (max - min) / max : 0;
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

function percentileSorted(sorted: number[], frac: number): number {
  if (sorted.length === 0) return 0;
  const idx = clamp(Math.floor(frac * (sorted.length - 1)), 0, sorted.length - 1);
  return sorted[idx];
}

/**
 * Maps an ADE20K SegFormer label into AxisPole's structural or furniture category.
 */
export function mapAdeLabelToCategory(rawLabel: string): SemanticCategory {
  const l = rawLabel.toLowerCase().trim();
  if (l === 'wall') return 'wall';
  if (l === 'floor' || l === 'flooring') return 'floor';
  if (l === 'ceiling') return 'ceiling';
  if (l.includes('window') || l.includes('curtain') || l.includes('blind')) return 'window';
  if (l === 'door' || l.includes('doorway')) return 'door';
  if (l.includes('mirror')) return 'mirror';
  if (l.includes('painting') || l.includes('poster') || l.includes('clock')) return 'wall-art';
  if (l.includes('desk')) return 'desk';
  if (l.includes('swivel chair')) return 'office-chair';
  if (l.includes('chair') || l.includes('armchair') || l.includes('stool')) return 'chair';
  if (l.includes('coffee table') || l === 'table' || l.includes('dining table') || l.includes('bench') || l.includes('ottoman')) return 'table';
  if (l.includes('sofa') || l.includes('couch')) return 'sofa';
  if (l.includes('bed')) return 'bed';
  if (l.includes('wardrobe') || l.includes('closet')) return 'wardrobe';
  if (l.includes('cabinet') || l.includes('chest of drawers') || l.includes('sideboard') || l.includes('counter') || l.includes('refrigerator')) return 'cabinet';
  if (l.includes('bookcase') || l.includes('shelf')) return 'bookshelf';
  if (l.includes('television')) return 'tv-stand';
  if (l.includes('crt screen') || l.includes('monitor') || l.includes('computer') || l.includes('screen')) return 'monitor-cue';
  if (l.includes('rug') || l.includes('carpet')) return 'rug';
  if (l.includes('mat')) return 'fitness-mat';
  if (l.includes('plant') || l.includes('flower') || l.includes('palm') || l.includes('tree')) return 'plant';
  if (l.includes('lamp') || l.includes('sconce')) return 'lamp';
  return 'ignore';
}

/**
 * Computes camera optical-axis depth Z_cam (meters) of a floor-plane intersection
 * at normalized viewport coordinates (u, v).
 */
function floorPointCamDepthM(u: number, v: number, markers: ARMarkerState): number | null {
  const pt = screenToFloorPoint3D(u, v, markers);
  if (!pt) return null;

  // World vector from camera (0, cameraHeightM, 0) to floor point (pt.x, 0, pt.z)
  const ry = -markers.cameraHeightM;
  const rz = pt.z;
  const pitchRad = (markers.cameraPitchDeg * Math.PI) / 180;
  const cosP = Math.cos(-pitchRad);
  const sinP = Math.sin(-pitchRad);
  const cz = ry * sinP + rz * cosP;
  if (cz >= -0.25) return null;
  return -cz;
}

/**
 * Converts Depth Anything V2 relative inverse-depth (disparity) into metric camera depth (meters)
 * by anchoring against analytical floor-plane ray intersections + known room distance.
 */
export function calibrateDisparityMapToMeters(
  disparityMap: Float32Array,
  width: number,
  height: number,
  floorMask: Uint8Array | null,
  wallMask: Uint8Array | null,
  markers: ARMarkerState,
  distanceM: number
): Float32Array {
  const samples: Array<{ d: number; invZ: number }> = [];
  const strideX = Math.max(1, Math.floor(width / 28));
  const strideY = Math.max(1, Math.floor(height / 24));

  for (let y = Math.floor(height * 0.45); y < Math.floor(height * 0.94); y += strideY) {
    const v = (y + 0.5) / height;
    for (let x = Math.floor(width * 0.08); x < Math.floor(width * 0.92); x += strideX) {
      const idx = y * width + x;
      const isFloor = floorMask ? floorMask[idx] >= 128 : v >= markers.floorY + 0.03;
      if (!isFloor) continue;

      const u = (x + 0.5) / width;
      const camZ = floorPointCamDepthM(u, v, markers);
      const disp = disparityMap[idx];
      if (camZ && Number.isFinite(disp)) {
        samples.push({ d: disp, invZ: 1 / camZ });
      }
    }
  }

  // Add a strong wall-distance anchor from central wall pixels
  const wallDisps: number[] = [];
  for (let y = Math.floor(height * (markers.ceilingY + 0.08)); y < Math.floor(height * (markers.floorY - 0.08)); y += strideY) {
    for (let x = Math.floor(width * 0.3); x < Math.floor(width * 0.7); x += strideX) {
      const idx = y * width + x;
      if (!wallMask || wallMask[idx] >= 128) {
        const disp = disparityMap[idx];
        if (Number.isFinite(disp)) wallDisps.push(disp);
      }
    }
  }
  if (wallDisps.length > 0) {
    wallDisps.sort((a, b) => a - b);
    const wallMedDisp = percentileSorted(wallDisps, 0.5);
    const safeWallDist = clamp(distanceM, 1.3, 6.8);
    // Repeat lightly so wall anchor stabilizes sparse-floor rooms
    for (let k = 0; k < 4; k++) {
      samples.push({ d: wallMedDisp, invZ: 1 / safeWallDist });
    }
  }

  // Compute robust trimmed linear fit: invZ = a * d + b
  let a = 0;
  let b = 1 / clamp(distanceM, 1.4, 6.5);

  if (samples.length >= 6) {
    const fitOnce = (pts: Array<{ d: number; invZ: number }>) => {
      let sumD = 0;
      let sumY = 0;
      for (const p of pts) {
        sumD += p.d;
        sumY += p.invZ;
      }
      const meanD = sumD / pts.length;
      const meanY = sumY / pts.length;
      let num = 0;
      let den = 0;
      for (const p of pts) {
        const dd = p.d - meanD;
        num += dd * (p.invZ - meanY);
        den += dd * dd;
      }
      const slope = den > 1e-8 ? num / den : 0;
      const intercept = meanY - slope * meanD;
      return { slope, intercept };
    };

    const first = fitOnce(samples);
    if (first.slope > 1e-6) {
      // Trim worst 20% residuals (e.g. floor mask edge spillover) and refit
      const withRes = samples
        .map((p) => ({
          p,
          err: Math.abs(p.invZ - (first.slope * p.d + first.intercept)),
        }))
        .sort((x, y) => x.err - y.err);
      const keepN = Math.max(4, Math.floor(withRes.length * 0.8));
      const trimmed = withRes.slice(0, keepN).map((x) => x.p);
      const refined = fitOnce(trimmed);
      if (refined.slope > 1e-6) {
        a = refined.slope;
        b = refined.intercept;
      } else {
        a = first.slope;
        b = first.intercept;
      }
    }
  }

  // Fallback if floor samples had near-zero disparity variance
  if (a <= 1e-6) {
    const allDisps: number[] = [];
    for (let i = 0; i < disparityMap.length; i += Math.max(1, Math.floor(disparityMap.length / 400))) {
      if (Number.isFinite(disparityMap[i])) allDisps.push(disparityMap[i]);
    }
    allDisps.sort((x, y) => x - y);
    const dMin = percentileSorted(allDisps, 0.08);
    const dMax = percentileSorted(allDisps, 0.92);
    const span = Math.max(1e-4, dMax - dMin);
    const invFar = 1 / clamp(distanceM * 1.25, 2.0, 7.0);
    const invNear = 1 / clamp(distanceM * 0.42, 0.85, 2.2);
    a = (invNear - invFar) / span;
    b = invFar - a * dMin;
  }

  const out = new Float32Array(width * height);
  for (let i = 0; i < disparityMap.length; i++) {
    const invZ = a * disparityMap[i] + b;
    out[i] = clamp(1 / Math.max(0.1, invZ), 0.45, 9.5);
  }
  return out;
}

/**
 * Unprojects a single pixel (u, v) at camera-space optical depth camDepthM into
 * world coordinates relative to the camera's ground foot (0, 0, 0).
 */
function unprojectPixelWorld(
  u: number,
  v: number,
  camDepthM: number,
  markers: ARMarkerState
): { x: number; y: number; z: number } {
  const vfovRad = (markers.vfovDeg * Math.PI) / 180;
  const halfTanV = Math.tan(vfovRad / 2);
  const halfTanH = halfTanV * markers.aspect;

  const xc = (u - 0.5) * 2 * halfTanH * camDepthM;
  const yc = (0.5 - v) * 2 * halfTanV * camDepthM;
  const zc = -camDepthM;

  const pitchRad = (markers.cameraPitchDeg * Math.PI) / 180;
  const cosP = Math.cos(pitchRad);
  const sinP = Math.sin(pitchRad);

  return {
    x: xc,
    y: markers.cameraHeightM + (yc * cosP - zc * sinP),
    z: yc * sinP + zc * cosP,
  };
}

interface InstanceBlob {
  category: RoomReplicaObjectType | 'monitor-cue';
  score: number;
  pixels: Array<{ x: number; y: number; u: number; v: number }>;
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
}

/**
 * Splits a semantic SegFormer mask into separate object instances using
 * 2D connected components gated by relative depth continuity (so two chairs
 * at different depths or positions split cleanly into separate 3D objects).
 */
function extractDepthAwareInstances(
  mask: Uint8Array,
  srcW: number,
  srcH: number,
  depthMeters: Float32Array,
  category: RoomReplicaObjectType | 'monitor-cue',
  score: number
): InstanceBlob[] {
  const gw = 96;
  const gh = 72;
  const fg = new Uint8Array(gw * gh);
  const cellZ = new Float32Array(gw * gh);

  for (let gy = 0; gy < gh; gy++) {
    const sy = Math.min(srcH - 1, Math.floor(((gy + 0.5) / gh) * srcH));
    for (let gx = 0; gx < gw; gx++) {
      const sx = Math.min(srcW - 1, Math.floor(((gx + 0.5) / gw) * srcW));
      const idx = sy * srcW + sx;
      if (mask[idx] >= 128) {
        fg[gy * gw + gx] = 1;
        cellZ[gy * gw + gx] = depthMeters[idx];
      }
    }
  }

  const visited = new Uint8Array(gw * gh);
  const blobs: InstanceBlob[] = [];
  const minCells = category === 'monitor-cue' || category === 'lamp' ? 8 : 16;

  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const start = gy * gw + gx;
      if (!fg[start] || visited[start]) continue;

      const stack: number[] = [start];
      visited[start] = 1;
      const pixels: Array<{ x: number; y: number; u: number; v: number }> = [];
      let minGx = gx;
      let maxGx = gx;
      let minGy = gy;
      let maxGy = gy;

      while (stack.length > 0) {
        const cur = stack.pop()!;
        const cx = cur % gw;
        const cy = Math.floor(cur / gw);
        const cz = cellZ[cur];

        minGx = Math.min(minGx, cx);
        maxGx = Math.max(maxGx, cx);
        minGy = Math.min(minGy, cy);
        maxGy = Math.max(maxGy, cy);

        const u = (cx + 0.5) / gw;
        const v = (cy + 0.5) / gh;
        const sx = Math.min(srcW - 1, Math.floor(u * srcW));
        const sy = Math.min(srcH - 1, Math.floor(v * srcH));
        pixels.push({ x: sx, y: sy, u, v });

        const neighbors = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= gw || ny < 0 || ny >= gh) continue;
          const nIdx = ny * gw + nx;
          if (!fg[nIdx] || visited[nIdx]) continue;

          const nz = cellZ[nIdx];
          const relJump = Math.abs(nz - cz) / Math.max(0.4, Math.min(nz, cz));
          if (relJump <= 0.22) {
            visited[nIdx] = 1;
            stack.push(nIdx);
          }
        }
      }

      if (pixels.length < minCells) continue;

      blobs.push({
        category,
        score,
        pixels,
        minU: minGx / gw,
        maxU: (maxGx + 1) / gw,
        minV: minGy / gh,
        maxV: (maxGy + 1) / gh,
      });
    }
  }

  return blobs;
}

function sampleMaskColors(
  rgba: Uint8ClampedArray | Uint8Array,
  rgbaW: number,
  rgbaH: number,
  pixels: Array<{ u: number; v: number }>,
  fallbackPrimary: string,
  fallbackSecondary: string
): { primaryColor: string; secondaryColor: string } {
  if (pixels.length < 4) {
    return { primaryColor: fallbackPrimary, secondaryColor: fallbackSecondary };
  }

  const samples: RGB[] = [];
  const step = Math.max(1, Math.floor(pixels.length / 80));
  for (let i = 0; i < pixels.length; i += step) {
    const px = clamp(Math.floor(pixels[i].u * rgbaW), 0, rgbaW - 1);
    const py = clamp(Math.floor(pixels[i].v * rgbaH), 0, rgbaH - 1);
    const idx = (py * rgbaW + px) * 4;
    samples.push({ r: rgba[idx], g: rgba[idx + 1], b: rgba[idx + 2] });
  }

  if (samples.length < 3) {
    return { primaryColor: fallbackPrimary, secondaryColor: fallbackSecondary };
  }

  const rs = samples.map((c) => c.r).sort((a, b) => a - b);
  const gs = samples.map((c) => c.g).sort((a, b) => a - b);
  const bs = samples.map((c) => c.b).sort((a, b) => a - b);
  const mid = Math.floor(samples.length / 2);
  const primary: RGB = { r: rs[mid], g: gs[mid], b: bs[mid] };

  const byDist = samples
    .map((c) => ({ c, d: rgbDistance(c, primary) }))
    .sort((a, b) => b.d - a.d);
  const topN = Math.max(2, Math.floor(byDist.length * 0.2));
  let sr = 0;
  let sg = 0;
  let sb = 0;
  for (let i = 0; i < topN; i++) {
    sr += byDist[i].c.r;
    sg += byDist[i].c.g;
    sb += byDist[i].c.b;
  }
  const cand: RGB = { r: sr / topN, g: sg / topN, b: sb / topN };
  const secondary =
    rgbDistance(primary, cand) >= 20
      ? cand
      : rgbLuminance(primary) > 125
        ? adjustRgb(primary, 0.62)
        : adjustRgb(primary, 1.38);

  return { primaryColor: rgbToHex(primary), secondaryColor: rgbToHex(secondary) };
}

function samplePaletteFromMasks(
  rgba: Uint8ClampedArray | Uint8Array,
  rgbaW: number,
  rgbaH: number,
  vision: RoomVisionAnalysis,
  markers: ARMarkerState
): {
  ceilingColor: string;
  wallColor: string;
  accentWallColor: string;
  floorColor: string;
  trimColor: string;
  floorMaterial: RoomReplicaFloorMaterial;
  lightingMood: RoomReplicaLightingMood;
  rugCoversWholeFloor: boolean;
} {
  const { width: vw, height: vh, segments } = vision;
  const wallSeg = segments.find((s) => mapAdeLabelToCategory(s.label) === 'wall');
  const floorSeg = segments.find((s) => mapAdeLabelToCategory(s.label) === 'floor');
  const ceilingSeg = segments.find((s) => mapAdeLabelToCategory(s.label) === 'ceiling');
  const rugSeg = segments.find((s) => mapAdeLabelToCategory(s.label) === 'rug');

  const sampleFromMask = (
    mask: Uint8Array | undefined,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    fallback: RGB
  ): RGB[] => {
    const out: RGB[] = [];
    const xStart = clamp(Math.floor(u0 * rgbaW), 0, rgbaW - 1);
    const xEnd = clamp(Math.ceil(u1 * rgbaW), xStart + 1, rgbaW);
    const yStart = clamp(Math.floor(v0 * rgbaH), 0, rgbaH - 1);
    const yEnd = clamp(Math.ceil(v1 * rgbaH), yStart + 1, rgbaH);

    for (let y = yStart; y < yEnd; y += 2) {
      const my = Math.min(vh - 1, Math.floor((y / rgbaH) * vh));
      for (let x = xStart; x < xEnd; x += 2) {
        const mx = Math.min(vw - 1, Math.floor((x / rgbaW) * vw));
        if (mask && mask[my * vw + mx] < 128) continue;
        const idx = (y * rgbaW + x) * 4;
        out.push({ r: rgba[idx], g: rgba[idx + 1], b: rgba[idx + 2] });
      }
    }
    if (out.length < 4 && mask) {
      return sampleFromMask(undefined, u0, v0, u1, v1, fallback);
    }
    return out.length > 0 ? out : [fallback];
  };

  const medianRgb = (arr: RGB[]): RGB => {
    const rs = arr.map((c) => c.r).sort((a, b) => a - b);
    const gs = arr.map((c) => c.g).sort((a, b) => a - b);
    const bs = arr.map((c) => c.b).sort((a, b) => a - b);
    const m = Math.floor(arr.length / 2);
    return { r: rs[m], g: gs[m], b: bs[m] };
  };

  const ceilRgb = medianRgb(
    sampleFromMask(ceilingSeg?.mask, 0.12, 0.02, 0.88, Math.max(0.08, markers.ceilingY), {
      r: 236,
      g: 234,
      b: 228,
    })
  );
  const centerWallRgb = medianRgb(
    sampleFromMask(
      wallSeg?.mask,
      markers.leftCornerX + 0.02,
      markers.ceilingY + 0.04,
      markers.rightCornerX - 0.02,
      markers.floorY - 0.06,
      { r: 214, g: 210, b: 202 }
    )
  );
  const leftWallRgb = medianRgb(
    sampleFromMask(
      wallSeg?.mask,
      0.02,
      markers.ceilingY + 0.04,
      Math.max(0.1, markers.leftCornerX),
      markers.floorY - 0.06,
      centerWallRgb
    )
  );
  const rightWallRgb = medianRgb(
    sampleFromMask(
      wallSeg?.mask,
      Math.min(0.9, markers.rightCornerX),
      markers.ceilingY + 0.04,
      0.98,
      markers.floorY - 0.06,
      centerWallRgb
    )
  );

  const leftDiff = rgbDistance(leftWallRgb, centerWallRgb);
  const rightDiff = rgbDistance(rightWallRgb, centerWallRgb);
  const accentWallRgb =
    Math.max(leftDiff, rightDiff) >= 22
      ? leftDiff >= rightDiff
        ? leftWallRgb
        : rightWallRgb
      : centerWallRgb;

  // Check if carpet/rug covers most of the floor
  let floorPx = 0;
  let rugPx = 0;
  if (floorSeg || rugSeg) {
    for (let i = 0; i < vw * vh; i += 4) {
      if (floorSeg && floorSeg.mask[i] >= 128) floorPx += 1;
      if (rugSeg && rugSeg.mask[i] >= 128) rugPx += 1;
    }
  }
  const rugCoversWholeFloor = rugPx > 0 && rugPx >= Math.max(40, (floorPx + rugPx) * 0.65);

  const floorSamples = sampleFromMask(
    rugCoversWholeFloor ? rugSeg?.mask : floorSeg?.mask,
    0.08,
    Math.max(0.55, markers.floorY),
    0.92,
    0.97,
    { r: 185, g: 153, b: 118 }
  );
  const floorRgb = medianRgb(floorSamples);

  const floorLum = rgbLuminance(floorRgb);
  const floorWarmth = floorRgb.r - floorRgb.b;
  const floorSat = rgbSaturation(floorRgb);

  let floorMaterial: RoomReplicaFloorMaterial = 'wood-light';
  if (rugCoversWholeFloor) {
    floorMaterial = 'carpet';
  } else if (floorWarmth >= 16 && floorSat >= 0.14) {
    floorMaterial = floorLum >= 120 ? 'wood-light' : 'wood-dark';
  } else if (floorSat < 0.09) {
    floorMaterial = floorLum > 165 ? 'tile' : 'concrete';
  } else {
    floorMaterial = floorLum >= 120 ? 'wood-light' : 'wood-dark';
  }

  const allSamples = sampleFromMask(undefined, 0.08, 0.08, 0.92, 0.92, centerWallRgb);
  const globalRgb = medianRgb(allSamples);
  const globalLum = rgbLuminance(globalRgb);
  const globalWarmth = globalRgb.r - globalRgb.b;
  const lightingMood: RoomReplicaLightingMood =
    globalLum < 86
      ? 'dim'
      : globalWarmth >= 16
        ? 'warm'
        : globalWarmth <= -10
          ? 'cool'
          : 'neutral';

  const trimRgb = blendRgb(centerWallRgb, { r: 238, g: 235, b: 228 }, 0.45);

  return {
    ceilingColor: rgbToHex(ceilRgb),
    wallColor: rgbToHex(centerWallRgb),
    accentWallColor: rgbToHex(accentWallRgb),
    floorColor: rgbToHex(floorRgb),
    trimColor: rgbToHex(trimRgb),
    floorMaterial,
    lightingMood,
    rugCoversWholeFloor,
  };
}

/**
 * Fits a 2D oriented bounding box (PCA on the XZ ground plane + vertical Y height)
 * to a cluster of calibrated 3D points, with front-surface depth compensation so
 * single-view furniture sits flush against walls at true metric size and position.
 */
function fitOriented3DBox(
  points: CalibratedPoint3D[],
  type: RoomReplicaObjectType,
  ceilingM: number,
  roomWidthM: number,
  roomDepthM: number
): {
  x: number;
  z: number;
  widthM: number;
  depthM: number;
  heightM: number;
  rotationDeg: number;
} {
  // Trim far/near depth outliers (removes wall bleed around chair legs & edges)
  const sortedByDepth = [...points].sort((a, b) => a.camDepthM - b.camDepthM);
  const i0 = Math.floor(sortedByDepth.length * 0.12);
  const i1 = Math.max(i0 + 3, Math.ceil(sortedByDepth.length * 0.82));
  const core = sortedByDepth.slice(i0, i1);

  let meanX = 0;
  let meanZ = 0;
  for (const p of core) {
    meanX += p.x;
    meanZ += p.z;
  }
  meanX /= core.length;
  meanZ /= core.length;

  // 2D PCA on (X, Z)
  let covXX = 0;
  let covXZ = 0;
  let covZZ = 0;
  for (const p of core) {
    const dx = p.x - meanX;
    const dz = p.z - meanZ;
    covXX += dx * dx;
    covXZ += dx * dz;
    covZZ += dz * dz;
  }

  let theta = 0.5 * Math.atan2(2 * covXZ, covXX - covZZ);
  // Snap near-axis furniture cleanly (±12° -> 0° / ±90°) while keeping genuinely angled desks!
  const deg = (theta * 180) / Math.PI;
  const snappedCardinals = [-90, 0, 90];
  for (const c of snappedCardinals) {
    if (Math.abs(deg - c) <= 12) {
      theta = (c * Math.PI) / 180;
      break;
    }
  }

  const ux = Math.cos(theta);
  const uz = Math.sin(theta);
  const vx = -uz;
  const vz = ux;

  const projU = core.map((p) => (p.x - meanX) * ux + (p.z - meanZ) * uz).sort((a, b) => a - b);
  const projV = core.map((p) => (p.x - meanX) * vx + (p.z - meanZ) * vz).sort((a, b) => a - b);
  const ys = core.map((p) => p.y).sort((a, b) => a - b);

  const uMin = percentileSorted(projU, 0.03);
  const uMax = percentileSorted(projU, 0.97);
  const vMin = percentileSorted(projV, 0.03);
  const vMax = percentileSorted(projV, 0.97);

  const spanU = Math.max(0.14, uMax - uMin);
  const spanV = Math.max(0.14, vMax - vMin);

  const centerU = (uMin + uMax) * 0.5;
  const centerV = (vMin + vMax) * 0.5;
  let cx = meanX + centerU * ux + centerV * vx;
  let cz = meanZ + centerU * uz + centerV * vz;

  // Determine which OBB axis is "width" (perpendicular to camera sightline) vs "depth" (along sightline)
  // Camera stands toward +Z looking toward -Z (back wall), so camera-to-object direction in XZ is roughly (cx, cz + roomDepthM/2 + 1)
  const rayX = cx;
  const rayZ = cz - roomDepthM * 0.65; // negative into scene
  const rayLen = Math.max(0.1, Math.hypot(rayX, rayZ));
  const rxN = rayX / rayLen;
  const rzN = rayZ / rayLen;

  const uAlignRay = Math.abs(ux * rxN + uz * rzN);
  const vAlignRay = Math.abs(vx * rxN + vz * rzN);

  let widthM: number;
  let depthM: number;
  let rotationRad: number;

  if (vAlignRay >= uAlignRay) {
    // Axis U is width (lateral), Axis V is depth
    widthM = spanU;
    depthM = spanV;
    rotationRad = Math.atan2(-uz, ux);
  } else {
    // Axis V is width, Axis U is depth
    widthM = spanV;
    depthM = spanU;
    rotationRad = Math.atan2(-vz, vx);
  }

  // Front-surface depth compensation: monocular camera only sees the front face of solid furniture,
  // so expand thin depth to realistic object depth and shift center away from camera so front edge stays pinned!
  const minDepth = MIN_FOOTPRINT_DEPTH_M[type];
  if (minDepth && depthM < minDepth) {
    const extraHalf = (minDepth - depthM) * 0.5;
    cx += rxN * extraHalf;
    cz += rzN * extraHalf;
    depthM = minDepth;
  }

  const isWallFixture =
    type === 'window' || type === 'door' || type === 'mirror' || type === 'wall-art';
  const yMin = percentileSorted(ys, 0.08);
  const yMax = percentileSorted(ys, 0.94);
  let heightM = isWallFixture
    ? Math.max(0.35, yMax - yMin)
    : Math.max(0.32, yMax - Math.min(0.12, Math.max(0, yMin)));

  if (type === 'rug' || type === 'fitness-mat') {
    heightM = 0.02;
  } else if (type === 'desk') {
    heightM = clamp(heightM, 0.68, 0.85);
    widthM = clamp(widthM, 0.85, Math.min(roomWidthM * 0.65, 2.2));
  } else if (type === 'sofa') {
    heightM = clamp(heightM, 0.72, 1.02);
    widthM = clamp(widthM, 1.25, Math.min(roomWidthM * 0.72, 2.5));
  } else if (type === 'bed') {
    heightM = clamp(heightM, 0.5, 0.95);
    widthM = clamp(widthM, 1.2, Math.min(roomWidthM * 0.7, 2.2));
  } else if (type === 'chair' || type === 'office-chair') {
    widthM = clamp(widthM, 0.45, 0.78);
    depthM = clamp(depthM, 0.45, 0.75);
    heightM = clamp(heightM, 0.72, 1.18);
  } else if (type === 'plant') {
    widthM = clamp(widthM, 0.34, 0.68);
    depthM = widthM;
    heightM = clamp(heightM, 0.48, 1.75);
  } else {
    widthM = clamp(widthM, 0.35, Math.min(roomWidthM * 0.68, 2.4));
    depthM = clamp(depthM, isWallFixture ? 0.04 : 0.3, Math.min(roomDepthM * 0.6, 2.2));
    heightM = clamp(heightM, 0.35, ceilingM - 0.12);
  }

  let rotationDeg = Math.round((rotationRad * 180) / Math.PI);
  // Normalize to [-90, 90] for symmetric furniture orientation facing into room
  while (rotationDeg > 90) rotationDeg -= 180;
  while (rotationDeg < -90) rotationDeg += 180;

  return {
    x: Number(cx.toFixed(2)),
    z: Number(cz.toFixed(2)),
    widthM: Number(widthM.toFixed(2)),
    depthM: Number(depthM.toFixed(2)),
    heightM: Number(heightM.toFixed(2)),
    rotationDeg,
  };
}

/**
 * Reconstructs a metric 3D RoomReplicaScene directly from SegFormer-B0 ADE20K masks +
 * Depth Anything V2 Small disparity map + AR camera calibration markers.
 */
export function reconstructRoomFromVisionAnalysis(
  rgba: Uint8ClampedArray | Uint8Array,
  rgbaW: number,
  rgbaH: number,
  vision: RoomVisionAnalysis,
  input: SpatialReconstructInput
): { scene: RoomReplicaScene; detectorEngine: 'segformer+depth-v2+cv'; rawDetectionCount: number } {
  const { width: vw, height: vh, segments, disparityMap } = vision;
  const { markers, roomWidthM, roomDepthM, ceilingHeightCm, distanceM } = input;
  const ceilingM = ceilingHeightCm / 100;

  const wallSeg = segments.find((s) => mapAdeLabelToCategory(s.label) === 'wall');
  const floorSeg = segments.find((s) => mapAdeLabelToCategory(s.label) === 'floor');

  // 1. Calibrate relative disparity into metric camera depth (meters)
  const depthMeters = calibrateDisparityMapToMeters(
    disparityMap,
    vw,
    vh,
    floorSeg?.mask ?? null,
    wallSeg?.mask ?? null,
    markers,
    distanceM
  );

  // 2. Find back wall world Z & room center X offset to map camera world -> studio room frame
  const wallWorldZs: number[] = [];
  const wallWorldXs: number[] = [];
  const stepX = Math.max(1, Math.floor(vw / 24));
  const stepY = Math.max(1, Math.floor(vh / 18));

  for (let y = Math.floor(vh * (markers.ceilingY + 0.06)); y < Math.floor(vh * (markers.floorY - 0.06)); y += stepY) {
    const v = (y + 0.5) / vh;
    for (let x = Math.floor(vw * 0.1); x < Math.floor(vw * 0.9); x += stepX) {
      const idx = y * vw + x;
      if (wallSeg && wallSeg.mask[idx] < 128) continue;
      const u = (x + 0.5) / vw;
      const wPt = unprojectPixelWorld(u, v, depthMeters[idx], markers);
      wallWorldZs.push(wPt.z);
      wallWorldXs.push(wPt.x);
    }
  }

  let backWallZWorld = -distanceM;
  if (wallWorldZs.length >= 4) {
    wallWorldZs.sort((a, b) => a - b); // most negative = farthest back wall
    backWallZWorld = percentileSorted(wallWorldZs, 0.22);
  }

  let centerXOffset = 0;
  if (wallWorldXs.length >= 8) {
    wallWorldXs.sort((a, b) => a - b);
    const minWX = percentileSorted(wallWorldXs, 0.05);
    const maxWX = percentileSorted(wallWorldXs, 0.95);
    // Only shift room center if both wall extremes are asymmetrically framed
    const midWX = (minWX + maxWX) * 0.5;
    if (Math.abs(midWX) > 0.25 && maxWX - minWX >= roomWidthM * 0.65) {
      centerXOffset = midWX;
    }
  }

  const toRoomPoint = (u: number, v: number, camDepthM: number): CalibratedPoint3D => {
    const wp = unprojectPixelWorld(u, v, camDepthM, markers);
    return {
      x: wp.x - centerXOffset,
      y: wp.y,
      z: wp.z - backWallZWorld - roomDepthM / 2,
      camDepthM,
      u,
      v,
    };
  };

  // 3. Sample room surface palette & floor material directly from segmented masks
  const palette = samplePaletteFromMasks(rgba, rgbaW, rgbaH, vision, markers);

  // 4. Split semantic masks into depth-aware instances & fit 3D OBBs
  const allBlobs: InstanceBlob[] = [];
  for (const seg of segments) {
    const cat = mapAdeLabelToCategory(seg.label);
    if (cat === 'wall' || cat === 'floor' || cat === 'ceiling' || cat === 'ignore') continue;
    if (cat === 'rug' && palette.rugCoversWholeFloor) continue;

    const blobs = extractDepthAwareInstances(seg.mask, vw, vh, depthMeters, cat, seg.score);
    for (const b of blobs) {
      // Ignore ceiling-mounted pendant/chandelier lamps when expecting floor/table lamps
      if (cat === 'lamp' && b.maxV < markers.floorY - 0.16) continue;
      allBlobs.push(b);
    }
  }

  const monitorCues: Array<{
    blob: InstanceBlob;
    box: ReturnType<typeof fitOriented3DBox>;
  }> = [];
  const rawObjects: Array<{
    draft: SpatialDraftObject;
    blob: InstanceBlob;
  }> = [];

  for (const blob of allBlobs) {
    const pts: CalibratedPoint3D[] = [];
    const stride = Math.max(1, Math.floor(blob.pixels.length / 260));
    for (let i = 0; i < blob.pixels.length; i += stride) {
      const p = blob.pixels[i];
      const idx = p.y * vw + p.x;
      pts.push(toRoomPoint(p.u, p.v, depthMeters[idx]));
    }
    if (pts.length < 4) continue;

    if (blob.category === 'monitor-cue') {
      const box = fitOriented3DBox(pts, 'desk', ceilingM, roomWidthM, roomDepthM);
      monitorCues.push({ blob, box });
      continue;
    }

    const type = blob.category;
    const box = fitOriented3DBox(pts, type, ceilingM, roomWidthM, roomDepthM);
    const fb = DEFAULT_FALLBACK_COLORS[type];
    const colors = sampleMaskColors(rgba, rgbaW, rgbaH, blob.pixels, fb.p, fb.s);

    const prettyLabel: Record<RoomReplicaObjectType, string> = {
      desk: 'Work Desk',
      chair: 'Accent Chair',
      'office-chair': 'Office Chair',
      table: 'Table',
      sofa: 'Sofa',
      bed: 'Bed',
      bookshelf: 'Bookshelf',
      cabinet: 'Storage Cabinet',
      wardrobe: 'Wardrobe',
      'tv-stand': 'Media Console & TV',
      rug: 'Area Rug',
      plant: 'Potted Plant',
      lamp: 'Floor Lamp',
      window: 'Window',
      door: 'Room Door',
      mirror: 'Wall Mirror',
      'wall-art': 'Framed Wall Art',
      'fitness-mat': 'Floor Mat',
    };

    rawObjects.push({
      blob,
      draft: {
        type,
        label: prettyLabel[type],
        x: box.x,
        z: box.z,
        widthM: box.widthM,
        depthM: box.depthM,
        heightM: box.heightM,
        rotationDeg: box.rotationDeg,
        primaryColor: colors.primaryColor,
        secondaryColor: colors.secondaryColor,
        inferred: false,
        confidence: clamp(blob.score, 0.55, 0.98),
      },
    });
  }

  // 5. Contextual upgrades in 3D space:
  //    - Table near/beneath a monitor cue -> Work Desk
  //    - Unpaired monitor cue -> synthesize Work Desk at that 3D spot
  //    - Chair within 1.15m of a desk -> Office Chair
  const consumedMonitors = new Set<number>();
  for (const item of rawObjects) {
    if (item.draft.type === 'table') {
      const hasMonitor = monitorCues.some((m, idx) => {
        const horizOverlap =
          m.blob.maxU > item.blob.minU - 0.06 && m.blob.minU < item.blob.maxU + 0.06;
        const nearIn3D = Math.hypot(m.box.x - item.draft.x, m.box.z - item.draft.z) <= 1.25;
        if (horizOverlap && nearIn3D) {
          consumedMonitors.add(idx);
          return true;
        }
        return false;
      });
      if (hasMonitor) {
        item.draft.type = 'desk';
        item.draft.label = 'Work Desk';
        item.draft.widthM = Number(
          clamp(item.draft.widthM, 0.85, Math.min(roomWidthM * 0.65, 2.2)).toFixed(2)
        );
        item.draft.depthM = Number(Math.max(0.58, item.draft.depthM).toFixed(2));
        item.draft.heightM = Number(clamp(item.draft.heightM, 0.68, 0.85).toFixed(2));
      }
    }
  }

  monitorCues.forEach((m, idx) => {
    if (consumedMonitors.has(idx)) return;
    const nearbyDesk = rawObjects.some(
      (o) =>
        o.draft.type === 'desk' &&
        Math.hypot(o.draft.x - m.box.x, o.draft.z - m.box.z) <= 1.1
    );
    if (nearbyDesk) return;

    const fb = DEFAULT_FALLBACK_COLORS.desk;
    const colors = sampleMaskColors(rgba, rgbaW, rgbaH, m.blob.pixels, fb.p, fb.s);
    rawObjects.push({
      blob: m.blob,
      draft: {
        type: 'desk',
        label: 'Work Desk',
        x: m.box.x,
        z: m.box.z,
        widthM: clamp(m.box.widthM * 1.45, 1.05, 1.75),
        depthM: 0.65,
        heightM: 0.75,
        rotationDeg: m.box.rotationDeg,
        primaryColor: colors.primaryColor,
        secondaryColor: colors.secondaryColor,
        inferred: false,
        confidence: clamp(m.blob.score * 0.92, 0.58, 0.94),
      },
    });
  });

  const edgeGapXZ = (
    ax: number,
    az: number,
    aw: number,
    ad: number,
    bx: number,
    bz: number,
    bw: number,
    bd: number,
    bRotDeg: number
  ) => {
    const rad = (bRotDeg * Math.PI) / 180;
    const bHalfX = Math.abs(Math.cos(rad)) * (bw * 0.5) + Math.abs(Math.sin(rad)) * (bd * 0.5);
    const bHalfZ = Math.abs(Math.sin(rad)) * (bw * 0.5) + Math.abs(Math.cos(rad)) * (bd * 0.5);
    const gapX = Math.max(0, Math.abs(ax - bx) - (aw * 0.5 + bHalfX));
    const gapZ = Math.max(0, Math.abs(az - bz) - (ad * 0.5 + bHalfZ));
    return Math.hypot(gapX, gapZ);
  };

  const desks = rawObjects.filter((o) => o.draft.type === 'desk');
  for (const item of rawObjects) {
    if (item.draft.type === 'chair') {
      const nearDesk = desks.some(
        (d) =>
          edgeGapXZ(
            item.draft.x,
            item.draft.z,
            item.draft.widthM,
            item.draft.depthM,
            d.draft.x,
            d.draft.z,
            d.draft.widthM,
            d.draft.depthM,
            d.draft.rotationDeg
          ) <= 0.65
      );
      if (nearDesk) {
        item.draft.type = 'office-chair';
        item.draft.label = 'Office Chair';
      }
    }
  }

  const objects = rawObjects.map((r) => r.draft);
  const types = new Set(objects.map((o) => o.type));
  const roomType = types.has('bed')
    ? 'Bedroom'
    : types.has('desk') || types.has('office-chair')
      ? 'Home Office'
      : types.has('sofa') || types.has('tv-stand')
        ? 'Living Room'
        : types.has('fitness-mat') || types.has('mirror')
          ? 'Home Studio'
          : 'Home Room';

  const summary =
    objects.length > 0
      ? `3D depth + segmentation scan of ${roomWidthM.toFixed(1)}×${roomDepthM.toFixed(1)}m ${roomType.toLowerCase()} (${objects.length} objects placed).`
      : `3D depth scan of ${roomWidthM.toFixed(1)}×${roomDepthM.toFixed(1)}m ${roomType.toLowerCase()} with sampled walls, floor & lighting.`;

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
      objects,
    },
    {
      roomWidthM,
      roomDepthM,
      ceilingHeightCm,
      poleOffsetXM: input.poleOffsetXM,
      floorAccuracyPct: input.floorAccuracyPct,
      ceilingAccuracyPct: input.ceilingAccuracyPct,
      overallAccuracyPct: input.overallAccuracyPct,
      previewDataUrl: input.previewDataUrl,
    }
  );

  return {
    scene,
    detectorEngine: 'segformer+depth-v2+cv',
    rawDetectionCount: allBlobs.length,
  };
}
