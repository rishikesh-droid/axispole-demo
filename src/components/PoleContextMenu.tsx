import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Crosshair,
  Eye,
  Grid2x2,
  Maximize2,
  Move,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type {
  CushionPlacement,
  PoleContextMenuState,
  PoleDiameterMm,
  PoleFinishId,
  PoleInstance,
  PoleRigConfig,
  ViewportMode,
} from '../types/pole';
import {
  DIAMETER_OPTIONS,
  getWallClearanceMarginM,
  isDarkLighting,
  isPositionValidForNewPole,
  POLE_FINISHES,
} from '../utils/poleConfig';

interface PoleContextMenuProps {
  menu: PoleContextMenuState | null;
  config: PoleRigConfig;
  poles: PoleInstance[];
  canAddPole: boolean;
  viewportMode: ViewportMode;
  moveMode: boolean;
  onClose: () => void;
  onChangePole: (poleId: string, patch: Partial<PoleInstance>) => void;
  onCenterPole: (poleId: string) => void;
  onRemovePole: (poleId: string) => void;
  onAddPole: (preferred?: { x: number; z: number }) => void;
  onToggleMoveMode: () => void;
  onSwitchViewportMode: (mode: ViewportMode) => void;
  onFocusPoleIn3D: (poleId: string) => void;
  onResetView: () => void;
}

const FINISH_ORDER: PoleFinishId[] = ['brass', 'stainless', 'powder-black', 'silicone'];

const CUSHION_OPTIONS: { id: CushionPlacement; label: string }[] = [
  { id: 'top', label: 'Top' },
  { id: 'below', label: 'Below' },
];

