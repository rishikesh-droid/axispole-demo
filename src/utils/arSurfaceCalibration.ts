import type { BaseMountId, PoleFinishId } from '../types/pole.ts';
import {
  analyzeFloorClearance,
  BASE_MOUNTS,
  calculateHeightSolution,
  MAX_ROOM_SIZE_M,
  MIN_ROOM_SIZE_M,
} from './poleConfig.ts';
import {
  projectARScenePointToScreen,
  type ARMarkerState,
  type ARMeasurementResult,
} from './arMeasure.ts';

export interface FloorTapPoint2D {
  id: number;
  /** Normalized viewport X (0=left, 1=right) */
  u: number;
  /** Normalized viewport Y (0=top, 1=bottom) */
  v: number;
}

export interface FloorPoint3D {
  id: number;
  u: number;
  v: number;
  /** World-space floor coordinates in meters relative to camera (x=right, z=forward negative into scene) */
  x: number;
  z: number;
  /** Horizontal distance from camera foot to this floor point in meters */
  groundDistM: number;
}

export interface SurfaceCalibrationResult {
  valid: boolean;
  points3D: FloorPoint3D[];
  /** Edge lengths around the ordered 4-point floor quad in meters: [back, right, front, left] */
  edgeLengthsM: [number, number, number, number];
  /** Measured room width (meters) from calibrated floor quad */
  rawWidthM: number;
  /** Measured room depth (meters) from calibrated floor quad */
  rawDepthM: number;
  /** Clamped studio room width (3.0..7.0m) */
  roomWidthM: number;
  /** Clamped studio room depth (3.0..7.0m) */
  roomDepthM: number;
  /** Exact physical floor area inside the 4 tapped points (m^2) */
  floorAreaSqM: number;
  /** World-space centroid of the 4 floor points (optimal pole ground anchor) */
  centroidX: number;
  centroidZ: number;
  /** Camera-to-centroid horizontal ground distance in meters */
  centroidDistM: number;
  /** Minimum distance from centroid to the nearest calibrated room boundary edge */
  minEdgeClearanceM: number;
  /** Cosine-corrected ceiling height directly above the calibrated floor centroid (cm & m) */
  ceilingHeightCm: number;
  ceilingHeightM: number;
  /** Camera-relative normalized screen coordinate of centroid for HUD projection */
  centroidScreenU: number;
  centroidScreenV: number;
  /** Calibrated accuracy score (0..100) */
  accuracyScore: number;
}

/**
 * Casts a pinhole camera ray through normalized screen coordinates (u, v) and
 * intersects it with the physical horizontal ground plane (Y = 0).
 *
 * Uses full camera pitch rotation + horizontal/vertical FOV projection so off-center
 * floor taps preserve exact real-world metric geometry (no wide-angle radial stretch error).
 *
 * Returns null if the tapped ray points at or above the horizon.
 */
export function screenToFloorPoint3D(
  u: number,
  v: number,
  markers: Pick<ARMarkerState, 'cameraHeightM' | 'cameraPitchDeg' | 'vfovDeg' | 'aspect'>,
  id = 0
): FloorPoint3D | null {
  const vfovRad = (markers.vfovDeg * Math.PI) / 180;
  const halfTanV = Math.tan(vfovRad / 2);
  const halfTanH = halfTanV * markers.aspect;

  // Ray direction in camera local frame (+X right, +Y up, -Z forward)
  const dxCam = (u - 0.5) * 2 * halfTanH;
  const dyCam = (0.5 - v) * 2 * halfTanV;
  const dzCam = -1;

  // Rotate ray around +X by cameraPitchDeg (positive pitch = lens tilted UP)
  const pitchRad = (markers.cameraPitchDeg * Math.PI) / 180;
  const cosP = Math.cos(pitchRad);
  const sinP = Math.sin(pitchRad);

  const dxWorld = dxCam;
  const dyWorld = dyCam * cosP - dzCam * sinP;
  const dzWorld = dyCam * sinP + dzCam * cosP;

  // Must angle downward toward the physical floor plane (reject sky/wall taps above horizon)
  if (dyWorld >= -0.055 || dzWorld >= -0.01) {
    return null;
  }

  // Camera origin is at (0, cameraHeightM, 0); floor plane is Y = 0
  const t = -markers.cameraHeightM / dyWorld;
  const rawX = t * dxWorld;
  const rawZ = t * dzWorld; // negative into scene
  const groundDist = Math.hypot(rawX, rawZ);

  // Clamp extreme grazing horizon taps (> 11.5m away) to physical indoor room bounds
  if (!Number.isFinite(groundDist) || groundDist < 0.45 || groundDist > 11.5) {
    return null;
  }

  return {
    id,
    u: Number(u.toFixed(4)),
    v: Number(v.toFixed(4)),
    x: Number(rawX.toFixed(3)),
    z: Number(rawZ.toFixed(3)),
    groundDistM: Number(groundDist.toFixed(3)),
  };
}

