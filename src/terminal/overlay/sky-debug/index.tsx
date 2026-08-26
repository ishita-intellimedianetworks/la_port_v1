"use client";

/**
 * SkyDebug — the time-of-day slider, mounted only under `?debug=true`.
 *
 * The sky is one scalar (see `sky/palette`), so this panel is one slider. It
 * writes `sky-store`, and both the dome's uniforms and the sun light read from
 * there — so dragging it moves the sun in the sky AND the sun on the model at
 * the same time, with no reload and no shader recompile. `site.json › sky`
 * still decides what the page LOADS with; this only overrides it for the run.
 *
 * Styled to match PerfMeter, the other `?debug=true` widget, and parked just
 * below it in the same corner.
 */

import { SKY_MODE, SKY_T_SEED, useSkyStore } from "@/terminal/stores/sky-store";
import { T_FOR_MODE, labelForT, sunElevationDeg } from "../../scene/environment/sky/palette";

const ACCENT = "#0fb7ff";

const PANEL: React.CSSProperties = {
  position: "fixed",
  // Clear of PerfMeter's four-line readout in the same corner.
  top: 96,
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
  gap: 6,
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

// The slider is integer-valued, so `t` is stepped in thousandths rather than
// left to float rounding — the readout then matches what was actually applied.
const STEPS = 1000;

export function SkyDebug() {
  const t = useSkyStore((s) => s.t);
  const clouds = useSkyStore((s) => s.clouds);
  const setT = useSkyStore((s) => s.setT);
  const setClouds = useSkyStore((s) => s.setClouds);
  const reset = useSkyStore((s) => s.reset);

  // Nothing to drive when the dome is off — the backdrop is then a flat colour
  // with no sun in it.
  if (SKY_MODE === "off") return null;

  const elevation = sunElevationDeg(t);

  return (
    <div style={PANEL}>
      <div style={ROW}>
        <span style={{ opacity: 0.7 }}>TIME OF DAY</span>
        <span>{labelForT(t)}</span>
      </div>

      <input
        type="range"
        min={0}
        max={STEPS}
        value={Math.round(t * STEPS)}
        onChange={(e) => setT(Number(e.target.value) / STEPS)}
        aria-label="Time of day"
        style={{ width: "100%", accentColor: ACCENT, cursor: "pointer" }}
      />

      <div style={{ ...ROW, opacity: 0.7 }}>
        <span>t {t.toFixed(3)}</span>
        {/* Elevation, not `t`, is what the DUSK → DAY blend keys off — so this
            is the number that explains the colour. Negative = sun has set. */}
        <span>sun {elevation >= 0 ? "+" : ""}{elevation.toFixed(1)}°</span>
      </div>

      <div style={ROW}>
        <button type="button" style={BUTTON} onClick={() => setT(T_FOR_MODE.dusk)}>
          dusk
        </button>
        <button type="button" style={BUTTON} onClick={() => setT(T_FOR_MODE.afternoon)}>
          aftn
        </button>
        <button type="button" style={BUTTON} onClick={() => setT(T_FOR_MODE.day)}>
          day
        </button>
        {/* Back to the authored stop, whichever it is. */}
        <button type="button" style={BUTTON} onClick={reset}>
          {SKY_T_SEED.toFixed(2)}
        </button>
      </div>

      <label style={{ ...ROW, cursor: "pointer", justifyContent: "flex-start" }}>
        <input
          type="checkbox"
          checked={clouds}
          onChange={(e) => setClouds(e.target.checked)}
          style={{ accentColor: ACCENT, cursor: "pointer" }}
        />
        {/* The one part of the sky shader with a real per-pixel cost — this is
            here so it can be A/B'd against the frame time above. */}
        <span>horizon clouds</span>
      </label>
    </div>
  );
}

export default SkyDebug;
