import { useEffect, useState } from 'react';
import {
  Box,
  Camera,
  Check,
  Download,
  FileSpreadsheet,
  Package,
  Play,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Wrench,
  X,
} from 'lucide-react';
import type {
  BOMSummary,
  ModalId,
  PoleRigConfig,
} from '../types/pole';
import {
  ASSEMBLY_STEPS,
  BASE_MOUNTS,
  exportBOMToCSV,
  formatHeightMetricAndImperial,
  POLE_FINISHES,
} from '../utils/poleConfig';
import type { CadFormat } from '../three/cadExporter';

interface ModalsProps {
  activeModal: ModalId;
  onClose: () => void;
  config: PoleRigConfig;
  bom: BOMSummary;
  onExportCAD: (format: CadFormat) => Promise<{ filename: string; bytes: number }>;
  onGenerateUSDZUrl: () => Promise<string>;
  onLaunchAssemblyDemo: (mode: 'assemble' | 'dismantle') => void;
  onStartArCamera: () => void;
}

export function Modals({
  activeModal,
  onClose,
  config,
  bom,
  onExportCAD,
  onGenerateUSDZUrl,
  onLaunchAssemblyDemo,
  onStartArCamera,
}: ModalsProps) {
  const [installTab, setInstallTab] = useState<'install' | 'dismantle'>('install');
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<CadFormat | null>(null);
  const [quickLookUrl, setQuickLookUrl] = useState<string | null>(null);
  const [checkedMaintenance, setCheckedMaintenance] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setExportStatus(null);
    return () => {
      if (quickLookUrl) {
        URL.revokeObjectURL(quickLookUrl);
      }
    };
  }, [activeModal, quickLookUrl]);

  if (activeModal === 'none') return null;

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

  const handleDownloadCSV = () => {
    const csv = exportBOMToCSV(bom, config);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `axispole-bom-${config.finish}-${config.ceilingHeightCm}cm.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportStatus('Downloaded itemized Bill of Materials CSV.');
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

  const toggleChecklist = (key: string) => {
    setCheckedMaintenance((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-heading"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl max-h-[86vh] flex flex-col rounded-xl border border-stone-300 bg-[#faf9f6] text-stone-900 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between gap-4 bg-white">
          <div>
            <h2 id="modal-heading" className="text-lg font-bold tracking-tight">
              {activeModal === 'installation' && 'Installation & Quick Dismantle Manual'}
              {activeModal === 'maintenance' && `Maintenance & Care Guide — ${finish.name}`}
              {activeModal === 'bom' && 'Configuration Materials List & Pricing'}
              {activeModal === 'export-ar' && 'CAD File Export & Real-World AR Preview'}
            </h2>
            <p className="text-xs text-stone-600 mt-0.5">
              {finish.name} · {config.diameterMm}mm · {mount.name} ·{' '}
              <span className="font-mono tabular-nums">
                {formatHeightMetricAndImperial(config.ceilingHeightCm)}
              </span>
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
          {/* 1. INSTALLATION & QUICK DISMANTLE MODAL */}
          {activeModal === 'installation' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1 p-1 bg-stone-200/80 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setInstallTab('install')}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                      installTab === 'install'
                        ? 'bg-white text-stone-950 shadow-xs'
                        : 'text-stone-600 hover:text-stone-950'
                    }`}
                  >
                    Step-by-Step Installation
                  </button>
                  <button
                    type="button"
                    onClick={() => setInstallTab('dismantle')}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                      installTab === 'dismantle'
                        ? 'bg-white text-stone-950 shadow-xs'
                        : 'text-stone-600 hover:text-stone-950'
                    }`}
                  >
                    Quick Dismantle &amp; Storage
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onLaunchAssemblyDemo(installTab === 'install' ? 'assemble' : 'dismantle');
                  }}
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-stone-900 text-white hover:bg-stone-800 inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  {installTab === 'install' ? (
                    <>
                      <Play className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Play 3D Assembly Animation</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Play 3D Breakdown Animation</span>
                    </>
                  )}
                </button>
              </div>

              {installTab === 'install' ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-lg border border-stone-200 bg-white text-xs">
                    <div>
                      <span className="text-stone-500 block">Mount Interface</span>
                      <strong className="font-semibold text-stone-900">{mount.name}</strong>
                      <span className="block text-stone-600 mt-0.5">
                        {mount.drillingRequired
                          ? 'Requires structural timber/concrete anchors'
                          : 'Zero drilling · Floor & joist friction'}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-500 block">Required Extensions</span>
                      <strong className="font-mono tabular-nums text-stone-900">
                        {bom.heightSolution.extensions.length > 0
                          ? bom.heightSolution.extensions.map((e) => `${e.lengthMm}mm`).join(' + ')
                          : 'None (A+B Base Stack)'}
                      </strong>
                      <span className="block font-mono tabular-nums text-stone-600 mt-0.5">
                        Adjuster travel: {bom.heightSolution.adjusterTravelMm}mm / 125mm max
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-500 block">Mount Fastener Spec</span>
                      <strong className="font-semibold text-stone-900">{mount.fastenerSpec}</strong>
                      <span className="block font-mono tabular-nums text-amber-700 mt-0.5">
                        Target torque: {mount.torqueNm} N·m
                      </span>
                    </div>
                  </div>

                  <ol className="space-y-3">
                    {ASSEMBLY_STEPS.map((st) => (
                      <li
                        key={st.id}
                        className="p-4 rounded-lg border border-stone-200 bg-white space-y-1.5"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <h3 className="text-sm font-semibold text-stone-950">
                            0{st.step}. {st.title}
                          </h3>
                          <span className="font-mono text-xs font-semibold tabular-nums text-amber-700">
                            {st.torqueNm > 0
                              ? `${st.torqueNm.toFixed(1)} N·m (${st.torqueFtLb.toFixed(1)} ft-lb)`
                              : 'Hand-level seat'}
                          </span>
                        </div>
                        <p className="text-xs text-stone-700 leading-relaxed">
                          {st.installInstruction}
                        </p>
                        <div className="pt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-stone-500">
                          <span>Fastener: {st.fastener}</span>
                          <span aria-hidden="true">·</span>
                          <span>Tool: {st.toolRequired}</span>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-lg border border-stone-200 bg-white text-xs">
                    <div className="flex items-start gap-2.5">
                      <Package className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                      <div>
                        <span className="text-stone-500 block">Compact Packed Length</span>
                        <strong className="font-mono tabular-nums text-sm text-stone-950">
                          {bom.packedLengthCm} cm
                        </strong>
                        <span className="block text-stone-600 mt-0.5">
                          Fits in {bom.packedBagsCount} padded carry{' '}
                          {bom.packedBagsCount === 1 ? 'case' : 'cases'}
                        </span>
                      </div>
                    </div>
                    <div>
                      <span className="text-stone-500 block">Total Carry Weight</span>
                      <strong className="font-mono tabular-nums text-sm text-stone-950">
                        {bom.totalWeightKg} kg
                      </strong>
                      <span className="block text-stone-600 mt-0.5">
                        Estimated breakdown time: 6–8 minutes
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-500 block">Storage Climate</span>
                      <strong className="text-stone-950">Dry, 10°C – 32°C</strong>
                      <span className="block text-stone-600 mt-0.5">
                        Store tubes flat with protective end caps fitted
                      </span>
                    </div>
                  </div>

                  <ol className="space-y-3">
                    {[...ASSEMBLY_STEPS].reverse().map((st, idx) => (
                      <li
                        key={`dismantle-${st.id}`}
                        className="p-4 rounded-lg border border-stone-200 bg-white space-y-1"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <h3 className="text-sm font-semibold text-stone-950">
                            0{idx + 1}. Reverse Step {st.step} — {st.title}
                          </h3>
                          <span className="font-mono text-[11px] text-stone-500">
                            Tool: {st.toolRequired}
                          </span>
                        </div>
                        <p className="text-xs text-stone-700 leading-relaxed">
                          {st.dismantleInstruction}
                        </p>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </>
          )}

          {/* 2. MAINTENANCE GUIDE MODAL */}
          {activeModal === 'maintenance' && (
            <div className="space-y-5">
              <div className="p-4 rounded-lg border border-stone-200 bg-white space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-stone-950">
                    Finish-Specific Surface Care: {finish.name}
                  </h3>
                  <span className="text-xs font-medium text-amber-700">{finish.gripLevel}</span>
                </div>
                <p className="text-xs text-stone-600">{finish.summary}</p>
                <p className="text-xs pt-1">
                  <strong className="text-stone-900">Recommended Cleaner:</strong>{' '}
                  <span className="text-stone-700">{finish.cleaningAgent}</span>
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-stone-100">
                  <div>
                    <h4 className="text-xs font-semibold text-teal-800 mb-1.5">
                      Approved Maintenance Procedure
                    </h4>
                    <ul className="space-y-1.5 text-xs text-stone-700 list-disc pl-4">
                      {finish.cleaningNotes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-red-800 mb-1.5">
                      Avoid (Finish Damage Risk)
                    </h4>
                    <ul className="space-y-1.5 text-xs text-stone-700 list-disc pl-4">
                      {finish.avoidList.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Periodic Mechanical Inspection Schedule */}
              <div className="rounded-lg border border-stone-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-stone-200 flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-stone-700" aria-hidden="true" />
                  <h3 className="text-sm font-semibold">Mechanical Torque &amp; Bearing Schedule</h3>
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-50 border-b border-stone-200 text-stone-600">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Interval</th>
                      <th className="py-2.5 px-4 font-semibold">Hardware Component</th>
                      <th className="py-2.5 px-4 font-semibold">Verification Standard</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    <tr>
                      <td className="py-2.5 px-4 font-medium">Before Every Session</td>
                      <td className="py-2.5 px-4">Base &amp; Ceiling Tension</td>
                      <td className="py-2.5 px-4">
                        Firm lateral push test at chest height; zero creak or top dome creep.
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 font-medium">Every 14 Days</td>
                      <td className="py-2.5 px-4">Internal X-Joint Drawbolts</td>
                      <td className="py-2.5 px-4 font-mono tabular-nums">
                        Re-torque to 18.0 N·m (5mm hex key) · verify flush joint seam.
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 font-medium">Monthly</td>
                      <td className="py-2.5 px-4">Spin-Lock M6 Hex Screws</td>
                      <td className="py-2.5 px-4 font-mono tabular-nums">
                        Inspect socket walls for wear; torque to 8.5 N·m in Static mode.
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 font-medium">Every 6 Months</td>
                      <td className="py-2.5 px-4">Sealed Ball-Bearing Cartridge</td>
                      <td className="py-2.5 px-4">
                        Spin freely without drag or grit sound. Sealed bearings require no grease;
                        replace cartridge if lateral play exceeds 0.5mm.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Interactive Pre-Session Safety Checklist */}
              <div className="p-4 rounded-lg border border-stone-200 bg-white space-y-2.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-teal-700" aria-hidden="true" />
                  <h3 className="text-sm font-semibold">Pre-Session Safety Inspection</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    ['plumb', 'Pole verified plumb (vertical) on two 90° axes'],
                    ['jam-nuts', 'Both M8 adjuster jam nuts locked tight at 10 N·m'],
                    ['spin-pins', 'Spin/Static lock pins fully seated or fully retracted'],
                    ['clearance', `Floor clear within ${(Math.min(config.roomWidthM, config.roomDepthM) / 2).toFixed(2)}m radius`],
                  ].map(([id, text]) => (
                    <label
                      key={id}
                      className="flex items-start gap-2.5 p-2.5 rounded-md border border-stone-200 hover:bg-stone-50 cursor-pointer text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(checkedMaintenance[id])}
                        onChange={() => toggleChecklist(id)}
                        className="mt-0.5 rounded border-stone-400 accent-amber-700"
                      />
                      <span className={checkedMaintenance[id] ? 'line-through text-stone-400' : 'text-stone-800'}>
                        {text}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 3. MATERIALS LIST & PRICING (BOM) MODAL */}
          {activeModal === 'bom' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-stone-600">
                  All hardware matched to{' '}
                  <strong className="text-stone-950">{finish.alloy}</strong> · Total Rig Mass:{' '}
                  <strong className="font-mono tabular-nums text-stone-950">
                    {bom.totalWeightKg} kg
                  </strong>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadCSV}
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-stone-300 bg-white hover:bg-stone-100 inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Download BOM CSV</span>
                </button>
              </div>

              <div className="rounded-lg border border-stone-200 bg-white overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-50 border-b border-stone-200 text-stone-600">
                    <tr>
                      <th className="py-2.5 px-3.5 font-semibold">SKU</th>
                      <th className="py-2.5 px-3.5 font-semibold">Component &amp; Alloy</th>
                      <th className="py-2.5 px-3.5 font-semibold text-right">Qty</th>
                      <th className="py-2.5 px-3.5 font-semibold text-right">Weight</th>
                      <th className="py-2.5 px-3.5 font-semibold text-right">Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {bom.items.map((item) => (
                      <tr key={item.sku}>
                        <td className="py-2.5 px-3.5 font-mono text-[11px] text-stone-500 whitespace-nowrap">
                          {item.sku}
                        </td>
                        <td className="py-2.5 px-3.5">
                          <span className="font-medium text-stone-950 block">{item.name}</span>
                          <span className="text-[11px] text-stone-500">{item.material}</span>
                        </td>
                        <td className="py-2.5 px-3.5 font-mono tabular-nums text-right">
                          {item.quantity}
                        </td>
                        <td className="py-2.5 px-3.5 font-mono tabular-nums text-right whitespace-nowrap">
                          {(item.unitWeightKg * item.quantity).toFixed(2)} kg
                        </td>
                        <td className="py-2.5 px-3.5 font-mono tabular-nums text-right font-semibold whitespace-nowrap">
                          {item.totalPriceUsd === 0 ? 'Included' : `$${item.totalPriceUsd}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-stone-50 border-t border-stone-200">
                    <tr>
                      <td colSpan={3} className="py-3 px-3.5 font-semibold text-stone-900">
                        Total Configured Rig
                      </td>
                      <td className="py-3 px-3.5 font-mono tabular-nums text-right font-semibold">
                        {bom.totalWeightKg} kg
                      </td>
                      <td className="py-3 px-3.5 font-mono tabular-nums text-right text-sm font-bold text-stone-950">
                        ${bom.totalPriceUsd} USD
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {exportStatus && (
                <p className="text-xs text-teal-700 font-medium flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{exportStatus}</span>
                </p>
              )}
            </div>
          )}

          {/* 4. CAD EXPORT & AR PREVIEW MODAL */}
          {activeModal === 'export-ar' && (
            <div className="space-y-5">
              {/* CAD Formats Section */}
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
                      className="p-3.5 rounded-lg border border-stone-200 bg-white hover:border-amber-600 hover:bg-amber-50/30 text-left transition-colors flex items-start justify-between gap-3 disabled:opacity-60"
                    >
                      <div>
                        <span className="text-xs font-semibold text-stone-950 flex items-center gap-1.5">
                          <Box className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" />
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

              {/* AR Real-World Space Preview Section */}
              <div className="p-4 rounded-lg border border-stone-200 bg-white space-y-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-amber-700" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-stone-950">
                    AR Real-World Room Preview
                  </h3>
                </div>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Measure your real ceiling height and room footprint using your camera, get an automatic mount and extension recommendation, and preview the {finish.shortName} pole at 1:1 scale in your room.
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
                      download={`axispole-${config.finish}.usdz`}
                      className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-500 whitespace-nowrap"
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
        </div>
      </div>
    </div>
  );
}
