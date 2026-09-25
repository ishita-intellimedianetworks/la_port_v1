"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Container } from "@react-three/uikit";
import { Check, ChevronDown } from "@react-three/uikit-lucide";
import { useSite } from "@/config/context";
import type { HotspotConfig, HotspotField, Tone } from "@/config/schema";
import type { VrCardProps } from "@/vr/bridge";
import {
  ALPHA,
  ActionButton,
  AlertBanner,
  Avatar,
  CardHeader,
  CardShell,
  ChipButton,
  Clip,
  EmptyNote,
  Grid,
  HAIRLINE,
  INK,
  Journey,
  Label,
  Meter,
  Pill,
  PosterCard,
  PressRow,
  Rule,
  Scroll,
  Still,
  StillPanel,
  Surface,
  TONE,
  formatValue,
  meterOf,
  px,
  rgba,
  tonedColor,
} from "@/vr/ui/card-kit";
import { VrText } from "@/vr/ui/text";
import {
  CATEGORY_BY_HOTSPOT,
  SECURITY_SOURCES,
  incidentCounts,
  isFieldHotspot,
  useSecurityStore,
  type IncidentSeverity,
  type IncidentStatus,
  type SecurityIncident,
} from "../stores/security-store";
import { useLayoutNavigation } from "../overlay/use-layout-navigation";

type Row = { field: HotspotField; color?: string };

const SECURITY_CENTRE_ID = "S07";
const FIELDS_BESIDE_STILL = 4;
const TIME_FIELDS = new Set(["event_time", "detection_time", "duration"]);
const HERO_FIELDS = ["security_status", "risk_state", "incident_status", "event_type", "zone_status"];
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
const COUNTER_FIELDS = ["active_incidents", "critical_incidents", "high_incidents", "medium_incidents"];
const ROLLUP_FIELD = "security_systems_status";
const AVATAR_COLORS = ["#4a7dff", "#12b886", "#c77dff", "#ff9f43", "#2aa9c9", "#e8638b"];

const FS = {
  title: 22,
  sub: 13.5,
  label: 11.5,
  value: 17,
  hero: 28,
  stat: 38,
  ident: 18,
  row: 15,
  meta: 12,
  pad: 28,
  gap: 20,
  tile: 20,
  rowY: 12,
} as const;

const SEVERITY_COLOR: Record<IncidentSeverity, string> = {
  LOW: INK.ok,
  MEDIUM: INK.warn,
  HIGH: INK.alert,
  CRITICAL: INK.critical,
};
const SEVERITY_RANK: Record<IncidentSeverity, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
const SEVERITY_ORDER_UI: IncidentSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const SEVERITY_SHORT: Record<IncidentSeverity, string> = { CRITICAL: "Crit", HIGH: "High", MEDIUM: "Med", LOW: "Low" };
const STATUS_TONE: Record<IncidentStatus, Tone> = { ACTIVE: "alert", INVESTIGATING: "warn", RESOLVED: "ok" };

function valueColor(field: HotspotField, tone: Tone | undefined, color?: string) {
  return color ?? tonedColor(field, tone) ?? INK.text;
}

function isBlank(field: HotspotField): boolean {
  if (field.pending) return false;
  const v = field.value;
  if (v === null || v === undefined) return true;
  if (typeof v !== "string") return false;
  const t = v.trim();
  return t === "" || t === "—" || t === "-";
}

function cameraIdOf(hotspot: HotspotConfig): string | null {
  const f = hotspot.fields.find((x) => x.name === "camera_id");
  return f && typeof f.value === "string" ? f.value : null;
}

