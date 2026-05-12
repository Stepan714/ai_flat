import * as THREE from "three";

function isMaterial(v: unknown): v is THREE.Material {
  return v instanceof THREE.Material;
}

function disposeMaterial(mat: THREE.Material) {
  // Dispose textures if present (map, normalMap, etc.)
  for (const value of Object.values(mat as unknown as Record<string, unknown>)) {
    if (value instanceof THREE.Texture) value.dispose();
  }
  mat.dispose();
}

export function disposeObject3D(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    const geometry = (mesh as unknown as { geometry?: THREE.BufferGeometry })
      .geometry;
    const material = (mesh as unknown as { material?: unknown }).material;

    geometry?.dispose?.();

    if (Array.isArray(material)) {
      for (const m of material) if (isMaterial(m)) disposeMaterial(m);
    } else if (isMaterial(material)) {
      disposeMaterial(material);
    }
  });
}

