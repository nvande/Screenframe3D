import { publicUrl } from './assets';
import { DEFAULT_ENVIRONMENT_URL } from './constants';

export const POSTER_DEFAULTS = {
  fov: 45,
  zoom: 1,
  environment: DEFAULT_ENVIRONMENT_URL,
} as const;

/** `{screenshot}--{device}--{settings-hash}.webp` */
export const POSTER_FILENAME_RE =
  /^[A-Za-z0-9._-]+--[A-Za-z0-9._-]+--[0-9a-f]+\.webp$/;

function safeStem(value: string, fallback: string): string {
  const stem = value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return stem || fallback;
}

export function screenshotStem(screenshot: string): string {
  const path = screenshot.split('?')[0].split('#')[0];
  const base = path.split('/').pop() || 'screenshot';
  return safeStem(base.replace(/\.[a-z0-9]+$/i, ''), 'screenshot');
}

export function deviceStem(device: string): string {
  const path = device.split('?')[0].split('#')[0];
  return safeStem(path, 'device');
}

function fnv1a(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function posterSettingsKey(parts: {
  device: string;
  fov: number;
  zoom: number;
  tilt: { x?: number; y?: number; z?: number };
  environment?: string;
}): string {
  const { x = 0, y = 0, z = 0 } = parts.tilt;
  return [
    parts.device,
    parts.environment ?? POSTER_DEFAULTS.environment,
    parts.fov,
    parts.zoom,
    x,
    y,
    z,
  ].join('|');
}

export function posterCacheKey(parts: {
  device: string;
  screenshot: string;
  fov: number;
  zoom: number;
  tilt: { x?: number; y?: number; z?: number };
  environment?: string;
}): string {
  return `${screenshotStem(parts.screenshot)}|${posterSettingsKey(parts)}`;
}

export type PosterOption = string | boolean;

export interface PosterLook {
  device: string;
  screenshot: string;
  fov?: number;
  zoom?: number;
  tilt?: { x?: number; y?: number; z?: number };
  environment?: string;
}

export function posterFileName(look: PosterLook): string {
  const screenshot = screenshotStem(look.screenshot);
  const device = deviceStem(look.device);
  const settings = posterSettingsKey({
    device: look.device,
    fov: look.fov ?? POSTER_DEFAULTS.fov,
    zoom: look.zoom ?? POSTER_DEFAULTS.zoom,
    tilt: look.tilt ?? {},
    environment: look.environment,
  });
  return `${screenshot}--${device}--${fnv1a(settings)}.webp`;
}

export function posterPublicPath(look: PosterLook): string {
  return publicUrl(`posters/${posterFileName(look)}`);
}

export function posterUrlFor(look: PosterLook): string {
  return posterPublicPath(look);
}

/** Pick a captured still by exact look, then by screenshot + device prefix. */
export function matchPosterFile(files: string[], look: PosterLook): string | null {
  const names = files.map((file) => file.split('/').pop() || file);
  const exact = posterFileName(look);
  if (names.includes(exact)) return exact;
  const prefix = `${screenshotStem(look.screenshot)}--${deviceStem(look.device)}--`;
  return names.find((name) => name.startsWith(prefix) && name.endsWith('.webp')) ?? null;
}

/** `false` skips a poster. Any other value uses a static URL (explicit or hashed). */
export function resolvePosterSrc(
  poster: PosterOption | undefined,
  look: PosterLook
): string | null {
  if (poster === false) return null;
  if (typeof poster === 'string' && poster !== 'auto') return poster;
  return posterUrlFor(look);
}

export const POSTER_IMG_STYLE: Record<string, string> = {
  position: 'absolute',
  inset: '0',
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  pointerEvents: 'none',
  zIndex: '0',
  transition: 'opacity 320ms ease',
};

export const SCREENFRAME_POSTER_CLASS = 'screenframe3d-poster';
export const SCREENFRAME_POSTER_SAVE_PATH = '/@screenframe/poster/';
export const POSTER_BOOT_URL = '/posters/boot.js';

const DB_NAME = 'screenframe3d';
const STORE = 'posters';

function openPosterDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export async function getCachedPoster(key: string): Promise<Blob | null> {
  const db = await openPosterDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
    req.onerror = () => resolve(null);
  });
}

export async function setCachedPoster(key: string, blob: Blob): Promise<void> {
  const db = await openPosterDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export function mountPoster(
  container: HTMLElement,
  url: string
): HTMLImageElement {
  const existing = container.querySelector<HTMLImageElement>(`.${SCREENFRAME_POSTER_CLASS}`);
  if (existing) {
    if (url) existing.src = url;
    return existing;
  }

  const position = getComputedStyle(container).position;
  if (position === 'static' || !position) {
    container.style.position = 'relative';
  }

  const img = document.createElement('img');
  img.className = SCREENFRAME_POSTER_CLASS;
  img.alt = '';
  img.draggable = false;
  img.src = url;
  Object.assign(img.style, POSTER_IMG_STYLE);
  img.addEventListener('error', () => {
    img.style.display = 'none';
  });
  container.appendChild(img);
  return img;
}

export async function persistPosterToDevServer(fileName: string, blob: Blob): Promise<boolean> {
  if (!POSTER_FILENAME_RE.test(fileName)) return false;
  try {
    const response = await fetch(`${SCREENFRAME_POSTER_SAVE_PATH}${fileName}`, {
      method: 'PUT',
      headers: { 'content-type': blob.type || 'image/webp' },
      body: blob,
    });
    return response.ok || response.status === 204;
  } catch {
    return false;
  }
}

export function captureRendererFrame(canvas: HTMLCanvasElement): Promise<Blob> {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) {
    return Promise.reject(new Error('Could not capture poster frame'));
  }
  ctx.drawImage(canvas, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    const finish = (blob: Blob | null, fallback = true) => {
      if (blob) {
        resolve(blob);
        return;
      }
      if (fallback) {
        out.toBlob((png) => finish(png, false), 'image/png');
        return;
      }
      reject(new Error('Poster capture failed'));
    };
    out.toBlob((blob) => finish(blob), 'image/webp', 0.88);
  });
}
