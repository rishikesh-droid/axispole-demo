import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  AlertCircle,
  Check,
  Compass,
  Crosshair,
  Gauge,
  ImagePlus,
  Loader2,
  MoveHorizontal,
  RotateCw,
  ScanLine,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  X,
} from 'lucide-react';
import type { PoleFinishId, RoomReplicaScene } from '../types/pole';
import {
  calculateARMeasurement,
  clampARMarkers,
  type ARMarkerState,
  type ARMeasurementResult,
} from '../utils/arMeasure';
import {
  accumulateRoomScan,
  analyzeFrameForPointCloud,
  computeLiveARAccuracy,
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
import {
  captureBestVideoFrameDataUrl,
  compressImageFileToDataUrl,
} from '../utils/roomReplica';
import {
  preloadLocalCocoSsdModel,
  scanRoomLocallyFromDataUrl,
} from '../utils/localRoomScanner';
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
  uploadedPhotoUrl: string | null;
  onUploadRoomPhoto: (dataUrl: string | null) => void;
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
  onApplyRoomReplica: (result: ARMeasurementResult, replica: RoomReplicaScene) => void;
  onExit: () => void;
}

const FINISH_ORDER: PoleFinishId[] = ['brass', 'stainless', 'powder-black', 'silicone'];
type DragHandleId = 'ceiling' | 'floor' | 'pole' | `floor-pin-${number}`;

const REPLICA_STAGES = [
  'Sampling walls, floor, ceiling & room lighting…',
  'Identifying furniture & fixtures on device…',
  'Projecting 3D objects & completing unseen zones…',
  'Constructing 3D Room Replica…',
];

