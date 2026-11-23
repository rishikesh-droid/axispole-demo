import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type {
  CameraFocusId,
  CameraMotionMode,
  HardwarePartId,
  PoleClampResult,
  PoleFinishId,
  PoleInstance,
  PoleRigConfig,
  RoomReplicaScene,
} from '../types/pole';
import {
  ASSEMBLY_STEPS,
  clampPolePosition,
  computeAssemblyOffsets,
  computeFullRoomCamera,
  computeInRoomOrbitPosition,
  computeLocalCeilingHeightCm,
  MAX_CEILING_HEIGHT_CM,
  MAX_POLE_HEIGHT_CM,
  MAX_POLES_IN_STUDIO,
  MIN_CEILING_HEIGHT_CM,
} from '../utils/poleConfig';
import type { ARMarkerState, ARMeasurementResult } from '../utils/arMeasure';
import type { ARPoint3D } from '../utils/arPointCloud';
import type { FloorPoint3D, SurfaceCalibrationResult } from '../utils/arSurfaceCalibration';
import {
  createARPointCloudRig,
  type ARPointCloudRigHandle,
  type ARScanPhase,
} from '../three/arPointCloudMesh';
import { createProceduralTextures } from '../three/proceduralTextures';
import { createPoleAssembly, type PoleAssemblyHandle } from '../three/poleBuilder';
import {
  createEnvironmentRig,
  type EnvironmentRigHandle,
  type FloorPoleMarker,
} from '../three/environmentBuilder';
import {
  buildQuickLookUSDZUrl,
  exportPoleCAD,
  type CadFormat,
} from '../three/cadExporter';
import { soundFx } from '../utils/soundFx';

export interface PoleViewportHandle {
  focusCamera: (preset: CameraFocusId) => void;
  focusPart: (partId: HardwarePartId) => void;
  exportCAD: (format: CadFormat) => Promise<{ filename: string; bytes: number }>;
  generateUSDZUrl: () => Promise<string>;
}

interface PoleViewport3DProps {
  config: PoleRigConfig;
  poles: PoleInstance[];
  activePoleId: string;
  onSelectPole: (poleId: string) => void;
  onMovePole: (poleId: string, x: number, z: number, clamp: PoleClampResult) => void;
  moveMode: boolean;
  compareMode: boolean;
  compareFinish: PoleFinishId;
  cameraMotion: CameraMotionMode;
  onCancelCameraMotion: () => void;
  assemblyProgress: number;
  explodedFactor: number;
  highlightFasteners: boolean;
  selectedPart: HardwarePartId | null;
  onSelectPart: (partId: HardwarePartId | null) => void;
  playbackMode: 'idle' | 'assemble' | 'dismantle';
  onPlaybackProgress: (progress: number, finished: boolean) => void;
  arCameraActive: boolean;
  arMarkers: ARMarkerState;
  arMeasurement: ARMeasurementResult;
  arScanPhase: ARScanPhase;
  arPointCloud: ARPoint3D[];
  arShowPointCloud: boolean;
  arSurfaceCalibration: SurfaceCalibrationResult | null;
  arPartialFloorPoints: FloorPoint3D[];
  roomReplica: RoomReplicaScene | null;
  showInferredObjects: boolean;
}

