import type {
  RoomArchitecturalFeatureType,
  RoomReplicaFloorMaterial,
  RoomReplicaLightingMood,
  RoomReplicaObjectType,
  RoomReplicaScene,
} from '../types/pole';
import { calculateARMeasurement, clampARMarkers, type ARMarkerState } from './arMeasure';
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
  userAdjustedCeiling?: boolean;
  userAdjustedFloor?: boolean;
}

export interface SpatialDraftObject {
  type: RoomReplicaObjectType;
  label: string;
  x: number;
  z: number;
  widthM: number;
  depthM: number;
  heightM: number;
  elevationM?: number;
  rotationDeg: number;
  primaryColor: string;
  secondaryColor: string;
  inferred: boolean;
  confidence: number;
  variant?: string;
  hasMonitor?: boolean;
  bayCount?: number;
  doorCount?: number;
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
  if (l.includes('desk') || l === 'booth') return 'desk';
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

  // Sample per-row clear floor medians strictly below the floor junction (avoids under-desk shadows!)
  const floorStartFrac = clamp(markers.floorY + 0.02, 0.56, 0.88);
  for (let y = Math.floor(height * floorStartFrac); y < Math.floor(height * 0.96); y += strideY) {
    const v = (y + 0.5) / height;
    const rowDisps: number[] = [];
    const rowInvZs: number[] = [];
    for (let x = Math.floor(width * 0.08); x < Math.floor(width * 0.92); x += strideX) {
      const idx = y * width + x;
      const isFloor = floorMask ? floorMask[idx] >= 128 : v >= floorStartFrac;
      if (!isFloor) continue;

      const u = (x + 0.5) / width;
      const camZ = floorPointCamDepthM(u, v, markers);
      const disp = disparityMap[idx];
      if (camZ && Number.isFinite(disp)) {
        rowDisps.push(disp);
        rowInvZs.push(1 / camZ);
      }
    }
    if (rowDisps.length >= 3) {
      rowDisps.sort((a, b) => a - b);
      rowInvZs.sort((a, b) => a - b);
      const medD = percentileSorted(rowDisps, 0.5);
      const medInvZ = percentileSorted(rowInvZs, 0.5);
      samples.push({ d: medD, invZ: medInvZ });
    }
  }

