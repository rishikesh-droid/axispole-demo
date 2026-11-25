import type {
  MeasuredRoomObject3D,
  ReplicaCameraPose,
  ReplicaDepthMeshData,
  RoomReplicaObject,
  RoomReplicaObjectType,
} from '../types/pole';
import type { ARMarkerState } from './arMeasure';
import type { VisionSegment } from './roomVisionDetector';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = clamp(Math.floor(p * (sorted.length - 1)), 0, sorted.length - 1);
  return sorted[idx];
}

/**
 * Edge-preserving bilateral filter on a 2D depth grid.
 * Flattens micro-ripple on walls, floor, and ceiling while preserving sharp
 * 3D depth boundaries at foreground furniture, plants, and architectural columns.
 */
export function bilateralSmoothDepth(
  depth: Float32Array,
  w: number,
  h: number,
  radius = 2,
  sigmaSpatial = 1.6,
  sigmaRange = 0.16
): Float32Array {
  const out = new Float32Array(w * h);
  const twoSigS2 = 2 * sigmaSpatial * sigmaSpatial;
  const twoSigR2 = 2 * sigmaRange * sigmaRange;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const centerIdx = y * w + x;
      const z0 = depth[centerIdx];
      let sumW = 0;
      let sumZ = 0;
      const yMin = Math.max(0, y - radius);
      const yMax = Math.min(h - 1, y + radius);
      const xMin = Math.max(0, x - radius);
      const xMax = Math.min(w - 1, x + radius);

      for (let ny = yMin; ny <= yMax; ny++) {
        const dy = ny - y;
        for (let nx = xMin; nx <= xMax; nx++) {
          const dx = nx - x;
          const zn = depth[ny * w + nx];
          const dz = (zn - z0) / Math.max(0.5, z0);
          const wSpatial = Math.exp(-(dx * dx + dy * dy) / twoSigS2);
          const wRange = Math.exp(-(dz * dz) / twoSigR2);
          const weight = wSpatial * wRange;
          sumW += weight;
          sumZ += zn * weight;
        }
      }
      out[centerIdx] = sumW > 1e-6 ? sumZ / sumW : z0;
    }
  }
  return out;
}

/**
 * Resamples a Float32Array 2D field to (dstW x dstH) via bilinear interpolation.
 */
export function resampleFloatField(
  src: Float32Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): Float32Array {
  if (srcW === dstW && srcH === dstH) {
    return new Float32Array(src);
  }
  const out = new Float32Array(dstW * dstH);
  for (let y = 0; y < dstH; y++) {
    const fy = (y / Math.max(1, dstH - 1)) * (srcH - 1);
    const y0 = Math.floor(fy);
    const y1 = Math.min(srcH - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < dstW; x++) {
      const fx = (x / Math.max(1, dstW - 1)) * (srcW - 1);
      const x0 = Math.floor(fx);
      const x1 = Math.min(srcW - 1, x0 + 1);
      const wx = fx - x0;
      const v00 = src[y0 * srcW + x0];
      const v10 = src[y0 * srcW + x1];
      const v01 = src[y1 * srcW + x0];
      const v11 = src[y1 * srcW + x1];
      const top = v00 + (v10 - v00) * wx;
      const bot = v01 + (v11 - v01) * wx;
      out[y * dstW + x] = top + (bot - top) * wy;
    }
  }
  return out;
}

export interface DepthCalibrationOptions {
  ceilingHeightCm: number;
  distanceM: number;
  imageAspect: number;
  markers: ARMarkerState;
}

/**
 * Computes effective vertical FOV (degrees) appropriate for the full native room image.
 * Smartphones in portrait orientation typically have ~60 deg vertical FOV; landscape ~54 deg.
 */
export function computeEffectiveVfovDeg(imageAspect: number, markerVfovDeg?: number): number {
  if (imageAspect < 0.92) {
    return 60;
  }
  return clamp(markerVfovDeg ?? 54, 46, 66);
}

/**
 * Converts Depth Anything V2 affine-invariant inverse-depth / disparity into true
 * metric forward depth Z(u, v) in meters via exact 1 / (a * d + b) mapping.
 * Preserves planarity of flat receding walls, floors, and ceilings in 3D Euclidean space.
 */
export function calibrateDisparityToMetricDepth(
  disparity: Float32Array,
  w: number,
  h: number,
  isInverseDepth: boolean,
  opts: DepthCalibrationOptions
): { depthMeters: Float32Array; backWallDepthM: number; vfovDeg: number } {
  const ceilingM = clamp(opts.ceilingHeightCm / 100, 2.1, 4.2);
  const vfovDeg = computeEffectiveVfovDeg(opts.imageAspect, opts.markers.vfovDeg);
  const tanHalfV = Math.tan(((vfovDeg * Math.PI) / 180) * 0.5);

  // Estimate back-wall depth from vertical room span & user AR distance
  const vCeil = clamp(opts.markers.ceilingY ?? 0.16, 0.08, 0.34);
  const vFloor = clamp(opts.markers.floorY ?? 0.76, 0.58, 0.9);
  const wallSpanV = clamp(vFloor - vCeil, 0.36, 0.74);
  const geomBackZ = ceilingM / (wallSpanV * 2 * tanHalfV);
  const backWallDepthM = clamp(
    opts.distanceM > 1.8 && opts.distanceM < 6.5
      ? geomBackZ * 0.55 + opts.distanceM * 0.45
      : geomBackZ,
    2.6,
    5.6
  );
  const nearDepthM = clamp(backWallDepthM * 0.33, 1.05, backWallDepthM * 0.52);

  // Sample central back-wall disparity and near-foreground disparity
  const backSamples: number[] = [];
  const nearSamples: number[] = [];
  const allSamples: number[] = [];

  for (let y = 0; y < h; y++) {
    const v = y / Math.max(1, h - 1);
    for (let x = 0; x < w; x++) {
      const u = x / Math.max(1, w - 1);
      const raw = disparity[y * w + x];
      if (!Number.isFinite(raw)) continue;
      const d = isInverseDepth ? raw : 1 / Math.max(0.05, raw);
      if ((x & 1) === 0 && (y & 1) === 0) allSamples.push(d);
      if (u >= 0.28 && u <= 0.72 && v >= 0.2 && v <= 0.56) {
        backSamples.push(d);
      }
      if (v >= 0.68 || u <= 0.14 || u >= 0.86) {
        nearSamples.push(d);
      }
    }
  }

  const dMin = percentile(allSamples, 0.03);
  const dMax = percentile(allSamples, 0.97);
  const dBackRaw = backSamples.length > 16 ? percentile(backSamples, 0.45) : percentile(allSamples, 0.28);
  const dNearRaw = nearSamples.length > 16 ? percentile(nearSamples, 0.94) : dMax;

  // Ensure strictly positive disparity separation (closer = higher inverse depth)
  const dBack = clamp(dBackRaw, dMin, dMax - (dMax - dMin) * 0.15);
  const dNear = Math.max(dBack + Math.max(1e-3, (dMax - dMin) * 0.22), dNearRaw);

  const invBack = 1 / backWallDepthM;
  const invNear = 1 / nearDepthM;
  const a = (invNear - invBack) / Math.max(1e-5, dNear - dBack);
  const b = invBack - a * dBack;

  const minInvZ = 1 / (backWallDepthM * 1.58);
  const maxInvZ = 1 / 0.85;

  const depthMeters = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const raw = disparity[i];
    const d = Number.isFinite(raw) ? (isInverseDepth ? raw : 1 / Math.max(0.05, raw)) : dBack;
    const invZ = clamp(a * d + b, minInvZ, maxInvZ);
    depthMeters[i] = 1 / invZ;
  }

  return { depthMeters, backWallDepthM, vfovDeg };
}

