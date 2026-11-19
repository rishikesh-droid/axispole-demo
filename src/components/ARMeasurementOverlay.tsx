import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Check,
  Compass,
  Crosshair,
  MoveHorizontal,
  RotateCw,
  ScanLine,
  SlidersHorizontal,
  Undo2,
  X,
} from 'lucide-react';
import type { PoleFinishId } from '../types/pole';
import {
  calculateARMeasurement,
  clampARMarkers,
  type ARMarkerState,
  type ARMeasurementResult,
} from '../utils/arMeasure';
import {
  accumulateRoomScan,
  analyzeFrameForPointCloud,
  createRoomScanAccumulator,
  extractVideoFrameRGBA,
  generateCalibratedRoomScanFrame,
  type ARPoint3D,
  type RoomScanAccumulator,
} from '../utils/arPointCloud';
import {
  buildMeasurementFromSurfaceCalibration,
  screenToFloorPoint3D,
  solveFloorSurfaceCalibration,
  type FloorPoint3D,
  type FloorTapPoint2D,
  type SurfaceCalibrationResult,
} from '../utils/arSurfaceCalibration';
import type { ARScanPhase } from '../three/arPointCloudMesh';
import {
  BASE_MOUNTS,
  formatHeightMetricAndImperial,
  POLE_FINISHES,
} from '../utils/poleConfig';
import { getPoleMaterialAvatars } from '../utils/materialThumbnails';

interface ARMeasurementOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  arCameraError: string | null;
  markers: ARMarkerState;
  onChangeMarkers: (next: ARMarkerState) => void;
  scanPhase: ARScanPhase;
  onChangeScanPhase: (phase: ARScanPhase) => void;
  floorTaps: FloorTapPoint2D[];
  onChangeFloorTaps: (next: FloorTapPoint2D[]) => void;
  partialFloorPoints: FloorPoint3D[];
  surfaceCalibration: SurfaceCalibrationResult | null;
  measurement: ARMeasurementResult;
  onUpdatePointCloud: (points: ARPoint3D[]) => void;
  showPointCloud: boolean;
  onToggleShowPointCloud: () => void;
  activeFinish: PoleFinishId;
  isSpinning: boolean;
  onChangeFinish: (finish: PoleFinishId) => void;
  onToggleSpin: () => void;
  onAutoSyncRoom: (result: ARMeasurementResult, silent?: boolean) => void;
  onExit: () => void;
}

const FINISH_ORDER: PoleFinishId[] = ['brass', 'stainless', 'powder-black', 'silicone'];

type DragHandleId = 'ceiling' | 'floor' | 'pole' | `floor-pin-${number}`;

