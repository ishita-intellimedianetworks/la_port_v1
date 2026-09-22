import * as THREE from "three";

export const edgeFeather = { enabled: { value: 0 } };

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
      if (m.__edgeSoftened) continue;
      m.__edgeSoftened = true;
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (shader, renderer) => {
        prev?.call(m, shader, renderer);
        shader.uniforms.uEdgeCenter = { value: c };
        shader.uniforms.uEdgeHalf = { value: half };
        shader.uniforms.uEdgeStart = { value: EDGE_FADE_START };
        shader.uniforms.uEdgeEnabled = edgeFeather.enabled;
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
