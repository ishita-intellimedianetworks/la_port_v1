"use client";

/**
 * NavPath3D
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders the active navigation route INSIDE the 3D model — the same route the
 * 2D minimap draws:
 *
 *   • a thin blue route line (bright-blue core + darker-blue casing edge),
 *     the SAME blue as the 2D minimap line
 *   • a small real 3D pin (sphere head + cone tip) that floats just above the
 *     destination with a gentle bob, plus a small ground ring marking the spot
 *
 * It reads the live path straight from the PlayerController handle each frame
 * (getFootPosition + getPath3D), so the route shrinks as the player walks and
 * disappears the instant navigation ends — no React state, no re-renders.
 *
 * SIZING — real-world metres, NOT model bounds.
 * The whole-model bounding radius is huge (the village/stadium), while the
 * walkable area is a tiny part of it, so radius-scaled visuals came out far too
 * big. Instead everything is sized in metres via getMetersPerUnit (1 metre =
 * 1/mpu world units) so the line/pin/ring stay human-scale in any model.
 *
 * DEPTH: the ribbon, ring and the pin's solid pass are depth-tested so they
 * sit AT their place in the world (occluded by geometry in front — crucial on
 * multi-level venues where always-on-top markers show through whole floors).
 * A faint depthTest-off ghost of the pin remains as the through-walls locator.
 *
 * Per-frame mutation lives in `paintNavFrame` — a plain (non-hook) function, so
 * its parameters are exempt from react-hooks/immutability (same pattern as
 * useWalkFrame's runWalkFrame).
 */

