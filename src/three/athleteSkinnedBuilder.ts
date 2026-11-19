import * as THREE from 'three';
import { evaluatePerformanceTimeline } from '../utils/poleConfig';

export interface SkinnedAthleteHandle {
  root: THREE.Group;
  updatePerformance: (
    timeSec: number,
    poleCenterX: number,
    poleCenterZ: number,
    poleRadiusM: number,
    poleFloorOffsetY: number,
    isActive: boolean,
    dt: number
  ) => {
    phase: string;
    phaseLabel: string;
    spinBoostRadPerSec: number;
    cameraAnchor: THREE.Vector3;
    cameraLookAt: THREE.Vector3;
  };
  dispose: () => void;
}

interface LoftRing {
  y: number;
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  shape?: (angle: number, rx: number, rz: number) => { x: number; z: number };
  bones: [number, number][];
  matGroup: 0 | 1;
}

function createSkinAndFaceTextures(): {
  skinMap: THREE.CanvasTexture;
  faceMap: THREE.CanvasTexture;
  fabricBump: THREE.CanvasTexture;
  hairMap: THREE.CanvasTexture;
} {
  // 1. Rich warm natural athletic skin texture with subtle studio shading (no blown-out pale look)
  const skinCanvas = document.createElement('canvas');
  skinCanvas.width = 256;
  skinCanvas.height = 256;
  const sctx = skinCanvas.getContext('2d')!;
  const sGrad = sctx.createLinearGradient(0, 0, 0, 256);
  sGrad.addColorStop(0, '#c68c6e');
  sGrad.addColorStop(0.5, '#bf8466');
  sGrad.addColorStop(1, '#b5795b');
  sctx.fillStyle = sGrad;
  sctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2000; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const alpha = 0.018 + Math.random() * 0.022;
    sctx.fillStyle = Math.random() > 0.5 ? `rgba(240,198,172,${alpha})` : `rgba(122,68,48,${alpha})`;
    sctx.fillRect(x, y, 2, 2);
  }
  const skinMap = new THREE.CanvasTexture(skinCanvas);
  skinMap.colorSpace = THREE.SRGBColorSpace;
  skinMap.wrapS = skinMap.wrapT = THREE.RepeatWrapping;

  // 2. Refined studio portrait face texture (smooth seamless skin tones, natural brows/eyes/lips)
  // On SphereGeometry, +Z faces phi = PI/2 -> u = 0.25 -> x = 128 in 512px canvas
  const faceCanvas = document.createElement('canvas');
  faceCanvas.width = 512;
  faceCanvas.height = 512;
  const fctx = faceCanvas.getContext('2d')!;
  fctx.fillStyle = '#c28769';
  fctx.fillRect(0, 0, 512, 512);

  const cx = 128;
  // Soft center face illumination & warm jawline contour
  const faceGlow = fctx.createRadialGradient(cx, 248, 10, cx, 258, 92);
  faceGlow.addColorStop(0, 'rgba(222, 168, 138, 0.42)');
  faceGlow.addColorStop(0.65, 'rgba(194, 135, 105, 0.05)');
  faceGlow.addColorStop(1, 'rgba(135, 82, 58, 0.24)');
  fctx.fillStyle = faceGlow;
  fctx.fillRect(0, 0, 512, 512);

  // Subtle cheekbone warmth
  for (const dx of [-30, 30]) {
    const blush = fctx.createRadialGradient(cx + dx, 276, 2, cx + dx, 276, 22);
    blush.addColorStop(0, 'rgba(178, 96, 84, 0.24)');
    blush.addColorStop(1, 'rgba(178, 96, 84, 0)');
    fctx.fillStyle = blush;
    fctx.beginPath();
    fctx.arc(cx + dx, 276, 22, 0, Math.PI * 2);
    fctx.fill();
  }

  // Sculpted natural eyebrows
  fctx.strokeStyle = '#36221a';
  fctx.lineWidth = 2.8;
  fctx.lineCap = 'round';
  fctx.beginPath();
  fctx.moveTo(cx - 35, 226);
  fctx.quadraticCurveTo(cx - 22, 219, cx - 9, 224);
  fctx.stroke();

  fctx.beginPath();
  fctx.moveTo(cx + 9, 224);
  fctx.quadraticCurveTo(cx + 22, 219, cx + 35, 226);
  fctx.stroke();

  // Natural poised almond eyes with subtle studio catchlight
  for (const side of [-1, 1]) {
    const ex = cx + side * 21;
    const ey = 244;
    fctx.strokeStyle = 'rgba(116, 68, 48, 0.45)';
    fctx.lineWidth = 1.4;
    fctx.beginPath();
    fctx.moveTo(ex - 10, ey - 5);
    fctx.quadraticCurveTo(ex, ey - 9, ex + 10, ey - 5);
    fctx.stroke();

    fctx.fillStyle = '#ece3de';
    fctx.beginPath();
    fctx.ellipse(ex, ey, 8.8, 4.2, 0, 0, Math.PI * 2);
    fctx.fill();

    fctx.fillStyle = '#3f271b';
    fctx.beginPath();
    fctx.arc(ex, ey, 3.9, 0, Math.PI * 2);
    fctx.fill();

    fctx.fillStyle = '#120a07';
    fctx.beginPath();
    fctx.arc(ex, ey, 2.0, 0, Math.PI * 2);
    fctx.fill();

    fctx.fillStyle = 'rgba(255,255,255,0.85)';
    fctx.beginPath();
    fctx.arc(ex + 1.3, ey - 1.2, 1.0, 0, Math.PI * 2);
    fctx.fill();

    fctx.strokeStyle = '#22140f';
    fctx.lineWidth = 2.2;
    fctx.beginPath();
    fctx.moveTo(ex - 9.5, ey + 0.5);
    fctx.quadraticCurveTo(ex, ey - 5.8, ex + 9.5, ey + 0.5);
    fctx.stroke();
  }

  // Soft nose contour
  fctx.fillStyle = 'rgba(232, 184, 158, 0.3)';
  fctx.beginPath();
  fctx.ellipse(cx, 263, 2.8, 14, 0, 0, Math.PI * 2);
  fctx.fill();
  fctx.fillStyle = 'rgba(122, 72, 52, 0.28)';
  fctx.beginPath();
  fctx.ellipse(cx, 281, 6.8, 2.8, 0, 0, Math.PI * 2);
  fctx.fill();

  // Warm terracotta-rose natural lips
  fctx.fillStyle = '#9e574e';
  fctx.beginPath();
  fctx.moveTo(cx - 14, 304);
  fctx.quadraticCurveTo(cx - 5, 299, cx, 302);
  fctx.quadraticCurveTo(cx + 5, 299, cx + 14, 304);
  fctx.quadraticCurveTo(cx, 313, cx - 14, 304);
  fctx.fill();

  fctx.strokeStyle = 'rgba(98, 44, 38, 0.5)';
  fctx.lineWidth = 1.0;
  fctx.beginPath();
  fctx.moveTo(cx - 13, 304);
  fctx.quadraticCurveTo(cx, 305.5, cx + 13, 304);
  fctx.stroke();

  const faceMap = new THREE.CanvasTexture(faceCanvas);
  faceMap.colorSpace = THREE.SRGBColorSpace;

  // 3. Ribbed athletic fabric micro-bump texture
  const fabCanvas = document.createElement('canvas');
  fabCanvas.width = 128;
  fabCanvas.height = 128;
  const bctx = fabCanvas.getContext('2d')!;
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, 128, 128);
  for (let x = 0; x < 128; x += 4) {
    bctx.fillStyle = '#989898';
    bctx.fillRect(x, 0, 2, 128);
  }
  const fabricBump = new THREE.CanvasTexture(fabCanvas);
  fabricBump.wrapS = fabricBump.wrapT = THREE.RepeatWrapping;
  fabricBump.repeat.set(6, 6);

  // 4. Glossy dark espresso-chestnut hair texture
  const hairCanvas = document.createElement('canvas');
  hairCanvas.width = 256;
  hairCanvas.height = 256;
  const hctx = hairCanvas.getContext('2d')!;
  hctx.fillStyle = '#1f1410';
  hctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 480; i++) {
    const x = Math.random() * 256;
    const tone = 26 + Math.floor(Math.random() * 40);
    hctx.strokeStyle = `rgba(${tone + 18}, ${tone + 5}, ${tone - 1}, 0.58)`;
    hctx.lineWidth = 1 + Math.random() * 1.4;
    hctx.beginPath();
    hctx.moveTo(x, 0);
    hctx.lineTo(x + (Math.random() - 0.5) * 5, 256);
    hctx.stroke();
  }
  const hairMap = new THREE.CanvasTexture(hairCanvas);
  hairMap.colorSpace = THREE.SRGBColorSpace;
  hairMap.wrapS = hairMap.wrapT = THREE.RepeatWrapping;

  return { skinMap, faceMap, fabricBump, hairMap };
}