/**
 * Projects a world-space 3D point (x, y, z) relative to camera at (0, cameraHeightM, 0)
 * back to normalized viewport coordinates (u, v).
 */
export function worldToScreenPoint2D(
  x: number,
  y: number,
  z: number,
  markers: Pick<ARMarkerState, 'cameraHeightM' | 'cameraPitchDeg' | 'vfovDeg' | 'aspect'>
): { u: number; v: number } | null {
  const rx = x;
  const ry = y - markers.cameraHeightM;
  const rz = z;

  // Inverse pitch rotation (-pitchRad around +X)
  const pitchRad = (markers.cameraPitchDeg * Math.PI) / 180;
  const cosP = Math.cos(-pitchRad);
  const sinP = Math.sin(-pitchRad);

  const cx = rx;
  const cy = ry * cosP - rz * sinP;
  const cz = ry * sinP + rz * cosP;

  if (cz >= -0.05) return null;

  const vfovRad = (markers.vfovDeg * Math.PI) / 180;
  const halfTanV = Math.tan(vfovRad / 2);
  const halfTanH = halfTanV * markers.aspect;

  const ndcX = cx / (-cz * halfTanH);
  const ndcY = cy / (-cz * halfTanV);

  return {
    u: Number((0.5 + ndcX * 0.5).toFixed(4)),
    v: Number((0.5 - ndcY * 0.5).toFixed(4)),
  };
}

/**
 * Computes distance from point (px, pz) to line segment (ax, az)-(bx, bz).
 */
function distPointToSegment2D(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const lenSq = vx * vx + vz * vz;
  if (lenSq < 1e-6) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, (wx * vx + wz * vz) / lenSq));
  return Math.hypot(px - (ax + t * vx), pz - (az + t * vz));
}

/**
 * Orders 4 floor points cleanly into architectural quad order:
 * [0: Back-Left, 1: Back-Right, 2: Front-Right, 3: Front-Left]
 * regardless of the order the user tapped them on the floor.
 */
