export type PoleFinishId = 'brass' | 'stainless' | 'powder-black' | 'silicone';

export type BaseMountId = 'tension' | 'permanent-ceiling';

export type CeilingType = 'flat' | 'vaulted';

export type PoleDiameterMm = 40 | 45 | 50;

export type EnvironmentPreset = 'studio' | 'home' | 'replica';

export type LightingPreset =
  | 'studio-daylight'
  | 'mood-neon'
  | 'pro-spotlight'
  | 'sunset-flow'
  | 'cyber-pulse';

export type CameraFocusId =
  | 'full-rig'
  | 'floor-plan'
  | 'base-hub'
  | 'x-joint'
  | 'top-mount'
  | 'compare-pair';

export type CameraMotionMode = 'manual' | 'orbit' | 'crane';

export type CushionPlacement = 'top' | 'below';

export type HardwarePartId =
  | 'base-plate'
  | 'bearing-hub'
  | 'lower-tube'
  | 'x-joint'
  | 'upper-tube'
  | 'extension-tube'
  | 'adjuster-rod'
  | 'top-mount'
  | 'height-cushion';

export type DockTabId = 'configure' | 'assembly' | 'space';

export type ModalId = 'none' | 'installation' | 'maintenance' | 'bom' | 'export-ar';

export interface PoleInstance {
  id: string;
  label: string;
  finish: PoleFinishId;
  diameterMm: PoleDiameterMm;
  heightCm: number;
  cushionPlacement: CushionPlacement;
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
  poleHeightCm: number;
  ceilingHeightCm: number;
  cushionHeightCm: number;
  cushionPlacement: CushionPlacement;
  cappedAtMaxPoleHeight: boolean;
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
  ceilingType: CeilingType;
  ceilingHeightCm: number;
  poleHeightCm: number;
  cushionPlacement: CushionPlacement;
  isSpinning: boolean;
  spinRpm: number;
  environment: EnvironmentPreset;
  lighting: LightingPreset;
  roomWidthM: number;
  roomDepthM: number;
  showClearanceRing: boolean;
  enforceMinClearance: boolean;
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

export type RoomReplicaObjectType =
  | 'desk'
  | 'chair'
  | 'office-chair'
  | 'table'
  | 'sofa'
  | 'bed'
  | 'bookshelf'
  | 'cabinet'
  | 'wardrobe'
  | 'tv-stand'
  | 'rug'
  | 'plant'
  | 'lamp'
  | 'window'
  | 'door'
  | 'mirror'
  | 'wall-art'
  | 'fitness-mat';

export type RoomReplicaFloorMaterial =
  | 'wood-light'
  | 'wood-dark'
  | 'tile'
  | 'carpet'
  | 'concrete';

export type RoomReplicaLightingMood = 'warm' | 'neutral' | 'cool' | 'dim';

export type RoomArchitecturalFeatureType =
  | 'soffit-beam'
  | 'ceiling-fan'
  | 'ceiling-spotlights'
  | 'slatted-panel'
  | 'wall-logo'
  | 'wall-mural'
  | 'door-garland'
  | 'desk-box';

export interface RoomArchitecturalFeature {
  id: string;
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
  textLabel?: string;
  count?: number;
}

export interface RoomReplicaObject {
  id: string;
  type: RoomReplicaObjectType;
  label: string;
  x: number;
  z: number;
  widthM: number;
  depthM: number;
  heightM: number;
  /** Optional height above floor in meters for wall-mounted upper cabinets/shelves/plants (default 0) */
  elevationM?: number;
  rotationDeg: number;
  primaryColor: string;
  secondaryColor: string;
  inferred: boolean;
  confidence: number;
  /** Visual sub-type (e.g. 'built-in-bays', 'armchair', 'tall-tree', 'small-shelf-pot', 'open-doorway', 'open-wall-ledge', 'wall-cupboard') */
  variant?: string;
  /** Only render desktop monitor on desk when visibly present in the room */
  hasMonitor?: boolean;
  /** Number of bays on built-in desk / open shelf */
  bayCount?: number;
  /** Explicit door count on wall cupboards/wardrobes */
  doorCount?: number;
  /** Optional text graphic label */
  textLabel?: string;
}

export interface RoomReplicaScene {
  roomType: string;
  summary: string;
  capturedAt: string;
  roomWidthM: number;
  roomDepthM: number;
  ceilingHeightCm: number;
  floorMaterial: RoomReplicaFloorMaterial;
  floorColor: string;
  groutColor?: string;
  wallColor: string;
  leftWallColor?: string;
  upperWallColor?: string;
  accentWallColor: string;
  ceilingColor: string;
  trimColor: string;
  lightingMood: RoomReplicaLightingMood;
  objects: RoomReplicaObject[];
  architecturalFeatures?: RoomArchitecturalFeature[];
  visibleObjectCount: number;
  inferredObjectCount: number;
  floorAccuracyPct: number;
  ceilingAccuracyPct: number;
  overallAccuracyPct: number;
  previewDataUrl?: string;
}


