import { FileText } from 'lucide-react';
import type { LightingPreset, ModalId, PriceTierId } from '../types/pole';
import { isDarkLighting } from '../utils/poleConfig';
import { formatUsdExact, XPOLE_CATALOG } from '../data/xpoleCatalog';

interface TopBarProps {
  lighting: LightingPreset;
  totalPriceUsd: number;
  priceTier: PriceTierId;
  arCameraActive: boolean;
  onOpenModal: (modal: ModalId) => void;
  onJumpToSelection: () => void;
}

export function TopBar({
  lighting,
  totalPriceUsd,
  priceTier,
  arCameraActive,
  onOpenModal,
  onJumpToSelection,
}: TopBarProps) {
  if (arCameraActive) return null;

  const isDark = isDarkLighting(lighting);
  const isNeon = lighting === 'mood-neon';
  const isSunset = lighting === 'sunset-flow';
  const isPulse = lighting === 'cyber-pulse';

  const headerGlass = isNeon
    ? 'bg-[#0c0e18]/52 border-white/12 text-zinc-100 shadow-[0_8px_32px_rgba(0,0,0,0.28),inset_0_-1px_0_rgba(255,255,255,0.06)]'
    : isSunset
      ? 'bg-[#180f14]/52 border-rose-300/15 text-rose-50 shadow-[0_8px_32px_rgba(0,0,0,0.28),inset_0_-1px_0_rgba(255,255,255,0.06)]'
      : isPulse
        ? 'bg-[#091217]/52 border-emerald-300/15 text-emerald-50 shadow-[0_8px_32px_rgba(0,0,0,0.28),inset_0_-1px_0_rgba(255,255,255,0.06)]'
        : isDark
          ? 'bg-[#121110]/55 border-amber-300/14 text-stone-100 shadow-[0_8px_32px_rgba(0,0,0,0.28),inset_0_-1px_0_rgba(255,255,255,0.06)]'
          : 'bg-white/58 border-stone-900/10 text-stone-900 shadow-[0_8px_28px_rgba(15,23,42,0.06),inset_0_-1px_0_rgba(255,255,255,0.75)]';

  const priceAccent = isNeon
    ? 'text-violet-300'
    : isSunset
      ? 'text-rose-300'
      : isPulse
        ? 'text-emerald-300'
        : isDark
          ? 'text-amber-300'
          : 'text-violet-700';

  const priceBtnHover = isDark
    ? 'hover:bg-white/[0.08] border-transparent hover:border-white/12'
    : 'hover:bg-white/65 border-transparent hover:border-stone-900/10';

  const ctaGlass = isDark
    ? 'bg-violet-600/80 hover:bg-violet-500/90 text-white border-violet-300/35 shadow-[0_4px_18px_rgba(124,58,237,0.38),inset_0_1px_0_rgba(255,255,255,0.22)]'
    : 'bg-violet-700/90 hover:bg-violet-700 text-white border-violet-500/40 shadow-[0_4px_16px_rgba(109,40,217,0.28),inset_0_1px_0_rgba(255,255,255,0.24)]';

  const tierMeta = XPOLE_CATALOG.priceTiers[priceTier];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-30 h-12 sm:h-13 px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 border-b backdrop-blur-xl backdrop-saturate-150 transition-colors duration-200 ${headerGlass}`}
    >
      {/* Zone 1: Minimal Official X-POLE Transparent Logo */}
      <div className="flex items-center shrink-0">
        <img
          src="/assets/aistudio/logo-xpole-removebg-preview_fe7bd6d2.png"
          alt="X-POLE — Leaders in Pole & Aerial Fitness"
          referrerPolicy="no-referrer"
          className={`h-5 sm:h-[26px] w-auto object-contain select-none transition-all duration-200 ${
            isDark
              ? 'brightness-[1.3] contrast-[1.08] drop-shadow-[0_0_1.5px_rgba(255,255,255,0.68)] drop-shadow-[0_2px_10px_rgba(167,139,250,0.35)]'
              : 'drop-shadow-[0_1px_2px_rgba(255,255,255,0.55)]'
          }`}
        />
      </div>

      {/* Zone 2: Estimated Price + Request Quote Primary CTA */}
      <div className="flex items-center gap-1.5 sm:gap-3.5 shrink-0">
        <button
          type="button"
          onClick={onJumpToSelection}
          data-testid="topbar-estimated-total"
          title="View itemized X-POLE quotation & pricing tiers"
          className={`flex items-baseline gap-1.5 sm:gap-2 text-right rounded-lg border px-2 sm:px-2.5 py-1 backdrop-blur-md transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${priceBtnHover}`}
        >
          <span
            className={`hidden sm:inline text-[11px] font-medium ${
              isDark ? 'text-zinc-300/85' : 'text-stone-600'
            }`}
          >
            Total
          </span>
          <span className={`font-mono text-[13px] sm:text-base font-bold tabular-nums tracking-tight ${priceAccent}`}>
            {formatUsdExact(totalPriceUsd)}
          </span>
          {priceTier !== 'retail' && (
            <span
              className={`hidden sm:inline font-mono text-[10px] font-bold uppercase ${
                isDark ? 'text-emerald-300' : 'text-emerald-700'
              }`}
            >
              {tierMeta.shortLabel}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onOpenModal('quote')}
          data-testid="topbar-request-quote"
          className={`min-h-[32px] sm:min-h-[36px] px-2.5 sm:px-4 py-1 sm:py-1.5 text-[11px] sm:text-xs font-semibold rounded-xl border backdrop-blur-md whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 transition-all duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${ctaGlass}`}
        >
          <FileText className="w-3.5 h-3.5 hidden sm:inline" aria-hidden="true" />
          <span className="sm:hidden">Quote</span>
          <span className="hidden sm:inline">Request Quote</span>
        </button>
      </div>
    </header>
  );
}
