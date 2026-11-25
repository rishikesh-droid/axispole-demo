import type {
  AssemblyPartOffsets,
  AssemblyStepSpec,
  BaseMountId,
  BaseMountSpec,
  BOMLineItem,
  BOMSummary,
  CeilingType,
  ClearanceAnalysis,
  CushionPlacement,
  ExtensionPiece,
  HardwarePartId,
  HardwarePartSpec,
  HeightSolution,
  LightingPreset,
  PoleClampResult,
  PoleDiameterMm,
  PoleFinishId,
  PoleFinishSpec,
  PoleInstance,
  PoleRigConfig,
} from '../types/pole';

import {
  getXPoleFinishLabel,
  resolveXPoleConfiguration,
} from '../data/xpoleCatalog';

export const MIN_ROOM_SIZE_M = 3.0;
export const DEV_MIN_ROOM_SIZE_M = 1.5;
export const MAX_ROOM_SIZE_M = 7.0;
export const MIN_WALL_CLEARANCE_M = 1.25;
export const DEV_MIN_WALL_CLEARANCE_M = 0.35;
export const MAX_POLES_IN_STUDIO = 24;

/** Official X-POLE room ceiling height bounds (7'0" / 213cm – 14'3" / 434cm) */
export const MIN_CEILING_HEIGHT_CM = 213;
export const MAX_CEILING_HEIGHT_CM = 434;

/** Individual pole height bounds (1.50m min, 4.34m / 14'3" max PX Build-a-Pole height) */
export const MIN_POLE_HEIGHT_CM = 150;
export const MAX_POLE_HEIGHT_CM = 434;

export const LIGHTING_PRESETS: {
  id: LightingPreset;
  label: string;
  shortLabel: string;
  mobileLabel: string;
  isDarkTheme: boolean;
}[] = [
  {
    id: 'studio-daylight',
    label: 'Studio Daylight',
    shortLabel: 'Daylight',
    mobileLabel: 'Day',
    isDarkTheme: false,
  },
  {
    id: 'mood-neon',
    label: 'Mood/Night Neon',
    shortLabel: 'Neon',
    mobileLabel: 'Neon',
    isDarkTheme: true,
  },
  {
    id: 'pro-spotlight',
    label: 'Professional Spotlight',
    shortLabel: 'Spotlight',
    mobileLabel: 'Spot',
    isDarkTheme: true,
  },
  {
    id: 'sunset-flow',
    label: 'Sunset Flow',
    shortLabel: 'Sunset',
    mobileLabel: 'Sunset',
    isDarkTheme: true,
  },
  {
    id: 'cyber-pulse',
    label: 'Cyber Pulse',
    shortLabel: 'Pulse',
    mobileLabel: 'Pulse',
    isDarkTheme: true,
  },
];

export const POLE_FINISHES: Record<PoleFinishId, PoleFinishSpec> = {
  chrome: {
    id: 'chrome',
    name: 'Chrome',
    shortName: 'Chrome',
    alloy: '4130 Structural Steel + Mirror Electroplated Chrome',
    swatchHex: '#e6edf5',
    accentHex: '#94a3b8',
    basePriceUsd: 749.95,
    gripLevel: 'Industry Standard Grip',
    wallThicknessMm: 2.0,
    weightPerMeterKg: 2.18,
    hypoallergenic: false,
    pbr: {
      color: 0xf4f7fb,
      metalness: 1.0,
      roughness: 0.04,
      clearcoat: 0.35,
      clearcoatRoughness: 0.06,
      anisotropy: 0.35,
      sheen: 0.0,
    },
    summary:
      'High-gloss electroplated chrome steel offering smooth spin glide and universal studio compatibility.',
    cleaningAgent: '70% Isopropyl Alcohol (IPA) with lint-free microfiber',
    cleaningNotes: [
      'Wipe down with 70% IPA after sessions to clear skin oils and grip aids.',
      'Buff dry with a clean microfiber cloth to maintain mirror reflectivity.',
    ],
    avoidList: [
      'Abrasive pads or scouring powders (scratches chrome plating)',
      'Rings or metal buckles during practice',
    ],
  },
  stainless: {
    id: 'stainless',
    name: 'Stainless Steel',
    shortName: 'Stainless',
    alloy: 'AISI 316L Surgical-Grade Austenitic Steel',
    swatchHex: '#cfd6de',
    accentHex: '#64748b',
    basePriceUsd: 859.95,
    gripLevel: 'Hypoallergenic Neutral',
    wallThicknessMm: 2.0,
    weightPerMeterKg: 2.15,
    hypoallergenic: true,
    pbr: {
      color: 0xdce2e9,
      metalness: 0.96,
      roughness: 0.12,
      clearcoat: 0.22,
      clearcoatRoughness: 0.12,
      anisotropy: 0.45,
      sheen: 0.0,
    },
    summary:
      'Nickel-safe surgical 316L competition steel that will never flake, chip, or corrode.',
    cleaningAgent: '70%–91% Isopropyl Alcohol (IPA) with lint-free microfiber',
    cleaningNotes: [
      'Spray 70% IPA onto a clean microfiber cloth—never directly into the bearing hub.',
      'Sanitizes cleanly between studio users without altering surface roughness.',
    ],
    avoidList: [
      'Silicone-based furniture polishes (creates hazardous slippery film)',
      'Chloride-heavy disinfectants',
    ],
  },
  powder: {
    id: 'powder',
    name: 'Powder Coated Black/White',
    shortName: 'Powder Coated',
    alloy: '4130 Chromoly Core + 120µm Baked Polyester Coat',
    swatchHex: '#23262b',
    accentHex: '#0f172a',
    basePriceUsd: 749.95,
    gripLevel: 'High Tactile Traction',
    wallThicknessMm: 2.2,
    weightPerMeterKg: 2.32,
    hypoallergenic: true,
    pbr: {
      color: 0x1c1f24,
      metalness: 0.14,
      roughness: 0.42,
      clearcoat: 0.3,
      clearcoatRoughness: 0.45,
      anisotropy: 0.0,
      sheen: 0.05,
    },
    summary:
      'Electrostatic thermoset matte-satin coating in Black or White for confident grip in cool studios.',
    cleaningAgent: 'Mild pH-neutral dish soap solution or diluted 50% IPA',
    cleaningNotes: [
      'Clean with warm water and two drops of mild pH-neutral dish soap on a damp microfiber towel.',
      'Buff dry to preserve smooth satin traction.',
    ],
    avoidList: [
      'Acetone, MEK, or paint thinners (softens polyester finish)',
      'Sharp jewelry or zippers against the coated surface',
    ],
  },
  silicone: {
    id: 'silicone',
    name: 'Silicone Black',
    shortName: 'Silicone',
    alloy: '4130 Steel Core + Vulcanized Black Silicone Sleeve',
    swatchHex: '#1f1f24',
    accentHex: '#3f3f46',
    basePriceUsd: 853.95,
    gripLevel: 'Maximum Clothed Grip',
    wallThicknessMm: 5.0,
    weightPerMeterKg: 2.68,
    hypoallergenic: true,
    pbr: {
      color: 0x1d1d21,
      metalness: 0.02,
      roughness: 0.86,
      clearcoat: 0.0,
      clearcoatRoughness: 0.9,
      anisotropy: 0.0,
      sheen: 0.45,
    },
    summary:
      'Bonded black silicone wrap engineered for maximum grip even in full studio clothing.',
    cleaningAgent: 'Warm distilled water + mild castile soap (alcohol-free)',
    cleaningNotes: [
      'Wipe with warm water and gentle soap to remove lint.',
      'Air dry completely before storing.',
    ],
    avoidList: [
      'High-percentage alcohol or solvents (dries elastomer)',
      'Oil-based lotions or sharp buckles',
    ],
  },
  brass: {
    id: 'brass',
    name: 'Brass',
    shortName: 'Brass',
    alloy: 'Solid Architectural Brass Tubing (Cu-Zn)',
    swatchHex: '#c89d46',
    accentHex: '#9a7122',
    basePriceUsd: 983.95,
    gripLevel: 'High Warm-Climate Grip',
    wallThicknessMm: 2.5,
    weightPerMeterKg: 2.85,
    hypoallergenic: true,
    pbr: {
      color: 0xd9af54,
      metalness: 0.94,
      roughness: 0.16,
      clearcoat: 0.18,
      clearcoatRoughness: 0.2,
      anisotropy: 0.72,
      sheen: 0.0,
    },
    summary:
      'Solid seamless brass prized for superior dry-skin grip and rapid thermal warming.',
    cleaningAgent: 'Warm diluted vinegar mist or non-abrasive brass polish',
    cleaningNotes: [
      'Wipe after every session with a dry microfiber cloth to slow oxidation.',
      'Deep-clean weekly with diluted vinegar mist and buff dry.',
    ],
    avoidList: [
      'Chlorine bleach or acidic bathroom cleaners',
      'Steel wool or abrasive scouring pads',
    ],
  },
};

