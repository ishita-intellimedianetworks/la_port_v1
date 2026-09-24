"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Pause, Play, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { useSite } from "@/config/context";
import {
  CATEGORY_BY_HOTSPOT,
  SECURITY_SOURCES,
  incidentCounts,
  isFieldHotspot,
  useSecurityStore,
  type IncidentSeverity,
  type IncidentStatus,
  type SecurityActor,
  type SecurityIncident,
} from "../../stores/security-store";
import type { HotspotConfig, HotspotField, Tone } from "@/config/schema";
import { NAV_GLASS_PANEL } from "../glass-theme";
import { PanelHeader } from "../destination-panel/panel-header";
import { useLayoutNavigation } from "../use-layout-navigation";
import { useIsHandheld, useIsMobile } from "@/shared/responsive";

const CARD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.6), 0 0 4px rgba(0,0,0,0.25)";

const FIELDS_BESIDE_STILL = 4;

const STILL_SIZES = "280px";
const STILL_PANEL_SIZES = "(max-width: 1440px) 42vw, 640px";
const fluid = (phone: number, desktop: number) => {
  const slope = (desktop - phone) / 510;
  return `clamp(${phone}px, ${(phone - slope * 390).toFixed(2)}px + ${(slope * 100).toFixed(3)}vmin, ${desktop}px)`;
};

const CARD_SCALE = {
  "--fs-title": fluid(12.5, 22),
  "--fs-sub": fluid(9.5, 13.5),
  "--fs-label": fluid(8, 11.5),
  "--fs-value": fluid(10.5, 17),
  "--fs-hero": fluid(13, 28),
  "--fs-stat": fluid(16, 38),
  "--fs-ident": fluid(10.5, 18),
  "--fs-row": fluid(10, 15),
  "--fs-meta": fluid(8.5, 12),
  "--sp-pad": fluid(10, 28),
  "--sp-gap": fluid(7, 20),
  "--sp-tile": fluid(7, 20),
  "--sp-row": fluid(4, 12),
} as React.CSSProperties;

const TIME_FIELDS = new Set(["event_time", "detection_time", "duration"]);
const HERO_FIELDS = ["security_status", "risk_state", "incident_status", "event_type", "zone_status"];
const POSTER_SIZES = "(max-width: 892px) 100vw, 860px";
const TONE_COLOR: Record<Tone, string> = {
  ok: "var(--tone-ok, #30d158)",
  warn: "var(--tone-warn, #ffb020)",
  alert: "var(--tone-alert, #ff5c5c)",
};

const CARD_GLASS = "var(--nav-glass-sheen), rgba(9, 11, 15, 0.48)";
const CARD_FROST = "blur(30px) saturate(150%) brightness(0.78)";
const ALERT_SURFACE = "linear-gradient(90deg, rgba(182,44,34,0.52), rgba(182,44,34,0.16))";
const CAUTION_SURFACE = "linear-gradient(90deg, rgba(255,176,32,0.30), rgba(255,176,32,0.08))";

