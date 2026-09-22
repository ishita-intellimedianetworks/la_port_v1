"use client";

import { useEffect, useLayoutEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { acquireGLTF, releaseGLTF } from "@/shared/runtime/dispose-gltf";
import { useNavUiStore } from "../../stores/nav-ui-store";
import { useSecurityStore } from "../../stores/security-store";

const GEOFENCE_COLOR = "#30d158";

export function ZoneGeofence() {
  const hotspotById = useSecurityStore((s) => s.hotspotById);
  const selectedId = useNavUiStore((s) => s.selectedHotspotId);
  const openId = useNavUiStore((s) => s.hotspotInfo?.hotspotId ?? null);

  const id = openId ?? selectedId;
  const geofence = id ? hotspotById[id]?.geofence : undefined;
  if (!geofence) return null;
  return <Geofence url={geofence.url} color={geofence.color ?? GEOFENCE_COLOR} />;
}

function Geofence({ url, color }: { url: string; color: string }) {
  const { scene } = useGLTF(url);
  const tint = useMemo(() => new THREE.Color(color), [color]);

  useLayoutEffect(() => {
    scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.raycast = () => null;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!(m instanceof THREE.Material)) continue;
        m.depthWrite = false;
        if (m instanceof THREE.MeshStandardMaterial) {
          m.color.copy(tint);
          m.emissive.copy(tint);
        }
      }
    });
  }, [scene, tint]);

  useEffect(() => {
    acquireGLTF(url);
    return () => releaseGLTF(url, scene, useGLTF.clear);
  }, [scene, url]);

  return <primitive object={scene} renderOrder={2} />;
}
