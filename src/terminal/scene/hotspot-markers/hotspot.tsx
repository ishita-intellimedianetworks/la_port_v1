"use client";

import { useEffect, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useCoarsePointer, useIsMobile } from "@/shared/responsive";
import { NAV_GLASS } from "../../overlay/glass-theme";
import { markerScale } from "@/shared/runtime/marker-scale";

/** Rings in flight at once, evenly staggered through one cycle. */
const PING_COUNT = 2;

const BEAD_PX = 24;

const BEAD_PX_TOUCH = 26;

const MIN_SCALE = 0.06;
const MAX_SCALE = 1;
const MAX_SCALE_TOUCH = 4;

const COLLIDER_MULT = 3.5;
const COLLIDER_MULT_TOUCH = 5.2;

/** How far a finger may roll between touchdown and lift and still count as a
 *  tap rather than the start of a camera drag (CSS px). */
const TAP_SLOP_PX = 16;

interface HotspotProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  /** Tooltip label (the destination name). */
  title: string;
  /** Click/tap on the marker — opens the centred hotspot info overlay.
   *  Navigation still never happens from a marker (list/map/panel only). */
  onHotspotClick?: () => void;
  size?: number;
  color?: string;
  /** Disc + ring colour while hovered (defaults to red). */
  hoverColor?: string;
  /** Pulse harder than the resting rate — set for the SELECTED marker, so the
   *  one being discussed is picked out by motion rather than by a second colour. */
  pulse?: boolean;
  /** false = draw through walls (kept true by default, like the reference). */
  depthTest?: boolean;
}

