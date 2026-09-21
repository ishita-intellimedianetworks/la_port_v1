# The v5 Port Security layer

How `/v5` works, and why it is built the way it is.

`/v5` carries the **Port Security demonstration layer**, hotspots S01-S08, on
top of the existing operational terminal. This document covers the fork, the
layer, and the decisions behind both.

> **LINEAGE.** `/v4` was forked from `/v3` and is where this layer was built.
> `/v5` was then forked from `/v4` and is where it is developed now. The two
> carry the **same code** - `index.tsx` and four sky-store self-imports apart -
> and differ in their site files: `v4.json` gates S03-S08 off and authors no
> `worldModels`, so `/v4` stays the stable two-anchor demo while `/v5` runs six.
> Everything below describes v5; where it says "v4" it is describing history.

> **Keep this current.** It is the only prose description of how v5 differs from
> v3. Anything that changes v5's behaviour (a new hotspot, a store field, a
> mode rule, a config key) should land here in the same change.

---

## 1. Source of truth

The layer is specified by
`reference_files/HoloTwin_LA_Port_Port_Security_Developer_Handoff.docx`. Section
numbers throughout this document (§4, §5…) refer to it.

Anchor positions come from `reference_files/la-port-zone-c5-hs-v5 (1).glb`,
nodes `hs_s01` to `hs_s08`, and viewpoints from
`reference_files/la-port-zone-c5-cp-v6.glb`, paired by
`reference_files/List-HS CP (1).xlsx`. The v5 file re-anchored **six of the eight** against the
current bake; S05, S07 and S08 came back byte-identical to v5's. Positions are
the ones in the table below.

That same file carries `hs_001` to `hs_030`, the operational anchors, and all
thirty match `hotspots[]` in `v5.json` to 4dp. Nothing in the app reads the GLB
— it is a hand-off format — so that agreement is the only available proof that a
new drop is in the same authoring space as the file it is about to be written
into. **Check it before trusting an `hs_sNN` node:** if the thirty do not match,
the eight cannot be trusted either, and the mismatch is in the export rather
than in the security layer.

### The constraint that shapes everything

The spec is emphatic and repeats it in the scope rule, in every hotspot's data
rules, and again in the acceptance criteria:

> These are **demo anchors, not real security positions.**

No real camera fields of view, credential logic, patrol schedules, emergency
response routes, security staffing, or sensor coverage gaps may be encoded.
Every ID, zone, incident and reading is synthetic and carries the disclosure
the spec requires - either the DEMO infix (`SEC-DEMO-0042`) or the word
*Simulated* (`CAM-04`, `YARD-RZ-02`); §8 tracks the half-finished move from the
first to the second. Geographic grounding is public only: the
Port's terminal listing, a public Draft EIS/EIR, published gate-camera context
and the 2025 terminal map, all cited in the spec's §9.

**Anything added to this layer inherits that constraint.**

---

## 2. Why each one is a fork, not a flag

Both forks were made the same way: a byte-identical copy of the tree above,
free to diverge without touching its source.

```
src/terminal-v3/      →  src/terminal-v4/      (88 files)
src/app/v3/page.tsx   →  src/app/v4/page.tsx
config/sites/v3.json  →  config/sites/v4.json

src/terminal-v4/      →  src/terminal-v5/      (91 files)
src/app/v4/page.tsx   →  src/app/v5/page.tsx
config/sites/v4.json  →  config/sites/v5.json
```

The v5 fork is the same four edits as the v3 one: the `TerminalExperienceV5`
rename, its `site` default, the route, and every `@/terminal-v4` self-import
repointed at `@/terminal-v5` - the import repoint being the one that matters,
since a missed one would have v5 sharing v4's store singletons.

At the moment of the fork only five files differed: the `TerminalExperienceV4`
rename, its `site` default, the route's doc comment, and four
`@/terminal-v3/stores/sky-store` imports repointed at `@/terminal-v4`. That last
one mattered. Left as-is, v4 would have shared v3's sky-store singleton and the
two routes would have fought over one piece of state.

`v4` is registered in both places a site id is enumerated: `SITE_IDS` and the
`SITES` resolver in `src/config/index.ts`, and `STREAM_VARIANTS` in
`src/streaming/config.ts`. Because `StreamVariantId = SiteId`, adding the id
makes the streaming entry mandatory rather than optional, so the compiler
catches a half-registration.

`assetBaseFor` has a `v4` branch reading `NEXT_PUBLIC_STREAM_BASE_V4`. Without
it, v4 would fall through to v1's base and stream the wrong bake silently,
against the file's stated intent that an unset variable 404 loudly. v4 points at
its own bake, v9 (see the streaming section below).

**v5 SHARES v4's BASE**, by falling back to it:
`STREAM_BASE_V5 ?? STREAM_BASE_V4`. The two site files carry the same
`stream.slug`, `portla-c5-v9w-inst-mo` - v5 is a fork of the layer, not of the
bake - so a separate base would only be a second name for one set of chunks.
Falling back is what makes that true in a deploy as well as on paper: `.env`
has `NEXT_PUBLIC_STREAM_BASE_V4` set and no V5, and without the fallback v5
would drop to the `ASSET_ROOT/<slug>/` path instead of the CDN base v4 uses,
streaming from somewhere v4 never touches. `NEXT_PUBLIC_STREAM_BASE_V5` still
wins if it is ever set, which is the one line to add the day v5 gets a bake of
its own.

The variable lives in `.env`, which is gitignored, so **a deploy needs it set
in that host's own environment** - Vercel project settings, for instance. Next
inlines `NEXT_PUBLIC_*` at build time, so it must be there before the build and
a re-deploy is needed after adding it. Unset, `assetBaseFor` falls back to
`/assets/<slug>/assets/` - the local staging copy under `public/`, itself
gitignored - and `manifest.json`, `materials.json`, `tex.json`, `navmesh.glb`
and every chunk 404.

---

## 3. How the layer is reached

**There is no Security Mode and no shield.** Both were removed. The layer is
reached from the Resources tree, where **Security is the first row** and its six
capabilities are its children:

```
▾ SECURITY
    AI Access Control
    Container Security Screening
    Waterside Perimeter Monitoring
    AI Video Analytics
    Restricted Area / Geofence
    AI Anomaly / Unattended Object
  MAIN CHANNEL / TERMINAL ARRIVAL
  BERTH / QUAY
  …the ten layouts, unchanged
```

Tapping one travels to that anchor's **own camera point** and selects it, so the
marker is the only disc on screen when the picture returns. Clicking the marker
opens its popup. That is the same path an operational resource takes — the only
difference is which table the row came from.

### One row, not a group under five layouts

The six anchors belong to five different layouts (L02, L03, L06, L07, L08), and
an earlier version filed them that way, as a labelled group inside each layout's
unfolded row. One set spread across five folds could not be taken in: the
security capabilities are read as a set — "what can this terminal see" — rather
than as facilities filed at a place.

So the row is a **category, not a destination**. It has no camera of its own,
because there is no single pose that could mean "all six", and tapping its name
unfolds it instead of travelling. It still wears the same frame and type as
every other row: giving the one new thing in the panel a different treatment
would make it the one thing that reads as foreign.

It leads the list because it is the shortest row and the one being
demonstrated. The operational layouts keep their own order below it.

### The layer opens with two incidents open

`OPEN_INCIDENTS` replaces the empty seed. Two, matching what the two alarm
screens already claim:

| | source | severity | |
|---|---|---|---|
| `SEC-DEMO-0043` | S03 waterside, `WS-01` | **HIGH** | unauthorized watercraft in zone |
| `SEC-DEMO-0044` | S06 anomaly, `CAM-07` | **MEDIUM** | unattended object |

**Because S08 derives, it does not need authoring.** `commandViewFields` reads
the store, so the command view now says `Waterside - 1 event · HIGH` and
`Video Analytics - 1 event · MEDIUM`, with counters at 2 active / 1 high /
1 medium / 0 critical. Hard-coding those numbers would have left two places to
keep in step; this way S08 cannot disagree with S03's DANGER banner or S06's
FLAGGED FOR REVIEW, because it is reading the same rows they describe.

S07's queue picks them up for free, and each source card keeps its own grid:
`SourceIncidents` only renders at two or more open on one hotspot, and these
are one each.

**This changes the layer's opening premise.** §5 step 1 had every system NORMAL
with nothing detected, and the emptied event fields in `_securityNote` were
held back for exactly that. Two screens now open mid-event instead, so "nothing
is happening until you make it happen" no longer describes the demo.

### The layer switches are gone

S08 carried six chips that added and removed marker categories. Removed, with
`SecurityLayerToggles` and `LayerChip`. The store keeps `categories`,
`toggleCategory` and `showAllCategories` - nothing reads them now, and they are
the hook if the idea comes back.

It was the only control in the layer that changed what was on screen, so S08 is
now purely a readout, which is what the other seven are.

### All eight are reachable, but only six have markers

No `enabled: false` remains in `v5.json`. `v4.json` carries it on S03-S08,
which is the whole of what separates the two routes.

**S07 and S08 have no marker, and open a different way.** `isFieldHotspot` is
true only for S01-S06 - the six that appear in `SECURITY_EVENT_GROUPS` - and
`hotspot-markers` filters on it, so the incident log and the command
switchboard draw no disc. They are instruments, not places. Since a card is
normally opened by clicking its disc, enabling them alone would have made them
travel somewhere and show nothing.

So the Resources row does both for them: `goToHotspot` takes an `onArrive`, and
the flap passes one for any hotspot that is **not** a field hotspot, setting
`hotspotInfo` from inside the transition. The card is therefore up as the
picture returns. The six that do have markers keep the old behaviour -
travelling to them deliberately leaves the card closed, so someone can stand at
the viewpoint and watch the terminal.

A row that IS disabled is still listed under Security - the set is eight and
looking like six would be a lie - but it is **dimmed to 40% and not pressable**,
and no marker is ever drawn for it.

`disabled` on the button rather than `opacity` alone, so the keyboard and a
screen reader get the same answer the eye does.

This is the honest state for a capability whose data and viewpoint exist but
whose story is not finished. Hiding the rows would make the layer look shorter
than it is; leaving them live would let them be pressed into a half-built view.
Absent means enabled, so all thirty operational rows and S01-S06 are unaffected.

Removing the flag is the whole of "turn one back on" - which is all S03 through
S06 needed. Their fields, alert, camera and CP pairing were authored from the
start; nothing but that one line stood between them and the screen.

### S07 and S08 are in the list

They are listed under **Security** with the other six, so the incident log and
the command view are reachable. Pressing one travels to its own CP and selects
it, exactly as a field anchor does.

The spec calls them "logical" anchors, "not a physical security-room location",
and for a while that argued for keeping them out of a list of places. It lost to
a simpler fact: **a capability nothing can open is worse than one filed under a
heading that does not quite fit.** They are the only way into the queue, the
audit trail and the layer toggles.

Two places still split on `isFieldHotspot`, and both are right to:

- **The nearby set while walking.** Field anchors only. S07 and S08 are
  instruments rather than places, and walking near L10 should not put the
  incident log on a stick in the yard.
- **Nothing else.** A card's "2 of 8" counts within the list it was picked
  from, which is the only count an operator can check.

### What is left of the mode

The store keeps `mode`, `returnLayoutId`, `securityLayoutId` and
`managementOpen`, and `hotspot-markers` keeps the branch guarded by `mode`.
Nothing sets any of them, so they read false/null for the life of the session
and that branch is never taken. Kept rather than deleted because this layer has
changed direction more than once; the dead branch is the cheapest way to keep
the option.

**"Back to incidents" is not gated on the mode.** It is gated on
`viewingIncidentId` alone — set by View location, cleared on return — which is
the honest condition and does not assume a mode that no longer exists.

### A picked security anchor, and the pair that is always up

`goToHotspot` ends by selecting the hotspot, which narrows the scene to that one
bead. `hotspot-markers` resolves the selected id against **both** tables, so a
security anchor draws the same way an operational one does.