const _camGoalPos = new THREE.Vector3();
const _camGoalTarget = new THREE.Vector3();
const _pointerNdc = new THREE.Vector2();
const _floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _floorHit = new THREE.Vector3();
const _dragOffset = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export const PoleViewport3D = forwardRef<PoleViewportHandle, PoleViewport3DProps>(
  function PoleViewport3D(
    {
      config,
      poles,
      activePoleId,
      onSelectPole,
      onMovePole,
      moveMode,
      compareMode,
      compareFinish,
      cameraMotion,
      onCancelCameraMotion,
      assemblyProgress,
      explodedFactor,
      highlightFasteners,
      selectedPart,
      onSelectPart,
      playbackMode,
      onPlaybackProgress,
      arCameraActive,
      arMarkers,
      arMeasurement,
      arScanPhase,
      arPointCloud,
      arShowPointCloud,
      arSurfaceCalibration,
      arPartialFloorPoints,
      roomReplica,
      showInferredObjects,
    },
    ref
  ) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const [contextLost, setContextLost] = useState(false);

    const stateRef = useRef({
      config,
      poles,
      activePoleId,
      onSelectPole,
      onMovePole,
      moveMode,
      compareMode,
      compareFinish,
      cameraMotion,
      onCancelCameraMotion,
      assemblyProgress,
      explodedFactor,
      highlightFasteners,
      selectedPart,
      playbackMode,
      arCameraActive,
      arMarkers,
      arMeasurement,
      arScanPhase,
      arPointCloud,
      arShowPointCloud,
      arSurfaceCalibration,
      arPartialFloorPoints,
      roomReplica,
      showInferredObjects,
      onSelectPart,
      onPlaybackProgress,
    });
    stateRef.current = {
      config,
      poles,
      activePoleId,
      onSelectPole,
      onMovePole,
      moveMode,
      compareMode,
      compareFinish,
      cameraMotion,
      onCancelCameraMotion,
      assemblyProgress,
      explodedFactor,
      highlightFasteners,
      selectedPart,
      playbackMode,
      arCameraActive,
      arMarkers,
      arMeasurement,
      arScanPhase,
      arPointCloud,
      arShowPointCloud,
      arSurfaceCalibration,
      arPartialFloorPoints,
      roomReplica,
      showInferredObjects,
      onSelectPart,
      onPlaybackProgress,
    };

    const sceneApiRef = useRef<{
      polePool: PoleAssemblyHandle[];
      poleGeoKeys: string[];
      env: EnvironmentRigHandle | null;
      arCloudRig: ARPointCloudRigHandle | null;
      camera: THREE.PerspectiveCamera | null;
      controls: OrbitControls | null;
      renderer: THREE.WebGLRenderer | null;
      requestRender: () => void;
      startCameraTransition: (pos: THREE.Vector3, target: THREE.Vector3) => void;
      syncPolesAndEnv: () => void;
    }>({
      polePool: [],
      poleGeoKeys: [],
      env: null,
      arCloudRig: null,
      camera: null,
      controls: null,
      renderer: null,
      requestRender: () => {},
      startCameraTransition: () => {},
      syncPolesAndEnv: () => {},
    });

    const getActivePoleAnchor = (): { x: number; z: number; handle: PoleAssemblyHandle | null } => {
      const s = stateRef.current;
      const pool = sceneApiRef.current.polePool;
      if (s.compareMode) {
        return { x: 0, z: 0, handle: pool[0] ?? null };
      }
      const idx = Math.max(
        0,
        s.poles.findIndex((p) => p.id === s.activePoleId)
      );
      const p = s.poles[idx] ?? s.poles[0];
      return { x: p?.x ?? 0, z: p?.z ?? 0, handle: pool[idx] ?? pool[0] ?? null };
    };

    const computeCameraPreset = (
      preset: CameraFocusId,
      heightCm: number
    ): { pos: THREE.Vector3; target: THREE.Vector3 } => {
      const H = heightCm / 100;
      const anchor = getActivePoleAnchor();
      const ox = anchor.x;
      const oz = anchor.z;

      switch (preset) {
        case 'compare-pair':
          return {
            pos: new THREE.Vector3(0, H * 0.46, 3.15),
            target: new THREE.Vector3(0, H * 0.39, 0),
          };
        case 'base-hub': {
          const pt = anchor.handle
            ? anchor.handle.getPartFocusPoint('bearing-hub')
            : new THREE.Vector3(0, 0.1, 0);
          return {
            pos: new THREE.Vector3(ox + 0.55, pt.y + 0.2, oz + 0.68),
            target: new THREE.Vector3(ox, pt.y, oz),
          };
        }
        case 'x-joint': {
          const pt = anchor.handle
            ? anchor.handle.getPartFocusPoint('x-joint')
            : new THREE.Vector3(0, H * 0.44, 0);
          return {
            pos: new THREE.Vector3(ox + 0.54, pt.y + 0.06, oz + 0.64),
            target: new THREE.Vector3(ox, pt.y, oz),
          };
        }
        case 'top-mount': {
          const pt = anchor.handle
            ? anchor.handle.getPartFocusPoint('top-mount')
            : new THREE.Vector3(0, H - 0.12, 0);
          return {
            pos: new THREE.Vector3(ox + 0.68, pt.y - 0.12, oz + 0.82),
            target: new THREE.Vector3(ox, pt.y, oz),
          };
        }
        case 'full-rig':
        default: {
          const s = stateRef.current;
          const isPortraitMobile =
            typeof window !== 'undefined' &&
            window.innerWidth < 640 &&
            window.innerHeight > window.innerWidth;
          const fullPose = computeFullRoomCamera(
            s.config.roomWidthM,
            s.config.roomDepthM,
            heightCm,
            isPortraitMobile,
            s.poles.length > 1
          );
          return {
            pos: new THREE.Vector3(...fullPose.pos),
            target: new THREE.Vector3(...fullPose.target),
          };
        }
      }
    };

    useImperativeHandle(ref, () => ({
      focusCamera: (preset: CameraFocusId) => {
        const { pos, target } = computeCameraPreset(preset, stateRef.current.config.ceilingHeightCm);
        sceneApiRef.current.startCameraTransition(pos, target);
      },
      focusPart: (partId: HardwarePartId) => {
        const anchor = getActivePoleAnchor();
        if (!anchor.handle) return;
        const pt = anchor.handle.getPartFocusPoint(partId);
        const offsetDist = partId === 'lower-tube' || partId === 'upper-tube' ? 1.15 : 0.62;
        const pos = new THREE.Vector3(
          anchor.x + offsetDist * 0.72,
          pt.y + 0.14,
          anchor.z + offsetDist
        );
        sceneApiRef.current.startCameraTransition(pos, new THREE.Vector3(anchor.x, pt.y, anchor.z));
      },
      exportCAD: async (format: CadFormat) => {
        const anchor = getActivePoleAnchor();
        if (!anchor.handle) throw new Error('3D rig not initialized');
        return exportPoleCAD(anchor.handle.root, stateRef.current.config, format);
      },
      generateUSDZUrl: async () => {
        const anchor = getActivePoleAnchor();
        if (!anchor.handle) throw new Error('3D rig not initialized');
        return buildQuickLookUSDZUrl(anchor.handle.root);
      },
    }));

    useEffect(() => {
      const container = mountRef.current;
      if (!container) return;

      const isSoftwareGl = detectSoftwareWebGL();
      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(44, width / height, 0.05, 60);
      const initialCam = computeCameraPreset('full-rig', stateRef.current.config.ceilingHeightCm);
      camera.position.copy(initialCam.pos);

      const renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.shadowMap.enabled = !isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      container.appendChild(renderer.domElement);

      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      const envRT = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = envRT.texture;
      pmremGenerator.dispose();

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.copy(initialCam.target);
      controls.enableDamping = !isSoftwareGl;
      controls.dampingFactor = 0.07;
      controls.minDistance = 0.35;
      controls.maxDistance = 18;
      controls.maxPolarAngle = Math.PI * 0.495;
      controls.minPolarAngle = 0.08;
      controls.update();

      const textures = createProceduralTextures(renderer.capabilities.getMaxAnisotropy());
      const env = createEnvironmentRig(scene, textures, isSoftwareGl);
      const arCloudRig = createARPointCloudRig(scene);

      // Create reusable pool of up to MAX_POLES_IN_STUDIO pole assemblies (zero runtime leaks)
      const polePool: PoleAssemblyHandle[] = [];
      const poleGeoKeys: string[] = [];
      const spinAngles: number[] = [];
      const spinVels: number[] = [];

      for (let i = 0; i < MAX_POLES_IN_STUDIO; i++) {
        const handle = createPoleAssembly(textures);
        handle.root.visible = i === 0;
        scene.add(handle.root);
        polePool.push(handle);
        poleGeoKeys.push('');
        spinAngles.push(0);
        spinVels.push(0);
      }

      let draggingPoleIdx: number | null = null;
      let dragHitWall = false;

      function getRenderedPoleConfigs(): {
        id: string;
        rig: PoleRigConfig;
        x: number;
        z: number;
        isSelected: boolean;
      }[] {
        const s = stateRef.current;
        if (s.arCameraActive) {
          // Always keep the 3D pole visible live on the camera feed!
          const active = s.poles.find((p) => p.id === s.activePoleId) ?? s.poles[0];
          const arHeightCm = Math.max(
            MIN_CEILING_HEIGHT_CM,
            Math.min(MAX_CEILING_HEIGHT_CM, s.arMeasurement.ceilingHeightCm)
          );
          const calibratedZ = s.arSurfaceCalibration?.valid
            ? Number((s.arMeasurement.distanceM + s.arSurfaceCalibration.centroidZ).toFixed(3))
            : 0;
          return [
            {
              id: active.id,
              rig: {
                ...s.config,
                finish: active.finish,
                diameterMm: active.diameterMm,
                mount: s.arMeasurement.recommendedMount,
                ceilingType: 'flat',
                ceilingHeightCm: arHeightCm,
                poleHeightCm: Math.min(arHeightCm, MAX_POLE_HEIGHT_CM),
                cushionPlacement: active.cushionPlacement,
                isSpinning: active.isSpinning,
                spinRpm: active.spinRpm,
              },
              x: s.arMeasurement.poleOffsetXM,
              z: calibratedZ,
              isSelected: true,
            },
          ];
        }
        if (s.compareMode) {
          const active = s.poles.find((p) => p.id === s.activePoleId) ?? s.poles[0];
          const leftCeilCm = computeLocalCeilingHeightCm(
            s.config.ceilingHeightCm,
            s.config.roomWidthM,
            s.config.ceilingType,
            s.config.vaultAngleDeg,
            -0.58
          );
          const rightCeilCm = computeLocalCeilingHeightCm(
            s.config.ceilingHeightCm,
            s.config.roomWidthM,
            s.config.ceilingType,
            s.config.vaultAngleDeg,
            0.58
          );
          const leftRig: PoleRigConfig = {
            ...s.config,
            finish: active.finish,
            diameterMm: active.diameterMm,
            ceilingHeightCm: leftCeilCm,
            poleHeightCm: Math.min(active.heightCm, leftCeilCm),
            cushionPlacement: active.cushionPlacement,
            isSpinning: active.isSpinning,
            spinRpm: active.spinRpm,
          };
          const rightRig: PoleRigConfig = {
            ...leftRig,
            finish: s.compareFinish,
            ceilingHeightCm: rightCeilCm,
            poleHeightCm: Math.min(active.heightCm, rightCeilCm),
          };
          return [
            { id: 'compare-left', rig: leftRig, x: -0.58, z: 0, isSelected: true },
            { id: 'compare-right', rig: rightRig, x: 0.58, z: 0, isSelected: false },
          ];
        }

        return s.poles.slice(0, MAX_POLES_IN_STUDIO).map((p) => {
          const localCeilCm = computeLocalCeilingHeightCm(
            s.config.ceilingHeightCm,
            s.config.roomWidthM,
            s.config.ceilingType,
            s.config.vaultAngleDeg,
            p.x
          );
          return {
            id: p.id,
            rig: {
              ...s.config,
              finish: p.finish,
              diameterMm: p.diameterMm,
              ceilingHeightCm: localCeilCm,
              poleHeightCm: Math.min(p.heightCm, localCeilCm),
              cushionPlacement: p.cushionPlacement,
              isSpinning: p.isSpinning,
              spinRpm: p.spinRpm,
            },
            x: p.x,
            z: p.z,
            isSelected: p.id === s.activePoleId,
          };
        });
      }

      function syncPolesAndEnv(): void {
        const s = stateRef.current;
        const rendered = getRenderedPoleConfigs();
        const markers: FloorPoleMarker[] = [];

        for (let i = 0; i < MAX_POLES_IN_STUDIO; i++) {
          const item = rendered[i];
          const handle = polePool[i];
          if (!item) {
            handle.root.visible = false;
            continue;
          }
          handle.root.visible = true;
          handle.root.position.set(item.x, 0, item.z);

          const gKey = `${item.rig.finish}-${item.rig.diameterMm}-${item.rig.mount}-${item.rig.ceilingType}-${item.rig.ceilingHeightCm}-${item.rig.poleHeightCm}-${item.rig.cushionPlacement}-${item.rig.vaultAngleDeg}-${item.rig.roomWidthM.toFixed(2)}`;
          if (poleGeoKeys[i] !== gKey) {
            handle.rebuild(item.rig);
            poleGeoKeys[i] = gKey;
          }
          // Tag interactable proxies with pole index & id for multi-pole click/drag
          handle.interactables.forEach((obj) => {
            obj.userData.poleIdx = i;
            obj.userData.poleId = item.id;
          });

          markers.push({
            x: item.x,
            z: item.z,
            mount: item.rig.mount,
            isSelected: item.isSelected,
          });
        }

        const activeMount = s.config.mount;
        env.update(
          s.config,
          s.arCameraActive,
          renderer,
          markers,
          {
            active: (s.moveMode || draggingPoleIdx !== null) && !s.compareMode,
            hitWall: dragHitWall,
            activeMount,
          },
          s.roomReplica,
          s.showInferredObjects
        );
        arCloudRig.update(
          s.arCameraActive,
          s.arScanPhase,
          s.arPointCloud,
          s.arMeasurement,
          s.arShowPointCloud,
          s.arSurfaceCalibration,
          s.arPartialFloorPoints
        );
      }

      syncPolesAndEnv();

      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }

      let smoothedExploded = stateRef.current.explodedFactor;
      let smoothedProgress = stateRef.current.assemblyProgress;
      let elapsedSec = 0;
      let lastFrameTime = performance.now();
      let lastStepIdx = 6;
      let lastPlaybackEmit = 0;

      let camTransitionActive = false;
      let userOverrodePlaybackCam = false;
      let prevPlaybackMode: 'idle' | 'assemble' | 'dismantle' = stateRef.current.playbackMode;
      let prevCameraMotion: CameraMotionMode = stateRef.current.cameraMotion;
      let orbitAngleRad = 0.45;
      const startCameraTransition = (pos: THREE.Vector3, target: THREE.Vector3) => {
        _camGoalPos.copy(pos);
        _camGoalTarget.copy(target);
        camTransitionActive = true;
        requestRender();
      };

      controls.addEventListener('start', () => {
        camTransitionActive = false;
        if (stateRef.current.playbackMode !== 'idle') {
          userOverrodePlaybackCam = true;
        }
        if (stateRef.current.cameraMotion !== 'manual') {
          stateRef.current.onCancelCameraMotion();
        }
      });

      let frameId = 0;
      let disposed = false;
      let renderBusy = false;
      let renderDirty = false;

      function afterDraw(cb: () => void) {
        if (disposed) return;
        const gl = renderer.getContext() as WebGL2RenderingContext;
        if (!gl || typeof gl.fenceSync !== 'function') {
          frameId = window.setTimeout(cb, 80);
          return;
        }
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) {
            if (sync) gl.deleteSync(sync);
            return;
          }
          const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
          if (status === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      }

      function needsContinuousAnimation(): boolean {
        const s = stateRef.current;
        if (s.playbackMode !== 'idle') return true;
        if (s.cameraMotion !== 'manual') return true;
        if (s.poles.some((p) => p.isSpinning && p.spinRpm > 0)) return true;
        if (s.highlightFasteners) return true;
        if (camTransitionActive) return true;
        if (Math.abs(smoothedExploded - s.explodedFactor) > 0.002) return true;
        if (Math.abs(smoothedProgress - s.assemblyProgress) > 0.002) return true;
        if (spinVels.some((v) => Math.abs(v) > 0.01)) return true;
        return false;
      }

      function stepAndRender(): void {
        if (disposed) return;
        const now = performance.now();
        const dt = Math.min(0.1, Math.max(0.001, (now - lastFrameTime) / 1000));
        lastFrameTime = now;
        elapsedSec += dt;

        const s = stateRef.current;
        const rendered = getRenderedPoleConfigs();

        // Snap animation progress & re-enable auto-tracking camera when a new install/dismantle run starts
        if (s.playbackMode !== prevPlaybackMode) {
          if (s.playbackMode !== 'idle') {
            smoothedProgress = s.assemblyProgress;
            userOverrodePlaybackCam = false;
            camTransitionActive = false;
          }
          prevPlaybackMode = s.playbackMode;
        }

        if (s.playbackMode !== 'idle') {
          const dir = s.playbackMode === 'assemble' ? 1 : -1;
          const speedPerSec = 0.145;
          const next = THREE.MathUtils.clamp(smoothedProgress + dir * speedPerSec * dt, 0, 1);
          smoothedProgress = next;
          const finished = (dir === 1 && next >= 0.999) || (dir === -1 && next <= 0.001);

          const stepIdx = Math.min(6, Math.floor(next * 7));
          if (stepIdx !== lastStepIdx) {
            lastStepIdx = stepIdx;
            soundFx.playTorqueClick();
          }

          if (finished || now - lastPlaybackEmit > 110) {
            lastPlaybackEmit = now;
            s.onPlaybackProgress(next, finished);
          }
        } else {
          smoothedProgress = THREE.MathUtils.damp(smoothedProgress, s.assemblyProgress, 8, dt);
        }

        smoothedExploded = THREE.MathUtils.damp(smoothedExploded, s.explodedFactor, 7.5, dt);

        const activeRenderedIdx = Math.max(
          0,
          rendered.findIndex((r) => r.isSelected)
        );
        const activePoleItem = rendered[activeRenderedIdx] ?? rendered[0];

        // Apply kinematics to all active poles in the scene
        const offsets = computeAssemblyOffsets(smoothedProgress, smoothedExploded, elapsedSec);
        if (s.playbackMode === 'idle') {
          offsets.activeStepIndex = Math.min(
            6,
            Math.max(0, Math.floor(s.assemblyProgress >= 0.999 ? 6 : s.assemblyProgress * 7))
          );
        }

        const assembledOffsets = computeAssemblyOffsets(1, 0, elapsedSec);

        for (let i = 0; i < rendered.length; i++) {
          const item = rendered[i];
          const handle = polePool[i];
          const isPrimary = item.isSelected;
          const targetVel =
            item.rig.isSpinning && (!isPrimary || (smoothedProgress > 0.92 && smoothedExploded < 0.1))
              ? (item.rig.spinRpm * Math.PI * 2) / 60
              : 0;
          spinVels[i] = THREE.MathUtils.damp(spinVels[i], targetVel, 3.6, dt);
          spinAngles[i] += spinVels[i] * dt;

          handle.applyKinematics(
            isPrimary ? offsets : assembledOffsets,
            item.rig,
            isPrimary ? s.highlightFasteners : false,
            isPrimary ? s.selectedPart : null,
            spinAngles[i]
          );
        }

        // Keep WebGL viewport size & aspect synced whenever container padding changes (e.g., entering/exiting AR mode)
        const cw = container?.clientWidth || window.innerWidth;
        const ch = container?.clientHeight || window.innerHeight;
        if (Math.abs(camera.aspect - cw / ch) > 0.002) {
          camera.aspect = cw / ch;
          camera.updateProjectionMatrix();
          renderer.setSize(cw, ch);
        }

        // Camera Sync: Pixel-Accurate Optical AR Projection vs Studio Camera Modes
        if (s.arCameraActive) {
          controls.enabled = false;
          if (Math.abs(camera.fov - s.arMarkers.vfovDeg) > 0.25) {
            camera.fov = s.arMarkers.vfovDeg;
            camera.updateProjectionMatrix();
          }
          const camH = s.arMarkers.cameraHeightM;
          const dist = s.arMeasurement.distanceM;
          const pitchRad = (s.arMarkers.cameraPitchDeg * Math.PI) / 180;
          camera.position.set(0, camH, dist);
          camera.lookAt(0, camH + Math.tan(pitchRad) * dist, 0);
        } else {
          if (!controls.enabled && draggingPoleIdx === null) {
            controls.enabled = true;
          }
          if (Math.abs(camera.fov - 44) > 0.25) {
            camera.fov = 44;
            camera.updateProjectionMatrix();
          }
          // Initialize orbit phase seamlessly from current camera angle on entering 'orbit'
          if (s.cameraMotion !== prevCameraMotion) {
            if (s.cameraMotion === 'orbit') {
              const cxInit = s.compareMode ? 0 : activePoleItem?.x ?? 0;
              const czInit = s.compareMode ? 0 : activePoleItem?.z ?? 0;
              orbitAngleRad = Math.atan2(
                camera.position.x - cxInit,
                camera.position.z - czInit
              );
              camTransitionActive = false;
            }
            prevCameraMotion = s.cameraMotion;
          }

          // Dynamic Perspective Camera Animations (Inside-Room Orbit / Hero Crane / Auto-Tracking Install-Dismantle)
          if (s.cameraMotion !== 'manual') {
            const H = s.config.ceilingHeightCm / 100;
            const cx = s.compareMode ? 0 : activePoleItem?.x ?? 0;
            const cz = s.compareMode ? 0 : activePoleItem?.z ?? 0;

            if (s.cameraMotion === 'orbit') {
              orbitAngleRad += 0.45 * dt;
              const desiredR = s.compareMode
                ? Math.min(2.45, Math.min(s.config.roomWidthM, s.config.roomDepthM) * 0.46)
                : Math.min(2.25, Math.min(s.config.roomWidthM, s.config.roomDepthM) * 0.44);
              const orbitPos = computeInRoomOrbitPosition(
                orbitAngleRad,
                cx,
                cz,
                s.config.roomWidthM,
                s.config.roomDepthM,
                H,
                elapsedSec,
                desiredR,
                s.config.ceilingType === 'vaulted',
                s.config.vaultAngleDeg
              );
              const k = 1 - Math.exp(-4.6 * dt);
              const nextX = THREE.MathUtils.lerp(camera.position.x, orbitPos.x, k);
              const nextY = THREE.MathUtils.lerp(camera.position.y, orbitPos.y, k);
              const nextZ = THREE.MathUtils.lerp(camera.position.z, orbitPos.z, k);
              // Hard-enforce solid back & left wall interior boundaries so camera NEVER passes behind walls!
              camera.position.x = Math.max(orbitPos.bounds.xMin, nextX);
              camera.position.y = THREE.MathUtils.clamp(
                nextY,
                orbitPos.bounds.yMin,
                orbitPos.bounds.yMax
              );
              camera.position.z = Math.max(orbitPos.bounds.zMin, nextZ);
              controls.target.lerp(_camGoalTarget.set(cx, H * 0.42, cz), k);
            } else if (s.cameraMotion === 'crane') {
              // Hero Crane Sweep: smooth low-to-high ascending/descending architectural reveal
              const wave = (Math.sin(elapsedSec * 0.55 - Math.PI / 2) + 1) * 0.5;
              const ang = THREE.MathUtils.lerp(-0.48, 0.55, wave);
              const dist = THREE.MathUtils.lerp(1.9, 3.1, Math.sin(wave * Math.PI));
              const targetPosX = cx + Math.sin(ang) * dist;
              const targetPosZ = cz + Math.cos(ang) * dist;
              const targetPosY = THREE.MathUtils.lerp(0.32, H * 0.84, wave);
              const lookY = THREE.MathUtils.lerp(0.28, H * 0.72, wave);
              const k = 1 - Math.exp(-3.8 * dt);
              camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetPosX, k);
              camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetPosY, k);
              camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetPosZ, k);
              controls.target.lerp(_camGoalTarget.set(cx, lookY, cz), k);
            }
          } else if (s.playbackMode !== 'idle' && !userOverrodePlaybackCam && activePoleItem) {
            // Prominent Auto-Tracking Camera during Install & Dismantle: smoothly frames the active fastener/joint
            const stepSpec = ASSEMBLY_STEPS[offsets.activeStepIndex] ?? ASSEMBLY_STEPS[0];
            const activeHandle = polePool[activeRenderedIdx];
            const focusPt = activeHandle
              ? activeHandle.getPartFocusPoint(stepSpec.partId)
              : new THREE.Vector3(0, (s.config.ceilingHeightCm / 100) * 0.5, 0);
            const cx = activePoleItem.x;
            const cz = activePoleItem.z;
            const isTubeStep = stepSpec.partId === 'lower-tube' || stepSpec.partId === 'upper-tube';
            const radius = isTubeStep ? 1.85 : 1.18;
            const sweepAngle = 0.52 + Math.sin(elapsedSec * 0.45) * 0.24;
            const yOffset = stepSpec.partId === 'top-mount' || stepSpec.partId === 'adjuster-rod' ? -0.08 : 0.22;

            const desiredPosX = cx + Math.sin(sweepAngle) * radius;
            const desiredPosZ = cz + Math.cos(sweepAngle) * radius;
            const desiredPosY = Math.max(0.28, focusPt.y + yOffset);
            const k = 1 - Math.exp(-3.4 * dt);

            camera.position.x = THREE.MathUtils.lerp(camera.position.x, desiredPosX, k);
            camera.position.y = THREE.MathUtils.lerp(camera.position.y, desiredPosY, k);
            camera.position.z = THREE.MathUtils.lerp(camera.position.z, desiredPosZ, k);
            controls.target.lerp(_camGoalTarget.set(cx, focusPt.y, cz), k);
          } else if (camTransitionActive) {
            camera.position.lerp(_camGoalPos, 1 - Math.exp(-6.5 * dt));
            controls.target.lerp(_camGoalTarget, 1 - Math.exp(-6.5 * dt));
            if (
              camera.position.distanceTo(_camGoalPos) < 0.015 &&
              controls.target.distanceTo(_camGoalTarget) < 0.015
            ) {
              camera.position.copy(_camGoalPos);
              controls.target.copy(_camGoalTarget);
              camTransitionActive = false;
            }
          }
          controls.update();
        }

        renderer.setClearAlpha(s.arCameraActive ? 0 : 1);
        renderer.render(scene, camera);
      }

      function requestRender(): void {
        if (disposed) return;
        if (renderBusy) {
          renderDirty = true;
          return;
        }
        renderBusy = true;
        frameId = window.requestAnimationFrame(() => {
          if (disposed) return;
          renderDirty = false;
          stepAndRender();
          const done = () => {
            if (disposed) return;
            renderBusy = false;
            if (renderDirty || needsContinuousAnimation()) {
              requestRender();
            }
          };
          if (isSoftwareGl) {
            afterDraw(done);
          } else {
            done();
          }
        });
      }

      controls.addEventListener('change', requestRender);

      // --- POINTER INTERACTION: CLICK TO INSPECT / SELECT POLE + DRAG ON FLOOR TO MOVE POLE ---
      const raycaster = new THREE.Raycaster();
      let pointerDownX = 0;
      let pointerDownY = 0;

      const getAllVisibleInteractables = (): THREE.Object3D[] => {
        const list: THREE.Object3D[] = [];
        for (let i = 0; i < MAX_POLES_IN_STUDIO; i++) {
          if (polePool[i].root.visible) {
            list.push(...polePool[i].interactables);
          }
        }
        return list;
      };

      const updateNdc = (e: PointerEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        _pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        _pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      };

      const onPointerDown = (e: PointerEvent) => {
        pointerDownX = e.clientX;
        pointerDownY = e.clientY;
        const s = stateRef.current;

        // Allow dragging poles when Move Mode is active OR while holding Shift
        if ((s.moveMode || e.shiftKey) && !s.compareMode) {
          updateNdc(e);
          raycaster.setFromCamera(_pointerNdc, camera);
          const hits = raycaster.intersectObjects(getAllVisibleInteractables(), false);
          if (hits.length > 0) {
            const pIdx = hits[0].object.userData.poleIdx as number | undefined;
            const pId = hits[0].object.userData.poleId as string | undefined;
            if (pIdx !== undefined && pId) {
              draggingPoleIdx = pIdx;
              dragHitWall = false;
              controls.enabled = false;
              s.onSelectPole(pId);
              if (raycaster.ray.intersectPlane(_floorPlane, _floorHit)) {
                const targetPole = s.poles[pIdx];
                if (targetPole) {
                  _dragOffset.set(targetPole.x - _floorHit.x, 0, targetPole.z - _floorHit.z);
                }
              }
              renderer.domElement.setPointerCapture(e.pointerId);
              syncPolesAndEnv();
              requestRender();
            }
          }
        }
      };

      const onPointerMove = (e: PointerEvent) => {
        if (draggingPoleIdx === null) return;
        const s = stateRef.current;
        const poleItem = s.poles[draggingPoleIdx];
        if (!poleItem) return;

        updateNdc(e);
        raycaster.setFromCamera(_pointerNdc, camera);
        if (raycaster.ray.intersectPlane(_floorPlane, _floorHit)) {
          const rawX = _floorHit.x + _dragOffset.x;
          const rawZ = _floorHit.z + _dragOffset.z;
          const others = s.poles.filter((p) => p.id !== poleItem.id);
          const clamped = clampPolePosition(
            rawX,
            rawZ,
            s.config.roomWidthM,
            s.config.roomDepthM,
            s.config.mount,
            others,
            s.config.enforceMinClearance
          );

          dragHitWall = clamped.hitWallBoundary || clamped.hitPoleBoundary;
          polePool[draggingPoleIdx].root.position.set(clamped.x, 0, clamped.z);
          s.onMovePole(poleItem.id, clamped.x, clamped.z, clamped);
          syncPolesAndEnv();
          requestRender();
        }
      };

      const onPointerUp = (e: PointerEvent) => {
        if (draggingPoleIdx !== null) {
          draggingPoleIdx = null;
          dragHitWall = false;
          controls.enabled = true;
          if (renderer.domElement.hasPointerCapture(e.pointerId)) {
            renderer.domElement.releasePointerCapture(e.pointerId);
          }
          syncPolesAndEnv();
          requestRender();
          return;
        }

        const dist = Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY);
        if (dist > 6) return;

        updateNdc(e);
        raycaster.setFromCamera(_pointerNdc, camera);
        const hits = raycaster.intersectObjects(getAllVisibleInteractables(), false);
        if (hits.length > 0) {
          const pIdx = hits[0].object.userData.poleIdx as number | undefined;
          const pId = hits[0].object.userData.poleId as string | undefined;
          const partId = hits[0].object.userData.partId as HardwarePartId | undefined;
          const s = stateRef.current;

          if (!s.compareMode && pId && pId !== s.activePoleId) {
            soundFx.playDetent();
            s.onSelectPole(pId);
            return;
          }

          if (partId && pIdx !== undefined) {
            soundFx.playDetent();
            s.onSelectPart(partId);
            const handle = polePool[pIdx];
            const pt = handle.getPartFocusPoint(partId);
            const ox = handle.root.position.x;
            const oz = handle.root.position.z;
            const offsetDist = partId === 'lower-tube' || partId === 'upper-tube' ? 1.15 : 0.62;
            startCameraTransition(
              new THREE.Vector3(ox + offsetDist * 0.72, pt.y + 0.14, oz + offsetDist),
              new THREE.Vector3(ox, pt.y, oz)
            );
          }
        }
      };

      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      renderer.domElement.addEventListener('pointermove', onPointerMove);
      renderer.domElement.addEventListener('pointerup', onPointerUp);

      const handleResize = () => {
        if (!container || disposed) return;
        const w = container.clientWidth || window.innerWidth;
        const h = container.clientHeight || window.innerHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        requestRender();
      };
      window.addEventListener('resize', handleResize);

      const onContextLost = (e: Event) => {
        e.preventDefault();
        setContextLost(true);
      };
      const onContextRestored = () => {
        setContextLost(false);
        requestRender();
      };
      renderer.domElement.addEventListener('webglcontextlost', onContextLost);
      renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

      sceneApiRef.current = {
        polePool,
        poleGeoKeys,
        env,
        arCloudRig,
        camera,
        controls,
        renderer,
        requestRender,
        startCameraTransition,
        syncPolesAndEnv,
      };

      requestRender();

      return () => {
        disposed = true;
        window.cancelAnimationFrame(frameId);
        window.clearTimeout(frameId);
        window.removeEventListener('resize', handleResize);
        renderer.domElement.removeEventListener('pointerdown', onPointerDown);
        renderer.domElement.removeEventListener('pointermove', onPointerMove);
        renderer.domElement.removeEventListener('pointerup', onPointerUp);
        renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
        renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
        controls.dispose();
        polePool.forEach((p) => p.dispose());
        arCloudRig.dispose();
        env.dispose();
        textures.dispose();
        envRT.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement);
        }
      };
    }, []);

    useEffect(() => {
      const api = sceneApiRef.current;
      if (!api.env || !api.renderer) return;
      api.syncPolesAndEnv();
      api.requestRender();
    }, [
      config,
      poles,
      activePoleId,
      moveMode,
      compareMode,
      compareFinish,
      arCameraActive,
      arMarkers,
      arMeasurement,
      arScanPhase,
      arPointCloud,
      arShowPointCloud,
      arSurfaceCalibration,
      arPartialFloorPoints,
      roomReplica,
      showInferredObjects,
    ]);

    useEffect(() => {
      sceneApiRef.current.requestRender();
    }, [assemblyProgress, explodedFactor, highlightFasteners, selectedPart, playbackMode, cameraMotion]);

    return (
      <div className="relative w-full h-full select-none" data-testid="pole-viewport-3d">
        <div
          ref={mountRef}
          className={`w-full h-full ${
            moveMode && !compareMode
              ? 'cursor-move'
              : 'cursor-grab active:cursor-grabbing'
          }`}
          aria-label="Interactive 3D pole setup viewport. Drag to orbit, or enable Move mode to reposition poles within safe room clearance."
        />

        {contextLost && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0e1017] text-stone-100 p-6">
            <div className="max-w-sm border border-zinc-800 bg-zinc-900 p-5 rounded-xl text-center">
              <h2 className="text-sm font-semibold mb-1.5">3D Context Interrupted</h2>
              <p className="text-xs text-zinc-400">
                Reload or return to this tab to restore the studio viewport.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }
);
