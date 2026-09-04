"use client";

import React, { useEffect, useState } from "react";

/**
 * InstructionsOverlay — full-screen welcome / instructions panel.
 *
 * Shared by interior (dollhouse) and exterior. Renders a centred title, the
 * instruction tiles (each pairing an icon with a short line), and a single CTA
 * button.
 *
 * Tiles arrive either as one flat list — the dollhouse card, which teaches two
 * gestures — or as labelled GROUPS. The first-person card documents every icon
 * and every bar on screen, and a dozen unlabelled tiles in one slab is a wall:
 * the headings ("Looking around", "While walking", "Bottom bar") are what let a
 * viewer find the one control they are looking at.
 *
 * The overlay fades its opacity 1 → 0 over `FADE_MS` when `visible` flips
 * false, then unmounts. The on-screen fade is what masks the moment the
 * exterior environment (sky/clouds/fog) pops in, and gives the interior
 * dollhouse a clean handoff into first-person.
 */
export interface InstructionItem {
  icon: React.ReactNode;
  text: string;
}

export interface InstructionGroup {
  label: string;
  items: InstructionItem[];
}

export interface InstructionsOverlayProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  /** Flat tile list. Ignored when `groups` is given. */
  instructions?: InstructionItem[];
  /** Labelled blocks of tiles — used by the long first-person card. */
  groups?: InstructionGroup[];
  /** Tiles per row on a normal viewport (2 or 3). Defaults to 2. */
  columns?: number;
  actionLabel: string;
  onAction: () => void;
  /**
   * Backdrop Tailwind class applied to the full-screen container behind the
   * cards. Defaults to `bg-black/30` — same as the original dollhouse
   * overlay, so the model behind shows through as a soft dim wash.
   */
  backdropClassName?: string;
  /**
   * Card surface variant.
   *   "light" (default) → `ui-white-glass` — translucent white tint, used by
   *                       the interior dollhouse where the white cards read
   *                       cleanly over the dollhouse silhouette.
   *   "dark"            → `ui-glass` — translucent black tint with the same
   *                       blur stack. Used by the exterior intro so the
   *                       cards match the rest of the dark exterior UI
   *                       (navbar pill, NodeInfoHud, side panel).
   */
  cardVariant?: "light" | "dark";
  /**
   * When true the title + cards + button are grouped inside ONE compact,
   * padded, blurred black panel (with a slow panning glow behind the cards)
   * that floats over a barely-dimmed scene — instead of the cards sitting
   * loose on a full-screen dim. Used by the exterior intro.
   */
  contained?: boolean;
}

const FADE_MS = 900;