export const BASE_MOUNTS: Record<BaseMountId, BaseMountSpec> = {
  tension: {
    id: 'tension',
    name: 'Tension Micro-Base & Dome',
    shortName: 'Tension',
    priceDeltaUsd: 0,
    weightKg: 3.4,
    minHeightCm: MIN_POLE_HEIGHT_CM,
    maxHeightCm: MAX_POLE_HEIGHT_CM,
    drillingRequired: false,
    ceilingLoadKn: 1.8,
    floorFootprintM: 0.24,
    fastenerSpec: 'M24 Threaded Jackscrew + Dual M8 Lock Nuts',
    torqueNm: 22,
    description:
      'Pressure-mounted articulating silicone dome and low-profile floor base. Zero ceiling drilling.',
  },
  'permanent-ceiling': {
    id: 'permanent-ceiling',
    name: 'Permanent Bolted Ceiling Mount',
    shortName: 'Fixed Ceiling',
    priceDeltaUsd: 0,
    weightKg: 4.1,
    minHeightCm: MIN_POLE_HEIGHT_CM,
    maxHeightCm: MAX_POLE_HEIGHT_CM,
    drillingRequired: true,
    ceilingLoadKn: 4.5,
    floorFootprintM: 0.23,
    fastenerSpec: '4× M10 Structural Lag / Anchor Bolts (Class 10.9)',
    torqueNm: 38,
    description:
      'Studio-grade steel ceiling flange bolted into solid timber joist or concrete slab.',
  },
};

export const DIAMETER_OPTIONS: {
  mm: PoleDiameterMm;
  label: string;
  priceDeltaUsd: number;
  note: string;
}[] = [
  { mm: 40, label: '40mm', priceDeltaUsd: 0, note: 'Agile hand grip' },
  { mm: 45, label: '45mm', priceDeltaUsd: 0, note: 'Competition standard' },
];

export const HARDWARE_PARTS: Record<HardwarePartId, HardwarePartSpec> = {
  'base-plate': {
    id: 'base-plate',
    name: 'Base Flange & Elastomer Ring',
    category: 'Foundation',
    material: 'CNC 6061-T6 Aluminum + 70A Silicone',
    torqueSpec: 'Level ±0.5° · Friction Seated',
    inspectionNote: 'Ensure dry floor contact with zero debris under elastomer ring.',
    cameraFocus: 'base-hub',
  },
  'bearing-hub': {
    id: 'bearing-hub',
    name: 'Dual-Bearing Spin-Lock Hub',
    category: 'Rotary Hub',
    material: '52100 Bearing Steel + Dual M6 Pins',
    torqueSpec: '8.5 N·m (Static) · Retracted 4mm (Spin)',
    inspectionNote: 'Seat both M6 hex pins flush inside inner hub collar before spinning.',
    cameraFocus: 'base-hub',
  },
  'lower-tube': {
    id: 'lower-tube',
    name: 'Lower Column (A-Pole · 1020mm)',
    category: 'Primary Column',
    material: 'Seamless Drawn Structural Tubing',
    torqueSpec: '14.0 N·m drive collar',
    inspectionNote: 'Seat keyway fully over bearing drive lugs prior to loading.',
    cameraFocus: 'full-rig',
  },
  'x-joint': {
    id: 'x-joint',
    name: 'Expanding Wedge X-Joint Coupler',
    category: 'Structural Splice',
    material: '4140 Hardened Alloy Steel',
    torqueSpec: '18.0 N·m (5mm Hex Key)',
    inspectionNote: 'Align keyhole arrows before expansion; never exceed 20 N·m.',
    cameraFocus: 'x-joint',
  },
  'upper-tube': {
    id: 'upper-tube',
    name: 'Upper Column (B-Pole · 1020mm)',
    category: 'Primary Column',
    material: 'Seamless Drawn Structural Tubing',
    torqueSpec: '18.0 N·m at X-Joints',
    inspectionNote: 'Verify flush zero-lip seam across the splice.',
    cameraFocus: 'x-joint',
  },
  'extension-tube': {
    id: 'extension-tube',
    name: 'Modular Height Extension Tube',
    category: 'Height Extension',
    material: 'Matched Finish Tubing',
    torqueSpec: '18.0 N·m per X-Joint',
    inspectionNote: 'Stack shorter extensions above longer columns at the top.',
    cameraFocus: 'top-mount',
  },
  'adjuster-rod': {
    id: 'adjuster-rod',
    name: 'M24 Tension Adjuster & Lock Collar',
    category: 'Preload Tensioner',
    material: '1045 Steel Acme Rod + Twin M8 Nuts',
    torqueSpec: '22.0 N·m preload · 10.0 N·m jam nuts',
    inspectionNote: 'Never extend past the 125mm red safety limit groove.',
    cameraFocus: 'top-mount',
  },
  'top-mount': {
    id: 'top-mount',
    name: 'Upper Articulating Dome / Anchor',
    category: 'Ceiling Interface',
    material: 'Structural Steel + High-Friction Silicone',
    torqueSpec: '1.8 kN Axial (Tension) / 38–42 N·m (Bolted)',
    inspectionNote: 'Center directly beneath solid timber ceiling joist or beam.',
    cameraFocus: 'top-mount',
  },
  'height-cushion': {
    id: 'height-cushion',
    name: 'Structural Height Cushion & Load Spacer',
    category: 'Height Compensator',
    material: 'High-Density Ribbed Elastomer Core + 6061-T6 Load Caps',
    torqueSpec: '2.4 kN Compression Rated · Top or Floor Seated',
    inspectionNote: 'Bridges gap when ceiling exceeds pole height or 3.00m max pole limit.',
    cameraFocus: 'top-mount',
  },
};

