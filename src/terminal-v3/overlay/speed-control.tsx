"use client";

import { useEffect, useState } from "react";
import type { RefObject } from "react";
import type { PlayerControllerHandle } from "../scene/player";
import { navConfig } from "../navigation-config";

const SPEEDS = [1, 5, 10] as const;

export function SpeedControl({ ctrlRef, vertical = false }: { ctrlRef: RefObject<PlayerControllerHandle | null>; vertical?: boolean }) {
  const [v, setV] = useState(navConfig.logic.defaultSpeedMult);
  useEffect(() => {
    const id = setInterval(() => {
      const cur = ctrlRef.current?.getSpeedMultiplier();
      if (cur != null) setV((prev) => (prev === cur ? prev : cur));
    }, 200);
    return () => clearInterval(id);
  }, [ctrlRef]);
  const pick = (s: number) => {
    setV(s);
    ctrlRef.current?.setSpeedMultiplier(s);
  };
  return (
    <div
      className={
        vertical
          ? "flex flex-col items-stretch gap-0.5 rounded-[11px] p-[3px]"
          : "flex items-center gap-0.5 rounded-[14px] p-[3px]"
      }
      style={{ border: "1.5px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)" }}
    >
      {SPEEDS.map((s) => {
        const on = s === v;
        return (
          <button
            key={s}
            type="button"
            onClick={() => pick(s)}
            className={
              "nav-display cursor-pointer text-[12px] font-semibold transition-colors " +
              (vertical ? "rounded-[8px] px-1.5 py-1 text-center" : "rounded-[10px] px-2.5 py-1")
            }
            style={on ? { background: "var(--nav-accent)", color: "#fff" } : { color: "var(--nav-text-2)" }}
          >
            {s}×
          </button>
        );
      })}
    </div>
  );
}
