import type { Site } from "@/config";
import type { HotspotConfig, HotspotField } from "@/config/schema";
import { createSeededStore } from "@/shared/stores/create-store";

export interface SecurityIncident {
  id: string;
  sourceHotspotId: string;
  source: string;
  sourceId?: string;
  type: string;
  severity: IncidentSeverity;
  locationLabel: string;
  navigationTarget: string;
  eventTime: string;
  status: IncidentStatus;
  acknowledged: boolean;
  assignedTeam: string;
}

export type SecurityCategory =
  | "access"
  | "cargo"
  | "waterside"
  | "analytics"
  | "geofences"
  | "incidents";

export const SECURITY_CATEGORIES: { key: SecurityCategory; label: string }[] = [
  { key: "access", label: "Access" },
  { key: "cargo", label: "Cargo" },
  { key: "waterside", label: "Waterside" },
  { key: "analytics", label: "Analytics" },
  { key: "geofences", label: "Geofences" },
  { key: "incidents", label: "Incidents" },
];

export const DEMO_DAY = (() => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
})();

export const CATEGORY_BY_HOTSPOT: Record<string, SecurityCategory> = {
  S01: "access",
  S02: "cargo",
  S03: "waterside",
  S04: "analytics",
  S05: "geofences",
  S06: "analytics",
  S07: "incidents",
};

export interface SecurityEventDef {
  id: string;
  hotspotId: string;
  label: string;
  detail: string;
  incident: Omit<SecurityIncident, "id" | "status" | "acknowledged">;
  fields: Record<string, string | number | boolean>;
}

export interface SecurityEventGroup {
  hotspotId: string;
  title: string;
  variants: SecurityEventDef[];
}

