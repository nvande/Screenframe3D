import * as THREE from 'three';
import { drawToFittedCanvas } from './fitTexture';

interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenCompositor {
  apply(screenshot: CanvasImageSource): void;
  dispose(): void;
}

const LUMA_THRESHOLD = 20;
const SMALL_GAP_PX = 32;

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[\s._-]+/g, '');
}

function isScreenName(name: string): boolean {
  const compact = normalizeName(name);
  if (!compact) return false;
  if (compact.includes('wallpaper')) return true;
  if (compact === 'screen' || compact.startsWith('screenbg')) return true;
  if (compact.includes('display')) return true;
  if (compact === 'lcd' || compact.endsWith('lcd')) return true;
  return false;
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

function materialNames(mat: THREE.MeshStandardMaterial, mesh: THREE.Mesh): string[] {
  return [mat.name, mesh.name, mesh.parent?.name ?? ''];
}

export function findScreenMaterial(root: THREE.Object3D): THREE.MeshStandardMaterial | null {
  let dedicated: THREE.MeshStandardMaterial | null = null;
  let bodyMat: THREE.MeshStandardMaterial | null = null;
  let withEmissive: THREE.MeshStandardMaterial | null = null;

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const mat = asStandardMaterial(child.material);
    if (!mat) return;
    if (!dedicated && (mat.map || mat.emissiveMap) && materialNames(mat, child).some(isScreenName)) {
      dedicated = mat;
    }
    if (mat.name === 'body_mat') bodyMat = mat;
    if (mat.emissiveMap && !withEmissive) withEmissive = mat;
  });

  return dedicated ?? bodyMat ?? withEmissive;
}

/** @deprecated Use findScreenMaterial */
export function findBodyMaterial(root: THREE.Object3D): THREE.MeshStandardMaterial | null {
  return findScreenMaterial(root);
}

function isDedicatedScreenMaterial(
  material: THREE.MeshStandardMaterial,
  root?: THREE.Object3D
): boolean {
  if (isScreenName(material.name)) return true;
  if (!root) return false;
  let match = false;
  root.traverse((child) => {
    if (match || !(child instanceof THREE.Mesh)) return;
    const list = Array.isArray(child.material) ? child.material : [child.material];
    if (!list.includes(material)) return;
    if (materialNames(material, child).some(isScreenName)) match = true;
  });
  return match;
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

function make2dCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not create 2D canvas context');
  }
  return ctx;
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
  if (typeof OffscreenCanvas !== 'undefined' && source instanceof OffscreenCanvas) {
    return { width: source.width, height: source.height };
  }
  const video = source as HTMLVideoElement;
  return {
    width: video.videoWidth || 0,
    height: video.videoHeight || 0,
  };
}

function rasterizeTexture(texture: THREE.Texture): {
  canvas: HTMLCanvasElement;
  imageData: ImageData;
} {
  const image = texture.image as CanvasImageSource;
  const { width, height } = sourceSize(image);
  if (!width || !height) {
    throw new Error('Texture image has no dimensions');
  }
  const canvas = drawToFittedCanvas(image, width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not create 2D canvas context');
  }
  return { canvas, imageData: ctx.getImageData(0, 0, canvas.width, canvas.height) };
}

