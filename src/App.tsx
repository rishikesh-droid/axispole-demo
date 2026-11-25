import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CameraFocusId,
  CameraMotionMode,
  DockTabId,
  HardwarePartId,
  ModalId,
  PoleClampResult,
  PoleContextMenuState,
  PoleFinishId,
  PoleInstance,
  PoleRigConfig,
  ReplicaRenderMode,
  RoomReplicaScene,
  SidebarDensity,
  ViewportMode,
} from './types/pole';
import {
  analyzeFloorClearance,
  ASSEMBLY_STEPS,
  canFitAdditionalPole,
  clampPoleHeightCm,
  clampPolePosition,
  createInitialPoles,
  DEFAULT_CONFIG,
  generateMultiPoleBOM,
  getMinRoomSizeM,
  isDarkLighting,
  MAX_CEILING_HEIGHT_CM,
  MIN_CEILING_HEIGHT_CM,
  reconcilePolesForCeilingHeight,
  tryCreateNextPoleInstance,
} from './utils/poleConfig';
import { soundFx } from './utils/soundFx';
import {
  calculateARMeasurement,
  DEFAULT_AR_MARKERS,
  type ARMarkerState,
  type ARMeasurementResult,
} from './utils/arMeasure';
import type { ARPoint3D } from './utils/arPointCloud';
import {
  buildMeasurementFromSurfaceCalibration,
  screenToFloorPoint3D,
  solveFloorSurfaceCalibration,
  type FloorPoint3D,
  type FloorTapPoint2D,
} from './utils/arSurfaceCalibration';
import type { ARScanPhase } from './three/arPointCloudMesh';
import { TopBar } from './components/TopBar';
import { PoleViewport3D, type PoleViewportHandle } from './components/PoleViewport3D';
import { InspectorCallout } from './components/InspectorCallout';
import { ControlSidebar } from './components/ControlSidebar';
import { ViewportModeBar } from './components/ViewportModeBar';
import { FloorPlanView } from './components/FloorPlanView';
import { PoleContextMenu } from './components/PoleContextMenu';
import { Modals } from './components/Modals';
import { ARMeasurementOverlay } from './components/ARMeasurementOverlay';
import type { CadFormat } from './three/cadExporter';