That narrowing was once the whole story, and §8 read straight: *"demo zones
disappear ... **unless a user explicitly selects** an active incident."*
Picking a row by name in the tree is that explicit selection.

It no longer is. The enabled anchors — S01-S06 — are added back after the
narrowing, so the two layers DO draw together — see "What is on screen, and
when".

Its `index`/`total` count within the **six field capabilities** — the set the
tree shows it in — rather than its parent layout's operational children.

---

## 4. Where the data lives

This is the decision most likely to be misremembered, so it is stated plainly:

> **`v5.json` seeds the layer. The store owns it.**

`config/sites/v5.json` › `securityHotspots[]` is the **opening position**:
anchors, labels, and the readings each popup shows at rest. `initStores(site)`
copies it into `useSecurityStore` once, at the root's render, before any child
reads it.

From that moment the **store is the source of truth**. The demo mutates
readings, raises incidents and moves S08's counters, and none of that can be
written back to a file the app imports. Config answers *"where does the demo
start"*; the store answers *"what is true now"*.

The seed is deep-copied at init. `src/config/index.ts` memoises one resolved
`Site` per id for the life of the process, so mutating its arrays in place would
leave edits behind after a reset, and, on a route sharing the object, in
another tree entirely.

### `securityHotspots[]` is a sibling table, not more rows in `hotspots[]`

`layouts[].hotspots` is rebuilt by filtering `hotspots[]` on `layoutId`. A
security row living there would be indistinguishable from an operational one
everywhere that list is read — the marker set, the "3 of 5" count on a card, the
Resources tree — and the two layers have to be switchable independently. Kept
apart, each can be drawn, counted and listed on its own terms.

Security rows ARE listed in the Resources tree (see below), but as their own
group, built from the store and rendered separately. That is the distinction the
split buys: the tree can choose to show both, while nothing that reads
`layouts[].hotspots` ever sees a security row by accident.

### Rotations are converted, not copied

The GLB stores quaternions; `v5.json` stores XYZ Euler, via three.js's
`Euler.setFromQuaternion` in order `XYZ`. The conversion is validated by the
thirty operational nodes above: every one reproduces its `hotspots[]` row's
rotation exactly, so a converted `hs_sNN` is being read the same way thirty
known-good rows already are.

The v5 drop left every rotation where it was — only positions moved. A
quaternion of `-0` where v5.json holds `0` is the same rotation and is written
as `0`, so the file does not pick up a `-0` on a value that did not change.

| | Position | Rotation | Moved in v5 |
|---|---|---|---|
| S01 | `[-760.3231, 2.1281, 243.2027]` | `[1.5708, 0, -1.1056]` | 2 |
| S02 | `[-756.4547, 6.4506, 246.9512]` | `[1.5708, 0, -1.1056]` | 6 |
| S03 | `[-1528.5432, 3.9564, 421.6853]` | `[1.5708, 0, -1.1056]` | **342** |
| S04 | `[-1012.8342, 15.4923, 127.8713]` | `[1.5708, 0, -1.1056]` | 32 |
| S05 | `[-1122.3207, 6.684, -348.682]` | `[1.5708, 0, -2.6764]` | — |
| S06 | `[-1347.0518, 15.3872, 469.7945]` | `[1.5708, 0, -2.6764]` | 52 |
| S07 | `[-910.3315, 6.684, -223.5211]` | `[1.5708, 0, -2.6764]` | — |
| S08 | `[-794.3698, 38.8292, -390.286]` | `[1.5708, 0, -2.6764]` | — |

All eight are authored. S03's 342 units is the one that changes what is on
screen: it moved off the quay and out past the western end of the waterfront.

Parent layouts for S03, S04 and S06, which the spec gives as a pair each, are
resolved by **distance to the nearest operational hotspot in each candidate**,
because a layout is a group of resources rather than a point and that is the
figure that says which group an anchor has landed among. All three choices
survive the re-anchor:

| | Spec says | Resolved to | Nearest in it | Nearest in the other |
|---|---|---|---|---|
| S03 | L01 / L02 | **L02** | 294 | 346 (L01) |
| S04 | L05 / L06 | **L06** | 16 | 174 (L05) |
| S06 | L06 / L07 | **L07** | 47 | 447 (L06) |

S04 and S06 now sit well inside the group they are filed under. S03 does not sit
inside either — the nearest resource of any kind is 220 units away, in L07 — so
its filing rests on L02 being the nearer of the two the spec offers, and on it
being the waterfront layout.

### Each anchor has its own viewpoint (the CPs)

`HotspotConfig.camera` is the pose travelling to a hotspot lands on; unset, it
falls back to the parent layout's camera. It was unused across the whole project
(0 of 30 operational rows, 0 of 8 security rows) until the CP set arrived as
`la-port-zone-c5-cp-v5.glb` plus a hand-authored HS->CP table.

All eight are authored. They are **not** GLB nodes any more: each one is computed
so its anchor is centred in frame.

#### The file stores XYZ. The runtime applies YXZ. `poseForCamera` is the hinge

Three orders are in play and they are all correct, which is exactly why this is
easy to get wrong:

```
<site>.json  layouts[].camera.rotation        XYZ   - what /extract-pos prints
             securityHotspots[].camera        XYZ
config/index.ts  poseForCamera()              xyzToYxz(camera.rotation)
scene/player/utils/teleport.ts                camera.rotation.set(x, y, z, "YXZ")
```

**Every camera rotation in the site file is XYZ**, and `poseForCamera` reorders
it on the way out. So a camera block is authored in the order a GLB tool prints,
and nothing at the authoring end has to think about YXZ at all.

The two exceptions are `cameras.home` and `cameras.firstPerson`, which do NOT go
through `poseForCamera` - they are applied directly, so they store YXZ, and both
carry a `_note` in the file saying so. That pair of notes is easy to read as a
rule about the whole file. It is not.

An anchor's own `rotation` - `hotspots[].rotation`, `securityHotspots[].rotation`
- is XYZ as well, and reaches the scene unconverted, because a marker rides
`<group rotation={...}>` and a three.js object's default Euler order is XYZ.

**The tell for a mis-ordered camera block:** the third number. A real camera has
no roll, so an orientation with pitch and yaw decomposes in XYZ with a large `z`
- L08's `[-0.3525, 1.1006, 0.3169]` is a perfectly level shot. A camera block
whose `z` is ~0 while its `x` and `y` are not is the suspicious one: that is a
YXZ triple sitting in an XYZ slot, and `xyzToYxz` will reorder it a second time
and cant the horizon. That is precisely the bug this section used to describe as
being in the layout cameras. **The layout cameras were always right.**

#### The eight are AUTHORED, not derived

`cp-v6` adds four viewpoints for the security layer, so nothing is solved here
any more - the CP node's XYZ euler is pasted straight in and what renders is the
orientation the author framed.

**The pairing is authored**, in `reference_files/List-HS CP (1).xlsx`, one row
per anchor. Deriving it by nearest node independently produced the same eight
pairs - every new CP is 5 to 15 units from its anchor while the runner-up is 5
to 15 times further - but the list is the source, not the arithmetic.

| | CP | range | pitch | yaw | roll | anchor off-centre |
|---|---|---|---|---|---|---|
| S01 | `cp_015` | 10 | +5.6 | -177.2 | 0.0 | 17.1 h / 4.6 v |
| S02 | `cp_015` | 15 | +5.6 | -177.2 | 0.0 | 2.8 h / 12.5 v |
| S03 | `cp_016` | 11 | -2.8 | -31.6 | 0.0 | 0.2 h / 1.2 v |
| S04 | `cp_017` | 10 | +3.4 | +93.4 | 0.0 | 3.3 h / 6.9 v |
| S05 | `cp_013` | 14 | -2.0 | +152.8 | 0.0 | 0.3 h / 0.6 v |
| S06 | `cp_018` | 6 | +4.0 | -57.6 | 0.0 | 1.2 h / 0.3 v |
| S07 | `cp_005` | 152 | -14.0 | +151.5 | 0.0 | 6.8 h / 7.0 v |
| S08 | `cp_010` | 425 | -13.0 | +108.5 | 0.0 | 13.3 h / 3.3 v |

**Roll is 0.0 on all eight.** That is the independent check that the pipeline is
right: a camera pose has no roll, the file stores XYZ, `poseForCamera` reorders
to YXZ, and the roll that falls out is zero. A non-zero one would mean a triple
had been pasted in the wrong order.

**Every anchor lands inside the frame.** `world.fov` is 35 vertical, so about 60
horizontal at 16:9 - half-angles of 17.5 and 30. The worst case is S01 at 17.1
horizontal, comfortably inside. Off-centre is not a fault: the anchors sit high
in frame with their subject beneath, which is what `ground-views.ts` rule 3 asks
for.

**Four of them are ground poses.** `cp_015` sits at eye height 1.95 - the gate
navmesh is flat at 0.130 and `world.eyeHeight` is 1.8288 - so arriving at S01 or
S02 puts the operator standing at the lane. `cp_016` (4.7), `cp_013` (7.3),
`cp_017` (13.7) and `cp_018` (15.0) are all low over their subjects rather than
aerial.

**Two consequences of the list, both deliberate:**

- **S01 and S02 share `cp_015`.** The list pairs both with it. One viewpoint was
  authored at the gate and both anchors are within 15 units of it, so the two
  rows land on the same shot and differ only in which card opens. Separating
  them would mean authoring a second gate CP, not editing the mapping.
- **S07 and S08 keep `cp_005` and `cp_010`** - L05's and L10's own cameras, at
  152 and 425. No security CP was authored for either, and the list says so
  rather than leaving them unassigned. They are instruments rather than places,
  so an overview shot is defensible; neither was framed for them.

**The drop was checked before it was trusted.** `hs-v5 (1)` also carries
`hs_001` to `hs_030`, and all thirty match `hotspots[]` to 4dp - the only
available proof that a new export is in the same authoring space as the file it
is about to be written into. Its eight security anchors are byte-identical to
what was already in `v5.json`, so this drop moved nothing; only the cameras
changed.

### S01 and S02 stand on the ground, on the truck's right

The 38-and-20-down rule frames an anchor from the air, and the gate pair's
subjects are a barrier arm and a portal at head height. Both are authored as
**standing views from the truck's right**, to the three rules in
`ground-views.ts`, because it is the same kind of shot - one object at human
scale, seen from beside it:

- **Eye height, exactly.** The gate navmesh is flat at Y `0.130` and
  `world.eyeHeight` is `1.8288`, so a standing eye is at **1.9588**. L08 is
  `walkable: false`, so `goToHotspot` lands on the authored Y untouched - it has
  to BE the eye height, not a foot height. This is the opposite of
  `ground-views.ts`, which stores foot Y because its own path probes the mesh.
- **Which side is "right".** The lane runs along Z and traffic moves +Z (H21's
  verified ground pose stands at Z 225.5 and looks up it at yaw -3.1377). A
  truck facing +Z has its right flank toward **-X**, so the camera stands at -X
  of the anchor. X is pinned to **-773.5** for both, the one X at this gate
  verified to be on the walkable corridor, so they stand where a person could.
- **They are 9 units apart**, which is the only thing separating the two shots -
  and that is enough, because they look at different subjects: S01 at the arm
  just above eye level, S02 up 8 degrees at the gantry anchor 4.5 m overhead.
- **Sun: behind, not raking.** `sunDot` is about -0.98 here against the table's
  -0.55 target. Putting it on target would need the camera swung round to almost
  square across the lane, which shows the barrier arm end-on. The side was asked
  for explicitly, so the side wins and the light is flat-bright rather than
  modelled.

The other six are still framed from the air. Any of them whose subject is at
human scale wants this treatment instead.

### Two kinds of anchor

The layer splits on a line the code already names, `isFieldHotspot`, and the
spec names it too — in their own §4 placement instructions:

| | S01-S06 | S07 / S08 |
|---|---|---|
| What it is | a place on the terminal | an instrument the demo is driven with |
| Its card holds | a field grid of readings | S07: tabs, filters, a day's records · S08: capability lines, counters, layer chips |
| Raises incidents | yes | no, it receives them |
| Listed in | the Resources tree, under "Security" | nowhere — see §3 |

