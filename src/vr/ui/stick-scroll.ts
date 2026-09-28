import { useCallback, useEffect, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { VanillaContainer } from "@react-three/uikit";
import { useXRInputSourceState } from "@react-three/xr";

type ScrollSignal = { value: [number, number] | undefined };

const STICK = {
  deadzone: 0.12,
  pixelsPerSecond: 1500,
  ease: 12,
  maxDelta: 0.05,
} as const;

const PRESS = {
  slopPixels: 14,
} as const;

let target: RefObject<VanillaContainer | null> | null = null;

const drag = { travelled: 0 };

function claim(ref: RefObject<VanillaContainer | null>) {
  target = ref;
}

function release(ref: RefObject<VanillaContainer | null>) {
  if (target === ref) target = null;
}

function clampAxis(value: number, max: number | undefined): number {
  return Math.min(Math.max(0, max ?? 0), Math.max(0, value));
}

function clampScroll(
  ref: RefObject<VanillaContainer | null>,
  x: number,
  y: number,
  position: ScrollSignal,
  event: unknown,
  stick: boolean,
): boolean | undefined {
  const container = ref.current;
  if (!container || event == null) return false;
  const [maxX, maxY] = container.maxScrollPosition.value;
  const cx = clampAxis(x, maxX);
  const cy = clampAxis(y, maxY);
  const [fromX, fromY] = position.value ?? [0, 0];
  drag.travelled += Math.abs(cx - fromX) + Math.abs(cy - fromY);
  if (stick) claim(ref);
  if (cx === x && cy === y) return undefined;
  position.value = [cx, cy];
  return false;
}

export function useScrollArea() {
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

  const onScroll = useCallback(
    (x: number, y: number, position: ScrollSignal, event?: unknown) =>
      clampScroll(ref, x, y, position, event, true),
    [],
  );

  return [ref, onHoverChange, onScroll] as const;
}

export function useDragScroll() {
  const ref = useRef<VanillaContainer>(null);
  const onScroll = useCallback(
    (x: number, y: number, position: ScrollSignal, event?: unknown) =>
      clampScroll(ref, x, y, position, event, false),
    [],
  );
  return [ref, onScroll] as const;
}

export function usePress(onSelect: () => void, disabled = false) {
  const pressed = useRef(false);
  const onPointerDown = useCallback(() => {
    if (disabled) return;
    pressed.current = true;
    drag.travelled = 0;
  }, [disabled]);
  const onPointerUp = useCallback(() => {
    const was = pressed.current;
    pressed.current = false;
    if (was && !disabled && drag.travelled < PRESS.slopPixels) onSelect();
  }, [disabled, onSelect]);
  const onPointerLeave = useCallback(() => {
    pressed.current = false;
  }, []);
  return { onPointerDown, onPointerUp, onPointerLeave };
}