export function ARMeasurementOverlay({
  videoRef,
  arCameraError,
  markers,
  onChangeMarkers,
  scanPhase,
  onChangeScanPhase,
  floorTaps,
  onChangeFloorTaps,
  partialFloorPoints,
  surfaceCalibration,
  measurement,
  onUpdatePointCloud,
  activeFinish,
  isSpinning,
  onChangeFinish,
  onToggleSpin,
  onAutoSyncRoom,
  onExit,
}: ARMeasurementOverlayProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [draggingHandle, setDraggingHandle] = useState<DragHandleId | null>(null);
  const [gyroActive, setGyroActive] = useState(false);
  const [showCalibPanel, setShowCalibPanel] = useState(false);
  const [tapWarning, setTapWarning] = useState<string | null>(null);

  const [scanAcc, setScanAcc] = useState<RoomScanAccumulator>(() =>
    createRoomScanAccumulator(markers)
  );
  const scanAccRef = useRef<RoomScanAccumulator>(scanAcc);
  scanAccRef.current = scanAcc;

  const markersRef = useRef(markers);
  markersRef.current = markers;
  const floorTapsRef = useRef(floorTaps);
  floorTapsRef.current = floorTaps;
  const draggingRef = useRef(draggingHandle);
  draggingRef.current = draggingHandle;
  const finishRef = useRef(activeFinish);
  finishRef.current = activeFinish;
  const scanStepRef = useRef(0);
  const autoLockedRef = useRef(false);

  const avatars = useMemo(() => getPoleMaterialAvatars(), []);

  const computeBestMeasurement = useCallback(
    (nextMarkers: ARMarkerState, taps: FloorTapPoint2D[]): ARMeasurementResult => {
      const cal = solveFloorSurfaceCalibration(taps, nextMarkers);
      if (cal && cal.valid) {
        return buildMeasurementFromSurfaceCalibration(cal, nextMarkers, finishRef.current);
      }
      return calculateARMeasurement(nextMarkers, finishRef.current);
    },
    []
  );

  // Sync aspect ratio & vertical FOV to viewport orientation on mount & resize
  useEffect(() => {
    const syncViewport = () => {
      const w = window.innerWidth || 390;
      const h = window.innerHeight || 844;
      const aspect = w / h;
      const vfovDeg = aspect < 0.85 ? 68 : 48;
      onChangeMarkers(
        clampARMarkers({
          ...markersRef.current,
          aspect,
          vfovDeg,
        })
      );
    };
    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, [onChangeMarkers]);

  useEffect(() => {
    if (!tapWarning) return;
    const t = window.setTimeout(() => setTapWarning(null), 2200);
    return () => window.clearTimeout(t);
  }, [tapWarning]);

  // Optional live camera auto-scan (pole remains visible on camera the entire time!)
  useEffect(() => {
    if (scanPhase !== 'scanning') return;
    autoLockedRef.current = false;
    scanStepRef.current = 0;

    const tickScan = () => {
      if (draggingRef.current !== null) return;
      const curMarkers = markersRef.current;

      const rgba = extractVideoFrameRGBA(videoRef.current, 120, 160);
      let frameResult;
      if (rgba) {
        frameResult = analyzeFrameForPointCloud(rgba, 120, 160, curMarkers);
      } else if (arCameraError) {
        frameResult = generateCalibratedRoomScanFrame(scanStepRef.current, curMarkers);
      } else {
        return;
      }

      scanStepRef.current += 1;

      const nextAcc = accumulateRoomScan(scanAccRef.current, frameResult);
      scanAccRef.current = nextAcc;
      setScanAcc(nextAcc);
      onUpdatePointCloud(nextAcc.points);

      if (frameResult.detected && nextAcc.samples.length > 0) {
        const blend = nextAcc.samples.length <= 2 ? 0.5 : 0.35;
        const c = nextAcc.consensusCorners;
        const nextMarkers = clampARMarkers({
          ...curMarkers,
          ceilingY: curMarkers.ceilingY + (c.ceilingY - curMarkers.ceilingY) * blend,
          floorY: curMarkers.floorY + (c.floorY - curMarkers.floorY) * blend,
          leftCornerX: curMarkers.leftCornerX + (c.leftCornerX - curMarkers.leftCornerX) * blend,
          rightCornerX:
            curMarkers.rightCornerX + (c.rightCornerX - curMarkers.rightCornerX) * blend,
        });
        onChangeMarkers(nextMarkers);

        if (nextAcc.isLocked && !autoLockedRef.current) {
          autoLockedRef.current = true;
          const lockedResult = computeBestMeasurement(nextMarkers, floorTapsRef.current);
          window.setTimeout(() => {
            onAutoSyncRoom(lockedResult, false);
            onUpdatePointCloud([]);
            onChangeScanPhase('pole-ready');
          }, 180);
        }
      }
    };

    const initialTimer = window.setTimeout(tickScan, 160);
    const intervalId = window.setInterval(tickScan, 210);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(intervalId);
    };
  }, [
    scanPhase,
    arCameraError,
    videoRef,
    onChangeMarkers,
    onUpdatePointCloud,
    onAutoSyncRoom,
    onChangeScanPhase,
    computeBestMeasurement,
  ]);

  // Optional DeviceOrientation pitch sensor
  useEffect(() => {
    if (!gyroActive || typeof window === 'undefined') return;
    const onOrientation = (e: DeviceOrientationEvent) => {
      if (typeof e.beta !== 'number') return;
      const pitchDeg = Math.max(-22, Math.min(22, e.beta - 90));
      onChangeMarkers(
        clampARMarkers({
          ...markersRef.current,
          cameraPitchDeg: Number(pitchDeg.toFixed(1)),
        })
      );
    };
    window.addEventListener('deviceorientation', onOrientation);
    return () => window.removeEventListener('deviceorientation', onOrientation);
  }, [gyroActive, onChangeMarkers]);

  const handleToggleGyro = async () => {
    if (gyroActive) {
      setGyroActive(false);
      return;
    }
    const DeviceOrient = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    if (DeviceOrient && typeof DeviceOrient.requestPermission === 'function') {
      try {
        const perm = await DeviceOrient.requestPermission();
        if (perm === 'granted') setGyroActive(true);
      } catch {
        // Ignore denied tilt permission
      }
    } else if ('DeviceOrientationEvent' in window) {
      setGyroActive(true);
    }
  };

  const handleToggleAutoScan = useCallback(() => {
    if (scanPhase === 'scanning') {
      onUpdatePointCloud([]);
      onChangeScanPhase('pole-ready');
      return;
    }
    autoLockedRef.current = false;
    scanStepRef.current = 0;
    const fresh = createRoomScanAccumulator(markersRef.current);
    scanAccRef.current = fresh;
    setScanAcc(fresh);
    onUpdatePointCloud([]);
    onChangeScanPhase('scanning');
  }, [scanPhase, onChangeScanPhase, onUpdatePointCloud]);

  const handleToggleFloorCalibrate = useCallback(() => {
    if (scanPhase === 'surface-calibrate') {
      onChangeScanPhase('pole-ready');
      return;
    }
    onUpdatePointCloud([]);
    onChangeScanPhase('surface-calibrate');
  }, [scanPhase, onChangeScanPhase, onUpdatePointCloud]);

  const handleFloorSurfaceTap = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (scanPhase !== 'surface-calibrate' || draggingHandle !== null) return;
    if (floorTapsRef.current.length >= 4) return;

    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;

    const u = Math.max(0.04, Math.min(0.96, (e.clientX - rect.left) / rect.width));
    const v = Math.max(0.08, Math.min(0.92, (e.clientY - rect.top) / rect.height));

    const hit3D = screenToFloorPoint3D(u, v, markersRef.current, floorTapsRef.current.length + 1);
    if (!hit3D) {
      setTapWarning('Tap lower on the floor');
      return;
    }

    const nextTaps: FloorTapPoint2D[] = [
      ...floorTapsRef.current,
      { id: floorTapsRef.current.length + 1, u, v },
    ];
    onChangeFloorTaps(nextTaps);
    setTapWarning(null);

    if (nextTaps.length === 4) {
      const cal = solveFloorSurfaceCalibration(nextTaps, markersRef.current);
      if (cal && cal.valid) {
        const res = buildMeasurementFromSurfaceCalibration(cal, markersRef.current, finishRef.current);
        onAutoSyncRoom(res, false);
        // Automatically return to clean pole-on-camera view once 4 floor corners are calibrated!
        window.setTimeout(() => {
          onChangeScanPhase('pole-ready');
        }, 420);
      }
    }
  };

  const updateMarkerFromPointer = useCallback(
    (clientX: number, clientY: number, handle: DragHandleId) => {
      const rect = overlayRef.current?.getBoundingClientRect();
      if (!rect || rect.height === 0 || rect.width === 0) return;
      const nx = Math.max(0.04, Math.min(0.96, (clientX - rect.left) / rect.width));
      const ny = Math.max(0.08, Math.min(0.92, (clientY - rect.top) / rect.height));

      if (handle.startsWith('floor-pin-')) {
        const pinId = Number(handle.replace('floor-pin-', ''));
        const test3D = screenToFloorPoint3D(nx, ny, markersRef.current, pinId);
        if (!test3D) return;
        const nextTaps = floorTapsRef.current.map((t) =>
          t.id === pinId ? { ...t, u: nx, v: ny } : t
        );
        onChangeFloorTaps(nextTaps);
        if (nextTaps.length === 4) {
          onAutoSyncRoom(computeBestMeasurement(markersRef.current, nextTaps), true);
        }
        return;
      }

      const cur = markersRef.current;
      let next: ARMarkerState = cur;
      if (handle === 'ceiling') {
        next = clampARMarkers({ ...cur, ceilingY: ny });
      } else if (handle === 'floor') {
        next = clampARMarkers({ ...cur, floorY: ny });
      } else if (handle === 'pole') {
        next = clampARMarkers({ ...cur, poleX: nx });
      }

      onChangeMarkers(next);
      if (handle !== 'pole') {
        onAutoSyncRoom(computeBestMeasurement(next, floorTapsRef.current), true);
      }
    },
    [onChangeMarkers, onChangeFloorTaps, onAutoSyncRoom, computeBestMeasurement]
  );

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingHandle) return;
    e.preventDefault();
    updateMarkerFromPointer(e.clientX, e.clientY, draggingHandle);
  };

  const onPointerUp = () => {
    if (draggingHandle && draggingHandle !== 'pole') {
      onAutoSyncRoom(computeBestMeasurement(markersRef.current, floorTapsRef.current), true);
    }
    setDraggingHandle(null);
  };

  const orderedFloorPoints = useMemo<FloorPoint3D[]>(() => {
    if (surfaceCalibration?.valid) return surfaceCalibration.points3D;
    return partialFloorPoints;
  }, [surfaceCalibration, partialFloorPoints]);

  const ceilPct = `${(markers.ceilingY * 100).toFixed(2)}%`;
  const floorPct = `${(markers.floorY * 100).toFixed(2)}%`;
  const poleXPct = `${(markers.poleX * 100).toFixed(2)}%`;
  const midYPct = `${(((markers.ceilingY + markers.floorY) / 2) * 100).toFixed(2)}%`;

  const isSurfaceMode = scanPhase === 'surface-calibrate';
  const isScanning = scanPhase === 'scanning';

  const displayWidthM = surfaceCalibration?.valid
    ? surfaceCalibration.rawWidthM
    : measurement.roomWidthM;
  const displayDepthM = surfaceCalibration?.valid
    ? surfaceCalibration.rawDepthM
    : measurement.roomDepthM;

  return (
    <div
      ref={overlayRef}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="fixed inset-0 z-40 pointer-events-none select-none overflow-hidden"
      data-testid="ar-measurement-overlay"
      data-scan-phase={scanPhase}
      data-floor-calibrated={surfaceCalibration?.valid ? 'true' : 'false'}
    >
      {/* Optional Floor Tap Capture Layer (ONLY active while user chose 4-Pt Floor; pole stays visible on camera!) */}
      {isSurfaceMode && (
        <div
          onPointerDown={handleFloorSurfaceTap}
          data-testid="ar-surface-tap-layer"
          aria-label="Tap 4 points on your physical floor to calibrate ground plane"
          className="absolute inset-0 pointer-events-auto cursor-crosshair"
        />
      )}

      {/* Subtle Floor Polygon & Pins ONLY during 4-Pt Floor tapping */}
      {isSurfaceMode && orderedFloorPoints.length > 0 && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {orderedFloorPoints.length === 4 ? (
            <polygon
              points={orderedFloorPoints.map((p) => `${p.u * 100},${p.v * 100}`).join(' ')}
              fill="rgba(16, 185, 129, 0.14)"
              stroke="#34d399"
              strokeWidth={0.35}
            />
          ) : (
            orderedFloorPoints.length >= 2 && (
              <polyline
                points={orderedFloorPoints.map((p) => `${p.u * 100},${p.v * 100}`).join(' ')}
                fill="none"
                stroke="#34d399"
                strokeWidth={0.35}
              />
            )
          )}
        </svg>
      )}

      {isSurfaceMode &&
        floorTaps.map((tap, idx) => (
          <button
            key={`pin-${tap.id}`}
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              setDraggingHandle(`floor-pin-${tap.id}`);
            }}
            data-testid={`ar-floor-pin-${idx + 1}`}
            aria-label={`Floor corner ${idx + 1}`}
            style={{
              left: `${(tap.u * 100).toFixed(2)}%`,
              top: `${(tap.v * 100).toFixed(2)}%`,
            }}
            className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto touch-none w-7 h-7 rounded-full border-2 border-emerald-300 bg-black/75 text-emerald-100 font-mono text-xs font-bold flex items-center justify-center shadow-lg"
          >
            {idx + 1}
          </button>
        ))}

      {tapWarning && isSurfaceMode && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-3 py-1 rounded-lg bg-black/85 border border-rose-400/60 text-rose-100 text-[11px] font-medium whitespace-nowrap">
          {tapWarning}
        </div>
      )}

      {/* Clean, Minimal Ceiling & Floor Alignment Handles (Directly align pole top & bottom to real room on camera) */}
      {!isSurfaceMode && (
        <>
          {/* Slim Ceiling Alignment Handle */}
          <div
            className="absolute left-6 right-6 pointer-events-auto touch-none cursor-ns-resize py-3 -translate-y-1/2"
            style={{ top: ceilPct }}
            onPointerDown={(e) => {
              e.stopPropagation();
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              setDraggingHandle('ceiling');
            }}
            role="slider"
            aria-label="Drag to align with ceiling"
            aria-valuemin={8}
            aria-valuemax={45}
            aria-valuenow={Math.round(markers.ceilingY * 100)}
            tabIndex={0}
            data-testid="ar-ceiling-handle"
          >
            <div className="relative h-[1.5px] bg-white/55">
              <div className="absolute left-0 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-md bg-black/70 border border-white/25 text-[10px] font-semibold text-white whitespace-nowrap">
                Ceiling · {measurement.ceilingHeightM.toFixed(2)}m
              </div>
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white bg-black/75" />
            </div>
          </div>

          {/* Slim Floor Alignment Handle (Hidden only if 4-pt calibrated floor already locks exact ground plane) */}
          {!surfaceCalibration?.valid && (
            <div
              className="absolute left-6 right-6 pointer-events-auto touch-none cursor-ns-resize py-3 -translate-y-1/2"
              style={{ top: floorPct }}
              onPointerDown={(e) => {
                e.stopPropagation();
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                setDraggingHandle('floor');
              }}
              role="slider"
              aria-label="Drag to align with floor"
              aria-valuemin={55}
              aria-valuemax={88}
              aria-valuenow={Math.round(markers.floorY * 100)}
              tabIndex={0}
              data-testid="ar-floor-handle"
            >
              <div className="relative h-[1.5px] bg-cyan-300/60">
                <div className="absolute left-0 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-md bg-black/70 border border-cyan-300/40 text-[10px] font-semibold text-cyan-100 whitespace-nowrap">
                  Floor · {measurement.distanceM.toFixed(1)}m
                </div>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-cyan-300 bg-black/75" />
              </div>
            </div>
          )}

          {/* Subtle Horizontal Pole Drag Handle directly on the 3D pole */}
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              setDraggingHandle('pole');
            }}
            style={{ left: poleXPct, top: midYPct }}
            aria-label="Slide pole left or right on camera"
            title="Drag left or right to position pole"
            className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto touch-none w-9 h-9 rounded-full bg-black/60 border border-white/35 text-white flex items-center justify-center shadow-lg active:scale-95"
          >
            <MoveHorizontal className="w-4 h-4" aria-hidden="true" />
          </button>
        </>
      )}

      {/* Minimal Floating Top Camera Controls (No Simulation Console!) */}
      <div className="fixed top-0 left-0 right-0 z-50 px-3 pt-2.5 pb-2 bg-gradient-to-b from-black/70 to-transparent pointer-events-auto">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-2">
          {/* Quick Camera Measurement Tools: 4-Pt Floor + Auto Scan */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleToggleFloorCalibrate}
              data-testid="ar-floor-calibrate-btn"
              className={`min-h-[34px] px-2.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                isSurfaceMode
                  ? 'border-emerald-400 bg-emerald-500/30 text-emerald-100'
                  : surfaceCalibration?.valid
                    ? 'border-emerald-400/55 bg-black/65 text-emerald-200'
                    : 'border-white/25 bg-black/65 text-white hover:bg-black/80'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                {isSurfaceMode
                  ? `Tap Floor (${floorTaps.length}/4)`
                  : surfaceCalibration?.valid
                    ? 'Floor Set'
                    : '4-Pt Floor'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleToggleAutoScan}
              data-testid="ar-auto-scan-btn"
              className={`min-h-[34px] px-2.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                isScanning
                  ? 'border-cyan-400 bg-cyan-500/25 text-cyan-100'
                  : 'border-white/25 bg-black/65 text-white hover:bg-black/80'
              }`}
            >
              <ScanLine className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{isScanning ? `Scanning ${scanAcc.scanProgress}%` : 'Auto Scan'}</span>
            </button>
          </div>

          {/* Right Utility Controls: Tilt, Lens Height, Close */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleToggleGyro}
              aria-pressed={gyroActive}
              aria-label="Toggle live tilt sensor"
              title="Live Tilt Sensor"
              className={`min-h-[34px] min-w-[34px] px-2 rounded-lg border text-[11px] font-semibold inline-flex items-center justify-center transition-colors ${
                gyroActive
                  ? 'border-cyan-400 bg-cyan-500/25 text-cyan-200'
                  : 'border-white/25 bg-black/65 text-zinc-200'
              }`}
            >
              <Compass className="w-3.5 h-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => setShowCalibPanel((v) => !v)}
              aria-pressed={showCalibPanel}
              aria-label="Phone lens height calibration"
              className={`min-h-[34px] px-2 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${
                showCalibPanel
                  ? 'border-amber-400 bg-amber-500/25 text-amber-100'
                  : 'border-white/25 bg-black/65 text-zinc-200'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline font-mono tabular-nums">
                {markers.cameraHeightM.toFixed(2)}m
              </span>
            </button>

            <button
              type="button"
              onClick={onExit}
              aria-label="Exit AR Camera"
              data-testid="exit-ar-button"
              className="min-h-[34px] min-w-[34px] px-2.5 rounded-lg border border-white/25 bg-black/70 text-white hover:bg-white/15 inline-flex items-center justify-center gap-1 text-xs font-semibold"
            >
              <X className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Close</span>
            </button>
          </div>
        </div>

        {/* Optional Lens Height Calibration Drawer */}
        {showCalibPanel && (
          <div className="max-w-3xl mx-auto mt-2 p-2.5 rounded-xl bg-black/85 border border-white/15 text-zinc-100 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 flex-1 min-w-[180px]">
              <label htmlFor="ar-cam-height" className="text-[11px] text-zinc-300 whitespace-nowrap">
                Phone Height
              </label>
              <input
                id="ar-cam-height"
                type="range"
                min={95}
                max={185}
                step={1}
                value={Math.round(markers.cameraHeightM * 100)}
                onChange={(e) => {
                  const next = clampARMarkers({
                    ...markers,
                    cameraHeightM: Number(e.target.value) / 100,
                  });
                  onChangeMarkers(next);
                  onAutoSyncRoom(computeBestMeasurement(next, floorTapsRef.current), true);
                }}
                className="axis-slider flex-1"
              />
              <span className="font-mono text-[11px] font-semibold tabular-nums w-11 text-right">
                {markers.cameraHeightM.toFixed(2)}m
              </span>
            </div>
            <div className="flex items-center gap-1 text-[11px]">
              {[
                { label: '1.1m', m: 1.1 },
                { label: '1.35m', m: 1.35 },
                { label: '1.55m', m: 1.55 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    const next = clampARMarkers({ ...markers, cameraHeightM: preset.m });
                    onChangeMarkers(next);
                    onAutoSyncRoom(computeBestMeasurement(next, floorTapsRef.current), true);
                  }}
                  className="px-2 py-1 rounded-md border border-white/15 bg-white/10 text-zinc-100"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Slim Bottom Live AR Camera Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 px-3 pb-3 pt-1 pointer-events-auto">
        <div className="max-w-xl mx-auto rounded-2xl border border-white/15 bg-black/80 text-zinc-100 shadow-2xl overflow-hidden">
          {isSurfaceMode ? (
            <div className="px-3 py-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-emerald-200 truncate" data-testid="ar-surface-status">
                  Tap 4 corners on your physical floor ({floorTaps.length}/4)
                </p>
                <p className="text-[11px] text-zinc-400 truncate">
                  Locks real floor bounds & snaps pole to ground center
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {floorTaps.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onChangeFloorTaps(floorTaps.slice(0, -1))}
                    aria-label="Undo floor tap"
                    className="min-h-[34px] px-2.5 rounded-xl border border-white/20 bg-white/10 text-zinc-100 text-[11px] font-semibold inline-flex items-center gap-1"
                  >
                    <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onChangeScanPhase('pole-ready')}
                  className="min-h-[34px] px-3 rounded-xl bg-zinc-100 text-zinc-950 text-[11px] font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Slim Top Measurement Strip */}
              <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="shrink-0">
                    <span className="block text-[10px] text-zinc-400 leading-none">Ceiling</span>
                    <span
                      className="font-mono font-bold text-cyan-300 tabular-nums"
                      data-testid="ar-predicted-ceiling"
                    >
                      <span className="sm:hidden">{measurement.ceilingHeightM.toFixed(2)}m</span>
                      <span className="hidden sm:inline">
                        {formatHeightMetricAndImperial(measurement.ceilingHeightCm)}
                      </span>
                    </span>
                  </div>
                  <span className="h-5 w-px bg-white/15 shrink-0" aria-hidden="true" />
                  <div className="shrink-0">
                    <span className="block text-[10px] text-zinc-400 leading-none">Room</span>
                    <span
                      className="font-mono font-semibold text-amber-200 tabular-nums"
                      data-testid="ar-predicted-room"
                    >
                      {displayWidthM.toFixed(1)}×{displayDepthM.toFixed(1)}m
                    </span>
                  </div>
                  <span className="h-5 w-px bg-white/15 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <span className="block text-[10px] text-emerald-300 leading-none">Fitted Pole</span>
                    <span className="font-semibold text-zinc-100 truncate block text-[11px]">
                      {BASE_MOUNTS[measurement.recommendedMount].shortName} ·{' '}
                      {measurement.recommendedDiameterMm}mm · {measurement.extensionsLabel}
                    </span>
                  </div>
                </div>
              </div>

              {/* Material Finish PFPs + Spin + Apply & Close */}
              <div className="px-2.5 py-1.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1" role="group" aria-label="Pole finish in AR">
                  {FINISH_ORDER.map((fid) => {
                    const selected = activeFinish === fid;
                    return (
                      <button
                        key={fid}
                        type="button"
                        onClick={() => onChangeFinish(fid)}
                        aria-label={POLE_FINISHES[fid].shortName}
                        aria-pressed={selected}
                        title={POLE_FINISHES[fid].shortName}
                        className={`p-0.5 rounded-full border-2 transition-transform active:scale-95 ${
                          selected
                            ? 'border-cyan-400 scale-105'
                            : 'border-transparent opacity-75 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={avatars[fid]}
                          alt=""
                          aria-hidden="true"
                          className="w-7 h-7 rounded-full object-cover"
                        />
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={onToggleSpin}
                    aria-pressed={isSpinning}
                    aria-label="Toggle Spin in AR"
                    className={`ml-1 min-h-[32px] px-2 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                      isSpinning
                        ? 'border-cyan-400/75 bg-cyan-400/20 text-cyan-200'
                        : 'border-white/20 bg-white/10 text-zinc-200'
                    }`}
                  >
                    <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">{isSpinning ? 'Spin' : 'Static'}</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onAutoSyncRoom(measurement, false);
                    onExit();
                  }}
                  data-testid="ar-done-button"
                  className="min-h-[34px] px-3.5 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Use This Fit</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
