import * as THREE from 'three';
import type { ARMeasurementResult } from '../utils/arMeasure';
import {
  MAX_ACCUMULATED_POINTS,
  type ARPoint3D,
  type PointCloudCategory,
} from '../utils/arPointCloud';
import type {
  FloorPoint3D,
  SurfaceCalibrationResult,
} from '../utils/arSurfaceCalibration';

export type ARScanPhase = 'surface-calibrate' | 'scanning' | 'pole-ready';

export interface ARPointCloudRigHandle {
  group: THREE.Group;
  update: (
    active: boolean,
    phase: ARScanPhase,
    points: ARPoint3D[],
    measurement: ARMeasurementResult,
    showCloud: boolean,
    surfaceCalibration: SurfaceCalibrationResult | null,
    partialFloorPoints: FloorPoint3D[]
  ) => void;
  dispose: () => void;
}

const CATEGORY_COLORS: Record<PointCloudCategory, [number, number, number]> = {
  ceiling: [0.75, 0.52, 0.99],       // violet-400
  floor: [0.13, 0.83, 0.93],         // cyan-400
  'wall-corner': [0.98, 0.75, 0.14], // amber-400
  'wall-plane': [0.78, 0.84, 0.92],  // slate-300
  clutter: [0.95, 0.32, 0.45],       // rose-500 (filtered objects)
};

// Up to 16 line segments (32 vertices) for room bounding wireframe & calibrated floor outline
const WIRE_VERT_COUNT = 32;