export function ARMeasurementOverlay({
  videoRef,
  arCameraError,
  uploadedPhotoUrl,
  onUploadRoomPhoto,
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
  onApplyRoomReplica,
  onExit,
}: ARMeasurementOverlayProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [draggingHandle, setDraggingHandle] = useState<DragHandleId | null>(null);
  const [gyroActive, setGyroActive] = useState(false);
  const [showCalibPanel, setShowCalibPanel] = useState(false);
  const [tapWarning, setTapWarning] = useState<string | null>(null);
  const [userAdjustedCeiling, setUserAdjustedCeiling] = useState(false);
  const [userAdjustedFloor, setUserAdjustedFloor] = useState(false);

  // Scene Capture -> 3D Room Replica build state
  const [isBuildingReplica, setIsBuildingReplica] = useState(false);
  const [replicaStageIdx, setReplicaStageIdx] = useState(0);
  const [replicaError, setReplicaError] = useState<string | null>(null);

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

  // Live unified Accuracy Meter readout (Floor %, Ceiling %, Overall %, ±cm)
  const liveAccuracy = useMemo(
    () =>
      computeLiveARAccuracy({
        scanAcc,
        markers,
        surfaceCalibrated: Boolean(surfaceCalibration?.valid),
        gyroActive,
        userAdjustedCeiling,
        userAdjustedFloor,
      }),
    [
      scanAcc,
      markers,
      surfaceCalibration?.valid,
      gyroActive,
      userAdjustedCeiling,
      userAdjustedFloor,
    ]
  );

  // Pre-warm on-device TensorFlow.js MobileNetV2 COCO-SSD model silently on AR entry
  useEffect(() => {
    preloadLocalCocoSsdModel();
  }, []);

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

  // Reset progress stage when replica builder closes
  useEffect(() => {
    if (!isBuildingReplica) {
      setReplicaStageIdx(0);
    }
  }, [isBuildingReplica]);

  // Helper: analyze either the live camera video OR an uploaded room photo at 160x200
  const analyzeSourceFrame = useCallback(
    async (curMarkers: ARMarkerState) => {
      const rgba = extractVideoFrameRGBA(videoRef.current, 160, 200);
      if (rgba) {
        return analyzeFrameForPointCloud(rgba, 160, 200, curMarkers);
      }
      if (uploadedPhotoUrl) {
        try {
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error('Image decode failed'));
            el.src = uploadedPhotoUrl;
          });
          const canvas = document.createElement('canvas');
          canvas.width = 160;
          canvas.height = 200;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(img, 0, 0, 160, 200);
            const data = ctx.getImageData(0, 0, 160, 200).data;
            return analyzeFrameForPointCloud(data, 160, 200, curMarkers);
          }
        } catch {
          // Fall through
        }
      }
      if (arCameraError) {
        return generateCalibratedRoomScanFrame(scanStepRef.current, curMarkers);
      }
      return null;
    },
    [videoRef, uploadedPhotoUrl, arCameraError]
  );

  // Passive real-time plane tracking in pole-ready mode so live Accuracy Meter & pole height stay synced!
  useEffect(() => {
    if (scanPhase !== 'pole-ready' || isBuildingReplica) return;
    let cancelled = false;
    const tickPassive = async () => {
      if (cancelled || draggingRef.current !== null) return;
      const rgba = extractVideoFrameRGBA(videoRef.current, 160, 200);
      if (!rgba) return;
      const frame = analyzeFrameForPointCloud(rgba, 160, 200, markersRef.current);
      if (cancelled || !frame.detected) return;

      const nextAcc = accumulateRoomScan(scanAccRef.current, frame);
      scanAccRef.current = nextAcc;
      setScanAcc(nextAcc);

      // Gently auto-adjust pole ceiling & floor alignment when user hasn't manually overridden them
      if (!userAdjustedCeiling && !userAdjustedFloor && !surfaceCalibration?.valid) {
        const cur = markersRef.current;
        const c = nextAcc.consensusCorners;
        const blend = 0.22;
        const nextMarkers = clampARMarkers({
          ...cur,
          ceilingY: cur.ceilingY + (c.ceilingY - cur.ceilingY) * blend,
          floorY: cur.floorY + (c.floorY - cur.floorY) * blend,
          leftCornerX: cur.leftCornerX + (c.leftCornerX - cur.leftCornerX) * blend,
          rightCornerX: cur.rightCornerX + (c.rightCornerX - cur.rightCornerX) * blend,
        });
        onChangeMarkers(nextMarkers);
      }
    };

    const id = window.setInterval(() => {
      void tickPassive();
    }, 520);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    scanPhase,
    isBuildingReplica,
    videoRef,
    userAdjustedCeiling,
    userAdjustedFloor,
    surfaceCalibration?.valid,
    onChangeMarkers,
  ]);

  // High-precision active Auto Scan loop (160x200 multi-channel RANSAC + sub-pixel refinement)
  useEffect(() => {
    if (scanPhase !== 'scanning') return;
    autoLockedRef.current = false;
    scanStepRef.current = 0;
    let cancelled = false;

    const tickScan = async () => {
      if (cancelled || draggingRef.current !== null) return;
      const curMarkers = markersRef.current;
      const frameResult = await analyzeSourceFrame(curMarkers);
      if (cancelled || !frameResult) return;

      scanStepRef.current += 1;

      const nextAcc = accumulateRoomScan(scanAccRef.current, frameResult);
      scanAccRef.current = nextAcc;
      setScanAcc(nextAcc);
      onUpdatePointCloud(nextAcc.points);

      if (frameResult.detected && nextAcc.samples.length > 0) {
        const blend = nextAcc.samples.length <= 2 ? 0.52 : 0.38;
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
          }, 220);
        }
      }
    };

    const initialTimer = window.setTimeout(() => {
      void tickScan();
    }, 150);
    const intervalId = window.setInterval(() => {
      void tickScan();
    }, 210);
    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(intervalId);
    };
  }, [
    scanPhase,
    analyzeSourceFrame,
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
    setReplicaError(null);
    if (scanPhase === 'scanning') {
      onUpdatePointCloud([]);
      onChangeScanPhase('pole-ready');
      return;
    }
    autoLockedRef.current = false;
    scanStepRef.current = 0;
    setUserAdjustedCeiling(false);
    setUserAdjustedFloor(false);
    const fresh = createRoomScanAccumulator(markersRef.current);
    scanAccRef.current = fresh;
    setScanAcc(fresh);
    onUpdatePointCloud([]);
    onChangeScanPhase('scanning');
  }, [scanPhase, onChangeScanPhase, onUpdatePointCloud]);

  const handleToggleFloorCalibrate = useCallback(() => {
    setReplicaError(null);
    if (scanPhase === 'surface-calibrate') {
      onChangeScanPhase('pole-ready');
      return;
    }
    onUpdatePointCloud([]);
    onChangeScanPhase('surface-calibrate');
  }, [scanPhase, onChangeScanPhase, onUpdatePointCloud]);

  const handleSelectPhotoFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setReplicaError(null);
      const dataUrl = await compressImageFileToDataUrl(file, 1024, 0.86);
      onUploadRoomPhoto(dataUrl);
      // Run instant plane analysis on the uploaded room photo to snap pole & boost accuracy
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Decode failed'));
        el.src = dataUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 200;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(img, 0, 0, 160, 200);
        const rgba = ctx.getImageData(0, 0, 160, 200).data;
        const frame = analyzeFrameForPointCloud(rgba, 160, 200, markersRef.current);
        let acc = createRoomScanAccumulator(markersRef.current);
        for (let i = 0; i < 6; i++) {
          acc = accumulateRoomScan(acc, frame);
        }
        scanAccRef.current = acc;
        setScanAcc(acc);
        if (frame.detected) {
          const nextM = clampARMarkers({
            ...markersRef.current,
            ceilingY: frame.corners.ceilingY,
            floorY: frame.corners.floorY,
            leftCornerX: frame.corners.leftCornerX,
            rightCornerX: frame.corners.rightCornerX,
          });
          onChangeMarkers(nextM);
          onAutoSyncRoom(computeBestMeasurement(nextM, floorTapsRef.current), true);
        }
      }
    } catch (err) {
      setReplicaError(err instanceof Error ? err.message : 'Could not load room photo.');
    }
  };

  /**
   * "Use This Fit": Captures the live camera scene (or uploaded room photo) + AR metrics,
   * runs 100% on-device object detection (TensorFlow.js COCO-SSD + pixel CV surface & fixture
   * sampling) with zero API keys or external servers, then opens the 3D Room Replica.
   */
  const handleUseThisFitWithReplica = useCallback(async () => {
    setReplicaError(null);
    const snapshotDataUrl =
      (await captureBestVideoFrameDataUrl(videoRef.current, 1024, 0.88)) ?? uploadedPhotoUrl;

    if (!snapshotDataUrl) {
      setReplicaError(
        'No live camera frame available to capture your room. Upload a room photo to build your 3D Room Replica, or apply dimensions only.'
      );
      return;
    }

    setIsBuildingReplica(true);
    setReplicaStageIdx(0);

    try {
      const displayW = surfaceCalibration?.valid
        ? surfaceCalibration.rawWidthM
        : measurement.roomWidthM;
      const displayD = surfaceCalibration?.valid
        ? surfaceCalibration.rawDepthM
        : measurement.roomDepthM;

      const { scene } = await scanRoomLocallyFromDataUrl(
        snapshotDataUrl,
        {
          markers: markersRef.current,
          roomWidthM: displayW,
          roomDepthM: displayD,
          ceilingHeightCm: measurement.ceilingHeightCm,
          distanceM: measurement.distanceM,
          poleOffsetXM: measurement.poleOffsetXM,
          floorAccuracyPct: liveAccuracy.floorAccuracyPct,
          ceilingAccuracyPct: liveAccuracy.ceilingAccuracyPct,
          overallAccuracyPct: liveAccuracy.overallAccuracyPct,
        },
        (stageIdx) => setReplicaStageIdx(stageIdx)
      );

      setIsBuildingReplica(false);
      onApplyRoomReplica(measurement, scene);
    } catch (err) {
      setIsBuildingReplica(false);
      setReplicaError(
        err instanceof Error
          ? err.message
          : 'Could not scan room scene. Please retry or apply dimensions only.'
      );
    }
  }, [
    videoRef,
    uploadedPhotoUrl,
    surfaceCalibration,
    measurement,
    liveAccuracy,
    onApplyRoomReplica,
  ]);

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
        setUserAdjustedCeiling(true);
        next = clampARMarkers({ ...cur, ceilingY: ny });
      } else if (handle === 'floor') {
        setUserAdjustedFloor(true);
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

  const accuracyColorClass =
    liveAccuracy.overallAccuracyPct >= 91
      ? 'text-emerald-300'
      : liveAccuracy.overallAccuracyPct >= 78
        ? 'text-cyan-300'
        : 'text-amber-300';

  const accuracyBarColor =
    liveAccuracy.overallAccuracyPct >= 91
      ? 'bg-emerald-400'
      : liveAccuracy.overallAccuracyPct >= 78
        ? 'bg-cyan-400'
        : 'bg-amber-400';

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
      data-accuracy-pct={String(liveAccuracy.overallAccuracyPct)}
    >
      {/* Hidden file input for room photo upload fallback/desktop scanning */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleSelectPhotoFile}
        data-testid="ar-photo-file-input"
        className="hidden"
      />

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
        <div className="fixed top-28 left-1/2 -translate-x-1/2 z-50 px-3 py-1 rounded-lg bg-black/85 border border-rose-400/60 text-rose-100 text-[11px] font-medium whitespace-nowrap">
          {tapWarning}
        </div>
      )}

      {/* Clean, Minimal Ceiling & Floor Alignment Handles directly over the live camera & 3D pole */}
      {!isSurfaceMode && !isBuildingReplica && (
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
              <div className="absolute left-0 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-md bg-black/75 border border-white/25 text-[10px] font-semibold text-white whitespace-nowrap">
                Ceiling · {measurement.ceilingHeightM.toFixed(2)}m
              </div>
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white bg-black/75" />
            </div>
          </div>

          {/* Slim Floor Alignment Handle */}
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
                <div className="absolute left-0 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-md bg-black/75 border border-cyan-300/40 text-[10px] font-semibold text-cyan-100 whitespace-nowrap">
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

      {/* Top Camera Controls + Live Accuracy Meter */}
      <div className="fixed top-0 left-0 right-0 z-50 px-3 pt-2.5 pb-2 bg-gradient-to-b from-black/75 to-transparent pointer-events-auto">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-2">
          {/* Quick Camera Measurement Tools: 4-Pt Floor + Auto Scan + Room Photo */}
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
              <span>{isScanning ? `Scan ${scanAcc.scanProgress}%` : 'Auto Scan'}</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              data-testid="ar-upload-photo-btn"
              title="Upload a photo of your room to fit pole & generate 3D replica"
              className={`min-h-[34px] px-2 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                uploadedPhotoUrl
                  ? 'border-violet-400/70 bg-violet-500/25 text-violet-100'
                  : 'border-white/25 bg-black/65 text-zinc-200 hover:bg-black/80'
              }`}
            >
              <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">{uploadedPhotoUrl ? 'Photo Loaded' : 'Room Photo'}</span>
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

        {/* Live Floor & Ceiling Detection Accuracy Meter */}
        <div
          className="max-w-3xl mx-auto mt-2 flex items-center justify-between gap-2"
          data-testid="ar-accuracy-meter"
        >
          <div className="px-2.5 py-1.5 rounded-xl bg-black/78 border border-white/15 text-zinc-100 flex items-center gap-2.5 shadow-lg">
            <Gauge className={`w-4 h-4 shrink-0 ${accuracyColorClass}`} aria-hidden="true" />
            <div className="min-w-[148px] sm:min-w-[185px]">
              <div className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="font-semibold text-zinc-200">Plane Accuracy</span>
                <span
                  className={`font-mono font-bold tabular-nums ${accuracyColorClass}`}
                  data-testid="ar-accuracy-value"
                >
                  {liveAccuracy.overallAccuracyPct}%
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-white/15 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-200 ${accuracyBarColor}`}
                  style={{ width: `${liveAccuracy.overallAccuracyPct}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-[10px] font-mono tabular-nums text-zinc-400">
                <span data-testid="ar-floor-accuracy">Floor {liveAccuracy.floorAccuracyPct}%</span>
                <span data-testid="ar-ceiling-accuracy">Ceil {liveAccuracy.ceilingAccuracyPct}%</span>
                <span>±{liveAccuracy.errorMarginCm.toFixed(1)}cm</span>
              </div>
            </div>
          </div>

          {isScanning && (
            <div className="hidden sm:block px-2.5 py-1.5 rounded-xl bg-black/78 border border-cyan-400/35 text-cyan-100 text-[11px] font-medium truncate max-w-[260px]">
              {scanAcc.statusMessage}
            </div>
          )}
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

      {/* Scene Capture & 3D Room Replica Generation Progress Modal */}
      {isBuildingReplica && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 pointer-events-auto"
          data-testid="ar-replica-progress"
        >
          <div className="w-full max-w-sm rounded-2xl border border-cyan-400/35 bg-[#0e111a] p-5 text-zinc-100 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center shrink-0">
                <Loader2 className="w-5 h-5 text-cyan-300 animate-spin" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white">Building 3D Room Replica</h3>
                <p className="text-xs text-cyan-200 mt-0.5">{REPLICA_STAGES[replicaStageIdx]}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-1.5">
              {REPLICA_STAGES.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-1.5 rounded-full transition-colors ${
                    idx <= replicaStageIdx ? 'bg-cyan-400' : 'bg-white/15'
                  }`}
                />
              ))}
            </div>
            <p className="mt-3 text-[11px] text-zinc-400">
              Measuring {displayWidthM.toFixed(1)}×{displayDepthM.toFixed(1)}m ·{' '}
              {measurement.ceilingHeightM.toFixed(2)}m ceiling ({liveAccuracy.overallAccuracyPct}% fit)
            </p>
          </div>
        </div>
      )}

      {/* Honest Scene Scan Error Banner (with Retry, Upload Photo, or Apply Dimensions Only) */}
      {replicaError && !isBuildingReplica && (
        <div
          className="fixed bottom-28 left-3 right-3 z-50 pointer-events-auto"
          data-testid="ar-replica-error"
        >
          <div className="max-w-xl mx-auto rounded-2xl border border-rose-400/50 bg-[#180f14]/95 p-3 text-rose-100 shadow-2xl">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-xs leading-snug">{replicaError}</p>
              </div>
              <button
                type="button"
                onClick={() => setReplicaError(null)}
                aria-label="Dismiss error"
                className="p-0.5 text-rose-300 hover:text-white shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1.5 rounded-lg border border-white/20 bg-white/10 text-white text-[11px] font-semibold inline-flex items-center gap-1"
              >
                <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Upload Room Photo</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleUseThisFitWithReplica();
                }}
                className="px-2.5 py-1.5 rounded-lg border border-cyan-400/50 bg-cyan-500/20 text-cyan-100 text-[11px] font-semibold"
              >
                Retry Scene Scan
              </button>
              <button
                type="button"
                onClick={() => {
                  setReplicaError(null);
                  onAutoSyncRoom(measurement, false);
                  onExit();
                }}
                data-testid="ar-apply-dimensions-only"
                className="px-2.5 py-1.5 rounded-lg bg-zinc-100 text-zinc-950 text-[11px] font-semibold"
              >
                Apply Dimensions Only
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slim Bottom Live AR Camera Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 px-3 pb-3 pt-1 pointer-events-auto">
        <div className="max-w-xl mx-auto rounded-2xl border border-white/15 bg-black/82 text-zinc-100 shadow-2xl overflow-hidden">
          {isSurfaceMode ? (
            <div className="px-3 py-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-emerald-200 truncate" data-testid="ar-surface-status">
                  Tap 4 corners on your physical floor ({floorTaps.length}/4)
                </p>
                <p className="text-[11px] text-zinc-400 truncate">
                  Locks real floor bounds & boosts accuracy to 95%+
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

              {/* Material Finish PFPs + Spin + Use This Fit (3D Room Replica Capture) */}
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
                  disabled={isBuildingReplica}
                  onClick={() => {
                    void handleUseThisFitWithReplica();
                  }}
                  data-testid="ar-done-button"
                  className="min-h-[34px] px-3.5 rounded-xl bg-zinc-100 hover:bg-white disabled:opacity-60 text-zinc-950 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  {isBuildingReplica ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-cyan-700" aria-hidden="true" />
                  )}
                  <span>Use This Fit</span>
                  <Check className="w-3 h-3 hidden sm:inline" aria-hidden="true" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