function detectScreenRect(data: ImageData, threshold = LUMA_THRESHOLD): ScreenRect | null {
  const { width, height, data: px } = data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const luma = (px[i] + px[i + 1] + px[i + 2]) / 3;
      if (luma > threshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function buildScreenMask(emissive: ImageData, rect: ScreenRect): Uint8Array {
  const { width, data } = emissive;
  const mask = new Uint8Array(rect.width * rect.height);

  for (let y = 0; y < rect.height; y++) {
    for (let x = 0; x < rect.width; x++) {
      const i = ((rect.y + y) * width + (rect.x + x)) * 4;
      const luma = (data[i] + data[i + 1] + data[i + 2]) / 3;
      mask[y * rect.width + x] = luma > LUMA_THRESHOLD ? 255 : 0;
    }
  }

  fillSmallGaps(mask, rect.width, rect.height, SMALL_GAP_PX);
  return mask;
}

/** Fills tiny holes from baked UI without closing the Dynamic Island. */
function fillSmallGaps(mask: Uint8Array, w: number, h: number, maxGap: number): void {
  fillGapsAlong(mask, w, h, maxGap, true);
  fillGapsAlong(mask, w, h, maxGap, false);
}

function fillGapsAlong(
  mask: Uint8Array,
  w: number,
  h: number,
  maxGap: number,
  rows: boolean
): void {
  const outer = rows ? h : w;
  const inner = rows ? w : h;

  for (let o = 0; o < outer; o++) {
    let runStart = -1;
    for (let i = 0; i <= inner; i++) {
      const on = i < inner && (rows ? mask[o * w + i] : mask[i * w + o]) > 0;
      if (!on && runStart === -1 && i < inner) {
        const prevOn =
          i > 0 && (rows ? mask[o * w + (i - 1)] : mask[(i - 1) * w + o]) > 0;
        if (prevOn) runStart = i;
      }
      if (runStart !== -1 && (on || i === inner)) {
        const gap = i - runStart;
        if (gap > 0 && gap <= maxGap && on) {
          for (let g = runStart; g < i; g++) {
            if (rows) mask[o * w + g] = 255;
            else mask[g * w + o] = 255;
          }
        }
        runStart = -1;
      }
    }
  }
}

function drawFill(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  dx: number,
  dy: number,
  dw: number,
  dh: number
): void {
  const { width: sw, height: sh } = sourceSize(image);
  if (!sw || !sh) return;
  ctx.drawImage(image, dx, dy, dw, dh);
}

interface UvPoint {
  u: number;
  v: number;
}

/** Screenshot top-left, top-right, and bottom-left in the mesh's UV space. */
interface ScreenUvCorners {
  tl: UvPoint;
  tr: UvPoint;
  bl: UvPoint;
}

function uvToCanvasPoint(
  uv: UvPoint,
  width: number,
  height: number,
  flipY: boolean
): { x: number; y: number } {
  return {
    x: uv.u * width,
    y: (flipY ? 1 - uv.v : uv.v) * height,
  };
}

function collectScreenSamples(
  root: THREE.Object3D,
  material: THREE.MeshStandardMaterial,
  filterUv?: (u: number, v: number) => boolean
): { points: THREE.Vector3[]; uvs: THREE.Vector2[] } {
  root.updateWorldMatrix(true, true);
  const points: THREE.Vector3[] = [];
  const uvs: THREE.Vector2[] = [];

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const list = Array.isArray(child.material) ? child.material : [child.material];
    if (!list.includes(material)) return;
    const pos = child.geometry.attributes.position;
    const uv = child.geometry.attributes.uv;
    if (!pos || !uv) return;
    child.updateWorldMatrix(true, false);
    for (let i = 0; i < pos.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      if (filterUv && !filterUv(u, v)) continue;
      points.push(
        new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(child.matrixWorld)
      );
      uvs.push(new THREE.Vector2(u, v));
    }
  });

  return { points, uvs };
}

function facingNormal(points: THREE.Vector3[]): THREE.Vector3 {
  const box = new THREE.Box3().setFromPoints(points);
  const size = box.getSize(new THREE.Vector3());
  const normal = new THREE.Vector3();
  if (size.x <= size.y && size.x <= size.z) normal.set(1, 0, 0);
  else if (size.y <= size.x && size.y <= size.z) normal.set(0, 1, 0);
  else normal.set(0, 0, 1);
  // Camera sits at +Z looking toward the origin, so the screen should face +Z.
  if (normal.dot(new THREE.Vector3(0, 0, 1)) < 0) normal.negate();
  return normal;
}

/**
 * Maps the screenshot so its top-left lands on the visually top-left of the
 * screen. GLB UVs are often flipped, mirrored, or rotated 90° in the atlas.
 */