Whichever list a row is picked from, it travels through the same
`goToHotspot` an operational row does. That already went to a hotspot's own
camera with a fallback to its layout's, which is exactly what a CP is — so
authoring the cameras above is what makes a security row land on its own
viewpoint rather than its layout's wide shot. Two lookups had to learn about the
second table, both one line:

- `poseForHotspot` (`config/index.ts`) — `hotspotById[id] ?? securityHotspotById[id]`.
- `goToHotspot` (`use-layout-navigation.ts`) — the same fallback.

A security row has **no walk affordance**: `GROUND_VIEW_BY_HOTSPOT` is authored
for operational resources only, so there is no ground standpoint to offer.

### The six logical layers

S08's Expected interaction is the only one in the spec that asks for a
**control** rather than a readout:

> "Security Mode toggles logical layers: ACCESS, CARGO, WATERSIDE, ANALYTICS,
> GEOFENCES, INCIDENTS. Selecting a category highlights only demo
> entities/events in the 3D model."

So Security Mode is not a single switch. It is six filterable sub-layers, and
the toggles live in S08's own popup because that is the hotspot the spec
attaches them to. All six are on at rest; a presenter narrows from there.

| Category | Hotspots |
|---|---|
| ACCESS | S01 (AI Access Control) |
| CARGO | S02 (Container Security Screening) |
| WATERSIDE | S03 (Waterside Perimeter Monitoring) |
| ANALYTICS | S04, S06 (Video Analytics, Anomaly / Unattended Object) |
| GEOFENCES | S05 (Restricted Area / Geofence) |
| INCIDENTS | S07 (Incident Management) |

`CATEGORY_BY_HOTSPOT` in the store holds that mapping. It lives there, not in
the site file, because a category is a property of the layer rather than of the
model.

**S08 has no category.** It hosts the switches, so filtering it out would take
away the control being used. A hotspot with no category is never hidden. S07
does obey its `incidents` filter, so only S08 is permanently on screen.

`isolateCategory` implements "selecting a category highlights only" literally:
it turns the others off. Selecting the one already isolated puts them all back,
so a single click both focuses and clears.

---

## 5. Rest state vs event state

**Everything is authored at its resting state**, because §5 step 1 opens the
demo with all systems NORMAL and nothing detected. Check any reading against
that before editing it.

The catch is that the spec's §4 tables are not consistent about which state they
show, so they cannot be transcribed wholesale.

**Verbatim, because their tables already describe rest:** S01, S02, S03, S05.
Each Expected interaction describes the event as a *change from* the table
("changes credential/authorization to DENIED", "changes violations to 1"), which
is what makes the table the before.

**Held back, because their tables show mid-demo:** S04, S06, S07, S08.

### What is on screen, and when

One component decides it for both layers, `scene/hotspot-markers`. In order:

| | |
|---|---|
| **Dollhouse** | nothing. The component is not mounted - `scene/index.tsx` gates it on `viewMode === "firstPerson"`, because from the air the beads are specks over the model. |
| **On the navmesh** | whatever is within `NEARBY_UNITS`, **from both tables**. |
| **A resource picked** | that one disc, pulsing. |
| **At a layout's checkpoint** | every resource filed under it. |
| **Otherwise** | nothing. |
| **Then, always** | the enabled security anchors are added on top of whichever row won. |
| **Last of all** | the one marker whose card is open comes down, from either table. |

**The Security row unfolds the menu; it does not travel.** Its anchors sit at
five different layouts, so there is no one pose the row could mean. It briefly
flew to L10's viewpoint and drew the whole set from there; that is gone, along
with the store flag and the marker branch behind it, rather than left as a flag
nothing sets and a branch nothing enters.

So a security marker reaches the scene three ways: **picked by name** from the
unfolded list, **walked past** on the navmesh, or — for any enabled anchor —
**unconditionally**, via `alwaysOn`.

**THE ENABLED SET IS ALWAYS UP.** S01-S06 carry no `enabled` flag; S07 and S08
are `enabled: false`. Those six are unioned into the marker set after every rule
above has run, so the narrowing to a picked disc cannot take them down. Before
this, opening S01 hid its own marker AND S02 — the layer went dark on the click
that was meant to demonstrate it. This is wider than §8 and is a deliberate demo
choice: the security anchors are what v5 exists to show.

**Six discs now, not two.** Turning S03-S06 on put four more anchors into
`alwaysOn`, so first person carries a disc at the quay, the central yard, the
crane corridor and the southern yard at all times, however far off. They draw at
a constant screen size, so a distant one is a speck rather than a billboard -
but the rule reads as "what is near you" and is not, and six is the number to
have in mind before adding a seventh.

**THE OPEN CARD'S OWN MARKER IS THE ONE EXCEPTION, AND IT IS THE LAST WORD.**
A bead pulsing behind — or under — the panel it just opened is the marker
arguing with its own card; S01's sits directly beneath it. So the id whose
popup is open is removed **after** the union, not before it. Applied before, as
it first was, the union on the next line put it straight back for exactly the
two anchors it mattered most for, and opening S01 left S01's bead up through
its own popup.

One filter, one place, **both tables**: an operational hotspot's marker and a
security anchor's come down by the same rule, for any popup. It takes down one
id — the one whose card is open — so the other half of the pair, and every
operational marker in reach, stay where they were. That is what `alwaysOn` was
protecting, and it still does. Restored on `setHotspotInfo(null)`.

**ON THE MESH WINS, and it is the second test for a reason.** However the
operator got down there - a resource's ground standpoint, the First Person
button, a walk from the map - they are free to move, so what is AROUND them is
the only useful answer and the list's one ("the layout I arrived at") has
stopped applying. Every branch below it describes an aerial camera, where
proximity means nothing.

**"First person" is not the test.** Every layout camera is `walkable: false` and
sits 20 to 180 units up, and the view from one is still first person. The check
asks the mesh itself: `probeFloorY` returns the surface under the player's feet,
or null off the mesh, and the set is populated only when the feet are within
`GROUND_EPS` (1.5) of it. That is the same rule `isFlyLayout` reads off
`walkable` in config - a pose is aerial or not by where it IS - asked of the
live position rather than the authored one.

- **Security anchors are in the set.** Walking past the gate reader should show
  the gate reader; a layer invisible unless asked for by name is a layer the
  operator has to already know about. This is the one case where the two layers
  draw together, and it is deliberate - proximity reports what is physically
  there, not which layer is being demonstrated. S07 and S08 are excluded: they
  are instruments, not places, and walking near L10 should not put the incident
  log on a stick in the yard.
- **A selection does not survive the ground.** Arriving at a resource's ground
  standpoint selects it, and on an aerial camera that would narrow the scene to
  one disc - but the whole point of standing there is to look around, so on the
  mesh the surroundings win and the selection is left to the pulse.
- **`atGroundView` no longer decides anything here.** It used to blank the
  markers while standing at a ground standpoint, which now contradicts the rule
  above: the operator is on the mesh, so they get their surroundings.
- **150 units, sampled four times a second.** The gate's three hotspots sit
  15-25 apart and a yard's about 50, so 150 puts a handful in reach without
  turning the walk into a field of beads. One piece of state holds both "on the
  mesh" and "what is near", so the two can never disagree, and it is written
  only when the set changes - never per frame.

### The card on a phone

Two viewport problems, two variants, because a card tuned for one is wrong for
the other:

- **`short:`** - a LANDSCAPE phone. Width is fine, height is gone. It was
  already there: the card scales to 0.85 and every row loses a couple of pixels.
- **`max-sm:`** - a PORTRAIT phone. Height is fine, width is gone. This is new.

Below `sm` the card comes in on every axis:

| | full | phone |
|---|---|---|
| width | `min(620, 100vw-32)` | `min(340, 100vw-40)` |
| height cap | `min(80dvh, 100dvh-32)` | `72dvh` |
| padding | 24 | 16 |
| corner | 14 | 12 |
| title / subtitle | 18 / 13 | 15 / 11 |
| field label / value | 10.5 caps / 18 | 10 caps / 15 |
| row padding | 9 | 6 |
| alert title / detail | 11 caps / 14 | 10 caps / 12.5 |
| column gap | 32 | 20 |

`PanelHeader` is shared with the destination panels, which are the width of the
flap and have the room, so the compaction is an opt-in **`dense`** prop that only
this card passes. The thumbnail stays hidden below `sm` - turned 13 degrees and
shrunk to phone width it stops being legible, and the readings are what the card
is for.

### The readings carry their own legibility, not the panel

`NAV_GLASS_PANEL` is 52% dark over a backdrop the shared recipe *brightens*
(`brightness(1.05)`). At the truck gate S01 and S02 stand under a midday sky,
and against it the card's rows sat on daylight: the 60%-white label tier
vanished and the green status words lost their tone.

**The type-only answer was tried first, and it did not carry.** A darker ground
was rejected once - it read as frost rather than glass, and made the one
surface covered in readings the heaviest thing on the overlay - so the
legibility was pushed into the type: labels up to `--nav-text-2`, sizes up,
and `CARD_TEXT_SHADOW` on every glyph.

Composite the numbers and that was never going to be enough. `rgba(9,11,15,0.52)`
over a bright daylight view resolves to **`#65686d`**, a mid grey, and on it:

| over bright sky | before | after |
|---|---|---|
| a white value | 4.74 | **6.59** |
| a red value | 1.70 | **3.52** |
| DANGER on its own banner | 1.96 | **3.63** |

**The tint is not the lever - the backdrop is.** Raising the tint to 84% was
tried and it did read as the frost the first reversal warned about. The fault
was never the 52%; it is `--ui-glass-brightness: 1.06`, which *brightens* what
is behind the panel. Frosted glass does the opposite. Real frost over a bright
scene comes back dark, and the shared recipe was pushing a daylight view up
before the tint ever got to it.

So the card keeps a translucent `rgba(9,11,15,0.48)` and takes its own
backdrop, `CARD_FROST` = `blur(30px) saturate(150%) brightness(0.78)`. The
30px blur is the other half: at 10px the containers and cranes behind the card
stayed legible as shapes, which is what made a panel of readings look busy.
Blurred to 30 they are colour, not detail.

**0.78, not 0.55.** Dimming to 0.55 was tried and came back too dark - the
panel stopped reading as glass and started reading as a slate. 0.78 is the
lightest setting where the tone words still carry, and it is the one number to
move if the balance is wrong: **down** darkens the panel and lifts every
contrast in the table below, **up** lightens it and costs the red first.

| scene behind | 52% + `brightness(1.06)` | 48% + `brightness(0.78)` |
|---|---|---|
| bright sky | `#6a6e73` | `#55585d` |
| green yard | `#35442d` | `#2b3725` |
| dim view | `#131820` | `#10141a` |

It is still glass - the scene moves behind it and its colour still comes
through, which is why the yard panel is green and the sky panel is neutral. It
just stops setting the contrast.

The type work stays and now has a ground to sit on:

| | before | now |
|---|---|---|
| label | 12.5px sentence case, `--nav-text-2` | 10.5px caps, 0.1em, `--nav-text-faint` |
| value | 17px semibold | 18px bold |
| row padding | 7 | 9 |
| shadow | `CARD_TEXT_SHADOW` | unchanged |

Labels went **down and dimmer** rather than up. With a stable ground the label
no longer has to fight for itself, and a small caps label under a big bold value
reads as an instrument panel - which is what a card of readings is - instead of
two tiers of similar prose.

**A different red, chosen for the frost.** `TONE_COLOR.alert` and
`SEVERITY_COLOR.HIGH` are **`#ff9b93`**, a coral measuring 3.52 / 6.18 / 9.11
across the three scenes above, against `#ff5c5c`'s 1.70 on the old panel.
A deeper red cannot win here: the panel is translucent by design and stays
light, so the ink has to come up to meet it rather than the ground going down
to meet the ink. That is also why the red got lighter again when the frost did
- the two move together, and the red is the reading that runs out first.

