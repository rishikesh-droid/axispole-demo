import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CameraFocusId,
  CameraMotionMode,
  DockTabId,
  HardwarePartId,
  ModalId,
  PoleClampResult,
  PoleFinishId,
  PoleInstance,
  PoleRigConfig,
} from './types/pole';
import {
  analyzeFloorClearance,
  ASSEMBLY_STEPS,
  clampPolePosition,
  createInitialPoles,
  createNextPoleInstance,
  DEFAULT_CONFIG,
  generateMultiPoleBOM,
  isDarkLighting,
  MAX_POLES_IN_STUDIO,
  MIN_ROOM_SIZE_M,
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
import { ControlDock } from './components/ControlDock';
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
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalId>('none');

  // Assembly & inspection state
  const [assemblyProgress, setAssemblyProgress] = useState(1.0);
  const [explodedFactor, setExplodedFactor] = useState(0.0);
  const [highlightFasteners, setHighlightFasteners] = useState(false);
  const [selectedPart, setSelectedPart] = useState<HardwarePartId | null>(null);
  const [playbackMode, setPlaybackMode] = useState<'idle' | 'assemble' | 'dismantle'>('idle');
  const [soundEnabled, setSoundEnabled] = useState(false);

  // Live Camera AR Surface Calibration & Real-Time Point Cloud state
  const [arCameraActive, setArCameraActive] = useState(false);
  const [arCameraError, setArCameraError] = useState<string | null>(null);
  const [arMarkers, setArMarkers] = useState<ARMarkerState>(DEFAULT_AR_MARKERS);
  const [arScanPhase, setArScanPhase] = useState<ARScanPhase>('surface-calibrate');
  const [arFloorTaps, setArFloorTaps] = useState<FloorTapPoint2D[]>([]);
  const [arPointCloud, setArPointCloud] = useState<ARPoint3D[]>([]);
  const [arShowPointCloud, setArShowPointCloud] = useState(true);
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
      mount: activePole.mount,
      isSpinning: activePole.isSpinning,
      spinRpm: activePole.spinRpm,
    }),
    [config, activePole]
  );

  const bom = useMemo(() => generateMultiPoleBOM(poles, config), [poles, config]);
  const clearance = useMemo(
    () => analyzeFloorClearance(config.roomWidthM, config.roomDepthM, activePole.mount),
    [config.roomWidthM, config.roomDepthM, activePole.mount]
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
      const next = {
        ...prev,
        ...patch,
        roomWidthM: Math.max(MIN_ROOM_SIZE_M, patch.roomWidthM ?? prev.roomWidthM),
        roomDepthM: Math.max(MIN_ROOM_SIZE_M, patch.roomDepthM ?? prev.roomDepthM),
      };
      // Automatically re-clamp all poles safely inside updated room dimensions!
      if (patch.roomWidthM !== undefined || patch.roomDepthM !== undefined) {
        setPoles((prevPoles) => {
          const placed: PoleInstance[] = [];
          for (const p of prevPoles) {
            const c = clampPolePosition(
              p.x,
              p.z,
              next.roomWidthM,
              next.roomDepthM,
              p.mount,
              placed
            );
            placed.push({ ...p, x: c.x, z: c.z });
          }
          return placed;
        });
      }
      return next;
    });
  }, []);

  const handleChangeActivePole = useCallback(
    (patch: Partial<PoleInstance>) => {
      soundFx.playDetent();
      setPoles((prev) =>
        prev.map((p) => {
          if (p.id !== activePole.id) return p;
          const updated = { ...p, ...patch };
          if (patch.mount) {
            const others = prev.filter((o) => o.id !== p.id);
            const c = clampPolePosition(
              updated.x,
              updated.z,
              config.roomWidthM,
              config.roomDepthM,
              updated.mount,
              others
            );
            updated.x = c.x;
            updated.z = c.z;
          }
          return updated;
        })
      );
    },
    [activePole.id, config.roomWidthM, config.roomDepthM]
  );

  const handleAddPole = useCallback(() => {
    if (poles.length >= MAX_POLES_IN_STUDIO) return;
    soundFx.playMetalSeat();
    setCompareMode(false);
    // Ensure room has comfortable width when adding multiple poles
    const targetW = Math.max(config.roomWidthM, poles.length === 1 ? 5.6 : 6.2);
    if (targetW !== config.roomWidthM) {
      setConfig((prev) => ({ ...prev, roomWidthM: targetW }));
    }
    const newPole = createNextPoleInstance(poles, targetW, config.roomDepthM);
    setPoles((prev) => [...prev, newPole]);
    setActivePoleId(newPole.id);
    setMoveMode(true);
    viewportRef.current?.focusCamera('full-rig');
  }, [poles, config.roomWidthM, config.roomDepthM]);

  const handleRemoveActivePole = useCallback(() => {
    if (poles.length <= 1) return;
    soundFx.playDetent();
    setPoles((prev) => {
      const remaining = prev.filter((p) => p.id !== activePole.id);
      const renamed = remaining.map((p, idx) => ({ ...p, label: `Pole ${idx + 1}` }));
      setActivePoleId(renamed[0].id);
      return renamed;
    });
  }, [poles.length, activePole.id]);

  const handleMovePole = useCallback(
    (poleId: string, x: number, z: number, clamp: PoleClampResult) => {
      setLastClamp(clamp);
      setPoles((prev) => prev.map((p) => (p.id === poleId ? { ...p, x, z } : p)));
    },
    []
  );

  const handleCenterActivePole = useCallback(() => {
    soundFx.playDetent();
    setPoles((prev) => {
      const others = prev.filter((p) => p.id !== activePole.id);
      const c = clampPolePosition(
        0,
        0,
        config.roomWidthM,
        config.roomDepthM,
        activePole.mount,
        others
      );
      setLastClamp(c);
      return prev.map((p) => (p.id === activePole.id ? { ...p, x: c.x, z: c.z } : p));
    });
  }, [activePole.id, activePole.mount, config.roomWidthM, config.roomDepthM]);

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
    setArCameraActive(false);
    setArCameraError(null);
    setArPointCloud([]);
    setArFloorTaps([]);
    window.setTimeout(() => viewportRef.current?.focusCamera('full-rig'), 60);
  }, []);

  const handleAutoSyncARRoom = useCallback(
    (result: ARMeasurementResult, silent = false) => {
      if (!silent) soundFx.playMetalSeat();
      const clampedHeightCm = Math.max(225, Math.min(350, result.ceilingHeightCm));
      handleChangeConfig({
        ceilingHeightCm: clampedHeightCm,
        roomWidthM: result.roomWidthM,
        roomDepthM: result.roomDepthM,
      });
      handleChangeActivePole({
        mount: result.recommendedMount,
        diameterMm: result.recommendedDiameterMm,
      });
    },
    [handleChangeConfig, handleChangeActivePole]
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
    setArScanPhase('surface-calibrate');
    setArFloorTaps([]);
    setArPointCloud([]);
    setArShowPointCloud(true);
    setArCameraActive(true);
    setArCameraError(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setArCameraError('Camera unavailable. Showing calibrated AR room grid.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch {
      setArCameraError('Camera unavailable. Showing calibrated AR room grid.');
    }
  }, []);

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

  const isDark = isDarkLighting(config.lighting);

  return (
    <div
      className={`relative w-screen h-screen overflow-hidden transition-colors duration-200 ${
        isDark ? 'bg-[#0d0f16]' : 'bg-[#e5e2db]'
      }`}
      data-state={playbackMode !== 'idle' ? `animating-${playbackMode}` : 'ready'}
      data-finish={activePole.finish}
      data-mount={activePole.mount}
      data-lighting={config.lighting}
      data-compare={compareMode ? 'true' : 'false'}
      data-poles={String(poles.length)}
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
        <div className="fixed inset-0 z-0 bg-[#0b0d14]">
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
          {arCameraError && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 50% 45%, rgba(56, 189, 248, 0.12), transparent 60%), linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
                backgroundSize: '100% 100%, 40px 40px, 40px 40px',
              }}
            />
          )}
        </div>
      )}

      {/* Full-Bleed Unobstructed 3D Interactive Studio Viewport */}
      <main className={`relative z-10 w-full h-full ${arCameraActive ? 'pt-0' : 'pt-12'}`}>
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
        />
      </main>

      {/* Interactive AR Surface Calibration, Point Cloud Room Scanner & Pole Fit HUD */}
      {arCameraActive && (
        <ARMeasurementOverlay
          videoRef={videoRef}
          arCameraError={arCameraError}
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
          onExit={stopArCamera}
        />
      )}

      {/* Top-Left Minimal Rig Spec, Compare, Move & Prominent Installation/Dismantle Callout */}
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
        arCameraActive={arCameraActive}
      />

      {/* Sleek Low-Profile Bottom Control Dock */}
      <ControlDock
        config={activeRigConfig}
        poles={poles}
        activePole={activePole}
        onSelectPole={(id) => {
          soundFx.playDetent();
          setActivePoleId(id);
          setSelectedPart(null);
        }}
        onAddPole={handleAddPole}
        onRemoveActivePole={handleRemoveActivePole}
        onCenterActivePole={handleCenterActivePole}
        onChangeActivePole={handleChangeActivePole}
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
            setCompareMode(false);
            setHighlightFasteners(true);
          } else if (!selectedPart) {
            setHighlightFasteners(false);
          }
        }}
        dockCollapsed={dockCollapsed}
        onToggleCollapse={() => setDockCollapsed((c) => !c)}
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
      />

      {/* Documentation, BOM, CAD Export & AR Preview Modals */}
      <Modals
        activeModal={activeModal}
        onClose={() => setActiveModal('none')}
        config={activeRigConfig}
        bom={bom}
        onExportCAD={handleExportCAD}
        onGenerateUSDZUrl={handleGenerateUSDZUrl}
        onLaunchAssemblyDemo={handleLaunchAssemblyDemo}
        onStartArCamera={startArCamera}
      />
    </div>
  );
}