export const SECURITY_EVENT_GROUPS: SecurityEventGroup[] = [
  {
    hotspotId: "S01",
    title: "Access Control",
    variants: [
      {
        id: "S01-1",
        hotspotId: "S01",
        label: "Credential denied",
        detail: "Driver credential rejected, gate locks",
        incident: {
          sourceHotspotId: "S01",
          source: "AI access control",
          sourceId: "TRK-48291",
          type: "Unauthorized access attempt",
          severity: "MEDIUM",
          locationLabel: "Landside / Truck Gate",
          navigationTarget: "L08",
          eventTime: `${DEMO_DAY} 14:38:02`,
          assignedTeam: "Security operations",
        },
        fields: {
          driver_credential: "Denied",
          vehicle_authorization: "Denied",
          gate_state: "Locked",
          security_status: "Held",
        },
      },
      {
        id: "S01-2",
        hotspotId: "S01",
        label: "No appointment on file",
        detail: "Truck arrives outside its booking window",
        incident: {
          sourceHotspotId: "S01",
          source: "AI access control",
          sourceId: "TRK-51134",
          type: "Appointment exception",
          severity: "LOW",
          locationLabel: "Landside / Truck Gate",
          navigationTarget: "L08",
          eventTime: `${DEMO_DAY} 15:04:36`,
          assignedTeam: "Terminal operations",
        },
        fields: {
          vehicle_id: "TRK-51134",
          appointment_status: "Not found",
          gate_state: "Hold",
          security_status: "Pending review",
        },
      },
      {
        id: "S01-4",
        hotspotId: "S01",
        label: "Expired credential",
        detail: "TWIC past its date, driver turned back",
        incident: {
          sourceHotspotId: "S01",
          source: "AI access control",
          sourceId: "TRK-49207",
          type: "Credential expired",
          severity: "LOW",
          locationLabel: "Landside / Truck Gate",
          navigationTarget: "L08",
          eventTime: `${DEMO_DAY} 13:52:18`,
          assignedTeam: "Terminal operations",
        },
        fields: {
          vehicle_id: "TRK-49207",
          driver_credential: "Expired",
          gate_state: "Hold",
          security_status: "Turned back",
        },
      },
      {
        id: "S01-3",
        hotspotId: "S01",
        label: "Tailgating at the gate",
        detail: "Second vehicle follows on one authorization",
        incident: {
          sourceHotspotId: "S01",
          source: "AI access control",
          sourceId: "TRK-48291",
          type: "Tailgating detected",
          severity: "HIGH",
          locationLabel: "Landside / Truck Gate",
          navigationTarget: "L08",
          eventTime: `${DEMO_DAY} 15:47:12`,
          assignedTeam: "Security operations",
        },
        fields: {
          vehicle_authorization: "Single vehicle only",
          gate_state: "Locked",
          security_status: "Alert",
        },
      },
    ],
  },
  {
    hotspotId: "S02",
    title: "Container Screening",
    variants: [
      {
        id: "S02-1",
        hotspotId: "S02",
        label: "Seal mismatch",
        detail: "Seal id does not match the manifest",
        incident: {
          sourceHotspotId: "S02",
          source: "Container screening",
          sourceId: "SL-DEMO-982741",
          type: "Seal tamper alert",
          severity: "HIGH",
          locationLabel: "Landside / Truck Gate",
          navigationTarget: "L08",
          eventTime: `${DEMO_DAY} 14:51:47`,
          assignedTeam: "Security operations",
        },
        fields: {
          seal_status: "Mismatch / tamper alert",
          inspection_status: "Security review required",
          security_exceptions: 1,
          risk_state: "Elevated",
        },
      },
      {
        id: "S02-2",
        hotspotId: "S02",
        label: "Weight discrepancy",
        detail: "Declared and measured mass disagree",
        incident: {
          sourceHotspotId: "S02",
          source: "Container screening",
          sourceId: "EGHU4829136",
          type: "Cargo discrepancy",
          severity: "MEDIUM",
          locationLabel: "Landside / Truck Gate",
          navigationTarget: "L08",
          eventTime: `${DEMO_DAY} 15:33:58`,
          assignedTeam: "Terminal operations",
        },
        fields: {
          inspection_status: "Re-weigh requested",
          security_exceptions: 1,
          risk_state: "Elevated",
        },
      },
      {
        id: "S02-4",
        hotspotId: "S02",
        label: "Manifest mismatch",
        detail: "Paperwork disagrees with the booking",
        incident: {
          sourceHotspotId: "S02",
          source: "Container screening",
          sourceId: "EGHU4829136",
          type: "Documentation exception",
          severity: "LOW",
          locationLabel: "Landside / Truck Gate",
          navigationTarget: "L08",
          eventTime: `${DEMO_DAY} 14:19:26`,
          assignedTeam: "Terminal operations",
        },
        fields: {
          inspection_status: "Documentation review",
          security_exceptions: 1,
        },
      },
      {
        id: "S02-3",
        hotspotId: "S02",
        label: "Seal missing",
        detail: "No seal present at the inspection point",
        incident: {
          sourceHotspotId: "S02",
          source: "Container screening",
          sourceId: "SL-DEMO-982741",
          type: "Seal missing",
          severity: "CRITICAL",
          locationLabel: "Landside / Truck Gate",
          navigationTarget: "L08",
          eventTime: `${DEMO_DAY} 16:02:41`,
          assignedTeam: "Security operations",
        },
        fields: {
          seal_status: "Not present",
          inspection_status: "Security review required",
          security_exceptions: 2,
          risk_state: "High",
        },
      },
    ],
  },
  {
    hotspotId: "S03",
    title: "Waterside Perimeter",
    variants: [
      {
        id: "S03-1",
        hotspotId: "S03",
        label: "Unclassified watercraft",
        detail: "Craft enters the demo waterside zone",
        incident: {
          sourceHotspotId: "S03",
          source: "Waterside monitoring",
          sourceId: "WS-DEMO-01",
          type: "Waterside zone entry",
          severity: "MEDIUM",
          locationLabel: "Berth / Quay",
          navigationTarget: "L02",
          eventTime: `${DEMO_DAY} 15:07:19`,
          assignedTeam: "Security operations",
        },
        fields: {
          zone_status: "Alert",
          detected_watercraft: 3,
          unclassified_contacts: 1,
          active_alerts: 1,
          event_severity: "MEDIUM",
        },
      },
      {
        id: "S03-2",
        hotspotId: "S03",
        label: "Craft loitering",
        detail: "Contact holds position at the zone edge",
        incident: {
          sourceHotspotId: "S03",
          source: "Waterside monitoring",
          sourceId: "WS-DEMO-01",
          type: "Loitering contact",
          severity: "LOW",
          locationLabel: "Berth / Quay",
          navigationTarget: "L02",
          eventTime: `${DEMO_DAY} 16:18:53`,
          assignedTeam: "Security operations",
        },
        fields: {
          zone_status: "Advisory",
          detected_watercraft: 3,
          unclassified_contacts: 1,
          active_alerts: 1,
          event_severity: "LOW",
        },
      },
      {
        id: "S03-4",
        hotspotId: "S03",
        label: "Craft at the berth face",
        detail: "Contact crosses to the quay itself",
        incident: {
          sourceHotspotId: "S03",
          source: "Waterside monitoring",
          sourceId: "WS-DEMO-01",
          type: "Berth approach",
          severity: "CRITICAL",
          locationLabel: "Berth / Quay",
          navigationTarget: "L02",
          eventTime: `${DEMO_DAY} 17:41:38`,
          assignedTeam: "Security operations",
        },
        fields: {
          zone_status: "Alert",
          detected_watercraft: 3,
          unclassified_contacts: 1,
          active_alerts: 1,
          event_severity: "CRITICAL",
        },
      },
      {
        id: "S03-3",
        hotspotId: "S03",
        label: "Multiple contacts",
        detail: "Two unclassified craft inside the zone",
        incident: {
          sourceHotspotId: "S03",
          source: "Waterside monitoring",
          sourceId: "WS-DEMO-01",
          type: "Multiple zone contacts",
          severity: "HIGH",
          locationLabel: "Berth / Quay",
          navigationTarget: "L02",
          eventTime: `${DEMO_DAY} 17:02:07`,
          assignedTeam: "Security operations",
        },
        fields: {
          zone_status: "Alert",
          detected_watercraft: 4,
          unclassified_contacts: 2,
          active_alerts: 2,
          event_severity: "HIGH",
        },
      },
    ],
  },
  {
    hotspotId: "S04",
    title: "Video Analytics",
    variants: [
      {
        id: "S04-1",
        hotspotId: "S04",
        label: "Person in restricted zone",
        detail: "The demo story's opening event",
        incident: {
          sourceHotspotId: "S04",
          source: "AI video analytics",
          sourceId: "CAM-DEMO-04",
          type: "Restricted-zone intrusion",
          severity: "HIGH",
          locationLabel: "Central Container Yard",
          navigationTarget: "L06",
          eventTime: `${DEMO_DAY} 14:42:18`,
          assignedTeam: "Security operations",
        },
        fields: {
          detected_class: "Person",
          confidence: 97,
          event_time: `${DEMO_DAY} 14:42:18`,
          severity: "HIGH",
          incident_status: "Active",
        },
      },
      {
        id: "S04-2",
        hotspotId: "S04",
        label: "Vehicle in pedestrian lane",
        detail: "Yard vehicle off its permitted route",
        incident: {
          sourceHotspotId: "S04",
          source: "AI video analytics",
          sourceId: "CAM-DEMO-04",
          type: "Lane violation",
          severity: "MEDIUM",
          locationLabel: "Central Container Yard",
          navigationTarget: "L06",
          eventTime: `${DEMO_DAY} 15:28:44`,
          assignedTeam: "Terminal operations",
        },
        fields: {
          detected_class: "Vehicle",
          confidence: 93,
          event_time: `${DEMO_DAY} 15:28:44`,
          severity: "MEDIUM",
          incident_status: "Active",
        },
      },
      {
        id: "S04-4",
        hotspotId: "S04",
        label: "Person on the quay edge",
        detail: "Pedestrian detected at the waterline",
        incident: {
          sourceHotspotId: "S04",
          source: "AI video analytics",
          sourceId: "CAM-DEMO-04",
          type: "Edge proximity",
          severity: "HIGH",
          locationLabel: "Central Container Yard",
          navigationTarget: "L06",
          eventTime: `${DEMO_DAY} 15:56:29`,
          assignedTeam: "Security operations",
        },
        fields: {
          detected_class: "Person",
          confidence: 95,
          event_time: `${DEMO_DAY} 15:56:29`,
          severity: "HIGH",
          incident_status: "Active",
        },
      },
      {
        id: "S04-5",
        hotspotId: "S04",
        label: "Crowd forming",
        detail: "Several people gathered mid-aisle",
        incident: {
          sourceHotspotId: "S04",
          source: "AI video analytics",
          sourceId: "CAM-DEMO-04",
          type: "Unexpected gathering",
          severity: "MEDIUM",
          locationLabel: "Central Container Yard",
          navigationTarget: "L06",
          eventTime: `${DEMO_DAY} 16:11:03`,
          assignedTeam: "Terminal operations",
        },
        fields: {
          detected_class: "Person group",
          confidence: 90,
          event_time: `${DEMO_DAY} 16:11:03`,
          severity: "MEDIUM",
          incident_status: "Active",
        },
      },
      {
        id: "S04-6",
        hotspotId: "S04",
        label: "View obstructed",
        detail: "Camera blocked, coverage degraded",
        incident: {
          sourceHotspotId: "S04",
          source: "AI video analytics",
          sourceId: "CAM-DEMO-04",
          type: "Sensor health",
          severity: "LOW",
          locationLabel: "Central Container Yard",
          navigationTarget: "L06",
          eventTime: `${DEMO_DAY} 17:09:47`,
          assignedTeam: "Technical support",
        },
        fields: {
          analytics_status: "Degraded",
          detected_class: "None",
          severity: "LOW",
          incident_status: "Active",
        },
      },
      {
        id: "S04-3",
        hotspotId: "S04",
        label: "Camera signal lost",
        detail: "Analytics offline on the demo camera",
        incident: {
          sourceHotspotId: "S04",
          source: "AI video analytics",
          sourceId: "CAM-DEMO-04",
          type: "Sensor health",
          severity: "LOW",
          locationLabel: "Central Container Yard",
          navigationTarget: "L06",
          eventTime: `${DEMO_DAY} 16:44:02`,
          assignedTeam: "Technical support",
        },
        fields: {
          analytics_status: "Signal lost",
          detected_class: "None",
          severity: "LOW",
          incident_status: "Active",
        },
      },
    ],
  },
  {
    hotspotId: "S05",
    title: "Restricted Zone",
    variants: [
      {
        id: "S05-1",
        hotspotId: "S05",
        label: "Unknown person inside",
        detail: "One unauthorized person in the crane zone",
        incident: {
          sourceHotspotId: "S05",
          source: "Restricted-area geofence",
          sourceId: "CRANE-DEMO-RZ-01",
          type: "Geofence violation",
          severity: "HIGH",
          locationLabel: "Ship-to-Shore Crane Zone",
          navigationTarget: "L03",
          eventTime: `${DEMO_DAY} 15:22:05`,
          assignedTeam: "Security operations",
        },
        fields: {
          persons_inside: 5,
          violations: 1,
          zone_status: "Alert",
        },
      },
      {
        id: "S05-2",
        hotspotId: "S05",
        label: "Zone occupied during lift",
        detail: "Personnel inside while the crane works",
        incident: {
          sourceHotspotId: "S05",
          source: "Restricted-area geofence",
          sourceId: "CRANE-DEMO-RZ-01",
          type: "Unsafe zone occupancy",
          severity: "CRITICAL",
          locationLabel: "Ship-to-Shore Crane Zone",
          navigationTarget: "L03",
          eventTime: `${DEMO_DAY} 16:09:31`,
          assignedTeam: "Security operations",
        },
        fields: {
          persons_inside: 6,
          violations: 2,
          access_state: "Lift in progress",
          zone_status: "Alert",
        },
      },
    ],
  },
  {
    hotspotId: "S06",
    title: "Unattended Object",
    variants: [
      {
        id: "S06-1",
        hotspotId: "S06",
        label: "Unattended object",
        detail: "Object left in the aisle, flagged for review",
        incident: {
          sourceHotspotId: "S06",
          source: "AI anomaly detection",
          sourceId: "CAM-DEMO-07",
          type: "Unattended object",
          severity: "MEDIUM",
          locationLabel: "Southern Container Yard",
          navigationTarget: "L07",
          eventTime: `${DEMO_DAY} 16:21:08`,
          assignedTeam: "Security operations",
        },
        fields: {
          event_type: "Unattended object",
          detection_time: `${DEMO_DAY} 16:21:08`,
          duration: "00:04:32",
          confidence: 91,
          classification: "Unclassified object",
          review_required: true,
          severity: "MEDIUM",
        },
      },
      {
        id: "S06-2",
        hotspotId: "S06",
        label: "Object still present",
        detail: "Same object, dwell time past the threshold",
        incident: {
          sourceHotspotId: "S06",
          source: "AI anomaly detection",
          sourceId: "CAM-DEMO-07",
          type: "Extended dwell",
          severity: "HIGH",
          locationLabel: "Southern Container Yard",
          navigationTarget: "L07",
          eventTime: `${DEMO_DAY} 16:38:20`,
          assignedTeam: "Security operations",
        },
        fields: {
          event_type: "Unattended object",
          detection_time: `${DEMO_DAY} 16:21:08`,
          duration: "00:21:44",
          confidence: 94,
          classification: "Unclassified object",
          review_required: true,
          severity: "HIGH",
        },
      },
      {
        id: "S06-4",
        hotspotId: "S06",
        label: "Object removed",
        detail: "Flagged object no longer in the aisle",
        incident: {
          sourceHotspotId: "S06",
          source: "AI anomaly detection",
          sourceId: "CAM-DEMO-07",
          type: "Scene change",
          severity: "LOW",
          locationLabel: "Southern Container Yard",
          navigationTarget: "L07",
          eventTime: `${DEMO_DAY} 17:48:55`,
          assignedTeam: "Security operations",
        },
        fields: {
          event_type: "Scene change",
          detection_time: `${DEMO_DAY} 17:48:55`,
          duration: "00:00:41",
          confidence: 86,
          classification: "Unclassified change",
          review_required: false,
          severity: "LOW",
        },
      },
      {
        id: "S06-3",
        hotspotId: "S06",
        label: "Unusual movement",
        detail: "Motion in an aisle with no scheduled work",
        incident: {
          sourceHotspotId: "S06",
          source: "AI anomaly detection",
          sourceId: "CAM-DEMO-07",
          type: "Anomalous movement",
          severity: "LOW",
          locationLabel: "Southern Container Yard",
          navigationTarget: "L07",
          eventTime: `${DEMO_DAY} 17:26:13`,
          assignedTeam: "Security operations",
        },
        fields: {
          event_type: "Anomalous movement",
          detection_time: `${DEMO_DAY} 17:26:13`,
          duration: "00:01:07",
          confidence: 88,
          classification: "Unclassified movement",
          review_required: true,
          severity: "LOW",
        },
      },
    ],
  },
];

