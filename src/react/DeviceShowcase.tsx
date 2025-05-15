import React, { useEffect, useRef } from 'react';
import { initDeviceShowcase, DeviceShowcaseInstance } from '../core/initDeviceShowcase';
import { DeviceModel } from '../core/types';

export interface DeviceShowcaseProps {
  screenshot: string;
  device: DeviceModel;
  scrollTilt?: boolean;
  fallbackImage?: string;
  fallbackCondition?: () => boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const DeviceShowcase: React.FC<DeviceShowcaseProps> = ({
  screenshot,
  device,
  scrollTilt = true,
  fallbackImage,
  fallbackCondition,
  className,
  style,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<DeviceShowcaseInstance | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const init = async () => {
      instanceRef.current = await initDeviceShowcase({
        container: containerRef.current!,
        screenshot,
        device,
        scrollTilt,
        fallbackImage,
        fallbackCondition,
      });
    };

    init();

    return () => {
      instanceRef.current?.destroy();
    };
  }, [screenshot, device, scrollTilt, fallbackImage, fallbackCondition]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '300px',
        ...style,
      }}
    />
  );
};

export default DeviceShowcase; 