function detectScreenUvCorners(
  root: THREE.Object3D | undefined,
  material: THREE.MeshStandardMaterial,
  island?: { rect: ScreenRect; width: number; height: number; flipY: boolean }
): ScreenUvCorners | null {
  if (!root) return null;

  const filterUv = island
    ? (u: number, v: number) => {
        const p = uvToCanvasPoint({ u, v }, island.width, island.height, island.flipY);
        const pad = 2;
        return (
          p.x >= island.rect.x - pad &&
          p.x <= island.rect.x + island.rect.width + pad &&
          p.y >= island.rect.y - pad &&
          p.y <= island.rect.y + island.rect.height + pad
        );
      }
    : undefined;

  const { points, uvs } = collectScreenSamples(root, material, filterUv);
  if (points.length < 3) return null;

  const normal = facingNormal(points);
  const up = new THREE.Vector3(0, 1, 0);
  up.addScaledVector(normal, -up.dot(normal));
  if (up.lengthSq() < 1e-8) {
    up.set(0, 0, -1);
    up.addScaledVector(normal, -up.dot(normal));
  }
  if (up.lengthSq() < 1e-8) return null;
  up.normalize();
  const right = up.clone().cross(normal);
  if (right.lengthSq() < 1e-8) return null;
  right.normalize();

  const coords: { r: number; u: number }[] = [];
  let minR = Infinity;
  let maxR = -Infinity;
  let minU = Infinity;
  let maxU = -Infinity;
  for (const p of points) {
    const r = p.dot(right);
    const uu = p.dot(up);
    coords.push({ r, u: uu });
    minR = Math.min(minR, r);
    maxR = Math.max(maxR, r);
    minU = Math.min(minU, uu);
    maxU = Math.max(maxU, uu);
  }

  const nearest = (targetR: number, targetU: number): THREE.Vector2 => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < coords.length; i++) {
      const dr = coords[i].r - targetR;
      const du = coords[i].u - targetU;
      const d = dr * dr + du * du;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return uvs[best];
  };

  const tl = nearest(minR, maxU);
  const tr = nearest(maxR, maxU);
  const bl = nearest(minR, minU);
  const area = Math.abs((tr.x - tl.x) * (bl.y - tl.y) - (bl.x - tl.x) * (tr.y - tl.y));
  if (area < 1e-8) return null;

  return {
    tl: { u: tl.x, v: tl.y },
    tr: { u: tr.x, v: tr.y },
    bl: { u: bl.x, v: bl.y },
  };
}

function drawOrientedScreenshot(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  corners: ScreenUvCorners,
  texWidth: number,
  texHeight: number,
  flipY: boolean,
  origin: { x: number; y: number } = { x: 0, y: 0 }
): void {
  const { width: sw, height: sh } = sourceSize(image);
  if (!sw || !sh) return;

  const map = (uv: UvPoint) => {
    const p = uvToCanvasPoint(uv, texWidth, texHeight, flipY);
    return { x: p.x - origin.x, y: p.y - origin.y };
  };
  const tl = map(corners.tl);
  const tr = map(corners.tr);
  const bl = map(corners.bl);

  // Transform on a scratch canvas, then blit. Some browsers upload a
  // corrupted texture if the WebGL source canvas itself used setTransform.
  const scratch = make2dCanvas(ctx.canvas.width, ctx.canvas.height);
  const scratchCtx = getContext(scratch);
  scratchCtx.setTransform(
    (tr.x - tl.x) / sw,
    (tr.y - tl.y) / sw,
    (bl.x - tl.x) / sh,
    (bl.y - tl.y) / sh,
    tl.x,
    tl.y
  );
  scratchCtx.drawImage(image, 0, 0);
  ctx.drawImage(scratch, 0, 0);
}

function copyTextureParams(from: THREE.Texture, to: THREE.Texture): void {
  to.flipY = from.flipY;
  to.colorSpace = from.colorSpace;
  to.wrapS = from.wrapS;
  to.wrapT = from.wrapT;
  to.minFilter = from.minFilter;
  to.magFilter = from.magFilter;
  to.generateMipmaps = from.generateMipmaps;
}

/** Screen maps are sampled at high mag; mipmaps from Repeat GLB samplers smear into streaks. */
function prepareScreenMap(tex: THREE.Texture): void {
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
}

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function grayscaleImageData(image: ImageData): void {
  const px = image.data;
  for (let i = 0; i < px.length; i += 4) {
    const y = luma(px[i], px[i + 1], px[i + 2]);
    px[i] = y;
    px[i + 1] = y;
    px[i + 2] = y;
  }
}

function grayscaleCanvas(canvas: HTMLCanvasElement): void {
  const ctx = getContext(canvas);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  grayscaleImageData(data);
  ctx.putImageData(data, 0, 0);
}

function desaturateColor(color: THREE.Color): void {
  const y = luma(color.r, color.g, color.b);
  color.setRGB(y, y, y);
}

