"use client";

/**
 * GradeDebug — the exposure / brightness / contrast / saturation sliders,
 * mounted only under `?debug=true`.
 *
 * The same four knobs the facet_4 study exposes, wired the same way: exposure
 * goes to `renderer.toneMappingExposure`, the other three to a CSS `filter` on
 * the canvas. It writes `grade-store`, so `site.json › world.grade` still
 * decides what the page LOADS with and this only overrides it for the run —
 * exactly the arrangement the sky slider uses.
 *
 * Dial it here, then paste the readout at the bottom into `world.grade`. The
 * numbers are shown in config order for that reason.
 *
 * Styled to match PerfMeter and SkyDebug, the other `?debug=true` widgets, and
 * parked below them in the same corner.
 */

import { GRADE_SEED, useGradeStore } from "@/shared/stores/grade-store";

const ACCENT = "#0fb7ff";

const PANEL: React.CSSProperties = {
  position: "fixed",
  // Clear of PerfMeter's readout AND SkyDebug, which stack above this.
  top: 300,
  right: 8,
  zIndex: 9999,
  width: 208,
  padding: "8px 10px",
  background: "rgba(0,0,0,0.7)",
  color: ACCENT,
  font: "11px/1.5 ui-monospace,monospace",
  border: `1px solid rgba(15,183,255,0.4)`,
  borderRadius: 4,
  letterSpacing: "0.04em",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const ROW: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 6,
};

const BUTTON: React.CSSProperties = {
  flex: 1,
  padding: "3px 0",
  background: "transparent",
  color: ACCENT,
  border: `1px solid rgba(15,183,255,0.4)`,
  borderRadius: 3,
  font: "inherit",
  letterSpacing: "inherit",
  cursor: "pointer",
};

// Sliders are integer-valued and scaled down, so the readout matches what was
// actually applied rather than a float-rounded neighbour — same reason
// SkyDebug steps `t` in thousandths.
const STEPS = 100;

/** Ranges lifted from the study's own panel, so a value dialled there lands in
 *  the same part of the travel here. */
const RANGES = {
  exposure: { min: 0.2, max: 2.5 },
  brightness: { min: -0.5, max: 0.5 },
  contrast: { min: -0.5, max: 0.5 },
  saturation: { min: -1, max: 1 },
} as const;

type Key = keyof typeof RANGES;

export function GradeDebug() {
  const exposure = useGradeStore((s) => s.exposure);
  const brightness = useGradeStore((s) => s.brightness);
  const contrast = useGradeStore((s) => s.contrast);
  const saturation = useGradeStore((s) => s.saturation);
  const set = useGradeStore((s) => s.set);
  const reset = useGradeStore((s) => s.reset);

  const value: Record<Key, number> = { exposure, brightness, contrast, saturation };
  // Neutral is worth calling out: it is the state in which the CSS filter is
  // not emitted at all, which is a different thing from "set to 1.0".
  const filtering = brightness !== 0 || contrast !== 0 || saturation !== 0;

  const slider = (key: Key, label: string) => {
    const { min, max } = RANGES[key];
    return (
      <div key={key}>
        <div style={ROW}>
          <span style={{ opacity: 0.7 }}>{label}</span>
          <span>{value[key].toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={Math.round(min * STEPS)}
          max={Math.round(max * STEPS)}
          value={Math.round(value[key] * STEPS)}
          onChange={(e) => set({ [key]: Number(e.target.value) / STEPS })}
          aria-label={label}
          style={{ width: "100%", accentColor: ACCENT, cursor: "pointer" }}
        />
      </div>
    );
  };

  return (
    <div style={PANEL}>
      <div style={ROW}>
        <span style={{ opacity: 0.7 }}>GRADE</span>
        {/* Which of the two mechanisms is actually live right now. */}
        <span style={{ opacity: 0.7 }}>{filtering ? "hdr+css" : "hdr only"}</span>
      </div>

      {slider("exposure", "exposure")}
      {slider("brightness", "brightness")}
      {slider("contrast", "contrast")}
      {slider("saturation", "saturation")}

      <div style={ROW}>
        <button type="button" style={BUTTON} onClick={() => set({ exposure: 1, brightness: 0, contrast: 0, saturation: 0 })}>
          neutral
        </button>
        {/* Back to the authored seed, whatever it is. */}
        <button type="button" style={BUTTON} onClick={reset}>
          seed
        </button>
      </div>

      {/* Paste straight into `site.json › world.grade`. */}
      <div style={{ opacity: 0.7, wordBreak: "break-all", lineHeight: 1.4 }}>
        {`"exposure": ${exposure}, "brightness": ${brightness}, ` +
          `"contrast": ${contrast}, "saturation": ${saturation}`}
      </div>
      <div style={{ opacity: 0.45 }}>
        seed {GRADE_SEED.exposure}/{GRADE_SEED.brightness}/{GRADE_SEED.contrast}/
        {GRADE_SEED.saturation}
      </div>
    </div>
  );
}

export default GradeDebug;
