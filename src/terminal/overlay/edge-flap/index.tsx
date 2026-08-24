"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useShortViewport } from "@/shared/responsive";
import { NAV_GLASS_PANEL } from "../glass-theme";
import { PanelHeader } from "../destination-panel/panel-header";

type Side = "left" | "right";

interface EdgeFlapProps {
  side: Side;
  /** Stacked one letter per line down the flap. */
  label: string;
  title: string;
  subtitle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Set while a detail view is showing — renders the header's back arrow. */
  onBack?: () => void;
  /**
   * Pinned above the scrolling body — a search field, a filter row. It stays
   * put while the list scrolls under it, which is the whole point: a search box
   * that scrolls away is one you have to hunt for after every result.
   */
  toolbar?: ReactNode;
  disabled?: boolean;
  /** Tuck the whole flap off its edge — while walking, and while a
   *  full-screen card owns the view. */
  tucked?: boolean;
  children: ReactNode;
}

/**
 * A vertical tab pinned to one screen edge that slides a panel out beside it.
 *
 * Drawn the way the reference draws its venue tab: the fill is clipped to a
 * shape that is SQUARE on the screen edge and rounded on the inner side, with a
 * crisp stroke on three sides only — so the tab reads as part of the screen
 * border rather than a floating button. `left` and `right` are mirrors of the
 * same geometry.
 *
 * The panel is a FIXED height with its body scrolling inside. Letting it grow
 * with its content meant a thirty-row list ran off the top and bottom of a
 * laptop screen; a fixed frame keeps the header and the list reachable no
 * matter how long the list is.
 *
 * There is no close button: the flap's own tab toggles it, a click anywhere
 * outside dismisses it, and Escape closes it. A dedicated X on top of those
 * three was a fourth way to do the same thing, eating header room the panel
 * needs for its back arrow.
 */
export function EdgeFlap({
  side,
  label,
  title,
  subtitle = "",
  open,
  onOpenChange,
  onBack,
  toolbar,
  disabled,
  tucked,
  children,
}: EdgeFlapProps) {
  const short = useShortViewport();
  const rootRef = useRef<HTMLDivElement>(null);

  // Click-outside + Escape close. Bound only while actually open, so the
  // listeners are not sitting on the document for the whole session.
  useEffect(() => {
    if (!open || disabled) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      // The tab lives inside `rootRef` too, so its own toggle still works
      // instead of being closed here and reopened by its click handler.
      if (target && rootRef.current?.contains(target)) return;
      onOpenChange(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, disabled, onOpenChange]);

  // The flap must stay shorter than the viewport on a landscape phone, so the
  // stacked letters shrink rather than overflow.
  const dim = short
    ? { w: 38, h: Math.min(150, label.length * 17), r: 9 }
    : { w: 52, h: Math.min(260, label.length * 30), r: 12 };

  const offEdge = side === "left" ? "-110%" : "110%";
  const hasHeader = !!onBack || !!title;

  return (
    <div
      ref={rootRef}
      className="fixed top-1/2 z-[220] flex transition-[opacity,transform] duration-[600ms] ease-out"
      style={{
        [side]: 0,
        userSelect: "none",
        transform: tucked ? `translate(${offEdge}, -50%)` : "translate(0, -50%)",
        opacity: tucked ? 0 : 1,
        pointerEvents: tucked ? "none" : undefined,
        flexDirection: side === "left" ? "row" : "row-reverse",
      }}
    >
      <Flap
        dim={dim}
        side={side}
        label={label}
        active={open}
        short={short}
        disabled={disabled}
        onClick={() => !disabled && onOpenChange(!open)}
      />

      {/* Kept mounted and faded rather than unmounted: animating a
          backdrop-filter surface in and out janks, and opacity does not. */}
      <div
        inert={!open}
        className={cn(
          "absolute top-1/2 flex -translate-y-1/2 flex-col overflow-hidden rounded-[14px] transition-opacity duration-[500ms] ease-out short:rounded-[10px]",
          open && !disabled ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        style={{
          ...NAV_GLASS_PANEL,
          border: "1.5px solid var(--nav-border)",
          [side]: dim.w + 10,
          // Never wider than the space left beside the flap on a phone.
          width: `min(340px, calc(100vw - ${dim.w + 26}px))`,
          // A FIXED frame — the body below scrolls inside it.
          height: `min(560px, calc(100dvh - 128px))`,
        }}
      >
        {hasHeader && (
          <div className="shrink-0 px-4 pt-5 sm:px-5 sm:pt-6">
            <PanelHeader title={title} subtitle={subtitle} onBack={onBack} />
          </div>
        )}
        {toolbar && (
          <div className={cn("shrink-0 px-4 sm:px-5", hasHeader ? "pt-3" : "pt-4 sm:pt-5")}>
            {toolbar}
          </div>
        )}
        <div
          className={cn(
            "ui-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4 sm:px-5 sm:pb-5",
            hasHeader || toolbar ? "pt-3" : "pt-4 sm:pt-5",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function Flap({
  dim,
  side,
  label,
  active,
  short,
  disabled,
  onClick,
}: {
  dim: { w: number; h: number; r: number };
  side: Side;
  label: string;
  active: boolean;
  short: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const { w, h, r } = dim;

  // Rounded on the INNER side, square against the screen edge.
  const fillPath =
    side === "right"
      ? `M ${w} 0 L ${r} 0 Q 0 0 0 ${r} L 0 ${h - r} Q 0 ${h} ${r} ${h} L ${w} ${h} Z`
      : `M 0 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} L ${w} ${h - r} Q ${w} ${h} ${w - r} ${h} L 0 ${h} Z`;

  // Stroke three sides only — never the edge that meets the screen border.
  const borderPath =
    side === "right"
      ? `M ${w} 1 L ${1 + r} 1 Q 1 1 1 ${1 + r} L 1 ${h - 1 - r} Q 1 ${h - 1} ${1 + r} ${h - 1} L ${w} ${h - 1}`
      : `M 0 1 L ${w - 1 - r} 1 Q ${w - 1} 1 ${w - 1} ${1 + r} L ${w - 1} ${h - 1 - r} Q ${w - 1} ${h - 1} ${w - 1 - r} ${h - 1} L 0 ${h - 1}`;

  return (
    <button
      type="button"
      title={`${active ? "Hide" : "Show"} ${label.toLowerCase()}`}
      aria-expanded={active}
      disabled={disabled}
      onClick={onClick}
      className="relative shrink-0 transition-colors duration-200 ease-out"
      style={{
        width: w,
        height: h,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          ...(active ? { ...NAV_GLASS_PANEL, background: "var(--nav-accent)" } : NAV_GLASS_PANEL),
          clipPath: `path('${fillPath}')`,
          WebkitClipPath: `path('${fillPath}')`,
        }}
      />
      <svg
        aria-hidden
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        className="pointer-events-none absolute inset-0"
      >
        <path
          d={borderPath}
          fill="none"
          stroke={active ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.16)"}
          strokeWidth={2}
        />
      </svg>
      <span
        className="nav-display absolute inset-0 flex flex-col py-2 short:py-1"
        style={{
          alignItems: "center",
          justifyContent: "space-evenly",
          fontWeight: 500,
          letterSpacing: "1px",
          color: active ? "#ffffff" : "var(--nav-text)",
        }}
      >
        {label.split("").map((character, i) => (
          <span
            key={i}
            className={short ? "block text-[10px] leading-none" : "block text-[15px] leading-none"}
          >
            {character}
          </span>
        ))}
      </span>
    </button>
  );
}