function grayscaleColorTexture(texture: THREE.Texture): THREE.CanvasTexture | null {
  try {
    const { canvas } = rasterizeTexture(texture);
    grayscaleCanvas(canvas);
    const next = new THREE.CanvasTexture(canvas);
    copyTextureParams(texture, next);
    return next;
  } catch {
    return null;
  }
}

function desaturateStandardMaterial(mat: THREE.MeshStandardMaterial): void {
  desaturateColor(mat.color);
  desaturateColor(mat.emissive);
}

function grayscaleOtherMaterials(
  root: THREE.Object3D,
  screenMaterial: THREE.MeshStandardMaterial
): THREE.CanvasTexture[] {
  const extras: THREE.CanvasTexture[] = [];
  const seen = new Set<THREE.Material>();

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const raw of mats) {
      if (!raw || seen.has(raw)) continue;
      seen.add(raw);
      const mat = asStandardMaterial(raw);
      if (!mat || mat === screenMaterial) continue;
      desaturateStandardMaterial(mat);
      if (mat.map) {
        const tex = grayscaleColorTexture(mat.map);
        if (tex) {
          mat.map = tex;
          extras.push(tex);
        }
      }
      if (mat.emissiveMap) {
        const tex = grayscaleColorTexture(mat.emissiveMap);
        if (tex) {
          mat.emissiveMap = tex;
          extras.push(tex);
        }
      }
      mat.needsUpdate = true;
    }
  });

  return extras;
}

function paintScreen(options: {
  screenshot: CanvasImageSource;
  rect: ScreenRect;
  mask: Uint8Array;
  originalEmissive: HTMLCanvasElement;
  originalAlbedo: HTMLCanvasElement | null;
  outEmissive: HTMLCanvasElement;
  outAlbedo: HTMLCanvasElement | null;
  corners: ScreenUvCorners | null;
  flipY: boolean;
}): void {
  const {
    screenshot,
    rect,
    mask,
    originalEmissive,
    originalAlbedo,
    outEmissive,
    outAlbedo,
    corners,
    flipY,
  } = options;

  const screenCanvas = make2dCanvas(rect.width, rect.height);
  const screenCtx = getContext(screenCanvas);
  screenCtx.fillStyle = '#000';
  screenCtx.fillRect(0, 0, rect.width, rect.height);
  if (corners) {
    screenCtx.save();
    screenCtx.beginPath();
    screenCtx.rect(0, 0, rect.width, rect.height);
    screenCtx.clip();
    drawOrientedScreenshot(
      screenCtx,
      screenshot,
      corners,
      originalEmissive.width,
      originalEmissive.height,
      flipY,
      { x: rect.x, y: rect.y }
    );
    screenCtx.restore();
  } else {
    drawFill(screenCtx, screenshot, 0, 0, rect.width, rect.height);
  }
  const shot = screenCtx.getImageData(0, 0, rect.width, rect.height);

  const emissiveCtx = getContext(outEmissive);
  emissiveCtx.clearRect(0, 0, outEmissive.width, outEmissive.height);
  emissiveCtx.drawImage(originalEmissive, 0, 0);
  const emissiveDest = emissiveCtx.getImageData(rect.x, rect.y, rect.width, rect.height);

  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const p = i * 4;
    emissiveDest.data[p] = shot.data[p];
    emissiveDest.data[p + 1] = shot.data[p + 1];
    emissiveDest.data[p + 2] = shot.data[p + 2];
    emissiveDest.data[p + 3] = 255;
  }
  emissiveCtx.putImageData(emissiveDest, rect.x, rect.y);

  if (outAlbedo && originalAlbedo) {
    const albedoCtx = getContext(outAlbedo);
    albedoCtx.clearRect(0, 0, outAlbedo.width, outAlbedo.height);
    albedoCtx.drawImage(originalAlbedo, 0, 0);
    const albedoDest = albedoCtx.getImageData(rect.x, rect.y, rect.width, rect.height);
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      const p = i * 4;
      albedoDest.data[p] = 0;
      albedoDest.data[p + 1] = 0;
      albedoDest.data[p + 2] = 0;
      albedoDest.data[p + 3] = 255;
    }
    albedoCtx.putImageData(albedoDest, rect.x, rect.y);
  }
}

