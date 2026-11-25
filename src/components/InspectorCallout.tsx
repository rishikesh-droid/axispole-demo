import {
  Box,
  Camera,
  Eye,
  EyeOff,
  Move,
  Pause,
  Play,
  RotateCcw,
  Ruler,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  StepBack,
  StepForward,
  Wrench,
  X,
} from 'lucide-react';
import type {
  CameraFocusId,
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
  getWallClearanceMarginM,
  HARDWARE_PARTS,
  isDarkLighting,
  POLE_FINISHES,
} from '../utils/poleConfig';
import {
  formatUsdExact,
  resolveXPoleConfiguration,
  XPOLE_FINISH_ORDER,
} from '../data/xpoleCatalog';

interface InspectorCalloutProps {
  config: PoleRigConfig;
  poles: PoleInstance[];
  activePole: PoleInstance;
  compareMode: boolean;
  compareFinish: PoleFinishId;
  onChangeCompareFinish: (finish: PoleFinishId) => void;
  moveMode: boolean;
  lastClamp: PoleClampResult | null;
  onFocusCamera: (preset: CameraFocusId) => void;
  installDemoActive: boolean;
  onExitInstallDemo: () => void;
  activeStepIndex: number;
  assemblyProgress: number;
  onChangeAssemblyProgress: (progress: number) => void;
  explodedFactor: number;
  onChangeExplodedFactor: (factor: number) => void;
  playbackMode: 'idle' | 'assemble' | 'dismantle';
  onStartPlayback: (mode: 'idle' | 'assemble' | 'dismantle') => void;
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
  compareMode,
  compareFinish,
  onChangeCompareFinish,
  moveMode,
  lastClamp,
  onFocusCamera,
  installDemoActive,
  onExitInstallDemo,
  activeStepIndex,
  assemblyProgress,
  onChangeAssemblyProgress,
  explodedFactor,
  onChangeExplodedFactor,
  playbackMode,
  onStartPlayback,
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
  if (arCameraActive || viewportMode === 'floor-plan') return null;

  const isDark = isDarkLighting(config.lighting);
  const isNeon = config.lighting === 'mood-neon';
  const isSunset = config.lighting === 'sunset-flow';
  const isPulse = config.lighting === 'cyber-pulse';
  const finish = POLE_FINISHES[activePole.finish];
  const compareSpec = POLE_FINISHES[compareFinish];
  const stepSpec = ASSEMBLY_STEPS[activeStepIndex] ?? ASSEMBLY_STEPS[0];
  const partSpec = selectedPart ? HARDWARE_PARTS[selectedPart] : null;
  const isDismantling = playbackMode === 'dismantle';

  const surfaceClass = isNeon
    ? 'bg-[#0e111d]/62 border-white/15 text-zinc-100 shadow-[0_12px_32px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.12)]'
    : isSunset
      ? 'bg-[#1a1015]/64 border-rose-300/18 text-rose-50 shadow-[0_12px_32px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.1)]'
      : isPulse
        ? 'bg-[#0a141a]/64 border-emerald-300/18 text-emerald-50 shadow-[0_12px_32px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.1)]'
        : isDark
          ? 'bg-[#151311]/66 border-amber-300/18 text-stone-100 shadow-[0_12px_32px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.1)]'
          : 'bg-white/68 border-stone-900/12 text-stone-900 shadow-[0_10px_28px_rgba(15,23,42,0.1),inset_0_1px_0_rgba(255,255,255,0.85)]';

  const mutedClass = isDark ? 'text-zinc-300/75' : 'text-stone-600';
  const dividerBg = isDark ? 'bg-white/14' : 'bg-stone-900/12';
  const accentTextClass = isNeon
    ? 'text-violet-300'
    : isSunset
      ? 'text-orange-300'
      : isPulse
        ? 'text-emerald-300'
        : isDark
          ? 'text-amber-300'
          : 'text-violet-700';

  const btnIdle = isDark
    ? 'bg-white/[0.06] hover:bg-white/[0.14] text-zinc-100 border-white/12 transition-all'
    : 'bg-white/55 hover:bg-white/88 text-stone-800 border-stone-900/12 transition-all';

  const btnActive = isNeon
    ? 'bg-violet-500/40 text-white border-violet-300/60'
    : isSunset
      ? 'bg-rose-500/40 text-white border-orange-300/60'
      : isPulse
        ? 'bg-emerald-500/35 text-white border-emerald-300/60'
        : isDark
          ? 'bg-amber-500/35 text-amber-100 border-amber-300/60'
          : 'bg-violet-700/90 text-white border-violet-700';

