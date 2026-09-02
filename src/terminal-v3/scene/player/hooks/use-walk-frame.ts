/**
 * useWalkFrame
 * ─────────────────────────────────────────────────────────────────────────────
 * Per-frame animation loop (runs inside R3F's render loop via useFrame).
 * Handles every moving part of the player each frame, in order:
 *   1. First-enable trigger  : one-time idle drift rotation on spawn
 *   2. Floor transition      : GSAP drives transProg.t 0→1; lerps pos + yaw
 *   3. Idle drift            : slow yaw rotation until user interacts
 *   4. Waypoint walking      : steps pos toward path[pathI] each frame;
 *                              advances pathI when within WAYPOINT_THRESHOLD;
 *                              fires onNavComplete callback at path end
 *   5. Look-ahead yaw        : aims camera at a point LOOK_AHEAD_DISTANCE ahead
 *   6. Navmesh floor probe   : samples navmesh Y under current feet
 *   7. Smooth Y lerp         : eases camera height toward targetY each frame
 *   8. Smooth yaw lerp       : lerps rot.y toward yawT each frame
 *   9. Camera sync           : writes final pos + rot into camera directly
 *
 * All mutation logic lives in runWalkFrame — a plain (non-hook) function whose
 * parameters are NOT subject to the react-hooks/immutability rule.
 */
"use client";

import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Pathfinding } from "three-pathfinding";
import {
  WAYPOINT_THRESHOLD,
  YAW_TRACK_SPEED,
  MAX_TURN_SPEED,
  Y_LERP_SPEED,
  LOOK_AHEAD_DISTANCE,
  IDLE_ROTATE_SPEED,
  PITCH_LEVEL_RATE,
  IDLE_YAW_RATE,
} from "../utils/constants";
import { yaw, lerpAngle, lerpAngleClamp, _ahead } from "../utils/math-utils";
import { navConfig } from "../../../navigation-config";

// Cache the last triangle the probe matched so subsequent frames can skip
// the full-navmesh scan when the player is still inside the same triangle.
// Reset whenever the active zone changes (different navmesh).
const _probeCache: {
  zone: string;
  groupIdx: number;
  nodeIdx: number;
} = { zone: "", groupIdx: -1, nodeIdx: -1 };

// ── Walk-start ease-in ───────────────────────────────────────────────────────
// The player otherwise jumps to full walking speed on frame one, which reads as
// a jerky, too-fast start (and coincides with the panel close + camera handoff).
// Ramp speed 0→1 over WALK_RAMP_SEC with a smoothstep so the walk glides into
// motion. Module-level (single player), reset each time a new walk begins.
const WALK_RAMP_SEC = 0.7;
const _walkRamp = { prevMoving: false, t: 1 };

// ── Movement-direction steering ──────────────────────────────────────────────
// Waypoints are sparse (one per corner), so heading straight at path[pathI]
// snaps the movement vector the instant pathI advances — a visible lateral
// jerk at every bend. Instead the walk direction eases toward the current
// segment's direction (frame-rate-independent exponential), carving a short
// smooth arc through each corner. Close to the waypoint the direction is exact
// so the arrival threshold always trips; that direct zone is only a few
// frame-steps (whichever of stepLen*4 / 3 waypoint-thresholds is larger — NOT
// a fixed 0.5u floor, and NOT scaled by the speed multiplier: the old 0.5u
// floor exceeded the waypoint spacing on dense navmeshes like the memorial's
// sub-unit strips, so steering ran permanently direct there and the direction
// snapped at every waypoint — 5× made those snaps 5× as frequent). The
// deviation from the drawn route is a few tens of cm at most (the Y probe
// already tolerates brief off-mesh corner cuts). Module-level (single
// player), reset per walk.
const STEER_RATE = 8;      // 1/s — ~95% converged in ~0.4s
const _moveDir = { x: 0, z: 0 };

