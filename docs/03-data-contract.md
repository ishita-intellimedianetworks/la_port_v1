# 03 — Data Contract

All config lives in ONE file — `src/config/site.json`. Nothing else in the app
imports it directly: everything goes through `src/config/index.ts`, which types
the document, slices it into the views the app reads, rebuilds the layout →
hotspot nesting, derives the lookup maps, and validates it at load.

### Shaped as tables, not as a tree

`site.json` is written the way a database will hand it back, so the eventual
migration is a load rather than a rewrite:

| Key | Becomes |
|---|---|
| `meta`, `assets`, `world`, `cameras`, `lights`, `globals` | the **site record** — exported as `scene` |
| `theme`, `zones`, `tones`, `copy` | its **presentation** — exported as `ui` |
| `layouts[]` | the **layouts table** — PK `id` (`L01`–`L10`) |
| `hotspots[]` | the **hotspots table** — PK `id` (`H01`–`H30`), FK `layoutId` |

`layouts` and `hotspots` are SIBLING arrays. A hotspot names its parent with
`layoutId` and that is the only place parentage is written; the nested list the
Resources panel shows (`layout.hotspots`, `RESOURCE_TREE`) is rebuilt at import.
The layout row used to carry its own `hotspots: []` id list as well, and the
load-time validator existed largely to catch the two disagreeing — a fact that
cannot be written twice cannot drift.

`index.ts` runs the checks a database would enforce with constraints: PK format,
PK uniqueness, FK integrity, and the hero-container invariant.

The handoff's §4 recommended data model and the data-points doc's "Recommended
API Shape" are both honoured: stable IDs, snake_case field names, and a
**field dictionary** per hotspot so the popup renderer never needs
hotspot-specific hard-coded UI.

> **Coordinates are placeholders.** Every `position`, `rotation` and
> `camera` in the `layouts` / `hotspots` tables is `[0,0,0]` until it is
> authored against the real Everport model. The runtime handles this itself:
> `isPlaceholder()` makes layout navigation fall back to `scene.cameras.start`,
> and suppresses 3D markers that would otherwise pile up on the world origin.
> Both behaviours disappear on their own the moment real values land — there is
> no flag to remember to flip.

## site.json › the site record (`scene`)

```jsonc
{
  "meta": {
    "id": "everport-la",
    "label": "Everport Terminal Services",
    "subtitle": "Berths 226-236 · Terminal Island · Port of Los Angeles",
    "brand": "HOLOTWIN",
    "version": "0.1.0",
    "modelStatus": "placeholder"          // flips to "delivered" with the real GLB
  },

  // Point these four at the Everport files and the swap is done.
  "assets": {
    "modelUrl":     "/models/olympic-village-v3.glb",
    "navmeshUrl":   "/models/navmesh/olympic-village-navmesh-recast-v1.glb",
    "previewUrl":   "/models/village.preview.bin",
    "floorplanUrl": "/floorplan/village.png",
    "envFile":      "/env.hdr"
  },

  "world": {
    "eyeHeight": 1.828,                   // first-person camera height, world units
    "walkSpeed": 3,                       // world units/sec at 1x
    "speedMultipliers": [1, 3, 5],
    "defaultSpeedMultiplier": 3,
    "siteSpanMeters": 1600,               // longest model extent presented as this many metres
    "siteSpanUnits": 530,                 // measured from the model bbox
    "shadows": true,
    "background": "#0a1420",
    "fog": { "enabled": true, "color": "#9fb8cc", "near": 220, "far": 900 }
  },

  "cameras": {
    "entry":     { "position": [0, 60, 90],   "rotation": [-0.45, 0, 0] },  // pose the Canvas is created at
    "dollhouse": { "position": [0, 180, 320], "rotation": [-0.5, 0, 0] },   // orbit seat
    "start":     { "position": [22.1736, 0, 13.0198], "rotation": [-0.0002, 2.0908, 0] }
  },

  "lights": {
    "ambientIntensity": 0.8, "ambientColor": "#ffffff",
    "envIntensity": 0.65,
    "sunIntensity": 7.9, "sunColor": "#ffffff", "sunDirection": [-1.5, 5.9, -2.6],
    "shadowMapSize": 1024, "shadowRadius": 0.5,
    "shadowBias": -0.0005, "shadowNormalBias": 0.55
  },

  // Facts every popup can reference, and the hero-container invariant's source.
  "globals": {
    "heroContainerId": "EGHU4829136",
    "vessel": { "name": "EVER LEGACY", "imo": "9876543" },
    "terminal": { "operator": "…", "berths": "226-236", "areaAcres": 205, … }
  }
}
```

