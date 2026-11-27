export type PoleFinishId = 'chrome' | 'stainless' | 'powder' | 'silicone' | 'brass';

export type PowderCoatTone = 'black' | 'white';

export type BaseMountId = 'tension' | 'permanent-ceiling';

export type CeilingType = 'flat' | 'vaulted';

export type PoleDiameterMm = 40 | 45;

export type PriceTierId = 'retail' | 'wholesale20' | 'wholesale30';

export type HeightUnit = 'ft' | 'mm';

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
  | 'compare-pair'
  | 'replica-match';

export type ReplicaRenderMode = 'wireframe' | 'blueprint' | 'textured';

export type RoomWallSlotId = 'back' | 'right' | 'front' | 'left';

export type RoomWallViewMode = 'full' | 'front-open' | 'back-left' | 'back-right';

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

export type DockTabId = 'room' | 'pole' | 'selection' | 'scene';

export type ViewportMode = '3d' | 'floor-plan';

export type SidebarDensity = 'full' | 'minimal';

export type FloorPlanUnit = 'm' | 'ft';

export type ModalId = 'none' | 'quote' | 'export-ar' | 'wholesale-login';

export interface PoleContextMenuState {
  screenX: number;
  screenY: number;
  source: ViewportMode;
  poleId: string | null;
  worldX?: number;
  worldZ?: number;
}

export interface PoleInstance {
  id: string;
  label: string;
  finish: PoleFinishId;
  powderTone?: PowderCoatTone;
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
  powderTone?: PowderCoatTone;
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
  clearanceRadiusM: number;
  vaultAngleDeg: number;
  priceTier: PriceTierId;
  heightUnit: HeightUnit;
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

export interface MeasuredRoomObject3D {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  widthM: number;
  depthM: number;
  heightM: number;
  minY: number;
  maxY: number;
  confidence: number;
  source: 'semantic' | 'depth-cluster';
}

export interface ReplicaCameraPose {
  pos: [number, number, number];
  target: [number, number, number];
  vfovDeg: number;
  imageAspect: number;
}

export interface ReplicaDepthMeshData {
  gridW: number;
  gridH: number;
  /** Flat XYZ vertex positions in AxisPole metric world space (length = gridW * gridH * 3) */
  positions: Float32Array;
  /** Flat UV coordinates (length = gridW * gridH * 2) */
  uvs: Float32Array;
  /** Depth-discontinuity-pruned surface triangle indices */
  indices: Uint32Array;
  /** Clean untextured occlusion-cliff skirt triangle indices for watertight 3D furniture volumes */
  skirtIndices?: Uint32Array;
  /** 3D structural quad wireframe line segments (pairs of XYZ vertices) */
  wireframePositions: Float32Array;
  /** 3D foreground/curvature emphasis quad mesh segments (sofa, pots, columns) */
  foregroundWirePositions: Float32Array;
  /** Sharp 3D depth-silhouette and normal-crease architectural contour segments */
  silhouettePositions: Float32Array;
  /** Crisp pure-white architectural CAD ink linework texture (data URL) */
  cadEdgeDataUrl: string;
  /** Dark-mode cyan architectural blueprint texture (data URL) */
  blueprintEdgeDataUrl: string;
  /** Full-color captured room frame texture matching mesh UVs (data URL) */
  sourcePhotoDataUrl: string;
  /** Calibrated camera capture pose for 1:1 photo-matched 3D perspective */
  cameraPose: ReplicaCameraPose;
  /** Metric floor footprint bounds of reconstructed mesh */
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  /** Depth reconstruction engine used */
  depthEngine: 'depth-anything-v2' | 'geometric-depth';
  /** Measured 3D object volumes (W x D x H in meters) */
  measuredObjects: MeasuredRoomObject3D[];
}

export interface WallDetectedObstacle {
  id: string;
  wall: RoomWallSlotId;
  label: string;
  /** Horizontal center along the wall (0 = left edge, 1 = right edge when facing wall) */
  uCenter: number;
  /** Fraction of the wall width occupied by this obstacle (0..1) */
  uWidth: number;
  /** Fraction of the room ceiling height occupied from floor up (0..1) */
  heightRatio: number;
  /** Estimated protrusion depth into the room in meters */
  depthM: number;
}

export interface CapturedWallImage {
  slot: RoomWallSlotId;
  sourceDataUrl: string;
  cadWireframeDataUrl: string;
  blueprintDataUrl: string;
  aspectRatio: number;
  dominantHex: string;
  detectedObstacles: WallDetectedObstacle[];
}

export interface FourWallRoomData {
  walls: Record<RoomWallSlotId, CapturedWallImage | null>;
  capturedCount: number;
  estimatedWidthM: number;
  estimatedDepthM: number;
  estimatedCeilingCm: number;
  floorColorHex: string;
  ceilingColorHex: string;
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
  depthMesh?: ReplicaDepthMeshData;
  fourWallRoom?: FourWallRoomData;
}


