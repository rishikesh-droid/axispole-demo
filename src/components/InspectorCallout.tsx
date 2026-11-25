import { AlertTriangle, Box, Camera, CheckCircle2, Eye, EyeOff, Move, Ruler, ShieldCheck, ShieldOff, Sparkles, Wrench, X } from 'lucide-react';
import type {
  BOMSummary,
  ClearanceAnalysis,
  DockTabId,
  HardwarePartId,
  PoleClampResult,
  PoleFinishId,
  PoleInstance,
  PoleRigConfig,
  ReplicaRenderMode,
  RoomReplicaScene,
  ViewportMode,
} from '../types/pole';
import {
  ASSEMBLY_STEPS,
  BASE_MOUNTS,
  getCushionHeightCm,
  getWallClearanceMarginM,
  HARDWARE_PARTS,
  isDarkLighting,
  MAX_POLE_HEIGHT_CM,
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
  activeTab: DockTabId;
  activeStepIndex: number;
  assemblyProgress: number;
  playbackMode: 'idle' | 'assemble' | 'dismantle';
  selectedPart: HardwarePartId | null;
  onClearSelectedPart: () => void;
  onToggleMinClearance: () => void;
  arCameraActive: boolean;
  roomReplica: RoomReplicaScene | null;
  showInferredObjects: boolean;
  onToggleInferredObjects: () => void;
  replicaRenderMode: ReplicaRenderMode;
  onChangeReplicaRenderMode: (mode: ReplicaRenderMode) => void;
  showReplicaDimensions: boolean;
  onToggleReplicaDimensions: () => void;
  onMatchReplicaCamera: () => void;
  viewportMode: ViewportMode;
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
  activeTab,
  activeStepIndex,
  assemblyProgress,
  playbackMode,
  selectedPart,
  onClearSelectedPart,
  onToggleMinClearance,
  arCameraActive,
  roomReplica,
  showInferredObjects,
  onToggleInferredObjects,
  replicaRenderMode,
  onChangeReplicaRenderMode,
  showReplicaDimensions,
  onToggleReplicaDimensions,
  onMatchReplicaCamera,
  viewportMode,
}: InspectorCalloutProps) {
  // Hide studio callout during Live AR Room Measurement or 2D Floor Plan so the floor plan stays unobstructed
  if (arCameraActive || viewportMode === 'floor-plan') return null;

  const isDark = isDarkLighting(config.lighting);
  const isNeon = config.lighting === 'mood-neon';
  const isSunset = config.lighting === 'sunset-flow';
  const isPulse = config.lighting === 'cyber-pulse';
  const finish = POLE_FINISHES[activePole.finish];
  const compareSpec = POLE_FINISHES[compareFinish];
  const mount = BASE_MOUNTS[config.mount];
  const stepSpec = ASSEMBLY_STEPS[activeStepIndex] ?? ASSEMBLY_STEPS[0];
  const partSpec = selectedPart ? HARDWARE_PARTS[selectedPart] : null;
  const isDismantling = playbackMode === 'dismantle';

  const surfaceClass = isNeon
    ? 'bg-[#11131d]/93 border-violet-400/25 text-zinc-100 shadow-[0_8px_24px_rgba(0,0,0,0.45)]'
    : isSunset
      ? 'bg-[#1c1317]/93 border-rose-400/28 text-rose-50 shadow-[0_8px_24px_rgba(0,0,0,0.45)]'
      : isPulse
        ? 'bg-[#0e161b]/93 border-emerald-400/28 text-emerald-50 shadow-[0_8px_24px_rgba(0,0,0,0.45)]'
        : isDark
          ? 'bg-[#151412]/93 border-amber-500/25 text-stone-100 shadow-[0_8px_24px_rgba(0,0,0,0.45)]'
          : 'bg-[#faf9f6]/94 border-stone-300/90 text-stone-900 shadow-xs';

  const mutedClass = isDark ? 'text-zinc-400' : 'text-stone-500';
  const accentTextClass = isNeon
    ? 'text-cyan-300'
    : isSunset
      ? 'text-orange-300'
      : isPulse
        ? 'text-emerald-300'
        : isDark
          ? 'text-amber-400'
          : 'text-amber-700';

  const clearanceShort = !config.enforceMinClearance
    ? '1.25m Off'
    : clearance.status === 'optimal'
      ? 'Optimal'
      : clearance.status === 'caution'
        ? 'Tight'
        : 'Restricted';

  const priceDelta = compareSpec.basePriceUsd - finish.basePriceUsd;
  const activeCushionCm = getCushionHeightCm(
    config.ceilingHeightCm,
    activePole.heightCm,
    activePole.cushionPlacement
  );
  const cappedAtMax = config.ceilingHeightCm > MAX_POLE_HEIGHT_CM;

  const isAssemblyMode = activeTab === 'assembly' && viewportMode === '3d';
  const isMoveModeBar = moveMode && !compareMode && viewportMode === '3d' && !partSpec && !isAssemblyMode;
  const showRigSummary = !partSpec && !isAssemblyMode && !isMoveModeBar;

  return (
    <div
      className="absolute bottom-2.5 left-3 right-[122px] md:left-1/2 md:right-auto md:-translate-x-1/2 z-20 flex flex-col items-stretch md:items-center gap-1.5 pointer-events-none max-w-[calc(100%-24px)]"
    >
      {/* Active 3D Room Replica Ultra-Flat Strip (only shown when viewing scanned My Room environment) */}
      {config.environment === 'replica' && roomReplica && !isAssemblyMode && !partSpec && (
        <div
          className={`pointer-events-auto rounded-lg border px-2.5 py-1 backdrop-blur-md ${surfaceClass}`}
          data-testid="room-replica-hud"
        >
          <div className="flex items-center gap-2 text-[11px] whitespace-nowrap">
            <span className={`inline-flex items-center gap-1 font-semibold ${accentTextClass}`}>
              {roomReplica.depthMesh ? (
                <Box className="w-3 h-3 shrink-0" aria-hidden="true" />
              ) : (
                <Sparkles className="w-3 h-3 shrink-0" aria-hidden="true" />
              )}
              <span>My Room · {roomReplica.roomType}</span>
            </span>

            <span className={`hidden sm:inline font-mono text-[10px] font-semibold tabular-nums ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
              {roomReplica.roomWidthM.toFixed(1)}×{roomReplica.roomDepthM.toFixed(1)}m
            </span>

            {roomReplica.depthMesh ? (
              <>
                <span className={`h-3 w-px shrink-0 ${isDark ? 'bg-white/15' : 'bg-stone-300'}`} aria-hidden="true" />
                <div className="inline-flex items-center gap-0.5 rounded-md border border-stone-400/25 p-0.5">
                  {(
                    [
                      ['wireframe', 'Wireframe'],
                      ['blueprint', 'Blueprint'],
                      ['textured', 'Photo 3D'],
                    ] as [ReplicaRenderMode, string][]
                  ).map(([modeId, label]) => (
                    <button
                      key={modeId}
                      type="button"
                      data-testid={`replica-mode-${modeId}`}
                      onClick={() => onChangeReplicaRenderMode(modeId)}
                      aria-pressed={replicaRenderMode === modeId}
                      className={`px-1.5 py-0.5 rounded-xs text-[10px] font-semibold transition-colors ${
                        replicaRenderMode === modeId
                          ? isDark
                            ? 'bg-cyan-500/25 text-cyan-200'
                            : 'bg-stone-900 text-white'
                          : isDark
                            ? 'text-zinc-400 hover:text-zinc-200'
                            : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={onToggleReplicaDimensions}
                  data-testid="hud-toggle-dimensions"
                  aria-pressed={showReplicaDimensions}
                  title="Show measured 3D object W×D×H dimensions"
                  className={`px-1.5 py-0.5 rounded-xs border text-[10px] font-semibold inline-flex items-center gap-1 shrink-0 transition-colors ${
                    showReplicaDimensions
                      ? isDark
                        ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-200'
                        : 'border-sky-600/50 bg-sky-50 text-sky-900'
                      : isDark
                        ? 'border-white/15 bg-white/8 text-zinc-300 hover:text-white'
                        : 'border-stone-300 bg-white text-stone-700 hover:text-stone-950'
                  }`}
                >
                  <Ruler className="w-2.5 h-2.5" aria-hidden="true" />
                  <span>Dims ({roomReplica.depthMesh.measuredObjects.length})</span>
                </button>

                <button
                  type="button"
                  onClick={onMatchReplicaCamera}
                  data-testid="hud-match-camera"
                  title="Snap 3D view to match the captured room photo angle"
                  className={`px-1.5 py-0.5 rounded-xs border text-[10px] font-semibold inline-flex items-center gap-1 shrink-0 transition-colors ${
                    isDark
                      ? 'border-white/15 bg-white/8 text-zinc-200 hover:bg-white/15'
                      : 'border-stone-300 bg-white text-stone-800 hover:bg-stone-100'
                  }`}
                >
                  <Camera className="w-2.5 h-2.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Match Cam</span>
                </button>
              </>
            ) : (
              <>
                <span className={`hidden sm:inline text-[10px] ${mutedClass}`}>
                  {roomReplica.visibleObjectCount} detected · {roomReplica.inferredObjectCount} inferred
                </span>
                <button
                  type="button"
                  onClick={onToggleInferredObjects}
                  data-testid="hud-toggle-inferred"
                  className={`px-1.5 py-0.5 rounded-xs border text-[10px] font-semibold inline-flex items-center gap-1 shrink-0 transition-colors ${
                    showInferredObjects
                      ? isDark
                        ? 'border-white/15 bg-white/8 text-zinc-200'
                        : 'border-stone-300 bg-white text-stone-800'
                      : 'border-amber-400/60 bg-amber-500/15 text-amber-300'
                  }`}
                >
                  {showInferredObjects ? (
                    <Eye className="w-2.5 h-2.5" aria-hidden="true" />
                  ) : (
                    <EyeOff className="w-2.5 h-2.5" aria-hidden="true" />
                  )}
                  <span>Unseen {showInferredObjects ? 'On' : 'Off'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Priority 1: Selected Hardware Inspector — Single Flat Horizontal Strip */}
      {partSpec ? (
        <div
          className={`pointer-events-auto rounded-xl border px-3.5 py-2 backdrop-blur-md max-w-[min(760px,100%)] ${surfaceClass}`}
          data-testid="hardware-inspector-card"
        >
          <div className="flex items-center gap-3 text-xs whitespace-nowrap">
            <h2 className="font-semibold tracking-tight truncate">{partSpec.name}</h2>
            <span className={`h-3.5 w-px shrink-0 ${isDark ? 'bg-white/12' : 'bg-stone-300'}`} aria-hidden="true" />
            <span className={`font-mono text-[11px] tabular-nums font-semibold shrink-0 ${accentTextClass}`}>
              {partSpec.torqueSpec}
            </span>
            <span className={`hidden sm:inline h-3.5 w-px shrink-0 ${isDark ? 'bg-white/12' : 'bg-stone-300'}`} aria-hidden="true" />
            <span className={`hidden sm:inline text-[11px] truncate max-w-[260px] ${mutedClass}`}>
              {partSpec.material}
            </span>
            <button
              type="button"
              onClick={onClearSelectedPart}
              aria-label="Close component inspector"
              className={`ml-auto p-0.5 rounded-xs transition-colors shrink-0 ${
                isDark ? 'hover:bg-white/10 text-zinc-400' : 'hover:bg-stone-200 text-stone-500'
              }`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : isAssemblyMode ? (
        /* Priority 2: Installation / Dismantle Blueprint — Razor-Flat Wide Bottom Strip (never blocks 3D model) */
        <div
          className={`pointer-events-auto w-full md:w-auto md:min-w-[540px] max-w-[min(860px,100%)] rounded-xl border overflow-hidden backdrop-blur-md ${surfaceClass}`}
          data-testid="assembly-step-card"
        >
          {/* Flush 7-Segment Micro Progress Track along top border */}
          <div className="grid grid-cols-7 gap-0.5 px-2.5 pt-1.5" aria-hidden="true">
            {ASSEMBLY_STEPS.map((st, idx) => {
              const isCurrent = idx === activeStepIndex;
              const isDone = assemblyProgress >= (idx + 1) / ASSEMBLY_STEPS.length;
              return (
                <div
                  key={st.id}
                  className={`h-1 rounded-full transition-colors ${
                    isCurrent
                      ? isDismantling
                        ? 'bg-amber-400'
                        : isNeon
                          ? 'bg-cyan-400'
                          : 'bg-amber-500'
                      : isDone
                        ? isDark
                          ? 'bg-white/45'
                          : 'bg-stone-700'
                        : isDark
                          ? 'bg-white/12'
                          : 'bg-stone-300'
                  }`}
                />
              );
            })}
          </div>

          <div className="px-3 py-1.5 sm:px-3.5 sm:py-2 space-y-0.5">
            {/* Row 1: Step counter · Title · Torque · Fastener · Tool — single horizontal line */}
            <div className="flex items-center gap-2 sm:gap-2.5 text-xs whitespace-nowrap">
              <span
                className={`inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                  isDismantling
                    ? 'text-amber-300'
                    : playbackMode === 'assemble'
                      ? 'text-cyan-300'
                      : accentTextClass
                }`}
              >
                <Wrench className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>
                  {isDismantling
                    ? 'Dismantle'
                    : playbackMode === 'assemble'
                      ? 'Install'
                      : 'Step'}{' '}
                  0{stepSpec.step}/0{ASSEMBLY_STEPS.length}
                </span>
              </span>

              <span className={`h-3 w-px shrink-0 ${isDark ? 'bg-white/15' : 'bg-stone-300'}`} aria-hidden="true" />

              <h2 className="text-xs font-semibold tracking-tight truncate">
                {stepSpec.title}
              </h2>

              <span
                className={`font-mono text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-sm border shrink-0 ${
                  stepSpec.torqueNm > 0
                    ? isNeon
                      ? 'border-cyan-400/45 bg-cyan-500/15 text-cyan-200'
                      : isDark
                        ? 'border-amber-400/45 bg-amber-500/15 text-amber-300'
                        : 'border-amber-600/35 bg-amber-100 text-amber-900'
                    : isDark
                      ? 'border-white/15 bg-white/8 text-zinc-200'
                      : 'border-stone-300 bg-stone-200/70 text-stone-800'
                }`}
                data-testid="assembly-torque-badge"
              >
                {stepSpec.torqueNm > 0
                  ? `${stepSpec.torqueNm.toFixed(1)} N·m`
                  : 'Level & Seat'}
              </span>

              <span className={`hidden lg:inline h-3 w-px shrink-0 ${isDark ? 'bg-white/15' : 'bg-stone-300'}`} aria-hidden="true" />

              <span className={`hidden lg:inline text-[11px] truncate max-w-[175px] ${mutedClass}`} title={stepSpec.fastener}>
                {stepSpec.fastener}
              </span>

              <span className={`hidden xl:inline h-3 w-px shrink-0 ${isDark ? 'bg-white/15' : 'bg-stone-300'}`} aria-hidden="true" />

              <span className={`hidden xl:inline font-mono text-[10px] tabular-nums shrink-0 ${mutedClass}`} title={stepSpec.toolRequired}>
                {stepSpec.toolRequired}
              </span>
            </div>

            {/* Row 2: Compact single-line action instruction + subtle inline safety check */}
            <div className="flex items-center justify-between gap-3 text-[11px]">
              <p
                className={`truncate ${isDark ? 'text-zinc-300' : 'text-stone-700'}`}
                title={isDismantling ? stepSpec.dismantleInstruction : stepSpec.installInstruction}
              >
                {isDismantling ? stepSpec.dismantleInstruction : stepSpec.installInstruction}
              </p>
              <span
                className={`hidden md:inline-flex items-center gap-1 text-[10px] shrink-0 ${
                  isDark ? 'text-emerald-300/90' : 'text-teal-700'
                }`}
                title={stepSpec.safetyNote}
              >
                <ShieldCheck className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span className="truncate max-w-[230px]">{stepSpec.safetyNote}</span>
              </span>
            </div>
          </div>
        </div>
      ) : isMoveModeBar ? (
        /* Priority 3: Move Pole Clearance Readout — Single Flat Horizontal Strip */
        <div
          className={`pointer-events-auto rounded-xl border px-3.5 py-1.5 backdrop-blur-md ${surfaceClass}`}
          data-testid="move-mode-hud"
        >
          <div className="flex items-center gap-3 text-xs whitespace-nowrap">
            <span className={`inline-flex items-center gap-1.5 font-semibold ${accentTextClass}`}>
              <Move className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Drag {poles.length > 1 ? activePole.label : 'Pole'}</span>
            </span>
            <span className={`h-3.5 w-px ${isDark ? 'bg-white/12' : 'bg-stone-300'}`} aria-hidden="true" />
            <span className="font-mono text-[11px] tabular-nums">
              {activePole.x.toFixed(1)}m, {activePole.z.toFixed(1)}m
            </span>
            <span className={`hidden sm:inline h-3.5 w-px ${isDark ? 'bg-white/12' : 'bg-stone-300'}`} aria-hidden="true" />
            <span
              className={`hidden sm:inline text-[11px] ${
                lastClamp?.hitWallBoundary || lastClamp?.hitPoleBoundary
                  ? 'text-amber-400 font-medium'
                  : mutedClass
              }`}
            >
              {lastClamp?.hitPoleBoundary
                ? 'Min pole spacing limit'
                : lastClamp?.hitWallBoundary
                  ? `Min ${getWallClearanceMarginM(config.mount, config.enforceMinClearance).toFixed(2)}m wall limit`
                  : config.enforceMinClearance
                    ? '1.25m min wall clearance'
                    : '0.35m compact limit'}
            </span>
            <button
              type="button"
              onClick={onToggleMinClearance}
              className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold inline-flex items-center gap-1 shrink-0 transition-colors ${
                config.enforceMinClearance
                  ? isDark
                    ? 'border-white/15 bg-white/8 text-zinc-200 hover:bg-white/15'
                    : 'border-stone-300 bg-white text-stone-800 hover:bg-stone-100'
                  : 'border-amber-400/70 bg-amber-500/20 text-amber-300'
              }`}
            >
              {config.enforceMinClearance ? (
                <ShieldCheck className="w-3 h-3" aria-hidden="true" />
              ) : (
                <ShieldOff className="w-3 h-3" aria-hidden="true" />
              )}
              <span>1.25m {config.enforceMinClearance ? 'On' : 'Off'}</span>
            </button>
          </div>
        </div>
      ) : showRigSummary ? (
        /* Default: Bottom-Center Architectural Rig Spec Bar (leaves entire 3D studio completely open) */
        <div
          className={`pointer-events-auto rounded-xl border px-3 py-1.5 sm:px-3.5 sm:py-2 backdrop-blur-md ${surfaceClass}`}
          data-testid="rig-summary-hud"
        >
          {compareMode ? (
            <div className="flex items-center justify-between md:justify-center gap-3 text-xs whitespace-nowrap">
              <h1 className="font-semibold tracking-tight truncate">
                {finish.shortName} vs {compareSpec.shortName}
              </h1>
              <span className={`hidden sm:inline text-[11px] ${mutedClass}`}>
                {activePole.diameterMm}mm · {(activePole.heightCm / 100).toFixed(2)}m · Side-by-Side
              </span>
              <span className={`font-mono text-xs font-semibold tabular-nums shrink-0 ${accentTextClass}`}>
                {priceDelta === 0 ? 'Same' : priceDelta > 0 ? `+$${priceDelta}` : `-$${Math.abs(priceDelta)}`}
              </span>
            </div>
          ) : (
            <>
              {/* Mobile ultra-clean single-line bar */}
              <div className="flex md:hidden items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: finish.swatchHex }}
                    aria-hidden="true"
                  />
                  <h1 className="font-semibold tracking-tight truncate">
                    {poles.length > 1 ? `P${poles.findIndex((p) => p.id === activePole.id) + 1} · ` : ''}
                    {finish.shortName}
                  </h1>
                  <span className={mutedClass} aria-hidden="true">·</span>
                  <span className={`font-mono text-[11px] tabular-nums shrink-0 ${mutedClass}`}>
                    {(activePole.heightCm / 100).toFixed(2)}m
                  </span>
                </div>
                <span className="font-mono text-xs font-semibold tabular-nums shrink-0">
                  ${bom.totalPriceUsd}
                </span>
              </div>

              {/* Desktop sleek horizontal bottom-center spec bar */}
              <div className="hidden md:flex items-center gap-3 text-xs whitespace-nowrap">
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white/25"
                    style={{ backgroundColor: finish.swatchHex }}
                    aria-hidden="true"
                  />
                  <h1 className="font-semibold tracking-tight">
                    {poles.length > 1 ? `${activePole.label} · ` : ''}
                    {finish.shortName} · {activePole.diameterMm}mm
                  </h1>
                </div>

                <span className={`h-3.5 w-px ${isDark ? 'bg-white/12' : 'bg-stone-300'}`} aria-hidden="true" />

                <span className={`text-[11px] ${mutedClass}`}>
                  {config.ceilingType === 'vaulted'
                    ? `Tilted ${config.vaultAngleDeg}°`
                    : mount.shortName}{' '}
                  · <span className="font-mono tabular-nums">{(activePole.heightCm / 100).toFixed(2)}m</span> ·{' '}
                  {activePole.isSpinning ? 'Spin' : 'Static'}
                </span>

                {activeCushionCm > 0 && (
                  <>
                    <span className={`h-3.5 w-px ${isDark ? 'bg-white/12' : 'bg-stone-300'}`} aria-hidden="true" />
                    <span
                      className={`font-mono text-[11px] font-semibold tabular-nums ${accentTextClass}`}
                      data-testid="hud-cushion-readout"
                      title={
                        cappedAtMax
                          ? '3.00m max pole limit'
                          : `Room ceiling ${(config.ceilingHeightCm / 100).toFixed(2)}m`
                      }
                    >
                      Cushion +{(activeCushionCm / 100).toFixed(2)}m ({activePole.cushionPlacement === 'top' ? 'Top' : 'Below'})
                    </span>
                  </>
                )}

                <span className={`h-3.5 w-px ${isDark ? 'bg-white/12' : 'bg-stone-300'}`} aria-hidden="true" />

                <span className="inline-flex items-center gap-1 text-[11px] font-medium">
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

                <span className={`h-3.5 w-px ${isDark ? 'bg-white/12' : 'bg-stone-300'}`} aria-hidden="true" />

                <span className="font-mono text-xs font-semibold tabular-nums">
                  ${bom.totalPriceUsd}
                </span>
              </div>
            </>
          )}

          {!bom.heightSolution.isValid && bom.heightSolution.warning && (
            <p className="mt-1 text-[11px] text-rose-400 leading-tight text-center">
              {bom.heightSolution.warning}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

