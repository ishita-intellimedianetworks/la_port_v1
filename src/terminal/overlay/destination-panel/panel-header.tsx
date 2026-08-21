"use client";

import { ArrowLeft, X } from "lucide-react";

interface PanelHeaderProps {
  title: string;
  subtitle: string;
  onClose: () => void;
  /** When set (directions mode), a back arrow returns to the options list. */
  onBack?: () => void;
}

/** Panel header — optional back arrow + title/subtitle on the left, a 30px
 *  hairline-circle close on the right. */
export function PanelHeader({ title, subtitle, onClose, onBack }: PanelHeaderProps) {
  return (
    <div className="flex items-start gap-2.5">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          title="Back"
          aria-label="Back to list"
          className="flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white/[0.06] short:h-[26px] short:w-[26px]"
          style={{ border: "1.5px solid rgba(255,255,255,0.2)" }}
        >
          <ArrowLeft size={15} strokeWidth={2} color="var(--nav-text-2)" />
        </button>
      )}

      <div className="min-w-0 flex-1">
        {/* First line sits in a button-height row so the title lines up with the
            back / close circles instead of riding above them. */}
        <div className="flex min-h-[30px] items-center short:min-h-[26px]">
          <h2
            className="nav-display break-words text-[18px] font-bold leading-tight short:text-[14px]"
            style={{ color: "var(--nav-text)", letterSpacing: "-0.2px" }}
          >
            {title}
          </h2>
        </div>
        {subtitle && (
          <p className="nav-body mt-0.5 line-clamp-2 text-[13px] font-medium short:text-[11px]" style={{ color: "var(--nav-text-2)" }}>
            {subtitle}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onClose}
        title="Close"
        className="flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white/[0.22] short:h-[26px] short:w-[26px]"
        style={{ background: "rgba(255,255,255,0.14)", border: "1.5px solid rgba(255,255,255,0.22)" }}
      >
        <X size={14} strokeWidth={2.4} color="#E6EAEF" />
      </button>
    </div>
  );
}