export function createARPointCloudRig(scene: THREE.Scene): ARPointCloudRigHandle {
  const group = new THREE.Group();
  group.name = 'ARPointCloudRig';
  group.visible = false;

  // 1. Pre-allocated 3D Point Cloud Buffer
  const ptPositions = new Float32Array(MAX_ACCUMULATED_POINTS * 3);
  const ptColors = new Float32Array(MAX_ACCUMULATED_POINTS * 3);
  const ptGeo = new THREE.BufferGeometry();
  const ptPosAttr = new THREE.BufferAttribute(ptPositions, 3);
  const ptColAttr = new THREE.BufferAttribute(ptColors, 3);
  ptGeo.setAttribute('position', ptPosAttr);
  ptGeo.setAttribute('color', ptColAttr);
  ptGeo.setDrawRange(0, 0);

  // Crisp luminous architectural point sprite texture
  const spriteCanvas = document.createElement('canvas');
  spriteCanvas.width = 32;
  spriteCanvas.height = 32;
  const sCtx = spriteCanvas.getContext('2d');
  if (sCtx) {
    const grad = sCtx.createRadialGradient(16, 16, 1, 16, 16, 14);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.3)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, 32, 32);
  }
  const spriteTex = new THREE.CanvasTexture(spriteCanvas);

  const ptMat = new THREE.PointsMaterial({
    size: 0.075,
    map: spriteTex,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.88,
    alphaTest: 0.06,
    depthWrite: false,
  });
  const pointCloud = new THREE.Points(ptGeo, ptMat);
  pointCloud.frustumCulled = false;
  group.add(pointCloud);

  // 2. Pre-allocated 3D Architectural Room Wireframe
  const wirePositions = new Float32Array(WIRE_VERT_COUNT * 3);
  const wireColors = new Float32Array(WIRE_VERT_COUNT * 3);
  const wireGeo = new THREE.BufferGeometry();
  const wirePosAttr = new THREE.BufferAttribute(wirePositions, 3);
  const wireColAttr = new THREE.BufferAttribute(wireColors, 3);
  wireGeo.setAttribute('position', wirePosAttr);
  wireGeo.setAttribute('color', wireColAttr);

  const wireMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  });
  const roomWire = new THREE.LineSegments(wireGeo, wireMat);
  roomWire.frustumCulled = false;
  group.add(roomWire);

  // 3. Translucent 3D Calibrated Floor Surface Quad (2 triangles = 6 vertices)
  const floorQuadPositions = new Float32Array(6 * 3);
  const floorQuadGeo = new THREE.BufferGeometry();
  const floorQuadAttr = new THREE.BufferAttribute(floorQuadPositions, 3);
  floorQuadGeo.setAttribute('position', floorQuadAttr);
  const floorQuadMat = new THREE.MeshBasicMaterial({
    color: 0x10b981,
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const floorQuadMesh = new THREE.Mesh(floorQuadGeo, floorQuadMat);
  floorQuadMesh.visible = false;
  floorQuadMesh.frustumCulled = false;
  group.add(floorQuadMesh);

  // 4. 4 Calibrated Floor Corner Anchor Discs on physical ground plane
  const pinGeo = new THREE.RingGeometry(0.045, 0.088, 28);
  const pinMat = new THREE.MeshBasicMaterial({
    color: 0x34d399,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const floorPins: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const disc = new THREE.Mesh(pinGeo, pinMat);
    disc.rotation.x = -Math.PI / 2;
    disc.visible = false;
    group.add(disc);
    floorPins.push(disc);
  }

  // 5. Floor Pole Spin-Clearance Ring (0.85m radius visual footprint on real floor)
  const ringSegs = 48;
  const ringPts: THREE.Vector3[] = [];
  const baseHubPts: THREE.Vector3[] = [];
  const ceilHaloPts: THREE.Vector3[] = [];
  for (let i = 0; i < ringSegs; i++) {
    const a = (i / ringSegs) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    ringPts.push(new THREE.Vector3(ca * 0.85, 0.018, sa * 0.85));
    baseHubPts.push(new THREE.Vector3(ca * 0.21, 0.019, sa * 0.21));
    ceilHaloPts.push(new THREE.Vector3(ca * 0.23, 0, sa * 0.23));
  }

  const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
  const ringMat = new THREE.LineBasicMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  });
  const floorRing = new THREE.LineLoop(ringGeo, ringMat);
  floorRing.visible = false;
  group.add(floorRing);

  // Inner Floor Base Anchor Laser Ring (0.21m radius directly around base plate)
  const baseHubGeo = new THREE.BufferGeometry().setFromPoints(baseHubPts);
  const baseHubMat = new THREE.LineBasicMaterial({
    color: 0x34d399,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const baseHubRing = new THREE.LineLoop(baseHubGeo, baseHubMat);
  baseHubRing.visible = false;
  group.add(baseHubRing);

  // 6. Ceiling Top-Dome Contact Laser Halo Ring (0.23m radius directly flush at ceilingHeightM)
  const ceilHaloGeo = new THREE.BufferGeometry().setFromPoints(ceilHaloPts);
  const ceilHaloMat = new THREE.LineBasicMaterial({
    color: 0xa78bfa,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
  });
  const ceilingHaloRing = new THREE.LineLoop(ceilHaloGeo, ceilHaloMat);
  ceilingHaloRing.visible = false;
  group.add(ceilingHaloRing);

  scene.add(group);

  const writeSeg = (
    idx: number,
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    rgb: [number, number, number]
  ) => {
    const o = idx * 6;
    wirePositions[o] = ax;
    wirePositions[o + 1] = ay;
    wirePositions[o + 2] = az;
    wirePositions[o + 3] = bx;
    wirePositions[o + 4] = by;
    wirePositions[o + 5] = bz;

    wireColors[o] = rgb[0];
    wireColors[o + 1] = rgb[1];
    wireColors[o + 2] = rgb[2];
    wireColors[o + 3] = rgb[0];
    wireColors[o + 4] = rgb[1];
    wireColors[o + 5] = rgb[2];
  };

  return {
    group,
    update(active, phase, points, measurement, showCloud, surfaceCalibration, partialFloorPoints) {
      group.visible = active;
      if (!active) return;

      const dist = measurement.distanceM;
      const calibratedZ = measurement.poleDepthZM;

      // 1. Live feature dots while actively scanning or when point cloud toggle is enabled
      pointCloud.visible = (phase === 'scanning' || showCloud) && points.length > 0;
      ptMat.opacity = phase === 'scanning' ? 0.78 : 0.55;
      ptMat.size = phase === 'scanning' ? 0.062 : 0.048;
      if (pointCloud.visible) {
        const count = Math.min(points.length, MAX_ACCUMULATED_POINTS);
        for (let i = 0; i < count; i++) {
          const p = points[i];
          const o = i * 3;
          ptPositions[o] = p.x;
          ptPositions[o + 1] = p.y;
          ptPositions[o + 2] = p.z;
          const col = CATEGORY_COLORS[p.category];
          ptColors[o] = col[0];
          ptColors[o + 1] = col[1];
          ptColors[o + 2] = col[2];
        }
        ptGeo.setDrawRange(0, count);
        ptPosAttr.needsUpdate = true;
        ptColAttr.needsUpdate = true;
      }

      // 2. Floor calibration pins & 3D room/floor wireframe
      const isCalibPhase = phase === 'surface-calibrate';
      const activePins = surfaceCalibration?.valid
        ? surfaceCalibration.points3D
        : partialFloorPoints;
      for (let i = 0; i < 4; i++) {
        const pin = isCalibPhase ? activePins[i] : undefined;
        if (pin) {
          floorPins[i].visible = true;
          floorPins[i].position.set(pin.x, 0.015, dist + pin.z);
        } else {
          floorPins[i].visible = false;
        }
      }

      let segCount = 0;
      if (surfaceCalibration?.valid && (isCalibPhase || phase === 'pole-ready')) {
        const [bl, br, fr, fl] = surfaceCalibration.points3D;
        const wblZ = dist + bl.z;
        const wbrZ = dist + br.z;
        const wfrZ = dist + fr.z;
        const wflZ = dist + fl.z;

        floorQuadMesh.visible = true;
        floorQuadMat.opacity = isCalibPhase ? 0.16 : 0.06;
        floorQuadPositions.set([
          bl.x, 0.012, wblZ,
          br.x, 0.012, wbrZ,
          fr.x, 0.012, wfrZ,
          bl.x, 0.012, wblZ,
          fr.x, 0.012, wfrZ,
          fl.x, 0.012, wflZ,
        ]);
        floorQuadAttr.needsUpdate = true;

        const floorCol: [number, number, number] = [0.22, 0.9, 0.68];
        writeSeg(segCount++, bl.x, 0.016, wblZ, br.x, 0.016, wbrZ, floorCol);
        writeSeg(segCount++, br.x, 0.016, wbrZ, fr.x, 0.016, wfrZ, floorCol);
        writeSeg(segCount++, fr.x, 0.016, wfrZ, fl.x, 0.016, wflZ, floorCol);
        writeSeg(segCount++, fl.x, 0.016, wflZ, bl.x, 0.016, wblZ, floorCol);
      } else {
        floorQuadMesh.visible = false;
        if (isCalibPhase && partialFloorPoints.length >= 2) {
          for (let i = 0; i < partialFloorPoints.length - 1; i++) {
            const a = partialFloorPoints[i];
            const b = partialFloorPoints[i + 1];
            writeSeg(segCount++, a.x, 0.016, dist + a.z, b.x, 0.016, dist + b.z, [0.22, 0.9, 0.68]);
          }
        }
      }

      // While scanning, draw detected 3D architectural ceiling/floor/corner laser frame at z = 0
      if (phase === 'scanning') {
        const lx = measurement.leftWallXM;
        const rx = measurement.rightWallXM;
        const ch = measurement.ceilingHeightM;
        writeSeg(segCount++, lx, ch - 0.015, 0, rx, ch - 0.015, 0, CATEGORY_COLORS.ceiling);
        writeSeg(segCount++, lx, 0.018, 0, rx, 0.018, 0, CATEGORY_COLORS.floor);
        writeSeg(segCount++, lx, 0.018, 0, lx, ch - 0.015, 0, CATEGORY_COLORS['wall-corner']);
        writeSeg(segCount++, rx, 0.018, 0, rx, ch - 0.015, 0, CATEGORY_COLORS['wall-corner']);
      }

      roomWire.visible = segCount > 0;
      if (segCount > 0) {
        wireGeo.setDrawRange(0, segCount * 2);
        wireMat.opacity = isCalibPhase || phase === 'scanning' ? 0.76 : 0.32;
        wirePosAttr.needsUpdate = true;
        wireColAttr.needsUpdate = true;
      }

      // 3. Dual floor laser footprint rings + Ceiling top-dome contact laser ring
      const isCaution = measurement.clearanceStatus !== 'optimal';
      ringMat.color.setHex(isCaution ? 0xfbbf24 : 0x22d3ee);
      floorRing.visible = true;
      ringMat.opacity = phase === 'pole-ready' ? 0.5 : 0.28;
      floorRing.position.set(measurement.poleOffsetXM, 0, calibratedZ);

      baseHubRing.visible = true;
      baseHubMat.opacity = phase === 'pole-ready' ? 0.68 : 0.35;
      baseHubRing.position.set(measurement.poleOffsetXM, 0, calibratedZ);

      ceilingHaloRing.visible = true;
      ceilHaloMat.opacity = phase === 'pole-ready' ? 0.62 : 0.38;
      ceilingHaloRing.position.set(
        measurement.poleOffsetXM,
        measurement.ceilingHeightM - 0.012,
        calibratedZ
      );
    },
    dispose() {
      scene.remove(group);
      ptGeo.dispose();
      ptMat.dispose();
      spriteTex.dispose();
      wireGeo.dispose();
      wireMat.dispose();
      floorQuadGeo.dispose();
      floorQuadMat.dispose();
      pinGeo.dispose();
      pinMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      baseHubGeo.dispose();
      baseHubMat.dispose();
      ceilHaloGeo.dispose();
      ceilHaloMat.dispose();
    },
  };
}