/**
 * Pure-JS local 3D geometric + visual depth estimator (used when offline or neural depth
 * is unavailable). Builds an authentic 5-plane perspective 3D room shell (receding floor,
 * angled left & right walls, flat back wall, recessed ceiling) plus foreground object depth
 * extrusion so the reconstructed room is ALWAYS genuinely 3D and never a flat billboard.
 */
export function estimateHeuristicDepthMap(
  rgba: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
  opts: DepthCalibrationOptions
): { depthMeters: Float32Array; backWallDepthM: number; vfovDeg: number } {
  const ceilingM = clamp(opts.ceilingHeightCm / 100, 2.1, 4.2);
  const vfovDeg = computeEffectiveVfovDeg(opts.imageAspect, opts.markers.vfovDeg);
  const tanHalfV = Math.tan(((vfovDeg * Math.PI) / 180) * 0.5);
  const tanHalfH = tanHalfV * opts.imageAspect;

  // Compute luminance & vertical/horizontal gradient profiles to locate structural wall seams
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    lum[i] = (0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]) / 255;
  }

  const colEnergy = new Float32Array(w);
  const rowEnergy = new Float32Array(h);
  for (let y = 1; y < h - 1; y++) {
    const inMidY = y > h * 0.18 && y < h * 0.72;
    for (let x = 1; x < w - 1; x++) {
      const gx = Math.abs(lum[y * w + x + 1] - lum[y * w + x - 1]);
      const gy = Math.abs(lum[(y + 1) * w + x] - lum[(y - 1) * w + x]);
      if (inMidY) colEnergy[x] += gx;
      if (x > w * 0.22 && x < w * 0.78) rowEnergy[y] += gy;
    }
  }

  // Locate back-wall left/right corners and floor/ceiling seams near architectural priors
  let uLeft = clamp(opts.markers.leftCornerX ?? 0.24, 0.14, 0.36);
  let uRight = clamp(opts.markers.rightCornerX ?? 0.76, 0.64, 0.86);
  let vCeil = clamp(opts.markers.ceilingY ?? 0.17, 0.1, 0.3);
  let vFloor = clamp(opts.markers.floorY ?? 0.75, 0.6, 0.86);

  // Refine left/right wall corners using strongest column contrast jump
  let bestLeftScore = -1;
  for (let x = Math.floor(w * 0.16); x <= Math.floor(w * 0.36); x++) {
    const score = colEnergy[x];
    if (score > bestLeftScore) {
      bestLeftScore = score;
      uLeft = x / Math.max(1, w - 1);
    }
  }
  let bestRightScore = -1;
  for (let x = Math.floor(w * 0.64); x <= Math.floor(w * 0.85); x++) {
    const score = colEnergy[x];
    if (score > bestRightScore) {
      bestRightScore = score;
      uRight = x / Math.max(1, w - 1);
    }
  }
  let bestCeilScore = -1;
  for (let y = Math.floor(h * 0.1); y <= Math.floor(h * 0.28); y++) {
    if (rowEnergy[y] > bestCeilScore) {
      bestCeilScore = rowEnergy[y];
      vCeil = y / Math.max(1, h - 1);
    }
  }
  let bestFloorScore = -1;
  for (let y = Math.floor(h * 0.64); y <= Math.floor(h * 0.84); y++) {
    if (rowEnergy[y] > bestFloorScore) {
      bestFloorScore = rowEnergy[y];
      vFloor = y / Math.max(1, h - 1);
    }
  }

  const wallSpanV = clamp(vFloor - vCeil, 0.38, 0.72);
  const backWallDepthM = clamp(ceilingM / (wallSpanV * 2 * tanHalfV), 2.8, 5.2);
  const camY = clamp(((vFloor - 0.5) / wallSpanV) * ceilingM, ceilingM * 0.38, ceilingM * 0.62);
  const ceilAboveCam = Math.max(0.55, ceilingM - camY);

  // Exact world X of left & right side walls at the back wall seam
  const xLeftWall = (uLeft - 0.5) * 2 * tanHalfH * backWallDepthM;
  const xRightWall = (uRight - 0.5) * 2 * tanHalfH * backWallDepthM;

  // Estimate average open-floor color at bottom-center to identify foreground occluders on floor
  let floorR = 0;
  let floorG = 0;
  let floorB = 0;
  let floorN = 0;
  for (let y = Math.floor(h * 0.8); y < Math.floor(h * 0.96); y++) {
    for (let x = Math.floor(w * 0.38); x < Math.floor(w * 0.66); x++) {
      const p = (y * w + x) * 4;
      floorR += rgba[p];
      floorG += rgba[p + 1];
      floorB += rgba[p + 2];
      floorN++;
    }
  }
  if (floorN > 0) {
    floorR /= floorN;
    floorG /= floorN;
    floorB /= floorN;
  }

  const depthMeters = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    const v = y / Math.max(1, h - 1);
    const ny = (0.5 - v) * 2; // +1 top, -1 bottom
    const rayY = ny * tanHalfV;

    for (let x = 0; x < w; x++) {
      const u = x / Math.max(1, w - 1);
      const nx = (u - 0.5) * 2; // -1 left, +1 right
      const rayX = nx * tanHalfH;

      // Exact ray intersection with the 5 room planes: take the closest valid hit!
      let zPlane = backWallDepthM;

      // Floor plane (Y_cam = -camY)
      if (rayY < -0.02) {
        const zFl = camY / -rayY;
        if (zFl > 0.7 && zFl < zPlane) zPlane = zFl;
      }
      // Ceiling plane (Y_cam = +ceilAboveCam)
      if (rayY > 0.02) {
        const zCl = ceilAboveCam / rayY;
        if (zCl > 0.7 && zCl < zPlane) zPlane = zCl;
      }
      // Left wall plane (X_cam = xLeftWall)
      if (rayX < -0.02 && xLeftWall < -0.2) {
        const zLw = xLeftWall / rayX;
        if (zLw > 0.7 && zLw < zPlane) zPlane = zLw;
      }
      // Right wall plane (X_cam = xRightWall)
      if (rayX > 0.02 && xRightWall > 0.2) {
        const zRw = xRightWall / rayX;
        if (zRw > 0.7 && zRw < zPlane) zPlane = zRw;
      }

      // Foreground object extrusion for floor-anchored foreground occluders (e.g. corner sofa / pillar)
      let zFinal = zPlane;
      if (v > 0.55) {
        const p = (y * w + x) * 4;
        const dr = (rgba[p] - floorR) / 255;
        const dg = (rgba[p + 1] - floorG) / 255;
        const db = (rgba[p + 2] - floorB) / 255;
        const colorDist = Math.sqrt(dr * dr + dg * dg + db * db);
        const edgeSideWeight = u < 0.34 || u > 0.8 ? 1.0 : 0.45;
        if (colorDist > 0.17 && edgeSideWeight > 0.5 && v > 0.65) {
          // Extrude foreground furniture closer toward the camera cleanly
          const pull = clamp((colorDist - 0.15) * 1.45, 0, 0.48) * edgeSideWeight;
          zFinal = Math.max(1.18, zPlane * (1 - pull));
        }
      }

      depthMeters[y * w + x] = clamp(zFinal, 0.95, backWallDepthM * 1.35);
    }
  }

  const smoothed = bilateralSmoothDepth(depthMeters, w, h, 2, 1.5, 0.14);
  return { depthMeters: smoothed, backWallDepthM, vfovDeg };
}

