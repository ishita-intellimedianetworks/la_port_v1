"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { useSite } from "@/config/context";
import {
  CATEGORY_BY_HOTSPOT,
  SECURITY_CATEGORIES,
  SECURITY_SOURCES,
  incidentCounts,
  isFieldHotspot,
  useSecurityStore,
  type IncidentSeverity,
  type IncidentStatus,
  type SecurityActor,
  type SecurityAuditEntry,
  type SecurityIncident,
} from "../../stores/security-store";
import type { HotspotField, Tone } from "@/config/schema";
import { NAV_GLASS_PANEL } from "../glass-theme";
import { PanelHeader } from "../destination-panel/panel-header";
import { useLayoutNavigation } from "../use-layout-navigation";

/** `--tone-alert` is not defined in any stylesheet, so the fallback IS the
 *  colour. Dark red rather than the salmon the other routes use: on the glass
 *  panel a light red reads as a highlight, and an alert should read as a
 *  warning. v3 and v1 keep their own copies of this table and are unaffected. */
const TONE_COLOR: Record<Tone, string> = {
  ok: "var(--tone-ok, #30d158)",
  warn: "var(--tone-warn, #ffb020)",
  alert: "var(--tone-alert, #c0342b)",
};

/**
 * Severity has its OWN scale, four colours for four levels.
 *
 * `Tone` carries three (ok / warn / alert), so mapping severity through it put
 * CRITICAL and HIGH on the same red and the one level that means "stop what you
 * are doing" looked like the one below it. This keeps red for HIGH, where the
 * eye already expects it, and takes CRITICAL further round to magenta: distinct
 * at a glance, and unmistakably hotter rather than merely different.
 */
