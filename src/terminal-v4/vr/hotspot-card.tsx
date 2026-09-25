"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Container } from "@react-three/uikit";
import { Check, ChevronDown } from "@react-three/uikit-lucide";
import { useSite } from "@/config/context";
import type { HotspotField, Tone } from "@/config/schema";
import type { VrCardProps } from "@/vr/bridge";
import {
  ALPHA,
  ActionButton,
  AlertBanner,
  Avatar,
  CardHeader,
  CardShell,
  ChipButton,
  Grid,
  HAIRLINE,
  INK,
  Journey,
  Label,
  Meter,
  Pill,
  PosterCard,
  Rule,
  Scroll,
  Still,
  Surface,
  formatValue,
  meterOf,
  px,
  rgba,
  tonedColor,
  type CardTone,
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
  type SecurityActor,
  type SecurityAuditEntry,
  type SecurityIncident,
} from "../stores/security-store";
import { useLayoutNavigation } from "../overlay/use-layout-navigation";

type Row = { field: HotspotField; color?: string };

const SECURITY_COMMAND_ID = "S08";
const SECURITY_INCIDENT_ID = "S07";
const FIELDS_BESIDE_STILL = 4;
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
const AVATAR_COLORS = ["#4a7dff", "#12b886", "#c77dff", "#ff9f43", "#2aa9c9", "#e8638b"];

const TONE_V4: CardTone = { ok: INK.ok, warn: INK.warn, alert: INK.alertSoft };
const SEVERITY_COLOR: Record<IncidentSeverity, string> = {
  LOW: INK.ok,
  MEDIUM: INK.warn,
  HIGH: INK.alertSoft,
  CRITICAL: INK.critical,
};
const SEVERITY_RANK: Record<IncidentSeverity, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
const SEVERITY_ORDER_UI: IncidentSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const STATUS_TONE: Record<IncidentStatus, Tone> = { ACTIVE: "alert", INVESTIGATING: "warn", RESOLVED: "ok" };

function valueColor(field: HotspotField, tone: Tone | undefined, color?: string) {
  return color ?? tonedColor(field, tone, TONE_V4) ?? INK.text;
}

