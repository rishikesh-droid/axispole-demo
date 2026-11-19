import { useState } from 'react';
import { Camera, Menu, X } from 'lucide-react';
import type { LightingPreset, ModalId } from '../types/pole';
import { isDarkLighting } from '../utils/poleConfig';

interface TopBarProps {
  lighting: LightingPreset;
  activeModal: ModalId;
  totalPriceUsd: number;
  arCameraActive: boolean;
  onOpenModal: (modal: ModalId) => void;
  onStartArCamera: () => void;
}

export function TopBar({
  lighting,
  activeModal,
  totalPriceUsd,
  arCameraActive,
  onOpenModal,
  onStartArCamera,
}: TopBarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // AR Measurement mode renders its own dedicated minimal top bar
  if (arCameraActive) return null;

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

  const arMobileBtnClass = isNeon
    ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-200 hover:bg-cyan-400/25'
    : isDark
      ? 'border-amber-400/60 bg-amber-500/18 text-amber-200 hover:bg-amber-500/28'
      : 'border-stone-900/25 bg-stone-900/8 text-stone-900 hover:bg-stone-900/15';

  const menuSurfaceClass = isNeon
    ? 'bg-[#11131d]/96 border-violet-400/25 text-zinc-100'
    : isDark
      ? 'bg-[#161412]/96 border-amber-500/25 text-stone-100'
      : 'bg-[#faf9f6]/97 border-stone-300 text-stone-900';

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-30 h-11 sm:h-12 px-3 sm:px-6 flex items-center justify-between gap-2.5 md:gap-8 border-b transition-colors duration-200 ${headerClass}`}
      >
        {/* Zone 1: Single wordmark */}
        <span className="font-display text-sm sm:text-base font-bold tracking-tight whitespace-nowrap shrink-0">
          <span className="sm:hidden">AxisPole</span>
          <span className="hidden sm:inline">AxisPole Studio</span>
        </span>

        {/* Zone 2: Desktop Navigation Links (4 concise single-line links) */}
        <nav
          aria-label="Documentation and specifications"
          className="hidden md:flex items-center gap-6"
        >
          <button
            type="button"
            onClick={() => onOpenModal('installation')}
            className={`text-xs font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded-xs ${
              activeModal === 'installation' ? activeLinkClass : idleLinkClass
            }`}
          >
            Installation
          </button>

          <button
            type="button"
            onClick={() => onOpenModal('maintenance')}
            className={`text-xs font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded-xs ${
              activeModal === 'maintenance' ? activeLinkClass : idleLinkClass
            }`}
          >
            Maintenance
          </button>

          <button
            type="button"
            onClick={() => onOpenModal('bom')}
            className={`text-xs font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded-xs ${
              activeModal === 'bom' ? activeLinkClass : idleLinkClass
            }`}
          >
            Materials · <span className="font-mono tabular-nums">${totalPriceUsd}</span>
          </button>

          <button
            type="button"
            onClick={onStartArCamera}
            data-testid="desktop-ar-button"
            className={`text-xs font-medium whitespace-nowrap shrink-0 py-1 border-b-2 inline-flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded-xs ${idleLinkClass}`}
          >
            <Camera className="w-3.5 h-3.5" aria-hidden="true" />
            <span>AR Measure</span>
          </button>
        </nav>

        {/* Zone 3: Desktop Single Primary CTA + Mobile Clean Action Cluster (AR always visible!) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Mobile Prominent AR Room Measure Button */}
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              onStartArCamera();
            }}
            data-testid="mobile-ar-button"
            className={`md:hidden min-h-[32px] px-2.5 py-1 text-[11px] font-semibold rounded-lg border inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors ${arMobileBtnClass}`}
          >
            <Camera className="w-3.5 h-3.5" aria-hidden="true" />
            <span>AR Room</span>
          </button>

          {/* Primary Export CAD CTA */}
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              onOpenModal('export-ar');
            }}
            className={`min-h-[32px] sm:min-h-[34px] px-2.5 sm:px-3.5 py-1 sm:py-1.5 text-[11px] sm:text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${ctaClass}`}
          >
            <span className="sm:hidden">CAD</span>
            <span className="hidden sm:inline">Export CAD</span>
          </button>

          {/* Mobile Drawer Menu Trigger for Docs & Materials */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((o) => !o)}
            aria-expanded={mobileMenuOpen}
            aria-label="Open studio menu"
            data-testid="mobile-menu-button"
            className={`md:hidden min-h-[32px] min-w-[32px] rounded-lg border flex items-center justify-center transition-colors ${
              isDark
                ? 'border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10'
                : 'border-stone-300 bg-white text-stone-800 hover:bg-stone-100'
            }`}
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Mobile Sleek Dropdown Menu for Guides & BOM */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-40"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className={`fixed top-14 right-3 w-56 rounded-xl border p-1.5 shadow-2xl ${menuSurfaceClass}`}
            onClick={(e) => e.stopPropagation()}
            role="menu"
            aria-label="Mobile studio links"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenModal('installation');
              }}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                isDark ? 'hover:bg-white/10' : 'hover:bg-stone-200/70'
              }`}
            >
              <span>Installation &amp; Dismantle</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenModal('maintenance');
              }}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                isDark ? 'hover:bg-white/10' : 'hover:bg-stone-200/70'
              }`}
            >
              <span>Maintenance Guide</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenModal('bom');
              }}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                isDark ? 'hover:bg-white/10' : 'hover:bg-stone-200/70'
              }`}
            >
              <span>Materials List</span>
              <span className="font-mono tabular-nums font-semibold">${totalPriceUsd}</span>
            </button>
            <div className={`my-1 border-t ${isDark ? 'border-white/10' : 'border-stone-200'}`} />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMobileMenuOpen(false);
                onStartArCamera();
              }}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors ${
                isNeon ? 'text-cyan-300 hover:bg-cyan-400/15' : 'text-amber-600 hover:bg-amber-500/15'
              }`}
            >
              <span>Measure Room in AR</span>
              <Camera className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
