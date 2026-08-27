"use client";

/**
 * Top-down orthographic renderer for the map plan.
 *
 * The output PNG's pixel <-> world mapping is fixed by the camera, so it drops
 * straight into the runtime minimap:
 *
 *   pixel (0, 0)   <->   world (bbox.minX, bbox.maxZ)
 *   pixel (W, H)   <->   world (bbox.maxX, bbox.minZ)
 *
 * North-up, east-right. Z is inverted because the image's first row is its top;
 * X is not, because `unmirror()` below undoes the east-west flip a `cam.up = +Z`
 * top-down view produces. Render here, paste the bounds into
 * `site.json > map.plan`, and world->pixel is exact with no calibration.
 *
 * The bbox is supplied by the CALLER, so a render is never silently tied to one
 * source: whatever rect you frame to is the rect you author beside the image.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

export type RenderMode = "native" | "silhouette";

export interface WorldBbox {
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
}

export interface Bbox extends WorldBbox {
  dx: number; dy: number; dz: number;
  cx: number; cz: number;
  /** dx / dz — the PNG must carry this aspect or overlays drift. */
  aspect: number;
}

export function derive(b: WorldBbox): Bbox {
  return {
    ...b,
    dx: b.maxX - b.minX,
    dy: b.maxY - b.minY,
    dz: b.maxZ - b.minZ,
    cx: (b.minX + b.maxX) / 2,
    cz: (b.minZ + b.maxZ) / 2,
    aspect: (b.maxX - b.minX) / (b.maxZ - b.minZ),
  };
}

// ── Loading ──────────────────────────────────────────────────────────────────

// Decoder path matches chunk-manager so the browser reuses the cached WASM.
let _draco: DRACOLoader | null = null;
function dracoLoader(): DRACOLoader {
  if (!_draco) {
    _draco = new DRACOLoader();
    _draco.setDecoderPath("/draco/");
  }
  return _draco;
}

/** `src` is a File (upload) or a URL string (the in-project model). */
export async function loadGlb(src: File | string): Promise<THREE.Object3D> {
  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader());
  const url = typeof src === "string" ? src : URL.createObjectURL(src);
  try {
    const gltf = await loader.loadAsync(url);
    gltf.scene.updateMatrixWorld(true);
    return gltf.scene;
  } finally {
    if (typeof src !== "string") URL.revokeObjectURL(url);
  }
}

/** The GLB's own extents. */
export function measureBbox(scene: THREE.Object3D): WorldBbox {
  const b = new THREE.Box3().setFromObject(scene);
  return {
    minX: b.min.x, maxX: b.max.x,
    minY: b.min.y, maxY: b.max.y,
    minZ: b.min.z, maxZ: b.max.z,
  };
}

// ── Sizing ───────────────────────────────────────────────────────────────────

/** Both dims come from the bbox, so image aspect == world aspect. */
export function pixelDimsFor(bbox: Bbox, ppm: number): { w: number; h: number } {
  return {
    w: Math.max(2, Math.round((bbox.dx * ppm) / 2) * 2),
    h: Math.max(2, Math.round((bbox.dz * ppm) / 2) * 2),
  };
}

let _maxTex = 0;
/** GPU limit. A render past this silently produces a blank or clamped image. */
export function maxTextureSize(): number {
  if (_maxTex) return _maxTex;
  try {
    const cv = document.createElement("canvas");
    const gl = (cv.getContext("webgl2") ?? cv.getContext("webgl")) as WebGLRenderingContext | null;
    _maxTex = gl ? (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) : 4096;
  } catch {
    _maxTex = 4096;
  }
  return _maxTex;
}

// ── Render ───────────────────────────────────────────────────────────────────

// One renderer for the session: context release is GC-driven, so allocating per
// render exhausts the browser's WebGL contexts and render() silently no-ops.
let _renderer: THREE.WebGLRenderer | null = null;
function getRenderer(): THREE.WebGLRenderer {
  if (_renderer) return _renderer;
  _renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  _renderer.setPixelRatio(1);
  _renderer.outputColorSpace = THREE.SRGBColorSpace;
  _renderer.toneMapping = THREE.ACESFilmicToneMapping;
  _renderer.toneMappingExposure = 1.0;
  return _renderer;
}

export interface RenderResult {
  /** Object URL for the PNG. Revoke when replacing. */
  url: string;
  bytes: number;
  w: number;
  h: number;
}