export const ASSEMBLY_STEPS: AssemblyStepSpec[] = [
  {
    step: 1,
    id: 'step-base',
    title: 'Seat Base Flange & Verify Level',
    shortTitle: 'Base Flange',
    partId: 'base-plate',
    cameraFocus: 'base-hub',
    torqueNm: 0,
    torqueFtLb: 0,
    fastener: '70A Silicone Compression Ring',
    toolRequired: 'Spirit Level',
    safetyNote: 'Align base directly beneath solid ceiling joist.',
    installInstruction:
      'Position the machined 230mm micro-base flange centered in your training zone directly beneath a ceiling joist or structural beam.',
    dismantleInstruction:
      'Lift base plate straight up after upper column removal. Wipe elastomer clean and stow inside padded pouch.',
  },
  {
    step: 2,
    id: 'step-bearing',
    title: 'Engage Bearing Hub & Lock Pins',
    shortTitle: 'Bearing Hub',
    partId: 'bearing-hub',
    cameraFocus: 'base-hub',
    torqueNm: 8.5,
    torqueFtLb: 6.3,
    fastener: '2× M6 × 16mm Hex Set Screws',
    toolRequired: '4mm Hex Key',
    safetyNote: 'Lock hub in Static mode before applying upper tension.',
    installInstruction:
      'Seat the dual sealed bearing cartridge onto the base spindle. Torque both opposing M6 lock pins to 8.5 N·m.',
    dismantleInstruction:
      'Verify both M6 lock pins are tightened to 8.5 N·m before loosening upper tensioner.',
  },
  {
    step: 3,
    id: 'step-lower-tube',
    title: 'Mount Lower Column (A-Pole)',
    shortTitle: 'A-Pole',
    partId: 'lower-tube',
    cameraFocus: 'base-hub',
    torqueNm: 14.0,
    torqueFtLb: 10.3,
    fastener: 'Keyed Drive Collar + 2× M6 Screws',
    toolRequired: '4mm Hex Key',
    safetyNote: 'Confirm keyway sits flush against bearing collar.',
    installInstruction:
      'Slide the 1020mm A-Pole vertically onto the hub spindle until drive lugs engage, then torque retention screws to 14.0 N·m.',
    dismantleInstruction:
      'Back out retention screws two turns and lift A-Pole straight off the spindle.',
  },
  {
    step: 4,
    id: 'step-xjoint',
    title: 'Install Expanding X-Joint Coupler',
    shortTitle: 'X-Joint',
    partId: 'x-joint',
    cameraFocus: 'x-joint',
    torqueNm: 18.0,
    torqueFtLb: 13.3,
    fastener: 'M10 Internal Wedge Drawbolt',
    toolRequired: '5mm Hex Key',
    safetyNote: 'Align keyhole arrows before radial expansion.',
    installInstruction:
      'Insert the expanding X-Joint halfway into the A-Pole until the hex slot aligns with the tube keyhole.',
    dismantleInstruction:
      'Turn 5mm hex key counterclockwise 2.5 turns to contract wedge, then slide coupler out.',
  },
  {
    step: 5,
    id: 'step-upper-ext',
    title: 'Join B-Pole & Height Extensions',
    shortTitle: 'B-Pole + Ext',
    partId: 'upper-tube',
    cameraFocus: 'x-joint',
    torqueNm: 18.0,
    torqueFtLb: 13.3,
    fastener: 'Internal X-Joint Drawbolts',
    toolRequired: '5mm Hex Key',
    safetyNote: 'Torque to 18.0 N·m in two progressive passes.',
    installInstruction:
      'Lower the 1020mm B-Pole onto the X-Joint and torque to 18.0 N·m. Add required top height extensions with matching X-Joints.',
    dismantleInstruction:
      'Brace upper column while loosening top extension X-Joints first, then the main B-Pole joint.',
  },
  {
    step: 6,
    id: 'step-top-mount',
    title: 'Seat Upper Mount & Apply Tension',
    shortTitle: 'Top Mount',
    partId: 'top-mount',
    cameraFocus: 'top-mount',
    torqueNm: 22.0,
    torqueFtLb: 16.2,
    fastener: 'M24 Adjuster Rod (Bolted: 4× M10 @ 38–42 N·m)',
    toolRequired: '32mm Spanner',
    safetyNote: 'Never exceed 125mm exposed adjuster thread.',
    installInstruction:
      'Rotate M24 adjuster rod counterclockwise to expand the dome firmly against ceiling joist until 1.8 kN axial tension is reached.',
    dismantleInstruction:
      'Loosen M8 jam nuts first, then rotate M24 adjuster clockwise to relieve ceiling tension smoothly.',
  },
  {
    step: 7,
    id: 'step-cover-check',
    title: 'Lock Jam Nuts & Fit Cover Sleeve',
    shortTitle: 'Lock & Cover',
    partId: 'adjuster-rod',
    cameraFocus: 'top-mount',
    torqueNm: 10.0,
    torqueFtLb: 7.4,
    fastener: '2× M8 Jam Nuts + Cover Sleeve',
    toolRequired: '4mm & 5mm Hex',
    safetyNote: 'Re-check all X-Joints after 30 min break-in.',
    installInstruction:
      'Tighten twin M8 jam nuts to 10.0 N·m, slide telescoping cover over threads, and verify lateral stability.',
    dismantleInstruction:
      'Slide adjuster cover downward and loosen both M8 jam nuts 3 turns before retracting rod.',
  },
];

export const DEFAULT_CONFIG: PoleRigConfig = {
  finish: 'chrome',
  powderTone: 'black',
  diameterMm: 45,
  mount: 'tension',
  ceilingType: 'flat',
  ceilingHeightCm: 274,
  poleHeightCm: 274,
  cushionPlacement: 'top',
  isSpinning: true,
  spinRpm: 18,
  environment: 'studio',
  lighting: 'mood-neon',
  roomWidthM: 5.4,
  roomDepthM: 5.2,
  showClearanceRing: true,
  enforceMinClearance: true,
  clearanceRadiusM: 1.25,
  vaultAngleDeg: 22,
  priceTier: 'retail',
  heightUnit: 'ft',
};

/**
 * Computes the effective visual/physical slope angle (radians) of a tilted/vaulted
 * room ceiling, clamped so the lower eave wall stays architecturally realistic (>= 1.68m).
 */
export function computeEffectiveVaultRad(
  ceilingHeightM: number,
  roomWidthM: number,
  ceilingType: CeilingType,
  vaultAngleDeg: number
): number {
  if (ceilingType !== 'vaulted') return 0;
  const maxVisualRad = Math.atan(
    Math.max(0.25, ceilingHeightM - 1.68) / Math.max(1.2, roomWidthM * 0.5)
  );
  return Math.min(maxVisualRad, (Math.max(4, vaultAngleDeg) * Math.PI) / 180);
}

/**
 * Computes the exact ceiling height directly above a pole at horizontal coordinate poleX
 * under a flat or globally tilted/vaulted room ceiling.
 */
