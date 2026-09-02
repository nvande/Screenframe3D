import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';

export { DEFAULT_ENVIRONMENT_URL } from './constants';

export async function applyEnvironmentMap(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  url: string,
  root?: THREE.Object3D
): Promise<{ dispose: () => void }> {
  const hdr = await new RGBELoader().loadAsync(url);
  hdr.mapping = THREE.EquirectangularReflectionMapping;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromEquirectangular(hdr).texture;
  scene.environment = envMap;
  scene.environmentRotation.set(0, Math.PI / 3, 0);
  pmrem.dispose();
  hdr.dispose();

  if (root) {
    applyEnvMapToMaterials(root, envMap, 1.8);
  }

  return {
    dispose() {
      scene.environment = null;
      envMap.dispose();
    },
  };
}

export function prepareRendererForIBL(renderer: THREE.WebGLRenderer): void {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
}

function applyEnvMapToMaterials(
  root: THREE.Object3D,
  envMap: THREE.Texture,
  intensity: number
): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      const standard = material as THREE.MeshStandardMaterial;
      if (!standard.isMeshStandardMaterial) continue;
      standard.envMap = envMap;
      standard.envMapIntensity = intensity;
      standard.needsUpdate = true;
    }
  });
}