function commandViewFields(seeded: HotspotField[], incidents: SecurityIncident[]): Row[] {
  const counts = incidentCounts(incidents);
  const open = incidents.filter((i) => i.status !== "RESOLVED");
  const worst = new Map<string, IncidentSeverity>();
  for (const i of open) {
    const category = CATEGORY_BY_HOTSPOT[i.sourceHotspotId];
    if (!category) continue;
    const held = worst.get(category);
    if (!held || SEVERITY_RANK[i.severity] > SEVERITY_RANK[held]) worst.set(category, i.severity);
  }
  const statusFor = (category: string, normal: string) => {
    const s = worst.get(category);
    if (!s) return { value: normal, tone: "ok" as Tone };
    const n = open.filter((i) => CATEGORY_BY_HOTSPOT[i.sourceHotspotId] === category).length;
    return { value: `${n} ${n === 1 ? "alert" : "alerts"} - ${s}`, color: SEVERITY_COLOR[s] };
  };
  const rollUp = () => {
    const n = worst.size;
    if (n === 0) return { value: "Operational", tone: "ok" as Tone };
    let top: IncidentSeverity | undefined;
    for (const s of worst.values()) if (!top || SEVERITY_RANK[s] > SEVERITY_RANK[top]) top = s;
    return { value: `${n} ${n === 1 ? "system" : "systems"} reporting`, color: top ? SEVERITY_COLOR[top] : undefined };
  };
  const derived: Record<string, { value: HotspotField["value"]; tone?: Tone; color?: string }> = {
    access_control_status: statusFor("access", "Normal"),
    container_security_status: statusFor("cargo", "Normal"),
    waterside_status: statusFor("waterside", "Normal"),
    video_analytics_status: statusFor("analytics", "Online"),
    restricted_zone_status: statusFor("geofences", "Normal"),
    security_systems_status: rollUp(),
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

function SectionLabel({ children, aside, top = FS.gap }: { children: string; aside?: ReactNode; top?: number }) {
  return (
    <Container
      flexDirection="row"
      alignItems="flex-end"
      justifyContent="space-between"
      gapColumn={px(12)}
      marginTop={px(top)}
      marginBottom={px(10)}
      flexShrink={0}
      width="100%"
    >
      <Label size={FS.label}>{children}</Label>
      {typeof aside === "string" ? (
        <VrText fontSize={px(FS.label)} fontWeight="medium" color={INK.text}>
          {aside}
        </VrText>
      ) : (
        aside
      )}
    </Container>
  );
}

function Field({ field, color }: Row) {
  const tone = useSite().toneFor(field.value, field.tone);
  const flag = !field.pending && !!tonedColor(field, tone);
  const meter = meterOf(field);
  const value = formatValue(field);
  return (
    <Container flexDirection="column" paddingY={px(13)} borderBottomWidth={1} borderColor={HAIRLINE}>
      <Label size={FS.label}>{field.label}</Label>
      <VrText
        marginTop={px(3)}
        fontSize={px(FS.value)}
        fontWeight="bold"
        letterSpacing={flag ? px(FS.value) * 0.02 : 0}
        color={field.pending ? INK.text : valueColor(field, tone, color)}
      >
        {flag ? value.toUpperCase() : value}
      </VrText>
      {meter !== null && <Meter value={meter} color={tone ? TONE[tone] : INK.accentBright} />}
    </Container>
  );
}

function HeroTile({ field, color }: Row) {
  const tone = useSite().toneFor(field.value, field.tone);
  const ink = field.pending ? INK.text : valueColor(field, tone, color);
  return (
    <Container
      flexDirection="row"
      alignItems="center"
      gapColumn={px(FS.tile * 0.8)}
      padding={px(FS.tile)}
      borderRadius={px(12)}
      flexShrink={0}
      width="100%"
    >
      <Surface radius={px(12)} fill={INK.white} fillOpacity={ALPHA.tile} borderOpacity={ALPHA.border} />
      <Container width={px(12)} height={px(12)} borderRadius={999} backgroundColor={ink} flexShrink={0} />
      <Container flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
        <Label size={FS.label}>{field.label}</Label>
        <VrText marginTop={px(4)} fontSize={px(FS.hero)} fontWeight="bold" letterSpacing={px(FS.hero) * 0.02} color={ink}>
          {formatValue(field).toUpperCase()}
        </VrText>
      </Container>
    </Container>
  );
}

function ReadingRow({ field, color }: Row) {
  const tone = useSite().toneFor(field.value, field.tone);
  return (
    <Container
      flexDirection="row"
      flexWrap="wrap"
      alignItems="flex-end"
      justifyContent="space-between"
      gapColumn={px(12)}
      paddingY={px(FS.rowY)}
      borderBottomWidth={1}
      borderColor={HAIRLINE}
      flexShrink={0}
      width="100%"
    >
      <Label size={FS.label}>{field.label}</Label>
      <VrText
        fontSize={px(FS.value)}
        fontWeight="bold"
        textAlign="right"
        color={field.pending ? INK.text : valueColor(field, tone, color)}
      >
        {formatValue(field)}
      </VrText>
    </Container>
  );
}

function IdentCell({ field, color }: Row) {
  const tone = useSite().toneFor(field.value, field.tone);
  return (
    <Container flexDirection="column" gapRow={px(4)}>
      <Label size={FS.label}>{field.label}</Label>
      <VrText fontSize={px(FS.ident)} fontWeight="bold" color={field.pending ? INK.text : valueColor(field, tone, color)}>
        {formatValue(field)}
      </VrText>
    </Container>
  );
}

function StatTile({ field, color }: Row) {
  const tone = useSite().toneFor(field.value, field.tone);
  const meter = meterOf(field);
  return (
    <Container flexDirection="column" gapRow={px(6)} padding={px(FS.tile)} borderRadius={px(12)} flexGrow={1}>
      <Surface radius={px(12)} fill={INK.white} fillOpacity={0.045} borderOpacity={ALPHA.tileBorder} />
      <Label size={FS.label}>{field.label}</Label>
      <VrText fontSize={px(FS.stat)} fontWeight="bold" color={field.pending ? INK.text : valueColor(field, tone, color)}>
        {formatValue(field)}
      </VrText>
      {meter !== null && <Meter value={meter} color={tone ? TONE[tone] : INK.accentBright} />}
    </Container>
  );
}

function SystemCell({ field, color }: Row) {
  const tone = useSite().toneFor(field.value, field.tone);
  return (
    <Container flexDirection="column" gapRow={px(4)} paddingY={px(13)} borderBottomWidth={1} borderColor={HAIRLINE}>
      <Label size={FS.label}>{field.label}</Label>
      <VrText fontSize={px(FS.value)} fontWeight="bold" letterSpacing={px(FS.value) * 0.02} color={valueColor(field, tone, color)}>
        {formatValue(field)}
      </VrText>
    </Container>
  );
}

function IncidentLine({ incident, active, onSelect }: { incident: SecurityIncident; active: boolean; onSelect: () => void }) {
  const sev = SEVERITY_COLOR[incident.severity];
  return (
    <PressRow active={active} radius={px(9)} paddingX={px(16)} paddingY={px(12)} gap={px(14)} onSelect={onSelect}>
      <VrText flexGrow={1} flexShrink={1} minWidth={0} fontSize={px(FS.row)} fontWeight="semi-bold" color={INK.text}>
        {incident.type}
      </VrText>
      <Container width={px(132)} flexShrink={0}>
        <VrText fontSize={px(FS.meta)} fontWeight="medium" color={INK.text}>
          {incident.sourceId || incident.source}
        </VrText>
      </Container>
      <Container width={px(76)} paddingY={px(3)} borderRadius={px(6)} alignItems="center" flexShrink={0} backgroundColor={rgba(sev, 0.18)}>
        <VrText fontSize={px(FS.label)} fontWeight="bold" letterSpacing={0.8} color={sev}>
          {incident.severity}
        </VrText>
      </Container>
    </PressRow>
  );
}

function DetailRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Container flexDirection="column" paddingY={px(7)} borderBottomWidth={1} borderColor={HAIRLINE}>
      <Label size={11.5} weight="medium" tracking={0.05}>
        {label}
      </Label>
      <VrText marginTop={px(2)} fontSize={px(14)} fontWeight="semi-bold" color={color ?? INK.text}>
        {value}
      </VrText>
    </Container>
  );
}

