import type { FloorPlanUnit, PoleInstance } from '../types/pole';

export interface FloorPlanRect {
  x: number;
  y: number;
  width: number;
  height: number;
  pxPerMeter: number;
}

export interface FloorPlanPoint2D {
  sx: number;
  sy: number;
}

export interface PoleWallDistances {
  leftM: number;
  rightM: number;
  topM: number;
  bottomM: number;
  nearestWallM: number;
  nearestPoleM: number | null;
}

export interface FloorPlanGridLines {
  verticals: { offsetM: number; isMajor: boolean }[];
  horizontals: { offsetM: number; isMajor: boolean }[];
}

/**
 * Computes the centered architectural room rectangle inside the 2D floor plan SVG viewport,
 * preserving exact aspect ratio (roomWidthM : roomDepthM) while leaving comfortable margins
 * for external architectural dimension rulers and floating viewport controls.
 */
export function computeFloorPlanRect(
  viewportWidth: number,
  viewportHeight: number,
  roomWidthM: number,
  roomDepthM: number,
  zoom = 1,
  padX = 110,
  padY = 96
): FloorPlanRect {
  const safeW = Math.max(120, viewportWidth);
  const safeH = Math.max(120, viewportHeight);
  const safeRoomW = Math.max(1.0, roomWidthM);
  const safeRoomD = Math.max(1.0, roomDepthM);
  const safeZoom = Math.max(0.55, Math.min(2.2, zoom));

  const availW = Math.max(80, safeW - padX * 2);
  const availH = Math.max(80, safeH - padY * 2);

  const basePxPerM = Math.min(availW / safeRoomW, availH / safeRoomD);
  const pxPerMeter = basePxPerM * safeZoom;
  const width = safeRoomW * pxPerMeter;
  const height = safeRoomD * pxPerMeter;

  const x = (safeW - width) / 2;
  const y = (safeH - height) / 2;

  return { x, y, width, height, pxPerMeter };
}

/**
 * Projects 3D room world floor coordinates (x, z) in meters into 2D floor plan SVG pixels.
 * Convention matches the 3D Studio camera orientation:
 *   - x = -roomWidthM/2 is Left wall, +roomWidthM/2 is Right edge
 *   - z = -roomDepthM/2 is Top (Back mirror wall), +roomDepthM/2 is Bottom (Front open edge)
 */
export function worldToFloorPlan(
  wx: number,
  wz: number,
  roomWidthM: number,
  roomDepthM: number,
  rect: FloorPlanRect
): FloorPlanPoint2D {
  const normX = (wx + roomWidthM / 2) / Math.max(0.001, roomWidthM);
  const normZ = (wz + roomDepthM / 2) / Math.max(0.001, roomDepthM);
  return {
    sx: rect.x + normX * rect.width,
    sy: rect.y + normZ * rect.height,
  };
}

/**
 * Inverse-projects 2D floor plan SVG pixel coordinates back into 3D room world meters (x, z).
 */
export function floorPlanToWorld(
  sx: number,
  sy: number,
  roomWidthM: number,
  roomDepthM: number,
  rect: FloorPlanRect
): { x: number; z: number } {
  const normX = (sx - rect.x) / Math.max(0.001, rect.width);
  const normZ = (sy - rect.y) / Math.max(0.001, rect.height);
  return {
    x: normX * roomWidthM - roomWidthM / 2,
    z: normZ * roomDepthM - roomDepthM / 2,
  };
}

/**
 * Computes exact distances from a pole center to all four room boundaries and the nearest sibling pole.
 */
export function computePoleWallDistances(
  pole: Pick<PoleInstance, 'id' | 'x' | 'z'>,
  roomWidthM: number,
  roomDepthM: number,
  allPoles: Pick<PoleInstance, 'id' | 'x' | 'z'>[] = []
): PoleWallDistances {
  const halfW = roomWidthM / 2;
  const halfD = roomDepthM / 2;
  const leftM = Math.max(0, Number((pole.x + halfW).toFixed(2)));
  const rightM = Math.max(0, Number((halfW - pole.x).toFixed(2)));
  const topM = Math.max(0, Number((pole.z + halfD).toFixed(2)));
  const bottomM = Math.max(0, Number((halfD - pole.z).toFixed(2)));
  const nearestWallM = Math.min(leftM, rightM, topM, bottomM);

  let nearestPoleM: number | null = null;
  for (const other of allPoles) {
    if (other.id === pole.id) continue;
    const d = Number(Math.hypot(pole.x - other.x, pole.z - other.z).toFixed(2));
    if (nearestPoleM === null || d < nearestPoleM) {
      nearestPoleM = d;
    }
  }

  return {
    leftM,
    rightM,
    topM,
    bottomM,
    nearestWallM,
    nearestPoleM,
  };
}

/**
 * Generates crisp architectural grid offsets measured from the left/top inner room edges.
 */
export function computeFloorPlanGridLines(
  roomWidthM: number,
  roomDepthM: number,
  minorStepM = 0.5
): FloorPlanGridLines {
  const step = Math.max(0.1, minorStepM);
  const verticals: { offsetM: number; isMajor: boolean }[] = [];
  const horizontals: { offsetM: number; isMajor: boolean }[] = [];

  for (let x = step; x < roomWidthM - 1e-4; x += step) {
    const rounded = Number(x.toFixed(3));
    const isMajor = Math.abs(rounded % 1) < 0.01 || Math.abs((rounded % 1) - 1) < 0.01;
    verticals.push({ offsetM: rounded, isMajor });
  }

  for (let z = step; z < roomDepthM - 1e-4; z += step) {
    const rounded = Number(z.toFixed(3));
    const isMajor = Math.abs(rounded % 1) < 0.01 || Math.abs((rounded % 1) - 1) < 0.01;
    horizontals.push({ offsetM: rounded, isMajor });
  }

  return { verticals, horizontals };
}

/**
 * Formats a metric length in meters or feet-and-inches for architectural floor plan labels.
 */
export function formatFloorPlanDim(meters: number, unit: FloorPlanUnit): string {
  const safe = Math.max(0, meters);
  if (unit === 'm') {
    return `${safe.toFixed(2)} m`;
  }
  const totalInches = Math.round(safe / 0.0254);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  if (inches === 0) return `${feet} ft`;
  return `${feet}′${inches}″`;
}

/**
 * Formats room floor area in square meters or square feet.
 */
export function formatFloorArea(roomWidthM: number, roomDepthM: number, unit: FloorPlanUnit): string {
  const sqM = roomWidthM * roomDepthM;
  if (unit === 'm') {
    return `${sqM.toFixed(1)} m²`;
  }
  const sqFt = Math.round(sqM * 10.7639);
  return `${sqFt} sq ft`;
}
