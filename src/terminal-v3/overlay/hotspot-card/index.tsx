"use client";

import { useEffect } from "react";
import { useSite } from "@/config/context";
import type { HotspotField, Tone } from "@/config/schema";
import { NAV_GLASS_PANEL } from "../glass-theme";
import { PanelHeader } from "../destination-panel/panel-header";

const TONE_COLOR: Record<Tone, string> = {
  ok: "var(--tone-ok, #30d158)",
  warn: "var(--tone-warn, #ffb020)",
  alert: "var(--tone-alert, #ff5c5c)",
};

function formatValue(field: HotspotField): string {
  const { type, value, unit } = field;
  if (value === "" || value === null || value === undefined) return "-";
  if (type === "boolean") return value ? "Yes" : "No";

  let text: string;
  if (typeof value === "number") {
    if (field.decimals != null) text = value.toFixed(field.decimals);
    else text = Number.isInteger(value) ? value.toLocaleString() : String(value);
    if (type === "percentage") text += "%";
  } else {
    text = String(value);
  }
  return unit ? `${text} ${unit}` : text;
}

/**
 * One data row — the admin app's treatment: a small label above a larger value,
 * closed by a hairline.
 */
function Field({ field }: { field: HotspotField }) {
  const tone = useSite().toneFor(field.value, field.tone);
  const meter =
    field.render === "meter" && typeof field.value === "number"
      ? Math.max(0, Math.min(1, field.value / (field.max ?? 100)))
      : null;

  return (
    <div
      className="flex min-w-0 flex-col justify-start border-b py-[7px] short:py-[5px]"
      style={{ borderColor: "var(--nav-divider)" }}
    >
      <h3
        className="nav-body text-[11.5px] font-medium short:text-[10.5px]"
        style={{ color: "var(--nav-text-faint)" }}
      >
        {field.label}
      </h3>
      <h2
        className="nav-display truncate text-[15px] font-semibold leading-snug short:text-[13px]"
        style={{
          // A pending topic is one the handoff requires but neither source
          // document gives a value for — shown as absent, never as a reading.
          // Only STATUS words carry a tone. Colouring every value that happened
          // to match a keyword turned the card into a paint chart.
          color: field.pending
            ? "var(--nav-text-faint)"
            : field.type === "enum" && tone
              ? TONE_COLOR[tone]
              : "var(--nav-text)",
        }}
      >
        {formatValue(field)}
      </h2>
      {meter !== null && (
        <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full"
            style={{
              width: `${meter * 100}%`,
              background: tone ? TONE_COLOR[tone] : "var(--nav-accent-bright)",
            }}
          />
        </div>
      )}
    </div>
  );
}

interface HotspotDataCardProps {
  /** Destination id — which is the layout id (L01-L10). */
  destId: string;
  /** 1-based marker index within that layout's `hotspots[]`. */
  index: number;
  onClose: () => void;
}

/**
 * The hotspot readout: all 30 hotspots render through this one component,
 * driven purely by their `fields` dictionary in `<site>.json` › `hotspots[]` — the
 * handoff's consistency requirement, and the reason a new hotspot needs no new
 * UI code.
 *
 * The engine identifies a clicked marker as (destination, marker index). Since
 * a destination IS a layout and its markers are that layout's `hotspots[]` in
 * order, that pair resolves straight back to a hotspot id.
 *
 * The card is the reference's panel; only the row treatment — a small label
 * above a larger value, closed by a line — comes from the admin app.
 */
export function HotspotDataCard({ destId, index, onClose }: HotspotDataCardProps) {
  const site = useSite();
  const layout = site.layoutById[destId];
  const hotspotId = layout?.hotspots[index - 1];
  const hotspot = hotspotId ? site.hotspotById[hotspotId] : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!hotspot) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[130] flex items-center justify-center">
      {/* Click-outside target. The scene behind is left undimmed, as the
          reference leaves it — the card's frost carries the separation. */}
      <button
        aria-label="Close"
        onClick={onClose}
        className="pointer-events-auto absolute inset-0 cursor-default"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={hotspot.popupTitle}
        style={{ ...NAV_GLASS_PANEL, border: "1.5px solid var(--nav-border)" }}
        className="pointer-events-auto flex max-h-[min(80dvh,calc(100dvh-32px))] w-[min(620px,calc(100vw-32px))] flex-col overflow-hidden rounded-[14px] p-6 short:max-h-[calc(100dvh-16px)] short:origin-center short:scale-[0.85] short:rounded-[10px] short:p-4"
      >
        <PanelHeader
          title={hotspot.popupTitle}
          subtitle={layout.name}
          onClose={onClose}
        />

        {/* The handoff's Expected Interaction line is deliberately NOT shown.
            It is a build instruction — "Click → vessel-traffic popup" — written
            for whoever implements the hotspot, and printing it to the operator
            told them to do the thing they had just done. It stays in the config
            as spec provenance. */}

        {/* Body scrolls if the card would outgrow the viewport — the width does
            the spreading, the height stays capped. */}
        <div className="ui-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto overflow-x-hidden short:mt-2">
          {hotspot.journey && (
            <div
              className="mt-4 border-t pt-2 short:mt-3"
              style={{ borderColor: "var(--nav-divider)" }}
            >
              <div
                className="nav-body pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.06em]"
                style={{ color: "var(--nav-text-dim)" }}
              >
                {site.ui.popup.journeyTitle}
              </div>
              <ol className="flex flex-col">
                {hotspot.journey.map((step, i) => (
                  <li key={step.stage} className="flex items-center gap-3 pb-2 last:pb-0">
                    <div className="flex flex-col items-center self-stretch">
                      <span
                        className="mt-2 h-[6px] w-[6px] shrink-0 rounded-full"
                        style={{
                          background: "#2997FF",
                          boxShadow: "0 0 6px rgba(41,151,255,0.8)",
                        }}
                      />
                      {i < hotspot.journey!.length - 1 && (
                        <span className="mt-1 w-px flex-1 bg-white/15" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3
                        className="nav-body text-[11.5px] font-medium short:text-[10.5px]"
                        style={{ color: "var(--nav-text-faint)" }}
                      >
                        {step.stage} · {step.state}
                      </h3>
                      <h2
                        className="nav-display truncate text-[14px] font-semibold short:text-[12px]"
                        style={{ color: "var(--nav-text)" }}
                      >
                        {step.label}
                      </h2>
                    </div>
                    <span
                      className="nav-body shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium"
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        border: "1.5px solid rgba(255,255,255,0.16)",
                        color: "var(--nav-text-2)",
                      }}
                    >
                      {step.layoutId}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Two columns so the card spends its width, not its height — the
              reference's own treatment for its details table. */}
          <div
            className="mt-4 border-t pt-1 short:mt-3"
            style={{ borderColor: "var(--nav-divider)" }}
          >
            <div className="grid grid-cols-2 gap-x-8 max-[560px]:grid-cols-1 short:gap-x-5">
              {hotspot.fields.map((f) => (
                <Field key={f.name} field={f} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HotspotDataCard;
