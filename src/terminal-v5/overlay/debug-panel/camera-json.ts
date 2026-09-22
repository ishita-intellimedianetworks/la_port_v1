"use client";

import * as THREE from "three";
import type { Site, SiteId } from "@/config";
import type { Vec3 } from "@/config/schema";
import { useNavUiStore } from "../../stores/nav-ui-store";

export interface LivePose {
  position: Vec3;
  rotation: Vec3;
}

export interface CameraTarget {
  kind: "hotspot" | "layout";
  id: string;
  name: string;
  path: string;
  aerial: boolean;
  inherited: boolean;
}

export interface CameraPatch {
  position: Vec3;
  rotation: Vec3;
}

const scratch = new THREE.Euler();

function eulerFrom(camera: THREE.Camera, order: "YXZ" | "XYZ"): Vec3 {
  scratch.setFromQuaternion(camera.quaternion, order);
  return [scratch.x, scratch.y, scratch.z];
}

export function readPose(camera: THREE.Camera): LivePose {
  return {
    position: [camera.position.x, camera.position.y, camera.position.z],
    rotation: eulerFrom(camera, "YXZ"),
  };
}

export function cameraTargetFor(
  site: Site,
  selectedHotspotId: string | null,
  currentDestId: string | null,
): CameraTarget | null {
  if (selectedHotspotId) {
    const security = site.securityHotspotById[selectedHotspotId];
    const hotspot = site.hotspotById[selectedHotspotId] ?? security;
    if (hotspot) {
      const layout = site.layoutById[hotspot.layoutId];
      const table = security ? "securityHotspots" : "hotspots";
      return {
        kind: "hotspot",
        id: selectedHotspotId,
        name: hotspot.name,
        path: `${table}[${selectedHotspotId}].camera`,
        aerial: layout?.walkable === false,
        inherited: !hotspot.camera,
      };
    }
  }

  const layout = currentDestId ? site.layoutById[currentDestId] : null;
  if (layout) {
    return {
      kind: "layout",
      id: layout.id,
      name: layout.name,
      path: `layouts[${layout.id}].camera`,
      aerial: layout.walkable === false,
      inherited: false,
    };
  }

  return null;
}

export function activeCameraTarget(site: Site): CameraTarget | null {
  const { selectedHotspotId, currentDest } = useNavUiStore.getState();
  return cameraTargetFor(site, selectedHotspotId, currentDest?.id ?? null);
}

const r = (n: number, d = 4) => Number(n.toFixed(d));
const round3 = (v: Vec3, d = 4): Vec3 => [r(v[0], d), r(v[1], d), r(v[2], d)];

export function buildCameraPatch(camera: THREE.Camera): CameraPatch {
  return {
    position: round3([camera.position.x, camera.position.y, camera.position.z]),
    rotation: round3(eulerFrom(camera, "XYZ")),
  };
}

export function formatCameraPatch(patch: CameraPatch, target: CameraTarget | null): string {
  const head = target ? `// ${target.path}\n` : "// no authored camera selected\n";
  return head + JSON.stringify(patch, null, 2);
}

export interface SaveResult {
  ok: boolean;
  path?: string;
  created?: boolean;
  error?: string;
}

export async function saveCamera(
  site: SiteId,
  target: CameraTarget,
  patch: CameraPatch,
): Promise<SaveResult> {
  try {
    const res = await fetch("/api/debug/camera", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site, kind: target.kind, id: target.id, ...patch }),
    });
    if (res.status === 404 && !res.headers.get("content-type")?.includes("json")) {
      return { ok: false, error: "Saving is dev-only — the route is not served in this build" };
    }
    const body = (await res.json()) as SaveResult;
    if (!res.ok || !body.ok) return { ok: false, error: body.error ?? `HTTP ${res.status}` };
    return body;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
