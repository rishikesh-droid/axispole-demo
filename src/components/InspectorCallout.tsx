import { AlertTriangle, CheckCircle2, Move, Sparkles, Wrench, X } from 'lucide-react';
import type {
  BOMSummary,
  ClearanceAnalysis,
  DockTabId,
  HardwarePartId,
  PoleClampResult,
  PoleFinishId,
  PoleInstance,
  PoleRigConfig,
} from '../types/pole';
import {
  ASSEMBLY_STEPS,
  BASE_MOUNTS,
  getWallClearanceMarginM,
  HARDWARE_PARTS,
  isDarkLighting,
  PERFORMANCE_DURATION_SEC,
  POLE_FINISHES,
} from '../utils/poleConfig';

interface InspectorCalloutProps {
  config: PoleRigConfig;
  poles: PoleInstance[];
  activePole: PoleInstance;
  bom: BOMSummary;
  clearance: ClearanceAnalysis;
  compareMode: boolean;
  compareFinish: PoleFinishId;
  moveMode: boolean;
  lastClamp: PoleClampResult | null;
  performanceStatus: 'idle' | 'playing' | 'finished';
  performanceTimeSec: number;
  performancePhaseLabel: string;
  activeTab: DockTabId;
  activeStepIndex: number;
  selectedPart: HardwarePartId | null;
  onClearSelectedPart: () => void;
  arCameraActive: boolean;
  onExitArCamera: () => void;
}

