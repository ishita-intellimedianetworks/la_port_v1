# 00 — Build Status

What is built and running at `/` today.

## Architecture

The scene engine is the **holotwin-la-v3-sofi reference, vendored wholesale**
into `src/terminal/` and `src/shared/`. Navmesh registration, walking, the dollhouse orbit,
the loading pipeline, the minimap, the destination panels and the overlay chrome
are the reference's own code, not a re-derivation of it.

That decision came after re-implementing those pieces by hand and hitting
differences that were hard to chase: the navmesh and A* routing verified fine in
isolation (1 group, 1078 nodes, every route resolving) while walking still did
not work in the app. Vendoring removes the class of bug entirely.

```
src/app/                    Next.js shell — routes, fonts, global styles
src/config/                 OUR data: the four JSONs + schema + validation
  site.json                 THE config file — one document, table-shaped:
                              meta/assets/world/cameras/lights/globals  site record
                              theme/zones/tones/copy                    presentation
                              layouts[]                                 L01-L10  (PK id)
                              hotspots[]                                H01-H30  (PK id, FK layoutId)
  schema.ts  index.ts       types + the single typed entry point

src/terminal/               the digital-twin experience  [VENDORED engine]
  provider.tsx              phase machine, load gates, shared state
  scene-graph.tsx           everything inside the WebGL canvas
  overlays.tsx              everything on top of it
  navigation-config.ts      one place to tune route colours, sizes, walk maths
  context/                  scene-context (canvas), ui-context (overlays)
  scene/                    the 3D layer
    player/                 first-person walking on the navmesh
    navmesh/                walkable-surface GLB -> pathfinding zone
    route-line/             the 3D route ribbon and destination pin
    dollhouse-camera/       orbit overview + the fly-in to first person
    hotspot-markers/        the discs in the world
    model-loader/           GLB load, reveal patching, bounds
    environment/            sky, clouds, lights, background fade
    crowd-flow/  perf-meter/  hooks/  utils/
  map/                      the floor-plan minimap
  overlay/                  the HTML layer
    sidebar/                the left rail
    destination-panel/      the layout browser
    hotspot-card/           the H01-H30 data readout
    dollhouse-intro/        the instructions card
    nav-hud/                turn-by-turn banner
    glass-theme.ts          the overlay glass recipes
    scene-toggle/  fullscreen-button/  event-updates/  lights-panel/  venues-tab/
  stores/                   nav/UI state shared across both layers

src/shared/                 cross-cutting  [VENDORED]
  canvas/                   the R3F canvas wrapper
  scene-data/               scenes.json (GENERATED) + its adapter
  stores/                   progress, app, camera, world, lights, orientation
  ui/controls/              buttons, chips, panels, labels
  ui/screens/               loading screen, fade, instructions, landscape guard
  animation/  runtime/      gsap helpers; device tier, GLTF disposal, prefetch

scripts/                    coordinate authoring, scenes.json generation, verification
```

Nothing is named after its history any more: no `components-v5`, no
`interior-*`, no `scene-content/components/`, no `atoms`/`molecules`. Exported
symbols followed — `InteriorScene` is `TerminalExperience`, `InteriorR3F` is
`SceneGraph`, `useInteriorInline` is `useTerminalUi`.

### How our data reaches the engine

`scripts/build-scenes.cjs` projects our data onto the shape the engine reads
(`src/shared/scene-data/scenes.json`). The mapping is direct, because
the two models agree — the reference's `Destination` is one saved `camera` plus
a list of `hotspots[]` markers that share it, which is exactly the handoff's
Layout + `hotspots[]`:

| ours | engine |
|---|---|
| layout (L01–L10) | a destination, grouped under its zone category |
| `layout.camera` (position + target) | `destination.camera` (position + YXZ euler) |
| hotspot (H01–H30) | `destination.hotspots[i]` — a marker only |
| zone | a destination category |

`scenes.json` is **generated**; never hand-edit it. The four files under
`src/config/` stay the source of truth.

```bash
npm run data      # author coordinates -> regenerate scenes.json -> verify
```

## Running

```bash
npm run dev        # http://localhost:3000  (?debug=true adds the navmesh overlay)
npm run data       # the full data pipeline
npm run verify     # checks the JSON against BOTH source .docx files
npm run handoff    # re-import the handoff's purpose / interaction prose
npm run scenes     # regenerate the engine's scenes.json only
npm run author     # rewrite coordinates from the registered poses
npm run bake       # GLB -> .preview.bin point cloud
```