export async function renderTopDown(
  scene: THREE.Object3D,
  bbox: Bbox,
  pixelW: number,
  pixelH: number,
  mode: RenderMode,
  opaqueBg: string | null,
): Promise<RenderResult> {
  const renderer = getRenderer();
  renderer.setSize(pixelW, pixelH, false);

  const rs = new THREE.Scene();
  if (opaqueBg) {
    rs.background = new THREE.Color(opaqueBg);
    renderer.setClearColor(opaqueBg, 1);
  } else {
    renderer.setClearColor(0x000000, 0);
  }

  let teardown = () => {};
  if (mode === "silhouette") {
    const built = buildSilhouette(scene);
    teardown = built.dispose;
    rs.add(built.root);
  } else {
    rs.add(scene);
    addLighting(rs, bbox);
  }

  // up = +Z looking down puts pixel(0,0) at (maxX, maxZ). See the file header.
  const cam = new THREE.OrthographicCamera(
    -bbox.dx / 2, bbox.dx / 2,
     bbox.dz / 2, -bbox.dz / 2,
    0.01, Math.max(bbox.dy + 1000, 1000),
  );
  cam.position.set(bbox.cx, bbox.maxY + 100, bbox.cz);
  cam.up.set(0, 0, 1);
  cam.lookAt(bbox.cx, bbox.minY, bbox.cz);

  renderer.render(rs, cam);

  // toBlob, not toDataURL: at 4k the base64 string blocks the main thread.
  const blob = await new Promise<Blob | null>((res) =>
    unmirror(renderer.domElement).toBlob(res, "image/png"),
  );

  if (mode !== "silhouette") rs.remove(scene);
  teardown();

  if (!blob) throw new Error("toBlob returned null (render likely exceeded GPU limits)");
  return { url: URL.createObjectURL(blob), bytes: blob.size, w: pixelW, h: pixelH };
}

/**
 * Flips the render east-west so the PNG reads as a map.
 *
 * A camera looking down -Y with up = +Z has screen-right = -X: in a Y-up world
 * where +Z is north, a top-down view puts EAST ON THE LEFT. Undoing it here,
 * rather than by handing the runtime a bounds rect with minX > maxX, keeps
 * `map.plan.bounds` plain-X like `map.site.bounds` and keeps the minimap off
 * negative-width drawImage.
 */
function unmirror(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d");
  if (!ctx) return src;
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return out;
}

function addLighting(scene: THREE.Scene, bbox: Bbox): void {
  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x202028, 0.85));
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));

  const h = Math.max(bbox.dy * 2, Math.max(bbox.dx, bbox.dz) * 0.8);

  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(bbox.cx + bbox.dx * 0.6, bbox.maxY + h, bbox.cz + bbox.dz * 0.4);
  key.target.position.set(bbox.cx, bbox.minY, bbox.cz);
  scene.add(key.target, key);

  const fill = new THREE.DirectionalLight(0xcfd8ff, 0.5);
  fill.position.set(bbox.cx - bbox.dx * 0.6, bbox.maxY + h * 0.6, bbox.cz - bbox.dz * 0.4);
  fill.target.position.set(bbox.cx, bbox.minY, bbox.cz);
  scene.add(fill.target, fill);
}

// Reads as a schematic whatever the source materials do. Geometries are shared;
// only the materials and EdgesGeometry are ours to dispose.
function buildSilhouette(src: THREE.Object3D): { root: THREE.Object3D; dispose: () => void } {
  src.updateWorldMatrix(true, true);
  const root = new THREE.Group();
  const fillMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x111111 });
  const owned: THREE.BufferGeometry[] = [];

  src.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    const fill = new THREE.Mesh(m.geometry, fillMat);
    fill.matrixAutoUpdate = false;
    fill.matrix.copy(m.matrixWorld);
    root.add(fill);
    const edges = new THREE.EdgesGeometry(m.geometry, 20);
    owned.push(edges);
    const lines = new THREE.LineSegments(edges, edgeMat);
    lines.matrixAutoUpdate = false;
    lines.matrix.copy(m.matrixWorld);
    root.add(lines);
  });

  return {
    root,
    dispose: () => {
      fillMat.dispose();
      edgeMat.dispose();
      for (const g of owned) g.dispose();
    },
  };
}
