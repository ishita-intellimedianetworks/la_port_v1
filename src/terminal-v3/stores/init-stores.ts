import type { Site } from "@/config";
import { useCameraStore } from "@/shared/stores/camera-store";
import { useGradeStore } from "@/shared/stores/grade-store";
import { useSkyStore } from "./sky-store";

/**
 * Seed every store whose initial state comes from the site file, for THIS tree.
 *
 * Called from the tree's root during render, before any child renders. It has
 * to be a call rather than an import-time constant because the seeds are per
 * model now — this tree runs `/v3` and reads `sites/v3.json`, and the seeds it
 * takes from there are its own; nothing here can be decided at import.
 *
 * Idempotent for a given site; see `createSeededStore`.
 */
export function initStores(site: Site) {
  useCameraStore.init(site);
  useGradeStore.init(site);
  useSkyStore.init(site);
}
