import { useMemo, useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Columns2,
  Lamp,
  Maximize2,
  Move,
  Orbit,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  StepBack,
  StepForward,
  Sun,
  Sunset,
  Trash2,
  Video,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import type {
  BaseMountId,
  CameraFocusId,
  CameraMotionMode,
  CeilingType,
  DockTabId,
  EnvironmentPreset,
  LightingPreset,
  PoleFinishId,
  PoleInstance,
  PoleRigConfig,
} from '../types/pole';
import {
  ASSEMBLY_STEPS,
  BASE_MOUNTS,
  DIAMETER_OPTIONS,
  getCushionHeightCm,
  getMinRoomSizeM,
  isDarkLighting,
  LIGHTING_PRESETS,
  MAX_CEILING_HEIGHT_CM,
  MAX_POLE_HEIGHT_CM,
  MAX_POLES_IN_STUDIO,
  MAX_ROOM_SIZE_M,
  MIN_CEILING_HEIGHT_CM,
  MIN_POLE_HEIGHT_CM,
  POLE_FINISHES,
} from '../utils/poleConfig';
import { getPoleMaterialAvatars } from '../utils/materialThumbnails';

interface ControlDockProps {
  config: PoleRigConfig;
  poles: PoleInstance[];
  activePole: PoleInstance;
  onSelectPole: (poleId: string) => void;
  onAddPole: () => void;
  onRemoveActivePole: () => void;
  onCenterActivePole: () => void;
  onChangeActivePole: (patch: Partial<PoleInstance>) => void;
  onApplyFinishToAll: (finish: PoleFinishId) => void;
  onChangeConfig: (patch: Partial<PoleRigConfig>) => void;
  compareMode: boolean;
  onToggleCompareMode: () => void;
  compareFinish: PoleFinishId;
  onChangeCompareFinish: (finish: PoleFinishId) => void;
  moveMode: boolean;
  onToggleMoveMode: () => void;
  cameraMotion: CameraMotionMode;
  onChangeCameraMotion: (mode: CameraMotionMode) => void;
  activeTab: DockTabId;
  onChangeTab: (tab: DockTabId) => void;
  dockCollapsed: boolean;
  onToggleCollapse: () => void;
  assemblyProgress: number;
  onChangeAssemblyProgress: (progress: number) => void;
  explodedFactor: number;
  onChangeExplodedFactor: (factor: number) => void;
  highlightFasteners: boolean;
  onToggleHighlightFasteners: () => void;
  playbackMode: 'idle' | 'assemble' | 'dismantle';
  onStartPlayback: (mode: 'idle' | 'assemble' | 'dismantle') => void;
  onFocusCamera: (preset: CameraFocusId) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  arCameraActive: boolean;
  onStartArCamera: () => void;
  hasRoomReplica: boolean;
  showInferredObjects: boolean;
  onToggleInferredObjects: () => void;
}

const FINISH_ORDER: PoleFinishId[] = ['brass', 'stainless', 'powder-black', 'silicone'];
const MOUNT_ORDER: BaseMountId[] = ['tension', 'permanent-ceiling'];
const CEILING_TYPE_OPTIONS: { id: CeilingType; label: string; title: string }[] = [
  { id: 'flat', label: 'Flat', title: 'Flat level room ceiling' },
  { id: 'vaulted', label: 'Tilted', title: 'Tilted / vaulted sloped room ceiling' },
];

function LightingIcon({ preset }: { preset: LightingPreset }) {
  if (preset === 'studio-daylight') return <Sun className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
  if (preset === 'mood-neon') return <Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
  if (preset === 'sunset-flow') return <Sunset className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
  if (preset === 'cyber-pulse') return <Zap className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
  return <Lamp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
}

export function ControlDock({
  config,
  poles,
  activePole,
  onSelectPole,
  onAddPole,
  onRemoveActivePole,
  onCenterActivePole,
  onChangeActivePole,
  onApplyFinishToAll,
  onChangeConfig,
  compareMode,
  onToggleCompareMode,
  compareFinish,
  onChangeCompareFinish,
  moveMode,
  onToggleMoveMode,
  cameraMotion,
  onChangeCameraMotion,
  activeTab,
  onChangeTab,
  dockCollapsed,
  onToggleCollapse,
  assemblyProgress,
  onChangeAssemblyProgress,
  explodedFactor,
  onChangeExplodedFactor,
  highlightFasteners,
  onToggleHighlightFasteners,
  playbackMode,
  onStartPlayback,
  onFocusCamera,
  soundEnabled,
  onToggleSound,
  arCameraActive,
  onStartArCamera,
  hasRoomReplica,
  showInferredObjects,
  onToggleInferredObjects,
}: ControlDockProps) {
  const [mobileConfigPane, setMobileConfigPane] = useState<'finish' | 'rig'>('finish');
  const materialAvatars = useMemo(() => getPoleMaterialAvatars(), []);

  // Hide standard dock while AR Room Measure overlay is active
  if (arCameraActive) return null;

  const isDark = isDarkLighting(config.lighting);
  const isNeon = config.lighting === 'mood-neon';
  const isSunset = config.lighting === 'sunset-flow';
  const isPulse = config.lighting === 'cyber-pulse';
  const minRoomSizeM = getMinRoomSizeM(config.enforceMinClearance);
  const activePoleIndex = Math.max(
    0,
    poles.findIndex((p) => p.id === activePole.id)
  );
  const activePoleTag = poles.length > 1 ? `P${activePoleIndex + 1}` : 'Pole';
  const maxActivePoleCm = Math.max(
    MIN_POLE_HEIGHT_CM,
    Math.min(config.ceilingHeightCm, MAX_POLE_HEIGHT_CM)
  );
  const activeCushionCm = getCushionHeightCm(config.ceilingHeightCm, activePole.heightCm);
  const hasCushion = activeCushionCm > 0;

  const activeStepIdx = Math.min(
    ASSEMBLY_STEPS.length - 1,
    Math.floor(
      assemblyProgress >= 0.999 ? ASSEMBLY_STEPS.length - 1 : assemblyProgress * ASSEMBLY_STEPS.length
    )
  );

  const jumpToStep = (stepZeroIdx: number) => {
    const clamped = Math.max(0, Math.min(ASSEMBLY_STEPS.length - 1, stepZeroIdx));
    onStartPlayback('idle');
    const targetProgress = (clamped + 0.65) / ASSEMBLY_STEPS.length;
    onChangeAssemblyProgress(Math.min(1, targetProgress));
    onFocusCamera(ASSEMBLY_STEPS[clamped].cameraFocus);
  };

  // Studio-adaptive card styling (zero backdrop-blur over WebGL)
  const dockSurface = isNeon
    ? 'bg-[#11131d]/93 border-violet-400/25 text-zinc-100 shadow-[0_12px_36px_rgba(0,0,0,0.6)]'
    : isSunset
      ? 'bg-[#1c1317]/93 border-rose-400/28 text-rose-50 shadow-[0_12px_36px_rgba(0,0,0,0.6)]'
      : isPulse
        ? 'bg-[#0e161b]/93 border-emerald-400/28 text-emerald-50 shadow-[0_12px_36px_rgba(0,0,0,0.6)]'
        : isDark
          ? 'bg-[#161412]/93 border-amber-500/25 text-stone-100 shadow-[0_12px_36px_rgba(0,0,0,0.6)]'
          : 'bg-[#f8f7f4]/94 border-stone-300/90 text-stone-900 shadow-md';

  const dividerClass = isNeon || isSunset || isPulse
    ? 'border-white/10'
    : isDark
      ? 'border-stone-800'
      : 'border-stone-200/90';

  const segBg = isNeon
    ? 'bg-[#0a0c12]/90'
    : isSunset
      ? 'bg-[#130c10]/90'
      : isPulse
        ? 'bg-[#081014]/90'
        : isDark
          ? 'bg-stone-900/90'
          : 'bg-stone-200/80';

  const segActive = isNeon
    ? 'bg-violet-500/25 text-white ring-1 ring-violet-400/50'
    : isSunset
      ? 'bg-rose-500/25 text-white ring-1 ring-orange-400/55'
      : isPulse
        ? 'bg-emerald-500/25 text-white ring-1 ring-emerald-400/55'
        : isDark
          ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/50'
          : 'bg-white text-stone-950 shadow-xs';

  const segIdle = isDark
    ? 'text-zinc-400 hover:text-zinc-100'
    : 'text-stone-600 hover:text-stone-950';

  const mutedText = isDark ? 'text-zinc-400' : 'text-stone-500';

  const cardBtnIdle = isNeon
    ? 'border-white/10 bg-[#171a27]/90 text-zinc-200 hover:border-violet-400/40'
    : isSunset
      ? 'border-white/10 bg-[#25181e]/90 text-rose-100 hover:border-rose-400/40'
      : isPulse
        ? 'border-white/10 bg-[#132027]/90 text-emerald-50 hover:border-emerald-400/40'
        : isDark
          ? 'border-stone-700/80 bg-stone-900/80 text-stone-200 hover:border-amber-500/40'
          : 'border-stone-300/85 bg-white text-stone-800 hover:bg-stone-50';

  const cardBtnActive = isNeon
    ? 'border-cyan-400/75 bg-violet-500/18 text-white'
    : isSunset
      ? 'border-orange-400/75 bg-rose-500/20 text-white'
      : isPulse
        ? 'border-emerald-400/75 bg-emerald-500/20 text-white'
        : isDark
          ? 'border-amber-400/80 bg-amber-500/16 text-amber-100'
          : 'border-amber-700 bg-amber-600/10 text-stone-950';

  const primaryActionBtn = isNeon
    ? 'bg-zinc-100 text-zinc-950 hover:bg-white'
    : isSunset
      ? 'bg-rose-400 text-stone-950 hover:bg-rose-300'
      : isPulse
        ? 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'
        : isDark
          ? 'bg-amber-500 text-stone-950 hover:bg-amber-400'
          : 'bg-stone-900 text-white hover:bg-stone-800';

  const accentToggleActive = isNeon
    ? 'border-cyan-400/70 bg-cyan-400/15 text-cyan-200'
    : isSunset
      ? 'border-orange-400/70 bg-rose-500/20 text-orange-200'
      : isPulse
        ? 'border-emerald-400/70 bg-emerald-500/18 text-emerald-200'
        : isDark
          ? 'border-amber-400/70 bg-amber-500/18 text-amber-200'
          : 'border-amber-700 bg-amber-600/15 text-amber-800';

  if (dockCollapsed) {
    return (
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2">
        <button
          type="button"
          onClick={onStartArCamera}
          className={`md:hidden min-h-[40px] px-3.5 py-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${dockSurface}`}
        >
          <Camera className="w-3.5 h-3.5" aria-hidden="true" />
          <span>AR Room</span>
        </button>

        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={false}
          className={`min-h-[40px] px-4 py-2 rounded-xl md:rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${dockSurface}`}
        >
          <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Controls</span>
        </button>
      </div>
    );
  }

  return (
    <section
      aria-label="3D Rig Control Dock"
      className="fixed bottom-2.5 sm:bottom-3 left-1/2 -translate-x-1/2 z-30 w-[min(1090px,96vw)]"
      data-testid="control-dock"
    >
      {/* ===================== MOBILE LUXURY COMPACT DOCK (< md) ===================== */}
      <div
        className={`md:hidden w-full rounded-2xl border overflow-hidden transition-colors duration-200 ${dockSurface}`}
        data-testid="mobile-control-dock"
      >
        {/* Mobile Row 1: Thumb Navigation Tabs + Compact Mode Icons */}
        <div className={`px-2.5 py-1.5 border-b flex items-center justify-between gap-1.5 ${dividerClass}`}>
          <div
            role="tablist"
            aria-label="Mobile configuration sections"
            className={`flex items-center gap-0.5 p-0.5 rounded-lg ${segBg}`}
          >
            <button
              role="tab"
              type="button"
              aria-selected={activeTab === 'configure' && mobileConfigPane === 'finish'}
              onClick={() => {
                onChangeTab('configure');
                setMobileConfigPane('finish');
              }}
              className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'configure' && mobileConfigPane === 'finish' ? segActive : segIdle
              }`}
            >
              Finish
            </button>
            <button
              role="tab"
              type="button"
              aria-selected={activeTab === 'configure' && mobileConfigPane === 'rig'}
              onClick={() => {
                onChangeTab('configure');
                setMobileConfigPane('rig');
              }}
              className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'configure' && mobileConfigPane === 'rig' ? segActive : segIdle
              }`}
            >
              Rig
            </button>
            <button
              role="tab"
              type="button"
              aria-selected={activeTab === 'assembly'}
              onClick={() => onChangeTab('assembly')}
              className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'assembly' ? segActive : segIdle
              }`}
            >
              Build
            </button>
            <button
              role="tab"
              type="button"
              aria-selected={activeTab === 'space'}
              onClick={() => onChangeTab('space')}
              className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'space' ? segActive : segIdle
              }`}
            >
              Space
            </button>
          </div>

          {/* Mobile Quick Actions (Icon-clean, zero crowding) */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onToggleCompareMode}
              aria-pressed={compareMode}
              aria-label="Compare pole finishes"
              className={`min-h-[32px] min-w-[32px] rounded-lg border flex items-center justify-center transition-colors ${
                compareMode ? accentToggleActive : cardBtnIdle
              }`}
            >
              <Columns2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onToggleMoveMode}
              aria-pressed={moveMode && !compareMode}
              disabled={compareMode}
              aria-label="Move pole position"
              className={`min-h-[32px] min-w-[32px] rounded-lg border flex items-center justify-center transition-colors ${
                compareMode
                  ? 'opacity-40 cursor-not-allowed ' + cardBtnIdle
                  : moveMode
                    ? accentToggleActive
                    : cardBtnIdle
              }`}
            >
              <Move className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-expanded={true}
              aria-label="Hide controls"
              className={`min-h-[32px] min-w-[32px] rounded-lg border flex items-center justify-center transition-colors ${cardBtnIdle}`}
            >
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Mobile Body: Focused single compact pane (~72px–104px tall) */}
        <div className="px-2.5 py-2">
          {activeTab === 'configure' && compareMode && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className={`block text-[10px] font-semibold mb-1 ${mutedText}`}>Left Pole A</span>
                  <div className="grid grid-cols-4 gap-1">
                    {FINISH_ORDER.map((fid) => (
                      <button
                        key={`m-l-${fid}`}
                        type="button"
                        onClick={() => onChangeActivePole({ finish: fid })}
                        aria-label={`Left ${POLE_FINISHES[fid].shortName}`}
                        aria-pressed={activePole.finish === fid}
                        className={`p-1 rounded-lg border flex items-center justify-center ${
                          activePole.finish === fid ? cardBtnActive : cardBtnIdle
                        }`}
                      >
                        <img
                          src={materialAvatars[fid]}
                          alt=""
                          aria-hidden="true"
                          className="w-6 h-6 rounded-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className={`block text-[10px] font-semibold mb-1 ${mutedText}`}>Right Pole B</span>
                  <div className="grid grid-cols-4 gap-1">
                    {FINISH_ORDER.map((fid) => (
                      <button
                        key={`m-r-${fid}`}
                        type="button"
                        onClick={() => onChangeCompareFinish(fid)}
                        aria-label={`Right ${POLE_FINISHES[fid].shortName}`}
                        aria-pressed={compareFinish === fid}
                        className={`p-1 rounded-lg border flex items-center justify-center ${
                          compareFinish === fid ? cardBtnActive : cardBtnIdle
                        }`}
                      >
                        <img
                          src={materialAvatars[fid]}
                          alt=""
                          aria-hidden="true"
                          className="w-6 h-6 rounded-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className={`grid grid-cols-5 gap-0.5 p-0.5 rounded-lg ${segBg}`}>
                {LIGHTING_PRESETS.map((preset) => (
                  <button
                    key={`mc-${preset.id}`}
                    type="button"
                    onClick={() => onChangeConfig({ lighting: preset.id })}
                    aria-pressed={config.lighting === preset.id}
                    title={preset.label}
                    className={`py-1 px-0.5 rounded-md text-[10px] font-medium flex flex-col items-center justify-center gap-0.5 whitespace-nowrap ${
                      config.lighting === preset.id ? segActive : segIdle
                    }`}
                  >
                    <LightingIcon preset={preset.id} />
                    <span>{preset.mobileLabel}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'configure' && !compareMode && mobileConfigPane === 'finish' && (
            <div className="space-y-2">
              {/* 4 Rounded Material PFP Tiles */}
              <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Pole finishes">
                {FINISH_ORDER.map((fid) => {
                  const spec = POLE_FINISHES[fid];
                  const selected = activePole.finish === fid;
                  return (
                    <button
                      key={`m-fin-${fid}`}
                      type="button"
                      onClick={() => onChangeActivePole({ finish: fid })}
                      aria-pressed={selected}
                      className={`flex flex-col items-center justify-center gap-1 py-1.5 px-1 rounded-xl border transition-colors ${
                        selected ? cardBtnActive : cardBtnIdle
                      }`}
                    >
                      <img
                        src={materialAvatars[fid]}
                        alt=""
                        aria-hidden="true"
                        className={`w-7 h-7 rounded-full object-cover ring-1 ${
                          selected
                            ? isNeon
                              ? 'ring-cyan-400'
                              : 'ring-amber-500'
                            : isDark
                              ? 'ring-white/20'
                              : 'ring-black/15'
                        }`}
                      />
                      <span className="text-[10px] font-semibold leading-none truncate max-w-full">
                        {fid === 'powder-black' ? 'Black' : spec.shortName.split(' ')[0]}
                      </span>
                    </button>
                  );
                })}
              </div>

              {poles.length > 1 && (
                <div className="flex items-center justify-between gap-2 px-1">
                  <span className={`text-[10px] ${mutedText}`}>
                    Editing {activePole.label} · {POLE_FINISHES[activePole.finish].shortName}
                  </span>
                  <button
                    type="button"
                    onClick={() => onApplyFinishToAll(activePole.finish)}
                    className={`px-2 py-0.5 text-[10px] font-semibold rounded border transition-colors whitespace-nowrap ${cardBtnIdle}`}
                  >
                    Apply to All Poles
                  </button>
                </div>
              )}

              {/* Compact 5-Preset Fitness Studio Lighting Manager */}
              <div
                className={`grid grid-cols-5 gap-0.5 p-0.5 rounded-lg ${segBg}`}
                role="group"
                aria-label="Lighting Manager"
              >
                {LIGHTING_PRESETS.map((preset) => {
                  const active = config.lighting === preset.id;
                  return (
                    <button
                      key={`m-lit-${preset.id}`}
                      type="button"
                      onClick={() => onChangeConfig({ lighting: preset.id })}
                      aria-pressed={active}
                      title={preset.label}
                      className={`py-1 px-0.5 rounded-md text-[10px] font-medium flex flex-col items-center justify-center gap-0.5 transition-colors whitespace-nowrap ${
                        active ? segActive : segIdle
                      }`}
                    >
                      <LightingIcon preset={preset.id} />
                      <span>{preset.mobileLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'configure' && !compareMode && mobileConfigPane === 'rig' && (
            <div className="space-y-2">
              {/* Row A: Multi-Pole + Mounts */}
              <div className="flex items-center justify-between gap-1.5 overflow-x-auto">
                <div className="flex items-center gap-1 shrink-0">
                  {poles.map((p, idx) => (
                    <button
                      key={`mp-${p.id}`}
                      type="button"
                      onClick={() => onSelectPole(p.id)}
                      aria-pressed={p.id === activePole.id}
                      className={`px-2 py-1 text-[11px] font-semibold rounded-md border inline-flex items-center gap-1 ${
                        p.id === activePole.id ? cardBtnActive : cardBtnIdle
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: POLE_FINISHES[p.finish].swatchHex }}
                        aria-hidden="true"
                      />
                      <span>P{idx + 1}</span>
                    </button>
                  ))}
                  {poles.length < MAX_POLES_IN_STUDIO && (
                    <button
                      type="button"
                      onClick={onAddPole}
                      className={`px-2 py-1 text-[11px] font-semibold rounded-md border inline-flex items-center gap-0.5 ${cardBtnIdle}`}
                    >
                      <Plus className="w-3 h-3" aria-hidden="true" />
                      <span>Pole</span>
                    </button>
                  )}
                  {poles.length > 1 && (
                    <button
                      type="button"
                      onClick={onRemoveActivePole}
                      aria-label={`Remove ${activePole.label}`}
                      className={`p-1 rounded-md border ${cardBtnIdle}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div
                  className={`flex items-center gap-0.5 p-0.5 rounded-md shrink-0 ${segBg}`}
                  role="group"
                  aria-label="Room mount type"
                >
                  {MOUNT_ORDER.map((mid) => (
                    <button
                      key={`mm-${mid}`}
                      type="button"
                      onClick={() => onChangeConfig({ mount: mid })}
                      aria-pressed={config.mount === mid}
                      className={`px-2 py-1 text-[10px] font-medium rounded-xs whitespace-nowrap ${
                        config.mount === mid ? segActive : segIdle
                      }`}
                    >
                      {mid === 'permanent-ceiling' ? 'Fixed' : BASE_MOUNTS[mid].shortName}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row B: Active Pole Height Slider + Width (Diameter) + Spin */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span className={`text-[10px] font-medium whitespace-nowrap ${mutedText}`}>
                    {activePoleTag} H
                  </span>
                  <input
                    aria-label={`${activePole.label} height`}
                    data-testid="mobile-pole-height-slider"
                    type="range"
                    min={MIN_POLE_HEIGHT_CM}
                    max={maxActivePoleCm}
                    step={1}
                    value={activePole.heightCm}
                    onChange={(e) => onChangeActivePole({ heightCm: Number(e.target.value) })}
                    className="axis-slider flex-1"
                  />
                  <span className="font-mono text-[11px] font-semibold tabular-nums w-10 text-right shrink-0">
                    {(activePole.heightCm / 100).toFixed(2)}m
                  </span>
                </div>

                <div className={`flex items-center gap-0.5 p-0.5 rounded-md shrink-0 ${segBg}`}>
                  {DIAMETER_OPTIONS.map((d) => (
                    <button
                      key={`md-${d.mm}`}
                      type="button"
                      onClick={() => onChangeActivePole({ diameterMm: d.mm })}
                      className={`px-1.5 py-0.5 text-[10px] font-mono rounded-xs ${
                        activePole.diameterMm === d.mm ? segActive : segIdle
                      }`}
                    >
                      {d.mm}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => onChangeActivePole({ isSpinning: !activePole.isSpinning })}
                  className={`px-2 py-1 text-[10px] font-semibold rounded-md border shrink-0 ${
                    activePole.isSpinning ? accentToggleActive : cardBtnIdle
                  }`}
                >
                  {activePole.isSpinning ? 'Spin' : 'Static'}
                </button>
              </div>

              {/* Row C: Global Room Ceiling Height (2–5m) + Global Ceiling Type (Flat / Tilted) */}
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span className={`text-[10px] font-medium whitespace-nowrap ${mutedText}`}>
                    Ceil
                  </span>
                  <input
                    aria-label="Room ceiling height"
                    data-testid="mobile-ceiling-height-slider"
                    type="range"
                    min={MIN_CEILING_HEIGHT_CM}
                    max={MAX_CEILING_HEIGHT_CM}
                    step={1}
                    value={config.ceilingHeightCm}
                    onChange={(e) => onChangeConfig({ ceilingHeightCm: Number(e.target.value) })}
                    className="axis-slider flex-1"
                  />
                  <span className="font-mono text-[11px] font-semibold tabular-nums w-10 text-right shrink-0">
                    {(config.ceilingHeightCm / 100).toFixed(2)}m
                  </span>
                </div>

                <div
                  className={`flex items-center gap-0.5 p-0.5 rounded-md shrink-0 ${segBg}`}
                  role="group"
                  aria-label="Room ceiling type"
                >
                  {CEILING_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={`m-ct-${opt.id}`}
                      type="button"
                      data-testid={`mobile-ceiling-${opt.id}-button`}
                      onClick={() => onChangeConfig({ ceilingType: opt.id })}
                      aria-pressed={config.ceilingType === opt.id}
                      title={opt.title}
                      className={`px-2 py-0.5 text-[10px] font-semibold rounded-xs whitespace-nowrap ${
                        config.ceilingType === opt.id ? segActive : segIdle
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row D: Per-Pole Cushion Placement (Top / Below) + Optional Global Roof Pitch */}
              <div className="flex items-center justify-between gap-2">
                <div
                  className="flex items-center gap-1.5 shrink-0"
                  role="group"
                  aria-label={`${activePole.label} cushion placement`}
                >
                  <span
                    className={`font-mono text-[10px] tabular-nums ${
                      hasCushion
                        ? isNeon
                          ? 'text-cyan-300 font-semibold'
                          : 'text-amber-400 font-semibold'
                        : mutedText
                    }`}
                  >
                    {hasCushion ? `Pad +${(activeCushionCm / 100).toFixed(2)}m` : 'Cushion'}
                  </span>
                  <div className={`flex items-center gap-0.5 p-0.5 rounded-md ${segBg}`}>
                    <button
                      type="button"
                      data-testid="mobile-cushion-top-button"
                      onClick={() => onChangeActivePole({ cushionPlacement: 'top' })}
                      aria-pressed={activePole.cushionPlacement === 'top'}
                      className={`px-2 py-0.5 text-[10px] font-semibold rounded-xs whitespace-nowrap ${
                        activePole.cushionPlacement === 'top' ? segActive : segIdle
                      }`}
                    >
                      Top
                    </button>
                    <button
                      type="button"
                      data-testid="mobile-cushion-below-button"
                      onClick={() => onChangeActivePole({ cushionPlacement: 'below' })}
                      aria-pressed={activePole.cushionPlacement === 'below'}
                      className={`px-2 py-0.5 text-[10px] font-semibold rounded-xs whitespace-nowrap ${
                        activePole.cushionPlacement === 'below' ? segActive : segIdle
                      }`}
                    >
                      Below
                    </button>
                  </div>
                </div>

                {config.ceilingType === 'vaulted' && (
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className={`text-[10px] font-medium whitespace-nowrap ${mutedText}`}>
                      Pitch
                    </span>
                    <input
                      aria-label="Vaulted roof pitch angle"
                      type="range"
                      min={6}
                      max={28}
                      step={1}
                      value={config.vaultAngleDeg}
                      onChange={(e) => onChangeConfig({ vaultAngleDeg: Number(e.target.value) })}
                      className="axis-slider flex-1"
                    />
                    <span className="font-mono text-[11px] font-semibold tabular-nums w-7 text-right shrink-0">
                      {config.vaultAngleDeg}°
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'assembly' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (playbackMode === 'assemble') onStartPlayback('idle');
                      else {
                        if (assemblyProgress >= 0.98) onChangeAssemblyProgress(0);
                        onStartPlayback('assemble');
                      }
                    }}
                    className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-lg inline-flex items-center gap-1 ${primaryActionBtn}`}
                  >
                    {playbackMode === 'assemble' ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    <span>{playbackMode === 'assemble' ? 'Pause' : 'Install'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (playbackMode === 'dismantle') onStartPlayback('idle');
                      else {
                        if (assemblyProgress <= 0.05) onChangeAssemblyProgress(1);
                        onStartPlayback('dismantle');
                      }
                    }}
                    className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border inline-flex items-center gap-1 ${
                      playbackMode === 'dismantle' ? accentToggleActive : cardBtnIdle
                    }`}
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>{playbackMode === 'dismantle' ? 'Stop' : 'Dismantle'}</span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5 flex-1 max-w-[155px]">
                  <span className={`text-[10px] ${mutedText}`}>Exp</span>
                  <input
                    aria-label="Exploded view"
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(explodedFactor * 100)}
                    onChange={(e) => onChangeExplodedFactor(Number(e.target.value) / 100)}
                    className="axis-slider flex-1"
                  />
                </div>

                <button
                  type="button"
                  onClick={onToggleHighlightFasteners}
                  className={`px-2 py-1.5 text-[10px] font-semibold rounded-lg border shrink-0 ${
                    highlightFasteners ? accentToggleActive : cardBtnIdle
                  }`}
                >
                  Torque
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1">
                {ASSEMBLY_STEPS.map((st, idx) => (
                  <button
                    key={`ms-${st.id}`}
                    type="button"
                    onClick={() => jumpToStep(idx)}
                    className={`py-1 rounded-md border font-mono text-[10px] font-semibold tabular-nums ${
                      idx === activeStepIdx ? cardBtnActive : cardBtnIdle
                    }`}
                  >
                    0{st.step}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'space' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className={`flex items-center gap-0.5 p-0.5 rounded-md shrink-0 ${segBg}`}>
                  {(
                    [
                      ...(hasRoomReplica ? ([['replica', 'My Room']] as [EnvironmentPreset, string][]) : []),
                      ['studio', 'Studio'],
                      ['home', 'Home'],
                    ] as [EnvironmentPreset, string][]
                  ).map(([envId, label]) => (
                    <button
                      key={`me-${envId}`}
                      type="button"
                      data-testid={`mobile-env-${envId}-button`}
                      onClick={() => onChangeConfig({ environment: envId })}
                      className={`px-2 py-1 text-[10px] font-medium rounded-xs whitespace-nowrap ${
                        config.environment === envId ? segActive : segIdle
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onChangeConfig({ enforceMinClearance: !config.enforceMinClearance })
                  }
                  aria-pressed={config.enforceMinClearance}
                  data-testid="mobile-min-clearance-toggle"
                  className={`px-2.5 py-1 text-[10px] font-semibold rounded-md border inline-flex items-center gap-1 whitespace-nowrap ${
                    config.enforceMinClearance
                      ? accentToggleActive
                      : 'border-amber-400/70 bg-amber-500/18 text-amber-300'
                  }`}
                >
                  {config.enforceMinClearance ? (
                    <ShieldCheck className="w-3 h-3" />
                  ) : (
                    <ShieldOff className="w-3 h-3" />
                  )}
                  <span>1.25m Min: {config.enforceMinClearance ? 'On' : 'Off'}</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onChangeCameraMotion('manual');
                    onFocusCamera('full-rig');
                  }}
                  className={`py-1 text-[10px] font-medium rounded-md border inline-flex items-center justify-center gap-1 ${cardBtnIdle}`}
                >
                  <Maximize2 className="w-3 h-3" />
                  <span>Full Room</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeCameraMotion(cameraMotion === 'orbit' ? 'manual' : 'orbit')}
                  className={`py-1 text-[10px] font-medium rounded-md border inline-flex items-center justify-center gap-1 ${
                    cameraMotion === 'orbit' ? accentToggleActive : cardBtnIdle
                  }`}
                >
                  <Orbit className="w-3 h-3" />
                  <span>Orbit</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeCameraMotion(cameraMotion === 'crane' ? 'manual' : 'crane')}
                  className={`py-1 text-[10px] font-medium rounded-md border inline-flex items-center justify-center gap-1 ${
                    cameraMotion === 'crane' ? accentToggleActive : cardBtnIdle
                  }`}
                >
                  <Video className="w-3 h-3" />
                  <span>Crane</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] ${mutedText}`}>W</span>
                  <input
                    aria-label="Room width"
                    type="range"
                    min={minRoomSizeM}
                    max={MAX_ROOM_SIZE_M}
                    step={0.1}
                    value={config.roomWidthM}
                    onChange={(e) => onChangeConfig({ roomWidthM: Number(e.target.value) })}
                    className="axis-slider flex-1"
                  />
                  <span className="font-mono text-[10px] tabular-nums w-8 text-right">
                    {config.roomWidthM.toFixed(1)}m
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] ${mutedText}`}>D</span>
                  <input
                    aria-label="Room depth"
                    type="range"
                    min={minRoomSizeM}
                    max={MAX_ROOM_SIZE_M}
                    step={0.1}
                    value={config.roomDepthM}
                    onChange={(e) => onChangeConfig({ roomDepthM: Number(e.target.value) })}
                    className="axis-slider flex-1"
                  />
                  <span className="font-mono text-[10px] tabular-nums w-8 text-right">
                    {config.roomDepthM.toFixed(1)}m
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===================== DESKTOP SLIM HORIZONTAL DOCK (md+) ===================== */}
      <div className={`hidden md:block w-full rounded-xl border overflow-hidden transition-colors duration-200 ${dockSurface}`}>
        {/* Slim Header Row: Tabs + Room Ceiling Height + Compare + Move + Dynamic Camera + Collapse */}
        <div className={`px-3 py-1.5 border-b flex flex-wrap items-center justify-between gap-2 ${dividerClass}`}>
          <div className="flex items-center gap-2">
            <div
              role="tablist"
              aria-label="Configuration sections"
              className={`flex items-center gap-0.5 p-0.5 rounded-md ${segBg}`}
            >
              {(
                [
                  ['configure', 'Configure'],
                  ['assembly', 'Assembly'],
                  ['space', 'Space'],
                ] as [DockTabId, string][]
              ).map(([tabId, label]) => (
                <button
                  key={tabId}
                  role="tab"
                  type="button"
                  aria-selected={activeTab === tabId}
                  onClick={() => onChangeTab(tabId)}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-xs transition-colors whitespace-nowrap shrink-0 ${
                    activeTab === tabId ? segActive : segIdle
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {activeTab !== 'assembly' && (
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="flex items-center gap-1.5 w-[156px] shrink-0">
                  <label
                    htmlFor="ceiling-height-slider"
                    className={`text-[11px] font-medium whitespace-nowrap ${mutedText}`}
                  >
                    Ceiling
                  </label>
                  <input
                    id="ceiling-height-slider"
                    data-testid="ceiling-height-slider"
                    type="range"
                    min={MIN_CEILING_HEIGHT_CM}
                    max={MAX_CEILING_HEIGHT_CM}
                    step={1}
                    value={config.ceilingHeightCm}
                    onChange={(e) => onChangeConfig({ ceilingHeightCm: Number(e.target.value) })}
                    className="axis-slider flex-1 min-w-[54px]"
                  />
                  <span className="font-mono text-[11px] font-semibold tabular-nums w-10 text-right shrink-0">
                    {(config.ceilingHeightCm / 100).toFixed(2)}m
                  </span>
                </div>

                <div
                  className={`flex items-center gap-0.5 p-0.5 rounded-md shrink-0 ${segBg}`}
                  role="group"
                  aria-label="Room ceiling type"
                >
                  {CEILING_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      data-testid={`ceiling-${opt.id}-button`}
                      onClick={() => onChangeConfig({ ceilingType: opt.id })}
                      aria-pressed={config.ceilingType === opt.id}
                      title={opt.title}
                      className={`px-2 py-0.5 text-[11px] font-medium rounded-xs transition-colors whitespace-nowrap ${
                        config.ceilingType === opt.id ? segActive : segIdle
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {config.ceilingType === 'vaulted' && (
                  <div className="flex items-center gap-1 shrink-0">
                    <label
                      htmlFor="vault-angle-slider"
                      className={`text-[11px] font-medium whitespace-nowrap ${mutedText}`}
                    >
                      Pitch
                    </label>
                    <input
                      id="vault-angle-slider"
                      data-testid="vault-angle-slider"
                      type="range"
                      min={6}
                      max={28}
                      step={1}
                      value={config.vaultAngleDeg}
                      onChange={(e) => onChangeConfig({ vaultAngleDeg: Number(e.target.value) })}
                      className="axis-slider w-12 shrink-0"
                    />
                    <span className="font-mono text-[11px] font-semibold tabular-nums w-6 text-right shrink-0">
                      {config.vaultAngleDeg}°
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Header Controls: Compare + Move + Dynamic Perspective Modes + Sound + Collapse */}
          <div className="flex items-center gap-1 overflow-x-auto">
            <button
              type="button"
              onClick={onToggleCompareMode}
              aria-pressed={compareMode}
              data-testid="compare-mode-toggle"
              className={`px-2 py-1 text-[11px] font-semibold rounded-md border inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                compareMode ? accentToggleActive : cardBtnIdle
              }`}
            >
              <Columns2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Compare</span>
            </button>

            <button
              type="button"
              onClick={onToggleMoveMode}
              aria-pressed={moveMode && !compareMode}
              disabled={compareMode}
              data-testid="move-mode-toggle"
              className={`px-2 py-1 text-[11px] font-semibold rounded-md border inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                compareMode
                  ? 'opacity-40 cursor-not-allowed ' + cardBtnIdle
                  : moveMode
                    ? accentToggleActive
                    : cardBtnIdle
              }`}
            >
              <Move className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Move</span>
            </button>

            <span className={`mx-0.5 h-4 w-px ${isDark ? 'bg-white/10' : 'bg-stone-300'}`} aria-hidden="true" />

            <button
              type="button"
              data-testid="full-camera-button"
              onClick={() => {
                onChangeCameraMotion('manual');
                onFocusCamera(compareMode ? 'compare-pair' : 'full-rig');
              }}
              title="Frame full studio room model"
              className={`px-2 py-1 text-[11px] font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${cardBtnIdle}`}
            >
              Full
            </button>

            <button
              type="button"
              data-testid="plan-camera-button"
              onClick={() => {
                onChangeCameraMotion('manual');
                onFocusCamera('floor-plan');
              }}
              title="Top-down floor plan & clearance view"
              className={`px-2 py-1 text-[11px] font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${cardBtnIdle}`}
            >
              Plan
            </button>

            <button
              type="button"
              data-testid="orbit-camera-button"
              onClick={() => onChangeCameraMotion(cameraMotion === 'orbit' ? 'manual' : 'orbit')}
              aria-pressed={cameraMotion === 'orbit'}
              title="360° Interior Studio Orbit"
              className={`px-2 py-1 text-[11px] font-medium rounded-md border inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                cameraMotion === 'orbit' ? accentToggleActive : cardBtnIdle
              }`}
            >
              <Orbit className="w-3 h-3" aria-hidden="true" />
              <span>Orbit</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeCameraMotion(cameraMotion === 'crane' ? 'manual' : 'crane')}
              aria-pressed={cameraMotion === 'crane'}
              title="Hero Ascending Crane Sweep"
              className={`px-2 py-1 text-[11px] font-medium rounded-md border inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                cameraMotion === 'crane' ? accentToggleActive : cardBtnIdle
              }`}
            >
              <Video className="w-3 h-3" aria-hidden="true" />
              <span>Crane</span>
            </button>

            <button
              type="button"
              onClick={onToggleSound}
              aria-label={soundEnabled ? 'Mute audio' : 'Enable audio'}
              title={soundEnabled ? 'Audio On' : 'Audio Off'}
              className={`p-1 rounded-md border transition-colors shrink-0 ${cardBtnIdle}`}
            >
              {soundEnabled ? (
                <Volume2 className={`w-3.5 h-3.5 ${isNeon ? 'text-cyan-300' : 'text-amber-500'}`} />
              ) : (
                <VolumeX className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              type="button"
              onClick={onToggleCollapse}
              aria-expanded={true}
              aria-label="Hide controls"
              title="Hide Controls (H)"
              className={`p-1 rounded-md border transition-colors shrink-0 ${cardBtnIdle}`}
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Desktop Compact Body Area */}
        <div className="px-3 py-2">
          {activeTab === 'configure' && compareMode && (
            <div className="space-y-2" data-testid="compare-controls">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-semibold uppercase tracking-wide w-12 shrink-0 ${mutedText}`}>
                    Left A
                  </span>
                  <div className="grid grid-cols-4 gap-1.5 flex-1">
                    {FINISH_ORDER.map((fid) => {
                      const spec = POLE_FINISHES[fid];
                      const selected = activePole.finish === fid;
                      return (
                        <button
                          key={`left-${fid}`}
                          type="button"
                          onClick={() => onChangeActivePole({ finish: fid })}
                          aria-pressed={selected}
                          className={`flex items-center gap-1.5 px-1.5 py-1 rounded-lg border text-left transition-colors min-w-0 ${
                            selected ? cardBtnActive : cardBtnIdle
                          }`}
                        >
                          <img
                            src={materialAvatars[fid]}
                            alt=""
                            aria-hidden="true"
                            className="w-6 h-6 rounded-full object-cover shrink-0 ring-1 ring-white/20"
                          />
                          <span className="text-[11px] font-semibold truncate">{spec.shortName.split(' ')[0]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-semibold uppercase tracking-wide w-12 shrink-0 ${mutedText}`}>
                    Right B
                  </span>
                  <div className="grid grid-cols-4 gap-1.5 flex-1">
                    {FINISH_ORDER.map((fid) => {
                      const spec = POLE_FINISHES[fid];
                      const selected = compareFinish === fid;
                      return (
                        <button
                          key={`right-${fid}`}
                          type="button"
                          onClick={() => onChangeCompareFinish(fid)}
                          aria-pressed={selected}
                          className={`flex items-center gap-1.5 px-1.5 py-1 rounded-lg border text-left transition-colors min-w-0 ${
                            selected ? cardBtnActive : cardBtnIdle
                          }`}
                        >
                          <img
                            src={materialAvatars[fid]}
                            alt=""
                            aria-hidden="true"
                            className="w-6 h-6 rounded-full object-cover shrink-0 ring-1 ring-white/20"
                          />
                          <span className="text-[11px] font-semibold truncate">{spec.shortName.split(' ')[0]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className={`flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t ${dividerClass}`}>
                <div
                  className={`flex items-center gap-0.5 p-0.5 rounded-lg ${segBg}`}
                  role="group"
                  aria-label="Lighting Manager"
                  data-testid="lighting-manager"
                >
                  {LIGHTING_PRESETS.map((preset) => {
                    const active = config.lighting === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => onChangeConfig({ lighting: preset.id })}
                        aria-pressed={active}
                        title={preset.label}
                        className={`px-2 py-1 rounded-md text-[11px] font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                          active ? segActive : segIdle
                        }`}
                      >
                        <LightingIcon preset={preset.id} />
                        <span>{preset.shortLabel}</span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => onChangeActivePole({ isSpinning: !activePole.isSpinning })}
                  aria-pressed={activePole.isSpinning}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border whitespace-nowrap transition-colors ${
                    activePole.isSpinning ? accentToggleActive : cardBtnIdle
                  }`}
                >
                  {activePole.isSpinning ? 'Spin Both' : 'Static Both'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'configure' && !compareMode && (
            <div className="space-y-2">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <div
                    className="grid grid-cols-4 gap-1.5 flex-1 min-w-0"
                    role="group"
                    aria-label="Pole finish options"
                  >
                    {FINISH_ORDER.map((fid) => {
                      const spec = POLE_FINISHES[fid];
                      const selected = activePole.finish === fid;
                      return (
                        <button
                          key={fid}
                          type="button"
                          onClick={() => onChangeActivePole({ finish: fid })}
                          aria-pressed={selected}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-left transition-colors min-w-0 ${
                            selected ? cardBtnActive : cardBtnIdle
                          }`}
                        >
                          <img
                            src={materialAvatars[fid]}
                            alt=""
                            aria-hidden="true"
                            className={`w-6.5 h-6.5 rounded-full object-cover shrink-0 ring-1 ${
                              selected
                                ? isNeon
                                  ? 'ring-cyan-400'
                                  : 'ring-amber-500'
                                : isDark
                                  ? 'ring-white/20'
                                  : 'ring-black/15'
                            }`}
                          />
                          <span className="min-w-0">
                            <span className="block text-[11px] font-semibold leading-tight whitespace-nowrap">
                              {spec.shortName}
                            </span>
                            <span className={`block font-mono text-[10px] tabular-nums leading-tight ${mutedText}`}>
                              ${spec.basePriceUsd}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {poles.length > 1 && (
                    <button
                      type="button"
                      data-testid="apply-finish-all-button"
                      onClick={() => onApplyFinishToAll(activePole.finish)}
                      title={`Apply ${POLE_FINISHES[activePole.finish].shortName} to all ${poles.length} poles`}
                      className={`px-2 py-1.5 text-[10px] font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${cardBtnIdle}`}
                    >
                      Apply to All
                    </button>
                  )}
                </div>

                <div
                  className={`flex items-center gap-0.5 p-0.5 rounded-lg shrink-0 ${segBg}`}
                  role="group"
                  aria-label="Lighting Manager"
                  data-testid="lighting-manager"
                >
                  {LIGHTING_PRESETS.map((preset) => {
                    const active = config.lighting === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => onChangeConfig({ lighting: preset.id })}
                        aria-pressed={active}
                        title={preset.label}
                        className={`px-2 py-1.5 rounded-md text-[11px] font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                          active ? segActive : segIdle
                        }`}
                      >
                        <LightingIcon preset={preset.id} />
                        <span>{preset.shortLabel}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={`flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t ${dividerClass}`}>
                <div className="flex items-center gap-1" role="group" aria-label="Studio poles">
                  {poles.map((p, idx) => {
                    const isSel = p.id === activePole.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onSelectPole(p.id)}
                        aria-pressed={isSel}
                        title={`${p.label}: ${(p.heightCm / 100).toFixed(2)}m · ${p.diameterMm}mm · ${POLE_FINISHES[p.finish].shortName}`}
                        className={`px-2 py-1 text-[11px] font-semibold rounded-md border inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                          isSel ? cardBtnActive : cardBtnIdle
                        }`}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: POLE_FINISHES[p.finish].swatchHex }}
                          aria-hidden="true"
                        />
                        <span>P{idx + 1}</span>
                        {poles.length > 1 && (
                          <span className={`font-mono text-[10px] tabular-nums ${mutedText}`}>
                            {(p.heightCm / 100).toFixed(1)}m
                          </span>
                        )}
                      </button>
                    );
                  })}

                  {poles.length < MAX_POLES_IN_STUDIO && (
                    <button
                      type="button"
                      onClick={onAddPole}
                      data-testid="add-pole-button"
                      title="Add another independently configurable pole"
                      className={`px-2 py-1 text-[11px] font-semibold rounded-md border inline-flex items-center gap-1 transition-colors whitespace-nowrap ${cardBtnIdle}`}
                    >
                      <Plus className="w-3 h-3" aria-hidden="true" />
                      <span>Pole</span>
                    </button>
                  )}

                  {poles.length > 1 && (
                    <button
                      type="button"
                      onClick={onRemoveActivePole}
                      aria-label={`Remove ${activePole.label}`}
                      title={`Remove ${activePole.label}`}
                      className={`p-1 rounded-md border transition-colors ${cardBtnIdle} hover:text-rose-400`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div
                  className={`flex items-center gap-0.5 p-0.5 rounded-md ${segBg}`}
                  role="group"
                  aria-label="Room mount type"
                >
                  {MOUNT_ORDER.map((mid) => {
                    const m = BASE_MOUNTS[mid];
                    const selected = config.mount === mid;
                    return (
                      <button
                        key={mid}
                        type="button"
                        data-testid={`mount-${mid}-button`}
                        onClick={() => onChangeConfig({ mount: mid })}
                        aria-pressed={selected}
                        title={m.name}
                        className={`px-2 py-1 text-[11px] font-medium rounded-xs transition-colors whitespace-nowrap ${
                          selected ? segActive : segIdle
                        }`}
                      >
                        {mid === 'permanent-ceiling' ? 'Fixed' : m.shortName}
                      </button>
                    );
                  })}
                </div>

                {/* Per-Pole Individual Height Slider (Max 3.00m) */}
                <div className="flex items-center gap-1.5 flex-1 min-w-[140px] max-w-[205px]">
                  <label
                    htmlFor="pole-height-slider"
                    className={`text-[11px] font-medium whitespace-nowrap ${mutedText}`}
                    title={`Individual height for ${activePole.label} (max 3.00m)`}
                  >
                    {activePoleTag} H
                  </label>
                  <input
                    id="pole-height-slider"
                    data-testid="pole-height-slider"
                    type="range"
                    min={MIN_POLE_HEIGHT_CM}
                    max={maxActivePoleCm}
                    step={1}
                    value={activePole.heightCm}
                    onChange={(e) => onChangeActivePole({ heightCm: Number(e.target.value) })}
                    className="axis-slider flex-1 min-w-[44px]"
                  />
                  <span className="font-mono text-[11px] font-semibold tabular-nums w-10 text-right shrink-0">
                    {(activePole.heightCm / 100).toFixed(2)}m
                  </span>
                </div>

                {/* Per-Pole Cushion Placement (Top vs Below) */}
                <div
                  className="flex items-center gap-1.5 shrink-0"
                  role="group"
                  aria-label={`${activePole.label} cushion placement`}
                  data-testid="cushion-controls"
                >
                  <span
                    className={`text-[11px] font-medium whitespace-nowrap ${
                      hasCushion
                        ? isNeon
                          ? 'text-cyan-300 font-semibold'
                          : isPulse
                            ? 'text-emerald-300 font-semibold'
                            : isSunset
                              ? 'text-orange-300 font-semibold'
                              : isDark
                                ? 'text-amber-300 font-semibold'
                                : 'text-amber-800 font-semibold'
                        : mutedText
                    }`}
                    title={
                      hasCushion
                        ? `Bridges ${(activeCushionCm / 100).toFixed(2)}m gap between ${activePole.label} and ${(config.ceilingHeightCm / 100).toFixed(2)}m ceiling`
                        : 'Engages automatically when ceiling exceeds pole height or 3.00m max'
                    }
                  >
                    Cushion{hasCushion ? ` ${(activeCushionCm / 100).toFixed(2)}m` : ''}
                  </span>
                  <div className={`flex items-center gap-0.5 p-0.5 rounded-md ${segBg}`}>
                    <button
                      type="button"
                      data-testid="cushion-top-button"
                      onClick={() => onChangeActivePole({ cushionPlacement: 'top' })}
                      aria-pressed={activePole.cushionPlacement === 'top'}
                      title="Place height cushion at top (against ceiling)"
                      className={`px-2 py-0.5 text-[11px] font-medium rounded-xs transition-colors whitespace-nowrap ${
                        activePole.cushionPlacement === 'top' ? segActive : segIdle
                      }`}
                    >
                      Top
                    </button>
                    <button
                      type="button"
                      data-testid="cushion-below-button"
                      onClick={() => onChangeActivePole({ cushionPlacement: 'below' })}
                      aria-pressed={activePole.cushionPlacement === 'below'}
                      title="Place height cushion below pole (under floor base)"
                      className={`px-2 py-0.5 text-[11px] font-medium rounded-xs transition-colors whitespace-nowrap ${
                        activePole.cushionPlacement === 'below' ? segActive : segIdle
                      }`}
                    >
                      Below
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <div className={`flex items-center gap-0.5 p-0.5 rounded-md ${segBg}`} role="group" aria-label="Pole width diameter">
                    {DIAMETER_OPTIONS.map((d) => (
                      <button
                        key={d.mm}
                        type="button"
                        onClick={() => onChangeActivePole({ diameterMm: d.mm })}
                        aria-pressed={activePole.diameterMm === d.mm}
                        className={`px-1.5 py-0.5 text-[11px] font-mono font-medium rounded-xs whitespace-nowrap ${
                          activePole.diameterMm === d.mm ? segActive : segIdle
                        }`}
                      >
                        {d.mm}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => onChangeActivePole({ isSpinning: !activePole.isSpinning })}
                    aria-pressed={activePole.isSpinning}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border whitespace-nowrap shrink-0 transition-colors ${
                      activePole.isSpinning ? accentToggleActive : cardBtnIdle
                    }`}
                  >
                    {activePole.isSpinning ? 'Spin' : 'Static'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'assembly' && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    data-testid="install-playback-button"
                    onClick={() => {
                      if (playbackMode === 'assemble') {
                        onStartPlayback('idle');
                      } else {
                        if (assemblyProgress >= 0.98) onChangeAssemblyProgress(0);
                        onStartPlayback('assemble');
                      }
                    }}
                    className={`px-3 py-1.5 text-[11px] font-bold rounded-md inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${primaryActionBtn}`}
                  >
                    {playbackMode === 'assemble' ? (
                      <>
                        <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Pause Install</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Install Pole</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    data-testid="dismantle-playback-button"
                    onClick={() => {
                      if (playbackMode === 'dismantle') {
                        onStartPlayback('idle');
                      } else {
                        if (assemblyProgress <= 0.05) onChangeAssemblyProgress(1);
                        onStartPlayback('dismantle');
                      }
                    }}
                    className={`px-3 py-1.5 text-[11px] font-bold rounded-md border inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                      playbackMode === 'dismantle' ? accentToggleActive : cardBtnIdle
                    }`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{playbackMode === 'dismantle' ? 'Stop Dismantle' : 'Dismantle'}</span>
                  </button>

                  <div className="flex items-center gap-0.5 ml-1">
                    <button
                      type="button"
                      onClick={() => jumpToStep(activeStepIdx - 1)}
                      aria-label="Previous assembly step"
                      className={`p-1.5 rounded-md border ${cardBtnIdle}`}
                    >
                      <StepBack className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => jumpToStep(activeStepIdx + 1)}
                      aria-label="Next assembly step"
                      className={`p-1.5 rounded-md border ${cardBtnIdle}`}
                    >
                      <StepForward className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Quick Hardware Joint Camera Focus + Explode + Torque Guide */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className={`hidden lg:flex items-center gap-0.5 p-0.5 rounded-md ${segBg}`}>
                    {(
                      [
                        ['base-hub', 'Base'],
                        ['x-joint', 'X-Joint'],
                        ['top-mount', 'Top'],
                      ] as const
                    ).map(([presetId, label]) => (
                      <button
                        key={presetId}
                        type="button"
                        onClick={() => {
                          onChangeCameraMotion('manual');
                          onFocusCamera(presetId);
                        }}
                        className={`px-2 py-1 text-[10px] font-semibold rounded-xs transition-colors whitespace-nowrap ${segIdle}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <label htmlFor="exploded-slider" className={`text-[11px] font-medium whitespace-nowrap ${mutedText}`}>
                      Explode
                    </label>
                    <input
                      id="exploded-slider"
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(explodedFactor * 100)}
                      onChange={(e) => onChangeExplodedFactor(Number(e.target.value) / 100)}
                      className="axis-slider w-20 shrink-0"
                    />
                    <span className="font-mono text-[10px] font-semibold tabular-nums w-7 text-right shrink-0">
                      {Math.round(explodedFactor * 100)}%
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={onToggleHighlightFasteners}
                    aria-pressed={highlightFasteners}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border whitespace-nowrap shrink-0 transition-colors ${
                      highlightFasteners ? accentToggleActive : cardBtnIdle
                    }`}
                  >
                    Torque
                  </button>
                </div>
              </div>

              {/* 7-Step Named Hardware Installation & Dismantle Rail */}
              <div className="grid grid-cols-7 gap-1" role="group" aria-label="Assembly steps">
                {ASSEMBLY_STEPS.map((st, idx) => {
                  const isCurrent = idx === activeStepIdx;
                  const isDone = assemblyProgress >= (idx + 1) / ASSEMBLY_STEPS.length;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => jumpToStep(idx)}
                      title={`0${st.step} ${st.title} (${st.torqueNm > 0 ? `${st.torqueNm} N·m` : 'Seat'})`}
                      aria-label={`Step ${st.step}: ${st.shortTitle}`}
                      aria-pressed={isCurrent}
                      className={`px-1.5 py-1 rounded-md border text-left transition-colors min-w-0 ${
                        isCurrent
                          ? cardBtnActive
                          : isDone
                            ? isDark
                              ? 'border-white/20 bg-white/8 text-zinc-200'
                              : 'border-stone-400 bg-stone-200/80 text-stone-900'
                            : cardBtnIdle
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 font-mono text-[10px] font-bold tabular-nums">
                        <span>0{st.step}</span>
                        <span className={`text-[9px] font-medium ${mutedText}`}>
                          {st.torqueNm > 0 ? `${st.torqueNm}Nm` : 'Seat'}
                        </span>
                      </div>
                      <span className="block text-[10px] font-semibold truncate leading-tight">
                        {st.shortTitle}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'space' && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className={`flex items-center gap-0.5 p-0.5 rounded-md ${segBg}`}>
                {(
                  [
                    ...(hasRoomReplica ? ([['replica', 'My Room']] as [EnvironmentPreset, string][]) : []),
                    ['studio', 'Studio'],
                    ['home', 'Home'],
                  ] as [EnvironmentPreset, string][]
                ).map(([envId, label]) => (
                  <button
                    key={envId}
                    type="button"
                    data-testid={`env-${envId}-button`}
                    onClick={() => onChangeConfig({ environment: envId })}
                    aria-pressed={config.environment === envId}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-xs transition-colors whitespace-nowrap ${
                      config.environment === envId ? segActive : segIdle
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {hasRoomReplica && config.environment === 'replica' && (
                <button
                  type="button"
                  data-testid="toggle-inferred-objects"
                  onClick={onToggleInferredObjects}
                  aria-pressed={showInferredObjects}
                  title="Show or hide AI-estimated unseen room areas"
                  className={`px-2 py-1 text-[11px] font-semibold rounded-md border whitespace-nowrap transition-colors ${
                    showInferredObjects ? accentToggleActive : cardBtnIdle
                  }`}
                >
                  Unseen: {showInferredObjects ? 'On' : 'Off'}
                </button>
              )}

              <div className="flex items-center gap-1.5 flex-1 min-w-[125px] max-w-[195px]">
                <label htmlFor="room-width-slider" className={`text-[11px] font-medium ${mutedText}`}>
                  Width
                </label>
                <input
                  id="room-width-slider"
                  type="range"
                  min={minRoomSizeM}
                  max={MAX_ROOM_SIZE_M}
                  step={0.1}
                  value={config.roomWidthM}
                  onChange={(e) => onChangeConfig({ roomWidthM: Number(e.target.value) })}
                  className="axis-slider flex-1"
                />
                <span className="font-mono text-[11px] font-semibold tabular-nums w-9 text-right">
                  {config.roomWidthM.toFixed(1)}m
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-1 min-w-[125px] max-w-[195px]">
                <label htmlFor="room-depth-slider" className={`text-[11px] font-medium ${mutedText}`}>
                  Depth
                </label>
                <input
                  id="room-depth-slider"
                  type="range"
                  min={minRoomSizeM}
                  max={MAX_ROOM_SIZE_M}
                  step={0.1}
                  value={config.roomDepthM}
                  onChange={(e) => onChangeConfig({ roomDepthM: Number(e.target.value) })}
                  className="axis-slider flex-1"
                />
                <span className="font-mono text-[11px] font-semibold tabular-nums w-9 text-right">
                  {config.roomDepthM.toFixed(1)}m
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  data-testid="min-clearance-toggle"
                  onClick={() =>
                    onChangeConfig({ enforceMinClearance: !config.enforceMinClearance })
                  }
                  aria-pressed={config.enforceMinClearance}
                  title="Toggle 1.25m minimum radius requirement (turn off for compact office testing)"
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border inline-flex items-center gap-1 whitespace-nowrap transition-colors ${
                    config.enforceMinClearance
                      ? accentToggleActive
                      : 'border-amber-400/75 bg-amber-500/18 text-amber-300'
                  }`}
                >
                  {config.enforceMinClearance ? (
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <ShieldOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  )}
                  <span>1.25m Min: {config.enforceMinClearance ? 'On' : 'Off'}</span>
                </button>
                <button
                  type="button"
                  onClick={onCenterActivePole}
                  className={`px-2 py-1 text-[11px] font-medium rounded-md border whitespace-nowrap transition-colors ${cardBtnIdle}`}
                >
                  Center Pole
                </button>
                <button
                  type="button"
                  onClick={() => onChangeConfig({ showClearanceRing: !config.showClearanceRing })}
                  aria-pressed={config.showClearanceRing}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border whitespace-nowrap transition-colors ${
                    config.showClearanceRing ? accentToggleActive : cardBtnIdle
                  }`}
                >
                  Floor Ring
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
