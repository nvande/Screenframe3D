import { MAX_WEB_TEXTURE_SIZE } from './constants';

export function fitTextureSize(
  width: number,
  height: number,
  maxSize = MAX_WEB_TEXTURE_SIZE
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSize) return { width, height };
  const scale = maxSize / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function drawToFittedCanvas(
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  maxSize = MAX_WEB_TEXTURE_SIZE
): HTMLCanvasElement {
  const { width, height } = fitTextureSize(sourceWidth, sourceHeight, maxSize);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not create 2D canvas context');
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, width, height);
  return canvas;
}