export function computeLocalCeilingHeightCm(
  ceilingHeightCm: number,
  roomWidthM: number,
  ceilingType: CeilingType,
  vaultAngleDeg: number,
  poleX: number
): number {
  const safeCeil = Math.round(ceilingHeightCm);
  if (ceilingType !== 'vaulted') return safeCeil;
  const H = safeCeil / 100;
  const vaultRad = computeEffectiveVaultRad(H, roomWidthM, ceilingType, vaultAngleDeg);
  const localM = H + poleX * Math.tan(vaultRad);
  return Math.max(MIN_POLE_HEIGHT_CM, Math.round(localM * 100));
}

export function clampPoleHeightCm(rawHeightCm: number, ceilingHeightCm: number): number {
  const maxAllowed = Math.max(
    MIN_POLE_HEIGHT_CM,
    Math.min(Math.round(ceilingHeightCm), MAX_POLE_HEIGHT_CM)
  );
  return Math.max(MIN_POLE_HEIGHT_CM, Math.min(maxAllowed, Math.round(rawHeightCm)));
}

export function getCushionHeightCm(
  ceilingHeightCm: number,
  poleHeightCm: number,
  _cushionPlacement: CushionPlacement = 'top'
): number {
  const effectivePole = clampPoleHeightCm(poleHeightCm, ceilingHeightCm);
  return Math.max(0, Math.round(ceilingHeightCm) - effectivePole);
}

/**
 * Updates all poles when the shared room ceiling height changes:
 * - Poles that were flush with the previous ceiling (or at the 3.00m max limit) track the new ceiling up to 3.00m.
 * - Whenever ceiling exceeds a pole's height (including ceilings above 3.00m), the exact difference height is automatically cushioned.
 * - Poles intentionally set to custom shorter heights preserve their individual height (clamped if ceiling drops below them).
 */
export function reconcilePolesForCeilingHeight(
  poles: PoleInstance[],
  prevCeilingCm: number,
  nextCeilingCm: number
): PoleInstance[] {
  const prevMaxPole = Math.min(Math.round(prevCeilingCm), MAX_POLE_HEIGHT_CM);
  const nextMaxPole = Math.max(
    MIN_POLE_HEIGHT_CM,
    Math.min(Math.round(nextCeilingCm), MAX_POLE_HEIGHT_CM)
  );

  return poles.map((p) => {
    const wasFlush = p.heightCm >= prevMaxPole - 1;
    const nextHeight = wasFlush
      ? nextMaxPole
      : clampPoleHeightCm(p.heightCm, nextCeilingCm);
    return {
      ...p,
      heightCm: nextHeight,
    };
  });
}

export function createInitialPoles(): PoleInstance[] {
  return [
    {
      id: 'pole-1',
      label: 'Pole 1',
      finish: 'chrome',
      powderTone: 'black',
      diameterMm: 45,
      heightCm: clampPoleHeightCm(DEFAULT_CONFIG.ceilingHeightCm, DEFAULT_CONFIG.ceilingHeightCm),
      cushionPlacement: 'top',
      isSpinning: true,
      spinRpm: 18,
      x: 0,
      z: 0,
    },
  ];
}

export function getMinRoomSizeM(enforceMinClearance = true): number {
  return enforceMinClearance ? MIN_ROOM_SIZE_M : DEV_MIN_ROOM_SIZE_M;
}

export function getWallClearanceMarginM(
  _mountId?: BaseMountId,
  enforceMinClearance = true,
  clearanceRadiusM = MIN_WALL_CLEARANCE_M
): number {
  return enforceMinClearance ? Math.max(DEV_MIN_WALL_CLEARANCE_M, clearanceRadiusM) : DEV_MIN_WALL_CLEARANCE_M;
}

export function getMinPoleSeparationM(
  _mountA?: BaseMountId,
  _mountB?: BaseMountId,
  enforceMinClearance = true
): number {
  return enforceMinClearance ? 1.65 : 0.65;
}

/**
 * Clamps a pole's floor (x, z) coordinates strictly within the room's wall
 * clearance margin AND maintains safe separation from other poles.
 */
export function clampPolePosition(
  rawX: number,
  rawZ: number,
  roomWidthM: number,
  roomDepthM: number,
  mountId: BaseMountId,
  otherPoles: Pick<PoleInstance, 'x' | 'z'>[] = [],
  enforceMinClearance = true
): PoleClampResult {
  const minWallMarginM = getWallClearanceMarginM(mountId, enforceMinClearance);
  const minRoomM = getMinRoomSizeM(enforceMinClearance);
  const safeW = Math.max(minRoomM, roomWidthM);
  const safeD = Math.max(minRoomM, roomDepthM);

  const maxX = Math.max(0, safeW / 2 - minWallMarginM);
  const maxZ = Math.max(0, safeD / 2 - minWallMarginM);

  let x = Math.max(-maxX, Math.min(maxX, rawX));
  let z = Math.max(-maxZ, Math.min(maxZ, rawZ));
  let hitWallBoundary =
    Math.abs(rawX) > maxX + 1e-4 || Math.abs(rawZ) > maxZ + 1e-4;
  let hitPoleBoundary = false;

  // Resolve inter-pole minimum separation iteratively so poles cannot clip each other
  for (let pass = 0; pass < 4; pass++) {
    for (const other of otherPoles) {
      const minDist = getMinPoleSeparationM(mountId, mountId, enforceMinClearance);
      const dx = x - other.x;
      const dz = z - other.z;
      const dist = Math.hypot(dx, dz);
      if (dist < minDist - 1e-4) {
        hitPoleBoundary = true;
        const nx = dist > 1e-5 ? dx / dist : 1;
        const nz = dist > 1e-5 ? dz / dist : 0;
        x = other.x + nx * minDist;
        z = other.z + nz * minDist;

        // Re-clamp against room walls and slide tangentially along wall if needed to preserve minDist
        if (Math.abs(x) > maxX) {
          x = Math.sign(x) * maxX;
          hitWallBoundary = true;
          const rem = Math.max(0, minDist * minDist - (x - other.x) * (x - other.x));
          const reqDz = Math.sqrt(rem);
          const signZ = z >= other.z ? 1 : -1;
          const candidateZ = other.z + signZ * reqDz;
          z =
            Math.abs(candidateZ) <= maxZ
              ? candidateZ
              : Math.max(-maxZ, Math.min(maxZ, other.z - signZ * reqDz));
        }
        if (Math.abs(z) > maxZ) {
          z = Math.sign(z) * maxZ;
          hitWallBoundary = true;
          const rem = Math.max(0, minDist * minDist - (z - other.z) * (z - other.z));
          const reqDx = Math.sqrt(rem);
          const signX = x >= other.x ? 1 : -1;
          const candidateX = other.x + signX * reqDx;
          x =
            Math.abs(candidateX) <= maxX
              ? candidateX
              : Math.max(-maxX, Math.min(maxX, other.x - signX * reqDx));
        }
      }
    }
  }

  return {
    x: Number(x.toFixed(3)),
    z: Number(z.toFixed(3)),
    hitWallBoundary,
    hitPoleBoundary,
    minWallMarginM,
  };
}

/**
 * Validates whether a specific floor coordinate (x, z) satisfies wall clearance
 * (1.25m when enforced) AND minimum separation from all existing poles.
 */
