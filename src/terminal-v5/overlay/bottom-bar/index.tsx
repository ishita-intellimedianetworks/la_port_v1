"use client";

import type { ComponentType } from "react";
import { Home, Info, Map as MapIcon, PersonStanding, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_GLASS_PANEL } from "../glass-theme";

interface BottomBarProps {
  visible: boolean;
  tucked?: boolean;
  mapOpen: boolean;
  onOpenMap: () => void;
  onDollhouse: () => void;
  onInstructions: () => void;
  onHome: () => void;
  onFirstPerson?: () => void;
  mapDisabled?: boolean;
  securityActive?: boolean;
  onSecurity?: () => void;
}

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
  securityActive,
  onSecurity,
}: BottomBarProps) {
  const shown = visible && !tucked;
  return (
    <div
      className="fixed bottom-4 left-1/2 z-[210] transition-[opacity,transform] duration-[600ms] ease-out sm:bottom-5 short:bottom-2"
      style={{
        opacity: shown ? 1 : 0,
        transform: shown
          ? "translate(-50%, 0)"
          : tucked
            ? "translate(-50%, calc(100% + 24px))"
            : "translate(-50%, 12px)",
        pointerEvents: shown ? undefined : "none",
      }}
    >
      <div className="flex items-center gap-3 short:gap-2">
        <BarButton icon={Home} label="Home" onClick={onHome} disabled={securityActive} />
        {onFirstPerson && (
          <BarButton
            icon={PersonStanding}
            label="First Person"
            onClick={onFirstPerson}
            disabled={securityActive}
          />
        )}
        <BarButton
          icon={DollhouseGlyph}
          label="Dollhouse"
          onClick={onDollhouse}
          disabled={securityActive}
        />
        <BarButton
          icon={Info}
          label="Instructions"
          onClick={onInstructions}
          disabled={securityActive}
        />
        <BarButton
          icon={MapIcon}
          label="Map"
          onClick={onOpenMap}
          active={mapOpen}
          disabled={mapDisabled || securityActive}
        />
        {onSecurity && (
          <BarButton icon={Shield} label="Security" onClick={onSecurity} active={securityActive} />
        )}
      </div>
    </div>
  );
}

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
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex h-12 w-12 cursor-pointer items-center justify-center rounded-full short:h-10 short:w-10",
        "transition-[scale,translate,color,background-color,border-color] duration-200",
        "hover:scale-105 active:translate-y-px",
        !active && "text-[rgba(255,255,255,0.86)] hover:text-white",
        disabled && "pointer-events-none opacity-40",
      )}
      style={{
        ...NAV_GLASS_PANEL,
        background: active ? "var(--nav-accent)" : "var(--nav-glass-strong)",
        border: active ? "1.5px solid rgba(255,255,255,0.5)" : "1.5px solid var(--nav-border)",
        ...(active ? { color: "#ffffff" } : null),
      }}
    >
      <Icon size={20} strokeWidth={1.9} color="currentColor" />
    </button>
  );
}

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
