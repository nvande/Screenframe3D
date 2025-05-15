import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DeviceShowcaseOptions, DeviceShowcaseInstance, SpringConfig } from './types';

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
    baseTilt = { x: 0, y: 0 },
    fov = 45,
    tiltEnabled: initialTiltEnabled = true
  } = options;

  let tiltEnabled = initialTiltEnabled;

  console.log('Initializing device showcase with options:', { device, screenshot, spring, baseTilt, fov, tiltEnabled });

  // Check if we should use fallback mode
  if (fallbackCondition()) {
    console.log('Using fallback mode');
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
      setSpringConfig: () => {},
      setBaseTilt: () => {},
      setFOV: () => {},
      setTiltEnabled: () => {}
    };
  }

  // Initialize Three.js scene
  console.log('Initializing Three.js scene');
  const scene = new THREE.Scene();
  
  // Load device model first to get its aspect ratio
  console.log('Loading device model:', device);
  const loader = new GLTFLoader();
  const modelPath = `/public/models/${device}.glb`;
  console.log('Model path:', modelPath);
  
  try {
    const model = await loader.loadAsync(modelPath);
    console.log('Model loaded successfully:', model);
    
    // Calculate model aspect ratio
    const box = new THREE.Box3().setFromObject(model.scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const modelAspect = size.x / size.y;
    
    // Initialize camera with model's aspect ratio
    const camera = new THREE.PerspectiveCamera(
      fov,
      modelAspect,
      0.1,
      1000
    );
    
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    
    // Function to calculate optimal scale and position
    const calculateOptimalFit = () => {
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      const containerAspect = containerWidth / containerHeight;
      
      // Calculate scale to fit the container while maintaining aspect ratio
      const scale = containerAspect > modelAspect
        ? containerHeight / size.y * 0.15
        : containerWidth / size.x * 0.15;
      
      // Calculate the model size after scaling
      const modelSize = Math.max(size.x, size.y) * scale;
      
      // Reference FOV (45 degrees) - this gives us a good base size
      const refFov = 45;
      const refFovRad = (refFov * Math.PI) / 180;
      const currentFovRad = (fov * Math.PI) / 180;
      
      // Calculate base distance at reference FOV
      const baseDistance = (modelSize / 2) / Math.tan(refFovRad / 2) * 4; // Multiply by 4 to start further back
      
      // For dolly zoom, we need to move the camera in proportion to the FOV change
      // When FOV increases, we need to move closer to maintain size
      // Using a stronger power relationship for more dramatic movement
      const distance = baseDistance * Math.pow(refFov / fov, 2.5) * 0.5;
      
      return { scale, distance };
    };
    
    const { scale, distance } = calculateOptimalFit();
    
    // Apply scale and position
    model.scene.scale.set(scale, scale, scale);
    model.scene.position.sub(center.multiplyScalar(scale));
    
    // Position camera
    camera.position.z = distance;
    camera.position.y = 0;
    camera.lookAt(0, 0, 0);
    
    // Update camera aspect ratio to match container
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);
    
    scene.add(model.scene);

    // Load screenshot texture
    console.log('Loading screenshot texture:', screenshot);
    const textureLoader = new THREE.TextureLoader();
    const screenshotTexture = await textureLoader.loadAsync(screenshot);
    console.log('Screenshot texture loaded');
    
    // Find screen mesh and apply texture
    let screenFound = false;
    model.scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.name === 'screen') {
        console.log('Found screen mesh:', child);
        screenFound = true;
        child.material = new THREE.MeshBasicMaterial({
          map: screenshotTexture,
        });
      }
    });

    if (!screenFound) {
      console.warn('No screen mesh found in the model. Make sure the model has a mesh named "screen"');
    }

    // Add some light to the scene
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Animation loop
    let animationFrameId: number;
    // Set base tilt
    let rotX = baseTilt.x || 0;
    let rotY = baseTilt.y || 0;
    let mouseRotationX = 0;
    let mouseRotationY = 0;
    let currentRotationX = rotX;
    let currentRotationY = rotY;
    let velocityX = 0;
    let velocityY = 0;

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

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      
      // Calculate target rotation by adding mouse movement to base tilt
      const targetRotationX = rotX + mouseRotationX;
      const targetRotationY = rotY + mouseRotationY;
      
      if (spring.enabled) {
        // Calculate spring forces
        const forceX = (targetRotationX - currentRotationX) * springStrength;
        const forceY = (targetRotationY - currentRotationY) * springStrength;
        
        // Update velocities with forces (F = ma)
        velocityX += forceX / mass;
        velocityY += forceY / mass;
        
        // Apply damping
        velocityX *= damping;
        velocityY *= damping;
        
        // Update positions
        currentRotationX += velocityX;
        currentRotationY += velocityY;
      } else {
        // Direct interpolation when spring is disabled
        currentRotationX += (targetRotationX - currentRotationX) * 0.1;
        currentRotationY += (targetRotationY - currentRotationY) * 0.1;
      }
      
      // Apply rotations
      model.scene.rotation.x = currentRotationX;
      model.scene.rotation.y = currentRotationY;
      
      renderer.render(scene, camera);
    };
    animate();

    // Handle scroll tilt
    let scrollHandler: (() => void) | undefined;
    if (scrollTilt) {
      scrollHandler = () => {
        const scrollY = window.scrollY;
        const rotation = scrollY * 0.0005;
        model.scene.rotation.y = rotation + currentRotationY;
      };
      window.addEventListener('scroll', scrollHandler);
    }

    return {
      destroy: () => {
        cancelAnimationFrame(animationFrameId);
        if (scrollHandler) {
          window.removeEventListener('scroll', scrollHandler);
        }
        window.removeEventListener('mousemove', handleMouseMove);
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
            model.scene.rotation.y = rotation + currentRotationY;
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
      setBaseTilt: (tilt: { x?: number; y?: number }) => {
        if (tilt.x !== undefined) {
          rotX = tilt.x;
        }
        if (tilt.y !== undefined) {
          rotY = tilt.y;
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
    console.error('Error loading model:', error);
    throw error;
  }
} 