export const SECURITY_SOURCES: { hotspotId: string; label: string }[] =
  SECURITY_EVENT_GROUPS.map((g) => ({ hotspotId: g.hotspotId, label: g.title }));

export const isFieldHotspot = (hotspotId: string): boolean =>
  SECURITY_EVENT_GROUPS.some((g) => g.hotspotId === hotspotId);

export const SECURITY_EVENTS: SecurityEventDef[] = SECURITY_EVENT_GROUPS.flatMap(
  (g) => g.variants,
);

export interface SecurityAuditEntry {
  seq: number;
  action: SecurityAuditAction;
  incidentId?: string;
  hotspotId?: string;
  detail: string;
  actor?: SecurityActor;
  severity?: IncidentSeverity;
  status?: IncidentStatus;
  at: string;
}

export interface SecurityActor {
  name: string;
  initials: string;
  tone: number;
}

export const SECURITY_ACTORS: Record<string, SecurityActor> = {
  rm: { name: "Ray Mitchell", initials: "RM", tone: 0 },
  jt: { name: "Janet Torres", initials: "JT", tone: 1 },
  ak: { name: "Alan Keller", initials: "AK", tone: 2 },
  dn: { name: "Dana Nelson", initials: "DN", tone: 3 },
  cb: { name: "Carl Brooks", initials: "CB", tone: 4 },
  lp: { name: "Lisa Parker", initials: "LP", tone: 5 },
};

