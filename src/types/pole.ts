export type PoleFinishId = 'brass' | 'stainless' | 'powder-black' | 'silicone';

export type BaseMountId = 'tension' | 'permanent-ceiling' | 'vaulted-beam' | 'stage-podium';

export type PoleDiameterMm = 40 | 45 | 50;

export type EnvironmentPreset = 'studio' | 'home';

export type LightingPreset = 'studio-daylight' | 'mood-neon' | 'pro-spotlight';

export type CameraFocusId =
  | 'full-rig'
  | 'base-hub'
  | 'x-joint'
  | 'top-mount'
  | 'compare-pair';

export type CameraMotionMode = 'manual' | 'orbit' | 'crane';

export type PerformancePhaseId =
  | 'idle'
  | 'walk-in'
  | 'grip'
  | 'spin'
  | 'aerial-hold'
  | 'dismount'
  | 'finale-pose';

export type HardwarePartId =
  | 'base-plate'
  | 'bearing-hub'
  | 'lower-tube'
  | 'x-joint'
  | 'upper-tube'
  | 'extension-tube'
  | 'adjuster-rod'
  | 'top-mount';

export type DockTabId = 'configure' | 'assembly' | 'space';

export type ModalId = 'none' | 'installation' | 'maintenance' | 'bom' | 'export-ar';

export interface PoleInstance {
  id: string;
  label: string;
  finish: PoleFinishId;
  diameterMm: PoleDiameterMm;
  mount: BaseMountId;
  isSpinning: boolean;
  spinRpm: number;
  x: number;
  z: number;
}

export interface PoleClampResult {
  x: number;
  z: number;
  hitWallBoundary: boolean;
  hitPoleBoundary: boolean;
  minWallMarginM: number;
}

export interface PerformanceTimelineSample {
  phase: PerformancePhaseId;
  phaseLabel: string;
  phaseProgress: number;
  totalProgress: number;
  timeSec: number;
  durationSec: number;
  finished: boolean;
}

export interface PoleFinishSpec {
  id: PoleFinishId;
  name: string;
  shortName: string;
  alloy: string;
  swatchHex: string;
  accentHex: string;
  basePriceUsd: number;
  gripLevel: string;
  wallThicknessMm: number;
  weightPerMeterKg: number;
  hypoallergenic: boolean;
  pbr: {
    color: number;
    metalness: number;
    roughness: number;
    clearcoat: number;
    clearcoatRoughness: number;
    anisotropy: number;
    sheen: number;
  };
  summary: string;
  cleaningAgent: string;
  cleaningNotes: string[];
  avoidList: string[];
}

export interface BaseMountSpec {
  id: BaseMountId;
  name: string;
  shortName: string;
  priceDeltaUsd: number;
  weightKg: number;
  minHeightCm: number;
  maxHeightCm: number;
  drillingRequired: boolean;
  ceilingLoadKn: number;
  floorFootprintM: number;
  fastenerSpec: string;
  torqueNm: number;
  description: string;
}

export interface ExtensionPiece {
  lengthMm: number;
  sku: string;
  label: string;
  unitPriceUsd: number;
  weightKg: number;
}

export interface HeightSolution {
  targetHeightCm: number;
  baseStackMm: number;
  aPoleMm: number;
  bPoleMm: number;
  extensions: ExtensionPiece[];
  adjusterTravelMm: number;
  xJointCount: number;
  totalRigHeightMm: number;
  isValid: boolean;
  warning?: string;
}

export interface BOMLineItem {
  sku: string;
  name: string;
  material: string;
  quantity: number;
  unitWeightKg: number;
  unitPriceUsd: number;
  totalPriceUsd: number;
}

export interface BOMSummary {
  items: BOMLineItem[];
  totalPriceUsd: number;
  totalWeightKg: number;
  packedLengthCm: number;
  packedBagsCount: number;
  heightSolution: HeightSolution;
}

export interface ClearanceAnalysis {
  roomWidthM: number;
  roomDepthM: number;
  minClearRadiusM: number;
  availableRadiusM: number;
  status: 'optimal' | 'caution' | 'restricted';
  label: string;
  recommendation: string;
}

export interface AssemblyStepSpec {
  step: number;
  id: string;
  title: string;
  shortTitle: string;
  partId: HardwarePartId;
  cameraFocus: CameraFocusId;
  torqueNm: number;
  torqueFtLb: number;
  fastener: string;
  toolRequired: string;
  safetyNote: string;
  installInstruction: string;
  dismantleInstruction: string;
}

export interface HardwarePartSpec {
  id: HardwarePartId;
  name: string;
  category: string;
  material: string;
  torqueSpec: string;
  inspectionNote: string;
  cameraFocus: CameraFocusId;
}

export interface PoleRigConfig {
  finish: PoleFinishId;
  diameterMm: PoleDiameterMm;
  mount: BaseMountId;
  ceilingHeightCm: number;
  isSpinning: boolean;
  spinRpm: number;
  environment: EnvironmentPreset;
  lighting: LightingPreset;
  roomWidthM: number;
  roomDepthM: number;
  showClearanceRing: boolean;
  vaultAngleDeg: number;
}

export interface AssemblyPartOffsets {
  basePlateY: number;
  bearingHubY: number;
  lockPinOffset: number;
  lowerTubeY: number;
  xJointY: number;
  upperTubeY: number;
  extensionY: number;
  adjusterRodY: number;
  topMountY: number;
  coverSleeveY: number;
  activeStepIndex: number;
  wrenchAngleRad: number;
  activeJointNormalizedY: number;
}