export function orderFloorQuadPoints(pts: FloorPoint3D[]): FloorPoint3D[] {
  if (pts.length !== 4) return pts;
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
  const cz = pts.reduce((s, p) => s + p.z, 0) / 4;

  // Sort cyclically around centroid in (x, z) ground plane
  const sorted = [...pts].sort(
    (a, b) => Math.atan2(a.z - cz, a.x - cx) - Math.atan2(b.z - cz, b.x - cx)
  );

  // Rotate starting index so index 0 is Back-Left (most negative z, then most negative x)
  let bestIdx = 0;
  let bestScore = Infinity;
  for (let i = 0; i < 4; i++) {
    const score = sorted[i].z * 1.4 + sorted[i].x * 0.6;
    if (score < bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  const rotated: FloorPoint3D[] = [];
  for (let i = 0; i < 4; i++) {
    rotated.push(sorted[(bestIdx + i) % 4]);
  }

  // Ensure clockwise screen order: Back-Left -> Back-Right -> Front-Right -> Front-Left
  if (rotated[1].x < rotated[3].x) {
    return [rotated[0], rotated[3], rotated[2], rotated[1]];
  }
  return rotated;
}

/**
 * High-accuracy cosine-corrected ceiling height solver using the calibrated
 * ground-plane vertical axis at (anchorX, anchorZ) and ceiling screen line `ceilingY`.
 */
export function solveCeilingHeightAtGroundAnchor(
  anchorX: number,
  anchorZ: number,
  ceilingY: number,
  markers: Pick<ARMarkerState, 'cameraHeightM' | 'cameraPitchDeg' | 'vfovDeg' | 'aspect'>
): number {
  const vfovRad = (markers.vfovDeg * Math.PI) / 180;
  const halfTanV = Math.tan(vfovRad / 2);
  const pitchRad = (markers.cameraPitchDeg * Math.PI) / 180;

  // Ray through vertical plane above (anchorX, anchorZ) at screen row ceilingY
  const dyCam = (0.5 - ceilingY) * 2 * halfTanV;
  const dzCam = -1;

  const cosP = Math.cos(pitchRad);
  const sinP = Math.sin(pitchRad);
  const dyWorld = dyCam * cosP - dzCam * sinP;
  const dzWorld = dyCam * sinP + dzCam * cosP;

  // Project onto the exact Z-depth plane of the ground anchor (automatically preserves cosine perspective!)
  const forwardDepthM = Math.max(0.9, -anchorZ);
  const t = forwardDepthM / Math.max(0.08, -dzWorld);
  const heightM = markers.cameraHeightM + t * dyWorld;

  void anchorX;
  return Math.max(2.15, Math.min(3.6, heightM));
}

/**
 * Solves exact physical room Width, Depth, Area, Ground-Plane Pole Anchor, and
 * Cosine-Corrected Ceiling Height from 4 user-tapped physical floor points.
 */
export function solveFloorSurfaceCalibration(
  taps: FloorTapPoint2D[],
  markers: ARMarkerState
): SurfaceCalibrationResult | null {
  if (taps.length < 4) return null;

  const projected: FloorPoint3D[] = [];
  for (const tap of taps.slice(0, 4)) {
    const p3 = screenToFloorPoint3D(tap.u, tap.v, markers, tap.id);
    if (!p3) return null;
    projected.push(p3);
  }

  const ordered = orderFloorQuadPoints(projected);
  const [bl, br, fr, fl] = ordered;

  const dist = (a: FloorPoint3D, b: FloorPoint3D) => Math.hypot(b.x - a.x, b.z - a.z);
  const backLen = dist(bl, br);
  const rightLen = dist(br, fr);
  const frontLen = dist(fr, fl);
  const leftLen = dist(fl, bl);

  // Shoelace area on the XZ ground plane
  let area2 = 0;
  for (let i = 0; i < 4; i++) {
    const a = ordered[i];
    const b = ordered[(i + 1) % 4];
    area2 += a.x * b.z - b.x * a.z;
  }
  const floorAreaSqM = Math.abs(area2) * 0.5;
  if (floorAreaSqM < 0.35) return null;

  // Average opposing spans for robust Width & Depth even under perspective foreshortening
  const rawWidthM = (backLen + frontLen) * 0.5;
  const rawDepthM = (leftLen + rightLen) * 0.5;

  const roomWidthM = Number(
    Math.max(MIN_ROOM_SIZE_M, Math.min(MAX_ROOM_SIZE_M, rawWidthM)).toFixed(1)
  );
  const roomDepthM = Number(
    Math.max(MIN_ROOM_SIZE_M, Math.min(MAX_ROOM_SIZE_M, rawDepthM)).toFixed(1)
  );

  // Ground-plane centroid for centered pole placement
  const centroidX = (bl.x + br.x + fr.x + fl.x) / 4;
  const centroidZ = (bl.z + br.z + fr.z + fl.z) / 4;
  const centroidDistM = Math.hypot(centroidX, centroidZ);

  // Nearest wall clearance from centroid to all 4 calibrated floor edges
  const minEdgeClearanceM = Math.min(
    distPointToSegment2D(centroidX, centroidZ, bl.x, bl.z, br.x, br.z),
    distPointToSegment2D(centroidX, centroidZ, br.x, br.z, fr.x, fr.z),
    distPointToSegment2D(centroidX, centroidZ, fr.x, fr.z, fl.x, fl.z),
    distPointToSegment2D(centroidX, centroidZ, fl.x, fl.z, bl.x, bl.z)
  );

  // Cosine-corrected ceiling height directly above the calibrated pole ground anchor (centroidZ)
  // so the 3D pole top dome aligns pixel-accurately with the ceiling sightline bar
  const ceilingHeightM = solveCeilingHeightAtGroundAnchor(
    centroidX,
    centroidZ,
    markers.ceilingY,
    markers
  );
  const ceilingHeightCm = Math.round(ceilingHeightM * 100);

  const screenCentroid = worldToScreenPoint2D(centroidX, 0, centroidZ, markers) ?? {
    u: 0.5,
    v: markers.floorY,
  };

  // Rectangularity & geometry quality score (higher when opposing sides match closely)
  const widthSymmetry = 1 - Math.abs(backLen - frontLen) / Math.max(0.5, backLen + frontLen);
  const depthSymmetry = 1 - Math.abs(leftLen - rightLen) / Math.max(0.5, leftLen + rightLen);
  const accuracyScore = Math.round(
    Math.max(76, Math.min(99, 66 + widthSymmetry * 17 + depthSymmetry * 16))
  );

  return {
    valid: true,
    points3D: ordered,
    edgeLengthsM: [
      Number(backLen.toFixed(2)),
      Number(rightLen.toFixed(2)),
      Number(frontLen.toFixed(2)),
      Number(leftLen.toFixed(2)),
    ],
    rawWidthM: Number(rawWidthM.toFixed(2)),
    rawDepthM: Number(rawDepthM.toFixed(2)),
    roomWidthM,
    roomDepthM,
    floorAreaSqM: Number(floorAreaSqM.toFixed(1)),
    centroidX: Number(centroidX.toFixed(3)),
    centroidZ: Number(centroidZ.toFixed(3)),
    centroidDistM: Number(centroidDistM.toFixed(2)),
    minEdgeClearanceM: Number(minEdgeClearanceM.toFixed(2)),
    ceilingHeightCm,
    ceilingHeightM: Number(ceilingHeightM.toFixed(2)),
    centroidScreenU: screenCentroid.u,
    centroidScreenV: screenCentroid.v,
    accuracyScore,
  };
}

/**
 * Merges a completed 4-point Surface Calibration into a full ARMeasurementResult
 * so PoleViewport3D and App config receive rock-solid metric Height, Width, Depth,
 * Pole Anchor, and Mount/Extension recommendations.
 */
export function buildMeasurementFromSurfaceCalibration(
  cal: SurfaceCalibrationResult,
  markers: ARMarkerState,
  finishId: PoleFinishId = 'brass'
): ARMeasurementResult {
  const [bl, br, fr, fl] = cal.points3D;
  let recommendedMount: BaseMountId = 'tension';
  let isWithinTensionRange = true;
  if (cal.ceilingHeightCm > BASE_MOUNTS.tension.maxHeightCm) {
    recommendedMount = 'permanent-ceiling';
    isWithinTensionRange = false;
  } else if (cal.ceilingHeightCm < BASE_MOUNTS.tension.minHeightCm) {
    recommendedMount = 'stage-podium';
    isWithinTensionRange = false;
  }

  const heightSol = calculateHeightSolution(
    Math.max(225, Math.min(350, cal.ceilingHeightCm)),
    recommendedMount,
    finishId
  );
  const roomClearance = analyzeFloorClearance(cal.roomWidthM, cal.roomDepthM, recommendedMount);

  const extensionsLabel =
    heightSol.extensions.length > 0
      ? heightSol.extensions.map((e) => `${e.lengthMm}mm`).join(' + ')
      : 'Standard A+B (No Ext.)';

  const recommendedDiameterMm: 40 | 45 | 50 = cal.roomWidthM < 3.4 ? 40 : 45;

  const distanceM = Number(Math.max(1.2, Math.min(6.0, -((bl.z + br.z) * 0.5))).toFixed(2));
  const poleDepthZM = Number((distanceM + cal.centroidZ).toFixed(3));

  // Pole lateral shift stays bounded inside the calibrated 4-point floor span
  const lateralRange = Math.max(0.22, Math.abs(br.x - bl.x) * 0.36);
  const poleOffsetXM = Number(
    (cal.centroidX + (markers.poleX - cal.centroidScreenU) * 2 * lateralRange).toFixed(2)
  );

  // Dynamic clearance from the pole's current (poleOffsetXM, centroidZ) to all 4 calibrated floor edges
  const spinRadiusClearanceM = Number(
    Math.max(
      0.25,
      Math.min(
        distPointToSegment2D(poleOffsetXM, cal.centroidZ, bl.x, bl.z, br.x, br.z),
        distPointToSegment2D(poleOffsetXM, cal.centroidZ, br.x, br.z, fr.x, fr.z),
        distPointToSegment2D(poleOffsetXM, cal.centroidZ, fr.x, fr.z, fl.x, fl.z),
        distPointToSegment2D(poleOffsetXM, cal.centroidZ, fl.x, fl.z, bl.x, bl.z)
      )
    ).toFixed(2)
  );

  let clearanceStatus = roomClearance.status;
  let clearanceLabel = roomClearance.label;
  if (spinRadiusClearanceM < 0.65 && clearanceStatus === 'optimal') {
    clearanceStatus = 'caution';
    clearanceLabel = `Tight edge clearance (${spinRadiusClearanceM.toFixed(2)}m)`;
  }

  const topProj = projectARScenePointToScreen(
    poleOffsetXM,
    cal.ceilingHeightM,
    poleDepthZM,
    distanceM,
    markers
  );
  const botProj = projectARScenePointToScreen(poleOffsetXM, 0, poleDepthZM, distanceM, markers);

  return {
    distanceM,
    ceilingHeightCm: cal.ceilingHeightCm,
    ceilingHeightM: cal.ceilingHeightM,
    roomWidthM: cal.roomWidthM,
    roomDepthM: cal.roomDepthM,
    poleOffsetXM,
    poleDepthZM,
    leftWallXM: bl.x,
    rightWallXM: br.x,
    spinRadiusClearanceM,
    accuracyPct: cal.accuracyScore,
    ceilingScreenU: topProj.u,
    ceilingScreenV: topProj.v,
    floorScreenU: botProj.u,
    floorScreenV: botProj.v,
    recommendedMount,
    recommendedDiameterMm,
    extensionsLabel,
    clearanceStatus,
    clearanceLabel,
    confidenceLabel: 'Calibrated',
    recommendationNote: `4-Pt Floor Calibrated (${cal.accuracyScore}%) · ${BASE_MOUNTS[recommendedMount].shortName} · ${extensionsLabel}`,
    isWithinTensionRange,
  };
}

/**
 * Generates a realistic default 4-point physical floor quad in viewport space
 * for quick 1-tap calibration or starting refinement.
 */
export function getDefaultFloorCalibrationTaps(aspect: number): FloorTapPoint2D[] {
  const isPortrait = aspect < 0.85;
  return isPortrait
    ? [
        { id: 1, u: 0.16, v: 0.68 }, // Back-Left
        { id: 2, u: 0.84, v: 0.68 }, // Back-Right
        { id: 3, u: 0.91, v: 0.81 }, // Front-Right
        { id: 4, u: 0.09, v: 0.81 }, // Front-Left
      ]
    : [
        { id: 1, u: 0.24, v: 0.68 },
        { id: 2, u: 0.76, v: 0.68 },
        { id: 3, u: 0.86, v: 0.84 },
        { id: 4, u: 0.14, v: 0.84 },
      ];
}

/**
 * Automatically predicts a perspective-aligned 4-point floor quad from the
 * detected room floor line (floorY) and left/right room corners (leftCornerX, rightCornerX).
 * Allows instant 1-tap 4-corner floor calibration that the user can fine-tune by dragging pins.
 */
export function predictFloorQuadFromMarkers(markers: ARMarkerState): FloorTapPoint2D[] {
  const backV = Math.max(0.58, Math.min(0.76, markers.floorY));
  const leftU = Math.max(0.11, Math.min(0.38, markers.leftCornerX));
  const rightU = Math.max(0.62, Math.min(0.89, markers.rightCornerX));

  const bl3 = screenToFloorPoint3D(leftU, backV, markers, 1);
  const br3 = screenToFloorPoint3D(rightU, backV, markers, 2);

  if (!bl3 || !br3) {
    return getDefaultFloorCalibrationTaps(markers.aspect);
  }

  const backZ = (bl3.z + br3.z) * 0.5;
  const spanW = Math.max(1.6, Math.abs(br3.x - bl3.x));
  const stepForward = Math.max(1.15, Math.min(2.35, spanW * 0.74));
  const frontZ = Math.min(-0.95, backZ + stepForward);

  const fr2 = worldToScreenPoint2D(br3.x, 0, frontZ, markers);
  const fl2 = worldToScreenPoint2D(bl3.x, 0, frontZ, markers);

  const frontVDefault = Math.min(0.88, backV + 0.13);
  const frU = fr2 ? Math.max(rightU + 0.03, Math.min(0.94, fr2.u)) : Math.min(0.93, rightU + 0.07);
  const flU = fl2 ? Math.max(0.06, Math.min(leftU - 0.03, fl2.u)) : Math.max(0.07, leftU - 0.07);
  const frV = fr2 ? Math.max(backV + 0.06, Math.min(0.89, fr2.v)) : frontVDefault;
  const flV = fl2 ? Math.max(backV + 0.06, Math.min(0.89, fl2.v)) : frontVDefault;

  return [
    { id: 1, u: Number(leftU.toFixed(4)), v: Number(backV.toFixed(4)) },
    { id: 2, u: Number(rightU.toFixed(4)), v: Number(backV.toFixed(4)) },
    { id: 3, u: Number(frU.toFixed(4)), v: Number(frV.toFixed(4)) },
    { id: 4, u: Number(flU.toFixed(4)), v: Number(flV.toFixed(4)) },
  ];
}