// ── Spatial grid for the floor probe ─────────────────────────────────────────
// Buckets a zone's navmesh triangles into XZ cells so the per-frame "which
// triangle am I on" probe tests only the handful under the player instead of
// scanning the whole zone. Dense navmeshes (e.g. the stadium's ~8.6k triangles
// packed into a small area) otherwise make the slow-path full scan run most
// frames while walking, stuttering the movement. Rebuilt when the zone changes.
const _grid: {
  zone: string;
  cell: number;
  minX: number;
  minZ: number;
  cols: number;
  buckets: Map<number, Array<[number, number]>>;
} = { zone: "", cell: 0, minX: 0, minZ: 0, cols: 0, buckets: new Map() };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildProbeGrid(zone: string, groups: any[][], vertices: THREE.Vector3[]): void {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let g = 0; g < groups.length; g++) {
    for (let i = 0; i < groups[g].length; i++) {
      const ids: number[] | undefined = groups[g][i]?.vertexIds;
      if (!ids) continue;
      for (let k = 0; k < 3; k++) {
        const v = vertices[ids[k]];
        if (!v) continue;
        if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
        if (v.z < minZ) minZ = v.z; if (v.z > maxZ) maxZ = v.z;
      }
    }
  }
  const cols = 64;
  const cell = Math.max(maxX - minX, maxZ - minZ, 1) / cols;
  const buckets = new Map<number, Array<[number, number]>>();
  for (let g = 0; g < groups.length; g++) {
    for (let i = 0; i < groups[g].length; i++) {
      const ids: number[] | undefined = groups[g][i]?.vertexIds;
      if (!ids || ids.length < 3) continue;
      const v0 = vertices[ids[0]], v1 = vertices[ids[1]], v2 = vertices[ids[2]];
      if (!v0 || !v1 || !v2) continue;
      const cx0 = Math.max(0, Math.floor((Math.min(v0.x, v1.x, v2.x) - minX) / cell));
      const cx1 = Math.min(cols, Math.floor((Math.max(v0.x, v1.x, v2.x) - minX) / cell));
      const cz0 = Math.max(0, Math.floor((Math.min(v0.z, v1.z, v2.z) - minZ) / cell));
      const cz1 = Math.min(cols, Math.floor((Math.max(v0.z, v1.z, v2.z) - minZ) / cell));
      for (let cz = cz0; cz <= cz1; cz++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const key = cz * (cols + 1) + cx;
          let arr = buckets.get(key);
          if (!arr) { arr = []; buckets.set(key, arr); }
          arr.push([g, i]);
        }
      }
    }
  }
  _grid.zone = zone; _grid.cell = cell; _grid.minX = minX; _grid.minZ = minZ;
  _grid.cols = cols; _grid.buckets = buckets;
}