const SEVERITY_COLOR: Record<IncidentSeverity, string> = {
  LOW: "var(--tone-ok, #30d158)",
  MEDIUM: "var(--tone-warn, #ffb020)",
  HIGH: "var(--tone-alert, #ff5c5c)",
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

function Field({
  field,
  color,
  wrap,
}: {
  field: HotspotField;
  color?: string;
  /** Let a long reading take a second line instead of losing its tail. Set on
   *  a clip card, whose four columns are narrower than a value can need. */
  wrap?: boolean;
}) {
  const tone = useSite().toneFor(field.value, field.tone);
  const flag = !field.pending && !!tonedColor(field, tone);
  const meter =
    field.render === "meter" && typeof field.value === "number"
      ? Math.max(0, Math.min(1, field.value / (field.max ?? 100)))
      : null;

  return (
    <div
      className="flex min-w-0 flex-col justify-start border-b py-[var(--hs-row-y,9px)] max-sm:py-[6px] short:py-[6px]"
      style={{ borderColor: "var(--nav-divider)" }}
    >
      <h3
        className="nav-body text-[length:var(--fs-label,11.5px)] font-semibold uppercase tracking-[0.08em]"
        style={{ color: "var(--nav-text)" }}
      >
        {field.label}
      </h3>
      <h2
        className={cn(
          "nav-display mt-[3px] text-[length:var(--fs-value,19px)] font-bold leading-snug",
          wrap ? "break-words" : "truncate",
          flag && "uppercase tracking-[0.02em]",
        )}
        style={{
          color: field.pending ? "var(--nav-text)" : valueColor(field, tone, color),
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

/** A reading with nothing in it. An em dash is a placeholder for a value that
 *  has not happened yet, and a row that says nothing is a row that should not
 *  be on the card at all. */
function isBlank(field: HotspotField): boolean {
  if (field.pending) return false;
  const v = field.value;
  if (v === null || v === undefined) return true;
  if (typeof v !== "string") return false;
  const t = v.trim();
  return t === "" || t === "—" || t === "-";
}

function tonedColor(field: HotspotField, tone: Tone | undefined): string | undefined {
  if (!tone) return undefined;
  return field.type === "enum" || field.tone != null ? TONE_COLOR[tone] : undefined;
}

function valueColor(field: HotspotField, tone: Tone | undefined, color?: string): string {
  return color ?? tonedColor(field, tone) ?? "var(--nav-text)";
}

function SectionLabel({
  children,
  aside,
  className,
}: {
  children: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-2.5 mt-5 flex items-baseline justify-between gap-3", className)}>
      <span
        className="nav-body text-[length:var(--fs-label,11.5px)] font-semibold uppercase tracking-[0.08em]"
        style={{ color: "var(--nav-text)" }}
      >
        {children}
      </span>
      {aside && (
        <span
          className="nav-body shrink-0 tabular-nums text-[length:var(--fs-label,11.5px)] font-medium"
          style={{ color: "var(--nav-text)" }}
        >
          {aside}
        </span>
      )}
    </div>
  );
}

interface HotspotDataCardProps {
  destId: string;
  index: number;
  hotspotId?: string;
  onClose: () => void;
}

export { StillPreload };

export function HotspotDataCard({ destId, index, hotspotId: namedId, onClose }: HotspotDataCardProps) {
  const site = useSite();
  const securityById = useSecurityStore((s) => s.hotspotById);
  const isSecurityCentre = namedId === SECURITY_CENTRE_ID;
  const layout = site.layoutById[destId];
  const hotspotId = namedId ?? layout?.hotspots[index - 1];
  const hotspot = hotspotId
    ? (site.hotspotById[hotspotId] ?? securityById[hotspotId])
    : undefined;
  const isSecurity = !!hotspotId && !!securityById[hotspotId];
  const handheld = useIsHandheld();
  const mobile = useIsMobile();
  const stacked = handheld || mobile;
  const designed = isSecurity && !isSecurityCentre;
  const centreWide = isSecurityCentre && !stacked;

  const incidents = useSecurityStore((s) => s.incidents);
  const incidentFields = useSecurityStore((s) => s.incidentFields);
  const seedById = useSecurityStore((s) => s.seedHotspotById);
  const selectedIncidentId = useSecurityStore((s) => s.selectedIncidentId);
  const [zoomed, setZoomed] = useState(false);
  const fields = useMemo(() => {
    if (!hotspot) return [];
    if (hotspotId === SECURITY_CENTRE_ID) {
      return commandViewFields(hotspot.fields, incidents);
    }
    const mine =
      hotspotId && isFieldHotspot(hotspotId)
        ? incidents.filter(
            (i) => i.sourceHotspotId === hotspotId && i.status !== "RESOLVED",
          )
        : [];
    const live = mine.length > 0;
    const shown = (rows: HotspotField[]) =>
      rows.filter(
        (f) => (live || !f.eventOnly) && !isBlank(f) && !(isSecurity && TIME_FIELDS.has(f.name)),
      );
    const chosen =
      mine.length > 1
        ? (mine.find((i) => i.id === selectedIncidentId) ?? mine[0])
        : undefined;
    const patch = chosen ? incidentFields[chosen.id] : undefined;
    if (!patch) return shown(hotspot.fields).map((f) => ({ field: f, color: undefined }));

    const seed = seedById[hotspot.id]?.fields ?? hotspot.fields;
    return shown(seed.filter((f) => f.name in patch || IDENTITY_FIELDS.has(f.name)))
      .map((f) => ({
        field:
          f.name === "event_id"
            ? { ...f, value: chosen!.id }
            : f.name in patch
              ? { ...f, value: patch[f.name] }
              : f,
        color: undefined,
      }));
  }, [hotspot, hotspotId, isSecurity, incidents, incidentFields, selectedIncidentId, seedById]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!hotspot) return null;

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
          ...(hotspot.poster && {
            width: `min(860px, calc(100vw - 12px), calc((78dvh - 20px) * ${hotspot.poster.width} / ${hotspot.poster.height}))`,
          }),
          background: CARD_GLASS,
          backdropFilter: CARD_FROST,
          WebkitBackdropFilter: CARD_FROST,
          border: "1.5px solid var(--nav-border)",
          textShadow: CARD_TEXT_SHADOW,
          "--hs-row-y": "13px",
          "--hs-gap-x": "40px",
          ...CARD_SCALE,
          ...(!hotspot.poster && { padding: "var(--sp-pad)" }),
        } as React.CSSProperties}
        className={cn(
          "pointer-events-auto flex flex-col rounded-[14px] short:rounded-[10px]",
          hotspot.poster && "short:origin-center short:scale-[0.85]",
          hotspot.poster ? "overflow-visible" : "overflow-hidden",
          "max-sm:rounded-[12px]",
          hotspot.poster
            ? "relative p-2.5 max-sm:p-1.5"
            : cn(
                "p-6 short:p-4 max-sm:p-4",
                isSecurity && "p-7",
                hotspot.clip && !isSecurity && "short:w-[calc(100vw-24px)]",
                "w-[80vw] min-w-[80vw] max-w-[80vw]",
              ),
          !hotspot.poster &&
            "h-[80vh] max-h-[80vh] supports-[height:100dvh]:h-[80dvh] supports-[height:100dvh]:max-h-[80dvh]",
        )}
      >
        {hotspot.poster ? (
          <>
            <button
              type="button"
              aria-label={`Enlarge ${hotspot.popupTitle}`}
              onClick={() => setZoomed(true)}
              className="block w-full cursor-zoom-in"
            >
              <Image
                src={hotspot.poster.url}
                alt={hotspot.popupTitle}
                width={hotspot.poster.width}
                height={hotspot.poster.height}
                sizes={POSTER_SIZES}
                className="h-auto w-full rounded-[8px]"
                priority
                unoptimized
                draggable={false}
              />
            </button>
            <span
              aria-hidden
              className="nav-body pointer-events-none absolute bottom-3.5 right-3.5 rounded-[7px] px-2 py-1 text-[11px] max-sm:text-[10px] short:text-[10px] font-semibold max-sm:bottom-2.5 max-sm:right-2.5"
              style={{
                background: "rgba(12,16,22,0.72)",
                border: "1.5px solid var(--nav-border)",
                color: "var(--nav-text)",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
              }}
            >
              Tap to enlarge
            </span>
            {zoomed && (
              <PosterViewer
                poster={hotspot.poster}
                title={hotspot.popupTitle}
                onClose={() => setZoomed(false)}
              />
            )}
            <button
              aria-label="Close"
              onClick={onClose}
              className="absolute -right-3 -top-3 grid h-8 w-8 cursor-pointer place-items-center rounded-full text-[15px] max-sm:text-[13px] short:text-[13px] leading-none transition-colors hover:bg-white/15 max-sm:-right-2 max-sm:-top-2 max-sm:h-7 max-sm:w-7"
              style={{
                background: "rgba(12,16,22,0.88)",
                border: "1.5px solid var(--nav-border)",
                color: "var(--nav-text)",
                boxShadow: "0 4px 14px rgba(0,0,0,0.5)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
              }}
            >
              ×
            </button>
          </>
        ) : (
          <>
          {isSecurity ? (
            <CardHeader
              title={hotspot.popupTitle}
              subtitle={layout.name}
              onClose={onClose}
            />
          ) : (
            <PanelHeader
              dense
              title={hotspot.popupTitle}
              subtitle={layout.name}
              onClose={onClose}
            />
          )}

          {designed && hotspotId ? (
            <HotspotBody
              hotspot={hotspot}
              hotspotId={hotspotId}
              fields={fields}
              stacked={stacked}
            />
          ) : (
          <div
            className={cn(
              "mt-3 min-h-0 flex-1 max-sm:mt-2 short:mt-2",
              isSecurity && "mt-4",
              centreWide
                ? "mt-5 grid grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)] grid-rows-[minmax(0,1fr)] gap-8 overflow-hidden"
                : isSecurityCentre
                ? "ui-scrollbar block overflow-y-auto overflow-x-hidden"
                : "ui-scrollbar overflow-y-auto overflow-x-hidden",
            )}
          >
            {hotspot.alert && <AlertBanner alert={hotspot.alert} />}

            {hotspot.journey && (
              <div
                className="mt-4 border-t pt-2 short:mt-3"
                style={{ borderColor: "var(--nav-divider)" }}
              >
                <div
                  className="nav-body pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.06em]"
                  style={{ color: "var(--nav-text)" }}
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
                          className="nav-body text-[11.5px] max-sm:text-[10.5px] font-medium short:text-[10.5px]"
                          style={{ color: "var(--nav-text)" }}
                        >
                          {step.stage} · {step.state}
                        </h3>
                        <h2
                          className="nav-display truncate text-[14px] max-sm:text-[12.5px] font-semibold short:text-[12px]"
                          style={{ color: "var(--nav-text)" }}
                        >
                          {step.label}
                        </h2>
                      </div>
                      <span
                        className="nav-body shrink-0 rounded-full px-2 py-0.5 text-[10.5px] max-sm:text-[10px] short:text-[10px] font-medium"
                        style={{
                          background: "rgba(255,255,255,0.06)",
                          border: "1.5px solid rgba(255,255,255,0.16)",
                          color: "var(--nav-text)",
                        }}
                      >
                        {step.layoutId}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}


            {hotspotId === SECURITY_CENTRE_ID && (
              <>
                <SecurityCommandView fields={fields} wide={centreWide} />
                <SecurityIncidentCentre flush={centreWide} />
              </>
            )}

            {hotspotId && isFieldHotspot(hotspotId) && (
              <SourceIncidents hotspotId={hotspotId} />
            )}

            <div
              className={cn(
                "border-t pt-1",
                hotspot.clip ? "mt-3 short:mt-2" : "mt-4 short:mt-3",
                isSecurity && (hotspot.clip ? "mt-4 short:mt-2" : "mt-5 short:mt-3"),
              )}
              style={{ borderColor: "var(--nav-divider)" }}
              hidden={hotspotId === SECURITY_CENTRE_ID}
            >
              <div
                className={cn(
                  "grid gap-x-[var(--hs-gap-x,32px)] max-sm:gap-x-5 short:gap-x-5",
                  "grid-cols-2",
                  !hotspot.clip && "max-[560px]:grid-cols-1",
                )}
              >
                {hotspot.clip && (
                  <ClipBlock clip={hotspot.clip} camera={cameraIdOf(hotspot)} />
                )}
                {still && (
                  <div
                    className="hidden overflow-hidden p-2 [perspective:1100px] sm:block"
                    style={{ gridColumn: 1, gridRow: `1 / span ${FIELDS_BESIDE_STILL}` }}
                  >
                    <figure
                      className="relative m-0 aspect-[5/4] w-[280px] short:w-[196px]"
                      style={{
                        transform: "rotateY(13deg) rotateX(2deg)",
                        transformOrigin: "right center",
                      }}
                    >
                      <Image
                        src={still}
                        alt={hotspot.name}
                        fill
                        sizes={STILL_SIZES}
                        className="object-contain"
                        draggable={false}
                      />
                    </figure>
                  </div>
                )}
                {fields.map(({ field, color }) => (
                  <Field key={field.name} field={field} color={color} wrap={!!hotspot.clip} />
                ))}
              </div>
            </div>
          </div>
          )}
          </>
        )}
      </div>
    </div>
  );
}

function CardHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
}) {
  return (
    <div className="flex shrink-0 items-start gap-3">
      <div className="min-w-0 flex-1">
        <h2
          className="nav-display break-words text-[length:var(--fs-title)] font-bold leading-tight"
          style={{ color: "var(--nav-text)", letterSpacing: "-0.2px" }}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            className="nav-body mt-0.5 text-[length:var(--fs-sub)] font-medium"
            style={{ color: "var(--nav-text)" }}
          >
            {subtitle}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white/[0.22]"
        style={{ background: "rgba(255,255,255,0.14)", border: "1.5px solid rgba(255,255,255,0.22)" }}
      >
        <X size={14} strokeWidth={2.4} color="#E6EAEF" />
      </button>
    </div>
  );
}

function heroOf(
  hotspot: HotspotConfig,
  fields: { field: HotspotField; color?: string }[],
): { field: HotspotField; color?: string } | null {
  if (hotspot.alert) return null;
  for (const name of HERO_FIELDS) {
    const hit = fields.find((f) => f.field.name === name);
    if (hit) return hit;
  }
  return null;
}

function HotspotBody({
  hotspot,
  hotspotId,
  fields,
  stacked,
}: {
  hotspot: HotspotConfig;
  hotspotId: string;
  fields: { field: HotspotField; color?: string }[];
  stacked: boolean;
}) {
  const hero = heroOf(hotspot, fields);
  const rest = fields.filter((f) => f !== hero);

  if (hotspot.clip || hotspot.image) {
    const media = hotspot.clip ? (
      <ClipBlock clip={hotspot.clip} camera={cameraIdOf(hotspot)} panel />
    ) : (
      <StillPanel src={hotspot.image!} alt={hotspot.name} tag={hotspot.name} />
    );
    return (
      <div
        className={cn(
          "mt-[var(--sp-gap)] grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-[calc(var(--sp-gap)*1.4)]",
          stacked
            ? "grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]"
            : "grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]",
        )}
      >
        {media}
        <div className="flex min-h-0 flex-col gap-[var(--sp-gap)]">
          {hero && <HeroTile {...hero} />}
          <div className="ui-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            {rest.map(({ field, color }) => (
              <ReadingRow key={field.name} field={field} color={color} />
            ))}
          </div>
          <FieldAlerts hotspotId={hotspotId} />
        </div>
      </div>
    );
  }

  const stats = rest.filter((f) => typeof f.field.value === "number");
  const idents = rest.filter((f) => typeof f.field.value !== "number");

  return (
    <div className="ui-scrollbar mt-[var(--sp-gap)] flex min-h-0 flex-1 flex-col gap-[var(--sp-gap)] overflow-y-auto overflow-x-hidden">
      {hotspot.alert && <AlertBanner alert={hotspot.alert} className="mb-0 max-sm:mb-0 short:mb-0" />}
      {hero && <HeroTile {...hero} />}
      {idents.length > 0 && (
        <div
          className="grid shrink-0 gap-x-[calc(var(--sp-gap)*1.2)] gap-y-[var(--sp-row)] rounded-[12px] p-[var(--sp-tile)]"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            background: "rgba(255,255,255,0.03)",
            border: "1.5px solid var(--nav-divider)",
          }}
        >
          {idents.map(({ field, color }) => (
            <IdentCell key={field.name} field={field} color={color} />
          ))}
        </div>
      )}
      {stats.length > 0 && (
        <div
          className="grid shrink-0 gap-[calc(var(--sp-gap)*0.8)]"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(84px, 1fr))" }}
        >
          {stats.map(({ field, color }) => (
            <StatTile key={field.name} field={field} color={color} />
          ))}
        </div>
      )}
      <FieldAlerts hotspotId={hotspotId} />
    </div>
  );
}

