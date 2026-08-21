"use client";

import React, { useEffect, useState } from "react";

/**
 * InstructionsOverlay — full-screen welcome / instructions panel.
 *
 * Shared by interior (dollhouse) and exterior. Renders a centred title, a
 * row of glass cards each pairing an icon with a short instruction, and a
 * single CTA button.
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

export interface InstructionsOverlayProps {
  visible: boolean;
  title: string;
  instructions: InstructionItem[];
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

export function InstructionsOverlay({
  visible,
  title,
  instructions,
  actionLabel,
  onAction,
  backdropClassName = "bg-black/30",
  cardVariant = "light",
  contained = false,
}: InstructionsOverlayProps) {
  const surfaceClass = cardVariant === "dark" ? "ui-glass" : "ui-white-glass";
  const buttonHoverClass = cardVariant === "dark" ? "hover:bg-white/10" : "hover:bg-white/30";
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

  const content = (
    <>
      <p className="text-white text-[20px] short:text-[14px] font-semibold tracking-wide drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
        {title}
      </p>
      <div className="grid grid-cols-2 gap-4 short:gap-2 max-w-3xl px-6 short:px-2 w-full">
        {instructions.map((item, i) => (
          <div
            key={i}
            className={`${surfaceClass} flex items-center gap-5 short:gap-2.5 px-5 short:px-3 py-3.5 short:py-2 rounded-2xl short:rounded-xl`}
            style={GLASS_BLUR}
          >
            <div
              className={`${surfaceClass} ui-glass--borderless w-10 h-10 short:w-7 short:h-7 flex items-center justify-center rounded-full shrink-0`}
              style={GLASS_BLUR}
            >
              {item.icon}
            </div>
            <p
              className="text-[13px] short:text-[10px] font-semibold tracking-wider leading-tight"
              style={WHITE_TEXT}
            >
              {item.text}
            </p>
          </div>
        ))}
      </div>

      <button
        onClick={onAction}
        className={`${surfaceClass} cursor-pointer px-7 short:px-5 py-2.5 short:py-1.5 rounded-lg text-sm short:text-xs font-semibold ${buttonHoverClass} transition-colors`}
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
          className="instr-panel relative overflow-hidden rounded-3xl px-10 py-9 short:px-5 short:py-4 short:rounded-2xl flex flex-col items-center gap-5 short:gap-3 max-w-fit"
          style={{ ...GLASS_BLUR, ...innerExitStyle(visible) }}
        >
          <div className="instr-panel__pan" aria-hidden />
          <div className="relative z-10 flex flex-col items-center gap-5 short:gap-3 w-full">
            {content}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-5 short:gap-3" style={innerExitStyle(visible)}>{content}</div>
      )}
    </div>
  );
}

export default InstructionsOverlay;
