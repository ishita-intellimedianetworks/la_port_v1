"use client";

import { useMemo, useRef } from "react";
import type { RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import type { PlayerControllerHandle } from "../player/types";
import { navConfig } from "../../navigation-config";
import { useNavUiStore } from "../../stores/nav-ui-store";

const MAX_POINTS = 256;

const _ray = new THREE.Raycaster();
const _down = new THREE.Vector3(0, -1, 0);
const _origin = new THREE.Vector3();

interface FloorCache { ys: Map<string, number>; footX?: number; footZ?: number; footY?: number; }

const MAX_GROUND_PROBES_PER_FRAME = 12;

const yKey = (x: number, z: number) => `${Math.round(x * 4)},${Math.round(z * 4)}`;

const _px = new Float32Array(MAX_POINTS);
const _py = new Float32Array(MAX_POINTS);
const _pz = new Float32Array(MAX_POINTS);

const SUBDIV_M = 3;

const FOOT_REPROBE_DIST = 0.4;

const GROUND_SNAP_BAND = 2.5;

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

const { lineWidthM: M_LINE_W, liftM: M_LIFT, pinHeadM: M_PIN, pinFloatM: M_FLOAT, pinBobM: M_BOB, ringOuterM: M_RING } = navConfig.scene3d;

function hexRgb(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

const TURN_ARROW_SIZE_M = 1.7;
const TURN_ARROW_LIFT_M = 1.9;
const TURN_MIN_DEG = navConfig.logic.turnMinDeg;
const RIGHT_IS_POSITIVE_CROSS = navConfig.logic.rightIsPositiveCross;
const TURN_ARROW_TILT = 0.55;

function buildArrowGeom(): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 1.05);
  s.lineTo(0.4, 0.5);
  s.lineTo(0.14, 0.5);
  s.lineTo(0.14, 0);
  s.lineTo(-0.14, 0);
  s.lineTo(-0.14, 0.5);
  s.lineTo(-0.4, 0.5);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

interface NavSetup {
  geom: THREE.BufferGeometry;
  routeTex: THREE.Texture;
  routeMat: THREE.MeshBasicMaterial;
  arrowGeom: THREE.ShapeGeometry;
}

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
  g.addColorStop(0.2, `rgba(${casing}, 0.95)`);
  g.addColorStop(0.34, `rgba(${core}, 1)`);
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
  turnArrow: THREE.Group | null;
  camera: THREE.Camera;
  scene: THREE.Scene;
  floorCache: FloorCache;
}

function paintNavFrame(o: FrameOpts, elapsed: number): void {
  const { ctrl, setup, ribbon, pin, ring, turnArrow, camera, scene, floorCache } = o;
  if (!ctrl || !ribbon) return;

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

  const mpu = ctrl.getMetersPerUnit() || 0.5;
  const W = 1 / mpu;
  const width = M_LINE_W * W;
  const lift = M_LIFT * W;

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

  let probesLeft = MAX_GROUND_PROBES_PER_FRAME;
  if (floorCache.ys.size > 4096) floorCache.ys.clear();
  const resolveY = (i: number, x: number, fallbackY: number, z: number) => {
    if (i === 0) {
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
    if (probesLeft <= 0) return fallbackY;
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

  const noRaycast = () => null;

  return (
    <>
      <mesh ref={ribbonRef} geometry={setup.geom} material={setup.routeMat} frustumCulled={false} renderOrder={998} visible={false} raycast={noRaycast} />

      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} renderOrder={999} frustumCulled={false} visible={false} raycast={noRaycast}>
        <ringGeometry args={[0.62, 1, 40]} />
        <meshBasicMaterial color={navConfig.color.destRed} transparent opacity={0.85} depthWrite={false} depthTest polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>

      <group ref={pinRef} frustumCulled={false} visible={false}>
        <mesh position={[0, 0.75, 0]} rotation={[Math.PI, 0, 0]} renderOrder={998} frustumCulled={false} raycast={noRaycast}>
          <coneGeometry args={[0.62, 1.5, 28]} />
          <meshBasicMaterial color={navConfig.color.destRed} transparent opacity={0.18} depthWrite={false} depthTest={false} toneMapped={false} />
        </mesh>
        <mesh position={[0, 2.05, 0]} renderOrder={998} frustumCulled={false} raycast={noRaycast}>
          <sphereGeometry args={[1, 28, 28]} />
          <meshBasicMaterial color={navConfig.color.destRed} transparent opacity={0.18} depthWrite={false} depthTest={false} toneMapped={false} />
        </mesh>
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
