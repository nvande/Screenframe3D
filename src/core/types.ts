export type DeviceModel = 'iphone14';

export interface DeviceShowcaseOptions {
  container: HTMLElement;
  screenshot: string;
  device: DeviceModel;
  scrollTilt?: boolean;
  fallbackImage?: string;
  fallbackCondition?: () => boolean;
}

export interface DeviceShowcaseInstance {
  destroy: () => void;
  updateScreenshot: (url: string) => void;
  setScrollTilt: (enabled: boolean) => void;
} 