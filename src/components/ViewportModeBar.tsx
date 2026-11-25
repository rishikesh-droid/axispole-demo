import { Box, Grid2x2, Play } from 'lucide-react';
import type { DockTabId, LightingPreset, ViewportMode } from '../types/pole';
import { isDarkLighting } from '../utils/poleConfig';

interface ViewportModeBarProps {
  viewportMode: ViewportMode;
  activeTab: DockTabId;
  lighting: LightingPreset;
  arCameraActive: boolean;
  onChangeViewportMode: (mode: ViewportMode) => void;
  onLaunchInstallDemo: () => void;
}

export function ViewportModeBar({
  viewportMode,
  activeTab,
  lighting,
  arCameraActive,
  onChangeViewportMode,
  onLaunchInstallDemo,
}: ViewportModeBarProps) {
  if (arCameraActive) return null;

  const isDark = isDarkLighting(lighting);
  const isNeon = lighting === 'mood-neon';
  const isSunset = lighting === 'sunset-flow';
  const isPulse = lighting === 'cyber-pulse';

  const containerClass = isNeon
    ? 'bg-[#11131d]/94 border-violet-400/25 shadow-[0_8px_24px_rgba(0,0,0,0.45)]'
    : isSunset
      ? 'bg-[#1c1317]/94 border-rose-400/28 shadow-[0_8px_24px_rgba(0,0,0,0.45)]'
      : isPulse
        ? 'bg-[#0e161b]/94 border-emerald-400/28 shadow-[0_8px_24px_rgba(0,0,0,0.45)]'
        : isDark
          ? 'bg-[#161412]/94 border-amber-500/25 shadow-[0_8px_24px_rgba(0,0,0,0.45)]'
          : 'bg-[#faf9f6]/96 border-stone-300/90 shadow-sm';

  const activeClass = isNeon
    ? 'bg-violet-500/25 text-white ring-1 ring-violet-400/55'
    : isSunset
      ? 'bg-rose-500/25 text-white ring-1 ring-orange-400/55'
      : isPulse
        ? 'bg-emerald-500/25 text-white ring-1 ring-emerald-400/55'
        : isDark
          ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/50'
          : 'bg-stone-900 text-stone-50 shadow-xs';

  const idleClass = isDark
    ? 'text-zinc-300 hover:text-white hover:bg-white/6'
    : 'text-stone-700 hover:text-stone-950 hover:bg-stone-200/65';

  const is3DStandard = viewportMode === '3d' && activeTab !== 'assembly';
  const isFloorPlan = viewportMode === 'floor-plan';
  const isInstallDemo = viewportMode === '3d' && activeTab === 'assembly';

  return (
    <div
      role="tablist"
      aria-label="Workspace view mode"
      data-testid="viewport-mode-bar"
      className={`absolute top-3 left-3 sm:left-4 z-20 inline-flex items-center gap-1 p-1 rounded-xl border transition-colors ${containerClass}`}
    >
      <button
        type="button"
        role="tab"
        aria-selected={is3DStandard}
        data-testid="view-mode-3d"
        onClick={() => onChangeViewportMode('3d')}
        className={`min-h-[32px] px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
          is3DStandard ? activeClass : idleClass
        }`}
      >
        <Box className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>3D View</span>
      </button>

      <button
        type="button"
        role="tab"
        aria-selected={isFloorPlan}
        data-testid="view-mode-floor-plan"
        onClick={() => onChangeViewportMode('floor-plan')}
        className={`min-h-[32px] px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
          isFloorPlan ? activeClass : idleClass
        }`}
      >
        <Grid2x2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Floor Plan</span>
      </button>

      <button
        type="button"
        role="tab"
        aria-selected={isInstallDemo}
        data-testid="view-mode-install-demo"
        onClick={onLaunchInstallDemo}
        className={`min-h-[32px] px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
          isInstallDemo ? activeClass : idleClass
        }`}
      >
        <Play className="w-3 h-3 shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline">Installation Demo</span>
        <span className="sm:hidden">Demo</span>
      </button>
    </div>
  );
}
