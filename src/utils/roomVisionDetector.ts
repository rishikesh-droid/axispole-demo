/**
 * Lightweight On-Device Room Vision Pipeline (Option A):
 * 1. `Xenova/segformer-b0-finetuned-ade-512-512` (~15 MB q8)
 *    Semantic pixel segmentation across 150 indoor ADE20K classes:
 *    wall, floor, ceiling, windowpane, door, desk, table, chair, swivel chair,
 *    sofa, bed, wardrobe, cabinet, bookcase, mirror, rug, plant, lamp, monitor.
 * 2. `onnx-community/depth-anything-v2-small` (~19 MB q4f16 / ~27 MB q8)
 *    Dense monocular inverse-depth map for metric 3D unprojection & OBB sizing.
 *
 * Runs 100% client-side via @huggingface/transformers (WebGPU with WASM fallback).
 * Models are loaded and executed sequentially to minimize mobile browser peak RAM.
 */

export interface VisionSegment {
  label: string;
  score: number;
  width: number;
  height: number;
  /** Single-channel binary/alpha mask (0..255) of length width * height */
  mask: Uint8Array;
}

export interface RoomVisionAnalysis {
  width: number;
  height: number;
  segments: VisionSegment[];
  /** Dense inverse-depth / disparity array (higher = closer) of length width * height */
  disparityMap: Float32Array;
  /** True when higher disparity values correspond to closer surfaces (Depth Anything V2) */
  disparityIsInverseDepth: boolean;
  engine: 'segformer+depth-anything-v2';
}

export const SEGFORMER_MODEL_ID = 'Xenova/segformer-b0-finetuned-ade-512-512';
export const DEPTH_MODEL_ID = 'onnx-community/depth-anything-v2-small';

interface RawImageLike {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  channels: number;
}

type SegmenterFn = (
  image: string,
  options?: { threshold?: number; mask_threshold?: number }
) => Promise<Array<{ label: string | null; score: number | null; mask: RawImageLike }>>;

type DepthFn = (image: string) => Promise<{
  predicted_depth: { dims: number[]; data: Float32Array | number[] };
  depth: RawImageLike;
}>;

let segmenterPromise: Promise<SegmenterFn | null> | null = null;
let depthPromise: Promise<DepthFn | null> | null = null;
async function loadSegmenter(): Promise<SegmenterFn | null> {
  if (typeof window === 'undefined') return null;
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      try {
        const { pipeline, env } = await import('@huggingface/transformers');
        // Prevent SPA routers from returning index.html on /models/* probes
        env.allowLocalModels = false;

        const hasWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
        const make = (opts: Record<string, unknown>) =>
          pipeline('image-segmentation', SEGFORMER_MODEL_ID, opts as never) as unknown as Promise<SegmenterFn>;

        if (hasWebGpu) {
          try {
            return await make({ dtype: 'q8', device: 'webgpu' });
          } catch {
            // Fall through to WASM
          }
        }
        try {
          return await make({ dtype: 'q8', device: 'wasm' });
        } catch {
          return await make({ device: 'wasm' });
        }
      } catch {
        segmenterPromise = null;
        return null;
      }
    })();
  }
  return segmenterPromise;
}

async function loadDepthEstimator(): Promise<DepthFn | null> {
  if (typeof window === 'undefined') return null;
  if (!depthPromise) {
    depthPromise = (async () => {
      try {
        const { pipeline, env } = await import('@huggingface/transformers');
        env.allowLocalModels = false;

        const hasWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
        const make = (opts: Record<string, unknown>) =>
          pipeline('depth-estimation', DEPTH_MODEL_ID, opts as never) as unknown as Promise<DepthFn>;

        if (hasWebGpu) {
          try {
            return await make({ dtype: 'q4f16', device: 'webgpu' });
          } catch {
            // Fall back to q8 WebGPU if q4f16/fp16 shaders unavailable
          }
          try {
            return await make({ dtype: 'q8', device: 'webgpu' });
          } catch {
            // Fall through to WASM
          }
        }
        try {
          return await make({ dtype: 'q8', device: 'wasm' });
        } catch {
          return await make({ device: 'wasm' });
        }
      } catch {
        depthPromise = null;
        return null;
      }
    })();
  }
  return depthPromise;
}

let preloadStarted = false;

/**
 * Silently pre-warms SegFormer-B0 and Depth Anything V2 Small sequentially
 * when entering AR mode so mobile browsers avoid parallel memory spikes.
 */
