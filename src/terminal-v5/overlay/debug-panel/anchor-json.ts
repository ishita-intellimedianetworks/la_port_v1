"use client";

import { poseForCamera, type Site, type SiteId } from "@/config";
import type { Vec3 } from "@/config/schema";
import { useNavUiStore } from "../../stores/nav-ui-store";

export interface AnchorTarget {
  kind: "hotspot" | "security";
  id: string;
  name: string;
  path: string;
  position: Vec3;
  rotation: Vec3;
  camera: { position: Vec3; rotation: Vec3 } | null;
}

export interface Framing {
  range: number;
  h: number;
  v: number;
  inFrame: boolean;
}

const DEG = 180 / Math.PI;

export function anchorTargetFor(site: Site, hotspotId: string | null): AnchorTarget | null {
  if (!hotspotId) return null;
  const security = site.securityHotspotById[hotspotId];
  const hotspot = site.hotspotById[hotspotId] ?? security;
  if (!hotspot) return null;
  const camera = hotspot.camera;
  return {
    kind: security ? "security" : "hotspot",
    id: hotspotId,
    name: hotspot.name,
    path: `${security ? "securityHotspots" : "hotspots"}[${hotspotId}].position`,
    position: [...hotspot.position] as Vec3,
    rotation: [...hotspot.rotation] as Vec3,
    camera:
      camera && camera.rotation
        ? { position: [...camera.position] as Vec3, rotation: [...camera.rotation] as Vec3 }
        : null,
  };
}

export function activeAnchorTarget(site: Site): AnchorTarget | null {
  const { selectedHotspotId, hotspotInfo } = useNavUiStore.getState();
  return anchorTargetFor(site, selectedHotspotId ?? hotspotInfo?.hotspotId ?? null);
}

export function framingFor(
  camera: { position: Vec3; rotation: Vec3 },
  anchor: Vec3,
  fovDegrees: number,
): Framing {
  const [pitch, yaw] = poseForCamera(camera).rotation;
  const forward: Vec3 = [
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch),
  ];
  const d: Vec3 = [
    anchor[0] - camera.position[0],
    anchor[1] - camera.position[1],
    anchor[2] - camera.position[2],
  ];
  const range = Math.hypot(d[0], d[1], d[2]) || 1e-6;
  const to: Vec3 = [d[0] / range, d[1] / range, d[2] / range];

  let h = (Math.atan2(-forward[0], -forward[2]) - Math.atan2(-to[0], -to[2])) * DEG;
  while (h > 180) h -= 360;
  while (h < -180) h += 360;
  const v = (Math.asin(to[1]) - Math.asin(forward[1])) * DEG;

  const halfV = fovDegrees / 2;
  const halfH = (Math.atan(Math.tan((fovDegrees / 2) * (Math.PI / 180)) * (16 / 9)) * 180) / Math.PI;
  return {
    range,
    h: Math.abs(h),
    v: Math.abs(v),
    inFrame: Math.abs(h) <= halfH && Math.abs(v) <= halfV,
  };
}

export function formatFraming(f: Framing | null): string {
  if (!f) return "no camera on this row";
  return `${f.range.toFixed(1)}u · ${f.h.toFixed(1)}h / ${f.v.toFixed(1)}v${f.inFrame ? "" : " · OUT OF FRAME"}`;
}

export function formatAnchorPatch(target: AnchorTarget, position: Vec3): string {
  return (
    `// ${target.path}\n` +
    JSON.stringify(position.map((n) => Number(n.toFixed(4))), null, 2)
  );
}

export interface SaveResult {
  ok: boolean;
  path?: string;
  created?: boolean;
  error?: string;
}

export async function saveAnchor(
  site: SiteId,
  target: AnchorTarget,
  position: Vec3,
): Promise<SaveResult> {
  try {
    const res = await fetch("/api/debug/camera", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        site,
        kind: target.kind,
        field: "position",
        id: target.id,
        position: position.map((n) => Number(n.toFixed(4))),
      }),
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
