"use client";

import { useState, type ComponentType } from "react";
import { Home, Info, Map as MapIcon } from "lucide-react";
import { NAV_GLASS_PANEL } from "../glass-theme";

interface BottomBarProps {
  visible: boolean;
  mapOpen: boolean;
  onOpenMap: () => void;
  onDollhouse: () => void;
  onInstructions: () => void;
  onHome: () => void;
}

/**
 * The bottom dock: leave the scene (Dollhouse), open the map, re-read the
 * instructions, or return home.
 *
 * These are the four actions that work from anywhere, which is why they live
 * here rather than in either edge flap — those are scoped to a layout and its
 * hotspots. Icons only, with the name on hover, so the dock stays the same
 * compact size on a phone as on a desktop.
 */
export function BottomBar({
  visible,
  mapOpen,
  onOpenMap,
  onDollhouse,
  onInstructions,
  onHome,
}: BottomBarProps) {
  return (
    <div
      className="fixed bottom-4 left-1/2 z-[210] transition-[opacity,transform] duration-[600ms] ease-out sm:bottom-5"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translate(-50%, 0)" : "translate(-50%, 12px)",
        pointerEvents: visible ? undefined : "none",
      }}
    >
      <div
        className="flex items-center gap-2 rounded-full p-2 sm:gap-2.5 sm:p-2.5"
        style={{ ...NAV_GLASS_PANEL, border: "1.5px solid var(--nav-border)" }}
      >
        <BarButton icon={DollhouseGlyph} label="Dollhouse" onClick={onDollhouse} />
        <BarButton icon={MapIcon} label="Map" onClick={onOpenMap} active={mapOpen} />
        <BarButton icon={Info} label="Instructions" onClick={onInstructions} />
        <BarButton icon={Home} label="Home" onClick={onHome} />
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
}: {
  icon: BarIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  // Hover state drives the label rather than `title`, so it appears instantly
  // and matches the rest of the UI instead of the OS tooltip.
  const [hovered, setHovered] = useState(false);

  return (
    <span className="relative flex">
      {/* The label floats ABOVE the dock so showing it never changes the dock's
          size — a bar that grows under the cursor is hard to aim at. */}
      <span
        aria-hidden
        className="nav-body pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium transition-opacity duration-150"
        style={{
          ...NAV_GLASS_PANEL,
          border: "1.5px solid var(--nav-border)",
          color: "var(--nav-text)",
          opacity: hovered ? 1 : 0,
        }}
      >
        {label}
      </span>

      <button
        type="button"
        onClick={onClick}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        aria-label={label}
        aria-pressed={active}
        className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white/[0.14] sm:h-12 sm:w-12"
        style={{
          background: active ? "var(--nav-accent)" : "rgba(255,255,255,0.05)",
          // Every icon carries its own ring, so each reads as a distinct target
          // rather than a glyph floating on the dock.
          border: active ? "1.5px solid rgba(255,255,255,0.5)" : "1.5px solid rgba(255,255,255,0.18)",
          color: active ? "#ffffff" : "var(--nav-text)",
        }}
      >
        <Icon size={19} strokeWidth={2} color="currentColor" />
      </button>
    </span>
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