export function isPositionValidForNewPole(
  x: number,
  z: number,
  existingPoles: Pick<PoleInstance, 'x' | 'z'>[],
  roomWidthM: number,
  roomDepthM: number,
  mountId: BaseMountId = 'tension',
  enforceMinClearance = true
): boolean {
  const wallMargin = getWallClearanceMarginM(mountId, enforceMinClearance);
  const maxX = roomWidthM / 2 - wallMargin;
  const maxZ = roomDepthM / 2 - wallMargin;
  if (maxX < -1e-4 || maxZ < -1e-4) return false;
  if (Math.abs(x) > maxX + 1e-4 || Math.abs(z) > maxZ + 1e-4) return false;

  const minSep = getMinPoleSeparationM(mountId, mountId, enforceMinClearance);
  return existingPoles.every((p) => Math.hypot(x - p.x, z - p.z) >= minSep - 1e-3);
}

/**
 * Searches the valid clearance-safe interior rectangle of the room for an open
 * position that honors wall clearance (1.25m by default) and inter-pole separation.
 * Returns null if no additional pole can safely fit in the current room.
 */
export function findAvailablePoleSlot(
  existingPoles: Pick<PoleInstance, 'x' | 'z'>[],
  roomWidthM: number,
  roomDepthM: number,
  mountId: BaseMountId = 'tension',
  enforceMinClearance = true,
  preferred?: { x: number; z: number }
): { x: number; z: number } | null {
  if (existingPoles.length >= MAX_POLES_IN_STUDIO) return null;

  const wallMargin = getWallClearanceMarginM(mountId, enforceMinClearance);
  const maxX = roomWidthM / 2 - wallMargin;
  const maxZ = roomDepthM / 2 - wallMargin;
  if (maxX < -1e-4 || maxZ < -1e-4) return null;

  const safeMaxX = Math.max(0, maxX);
  const safeMaxZ = Math.max(0, maxZ);
  const minSep = getMinPoleSeparationM(mountId, mountId, enforceMinClearance);

  // 1. Honor explicit preferred position (e.g. right-click "Add Pole Here") if valid
  if (preferred) {
    const px = Number(Math.max(-safeMaxX, Math.min(safeMaxX, preferred.x)).toFixed(3));
    const pz = Number(Math.max(-safeMaxZ, Math.min(safeMaxZ, preferred.z)).toFixed(3));
    if (
      isPositionValidForNewPole(
        px,
        pz,
        existingPoles,
        roomWidthM,
        roomDepthM,
        mountId,
        enforceMinClearance
      )
    ) {
      return { x: px, z: pz };
    }
  }

  // 2. If room has no poles yet, place cleanly at center
  if (existingPoles.length === 0) {
    return { x: 0, z: 0 };
  }

  // 3. Try curated symmetric anchor offsets first so 2–5 pole layouts feel balanced
  const stepDist = enforceMinClearance ? 1.75 : 0.78;
  const anchorCandidates: [number, number][] = [
    [stepDist, 0],
    [-stepDist, 0],
    [0, stepDist],
    [0, -stepDist],
    [safeMaxX, safeMaxZ],
    [-safeMaxX, safeMaxZ],
    [safeMaxX, -safeMaxZ],
    [-safeMaxX, -safeMaxZ],
    [safeMaxX, 0],
    [-safeMaxX, 0],
    [0, safeMaxZ],
    [0, -safeMaxZ],
  ];

  for (const [cx, cz] of anchorCandidates) {
    const x = Number(Math.max(-safeMaxX, Math.min(safeMaxX, cx)).toFixed(3));
    const z = Number(Math.max(-safeMaxZ, Math.min(safeMaxZ, cz)).toFixed(3));
    if (
      isPositionValidForNewPole(
        x,
        z,
        existingPoles,
        roomWidthM,
        roomDepthM,
        mountId,
        enforceMinClearance
      )
    ) {
      return { x, z };
    }
  }

  // 4. Exhaustive deterministic grid search across [-safeMaxX, safeMaxX] × [-safeMaxZ, safeMaxZ]
  const step = enforceMinClearance ? 0.16 : 0.12;
  const xs: number[] = [-safeMaxX, 0, safeMaxX];
  for (let gx = -safeMaxX + step; gx < safeMaxX - 1e-4; gx += step) {
    xs.push(gx);
  }
  const zs: number[] = [-safeMaxZ, 0, safeMaxZ];
  for (let gz = -safeMaxZ + step; gz < safeMaxZ - 1e-4; gz += step) {
    zs.push(gz);
  }

  let best: { x: number; z: number; score: number } | null = null;
  for (const rawX of xs) {
    for (const rawZ of zs) {
      let nearest = Infinity;
      for (const p of existingPoles) {
        const d = Math.hypot(rawX - p.x, rawZ - p.z);
        if (d < nearest) nearest = d;
      }
      if (nearest < minSep - 1e-3) continue;

      // Prefer well-spaced spots (high nearest distance), gently tie-broken toward preferred point or center
      const refX = preferred ? preferred.x : 0;
      const refZ = preferred ? preferred.z : 0;
      const refDist = Math.hypot(rawX - refX, rawZ - refZ);
      const score = preferred ? -refDist + Math.min(nearest, minSep + 0.5) * 0.25 : nearest - refDist * 0.12;

      if (!best || score > best.score) {
        best = {
          x: Number(rawX.toFixed(3)),
          z: Number(rawZ.toFixed(3)),
          score,
        };
      }
    }
  }

  return best ? { x: best.x, z: best.z } : null;
}

export function canFitAdditionalPole(
  existingPoles: Pick<PoleInstance, 'x' | 'z'>[],
  roomWidthM: number,
  roomDepthM: number,
  mountId: BaseMountId = 'tension',
  enforceMinClearance = true
): boolean {
  return (
    findAvailablePoleSlot(
      existingPoles,
      roomWidthM,
      roomDepthM,
      mountId,
      enforceMinClearance
    ) !== null
  );
}

/**
 * Attempts to create a new pole strictly within valid room clearance.
 * Returns null if the room has no remaining space that satisfies wall & pole clearance.
 */
export function tryCreateNextPoleInstance(
  existingPoles: PoleInstance[],
  roomWidthM: number,
  roomDepthM: number,
  enforceMinClearance = true,
  ceilingHeightCm = DEFAULT_CONFIG.ceilingHeightCm,
  mountId: BaseMountId = 'tension',
  preferred?: { x: number; z: number }
): PoleInstance | null {
  const slot = findAvailablePoleSlot(
    existingPoles,
    roomWidthM,
    roomDepthM,
    mountId,
    enforceMinClearance,
    preferred
  );
  if (!slot) return null;

  const finishCycle: PoleFinishId[] = ['chrome', 'stainless', 'powder', 'silicone', 'brass'];
  const usedFinishes = new Set(existingPoles.map((p) => p.finish));
  const nextFinish =
    finishCycle.find((f) => !usedFinishes.has(f)) ??
    finishCycle[existingPoles.length % finishCycle.length];

  const nextNum = existingPoles.length + 1;

  return {
    id: `pole-${Date.now().toString(36)}-${nextNum}`,
    label: `Pole ${nextNum}`,
    finish: nextFinish,
    powderTone: 'black',
    diameterMm: 45,
    heightCm: clampPoleHeightCm(ceilingHeightCm, ceilingHeightCm),
    cushionPlacement: 'top',
    isSpinning: true,
    spinRpm: 16,
    x: slot.x,
    z: slot.z,
  };
}