**The banner is a gradient now**, `rgba(182,44,34,0.52)` fading to `0.16` left
to right, with a 4px bar and a 1px inner ring. The flat 22% wash over the old
glass was resolving to a dusty `#795d5e` - closer to mauve than to a warning -
and the fade gives the strip a direction so the bar, the icon and the word sit
at the solid end. Its two lines also swapped weight: the level is now the small caps
kicker and the sentence is the 14px line, because *what is wrong* is the part
worth reading.

`CARD_TEXT_SHADOW` is `0 1px 2px rgba(0,0,0,0.85), 0 0 6px rgba(0,0,0,0.45)` -
a tight plate under each glyph and a wider halo around it. Set **once, on the
card's root**, and inherited: `text-shadow` is an inherited property, so the
header, the alert banner, the journey rows, the incident tables and the field
grid all take it from one declaration and nothing has to remember to opt in.
The nested incident-log dialog sets it on its own root the same way.

**On a translucent panel the shadow is what carries contrast, not the colour.**
The first attempt was a plain offset drop on the field rows only, and it was
enough for the white values and not for the tone words: green `#30d158` over
pale glass has no edge, and an offset shadow does not give it one. The halo
does. This is also why the palette was left alone - over a backdrop that runs
from dark water to a white sky there is no single colour that holds, so the
edge has to come from somewhere other than the fill.

Phone variants moved up with the sizes; see the table above.

### Animation: what runs, and when

The terminal's baked clips live in `animated.glb`, lifted out of the chunk set at
bake time and permanently resident. `ChunkManager` owns the one mixer. Three
rules decide when it moves, and they are all about WHEN rather than what:

| | |
|---|---|
| **Dollhouse** | nothing runs. Cranes swinging and water rolling from 180 units up is motion nobody asked for. **Paused, not stopped**, so first person picks the water up mid-wave instead of snapping it to frame 0. |
| **First person** | every ambient clip loops, except the three held set below. |
| **A hotspot picked** | if its config names a clip, that clip plays **once**, after its own beat. |
| **First Person pressed** | `ContainerIdle`, `TruckHaul` and `SceneTour` are released, 2.5s later. |

**THREE AMBIENT CLIPS ARE HELD UNTIL SOMEONE STANDS ON THE GROUND.**
`ContainerIdle`, `TruckHaul` and `SceneTour` are the terminal *working* - a
container shifting, a truck crossing the apron, the scene touring itself - and
the demo opens on a still yard. Running them from the first frame read as the
scene playing without being asked, over an overview nobody had walked into yet.

They stay in the loop set; `ChunkManager.setDeferredClips` only holds them
paused. `setDeferredRunning(true)` releases them, and both switches - the view
rule above and this one - are written in **one place**, `applyLoopPaused`, so
neither can overwrite the other. Empty by default, so v1 and v3 are unchanged.

| | |
|---|---|
| **armed by** | the bottom bar's **First Person** button, and only it. `armStandingAmbient` on `nav-ui-store` is called from `handleFirstPerson` - not from `enterGroundView`, which a resource's own ground standpoint also takes. |
| **beat** | 2.5s, measured from the CLICK. The teleport it starts happens inside a blackout, so a delay measured from the landing would run under the black; from the click it lands just after the picture returns. |
| **one-way** | leaving first person pauses them with every other ambient clip and coming back resumes them; it does not re-hold them. The terminal does not go back to being asleep once it has been woken. Only a store reset re-arms the hold, which is a fresh session. |

**THE BLACKOUT IS BOUNDED, so that beat holds.** First Person is the one
transition that passes `waitUntil: dressingSettled()` to `triggerFloorTransition`
- it holds the black until the streamer has stopped re-tiering, so the ground
does not sharpen in front of the operator. Two things kept that hold from ever
being satisfied, and the fade ran to the 8s `MAX_BLACKOUT_WAIT_MS` emergency cap
on every press:

- `dressingSettled` clocked itself from the CLICK, a fade-in before the teleport
  it is measuring. Its 350ms priming window was spent under the fade, so `peak`
  latched on the leftover backlog of the view being left - a handful - and
  `peak * 0.1` then demanded a near-total drain of the hundreds the teleport
  raises. It now clocks from its first poll, and gives up at `SETTLE_MAX_MS`
  (1.5s): the hold is a courtesy, not a load gate.
- `ChunkManager.retierBudget` is 2 swaps/tick - deliberately small, because a
  re-tier costs a decode against a live frame. Under a blackout there is no live
  frame, so a camera jump over `JUMP_METRES` (50, further than any walk covers
  in one tick) now raises `retierBurst` and the backlog drains at
  `maxLoadsPerTick` for 30 ticks.

Together the press is ~2s of black rather than ~10, which is what the 2.5s beat
above was written against.

**The list is NAMED, not derived**, which is the one place this document's own
rule bends. The one-shot set is derived because a hotspot already declares its
clip and a second list could disagree with it; there is nothing to derive this
from. It is a demo choice about which three of the bake's clips are "the
terminal working", and it lives as `STANDING_AMBIENT` beside the animation rules
in `scene/model-loader/streamed-model`.

**"Reached home" is the first-person landing.** Home is where first person
begins, so the ambient loop starting there falls out of the view rule rather
than needing one of its own - and stopping the waves again the moment the
operator walks away from home would read as a bug, not a rule.

**The one-shot set is DERIVED.** `HotspotConfig.animation.clip` names a clip; any
clip a hotspot claims is a one-shot, and everything else in the bake is ambient.
There is no second list of "clips that must not loop", because two lists are two
things that can disagree.

**S01 and S02 both carry
`{ clip: "GateSequence", delaySeconds: 2, repeatSeconds: 6 }`** - they
are the two halves of the same gate, so they show the same sequence. Picking
either one runs **stop, then the beat, then play from the start**:

1. **Stop immediately and unconditionally.** Picking a hotspot that owns a clip
   ends whatever that clip was doing at the moment of the click, so a gate
   caught half-open shuts rather than carrying on through the pause. `stop()`
   rather than a fade, because the rig has to be back at frame 0 for the replay
   to be the sequence rather than a jump-cut into the middle of it.
2. **Two seconds.** The camera lands, the card opens, and then the gate moves.
   Without the beat the event is over before the blackout has lifted.
3. **From frame 0**, holding its last frame.
4. **Then again**, six seconds after it ends, for as long as the hotspot stays
   selected. GateSequence runs 39.5s, so the cycle is about 45s - a slow
   heartbeat rather than a loop.

**The trigger is the SELECTION, not the card.** Travelling to a hotspot
deliberately leaves its card closed - arriving should leave the operator looking
at the thing - so an event keyed on the popup would never fire for someone
standing at the viewpoint watching the terminal. It is keyed on being parked at
that hotspot's CP, which is what `selectedHotspotId` means, and it survives the
card being opened and closed.

**The repeat is scheduled from the clip's own duration**, not by listening for
the end of it. The length is baked and fixed, and a timer is one thing to cancel
instead of two. `clipDuration()` reads it off the action.

**It does not run in the dollhouse.** A selection made in first person survives
the view swap, so without that check a repeat timer would fire the gate over an
overview that is supposed to be still.

**Walking ends it.** `selectedHotspotId` means *parked at that resource's
viewpoint*, and taking one step makes that false - so the movement poll in
`overlays.tsx` now drops the selection alongside the open card, the open panel
and `atGroundView`. It was already tearing down everything else that means "I am
standing here looking at this"; the selection was the one it missed, and the
repeat is where it showed - the gate kept re-firing behind an operator who had
walked half the terminal away from it.

That also corrects two quieter wrongs: a card's "2 of 8" counted against a
resource nobody was at any more, and the debug panel treated it as the live
camera target long after the camera had left.

Two consequences worth naming:

- **Picking S02 while S01's gate is running restarts it** rather than stacking a
  second playback on the same rig. One clip, one rig, one playback.
- **Picking the row you are already on re-fires it.** `selectionSeq` in the nav
  store ticks on every pick, including a repeat, so the effect re-runs. Keyed on
  the id alone it would ignore the second press, which reads as the row having
  stopped working.

The timer is cleared on any change of selection, so moving on before it fires
cancels it rather than playing the gate at whatever is being looked at next.

Four things about the mixer that are easy to get wrong, and are handled:

- **A clamped one-shot still reports `isRunning()`.** It is sitting on its last
  frame with no cycle left, so the mixer's `finished` event is the only honest
  signal that one has ended. `isClipPlaying` reads that, not `isRunning`.
- **A one-shot must be `reset()` before replaying.** Without it the second
  trigger does nothing at all, which reads as the button having broken.
- **`clampWhenFinished` on the one-shots.** A gate that finishes opening and
  then snaps shut is worse than one that stays open.
- **Names are matched loosely** - case, spaces, underscores and hyphens ignored
  - and a name matching no baked clip is warned about, with the bake's actual
  clip list in the message. Silence there is indistinguishable from an
  animation that was never authored.

**/v5 streams v9; /v3 stays on v8.** The bake is `portla-c5-v9o-inst-mo`,
published at `.../la-port/v9w-inst-mo/assets/` and pointed at by
`NEXT_PUBLIC_STREAM_BASE_V4` - which wins outright over `stream.slug`
(`config.ts > assetBaseFor`), so the slug in the site file is a label, not the
URL. `NEXT_PUBLIC_STREAM_BASE_V3` is a separate variable and was not touched.

**v9's clips**, per its manifest: `GateSequence`, `ContainerIdle`, `CraneCycle`,
`CraneCycle2`, `TruckHaul`, `SceneTour`, `WaterWaves`. v8's umbrella
`AllAnimations` is gone and `WaterWaveLoop` was renamed, so a v8 bake and a v9
bake do not share a single clip name except by accident - **which is why this
only comes alive on v9.** Pointing /v5 back at a v8 base would leave
`GateSequence` matching nothing, and the console would say so.

**The policy is applied when the manager is BORN, not only when it changes.**
`mgr.current` is null on mount - the `ChunkManager` is built inside an async
effect, after three JSON files have landed - so an effect that pushed the policy
only on change would push it into nothing and never run again on a session where
the view never changes. A `managerBorn` counter ticks when one exists and
re-runs the effect against it. Without that the whole feature is silent, and
silently: every clip would simply loop, which is what it did before.

**The stills are fetched up front.** `StillPreload` renders every authored
`image` off screen, in a 1px clipped box, as the app loads. A 600 KB cut-out
requested only when its card opens arrives after the card does, so the panel
draws, sits empty and fills in - which reads as the card being slow rather than
the image being late. It renders **the same `<Image>` at the same `sizes`** on
purpose: `next/image` rewrites the src into `/_next/image?url=...&w=...&q=...`,
so what lands in the cache is keyed on the variant the optimiser produced, and
preloading the remote PNG directly would warm a URL the card never asks for.
It is clipped rather than `display: none`, which browsers may treat as "not
needed" and skip.

**Defaults keep v3 and v2 untouched.** With no clip claimed, every clip loops and
plays the moment `animated.glb` lands, which is exactly what `ChunkManager` did
before. Only v4 and v5 call `setOneShotClips` and `setLoopsRunning`.

### The still stands in the card as a turned plane

`HotspotConfig.image` is a URL under `public/`. When a hotspot has one, the
popup puts it **inside the card, beside the readings, turned 13 degrees off the
screen** with its far edge pinned - a surface with depth rather than a picture
lying flat on the panel. The card keeps its ordinary 620 width and nothing hangs
outside it.

| | |
|---|---|
| S01 | `…/v9w-inst-mo/assets/security-thumbails/scanner-red-v3.png` - arm down, lamp red |
| S02 | `…/security-thumbails/scanner-green-v3.png` - the scanner alone, lamp green |

**They are remote, published beside the baked assets** rather than shipped in
`public/`, which needs two things:

- **`images.remotePatterns` in `next.config.ts`**, or `next/image` throws
  "hostname is not configured" and the card renders empty. It is scoped to
  `/holotwin.mixie.co/**` rather than the S3 host: `/_next/image` re-serves
  whatever it is pointed at, so a `**` pattern on a shared host turns this app
  into an open image proxy for every bucket on it.