export type SecurityAuditAction =
  | "event_triggered"
  | "incident_raised"
  | "incident_acknowledged"
  | "incident_escalated"
  | "incident_deescalated"
  | "incident_resolved"
  | "incident_note"
  | "demo_reset";

export type IncidentSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type IncidentStatus = "ACTIVE" | "INVESTIGATING" | "RESOLVED";

export interface SecurityState {
  mode: boolean;
  returnLayoutId: string | null;

  securityLayoutId: string | null;
  managementOpen: boolean;

  hotspots: HotspotConfig[];
  hotspotById: Record<string, HotspotConfig>;
  readonly seedHotspots: HotspotConfig[];
  readonly seedHotspotById: Record<string, HotspotConfig>;

  incidents: SecurityIncident[];
  selectedIncidentId: string | null;
  incidentFields: Record<string, Record<string, HotspotField["value"]>>;
  viewingIncidentId: string | null;

  categories: Record<SecurityCategory, boolean>;

  setMode: (
    value: boolean,
    returnLayoutId?: string | null,
    securityLayoutId?: string | null,
  ) => void;
  setManagementOpen: (value: boolean) => void;

  toggleCategory: (category: SecurityCategory) => void;
  isolateCategory: (category: SecurityCategory) => void;
  showAllCategories: () => void;