/**
 * Extracts crisp 1px-style architectural CAD ink line opacity (0..1) from an RGB room image.
 * Combines color-aware Sobel gradients + 4-direction Non-Maximum Suppression (edge thinning)
 * + light-surface dark-stroke preservation so dark walls/furniture turn pure CAD white with
 * razor-sharp black architectural contours, matching professional architectural hidden-line CAD.
 */
export function extractArchitecturalInkAlpha(
  rgba: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number
): Float32Array {
  const n = w * h;
  const rArr = new Float32Array(n);
  const gArr = new Float32Array(n);
  const bArr = new Float32Array(n);
  const lum = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const r = rgba[p] / 255;
    const g = rgba[p + 1] / 255;
    const b = rgba[p + 2] / 255;
    rArr[i] = r;
    gArr[i] = g;
    bArr[i] = b;
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // Gentle 3x3 Gaussian blur on luminance & channels to eliminate sensor grain while keeping thin slats crisp
  const blurChannel = (src: Float32Array): Float32Array => {
    const dst = new Float32Array(n);
    for (let y = 0; y < h; y++) {
      const ym = Math.max(0, y - 1);
      const yp = Math.min(h - 1, y + 1);
      for (let x = 0; x < w; x++) {
        const xm = Math.max(0, x - 1);
        const xp = Math.min(w - 1, x + 1);
        const c =
          src[ym * w + xm] +
          2 * src[ym * w + x] +
          src[ym * w + xp] +
          2 * src[y * w + xm] +
          4 * src[y * w + x] +
          2 * src[y * w + xp] +
          src[yp * w + xm] +
          2 * src[yp * w + x] +
          src[yp * w + xp];
        dst[y * w + x] = c / 16;
      }
    }
    return dst;
  };

  const lumB = blurChannel(lum);
  const rB = blurChannel(rArr);
  const gB = blurChannel(gArr);
  const bB = blurChannel(bArr);
  // Secondary wider blur for local-contrast dark-text/graphic preservation on white walls
  const lumWide = blurChannel(blurChannel(lumB));

  const mag = new Float32Array(n);
  const dir = new Uint8Array(n); // 0: horiz, 1: 45, 2: vert, 3: 135

  for (let y = 1; y < h - 1; y++) {
    const ym = (y - 1) * w;
    const y0 = y * w;
    const yp = (y + 1) * w;
    for (let x = 1; x < w - 1; x++) {
      const xm = x - 1;
      const xp = x + 1;

      const sobel = (ch: Float32Array): [number, number] => {
        const gx =
          -ch[ym + xm] +
          ch[ym + xp] -
          2 * ch[y0 + xm] +
          2 * ch[y0 + xp] -
          ch[yp + xm] +
          ch[yp + xp];
        const gy =
          -ch[ym + xm] -
          2 * ch[ym + x] -
          ch[ym + xp] +
          ch[yp + xm] +
          2 * ch[yp + x] +
          ch[yp + xp];
        return [gx, gy];
      };

      const [lx, ly] = sobel(lumB);
      const [rx, ry] = sobel(rB);
      const [gx, gy] = sobel(gB);
      const [bx, by] = sobel(bB);

      const mL = Math.hypot(lx, ly);
      const mC = Math.max(Math.hypot(rx, ry), Math.hypot(gx, gy), Math.hypot(bx, by));
      const m = Math.max(mL * 1.05, mC * 0.92);
      mag[y0 + x] = m;

      // Quantize dominant gradient angle into 4 directions for Canny NMS thinning
      const ang = (Math.atan2(ly, lx) * 180) / Math.PI;
      const a = ang < 0 ? ang + 180 : ang;
      if (a < 22.5 || a >= 157.5) dir[y0 + x] = 0;
      else if (a < 67.5) dir[y0 + x] = 1;
      else if (a < 112.5) dir[y0 + x] = 2;
      else dir[y0 + x] = 3;
    }
  }

  // Adaptive gradient scale so both high-contrast and softly-lit rooms render crisp architectural ink
  const gradSamples: number[] = [];
  for (let i = 0; i < n; i += 7) {
    if (mag[i] > 0.02) gradSamples.push(mag[i]);
  }
  const p85 = Math.max(0.16, percentile(gradSamples, 0.85));
  const lowThresh = clamp(p85 * 0.28, 0.075, 0.22);
  const highThresh = clamp(p85 * 1.15, 0.28, 0.78);

  const ink = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const m = mag[idx];
      if (m < lowThresh * 0.7) {
        // Still check crisp dark text/graphics on bright walls (Difference of Gaussians)
        const localBright = lumWide[idx];
        const darkDip = localBright - lumB[idx];
        if (localBright > 0.56 && darkDip > 0.09) {
          ink[idx] = clamp((darkDip - 0.08) / 0.16, 0, 0.92);
        }
        continue;
      }

      // Canny 4-way Non-Maximum Suppression for clean 1px CAD pen strokes
      let n1 = 0;
      let n2 = 0;
      const d = dir[idx];
      if (d === 0) {
        n1 = mag[idx - 1];
        n2 = mag[idx + 1];
      } else if (d === 1) {
        n1 = mag[(y - 1) * w + (x + 1)];
        n2 = mag[(y + 1) * w + (x - 1)];
      } else if (d === 2) {
        n1 = mag[(y - 1) * w + x];
        n2 = mag[(y + 1) * w + x];
      } else {
        n1 = mag[(y - 1) * w + (x - 1)];
        n2 = mag[(y + 1) * w + (x + 1)];
      }

      const isRidge = m >= n1 * 0.96 && m >= n2 * 0.96;
      const ridgeVal = isRidge
        ? clamp((m - lowThresh) / Math.max(0.08, highThresh - lowThresh), 0, 1)
        : m > highThresh * 1.15
          ? clamp((m - highThresh) / 0.45, 0, 0.55)
          : 0;

      // Boost crisp dark text/thin linework on bright architectural walls
      const localBright = lumWide[idx];
      const darkDip = localBright - lumB[idx];
      const dogInk =
        localBright > 0.54 && darkDip > 0.085
          ? clamp((darkDip - 0.075) / 0.15, 0, 0.95)
          : 0;

      const rawInk = Math.max(ridgeVal, dogInk);
      // Clean speckle gate so walls & floors render spotless pure CAD white with razor-black ink
      ink[idx] = rawInk < 0.14 ? 0 : clamp(Math.pow(rawInk, 0.84) * 1.28, 0, 1);
    }
  }

  return ink;
}