- **Knowing they live inside a BAKE's asset folder.** `security-thumbails/` sits
  under `…/v9w-inst-mo/assets/`, so a re-bake that republishes that prefix can
  take the thumbnails with it. They are UI, not model output, and nothing in the
  bake pipeline knows to preserve them. If the cards ever come up empty after a
  re-publish, this is why.

**Each is cropped to its own subject**, not to a shared box. They no longer hold
the same objects: S02 is the gantry and the truck with no barrier, S01 the truck
and barrier with no gantry (it did not survive the key, and a faint red remnant
of it is still in the file at about alpha 5). A shared box would give S02 a large
empty margin where S01's barrier sits. The cost is that the two are at different
scales - the figure is a fixed 5:4 box with `object-contain`, so each sits whole
inside it and the transparent padding is invisible.

**THE FILENAMES CARRY A VERSION, and that is deliberate.** `next/image` caches
optimised output under `.next/dev/cache/images`, keyed by the source URL - so
replacing a file in place and reloading serves the OLD picture. Three identical
re-sends of the same render were spent on this. Changing the image means
changing the path: bump the `-vN` suffix rather than overwriting.

**THE READINGS WRAP UNDER IT AT ROW FIVE.** The still's box is 200px tall,
which is four field rows. Beside a single column of readings that was fine for
S01, which authors exactly four - and wrong for S02's seven, which ran the
column down past the picture and made the card half again as tall as its own
image against an empty third of the image column. So **four go beside the still
and the rest wrap underneath in two columns**. S02 is four rows and two, and the
card is shorter than the picture in it rather than taller.

**It is ONE grid, not two blocks.** The still is a grid item placed at
`gridColumn: 1, gridRow: 1 / span FIELDS_BESIDE_STILL` and the readings simply
auto-flow around it: column 1 is taken for four rows, so the first four land in
column 2 beside the picture and the fifth starts a new row in column 1. Built as
two stacked blocks it looked right and aligned wrong - the lower block's columns
began at the card's edge and at its own midpoint, and neither lined up with the
column beside the picture, so Security Exceptions sat 30px right of the four
readings above it. One grid means one pair of column edges for every row.

The span is a count, not a measurement, because the box's height is fixed and
the row height is fixed with it - one number to change if either moves, and the
constant says which. Below `sm` the still is `display: none`, which takes it out
of the grid entirely, so the readings collapse to a plain column with no gap
where it was.

**S01's image and S01's readings disagree.** The card says GATE OPEN and STATUS
CLEARED; the render shows the arm down. The rule that keeps `alert` honest
applies here too - a picture and a field grid on one card have to be saying the
same thing - so either the readings move to a held state or the image does.
Flagged rather than fixed, because the four values were specified directly.

Eight layouts were drawn at size before this one. The first four treated the
render as an **image** - a bordered rectangle on a card, at four sizes and
positions. The second four treated it as a **view**. This is the eighth.

- **The stills are CUT-OUTS, and that is what makes the turn work.** The renders
  are transparent everywhere except the gate itself - 74% of the source file -
  so a turned plane has no frame to give the trick away, and there is no
  background, border or radius anywhere in the treatment.
- **No shadow.** The turn is doing the work. A shadow under a cut-out only
  re-draws its silhouette in grey behind it, and a `box-shadow` would be worse
  still - it would draw the rectangle the image does not have.
- **Trimmed to the subject.** Both were cropped to `(428, 177, 2469, 1474)` -
  the UNION of the two subjects' bounding boxes, because these two renders no
  longer contain the same objects: the closed-barrier one has no gantry (only a
  fragment of its red lamp survives the key) and the green one has no barrier
  pedestal. One box keeps them at the same scale and position anyway, so
  switching between the cards moves only the state -
  then resized to 1200 x 763. Alpha is preserved; **never flatten these onto a
  background**, which is what turns them back into photographs.
- **250 wide, `object-contain`** against their own 1200/764.
- **The readings stack into one column** whenever a still is present, since the
  plane takes a third of the card's width. S01's four rows and S02's seven both
  read.
- **Hidden below `sm`.** Turned and shrunk to phone width it stops being
  legible, and the readings are what the card is for.
- **`next/image`, not `<img>`.** The lint config enforces it
  (`@next/next/no-img-element`), and `fill` is the form that works inside a box
  sized by aspect ratio.

What it gives up: the floating version that preceded it had the stronger depth
cue - overlap - but with a cut-out the card covered half the subject, and the
frame it needed cost the popup its shape. This keeps the card a card.

No operational hotspot has an image, and the field is optional, so H01-H30 are
untouched - they keep their two columns and no plane.

### The camera cards report the camera, not the empty event

S04 and S06 opened with **five and six of their eight rows saying nothing** -
None, em dash, em dash, NONE, NO ACTIVE EVENT. Section 4's tables are written
around an event, and with the event held back to rest what was left read as a
form that had failed to load rather than a camera reporting all-clear.

`HotspotField.eventOnly` is the fix: the row is authored, and rendered only
while an incident is open on that hotspot. `HotspotDataCard` filters on it in
both branches of the field memo. Nothing is deleted - `security-store.ts`
patches `detected_class`, `confidence`, `event_time`, `severity` and
`incident_status` by name across six S04 variants, and seven more names across
five S06 ones, so removing them would break the events before they are
reachable. The card **grows** when one fires, which is a better beat than a
card that was pre-filled with blanks waiting for it.

The space that frees goes to what an idle camera can actually report:

| | |
|---|---|
| **is my sensor blind** | `Feed`, `Analytics` - the question an operator asks first, and the card could not answer it. A camera reading ACTIVE that has not sent a frame in an hour is the incident. |
| **what it can tell apart** | `Classifies` - Person · Vehicle. The point of "AI Video Analytics" over motion detection, and the reason `Last Detection` can carry a confidence at all: a motion detector has nothing to be confident about. |
| **what it sees now** | `Vehicles Tracked`, `People Tracked` |
| **what it has seen** | `Detections (24h)`, `Last Detection`, `Alerts (24h)` |

**The counts are split by class, not totalled.** "Objects Tracked: 2" does not
say two of what, and in a yard aisle that is the whole question - two trucks is
Tuesday, two people on foot is the incident. Split, `People Tracked: 0` earns
its row while nothing is happening, which is exactly what the emptied event
rows failed to do.

**The classes are not invented.** Person, Vehicle and Person group are what the
store's S04 variants fire on - person in restricted zone, vehicle in pedestrian
lane, person on the quay edge, crowd forming. The card claims only what the
demo can raise.

**`Rules Armed` was authored and cut.** It read `4 of 4` - how many analytics
rules are live, the field that answers "the camera saw it, so why were we not
told". True, and it needed a paragraph like this one to land; a reading that
has to be explained is not a reading. Its removal is the same test the first
version of this card failed in the other direction.

### S03 looks out over the water, and is standing in an alert

**The camera is `cp_016`, and this paragraph used to say otherwise.** S03's
viewpoint was once derived from `cp_001`'s side - L01 Main Channel, at x -1732,
west of the anchor and looking east, so a waterside zone was being shown from
the water with the land in frame. A quay standpoint at
`[-1501.3038, 25.9564, 368.2249]` facing west was computed to replace it, and
that number outlived its own fix: `cp-v6` then authored a CP for the anchor and
the derivation stopped being the answer. See *The eight are AUTHORED, not
derived*. `cp_016` put it at `[-1534.0809, 4.6845, 430.6008]`, 11 units out,
yaw -31.6, the anchor 0.2 h / 1.2 v off centre - looking AT the zone from low
over the water rather than out across it from the quay.

**It now frames the whole story.** The spawn-derived pose could not: sitting at
z -60 and looking up the +z axis, EVER LEGACY at z -112 and the zone's southern
corners at z -457 and -510 were all **behind the camera**. The card claims three
craft - two authorized, one not - and the shot held one of them.

```
position  [-1777.6, 60.0, 627.2]
rotation  [3.0374, 0.591, -3.0834]        XYZ, = YXZ [0.0864, 2.548, 0]
```

600 units out from the centroid of everything that has to be in frame, on a
bearing of 124 degrees, 60 up, aimed at `(-1442, 8, 130)`. That is **208 units
to the right** of the old sightline and 794 further along it.

| in frame | distance | horizontal | vertical | side |
|---|---|---|---|---|
| unauthorised craft | 232 | +6.3° | -12.4° | right |
| zone corner A | 322 | +16.4° | -10.3° | right |
| zone corner D | 295 | -4.7° | -11.2° | left |
| Berth 226 | 666 | +3.9° | -4.2° | right |
| EVER LEGACY | 889 | -0.3° | -3.2° | left |
| zone corner C | 1279 | -6.7° | -2.6° | left |
| zone corner B | 1285 | -1.6° | -2.6° | left |

Against half-angles of 30 horizontal and 17.5 vertical at `world.fov` 35, so
every one clears with room. The unauthorised craft is nearest and on the right,
the zone runs away down the middle, and the two berthed vessels sit beyond it -
2 authorized and 1 not, which is what the readings say.

**The standoff was solved, not chosen.** Nine points - four zone corners, three
vessels, two corners of the craft's own box - swept over bearing, height and
distance for the tightest camera that holds all nine inside 28 x 16 degrees with
nothing nearer than 200 units, so the near craft cannot swallow the frame.

**Watch the euler order when re-authoring this one.** `cameras.spawn` stores
**YXZ**, because it is applied directly; `securityHotspots[].camera` stores
**XYZ** and `poseForCamera` reorders it. Pasting spawn's stored triple into the
hotspot block would have been reordered a second time and canted the horizon.
The XYZ equivalent is the one spawn's own `_note` records from `/extract-pos`,
and it round-trips through `xyzToYxz` back to `[0.0488, 2.9080, 0]`.

Which way the water is, from the file rather than by assumption: L01 stands at
x -1732 and looks east; the operational hotspots run x -1397 to -693; the
navmesh stops at x -1500.1. Everything west of that is water, and S03's anchor
sits 28 units beyond the edge with its CP 34 beyond - both off the walkable
world, which is right for a zone that is on the water.

**The readings are what is in the shot.** Three craft detected, two
authorized, one not:

| | label | |
|---|---|---|
| `zone_id` | Zone ID | WS-01 |
| `zone_status` | Zone Status | ALARM *(alert tone, red)* |
| `detected_watercraft` | Craft Detected | 3 |
| `authorized_watercraft` | Authorized Craft | 2 |
| `unauthorized_watercraft` | Unauthorized Craft | 1 *(alert tone, red)* |
| `event_severity` | Severity | HIGH *(alert tone, red)* |

**The counts answer to the scene, not to the spec table.** Section 4 gave
4 / 3 / 1 and the card carried it verbatim while nothing was drawn. With the
zone up at `cp_016` the shot holds two authorized craft and one extra, so the
readings are 3 / 2 / 1 - and 2 + 1 = 3, which is the arithmetic anyone reading
the card will check first. The labels name the subject for the same reason:
"Authorized" alone next to a restricted-zone hotspot reads as people.

The field `name` keys are untouched - `security-store.ts` patches
`detected_watercraft` by name in four S03 event variants, so renaming them
would break the events before they are even reachable.

`HIGH` and `ALARM` are both already in `<site>.json` > `tones.alert`, so the red
comes from the tone table rather than from anything hard-coded, and the status
flag rule upper-cases them.

**The count that is wrong is red as well, and that needed a rule change.**
`unauthorized_watercraft` is an `integer`, and a number matches nothing in the
tone table, so it carries `tone: "alert"` in the file. Nothing else in v5 does -
`Field` and `valueColor` only coloured an `enum`, so an authored tone on any
other type was accepted and silently ignored. A tone the file PUTS ON a field is
a deliberate statement, so it is now honoured whatever the type; a tone DERIVED
from the word table still reaches only an `enum`, which is what keeps a sentence
containing "Active" from being recoloured. The same change lights **S08's
severity counters**, integers carrying a tone `commandViewFields` computes,
which had never been able to show it.

