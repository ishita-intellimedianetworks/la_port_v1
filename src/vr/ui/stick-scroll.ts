import { useCallback, useEffect, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { VanillaContainer } from "@react-three/uikit";
import { useXRInputSourceState } from "@react-three/xr";

const STICK = {
  deadzone: 0.12,
  pixelsPerSecond: 1500,
  ease: 12,
  maxDelta: 0.05,
} as const;

let target: RefObject<VanillaContainer | null> | null = null;

function claim(ref: RefObject<VanillaContainer | null>) {
  target = ref;
}

function release(ref: RefObject<VanillaContainer | null>) {
  if (target === ref) target = null;
}

export function useStickScroll() {
  const ref = useRef<VanillaContainer>(null);
  const speed = useRef(0);
  const right = useXRInputSourceState("controller", "right");

  useEffect(() => {
    claim(ref);
    return () => release(ref);
  }, []);

  useFrame((_, delta) => {
    const container = ref.current;
    if (!container || target !== ref) return;
    const raw = right?.gamepad?.["xr-standard-thumbstick"]?.yAxis ?? 0;
    const y = Math.abs(raw) < STICK.deadzone ? 0 : raw * Math.abs(raw);
    const dt = Math.min(delta, STICK.maxDelta);
    speed.current += (y * STICK.pixelsPerSecond - speed.current) * Math.min(1, dt * STICK.ease);
    if (Math.abs(speed.current) < 1) {
      speed.current = 0;
      return;
    }
    const maxY = container.maxScrollPosition.value[1];
    if (maxY == null || maxY <= 0) return;
    const [x, cur] = container.scrollPosition.value ?? [0, 0];
    const next = Math.min(maxY, Math.max(0, cur + speed.current * dt));
    if (next !== cur) container.scrollPosition.value = [x, next];
  });

  const onHoverChange = useCallback((h: boolean) => {
    if (h) claim(ref);
  }, []);

  return [ref, onHoverChange] as const;
}

export const noDragScroll = () => false;
