/**
 * usePortalRaycast
 * ─────────────────────────────────────────────────────────────────────────────
 * Single-click raycast that enters an interior. On click (not a drag) it
 * raycasts into the scene and, for each hit, walks UP the parent chain looking
 * for an Object3D whose name matches one of the active floor's
 * `transitions[].meshName`. First match → `onEnter(transition)`.
 *
 * Heavily logged under the `[portal]` tag so it's debuggable in the browser
 * console (the GLB node that owns a mesh is often a parent of the hit Mesh, so
 * the parent-walk + the "hit … (no match)" log tell you the real names).
 */
import { useEffect, useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import type { FloorTransition } from "@/shared/types";

// Same opt-in as the rest of the scene debug logging (?debug=true).
const DEBUG = typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("debug") === "true";

interface PortalRaycastOptions {
  gl: { domElement: HTMLElement };
  camera: THREE.Camera;
  raycaster: THREE.Raycaster;
  scene: THREE.Scene;
  enabled: boolean;
  transitions: FloorTransition[];
  onEnter: (t: FloorTransition) => void;
}

export function usePortalRaycast({
  gl, camera, raycaster, scene, enabled, transitions, onEnter,
}: PortalRaycastOptions) {
  // Always-current refs so listeners stay stable across callback/data changes.
  const onEnterRef = useRef(onEnter);
  useLayoutEffect(() => { onEnterRef.current = onEnter; });
  const transitionsRef = useRef(transitions);
  useLayoutEffect(() => { transitionsRef.current = transitions; });

  useEffect(() => {
    if (!enabled) return;
    const dom = gl.domElement;
    let drag = false, sx = 0, sy = 0;

    const onDown = (e: PointerEvent) => { drag = false; sx = e.clientX; sy = e.clientY; };
    const onMove = (e: PointerEvent) => {
      if (e.buttons === 1 && (Math.abs(e.clientX - sx) > 5 || Math.abs(e.clientY - sy) > 5)) drag = true;
    };

    const onClick = (e: MouseEvent) => {
      const ts = transitionsRef.current;
      if (drag || ts.length === 0) return;

      const rect = dom.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        ((e.clientY - rect.top) / rect.height) * -2 + 1,
      );
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      if (!hits.length) { if (DEBUG) console.log("[portal] click → no scene hits"); return; }

      const byName = new Map(ts.map((t) => [t.meshName, t]));
      for (const h of hits) {
        let o: THREE.Object3D | null = h.object;
        while (o) {
          const t = byName.get(o.name);
          if (t) {
            if (DEBUG) console.log(`[portal] ✅ hit "${o.name}" → entering "${t.targetFloorId}"`);
            onEnterRef.current(t);
            return;
          }
          o = o.parent;
        }
      }
      if (DEBUG) console.log(
        `[portal] hit "${hits[0].object.name || "(unnamed)"}" — no portal match. ` +
        `Looking for: ${[...byName.keys()].join(", ")}`,
      );
    };

    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("click", onClick);
    return () => {
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("click", onClick);
    };
  }, [gl, camera, raycaster, scene, enabled]);
}