export function InspectorCallout({
  config,
  poles,
  activePole,
  bom,
  clearance,
  compareMode,
  compareFinish,
  moveMode,
  lastClamp,
  performanceStatus,
  performanceTimeSec,
  performancePhaseLabel,
  activeTab,
  activeStepIndex,
  selectedPart,
  onClearSelectedPart,
  arCameraActive,
  onExitArCamera,
}: InspectorCalloutProps) {
  const isDark = isDarkLighting(config.lighting);
  const isNeon = config.lighting === 'mood-neon';
  const finish = POLE_FINISHES[activePole.finish];
  const compareSpec = POLE_FINISHES[compareFinish];
  const mount = BASE_MOUNTS[activePole.mount];
  const stepSpec = ASSEMBLY_STEPS[activeStepIndex] ?? ASSEMBLY_STEPS[0];
  const partSpec = selectedPart ? HARDWARE_PARTS[selectedPart] : null;

  const surfaceClass = isNeon
    ? 'bg-[#11131d]/90 border-violet-400/25 text-zinc-100 shadow-[0_8px_24px_rgba(0,0,0,0.45)]'
    : isDark
      ? 'bg-[#151412]/90 border-amber-500/25 text-stone-100 shadow-[0_8px_24px_rgba(0,0,0,0.45)]'
      : 'bg-[#faf9f6]/92 border-stone-300/90 text-stone-900 shadow-xs';

  const mutedClass = isDark ? 'text-zinc-400' : 'text-stone-500';
  const accentTextClass = isNeon
    ? 'text-cyan-300'
    : isDark
      ? 'text-amber-400'
      : 'text-amber-700';

  const clearanceShort =
    clearance.status === 'optimal'
      ? 'Optimal'
      : clearance.status === 'caution'
        ? 'Tight'
        : 'Restricted';

  const priceDelta = compareSpec.basePriceUsd - finish.basePriceUsd;

  return (
    <div className="fixed top-15 left-3.5 sm:left-5 z-20 flex flex-col gap-2 w-[238px] sm:w-[258px] pointer-events-none">
      {/* Minimal Rig Spec Card (Adapts cleanly to Compare Mode & Multi-Pole) */}
      <div
        className={`pointer-events-auto rounded-lg border px-3 py-2 ${surfaceClass}`}
        data-testid="rig-summary-hud"
      >
        {compareMode ? (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <h1 className="text-xs font-semibold tracking-tight truncate">
                {finish.shortName} vs {compareSpec.shortName}
              </h1>
              <span className={`font-mono text-[11px] font-semibold tabular-nums shrink-0 ${accentTextClass}`}>
                {priceDelta === 0 ? 'Same' : priceDelta > 0 ? `+$${priceDelta}` : `-$${Math.abs(priceDelta)}`}
              </span>
            </div>
            <div className={`mt-0.5 flex items-center justify-between gap-2 text-[11px] ${mutedClass}`}>
              <span className="truncate">
                {activePole.diameterMm}mm · {(config.ceilingHeightCm / 100).toFixed(2)}m
              </span>
              <span className="shrink-0">Side-by-Side</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <h1 className="text-xs font-semibold tracking-tight truncate">
                {poles.length > 1 ? `${activePole.label} · ` : ''}
                {finish.shortName} · {activePole.diameterMm}mm
              </h1>
              <span className="font-mono text-xs font-semibold tabular-nums shrink-0">
                ${bom.totalPriceUsd}
              </span>
            </div>

            <div className={`mt-0.5 flex items-center justify-between gap-2 text-[11px] ${mutedClass}`}>
              <span className="truncate">
                {mount.shortName} · {(config.ceilingHeightCm / 100).toFixed(2)}m ·{' '}
                {activePole.isSpinning ? 'Spin' : 'Static'}
              </span>
              <span className="inline-flex items-center gap-1 shrink-0 font-medium">
                {clearance.status === 'optimal' ? (
                  <CheckCircle2
                    className={`w-3 h-3 shrink-0 ${isNeon ? 'text-cyan-400' : 'text-teal-500'}`}
                    aria-hidden="true"
                  />
                ) : (
                  <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" aria-hidden="true" />
                )}
                <span className={isDark ? 'text-zinc-300' : 'text-stone-700'}>
                  {poles.length > 1 ? `${poles.length} Poles` : clearanceShort}
                </span>
              </span>
            </div>
          </>
        )}

        {!bom.heightSolution.isValid && bom.heightSolution.warning && (
          <p className="mt-1 text-[11px] text-rose-400 leading-tight">
            {bom.heightSolution.warning}
          </p>
        )}
      </div>

      {/* Live Performance Status Readout */}
      {performanceStatus !== 'idle' && (
        <div
          className={`pointer-events-auto rounded-lg border px-3 py-2 ${surfaceClass}`}
          data-testid="performance-hud"
        >
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className={`inline-flex items-center gap-1 font-semibold ${accentTextClass}`}>
              <Sparkles className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span>{performancePhaseLabel}</span>
            </span>
            <span className="font-mono tabular-nums font-medium">
              {Math.min(PERFORMANCE_DURATION_SEC, performanceTimeSec).toFixed(1)}s / {PERFORMANCE_DURATION_SEC.toFixed(1)}s
            </span>
          </div>
          <div className={`mt-1.5 h-1 w-full rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-stone-200'}`}>
            <div
              className={`h-full transition-all duration-100 ${
                isNeon ? 'bg-cyan-400' : 'bg-amber-500'
              }`}
              style={{
                width: `${Math.min(100, (performanceTimeSec / PERFORMANCE_DURATION_SEC) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Move / Placement Clearance Readout */}
      {moveMode && !compareMode && (
        <div
          className={`pointer-events-auto rounded-lg border px-3 py-1.5 ${surfaceClass}`}
          data-testid="move-mode-hud"
        >
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className={`inline-flex items-center gap-1 font-medium ${accentTextClass}`}>
              <Move className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span>Drag pole on floor</span>
            </span>
            <span className="font-mono tabular-nums">
              {activePole.x.toFixed(1)}m, {activePole.z.toFixed(1)}m
            </span>
          </div>
          <p
            className={`mt-0.5 text-[10px] ${
              lastClamp?.hitWallBoundary || lastClamp?.hitPoleBoundary
                ? 'text-amber-400 font-medium'
                : mutedClass
            }`}
          >
            {lastClamp?.hitPoleBoundary
              ? 'Minimum inter-pole spacing limit'
              : lastClamp?.hitWallBoundary
                ? `Min ${getWallClearanceMarginM(activePole.mount).toFixed(1)}m wall clearance limit`
                : `Min ${getWallClearanceMarginM(activePole.mount).toFixed(1)}m wall clearance enforced`}
          </p>
        </div>
      )}

      {/* Whisper-Compact Selected Hardware OR Assembly Step Card */}
      {partSpec ? (
        <div
          className={`pointer-events-auto rounded-lg border px-3 py-2 ${surfaceClass}`}
          data-testid="hardware-inspector-card"
        >
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-xs font-semibold leading-tight truncate">{partSpec.name}</h2>
            <button
              type="button"
              onClick={onClearSelectedPart}
              aria-label="Close component inspector"
              className={`p-0.5 rounded-xs transition-colors shrink-0 ${
                isDark ? 'hover:bg-white/10 text-zinc-400' : 'hover:bg-stone-200 text-stone-500'
              }`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className={`mt-1 font-mono text-[11px] tabular-nums font-medium ${accentTextClass}`}>
            {partSpec.torqueSpec}
          </p>
          <p className={`mt-0.5 text-[11px] truncate ${mutedClass}`}>{partSpec.material}</p>
        </div>
      ) : activeTab === 'assembly' ? (
        <div
          className={`pointer-events-auto rounded-lg border px-3 py-2 ${surfaceClass}`}
          data-testid="assembly-step-card"
        >
          <div className="flex items-center justify-between gap-2">
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${accentTextClass}`}>
              <Wrench className="w-3 h-3" aria-hidden="true" />
              <span>
                Step {stepSpec.step}/{ASSEMBLY_STEPS.length}
              </span>
            </span>
            <span className="font-mono text-[11px] font-semibold tabular-nums">
              {stepSpec.torqueNm > 0 ? `${stepSpec.torqueNm.toFixed(1)} N·m` : 'Seat'}
            </span>
          </div>
          <h2 className="text-xs font-semibold mt-0.5 leading-tight truncate">
            {stepSpec.shortTitle} · <span className={`font-normal ${mutedClass}`}>{stepSpec.toolRequired}</span>
          </h2>
          <p className={`mt-0.5 text-[11px] truncate ${mutedClass}`}>{stepSpec.fastener}</p>
        </div>
      ) : null}

      {/* Live AR Pass-Through Exit Banner */}
      {arCameraActive && (
        <div className="pointer-events-auto rounded-lg border border-violet-400/50 bg-[#0e1018]/92 text-zinc-100 px-3 py-2 flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium">AR Overlay</span>
          <button
            type="button"
            onClick={onExitArCamera}
            className="px-2 py-0.5 text-[11px] font-semibold bg-violet-500 text-white rounded-xs hover:bg-violet-400 whitespace-nowrap shrink-0"
          >
            Exit AR
          </button>
        </div>
      )}
    </div>
  );
}
