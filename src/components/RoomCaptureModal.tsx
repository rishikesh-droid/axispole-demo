import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  ArrowLeftRight,
  Camera,
  Check,
  ImagePlus,
  Loader2,
  RotateCw,
  Trash2,
  Upload,
  Video,
  VideoOff,
  X,
} from 'lucide-react';
import type { LightingPreset, RoomReplicaScene, RoomWallSlotId } from '../types/pole';
import { isDarkLighting } from '../utils/poleConfig';
import {
  buildFourWallRoomReplica,
  rotateWallSlotsClockwise,
  swapWallSlots,
  WALL_SLOT_META,
  WALL_SLOT_ORDER,
} from '../utils/fourWallReconstructor';

interface RoomCaptureModalProps {
  open: boolean;
  lighting: LightingPreset;
  ceilingHeightCm: number;
  photos: Record<RoomWallSlotId, string | null>;
  onChangePhotos: Dispatch<SetStateAction<Record<RoomWallSlotId, string | null>>>;
  onClose: () => void;
  onGenerateRoom: (scene: RoomReplicaScene) => void;
}

export function RoomCaptureModal({
  open,
  lighting,
  ceilingHeightCm,
  photos,
  onChangePhotos,
  onClose,
  onGenerateRoom,
}: RoomCaptureModalProps) {
  const [activeSlot, setActiveSlot] = useState<RoomWallSlotId>('back');
  const [inputMode, setInputMode] = useState<'camera' | 'preview'>('camera');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [swapSource, setSwapSource] = useState<RoomWallSlotId | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const singleUploadRef = useRef<HTMLInputElement | null>(null);
  const batchUploadRef = useRef<HTMLInputElement | null>(null);

  const isDark = isDarkLighting(lighting);

  const capturedCount = WALL_SLOT_ORDER.filter((slot) => Boolean(photos[slot])).length;
  const allCaptured = capturedCount === 4;
  const activePhoto = photos[activeSlot];
  const activeMeta = WALL_SLOT_META[activeSlot];

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Live camera unavailable on this device. Upload photos of your 4 walls instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraReady(true);
    } catch {
      setCameraError('Camera access unavailable. Use Upload Photo to add each wall.');
    }
  }, [stopCamera]);

  // Manage camera stream lifecycle strictly while modal is open & in camera mode
  useEffect(() => {
    if (!open) {
      stopCamera();
      setSwapSource(null);
      setGenError(null);
      return;
    }
    if (inputMode === 'camera') {
      void startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [open, inputMode, startCamera, stopCamera]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isGenerating) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, isGenerating, onClose]);

  const advanceToNextEmptySlot = useCallback(
    (nextPhotos: Record<RoomWallSlotId, string | null>, fromSlot: RoomWallSlotId) => {
      const startIdx = WALL_SLOT_ORDER.indexOf(fromSlot);
      for (let step = 1; step <= WALL_SLOT_ORDER.length; step++) {
        const candidate = WALL_SLOT_ORDER[(startIdx + step) % WALL_SLOT_ORDER.length];
        if (!nextPhotos[candidate]) {
          setActiveSlot(candidate);
          return;
        }
      }
    },
    []
  );

  const handleCaptureFromCamera = () => {
    const video = videoRef.current;
    if (!video || !cameraReady || video.videoWidth < 16 || video.videoHeight < 16) return;

    const maxDim = 960;
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.max(120, Math.round(video.videoWidth * scale));
    const h = Math.max(120, Math.round(video.videoHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.86);

    const next = { ...photos, [activeSlot]: dataUrl };
    onChangePhotos(next);
    setGenError(null);
    advanceToNextEmptySlot(next, activeSlot);
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') resolve(reader.result);
        else reject(new Error('Could not read image file'));
      };
      reader.onerror = () => reject(new Error('Failed to load selected image'));
      reader.readAsDataURL(file);
    });

  const handleSingleWallFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
      const dataUrl = await readFileAsDataUrl(files[0]);
      const next = { ...photos, [activeSlot]: dataUrl };
      onChangePhotos(next);
      setInputMode('preview');
      setGenError(null);
      advanceToNextEmptySlot(next, activeSlot);
    } catch {
      setGenError('Could not read that image. Please try another photo.');
    } finally {
      e.target.value = '';
    }
  };

  const handleBatchUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 4);
    if (files.length === 0) return;
    try {
      const urls = await Promise.all(files.map(readFileAsDataUrl));
      const next: Record<RoomWallSlotId, string | null> = { ...photos };

      if (urls.length === 4) {
        WALL_SLOT_ORDER.forEach((slot, idx) => {
          next[slot] = urls[idx];
        });
      } else {
        // Fill empty slots first starting from activeSlot, then overwrite if needed
        const startIdx = WALL_SLOT_ORDER.indexOf(activeSlot);
        const orderedSlots = [
          ...WALL_SLOT_ORDER.slice(startIdx),
          ...WALL_SLOT_ORDER.slice(0, startIdx),
        ];
        const emptyFirst = [
          ...orderedSlots.filter((s) => !next[s]),
          ...orderedSlots.filter((s) => Boolean(next[s])),
        ];
        urls.forEach((url, idx) => {
          const targetSlot = emptyFirst[idx];
          if (targetSlot) next[targetSlot] = url;
        });
      }

      onChangePhotos(next);
      setInputMode('preview');
      setGenError(null);
      const firstEmpty = WALL_SLOT_ORDER.find((s) => !next[s]);
      if (firstEmpty) setActiveSlot(firstEmpty);
    } catch {
      setGenError('Could not load one or more selected images.');
    } finally {
      e.target.value = '';
    }
  };

  const handleSlotClick = (slot: RoomWallSlotId) => {
    if (swapSource) {
      if (swapSource === slot) {
        setSwapSource(null);
        return;
      }
      const fromSlot = swapSource;
      onChangePhotos((prev) => swapWallSlots(prev, fromSlot, slot));
      setSwapSource(null);
      setActiveSlot(slot);
      return;
    }
    setActiveSlot(slot);
    if (photos[slot]) {
      setInputMode('preview');
    }
  };

  const handleRotateAll = () => {
    setSwapSource(null);
    onChangePhotos((prev) => rotateWallSlotsClockwise(prev));
  };

  const handleClearWall = (slot: RoomWallSlotId) => {
    onChangePhotos((prev) => ({ ...prev, [slot]: null }));
    if (swapSource === slot) setSwapSource(null);
    if (activeSlot === slot) setInputMode('camera');
  };

  const handleGenerate = async () => {
    if (!allCaptured || isGenerating) return;
    setIsGenerating(true);
    setGenError(null);
    try {
      const completePhotos: Record<RoomWallSlotId, string> = {
        back: photos.back!,
        right: photos.right!,
        front: photos.front!,
        left: photos.left!,
      };
      const replica = await buildFourWallRoomReplica(completePhotos, ceilingHeightCm);
      stopCamera();
      onGenerateRoom(replica);
    } catch {
      setGenError('Failed to generate 3D wireframe room. Please check your 4 wall photos and try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  if (!open) return null;

  const panelGlass = isDark
    ? 'bg-[#10131e]/88 border-white/15 text-zinc-100 shadow-[0_28px_72px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.12)]'
    : 'bg-white/88 border-stone-900/12 text-stone-900 shadow-[0_24px_64px_rgba(15,23,42,0.22),inset_0_1px_0_rgba(255,255,255,0.9)]';

  const mutedText = isDark ? 'text-zinc-400' : 'text-stone-500';
  const dividerClass = isDark ? 'border-white/10' : 'border-stone-900/10';
  const btnIdle = isDark
    ? 'bg-white/[0.06] hover:bg-white/[0.14] border-white/14 text-zinc-100'
    : 'bg-white/75 hover:bg-white border-stone-900/12 text-stone-800';
  const btnActive = isDark
    ? 'bg-violet-500/35 border-violet-300/65 text-white'
    : 'bg-violet-700 text-white border-violet-700';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/55 backdrop-blur-md animate-dock-panel"
      role="dialog"
      aria-modal="true"
      aria-label="Capture Your Room — 4 Wall Photos"
      data-testid="room-capture-modal"
    >
      <div
        className={`w-full max-w-[780px] max-h-[94dvh] flex flex-col rounded-2xl border backdrop-blur-2xl backdrop-saturate-150 overflow-hidden ${panelGlass}`}
      >
        {/* Header */}
        <div className={`px-3.5 sm:px-5 py-3 border-b flex items-center justify-between gap-3 ${dividerClass}`}>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold tracking-tight truncate">
                Capture Your Room
              </h2>
              <span
                className={`px-2 py-0.5 rounded-full font-mono text-[10.5px] font-bold tabular-nums border ${
                  allCaptured
                    ? 'bg-emerald-500/20 border-emerald-400/45 text-emerald-400'
                    : isDark
                      ? 'bg-white/8 border-white/12 text-zinc-300'
                      : 'bg-stone-100 border-stone-300 text-stone-700'
                }`}
                data-testid="capture-wall-counter"
              >
                {capturedCount}/4 Walls
              </span>
            </div>
            <p className={`text-[11px] truncate ${mutedText}`}>
              Take or upload 4 wall photos — no measurements needed. Fix misplaced walls anytime with Swap or Rotate.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            aria-label="Close Capture Your Room"
            data-testid="close-room-capture"
            className={`p-1.5 rounded-xl border shrink-0 transition-colors ${btnIdle}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-5 space-y-3.5">
          {/* Active Wall Stage (Camera or Captured Wall Preview) */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_176px] gap-3 items-stretch">
            <div className="relative rounded-xl overflow-hidden border border-white/15 bg-[#0b0e16] aspect-[16/10] sm:aspect-[16/10] flex items-center justify-center">
              {inputMode === 'preview' && activePhoto ? (
                <img
                  src={activePhoto}
                  alt={`${activeMeta.title} captured view`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${cameraReady ? 'opacity-100' : 'opacity-0'}`}
                  />
                  {/* Lightweight Floor/Ceiling Framing Guides (zero ML/pole overhead) */}
                  {cameraReady && (
                    <div className="pointer-events-none absolute inset-0">
                      <div className="absolute inset-x-6 top-[16%] border-t border-dashed border-white/45" />
                      <div className="absolute inset-x-6 bottom-[16%] border-b border-dashed border-white/45" />
                      <div className="absolute inset-y-6 left-[12%] border-l border-white/25" />
                      <div className="absolute inset-y-6 right-[12%] border-r border-white/25" />
                    </div>
                  )}
                  {!cameraReady && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 p-4 text-center">
                      {cameraError ? (
                        <>
                          <VideoOff className="w-7 h-7 text-zinc-400" aria-hidden="true" />
                          <p className="text-xs text-zinc-300 max-w-xs">{cameraError}</p>
                        </>
                      ) : (
                        <>
                          <Loader2 className="w-6 h-6 text-violet-400 animate-spin" aria-hidden="true" />
                          <p className="text-xs text-zinc-300">Opening camera for {activeMeta.title}…</p>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => singleUploadRef.current?.click()}
                        className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                      >
                        <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Upload {activeMeta.shortLabel} Wall Photo</span>
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Top Overlay Row: Active Wall Badge + Camera/Preview Toggle (zero overlap) */}
              <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between gap-2 pointer-events-none">
                <div className="min-w-0 px-2.5 py-1 rounded-lg bg-black/68 backdrop-blur-md border border-white/15 text-white flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-violet-400 shrink-0" aria-hidden="true" />
                  <span className="text-[11px] font-bold shrink-0">{activeMeta.title}</span>
                  <span className="text-[10px] text-zinc-300 hidden md:inline truncate">
                    · {activeMeta.hint}
                  </span>
                </div>

                {activePhoto && (
                  <button
                    type="button"
                    onClick={() => setInputMode((m) => (m === 'camera' ? 'preview' : 'camera'))}
                    data-testid="toggle-capture-camera-mode"
                    className="pointer-events-auto shrink-0 px-2.5 py-1 rounded-lg bg-black/68 hover:bg-black/85 backdrop-blur-md border border-white/18 text-white text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    {inputMode === 'camera' ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" aria-hidden="true" />
                        <span>View Saved</span>
                      </>
                    ) : (
                      <>
                        <Video className="w-3 h-3 text-violet-300" aria-hidden="true" />
                        <span>Retake with Camera</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Bottom Shutter / Upload Action Bar inside Stage */}
              <div className="absolute bottom-2.5 inset-x-2.5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => singleUploadRef.current?.click()}
                  data-testid="upload-single-wall-btn"
                  className="px-2.5 py-1.5 rounded-xl bg-black/68 hover:bg-black/85 backdrop-blur-md border border-white/18 text-white text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{activePhoto ? 'Replace Photo' : 'Upload Photo'}</span>
                </button>

                {inputMode === 'camera' && cameraReady && (
                  <button
                    type="button"
                    onClick={handleCaptureFromCamera}
                    data-testid="shutter-capture-wall-btn"
                    className="px-4 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-[0_6px_20px_rgba(124,58,237,0.45)] transition-all active:scale-95"
                  >
                    <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Capture {activeMeta.shortLabel}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => batchUploadRef.current?.click()}
                  data-testid="upload-batch-walls-btn"
                  className="px-2.5 py-1.5 rounded-xl bg-black/68 hover:bg-black/85 backdrop-blur-md border border-white/18 text-white text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors"
                >
                  <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="hidden xs:inline sm:inline">Upload 4</span>
                </button>
              </div>
            </div>

            {/* Mini Room Compass & Mistake-Proof Reorder Tools */}
            <div
              className={`rounded-xl border p-3 flex flex-row sm:flex-col items-center justify-between gap-3 ${
                isDark ? 'bg-white/[0.04] border-white/10' : 'bg-stone-50/90 border-stone-900/10'
              }`}
            >
              {/* Top-Down 4-Wall Room Orientation Diagram */}
              <div className="flex flex-col items-center gap-1.5">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${mutedText}`}>
                  Room Plan
                </span>
                <div className="relative w-28 h-24 flex items-center justify-center">
                  {/* Center pole indicator */}
                  <div
                    className={`w-7 h-7 rounded-full border border-dashed flex items-center justify-center text-[9px] font-mono ${
                      isDark ? 'border-white/25 text-zinc-400' : 'border-stone-400 text-stone-500'
                    }`}
                  >
                    Pole
                  </div>

                  {/* Back Wall (Top) */}
                  <button
                    type="button"
                    onClick={() => handleSlotClick('back')}
                    className={`absolute top-0 left-1/2 -translate-x-1/2 w-16 h-4 rounded text-[9px] font-bold transition-all ${
                      activeSlot === 'back'
                        ? 'bg-violet-600 text-white ring-2 ring-violet-400/50'
                        : photos.back
                          ? 'bg-emerald-500/80 text-white'
                          : isDark
                            ? 'bg-white/12 text-zinc-300'
                            : 'bg-stone-200 text-stone-700'
                    }`}
                  >
                    Back
                  </button>

                  {/* Front Wall (Bottom) */}
                  <button
                    type="button"
                    onClick={() => handleSlotClick('front')}
                    className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-4 rounded text-[9px] font-bold transition-all ${
                      activeSlot === 'front'
                        ? 'bg-violet-600 text-white ring-2 ring-violet-400/50'
                        : photos.front
                          ? 'bg-emerald-500/80 text-white'
                          : isDark
                            ? 'bg-white/12 text-zinc-300'
                            : 'bg-stone-200 text-stone-700'
                    }`}
                  >
                    Front
                  </button>

                  {/* Left Wall */}
                  <button
                    type="button"
                    onClick={() => handleSlotClick('left')}
                    className={`absolute left-0 top-1/2 -translate-y-1/2 w-5 h-14 rounded text-[8.5px] font-bold flex items-center justify-center transition-all ${
                      activeSlot === 'left'
                        ? 'bg-violet-600 text-white ring-2 ring-violet-400/50'
                        : photos.left
                          ? 'bg-emerald-500/80 text-white'
                          : isDark
                            ? 'bg-white/12 text-zinc-300'
                            : 'bg-stone-200 text-stone-700'
                    }`}
                  >
                    L
                  </button>

                  {/* Right Wall */}
                  <button
                    type="button"
                    onClick={() => handleSlotClick('right')}
                    className={`absolute right-0 top-1/2 -translate-y-1/2 w-5 h-14 rounded text-[8.5px] font-bold flex items-center justify-center transition-all ${
                      activeSlot === 'right'
                        ? 'bg-violet-600 text-white ring-2 ring-violet-400/50'
                        : photos.right
                          ? 'bg-emerald-500/80 text-white'
                          : isDark
                            ? 'bg-white/12 text-zinc-300'
                            : 'bg-stone-200 text-stone-700'
                    }`}
                  >
                    R
                  </button>
                </div>
              </div>

              {/* Mistake-Proof Reorder Controls */}
              <div className="flex flex-col gap-1.5 w-full max-w-[160px]">
                <button
                  type="button"
                  onClick={() => setSwapSource((prev) => (prev ? null : activeSlot))}
                  disabled={capturedCount < 1}
                  data-testid="swap-walls-btn"
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 ${
                    swapSource ? btnActive : btnIdle
                  }`}
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{swapSource ? 'Pick 2nd Wall…' : 'Swap Walls'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleRotateAll}
                  disabled={capturedCount < 1}
                  data-testid="rotate-walls-btn"
                  title="Shift all 4 wall photos 90° clockwise"
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 ${btnIdle}`}
                >
                  <RotateCw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Rotate 90°</span>
                </button>
              </div>
            </div>
          </div>

          {swapSource && (
            <div className="px-3 py-1.5 rounded-xl bg-violet-500/18 border border-violet-400/40 text-xs font-medium flex items-center justify-between gap-2">
              <span>
                Tap any wall below to swap it with <strong>{WALL_SLOT_META[swapSource].title}</strong>.
              </span>
              <button
                type="button"
                onClick={() => setSwapSource(null)}
                className="text-[11px] underline opacity-80 hover:opacity-100"
              >
                Cancel
              </button>
            </div>
          )}

          {/* 4-Wall Thumbnail Slot Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="wall-slots-grid">
            {WALL_SLOT_ORDER.map((slot, idx) => {
              const meta = WALL_SLOT_META[slot];
              const url = photos[slot];
              const isSelected = activeSlot === slot;
              const isSwapOrigin = swapSource === slot;
              return (
                <div
                  key={slot}
                  data-testid={`wall-slot-${slot}`}
                  data-filled={url ? 'true' : 'false'}
                  className={`relative rounded-xl border overflow-hidden transition-all ${
                    isSwapOrigin
                      ? 'border-amber-400 ring-2 ring-amber-400/45'
                      : isSelected
                        ? 'border-violet-500 ring-2 ring-violet-500/35'
                        : isDark
                          ? 'border-white/12 bg-white/[0.04]'
                          : 'border-stone-900/12 bg-stone-100/75'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleSlotClick(slot)}
                    className="w-full text-left block"
                  >
                    <div className="aspect-[16/10] w-full bg-black/30 relative flex items-center justify-center overflow-hidden">
                      {url ? (
                        <img
                          src={url}
                          alt={meta.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-zinc-400">
                          <Camera className="w-4 h-4 opacity-70" aria-hidden="true" />
                          <span className="text-[10px] font-medium">Wall {idx + 1}</span>
                        </div>
                      )}
                      {url && (
                        <span className="absolute top-1.5 left-1.5 w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs">
                          <Check className="w-2.5 h-2.5" aria-hidden="true" />
                        </span>
                      )}
                    </div>
                    <div className="px-2 py-1.5 flex items-center justify-between gap-1">
                      <span className="text-[11px] font-semibold truncate">{meta.title}</span>
                      <span className={`text-[9.5px] font-mono ${mutedText}`}>
                        {url ? 'Ready' : 'Empty'}
                      </span>
                    </div>
                  </button>

                  {url && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearWall(slot);
                      }}
                      aria-label={`Remove ${meta.title} photo`}
                      title={`Remove ${meta.title}`}
                      className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/65 hover:bg-rose-600 text-white transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {genError && (
            <p className="text-xs text-rose-400 font-medium px-1">{genError}</p>
          )}
        </div>

        {/* Hidden File Inputs */}
        <input
          ref={singleUploadRef}
          type="file"
          accept="image/*"
          onChange={handleSingleWallFileChange}
          data-testid="single-wall-file-input"
          className="hidden"
        />
        <input
          ref={batchUploadRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleBatchUploadChange}
          data-testid="batch-wall-file-input"
          className="hidden"
        />

        {/* Footer CTA Bar */}
        <div
          className={`px-3.5 sm:px-5 py-3 border-t flex flex-wrap items-center justify-between gap-2.5 ${dividerClass}`}
        >
          <span className={`text-[11px] ${mutedText}`}>
            {allCaptured
              ? 'All 4 walls captured — ready to build your 3D CAD wireframe room.'
              : `Capture or upload ${4 - capturedCount} more ${4 - capturedCount === 1 ? 'wall' : 'walls'} to generate your 3D room.`}
          </span>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isGenerating}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${btnIdle}`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!allCaptured || isGenerating}
              data-testid="generate-4wall-room-btn"
              className={`px-4 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all ${
                allCaptured && !isGenerating
                  ? 'bg-violet-600 hover:bg-violet-500 text-white shadow-[0_6px_20px_rgba(124,58,237,0.38)] active:scale-[0.98]'
                  : 'bg-violet-600/35 text-white/55 cursor-not-allowed'
              }`}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  <span>Building 3D Room…</span>
                </>
              ) : (
                <span>Generate 3D Room</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