function useTravel(incident: SecurityIncident) {
  const { goToHotspot, goToLayout, find: findLayout } = useLayoutNavigation();
  const site = useSite();
  const target = incident.navigationTarget;
  const anchor = site.securityHotspotById[incident.sourceHotspotId];
  const sourceAnchor = anchor && anchor.enabled !== false ? anchor : null;
  const canTravel = !!sourceAnchor || !!findLayout(target);
  const travel = () => {
    useSecurityStore.getState().setViewingIncidentId(incident.id);
    if (sourceAnchor) goToHotspot(incident.sourceHotspotId);
    else goToLayout(target);
  };
  return canTravel ? travel : null;
}

function IncidentDetailStrip({ incident }: { incident: SecurityIncident }) {
  const travel = useTravel(incident);
  return (
    <Container flexDirection="column" marginTop={px(12)} paddingX={px(16)} paddingY={px(16)} borderRadius={px(10)} flexShrink={0} width="100%">
      <Surface radius={px(10)} fill={INK.white} fillOpacity={ALPHA.tile} borderOpacity={ALPHA.border} />
      <Container flexDirection="row" alignItems="flex-end" justifyContent="space-between" gapColumn={px(12)}>
        <VrText flexShrink={1} fontSize={px(13.5)} fontWeight="bold" color={INK.text}>
          {`${incident.id} - ${incident.type}`}
        </VrText>
        <Label size={11} tracking={0.08} color={TONE[STATUS_TONE[incident.status]]}>
          {incident.status}
        </Label>
      </Container>
      <Container marginTop={px(12)}>
        <Grid columns={4} gapX={px(20)}>
          <DetailRow label="Acknowledged" value={incident.acknowledged ? "Yes" : "No"} />
          <DetailRow label="Location" value={incident.locationLabel} />
          <DetailRow label="Source" value={incident.source} />
          <DetailRow label="Assigned" value={incident.assignedTeam} />
        </Grid>
      </Container>
      {travel && (
        <Container flexDirection="row" paddingTop={px(14)}>
          <ActionButton label="View location" onSelect={travel} />
        </Container>
      )}
    </Container>
  );
}

