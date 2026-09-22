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

const _probeCache: {
  zone: string;
  groupIdx: number;
  nodeIdx: number;
} = { zone: "", groupIdx: -1, nodeIdx: -1 };

const WALK_RAMP_SEC = 0.7;
const _walkRamp = { prevMoving: false, t: 1 };

const STEER_RATE = 8;
const _moveDir = { x: 0, z: 0 };

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
  skipFirstIdle?: React.MutableRefObject<boolean>;
  enabled:        boolean;
  lookEnabled?:   boolean;
  speed:        number;
  cameraHeight: number;
  camera:       THREE.Camera;
  setMoving:    (v: boolean) => void;
  pathfinding:  Pathfinding;
}

function runWalkFrame(o: UseWalkFrameOptions, delta: number): void {
  const {
    prevEnabled, idleOn, idleAcc,
    pos, rot, yawT, moving, path, pathI, speedMult,
    transition, targetY, currentZone, onNavComplete, vizGrp,
    skipFirstIdle,
    enabled, lookEnabled, cameraHeight, camera, setMoving, pathfinding,
  } = o;

  const navSpeedUnits = navConfig.logic.walkMps / navConfig.logic.displayMetersPerUnit;

  if (enabled && !prevEnabled.current) {
    prevEnabled.current = true;
    if (!skipFirstIdle?.current) {
      idleOn.current  = true;
      idleAcc.current = 0;
    }
  }

  if (!enabled) {
    if (lookEnabled) {
      const dt = Math.min(delta, 0.1);
      if (idleOn.current && !moving.current) {
        const step = IDLE_ROTATE_SPEED * dt;
        yawT.current    += step;
        idleAcc.current += step;
        if (idleAcc.current >= Math.PI * 2) idleOn.current = false;
      }
      const yawAlpha = 1 - Math.exp(-IDLE_YAW_RATE * dt);
      rot.current.y = lerpAngle(rot.current.y, yawT.current, yawAlpha);
      camera.position.copy(pos.current);
      camera.rotation.set(rot.current.x, rot.current.y, rot.current.z, "YXZ");
    }
    return;
  }

  if (!moving.current) _walkRamp.prevMoving = false;

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

  if (idleOn.current && !moving.current) {
    const step = IDLE_ROTATE_SPEED * dt;
    yawT.current    += step;
    idleAcc.current += step;
    if (idleAcc.current >= Math.PI * 2) idleOn.current = false;
  }

  if (moving.current && path.current.length > 0) {
    const wp     = path.current[pathI.current];
    const dx     = wp.x - pos.current.x;
    const dz     = wp.z - pos.current.z;
    const distXZ = Math.sqrt(dx * dx + dz * dz);

    if (!_walkRamp.prevMoving) {
      _walkRamp.t = 0;
      _moveDir.x = 0;
      _moveDir.z = 0;
    }
    _walkRamp.prevMoving = true;
    if (_walkRamp.t < 1) _walkRamp.t = Math.min(1, _walkRamp.t + dt / WALK_RAMP_SEC);
    const rampS = _walkRamp.t * _walkRamp.t * (3 - 2 * _walkRamp.t);

    const mult = speedMult.current;
    const stepLen = navSpeedUnits * mult * rampS * dt;
    const turnBoost = Math.max(1, Math.sqrt(mult));

    if (distXZ < Math.max(WAYPOINT_THRESHOLD, stepLen * 1.25)) {
      if (pathI.current < path.current.length - 1) {
        pathI.current++;
      } else {
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
      const ux = dx / distXZ;
      const uz = dz / distXZ;
      let mx = ux;
      let mz = uz;
      if (distXZ > Math.max(WAYPOINT_THRESHOLD * 3, stepLen * 4) && (_moveDir.x !== 0 || _moveDir.z !== 0)) {
        const a = 1 - Math.exp(-STEER_RATE * turnBoost * dt);
        mx = _moveDir.x + (ux - _moveDir.x) * a;
        mz = _moveDir.z + (uz - _moveDir.z) * a;
        const ml = Math.hypot(mx, mz);
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
    const yawAlpha = 1 - Math.exp(-YAW_TRACK_SPEED * turnBoost * dt);
    yawT.current = lerpAngle(yawT.current, yaw(pos.current, _ahead), yawAlpha);
  }

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
        const tdx = pos.current.x - prev.x;
        const tdz = pos.current.z - prev.z;
        let tParam = (tdx * sdx + tdz * sdz) / segLenSq;
        if (tParam < 0) tParam = 0;
        else if (tParam > 1) tParam = 1;
        segDY = Math.abs(wp.y - prev.y);
        return prev.y + (wp.y - prev.y) * tParam;
      })();

      let y: number | null = null;
      if (_probeCache.groupIdx >= 0 && _probeCache.nodeIdx >= 0) {
        const cached = tryTriangle(_probeCache.groupIdx, _probeCache.nodeIdx);
        if (cached !== null && Math.abs(cached - expectedSurfaceY) < 0.5) {
          y = cached;
        } else {
          _probeCache.groupIdx = -1;
          _probeCache.nodeIdx = -1;
        }
      }

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

      const SLOPE_Y_THRESHOLD = 0.05;
      if (moving.current && segDY > SLOPE_Y_THRESHOLD) {
        targetY.current = expectedSurfaceY + cameraHeight;
      } else if (y !== null) {
        targetY.current = y + cameraHeight;
      }
    }
  }

  if (moving.current) {
    const yBoost = Math.max(1, Math.sqrt(speedMult.current));
    const yAlpha = 1 - Math.exp(-Y_LERP_SPEED * yBoost * dt);
    pos.current.y += (targetY.current - pos.current.y) * yAlpha;
  }

  if (moving.current) {
    const clampBoost = Math.max(1, Math.sqrt(speedMult.current));
    rot.current.y = lerpAngleClamp(rot.current.y, yawT.current, MAX_TURN_SPEED * clampBoost * dt);
  } else {
    const yawAlpha = 1 - Math.exp(-IDLE_YAW_RATE * dt);
    rot.current.y = lerpAngle(rot.current.y, yawT.current, yawAlpha);
  }

  if (moving.current && rot.current.x !== 0) {
    const alpha = 1 - Math.exp(-PITCH_LEVEL_RATE * dt);
    rot.current.x += (0 - rot.current.x) * alpha;
    if (Math.abs(rot.current.x) < 1e-4) rot.current.x = 0;
  }

  camera.position.copy(pos.current);
  camera.rotation.set(rot.current.x, rot.current.y, rot.current.z, "YXZ");
}

export function useWalkFrame(opts: UseWalkFrameOptions): void {
  useFrame((_, delta) => runWalkFrame(opts, delta));
}
