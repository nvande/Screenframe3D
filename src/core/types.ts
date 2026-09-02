export type Manufacturer = 'apple' | 'samsung' | 'google' | 'lenovo';

export type DeviceType = 
  | 'iphone'
  | 'ipad'
  | 'macbook'
  | 'galaxy'
  | 'pixel'
  | 'thinkpad'
  | 'yoga';

export interface DeviceModel {
  manufacturer: Manufacturer;
  type: DeviceType;
  model: string;
  year?: number;
}

export type DeviceModelId = string; // e.g., "apple/iphone-14-pro"

export interface SpringConfig {
  enabled: boolean;
  strength?: number;
  damping?: number;
  mass?: number;
}

export interface DeviceShowcaseOptions {
  container: HTMLElement;
  screenshot: string;
  device: DeviceModelId;
  scrollTilt?: boolean;
  fallbackImage?: string;
  fallbackCondition?: () => boolean;
  spring?: SpringConfig;
  baseTilt?: {
    x?: number; // in radians
    y?: number; // in radians
    z?: number; // in radians
  };
  fov?: number; // Field of view in degrees
  tiltEnabled?: boolean; // Whether mouse tilt is enabled
  /** Apparent size in the container. 1 is default; 2 is twice as large. */
  zoom?: number;
  /** Equirectangular HDR used for lighting and reflections. */
  environment?: string;
  /**
   * Prefix for models, posters, env maps, and screenshots.
   * Use `import.meta.env.BASE_URL` when deploying under a subpath (GitHub Pages).
   */
  publicBase?: string;
  /**
   * Still shown while the 3D device loads. A string is a static asset URL.
   * `true` / `'auto'` / omit uses `/posters/{screenshot}--{device}--{settings}.webp`.
   * `false` disables the poster.
   */
  poster?: string | boolean;
  /** When true (default), save a first-frame raster for IndexedDB and the Vite plugin. */
  cachePoster?: boolean;
  /**
   * When true (default), extract GLB maps to `/textures/{device}/{material}-{slot}.png`
   * on first run and reuse those files afterward.
   */
  cacheDeviceTextures?: boolean;
  /** Called with a PNG/WebP of the first fully lit frame. */
  onPosterCapture?: (blob: Blob) => void;
  /** Called after the first 3D frame is on screen. */
  onReady?: () => void;
}

export interface DeviceShowcaseInstance {
  destroy: () => void;
  updateScreenshot: (url: string) => void;
  setScrollTilt: (enabled: boolean) => void;
  setSpringConfig: (config: SpringConfig) => void;
  setBaseTilt: (tilt: { x?: number; y?: number; z?: number }) => void;
  setFOV: (fov: number) => void;
  setTiltEnabled: (enabled: boolean) => void;
}

// Helper function to convert DeviceModel to DeviceModelId
export function getDeviceModelId(model: DeviceModel): DeviceModelId {
  const year = model.year ? `-${model.year}` : '';
  return `${model.manufacturer}/${model.type}-${model.model}${year}`;
}

// Helper function to parse DeviceModelId to DeviceModel
export function parseDeviceModelId(id: DeviceModelId): DeviceModel {
  const [manufacturer, rest] = id.split('/');
  const parts = rest.split('-');
  
  // Handle year if present
  let year: number | undefined;
  if (parts[parts.length - 1].match(/^\d{4}$/)) {
    year = parseInt(parts.pop()!, 10);
  }
  
  const type = parts[0] as DeviceType;
  const model = parts.slice(1).join('-');
  
  return {
    manufacturer: manufacturer as Manufacturer,
    type,
    model,
    year
  };
} 