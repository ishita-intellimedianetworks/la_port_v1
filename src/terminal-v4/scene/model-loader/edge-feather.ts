import * as THREE from "three";

/**
 * Dollhouse "soft edge" feather — the model's outer rim dissolves into the
 * (black) dollhouse background, like the reference's exterior soft-edge meshes,
 * but done globally on the whole model via a fragment-shader fade (no post-
 * processing). Adapted from ARCHVIZ's `softenEdges`: instead of fading the
 * material's ALPHA (which would force the whole city into the transparent queue
 * and cause depth-sort artifacts), it mixes the colour toward black toward the
 * rim and stays OPAQUE — same look against the black dollhouse backdrop.
 *
 * The footprint is a SQUARE/rectangle, so the falloff is a BOX (max of the X and
 * Z distances to the centre, normalised by the half-extents) — every edge fades
 * evenly, not a circle that would over-fade the corners.
 *
 * `edgeFeather.enabled` is shared into every patched shader's `uEdgeEnabled`
 * uniform and read live each frame, so it can be turned ON in the dollhouse and
 * OFF in first-person with no recompile (a plain value flip).
 */
export const edgeFeather = { enabled: { value: 0 } };

// Where the edge fade begins, as a fraction of the half-extent (0..1).
// 0.62 → fully solid out to 62% of the way to each edge, then fades by the rim.
const EDGE_FADE_START = 0.62;

export function softenModelEdges(
  root: THREE.Object3D,
  center: THREE.Vector3,
  halfX: number,
  halfZ: number,
): void {
  const c = center.clone();
  const half = new THREE.Vector2(halfX || 1, halfZ || 1);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      const m = mat as THREE.Material & {
        __edgeSoftened?: boolean;
        onBeforeCompile?: THREE.Material["onBeforeCompile"];
      };
      // GLBs share materials across meshes — patch each once or the varying gets
      // redeclared (GLSL compile error). Chains onto any existing onBeforeCompile
      // (e.g. the reveal dither patch) rather than overwriting it.
      if (m.__edgeSoftened) continue;
      m.__edgeSoftened = true;
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (shader, renderer) => {
        prev?.call(m, shader, renderer);
        shader.uniforms.uEdgeCenter = { value: c };
        shader.uniforms.uEdgeHalf = { value: half };
        shader.uniforms.uEdgeStart = { value: EDGE_FADE_START };
        shader.uniforms.uEdgeEnabled = edgeFeather.enabled;
        // Own world-position varying (vEdgeWPos) so we don't depend on the reveal
        // patch's vWPos and never redeclare it.
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec3 vEdgeWPos;")
          .replace(
            "#include <project_vertex>",
            "#include <project_vertex>\n  vEdgeWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;",
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying vec3 vEdgeWPos;\nuniform vec3 uEdgeCenter;\nuniform vec2 uEdgeHalf;\nuniform float uEdgeStart;\nuniform float uEdgeEnabled;",
          )
          .replace(
            "#include <dithering_fragment>",
            "#include <dithering_fragment>\n  {\n    vec2 _d = abs(vEdgeWPos.xz - uEdgeCenter.xz) / uEdgeHalf;\n    float _e = max(_d.x, _d.y);\n    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.0), uEdgeEnabled * smoothstep(uEdgeStart, 1.0, _e));\n  }",
          );
      };
      m.needsUpdate = true;
    }
  });
}
