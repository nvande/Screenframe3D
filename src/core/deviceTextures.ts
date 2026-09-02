import * as THREE from 'three';
import { publicUrl } from './assets';
import { loadImage } from './applyScreenTexture';
import { drawToFittedCanvas } from './fitTexture';

export const SCREENFRAME_TEXTURE_SAVE_PATH = '/@screenframe/texture/';
export const TEXTURE_PUBLIC_ROOT = '/textures';

export const TEXTURE_RELATIVE_RE =
  /^([A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+\.png$/;

type ColorSlot = 'map' | 'emissiveMap';
type DataSlot = 'normalMap' | 'roughnessMap' | 'metalnessMap' | 'aoMap';
type TextureSlot = ColorSlot | DataSlot;

const COLOR_SLOTS: { prop: ColorSlot; file: string }[] = [
  { prop: 'map', file: 'map' },
  { prop: 'emissiveMap', file: 'emissive' },
];

const DATA_SLOTS: { prop: DataSlot; file: string }[] = [
  { prop: 'normalMap', file: 'normal' },
  { prop: 'roughnessMap', file: 'roughness' },
  { prop: 'metalnessMap', file: 'metalness' },
  { prop: 'aoMap', file: 'ao' },
];

function sanitizeSegment(value: string, fallback: string): string {
  const stem = value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return stem || fallback;
}

export function deviceTextureDir(device: string): string {
  const dir = device
    .split('/')
    .filter(Boolean)
    .map((seg) => sanitizeSegment(seg, 'device'))
    .join('/');
  return dir || 'device';
}

export function deviceTextureUrl(device: string, fileName: string): string {
  return publicUrl(`textures/${deviceTextureDir(device)}/${fileName}`);
}

function asStandardMaterial(
  material: THREE.Material | THREE.Material[]
): THREE.MeshStandardMaterial | null {
  const mat = Array.isArray(material) ? material[0] : material;
  if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
    return mat as THREE.MeshStandardMaterial;
  }
  return null;
}

function collectMaterials(root: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const seen = new Set<THREE.Material>();
  const materials: THREE.MeshStandardMaterial[] = [];
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const list = Array.isArray(child.material) ? child.material : [child.material];
    for (const raw of list) {
      if (!raw || seen.has(raw)) continue;
      seen.add(raw);
      const mat = asStandardMaterial(raw);
      if (mat) materials.push(mat);
    }
  });
  return materials;
}

function nameMaterials(materials: THREE.MeshStandardMaterial[]): Map<THREE.MeshStandardMaterial, string> {
  const used = new Set<string>();
  const names = new Map<THREE.MeshStandardMaterial, string>();
  materials.forEach((mat, index) => {
    let base = sanitizeSegment(mat.name || `material-${index}`, `material-${index}`);
    let name = base;
    let n = 2;
    while (used.has(name)) {
      name = `${base}-${n}`;
      n += 1;
    }
    used.add(name);
    names.set(mat, name);
  });
  return names;
}

function copyTextureParams(
  from: THREE.Texture | null,
  to: THREE.Texture,
  linear: boolean
): void {
  if (from) {
    to.flipY = from.flipY;
    to.colorSpace = from.colorSpace;
    to.wrapS = from.wrapS;
    to.wrapT = from.wrapT;
    to.minFilter = from.minFilter;
    to.magFilter = from.magFilter;
    to.generateMipmaps = from.generateMipmaps;
    return;
  }
  to.flipY = false;
  to.colorSpace = linear ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
  to.wrapS = THREE.ClampToEdgeWrapping;
  to.wrapT = THREE.ClampToEdgeWrapping;
  to.generateMipmaps = true;
}

function sourceSize(source: CanvasImageSource): { width: number; height: number } {
  if (source instanceof HTMLImageElement) {
    return {
      width: source.naturalWidth || source.width,
      height: source.naturalHeight || source.height,
    };
  }
  if (source instanceof HTMLCanvasElement) {
    return { width: source.width, height: source.height };
  }
  if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
    return { width: source.width, height: source.height };
  }
  return { width: 0, height: 0 };
}

function textureToPngBlob(texture: THREE.Texture): Promise<Blob> {
  const image = texture.image as CanvasImageSource | undefined;
  if (!image) {
    return Promise.reject(new Error('Texture has no image'));
  }
  const { width, height } = sourceSize(image);
  if (!width || !height) {
    return Promise.reject(new Error('Texture image has no dimensions'));
  }
  const canvas = drawToFittedCanvas(image, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('PNG encode failed'));
    }, 'image/png');
  });
}

async function tryLoadImage(url: string): Promise<HTMLImageElement | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    return await loadImage(objectUrl);
  } catch {
    return null;
  }
}

function applyImage(
  mat: THREE.MeshStandardMaterial,
  prop: TextureSlot,
  image: HTMLImageElement,
  previous: THREE.Texture | null,
  linear: boolean
): void {
  const { width, height } = sourceSize(image);
  const canvas = drawToFittedCanvas(image, width || image.width, height || image.height);
  const tex = new THREE.CanvasTexture(canvas);
  copyTextureParams(previous, tex, linear);
  tex.needsUpdate = true;
  mat[prop] = tex;
  if (prop === 'emissiveMap' && mat.emissive.r === 0 && mat.emissive.g === 0 && mat.emissive.b === 0) {
    mat.emissive.set(1, 1, 1);
  }
  mat.needsUpdate = true;
}

export async function persistTextureToDevServer(
  relativePath: string,
  blob: Blob
): Promise<boolean> {
  if (!TEXTURE_RELATIVE_RE.test(relativePath)) return false;
  try {
    const response = await fetch(`${SCREENFRAME_TEXTURE_SAVE_PATH}${relativePath}`, {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: blob,
    });
    return response.ok || response.status === 204;
  } catch {
    return false;
  }
}

async function syncSlot(
  mat: THREE.MeshStandardMaterial,
  prop: TextureSlot,
  fileSlot: string,
  device: string,
  materialName: string,
  linear: boolean,
  persist: boolean,
  createIfMissing: boolean
): Promise<void> {
  const original = mat[prop] ?? null;
  if (!original && !createIfMissing) return;

  const fileName = `${materialName}-${fileSlot}.png`;
  const relative = `${deviceTextureDir(device)}/${fileName}`;
  const url = publicUrl(`textures/${relative}`);
  const override = await tryLoadImage(url);
  if (override) {
    applyImage(mat, prop, override, original, linear);
    return;
  }
  if (!persist || !original) return;
  try {
    const blob = await textureToPngBlob(original);
    await persistTextureToDevServer(relative, blob);
  } catch (error) {
    console.warn(`Could not extract ${url}`, error);
  }
}

/**
 * Loads `/textures/{device}/{material}-{slot}.png` when present, otherwise
 * extracts that map from the GLB and writes it during `vite dev`.
 */
export async function syncDeviceTextures(
  root: THREE.Object3D,
  device: string,
  persist = true
): Promise<void> {
  const materials = collectMaterials(root);
  const names = nameMaterials(materials);
  await Promise.all(
    materials.flatMap((mat) => {
      const materialName = names.get(mat)!;
      return [
        ...COLOR_SLOTS.map(({ prop, file }) =>
          syncSlot(
            mat,
            prop,
            file,
            device,
            materialName,
            false,
            persist,
            prop === 'emissiveMap' || prop === 'map'
          )
        ),
        ...DATA_SLOTS.map(({ prop, file }) =>
          syncSlot(mat, prop, file, device, materialName, true, persist, false)
        ),
      ];
    })
  );
}