const SEVERITY_COLOR: Record<IncidentSeverity, string> = {
  LOW: "var(--tone-ok, #30d158)",
  MEDIUM: "var(--tone-warn, #ffb020)",
  HIGH: "var(--tone-alert, #c0342b)",
  CRITICAL: "#ff3bd4",
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
function Field({ field, color }: { field: HotspotField; color?: string }) {
  const tone = useSite().toneFor(field.value, field.tone);
  // A STATUS FLAG rather than a word: the same condition that colours a value
  // also upper-cases it, so "cleared"/"Cleared"/"CLEARED" in the config all
  // reach the screen as CLEARED and the coloured rows read as one set. Plain
  // values — ids, places, counts — keep the casing they were authored with.
  const flag = !field.pending && field.type === "enum" && !!tone;
  const meter =
    field.render === "meter" && typeof field.value === "number"
      ? Math.max(0, Math.min(1, field.value / (field.max ?? 100)))
      : null;

  return (
    <div
      className="flex min-w-0 flex-col justify-start border-b py-[7px] max-sm:py-[5px] short:py-[5px]"
      style={{ borderColor: "var(--nav-divider)" }}
    >
      <h3
        className="nav-body text-[11.5px] font-medium max-sm:text-[10.5px] short:text-[10.5px]"
        style={{ color: "var(--nav-text-faint)" }}
      >
        {field.label}
      </h3>
      <h2
        className={cn(
          "nav-display truncate text-[15px] font-semibold leading-snug max-sm:text-[13px] short:text-[13px]",
          flag && "uppercase tracking-[0.02em]",
        )}
        style={{
          // A pending topic is one the handoff requires but neither source
          // document gives a value for — shown as absent, never as a reading.
          // Only STATUS words carry a tone. Colouring every value that happened
          // to match a keyword turned the card into a paint chart.
          // An explicit colour wins: S08's status lines end in a severity word,
          // and that word has to be the colour it is everywhere else. Tone
          // carries three values and severity has four, so routing them through
          // it painted CRITICAL the same red as HIGH.
          color: field.pending
            ? "var(--nav-text-faint)"
            : (color ??
              (field.type === "enum" && tone ? TONE_COLOR[tone] : "var(--nav-text)")),
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

/**
 * The colour a reading takes, by the rule `Field` above applies: an explicit
 * colour wins, then a tone — but only on an `enum`, since colouring every value
 * that happened to match a keyword turned the card into a paint chart.
 *
 * Named here because S08's card renders its readings as status lines and
 * counters rather than as field rows, and the three have to agree about what a
 * coloured value means.
 */
function valueColor(field: HotspotField, tone: Tone | undefined, color?: string): string {
  return color ?? (field.type === "enum" && tone ? TONE_COLOR[tone] : "var(--nav-text)");
}

/**
 * A heading over a group of readings.
 *
 * The two command cards are several kinds of thing stacked — status lines,
 * counters, a filter row, a day's records — and with no word over each they
 * read as one long column of controls.
 */
function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "nav-body mb-2 mt-4 text-[10px] font-semibold uppercase tracking-[0.07em]",
        className,
      )}
      style={{ color: "var(--nav-text-dim)" }}
    >
      {children}
    </div>
  );
}

interface HotspotDataCardProps {
  /** Destination id — which is the layout id (L01-L10). */
  destId: string;
  /** 1-based marker index within that layout's `hotspots[]`. */
  index: number;
  /**
   * The hotspot to show, named outright.
   *
   * Preferred over `(destId, index)` whenever the caller has it, and REQUIRED
   * for the security layer: those rows live in their own table and are not
   * children of `layouts[].hotspots`, so the index walk below cannot reach
   * them. The pair is kept for callers that still resolve positionally.
   */
  hotspotId?: string;
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
export { StillPreload };

export function HotspotDataCard({ destId, index, hotspotId: namedId, onClose }: HotspotDataCardProps) {
  const site = useSite();
  const securityById = useSecurityStore((s) => s.hotspotById);
  const isIncidentCentre = namedId === SECURITY_INCIDENT_ID;
  const layout = site.layoutById[destId];
  // An explicit id wins; the positional walk is the fallback. Both tables are
  // consulted for the named one, because a security row resolves out of the
  // STORE (its readings move as the demo runs) and would otherwise come back
  // undefined.
  const hotspotId = namedId ?? layout?.hotspots[index - 1];
  const hotspot = hotspotId
    ? (site.hotspotById[hotspotId] ?? securityById[hotspotId])
    : undefined;

  // S08's readings are DERIVED, not stored: §8 requires "S08 counts/status
  // update when demo incidents change state", and a second copy of a number
  // that has to agree with a list is one that will eventually disagree with it.
  // Every other hotspot renders its fields as they stand.
  const incidents = useSecurityStore((s) => s.incidents);
  // On a field hotspot, the grid follows the SELECTED incident: picking one
  // from the list above should change the readings under it, or the two halves
  // of the card describe different events. With nothing selected it shows the
  // system's live state, which is whatever fired last.
  const incidentFields = useSecurityStore((s) => s.incidentFields);
  const seedById = useSecurityStore((s) => s.seedHotspotById);
  const selectedIncidentId = useSecurityStore((s) => s.selectedIncidentId);
  const fields = useMemo(() => {
    if (!hotspot) return [];
    if (hotspotId === SECURITY_COMMAND_ID) {
      return commandViewFields(hotspot.fields, incidents);
    }
    // Mirrors the list's own fallback: with several open and none picked, the
    // newest is the highlighted one, so it is the one the grid describes.
    const mine =
      hotspotId && isFieldHotspot(hotspotId)
        ? incidents.filter(
            (i) => i.sourceHotspotId === hotspotId && i.status !== "RESOLVED",
          )
        : [];
    const chosen =
      mine.length > 1
        ? (mine.find((i) => i.id === selectedIncidentId) ?? mine[0])
        : undefined;
    const patch = chosen ? incidentFields[chosen.id] : undefined;
    if (!patch) return hotspot.fields.map((f) => ({ field: f, color: undefined }));

    // DYNAMIC, and built from the SEED rather than the live fields.
    //
    // From the seed, because a field this event did not write is at rest for
    // it, not carrying whatever a different incident put there: showing the
    // appointment exception with the tailgating event's gate state would
    // describe an event that never happened.
    //
    // Dynamic, because the grid then says what this event reported rather than
    // padding it out with six rows of "None". A hotspot's identity fields (its
    // camera, its zone) always show, since they say WHICH device is speaking;
    // the rest appear only if this event wrote them.
    const seed = seedById[hotspot.id]?.fields ?? hotspot.fields;
    return seed
      .filter((f) => f.name in patch || IDENTITY_FIELDS.has(f.name))
      .map((f) => ({
        // The event id names THIS incident. It is seeded with one id and no
        // event patches it, so left alone every incident on the hotspot would
        // show the same number and none of them the right one.
        field:
          f.name === "event_id"
            ? { ...f, value: chosen!.id }
            : f.name in patch
              ? { ...f, value: patch[f.name] }
              : f,
        color: undefined,
      }));
  }, [hotspot, hotspotId, incidents, incidentFields, selectedIncidentId, seedById]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!hotspot) return null;

  /** The still shown against the card, when this hotspot has one authored. */
  const still = hotspot.image;

  return (
    <div className="pointer-events-none fixed inset-0 z-[130] flex items-center justify-center">
      {/* Click-outside target. The scene behind is left undimmed, as the
          reference leaves it — the card's frost carries the separation. The
          NESTED dialogs do carry a scrim, because what they cover is this
          card's text rather than the scene. */}
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
        className={cn(
          "pointer-events-auto flex flex-col overflow-hidden rounded-[14px] p-6 short:origin-center short:scale-[0.85] short:rounded-[10px] short:p-4",
          // PORTRAIT PHONE. `short:` above is the landscape case - height gone,
          // width fine - and this is the other one: everything in, so the card
          // reads as a card rather than as the screen.
          "max-sm:rounded-[12px] max-sm:p-4",
          "w-[min(620px,calc(100vw-32px))] max-sm:w-[min(340px,calc(100vw-40px))]",
          // The incident centre is a FIXED height, at what it would otherwise
          // have grown to. Filtering a list changes how many rows it holds, and
          // a card that resizes under every tick moves the control being
          // clicked. Every other hotspot stays a content-height card, which is
          // right for a fixed field grid that never changes size.
          isIncidentCentre
            ? "h-[min(80dvh,calc(100dvh-32px))] short:h-[calc(100dvh-16px)]"
            : "max-h-[min(80dvh,calc(100dvh-32px))] max-sm:max-h-[72dvh] short:max-h-[calc(100dvh-16px)]",
        )}
      >
        <PanelHeader
          dense
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
        <div className="ui-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto overflow-x-hidden max-sm:mt-2 short:mt-2">
          {/* THE ALERT, if this hotspot is standing in one.
              First thing in the body, before any reading: a card whose numbers
              say something is wrong should say so in words at the top, not
              leave the operator to infer it from a red row halfway down a grid.
              The accent bar carries the colour, so the panel behind it stays
              the same glass as every other card and only this strip changes. */}
          {hotspot.alert && (
            <div
              role="status"
              className="mb-3 flex items-start gap-2.5 rounded-[10px] border-l-[3px] px-3 py-2.5 max-sm:mb-2 max-sm:gap-2 max-sm:px-2.5 max-sm:py-2 short:mb-2 short:py-2"
              style={{
                background:
                  hotspot.alert.level === "danger"
                    ? "rgba(192,52,43,0.18)"
                    : "rgba(255,176,32,0.12)",
                borderColor:
                  hotspot.alert.level === "danger"
                    ? "var(--tone-alert, #c0342b)"
                    : "var(--tone-warn, #ffb020)",
              }}
            >
              <TriangleAlert
                size={15}
                strokeWidth={2.4}
                className="mt-[1px] shrink-0"
                style={{
                  color:
                    hotspot.alert.level === "danger"
                      ? "var(--tone-alert, #c0342b)"
                      : "var(--tone-warn, #ffb020)",
                }}
              />
              <div className="min-w-0">
                <h3
                  className="nav-display text-[12.5px] font-bold uppercase tracking-[0.08em] max-sm:text-[11px] short:text-[11.5px]"
                  style={{
                    color:
                      hotspot.alert.level === "danger"
                        ? "var(--tone-alert, #c0342b)"
                        : "var(--tone-warn, #ffb020)",
                  }}
                >
                  {hotspot.alert.title}
                </h3>
                {hotspot.alert.detail && (
                  <p
                    className="nav-body mt-0.5 text-[12px] leading-snug max-sm:text-[11px] short:text-[11px]"
                    style={{ color: "var(--nav-text-2)" }}
                  >
                    {hotspot.alert.detail}
                  </p>
                )}
              </div>
            </div>
          )}
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

          {/* S08's layer switches. Its Expected interaction is the only one that
              asks for a control rather than a readout: "Security Mode toggles
              logical layers: ACCESS, CARGO, WATERSIDE, ANALYTICS, GEOFENCES,
              INCIDENTS. Selecting a category highlights only demo
              entities/events in the 3D model." Hosted HERE, in the command
              view's own popup, because that is the hotspot the spec attaches
              them to. */}
          {/* S08's card IS its two readouts: the six capability lines and the
              four open-incident counters. Same derived fields the grid below
              would have printed, grouped and headed instead — see
              SecurityCommandView for why they are not ten identical rows. */}
          {hotspotId === SECURITY_COMMAND_ID && <SecurityCommandView fields={fields} />}

          {/* S07 is the incident centre: the live queue, the history and the
              audit trail, rather than a field readout. Its own §4 fields
              describe ONE incident, which is the row shape below, not the
              card. */}
          {hotspotId === SECURITY_INCIDENT_ID && <SecurityIncidentCentre />}

          {/* A field hotspot with events of its own. Its field grid shows ONE
              reading set, which is the most recent event's, so three triggers
              on one system would otherwise leave two of them invisible. */}
          {hotspotId && isFieldHotspot(hotspotId) && (
            <SourceIncidents hotspotId={hotspotId} />
          )}

          {hotspotId === SECURITY_COMMAND_ID && <SecurityLayerToggles />}

          {/* Two columns so the card spends its width, not its height — the
              reference's own treatment for its details table. */}
          <div
            className="mt-4 border-t pt-1 short:mt-3"
            style={{ borderColor: "var(--nav-divider)" }}
            // S07's fields are the shape of one incident row, already rendered
            // by the centre above; printing them as a flat grid too would show
            // an empty duplicate of whatever is selected. S08's ten are the
            // capability lines and the counters, already rendered by the
            // command view, and a second copy of a number that has to agree
            // with a list is one that will eventually disagree with it.
            hidden={
              hotspotId === SECURITY_INCIDENT_ID || hotspotId === SECURITY_COMMAND_ID
            }
          >
            {/* Two columns normally — the card spends its width rather than
                its height. Floating over its scene the card is 340 wide, so the
                readings stack into one. */}
            <div className={cn("flex items-center gap-5", !still && "block")}>
              {/* THE STILL AS A PLANE STANDING IN THE CARD.
                  Turned 13 degrees off the screen with its far edge pinned, so
                  it reads as a surface with depth rather than a picture lying
                  flat on the panel. No shadow: the turn is doing the work, and
                  a shadow under a cut-out only re-draws its silhouette in grey
                  behind it.

                  Hidden below `sm`: turned and shrunk to phone width it stops
                  being legible, and the readings are what the card is for. */}
              {still && (
                <div
                  // Top-aligned while the card is small: the readings column
                  // runs taller there and a centred still drifts off the card's
                  // first line. Centred once there is room beside it.
                  className="hidden shrink-0 [perspective:1100px] max-md:self-start sm:block short:self-start"
                >
                  <figure
                    // A SQUARE-ISH box, not the render's own ratio: the two
                    // stills no longer share one - S02 is the scanner alone at
                    // 1.06, S01 the truck and barrier at 1.89 - and a fixed box
                    // with `object-contain` lets each sit whole inside it
                    // instead of the card changing shape per hotspot. The
                    // padding it leaves is transparent, so it is invisible.
                    className="relative m-0 aspect-[5/4] w-[250px] short:w-[196px]"
                    style={{
                      transform: "rotateY(13deg) rotateX(2deg)",
                      transformOrigin: "right center",
                    }}
                  >
                    <Image
                      src={still}
                      alt={hotspot.name}
                      fill
                      sizes="250px"
                      className="object-contain"
                      draggable={false}
                    />
                  </figure>
                </div>
              )}
              <div
                className={cn(
                  "grid min-w-0 flex-1 gap-x-8 max-[560px]:grid-cols-1 max-sm:gap-x-5 short:gap-x-5",
                  still ? "grid-cols-1" : "grid-cols-2",
                )}
              >
                {fields.map(({ field, color }) => (
                  <Field key={field.name} field={field} color={color} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Fetch every authored still up front, off screen.
 *
 * A 600 KB cut-out requested only when its card opens arrives after the card
 * does, so the panel draws, sits empty, and fills in - which reads as the card
 * being slow rather than the image being late. Warming them while the terminal
 * is still streaming costs nothing that is being waited on.
 *
 * IT RENDERS THE SAME COMPONENT AT THE SAME SIZE, deliberately. `next/image`
 * rewrites the src into `/_next/image?url=…&w=…&q=…`, so what lands in the
 * browser cache is keyed on the variant the optimiser produced. Preloading the
 * raw `/security/*.png` would warm a URL the card never asks for. Same
 * `<Image>`, same `fill`, same `sizes` - so the same srcset, the same
 * candidate, and a cache hit when the card opens.
 *
 * Clipped by a 1px box rather than `display: none`, which browsers are entitled
 * to treat as "not needed" and skip.
 */
function StillPreload() {
  const site = useSite();
  const stills = useMemo(() => {
    const rows = [...site.hotspots, ...site.securityHotspots];
    return [...new Set(rows.map((h) => h.image).filter((u): u is string => !!u))];
  }, [site]);

  if (!stills.length) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 h-px w-px overflow-hidden opacity-0"
    >
      {stills.map((src) => (
        <div key={src} className="relative h-[200px] w-[250px]">
          <Image src={src} alt="" fill sizes="250px" priority className="object-contain" />
        </div>
      ))}
    </div>
  );
}

/** The hotspot whose popup hosts the layer switches: S08, Port Security
 *  Command. Named rather than inferred, the way SECURITY_LAYOUT_ID is. */
const SECURITY_COMMAND_ID = "S08";

/** The incident centre: S07, Security Incident Management. */
const SECURITY_INCIDENT_ID = "S07";

/**
 * S08's readings, recomputed from the live incident queue.
 *
 * The seeded fields supply the LABELS and the order; the values are replaced
 * from what is actually open. The per-system status lines follow the category
 * each incident's source hotspot belongs to, so raising an S01 event moves
 * "Access Control" and nothing else.
 *
 * A field the queue says nothing about is left exactly as authored.
 */
function commandViewFields(
  seeded: HotspotField[],
  incidents: SecurityIncident[],
): { field: HotspotField; color?: string }[] {
  const counts = incidentCounts(incidents);
  const open = incidents.filter((i) => i.status !== "RESOLVED");

  // Worst open severity per category, so a status line reports the most serious
  // thing outstanding rather than the most recent.
  const worst = new Map<string, IncidentSeverity>();
  for (const i of open) {
    const category = CATEGORY_BY_HOTSPOT[i.sourceHotspotId];
    if (!category) continue;
    const held = worst.get(category);
    if (!held || SEVERITY_RANK[i.severity] > SEVERITY_RANK[held]) {
      worst.set(category, i.severity);
    }
  }
  const statusFor = (category: string, normal: string) => {
    const s = worst.get(category);
    if (!s) return { value: normal, tone: "ok" as Tone };
    const n = open.filter((i) => CATEGORY_BY_HOTSPOT[i.sourceHotspotId] === category).length;
    return {
      // Ends in the severity word, so it carries the severity SCALE rather than
      // a tone: the same word must be the same colour here as on an S07 row.
      value: `${n} ${n === 1 ? "event" : "events"} · ${s}`,
      color: SEVERITY_COLOR[s],
    };
  };

  const derived: Record<
    string,
    { value: HotspotField["value"]; tone?: Tone; color?: string }
  > = {
    access_control_status: statusFor("access", "Normal"),
    container_security_status: statusFor("cargo", "Normal"),
    waterside_status: statusFor("waterside", "Normal"),
    video_analytics_status: statusFor("analytics", "Online"),
    restricted_zone_status: statusFor("geofences", "Normal"),
    active_incidents: { value: counts.active },
    high_incidents: { value: counts.high, tone: counts.high ? "alert" : undefined },
    medium_incidents: { value: counts.medium, tone: counts.medium ? "warn" : undefined },
    critical_incidents: { value: counts.critical, tone: counts.critical ? "alert" : undefined },
  };

  // The colour travels BESIDE the field rather than on it: `HotspotField` is
  // the authored config shape, and a display-only colour is not something a
  // site file has an opinion about.
  return seeded.map((f) => {
    const d = derived[f.name];
    return d ? { field: { ...f, value: d.value, tone: d.tone }, color: d.color } : { field: f };
  });
}

/** For comparing two severities. */
const SEVERITY_RANK: Record<IncidentSeverity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

/**
 * S08's readout: the six capability lines, then the four open-incident
 * counters.
 *
 * Both halves are the same derived fields the generic grid would have printed,
 * grouped under a heading rather than laid out as ten identical
 * label-above-value rows. A capability is a name against a state, which reads
 * as one line; a counter is a single number, which reads as a tile. Printed as
 * one grid they looked like ten readings of the same kind, and the card's two
 * questions — is everything up, and how much is open — had to be picked apart
 * by reading the labels.
 */
function SecurityCommandView({
  fields,
}: {
  fields: { field: HotspotField; color?: string }[];
}) {
  // Split on the authored field NAME, which is the key `commandViewFields`
  // derives against, rather than on type or position: both of those agree today
  // and would stop agreeing the first time a reading is added.
  const capabilities = fields.filter((f) => f.field.name.endsWith("_status"));
  const counters = fields.filter((f) => f.field.name.endsWith("_incidents"));

  return (
    <div className="pt-1">
      <SectionLabel className="mt-0">Capabilities</SectionLabel>
      {/* Two columns, one below 560: six lines in a single column is most of a
          phone screen before the counters are reached. */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-[7px] max-[560px]:grid-cols-1">
        {capabilities.map(({ field, color }) => (
          <CapabilityLine key={field.name} field={field} color={color} />
        ))}
      </div>

      <SectionLabel>Open incidents</SectionLabel>
      <div className="grid grid-cols-4 gap-2 max-[480px]:grid-cols-2">
        {counters.map(({ field, color }) => (
          <CounterTile key={field.name} field={field} color={color} />
        ))}
      </div>
    </div>
  );
}

/** One capability: its name, and the state it is in. */
function CapabilityLine({ field, color }: { field: HotspotField; color?: string }) {
  const tone = useSite().toneFor(field.value, field.tone);
  const tint = valueColor(field, tone, color);
  return (
    <div
      className="flex items-center justify-between gap-2.5 rounded-[8px] px-[11px] py-2"
      style={{ background: "rgba(255,255,255,0.04)" }}
    >
      <span
        className="nav-body min-w-0 truncate text-[12.5px]"
        style={{ color: "var(--nav-text-2)" }}
      >
        {field.label}
      </span>
      {/* CAPS, by the same rule the field grid follows: a toned value is a
          status flag, and flags are caps. A line that has gone to "2 events ·
          HIGH" ends in a severity word, which carries the severity scale rather
          than a tone, so its explicit colour wins. */}
      <span
        className="nav-display flex shrink-0 items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.03em]"
        style={{ color: tint }}
      >
        <span className="h-[6px] w-[6px] rounded-full" style={{ background: tint }} />
        {formatValue(field)}
      </span>
    </div>
  );
}

/** One counter: how many are open at that severity. */
function CounterTile({ field, color }: { field: HotspotField; color?: string }) {
  const tone = useSite().toneFor(field.value, field.tone);
  return (
    <div
      className="rounded-[8px] px-[11px] py-2.5"
      style={{ background: "rgba(255,255,255,0.04)" }}
    >
      <div
        className="nav-body text-[9.5px] font-semibold uppercase tracking-[0.07em]"
        style={{ color: "var(--nav-text-dim)" }}
      >
        {/* "Active Incidents", "High Severity" — under a heading that already
            says Open incidents, the qualifier is the heading's job and the tile
            keeps only the word that tells it from the other three. */}
        {field.label.split(" ")[0]}
      </div>
      <div
        className="nav-display mt-0.5 text-[21px] font-extrabold leading-none"
        style={{ color: valueColor(field, tone, color) }}
      >
        {formatValue(field)}
      </div>
    </div>
  );
}

/**
 * The six logical layers, as a row of chips.
 *
 * Click toggles one; the "Only" affordance is the click on a chip that is
 * already alone, which puts them all back. Two gestures would need two
 * controls, and the spec asks for one list of categories.
 */
function SecurityLayerToggles() {
  const categories = useSecurityStore((s) => s.categories);
  const toggleCategory = useSecurityStore((s) => s.toggleCategory);
  const anyOff = SECURITY_CATEGORIES.some((c) => !categories[c.key]);
  const shown = SECURITY_CATEGORIES.filter((c) => categories[c.key]).length;
  const showAll = useSecurityStore((s) => s.showAllCategories);

  return (
    <div
      className="mt-4 border-t pt-2 short:mt-3"
      style={{ borderColor: "var(--nav-divider)" }}
    >
      {/* THE COUNT IS IN THE HEADING, with the way back beside it: the row
          then says what it is doing without the presenter counting chips, and
          an off layer is one the heading has already accounted for. */}
      <div className="flex flex-wrap items-baseline gap-1.5 pb-2 pt-1">
        <div
          className="nav-body text-[10px] font-semibold uppercase tracking-[0.06em]"
          style={{ color: "var(--nav-text-dim)" }}
        >
          Layers · {shown} of {SECURITY_CATEGORIES.length} shown
        </div>
        {anyOff && (
          <>
            <span
              className="nav-body text-[10px] font-semibold"
              style={{ color: "var(--nav-text-faint)" }}
            >
              ·
            </span>
            <button
              type="button"
              onClick={showAll}
              className="nav-body cursor-pointer text-[10.5px] font-medium underline-offset-2 hover:underline"
              style={{ color: "var(--nav-text-dim)" }}
            >
              Show all
            </button>
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SECURITY_CATEGORIES.map((c) => (
          <LayerChip
            key={c.key}
            label={c.label}
            on={categories[c.key]}
            onClick={() => toggleCategory(c.key)}
          />
        ))}
      </div>
    </div>
  );
}

function LayerChip({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="nav-body cursor-pointer rounded-full px-2.5 py-1 text-[10.5px] font-medium transition-[background-color,border-color,color,opacity] duration-200"
      style={{
        // An off layer is dimmed rather than hidden: the row's length is how a
        // presenter knows what else there is to turn back on.
        background: on ? "var(--nav-accent)" : "rgba(255,255,255,0.06)",
        border: on ? "1.5px solid rgba(255,255,255,0.5)" : "1.5px solid var(--nav-border)",
        color: on ? "#ffffff" : "var(--nav-text-dim)",
        opacity: on ? 1 : 0.65,
      }}
    >
      {label}
    </button>
  );
}

/**
 * The incidents one field hotspot (S01-S06) currently has open.
 *
 * A hotspot's own fields are a single reading set, overwritten by each event it
 * raises, so with several open they describe only the latest. This lists them
 * the way S07 does, and the fields below stay as the live state of the system
 * itself.
 *
 * Silent when there is one or none: a single-item list above an identical field
 * grid is a second copy of what is already on screen.
 */
function SourceIncidents({ hotspotId }: { hotspotId: string }) {
  const incidents = useSecurityStore((s) => s.incidents);
  const selectedId = useSecurityStore((s) => s.selectedIncidentId);
  const setSelected = useSecurityStore((s) => s.setSelectedIncidentId);
  const [logFor, setLogFor] = useState<SecurityIncident | null>(null);

  const open = useMemo(
    () =>
      incidents.filter((i) => i.sourceHotspotId === hotspotId && i.status !== "RESOLVED"),
    [incidents, hotspotId],
  );

  if (open.length < 2) return null;

  // One is always selected here, because the field grid below reads from it:
  // deselecting would snap those readings back to whatever fired last while a
  // row above still looked like the subject. Defaults to the newest, which is
  // what the grid already shows.
  const activeId = open.some((i) => i.id === selectedId) ? selectedId : open[0].id;

  return (
    <div className="flex flex-col pt-1">
      <div
        className="nav-body pb-2 text-[10px] font-semibold uppercase tracking-[0.06em]"
        style={{ color: "var(--nav-text-dim)" }}
      >
        {open.length} active incidents
      </div>
      <div className="flex flex-col gap-1.5">
        {open.map((i) => (
          <IncidentRow
            key={i.id}
            incident={i}
            expanded={false}
            selected={i.id === activeId}
            compact
            onSelect={() => setSelected(i.id)}
            onShowLog={() => setLogFor(i)}
          />
        ))}
      </div>
      {logFor && <IncidentLogDialog incident={logFor} onClose={() => setLogFor(null)} />}
    </div>
  );
}

/**
 * S07, the incident centre.
 *
 * Two tabs, because "what needs attention now" and "what has already been dealt
 * with" are different questions asked at different moments, and a presenter
 * mid-demo should not have to read past a shift's worth of closed records to
 * find the incident they just raised.
 *
 * Filtered by severity and by the system that reported it, and sorted by either
 * time or severity. The past tab holds 15 records out of the box and grows as a
 * demo runs, which is more than reads at a glance without narrowing.
 *
 * A row expands in place to its detail, which is the shape the §4 field table
 * describes for ONE incident. Its own audit trail opens from there, in a dialog
 * over this card, because a log belongs to an incident rather than sitting
 * beside the list of them.
 */
function SecurityIncidentCentre() {
  const incidents = useSecurityStore((s) => s.incidents);
  const history = useSecurityStore((s) => s.history);
  const selectedId = useSecurityStore((s) => s.selectedIncidentId);
  const setSelected = useSecurityStore((s) => s.setSelectedIncidentId);

  const [wantedTab, setTab] = useState<"current" | "past">("current");
  // Empty means "everything", not "nothing": a filter with no choice made is
  // not a filter. Both are multi-select, so CRITICAL + HIGH is one question.
  const [severities, setSeverities] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [sort, setSort] = useState<string[]>(["time"]);
  const [logFor, setLogFor] = useState<SecurityIncident | null>(null);

  const current = useMemo(
    () => incidents.filter((i) => i.status !== "RESOLVED"),
    [incidents],
  );
  // Closed incidents from before this session, plus any resolved during it.
  // De-duplicated by id keeping the LIVE row, which is the one the actions
  // worked on, so a record does not appear twice after being resolved.
  const past = useMemo(() => {
    const resolved = incidents.filter((i) => i.status === "RESOLVED");
    const seen = new Set(resolved.map((i) => i.id));
    return [...resolved, ...history.filter((h) => !seen.has(h.id))];
  }, [incidents, history]);

  // DERIVED, not stored: with no live incidents the Current tab is disabled, so
  // the card shows Past whatever was last picked. A demo opens with nothing
  // live, and landing on an empty tab hides the fifteen records that ARE there
  // behind a click nobody knows to make. Computing it during render also means
  // resolving the last incident moves the card immediately, with no effect
  // firing a second render behind it.
  const hasCurrent = current.length > 0;
  const tab = hasCurrent ? wantedTab : "past";

  const bySeverity = sort[0] === "severity";
  const rows = useMemo(() => {
    const base = tab === "current" ? current : past;
    const filtered = base.filter(
      (i) =>
        (severities.length === 0 || severities.includes(i.severity)) &&
        (sources.length === 0 || sources.includes(i.sourceHotspotId)),
    );
    // Sorted on a COPY: these arrays are store state, and sorting in place
    // would mutate it behind everyone else reading them.
    return [...filtered].sort((a, b) =>
      bySeverity
        ? // Severity first, newest first within a severity. Two incidents of
          // equal weight are then ordered by when they were reported, which is
          // the only other thing that separates them.
          SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
          b.eventTime.localeCompare(a.eventTime)
        : b.eventTime.localeCompare(a.eventTime),
    );
  }, [tab, current, past, severities, sources, bySeverity]);

  // Counted on what the OTHER filter allows, so a chip's number is how many
  // rows it would actually add: narrowing to one system moves the four counts
  // under it. Not narrowed by the severity filter itself, which would leave
  // every chip reading its own selection back.
  const severityCounts = useMemo(() => {
    const out: Record<IncidentSeverity, number> = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      CRITICAL: 0,
    };
    for (const i of tab === "current" ? current : past) {
      if (sources.length === 0 || sources.includes(i.sourceHotspotId)) out[i.severity] += 1;
    }
    return out;
  }, [tab, current, past, sources]);

  // A filter that hides everything is a dead end, so the empty state says which
  // one to loosen rather than implying there is nothing there.
  const narrowed = severities.length > 0 || sources.length > 0;

  return (
    <div className="flex flex-col pt-1">
      <div className="flex gap-1.5 pb-2">
        <Chip
          label={`Current ${current.length}`}
          on={tab === "current"}
          disabled={!hasCurrent}
          onClick={() => setTab("current")}
        />
        <Chip
          label={`Past ${past.length}`}
          on={tab === "past"}
          onClick={() => setTab("past")}
        />
      </div>

      {/* Controls only when there is something to narrow. One or two rows do
          not need filtering, and a filter row over a two-item list is more
          chrome than content. */}
      {(tab === "current" ? current.length : past.length) > 1 && (
        <div className="border-t pt-2" style={{ borderColor: "var(--nav-divider)" }}>
          <SectionLabel className="mt-0">Filter</SectionLabel>
          <div className="flex flex-wrap items-center gap-1.5">
            {/* SEVERITY IS CHIPS, not a menu. There are only four, they are what
                the list is most often narrowed to, and a chip can carry its own
                count — which makes the row a reading of the day as well as a
                control over it. A level with nothing in it is disabled rather
                than dropped, so the four stay a fixed row that does not reflow
                as a demo runs. */}
            {SEVERITY_ORDER_UI.map((sv) => (
              <Chip
                key={sv}
                label={`${sv} ${severityCounts[sv]}`}
                dot={SEVERITY_COLOR[sv]}
                on={severities.includes(sv)}
                disabled={severityCounts[sv] === 0}
                onClick={() =>
                  setSeverities((prev) =>
                    prev.includes(sv) ? prev.filter((x) => x !== sv) : [...prev, sv],
                  )
                }
              />
            ))}
            {/* Six systems and two orderings stay menus: a chip each would be a
                second row as long as the first, for questions asked far less
                often. Both open leftward — they sit at the end of a wrapping
                row, and a menu anchored left would run off the card. */}
            <FilterSelect
              allLabel="All sources"
              items={SECURITY_SOURCES.map((x) => ({ id: x.hotspotId, label: x.label }))}
              value={sources}
              onChange={setSources}
              align="right"
              multi
            />
            <FilterSelect
              items={[
                { id: "time", label: "Newest first" },
                { id: "severity", label: "Severity" },
              ]}
              value={sort}
              onChange={setSort}
              align="right"
            />
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="nav-body py-3 text-[11px]" style={{ color: "var(--nav-text-faint)" }}>
          {narrowed
            ? "No incidents match these filters."
            : tab === "current"
              ? "No active incidents."
              : "No past incidents yet."}
        </p>
      ) : (
        <>
          {/* The layer narrates ONE day, so the list is headed with it rather
              than carrying the date on every row — which leaves each row's time
              column free to read as a time of day. Taken off the newest row,
              the only place the date is recorded. */}
          <SectionLabel>The day · {formatDay(rows[0].eventTime)}</SectionLabel>
          <div className="flex flex-col gap-1.5">
            {rows.map((i) => (
              <IncidentRow
                key={i.id}
                incident={i}
                expanded={i.id === selectedId}
                onSelect={() => setSelected(i.id === selectedId ? null : i.id)}
                onShowLog={() => setLogFor(i)}
              />
            ))}
          </div>
        </>
      )}

      {logFor && <IncidentLogDialog incident={logFor} onClose={() => setLogFor(null)} />}
    </div>
  );
}

/**
 * A filter dropdown: a pill showing what is selected, opening a list below it.
 *
 * `multi` toggles each row and keeps the menu open, because choosing two
 * severities is one question and closing after the first would make it two.
 * Single-select closes on pick, since the question is answered.
 *
 * THERE IS NO "ALL" ROW. An empty selection and a full one mean the same thing,
 * so the menu shows every item checked instead: "all severities" is a state you
 * can see and take one item out of, rather than a separate row that silently
 * disagrees with the ticks under it. Unticking the last item puts them all back
 * rather than showing nothing, since a filter matching nothing is never what
 * was meant.
 *
 * Selection is marked by a CHECK ALONE. A tinted, shadowed row reads as a
 * button that has been pressed rather than as an item that is included, and in
 * a multi-select list half the rows being tinted is just noise.
 *
 * Positioned absolutely within the card rather than portalled: this list lives
 * inside a dialog that already scrolls and is never clipped by a transformed
 * ancestor the way the map window clips `MapSelect`.
 */
function FilterSelect({
  label,
  allLabel,
  items,
  value,
  onChange,
  multi,
  align = "left",
}: {
  /** Omitted where the summary already says what the menu is: "All sources"
   *  and "Newest first" name themselves, and a "Source" in front of them is a
   *  word the chip pays width for and the reader skips. */
  label?: string;
  allLabel?: string;
  items: { id: string; label: string; dot?: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  multi?: boolean;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape closes the MENU first, leaving the card open behind it.
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  // Empty means everything, so an empty selection ticks every row.
  const all = multi && value.length === 0;
  const isOn = (id: string) => all || value.includes(id);
  const selected = items.filter((i) => value.includes(i.id));
  const summary =
    !multi
      ? (items.find((i) => i.id === value[0])?.label ?? items[0]?.label ?? "")
      : selected.length === 0 || selected.length === items.length
        ? (allLabel ?? "All")
        : selected.length === 1
          ? selected[0].label
          : `${selected[0].label} +${selected.length - 1}`;

  const toggle = (id: string) => {
    if (!multi) {
      onChange([id]);
      setOpen(false);
      return;
    }
    // From "all ticked", the first click means "only this one": that is what
    // clicking one item out of a full set is asking for.
    if (all) {
      onChange([id]);
      return;
    }
    const next = value.includes(id) ? value.filter((v) => v !== id) : [...value, id];
    // Emptied, or filled: both are "everything", stored as the empty set so
    // there is one representation of it rather than two.
    onChange(next.length === 0 || next.length === items.length ? [] : next);
  };

  // Narrowed is what earns the accent; sort and an untouched filter are neutral
  // chrome. A sort control is never "on", it always has a value.
  const narrowed = multi && value.length > 0;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="nav-body flex cursor-pointer items-center gap-1.5 rounded-full py-1 pl-2.5 pr-2 text-[10.5px] font-medium transition-[background-color,border-color] duration-200 hover:brightness-125"
        style={{
          background: narrowed ? "var(--nav-accent)" : "rgba(255,255,255,0.06)",
          border: narrowed
            ? "1.5px solid rgba(255,255,255,0.5)"
            : "1.5px solid var(--nav-border)",
          color: narrowed ? "#ffffff" : "var(--nav-text-dim)",
        }}
      >
        {label && <span style={{ opacity: 0.7 }}>{label}</span>}
        <span className="max-w-[140px] truncate">{summary}</span>
        <ChevronDown
          size={12}
          style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 200ms" }}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable={multi}
          className={cn(
            "ui-scrollbar absolute top-[calc(100%+4px)] z-10 max-h-[220px] w-[max(170px,100%)] overflow-y-auto rounded-[10px] p-1",
            align === "right" ? "right-0" : "left-0",
          )}
          style={{
            // Opaque, not glass: this list sits over the card's own text, and a
            // translucent menu leaves both readable at once and neither legible.
            background: "#11151c",
            border: "1.5px solid var(--nav-border)",
            boxShadow: "var(--nav-shadow-panel)",
          }}
        >
          {items.map((i) => {
            const on = isOn(i.id);
            return (
              <button
                key={i.id}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => toggle(i.id)}
                className="nav-body flex w-full cursor-pointer items-center gap-1.5 rounded-[7px] px-2 py-1.5 text-left text-[11px] transition-[color] duration-150 hover:brightness-125"
                style={{ color: on ? "var(--nav-text)" : "var(--nav-text-dim)" }}
              >
                {i.dot && (
                  <span
                    className="h-[6px] w-[6px] shrink-0 rounded-full"
                    style={{ background: i.dot }}
                  />
                )}
                <span className="min-w-0 flex-1 truncate">{i.label}</span>
                {/* Always rendered, hidden when off: a check that appears and
                    disappears reflows every row beside it. */}
                <Check
                  size={12}
                  className="shrink-0"
                  style={{ opacity: on ? 1 : 0 }}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Fields that identify the DEVICE rather than report an event.
 *
 * Always shown on a field hotspot's grid, whichever incident is selected: they
 * say which camera or which zone is speaking, which is context for any event
 * rather than a reading belonging to one.
 */
const IDENTITY_FIELDS = new Set([
  "camera_id",
  "zone_id",
  "zone_type",
  "container_id",
  "seal_id",
  "truck_id",
  "vehicle_id",
  "event_id",
]);

/**
 * Avatar colours. One per operator, assigned by `SecurityActor.tone`, so the
 * same person is the same colour everywhere they appear in a log.
 */
const AVATAR_COLORS = [
  "#4a7dff",
  "#12b886",
  "#c77dff",
  "#ff9f43",
  "#2aa9c9",
  "#e8638b",
];

/**
 * An operator's initials, with their name on hover.
 *
 * The name is a tooltip rather than a label beside it: six initials down the
 * right edge read as a column of who-did-what, and spelling each one out would
 * cost more width than the log's own text.
 *
 * Drawn rather than left to the browser's `title`, which waits about a second
 * and renders in the OS style. This is a demonstration; a name should appear
 * when the presenter points at it. `title` is kept as well, so the name is
 * still there for anything reading the page rather than looking at it.
 */
function Avatar({ actor }: { actor: SecurityActor }) {
  const color = AVATAR_COLORS[actor.tone % AVATAR_COLORS.length];
  const [hovered, setHovered] = useState(false);
  // Above or below, decided on hover from where the avatar actually sits: the
  // log scrolls inside a clipped box, so a tooltip under the last row would be
  // cut in half by the edge of it.
  const [above, setAbove] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  const onEnter = () => {
    const box = ref.current?.closest(".ui-scrollbar")?.getBoundingClientRect();
    const me = ref.current?.getBoundingClientRect();
    if (box && me) setAbove(box.bottom - me.bottom < 34);
    setHovered(true);
  };

  return (
    <span
      ref={ref}
      className="relative flex shrink-0"
      onMouseEnter={onEnter}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        title={actor.name}
        aria-label={actor.name}
        className="nav-body flex h-[20px] w-[20px] items-center justify-center rounded-full text-[9px] font-semibold"
        style={{
          background: `color-mix(in srgb, ${color} 26%, transparent)`,
          border: `1px solid color-mix(in srgb, ${color} 55%, transparent)`,
          color,
        }}
      >
        {actor.initials}
      </span>
      {hovered && (
        <span
          role="tooltip"
          // Right-anchored: the avatar sits at the row's right edge, so a
          // centred tooltip would hang off the dialog on the longer names.
          className={cn(
            "nav-body pointer-events-none absolute right-0 z-20 whitespace-nowrap rounded-[7px] px-2 py-1 text-[10.5px] font-medium",
            above ? "bottom-[calc(100%+5px)]" : "top-[calc(100%+5px)]",
          )}
          style={{
            background: "#11151c",
            border: "1.5px solid var(--nav-border)",
            boxShadow: "var(--nav-shadow-panel)",
            color: "var(--nav-text)",
          }}
        >
          {actor.name}
        </span>
      )}
    </span>
  );
}

/**
 * Times and dates, US format with AM/PM.
 *
 * Pinned to `en-US` rather than the viewer's locale: this is a demonstration
 * given to an audience, and it should read identically on whatever machine is
 * driving it. `eventTime` is authored as "YYYY-MM-DD HH:MM:SS", which is parsed
 * as LOCAL time by design here: those strings describe a clock at the terminal,
 * not an instant in UTC, so they are displayed exactly as authored.
 */
function formatClock(value: string): string {
  const d = parseDemoTime(value);
  if (!d) return value;
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatStamp(value: string): string {
  const d = parseDemoTime(value);
  if (!d) return value;
  return `${d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`;
}

/** The date alone, for the heading over a day's records. */
function formatDay(value: string): string {
  const d = parseDemoTime(value);
  if (!d) return value;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Accepts both shapes this layer stores: the authored "YYYY-MM-DD HH:MM:SS"
 *  and the ISO stamp a live action writes. */
function parseDemoTime(value: string): Date | null {
  const d = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Highest first, the order the menu reads in. */
const SEVERITY_ORDER_UI: IncidentSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

function Chip({
  label,
  on,
  dot,
  disabled,
  onClick,
}: {
  label: string;
  on: boolean;
  dot?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className="nav-body flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-medium transition-[background-color,border-color,color,opacity] duration-200 enabled:cursor-pointer"
      style={{
        background: on ? "var(--nav-accent)" : "rgba(255,255,255,0.06)",
        border: on ? "1.5px solid rgba(255,255,255,0.5)" : "1.5px solid var(--nav-border)",
        color: on ? "#ffffff" : "var(--nav-text-dim)",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {dot && (
        <span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: dot }} />
      )}
      {label}
    </button>
  );
}

/** Status to the card's tone colours, per §6's visual-state contract. */
const STATUS_TONE: Record<IncidentStatus, Tone> = {
  ACTIVE: "alert",
  INVESTIGATING: "warn",
  RESOLVED: "ok",
};

function IncidentRow({
  incident,
  expanded,
  selected,
  compact,
  onSelect,
  onShowLog,
}: {
  incident: SecurityIncident;
  expanded: boolean;
  /** Marked as the subject without opening. Used by the compact list, where
   *  what is selected is described by the field grid under it. */
  selected?: boolean;
  /**
   * No expandable detail.
   *
   * Set on a field hotspot's list, where the card's own field grid below IS the
   * selected incident's detail: expanding a row there would print the same
   * readings twice, once in a panel and once in the grid.
   */
  compact?: boolean;
  onSelect: () => void;
  onShowLog: () => void;
}) {
  const acknowledge = useSecurityStore((s) => s.acknowledgeIncident);
  const escalate = useSecurityStore((s) => s.escalateIncident);
  const deescalate = useSecurityStore((s) => s.deescalateIncident);
  const resolve = useSecurityStore((s) => s.resolveIncident);
  const { goToLayout, find: findLayout } = useLayoutNavigation();
  const audit = useSecurityStore((s) => s.audit);
  const closed = incident.status === "RESOLVED";

  // Read off the LOG rather than stored on the incident. Who owns it, how long
  // it took and how much was written about it are all already recorded there,
  // and a second copy of any of them is one that can disagree with the trail it
  // claims to summarise.
  const mine = useMemo(
    () => audit.filter((e) => e.incidentId === incident.id),
    [audit, incident.id],
  );
  const owner = useMemo(() => ownerOf(mine), [mine]);
  const closedIn = useMemo(() => (closed ? closedDuration(mine) : null), [mine, closed]);

  // §4's VIEW LOCATION: "navigates to the parent Layout". Security Mode TRAVELS
  // WITH the operator rather than ending here, so the incident's anchor is seen
  // in its real surroundings with the rest of the layer still up. The mode's
  // remembered return is untouched, so the shield still goes back to wherever
  // the operator entered from, not to the layout this jumped to.
  //
  // The card closes itself on the way: `goToLayout` clears `hotspotInfo`, and
  // the trip is a blackout the card would otherwise be floating over.
  const target = incident.navigationTarget;
  const canTravel = !!findLayout(target);

  const isOpen = expanded && !compact;

  return (
    <div
      className="rounded-[10px] transition-[border-color,background-color] duration-200"
      style={{
        background: "rgba(255,255,255,0.06)",
        // Selected without being open: the ring is how a compact row says it is
        // the one the grid below is describing.
        border:
          selected && compact
            ? "1.5px solid rgba(255,255,255,0.45)"
            : "1.5px solid var(--nav-border)",
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-expanded={compact ? undefined : expanded}
        aria-pressed={compact ? !!selected : undefined}
        className="flex w-full min-w-0 cursor-pointer items-center gap-2.5 px-3 py-2 text-left"
      >
        {/* WHEN, WHAT, HOW BAD, WHO — one line, read left to right, which is
            how a day's log is scanned. The time leads because a list sorted
            newest-first is being read as a sequence. */}
        <span
          className="nav-body shrink-0 tabular-nums text-[11px]"
          style={{ color: "var(--nav-text-faint)" }}
        >
          {formatClock(incident.eventTime)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            className="nav-display truncate text-[12.5px] font-semibold"
            style={{ color: "var(--nav-text)" }}
          >
            {incident.type}
          </span>
          {/* The system and the place, never the anchor id: S01-S08 are
              internal references. The record number moved into the detail,
              where it is read once rather than in front of every row. */}
          <span
            className="nav-body truncate text-[10.5px]"
            style={{ color: "var(--nav-text-faint)" }}
          >
            {incident.source} · {incident.locationLabel}
          </span>
        </span>
        <SeverityPill severity={incident.severity} />
        {owner && <Avatar actor={owner} />}
      </button>

      {/* The compact list keeps the actions, which is what a row is FOR, but
          drops the detail panel the grid below already shows. */}
      {compact && selected && (
        <div
          className="flex flex-wrap items-center gap-1.5 border-t px-3 pb-2 pt-2"
          style={{ borderColor: "var(--nav-divider)" }}
        >
          {!closed && (
            <>
              <RowAction
                label="Acknowledge"
                disabled={incident.acknowledged}
                onClick={() => acknowledge(incident.id)}
              />
              <RowAction
                label="Escalate"
                disabled={incident.severity === "CRITICAL"}
                onClick={() => escalate(incident.id)}
              />
              <RowAction
                label="De-escalate"
                disabled={incident.severity === "LOW"}
                onClick={() => deescalate(incident.id)}
              />
              <RowAction label="Resolve" onClick={() => resolve(incident.id)} />
            </>
          )}
          <RowAction label={auditLabel(mine.length)} onClick={onShowLog} />
          {canTravel && (
            <RowAction
              label="View location"
              onClick={() => {
                useSecurityStore.getState().setViewingIncidentId(incident.id);
                goToLayout(target);
              }}
            />
          )}
        </div>
      )}

      {isOpen && (
        <div className="px-1.5 pb-1.5">
          {/* A BLOCK INSIDE the row rather than a continuation of it: the tint
              says these readings belong to the row above, where a dividing line
              would have made them the next thing in the list. */}
          <div
            className="rounded-[9px] px-3.5 py-3"
            style={{ background: "rgba(255,255,255,0.045)" }}
          >
            <dl className="grid grid-cols-2 gap-x-5 max-[560px]:grid-cols-1">
              <DetailRow label="Record" value={incident.id} />
              <DetailRow label="Type" value={incident.type} />
              <DetailRow
                label="Severity"
                value={incident.severity}
                color={SEVERITY_COLOR[incident.severity]}
              />
              {/* Status stands in for Acknowledged, which was the same fact told
                  twice: acknowledging is what moves an incident to
                  INVESTIGATING. */}
              <DetailRow
                label="Status"
                value={incident.status}
                color={TONE_COLOR[STATUS_TONE[incident.status]]}
              />
              <DetailRow label="Source" value={incident.source} />
              {incident.sourceId && <DetailRow label="Source ID" value={incident.sourceId} />}
              <DetailRow label="Location" value={incident.locationLabel} />
              <DetailRow label="Event time" value={formatStamp(incident.eventTime)} />
              <DetailRow label="Assigned team" value={incident.assignedTeam} />
              {/* Closed records only, and MEASURED from the log's own two
                  moments rather than stored beside them. */}
              {closedIn && <DetailRow label="Closed in" value={closedIn} />}
            </dl>

            {/* The four that CHANGE the incident are hidden once it is resolved;
                the two that only look at it stay, because where a past incident
                happened and what was done about it are exactly what a closed
                record is for. */}
            <div className="flex flex-wrap items-center gap-2 pt-3">
              {!closed && (
                <>
                  <RowAction
                    label="Acknowledge"
                    disabled={incident.acknowledged}
                    onClick={() => acknowledge(incident.id)}
                  />
                  <RowAction
                    label="Escalate"
                    disabled={incident.severity === "CRITICAL"}
                    onClick={() => escalate(incident.id)}
                  />
                  <RowAction
                    label="De-escalate"
                    disabled={incident.severity === "LOW"}
                    onClick={() => deescalate(incident.id)}
                  />
                  <RowAction label="Resolve" onClick={() => resolve(incident.id)} />
                </>
              )}
              {/* The trail first: on a closed record these two are all there is,
                  and what was done about it is read before where it happened. */}
              <RowAction label={auditLabel(mine.length)} onClick={onShowLog} />
              {canTravel && (
                <RowAction
                  label="View location"
                  onClick={() => {
                    // Latched BEFORE the trip: `goToLayout` clears `hotspotInfo`,
                    // which unmounts this card, so anything set afterwards would
                    // be set by a component on its way out.
                    useSecurityStore.getState().setViewingIncidentId(incident.id);
                    goToLayout(target);
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The severity, as the row reads it: the keyword itself on its own tint rather
 * than a dot, so a list scanned down its right edge gives the levels without a
 * legend. The background is the same colour at low alpha, which keeps the one
 * four-colour scale the rest of the layer uses.
 */
function SeverityPill({ severity }: { severity: IncidentSeverity }) {
  const color = SEVERITY_COLOR[severity];
  return (
    <span
      className="nav-body shrink-0 rounded-[4px] px-[7px] py-[2px] text-[10px] font-bold tracking-[0.06em]"
      style={{ color, background: `color-mix(in srgb, ${color} 18%, transparent)` }}
    >
      {severity}
    </span>
  );
}

/**
 * Who owns an incident: the operator on its most recent audited action.
 *
 * Not a field on the incident. An incident's owner is whoever last worked it,
 * and hand-offs happen — so the answer is in the log, and reading it from there
 * means the avatar on the row and the avatar on the last log line can never be
 * two different people. The detection line has no operator, so an incident
 * nobody has touched yet has none either.
 */
function ownerOf(entries: SecurityAuditEntry[]): SecurityActor | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].actor) return entries[i].actor;
  }
  return undefined;
}

/**
 * How long a closed incident took, from its first log line to the one that
 * resolved it.
 *
 * Both stamps come from the same clock in either case — authored throughout for
 * a seeded record, wall-clock throughout for one raised during a run — so the
 * difference is meaningful even though the layer's event times are synthetic.
 */
function closedDuration(entries: SecurityAuditEntry[]): string | null {
  const first = entries[0];
  const resolved = [...entries].reverse().find((e) => e.action === "incident_resolved");
  if (!first || !resolved) return null;
  const ms = Date.parse(resolved.at) - Date.parse(first.at);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return h ? `${h}h ${m}m ${sec}s` : `${m}m ${sec}s`;
}

/** The trail's button, which says how much is in it before it is opened. */
function auditLabel(count: number): string {
  return `Audit trail · ${count} ${count === 1 ? "entry" : "entries"}`;
}

function DetailRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  /** Overrides the value's colour. Set for severity, which is a status word
   *  rather than a reading and carries its level in its colour. */
  color?: string;
}) {
  return (
    <div
      className="flex min-w-0 flex-col border-b py-[5px]"
      style={{ borderColor: "var(--nav-divider)" }}
    >
      <dt
        className="nav-body text-[10.5px] font-medium"
        style={{ color: "var(--nav-text-faint)" }}
      >
        {label}
      </dt>
      <dd
        className="nav-display truncate text-[12px] font-semibold"
        style={{ color: color ?? "var(--nav-text)" }}
      >
        {value}
      </dd>
    </div>
  );
}

function RowAction({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="nav-body rounded-[8px] px-[11px] py-[5px] text-[11px] font-semibold transition-[background-color,opacity] duration-200 enabled:cursor-pointer enabled:hover:brightness-125"
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1.5px solid var(--nav-border)",
        color: "var(--nav-text-2)",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {label}
    </button>
  );
}

/**
 * One incident's audit trail, in a dialog over the card.
 *
 * Filtered to the entries naming this incident, oldest first: a single
 * incident's log is a story with a beginning (its trigger) and is read forward,
 * unlike the whole-session log which is scanned backward for what just
 * happened.
 *
 * `at` is the one real timestamp in this layer, recording when the presenter
 * pressed the button rather than the synthetic time the demo narrates. Seeded
 * history carries authored times, having no interaction to record.
 */
function IncidentLogDialog({
  incident,
  onClose,
}: {
  incident: SecurityIncident;
  onClose: () => void;
}) {
  const audit = useSecurityStore((s) => s.audit);
  const entries = useMemo(
    () => audit.filter((e) => e.incidentId === incident.id),
    [audit, incident.id],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Capture + stop, so Escape closes THIS dialog and not the card beneath.
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[140] flex items-center justify-center">
      <button
        aria-label="Close"
        onClick={onClose}
        className="pointer-events-auto absolute inset-0 cursor-default"
        // A real scrim, not a tint. The panels here are ~52% opaque glass, so a
        // light wash left the card legible straight through the dialog on top
        // of it and the two read as one stack of text. Blurring as well as
        // darkening puts the card definitively behind: still visible as
        // context, no longer readable as content.
        style={{
          background: "rgba(0,0,0,0.62)",
          backdropFilter: "blur(3px)",
          WebkitBackdropFilter: "blur(3px)",
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${incident.id} audit log`}
        style={{ ...NAV_GLASS_PANEL, border: "1.5px solid var(--nav-border)" }}
        className="pointer-events-auto flex max-h-[min(70dvh,calc(100dvh-32px))] w-[min(460px,calc(100vw-32px))] flex-col overflow-hidden rounded-[14px] p-5 short:max-h-[calc(100dvh-16px)] short:scale-[0.85] short:rounded-[10px] short:p-4"
      >
        <PanelHeader title="Incident log" subtitle={incident.id} onClose={onClose} />

        <div className="ui-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {entries.length === 0 ? (
            <p className="nav-body py-2 text-[11px]" style={{ color: "var(--nav-text-faint)" }}>
              No log entries for this incident.
            </p>
          ) : (
            <ol className="flex flex-col">
              {entries.map((e) => (
                <li
                  key={e.seq}
                  className="flex min-w-0 items-center gap-2 border-b py-[7px] last:border-b-0"
                  style={{ borderColor: "var(--nav-divider)" }}
                >
                  <span
                    className="nav-body w-[62px] shrink-0 text-[10px] tabular-nums"
                    style={{ color: "var(--nav-text-faint)" }}
                  >
                    {formatClock(e.at)}
                  </span>
                  <span
                    className="nav-body min-w-0 flex-1 text-[11px]"
                    style={{ color: "var(--nav-text-2)" }}
                  >
                    {e.detail}
                  </span>
                  {/* The operator, on the right. A detection has none: a camera
                      saw it, not a person, and inventing an operator for the
                      machine's own line would misdescribe the record. */}
                  {e.actor ? (
                    <Avatar actor={e.actor} />
                  ) : (
                    <span className="h-[20px] w-[20px] shrink-0" aria-hidden />
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

export default HotspotDataCard;
