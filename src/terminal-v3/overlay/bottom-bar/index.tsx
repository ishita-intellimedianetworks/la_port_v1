"use client";

import type { ComponentType } from "react";
import { Home, Info, Map as MapIcon, PersonStanding } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_GLASS_PANEL } from "../glass-theme";

interface BottomBarProps {
  visible: boolean;
  /**
   * Slide the whole dock off the bottom edge — set while the Resources panel
   * is open. On a landscape phone that panel is nearly full-height, and the
   * four circles sat right under its bottom-left corner; dropping them out of
   * the way leaves the list the only thing being pressed at. Distinct from
   * `visible`, which is the ordinary fade: this one clears the edge entirely.
   */
  tucked?: boolean;
  mapOpen: boolean;
  onOpenMap: () => void;
  onDollhouse: () => void;
  onInstructions: () => void;
  onHome: () => void;
  /** Drop the player at `cameras.firstPerson` — the one authored standpoint
   *  that is ON the navmesh. Omitted when the site has no such pose, and the
   *  circle then simply isn't drawn. */
  onFirstPerson?: () => void;
  /** Greys the Map circle out and stops it opening the overlay.
   *
   *  KEPT IN THE DOCK RATHER THAN REMOVED, deliberately: pulling a circle
   *  reflows the rest of the row and moves where the muscle memory for Home and
   *  Dollhouse lands. A greyed circle says "not yet"; a missing one silently
   *  rearranges the furniture. First Person takes the opposite route — it is
   *  omitted entirely — because it never shipped, so there is no memory of it
   *  to preserve and nothing to explain. */
  mapDisabled?: boolean;
}

/**
 * The bottom dock: leave the scene (Dollhouse), open the map, re-read the
 * instructions, stand somewhere walkable (First Person), or return home.
 *
 * These are the actions that work from anywhere, which is why they live here
 * rather than in either edge flap — those are scoped to a layout and its
 * hotspots.
 *
 * FREE-STANDING circles, not a pill with buttons inside it: the enclosing dock
 * plus a ring per icon meant two nested glass surfaces reading as one heavy
 * slab. Icons only, no hover label — the tooltip floating above the bar was
 * more chrome than a handful of self-evident glyphs need. `aria-label` still
 * names each one for screen readers.
 *
 * First Person sits next to Home because they are the same KIND of move — a
 * teleport to an authored pose — and differ only in which: Home returns to the
 * composed entry shot, First Person to the one standpoint the navmesh actually
 * covers.
 */
export function BottomBar({
  visible,
  tucked,
  mapOpen,
  onOpenMap,
  onDollhouse,
  onInstructions,
  onHome,
  onFirstPerson,
  mapDisabled,
}: BottomBarProps) {
  const shown = visible && !tucked;
  return (
    <div
      className="fixed bottom-4 left-1/2 z-[210] transition-[opacity,transform] duration-[600ms] ease-out sm:bottom-5 short:bottom-2"
      style={{
        opacity: shown ? 1 : 0,
        // Tucked travels past the screen edge (its own height plus the bottom
        // margin); the plain hidden state only nudges down 12px, because there
        // it is the fade doing the work and a long slide reads as a glitch.
        transform: shown
          ? "translate(-50%, 0)"
          : tucked
            ? "translate(-50%, calc(100% + 24px))"
            : "translate(-50%, 12px)",
        pointerEvents: shown ? undefined : "none",
      }}
    >
      <div className="flex items-center gap-3 short:gap-2">
        <BarButton icon={Home} label="Home" onClick={onHome} />
        {onFirstPerson && (
          <BarButton icon={PersonStanding} label="First Person" onClick={onFirstPerson} />
        )}
        <BarButton icon={DollhouseGlyph} label="Dollhouse" onClick={onDollhouse} />
        <BarButton icon={Info} label="Instructions" onClick={onInstructions} />
        <BarButton icon={MapIcon} label="Map" onClick={onOpenMap} active={mapOpen} disabled={mapDisabled} />
      </div>
    </div>
  );
}

/** Loose enough to take both lucide icons and the local SVG glyph. */
type BarIcon = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

function BarButton({
  icon: Icon,
  label,
  onClick,
  active,
  disabled,
}: {
  icon: BarIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
  /** Sets the NATIVE disabled attribute as well as the styling, so the circle
   *  leaves the tab order too rather than merely being unclickable. */
  disabled?: boolean;
}) {
  // The hover, lifted from the ARCHVIZ dock: the circle grows a bare 5% and its
  // icon warms from 86%-white to pure white over 200ms on the default `ease`.
  // Small on purpose — at 1.1 the circles start colliding with their 12px gaps,
  // and the dock reads as jumping rather than responding. The press is a 1px
  // nudge DOWN with no scale-down, so the button never fights its own hover.
  //
  // Rest colour is a class, not an inline style, so `hover:text-white` can win;
  // the active state is the one case that sets colour inline.
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        // A landscape phone spends its scarce axis on height, and 48px of dock
        // plus its margin is ~17% of a 375px-tall screen. Shrink with the rest
        // of the `short:` chrome (the walking dock and interior Home already
        // drop to 38px) rather than being the one bar that stays full size.
        "flex h-12 w-12 cursor-pointer items-center justify-center rounded-full short:h-10 short:w-10",
        "transition-[scale,translate,color,background-color,border-color] duration-200",
        "hover:scale-105 active:translate-y-px",
        !active && "text-[rgba(255,255,255,0.86)] hover:text-white",
        disabled && "pointer-events-none opacity-40",
      )}
      style={{
        ...NAV_GLASS_PANEL,
        // The circle IS the surface now, so it carries the glass and the ring
        // the dock used to carry.
        background: active ? "var(--nav-accent)" : "var(--nav-glass-strong)",
        border: active ? "1.5px solid rgba(255,255,255,0.5)" : "1.5px solid var(--nav-border)",
        ...(active ? { color: "#ffffff" } : null),
      }}
    >
      <Icon size={20} strokeWidth={1.9} color="currentColor" />
    </button>
  );
}

/** An isometric-box glyph — lucide has no dollhouse/overview equivalent. */
function DollhouseGlyph({ size = 18, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3 3 8v8l9 5 9-5V8z" />
      <path d="m3 8 9 5 9-5" />
      <path d="M12 13v8" />
    </svg>
  );
}
