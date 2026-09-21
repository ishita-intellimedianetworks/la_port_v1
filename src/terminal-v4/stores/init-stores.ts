import type { Site } from "@/config";
import { useCameraStore } from "@/shared/stores/camera-store";
import { useGradeStore } from "@/shared/stores/grade-store";
import { useSecurityStore } from "./security-store";
import { useSkyStore } from "./sky-store";

export function initStores(site: Site) {
  useCameraStore.init(site);
  useGradeStore.init(site);
  useSkyStore.init(site);
  // Seeds the security layer from `securityHotspots[]` and then owns it: the
  // demo mutates readings and raises incidents, which no file can hold.
  useSecurityStore.init(site);
}
