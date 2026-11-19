import type { PoleFinishId } from '../types/pole';

/**
 * Generates high-craft circular studio-lit PBR material thumbnails ("material PFPs")
 * depicting realistic cylindrical reflections, brushed grain, stippled powder-coat,
 * and vulcanized silicone ribbing with zero external image fetches.
 */
function renderMaterialAvatar(finish: PoleFinishId): string {
  if (typeof document === 'undefined') return '';
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Studio dark vignette backdrop inside circle
  const bg = ctx.createRadialGradient(size * 0.35, size * 0.3, 6, size * 0.5, size * 0.5, size * 0.55);
  bg.addColorStop(0, '#2a2d35');
  bg.addColorStop(1, '#111318');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Diagonal macro close-up cylinder of the pole material filling the circular avatar
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(-0.38);

  const cylW = size * 0.62;
  const cylH = size * 1.4;
  const x0 = -cylW / 2;
  const y0 = -cylH / 2;

  const grad = ctx.createLinearGradient(x0, 0, x0 + cylW, 0);

  if (finish === 'brass') {
    grad.addColorStop(0.0, '#5a3f11');
    grad.addColorStop(0.18, '#b68933');
    grad.addColorStop(0.36, '#fff1c1');
    grad.addColorStop(0.52, '#d8aa4c');
    grad.addColorStop(0.76, '#7a5618');
    grad.addColorStop(0.9, '#c7993c');
    grad.addColorStop(1.0, '#442f0b');
  } else if (finish === 'stainless') {
    grad.addColorStop(0.0, '#47505c');
    grad.addColorStop(0.16, '#b7c2ce');
    grad.addColorStop(0.34, '#ffffff');
    grad.addColorStop(0.48, '#d5dde6');
    grad.addColorStop(0.72, '#5a6573');
    grad.addColorStop(0.88, '#e3eaf2');
    grad.addColorStop(1.0, '#363d47');
  } else if (finish === 'powder-black') {
    grad.addColorStop(0.0, '#0c0d10');
    grad.addColorStop(0.24, '#242830');
    grad.addColorStop(0.42, '#414754');
    grad.addColorStop(0.65, '#191c22');
    grad.addColorStop(1.0, '#0a0b0e');
  } else {
    // High-grip vulcanized silicone (charcoal-plum matte elastomer)
    grad.addColorStop(0.0, '#1c161a');
    grad.addColorStop(0.26, '#3f323a');
    grad.addColorStop(0.48, '#5a4954');
    grad.addColorStop(0.72, '#2d2329');
    grad.addColorStop(1.0, '#151014');
  }

  ctx.fillStyle = grad;
  ctx.fillRect(x0, y0, cylW, cylH);

  // Surface-specific tactile micro-detail
  if (finish === 'brass' || finish === 'stainless') {
    // Fine horizontal lathe-brushed sheen lines
    ctx.strokeStyle =
      finish === 'brass' ? 'rgba(255, 244, 210, 0.14)' : 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1;
    for (let y = y0; y < y0 + cylH; y += 3) {
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + cylW, y);
      ctx.stroke();
    }
    // Crisp specular neon/studio highlight streak
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fillRect(x0 + cylW * 0.31, y0, cylW * 0.08, cylH);
  } else if (finish === 'powder-black') {
    // Stippled powder-coat grain dots
    for (let i = 0; i < 420; i++) {
      const gx = x0 + ((i * 37) % 100) / 100 * cylW;
      const gy = y0 + ((i * 73) % 100) / 100 * cylH;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.22)';
      ctx.fillRect(gx, gy, 1.5, 1.5);
    }
  } else {
    // Vulcanized silicone subtle horizontal grip ribs
    for (let y = y0; y < y0 + cylH; y += 6) {
      ctx.fillStyle = 'rgba(255, 235, 245, 0.11)';
      ctx.fillRect(x0, y, cylW, 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(x0, y + 3, cylW, 1.5);
    }
  }

  // Subtle rim highlight along left/right edge of cylinder
  ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.fillRect(x0 + 1, y0, 2, cylH);

  ctx.restore();

  // Soft outer rim glass bevel
  const rim = ctx.createRadialGradient(size / 2, size / 2, size * 0.36, size / 2, size / 2, size * 0.5);
  rim.addColorStop(0, 'rgba(0,0,0,0)');
  rim.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = rim;
  ctx.fillRect(0, 0, size, size);

  return canvas.toDataURL('image/png');
}

let cachedAvatars: Record<PoleFinishId, string> | null = null;

export function getPoleMaterialAvatars(): Record<PoleFinishId, string> {
  if (!cachedAvatars) {
    cachedAvatars = {
      brass: renderMaterialAvatar('brass'),
      stainless: renderMaterialAvatar('stainless'),
      'powder-black': renderMaterialAvatar('powder-black'),
      silicone: renderMaterialAvatar('silicone'),
    };
  }
  return cachedAvatars;
}
