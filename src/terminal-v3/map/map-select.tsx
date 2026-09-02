"use client";

/**
 * MapSelect — the compact-map design's selector control: a pill with a neutral
 * glass icon tile, the current label and a rotating caret, opening an OPAQUE
 * dark popover list below it. Rows carry the app's shared icons; blue appears
 * ONLY on the selected row. Used twice, side by side, on the list-mode
 * (memorial) map: Category and Sub-category. The village map keeps its radio
 * column instead.
 *
 * The popover is PORTALED to <body> and positioned fixed under the pill: the
 * map window clips its children (overflow + the glass backdrop-filter makes it
 * the containing block even for position:fixed), which on phones cut the list
 * to ~2 visible rows behind a second nested scroll. The portal escapes the
 * window entirely and sizes to the real viewport space below the pill.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { SHORT_MEDIA_QUERY } from "@/shared/responsive";

export interface MapSelectItem {
  id: string | null;
  label: string;
  /** Row icon — same glyphs used across the app; neutral unless selected. */
  icon?: LucideIcon;
}

interface MapSelectProps {
  icon: LucideIcon;
  items: MapSelectItem[];
  value: string | null;
  onSelect: (id: string | null) => void;
}

export function MapSelect({ icon: Icon, items, value, onSelect }: MapSelectProps) {
  const [open, setOpen] = useState(false);
  const [pop, setPop] = useState<{ left: number; top: number; width: number; maxH: number; side: boolean } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const place = () => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return;
    // Phone (landscape): open the list BESIDE the pill, using the full screen
    // height — below-the-pill placement stacked a popover scroll on top of the
    // window/legend scrolls, and clipped the list to a couple of rows.
    const short = window.matchMedia(SHORT_MEDIA_QUERY).matches;
    if (short) {
      // Width = the longest label, MEASURED (CSS max-content collapses here —
      // the rows are w-full, which is circular inside a max-content box and
      // squeezed the list to one letter + ellipsis).
      let maxText = 0;
      const cx = document.createElement("canvas").getContext("2d");
      if (cx) {
        cx.font = "600 11.5px system-ui, -apple-system, sans-serif";
        for (const it of items) maxText = Math.max(maxText, cx.measureText(it.label).width);
      }
      const w = Math.max(150, Math.ceil(maxText) + 58);
      const top = Math.max(8, r.top);
      setPop({
        left: Math.min(r.right + 8, window.innerWidth - w - 10),
        top,
        width: w,
        maxH: window.innerHeight - top - 10,
        side: true,
      });
    } else {
      setPop({
        left: r.left,
        top: r.bottom + 4,
        width: r.width,
        maxH: Math.max(110, window.innerHeight - r.bottom - 14),
        side: false,
      });
    }
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    // Keep the popover glued to the pill if the window resizes/rotates or any
    // ancestor scrolls (the map window scrolls on phones) — capture phase
    // catches scrolls of inner containers too.
    const onMove = () => place();
    document.addEventListener("pointerdown", onDoc);
    window.addEventListener("resize", onMove);
    document.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      window.removeEventListener("resize", onMove);
      document.removeEventListener("scroll", onMove, true);
    };
  }, [open]);

  const current = items.find((i) => i.id === value) ?? items[0];
  if (!current) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (!open) place();
          setOpen((o) => !o);
        }}
        className="flex w-full cursor-pointer items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.14] short:gap-1.5 short:rounded-[9px] short:px-2 short:py-1.5"
        style={{ background: "rgba(255,255,255,0.1)" }}
      >
        {/* Neutral icon tile — same glass tone as the control, no accent. */}
        <span
          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] short:h-[18px] short:w-[18px] short:rounded-[5px]"
          style={{ background: "rgba(255,255,255,0.12)" }}
        >
          <Icon size={15} strokeWidth={1.9} color="var(--nav-text)" className="short:h-[11px] short:w-[11px]" />
        </span>
        {/* Full label — wraps at WORD boundaries only (break-words split
            "Layouts" letter-by-letter in a squeezed pill), never truncates. */}
        <span className="nav-display min-w-0 flex-1 text-[12.5px] font-semibold leading-tight text-white short:text-[11px]">
          {current.label}
        </span>
        {/* Caret — bright + a fixed slot so it never gets crowded out by long
            truncated labels (was a dim grey that read as invisible). */}
        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center short:h-[14px] short:w-[14px]">
          <ChevronDown
            size={17}
            strokeWidth={2.4}
            color="var(--nav-text)"
            className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {open && pop &&
        createPortal(
          <div
            ref={popRef}
            className="ui-scrollbar flex flex-col gap-px overflow-y-auto overscroll-contain rounded-[14px] p-1.5"
            style={{
              position: "fixed",
              left: pop.left,
              top: pop.top,
              // Pill width on desktop; measured longest-label width on phones
              // (side placement) so every option reads in full.
              width: pop.width,
              maxHeight: pop.side ? pop.maxH : Math.min(280, pop.maxH),
              zIndex: 400,
              WebkitOverflowScrolling: "touch",
              background: "rgb(38,38,42)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
            }}
          >
            {items.map((it) => {
              const on = it.id === value;
              const RowIcon = it.icon;
              return (
                <button
                  key={it.id ?? "__all"}
                  type="button"
                  onClick={() => { onSelect(it.id); setOpen(false); }}
                  className="flex w-full shrink-0 cursor-pointer items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left transition-colors hover:bg-white/[0.06] short:py-1.5"
                  style={{ background: on ? "rgba(10,132,255,0.22)" : "transparent" }}
                >
                  {RowIcon ? (
                    <RowIcon size={14} strokeWidth={2} color={on ? "#ffffff" : "var(--nav-text-2)"} className="shrink-0" />
                  ) : (
                    <span
                      className="h-[6px] w-[6px] shrink-0 rounded-full"
                      style={{ background: on ? "#0a84ff" : "rgba(255,255,255,0.3)" }}
                    />
                  )}
                  {/* Full label — never truncated; wraps if it beats maxWidth. */}
                  <span className="nav-body min-w-0 flex-1 break-words text-[12.5px] font-semibold leading-snug short:text-[11.5px]" style={{ color: on ? "#ffffff" : "#c7c7cc" }}>
                    {it.label}
                  </span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
