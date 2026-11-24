import type { RawObjectDetection } from './localRoomScanner';

/**
 * On-device open-vocabulary object detection (OWL-ViT via Transformers.js / ONNX Runtime Web).
 * Unlike COCO-SSD (80 fixed classes), OWL-ViT locates any indoor object or architectural
 * feature described in plain English: wardrobes, overhead wall cupboards, doors/doorways,
 * windows, mirrors, desks, monitors, armchairs, potted trees, floor mats, wall signs, etc.
 *
 * 100% client-side: quantized ONNX weights are fetched once from the public Hugging Face Hub,
 * cached in browser storage, and zero room images leave the user's device.
 *
 * To detect your own custom object types, add entries to `OPEN_VOCAB_PROMPTS`
 * (or pass `customPrompts` to `detectOpenVocabObjects`) — no model retraining required.
 */

export interface OpenVocabPrompt {
  /** Natural-language description matched against image regions by OWL-ViT. */
  prompt: string;
  /** Canonical class name consumed by `localRoomScanner.ts`. */
  className: string;
  /** Minimum raw OWL-ViT score required (typical true-positive range is 0.13–0.38). */
  minScore: number;
}

export const OPEN_VOCAB_PROMPTS: readonly OpenVocabPrompt[] = [
  { prompt: 'a sofa or couch', className: 'couch', minScore: 0.14 },
  { prompt: 'an armchair', className: 'couch', minScore: 0.15 },
  { prompt: 'a potted plant', className: 'potted plant', minScore: 0.13 },
  { prompt: 'an indoor tree in a pot', className: 'potted plant', minScore: 0.14 },
  { prompt: 'an office chair', className: 'chair', minScore: 0.14 },
  { prompt: 'a chair', className: 'chair', minScore: 0.15 },
  { prompt: 'a desk', className: 'desk', minScore: 0.14 },
  { prompt: 'a table', className: 'dining table', minScore: 0.15 },
  { prompt: 'a computer monitor', className: 'tv', minScore: 0.13 },
  { prompt: 'a television', className: 'tv', minScore: 0.16 },
  { prompt: 'a laptop', className: 'laptop', minScore: 0.14 },
  { prompt: 'a bed', className: 'bed', minScore: 0.16 },
  { prompt: 'a wardrobe or tall cupboard', className: 'wardrobe', minScore: 0.15 },
  { prompt: 'a wall cabinet or overhead cupboard', className: 'cabinet', minScore: 0.14 },
  { prompt: 'a bookshelf or wall shelf', className: 'bookshelf', minScore: 0.15 },
  { prompt: 'a doorway or open door', className: 'door', minScore: 0.15 },
  { prompt: 'a closed door', className: 'door', minScore: 0.15 },
  { prompt: 'a window', className: 'window', minScore: 0.15 },
  { prompt: 'a wall mirror', className: 'mirror', minScore: 0.16 },
  { prompt: 'a floor mat or rug', className: 'rug', minScore: 0.14 },
  { prompt: 'a framed picture or wall logo', className: 'wall art', minScore: 0.16 },
];

export const OPEN_VOCAB_CLASS_NAMES: ReadonlySet<string> = new Set(
  OPEN_VOCAB_PROMPTS.map((p) => p.className)
);

const OPEN_VOCAB_MODEL_ID = 'Xenova/owlvit-base-patch32';

export interface OwlBox {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

export type OwlResult = Array<{ score: number; label: string; box: OwlBox }>;

type OwlDetector = (
  image: string,
  labels: string[],
  options?: { threshold?: number; percentage?: boolean; top_k?: number }
) => Promise<OwlResult>;

let detectorPromise: Promise<OwlDetector | null> | null = null;

function loadDetector(): Promise<OwlDetector | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!detectorPromise) {
    detectorPromise = (async () => {
      try {
        const { pipeline, env } = await import('@huggingface/transformers');
        // Prevent SPA dev/prod routers from serving index.html on local /models/* probes
        env.allowLocalModels = false;

        const hasWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
        const make = (opts: Record<string, unknown>) =>
          pipeline('zero-shot-object-detection', OPEN_VOCAB_MODEL_ID, opts as never) as unknown as Promise<OwlDetector>;

        if (hasWebGpu) {
          try {
            return await make({ dtype: 'q8', device: 'webgpu' });
          } catch {
            // Fall through to WASM backend
          }
        }
        try {
          return await make({ dtype: 'q8', device: 'wasm' });
        } catch {
          return await make({ device: 'wasm' });
        }
      } catch {
        detectorPromise = null; // Allow retry if user reconnects later
        return null;
      }
    })();
  }
  return detectorPromise;
}

