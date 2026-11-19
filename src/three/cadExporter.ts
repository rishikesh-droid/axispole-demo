import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js';
import type { PoleRigConfig } from '../types/pole';

export type CadFormat = 'stl' | 'obj' | 'glb' | 'usdz';

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * Clones the pole assembly root cleanly without transient torque rings or invisible hit proxies
 * so exported CAD files contain pure solid geometry at 1:1 metric scale.
 */
function cloneCleanPoleAssembly(poleRoot: THREE.Group): THREE.Group {
  poleRoot.updateWorldMatrix(true, true);
  const clone = poleRoot.clone(true);
  const toRemove: THREE.Object3D[] = [];
  clone.traverse((obj) => {
    if (obj.userData?.excludeFromExport) {
      toRemove.push(obj);
    }
  });
  toRemove.forEach((o) => o.parent?.remove(o));
  return clone;
}

export function buildExportFilename(config: PoleRigConfig, format: CadFormat): string {
  return `axispole-${config.finish}-${config.diameterMm}mm-${config.mount}-${config.ceilingHeightCm}cm.${format}`;
}

export async function exportPoleCAD(
  poleRoot: THREE.Group,
  config: PoleRigConfig,
  format: CadFormat
): Promise<{ filename: string; bytes: number }> {
  const cleanGroup = cloneCleanPoleAssembly(poleRoot);
  const filename = buildExportFilename(config, format);

  if (format === 'stl') {
    const exporter = new STLExporter();
    const binary = exporter.parse(cleanGroup, { binary: true });
    const blob = new Blob([binary], { type: 'model/stl' });
    triggerDownload(blob, filename);
    return { filename, bytes: blob.size };
  }

  if (format === 'obj') {
    const exporter = new OBJExporter();
    const text = exporter.parse(cleanGroup);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    triggerDownload(blob, filename);
    return { filename, bytes: blob.size };
  }

  if (format === 'glb') {
    const exporter = new GLTFExporter();
    const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      exporter.parse(
        cleanGroup,
        (result) => {
          if (result instanceof ArrayBuffer) {
            resolve(result);
          } else {
            const enc = new TextEncoder();
            resolve(enc.encode(JSON.stringify(result)).buffer);
          }
        },
        (err) => reject(err),
        { binary: true }
      );
    });
    const blob = new Blob([arrayBuffer], { type: 'model/gltf-binary' });
    triggerDownload(blob, filename);
    return { filename, bytes: blob.size };
  }

  // USDZ for Apple AR Quick Look & CAD viewers
  const exporter = new USDZExporter();
  const usdzArray = await exporter.parseAsync(cleanGroup);
  const blob = new Blob([usdzArray], { type: 'model/vnd.usdz+zip' });
  triggerDownload(blob, filename);
  return { filename, bytes: blob.size };
}

/**
 * Generates an in-memory USDZ blob URL for direct iOS Safari AR Quick Look (`<a rel="ar">`)
 */
export async function buildQuickLookUSDZUrl(poleRoot: THREE.Group): Promise<string> {
  const cleanGroup = cloneCleanPoleAssembly(poleRoot);
  const exporter = new USDZExporter();
  const usdzArray = await exporter.parseAsync(cleanGroup);
  const blob = new Blob([usdzArray], { type: 'model/vnd.usdz+zip' });
  return URL.createObjectURL(blob);
}