function parseDemoTime(value: string): Date | null {
  const d = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatClock(value: string): string {
  const d = parseDemoTime(value);
  if (!d) return value;
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatStamp(value: string): string {
  const d = parseDemoTime(value);
  if (!d) return value;
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`;
}

function formatDay(value: string): string {
  const d = parseDemoTime(value);
  if (!d) return value;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ownerOf(entries: SecurityAuditEntry[]): SecurityActor | undefined {
  for (let i = entries.length - 1; i >= 0; i--) if (entries[i].actor) return entries[i].actor;
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

function auditLabel(count: number): string {
  return `Audit trail - ${count} ${count === 1 ? "entry" : "entries"}`;
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
    return { value: `${n} ${n === 1 ? "event" : "events"} - ${s}`, color: SEVERITY_COLOR[s] };
  };
  const derived: Record<string, { value: HotspotField["value"]; tone?: Tone; color?: string }> = {
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

function SectionLabel({ children, top = 16 }: { children: string; top?: number }) {
  return (
    <Container marginTop={px(top)} marginBottom={px(8)} flexShrink={0}>
      <Label size={10} tracking={0.07} opacity={ALPHA.dim}>
        {children}
      </Label>
    </Container>
  );
}

function Field({ field, color }: Row) {
  const tone = useSite().toneFor(field.value, field.tone);
  const flag = !field.pending && !!tonedColor(field, tone, TONE_V4);
  const meter = meterOf(field);
  const value = formatValue(field);
  return (
    <Container flexDirection="column" paddingY={px(9)} borderBottomWidth={1} borderColor={HAIRLINE}>
      <Label size={10.5} tracking={0.1} opacity={ALPHA.faint}>
        {field.label}
      </Label>
      <VrText
        marginTop={px(3)}
        fontSize={px(18)}
        fontWeight="bold"
        letterSpacing={flag ? px(18) * 0.02 : 0}
        color={field.pending ? INK.text : valueColor(field, tone, color)}
        opacity={field.pending ? ALPHA.faint : 1}
      >
        {flag ? value.toUpperCase() : value}
      </VrText>
      {meter !== null && <Meter value={meter} color={tone ? TONE_V4[tone] : INK.accentBright} />}
    </Container>
  );
}

function CapabilityLine({ field, color }: Row) {
  const tone = useSite().toneFor(field.value, field.tone);
  const tint = valueColor(field, tone, color);
  return (
    <Container
      flexDirection="row"
      alignItems="center"
      justifyContent="space-between"
      gapColumn={px(10)}
      paddingX={px(11)}
      paddingY={px(8)}
      borderRadius={px(8)}
      backgroundColor={rgba(INK.white, 0.04)}
    >
      <VrText flexShrink={1} fontSize={px(12.5)} color={INK.text} opacity={ALPHA.dim}>
        {field.label}
      </VrText>
      <Container flexDirection="row" alignItems="center" gapColumn={px(6)} flexShrink={0}>
        <Container width={px(6)} height={px(6)} borderRadius={999} backgroundColor={tint} />
        <Label size={11.5} tracking={0.03} color={tint}>
          {formatValue(field)}
        </Label>
      </Container>
    </Container>
  );
}

function CounterTile({ field, color }: Row) {
  const tone = useSite().toneFor(field.value, field.tone);
  return (
    <Container flexDirection="column" paddingX={px(11)} paddingY={px(10)} borderRadius={px(8)} backgroundColor={rgba(INK.white, 0.04)}>
      <Label size={9.5} tracking={0.07} opacity={ALPHA.dim}>
        {field.label.split(" ")[0]}
      </Label>
      <VrText marginTop={px(2)} fontSize={px(21)} fontWeight="bold" color={valueColor(field, tone, color)}>
        {formatValue(field)}
      </VrText>
    </Container>
  );
}

function DetailRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Container flexDirection="column" paddingY={px(5)} borderBottomWidth={1} borderColor={HAIRLINE}>
      <VrText fontSize={px(10.5)} fontWeight="medium" color={INK.text} opacity={ALPHA.faint}>
        {label}
      </VrText>
      <VrText fontSize={px(12)} fontWeight="semi-bold" color={color ?? INK.text}>
        {value}
      </VrText>
    </Container>
  );
}

function IncidentRow({
  incident,
  expanded,
  selected = false,
  compact = false,
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
  const acknowledge = useSecurityStore((s) => s.acknowledgeIncident);
  const escalate = useSecurityStore((s) => s.escalateIncident);
  const deescalate = useSecurityStore((s) => s.deescalateIncident);
  const resolve = useSecurityStore((s) => s.resolveIncident);
  const audit = useSecurityStore((s) => s.audit);
  const { goToLayout, find: findLayout } = useLayoutNavigation();
  const closed = incident.status === "RESOLVED";
  const mine = useMemo(() => audit.filter((e) => e.incidentId === incident.id), [audit, incident.id]);
  const owner = useMemo(() => ownerOf(mine), [mine]);
  const closedIn = useMemo(() => (closed ? closedDuration(mine) : null), [mine, closed]);
  const canTravel = !!findLayout(incident.navigationTarget);
  const isOpen = expanded && !compact;

  const actions = (
    <Container flexDirection="row" flexWrap="wrap" alignItems="center" gapColumn={px(6)} gapRow={px(6)}>
      {!closed && (
        <>
          <ActionButton size={11} label="Acknowledge" disabled={incident.acknowledged} onSelect={() => acknowledge(incident.id)} />
          <ActionButton size={11} label="Escalate" disabled={incident.severity === "CRITICAL"} onSelect={() => escalate(incident.id)} />
          <ActionButton size={11} label="De-escalate" disabled={incident.severity === "LOW"} onSelect={() => deescalate(incident.id)} />
          <ActionButton size={11} label="Resolve" onSelect={() => resolve(incident.id)} />
        </>
      )}
      <ActionButton size={11} label={auditLabel(mine.length)} onSelect={onShowLog} />
      {canTravel && (
        <ActionButton
          size={11}
          label="View location"
          onSelect={() => {
            useSecurityStore.getState().setViewingIncidentId(incident.id);
            goToLayout(incident.navigationTarget);
          }}
        />
      )}
    </Container>
  );

  return (
    <Container flexDirection="column" borderRadius={px(10)} flexShrink={0} width="100%">
      <Surface radius={px(10)} fill={INK.white} fillOpacity={0.06} borderOpacity={selected && compact ? 0.45 : ALPHA.border} />
      <Container flexDirection="row" alignItems="center" gapColumn={px(10)} paddingX={px(12)} paddingY={px(8)} cursor="pointer" onPointerDown={onSelect}>
        <VrText flexShrink={0} fontSize={px(11)} color={INK.text} opacity={ALPHA.faint}>
          {formatClock(incident.eventTime)}
        </VrText>
        <Container flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
          <VrText fontSize={px(12.5)} fontWeight="semi-bold" color={INK.text}>
            {incident.type}
          </VrText>
          <VrText fontSize={px(10.5)} color={INK.text} opacity={ALPHA.faint}>
            {`${incident.source} - ${incident.locationLabel}`}
          </VrText>
        </Container>
        <Pill color={SEVERITY_COLOR[incident.severity]} radius={px(4)}>
          {incident.severity}
        </Pill>
        {owner && <Avatar initials={owner.initials} color={AVATAR_COLORS[owner.tone % AVATAR_COLORS.length]} />}
      </Container>
      {compact && selected && (
        <Container paddingX={px(12)} paddingY={px(8)} borderTopWidth={1} borderColor={HAIRLINE}>
          {actions}
        </Container>
      )}
      {isOpen && (
        <Container paddingX={px(6)} paddingBottom={px(6)}>
          <Container flexDirection="column" paddingX={px(14)} paddingY={px(12)} borderRadius={px(9)} backgroundColor={rgba(INK.white, 0.045)}>
            <Grid columns={2} gapX={px(20)}>
              <DetailRow label="Record" value={incident.id} />
              <DetailRow label="Type" value={incident.type} />
              <DetailRow label="Severity" value={incident.severity} color={SEVERITY_COLOR[incident.severity]} />
              <DetailRow label="Status" value={incident.status} color={TONE_V4[STATUS_TONE[incident.status]]} />
              <DetailRow label="Source" value={incident.source} />
              {incident.sourceId ? <DetailRow label="Source ID" value={incident.sourceId} /> : null}
              <DetailRow label="Location" value={incident.locationLabel} />
              <DetailRow label="Event time" value={formatStamp(incident.eventTime)} />
              <DetailRow label="Assigned team" value={incident.assignedTeam} />
              {closedIn ? <DetailRow label="Closed in" value={closedIn} /> : null}
            </Grid>
            <Container paddingTop={px(12)}>{actions}</Container>
          </Container>
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
      <VrText paddingY={px(8)} fontSize={px(11)} color={INK.text} opacity={ALPHA.faint}>
        No log entries for this incident.
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
          gapColumn={px(8)}
          paddingY={px(7)}
          borderBottomWidth={i < entries.length - 1 ? 1 : 0}
          borderColor={HAIRLINE}
          flexShrink={0}
        >
          <Container width={px(62)} flexShrink={0}>
            <VrText fontSize={px(10)} color={INK.text} opacity={ALPHA.faint}>
              {formatClock(e.at)}
            </VrText>
          </Container>
          <VrText flexGrow={1} flexShrink={1} minWidth={0} fontSize={px(11)} color={INK.text} opacity={ALPHA.dim}>
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
        paddingLeft={px(10)}
        paddingRight={px(8)}
        paddingY={px(4)}
        borderRadius={999}
        cursor="pointer"
        onPointerDown={() => setOpen((o) => !o)}
      >
        <Surface radius={999} fill={narrowed ? INK.accent : INK.white} fillOpacity={narrowed ? 1 : 0.06} borderOpacity={narrowed ? 0.5 : ALPHA.border} />
        <VrText fontSize={px(10.5)} fontWeight="medium" color={narrowed ? INK.white : INK.text} opacity={narrowed ? 1 : ALPHA.dim}>
          {summary}
        </VrText>
        <ChevronDown width={px(12)} height={px(12)} color={INK.text} transformRotateZ={open ? 180 : 0} />
      </Container>
      {open && (
        <Container flexDirection="column" marginTop={px(4)} padding={px(4)} borderRadius={px(10)} minWidth={px(170)} backgroundColor={INK.menu} borderWidth={1.5} borderColor={rgba(INK.white, ALPHA.border)}>
          {items.map((i) => (
            <Container
              key={i.id}
              flexDirection="row"
              alignItems="center"
              gapColumn={px(6)}
              paddingX={px(8)}
              paddingY={px(6)}
              borderRadius={px(7)}
              cursor="pointer"
              hover={{ backgroundColor: rgba(INK.white, 0.08) }}
              onPointerDown={() => toggle(i.id)}
            >
              <VrText flexGrow={1} fontSize={px(11)} color={INK.text} opacity={isOn(i.id) ? 1 : ALPHA.dim}>
                {i.label}
              </VrText>
              <Check width={px(12)} height={px(12)} color={INK.text} opacity={isOn(i.id) ? 1 : 0} />
            </Container>
          ))}
        </Container>
      )}
    </Container>
  );
}

function V4Chip(props: { label: string; on: boolean; dot?: string; disabled?: boolean; onSelect: () => void }) {
  return <ChipButton {...props} size={10.5} offOpacity={ALPHA.dim} />;
}

function SecurityIncidentCentre({ onShowLog }: { onShowLog: (i: SecurityIncident) => void }) {
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

  return (
    <Container flexDirection="column" paddingTop={px(4)} flexShrink={0} width="100%">
      <Container flexDirection="row" gapColumn={px(6)} paddingBottom={px(8)}>
        <V4Chip label={`Current ${current.length}`} on={tab === "current"} disabled={!hasCurrent} onSelect={() => setTab("current")} />
        <V4Chip label={`Past ${past.length}`} on={tab === "past"} onSelect={() => setTab("past")} />
      </Container>
      {(tab === "current" ? current.length : past.length) > 1 && (
        <Container flexDirection="column" paddingTop={px(8)} borderTopWidth={1} borderColor={HAIRLINE}>
          <SectionLabel top={0}>Filter</SectionLabel>
          <Container flexDirection="row" flexWrap="wrap" alignItems="flex-start" gapColumn={px(6)} gapRow={px(6)}>
            {SEVERITY_ORDER_UI.map((sv) => (
              <V4Chip
                key={sv}
                label={`${sv} ${severityCounts[sv]}`}
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
      )}
      {rows.length === 0 ? (
        <VrText paddingY={px(12)} fontSize={px(11)} color={INK.text} opacity={ALPHA.faint}>
          {narrowed ? "No incidents match these filters." : tab === "current" ? "No active incidents." : "No past incidents yet."}
        </VrText>
      ) : (
        <>
          <SectionLabel>{`The day - ${formatDay(rows[0].eventTime)}`}</SectionLabel>
          <Container flexDirection="column" gapRow={px(6)}>
            {rows.map((i) => (
              <IncidentRow
                key={i.id}
                incident={i}
                expanded={i.id === selectedId}
                onSelect={() => setSelected(i.id === selectedId ? null : i.id)}
                onShowLog={() => onShowLog(i)}
              />
            ))}
          </Container>
        </>
      )}
    </Container>
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
    <Container flexDirection="column" paddingTop={px(4)} flexShrink={0} width="100%">
      <Container paddingBottom={px(8)}>
        <Label size={10} tracking={0.06} opacity={ALPHA.dim}>
          {`${open.length} active incidents`}
        </Label>
      </Container>
      <Container flexDirection="column" gapRow={px(6)}>
        {open.map((i) => (
          <IncidentRow
            key={i.id}
            incident={i}
            expanded={false}
            selected={i.id === activeId}
            compact
            onSelect={() => setSelected(i.id)}
            onShowLog={() => onShowLog(i)}
          />
        ))}
      </Container>
    </Container>
  );
}

function SecurityCommandView({ fields }: { fields: Row[] }) {
  const capabilities = fields.filter((f) => f.field.name.endsWith("_status"));
  const counters = fields.filter((f) => f.field.name.endsWith("_incidents"));
  return (
    <Container flexDirection="column" paddingTop={px(4)} flexShrink={0} width="100%">
      <SectionLabel top={0}>Capabilities</SectionLabel>
      <Grid columns={2} gapX={px(16)} gapY={px(7)}>
        {capabilities.map((r) => (
          <CapabilityLine key={r.field.name} {...r} />
        ))}
      </Grid>
      <SectionLabel>Open incidents</SectionLabel>
      <Grid columns={4} gapX={px(8)}>
        {counters.map((r) => (
          <CounterTile key={r.field.name} {...r} />
        ))}
      </Grid>
    </Container>
  );
}

function FieldsBlock({ still, fields }: { still?: string; fields: Row[] }): ReactNode {
  const beside = still ? fields.slice(0, FIELDS_BESIDE_STILL) : [];
  const below = still ? fields.slice(FIELDS_BESIDE_STILL) : fields;
  const gap = px(32);
  return (
    <Container flexDirection="column" marginTop={px(16)} flexShrink={0} width="100%">
      <Rule marginTop={0} />
      <Container flexDirection="column" paddingTop={px(4)}>
        {still && (
          <Container flexDirection="row" gapColumn={gap}>
            <Container flexBasis={0} flexGrow={1} alignItems="center">
              <Still src={still} width={px(250)} />
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

export function V4HotspotCard({ destId, index, hotspotId: namedId, onClose }: VrCardProps) {
  const site = useSite();
  const securityById = useSecurityStore((s) => s.hotspotById);
  const incidents = useSecurityStore((s) => s.incidents);
  const incidentFields = useSecurityStore((s) => s.incidentFields);
  const seedById = useSecurityStore((s) => s.seedHotspotById);
  const selectedIncidentId = useSecurityStore((s) => s.selectedIncidentId);
  const [logFor, setLogFor] = useState<SecurityIncident | null>(null);

  const isIncidentCentre = namedId === SECURITY_INCIDENT_ID;
  const layout = site.layoutById[destId];
  const hotspotId = namedId ?? layout?.hotspots[index - 1];
  const hotspot = hotspotId ? (site.hotspotById[hotspotId] ?? securityById[hotspotId]) : undefined;

  const fields = useMemo<Row[]>(() => {
    if (!hotspot) return [];
    if (hotspotId === SECURITY_COMMAND_ID) return commandViewFields(hotspot.fields, incidents);
    const mine =
      hotspotId && isFieldHotspot(hotspotId)
        ? incidents.filter((i) => i.sourceHotspotId === hotspotId && i.status !== "RESOLVED")
        : [];
    const live = mine.length > 0;
    const shown = (rows: HotspotField[]) => rows.filter((f) => live || !f.eventOnly);
    const chosen = mine.length > 1 ? (mine.find((i) => i.id === selectedIncidentId) ?? mine[0]) : undefined;
    const patch = chosen ? incidentFields[chosen.id] : undefined;
    if (!patch) return shown(hotspot.fields).map((f) => ({ field: f }));
    const seed = seedById[hotspot.id]?.fields ?? hotspot.fields;
    return shown(seed.filter((f) => f.name in patch || IDENTITY_FIELDS.has(f.name))).map((f) => ({
      field: f.name === "event_id" ? { ...f, value: chosen!.id } : f.name in patch ? { ...f, value: patch[f.name] } : f,
    }));
  }, [hotspot, hotspotId, incidents, incidentFields, selectedIncidentId, seedById]);

  if (!hotspot || !layout) return null;
  if (hotspot.poster) return <PosterCard poster={hotspot.poster} zoomable={false} onClose={onClose} />;

  if (logFor) {
    return (
      <CardShell width="26%" maxHeight="32%" padding={px(20)} onDismiss={() => setLogFor(null)}>
        <CardHeader title="Incident log" subtitle={logFor.id} onClose={() => setLogFor(null)} />
        <Container marginTop={px(12)} flexDirection="column" flexShrink={1} minHeight={0}>
          <Scroll>
            <IncidentLog incident={logFor} />
          </Scroll>
        </Container>
      </CardShell>
    );
  }

  const hideFields = hotspotId === SECURITY_INCIDENT_ID || hotspotId === SECURITY_COMMAND_ID;
  return (
    <CardShell
      width="34%"
      height={isIncidentCentre ? "36%" : undefined}
      maxHeight="36%"
      onDismiss={onClose}
    >
      <CardHeader title={hotspot.popupTitle} subtitle={layout.name} onClose={onClose} />
      <Container marginTop={px(12)} flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0}>
        <Scroll>
          {hotspot.alert && <AlertBanner alert={hotspot.alert} palette={TONE_V4} marginBottom={px(16)} />}
          {hotspot.journey && <Journey title={site.ui.popup.journeyTitle} steps={hotspot.journey} />}
          {hotspotId === SECURITY_COMMAND_ID && <SecurityCommandView fields={fields} />}
          {hotspotId === SECURITY_INCIDENT_ID && <SecurityIncidentCentre onShowLog={setLogFor} />}
          {hotspotId && isFieldHotspot(hotspotId) && <SourceIncidents hotspotId={hotspotId} onShowLog={setLogFor} />}
          {!hideFields && <FieldsBlock still={hotspot.image} fields={fields} />}
        </Scroll>
      </Container>
    </CardShell>
  );
}
