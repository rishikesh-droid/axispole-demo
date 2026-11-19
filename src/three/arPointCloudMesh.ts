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

// 14 line segments (28 vertices) for room bounding wireframe (back wall + calibrated 4-corner floor/ceiling box + risers)
const WIRE_VERT_COUNT = 28;

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
    size: 0.082,
    map: spriteTex,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
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
  const pinGeo = new THREE.RingGeometry(0.045, 0.085, 24);
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
  const ringSegs = 40;
  const ringPts: THREE.Vector3[] = [];
  for (let i = 0; i < ringSegs; i++) {
    const a = (i / ringSegs) * Math.PI * 2;
    ringPts.push(new THREE.Vector3(Math.cos(a) * 0.85, 0.018, Math.sin(a) * 0.85));
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
      const H = measurement.ceilingHeightM;

      // 1. Update 3D point cloud
      pointCloud.visible = showCloud && phase !== 'surface-calibrate';
      ptMat.opacity = phase === 'scanning' ? 0.92 : 0.4;
      ptMat.size = phase === 'scanning' ? 0.082 : 0.06;
      if (pointCloud.visible) {
        const count = Math.min(points.length, MAX_ACCUMULATED_POINTS);
        for (let i = 0; i < count; i++) {
          const p = points[i];
          const o = i * 3;
          ptPositions[o] = p.x;
          ptPositions[o + 1] = p.y;
          ptPositions[o + 2] = p.z;
          const col = CATEGORY_COLORS[p.category];
          const brightness = phase === 'scanning' ? 1.0 : 0.78;
          ptColors[o] = col[0] * brightness;
          ptColors[o + 1] = col[1] * brightness;
          ptColors[o + 2] = col[2] * brightness;
        }
        ptGeo.setDrawRange(0, count);
        ptPosAttr.needsUpdate = true;
        ptColAttr.needsUpdate = true;
      }

      // 2. Render 4-point calibrated physical floor pins + translucent ground-plane quad
      const activePins = surfaceCalibration?.valid
        ? surfaceCalibration.points3D
        : partialFloorPoints;
      for (let i = 0; i < 4; i++) {
        const pin = activePins[i];
        if (pin) {
          floorPins[i].visible = true;
          floorPins[i].position.set(pin.x, 0.015, dist + pin.z);
        } else {
          floorPins[i].visible = false;
        }
      }

      const ceilCol = CATEGORY_COLORS.ceiling;
      const floorCol: [number, number, number] = surfaceCalibration?.valid
        ? [0.2, 0.88, 0.65] // emerald-cyan for calibrated floor surface
        : CATEGORY_COLORS.floor;
      const cornerCol = CATEGORY_COLORS['wall-corner'];
      const subtleCeil: [number, number, number] = [0.55, 0.38, 0.78];
      const subtleFloor: [number, number, number] = [0.14, 0.74, 0.68];

      let segCount = 0;

      if (surfaceCalibration?.valid) {
        const [bl, br, fr, fl] = surfaceCalibration.points3D;
        const wblZ = dist + bl.z;
        const wbrZ = dist + br.z;
        const wfrZ = dist + fr.z;
        const wflZ = dist + fl.z;

        // Translucent calibrated ground quad (BL -> BR -> FR & BL -> FR -> FL)
        floorQuadMesh.visible = true;
        floorQuadMat.opacity = phase === 'surface-calibrate' ? 0.22 : 0.11;
        floorQuadPositions.set([
          bl.x, 0.012, wblZ,
          br.x, 0.012, wbrZ,
          fr.x, 0.012, wfrZ,
          bl.x, 0.012, wblZ,
          fr.x, 0.012, wfrZ,
          fl.x, 0.012, wflZ,
        ]);
        floorQuadAttr.needsUpdate = true;

        // Floor perimeter (4 edges)
        writeSeg(segCount++, bl.x, 0.016, wblZ, br.x, 0.016, wbrZ, floorCol);
        writeSeg(segCount++, br.x, 0.016, wbrZ, fr.x, 0.016, wfrZ, floorCol);
        writeSeg(segCount++, fr.x, 0.016, wfrZ, fl.x, 0.016, wflZ, floorCol);
        writeSeg(segCount++, fl.x, 0.016, wflZ, bl.x, 0.016, wblZ, floorCol);

        // Ceiling perimeter directly above the 4 calibrated floor corners
        writeSeg(segCount++, bl.x, H, wblZ, br.x, H, wbrZ, ceilCol);
        writeSeg(segCount++, br.x, H, wbrZ, fr.x, H, wfrZ, subtleCeil);
        writeSeg(segCount++, fr.x, H, wfrZ, fl.x, H, wflZ, subtleCeil);
        writeSeg(segCount++, fl.x, H, wflZ, bl.x, H, wblZ, subtleCeil);

        // 4 vertical architectural corner risers connecting calibrated floor to ceiling
        writeSeg(segCount++, bl.x, 0.016, wblZ, bl.x, H, wblZ, cornerCol);
        writeSeg(segCount++, br.x, 0.016, wbrZ, br.x, H, wbrZ, cornerCol);
        writeSeg(segCount++, fr.x, 0.016, wfrZ, fr.x, H, wfrZ, subtleFloor);
        writeSeg(segCount++, fl.x, 0.016, wflZ, fl.x, H, wflZ, subtleFloor);

        // Clean orthogonal architectural centerline crosshairs on calibrated floor plane
        const cx = surfaceCalibration.centroidX;
        const cz = dist + surfaceCalibration.centroidZ;
        const midBackX = (bl.x + br.x) * 0.5;
        const midBackZ = (wblZ + wbrZ) * 0.5;
        const midFrontX = (fl.x + fr.x) * 0.5;
        const midFrontZ = (wflZ + wfrZ) * 0.5;
        writeSeg(segCount++, midBackX, 0.015, midBackZ, midFrontX, 0.015, midFrontZ, [0.12, 0.45, 0.48]);
        writeSeg(segCount++, cx, 0.016, cz, cx, H, cz, phase === 'pole-ready' ? [0.22, 0.3, 0.42] : [0.2, 0.9, 0.85]);

        floorRing.visible = phase === 'pole-ready';
        floorRing.position.set(measurement.poleOffsetXM, 0, cz);
      } else {
        floorQuadMesh.visible = false;

        if (phase === 'surface-calibrate' && partialFloorPoints.length >= 2) {
          // Draw partial floor segments as user taps points 1 -> 2 -> 3
          for (let i = 0; i < partialFloorPoints.length - 1; i++) {
            const a = partialFloorPoints[i];
            const b = partialFloorPoints[i + 1];
            writeSeg(segCount++, a.x, 0.016, dist + a.z, b.x, 0.016, dist + b.z, [0.2, 0.88, 0.65]);
          }
        } else {
          // Standard point-cloud wall/ceiling/floor wireframe
          const lx = measurement.leftWallXM;
          const rx = measurement.rightWallXM;
          const zBack = -0.02;
          const zFront = Math.min(1.1, Math.max(0.45, dist * 0.34));

          writeSeg(segCount++, lx, H, zBack, rx, H, zBack, ceilCol);
          writeSeg(segCount++, lx, 0.01, zBack, rx, 0.01, zBack, floorCol);
          writeSeg(segCount++, lx, 0.01, zBack, lx, H, zBack, cornerCol);
          writeSeg(segCount++, rx, 0.01, zBack, rx, H, zBack, cornerCol);
          writeSeg(segCount++, lx, H, zBack, lx, H, zFront, subtleCeil);
          writeSeg(segCount++, rx, H, zBack, rx, H, zFront, subtleCeil);
          writeSeg(segCount++, lx, 0.01, zBack, lx, 0.01, zFront, subtleFloor);
          writeSeg(segCount++, rx, 0.01, zBack, rx, 0.01, zFront, subtleFloor);
          writeSeg(segCount++, lx, 0.01, zFront * 0.5, rx, 0.01, zFront * 0.5, subtleFloor);
          writeSeg(segCount++, lx, 0.01, zFront, rx, 0.01, zFront, subtleFloor);
          writeSeg(segCount++, lx, H, zFront * 0.5, rx, H, zFront * 0.5, subtleCeil);
          writeSeg(
            segCount++,
            measurement.poleOffsetXM,
            0.01,
            0,
            measurement.poleOffsetXM,
            H,
            0,
            phase === 'scanning' ? [0.22, 0.88, 0.96] : [0.35, 0.4, 0.5]
          );
        }

        floorRing.visible = phase === 'pole-ready';
        floorRing.position.set(measurement.poleOffsetXM, 0, 0);
      }

      wireGeo.setDrawRange(0, segCount * 2);
      wireMat.opacity = phase === 'pole-ready' ? (showCloud ? 0.52 : 0.28) : 0.82;
      wirePosAttr.needsUpdate = true;
      wireColAttr.needsUpdate = true;
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
    },
  };
}
