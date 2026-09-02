import * as THREE from 'three';
import { loadPreviewBin, mergePreviews, type PreviewBin } from './preview-loader';

export interface SharedUniforms {
  uGlobalAlpha: { value: number };
}

export function createSharedUniforms(): SharedUniforms {
  return { uGlobalAlpha: { value: 0 } };
}

// One global uniform object reused across every mount of TerminalExperience.
// resetSharedUniforms() is called on mount to force value back to 0 so
// cached GLTF materials (which reference this same object) immediately
// see uGlobalAlpha=0 — no flash before the recompile happens.
let _singleton: SharedUniforms | null = null;

export function getSharedUniforms(): SharedUniforms {
  if (!_singleton) _singleton = createSharedUniforms();
  return _singleton;
}

export function resetSharedUniforms(): void {
  if (_singleton) _singleton.uGlobalAlpha.value = 0;
}

/**
 * HoloTwinPreview — V2.4 point cloud loader scene.
 *
 * Renders the GLB's baked point-cloud preview as a recognizable silhouette
 * from the very first frame (no scattered particles). Density grows with
 * download progress, then smoothly fades out as the textured mesh fades in
 * (driven by the SAME sharedUniforms.uGlobalAlpha that the patched mesh
 * materials read from — so the crossfade is perfectly synchronized).
 *
 * Add this to YOUR scene, viewed by YOUR camera. Co-located with the GLB
 * because the points were sampled from it at bake time.
 */
export class HoloTwinPreview {
  geometry: THREE.BufferGeometry | null = null;
  material: THREE.ShaderMaterial | null = null;
  points: THREE.Points | null = null;
  bounds: {
    min: THREE.Vector3;
    max: THREE.Vector3;
    center: THREE.Vector3;
    size: THREE.Vector3;
    radius: number;
  } | null = null;

  private sharedUniforms: SharedUniforms;
  private targetProgress = 0;
  private displayedProgress = 0;

  constructor(sharedUniforms: SharedUniforms) {
    this.sharedUniforms = sharedUniforms;
  }

  /** Fetch + decode + create the Points object. */
  async loadPreview(url: string): Promise<void> {
    const data = await loadPreviewBin(url);
    this.ingest(data);
  }

  /**
   * Fetch + decode several preview.bin parts in parallel, merge them, then
   * create ONE Points object covering the whole scene. Use this for
   * multi-floor units so the silhouette reveals as a single unified model
   * (one material → one uTime / uReveal driving every point in lockstep).
   */
  async loadPreviews(urls: string[]): Promise<void> {
    if (urls.length === 0) return;
    if (urls.length === 1) return this.loadPreview(urls[0]);
    const parts = await Promise.all(urls.map(loadPreviewBin));
    this.ingest(mergePreviews(parts));
  }

  /** Use a pre-parsed PreviewBin (e.g. cached / passed from outside). */
  ingest(data: PreviewBin): void {
    const { geometry, bounds } = data;
    const size = bounds.max.clone().sub(bounds.min);
    const center = bounds.min.clone().add(bounds.max).multiplyScalar(0.5);
    const radius = size.length() * 0.5;

    this.geometry = geometry;
    this.bounds = { min: bounds.min, max: bounds.max, center, size, radius };
    this.material = createPointMaterial(this.sharedUniforms);
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.raycast = () => {};
  }

  addToScene(scene: THREE.Scene): void {
    if (this.points) scene.add(this.points);
  }

  /** Drive the silhouette density (0..1). Smoothed internally per-frame. */
  setProgress(p: number): void {
    this.targetProgress = Math.max(0, Math.min(1, p));
  }

  /** Smoothed display value — feed this to your HUD's % text. */
  getDisplayedProgress(): number {
    return this.displayedProgress;
  }

  /** Call from YOUR render loop with elapsed seconds. */
  update(elapsed: number): void {
    this.displayedProgress += (this.targetProgress - this.displayedProgress) * 0.06;
    if (this.material) {
      this.material.uniforms.uTime.value = elapsed;
      this.material.uniforms.uReveal.value = this.displayedProgress;
    }
  }

  /**
   * Helper: compute a recommended camera distance to frame the cloud
   * (== model bounds, since the points were sampled from the GLB).
   * Use it for `camera.position.copy(center).addScaledVector(dir, dist)`.
   */
  getRecommendedCameraDistance(camera: THREE.PerspectiveCamera, padding = 1.4): number {
    if (!this.bounds) return 10;
    const aspect = camera.aspect;
    const vFov = (camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const fitFov = Math.min(vFov, hFov);
    return (this.bounds.radius / Math.sin(fitFov / 2)) * padding;
  }

  /** Remove from scene and free GPU memory. */
  dispose(): void {
    if (this.points && this.points.parent) this.points.parent.remove(this.points);
    if (this.geometry) this.geometry.dispose();
    if (this.material) this.material.dispose();
    this.points = null;
    this.geometry = null;
    this.material = null;
  }
}

const POINT_COLOR_HEX = 0x0fb7ff;

function createPointMaterial(sharedUniforms: SharedUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime:        { value: 0 },
      uReveal:      { value: 0 },
      uOpacity:     { value: 1 },
      uColor:       { value: new THREE.Color(POINT_COLOR_HEX) },
      uGlobalAlpha: sharedUniforms.uGlobalAlpha,
    },
    vertexShader: /* glsl */ `
      attribute vec3 aNormal;
      uniform float uTime;
      uniform float uReveal;
      varying vec3 vNormal;
      varying float vDensity;
      varying float vHash;

      float hash11(float n) { return fract(sin(n) * 43758.5453); }

      void main() {
        vNormal = aNormal;
        vec3 p = position;

        float delay = hash11(position.z * 7.0 + position.x) * 0.4;
        float k = clamp((uReveal - delay) / max(1.0 - delay, 0.001), 0.0, 1.0);
        k = k * k * (3.0 - 2.0 * k);
        vDensity = k;
        vHash = hash11(position.x * 3.1 + position.z * 1.7);

        p += vec3(
          sin(uTime * 0.7 + p.x * 0.3),
          cos(uTime * 0.5 + p.y * 0.3),
          sin(uTime * 0.6 + p.z * 0.3)
        ) * 0.0025 * vDensity;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;

        // Size grows from 0 → 4.5px as the point becomes revealed
        // (Smart-Loader V2 demo formula — silhouette from frame 1).
        float size = 4.5 * vDensity;
        gl_PointSize = size * (300.0 / max(-mv.z, 0.1));
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uGlobalAlpha;
      varying vec3 vNormal;
      varying float vDensity;
      varying float vHash;

      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float r = length(c);
        if (r > 0.5) discard;
        float disc = smoothstep(0.5, 0.0, r);

        vec3 nt = vNormal * 0.5 + 0.5;
        vec3 col = mix(uColor * 1.4, uColor * nt * 1.8, 0.5);
        col *= 0.8 + vHash * 0.4;

        float pointAlpha = vDensity * (1.0 - uGlobalAlpha);
        float alpha = uOpacity * disc * pointAlpha;
        if (alpha < 0.001) discard;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
}