function buildUnifiedAnatomicalGeometry(lofts: LoftRing[][], radialSegs = 26): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  const indicesSkin: number[] = [];
  const indicesCloth: number[] = [];

  let vertexOffset = 0;

  for (const rings of lofts) {
    for (let r = 0; r < rings.length; r++) {
      const ring = rings[r];
      const v = r / Math.max(1, rings.length - 1);

      const bIdx = [0, 0, 0, 0];
      const bWgt = [0, 0, 0, 0];
      let sumW = 0;
      for (let k = 0; k < Math.min(4, ring.bones.length); k++) {
        bIdx[k] = ring.bones[k][0];
        bWgt[k] = ring.bones[k][1];
        sumW += ring.bones[k][1];
      }
      if (sumW > 0) {
        for (let k = 0; k < 4; k++) bWgt[k] /= sumW;
      } else {
        bWgt[0] = 1;
      }

      for (let s = 0; s <= radialSegs; s++) {
        const u = s / radialSegs;
        const angle = u * Math.PI * 2;
        let lx = Math.cos(angle) * ring.rx;
        let lz = Math.sin(angle) * ring.rz;
        if (ring.shape) {
          const shaped = ring.shape(angle, ring.rx, ring.rz);
          lx = shaped.x;
          lz = shaped.z;
        }
        positions.push(ring.cx + lx, ring.y, ring.cz + lz);
        uvs.push(u, v);
        skinIndices.push(bIdx[0], bIdx[1], bIdx[2], bIdx[3]);
        skinWeights.push(bWgt[0], bWgt[1], bWgt[2], bWgt[3]);
      }
    }

    const stride = radialSegs + 1;
    for (let r = 0; r < rings.length - 1; r++) {
      const isCloth = rings[r].matGroup === 1 && rings[r + 1].matGroup === 1;
      const targetIndices = isCloth ? indicesCloth : indicesSkin;
      for (let s = 0; s < radialSegs; s++) {
        const a = vertexOffset + r * stride + s;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        targetIndices.push(a, c, b);
        targetIndices.push(b, c, d);
      }
    }

    const firstRing = rings[0];
    const lastRing = rings[rings.length - 1];
    const firstCenterIdx = positions.length / 3;
    positions.push(firstRing.cx, firstRing.y, firstRing.cz);
    uvs.push(0.5, 0);
    skinIndices.push(firstRing.bones[0][0], 0, 0, 0);
    skinWeights.push(1, 0, 0, 0);
    const capFirstTarget = firstRing.matGroup === 1 ? indicesCloth : indicesSkin;
    for (let s = 0; s < radialSegs; s++) {
      capFirstTarget.push(firstCenterIdx, vertexOffset + s, vertexOffset + s + 1);
    }

    const lastRowStart = vertexOffset + (rings.length - 1) * stride;
    const lastCenterIdx = positions.length / 3;
    positions.push(lastRing.cx, lastRing.y, lastRing.cz);
    uvs.push(0.5, 1);
    skinIndices.push(lastRing.bones[0][0], 0, 0, 0);
    skinWeights.push(1, 0, 0, 0);
    const capLastTarget = lastRing.matGroup === 1 ? indicesCloth : indicesSkin;
    for (let s = 0; s < radialSegs; s++) {
      capLastTarget.push(lastCenterIdx, lastRowStart + s + 1, lastRowStart + s);
    }

    vertexOffset = positions.length / 3;
  }

  const allIndices = [...indicesSkin, ...indicesCloth];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  geo.setIndex(allIndices);
  geo.addGroup(0, indicesSkin.length, 0);
  geo.addGroup(indicesSkin.length, indicesCloth.length, 1);
  geo.computeVertexNormals();
  return geo;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function createSkinnedAthlete(): SkinnedAthleteHandle {
  const root = new THREE.Group();
  root.name = 'AxisPole_SkinnedAthlete';
  root.userData.excludeFromExport = true;
  root.visible = false;

  const { skinMap, faceMap, fabricBump, hairMap } = createSkinAndFaceTextures();

  // Warm Natural Studio Skin PBR Material
  const skinMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: skinMap,
    roughness: 0.62,
    metalness: 0.0,
    sheen: 0.22,
    sheenRoughness: 0.72,
    sheenColor: new THREE.Color(0xeba184),
    clearcoat: 0.05,
    clearcoatRoughness: 0.6,
    envMapIntensity: 0.75,
  });

  // Luxury Studio Matte Plum-Obsidian Activewear
  const activewearMat = new THREE.MeshPhysicalMaterial({
    color: 0x221b27,
    roughness: 0.74,
    metalness: 0.04,
    bumpMap: fabricBump,
    bumpScale: 0.0018,
    sheen: 0.38,
    sheenRoughness: 0.58,
    sheenColor: new THREE.Color(0x7c6290),
    envMapIntensity: 0.72,
  });

  const faceMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: faceMap,
    roughness: 0.6,
    metalness: 0.0,
    sheen: 0.2,
    sheenRoughness: 0.72,
    sheenColor: new THREE.Color(0xeba184),
    clearcoat: 0.04,
    clearcoatRoughness: 0.62,
    envMapIntensity: 0.75,
  });

  const hairMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: hairMap,
    roughness: 0.34,
    metalness: 0.08,
    sheen: 0.48,
    sheenRoughness: 0.42,
    sheenColor: new THREE.Color(0x6b4534),
    clearcoat: 0.2,
    clearcoatRoughness: 0.38,
  });

  // --- 1. ANATOMICAL SKELETON (1.68m Realistic Female Proportions) ---
  const pelvis = new THREE.Bone();
  pelvis.name = 'Pelvis';
  pelvis.position.set(0, 0.9, 0);

  const spineLower = new THREE.Bone();
  spineLower.name = 'SpineLower';
  spineLower.position.set(0, 0.13, 0);
  pelvis.add(spineLower);

  const spineUpper = new THREE.Bone();
  spineUpper.name = 'SpineUpper';
  spineUpper.position.set(0, 0.15, 0);
  spineLower.add(spineUpper);

  const chest = new THREE.Bone();
  chest.name = 'Chest';
  chest.position.set(0, 0.14, 0);
  spineUpper.add(chest);

  const neck = new THREE.Bone();
  neck.name = 'Neck';
  neck.position.set(0, 0.1, 0);
  chest.add(neck);

  const head = new THREE.Bone();
  head.name = 'Head';
  head.position.set(0, 0.085, 0.008);
  neck.add(head);

  // Left arm (+X)
  const upperArmL = new THREE.Bone();
  upperArmL.name = 'UpperArmL';
  upperArmL.position.set(0.168, 0.035, 0);
  chest.add(upperArmL);

  const forearmL = new THREE.Bone();
  forearmL.name = 'ForearmL';
  forearmL.position.set(0.018, -0.275, 0);
  upperArmL.add(forearmL);

  const handL = new THREE.Bone();
  handL.name = 'HandL';
  handL.position.set(0.01, -0.235, 0);
  forearmL.add(handL);

  // Right arm (-X)
  const upperArmR = new THREE.Bone();
  upperArmR.name = 'UpperArmR';
  upperArmR.position.set(-0.168, 0.035, 0);
  chest.add(upperArmR);

  const forearmR = new THREE.Bone();
  forearmR.name = 'ForearmR';
  forearmR.position.set(-0.018, -0.275, 0);
  upperArmR.add(forearmR);

  const handR = new THREE.Bone();
  handR.name = 'HandR';
  handR.position.set(-0.01, -0.235, 0);
  forearmR.add(handR);

  // Left leg (+X)
  const thighL = new THREE.Bone();
  thighL.name = 'ThighL';
  thighL.position.set(0.09, -0.01, 0);
  pelvis.add(thighL);

  const shinL = new THREE.Bone();
  shinL.name = 'ShinL';
  shinL.position.set(0, -0.41, 0);
  thighL.add(shinL);

  const footL = new THREE.Bone();
  footL.name = 'FootL';
  footL.position.set(0, -0.405, 0);
  shinL.add(footL);

  // Right leg (-X)
  const thighR = new THREE.Bone();
  thighR.name = 'ThighR';
  thighR.position.set(-0.09, -0.01, 0);
  pelvis.add(thighR);

  const shinR = new THREE.Bone();
  shinR.name = 'ShinR';
  shinR.position.set(0, -0.41, 0);
  thighR.add(shinR);

  const footR = new THREE.Bone();
  footR.name = 'FootR';
  footR.position.set(0, -0.405, 0);
  shinR.add(footR);

  const bones: THREE.Bone[] = [
    pelvis,
    spineLower,
    spineUpper,
    chest,
    neck,
    head,
    upperArmL,
    forearmL,
    handL,
    upperArmR,
    forearmR,
    handR,
    thighL,
    shinL,
    footL,
    thighR,
    shinR,
    footR,
  ];

  // --- 2. CONTINUOUS ANATOMICAL BODY LOFTS (Zero Shoulder/Cloth Clipping!) ---
  const gluteShape = (angle: number, rx: number, rz: number) => {
    const s = Math.sin(angle);
    const c = Math.cos(angle);
    const backFullness = s < 0 ? 1 + 0.24 * Math.pow(-s, 1.5) * (0.65 + 0.35 * Math.cos(2 * angle)) : 1;
    const frontSoft = s > 0 ? 0.92 : 1;
    return { x: c * rx, z: s * rz * backFullness * frontSoft };
  };

  const bustShape = (amount: number) => (angle: number, rx: number, rz: number) => {
    const s = Math.sin(angle);
    const c = Math.cos(angle);
    const frontProj =
      s > 0.1
        ? amount * Math.pow(s, 1.6) * (0.55 + 0.45 * Math.sin(Math.min(Math.PI, Math.abs(c) * 3.1)))
        : 0;
    const backFurrow = s < -0.7 ? -0.008 * Math.pow(-s, 3) : 0;
    return { x: c * rx, z: s * rz + frontProj + backFurrow };
  };

  // Torso narrows cleanly at upper chest (`rx = 0.132`) so deltoids (`cx = 0.168`) NEVER clip cloth!
  const torsoRings: LoftRing[] = [
    { y: 0.815, cx: 0, cz: -0.005, rx: 0.146, rz: 0.098, shape: gluteShape, bones: [[0, 1]], matGroup: 1 },
    { y: 0.875, cx: 0, cz: -0.01, rx: 0.164, rz: 0.11, shape: gluteShape, bones: [[0, 1]], matGroup: 1 },
    { y: 0.94, cx: 0, cz: -0.006, rx: 0.154, rz: 0.102, shape: gluteShape, bones: [[0, 0.85], [1, 0.15]], matGroup: 1 },
    { y: 0.99, cx: 0, cz: 0.0, rx: 0.13, rz: 0.088, bones: [[0, 0.45], [1, 0.55]], matGroup: 1 },
    { y: 1.005, cx: 0, cz: 0.002, rx: 0.122, rz: 0.084, bones: [[0, 0.3], [1, 0.7]], matGroup: 0 },
    { y: 1.06, cx: 0, cz: 0.005, rx: 0.112, rz: 0.081, bones: [[1, 0.85], [2, 0.15]], matGroup: 0 },
    { y: 1.12, cx: 0, cz: 0.006, rx: 0.12, rz: 0.087, bones: [[1, 0.35], [2, 0.65]], matGroup: 0 },
    // Fitted studio sports top (ends cleanly below armpit line so shoulders are 100% skin!)
    { y: 1.155, cx: 0, cz: 0.005, rx: 0.13, rz: 0.094, shape: bustShape(0.014), bones: [[2, 0.85], [3, 0.15]], matGroup: 1 },
    { y: 1.215, cx: 0, cz: 0.004, rx: 0.138, rz: 0.099, shape: bustShape(0.036), bones: [[2, 0.45], [3, 0.55]], matGroup: 1 },
    { y: 1.265, cx: 0, cz: 0.002, rx: 0.138, rz: 0.097, shape: bustShape(0.028), bones: [[2, 0.15], [3, 0.85]], matGroup: 1 },
    { y: 1.305, cx: 0, cz: 0.0, rx: 0.135, rz: 0.089, shape: bustShape(0.008), bones: [[3, 1]], matGroup: 1 },
    // Smooth collarbone & trapezius slope (skin)
    { y: 1.325, cx: 0, cz: 0.0, rx: 0.138, rz: 0.082, bones: [[3, 1]], matGroup: 0 },
    { y: 1.375, cx: 0, cz: -0.002, rx: 0.134, rz: 0.072, bones: [[3, 0.88], [4, 0.12]], matGroup: 0 },
    { y: 1.415, cx: 0, cz: -0.002, rx: 0.06, rz: 0.052, bones: [[3, 0.35], [4, 0.65]], matGroup: 0 },
    // Sleek proportioned neck
    { y: 1.455, cx: 0, cz: 0.002, rx: 0.044, rz: 0.046, bones: [[4, 0.85], [5, 0.15]], matGroup: 0 },
    { y: 1.505, cx: 0, cz: 0.005, rx: 0.042, rz: 0.045, bones: [[4, 0.3], [5, 0.7]], matGroup: 0 },
  ];

  // Clean sculpted halter-top straps parented directly to Chest bone so they sit flush over shoulders
  for (const side of [-1, 1]) {
    const strapCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.078, -0.022, 0.088),
      new THREE.Vector3(side * 0.088, 0.045, 0.064),
      new THREE.Vector3(side * 0.086, 0.068, 0.005),
      new THREE.Vector3(side * 0.068, 0.04, -0.066),
      new THREE.Vector3(side * 0.056, -0.025, -0.082),
    ]);
    const strapGeo = new THREE.TubeGeometry(strapCurve, 14, 0.0085, 8, false);
    const strapMesh = new THREE.Mesh(strapGeo, activewearMat);
    chest.add(strapMesh);
  }

  const buildLegRings = (side: 1 | -1): LoftRing[] => {
    const bx = side * 0.09;
    const thighIdx = side === 1 ? 12 : 15;
    const shinIdx = side === 1 ? 13 : 16;
    const footIdx = side === 1 ? 14 : 17;

    return [
      { y: 0.91, cx: bx * 0.92, cz: -0.004, rx: 0.081, rz: 0.086, bones: [[0, 0.72], [thighIdx, 0.28]], matGroup: 1 },
      { y: 0.84, cx: bx, cz: -0.004, rx: 0.079, rz: 0.082, bones: [[0, 0.32], [thighIdx, 0.68]], matGroup: 1 },
      { y: 0.785, cx: bx, cz: -0.002, rx: 0.075, rz: 0.078, bones: [[0, 0.1], [thighIdx, 0.9]], matGroup: 1 },
      { y: 0.77, cx: bx, cz: 0.0, rx: 0.073, rz: 0.075, bones: [[thighIdx, 1]], matGroup: 0 },
      { y: 0.67, cx: bx, cz: 0.004, rx: 0.067, rz: 0.07, bones: [[thighIdx, 1]], matGroup: 0 },
      { y: 0.56, cx: bx, cz: 0.002, rx: 0.055, rz: 0.058, bones: [[thighIdx, 0.88], [shinIdx, 0.12]], matGroup: 0 },
      { y: 0.48, cx: bx, cz: 0.004, rx: 0.049, rz: 0.053, bones: [[thighIdx, 0.48], [shinIdx, 0.52]], matGroup: 0 },
      { y: 0.42, cx: bx, cz: -0.002, rx: 0.047, rz: 0.051, bones: [[thighIdx, 0.12], [shinIdx, 0.88]], matGroup: 0 },
      { y: 0.34, cx: bx, cz: -0.008, rx: 0.05, rz: 0.055, bones: [[shinIdx, 1]], matGroup: 0 },
      { y: 0.23, cx: bx, cz: -0.005, rx: 0.04, rz: 0.044, bones: [[shinIdx, 1]], matGroup: 0 },
      { y: 0.115, cx: bx, cz: -0.002, rx: 0.031, rz: 0.035, bones: [[shinIdx, 0.78], [footIdx, 0.22]], matGroup: 0 },
      { y: 0.072, cx: bx, cz: 0.004, rx: 0.03, rz: 0.037, bones: [[shinIdx, 0.25], [footIdx, 0.75]], matGroup: 0 },
      { y: 0.042, cx: bx, cz: 0.038, rx: 0.033, rz: 0.055, bones: [[footIdx, 1]], matGroup: 0 },
      { y: 0.016, cx: bx, cz: 0.072, rx: 0.032, rz: 0.045, bones: [[footIdx, 1]], matGroup: 0 },
      { y: 0.006, cx: bx, cz: 0.112, rx: 0.024, rz: 0.017, bones: [[footIdx, 1]], matGroup: 0 },
    ];
  };

  const buildArmRings = (side: 1 | -1): LoftRing[] => {
    const upperIdx = side === 1 ? 6 : 9;
    const foreIdx = side === 1 ? 7 : 10;
    const handIdx = side === 1 ? 8 : 11;

    return [
      // Rounded sculpted deltoid cap blending seamlessly outside upper chest (zero cloth clipping!)
      { y: 1.385, cx: side * 0.144, cz: 0, rx: 0.04, rz: 0.042, bones: [[3, 0.6], [upperIdx, 0.4]], matGroup: 0 },
      { y: 1.36, cx: side * 0.168, cz: 0, rx: 0.047, rz: 0.046, bones: [[3, 0.22], [upperIdx, 0.78]], matGroup: 0 },
      { y: 1.315, cx: side * 0.174, cz: 0, rx: 0.045, rz: 0.044, bones: [[upperIdx, 1]], matGroup: 0 },
      { y: 1.24, cx: side * 0.178, cz: 0, rx: 0.041, rz: 0.041, bones: [[upperIdx, 1]], matGroup: 0 },
      { y: 1.14, cx: side * 0.184, cz: -0.002, rx: 0.035, rz: 0.036, bones: [[upperIdx, 0.85], [foreIdx, 0.15]], matGroup: 0 },
      { y: 1.08, cx: side * 0.186, cz: -0.003, rx: 0.034, rz: 0.035, bones: [[upperIdx, 0.45], [foreIdx, 0.55]], matGroup: 0 },
      { y: 1.01, cx: side * 0.19, cz: 0.002, rx: 0.034, rz: 0.034, bones: [[upperIdx, 0.1], [foreIdx, 0.9]], matGroup: 0 },
      { y: 0.915, cx: side * 0.194, cz: 0.003, rx: 0.027, rz: 0.027, bones: [[foreIdx, 0.92], [handIdx, 0.08]], matGroup: 0 },
      { y: 0.85, cx: side * 0.196, cz: 0.003, rx: 0.023, rz: 0.021, bones: [[foreIdx, 0.3], [handIdx, 0.7]], matGroup: 0 },
      // Natural sculpted palm & softly curled athletic fingers
      { y: 0.805, cx: side * 0.196, cz: 0.008, rx: 0.027, rz: 0.017, bones: [[handIdx, 1]], matGroup: 0 },
      { y: 0.758, cx: side * 0.194, cz: 0.014, rx: 0.024, rz: 0.014, bones: [[handIdx, 1]], matGroup: 0 },
      { y: 0.728, cx: side * 0.192, cz: 0.018, rx: 0.015, rz: 0.01, bones: [[handIdx, 1]], matGroup: 0 },
    ];
  };

  const bodyGeo = buildUnifiedAnatomicalGeometry(
    [torsoRings, buildLegRings(1), buildLegRings(-1), buildArmRings(1), buildArmRings(-1)],
    26
  );

  const skinnedBody = new THREE.SkinnedMesh(bodyGeo, [skinMat, activewearMat]);
  skinnedBody.castShadow = true;
  skinnedBody.receiveShadow = true;
  skinnedBody.frustumCulled = false;

  const skeleton = new THREE.Skeleton(bones);
  skinnedBody.add(pelvis);
  skinnedBody.bind(skeleton);
  root.add(skinnedBody);

  // --- 3. SCULPTED HEAD, NATURAL HAIRLINE & LUSH DYNAMIC PONYTAIL ---
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.072, 0.006);
  head.add(headGroup);

  const headGeo = new THREE.SphereGeometry(0.094, 34, 28);
  const hPos = headGeo.attributes.position;
  for (let i = 0; i < hPos.count; i++) {
    let x = hPos.getX(i);
    let y = hPos.getY(i);
    let z = hPos.getZ(i);
    y *= 1.17;
    if (y < 0) {
      const jawT = Math.min(1, -y / 0.11);
      x *= 1 - 0.25 * jawT;
      if (z > 0) z *= 1 - 0.06 * jawT;
    }
    if (z < 0 && y > -0.025) {
      z *= 1.08;
    }
    // Gentle refined nose bridge & tip at +Z center
    if (z > 0.07 && Math.abs(x) < 0.021 && y > -0.032 && y < 0.016) {
      const nx = Math.cos((Math.abs(x) / 0.021) * (Math.PI / 2));
      const ny = Math.sin(((y + 0.032) / 0.048) * Math.PI);
      z += 0.013 * nx * ny;
    }
    hPos.setXYZ(i, x * 0.89, y, z * 0.96);
  }
  headGeo.computeVertexNormals();
  const headMesh = new THREE.Mesh(headGeo, faceMat);
  headMesh.castShadow = true;
  headGroup.add(headMesh);

  // Sculpted ears
  const earGeo = new THREE.SphereGeometry(0.013, 10, 10);
  earGeo.scale(0.45, 1.32, 0.82);
  const earL = new THREE.Mesh(earGeo, skinMat);
  earL.position.set(0.082, -0.005, -0.01);
  const earR = earL.clone();
  earR.position.x = -0.082;
  headGroup.add(earL, earR);

  // Full sculpted slicked-back athletic hair shell covering top, back & temples cleanly (never cutting cheeks!)
  const hairCrownGeo = new THREE.SphereGeometry(0.098, 30, 24, 0, Math.PI * 2, 0, Math.PI * 0.56);
  hairCrownGeo.scale(0.92, 1.15, 1.0);
  const hairCrown = new THREE.Mesh(hairCrownGeo, hairMat);
  hairCrown.rotation.x = -0.48; // Swept smoothly from forehead hairline over top & down back of skull
  hairCrown.position.set(0, 0.012, -0.014);
  hairCrown.castShadow = true;
  headGroup.add(hairCrown);

  // Back nape hair cap so rear skull is 100% covered smoothly down to hairline
  const hairBackGeo = new THREE.SphereGeometry(0.095, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.52);
  hairBackGeo.scale(0.89, 1.05, 0.96);
  const hairBack = new THREE.Mesh(hairBackGeo, hairMat);
  hairBack.rotation.x = -Math.PI * 0.52;
  hairBack.position.set(0, 0.005, -0.016);
  headGroup.add(hairBack);

  // Sleek gathered high-ponytail hair wrap & cuff
  const hairTie = new THREE.Mesh(
    new THREE.TorusGeometry(0.023, 0.007, 10, 18),
    activewearMat
  );
  hairTie.position.set(0, 0.062, -0.09);
  hairTie.rotation.x = Math.PI * 0.34;
  headGroup.add(hairTie);

  // Dynamic Lush Multi-Strand Ponytail Pivot
  const ponytailPivot = new THREE.Group();
  ponytailPivot.position.set(0, 0.06, -0.094);
  headGroup.add(ponytailPivot);

  const strandOffsets: [number, number, number, number][] = [
    [0, 0.004, 0.36, 0.019],
    [0.015, 0.008, 0.34, 0.016],
    [-0.015, 0.008, 0.34, 0.016],
    [0.009, -0.01, 0.32, 0.015],
    [-0.009, -0.01, 0.32, 0.015],
    [0.024, -0.002, 0.29, 0.013],
    [-0.024, -0.002, 0.29, 0.013],
    [0, -0.016, 0.35, 0.014],
    [0.018, -0.016, 0.28, 0.012],
    [-0.018, -0.016, 0.28, 0.012],
  ];
  strandOffsets.forEach(([ox, oy, len, rad], idx) => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(ox * 0.3, oy * 0.3, 0),
      new THREE.Vector3(ox * 1.15, oy - len * 0.26, -0.05 - (idx % 3) * 0.012),
      new THREE.Vector3(ox * 1.4, oy - len * 0.65, -0.078 - (idx % 2) * 0.016),
      new THREE.Vector3(ox * 0.95, oy - len, -0.045),
    ]);
    const strandGeo = new THREE.TubeGeometry(curve, 14, rad, 8, false);
    const sPos = strandGeo.attributes.position;
    for (let i = 0; i < sPos.count; i++) {
      const yVal = sPos.getY(i);
      const t = Math.max(0, Math.min(1, -yVal / len));
      const scale = 1 - 0.72 * t * t;
      sPos.setX(i, ox * 0.6 + (sPos.getX(i) - ox * 0.6) * scale);
    }
    strandGeo.computeVertexNormals();
    const strandMesh = new THREE.Mesh(strandGeo, hairMat);
    strandMesh.castShadow = true;
    ponytailPivot.add(strandMesh);
  });

  // --- 4. POSE INTERPOLATION & 10.5s CHOREOGRAPHED PHYSICS ROUTINE ---
  const _camAnchor = new THREE.Vector3();
  const _camLookAt = new THREE.Vector3();
  let hairSwingX = 0;
  let hairSwingZ = 0;

  function resetNeutralPose(): void {
    bones.forEach((b) => b.rotation.set(0, 0, 0));
    pelvis.position.set(0, 0.9, 0);
  }

  function applyWalkGait(walkTime: number, strideAmp: number): void {
    const cycle = walkTime * 4.6;
    const s = Math.sin(cycle);
    const c = Math.cos(cycle);

    pelvis.position.y = 0.895 + Math.abs(c) * 0.022 * strideAmp;
    pelvis.rotation.z = s * 0.06 * strideAmp;
    pelvis.rotation.y = -s * 0.075 * strideAmp;
    pelvis.rotation.x = 0.025 * strideAmp;

    spineLower.rotation.z = -s * 0.04 * strideAmp;
    spineUpper.rotation.y = s * 0.095 * strideAmp;
    chest.rotation.x = -0.035 * strideAmp;
    neck.rotation.x = 0.02;

    thighL.rotation.x = -s * 0.42 * strideAmp;
    shinL.rotation.x = Math.max(0.05, (c * 0.48 + 0.22) * strideAmp);
    footL.rotation.x = Math.max(-0.16, -shinL.rotation.x * 0.32);

    thighR.rotation.x = s * 0.42 * strideAmp;
    shinR.rotation.x = Math.max(0.05, (-c * 0.48 + 0.22) * strideAmp);
    footR.rotation.x = Math.max(-0.16, -shinR.rotation.x * 0.32);

    upperArmL.rotation.x = s * 0.32 * strideAmp;
    upperArmL.rotation.z = 0.09;
    forearmL.rotation.x = -0.22 - Math.max(0, -s) * 0.22 * strideAmp;

    upperArmR.rotation.x = -s * 0.32 * strideAmp;
    upperArmR.rotation.z = -0.09;
    forearmR.rotation.x = -0.22 - Math.max(0, s) * 0.22 * strideAmp;
  }

  function applyPoleGripPose(t: number, breath: number): void {
    const k = smoothstep(0, 1, t);
    pelvis.position.y = lerp(0.9, 0.88, k);
    pelvis.rotation.y = lerp(0, 0.24, k);
    pelvis.rotation.z = lerp(0, -0.06, k);

    spineLower.rotation.x = lerp(0, -0.06, k);
    spineUpper.rotation.x = lerp(0, -0.08, k) + breath * 0.015;
    chest.rotation.y = lerp(0, -0.22, k);
    head.rotation.x = lerp(0, -0.14, k);

    upperArmL.rotation.x = lerp(0, -2.55, k);
    upperArmL.rotation.z = lerp(0.08, -0.22, k);
    forearmL.rotation.x = lerp(-0.2, -0.35, k);

    upperArmR.rotation.x = lerp(0, -1.25, k);
    upperArmR.rotation.z = lerp(-0.08, 0.42, k);
    forearmR.rotation.x = lerp(-0.2, -0.78, k);

    const prepDip = Math.sin(k * Math.PI);
    thighL.rotation.x = -0.22 * prepDip;
    shinL.rotation.x = 0.38 * prepDip;
    thighR.rotation.x = 0.14 * k - 0.15 * prepDip;
    shinR.rotation.x = 0.26 * prepDip + 0.15 * k;
    footR.rotation.x = 0.35 * k;
  }

  function applyAttitudeSpinPose(t: number, breath: number): void {
    const entry = smoothstep(0, 0.28, t);
    pelvis.position.y = lerp(0.9, 1.08, entry) + Math.sin(t * Math.PI) * 0.08;
    pelvis.rotation.x = -0.18 * entry;
    pelvis.rotation.z = -0.22 * entry;
    pelvis.rotation.y = 0.18 * entry;

    spineLower.rotation.x = -0.16 * entry;
    spineUpper.rotation.x = -0.18 * entry + breath * 0.015;
    chest.rotation.z = 0.14 * entry;
    neck.rotation.x = -0.18 * entry;
    head.rotation.y = -0.22 * entry;

    upperArmL.rotation.x = -2.72;
    upperArmL.rotation.z = -0.16;
    forearmL.rotation.x = -0.22;

    upperArmR.rotation.x = lerp(-1.25, -0.95, entry);
    upperArmR.rotation.z = lerp(0.42, -1.22, entry);
    forearmR.rotation.x = lerp(-0.78, -0.28, entry);

    thighL.rotation.x = -0.98 * entry;
    thighL.rotation.z = -0.18 * entry;
    shinL.rotation.x = 1.62 * entry;
    footL.rotation.x = 0.58 * entry;

    thighR.rotation.x = 0.42 * entry;
    thighR.rotation.z = -0.45 * entry;
    shinR.rotation.x = 0.85 * entry;
    footR.rotation.x = 0.65 * entry;
  }

  function applyAerialExtensionPose(t: number, breath: number): void {
    const k = smoothstep(0, 0.35, t);
    const holdSway = Math.sin(t * Math.PI * 1.4) * 0.06;

    pelvis.position.y = lerp(1.12, 1.38, k) + holdSway * 0.25;
    pelvis.rotation.z = lerp(-0.22, -0.68, k);
    pelvis.rotation.x = lerp(-0.18, -0.08, k);
    pelvis.rotation.y = lerp(0.18, -0.15, k);

    spineLower.rotation.x = -0.18 - holdSway * 0.3;
    spineUpper.rotation.x = -0.22 + breath * 0.02;
    chest.rotation.z = 0.28 * k;
    neck.rotation.x = -0.14;
    head.rotation.z = 0.16 * k;

    upperArmL.rotation.x = -2.62;
    upperArmL.rotation.z = 0.12;
    forearmL.rotation.x = -0.35;

    upperArmR.rotation.x = lerp(-0.95, -1.85, k);
    upperArmR.rotation.z = lerp(-1.22, -0.88, k) + holdSway;
    forearmR.rotation.x = -0.16;

    thighL.rotation.x = -1.18;
    thighL.rotation.z = 0.22;
    shinL.rotation.x = 1.82;
    footL.rotation.x = 0.68;

    thighR.rotation.x = lerp(0.42, 0.72, k);
    thighR.rotation.z = lerp(-0.45, -1.05, k) - holdSway * 0.4;
    shinR.rotation.x = lerp(0.85, 0.08, k);
    footR.rotation.x = 0.72;
  }

  function applyDismountPose(t: number, breath: number): void {
    const k = smoothstep(0, 1, t);
    pelvis.position.y = lerp(1.38, 0.9, k);
    pelvis.rotation.z = lerp(-0.68, -0.08, k);
    pelvis.rotation.x = lerp(-0.08, 0.02, k);
    pelvis.rotation.y = lerp(-0.15, 0.12, k);

    spineLower.rotation.x = lerp(-0.18, -0.04, k);
    spineUpper.rotation.x = lerp(-0.22, -0.04, k) + breath * 0.015;
    chest.rotation.z = lerp(0.28, 0.05, k);
    neck.rotation.x = lerp(-0.14, 0.02, k);
    head.rotation.z = lerp(0.16, 0.0, k);

    upperArmL.rotation.x = lerp(-2.62, -1.55, k);
    upperArmL.rotation.z = lerp(0.12, 0.34, k);
    forearmL.rotation.x = lerp(-0.35, -0.52, k);

    upperArmR.rotation.x = lerp(-1.85, -0.22, k);
    upperArmR.rotation.z = lerp(-0.88, -0.28, k);
    forearmR.rotation.x = lerp(-0.16, -0.32, k);

    thighL.rotation.x = lerp(-1.18, -0.12, k);
    thighL.rotation.z = lerp(0.22, 0.06, k);
    shinL.rotation.x = lerp(1.82, 0.18, k);
    footL.rotation.x = lerp(0.68, 0.08, k);

    thighR.rotation.x = lerp(0.72, 0.05, k);
    thighR.rotation.z = lerp(-1.05, -0.06, k);
    shinR.rotation.x = lerp(0.08, 0.08, k);
    footR.rotation.x = lerp(0.72, 0.0, k);
  }

  function applyStylishFinalePose(t: number, breath: number): void {
    const k = smoothstep(0, 1, t);
    pelvis.position.y = 0.895 + breath * 0.004;
    pelvis.rotation.z = lerp(-0.08, -0.11, k);
    pelvis.rotation.y = lerp(0.12, 0.28, k);
    pelvis.rotation.x = 0.02;

    spineLower.rotation.z = lerp(0.03, 0.07, k);
    spineUpper.rotation.x = -0.05 + breath * 0.02;
    chest.rotation.y = lerp(0, -0.24, k);
    neck.rotation.y = lerp(0, -0.08, k);
    head.rotation.x = -0.04;
    head.rotation.z = 0.06 * k;

    upperArmL.rotation.x = lerp(-1.55, -1.28, k);
    upperArmL.rotation.z = lerp(0.34, 0.42, k);
    forearmL.rotation.x = lerp(-0.52, -0.62, k);

    upperArmR.rotation.x = lerp(-0.22, 0.14, k);
    upperArmR.rotation.z = lerp(-0.28, -0.58, k);
    forearmR.rotation.x = lerp(-0.32, -1.28, k);
    forearmR.rotation.z = lerp(0, 0.45, k);

    thighR.rotation.x = 0.04;
    thighR.rotation.z = -0.05;
    shinR.rotation.x = 0.04;
    footR.rotation.x = 0.0;

    thighL.rotation.x = lerp(-0.12, -0.22, k);
    thighL.rotation.z = lerp(0.06, 0.12, k);
    shinL.rotation.x = lerp(0.18, 0.34, k);
    footL.rotation.x = lerp(0.08, 0.38, k);
  }

  function updatePerformance(
    timeSec: number,
    poleCenterX: number,
    poleCenterZ: number,
    poleRadiusM: number,
    poleFloorOffsetY: number,
    isActive: boolean,
    dt: number
  ) {
    root.visible = isActive;
    if (!isActive) {
      return {
        phase: 'idle',
        phaseLabel: 'Ready',
        spinBoostRadPerSec: 0,
        cameraAnchor: _camAnchor.set(poleCenterX + 1.85, 1.25, poleCenterZ + 3.85),
        cameraLookAt: _camLookAt.set(poleCenterX, 1.0, poleCenterZ),
      };
    }

    const sample = evaluatePerformanceTimeline(timeSec);
    const breath = Math.sin(timeSec * 2.4);
    resetNeutralPose();

    const gripOrbitRadius = poleRadiusM + 0.27;
    let spinBoostRadPerSec = 0;
    let targetHairX = 0.12;
    let targetHairZ = 0;

    if (sample.phase === 'walk-in') {
      const p = smoothstep(0, 1, sample.phaseProgress);
      const startX = poleCenterX - 1.55;
      const startZ = poleCenterZ + 0.55;
      const endX = poleCenterX - gripOrbitRadius;
      const endZ = poleCenterZ + 0.06;

      root.position.set(lerp(startX, endX, p), poleFloorOffsetY, lerp(startZ, endZ, p));
      const dirAngle = Math.atan2(endX - startX, endZ - startZ);
      root.rotation.set(0, dirAngle, 0);

      const strideFade = sample.phaseProgress > 0.85 ? (1 - sample.phaseProgress) / 0.15 : 1;
      applyWalkGait(sample.timeSec, Math.max(0.15, strideFade));
      targetHairX = 0.24 + Math.abs(Math.sin(sample.timeSec * 4.6)) * 0.18;

      _camAnchor.set(
        lerp(poleCenterX + 0.9, poleCenterX + 1.55, p),
        lerp(1.18, 1.32, p),
        lerp(poleCenterZ + 2.85, poleCenterZ + 2.55, p)
      );
      _camLookAt.set(lerp(startX * 0.5 + poleCenterX * 0.5, poleCenterX, p), 1.05, poleCenterZ);
    } else if (sample.phase === 'grip') {
      const p = sample.phaseProgress;
      const angle = lerp(Math.PI, Math.PI * 0.92, smoothstep(0, 1, p));
      root.position.set(
        poleCenterX + Math.cos(angle) * gripOrbitRadius,
        poleFloorOffsetY,
        poleCenterZ + Math.sin(angle) * gripOrbitRadius
      );
      root.rotation.set(0, Math.atan2(-Math.cos(angle), -Math.sin(angle)) + Math.PI * 0.18, 0);
      applyPoleGripPose(p, breath);
      targetHairX = 0.16;

      _camAnchor.set(poleCenterX + 1.55, lerp(1.32, 1.36, p), poleCenterZ + 2.55);
      _camLookAt.set(poleCenterX, 1.15, poleCenterZ);
    } else if (sample.phase === 'spin') {
      const p = sample.phaseProgress;
      const orbitAngle = Math.PI * 0.92 + smoothstep(0, 1, p) * Math.PI * 2.55;
      const rSpin = poleRadiusM + 0.34;
      root.position.set(
        poleCenterX + Math.cos(orbitAngle) * rSpin,
        poleFloorOffsetY,
        poleCenterZ + Math.sin(orbitAngle) * rSpin
      );
      root.rotation.set(0, -orbitAngle, 0);
      applyAttitudeSpinPose(p, breath);
      spinBoostRadPerSec = 3.1;
      targetHairX = 0.62;
      targetHairZ = -0.38;

      const camAngle = lerp(0.55, -0.35, p);
      _camAnchor.set(
        poleCenterX + Math.sin(camAngle) * 2.75,
        lerp(1.36, 1.48, p),
        poleCenterZ + Math.cos(camAngle) * 2.75
      );
      _camLookAt.set(poleCenterX, 1.24, poleCenterZ);
    } else if (sample.phase === 'aerial-hold') {
      const p = sample.phaseProgress;
      const orbitAngle = Math.PI * 3.47 + p * Math.PI * 1.45;
      const rAerial = poleRadiusM + 0.28;
      root.position.set(
        poleCenterX + Math.cos(orbitAngle) * rAerial,
        poleFloorOffsetY,
        poleCenterZ + Math.sin(orbitAngle) * rAerial
      );
      root.rotation.set(0, -orbitAngle, 0);
      applyAerialExtensionPose(p, breath);
      spinBoostRadPerSec = 1.9;
      targetHairX = 0.52;
      targetHairZ = -0.22;

      const camAngle = lerp(-0.35, 0.42, smoothstep(0, 1, p));
      _camAnchor.set(
        poleCenterX + Math.sin(camAngle) * 2.55,
        lerp(1.05, 1.22, p),
        poleCenterZ + Math.cos(camAngle) * 2.55
      );
      _camLookAt.set(poleCenterX, 1.48, poleCenterZ);
    } else if (sample.phase === 'dismount') {
      const p = sample.phaseProgress;
      const orbitAngle = Math.PI * 4.92 + smoothstep(0, 1, p) * Math.PI * 0.58;
      const rDown = lerp(poleRadiusM + 0.28, poleRadiusM + 0.34, p);
      root.position.set(
        poleCenterX + Math.cos(orbitAngle) * rDown,
        poleFloorOffsetY,
        poleCenterZ + Math.sin(orbitAngle) * rDown
      );
      const targetYaw = 0.22;
      root.rotation.set(0, lerp(-orbitAngle % (Math.PI * 2), targetYaw, smoothstep(0.2, 1, p)), 0);
      applyDismountPose(p, breath);
      spinBoostRadPerSec = lerp(1.5, 0, p);
      targetHairX = lerp(0.45, 0.14, p);

      _camAnchor.set(
        lerp(poleCenterX + 1.05, poleCenterX + 0.55, p),
        lerp(1.22, 1.26, p),
        lerp(poleCenterZ + 2.35, poleCenterZ + 2.55, p)
      );
      _camLookAt.set(poleCenterX - 0.12, lerp(1.45, 1.08, p), poleCenterZ);
    } else {
      const p = sample.phaseProgress;
      const finalX = poleCenterX - (poleRadiusM + 0.35);
      const finalZ = poleCenterZ + 0.14;
      root.position.set(finalX, poleFloorOffsetY, finalZ);
      root.rotation.set(0, 0.18, 0);
      applyStylishFinalePose(p, breath);
      targetHairX = 0.1 + breath * 0.025;
      targetHairZ = 0.08;

      _camAnchor.set(poleCenterX + 0.55, 1.26, poleCenterZ + 2.55);
      _camLookAt.set(poleCenterX - 0.14, 1.08, poleCenterZ);
    }

    const damp = 1 - Math.exp(-7.5 * Math.max(0.008, dt));
    hairSwingX = lerp(hairSwingX, targetHairX, damp);
    hairSwingZ = lerp(hairSwingZ, targetHairZ, damp);
    ponytailPivot.rotation.set(hairSwingX, 0, hairSwingZ);

    return {
      phase: sample.phase,
      phaseLabel: sample.phaseLabel,
      spinBoostRadPerSec,
      cameraAnchor: _camAnchor,
      cameraLookAt: _camLookAt,
    };
  }

  return {
    root,
    updatePerformance,
    dispose: () => {
      bodyGeo.dispose();
      headGeo.dispose();
      earGeo.dispose();
      hairCrownGeo.dispose();
      hairBackGeo.dispose();
      hairTie.geometry.dispose();
      chest.children.forEach((c) => {
        if (c instanceof THREE.Mesh) c.geometry.dispose();
      });
      ponytailPivot.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      skinMat.dispose();
      activewearMat.dispose();
      faceMat.dispose();
      hairMat.dispose();
      skinMap.dispose();
      faceMap.dispose();
      fabricBump.dispose();
      hairMap.dispose();
    },
  };
}