  const leftRes = resolveXPoleConfiguration(
    activePole.heightCm * 10,
    activePole.finish,
    config.priceTier
  );
  const rightRes = resolveXPoleConfiguration(
    activePole.heightCm * 10,
    compareFinish,
    config.priceTier
  );
  const priceDelta =
    leftRes.available && rightRes.available
      ? Number((rightRes.unitPriceUsd - leftRes.unitPriceUsd).toFixed(2))
      : null;

  const jumpToStep = (stepZeroIdx: number) => {
    const clamped = Math.max(0, Math.min(ASSEMBLY_STEPS.length - 1, stepZeroIdx));
    onStartPlayback('idle');
    const targetProgress = (clamped + 0.65) / ASSEMBLY_STEPS.length;
    onChangeAssemblyProgress(Math.min(1, targetProgress));
    onFocusCamera(ASSEMBLY_STEPS[clamped].cameraFocus);
  };

  const activeStripKey = partSpec
    ? 'part'
    : installDemoActive
      ? 'demo'
      : compareMode
        ? 'compare'
        : moveMode
          ? 'move'
          : config.environment === 'replica' && roomReplica
            ? 'replica'
            : null;

  if (!activeStripKey) return null;

  return (
    <div
      key={activeStripKey}
      className="pointer-events-auto max-w-full animate-dock-panel"
    >
          {partSpec ? (
            <div
              className={`rounded-2xl border px-3.5 py-1.5 backdrop-blur-2xl backdrop-saturate-150 max-w-[min(760px,100%)] ${surfaceClass}`}
              data-testid="hardware-inspector-card"
            >
              <div className="flex items-center gap-2.5 text-xs whitespace-nowrap">
                <h2 className="font-semibold tracking-tight truncate">{partSpec.name}</h2>
                <span className={`h-3.5 w-px shrink-0 ${dividerBg}`} aria-hidden="true" />
                <span className={`font-mono text-[11px] tabular-nums font-semibold shrink-0 ${accentTextClass}`}>
                  {partSpec.torqueSpec}
                </span>
                <span className={`hidden sm:inline h-3.5 w-px shrink-0 ${dividerBg}`} aria-hidden="true" />
                <span className={`hidden sm:inline text-[11px] truncate max-w-[240px] ${mutedClass}`}>
                  {partSpec.material}
                </span>
                <button
                  type="button"
                  onClick={onClearSelectedPart}
                  aria-label="Close component inspector"
                  className={`ml-auto p-0.5 rounded-md transition-colors shrink-0 ${
                    isDark ? 'hover:bg-white/10 text-zinc-400' : 'hover:bg-stone-200 text-stone-500'
                  }`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : installDemoActive ? (
            <div
              className={`w-full md:w-auto md:min-w-[600px] max-w-[min(860px,100%)] rounded-2xl border overflow-hidden backdrop-blur-2xl backdrop-saturate-150 ${surfaceClass}`}
              data-testid="assembly-step-card"
            >
              <div className="grid grid-cols-7 gap-0.5 px-3 pt-1.5" aria-hidden="true">
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
                            : 'bg-violet-400'
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

              <div className="px-3 py-1.5 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <div className="inline-flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (playbackMode === 'assemble') {
                          onStartPlayback('idle');
                        } else {
                          if (assemblyProgress >= 0.98) onChangeAssemblyProgress(0);
                          onStartPlayback('assemble');
                        }
                      }}
                      className={`px-2 py-1 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 ${
                        playbackMode === 'assemble' ? btnActive : btnIdle
                      }`}
                    >
                      {playbackMode === 'assemble' ? (
                        <Pause className="w-3 h-3" aria-hidden="true" />
                      ) : (
                        <Play className="w-3 h-3" aria-hidden="true" />
                      )}
                      <span>{playbackMode === 'assemble' ? 'Pause' : 'Install'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (playbackMode === 'dismantle') {
                          onStartPlayback('idle');
                        } else {
                          if (assemblyProgress <= 0.02) onChangeAssemblyProgress(1);
                          onStartPlayback('dismantle');
                        }
                      }}
                      className={`px-2 py-1 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 ${
                        playbackMode === 'dismantle' ? btnActive : btnIdle
                      }`}
                    >
                      <RotateCcw className="w-3 h-3" aria-hidden="true" />
                      <span className="hidden sm:inline">Dismantle</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => jumpToStep(activeStepIndex - 1)}
                      disabled={activeStepIndex <= 0}
                      aria-label="Previous installation step"
                      className={`p-1 rounded-lg border disabled:opacity-35 ${btnIdle}`}
                    >
                      <StepBack className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => jumpToStep(activeStepIndex + 1)}
                      disabled={activeStepIndex >= ASSEMBLY_STEPS.length - 1}
                      aria-label="Next installation step"
                      className={`p-1 rounded-lg border disabled:opacity-35 ${btnIdle}`}
                    >
                      <StepForward className="w-3 h-3" />
                    </button>
                  </div>