export interface BuildMetricDepthMeshOptions {
  ceilingHeightCm: number;
  imageAspect: number;
  vfovDeg: number;
  backWallDepthM: number;
  depthEngine: 'depth-anything-v2' | 'geometric-depth';
  cadEdgeDataUrl?: string;
  blueprintEdgeDataUrl?: string;
  sourcePhotoDataUrl?: string;
  segments?: VisionSegment[];
  segWidth?: number;
  segHeight?: number;
}

/**
 * Unprojects a calibrated metric depth grid into AxisPole world coordinates:
 * - Open floor grounded cleanly at Y = 0
 * - Ceiling aligned to ceilingHeightCm / 100
 * - Central open floor zone centered around (X = 0, Z = 0) where AxisPole stands
 * - Depth-discontinuity-pruned triangles (zero rubber-sheet stretching across foreground occluders!)
 * - Dual 3D architectural wireframe linework (subtle structural wall grid + crisp foreground quad mesh)
 * - Sharp 3D depth-silhouette & surface-normal crease contour lines
 */
export function buildMetricDepthMesh(
  depthMeters: Float32Array,
  gridW: number,
  gridH: number,
  opts: BuildMetricDepthMeshOptions
): ReplicaDepthMeshData {
  const ceilingM = clamp(opts.ceilingHeightCm / 100, 2.1, 4.2);
  const tanHalfV = Math.tan(((opts.vfovDeg * Math.PI) / 180) * 0.5);
  const tanHalfH = tanHalfV * opts.imageAspect;

  const vertCount = gridW * gridH;
  const rawX = new Float32Array(vertCount);
  const rawY = new Float32Array(vertCount);
  const rawZ = new Float32Array(vertCount);
  const uvs = new Float32Array(vertCount * 2);

  // 1. Pinhole unprojection in camera coordinates (+X right, +Y up, -Z forward)
  for (let gy = 0; gy < gridH; gy++) {
    const v = gy / Math.max(1, gridH - 1);
    const ny = (0.5 - v) * 2;
    for (let gx = 0; gx < gridW; gx++) {
      const u = gx / Math.max(1, gridW - 1);
      const nx = (u - 0.5) * 2;
      const idx = gy * gridW + gx;
      const z = depthMeters[idx];
      rawX[idx] = nx * z * tanHalfH;
      rawY[idx] = ny * z * tanHalfV;
      rawZ[idx] = -z;
      uvs[idx * 2] = u;
      uvs[idx * 2 + 1] = 1 - v;
    }
  }

  // 2. Ground floor to Y = 0 and scale uniformly so vertical span matches ceilingM
  const floorYSamples: number[] = [];
  const ceilYSamples: number[] = [];
  const backZSamples: number[] = [];

  for (let gy = 0; gy < gridH; gy++) {
    const v = gy / Math.max(1, gridH - 1);
    for (let gx = 0; gx < gridW; gx++) {
      const u = gx / Math.max(1, gridW - 1);
      const idx = gy * gridW + gx;
      if (v >= 0.76 && v <= 0.96 && u >= 0.3 && u <= 0.7) {
        floorYSamples.push(rawY[idx]);
      }
      if (v >= 0.04 && v <= 0.2 && u >= 0.25 && u <= 0.75) {
        ceilYSamples.push(rawY[idx]);
      }
      if (v >= 0.25 && v <= 0.58 && u >= 0.3 && u <= 0.7) {
        backZSamples.push(rawZ[idx]);
      }
    }
  }

  const yFloorRaw = floorYSamples.length > 8 ? percentile(floorYSamples, 0.03) : -ceilingM * 0.48;
  // Use lower-median ceiling height so the reconstructed ceiling plane seats ABOVE the pole top dome
  const yCeilRaw = ceilYSamples.length > 8 ? percentile(ceilYSamples, 0.42) : ceilingM * 0.52;
  const rawSpanY = Math.max(1.2, yCeilRaw - yFloorRaw);
  const uniformScale = clamp((ceilingM * 1.07) / rawSpanY, 0.8, 1.52);

  const backZScaled =
    (backZSamples.length > 8 ? percentile(backZSamples, 0.45) : -opts.backWallDepthM) * uniformScale;
  // Seat pole origin (0, 0, 0) cleanly on the open visible floor ~0.88m in front of the back wall (tucked under the room ceiling!)
  const poleFloorZInCam = clamp(backZScaled + 0.88, backZScaled * 0.74, -0.7);

  const positions = new Float32Array(vertCount * 3);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < vertCount; i++) {
    const wx = rawX[i] * uniformScale;
    const rawWy = (rawY[i] - yFloorRaw) * uniformScale;
    // Gently compress any sub-floor foreground corner vertices instead of clipping or folding flat
    const wy = rawWy < 0 ? Math.max(-0.024, rawWy * 0.16) : rawWy;
    const wz = rawZ[i] * uniformScale - poleFloorZInCam;
    positions[i * 3] = wx;
    positions[i * 3 + 1] = wy;
    positions[i * 3 + 2] = wz;
    if (wx < minX) minX = wx;
    if (wx > maxX) maxX = wx;
    if (wy < minY) minY = wy;
    if (wy > maxY) maxY = wy;
    if (wz < minZ) minZ = wz;
    if (wz > maxZ) maxZ = wz;
  }

  // Camera origin in AxisPole world space (used to guarantee 100% consistent inward-facing winding)
  const camOriginY = -yFloorRaw * uniformScale;
  const camOriginZ = -poleFloorZInCam;

  // 3. Build continuous surface triangles + clean untextured occlusion-cliff side skirts
  //    so foreground furniture (sofas, pillars, planters) stay 100% solid & watertight with zero UV smearing!
  const maxRelJump = 0.24;
  const minAbsJumpM = 0.48;
  const triIndices: number[] = [];
  const skirtIndices: number[] = [];
  const isJump = (a: number, b: number): boolean => {
    const za = depthMeters[a];
    const zb = depthMeters[b];
    const absDz = Math.abs(za - zb);
    if (absDz < minAbsJumpM) return false;
    const m = Math.min(za, zb);
    return absDz / Math.max(0.4, m) > maxRelJump;
  };

  // Push triangle ensuring its normal faces INWARD toward the capture camera (prevents backface holes on sofa seats!)
  const pushInwardTri = (targetArr: number[], a: number, b: number, c: number) => {
    const ax = positions[a * 3];
    const ay = positions[a * 3 + 1];
    const az = positions[a * 3 + 2];
    const bx = positions[b * 3];
    const by = positions[b * 3 + 1];
    const bz = positions[b * 3 + 2];
    const cx = positions[c * 3];
    const cy = positions[c * 3 + 1];
    const cz = positions[c * 3 + 2];

    const e1x = bx - ax;
    const e1y = by - ay;
    const e1z = bz - az;
    const e2x = cx - ax;
    const e2y = cy - ay;
    const e2z = cz - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    // Vector from triangle center to capture camera
    const vx = 0 - (ax + bx + cx) / 3;
    const vy = camOriginY - (ay + by + cy) / 3;
    const vz = camOriginZ - (az + bz + cz) / 3;

    if (nx * vx + ny * vy + nz * vz >= 0) {
      targetArr.push(a, b, c);
    } else {
      targetArr.push(a, c, b);
    }
  };

  for (let gy = 0; gy < gridH - 1; gy++) {
    for (let gx = 0; gx < gridW - 1; gx++) {
      const i00 = gy * gridW + gx;
      const i10 = i00 + 1;
      const i01 = i00 + gridW;
      const i11 = i01 + 1;

      if (!isJump(i00, i10) && !isJump(i00, i01) && !isJump(i10, i01)) {
        pushInwardTri(triIndices, i00, i01, i10);
      } else {
        pushInwardTri(skirtIndices, i00, i01, i10);
      }
      if (!isJump(i10, i11) && !isJump(i01, i11) && !isJump(i10, i01)) {
        pushInwardTri(triIndices, i10, i01, i11);
      } else {
        pushInwardTri(skirtIndices, i10, i01, i11);
      }
    }
  }

  // 4. Compute per-vertex surface normals for crease detection and side-wall filtering
  const normX = new Float32Array(vertCount);
  const normY = new Float32Array(vertCount);
  const normZ = new Float32Array(vertCount);
  for (let gy = 1; gy < gridH - 1; gy++) {
    for (let gx = 1; gx < gridW - 1; gx++) {
      const idx = gy * gridW + gx;
      const iL = idx - 1;
      const iR = idx + 1;
      const iU = idx - gridW;
      const iD = idx + gridW;
      const dxX = positions[iR * 3] - positions[iL * 3];
      const dxY = positions[iR * 3 + 1] - positions[iL * 3 + 1];
      const dxZ = positions[iR * 3 + 2] - positions[iL * 3 + 2];
      const dyX = positions[iD * 3] - positions[iU * 3];
      const dyY = positions[iD * 3 + 1] - positions[iU * 3 + 1];
      const dyZ = positions[iD * 3 + 2] - positions[iU * 3 + 2];
      // Cross (dY x dX) points toward camera (+Z)
      const cx = dyY * dxZ - dyZ * dxY;
      const cy = dyZ * dxX - dyX * dxZ;
      const cz = dyX * dxY - dyY * dxX;
      const len = Math.hypot(cx, cy, cz) || 1;
      normX[idx] = cx / len;
      normY[idx] = cy / len;
      normZ[idx] = cz / len;
    }
  }

  // 5. Generate clean architectural 3D wireframes:
  //    - Subtle wide grid on flat walls/ceiling (keeps ink linework uncluttered)
  //    - Clean CAD quad mesh specifically on foreground 3D furniture & planters (like sofa & pots!)
  //    - Sharp 3D depth-silhouette contours along occlusion cliffs
  const wireArr: number[] = [];
  const fgWireArr: number[] = [];
  const silArr: number[] = [];

  const pushSeg = (arr: number[], a: number, b: number) => {
    arr.push(
      positions[a * 3],
      positions[a * 3 + 1],
      positions[a * 3 + 2],
      positions[b * 3],
      positions[b * 3 + 1],
      positions[b * 3 + 2]
    );
  };

  const fgDepthCutoff = opts.backWallDepthM * 0.78;
  const coarseStep = 6;
  const fineStep = 3;

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const idx = gy * gridW + gx;
      const yWorld = positions[idx * 3 + 1];
      const zDepth = depthMeters[idx];
      const isSideWall = Math.abs(normX[idx]) > 0.76 && yWorld > ceilingM * 0.45;
      const isForegroundObject =
        !isSideWall && zDepth < fgDepthCutoff && yWorld > 0.06 && yWorld < ceilingM * 0.78;

      // Subtle architectural shell wireframe
      if (gy % coarseStep === 0 && gx < gridW - 1 && !isJump(idx, idx + 1)) {
        pushSeg(wireArr, idx, idx + 1);
      }
      if (gx % coarseStep === 0 && gy < gridH - 1 && !isJump(idx, idx + gridW)) {
        pushSeg(wireArr, idx, idx + gridW);
      }

      // Clean CAD quad mesh on foreground 3D furniture & pots
      if (isForegroundObject) {
        if (gy % fineStep === 0 && gx < gridW - 1 && !isJump(idx, idx + 1)) {
          pushSeg(fgWireArr, idx, idx + 1);
        }
        if (gx % fineStep === 0 && gy < gridH - 1 && !isJump(idx, idx + gridW)) {
          pushSeg(fgWireArr, idx, idx + gridW);
        }
      }

      // Crisp 3D depth-silhouette contours
      if (gx > 0 && gx < gridW - 1 && gy > 0 && gy < gridH - 1) {
        const rightIdx = idx + 1;
        const downIdx = idx + gridW;
        const rightJump = isJump(idx, rightIdx);
        const downJump = isJump(idx, downIdx);
        const dotR =
          normX[idx] * normX[rightIdx] + normY[idx] * normY[rightIdx] + normZ[idx] * normZ[rightIdx];
        const dotD =
          normX[idx] * normX[downIdx] + normY[idx] * normY[downIdx] + normZ[idx] * normZ[downIdx];

        if ((rightJump || dotR < 0.62) && gy < gridH - 1 && !isJump(idx, downIdx)) {
          const closer = depthMeters[idx] <= depthMeters[rightIdx] ? idx : rightIdx;
          const closerDown = closer + gridW;
          if (!isJump(closer, closerDown)) {
            pushSeg(silArr, closer, closerDown);
          }
        }
        if ((downJump || dotD < 0.62) && gx < gridW - 1 && !isJump(idx, rightIdx)) {
          const closer = depthMeters[idx] <= depthMeters[downIdx] ? idx : downIdx;
          const closerRight = closer + 1;
          if (!isJump(closer, closerRight)) {
            pushSeg(silArr, closer, closerRight);
          }
        }
      }
    }
  }

  // 6. Calibrated camera capture pose in AxisPole world coordinates
  const camYWorld = clamp(-yFloorRaw * uniformScale, 0.9, ceilingM - 0.5);
  const camZWorld = -poleFloorZInCam;
  const cameraPose: ReplicaCameraPose = {
    pos: [0, Number(camYWorld.toFixed(3)), Number(camZWorld.toFixed(3))],
    target: [0, Number(camYWorld.toFixed(3)), Number((backZScaled - poleFloorZInCam).toFixed(3))],
    vfovDeg: opts.vfovDeg,
    imageAspect: opts.imageAspect,
  };

  // 7. Calculate precise metric 3D object volumes (W x D x H) & world positions
  const measuredObjects = measure3DObjectsFromDepth(positions, depthMeters, gridW, gridH, {
    ceilingM,
    backWallDepthM: opts.backWallDepthM,
    normX,
    segments: opts.segments,
    segWidth: opts.segWidth,
    segHeight: opts.segHeight,
  });

  return {
    gridW,
    gridH,
    positions,
    uvs,
    indices: new Uint32Array(triIndices),
    skirtIndices: new Uint32Array(skirtIndices),
    wireframePositions: new Float32Array(wireArr),
    foregroundWirePositions: new Float32Array(fgWireArr),
    silhouettePositions: new Float32Array(silArr),
    cadEdgeDataUrl: opts.cadEdgeDataUrl ?? '',
    blueprintEdgeDataUrl: opts.blueprintEdgeDataUrl ?? '',
    sourcePhotoDataUrl: opts.sourcePhotoDataUrl ?? '',
    cameraPose,
    bounds: {
      minX: Number(minX.toFixed(3)),
      maxX: Number(maxX.toFixed(3)),
      minY: Number(minY.toFixed(3)),
      maxY: Number(maxY.toFixed(3)),
      minZ: Number(minZ.toFixed(3)),
      maxZ: Number(maxZ.toFixed(3)),
    },
    depthEngine: opts.depthEngine,
    measuredObjects,
  };
}

