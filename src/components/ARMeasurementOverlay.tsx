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
  Layers,
  MoveHorizontal,
  RefreshCw,
  RotateCw,
  ScanLine,
  SlidersHorizontal,
  Sparkles,
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
  getDefaultFloorCalibrationTaps,
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

type DragHandleId =
  | 'ceiling'
  | 'floor'
  | 'left-corner'
  | 'right-corner'
  | 'pole'
  | `floor-pin-${number}`;

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
  showPointCloud,
  onToggleShowPointCloud,
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
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [tapWarning, setTapWarning] = useState<string | null>(null);

  const [scanAcc, setScanAcc] = useState<RoomScanAccumulator>(() =>
    createRoomScanAccumulator(markers)
  );
  const scanAccRef = useRef<RoomScanAccumulator>(scanAcc);
  scanAccRef.current = scanAcc;

  // Refs so live timers and pointer handlers always read fresh state
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

  // Helper that computes the highest-accuracy measurement using 4-pt calibration whenever valid
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

  // Clear transient tap warning automatically
  useEffect(() => {
    if (!tapWarning) return;
    const t = window.setTimeout(() => setTapWarning(null), 2200);
    return () => window.clearTimeout(t);
  }, [tapWarning]);

  // Real-time camera frame point-cloud & wall-corner scanner loop (Stage 2: scanning)
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
            onChangeScanPhase('pole-ready');
            setSyncNotice(
              `Synced ${lockedResult.ceilingHeightM.toFixed(2)}m · ${lockedResult.roomWidthM.toFixed(1)}×${lockedResult.roomDepthM.toFixed(1)}m`
            );
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

  // Optional DeviceOrientation pitch sensor for real smartphone tilt measurement
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
        if (perm === 'granted') {
          setGyroActive(true);
          setSyncNotice('Live tilt sensor active');
        } else {
          setSyncNotice('Tilt denied — drag lines or tap floor corners');
        }
      } catch {
        setSyncNotice('Tap 4 floor points to calibrate plane');
      }
    } else if ('DeviceOrientationEvent' in window) {
      setGyroActive(true);
      setSyncNotice('Live tilt sensor active');
    } else {
      setSyncNotice('Tap 4 floor points to calibrate plane');
    }
  };

  const handleLockRoomNow = useCallback(() => {
    autoLockedRef.current = true;
    const locked = computeBestMeasurement(markersRef.current, floorTapsRef.current);
    onAutoSyncRoom(locked, false);
    onChangeScanPhase('pole-ready');
    setSyncNotice(
      `Synced ${locked.ceilingHeightM.toFixed(2)}m · ${locked.roomWidthM.toFixed(1)}×${locked.roomDepthM.toFixed(1)}m`
    );
  }, [computeBestMeasurement, onAutoSyncRoom, onChangeScanPhase]);

  const handleStartCloudScan = useCallback(() => {
    autoLockedRef.current = false;
    scanStepRef.current = 0;
    const fresh = createRoomScanAccumulator(markersRef.current);
    scanAccRef.current = fresh;
    setScanAcc(fresh);
    onUpdatePointCloud([]);
    setSyncNotice(null);
    onChangeScanPhase('scanning');
  }, [onChangeScanPhase, onUpdatePointCloud]);

  const handleEnterSurfaceCalibration = useCallback(() => {
    setSyncNotice(null);
    onChangeScanPhase('surface-calibrate');
  }, [onChangeScanPhase]);

  const handleUndoFloorTap = useCallback(() => {
    onChangeFloorTaps(floorTapsRef.current.slice(0, -1));
  }, [onChangeFloorTaps]);

  const handleClearFloorTaps = useCallback(() => {
    onChangeFloorTaps([]);
  }, [onChangeFloorTaps]);

  const handleAutoQuadFloor = useCallback(() => {
    const defaults = getDefaultFloorCalibrationTaps(markersRef.current.aspect);
    onChangeFloorTaps(defaults);
    const updated = computeBestMeasurement(markersRef.current, defaults);
    onAutoSyncRoom(updated, true);
  }, [onChangeFloorTaps, computeBestMeasurement, onAutoSyncRoom]);

  // Tap on physical floor during Stage 1 (Surface Calibration)
  const handleFloorSurfaceTap = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (scanPhase !== 'surface-calibrate' || draggingHandle !== null) return;
    if (floorTapsRef.current.length >= 4) return;

    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;

    const u = Math.max(0.04, Math.min(0.96, (e.clientX - rect.left) / rect.width));
    const v = Math.max(0.08, Math.min(0.92, (e.clientY - rect.top) / rect.height));

    const hit3D = screenToFloorPoint3D(u, v, markersRef.current, floorTapsRef.current.length + 1);
    if (!hit3D) {
      setTapWarning('Tap lower on the physical floor plane (below horizon)');
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
        setSyncNotice(
          `Floor calibrated (${cal.accuracyScore}%) · ${cal.roomWidthM.toFixed(1)}×${cal.roomDepthM.toFixed(1)}m`
        );
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
          const updated = computeBestMeasurement(markersRef.current, nextTaps);
          onAutoSyncRoom(updated, true);
        }
        return;
      }

      const cur = markersRef.current;
      let next: ARMarkerState = cur;
      if (handle === 'ceiling') {
        next = clampARMarkers({ ...cur, ceilingY: ny });
      } else if (handle === 'floor') {
        next = clampARMarkers({ ...cur, floorY: ny });
      } else if (handle === 'left-corner') {
        next = clampARMarkers({ ...cur, leftCornerX: nx });
      } else if (handle === 'right-corner') {
        next = clampARMarkers({ ...cur, rightCornerX: nx });
      } else if (handle === 'pole') {
        next = clampARMarkers({ ...cur, poleX: nx });
      }

      onChangeMarkers(next);
      if ((scanPhase === 'pole-ready' || surfaceCalibration?.valid) && handle !== 'pole') {
        const updated = computeBestMeasurement(next, floorTapsRef.current);
        onAutoSyncRoom(updated, true);
      }
    },
    [
      onChangeMarkers,
      onChangeFloorTaps,
      onAutoSyncRoom,
      scanPhase,
      surfaceCalibration?.valid,
      computeBestMeasurement,
    ]
  );

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingHandle) return;
    e.preventDefault();
    updateMarkerFromPointer(e.clientX, e.clientY, draggingHandle);
  };

  const onPointerUp = () => {
    if (draggingHandle && draggingHandle !== 'pole') {
      const updated = computeBestMeasurement(markersRef.current, floorTapsRef.current);
      if (scanPhase === 'pole-ready' || surfaceCalibration?.valid) {
        onAutoSyncRoom(updated, true);
      }
    }
    setDraggingHandle(null);
  };

  // Ordered polygon points for SVG rendering during 4-point floor calibration
  const orderedFloorPoints = useMemo<FloorPoint3D[]>(() => {
    if (surfaceCalibration?.valid) return surfaceCalibration.points3D;
    return partialFloorPoints;
  }, [surfaceCalibration, partialFloorPoints]);

  const ceilPct = `${(markers.ceilingY * 100).toFixed(2)}%`;
  const floorPct = `${(markers.floorY * 100).toFixed(2)}%`;
  const leftPct = `${(markers.leftCornerX * 100).toFixed(2)}%`;
  const rightPct = `${(markers.rightCornerX * 100).toFixed(2)}%`;
  const rightInsetPct = `${((1 - markers.rightCornerX) * 100).toFixed(2)}%`;
  const bottomInsetPct = `${((1 - markers.floorY) * 100).toFixed(2)}%`;
  const poleXPct = `${(markers.poleX * 100).toFixed(2)}%`;
  const midYPct = `${(((markers.ceilingY + markers.floorY) / 2) * 100).toFixed(2)}%`;

  const isSurfaceMode = scanPhase === 'surface-calibrate';

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
      {/* Stage 1 Full-Viewport Interactive Physical Floor Tap Capture Layer */}
      {isSurfaceMode && (
        <div
          onPointerDown={handleFloorSurfaceTap}
          data-testid="ar-surface-tap-layer"
          aria-label="Tap 4 points on the physical floor to calibrate room bounds"
          className="absolute inset-0 pointer-events-auto cursor-crosshair"
        >
          {/* Subtle horizon reference line showing valid ground-plane tap zone */}
          <div
            className="absolute left-4 right-4 border-t border-dashed border-emerald-400/35 pointer-events-none"
            style={{ top: '52%' }}
          >
            <span className="absolute right-1 -top-4 text-[10px] font-mono text-emerald-300/80 bg-black/55 px-1.5 py-0.5 rounded">
              Tap Floor Below Horizon ({floorTaps.length}/4)
            </span>
          </div>
        </div>
      )}

      {/* Stage 1 / Calibrated 2D Floor Polygon + Metric Edge Length Labels */}
      {orderedFloorPoints.length > 0 && (isSurfaceMode || showPointCloud) && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {orderedFloorPoints.length === 4 && (
            <polygon
              points={orderedFloorPoints.map((p) => `${p.u * 100},${p.v * 100}`).join(' ')}
              fill={isSurfaceMode ? 'rgba(16, 185, 129, 0.16)' : 'rgba(16, 185, 129, 0.08)'}
              stroke="#34d399"
              strokeWidth={isSurfaceMode ? 0.38 : 0.25}
              strokeDasharray={isSurfaceMode ? undefined : '1.2 0.8'}
            />
          )}
          {orderedFloorPoints.length >= 2 && orderedFloorPoints.length < 4 && (
            <polyline
              points={orderedFloorPoints.map((p) => `${p.u * 100},${p.v * 100}`).join(' ')}
              fill="none"
              stroke="#34d399"
              strokeWidth={0.38}
            />
          )}
        </svg>
      )}

      {/* Floating Metric Edge Length Tags around the 4-Point Calibrated Floor Quad */}
      {surfaceCalibration?.valid && isSurfaceMode && (
        <>
          {surfaceCalibration.points3D.map((pt, idx) => {
            const nextPt = surfaceCalibration.points3D[(idx + 1) % 4];
            const midU = ((pt.u + nextPt.u) * 50).toFixed(2);
            const midV = ((pt.v + nextPt.v) * 50).toFixed(2);
            const lenM = surfaceCalibration.edgeLengthsM[idx];
            return (
              <div
                key={`edge-${idx}`}
                className="absolute -translate-x-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-[#071511]/92 border border-emerald-400/60 text-emerald-200 font-mono text-[10px] font-semibold tabular-nums pointer-events-none"
                style={{ left: `${midU}%`, top: `${midV}%` }}
                data-testid={`ar-floor-edge-${idx}`}
              >
                {lenM.toFixed(1)}m
              </div>
            );
          })}

          {/* Calibrated Ground-Plane Pole Anchor Crosshair */}
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center"
            style={{
              left: `${(surfaceCalibration.centroidScreenU * 100).toFixed(2)}%`,
              top: `${(surfaceCalibration.centroidScreenV * 100).toFixed(2)}%`,
            }}
          >
            <div className="w-7 h-7 rounded-full border-2 border-cyan-300 bg-cyan-400/15 flex items-center justify-center shadow-[0_0_12px_rgba(34,211,238,0.5)]">
              <Crosshair className="w-3.5 h-3.5 text-cyan-200" aria-hidden="true" />
            </div>
            <span className="mt-1 px-1.5 py-0.5 rounded bg-[#09121a]/92 border border-cyan-400/50 text-[9px] font-mono text-cyan-200 whitespace-nowrap">
              Pole Base · {surfaceCalibration.floorAreaSqM.toFixed(1)}m²
            </span>
          </div>
        </>
      )}

      {/* Draggable Numbered 4-Point Floor Pins (Stage 1) */}
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
            aria-label={`Floor corner point ${idx + 1}. Drag to refine position.`}
            style={{
              left: `${(tap.u * 100).toFixed(2)}%`,
              top: `${(tap.v * 100).toFixed(2)}%`,
            }}
            className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto touch-none w-8 h-8 rounded-full border-2 border-emerald-300 bg-[#071912]/92 text-emerald-100 font-mono text-xs font-bold flex items-center justify-center shadow-[0_0_14px_rgba(52,211,153,0.55)] active:scale-110 transition-transform"
          >
            {idx + 1}
          </button>
        ))}

      {/* Transient Floor Tap Warning */}
      {tapWarning && isSurfaceMode && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded-lg bg-rose-950/92 border border-rose-400/60 text-rose-100 text-[11px] font-medium whitespace-nowrap shadow-lg">
          {tapWarning}
        </div>
      )}

      {/* Rejected Clutter Cross-Marks (Stage 2: Point Cloud Scan) */}
      {showPointCloud &&
        scanPhase === 'scanning' &&
        scanAcc.points.some((p) => p.category === 'clutter') && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {scanAcc.points
              .filter((pt) => pt.category === 'clutter')
              .slice(-14)
              .map((pt, idx) => {
                const cx = pt.u * 100;
                const cy = pt.v * 100;
                return (
                  <g key={`c-${idx}`} opacity={0.7}>
                    <line
                      x1={cx - 0.55}
                      y1={cy - 0.55}
                      x2={cx + 0.55}
                      y2={cy + 0.55}
                      stroke="#fb7185"
                      strokeWidth={0.28}
                    />
                    <line
                      x1={cx + 0.55}
                      y1={cy - 0.55}
                      x2={cx - 0.55}
                      y2={cy + 0.55}
                      stroke="#fb7185"
                      strokeWidth={0.28}
                    />
                  </g>
                );
              })}
          </svg>
        )}

      {/* Architectural 2D Room Brackets & Floor Bar (Only shown when 4-pt floor calibration is NOT overriding Stage 3) */}
      {!isSurfaceMode && !(scanPhase === 'pole-ready' && surfaceCalibration?.valid) && (
        <>
          <div
            className="absolute pointer-events-none"
            style={{
              top: ceilPct,
              bottom: bottomInsetPct,
              left: leftPct,
              right: rightInsetPct,
            }}
          >
            <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-amber-400" />
            <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-amber-400" />
            <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-amber-400" />
            <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-amber-400" />

            <div
              className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-[#0c0f18]/92 border border-amber-400/50 text-amber-200 font-mono text-[10px] font-semibold tabular-nums whitespace-nowrap"
              data-testid="ar-wall-width-tag"
            >
              {surfaceCalibration?.valid
                ? `${surfaceCalibration.rawWidthM.toFixed(1)}×${surfaceCalibration.rawDepthM.toFixed(1)}m (${surfaceCalibration.floorAreaSqM.toFixed(1)}m²)`
                : `Wall ${measurement.roomWidthM.toFixed(1)}m`}
            </div>
          </div>

          {/* Draggable LEFT & RIGHT Wall Corner Bars */}
          <div
            className="absolute pointer-events-auto touch-none cursor-ew-resize px-3 -translate-x-1/2"
            style={{ left: leftPct, top: ceilPct, bottom: bottomInsetPct }}
            onPointerDown={(e) => {
              e.stopPropagation();
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              setDraggingHandle('left-corner');
            }}
            role="slider"
            aria-label="Left wall corner boundary"
            aria-valuemin={5}
            aria-valuemax={44}
            aria-valuenow={Math.round(markers.leftCornerX * 100)}
            tabIndex={0}
            data-testid="ar-left-corner-handle"
          >
            <div className="relative h-full w-[2px] bg-amber-400/80">
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-7 rounded-md border border-amber-300 bg-[#14121a]/92 flex items-center justify-center">
                <div className="w-[2px] h-3 bg-amber-300 rounded-full" />
              </div>
            </div>
          </div>

          <div
            className="absolute pointer-events-auto touch-none cursor-ew-resize px-3 -translate-x-1/2"
            style={{ left: rightPct, top: ceilPct, bottom: bottomInsetPct }}
            onPointerDown={(e) => {
              e.stopPropagation();
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              setDraggingHandle('right-corner');
            }}
            role="slider"
            aria-label="Right wall corner boundary"
            aria-valuemin={56}
            aria-valuemax={95}
            aria-valuenow={Math.round(markers.rightCornerX * 100)}
            tabIndex={0}
            data-testid="ar-right-corner-handle"
          >
            <div className="relative h-full w-[2px] bg-amber-400/80">
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-7 rounded-md border border-amber-300 bg-[#14121a]/92 flex items-center justify-center">
                <div className="w-[2px] h-3 bg-amber-300 rounded-full" />
              </div>
            </div>
          </div>

          {/* Draggable FLOOR Plane Sightline Bar */}
          <div
            className="absolute pointer-events-auto touch-none cursor-ns-resize py-3 -translate-y-1/2"
            style={{ top: floorPct, left: leftPct, right: rightInsetPct }}
            onPointerDown={(e) => {
              e.stopPropagation();
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              setDraggingHandle('floor');
            }}
            role="slider"
            aria-label="Floor base measurement line"
            aria-valuemin={55}
            aria-valuemax={85}
            aria-valuenow={Math.round(markers.floorY * 100)}
            tabIndex={0}
            data-testid="ar-floor-handle"
          >
            <div className="relative h-[2px] bg-cyan-400/90 shadow-[0_0_8px_rgba(34,211,238,0.65)]">
              <div className="absolute left-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-[#0e131d]/92 border border-cyan-400/60 text-[10px] font-semibold text-cyan-200 whitespace-nowrap">
                Floor · {measurement.distanceM.toFixed(1)}m
              </div>
              <div className="absolute left-1/2 top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full border-2 border-cyan-300 bg-[#0e131d]/92 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-300" />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Vertical Plumb Axis + Live Ceiling Height Tag (Shown cleanly in Stage 2 & Stage 3) */}
      {!isSurfaceMode && (
        <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: poleXPct }}>
          <div
            className={`absolute -translate-x-1/2 w-[1.5px] ${
              scanPhase === 'scanning' ? 'bg-cyan-400/70' : 'bg-cyan-400/30'
            }`}
            style={{
              top: ceilPct,
              bottom: surfaceCalibration?.valid
                ? `${((1 - surfaceCalibration.centroidScreenV) * 100).toFixed(2)}%`
                : bottomInsetPct,
            }}
          />
          <div
            className="absolute left-3 -translate-y-1/2 px-2 py-0.5 rounded-md bg-[#0b0e17]/92 border border-cyan-400/50 text-cyan-200 font-mono text-[11px] font-semibold tabular-nums whitespace-nowrap"
            style={{ top: midYPct }}
            data-testid="ar-live-height-tag"
          >
            {measurement.ceilingHeightM.toFixed(2)}m
          </div>
        </div>
      )}

      {/* Draggable CEILING Plane Sightline Bar (Active in Stage 2 & 3, and in Stage 1 once 4 floor points are set) */}
      {(!isSurfaceMode || surfaceCalibration?.valid) && (
        <div
          className="absolute pointer-events-auto touch-none cursor-ns-resize py-3 -translate-y-1/2"
          style={{
            top: ceilPct,
            left: isSurfaceMode ? '10%' : leftPct,
            right: isSurfaceMode ? '10%' : rightInsetPct,
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            setDraggingHandle('ceiling');
          }}
          role="slider"
          aria-label="Ceiling plane measurement line"
          aria-valuemin={8}
          aria-valuemax={45}
          aria-valuenow={Math.round(markers.ceilingY * 100)}
          tabIndex={0}
          data-testid="ar-ceiling-handle"
        >
          <div className="relative h-[2px] bg-violet-400/90 shadow-[0_0_8px_rgba(167,139,250,0.65)]">
            <div className="absolute left-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-[#121420]/92 border border-violet-400/60 text-[10px] font-semibold text-violet-200 whitespace-nowrap">
              Ceiling · {measurement.ceilingHeightM.toFixed(2)}m
            </div>
            <div className="absolute left-1/2 top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full border-2 border-violet-300 bg-[#121420]/92 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-violet-300" />
            </div>
          </div>
        </div>
      )}

      {/* Horizontal Pole Position Handle (Stage 3: slide fitted pole inside calibrated room) */}
      {scanPhase === 'pole-ready' && (
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            setDraggingHandle('pole');
          }}
          style={{
            left: poleXPct,
            top: `${Math.min(68, Math.max(32, ((markers.ceilingY + markers.floorY) / 2) * 100 + 8))}%`,
          }}
          aria-label="Slide pole left or right in room"
          title="Drag left/right to place pole in calibrated room"
          className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto touch-none w-9 h-9 rounded-full bg-[#0d1018]/90 border border-cyan-300/50 text-white flex items-center justify-center shadow-lg active:scale-95"
        >
          <MoveHorizontal className="w-4 h-4" aria-hidden="true" />
        </button>
      )}

      {/* Top AR Header Bar: 3-Stage Stepper + Utility Controls */}
      <div className="fixed top-0 left-0 right-0 z-50 px-2.5 sm:px-5 pt-2.5 pb-2 bg-gradient-to-b from-black/88 via-black/55 to-transparent pointer-events-auto">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-1.5">
          {/* 3-Stage Room Calibration Flow */}
          <div className="flex items-center gap-0.5 bg-[#0e111a]/92 border border-white/15 rounded-lg p-0.5 shrink-0">
            <button
              type="button"
              onClick={handleEnterSurfaceCalibration}
              data-testid="ar-step-floor"
              className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ${
                scanPhase === 'surface-calibrate'
                  ? 'bg-emerald-500/30 text-emerald-100 border border-emerald-400/55'
                  : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
              }`}
            >
              <span className="sm:hidden">1. Floor</span>
              <span className="hidden sm:inline">1. Floor 4-Pt</span>
            </button>
            <button
              type="button"
              onClick={handleStartCloudScan}
              data-testid="ar-step-scan"
              className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ${
                scanPhase === 'scanning'
                  ? 'bg-violet-500/30 text-violet-100 border border-violet-400/55'
                  : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
              }`}
            >
              <span className="sm:hidden">2. Cloud</span>
              <span className="hidden sm:inline">2. Cloud Scan</span>
            </button>
            <button
              type="button"
              onClick={handleLockRoomNow}
              data-testid="ar-step-pole"
              className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ${
                scanPhase === 'pole-ready'
                  ? 'bg-cyan-500/25 text-cyan-100 border border-cyan-400/55'
                  : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
              }`}
            >
              <span className="sm:hidden">3. Pole</span>
              <span className="hidden sm:inline">3. Fit Pole</span>
            </button>
          </div>

          {/* Utility Controls: Mesh, Tilt, Lens Height, Exit */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onToggleShowPointCloud}
              aria-pressed={showPointCloud}
              aria-label="Toggle 3D overlay mesh"
              title="Toggle 3D Overlay"
              className={`min-h-[32px] px-2 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${
                showPointCloud
                  ? 'border-violet-400/70 bg-violet-500/25 text-violet-100'
                  : 'border-white/20 bg-[#0f121b]/90 text-zinc-300'
              }`}
            >
              <Layers className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Mesh</span>
            </button>

            <button
              type="button"
              onClick={handleToggleGyro}
              aria-pressed={gyroActive}
              aria-label="Toggle live tilt sensor"
              title="Live Tilt Sensor"
              className={`min-h-[32px] px-2 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${
                gyroActive
                  ? 'border-cyan-400/75 bg-cyan-500/20 text-cyan-200'
                  : 'border-white/20 bg-[#0f121b]/90 text-zinc-200'
              }`}
            >
              <Compass className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Tilt</span>
            </button>

            <button
              type="button"
              onClick={() => setShowCalibPanel((v) => !v)}
              aria-pressed={showCalibPanel}
              aria-label="Phone lens height calibration"
              className={`min-h-[32px] px-2 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${
                showCalibPanel
                  ? 'border-amber-400/75 bg-amber-500/20 text-amber-100'
                  : 'border-white/20 bg-[#0f121b]/90 text-zinc-200'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden xs:inline font-mono tabular-nums">
                {markers.cameraHeightM.toFixed(2)}m
              </span>
            </button>

            <button
              type="button"
              onClick={onExit}
              aria-label="Exit AR Mode"
              data-testid="exit-ar-button"
              className="min-h-[32px] min-w-[32px] px-2 rounded-lg border border-white/20 bg-[#0f121b]/92 text-white hover:bg-white/15 inline-flex items-center justify-center gap-1 text-xs font-semibold"
            >
              <X className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Exit</span>
            </button>
          </div>
        </div>

        {/* Optional Camera Eye-Height Calibration Drawer */}
        {showCalibPanel && (
          <div className="max-w-3xl mx-auto mt-2 p-2.5 rounded-xl bg-[#0e1018]/94 border border-white/15 text-zinc-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <label htmlFor="ar-cam-height" className="text-[11px] text-zinc-300 whitespace-nowrap">
                Lens Height
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
                  const updated = computeBestMeasurement(next, floorTapsRef.current);
                  if (scanPhase === 'pole-ready' || surfaceCalibration?.valid) {
                    onAutoSyncRoom(updated, true);
                  }
                }}
                className="axis-slider flex-1"
              />
              <span className="font-mono text-[11px] font-semibold tabular-nums w-11 text-right">
                {markers.cameraHeightM.toFixed(2)}m
              </span>
            </div>
            <div className="flex items-center gap-1 text-[11px]">
              {[
                { label: 'Waist 1.1m', m: 1.1 },
                { label: 'Chest 1.35m', m: 1.35 },
                { label: 'Eye 1.55m', m: 1.55 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    const next = clampARMarkers({ ...markers, cameraHeightM: preset.m });
                    onChangeMarkers(next);
                    const updated = computeBestMeasurement(next, floorTapsRef.current);
                    if (scanPhase === 'pole-ready' || surfaceCalibration?.valid) {
                      onAutoSyncRoom(updated, true);
                    }
                  }}
                  className="px-2 py-1 rounded-md border border-white/15 bg-white/5 hover:bg-white/15 text-zinc-200 whitespace-nowrap"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom AR Control & Live Dimension Analysis Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 px-3 pb-3 pt-1.5 pointer-events-auto">
        <div className="max-w-2xl mx-auto rounded-2xl border border-white/15 bg-[#0e1018]/94 text-zinc-100 shadow-2xl overflow-hidden">
          {scanPhase === 'surface-calibrate' ? (
            <>
              {/* Stage 1: 4-Point Physical Floor Surface Calibration */}
              <div className="px-3 py-2 border-b border-white/10">
                <div className="flex items-center justify-between gap-2 text-[11px] mb-1.5">
                  <span className="font-semibold text-emerald-200 truncate" data-testid="ar-surface-status">
                    {surfaceCalibration?.valid
                      ? `Floor plane calibrated · Drag pins or ceiling bar to refine`
                      : `Tap corner ${floorTaps.length + 1} of 4 on the physical floor`}
                  </span>
                  <span className="font-mono text-emerald-300 tabular-nums shrink-0">
                    {floorTaps.length}/4 pts
                    {surfaceCalibration?.valid ? ` · ${surfaceCalibration.accuracyScore}%` : ''}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[1, 2, 3, 4].map((stepNum) => (
                    <div
                      key={stepNum}
                      className={`h-1.5 rounded-full transition-colors ${
                        floorTaps.length >= stepNum ? 'bg-emerald-400' : 'bg-white/12'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                {surfaceCalibration?.valid ? (
                  <div className="flex items-center gap-2.5 text-xs min-w-0">
                    <div>
                      <span className="block text-[10px] text-zinc-400 leading-none">W × D</span>
                      <span
                        className="font-mono font-bold text-emerald-300 tabular-nums"
                        data-testid="ar-calibrated-wd"
                      >
                        {surfaceCalibration.rawWidthM.toFixed(1)}×{surfaceCalibration.rawDepthM.toFixed(1)}m
                      </span>
                    </div>
                    <span className="h-5 w-px bg-white/12 shrink-0" aria-hidden="true" />
                    <div>
                      <span className="block text-[10px] text-zinc-400 leading-none">Height</span>
                      <span
                        className="font-mono font-bold text-cyan-300 tabular-nums"
                        data-testid="ar-predicted-ceiling"
                      >
                        {measurement.ceilingHeightM.toFixed(2)}m
                      </span>
                    </div>
                    <span className="h-5 w-px bg-white/12 shrink-0" aria-hidden="true" />
                    <div>
                      <span className="block text-[10px] text-zinc-400 leading-none">Area</span>
                      <span className="font-mono font-semibold text-amber-200 tabular-nums">
                        {surfaceCalibration.floorAreaSqM.toFixed(1)}m²
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-zinc-300 leading-snug">
                    Tap 4 room floor corners below the dashed horizon to lock exact Width, Depth & Pole Base.
                  </p>
                )}

                <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                  {floorTaps.length > 0 && (
                    <button
                      type="button"
                      onClick={handleUndoFloorTap}
                      aria-label="Undo last floor point"
                      className="min-h-[34px] px-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-zinc-200 text-[11px] font-semibold inline-flex items-center gap-1"
                    >
                      <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">Undo</span>
                    </button>
                  )}

                  {floorTaps.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearFloorTaps}
                      className="min-h-[34px] px-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-zinc-300 text-[11px] font-semibold"
                    >
                      Clear
                    </button>
                  )}

                  {!surfaceCalibration?.valid ? (
                    <button
                      type="button"
                      onClick={handleAutoQuadFloor}
                      data-testid="ar-auto-quad-button"
                      className="min-h-[34px] px-2.5 rounded-xl border border-emerald-400/50 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Auto Quad</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={handleStartCloudScan}
                        className="min-h-[34px] px-2.5 rounded-xl border border-violet-400/50 bg-violet-500/20 hover:bg-violet-500/30 text-violet-100 text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        <ScanLine className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Scan Ceiling</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleLockRoomNow}
                        data-testid="ar-fit-pole-from-floor-button"
                        className="min-h-[34px] px-3 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-zinc-950 text-[11px] font-bold inline-flex items-center gap-1 transition-colors whitespace-nowrap"
                      >
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Fit Pole</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : scanPhase === 'scanning' ? (
            <>
              {/* Stage 2: Real-Time Point Cloud Room Dimension Scan Status */}
              <div className="px-3 py-2 border-b border-white/10">
                <div className="flex items-center justify-between gap-2 text-[11px] mb-1.5">
                  <span className="font-medium text-zinc-200 truncate" data-testid="ar-scan-status">
                    {scanAcc.statusMessage}
                  </span>
                  <span className="font-mono text-violet-300 tabular-nums shrink-0">
                    {scanAcc.scanProgress}% · {scanAcc.points.length} pts
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-violet-400 transition-all duration-200"
                    style={{ width: `${Math.max(8, scanAcc.scanProgress)}%` }}
                  />
                </div>
              </div>

              <div className="px-3 py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 text-xs min-w-0">
                  <div>
                    <span className="block text-[10px] text-zinc-400 leading-none">Ceiling</span>
                    <span
                      className="font-mono font-bold text-cyan-300 tabular-nums"
                      data-testid="ar-predicted-ceiling"
                    >
                      {measurement.ceilingHeightM.toFixed(2)}m
                    </span>
                  </div>
                  <span className="h-5 w-px bg-white/12 shrink-0" aria-hidden="true" />
                  <div>
                    <span className="block text-[10px] text-zinc-400 leading-none">Room W×D</span>
                    <span
                      className="font-mono font-semibold text-amber-200 tabular-nums"
                      data-testid="ar-predicted-room"
                    >
                      {measurement.roomWidthM.toFixed(1)}×{measurement.roomDepthM.toFixed(1)}m
                    </span>
                  </div>
                  {scanAcc.clutterRejectedTotal > 0 && (
                    <>
                      <span className="hidden sm:inline-block h-5 w-px bg-white/12 shrink-0" aria-hidden="true" />
                      <div className="hidden sm:block">
                        <span className="block text-[10px] text-zinc-400 leading-none">Clutter Filter</span>
                        <span className="font-mono text-[11px] text-rose-300 tabular-nums">
                          {scanAcc.clutterRejectedTotal} ignored
                        </span>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleStartCloudScan}
                    aria-label="Reset room scan"
                    className="min-h-[34px] px-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-zinc-200 text-[11px] font-semibold inline-flex items-center gap-1"
                  >
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">Reset</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleLockRoomNow}
                    data-testid="ar-lock-room-button"
                    className="min-h-[34px] px-3 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 text-[11px] font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap"
                  >
                    <ScanLine className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Lock & Fit Pole</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Stage 3: Room Locked & Auto-Synced Pole Setup Preview */}
              <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="shrink-0">
                    <span className="block text-[10px] text-zinc-400 leading-none">Height</span>
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
                  <span className="h-5 w-px bg-white/12 shrink-0" aria-hidden="true" />
                  <div className="shrink-0">
                    <span className="block text-[10px] text-zinc-400 leading-none">
                      {surfaceCalibration?.valid ? '4-Pt W×D' : 'Room W×D'}
                    </span>
                    <span
                      className="font-mono font-semibold text-amber-200 tabular-nums"
                      data-testid="ar-predicted-room"
                    >
                      {surfaceCalibration?.valid
                        ? `${surfaceCalibration.rawWidthM.toFixed(1)}×${surfaceCalibration.rawDepthM.toFixed(1)}m`
                        : `${measurement.roomWidthM.toFixed(1)}×${measurement.roomDepthM.toFixed(1)}m`}
                    </span>
                  </div>
                  {surfaceCalibration?.valid && (
                    <>
                      <span className="hidden sm:inline-block h-5 w-px bg-white/12 shrink-0" aria-hidden="true" />
                      <div className="hidden sm:block shrink-0">
                        <span className="block text-[10px] text-emerald-300/90 leading-none">
                          Clearance
                        </span>
                        <span className="font-mono font-semibold text-emerald-200 tabular-nums">
                          {surfaceCalibration.minEdgeClearanceM.toFixed(1)}m · {surfaceCalibration.floorAreaSqM.toFixed(1)}m²
                        </span>
                      </div>
                    </>
                  )}
                  <span className="h-5 w-px bg-white/12 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <span className="block text-[10px] text-emerald-300/90 leading-none">
                      {syncNotice ? 'Auto-Synced' : 'Fitted Rig'}
                    </span>
                    <span className="font-semibold text-violet-200 truncate block text-[11px]">
                      {BASE_MOUNTS[measurement.recommendedMount].shortName} ·{' '}
                      {measurement.recommendedDiameterMm}mm · {measurement.extensionsLabel}
                    </span>
                  </div>
                </div>
              </div>

              <div className="px-2.5 py-1.5 flex items-center justify-between gap-1.5">
                {/* Rounded Material PFPs to preview finishes inside calibrated room */}
                <div className="flex items-center gap-1" role="group" aria-label="Preview pole finish in AR">
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
                          className="w-6.5 h-6.5 rounded-full object-cover"
                        />
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={onToggleSpin}
                    aria-pressed={isSpinning}
                    aria-label="Toggle Spin in AR"
                    title={isSpinning ? 'Spin On' : 'Static'}
                    className={`ml-0.5 min-h-[32px] px-2 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                      isSpinning
                        ? 'border-cyan-400/70 bg-cyan-400/15 text-cyan-200'
                        : 'border-white/15 bg-white/5 text-zinc-300'
                    }`}
                  >
                    <RotateCw className="w-3 h-3" aria-hidden="true" />
                    <span className="hidden sm:inline">{isSpinning ? 'Spin' : 'Static'}</span>
                  </button>
                </div>

                {/* Stage 3 Actions: Recalibrate Floor or Return to Studio */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleEnterSurfaceCalibration}
                    data-testid="ar-recalibrate-floor-button"
                    className="min-h-[34px] px-2.5 rounded-xl border border-emerald-400/50 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 text-[11px] font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap"
                  >
                    <Crosshair className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>4-Pt Floor</span>
                  </button>

                  <button
                    type="button"
                    onClick={onExit}
                    data-testid="ar-done-button"
                    className="min-h-[34px] px-3 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 text-[11px] font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap"
                  >
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Done</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