## site.json › presentation (`ui`)

Every string the user sees lives here — loader copy, the instructions card,
sidebar and panel labels, badge text, zone labels and colours, and the keyword
lists that map an enum value to an ok / warn / alert tone. Changing wording or
accent colours never means touching a component.

```jsonc
{
  "theme":        { "color": "#0fb7ff", "accent": "#00ffcc", "background": "#030b14" },
  "loading":      { "title": "Initializing", "tagline": "…", "brand": "HOLOTWIN" },
  "instructions": { "title": "…", "actionLabel": "…", "items": [{ "icon": "rotate", "text": "…" }] },
  "sidebar":      { "map": "Map", "layouts": "Layouts", "hotspots": "Hotspots", "dollhouse": "Dollhouse" },
  "panels":       { "layoutsTitle": "…", "hotspotsTitle": "…", "mapTitle": "…", … },
  "zones":        { "waterside": { "label": "Waterside", "color": "#2ea8ff" }, … },
  "popup":        { "demoBadge": "Demo Data", "staticBadge": "Reference Data", … },
  "hud":          { "stopLabel": "Stop", "placeholderNotice": "…" },
  "tones":        { "ok": ["NORMAL", "OPERATIONAL", …], "warn": […], "alert": […] }
}
```

## site.json › `layouts[]` — one row

Mirrors the handoff §4 recommendation, camelCased for TS ergonomics; the
snake_case names survive on the wire fields where the doc specifies them.

```jsonc
{
  "id": "L03",
  "name": "Ship-to-Shore Crane Zone",
  "zone": "waterside",             // waterside | yard | landside | rail | executive - groups the Layouts panel
  "description": "Show the physical crane operation and connect the asset to operational telemetry.",
  "position": [0, 0, 0],           // the layout's anchor point (map pin)
  "camera": {                      // saved walk/teleport destination pose
    "position": [0, 0, 0],
    "rotation": [0, 0, 0]          // YXZ euler - [pitch, yaw, roll]
  },
  "teleportEnabled": true,
  "walkable": true,                // false = overview-only, teleport lands exactly at this pose
  "exactPose": false               // true = keep authored Y instead of snapping to navmesh
}
```

There is deliberately **no** `hotspots: []` column. The children are joined off
`hotspots[].layoutId` at import, in table order, and handed back as
`layout.hotspots` — so every existing reader is unchanged.

## site.json › `hotspots[]` — one row

```jsonc
{
  "id": "H05",
  "layoutId": "L03",
  "name": "Ship-to-Shore Crane",
  "popupTitle": "Crane QC-02 - Operational Status",
  "icon": "crane",                 // crane | vessel | container | reefer | yard | equipment |
                                   // gate | rail | kpi | safety | sustainability | journey
  "linkedAssetId": "QC-02",        // mesh/node name in the GLB to highlight while the popup is open
  "position": [0, 0, 0],
  "rotation": [0, 0, 0],           // marker disc orientation; omit = lies flat
  "dataSource": "demo",            // static | demo | live - drives the Demo Data badge
  "fields": [
    { "name": "crane_id",           "label": "Crane ID",          "type": "string",  "value": "QC-02" },
    { "name": "crane_type",         "label": "Type",              "type": "string",  "value": "Post-Panamax STS" },
    { "name": "status",             "label": "Status",            "type": "enum",    "value": "OPERATIONAL", "tone": "ok" },
    { "name": "assigned_vessel",    "label": "Assigned Vessel",   "type": "string",  "value": "EVER LEGACY" },
    { "name": "current_container",  "label": "Current Container", "type": "string",  "value": "EGHU4829136", "ref": "hero" },
    { "name": "current_operation",  "label": "Operation",         "type": "enum",    "value": "DISCHARGE" },
    { "name": "lift_count_today",   "label": "Lifts Today",       "type": "integer", "value": 428 },
    { "name": "moves_per_hour",     "label": "Moves / Hour",      "type": "decimal", "value": 31 },
    { "name": "runtime_hours",      "label": "Runtime",           "type": "decimal", "value": 18426, "unit": "h" },
    { "name": "maintenance_status", "label": "Maintenance",       "type": "enum",    "value": "NORMAL", "tone": "ok" },
    { "name": "health_score",       "label": "Health Score",      "type": "integer", "value": 96, "render": "meter", "max": 100 }
  ]
}
```

