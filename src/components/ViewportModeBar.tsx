import { Box, Grid2x2, Play } from 'lucide-react';
import type { LightingPreset, ViewportMode } from '../types/pole';
import { isDarkLighting } from '../utils/poleConfig';

interface ViewportModeBarProps {
  viewportMode: ViewportMode;
  installDemoActive: boolean;
  lighting: LightingPreset;
  arCameraActive: boolean;
  onChangeViewportMode: (mode: ViewportMode) => void;
  onLaunchInstallDemo: () => void;
}

export function ViewportModeBar({
  viewportMode,
  installDemoActive,
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
    ? 'bg-[#0e111d]/56 border-white/14 shadow-[0_10px_30px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.12)]'
    : isSunset
      ? 'bg-[#1a1015]/56 border-rose-300/18 shadow-[0_10px_30px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.1)]'
      : isPulse
        ? 'bg-[#0b141a]/56 border-emerald-300/18 shadow-[0_10px_30px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.1)]'
        : isDark
          ? 'bg-[#151311]/58 border-amber-300/18 shadow-[0_10px_30px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.1)]'
          : 'bg-white/62 border-stone-900/10 shadow-[0_8px_24px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.85)]';

  const activePillClass = isNeon
    ? 'bg-violet-600/80 text-white border-violet-300/45 shadow-[0_4px_14px_rgba(124,58,237,0.36),inset_0_1px_0_rgba(255,255,255,0.2)]'
    : isSunset
      ? 'bg-rose-500/80 text-white border-orange-300/45 shadow-[0_4px_14px_rgba(244,63,94,0.32)]'
      : isPulse
        ? 'bg-emerald-500/78 text-white border-emerald-200/45 shadow-[0_4px_14px_rgba(16,185,129,0.3)]'
        : isDark
          ? 'bg-amber-500/80 text-stone-950 border-amber-200/45 shadow-[0_4px_14px_rgba(245,158,11,0.3)]'
          : 'bg-violet-700/92 text-white border-violet-500/40 shadow-[0_4px_14px_rgba(109,40,217,0.26)]';

  const idleClass = isDark
    ? 'border-transparent text-zinc-200/90 hover:text-white hover:bg-white/[0.08]'
    : 'border-transparent text-stone-700 hover:text-stone-950 hover:bg-white/65';

  const is3DStandard = viewportMode === '3d' && !installDemoActive;
  const isFloorPlan = viewportMode === 'floor-plan';
  const isInstallDemo = viewportMode === '3d' && installDemoActive;

  const tabs = [
    {
      id: '3d',
      label: '3D View',
      shortLabel: '3D',
      active: is3DStandard,
      testId: 'view-mode-3d',
      icon: <Box className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
      onClick: () => onChangeViewportMode('3d'),
    },
    {
      id: 'floor-plan',
      label: 'Floor Plan',
      shortLabel: 'Plan',
      active: isFloorPlan,
      testId: 'view-mode-floor-plan',
      icon: <Grid2x2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
      onClick: () => onChangeViewportMode('floor-plan'),
    },
    {
      id: 'demo',
      label: 'Pole Installation Demo',
      shortLabel: 'Demo',
      active: isInstallDemo,
      testId: 'view-mode-install-demo',
      icon: <Play className="w-3 h-3 shrink-0" aria-hidden="true" />,
      onClick: onLaunchInstallDemo,
    },
  ];

  return (
    <div
      role="tablist"
      aria-label="Workspace view mode"
      data-testid="viewport-mode-bar"
      className={`fixed top-16 left-4 z-20 inline-flex items-center gap-1 p-1 rounded-2xl border backdrop-blur-xl backdrop-saturate-150 transition-all duration-200 ${containerClass}`}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.active}
          data-testid={tab.testId}
          onClick={tab.onClick}
          className={`min-h-[32px] px-2.5 sm:px-3 py-1.5 rounded-xl border text-[11px] font-semibold inline-flex items-center gap-1.5 transition-all duration-200 whitespace-nowrap shrink-0 active:scale-[0.97] ${
            tab.active ? activePillClass : idleClass
          }`}
        >
          {tab.icon}
          <span className="hidden sm:inline">{tab.label}</span>
          <span className="sm:hidden">{tab.shortLabel}</span>
        </button>
      ))}
    </div>
  );
}