function StillPanel({ src, alt, tag }: { src: string; alt: string; tag: string }) {
  return (
    <div className="relative min-h-0">
      <Image
        src={src}
        alt={alt}
        fill
        sizes={STILL_PANEL_SIZES}
        className="object-contain"
        draggable={false}
      />
      <span
        className="nav-display absolute left-3 top-3 rounded-[7px] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em]"
        style={{
          color: "var(--nav-text)",
          background: "rgba(8,11,16,0.72)",
          border: "1.5px solid var(--nav-border)",
        }}
      >
        {tag}
      </span>
    </div>
  );
}

function HeroTile({ field, color }: { field: HotspotField; color?: string }) {
  const tone = useSite().toneFor(field.value, field.tone);
  const ink = field.pending ? "var(--nav-text)" : valueColor(field, tone, color);
  return (
    <div
      className="flex shrink-0 items-center gap-[calc(var(--sp-tile)*0.8)] rounded-[12px] p-[var(--sp-tile)]"
      style={{ background: "rgba(255,255,255,0.05)", border: "1.5px solid var(--nav-border)" }}
    >
      <span
        className="h-3 w-3 shrink-0 rounded-full"
        style={{ background: ink, boxShadow: `0 0 10px ${ink}` }}
      />
      <div className="min-w-0 flex-1">
        <h3
          className="nav-body text-[length:var(--fs-label)] font-semibold uppercase tracking-[0.08em]"
          style={{ color: "var(--nav-text)" }}
        >
          {field.label}
        </h3>
        <h2
          className="nav-display mt-1 break-words text-[length:var(--fs-hero)] font-bold uppercase leading-[1.1] tracking-[0.02em]"
          style={{ color: ink }}
        >
          {formatValue(field)}
        </h2>
      </div>
    </div>
  );
}