/**
 * Finds an uncluttered, wall-safe spawn position for a newly added pole
 * with a contrasting finish so multi-pole setups look immediately curated.
 */
export function createNextPoleInstance(
  existingPoles: PoleInstance[],
  roomWidthM: number,
  roomDepthM: number,
  enforceMinClearance = true,
  ceilingHeightCm = DEFAULT_CONFIG.ceilingHeightCm
): PoleInstance {
  const placed = tryCreateNextPoleInstance(
    existingPoles,
    roomWidthM,
    roomDepthM,
    enforceMinClearance,
    ceilingHeightCm
  );
  if (placed) return placed;

  // Fallback for direct programmatic calls when space is tight
  const finishCycle: PoleFinishId[] = ['chrome', 'stainless', 'powder', 'silicone', 'brass'];
  const nextNum = existingPoles.length + 1;
  const fallback = clampPolePosition(
    0,
    0,
    roomWidthM,
    roomDepthM,
    'tension',
    existingPoles,
    enforceMinClearance
  );
  return {
    id: `pole-${Date.now().toString(36)}-${nextNum}`,
    label: `Pole ${nextNum}`,
    finish: finishCycle[existingPoles.length % finishCycle.length],
    powderTone: 'black',
    diameterMm: 45,
    heightCm: clampPoleHeightCm(ceilingHeightCm, ceilingHeightCm),
    cushionPlacement: 'top',
    isSpinning: true,
    spinRpm: 16,
    x: fallback.x,
    z: fallback.z,
  };
}

const EXTENSION_CATALOG: { lengthMm: number; priceUsd: number; weightFactor: number }[] = [
  { lengthMm: 750, priceUsd: 89, weightFactor: 0.75 },
  { lengthMm: 500, priceUsd: 68, weightFactor: 0.5 },
  { lengthMm: 250, priceUsd: 46, weightFactor: 0.25 },
  { lengthMm: 125, priceUsd: 34, weightFactor: 0.125 },
];

export function calculateHeightSolution(
  ceilingHeightCm: number,
  mountId: BaseMountId,
  finishId: PoleFinishId,
  poleHeightCm?: number,
  cushionPlacement: CushionPlacement = 'top',
  ceilingType: CeilingType = 'flat'
): HeightSolution {
  const mount = BASE_MOUNTS[mountId];
  const finish = POLE_FINISHES[finishId];
  const safeCeilingCm = Math.round(ceilingHeightCm);
  const rawPoleCm = poleHeightCm ?? Math.min(safeCeilingCm, MAX_POLE_HEIGHT_CM);
  const effectivePoleCm = clampPoleHeightCm(rawPoleCm, Math.max(safeCeilingCm, MIN_POLE_HEIGHT_CM));
  const cushionHeightCm = getCushionHeightCm(safeCeilingCm, effectivePoleCm, cushionPlacement);
  const cappedAtMaxPoleHeight = safeCeilingCm > MAX_POLE_HEIGHT_CM;
  const targetMm = effectivePoleCm * 10;

  const baseStackMm =
    ceilingType === 'vaulted'
      ? 235
      : mountId === 'permanent-ceiling'
        ? 185
        : 195;

  const usableSpanMm = Math.max(900, targetMm - baseStackMm);
  const aPoleMm = Math.min(1020, Math.round(usableSpanMm * 0.48));
  const bPoleMm = Math.min(1020, Math.round(usableSpanMm * 0.48));
  const coreHeightMm = baseStackMm + aPoleMm + bPoleMm;
  const rawDeltaMm = Math.max(0, targetMm - coreHeightMm);

  const extensions: ExtensionPiece[] = [];
  let remainingExtMm = Math.floor(rawDeltaMm / 125) * 125;

  for (const ext of EXTENSION_CATALOG) {
    while (remainingExtMm >= ext.lengthMm) {
      extensions.push({
        lengthMm: ext.lengthMm,
        sku: `EXT-${finishId.toUpperCase().slice(0, 3)}-${ext.lengthMm}`,
        label: `${ext.lengthMm}mm Extension Tube (${finish.shortName})`,
        unitPriceUsd: ext.priceUsd,
        weightKg: Number((finish.weightPerMeterKg * ext.weightFactor).toFixed(2)),
      });
      remainingExtMm -= ext.lengthMm;
    }
  }

  const finalExtTotalMm = extensions.reduce((sum, e) => sum + e.lengthMm, 0);
  const adjusterTravelMm = Math.max(0, targetMm - (coreHeightMm + finalExtTotalMm));
  const xJointCount = 1 + extensions.length;

  let isValid = true;
  let warning: string | undefined;

  if (safeCeilingCm < mount.minHeightCm) {
    isValid = false;
    warning = `${mount.shortName} min ${(mount.minHeightCm / 100).toFixed(2)}m.`;
  } else if (rawPoleCm > MAX_POLE_HEIGHT_CM) {
    isValid = false;
    warning = `Max pole height ${(MAX_POLE_HEIGHT_CM / 100).toFixed(2)}m.`;
  } else if (adjusterTravelMm > 125) {
    isValid = false;
    warning = `Adjuster travel (${adjusterTravelMm}mm) exceeds 125mm limit.`;
  }

  return {
    targetHeightCm: effectivePoleCm,
    poleHeightCm: effectivePoleCm,
    ceilingHeightCm: safeCeilingCm,
    cushionHeightCm,
    cushionPlacement,
    cappedAtMaxPoleHeight,
    baseStackMm,
    aPoleMm,
    bPoleMm,
    extensions,
    adjusterTravelMm,
    xJointCount,
    totalRigHeightMm: coreHeightMm + finalExtTotalMm + adjusterTravelMm + cushionHeightCm * 10,
    isValid,
    warning,
  };
}

