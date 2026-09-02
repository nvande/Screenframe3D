import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DeviceShowcaseOptions, DeviceShowcaseInstance, SpringConfig } from './types';
import {
  createScreenCompositor,
  findScreenMaterial,
  loadImage,
  type ScreenCompositor,
} from './applyScreenTexture';
import { syncDeviceTextures } from './deviceTextures';
import {
  DEFAULT_ENVIRONMENT_URL,
  applyEnvironmentMap,
  prepareRendererForIBL,
} from './environment';
import {
  captureRendererFrame,
  mountPoster,
  persistPosterToDevServer,
  posterCacheKey,
  posterFileName,
  resolvePosterSrc,
  setCachedPoster,
} from './poster';
import { publicUrl, setPublicBase } from './assets';

export type { DeviceShowcaseInstance };

export async function initDeviceShowcase(
  options: DeviceShowcaseOptions
): Promise<DeviceShowcaseInstance> {
  const {
    container,
    screenshot,
    device,
    scrollTilt = true,
    fallbackImage,
    fallbackCondition = () => false,
    spring = { enabled: true, strength: 0.05, damping: 0.9, mass: 2 },
    baseTilt = { x: 0, y: 0, z: 0 },
    fov = 45,
    tiltEnabled: initialTiltEnabled = true,
    zoom = 1,
    environment = DEFAULT_ENVIRONMENT_URL,
    publicBase,
    poster,
    cachePoster = true,
    cacheDeviceTextures = true,
    onPosterCapture,
    onReady
  } = options;

  setPublicBase(publicBase ?? '/');

  const screenshotUrl = publicUrl(screenshot);
  const environmentUrl = publicUrl(environment);
  const fallbackUrl = fallbackImage ? publicUrl(fallbackImage) : screenshotUrl;

  let tiltEnabled = initialTiltEnabled;

  console.log('Initializing device showcase with options:', { device, screenshot, spring, baseTilt, fov, tiltEnabled });

  // Check if we should use fallback mode
  if (fallbackCondition()) {
    console.log('Using fallback mode');
    const img = document.createElement('img');
    img.src = fallbackUrl;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    container.appendChild(img);
    onReady?.();

    return {
      destroy: () => {
        container.removeChild(img);
      },
      updateScreenshot: (url: string) => {
        img.src = publicUrl(url);
      },
      setScrollTilt: () => {},
      setSpringConfig: () => {},
      setBaseTilt: () => {},
      setFOV: () => {},
      setTiltEnabled: () => {}
    };
  }

  const cacheKey = posterCacheKey({
    device,
    screenshot,
    fov,
    zoom,
    tilt: baseTilt,
    environment,
  });
  let posterEl: HTMLImageElement | null = null;
  let createdPoster = false;
  const existingPoster = container.querySelector<HTMLImageElement>('.screenframe3d-poster');
  const posterSrc = resolvePosterSrc(poster, {
    device,
    screenshot,
    fov,
    zoom,
    tilt: baseTilt,
    environment,
  });
  if (existingPoster) {
    posterEl = existingPoster;
    if (posterSrc) existingPoster.src = posterSrc;
  } else if (posterSrc) {
    posterEl = mountPoster(container, posterSrc);
    createdPoster = true;
  }

  // Initialize Three.js scene
  console.log('Initializing Three.js scene');
  const scene = new THREE.Scene();
  
  // Load device model first to get its aspect ratio
  console.log('Loading device model:', device);
  const loader = new GLTFLoader();
  const modelPath = publicUrl(`models/${device}.glb`);
  console.log('Model path:', modelPath);
  
  try {
    const model = await loader.loadAsync(modelPath);
    console.log('Model loaded successfully:', model);
    
    // Log model structure to find screen mesh
    console.log('Model structure:');
    model.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        console.log('Found mesh:', {
          name: child.name,
          material: child.material,
          geometry: child.geometry
        });
      }
    });
    
    // Calculate model aspect ratio
    const box = new THREE.Box3().setFromObject(model.scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    
    // Initialize camera with model's aspect ratio
    const camera = new THREE.PerspectiveCamera(
      fov,
      Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1),
      0.1,
      1000
    );
    
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(
      Math.max(container.clientWidth, 1),
      Math.max(container.clientHeight, 1)
    );
    prepareRendererForIBL(renderer);
    
    // Function to calculate optimal scale and position
    const calculateOptimalFit = () => {
      const containerWidth = Math.max(container.clientWidth, 1);
      const containerHeight = Math.max(container.clientHeight, 1);
      const scale =
        Math.min(containerHeight / size.y, containerWidth / size.x) * 0.15;
      const modelSize = Math.max(size.x, size.y) * scale;
      const refFov = 45;
      const refFovRad = (refFov * Math.PI) / 180;
      const baseDistance = (modelSize / 2) / Math.tan(refFovRad / 2) * 4.5;
      const distance = baseDistance * Math.pow(refFov / fov, 2.5) * 0.5 / Math.max(zoom, 0.1);
      return { scale, distance };
    };

    const applyFit = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width < 2 || height < 2) return false;
      const { scale, distance } = calculateOptimalFit();
      pivot.scale.setScalar(scale);
      camera.position.z = distance;
      camera.position.y = 0;
      camera.lookAt(0, 0, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, true);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      return true;
    };
    
    const { scale, distance } = calculateOptimalFit();

    // GLB origin is the bottom of the phone; pivot around the visual center.
    const pivot = new THREE.Group();
    model.scene.position.copy(center).negate();
    pivot.add(model.scene);
    pivot.scale.setScalar(scale);
    scene.add(pivot);
    
    // Position camera
    camera.position.z = distance;
    camera.position.y = 0;
    camera.lookAt(0, 0, 0);
    
    // Update camera aspect ratio to match container
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.zIndex = '1';
    renderer.domElement.style.opacity = '0';
    renderer.domElement.style.transition = 'opacity 320ms ease';
    renderer.domElement.style.display = 'block';
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }
    container.appendChild(renderer.domElement);

    let screenCompositor: ScreenCompositor | null = null;
    await syncDeviceTextures(model.scene, device, cacheDeviceTextures);
    const screenMaterial = findScreenMaterial(model.scene);
    if (screenMaterial) {
      try {
        console.log('Compositing screenshot onto device screen:', screenshot, screenMaterial.name);
        screenCompositor = createScreenCompositor(screenMaterial, model.scene);
        screenCompositor.apply(await loadImage(screenshotUrl));
      } catch (error) {
        console.warn('Could not apply screenshot to the device screen', error);
        screenCompositor = null;
      }
    } else {
      console.warn('No screen or wallpaper material was found on the model');
    }

    let environmentHandle: { dispose: () => void } | null = null;
    try {
      environmentHandle = await applyEnvironmentMap(
        renderer,
        scene,
        environmentUrl,
        model.scene
      );
      console.log('Loaded environment map:', environment);
    } catch (error) {
      console.warn('Could not load environment map; falling back to basic lights', error);
    }

    // Keep lights modest so the HDRI provides most of the look
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.08);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xfff2e0, 0.22);
    directionalLight.position.set(4, 6, 5);
    scene.add(directionalLight);

    // Animation loop
    let animationFrameId = 0;
    // Set base tilt
    let rotX = baseTilt.x || 0;
    let rotY = baseTilt.y || 0;
    let rotZ = baseTilt.z || 0;
    let mouseRotationX = 0;
    let mouseRotationY = 0;
    let currentRotationX = rotX;
    let currentRotationY = rotY;
    let currentRotationZ = rotZ;
    let velocityX = 0;
    let velocityY = 0;
    let velocityZ = 0;

    // Spring physics constants
    const springStrength = spring.strength || 0.05;
    const damping = spring.damping || 0.9;
    const mass = spring.mass || 2;

    // Handle mouse movement
    const handleMouseMove = (event: MouseEvent) => {
      if (!tiltEnabled) return;
      
      // Calculate mouse position relative to window
      const x = event.clientX / window.innerWidth;
      const y = event.clientY / window.innerHeight;
      
      // Convert to rotation values (-0.1 to 0.1 radians)
      mouseRotationX = (y - 0.5) * 0.2;
      mouseRotationY = (x - 0.5) * 0.2;
    };

    window.addEventListener('mousemove', handleMouseMove);

    const revealLiveCanvas = () => {
      renderer.domElement.style.opacity = '1';
    };

    const hidePoster = () => {
      if (posterEl) {
        posterEl.style.opacity = '0';
        if (createdPoster) {
          window.setTimeout(() => {
            posterEl?.remove();
            posterEl = null;
          }, 360);
        }
      }
      onReady?.();
    };

    const restorePoster = () => {
      if (!posterEl || createdPoster) return;
      posterEl.style.opacity = '';
      posterEl.style.visibility = '';
      posterEl.style.display = '';
    };

    const captureFirstFrame = async () => {
      try {
        const blob = await captureRendererFrame(renderer.domElement);
        if (cachePoster) {
          await setCachedPoster(cacheKey, blob);
        }
        const fileName = posterFileName({
          device,
          screenshot,
          fov,
          zoom,
          tilt: baseTilt,
          environment,
        });
        await persistPosterToDevServer(fileName, blob);
        onPosterCapture?.(blob);
      } catch (error) {
        console.warn('Could not capture device poster frame', error);
      }
    };

    pivot.rotation.set(rotX, rotY, rotZ);

    let liveStarted = false;
    let posterHideTimer = 0;
    const startLive = () => {
      if (liveStarted || !applyFit()) return;
      liveStarted = true;
      renderer.render(scene, camera);
      revealLiveCanvas();
      animate();
      posterHideTimer = window.setTimeout(() => {
        hidePoster();
        void captureFirstFrame();
      }, 400);
    };

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      
      // Calculate target rotation by adding mouse movement to base tilt
      const targetRotationX = rotX + mouseRotationX;
      const targetRotationY = rotY + mouseRotationY;
      const targetRotationZ = rotZ;
      
      if (spring.enabled) {
        const forceX = (targetRotationX - currentRotationX) * springStrength;
        const forceY = (targetRotationY - currentRotationY) * springStrength;
        const forceZ = (targetRotationZ - currentRotationZ) * springStrength;
        
        velocityX += forceX / mass;
        velocityY += forceY / mass;
        velocityZ += forceZ / mass;
        
        velocityX *= damping;
        velocityY *= damping;
        velocityZ *= damping;
        
        currentRotationX += velocityX;
        currentRotationY += velocityY;
        currentRotationZ += velocityZ;
      } else {
        currentRotationX += (targetRotationX - currentRotationX) * 0.1;
        currentRotationY += (targetRotationY - currentRotationY) * 0.1;
        currentRotationZ += (targetRotationZ - currentRotationZ) * 0.1;
      }
      
      pivot.rotation.x = currentRotationX;
      pivot.rotation.y = currentRotationY;
      pivot.rotation.z = currentRotationZ;
      
      renderer.render(scene, camera);
    };

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        if (!liveStarted) startLive();
        else applyFit();
      });
      resizeObserver.observe(container);
    }
    startLive();

    renderer.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      restorePoster();
      renderer.domElement.style.opacity = '0';
    });

    // Handle scroll tilt
    let scrollHandler: (() => void) | undefined;
    if (scrollTilt) {
      scrollHandler = () => {
        const scrollY = window.scrollY;
        const rotation = scrollY * 0.0005;
        pivot.rotation.y = rotation + currentRotationY;
      };
      window.addEventListener('scroll', scrollHandler);
    }

    return {
      destroy: () => {
        cancelAnimationFrame(animationFrameId);
        window.clearTimeout(posterHideTimer);
        resizeObserver?.disconnect();
        if (scrollHandler) {
          window.removeEventListener('scroll', scrollHandler);
        }
        window.removeEventListener('mousemove', handleMouseMove);
        if (createdPoster) {
          posterEl?.remove();
        } else {
          restorePoster();
        }
        if (renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement);
        }
        renderer.dispose();
        screenCompositor?.dispose();
        environmentHandle?.dispose();
      },
      updateScreenshot: async (url: string) => {
        if (!screenCompositor) return;
        screenCompositor.apply(await loadImage(publicUrl(url)));
      },
      setScrollTilt: (enabled: boolean) => {
        if (scrollHandler) {
          window.removeEventListener('scroll', scrollHandler);
        }
        if (enabled) {
          scrollHandler = () => {
            const scrollY = window.scrollY;
            const rotation = scrollY * 0.0005;
            pivot.rotation.y = rotation + currentRotationY;
          };
          window.addEventListener('scroll', scrollHandler);
        }
      },
      setSpringConfig: (config: SpringConfig) => {
        spring.enabled = config.enabled;
        if (config.strength !== undefined) spring.strength = config.strength;
        if (config.damping !== undefined) spring.damping = config.damping;
        if (config.mass !== undefined) spring.mass = config.mass;
      },
      setBaseTilt: (tilt: { x?: number; y?: number; z?: number }) => {
        if (tilt.x !== undefined) {
          rotX = tilt.x;
        }
        if (tilt.y !== undefined) {
          rotY = tilt.y;
        }
        if (tilt.z !== undefined) {
          rotZ = tilt.z;
        }
      },
      setFOV: (newFov: number) => {
        // Store the old FOV for calculating the zoom factor
        const oldFov = camera.fov;
        camera.fov = newFov;
        
        // Calculate how much to move the camera based on FOV change
        // When FOV increases, we need to move closer
        // When FOV decreases, we need to move further away
        const zoomFactor = Math.tan((oldFov * Math.PI) / 360) / Math.tan((newFov * Math.PI) / 360);
        
        // Move the camera forward/backward based on the zoom factor
        camera.position.z *= zoomFactor;
        
        camera.updateProjectionMatrix();
      },
      setTiltEnabled: (enabled: boolean) => {
        tiltEnabled = enabled;
        if (!enabled) {
          // Reset mouse rotation when disabled
          mouseRotationX = 0;
          mouseRotationY = 0;
        }
      }
    };
  } catch (error) {
    if (createdPoster) {
      posterEl?.remove();
    } else if (posterEl) {
      posterEl.style.opacity = '';
      posterEl.style.visibility = '';
      posterEl.style.display = '';
    }
    console.error('Error loading model:', error);
    throw error;
  }
} 