export function PoleContextMenu({
  menu,
  config,
  poles,
  canAddPole,
  viewportMode,
  moveMode,
  onClose,
  onChangePole,
  onCenterPole,
  onRemovePole,
  onAddPole,
  onToggleMoveMode,
  onSwitchViewportMode,
  onFocusPoleIn3D,
  onResetView,
}: PoleContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: menu?.screenX ?? 0,
    top: menu?.screenY ?? 0,
  });

  useLayoutEffect(() => {
    if (!menu) return;
    const el = menuRef.current;
    const width = el?.offsetWidth ?? 248;
    const height = el?.offsetHeight ?? 310;
    const pad = 12;
    const left = Math.max(pad, Math.min(menu.screenX, window.innerWidth - width - pad));
    const top = Math.max(pad, Math.min(menu.screenY, window.innerHeight - height - pad));
    setPos({ left, top });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const handleResizeOrScroll = () => onClose();

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('resize', handleResizeOrScroll);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('resize', handleResizeOrScroll);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  const isDark = isDarkLighting(config.lighting);
  const isNeon = config.lighting === 'mood-neon';
  const isSunset = config.lighting === 'sunset-flow';
  const isPulse = config.lighting === 'cyber-pulse';

  const targetPole = menu.poleId ? poles.find((p) => p.id === menu.poleId) ?? null : null;
  const targetPoleIndex = targetPole ? poles.findIndex((p) => p.id === targetPole.id) : -1;

  const wallMarginM = getWallClearanceMarginM(config.mount, config.enforceMinClearance);
  const hasExactPoint =
    typeof menu.worldX === 'number' &&
    typeof menu.worldZ === 'number' &&
    Number.isFinite(menu.worldX) &&
    Number.isFinite(menu.worldZ);

  const canPlaceExactHere =
    hasExactPoint &&
    isPositionValidForNewPole(
      menu.worldX!,
      menu.worldZ!,
      poles,
      config.roomWidthM,
      config.roomDepthM,
      config.mount,
      config.enforceMinClearance
    );

  const surfaceClass = isNeon
    ? 'bg-[#121422]/96 border-violet-400/30 text-zinc-100 shadow-[0_14px_38px_rgba(0,0,0,0.62)]'
    : isSunset
      ? 'bg-[#1d1318]/96 border-rose-400/30 text-rose-50 shadow-[0_14px_38px_rgba(0,0,0,0.62)]'
      : isPulse
        ? 'bg-[#0e171c]/96 border-emerald-400/30 text-emerald-50 shadow-[0_14px_38px_rgba(0,0,0,0.62)]'
        : isDark
          ? 'bg-[#171512]/96 border-amber-500/30 text-stone-100 shadow-[0_14px_38px_rgba(0,0,0,0.62)]'
          : 'bg-[#fcfbf8]/98 border-stone-300 text-stone-900 shadow-[0_12px_32px_rgba(28,25,23,0.18)]';

  const dividerClass = isDark ? 'border-white/10' : 'border-stone-200';
  const mutedClass = isDark ? 'text-zinc-400' : 'text-stone-500';
  const segBg = isDark ? 'bg-black/35' : 'bg-stone-200/80';
  const segActive = isNeon
    ? 'bg-violet-500/30 text-white ring-1 ring-violet-400/55'
    : isSunset
      ? 'bg-rose-500/30 text-white ring-1 ring-orange-400/55'
      : isPulse
        ? 'bg-emerald-500/30 text-white ring-1 ring-emerald-400/55'
        : isDark
          ? 'bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/55'
          : 'bg-white text-stone-950 shadow-xs';
  const segIdle = isDark ? 'text-zinc-400 hover:text-white' : 'text-stone-600 hover:text-stone-950';
  const itemHover = isDark ? 'hover:bg-white/10' : 'hover:bg-stone-200/70';

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={targetPole ? `${targetPole.label} edit menu` : 'Room canvas menu'}
      data-testid="pole-context-menu"
      style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
      onContextMenu={(e) => e.preventDefault()}
      className={`fixed z-50 w-[244px] rounded-xl border backdrop-blur-md py-1.5 select-none ${surfaceClass}`}
    >
      {targetPole ? (
        <>
          {/* Pole Header */}
          <div className={`px-3 py-1.5 border-b flex items-center justify-between gap-2 ${dividerClass}`}>
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white/30"
                style={{ backgroundColor: POLE_FINISHES[targetPole.finish].swatchHex }}
                aria-hidden="true"
              />
              <span className="text-xs font-semibold truncate">
                {targetPole.label} (P{targetPoleIndex + 1})
              </span>
            </div>
            <span className={`font-mono text-[10px] tabular-nums shrink-0 ${mutedClass}`}>
              {(targetPole.heightCm / 100).toFixed(2)}m · {targetPole.diameterMm}mm
            </span>
          </div>

          {/* Quick Finish Swatches */}
          <div className={`px-3 py-2 border-b space-y-1.5 ${dividerClass}`}>
            <span className={`block text-[10px] font-semibold uppercase tracking-wide ${mutedClass}`}>
              Finish
            </span>
            <div className="grid grid-cols-4 gap-1" role="group" aria-label="Quick finish">
              {FINISH_ORDER.map((fid) => {
                const spec = POLE_FINISHES[fid];
                const selected = targetPole.finish === fid;
                const shortLabel =
                  fid === 'powder-black'
                    ? 'Black'
                    : fid === 'stainless'
                      ? 'Steel'
                      : fid === 'silicone'
                        ? 'Silic.'
                        : 'Brass';
                return (
                  <button
                    key={fid}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    data-testid={`ctx-finish-${fid}`}
                    onClick={() => onChangePole(targetPole.id, { finish: fid })}
                    title={spec.name}
                    className={`py-1 px-1 rounded-lg border text-[10px] font-semibold flex flex-col items-center gap-1 transition-colors ${
                      selected
                        ? isNeon
                          ? 'border-cyan-400/80 bg-violet-500/20 text-white'
                          : isDark
                            ? 'border-amber-400/80 bg-amber-500/20 text-white'
                            : 'border-amber-700 bg-amber-600/12 text-stone-950'
                        : isDark
                          ? 'border-white/10 bg-white/4 text-zinc-300 hover:border-white/25'
                          : 'border-stone-200 bg-white text-stone-700 hover:border-stone-400'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full ring-1 ring-black/25"
                      style={{ backgroundColor: spec.swatchHex }}
                      aria-hidden="true"
                    />
                    <span className="leading-none">{shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Diameter & Spin/Static */}
          <div className={`px-3 py-2 border-b space-y-2 ${dividerClass}`}>
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${mutedClass}`}>
                Width
              </span>
              <div className={`inline-flex items-center gap-0.5 p-0.5 rounded-lg ${segBg}`}>
                {DIAMETER_OPTIONS.map((d) => (
                  <button
                    key={d.mm}
                    type="button"
                    data-testid={`ctx-diameter-${d.mm}`}
                    onClick={() =>
                      onChangePole(targetPole.id, { diameterMm: d.mm as PoleDiameterMm })
                    }
                    className={`px-2 py-0.5 text-[10.5px] font-mono font-semibold rounded-md transition-colors ${
                      targetPole.diameterMm === d.mm ? segActive : segIdle
                    }`}
                  >
                    {d.mm}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${mutedClass}`}>
                Mode
              </span>
              <div className={`inline-flex items-center gap-0.5 p-0.5 rounded-lg ${segBg}`}>
                <button
                  type="button"
                  data-testid="ctx-mode-spin"
                  onClick={() => onChangePole(targetPole.id, { isSpinning: true })}
                  className={`px-2.5 py-0.5 text-[10.5px] font-semibold rounded-md transition-colors ${
                    targetPole.isSpinning ? segActive : segIdle
                  }`}
                >
                  Spin
                </button>
                <button
                  type="button"
                  data-testid="ctx-mode-static"
                  onClick={() => onChangePole(targetPole.id, { isSpinning: false })}
                  className={`px-2.5 py-0.5 text-[10.5px] font-semibold rounded-md transition-colors ${
                    !targetPole.isSpinning ? segActive : segIdle
                  }`}
                >
                  Static
                </button>
              </div>
            </div>

            {targetPole.heightCm < config.ceilingHeightCm && (
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[10px] font-semibold uppercase tracking-wide ${mutedClass}`}>
                  Cushion
                </span>
                <div className={`inline-flex items-center gap-0.5 p-0.5 rounded-lg ${segBg}`}>
                  {CUSHION_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      data-testid={`ctx-cushion-${opt.id}`}
                      onClick={() => onChangePole(targetPole.id, { cushionPlacement: opt.id })}
                      className={`px-2 py-0.5 text-[10.5px] font-semibold rounded-md transition-colors ${
                        targetPole.cushionPlacement === opt.id ? segActive : segIdle
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Discrete Pole Actions */}
          <div className="p-1 space-y-0.5">
            <button
              type="button"
              role="menuitem"
              data-testid="ctx-center-pole"
              onClick={() => {
                onCenterPole(targetPole.id);
                onClose();
              }}
              className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 text-left transition-colors ${itemHover}`}
            >
              <Crosshair className="w-3.5 h-3.5 shrink-0 opacity-80" aria-hidden="true" />
              <span>Center Pole in Room</span>
            </button>

            {viewportMode === '3d' ? (
              <button
                type="button"
                role="menuitem"
                data-testid="ctx-toggle-move"
                onClick={() => {
                  onToggleMoveMode();
                  onClose();
                }}
                className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 text-left transition-colors ${itemHover}`}
              >
                <Move className="w-3.5 h-3.5 shrink-0 opacity-80" aria-hidden="true" />
                <span>{moveMode ? 'Finish Moving Pole' : 'Move Pole on Floor'}</span>
              </button>
            ) : (
              <button
                type="button"
                role="menuitem"
                data-testid="ctx-inspect-3d"
                onClick={() => {
                  onFocusPoleIn3D(targetPole.id);
                  onClose();
                }}
                className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 text-left transition-colors ${itemHover}`}
              >
                <Eye className="w-3.5 h-3.5 shrink-0 opacity-80" aria-hidden="true" />
                <span>Inspect in 3D View</span>
              </button>
            )}

            <button
              type="button"
              role="menuitem"
              data-testid="ctx-add-nearby"
              disabled={!canAddPole}
              onClick={() => {
                onAddPole({ x: targetPole.x + 1.8, z: targetPole.z });
                onClose();
              }}
              className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 text-left transition-colors ${
                canAddPole ? itemHover : 'opacity-45'
              }`}
            >
              <Plus className="w-3.5 h-3.5 shrink-0 opacity-80" aria-hidden="true" />
              <span className="truncate">
                {canAddPole
                  ? 'Add Another Pole'
                  : `Room Full (${wallMarginM.toFixed(2)}m Limit)`}
              </span>
            </button>

            <div className={`my-1 border-t ${dividerClass}`} />

            <button
              type="button"
              role="menuitem"
              data-testid="ctx-delete-pole"
              disabled={poles.length <= 1}
              onClick={() => {
                onRemovePole(targetPole.id);
                onClose();
              }}
              className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 text-left transition-colors ${
                poles.length <= 1
                  ? 'opacity-40'
                  : isDark
                    ? 'text-rose-400 hover:bg-rose-500/15'
                    : 'text-rose-600 hover:bg-rose-50'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>
                {poles.length <= 1 ? 'Keep at Least 1 Pole' : `Delete ${targetPole.label}`}
              </span>
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Empty Room Space Context Menu */}
          <div className={`px-3 py-1.5 border-b flex items-center justify-between gap-2 ${dividerClass}`}>
            <span className="text-xs font-semibold">
              Room · {config.roomWidthM.toFixed(1)}×{config.roomDepthM.toFixed(1)}m
            </span>
            {hasExactPoint && (
              <span className={`font-mono text-[10px] tabular-nums ${mutedClass}`}>
                {menu.worldX!.toFixed(1)}, {menu.worldZ!.toFixed(1)}
              </span>
            )}
          </div>

          <div className="p-1 space-y-0.5">
            {hasExactPoint && (
              <button
                type="button"
                role="menuitem"
                data-testid="ctx-add-pole-here"
                disabled={!canPlaceExactHere}
                onClick={() => {
                  onAddPole({ x: menu.worldX!, z: menu.worldZ! });
                  onClose();
                }}
                title={
                  canPlaceExactHere
                    ? 'Place a new pole at this exact floor position'
                    : `Requires ${wallMarginM.toFixed(2)}m wall clearance and safe pole spacing`
                }
                className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 text-left transition-colors ${
                  canPlaceExactHere ? itemHover : 'opacity-45'
                }`}
              >
                <Plus className="w-3.5 h-3.5 shrink-0 opacity-80" aria-hidden="true" />
                <span className="truncate">
                  {canPlaceExactHere
                    ? 'Add Pole Here'
                    : `Too Close (${wallMarginM.toFixed(2)}m Clearance)`}
                </span>
              </button>
            )}

            {!canPlaceExactHere && canAddPole && (
              <button
                type="button"
                role="menuitem"
                data-testid="ctx-add-pole-open-spot"
                onClick={() => {
                  onAddPole(hasExactPoint ? { x: menu.worldX!, z: menu.worldZ! } : undefined);
                  onClose();
                }}
                className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 text-left transition-colors ${itemHover}`}
              >
                <Plus className="w-3.5 h-3.5 shrink-0 opacity-80" aria-hidden="true" />
                <span>Add Pole in Open Space</span>
              </button>
            )}

            <button
              type="button"
              role="menuitem"
              data-testid="ctx-center-active"
              onClick={() => {
                onCenterPole(poles[0]?.id ?? '');
                onClose();
              }}
              className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 text-left transition-colors ${itemHover}`}
            >
              <Crosshair className="w-3.5 h-3.5 shrink-0 opacity-80" aria-hidden="true" />
              <span>Center Active Pole</span>
            </button>

            <div className={`my-1 border-t ${dividerClass}`} />

            <button
              type="button"
              role="menuitem"
              data-testid="ctx-switch-view"
              onClick={() => {
                onSwitchViewportMode(viewportMode === 'floor-plan' ? '3d' : 'floor-plan');
                onClose();
              }}
              className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 text-left transition-colors ${itemHover}`}
            >
              {viewportMode === 'floor-plan' ? (
                <Eye className="w-3.5 h-3.5 shrink-0 opacity-80" aria-hidden="true" />
              ) : (
                <Grid2x2 className="w-3.5 h-3.5 shrink-0 opacity-80" aria-hidden="true" />
              )}
              <span>
                {viewportMode === 'floor-plan' ? 'Switch to 3D Studio' : 'Switch to 2D Floor Plan'}
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              data-testid="ctx-reset-view"
              onClick={() => {
                onResetView();
                onClose();
              }}
              className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 text-left transition-colors ${itemHover}`}
            >
              {viewportMode === 'floor-plan' ? (
                <Maximize2 className="w-3.5 h-3.5 shrink-0 opacity-80" aria-hidden="true" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 shrink-0 opacity-80" aria-hidden="true" />
              )}
              <span>{viewportMode === 'floor-plan' ? 'Fit Room to View' : 'Reset 3D Camera'}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
