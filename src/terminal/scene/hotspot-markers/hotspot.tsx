"use client";

/**
 * Hotspot — the marker itself, styled after the reference design: a small
 * solid white centre circle + a thin outer ring lying flat (static rotation,
 * NO billboard/lookAt), a hover pulse on the ring, a white tooltip pill with
 * the destination name, and a generous invisible box collider so it's easy to
 * hit. Purely presentational — the parent decides what a click does.
 */

import { useEffect, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { NAV_GLASS } from "../../overlay/glass-theme";

const _ONE = new THREE.Vector3(1, 1, 1);

interface HotspotProps {
  position: [number, number, number];
  /** Authored marker orientation (XYZ euler turning the +Z-facing disc onto
   *  the surface it marks). Omitted = lie flat on the ground. */
  rotation?: [number, number, number];
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
  /** Continuously pulse the ring even when not hovered (fly-view markers). */
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
  // Draw through geometry by default: the authored markers sit FLUSH on
  // walls/floors, so with depth testing they z-fight or hide behind any wall
  // between the player and the gate — i.e. invisible most of the time.
  depthTest = false,
}: HotspotProps) {
  const ringRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const pulse = useRef(0);
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

  // Ring pulse: faster/tighter while hovered; a slower continuous breathe when
  // `pulse` is set (fly-view markers); otherwise ease back to rest.
  useFrame((_, delta) => {
    const ring = ringRef.current;
    if (!ring) return;
    if (hovered) {
      pulse.current += delta * 5;
      const s = 1 + Math.sin(pulse.current) * 0.1;
      ring.scale.setScalar(s);
    } else if (alwaysPulse) {
      pulse.current += delta * 2.2;
      const s = 1 + Math.sin(pulse.current) * 0.18;
      ring.scale.setScalar(s);
    } else {
      ring.scale.lerp(_ONE, 0.1);
    }
  });

  // The real hotspot visual: a solid white centre circle + thin outer ring at
  // the AUTHORED rotation (the GLB's oriented plane; no rotation = flat on the
  // ground). Lifted slightly off the surface so it never z-fights; drawn in
  // the transparent pass after the model; depthTest off = visible through
  // walls. Hover shows the name; a CLICK (when the parent passes
  // onHotspotClick) opens the info overlay — never a walk/teleport.
  return (
    <group position={position}>
      <group rotation={rotation ?? [-Math.PI / 2, 0, -Math.PI / 2]}>
        <mesh name="hotspot_center_circle" position={[0, 0, 0.06]} renderOrder={9996}>
          <circleGeometry args={[size, 64]} />
          <meshBasicMaterial color={hovered ? hoverColor : color} transparent opacity={0.95} side={THREE.DoubleSide} depthTest={depthTest} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh name="hotspot_outside_ring" ref={ringRef} position={[0, 0, 0.06]} renderOrder={9996}>
          <ringGeometry args={[size * (4 / 3), size * (47 / 30), 64]} />
          <meshBasicMaterial color={hovered ? hoverColor : color} transparent opacity={0.95} side={THREE.DoubleSide} depthTest={depthTest} depthWrite={false} toneMapped={false} />
        </mesh>

        {/* Invisible hover/click collider — hover shows the name tooltip; a
            click opens the info overlay (when the parent wires it). Walks /
            teleports never start from a marker. */}
        <mesh
          name="hotspot_hover_collider"
          position={[0, 0, size]}
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
          <boxGeometry args={[size * 4, size * 4, size * 2]} />
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