**The banner.** `HotspotConfig.alert` is a standing state, not a fired event -
the layer has no triggers. It renders **first in the card body, above every
reading**: a card whose numbers say something is wrong should say so in words at
the top, not leave the operator to infer it from a red row halfway down a grid.
S03 carries `level: "danger"`, titled **DANGER**, detailing *"Unauthorized
watercraft inside the monitored zone"*. The accent bar and icon carry the
colour, so the panel behind stays the same glass as every other card.

**It is a component, `AlertBanner`.** The level was being branched on four
times over - background, border, icon, heading - to say one thing, so it is
resolved once into `ink` and a wash and the branch is gone.

**The heading was the smallest type on the card.** 12.5px, under field labels
at 12.5 and field values at 17: the one line saying something is wrong was set
below everything it was warning about. It is 14px now, and the sentence under
it moved from `--nav-text-2` to `--nav-text`, because what is wrong is primary
content and not a caption.

**The fallback IS the colour.** `--tone-alert` is not defined in any
stylesheet, so `TONE_COLOR`'s fallback is what actually renders. v3 and v1 keep
their own copies of that table and are unaffected by anything here.

**One red was two jobs, and the dark one could only do one of them.** v5 ran
`#c0342b` rather than the `#ff5c5c` the other routes use, on the argument that
on a glass panel a light red reads as a highlight and an alert should read as a
warning. That argument is right **about the surface** and wrong about the ink,
and the same value was doing both.

The card is glass at `rgba(9,11,15,0.52)`, so what sits behind a word is the
scene. Composite it and the panel runs from `#12171f` over a shadowed view to
`#65686d` over bright sky, and the banner's own 18% wash from `#311c21` to
`#755f61`. Against those:

| | dark end | bright end |
|---|---|---|
| `#c0342b` on the banner wash | 2.86 | **1.06** |
| `#c0342b` on the panel | 3.23 | **1.00** |
| `#ff5c5c` on the banner wash | 5.26 | 1.95 |
| `#ff5c5c` on the panel | 5.94 | 1.85 |

**1.00 is the word not being there.** Over bright sky the deep red is the same
luminance as the glass it is printed on, so DANGER, ALARM, HIGH and the
unauthorized count all disappear into the panel - on the one card in the layer
whose whole job is to be noticed. It fails at the dark end too, just visibly:
2.86 against 4.5.

`CARD_TEXT_SHADOW` cannot rescue it either. The halo is black, and a dark red
reads only 3.77 against black while `#ff5c5c` reads 6.94 - the shadow the card
already carries is built for light ink and was doing nothing for this.

**So the two jobs are split.** `TONE_COLOR.alert` is **ink** and goes back to
`#ff5c5c`, which is what v1 and v3 use, so one red means one thing across all
three routes rather than one per route. `ALERT_SURFACE` is the **wash** and
keeps the deep red, raised 0.18 -> 0.22 now that it is no longer sharing duty
with the text - which is what actually keeps the strip reading as a warning
block. Nothing is read off a wash, so it can afford to be dark.

**The two have to agree.** A danger banner over four green rows would be the
card contradicting itself, so `alert.level` and the fields' tones are authored
together or not at all.

### S04's popup is a picture, not a grid

`HotspotConfig.poster` - when a hotspot carries one the card renders it wide
(`min(1280px, 100vw - 32px)`) and the field grid is hidden. S04 carries
`/security/cam-04-analytics.png`, 1608x978.

**Because the composition already is the card.** The image holds the pole and
CAM-04, the coverage cone, two tracked vehicles boxed with `Vehicle · 89%` and
`Vehicle · 96%`, and the Yard Video Analytics panel itself. Rendering the field
grid under it would print the same ten readings twice.

It also closes the gap the field version could not. `Vehicles Tracked: 2`
described boxes that do not exist in the scene - S04's tracked-object animation
is still in §8 - so the one card whose subject is "what the camera sees" could
not show it. The poster shows it. The authored fields stay in `v5.json` behind
the poster, so removing that one key puts the grid back.

The card keeps its real header and close control; the panel inside the picture
is artwork.

### S06's popup is a picture too

`/security/cam-07-anomaly.png`, 1254x1254 - square, which is why `poster`
carries its own `width` and `height` rather than the card hardcoding S04's
ratio. CAM-07 on its pole over the southern yard aisle, a crate ringed in red
mid-aisle with **Dwell Time 00:12:37** against a **00:10:00** threshold, and
the panel reading FLAGGED FOR REVIEW.

S06's own `fields[]` are still authored at rest behind the poster, and the
picture shows a dwell breach. That no longer contradicts S08, because the store
now opens with the two incidents both pictures report - see below.

### S05 draws its corridor

The second `demo_zone_geometry`, and the same machinery as S03's:
`/models/la-port-zone-c5-crane-geofence-v1.glb`, one node `Virtual Geofence` at
`[-1279.66, 3.05, -25.32]`, 20 verts, authored in world coordinates. It is
emissive red in the bake like the water one, and `ZoneGeofence` repaints it
`#30d158` - nothing about S05 needed a line of code, only the `geofence` key.

**949 x 44 units, standing 6.1 high** - a long narrow corridor rather than an
area, which is what a crane rail run is. Corners
`(-1512, 389) (-1087, -459) (-1047, -439) (-1473, 409)`.

**Both the anchor and the CP are INSIDE it**, unlike S03 where the camera looks
at the zone from outside. `cp_013` stands at `[-1116.0, 7.3, -361.2]` and the
anchor sits 14 units away at `[-1122.3, 6.7, -348.7]`, both within the
footprint. Standing in the restricted zone is the right place to be shown it
from: the card reports four people inside and none in violation, and the
operator is one of the things inside the drawn limit.

### The unauthorised craft is world furniture

`SiteConfig.worldModels` - a list of GLBs mounted with the scene and never
taken down, authored in world coordinates like the geofence. v5 carries one,
`/models/la-port-zone-c5-unauthorised-ship-optimized.glb`: 1.6 MB, Draco
geometry and WebP textures, one node at `[-1627.84, -5.73, 450.37]`, 91
primitives over 91 materials and 38 images.

It is **not** gated on S03, which is the difference between it and the zone.
The craft is in the water whether or not anyone is looking at the waterside
hotspot; the boundary is an overlay that answers to the selection. That split
is also why the two are separate GLBs - the combined bake would have put the
ship inside `ZoneGeofence`, where the material pass would have painted all 91
of its materials green.

`WorldModels` takes the draco path, stubs `raycast` on every mesh, and refcounts
through `acquireGLTF`/`releaseGLTF` like every other loader here.

**IT DOES NOT SIT IN THE ZONE.** The hull's world box is
`x -1639.0..-1616.7, y -7.1..25.7, z 398.7..504.6` - 106 long, 22 wide - and
every corner of that footprint is outside the geofence polygon, the nearest by
**18.2 units** off the D-A edge. It reads as a craft standing off the boundary,
not one inside it, so S03's banner saying *"1 unauthorized craft identified
inside the monitored zone"* is contradicted by the thing it is describing.
Either the ship moves about 30 units south-east in the bake, or the sentence
becomes "identified at the zone boundary". Unresolved.

### S03 draws its zone

The spec's `demo_zone_geometry`, and the first of the two. `HotspotConfig`
gained an optional `geofence: { url }`; S03 carries
`/models/la-port-zone-c5-water-geofence-v1.glb`, 2 KB, uncompressed, served
from `public/` rather than the bake's S3 base because it is app furniture
rather than terminal geometry.

**The GLB is authored in WORLD coordinates.** One node, `Water Geofence`,
carrying its own translation `[-1360.48, -3.13, -43.72]`, so `ZoneGeofence`
mounts it at identity and nothing in the code positions it. 20 verts, 10 tris:
a four-cornered footprint extruded from y -11.82 to y +1.66, four walls and a
lid, no floor. Emissive at strength 2.5 over a base colour at alpha 0.28,
double-sided - a glowing translucent boundary.

**The colour is overridden, not re-baked.** The GLB is emissive red
`(1, 0.09, 0.06)`; `GEOFENCE_COLOR` sets both `color` and `emissive` to
`#30d158`, which is `tones.ok` - the same green a card sets a healthy reading
in, so the zone reads in the layer's own palette rather than a second red. It
is a UI decision over 20 verts of geometry, so it lives in code where it is one
line to change; strength, alpha and double-sidedness stay as authored. **It
does not track `zone_status`** - the card says ALARM while the zone draws
green, and if the zone is ever meant to answer to the reading, that is a rule
to write rather than a colour to pick.

| | |
|---|---|
| footprint | 984 x 116 units, 0.11 km², corners `(-1529, 422) (-1088, -458) (-1192, -510) (-1633, 370)` |
| standing proud | 1.66 above the node baseline; the other 11.8 is below, i.e. under the water |
| the anchor | sits **0.9 units from the near corner** - the marker is on the zone, not beside it |

**Two things it must not do, both set in a layout effect rather than in the
bake.** `raycast` is stubbed out on every mesh: the zone is a thousand units
long and passes between the camera and its own marker, so a pointer test
against it would swallow the click that opens the card. And `depthWrite` goes
off: one closed volume at alpha 0.28 with depth writes on means whichever wall
drew first hides the three behind it, and the box reads as a flat slab instead
of a boundary you can see into.

**It LOADS on that pick, not before.** `useGLTF` is called inside the inner
component, which is only mounted once a hotspot carrying a `geofence` is the
selected or open one, so nothing is fetched or parsed until S03 is reached.
Nothing preloads it either: the provider's idle preloader walks `floors[]`
`modelUrl` only, `StillPreload` takes `image` only, and `prefetchUrls` has no
callers. The refcount release runs the other way too - deselecting clears the
cache and disposes the scene, so a second visit re-fetches. At 2 KB that is the
right trade; a heavier zone would want the release held.

**It is keyed on EITHER route, because they are not the same one.** Picking
Waterside by name in the Resources tree sets `selectedHotspotId` and
deliberately leaves the card closed; clicking the marker sets `hotspotInfo` and
leaves the selection alone. `ZoneGeofence` takes `hotspotInfo ?? selected`, so
however S03 was reached the zone is up.

**Not gated on the view**, unlike the markers. A disc from 180 units up is a
speck, which is the reason `scene/index.tsx` mounts `HotspotMarkers` only in
first person. A zone a thousand units long is not a speck, and reads better
from the dollhouse than from inside it.

**What the authored viewpoint actually shows.** `cp_016` stands 9.7 units off
the near corner at eye 4.68, with the lid 3.0 below it:

