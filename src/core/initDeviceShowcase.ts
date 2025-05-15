import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DeviceShowcaseOptions, DeviceShowcaseInstance } from './types';

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
  } = options;

  // Check if we should use fallback mode
  if (fallbackCondition()) {
    const img = document.createElement('img');
    img.src = fallbackImage || screenshot;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    container.appendChild(img);

    return {
      destroy: () => {
        container.removeChild(img);
      },
      updateScreenshot: (url: string) => {
        img.src = url;
      },
      setScrollTilt: () => {},
    };
  }

  // Initialize Three.js scene
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    75,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  // Load device model
  const loader = new GLTFLoader();
  const model = await loader.loadAsync(`/models/${device}.glb`);
  scene.add(model.scene);

  // Load screenshot texture
  const textureLoader = new THREE.TextureLoader();
  const screenshotTexture = await textureLoader.loadAsync(screenshot);
  
  // Find screen mesh and apply texture
  model.scene.traverse((child) => {
    if (child instanceof THREE.Mesh && child.name === 'screen') {
      child.material = new THREE.MeshBasicMaterial({
        map: screenshotTexture,
      });
    }
  });

  // Position camera
  camera.position.z = 5;

  // Animation loop
  let animationFrameId: number;
  const animate = () => {
    animationFrameId = requestAnimationFrame(animate);
    renderer.render(scene, camera);
  };
  animate();

  // Handle scroll tilt
  let scrollHandler: (() => void) | undefined;
  if (scrollTilt) {
    scrollHandler = () => {
      const scrollY = window.scrollY;
      const rotation = scrollY * 0.0005;
      model.scene.rotation.y = rotation;
    };
    window.addEventListener('scroll', scrollHandler);
  }

  // Handle resize
  const resizeHandler = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };
  window.addEventListener('resize', resizeHandler);

  return {
    destroy: () => {
      cancelAnimationFrame(animationFrameId);
      if (scrollHandler) {
        window.removeEventListener('scroll', scrollHandler);
      }
      window.removeEventListener('resize', resizeHandler);
      container.removeChild(renderer.domElement);
      renderer.dispose();
    },
    updateScreenshot: async (url: string) => {
      const newTexture = await textureLoader.loadAsync(url);
      model.scene.traverse((child) => {
        if (child instanceof THREE.Mesh && child.name === 'screen') {
          child.material.map = newTexture;
          child.material.needsUpdate = true;
        }
      });
    },
    setScrollTilt: (enabled: boolean) => {
      if (scrollHandler) {
        window.removeEventListener('scroll', scrollHandler);
      }
      if (enabled) {
        scrollHandler = () => {
          const scrollY = window.scrollY;
          const rotation = scrollY * 0.0005;
          model.scene.rotation.y = rotation;
        };
        window.addEventListener('scroll', scrollHandler);
      }
    },
  };
} 