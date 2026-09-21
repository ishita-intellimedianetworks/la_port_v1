"use client";

import { ArrowLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface PanelHeaderProps {
  /** Empty string omits the title/subtitle block entirely (just back/close). */
  title: string;
  subtitle: string;
  /** Omitted where the panel closes another way (click-outside on the flaps). */
  onClose?: () => void;
  /** When set (directions mode), a back arrow returns to the options list. */
  onBack?: () => void;
  dense?: boolean;
}

/** Panel header — optional back arrow + title/subtitle on the left, a 30px
 *  hairline-circle close on the right. */
export function PanelHeader({ title, subtitle, onClose, onBack, dense }: PanelHeaderProps) {
  return (
    <div className={cn("flex items-start gap-2.5", dense && "max-sm:gap-2")}>
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

      {title && (
        <div className="min-w-0 flex-1">
          {/* First line sits in a button-height row so the title lines up with the
              back / close circles instead of riding above them. */}
          <div className={cn("flex min-h-[30px] items-center short:min-h-[26px]", dense && "max-sm:min-h-[26px]")}>
            <h2
              className={cn(
                "nav-display break-words text-[18px] font-bold leading-tight short:text-[14px]",
                dense && "max-sm:text-[15px]",
              )}
              style={{ color: "var(--nav-text)", letterSpacing: "-0.2px" }}
            >
              {title}
            </h2>
          </div>
          {subtitle && (
            <p
              className={cn(
                "nav-body mt-0.5 line-clamp-2 text-[13px] font-medium short:text-[11px]",
                dense && "max-sm:text-[11px]",
              )}
              style={{ color: "var(--nav-text-2)" }}
            >
              {subtitle}
            </p>
          )}
        </div>
      )}

      {!title && <div className="min-w-0 flex-1" />}

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          title="Close"
          className={cn(
            "flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white/[0.22] short:h-[26px] short:w-[26px]",
            dense && "max-sm:h-[26px] max-sm:w-[26px]",
          )}
          style={{ background: "rgba(255,255,255,0.14)", border: "1.5px solid rgba(255,255,255,0.22)" }}
        >
          <X size={14} strokeWidth={2.4} color="#E6EAEF" />
        </button>
      )}
    </div>
  );
}
