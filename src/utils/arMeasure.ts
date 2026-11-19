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
  /** Normalized horizontal span between left/right room obstacles (0.35..0.95) */
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
  wallSpanNorm: 0.78,
  cameraHeightM: 1.42,
  cameraPitchDeg: -3,
  vfovDeg: 68,
  aspect: 0.46,
};

/**
 * Clamps normalized screen markers so the floor point always stays cleanly below
 * the horizon and the ceiling point stays above the floor anchor.
 */
export function clampARMarkers(state: ARMarkerState): ARMarkerState {
  const cameraHeightM = Math.max(0.85, Math.min(1.95, state.cameraHeightM));
  const cameraPitchDeg = Math.max(-25, Math.min(25, state.cameraPitchDeg));
  const vfovDeg = Math.max(38, Math.min(78, state.vfovDeg));
  const aspect = Math.max(0.35, Math.min(2.4, state.aspect));

  const halfTan = Math.tan(((vfovDeg * Math.PI) / 180) / 2);
  const pitchRad = (cameraPitchDeg * Math.PI) / 180;
  // Horizon normalized Y in screen space: 0.5 + tan(pitch) / (2 * halfTan)
  const horizonY = 0.5 + Math.tan(pitchRad) / (2 * halfTan);

  const maxFloorY = aspect < 0.85 ? 0.77 : 0.82;
  const minFloorY = Math.min(maxFloorY - 0.05, Math.max(0.54, horizonY + 0.08));
  const floorY = Math.max(minFloorY, Math.min(maxFloorY, state.floorY));
  const maxCeilingY = Math.max(0.11, Math.min(floorY - 0.18, horizonY - 0.04));
  const ceilingY = Math.max(0.1, Math.min(maxCeilingY, state.ceilingY));
  const poleX = Math.max(0.18, Math.min(0.82, state.poleX));
  const wallSpanNorm = Math.max(0.4, Math.min(0.96, state.wallSpanNorm));

  return {
    floorY: Number(floorY.toFixed(4)),
    ceilingY: Number(ceilingY.toFixed(4)),
    poleX: Number(poleX.toFixed(4)),
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
 * predicts ceiling height directly above the floor anchor, estimates room
 * width/depth, and recommends the optimal AxisPole mount & extension stack.
 */
export function calculateARMeasurement(
  rawState: ARMarkerState,
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

  // Floor depression angle below horizontal
  const depressionRad = Math.max(0.08, -floorElevRad);
  const rawDistanceM = s.cameraHeightM / Math.tan(depressionRad);
  const distanceM = Math.max(1.2, Math.min(5.5, rawDistanceM));

  // Ceiling height directly above the marked floor point
  const ceilingDeltaM = distanceM * Math.tan(Math.max(0.04, ceilingElevRad));
  const rawCeilingM = s.cameraHeightM + ceilingDeltaM;
  const ceilingHeightM = Math.max(2.15, Math.min(3.6, rawCeilingM));
  const ceilingHeightCm = Math.round(ceilingHeightM * 100);

  // Horizontal field-of-view at plane distanceM -> room width & depth estimate
  const halfTanH = halfTanV * s.aspect;
  const visibleWidthAtPlaneM = 2 * distanceM * halfTanH;
  // Rooms typically extend beyond mobile portrait edges, so scale smoothly by aspect
  const aspectExpansion = s.aspect < 0.85 ? 1.55 : 1.05;
  const rawRoomWidthM = visibleWidthAtPlaneM * s.wallSpanNorm * aspectExpansion;
  const roomWidthM = Number(
    Math.max(MIN_ROOM_SIZE_M, Math.min(MAX_ROOM_SIZE_M, rawRoomWidthM)).toFixed(1)
  );
  const roomDepthM = Number(
    Math.max(MIN_ROOM_SIZE_M, Math.min(MAX_ROOM_SIZE_M, distanceM * 1.75)).toFixed(1)
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
    distanceM >= 1.6 && distanceM <= 4.4 && Math.abs(s.cameraPitchDeg) <= 16
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

/**
 * Lightweight real-time horizontal edge detector on a live HTMLVideoElement frame.
 * Looks for the strongest ceiling cornice boundary in the upper band (8%–36%)
 * and baseboard/floor boundary in the lower band (66%–92%).
 * Falls back cleanly if video is not playing or has uniform brightness.
 */
export function scanVideoForRoomBounds(
  video: HTMLVideoElement | null
): { ceilingY: number; floorY: number; detected: boolean } {
  if (!video || video.readyState < 2 || video.videoWidth < 32 || video.videoHeight < 32) {
    return { ceilingY: 0.17, floorY: 0.74, detected: false };
  }

  try {
    const sampleW = 96;
    const sampleH = 128;
    const canvas = document.createElement('canvas');
    canvas.width = sampleW;
    canvas.height = sampleH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { ceilingY: 0.17, floorY: 0.74, detected: false };

    ctx.drawImage(video, 0, 0, sampleW, sampleH);
    const data = ctx.getImageData(0, 0, sampleW, sampleH).data;

    // Average luminance per row across the central 60% width (avoiding side furniture)
    const xStart = Math.floor(sampleW * 0.2);
    const xEnd = Math.floor(sampleW * 0.8);
    const rowLuma = new Float32Array(sampleH);
    for (let y = 0; y < sampleH; y++) {
      let sum = 0;
      for (let x = xStart; x < xEnd; x++) {
        const idx = (y * sampleW + x) * 4;
        sum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      }
      rowLuma[y] = sum / (xEnd - xStart);
    }

    // Compute vertical gradient magnitude (horizontal architectural edges)
    let bestCeilRow = Math.round(sampleH * 0.17);
    let bestCeilScore = 0;
    for (let y = Math.floor(sampleH * 0.1); y <= Math.floor(sampleH * 0.34); y++) {
      const grad = Math.abs(rowLuma[y + 1] - rowLuma[y - 1]);
      if (grad > bestCeilScore) {
        bestCeilScore = grad;
        bestCeilRow = y;
      }
    }

    let bestFloorRow = Math.round(sampleH * 0.74);
    let bestFloorScore = 0;
    for (let y = Math.floor(sampleH * 0.62); y <= Math.floor(sampleH * 0.77); y++) {
      const grad = Math.abs(rowLuma[y + 1] - rowLuma[y - 1]);
      if (grad > bestFloorScore) {
        bestFloorScore = grad;
        bestFloorRow = y;
      }
    }

    const detected = bestCeilScore > 6 && bestFloorScore > 6;
    return {
      ceilingY: detected ? Number((bestCeilRow / sampleH).toFixed(3)) : 0.17,
      floorY: detected ? Number((bestFloorRow / sampleH).toFixed(3)) : 0.74,
      detected,
    };
  } catch {
    return { ceilingY: 0.17, floorY: 0.74, detected: false };
  }
}