  // Add a strong modal back-wall anchor (filtered against doorway recesses & foreground pillars)
  const wallDisps: number[] = [];
  const wallU0 = Math.max(0.08, markers.leftCornerX);
  const wallU1 = Math.min(0.92, markers.rightCornerX);
  const wallV0 = clamp(markers.ceilingY + 0.04, 0.12, 0.55);
  const wallV1 = clamp(markers.floorY - 0.12, wallV0 + 0.08, 0.8);
  for (let y = Math.floor(height * wallV0); y < Math.floor(height * wallV1); y += strideY) {
    for (let x = Math.floor(width * wallU0); x < Math.floor(width * wallU1); x += strideX) {
      const idx = y * width + x;
      if (!wallMask || wallMask[idx] >= 128) {
        const disp = disparityMap[idx];
        if (Number.isFinite(disp)) wallDisps.push(disp);
      }
    }
  }
  let wallModalDispOut = 0;
  if (wallDisps.length > 0) {
    wallDisps.sort((a, b) => a - b);
    const rawQ50 = percentileSorted(wallDisps, 0.5);
    // Filter out deep hallway recesses (< 0.62*q50) and foreground pillars (> 1.48*q50)
    const cleanWall = wallDisps.filter((d) => d >= rawQ50 * 0.62 && d <= rawQ50 * 1.48);
    const pool = cleanWall.length >= 4 ? cleanWall : wallDisps;
    // Modal cluster around densest window (width = 18% of range)
    let wallModalDisp = percentileSorted(pool, 0.45);
    if (pool.length >= 8) {
      const winHalf = Math.max(0.06, (pool[pool.length - 1] - pool[0]) * 0.12);
      let bestCount = 0;
      let bestSum = 0;
      for (let i = 0; i < pool.length; i += Math.max(1, Math.floor(pool.length / 24))) {
        const center = pool[i];
        let cnt = 0;
        let sum = 0;
        for (let j = 0; j < pool.length; j++) {
          if (Math.abs(pool[j] - center) <= winHalf) {
            cnt++;
            sum += pool[j];
          }
        }
        if (cnt > bestCount) {
          bestCount = cnt;
          bestSum = sum;
        }
      }
      if (bestCount >= 3) {
        wallModalDisp = bestSum / bestCount;
      }
    }
    wallModalDispOut = wallModalDisp;
    const safeWallDist = clamp(distanceM, 1.3, 6.8);
    // Stabilize affine curve with the back-wall anchor
    const repeats = Math.max(3, Math.min(5, Math.ceil(samples.length * 0.35)));
    for (let k = 0; k < repeats; k++) {
      samples.push({ d: wallModalDisp, invZ: 1 / safeWallDist });
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

  // Prevent affine shift bias from over-flattening wall/doorway/furniture depth relief
  const safeWallDist = clamp(distanceM, 1.3, 6.8);
  if (a > 1e-6 && wallModalDispOut > 0.15 && b > 0.52 / safeWallDist) {
    const aMin = (0.48 / safeWallDist) / wallModalDispOut;
    if (a < aMin) {
      a = aMin;
      b = 1 / safeWallDist - a * wallModalDispOut;
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
  leftWallColor?: string;
  upperWallColor?: string;
  accentWallColor: string;
  floorColor: string;
  groutColor?: string;
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

  // Measure orthogonal grout seam gradients in clear lower floor rows
  let floorGx = 0;
  let floorGy = 0;
  let floorEdgeN = 0;
  const fy0 = clamp(Math.floor(Math.max(0.7, markers.floorY + 0.04) * rgbaH), 1, rgbaH - 2);
  const fy1 = clamp(Math.floor(0.95 * rgbaH), fy0 + 2, rgbaH - 1);
  const fx0 = clamp(Math.floor(0.12 * rgbaW), 1, rgbaW - 2);
  const fx1 = clamp(Math.floor(0.88 * rgbaW), fx0 + 2, rgbaW - 1);
  for (let y = fy0; y < fy1; y += 2) {
    const my = Math.min(vh - 1, Math.floor((y / rgbaH) * vh));
    for (let x = fx0; x < fx1; x += 2) {
      const mx = Math.min(vw - 1, Math.floor((x / rgbaW) * vw));
      if (floorSeg && floorSeg.mask[my * vw + mx] < 128) continue;
      if (rugSeg && rugSeg.mask[my * vw + mx] >= 128) continue;
      const iL = (y * rgbaW + (x - 1)) * 4;
      const iR = (y * rgbaW + (x + 1)) * 4;
      const iU = ((y - 1) * rgbaW + x) * 4;
      const iD = ((y + 1) * rgbaW + x) * 4;
      const lL = 0.299 * rgba[iL] + 0.587 * rgba[iL + 1] + 0.114 * rgba[iL + 2];
      const lR = 0.299 * rgba[iR] + 0.587 * rgba[iR + 1] + 0.114 * rgba[iR + 2];
      const lU = 0.299 * rgba[iU] + 0.587 * rgba[iU + 1] + 0.114 * rgba[iU + 2];
      const lD = 0.299 * rgba[iD] + 0.587 * rgba[iD + 1] + 0.114 * rgba[iD + 2];
      floorGx += Math.abs(lR - lL);
      floorGy += Math.abs(lD - lU);
      floorEdgeN++;
    }
  }
  const avgFGx = floorEdgeN > 0 ? floorGx / floorEdgeN : 0;
  const avgFGy = floorEdgeN > 0 ? floorGy / floorEdgeN : 0;

  let floorMaterial: RoomReplicaFloorMaterial = 'wood-light';
  if (rugCoversWholeFloor) {
    floorMaterial = 'carpet';
  } else if (floorWarmth >= 17 && floorSat >= 0.15) {
    floorMaterial = floorLum >= 120 ? 'wood-light' : 'wood-dark';
  } else if (floorSat < 0.14 && floorWarmth < 18) {
    floorMaterial = floorLum >= 124 ? 'tile' : 'concrete';
  } else if (avgFGx >= 2.2 && avgFGy >= 2.2 && Math.min(avgFGx, avgFGy) / Math.max(0.5, Math.max(avgFGx, avgFGy)) >= 0.55 && floorLum >= 135 && floorSat < 0.18) {
    floorMaterial = 'tile';
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

  const upperWallRgb = medianRgb(
    sampleFromMask(
      wallSeg?.mask,
      markers.leftCornerX + 0.04,
      clamp(markers.ceilingY + 0.008, 0.08, 0.38),
      markers.rightCornerX - 0.04,
      clamp(markers.ceilingY + 0.085, 0.14, 0.44),
      centerWallRgb
    )
  );
  const upperDiff = rgbDistance(upperWallRgb, centerWallRgb);

  const trimRgb = blendRgb(centerWallRgb, { r: 238, g: 235, b: 228 }, 0.45);
  const groutRgb = adjustRgb(floorRgb, 0.78);

  return {
    ceilingColor: rgbToHex(ceilRgb),
    wallColor: rgbToHex(centerWallRgb),
    ...(leftDiff >= 18 ? { leftWallColor: rgbToHex(leftWallRgb) } : {}),
    ...(upperDiff >= 22 ? { upperWallColor: rgbToHex(upperWallRgb) } : {}),
    accentWallColor: rgbToHex(accentWallRgb),
    floorColor: rgbToHex(floorRgb),
    ...(floorMaterial === 'tile' ? { groutColor: rgbToHex(groutRgb) } : {}),
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
  // so expand thin depth to realistic object depth. For wall-anchored furniture (desks/sofas/cabinets),
  // shift center away from camera so the visible front edge stays pinned. For freestanding chairs
  // pulled out in front of a desk, preserve their forward Z so they never tuck backward into the desk!
  const minDepth = MIN_FOOTPRINT_DEPTH_M[type];
  if (minDepth && depthM < minDepth) {
    if (type !== 'chair' && type !== 'office-chair') {
      const extraHalf = (minDepth - depthM) * 0.5;
      cx += rxN * extraHalf;
      cz += rzN * extraHalf;
    }
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
    widthM = clamp(widthM, 0.85, Math.min(roomWidthM * 0.68, 2.35));
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
  const wallSeg = segments.find((s) => mapAdeLabelToCategory(s.label) === 'wall');
  const floorSeg = segments.find((s) => mapAdeLabelToCategory(s.label) === 'floor');

  const ceilingSeg = segments.find((s) => mapAdeLabelToCategory(s.label) === 'ceiling');

  // If live tracking collapsed ceilingHeightCm <= 238 and user did not manually drag the handle,
  // inspect Depth Anything V2's wall-to-ceiling transition + ceiling mask to recover the real ceiling height!
  let markers = input.markers;
  let roomWidthM = input.roomWidthM;
  let roomDepthM = input.roomDepthM;
  let ceilingHeightCm = input.ceilingHeightCm;
  let distanceM = input.distanceM;

  if (!input.userAdjustedCeiling && ceilingHeightCm <= 238) {
    const colDisps: number[] = [];
    for (let x = Math.floor(vw * 0.15); x < Math.floor(vw * 0.65); x += Math.max(1, Math.floor(vw / 18))) {
      for (let y = Math.floor(vh * 0.34); y < Math.floor(vh * 0.56); y += Math.max(1, Math.floor(vh / 16))) {
        const d = disparityMap[y * vw + x];
        if (Number.isFinite(d)) colDisps.push(d);
      }
    }
    if (colDisps.length >= 6) {
      colDisps.sort((a, b) => a - b);
      const midWallD = percentileSorted(colDisps, 0.5);
      // Scan upward from 0.36 toward 0.10 to find where wall meets overhead ceiling slope
      let recoveredCeilV = markers.ceilingY;
      for (let y = Math.floor(vh * 0.36); y >= Math.floor(vh * 0.10); y--) {
        let onWall = 0;
        let tot = 0;
        for (let x = Math.floor(vw * 0.18); x < Math.floor(vw * 0.62); x += Math.max(1, Math.floor(vw / 16))) {
          tot++;
          const d = disparityMap[y * vw + x];
          if (Math.abs(d - midWallD) <= Math.max(0.14, midWallD * 0.22)) onWall++;
        }
        if (tot > 0 && onWall / tot >= 0.45) {
          recoveredCeilV = y / vh;
        } else {
          break;
        }
      }
      // Also check SegFormer ceiling bottom transition in center room columns
      if (ceilingSeg) {
        let segCeilEndV = -1;
        for (let y = Math.floor(vh * 0.14); y < Math.floor(vh * 0.34); y++) {
          let ceilHits = 0;
          let tot = 0;
          for (let x = Math.floor(vw * 0.15); x < Math.floor(vw * 0.6); x += Math.max(1, Math.floor(vw / 16))) {
            tot++;
            if (ceilingSeg.mask[y * vw + x] >= 128) ceilHits++;
          }
          if (tot > 0 && ceilHits / tot < 0.45) {
            segCeilEndV = y / vh;
            break;
          }
        }
        if (segCeilEndV >= 0.15 && segCeilEndV <= 0.32) {
          recoveredCeilV = Math.max(recoveredCeilV, segCeilEndV);
        }
      }
      // Also detect true baseboard/floor start via floorSeg
      let recoveredFloorV = markers.floorY;
      if (floorSeg && !input.userAdjustedFloor) {
        for (let y = Math.floor(vh * 0.62); y < Math.floor(vh * 0.86); y++) {
          let floorHits = 0;
          let tot = 0;
          for (let x = Math.floor(vw * 0.12); x < Math.floor(vw * 0.75); x += Math.max(1, Math.floor(vw / 16))) {
            tot++;
            if (floorSeg.mask[y * vw + x] >= 128) floorHits++;
          }
          if (tot > 0 && floorHits / tot >= 0.55) {
            recoveredFloorV = y / vh;
            break;
          }
        }
      }
      const nextM = clampARMarkers({
        ...markers,
        ceilingY: recoveredCeilV < markers.ceilingY - 0.015 ? recoveredCeilV : markers.ceilingY,
        floorY: Math.max(markers.floorY, recoveredFloorV),
      });
      const refined = calculateARMeasurement(nextM);
      if (recoveredCeilV < markers.ceilingY - 0.015 || (markers.ceilingY <= 0.31 && ceilingHeightCm <= 228)) {
        markers = nextM;
        ceilingHeightCm = Math.max(245, refined.ceilingHeightCm);
        distanceM = Math.max(distanceM, refined.distanceM);
        roomWidthM = refined.roomWidthM;
        roomDepthM = refined.roomDepthM;
      }
    }
  }

  const ceilingM = ceilingHeightCm / 100;

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

  // 2. Find true modal back wall world Z (filtering out deep doorway recesses & foreground pillars)
  const wallWorldZs: number[] = [];
  const wallWorldXs: number[] = [];
  const stepX = Math.max(1, Math.floor(vw / 24));
  const stepY = Math.max(1, Math.floor(vh / 18));

  for (
    let y = Math.floor(vh * clamp(markers.ceilingY + 0.05, 0.1, 0.55));
    y < Math.floor(vh * clamp(markers.floorY - 0.08, 0.45, 0.82));
    y += stepY
  ) {
    const v = (y + 0.5) / vh;
    for (
      let x = Math.floor(vw * clamp(markers.leftCornerX, 0.06, 0.35));
      x < Math.floor(vw * clamp(markers.rightCornerX, 0.65, 0.94));
      x += stepX
    ) {
      const idx = y * vw + x;
      if (wallSeg && wallSeg.mask[idx] < 128) continue;
      const u = (x + 0.5) / vw;
      const wPt = unprojectPixelWorld(u, v, depthMeters[idx], markers);
      if (depthMeters[idx] <= distanceM * 1.48 && depthMeters[idx] >= distanceM * 0.58) {
        wallWorldZs.push(wPt.z);
        wallWorldXs.push(wPt.x);
      }
    }
  }

  let backWallZWorld = -distanceM;
  if (wallWorldZs.length >= 6) {
    const sortedZ = [...wallWorldZs].sort((a, b) => a - b);
    // Find densest ±0.28m cluster representing the flat physical back wall (never deep hallway void)
    let bestCnt = 0;
    let bestSum = 0;
    for (let i = 0; i < sortedZ.length; i++) {
      const c = sortedZ[i];
      let cnt = 0;
      let sum = 0;
      for (let j = 0; j < sortedZ.length; j++) {
        if (Math.abs(sortedZ[j] - c) <= 0.28) {
          cnt++;
          sum += sortedZ[j];
        }
      }
      if (cnt > bestCnt) {
        bestCnt = cnt;
        bestSum = sum;
      }
    }
    backWallZWorld = bestCnt >= 3 ? bestSum / bestCnt : percentileSorted(sortedZ, 0.45);
  }

  let centerXOffset = 0;
  if (wallWorldXs.length >= 8) {
    wallWorldXs.sort((a, b) => a - b);
    const minWX = percentileSorted(wallWorldXs, 0.05);
    const maxWX = percentileSorted(wallWorldXs, 0.95);
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
      if (cat === 'lamp' && b.maxV < markers.floorY - 0.16) continue;
      // Reject foreground doorframe chairs/blobs clipped right at screen corner edge
      if ((cat === 'chair' || cat === 'office-chair') && (b.maxU < 0.08 || b.minU > 0.92)) continue;
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

    // Refine flat floor mats / rugs directly on Y = 0 floor plane via pinhole ray intersection
    if ((type === 'rug' || type === 'fitness-mat') && blob.minV >= markers.floorY - 0.04) {
      const fLeft = screenToFloorPoint3D(blob.minU, (blob.minV + blob.maxV) * 0.5, markers);
      const fRight = screenToFloorPoint3D(blob.maxU, (blob.minV + blob.maxV) * 0.5, markers);
      const fFar = screenToFloorPoint3D((blob.minU + blob.maxU) * 0.5, blob.minV, markers);
      const fNear = screenToFloorPoint3D((blob.minU + blob.maxU) * 0.5, blob.maxV, markers);
      if (fLeft && fRight && fFar && fNear) {
        const cx = ((fLeft.x + fRight.x) * 0.5) - centerXOffset;
        const cz = ((fFar.z + fNear.z) * 0.5) - backWallZWorld - roomDepthM / 2;
        const wM = clamp(Math.abs(fRight.x - fLeft.x), 0.55, roomWidthM * 0.75);
        const dM = clamp(Math.abs(fNear.z - fFar.z), 0.45, roomDepthM * 0.72);
        box.x = Number(cx.toFixed(2));
        box.z = Number(cz.toFixed(2));
        box.widthM = Number(wM.toFixed(2));
        box.depthM = Number(dM.toFixed(2));
        box.rotationDeg = 0;
      }
    }

    // Anchor floor-standing chair base onto Y=0 ground contact when casters are visible on floor
    if ((type === 'chair' || type === 'office-chair') && blob.maxV >= markers.floorY - 0.03) {
      const baseFloorPt = screenToFloorPoint3D(
        (blob.minU + blob.maxU) * 0.5,
        clamp(blob.maxV - 0.01, markers.floorY, 0.96),
        markers
      );
      if (baseFloorPt) {
        const floorZ = baseFloorPt.z - backWallZWorld - roomDepthM / 2;
        const floorX = baseFloorPt.x - centerXOffset;
        box.x = Number((box.x * 0.55 + floorX * 0.45).toFixed(2));
        box.z = Number(Math.max(box.z, box.z * 0.45 + floorZ * 0.55).toFixed(2));
      }
    }

    const fb = DEFAULT_FALLBACK_COLORS[type];
    const colors = sampleMaskColors(rgba, rgbaW, rgbaH, blob.pixels, fb.p, fb.s);
    const hasMonitorOverDesk =
      type === 'desk' &&
      monitorCues.some(
        (m) => m.blob.maxU > blob.minU - 0.06 && m.blob.minU < blob.maxU + 0.06
      );
    const variant =
      type === 'desk' && !hasMonitorOverDesk && box.widthM >= 1.45
        ? 'built-in-bays'
        : type === 'sofa' && box.widthM <= 1.18
          ? 'armchair'
          : type === 'plant' && box.heightM >= 1.35
            ? 'tall-tree'
            : undefined;

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
        ...(variant ? { variant } : {}),
        ...(type === 'desk' ? { hasMonitor: hasMonitorOverDesk } : {}),
      },
    });
  }

  // =========================================================================
  // 5. 3D RGB-D WALL-PLANE STRUCTURAL EXTRACTOR
  // Recovers real architectural & built-in elements missed by compact semantic models:
  //   A) Open Doorways (deep floor-reaching depth recesses -> never false windows!)
  //   B) Built-In Protruding Desks / Workstations (continuous forward residual)
  //   C) Clipped Foreground Office Chair Recovery (when chair hugs cropped edge)
  //   D) Overhead Wall Cabinets / Cupboards (upper-wall framed storage bands)
  // =========================================================================
  const gW = 48;
  const gH = 36;
  const wallDepthAnchorM = clamp(Math.abs(backWallZWorld), 1.4, 6.8);
  const gridPt: Array<CalibratedPoint3D | null> = new Array(gW * gH).fill(null);
  const gridRawDisp = new Float32Array(gW * gH);

  // Estimate modal raw disparity of physical back wall so recess/protrusion tests never break under affine bias
  const rawWallPool: number[] = [];
  for (let y = Math.floor(vh * clamp(markers.ceilingY + 0.05, 0.14, 0.45)); y < Math.floor(vh * clamp(markers.floorY - 0.1, 0.45, 0.78)); y += stepY) {
    for (let x = Math.floor(vw * 0.08); x < Math.floor(vw * 0.88); x += stepX) {
      const idx = y * vw + x;
      if (!wallSeg || wallSeg.mask[idx] >= 128) {
        const d = disparityMap[idx];
        if (Number.isFinite(d)) rawWallPool.push(d);
      }
    }
  }
  rawWallPool.sort((a, b) => a - b);
  const wallQ50Raw = percentileSorted(rawWallPool, 0.5);
  const cleanRawWall = rawWallPool.filter((d) => d >= wallQ50Raw * 0.62 && d <= wallQ50Raw * 1.48);
  const rawPool = cleanRawWall.length >= 4 ? cleanRawWall : rawWallPool;
  let wallModalRawDisp = percentileSorted(rawPool, 0.48);
  if (rawPool.length >= 8) {
    const wh = Math.max(0.05, (rawPool[rawPool.length - 1] - rawPool[0]) * 0.12);
    let bCnt = 0;
    let bSum = 0;
    for (let i = 0; i < rawPool.length; i += Math.max(1, Math.floor(rawPool.length / 20))) {
      let c = 0;
      let s = 0;
      for (let j = 0; j < rawPool.length; j++) {
        if (Math.abs(rawPool[j] - rawPool[i]) <= wh) {
          c++;
          s += rawPool[j];
        }
      }
      if (c > bCnt) {
        bCnt = c;
        bSum = s;
      }
    }
    if (bCnt >= 3) wallModalRawDisp = bSum / bCnt;
  }

  for (let gy = 0; gy < gH; gy++) {
    const v = (gy + 0.5) / gH;
    const sy = clamp(Math.floor(v * vh), 0, vh - 1);
    for (let gx = 0; gx < gW; gx++) {
      const u = (gx + 0.5) / gW;
      const sx = clamp(Math.floor(u * vw), 0, vw - 1);
      const d = depthMeters[sy * vw + sx];
      gridPt[gy * gW + gx] = toRoomPoint(u, v, d);
      gridRawDisp[gy * gW + gx] = disparityMap[sy * vw + sx];
    }
  }

  // A) Detect DEEP FLOOR-REACHING OPEN DOORWAY RECESSES (deep void behind backWallZWorld)
  const doorwayGrid = new Uint8Array(gW * gH);
  const doorTopRow = Math.floor(clamp(markers.ceilingY + 0.04, 0.12, 0.45) * gH);
  const doorBotRow = Math.ceil(clamp(markers.floorY + 0.08, 0.6, 0.94) * gH);
  for (let gy = doorTopRow; gy <= Math.min(gH - 1, doorBotRow); gy++) {
    for (let gx = 0; gx < gW; gx++) {
      const pt = gridPt[gy * gW + gx];
      if (!pt) continue;
      const rawD = gridRawDisp[gy * gW + gx];
      if (wallModalRawDisp >= 0.3 && rawD > wallModalRawDisp * 1.42) continue; // ignore foreground pillar
      const deepByMeters = pt.z < -roomDepthM / 2 - 0.52 || pt.camDepthM > wallDepthAnchorM * 1.2;
      const deepByDisp = wallModalRawDisp >= 0.35 && rawD <= wallModalRawDisp * 0.72;
      if (deepByMeters || deepByDisp) {
        doorwayGrid[gy * gW + gx] = 1;
      }
    }
  }

  const visitedDoor = new Uint8Array(gW * gH);
  const doorwayBoxes: Array<{ minU: number; maxU: number; minV: number; maxV: number; x: number; w: number }> = [];
  for (let gy = doorTopRow; gy <= Math.min(gH - 1, doorBotRow); gy++) {
    for (let gx = 0; gx < gW; gx++) {
      const start = gy * gW + gx;
      if (!doorwayGrid[start] || visitedDoor[start]) continue;
      const stack = [start];
      visitedDoor[start] = 1;
      let minGx = gx;
      let maxGx = gx;
      let minGy = gy;
      let maxGy = gy;
      const cells: number[] = [];
      while (stack.length > 0) {
        const cur = stack.pop()!;
        cells.push(cur);
        const cx = cur % gW;
        const cy = Math.floor(cur / gW);
        minGx = Math.min(minGx, cx);
        maxGx = Math.max(maxGx, cx);
        minGy = Math.min(minGy, cy);
        maxGy = Math.max(maxGy, cy);
        for (const [nx, ny] of [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ]) {
          if (nx < 0 || nx >= gW || ny < doorTopRow || ny > Math.min(gH - 1, doorBotRow)) continue;
          const nIdx = ny * gW + nx;
          if (doorwayGrid[nIdx] && !visitedDoor[nIdx]) {
            visitedDoor[nIdx] = 1;
            stack.push(nIdx);
          }
        }
      }

      const maxV = (maxGy + 1) / gH;
      const minV = minGy / gH;
      const minU = minGx / gW;
      const maxU = (maxGx + 1) / gW;
      const spanV = maxV - minV;
      // Doorway must have vertical stature and extend down toward floor level
      if (cells.length >= 10 && spanV >= 0.22 && maxV >= markers.floorY - 0.16 && maxU - minU <= 0.48) {
        const leftWallPt = unprojectPixelWorld(Math.max(0.04, minU), (minV + maxV) * 0.5, wallDepthAnchorM, markers);
        const rightWallPt = unprojectPixelWorld(Math.min(0.96, maxU), (minV + maxV) * 0.5, wallDepthAnchorM, markers);
        const doorX = clamp(((leftWallPt.x + rightWallPt.x) * 0.5) - centerXOffset, -roomWidthM / 2 + 0.45, roomWidthM / 2 - 0.45);
        const doorW = clamp(Math.abs(rightWallPt.x - leftWallPt.x) * 1.12, 0.85, 1.35);
        const doorH = clamp(
          (spanV / Math.max(0.24, markers.floorY - markers.ceilingY)) * ceilingM,
          1.92,
          Math.min(2.3, ceilingM - 0.14)
        );
        const samplePx = cells.map((idx) => ({
          u: ((idx % gW) + 0.5) / gW,
          v: (Math.floor(idx / gW) + 0.5) / gH,
        }));
        const doorColors = sampleMaskColors(rgba, rgbaW, rgbaH, samplePx, '#b9b4ab', palette.trimColor);
        const alreadyHasDoor = rawObjects.some(
          (o) => o.draft.type === 'door' && Math.abs(o.draft.x - doorX) < 0.75
        );
        if (!alreadyHasDoor) {
          rawObjects.push({
            blob: {
              category: 'door',
              score: 0.88,
              pixels: samplePx.map((p) => ({
                x: clamp(Math.floor(p.u * vw), 0, vw - 1),
                y: clamp(Math.floor(p.v * vh), 0, vh - 1),
                u: p.u,
                v: p.v,
              })),
              minU,
              maxU,
              minV,
              maxV,
            },
            draft: {
              type: 'door',
              label: 'Open Doorway',
              x: Number(doorX.toFixed(2)),
              z: Number((-roomDepthM / 2 + 0.05).toFixed(2)),
              widthM: Number(doorW.toFixed(2)),
              depthM: 0.08,
              heightM: Number(doorH.toFixed(2)),
              rotationDeg: 0,
              primaryColor: doorColors.primaryColor,
              secondaryColor: palette.trimColor,
              inferred: false,
              confidence: 0.88,
            },
          });
        }
        doorwayBoxes.push({ minU, maxU, minV, maxV, x: doorX, w: doorW });
      }
    }
  }

  // Remove any hallucinated windows that overlap/sit next to an open doorway, touch the floor, or contain a deep doorway void
  for (let i = rawObjects.length - 1; i >= 0; i--) {
    const item = rawObjects[i];
    if (item.draft.type !== 'window') continue;
    const touchesFloor = item.blob.maxV >= markers.floorY - 0.16;
    const overlapsDoorway =
      doorwayBoxes.some(
        (d) => item.blob.maxU > d.minU - 0.1 && item.blob.minU < d.maxU + 0.1
      ) ||
      rawObjects.some(
        (o) =>
          o.draft.type === 'door' &&
          Math.abs(o.draft.x - item.draft.x) <= Math.max(0.82, o.draft.widthM * 0.8)
      );
    let minWinDisp = Infinity;
    for (let k = 0; k < item.blob.pixels.length; k += Math.max(1, Math.floor(item.blob.pixels.length / 40))) {
      const p = item.blob.pixels[k];
      const d = disparityMap[p.y * vw + p.x];
      if (d < minWinDisp) minWinDisp = d;
    }
    const hasDeepVoid = wallModalRawDisp >= 0.35 && minWinDisp <= wallModalRawDisp * 0.68;
    if (touchesFloor || overlapsDoorway || hasDeepVoid) {
      rawObjects.splice(i, 1);
    }
  }

  // B) Detect BUILT-IN PROTRUDING DESKS / COUNTERS on lower-mid wall (e.g. laminate desk bands)
  const hasExistingDesk = rawObjects.some((o) => o.draft.type === 'desk');
  const wallSpan = Math.max(0.24, markers.floorY - markers.ceilingY);
  const deskBandTopV = clamp(markers.ceilingY + wallSpan * 0.42, 0.44, markers.floorY - 0.18);
  const deskBandBotV = clamp(markers.floorY + 0.03, deskBandTopV + 0.12, 0.88);
  const deskRow0 = Math.floor(deskBandTopV * gH);
  const deskRow1 = Math.min(gH - 1, Math.ceil(deskBandBotV * gH));
  const upperWallRefRow0 = Math.floor(clamp(markers.ceilingY + wallSpan * 0.16, 0.2, deskBandTopV - 0.14) * gH);
  const upperWallRefRow1 = Math.max(upperWallRefRow0 + 1, Math.floor(clamp(deskBandTopV - 0.04, 0.3, 0.65) * gH));

  if (!hasExistingDesk) {
    // Compare each column's depth protrusion in the tabletop strip against the bare wall directly above it
    const protrudingCols = new Uint8Array(gW);
    const colDeskTopRow = new Int16Array(gW).fill(-1);
    const colDeskDepth = new Float32Array(gW);

    for (let gx = 0; gx < gW; gx++) {
      const u = (gx + 0.5) / gW;
      if (doorwayBoxes.some((d) => u >= d.minU - 0.02 && u <= d.maxU + 0.02)) continue;
      if (u > 0.86) continue;

      const refDepths: number[] = [];
      const refRawDisps: number[] = [];
      for (let ry = upperWallRefRow0; ry < upperWallRefRow1; ry++) {
        const pt = gridPt[ry * gW + gx];
        const rawD = gridRawDisp[ry * gW + gx];
        if (pt && pt.camDepthM >= wallDepthAnchorM * 0.68 && pt.camDepthM <= wallDepthAnchorM * 1.35) {
          refDepths.push(pt.camDepthM);
          refRawDisps.push(rawD);
        }
      }
      if (refDepths.length < 2) continue;
      refDepths.sort((a, b) => a - b);
      refRawDisps.sort((a, b) => a - b);
      const colWallDepth = percentileSorted(refDepths, 0.5);
      const colWallDisp = percentileSorted(refRawDisps, 0.5);
      // Skip foreground pillar columns sitting much closer than the back wall
      if (colWallDepth < wallDepthAnchorM * 0.78) continue;

      // Scan downward from deskRow0 to find the TOPMOST protruding tabletop lip (avoids under-desk shadows!)
      let topRow = -1;
      let topDepth = colWallDepth;
      for (let gy = deskRow0; gy <= deskRow1; gy++) {
        const pt = gridPt[gy * gW + gx];
        if (!pt) continue;
        const rawD = gridRawDisp[gy * gW + gx];
        const protMeters = colWallDepth - pt.camDepthM;
        const protRelDisp = (rawD - colWallDisp) / Math.max(0.35, colWallDisp);
        if (
          (protMeters >= 0.16 || protRelDisp >= 0.14) &&
          pt.camDepthM >= wallDepthAnchorM * 0.55 &&
          pt.y >= 0.38 &&
          pt.y <= 1.12
        ) {
          topRow = gy;
          topDepth = pt.camDepthM;
          break;
        }
      }
      if (topRow >= 0) {
        protrudingCols[gx] = 1;
        colDeskTopRow[gx] = topRow;
        colDeskDepth[gx] = topDepth;
      }
    }

    // Bridge short column gaps (e.g. chair back, monitor, or vertical divider up to 8 cols wide)
    const bridged = new Uint8Array(protrudingCols);
    let lastActive = -1;
    for (let gx = 0; gx < gW; gx++) {
      if (protrudingCols[gx]) {
        if (lastActive >= 0 && gx - lastActive <= 8) {
          let crossesDoor = false;
          for (let k = lastActive + 1; k < gx; k++) {
            const u = (k + 0.5) / gW;
            if (doorwayBoxes.some((d) => u >= d.minU && u <= d.maxU)) crossesDoor = true;
          }
          if (!crossesDoor) {
            for (let k = lastActive + 1; k < gx; k++) {
              bridged[k] = 1;
              if (colDeskTopRow[k] < 0) {
                colDeskTopRow[k] = Math.round((colDeskTopRow[lastActive] + colDeskTopRow[gx]) * 0.5);
                colDeskDepth[k] = (colDeskDepth[lastActive] + colDeskDepth[gx]) * 0.5;
              }
            }
          }
        }
        lastActive = gx;
      }
    }

    // Find widest contiguous horizontal desk span
    let runStart = -1;
    let bestSpanStart = -1;
    let bestSpanEnd = -1;
    for (let gx = 0; gx <= gW; gx++) {
      const on = gx < gW && bridged[gx] === 1;
      if (on && runStart < 0) runStart = gx;
      if (!on && runStart >= 0) {
        if (gx - 1 - runStart > bestSpanEnd - bestSpanStart) {
          bestSpanStart = runStart;
          bestSpanEnd = gx - 1;
        }
        runStart = -1;
      }
    }

    const spanCols = bestSpanEnd - bestSpanStart + 1;
    if (bestSpanStart >= 0 && spanCols >= 10) {
      const uMin = bestSpanStart / gW;
      const uMax = (bestSpanEnd + 1) / gW;
      const activeRows: number[] = [];
      const activeDepths: number[] = [];
      const topSamplePx: Array<{ u: number; v: number }> = [];
      const underSamplePx: Array<{ u: number; v: number }> = [];

      for (let gx = bestSpanStart; gx <= bestSpanEnd; gx++) {
        if (colDeskTopRow[gx] >= 0) {
          activeRows.push(colDeskTopRow[gx]);
          activeDepths.push(colDeskDepth[gx]);
          if (protrudingCols[gx]) {
            const u = (gx + 0.5) / gW;
            const vTop = (colDeskTopRow[gx] + 0.5) / gH;
            const px = clamp(Math.floor(u * rgbaW), 0, rgbaW - 1);
            const py = clamp(Math.floor(vTop * rgbaH), 0, rgbaH - 1);
            const i = (py * rgbaW + px) * 4;
            const r = rgba[i];
            const gr = rgba[i + 1];
            const b = rgba[i + 2];
            const lum = 0.299 * r + 0.587 * gr + 0.114 * b;
            // Sample desk laminate surface (skip dark black chairs & warm cardboard boxes)
            const isWarmBox = r > gr + 16 && r > b + 32;
            if (lum >= 55 && !isWarmBox) {
              topSamplePx.push({ u, v: vTop });
            }
            underSamplePx.push({ u, v: Math.min(markers.floorY - 0.02, vTop + 0.08) });
          }
        }
      }
      activeRows.sort((a, b) => a - b);
      activeDepths.sort((a, b) => a - b);
      const medDepth = percentileSorted(activeDepths, 0.5);
      const medTopV = (percentileSorted(activeRows, 0.45) + 0.5) / gH;

      const leftW = unprojectPixelWorld(uMin, medTopV, medDepth, markers);
      const rightW = unprojectPixelWorld(uMax, medTopV, medDepth, markers);
      const deskX = ((leftW.x + rightW.x) * 0.5) - centerXOffset;
      const deskWidthM = clamp(Math.abs(rightW.x - leftW.x), 1.05, Math.min(roomWidthM * 0.72, 2.5));
      const deskDepthM = 0.65;
      const deskZ = -roomDepthM / 2 + deskDepthM / 2 + 0.03;

      const deskPrimary = sampleMaskColors(rgba, rgbaW, rgbaH, topSamplePx, '#6c8b84', '#2b2f35');
      const deskUnder = sampleMaskColors(rgba, rgbaW, rgbaH, underSamplePx, '#2b2f35', '#2b2f35');

      const allDeskPx = topSamplePx.map((p) => ({
        x: clamp(Math.floor(p.u * vw), 0, vw - 1),
        y: clamp(Math.floor(p.v * vh), 0, vh - 1),
        u: p.u,
        v: p.v,
      }));
      rawObjects.push({
        blob: {
          category: 'desk',
          score: 0.87,
          pixels: allDeskPx,
          minU: uMin,
          maxU: uMax,
          minV: Math.max(0.45, medTopV - 0.04),
          maxV: clamp(markers.floorY, medTopV + 0.08, 0.88),
        },
        draft: {
          type: 'desk',
          label: 'Work Desk',
          x: Number(deskX.toFixed(2)),
          z: Number(deskZ.toFixed(2)),
          widthM: Number(deskWidthM.toFixed(2)),
          depthM: deskDepthM,
          heightM: 0.76,
          rotationDeg: 0,
          primaryColor: deskPrimary.primaryColor,
          secondaryColor: deskUnder.primaryColor,
          inferred: false,
          confidence: 0.87,
          variant: 'built-in-bays',
          hasMonitor: false,
          bayCount: deskWidthM >= 1.65 ? 3 : 2,
        },
      });
    }
  }

  // C) Recover CLIPPED FOREGROUND OFFICE CHAIR IN FRONT OF DESK (when SegFormer misses a partially cropped chair)
  const hasChair = rawObjects.some((o) => o.draft.type === 'chair' || o.draft.type === 'office-chair');
  const firstDesk = rawObjects.find((o) => o.draft.type === 'desk');
  if (!hasChair && firstDesk) {
    const chairCells: Array<{ u: number; v: number; pt: CalibratedPoint3D }> = [];
    const chRow0 = Math.floor(clamp(markers.floorY - 0.22, 0.48, 0.75) * gH);
    const chRow1 = Math.min(gH - 1, Math.ceil(clamp(markers.floorY + 0.02, 0.65, 0.88) * gH));
    for (let gy = chRow0; gy <= chRow1; gy++) {
      for (let gx = 0; gx < Math.floor(gW * 0.75); gx++) {
        const u = (gx + 0.5) / gW;
        if (doorwayBoxes.some((d) => u >= d.minU - 0.02 && u <= d.maxU + 0.02)) continue;
        const pt = gridPt[gy * gW + gx];
        const rawD = gridRawDisp[gy * gW + gx];
        if (!pt || wallModalRawDisp <= 0.25) continue;
        const px = clamp(Math.floor(u * rgbaW), 0, rgbaW - 1);
        const py = clamp(Math.floor(((gy + 0.5) / gH) * rgbaH), 0, rgbaH - 1);
        const i = (py * rgbaW + px) * 4;
        const lum = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
        // Distinct foreground protruding chair cushion/backrest in front of wall/desk
        if (rawD >= wallModalRawDisp * 1.24 && lum < 85 && pt.y >= 0.1 && pt.y <= 1.05) {
          chairCells.push({ u, v: (gy + 0.5) / gH, pt });
        }
      }
    }
    if (chairCells.length >= 6) {
      const xs = chairCells.map((c) => c.pt.x).sort((a, b) => a - b);
      const zs = chairCells.map((c) => c.pt.z).sort((a, b) => a - b);
      const cx = percentileSorted(xs, 0.5);
      const cz = Math.max(firstDesk.draft.z + firstDesk.draft.depthM * 0.5 + 0.3, percentileSorted(zs, 0.65));
      const chCols = sampleMaskColors(rgba, rgbaW, rgbaH, chairCells, '#23262e', '#4c525f');
      rawObjects.push({
        blob: {
          category: 'office-chair',
          score: 0.79,
          pixels: chairCells.map((c) => ({
            x: clamp(Math.floor(c.u * vw), 0, vw - 1),
            y: clamp(Math.floor(c.v * vh), 0, vh - 1),
            u: c.u,
            v: c.v,
          })),
          minU: Math.min(...chairCells.map((c) => c.u)),
          maxU: Math.max(...chairCells.map((c) => c.u)),
          minV: Math.min(...chairCells.map((c) => c.v)),
          maxV: Math.max(...chairCells.map((c) => c.v)),
        },
        draft: {
          type: 'office-chair',
          label: 'Office Chair',
          x: Number(cx.toFixed(2)),
          z: Number(cz.toFixed(2)),
          widthM: 0.54,
          depthM: 0.56,
          heightM: 0.88,
          rotationDeg: 0,
          primaryColor: chCols.primaryColor,
          secondaryColor: chCols.secondaryColor,
          inferred: false,
          confidence: 0.79,
        },
      });
    }
  }

  // D) Detect OVERHEAD BUILT-IN WALL CABINETS (framed cohesive storage block in upper wall band)
  const hasExistingCabinet = rawObjects.some((o) => o.draft.type === 'cabinet' || o.draft.type === 'wardrobe');
  if (!hasExistingCabinet && markers.ceilingY < 0.36) {
    const cabRow0 = Math.max(1, Math.floor((markers.ceilingY + wallSpan * 0.08) * gH));
    const cabRow1 = Math.max(cabRow0 + 2, Math.floor((markers.ceilingY + wallSpan * 0.42) * gH));
    // Sample ceiling above and shelf/backsplash below to confirm framed cabinet unit
    const refUpperCols: RGB[] = [];
    for (let x = Math.floor(rgbaW * 0.15); x < Math.floor(rgbaW * 0.65); x += 4) {
      const cy = clamp(Math.floor(Math.max(0.05, markers.ceilingY - 0.025) * rgbaH), 1, rgbaH - 2);
      const i = (cy * rgbaW + x) * 4;
      refUpperCols.push({ r: rgba[i], g: rgba[i + 1], b: rgba[i + 2] });
    }
    const avgCeilR = refUpperCols.reduce((a, c) => a + c.r, 0) / Math.max(1, refUpperCols.length);
    const avgCeilG = refUpperCols.reduce((a, c) => a + c.g, 0) / Math.max(1, refUpperCols.length);
    const avgCeilB = refUpperCols.reduce((a, c) => a + c.b, 0) / Math.max(1, refUpperCols.length);

    const cabCols = new Uint8Array(gW);
    for (let gx = 0; gx < gW; gx++) {
      const u = (gx + 0.5) / gW;
      if (u > 0.86 || doorwayBoxes.some((d) => u >= d.minU - 0.02 && u <= d.maxU + 0.02)) continue;
      let horizSeamStrength = 0;
      let bandContrastCount = 0;
      let pts = 0;
      const px = clamp(Math.floor(u * rgbaW), 1, rgbaW - 2);
      for (let gy = cabRow0; gy <= cabRow1; gy++) {
        const pt = gridPt[gy * gW + gx];
        if (!pt || pt.camDepthM < wallDepthAnchorM * 0.68 || pt.camDepthM > wallDepthAnchorM * 1.28) continue;
        const py = clamp(Math.floor(((gy + 0.5) / gH) * rgbaH), 2, rgbaH - 3);
        const i = (py * rgbaW + px) * 4;
        const iUp = ((py - 2) * rgbaW + px) * 4;
        const iDn = ((py + 2) * rgbaW + px) * 4;
        const lumUp = 0.299 * rgba[iUp] + 0.587 * rgba[iUp + 1] + 0.114 * rgba[iUp + 2];
        const lumDn = 0.299 * rgba[iDn] + 0.587 * rgba[iDn + 1] + 0.114 * rgba[iDn + 2];
        horizSeamStrength = Math.max(horizSeamStrength, Math.abs(lumDn - lumUp));
        const colDist = Math.hypot(rgba[i] - avgCeilR, rgba[i + 1] - avgCeilG, rgba[i + 2] - avgCeilB);
        if (colDist >= 24) bandContrastCount++;
        pts++;
      }
      // Also check bright lower border / shelf transition just below cabRow1
      const belowY = clamp(Math.floor(((cabRow1 + 1.5) / gH) * rgbaH), 1, rgbaH - 2);
      const midY = clamp(Math.floor((((cabRow0 + cabRow1) * 0.5) / gH) * rgbaH), 1, rgbaH - 2);
      const iMid = (midY * rgbaW + px) * 4;
      const iBel = (belowY * rgbaW + px) * 4;
      const lowerEdge = Math.hypot(rgba[iMid] - rgba[iBel], rgba[iMid + 1] - rgba[iBel + 1], rgba[iMid + 2] - rgba[iBel + 2]);
      if (pts >= 3 && bandContrastCount >= Math.ceil(pts * 0.5) && (horizSeamStrength >= 16 || lowerEdge >= 28)) {
        cabCols[gx] = 1;
      }
    }

    let cRunStart = -1;
    let bestCabStart = -1;
    let bestCabEnd = -1;
    for (let gx = 0; gx <= gW; gx++) {
      const on = gx < gW && cabCols[gx] === 1;
      if (on && cRunStart < 0) cRunStart = gx;
      if (!on && cRunStart >= 0) {
        if (gx - 1 - cRunStart > bestCabEnd - bestCabStart) {
          bestCabStart = cRunStart;
          bestCabEnd = gx - 1;
        }
        cRunStart = -1;
      }
    }

    if (bestCabStart >= 0 && bestCabEnd - bestCabStart + 1 >= 10) {
      const u0 = bestCabStart / gW;
      const u1 = (bestCabEnd + 1) / gW;
      const v0 = cabRow0 / gH;
      const v1 = cabRow1 / gH;

      // Count distinct vertical door seams inside the horizontal cabinet span so plain empty walls never trigger!
      let verticalDoorSeams = 0;
      const midCabY = clamp(Math.floor(((v0 + v1) * 0.5) * rgbaH), 1, rgbaH - 2);
      const sx0 = clamp(Math.floor((u0 + 0.03) * rgbaW), 2, rgbaW - 3);
      const sx1 = clamp(Math.floor((u1 - 0.03) * rgbaW), sx0 + 4, rgbaW - 3);
      let lastSeamX = -99;
      for (let x = sx0; x <= sx1; x++) {
        const iC = (midCabY * rgbaW + x) * 4;
        const iL = (midCabY * rgbaW + (x - 2)) * 4;
        const iR = (midCabY * rgbaW + (x + 2)) * 4;
        const lC = 0.299 * rgba[iC] + 0.587 * rgba[iC + 1] + 0.114 * rgba[iC + 2];
        const lL = 0.299 * rgba[iL] + 0.587 * rgba[iL + 1] + 0.114 * rgba[iL + 2];
        const lR = 0.299 * rgba[iR] + 0.587 * rgba[iR + 1] + 0.114 * rgba[iR + 2];
        const grooveContrast = Math.abs(lC - (lL + lR) * 0.5);
        if ((Math.abs(lR - lL) >= 14 || grooveContrast >= 14) && x - lastSeamX >= Math.max(8, rgbaW * 0.04)) {
          verticalDoorSeams++;
          lastSeamX = x;
        }
      }

      const lw = unprojectPixelWorld(u0, (v0 + v1) * 0.5, wallDepthAnchorM, markers);
      const rw = unprojectPixelWorld(u1, (v0 + v1) * 0.5, wallDepthAnchorM, markers);
      const cabX = ((lw.x + rw.x) * 0.5) - centerXOffset;
      const cabW = clamp(Math.abs(rw.x - lw.x), 0.95, Math.min(roomWidthM * 0.72, 2.5));
      const cabH = clamp(((v1 - v0) / wallSpan) * ceilingM, 0.58, 1.05);
      const elevM = clamp(ceilingM - ((v0 - markers.ceilingY) / wallSpan) * ceilingM - cabH, 1.25, ceilingM - cabH - 0.12);

      const cabPx: Array<{ u: number; v: number }> = [];
      for (let gx = bestCabStart; gx <= bestCabEnd; gx++) {
        for (let gy = cabRow0; gy <= cabRow1; gy++) {
          cabPx.push({ u: (gx + 0.5) / gW, v: (gy + 0.5) / gH });
        }
      }
      const cabColors = sampleMaskColors(rgba, rgbaW, rgbaH, cabPx, '#585a5e', '#262930');
      const wallHex = palette.wallColor;
      const wr = parseInt(wallHex.slice(1, 3), 16);
      const wg = parseInt(wallHex.slice(3, 5), 16);
      const wb = parseInt(wallHex.slice(5, 7), 16);
      const cr = parseInt(cabColors.primaryColor.slice(1, 3), 16);
      const cg = parseInt(cabColors.primaryColor.slice(3, 5), 16);
      const cb = parseInt(cabColors.primaryColor.slice(5, 7), 16);
      const differsFromWall = Math.hypot(cr - wr, cg - wg, cb - wb) >= 24;
      if (differsFromWall || verticalDoorSeams >= 2) {
        rawObjects.push({
          blob: {
            category: 'cabinet',
            score: 0.82,
            pixels: cabPx.map((p) => ({
              x: clamp(Math.floor(p.u * vw), 0, vw - 1),
              y: clamp(Math.floor(p.v * vh), 0, vh - 1),
              u: p.u,
              v: p.v,
            })),
            minU: u0,
            maxU: u1,
            minV: v0,
            maxV: v1,
          },
          draft: {
            type: 'cabinet',
            label: 'Wall Cupboard',
            x: Number(cabX.toFixed(2)),
            z: Number((-roomDepthM / 2 + 0.22).toFixed(2)),
            widthM: Number(cabW.toFixed(2)),
            depthM: 0.4,
            heightM: Number(cabH.toFixed(2)),
            elevationM: Number(elevM.toFixed(2)),
            rotationDeg: 0,
            primaryColor: cabColors.primaryColor,
            secondaryColor: cabColors.secondaryColor,
            inferred: false,
            confidence: 0.82,
            variant: 'wall-cupboard',
            doorCount: Math.max(
              verticalDoorSeams >= 2 ? Math.min(5, verticalDoorSeams + 1) : 2,
              cabW >= 1.65 ? 4 : cabW >= 1.15 ? 3 : 2
            ),
          },
        });

        // Inspect rows near overhead cupboard bottom for the brightest horizontal open shelf ledge + small plants
        const searchV0 = clamp(v1 - 0.035, 0.25, 0.62);
        const searchV1 = clamp(v1 + 0.085, searchV0 + 0.04, 0.72);
        let bestShelfV = v1 + 0.025;
        let bestRowLum = 0;
        let bestRowBrightFrac = 0;
        for (let step = 0; step < 8; step++) {
          const testV = searchV0 + ((step + 0.5) / 8) * (searchV1 - searchV0);
          const py = clamp(Math.floor(testV * rgbaH), 0, rgbaH - 1);
          let lumSum = 0;
          let brightN = 0;
          let tot = 0;
          for (let gx = bestCabStart; gx <= bestCabEnd; gx++) {
            const u = (gx + 0.5) / gW;
            const px = clamp(Math.floor(u * rgbaW), 0, rgbaW - 1);
            const idx = (py * rgbaW + px) * 4;
            const lum = 0.299 * rgba[idx] + 0.587 * rgba[idx + 1] + 0.114 * rgba[idx + 2];
            lumSum += lum;
            if (lum >= 158) brightN++;
            tot++;
          }
          const avgL = tot > 0 ? lumSum / tot : 0;
          if (avgL > bestRowLum && tot > 0) {
            bestRowLum = avgL;
            bestRowBrightFrac = brightN / tot;
            bestShelfV = testV;
          }
        }
        const shelfV0 = clamp(bestShelfV - 0.02, 0.25, 0.64);
        const shelfV1 = clamp(bestShelfV + 0.025, shelfV0 + 0.03, 0.7);
        const shelfSamplePx: Array<{ u: number; v: number }> = [];
        for (let gx = bestCabStart; gx <= bestCabEnd; gx++) {
          const u = (gx + 0.5) / gW;
          const px = clamp(Math.floor(u * rgbaW), 0, rgbaW - 1);
          const py = clamp(Math.floor(bestShelfV * rgbaH), 0, rgbaH - 1);
          const idx = (py * rgbaW + px) * 4;
          const lum = 0.299 * rgba[idx] + 0.587 * rgba[idx + 1] + 0.114 * rgba[idx + 2];
          if (lum >= 152) shelfSamplePx.push({ u, v: bestShelfV });
        }
        if (bestRowBrightFrac >= 0.48 && bestRowLum >= 162 && shelfSamplePx.length >= 4) {
          const shelfCols = sampleMaskColors(rgba, rgbaW, rgbaH, shelfSamplePx, '#ecebe6', '#d6d4ce');
          const shelfElev = clamp(elevM - 0.28, 0.92, elevM - 0.18);
          rawObjects.push({
            blob: {
              category: 'bookshelf',
              score: 0.8,
              pixels: [],
              minU: u0,
              maxU: u1,
              minV: shelfV0,
              maxV: shelfV1,
            },
            draft: {
              type: 'bookshelf',
              label: 'Open Wall Shelf',
              x: Number(cabX.toFixed(2)),
              z: Number((-roomDepthM / 2 + 0.14).toFixed(2)),
              widthM: Number(cabW.toFixed(2)),
              depthM: 0.24,
              heightM: 0.25,
              elevationM: Number(shelfElev.toFixed(2)),
              rotationDeg: 0,
              primaryColor: shelfCols.primaryColor,
              secondaryColor: shelfCols.secondaryColor,
              inferred: false,
              confidence: 0.8,
              variant: 'open-wall-ledge',
              bayCount: cabW >= 1.55 ? 3 : 2,
            },
          });

          // High-resolution horizontal pixel scan along the shelf ledge for small potted green plants
          const sxStart = clamp(Math.floor((u0 + 0.015) * rgbaW), 0, rgbaW - 1);
          const sxEnd = clamp(Math.ceil((u1 - 0.015) * rgbaW), sxStart + 2, rgbaW);
          const syStart = clamp(Math.floor((shelfV0 - 0.045) * rgbaH), 0, rgbaH - 1);
          const syEnd = clamp(Math.ceil((shelfV1 + 0.025) * rgbaH), syStart + 2, rgbaH);
          const plantClusterUs: number[] = [];
          let inGreenCluster = false;
          let clusterSumX = 0;
          let clusterCols = 0;
          let clusterGreenTotal = 0;
          for (let px = sxStart; px <= sxEnd; px += 2) {
            let greenPx = 0;
            if (px < sxEnd) {
              for (let py = syStart; py < syEnd; py++) {
                const idx = (py * rgbaW + px) * 4;
                const r = rgba[idx];
                const gr = rgba[idx + 1];
                const b = rgba[idx + 2];
                if (gr > r + 4 && gr > b + 9 && gr >= 40 && gr <= 190) {
                  greenPx++;
                }
              }
            }
            if (greenPx >= 1) {
              inGreenCluster = true;
              clusterSumX += px;
              clusterCols++;
              clusterGreenTotal += greenPx;
            } else if (inGreenCluster) {
              if (clusterCols >= 2 && clusterGreenTotal >= 4) {
                const centerU = (clusterSumX / clusterCols) / rgbaW;
                if (
                  plantClusterUs.length === 0 ||
                  centerU - plantClusterUs[plantClusterUs.length - 1] >= (u1 - u0) * 0.14
                ) {
                  plantClusterUs.push(centerU);
                }
              }
              inGreenCluster = false;
              clusterSumX = 0;
              clusterCols = 0;
              clusterGreenTotal = 0;
            }
          }
          for (const pu of plantClusterUs.slice(0, 4)) {
            const pWorld = unprojectPixelWorld(pu, shelfV0, wallDepthAnchorM, markers);
            rawObjects.push({
              blob: {
                category: 'plant',
                score: 0.78,
                pixels: [],
                minU: pu - 0.02,
                maxU: pu + 0.02,
                minV: shelfV0,
                maxV: shelfV0 + 0.04,
              },
              draft: {
                type: 'plant',
                label: 'Shelf Plant',
                x: Number(clamp(pWorld.x - centerXOffset, -roomWidthM / 2 + 0.2, roomWidthM / 2 - 0.2).toFixed(2)),
                z: Number((-roomDepthM / 2 + 0.14).toFixed(2)),
                widthM: 0.16,
                depthM: 0.16,
                heightM: 0.2,
                elevationM: Number((shelfElev + 0.24).toFixed(2)),
                rotationDeg: 0,
                primaryColor: '#4c7333',
                secondaryColor: '#23262d',
                inferred: false,
                confidence: 0.78,
                variant: 'small-shelf-pot',
              },
            });
          }
        }
      }
    }
  }

  // 6. Contextual upgrades in 3D space:
  //    - Table near/beneath a monitor cue -> Work Desk
  //    - Unpaired monitor cue -> synthesize Work Desk at that 3D spot
  //    - Chair within edge clearance of a desk -> Office Chair (and keep it IN FRONT of desk)
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
        item.draft.hasMonitor = true;
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
    const nearbyDesk = rawObjects.find(
      (o) =>
        o.draft.type === 'desk' &&
        Math.hypot(o.draft.x - m.box.x, o.draft.z - m.box.z) <= 1.1
    );
    if (nearbyDesk) {
      nearbyDesk.draft.hasMonitor = true;
      return;
    }

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
        hasMonitor: true,
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
    if (item.draft.type === 'chair' || item.draft.type === 'office-chair') {
      const matchedDesk = desks.find(
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
      if (matchedDesk) {
        if (item.draft.type === 'chair') {
          item.draft.type = 'office-chair';
          item.draft.label = 'Office Chair';
        }
        // Keep pulled-out office chairs cleanly IN FRONT of their desk
        const deskFrontZ = matchedDesk.draft.z + matchedDesk.draft.depthM * 0.5;
        if (item.draft.z < deskFrontZ + item.draft.depthM * 0.42) {
          item.draft.z = Number((deskFrontZ + item.draft.depthM * 0.48).toFixed(2));
        }
      }
    }
  }

  // 7. Pure-CV Architectural Detail Extraction (Zero Cloud AI):
  //    - door-garland: vivid orange/yellow floral garland hanging on doorway jamb
  //    - desk-box: protruding cardboard/paper box sitting on desktop
  //    - ceiling-fan: dark ceiling motor/downrod centered on bright ceiling plane
  //    - soffit-beam: overhead foreground dropped structural soffit header
  const architecturalFeatures: Array<{
    type: RoomArchitecturalFeatureType;
    x: number;
    z: number;
    widthM: number;
    depthM: number;
    heightM: number;
    elevationM: number;
    rotationDeg: number;
    primaryColor: string;
    secondaryColor: string;
    count?: number;
  }> = [];

  // 7a) Doorway marigold/floral garland detector
  for (const dBox of doorwayBoxes) {
    const doorObj = rawObjects.find(
      (o) => o.draft.type === 'door' && Math.abs(o.draft.x - dBox.x) < 0.3
    );
    if (!doorObj) continue;
    const sides: Array<{ u0: number; u1: number; sideX: number }> = [
      {
        u0: clamp(dBox.minU - 0.035, 0.02, 0.96),
        u1: clamp(dBox.minU + 0.045, 0.04, 0.98),
        sideX: dBox.x - dBox.w * 0.48,
      },
      {
        u0: clamp(dBox.maxU - 0.045, 0.02, 0.96),
        u1: clamp(dBox.maxU + 0.035, 0.04, 0.98),
        sideX: dBox.x + dBox.w * 0.48,
      },
    ];
    for (const s of sides) {
      const gx0 = clamp(Math.floor(s.u0 * rgbaW), 0, rgbaW - 1);
      const gx1 = clamp(Math.ceil(s.u1 * rgbaW), gx0 + 1, rgbaW);
      const gy0 = clamp(Math.floor((dBox.minV + 0.04) * rgbaH), 0, rgbaH - 1);
      const gy1 = clamp(Math.ceil((dBox.minV + (dBox.maxV - dBox.minV) * 0.78) * rgbaH), gy0 + 2, rgbaH);
      let warmHits = 0;
      let tot = 0;
      const warmPx: RGB[] = [];
      for (let py = gy0; py < gy1; py += 2) {
        for (let px = gx0; px < gx1; px += 2) {
          tot++;
          const idx = (py * rgbaW + px) * 4;
          const r = rgba[idx];
          const gr = rgba[idx + 1];
          const b = rgba[idx + 2];
          if (r >= 150 && r > b + 55 && gr >= 35) {
            warmHits++;
            warmPx.push({ r, g: gr, b });
          }
        }
      }
      if (tot >= 20 && warmHits / tot >= 0.09 && warmPx.length >= 6) {
        const sortedR = warmPx.map((p) => p.r).sort((a, b) => a - b);
        const sortedG = warmPx.map((p) => p.g).sort((a, b) => a - b);
        const sortedB = warmPx.map((p) => p.b).sort((a, b) => a - b);
        const orangeCol = rgbToHex({
          r: percentileSorted(sortedR, 0.55),
          g: percentileSorted(sortedG, 0.35),
          b: percentileSorted(sortedB, 0.3),
        });
        const yellowCol = rgbToHex({
          r: percentileSorted(sortedR, 0.82),
          g: percentileSorted(sortedG, 0.82),
          b: percentileSorted(sortedB, 0.35),
        });
        architecturalFeatures.push({
          type: 'door-garland',
          x: Number(clamp(s.sideX, -roomWidthM / 2 + 0.08, roomWidthM / 2 - 0.08).toFixed(2)),
          z: Number((-roomDepthM / 2 + 0.09).toFixed(2)),
          widthM: 0.08,
          depthM: 0.08,
          heightM: Number(clamp(doorObj.draft.heightM * 0.68, 0.9, 1.55).toFixed(2)),
          elevationM: Number(clamp(doorObj.draft.heightM * 0.28, 0.45, 0.9).toFixed(2)),
          rotationDeg: 0,
          primaryColor: orangeCol,
          secondaryColor: yellowCol,
        });
        break;
      }
    }
  }

  // Remove spurious tiny flat "table" blobs that sit on top of a detected floor rug
  const rugBlobs = rawObjects.filter((o) => o.draft.type === 'rug' || o.draft.type === 'fitness-mat');
  for (let i = rawObjects.length - 1; i >= 0; i--) {
    const item = rawObjects[i];
    if (item.draft.type !== 'table') continue;
    const isFloorRugOverlap =
      item.blob.minV >= markers.floorY - 0.02 &&
      rugBlobs.some(
        (r) => item.blob.maxU > r.blob.minU - 0.04 && item.blob.minU < r.blob.maxU + 0.04
      );
    if (isFloorRugOverlap || (item.draft.widthM <= 0.45 && item.blob.minV >= markers.floorY)) {
      rawObjects.splice(i, 1);
    }
  }

  // 7b) Protruding cardboard/package box sitting on built-in desk
  const builtInDesk = rawObjects.find((o) => o.draft.type === 'desk');
  if (builtInDesk && builtInDesk.blob.maxU > builtInDesk.blob.minU + 0.08) {
    const du0 = builtInDesk.blob.minU + 0.04;
    const du1 = builtInDesk.blob.maxU - 0.01;
    const dv0 = clamp(builtInDesk.blob.minV - 0.1, 0.35, 0.72);
    const dv1 = clamp(builtInDesk.blob.minV + 0.07, dv0 + 0.04, 0.8);
    const colsN = 18;
    const warmSpan: number[] = [];
    for (let c = 0; c < colsN; c++) {
      const cu = du0 + ((c + 0.5) / colsN) * (du1 - du0);
      const px = clamp(Math.floor(cu * rgbaW), 0, rgbaW - 1);
      let hits = 0;
      let cnt = 0;
      for (let step = 0; step < 8; step++) {
        const cv = dv0 + ((step + 0.5) / 8) * (dv1 - dv0);
        const py = clamp(Math.floor(cv * rgbaH), 0, rgbaH - 1);
        const idx = (py * rgbaW + px) * 4;
        const r = rgba[idx];
        const gr = rgba[idx + 1];
        const b = rgba[idx + 2];
        cnt++;
        if (r >= 70 && gr >= 38 && r > gr + 12 && r > b + 28) {
          hits++;
        }
      }
      if (cnt > 0 && hits / cnt >= 0.25) {
        warmSpan.push(cu);
      }
    }
    if (warmSpan.length >= 2 && warmSpan.length <= 9) {
      const midU = (warmSpan[0] + warmSpan[warmSpan.length - 1]) * 0.5;
      const spanRatio = clamp((warmSpan.length / colsN) * 1.15, 0.18, 0.48);
      const boxWorld = unprojectPixelWorld(midU, (dv0 + dv1) * 0.5, wallDepthAnchorM * 0.92, markers);
      architecturalFeatures.push({
        type: 'desk-box',
        x: Number(
          clamp(
            boxWorld.x - centerXOffset,
            builtInDesk.draft.x - builtInDesk.draft.widthM * 0.42,
            builtInDesk.draft.x + builtInDesk.draft.widthM * 0.42
          ).toFixed(2)
        ),
        z: Number(builtInDesk.draft.z.toFixed(2)),
        widthM: Number(clamp(builtInDesk.draft.widthM * spanRatio, 0.28, 0.58).toFixed(2)),
        depthM: 0.28,
        heightM: 0.26,
        elevationM: builtInDesk.draft.heightM,
        rotationDeg: 0,
        primaryColor: '#8d5b3c',
        secondaryColor: '#e6e3dd',
      });
    }
  }

  // 7c) Ceiling fan detector: prefer SegFormer 'fan' mask if present, otherwise dark motor hub on bright ceiling
  const fanSeg = segments.find((s) => s.label.includes('fan'));
  let fanPlaced = false;
  if (fanSeg) {
    let sumU = 0;
    let sumV = 0;
    let minU = 1;
    let maxU = 0;
    let cnt = 0;
    for (let y = 0; y < Math.floor(vh * clamp(markers.ceilingY + 0.14, 0.28, 0.5)); y++) {
      for (let x = 0; x < vw; x++) {
        if (fanSeg.mask[y * vw + x] >= 128) {
          const u = (x + 0.5) / vw;
          const v = (y + 0.5) / vh;
          sumU += u;
          sumV += v;
          minU = Math.min(minU, u);
          maxU = Math.max(maxU, u);
          cnt++;
        }
      }
    }
    if (cnt >= 8) {
      const fanU = sumU / cnt;
      const fanV = sumV / cnt;
      const fanWorld = unprojectPixelWorld(fanU, fanV, wallDepthAnchorM * 0.72, markers);
      architecturalFeatures.push({
        type: 'ceiling-fan',
        x: Number(clamp(fanWorld.x - centerXOffset, -roomWidthM * 0.36, roomWidthM * 0.36).toFixed(2)),
        z: Number(clamp(-roomDepthM * 0.16, -roomDepthM * 0.35, 0.25).toFixed(2)),
        widthM: Number(clamp((maxU - minU) * roomWidthM * 1.15, 0.9, 1.32).toFixed(2)),
        depthM: 1.08,
        heightM: 0.32,
        elevationM: ceilingM,
        rotationDeg: 0,
        primaryColor: '#eef0f2',
        secondaryColor: '#22262d',
      });
      fanPlaced = true;
    }
  }
  if (!fanPlaced && markers.ceilingY >= 0.16) {
    const fCols = 14;
    const fRows = 6;
    const cy0 = clamp(markers.ceilingY * 0.35, 0.06, 0.18);
    const cy1 = clamp(markers.ceilingY + 0.06, cy0 + 0.06, 0.36);
    let bestHubU = -1;
    let bestHubScore = 0;
    for (let r = 1; r < fRows - 1; r++) {
      const v = cy0 + ((r + 0.5) / fRows) * (cy1 - cy0);
      const py = clamp(Math.floor(v * rgbaH), 0, rgbaH - 1);
      for (let c = 1; c < fCols - 1; c++) {
        const u = 0.12 + ((c + 0.5) / fCols) * 0.65;
        if (doorwayBoxes.some((d) => u >= d.minU - 0.02 && u <= d.maxU + 0.02)) continue;
        const px = clamp(Math.floor(u * rgbaW), 0, rgbaW - 1);
        const idx = (py * rgbaW + px) * 4;
        const lum = 0.299 * rgba[idx] + 0.587 * rgba[idx + 1] + 0.114 * rgba[idx + 2];
        if (lum >= 65) continue;
        // Require bright ceiling surrounding this dark motor drop
        const leftIdx = (py * rgbaW + Math.max(0, px - Math.floor(rgbaW * 0.05))) * 4;
        const rightIdx = (py * rgbaW + Math.min(rgbaW - 1, px + Math.floor(rgbaW * 0.05))) * 4;
        const lumL = 0.299 * rgba[leftIdx] + 0.587 * rgba[leftIdx + 1] + 0.114 * rgba[leftIdx + 2];
        const lumR = 0.299 * rgba[rightIdx] + 0.587 * rgba[rightIdx + 1] + 0.114 * rgba[rightIdx + 2];
        const surroundBright = (lumL + lumR) * 0.5 - lum;
        if (surroundBright >= 75 && surroundBright > bestHubScore) {
          bestHubScore = surroundBright;
          bestHubU = u;
        }
      }
    }
    if (bestHubU > 0) {
      const fanWorld = unprojectPixelWorld(bestHubU, markers.ceilingY * 0.72, wallDepthAnchorM * 0.68, markers);
      architecturalFeatures.push({
        type: 'ceiling-fan',
        x: Number(clamp(fanWorld.x - centerXOffset, -roomWidthM * 0.36, roomWidthM * 0.36).toFixed(2)),
        z: Number(clamp(-roomDepthM * 0.18, -roomDepthM * 0.35, 0.25).toFixed(2)),
        widthM: 1.08,
        depthM: 1.08,
        heightM: 0.32,
        elevationM: ceilingM,
        rotationDeg: 0,
        primaryColor: '#eef0f2',
        secondaryColor: '#22262d',
      });
    }
  }

  // 7d) Foreground overhead ceiling soffit beam detector
  if (wallModalRawDisp >= 0.35) {
    const beamRowLimit = Math.max(2, Math.floor(clamp(markers.ceilingY * 0.78, 0.08, 0.22) * gH));
    let beamSpanCols = 0;
    const beamPx: Array<{ u: number; v: number }> = [];
    for (let gx = 0; gx < gW; gx++) {
      let colProtrudes = false;
      for (let gy = 0; gy < beamRowLimit; gy++) {
        if (gridRawDisp[gy * gW + gx] >= wallModalRawDisp * 1.24) {
          colProtrudes = true;
          beamPx.push({ u: (gx + 0.5) / gW, v: (gy + 0.5) / gH });
        }
      }
      if (colProtrudes) beamSpanCols++;
    }
    if (beamSpanCols >= Math.floor(gW * 0.45) && beamPx.length >= 12) {
      const beamCols = sampleMaskColors(rgba, rgbaW, rgbaH, beamPx, '#b8b9bd', '#2d3138');
      architecturalFeatures.push({
        type: 'soffit-beam',
        x: 0,
        z: Number((roomDepthM * 0.26).toFixed(2)),
        widthM: roomWidthM,
        depthM: 0.34,
        heightM: 0.36,
        elevationM: Number(clamp(ceilingM - 0.36, 1.9, ceilingM - 0.2).toFixed(2)),
        rotationDeg: 0,
        primaryColor: beamCols.primaryColor,
        secondaryColor: beamCols.secondaryColor,
      });
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
      ...(palette.groutColor ? { groutColor: palette.groutColor } : {}),
      wallColor: palette.wallColor,
      ...(palette.leftWallColor ? { leftWallColor: palette.leftWallColor } : {}),
      ...(palette.upperWallColor ? { upperWallColor: palette.upperWallColor } : {}),
      accentWallColor: palette.accentWallColor,
      ceilingColor: palette.ceilingColor,
      trimColor: palette.trimColor,
      lightingMood: palette.lightingMood,
      objects,
      ...(architecturalFeatures.length > 0 ? { architecturalFeatures } : {}),
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
