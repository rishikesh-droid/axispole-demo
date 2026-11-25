import { useMemo } from 'react';
import {
  Columns2,
  Crosshair,
  Grid2x2,
  Lamp,
  Maximize2,
  Minimize2,
  Move,
  Orbit,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  ShieldOff,
  SlidersHorizontal,
  Sparkles,
  StepBack,
  StepForward,
  Sun,
  Sunset,
  Trash2,
  Video,
  Volume2,
  VolumeX,
  X,
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
  ReplicaRenderMode,
  SidebarDensity,
  ViewportMode,
} from '../types/pole';
import {
  ASSEMBLY_STEPS,
  BASE_MOUNTS,
  DIAMETER_OPTIONS,
  formatHeightMetricAndImperial,
  getCushionHeightCm,
  getMinRoomSizeM,
  isDarkLighting,
  LIGHTING_PRESETS,
  MAX_CEILING_HEIGHT_CM,
  MAX_POLE_HEIGHT_CM,
  MAX_ROOM_SIZE_M,
  MIN_CEILING_HEIGHT_CM,
  MIN_POLE_HEIGHT_CM,
  POLE_FINISHES,
} from '../utils/poleConfig';
import { getPoleMaterialAvatars } from '../utils/materialThumbnails';

interface ControlSidebarProps {
  config: PoleRigConfig;
  poles: PoleInstance[];
  activePole: PoleInstance;
  canAddPole: boolean;
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
  viewportMode: ViewportMode;
  onChangeViewportMode: (mode: ViewportMode) => void;
  sidebarDensity: SidebarDensity;
  onChangeSidebarDensity: (density: SidebarDensity) => void;
  dockCollapsed: boolean;
  onToggleCollapse: () => void;
  mobileDrawerOpen: boolean;
  onSetMobileDrawerOpen: (open: boolean) => void;
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
  hasDepthMeshReplica: boolean;
  showInferredObjects: boolean;
  onToggleInferredObjects: () => void;
  replicaRenderMode: ReplicaRenderMode;
  onChangeReplicaRenderMode: (mode: ReplicaRenderMode) => void;
  showReplicaDimensions: boolean;
  onToggleReplicaDimensions: () => void;
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

export function ControlSidebar({
  config,
  poles,
  activePole,
  canAddPole,
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
  viewportMode,
  onChangeViewportMode,
  sidebarDensity,
  onChangeSidebarDensity,
  dockCollapsed,
  onToggleCollapse,
  mobileDrawerOpen,
  onSetMobileDrawerOpen,
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
  hasDepthMeshReplica,
  showInferredObjects,
  onToggleInferredObjects,
  replicaRenderMode,
  onChangeReplicaRenderMode,
  showReplicaDimensions,
  onToggleReplicaDimensions,
}: ControlSidebarProps) {
  const materialAvatars = useMemo(() => getPoleMaterialAvatars(), []);

  if (arCameraActive) return null;

  const isMinimal = sidebarDensity === 'minimal';
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
  const activeCushionCm = getCushionHeightCm(
    config.ceilingHeightCm,
    activePole.heightCm,
    activePole.cushionPlacement
  );
  const hasCushion = activeCushionCm > 0;
  const floorAreaSqM = config.roomWidthM * config.roomDepthM;
  const floorAreaSqFt = Math.round(floorAreaSqM * 10.7639);

  const activeStepIdx = Math.min(
    ASSEMBLY_STEPS.length - 1,
    Math.floor(
      assemblyProgress >= 0.999 ? ASSEMBLY_STEPS.length - 1 : assemblyProgress * ASSEMBLY_STEPS.length
    )
  );

  const jumpToStep = (stepZeroIdx: number) => {
    const clamped = Math.max(0, Math.min(ASSEMBLY_STEPS.length - 1, stepZeroIdx));
    onChangeViewportMode('3d');
    onStartPlayback('idle');
    const targetProgress = (clamped + 0.65) / ASSEMBLY_STEPS.length;
    onChangeAssemblyProgress(Math.min(1, targetProgress));
    onFocusCamera(ASSEMBLY_STEPS[clamped].cameraFocus);
  };

  // Studio-adaptive sidebar tokens
  const sidebarSurface = isNeon
    ? 'bg-[#10121c] border-violet-400/20 text-zinc-100'
    : isSunset
      ? 'bg-[#191115] border-rose-400/22 text-rose-50'
      : isPulse
        ? 'bg-[#0c1419] border-emerald-400/22 text-emerald-50'
        : isDark
          ? 'bg-[#151311] border-amber-500/20 text-stone-100'
          : 'bg-[#faf9f6] border-stone-300/90 text-stone-900';

  const floatingSurface = isNeon
    ? 'bg-[#11131d]/95 border-violet-400/25 text-zinc-100 shadow-lg'
    : isSunset
      ? 'bg-[#1c1317]/95 border-rose-400/28 text-rose-50 shadow-lg'
      : isPulse
        ? 'bg-[#0e161b]/95 border-emerald-400/28 text-emerald-50 shadow-lg'
        : isDark
          ? 'bg-[#161412]/95 border-amber-500/25 text-stone-100 shadow-lg'
          : 'bg-[#faf9f6]/96 border-stone-300/90 text-stone-900 shadow-md';

  const dividerClass =
    isNeon || isSunset || isPulse
      ? 'border-white/10'
      : isDark
        ? 'border-stone-800'
        : 'border-stone-200';

  const segBg = isNeon
    ? 'bg-[#090b12]'
    : isSunset
      ? 'bg-[#120b0f]'
      : isPulse
        ? 'bg-[#070f13]'
        : isDark
          ? 'bg-stone-900'
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
  const sectionLabelClass = `text-[11px] font-semibold tracking-tight ${
    isDark ? 'text-zinc-200' : 'text-stone-800'
  }`;

  const cardBtnIdle = isNeon
    ? 'border-white/10 bg-[#171a27] text-zinc-200 hover:border-violet-400/40'
    : isSunset
      ? 'border-white/10 bg-[#24171d] text-rose-100 hover:border-rose-400/40'
      : isPulse
        ? 'border-white/10 bg-[#121f26] text-emerald-50 hover:border-emerald-400/40'
        : isDark
          ? 'border-stone-700/80 bg-stone-900/85 text-stone-200 hover:border-amber-500/40'
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

  const accentText = isNeon
    ? 'text-cyan-300'
    : isSunset
      ? 'text-orange-300'
      : isPulse
        ? 'text-emerald-300'
        : isDark
          ? 'text-amber-300'
          : 'text-amber-800';

  const renderCeilingControls = (idPrefix: string) => (
    <div className={isMinimal ? 'space-y-2' : 'space-y-2.5'}>
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={`${idPrefix}-ceiling-height-slider`}
          className={isMinimal ? `text-[11px] font-medium ${mutedText}` : sectionLabelClass}
        >
          {isMinimal ? 'Ceiling' : 'Ceiling Height'}
        </label>
        <span className="font-mono text-[11px] font-semibold tabular-nums">
          {isMinimal
            ? `${(config.ceilingHeightCm / 100).toFixed(2)}m`
            : formatHeightMetricAndImperial(config.ceilingHeightCm)}
        </span>
      </div>
      <input
        id={`${idPrefix}-ceiling-height-slider`}
        data-testid={idPrefix === 'cfg' ? 'ceiling-height-slider' : `${idPrefix}-ceiling-height-slider`}
        type="range"
        min={MIN_CEILING_HEIGHT_CM}
        max={MAX_CEILING_HEIGHT_CM}
        step={1}
        value={config.ceilingHeightCm}
        onChange={(e) => onChangeConfig({ ceilingHeightCm: Number(e.target.value) })}
        className="axis-slider w-full"
      />

      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] font-medium ${mutedText}`}>Ceiling Type</span>
        <div
          className={`flex items-center gap-0.5 p-0.5 rounded-lg ${segBg}`}
          role="group"
          aria-label="Room ceiling type"
        >
          {CEILING_TYPE_OPTIONS.map((opt) => (
            <button
              key={`${idPrefix}-${opt.id}`}
              type="button"
              data-testid={idPrefix === 'cfg' ? `ceiling-${opt.id}-button` : undefined}
              onClick={() => onChangeConfig({ ceilingType: opt.id })}
              aria-pressed={config.ceilingType === opt.id}
              title={opt.title}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                config.ceilingType === opt.id ? segActive : segIdle
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {config.ceilingType === 'vaulted' && (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor={`${idPrefix}-vault-angle-slider`}
              className={`text-[11px] font-medium ${mutedText}`}
            >
              Roof Pitch
            </label>
            <span className="font-mono text-[11px] font-semibold tabular-nums">
              {config.vaultAngleDeg}°
            </span>
          </div>
          <input
            id={`${idPrefix}-vault-angle-slider`}
            data-testid={idPrefix === 'cfg' ? 'vault-angle-slider' : undefined}
            type="range"
            min={6}
            max={28}
            step={1}
            value={config.vaultAngleDeg}
            onChange={(e) => onChangeConfig({ vaultAngleDeg: Number(e.target.value) })}
            className="axis-slider w-full"
          />
        </div>
      )}
    </div>
  );

  const renderLightingControls = () => (
    <div className={isMinimal ? 'space-y-1.5' : 'space-y-2'}>
      <div className="flex items-center justify-between">
        <span className={isMinimal ? `text-[11px] font-medium ${mutedText}` : sectionLabelClass}>
          {isMinimal ? 'Lighting' : 'Studio Lighting'}
        </span>
        {!isMinimal && (
          <span className={`text-[11px] ${mutedText}`}>
            {LIGHTING_PRESETS.find((l) => l.id === config.lighting)?.shortLabel}
          </span>
        )}
      </div>
      <div
        className={`grid gap-1 p-1 rounded-lg ${segBg} ${isMinimal ? 'grid-cols-5' : 'grid-cols-3'}`}
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
              className={`rounded-md font-medium transition-colors whitespace-nowrap ${
                isMinimal
                  ? 'py-1.5 px-0.5 text-[10px] flex flex-col items-center justify-center gap-0.5'
                  : 'py-1.5 px-2 text-[11px] inline-flex items-center justify-center gap-1.5'
              } ${active ? segActive : segIdle}`}
            >
              <LightingIcon preset={preset.id} />
              <span>{isMinimal ? preset.mobileLabel : preset.shortLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const sidebarContent = (
    <div className="flex flex-col h-full min-h-0">
      {/* Sticky Sidebar Header: Style Toggle (Full / Minimal) + Tabs + Quick Actions */}
      <div className={`shrink-0 border-b ${dividerClass} ${isMinimal ? 'p-2.5 space-y-2' : 'p-3.5 space-y-2.5'}`}>
        {/* Top Row: Full / Minimal Style Selector + Sound + Collapse/Close */}
        <div className="flex items-center justify-between gap-1.5">
          <div
            role="group"
            aria-label="Sidebar style"
            data-testid="sidebar-density-toggle"
            className={`inline-flex items-center gap-0.5 p-0.5 rounded-lg ${segBg}`}
          >
            <button
              type="button"
              data-testid="sidebar-style-full"
              aria-pressed={!isMinimal}
              onClick={() => onChangeSidebarDensity('full')}
              title="Full detailed sidebar"
              className={`px-2 py-1 text-[11px] font-semibold rounded-md inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                !isMinimal ? segActive : segIdle
              }`}
            >
              <Maximize2 className="w-3 h-3" aria-hidden="true" />
              <span>Full</span>
            </button>
            <button
              type="button"
              data-testid="sidebar-style-minimal"
              aria-pressed={isMinimal}
              onClick={() => onChangeSidebarDensity('minimal')}
              title="Minimal compact sidebar"
              className={`px-2 py-1 text-[11px] font-semibold rounded-md inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                isMinimal ? segActive : segIdle
              }`}
            >
              <Minimize2 className="w-3 h-3" aria-hidden="true" />
              <span>Minimal</span>
            </button>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onToggleSound}
              aria-label={soundEnabled ? 'Mute audio' : 'Enable audio'}
              title={soundEnabled ? 'Audio On' : 'Audio Off'}
              className={`min-h-[28px] min-w-[28px] p-1 rounded-lg border flex items-center justify-center transition-colors ${cardBtnIdle}`}
            >
              {soundEnabled ? (
                <Volume2 className={`w-3.5 h-3.5 ${isNeon ? 'text-cyan-300' : 'text-amber-500'}`} />
              ) : (
                <VolumeX className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Desktop Collapse Button */}
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-expanded={true}
              aria-label="Hide sidebar"
              title="Hide Sidebar (H)"
              data-testid="sidebar-collapse-button"
              className={`hidden md:flex min-h-[28px] min-w-[28px] p-1 rounded-lg border items-center justify-center transition-colors ${cardBtnIdle}`}
            >
              <PanelRightClose className="w-3.5 h-3.5" aria-hidden="true" />
            </button>

            {/* Mobile Close Drawer Button */}
            <button
              type="button"
              onClick={() => onSetMobileDrawerOpen(false)}
              aria-label="Close controls drawer"
              className={`md:hidden min-h-[28px] min-w-[28px] p-1 rounded-lg border flex items-center justify-center transition-colors ${cardBtnIdle}`}
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs: Configure | Assembly | Space */}
        <div
          role="tablist"
          aria-label="Configuration sections"
          className={`grid grid-cols-3 gap-0.5 p-1 rounded-lg ${segBg}`}
        >
          {(
            [
              ['configure', isMinimal ? 'Pole' : 'Configure'],
              ['assembly', isMinimal ? 'Build' : 'Assembly'],
              ['space', isMinimal ? 'Room' : 'Space'],
            ] as [DockTabId, string][]
          ).map(([tabId, label]) => (
            <button
              key={tabId}
              role="tab"
              type="button"
              aria-selected={activeTab === tabId}
              data-testid={`sidebar-tab-${tabId}`}
              onClick={() => onChangeTab(tabId)}
              className={`py-1.5 px-1.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeTab === tabId ? segActive : segIdle
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Persistent Quick Mode & Camera Strip (2 crisp symmetrical rows — zero text clipping) */}
        <div className="space-y-1">
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => {
                onChangeViewportMode('3d');
                onToggleCompareMode();
              }}
              aria-pressed={compareMode}
              data-testid="compare-mode-toggle"
              title="Compare two finishes side-by-side"
              className={`py-1.5 px-2 text-[11px] font-semibold rounded-lg border inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                compareMode ? accentToggleActive : cardBtnIdle
              }`}
            >
              <Columns2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Compare</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (viewportMode === 'floor-plan') {
                  onChangeViewportMode('3d');
                  if (!moveMode) onToggleMoveMode();
                } else {
                  onToggleMoveMode();
                }
              }}
              aria-pressed={moveMode && !compareMode && viewportMode === '3d'}
              disabled={compareMode}
              data-testid="move-mode-toggle"
              title={
                viewportMode === 'floor-plan'
                  ? 'Switch to 3D Move mode (or drag directly on the Floor Plan)'
                  : 'Drag poles on the 3D floor'
              }
              className={`py-1.5 px-2 text-[11px] font-semibold rounded-lg border inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                compareMode
                  ? 'opacity-40 cursor-not-allowed ' + cardBtnIdle
                  : moveMode && viewportMode === '3d'
                    ? accentToggleActive
                    : cardBtnIdle
              }`}
            >
              <Move className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{isMinimal ? 'Move' : 'Move Pole'}</span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1">
            <button
              type="button"
              data-testid="full-camera-button"
              onClick={() => {
                onChangeViewportMode('3d');
                onChangeCameraMotion('manual');
                onFocusCamera(compareMode ? 'compare-pair' : 'full-rig');
              }}
              title="Reset 3D camera to full room"
              className={`py-1 px-1.5 text-[10.5px] font-medium rounded-lg border inline-flex items-center justify-center gap-1 transition-colors whitespace-nowrap ${cardBtnIdle}`}
            >
              <span>Full Cam</span>
            </button>

            <button
              type="button"
              data-testid="orbit-camera-button"
              onClick={() => {
                onChangeViewportMode('3d');
                onChangeCameraMotion(cameraMotion === 'orbit' ? 'manual' : 'orbit');
              }}
              aria-pressed={cameraMotion === 'orbit' && viewportMode === '3d'}
              title="360° Interior Studio Orbit"
              className={`py-1 px-1.5 text-[10.5px] font-medium rounded-lg border inline-flex items-center justify-center gap-1 transition-colors whitespace-nowrap ${
                cameraMotion === 'orbit' && viewportMode === '3d' ? accentToggleActive : cardBtnIdle
              }`}
            >
              <Orbit className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span>Orbit</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onChangeViewportMode('3d');
                onChangeCameraMotion(cameraMotion === 'crane' ? 'manual' : 'crane');
              }}
              aria-pressed={cameraMotion === 'crane' && viewportMode === '3d'}
              title="Hero Ascending Crane Sweep"
              className={`py-1 px-1.5 text-[10.5px] font-medium rounded-lg border inline-flex items-center justify-center gap-1 transition-colors whitespace-nowrap ${
                cameraMotion === 'crane' && viewportMode === '3d' ? accentToggleActive : cardBtnIdle
              }`}
            >
              <Video className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span>Crane</span>
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable Sidebar Body */}
      <div
        className={`flex-1 min-h-0 overflow-y-auto ${
          isMinimal ? 'p-2.5 space-y-3.5' : 'p-3.5 space-y-4'
        }`}
      >
        {/* ==================== CONFIGURE TAB (COMPARE MODE) ==================== */}
        {activeTab === 'configure' && compareMode && (
          <div className="space-y-4" data-testid="compare-controls">
            <div className="space-y-2">
              <span className={sectionLabelClass}>Left Pole A</span>
              <div className={`grid gap-1.5 ${isMinimal ? 'grid-cols-4' : 'grid-cols-2'}`}>
                {FINISH_ORDER.map((fid) => {
                  const spec = POLE_FINISHES[fid];
                  const selected = activePole.finish === fid;
                  return (
                    <button
                      key={`left-${fid}`}
                      type="button"
                      onClick={() => onChangeActivePole({ finish: fid })}
                      aria-pressed={selected}
                      title={`Left ${spec.shortName}`}
                      className={`rounded-lg border transition-colors ${
                        isMinimal
                          ? 'p-1.5 flex flex-col items-center gap-1'
                          : 'px-2.5 py-2 flex items-center gap-2 text-left'
                      } ${selected ? cardBtnActive : cardBtnIdle}`}
                    >
                      <img
                        src={materialAvatars[fid]}
                        alt=""
                        aria-hidden="true"
                        className="w-6 h-6 rounded-full object-cover shrink-0 ring-1 ring-white/20"
                      />
                      {!isMinimal && (
                        <span className="text-[11px] font-semibold truncate">{spec.shortName}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={`pt-3 border-t space-y-2 ${dividerClass}`}>
              <span className={sectionLabelClass}>Right Pole B</span>
              <div className={`grid gap-1.5 ${isMinimal ? 'grid-cols-4' : 'grid-cols-2'}`}>
                {FINISH_ORDER.map((fid) => {
                  const spec = POLE_FINISHES[fid];
                  const selected = compareFinish === fid;
                  return (
                    <button
                      key={`right-${fid}`}
                      type="button"
                      onClick={() => onChangeCompareFinish(fid)}
                      aria-pressed={selected}
                      title={`Right ${spec.shortName}`}
                      className={`rounded-lg border transition-colors ${
                        isMinimal
                          ? 'p-1.5 flex flex-col items-center gap-1'
                          : 'px-2.5 py-2 flex items-center gap-2 text-left'
                      } ${selected ? cardBtnActive : cardBtnIdle}`}
                    >
                      <img
                        src={materialAvatars[fid]}
                        alt=""
                        aria-hidden="true"
                        className="w-6 h-6 rounded-full object-cover shrink-0 ring-1 ring-white/20"
                      />
                      {!isMinimal && (
                        <span className="text-[11px] font-semibold truncate">{spec.shortName}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={`pt-3 border-t flex items-center justify-between gap-2 ${dividerClass}`}>
              <span className={`text-[11px] font-medium ${mutedText}`}>Rotation</span>
              <button
                type="button"
                onClick={() => onChangeActivePole({ isSpinning: !activePole.isSpinning })}
                aria-pressed={activePole.isSpinning}
                className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg border whitespace-nowrap transition-colors ${
                  activePole.isSpinning ? accentToggleActive : cardBtnIdle
                }`}
              >
                {activePole.isSpinning ? 'Spin Both' : 'Static Both'}
              </button>
            </div>

            <div className={`pt-3 border-t ${dividerClass}`}>
              {renderCeilingControls('cfg')}
            </div>

            <div className={`pt-3 border-t ${dividerClass}`}>{renderLightingControls()}</div>
          </div>
        )}

        {/* ==================== CONFIGURE TAB (STANDARD MODE) ==================== */}
        {activeTab === 'configure' && !compareMode && (
          <div className={isMinimal ? 'space-y-3.5' : 'space-y-4'}>
            {/* Studio Poles Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className={isMinimal ? `text-[11px] font-medium ${mutedText}` : sectionLabelClass}>
                  {isMinimal ? 'Poles' : 'Studio Poles'}
                </span>
                <span className={`font-mono text-[10px] tabular-nums ${mutedText}`}>
                  {poles.length} {poles.length === 1 ? 'pole' : 'poles'}
                  {!canAddPole ? ' · full' : ''}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Studio poles">
                {poles.map((p, idx) => {
                  const isSel = p.id === activePole.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onSelectPole(p.id)}
                      aria-pressed={isSel}
                      title={`${p.label}: ${(p.heightCm / 100).toFixed(2)}m · ${p.diameterMm}mm · ${POLE_FINISHES[p.finish].shortName}`}
                      className={`px-2 py-1 text-[11px] font-semibold rounded-lg border inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                        isSel ? cardBtnActive : cardBtnIdle
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: POLE_FINISHES[p.finish].swatchHex }}
                        aria-hidden="true"
                      />
                      <span>P{idx + 1}</span>
                      {!isMinimal && poles.length > 1 && (
                        <span className={`font-mono text-[10px] tabular-nums ${mutedText}`}>
                          {(p.heightCm / 100).toFixed(1)}m
                        </span>
                      )}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={onAddPole}
                  disabled={!canAddPole}
                  data-testid="add-pole-button"
                  title={
                    canAddPole
                      ? 'Add another independently configurable pole'
                      : config.enforceMinClearance
                        ? 'No 1.25m clearance space left — enlarge room or move poles'
                        : 'Room is at capacity'
                  }
                  className={`px-2 py-1 text-[11px] font-semibold rounded-lg border inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                    canAddPole ? cardBtnIdle : `opacity-45 ${cardBtnIdle}`
                  }`}
                >
                  <Plus className="w-3 h-3" aria-hidden="true" />
                  <span>{canAddPole ? (isMinimal ? 'Add' : 'Add Pole') : 'Full'}</span>
                </button>

                {poles.length > 1 && (
                  <button
                    type="button"
                    onClick={onRemoveActivePole}
                    aria-label={`Remove ${activePole.label}`}
                    title={`Remove ${activePole.label}`}
                    className={`p-1.5 rounded-lg border transition-colors ${cardBtnIdle} hover:text-rose-400`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Pole Finish Selector */}
            <div className={`pt-3 border-t space-y-2 ${dividerClass}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={isMinimal ? `text-[11px] font-medium ${mutedText}` : sectionLabelClass}>
                  {isMinimal ? 'Finish' : `Finish · ${activePole.label}`}
                </span>
                {poles.length > 1 && (
                  <button
                    type="button"
                    data-testid="apply-finish-all-button"
                    onClick={() => onApplyFinishToAll(activePole.finish)}
                    title={`Apply ${POLE_FINISHES[activePole.finish].shortName} to all ${poles.length} poles`}
                    className={`px-2 py-0.5 text-[10px] font-semibold rounded-md border transition-colors whitespace-nowrap ${cardBtnIdle}`}
                  >
                    {isMinimal ? 'All' : 'Apply to All'}
                  </button>
                )}
              </div>

              <div
                className={`grid gap-1.5 ${isMinimal ? 'grid-cols-4' : 'grid-cols-2'}`}
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
                      title={`${spec.name} ($${spec.basePriceUsd})`}
                      className={`rounded-lg border transition-colors min-w-0 ${
                        isMinimal
                          ? 'py-1.5 px-1 flex flex-col items-center justify-center gap-1'
                          : 'px-2.5 py-2 flex items-center gap-2 text-left'
                      } ${selected ? cardBtnActive : cardBtnIdle}`}
                    >
                      <img
                        src={materialAvatars[fid]}
                        alt=""
                        aria-hidden="true"
                        className={`rounded-full object-cover shrink-0 ring-1 ${
                          isMinimal ? 'w-6 h-6' : 'w-7 h-7'
                        } ${
                          selected
                            ? isNeon
                              ? 'ring-cyan-400'
                              : 'ring-amber-500'
                            : isDark
                              ? 'ring-white/20'
                              : 'ring-black/15'
                        }`}
                      />
                      {isMinimal ? (
                        <span className="text-[9.5px] font-semibold leading-none whitespace-nowrap">
                          {fid === 'powder-black'
                            ? 'Black'
                            : fid === 'stainless'
                              ? 'Steel'
                              : fid === 'silicone'
                                ? 'Silicone'
                                : 'Brass'}
                        </span>
                      ) : (
                        <span className="min-w-0">
                          <span className="block text-[11px] font-semibold leading-tight truncate">
                            {spec.shortName}
                          </span>
                          <span className={`block font-mono text-[10px] tabular-nums leading-tight ${mutedText}`}>
                            ${spec.basePriceUsd}
                          </span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Hardware Spec: Mount, Pole Height, Cushion, Diameter, Spin */}
            <div className={`pt-3 border-t space-y-3 ${dividerClass}`}>
              {!isMinimal && <span className={`block ${sectionLabelClass}`}>Hardware &amp; Fit</span>}

              {/* Mount Type */}
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[11px] font-medium ${mutedText}`}>Mount</span>
                <div
                  className={`flex items-center gap-0.5 p-0.5 rounded-lg ${segBg}`}
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
                        className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                          selected ? segActive : segIdle
                        }`}
                      >
                        {mid === 'permanent-ceiling' ? 'Fixed' : m.shortName}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Per-Pole Height Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="pole-height-slider"
                    className={`text-[11px] font-medium ${mutedText}`}
                    title={`Individual height for ${activePole.label} (max 3.00m)`}
                  >
                    {activePoleTag} Height
                  </label>
                  <span className="font-mono text-[11px] font-semibold tabular-nums">
                    {(activePole.heightCm / 100).toFixed(2)}m
                  </span>
                </div>
                <input
                  id="pole-height-slider"
                  data-testid="pole-height-slider"
                  type="range"
                  min={MIN_POLE_HEIGHT_CM}
                  max={maxActivePoleCm}
                  step={1}
                  value={activePole.heightCm}
                  onChange={(e) => onChangeActivePole({ heightCm: Number(e.target.value) })}
                  className="axis-slider w-full"
                />
              </div>

              {/* Automatic Difference-Height Cushion Placement (Top / Below) whenever pole < ceiling */}
              {hasCushion && (
                <div
                  className="flex items-center justify-between gap-2"
                  role="group"
                  aria-label={`${activePole.label} cushion placement`}
                  data-testid="cushion-controls"
                >
                  <span
                    className={`text-[11px] font-semibold truncate ${accentText}`}
                    title={`Automatically bridges ${(activeCushionCm / 100).toFixed(2)}m difference between ${(activePole.heightCm / 100).toFixed(2)}m pole and ${(config.ceilingHeightCm / 100).toFixed(2)}m ceiling`}
                  >
                    Cushion +{(activeCushionCm / 100).toFixed(2)}m
                  </span>
                  <div className={`flex items-center gap-0.5 p-0.5 rounded-lg shrink-0 ${segBg}`}>
                    <button
                      type="button"
                      data-testid="cushion-top-button"
                      onClick={() => onChangeActivePole({ cushionPlacement: 'top' })}
                      aria-pressed={activePole.cushionPlacement === 'top'}
                      className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
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
                      className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                        activePole.cushionPlacement === 'below' ? segActive : segIdle
                      }`}
                    >
                      Below
                    </button>
                  </div>
                </div>
              )}

              {/* Diameter + Spin/Static */}
              <div className="flex items-center justify-between gap-2">
                <div
                  className={`flex items-center gap-0.5 p-0.5 rounded-lg ${segBg}`}
                  role="group"
                  aria-label="Pole width diameter"
                >
                  {DIAMETER_OPTIONS.map((d) => (
                    <button
                      key={d.mm}
                      type="button"
                      onClick={() => onChangeActivePole({ diameterMm: d.mm })}
                      aria-pressed={activePole.diameterMm === d.mm}
                      className={`px-2 py-1 text-[11px] font-mono font-medium rounded-md whitespace-nowrap ${
                        activePole.diameterMm === d.mm ? segActive : segIdle
                      }`}
                    >
                      {d.mm}
                      {!isMinimal && <span className="text-[9px] opacity-70">mm</span>}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => onChangeActivePole({ isSpinning: !activePole.isSpinning })}
                  aria-pressed={activePole.isSpinning}
                  className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border whitespace-nowrap shrink-0 transition-colors ${
                    activePole.isSpinning ? accentToggleActive : cardBtnIdle
                  }`}
                >
                  {activePole.isSpinning ? 'Spin' : 'Static'}
                </button>
              </div>
            </div>

            {/* Room Ceiling Section */}
            <div className={`pt-3 border-t ${dividerClass}`}>
              {renderCeilingControls('cfg')}
            </div>

            {/* Studio Lighting Section */}
            <div className={`pt-3 border-t ${dividerClass}`}>{renderLightingControls()}</div>
          </div>
        )}

        {/* ==================== ASSEMBLY TAB ==================== */}
        {activeTab === 'assembly' && (
          <div className={isMinimal ? 'space-y-3' : 'space-y-4'}>
            {/* Primary Install / Dismantle Controls */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  data-testid="install-playback-button"
                  onClick={() => {
                    onChangeViewportMode('3d');
                    if (playbackMode === 'assemble') {
                      onStartPlayback('idle');
                    } else {
                      if (assemblyProgress >= 0.98) onChangeAssemblyProgress(0);
                      onStartPlayback('assemble');
                    }
                  }}
                  className={`py-2 px-2.5 text-[11px] font-bold rounded-lg inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${primaryActionBtn}`}
                >
                  {playbackMode === 'assemble' ? (
                    <>
                      <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{isMinimal ? 'Install' : 'Install Pole'}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  data-testid="dismantle-playback-button"
                  onClick={() => {
                    onChangeViewportMode('3d');
                    if (playbackMode === 'dismantle') {
                      onStartPlayback('idle');
                    } else {
                      if (assemblyProgress <= 0.05) onChangeAssemblyProgress(1);
                      onStartPlayback('dismantle');
                    }
                  }}
                  className={`py-2 px-2.5 text-[11px] font-bold rounded-lg border inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
                    playbackMode === 'dismantle' ? accentToggleActive : cardBtnIdle
                  }`}
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{playbackMode === 'dismantle' ? 'Stop' : 'Dismantle'}</span>
                </button>
              </div>

              {/* Prev/Next Step + Torque Highlight */}
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => jumpToStep(activeStepIdx - 1)}
                    aria-label="Previous assembly step"
                    className={`p-1.5 rounded-lg border ${cardBtnIdle}`}
                  >
                    <StepBack className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpToStep(activeStepIdx + 1)}
                    aria-label="Next assembly step"
                    className={`p-1.5 rounded-lg border ${cardBtnIdle}`}
                  >
                    <StepForward className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={onToggleHighlightFasteners}
                  aria-pressed={highlightFasteners}
                  className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border whitespace-nowrap transition-colors ${
                    highlightFasteners ? accentToggleActive : cardBtnIdle
                  }`}
                >
                  {isMinimal ? 'Torque' : 'Highlight Torque'}
                </button>
              </div>
            </div>

            {/* Exploded View Slider */}
            <div className={`pt-3 border-t space-y-1.5 ${dividerClass}`}>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="exploded-slider" className={`text-[11px] font-medium ${mutedText}`}>
                  Exploded View
                </label>
                <span className="font-mono text-[11px] font-semibold tabular-nums">
                  {Math.round(explodedFactor * 100)}%
                </span>
              </div>
              <input
                id="exploded-slider"
                type="range"
                min={0}
                max={100}
                value={Math.round(explodedFactor * 100)}
                onChange={(e) => {
                  onChangeViewportMode('3d');
                  onChangeExplodedFactor(Number(e.target.value) / 100);
                }}
                className="axis-slider w-full"
              />
            </div>

            {/* Quick Hardware Joint Camera Focus */}
            <div className={`pt-3 border-t space-y-1.5 ${dividerClass}`}>
              <span className={`block text-[11px] font-medium ${mutedText}`}>Focus Hardware</span>
              <div className={`grid grid-cols-3 gap-1 p-0.5 rounded-lg ${segBg}`}>
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
                      onChangeViewportMode('3d');
                      onChangeCameraMotion('manual');
                      onFocusCamera(presetId);
                    }}
                    className={`py-1.5 px-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap ${segIdle}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* 7-Step Named Hardware Sequence */}
            <div className={`pt-3 border-t space-y-2 ${dividerClass}`}>
              <div className="flex items-center justify-between">
                <span className={isMinimal ? `text-[11px] font-medium ${mutedText}` : sectionLabelClass}>
                  Assembly Sequence
                </span>
                <span className={`font-mono text-[10px] tabular-nums ${mutedText}`}>
                  0{activeStepIdx + 1}/0{ASSEMBLY_STEPS.length}
                </span>
              </div>

              <div
                className={isMinimal ? 'grid grid-cols-4 gap-1' : 'space-y-1.5'}
                role="group"
                aria-label="Assembly steps"
              >
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
                      className={`rounded-lg border transition-colors min-w-0 ${
                        isMinimal
                          ? 'py-1.5 px-1 text-center font-mono text-[10px] font-bold tabular-nums'
                          : 'w-full px-2.5 py-2 flex items-center justify-between gap-2 text-left'
                      } ${
                        isCurrent
                          ? cardBtnActive
                          : isDone
                            ? isDark
                              ? 'border-white/20 bg-white/8 text-zinc-200'
                              : 'border-stone-400 bg-stone-200/70 text-stone-900'
                            : cardBtnIdle
                      }`}
                    >
                      {isMinimal ? (
                        <span>0{st.step}</span>
                      ) : (
                        <>
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="font-mono text-[10px] font-bold tabular-nums opacity-75 shrink-0">
                              0{st.step}
                            </span>
                            <span className="text-[11px] font-semibold truncate">
                              {st.shortTitle}
                            </span>
                          </span>
                          <span className={`font-mono text-[10px] tabular-nums shrink-0 ${mutedText}`}>
                            {st.torqueNm > 0 ? `${st.torqueNm} Nm` : 'Seat'}
                          </span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ==================== SPACE / ROOM TAB ==================== */}
        {activeTab === 'space' && (
          <div className={isMinimal ? 'space-y-3.5' : 'space-y-4'}>
            {/* Environment Preset */}
            <div className="space-y-2">
              <span className={isMinimal ? `text-[11px] font-medium ${mutedText}` : sectionLabelClass}>
                Environment
              </span>
              <div className={`grid gap-0.5 p-1 rounded-lg ${segBg} ${hasRoomReplica ? 'grid-cols-3' : 'grid-cols-2'}`}>
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
                    className={`py-1.5 px-2 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap ${
                      config.environment === envId ? segActive : segIdle
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {hasRoomReplica && config.environment === 'replica' && hasDepthMeshReplica && (
                <div className="space-y-1.5 pt-1">
                  <div className={`grid grid-cols-3 gap-0.5 p-1 rounded-lg ${segBg}`}>
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
                        data-testid={`sidebar-replica-mode-${modeId}`}
                        onClick={() => onChangeReplicaRenderMode(modeId)}
                        aria-pressed={replicaRenderMode === modeId}
                        className={`py-1 px-1.5 text-[10px] font-semibold rounded-md transition-colors whitespace-nowrap ${
                          replicaRenderMode === modeId ? segActive : segIdle
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      data-testid="sidebar-toggle-dimensions"
                      onClick={onToggleReplicaDimensions}
                      aria-pressed={showReplicaDimensions}
                      className={`py-1.5 px-2 text-[11px] font-semibold rounded-lg border whitespace-nowrap transition-colors ${
                        showReplicaDimensions ? accentToggleActive : cardBtnIdle
                      }`}
                    >
                      3D Dims: {showReplicaDimensions ? 'On' : 'Off'}
                    </button>
                    <button
                      type="button"
                      data-testid="sidebar-match-camera"
                      onClick={() => onFocusCamera('replica-match')}
                      className={`py-1.5 px-2 text-[11px] font-semibold rounded-lg border whitespace-nowrap transition-colors ${cardBtnIdle}`}
                    >
                      Match Photo
                    </button>
                  </div>
                </div>
              )}

              {hasRoomReplica && config.environment === 'replica' && !hasDepthMeshReplica && (
                <button
                  type="button"
                  data-testid="toggle-inferred-objects"
                  onClick={onToggleInferredObjects}
                  aria-pressed={showInferredObjects}
                  title="Show or hide AI-estimated unseen room areas"
                  className={`w-full py-1.5 px-2.5 text-[11px] font-semibold rounded-lg border whitespace-nowrap transition-colors ${
                    showInferredObjects ? accentToggleActive : cardBtnIdle
                  }`}
                >
                  Unseen Objects: {showInferredObjects ? 'On' : 'Off'}
                </button>
              )}
            </div>

            {/* Room Dimensions (Width, Depth, Area) */}
            <div className={`pt-3 border-t space-y-3 ${dividerClass}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={isMinimal ? `text-[11px] font-medium ${mutedText}` : sectionLabelClass}>
                  Room Dimensions
                </span>
                {!isMinimal && (
                  <span className={`font-mono text-[11px] font-semibold tabular-nums ${mutedText}`}>
                    {floorAreaSqM.toFixed(1)} m² · {floorAreaSqFt} ft²
                  </span>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="room-width-slider" className={`text-[11px] font-medium ${mutedText}`}>
                    Width
                  </label>
                  <span className="font-mono text-[11px] font-semibold tabular-nums">
                    {config.roomWidthM.toFixed(1)} m
                  </span>
                </div>
                <input
                  id="room-width-slider"
                  type="range"
                  min={minRoomSizeM}
                  max={MAX_ROOM_SIZE_M}
                  step={0.1}
                  value={config.roomWidthM}
                  onChange={(e) => onChangeConfig({ roomWidthM: Number(e.target.value) })}
                  className="axis-slider w-full"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="room-depth-slider" className={`text-[11px] font-medium ${mutedText}`}>
                    Depth
                  </label>
                  <span className="font-mono text-[11px] font-semibold tabular-nums">
                    {config.roomDepthM.toFixed(1)} m
                  </span>
                </div>
                <input
                  id="room-depth-slider"
                  type="range"
                  min={minRoomSizeM}
                  max={MAX_ROOM_SIZE_M}
                  step={0.1}
                  value={config.roomDepthM}
                  onChange={(e) => onChangeConfig({ roomDepthM: Number(e.target.value) })}
                  className="axis-slider w-full"
                />
              </div>
            </div>

            {/* Ceiling Controls inside Space tab as well */}
            <div className={`pt-3 border-t ${dividerClass}`}>
              {renderCeilingControls('space')}
            </div>

            {/* Safety Clearance & Placement Controls */}
            <div className={`pt-3 border-t space-y-2 ${dividerClass}`}>
              {!isMinimal && <span className={`block ${sectionLabelClass}`}>Clearance &amp; Placement</span>}

              <button
                type="button"
                data-testid="min-clearance-toggle"
                onClick={() =>
                  onChangeConfig({ enforceMinClearance: !config.enforceMinClearance })
                }
                aria-pressed={config.enforceMinClearance}
                title="Toggle 1.25m minimum radius requirement (turn off for compact office testing)"
                className={`w-full py-2 px-2.5 text-[11px] font-semibold rounded-lg border inline-flex items-center justify-between gap-1.5 whitespace-nowrap transition-colors ${
                  config.enforceMinClearance
                    ? accentToggleActive
                    : 'border-amber-400/75 bg-amber-500/18 text-amber-300'
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  {config.enforceMinClearance ? (
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <ShieldOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  )}
                  <span>1.25m Min Clearance</span>
                </span>
                <span className="font-mono text-[10px]">
                  {config.enforceMinClearance ? 'ON' : 'OFF'}
                </span>
              </button>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={onCenterActivePole}
                  className={`py-1.5 px-2 text-[11px] font-semibold rounded-lg border inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors ${cardBtnIdle}`}
                >
                  <Crosshair className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Center Pole</span>
                </button>

                <button
                  type="button"
                  onClick={() => onChangeConfig({ showClearanceRing: !config.showClearanceRing })}
                  aria-pressed={config.showClearanceRing}
                  className={`py-1.5 px-2 text-[11px] font-semibold rounded-lg border whitespace-nowrap transition-colors ${
                    config.showClearanceRing ? accentToggleActive : cardBtnIdle
                  }`}
                >
                  Floor Ring
                </button>
              </div>

              <button
                type="button"
                onClick={() => onChangeViewportMode(viewportMode === 'floor-plan' ? '3d' : 'floor-plan')}
                className={`w-full py-2 px-2.5 text-[11px] font-semibold rounded-lg border inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
                  viewportMode === 'floor-plan' ? accentToggleActive : cardBtnIdle
                }`}
              >
                <Grid2x2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {viewportMode === 'floor-plan' ? 'Back to 3D Studio' : 'Open 2D Floor Plan'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* ===================== DESKTOP COLLAPSED REOPEN HANDLE (md+) ===================== */}
      {dockCollapsed && (
        <div className="hidden md:flex fixed top-1/2 -translate-y-1/2 right-3 z-30 flex-col gap-2">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-expanded={false}
            data-testid="sidebar-expand-button"
            title="Open Settings Sidebar (H)"
            className={`px-2.5 py-3 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1.5 transition-colors ${floatingSurface}`}
          >
            <PanelRightOpen className="w-4 h-4" aria-hidden="true" />
            <span className="[writing-mode:vertical-rl] rotate-180 text-[11px] tracking-wide">
              Controls
            </span>
          </button>
        </div>
      )}

      {/* ===================== DESKTOP DOCKED RIGHT SIDEBAR (md+) ===================== */}
      {!dockCollapsed && (
        <aside
          aria-label="3D Rig Configuration Sidebar"
          data-testid="control-sidebar"
          data-density={sidebarDensity}
          className={`hidden md:flex flex-col shrink-0 h-full border-l transition-colors duration-150 z-20 ${sidebarSurface} ${
            isMinimal ? 'w-[228px]' : 'w-[340px]'
          }`}
        >
          {sidebarContent}
        </aside>
      )}

      {/* ===================== MOBILE FLOATING TRIGGER (< md) ===================== */}
      {!mobileDrawerOpen && (
        <div className="md:hidden fixed bottom-3 right-3 z-30 flex items-center">
          <button
            type="button"
            onClick={() => onSetMobileDrawerOpen(true)}
            aria-expanded={false}
            data-testid="mobile-sidebar-open"
            className={`min-h-[40px] px-3.5 py-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${floatingSurface}`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Controls</span>
          </button>
        </div>
      )}

      {/* ===================== MOBILE RIGHT SLIDE-OVER SIDEBAR (< md) ===================== */}
      {mobileDrawerOpen && (
        <div
          className="md:hidden fixed inset-0 top-12 z-40 flex justify-end bg-black/45"
          onClick={() => onSetMobileDrawerOpen(false)}
        >
          <aside
            aria-label="Mobile Configuration Sidebar"
            data-testid="mobile-control-sidebar"
            onClick={(e) => e.stopPropagation()}
            className={`h-full border-l shadow-2xl ${sidebarSurface} ${
              isMinimal ? 'w-[236px]' : 'w-[min(328px,88vw)]'
            }`}
          >
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