`npx tsc --noEmit`, `npm run lint`, `npm run build` and `npm run verify` are all
clean. Lint reports ~94 **warnings**, all inside the vendored tree — see below.

## The camera / marker model

Straight from handoff §4:

```
Layout object:  layout_id, ..., camera_position, camera_target, ..., hotspots[]
Hotspot object: hotspot_id, layout_id, hotspot_name, position_x/y/z, icon_type, ...
```

A hotspot is a **marker** — a point. It has no camera. The **layout** owns the
camera, and every marker in its `hotspots[]` is seen from it. Several markers,
one camera place. The engine models this the same way, so the two line up
without adaptation.

Rotation is derived from position → target. Three.js cameras look down -Z, so
`yaw = atan2(-dx, -dz)`; dropping those minus signs aims the camera exactly 180°
away from its subject, which is a mistake worth not repeating.

§5 — "every H01–H30 is physically reachable/visible from its parent Layout" — is
a real geometric check in `npm run verify`, not a formality. It fails the run if
any marker is behind its camera or more than 35° off its view axis. Markers are
chosen from the navmesh vertices that are genuinely visible from the layout
camera, fanned across the view and kept apart from each other.

## Data completeness

`npm run verify` reads **both** source documents directly — it unzips each .docx
and walks `word/document.xml`, so there is no exported copy to drift.

```
data points doc: 30 hotspots, 301 fields
handoff doc:     10 layouts, 30 hotspots
json:            10 layouts, 30 hotspots, 301 fields
✓ all layouts and hotspots match the spec document
```

The two documents own different halves, and both are imported:

| Document | Owns |
|---|---|
| All Data Points | every hotspot's field table — 301 names, types and values |
| Developer Handoff | the prose: each layout's `purpose`, each hotspot's `dataFields` summary and its `interaction` (the Expected Interaction column) |

`npm run handoff` re-imports the second; `npm run data` runs the whole pipeline.

It checks, and fails on:

- every L01–L10 and H01–H30 present, with every structural key populated
- every popup title matching the spec
- every one of the 301 field names present, and every value matching
- the hero-container chain: H09 `ON VESSEL`, H14 `YARD STORAGE`,
  H24 `SCHEDULED`, and every `ref: "hero"` value equal to `heroContainerId`
- `scene.globals` agreeing with the fields that mirror it in H01, H02, H08, H26
- every marker visible from its parent layout's camera
- every layout's `purpose` and every hotspot's `interaction` / `dataFields`
  present AND matching the handoff word for word
- every hotspot sitting under the layout the handoff assigns it to
- L09 still naming the shared TICTF facility

Two names are reported as notes rather than failures: the handoff calls H14
"Container" and H24 "Container-to-Rail Transfer", where the data-points document
says "Hero Container" and "Container → Rail Transfer". The data-points wording is
what the demo shows, so that is what the JSON keeps.

Six discrepancies were found and fixed this way: a missing `berth_number` on
H03, H10's `row`/`tier` losing their leading zeros (`06` → `6`), `-18.0 °C` and
`77.0 %` losing their fixed precision, and `moves/hour` shortened to `moves/h`.

## How the two documents fit together

The **handoff** names the topics — its "Data Fields" column is what each popup
must show. The **data-points** document supplies sample values for those topics.
So the field tables are samples OF the handoff's topic list, and the check that
matters is topic coverage: 183 topics across the 30 hotspots, every one needing
a field.

`npm run verify` now checks that, with an alias table for the places the two
documents word the same thing differently (`crane allocation` → `active_cranes`,
`recommendation` → `recommended_action`, `journey timeline` → H30's `journey[]`,
and so on). Three real holes turned up:

| | Topic | Resolution |
|---|---|---|
| H01 | ETD | **Filled.** The data-points doc omits it here but states the same vessel's ETD twice (H03 `departure_time`, H08 `etd`) — carried across, not invented. |
| H07 | emergency contact | **Pending.** No value in either document. |
| H24 | ETA | **Pending.** No value in either document. |

The two pending topics exist as fields so the popup covers what the handoff
requires, carry `pending: true`, render as absent rather than as a reading, and
are reported on every run until a value arrives. Nothing was fabricated to close
them.

## Data that travels between hotspots