function IncidentRow({
  incident,
  selected,
  onSelect,
  onShowLog,
}: {
  incident: SecurityIncident;
  selected: boolean;
  onSelect: () => void;
  onShowLog: () => void;
}) {
  const audit = useSecurityStore((s) => s.audit);
  const count = useMemo(() => audit.filter((e) => e.incidentId === incident.id).length, [audit, incident.id]);
  const travel = useTravel(incident);
  const sev = SEVERITY_COLOR[incident.severity];
  return (
    <Container flexDirection="column" borderRadius={px(10)} flexShrink={0} width="100%">
      <Surface radius={px(10)} fill={INK.white} fillOpacity={0.06} borderOpacity={selected ? 0.45 : ALPHA.border} />
      <Container
        flexDirection="row"
        alignItems="center"
        gapColumn={px(12)}
        paddingX={px(14)}
        paddingY={px(10)}
        cursor="pointer"
        onPointerDown={onSelect}
      >
        <Container flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} gapRow={px(2)}>
          <VrText fontSize={px(14)} fontWeight="semi-bold" color={INK.text}>
            {incident.type}
          </VrText>
          <VrText fontSize={px(12)} color={INK.text}>
            {`${incident.source} - ${incident.locationLabel}`}
          </VrText>
        </Container>
        <Pill color={sev}>{incident.severity}</Pill>
      </Container>
      {selected && (
        <Container flexDirection="row" flexWrap="wrap" gapColumn={px(6)} gapRow={px(6)} paddingX={px(12)} paddingY={px(8)} borderTopWidth={1} borderColor={HAIRLINE}>
          <ActionButton label={`Audit - ${count}`} onSelect={onShowLog} />
          {travel && <ActionButton label="View location" onSelect={travel} />}
        </Container>
      )}
    </Container>
  );
}

function IncidentLog({ incident }: { incident: SecurityIncident }) {
  const audit = useSecurityStore((s) => s.audit);
  const entries = useMemo(() => audit.filter((e) => e.incidentId === incident.id), [audit, incident.id]);
  if (entries.length === 0) {
    return (
      <VrText paddingY={px(12)} fontSize={px(13)} color={INK.text}>
        No entries yet.
      </VrText>
    );
  }
  return (
    <>
      {entries.map((e, i) => (
        <Container
          key={e.seq}
          flexDirection="row"
          alignItems="center"
          gapColumn={px(10)}
          paddingY={px(9)}
          borderBottomWidth={i < entries.length - 1 ? 1 : 0}
          borderColor={HAIRLINE}
          flexShrink={0}
        >
          <VrText flexGrow={1} flexShrink={1} minWidth={0} fontSize={px(12.5)} color={INK.text}>
            {e.detail}
          </VrText>
          {e.actor ? (
            <Avatar initials={e.actor.initials} color={AVATAR_COLORS[e.actor.tone % AVATAR_COLORS.length]} />
          ) : (
            <Container width={px(20)} height={px(20)} />
          )}
        </Container>
      ))}
    </>
  );
}

function SourceIncidents({ hotspotId, onShowLog }: { hotspotId: string; onShowLog: (i: SecurityIncident) => void }) {
  const incidents = useSecurityStore((s) => s.incidents);
  const selectedId = useSecurityStore((s) => s.selectedIncidentId);
  const setSelected = useSecurityStore((s) => s.setSelectedIncidentId);
  const open = useMemo(
    () => incidents.filter((i) => i.sourceHotspotId === hotspotId && i.status !== "RESOLVED"),
    [incidents, hotspotId],
  );
  if (open.length < 2) return null;
  const activeId = open.some((i) => i.id === selectedId) ? selectedId : open[0].id;
  return (
    <Container flexDirection="column" flexShrink={0} width="100%">
      <SectionLabel aside={`${open.length} open`}>Alerts</SectionLabel>
      <Container flexDirection="column" gapRow={px(8)}>
        {open.map((i) => (
          <IncidentRow
            key={i.id}
            incident={i}
            selected={i.id === activeId}
            onSelect={() => setSelected(i.id)}
            onShowLog={() => onShowLog(i)}
          />
        ))}
      </Container>
    </Container>
  );
}

