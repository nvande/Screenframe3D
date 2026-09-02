export { initDeviceShowcase } from './core/initDeviceShowcase';
export { getPublicBase, publicUrl, setPublicBase } from './core/assets';
export type { DeviceShowcaseOptions, DeviceShowcaseInstance, DeviceModel, DeviceModelId } from './core/types';
export {
  matchPosterFile,
  posterCacheKey,
  posterFileName,
  posterPublicPath,
  posterSettingsKey,
  posterUrlFor,
  resolvePosterSrc,
  deviceStem,
  screenshotStem,
  POSTER_BOOT_URL,
  POSTER_DEFAULTS,
  POSTER_FILENAME_RE,
  POSTER_IMG_STYLE,
  SCREENFRAME_POSTER_CLASS,
} from './core/poster';
export type { PosterLook, PosterOption } from './core/poster';
export {
  syncDeviceTextures,
  deviceTextureDir,
  deviceTextureUrl,
  persistTextureToDevServer,
  TEXTURE_PUBLIC_ROOT,
  SCREENFRAME_TEXTURE_SAVE_PATH,
} from './core/deviceTextures';
export { MAX_WEB_TEXTURE_SIZE } from './core/constants';