export interface UseWalkFrameOptions {
  prevEnabled: React.MutableRefObject<boolean>;
  idleOn:      React.MutableRefObject<boolean>;
  idleAcc:     React.MutableRefObject<number>;
  pos:         React.MutableRefObject<THREE.Vector3>;
  rot:         React.MutableRefObject<THREE.Euler>;
  yawT:        React.MutableRefObject<number>;
  moving:      React.MutableRefObject<boolean>;
  path:        React.MutableRefObject<THREE.Vector3[]>;
  pathI:       React.MutableRefObject<number>;
  speedMult:   React.MutableRefObject<number>;
  transition: {
    active:   React.MutableRefObject<boolean>;
    prog:     React.MutableRefObject<{ t: number }>;
    start:    React.MutableRefObject<THREE.Vector3>;
    end:      React.MutableRefObject<THREE.Vector3>;
    startYaw: React.MutableRefObject<number>;
    endYaw:   React.MutableRefObject<number>;
  };
  targetY:      React.MutableRefObject<number>;
  currentZone:  React.MutableRefObject<string>;
  onNavComplete:  React.MutableRefObject<(() => void) | null>;
  vizGrp:         React.MutableRefObject<THREE.Group | null>;
  /** When true, suppress the automatic idle-drift start on first-enable */
  skipFirstIdle?: React.MutableRefObject<boolean>;
  enabled:        boolean;
  /** First-person look control without walking (e.g. no navmesh yet). When
   *  `enabled` is false but this is true, drag/idle rotation still drives the
   *  camera. */
  lookEnabled?:   boolean;
  speed:        number;
  cameraHeight: number;
  camera:       THREE.Camera;
  setMoving:    (v: boolean) => void;
  pathfinding:  Pathfinding;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plain function — NOT a hook or component, so its parameters are not subject
// to the react-hooks/immutability rule. All ref mutations happen here.
// ─────────────────────────────────────────────────────────────────────────────
function runWalkFrame(o: UseWalkFrameOptions, delta: number): void {
  const {
    prevEnabled, idleOn, idleAcc,
    pos, rot, yawT, moving, path, pathI, speedMult,
    transition, targetY, currentZone, onNavComplete, vizGrp,
    skipFirstIdle,
    enabled, lookEnabled, cameraHeight, camera, setMoving, pathfinding,
  } = o;

  // Real-time walking speed in WORLD UNITS/sec, derived from the same two knobs
  // that drive the displayed distance/ETA (nav-config: walkMps + display scale).
  // This is what makes the on-screen walk take EXACTLY the time the UI shows:
  //   units/sec = (metres/sec) ÷ (metres/unit).
  // (The scene's `speed` prop is intentionally ignored here so movement can't
  // drift away from the advertised ETA.)
  const navSpeedUnits = navConfig.logic.walkMps / navConfig.logic.displayMetersPerUnit;

  // ── First-enable trigger ───────────────────────────────────────────────────
  if (enabled && !prevEnabled.current) {
    prevEnabled.current = true;
    if (!skipFirstIdle?.current) {
      idleOn.current  = true;
      idleAcc.current = 0;
    }
  }

  if (!enabled) {
    // ── Look-only mode ────────────────────────────────────────────────────────
    // The player is in first-person but walking is disabled — typically because
    // the floor has no navmesh yet (navReady false → `enabled` false). We still
    // want drag + idle rotation to move the camera so the user can look around;
    // we just skip all pathfinding walking and floor-height probing.
    //
    // Gated on `lookEnabled` (NOT just `!enabled`) so this never runs during a
    // cinematic fly — there `lookEnabled` is false and we fully yield the camera.
    if (lookEnabled) {
      const dt = Math.min(delta, 0.1);
      if (idleOn.current && !moving.current) {
        const step = IDLE_ROTATE_SPEED * dt;
        yawT.current    += step;
        idleAcc.current += step;
        if (idleAcc.current >= Math.PI * 2) idleOn.current = false;
      }
      // Ease yaw toward its target (drag also writes rot.y directly, so this is a
      // no-op mid-drag and just carries idle drift when the user isn't dragging).
      const yawAlpha = 1 - Math.exp(-IDLE_YAW_RATE * dt);
      rot.current.y = lerpAngle(rot.current.y, yawT.current, yawAlpha);
      camera.position.copy(pos.current);
      camera.rotation.set(rot.current.x, rot.current.y, rot.current.z, "YXZ");
    }
    return;
  }

  // Idle frames re-arm the walk-start ease-in so the NEXT walk ramps from 0.
  if (!moving.current) _walkRamp.prevMoving = false;

  // ── Floor transition: GSAP drives prog.t 0 → 1 ────────────────────────────
  if (transition.active.current) {
    const t = transition.prog.current.t;
    pos.current.lerpVectors(transition.start.current, transition.end.current, t);
    rot.current.y = transition.startYaw.current +
      (transition.endYaw.current - transition.startYaw.current) * t;
    yawT.current = rot.current.y;
    camera.position.copy(pos.current);
    camera.rotation.set(rot.current.x, rot.current.y, rot.current.z, "YXZ");
    return;
  }

  const dt = Math.min(delta, 0.1);

  // ── Idle drift rotation ────────────────────────────────────────────────────
  if (idleOn.current && !moving.current) {
    const step = IDLE_ROTATE_SPEED * dt;
    yawT.current    += step;
    idleAcc.current += step;
    if (idleAcc.current >= Math.PI * 2) idleOn.current = false;
  }

  // ── Waypoint walking ───────────────────────────────────────────────────────
  if (moving.current && path.current.length > 0) {
    const wp     = path.current[pathI.current];
    const dx     = wp.x - pos.current.x;
    const dz     = wp.z - pos.current.z;
    const distXZ = Math.sqrt(dx * dx + dz * dz);

    // Walk-start ease-in: speed scales 0→1 over WALK_RAMP_SEC (smoothstep) so the
    // first moment of the walk glides in instead of snapping to full pace.
    if (!_walkRamp.prevMoving) {
      _walkRamp.t = 0;
      // Fresh walk — no inherited steering direction from the previous one.
      _moveDir.x = 0;
      _moveDir.z = 0;
    }
    _walkRamp.prevMoving = true;
    if (_walkRamp.t < 1) _walkRamp.t = Math.min(1, _walkRamp.t + dt / WALK_RAMP_SEC);
    const rampS = _walkRamp.t * _walkRamp.t * (3 - 2 * _walkRamp.t);

    // Speed-aware turning. At 5× the player covers ~0.12u per frame — more
    // than the 8cm waypoint threshold — so an unscaled loop overshoots the
    // corner, flips direction next frame, and oscillates: the "5× turns are
    // jerky" report. Three scalings fix it coherently:
    //   • arrival radius grows to at least one frame-step (no overshoot),
    //   • steering + yaw rates scale by √mult — turns stay smooth in TIME
    //     while the arc stays reasonable in SPACE.
    const mult = speedMult.current;
    const stepLen = navSpeedUnits * mult * rampS * dt;
    const turnBoost = Math.max(1, Math.sqrt(mult));

    if (distXZ < Math.max(WAYPOINT_THRESHOLD, stepLen * 1.25)) {
      // Advance pathI without snapping XZ.
      // Snapping would teleport the player up to WAYPOINT_THRESHOLD in one
      // frame — visible as a jerk at every corner. With THRESHOLD tightened
      // to ~8cm the player passes through corners cleanly and the corridor
      // is still tight enough to stay off walls.
      if (pathI.current < path.current.length - 1) {
        pathI.current++;
      } else {
        // Reached final waypoint — stop here without snap (the 8cm overshoot
        // is invisible and avoids a noticeable end-of-walk jerk).
        setMoving(false);
        path.current = [];
        vizGrp.current?.clear();
        const cb = onNavComplete.current;
        onNavComplete.current = null;
        cb?.();
        return;
      }
    } else {
      const step = Math.min(stepLen, distXZ);
      // Steer toward the segment direction instead of snapping to it — the
      // eased direction carves a smooth arc through corners (see _moveDir).
      const ux = dx / distXZ;
      const uz = dz / distXZ;
      let mx = ux;
      let mz = uz;
      if (distXZ > Math.max(WAYPOINT_THRESHOLD * 3, stepLen * 4) && (_moveDir.x !== 0 || _moveDir.z !== 0)) {
        const a = 1 - Math.exp(-STEER_RATE * turnBoost * dt);
        mx = _moveDir.x + (ux - _moveDir.x) * a;
        mz = _moveDir.z + (uz - _moveDir.z) * a;
        const ml = Math.hypot(mx, mz);
        // Degenerate blend (near-reversal / collapsed vector) → go direct.
        if (ml < 0.3 || (mx * ux + mz * uz) / Math.max(ml, 1e-6) < 0.2) {
          mx = ux; mz = uz;
        } else {
          mx /= ml; mz /= ml;
        }
      }
      _moveDir.x = mx;
      _moveDir.z = mz;
      pos.current.x += mx * step;
      pos.current.z += mz * step;
    }

    // ── Look-ahead: aim yaw at a point ahead on the path ──────────────────
    // Scaled LINEARLY with speed so the look-ahead horizon is constant in
    // TIME (the same seconds-ahead at any multiplier). With the old √mult
    // scaling the horizon shrank as speed rose, so at 5× the yaw target
    // swept corners ~2.2× faster than at 1× and saturated the turn-rate
    // clamp — a constant-rate spin with an abrupt stop at every bend.
    let rem = LOOK_AHEAD_DISTANCE * mult;
    _ahead.copy(pos.current);
    for (let i = pathI.current; i < path.current.length && rem > 0; i++) {
      const wp2 = path.current[i];
      const ddx = wp2.x - _ahead.x;
      const ddy = wp2.y - _ahead.y;
      const ddz = wp2.z - _ahead.z;
      const d   = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
      if (d <= rem) {
        _ahead.copy(wp2);
        rem -= d;
      } else {
        const inv = rem / d;
        _ahead.x += ddx * inv;
        _ahead.y += ddy * inv;
        _ahead.z += ddz * inv;
        break;
      }
    }
    // Smooth yawT toward the look-ahead direction rather than snapping it.
    // This absorbs the small per-waypoint direction jumps that cause jitter
    // when pathI advances and the look-ahead point shifts on the path.
    //
    // Frame-rate independent: `rate * dt` was a 60fps approximation. At 30fps
    // it under-smoothed (target leaked through), at 120fps it over-smoothed
    // (camera lagged). 1 - exp(-rate * dt) gives the same exponential decay
    // regardless of refresh rate.
    const yawAlpha = 1 - Math.exp(-YAW_TRACK_SPEED * turnBoost * dt);
    yawT.current = lerpAngle(yawT.current, yaw(pos.current, _ahead), yawAlpha);
  }

  // ── Floor Y — barycentric probe, WHILE MOVING ───────────────────────
  //
  // Probe runs only while walking — that's the only time its result is used
  // (the vertical-follow lerp below). When idle the camera Y is held, so the
  // probe would be wasted work. Critically, when the idle spot isn't inside a
  // navmesh triangle the probe falls through to the SLOW PATH (a full scan of
  // every triangle — thousands on the stadium) EVERY frame; running that while
  // standing still hitched the frame loop and made the idle auto-rotation look
  // jerky. Gating on `moving` removes that cost entirely when idle.
  //
  // Uses the navmesh triangle the player is XZ-over and interpolates Y from
  // its three vertex Ys via barycentric weights. The fast-path / slow-path
  // disambiguation handles stacked triangles at stair seams without picking
  // a different floor's tri (the segment-interpolated expectedSurfaceY
  // below keeps the bias tracking the actual climb rate).
  if (moving.current) {
    const zone = currentZone.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const zoneData = (pathfinding as any).zones?.[zone];
    if (zoneData) {
      const px = pos.current.x;
      const pz = pos.current.z;
      const vertices: THREE.Vector3[] = zoneData.vertices ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const groups: any[][] = zoneData.groups ?? [];

      // Reset cache if zone changed
      if (_probeCache.zone !== zone) {
        _probeCache.zone = zone;
        _probeCache.groupIdx = -1;
        _probeCache.nodeIdx = -1;
      }

      const tryTriangle = (g: number, i: number): number | null => {
        const node = groups[g]?.[i];
        if (!node) return null;
        const ids: number[] = node.vertexIds;
        if (!ids || ids.length < 3) return null;
        const v0 = vertices[ids[0]];
        const v1 = vertices[ids[1]];
        const v2 = vertices[ids[2]];
        if (!v0 || !v1 || !v2) return null;
        const denom = (v1.z - v2.z) * (v0.x - v2.x) + (v2.x - v1.x) * (v0.z - v2.z);
        if (Math.abs(denom) < 1e-9) return null;
        const a = ((v1.z - v2.z) * (px - v2.x) + (v2.x - v1.x) * (pz - v2.z)) / denom;
        const b = ((v2.z - v0.z) * (px - v2.x) + (v0.x - v2.x) * (pz - v2.z)) / denom;
        const c = 1 - a - b;
        const tol = 1e-3;
        if (a >= -tol && b >= -tol && c >= -tol) {
          return a * v0.y + b * v1.y + c * v2.y;
        }
        return null;
      };

      // Expected surface Y — the disambiguator for stacked triangles. While
      // walking we interpolate Y along the CURRENT path segment (prev wp →
      // next wp) using the player's XZ projection onto that segment. Using
      // just the next waypoint's Y caused a visible jump on stairs: when
      // pathI advanced mid-stair, the bias jumped up by one step's worth
      // and the triangle search picked the next step's triangle a frame
      // early. Segment-interpolated Y evolves smoothly with the walk, so
      // the bias matches the actual climb rate and the probe picks the
      // triangle the player is genuinely on. When idle, fall back to the
      // player's current feet Y.
      //
      // `segDY` is the absolute Y delta of the current path segment — used
      // below to decide whether to TRUST the segment-interpolated Y directly
      // (slope walking) or fall back to the navmesh-probe Y (flat walking).
      let segDY = 0;
      const expectedSurfaceY = (() => {
        if (!moving.current || path.current.length === 0) {
          return pos.current.y - cameraHeight;
        }
        const i = pathI.current;
        const wp = path.current[i];
        if (i === 0) { segDY = 0; return wp.y; }
        const prev = path.current[i - 1];
        const sdx = wp.x - prev.x;
        const sdz = wp.z - prev.z;
        const segLenSq = sdx * sdx + sdz * sdz;
        if (segLenSq < 1e-9) return wp.y;
        // Scalar projection of (pos - prev) onto (wp - prev), clamped to [0,1].
        const tdx = pos.current.x - prev.x;
        const tdz = pos.current.z - prev.z;
        let tParam = (tdx * sdx + tdz * sdz) / segLenSq;
        if (tParam < 0) tParam = 0;
        else if (tParam > 1) tParam = 1;
        segDY = Math.abs(wp.y - prev.y);
        return prev.y + (wp.y - prev.y) * tParam;
      })();

      // FAST PATH: still inside cached triangle?
      // CROSS-FLOOR GUARD: the cached triangle from the previous floor can
      // still contain the player's XZ at multi-floor seams (stair landings
      // where floor N and floor N+1 triangles stack). Without the diff check
      // the fast path would lock onto the lower floor's Y as the player
      // crosses up — pos.y snaps below the new surface (visible "drop below
      // the floor"), the auto floor detector then mis-classifies on the wrong
      // Y, and the UI briefly flips to the wrong floor before slow-path
      // probes re-anchor. 0.5m ≈ 3 stair steps — generous enough to absorb
      // mid-stair waypoint interpolation but tight enough to catch the
      // ~floor-height gap between stacked landings.
      let y: number | null = null;
      if (_probeCache.groupIdx >= 0 && _probeCache.nodeIdx >= 0) {
        const cached = tryTriangle(_probeCache.groupIdx, _probeCache.nodeIdx);
        if (cached !== null && Math.abs(cached - expectedSurfaceY) < 0.5) {
          y = cached;
        } else {
          // Either the XZ left the triangle, or the triangle belongs to a
          // different floor. Invalidate so SLOW PATH picks the correct one.
          _probeCache.groupIdx = -1;
          _probeCache.nodeIdx = -1;
        }
      }

      // GRID PATH: test only the triangles bucketed under the player's XZ cell
      // (biased by expectedSurfaceY, same as the full scan). Bounds the cost to
      // a few triangles regardless of how many the zone has.
      //
      // HEIGHT-BAND GUARD: candidates outside GRID_Y_BAND of the expected
      // surface are rejected outright, not just deprioritised. On stacked
      // multi-level meshes (SoFi: bowl/concourse ABOVE a lower walkway) the
      // player's XZ regularly sits over triangles of several floors at once —
      // and at triangle seams / T-junction gaps the containment test can miss
      // the CORRECT floor's triangle for a frame or two. With Infinity as the
      // starting bound, the only surviving candidate was then a floor ~16m
      // below, so targetY dived and recovered — the "Y dab" bobbing on every
      // stair section of a seat route. Rejecting out-of-band candidates makes
      // those frames read as off-mesh instead, which holds the previous
      // targetY (see the no-slow-path note below) — visually seamless.
      const GRID_Y_BAND = 1.5;
      if (y === null) {
        if (_grid.zone !== zone) buildProbeGrid(zone, groups, vertices);
        if (_grid.cell > 0) {
          const cx = Math.max(0, Math.min(_grid.cols, Math.floor((px - _grid.minX) / _grid.cell)));
          const cz = Math.max(0, Math.min(_grid.cols, Math.floor((pz - _grid.minZ) / _grid.cell)));
          const cand = _grid.buckets.get(cz * (_grid.cols + 1) + cx);
          if (cand) {
            let bestYDiff = GRID_Y_BAND;
            for (let n = 0; n < cand.length; n++) {
              const g = cand[n][0], i = cand[n][1];
              const ty = tryTriangle(g, i);
              if (ty !== null) {
                const diff = Math.abs(ty - expectedSurfaceY);
                if (diff < bestYDiff) {
                  bestYDiff = diff;
                  y = ty;
                  _probeCache.groupIdx = g;
                  _probeCache.nodeIdx = i;
                }
              }
            }
          }
        }
      }

      // NO slow-path full scan. When the grid cell holds no containing
      // triangle the player is momentarily OFF-mesh — which happens on every
      // corner cut on a thin-strip navmesh (the memorial's walkable rows are
      // sub-unit wide). The old fallback then ran a FULL scan of every
      // triangle (~20k on the memorial) EVERY frame until back on-mesh — the
      // "player hangs at each turn". Holding the previous targetY for those
      // few frames is visually perfect: the path waypoints carry the real Y
      // and the slope branch below tracks climbs, so nothing drifts.

      // ── Pick Y source ─────────────────────────────────────────────────
      // On SLOPING path segments (stairs / ramps) the probe's per-triangle
      // Y can step when crossing triangle boundaries — even with a smoothly
      // authored slope, the welder (`weldToSingleGroup` in ../navmesh) can
      // pull stair-foot vertices into adjacent floor vertices, distorting
      // the slope plane locally. The string-pulled path Y is immune to that:
      // it's a linear interpolation between two waypoint Ys, and XZ also
      // moves linearly along the segment, so segment-interpolated Y is the
      // ground truth climb curve.
      //
      // SLOPE_Y_THRESHOLD = 0.05m: a 5cm Y delta over a path segment marks
      // it as inclined (anything less is treated as float noise on a flat
      // segment, where the probe is more accurate — it tracks small
      // navmesh undulations the path doesn't see).
      const SLOPE_Y_THRESHOLD = 0.05;
      if (moving.current && segDY > SLOPE_Y_THRESHOLD) {
        targetY.current = expectedSurfaceY + cameraHeight;
      } else if (y !== null) {
        targetY.current = y + cameraHeight;
      }
    }
  }

  // ── Vertical follow ────────────────────────────────────────────────
  // Only adjust Y while ACTIVELY WALKING — the lerp smooths the small Y
  // discontinuities the probe produces when crossing navmesh triangles on a
  // slope/stairs.
  //
  // When IDLE we deliberately do NOT re-snap pos.y to the probe. The XZ isn't
  // moving, so the correct height is already set — by the spawn navmesh snap,
  // by a teleport, or by the last walking frame. Re-snapping to the probe every
  // idle frame served no purpose (the value should be identical) but exposed the
  // probe's sub-cm frame-to-frame float noise as a vertical wobble — invisible
  // while standing still, but clearly JERKY once the idle auto-rotation pans the
  // view. Holding Y while idle keeps the pan dead-level.
  if (moving.current) {
    // Scaled with the walk speed (√mult, same as the turn boosts): at 5× the
    // surface Y under the player changes 5× faster, and an unscaled rate let
    // the camera sink ~half a metre behind on stairs, then pop at the top.
    const yBoost = Math.max(1, Math.sqrt(speedMult.current));
    const yAlpha = 1 - Math.exp(-Y_LERP_SPEED * yBoost * dt);
    pos.current.y += (targetY.current - pos.current.y) * yAlpha;
  }

  // ── Smooth yaw ────────────────────────────────────────────────────────────
  // Two regimes:
  //   • Walking: constant-rate clamp at MAX_TURN_SPEED — keeps corner tracking
  //     responsive (`yawT` is itself being eased by the look-ahead each frame,
  //     so the constant-rate catch-up isn't perceived as jerky here).
  //   • Idle: exponential ease toward yawT — used by lookAtPoint, idle drift,
  //     and any other path where yawT changes in one shot. The exponential
  //     gives a soft start/finish so an instant yawT jump doesn't snap-start
  //     at full angular speed (which felt abrupt after stair-point arrivals).
  if (moving.current) {
    // Turn-rate cap scales with the walk speed multiplier (√mult, same boost
    // as the look-ahead easing) — at 5× an unscaled 2.6 rad/s cap lags whole
    // corners behind the motion and then catches up in a rush.
    const clampBoost = Math.max(1, Math.sqrt(speedMult.current));
    rot.current.y = lerpAngleClamp(rot.current.y, yawT.current, MAX_TURN_SPEED * clampBoost * dt);
  } else {
    const yawAlpha = 1 - Math.exp(-IDLE_YAW_RATE * dt);
    rot.current.y = lerpAngle(rot.current.y, yawT.current, yawAlpha);
  }

  // ── Pitch leveling while walking ──────────────────────────────────────────
  // If the user clicked a target after pitching the camera up/down (e.g. the
  // cursor was high on the screen), keep the head pitched at that angle while
  // walking would feel wrong — the player marches toward the point looking
  // away from the horizon. Smoothly ease rot.x → 0 during movement so the
  // horizon levels out without the visible "snap level" jolt that snapping
  // pitch=0 on walk start would produce.
  if (moving.current && rot.current.x !== 0) {
    const alpha = 1 - Math.exp(-PITCH_LEVEL_RATE * dt);
    rot.current.x += (0 - rot.current.x) * alpha;
    if (Math.abs(rot.current.x) < 1e-4) rot.current.x = 0;
  }

  // ── Push to camera ─────────────────────────────────────────────────────────
  camera.position.copy(pos.current);
  camera.rotation.set(rot.current.x, rot.current.y, rot.current.z, "YXZ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook — only wires useFrame; all logic delegated to runWalkFrame above.
// ─────────────────────────────────────────────────────────────────────────────
export function useWalkFrame(opts: UseWalkFrameOptions): void {
  useFrame((_, delta) => runWalkFrame(opts, delta));
}