const MEASURABLE_SEMANTIC_LABELS: Record<string, string> = {
  sofa: 'Sofa',
  couch: 'Sofa',
  armchair: 'Lounge Sofa',
  seat: 'Seating',
  bench: 'Bench',
  ottoman: 'Ottoman',
  cushion: 'Sofa Cushion',
  chair: 'Chair',
  'swivel chair': 'Office Chair',
  desk: 'Desk',
  table: 'Table',
  'coffee table': 'Coffee Table',
  bed: 'Bed',
  plant: 'Potted Plant',
  'potted plant': 'Potted Plant',
  flora: 'Potted Plant',
  palm: 'Potted Tree',
  tree: 'Potted Tree',
  flower: 'Floral Planter',
  pot: 'Planter Pot',
  vase: 'Planter Vase',
  cabinet: 'Cabinet',
  wardrobe: 'Wardrobe',
  bookcase: 'Bookshelf',
  shelf: 'Shelving',
  chest: 'Console',
  lamp: 'Lamp',
  door: 'Doorway',
  windowpane: 'Window',
  mirror: 'Mirror',
  column: 'Column',
  pillar: 'Pillar',
};

/**
 * Measures real metric 3D object volumes (widthM x depthM x heightM) and exact world (x, y, z)
 * positions from semantic masks (when available) AND depth-foreground connected components.
 */