Field renderer rules — the popup switches on `type` + `render`, nothing else:

| `type` | Rendering |
|---|---|
| `string` | plain value; monospace when it matches an ID pattern |
| `integer` / `decimal` | right-aligned number + optional `unit` |
| `percentage` | number + `%`, plus a thin bar when `render: "meter"` |
| `enum` | pill; `tone` (`ok` / `warn` / `alert`) picks the colour, defaulted from a keyword map (`NORMAL`, `OPERATIONAL`, `PASSED`, `APPROVED` → ok; `RESTRICTED`, `HIGH` → alert) |
| `boolean` | check / cross chip |
| `datetime` | formatted local time, relative hint underneath |
| `duration` | as authored |

`ref: "hero"` marks a field as part of the hero-container chain. The adapter
asserts every such value equals `globals.heroContainerId` at load, so a typo
fails loudly instead of silently breaking the H09 → H14 → H24 → H30 story.

## L01–L10 / H01–H30 index

Authoritative content lives in the two docx files; this table is the wiring map.

| Layout | Name | Zone | Hotspots |
|---|---|---|---|
| **L01** | Main Channel / Terminal Arrival | waterside | H01 Main Channel · H02 Terminal Overview |
| **L02** | Berth / Quay | waterside | H03 Berth · H04 Quay Edge / Wharf |
| **L03** | Ship-to-Shore Crane Zone | waterside | H05 STS Crane · H06 Crane Operating System · H07 Crane Safety Zone |
| **L04** | Vessel / Berth Working Face | waterside | H08 Container Vessel · **H09 Hero Container** · H10 Vessel Container Stack |
| **L05** | Northern Container Yard | yard | H11 Container Stack · H12 Yard Block · H13 Terminal Equipment |
| **L06** | Central Container Yard | yard | **H14 Hero Container** · H15 Yard Operations · H16 Equipment Activity |
| **L07** | Southern Container Yard | yard | H17 Reefer Container · H18 Southern Yard Block · H19 Yard Operations |
| **L08** | Landside / Truck Gate | landside | H20 Truck Gate · H21 OCR / Gate Processing · H22 Truck Queue |
| **L09** | TICTF / Everport Rail Interface | rail | H23 Rail Loading Track · **H24 Container→Rail Transfer** · H25 TICTF Overview |
| **L10** | Executive Digital Twin Overview | executive | H26 Terminal KPI · H27 Operations Intelligence · H28 Sustainability · H29 Predictive Maintenance · **H30 Cargo Journey** |

30 hotspots, 10 layouts, roughly 300 authored field values.

### Hero container chain — enforced invariant

| Hotspot | Container | Physical stage | Expected state |
|---|---|---|---|
| H09 | EGHU4829136 | On vessel / Bay 42 | `ON VESSEL` |
| H14 | EGHU4829136 | Yard A12 / Stack 04 | `YARD STORAGE` |
| H24 | EGHU4829136 | TICTF rail interface | `SCHEDULED` |
| H30 | EGHU4829136 | Executive journey | `YARD STORAGE`, next `TRUCK PICKUP` |

H30 carries an extra `journey[]` array alongside its fields, and the popup
renders it as a timeline above the field table. Each step names a `layoutId`
and `hotspotId`, so its button jumps the camera to that layout and opens that
hotspot — the L04 → L03 → L06 → L08 → L09 walk the handoff asks for. Any
hotspot may carry a `journey`; only H30 does today.

### Static vs demo

`dataSource: "static"` — published Everport / TICTF infrastructure facts
(205 acres, 5,800 ft total berth length, 3 berths, 8 post-Panamax cranes,
560 reefer plugs; TICTF's 8 loading / 10 storage / 2 arrival-departure tracks).
No badge.

`dataSource: "demo"` — everything else: vessel schedule, crane telemetry, yard
utilisation, queues, environmental and predictive-maintenance values.
**Demo Data** badge in the popup header, always.

`dataSource: "live"` — reserved. When a telemetry adapter exists, only
`fields[].value` resolution changes; no UI work.

## Naming rules carried from the spec

- IDs exactly `L01`–`L10` and `H01`–`H30`, never renamed during implementation
- `fields[].name` stays snake_case (backend / API contract)
- L09 is always presented as the **shared TICTF / Everport Rail Interface**,
  never as an Everport-only rail yard
