import type { Site } from "@/config";
import type { HotspotConfig, HotspotField } from "@/config/schema";
import { createSeededStore } from "@/shared/stores/create-store";

export interface SecurityIncident {
  /** `SEC-DEMO-nnnn`. */
  id: string;
  /** Which hotspot raised it (S01-S06). */
  sourceHotspotId: string;
  /** How it was detected, e.g. "AI VIDEO ANALYTICS". */
  source: string;
  /** The demo device that reported it, e.g. `CAM-DEMO-04`. */
  sourceId?: string;
  type: string;
  severity: IncidentSeverity;
  /** The demo zone label, e.g. `YARD-DEMO-RZ-02`. */
  locationLabel: string;
  /** Where VIEW LOCATION travels to: the incident's parent layout. */
  navigationTarget: string;
  /** A fixed string, not `Date.now()`: a demo that reads a different time on
   *  every load cannot be rehearsed against a script. */
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

/** Display order and labels, as the spec names them. */
export const SECURITY_CATEGORIES: { key: SecurityCategory; label: string }[] = [
  { key: "access", label: "Access" },
  { key: "cargo", label: "Cargo" },
  { key: "waterside", label: "Waterside" },
  { key: "analytics", label: "Analytics" },
  { key: "geofences", label: "Geofences" },
  { key: "incidents", label: "Incidents" },
];

export const CATEGORY_BY_HOTSPOT: Record<string, SecurityCategory> = {
  S01: "access",     // AI Access Control
  S02: "cargo",      // Container Security Screening
  S03: "waterside",  // Waterside Perimeter Monitoring
  S04: "analytics",  // AI Video Analytics
  S05: "geofences",  // Restricted Area / Geofence
  S06: "analytics",  // AI Anomaly / Unattended Object
  S07: "incidents",  // Security Incident Management
};

export interface SecurityEventDef {
  /** Stable key, `<hotspotId>-<n>`, so a fired variant can be marked spent. */
  id: string;
  /** The hotspot that raises it (S01-S06). */
  hotspotId: string;
  /** What the button says. */
  label: string;
  /** One line on what firing it does, for the button's second row. */
  detail: string;
  /** The incident forwarded to S07, minus the parts decided at trigger time:
   *  its id is allocated from the running sequence when fired. */
  incident: Omit<SecurityIncident, "id" | "status" | "acknowledged">;
  /** The source hotspot's readings during the event, by field name. */
  fields: Record<string, string | number | boolean>;
}

/** The variants one hotspot can raise, for the trigger menu's grouping. */
export interface SecurityEventGroup {
  hotspotId: string;
  /** The hotspot's own name, e.g. "AI Access Control". */
  title: string;
  variants: SecurityEventDef[];
}

export const SECURITY_EVENT_GROUPS: SecurityEventGroup[] = [
  {
    hotspotId: "S01",
    title: "AI Access Control",
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
          eventTime: "2026-09-15 14:38:02",
          assignedTeam: "Security operations",
        },
        // "changes credential/authorization to DENIED, gate_state to LOCKED"
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
          eventTime: "2026-09-15 15:04:36",
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
          eventTime: "2026-09-15 13:52:18",
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
          eventTime: "2026-09-15 15:47:12",
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
    title: "Container Security Screening",
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
          eventTime: "2026-09-15 14:51:47",
          assignedTeam: "Security operations",
        },
        // "changes seal_status to MISMATCH/TAMPER ALERT and inspection_status
        //  to SECURITY REVIEW REQUIRED"
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
          eventTime: "2026-09-15 15:33:58",
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
          eventTime: "2026-09-15 14:19:26",
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
          eventTime: "2026-09-15 16:02:41",
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
    title: "Waterside Perimeter Monitoring",
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
          eventTime: "2026-09-15 15:07:19",
          assignedTeam: "Security operations",
        },
        // "a simulated craft enters the demo zone"
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
          eventTime: "2026-09-15 16:18:53",
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
          eventTime: "2026-09-15 17:41:38",
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
          eventTime: "2026-09-15 17:02:07",
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
    title: "AI Video Analytics",
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
          eventTime: "2026-09-15 14:42:18",
          assignedTeam: "Security operations",
        },
        // The §4 table's own mid-demo values, put back where they belong.
        fields: {
          detected_class: "Person",
          confidence: 97,
          event_time: "2026-09-15 14:42:18",
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
          eventTime: "2026-09-15 15:28:44",
          assignedTeam: "Terminal operations",
        },
        fields: {
          detected_class: "Vehicle",
          confidence: 93,
          event_time: "2026-09-15 15:28:44",
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
          eventTime: "2026-09-15 15:56:29",
          assignedTeam: "Security operations",
        },
        fields: {
          detected_class: "Person",
          confidence: 95,
          event_time: "2026-09-15 15:56:29",
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
          eventTime: "2026-09-15 16:11:03",
          assignedTeam: "Terminal operations",
        },
        fields: {
          detected_class: "Person group",
          confidence: 90,
          event_time: "2026-09-15 16:11:03",
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
          eventTime: "2026-09-15 17:09:47",
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
          eventTime: "2026-09-15 16:44:02",
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
    title: "Restricted Area / Geofence",
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
          eventTime: "2026-09-15 15:22:05",
          assignedTeam: "Security operations",
        },
        // "adds one UNKNOWN demo person and changes violations to 1 / status
        //  to ALERT"
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
          eventTime: "2026-09-15 16:09:31",
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
    title: "AI Anomaly / Unattended Object",
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
          eventTime: "2026-09-15 16:21:08",
          assignedTeam: "Security operations",
        },
        // The §4 table's own values. Classification stays UNCLASSIFIED OBJECT:
        // the spec forbids labelling it a weapon or explosive.
        fields: {
          event_type: "Unattended object",
          detection_time: "2026-09-15 16:21:08",
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
          eventTime: "2026-09-15 16:38:20",
          assignedTeam: "Security operations",
        },
        fields: {
          event_type: "Unattended object",
          detection_time: "2026-09-15 16:21:08",
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
          eventTime: "2026-09-15 17:48:55",
          assignedTeam: "Security operations",
        },
        fields: {
          event_type: "Scene change",
          detection_time: "2026-09-15 17:48:55",
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
          eventTime: "2026-09-15 17:26:13",
          assignedTeam: "Security operations",
        },
        fields: {
          event_type: "Anomalous movement",
          detection_time: "2026-09-15 17:26:13",
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

/** Every variant, flattened, for lookup by id. */
export const SECURITY_EVENTS: SecurityEventDef[] = SECURITY_EVENT_GROUPS.flatMap(
  (g) => g.variants,
);

export interface SecurityAuditEntry {
  /** Monotonic within a session, so entries sort stably even at equal times. */
  seq: number;
  /** What happened. */
  action: SecurityAuditAction;
  /** The incident it concerns, when there is one. */
  incidentId?: string;
  /** The hotspot involved, when there is one. */
  hotspotId?: string;
  /** What happened, without restating the incident it belongs to: a log read
   *  under one incident does not need its id on every line. */
  detail: string;
  /** Who did it. Every line in a real log has an operator against it. */
  actor?: SecurityActor;
  /** Severity at the moment of the entry, for raise/escalate. */
  severity?: IncidentSeverity;
  /** Status after the action, for the lifecycle entries. */
  status?: IncidentStatus;
  at: string;
}

export interface SecurityActor {
  name: string;
  initials: string;
  /** 0-5, indexing the avatar palette in the card. */
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
  /** An observation rather than a state change: why the next step was taken.
   *  Most of what a real log is made of. */
  | "incident_note"
  | "demo_reset";

/** §6's state contract, as the severities the counters group by. */
export type IncidentSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type IncidentStatus = "ACTIVE" | "INVESTIGATING" | "RESOLVED";

export interface SecurityState {
  mode: boolean;
  returnLayoutId: string | null;

  securityLayoutId: string | null;
  managementOpen: boolean;

  hotspots: HotspotConfig[];
  /** The same rows by id, rebuilt on every write so the two never disagree. */
  hotspotById: Record<string, HotspotConfig>;
  /** The untouched seed, so a demo can be put back to its opening position
   *  without a reload. See `resetToSeed`. */
  readonly seedHotspots: HotspotConfig[];
  readonly seedHotspotById: Record<string, HotspotConfig>;

  incidents: SecurityIncident[];
  /** Which incident the S07 card has expanded, or null for the list. */
  selectedIncidentId: string | null;
  incidentFields: Record<string, Record<string, HotspotField["value"]>>;
  viewingIncidentId: string | null;

  categories: Record<SecurityCategory, boolean>;

  /** Latch the mode and the layout to come back to (null = came from the
   *  overview, so leaving stands still). */
  setMode: (
    value: boolean,
    returnLayoutId?: string | null,
    /** The layout whose security anchors the mode opens on. Omitted or null →
     *  the mode opens straight at management. */
    securityLayoutId?: string | null,
  ) => void;
  setManagementOpen: (value: boolean) => void;

  /** Flip one layer. */
  toggleCategory: (category: SecurityCategory) => void;
  isolateCategory: (category: SecurityCategory) => void;
  /** Every layer back on. */
  showAllCategories: () => void;

  /** Overwrite some of one hotspot's readings, matched by field `name`. A field
   *  the patch does not mention keeps its seeded value. */
  setHotspotFields: (hotspotId: string, patch: Record<string, HotspotField["value"]>) => void;

  /** Raise one. Ignored if its id is already queued, so a demo trigger pressed
   *  twice does not stack duplicates. */
  raiseIncident: (incident: SecurityIncident) => void;
  triggerEvent: (eventId: string) => void;
  firedEventIds: string[];

  audit: SecurityAuditEntry[];

  history: SecurityIncident[];
  /** ACTIVE → INVESTIGATING, and flag it acknowledged (§5 step 6). */
  acknowledgeIncident: (id: string) => void;
  /** Bump severity one step, the spec's ESCALATE action. CRITICAL is the cap. */
  escalateIncident: (id: string) => void;
  deescalateIncident: (id: string) => void;
  /** → RESOLVED (§5 step 7). Kept in the list, per §6's audit-history note. */
  resolveIncident: (id: string) => void;
  setSelectedIncidentId: (id: string | null) => void;
  /** Latch the incident whose location is being visited, or null on return. */
  setViewingIncidentId: (id: string | null) => void;

  /** Back to the opening position: seeded readings, no incidents, mode
   *  untouched. What a presenter needs between run-throughs. */
  resetToSeed: () => void;
  /** Leave the layer entirely: mode off, nothing remembered, queue empty. */
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
    eventTime: "2026-09-15 15:07:19",
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
    eventTime: "2026-09-15 16:21:08",
    status: "ACTIVE",
    acknowledged: false,
    assignedTeam: "Security operations",
  },
];
/** Shared identity, so a reset never hands out a fresh array. */
const NO_FIRED: string[] = [];
interface PastIncidentSpec {
  id: string;
  sourceHotspotId: string;
  source: string;
  sourceId?: string;
  type: string;
  /** Severity as first reported. Escalations move it from here. */
  severity: IncidentSeverity;
  locationLabel: string;
  navigationTarget: string;
  /** The synthetic time the event itself carries, `YYYY-MM-DD HH:MM:SS`. */
  eventTime: string;
  assignedTeam: string;
  /** What the operator saw first, before the incident was formally raised. */
  trigger: string;
  /** Who owned it. Used for every step that does not name someone else, so an
   *  incident reads as one person's work rather than a rota. */
  owner: keyof typeof SECURITY_ACTORS;
  /** The lifecycle, in order. Each step's `at` is `HH:MM:SS` on the same day. */
  steps: PastStep[];
}

type PastStep = { at: string; by?: keyof typeof SECURITY_ACTORS } & (
  | { action: "acknowledged" }
  | { action: "escalated"; to: IncidentSeverity }
  | { action: "deescalated"; to: IncidentSeverity }
  | { action: "resolved" }
  | { action: "note"; detail: string }
);

/** The demo's "today". Every past time is on this date. */
const DEMO_DAY = "2026-09-15";

const PAST_INCIDENTS: PastIncidentSpec[] = [
  {
    id: "SEC-DEMO-0026",
    owner: "dn",
    sourceHotspotId: "S04",
    source: "AI video analytics",
    sourceId: "CAM-DEMO-02",
    type: "Sensor health",
    severity: "LOW",
    locationLabel: "Northern Container Yard",
    navigationTarget: "L05",
    eventTime: `${DEMO_DAY} 05:12:39`,
    assignedTeam: "Technical support",
    trigger: "Camera stream dropped in the northern yard",
    steps: [
      { action: "acknowledged", at: "05:14:02" },
      { action: "note", detail: "Stream restored after scheduled restart", at: "05:21:48" },
      { action: "resolved", at: "05:22:15" },
    ],
  },
  {
    id: "SEC-DEMO-0027",
    owner: "rm",
    sourceHotspotId: "S01",
    source: "AI access control",
    sourceId: "TRK-40218",
    type: "Appointment exception",
    severity: "LOW",
    locationLabel: "Landside / Truck Gate",
    navigationTarget: "L08",
    eventTime: `${DEMO_DAY} 06:03:11`,
    assignedTeam: "Terminal operations",
    trigger: "Truck arrived ahead of its booking window",
    steps: [
      { action: "acknowledged", at: "06:04:20" },
      { action: "note", detail: "Held in queue until window opened", at: "06:09:37" },
      { action: "resolved", at: "06:31:02" },
    ],
  },
  {
    id: "SEC-DEMO-0028",
    owner: "jt",
    sourceHotspotId: "S02",
    source: "Container screening",
    sourceId: "SL-DEMO-771208",
    type: "Documentation exception",
    severity: "LOW",
    locationLabel: "Landside / Truck Gate",
    navigationTarget: "L08",
    eventTime: `${DEMO_DAY} 06:48:55`,
    assignedTeam: "Terminal operations",
    trigger: "Manifest did not match the booking reference",
    steps: [
      { action: "acknowledged", at: "06:50:14" },
      { action: "note", detail: "Corrected booking reference supplied by carrier", at: "07:02:41" },
      { action: "resolved", at: "07:03:19" },
    ],
  },
  {
    id: "SEC-DEMO-0029",
    owner: "ak",
    sourceHotspotId: "S03",
    source: "Waterside monitoring",
    sourceId: "WS-DEMO-01",
    type: "Loitering contact",
    severity: "LOW",
    locationLabel: "Berth / Quay",
    navigationTarget: "L02",
    eventTime: `${DEMO_DAY} 07:26:08`,
    assignedTeam: "Security operations",
    trigger: "Small craft holding position at the zone edge",
    steps: [
      { action: "acknowledged", at: "07:27:55" },
      { action: "escalated", to: "MEDIUM", at: "07:41:12" },
      { action: "note", detail: "Contact identified as a permitted survey vessel", at: "08:02:30" },
      { action: "deescalated", to: "LOW", at: "08:03:06" },
      { action: "resolved", at: "08:05:44" },
    ],
  },
  {
    id: "SEC-DEMO-0030",
    owner: "cb",
    sourceHotspotId: "S05",
    source: "Restricted-area geofence",
    sourceId: "CRANE-DEMO-RZ-01",
    type: "Geofence violation",
    severity: "HIGH",
    locationLabel: "Ship-to-Shore Crane Zone",
    navigationTarget: "L03",
    eventTime: `${DEMO_DAY} 08:19:27`,
    assignedTeam: "Security operations",
    trigger: "Unbadged person inside the crane operating area",
    steps: [
      { action: "acknowledged", at: "08:19:58" },
      { action: "note", detail: "Lift paused while the area was cleared", at: "08:21:33" },
      { action: "note", detail: "Person escorted out; contractor badge issued", at: "08:34:19", by: "jt" },
      { action: "resolved", at: "08:40:02" },
    ],
  },
  {
    id: "SEC-DEMO-0031",
    owner: "lp",
    sourceHotspotId: "S06",
    source: "AI anomaly detection",
    sourceId: "CAM-DEMO-07",
    type: "Unattended object",
    severity: "MEDIUM",
    locationLabel: "Southern Container Yard",
    navigationTarget: "L07",
    eventTime: `${DEMO_DAY} 09:02:44`,
    assignedTeam: "Security operations",
    trigger: "Object left in the aisle for over four minutes",
    steps: [
      { action: "acknowledged", at: "09:05:10" },
      { action: "note", detail: "Reviewed on camera: empty lashing-rod bin", at: "09:18:26" },
      { action: "deescalated", to: "LOW", at: "09:19:03" },
      { action: "note", detail: "Bin returned to its rack by yard crew", at: "09:33:57", by: "cb" },
      { action: "resolved", at: "09:35:12" },
    ],
  },
  {
    id: "SEC-DEMO-0032",
    owner: "rm",
    sourceHotspotId: "S01",
    source: "AI access control",
    sourceId: "TRK-44815",
    type: "Unauthorized access attempt",
    severity: "MEDIUM",
    locationLabel: "Landside / Truck Gate",
    navigationTarget: "L08",
    eventTime: `${DEMO_DAY} 09:12:44`,
    assignedTeam: "Security operations",
    trigger: "Credential rejected at the inbound lane",
    steps: [
      { action: "acknowledged", at: "09:14:10" },
      { action: "note", detail: "Driver re-presented a valid credential", at: "09:24:02" },
      { action: "resolved", at: "09:26:31" },
    ],
  },
  {
    id: "SEC-DEMO-0033",
    owner: "jt",
    sourceHotspotId: "S04",
    source: "AI video analytics",
    sourceId: "CAM-DEMO-04",
    type: "Lane violation",
    severity: "MEDIUM",
    locationLabel: "Central Container Yard",
    navigationTarget: "L06",
    eventTime: `${DEMO_DAY} 10:41:16`,
    assignedTeam: "Terminal operations",
    trigger: "Yard vehicle crossed into the pedestrian lane",
    steps: [
      { action: "acknowledged", at: "10:42:39" },
      { action: "note", detail: "Driver advised over radio; route corrected", at: "10:49:51" },
      { action: "resolved", at: "10:52:08" },
    ],
  },
  {
    id: "SEC-DEMO-0034",
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
    id: "SEC-DEMO-0035",
    owner: "dn",
    sourceHotspotId: "S06",
    source: "AI anomaly detection",
    sourceId: "CAM-DEMO-07",
    type: "Anomalous movement",
    severity: "LOW",
    locationLabel: "Southern Container Yard",
    navigationTarget: "L07",
    eventTime: `${DEMO_DAY} 12:15:30`,
    assignedTeam: "Security operations",
    trigger: "Movement in an aisle with no scheduled work",
    steps: [
      { action: "acknowledged", at: "12:16:44" },
      { action: "note", detail: "Confirmed as a maintenance walk-through", at: "12:28:19" },
      { action: "resolved", at: "12:29:02" },
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
  // Newest first, matching the live queue, so the two read the same way when
  // S07 shows them in one list.
}).reverse();

const SEEDED_AUDIT: SecurityAuditEntry[] = (() => {
  const out: Omit<SecurityAuditEntry, "seq">[] = [];
  const iso = (hms: string) => `${DEMO_DAY}T${hms}.000Z`;

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
      // Named by SOURCE, not by id: the log is read under the incident, which
      // already says which one it is.
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
        // A note is an observation rather than a state change, which is most of
        // what a real log is made of: it says why the next step was taken.
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

/** `SEC-DEMO-0041`, `SEC-DEMO-0042`, ... Four digits, as every id in the spec
 *  is written; a run long enough to exceed them simply grows a fifth. */
const incidentIdFor = (n: number) => `SEC-DEMO-${String(n).padStart(4, "0")}`;

/** Append one line to the log, numbering it from the entry before. */
function appendAudit(
  log: SecurityAuditEntry[],
  entry: Omit<SecurityAuditEntry, "seq" | "at">,
): SecurityAuditEntry[] {
  return [
    ...log,
    { ...entry, seq: (log[log.length - 1]?.seq ?? 0) + 1, at: new Date().toISOString() },
  ];
}

/** Shared identity, so a reset never hands out a fresh object. */
const ALL_CATEGORIES: Record<SecurityCategory, boolean> = {
  access: true,
  cargo: true,
  waterside: true,
  analytics: true,
  geofences: true,
  incidents: true,
};

const LIVE_ACTOR = SECURITY_ACTORS.rm;

/** The ladder ESCALATE climbs. */
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
        // Every named field already held the value asked for: no write, so no
        // subscriber is told the list changed.
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

        // Carries the incident id too, so the per-incident log can show the
        // trigger that caused it rather than starting at the raise.
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
            // Already acknowledged, or already closed: nothing to do. Returning
            // the same object keeps the array identity, and the card still.
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
            // A resolved incident does not climb, and CRITICAL is the top.
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
          // Back to the seeded history, not to nothing: an empty log is not a
          // state this layer is ever meant to be in.
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