export function generateBOM(config: PoleRigConfig): BOMSummary {
  const finish = POLE_FINISHES[config.finish];
  const heightSolution = calculateHeightSolution(
    config.ceilingHeightCm,
    config.mount,
    config.finish,
    config.poleHeightCm,
    config.cushionPlacement,
    config.ceilingType
  );
  const xpoleRes = resolveXPoleConfiguration(
    heightSolution.poleHeightCm * 10,
    config.finish,
    config.priceTier ?? 'retail'
  );

  const items: BOMLineItem[] = [];
  const finishLabel = getXPoleFinishLabel(config.finish, config.powderTone);
  const partSku = `XP-${xpoleRes.part.id.replace(/[^A-Za-z0-9]/g, '').toUpperCase()}-${config.finish.slice(0, 3).toUpperCase()}-${config.diameterMm}`;
  const kitWeight = Number((finish.weightPerMeterKg * (heightSolution.poleHeightCm / 100) + 3.4).toFixed(2));

  items.push({
    sku: partSku,
    name: `X-POLE PX Build-a-Pole · ${xpoleRes.part.id} (${finishLabel} · ${config.diameterMm}mm)`,
    material: finish.alloy,
    quantity: 1,
    unitWeightKg: kitWeight,
    unitPriceUsd: xpoleRes.unitPriceUsd,
    totalPriceUsd: xpoleRes.unitPriceUsd,
  });

  // Always included hardware + X-Joint from official JSON
  for (const hw of xpoleRes.includedHardware) {
    items.push({
      sku: `INC-${hw.replace(/[^A-Za-z0-9]/g, '').toUpperCase()}`,
      name: `${hw} (Included in X-POLE PX Kit)`,
      material:
        hw === 'Mount' && config.ceilingType === 'vaulted'
          ? 'Vaulted/Slanted Articulating Mount'
          : 'Official X-POLE Hardware',
      quantity: 1,
      unitWeightKg: hw === 'X-Joint' ? 0.62 : 0.35,
      unitPriceUsd: 0,
      totalPriceUsd: 0,
    });
  }

  if (heightSolution.cushionHeightCm > 0) {
    const posCode = heightSolution.cushionPlacement === 'top' ? 'TOP' : 'BLW';
    const posLabel = heightSolution.cushionPlacement === 'top' ? 'Ceiling Top' : 'Floor Below';
    const cushionMeters = (heightSolution.cushionHeightCm / 100).toFixed(2);
    const cushionWeight = Number((1.6 + (heightSolution.cushionHeightCm / 100) * 4.2).toFixed(2));
    items.push({
      sku: `CSH-${posCode}-${heightSolution.cushionHeightCm}`,
      name: `Height Cushion Spacer (${cushionMeters}m · ${posLabel})`,
      material: 'High-Density Ribbed Elastomer Core + Load Caps',
      quantity: 1,
      unitWeightKg: cushionWeight,
      unitPriceUsd: 0,
      totalPriceUsd: 0,
    });
  }

  const totalPriceUsd = Number(items.reduce((acc, item) => acc + item.totalPriceUsd, 0).toFixed(2));
  const totalWeightKg = Number(
    items.reduce((acc, item) => acc + item.unitWeightKg * item.quantity, 0).toFixed(2)
  );

  return {
    items,
    totalPriceUsd,
    totalWeightKg,
    packedLengthCm: 108,
    packedBagsCount: 1,
    heightSolution,
  };
}

/**
 * Aggregates BOM across all poles configured in the studio, merging identical SKUs.
 */
export function generateMultiPoleBOM(
  poles: PoleInstance[],
  baseConfig: PoleRigConfig
): BOMSummary {
  if (poles.length <= 1) {
    const p = poles[0];
    return generateBOM(
      p
        ? {
            ...baseConfig,
            finish: p.finish,
            powderTone: p.powderTone,
            diameterMm: p.diameterMm,
            poleHeightCm: p.heightCm,
            cushionPlacement: p.cushionPlacement,
            isSpinning: p.isSpinning,
            spinRpm: p.spinRpm,
          }
        : baseConfig
    );
  }

  const merged = new Map<string, BOMLineItem>();
  let totalBags = 0;
  let maxPacked = 108;
  let primarySolution = calculateHeightSolution(
    baseConfig.ceilingHeightCm,
    baseConfig.mount,
    poles[0].finish,
    poles[0].heightCm,
    poles[0].cushionPlacement,
    baseConfig.ceilingType
  );

  poles.forEach((p, idx) => {
    const sub = generateBOM({
      ...baseConfig,
      finish: p.finish,
      powderTone: p.powderTone,
      diameterMm: p.diameterMm,
      poleHeightCm: p.heightCm,
      cushionPlacement: p.cushionPlacement,
      isSpinning: p.isSpinning,
      spinRpm: p.spinRpm,
    });
    if (idx === 0) primarySolution = sub.heightSolution;
    totalBags += sub.packedBagsCount;
    maxPacked = Math.max(maxPacked, sub.packedLengthCm);
    for (const item of sub.items) {
      const existing = merged.get(item.sku);
      if (existing) {
        existing.quantity += item.quantity;
        existing.totalPriceUsd += item.totalPriceUsd;
      } else {
        merged.set(item.sku, { ...item });
      }
    }
  });

  const items = Array.from(merged.values());
  const totalPriceUsd = items.reduce((acc, item) => acc + item.totalPriceUsd, 0);
  const totalWeightKg = Number(
    items.reduce((acc, item) => acc + item.unitWeightKg * item.quantity, 0).toFixed(2)
  );

  return {
    items,
    totalPriceUsd,
    totalWeightKg,
    packedLengthCm: maxPacked,
    packedBagsCount: totalBags,
    heightSolution: primarySolution,
  };
}

export function analyzeFloorClearance(
  roomWidthM: number,
  roomDepthM: number,
  _mountId?: BaseMountId,
  enforceMinClearance = true,
  clearanceRadiusM = MIN_WALL_CLEARANCE_M
): ClearanceAnalysis {
  const minClearRadiusM = enforceMinClearance
    ? Math.max(DEV_MIN_WALL_CLEARANCE_M, clearanceRadiusM)
    : DEV_MIN_WALL_CLEARANCE_M;
  const availableRadiusM = Number((Math.min(roomWidthM, roomDepthM) / 2).toFixed(2));

  if (!enforceMinClearance) {
    return {
      roomWidthM,
      roomDepthM,
      minClearRadiusM,
      availableRadiusM,
      status: availableRadiusM >= 0.45 ? 'optimal' : 'caution',
      label: '1.25m Limit Off',
      recommendation: 'Compact testing mode: 1.25m minimum radius check bypassed.',
    };
  }

  if (availableRadiusM >= minClearRadiusM + 0.35) {
    return {
      roomWidthM,
      roomDepthM,
      minClearRadiusM,
      availableRadiusM,
      status: 'optimal',
      label: 'Clearance Optimal',
      recommendation: `${availableRadiusM.toFixed(2)}m radius clears walls safely.`,
    };
  }

  if (availableRadiusM >= minClearRadiusM) {
    return {
      roomWidthM,
      roomDepthM,
      minClearRadiusM,
      availableRadiusM,
      status: 'caution',
      label: 'Tight Clearance',
      recommendation: `Keep furniture outside ${minClearRadiusM.toFixed(2)}m perimeter.`,
    };
  }

  return {
    roomWidthM,
    roomDepthM,
    minClearRadiusM,
    availableRadiusM,
    status: 'restricted',
    label: 'Clearance Restricted',
    recommendation: `${availableRadiusM.toFixed(2)}m radius below ${minClearRadiusM.toFixed(2)}m safe envelope.`,
  };
}

export interface RoomCameraPose {
  pos: [number, number, number];
  target: [number, number, number];
}

/**
 * Computes a pulled-back architectural establishing shot that frames the entire
 * studio room model (floor, left slat wall, back mirror wall, ceiling, and poles).
 */
export function computeFullRoomCamera(
  roomWidthM: number,
  roomDepthM: number,
  ceilingHeightCm: number,
  isPortraitMobile = false,
  hasMultiplePoles = false
): RoomCameraPose {
  const H = ceilingHeightCm / 100;
  const span = Math.max(roomWidthM, roomDepthM);
  const multiBoost = hasMultiplePoles ? 0.55 : 0;

  if (isPortraitMobile) {
    const dist = Math.max(6.8, span * 1.46 + H * 0.38 + multiBoost);
    const az = 0.25;
    return {
      pos: [
        Number((Math.sin(az) * dist).toFixed(3)),
        Number((H * 0.53).toFixed(3)),
        Number((Math.cos(az) * dist).toFixed(3)),
      ],
      target: [0, Number((H * 0.4).toFixed(3)), 0],
    };
  }

  const dist = Math.max(5.8, span * 1.24 + H * 0.34 + multiBoost);
  const az = 0.42;
  return {
    pos: [
      Number((Math.sin(az) * dist).toFixed(3)),
      Number((H * 0.55).toFixed(3)),
      Number((Math.cos(az) * dist).toFixed(3)),
    ],
    target: [0, Number((H * 0.42).toFixed(3)), 0],
  };
}

