"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { RoomZone } from "../../navmesh/geometry";

const THROTTLE = 10; // sample every 10 frames
const _orig = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);
const _rc   = new THREE.Raycaster();

interface Opts {
  pos:          React.MutableRefObject<THREE.Vector3>;
  currentZone:  React.MutableRefObject<string>;
  enabled:      boolean;
  roomZonesMap: React.MutableRefObject<Map<string, RoomZone[]>>;
  onRoomChange: (id: string | null) => void;
}

/**
 * Per-frame room zone detection using the navmesh's named meshes.
 * Each named mesh in the navmesh GLB = one room zone (name matches LayoutsConfig.id).
 * Fires onRoomChange whenever the player crosses into a different zone.
 */
export function useRoomZoneDetection({
  pos, currentZone, enabled, roomZonesMap, onRoomChange,
}: Opts) {
  const frameRef   = useRef(0);
  const currentRef = useRef<string | null>(null);

  useFrame(() => {
    if (!enabled) return;
    if (++frameRef.current % THROTTLE !== 0) return;

    // Derive floor id from zone name "zone_<floorId>"
    const floorId = currentZone.current.startsWith("zone_")
      ? currentZone.current.slice(5)
      : currentZone.current;
    const zones = roomZonesMap.current.get(floorId) ?? [];
    if (!zones.length) return;

    const p = pos.current;

    // Fast XZ bbox pre-filter
    const candidates = zones.filter(z =>
      p.x >= z.bbox.min.x && p.x <= z.bbox.max.x &&
      p.z >= z.bbox.min.z && p.z <= z.bbox.max.z,
    );

    let next: string | null = currentRef.current;

    if (candidates.length === 1) {
      next = candidates[0].id;
    } else if (candidates.length > 1) {
      // Precision: raycast downward to find exact mesh the player stands on
      _orig.set(p.x, p.y + 0.5, p.z);
      _rc.set(_orig, _down);
      _rc.far = 3;
      const hits = _rc.intersectObjects(candidates.map(c => c.mesh), false);
      if (hits.length > 0) {
        next = (hits[0].object as THREE.Mesh).name;
      } else {
        // Fallback: pick the candidate with the smallest XZ area (most specific room)
        let smallest = Infinity;
        for (const c of candidates) {
          const area = (c.bbox.max.x - c.bbox.min.x) * (c.bbox.max.z - c.bbox.min.z);
          if (area < smallest) { smallest = area; next = c.id; }
        }
      }
    }
    // Zero candidates: player in doorway/threshold — keep previous room

    if (next !== currentRef.current) {
      currentRef.current = next;
      onRoomChange(next);
    }
  });
}
