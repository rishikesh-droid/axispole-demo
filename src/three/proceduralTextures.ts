import * as THREE from 'three';
import type { PoleFinishId } from '../types/pole';

export interface ProceduralTextureSet {
  poleBumps: Record<PoleFinishId, THREE.CanvasTexture>;
  poleRoughness: Record<PoleFinishId, THREE.CanvasTexture>;
  studioWoodAlbedo: THREE.CanvasTexture;
  homeWoodAlbedo: THREE.CanvasTexture;
  woodBump: THREE.CanvasTexture;
  tileAlbedo: THREE.CanvasTexture;
  tileBump: THREE.CanvasTexture;
  stageDeckBump: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  clearanceRing: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function configureTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  repeatX: number,
  repeatY: number,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
  tex.needsUpdate = true;
  return tex;
}

/** Deterministic pseudo-random generator for reproducible procedural textures */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createBrushedMetalMap(
  seed: number,
  baseLevel: number,
  contrast: number,
  horizontal: boolean,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  const rand = mulberry32(seed);
  ctx.fillStyle = `rgb(${baseLevel},${baseLevel},${baseLevel})`;
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 620; i++) {
    const v = Math.max(0, Math.min(255, Math.round(baseLevel + (rand() - 0.5) * contrast)));
    ctx.fillStyle = `rgba(${v},${v},${v},0.42)`;
    if (horizontal) {
      const y = Math.floor(rand() * 256);
      ctx.fillRect(0, y, 256, 1 + Math.floor(rand() * 2));
    } else {
      const x = Math.floor(rand() * 256);
      ctx.fillRect(x, 0, 1 + Math.floor(rand() * 2), 256);
    }
  }
  return configureTexture(canvas, false, 1, 6, maxAnisotropy);
}

function createPowderCoatBump(maxAnisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  const rand = mulberry32(8421);
  const img = ctx.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = Math.round(118 + (rand() - 0.5) * 48);
    img.data[i] = n;
    img.data[i + 1] = n;
    img.data[i + 2] = n;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // Subtle micro-stipple softener
  ctx.globalAlpha = 0.25;
  ctx.drawImage(canvas, 1, 1);
  return configureTexture(canvas, false, 3, 18, maxAnisotropy);
}

function createSiliconeGripBump(maxAnisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  const rand = mulberry32(3197);
  ctx.fillStyle = 'rgb(128,128,128)';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle horizontal vulcanized micro-ribbing + tactile matte elastomer grain
  for (let y = 0; y < 256; y += 8) {
    const grad = ctx.createLinearGradient(0, y, 0, y + 8);
    grad.addColorStop(0, 'rgb(104,104,104)');
    grad.addColorStop(0.5, 'rgb(156,156,156)');
    grad.addColorStop(1, 'rgb(104,104,104)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, 256, 8);
  }
  for (let i = 0; i < 1600; i++) {
    const v = Math.round(115 + rand() * 35);
    ctx.fillStyle = `rgba(${v},${v},${v},0.3)`;
    ctx.fillRect(rand() * 256, rand() * 256, 2, 2);
  }
  return configureTexture(canvas, false, 2, 16, maxAnisotropy);
}

function createWoodPlankTexture(
  palette: [string, string, string, string],
  seed: number,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  const rand = mulberry32(seed);
  ctx.fillStyle = palette[0];
  ctx.fillRect(0, 0, 512, 512);

  const plankRows = 8;
  const plankH = 512 / plankRows;

  for (let row = 0; row < plankRows; row++) {
    const y0 = row * plankH;
    const offset = (row % 2) * 180 + Math.floor(rand() * 90);
    const tone = palette[row % palette.length];
    ctx.fillStyle = tone;
    ctx.fillRect(0, y0, 512, plankH - 1.5);

    // Subtle wood grain fibers
    for (let g = 0; g < 38; g++) {
      const gy = y0 + rand() * (plankH - 2);
      ctx.fillStyle =
        rand() > 0.5 ? 'rgba(65, 46, 28, 0.065)' : 'rgba(255, 248, 238, 0.06)';
      ctx.fillRect(0, gy, 512, 1 + rand() * 1.4);
    }

    // Plank longitudinal seam
    ctx.fillStyle = 'rgba(42, 34, 26, 0.22)';
    ctx.fillRect(0, y0 + plankH - 1.5, 512, 1.5);

    // End butt joint
    const seamX = offset % 512;
    ctx.fillRect(seamX, y0, 1.5, plankH);
  }

  return configureTexture(canvas, true, 4, 4, maxAnisotropy);
}

function createWoodBumpTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  const rand = mulberry32(5512);
  ctx.fillStyle = 'rgb(138,138,138)';
  ctx.fillRect(0, 0, 512, 512);

  const plankRows = 8;
  const plankH = 512 / plankRows;
  for (let row = 0; row < plankRows; row++) {
    const y0 = row * plankH;
    for (let g = 0; g < 44; g++) {
      const v = Math.round(122 + rand() * 32);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(0, y0 + rand() * plankH, 512, 1);
    }
    ctx.fillStyle = 'rgb(42,42,42)';
    ctx.fillRect(0, y0 + plankH - 2, 512, 2);
  }
  return configureTexture(canvas, false, 4, 4, maxAnisotropy);
}

