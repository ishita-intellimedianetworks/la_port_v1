"use client";

/**
 * Hotspot — the marker itself: a small solid bead that breathes, with faint
 * shells pinging outward from it so it reads as live rather than painted on. A
 * white tooltip pill carries the name, and a generous invisible box collider
 * makes it easy to hit.
 *
 * It was a flat disc + ring lying on the surface. A disc disappears the moment
 * you view it edge-on — which, on a wall-mounted marker, is most of the time —
 * and reads as decal rather than object. A sphere has no bad angle.
 *
 * Purely presentational; the parent decides what a click does.
 */

import { useEffect, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { NAV_GLASS } from "../../overlay/glass-theme";

/** Rings in flight at once, evenly staggered through one cycle. */
const PING_COUNT = 2;

interface HotspotProps {
  position: [number, number, number];
  /** Tooltip label (the destination name). */
  title: string;
  /** Click/tap on the marker — opens the centred hotspot info overlay.
   *  Navigation still never happens from a marker (list/map/panel only). */
  onHotspotClick?: () => void;
  /** Centre-circle radius in world units; ring + collider scale off it. */
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
  title,
  onHotspotClick,
  size = 1,
  color = "#ffffff",
  hoverColor = "#ff453a",
  pulse: alwaysPulse = false,
  // Draw through geometry by default: the authored markers sit FLUSH on
  // walls/floors, so with depth testing they z-fight or hide behind any wall
  // between the player and the gate — i.e. invisible most of the time.
  depthTest = false,
}: HotspotProps) {
  const coreRef = useRef<THREE.Mesh>(null);
  const pingRefs = useRef<(THREE.Mesh | null)[]>([]);
  const [hovered, setHovered] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  // Phase, not elapsed time: the pings advance by `delta / period`, so changing
  // the period (resting → selected → hovered) speeds the pulse up from wherever
  // it currently is. Dividing a shared clock by the new period instead made
  // every ring jump position the instant the cursor touched a marker.
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
  useEffect(() => () => { if (tapTimer.current) clearTimeout(tapTimer.current); }, []);
  // Pointer cursor while hovering a CLICKABLE marker (one with onHotspotClick).
  const clickable = !!onHotspotClick;
  useEffect(() => {
    if (!clickable || !hovered) return;
    document.body.style.cursor = "pointer";
    return () => { document.body.style.cursor = ""; };
  }, [clickable, hovered]);

  // Keep the tooltip mounted briefly after hover ends so it can fade out.
  useEffect(() => {
    if (hovered) {
      setTooltipVisible(true);
      return;
    }
    const t = setTimeout(() => setTooltipVisible(false), 300);
    return () => clearTimeout(t);
  }, [hovered]);

  // The pulse: rings that GROW OUT of the bead and fade as they go, the way a
  // radar ping reads, plus a gentle breath on the bead itself.
  //
  // It used to be one shell scaling on a sine between 0.95x and 1.14x. At the
  // distance these markers are actually seen from — their layout checkpoint is
  // 370-460 units back — a 14% wobble on a 3-unit bead is under a pixel of
  // travel, so every marker read as a dead white dot. A ring that leaves the
  // bead and dies at 2-3x its radius is visible at any distance the bead is,
  // because the motion is proportional to the marker, not to a fixed fraction.
  //
  // TWO rings, half a cycle apart: one ring alone is a blink with a long gap
  // after it, and the eye reads the gap as the marker having stopped.
  //
  // Three strengths — resting / selected / hovered — so "which of these did I
  // pick?" is answered by motion rather than by another colour.
  useFrame((_, delta) => {
    const [period, reach, peak, breathRate] = hovered
      ? [0.85, 3.1, 0.5, 5.0]
      : alwaysPulse
        ? [1.35, 2.7, 0.4, 2.6]
        : [2.1, 2.2, 0.26, 1.6];

    phase.current = (phase.current + delta / period) % 1;
    for (let i = 0; i < PING_COUNT; i++) {
      const ring = pingRefs.current[i];
      if (!ring) continue;
      // Stagger the rings evenly through the cycle.
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

  // Sits exactly ON its authored position, with no orientation applied: the
  // markers are authored as POINTS in space (hs_001/hs_002 float 58m above the
  // terminal), not as decals stuck to a surface, and a sphere has no facing to
  // orient anyway. An earlier version rotated the group and pushed the bead one
  // radius along its local +Z to make it rest on a wall — with these poses that
  // normal points straight DOWN, so the nudge buried it instead.
  //
  // The core matches the radius the old flat disc had, because it is seen from
  // its layout's checkpoint 370-460 units away: at 0.62x it was 12px tall on a
  // 1080p screen, which reads as a speck rather than a marker.
  //
  // Drawn unlit in the transparent pass with depthTest off, so it stays legible
  // through geometry the way the disc did. Hover shows the name; a CLICK (when
  // the parent passes onHotspotClick) opens the info overlay.
  return (
    <group position={position}>
      <group>
        {/* The bead. Unlit on purpose: a shaded sphere goes dark on whichever
            side faces away from the sun, and half a marker is not a marker. */}
        <mesh name="hotspot_core" ref={coreRef} renderOrder={9996}>
          <sphereGeometry args={[size, 32, 24]} />
          <meshBasicMaterial color={hovered ? hoverColor : color} transparent opacity={0.98} depthTest={depthTest} depthWrite={false} toneMapped={false} />
        </mesh>
        {/* The pings — faint shells that expand away from the bead and fade
            out. Back faces only, so the bead is seen THROUGH them rather than
            behind a frosted ball, and they never wash the core out as they
            pass over it. Opacity and scale are driven per frame above; the
            values here are only the first frame. */}
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

        {/* Invisible hover/click collider — hover shows the name tooltip; a
            click opens the info overlay (when the parent wires it). Walks /
            teleports never start from a marker. */}
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
          }}
          onClick={(e) => {
            e.stopPropagation();
            onHotspotClick?.();
          }}
        >
          <boxGeometry args={[size * 3.5, size * 3.5, size * 3.5]} />
          <meshBasicMaterial transparent opacity={0} depthTest={depthTest} depthWrite={false} />
        </mesh>
      </group>

      {/* Name pill — anchored at the MARKER CENTRE (outside the rotated group,
          so an oriented disc can't push the anchor sideways/behind) and lifted
          purely in screen space, guaranteeing it always reads ABOVE the
          hotspot from any camera angle. Same glass chip as the nav UI. */}
      {tooltipVisible && (
        <Html position={[0, 0, 0]} center style={{ pointerEvents: "none" }} zIndexRange={[110, 100]}>
          <div
            className="nav-display"
            style={{
              ...NAV_GLASS,
              opacity: hovered ? 1 : 0,
              transition: "opacity 200ms",
              transform: "translateY(-26px)",
              color: "var(--nav-text)",
              padding: "5px 12px",
              borderRadius: 999,
              fontSize: 12,
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
