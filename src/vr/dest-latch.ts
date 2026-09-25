import { useEffect, useRef } from "react";
import type { DestinationCategory, DestinationsByCategory } from "@/shared/types";

const REACH_UNITS = 0.8;
const POLL_MS = 200;

type Latched = { id: string; label: string; category: DestinationCategory; option?: string };

interface LatchStore {
  currentDest: { id: string; category: DestinationCategory } | null;
  hotspotInfo: { destId: string } | null;
  setCurrentDest: (dest: Latched | null) => void;
  setAtHome: (v: boolean) => void;
  setHotspotInfo: (v: null) => void;
}

interface Walker {
  getPosition: () => { x: number; z: number };
}

export function useDestLatch({
  active,
  controller,
  dests,
  categories,
  home,
  getStore,
}: {
  active: boolean;
  controller: () => Walker | null;
  dests: DestinationsByCategory | undefined;
  categories: readonly { key: DestinationCategory }[];
  home: readonly number[];
  getStore: () => LatchStore;
}) {
  const live = useRef({ controller, dests, categories, home, getStore });
  useEffect(() => {
    live.current = { controller, dests, categories, home, getStore };
  });

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      const { controller: ctrlOf, dests: all, categories: cats, home: hp, getStore: storeOf } = live.current;
      const ctrl = ctrlOf();
      if (!ctrl) return;
      const store = storeOf();
      const p = ctrl.getPosition();
      store.setAtHome(Math.hypot(p.x - hp[0], p.z - hp[2]) < REACH_UNITS);

      const prev = store.currentDest;
      if (prev && all) {
        const cam = all[prev.category]?.find((x) => x.id === prev.id)?.camera;
        if (cam && Math.hypot(p.x - cam.position[0], p.z - cam.position[2]) < REACH_UNITS) return;
      }
      let cur: Latched | null = null;
      let best = REACH_UNITS;
      if (all) {
        for (const c of cats) {
          for (const dest of all[c.key] ?? []) {
            if (!dest.camera) continue;
            const d = Math.hypot(p.x - dest.camera.position[0], p.z - dest.camera.position[2]);
            if (d < best) {
              best = d;
              cur = { id: dest.id, label: dest.label, category: c.key, option: dest.option };
            }
          }
        }
      }
      if (prev?.id === cur?.id) return;
      store.setCurrentDest(cur);
      if (store.hotspotInfo && store.hotspotInfo.destId !== cur?.id) store.setHotspotInfo(null);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [active]);
}