export function measure3DObjectsFromDepth(
  positions: Float32Array,
  depthMeters: Float32Array,
  gridW: number,
  gridH: number,
  opts: {
    ceilingM: number;
    backWallDepthM: number;
    normX?: Float32Array;
    segments?: VisionSegment[];
    segWidth?: number;
    segHeight?: number;
  }
): MeasuredRoomObject3D[] {
  const results: MeasuredRoomObject3D[] = [];
  const usedCells = new Uint8Array(gridW * gridH);

  // A. Measure semantically segmented 3D objects using exact vertex 3D positions
  if (opts.segments && opts.segments.length > 0 && opts.segWidth && opts.segHeight) {
    const segW = opts.segWidth;
    const segH = opts.segHeight;

    for (const seg of opts.segments) {
      const displayLabel = MEASURABLE_SEMANTIC_LABELS[seg.label];
      if (!displayLabel) continue;

      // Project mask onto mesh grid and extract connected components (handles twin potted trees separately!)
      const binary = new Uint8Array(gridW * gridH);
      for (let gy = 0; gy < gridH; gy++) {
        const sy = Math.min(segH - 1, Math.floor((gy / gridH) * segH));
        for (let gx = 0; gx < gridW; gx++) {
          const sx = Math.min(segW - 1, Math.floor((gx / gridW) * segW));
          if (seg.mask[sy * segW + sx] > 120) {
            binary[gy * gridW + gx] = 1;
          }
        }
      }

      const visited = new Uint8Array(gridW * gridH);
      const queue = new Int32Array(gridW * gridH);
      let compIndex = 0;

      for (let start = 0; start < gridW * gridH; start++) {
        if (!binary[start] || visited[start]) continue;
        let head = 0;
        let tail = 0;
        queue[tail++] = start;
        visited[start] = 1;

        const xs: number[] = [];
        const ys: number[] = [];
        const zs: number[] = [];
        const cells: number[] = [];

        while (head < tail) {
          const cur = queue[head++];
          cells.push(cur);
          xs.push(positions[cur * 3]);
          ys.push(positions[cur * 3 + 1]);
          zs.push(positions[cur * 3 + 2]);

          const cx = cur % gridW;
          const cy = (cur - cx) / gridW;
          const nbs = [
            cx > 0 ? cur - 1 : -1,
            cx < gridW - 1 ? cur + 1 : -1,
            cy > 0 ? cur - gridW : -1,
            cy < gridH - 1 ? cur + gridW : -1,
          ];
          for (const nb of nbs) {
            if (nb >= 0 && binary[nb] && !visited[nb]) {
              // Split touching objects if they lie at significantly different depths
              const zDiff = Math.abs(depthMeters[nb] - depthMeters[cur]);
              if (zDiff / Math.max(0.4, Math.min(depthMeters[nb], depthMeters[cur])) < 0.16) {
                visited[nb] = 1;
                queue[tail++] = nb;
              }
            }
          }
        }

        if (cells.length < Math.max(18, Math.floor(gridW * gridH * 0.004))) continue;

        const x0 = percentile(xs, 0.08);
        const x1 = percentile(xs, 0.92);
        const y0 = Math.max(0, percentile(ys, 0.06));
        const y1 = Math.min(opts.ceilingM, percentile(ys, 0.94));
        const z0 = percentile(zs, 0.1);
        const z1 = percentile(zs, 0.9);

        const widthM = clamp(x1 - x0, 0.22, 3.4);
        const heightM = clamp(y1 - y0, 0.25, opts.ceilingM);
        const depthM = clamp(Math.max(0.24, z1 - z0), 0.24, 2.4);

        if (widthM * heightM < 0.12) continue;

        for (const c of cells) usedCells[c] = 1;
        compIndex++;
        results.push({
          id: `meas-sem-${seg.label.replace(/\s+/g, '-')}-${compIndex}`,
          label: compIndex > 1 ? `${displayLabel} ${compIndex}` : displayLabel,
          x: Number(((x0 + x1) * 0.5).toFixed(2)),
          y: Number(((y0 + y1) * 0.5).toFixed(2)),
          z: Number(((z0 + z1) * 0.5).toFixed(2)),
          widthM: Number(widthM.toFixed(2)),
          depthM: Number(depthM.toFixed(2)),
          heightM: Number(heightM.toFixed(2)),
          minY: Number(y0.toFixed(2)),
          maxY: Number(y1.toFixed(2)),
          confidence: Number(seg.score.toFixed(2)),
          source: 'semantic',
        });
      }
    }
  }

  // B. Depth-foreground clustering (detects prominent 3D foreground volumes even without semantic labels!)
  if (results.length < 4) {
    const fgMask = new Uint8Array(gridW * gridH);
    const fgCutoff = opts.backWallDepthM * 0.76;
    for (let gy = 2; gy < gridH - 2; gy++) {
      for (let gx = 1; gx < gridW - 1; gx++) {
        const idx = gy * gridW + gx;
        if (usedCells[idx]) continue;
        const wy = positions[idx * 3 + 1];
        const zd = depthMeters[idx];
        // Exclude tall flat side walls (|normX| > 0.72) so we measure real 3D furniture & fixtures
        const isFlatSideWall = opts.normX && Math.abs(opts.normX[idx]) > 0.72 && wy > opts.ceilingM * 0.48;
        if (!isFlatSideWall && zd < fgCutoff && wy > 0.1 && wy < opts.ceilingM * 0.74) {
          fgMask[idx] = 1;
        }
      }
    }

    const visited = new Uint8Array(gridW * gridH);
    const queue = new Int32Array(gridW * gridH);
    let fgCount = 0;

    for (let start = 0; start < gridW * gridH; start++) {
      if (!fgMask[start] || visited[start]) continue;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      visited[start] = 1;

      const xs: number[] = [];
      const ys: number[] = [];
      const zs: number[] = [];

      while (head < tail) {
        const cur = queue[head++];
        xs.push(positions[cur * 3]);
        ys.push(positions[cur * 3 + 1]);
        zs.push(positions[cur * 3 + 2]);

        const cx = cur % gridW;
        const cy = (cur - cx) / gridW;
        const nbs = [
          cx > 0 ? cur - 1 : -1,
          cx < gridW - 1 ? cur + 1 : -1,
          cy > 0 ? cur - gridW : -1,
          cy < gridH - 1 ? cur + gridW : -1,
        ];
        for (const nb of nbs) {
          if (nb >= 0 && fgMask[nb] && !visited[nb]) {
            const zDiff = Math.abs(depthMeters[nb] - depthMeters[cur]);
            if (zDiff / Math.max(0.4, Math.min(depthMeters[nb], depthMeters[cur])) < 0.14) {
              visited[nb] = 1;
              queue[tail++] = nb;
            }
          }
        }
      }

      if (xs.length < Math.max(20, Math.floor(gridW * gridH * 0.008))) continue;

      const x0 = percentile(xs, 0.08);
      const x1 = percentile(xs, 0.92);
      const y0 = Math.max(0, percentile(ys, 0.06));
      const y1 = Math.min(opts.ceilingM, percentile(ys, 0.94));
      const z0 = percentile(zs, 0.1);
      const z1 = percentile(zs, 0.9);
      const widthM = clamp(x1 - x0, 0.25, 2.8);
      const heightM = clamp(y1 - y0, 0.3, opts.ceilingM - 0.1);
      const depthM = clamp(Math.max(0.28, z1 - z0), 0.28, 2.0);
      if (widthM * heightM < 0.12) continue;

      fgCount++;
      const cx = (x0 + x1) * 0.5;
      const inferredName =
        y1 < 1.15 && widthM > 0.55
          ? 'Foreground Lounge / Seating'
          : heightM > 1.35 && widthM < 0.95
            ? 'Vertical Fixture / Planter'
            : cx < -0.5
              ? 'Left Foreground Volume'
              : cx > 0.5
                ? 'Right Foreground Volume'
                : `3D Volume ${fgCount}`;

      results.push({
        id: `meas-depth-${fgCount}`,
        label: inferredName,
        x: Number(cx.toFixed(2)),
        y: Number(((y0 + y1) * 0.5).toFixed(2)),
        z: Number(((z0 + z1) * 0.5).toFixed(2)),
        widthM: Number(widthM.toFixed(2)),
        depthM: Number(depthM.toFixed(2)),
        heightM: Number(heightM.toFixed(2)),
        minY: Number(y0.toFixed(2)),
        maxY: Number(y1.toFixed(2)),
        confidence: 0.78,
        source: 'depth-cluster',
      });
      if (results.length >= 8) break;
    }
  }

  return results.slice(0, 8);
}