  setHotspotFields: (hotspotId: string, patch: Record<string, HotspotField["value"]>) => void;

  raiseIncident: (incident: SecurityIncident) => void;
  triggerEvent: (eventId: string) => void;
  firedEventIds: string[];

  audit: SecurityAuditEntry[];

  history: SecurityIncident[];
  acknowledgeIncident: (id: string) => void;
  escalateIncident: (id: string) => void;
  deescalateIncident: (id: string) => void;
  resolveIncident: (id: string) => void;
  setSelectedIncidentId: (id: string | null) => void;
  setViewingIncidentId: (id: string | null) => void;

  resetToSeed: () => void;
  reset: () => void;
}

const OPEN_INCIDENTS: SecurityIncident[] = [
  {
    id: "SEC-DEMO-0043",
    sourceHotspotId: "S03",
    source: "Waterside monitoring",
    sourceId: "WS-01",
    type: "Unauthorized watercraft in zone",
    severity: "HIGH",
    locationLabel: "Berth / Quay",
    navigationTarget: "L02",
    eventTime: `${DEMO_DAY} 15:07:19`,
    status: "ACTIVE",
    acknowledged: true,
    assignedTeam: "Security operations",
  },
  {
    id: "SEC-DEMO-0044",
    sourceHotspotId: "S06",
    source: "AI anomaly detection",
    sourceId: "CAM-07",
    type: "Unattended object",
    severity: "MEDIUM",
    locationLabel: "Southern Container Yard",
    navigationTarget: "L07",
    eventTime: `${DEMO_DAY} 16:21:08`,
    status: "ACTIVE",
    acknowledged: false,
    assignedTeam: "Security operations",
  },
];
const NO_FIRED: string[] = [];
interface PastIncidentSpec {
  id: string;
  sourceHotspotId: string;
  source: string;
  sourceId?: string;
  type: string;
  severity: IncidentSeverity;
  locationLabel: string;
  navigationTarget: string;
  eventTime: string;
  assignedTeam: string;
  trigger: string;
  owner: keyof typeof SECURITY_ACTORS;
  steps: PastStep[];
}

type PastStep = { at: string; by?: keyof typeof SECURITY_ACTORS } & (
  | { action: "acknowledged" }
  | { action: "escalated"; to: IncidentSeverity }
  | { action: "deescalated"; to: IncidentSeverity }
  | { action: "resolved" }
  | { action: "note"; detail: string }
);

