import type * as THREE from 'three';
import type { SharedUniforms } from './point-cloud-preview';

export function patchMeshForReveal(
  modelOrMaterial: THREE.Object3D | THREE.Material,
  sharedUniforms: SharedUniforms
): void {
  if ((modelOrMaterial as THREE.Material).isMaterial) {
    patchOne(modelOrMaterial as THREE.Material, sharedUniforms);
  } else {
    (modelOrMaterial as THREE.Object3D).traverse((o: any) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) patchOne(m, sharedUniforms);
    });
  }
}

function patchOne(material: THREE.Material, sharedUniforms: SharedUniforms): void {
  if ((material as any).__holotwinPatched) return;
  (material as any).__holotwinPatched = true;

  material.needsUpdate = true;

  const orig = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (orig) orig(shader, renderer);
    shader.uniforms.uGlobalAlpha = sharedUniforms.uGlobalAlpha;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWPos;'
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
         vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );

    // Fragment: inject the varying + uniform after #include <common>
    // (always the first pars include), then discard before dithering.
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vWPos;
         uniform float uGlobalAlpha;`
      )
      .replace(
        '#include <dithering_fragment>',
        `float pixelHash = fract(sin(dot(vWPos, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
         if (uGlobalAlpha < pixelHash) discard;
         #include <dithering_fragment>`
      );
  };
}