/**
 * Converts measured 3D objects into RoomReplicaObject records so the 2D Floor Plan
 * view accurately reflects the measured room layout and object footprints.
 */
export function measuredObjectsToReplicaObjects(
  measured: MeasuredRoomObject3D[]
): RoomReplicaObject[] {
  return measured.map((m) => {
    const low = m.label.toLowerCase();
    let type: RoomReplicaObjectType = 'cabinet';
    if (low.includes('sofa') || low.includes('lounge') || low.includes('seating')) type = 'sofa';
    else if (low.includes('plant') || low.includes('tree') || low.includes('planter')) type = 'plant';
    else if (low.includes('chair')) type = 'chair';
    else if (low.includes('desk')) type = 'desk';
    else if (low.includes('table')) type = 'table';
    else if (low.includes('bed')) type = 'bed';
    else if (low.includes('door')) type = 'door';
    else if (low.includes('window')) type = 'window';
    else if (low.includes('mirror')) type = 'mirror';
    else if (low.includes('lamp')) type = 'lamp';

    return {
      id: m.id,
      type,
      label: m.label,
      x: m.x,
      z: m.z,
      widthM: m.widthM,
      depthM: m.depthM,
      heightM: m.heightM,
      elevationM: m.minY,
      rotationDeg: 0,
      primaryColor: '#e2e8f0',
      secondaryColor: '#334155',
      inferred: false,
      confidence: m.confidence,
    };
  });
}