const PAST_INCIDENTS: PastIncidentSpec[] = [
  {
    id: "SEC-DEMO-0035",
    owner: "ak",
    sourceHotspotId: "S02",
    source: "Container screening",
    sourceId: "SL-DEMO-804417",
    type: "Seal tamper alert",
    severity: "HIGH",
    locationLabel: "Landside / Truck Gate",
    navigationTarget: "L08",
    eventTime: `${DEMO_DAY} 11:03:02`,
    assignedTeam: "Security operations",
    trigger: "Seal id did not match the manifest",
    steps: [
      { action: "acknowledged", at: "11:03:48" },
      { action: "escalated", to: "CRITICAL", at: "11:07:15" },
      { action: "note", detail: "Container moved to the inspection bay", at: "11:12:40", by: "dn" },
      { action: "note", detail: "Seal replaced under supervision; contents verified", at: "11:44:22" },
      { action: "deescalated", to: "HIGH", at: "11:46:09" },
      { action: "resolved", at: "11:52:36" },
    ],
  },
  {
    id: "SEC-DEMO-0036",
    owner: "cb",
    sourceHotspotId: "S03",
    source: "Waterside monitoring",
    sourceId: "WS-DEMO-01",
    type: "Waterside zone entry",
    severity: "MEDIUM",
    locationLabel: "Berth / Quay",
    navigationTarget: "L02",
    eventTime: `${DEMO_DAY} 13:41:27`,
    assignedTeam: "Security operations",
    trigger: "Unclassified craft crossed into the monitored zone",
    steps: [
      { action: "acknowledged", at: "13:42:51" },
      { action: "note", detail: "Craft hailed; no response on the working channel", at: "13:49:30" },
      { action: "escalated", to: "HIGH", at: "13:54:08" },
      { action: "note", detail: "Craft altered course and left the zone", at: "14:06:17" },
      { action: "deescalated", to: "MEDIUM", at: "14:07:02" },
      { action: "resolved", at: "14:11:55" },
    ],
  },
  {
    id: "SEC-DEMO-0037",
    owner: "rm",
    sourceHotspotId: "S01",
    source: "AI access control",
    sourceId: "TRK-49207",
    type: "Credential expired",
    severity: "LOW",
    locationLabel: "Landside / Truck Gate",
    navigationTarget: "L08",
    eventTime: `${DEMO_DAY} 14:52:18`,
    assignedTeam: "Terminal operations",
    trigger: "Credential past its expiry date",
    steps: [
      { action: "acknowledged", at: "14:53:07" },
      { action: "note", detail: "Driver turned back at the gate", at: "14:58:44" },
      { action: "resolved", at: "15:00:21" },
    ],
  },
  {
    id: "SEC-DEMO-0038",
    owner: "lp",
    sourceHotspotId: "S05",
    source: "Restricted-area geofence",
    sourceId: "CRANE-DEMO-RZ-01",
    type: "Access override",
    severity: "MEDIUM",
    locationLabel: "Ship-to-Shore Crane Zone",
    navigationTarget: "L03",
    eventTime: `${DEMO_DAY} 15:33:49`,
    assignedTeam: "Security operations",
    trigger: "Zone opened outside the normal access rule",
    steps: [
      { action: "acknowledged", at: "15:34:26" },
      { action: "note", detail: "Override logged against a scheduled inspection", at: "15:41:12" },
      { action: "resolved", at: "15:58:30" },
    ],
  },
  {
    id: "SEC-DEMO-0039",
    owner: "jt",
    sourceHotspotId: "S04",
    source: "AI video analytics",
    sourceId: "CAM-DEMO-04",
    type: "Unexpected gathering",
    severity: "MEDIUM",
    locationLabel: "Central Container Yard",
    navigationTarget: "L06",
    eventTime: `${DEMO_DAY} 16:20:05`,
    assignedTeam: "Terminal operations",
    trigger: "Several people gathered mid-aisle",
    steps: [
      { action: "acknowledged", at: "16:21:33" },
      { action: "note", detail: "Shift handover taking place at the aisle head", at: "16:30:47" },
      { action: "resolved", at: "16:32:10" },
    ],
  },
  {
    id: "SEC-DEMO-0040",
    owner: "ak",
    sourceHotspotId: "S06",
    source: "AI anomaly detection",
    sourceId: "CAM-DEMO-07",
    type: "Extended dwell",
    severity: "MEDIUM",
    locationLabel: "Southern Container Yard",
    navigationTarget: "L07",
    eventTime: `${DEMO_DAY} 17:08:52`,
    assignedTeam: "Security operations",
    trigger: "Flagged object still in place after twenty minutes",
    steps: [
      { action: "acknowledged", at: "17:10:19" },
      { action: "escalated", to: "HIGH", at: "17:14:40" },
      { action: "note", detail: "Yard crew dispatched to clear the aisle", at: "17:19:58", by: "cb" },
      { action: "note", detail: "Object removed; aisle confirmed clear on camera", at: "17:38:26", by: "cb" },
      { action: "resolved", at: "17:41:03" },
    ],
  },
];

const NEWEST_AGO_MS = 15 * 60 * 1000;

const authoredMs = (value: string) => Date.parse(value.replace(" ", "T"));

export const DEMO_TIME_SHIFT_MS = (() => {
  let latest = -Infinity;
  for (const p of PAST_INCIDENTS) {
    latest = Math.max(latest, authoredMs(p.eventTime));
    for (const step of p.steps) latest = Math.max(latest, authoredMs(`${DEMO_DAY} ${step.at}`));
  }
  for (const i of OPEN_INCIDENTS) latest = Math.max(latest, authoredMs(i.eventTime));
  return Number.isFinite(latest) ? Date.now() - NEWEST_AGO_MS - latest : 0;
})();

export const HISTORICAL_INCIDENTS: SecurityIncident[] = PAST_INCIDENTS.map((p) => {
  let severity = p.severity;
  for (const step of p.steps) {
    if (step.action === "escalated" || step.action === "deescalated") severity = step.to;
  }
  return {
    id: p.id,
    sourceHotspotId: p.sourceHotspotId,
    source: p.source,
    sourceId: p.sourceId,
    type: p.type,
    severity,
    locationLabel: p.locationLabel,
    navigationTarget: p.navigationTarget,
    eventTime: p.eventTime,
    status: "RESOLVED" as const,
    acknowledged: true,
    assignedTeam: p.assignedTeam,
  };
}).reverse();

