import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  Check,
  Compass,
  MoveHorizontal,
  RotateCw,
  ScanLine,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { PoleFinishId } from '../types/pole';
import {
  calculateARMeasurement,
  clampARMarkers,
  scanVideoForRoomBounds,
  type ARMarkerState,
  type ARMeasurementResult,
} from '../utils/arMeasure';
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
  activeFinish: PoleFinishId;
  isSpinning: boolean;
  onChangeFinish: (finish: PoleFinishId) => void;
  onToggleSpin: () => void;
  onApplyRecommendation: (result: ARMeasurementResult) => void;
  onExit: () => void;
}

const FINISH_ORDER: PoleFinishId[] = ['brass', 'stainless', 'powder-black', 'silicone'];

export function ARMeasurementOverlay({
  videoRef,
  arCameraError,
  markers,
  onChangeMarkers,
  activeFinish,
  isSpinning,
  onChangeFinish,
  onToggleSpin,
  onApplyRecommendation,
  onExit,
}: ARMeasurementOverlayProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [draggingHandle, setDraggingHandle] = useState<'ceiling' | 'floor' | 'pole' | null>(null);
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);
  const [gyroActive, setGyroActive] = useState(false);
  const [showCalibPanel, setShowCalibPanel] = useState(false);
  const [appliedFlash, setAppliedFlash] = useState(false);

  const avatars = useMemo(() => getPoleMaterialAvatars(), []);
  const measurement = useMemo(
    () => calculateARMeasurement(markers, activeFinish),
    [markers, activeFinish]
  );

  // Sync aspect ratio & vertical FOV to viewport orientation
  useEffect(() => {
    const syncViewport = () => {
      const w = window.innerWidth || 390;
      const h = window.innerHeight || 844;
      const aspect = w / h;
      const vfovDeg = aspect < 0.85 ? 68 : 48;
      onChangeMarkers(
        clampARMarkers({
          ...markers,
          aspect,
          vfovDeg,
        })
      );
    };
    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
    // Only run on mount and resize
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Optional DeviceOrientation pitch sensor for real smartphone tilt measurement
  useEffect(() => {
    if (!gyroActive || typeof window === 'undefined') return;
    const onOrientation = (e: DeviceOrientationEvent) => {
      if (typeof e.beta !== 'number') return;
      // Portrait upright holding phone vertically: beta ~ 90deg => pitch 0deg
      const pitchDeg = Math.max(-22, Math.min(22, e.beta - 90));
      onChangeMarkers(
        clampARMarkers({
          ...markers,
          cameraPitchDeg: Number(pitchDeg.toFixed(1)),
        })
      );
    };
    window.addEventListener('deviceorientation', onOrientation);
    return () => window.removeEventListener('deviceorientation', onOrientation);
  }, [gyroActive, markers, onChangeMarkers]);

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
          setScanFeedback('Live tilt sensor active');
        } else {
          setScanFeedback('Tilt permission denied — drag markers manually');
        }
      } catch {
        setScanFeedback('Drag floor & ceiling lines to match your room');
      }
    } else if ('DeviceOrientationEvent' in window) {
      setGyroActive(true);
      setScanFeedback('Live tilt sensor active');
    } else {
      setScanFeedback('Drag floor & ceiling lines to match your room');
    }
  };

  const handleAutoScan = useCallback(() => {
    const res = scanVideoForRoomBounds(videoRef.current);
    const next = clampARMarkers({
      ...markers,
      ceilingY: res.ceilingY,
      floorY: res.floorY,
      poleX: 0.5,
    });
    onChangeMarkers(next);
    const calc = calculateARMeasurement(next, activeFinish);
    setScanFeedback(
      res.detected
        ? `Edges locked · ${calc.ceilingHeightM.toFixed(2)}m ceiling (${calc.roomWidthM.toFixed(1)}×${calc.roomDepthM.toFixed(1)}m)`
        : `Calibrated · ${calc.ceilingHeightM.toFixed(2)}m ceiling — drag lines to fine-tune`
    );
  }, [videoRef, markers, onChangeMarkers, activeFinish]);

  const updateMarkerFromPointer = useCallback(
    (clientX: number, clientY: number, handle: 'ceiling' | 'floor' | 'pole') => {
      const rect = overlayRef.current?.getBoundingClientRect();
      if (!rect || rect.height === 0 || rect.width === 0) return;
      const nx = (clientX - rect.left) / rect.width;
      const ny = (clientY - rect.top) / rect.height;

      if (handle === 'ceiling') {
        onChangeMarkers(clampARMarkers({ ...markers, ceilingY: ny }));
      } else if (handle === 'floor') {
        onChangeMarkers(clampARMarkers({ ...markers, floorY: ny }));
      } else if (handle === 'pole') {
        onChangeMarkers(clampARMarkers({ ...markers, poleX: nx }));
      }
    },
    [markers, onChangeMarkers]
  );

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingHandle) return;
    e.preventDefault();
    updateMarkerFromPointer(e.clientX, e.clientY, draggingHandle);
  };

  const onPointerUp = () => {
    setDraggingHandle(null);
  };

  const handleApply = () => {
    onApplyRecommendation(measurement);
    setAppliedFlash(true);
    window.setTimeout(() => setAppliedFlash(false), 1800);
  };

  const ceilPct = `${(markers.ceilingY * 100).toFixed(2)}%`;
  const floorPct = `${(markers.floorY * 100).toFixed(2)}%`;
  const poleXPct = `${(markers.poleX * 100).toFixed(2)}%`;

  return (
    <div
      ref={overlayRef}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="fixed inset-0 z-40 pointer-events-none select-none overflow-hidden"
      data-testid="ar-measurement-overlay"
    >
      {/* Vertical Laser Guide Line connecting Ceiling Anchor to Floor Anchor */}
      <div
        className="absolute top-0 bottom-0 pointer-events-none"
        style={{ left: poleXPct }}
      >
        <div
          className="absolute -translate-x-1/2 w-[1.5px] bg-cyan-400/75"
          style={{
            top: ceilPct,
            bottom: `${((1 - markers.floorY) * 100).toFixed(2)}%`,
          }}
        />
        {/* Midpoint Height Readout Tag */}
        <div
          className="absolute left-3 -translate-y-1/2 px-2 py-0.5 rounded-md bg-[#0b0e17]/88 border border-cyan-400/45 text-cyan-200 font-mono text-[11px] font-semibold tabular-nums whitespace-nowrap"
          style={{
            top: `${(((markers.ceilingY + markers.floorY) / 2) * 100).toFixed(2)}%`,
          }}
          data-testid="ar-live-height-tag"
        >
          {measurement.ceilingHeightM.toFixed(2)}m
        </div>
      </div>

      {/* Draggable CEILING Sightline Bar */}
      <div
        className="absolute left-0 right-0 pointer-events-auto touch-none cursor-ns-resize py-3 -translate-y-1/2"
        style={{ top: ceilPct }}
        onPointerDown={(e) => {
          e.stopPropagation();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setDraggingHandle('ceiling');
        }}
        role="slider"
        aria-label="Ceiling measurement line"
        aria-valuemin={5}
        aria-valuemax={45}
        aria-valuenow={Math.round(markers.ceilingY * 100)}
        tabIndex={0}
        data-testid="ar-ceiling-handle"
      >
        <div className="relative mx-4 sm:mx-16 h-[2px] bg-violet-400/90 shadow-[0_0_8px_rgba(167,139,250,0.65)]">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-md bg-[#121420]/92 border border-violet-400/60 text-[10px] font-semibold text-violet-200 whitespace-nowrap">
            Ceiling · Drag
          </div>
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full border-2 border-violet-300 bg-[#121420]/90 flex items-center justify-center"
            style={{ left: poleXPct }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-violet-300" />
          </div>
        </div>
      </div>

      {/* Draggable FLOOR Sightline Bar */}
      <div
        className="absolute left-0 right-0 pointer-events-auto touch-none cursor-ns-resize py-3 -translate-y-1/2"
        style={{ top: floorPct }}
        onPointerDown={(e) => {
          e.stopPropagation();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setDraggingHandle('floor');
        }}
        role="slider"
        aria-label="Floor base measurement line"
        aria-valuemin={55}
        aria-valuemax={95}
        aria-valuenow={Math.round(markers.floorY * 100)}
        tabIndex={0}
        data-testid="ar-floor-handle"
      >
        <div className="relative mx-4 sm:mx-16 h-[2px] bg-cyan-400/90 shadow-[0_0_8px_rgba(34,211,238,0.65)]">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-md bg-[#0e131d]/92 border border-cyan-400/60 text-[10px] font-semibold text-cyan-200 whitespace-nowrap">
            Floor Base · {measurement.distanceM.toFixed(1)}m away
          </div>
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full border-2 border-cyan-300 bg-[#0e131d]/90 flex items-center justify-center"
            style={{ left: poleXPct }}
          >
            <div className="w-2 h-2 rounded-full bg-cyan-300" />
          </div>
        </div>
      </div>

      {/* Horizontal Pole Position Handle (Slide Pole Left / Right inside Real Room) */}
      <button
        type="button"
        onPointerDown={(e) => {
          e.stopPropagation();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setDraggingHandle('pole');
        }}
        style={{
          left: poleXPct,
          top: `${Math.min(72, Math.max(30, ((markers.ceilingY + markers.floorY) / 2) * 100 + 8))}%`,
        }}
        aria-label="Slide pole left or right in room"
        title="Drag left/right to place pole in room"
        className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto touch-none w-9 h-9 rounded-full bg-[#0d1018]/85 border border-white/30 text-white flex items-center justify-center shadow-lg active:scale-95"
      >
        <MoveHorizontal className="w-4 h-4" aria-hidden="true" />
      </button>

      {/* Top AR Header Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 px-3 sm:px-5 pt-2.5 pb-2 bg-gradient-to-b from-black/80 via-black/45 to-transparent pointer-events-auto">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display text-sm font-bold text-white whitespace-nowrap">
                <span className="sm:hidden">AR Measure</span>
                <span className="hidden sm:inline">AR Room Measure</span>
              </span>
              <span className="text-[11px] text-cyan-300 font-mono tabular-nums whitespace-nowrap">
                <span className="sm:hidden">{measurement.ceilingHeightM.toFixed(2)}m</span>
                <span className="hidden sm:inline">
                  {formatHeightMetricAndImperial(measurement.ceilingHeightCm)}
                </span>
              </span>
            </div>
            <p className="text-[11px] text-zinc-300 truncate">
              {scanFeedback ||
                (arCameraError
                  ? 'Drag Ceiling & Floor lines to measure'
                  : 'Align Ceiling & Floor lines to fit pole')}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleToggleGyro}
              aria-pressed={gyroActive}
              aria-label="Toggle live tilt sensor"
              className={`min-h-[36px] px-2.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                gyroActive
                  ? 'border-cyan-400/75 bg-cyan-500/20 text-cyan-200'
                  : 'border-white/20 bg-[#0f121b]/90 text-zinc-200 hover:bg-white/10'
              }`}
            >
              <Compass className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Tilt</span>
            </button>

            <button
              type="button"
              onClick={() => setShowCalibPanel((v) => !v)}
              aria-pressed={showCalibPanel}
              aria-label="Camera height calibration"
              className={`min-h-[36px] px-2.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                showCalibPanel
                  ? 'border-violet-400/75 bg-violet-500/25 text-violet-100'
                  : 'border-white/20 bg-[#0f121b]/90 text-zinc-200 hover:bg-white/10'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="font-mono tabular-nums">{markers.cameraHeightM.toFixed(2)}m</span>
            </button>

            <button
              type="button"
              onClick={onExit}
              aria-label="Exit AR Mode"
              data-testid="exit-ar-button"
              className="min-h-[36px] min-w-[36px] px-2.5 rounded-lg border border-white/20 bg-[#0f121b]/92 text-white hover:bg-white/15 inline-flex items-center justify-center gap-1 text-xs font-semibold"
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
                Phone Height
              </label>
              <input
                id="ar-cam-height"
                type="range"
                min={95}
                max={185}
                step={1}
                value={Math.round(markers.cameraHeightM * 100)}
                onChange={(e) =>
                  onChangeMarkers(
                    clampARMarkers({ ...markers, cameraHeightM: Number(e.target.value) / 100 })
                  )
                }
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
                  onClick={() =>
                    onChangeMarkers(clampARMarkers({ ...markers, cameraHeightM: preset.m }))
                  }
                  className="px-2 py-1 rounded-md border border-white/15 bg-white/5 hover:bg-white/15 text-zinc-200 whitespace-nowrap"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom AR Action & Room Recommendation Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 px-3 pb-3 pt-2 pointer-events-auto">
        <div className="max-w-2xl mx-auto rounded-2xl border border-white/15 bg-[#0e1018]/93 text-zinc-100 shadow-2xl overflow-hidden">
          {/* Predicted Room Dimensions & Auto-Recommendation Strip */}
          <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="shrink-0">
                <span className="block text-[10px] text-zinc-400 leading-none">Ceiling</span>
                <span
                  className="font-mono font-bold text-cyan-300 tabular-nums"
                  data-testid="ar-predicted-ceiling"
                >
                  {measurement.ceilingHeightM.toFixed(2)}m
                </span>
              </div>
              <span className="h-5 w-px bg-white/12 shrink-0" aria-hidden="true" />
              <div className="shrink-0">
                <span className="block text-[10px] text-zinc-400 leading-none">Room</span>
                <span
                  className="font-mono font-semibold text-zinc-100 tabular-nums"
                  data-testid="ar-predicted-room"
                >
                  {measurement.roomWidthM.toFixed(1)}×{measurement.roomDepthM.toFixed(1)}m
                </span>
              </div>
              <span className="h-5 w-px bg-white/12 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <span className="block text-[10px] text-zinc-400 leading-none">Recommended</span>
                <span className="font-semibold text-violet-200 truncate block text-[11px]">
                  {BASE_MOUNTS[measurement.recommendedMount].shortName} ·{' '}
                  {measurement.recommendedDiameterMm}mm · {measurement.extensionsLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Interactive Finish Switcher + Actions Row */}
          <div className="px-2.5 py-1.5 flex items-center justify-between gap-1.5">
            {/* Rounded Material PFPs to preview finishes directly in the user's real room */}
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
                      selected ? 'border-cyan-400 scale-105' : 'border-transparent opacity-75 hover:opacity-100'
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

            {/* Primary AR Actions: Auto-Scan + Apply to Pole Setup */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleAutoScan}
                data-testid="ar-auto-scan-button"
                className="min-h-[34px] px-2.5 rounded-xl border border-violet-400/50 bg-violet-500/20 hover:bg-violet-500/30 text-violet-100 text-[11px] font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap"
              >
                <ScanLine className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Scan</span>
              </button>

              <button
                type="button"
                onClick={handleApply}
                data-testid="ar-apply-button"
                className="min-h-[34px] px-3 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 text-[11px] font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap"
              >
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{appliedFlash ? 'Applied!' : 'Fit Pole'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
