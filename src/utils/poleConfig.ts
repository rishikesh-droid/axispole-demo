import type {
  AssemblyPartOffsets,
  AssemblyStepSpec,
  BaseMountId,
  BaseMountSpec,
  BOMLineItem,
  BOMSummary,
  ClearanceAnalysis,
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

export const MIN_ROOM_SIZE_M = 3.0;
export const MAX_ROOM_SIZE_M = 7.0;
export const MAX_POLES_IN_STUDIO = 4;

export const LIGHTING_PRESETS: {
  id: LightingPreset;
  label: string;
  shortLabel: string;
  isDarkTheme: boolean;
}[] = [
  {
    id: 'studio-daylight',
    label: 'Studio Daylight',
    shortLabel: 'Daylight',
    isDarkTheme: false,
  },
  {
    id: 'mood-neon',
    label: 'Mood/Night Neon',
    shortLabel: 'Night Neon',
    isDarkTheme: true,
  },
  {
    id: 'pro-spotlight',
    label: 'Professional Spotlight',
    shortLabel: 'Spotlight',
    isDarkTheme: true,
  },
];

export const POLE_FINISHES: Record<PoleFinishId, PoleFinishSpec> = {
  brass: {
    id: 'brass',
    name: 'Solid Architectural Brass',
    shortName: 'Brass',
    alloy: 'C26000 Cartridge Brass (70/30 Cu-Zn)',
    swatchHex: '#c89d46',
    accentHex: '#9a7122',
    basePriceUsd: 549,
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
      'High-copper seamless drawn tubing prized for dry-skin traction and rapid thermal warming.',
    cleaningAgent: 'Warm diluted vinegar mist or non-abrasive brass polish',
    cleaningNotes: [
      'Wipe after every session with a dry microfiber cloth to lift skin oils and slow oxidation.',
      'Deep-clean weekly using a 1:3 white vinegar and water mist, then buff dry immediately.',
      'Apply ammonia-free brass polish monthly and strip residue with 70% IPA.',
    ],
    avoidList: [
      'Chlorine bleach or acidic bathroom cleaners (causes copper pitting)',
      'Steel wool or abrasive scouring pads (destroys micro-lathed surface)',
      'Leaving grip chalk caked overnight (accelerates patina spots)',
    ],
  },
  stainless: {
    id: 'stainless',
    name: 'Mirror Stainless Steel 316L',
    shortName: 'Stainless',
    alloy: 'AISI 316L Surgical-Grade Austenitic Steel',
    swatchHex: '#cfd6de',
    accentHex: '#64748b',
    basePriceUsd: 469,
    gripLevel: 'Competition Neutral',
    wallThicknessMm: 2.0,
    weightPerMeterKg: 2.15,
    hypoallergenic: true,
    pbr: {
      color: 0xe4e9ef,
      metalness: 0.98,
      roughness: 0.08,
      clearcoat: 0.22,
      clearcoatRoughness: 0.1,
      anisotropy: 0.45,
      sheen: 0.0,
    },
    summary:
      'Nickel-safe 316L competition standard steel that will never flake, peel, or corrode.',
    cleaningAgent: '70%–91% Isopropyl Alcohol (IPA) with lint-free microfiber',
    cleaningNotes: [
      'Spray 70% IPA onto a clean microfiber cloth—never directly into the bearing hub.',
      'Wipe top-to-bottom in spiral passes to remove rosin, wax, or moisturizer film.',
      'Fully sanitizes between studio users without altering surface roughness.',
    ],
    avoidList: [
      'Silicone-based furniture polishes (creates hazardous slippery film)',
      'Hydrochloric acid or chloride-heavy disinfectants',
      'Metal rings or hard jewelry during grips (causes micro-burrs)',
    ],
  },
  'powder-black': {
    id: 'powder-black',
    name: 'Powder-Coated Satin Black',
    shortName: 'Powder Black',
    alloy: '4130 Chromoly Core + 120µm Baked Polyester',
    swatchHex: '#23262b',
    accentHex: '#0f172a',
    basePriceUsd: 489,
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
      'Electrostatic thermoset matte-satin coating baked at 200°C for confident grip in cool rooms.',
    cleaningAgent: 'Mild pH-neutral dish soap solution or diluted 50% IPA',
    cleaningNotes: [
      'Clean with warm water and two drops of mild pH-neutral dish soap on a damp microfiber towel.',
      'Rinse with a water-dampened cloth and buff dry to preserve satin texture.',
      'Inspect seams quarterly for coating chips from rings or zippers.',
    ],
    avoidList: [
      'Acetone, MEK, or paint thinners (softens thermoset polyester finish)',
      'Steam cleaners directly against seam joints',
      'Pure 99% alcohol soaking (gradually dulls satin topcoat)',
    ],
  },
  silicone: {
    id: 'silicone',
    name: 'High-Grip Vulcanized Silicone',
    shortName: 'Silicone',
    alloy: '4130 Steel Core + 3mm Shore-55A Platinum Silicone',
    swatchHex: '#3c3138',
    accentHex: '#6b3b4e',
    basePriceUsd: 529,
    gripLevel: 'Maximum Clothed Grip',
    wallThicknessMm: 5.0,
    weightPerMeterKg: 2.68,
    hypoallergenic: true,
    pbr: {
      color: 0x352c32,
      metalness: 0.02,
      roughness: 0.84,
      clearcoat: 0.0,
      clearcoatRoughness: 0.9,
      anisotropy: 0.0,
      sheen: 0.55,
    },
    summary:
      'Bonded platinum-cured elastomer sleeve for high-friction clothed training and zero-slip climbs.',
    cleaningAgent: 'Warm distilled water + mild castile soap (alcohol-free)',
    cleaningNotes: [
      'Wipe with warm water and a tiny amount of gentle castile soap to lift fabric lint.',
      'Air dry completely or pat with a lint-free chamois cloth before covering.',
      'Check sleeve edges near X-Joints monthly to ensure zero torsional creep.',
    ],
    avoidList: [
      'High-percentage isopropyl alcohol or solvents (dries and cracks elastomer)',
      'Oil-based lotions or silicone lubricants',
      'Sharp buckles or heels against the silicone sleeve',
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
    minHeightCm: 225,
    maxHeightCm: 335,
    drillingRequired: false,
    ceilingLoadKn: 1.8,
    floorFootprintM: 0.24,
    fastenerSpec: 'M24 Threaded Jackscrew + Dual M8 Lock Nuts',
    torqueNm: 22,
    description:
      'Pressure-mounted articulating silicone dome and low-profile 230mm floor base. Zero ceiling drilling.',
  },
  'permanent-ceiling': {
    id: 'permanent-ceiling',
    name: 'Permanent Bolted Ceiling Mount',
    shortName: 'Fixed Ceiling',
    priceDeltaUsd: 85,
    weightKg: 4.1,
    minHeightCm: 225,
    maxHeightCm: 360,
    drillingRequired: true,
    ceilingLoadKn: 4.5,
    floorFootprintM: 0.23,
    fastenerSpec: '4× M10 Structural Lag / Anchor Bolts (Class 10.9)',
    torqueNm: 38,
    description:
      'Studio-grade 6mm laser-cut steel ceiling flange bolted into solid timber joist or concrete slab.',
  },
  'vaulted-beam': {
    id: 'vaulted-beam',
    name: 'Vaulted Ceiling Clevis Adapter',
    shortName: 'Vaulted',
    priceDeltaUsd: 135,
    weightKg: 4.6,
    minHeightCm: 235,
    maxHeightCm: 360,
    drillingRequired: true,
    ceilingLoadKn: 4.2,
    floorFootprintM: 0.23,
    fastenerSpec: '4× M10 Anchors + M16 Hardened Pivot Clevis Pin',
    torqueNm: 42,
    description:
      'Articulating 0°–45° steel yoke mount for pitched rafters and exposed beams.',
  },
  'stage-podium': {
    id: 'stage-podium',
    name: 'Freestanding Stage Podium (1.6m)',
    shortName: 'Stage',
    priceDeltaUsd: 640,
    weightKg: 58.0,
    minHeightCm: 240,
    maxHeightCm: 340,
    drillingRequired: false,
    ceilingLoadKn: 0.0,
    floorFootprintM: 1.6,
    fastenerSpec: '6× Pie-Deck Cam Locks + 12× M8 Chassis Bolts',
    torqueNm: 28,
    description:
      'Self-supporting 1.6m modular CNC aluminum stage deck. Zero ceiling contact required.',
  },
};

export const DIAMETER_OPTIONS: {
  mm: PoleDiameterMm;
  label: string;
  priceDeltaUsd: number;
  note: string;
}[] = [
  { mm: 40, label: '40mm', priceDeltaUsd: 20, note: 'Agile spin grip' },
  { mm: 45, label: '45mm', priceDeltaUsd: 0, note: 'Competition standard' },
  { mm: 50, label: '50mm', priceDeltaUsd: 25, note: 'Classic studio grip' },
];

export const HARDWARE_PARTS: Record<HardwarePartId, HardwarePartSpec> = {
  'base-plate': {
    id: 'base-plate',
    name: 'Base Flange & Elastomer Ring',
    category: 'Foundation',
    material: 'CNC 6061-T6 Aluminum + 70A Silicone',
    torqueSpec: 'Level ±0.5° (Stage: 28 N·m)',
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
    fastener: 'Elastomer Ring (Stage: 6× Cam Locks)',
    toolRequired: 'Spirit Level',
    safetyNote: 'Align base directly beneath solid ceiling joist.',
    installInstruction:
      'Position the machined base flange centered in your training zone. For Freestanding Stage, lock all 6 aluminum panels and level feet.',
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
  finish: 'brass',
  diameterMm: 45,
  mount: 'tension',
  ceilingHeightCm: 274,
  isSpinning: true,
  spinRpm: 18,
  environment: 'studio',
  lighting: 'mood-neon',
  roomWidthM: 5.4,
  roomDepthM: 5.2,
  showClearanceRing: true,
  vaultAngleDeg: 22,
};

export function createInitialPoles(): PoleInstance[] {
  return [
    {
      id: 'pole-1',
      label: 'Pole 1',
      finish: 'brass',
      diameterMm: 45,
      mount: 'tension',
      isSpinning: true,
      spinRpm: 18,
      x: 0,
      z: 0,
    },
  ];
}

export function getWallClearanceMarginM(mountId: BaseMountId): number {
  return mountId === 'stage-podium' ? 1.4 : 1.2;
}

export function getMinPoleSeparationM(mountA: BaseMountId, mountB: BaseMountId): number {
  if (mountA === 'stage-podium' || mountB === 'stage-podium') return 2.15;
  return 1.65;
}

/**
 * Clamps a pole's floor (x, z) coordinates strictly within the room's minimum
 * safe wall clearance margin AND maintains safe separation from other poles.
 */
export function clampPolePosition(
  rawX: number,
  rawZ: number,
  roomWidthM: number,
  roomDepthM: number,
  mountId: BaseMountId,
  otherPoles: Pick<PoleInstance, 'x' | 'z' | 'mount'>[] = []
): PoleClampResult {
  const minWallMarginM = getWallClearanceMarginM(mountId);
  const safeW = Math.max(MIN_ROOM_SIZE_M, roomWidthM);
  const safeD = Math.max(MIN_ROOM_SIZE_M, roomDepthM);

  const maxX = Math.max(0, safeW / 2 - minWallMarginM);
  const maxZ = Math.max(0, safeD / 2 - minWallMarginM);

  let x = Math.max(-maxX, Math.min(maxX, rawX));
  let z = Math.max(-maxZ, Math.min(maxZ, rawZ));
  let hitWallBoundary =
    Math.abs(rawX) > maxX + 1e-4 || Math.abs(rawZ) > maxZ + 1e-4;
  let hitPoleBoundary = false;

  // Resolve inter-pole minimum separation iteratively so poles cannot clip each other's spin zone
  for (let pass = 0; pass < 4; pass++) {
    for (const other of otherPoles) {
      const minDist = getMinPoleSeparationM(mountId, other.mount);
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
 * Finds an uncluttered, wall-safe spawn position for a newly added pole
 * with a contrasting finish so multi-pole setups look immediately curated.
 */
export function createNextPoleInstance(
  existingPoles: PoleInstance[],
  roomWidthM: number,
  roomDepthM: number
): PoleInstance {
  const finishCycle: PoleFinishId[] = ['brass', 'stainless', 'powder-black', 'silicone'];
  const usedFinishes = new Set(existingPoles.map((p) => p.finish));
  const nextFinish =
    finishCycle.find((f) => !usedFinishes.has(f)) ??
    finishCycle[existingPoles.length % finishCycle.length];

  const nextNum = existingPoles.length + 1;
  const candidateOffsets: [number, number][] = [
    [1.75, 0],
    [-1.75, 0],
    [0, 1.7],
    [0, -1.7],
    [1.6, 1.4],
    [-1.6, 1.4],
  ];

  let chosen = { x: 1.75, z: 0 };
  for (const [cx, cz] of candidateOffsets) {
    const res = clampPolePosition(cx, cz, roomWidthM, roomDepthM, 'tension', existingPoles);
    const clearOfAll = existingPoles.every(
      (p) => Math.hypot(res.x - p.x, res.z - p.z) >= getMinPoleSeparationM('tension', p.mount) - 0.05
    );
    if (clearOfAll) {
      chosen = { x: res.x, z: res.z };
      break;
    }
  }

  return {
    id: `pole-${Date.now().toString(36)}-${nextNum}`,
    label: `Pole ${nextNum}`,
    finish: nextFinish,
    diameterMm: 45,
    mount: 'tension',
    isSpinning: true,
    spinRpm: 16,
    x: chosen.x,
    z: chosen.z,
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
  finishId: PoleFinishId
): HeightSolution {
  const mount = BASE_MOUNTS[mountId];
  const finish = POLE_FINISHES[finishId];
  const targetMm = Math.round(ceilingHeightCm * 10);

  const baseStackMm =
    mountId === 'stage-podium'
      ? 210
      : mountId === 'vaulted-beam'
        ? 235
        : mountId === 'permanent-ceiling'
          ? 185
          : 195;

  const aPoleMm = 1020;
  const bPoleMm = 1020;
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

  if (ceilingHeightCm < mount.minHeightCm) {
    isValid = false;
    warning = `${mount.shortName} min ${(mount.minHeightCm / 100).toFixed(2)}m.`;
  } else if (ceilingHeightCm > mount.maxHeightCm) {
    isValid = false;
    warning = `${mount.shortName} max ${(mount.maxHeightCm / 100).toFixed(2)}m.`;
  } else if (mountId !== 'stage-podium' && adjusterTravelMm > 125) {
    isValid = false;
    warning = `Adjuster travel (${adjusterTravelMm}mm) exceeds 125mm limit.`;
  }

  return {
    targetHeightCm: ceilingHeightCm,
    baseStackMm,
    aPoleMm,
    bPoleMm,
    extensions,
    adjusterTravelMm,
    xJointCount,
    totalRigHeightMm: coreHeightMm + finalExtTotalMm + adjusterTravelMm,
    isValid,
    warning,
  };
}

export function generateBOM(config: PoleRigConfig): BOMSummary {
  const finish = POLE_FINISHES[config.finish];
  const mount = BASE_MOUNTS[config.mount];
  const diameterSpec =
    DIAMETER_OPTIONS.find((d) => d.mm === config.diameterMm) ?? DIAMETER_OPTIONS[1];
  const heightSolution = calculateHeightSolution(
    config.ceilingHeightCm,
    config.mount,
    config.finish
  );

  const items: BOMLineItem[] = [];

  const kitPrice = finish.basePriceUsd + diameterSpec.priceDeltaUsd;
  const kitWeight = Number((finish.weightPerMeterKg * 2.04 + 1.85).toFixed(2));
  items.push({
    sku: `AXP-${config.finish.toUpperCase().slice(0, 3)}-${config.diameterMm}`,
    name: `${finish.name} Main Kit (${config.diameterMm}mm · A+B Columns & Dual-Bearing Hub)`,
    material: finish.alloy,
    quantity: 1,
    unitWeightKg: kitWeight,
    unitPriceUsd: kitPrice,
    totalPriceUsd: kitPrice,
  });

  items.push({
    sku: `MNT-${config.mount.toUpperCase().slice(0, 4)}`,
    name: mount.name,
    material:
      config.mount === 'stage-podium'
        ? 'CNC 6061-T6 Modular Aluminum Deck + Steel Chassis'
        : 'Laser-Cut Structural Steel + 70A Silicone Interface',
    quantity: 1,
    unitWeightKg: mount.weightKg,
    unitPriceUsd: mount.priceDeltaUsd === 0 ? 0 : mount.priceDeltaUsd,
    totalPriceUsd: mount.priceDeltaUsd === 0 ? 0 : mount.priceDeltaUsd,
  });

  const extByLength = new Map<number, { piece: ExtensionPiece; qty: number }>();
  for (const ext of heightSolution.extensions) {
    const existing = extByLength.get(ext.lengthMm);
    if (existing) {
      existing.qty += 1;
    } else {
      extByLength.set(ext.lengthMm, { piece: ext, qty: 1 });
    }
  }
  for (const { piece, qty } of extByLength.values()) {
    items.push({
      sku: piece.sku,
      name: piece.label,
      material: finish.alloy,
      quantity: qty,
      unitWeightKg: piece.weightKg,
      unitPriceUsd: piece.unitPriceUsd,
      totalPriceUsd: piece.unitPriceUsd * qty,
    });
  }

  const extraJoints = Math.max(0, heightSolution.xJointCount - 1);
  if (extraJoints > 0) {
    items.push({
      sku: `XJT-4140-${config.diameterMm}`,
      name: `Additional Internal Expanding X-Joint (${config.diameterMm}mm)`,
      material: '4140 Hardened Alloy Steel',
      quantity: extraJoints,
      unitWeightKg: 0.62,
      unitPriceUsd: 38,
      totalPriceUsd: extraJoints * 38,
    });
  }

  items.push({
    sku: 'FST-KIT-129',
    name: 'Class 12.9 Fastener Pack & 4mm / 5mm Hex Torque Keys',
    material: 'Black Oxide Alloy Steel',
    quantity: 1,
    unitWeightKg: 0.45,
    unitPriceUsd: 0,
    totalPriceUsd: 0,
  });

  const totalPriceUsd = items.reduce((acc, item) => acc + item.totalPriceUsd, 0);
  const totalWeightKg = Number(
    items.reduce((acc, item) => acc + item.unitWeightKg * item.quantity, 0).toFixed(2)
  );

  return {
    items,
    totalPriceUsd,
    totalWeightKg,
    packedLengthCm: config.mount === 'stage-podium' ? 112 : 108,
    packedBagsCount: config.mount === 'stage-podium' ? 3 : 1,
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
            diameterMm: p.diameterMm,
            mount: p.mount,
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
    poles[0].mount,
    poles[0].finish
  );

  poles.forEach((p, idx) => {
    const sub = generateBOM({
      ...baseConfig,
      finish: p.finish,
      diameterMm: p.diameterMm,
      mount: p.mount,
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
  mountId: BaseMountId
): ClearanceAnalysis {
  const minClearRadiusM = mountId === 'stage-podium' ? 1.65 : 1.5;
  const availableRadiusM = Number((Math.min(roomWidthM, roomDepthM) / 2).toFixed(2));

  if (availableRadiusM >= minClearRadiusM + 0.15) {
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

  if (availableRadiusM >= minClearRadiusM - 0.15) {
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
  return preset === 'mood-neon' || preset === 'pro-spotlight';
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

  const meta = [
    `# AxisPole Studio Bill of Materials`,
    `# Configuration: ${POLE_FINISHES[config.finish].name} | ${config.diameterMm}mm | ${BASE_MOUNTS[config.mount].name} | Ceiling ${formatHeightMetricAndImperial(config.ceilingHeightCm)}`,
    `# Total Weight: ${bom.totalWeightKg} kg | Total Price: $${bom.totalPriceUsd.toFixed(2)} USD`,
    header.join(','),
    ...rows.map((r) => r.join(',')),
  ];

  return meta.join('\n');
}
