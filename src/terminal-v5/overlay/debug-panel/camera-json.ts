"use client";

import * as THREE from "three";
import type { Site, SiteId } from "@/config";
import type { Vec3 } from "@/config/schema";
import { useNavUiStore } from "../../stores/nav-ui-store";

/** The live pose, in the runtime's own terms: world position of the EYE, and a
 *  YXZ euler in radians. */
export interface LivePose {
  position: Vec3;
  /** YXZ `[pitch, yaw, roll]`, radians. */
  rotation: Vec3;
}

export interface CameraTarget {
  kind: "hotspot" | "layout";
  id: string;
  name: string;
  /** Where a saved block goes, as a path a person can search for. */
  path: string;
  /** Aerial poses keep their authored Y; ground ones are seated on the navmesh
   *  (see `goToLayout`). Decides how an edited Y is written back. */
  aerial: boolean;
  inherited: boolean;
}

/** What goes in the file, and on the clipboard. */
export interface CameraPatch {
  position: Vec3;
  /** XYZ, the order the site file stores. */
  rotation: Vec3;
}

const scratch = new THREE.Euler();

/** Read a camera's orientation in an order it was not necessarily set in.
 *  Goes through the quaternion, which is order-free, so this is exact. */
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

/** The same thing, read straight off the store — for callbacks and buttons,
 *  which fire outside React's render and have nothing to subscribe with. */
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

/** The clipboard form: the block, and above it the path it replaces. */
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
    // A 404 here is the production guard, not a missing row — the route is not
    // served outside `next dev`, and saying so beats "Not found".
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