function ReadingRow({ field, color }: { field: HotspotField; color?: string }) {
  const tone = useSite().toneFor(field.value, field.tone);
  return (
    <div
      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b py-[var(--sp-row)]"
      style={{ borderColor: "var(--nav-divider)" }}
    >
      <h3
        className="nav-body shrink-0 text-[length:var(--fs-label)] font-semibold uppercase tracking-[0.08em]"
        style={{ color: "var(--nav-text)" }}
      >
        {field.label}
      </h3>
      <h2
        className="nav-display min-w-0 break-words text-right text-[length:var(--fs-value)] font-bold"
        style={{ color: field.pending ? "var(--nav-text)" : valueColor(field, tone, color) }}
      >
        {formatValue(field)}
      </h2>
    </div>
  );
}

function IdentCell({ field, color }: { field: HotspotField; color?: string }) {
  const tone = useSite().toneFor(field.value, field.tone);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h3
        className="nav-body text-[length:var(--fs-label)] font-semibold uppercase tracking-[0.08em]"
        style={{ color: "var(--nav-text)" }}
      >
        {field.label}
      </h3>
      <h2
        className="nav-display break-words text-[length:var(--fs-ident)] font-bold"
        style={{ color: field.pending ? "var(--nav-text)" : valueColor(field, tone, color) }}
      >
        {formatValue(field)}
      </h2>
    </div>
  );
}

function StatTile({ field, color }: { field: HotspotField; color?: string }) {
  const tone = useSite().toneFor(field.value, field.tone);
  const meter =
    field.render === "meter" && typeof field.value === "number"
      ? Math.max(0, Math.min(1, field.value / (field.max ?? 100)))
      : null;
  return (
    <div
      className="flex flex-col gap-1.5 rounded-[12px] p-[var(--sp-tile)]"
      style={{ background: "rgba(255,255,255,0.045)", border: "1.5px solid rgba(255,255,255,0.1)" }}
    >
      <h3
        className="nav-body text-[length:var(--fs-label)] font-semibold uppercase tracking-[0.08em]"
        style={{ color: "var(--nav-text)" }}
      >
        {field.label}
      </h3>
      <h2
        className="nav-display text-[length:var(--fs-stat)] font-bold tabular-nums leading-none"
        style={{ color: field.pending ? "var(--nav-text)" : valueColor(field, tone, color) }}
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

function FieldAlerts({ hotspotId }: { hotspotId: string }) {
  const incidents = useSecurityStore((s) => s.incidents);
  const history = useSecurityStore((s) => s.history);
  const selectedId = useSecurityStore((s) => s.selectedIncidentId);
  const setSelected = useSecurityStore((s) => s.setSelectedIncidentId);

  const open = useMemo(
    () =>
      incidents.filter((i) => i.sourceHotspotId === hotspotId && i.status !== "RESOLVED"),
    [incidents, hotspotId],
  );
  const lastClosed = useMemo(
    () =>
      [...incidents.filter((i) => i.status === "RESOLVED"), ...history]
        .filter((i) => i.sourceHotspotId === hotspotId)
        .sort((a, b) => b.eventTime.localeCompare(a.eventTime))[0] ?? null,
    [incidents, history, hotspotId],
  );

  const activeId = open.some((i) => i.id === selectedId) ? selectedId : (open[0]?.id ?? null);

  return (
    <div className="mt-auto flex shrink-0 flex-col">
      <SectionLabel
        className="mt-0"
        aside={open.length ? `${open.length} open` : lastClosed ? "Resolved" : "None open"}
      >
        {open.length || !lastClosed ? "Alerts" : "Recent alerts"}
      </SectionLabel>
      {open.length > 0 ? (
        <div className="ui-scrollbar flex max-h-[152px] max-sm:max-h-[96px] short:max-h-[96px] flex-col gap-[calc(var(--sp-row)*0.7)] overflow-y-auto">
          {open.map((i) => (
            <IncidentLine
              key={i.id}
              incident={i}
              active={i.id === activeId}
              onSelect={() => setSelected(i.id)}
            />
          ))}
        </div>
      ) : lastClosed ? (
        <IncidentLine incident={lastClosed} active={false} onSelect={noop} />
      ) : (
        <div
          className="flex items-center justify-center rounded-[9px] border border-dashed py-3.5"
          style={{ borderColor: "var(--nav-divider)" }}
        >
          <p className="nav-body text-[length:var(--fs-row,13px)]" style={{ color: "var(--nav-text)" }}>
            No open alerts
          </p>
        </div>
      )}
    </div>
  );
}

/** The camera id a clip card badges its feed with, read off the row's own
 *  readings so the badge and the grid can never disagree. */
function cameraIdOf(hotspot: HotspotConfig): string | null {
  const f = hotspot.fields.find((x) => x.name === "camera_id");
  return f && typeof f.value === "string" ? f.value : null;
}

const clipBlobs = new Map<string, string>();
const clipLoads = new Map<string, Promise<string>>();

function warmClip(url: string): Promise<string> {
  const held = clipLoads.get(url);
  if (held) return held;
  const load = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return res.blob();
    })
    .then((blob) => {
      const local = URL.createObjectURL(blob);
      clipBlobs.set(url, local);
      return local;
    });
  load.catch(() => clipLoads.delete(url));
  clipLoads.set(url, load);
  return load;
}

function useClipSrc(url: string): string | undefined {
  const [src, setSrc] = useState(() =>
    clipBlobs.get(url) ?? (clipLoads.has(url) ? undefined : url),
  );
  useEffect(() => {
    if (clipBlobs.has(url) || !clipLoads.has(url)) return;
    let live = true;
    warmClip(url).then(
      (local) => live && setSrc(local),
      () => live && setSrc(url),
    );
    return () => {
      live = false;
    };
  }, [url]);
  return src;
}