const SEEDED_AUDIT: SecurityAuditEntry[] = (() => {
  const out: Omit<SecurityAuditEntry, "seq">[] = [];
  const iso = (hms: string) => `${DEMO_DAY} ${hms}`;

  for (const p of PAST_INCIDENTS) {
    const raisedAt = p.eventTime.slice(11);
    out.push({
      action: "event_triggered",
      hotspotId: p.sourceHotspotId,
      incidentId: p.id,
      detail: p.trigger,
      at: iso(raisedAt),
    });
    out.push({
      action: "incident_raised",
      hotspotId: p.sourceHotspotId,
      incidentId: p.id,
      detail: `Incident raised by ${p.source}`,
      severity: p.severity,
      status: "ACTIVE",
      at: iso(raisedAt),
    });

    for (const step of p.steps) {
      const actor = SECURITY_ACTORS[step.by ?? p.owner];
      if (step.action === "acknowledged") {
        out.push({
          action: "incident_acknowledged",
          incidentId: p.id,
          detail: "Incident acknowledged",
          status: "INVESTIGATING",
          actor,
          at: iso(step.at),
        });
      } else if (step.action === "escalated") {
        out.push({
          action: "incident_escalated",
          incidentId: p.id,
          detail: `Escalated to ${step.to}`,
          severity: step.to,
          status: "INVESTIGATING",
          actor,
          at: iso(step.at),
        });
      } else if (step.action === "deescalated") {
        out.push({
          action: "incident_deescalated",
          incidentId: p.id,
          detail: `De-escalated to ${step.to}`,
          severity: step.to,
          status: "INVESTIGATING",
          actor,
          at: iso(step.at),
        });
      } else if (step.action === "resolved") {
        out.push({
          action: "incident_resolved",
          incidentId: p.id,
          detail: "Incident resolved",
          status: "RESOLVED",
          actor,
          at: iso(step.at),
        });
      } else {
        out.push({
          action: "incident_note",
          incidentId: p.id,
          detail: step.detail,
          actor,
          at: iso(step.at),
        });
      }
    }
  }

  return out
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((e, i) => ({ ...e, seq: i + 1 }));
})();

const INCIDENT_ID_START = 41;

const incidentIdFor = (n: number) => `SEC-DEMO-${String(n).padStart(4, "0")}`;

function appendAudit(
  log: SecurityAuditEntry[],
  entry: Omit<SecurityAuditEntry, "seq" | "at">,
): SecurityAuditEntry[] {
  return [
    ...log,
    { ...entry, seq: (log[log.length - 1]?.seq ?? 0) + 1, at: new Date().toISOString() },
  ];
}

const ALL_CATEGORIES: Record<SecurityCategory, boolean> = {
  access: true,
  cargo: true,
  waterside: true,
  analytics: true,
  geofences: true,
  incidents: true,
};

const LIVE_ACTOR = SECURITY_ACTORS.rm;

const SEVERITY_ORDER: IncidentSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const byId = (rows: HotspotConfig[]): Record<string, HotspotConfig> =>
  Object.fromEntries(rows.map((h) => [h.id, h]));

function patchIncident(
  list: SecurityIncident[],
  id: string,
  patch: (incident: SecurityIncident) => SecurityIncident,
): SecurityIncident[] {
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return list;
  const next = patch(list[i]);
  if (next === list[i]) return list;
  const out = list.slice();
  out[i] = next;
  return out;
}