/** Starts downloading/compiling the OWL-ViT open-vocabulary detector in the background. */
export function preloadOpenVocabDetector(): void {
  if (typeof window === 'undefined') return;
  void loadDetector();
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(fallback);
      }
    );
  });
}

/** Keeps only the highest-scoring detection when multiple prompts claim the same region. */
export function suppressCrossClassDuplicates(
  dets: RawObjectDetection[],
  iouThreshold = 0.68
): RawObjectDetection[] {
  const sorted = [...dets].sort((a, b) => b.score - a.score);
  const kept: RawObjectDetection[] = [];
  for (const d of sorted) {
    const dup = kept.some((k) => {
      const xA = Math.max(k.x, d.x);
      const yA = Math.max(k.y, d.y);
      const xB = Math.min(k.x + k.w, d.x + d.w);
      const yB = Math.min(k.y + k.h, d.y + d.h);
      const inter = Math.max(0, xB - xA) * Math.max(0, yB - yA);
      const union = k.w * k.h + d.w * d.h - inter;
      return union > 0 && inter / union >= iouThreshold;
    });
    if (!dup) kept.push(d);
  }
  return kept;
}

/**
 * Converts raw OWL-ViT output (percentage or pixel boxes) into normalized `RawObjectDetection`s
 * with calibrated [0.52..0.94] scores after enforcing each prompt's raw `minScore` gate.
 */
export function normalizeOpenVocabResults(
  results: OwlResult,
  imgW: number,
  imgH: number,
  prompts: readonly OpenVocabPrompt[] = OPEN_VOCAB_PROMPTS
): RawObjectDetection[] {
  const byPrompt = new Map(prompts.map((p) => [p.prompt, p]));
  const out: RawObjectDetection[] = [];

  for (const r of results) {
    const spec = byPrompt.get(r.label);
    if (!spec || r.score < spec.minScore) continue;

    const { xmin, ymin, xmax, ymax } = r.box;
    const isPixels = Math.max(xmax, ymax) > 1.5;
    const sx = isPixels ? 1 / Math.max(1, imgW) : 1;
    const sy = isPixels ? 1 / Math.max(1, imgH) : 1;
    const x = Math.max(0, xmin * sx);
    const y = Math.max(0, ymin * sy);
    const w = Math.min(1, xmax * sx) - x;
    const h = Math.min(1, ymax * sy) - y;

    // Ignore tiny noise slivers and whole-frame background false positives
    if (w < 0.035 || h < 0.035 || w * h > 0.68) continue;

    const calibratedScore = Number(
      Math.min(0.94, 0.52 + Math.max(0, r.score - spec.minScore) * 1.4).toFixed(3)
    );
    out.push({
      className: spec.className,
      score: calibratedScore,
      x,
      y,
      w,
      h,
    });
  }

  return suppressCrossClassDuplicates(out);
}

/**
 * Runs on-device OWL-ViT open-vocabulary detection on a data URL image.
 * Never throws; returns `[]` on offline/timeout so COCO-SSD + pixel CV still run cleanly.
 */
export async function detectOpenVocabObjects(
  imageDataUrl: string,
  imgW: number,
  imgH: number,
  opts?: {
    timeoutMs?: number;
    customPrompts?: readonly OpenVocabPrompt[];
  }
): Promise<RawObjectDetection[]> {
  const timeoutMs = opts?.timeoutMs ?? 45000;
  const activePrompts = opts?.customPrompts
    ? [...OPEN_VOCAB_PROMPTS, ...opts.customPrompts]
    : OPEN_VOCAB_PROMPTS;

  const detector = await withTimeout(loadDetector(), timeoutMs, null);
  if (!detector) return [];

  try {
    const results = await withTimeout(
      detector(
        imageDataUrl,
        activePrompts.map((p) => p.prompt),
        { threshold: 0.11, percentage: true, top_k: 40 }
      ),
      timeoutMs,
      [] as OwlResult
    );
    return normalizeOpenVocabResults(results, imgW, imgH, activePrompts);
  } catch {
    return [];
  }
}
