import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Box,
  Camera,
  CheckCircle2,
  ChevronDown,
  Columns2,
  Crosshair,
  Download,
  FileText,
  Lamp,
  Lock,
  LogIn,
  Move,
  Orbit,
  Package,
  Plus,
  Scan,
  Sparkles,
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
  HeightUnit,
  LightingPreset,
  ModalId,
  PoleFinishId,
  PoleInstance,
  PoleRigConfig,
  PriceTierId,
} from '../types/pole';
import {
  BASE_MOUNTS,
  DIAMETER_OPTIONS,
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
import {
  cmToFeetAndInches,
  exportXPoleQuoteToCSV,
  feetAndInchesToCm,
  formatFeetInches,
  formatUsdExact,
  getXPoleFinishLabel,
  resolveXPoleConfiguration,
  XPOLE_CATALOG,
  XPOLE_FINISH_ORDER,
  type XPoleQuoteSummary,
} from '../data/xpoleCatalog';

interface BottomControlDockProps {
  config: PoleRigConfig;
  poles: PoleInstance[];
  activePole: PoleInstance;
  quote: XPoleQuoteSummary;
  canAddPole: boolean;
  onSelectPole: (poleId: string) => void;
  onAddPole: () => void;
  onRemoveActivePole: () => void;
  onCenterActivePole: () => void;
  onChangeActivePole: (patch: Partial<PoleInstance>) => void;
  onApplyFinishToAll: (finish: PoleFinishId) => void;
  onChangeConfig: (patch: Partial<PoleRigConfig>) => void;
  activeTab: DockTabId;
  onChangeTab: (tab: DockTabId) => void;
  dockCollapsed: boolean;
  onToggleCollapse: () => void;
  onExpandDock: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  arCameraActive: boolean;
  onStartArCamera: () => void;
  onOpenRoomCapture: () => void;
  hasRoomReplica: boolean;
  onOpenModal: (modal: ModalId) => void;
  compareMode: boolean;
  onToggleCompareMode: () => void;
  moveMode: boolean;
  onToggleMoveMode: () => void;
  cameraMotion: CameraMotionMode;
  onChangeCameraMotion: (mode: CameraMotionMode) => void;
  onFocusCamera: (preset: CameraFocusId) => void;
  contextualStrip?: ReactNode;
}

const MOUNT_ORDER: BaseMountId[] = ['tension', 'permanent-ceiling'];
const TIER_ORDER: PriceTierId[] = ['retail', 'wholesale20', 'wholesale30'];

const CLEARANCE_OPTIONS: {
  id: string;
  label: string;
  radiusM: number;
  enforce: boolean;
}[] = [
  { id: '4ft', label: '4 ft (1.25 m) · Standard', radiusM: 1.25, enforce: true },
  { id: '5ft', label: '5 ft (1.52 m) · Comfort', radiusM: 1.52, enforce: true },
  { id: '6ft', label: '6 ft (1.83 m) · Studio Pro', radiusM: 1.83, enforce: true },
  { id: 'off', label: 'Compact (0.35 m · No Limit)', radiusM: 0.35, enforce: false },
];

function LightingIcon({ preset }: { preset: LightingPreset }) {
  if (preset === 'studio-daylight') return <Sun className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
  if (preset === 'mood-neon') return <Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
  if (preset === 'sunset-flow') return <Sunset className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
  if (preset === 'cyber-pulse') return <Zap className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
  return <Lamp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
}

export function BottomControlDock({
  config,
  poles,
  activePole,
  quote,
  canAddPole,
  onSelectPole,
  onAddPole,
  onRemoveActivePole,
  onCenterActivePole,
  onChangeActivePole,
  onApplyFinishToAll,
  onChangeConfig,
  activeTab,
  onChangeTab,
  dockCollapsed,
  onToggleCollapse,
  onExpandDock,
  soundEnabled,
  onToggleSound,
  arCameraActive,
  onStartArCamera,
  onOpenRoomCapture,
  hasRoomReplica,
  onOpenModal,
  compareMode,
  onToggleCompareMode,
  moveMode,
  onToggleMoveMode,
  cameraMotion,
  onChangeCameraMotion,
  onFocusCamera,
  contextualStrip,
}: BottomControlDockProps) {
  const materialAvatars = useMemo(() => getPoleMaterialAvatars(), []);
  const [viewedQuoteTier, setViewedQuoteTier] = useState<PriceTierId>('retail');
  const isWholesaleLockedView = viewedQuoteTier !== 'retail';

  const activeResolution = useMemo(
    () =>
      resolveXPoleConfiguration(
        activePole.heightCm * 10,
        activePole.finish,
        'retail'
      ),
    [activePole.heightCm, activePole.finish]
  );

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
  const activeCushionCm = getCushionHeightCm(
    config.ceilingHeightCm,
    activePole.heightCm,
    activePole.cushionPlacement
  );
  const hasCushion = activeCushionCm > 0;

  const roomWidthFt = Number((config.roomWidthM * 3.28084).toFixed(1));
  const roomLengthFt = Number((config.roomDepthM * 3.28084).toFixed(1));
  const floorAreaSqM = config.roomWidthM * config.roomDepthM;
  const floorAreaSqFt = Math.round(floorAreaSqM * 10.7639);
  const ceilingImperial = cmToFeetAndInches(config.ceilingHeightCm);
  const ceilingMm = Math.round(config.ceilingHeightCm * 10);

  const selectedClearanceId = !config.enforceMinClearance
    ? 'off'
    : config.clearanceRadiusM >= 1.7
      ? '6ft'
      : config.clearanceRadiusM >= 1.4
        ? '5ft'
        : '4ft';

  // Frosted Glass & X-POLE Brand Surface Tokens
  const dockShellGlass = isNeon
    ? 'bg-[#0c0f1b]/62 border-white/15 text-zinc-100 shadow-[0_22px_54px_rgba(0,0,0,0.52),inset_0_1px_0_rgba(255,255,255,0.14)]'
    : isSunset
      ? 'bg-[#1a1015]/64 border-rose-300/18 text-rose-50 shadow-[0_22px_54px_rgba(0,0,0,0.52),inset_0_1px_0_rgba(255,255,255,0.12)]'
      : isPulse
        ? 'bg-[#0a141a]/64 border-emerald-300/18 text-emerald-50 shadow-[0_22px_54px_rgba(0,0,0,0.52),inset_0_1px_0_rgba(255,255,255,0.12)]'
        : isDark
          ? 'bg-[#151311]/66 border-amber-300/18 text-stone-100 shadow-[0_22px_54px_rgba(0,0,0,0.52),inset_0_1px_0_rgba(255,255,255,0.12)]'
          : 'bg-white/68 border-stone-900/12 text-stone-900 shadow-[0_18px_46px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.88)]';

  const dividerClass = isDark ? 'border-white/10' : 'border-stone-900/10';
  const mutedText = isDark ? 'text-zinc-300/75' : 'text-stone-600';
  const labelText = `text-[11px] font-semibold tracking-tight ${isDark ? 'text-zinc-100' : 'text-stone-800'}`;

  const segTrack = isDark
    ? 'bg-black/30 border border-white/10'
    : 'bg-stone-900/[0.06] border border-stone-900/8';

  const tabActiveBg = isNeon
    ? 'bg-violet-600/80 border border-violet-300/40 shadow-[0_4px_14px_rgba(124,58,237,0.36),inset_0_1px_0_rgba(255,255,255,0.22)]'
    : isSunset
      ? 'bg-rose-500/80 border border-orange-300/40 shadow-[0_4px_14px_rgba(244,63,94,0.34)]'
      : isPulse
        ? 'bg-emerald-500/78 border border-emerald-200/40 shadow-[0_4px_14px_rgba(16,185,129,0.32)]'
        : isDark
          ? 'bg-amber-500/78 border border-amber-200/40 shadow-[0_4px_14px_rgba(245,158,11,0.3)]'
          : 'bg-violet-700/92 border border-violet-500/40 shadow-[0_4px_14px_rgba(109,40,217,0.26)]';

  const tabActiveText = isDark && !isNeon && !isSunset && !isPulse ? 'text-stone-950' : 'text-white';
  const segIdle = isDark ? 'text-zinc-300/85 hover:text-white' : 'text-stone-600 hover:text-stone-950';

  const segActive = isNeon
    ? 'bg-violet-500/45 text-white ring-1 ring-violet-300/50'
    : isSunset
      ? 'bg-rose-500/45 text-white ring-1 ring-orange-300/50'
      : isPulse
        ? 'bg-emerald-500/45 text-white ring-1 ring-emerald-300/50'
        : isDark
          ? 'bg-amber-500/35 text-amber-100 ring-1 ring-amber-300/50'
          : 'bg-white/95 text-violet-900 shadow-xs ring-1 ring-violet-600/20';

  const glassBtnIdle = isDark
    ? 'bg-white/[0.06] hover:bg-white/[0.14] border-white/12 text-zinc-100 backdrop-blur-md transition-all duration-150 active:scale-[0.97]'
    : 'bg-white/55 hover:bg-white/88 border-stone-900/12 text-stone-800 backdrop-blur-md transition-all duration-150 active:scale-[0.97]';

  const glassBtnActive = isNeon
    ? 'bg-violet-500/35 border-violet-300/60 text-white shadow-[0_2px_12px_rgba(124,58,237,0.28)] backdrop-blur-md transition-all duration-150 active:scale-[0.97]'
    : isSunset
      ? 'bg-rose-500/35 border-orange-300/65 text-white backdrop-blur-md transition-all duration-150 active:scale-[0.97]'
      : isPulse
        ? 'bg-emerald-500/32 border-emerald-300/65 text-white backdrop-blur-md transition-all duration-150 active:scale-[0.97]'
        : isDark
          ? 'bg-amber-500/30 border-amber-300/65 text-amber-100 backdrop-blur-md transition-all duration-150 active:scale-[0.97]'
          : 'bg-violet-700/14 border-violet-700/55 text-violet-950 backdrop-blur-md transition-all duration-150 active:scale-[0.97]';

  const subCardGlass = isDark
    ? 'bg-white/[0.05] border-white/10 backdrop-blur-md'
    : 'bg-white/58 border-stone-900/10 backdrop-blur-md';

  const inputGlass = isDark
    ? 'bg-black/32 border-white/14 text-zinc-100 focus:border-violet-400/80'
    : 'bg-white/75 border-stone-900/14 text-stone-900 focus:border-violet-600';

  const primaryCta = isDark
    ? 'bg-violet-600/85 hover:bg-violet-500/95 border border-violet-300/35 text-white shadow-[0_4px_16px_rgba(124,58,237,0.38),inset_0_1px_0_rgba(255,255,255,0.2)]'
    : 'bg-violet-700/92 hover:bg-violet-700 border border-violet-500/40 text-white shadow-[0_4px_16px_rgba(109,40,217,0.26),inset_0_1px_0_rgba(255,255,255,0.22)]';

  const accentText = isNeon
    ? 'text-violet-300'
    : isSunset
      ? 'text-orange-300'
      : isPulse
        ? 'text-emerald-300'
        : isDark
          ? 'text-amber-300'
          : 'text-violet-700';

  const handleDownloadCsv = () => {
    const csv = exportXPoleQuoteToCSV(quote);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xpole-build-a-pole-${config.priceTier}.csv`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const dockTabs: [DockTabId, number, string][] = [
    ['room', 1, 'Room'],
    ['pole', 2, 'Pole'],
    ['selection', 3, 'Quote'],
    ['scene', 4, 'Scene'],
  ];

  return (
    <div className="fixed bottom-2.5 sm:bottom-3 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-16px)] sm:w-[calc(100%-20px)] max-w-[1040px] flex flex-col items-center gap-2 pointer-events-none">
      {/* Contextual Floating Strip (Hardware Inspector / Install Demo / Compare / Move / My Room) */}
      {contextualStrip}

      {/* Main Fluid Center-Bottom Translucent Glass Dock */}
      <section
        aria-label="X-POLE Build a Pole Studio Dock"
        data-testid="bottom-control-dock"
        data-collapsed={dockCollapsed ? 'true' : 'false'}
        className={`pointer-events-auto rounded-2xl border backdrop-blur-2xl backdrop-saturate-150 dock-shell-spring ${
          dockCollapsed ? 'w-full sm:w-auto max-w-full' : 'w-full'
        } ${dockShellGlass}`}
      >
        {/* Dock Top Bar: Responsive Zero-Overflow Mobile & Desktop Layout */}
        <div
          className={`px-2 sm:px-3 py-1.5 flex gap-1.5 sm:gap-2 ${
            dockCollapsed
              ? 'flex-row items-center justify-between'
              : 'flex-col sm:flex-row sm:items-center sm:justify-between'
          }`}
        >
          {/* Left: Animated Step Tabs (clicking any tab when collapsed smoothly opens that tab) */}
          <div
            role="tablist"
            aria-label="X-POLE configurator sections"
            className={`${
              dockCollapsed
                ? 'inline-flex items-center gap-0.5 p-0.5 rounded-xl min-w-0'
                : 'grid grid-cols-4 sm:inline-flex items-center gap-0.5 p-0.5 rounded-xl w-full sm:w-auto shrink-0'
            } ${segTrack}`}
          >
            {dockTabs.map(([tabId, num, label]) => {
              const active = !dockCollapsed && activeTab === tabId;
              return (
                <button
                  key={tabId}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  data-testid={`dock-tab-${tabId}`}
                  onClick={() => {
                    onChangeTab(tabId);
                    if (dockCollapsed) onExpandDock();
                  }}
                  className={`${
                    dockCollapsed ? 'px-2 sm:px-3 py-1 sm:py-1.5 text-[10.5px] sm:text-[11px]' : 'px-1.5 sm:px-3 py-1.5 text-[11px] justify-center'
                  } font-semibold rounded-lg border inline-flex items-center gap-1 sm:gap-1.5 transition-all duration-200 whitespace-nowrap shrink-0 active:scale-[0.97] ${
                    active ? `${tabActiveBg} ${tabActiveText}` : `border-transparent ${segIdle}`
                  }`}
                >
                  <span
                    className={`${
                      dockCollapsed ? 'hidden sm:inline-flex' : 'inline-flex'
                    } w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full text-[9px] sm:text-[9.5px] font-mono font-bold items-center justify-center shrink-0 transition-colors ${
                      active
                        ? isDark && !isNeon && !isSunset && !isPulse
                          ? 'bg-stone-950/20 text-stone-950'
                          : 'bg-white/22 text-white'
                        : isDark
                          ? 'bg-white/10 text-zinc-300'
                          : 'bg-stone-900/10 text-stone-700'
                    }`}
                  >
                    {num}
                  </span>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {/* Mobile Row 2 / Desktop Center & Right Group */}
          <div
            className={`${
              dockCollapsed
                ? 'flex items-center gap-1 sm:gap-1.5 shrink-0'
                : 'flex sm:contents items-center justify-between gap-2'
            }`}
          >
            {/* Subtle inline active pole summary (mobile row 2 left + wide desktop center) */}
            {!dockCollapsed && (
              <div className={`flex sm:hidden lg:flex items-center gap-1.5 text-[10.5px] sm:text-[11px] font-mono tabular-nums truncate min-w-0 ${mutedText}`}>
                <span className="truncate">{POLE_FINISHES[activePole.finish].shortName}</span>
                <span aria-hidden="true">·</span>
                <span>{activePole.diameterMm}mm</span>
                <span aria-hidden="true">·</span>
                <span>{formatFeetInches(config.ceilingHeightCm)}</span>
                {poles.length > 1 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{poles.length}p</span>
                  </>
                )}
              </div>
            )}

            {/* Right: Utility Actions Moved into Dock (Capture Room, AR Measure, Export CAD, Audio, Collapse/Expand) */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onOpenRoomCapture}
                data-testid="dock-capture-room-button"
                title="Capture Your Room (4 Wall Photos -> 3D Wireframe)"
                aria-label="Capture Your Room"
                className={`min-h-[30px] sm:min-h-[32px] px-2 sm:px-2.5 py-1 rounded-xl border text-[11px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  config.environment === 'replica' && hasRoomReplica ? glassBtnActive : glassBtnIdle
                }`}
              >
                <Scan className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="hidden md:inline">Capture Room</span>
              </button>

              <button
                type="button"
                onClick={onStartArCamera}
                data-testid="dock-ar-button"
                title="Preview Pole Live in AR Camera"
                aria-label="AR Measure"
                className={`min-h-[30px] sm:min-h-[32px] px-2 sm:px-2.5 py-1 rounded-xl border text-[11px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${glassBtnIdle}`}
              >
                <Camera className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">AR Mode</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenModal('export-ar')}
                data-testid="dock-cad-button"
                title="Export 3D CAD (.GLB / .OBJ / .USDZ)"
                aria-label="Export CAD"
                className={`${
                  dockCollapsed ? 'hidden sm:inline-flex' : 'inline-flex'
                } min-h-[30px] sm:min-h-[32px] px-2 sm:px-2.5 py-1 rounded-xl border text-[11px] font-semibold items-center gap-1.5 whitespace-nowrap shrink-0 ${glassBtnIdle}`}
              >
                <Box className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="hidden lg:inline">Export CAD</span>
              </button>

              <button
                type="button"
                onClick={onToggleSound}
                aria-label={soundEnabled ? 'Mute audio' : 'Enable audio'}
                title={soundEnabled ? 'Audio On' : 'Audio Off'}
                className={`${
                  dockCollapsed ? 'hidden sm:flex' : 'flex'
                } min-h-[30px] sm:min-h-[32px] min-w-[30px] sm:min-w-[32px] p-1.5 rounded-xl border items-center justify-center shrink-0 ${glassBtnIdle}`}
              >
                {soundEnabled ? (
                  <Volume2 className={`w-3.5 h-3.5 ${accentText}`} />
                ) : (
                  <VolumeX className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={onToggleCollapse}
                aria-expanded={!dockCollapsed}
                aria-label={dockCollapsed ? 'Expand studio dock' : 'Collapse studio dock'}
                title={dockCollapsed ? 'Expand Dock (H)' : 'Collapse Dock (H)'}
                data-testid="dock-collapse-toggle"
                className={`min-h-[30px] sm:min-h-[32px] px-2 sm:px-2.5 py-1 rounded-xl border text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 ${
                  dockCollapsed ? glassBtnActive : glassBtnIdle
                }`}
              >
                <span
                  className={`inline-flex dock-chevron-spring ${dockCollapsed ? 'rotate-180' : 'rotate-0'}`}
                >
                  <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
                <span className="hidden sm:inline">{dockCollapsed ? 'Expand' : 'Hide'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Fluid Collapsible Dock Content Area (CSS grid-template-rows spring transition) */}
        <div
          aria-hidden={dockCollapsed}
          className={`grid dock-spring ${
            dockCollapsed
              ? 'grid-rows-[0fr] opacity-0 translate-y-2 pointer-events-none'
              : `grid-rows-[1fr] opacity-100 translate-y-0 border-t ${dividerClass}`
          }`}
        >
          <div className="overflow-hidden min-h-0">
            <div className="px-3 sm:px-4 py-2.5 sm:py-3 max-h-[36vh] sm:max-h-[40vh] overflow-y-auto dock-scroll">
              {/* ==================== TAB 1: ROOM SIZE ==================== */}
              {activeTab === 'room' && (
                <div
                  key="tab-room"
                  data-testid="step-room-panel"
                  className="grid grid-cols-1 md:grid-cols-3 gap-3.5 md:gap-4 animate-dock-panel"
                >
                      {/* Col 1: Floor Width & Length */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className={labelText}>Room Dimensions</span>
                          <span className={`font-mono text-[10.5px] tabular-nums ${mutedText}`}>
                            {floorAreaSqFt} sq ft · {floorAreaSqM.toFixed(1)} m²
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label htmlFor="room-width-input" className={`block text-[10.5px] ${mutedText}`}>
                              Width ({config.heightUnit === 'ft' ? 'ft' : 'm'})
                            </label>
                            <div className="relative">
                              <input
                                id="room-width-input"
                                data-testid="room-width-input"
                                type="number"
                                step={config.heightUnit === 'ft' ? 0.5 : 0.1}
                                min={
                                  config.heightUnit === 'ft'
                                    ? Number((minRoomSizeM * 3.28084).toFixed(1))
                                    : minRoomSizeM
                                }
                                max={
                                  config.heightUnit === 'ft'
                                    ? Number((MAX_ROOM_SIZE_M * 3.28084).toFixed(1))
                                    : MAX_ROOM_SIZE_M
                                }
                                value={config.heightUnit === 'ft' ? roomWidthFt : Number(config.roomWidthM.toFixed(1))}
                                onChange={(e) => {
                                  const raw = Number(e.target.value);
                                  if (!Number.isFinite(raw)) return;
                                  const meters = config.heightUnit === 'ft' ? raw / 3.28084 : raw;
                                  onChangeConfig({
                                    roomWidthM: Number(
                                      Math.max(minRoomSizeM, Math.min(MAX_ROOM_SIZE_M, meters)).toFixed(2)
                                    ),
                                  });
                                }}
                                className={`w-full rounded-lg border px-2.5 py-1.5 pr-7 font-mono text-xs font-semibold tabular-nums outline-none ${inputGlass}`}
                              />
                              <span className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] ${mutedText}`}>
                                {config.heightUnit === 'ft' ? 'ft' : 'm'}
                              </span>
                            </div>
                            <input
                              aria-label="Room width slider"
                              type="range"
                              min={Math.round(minRoomSizeM * 10)}
                              max={Math.round(MAX_ROOM_SIZE_M * 10)}
                              value={Math.round(config.roomWidthM * 10)}
                              onChange={(e) => onChangeConfig({ roomWidthM: Number(e.target.value) / 10 })}
                              className="axis-slider w-full"
                            />
                          </div>

                          <div className="space-y-1">
                            <label htmlFor="room-length-input" className={`block text-[10.5px] ${mutedText}`}>
                              Length ({config.heightUnit === 'ft' ? 'ft' : 'm'})
                            </label>
                            <div className="relative">
                              <input
                                id="room-length-input"
                                data-testid="room-length-input"
                                type="number"
                                step={config.heightUnit === 'ft' ? 0.5 : 0.1}
                                min={
                                  config.heightUnit === 'ft'
                                    ? Number((minRoomSizeM * 3.28084).toFixed(1))
                                    : minRoomSizeM
                                }
                                max={
                                  config.heightUnit === 'ft'
                                    ? Number((MAX_ROOM_SIZE_M * 3.28084).toFixed(1))
                                    : MAX_ROOM_SIZE_M
                                }
                                value={config.heightUnit === 'ft' ? roomLengthFt : Number(config.roomDepthM.toFixed(1))}
                                onChange={(e) => {
                                  const raw = Number(e.target.value);
                                  if (!Number.isFinite(raw)) return;
                                  const meters = config.heightUnit === 'ft' ? raw / 3.28084 : raw;
                                  onChangeConfig({
                                    roomDepthM: Number(
                                      Math.max(minRoomSizeM, Math.min(MAX_ROOM_SIZE_M, meters)).toFixed(2)
                                    ),
                                  });
                                }}
                                className={`w-full rounded-lg border px-2.5 py-1.5 pr-7 font-mono text-xs font-semibold tabular-nums outline-none ${inputGlass}`}
                              />
                              <span className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] ${mutedText}`}>
                                {config.heightUnit === 'ft' ? 'ft' : 'm'}
                              </span>
                            </div>
                            <input
                              aria-label="Room length slider"
                              type="range"
                              min={Math.round(minRoomSizeM * 10)}
                              max={Math.round(MAX_ROOM_SIZE_M * 10)}
                              value={Math.round(config.roomDepthM * 10)}
                              onChange={(e) => onChangeConfig({ roomDepthM: Number(e.target.value) / 10 })}
                              className="axis-slider w-full"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Col 2: Ceiling Height */}
                      <div className={`space-y-2 md:border-l md:pl-4 ${dividerClass}`}>
                        <div className="flex items-center justify-between gap-2">
                          <label htmlFor="ceiling-height-slider" className={labelText}>
                            Ceiling Height
                          </label>
                          <div
                            className={`inline-flex items-center gap-0.5 p-0.5 rounded-lg ${segTrack}`}
                            role="group"
                            aria-label="Height unit"
                          >
                            {(['ft', 'mm'] as HeightUnit[]).map((unit) => (
                              <button
                                key={unit}
                                type="button"
                                data-testid={`height-unit-${unit}`}
                                onClick={() => onChangeConfig({ heightUnit: unit })}
                                aria-pressed={config.heightUnit === unit}
                                className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded-md transition-colors ${
                                  config.heightUnit === unit ? segActive : segIdle
                                }`}
                              >
                                {unit}
                              </button>
                            ))}
                          </div>
                        </div>

                        {config.heightUnit === 'ft' ? (
                          <div className="grid grid-cols-2 gap-2">
                            <div className="relative">
                              <input
                                aria-label="Ceiling height feet"
                                data-testid="ceiling-feet-input"
                                type="number"
                                min={7}
                                max={14}
                                value={ceilingImperial.feet}
                                onChange={(e) => {
                                  const ft = Math.max(7, Math.min(14, Number(e.target.value) || 7));
                                  onChangeConfig({
                                    ceilingHeightCm: feetAndInchesToCm(ft, ceilingImperial.inches),
                                  });
                                }}
                                className={`w-full rounded-lg border px-2.5 py-1.5 pr-7 font-mono text-xs font-semibold tabular-nums outline-none ${inputGlass}`}
                              />
                              <span className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] ${mutedText}`}>
                                ft
                              </span>
                            </div>
                            <div className="relative">
                              <input
                                aria-label="Ceiling height inches"
                                data-testid="ceiling-inches-input"
                                type="number"
                                min={0}
                                max={11}
                                value={ceilingImperial.inches}
                                onChange={(e) => {
                                  const inc = Math.max(0, Math.min(11, Number(e.target.value) || 0));
                                  onChangeConfig({
                                    ceilingHeightCm: feetAndInchesToCm(ceilingImperial.feet, inc),
                                  });
                                }}
                                className={`w-full rounded-lg border px-2.5 py-1.5 pr-7 font-mono text-xs font-semibold tabular-nums outline-none ${inputGlass}`}
                              />
                              <span className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] ${mutedText}`}>
                                in
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="relative">
                            <input
                              aria-label="Ceiling height millimeters"
                              data-testid="ceiling-mm-input"
                              type="number"
                              min={MIN_CEILING_HEIGHT_CM * 10}
                              max={MAX_CEILING_HEIGHT_CM * 10}
                              step={10}
                              value={ceilingMm}
                              onChange={(e) => {
                                const rawMm = Number(e.target.value);
                                if (!Number.isFinite(rawMm)) return;
                                onChangeConfig({ ceilingHeightCm: Math.round(rawMm / 10) });
                              }}
                              className={`w-full rounded-lg border px-2.5 py-1.5 pr-9 font-mono text-xs font-semibold tabular-nums outline-none ${inputGlass}`}
                            />
                            <span className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] ${mutedText}`}>
                              mm
                            </span>
                          </div>
                        )}

                        <input
                          id="ceiling-height-slider"
                          data-testid="ceiling-height-slider"
                          type="range"
                          min={MIN_CEILING_HEIGHT_CM}
                          max={MAX_CEILING_HEIGHT_CM}
                          step={1}
                          value={config.ceilingHeightCm}
                          onChange={(e) => onChangeConfig({ ceilingHeightCm: Number(e.target.value) })}
                          className="axis-slider w-full"
                        />

                        <div className={`flex items-center justify-between text-[10px] font-mono tabular-nums ${mutedText}`}>
                          <span>7&apos;0&quot;–14&apos;3&quot;</span>
                          <span>
                            {formatFeetInches(config.ceilingHeightCm)} · {ceilingMm} mm
                          </span>
                        </div>
                      </div>

                      {/* Col 3: Clearance, Ceiling Type & Backdrop */}
                      <div className={`space-y-2 md:border-l md:pl-4 ${dividerClass}`}>
                        <div className="flex items-center justify-between gap-2">
                          <label htmlFor="pole-clearance-select" className={labelText}>
                            Clearance &amp; Ceiling
                          </label>
                          <button
                            type="button"
                            onClick={() => onChangeConfig({ showClearanceRing: !config.showClearanceRing })}
                            aria-pressed={config.showClearanceRing}
                            className={`px-2 py-0.5 rounded-lg border text-[10px] font-semibold ${
                              config.showClearanceRing ? glassBtnActive : glassBtnIdle
                            }`}
                          >
                            Ring {config.showClearanceRing ? 'On' : 'Off'}
                          </button>
                        </div>

                        <select
                          id="pole-clearance-select"
                          data-testid="pole-clearance-select"
                          value={selectedClearanceId}
                          onChange={(e) => {
                            const chosen = CLEARANCE_OPTIONS.find((o) => o.id === e.target.value);
                            if (!chosen) return;
                            onChangeConfig({
                              enforceMinClearance: chosen.enforce,
                              clearanceRadiusM: chosen.radiusM,
                            });
                          }}
                          className={`w-full rounded-lg border px-2.5 py-1.5 text-[11px] font-medium outline-none ${inputGlass}`}
                        >
                          {CLEARANCE_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id} className="bg-zinc-900 text-zinc-100">
                              {opt.label}
                            </option>
                          ))}
                        </select>

                        <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Room ceiling type">
                          {(
                            [
                              ['flat', 'Flat Ceiling'],
                              ['vaulted', 'Vaulted'],
                            ] as [CeilingType, string][]
                          ).map(([ctype, label]) => (
                            <button
                              key={ctype}
                              type="button"
                              data-testid={`ceiling-${ctype}-button`}
                              onClick={() => onChangeConfig({ ceilingType: ctype })}
                              aria-pressed={config.ceilingType === ctype}
                              className={`py-1.5 px-2 rounded-lg border text-[11px] font-semibold ${
                                config.ceilingType === ctype ? glassBtnActive : glassBtnIdle
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>

                        {config.ceilingType === 'vaulted' ? (
                          <div className="flex items-center gap-2">
                            <span className={`text-[10.5px] shrink-0 ${mutedText}`}>Pitch</span>
                            <input
                              aria-label="Roof pitch angle"
                              data-testid="vault-angle-slider"
                              type="range"
                              min={6}
                              max={28}
                              step={1}
                              value={config.vaultAngleDeg}
                              onChange={(e) => onChangeConfig({ vaultAngleDeg: Number(e.target.value) })}
                              className="axis-slider flex-1"
                            />
                            <span className="font-mono text-[10.5px] tabular-nums font-semibold">
                              {config.vaultAngleDeg}°
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <div
                              className={`flex-1 grid gap-0.5 p-0.5 rounded-lg ${segTrack} ${
                                hasRoomReplica ? 'grid-cols-3' : 'grid-cols-2'
                              }`}
                              role="group"
                              aria-label="Room backdrop environment"
                            >
                              {(
                                (hasRoomReplica
                                  ? [
                                      ['studio', 'Studio'],
                                      ['home', 'Home'],
                                      ['replica', 'My Room'],
                                    ]
                                  : [
                                      ['studio', 'Studio'],
                                      ['home', 'Home'],
                                    ]) as [EnvironmentPreset, string][]
                              ).map(([envId, label]) => (
                                <button
                                  key={envId}
                                  type="button"
                                  onClick={() => onChangeConfig({ environment: envId })}
                                  aria-pressed={config.environment === envId}
                                  className={`py-1 text-[10.5px] font-semibold rounded-md transition-colors ${
                                    config.environment === envId ? segActive : segIdle
                                  }`}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={onOpenRoomCapture}
                              data-testid="room-tab-capture-button"
                              title="Capture 4 photos of your room walls"
                              className={`px-2 py-1 rounded-lg border text-[10px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 ${glassBtnIdle}`}
                            >
                              <Scan className="w-3 h-3 shrink-0" aria-hidden="true" />
                              <span>{hasRoomReplica ? '4 Walls' : 'Capture'}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ==================== TAB 2: SELECT POLE ==================== */}
                  {activeTab === 'pole' && (
                    <div
                      key="tab-pole"
                      data-testid="step-pole-panel"
                      className="grid grid-cols-1 md:grid-cols-[0.88fr_1.52fr_0.96fr] gap-3.5 md:gap-4 animate-dock-panel"
                    >
                      {/* Col 1: Multi-Pole Selector & Auto-Matched X-POLE PX Kit */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className={labelText}>Studio Poles</span>
                          <span className={`font-mono text-[10px] tabular-nums ${mutedText}`}>
                            {poles.length} {poles.length === 1 ? 'pole' : 'poles'}
                            {!canAddPole ? ' · full' : ''}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Studio poles">
                          {poles.map((p, idx) => {
                            const isSel = p.id === activePole.id;
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => onSelectPole(p.id)}
                                aria-pressed={isSel}
                                className={`px-2 py-1 text-[11px] font-semibold rounded-lg border inline-flex items-center gap-1.5 whitespace-nowrap ${
                                  isSel ? glassBtnActive : glassBtnIdle
                                }`}
                              >
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{
                                    backgroundColor:
                                      p.finish === 'powder' && p.powderTone === 'white'
                                        ? '#f1f3f6'
                                        : POLE_FINISHES[p.finish].swatchHex,
                                  }}
                                  aria-hidden="true"
                                />
                                <span>P{idx + 1}</span>
                              </button>
                            );
                          })}

                          <button
                            type="button"
                            onClick={onAddPole}
                            disabled={!canAddPole}
                            data-testid="add-pole-button"
                            className={`px-2 py-1 text-[11px] font-semibold rounded-lg border inline-flex items-center gap-1 whitespace-nowrap ${
                              canAddPole ? glassBtnIdle : `opacity-45 cursor-not-allowed ${glassBtnIdle}`
                            }`}
                          >
                            <Plus className="w-3 h-3" aria-hidden="true" />
                            <span>{canAddPole ? 'Add' : 'Full'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={onCenterActivePole}
                            title={`Center ${activePole.label}`}
                            aria-label={`Center ${activePole.label}`}
                            className={`p-1.5 rounded-lg border ${glassBtnIdle}`}
                          >
                            <Crosshair className="w-3.5 h-3.5" />
                          </button>

                          {poles.length > 1 && (
                            <button
                              type="button"
                              onClick={onRemoveActivePole}
                              aria-label={`Remove ${activePole.label}`}
                              title={`Remove ${activePole.label}`}
                              className={`p-1.5 rounded-lg border hover:text-rose-400 ${glassBtnIdle}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Auto-Matched X-POLE PX Kit Summary */}
                        <div
                          className={`rounded-xl border p-2 space-y-1 ${
                            !activeResolution.available
                              ? 'border-amber-400/55 bg-amber-500/15'
                              : subCardGlass
                          }`}
                          data-testid="auto-selected-xpole-card"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold truncate" data-testid="matched-part-id">
                              {activeResolution.part.id}
                            </span>
                            <span className={`font-mono text-xs font-bold tabular-nums shrink-0 ${accentText}`} data-testid="matched-part-price">
                              {activeResolution.available
                                ? formatUsdExact(activeResolution.unitPriceUsd)
                                : 'N/A'}
                            </span>
                          </div>
                          <div className={`text-[10px] font-mono tabular-nums truncate ${mutedText}`}>
                            {activeResolution.part.heightMinMm}–{activeResolution.part.heightMaxMm} mm ·{' '}
                            {activeResolution.includedHardware.join(' + ')}
                          </div>
                          {!activeResolution.available && activeResolution.availableFinishesAtHeight.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1 pt-0.5">
                              <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" aria-hidden="true" />
                              {activeResolution.availableFinishesAtHeight.slice(0, 3).map((fid) => (
                                <button
                                  key={`avail-${fid}`}
                                  type="button"
                                  onClick={() => onChangeActivePole({ finish: fid })}
                                  className={`px-1.5 py-0.5 rounded-md border text-[9.5px] font-semibold ${glassBtnIdle}`}
                                >
                                  {POLE_FINISHES[fid].shortName}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Col 2: Official 5 X-POLE Finishes */}
                      <div className={`space-y-2 md:border-l md:pl-4 ${dividerClass}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className={labelText}>Finish · {activePole.label}</span>
                          {poles.length > 1 && (
                            <button
                              type="button"
                              data-testid="apply-finish-all-button"
                              onClick={() => onApplyFinishToAll(activePole.finish)}
                              className={`px-2 py-0.5 text-[10px] font-semibold rounded-md border ${glassBtnIdle}`}
                            >
                              Apply All
                            </button>
                          )}
                        </div>

                        <div
                          className="grid grid-cols-2 sm:grid-cols-3 gap-1.5"
                          role="group"
                          aria-label="Official X-POLE finishes"
                        >
                          {XPOLE_FINISH_ORDER.map((fid) => {
                            const spec = POLE_FINISHES[fid];
                            const selected = activePole.finish === fid;
                            const fRes = resolveXPoleConfiguration(
                              activePole.heightCm * 10,
                              fid,
                              config.priceTier
                            );
                            return (
                              <button
                                key={fid}
                                type="button"
                                data-testid={`finish-option-${fid}`}
                                onClick={() => onChangeActivePole({ finish: fid })}
                                aria-pressed={selected}
                                className={`rounded-xl border px-2 py-1.5 flex items-center gap-1.5 text-left min-w-0 overflow-hidden ${
                                  selected ? glassBtnActive : glassBtnIdle
                                } ${!fRes.available ? 'opacity-60' : ''}`}
                              >
                                <img
                                  src={materialAvatars[fid]}
                                  alt=""
                                  aria-hidden="true"
                                  className={`w-5 h-5 rounded-full object-cover shrink-0 ring-1 ${
                                    selected ? 'ring-violet-300' : isDark ? 'ring-white/25' : 'ring-black/15'
                                  }`}
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block text-[10.5px] font-semibold leading-tight truncate">
                                    {fid === 'powder' ? 'Powder' : spec.shortName}
                                  </span>
                                  <span className={`block font-mono text-[9.5px] tabular-nums leading-tight truncate ${mutedText}`}>
                                    {fRes.available ? formatUsdExact(fRes.unitPriceUsd) : 'N/A'}
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {activePole.finish === 'powder' && (
                          <div className="flex items-center justify-between gap-2 pt-0.5">
                            <span className={`text-[10.5px] ${mutedText}`}>Powder Coat Color</span>
                            <div className={`inline-flex items-center gap-0.5 p-0.5 rounded-lg ${segTrack}`}>
                              {(
                                [
                                  ['black', 'Black'],
                                  ['white', 'White'],
                                ] as const
                              ).map(([tone, label]) => (
                                <button
                                  key={tone}
                                  type="button"
                                  data-testid={`powder-tone-${tone}`}
                                  onClick={() => onChangeActivePole({ powderTone: tone })}
                                  aria-pressed={activePole.powderTone === tone}
                                  className={`px-2 py-0.5 text-[10.5px] font-semibold rounded-md inline-flex items-center gap-1 ${
                                    activePole.powderTone === tone ? segActive : segIdle
                                  }`}
                                >
                                  <span
                                    className="w-2 h-2 rounded-full border border-white/30"
                                    style={{ backgroundColor: tone === 'black' ? '#1c1f24' : '#f1f3f6' }}
                                    aria-hidden="true"
                                  />
                                  <span>{label}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Col 3: Diameter, Spin/Static, Mount & Pole Height */}
                      <div className={`space-y-2 md:border-l md:pl-4 ${dividerClass}`}>
                        <div className="flex items-center justify-between gap-1.5">
                          <div className={`inline-flex items-center gap-0.5 p-0.5 rounded-lg ${segTrack}`} role="group" aria-label="Pole diameter">
                            {DIAMETER_OPTIONS.map((d) => (
                              <button
                                key={d.mm}
                                type="button"
                                data-testid={`diameter-${d.mm}`}
                                onClick={() => onChangeActivePole({ diameterMm: d.mm })}
                                aria-pressed={activePole.diameterMm === d.mm}
                                className={`px-2 py-1 text-[10.5px] font-mono font-semibold rounded-md ${
                                  activePole.diameterMm === d.mm ? segActive : segIdle
                                }`}
                              >
                                {d.mm}mm
                              </button>
                            ))}
                          </div>

                          <div className={`inline-flex items-center gap-0.5 p-0.5 rounded-lg ${segTrack}`} role="group" aria-label="Mount type">
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
                                  className={`px-2 py-1 text-[10.5px] font-semibold rounded-md ${
                                    selected ? segActive : segIdle
                                  }`}
                                >
                                  {mid === 'permanent-ceiling' ? 'Fixed' : m.shortName}
                                </button>
                              );
                            })}
                          </div>

                          <button
                            type="button"
                            data-testid="spin-mode-toggle"
                            onClick={() => onChangeActivePole({ isSpinning: !activePole.isSpinning })}
                            aria-pressed={activePole.isSpinning}
                            className={`px-2 py-1 text-[10.5px] font-semibold rounded-lg border ${
                              activePole.isSpinning ? glassBtnActive : glassBtnIdle
                            }`}
                          >
                            {activePole.isSpinning ? 'Spin' : 'Static'}
                          </button>
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <label htmlFor="pole-height-slider" className={`text-[10.5px] ${mutedText}`}>
                              {activePoleTag} Height
                            </label>
                            <span className="font-mono text-[10.5px] font-semibold tabular-nums">
                              {formatFeetInches(activePole.heightCm)} · {activePole.heightCm * 10}mm
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

                        {hasCushion ? (
                          <div className="flex items-center justify-between gap-2" data-testid="cushion-controls">
                            <span className={`text-[10.5px] font-semibold ${accentText}`}>
                              Cushion +{(activeCushionCm / 100).toFixed(2)}m
                            </span>
                            <div className={`inline-flex items-center gap-0.5 p-0.5 rounded-lg ${segTrack}`}>
                              <button
                                type="button"
                                data-testid="cushion-top-button"
                                onClick={() => onChangeActivePole({ cushionPlacement: 'top' })}
                                aria-pressed={activePole.cushionPlacement === 'top'}
                                className={`px-2 py-0.5 text-[10.5px] font-semibold rounded-md ${
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
                                className={`px-2 py-0.5 text-[10.5px] font-semibold rounded-md ${
                                  activePole.cushionPlacement === 'below' ? segActive : segIdle
                                }`}
                              >
                                Below
                              </button>
                            </div>
                          </div>
                        ) : activePole.isSpinning ? (
                          <div className="flex items-center gap-2">
                            <label htmlFor="spin-rpm-slider" className={`text-[10.5px] shrink-0 ${mutedText}`}>
                              Speed
                            </label>
                            <input
                              id="spin-rpm-slider"
                              type="range"
                              min={6}
                              max={45}
                              value={activePole.spinRpm}
                              onChange={(e) => onChangeActivePole({ spinRpm: Number(e.target.value) })}
                              className="axis-slider flex-1"
                            />
                            <span className="font-mono text-[10.5px] tabular-nums">{activePole.spinRpm} RPM</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}

                  {/* ==================== TAB 3: SELECTION & QUOTATION ==================== */}
                  {activeTab === 'selection' && (
                    <div
                      key="tab-selection"
                      data-testid="step-selection-panel"
                      className="grid grid-cols-1 md:grid-cols-[0.95fr_1.2fr_1fr] gap-3.5 md:gap-4 animate-dock-panel"
                    >
                      {/* Col 1: Pricing Tier & Room Specs */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className={labelText}>X-POLE Pricing Tier</span>
                          <span className={`inline-flex items-center gap-1 text-[9.5px] font-medium ${mutedText}`}>
                            <Lock className="w-2.5 h-2.5" aria-hidden="true" />
                            <span>Trade Login</span>
                          </span>
                        </div>
                        <div
                          className={`grid grid-cols-3 gap-0.5 p-0.5 rounded-xl ${segTrack}`}
                          role="group"
                          aria-label="X-POLE pricing tier"
                          data-testid="price-tier-switcher"
                        >
                          {TIER_ORDER.map((tierId) => {
                            const tier = XPOLE_CATALOG.priceTiers[tierId];
                            const isWholesaleTier = tierId !== 'retail';
                            const active = viewedQuoteTier === tierId;
                            return (
                              <button
                                key={tierId}
                                type="button"
                                data-testid={`tier-${tierId}`}
                                onClick={() => {
                                  setViewedQuoteTier(tierId);
                                  if (tierId === 'retail') {
                                    onChangeConfig({ priceTier: 'retail' });
                                  }
                                }}
                                aria-pressed={active}
                                title={
                                  isWholesaleTier
                                    ? 'Log in on a valid wholesale account to get wholesale rates'
                                    : 'Standard X-POLE retail pricing'
                                }
                                className={`relative py-1.5 px-1 text-[10.5px] font-semibold rounded-lg transition-all whitespace-nowrap inline-flex items-center justify-center gap-1 overflow-hidden ${
                                  active ? segActive : segIdle
                                }`}
                              >
                                {isWholesaleTier && (
                                  <Lock className="w-2.5 h-2.5 shrink-0 opacity-85" aria-hidden="true" />
                                )}
                                <span
                                  className={
                                    isWholesaleTier
                                      ? 'blur-[1.4px] select-none opacity-85'
                                      : undefined
                                  }
                                >
                                  {tier.shortLabel}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        <div className={`rounded-xl border p-2 grid grid-cols-2 gap-1.5 text-[10.5px] ${subCardGlass}`}>
                          <div>
                            <span className={`block text-[9.5px] ${mutedText}`}>Room</span>
                            <span className="font-mono font-semibold tabular-nums">
                              {roomWidthFt}&apos; × {roomLengthFt}&apos;
                            </span>
                          </div>
                          <div>
                            <span className={`block text-[9.5px] ${mutedText}`}>Ceiling</span>
                            <span className="font-mono font-semibold tabular-nums">
                              {formatFeetInches(config.ceilingHeightCm)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Col 2 + Col 3: Itemized Kits & Grand Total (Blurred behind Login Overlay on Wholesale20/30) */}
                      <div className={`relative md:col-span-2 md:border-l md:pl-4 ${dividerClass}`}>
                        <div
                          className={`grid grid-cols-1 md:grid-cols-[1.2fr_1fr] gap-3.5 md:gap-4 transition-all duration-200 ${
                            isWholesaleLockedView ? 'blur-[6px] opacity-55 select-none pointer-events-none' : ''
                          }`}
                          aria-hidden={isWholesaleLockedView}
                        >
                          {/* Col 2: Itemized Auto-Matched Poles */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className={labelText}>Auto-Matched X-POLE Kits</span>
                              <span className={`font-mono text-[10px] tabular-nums ${mutedText}`}>
                                {quote.lines.length} {quote.lines.length === 1 ? 'pole' : 'poles'}
                              </span>
                            </div>
                            <div className="space-y-1.5 max-h-[126px] overflow-y-auto dock-scroll pr-1">
                              {quote.lines.map((line) => (
                                <div
                                  key={line.poleId}
                                  data-testid={`quote-line-${line.poleId}`}
                                  className={`rounded-xl border px-2.5 py-1.5 flex items-center justify-between gap-2 ${
                                    !line.resolution.available
                                      ? 'border-amber-400/55 bg-amber-500/15'
                                      : subCardGlass
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 text-[11px]">
                                      <span className="font-bold">{line.poleLabel}</span>
                                      <span className="truncate font-medium">
                                        {getXPoleFinishLabel(line.finish, line.powderTone)}
                                      </span>
                                    </div>
                                    <div className={`text-[10px] font-mono tabular-nums flex items-center gap-1 ${mutedText}`}>
                                      <Package className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                                      <span className="truncate">{line.resolution.part.id}</span>
                                      <span>·</span>
                                      <span>{line.heightMm}mm</span>
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    {line.resolution.available ? (
                                      <span className="block font-mono text-xs font-bold tabular-nums">
                                        {isWholesaleLockedView ? '$•••.••' : formatUsdExact(line.resolution.retailPriceUsd)}
                                      </span>
                                    ) : (
                                      <span className="font-mono text-[10.5px] font-semibold text-amber-400">
                                        N/A
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Col 3: Grand Total + Quote Actions */}
                          <div className={`space-y-2 md:border-l md:pl-4 flex flex-col justify-between ${dividerClass}`} data-testid="selection-total-card">
                            <div className="space-y-1">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className={labelText}>Estimated Total</span>
                                <span className={`font-mono text-base font-bold tabular-nums ${accentText}`} data-testid="selection-grand-total">
                                  {isWholesaleLockedView ? '$•••.••' : formatUsdExact(quote.retailTotalUsd)}
                                </span>
                              </div>
                              <p className={`text-[10.5px] flex items-center gap-1 ${isDark ? 'text-emerald-300/90' : 'text-emerald-700'}`}>
                                <CheckCircle2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                                <span>Official X-POLE PX retail pricing</span>
                              </p>
                            </div>

                            <div className="grid grid-cols-[1fr_auto] gap-1.5">
                              <button
                                type="button"
                                data-testid="dock-request-quote-button"
                                onClick={() => onOpenModal('quote')}
                                className={`py-2 px-3 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] ${primaryCta}`}
                              >
                                <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Request Quote</span>
                              </button>
                              <button
                                type="button"
                                onClick={handleDownloadCsv}
                                title="Download CSV Quote"
                                className={`py-2 px-2.5 rounded-xl border text-[11px] font-semibold inline-flex items-center gap-1 ${glassBtnIdle}`}
                              >
                                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>CSV</span>
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Frosted Wholesale Login Gate Overlay */}
                        {isWholesaleLockedView && (
                          <div
                            data-testid="wholesale-login-gate"
                            className={`absolute inset-0 md:left-4 rounded-xl border backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 animate-dock-panel ${
                              isDark
                                ? 'bg-[#12101f]/78 border-violet-300/30 shadow-[0_8px_30px_rgba(0,0,0,0.45)]'
                                : 'bg-white/82 border-violet-300/60 shadow-[0_8px_24px_rgba(109,40,217,0.12)]'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 text-center sm:text-left">
                              <div
                                className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${
                                  isDark
                                    ? 'bg-violet-500/20 border-violet-300/35 text-violet-200'
                                    : 'bg-violet-100 border-violet-300 text-violet-700'
                                }`}
                              >
                                <Lock className="w-4 h-4" aria-hidden="true" />
                              </div>
                              <div className="space-y-0.5">
                                <div className="text-xs font-bold">
                                  {XPOLE_CATALOG.priceTiers[viewedQuoteTier].label} Rates Locked
                                </div>
                                <p className={`text-[11px] leading-snug ${mutedText}`}>
                                  Log in on a valid wholesale account to get the wholesale rates.
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                data-testid="wholesale-signin-trigger"
                                onClick={() => onOpenModal('wholesale-login')}
                                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition-all active:scale-[0.97] ${primaryCta}`}
                              >
                                <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Wholesale Login</span>
                              </button>
                              <button
                                type="button"
                                data-testid="wholesale-back-retail"
                                onClick={() => setViewedQuoteTier('retail')}
                                className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold whitespace-nowrap ${glassBtnIdle}`}
                              >
                                Retail
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ==================== TAB 4: SCENE, CAMERA & LIGHTING ==================== */}
                  {activeTab === 'scene' && (
                    <div
                      key="tab-scene"
                      data-testid="step-scene-panel"
                      className="grid grid-cols-1 md:grid-cols-2 gap-3.5 md:gap-4 animate-dock-panel"
                    >
                      {/* Col 1: Stage & Camera Modes */}
                      <div className="space-y-2">
                        <span className={labelText}>Camera &amp; Stage Controls</span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={onToggleCompareMode}
                            aria-pressed={compareMode}
                            data-testid="compare-mode-toggle"
                            className={`px-3 py-1.5 rounded-xl border text-[11px] font-semibold inline-flex items-center gap-1.5 ${
                              compareMode ? glassBtnActive : glassBtnIdle
                            }`}
                          >
                            <Columns2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span>Compare</span>
                          </button>

                          <button
                            type="button"
                            onClick={onToggleMoveMode}
                            aria-pressed={moveMode && !compareMode}
                            disabled={compareMode}
                            data-testid="move-mode-toggle"
                            className={`px-3 py-1.5 rounded-xl border text-[11px] font-semibold inline-flex items-center gap-1.5 ${
                              compareMode
                                ? `opacity-35 cursor-not-allowed ${glassBtnIdle}`
                                : moveMode
                                  ? glassBtnActive
                                  : glassBtnIdle
                            }`}
                          >
                            <Move className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span>Move Pole</span>
                          </button>

                          <button
                            type="button"
                            data-testid="full-camera-button"
                            onClick={() => {
                              onChangeCameraMotion('manual');
                              onFocusCamera(compareMode ? 'compare-pair' : 'full-rig');
                            }}
                            className={`px-3 py-1.5 rounded-xl border text-[11px] font-semibold inline-flex items-center gap-1.5 ${glassBtnIdle}`}
                          >
                            <span>Full Cam</span>
                          </button>

                          <button
                            type="button"
                            data-testid="orbit-camera-button"
                            onClick={() => onChangeCameraMotion(cameraMotion === 'orbit' ? 'manual' : 'orbit')}
                            aria-pressed={cameraMotion === 'orbit'}
                            className={`px-3 py-1.5 rounded-xl border text-[11px] font-semibold inline-flex items-center gap-1.5 ${
                              cameraMotion === 'orbit' ? glassBtnActive : glassBtnIdle
                            }`}
                          >
                            <Orbit className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span>Orbit</span>
                          </button>

                          <button
                            type="button"
                            data-testid="crane-camera-button"
                            onClick={() => onChangeCameraMotion(cameraMotion === 'crane' ? 'manual' : 'crane')}
                            aria-pressed={cameraMotion === 'crane'}
                            className={`px-3 py-1.5 rounded-xl border text-[11px] font-semibold inline-flex items-center gap-1.5 ${
                              cameraMotion === 'crane' ? glassBtnActive : glassBtnIdle
                            }`}
                          >
                            <Video className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span>Crane</span>
                          </button>
                        </div>
                      </div>

                      {/* Col 2: Studio Lighting Appearance */}
                      <div className={`space-y-2 md:border-l md:pl-4 ${dividerClass}`}>
                        <span className={labelText}>Studio Lighting Appearance</span>
                        <div
                          className="flex flex-wrap items-center gap-1.5"
                          role="group"
                          aria-label="Studio lighting appearance"
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
                                className={`px-3 py-1.5 rounded-xl border text-[11px] font-semibold inline-flex items-center gap-1.5 ${
                                  active ? glassBtnActive : glassBtnIdle
                                }`}
                              >
                                <LightingIcon preset={preset.id} />
                                <span>{preset.shortLabel}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