| corner | out | lid, below eye |
|---|---|---|
| A (the anchor's) | 9.7 | 17.4° |
| D | 116 | 1.5° |
| B | 994 | 0.2° |
| C | 1001 | 0.2° |

So the short 116-unit edge reads as an edge in front of you and the 984-unit
length recedes to a line, with `fog.far` at 900 taking the far end anyway. That
is a boundary seen from a boat, which is defensible for a waterside zone - but
if the card's *four detected against three authorized* is meant to read as an
AREA, the shot wants altitude, and that is a camera change rather than a
geometry one.

### S01 carries four fields, not eight

The spec's §4 table for S01 lists eight. It is authored with four:

| | |
|---|---|
| `vehicle_id` | **Vehicle ID** · `TRK-48291` |
| `driver_credential` | **Credential** · Verified |
| `gate_state` | **Gate** · Open |
| `security_status` | **Status** · Cleared |

Four are deliberately gone:

- **`container_id`.** A vehicle access control point identifies a **vehicle**,
  which is why the field is `vehicle_id` rather than `truck_id` - the operational
  layer's own `truck_id` on H20 and H30 is a different field on a different
  table, and the two should not be confused for each other. The container is S02's subject, and S01
  carrying `EGHU4829136` too meant the same box appeared under two different
  capabilities as if each had read it.
- **`event_id`.** It was seeded `SEC-DEMO-0041` at rest, which is the id the
  first fired event would have been given - a card sitting at rest advertising
  an incident that had not happened. With no triggers at all it has no meaning.
- **`appointment_status` and `vehicle_authorization`.** Both restate what
  `driver_credential` and `security_status` already say at rest; three green
  rows for one fact.

The store's event definitions still name the removed fields in their patches
(`vehicle_authorization: "Denied"` and so on). Those patches match against the
seed by name and simply find nothing, and nothing fires them - but they are the
thing to update first if triggers are ever wanted back.

| | §4 table shows | Authored as |
|---|---|---|
| S04 | `PERSON`, 97%, `HIGH`, `ACTIVE` | `NONE`, no event |
| S06 | `UNATTENDED OBJECT`, dwelling 00:04:32 | `NONE`, no event |
| S07 | `SEC-DEMO-0042` already `INVESTIGATING` | no active incidents |
| S08 | `1 ACTIVE ALERT`, 2 incidents | all `NORMAL`, 0 |

The tell on S04 is that its `event_time` (`2026-09-15 14:42:18`) is the same
timestamp S07's incident carries. The spec's S07 incident **is** S04's
detection, and §5 step 2 has the presenter *trigger* it. A camera already
reporting it would start the demo at step 3.

Every displaced value is recorded in `_securityNote` inside `v5.json`, so the
event state need not be re-derived from the .docx.

Nothing triggers events yet. When that is built, the event state is applied
through `setHotspotFields`, not by editing the file.

---

## 6. Incidents

S07 is **a list, not a record.** The spec's own numbers require it:

- S08 reports `active_incidents: 2`, one HIGH and one MEDIUM, simultaneously.
- S01 "creates incident SEC-DEMO-0041"; S04/S05 create SEC-DEMO-0042. Both
  "forward the incident to S07".
- S07 is "the central incident card [that] **receives events from S01-S06**".
- §7 models the incident as its own object with `timeline[]` and
  `evidence_refs[]`, and gives the hotspot a `linked_incident_id`, a pointer
  into a collection.

So the §4 field table for S07 describes **one incident's detail**, not the card.

`useSecurityStore.incidents` is that queue, newest first, empty at rest. The
lifecycle follows §5 steps 6-7:

```
raiseIncident()        →  ACTIVE
acknowledgeIncident()  →  INVESTIGATING, acknowledged: true
escalateIncident()     →  severity climbs one step, CRITICAL caps
resolveIncident()      →  RESOLVED
```

Resolved incidents stay in the list (§6 requires "Event retained in
timeline/audit history") but count as closed.

### Triggering events

**There is no trigger control on screen any more.** S08's popup carried a
*Trigger demo event* button, bottom right, opening a two-step picker over the
card. It came out when the command view was rebuilt. Every card in the layer is
authored standing in its working state — S03's alert included — and nothing else
in the build can raise an incident, so a button that fired events was the one
control on screen contradicting the rest of the layer.

The machinery is untouched in the store: `SECURITY_EVENT_GROUPS`,
`triggerEvent(eventId)`, `firedEventIds` and `resetToSeed` all still work, and
the definitions below still describe what each hotspot can report. Restoring the
button is a component plus one line in the card.

**Until then the queue only ever empties.** The fifteen closed records read, and
a live incident can still be acknowledged, escalated, de-escalated and resolved
— but none can be created, so a run that starts at rest stays at rest.

**24 variants across the six field hotspots**, and the counts are deliberately
uneven, because what each one can detect is:

| | Variants | Severities |
|---|---|---|
| S01 Access | 4 | LOW, LOW, MEDIUM, HIGH |
| S02 Cargo | 4 | LOW, MEDIUM, HIGH, CRITICAL |
| S03 Waterside | 4 | LOW, MEDIUM, HIGH, CRITICAL |
| S04 Analytics | 6 | LOW, LOW, MEDIUM, MEDIUM, HIGH, HIGH |
| S05 Geofence | 2 | HIGH, CRITICAL |
| S06 Anomaly | 4 | LOW, LOW, MEDIUM, HIGH |

S04 has the most because a yard camera running continuous analytics sees the
most; S05 has two because a geofence around a crane corridor answers one
question. S05 has no LOW at all: nothing it detects is minor. S01 has two LOWs
because a gate reader mostly meets paperwork problems.

Every variant stays inside the logic of its source. S01 only reports what a gate
reader could refuse; S03 only what is seen on the water; S06 only objects left
in an aisle. A variant that wandered outside its hotspot would put a reading on
it that its fields cannot express. The spec's own authored events (S04's
intrusion, S06's unattended object) keep their §4 values and times.

`triggerEvent(eventId)` does both halves in one action: raises the incident
**and** moves the source hotspot to its event readings. An incident in the queue
whose source still reads NORMAL is a demo contradicting itself on screen.

`firedEventIds` records what has gone off, so a variant cannot fire twice while
its incident is in the queue; its siblings stay available so the same hotspot can
raise another. `resetToSeed` returns everything to the opening position.

**Incident ids are allocated at fire time**, counting from `SEC-DEMO-0041` in
the order the presenter fires them, so the queue reads 0041, 0042, 0043 down the
card whatever order they pick. Fixed ids would have numbered it out of order,
and the spec's own numbering collides anyway (it cites SEC-DEMO-0042 for both
S03 and S04). Event *times* stay fixed strings: they are what the demo narrates,
and a story that reads a different time on every load cannot be rehearsed.

### S01-S08 are internal references

They name anchors in this codebase. **They must never reach the screen.** An
operator sees the system that reported something ("AI VIDEO ANALYTICS"), what
was detected, and where ("YARD-RZ-02"), never the id of the anchor it was
attached to.

This is easy to break without noticing, because the ids are the natural key in
every internal structure. They leaked into four places before being caught: the
incident row's subtitle, the trigger picker's chip and its header, and the audit
line "raised by S04". Audit details name the source system instead, and trigger
lines describe what was detected and where.

The tables above use the ids because this document is for whoever is working on
the code.

### Casing

The spec's tables are written in caps throughout. That is a document
convention, not how the values should read on screen, so:

- **Prose reads as prose.** Incident types, sources, teams and locations are
  sentence case: "Restricted-zone intrusion", "AI video analytics", "Security
  operations".
- **A TONED VALUE IS A STATUS FLAG, and flags are caps.** On a hotspot card a
  value that resolves to a tone renders upper-cased - VERIFIED, OPEN, CLEARED,
  INTACT, NORMAL - by the same condition that colours it. The two belong
  together: a row that is coloured is reporting a state, and one that is not is
  reporting a value. Authored casing does not matter, since `toneFor`
  upper-cases before matching, so "Cleared" in the config reaches the screen as
  CLEARED. **This reverses an earlier decision** that had status values read as
  sentence case; the colouring had already made them flags, and the casing now
  agrees with it.
- **Identifiers stay as written**, whatever form the id takes: `CAM-04`,
  `SEC-DEMO-0041`, `EGHU4829136`, `YARD-RZ-02`. They print as authored and are
  never re-cased. The two forms sit side by side because the DEMO infix is only
  half dropped - see §8.
- **Severity and status keywords stay caps.** `CRITICAL`, `HIGH`, `ACTIVE`,
  `RESOLVED`. They are §6's visual-state contract and drive the tone colouring.
  `toneFor` upper-cases before matching, so it tolerates either, but these read
  as status flags rather than words.
- **Locations are the layout's own name** from `layouts[]`: "Central Container
  Yard", not "YARD-RZ-02". The zone code still appears where the spec puts
  it, as a hotspot's `zone_id` field.

### Times

US format with AM/PM, pinned to `en-US` rather than the viewer's locale: this is
a demonstration given to an audience and should read identically on whatever
machine drives it. Authored times ("YYYY-MM-DD HH:MM:SS") are parsed as local,
because they describe a clock at the terminal rather than an instant in UTC.

### Severity colours

Severity has its **own four-colour scale**, separate from `Tone`. Tone carries
three values (ok / warn / alert), so mapping four severities through it put
CRITICAL and HIGH on the same red, and the one level meaning "stop what you are
doing" looked like the one below it.

| | |
|---|---|
| LOW | green |
| MEDIUM | amber |
| HIGH | red |
| CRITICAL | magenta `#ff3bd4` |

Red stays at HIGH where the eye expects it; CRITICAL goes further round the
wheel, so it is distinct at a glance and unmistakably hotter rather than merely
different.

**One scale, everywhere.** `SEVERITY_COLOR` is the only path from a severity to
a colour: the severity chips in S07's filter row, an incident row's severity
pill, the expanded detail's severity value, and S08's per-system status lines. Those
last ones were the odd case, since they end in a severity word ("2 events ·
CRITICAL") but were routed through `Tone`, which meant the same word was red on
the command view and magenta everywhere else. `Field` now takes an explicit
colour for exactly this. Status (ACTIVE / INVESTIGATING / RESOLVED) still uses
`Tone`, since three states map to three tones exactly.

### A field hotspot can hold several incidents

S01-S06 carry ONE reading set, overwritten by each event they raise, so three
triggers on one system would leave two of them invisible. When a hotspot has
more than one open incident its card lists them above the fields, and **the
grid below describes whichever is selected**.

The rows there do not expand: the grid already is the selected incident's
detail, so an expanding panel would print the same readings twice. They carry
the actions instead, and one is always selected, defaulting to the newest.
Deselecting would snap the readings back to the system's live state while a row
above still looked like the subject.

Per-incident readings come from `incidentFields`, which records what each event
wrote. They are rebuilt over the SEED rather than over the live fields, because
a field this event did not write is at rest for it: showing an appointment
exception with the tailgating event's gate state would describe an event that
never happened. The grid is also **dynamic**, showing the hotspot's identity
fields (which camera, which zone) plus whatever this event actually reported,
rather than padding it out with rows of "None".

Silent at one or none: a single-item list above an identical field grid is a
second copy of what is already on screen.

### A marker is drawn because it was asked for

An earlier rule drew a field hotspot only while it held an **open** incident, so
that a quiet terminal carried no markers. That rule is gone. Reaching a
capability is now an explicit pick in the Resources tree, and a marker that
vanished while its system was quiet would make the quiet case — the resting
readings, which is most of what these popups are for — unreachable.

A pick still narrows the operational layer to one bead, but it no longer
narrows the security one: S01 and S02 stay up through any click.

### S07 is the incident centre

**Two tabs**, because "what needs attention now" and "what has already been
dealt with" are different questions asked at different moments. A presenter
mid-demo should not have to read past a shift of closed records to find the
incident they just raised.

| | |
|---|---|
| **Current** | incidents not yet resolved |
| **Past** | closed before this session, plus anything resolved during it |

Past is de-duplicated by id keeping the live row, since that is the one the
actions worked on, so a record does not appear twice once resolved.

The Current tab is **disabled when nothing is live**, and the card opens on Past
instead. A demo starts with no live incidents, and landing on an empty tab hides
the fifteen records that are there behind a click nobody knows to make. The
effective tab is derived during render rather than stored, so resolving the last
incident moves the card immediately.

The card is a **fixed height** for this hotspot alone. Filtering changes how many
rows a list holds, and a card that resizes under every tick moves the control
being clicked. Every other hotspot stays content-height, which is right for a
field grid that never changes size.

**Filtered** by severity and by the system that reported it, and **sorted** by
newest or by severity. The controls appear only when there is more than one row
to narrow, under a **Filter** heading.

**Severity is four chips, not a menu.** There are only four levels, they are what
the list is most often narrowed to, and a chip can carry its own count — which
makes the row a reading of the day (`LOW 7  MEDIUM 5  HIGH 3  CRITICAL 0`) as
well as a control over it. A level with nothing in it is disabled rather than
dropped, so the four stay a fixed row that does not reflow as a demo runs. The
counts are taken after the SOURCE filter and before the severity one, so a chip's
number is how many rows it would actually add rather than a reading of its own
selection.

**Source and sort stay menus.** Six systems and two orderings would be a second
chip row as long as the first, for questions asked far less often. Both drop
their label — "All sources" and "Newest first" name themselves, and a "Source" in
front is a word the chip pays width for and the reader skips. Both open
*leftward*: they sit at the end of a wrapping row, and a menu anchored left runs
off the card. Source is MULTI-select (two systems is one question, and closing
the menu after the first pick would make it two); sort is single and closes on
pick.

There is **no "All" row**: an empty selection and a full one mean the same thing,
so the menu ticks every item instead. "All severities" becomes a state you can
see and take one item out of, rather than a row that silently disagrees with the
ticks under it. Unticking the last item puts them all back, since a filter
matching nothing is never what was meant.

Selection is a **check alone**, no tint or shadow: a filled row reads as a button
that has been pressed rather than an item that is included, and in a multi-select
list half the rows being tinted is just noise. The check is always rendered and
hidden when off, so ticking one does not reflow the row beside it.

Only a **narrowed filter** carries the accent — a selected severity chip, or a
source menu with a choice in it. Sort always has a value, so it is never "on" and
stays neutral.

Sorting by severity breaks ties on report time, newest first, because that is
the only other thing separating two incidents of equal weight. Sorting works on
a copy, since these arrays are store state.

The source filter is labelled by system name (`AI Video Analytics`), matching on
the anchor id behind it: see the rule above.

The past tab holds 15 records out of the box, which is more than reads at a
glance without narrowing.

**A row is one line: when, what, how bad, who.** The time leads, because a list
sorted newest-first is read as a sequence; then the type, with the system and the
place under it; then the severity as the keyword itself on its own tint, so the
levels can be taken off the right-hand edge without a legend; then the operator.
The record number is **not** on the row — it moved into the detail, where it is
read once rather than in front of all fifteen. Neither is the status word: ACTIVE
and INVESTIGATING are in the detail beside everything else about the incident.

The **owner avatar is read off the audit trail**, not stored on the incident: it
is whoever appears on the incident's most recent audited action. Ownership
changes at a hand-off, and reading it from the log means the avatar on the row
and the avatar on the last log line can never be two different people. An
incident nobody has touched has none, since the detection line has no operator.

The layer narrates **one day**, so the list is headed with it
(`THE DAY · SEP 15, 2026`, taken off the newest row) rather than carrying the
date on every row — which leaves each row's time column free to read as a time of
day.

A row expands in place to the §4 field set, which is the shape of one incident
rather than of the card. It is a tinted block **inside** the row rather than a
section under it: the tint says the readings belong to the row above, where a
dividing line made them look like the next thing in the list. Its fields are
Record, Type, Severity, Status, Source, Source ID, Location, Event time, Assigned
team and, on a closed record, **Closed in**.

Status replaced **Acknowledged**, which was the same fact told twice: acknowledging
is what moves an incident to INVESTIGATING. `Closed in` is MEASURED from the
log's own first and resolving lines rather than stored beside them — both stamps
come from the same clock in either case, authored throughout for a seeded record
and wall-clock throughout for a live one, so the difference is meaningful even
though the layer's event times are synthetic.

Its actions:

| | |
|---|---|
| Acknowledge | ACTIVE to INVESTIGATING |
| Escalate | up one severity, CRITICAL caps |
| De-escalate | down one severity, LOW floors |
| View location | travels to the incident's parent layout |
| Audit trail · N entries | opens that incident's log in a dialog, N being how much is in it |

The four that CHANGE the incident are hidden once it is resolved; the two that
only look at it stay, because where a past incident happened and what was done
about it are exactly what a closed record is for.

**De-escalate is not in the spec**, which names only ESCALATE. It exists because
a demo that can only raise severity has one-way state: a presenter who escalates
to make a point could not put it back without resetting the run.

**View location keeps Security Mode on.** The shield stays lit and the S-markers
stay drawn, so the incident's anchor is seen in its real surroundings with the
layer still up. The mode's remembered return is untouched, so the shield still
goes back to wherever the operator entered from, not to the layout this jumped
to. Security Mode is therefore no longer L10-only.

A **Back to incidents** button appears top-centre for the duration, returning to
the overview with the centre reopened on the incident that was left. Top-centre
because the bottom dock is greyed in Security Mode and the edges hold the
layer's own panels, so nothing competes with it there. It wears the dock's own
glass treatment with a label beside the glyph: it is one of the bar's buttons
that happens to sit at the top of the screen, not a call to action.

`viewingIncidentId` lives in the store rather than in the card, because
`goToLayout` clears `hotspotInfo` and the card unmounts during the trip that
started it. The card is reopened from inside the return blackout, so it is
already on screen when the picture comes back.

`history` is kept separate from `incidents` on purpose: the queue is what S08's
counters are derived from and what S07 works through, so folding closed history
into it would open the demo with a backlog already done and a resolved count
that never moves. Resolving a live incident retires a copy into `history`.

### Audit history

`audit` is an append-only log of the whole session, oldest first, unlike the
queue which reads newest-first as a worklist. It records `event_triggered`,
`incident_raised`, `incident_acknowledged`, `incident_escalated`,
`incident_resolved` and `demo_reset`.

It starts with a full prior shift: **15 closed incidents and 88 log entries**,
5 to 8 lines each, numbered 0026-0040 so a live run picks up at 0041 and the
sequence reads continuously.

Both are GENERATED from one `PAST_INCIDENTS` table, which describes each past
incident and the steps it went through. Two hand-written lists would drift the
first time either was edited, and a log that disagrees with the record it
describes is worse than no log. Each record's severity is walked forward through
its own escalations, so the record and its log can never disagree about where it
finished.

The day is shaped to read like a real one rather than a uniform sample: a quiet
05:12 camera dropout, a cluster either side of the shift change, several routine
things closed in minutes, and one seal alert that ran 49 minutes through
escalation to CRITICAL and back. Most lines are `incident_note` observations
("Contact identified as a permitted survey vessel"), which is what makes a log
read as a record rather than a state-machine printout.

Its `at` is the one real timestamp in this layer, recording when the presenter
pressed the button rather than the synthetic time the demo narrates. Seeded
entries carry authored times, having no moment of interaction to record.

A no-op action writes nothing: an audit that records attempts rather than
changes stops being a record of what happened. `resetToSeed` keeps the log and
appends a `demo_reset` line, since the run that just finished is the one most
worth having a record of.

Shown **per incident**, from the Audit trail button on an expanded row, and
read oldest-first: a single incident's log is a story with a beginning (its
trigger) and runs forward. There is no whole-session log view; a log belongs to
an incident rather than sitting beside the list of them.

Entries say **what happened, not which incident**: "Incident acknowledged", not
"SEC-DEMO-0040 acknowledged". The log is read under the incident, which already
says which one it is.

Every line carries the **operator who did it**, as an avatar on the right, from
six invented operators in `SECURITY_ACTORS`. Hovering one shows the full name,
drawn rather than left to the browser's `title`, which waits about a second and
renders in the OS style; the tooltip flips above the row near the bottom of the
log, which scrolls inside a clipped box that would otherwise cut it in half. They are synthetic like everything
else here; the spec forbids encoding real security staffing. An incident has an
owner who handles most of its lifecycle, with hand-offs where the work genuinely
changes hands, so the person who clears an aisle is the one who then resolves it.
Live actions carry one identity, since a presenter is one person at one desk.

The detection line has **no operator**: a camera or a reader saw it, and
inventing a person for the machine's own line would misdescribe the record.

### S08's card

`incidentCounts()` derives S08's readings from the incident list rather than
storing them, and the card recomputes them on every change: the per system status
lines follow the category of each incident's source, so raising an S01 event
moves "Access Control" and nothing else, reporting the worst open severity rather
than the most recent. §8 requires "S08 counts/status update when demo incidents
change state", and a second copy of a number that must agree with a list is a
number that will eventually disagree with it.

**The ten readings are not a field grid.** S08 is the one hotspot whose card does
not print `fields[]` through the generic two-column grid. The ten are two
different kinds of thing, and as ten identical label-above-value rows the card's
two questions — *is everything up* and *how much is open* — had to be picked
apart by reading the labels. `SecurityCommandView` splits them on the authored
field name, which is the same key `commandViewFields` derives against:

| | |
|---|---|
| `*_status` | **Capabilities** — six lines, a name against a state, two columns |
| `*_incidents` | **Open incidents** — four tiles, one large number each |

A capability line is CAPS with a dot in its own colour, by the same rule the
field grid follows: a toned value is a status flag, and flags are caps. A line
that has gone to "2 EVENTS · HIGH" ends in a severity word, so its explicit
colour wins over the tone. A counter tile keeps only the word that tells it from
the other three — "Active Incidents" and "High Severity" become ACTIVE and HIGH,
since the heading above already says what is being counted. Both honour
`valueColor`, the rule `Field` applies, so a coloured reading means the same
thing on all three surfaces.

**The layer switches say how many are drawn**: `Layers · 5 of 6 shown`, with
*Show all* beside it when any is off. The count is in the heading so a presenter
does not have to count chips, and an off layer is one the heading has already
accounted for.

`evidenceRefs[]` and `timeline[]` are named in §7 and deliberately unmodelled:
nothing generates events yet, so there is nothing true to put in them.

---

## 7. Supporting changes

Two fixes the layer needed in shared code:

- **`HotspotDataCard`** resolved hotspots positionally, via
  `layouts[].hotspots[index - 1]`. Security rows are not children of a layout,
  so that walk cannot reach them. The card now takes an explicit `hotspotId`
  and consults the store alongside `site.hotspotById`.
- **Marker `index`/`total`** count within the security set, so the card reads
  "1 of 2" rather than borrowing L10's operational count.

`HotspotIcon` gained a `"security"` member. Note that `icon` is currently
metadata only, so markers render as plain spheres.

---

## 8. Not built yet

Tracked here so the gap is explicit:



- **Nothing raises an incident.** The trigger UI came out with the command
  view's rebuild — see *Triggering events*. The store's 24 variants,
  `triggerEvent` and `resetToSeed` are all still there, waiting for a control.

- **The DEMO infix is half dropped.** The Lightbox Specification allows "DEMO"
  or "SIMULATED"; the decision is to drop the infix and disclose with the word
  *Simulated* instead. Applied to the five ids S03-S06 put on screen - `WS-01`,
  `CAM-04`, `YARD-RZ-02`, `CRANE-RZ-01`, `CAM-07` - because those four cards
  were being opened for the first time and would otherwise have shipped showing
  exactly what the decision says not to show. **Still carrying it:** S02's
  `SL-DEMO-982741`, H06's "LIVE DEMO", and all of `security-store.ts` - every
  `PAST_INCIDENTS` id and `sourceId`, and `incidentIdFor`'s generator. Until
  that lands the S07 log will say `WS-DEMO-01` for the zone whose own card says
  `WS-01`.

- **S03-S06 have no still.** S01 and S02 open with a cut-out render standing
  beside their readings, turned 13 degrees. The other four have no `image`, so
  `still` is undefined and their fields simply spread across both columns -
  which reads, but it is not the card the studies chose. Four renders, one per
  capability, is the whole of the gap.

- **VIEW EVENT.** Every other S07 action works. This one needs a camera move to
  the event itself rather than to its parent layout, and nothing marks where
  within a layout an event occurred.
- ~~**`demo_zone_geometry`**~~ **- done.** Both boundaries are in. See *S03
  draws its zone* and *S05 draws its corridor*.

- **`enabled_in_security_mode`** per hotspot: currently a hotspot is shown or
  hidden by its category, not by a flag of its own.

- **S07's View location still travels to a LAYOUT**, not to the reporting
  hotspot's CP: it uses the incident's `navigationTarget`, which is a layout id.
  Now that every anchor has a camera, landing on the system that raised the
  incident is a smaller change than it was.
- **Highlighting**, as distinct from filtering. S08's Expected interaction says
  a selected category "highlights only demo entities/events"; today a category
  that is off removes its markers. Once events and geofences exist there is more
  to highlight than the discs.

---

## 9. Verifying a change

`next dev` and `next build` are **not** to be run. A dev server is kept running
locally, and a build overwrites its `.next/`. Use:

```bash
npx tsc --noEmit                       # must be clean
npx eslint src/terminal-v5             # must match src/terminal-v3 exactly
```

The lint parity check is the useful one: v3 and v4 carry the same 95 inherited
problems, so any difference is something the change introduced. Note `next lint`
is removed in Next 16, so call `eslint` directly.
