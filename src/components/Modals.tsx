import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Box,
  Camera,
  Check,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Lock,
  LogIn,
  Send,
  Smartphone,
  X,
} from 'lucide-react';
import type { ModalId, PoleRigConfig, PriceTierId } from '../types/pole';
import {
  exportXPoleQuoteToCSV,
  formatFeetInches,
  formatUsdExact,
  XPOLE_CATALOG,
  type XPoleQuoteSummary,
} from '../data/xpoleCatalog';
import { BASE_MOUNTS, POLE_FINISHES } from '../utils/poleConfig';
import type { CadFormat } from '../three/cadExporter';

interface ModalsProps {
  activeModal: ModalId;
  onClose: () => void;
  onOpenModal?: (modal: ModalId) => void;
  config: PoleRigConfig;
  quote: XPoleQuoteSummary;
  onChangePriceTier: (tier: PriceTierId) => void;
  onExportCAD: (format: CadFormat) => Promise<{ filename: string; bytes: number }>;
  onGenerateUSDZUrl: () => Promise<string>;
  onCaptureSnapshot: () => string | null;
  onStartArCamera: () => void;
}

const TIER_ORDER: PriceTierId[] = ['retail', 'wholesale20', 'wholesale30'];

export function Modals({
  activeModal,
  onClose,
  onOpenModal,
  config,
  quote,
  onChangePriceTier,
  onExportCAD,
  onGenerateUSDZUrl,
  onCaptureSnapshot,
  onStartArCamera,
}: ModalsProps) {
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<CadFormat | null>(null);
  const [quickLookUrl, setQuickLookUrl] = useState<string | null>(null);
  const [viewedQuoteTier, setViewedQuoteTier] = useState<PriceTierId>('retail');

  // Wholesale Account Login form state
  const [wholesaleEmail, setWholesaleEmail] = useState('');
  const [wholesaleAccountId, setWholesaleAccountId] = useState('');
  const [wholesaleMessage, setWholesaleMessage] = useState<string | null>(null);

  // Request Quote form state
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [studioName, setStudioName] = useState('');
  const [projectNotes, setProjectNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);

  useEffect(() => {
    setExportStatus(null);
    setFormError(null);
    setSubmittedRef(null);
    setWholesaleMessage(null);
    setViewedQuoteTier('retail');
    return () => {
      if (quickLookUrl) {
        URL.revokeObjectURL(quickLookUrl);
      }
    };
  }, [activeModal, quickLookUrl]);

  if (activeModal === 'none') return null;

  const isWholesaleLocked = viewedQuoteTier !== 'retail';

  const finish = POLE_FINISHES[config.finish];
  const mount = BASE_MOUNTS[config.mount];

  const handleCadExport = async (format: CadFormat) => {
    setExportingFormat(format);
    setExportStatus(null);
    try {
      const res = await onExportCAD(format);
      const kb = (res.bytes / 1024).toFixed(1);
      setExportStatus(`Exported ${res.filename} (${kb} KB)`);
    } catch (err) {
      setExportStatus(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExportingFormat(null);
    }
  };

  const handleDownloadQuoteCSV = () => {
    const csv = exportXPoleQuoteToCSV(quote);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xpole-quote-${quote.priceTier}-${quote.lines.length}poles.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportStatus('Downloaded official X-POLE quotation CSV.');
  };

  const handleDownloadSnapshot = () => {
    const dataUrl = onCaptureSnapshot();
    if (!dataUrl) {
      setExportStatus('Unable to capture 3D viewport snapshot.');
      return;
    }
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `xpole-room-${config.finish}-${config.ceilingHeightCm}cm.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setExportStatus('Saved 3D room PNG snapshot.');
  };

  const handlePrepareQuickLook = async () => {
    setExportingFormat('usdz');
    try {
      const url = await onGenerateUSDZUrl();
      setQuickLookUrl(url);
      setExportStatus('USDZ AR package ready. Tap "Open iOS Quick Look" on iPhone/iPad or download.');
    } catch {
      setExportStatus('Unable to package USDZ model.');
    } finally {
      setExportingFormat(null);
    }
  };

  const handleSubmitQuote = (e: FormEvent) => {
    e.preventDefault();
    const trimmedName = customerName.trim();
    const trimmedEmail = customerEmail.trim();
    if (!trimmedName) {
      setFormError('Please enter your name so we can address your X-POLE quote.');
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setFormError('Please enter a valid email address.');
      return;
    }
    if (!quote.allAvailable) {
      setFormError('One or more poles use a finish unavailable at that height. Switch finishes in Step 2 before submitting.');
      return;
    }
    setFormError(null);
    const code = `XP-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    setSubmittedRef(code);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/65 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-heading"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl max-h-[88vh] flex flex-col rounded-2xl border border-white/25 bg-[#faf9f6]/95 backdrop-blur-2xl text-stone-900 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-stone-200/80 flex items-center justify-between gap-4 bg-white/85 backdrop-blur-md">
          <div>
            <h2 id="modal-heading" className="text-base sm:text-lg font-bold tracking-tight">
              {activeModal === 'quote' && 'X-POLE Build a Pole — Official Quotation Request'}
              {activeModal === 'export-ar' && 'Export 3D CAD & AR Room Preview'}
              {activeModal === 'wholesale-login' && 'X-POLE Wholesale Account Login'}
            </h2>
            <p className="text-xs text-stone-600 mt-0.5">
              Room {config.roomWidthM.toFixed(1)}m × {config.roomDepthM.toFixed(1)}m · Ceiling{' '}
              <span className="font-mono tabular-nums">
                {formatFeetInches(config.ceilingHeightCm)} ({config.ceilingHeightCm * 10}mm)
              </span>{' '}
              · {config.ceilingType === 'vaulted' ? `Vaulted ${config.vaultAngleDeg}°` : 'Flat'} ·{' '}
              {quote.lines.length} {quote.lines.length === 1 ? 'Pole' : 'Poles'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 rounded-lg text-stone-500 hover:text-stone-950 hover:bg-stone-100 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* 1. OFFICIAL X-POLE REQUEST QUOTE MODAL */}
          {activeModal === 'quote' && (
            <div className="space-y-5" data-testid="quote-modal-content">
              {/* Pricing Tier Switcher + Export Tools */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-stone-200/80" role="group" aria-label="Quotation pricing tier">
                  {TIER_ORDER.map((tierId) => {
                    const meta = XPOLE_CATALOG.priceTiers[tierId];
                    const isWholesaleTier = tierId !== 'retail';
                    const active = viewedQuoteTier === tierId;
                    return (
                      <button
                        key={tierId}
                        type="button"
                        onClick={() => {
                          setViewedQuoteTier(tierId);
                          if (tierId === 'retail') onChangePriceTier('retail');
                        }}
                        title={
                          isWholesaleTier
                            ? 'Log in on a valid wholesale account to get the wholesale rates'
                            : 'Standard X-POLE retail pricing'
                        }
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 ${
                          active
                            ? 'bg-violet-700 text-white shadow-xs'
                            : 'text-stone-700 hover:text-stone-950'
                        }`}
                      >
                        {isWholesaleTier && <Lock className="w-3 h-3 shrink-0 opacity-85" aria-hidden="true" />}
                        <span className={isWholesaleTier ? 'blur-[1.3px] select-none opacity-90' : undefined}>
                          {meta.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadSnapshot}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-stone-300 bg-white hover:bg-stone-100 inline-flex items-center gap-1.5"
                  >
                    <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Save 3D PNG</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadQuoteCSV}
                    disabled={isWholesaleLocked}
                    data-testid="quote-download-csv"
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border border-stone-300 bg-white inline-flex items-center gap-1.5 ${
                      isWholesaleLocked ? 'opacity-45 cursor-not-allowed' : 'hover:bg-stone-100'
                    }`}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Download CSV</span>
                  </button>
                </div>
              </div>

              {/* Itemized X-POLE PX Table */}
              <div className="relative rounded-xl border border-stone-200 bg-white overflow-hidden">
                <div className={`overflow-x-auto transition-all duration-200 ${isWholesaleLocked ? 'blur-[6px] opacity-50 select-none pointer-events-none' : ''}`}>
                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-50 border-b border-stone-200 text-stone-600">
                      <tr>
                        <th className="py-2.5 px-3 font-semibold">Pole</th>
                        <th className="py-2.5 px-3 font-semibold">Auto-Matched PX Kit</th>
                        <th className="py-2.5 px-3 font-semibold">Finish &amp; Spec</th>
                        <th className="py-2.5 px-3 font-semibold">Included Hardware</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Price ({XPOLE_CATALOG.priceTiers[viewedQuoteTier].label})</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {quote.lines.map((line) => (
                        <tr key={line.poleId}>
                          <td className="py-2.5 px-3 font-semibold text-stone-950 whitespace-nowrap">
                            {line.poleLabel}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-mono font-bold text-violet-800 block">
                              {line.resolution.part.id}
                            </span>
                            <span className="font-mono text-[10.5px] text-stone-500">
                              {formatFeetInches(line.heightCm)} · {line.heightMm}mm
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-medium text-stone-900 block">
                              {line.finishLabel} · {line.diameterMm}mm
                            </span>
                            {line.resolution.notes.length > 0 && (
                              <span className="text-[10.5px] text-amber-700 block mt-0.5">
                                {line.resolution.notes[0]}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-[11px] text-stone-600">
                            {line.resolution.includedHardware.join(', ')}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-right font-semibold whitespace-nowrap">
                            {line.resolution.available ? (
                              <span className="text-stone-950">
                                {isWholesaleLocked ? '$•••.••' : formatUsdExact(line.lineRetailUsd)}
                              </span>
                            ) : (
                              <span className="text-rose-600">Unavailable</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-stone-50 border-t border-stone-200">
                      <tr>
                        <td colSpan={4} className="py-3 px-3 font-semibold text-stone-950">
                          Estimated Total ({quote.lines.length} {quote.lines.length === 1 ? 'Pole' : 'Poles'} · {XPOLE_CATALOG.priceTiers[viewedQuoteTier].label})
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums text-right text-sm font-bold text-violet-800">
                          {isWholesaleLocked ? '$•••.•• USD' : `${formatUsdExact(quote.retailTotalUsd)} USD`}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {isWholesaleLocked && (
                  <div className="absolute inset-0 bg-white/75 backdrop-blur-md flex flex-col items-center justify-center gap-3 p-5 text-center">
                    <div className="w-10 h-10 rounded-xl bg-violet-100 border border-violet-300 text-violet-700 flex items-center justify-center">
                      <Lock className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <div className="space-y-1 max-w-sm">
                      <h3 className="text-sm font-bold text-stone-950">
                        {XPOLE_CATALOG.priceTiers[viewedQuoteTier].label} Pricing Requires Login
                      </h3>
                      <p className="text-xs text-stone-600">
                        Log in on a valid wholesale account to get the wholesale rates.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {onOpenModal && (
                        <button
                          type="button"
                          onClick={() => onOpenModal('wholesale-login')}
                          className="px-3.5 py-2 rounded-xl bg-violet-700 hover:bg-violet-600 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Wholesale Account Login</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setViewedQuoteTier('retail')}
                        className="px-3 py-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-100 text-stone-800 text-xs font-semibold"
                      >
                        Back to Retail
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {!quote.allAvailable && (
                <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>
                    {quote.unavailableCount} pole configuration is unavailable in the selected finish at its current height. Adjust the finish in Step 2 before submitting.
                  </span>
                </div>
              )}

              {/* Quote Submission Form or Confirmation */}
              {submittedRef ? (
                <div
                  className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-950 space-y-2"
                  data-testid="quote-submitted-banner"
                >
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
                    <span>X-POLE Quotation Prepared · Ref #{submittedRef}</span>
                  </div>
                  <p className="text-xs text-emerald-900">
                    Summary logged for <strong>{customerName}</strong> ({customerEmail}) at{' '}
                    <strong>{formatUsdExact(quote.totalUsd)}</strong> ({quote.priceTierLabel}). You can also download the itemized CSV above for direct studio ordering.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmitQuote} className="p-4 rounded-xl border border-stone-200 bg-white space-y-3">
                  <h3 className="text-sm font-semibold text-stone-950">Send Quotation Details</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="quote-name" className="block text-[11px] font-semibold text-stone-700 mb-1">
                        Full Name *
                      </label>
                      <input
                        id="quote-name"
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Alex Rivera"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 bg-white text-stone-950 focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="quote-email" className="block text-[11px] font-semibold text-stone-700 mb-1">
                        Email Address *
                      </label>
                      <input
                        id="quote-email"
                        type="email"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        placeholder="studio@example.com"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 bg-white text-stone-950 focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="quote-studio" className="block text-[11px] font-semibold text-stone-700 mb-1">
                        Studio / Organization (Optional)
                      </label>
                      <input
                        id="quote-studio"
                        type="text"
                        value={studioName}
                        onChange={(e) => setStudioName(e.target.value)}
                        placeholder="Elevation Aerial Studio"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 bg-white text-stone-950 focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="quote-notes" className="block text-[11px] font-semibold text-stone-700 mb-1">
                        Delivery / Ceiling Notes (Optional)
                      </label>
                      <input
                        id="quote-notes"
                        type="text"
                        value={projectNotes}
                        onChange={(e) => setProjectNotes(e.target.value)}
                        placeholder="Joist spacing, preferred timeline..."
                        className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 bg-white text-stone-950 focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                  </div>

                  {formError && (
                    <p className="text-xs text-rose-600 font-medium" role="alert">
                      {formError}
                    </p>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      data-testid="quote-submit-btn"
                      className="px-4 py-2 text-xs font-semibold rounded-lg bg-violet-700 text-white hover:bg-violet-600 inline-flex items-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Submit Quote Request</span>
                    </button>
                  </div>
                </form>
              )}

              {exportStatus && (
                <p className="text-xs text-teal-700 font-medium flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{exportStatus}</span>
                </p>
              )}
            </div>
          )}

          {/* 2. CAD EXPORT & AR PREVIEW MODAL */}
          {activeModal === 'export-ar' && (
            <div className="space-y-5">
              <div className="space-y-2.5">
                <h3 className="text-sm font-semibold text-stone-950">
                  Export Assembled 3D Geometry (1:1 Metric Scale)
                </h3>
                <p className="text-xs text-stone-600">
                  Exports your exact configured height ({(config.ceilingHeightCm / 100).toFixed(2)}
                  m), {config.diameterMm}mm column, and {mount.shortName} hardware directly from the
                  live 3D assembly—excluding room geometry and UI overlays.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {(
                    [
                      {
                        fmt: 'stl' as CadFormat,
                        title: 'Binary STL (.stl)',
                        desc: 'SolidWorks, Fusion 360, AutoCAD & CNC fabrication mesh.',
                      },
                      {
                        fmt: 'obj' as CadFormat,
                        title: 'Wavefront OBJ (.obj)',
                        desc: 'Universal 3D CAD, Rhino, SketchUp & architectural interchange.',
                      },
                      {
                        fmt: 'glb' as CadFormat,
                        title: 'glTF 2.0 Binary (.glb)',
                        desc: 'PBR materials embedded for Blender, Three.js & Android AR Scene Viewer.',
                      },
                      {
                        fmt: 'usdz' as CadFormat,
                        title: 'Apple USDZ (.usdz)',
                        desc: 'Native iOS/iPadOS AR Quick Look & VisionOS spatial format.',
                      },
                    ]
                  ).map((item) => (
                    <button
                      key={item.fmt}
                      type="button"
                      disabled={exportingFormat !== null}
                      onClick={() => handleCadExport(item.fmt)}
                      className="p-3.5 rounded-lg border border-stone-200 bg-white hover:border-violet-600 hover:bg-violet-50/30 text-left transition-colors flex items-start justify-between gap-3 disabled:opacity-60"
                    >
                      <div>
                        <span className="text-xs font-semibold text-stone-950 flex items-center gap-1.5">
                          <Box className="w-3.5 h-3.5 text-violet-700" aria-hidden="true" />
                          <span>{item.title}</span>
                        </span>
                        <span className="block text-[11px] text-stone-600 mt-1 leading-snug">
                          {item.desc}
                        </span>
                      </div>
                      <span className="shrink-0 mt-0.5 text-stone-700">
                        <Download className="w-4 h-4" aria-hidden="true" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-lg border border-stone-200 bg-white space-y-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-violet-700" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-stone-950">
                    AR Real-World Room Preview
                  </h3>
                </div>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Measure your real ceiling height and room footprint using your camera and preview the {finish.shortName} pole at 1:1 scale in your room.
                </p>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onStartArCamera();
                    }}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-stone-900 text-white hover:bg-stone-800 inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Launch AR Room Measure</span>
                  </button>

                  {!quickLookUrl ? (
                    <button
                      type="button"
                      disabled={exportingFormat !== null}
                      onClick={handlePrepareQuickLook}
                      className="px-4 py-2 text-xs font-semibold rounded-lg border border-stone-300 bg-white hover:bg-stone-100 whitespace-nowrap"
                    >
                      Prepare iOS Quick Look (USDZ)
                    </button>
                  ) : (
                    <a
                      rel="ar"
                      href={quickLookUrl}
                      download={`xpole-${config.finish}.usdz`}
                      className="px-4 py-2 text-xs font-semibold rounded-lg bg-violet-700 text-white hover:bg-violet-600 whitespace-nowrap"
                    >
                      Open iOS Quick Look AR
                    </a>
                  )}
                </div>
              </div>

              {exportStatus && (
                <div
                  role="status"
                  className="px-3.5 py-2.5 rounded-lg border border-teal-200 bg-teal-50 text-teal-900 text-xs font-medium flex items-center gap-2"
                >
                  <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{exportStatus}</span>
                </div>
              )}
            </div>
          )}

          {/* 3. WHOLESALE ACCOUNT LOGIN MODAL */}
          {activeModal === 'wholesale-login' && (
            <form
              data-testid="wholesale-login-modal"
              onSubmit={(e) => {
                e.preventDefault();
                if (!wholesaleEmail.trim() || !wholesaleAccountId.trim()) {
                  setWholesaleMessage('Please enter both your trade email address and your X-POLE Wholesale Account ID.');
                  return;
                }
                setWholesaleMessage(
                  'Wholesale authentication requires a verified X-POLE Trade Account backend connection. Contact your X-POLE Wholesale Representative or continue using Retail pricing.'
                );
              }}
              className="space-y-4 max-w-md mx-auto py-2"
            >
              <div className="flex flex-col items-center text-center space-y-2">
                <img
                  src="/assets/aistudio/logo-xpole-removebg-preview_fe7bd6d2.png"
                  alt="X-POLE"
                  className="h-7 w-auto object-contain"
                />
                <p className="text-xs text-stone-600">
                  Log in on a valid X-POLE wholesale or studio trade account to unlock <strong>Wholesale 20%</strong> and <strong>Wholesale 30%</strong> rates.
                </p>
              </div>

              <div className="space-y-3 p-4 rounded-xl border border-stone-200 bg-white">
                <div>
                  <label htmlFor="wholesale-email" className="block text-[11px] font-semibold text-stone-700 mb-1">
                    Wholesale Account Email
                  </label>
                  <input
                    id="wholesale-email"
                    type="email"
                    value={wholesaleEmail}
                    onChange={(e) => setWholesaleEmail(e.target.value)}
                    placeholder="buyer@yourstudio.com"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 bg-white text-stone-950 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label htmlFor="wholesale-account-id" className="block text-[11px] font-semibold text-stone-700 mb-1">
                    X-POLE Partner / Trade ID
                  </label>
                  <input
                    id="wholesale-account-id"
                    type="text"
                    value={wholesaleAccountId}
                    onChange={(e) => setWholesaleAccountId(e.target.value)}
                    placeholder="XP-TRADE-XXXX"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 bg-white text-stone-950 font-mono focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              </div>

              {wholesaleMessage && (
                <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-xs flex items-start gap-2">
                  <Lock className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" aria-hidden="true" />
                  <span>{wholesaleMessage}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-100 text-xs font-semibold text-stone-700"
                >
                  Continue with Retail
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-violet-700 hover:bg-violet-600 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Verify Wholesale Account</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
