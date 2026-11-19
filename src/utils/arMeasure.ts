import type { BaseMountId, PoleFinishId } from '../types/pole';
import {
  analyzeFloorClearance,
  BASE_MOUNTS,
  calculateHeightSolution,
  MAX_ROOM_SIZE_M,
  MIN_ROOM_SIZE_M,
} from './poleConfig';

export interface ARMarkerState {
  /** Normalized vertical screen coordinate for pole base on floor (0=top, 1=bottom) */
  floorY: number;
  /** Normalized vertical screen coordinate for ceiling directly above base (0=top, 1=bottom) */
  ceilingY: number;
  /** Normalized horizontal screen coordinate for pole placement (0=left, 1=right) */
  poleX: number;
  /** Normalized horizontal screen coordinate for detected left wall corner (0.04..0.44) */
  leftCornerX: number;
  /** Normalized horizontal screen coordinate for detected right wall corner (0.56..0.96) */
  rightCornerX: number;
  /** Normalized horizontal span between left/right room corners (rightCornerX - leftCornerX) */
  wallSpanNorm: number;
  /** Camera lens height above floor in meters (typically 1.1m - 1.75m) */
  cameraHeightM: number;
  /** Camera tilt pitch in degrees (0 = level horizon, + = pitched up, - = pitched down) */
  cameraPitchDeg: number;
  /** Camera vertical FOV in degrees */
  vfovDeg: number;
  /** Viewport aspect ratio (width / height) */
  aspect: number;
}

export interface ARMeasurementResult {
  distanceM: number;
  ceilingHeightCm: number;
  ceilingHeightM: number;
  roomWidthM: number;
  roomDepthM: number;
  poleOffsetXM: number;
  leftWallXM: number;
  rightWallXM: number;
  recommendedMount: BaseMountId;
  recommendedDiameterMm: 40 | 45 | 50;
  extensionsLabel: string;
  clearanceStatus: 'optimal' | 'caution' | 'restricted';
  clearanceLabel: string;
  confidenceLabel: 'Calibrated' | 'High' | 'Adjust Angle';
  recommendationNote: string;
  isWithinTensionRange: boolean;
}

export const DEFAULT_AR_MARKERS: ARMarkerState = {
  floorY: 0.74,
  ceilingY: 0.16,
  poleX: 0.5,
  leftCornerX: 0.14,
  rightCornerX: 0.86,
  wallSpanNorm: 0.72,
  cameraHeightM: 1.42,
  cameraPitchDeg: -3,
  vfovDeg: 68,
  aspect: 0.46,
};

/**
 * Clamps normalized screen markers so the floor point always stays cleanly below
 * the horizon, the ceiling point stays above the floor anchor, and left/right wall
 * corners maintain valid architectural geometry.
 */