function FieldAlerts({ hotspotId }: { hotspotId: string }) {
  const incidents = useSecurityStore((s) => s.incidents);
  const history = useSecurityStore((s) => s.history);
  const selectedId = useSecurityStore((s) => s.selectedIncidentId);
  const setSelected = useSecurityStore((s) => s.setSelectedIncidentId);
  const open = useMemo(
    () => incidents.filter((i) => i.sourceHotspotId === hotspotId && i.status !== "RESOLVED"),
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
    <Container flexDirection="column" flexShrink={0} width="100%">
      <SectionLabel top={0} aside={open.length ? `${open.length} open` : lastClosed ? "Resolved" : "None open"}>
        {open.length || !lastClosed ? "Alerts" : "Recent alerts"}
      </SectionLabel>
      {open.length > 0 ? (
        <Container flexDirection="column" gapRow={px(8)}>
          {open.map((i) => (
            <IncidentLine key={i.id} incident={i} active={i.id === activeId} onSelect={() => setSelected(i.id)} />
          ))}
        </Container>
      ) : lastClosed ? (
        <IncidentLine incident={lastClosed} active={false} onSelect={() => {}} />
      ) : (
        <EmptyNote>No open alerts</EmptyNote>
      )}
    </Container>
  );
}

function FilterSelect({
  allLabel,
  items,
  value,
  onChange,
  multi = false,
}: {
  allLabel?: string;
  items: { id: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  multi?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const all = multi && value.length === 0;
  const isOn = (id: string) => all || value.includes(id);
  const selected = items.filter((i) => value.includes(i.id));
  const summary = !multi
    ? (items.find((i) => i.id === value[0])?.label ?? items[0]?.label ?? "")
    : selected.length === 0 || selected.length === items.length
      ? (allLabel ?? "All")
      : selected.length === 1
        ? selected[0].label
        : `${selected[0].label} +${selected.length - 1}`;
  const narrowed = multi && value.length > 0;
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
  return (
    <Container flexDirection="column" flexShrink={0}>
      <Container
        flexDirection="row"
        alignItems="center"
        gapColumn={px(6)}
        paddingLeft={px(12)}
        paddingRight={px(10)}
        paddingY={px(5)}
        borderRadius={999}
        cursor="pointer"
        onPointerDown={() => setOpen((o) => !o)}
      >
        <Surface radius={999} fill={narrowed ? INK.accent : INK.white} fillOpacity={narrowed ? 1 : 0.06} borderOpacity={narrowed ? 0.5 : ALPHA.border} />
        <VrText fontSize={px(12)} fontWeight="semi-bold" color={narrowed ? INK.white : INK.text}>
          {summary}
        </VrText>
        <ChevronDown width={px(13)} height={px(13)} color={INK.text} transformRotateZ={open ? 180 : 0} />
      </Container>
      {open && (
        <Container flexDirection="column" marginTop={px(4)} padding={px(4)} borderRadius={px(10)} minWidth={px(190)} backgroundColor={INK.menu} borderWidth={1.5} borderColor={rgba(INK.white, ALPHA.border)}>
          {items.map((i) => (
            <Container
              key={i.id}
              flexDirection="row"
              alignItems="center"
              gapColumn={px(8)}
              paddingX={px(10)}
              paddingY={px(7)}
              borderRadius={px(7)}
              cursor="pointer"
              hover={{ backgroundColor: rgba(INK.white, 0.08) }}
              onPointerDown={() => toggle(i.id)}
            >
              <VrText flexGrow={1} fontSize={px(12.5)} color={INK.text}>
                {i.label}
              </VrText>
              <Check width={px(13)} height={px(13)} color={INK.text} opacity={isOn(i.id) ? 1 : 0} />
            </Container>
          ))}
        </Container>
      )}
    </Container>
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

  const current = useMemo(() => incidents.filter((i) => i.status !== "RESOLVED"), [incidents]);
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
    return [...filtered].sort((a, b) =>
      bySeverity
        ? SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.eventTime.localeCompare(a.eventTime)
        : b.eventTime.localeCompare(a.eventTime),
    );
  }, [tab, current, past, severities, sources, bySeverity]);
  const severityCounts = useMemo(() => {
    const out: Record<IncidentSeverity, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    for (const i of tab === "current" ? current : past) {
      if (sources.length === 0 || sources.includes(i.sourceHotspotId)) out[i.severity] += 1;
    }
    return out;
  }, [tab, current, past, sources]);
  const narrowed = severities.length > 0 || sources.length > 0;
  const activeId = rows.some((i) => i.id === selectedId) ? selectedId : (rows[0]?.id ?? null);
  const active = rows.find((i) => i.id === activeId) ?? null;

  return (
    <Container flexDirection="column" flexShrink={0} width="100%">
      <Container
        flexDirection="row"
        flexWrap="wrap"
        alignItems="flex-start"
        justifyContent="space-between"
        gapColumn={px(12)}
        gapRow={px(8)}
        marginTop={flush ? 0 : px(20)}
        flexShrink={0}
      >
        <Container flexDirection="row" alignItems="center" gapColumn={px(8)}>
          <Label size={11.5}>Incidents</Label>
          <ChipButton label="Current" on={tab === "current"} disabled={!hasCurrent} onSelect={() => setTab("current")} />
          <ChipButton label="Past" on={tab === "past"} onSelect={() => setTab("past")} />
        </Container>
        <Container flexDirection="row" flexWrap="wrap" alignItems="flex-start" justifyContent="flex-end" gapColumn={px(6)} gapRow={px(6)} flexShrink={1}>
          {SEVERITY_ORDER_UI.map((sv) => (
            <ChipButton
              key={sv}
              label={SEVERITY_SHORT[sv]}
              count={severityCounts[sv]}
              dot={SEVERITY_COLOR[sv]}
              on={severities.includes(sv)}
              disabled={severityCounts[sv] === 0}
              onSelect={() => setSeverities((prev) => (prev.includes(sv) ? prev.filter((x) => x !== sv) : [...prev, sv]))}
            />
          ))}
          <FilterSelect
            allLabel="All sources"
            items={SECURITY_SOURCES.map((x) => ({ id: x.hotspotId, label: x.label }))}
            value={sources}
            onChange={setSources}
            multi
          />
          <FilterSelect
            items={[
              { id: "time", label: "Newest first" },
              { id: "severity", label: "Severity" },
            ]}
            value={sort}
            onChange={setSort}
          />
        </Container>
      </Container>
      <Container flexDirection="column" marginTop={px(12)} flexShrink={0}>
        {rows.length === 0 ? (
          <EmptyNote>
            {narrowed ? "Nothing matches these filters." : tab === "current" ? "Nothing open." : "Nothing closed yet."}
          </EmptyNote>
        ) : (
          <>
            <Container flexDirection="column" gapRow={px(8)} flexShrink={0}>
              {rows.map((i) => (
                <IncidentLine key={i.id} incident={i} active={i.id === activeId} onSelect={() => setSelected(i.id)} />
              ))}
            </Container>
            {active && <IncidentDetailStrip incident={active} />}
          </>
        )}
      </Container>
    </Container>
  );
}

function SecurityCommandView({ fields, wide }: { fields: Row[]; wide: boolean }) {
  const systems = fields.filter((f) => f.field.name.endsWith("_status"));
  const real = systems.filter((f) => f.field.name !== ROLLUP_FIELD);
  const reporting = real.filter((f) => !!f.color).length;
  const counters = COUNTER_FIELDS.map((name) => fields.find((f) => f.field.name === name)).filter(
    (f): f is Row => !!f,
  );
  return (
    <Container flexDirection="column" paddingTop={px(4)} flexShrink={0} width="100%" flexGrow={wide ? 1 : 0}>
      <SectionLabel
        top={0}
        aside={
          <VrText fontSize={px(FS.label)} fontWeight="bold" letterSpacing={0.5} color={reporting ? INK.warn : INK.ok}>
            {reporting ? `${reporting} of ${real.length} reporting` : `${real.length} of ${real.length} normal`}
          </VrText>
        }
      >
        Systems
      </SectionLabel>
      <Grid columns={wide ? 2 : 3} gapX={px(26)}>
        {systems.map((r) => (
          <SystemCell key={r.field.name} {...r} />
        ))}
      </Grid>
      {wide && (
        <Container marginTop="auto" paddingTop={px(20)}>
          <Grid columns={2} gapX={px(12)} gapY={px(12)}>
            {counters.map((r) => (
              <StatTile key={r.field.name} {...r} />
            ))}
          </Grid>
        </Container>
      )}
    </Container>
  );
}

function HotspotBody({ hotspot, hotspotId, fields }: { hotspot: HotspotConfig; hotspotId: string; fields: Row[] }) {
  const hero = hotspot.alert ? null : (HERO_FIELDS.map((n) => fields.find((f) => f.field.name === n)).find((f) => !!f) ?? null);
  const rest = fields.filter((f) => f !== hero);

  if (hotspot.clip || hotspot.image) {
    return (
      <Container flexDirection="row" marginTop={px(FS.gap)} gapColumn={px(FS.gap * 1.4)} flexGrow={1} minHeight={0} width="100%">
        <Container flexBasis={0} flexGrow={1.45} minWidth={0} minHeight={0} flexDirection="column" justifyContent="center" overflow="hidden">
          {hotspot.clip ? (
            <Clip clip={hotspot.clip} camera={cameraIdOf(hotspot)} />
          ) : (
            <StillPanel src={hotspot.image!} tag={hotspot.name} />
          )}
        </Container>
        <Container flexBasis={0} flexGrow={1} minWidth={0} flexDirection="column" minHeight={0}>
          <Scroll>
            {hero && <HeroTile {...hero} />}
            {rest.map((r) => (
              <ReadingRow key={r.field.name} {...r} />
            ))}
            <Container height={px(FS.gap)} flexShrink={0} />
            <FieldAlerts hotspotId={hotspotId} />
          </Scroll>
        </Container>
      </Container>
    );
  }

  const stats = rest.filter((f) => typeof f.field.value === "number");
  const idents = rest.filter((f) => typeof f.field.value !== "number");
  return (
    <Container flexDirection="column" marginTop={px(FS.gap)} gapRow={px(FS.gap)} flexGrow={1} minHeight={0} width="100%">
      <Scroll>
        <Container flexDirection="column" gapRow={px(FS.gap)} flexShrink={0} width="100%">
          {hotspot.alert && <AlertBanner alert={hotspot.alert} marginBottom={0} />}
          {hero && <HeroTile {...hero} />}
          {idents.length > 0 && (
            <Container padding={px(FS.tile)} borderRadius={px(12)} flexShrink={0} width="100%">
              <Surface radius={px(12)} fill={INK.white} fillOpacity={ALPHA.tileSoft} borderOpacity={ALPHA.divider} />
              <Grid columns={Math.min(4, idents.length)} gapX={px(FS.gap * 1.2)} gapY={px(12)}>
                {idents.map((r) => (
                  <IdentCell key={r.field.name} {...r} />
                ))}
              </Grid>
            </Container>
          )}
          {stats.length > 0 && (
            <Grid columns={Math.min(5, stats.length)} gapX={px(FS.gap * 0.8)} gapY={px(FS.gap * 0.8)}>
              {stats.map((r) => (
                <StatTile key={r.field.name} {...r} />
              ))}
            </Grid>
          )}
          <FieldAlerts hotspotId={hotspotId} />
        </Container>
      </Scroll>
    </Container>
  );
}

function FieldsBlock({ hotspot, fields }: { hotspot: HotspotConfig; fields: Row[] }) {
  const still = hotspot.clip ? undefined : hotspot.image;
  const beside = still ? fields.slice(0, FIELDS_BESIDE_STILL) : [];
  const below = still ? fields.slice(FIELDS_BESIDE_STILL) : fields;
  const gap = px(40);
  return (
    <Container flexDirection="column" marginTop={px(hotspot.clip ? 12 : 16)} flexShrink={0} width="100%">
      <Rule marginTop={0} />
      <Container flexDirection="column" paddingTop={px(4)}>
        {hotspot.clip && (
          <Container width="100%" alignItems="center" marginBottom={px(16)}>
            <Clip clip={hotspot.clip} camera={cameraIdOf(hotspot)} width={px(520)} />
          </Container>
        )}
        {still && (
          <Container flexDirection="row" gapColumn={gap}>
            <Container flexBasis={0} flexGrow={1} padding={px(8)} alignItems="center">
              <Still src={still} width={px(280)} />
            </Container>
            <Container flexBasis={0} flexGrow={1} flexDirection="column">
              {beside.map((r) => (
                <Field key={r.field.name} {...r} />
              ))}
            </Container>
          </Container>
        )}
        <Grid columns={2} gapX={gap}>
          {below.map((r) => (
            <Field key={r.field.name} {...r} />
          ))}
        </Grid>
      </Container>
    </Container>
  );
}

export function V5HotspotCard({ destId, index, hotspotId: namedId, onClose }: VrCardProps) {
  const site = useSite();
  const securityById = useSecurityStore((s) => s.hotspotById);
  const incidents = useSecurityStore((s) => s.incidents);
  const incidentFields = useSecurityStore((s) => s.incidentFields);
  const seedById = useSecurityStore((s) => s.seedHotspotById);
  const selectedIncidentId = useSecurityStore((s) => s.selectedIncidentId);
  const [logFor, setLogFor] = useState<SecurityIncident | null>(null);

  const isCentre = namedId === SECURITY_CENTRE_ID;
  const layout = site.layoutById[destId];
  const hotspotId = namedId ?? layout?.hotspots[index - 1];
  const hotspot = hotspotId ? (site.hotspotById[hotspotId] ?? securityById[hotspotId]) : undefined;
  const isSecurity = !!hotspotId && !!securityById[hotspotId];
  const designed = isSecurity && !isCentre;

  const fields = useMemo<Row[]>(() => {
    if (!hotspot) return [];
    if (hotspotId === SECURITY_CENTRE_ID) return commandViewFields(hotspot.fields, incidents);
    const mine =
      hotspotId && isFieldHotspot(hotspotId)
        ? incidents.filter((i) => i.sourceHotspotId === hotspotId && i.status !== "RESOLVED")
        : [];
    const live = mine.length > 0;
    const shown = (rows: HotspotField[]) =>
      rows.filter((f) => (live || !f.eventOnly) && !isBlank(f) && !(isSecurity && TIME_FIELDS.has(f.name)));
    const chosen = mine.length > 1 ? (mine.find((i) => i.id === selectedIncidentId) ?? mine[0]) : undefined;
    const patch = chosen ? incidentFields[chosen.id] : undefined;
    if (!patch) return shown(hotspot.fields).map((f) => ({ field: f }));
    const seed = seedById[hotspot.id]?.fields ?? hotspot.fields;
    return shown(seed.filter((f) => f.name in patch || IDENTITY_FIELDS.has(f.name))).map((f) => ({
      field: f.name === "event_id" ? { ...f, value: chosen!.id } : f.name in patch ? { ...f, value: patch[f.name] } : f,
    }));
  }, [hotspot, hotspotId, isSecurity, incidents, incidentFields, selectedIncidentId, seedById]);

  if (!hotspot || !layout) return null;
  if (hotspot.poster) return <PosterCard poster={hotspot.poster} onClose={onClose} />;

  if (logFor) {
    return (
      <CardShell width="26%" maxHeight="32%" onDismiss={() => setLogFor(null)}>
        <CardHeader title="Incident log" subtitle={logFor.id} onClose={() => setLogFor(null)} />
        <Container marginTop={px(12)} flexDirection="column" flexShrink={1} minHeight={0}>
          <Scroll>
            <IncidentLog incident={logFor} />
          </Scroll>
        </Container>
      </CardShell>
    );
  }

  return (
    <CardShell width="46%" height="38%" padding={px(isSecurity ? FS.pad : 24)} onDismiss={onClose}>
      <CardHeader
        title={hotspot.popupTitle}
        subtitle={layout.name}
        onClose={onClose}
        titleSize={isSecurity ? FS.title : 18}
        subtitleSize={isSecurity ? FS.sub : 13}
      />
      {designed && hotspotId ? (
        <HotspotBody hotspot={hotspot} hotspotId={hotspotId} fields={fields} />
      ) : isCentre ? (
        <Container flexDirection="row" marginTop={px(20)} gapColumn={px(32)} flexGrow={1} minHeight={0} width="100%">
          <Container flexBasis={0} flexGrow={1} minWidth={0} minHeight={0} flexDirection="column">
            <Scroll>
              {hotspot.alert && <AlertBanner alert={hotspot.alert} />}
              <SecurityCommandView fields={fields} wide />
            </Scroll>
          </Container>
          <Container flexBasis={0} flexGrow={1.45} minWidth={0} minHeight={0} flexDirection="column">
            <Scroll>
              <SecurityIncidentCentre flush />
            </Scroll>
          </Container>
        </Container>
      ) : (
        <Container marginTop={px(isSecurity ? 16 : 12)} flexDirection="column" flexGrow={1} minHeight={0}>
          <Scroll>
            {hotspot.alert && <AlertBanner alert={hotspot.alert} />}
            {hotspot.journey && (
              <Journey title={site.ui.popup.journeyTitle} steps={hotspot.journey} stageOpacity={1} titleOpacity={1} />
            )}
            {hotspotId && isFieldHotspot(hotspotId) && <SourceIncidents hotspotId={hotspotId} onShowLog={setLogFor} />}
            <FieldsBlock hotspot={hotspot} fields={fields} />
          </Scroll>
        </Container>
      )}
    </CardShell>
  );
}
