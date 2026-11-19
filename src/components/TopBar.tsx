import type { LightingPreset, ModalId } from '../types/pole';
import { isDarkLighting } from '../utils/poleConfig';

interface TopBarProps {
  lighting: LightingPreset;
  activeModal: ModalId;
  totalPriceUsd: number;
  onOpenModal: (modal: ModalId) => void;
}

export function TopBar({
  lighting,
  activeModal,
  totalPriceUsd,
  onOpenModal,
}: TopBarProps) {
  const isDark = isDarkLighting(lighting);
  const isNeon = lighting === 'mood-neon';

  const headerClass = isNeon
    ? 'bg-[#0e1018]/92 border-white/10 text-zinc-100'
    : isDark
      ? 'bg-[#121110]/92 border-amber-500/20 text-stone-100'
      : 'bg-[#f4f3ef]/94 border-stone-300/80 text-stone-900';

  const activeLinkClass = isNeon
    ? 'border-violet-400 text-violet-300'
    : isDark
      ? 'border-amber-400 text-amber-300'
      : 'border-amber-700 text-amber-800';

  const idleLinkClass = isDark
    ? 'border-transparent text-zinc-400 hover:text-white'
    : 'border-transparent text-stone-600 hover:text-stone-950';

  const ctaClass = isNeon
    ? 'bg-zinc-100 text-zinc-950 hover:bg-white'
    : isDark
      ? 'bg-amber-500 text-stone-950 hover:bg-amber-400'
      : 'bg-stone-900 text-stone-50 hover:bg-stone-800';

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-30 h-12 px-4 sm:px-6 flex items-center justify-between gap-4 sm:gap-8 border-b transition-colors duration-200 ${headerClass}`}
    >
      {/* Zone 1: Single wordmark */}
      <span className="font-display text-sm sm:text-base font-bold tracking-tight whitespace-nowrap shrink-0">
        AxisPole Studio
      </span>

      {/* Zone 2: Minimal utility links */}
      <nav
        aria-label="Documentation and specifications"
        className="flex items-center gap-3.5 sm:gap-6"
      >
        <button
          type="button"
          onClick={() => onOpenModal('installation')}
          className={`text-xs font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded-xs ${
            activeModal === 'installation' ? activeLinkClass : idleLinkClass
          }`}
        >
          <span className="sm:hidden">Install</span>
          <span className="hidden sm:inline">Installation</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenModal('maintenance')}
          className={`text-xs font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded-xs ${
            activeModal === 'maintenance' ? activeLinkClass : idleLinkClass
          }`}
        >
          <span className="sm:hidden">Care</span>
          <span className="hidden sm:inline">Maintenance</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenModal('bom')}
          className={`text-xs font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded-xs ${
            activeModal === 'bom' ? activeLinkClass : idleLinkClass
          }`}
        >
          <span className="sm:hidden font-mono tabular-nums">${totalPriceUsd}</span>
          <span className="hidden sm:inline">
            Materials · <span className="font-mono tabular-nums">${totalPriceUsd}</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onOpenModal('export-ar')}
          className={`hidden md:inline-flex text-xs font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded-xs ${
            activeModal === 'export-ar' ? activeLinkClass : idleLinkClass
          }`}
        >
          AR
        </button>
      </nav>

      {/* Zone 3: Single primary action */}
      <div className="shrink-0">
        <button
          type="button"
          onClick={() => onOpenModal('export-ar')}
          className={`px-3 sm:px-3.5 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${ctaClass}`}
        >
          <span className="sm:hidden">CAD</span>
          <span className="hidden sm:inline">Export CAD</span>
        </button>
      </div>
    </header>
  );
}
