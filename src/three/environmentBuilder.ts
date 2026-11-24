import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import type {
  BaseMountId,
  ClearanceAnalysis,
  EnvironmentPreset,
  LightingPreset,
  PoleRigConfig,
  RoomReplicaScene,
} from '../types/pole';
import {
  analyzeFloorClearance,
  computeEffectiveVaultRad,
  getWallClearanceMarginM,
  MAX_POLES_IN_STUDIO,
} from '../utils/poleConfig';
import type { ProceduralTextureSet } from './proceduralTextures';
import { createRoomReplicaRig } from './roomReplicaBuilder';

export interface FloorPoleMarker {
  x: number;
  z: number;
  mount: BaseMountId;
  isSelected: boolean;
}

export interface EnvironmentRigHandle {
  group: THREE.Group;
  update: (
    config: PoleRigConfig,
    arTransparentMode: boolean,
    renderer: THREE.WebGLRenderer,
    poleMarkers?: FloorPoleMarker[],
    dragBoundaryState?: { active: boolean; hitWall: boolean; activeMount: BaseMountId },
    roomReplica?: RoomReplicaScene | null,
    showInferredObjects?: boolean
  ) => void;
  dispose: () => void;
}

export function createEnvironmentRig(
  scene: THREE.Scene,
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean
): EnvironmentRigHandle {
  const group = new THREE.Group();
  group.name = 'AxisPole_StudioEnvironment';

  // --- LIGHTING RIG (1 Primary Shadow Caster + Fill + Rim + Neon / Spotlights) ---
  const hemiLight = new THREE.HemisphereLight(0xe6effc, 0x9c9286, 0.72);
  scene.add(hemiLight);

  // Main key directional light (primary shadow caster for Studio Daylight)
  const keyLight = new THREE.DirectionalLight(0xfff5e6, 1.55);
  keyLight.position.set(3.2, 5.6, 3.8);
  keyLight.castShadow = !isSoftwareGl;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 16;
  keyLight.shadow.camera.left = -3.8;
  keyLight.shadow.camera.right = 3.8;
  keyLight.shadow.camera.top = 5.8;
  keyLight.shadow.camera.bottom = -0.8;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.02;
  scene.add(keyLight);

  // Dedicated Professional Spotlight (overhead theatrical cone onto pole & stage)
  const proSpotLight = new THREE.SpotLight(0xfff1d6, 0, 12, Math.PI / 5.5, 0.48, 1.3);
  proSpotLight.position.set(1.1, 3.4, 1.35);
  proSpotLight.target.position.set(0, 1.15, 0);
  proSpotLight.castShadow = false; // Keep 1 shadow caster budget; keyLight handles crisp shadows
  scene.add(proSpotLight);
  scene.add(proSpotLight.target);

  // Back rim directional light to sculpt pole silhouette
  const rimLight = new THREE.DirectionalLight(0xcbe0ff, 0.9);
  rimLight.position.set(-2.8, 3.2, -3.2);
  scene.add(rimLight);

  // Dual architectural neon accent PointLights (left violet-magenta, right electric cyan)
  const neonLeftLight = new THREE.PointLight(0xd946ef, 0, 7.5, 1.6);
  const neonRightLight = new THREE.PointLight(0x22d3ee, 0, 7.5, 1.6);
  const neonCoveLight = new THREE.PointLight(0x818cf8, 0, 8.0, 1.8);
  scene.add(neonLeftLight, neonRightLight, neonCoveLight);

  // Softbox RectAreaLights on GPU devices for clean vertical specular streaks on brass/steel
  let softboxLeft: THREE.RectAreaLight | null = null;
  let softboxRight: THREE.RectAreaLight | null = null;
  if (!isSoftwareGl) {
    RectAreaLightUniformsLib.init();
    softboxLeft = new THREE.RectAreaLight(0xfff8ee, 1.8, 1.1, 2.5);
    softboxLeft.position.set(-2.1, 1.5, 1.4);
    softboxLeft.lookAt(0, 1.35, 0);
    scene.add(softboxLeft);

    softboxRight = new THREE.RectAreaLight(0xdbeafe, 1.4, 1.1, 2.5);
    softboxRight.position.set(2.2, 1.5, 1.1);
    softboxRight.lookAt(0, 1.35, 0);
    scene.add(softboxRight);
  }

  // --- ARCHITECTURAL MATERIALS ---
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.studioWoodAlbedo,
    bumpMap: textures.woodBump,
    bumpScale: 0.0045,
    roughness: 0.42,
    metalness: 0.04,
  });

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x24262e,
    roughness: 0.85,
    metalness: 0.02,
  });

  const leftWallMat = new THREE.MeshStandardMaterial({
    color: 0x24262e,
    roughness: 0.85,
    metalness: 0.02,
  });

  const upperWallMat = new THREE.MeshStandardMaterial({
    color: 0x54585e,
    roughness: 0.86,
    metalness: 0.02,
  });

  const ceilingSoffitMat = new THREE.MeshStandardMaterial({
    color: 0x1d1f26,
    roughness: 0.88,
    metalness: 0.02,
  });

  const baseboardMat = new THREE.MeshStandardMaterial({
    color: 0x181a20,
    roughness: 0.52,
    metalness: 0.12,
  });

  const woodSlatMat = new THREE.MeshStandardMaterial({
    color: 0x6f5138,
    roughness: 0.64,
    metalness: 0.03,
  });

  const trackMetalMat = new THREE.MeshStandardMaterial({
    color: 0x17191e,
    metalness: 0.78,
    roughness: 0.3,
  });

  const mirrorGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xcbd5e1,
    metalness: 0.92,
    roughness: 0.05,
    envMapIntensity: 1.35,
  });

  // Emissive architectural neon tube materials (dynamically tinted by LightingPreset)
  const neonTubeLeftMat = new THREE.MeshStandardMaterial({
    color: 0xf5d0fe,
    emissive: 0xd946ef,
    emissiveIntensity: 2.8,
    roughness: 0.15,
    metalness: 0.0,
  });

  const neonTubeRightMat = new THREE.MeshStandardMaterial({
    color: 0xcffafe,
    emissive: 0x22d3ee,
    emissiveIntensity: 2.8,
    roughness: 0.15,
    metalness: 0.0,
  });

  const neonCoveMat = new THREE.MeshStandardMaterial({
    color: 0xe0e7ff,
    emissive: 0x818cf8,
    emissiveIntensity: 2.2,
    roughness: 0.2,
    metalness: 0.0,
  });

  const spotLensMat = new THREE.MeshStandardMaterial({
    color: 0xfff8e7,
    emissive: 0xffe4b5,
    emissiveIntensity: 2.4,
    roughness: 0.1,
  });

  const contactShadowMat = new THREE.MeshBasicMaterial({
    map: textures.contactShadow,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  });

  const clearanceRingMat = new THREE.MeshBasicMaterial({
    map: textures.clearanceRing,
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const apronMat = new THREE.MeshStandardMaterial({
    color: 0x111217,
    roughness: 0.95,
    metalness: 0.0,
  });

  // --- FLOOR & SURROUND ---
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  group.add(floorMesh);

  const apronMesh = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), apronMat);
  apronMesh.rotation.x = -Math.PI / 2;
  apronMesh.position.y = -0.025;
  group.add(apronMesh);

  // Pooled floor contact shadows, clearance rings & selection rings for up to MAX_POLES_IN_STUDIO poles
  const shadowPool: THREE.Mesh[] = [];
  const clearancePool: THREE.Mesh[] = [];
  const selectionRingMat = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  const selectionRingMesh = new THREE.Mesh(
    new THREE.RingGeometry(0.165, 0.2, 40),
    selectionRingMat
  );
  selectionRingMesh.rotation.x = -Math.PI / 2;
  selectionRingMesh.position.y = 0.012;
  selectionRingMesh.visible = false;
  group.add(selectionRingMesh);

  for (let i = 0; i < MAX_POLES_IN_STUDIO; i++) {
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.54, 32), contactShadowMat);
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.004;
    sh.visible = i === 0;
    group.add(sh);
    shadowPool.push(sh);

    const cr = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), clearanceRingMat);
    cr.rotation.x = -Math.PI / 2;
    cr.position.y = 0.018;
    cr.visible = i === 0;
    group.add(cr);
    clearancePool.push(cr);
  }

  // Safe floor drag perimeter outline (shown cleanly while dragging a pole to visualize min wall clearance)
  const boundaryLineMat = new THREE.LineBasicMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.85,
  });
  const boundaryPoints = [
    new THREE.Vector3(-0.5, 0.02, -0.5),
    new THREE.Vector3(0.5, 0.02, -0.5),
    new THREE.Vector3(0.5, 0.02, 0.5),
    new THREE.Vector3(-0.5, 0.02, 0.5),
    new THREE.Vector3(-0.5, 0.02, -0.5),
  ];
  const boundaryLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(boundaryPoints),
    boundaryLineMat
  );
  boundaryLine.visible = false;
  group.add(boundaryLine);

  // --- ARCHITECTURAL ENCLOSURE (Back Gable Wall + Left Wall + Sloped/Flat Ceiling Soffit) ---
  const backWallGeo = new THREE.BoxGeometry(1, 1, 0.12);
  const backWallOrigPos = new Float32Array(
    (backWallGeo.attributes.position as THREE.BufferAttribute).array
  );
  const backWall = new THREE.Mesh(backWallGeo, wallMat);
  backWall.receiveShadow = true;
  const upperWallBand = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.014), upperWallMat);
  upperWallBand.receiveShadow = true;
  upperWallBand.visible = false;
  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1, 1), leftWallMat);
  leftWall.receiveShadow = true;
  const backBaseboard = new THREE.Mesh(new THREE.BoxGeometry(1, 0.085, 0.025), baseboardMat);
  const leftBaseboard = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.085, 1), baseboardMat);
  group.add(backWall, upperWallBand, leftWall, backBaseboard, leftBaseboard);

  // Recessed Architectural Ceiling Soffit + Structural Joist Header (cleanly integrated, pitches cleanly for vaulted mounts!)
  const ceilingSlab = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 1), ceilingSoffitMat);
  const ceilingBeam = new THREE.Mesh(new THREE.BoxGeometry(1, 0.055, 0.14), woodSlatMat);
  group.add(ceilingSlab, ceilingBeam);

  // Overhead Perimeter LED Cove Strips (back wall & left wall ceiling junction)
  const coveBarBack = new THREE.Mesh(new THREE.BoxGeometry(1, 0.018, 0.022), neonCoveMat);
  const coveBarLeft = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.018, 1), neonCoveMat);
  group.add(coveBarBack, coveBarLeft);

  // Overhead Black Aluminum Track Lighting Rail with 3 Articulated Studio Spotlight Cans
  const trackRigGroup = new THREE.Group();
  const trackRail = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.028, 0.042), trackMetalMat);
  trackRigGroup.add(trackRail);

  for (const tx of [-0.78, 0, 0.78]) {
    const canGroup = new THREE.Group();
    canGroup.position.set(tx, -0.065, 0);
    canGroup.rotation.x = 0.42;
    canGroup.rotation.z = tx * -0.25;

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.055, 10), trackMetalMat);
    stem.position.y = 0.045;
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, 0.095, 18), trackMetalMat);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.031, 16), spotLensMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.y = -0.049;

    canGroup.add(stem, housing, lens);
    trackRigGroup.add(canGroup);
  }
  group.add(trackRigGroup);

  // --- STUDIO ARCHITECTURAL FEATURE WALL (Fluted Acoustic Slats + Full-Height Mirror + Vertical Neon LED Bars) ---
  const studioFeatureGroup = new THREE.Group();

  // Left-wall fluted acoustic wood slat panel (instanced for zero draw-call bloat!)
  const slatCount = 24;
  const slatGeo = new THREE.BoxGeometry(0.024, 1, 0.032);
  const slatInstanced = new THREE.InstancedMesh(slatGeo, woodSlatMat, slatCount);
  slatInstanced.frustumCulled = false;
  studioFeatureGroup.add(slatInstanced);

  // Full-height frameless studio mirror panel on back wall with anodized trim
  const mirrorGroup = new THREE.Group();
  const mirrorFrame = new THREE.Mesh(new THREE.BoxGeometry(2.48, 2.24, 0.026), trackMetalMat);
  const mirrorGlass = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.16), mirrorGlassMat);
  mirrorGlass.position.z = 0.015;

  // Dual vertical architectural neon light bars flanking the studio mirror
  const neonBarLeft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 2.22, 14),
    neonTubeLeftMat
  );
  neonBarLeft.position.set(-1.34, 0, 0.028);

  const neonBarRight = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 2.22, 14),
    neonTubeRightMat
  );
  neonBarRight.position.set(1.34, 0, 0.028);

  // Sleek anodized channel brackets holding neon tubes
  const neonChannelL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.26, 0.018), trackMetalMat);
  neonChannelL.position.set(-1.34, 0, 0.012);
  const neonChannelR = neonChannelL.clone();
  neonChannelR.position.x = 1.34;

  // Wall-mounted warm oak studio ballet barre across mirror lower third
  const barreRod = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 2.36, 16), woodSlatMat);
  barreRod.rotation.z = Math.PI / 2;
  barreRod.position.set(0, -0.18, 0.13);
  const barreBrkL = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.036, 0.12), trackMetalMat);
  barreBrkL.position.set(-0.9, -0.18, 0.068);
  const barreBrkR = barreBrkL.clone();
  barreBrkR.position.x = 0.9;

  mirrorGroup.add(
    mirrorFrame,
    mirrorGlass,
    neonChannelL,
    neonChannelR,
    neonBarLeft,
    neonBarRight,
    barreRod,
    barreBrkL,
    barreBrkR
  );
  studioFeatureGroup.add(mirrorGroup);

  // Floor perimeter architectural LED wash strip along back baseboard
  const floorNeonStrip = new THREE.Mesh(new THREE.BoxGeometry(2.68, 0.014, 0.016), neonTubeRightMat);
  studioFeatureGroup.add(floorNeonStrip);

  group.add(studioFeatureGroup);

  // --- HOME LOFT ENVIRONMENT PROPS (Minimalist Oak Bench + Framed Gallery Canvas + Warm Floor Sconce) ---
  const homeFeatureGroup = new THREE.Group();
  const benchSeat = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.044, 0.36), woodSlatMat);
  benchSeat.position.set(0, 0.42, 0);
  benchSeat.castShadow = true;
  benchSeat.receiveShadow = true;
  const benchLegGeo = new THREE.BoxGeometry(0.036, 0.4, 0.3);
  const benchLegL = new THREE.Mesh(benchLegGeo, trackMetalMat);
  benchLegL.position.set(-0.48, 0.2, 0);
  const benchLegR = new THREE.Mesh(benchLegGeo, trackMetalMat);
  benchLegR.position.set(0.48, 0.2, 0);

  const artFrame = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.28, 0.026), trackMetalMat);
  artFrame.position.set(0, 1.48, -0.16);
  const artCanvas = new THREE.Mesh(
    new THREE.PlaneGeometry(0.97, 1.2),
    new THREE.MeshStandardMaterial({ color: 0xefeae1, roughness: 0.92 })
  );
  artCanvas.position.set(0, 1.48, -0.145);
  const artArc = new THREE.Mesh(
    new THREE.CircleGeometry(0.28, 32),
    new THREE.MeshStandardMaterial({ color: 0xb98d60, roughness: 0.85 })
  );
  artArc.position.set(0, 1.5, -0.142);

  // Subtle vertical warm LED accent wall sconce beside artwork
  const homeSconce = new THREE.Mesh(
    new THREE.CylinderGeometry(0.01, 0.01, 1.15, 12),
    neonTubeLeftMat
  );
  homeSconce.position.set(0.72, 1.48, -0.14);

  homeFeatureGroup.add(benchSeat, benchLegL, benchLegR, artFrame, artCanvas, artArc, homeSconce);
  group.add(homeFeatureGroup);

  // --- SCANNED 3D ROOM REPLICA FURNITURE & ARCHITECTURAL RIG ---
  const roomReplicaRig = createRoomReplicaRig(group);

  scene.add(group);

  // Reusable dummy for instanced acoustic wood slats
  const _dummy = new THREE.Object3D();

  function applyLightingPreset(
    env: EnvironmentPreset,
    preset: LightingPreset,
    H: number,
    W: number,
    D: number,
    renderer: THREE.WebGLRenderer
  ): void {
    const isHome = env === 'home';

    // Position architectural neon point lights near the mirror light tubes & ceiling cove
    const lightMirrorScaleX = Math.max(0.38, Math.min(1.0, (W - 0.34) / 2.74));
    neonLeftLight.position.set(-1.35 * lightMirrorScaleX, H * 0.52, -D / 2 + 0.45);
    neonRightLight.position.set(1.35 * lightMirrorScaleX, H * 0.52, -D / 2 + 0.45);
    neonCoveLight.position.set(-W / 2 + 0.5, H - 0.28, 0.2);

    if (preset === 'studio-daylight') {
      const bg = isHome ? 0xddd6ca : 0xe2dfd8;
      scene.background = new THREE.Color(bg);
      scene.fog = new THREE.Fog(bg, 10, 26);
      renderer.toneMappingExposure = 1.02;

      apronMat.color.setHex(isHome ? 0xd0c7b9 : 0xd5d2ca);
      wallMat.color.setHex(isHome ? 0xd9d0c3 : 0xdcd9d1);
      ceilingSoffitMat.color.setHex(0xe5e2da);
      baseboardMat.color.setHex(0xc4bfb6);

      hemiLight.color.setHex(0xeaf2fc);
      hemiLight.groundColor.setHex(0xa69b8d);
      hemiLight.intensity = 0.72;

      keyLight.color.setHex(0xfff6ea);
      keyLight.intensity = 1.65;
      keyLight.position.set(3.2, 4.6, 3.6);
      keyLight.shadow.intensity = 0.75;

      rimLight.color.setHex(0xd4e6ff);
      rimLight.intensity = 0.85;

      proSpotLight.intensity = 0;

      // Subtle architectural warm-white daylight LED strip glow
      neonTubeLeftMat.color.setHex(0xfffbeb);
      neonTubeLeftMat.emissive.setHex(0xfde68a);
      neonTubeLeftMat.emissiveIntensity = 0.9;
      neonTubeRightMat.color.setHex(0xfffbeb);
      neonTubeRightMat.emissive.setHex(0xfde68a);
      neonTubeRightMat.emissiveIntensity = 0.9;
      neonCoveMat.color.setHex(0xffffff);
      neonCoveMat.emissive.setHex(0xfef3c7);
      neonCoveMat.emissiveIntensity = 0.75;
      spotLensMat.emissiveIntensity = 0.4;

      neonLeftLight.intensity = 0;
      neonRightLight.intensity = 0;
      neonCoveLight.intensity = 0;

      if (softboxLeft) {
        softboxLeft.color.setHex(0xfff8ee);
        softboxLeft.intensity = 1.8;
      }
      if (softboxRight) {
        softboxRight.color.setHex(0xdbeafe);
        softboxRight.intensity = 1.3;
      }
    } else if (preset === 'mood-neon') {
      // Luxury Mood / Night Neon Studio
      const bg = 0x0e1017;
      scene.background = new THREE.Color(bg);
      scene.fog = new THREE.Fog(bg, 8.5, 22);
      renderer.toneMappingExposure = 1.12;

      apronMat.color.setHex(0x0b0c12);
      wallMat.color.setHex(isHome ? 0x1d1c24 : 0x181a24);
      ceilingSoffitMat.color.setHex(0x13151e);
      baseboardMat.color.setHex(0x111218);

      hemiLight.color.setHex(0x6366f1);
      hemiLight.groundColor.setHex(0x27192d);
      hemiLight.intensity = 0.42;

      // Soft moody top-front key light so pole form stays richly sculpted
      keyLight.color.setHex(0xe9d5ff);
      keyLight.intensity = 0.85;
      keyLight.position.set(2.2, 4.2, 3.2);
      keyLight.shadow.intensity = 0.65;

      rimLight.color.setHex(0x38bdf8);
      rimLight.intensity = 1.45;

      proSpotLight.color.setHex(0xf5d0fe);
      proSpotLight.intensity = 1.8;
      proSpotLight.position.set(0.4, H - 0.12, 1.25);
      proSpotLight.target.position.set(0, H * 0.45, 0);

      // Vibrant architectural magenta-violet + electric cyan studio neon tubes
      neonTubeLeftMat.color.setHex(0xf5d0fe);
      neonTubeLeftMat.emissive.setHex(0xd946ef);
      neonTubeLeftMat.emissiveIntensity = 3.2;
      neonTubeRightMat.color.setHex(0xcffafe);
      neonTubeRightMat.emissive.setHex(0x22d3ee);
      neonTubeRightMat.emissiveIntensity = 3.2;
      neonCoveMat.color.setHex(0xe0e7ff);
      neonCoveMat.emissive.setHex(0x8b5cf6);
      neonCoveMat.emissiveIntensity = 2.4;
      spotLensMat.emissive.setHex(0xe9d5ff);
      spotLensMat.emissiveIntensity = 1.6;

      neonLeftLight.color.setHex(0xd946ef);
      neonLeftLight.intensity = 3.6;
      neonRightLight.color.setHex(0x22d3ee);
      neonRightLight.intensity = 3.6;
      neonCoveLight.color.setHex(0x8b5cf6);
      neonCoveLight.intensity = 2.0;

      if (softboxLeft) {
        softboxLeft.color.setHex(0xe879f9);
        softboxLeft.intensity = 3.4;
      }
      if (softboxRight) {
        softboxRight.color.setHex(0x22d3ee);
        softboxRight.intensity = 3.2;
      }
    } else if (preset === 'sunset-flow') {
      // Sunset Flow: Warm golden-hour boutique pole-fitness & flexibility studio
      const bg = 0x1a1216;
      scene.background = new THREE.Color(bg);
      scene.fog = new THREE.Fog(bg, 9.0, 24);
      renderer.toneMappingExposure = 1.12;

      apronMat.color.setHex(0x140e12);
      wallMat.color.setHex(isHome ? 0x2d2020 : 0x281c20);
      ceilingSoffitMat.color.setHex(0x1f1519);
      baseboardMat.color.setHex(0x1a1215);

      hemiLight.color.setHex(0xfda4af);
      hemiLight.groundColor.setHex(0x451a1d);
      hemiLight.intensity = 0.56;

      // Golden-hour slanted sun key light washing warm amber across the studio
      keyLight.color.setHex(0xffc999);
      keyLight.intensity = 1.72;
      keyLight.position.set(3.4, 3.6, 3.1);
      keyLight.shadow.intensity = 0.72;

      rimLight.color.setHex(0xfb7185);
      rimLight.intensity = 1.28;

      proSpotLight.color.setHex(0xffedd5);
      proSpotLight.intensity = 2.4;
      proSpotLight.position.set(0.65, H - 0.12, 1.3);
      proSpotLight.target.position.set(0, H * 0.44, 0);

      // Rose-coral & sunset-amber vertical LED bars flanking the mirror
      neonTubeLeftMat.color.setHex(0xffe4e6);
      neonTubeLeftMat.emissive.setHex(0xf43f5e);
      neonTubeLeftMat.emissiveIntensity = 2.9;
      neonTubeRightMat.color.setHex(0xffedd5);
      neonTubeRightMat.emissive.setHex(0xf97316);
      neonTubeRightMat.emissiveIntensity = 2.9;
      neonCoveMat.color.setHex(0xfef3c7);
      neonCoveMat.emissive.setHex(0xfb923c);
      neonCoveMat.emissiveIntensity = 2.1;
      spotLensMat.emissive.setHex(0xfed7aa);
      spotLensMat.emissiveIntensity = 2.0;

      neonLeftLight.color.setHex(0xf43f5e);
      neonLeftLight.intensity = 3.2;
      neonRightLight.color.setHex(0xfb923c);
      neonRightLight.intensity = 3.4;
      neonCoveLight.color.setHex(0xf59e0b);
      neonCoveLight.intensity = 1.7;

      if (softboxLeft) {
        softboxLeft.color.setHex(0xfda4af);
        softboxLeft.intensity = 2.9;
      }
      if (softboxRight) {
        softboxRight.color.setHex(0xfdba74);
        softboxRight.intensity = 3.1;
      }
    } else if (preset === 'cyber-pulse') {
      // Cyber Pulse: High-energy athletic pole-fitness club (emerald-mint & glacier cyan)
      const bg = 0x0b1216;
      scene.background = new THREE.Color(bg);
      scene.fog = new THREE.Fog(bg, 9.0, 24);
      renderer.toneMappingExposure = 1.1;

      apronMat.color.setHex(0x080e12);
      wallMat.color.setHex(isHome ? 0x162026 : 0x131d23);
      ceilingSoffitMat.color.setHex(0x0e161b);
      baseboardMat.color.setHex(0x0d1318);

      hemiLight.color.setHex(0x6ee7b7);
      hemiLight.groundColor.setHex(0x0f252a);
      hemiLight.intensity = 0.5;

      // Crisp neutral athletic training key light so pole & form stay ultra-readable
      keyLight.color.setHex(0xe6fff9);
      keyLight.intensity = 1.62;
      keyLight.position.set(2.5, 4.5, 3.3);
      keyLight.shadow.intensity = 0.78;

      rimLight.color.setHex(0x2dd4bf);
      rimLight.intensity = 1.55;

      proSpotLight.color.setHex(0xccfbf1);
      proSpotLight.intensity = 2.8;
      proSpotLight.position.set(0.5, H - 0.1, 1.3);
      proSpotLight.target.position.set(0, H * 0.44, 0);

      // Electric emerald-mint + glacier cyan fitness studio LED bars
      neonTubeLeftMat.color.setHex(0xd1fae5);
      neonTubeLeftMat.emissive.setHex(0x10b981);
      neonTubeLeftMat.emissiveIntensity = 3.1;
      neonTubeRightMat.color.setHex(0xcffafe);
      neonTubeRightMat.emissive.setHex(0x06b6d4);
      neonTubeRightMat.emissiveIntensity = 3.1;
      neonCoveMat.color.setHex(0x99f6e4);
      neonCoveMat.emissive.setHex(0x14b8a6);
      neonCoveMat.emissiveIntensity = 2.2;
      spotLensMat.emissive.setHex(0xd1fae5);
      spotLensMat.emissiveIntensity = 2.1;

      neonLeftLight.color.setHex(0x10b981);
      neonLeftLight.intensity = 3.5;
      neonRightLight.color.setHex(0x06b6d4);
      neonRightLight.intensity = 3.5;
      neonCoveLight.color.setHex(0x14b8a6);
      neonCoveLight.intensity = 1.9;

      if (softboxLeft) {
        softboxLeft.color.setHex(0x34d399);
        softboxLeft.intensity = 2.8;
      }
      if (softboxRight) {
        softboxRight.color.setHex(0x38bdf8);
        softboxRight.intensity = 3.1;
      }
    } else {
      // Professional Spotlight (Theatrical high-contrast architectural stage)
      const bg = 0x111114;
      scene.background = new THREE.Color(bg);
      scene.fog = new THREE.Fog(bg, 8.0, 20);
      renderer.toneMappingExposure = 1.08;

      apronMat.color.setHex(0x0c0c0f);
      wallMat.color.setHex(0x1b1c20);
      ceilingSoffitMat.color.setHex(0x141519);
      baseboardMat.color.setHex(0x121316);

      hemiLight.color.setHex(0x94a3b8);
      hemiLight.groundColor.setHex(0x241e18);
      hemiLight.intensity = 0.24;

      // Crisp dramatic directional shadow caster mimicking theatrical follow-spot
      keyLight.color.setHex(0xffe7c2);
      keyLight.intensity = 2.55;
      keyLight.position.set(1.6, 4.8, 2.2);
      keyLight.shadow.intensity = 0.95;

      rimLight.color.setHex(0xbae6fd);
      rimLight.intensity = 1.55;

      proSpotLight.color.setHex(0xfff0d4);
      proSpotLight.intensity = 6.5;
      proSpotLight.position.set(0.75, H - 0.1, 1.35);
      proSpotLight.target.position.set(0, H * 0.42, 0);

      // Warm champagne gold subtle studio accent strips
      neonTubeLeftMat.color.setHex(0xfef3c7);
      neonTubeLeftMat.emissive.setHex(0xd97706);
      neonTubeLeftMat.emissiveIntensity = 1.6;
      neonTubeRightMat.color.setHex(0xfef3c7);
      neonTubeRightMat.emissive.setHex(0xd97706);
      neonTubeRightMat.emissiveIntensity = 1.6;
      neonCoveMat.color.setHex(0xfde68a);
      neonCoveMat.emissive.setHex(0xb45309);
      neonCoveMat.emissiveIntensity = 0.95;
      spotLensMat.emissive.setHex(0xfff3d1);
      spotLensMat.emissiveIntensity = 3.5;

      neonLeftLight.color.setHex(0xf59e0b);
      neonLeftLight.intensity = 1.1;
      neonRightLight.color.setHex(0xf59e0b);
      neonRightLight.intensity = 1.1;
      neonCoveLight.intensity = 0;

      if (softboxLeft) {
        softboxLeft.color.setHex(0xffe6bd);
        softboxLeft.intensity = 3.6;
      }
      if (softboxRight) {
        softboxRight.color.setHex(0xcbe0ff);
        softboxRight.intensity = 1.6;
      }
    }
  }

  function updateClearanceColor(
    analysis: ClearanceAnalysis,
    preset: LightingPreset,
    enforceMinClearance: boolean
  ): void {
    if (!enforceMinClearance) {
      clearanceRingMat.color.setHex(0x94a3b8);
      clearanceRingMat.opacity = 0.36;
      return;
    }
    clearanceRingMat.opacity = 0.72;
    if (analysis.status === 'optimal') {
      clearanceRingMat.color.setHex(
        preset === 'mood-neon'
          ? 0x22d3ee
          : preset === 'cyber-pulse'
            ? 0x10b981
            : preset === 'sunset-flow'
              ? 0xfb923c
              : 0x0f766e
      );
    } else if (analysis.status === 'caution') {
      clearanceRingMat.color.setHex(0xf59e0b);
    } else {
      clearanceRingMat.color.setHex(0xef4444);
    }
  }

  function update(
    config: PoleRigConfig,
    arTransparentMode: boolean,
    renderer: THREE.WebGLRenderer,
    poleMarkers?: FloorPoleMarker[],
    dragBoundaryState?: { active: boolean; hitWall: boolean; activeMount: BaseMountId },
    roomReplica?: RoomReplicaScene | null,
    showInferredObjects = true
  ): void {
    const W = config.roomWidthM;
    const D = config.roomDepthM;
    const H = config.ceilingHeightCm / 100;

    if (arTransparentMode) {
      group.visible = false;
      scene.background = null;
      scene.fog = null;
      return;
    }

    const isReplica = config.environment === 'replica' && Boolean(roomReplica);

    group.visible = true;
    applyLightingPreset(config.environment, config.lighting, H, W, D, renderer);

    // Floor scale & material/plank/tile tiling (respects scanned replica material & color!)
    floorMesh.scale.set(W, D, 1);
    if (isReplica && roomReplica) {
      const matKind = roomReplica.floorMaterial;
      if (matKind === 'wood-light' || matKind === 'wood-dark') {
        const activeWood =
          matKind === 'wood-dark' ? textures.homeWoodAlbedo : textures.studioWoodAlbedo;
        floorMat.map = activeWood;
        floorMat.bumpMap = textures.woodBump;
        floorMat.bumpScale = 0.0045;
        floorMat.color.set(roomReplica.floorColor).lerp(new THREE.Color(0xffffff), 0.45);
        floorMat.roughness = 0.48;
        floorMat.metalness = 0.04;
        activeWood.repeat.set(Math.max(2, W * 0.95), Math.max(2, D * 0.95));
        textures.woodBump.repeat.set(Math.max(2, W * 0.95), Math.max(2, D * 0.95));
      } else if (matKind === 'tile') {
        floorMat.map = textures.tileAlbedo;
        floorMat.bumpMap = textures.tileBump;
        floorMat.bumpScale = 0.003;
        floorMat.color.set(roomReplica.floorColor);
        floorMat.roughness = 0.24;
        floorMat.metalness = 0.05;
        textures.tileAlbedo.repeat.set(Math.max(1.5, W / 1.2), Math.max(1.5, D / 1.2));
        textures.tileBump.repeat.set(Math.max(1.5, W / 1.2), Math.max(1.5, D / 1.2));
      } else {
        floorMat.map = null;
        floorMat.bumpMap = null;
        floorMat.color.set(roomReplica.floorColor);
        floorMat.roughness = matKind === 'carpet' ? 0.94 : 0.78;
        floorMat.metalness = 0.02;
      }

      // Apply authentic scanned room colors per wall (blended subtly under dark mood presets so lighting still pops)
      const darkFactor = config.lighting === 'studio-daylight' ? 0 : 0.42;
      const darkTint = new THREE.Color(0x1a1c24);
      wallMat.color.set(roomReplica.wallColor).lerp(darkTint, darkFactor);
      leftWallMat.color
        .set(roomReplica.leftWallColor ?? roomReplica.wallColor)
        .lerp(darkTint, darkFactor);
      upperWallMat.color
        .set(roomReplica.upperWallColor ?? roomReplica.wallColor)
        .lerp(darkTint, darkFactor);
      ceilingSoffitMat.color.set(roomReplica.ceilingColor).lerp(darkTint, darkFactor);
      baseboardMat.color.set(roomReplica.trimColor).lerp(darkTint, darkFactor * 0.85);
    } else {
      const activeWood =
        config.environment === 'home' ? textures.homeWoodAlbedo : textures.studioWoodAlbedo;
      floorMat.map = activeWood;
      floorMat.bumpMap = textures.woodBump;
      floorMat.bumpScale = 0.0045;
      floorMat.color.setHex(0xffffff);
      floorMat.roughness =
        config.lighting === 'mood-neon' || config.lighting === 'cyber-pulse' ? 0.34 : 0.46;
      floorMat.metalness = 0.04;
      leftWallMat.color.copy(wallMat.color);
      activeWood.repeat.set(Math.max(2, W * 0.95), Math.max(2, D * 0.95));
      textures.woodBump.repeat.set(Math.max(2, W * 0.95), Math.max(2, D * 0.95));
    }
    floorMat.needsUpdate = true;

    // Compute safe vaulted ceiling slope from global room ceilingType (Flat vs Tilted/Vaulted)
    const isVaulted = config.ceilingType === 'vaulted';
    const vaultRad = computeEffectiveVaultRad(H, W, config.ceilingType, config.vaultAngleDeg);
    const cosV = Math.cos(vaultRad);
    const sinV = Math.sin(vaultRad);
    const tanV = Math.tan(vaultRad);
    const leftEaveH = H - (W / 2) * tanV;

    // Back wall (z = -D/2): morphs smoothly into a watertight sloped gable wall when vaulted
    const backPos = backWallGeo.attributes.position as THREE.BufferAttribute;
    const xLeftWallOuter = -W / 2 - 0.12;
    const xRightWallEdge = W / 2;
    const roofTopOffset = isVaulted ? 0.135 / cosV : 0.08;
    for (let i = 0; i < backPos.count; i++) {
      const ox = backWallOrigPos[i * 3];
      const oy = backWallOrigPos[i * 3 + 1];
      const oz = backWallOrigPos[i * 3 + 2];
      const wx = ox < 0 ? xLeftWallOuter : xRightWallEdge;
      const wy = oy < 0 ? 0 : Math.max(1.5, H + wx * tanV + roofTopOffset);
      backPos.setXYZ(i, wx, wy, oz);
    }
    backPos.needsUpdate = true;
    backWallGeo.computeVertexNormals();
    backWall.position.set(0, 0, -D / 2 - 0.06);

    const hasDistinctUpperWall =
      isReplica &&
      Boolean(roomReplica?.upperWallColor) &&
      roomReplica!.upperWallColor !== roomReplica!.wallColor &&
      !isVaulted;
    upperWallBand.visible = hasDistinctUpperWall;
    if (hasDistinctUpperWall) {
      const bandBaseY = Math.min(H * 0.62, 1.48);
      const bandH = Math.max(0.35, H - bandBaseY);
      upperWallBand.scale.set(W, bandH, 1);
      upperWallBand.position.set(0, bandBaseY + bandH / 2, -D / 2 + 0.005);
    }

    // Left wall terminates cleanly at exact left eave height under sloped ceiling
    const leftWallH = Math.max(1.5, leftEaveH + (isVaulted ? 0.13 / cosV : 0.08));
    leftWall.scale.set(1, leftWallH, D);
    leftWall.position.set(-W / 2 - 0.06, leftWallH / 2, 0);

    backBaseboard.scale.set(W, 1, 1);
    backBaseboard.position.set(0, 0.042, -D / 2 + 0.012);

    leftBaseboard.scale.set(1, 1, D);
    leftBaseboard.position.set(-W / 2 + 0.012, 0.042, 0);

    // Architectural Ceiling Soffit + Integrated Structural Timber Beam (zero protrusion!)
    const slopedSpanW = (W + 0.14) / cosV;
    const beamSpanW = (W - 0.04) / cosV;
    const slabNormalOffset = isVaulted ? 0.095 : 0.04;
    const beamNormalOffset = isVaulted ? 0.0275 : 0.008;

    ceilingSlab.scale.set(slopedSpanW, 1, D + 0.12);
    ceilingSlab.rotation.set(0, 0, vaultRad);
    ceilingSlab.position.set(
      -0.06 * cosV - slabNormalOffset * sinV,
      H + slabNormalOffset * cosV - 0.06 * sinV,
      -0.06
    );
    ceilingSlab.visible = true;

    ceilingBeam.scale.set(beamSpanW, 1, 1);
    ceilingBeam.rotation.set(0, 0, vaultRad);
    ceilingBeam.position.set(-beamNormalOffset * sinV, H + beamNormalOffset * cosV, 0);
    ceilingBeam.visible = !isReplica || isVaulted;

    // Recessed perimeter ceiling LED cove strips follow exact flat or vaulted ceiling angle
    const coveNormalOffset = isVaulted ? 0.042 : -0.018;
    coveBarBack.scale.set((W - 0.14) / cosV, 1, 1);
    coveBarBack.rotation.set(0, 0, vaultRad);
    coveBarBack.position.set(
      -coveNormalOffset * sinV,
      H + coveNormalOffset * cosV,
      -D / 2 + 0.025
    );
    coveBarBack.visible = !isReplica || config.lighting !== 'studio-daylight';

    coveBarLeft.scale.set(1, 1, D - 0.16);
    coveBarLeft.position.set(-W / 2 + 0.025, leftEaveH + (isVaulted ? 0.035 : -0.018), 0);
    coveBarLeft.visible = !isReplica || config.lighting !== 'studio-daylight';

    // Overhead black aluminum studio spotlight track tilts cleanly along sloped ceiling & scales for compact rooms
    const trackNormalOffset = isVaulted ? 0.035 : -0.02;
    const trackScaleX = Math.max(0.45, Math.min(1.0, (W - 0.36) / 2.1));
    trackRigGroup.scale.set(trackScaleX, 1, 1);
    trackRigGroup.rotation.set(0, 0, vaultRad);
    trackRigGroup.position.set(
      -trackNormalOffset * sinV,
      H + trackNormalOffset * cosV,
      Math.min(0.95, D * 0.32)
    );
    trackRigGroup.visible = !isReplica;

    // Studio feature wall (fluted acoustic wood slats on left wall + mirror + neon tubes)
    studioFeatureGroup.visible = config.environment === 'studio';
    if (config.environment === 'studio') {
      const slatSpanZ = Math.max(0.85, Math.min(2.4, D - 0.55));
      const slatHeight = Math.max(1.35, Math.min(H, leftEaveH) - 0.24);
      for (let i = 0; i < slatCount; i++) {
        const frac = i / (slatCount - 1) - 0.5;
        _dummy.position.set(-W / 2 + 0.022, slatHeight / 2 + 0.1, frac * slatSpanZ);
        _dummy.scale.set(1, slatHeight, 1);
        _dummy.rotation.set(0, 0, 0);
        _dummy.updateMatrix();
        slatInstanced.setMatrixAt(i, _dummy.matrix);
      }
      slatInstanced.instanceMatrix.needsUpdate = true;

      const mirrorScaleX = Math.max(0.38, Math.min(1.0, (W - 0.34) / 2.74));
      const mirrorMaxH = Math.min(H, H - 1.24 * mirrorScaleX * tanV) - 0.32;
      const mirrorScaleY = Math.max(0.55, Math.min(1.0, mirrorMaxH / 2.24));
      mirrorGroup.scale.set(mirrorScaleX, mirrorScaleY, 1);
      mirrorGroup.position.set(0, (2.24 * mirrorScaleY) / 2 + 0.14, -D / 2 + 0.016);

      floorNeonStrip.scale.set(Math.max(0.35, Math.min(1.0, (W - 0.28) / 2.68)), 1, 1);
      floorNeonStrip.position.set(0, 0.014, -D / 2 + 0.028);
    }

    // Home loft feature wall
    homeFeatureGroup.visible = config.environment === 'home';
    const homeScaleX = Math.max(0.55, Math.min(1.0, (W - 0.35) / 1.75));
    homeFeatureGroup.scale.set(homeScaleX, 1, 1);
    homeFeatureGroup.position.set(0, 0, -D / 2 + 0.22);

    // Scanned 3D Room Replica Furniture & Architectural Completion
    roomReplicaRig.update(roomReplica ?? null, isReplica, showInferredObjects);

    // Contact shadows, clearance safety rings & active-pole base ring
    const markers: FloorPoleMarker[] =
      poleMarkers && poleMarkers.length > 0
        ? poleMarkers
        : [{ x: 0, z: 0, mount: config.mount, isSelected: false }];

    const clearance = analyzeFloorClearance(W, D, config.mount, config.enforceMinClearance);
    updateClearanceColor(clearance, config.lighting, config.enforceMinClearance);

    const accentHex =
      config.lighting === 'mood-neon'
        ? 0x22d3ee
        : config.lighting === 'cyber-pulse'
          ? 0x10b981
          : config.lighting === 'sunset-flow'
            ? 0xfb7185
            : 0xd97706;

    selectionRingMesh.visible = false;
    for (let i = 0; i < MAX_POLES_IN_STUDIO; i++) {
      const m = markers[i];
      const sh = shadowPool[i];
      const cr = clearancePool[i];
      if (!m) {
        sh.visible = false;
        cr.visible = false;
        continue;
      }
      sh.visible = true;
      sh.position.set(m.x, 0.004, m.z);
      sh.scale.set(0.72, 0.72, 1);

      cr.visible = config.showClearanceRing;
      cr.position.set(m.x, 0.018, m.z);
      const rad = config.enforceMinClearance ? 1.25 : 0.45;
      cr.scale.set(rad * 2, rad * 2, 1);

      if (m.isSelected && (markers.length > 1 || dragBoundaryState?.active)) {
        selectionRingMesh.visible = true;
        selectionRingMesh.position.set(m.x, 0.012, m.z);
        selectionRingMesh.scale.set(1.0, 1.0, 1);
        selectionRingMat.color.setHex(dragBoundaryState?.hitWall ? 0xf59e0b : accentHex);
      }
    }

    // Safe floor drag perimeter boundary guide (shows exact wall clearance margin!)
    if (dragBoundaryState?.active) {
      const margin = getWallClearanceMarginM(
        dragBoundaryState.activeMount,
        config.enforceMinClearance
      );
      const safeSpanW = Math.max(0.15, W - margin * 2);
      const safeSpanD = Math.max(0.15, D - margin * 2);
      boundaryLine.visible = true;
      boundaryLine.scale.set(safeSpanW, 1, safeSpanD);
      boundaryLineMat.color.setHex(
        dragBoundaryState.hitWall
          ? 0xf59e0b
          : config.lighting === 'studio-daylight'
            ? 0x0f766e
            : accentHex
      );
    } else {
      boundaryLine.visible = false;
    }
  }

  return {
    group,
    update,
    dispose: () => {
      roomReplicaRig.dispose();
      group.traverse((obj) => {
        if (
          obj instanceof THREE.Mesh ||
          obj instanceof THREE.InstancedMesh ||
          obj instanceof THREE.Line
        ) {
          obj.geometry.dispose();
        }
      });
      floorMat.dispose();
      wallMat.dispose();
      leftWallMat.dispose();
      upperWallMat.dispose();
      ceilingSoffitMat.dispose();
      baseboardMat.dispose();
      woodSlatMat.dispose();
      trackMetalMat.dispose();
      mirrorGlassMat.dispose();
      neonTubeLeftMat.dispose();
      neonTubeRightMat.dispose();
      neonCoveMat.dispose();
      spotLensMat.dispose();
      contactShadowMat.dispose();
      clearanceRingMat.dispose();
      selectionRingMat.dispose();
      boundaryLineMat.dispose();
      apronMat.dispose();
      scene.remove(group);
      scene.remove(
        hemiLight,
        keyLight,
        proSpotLight,
        proSpotLight.target,
        rimLight,
        neonLeftLight,
        neonRightLight,
        neonCoveLight
      );
      if (softboxLeft) scene.remove(softboxLeft);
      if (softboxRight) scene.remove(softboxRight);
    },
  };
}