export const useSecurityStore = createSeededStore<SecurityState, Site>(
  "security-store",
  (site) => {
    const seedHotspots: HotspotConfig[] = (site.securityHotspots ?? []).map((h) => ({
      ...h,
      fields: h.fields.map((f: HotspotField) => ({ ...f })),
    }));

    return (set, get) => ({
      mode: false,
      returnLayoutId: null,
      securityLayoutId: null,
      managementOpen: false,

      hotspots: seedHotspots,
      hotspotById: byId(seedHotspots),
      seedHotspots,
      seedHotspotById: byId(seedHotspots),

      incidents: OPEN_INCIDENTS,
      selectedIncidentId: null,
      incidentFields: {},
      viewingIncidentId: null,
      categories: ALL_CATEGORIES,
      firedEventIds: NO_FIRED,
      audit: SEEDED_AUDIT,
      history: HISTORICAL_INCIDENTS,

      setMode: (value, returnLayoutId = null, securityLayoutId = null) =>
        set({
          mode: value,
          returnLayoutId: value ? returnLayoutId : null,
          securityLayoutId: value ? securityLayoutId : null,
          managementOpen: value ? !securityLayoutId : false,
        }),

      setManagementOpen: (value) => set({ managementOpen: value }),

      setHotspotFields: (hotspotId, patch) => {
        const rows = get().hotspots;
        const i = rows.findIndex((h) => h.id === hotspotId);
        if (i < 0) return;
        const names = Object.keys(patch);
        if (!names.length) return;

        const row = rows[i];
        let touched = false;
        const fields = row.fields.map((f) => {
          if (!(f.name in patch) || patch[f.name] === f.value) return f;
          touched = true;
          return { ...f, value: patch[f.name] };
        });
        if (!touched) return;

        const next = rows.slice();
        next[i] = { ...row, fields };
        set({ hotspots: next, hotspotById: byId(next) });
      },

      raiseIncident: (incident) => {
        const list = get().incidents;
        if (list.some((x) => x.id === incident.id)) return;
        set({ incidents: [incident, ...list] });
      },

      triggerEvent: (eventId) => {
        const def = SECURITY_EVENTS.find((e) => e.id === eventId);
        if (!def) return;
        const state = get();
        if (state.firedEventIds.includes(eventId)) return;
        const { hotspotId } = def;

        const id = incidentIdFor(INCIDENT_ID_START + state.incidents.length);

        state.setHotspotFields(hotspotId, def.fields);
        set({ incidentFields: { ...get().incidentFields, [id]: def.fields } });
        state.raiseIncident({ ...def.incident, id, status: "ACTIVE", acknowledged: false });

        let audit = appendAudit(get().audit, {
          action: "event_triggered",
          hotspotId,
          incidentId: id,
          detail: `${def.label} at ${def.incident.locationLabel}`,
        });
        audit = appendAudit(audit, {
          action: "incident_raised",
          incidentId: id,
          hotspotId,
          detail: `Incident raised by ${def.incident.source}`,
          severity: def.incident.severity,
          status: "ACTIVE",
        });
        set({ firedEventIds: [...get().firedEventIds, eventId], audit });
      },

      acknowledgeIncident: (id) =>
        set((s) => {
          const incidents = patchIncident(s.incidents, id, (x) =>
            x.acknowledged || x.status === "RESOLVED"
              ? x
              : { ...x, acknowledged: true, status: "INVESTIGATING" },
          );
          if (incidents === s.incidents) return {};
          return {
            incidents,
            audit: appendAudit(s.audit, {
              action: "incident_acknowledged",
              incidentId: id,
              detail: "Incident acknowledged",
              status: "INVESTIGATING",
              actor: LIVE_ACTOR,
            }),
          };
        }),

      escalateIncident: (id) =>
        set((s) => {
          const incidents = patchIncident(s.incidents, id, (x) => {
            const next = SEVERITY_ORDER[SEVERITY_ORDER.indexOf(x.severity) + 1];
            return !next || x.status === "RESOLVED" ? x : { ...x, severity: next };
          });
          if (incidents === s.incidents) return {};
          const now = incidents.find((x) => x.id === id);
          return {
            incidents,
            audit: appendAudit(s.audit, {
              action: "incident_escalated",
              incidentId: id,
              detail: `Escalated to ${now?.severity ?? ""}`.trimEnd(),
              actor: LIVE_ACTOR,
              severity: now?.severity,
              status: now?.status,
            }),
          };
        }),

      deescalateIncident: (id) =>
        set((s) => {
          const incidents = patchIncident(s.incidents, id, (x) => {
            const next = SEVERITY_ORDER[SEVERITY_ORDER.indexOf(x.severity) - 1];
            return !next || x.status === "RESOLVED" ? x : { ...x, severity: next };
          });
          if (incidents === s.incidents) return {};
          const now = incidents.find((x) => x.id === id);
          return {
            incidents,
            audit: appendAudit(s.audit, {
              action: "incident_deescalated",
              incidentId: id,
              detail: `De-escalated to ${now?.severity ?? ""}`.trimEnd(),
              actor: LIVE_ACTOR,
              severity: now?.severity,
              status: now?.status,
            }),
          };
        }),

      resolveIncident: (id) =>
        set((s) => {
          const incidents = patchIncident(s.incidents, id, (x) =>
            x.status === "RESOLVED" ? x : { ...x, status: "RESOLVED" },
          );
          if (incidents === s.incidents) return {};
          const closed = incidents.find((x) => x.id === id);
          return {
            incidents,
            history: closed ? [closed, ...s.history] : s.history,
            audit: appendAudit(s.audit, {
              action: "incident_resolved",
              incidentId: id,
              detail: "Incident resolved",
              status: "RESOLVED",
              actor: LIVE_ACTOR,
            }),
          };
        }),

      toggleCategory: (category) => {
        const now = get().categories;
        set({ categories: { ...now, [category]: !now[category] } });
      },

      isolateCategory: (category) => {
        const now = get().categories;
        const alone =
          now[category] && SECURITY_CATEGORIES.every((c) => c.key === category || !now[c.key]);
        if (alone) {
          set({ categories: ALL_CATEGORIES });
          return;
        }
        set({
          categories: Object.fromEntries(
            SECURITY_CATEGORIES.map((c) => [c.key, c.key === category]),
          ) as Record<SecurityCategory, boolean>,
        });
      },

      showAllCategories: () => set({ categories: ALL_CATEGORIES }),

      setSelectedIncidentId: (id) => set({ selectedIncidentId: id }),

      setViewingIncidentId: (id) => set({ viewingIncidentId: id }),

      resetToSeed: () =>
        set((s) => ({
          hotspots: seedHotspots,
          hotspotById: byId(seedHotspots),
          incidents: OPEN_INCIDENTS,
          selectedIncidentId: null,
          incidentFields: {},
          viewingIncidentId: null,
          categories: ALL_CATEGORIES,
          firedEventIds: NO_FIRED,
          audit: appendAudit(s.audit, {
            action: "demo_reset",
            detail: "Demo reset to opening state",
          }),
        })),

      reset: () =>
        set({
          mode: false,
          returnLayoutId: null,
          securityLayoutId: null,
          managementOpen: false,
          hotspots: seedHotspots,
          hotspotById: byId(seedHotspots),
          incidents: OPEN_INCIDENTS,
          selectedIncidentId: null,
          incidentFields: {},
          viewingIncidentId: null,
          categories: ALL_CATEGORIES,
          firedEventIds: NO_FIRED,
          audit: SEEDED_AUDIT,
          history: HISTORICAL_INCIDENTS,
        }),
    });
  },
);

export function incidentCounts(incidents: SecurityIncident[]) {
  const open = incidents.filter((x) => x.status !== "RESOLVED");
  return {
    active: open.length,
    low: open.filter((x) => x.severity === "LOW").length,
    medium: open.filter((x) => x.severity === "MEDIUM").length,
    high: open.filter((x) => x.severity === "HIGH").length,
    critical: open.filter((x) => x.severity === "CRITICAL").length,
    resolved: incidents.length - open.length,
  };
}