export function clampARMarkers(
  state: Partial<ARMarkerState> & Pick<ARMarkerState, 'floorY' | 'ceilingY' | 'poleX' | 'cameraHeightM' | 'cameraPitchDeg' | 'vfovDeg' | 'aspect'>
): ARMarkerState {
  const cameraHeightM = Math.max(0.85, Math.min(1.95, state.cameraHeightM));
  const cameraPitchDeg = Math.max(-25, Math.min(25, state.cameraPitchDeg));
  const vfovDeg = Math.max(38, Math.min(78, state.vfovDeg));
  const aspect = Math.max(0.35, Math.min(2.4, state.aspect));

  const halfTan = Math.tan(((vfovDeg * Math.PI) / 180) / 2);
  const pitchRad = (cameraPitchDeg * Math.PI) / 180;
  // Horizon normalized Y in screen space: 0.5 + tan(pitch) / (2 * halfTan)
  const horizonY = 0.5 + Math.tan(pitchRad) / (2 * halfTan);

  const maxFloorY = aspect < 0.85 ? 0.77 : 0.84;
  const minFloorY = Math.min(maxFloorY - 0.05, Math.max(0.54, horizonY + 0.08));
  const floorY = Math.max(minFloorY, Math.min(maxFloorY, state.floorY));
  const maxCeilingY = Math.max(0.11, Math.min(floorY - 0.18, horizonY - 0.04));
  const ceilingY = Math.max(0.08, Math.min(maxCeilingY, state.ceilingY));

  // Derive left/right wall corners from explicit corner values or fallback wallSpanNorm
  const fallbackSpan = Math.max(0.32, Math.min(0.92, state.wallSpanNorm ?? 0.72));
  const rawLeft = state.leftCornerX ?? 0.5 - fallbackSpan / 2;
  const rawRight = state.rightCornerX ?? 0.5 + fallbackSpan / 2;
  const leftCornerX = Math.max(0.05, Math.min(0.44, rawLeft));
  const rightCornerX = Math.max(Math.max(0.56, leftCornerX + 0.24), Math.min(0.95, rawRight));
  const wallSpanNorm = Math.max(0.24, Math.min(0.92, rightCornerX - leftCornerX));

  const minPoleX = Math.max(0.18, leftCornerX + 0.08);
  const maxPoleX = Math.min(0.82, rightCornerX - 0.08);
  const poleX = Math.max(minPoleX, Math.min(maxPoleX, state.poleX));

  return {
    floorY: Number(floorY.toFixed(4)),
    ceilingY: Number(ceilingY.toFixed(4)),
    poleX: Number(poleX.toFixed(4)),
    leftCornerX: Number(leftCornerX.toFixed(4)),
    rightCornerX: Number(rightCornerX.toFixed(4)),
    wallSpanNorm: Number(wallSpanNorm.toFixed(4)),
    cameraHeightM: Number(cameraHeightM.toFixed(2)),
    cameraPitchDeg: Number(cameraPitchDeg.toFixed(1)),
    vfovDeg: Number(vfovDeg.toFixed(1)),
    aspect: Number(aspect.toFixed(3)),
  };
}

/**
 * Pure pinhole-camera trigonometric room & ceiling measurement solver.
 * Computes ground distance from camera height + floor depression angle,
 * predicts ceiling height directly above the floor anchor, back-projects
 * left & right wall corners into physical room width/depth, and recommends
 * the optimal AxisPole mount & extension stack.
 */