function createTileTextures(maxAnisotropy: number): {
  albedo: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
} {
  const [aCanvas, aCtx] = makeCanvas(512, 512);
  const [bCanvas, bCtx] = makeCanvas(512, 512);
  const rand = mulberry32(9204);

  // Neutral bright base so Three.js material color tints tiles cleanly
  aCtx.fillStyle = '#f5f5f3';
  aCtx.fillRect(0, 0, 512, 512);
  bCtx.fillStyle = 'rgb(165,165,165)';
  bCtx.fillRect(0, 0, 512, 512);

  // Subtle ceramic mineral micro-veins inside 2x2 tile grid
  for (let i = 0; i < 420; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const w = 12 + rand() * 44;
    const h = 2 + rand() * 8;
    aCtx.fillStyle =
      rand() > 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(190,188,182,0.14)';
    aCtx.fillRect(x, y, w, h);
  }

  // Crisp fine architectural grout seams (2x2 tiles -> 0.60m per tile at 1.2m repeat)
  aCtx.fillStyle = 'rgba(130, 128, 122, 0.42)';
  bCtx.fillStyle = 'rgb(75,75,75)';
  for (const pos of [0, 255]) {
    aCtx.fillRect(pos, 0, 3, 512);
    aCtx.fillRect(0, pos, 512, 3);
    bCtx.fillRect(pos, 0, 3, 512);
    bCtx.fillRect(0, pos, 512, 3);
  }

  return {
    albedo: configureTexture(aCanvas, true, 3, 3, maxAnisotropy),
    bump: configureTexture(bCanvas, false, 3, 3, maxAnisotropy),
  };
}

function createStageDeckBump(maxAnisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = 'rgb(112,112,112)';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgb(168,168,168)';
  ctx.lineWidth = 2;
  for (let i = -256; i < 512; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 256, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i + 256, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
  }
  return configureTexture(canvas, false, 6, 6, maxAnisotropy);
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 124);
  grad.addColorStop(0, 'rgba(18, 16, 14, 0.52)');
  grad.addColorStop(0.45, 'rgba(18, 16, 14, 0.22)');
  grad.addColorStop(1, 'rgba(18, 16, 14, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createClearanceRingTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  ctx.clearRect(0, 0, 512, 512);

  const cx = 256;
  const cy = 256;

  // Outer dashed architectural clearance boundary
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.lineWidth = 7;
  ctx.setLineDash([18, 12]);
  ctx.beginPath();
  ctx.arc(cx, cy, 238, 0, Math.PI * 2);
  ctx.stroke();

  // Inner reference ring
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 3;
  ctx.setLineDash([7, 9]);
  ctx.beginPath();
  ctx.arc(cx, cy, 156, 0, Math.PI * 2);
  ctx.stroke();

  // Cardinal tick marks
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.lineWidth = 5;
  for (let a = 0; a < 4; a++) {
    const rad = (a * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rad) * 218, cy + Math.sin(rad) * 218);
    ctx.lineTo(cx + Math.cos(rad) * 248, cy + Math.sin(rad) * 248);
    ctx.stroke();
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  const poleBumps: Record<PoleFinishId, THREE.CanvasTexture> = {
    chrome: createBrushedMetalMap(151, 128, 6, false, maxAnisotropy),
    stainless: createBrushedMetalMap(202, 128, 16, false, maxAnisotropy),
    powder: createPowderCoatBump(maxAnisotropy),
    silicone: createSiliconeGripBump(maxAnisotropy),
    brass: createBrushedMetalMap(101, 128, 34, true, maxAnisotropy),
  };

  const poleRoughness: Record<PoleFinishId, THREE.CanvasTexture> = {
    chrome: createBrushedMetalMap(353, 14, 6, false, maxAnisotropy),
    stainless: createBrushedMetalMap(404, 28, 12, false, maxAnisotropy),
    powder: createBrushedMetalMap(505, 118, 22, true, maxAnisotropy),
    silicone: createBrushedMetalMap(606, 212, 26, true, maxAnisotropy),
    brass: createBrushedMetalMap(303, 52, 24, true, maxAnisotropy),
  };

  const studioWoodAlbedo = createWoodPlankTexture(
    ['#bfa584', '#b79c7b', '#c5ac8c', '#b09474'],
    707,
    maxAnisotropy
  );
  const homeWoodAlbedo = createWoodPlankTexture(
    ['#98714a', '#8e6741', '#a07952', '#86603b'],
    808,
    maxAnisotropy
  );
  const woodBump = createWoodBumpTexture(maxAnisotropy);
  const tileTex = createTileTextures(maxAnisotropy);
  const stageDeckBump = createStageDeckBump(maxAnisotropy);
  const contactShadow = createContactShadowTexture();
  const clearanceRing = createClearanceRingTexture(maxAnisotropy);

  return {
    poleBumps,
    poleRoughness,
    studioWoodAlbedo,
    homeWoodAlbedo,
    woodBump,
    tileAlbedo: tileTex.albedo,
    tileBump: tileTex.bump,
    stageDeckBump,
    contactShadow,
    clearanceRing,
    dispose: () => {
      Object.values(poleBumps).forEach((t) => t.dispose());
      Object.values(poleRoughness).forEach((t) => t.dispose());
      studioWoodAlbedo.dispose();
      homeWoodAlbedo.dispose();
      woodBump.dispose();
      tileTex.albedo.dispose();
      tileTex.bump.dispose();
      stageDeckBump.dispose();
      contactShadow.dispose();
      clearanceRing.dispose();
    },
  };
}
