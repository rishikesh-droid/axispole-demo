import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import type {
  BaseMountId,
  ClearanceAnalysis,
  EnvironmentPreset,
  LightingPreset,
  PoleRigConfig,
} from '../types/pole';
import {
  analyzeFloorClearance,
  getWallClearanceMarginM,
  MAX_POLES_IN_STUDIO,
} from '../utils/poleConfig';
import type { ProceduralTextureSet } from './proceduralTextures';

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
    dragBoundaryState?: { active: boolean; hitWall: boolean; activeMount: BaseMountId }
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
  keyLight.position.set(3.2, 4.6, 3.6);
  keyLight.castShadow = !isSoftwareGl;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 14;
  keyLight.shadow.camera.left = -3.4;
  keyLight.shadow.camera.right = 3.4;
  keyLight.shadow.camera.top = 4.0;
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

  // --- ARCHITECTURAL ENCLOSURE (Back Wall + Left Wall + Right Corner Wing + Ceiling Soffit) ---
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.12), wallMat);
  backWall.receiveShadow = true;
  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1, 1), wallMat);
  leftWall.receiveShadow = true;
  const backBaseboard = new THREE.Mesh(new THREE.BoxGeometry(1, 0.085, 0.025), baseboardMat);
  const leftBaseboard = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.085, 1), baseboardMat);
  group.add(backWall, leftWall, backBaseboard, leftBaseboard);

  // Recessed Architectural Ceiling Soffit + Structural Joist Header (cleanly integrated, never sticking out!)
  const ceilingSlab = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 1), ceilingSoffitMat);
  const ceilingBeam = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 0.14), woodSlatMat);
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
    neonLeftLight.position.set(-1.35, H * 0.52, -D / 2 + 0.45);
    neonRightLight.position.set(1.35, H * 0.52, -D / 2 + 0.45);
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

  function updateClearanceColor(analysis: ClearanceAnalysis, preset: LightingPreset): void {
    if (analysis.status === 'optimal') {
      clearanceRingMat.color.setHex(preset === 'mood-neon' ? 0x22d3ee : 0x0f766e);
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
    dragBoundaryState?: { active: boolean; hitWall: boolean; activeMount: BaseMountId }
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

    group.visible = true;
    applyLightingPreset(config.environment, config.lighting, H, W, D, renderer);

    // Floor scale & wood plank tiling
    floorMesh.scale.set(W, D, 1);
    const activeWood =
      config.environment === 'home' ? textures.homeWoodAlbedo : textures.studioWoodAlbedo;
    floorMat.map = activeWood;
    floorMat.roughness = config.lighting === 'mood-neon' ? 0.34 : 0.48;
    activeWood.repeat.set(Math.max(2, W * 0.95), Math.max(2, D * 0.95));
    textures.woodBump.repeat.set(Math.max(2, W * 0.95), Math.max(2, D * 0.95));
    floorMat.needsUpdate = true;

    // Back wall (z = -D/2) & Left wall (x = -W/2) cleanly joined at corner
    backWall.scale.set(W + 0.12, H + 0.08, 1);
    backWall.position.set(-0.06, (H + 0.08) / 2, -D / 2 - 0.06);

    leftWall.scale.set(1, H + 0.08, D);
    leftWall.position.set(-W / 2 - 0.06, (H + 0.08) / 2, 0);

    backBaseboard.scale.set(W, 1, 1);
    backBaseboard.position.set(0, 0.042, -D / 2 + 0.012);

    leftBaseboard.scale.set(1, 1, D);
    leftBaseboard.position.set(-W / 2 + 0.012, 0.042, 0);

    // Architectural Ceiling Soffit (matches exact room footprint; no protruding beam!)
    ceilingSlab.scale.set(W + 0.12, 1, D + 0.12);
    ceilingSlab.position.set(-0.06, H + 0.04, -0.06);
    ceilingSlab.visible = config.mount !== 'stage-podium';

    ceilingBeam.scale.set(W - 0.04, 1, 1);
    ceilingBeam.position.set(0, H - 0.025, 0);
    ceilingBeam.rotation.z =
      config.mount === 'vaulted-beam' ? THREE.MathUtils.degToRad(config.vaultAngleDeg) : 0;
    ceilingBeam.visible = config.mount !== 'stage-podium';

    // Recessed perimeter ceiling LED cove strips
    coveBarBack.scale.set(W - 0.16, 1, 1);
    coveBarBack.position.set(0, H - 0.018, -D / 2 + 0.025);
    coveBarLeft.scale.set(1, 1, D - 0.16);
    coveBarLeft.position.set(-W / 2 + 0.025, H - 0.018, 0);

    // Overhead black aluminum studio spotlight track
    trackRigGroup.position.set(0, H - 0.02, 0.95);
    trackRigGroup.visible = config.mount !== 'stage-podium';

    // Studio feature wall (fluted acoustic wood slats on left wall + mirror + neon tubes)
    studioFeatureGroup.visible = config.environment === 'studio';
    if (config.environment === 'studio') {
      const slatSpanZ = Math.min(2.4, D - 0.7);
      const slatHeight = Math.max(1.8, H - 0.24);
      for (let i = 0; i < slatCount; i++) {
        const frac = i / (slatCount - 1) - 0.5;
        _dummy.position.set(-W / 2 + 0.022, slatHeight / 2 + 0.1, frac * slatSpanZ);
        _dummy.scale.set(1, slatHeight, 1);
        _dummy.rotation.set(0, 0, 0);
        _dummy.updateMatrix();
        slatInstanced.setMatrixAt(i, _dummy.matrix);
      }
      slatInstanced.instanceMatrix.needsUpdate = true;

      const mirrorScaleY = Math.min(1.0, (H - 0.35) / 2.24);
      mirrorGroup.scale.set(1, mirrorScaleY, 1);
      mirrorGroup.position.set(0, (2.24 * mirrorScaleY) / 2 + 0.14, -D / 2 + 0.016);

      floorNeonStrip.position.set(0, 0.014, -D / 2 + 0.028);
    }

    // Home loft feature wall
    homeFeatureGroup.visible = config.environment === 'home';
    homeFeatureGroup.position.set(0, 0, -D / 2 + 0.22);

    // Contact shadows, clearance safety rings & active-pole base ring
    const markers: FloorPoleMarker[] =
      poleMarkers && poleMarkers.length > 0
        ? poleMarkers
        : [{ x: 0, z: 0, mount: config.mount, isSelected: false }];

    const clearance = analyzeFloorClearance(W, D, config.mount);
    updateClearanceColor(clearance, config.lighting);

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
      const shadowScale = m.mount === 'stage-podium' ? 2.15 : 0.72;
      sh.scale.set(shadowScale, shadowScale, 1);

      cr.visible = config.showClearanceRing;
      cr.position.set(m.x, 0.018, m.z);
      const rad = m.mount === 'stage-podium' ? 1.65 : 1.5;
      cr.scale.set(rad * 2, rad * 2, 1);

      if (m.isSelected && (markers.length > 1 || dragBoundaryState?.active)) {
        selectionRingMesh.visible = true;
        selectionRingMesh.position.set(m.x, 0.012, m.z);
        const selScale = m.mount === 'stage-podium' ? 4.4 : 1.0;
        selectionRingMesh.scale.set(selScale, selScale, 1);
        selectionRingMat.color.setHex(
          dragBoundaryState?.hitWall
            ? 0xf59e0b
            : config.lighting === 'mood-neon'
              ? 0x22d3ee
              : 0xd97706
        );
      }
    }

    // Safe floor drag perimeter boundary guide (shows exact min-room wall clearance margin!)
    if (dragBoundaryState?.active) {
      const margin = getWallClearanceMarginM(dragBoundaryState.activeMount);
      const safeSpanW = Math.max(0.15, W - margin * 2);
      const safeSpanD = Math.max(0.15, D - margin * 2);
      boundaryLine.visible = true;
      boundaryLine.scale.set(safeSpanW, 1, safeSpanD);
      boundaryLineMat.color.setHex(
        dragBoundaryState.hitWall
          ? 0xf59e0b
          : config.lighting === 'mood-neon'
            ? 0x22d3ee
            : 0x0f766e
      );
    } else {
      boundaryLine.visible = false;
    }
  }

  return {
    group,
    update,
    dispose: () => {
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
