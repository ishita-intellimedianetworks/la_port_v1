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
 * Its size is held constant ON SCREEN rather than in the world — see BEAD_PX.
 * A fixed world size made the same marker a speck from one layout and a wall
 * from the next, because the checkpoints that frame them stand anywhere from a
 * few metres to 460 units back.
 *
 * Purely presentational; the parent decides what a click does.
 */

import { useEffect, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useCoarsePointer, useIsMobile } from "@/shared/responsive";
import { NAV_GLASS } from "../../overlay/glass-theme";

/** Rings in flight at once, evenly staggered through one cycle. */
const PING_COUNT = 2;

/**
 * How big the bead is ON SCREEN, in CSS pixels across, at any distance.
 *
 * The markers used to be a fixed world size (`hsSize`, 3 units — a 6 m ball),
 * which meant their apparent size was pure range: right at the distance the
 * number was chosen for, a speck from anywhere further, and filling a third of
 * the frame from a few metres away. Since a marker is a piece of UI standing in
 * the world rather than an object in it, the honest rule is the opposite one —
 * hold it constant on screen and let the world size follow the camera.
 *
 * This is the DIAMETER of the solid bead; the pings reach 2.2-3.1x it, so the
 * whole marker occupies roughly 50-75 px. Raise it and every marker grows
 * together, at every distance.
 */
const BEAD_PX = 24;

/** The same figure for a FINGER. A mouse pointer is one pixel; a fingertip
 *  covers ~9 mm of glass and you cannot see through it, so the marker has to be
 *  big enough to aim at with the thing itself hidden under your hand. */
const BEAD_PX_TOUCH = 34;

/** Bounds on the world radius the rule may ask for, as a multiple of the
 *  authored `size`. The floor keeps a marker from collapsing to nothing at the
 *  far end of a long shot; the ceiling stops one from swelling past the object
 *  it labels when the camera is almost inside it.
 *
 *  NOTE which end each one binds. `wanted` GROWS with distance, so MIN_SCALE
 *  bites up close and MAX_SCALE bites far away — i.e. the ceiling is what makes
 *  a distant marker smaller than BEAD_PX, not larger. At 1 it bound almost
 *  every shot in this venue (the layout checkpoints stand 370-460 units back),
 *  which is why the markers read as specks: the constant-screen-size rule was
 *  being clamped away before it could do anything. Touch gets a ceiling high
 *  enough for the rule to actually hold at those ranges. */
const MIN_SCALE = 0.06;
const MAX_SCALE = 1;
const MAX_SCALE_TOUCH = 4;

/** Edge of the invisible hit box, as a multiple of the bead RADIUS — so the
 *  target is `COLLIDER_MULT / 2` times the bead's width on screen, at every
 *  distance. 3.5 gives a 42 px square around a 24 px bead (fine for a mouse);
 *  4 around a 34 px bead gives 68 px, comfortably past the ~44 px minimum a
 *  fingertip needs. */
const COLLIDER_MULT = 3.5;
const COLLIDER_MULT_TOUCH = 4;

/** How far a finger may roll between touchdown and lift and still count as a
 *  tap rather than the start of a camera drag (CSS px). */
const TAP_SLOP_PX = 16;