export default function App() {
  const [config, setConfig] = useState<PoleRigConfig>(DEFAULT_CONFIG);
  const [poles, setPoles] = useState<PoleInstance[]>(() => createInitialPoles());
  const [activePoleId, setActivePoleId] = useState<string>('pole-1');

  // Compare Mode, Floor Placement & Dynamic Camera State
  const [compareMode, setCompareMode] = useState(false);
  const [compareFinish, setCompareFinish] = useState<PoleFinishId>('stainless');
  const [moveMode, setMoveMode] = useState(false);
  const [lastClamp, setLastClamp] = useState<PoleClampResult | null>(null);
  const [cameraMotion, setCameraMotion] = useState<CameraMotionMode>('manual');

  const [activeTab, setActiveTab] = useState<DockTabId>('configure');
  const [viewportMode, setViewportMode] = useState<ViewportMode>('3d');
  const [sidebarDensity, setSidebarDensity] = useState<SidebarDensity>('full');
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalId>('none');
  const [contextMenu, setContextMenu] = useState<PoleContextMenuState | null>(null);
  const [floorPlanResetZoomSignal, setFloorPlanResetZoomSignal] = useState(0);

  // Assembly & inspection state
  const [assemblyProgress, setAssemblyProgress] = useState(1.0);
  const [explodedFactor, setExplodedFactor] = useState(0.0);
  const [highlightFasteners, setHighlightFasteners] = useState(false);
  const [selectedPart, setSelectedPart] = useState<HardwarePartId | null>(null);
  const [playbackMode, setPlaybackMode] = useState<'idle' | 'assemble' | 'dismantle'>('idle');
  const [soundEnabled, setSoundEnabled] = useState(false);

  // Live Camera AR Pole Fit & Optional Room Calibration state
  const [arCameraActive, setArCameraActive] = useState(false);
  const [arStream, setArStream] = useState<MediaStream | null>(null);
  const [arCameraError, setArCameraError] = useState<string | null>(null);
  const [arMarkers, setArMarkers] = useState<ARMarkerState>(DEFAULT_AR_MARKERS);
  const [arScanPhase, setArScanPhase] = useState<ARScanPhase>('pole-ready');
  const [arFloorTaps, setArFloorTaps] = useState<FloorTapPoint2D[]>([]);
  const [arPointCloud, setArPointCloud] = useState<ARPoint3D[]>([]);
  const [arShowPointCloud, setArShowPointCloud] = useState(false);
  const [arUploadedPhotoUrl, setArUploadedPhotoUrl] = useState<string | null>(null);
  const [roomReplica, setRoomReplica] = useState<RoomReplicaScene | null>(null);
  const [showInferredObjects, setShowInferredObjects] = useState(true);
  const [replicaRenderMode, setReplicaRenderMode] = useState<ReplicaRenderMode>('wireframe');
  const [showReplicaDimensions, setShowReplicaDimensions] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const viewportRef = useRef<PoleViewportHandle | null>(null);

  const activePole = useMemo(
    () => poles.find((p) => p.id === activePoleId) ?? poles[0],
    [poles, activePoleId]
  );

  const arPartialFloorPoints = useMemo<FloorPoint3D[]>(() => {
    const out: FloorPoint3D[] = [];
    for (const tap of arFloorTaps) {
      const p3 = screenToFloorPoint3D(tap.u, tap.v, arMarkers, tap.id);
      if (p3) out.push(p3);
    }
    return out;
  }, [arFloorTaps, arMarkers]);

  const arSurfaceCalibration = useMemo(
    () => solveFloorSurfaceCalibration(arFloorTaps, arMarkers),
    [arFloorTaps, arMarkers]
  );

  const arMeasurement = useMemo(() => {
    if (arSurfaceCalibration?.valid) {
      return buildMeasurementFromSurfaceCalibration(
        arSurfaceCalibration,
        arMarkers,
        activePole.finish
      );
    }
    return calculateARMeasurement(arMarkers, activePole.finish);
  }, [arSurfaceCalibration, arMarkers, activePole.finish]);

  // Synced rig config representing the currently active pole for modals & CAD export
  const activeRigConfig = useMemo<PoleRigConfig>(
    () => ({
      ...config,
      finish: activePole.finish,
      diameterMm: activePole.diameterMm,
      poleHeightCm: activePole.heightCm,
      cushionPlacement: activePole.cushionPlacement,
      isSpinning: activePole.isSpinning,
      spinRpm: activePole.spinRpm,
    }),
    [config, activePole]
  );

  const bom = useMemo(() => generateMultiPoleBOM(poles, config), [poles, config]);
  const clearance = useMemo(
    () =>
      analyzeFloorClearance(
        config.roomWidthM,
        config.roomDepthM,
        config.mount,
        config.enforceMinClearance
      ),
    [config.roomWidthM, config.roomDepthM, config.mount, config.enforceMinClearance]
  );

  const canAddPole = useMemo(
    () =>
      canFitAdditionalPole(
        poles,
        config.roomWidthM,
        config.roomDepthM,
        config.mount,
        config.enforceMinClearance
      ),
    [poles, config.roomWidthM, config.roomDepthM, config.mount, config.enforceMinClearance]
  );

  const activeStepIndex = Math.min(
    ASSEMBLY_STEPS.length - 1,
    Math.floor(
      assemblyProgress >= 0.999 ? ASSEMBLY_STEPS.length - 1 : assemblyProgress * ASSEMBLY_STEPS.length
    )
  );

  const handleChangeConfig = useCallback((patch: Partial<PoleRigConfig>) => {
    soundFx.playDetent();
    setConfig((prev) => {
      const nextEnforce = patch.enforceMinClearance ?? prev.enforceMinClearance;
      const minRoom = getMinRoomSizeM(nextEnforce);
      const nextCeilingCm =
        patch.ceilingHeightCm !== undefined
          ? Math.max(MIN_CEILING_HEIGHT_CM, Math.min(MAX_CEILING_HEIGHT_CM, Math.round(patch.ceilingHeightCm)))
          : prev.ceilingHeightCm;
      const next = {
        ...prev,
        ...patch,
        ceilingHeightCm: nextCeilingCm,
        enforceMinClearance: nextEnforce,
        roomWidthM: Math.max(minRoom, patch.roomWidthM ?? prev.roomWidthM),
        roomDepthM: Math.max(minRoom, patch.roomDepthM ?? prev.roomDepthM),
      };

      const needsRoomClamp =
        patch.roomWidthM !== undefined ||
        patch.roomDepthM !== undefined ||
        patch.enforceMinClearance !== undefined ||
        patch.mount !== undefined;
      const needsCeilingSync =
        patch.ceilingHeightCm !== undefined && nextCeilingCm !== prev.ceilingHeightCm;

      if (needsRoomClamp || needsCeilingSync) {
        setPoles((prevPoles) => {
          let updatedPoles = needsCeilingSync
            ? reconcilePolesForCeilingHeight(prevPoles, prev.ceilingHeightCm, nextCeilingCm)
            : prevPoles;

          if (needsRoomClamp) {
            const placed: PoleInstance[] = [];
            for (const p of updatedPoles) {
              const c = clampPolePosition(
                p.x,
                p.z,
                next.roomWidthM,
                next.roomDepthM,
                next.mount,
                placed,
                next.enforceMinClearance
              );
              placed.push({ ...p, x: c.x, z: c.z });
            }
            updatedPoles = placed;
          }
          return updatedPoles;
        });
      }
      return next;
    });
  }, []);

  const handleChangePoleById = useCallback(
    (poleId: string, patch: Partial<PoleInstance>) => {
      soundFx.playDetent();
      setPoles((prev) =>
        prev.map((p) => {
          if (p.id !== poleId) return p;
          return {
            ...p,
            ...patch,
            heightCm:
              patch.heightCm !== undefined
                ? clampPoleHeightCm(patch.heightCm, config.ceilingHeightCm)
                : p.heightCm,
          };
        })
      );
    },
    [config.ceilingHeightCm]
  );

  const handleChangeActivePole = useCallback(
    (patch: Partial<PoleInstance>) => {
      handleChangePoleById(activePole.id, patch);
    },
    [activePole.id, handleChangePoleById]
  );

  const handleApplyFinishToAll = useCallback((finish: PoleFinishId) => {
    soundFx.playDetent();
    setPoles((prev) => prev.map((p) => ({ ...p, finish })));
    setConfig((prev) => ({ ...prev, finish }));
  }, []);

  const handleAddPole = useCallback(
    (preferredPos?: { x: number; z: number }) => {
      const newPole = tryCreateNextPoleInstance(
        poles,
        config.roomWidthM,
        config.roomDepthM,
        config.enforceMinClearance,
        config.ceilingHeightCm,
        config.mount,
        preferredPos
      );
      if (!newPole) return;
      soundFx.playMetalSeat();
      setCompareMode(false);
      setPoles((prev) => [...prev, newPole]);
      setActivePoleId(newPole.id);
      if (viewportMode === '3d') {
        setMoveMode(true);
        viewportRef.current?.focusCamera('full-rig');
      }
    },
    [
      poles,
      config.roomWidthM,
      config.roomDepthM,
      config.enforceMinClearance,
      config.ceilingHeightCm,
      config.mount,
      viewportMode,
    ]
  );

  const handleRemovePoleById = useCallback(
    (poleId: string) => {
      if (poles.length <= 1) return;
      soundFx.playDetent();
      setPoles((prev) => {
        if (prev.length <= 1) return prev;
        const remaining = prev.filter((p) => p.id !== poleId);
        const renamed = remaining.map((p, idx) => ({ ...p, label: `Pole ${idx + 1}` }));
        if (activePoleId === poleId) {
          setActivePoleId(renamed[0].id);
        }
        return renamed;
      });
    },
    [poles.length, activePoleId]
  );

  const handleRemoveActivePole = useCallback(() => {
    handleRemovePoleById(activePole.id);
  }, [activePole.id, handleRemovePoleById]);

  const handleMovePole = useCallback(
    (poleId: string, x: number, z: number, clamp: PoleClampResult) => {
      setLastClamp(clamp);
      setPoles((prev) => prev.map((p) => (p.id === poleId ? { ...p, x, z } : p)));
    },
    []
  );

  const handleCenterPoleById = useCallback(
    (poleId: string) => {
      soundFx.playDetent();
      setPoles((prev) => {
        const others = prev.filter((p) => p.id !== poleId);
        const c = clampPolePosition(
          0,
          0,
          config.roomWidthM,
          config.roomDepthM,
          config.mount,
          others,
          config.enforceMinClearance
        );
        setLastClamp(c);
        return prev.map((p) => (p.id === poleId ? { ...p, x: c.x, z: c.z } : p));
      });
    },
    [config.mount, config.roomWidthM, config.roomDepthM, config.enforceMinClearance]
  );

  const handleCenterActivePole = useCallback(() => {
    handleCenterPoleById(activePole.id);
  }, [activePole.id, handleCenterPoleById]);

  const handleToggleCompareMode = useCallback(() => {
    soundFx.playDetent();
    setCompareMode((prev) => {
      const next = !prev;
      if (next) {
        setMoveMode(false);
        setSelectedPart(null);
        setActiveTab('configure');
        // Ensure right comparison finish contrasts with left finish by default
        if (compareFinish === activePole.finish) {
          setCompareFinish(activePole.finish === 'brass' ? 'stainless' : 'brass');
        }
        setCameraMotion('manual');
        window.setTimeout(() => viewportRef.current?.focusCamera('compare-pair'), 40);
      } else {
        window.setTimeout(() => viewportRef.current?.focusCamera('full-rig'), 40);
      }
      return next;
    });
  }, [compareFinish, activePole.finish]);

  const handleToggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      soundFx.enabled = next;
      if (next) soundFx.playTorqueClick();
      return next;
    });
  }, []);

  const handleFocusCamera = useCallback((preset: CameraFocusId) => {
    soundFx.playDetent();
    setCameraMotion('manual');
    viewportRef.current?.focusCamera(preset);
  }, []);

  const handlePlaybackProgress = useCallback((progress: number, finished: boolean) => {
    setAssemblyProgress(progress);
    if (finished) {
      setPlaybackMode('idle');
      soundFx.playMetalSeat();
    }
  }, []);

  const handleLaunchAssemblyDemo = useCallback((mode: 'assemble' | 'dismantle') => {
    setViewportMode('3d');
    setCompareMode(false);
    setMoveMode(false);
    setActiveTab('assembly');
    setDockCollapsed(false);
    setSelectedPart(null);
    setHighlightFasteners(true);
    setExplodedFactor(0);
    setAssemblyProgress(mode === 'assemble' ? 0 : 1);
    setPlaybackMode(mode);
    viewportRef.current?.focusCamera('full-rig');
  }, []);

  const stopArCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setArStream(null);
    setArCameraActive(false);
    setArCameraError(null);
    setArPointCloud([]);
    setArFloorTaps([]);
    window.setTimeout(() => viewportRef.current?.focusCamera('full-rig'), 60);
  }, []);

  const handleAutoSyncARRoom = useCallback(
    (result: ARMeasurementResult, silent = false) => {
      if (!silent) soundFx.playMetalSeat();
      const clampedHeightCm = Math.max(
        MIN_CEILING_HEIGHT_CM,
        Math.min(MAX_CEILING_HEIGHT_CM, result.ceilingHeightCm)
      );
      handleChangeConfig({
        ceilingHeightCm: clampedHeightCm,
        roomWidthM: result.roomWidthM,
        roomDepthM: result.roomDepthM,
        mount: result.recommendedMount,
      });
      handleChangeActivePole({
        diameterMm: result.recommendedDiameterMm,
      });
    },
    [handleChangeConfig, handleChangeActivePole]
  );

  const handleApplyRoomReplica = useCallback(
    (result: ARMeasurementResult, replica: RoomReplicaScene) => {
      soundFx.playMetalSeat();
      setRoomReplica(replica);
      setShowInferredObjects(true);
      setReplicaRenderMode('wireframe');
      setShowReplicaDimensions(false);

      const clampedHeightCm = Math.max(
        MIN_CEILING_HEIGHT_CM,
        Math.min(MAX_CEILING_HEIGHT_CM, replica.ceilingHeightCm)
      );
      const nextLighting = replica.depthMesh
        ? 'studio-daylight'
        : replica.lightingMood === 'dim'
          ? 'mood-neon'
          : 'studio-daylight';
      const nextMount =
        clampedHeightCm >= 224 && clampedHeightCm <= 335
          ? 'tension'
          : clampedHeightCm > 335
            ? 'permanent-ceiling'
            : result.recommendedMount;

      handleChangeConfig({
        ceilingHeightCm: clampedHeightCm,
        roomWidthM: replica.roomWidthM,
        roomDepthM: replica.roomDepthM,
        mount: nextMount,
        environment: 'replica',
        lighting: nextLighting,
      });
      handleChangeActivePole({
        diameterMm: result.recommendedDiameterMm,
        heightCm: clampPoleHeightCm(clampedHeightCm, clampedHeightCm),
      });

      stopArCamera();
      window.setTimeout(
        () => viewportRef.current?.focusCamera(replica.depthMesh ? 'replica-match' : 'full-rig'),
        110
      );
    },
    [handleChangeConfig, handleChangeActivePole, stopArCamera]
  );

  const startArCamera = useCallback(async () => {
    soundFx.playTorqueClick();
    setCompareMode(false);
    setMoveMode(false);
    setSelectedPart(null);
    setHighlightFasteners(false);
    setPlaybackMode('idle');
    setAssemblyProgress(1.0);
    setExplodedFactor(0.0);
    setCameraMotion('manual');
    // Immediately place the live 3D pole directly onto the real camera view!
    setViewportMode('3d');
    setArScanPhase('pole-ready');
    setArFloorTaps([]);
    setArPointCloud([]);
    setArShowPointCloud(false);
    setArCameraActive(true);
    setArCameraError(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setArCameraError('Camera unavailable on this device/browser.');
      return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch {
        // Fallback for devices/browsers that reject rear-camera constraints
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }
      streamRef.current = stream;
      setArStream(stream);
    } catch {
      setArCameraError('Camera permission unavailable. Allow camera access to see live room view.');
    }
  }, []);

  // Reliably attach MediaStream to <video> element after it mounts
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!arCameraActive || !arStream || !videoEl) return;
    if (videoEl.srcObject !== arStream) {
      videoEl.srcObject = arStream;
    }
    videoEl.play().catch(() => {});
  }, [arCameraActive, arStream]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Escape') {
        if (activeModal !== 'none') setActiveModal('none');
        else if (selectedPart) setSelectedPart(null);
        else if (arCameraActive) stopArCamera();
      } else if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((c) => !c);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeModal, selectedPart, arCameraActive, stopArCamera]);

  const handleExportCAD = useCallback(async (format: CadFormat) => {
    if (!viewportRef.current) throw new Error('3D viewport unavailable');
    return viewportRef.current.exportCAD(format);
  }, []);

  const handleGenerateUSDZUrl = useCallback(async () => {
    if (!viewportRef.current) throw new Error('3D viewport unavailable');
    return viewportRef.current.generateUSDZUrl();
  }, []);

  const handleCaptureSnapshot = useCallback(() => {
    return viewportRef.current?.captureSnapshot() ?? null;
  }, []);

  const isDark = isDarkLighting(config.lighting);

  return (
    <div
      className={`relative w-screen h-screen overflow-hidden flex flex-col transition-colors duration-200 ${
        isDark ? 'bg-[#0d0f16]' : 'bg-[#e5e2db]'
      }`}
      data-state={playbackMode !== 'idle' ? `animating-${playbackMode}` : 'ready'}
      data-finish={activePole.finish}
      data-mount={config.mount}
      data-ceiling-type={config.ceilingType}
      data-lighting={config.lighting}
      data-compare={compareMode ? 'true' : 'false'}
      data-poles={String(poles.length)}
      data-can-add-pole={canAddPole ? 'true' : 'false'}
      data-min-clearance={config.enforceMinClearance ? 'on' : 'off'}
      data-ceiling-cm={String(config.ceilingHeightCm)}
      data-pole-cm={String(activePole.heightCm)}
      data-cushion-placement={activePole.cushionPlacement}
      data-environment={config.environment}
      data-replica-objects={String(roomReplica?.objects.length ?? 0)}
      data-viewport-mode={viewportMode}
      data-sidebar-density={sidebarDensity}
      data-active-pole-pos={`${activePole.x.toFixed(2)},${activePole.z.toFixed(2)}`}
    >
      {/* Top 3-zone navigation header */}
      <TopBar
        lighting={config.lighting}
        activeModal={activeModal}
        totalPriceUsd={bom.totalPriceUsd}
        arCameraActive={arCameraActive}
        onOpenModal={(m) => {
          soundFx.playDetent();
          setActiveModal(m);
        }}
        onStartArCamera={startArCamera}
      />

      {/* Live AR Camera Pass-Through Layer behind transparent 3D WebGL Canvas */}
      {arCameraActive && (
        <div className="fixed inset-0 z-0 bg-black">
          {arUploadedPhotoUrl ? (
            <img
              src={arUploadedPhotoUrl}
              alt="Uploaded room view for AR pole fitting"
              className="w-full h-full object-cover"
            />
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          )}
          {arCameraError && !arUploadedPhotoUrl && (
            <div className="absolute inset-0 bg-gradient-to-b from-[#131620] via-[#0d1018] to-[#090b11] pointer-events-none flex items-end justify-center pb-36 px-4">
              <div className="px-3 py-1.5 rounded-lg bg-black/80 border border-white/15 text-zinc-300 text-[11px] text-center max-w-sm">
                {arCameraError} Tap the photo button above to scan a room picture.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Horizontal Workspace Split: Left Interactive Viewport (3D / 2D Floor Plan) + Right Docked Settings Sidebar */}
      <div className={`relative z-10 flex flex-1 min-h-0 w-full ${arCameraActive ? 'pt-0' : 'pt-12'}`}>
        {/* Left Primary Interactive Stage */}
        <main className="relative flex-1 min-w-0 h-full overflow-hidden">
          {/* Persistent 3D WebGL Studio Viewport (kept mounted for instant 2D <-> 3D switching & live sync) */}
          <div
            className={`w-full h-full ${
              viewportMode === 'floor-plan' && !arCameraActive
                ? 'invisible pointer-events-none'
                : 'visible'
            }`}
          >
            <PoleViewport3D
              ref={viewportRef}
              config={activeRigConfig}
              poles={poles}
              activePoleId={activePole.id}
              onSelectPole={(id) => {
                setActivePoleId(id);
                setSelectedPart(null);
              }}
              onMovePole={handleMovePole}
              moveMode={moveMode}
              compareMode={compareMode}
              compareFinish={compareFinish}
              cameraMotion={cameraMotion}
              onCancelCameraMotion={() => setCameraMotion('manual')}
              assemblyProgress={assemblyProgress}
              explodedFactor={explodedFactor}
              highlightFasteners={highlightFasteners}
              selectedPart={selectedPart}
              onSelectPart={(partId) => {
                setSelectedPart(partId);
                if (partId) setHighlightFasteners(true);
              }}
              playbackMode={playbackMode}
              onPlaybackProgress={handlePlaybackProgress}
              arCameraActive={arCameraActive}
              arMarkers={arMarkers}
              arMeasurement={arMeasurement}
              arScanPhase={arScanPhase}
              arPointCloud={arPointCloud}
              arShowPointCloud={arShowPointCloud}
              arSurfaceCalibration={arSurfaceCalibration}
              arPartialFloorPoints={arPartialFloorPoints}
              roomReplica={roomReplica}
              showInferredObjects={showInferredObjects}
              replicaRenderMode={replicaRenderMode}
              showReplicaDimensions={showReplicaDimensions}
              paused={viewportMode === 'floor-plan' && !arCameraActive}
              onOpenContextMenu={setContextMenu}
            />
          </div>

          {/* Interactive 2D Architectural Floor Plan View (directly synced with 3D pole positions) */}
          {viewportMode === 'floor-plan' && !arCameraActive && (
            <div className="absolute inset-0 z-10">
              <FloorPlanView
                config={activeRigConfig}
                poles={poles}
                activePoleId={activePole.id}
                canAddPole={canAddPole}
                roomReplica={roomReplica}
                showInferredObjects={showInferredObjects}
                onSelectPole={(id) => {
                  setActivePoleId(id);
                  setSelectedPart(null);
                }}
                onMovePole={handleMovePole}
                onCenterActivePole={handleCenterActivePole}
                onAddPole={() => handleAddPole()}
                onChangeLighting={(lighting) => handleChangeConfig({ lighting })}
                onOpenContextMenu={setContextMenu}
                resetZoomSignal={floorPlanResetZoomSignal}
              />
            </div>
          )}

          {/* Top-Left Segmented View Mode Bar (3D View | Floor Plan | Installation Demo) */}
          <ViewportModeBar
            viewportMode={viewportMode}
            activeTab={activeTab}
            lighting={config.lighting}
            arCameraActive={arCameraActive}
            onChangeViewportMode={(mode) => {
              soundFx.playDetent();
              setContextMenu(null);
              setViewportMode(mode);
              if (mode === '3d' && (activeTab === 'assembly' || playbackMode !== 'idle')) {
                setActiveTab('configure');
                setPlaybackMode('idle');
                setAssemblyProgress(1.0);
                setExplodedFactor(0.0);
                setHighlightFasteners(false);
                viewportRef.current?.focusCamera('full-rig');
              }
              if (mode === 'floor-plan') {
                setCompareMode(false);
                setPlaybackMode('idle');
                setAssemblyProgress(1.0);
                setExplodedFactor(0.0);
                setHighlightFasteners(false);
              }
            }}
            onLaunchInstallDemo={() => {
              setContextMenu(null);
              handleLaunchAssemblyDemo('assemble');
            }}
          />

          {/* Top-Left Minimal Rig Spec & Assembly Callout (anchored neatly below ViewportModeBar) */}
          <InspectorCallout
            config={activeRigConfig}
            poles={poles}
            activePole={activePole}
            bom={bom}
            clearance={clearance}
            compareMode={compareMode}
            compareFinish={compareFinish}
            moveMode={moveMode}
            lastClamp={lastClamp}
            activeTab={activeTab}
            activeStepIndex={activeStepIndex}
            assemblyProgress={assemblyProgress}
            playbackMode={playbackMode}
            selectedPart={selectedPart}
            onClearSelectedPart={() => {
              setSelectedPart(null);
              if (activeTab !== 'assembly') setHighlightFasteners(false);
              viewportRef.current?.focusCamera('full-rig');
            }}
            onToggleMinClearance={() =>
              handleChangeConfig({ enforceMinClearance: !config.enforceMinClearance })
            }
            arCameraActive={arCameraActive}
            roomReplica={roomReplica}
            showInferredObjects={showInferredObjects}
            onToggleInferredObjects={() => {
              soundFx.playDetent();
              setShowInferredObjects((v) => !v);
            }}
            replicaRenderMode={replicaRenderMode}
            onChangeReplicaRenderMode={(mode) => {
              soundFx.playDetent();
              setReplicaRenderMode(mode);
            }}
            showReplicaDimensions={showReplicaDimensions}
            onToggleReplicaDimensions={() => {
              soundFx.playDetent();
              setShowReplicaDimensions((v) => !v);
            }}
            onMatchReplicaCamera={() => {
              soundFx.playDetent();
              viewportRef.current?.focusCamera('replica-match');
            }}
            viewportMode={viewportMode}
          />
        </main>

        {/* Right-Docked Architectural Settings Sidebar (Full & Minimal Styled Modes) */}
        <ControlSidebar
          config={activeRigConfig}
          poles={poles}
          activePole={activePole}
          canAddPole={canAddPole}
          onSelectPole={(id) => {
            soundFx.playDetent();
            setActivePoleId(id);
            setSelectedPart(null);
          }}
          onAddPole={() => handleAddPole()}
          onRemoveActivePole={handleRemoveActivePole}
          onCenterActivePole={handleCenterActivePole}
          onChangeActivePole={handleChangeActivePole}
          onApplyFinishToAll={handleApplyFinishToAll}
          onChangeConfig={handleChangeConfig}
          compareMode={compareMode}
          onToggleCompareMode={handleToggleCompareMode}
          compareFinish={compareFinish}
          onChangeCompareFinish={(f) => {
            soundFx.playDetent();
            setCompareFinish(f);
          }}
          moveMode={moveMode}
          onToggleMoveMode={() => {
            soundFx.playDetent();
            setMoveMode((m) => !m);
            setLastClamp(null);
          }}
          cameraMotion={cameraMotion}
          onChangeCameraMotion={(mode) => {
            soundFx.playDetent();
            setCameraMotion(mode);
          }}
          activeTab={activeTab}
          onChangeTab={(tab) => {
            soundFx.playDetent();
            setActiveTab(tab);
            if (tab === 'assembly') {
              setViewportMode('3d');
              setCompareMode(false);
              setHighlightFasteners(true);
            } else {
              setPlaybackMode('idle');
              setAssemblyProgress(1.0);
              setExplodedFactor(0.0);
              if (!selectedPart) setHighlightFasteners(false);
            }
          }}
          viewportMode={viewportMode}
          onChangeViewportMode={(mode) => {
            soundFx.playDetent();
            setContextMenu(null);
            setViewportMode(mode);
            if (mode === 'floor-plan') {
              setCompareMode(false);
              setPlaybackMode('idle');
              setAssemblyProgress(1.0);
              setExplodedFactor(0.0);
              setHighlightFasteners(false);
            }
          }}
          sidebarDensity={sidebarDensity}
          onChangeSidebarDensity={(density) => {
            soundFx.playDetent();
            setSidebarDensity(density);
          }}
          dockCollapsed={dockCollapsed}
          onToggleCollapse={() => setDockCollapsed((c) => !c)}
          mobileDrawerOpen={mobileDrawerOpen}
          onSetMobileDrawerOpen={setMobileDrawerOpen}
          assemblyProgress={assemblyProgress}
          onChangeAssemblyProgress={(p) => {
            setAssemblyProgress(p);
            if (p < 0.99) setHighlightFasteners(true);
          }}
          explodedFactor={explodedFactor}
          onChangeExplodedFactor={(f) => {
            setExplodedFactor(f);
            if (f > 0.05) setHighlightFasteners(true);
          }}
          highlightFasteners={highlightFasteners}
          onToggleHighlightFasteners={() => {
            soundFx.playDetent();
            setHighlightFasteners((h) => !h);
          }}
          playbackMode={playbackMode}
          onStartPlayback={(mode) => {
            soundFx.playDetent();
            if (mode !== 'idle') {
              setViewportMode('3d');
              setCompareMode(false);
              setHighlightFasteners(true);
            }
            setPlaybackMode(mode);
          }}
          onFocusCamera={handleFocusCamera}
          soundEnabled={soundEnabled}
          onToggleSound={handleToggleSound}
          arCameraActive={arCameraActive}
          onStartArCamera={startArCamera}
          hasRoomReplica={Boolean(roomReplica)}
          hasDepthMeshReplica={Boolean(roomReplica?.depthMesh)}
          showInferredObjects={showInferredObjects}
          onToggleInferredObjects={() => {
            soundFx.playDetent();
            setShowInferredObjects((v) => !v);
          }}
          replicaRenderMode={replicaRenderMode}
          onChangeReplicaRenderMode={(mode) => {
            soundFx.playDetent();
            setReplicaRenderMode(mode);
          }}
          showReplicaDimensions={showReplicaDimensions}
          onToggleReplicaDimensions={() => {
            soundFx.playDetent();
            setShowReplicaDimensions((v) => !v);
          }}
        />
      </div>

      {/* Interactive AR Surface Calibration, Point Cloud Room Scanner & Pole Fit HUD */}
      {arCameraActive && (
        <ARMeasurementOverlay
          videoRef={videoRef}
          arCameraError={arCameraError}
          uploadedPhotoUrl={arUploadedPhotoUrl}
          onUploadRoomPhoto={setArUploadedPhotoUrl}
          markers={arMarkers}
          onChangeMarkers={setArMarkers}
          scanPhase={arScanPhase}
          onChangeScanPhase={setArScanPhase}
          floorTaps={arFloorTaps}
          onChangeFloorTaps={setArFloorTaps}
          partialFloorPoints={arPartialFloorPoints}
          surfaceCalibration={arSurfaceCalibration}
          measurement={arMeasurement}
          onUpdatePointCloud={setArPointCloud}
          showPointCloud={arShowPointCloud}
          onToggleShowPointCloud={() => setArShowPointCloud((v) => !v)}
          activeFinish={activePole.finish}
          isSpinning={activePole.isSpinning}
          onChangeFinish={(finish) => handleChangeActivePole({ finish })}
          onToggleSpin={() => handleChangeActivePole({ isSpinning: !activePole.isSpinning })}
          onAutoSyncRoom={handleAutoSyncARRoom}
          onApplyRoomReplica={handleApplyRoomReplica}
          onExit={stopArCamera}
        />
      )}

      {/* Right-Click Quick Edit Context Menu (Both 2D Floor Plan & 3D Studio) */}
      <PoleContextMenu
        menu={contextMenu}
        config={activeRigConfig}
        poles={poles}
        canAddPole={canAddPole}
        viewportMode={viewportMode}
        moveMode={moveMode}
        onClose={() => setContextMenu(null)}
        onChangePole={handleChangePoleById}
        onCenterPole={(poleId) => handleCenterPoleById(poleId || activePole.id)}
        onRemovePole={handleRemovePoleById}
        onAddPole={(preferred) => handleAddPole(preferred)}
        onToggleMoveMode={() => {
          soundFx.playDetent();
          setMoveMode((m) => !m);
          setLastClamp(null);
        }}
        onSwitchViewportMode={(mode) => {
          soundFx.playDetent();
          setViewportMode(mode);
          if (mode === 'floor-plan') {
            setCompareMode(false);
            setPlaybackMode('idle');
            setAssemblyProgress(1.0);
            setExplodedFactor(0.0);
          }
        }}
        onFocusPoleIn3D={(poleId) => {
          soundFx.playDetent();
          setActivePoleId(poleId);
          setViewportMode('3d');
          window.setTimeout(() => viewportRef.current?.focusCamera('full-rig'), 40);
        }}
        onResetView={() => {
          soundFx.playDetent();
          if (viewportMode === 'floor-plan') {
            setFloorPlanResetZoomSignal((n) => n + 1);
          } else {
            setCameraMotion('manual');
            viewportRef.current?.focusCamera('full-rig');
          }
        }}
      />

      {/* Documentation, BOM, CAD Export & AR Preview Modals */}
      <Modals
        activeModal={activeModal}
        onClose={() => setActiveModal('none')}
        config={activeRigConfig}
        bom={bom}
        onExportCAD={handleExportCAD}
        onGenerateUSDZUrl={handleGenerateUSDZUrl}
        onCaptureSnapshot={handleCaptureSnapshot}
        onLaunchAssemblyDemo={handleLaunchAssemblyDemo}
        onStartArCamera={startArCamera}
      />
    </div>
  );
}
