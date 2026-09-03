"use client";

/**
 * Reading the live camera, and getting it back into the site file — by clipboard
 * or by writing the file.
 *
 * THE ORDER TRAP, which is the whole reason this file exists. The runtime sets
 * every camera with `rotation.set(x, y, z, "YXZ")`, but `layouts[].camera` and
 * `hotspots[].camera` in the site file are authored in **XYZ** — the order
 * `/extract-pos` prints — and `poseForCamera` reorders them on the way in. The
 * two name different orientations as soon as more than one axis is non-zero, so
 * a YXZ triple pasted into the site file puts the camera somewhere else. Every
 * export here is XYZ, converted through the quaternion so the reorder is exact
 * rather than an approximation.
 *
 * Both the copy and the save carry the SAME `{ position, rotation }` — the copy
 * is the save's escape hatch, for when the file is not writable or the edit
 * wants a human's eye on it first, so the two must not be able to disagree.
 */

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

/** Which authored camera the panel is looking at. A hotspot wins over its
 *  layout: travelling to a resource lands on the resource's OWN pose, so that
 *  is the block an edit belongs in. */
export interface CameraTarget {
  kind: "hotspot" | "layout";
  id: string;
  name: string;
  /** Where a saved block goes, as a path a person can search for. */
  path: string;
  /** Aerial poses keep their authored Y; ground ones are seated on the navmesh
   *  (see `goToLayout`). Decides how an edited Y is written back. */
  aerial: boolean;
  /** True when the site file has no camera on this row yet, so saving ADDS one.
   *  Every hotspot ships this way — they inherit their layout's camera — and
   *  adding one is a bigger change than replacing one, so the confirmation
   *  says which it is. */
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

/**
 * The authored camera in play for a given selection, or null when the player is
 * somewhere no camera was authored for (a free walk, a double-click nav).
 *
 * Takes the two ids rather than reading the store, so a React caller can
 * subscribe to exactly what this depends on and memoise against it. The
 * store-reading form is `activeCameraTarget` below, for callbacks.
 */
export function cameraTargetFor(
  site: Site,
  selectedHotspotId: string | null,
  currentDestId: string | null,
): CameraTarget | null {
  if (selectedHotspotId) {
    const hotspot = site.hotspotById[selectedHotspotId];
    if (hotspot) {
      const layout = site.layoutById[hotspot.layoutId];
      return {
        kind: "hotspot",
        id: selectedHotspotId,
        name: hotspot.name,
        path: `hotspots[${selectedHotspotId}].camera`,
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

/** Rounded on the way out, not on the way in: it is float noise from the
 *  quaternion reorder that would otherwise put `-0.18640000000000001` in a
 *  config file, and four places is finer than the camera can be aimed. */
const r = (n: number, d = 4) => Number(n.toFixed(d));
const round3 = (v: Vec3, d = 4): Vec3 => [r(v[0], d), r(v[1], d), r(v[2], d)];

/** The camera block for wherever the camera is now — eye position, XYZ
 *  rotation. Exactly what the site file stores, and exactly what the save
 *  sends. */
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

/**
 * Write the block into THIS MODEL's site file through the dev-only route
 * handler.
 *
 * The site id travels with the request because there are three documents now
 * and the server cannot guess which route the camera was framed on — saving a
 * /v3 shot into /v2's file would move a route nobody was looking at.
 *
 * Saving edits a file every module in the app imports, so the dev server
 * reloads the page — that is not a failure, and it lands you on the pose that
 * was just saved. The caller says so before asking for the confirmation.
 */
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