interface HotspotProps {
  position: [number, number, number];
  /** The authored marker orientation (XYZ euler), straight off `hs_NNN` in the
   *  hotspot GLB. Carried on the group so the marker stands in its authored
   *  frame; the bead itself is a sphere, so nothing is visibly turned by it
   *  until the marker grows a face. */
  rotation?: [number, number, number];
  /** Tooltip label (the destination name). */
  title: string;
  /** Click/tap on the marker — opens the centred hotspot info overlay.
   *  Navigation still never happens from a marker (list/map/panel only). */
  onHotspotClick?: () => void;
  /** Base radius in world units. NOT the size on screen — the frame loop scales
   *  the whole marker so the bead stays BEAD_PX across at any distance, and this
   *  is what that scale is measured against (and what the MIN/MAX_SCALE clamps
   *  bound). Ring + collider are multiples of it. */
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
  // Draw through geometry by default: the authored markers sit FLUSH on
  // walls/floors, so with depth testing they z-fight or hide behind any wall
  // between the player and the gate — i.e. invisible most of the time.
  depthTest = false,
}: HotspotProps) {
  const coreRef = useRef<THREE.Mesh>(null);
  const pingRefs = useRef<(THREE.Mesh | null)[]>([]);
  // The group everything visible hangs off, scaled per frame to hold the marker
  // at BEAD_PX on screen. The tooltip is deliberately OUTSIDE it — an Html pill
  // is screen-space already, and scaling its anchor would move it.
  const sizerRef = useRef<THREE.Group>(null);
  const markerWorld = useRef(new THREE.Vector3());
  const camera = useThree((s) => s.camera);
  // Canvas height in CSS pixels — the units BEAD_PX is expressed in, so the
  // marker is the same size on a laptop and on a 4K monitor.
  const viewportHeight = useThree((s) => s.size.height);
  // Finger or mouse? Both the marker's SIZE and the way a press on it becomes
  // "open the card" differ between the two — see BEAD_PX_TOUCH and the pointer
  // handlers on the collider. Width is folded in alongside the pointer
  // capability so a phone that reports a fine pointer still gets the big
  // targets; a desktop answers neither question true. Kept as two separate
  // calls because `a() || b()` would short-circuit the second hook away.
  const coarsePointer = useCoarsePointer();
  const narrowViewport = useIsMobile();
  const touchUi = coarsePointer || narrowViewport;
  const beadPx = touchUi ? BEAD_PX_TOUCH : BEAD_PX;
  const maxScale = touchUi ? MAX_SCALE_TOUCH : MAX_SCALE;
  const colliderMult = touchUi ? COLLIDER_MULT_TOUCH : COLLIDER_MULT;
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

  // ── Why a tap is opened by hand instead of by `onClick` ────────────────────
  // R3F turns the DOM `click` into a marker hit by RE-RAYCASTING at the click's
  // coordinates, and a browser reports those from where the pointer was LIFTED.
  // A mouse lifts on the pixel it pressed, so on desktop one click always lands.
  // A finger rolls several pixels between touchdown and lift, and against a
  // target this size that roll was enough to miss: the PRESS hit (the name pill
  // appeared — exactly the symptom) while the click behind it raycast into empty
  // space, so nothing opened. The second tap, now aimed at a marker the user
  // could finally see, landed. Hence "one click on PC, two on the phone".
  //
  // So on touch the press is authoritative: it already proved the finger was on
  // the marker, so remember it and watch the WINDOW for the lift. Lift nearby =
  // a tap, and the card opens whatever a fresh raycast would have said; lift far
  // away = the press was the start of a camera drag, and nothing opens.
  const tapUnbind = useRef<(() => void) | null>(null);
  /** When the touch path last opened the card — suppresses the synthesized
   *  `click` that follows, so one tap never opens twice. */
  const tapHandledAt = useRef(0);

  useEffect(() => () => {
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapUnbind.current?.();
  }, []);
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
    // ── Constant screen size ────────────────────────────────────────────────
    // At `dist` from a perspective camera, one CSS pixel spans
    // `2·tan(fov/2)·dist / viewportHeight` world units. Solving that for the
    // radius that draws BEAD_PX across gives the scale below, so the bead is
    // the same size whether the camera is 5 m or 500 m away — and it tracks a
    // live FOV change (the FovDisc) on its own, since fov is read every frame.
    const sizer = sizerRef.current;
    const cam = camera as THREE.PerspectiveCamera;
    if (sizer && cam.isPerspectiveCamera && viewportHeight > 0) {
      sizer.getWorldPosition(markerWorld.current);
      const dist = cam.position.distanceTo(markerWorld.current);
      const worldPerPx = (2 * Math.tan((cam.fov * Math.PI) / 360) * dist) / viewportHeight;
      const wanted = (beadPx / 2) * worldPerPx;
      const s = Math.min(maxScale, Math.max(MIN_SCALE, wanted / size));
      sizer.scale.setScalar(s);
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

  // Sits exactly ON its authored pose — `hs_NNN`'s translation AND rotation,
  // both straight out of the hotspot GLB. The rotation is carried on the group
  // and NOT compensated for anywhere below: the bead is a sphere, so it looks
  // the same whichever way the frame is turned, and everything that would care
  // (the tooltip anchor) is deliberately outside it. Applying it costs nothing
  // and means an oriented marker drops straight in later.
  //
  // What is NOT done is displacing the bead along that frame. An earlier
  // version rotated the group and pushed the bead one radius along its local +Z
  // to make it rest on a wall — with these poses that normal points straight
  // DOWN, so the nudge buried it instead.
  //
  // `size` is only the BASE radius the screen-size rule scales from (see
  // BEAD_PX): what reaches the screen is BEAD_PX across at every distance, and
  // `size` sets where in the clamp range that lands. The ping reach, the breath
  // and the collider are all multiples of it, so they follow automatically.
  //
  // Drawn unlit in the transparent pass with depthTest off, so it stays legible
  // through geometry the way the disc did. Hover shows the name; a CLICK (when
  // the parent passes onHotspotClick) opens the info overlay.
  return (
    <group position={position} rotation={rotation}>
      <group ref={sizerRef}>
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
            // The touch path above already opened this one on the lift.
            if (performance.now() - tapHandledAt.current < 700) return;
            onHotspotClick?.();
          }}
        >
          <boxGeometry args={[size * colliderMult, size * colliderMult, size * colliderMult]} />
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
              // Lifted clear of the BEAD, so it has to grow with it — at the
              // touch size the desktop 26 px put the pill's lower edge inside
              // the marker.
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
