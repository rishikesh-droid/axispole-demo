import * as THREE from 'three';
import type {
  AssemblyPartOffsets,
  HardwarePartId,
  PoleRigConfig,
} from '../types/pole';
import { calculateHeightSolution, POLE_FINISHES } from '../utils/poleConfig';
import type { ProceduralTextureSet } from './proceduralTextures';

export interface PoleAssemblyHandle {
  root: THREE.Group;
  rotatingColumn: THREE.Group;
  interactables: THREE.Object3D[];
  rebuild: (config: PoleRigConfig) => void;
  applyKinematics: (
    offsets: AssemblyPartOffsets,
    config: PoleRigConfig,
    highlightFasteners: boolean,
    selectedPart: HardwarePartId | null,
    spinAngleRad: number
  ) => void;
  getPartFocusPoint: (partId: HardwarePartId) => THREE.Vector3;
  dispose: () => void;
}

function tagPart(obj: THREE.Object3D, partId: HardwarePartId, excludeFromExport = false): void {
  obj.traverse((child) => {
    child.userData.partId = partId;
    if (excludeFromExport) {
      child.userData.excludeFromExport = true;
    }
  });
}

function createHexBoltMesh(
  headRadius: number,
  headHeight: number,
  shankLength: number,
  material: THREE.Material
): THREE.Group {
  const g = new THREE.Group();
  const headGeo = new THREE.CylinderGeometry(headRadius, headRadius, headHeight, 6);
  const head = new THREE.Mesh(headGeo, material);
  head.position.y = headHeight / 2;
  head.castShadow = true;

  const socketGeo = new THREE.CylinderGeometry(
    headRadius * 0.48,
    headRadius * 0.48,
    headHeight * 0.35,
    6
  );
  const socketMat = new THREE.MeshStandardMaterial({
    color: 0x0d0f12,
    roughness: 0.7,
    metalness: 0.4,
  });
  const socket = new THREE.Mesh(socketGeo, socketMat);
  socket.position.y = headHeight * 0.88;

  const shankGeo = new THREE.CylinderGeometry(headRadius * 0.56, headRadius * 0.56, shankLength, 12);
  const shank = new THREE.Mesh(shankGeo, material);
  shank.position.y = -shankLength / 2;

  g.add(head, socket, shank);
  return g;
}