                  <span className={`h-3.5 w-px shrink-0 ${dividerBg}`} aria-hidden="true" />

                  <span className={`inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase shrink-0 ${accentTextClass}`}>
                    <Wrench className="w-3 h-3" aria-hidden="true" />
                    <span>
                      0{stepSpec.step}/0{ASSEMBLY_STEPS.length}
                    </span>
                  </span>

                  <span className="font-semibold truncate max-w-[200px] sm:max-w-[240px]">
                    {stepSpec.title}
                  </span>

                  <span
                    className={`hidden md:inline font-mono text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md border shrink-0 ${
                      isDark
                        ? 'border-white/15 bg-white/8 text-zinc-200'
                        : 'border-stone-300 bg-white/70 text-stone-800'
                    }`}
                    data-testid="assembly-torque-badge"
                  >
                    {stepSpec.torqueNm > 0 ? `${stepSpec.torqueNm.toFixed(1)} N·m` : 'Level & Seat'}
                  </span>

                  <div className="hidden lg:flex items-center gap-1.5 ml-auto">
                    <label htmlFor="demo-explode-slider" className={`text-[10px] ${mutedClass}`}>
                      Explode
                    </label>
                    <input
                      id="demo-explode-slider"
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(explodedFactor * 100)}
                      onChange={(e) => onChangeExplodedFactor(Number(e.target.value) / 100)}
                      className="axis-slider w-16"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={onExitInstallDemo}
                    aria-label="Exit Pole Installation Demo"
                    title="Exit Installation Demo"
                    className={`ml-auto lg:ml-1 p-1 rounded-lg transition-colors shrink-0 ${
                      isDark ? 'hover:bg-white/10 text-zinc-300 hover:text-white' : 'hover:bg-stone-200 text-stone-600'
                    }`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3 text-[11px]">
                  <p className={`truncate ${isDark ? 'text-zinc-200' : 'text-stone-700'}`}>
                    {isDismantling ? stepSpec.dismantleInstruction : stepSpec.installInstruction}
                  </p>
                  <span className={`hidden md:inline-flex items-center gap-1 text-[10px] shrink-0 ${isDark ? 'text-emerald-300/90' : 'text-teal-700'}`}>
                    <ShieldCheck className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span className="truncate max-w-[210px]">{stepSpec.safetyNote}</span>
                  </span>
                </div>
              </div>
            </div>
          ) : compareMode ? (
            <div
              className={`rounded-2xl border px-3.5 py-1.5 backdrop-blur-2xl backdrop-saturate-150 ${surfaceClass}`}
              data-testid="compare-controls"
            >
              <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                <span className="font-semibold tracking-tight whitespace-nowrap">
                  Left: <span className={accentTextClass}>{finish.shortName}</span>
                </span>
                <span className={`h-3.5 w-px ${dividerBg}`} aria-hidden="true" />
                <span className={`text-[11px] ${mutedClass}`}>Compare Right:</span>
                <div className="inline-flex items-center gap-1" role="group" aria-label="Compare right finish">
                  {XPOLE_FINISH_ORDER.map((fid) => {
                    const fSpec = POLE_FINISHES[fid];
                    const active = compareFinish === fid;
                    return (
                      <button
                        key={`cmp-${fid}`}
                        type="button"
                        onClick={() => onChangeCompareFinish(fid)}
                        aria-pressed={active}
                        className={`px-2 py-0.5 rounded-lg border text-[10.5px] font-semibold whitespace-nowrap ${
                          active ? btnActive : btnIdle
                        }`}
                      >
                        {fSpec.shortName}
                      </button>
                    );
                  })}
                </div>
                <span className={`hidden sm:inline h-3.5 w-px ${dividerBg}`} aria-hidden="true" />
                <span className={`font-mono text-[11px] font-semibold tabular-nums whitespace-nowrap ${accentTextClass}`}>
                  {priceDelta === null
                    ? `${compareSpec.shortName} N/A`
                    : priceDelta === 0
                      ? 'Same price'
                      : priceDelta > 0
                        ? `+${formatUsdExact(priceDelta)}`
                        : `-${formatUsdExact(Math.abs(priceDelta))}`}
                </span>
              </div>
            </div>
          ) : moveMode ? (
            <div
              className={`rounded-2xl border px-3.5 py-1.5 backdrop-blur-2xl backdrop-saturate-150 ${surfaceClass}`}
              data-testid="move-mode-hud"
            >
              <div className="flex items-center gap-2.5 text-xs whitespace-nowrap">
                <span className={`inline-flex items-center gap-1.5 font-semibold ${accentTextClass}`}>
                  <Move className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Drag {poles.length > 1 ? activePole.label : 'Pole'}</span>
                </span>
                <span className={`h-3.5 w-px ${dividerBg}`} aria-hidden="true" />
                <span className="font-mono text-[11px] tabular-nums">
                  {activePole.x.toFixed(1)}m, {activePole.z.toFixed(1)}m
                </span>
                <span className={`hidden sm:inline h-3.5 w-px ${dividerBg}`} aria-hidden="true" />
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
                      ? `Min ${getWallClearanceMarginM(config.mount, config.enforceMinClearance, config.clearanceRadiusM).toFixed(2)}m wall limit`
                      : config.enforceMinClearance
                        ? `${config.clearanceRadiusM.toFixed(2)}m min clearance`
                        : 'Compact limit'}
                </span>
                <button
                  type="button"
                  onClick={onToggleMinClearance}
                  className={`px-2 py-0.5 rounded-lg border text-[10px] font-semibold inline-flex items-center gap-1 shrink-0 ${
                    config.enforceMinClearance
                      ? btnIdle
                      : 'border-amber-400/70 bg-amber-500/20 text-amber-300'
                  }`}
                >
                  {config.enforceMinClearance ? (
                    <ShieldCheck className="w-3 h-3" aria-hidden="true" />
                  ) : (
                    <ShieldOff className="w-3 h-3" aria-hidden="true" />
                  )}
                  <span>Clearance {config.enforceMinClearance ? 'On' : 'Off'}</span>
                </button>
              </div>
            </div>
          ) : config.environment === 'replica' && roomReplica ? (
            <div
              className={`rounded-2xl border px-3 py-1.5 backdrop-blur-2xl backdrop-saturate-150 ${surfaceClass}`}
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

                {roomReplica.depthMesh ? (
                  <>
                    <span className={`h-3 w-px shrink-0 ${dividerBg}`} aria-hidden="true" />
                    <div className="inline-flex items-center gap-0.5 rounded-lg border border-white/15 p-0.5">
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
                          className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold transition-colors ${
                            replicaRenderMode === modeId ? btnActive : btnIdle
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
                      className={`px-1.5 py-0.5 rounded-md border text-[10px] font-semibold inline-flex items-center gap-1 shrink-0 ${
                        showReplicaDimensions ? btnActive : btnIdle
                      }`}
                    >
                      <Ruler className="w-2.5 h-2.5" aria-hidden="true" />
                      <span>Dims ({roomReplica.depthMesh.measuredObjects.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={onMatchReplicaCamera}
                      data-testid="hud-match-camera"
                      className={`px-1.5 py-0.5 rounded-md border text-[10px] font-semibold inline-flex items-center gap-1 shrink-0 ${btnIdle}`}
                    >
                      <Camera className="w-2.5 h-2.5" aria-hidden="true" />
                      <span className="hidden sm:inline">Match Cam</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={onToggleInferredObjects}
                    data-testid="hud-toggle-inferred"
                    className={`px-1.5 py-0.5 rounded-md border text-[10px] font-semibold inline-flex items-center gap-1 shrink-0 ${btnIdle}`}
                  >
                    {showInferredObjects ? (
                      <Eye className="w-2.5 h-2.5" aria-hidden="true" />
                    ) : (
                      <EyeOff className="w-2.5 h-2.5" aria-hidden="true" />
                    )}
                    <span>Unseen {showInferredObjects ? 'On' : 'Off'}</span>
                  </button>
                )}
              </div>
            </div>
          ) : null}
    </div>
  );
}
