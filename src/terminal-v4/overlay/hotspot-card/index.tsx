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

/** Reading shadow, set once on the card and INHERITED by every glyph in it.
 *  A tight plate plus a wider halo: the offset drop alone left the tone words
 *  - green on pale glass - with no edge. On a translucent panel this is what
 *  carries contrast, not the colour. */
const CARD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.85), 0 0 6px rgba(0,0,0,0.45)";

/** Grid rows the still spans: it is 200px tall, which is four of them. */
const FIELDS_BESIDE_STILL = 4;
const TONE_COLOR: Record<Tone, string> = {
  ok: "var(--tone-ok, #30d158)",
  warn: "var(--tone-warn, #ffb020)",
  alert: "var(--tone-alert, #c0342b)",
};

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

function Field({ field, color }: { field: HotspotField; color?: string }) {
  const tone = useSite().toneFor(field.value, field.tone);
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
        className="nav-body text-[12.5px] font-medium max-sm:text-[11.5px] short:text-[11.5px]"
        style={{ color: "var(--nav-text-2)" }}
      >
        {field.label}
      </h3>
      <h2
        className={cn(
          "nav-display truncate text-[17px] font-semibold leading-snug max-sm:text-[15px] short:text-[15px]",
          flag && "uppercase tracking-[0.02em]",
        )}
        style={{
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

function valueColor(field: HotspotField, tone: Tone | undefined, color?: string): string {
  return color ?? (field.type === "enum" && tone ? TONE_COLOR[tone] : "var(--nav-text)");
}

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
  hotspotId?: string;
  onClose: () => void;
}

export { StillPreload };

export function HotspotDataCard({ destId, index, hotspotId: namedId, onClose }: HotspotDataCardProps) {
  const site = useSite();
  const securityById = useSecurityStore((s) => s.hotspotById);
  const isIncidentCentre = namedId === SECURITY_INCIDENT_ID;
  const layout = site.layoutById[destId];
  const hotspotId = namedId ?? layout?.hotspots[index - 1];
  const hotspot = hotspotId
    ? (site.hotspotById[hotspotId] ?? securityById[hotspotId])
    : undefined;

  const incidents = useSecurityStore((s) => s.incidents);
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

    const seed = seedById[hotspot.id]?.fields ?? hotspot.fields;
    return seed
      .filter((f) => f.name in patch || IDENTITY_FIELDS.has(f.name))
      .map((f) => ({
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
      <button
        aria-label="Close"
        onClick={onClose}
        className="pointer-events-auto absolute inset-0 cursor-default"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={hotspot.popupTitle}
        style={{
          ...NAV_GLASS_PANEL,
          border: "1.5px solid var(--nav-border)",
          textShadow: CARD_TEXT_SHADOW,
        }}
        className={cn(
          "pointer-events-auto flex flex-col overflow-hidden rounded-[14px] p-6 short:origin-center short:scale-[0.85] short:rounded-[10px] short:p-4",
          "max-sm:rounded-[12px] max-sm:p-4",
          "w-[min(620px,calc(100vw-32px))] max-sm:w-[min(340px,calc(100vw-40px))]",
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

        {/* Body scrolls if the card would outgrow the viewport — the width does
            the spreading, the height stays capped. */}
        <div className="ui-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto overflow-x-hidden max-sm:mt-2 short:mt-2">
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

          {hotspotId === SECURITY_COMMAND_ID && <SecurityCommandView fields={fields} />}

          {hotspotId === SECURITY_INCIDENT_ID && <SecurityIncidentCentre />}

          {hotspotId && isFieldHotspot(hotspotId) && (
            <SourceIncidents hotspotId={hotspotId} />
          )}

          {hotspotId === SECURITY_COMMAND_ID && <SecurityLayerToggles />}

          {/* Two columns so the card spends its width, not its height — the
              reference's own treatment for its details table. */}
          <div
            className="mt-4 border-t pt-1 short:mt-3"
            style={{ borderColor: "var(--nav-divider)" }}
            hidden={
              hotspotId === SECURITY_INCIDENT_ID || hotspotId === SECURITY_COMMAND_ID
            }
          >
            {/* ONE GRID, so every row shares two columns. The still is placed
                in column 1 for the first four rows and the readings flow round
                it - four into column 2 beside it, the rest across both below.
                As two grids the under-block's columns started at the card edge
                and its own midpoint, neither of which lined up with the column
                beside the picture. */}
            <div className="grid grid-cols-2 gap-x-8 max-[560px]:grid-cols-1 max-sm:gap-x-5 short:gap-x-5">
              {still && (
                <div
                  className="hidden [perspective:1100px] sm:block"
                  style={{ gridColumn: 1, gridRow: `1 / span ${FIELDS_BESIDE_STILL}` }}
                >
                  <figure
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
              {fields.map(({ field, color }) => (
                <Field key={field.name} field={field} color={color} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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

function SecurityCommandView({
  fields,
}: {
  fields: { field: HotspotField; color?: string }[];
}) {
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
  const past = useMemo(() => {
    const resolved = incidents.filter((i) => i.status === "RESOLVED");
    const seen = new Set(resolved.map((i) => i.id));
    return [...resolved, ...history.filter((h) => !seen.has(h.id))];
  }, [incidents, history]);

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

      {(tab === "current" ? current.length : past.length) > 1 && (
        <div className="border-t pt-2" style={{ borderColor: "var(--nav-divider)" }}>
          <SectionLabel className="mt-0">Filter</SectionLabel>
          <div className="flex flex-wrap items-center gap-1.5">
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

function FilterSelect({
  label,
  allLabel,
  items,
  value,
  onChange,
  multi,
  align = "left",
}: {
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

const AVATAR_COLORS = [
  "#4a7dff",
  "#12b886",
  "#c77dff",
  "#ff9f43",
  "#2aa9c9",
  "#e8638b",
];

function Avatar({ actor }: { actor: SecurityActor }) {
  const color = AVATAR_COLORS[actor.tone % AVATAR_COLORS.length];
  const [hovered, setHovered] = useState(false);
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

  const mine = useMemo(
    () => audit.filter((e) => e.incidentId === incident.id),
    [audit, incident.id],
  );
  const owner = useMemo(() => ownerOf(mine), [mine]);
  const closedIn = useMemo(() => (closed ? closedDuration(mine) : null), [mine, closed]);

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

function ownerOf(entries: SecurityAuditEntry[]): SecurityActor | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].actor) return entries[i].actor;
  }
  return undefined;
}

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
        style={{
          ...NAV_GLASS_PANEL,
          border: "1.5px solid var(--nav-border)",
          textShadow: CARD_TEXT_SHADOW,
        }}
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