export function createPoleAssembly(textures: ProceduralTextureSet): PoleAssemblyHandle {
  const root = new THREE.Group();
  root.name = 'AxisPole_Root';

  const rotatingColumn = new THREE.Group();
  rotatingColumn.name = 'AxisPole_RotatingColumn';

  const interactables: THREE.Object3D[] = [];

  // Shared hardware materials (reused & updated cleanly)
  const poleMaterial = new THREE.MeshPhysicalMaterial({
    color: POLE_FINISHES.brass.pbr.color,
    metalness: POLE_FINISHES.brass.pbr.metalness,
    roughness: POLE_FINISHES.brass.pbr.roughness,
    clearcoat: POLE_FINISHES.brass.pbr.clearcoat,
    clearcoatRoughness: POLE_FINISHES.brass.pbr.clearcoatRoughness,
    bumpMap: textures.poleBumps.brass,
    bumpScale: 0.0014,
    roughnessMap: textures.poleRoughness.brass,
    envMapIntensity: 1.15,
  });

  const machinedAlumMat = new THREE.MeshStandardMaterial({
    color: 0xcfd5dc,
    metalness: 0.88,
    roughness: 0.24,
    envMapIntensity: 1.05,
  });

  const darkAnodizedMat = new THREE.MeshStandardMaterial({
    color: 0x26292f,
    metalness: 0.72,
    roughness: 0.34,
    envMapIntensity: 0.9,
  });

  const hardenedSteelMat = new THREE.MeshStandardMaterial({
    color: 0x5c636e,
    metalness: 0.92,
    roughness: 0.28,
    envMapIntensity: 1.0,
  });

  const blackOxideBoltMat = new THREE.MeshStandardMaterial({
    color: 0x1a1c20,
    metalness: 0.82,
    roughness: 0.32,
  });

  const elastomerMat = new THREE.MeshStandardMaterial({
    color: 0x191a1d,
    metalness: 0.02,
    roughness: 0.86,
  });

  const stageDeckMat = new THREE.MeshStandardMaterial({
    color: 0x2a2d33,
    metalness: 0.35,
    roughness: 0.58,
    bumpMap: textures.stageDeckBump,
    bumpScale: 0.003,
  });

  const safetyRedMat = new THREE.MeshStandardMaterial({
    color: 0xb91c1c,
    metalness: 0.15,
    roughness: 0.45,
  });

  const highlightRingMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    emissive: 0xd97706,
    emissiveIntensity: 0.85,
    roughness: 0.25,
    metalness: 0.4,
    transparent: true,
    opacity: 0.9,
  });

  const hexKeyMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    metalness: 0.78,
    roughness: 0.25,
    emissive: 0x92400e,
    emissiveIntensity: 0.35,
  });

  // Sub-group containers whose transforms animate smoothly
  let basePlateGroup = new THREE.Group();
  let bearingHubGroup = new THREE.Group();
  let lockPinLeft = new THREE.Group();
  let lockPinRight = new THREE.Group();
  let lowerTubeGroup = new THREE.Group();
  let xJointGroup = new THREE.Group();
  let upperTubeGroup = new THREE.Group();
  let extensionGroup = new THREE.Group();
  let adjusterRodGroup = new THREE.Group();
  let topMountGroup = new THREE.Group();
  let coverSleeveGroup = new THREE.Group();
  let torqueIndicatorGroup = new THREE.Group();

  // Cached base Y positions for kinematic offsets
  const baseY = {
    basePlate: 0,
    bearingHub: 0.028,
    lowerTube: 0.085,
    xJoint: 1.105,
    upperTube: 1.105,
    extension: 2.125,
    adjusterRod: 2.52,
    topMount: 2.66,
    coverSleeve: 2.48,
  };

  let currentHeightM = 2.74;
  let currentRadiusM = 0.0225;

  function clearDisposables(): void {
    const keepMats = new Set<THREE.Material>([
      poleMaterial,
      machinedAlumMat,
      darkAnodizedMat,
      hardenedSteelMat,
      blackOxideBoltMat,
      elastomerMat,
      stageDeckMat,
      safetyRedMat,
      highlightRingMat,
      hexKeyMat,
    ]);

    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => {
          if (!keepMats.has(m)) m.dispose();
        });
      }
    });

    while (root.children.length > 0) {
      root.remove(root.children[0]);
    }
    while (rotatingColumn.children.length > 0) {
      rotatingColumn.remove(rotatingColumn.children[0]);
    }
    interactables.length = 0;
  }

  function updatePoleMaterial(config: PoleRigConfig): void {
    const spec = POLE_FINISHES[config.finish];
    poleMaterial.color.setHex(spec.pbr.color);
    poleMaterial.metalness = spec.pbr.metalness;
    poleMaterial.roughness = spec.pbr.roughness;
    poleMaterial.clearcoat = spec.pbr.clearcoat;
    poleMaterial.clearcoatRoughness = spec.pbr.clearcoatRoughness;
    poleMaterial.sheen = spec.pbr.sheen;
    poleMaterial.anisotropy = spec.pbr.anisotropy;
    poleMaterial.bumpMap = textures.poleBumps[config.finish];
    poleMaterial.roughnessMap = textures.poleRoughness[config.finish];
    poleMaterial.bumpScale =
      config.finish === 'silicone'
        ? 0.0042
        : config.finish === 'powder-black'
          ? 0.0024
          : config.finish === 'brass'
            ? 0.0012
            : 0.0005;
    poleMaterial.needsUpdate = true;
  }

  function addHitProxy(
    parent: THREE.Group,
    partId: HardwarePartId,
    radius: number,
    height: number,
    yCenter: number
  ): void {
    const proxyGeo = new THREE.CylinderGeometry(radius, radius, height, 12);
    const proxyMat = new THREE.MeshBasicMaterial({
      visible: false,
    });
    const proxy = new THREE.Mesh(proxyGeo, proxyMat);
    proxy.position.y = yCenter;
    proxy.userData.partId = partId;
    proxy.userData.excludeFromExport = true;
    parent.add(proxy);
    interactables.push(proxy);
  }

  function rebuild(config: PoleRigConfig): void {
    clearDisposables();
    updatePoleMaterial(config);

    const sol = calculateHeightSolution(config.ceilingHeightCm, config.mount, config.finish);
    const H = config.ceilingHeightCm / 100; // meters
    const r = (config.diameterMm / 1000) / 2; // pole outer radius in meters
    currentHeightM = H;
    currentRadiusM = r;

    // 1. BASE PLATE / FREESTANDING STAGE PODIUM
    basePlateGroup = new THREE.Group();
    basePlateGroup.name = 'BasePlate_Assembly';
    let hubBaseY = 0.028;

    if (config.mount === 'stage-podium') {
      // 1.6m diameter modular 6-sector CNC aluminum stage deck
      const deckRadius = 0.8;
      const deckHeight = 0.115;
      const deckGeo = new THREE.CylinderGeometry(deckRadius, deckRadius + 0.02, deckHeight, 48);
      const deck = new THREE.Mesh(deckGeo, stageDeckMat);
      deck.position.y = deckHeight / 2 + 0.025;
      deck.castShadow = true;
      deck.receiveShadow = true;

      // Machined aluminum outer bevel trim ring
      const rimPoints = [
        new THREE.Vector2(deckRadius - 0.01, 0.025),
        new THREE.Vector2(deckRadius + 0.025, 0.025),
        new THREE.Vector2(deckRadius + 0.025, deckHeight + 0.022),
        new THREE.Vector2(deckRadius - 0.015, deckHeight + 0.028),
      ];
      const rimGeo = new THREE.LatheGeometry(rimPoints, 48);
      const rim = new THREE.Mesh(rimGeo, machinedAlumMat);
      rim.castShadow = true;

      // 6 radial pie-panel seam ribs + 6 adjustable perimeter leveling feet
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3;
        const seamGeo = new THREE.BoxGeometry(deckRadius - 0.14, 0.004, 0.008);
        const seam = new THREE.Mesh(seamGeo, darkAnodizedMat);
        seam.position.set(
          Math.cos(angle) * (deckRadius * 0.52),
          deckHeight + 0.027,
          Math.sin(angle) * (deckRadius * 0.52)
        );
        seam.rotation.y = -angle;
        basePlateGroup.add(seam);

        // Adjustable elastomer leveling foot
        const footGeo = new THREE.CylinderGeometry(0.032, 0.038, 0.028, 16);
        const foot = new THREE.Mesh(footGeo, elastomerMat);
        foot.position.set(
          Math.cos(angle) * (deckRadius - 0.07),
          0.014,
          Math.sin(angle) * (deckRadius - 0.07)
        );
        foot.castShadow = true;
        basePlateGroup.add(foot);
      }

      // Central steel socket flange mounted on deck
      const centerFlangeGeo = new THREE.CylinderGeometry(0.125, 0.145, 0.032, 32);
      const centerFlange = new THREE.Mesh(centerFlangeGeo, darkAnodizedMat);
      centerFlange.position.y = deckHeight + 0.04;
      centerFlange.castShadow = true;

      // 6 M8 chassis bolts around center flange
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        const bolt = createHexBoltMesh(0.009, 0.008, 0.012, blackOxideBoltMat);
        bolt.position.set(Math.cos(a) * 0.1, deckHeight + 0.056, Math.sin(a) * 0.1);
        basePlateGroup.add(bolt);
      }

      basePlateGroup.add(deck, rim, centerFlange);
      hubBaseY = deckHeight + 0.056;
      addHitProxy(basePlateGroup, 'base-plate', deckRadius, 0.18, 0.09);
    } else {
      // Precision low-profile micro-base flange (230mm diameter) using LatheGeometry
      const gasketGeo = new THREE.CylinderGeometry(0.118, 0.12, 0.007, 40);
      const gasket = new THREE.Mesh(gasketGeo, elastomerMat);
      gasket.position.y = 0.0035;
      gasket.receiveShadow = true;

      const flangeProfile = [
        new THREE.Vector2(0.015, 0.007),
        new THREE.Vector2(0.115, 0.007),
        new THREE.Vector2(0.112, 0.016),
        new THREE.Vector2(0.088, 0.022),
        new THREE.Vector2(0.068, 0.028),
        new THREE.Vector2(0.042, 0.032),
        new THREE.Vector2(0.018, 0.032),
      ];
      const flangeGeo = new THREE.LatheGeometry(flangeProfile, 40);
      const flange = new THREE.Mesh(flangeGeo, machinedAlumMat);
      flange.castShadow = true;
      flange.receiveShadow = true;

      // Machined dark accent ring
      const ringGeo = new THREE.TorusGeometry(0.095, 0.0025, 10, 40);
      const ring = new THREE.Mesh(ringGeo, darkAnodizedMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.019;

      basePlateGroup.add(gasket, flange, ring);
      hubBaseY = 0.03;
      addHitProxy(basePlateGroup, 'base-plate', 0.13, 0.05, 0.025);
    }
    baseY.basePlate = 0;
    tagPart(basePlateGroup, 'base-plate');
    root.add(basePlateGroup);

    // 2. DUAL-BEARING HUB & STATIC/SPIN LOCK PINS
    bearingHubGroup = new THREE.Group();
    bearingHubGroup.name = 'BearingHub_Assembly';
    baseY.bearingHub = hubBaseY;
    bearingHubGroup.position.y = hubBaseY;

    const hubProfile = [
      new THREE.Vector2(r + 0.002, 0),
      new THREE.Vector2(r + 0.022, 0),
      new THREE.Vector2(r + 0.024, 0.012),
      new THREE.Vector2(r + 0.017, 0.024),
      new THREE.Vector2(r + 0.019, 0.042),
      new THREE.Vector2(r + 0.012, 0.058),
      new THREE.Vector2(r + 0.002, 0.062),
    ];
    const hubBodyGeo = new THREE.LatheGeometry(hubProfile, 36);
    const hubBody = new THREE.Mesh(hubBodyGeo, darkAnodizedMat);
    hubBody.castShadow = true;

    // Visible sealed cartridge ball-bearing raceway band
    const bearingRingGeo = new THREE.CylinderGeometry(r + 0.02, r + 0.02, 0.014, 32);
    const bearingRing = new THREE.Mesh(bearingRingGeo, hardenedSteelMat);
    bearingRing.position.y = 0.032;

    // Precision ball bearings hint collar
    const sealGeo = new THREE.TorusGeometry(r + 0.0195, 0.0025, 10, 32);
    const seal = new THREE.Mesh(sealGeo, safetyRedMat);
    seal.rotation.x = Math.PI / 2;
    seal.position.y = 0.032;

    // Opposing M6 Static/Spin Lock Hex Screws (retract outward in spinning mode!)
    lockPinLeft = createHexBoltMesh(0.007, 0.006, 0.016, blackOxideBoltMat);
    lockPinLeft.rotation.z = Math.PI / 2;
    lockPinLeft.position.set(-(r + 0.022), 0.016, 0);

    lockPinRight = createHexBoltMesh(0.007, 0.006, 0.016, blackOxideBoltMat);
    lockPinRight.rotation.z = -Math.PI / 2;
    lockPinRight.position.set(r + 0.022, 0.016, 0);

    bearingHubGroup.add(hubBody, bearingRing, seal, lockPinLeft, lockPinRight);
    addHitProxy(bearingHubGroup, 'bearing-hub', r + 0.045, 0.08, 0.035);
    tagPart(bearingHubGroup, 'bearing-hub');
    root.add(bearingHubGroup);

    // Rotating assembly contains the pole tubes, X-joints, extensions, and cover sleeve
    root.add(rotatingColumn);

    // Calculate physical segment heights in meters so they sum cleanly to H
    const topAllowanceM =
      config.mount === 'stage-podium'
        ? 0.05
        : config.mount === 'vaulted-beam'
          ? 0.14
          : 0.105;
    const poleStartY = hubBaseY + 0.056;
    const poleEndY = H - topAllowanceM;
    const totalColumnSpan = Math.max(1.8, poleEndY - poleStartY);

    const aLen = Math.min(1.02, totalColumnSpan * 0.44);
    const bLen = Math.min(1.02, totalColumnSpan * 0.44);
    const extTotalLen = Math.max(0.0, totalColumnSpan - aLen - bLen - 0.08);
    const adjusterLen = Math.max(0.075, totalColumnSpan - aLen - bLen - extTotalLen);

    // 3. MAIN LOWER COLUMN (A-POLE)
    lowerTubeGroup = new THREE.Group();
    lowerTubeGroup.name = 'LowerTube_APole';
    baseY.lowerTube = poleStartY;
    lowerTubeGroup.position.y = poleStartY;

    const aTubeGeo = new THREE.CylinderGeometry(r, r, aLen, 40, 1);
    const aTube = new THREE.Mesh(aTubeGeo, poleMaterial);
    aTube.position.y = aLen / 2;
    aTube.castShadow = true;
    aTube.receiveShadow = true;

    // Lower machined collar ring where A-pole meets bearing hub
    const lowerCollarGeo = new THREE.CylinderGeometry(r + 0.003, r + 0.005, 0.018, 32);
    const lowerCollar = new THREE.Mesh(lowerCollarGeo, machinedAlumMat);
    lowerCollar.position.y = 0.009;

    // Subtle recessed keyhole slot near top of A-pole
    const keyholeGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.004, 12);
    const keyhole = new THREE.Mesh(keyholeGeo, blackOxideBoltMat);
    keyhole.rotation.x = Math.PI / 2;
    keyhole.position.set(0, aLen - 0.025, r - 0.001);

    lowerTubeGroup.add(aTube, lowerCollar, keyhole);
    addHitProxy(lowerTubeGroup, 'lower-tube', r + 0.028, aLen, aLen / 2);
    tagPart(lowerTubeGroup, 'lower-tube');
    rotatingColumn.add(lowerTubeGroup);

    // 4. INTERNAL EXPANDING X-JOINT COUPLER
    xJointGroup = new THREE.Group();
    xJointGroup.name = 'XJoint_ExpandingCoupler';
    const xJointY = poleStartY + aLen;
    baseY.xJoint = xJointY;
    xJointGroup.position.y = xJointY;

    // Tapered upper/lower expansion wedges inside the tube bore (clearly visible when exploded or assembling)
    const innerR = r - 0.0035;
    const wedgeGeo = new THREE.CylinderGeometry(innerR, innerR * 0.96, 0.16, 24);
    const wedge = new THREE.Mesh(wedgeGeo, hardenedSteelMat);
    wedge.castShadow = true;

    // Central recessed expansion collar & split seam grooves
    const centerRingGeo = new THREE.TorusGeometry(innerR + 0.0015, 0.0022, 10, 32);
    const centerRing = new THREE.Mesh(centerRingGeo, darkAnodizedMat);
    centerRing.rotation.x = Math.PI / 2;

    // M10 internal hex drawbolt visible at the center slot
    const drawBolt = createHexBoltMesh(0.006, 0.004, 0.01, blackOxideBoltMat);
    drawBolt.rotation.x = Math.PI / 2;
    drawBolt.position.set(0, 0, innerR + 0.001);

    // Subtle hairline joint ring flush with outer tube diameter
    const seamRingGeo = new THREE.TorusGeometry(r + 0.0004, 0.0009, 8, 36);
    const seamRing = new THREE.Mesh(seamRingGeo, darkAnodizedMat);
    seamRing.rotation.x = Math.PI / 2;

    xJointGroup.add(wedge, centerRing, drawBolt, seamRing);
    addHitProxy(xJointGroup, 'x-joint', r + 0.036, 0.2, 0);
    tagPart(xJointGroup, 'x-joint');
    rotatingColumn.add(xJointGroup);

    // 5. MAIN UPPER COLUMN (B-POLE)
    upperTubeGroup = new THREE.Group();
    upperTubeGroup.name = 'UpperTube_BPole';
    baseY.upperTube = xJointY;
    upperTubeGroup.position.y = xJointY;

    const bTubeGeo = new THREE.CylinderGeometry(r, r, bLen, 40, 1);
    const bTube = new THREE.Mesh(bTubeGeo, poleMaterial);
    bTube.position.y = bLen / 2;
    bTube.castShadow = true;
    bTube.receiveShadow = true;

    const bKeyhole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0045, 0.0045, 0.004, 12),
      blackOxideBoltMat
    );
    bKeyhole.rotation.x = Math.PI / 2;
    bKeyhole.position.set(0, 0.025, r - 0.001);

    upperTubeGroup.add(bTube, bKeyhole);
    addHitProxy(upperTubeGroup, 'upper-tube', r + 0.028, bLen, bLen / 2);
    tagPart(upperTubeGroup, 'upper-tube');
    rotatingColumn.add(upperTubeGroup);

    // 6. MODULAR HEIGHT EXTENSIONS (Dynamically stacked from solver)
    extensionGroup = new THREE.Group();
    extensionGroup.name = 'ExtensionTube_Stack';
    const extStartY = xJointY + bLen;
    baseY.extension = extStartY;
    extensionGroup.position.y = extStartY;

    if (extTotalLen > 0.015) {
      const pieceCount = Math.max(1, sol.extensions.length);
      let cursorY = 0;
      const totalNominalMm = sol.extensions.reduce((a, b) => a + b.lengthMm, 0) || 1;
      for (let i = 0; i < pieceCount; i++) {
        const pieceFrac =
          sol.extensions.length > 0 ? sol.extensions[i].lengthMm / totalNominalMm : 1 / pieceCount;
        const segLen = extTotalLen * pieceFrac;
        const segGeo = new THREE.CylinderGeometry(r, r, Math.max(0.01, segLen - 0.002), 36);
        const segMesh = new THREE.Mesh(segGeo, poleMaterial);
        segMesh.position.y = cursorY + segLen / 2;
        segMesh.castShadow = true;
        extensionGroup.add(segMesh);

        // Internal splice seam ring
        const extSeam = new THREE.Mesh(
          new THREE.TorusGeometry(r + 0.0005, 0.001, 8, 32),
          darkAnodizedMat
        );
        extSeam.rotation.x = Math.PI / 2;
        extSeam.position.y = cursorY;
        extensionGroup.add(extSeam);

        cursorY += segLen;
      }
      addHitProxy(extensionGroup, 'extension-tube', r + 0.032, extTotalLen, extTotalLen / 2);
    }
    tagPart(extensionGroup, 'extension-tube');
    rotatingColumn.add(extensionGroup);

    // 7. M24 THREADED ADJUSTER ROD & TWIN JAM NUTS + TELESCOPING COVER
    adjusterRodGroup = new THREE.Group();
    adjusterRodGroup.name = 'AdjusterRod_Assembly';
    const adjusterStartY = extStartY + extTotalLen;
    baseY.adjusterRod = adjusterStartY;
    adjusterRodGroup.position.y = adjusterStartY;

    const rodGeo = new THREE.CylinderGeometry(0.013, 0.013, adjusterLen + 0.06, 24);
    const rodMesh = new THREE.Mesh(rodGeo, hardenedSteelMat);
    rodMesh.position.y = adjusterLen / 2;
    rodMesh.castShadow = true;
    adjusterRodGroup.add(rodMesh);

    // Machined acme thread rings along the adjuster rod
    const threadCount = Math.min(18, Math.max(6, Math.floor((adjusterLen + 0.03) / 0.0085)));
    for (let i = 0; i < threadCount; i++) {
      const th = new THREE.Mesh(
        new THREE.TorusGeometry(0.0135, 0.0014, 6, 20),
        darkAnodizedMat
      );
      th.rotation.x = Math.PI / 2;
      th.position.y = 0.012 + i * 0.0082;
      adjusterRodGroup.add(th);
    }

    // Etched red 125mm maximum extension safety groove
    const limitBand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0142, 0.0142, 0.005, 20),
      safetyRedMat
    );
    limitBand.position.y = 0.016;
    adjusterRodGroup.add(limitBand);

    // Twin hexagonal jam nuts
    for (let j = 0; j < 2; j++) {
      const nut = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.022, 0.011, 6),
        machinedAlumMat
      );
      nut.position.y = 0.028 + j * 0.015;
      nut.castShadow = true;
      adjusterRodGroup.add(nut);
    }

    addHitProxy(adjusterRodGroup, 'adjuster-rod', 0.042, adjusterLen + 0.05, adjusterLen / 2);
    tagPart(adjusterRodGroup, 'adjuster-rod');
    rotatingColumn.add(adjusterRodGroup);

    // Telescoping Adjuster Cover Sleeve (slides over adjuster rod in Step 7)
    coverSleeveGroup = new THREE.Group();
    coverSleeveGroup.name = 'AdjusterCover_Sleeve';
    baseY.coverSleeve = adjusterStartY;
    coverSleeveGroup.position.y = adjusterStartY;

    if (config.mount !== 'stage-podium') {
      const sleeveLen = Math.max(0.09, adjusterLen + 0.025);
      const sleeveGeo = new THREE.CylinderGeometry(r + 0.0028, r + 0.0028, sleeveLen, 36, 1, true);
      const sleeveMesh = new THREE.Mesh(sleeveGeo, poleMaterial);
      sleeveMesh.position.y = sleeveLen / 2 - 0.01;
      sleeveMesh.castShadow = true;

      const sleeveTrimTop = new THREE.Mesh(
        new THREE.TorusGeometry(r + 0.0028, 0.0018, 8, 36),
        machinedAlumMat
      );
      sleeveTrimTop.rotation.x = Math.PI / 2;
      sleeveTrimTop.position.y = sleeveLen - 0.01;

      coverSleeveGroup.add(sleeveMesh, sleeveTrimTop);
    }
    tagPart(coverSleeveGroup, 'adjuster-rod');
    rotatingColumn.add(coverSleeveGroup);

    // 8. TOP MOUNT SYSTEM (Varies cleanly by mount type)
    topMountGroup = new THREE.Group();
    topMountGroup.name = 'TopMount_Assembly';
    baseY.topMount = H;
    topMountGroup.position.y = H;

    if (config.mount === 'tension') {
      // Articulating 380mm ceiling dome + elastomer pad + top bearing cup
      const padGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.008, 44);
      const pad = new THREE.Mesh(padGeo, elastomerMat);
      pad.position.y = -0.004;

      const domeProfile = [
        new THREE.Vector2(0.02, -0.095),
        new THREE.Vector2(0.036, -0.092),
        new THREE.Vector2(0.048, -0.068),
        new THREE.Vector2(0.115, -0.042),
        new THREE.Vector2(0.186, -0.02),
        new THREE.Vector2(0.188, -0.008),
      ];
      const domeGeo = new THREE.LatheGeometry(domeProfile, 44);
      const dome = new THREE.Mesh(domeGeo, machinedAlumMat);
      dome.castShadow = true;

      // Internal bearing cup collar
      const cupGeo = new THREE.CylinderGeometry(r + 0.012, r + 0.008, 0.04, 32);
      const cup = new THREE.Mesh(cupGeo, darkAnodizedMat);
      cup.position.y = -0.09;

      topMountGroup.add(pad, dome, cup);
      addHitProxy(topMountGroup, 'top-mount', 0.2, 0.12, -0.055);
    } else if (config.mount === 'permanent-ceiling') {
      // Bolted heavy steel ceiling flange + 4× M10 anchor bolts + ball-bearing spindle
      const plateGeo = new THREE.BoxGeometry(0.175, 0.012, 0.175);
      const plate = new THREE.Mesh(plateGeo, darkAnodizedMat);
      plate.position.y = -0.006;
      plate.castShadow = true;

      const spindleGeo = new THREE.CylinderGeometry(r + 0.01, r + 0.006, 0.095, 32);
      const spindle = new THREE.Mesh(spindleGeo, machinedAlumMat);
      spindle.position.y = -0.056;

      // 4× M10 Structural Anchor Bolts at plate corners
      const offsets = [-0.064, 0.064];
      for (const ox of offsets) {
        for (const oz of offsets) {
          const bolt = createHexBoltMesh(0.011, 0.01, 0.012, blackOxideBoltMat);
          bolt.rotation.x = Math.PI;
          bolt.position.set(ox, -0.012, oz);
          topMountGroup.add(bolt);
        }
      }
      topMountGroup.add(plate, spindle);
      addHitProxy(topMountGroup, 'top-mount', 0.14, 0.12, -0.055);
    } else if (config.mount === 'vaulted-beam') {
      // Articulating clevis yoke tilted to vaultAngleDeg
      const tiltGroup = new THREE.Group();
      tiltGroup.rotation.z = THREE.MathUtils.degToRad(config.vaultAngleDeg);

      const ceilingPlate = new THREE.Mesh(
        new THREE.BoxGeometry(0.19, 0.012, 0.14),
        darkAnodizedMat
      );
      ceilingPlate.position.y = -0.006;
      ceilingPlate.castShadow = true;

      // Two clevis ears
      const earGeo = new THREE.BoxGeometry(0.014, 0.068, 0.056);
      const earL = new THREE.Mesh(earGeo, hardenedSteelMat);
      earL.position.set(-0.032, -0.044, 0);
      const earR = new THREE.Mesh(earGeo, hardenedSteelMat);
      earR.position.set(0.032, -0.044, 0);

      for (const ox of [-0.072, 0.072]) {
        for (const oz of [-0.046, 0.046]) {
          const bolt = createHexBoltMesh(0.01, 0.009, 0.01, blackOxideBoltMat);
          bolt.rotation.x = Math.PI;
          bolt.position.set(ox, -0.012, oz);
          tiltGroup.add(bolt);
        }
      }
      tiltGroup.add(ceilingPlate, earL, earR);

      // Horizontal M16 hardened pivot clevis pin + vertical pole coupler
      const clevisPin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, 0.01, 0.095, 20),
        machinedAlumMat
      );
      clevisPin.rotation.z = Math.PI / 2;
      clevisPin.position.y = -0.062;

      const verticalYoke = new THREE.Mesh(
        new THREE.CylinderGeometry(r + 0.01, r + 0.007, 0.08, 28),
        darkAnodizedMat
      );
      verticalYoke.position.y = -0.095;

      topMountGroup.add(tiltGroup, clevisPin, verticalYoke);
      addHitProxy(topMountGroup, 'top-mount', 0.15, 0.15, -0.07);
    } else {
      // Stage Podium self-supporting chamfered anodized finial cap
      const capY = -(H - poleEndY) + 0.025;
      const capGeo = new THREE.CylinderGeometry(r * 0.85, r + 0.002, 0.032, 32);
      const cap = new THREE.Mesh(capGeo, machinedAlumMat);
      cap.position.y = capY;
      cap.castShadow = true;

      const capRing = new THREE.Mesh(
        new THREE.TorusGeometry(r + 0.001, 0.002, 8, 32),
        darkAnodizedMat
      );
      capRing.rotation.x = Math.PI / 2;
      capRing.position.y = capY - 0.014;

      topMountGroup.add(cap, capRing);
      addHitProxy(topMountGroup, 'top-mount', r + 0.04, 0.08, capY);
    }
    tagPart(topMountGroup, 'top-mount');
    root.add(topMountGroup);

    // 9. INTERACTIVE TORQUE / FASTENER HIGHLIGHT RING + ANIMATED 3D HEX KEY WRENCH
    torqueIndicatorGroup = new THREE.Group();
    torqueIndicatorGroup.name = 'TorqueHighlight_Overlay';
    torqueIndicatorGroup.userData.excludeFromExport = true;

    const ringGeo = new THREE.TorusGeometry(r + 0.075, 0.0065, 14, 48);
    const ringMesh = new THREE.Mesh(ringGeo, highlightRingMat);
    ringMesh.rotation.x = Math.PI / 2;

    const innerTicksGeo = new THREE.TorusGeometry(r + 0.044, 0.0032, 10, 36);
    const innerTicks = new THREE.Mesh(innerTicksGeo, highlightRingMat);
    innerTicks.rotation.x = Math.PI / 2;

    // 3D L-Shaped Calibrated Hex Key orbiting active fastener
    const wrenchGroup = new THREE.Group();
    wrenchGroup.name = 'AnimatedHexKey';
    const shortArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0055, 0.0055, 0.055, 6),
      hexKeyMat
    );
    shortArm.rotation.z = Math.PI / 2;
    shortArm.position.set(r + 0.036, 0, 0);

    const longArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 0.16, 6),
      hexKeyMat
    );
    longArm.position.set(r + 0.064, 0.078, 0);

    const handleGrip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.011, 0.075, 14),
      darkAnodizedMat
    );
    handleGrip.position.set(r + 0.064, 0.125, 0);

    // Torque direction arrowhead on the ring
    const arrowCone = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.032, 12), highlightRingMat);
    arrowCone.position.set(0, 0, r + 0.075);
    arrowCone.rotation.z = -Math.PI / 2;

    wrenchGroup.add(shortArm, longArm, handleGrip);
    torqueIndicatorGroup.add(ringMesh, innerTicks, wrenchGroup, arrowCone);
    tagPart(torqueIndicatorGroup, 'x-joint', true);
    root.add(torqueIndicatorGroup);
  }

  function applyKinematics(
    offsets: AssemblyPartOffsets,
    config: PoleRigConfig,
    highlightFasteners: boolean,
    selectedPart: HardwarePartId | null,
    spinAngleRad: number
  ): void {
    basePlateGroup.position.y = baseY.basePlate + offsets.basePlateY;
    bearingHubGroup.position.y = baseY.bearingHub + offsets.bearingHubY;

    // Spin lock pins retract outward cleanly when spinning mode is active (or during exploded view)
    const spinRetract = config.isSpinning ? 0.011 : 0;
    const totalPinShift = offsets.lockPinOffset + spinRetract;
    lockPinLeft.position.x = -(currentRadiusM + 0.022 + totalPinShift);
    lockPinRight.position.x = currentRadiusM + 0.022 + totalPinShift;

    lowerTubeGroup.position.y = baseY.lowerTube + offsets.lowerTubeY;
    xJointGroup.position.y = baseY.xJoint + offsets.xJointY;
    upperTubeGroup.position.y = baseY.upperTube + offsets.upperTubeY;
    extensionGroup.position.y = baseY.extension + offsets.extensionY;
    adjusterRodGroup.position.y = baseY.adjusterRod + offsets.adjusterRodY;
    topMountGroup.position.y = baseY.topMount + offsets.topMountY;
    coverSleeveGroup.position.y = baseY.coverSleeve + offsets.coverSleeveY;

    // Rotate the pole column smoothly
    rotatingColumn.rotation.y = spinAngleRad;

    // Position and animate the torque highlight ring & 3D hex key
    const showHighlight = highlightFasteners || selectedPart !== null;
    torqueIndicatorGroup.visible = showHighlight;

    if (showHighlight) {
      let targetY = offsets.activeJointNormalizedY * currentHeightM;
      if (selectedPart) {
        const pt = getPartFocusPoint(selectedPart);
        targetY = pt.y;
      } else {
        // Track exact moving sub-assembly during step-by-step animation
        const stepMapY = [
          basePlateGroup.position.y + 0.025,
          bearingHubGroup.position.y + 0.022,
          lowerTubeGroup.position.y + 0.04,
          xJointGroup.position.y,
          upperTubeGroup.position.y + 0.12,
          topMountGroup.position.y - 0.075,
          adjusterRodGroup.position.y + 0.038,
        ];
        targetY = stepMapY[offsets.activeStepIndex] ?? targetY;
      }

      torqueIndicatorGroup.position.y = targetY;
      torqueIndicatorGroup.rotation.y = offsets.wrenchAngleRad;
    }
  }

  function getPartFocusPoint(partId: HardwarePartId): THREE.Vector3 {
    switch (partId) {
      case 'base-plate':
        return new THREE.Vector3(0, basePlateGroup.position.y + 0.05, 0);
      case 'bearing-hub':
        return new THREE.Vector3(0, bearingHubGroup.position.y + 0.035, 0);
      case 'lower-tube':
        return new THREE.Vector3(0, lowerTubeGroup.position.y + 0.5, 0);
      case 'x-joint':
        return new THREE.Vector3(0, xJointGroup.position.y, 0);
      case 'upper-tube':
        return new THREE.Vector3(0, upperTubeGroup.position.y + 0.5, 0);
      case 'extension-tube':
        return new THREE.Vector3(0, extensionGroup.position.y + 0.14, 0);
      case 'adjuster-rod':
        return new THREE.Vector3(0, adjusterRodGroup.position.y + 0.06, 0);
      case 'top-mount':
        return new THREE.Vector3(0, topMountGroup.position.y - 0.06, 0);
    }
  }

  return {
    root,
    rotatingColumn,
    interactables,
    rebuild,
    applyKinematics,
    getPartFocusPoint,
    dispose: () => {
      clearDisposables();
      poleMaterial.dispose();
      machinedAlumMat.dispose();
      darkAnodizedMat.dispose();
      hardenedSteelMat.dispose();
      blackOxideBoltMat.dispose();
      elastomerMat.dispose();
      stageDeckMat.dispose();
      safetyRedMat.dispose();
      highlightRingMat.dispose();
      hexKeyMat.dispose();
    },
  };
}