export function calculateARMeasurement(
  rawState: Partial<ARMarkerState> &
    Pick<
      ARMarkerState,
      'floorY' | 'ceilingY' | 'poleX' | 'cameraHeightM' | 'cameraPitchDeg' | 'vfovDeg' | 'aspect'
    >,
  finishId: PoleFinishId = 'brass'
): ARMeasurementResult {
  const s = clampARMarkers(rawState);
  const vfovRad = (s.vfovDeg * Math.PI) / 180;
  const halfTanV = Math.tan(vfovRad / 2);
  const pitchRad = (s.cameraPitchDeg * Math.PI) / 180;

  // Ray angles relative to optical axis (positive = upward)
  const floorAlpha = Math.atan((0.5 - s.floorY) * 2 * halfTanV);
  const ceilingAlpha = Math.atan((0.5 - s.ceilingY) * 2 * halfTanV);

  const floorElevRad = pitchRad + floorAlpha;
  const ceilingElevRad = pitchRad + ceilingAlpha;

  // Floor depression angle below horizontal -> camera distance to target wall/floor plane
  const depressionRad = Math.max(0.08, -floorElevRad);
  const rawDistanceM = s.cameraHeightM / Math.tan(depressionRad);
  const distanceM = Math.max(1.2, Math.min(5.8, rawDistanceM));

  // Ceiling height directly above the marked floor point
  const ceilingDeltaM = distanceM * Math.tan(Math.max(0.04, ceilingElevRad));
  const rawCeilingM = s.cameraHeightM + ceilingDeltaM;
  const ceilingHeightM = Math.max(2.15, Math.min(3.6, rawCeilingM));
  const ceilingHeightCm = Math.round(ceilingHeightM * 100);

  // Horizontal projection at back wall plane (distanceM)
  const halfTanH = halfTanV * s.aspect;
  const visibleWidthAtPlaneM = 2 * distanceM * halfTanH;

  // Back-projected world X coordinates of the detected left & right wall corners
  const leftWallXM = Number(((s.leftCornerX - 0.5) * visibleWidthAtPlaneM).toFixed(2));
  const rightWallXM = Number(((s.rightCornerX - 0.5) * visibleWidthAtPlaneM).toFixed(2));
  const detectedSpanM = Math.abs(rightWallXM - leftWallXM);

  // Portrait phones have narrower horizontal FOV, so apply gentle perspective compensation when corners are near edges
  const edgeBoost = s.aspect < 0.85 ? 1.38 : 1.04;
  const rawRoomWidthM = detectedSpanM * edgeBoost;
  const roomWidthM = Number(
    Math.max(MIN_ROOM_SIZE_M, Math.min(MAX_ROOM_SIZE_M, rawRoomWidthM)).toFixed(1)
  );
  // Estimate room depth from camera-to-back-wall distance plus standing clearance behind camera (~0.9m)
  const roomDepthM = Number(
    Math.max(MIN_ROOM_SIZE_M, Math.min(MAX_ROOM_SIZE_M, distanceM + 1.15)).toFixed(1)
  );

  // Lateral offset of pole from camera optical center in world meters
  const poleOffsetXM = Number(
    ((s.poleX - 0.5) * visibleWidthAtPlaneM).toFixed(2)
  );

  // Determine optimal mount recommendation based on predicted height
  let recommendedMount: BaseMountId = 'tension';
  let isWithinTensionRange = true;
  if (ceilingHeightCm > BASE_MOUNTS.tension.maxHeightCm) {
    recommendedMount = 'permanent-ceiling';
    isWithinTensionRange = false;
  } else if (ceilingHeightCm < BASE_MOUNTS.tension.minHeightCm) {
    recommendedMount = 'stage-podium';
    isWithinTensionRange = false;
  }

  const heightSol = calculateHeightSolution(
    Math.max(225, Math.min(350, ceilingHeightCm)),
    recommendedMount,
    finishId
  );
  const clearance = analyzeFloorClearance(roomWidthM, roomDepthM, recommendedMount);

  const extensionsLabel =
    heightSol.extensions.length > 0
      ? heightSol.extensions.map((e) => `${e.lengthMm}mm`).join(' + ')
      : 'Standard A+B (No Ext.)';

  const recommendedDiameterMm: 40 | 45 | 50 = roomWidthM < 3.4 ? 40 : 45;

  let recommendationNote = `${BASE_MOUNTS[recommendedMount].shortName} mount · ${extensionsLabel}`;
  if (!isWithinTensionRange && ceilingHeightCm > 335) {
    recommendationNote = `Tall ${ceilingHeightM.toFixed(2)}m ceiling: Fixed Ceiling mount recommended`;
  } else if (ceilingHeightCm < 225) {
    recommendationNote = `Low ${ceilingHeightM.toFixed(2)}m ceiling: Verify beam clearance`;
  } else if (clearance.status === 'caution') {
    recommendationNote = `Fits ${ceilingHeightM.toFixed(2)}m · Tight ${roomWidthM.toFixed(1)}m spin zone`;
  }

  const confidenceLabel: ARMeasurementResult['confidenceLabel'] =
    distanceM >= 1.5 && distanceM <= 4.6 && Math.abs(s.cameraPitchDeg) <= 16
      ? 'High'
      : Math.abs(s.cameraPitchDeg) > 18
        ? 'Adjust Angle'
        : 'Calibrated';

  return {
    distanceM: Number(distanceM.toFixed(2)),
    ceilingHeightCm,
    ceilingHeightM: Number(ceilingHeightM.toFixed(2)),
    roomWidthM,
    roomDepthM,
    poleOffsetXM,
    leftWallXM,
    rightWallXM,
    recommendedMount,
    recommendedDiameterMm,
    extensionsLabel,
    clearanceStatus: clearance.status,
    clearanceLabel: clearance.label,
    confidenceLabel,
    recommendationNote,
    isWithinTensionRange,
  };
}