export function preloadRoomVisionModels(): void {
  if (typeof window === 'undefined' || preloadStarted) return;
  preloadStarted = true;
  void (async () => {
    await loadSegmenter();
    await loadDepthEstimator();
  })();
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

function extractSingleChannelMask(raw: RawImageLike, targetW: number, targetH: number): Uint8Array {
  const srcW = Math.max(1, raw.width);
  const srcH = Math.max(1, raw.height);
  const ch = Math.max(1, raw.channels || 1);
  const src = raw.data;

  if (srcW === targetW && srcH === targetH && ch === 1) {
    return src instanceof Uint8Array ? src : new Uint8Array(src);
  }

  const out = new Uint8Array(targetW * targetH);
  for (let y = 0; y < targetH; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y / targetH) * srcH));
    for (let x = 0; x < targetW; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x / targetW) * srcW));
      out[y * targetW + x] = src[(sy * srcW + sx) * ch];
    }
  }
  return out;
}

function extractDisparityFloat32(
  depthOut: {
    predicted_depth: { dims: number[]; data: Float32Array | number[] };
    depth: RawImageLike;
  },
  targetW: number,
  targetH: number
): Float32Array {
  const pred = depthOut.predicted_depth;
  const dims = pred?.dims ?? [];
  const rawData = pred?.data;

  if (rawData && dims.length >= 2) {
    const srcH = Math.max(1, dims[dims.length - 2]);
    const srcW = Math.max(1, dims[dims.length - 1]);
    if (srcW === targetW && srcH === targetH && rawData.length === targetW * targetH) {
      return rawData instanceof Float32Array ? rawData : Float32Array.from(rawData);
    }
    const out = new Float32Array(targetW * targetH);
    for (let y = 0; y < targetH; y++) {
      const sy = Math.min(srcH - 1, Math.floor((y / targetH) * srcH));
      for (let x = 0; x < targetW; x++) {
        const sx = Math.min(srcW - 1, Math.floor((x / targetW) * srcW));
        out[y * targetW + x] = Number(rawData[sy * srcW + sx]) || 0;
      }
    }
    return out;
  }

  // Fallback to normalized 8-bit RawImage if tensor dims absent
  const dImg = depthOut.depth;
  const ch = Math.max(1, dImg.channels || 1);
  const out = new Float32Array(targetW * targetH);
  for (let y = 0; y < targetH; y++) {
    const sy = Math.min(dImg.height - 1, Math.floor((y / targetH) * dImg.height));
    for (let x = 0; x < targetW; x++) {
      const sx = Math.min(dImg.width - 1, Math.floor((x / targetW) * dImg.width));
      out[y * targetW + x] = dImg.data[(sy * dImg.width + sx) * ch] / 255;
    }
  }
  return out;
}

/**
 * Runs SegFormer-B0 (ADE20K room + furniture masks) and Depth Anything V2 Small
 * sequentially on a bounded image data URL. Never throws; returns null on offline/timeout.
 */
export async function analyzeRoomWithVisionModels(
  imageDataUrl: string,
  width: number,
  height: number,
  opts?: {
    timeoutMs?: number;
    onStage?: (stage: 'segment' | 'depth') => void;
  }
): Promise<RoomVisionAnalysis | null> {
  const timeoutMs = opts?.timeoutMs ?? 28000;

  opts?.onStage?.('segment');
  const segmenter = await withTimeout(loadSegmenter(), timeoutMs, null);
  if (!segmenter) return null;

  let rawSegments: Array<{ label: string | null; score: number | null; mask: RawImageLike }> = [];
  try {
    rawSegments = await withTimeout(
      segmenter(imageDataUrl, { threshold: 0.35, mask_threshold: 0.45 }),
      timeoutMs,
      []
    );
  } catch {
    return null;
  }

  if (rawSegments.length === 0) return null;

  opts?.onStage?.('depth');
  const depthEstimator = await withTimeout(loadDepthEstimator(), timeoutMs, null);
  if (!depthEstimator) return null;

  let depthOut: {
    predicted_depth: { dims: number[]; data: Float32Array | number[] };
    depth: RawImageLike;
  } | null = null;
  try {
    depthOut = await withTimeout(depthEstimator(imageDataUrl), timeoutMs, null);
  } catch {
    return null;
  }

  if (!depthOut) return null;

  const segments: VisionSegment[] = [];
  for (const seg of rawSegments) {
    if (!seg.label || !seg.mask) continue;
    segments.push({
      label: seg.label.toLowerCase().trim(),
      score: typeof seg.score === 'number' && Number.isFinite(seg.score) ? seg.score : 0.85,
      width,
      height,
      mask: extractSingleChannelMask(seg.mask, width, height),
    });
  }

  if (segments.length === 0) return null;

  const disparityMap = extractDisparityFloat32(depthOut, width, height);

  return {
    width,
    height,
    segments,
    disparityMap,
    disparityIsInverseDepth: true,
    engine: 'segformer+depth-anything-v2',
  };
}