export function Hotspot({
  position,
  rotation,
  title,
  onHotspotClick,
  size = 1,
  color = "#ffffff",
  hoverColor = "#ff453a",
  pulse: alwaysPulse = false,
  depthTest = false,
}: HotspotProps) {
  const coreRef = useRef<THREE.Mesh>(null);
  const pingRefs = useRef<(THREE.Mesh | null)[]>([]);
  const sizerRef = useRef<THREE.Group>(null);
  const markerWorld = useRef(new THREE.Vector3());
  const cameraWorld = useRef(new THREE.Vector3());
  const camera = useThree((s) => s.camera);
  // Canvas height in CSS pixels — the units BEAD_PX is expressed in, so the
  // marker is the same size on a laptop and on a 4K monitor.
  const viewportHeight = useThree((s) => s.size.height);
  const coarsePointer = useCoarsePointer();
  const narrowViewport = useIsMobile();
  const touchUi = coarsePointer || narrowViewport;
  const beadPx = touchUi ? BEAD_PX_TOUCH : BEAD_PX;
  const maxScale = touchUi ? MAX_SCALE_TOUCH : MAX_SCALE;
  const colliderMult = touchUi ? COLLIDER_MULT_TOUCH : COLLIDER_MULT;
  const [hovered, setHovered] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const phase = useRef(0);
  const breath = useRef(0);
  // Touch has no hover — a TAP on the marker shows the name pill for a couple
  // of seconds instead (auto-hides; a second tap restarts the timer).
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showByTap = () => {
    setHovered(true);
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => setHovered(false), 2200);
  };

  const tapUnbind = useRef<(() => void) | null>(null);
  /** When the touch path last opened the card — suppresses the synthesized
   *  `click` that follows, so one tap never opens twice. */
  const tapHandledAt = useRef(0);

  useEffect(() => () => {
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapUnbind.current?.();
  }, []);
  const clickable = !!onHotspotClick;
  useEffect(() => {
    if (!clickable || !hovered) return;
    document.body.style.cursor = "pointer";
    return () => { document.body.style.cursor = ""; };
  }, [clickable, hovered]);

  useEffect(() => {
    if (hovered) {
      setTooltipVisible(true);
      return;
    }
    const t = setTimeout(() => setTooltipVisible(false), 300);
    return () => clearTimeout(t);
  }, [hovered]);

  useFrame((_, delta) => {
    const sizer = sizerRef.current;
    const cam = camera as THREE.PerspectiveCamera;
    if (sizer && cam.isPerspectiveCamera && viewportHeight > 0) {
      sizer.getWorldPosition(markerWorld.current);
      const dist = cam.getWorldPosition(cameraWorld.current).distanceTo(markerWorld.current);
      const worldPerPx = (2 * Math.tan((cam.fov * Math.PI) / 360) * dist) / viewportHeight;
      const wanted = (beadPx / 2) * worldPerPx;
      const s = Math.min(maxScale, Math.max(MIN_SCALE, wanted / size));
      sizer.scale.setScalar(s * markerScale.value);
    }

    const [period, reach, peak, breathRate] = hovered
      ? [0.85, 3.1, 0.5, 5.0]
      : alwaysPulse
        ? [1.35, 2.7, 0.4, 2.6]
        : [2.1, 2.2, 0.26, 1.6];

    phase.current = (phase.current + delta / period) % 1;
    for (let i = 0; i < PING_COUNT; i++) {
      const ring = pingRefs.current[i];
      if (!ring) continue;
      const t = (phase.current + i / PING_COUNT) % 1;
      // Ease-out on the travel so the ring leaves the bead quickly and drifts
      // to a stop, and a squared fade so it is gone well before it turns over.
      ring.scale.setScalar(1 + (reach - 1) * (1 - (1 - t) * (1 - t)));
      (ring.material as THREE.MeshBasicMaterial).opacity = peak * (1 - t) * (1 - t);
    }

    // The bead breathes too — a ring leaving a perfectly still dot looks like
    // an effect played over scenery rather than the marker being alive.
    const core = coreRef.current;
    if (core) {
      breath.current += delta * breathRate;
      core.scale.setScalar(1 + Math.sin(breath.current) * 0.055);
    }
  });

  return (
    <group position={position} rotation={rotation}>
      <group ref={sizerRef}>
        {/* The bead. Unlit on purpose: a shaded sphere goes dark on whichever
            side faces away from the sun, and half a marker is not a marker. */}
        <mesh name="hotspot_core" ref={coreRef} renderOrder={9996}>
          <sphereGeometry args={[size, 32, 24]} />
          <meshBasicMaterial color={hovered ? hoverColor : color} transparent opacity={0.98} depthTest={depthTest} depthWrite={false} toneMapped={false} />
        </mesh>
        {Array.from({ length: PING_COUNT }, (_, i) => (
          <mesh
            key={i}
            name={`hotspot_ping_${i}`}
            ref={(m) => { pingRefs.current[i] = m; }}
            renderOrder={9995 - i}
          >
            <sphereGeometry args={[size * 1.12, 32, 24]} />
            <meshBasicMaterial
              color={hovered ? hoverColor : color}
              transparent
              opacity={0}
              side={THREE.BackSide}
              depthTest={depthTest}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        ))}

        <mesh
          name="hotspot_hover_collider"
          renderOrder={9997}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(true);
          }}
          onPointerOut={() => setHovered(false)}
          onPointerDown={(e) => {
            // Phone: tap shows the label (no hover there). Swallow the event so
            // the tap doesn't also register as a scene drag start.
            e.stopPropagation();
            showByTap();
            if (e.pointerType === "mouse") return;
            tapUnbind.current?.();
            const start = { x: e.clientX, y: e.clientY, id: e.pointerId };
            const onUp = (ev: PointerEvent) => {
              tapUnbind.current?.();
              if (ev.pointerId !== start.id) return;
              if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > TAP_SLOP_PX) return;
              tapHandledAt.current = performance.now();
              onHotspotClick?.();
            };
            // A cancel means the gesture was taken over (a pinch, a scroll) —
            // unbind without opening anything.
            const onCancel = () => tapUnbind.current?.();
            tapUnbind.current = () => {
              window.removeEventListener("pointerup", onUp);
              window.removeEventListener("pointercancel", onCancel);
              tapUnbind.current = null;
            };
            window.addEventListener("pointerup", onUp);
            window.addEventListener("pointercancel", onCancel);
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (performance.now() - tapHandledAt.current < 700) return;
            onHotspotClick?.();
          }}
        >
          <boxGeometry args={[size * colliderMult, size * colliderMult, size * colliderMult]} />
          <meshBasicMaterial transparent opacity={0} depthTest={depthTest} depthWrite={false} />
        </mesh>
      </group>

      {tooltipVisible && (
        <Html position={[0, 0, 0]} center style={{ pointerEvents: "none" }} zIndexRange={[110, 100]}>
          <div
            className="nav-display"
            style={{
              ...NAV_GLASS,
              opacity: hovered ? 1 : 0,
              transition: "opacity 200ms",
              transform: `translateY(${touchUi ? -34 : -26}px)`,
              color: "var(--nav-text)",
              padding: touchUi ? "6px 14px" : "5px 12px",
              borderRadius: 999,
              fontSize: touchUi ? 13 : 12,
              fontWeight: 600,
              whiteSpace: "nowrap",
              userSelect: "none",
            }}
          >
            {title}
          </div>
        </Html>
      )}
    </group>
  );
}