// Inner panel/content exit: a gentle shrink + downward drift alongside the
// opacity fade so the overlay leaves smoothly on Enter rather than blinking out.
const innerExitStyle = (visible: boolean): React.CSSProperties => ({
  transform: visible ? "translateY(0) scale(1)" : "translateY(14px) scale(0.96)",
  transition: `transform ${FADE_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
  willChange: "transform",
});

const WHITE_TEXT: React.CSSProperties = {
  color: "#ffffff",
  textShadow: "0 1px 4px rgba(0,0,0,0.55)",
};

const GLASS_BLUR: React.CSSProperties = {
  backdropFilter: "var(--ui-glass-backdrop)",
  WebkitBackdropFilter: "var(--ui-glass-backdrop)",
};

// Tailwind needs whole class names in the source to emit them, so the column
// count maps to a literal rather than being interpolated.
const GRID_COLS: Record<number, string> = {
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
};

export function InstructionsOverlay({
  visible,
  title,
  subtitle,
  instructions,
  groups,
  columns = 2,
  actionLabel,
  onAction,
  backdropClassName = "bg-black/30",
  cardVariant = "light",
  contained = false,
}: InstructionsOverlayProps) {
  const surfaceClass = cardVariant === "dark" ? "ui-glass" : "ui-white-glass";
  const buttonHoverClass = cardVariant === "dark" ? "hover:bg-white/10" : "hover:bg-white/30";
  const gridClass = GRID_COLS[columns] ?? GRID_COLS[2];
  const [shouldRender, setShouldRender] = useState(visible);
  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      return;
    }
    if (!shouldRender) return;
    const t = window.setTimeout(() => setShouldRender(false), FADE_MS + 20);
    return () => window.clearTimeout(t);
  }, [visible, shouldRender]);

  if (!shouldRender) return null;

  const tile = (item: InstructionItem, i: number) => (
    <div
      key={i}
      className={`${surfaceClass} flex items-center gap-4 short:gap-2.5 px-4 short:px-3 py-3 short:py-2 rounded-2xl short:rounded-xl`}
      style={GLASS_BLUR}
    >
      <div
        className={`${surfaceClass} ui-glass--borderless w-10 h-10 short:w-7 short:h-7 flex items-center justify-center rounded-full shrink-0`}
        style={GLASS_BLUR}
      >
        {item.icon}
      </div>
      <p
        className="text-[12.5px] short:text-[10px] font-semibold tracking-wide leading-snug"
        style={WHITE_TEXT}
      >
        {item.text}
      </p>
    </div>
  );

  // THE BODY IS THE ONLY PART THAT SCROLLS — title and button stay put, so the
  // CTA is reachable however little height there is.
  //
  // This used to be true of the GROUPED body alone, and every card that ships
  // today is a flat `items` list (v3's first-person card is 7 tiles at
  // `columns: 3`), so in practice nothing scrolled. On a phone in landscape the
  // `short:` breakpoint is in force (max-height 540) and the grid resolves to
  // two columns below `lg`, which is four rows — taller than the viewport once
  // the title, subtitle, button and the panel's own padding are counted. The
  // panel is centred inside a container that does not scroll, so the overflow
  // went off BOTH edges and the button went with it.
  //
  // Both branches are now bounded the same way and the panel is capped to the
  // viewport, so the overflow has somewhere to go.
  const bodyScroll =
    "ui-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain [touch-action:pan-y]";
  const body = groups?.length ? (
    // Width budget: the panel caps at 100vw-48px and adds px-10 (short: px-5)
    // of its own padding, so the body must stay inside 100vw-128px (short:
    // 100vw-88px) or the panel's overflow-hidden clips the right-hand column.
    <div className={`${bodyScroll} flex w-[min(920px,calc(100vw-128px))] short:w-[min(760px,calc(100vw-88px))] flex-col gap-4 short:gap-2 px-1`}>
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-2 short:gap-1.5">
          <p
            className="text-[11px] short:text-[9px] font-semibold uppercase tracking-[0.16em] opacity-70"
            style={WHITE_TEXT}
          >
            {group.label}
          </p>
          <div className={`grid ${gridClass} gap-3 short:gap-2`}>{group.items.map(tile)}</div>
        </div>
      ))}
    </div>
  ) : (
    <div className={`${bodyScroll} grid ${gridClass} gap-4 short:gap-2 max-w-3xl px-6 short:px-2 w-full`}>
      {(instructions ?? []).map(tile)}
    </div>
  );

  const content = (
    <>
      <div className="flex shrink-0 flex-col items-center gap-1">
        <p className="text-white text-[20px] short:text-[14px] font-semibold tracking-wide drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
          {title}
        </p>
        {subtitle && (
          <p
            className="text-[12px] short:text-[10px] font-medium tracking-wide opacity-70"
            style={WHITE_TEXT}
          >
            {subtitle}
          </p>
        )}
      </div>

      {body}

      <button
        onClick={onAction}
        className={`${surfaceClass} shrink-0 cursor-pointer px-7 short:px-5 py-2.5 short:py-1.5 rounded-lg text-sm short:text-xs font-semibold ${buttonHoverClass} transition-colors`}
        style={{ ...WHITE_TEXT, ...GLASS_BLUR }}
      >
        {actionLabel}
      </button>
    </>
  );

  return (
    <div
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center ${backdropClassName}`}
      style={{
        opacity: visible ? 1 : 0,
        transition: `opacity ${FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      {contained ? (
        <div
          className="instr-panel relative overflow-hidden rounded-3xl px-10 py-9 short:px-5 short:py-4 short:rounded-2xl flex flex-col items-center gap-5 short:gap-3 max-w-[min(1000px,calc(100vw-48px))] max-h-[calc(100dvh-32px)] short:max-h-[calc(100dvh-16px)]"
          style={{ ...GLASS_BLUR, ...innerExitStyle(visible) }}
        >
          <div className="instr-panel__pan" aria-hidden />
          <div className="relative z-10 flex min-h-0 w-full flex-col items-center gap-5 short:gap-3">
            {content}
          </div>
        </div>
      ) : (
        <div
          className="flex max-h-[calc(100dvh-32px)] short:max-h-[calc(100dvh-16px)] min-h-0 flex-col items-center gap-5 short:gap-3"
          style={innerExitStyle(visible)}
        >
          {content}
        </div>
      )}
    </div>
  );
}

export default InstructionsOverlay;