function createDedicatedScreenCompositor(
  material: THREE.MeshStandardMaterial,
  root?: THREE.Object3D
): ScreenCompositor {
  const source = material.map || material.emissiveMap;
  if (!source) {
    throw new Error('Screen material has no texture to replace');
  }

  const { canvas } = rasterizeTexture(source);
  const out = make2dCanvas(canvas.width, canvas.height);
  const screenTex = new THREE.CanvasTexture(out);
  copyTextureParams(source, screenTex);
  prepareScreenMap(screenTex);

  material.map = screenTex;
  material.emissiveMap = screenTex;
  material.color.set(1, 1, 1);
  material.emissive.set(1, 1, 1);
  material.emissiveIntensity = 1.25;
  material.metalness = 0;
  material.roughness = 0.4;
  material.metalnessMap = null;
  material.roughnessMap = null;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -2;
  material.polygonOffsetUnits = -2;
  material.needsUpdate = true;

  const extraMaps = root ? grayscaleOtherMaterials(root, material) : [];
  const corners = detectScreenUvCorners(root, material);
  const flipY = screenTex.flipY;

  return {
    apply(screenshot: CanvasImageSource) {
      const ctx = getContext(out);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, out.width, out.height);
      if (corners) {
        drawOrientedScreenshot(ctx, screenshot, corners, out.width, out.height, flipY);
      } else {
        drawFill(ctx, screenshot, 0, 0, out.width, out.height);
      }
      screenTex.needsUpdate = true;
      material.needsUpdate = true;
    },
    dispose() {
      screenTex.dispose();
      for (const tex of extraMaps) tex.dispose();
    },
  };
}

function createAtlasScreenCompositor(
  material: THREE.MeshStandardMaterial,
  root?: THREE.Object3D
): ScreenCompositor {
  if (!material.emissiveMap) {
    throw new Error('Device material has no emissive map to composite onto');
  }

  const emissive = rasterizeTexture(material.emissiveMap);
  const albedo = material.map ? rasterizeTexture(material.map) : null;
  const rect = detectScreenRect(emissive.imageData);
  if (!rect) {
    throw new Error('Could not detect a screen region in the emissive map');
  }

  const mask = buildScreenMask(emissive.imageData, rect);
  grayscaleCanvas(emissive.canvas);
  if (albedo) grayscaleCanvas(albedo.canvas);

  const extraMaps = root ? grayscaleOtherMaterials(root, material) : [];
  desaturateStandardMaterial(material);
  const flipY = material.emissiveMap.flipY;
  const corners = detectScreenUvCorners(root, material, {
    rect,
    width: emissive.canvas.width,
    height: emissive.canvas.height,
    flipY,
  });

  const outEmissive = make2dCanvas(emissive.canvas.width, emissive.canvas.height);
  const outAlbedo = albedo
    ? make2dCanvas(albedo.canvas.width, albedo.canvas.height)
    : null;

  const emissiveTex = new THREE.CanvasTexture(outEmissive);
  copyTextureParams(material.emissiveMap, emissiveTex);
  prepareScreenMap(emissiveTex);
  material.emissiveMap = emissiveTex;
  material.emissive.set(1, 1, 1);
  material.emissiveIntensity = 1.25;

  let albedoTex: THREE.CanvasTexture | null = null;
  if (outAlbedo && material.map) {
    albedoTex = new THREE.CanvasTexture(outAlbedo);
    copyTextureParams(material.map, albedoTex);
    prepareScreenMap(albedoTex);
    material.map = albedoTex;
  }
  material.polygonOffset = true;
  material.polygonOffsetFactor = -2;
  material.polygonOffsetUnits = -2;
  material.needsUpdate = true;

  return {
    apply(screenshot: CanvasImageSource) {
      paintScreen({
        screenshot,
        rect,
        mask,
        originalEmissive: emissive.canvas,
        originalAlbedo: albedo?.canvas ?? null,
        outEmissive,
        outAlbedo,
        corners,
        flipY,
      });
      emissiveTex.needsUpdate = true;
      if (albedoTex) albedoTex.needsUpdate = true;
      material.needsUpdate = true;
    },
    dispose() {
      emissiveTex.dispose();
      albedoTex?.dispose();
      for (const tex of extraMaps) tex.dispose();
    },
  };
}

export function createScreenCompositor(
  material: THREE.MeshStandardMaterial,
  root?: THREE.Object3D
): ScreenCompositor {
  if (isDedicatedScreenMaterial(material, root)) {
    return createDedicatedScreenCompositor(material, root);
  }
  return createAtlasScreenCompositor(material, root);
}