import { useMemo, useRef } from "react";
import type { RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import type { PlayerControllerHandle } from "../player/types";
import { navConfig } from "../../navigation-config";
import { useNavUiStore } from "../../stores/nav-ui-store";

// Max polyline vertices the pre-allocated ribbon buffer supports. Three-
// pathfinding routes are sparse (one vertex per corner) so this is plenty.
const MAX_POINTS = 256;

// Scratch for the floor raycast (route points → visible-ground Y). Reused so
// the per-frame ground sampling doesn't allocate.
const _ray = new THREE.Raycaster();
const _down = new THREE.Vector3(0, -1, 0);
const _origin = new THREE.Vector3();

/** Cache of resolved ground Ys for the path's fixed waypoints, keyed by the
 *  waypoint's XZ POSITION (not by a whole-path signature): getPath3D() returns
 *  only the REMAINING waypoints, so a signature key changed at every corner
 *  (pathI advance) and re-raycast the entire rest of the route in one frame —
 *  a multi-second hang at every turn on big models. Positional keys survive
 *  route shrinking (and repeat visits to the same corridor) untouched.
 *  The foot point (index 0) moves every frame, so its ground-Y is cached too and
 *  only re-probed once the player has moved past FOOT_REPROBE_DIST — raycasting
 *  the whole scene 60×/s for the foot is the main walk-jank source on big models. */
interface FloorCache { ys: Map<string, number>; footX?: number; footZ?: number; footY?: number; }

/** Max UNCACHED waypoint ground-probes resolved per frame. A fresh route warms
 *  its cache over a few frames (unresolved points draw at the navmesh Y until
 *  their raycast lands) instead of bursting N whole-scene raycasts in one frame.
 *  12 (not 6): the densified polyline has ~2.5× the points of the raw route,
 *  and the model's BVH makes each ray cheap. */
const MAX_GROUND_PROBES_PER_FRAME = 12;

/** Positional cache key, quantised to 0.25 world units. Coarser than the old
 *  cm key on purpose: the densified polyline (see the resample block in
 *  paintNavFrame) includes samples derived from the MOVING foot segment — a
 *  cm-precision key would mint a new cache entry every frame for those, churn
 *  the probe budget and flood the Map. Ground height barely changes over
 *  25 cm, so nearby samples sharing an entry is fine. */
const yKey = (x: number, z: number) => `${Math.round(x * 4)},${Math.round(z * 4)}`;

/** Densified polyline scratch (module-level — single NavPath3D instance). */
const _px = new Float32Array(MAX_POINTS);
const _py = new Float32Array(MAX_POINTS);
const _pz = new Float32Array(MAX_POINTS);

/** Resample spacing along the route, in metres. String-pulled waypoints can be
 *  15–30 m apart on the stadium; a single straight chord between two such
 *  points FLIES over ramps/stairs (the surface curves, the chord doesn't).
 *  A ground-probed sample every few metres makes the ribbon hug the floor. */
const SUBDIV_M = 3;

// How far (world units) the foot must move before the per-frame ground raycast
// is run again. Between probes the last ground-Y is reused.
const FOOT_REPROBE_DIST = 0.4;

/** How far (world units, ≈ metres) a visible-surface hit may sit from the
 *  route's own navmesh Y and still be used. The navmesh Y is AUTHORITATIVE —
 *  it's the height the walk itself follows (and what the debug route line
 *  draws) — the raycast only fine-snaps the ribbon onto the rendered surface
 *  (navmesh authored a touch above/below the visible floor, welded-seam
 *  inflation). A wide window let the ribbon fall through gaps in the visible
 *  floor (escalator voids, railing slots) onto the storey BELOW — the blue
 *  path diverging from the debug line it should match. */
const GROUND_SNAP_BAND = 2.5;

/**
 * Fine-snap (x, z) onto the visible model near the route's own Y. Returns the
 * visible-surface hit CLOSEST to fallbackY within ±GROUND_SNAP_BAND; when no
 * surface is that close (hole in the mesh, overhang-only hits, off-model), the
 * navmesh Y wins — the ribbon then draws exactly where the walk goes. The
 * navmesh itself is invisible (skipped) and the route/pin meshes have raycast
 * disabled, so hits are real rendered ground.
 */
function groundYAt(scene: THREE.Scene, x: number, z: number, fallbackY: number): number {
  _origin.set(x, fallbackY + 200, z);
  _ray.set(_origin, _down);
  _ray.far = 600;
  const hits = _ray.intersectObjects(scene.children, true);
  let bestY: number | null = null;
  let bestDist = GROUND_SNAP_BAND;
  for (const h of hits) {
    let o: THREE.Object3D | null = h.object;
    let visible = true;
    while (o) { if (o.visible === false) { visible = false; break; } o = o.parent; }
    if (!visible) continue;
    const d = Math.abs(h.point.y - fallbackY);
    if (d < bestDist) { bestDist = d; bestY = h.point.y; }
  }
  return bestY !== null ? bestY : fallbackY;
}

// Real-world sizes (metres) — all tunable in nav-config.ts. Converted to world
// units at runtime via mpu.
const { lineWidthM: M_LINE_W, liftM: M_LIFT, pinHeadM: M_PIN, pinFloatM: M_FLOAT, pinBobM: M_BOB, ringOuterM: M_RING } = navConfig.scene3d;

/** "#rrggbb" → "r, g, b" for composing rgba() gradient stops. */
function hexRgb(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

// ── In-scene turn arrow (AR car-HUD style) ──────────────────────────────────
// A single floating arrow placed at the NEXT bend in the route, pointing the way
// you'll head after the turn — like a heads-up nav arrow over the road. Sized in
// metres (scaled by W at runtime).
const TURN_ARROW_SIZE_M = 1.7;
const TURN_ARROW_LIFT_M = 1.9;  // floats well above the road (visible from afar)
// const TURN_ARROW_COLOR = "#8fd0ff"; // used by the (currently disabled) arrow mesh
const TURN_MIN_DEG = navConfig.logic.turnMinDeg; // bend sharper than this = a turn
const RIGHT_IS_POSITIVE_CROSS = navConfig.logic.rightIsPositiveCross;
// In-plane tilt of the floating arrow toward the turn side (↖ / ↗).
const TURN_ARROW_TILT = 0.55;

/** A sleek slim arrow (head + thin shaft) pointing +Y, ~1 unit tall (scaled by
 *  W per frame). */
function buildArrowGeom(): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 1.05);     // tip
  s.lineTo(0.4, 0.5);    // head right (slim)
  s.lineTo(0.14, 0.5);
  s.lineTo(0.14, 0);     // thin shaft
  s.lineTo(-0.14, 0);
  s.lineTo(-0.14, 0.5);
  s.lineTo(-0.4, 0.5);   // head left
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

interface NavSetup {
  geom: THREE.BufferGeometry;
  routeTex: THREE.Texture;
  routeMat: THREE.MeshBasicMaterial;
  arrowGeom: THREE.ShapeGeometry;
}

/** Cross-width gradient: solid blue band (bright core + darker casing edges)
 *  with soft anti-aliased margins — the SAME blue as the 2D minimap route. */
function makeRouteTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  const core = hexRgb(navConfig.color.routeCore);
  const casing = hexRgb(navConfig.color.routeCasing);
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0.0, `rgba(${core}, 0)`);
  g.addColorStop(0.12, `rgba(${core}, 0)`);
  g.addColorStop(0.2, `rgba(${casing}, 0.95)`); // casing edge
  g.addColorStop(0.34, `rgba(${core}, 1)`); // bright core
  g.addColorStop(0.66, `rgba(${core}, 1)`);
  g.addColorStop(0.8, `rgba(${casing}, 0.95)`);
  g.addColorStop(0.88, `rgba(${core}, 0)`);
  g.addColorStop(1.0, `rgba(${core}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 64);
  const t = new THREE.Texture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

/** Build the route geometry + material once (lazy, client-only). */
function buildSetup(): NavSetup {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 2 * 3), 3));
  geom.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 2 * 2), 2));
  const idx: number[] = [];
  for (let i = 0; i < MAX_POINTS - 1; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
    idx.push(a, b, c, c, b, d);
  }
  geom.setIndex(idx);
  geom.setDrawRange(0, 0);

  const routeTex = makeRouteTexture();
  const routeMat = new THREE.MeshBasicMaterial({
    map: routeTex,
    transparent: true,
    depthWrite: false,
    // Depth-tested so the route is occluded by buildings and reads as lying on
    // the ground (no see-through "swimming"). Safe now because the ribbon Y is
    // raycast onto the VISIBLE floor (groundYAt), not the sunken navmesh — so it
    // sits on the surface instead of being buried. polygonOffset wins the z-test
    // against the floor it rests on.
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  return { geom, routeTex, routeMat, arrowGeom: buildArrowGeom() };
}

interface FrameOpts {
  ctrl: PlayerControllerHandle | null;
  setup: NavSetup;
  ribbon: THREE.Mesh | null;
  pin: THREE.Group | null;
  ring: THREE.Mesh | null;
  /** Floating, camera-facing turn arrow placed at the next bend. */
  turnArrow: THREE.Group | null;
  camera: THREE.Camera;
  scene: THREE.Scene;
  floorCache: FloorCache;
}

// Plain function — parameters exempt from react-hooks/immutability. All the
// per-frame buffer mutation happens here.
function paintNavFrame(o: FrameOpts, elapsed: number): void {
  const { ctrl, setup, ribbon, pin, ring, turnArrow, camera, scene, floorCache } = o;
  if (!ctrl || !ribbon) return;

  // While walking, show the live shrinking route — but ONLY for walks started
  // by choosing a destination (navHud, set by the destination sheet / transport
  // / minimap-destination flows). Manual walks (3D double-click, plain minimap
  // clicks) set navHud false and get no 3D route/pin. When idle, show a preview
  // route if one has been set (destination card tap → preview, before
  // "Directions") — that's also destination-driven by construction.
  const destDriven = useNavUiStore.getState().navHud;
  const pts = ctrl.isMoving()
    ? (destDriven ? ctrl.getPath3D() : [])
    : (ctrl.getPreviewPath3D?.() ?? []);
  if (pts.length === 0) {
    ribbon.visible = false;
    if (pin) pin.visible = false;
    if (ring) ring.visible = false;
    if (turnArrow) turnArrow.visible = false;
    return;
  }

  // World units per metre (human-scale sizing, independent of model bounds).
  const mpu = ctrl.getMetersPerUnit() || 0.5;
  const W = 1 / mpu; // 1 metre in world units
  const width = M_LINE_W * W;
  const lift = M_LIFT * W;

  // Full polyline = player feet → remaining waypoints, DENSIFIED into the
  // module scratch arrays: a sample every ~SUBDIV_M metres (adaptive so it
  // always fits MAX_POINTS), each dropped onto the visible floor below. The
  // foot→first-waypoint samples are anchored FROM THE WAYPOINT END — the foot
  // moves every frame but the waypoint doesn't, so those sample positions stay
  // (nearly) fixed in world space and keep hitting the same cache entries.
  const foot = ctrl.getFootPosition();
  let n = 0;
  {
    let total = Math.hypot(pts[0].x - foot.x, pts[0].z - foot.z);
    for (let i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    }
    const step = Math.max(SUBDIV_M * W, total / Math.max(1, MAX_POINTS - pts.length - 4));
    _px[n] = foot.x; _py[n] = foot.y; _pz[n] = foot.z; n++;
    let cx = foot.x, cy = foot.y, cz = foot.z;
    for (let i = 0; i < pts.length && n < MAX_POINTS - 1; i++) {
      const w = pts[i];
      const segL = Math.hypot(w.x - cx, w.z - cz);
      if (i === 0) {
        // Anchor from the fixed waypoint back toward the (moving) foot:
        // sample at whole multiples of `step` measured from the WAYPOINT, in
        // foot→waypoint order (largest distance first).
        for (let d = Math.floor((segL - 1e-6) / step) * step; d >= step - 1e-9 && n < MAX_POINTS - 1; d -= step) {
          const t = 1 - d / segL;
          _px[n] = cx + (w.x - cx) * t; _py[n] = cy + (w.y - cy) * t; _pz[n] = cz + (w.z - cz) * t; n++;
        }
      } else {
        const kSteps = Math.floor(segL / step);
        for (let k = 1; k <= kSteps && n < MAX_POINTS - 1; k++) {
          const t = k / (kSteps + 1);
          _px[n] = cx + (w.x - cx) * t; _py[n] = cy + (w.y - cy) * t; _pz[n] = cz + (w.z - cz) * t; n++;
        }
      }
      _px[n] = w.x; _py[n] = w.y; _pz[n] = w.z; n++;
      cx = w.x; cy = w.y; cz = w.z;
    }
  }

  // Resolve each point's Y onto the VISIBLE floor (not the sunken navmesh).
  // Waypoints are fixed world points → cached by POSITION so the cache survives
  // the route shrinking as waypoints are passed; the foot (index 0) moves every
  // frame so it's throttled by distance instead. Uncached waypoints resolve at
  // most MAX_GROUND_PROBES_PER_FRAME per frame — beyond the budget they draw at
  // the navmesh Y for a frame or two until their raycast lands.
  let probesLeft = MAX_GROUND_PROBES_PER_FRAME;
  if (floorCache.ys.size > 4096) floorCache.ys.clear(); // unbounded-session guard
  const resolveY = (i: number, x: number, fallbackY: number, z: number) => {
    if (i === 0) {
      // Foot moves every frame — only re-raycast the scene once it has travelled
      // past the threshold, otherwise reuse the cached ground-Y (huge per-frame
      // saving while walking, especially with a large model in the scene).
      const fc = floorCache;
      if (fc.footX === undefined || fc.footY === undefined ||
          Math.hypot(x - fc.footX, z - fc.footZ!) > FOOT_REPROBE_DIST) {
        fc.footY = groundYAt(scene, x, z, fallbackY);
        fc.footX = x;
        fc.footZ = z;
      }
      return fc.footY;
    }
    const k = yKey(x, z);
    const cached = floorCache.ys.get(k);
    if (cached !== undefined) return cached;
    if (probesLeft <= 0) return fallbackY; // budget spent — navmesh Y until resolved
    probesLeft--;
    const gy = groundYAt(scene, x, z, fallbackY);
    floorCache.ys.set(k, gy);
    return gy;
  };

  const pos = setup.geom.attributes.position.array as Float32Array;
  const uv = setup.geom.attributes.uv.array as Float32Array;
  const half = width / 2;

  for (let i = 0; i < n; i++) {
    const ip = i > 0 ? i - 1 : 0;
    const inx = i < n - 1 ? i + 1 : n - 1;
    let dx = _px[inx] - _px[ip];
    let dz = _pz[inx] - _pz[ip];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    // Perpendicular in the XZ ground plane.
    const nx = -dz;
    const nz = dx;
    const y = resolveY(i, _px[i], _py[i], _pz[i]) + lift;
    const off = i * 6;
    pos[off] = _px[i] + nx * half;
    pos[off + 1] = y;
    pos[off + 2] = _pz[i] + nz * half;
    pos[off + 3] = _px[i] - nx * half;
    pos[off + 4] = y;
    pos[off + 5] = _pz[i] - nz * half;
    // V spans the width 0→1 so the route gradient renders across the line.
    const uo = i * 4;
    uv[uo] = 0;
    uv[uo + 1] = 0;
    uv[uo + 2] = 0;
    uv[uo + 3] = 1;
  }

  setup.geom.attributes.position.needsUpdate = true;
  setup.geom.attributes.uv.needsUpdate = true;
  setup.geom.setDrawRange(0, (n - 1) * 6);
  ribbon.visible = true;

  // Destination: small ring on the spot + a small pin floating just above it.
  const li = n - 1;
  const groundY = resolveY(li, _px[li], _py[li], _pz[li]) + lift;
  if (ring) {
    ring.visible = true;
    ring.position.set(_px[li], groundY, _pz[li]);
    ring.scale.setScalar(M_RING * W);
  }
  if (pin) {
    pin.visible = true;
    const bob = (Math.sin(elapsed * 2) * 0.5 + 0.5) * M_BOB * W;
    pin.position.set(_px[li], groundY + M_FLOAT * W + bob, _pz[li]);
    pin.scale.setScalar(M_PIN * W);
  }

  // ── Floating turn arrow at the NEXT bend (AR car-HUD style) ───────────────
  // A camera-facing arrow hovers above the next turn, tilted toward the turn
  // side (↖ / ↗) — sleek, always-on-top, readable from a distance. Densified
  // in-segment samples are collinear (bend angle ≈ 0) so the detection still
  // fires only at real corners.
  if (turnArrow) {
    let turnIdx = -1;
    let isRight = false;
    for (let k = 1; k < n - 1; k++) {
      const ax = _px[k] - _px[k - 1], az = _pz[k] - _pz[k - 1];
      const bx = _px[k + 1] - _px[k], bz = _pz[k + 1] - _pz[k];
      const al = Math.hypot(ax, az) || 1;
      const bl = Math.hypot(bx, bz) || 1;
      const dot = (ax * bx + az * bz) / (al * bl);
      const ang = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
      if (ang >= TURN_MIN_DEG) {
        const cross = az * bx - ax * bz;
        isRight = (cross > 0) === RIGHT_IS_POSITIVE_CROSS;
        turnIdx = k;
        break;
      }
    }
    if (turnIdx >= 0) {
      turnArrow.visible = true;
      turnArrow.position.set(
        _px[turnIdx],
        resolveY(turnIdx, _px[turnIdx], _py[turnIdx], _pz[turnIdx]) + (TURN_ARROW_LIFT_M + M_LIFT) * W,
        _pz[turnIdx],
      );
      // Billboard to the camera, then tilt in-plane toward the turn side.
      turnArrow.quaternion.copy(camera.quaternion);
      turnArrow.rotateZ(isRight ? -TURN_ARROW_TILT : TURN_ARROW_TILT);
      turnArrow.scale.setScalar(TURN_ARROW_SIZE_M * W);
    } else {
      turnArrow.visible = false;
    }
  }
}

export function NavPath3D({ ctrlRef }: { ctrlRef: RefObject<PlayerControllerHandle | null> }) {
  const ribbonRef = useRef<THREE.Mesh>(null);
  const pinRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const turnArrowRef = useRef<THREE.Group>(null);
  const floorCacheRef = useRef<FloorCache>({ ys: new Map() });
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  // GPU resources built once. Used in render (geometry/material props) so they
  // must be a useMemo value, not a ref. The per-frame buffer mutation lives in
  // paintNavFrame (a plain function — exempt from react-hooks/immutability).
  const setup = useMemo(() => buildSetup(), []);

  useFrame((state) => {
    paintNavFrame(
      {
        ctrl: ctrlRef.current, setup,
        ribbon: ribbonRef.current, pin: pinRef.current, ring: ringRef.current,
        turnArrow: turnArrowRef.current, camera,
        scene, floorCache: floorCacheRef.current,
      },
      state.clock.elapsedTime,
    );
  });

  // `raycast={() => null}` on the route's own meshes so the ground raycast in
  // paintNavFrame never hits them (it must hit the model floor, not the route).
  const noRaycast = () => null;

  // Pin + ring geometry are authored at unit=1 and scaled to metres per frame.
  return (
    <>
      {/* Route line — depth-tested; sits on the raycast ground. */}
      <mesh ref={ribbonRef} geometry={setup.geom} material={setup.routeMat} frustumCulled={false} renderOrder={998} visible={false} raycast={noRaycast} />

      {/* In-scene turn arrow — floats over the next bend, pointing the way. The
          group is positioned + oriented per frame; the child mesh lies flat.
          Always-on-top (depthTest off) so it reads like a HUD nav arrow. */}
      {/* Turn arrow — disabled for now. Re-enable by un-commenting; the
          placement logic in paintNavFrame stays ready (no-ops while the ref is null).
      <group ref={turnArrowRef} frustumCulled={false} visible={false}>
        <mesh geometry={setup.arrowGeom} position={[0, -0.5, 0]} renderOrder={999} frustumCulled={false} raycast={noRaycast}>
          <meshBasicMaterial color={TURN_ARROW_COLOR} transparent opacity={0.85} depthWrite={false} depthTest={false} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      </group>
      */}

      {/* Ground ring at the destination spot (unit ring, scaled per frame).
          DEPTH-TESTED so it reads as lying AT its spot (occluded by walls and
          floors between you and it) — an always-on-top ring on a multi-level
          venue showed through three storeys and looked pasted onto the screen.
          polygonOffset wins the z-fight against the floor it rests on (and
          against depth-writing decals like the crosswalk textures). */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} renderOrder={999} frustumCulled={false} visible={false} raycast={noRaycast}>
        <ringGeometry args={[0.62, 1, 40]} />
        <meshBasicMaterial color={navConfig.color.destRed} transparent opacity={0.85} depthWrite={false} depthTest polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>

      {/* Floating 3D pin — group origin at the tip (y=0), cone points down.
          TWO passes per shape:
            • solid pass — depth-tested, so the pin sits AT its place in the
              world and is properly occluded by geometry in front of it
              (always-on-top made it read like a screen-space "look at" marker
              floating through every level of the stadium);
            • ghost pass — faint, depthTest off, drawn under the solid — the
              through-walls locator hint, subtle enough not to read as the pin
              itself. Raycast disabled on all so the ground sampling at the
              destination XZ hits the floor, not the pin.
          `transparent` is REQUIRED even on the solid pass: an alpha-textured
          decal baked into the GLB (e.g. a crosswalk) draws in the transparent
          pass, which runs AFTER opaque — an opaque pin would be painted over
          despite passing the depth test. Transparent + renderOrder 999 keeps
          the solid pin drawn last, on top of decals. */}
      <group ref={pinRef} frustumCulled={false} visible={false}>
        {/* ghost (through-walls hint) */}
        <mesh position={[0, 0.75, 0]} rotation={[Math.PI, 0, 0]} renderOrder={998} frustumCulled={false} raycast={noRaycast}>
          <coneGeometry args={[0.62, 1.5, 28]} />
          <meshBasicMaterial color={navConfig.color.destRed} transparent opacity={0.18} depthWrite={false} depthTest={false} toneMapped={false} />
        </mesh>
        <mesh position={[0, 2.05, 0]} renderOrder={998} frustumCulled={false} raycast={noRaycast}>
          <sphereGeometry args={[1, 28, 28]} />
          <meshBasicMaterial color={navConfig.color.destRed} transparent opacity={0.18} depthWrite={false} depthTest={false} toneMapped={false} />
        </mesh>
        {/* solid (at its place, depth-tested) */}
        <mesh position={[0, 0.75, 0]} rotation={[Math.PI, 0, 0]} renderOrder={999} frustumCulled={false} raycast={noRaycast}>
          <coneGeometry args={[0.62, 1.5, 28]} />
          <meshStandardMaterial color={navConfig.color.destRed} emissive="#7a1410" emissiveIntensity={0.35} roughness={0.35} metalness={0} transparent depthWrite={false} depthTest />
        </mesh>
        <mesh position={[0, 2.05, 0]} renderOrder={999} frustumCulled={false} raycast={noRaycast}>
          <sphereGeometry args={[1, 28, 28]} />
          <meshStandardMaterial color={navConfig.color.destRed} emissive="#7a1410" emissiveIntensity={0.35} roughness={0.35} metalness={0} transparent depthWrite={false} depthTest />
        </mesh>
      </group>
    </>
  );
}
