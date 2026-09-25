import { useCallback, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { VanillaContainer } from "@react-three/uikit";
import { useXRInputSourceState } from "@react-three/xr";

const DEADZONE = 0.15;
const PIXELS_PER_SECOND = 900;

export function useStickScroll() {
  const ref = useRef<VanillaContainer>(null);
  const hovered = useRef(false);
  const right = useXRInputSourceState("controller", "right");

  useFrame((_, delta) => {
    const container = ref.current;
    if (!container || !hovered.current) return;
    const y = right?.gamepad?.["xr-standard-thumbstick"]?.yAxis ?? 0;
    if (Math.abs(y) < DEADZONE) return;
    const maxY = container.maxScrollPosition.value[1];
    if (maxY == null || maxY <= 0) return;
    const [x, cur] = container.scrollPosition.value ?? [0, 0];
    const next = Math.min(maxY, Math.max(0, cur + y * PIXELS_PER_SECOND * Math.min(delta, 0.1)));
    if (next !== cur) container.scrollPosition.value = [x, next];
  });

  const onHoverChange = useCallback((h: boolean) => {
    hovered.current = h;
  }, []);

  return [ref, onHoverChange] as const;
}