/**
 * Browser Canvas helper: renders the crisp pure-white architectural CAD hidden-line texture
 * (`cadEdgeDataUrl`) and dark cyan blueprint texture (`blueprintEdgeDataUrl`) directly from
 * high-resolution extracted ink alpha so every vertical slat, logo, leaf, and wall graphic
 * maps 1:1 onto the 3D depth-displaced mesh.
 */
export function renderCadTexturesFromRgba(
  rgba: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number
): { cadEdgeDataUrl: string; blueprintEdgeDataUrl: string } {
  const ink = extractArchitecturalInkAlpha(rgba, w, h);

  const cadCanvas = document.createElement('canvas');
  cadCanvas.width = w;
  cadCanvas.height = h;
  const cadCtx = cadCanvas.getContext('2d');

  const bpCanvas = document.createElement('canvas');
  bpCanvas.width = w;
  bpCanvas.height = h;
  const bpCtx = bpCanvas.getContext('2d');

  if (!cadCtx || !bpCtx) {
    return { cadEdgeDataUrl: '', blueprintEdgeDataUrl: '' };
  }

  const cadImg = cadCtx.createImageData(w, h);
  const bpImg = bpCtx.createImageData(w, h);
  const cd = cadImg.data;
  const bd = bpImg.data;

  for (let i = 0; i < w * h; i++) {
    const a = clamp(ink[i] * 1.18, 0, 1);
    const p = i * 4;

    // Subtle luminance-derived architectural paper tint (pure white #fcfcfd down to #f1f3f7 max)
    const lum = (0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]) / 255;
    const paperBase = 247 + Math.round(lum * 8); // 247..255 clean architectural white!

    // Wireframe CAD mode: pure white paper with crisp deep charcoal-black ink (#141821)
    cd[p] = Math.round(paperBase * (1 - a) + 20 * a);
    cd[p + 1] = Math.round(paperBase * (1 - a) + 24 * a);
    cd[p + 2] = Math.round((paperBase + 1) * (1 - a) + 33 * a);
    cd[p + 3] = 255;

    // Blueprint mode: deep obsidian slate (#0d1526) with crisp luminous cyan-white lines (#99ecff)
    bd[p] = Math.round(13 * (1 - a) + 152 * a);
    bd[p + 1] = Math.round(21 * (1 - a) + 236 * a);
    bd[p + 2] = Math.round(38 * (1 - a) + 255 * a);
    bd[p + 3] = 255;
  }

  cadCtx.putImageData(cadImg, 0, 0);
  bpCtx.putImageData(bpImg, 0, 0);

  return {
    cadEdgeDataUrl: cadCanvas.toDataURL('image/png'),
    blueprintEdgeDataUrl: bpCanvas.toDataURL('image/png'),
  };
}