/**
 * Computes a smooth 360-degree interior orbit camera position around (poleX, poleZ)
 * that is mathematically guaranteed to stay strictly INSIDE the studio walls
 * (never clipping behind the back wall at z = -D/2 or left wall at x = -W/2)
 * and safely beneath the flat or vaulted ceiling.
 */
export function computeInRoomOrbitPosition(
  angleRad: number,
  poleX: number,
  poleZ: number,
  roomWidthM: number,
  roomDepthM: number,
  ceilingHeightM: number,
  elapsedSec: number,
  desiredRadius = 2.25,
  isVaulted = false,
  vaultAngleDeg = 0
): {
  x: number;
  y: number;
  z: number;
  bounds: { xMin: number; xMax: number; zMin: number; zMax: number; yMin: number; yMax: number };
} {
  const wallPad = Math.min(0.45, Math.min(roomWidthM, roomDepthM) * 0.24);
  const openEdgePad = Math.min(0.24, Math.min(roomWidthM, roomDepthM) * 0.14);

  const xMin = -roomWidthM / 2 + wallPad;
  const xMax = roomWidthM / 2 - openEdgePad;
  const zMin = -roomDepthM / 2 + wallPad;
  const zMax = roomDepthM / 2 - openEdgePad;

  const anchorX = Math.max(xMin + 0.05, Math.min(xMax - 0.05, poleX));
  const anchorZ = Math.max(zMin + 0.05, Math.min(zMax - 0.05, poleZ));

  const dx = Math.sin(angleRad);
  const dz = Math.cos(angleRad);

  let rMax = desiredRadius;
  if (dx < -1e-5) rMax = Math.min(rMax, (xMin - anchorX) / dx);
  if (dx > 1e-5) rMax = Math.min(rMax, (xMax - anchorX) / dx);
  if (dz < -1e-5) rMax = Math.min(rMax, (zMin - anchorZ) / dz);
  if (dz > 1e-5) rMax = Math.min(rMax, (zMax - anchorZ) / dz);

  const r = Math.max(0.35, Math.min(desiredRadius, rMax));
  const x = Math.max(xMin, Math.min(xMax, anchorX + dx * r));
  const z = Math.max(zMin, Math.min(zMax, anchorZ + dz * r));

  // Respect vaulted roof eave height on the -X side so orbit never clips sloped soffit
  const vaultRad = computeEffectiveVaultRad(
    ceilingHeightM,
    roomWidthM,
    isVaulted ? 'vaulted' : 'flat',
    vaultAngleDeg
  );
  const localCeilingY = ceilingHeightM + x * Math.tan(vaultRad);
  const yMin = 0.45;
  const yMax = Math.max(0.95, localCeilingY - 0.34);
  const rawY = ceilingHeightM * 0.45 + Math.sin(elapsedSec * 0.65) * 0.24;
  const y = Math.max(yMin, Math.min(yMax, rawY));

  return {
    x,
    y,
    z,
    bounds: { xMin, xMax, zMin, zMax, yMin, yMax },
  };
}

export function computeAssemblyOffsets(
  assemblyProgress: number,
  explodedFactor: number,
  timeSec: number
): AssemblyPartOffsets {
  const p = Math.max(0, Math.min(1, assemblyProgress));
  const e = Math.max(0, Math.min(1, explodedFactor));

  const stepFloat = p * 7;
  const activeStepIndex = Math.min(6, Math.max(0, Math.floor(stepFloat === 7 ? 6 : stepFloat)));

  const seat = (startStep: number, endStep: number): number => {
    const t = Math.max(0, Math.min(1, (stepFloat - startStep) / (endStep - startStep)));
    return 1 - Math.pow(1 - t, 3);
  };

  const s1 = seat(0, 1);
  const s2 = seat(1, 2);
  const s3 = seat(2, 3);
  const s4 = seat(3, 4);
  const s5 = seat(4, 5);
  const s6 = seat(5, 6);
  const s7 = seat(6, 7);

  const basePlateY = (1 - s1) * 0.14;
  const bearingHubY = (1 - s2) * 0.24 + e * 0.12;
  const lockPinOffset = (1 - s2) * 0.065 + e * 0.045;
  const lowerTubeY = (1 - s3) * 0.34 + e * 0.24;
  const xJointY = (1 - s4) * 0.48 + e * 0.38;
  const upperTubeY = (1 - s5) * 0.62 + e * 0.52;
  const extensionY = (1 - s5) * 0.74 + e * 0.66;
  const adjusterRodY = (1 - s6) * 0.82 + e * 0.78;
  const topMountY = (1 - s6) * 0.92 + e * 0.9;
  const coverSleeveY = (1 - s7) * -0.18 - e * 0.1;

  const stepFrac = stepFloat - Math.floor(stepFloat);
  const wrenchAngleRad = timeSec * 2.4 + stepFrac * Math.PI * 4;

  const jointNormalizedHeights = [0.02, 0.055, 0.12, 0.44, 0.68, 0.94, 0.9];
  const activeJointNormalizedY = jointNormalizedHeights[activeStepIndex] ?? 0.5;

  return {
    basePlateY,
    bearingHubY,
    lockPinOffset,
    lowerTubeY,
    xJointY,
    upperTubeY,
    extensionY,
    adjusterRodY,
    topMountY,
    coverSleeveY,
    activeStepIndex,
    wrenchAngleRad,
    activeJointNormalizedY,
  };
}

export function isDarkLighting(preset: LightingPreset): boolean {
  return preset !== 'studio-daylight';
}

export function formatHeightMetricAndImperial(cm: number): string {
  const meters = (cm / 100).toFixed(2);
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${meters}m (${feet}′${inches}″)`;
}

export function exportBOMToCSV(bom: BOMSummary, config: PoleRigConfig): string {
  const header = [
    'SKU',
    'Component',
    'Material',
    'Qty',
    'Unit Weight (kg)',
    'Unit Price (USD)',
    'Line Total (USD)',
  ];
  const rows = bom.items.map((item) => [
    item.sku,
    `"${item.name.replace(/"/g, '""')}"`,
    `"${item.material.replace(/"/g, '""')}"`,
    String(item.quantity),
    item.unitWeightKg.toFixed(2),
    item.unitPriceUsd.toFixed(2),
    item.totalPriceUsd.toFixed(2),
  ]);

  const ceilingDesc =
    config.ceilingType === 'vaulted'
      ? `Tilted / Vaulted ${config.vaultAngleDeg}°`
      : 'Flat';
  const meta = [
    `# AxisPole Studio Bill of Materials`,
    `# Configuration: ${POLE_FINISHES[config.finish].name} | ${config.diameterMm}mm | ${BASE_MOUNTS[config.mount].name} | ${ceilingDesc} Ceiling ${formatHeightMetricAndImperial(config.ceilingHeightCm)}`,
    `# Total Weight: ${bom.totalWeightKg} kg | Total Price: $${bom.totalPriceUsd.toFixed(2)} USD`,
    header.join(','),
    ...rows.map((r) => r.join(',')),
  ];

  return meta.join('\n');
}
