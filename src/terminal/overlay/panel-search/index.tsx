"use client";

import { Search, X } from "lucide-react";

interface PanelSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Named for screen readers — the field carries no visible label. */
  label?: string;
}

/**
 * The search field that sits above a panel's list, carried over from the admin
 * tool's Resources drawer: one plain text box at the top, filtering the tree
 * live as it is typed.
 *
 * Pointer events STOP HERE. The 3D canvas underneath binds pointerdown for
 * look-drag and dblclick for walk-here, and both fire through an overlay that
 * does not swallow them — so without this, dragging to select the text you just
 * typed spun the camera, and double-clicking a word walked the player away from
 * whatever they were searching for.
 *
 * The flap's root sets `user-select: none` (it is chrome, not copy), which also
 * kills selection inside a nested input — so text selection is re-enabled here.
 */
export function PanelSearch({
  value,
  onChange,
  placeholder = "Search",
  label = "Search resources",
}: PanelSearchProps) {
  return (
    <div
      className="flex h-9 items-center gap-2 rounded-[10px] px-2.5"
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1.5px solid var(--nav-border)",
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <Search size={15} strokeWidth={2.2} style={{ color: "var(--nav-text-dim)" }} className="shrink-0" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        // Escape clears the box rather than bubbling to the flap's document
        // handler, which would close the whole panel on the first press.
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.stopPropagation();
            onChange("");
          }
        }}
        className="nav-body min-w-0 flex-1 bg-transparent text-[13px] font-normal outline-none placeholder:opacity-60"
        style={{ color: "var(--nav-text)", userSelect: "text" }}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white/[0.12]"
        >
          <X size={13} strokeWidth={2.4} style={{ color: "var(--nav-text-dim)" }} />
        </button>
      )}
    </div>
  );
}
