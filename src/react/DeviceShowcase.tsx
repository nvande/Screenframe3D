'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { initDeviceShowcase, DeviceShowcaseInstance } from '../core/initDeviceShowcase';
import { setPublicBase } from '../core/assets';
import {
  POSTER_IMG_STYLE,
  SCREENFRAME_POSTER_CLASS,
  resolvePosterSrc,
} from '../core/poster';
import { DeviceModelId, SpringConfig } from '../core/types';

export interface DeviceShowcaseProps {
  screenshot: string;
  device: DeviceModelId;
  scrollTilt?: boolean;
  fallbackImage?: string;
  fallbackCondition?: () => boolean;
  poster?: string | boolean;
  cachePoster?: boolean;
  cacheDeviceTextures?: boolean;
  onPosterCapture?: (blob: Blob) => void;
  onReady?: () => void;
  spring?: SpringConfig;
  baseTilt?: { x?: number; y?: number; z?: number };
  fov?: number;
  tiltEnabled?: boolean;
  zoom?: number;
  environment?: string;
  publicBase?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const DeviceShowcase: React.FC<DeviceShowcaseProps> = ({
  screenshot,
  device,
  scrollTilt = true,
  fallbackImage,
  fallbackCondition,
  poster,
  cachePoster,
  cacheDeviceTextures,
  onPosterCapture,
  onReady,
  spring,
  baseTilt,
  fov,
  tiltEnabled,
  zoom,
  environment,
  publicBase,
  className,
  style,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<DeviceShowcaseInstance | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const [live, setLive] = useState(false);
  const posterSrc = useMemo(() => {
    setPublicBase(publicBase ?? '/');
    return resolvePosterSrc(poster, {
      device,
      screenshot,
      fov,
      zoom,
      tilt: baseTilt,
      environment,
    });
  }, [poster, device, screenshot, fov, zoom, baseTilt, environment, publicBase]);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    setLive(false);

    const init = async () => {
      instanceRef.current = await initDeviceShowcase({
        container: containerRef.current!,
        screenshot,
        device,
        scrollTilt,
        fallbackImage,
        fallbackCondition,
        poster,
        cachePoster,
        cacheDeviceTextures,
        onPosterCapture,
        onReady: () => {
          if (!cancelled) setLive(true);
          onReadyRef.current?.();
        },
        spring,
        baseTilt,
        fov,
        tiltEnabled,
        zoom,
        environment,
        publicBase,
      });
    };

    init();

    return () => {
      cancelled = true;
      instanceRef.current?.destroy();
    };
  }, [
    screenshot,
    device,
    scrollTilt,
    fallbackImage,
    fallbackCondition,
    poster,
    cachePoster,
    cacheDeviceTextures,
    onPosterCapture,
    spring,
    baseTilt,
    fov,
    tiltEnabled,
    zoom,
    environment,
    publicBase,
  ]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '300px',
        ...style,
      }}
    >
      {posterSrc ? (
        <img
          className={SCREENFRAME_POSTER_CLASS}
          src={posterSrc}
          alt=""
          draggable={false}
          onError={(event) => {
            event.currentTarget.style.visibility = 'hidden';
          }}
          style={{
            ...(POSTER_IMG_STYLE as React.CSSProperties),
            opacity: live ? 0 : 1,
          }}
        />
      ) : null}
    </div>
  );
};

export default DeviceShowcase;
