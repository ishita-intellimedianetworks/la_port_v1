import type * as THREE from 'three';
import type { SharedUniforms } from './point-cloud-preview';

/**
 * Patch the GLB's PBR materials with the V2.4 dithered-discard reveal.
 *
 * Each pixel of every patched material hashes its world position to pick
 * a unique 0..1 threshold. The pixel is discarded as long as
 * `sharedUniforms.uGlobalAlpha.value < pixelHash`. As the alpha rises
 * 0 → 1 during the crossfade, more pixels pass the test, so the mesh
 * fills in via dithering pattern (like dust accumulating onto the surface).
 *
 * Materials stay OPAQUE the whole time — no transparent queue, no
 * depth-sort issues, no walls "popping in" at the end.
 *
 * Pass either a single Material or any Object3D (will traverse and patch
 * all mesh materials it finds).
 */
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
  // GLB files share material objects across meshes — traverse() would call
  // patchOne multiple times on the same material, stacking onBeforeCompile
  // wrappers and prepending 'varying vec3 vWPos' more than once, which
  // causes a GLSL redeclaration compile error.
  if ((material as any).__holotwinPatched) return;
  (material as any).__holotwinPatched = true;

  material.needsUpdate = true;

  const orig = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (orig) orig(shader, renderer);
    shader.uniforms.uGlobalAlpha = sharedUniforms.uGlobalAlpha;

    // Vertex: inject the varying declaration after #include <common>, which
    // is present in ALL Three.js standard material shaders (MeshBasicMaterial,
    // MeshStandardMaterial, etc.). 'varying vec3 vViewPosition' only exists in
    // MeshStandardMaterial — using that as an anchor breaks non-PBR materials.
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