function ClipBlock({
  clip,
  camera,
  panel,
}: {
  clip: NonNullable<HotspotConfig["clip"]>;
  camera: string | null;
  panel?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  const src = useClipSrc(clip.url);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }, []);

  return (
    <div
      className={cn(
        "relative overflow-hidden",
        panel
          ? "h-full min-h-0 w-full rounded-[12px]"
          : cn(
              "col-span-2 mx-auto mb-4 w-full max-w-[520px] rounded-[10px] max-sm:mb-3",
              "aspect-[var(--clip-aspect)] max-sm:max-w-full",
              "short:col-span-1 short:col-start-1 short:row-start-1 short:row-span-4",
              "short:mx-0 short:mb-0 short:aspect-auto short:h-full short:max-w-none",
            ),
      )}
      style={
        {
          "--clip-aspect": `${clip.width} / ${clip.height}`,
          ...(!panel && {
            background: "rgba(8,11,16,0.55)",
            border: "1.5px solid var(--nav-border)",
          }),
        } as React.CSSProperties
      }
    >
      <video
        ref={videoRef}
        src={src}
        className={cn("h-full w-full", panel ? "object-contain" : "object-cover")}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />

      <div
        className="nav-display pointer-events-none absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-[7px] px-2 py-1"
        style={{
          background: "rgba(8,11,16,0.72)",
          border: "1.5px solid var(--nav-border)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
      >
        <span
          className="h-[6px] w-[6px] rounded-full"
          style={{ background: "var(--tone-ok, #30d158)" }}
        />
        {camera && (
          <span
            className="text-[11.5px] max-sm:text-[10.5px] short:text-[10.5px] font-bold tracking-[0.04em]"
            style={{ color: "var(--nav-text)" }}
          >
            {camera}
          </span>
        )}
        <span
          className="nav-body text-[10px] font-semibold tracking-[0.1em]"
          style={{ color: "var(--tone-ok, #30d158)" }}
        >
          LIVE
        </span>
      </div>

      <button
        type="button"
        aria-label={playing ? "Pause feed" : "Play feed"}
        aria-pressed={!playing}
        onClick={toggle}
        className="absolute bottom-2.5 left-2.5 grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-[8px] transition-colors hover:bg-white/15 short:h-[26px] short:w-[26px]"
        style={{
          background: "rgba(8,11,16,0.72)",
          border: "1.5px solid var(--nav-border)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
      >
        {playing ? (
          <Pause size={12} strokeWidth={2.4} fill="var(--nav-text)" color="var(--nav-text)" />
        ) : (
          <Play size={12} strokeWidth={2.4} fill="var(--nav-text)" color="var(--nav-text)" />
        )}
      </button>
    </div>
  );
}

function PosterViewer({
  poster,
  title,
  onClose,
}: {
  poster: NonNullable<HotspotConfig["poster"]>;
  title: string;
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
  }, []);

  return (
    <div className="fixed inset-0 z-[150] bg-black">
      <div
        ref={scrollRef}
        className="ui-scrollbar h-full w-full overflow-auto overscroll-contain"
      >
        <div className="flex min-h-full min-w-full items-center justify-center">
          <Image
            src={poster.url}
            alt={title}
            width={poster.width}
            height={poster.height}
            sizes={POSTER_SIZES}
            className="h-[100dvh] w-auto max-w-none"
            priority
            unoptimized
            draggable={false}
          />
        </div>
      </div>

      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-3 top-3 grid h-9 w-9 cursor-pointer place-items-center rounded-full text-[17px] max-sm:text-[15px] short:text-[15px] leading-none"
        style={{
          background: "rgba(12,16,22,0.88)",
          border: "1.5px solid var(--nav-border)",
          color: "var(--nav-text)",
          boxShadow: "0 4px 14px rgba(0,0,0,0.5)",
        }}
      >
        ×
      </button>
    </div>
  );
}

function AlertBanner({
  alert,
  className,
}: {
  alert: NonNullable<HotspotConfig["alert"]>;
  className?: string;
}) {
  const danger = alert.level === "danger";
  const ink = danger ? TONE_COLOR.alert : TONE_COLOR.warn;
  return (
    <div
      role="status"
      className={cn(
        "mb-5 flex shrink-0 items-center gap-3.5 overflow-hidden rounded-[10px] border-l-[4px] px-4 py-3.5 max-sm:mb-3 max-sm:gap-2.5 max-sm:px-3 max-sm:py-2.5 short:mb-3 short:gap-3 short:px-3.5 short:py-2.5",
        className,
      )}
      style={{
        background: danger ? ALERT_SURFACE : CAUTION_SURFACE,
        borderColor: ink,
        boxShadow: `inset 0 0 0 1px ${danger ? "rgba(255,155,147,0.26)" : "rgba(255,176,32,0.26)"}`,
      }}
    >
      <TriangleAlert
        size={19}
        strokeWidth={2.4}
        className="shrink-0"
        style={{ color: ink }}
      />
      <div className="min-w-0">
        <h3
          className="nav-display text-[11px] font-bold uppercase tracking-[0.14em] max-sm:text-[10px]"
          style={{ color: ink }}
        >
          {alert.title}
        </h3>
        {alert.detail && (
          <p
            className="nav-display mt-1 text-[14px] font-semibold leading-snug max-sm:text-[12.5px] short:text-[13px]"
            style={{ color: "var(--nav-text)" }}
          >
            {alert.detail}
          </p>
        )}
      </div>
    </div>
  );
}

function StillPreload({ ready }: { ready?: boolean }) {
  const site = useSite();
  const rows = useMemo(
    () => [...site.hotspots, ...site.securityHotspots],
    [site],
  );

  const stills = useMemo(
    () => [...new Set(rows.map((h) => h.image).filter((u): u is string => !!u))],
    [rows],
  );

  const posters = useMemo(() => {
    const seen = new Map<string, NonNullable<HotspotConfig["poster"]>>();
    for (const h of rows) {
      if (h.poster && !seen.has(h.poster.url)) seen.set(h.poster.url, h.poster);
      // A clip's first frame is the one thing on a clip card that can be
      // painted before the video has a byte, so it warms like a poster.
      if (h.clip?.poster && !seen.has(h.clip.poster)) {
        seen.set(h.clip.poster, {
          url: h.clip.poster,
          width: h.clip.width,
          height: h.clip.height,
        });
      }
    }
    return [...seen.values()];
  }, [rows]);

  const clips = useMemo(
    () => [...new Set(rows.map((h) => h.clip?.url).filter((u): u is string => !!u))],
    [rows],
  );

  useEffect(() => {
    if (!ready) return;
    for (const url of clips) void warmClip(url).catch(() => undefined);
  }, [ready, clips]);

  const warmPosters = ready && posters.length > 0;
  if (!stills.length && !warmPosters) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 h-px w-px overflow-hidden opacity-0"
    >
      {stills.map((src) => (
        <div key={src} className="relative h-[200px] w-[250px]">
          <Image src={src} alt="" fill sizes={STILL_SIZES} priority className="object-contain" />
        </div>
      ))}

      {warmPosters &&
        posters.map((poster) => (
          <Image
            key={poster.url}
            src={poster.url}
            alt=""
            width={poster.width}
            height={poster.height}
            sizes={POSTER_SIZES}
            priority
            unoptimized
          />
        ))}
    </div>
  );
}

const SECURITY_CENTRE_ID = "S07";

function commandViewFields(
  seeded: HotspotField[],
  incidents: SecurityIncident[],
): { field: HotspotField; color?: string }[] {
  const counts = incidentCounts(incidents);
  const open = incidents.filter((i) => i.status !== "RESOLVED");

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
      value: `${n} ${n === 1 ? "alert" : "alerts"} · ${s}`,
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
    security_systems_status: rollUp(worst),
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

function rollUp(worst: Map<string, IncidentSeverity>): {
  value: HotspotField["value"];
  tone?: Tone;
  color?: string;
} {
  const n = worst.size;
  if (n === 0) return { value: "Operational", tone: "ok" };
  let top: IncidentSeverity | undefined;
  for (const s of worst.values()) {
    if (!top || SEVERITY_RANK[s] > SEVERITY_RANK[top]) top = s;
  }
  return {
    value: `${n} ${n === 1 ? "system" : "systems"} reporting`,
    color: top ? SEVERITY_COLOR[top] : undefined,
  };
}

const SEVERITY_RANK: Record<IncidentSeverity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

const ROLLUP_FIELD = "security_systems_status";

const COUNTER_FIELDS = [
  "active_incidents",
  "critical_incidents",
  "high_incidents",
  "medium_incidents",
];

function SecurityCommandView({
  fields,
  wide,
}: {
  fields: { field: HotspotField; color?: string }[];
  wide?: boolean;
}) {
  const systems = fields.filter((f) => f.field.name.endsWith("_status"));
  const real = systems.filter((f) => f.field.name !== ROLLUP_FIELD);
  const reporting = real.filter((f) => !!f.color).length;

  return (
    <div className={cn("shrink-0 pt-1", wide && "flex min-h-0 flex-col")}>
      <SectionLabel
        className="mt-0"
        aside={
          <span
            className="nav-display font-bold tracking-[0.04em]"
            style={{ color: reporting ? "var(--tone-warn, #ffb020)" : "var(--tone-ok, #30d158)" }}
          >
            {reporting
              ? `${reporting} of ${real.length} reporting`
              : `${real.length} of ${real.length} normal`}
          </span>
        }
      >
        Systems
      </SectionLabel>
      <div
        className={cn(
          "grid gap-x-[26px] max-sm:gap-x-[18px] short:gap-x-[18px] max-[560px]:grid-cols-2",
          wide ? "grid-cols-2" : "grid-cols-3",
        )}
      >
        {systems.map(({ field, color }) => (
          <SystemCell key={field.name} field={field} color={color} />
        ))}
      </div>
      {wide && (
        <div className="mt-auto grid grid-cols-2 gap-3 pt-5">
          {COUNTER_FIELDS.map((name) => fields.find((f) => f.field.name === name))
            .filter((f): f is { field: HotspotField; color?: string } => !!f)
            .map(({ field, color }) => (
              <StatTile key={field.name} field={field} color={color} />
            ))}
        </div>
      )}
    </div>
  );
}

function SystemCell({ field, color }: { field: HotspotField; color?: string }) {
  const tone = useSite().toneFor(field.value, field.tone);
  return (
    <div
      className="flex min-w-0 flex-col gap-[4px] border-b py-[var(--sp-row,13px)]"
      style={{ borderColor: "var(--nav-divider)" }}
    >
      <span
        className="nav-body break-words text-[length:var(--fs-label,11.5px)] font-semibold uppercase tracking-[0.08em]"
        style={{ color: "var(--nav-text)" }}
      >
        {field.label}
      </span>
      <span
        className="nav-display break-words text-[length:var(--fs-value,17px)] font-bold leading-[1.25] tracking-[0.02em]"
        style={{ color: valueColor(field, tone, color) }}
      >
        {formatValue(field)}
      </span>
    </div>
  );
}

function IncidentLine({
  incident,
  active,
  onSelect,
}: {
  incident: SecurityIncident;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className="flex w-full shrink-0 cursor-pointer items-center gap-[calc(var(--sp-tile,16px)*0.8)] rounded-[9px] px-[calc(var(--sp-tile,20px)*0.8)] py-[var(--sp-row,13px)] text-left transition-[background-color,border-color] duration-200"
      style={{
        background: active ? "color-mix(in srgb, var(--nav-accent) 16%, transparent)" : "rgba(255,255,255,0.05)",
        border: active
          ? "1.5px solid color-mix(in srgb, var(--nav-accent) 60%, transparent)"
          : "1.5px solid var(--nav-divider)",
      }}
    >
      <span
        className="nav-display min-w-0 flex-1 break-words text-[length:var(--fs-row,15px)] font-semibold leading-[1.25]"
        style={{ color: "var(--nav-text)" }}
      >
        {incident.type}
      </span>
      <span
        className="nav-body w-[132px] shrink-0 break-words text-[length:var(--fs-meta,12px)] font-medium max-md:hidden"
        style={{ color: "var(--nav-text)" }}
      >
        {incident.sourceId || incident.source}
      </span>
      <span
        className="nav-display w-[6.5em] shrink-0 rounded-[6px] py-[3px] text-center text-[length:var(--fs-label,11px)] font-bold tracking-[0.06em]"
        style={{
          color: SEVERITY_COLOR[incident.severity],
          background: `color-mix(in srgb, ${SEVERITY_COLOR[incident.severity]} 18%, transparent)`,
        }}
      >
        {incident.severity}
      </span>
    </button>
  );
}

function IncidentDetailStrip({ incident }: { incident: SecurityIncident }) {
  const { goToHotspot, goToLayout, find: findLayout } = useLayoutNavigation();
  const site = useSite();

  const target = incident.navigationTarget;
  const anchor = site.securityHotspotById[incident.sourceHotspotId];
  const sourceAnchor = anchor && anchor.enabled !== false ? anchor : null;
  const canTravel = !!sourceAnchor || !!findLayout(target);

  return (
    <div
      className="mt-3 shrink-0 rounded-[10px] px-4 py-4 max-sm:mt-2.5 max-sm:px-3.5 max-sm:py-3 short:mt-2.5 short:px-3.5 short:py-3"
      style={{ background: "rgba(255,255,255,0.05)", border: "1.5px solid var(--nav-border)" }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span
          className="nav-display min-w-0 break-words text-[13.5px] max-sm:text-[12px] short:text-[12px] font-bold tracking-[0.02em]"
          style={{ color: "var(--nav-text)" }}
        >
          {incident.id} · {incident.type}
        </span>
        <span
          className="nav-body shrink-0 text-[11px] max-sm:text-[10px] short:text-[10px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: TONE_COLOR[STATUS_TONE[incident.status]] }}
        >
          {incident.status}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-4 gap-x-5 max-sm:mt-2.5 max-sm:gap-x-4 short:mt-2.5 short:gap-x-4 max-[560px]:grid-cols-2">
        <DetailRow label="Acknowledged" value={incident.acknowledged ? "Yes" : "No"} />
        <DetailRow label="Location" value={incident.locationLabel} />
        <DetailRow label="Source" value={incident.source} />
        <DetailRow label="Assigned" value={incident.assignedTeam} />
      </dl>

      {canTravel && (
        <div className="flex flex-wrap items-center gap-2 pt-3.5 max-sm:pt-3 short:pt-3">
          <RowAction
            label="View location"
            onClick={() => {
              useSecurityStore.getState().setViewingIncidentId(incident.id);
              if (sourceAnchor) goToHotspot(incident.sourceHotspotId);
              else goToLayout(target);
            }}
          />
        </div>
      )}
    </div>
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
    <div className="flex flex-col">
      <SectionLabel aside={`${open.length} open`}>Alerts</SectionLabel>
      <div className="flex flex-col gap-2 max-sm:gap-1.5 short:gap-1.5">
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

function noop() {}

function QueueBody({
  rows,
  activeId,
  phone,
  narrowed,
  tab,
  onSelect,
}: {
  rows: SecurityIncident[];
  activeId: string | null;
  phone: boolean;
  narrowed: boolean;
  tab: "current" | "past";
  onSelect: (id: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-[10px] border border-dashed py-6"
        style={{ borderColor: "var(--nav-divider)" }}
      >
        <p
          className="nav-body text-[13px] max-sm:text-[11.5px] short:text-[11.5px]"
          style={{ color: "var(--nav-text)" }}
        >
          {narrowed
            ? "Nothing matches these filters."
            : tab === "current"
              ? "Nothing open."
              : "Nothing closed yet."}
        </p>
      </div>
    );
  }

  const shown = rows;
  const active = rows.find((i) => i.id === activeId) ?? null;

  return (
    <>
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-2 max-sm:gap-1.5 short:gap-1.5",
          phone ? "overflow-visible" : "ui-scrollbar overflow-y-auto overflow-x-hidden pr-1",
        )}
      >
        {shown.map((i) => (
          <IncidentLine
            key={i.id}
            incident={i}
            active={i.id === activeId}
            onSelect={() => onSelect(i.id)}
          />
        ))}
      </div>

      {active && <IncidentDetailStrip incident={active} />}
    </>
  );
}

function SecurityIncidentCentre({ flush }: { flush?: boolean }) {
  const incidents = useSecurityStore((s) => s.incidents);
  const history = useSecurityStore((s) => s.history);
  const selectedId = useSecurityStore((s) => s.selectedIncidentId);
  const setSelected = useSecurityStore((s) => s.setSelectedIncidentId);

  const [wantedTab, setTab] = useState<"current" | "past">("current");
  const [severities, setSeverities] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [sort, setSort] = useState<string[]>(["time"]);
  const [queueOpen, setQueueOpen] = useState(false);

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
  const queueOf = useCallback(
    (base: SecurityIncident[]) => {
      const filtered = base.filter(
        (i) =>
          (severities.length === 0 || severities.includes(i.severity)) &&
          (sources.length === 0 || sources.includes(i.sourceHotspotId)),
      );
      return [...filtered].sort((a, b) =>
        bySeverity
          ?
            SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
            b.eventTime.localeCompare(a.eventTime)
          : b.eventTime.localeCompare(a.eventTime),
      );
    },
    [severities, sources, bySeverity],
  );
  const rows = useMemo(
    () => queueOf(tab === "current" ? current : past),
    [queueOf, tab, current, past],
  );

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

  const narrowed = severities.length > 0 || sources.length > 0;

  const activeId = rows.some((i) => i.id === selectedId) ? selectedId : (rows[0]?.id ?? null);
  const phone = useIsHandheld();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          "mt-5 flex shrink-0 items-center justify-between gap-3 max-sm:mt-4 short:mt-4 max-[560px]:flex-col max-[560px]:items-start max-[560px]:gap-2",
          flush && "mt-0",
        )}
      >
        <div className="flex shrink-0 items-center gap-2">
          <span
            className="nav-body text-[11.5px] max-sm:text-[10.5px] short:text-[10.5px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: "var(--nav-text)" }}
          >
            Incidents
          </span>
          <Chip
            label="Current"
            on={tab === "current"}
            disabled={!hasCurrent}
            onClick={() => setTab("current")}
          />
          <Chip label="Past" on={tab === "past"} onClick={() => setTab("past")} />
        </div>

        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          {SEVERITY_ORDER_UI.map((sv) => (
            <Chip
              key={sv}
              label={SEVERITY_SHORT[sv]}
              count={severityCounts[sv]}
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

      <div className="mt-3 grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] max-sm:mt-2.5 short:mt-2.5">
        <div className="col-start-1 row-start-1 flex min-h-0 flex-col">
          <QueueBody
            rows={rows}
            activeId={activeId}
            phone={phone}
            narrowed={narrowed}
            tab={tab}
            onSelect={setSelected}
          />
        </div>
      </div>

      {queueOpen && (
        <IncidentQueueDialog
          rows={rows}
          activeId={activeId}
          onPick={(id) => {
            setSelected(id);
            setQueueOpen(false);
          }}
          onClose={() => setQueueOpen(false)}
        />
      )}
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
    if (all) {
      onChange([id]);
      return;
    }
    const next = value.includes(id) ? value.filter((v) => v !== id) : [...value, id];
    onChange(next.length === 0 || next.length === items.length ? [] : next);
  };

  const narrowed = multi && value.length > 0;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="nav-body flex cursor-pointer items-center gap-1.5 rounded-full py-[5px] pl-3 pr-2.5 text-[12px] max-sm:text-[11px] short:text-[11px] font-semibold transition-[background-color,border-color] duration-200 hover:brightness-125"
        style={{
          background: narrowed ? "var(--nav-accent)" : "rgba(255,255,255,0.06)",
          border: narrowed
            ? "1.5px solid rgba(255,255,255,0.5)"
            : "1.5px solid var(--nav-border)",
          color: narrowed ? "#ffffff" : "var(--nav-text)",
        }}
      >
        {label && <span>{label}</span>}
        <span className="max-w-[150px] break-words text-left">{summary}</span>
        <ChevronDown
          size={13}
          style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 200ms" }}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable={multi}
          className={cn(
            "ui-scrollbar absolute top-[calc(100%+4px)] z-10 max-h-[240px] w-[max(190px,100%)] overflow-y-auto rounded-[10px] p-1",
            align === "right" ? "right-0" : "left-0",
          )}
          style={{
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
                className="nav-body flex w-full cursor-pointer items-center gap-2 rounded-[7px] px-2.5 py-[7px] text-left text-[12.5px] max-sm:text-[11px] short:text-[11px] transition-[color] duration-150 hover:brightness-125"
                style={{ color: on ? "var(--nav-text)" : "var(--nav-text)" }}
              >
                {i.dot && (
                  <span
                    className="h-[6px] w-[6px] shrink-0 rounded-full"
                    style={{ background: i.dot }}
                  />
                )}
                <span className="min-w-0 flex-1 break-words">{i.label}</span>
                <Check
                  size={13}
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
          className={cn(
            "nav-body pointer-events-none absolute right-0 z-20 whitespace-nowrap rounded-[7px] px-2 py-1 text-[10.5px] max-sm:text-[10px] short:text-[10px] font-medium",
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

const SEVERITY_ORDER_UI: IncidentSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

const SEVERITY_SHORT: Record<IncidentSeverity, string> = {
  CRITICAL: "Crit",
  HIGH: "High",
  MEDIUM: "Med",
  LOW: "Low",
};

function Chip({
  label,
  count,
  on,
  dot,
  disabled,
  onClick,
}: {
  label: string;
  count?: number;
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
      className="nav-body flex items-center gap-1.5 rounded-full px-3 py-[5px] text-[12px] max-sm:text-[11px] short:text-[11px] font-semibold transition-[background-color,border-color,color,opacity] duration-200 enabled:cursor-pointer"
      style={{
        background: on ? "var(--nav-accent)" : "rgba(255,255,255,0.06)",
        border: on ? "1.5px solid rgba(255,255,255,0.5)" : "1.5px solid var(--nav-border)",
        color: on ? "#ffffff" : "var(--nav-text)",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {dot && (
        <span className="h-[6px] w-[6px] shrink-0 rounded-full" style={{ background: dot }} />
      )}
      {label}
      {count !== undefined && (
        <span
          className="ml-0.5 rounded-full px-1.5 py-px text-[11px] max-sm:text-[10px] short:text-[10px] font-bold tabular-nums"
          style={{
            background: on ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.08)",
            color: on ? "#ffffff" : "var(--nav-text)",
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

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
  selected?: boolean;
  compact?: boolean;
  onSelect: () => void;
  onShowLog: () => void;
}) {
  const { goToHotspot, goToLayout, find: findLayout } = useLayoutNavigation();
  const site = useSite();
  const audit = useSecurityStore((s) => s.audit);

  const mine = useMemo(
    () => audit.filter((e) => e.incidentId === incident.id),
    [audit, incident.id],
  );

  const target = incident.navigationTarget;
  const anchor = site.securityHotspotById[incident.sourceHotspotId];
  const sourceAnchor = anchor && anchor.enabled !== false ? anchor : null;
  const canTravel = !!sourceAnchor || !!findLayout(target);

  const isOpen = expanded && !compact;

  return (
    <div
      className="rounded-[10px] transition-[border-color,background-color] duration-200"
      style={{
        background: "rgba(255,255,255,0.06)",
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
        className="flex w-full min-w-0 cursor-pointer items-center gap-3 px-3.5 py-2.5 text-left"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span
            className="nav-display break-words text-[14px] max-sm:text-[12.5px] short:text-[12.5px] font-semibold"
            style={{ color: "var(--nav-text)" }}
          >
            {incident.type}
          </span>
          <span
            className="nav-body break-words text-[12px] max-sm:text-[11px] short:text-[11px]"
            style={{ color: "var(--nav-text)" }}
          >
            {incident.source} · {incident.locationLabel}
          </span>
        </span>
        <SeverityPill severity={incident.severity} />
      </button>

      {compact && selected && (
        <div
          className="flex flex-wrap items-center gap-1.5 border-t px-3 pb-2 pt-2"
          style={{ borderColor: "var(--nav-divider)" }}
        >
          <RowAction label={auditLabel(mine.length)} onClick={onShowLog} />
          {canTravel && (
            <RowAction
              label="View location"
              onClick={() => {
                useSecurityStore.getState().setViewingIncidentId(incident.id);
                if (sourceAnchor) goToHotspot(incident.sourceHotspotId);
                else goToLayout(target);
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
              <DetailRow label="Assigned team" value={incident.assignedTeam} />
            </dl>

            <div className="flex flex-wrap items-center gap-2 pt-3.5 max-sm:pt-3 short:pt-3">
              <RowAction label={auditLabel(mine.length)} onClick={onShowLog} />
              {canTravel && (
                <RowAction
                  label="View location"
                  onClick={() => {
                    useSecurityStore.getState().setViewingIncidentId(incident.id);
                    if (sourceAnchor) goToHotspot(incident.sourceHotspotId);
                    else goToLayout(target);
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
      className="nav-body shrink-0 rounded-[5px] px-2 py-[3px] text-[11px] max-sm:text-[10px] short:text-[10px] font-bold tracking-[0.06em]"
      style={{ color, background: `color-mix(in srgb, ${color} 18%, transparent)` }}
    >
      {severity}
    </span>
  );
}

function auditLabel(count: number): string {
  return `Audit · ${count}`;
}

function DetailRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      className="flex min-w-0 flex-col border-b py-[7px]"
      style={{ borderColor: "var(--nav-divider)" }}
    >
      <dt
        className="nav-body text-[11.5px] max-sm:text-[10.5px] short:text-[10.5px] font-medium uppercase tracking-[0.05em]"
        style={{ color: "var(--nav-text)" }}
      >
        {label}
      </dt>
      <dd
        className="nav-display mt-[2px] break-words text-[14px] max-sm:text-[12.5px] short:text-[12.5px] font-semibold"
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
      className="nav-body rounded-[8px] px-3 py-[7px] text-[12.5px] max-sm:text-[11px] short:text-[11px] font-semibold transition-[background-color,opacity] duration-200 enabled:cursor-pointer enabled:hover:brightness-125"
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1.5px solid var(--nav-border)",
        color: "var(--nav-text)",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {label}
    </button>
  );
}

function IncidentQueueDialog({
  rows,
  activeId,
  onPick,
  onClose,
}: {
  rows: SecurityIncident[];
  activeId: string | null;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
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
        aria-label="Full incident queue"
        style={{
          ...NAV_GLASS_PANEL,
          background: CARD_GLASS,
          backdropFilter: CARD_FROST,
          WebkitBackdropFilter: CARD_FROST,
          border: "1.5px solid var(--nav-border)",
          textShadow: CARD_TEXT_SHADOW,
        }}
        className="pointer-events-auto flex max-h-[min(70dvh,calc(100dvh-32px))] w-[min(620px,calc(100vw-32px))] flex-col overflow-hidden rounded-[14px] p-6 short:max-h-[calc(100dvh-16px)] short:scale-[0.85] short:rounded-[10px] short:p-4"
      >
        <PanelHeader
          title="Incident queue"
          subtitle={`${rows.length} ${rows.length === 1 ? "record" : "records"}`}
          onClose={onClose}
        />

        <div className="ui-scrollbar mt-4 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden max-sm:mt-3 max-sm:gap-1.5 short:mt-3 short:gap-1.5">
          {rows.map((i) => (
            <IncidentLine
              key={i.id}
              incident={i}
              active={i.id === activeId}
              onSelect={() => onPick(i.id)}
            />
          ))}
        </div>
      </div>
    </div>
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
          background: CARD_GLASS,
          backdropFilter: CARD_FROST,
          WebkitBackdropFilter: CARD_FROST,
          border: "1.5px solid var(--nav-border)",
          textShadow: CARD_TEXT_SHADOW,
        }}
        className="pointer-events-auto flex max-h-[min(70dvh,calc(100dvh-32px))] w-[min(460px,calc(100vw-32px))] flex-col overflow-hidden rounded-[14px] p-6 short:max-h-[calc(100dvh-16px)] short:scale-[0.85] short:rounded-[10px] short:p-4"
      >
        <PanelHeader title="Incident log" subtitle={incident.id} onClose={onClose} />

        <div className="ui-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {entries.length === 0 ? (
            <p className="nav-body py-3 text-[13px] max-sm:text-[11.5px] short:text-[11.5px]" style={{ color: "var(--nav-text)" }}>
              No entries yet.
            </p>
          ) : (
            <ol className="flex flex-col">
              {entries.map((e) => (
                <li
                  key={e.seq}
                  className="flex min-w-0 items-center gap-2.5 border-b py-[9px] last:border-b-0"
                  style={{ borderColor: "var(--nav-divider)" }}
                >
                  <span
                    className="nav-body min-w-0 flex-1 text-[12.5px] max-sm:text-[11px] short:text-[11px] leading-snug"
                    style={{ color: "var(--nav-text)" }}
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