The docs are explicit that some values are the SAME object seen from different
places (handoff §2: *"The Hero Container introduced at H09 should retain the
same container ID when shown again at H14/H30"*; §5: *"Confirm H30 can
demonstrate the same hero-container journey across multiple Layouts"*).

There turned out to be twelve such chains, not one. `scene.globals` holds the
canonical value for each, every field that names one carries a `ref`, and
`npm run verify` asserts they all agree — so the demo can never tell two
stories about the same object.

| chain | value | appears in |
|---|---|---|
| hero | EGHU4829136 | H05 H09 H10 H14 H16 H20 H21 H24 H30 |
| berth | 226 | H03 H08 H09 H30 |
| crane | QC-02 | H05 H06 H30 |
| yardBlock | A12 | H11 H12 H30 |
| yardStack | A12-04 | H11 H30 |
| vesselBay | 42 | H10 H30 |
| topHandler | TH-024 | H13 H29 |
| truck | LA-48291 | H20 H30 |
| truckPlate | 8ABC291 | H20 H21 |
| railTrack | TICTF-L04 | H23 H24 |
| train | BNSF-LA-742 | H23 H30 |
| reefer | EGHU7392014 | H17 |

Crossing a layout boundary is what makes a chain load-bearing. The hero
container runs **L03 → L04 → L06 → L08 → L09 → L10**; crane QC-02 runs
L02 → L03 → L10; the truck L08 → L10. H30 is the convergence point — its
journey timeline names nine of the twelve.

A stale entry fails too: if `globals` declares an identifier no field
references, the run reports it rather than leaving dead config behind.

## The hotspot readout

`src/terminal/overlay/hotspot-card/` replaces the
reference's own hotspot info card. All 30 hotspots render through it, driven
purely by their `fields` dictionary — the handoff's consistency requirement, and
the reason a new hotspot needs no new UI code.

The engine reports a marker click as (destination, marker index). A destination
is a layout and its markers are that layout's `hotspots[]` in order, so the pair
resolves straight back to a hotspot id.

The card is the reference's panel — `NAV_GLASS_PANEL`, its `PanelHeader`, its
two-column details grid. Only two things come from `3di-admin-frontend`: the row
treatment (a small label above a larger value, closed by a line) and **Copy
Data**, which writes every field to the clipboard.

## Lint policy

`src/terminal` and `src/shared` are vendored. It was written against an older lint config,
and the React-compiler rules flag long-standing patterns in it — imperative refs
driven from `useFrame`, DOM writes in effects. Rewriting them would fork the code
away from its source and defeat the point of vendoring, so those rules are
**warnings** for those directories only. Everything we author (`src/app`,
`src/config`, `scripts`) keeps the full rule set as errors.

## Placeholders, by design

- **Model** — the LA Olympics village GLB stands in for Everport. The swap is
  the five `assets.*` URLs in `site.json`.
- **Layout cameras** — real, but borrowed: poses authored in-scene against this
  exact village GLB in the HoloTwin reference projects (6 POI cameras, the
  monument/start pose, plus the registered `entry` and `dollHouseCamera`). Each
  layout records its `poseSource`.
- **Hotspot markers** — derived. The reference never placed any (every `hotspot`
  field in its scenes.json is null), so `scripts/author-positions.cjs` picks
  them off the navmesh.
- **Asset highlight** — inert until the model carries nodes named to match
  `linkedAssetId` (`QC-02`, `TH-024`, `A12`, `EGHU4829136`, …). 20 of 30
  hotspots carry one. Worth sending to the modeller now, not at delivery.

## What changes when the Everport model arrives

Nothing structural. Only coordinates and asset URLs:

| File | What changes |
|---|---|
| `site.json` › `assets` / `cameras` / `world` / `meta` | the five `assets.*` URLs, `cameras.entry` / `dollhouse` / `start`, `world.eyeHeight`, `meta.modelStatus` |
| `site.json` › `layouts[]` | `position`, `camera.position`, `camera.target` × 10 |
| `site.json` › `hotspots[]` | `position` and `rotation` × 30 markers |

Every field value, popup title, icon, zone, data source, asset link, journey
step and piece of UI copy stays as it is. `scripts/author-positions.cjs` is the
one place to re-point: replace `REGISTERED_POSES` with poses authored against
the new model, then `npm run data`.

## Not built yet

- `/author` route for capturing poses and hotspot positions interactively
- Live/simulated telemetry (`dataSource: "live"` is reserved for it)
- Route ETA / distance readouts

## Pruned from the vendored engine

Removed as not applicable to an operational port twin: the lighting studio, and the unused shadcn primitives (`dialog`,
`progress`, `scroll-area`, `select`, `card`, `input`) plus `adaptive-perf`.

Still present but inert, because the rail only shows categories that have
entries on the active floor: crowd flow, event updates, venues tab, lights
panel, and the LA2028 destination categories. They cost nothing at runtime and
removing them means editing files we want to keep close to upstream.
