# The v5 Port Security layer

How `/v5` works, and why it is built the way it is.

`/v5` carries the **Port Security demonstration layer**, hotspots S01-S07, on
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

Anchor positions come from `reference_files/la-port-zone-c5-hs-v7.glb`,
nodes `hs_s01` to `hs_s07`, and viewpoints from
`reference_files/la-port-zone-c5-cp-v7.glb`, paired by
`reference_files/List-HS CP (1).xlsx`. Positions are the ones in the table
below.

**The v7 drop is where the merge shows up in the authoring.** It exports
`hs_s01` to `hs_s07` and no `hs_s08`: seven anchors for seven rows. The
surviving `hs_s07` is not the spec's old S07 either - it carries the old S08's
Y (38.8292) and sits 68 units from where S08 was, so it is S08's anchor
re-placed, which is what the merged row was already using. The pairing sheet
still lists eight rows, `hs_s07 -> cp_005` and `hs_s08 -> cp_010`; the surviving
row takes **`cp_010`**, the S08 pairing, and `cp_005` goes back to being L05's
own camera and nothing else's.

That same file carries `hs_001` to `hs_030`, the operational anchors, and all
thirty match `hotspots[]` in `v5.json` to 4dp. Nothing in the app reads the GLB
— it is a hand-off format — so that agreement is the only available proof that a
new drop is in the same authoring space as the file it is about to be written
into. **Check it before trusting an `hs_sNN` node:** if the thirty do not match,
the seven cannot be trusted either, and the mismatch is in the export rather
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
screens already claim, on every device - see *S03 is back on a phone, from
closer*.

| | source | severity | |
|---|---|---|---|
| `SEC-DEMO-0043` | S03 waterside, `WS-01` | **HIGH** | unauthorized watercraft in zone |
| `SEC-DEMO-0044` | S06 anomaly, `CAM-07` | **MEDIUM** | unattended object |

**Because the command view derives, it does not need authoring.**
`commandViewFields` reads the store, so it now says `Waterside - 1 alert · HIGH`
and `Video Analytics - 1 alert · MEDIUM`, with counters at 2 active / 1 high /
1 medium / 0 critical. It is also why a device gate needs no second set of
numbers: with a row dropped the same code reads `Waterside - Normal` and 1
active. Hard-coding those numbers would have left two places to
keep in step; this way it cannot disagree with S03's DANGER banner or S06's
FLAGGED FOR REVIEW, because it is reading the same rows they describe.

S07's queue picks them up for free, and each source card keeps its own grid:
`SourceIncidents` only renders at two or more open on one hotspot, and these
are one each.

**This changes the layer's opening premise.** §5 step 1 had every system NORMAL
with nothing detected, and the emptied event fields - tabulated under *5. Rest state vs
event state* - were held back for exactly that. Two screens now open mid-event instead, so "nothing
is happening until you make it happen" no longer describes the demo.

### The layer switches are gone

The command view carried six chips that added and removed marker categories.
Removed, with `SecurityLayerToggles` and `LayerChip`. The store keeps
`categories`, `toggleCategory` and `showAllCategories` - nothing reads them now,
and they are the hook if the idea comes back.

It was the only control in the layer that changed what was on screen, so the
command view is now purely a readout, which is what the other six are.

### All seven are reachable, but only six have markers

No `enabled: false` remains in `v5.json`. `v4.json` carries it on S03-S08,
which is the whole of what separates the two routes.

**Seven on every device.** S03 was dropped on `mobile` and `low` for a while;
it is back since its camera moved inside the phone's fog - see *S03 is back on
a phone, from closer*. The device gate in `security-store.ts` is still there,
with an empty list.

**S07 draws a marker like the other six, and opens the same way.** It did not:
`hotspot-markers` filtered on `isFieldHotspot`, which is true only for S01-S06 -
the six in `SECURITY_EVENT_GROUPS` - so the dashboard drew no disc, and the flap
compensated by passing `goToHotspot` an `onArrive` that set `hotspotInfo` from
inside the transition. Picking S07 from Resources travelled and arrived with the
card already up.

**That made one row behave unlike the other six for a reason the operator cannot
see.** "It is an instrument, not a place" is a distinction about what the anchor
means, not about how it should be reached, and it bought S07 a second navigation
path to maintain. Every security row now travels, leaves the card closed and
draws a disc; clicking the disc opens the card. `onArrive` is no longer passed
by the flap at all, and `openCardFor` is deleted.

The behaviour the six had is now the behaviour all seven have - travelling
deliberately leaves the card closed, so someone can stand at the viewpoint and
watch the terminal before opening anything.

A row that IS disabled is still listed under Security - the set is seven and
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

### S07 and S08 are one anchor

The spec gives two logical anchors at L10: S07, Security Incident Management,
and S08, Port Security Command View. **They are now one row, `S07`, sitting on
S08's anchor and S08's camera**, with S08's ten readings and the incident centre
stacked in a single card. The old S07 row is gone from `v5.json`.

The merged row's `popupTitle` is **Security Management Dashboard**, and its
`name` - the label in the Resources list - is the shorter **Security
Dashboard**. Neither spec name fitted the card any more: "Security Incident
Management" describes the list without the overview, "Port Security Command
View" the overview without the list.

**Because the split was never one the operator could see.** Both are logical,
both file under L10, neither draws a marker, and each is opened the same way -
by name, from the Resources list. Two rows one after the other in that list,
both landing on an aerial shot of the same yard, read as one thing split across
two clicks. The command view's counters are *derived from the queue* S07 lists,
so the pair were already two renderings of one dataset: the top of the card says
two active, one high, one medium, and the list underneath is those two
incidents.

**S08's anchor and CP survive, not S07's.** S07's `cp_005` is L05's camera at
152 units, assigned because no security CP was authored for it; S08's `cp_010`
is L10's own, and L10 is the layout both rows claim. Keeping the anchor that
matches the parent layout is the one of the two that can be defended without
reference to the merge.

The card renders `SecurityCommandView` then `SecurityIncidentCentre`, in that
order: the overview states what is up and how much is open, the list underneath
is what is open. `SECURITY_CENTRE_ID` in `hotspot-card` is the single id both
sections gate on, replacing `SECURITY_COMMAND_ID` and `SECURITY_INCIDENT_ID`.
The incident centre gained an **Incidents** section label, because it
is no longer the first thing in the card and its tab chips needed a heading to
separate them from the counters above. The card keeps the fixed tall height the
incident centre always had, and the generic field grid stays hidden - the ten
readings are drawn by the command view instead.

**`security_systems_status` is the one thing kept from a rejected redesign.** It
had no entry in `commandViewFields`, so the sixth capability line printed its
seeded `Operational` however bad things got - a row that looked live and could
not change. `rollUp` now derives it: still `Operational` when nothing is open,
so the resting card is unchanged, but `2 systems reporting` in the worst
severity's colour once something is. It is a summary of the other five rather
than a sixth peer, which is why it is the only one whose value is a count.


**The count badge belongs to the filter chips, not the tab chips.** Current and
Past carry their label alone. The two tabs are a *place* - one is open work, the
other is the archive - and a number on them answers a question nobody asked on
the way in; the day heading already says `n shown` for whichever tab is up. The
four severity chips are the opposite: their number is the reason to press one,
because it says whether narrowing to CRITICAL leaves anything to look at. Those
counts moved out of the label string into `Chip`'s `count` prop, so they render
as the inset badge rather than as trailing text, and they still answer to the
source filter above them.

`CATEGORY_BY_HOTSPOT` still files S07 under `incidents`. Nothing filters on it:
the map is only ever read by an incident's `sourceHotspotId`, and S07 raises
nothing.

### S07 is in the list

It is listed under **Security** with the other six, so the incident log and the
command view are reachable. Pressing it travels to its own CP and selects it,
exactly as a field anchor does.

The spec calls it a "logical" anchor, "not a physical security-room location",
and for a while that argued for keeping it out of a list of places. It lost to a
simpler fact: **a capability nothing can open is worse than one filed under a
heading that does not quite fit.** It is the only way into the queue and the
audit trail.

`isFieldHotspot` no longer decides anything in the scene. It survives in one
place only - `hotspot-card`, which uses it to choose between a field grid and
the dashboard's capability lines plus incident centre. That is a question about
what a card CONTAINS, which is exactly the distinction the flag names.

**It used to gate the nearby-while-walking set as well**, on the argument that
walking near L10 should not put the incident log on a stick in the yard. That
went with the rest: S07 is in `alwaysOn` now, so it draws wherever the camera
is, and a separate rule for the walk would have been the same one-row exception
in a second place. Its anchor sits at Y 38.8, well above head height on L10, so
it reads as something overhead rather than something underfoot.

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
readings, raises incidents and moves S07's counters, and none of that can be
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

| | Position | Rotation | Moved in v7 |
|---|---|---|---|
| S01 | `[-760.3231, 2.1281, 243.2027]` | `[1.5708, 0, -1.1056]` | — |
| S02 | `[-756.4547, 6.4506, 246.9512]` | `[1.5708, 0, -1.1056]` | — |
| S03 | `[-1626.1896, 10.3445, 421.6853]` | `[1.5708, 0, -1.1056]` | **98** |
| S04 | `[-1012.3536, 15.4923, 127.1811]` | `[1.5708, 0, -1.1056]` | 0.8 |
| S05 | `[-1122.3207, 8.6565, -348.682]` | `[1.5708, 0, -2.6764]` | 2.0 |
| S06 | `[-1347.0518, 15.443, 469.7945]` | `[1.5708, 0, -2.6764]` | 0.1 |
| S07 | `[-757.9357, 38.8292, -332.5833]` | `[1.5708, 0, -2.6764]` | **68** |

**Not one rotation moved.** All seven came back byte-identical to what `v5.json`
already held, which is the second check on the drop: a re-anchor that also
re-oriented everything would be a different authoring space, not a nudge.

**Two moved enough to matter.** S03 went a further 98 units north-west, and S07
68 units - the latter being the merged anchor being re-placed rather than an
anchor drifting. S05 rose 1.97 in Y and `cp_013` rose by the same 1.97, so the
anchor and its camera moved together; S04 and S06 are sub-unit nudges.

The spec's old `hs_s07` (`[-910.3315, 6.684, -223.5211]`) is not in the v7 file
at all, which is the export agreeing with the merge - see *S07 and S08 are one
anchor*.

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
are the only two that do. That exception used to be written beside them in the
file; it is recorded only here now, which makes this paragraph the thing that
stops the pair being read as a rule about the whole file. It is not.

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

#### The cameras are AUTHORED, not derived

`cp-v7` carries eighteen nodes: `cp_001` to `cp_010` are the ten layouts' own
cameras and `cp_011` to `cp_018` the extra viewpoints, four of them the security
layer's. Nothing is solved here - the CP node's XYZ euler is pasted straight in
and what renders is the orientation the author framed.

**The pairing is authored**, in `reference_files/List-HS CP (1).xlsx`, one row
per anchor. The sheet still has eight rows; the seventh and eighth both point at
the merged S07, and it takes `cp_010` from the `hs_s08` row - see §1.

| | CP | range | pitch | yaw | roll | anchor off-centre |
|---|---|---|---|---|---|---|
| S01 | `cp_015` | 10 | +5.6 | -177.2 | 0.0 | 17.1 h / 4.6 v |
| S02 | `cp_015` | 14 | +5.6 | -177.2 | 0.0 | 2.8 h / 12.5 v |
| S03 | authored* | **589** / 200 | +4.6 / -6.5 | -174.5 / +173.3 | 0.0 | desktop / `mobileCamera` |
| S04 | `cp_017` | 9 | +3.4 | +93.4 | 0.0 | 7.6 h / 7.4 v |
| S05 | `cp_013` | 14 | -2.0 | +152.8 | 0.0 | 0.3 h / 0.6 v |
| S06 | `cp_018` | 5 | +4.0 | -57.6 | 0.0 | 1.2 h / 0.9 v |
| S07 | `cp_010` | 400 | -13.0 | +108.5 | 0.0 | 4.2 h / 4.4 v |

`cp_005` was the sheet's `hs_s07` pairing and is unused by the layer now.

\* **S03 has two cameras.** `camera` is the 589-unit shot below, kept for
`desktop` and `low`; `mobileCamera` is the closer pose described in *S03 is back
on a phone, from closer*: 22 up, 200 back along the same bearing, aimed at the
centre of the unauthorised craft. The history below is `camera`'s.

**Before that, S03's rotation was hand-aimed, not `cp_016`'s.** The node's own euler
`[3.0918, -0.1961, 3.1319]` left the anchor 26.4 degrees off-centre; the
authored `[3.0847, -0.0463, 3.139]` swings the yaw 8.6 degrees onto it and gets
that to 17.9, inside S01's worst case. The position is `cp_016`'s, untouched.
Aiming a node the pairing sheet still owns is a stopgap - it fixes where the
camera looks, not the 706 units it looks from.

**These are computed the way the app computes them**, through `xyzToYxz` in
`config/index.ts` - the stored XYZ euler reordered to YXZ, then the camera's
forward vector read off the resulting pitch and yaw. Reading pitch and yaw
straight off the XYZ triple gives nonsense for any pose near a pole, which most
of these are.

#### S03 HAS NO VIEWPOINT IN cp-v7

**`cp_016` moved and S03 did not follow it.** In `cp-v6` it stood 11 units from
S03's anchor at `[-1777.6, 60, 627.2]`. In `cp-v7` it is at
`[-1441.1986, 29.8319, -259.322]`, a different part of the terminal - 706 units
from S03's new anchor and 26.4 degrees off-centre, which is inside the frame
only in the sense that a speck is. Every other security pairing survived the
drop unchanged or improved; this is the one that did not.

Nothing else covers it either. Of the eighteen nodes, the ones with S03's anchor
in frame are 689 to 1508 units away, and the three nearest by raw distance
(`cp_001` at 179, `cp_002` at 190, `cp_018` at 279) all face away from it.

**It is still applied, because the alternative is worse.** S03's previous camera
is not in `cp-v7` at all - the closest node to it is 341 units - and against the
new anchor it points **177.6 degrees** away, i.e. the anchor is directly behind
it. A distant shot that contains the subject beats a near shot that faces the
other way, so the sheet's pairing goes in and this section is the record that it
is wrong.

**The aim has since been corrected by hand**, `cp_016`'s position with an
authored rotation that puts the anchor 17.9 degrees off-centre instead of 26.4.
That is the symptom treated, not the cause: 706 units is still 706 units, and
the anchor is a speck whichever way the camera points.

**What fixed it was not a re-authored `cp_016`.** A ground node close to the
anchor would have stood inside the water geofence, which runs x -1658 to -1088
and z -510 to 471. A phone uses an authored pose low over the water instead -
see *S03 is back on a phone, from closer*. If a CP is ever authored for it, the debug
panel's camera editor writes it straight into `v5.json` - see *Moving a CP or
an HS from the app*.

**Roll is 0.0 on all seven.** That is the independent check that the pipeline is
right: a camera pose has no roll, the file stores XYZ, `poseForCamera` reorders
to YXZ, and the roll that falls out is zero. A non-zero one would mean a triple
had been pasted in the wrong order.

**Every anchor lands inside the frame.** `world.fov` is 35 vertical, so about 60
horizontal at 16:9 - half-angles of 17.5 and 30. Six are comfortably inside, the
worst of them S01 at 17.1 horizontal; S03's 26.4 is inside the number and
outside the intent, for the reason above. Off-centre is not a fault: the anchors
sit high in frame with their subject beneath, which is what `ground-views.ts`
rule 3 asks for.

**Three of them are ground poses.** `cp_015` sits at eye height 1.95 - the gate
navmesh is flat at 0.130 and `world.eyeHeight` is 1.8288 - so arriving at S01 or
S02 puts the operator standing at the lane. `cp_013` (9.3), `cp_017` (13.7) and
`cp_018` (15.0) are low over their subjects rather than aerial. `cp_016` was the
fourth at 4.7 and is now at 29.8, which is part of the same move.

**Two consequences of the list, both deliberate:**

- **S01 and S02 share `cp_015`.** The list pairs both with it. One viewpoint was
  authored at the gate and both anchors are within 15 units of it, so the two
  rows land on the same shot and differ only in which card opens. Separating
  them would mean authoring a second gate CP, not editing the mapping.
- **S07 keeps `cp_010`** - L10's own camera, at 400. No security CP was authored
  for it, and the list says so rather than leaving it unassigned. It is an
  instrument rather than a place, so an overview shot is defensible; it was not
  framed for it. The v7 re-anchor improved it anyway: 425 units and 13.3 degrees
  off-centre became 400 and 4.2.

**The drop was checked before it was trusted.** `hs-v7` also carries `hs_001` to
`hs_030`, and all thirty match `hotspots[]` to 4dp - the only available proof
that a new export is in the same authoring space as the file it is about to be
written into. It passes, which is what makes the security anchors worth reading
off it.

`cp-v7`'s first ten pass the same check against `layouts[].camera`, nine of them
exactly. **`cp_002` is the exception**, 15.5 units from L02's authored camera.
Nothing has been done about it: the layouts are outside this layer and their
cameras are not the security drop's to move. If L02's shot is ever re-authored
from `cp-v7`, that is the node it takes.

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

The layer splits on a line the code still names, `isFieldHotspot`, and the spec
names it too — in their own §4 placement instructions. The split is now about
what a card CONTAINS and nothing else; how a row is reached and drawn is the
same for all seven:

| | S01-S06 | S07 |
|---|---|---|
| What it is | a place on the terminal | an instrument the demo is driven with |
| Its card holds | a field grid of readings | capability lines and counters, then tabs, filters and a day's records |
| Raises incidents | yes | no, it receives them |
| Listed in | the Resources tree, under "Security" | the same tree, same treatment |

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

The spec's S08 Expected interaction is the only one that asks for a
**control** rather than a readout:

> "Security Mode toggles logical layers: ACCESS, CARGO, WATERSIDE, ANALYTICS,
> GEOFENCES, INCIDENTS. Selecting a category highlights only demo
> entities/events in the 3D model."

So Security Mode is not a single switch. It is six filterable sub-layers, and
the toggles lived in the command view's popup because that is the hotspot the
spec attaches them to. All six were on at rest; a presenter narrowed from there.
They are removed - see *The layer switches are gone* - and this is the record of
what they were.

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

**S07 files under INCIDENTS but nothing filters on it.** `CATEGORY_BY_HOTSPOT`
is only ever read by an incident's `sourceHotspotId`, and S07 raises nothing -
it receives. When the switches existed, the command view was deliberately
uncategorised so that filtering could not take away the control being used; now
that the two rows are one card, the entry is a label rather than a rule.

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

**Held back, because their tables show mid-demo:** S04, S06, and both of the
spec's L10 tables (its S07 and S08).

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

### Markers are not in the weather

**S03's bead vanished on a phone and not on a desktop, and fog is why.**
`fogRange` puts the near plane at the `far` streaming band and the far plane at
`unloadDist * 0.98`. `mobileProfile` scales `farDist` by `MOBILE.farScale`
(0.55), and every distance below it follows:

| | fog near | fog far |
|---|---|---|
| desktop | 900 | 970 |
| mobile | **540** | **582** |

S03's anchor is **706 units** from its camera. On a desktop that is short of the
near plane, so the marker is untouched. On a phone it is past `fog.far`, which
is not haze - it is **100% fog colour**, the marker replaced by the sky.

**The three marker materials now carry `fog={false}`.** They already carry
`depthTest={false}`, and this is the same statement: a marker is a label drawn
in the scene, not an object in it. A label that a wall cannot hide should not be
hidden by weather either, and nothing about how far away a resource is should
decide whether its name can be read. It fixes every marker on every device, not
just this one.

**Size was never the problem.** Security anchors pass `screenLocked`, which
swaps the `MAX_SCALE` clamp of 1 (4 on touch) for `MAX_SCALE_LOCKED` of 120, so
the bead holds its authored pixel size at any range. That is why S03 reads
normally on a desktop at the same 706 units.

### The phone horizon stopped short of the ship

`fog={false}` saved the marker and nothing else. The **unauthorised ship** is a
`worldModels` entry, loaded whole and never unloaded - and on a phone it was
being drawn as flat fog colour anyway.

The numbers, against S03's camera:

| | ship bbox | distance from the CP |
|---|---|---|
| `la-port-zone-c5-unauthorised-ship-optimized.glb` | `[-1681.9, -15.5, 449]` to `[-1576.5, 4.1, 481.8]` | **613 - 634** |

`mobileProfile` scales `tiers.far.distance` by `MOBILE.farScale` (0.55) and
overrides `fog.start` to the number `0.7`, so every distance below it follows:

| | far band | unload | fog |
|---|---|---|---|
| desktop | 900 | 990 | 900 -> 970 |
| mobile, before | 495 | 545 | **374 -> 534** |

534 is the far plane. The ship at 634 was not hazy, it was **past the end of the
fade** - 100% fog, the model replaced by sky, on a phone only.

**`start` is the wrong lever and so is the camera.** Moving `fog.start` only
walks the near plane; the far plane stays pinned to `unloadDist * 0.98`, and
past it everything is gone whatever the fade does. Moving the camera to 534
would put it inside the zone it is supposed to be looking at.

**`stream.mobileFarScale`**, then: an optional per-site replacement for
`MOBILE.farScale`, read in `mobileProfile` and defaulting to it when unset.
`v5.json` carried **0.9** for a while; `v1` to `v4` carry nothing.

| | far band | unload | fog | anchor 589 | ship 634 |
|---|---|---|---|---|---|
| mobile, before | 495 | 545 | 374 -> 534 | 100% fog | 100% fog |
| mobile, with 0.9 | 810 | 891 | 611 -> 873 | 0% | 9% |

**THIS CRASHED PHONES, AND THE KEY IS GONE AGAIN.** See *The resident ceiling
was never the device's ceiling* below for the mechanism and *S03 is not on a
phone* for what replaced it. The lever still exists and is still read by
`mobileProfile`; no site file sets it, so every profile is back on
`MOBILE.farScale`.

**The reasoning that justified 0.9 was wrong in one specific place.** It ran:
`LOW.farScale` is already 1 at *"82 MB median / 114 MB p90 against a 192 MB
budget"*, mobile runs a **240 MB** `residentBudgetMB`, 810 m is 90% of what LOW
carries on a smaller budget, so *"`residencyClamp` still backstops it"*.

It does not. `residencyClamp` sets `residentBudgetMB` to 240 and nothing checks
that number against the device. `updateResident` is the mobile ground path and
it caps against `residentCapBytes()` alone, while `resolveBudget` had already
priced a phone at `gpuMB: 120-160, texMB: 40-56` - **160 to 216 MB all in**. The
backstop was 240 MB on a device the streamer itself had costed at 160. At 545 m
the set never reached either number, so v4 was fine and the hole was invisible;
at 891 m it reached 240 and the tab died first. `residentRadius()` on mobile
*is* `unloadDist` and `evictCache()` returns early in `resident` mode, so the
disc is the whole footprint.

**Measured against the 674-chunk manifest, not assumed.** The disc grows by
where you are standing, because the bake is finite - at the middle you already
reach most of it at 545 m:

| standing at | chunks @545 | chunks @891 | textures @545 | textures @891 |
|---|---|---|---|---|
| port centre | 291 | 340 (1.17x) | ~55 MB | ~66 MB |
| S03's CP | 194 | 305 (1.57x) | ~42 MB | **~65 MB** |
| truck gate (L08) | 94 | 238 (**2.53x**) | ~12 MB | ~40 MB |

Textures at the 128 px far rung, priced RGBA + mips over the distinct materials
in range. The phone texture budget is **40-56 MB**, so 891 m is over it from the
waterside and at the edge of it from the middle. Geometry is the small half:
9 MB against 11-12 MB compressed over the same discs.

Two separate mistakes, worth keeping apart: the distance was a judgement call
that can be re-made, and the missing budget check was a bug that made any such
call unsafe. Only the second is fixed by code.

**These treated symptoms, and the last of them cost more than it bought.** The
anchor went from 706 to 589 when S03's camera was re-aimed and moved,
`fog={false}` kept the marker out of the fade, and `mobileFarScale` pushed the
horizon past the ship until it was taken out again. S03 still opens on a
**589-unit** shot where the other five sit 5 to 14 units from their anchors, and
it is the only row in the layer that ever needed the phone profile widened to
make its own subject visible. What put it back was moving the camera inside
the phone's fog rather than pushing the fog out - see *S03 is back on a phone,
from closer*.

### The resident ceiling was never the device's ceiling

**`residentCapBytes()` now takes the lower of the two budgets it always had.**

`resolveBudget` prices the device: `cpuMB`, `gpuMB`, `texMB`, chosen from the
profile, `deviceMemory` and the GPU string. `residentBudgetMB` is a different
number - what the *bake* asks to keep resident - and `residencyClamp` pins it to
240 on every non-desktop profile whatever the site file said.

The streamed path already reconciled them. `gpuCapBytes()` is
`min(budget.gpuMB, cfg.residentBudgetMB)`, so `sync()` evicts against whichever
is smaller. The **resident** path did not: `updateResident` and
`retierResident` both cap against `residentCapBytes()`, which read
`cfg.residentBudgetMB` and nothing else. v5's ground stream is
`"geometry": "resident"`, so on a phone the only ceiling in force was 240 MB on
hardware priced at 160.

```
residentCapBytes()  =  min(
  residentBudgetMB,                    // 240 on mobile, via residencyClamp
  budget.gpuMB + budget.texMB          // 160 (tight) / 216, via resolveBudget
) * currentGpuScale()
```

`gpuMB + texMB` because `residentBytes()` prices one figure covering both -
mounted geometry plus `textureBytesTotal()` - so the ceiling has to cover both
too. `currentGpuScale()` still applies, so a context loss halves it as before.

**What changes, by profile.** Desktop: nothing. Its `residentBudgetMB` is 256
and its device budget is 272 (weak GPU) or 448, so the authored number stays the
binding one - and `residentRadius()` is `Infinity` there regardless. `low`:
nothing. It takes `resolveBudget`'s desktop branch, 272 or 448 against 240.
**mobile only**, 240 -> 160 or 216.

**NOT MOUNTING IS THE ONLY LEVER, WHICH IS WHY THE CEILING HAS TO BE RIGHT.**
There is a texture evictor - `evictTextures()` caps against `budget.texMB` - but
it can only free keys in `texIdle`, and a texture enters `texIdle` only when its
**last referencing chunk unmounts**. Anything a mounted chunk still holds is
skipped. So when the whole disc is mounted and every texture in it is in use,
the evictor scans, frees nothing, and returns still over budget. `texMB` is not
a ceiling it can enforce on its own; it only trims what has already been let go.
The mount decision in `updateResident` is the real ceiling, and before this it
was reading the wrong number.

**The failure it replaces was a crash, and what it does instead is visible.**
Past the ceiling `updateResident` stops mounting and warns once, so the far edge
of the model goes missing rather than the tab going down. The warning names
which budget bound - `residentCapSource()` - because "raise residentBudgetMB"
is the wrong advice when the device is what is binding, and that was exactly the
advice the old string gave.

### Soft decals up close are the bake, not the stream

**The rungs are unchanged: near 1024, mid 256, far 128, the same as v3 and v4.**
512 was tried and put back, 2048 was costed and refused. This section is the
record of why, because the symptom that prompted it will come back.

**The symptom looks like a streaming fault and is not one.** Stand next to a
container and its markings are mush; back away and they sharpen. They do not
sharpen - they shrink. Near and far chunks request the *same file*: on a desktop
`residentTier` is `near` and `rungBand` exempts desktop from distance banding,
so every mounted chunk asks for the near rung and gets it. All that changes with
distance is how many screen pixels the same texels have to cover.

**The ladder cannot go above what the bake holds.** `pickTex` takes the largest
rung that exists - `avail.find((p) => p <= px)` - and `assets/tex.json` is
`["orig", 2048, 1024, 512, 256, 128]` over 149 images, of which **47 top out at
256 or below**, every one of them `kind: "color"`:

| source size | what it is |
|---|---|
| 256 x 128 (x14) | placards and door markings |
| 117 x 56, 190 x 67, 200 x 104, 400 x 91 | logos and signage |
| 58 x 89, 48 x 98, 128 x 27 | the smallest decals |

Image 15 is 117 x 56 and its top rung **is** 117. Asking for 1024 gets 117.
Asking for 2048 gets 117. The 43 images baked at 1024 and the 20 that carry a
2048 or 4096 rung are the hulls, the pavement and the cranes, which is why the
surfaces *around* a blurry decal look fine. **No value of `texture.px` fixes
this.** It is a re-bake of the source art, an asset job, and it is in "Not built
yet".

**512 costs the big atlases and buys nothing back where it hurts.** It halves
the resident footprint of every 1024-and-up image and leaves all 47 small ones
exactly where they were, so the trade is "the hulls get softer, the decals do
not get better". Reverted.

**2048 does not fit the budget.** Priced RGBA + mips, one image is 5.6 MB at
1024 and **22.4 MB** at 2048. Twenty images carry a 2048 rung; six of them
resident at once is 34 MB at the current setting and **134 MB** at 2048, past
the desktop `texMB` of 128 (`resolveBudget`, 80 on a weak GPU) before the other
129 images are counted. And per "The resident ceiling was never the device's
ceiling", `evictTextures` can only free a key whose last referencing chunk has
unmounted - so going over with everything mounted means the evictor scans and
frees nothing. Refused.

**Any of this is desktop-only whether or not it is written that way.** On a
phone `rungFor` returns `Math.min(want, WEBP_RUNG_CAP)` - 256 - *because*
`this.ktx2` is null, so the near rung never reaches the GPU there at any
configured value. Which leads to the finding underneath all of it:

**An earlier bake is not a way back: the sharp version never existed.** v3
streams `v8w-inst-mo-1`, v4 and v5 stream `v9w-inst-mo`, and the two were
compared image for image. The tiny signage is **identical in both** - the same
four 117 x 56 fence meshes, the same 48 x 98, 128 x 27, 200 x 104, 211 x 67,
255 x 200. They were never sharp in v3. What v9w *added* is 77 images, and the
blurry container livery is in that block: the **`acmat_*` set, 25 images, every
one 256 x 128 or 256 x 256**, new in v9w and with no larger ancestor anywhere.
Pointing v5 at v8w would not sharpen a label, it would delete the containers.

| | v5-obj (v1) | v6w (v2) | v8w (v3) | v9w (v4) | v9w-01 (v5) |
|---|---|---|---|---|---|
| images | 69 | 71 | 72 | 149 | **153** |
| capped at <=256 | 24 | 24 | 25 | 47 | **47** |
| rungs with a KTX2 file | 223 | 0 | 233 | **0** | **508** |

**That last row is why v5 has its own asset base.** `NEXT_PUBLIC_STREAM_BASE_V5`
points at `v9w-inst-mo-01`; v4 stays on `v9w-inst-mo`, so the stable demo does
not move. `assetBaseFor` reads `STREAM_BASE_V5 ?? STREAM_BASE_V4`, which is why
v5 inherited v4's bake until the variable existed.

**It is the same world, checked before switching.** `worldMin` and `worldMax`
are identical to the digit - `[-1733.276, -0.1, -558.288]` to
`[-187.738, 81.193, 960.015]` - and `animated.glb` carries the same seven clips
in the same order. So every CP, every anchor, S05's corridor and S03's zone are
all still where they were authored. What changed is the chunking, 674 -> 652,
and the KTX2.

| | v9w-inst-mo (v4) | v9w-inst-mo-01 (v5) |
|---|---|---|
| bake | `portla-c5-v9o-inst-mo` | `portla-c5-v9-003-inst-mo` |
| chunks | 674 | 652 |
| rung keys | `px, tag, url, bytes` | `px, tag, url, bytes, ktx2, ktx2Bytes` |
| rungs with KTX2 | 0 | **508** |

**Nothing in this repo had to change to pick it up.** `hasKtx2` is
`opts.tex.images.some((im) => im.rungs.some((r) => r.ktx2))` - data-driven, so
it flips on its own the moment the manifest carries the field. `useKtx2` was
already `true`, `public/basis/basis_transcoder.{js,wasm}` was already there, and
v5's loader already passed `ktx2Path: "/basis/"`. The `"format": "ktx2"` on
every tier stopped being aspirational without being touched. The bake was never
a code problem: `LA_PORT_ADAPTIVE`, which produces these assets, asks the same
question in the same words, and its default model **is** `portla-c5-v9-003-inst-mo`.

**Coverage is every rung except 4096.** 1024 has 77, 512 has 96, 256 has 133,
128 has 145; the 11 rungs without a counterpart are all 4096, which is above the
pipeline's `ktx2.maxPx` of 2048. Its config says why, and it is worth keeping in
mind before raising a tier: *"NEVER set a tier's texture.px above maxPx: a rung
larger than this gets no KTX2 counterpart and silently falls back to WebP."*
v5's near tier is **1024**, so nothing falls back: all 77 of the bake's 1024
rungs carry a `.ktx2`, checked rung by rung.

**The near rung was raised first and did nothing, because the near BAND is
what decides who gets it.** Counted against the manifest from the first-person
camera, at `nearDist` 50 only **27 of 344** chunks were in the near band. The
ship, its containers and their livery sit 50 to 250 m out - the **mid** band,
130 chunks, and mid was **256 px in this repo and 256 px in the reference**,
byte for byte the same file. Raising a rung 27 chunks can see could not change
what was being looked at:

| | chunks from the FP camera | v5 rung, before | reference rung |
|---|---|---|---|
| near, <50 m | 27 | 1024 | 512 |
| mid, 50-250 m | **130** | **256** | **256** |
| far, >250 m | 187 | 128 | 128 |

**So the band moved, not the rung.** `nearDist` 50 -> **150** and `mid`
256 -> **512** make one 512 band out to 250 m - 157 of the 344 chunks - with 128
beyond it. The rung itself stays at the reference's 512; what was wrong was how
few chunks could see it. Raising it to 1024 was tried and put back: it cost
38.3 MB of KTX2 on the wire against 12.7 MB at 512, which is three times the
climb out of the dollhouse for detail the bake mostly does not hold anyway.

`residentBudgetMB` is **256**, not the reference's 58, because 58 was measured
against a 50 m near band and `residentBytes()` counts resident textures as well
as geometry: at 150 m it would have spent the ceiling on textures and stopped
the far half of the model mounting.

**v5 now matches the reference on every key the browser reads live.** Taking
their bake without taking their numbers would have been half a port, so the
whole block was brought over:

| | was | now | reference |
|---|---|---|---|
| `tiers.near.distance` | 50 | **150** | 50 |
| `tiers.near.texture.px` | 1024 | **512** | 512 |
| `tiers.mid.texture.px` | 256 | **512** | 256 |
| `cache.limitChunks` | 500 | **550** | 550 |
| `cache.residentBudgetMB` | 256 | **256** | 58 |
| `streaming.freeCpuArrays` | absent | **true** | true |
| `render.maxDpr` | 1.5 | **2** | 2 |
| `render.adaptiveDpr` | true | true | always on |

`streaming` needed nothing: `unloadBuffer` 1.1, `updateHz` 10, `frustumCull`,
`cullGraceTicks` 15, `alwaysLoadRadiusMetres` 140, `frustumMarginMetres` 90,
`hysteresisMetres` 20, `loadsPerTick` 28, `radiusScale` 0, `refRadius` 120,
`geometry: resident`, `residentTier: near` were already identical, key for key.

**`maxDpr` was being ignored, and that is the sharpness gap.** The texture path
is identical to the reference once the bake matches - same rungs, and
`configureTex` agrees line for line down to `anisotropy = 8`, `flipY = false`,
the colour space, the uv channel and the `KHR_texture_transform` handling. What
did not match was how many pixels the frame is drawn into.
`canvas-with-wrapper` hardcoded `dpr={lowPower ? [1, 1.25] : [1, 1.5]}` and
never read the site file, while the reference passes
`dpr={[1, activeConfig.maxDpr]}` - **2**. On a 2x display that is the scene
drawn at 1.5x and upscaled against drawn at native, a 1.33x linear resolution
deficit across the whole frame, and small high-frequency detail like a container
logo is where an upscale shows first. No texture rung is involved.

The Canvas reads `stream.render.maxDpr` now, low-power still clamped under it.
v1 to v4 all author 1.5, so the shared wrapper changing is a no-op for them and
only v5 moves to 2. `adaptiveDpr` stays **true**: the reference mounts
`AdaptiveQuality` unconditionally with that same ceiling, so always-on with a
max of 2 is the match, not a fixed value. `MOBILE.maxDpr` still clamps to 1.5
and `LOW.maxDpr` to 1, so this lands on desktop only.

**Tone mapping is off in v5, and it is a site key so v4 keeps its own.**
`world.toneMapping` is `"neutral" | "none"`, omitted meaning `"neutral"`, so
v1 to v4 are untouched and only v5 carries `"none"`. The reference runs
`NoToneMapping`; v5 ran `NeutralToneMapping`, which rolls off highlights and
takes local contrast with them - the washed sky, and edges that read softer than
the pixels behind them actually are. `lowPower` already forced `NoToneMapping`,
so this only changes the full-power path.

**It makes `grade.exposure` inert, by design.** `toneMappingExposure` is only
read *by* an operator, so with none selected the 0.94 does nothing - the same is
true of the reference's own `gl.toneMappingExposure = 0.8`, which is dead code
there. `grade.brightness`, `contrast` and `saturation` are a CSS filter on the
canvas element and still apply; the reference has no such filter, so that is a
remaining difference, left alone because it is a look decision rather than a
fidelity one.

**One renderer difference is left.** The reference asks for
`powerPreference: "high-performance"` and v5 does not, which on a laptop with
switchable graphics decides which GPU draws. It sits in the shared Canvas with
no site key, so setting it would move v4 as well; untouched.

**`residentBudgetMB` was tried at 58 and put back to 256.** Their config calls it
*"inert as this entry stands, because streaming.geometry is resident"*, and in
their runtime it is. In this one it is not: it is half of `residentCapBytes()`,
`min(residentBudgetMB, gpuMB + texMB)`, measured by `residentBytes()` against
**decoded geometry plus every resident texture**, and `updateResident` stops
mounting at it. That check is the fix from "The resident ceiling was never the
device's ceiling"; it did not exist when 58 was measured. On a desktop
`residentRadius()` is `Infinity`, so the resident set is the whole model: 344
near-tier LODs, **66.7 MB compressed on the wire**, 133 to 267 MB decoded at the
ratios the manager learns, before textures. If 58 bites, the symptom is
unmistakable - the far edge of the port simply is not there, and the console
carries `[stream] resident ceiling reached at N MB of 58 MB (residentBudgetMB)`.
That is why it is 256 here, and why the 1024 near rung above needs it to stay
there.

**Three reference keys have no counterpart here.** `cache.limitDecodedMB` (290)
does not exist in this schema - the equivalent ceiling is
`resolveBudget().cpuMB`, derived from `navigator.deviceMemory` as 192, 288 or
448 rather than authored per bake. `render.anisotropy` (8) is matched already,
hardcoded at `tex.anisotropy = 8` in `configureTex`. `render.fov` (35) is a
camera key, and v5 authors its cameras per layout in the site file.

**Fog is the one deliberate divergence.** The reference sets
`render.fog.enabled: false` - *"DISABLED on request"* - and its own note warns
that the unload boundary then becomes a hard wall, with chunks ceasing to exist
at `far x unloadBuffer`. v5 keeps `stream.fog` on with `start: "far"`, because
the whole of "Markers are not in the weather" above is about a marker opting out
of a fog that exists. Turning it off is a scene decision, not streaming parity.

**The mobile profile stays.** `models.config.json` is defaults-only - there is
nothing to match. `MOBILE` in `streaming/config.ts` (the rung ceilings,
`residentTier: far`, `sharpestTier: mid`, `wireBudgetMB: 15`, the distance
scales, the DPR clamp) is this repo's addition, and everything in section 5
above depends on it.

**The trade is wire for VRAM, and it is not small in either direction.** ETC1S
is bigger on the network and far smaller on the GPU - image 1 at the 1024 rung
is 946 KB as KTX2 against 89 KB as WebP, a 10x download, while resident it is
~0.7 MB against 5.6 MB, an 8x saving. The phone budget above was priced at
4 bytes/texel RGBA, so those numbers are now conservative rather than wrong.

**And the 256 clamp is gone on mobile.** `rungFor` returns
`Math.min(want, WEBP_RUNG_CAP)` only when `this.ktx2` is null. With the KTX2
bake a phone can finally reach the rung `rungBand` picks for it - `MOBILE.rung`
caps the near band at 512, so a phone goes **256 -> 512** and now sits at the
same near rung as the desktop. That is the one place where labels genuinely get
sharper.

**On a desktop they do not.** KTX2 changes the encoding, not the pixel count.
Both bakes hold the same 47 low-res images and the same `acmat_*` container
livery at 256 x 128, so a label read from a metre away is exactly as soft as it
was. That fix is still the 25 `acmat_*` images re-baked at 1024 from source art,
and it is in "Not built yet".

### Leaving the dollhouse used to leave the textures behind

**The route opens in the dollhouse, and the dollhouse dresses the whole world at
128.** `viewMode` is `phase === "firstPerson" ? "firstPerson" : "dollhouse"`, so
the first thing any visitor loads is the dollhouse config: `forceTier: "far"`
and **128 on all three rungs**, which is what lets it hold a 12,000 m far band.
Then the tour drops into first person, where the near rung is 512.

**Both views share one resident set**, which is stated in `buildDollhouse` and
is the point - nothing is thrown away on the switch. So the same chunk objects
carry their 128 px textures into first person and have to climb.

**`setConfig` swapped the config and asked for nothing.** The climb was left to
the ordinary `updateTextures` pass at `texUpgradesPerTick` - **16 a tick at
`updateHz` 10, 160 chunks a second** - against a resident set of ~650, each one
a fresh fetch of its 512 rung. Four seconds at the floor, longer on a real
connection, and because the queue re-sorts nearest-first every tick while you
are still moving, the surfaces you are walking toward keep being re-prioritised
rather than finished. The symptom is a first-person view whose near surfaces
look soft for several seconds after arriving, which is easy to read as a texture
quality problem and is not one.

There is precedent for the fix in the same file: `retierBurst` already widens
the **geometry** budget for `BURST_TICKS` after a camera jump. Textures had no
equivalent, although a view switch invalidates every rung at once where a jump
only invalidates what moved band.

**`setConfig` now raises a `texBurst` when the rungs actually change.** It
compares `texRung` per tier against the incoming config, so a `setConfig` that
only re-resolves `hide` or `pick` costs nothing, and for 30 ticks after a real
change `updateTextures` runs at `TEX_BURST_SCALE` (4x) its usual budget - 64 a
tick, 640 a second - draining only while there is a backlog to drain. The set is
queued inside a second and the rest is the network.

**The burst alone was not enough, because the rung it was racing to was also
wrong.** `rungBand` read the rung off the chunk's **mounted tier** on desktop -
`if (this.profile === "desktop") return R[tier]` - on the reasoning that the
resident tier is `near` and banding could only take sharpness away. That
reasoning does not survive `resident` mode. `residentBandTier` mounts each chunk
at its *distance* band, `forceTier` pins the whole model at `far` for a view,
and `retierResident` climbs back at `retierBudget` **2 chunks a tick** once the
30-tick burst is spent - 344 real chunks, so **tens of seconds**. Until the
geometry finished climbing, `R[st.current]` was `R.far` = **128**, and the
texture pass was dutifully re-dressing everything to the number it was already
at. Draining a queue faster does not help when the target is wrong.

**The rung is derived from distance now, for every profile.** The desktop
early-return is gone; `rungBand` falls straight through to the band test
whenever `geometryMode === "resident"`. A surface 30 m away is dressed at
`texRung.near` the moment it is 30 m away, whatever LOD it is still wearing.
This is exactly what the bake's own runtime does - `texRungFor` in
`LA_PORT_ADAPTIVE` re-derives the band with the same comment about why the tier
cannot be trusted in resident mode - and it is the difference the screenshots
were showing.

**In the steady state it changes nothing**, which is why it is safe: once the
tier has caught up, band and tier agree and both give the same rung. It only
differs while the two are out of step. Where a chunk lacks its band's LOD it is
an improvement in both directions - a far chunk that only has a `near` LOD stops
being dressed at 512, and a near chunk that only has `far` stops being stuck at
128.

**The climb is warmed before it happens, not just drained faster.** A burst
only reorders work that still has to cross the network, and the ground rungs
are **12.7 MB** of KTX2 against the dollhouse's 1.4 MB - that download is what
the viewer was watching land as the labels sharpened. `ChunkManager.warmTextures
(target, from)` walks the resident set from the pose the ground view opens at,
bands each chunk under the *target* config, resolves the same URLs `pickTex`
will resolve, and hands them to `prefetchUrls` nearest-first - the order
`updateTextures` will ask for them in. v5's `StreamedModel` calls it once, the
first time it sees `viewMode === "dollhouse"`, so the wait is spent while the
tour is still playing and the switch finds the files in cache.

`prefetchUrls` fetches at `priority: "low"` with `cache: "force-cache"`, so the
dollhouse's own chunks keep the bandwidth and nothing is re-requested. It ran
strictly one at a time, which could not drain a view's worth of rungs in the
time the dollhouse is up; it runs **4 in parallel** now. It had no other caller.

**All three changes are in `src/streaming/` or `src/shared/`, so v3 and v4 get
them too.** They open in
the dollhouse on the same 128 rungs and have the same climb; there is no version
of this that is a fix in v5 and correct to withhold from them.

**The reference has neither view, which is why the comparison never showed it.**
`models.config.json` has no `dollhouse` and no `aerial` block - it is one ground
config from the first frame, so it dresses at 512 once and never climbs. The
mode system, and this cost, are this repo's.

### S03 is back on a phone, from closer

**A phone gets its own S03 camera, where its ground profile can see the
craft.** S03 carries `mobileCamera` beside `camera`: `[-1600.7176, 22, 223.314]`,
200 units back from the anchor along the desktop shot's bearing and 22 up,
aimed at the centre of the unauthorised craft - pitch -6.5, yaw +173.3. The
craft spans 12.8 to 13.0 degrees either side of centre, so it fits a portrait
frame. `desktop` and `low` keep `camera`, the 589-unit shot, because their
ground fog does not start until 900.

**`mobileCamera` is a general hotspot key, read in one place.**
`poseForHotspot(id, mobile)` takes it over `camera` when `mobile` is true and
the key is authored, and falls through to `camera` otherwise, so every other
hotspot is unchanged. `isMobileDevice()` in `streaming/config.ts` is
`detectProfile() === "mobile"` memoised - narrower than
`isConstrainedDevice()`, because `low` keeps the desktop horizon. `goToHotspot`
and the debug panel's reset-to-authored pass it; v1-v4 pass nothing and get
`camera`. The debug panel's copy and write paths still address `camera` only,
so a CP edited from a phone lands on the desktop shot.

| mobile ground profile, fog 374 -> 534, unload 545 | anchor | craft |
|---|---|---|
| `camera` `[-1551.2, 29.8319, -162.32]` | 589, 100% fog | 613 - 634, 100% fog |
| `mobileCamera` `[-1600.7176, 22, 223.314]` | 200, clear | 228 - 272, clear |

**`mobileCamera` stays in the ground profile on purpose.** The aerial profile is
chosen by camera height alone - `useCameraAloft`, entering at 40 and leaving
below 30 - not by `walkable: false`, which only makes the pose a fly pose. Y 22
is under the exit, so arriving from a high layout camera drops back to the
ground profile before the flight ends. The shot does not need the aerial
horizon: the furthest corner of the craft is 102 inside the fog start.

**Nothing new to afford.** The ground disc is the stock 545 m one, and the craft
is the ~23.6 MB it always was; it was never the cost.

**What came back with it.** `OMITTED_ON_CONSTRAINED` is `[]`, so the S03 row,
its incident `SEC-DEMO-0043`, its geofence and its marker are on every device,
and `WorldModels` no longer checks `isConstrainedDevice()`. The gate is kept,
empty, as the way to take a row off constrained devices again.

The rest of this section is how the gate works when the list is not empty.

**It is filtered once, at the table, not at each consumer.** `OMITTED` is built
at module scope and the store's seed drops the row from `seedHotspots`; markers
(`s.hotspots`), the flap list and `ZoneGeofence` all read the store and need no
rule of their own. `SECURITY_EVENT_GROUPS` is filtered from the authored
`AUTHORED_EVENT_GROUPS`, which carries `SECURITY_SOURCES`, `SECURITY_EVENTS` and
`isFieldHotspot` with it.

**The incidents go too, which is the part with a visible consequence.** While
S03 was on the list, `SEC-DEMO-0043` went with it and a phone opened with one
incident instead of two. `SEED_INCIDENTS`, `SEED_HISTORY`
and `SEED_AUDIT` are the filtered seeds, used by the initial state and by both
`reset` and `resetToSeed`. Audit rows are dropped by `incidentId` as well as
`hotspotId`, because only the first two rows of an incident carry the hotspot,
and the survivors are **re-sequenced** so `seq` has no gaps.

**Two things are deliberately NOT filtered.** `DEMO_TIME_SHIFT_MS` is computed
from the authored tables, so the demo clock reads the same on both - a device
should not move the hour. And `CATEGORY_BY_HOTSPOT` keeps its S03 row: the S07
dashboard derives `waterside_status` from open incidents, so with none it says
`Normal` in the healthy tone, which is what a phone should say.

**Hydration is safe because none of this is in the first paint.**
`isConstrainedDevice()` is false during SSR - `detectProfile()` has no `window`
and answers `desktop` - so the server builds the full tables. Nothing
S03-derived reaches the DOM before `isReady`, which is client-only state, and
the markers and the craft are scene children rather than markup. A future caller
that gates DOM on it needs its own client-only gate.

**`worldModels` is not gated on the device or on S03.** See *The unauthorised
craft is world furniture*: the craft is in the water whether or not anyone is
looking at the waterside hotspot, on every device.

**THE ENABLED SET IS ALWAYS UP.** No row carries an `enabled` flag in
`v5.json`. The six field anchors are unioned into the marker set after every rule
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
  there, not which layer is being demonstrated. S07 is in the set too now - see
  *S07 draws a marker like the other six*.
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

### The selected bead is the big one, and the only one moving

All six security anchors are drawn at once - that is the point of the layer, and
it is also its problem: six identical beads say nothing about which one is being
read. Selection used to be carried by the ping rings alone, which is a timing
difference between two things the same size, and at a glance six beads still
look like six beads.

| | nothing picked | one picked from the list |
|---|---|---|
| the picked bead | - | 24 px, `± 0.22` at 3.2 rad/s, rings every 1.35 s |
| every other bead | 13.2 px, `± 0.055` at 1.6 rad/s, rings every 2.1 s | 13.2 px, `still` |

**Stillness is a contrast, so it only exists when there is something to contrast
with.** The first cut made a bead still whenever it was not the selected one,
which is true of all six when nothing is selected - so the layer opened dead,
and stayed dead through a first-person walk. `still` is now gated on
`securityPicked`: some security row IS the current selection. Until then every
anchor breathes, because a layer whose markers are all motionless reads as a
layer that is switched off.

**It is also released on the ground.** `securityPicked` is false while
`ground.on`, so walking through the terminal shows every nearby anchor alive
even if a row is still selected in the store. That matches the rule one
paragraph up - a selection does not survive the ground, because the point of
standing there is to look around.

`still` holds the core at scale 1 and the rings at opacity 0, and it yields to
hover - a minor bead still answers the pointer, because hover is a question the
operator asked rather than an idle animation.

### A picked layout reads the way a picked anchor does

The security row already had a rule for being picked: the chosen bead is full
size and pulses, every other security bead drops to `SECURITY_MINOR_BEAD` and
goes `still`. An operational pick had half of it - the chosen bead pulsed, but
`picked` was `[selectedHotspotId]` alone, so its own layout's siblings were not
drawn at all, and `still` was gated on `securityPicked`, so the security row
kept oscillating underneath it. Two different answers to the same question.

**`picked` follows the layout now.** A selected operational anchor resolves to
`site.layoutById[its layoutId].hotspots`, the way a selected security anchor
leaves the rest of the security row on screen. `pickedLayoutId` is null when the
pick is a security one, so that path is untouched.

**`pulse` is the subject, and the subject narrows.** `isSelected ||
inMovingLayout`, where `layoutMoves` is `currentLayoutId` **only while nothing
is selected**. Arriving at a layout moves its children, because the layout is
what is being looked at. Picking one of them makes that anchor the subject on
its own, and the siblings settle - they stay drawn, they stop moving. One thing
moves at a time, and it is whatever the viewer has most recently narrowed to.

**`pulse` was never the switch that stops a bead moving.** `Hotspot` reads it as
`alwaysPulse` and picks one of three presets from it - hovered, `alwaysPulse`,
and a third for everything else at `[2.1, 2.2, 0.26, 1.6, 0.055]`. That last one
is slower and smaller but it still pings and still breathes, which is why an
unselected sibling read as *oscillating less* rather than as stopped. Only
`still` returns early, zeroes the ping opacity and resets the core scale.

**So `still` is the complement of the subject, not a security rule.** It was
`isSecurity && !isSelected`; it is `!isSelected && !inMovingLayout` - anything
that is not the thing being looked at is frozen, whichever table it came from.
`hovered` still overrides it, because a bead answering the pointer is feedback
rather than noise. The whole rule is two lines and reads as one sentence:

- **the selected bead always moves**, whichever table it came from
- **a layout's children move while the layout is the subject**, which is to say
  while nothing inside it has been picked yet
- **nothing else moves at all** - not gently, not slowly; unselected beads are
  frozen, and unselected security beads are small as well

The `ground.on` exception went with the gating. Proximity decides what is
*drawn*, which is what `own` is for; it no longer decides what oscillates,
because a bead that moves because you walked near it was the same noise the
`SECURITY_MINOR_BEAD` clamp exists to keep down.

### A bead is the same size from every CP

**`MAX_SCALE` was making the far anchors nearly invisible.** The sizer solves
`s = (beadPx / 2 x worldPerPx) / size` each frame, which holds a marker at a
constant pixel width however far away it is - and then clamped `s` to 1. At
`world.fov` 35 on a 900 px viewport that clamp bites beyond **71 units**, so
every CP past it drew a bead shrinking with distance:

| | CP to anchor | scale needed | drawn at |
|---|---|---|---|
| S01, S02, S04, S05, S06 | 5.5 - 14.5 u | 0.08 - 0.20 | 24 px, correct |
| S07 | 400.1 u | 5.61 | clamped to 1 - about 4 px |
| S03 | 706.0 u | 9.89 | clamped to 1 - about 2 px |

S03's anchor was rendering at roughly a tenth of its intended width. It was not
a visibility bug in the layer or a bad CP - the marker was doing exactly what it
was told, against a ceiling set for a scene an order of magnitude smaller.

**Security markers raise both ends of the clamp** (`screenLocked`): 0.001 to
120 rather than 0.06 to 1. They now measure 24.0 px selected and 13.2 px minor
at every one of the seven CPs, from S06's 5.5 units to S03's 706. The ceiling
holds across the debug panel's whole `fov` range too - 20 to 110 needs a scale
of 5.5 to 44.8 at S03, all well inside 120.

The clamp is kept rather than removed because it is a guard against degenerate
input, not a design choice: a camera parked far enough away would otherwise ask
for an unbounded scale.

**It is `beadPx` that moves, not `size`.** The `size` prop looks like the one to
turn and is not: the sizer normalises it away every frame, so a marker holds a
constant pixel width whatever its geometry radius. Multiplying `size` changes
the sphere and the scale by inverse amounts and lands back on the same
silhouette. The screen target is the only lever.

**The hit box does not shrink with the bead.** `colliderMult` is divided by
`beadScale`, so a 13.2 px bead keeps the world-space collider of a 24 px one. A
marker made small to get out of the way would otherwise also become hard to
click, which punishes the operator for the layer being legible.

**Operational hotspots are untouched by all three.** The crowding this answers
is the security layer's own - `alwaysOn` draws all six wherever the camera is,
while operational beads are already filtered to a layout or to what is within
150 units, and none of their CPs is far enough for the clamp to reach.

### The card on a phone

Two viewport problems, two variants, because a card tuned for one is wrong for
the other:

- **`short:`** - a LANDSCAPE phone. Width is fine, height is gone. It was
  already there: the card scales to 0.85 and every row loses a couple of pixels.
- **`max-sm:`** - a PORTRAIT phone. Height is fine, width is gone. This is new.

Below `sm` the card comes in on every axis:

| | full | phone |
|---|---|---|
| width | `80vw` | `80vw` |
| height | `80dvh` (fixed) | `80dvh` (fixed) |
| padding | 28 | 16 |
| corner | 14 | 12 |
| title / subtitle | 18 / 13 | 15 / 11 |
| field label / value | 10.5 caps / 18 | 10 caps / 15 |
| row padding | 13 | 6 |
| alert title / detail | 11 caps / 14 | 10 caps / 12.5 |
| column gap | 40 | 20 |

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
`SEVERITY_COLOR.HIGH` went to **`#ff9b93`**, a coral measuring 3.52 / 6.18 /
9.11 across the three scenes above, against `#ff5c5c`'s 1.70 on the old panel.
A deeper red cannot win here: the panel is translucent by design and stays
light, so the ink has to come up to meet it rather than the ground going down
to meet the ink.

> **SUPERSEDED.** Both are `#ff5c5c` now. See *One red was two jobs* below,
> which is the later measurement and the one the code follows: the coral was
> chosen against the OLD frost, and once the wash took the deep red the ink had
> no reason to be a fourth red nobody else uses. This paragraph is kept because
> the reasoning about translucency still holds - it is why neither red is dark.

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
lying flat on the panel. The plane is **280 x 224** inside the card's 760.

**Its rendered box is not its layout box, and that is what put a scrollbar in
S01.** `perspective: 1100px` with `rotateX(2deg)` makes the near edge larger
than the far one, so the painted plane stands about **7% taller** than the
224px it occupies in the grid - measured, not estimated: 237.4px painted
against a 224px track. Scrollable overflow counts transformed descendants, so
the moment the still was the tallest thing in its column the body's
`overflow-y-auto` saw a few pixels it could not fit and drew a bar over a card
with nothing to scroll. It got worse as the plane grew: 9px of phantom overflow
at 320px wide, 12px at 360.

**The wrapper absorbs the bleed instead of the scroll container.** The
`[perspective:1100px]` div is `overflow-hidden p-2` now. The 8px of padding is
more than the ~2px the plane needs vertically and the ~5px it needs to the
left at this size, so nothing is actually clipped - `overflow-hidden` is the
guarantee that the figure can never contribute overflow again whatever the
width, and the padding is what keeps that guarantee from costing anything. Both
numbers were read off a probe of the real transform, not guessed.

| | |
|---|---|
| S01 | `…/v9w-inst-mo/assets/security-thumbails/scanner-red-v3.png` - arm down, lamp red |
| S02 | `…/security-thumbails/scanner-green-v3.png` - the scanner alone, lamp green |
| S04 | `…/security-thumbails/cam-04-analytics.png` - the poster, 1608x978 |
| S06 | `…/security-thumbails/cam-07-anomaly.png` - the poster, 1402x1122 |

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

**The two posters opt OUT of the optimiser instead, and so the rule does not
reach them.** The poster `<Image>` carries `unoptimized`, which makes
`next/image` emit the S3 URL as the `src` rather than rewriting it to
`/_next/image?url=…`. Nothing is cached under `.next/dev/cache/images` for
them, so replacing a poster in place and reloading shows the new picture - no
`-vN` bump, no cache to clear. The stills keep their versioned filenames,
because they still go through the optimiser and the rule above still binds.

The cost is real and small: the posters ship as the PNGs the bucket holds, at
whatever size they were rendered, with no WebP/AVIF conversion and no
width-variant for a phone. At ~0.6 MB each, for two pictures that open only
inside a card, that is a worse trade than a stale image on every re-render.

**Their declared `width`/`height` are not decoration.** `HotspotConfig.poster`
carries both, and the card sizes itself from the ratio:
`calc((78dvh - 20px) * width / height)`. Get them wrong and the card is built
to one aspect while the picture inside it has another. S06 was declared square
at 1254x1254 while the re-uploaded file is 1402x1122 - a 1.25:1 landscape - so
the numbers move with the file. Check the real ones after any re-upload; the
bucket does not tell the config it changed.

### The site files carry no notes

`v1.json` through `v5.json` held 128 annotation keys between them - 94 `_note`,
23 `_mesh`, 5 `_bands`, 4 `_assetBaseNote` and 2 `_securityNote`. All are gone,
and so are their declarations in `schema.ts`. Nothing read any of them: not the
app, not `scripts/verify-walk.cjs`, not the bake. They were comments that
happened to be valid JSON.

**What was load-bearing moved here rather than being dropped.** Three passages
in this document used to say *see the note in the file*, which stops meaning
anything once the note is gone. The security layer's held-back event values are
now tabulated under *5. Rest state vs event state*; `cp_012`'s printed XYZ
triple is written out where it is discussed; and the `cameras.home` /
`cameras.firstPerson` YXZ exception is stated in prose where it used to be
stated twice, once here and once beside the data.

**The rest is in git**, which is where the long ones belong. `_bands` was an
essay on why `tiers.far.distance` is 900 rather than 300, with a measured table
of hole counts per band - real work, and recoverable in full with
`git show HEAD:src/config/sites/v5.json`. It was not, however, something the
running app needed to ship.

### Every demo asset is on the bucket

Stills, posters and the three demo GLBs all resolve to
`…/v9w-inst-mo/assets/security-thumbails/`, the GLBs under a `glb/` subfolder.
Nothing this layer draws is served from `public/` any more.

The pictures had been split across two hosts - briefly in `public/security/`,
which sidesteps the optimiser cache because `public/` is not optimised, but
splits the layer's assets for no reason. The GLBs were the mirror of that: the
two geofences and the craft sat in `public/models/`, argued for at the time as
app furniture rather than terminal geometry. That distinction did not earn its
keep. One bucket, one `remotePatterns` entry, one place to re-upload.

**The GLBs need CORS and the pictures do not.** A poster is an `<img>` src, which
the browser will fetch cross-origin without asking. A GLB is fetched by
`GLTFLoader` through XHR, so the bucket must answer with
`Access-Control-Allow-Origin` or the load fails outright - it does, with `*`.
`remotePatterns` is unrelated to either: it gates `next/image`, which the
posters now bypass anyway.

`/draco/` stays local. It is the decoder the craft's Draco geometry is read
with, not an asset the scene draws.

**`public/` was pruned to match.** What the layer stopped referencing was
deleted: the craft (1.6 MB), both geofences, and both posters (1.2 MB). Also
`draco/draco_encoder.js` (954 KB) - `DRACOLoader` fetches only the decoder, the
wasm and the wrapper, and nothing in this repo compresses at runtime. `public/`
went from 7 MB to 3.2 MB, and what is left is `basis/`, the three `draco/`
decoder files, `cloud.png`, `env.hdr` and the streaming preview `.bin` - all of
which are still referenced by all five sites.

**v4 still names three of the deleted files, and that is safe for one reason.**
`v4.json` points S04 and S06 at `/security/*.png` and S05 at the local crane
geofence, but all four of its security rows carry `enabled: false`, and a
disabled row never fetches its assets. The proof was already in the tree: v4's
S03 names `la-port-zone-c5-water-geofence-v1.glb`, which is tracked in git but
was removed from the working tree before this change, and v4 has run clean
against that missing file regardless. Flipping any of those rows to
`enabled: true` would 404 - the fix then is to point them at the bucket, the
same URLs v5 uses.

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
the derivation stopped being the answer. See *The cameras are AUTHORED, not
derived*. `cp_016` put it at `[-1534.0809, 4.6845, 430.6008]`, 11 units out,
yaw -31.6, the anchor 0.2 h / 1.2 v off centre - looking AT the zone from low
over the water rather than out across it from the quay.

> **`cp-v7` UNDID THIS.** `cp_016` is now 706 units away in a different part of
> the terminal and the shot described here no longer exists. The paragraph is
> kept because it is the brief: low over the water, looking AT the zone, close
> enough to hold all three craft. See *S03 has no viewpoint in cp-v7*.

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
The XYZ equivalent `/extract-pos` printed for `cp_012` is
`[3.0914, 0.2333, -3.13]`, and it round-trips through `xyzToYxz` back to
`[0.0488, 2.9080, 0]`.

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
containing "Active" from being recoloured. The same change lights **the command
view's severity counters**, integers carrying a tone `commandViewFields` computes,
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

### S04 and S06 are a clip AND a grid

`HotspotConfig.clip` - `{ url, poster?, width, height }` - replaces `poster` on
both. The card goes back to being an **ordinary card**: the same glass, the same
`PanelHeader`, the same `Field` grid, with a looping video at the top of the
body. `poster` and everything written about it below stays in the schema and in
this document, because it is the decision the clip reverses.

**Because a clip shows what the camera sees and carries no panel.** A poster
hid the grid for a good reason - the render already contained the ten readings,
and printing them underneath would have said everything twice. A video of the
yard says none of them, so the readings have to come back as real fields. That
is the whole change: the special case is deleted rather than extended.

| | |
|---|---|
| element | `<video autoplay loop muted playsinline preload="auto">` |
| box | `--clip-aspect` on the wrapper, so the frame is reserved before a byte arrives |
| overlays | camera id + `LIVE` top-left, **play / pause** bottom-left |
| readings | two columns, flowing round the feed on a short screen |

**Muted is not a preference, it is what makes autoplay legal.** Both files carry
an AAC track that is never heard; every browser blocks an unmuted autoplay, and
a demo card that needs a click to start is a card that is blank in the
screenshot.

**No poster frame: it is a player, not a picture.** `clip.poster` is gone from
both rows, so the block shows the video and nothing else. The wrapper still
reserves its aspect, so there is no layout shift either way - what changes is
that the first paint is the first frame rather than a still standing in for it.
The schema keeps `poster` and `StillPreload` still warms one if a row authors
it; nothing does.

**It has a play / pause control**, bottom-left, over the feed. It is a real
`<button>` with `aria-pressed` and a label that changes with the state, driven
by the element's own `play` and `pause` events rather than by whatever the
button last did - so a browser that refuses autoplay leaves the control showing
`Play`, correctly, instead of lying about it.

**The enlarge control and `ClipViewer` are gone.** A full-screen video was the
poster's affordance carried over without being re-earned: the feed is small
because the readings are the content, and a control whose only job is to undo
that is a control arguing with the card. `PosterViewer` stays for any row that
still carries a `poster`.

### The clip card shows what the CLIP does not

The mp4s carry their own readings panel - the same one the posters carried,
because they are renders of the same scene. Printing the full field grid under
one is the duplication `poster` existed to avoid, arriving by a different route.

**So the grid is cut to what the footage cannot say.** Six readings each, and
the rule is: identity, health, and the one live number. Everything the panel in
the video already states, or that a viewer can count off the footage, is gone.

| | kept | dropped |
|---|---|---|
| S04 | Camera ID · Feed · Analytics · Zone ID · Last Detection · Incident Status | Classifies, Vehicles Tracked, People Tracked, Detections (24h), Alerts (24h) |
| S06 | Camera ID · Feed · Analytics · Zone ID · Dwell Threshold · Flagged Objects | Classifies, Vehicles Tracked, People Tracked, Detections (24h), Alerts (24h), Sent to Review |

`Classifies` and the tracked counts go because the boxes in the clip ARE the
classification and the count - the card was naming what the viewer is watching.
The 24h aggregates go because a card read in three seconds is not where a day's
total belongs. Every `eventOnly` row is untouched: an event still lights the
card up with its detected class, its confidence and its severity.

**Six readings are two columns and three rows**, which drops the clip-specific
width and the four-column rule: S04 and S06 take the same `min(760px, 100vw -
32px)` as every other security card, with the feed centred at **520 x 293**
inside 712 of body. Nothing scrolls on an ordinary desktop window.

### S07 could not scroll on a phone on its side

The dashboard card is the one popup that does **not** scroll as a whole: its
body is `flex flex-col overflow-hidden` so the capability lines and counters
stay put while the incident list scrolls inside itself. (The card's own height
is a `max-h` - see "A security card is bigger than an operational one" - so
that inner scroll starts only once the card has run out of room.) Two things
decided that, and both asked the same width-only question:

- the body carried a `max-sm:block max-sm:overflow-y-auto` escape - `max-sm` is
  `max-width: 640px`
- the list chose its own overflow from
  `const phone = useMediaQuery("(max-width: 639px)")`

**A phone on its side is 844px wide.** Neither test fired, so the body could not
scroll and the list did not think it had to either - with a handful of rows the
list was `overflow-hidden`. Nothing scrolled, and anything past the fold was
unreachable. It is the primary way this experience is watched.

**A hand-held screen is narrow OR short.** `HANDHELD_MEDIA_QUERY` in
`shared/responsive.ts` is `(max-width: 639px), (max-height: 540px)` - a media
query list, so either matches - with `useIsHandheld()` over it. The list uses
that hook now, and the body gained `short:` alongside its `max-sm:` escape.

This is the same blind spot the type scale had: `max-sm` and `short` describe
one device from two sides, and a rule written with only the first is a rule that
does not apply in landscape. Anything asking "is this a phone" should ask
`useIsHandheld()`; `useIsMobile()` is a different question (below 1024) and is
left alone.

### A security card is bigger than an operational one

The card is one component and three sizes, picked by which table the row came
out of. `isSecurity` is `!!securityById[hotspotId]` - the same lookup that
resolved the hotspot a few lines above, so a card is wide because its row is in
`securityHotspots[]`, not because someone listed ids:

| | width | height |
|---|---|---|
| operational hotspot | `min(620, 100vw-32)` | `max-h: min(80dvh, 100dvh-32)` |
| S01 - S07 | `80vw` (min and max too) | `h: 80dvh`, `80vh` where `dvh` is unsupported |

**Every security card is 80% of the screen** (it was 70% first). The 760 / 880 caps below were
retired for `80vw` wide and `80dvh` tall, the same for S07 as for
S01 - S06, on every screen: no `max-sm:` or `short:` override, and a security
card skips the `short:scale-[0.85]` shrink that would take it under 80%. The
height is a fixed `h`, so every card is the same 80% box and its body scrolls
inside when it holds more. The width is pinned with `min-w` and `max-w` as
well, and the height falls back to `80vh` behind `supports-[height:100dvh]:`,
because iPadOS Safari before 15.4 drops a `dvh` value entirely and the card
would otherwise collapse to its content.

**A fixed full-screen card was tried and backed out.** A card of
`100vw-48 x 100dvh-48` left most of its glass empty, and filling it by
stretching the readings (first as `1fr` rows, then as tiles) spread them too
far apart.

**Operational hotspots take the same 80% box, and nothing else.** Every
non-poster popup - the 30 operational hotspots as well as S01 - S07 - is
`80vw x 80dvh`, without the `short:scale-[0.85]` shrink (that now applies to a
poster card only; v5 has none). Inside, an operational card is exactly what it
was: `PanelHeader`, the alert banner, the journey, and the two-column `Field`
grid at its original sizes. `CARD_SCALE`, `CardHeader` and `HotspotBody` are
security-only. Giving operational cards the security layout was tried and
backed out - the ask was a bigger popup, not a new design for them.

### Inside the 80% box: the designed layout

The layout was drawn first as a design canvas, one artboard per hotspot, and
then built. It applies to every security card on every screen - desktop,
iPad and phone - inside the same 80% box (`designed` for S01 - S06); the older
single-column flow with `SourceIncidents` is no longer reached by a security
card. The header gains a `badge` - `S01 · Access Control` - in
`CardHeader` (below), hidden below `md`.

**Media and readings stay side by side on every screen.** Below 1024px or on
a hand-held screen (`stacked = useIsHandheld() || useIsMobile()`) the media card
only rebalances its grid from `1.45fr / 1fr` to `1fr / 1.15fr`, giving the
readings the wider share; the readings column scrolls inside itself, and a
`ReadingRow` wraps its value under its label when the column is too narrow for
both on one line. `stacked` otherwise only decides whether S07 goes side by
side. The paragraph below is the stacked design this replaced.

**Below 1024px, or on a hand-held screen, the card stacked** (`stacked =
useIsHandheld() || useIsMobile()`). An 80% card on an iPad in portrait is about
615px wide and on a phone about 310px, so the side-by-side grid gives way to
one scrolling column: the media first, at its own aspect ratio (the clip's
`width / height`, `16 / 9` for a still), then the hero tile, the readings and
the alerts. The identity strip and the stat tiles use `repeat(auto-fit,
minmax(120px | 84px, 1fr))`, so they run three or four across on a desktop
and wrap to fewer on a narrow card without a breakpoint of their own. S07 goes
side by side (`centreWide`) only when not stacked; stacked, its body is one
block that scrolls.

**Type and spacing are one fluid scale, not breakpoints.** `CARD_SCALE`
sets CSS variables on the security card's root - `--fs-title`, `--fs-sub`,
`--fs-label`, `--fs-value`, `--fs-hero`, `--fs-stat`, `--fs-ident`, `--fs-row`,
`--fs-meta`, and `--sp-pad`, `--sp-gap`, `--sp-tile`, `--sp-row` - each a
`fluid(phone, desktop)` clamp that runs linearly from its phone size at a
390px `vmin` to its desktop size at 900px:

| | phone | desktop |
|---|---|---|
| title / subtitle | 12.5 / 9.5 | 22 / 13.5 |
| label (caps) | 8 | 11.5 |
| reading value | 10.5 | 17 |
| hero / stat / ident | 13 / 16 / 10.5 | 28 / 38 / 18 |
| incident type / meta | 10 / 8.5 | 15 / 12 |
| card padding / gap / row | 10 / 7 / 4 | 28 / 20 / 12 |

The phone end was cut down a second time: at the first values a phone card
read too large for a box 80% of a phone wide, and the side-by-side layout needs
the smaller type to fit both columns. The alert list caps at 96px instead of
152px below `sm` and on a `short:` screen.

It keys on `vmin`, not `vw`, so a phone on its side (844 x 390) sizes like a
phone and an iPad either way up (768 short side) sits near the desktop end.
The card's padding is `var(--sp-pad)` inline. Every security component -
`CardHeader`, `HeroTile`, `ReadingRow`, `IdentCell`, `StatTile`,
`FieldAlerts`, `IncidentLine`, `SystemCell`, `SectionLabel` - reads the
variables, with the old desktop size as the fallback, and their `max-sm:` /
`short:` size overrides are gone. The header is `CardHeader` rather than
`PanelHeader`, whose own breakpoint sizes would fight the scale; `PanelHeader`
is untouched.

**No security text is cut with an ellipsis.** On an iPad the narrower columns
were truncating values, incident types and system states to `…`. Every
`truncate` in the security card became `break-words` (hero, identity cells,
system cells, incident lines and their detail strip, the log rows, the filter
labels) and the subtitle lost its `line-clamp-2`: a long value takes a second
line instead of losing its tail.

**S01, S02, S04, S06 - a card with media** (`HotspotBody`, media branch)
is a `1.45fr / 1fr` grid at full body height:

- left: the media fills its cell. A still is a `StillPanel` (no panel behind it: the
  image sits straight on the card's glass, `object-contain` to the cell's
  edges, the hotspot name as a tag, `sizes` `STILL_PANEL_SIZES`); a clip is `ClipBlock` with `panel`, full height,
  `object-contain`, with no dark backing or border behind it (the video sits on
  the card's glass like the still), badges and pause button unchanged
- right, top: a `HeroTile` for the headline reading - the first of
  `HERO_FIELDS` (`security_status`, `risk_state`, `incident_status`,
  `event_type`, `zone_status`) the card has - with a glowing tone dot and the
  value in caps. It carries no note: the identity reading beside it repeated
  a row below and was taken out
- right, middle: every other reading as a `ReadingRow`, label left and value
  right, scrolling inside itself
- right, bottom: `FieldAlerts`

**S03, S05 - a card without media** is one column: the alert banner (S03), the
`HeroTile` (none when the card has an `alert`), an identity strip of every
non-numeric reading (`IdentCell`), a row of `StatTile`s for every numeric one
(38px numbers, up to four across), then `FieldAlerts`.

**`FieldAlerts`** is the alerts block at the bottom of every field card: the
hotspot's open incidents as `IncidentLine`s (selecting one picks which
incident's readings the card shows, as `SourceIncidents` did), else its most
recent closed record under "Recent alerts", else a dashed "No open alerts".
It has no audit-log button; the log is reached from S07.

**S07** is two columns, `1fr / 1.45fr`: `SecurityCommandView` with `wide`
(systems two across, then the four counters - active, critical, high, medium -
as `StatTile`s pinned to the bottom) beside `SecurityIncidentCentre` with
`flush`, which drops its top margin so both columns start level.

### No clock times or ages in the security layer

**Nothing in the security UI prints a time.** The time column came out of
`IncidentLine` and the age column out of `IncidentRow`; the expanded record
lost `Event time` and `Closed in`; the audit log lists its lines without
stamps. `formatAgo`, `formatClock`, `parseDemoTime` and `closedDuration` were
deleted with them. On a security card the time readings - `event_time`,
`detection_time` and `duration`, listed in `TIME_FIELDS` - are filtered out of
the fields as well, so an event no longer adds them. The stamps are still
stored and still order the queue and the log; only their display is gone.
Operational hotspots are untouched.

The history that follows is how the capped sizes were reached.

**The frame grew and so did what stands in it**, because a wider card holding
the same small picture reads as an emptier card, not a bigger one. The clip
feed's cap went 440 -> **520**, and the turned still 250 -> **280** with its
`sizes` hint moved with it. The field grid needed nothing: it was already two
columns that stretch.

**760 and 880 are a second pass, not the first numbers.** 880 and 1040 were
tried first and read as too much - a field grid of four readings does not earn
that much glass, and the still had to grow past the point where its own
perspective bleed started a scrollbar (see "The still stands in the card as a
turned plane"). One step back from there is the size that is clearly bigger
than the 620 it started at without the card becoming the screen.

**Past that, the card grows by spacing, not by width.** Width buys columns and
the columns were already there; what a card of four readings actually lacked
was air between them. So the third pass left 760 and 880 alone and turned up
the gaps, which makes the card taller as a side effect rather than wider. Two
of the knobs are shared with operational cards, so they are CSS variables read
with a fallback and set only on a security card's root - `--hs-row-y` on
`Field`'s `py`, `--hs-gap-x` on the field grid's `column-gap`. Everything else
in the list below belongs to a security-only component and is set directly:

| | was | now |
|---|---|---|
| card padding | 24 | 28 |
| field row padding (`--hs-row-y`) | 9 | 13 |
| field column gap (`--hs-gap-x`) | 32 | 40 |
| system cell padding / gap | 9 / 3 | 13 / 4 |
| system grid column gap | 18 | 26 |
| incident row padding / gap | 10 x 14 / 14 | 13 x 16 / 16 |
| incident row spacing | 6 | 8 |
| detail strip padding | 14 x 12 | 16 x 16 |
| alert banner padding / margin | 14 x 12 / 16 | 16 x 14 / 20 |
| queue dialog padding | 20 | 24 |

**Each one kept its phone value.** The variables fall back to the old numbers
and `max-sm:`/`short:` restate them, so a phone is pixel-for-pixel what it was
before this pass - the extra air is desktop only, for the same reason the width
is. This is the rule the type scale already follows: see "Every popup size has
a phone size".

**The phone sizes are untouched.** `max-sm:` still comes in at
`min(340, 100vw-40)` and `72dvh`, `short:` still scales the whole card to 0.85,
and the clip's `short:w-[calc(100vw-24px)]` moved out of the width ternary into
its own clause so it survives the security branch. On a phone the viewport is
the constraint and 880 was never going to be reachable; this is a desktop
change only.

**Every height is a `max-h`, including S07's.** The dashboard was the one card
with a fixed `h-`, from when it was the only one tall enough to need its own
scroll geometry, and at 92dvh that reserved most of the screen whether the
content wanted it or not - a card of six capability lines, four counters and
five incident rows, stretched to fill, with dead glass under the detail strip.
It is `max-h` now: the card is as tall as what it holds and reaches 92dvh only
when the queue is long enough to want it.

**Nothing below it needed changing to make that work.** The chain from the card
down to the incident list is `flex-1 min-h-0` at every level, and a column flex
container with an `auto` height sizes to the sum of its items' contributions -
`flex-basis: 0` does not collapse it. So the same classes that divided a fixed
height now measure a content one. The one thing that did move is the empty
state, which was `flex-1` and stretched to the full card: it is `py-6` now, a
box the size of the sentence in it. What the content height then exposed - that
it was not the same on both tabs - is the section after next.

### The dashboard is the same height on both tabs

`max-h` made the card fit its content, which exposed the next problem: the
content was a different height on each tab, so `Current` -> `Past` resized the
popup under the pointer. Two things caused that and both are gone.

**The queue is no longer capped; it scrolls.** `Past` holds more records than
fit, and the five-row cap clipped them with no way to reach the rest in the
card. `QueueBody` renders every row now, its list is `overflow-y-auto` inside
a `grid-rows-[minmax(0,1fr)]` cell (the S07 two-column grid got the same, so a
grid item can shrink below its content), and the detail strip stays pinned
under it. The `N more records` button, `MAX_QUEUE_ROWS`, the invisible
off-tab twin and `offRows` are gone: with the card a fixed 80% box, the height
no longer depends on the content, so there was nothing left for the twin to
hold steady. `IncidentQueueDialog` is still in the file but nothing opens it.

The paragraphs that follow describe the earlier capped design.

**The queue is capped on both tabs now, not just `Current`.** `scrolls` was
`tab === "past" || phone`, so `Past` rendered every record and scrolled while
`Current` rendered five and did not - a five-row card against a 92dvh one. It
is `phone` alone now: on a desktop both tabs show `MAX_QUEUE_ROWS` and the
`N more records · show the full queue` button, and the full list is where it
always was, in `IncidentQueueDialog`. The list's middle overflow branch went
with it - it is `overflow-visible` on a phone and `overflow-hidden` otherwise.

**The other tab is rendered too, invisibly, so the card is sized by the taller
of the two.** `QueueBody` is the extracted block - empty state, rows, overflow
button, detail strip - and `SecurityIncidentCentre` renders it twice into one
CSS grid cell (`col-start-1 row-start-1` on both), the live one over an
`aria-hidden invisible` copy fed the off tab's rows. A grid row is as tall as
its tallest item, so the height is the max over both tabs and does not move
when you switch. `visibility: hidden` keeps the copy out of the tab order and
the a11y tree, and capping the rows first is what keeps it cheap - the ghost is
never more than five rows and a strip.

`queueOf(base)` is the filter-and-sort lifted out of the old `rows` memo so
both tabs go through the same one; `rows` and `offRows` are two calls to it.
The ghost selects its own first row, so it carries a detail strip of
representative height rather than none.

### Every popup size has a phone size

The readability pass that took the cards up a step was written for a desktop
window: it set `text-[11.5px]`, `text-[14px]`, `text-[19px]` and the rest with
**no `max-sm:` or `short:` variant on most of them**, so a phone got the desktop
size on a third of the width. Thirty-five class strings across this file - the
section labels, the capability lines, the counter tiles, the chips, the filter
menus, the incident rows and their expanded detail, the audit log, the row
actions - were sized for one screen and inherited by every other.

Each now carries both variants, one readable step down:

| authored | on a phone |
|---|---|
| 19px (field value) | 16px |
| 17px | 15px |
| 15px | 13px |
| 13.5 - 14px | 12 - 12.5px |
| 12.5px | 11px |
| 11 - 12px | 10 - 11px |
| 10.5px | 10px |

**Both variants, set to the same value**, because the two describe the same
device from different sides: `max-sm` is `max-width: 640px` and catches a phone
held upright, `short` is `max-height: 540px` and catches the same phone on its
side, where the width test does not fire. A card is small type in either grip.

**10px is the floor.** The rule dropped two captions to 9.5 and they were put
back: below ten the label under a counter stops being a label. Three strings are
left untouched for the same reason - the `LIVE` badge and the journey stage pill
at 10px, and an avatar's initials at 9px are already at or under it.

### A blank reading is not a row

`isBlank` drops any field whose value is empty, `-` or an em dash, and `shown`
now filters on it as well as on `eventOnly`.

At rest this changes nothing - those six rows are all `eventOnly` and were
already hidden. It matters **during an event**: `shown` lets every `eventOnly`
row through once an incident is open, and S06 has four (`Detection Time`,
`Duration`, `Confidence`, `Classification`) whose authored value is an em dash
until a trigger fills them. A card that raised an anomaly would have printed
four dashes among its real readings.

An em dash is a placeholder for a value that has not happened yet. A row that
says nothing should not be on the card, so it is not; `pending` fields are
exempt, because those are deliberately drawn as waiting.

**Enlarging is a video, not a picture.** `ClipViewer` replaces `PosterViewer`
for these two: the same full-screen black surface and the same Escape-on-capture
rule, with `controls` on, because a clip someone opened deliberately is one they
may want to scrub. `PosterViewer` stays for any row that still carries a
`poster`.

**The clips are on the bucket with everything else**, `s04-video.mp4` and
`s06-video.mp4` under `security-thumbails/`, re-encoded to 0.94 MB and 0.63 MB
from the 1.7 MB originals. Both are 1024 x 576 and 8.00s, so the authored
`width`/`height` still describe them. `public/security/` is gone.

**`s04-video.mp4` is not faststart.** Its `moov` sits after `mdat`, so a browser
cannot start playing until the whole 0.94 MB has arrived; `s06-video.mp4` is
fine. The `poster` covers the wait, and a re-export with
`-movflags +faststart` removes it.

### S04's popup is a picture, not a grid

`HotspotConfig.poster` - when a hotspot carries one the card renders it wide
(`min(1280px, 100vw - 32px)`) and the field grid is hidden. S04 carries
`https://s3.dualstack.us-east-1.amazonaws.com/holotwin.mixie.co/adaptive-loading/la-port/v9w-inst-mo/assets/security-thumbails/cam-04-analytics.png`, 1608x978.

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

**On a phone the poster card was a strip.** At `min(860px, 100vw - 32px, ...)`
with 10px of padding, a 390px screen gave S04 a **339px-wide, 206px-tall**
picture on an 844px-tall display - and everything worth reading in a poster is
baked into it at the scale the render was composed for. The gutter went to 12px
and the padding to 6 on `max-sm`, which is worth 24px and not the answer.

**The answer is that a phone has the height, just not on that axis.** Tapping a
poster opens `PosterViewer`: full screen, black, the image at `h-[100dvh]` with
`w-auto max-w-none`, inside a scroll container. A 1.644-aspect poster becomes
**1388 x 844 on a 390px-wide phone** - 3.8x the card - and pans horizontally;
S06's square becomes 844 x 844. On a wide screen the same rule simply fits the
height and centres. One class does both because `100dvh` is the constraint that
is scarce in landscape and abundant in portrait.

The viewer takes Escape on **capture with `stopPropagation`**, the same way
`IncidentLogDialog` does, so the first Escape closes the picture and the second
closes the card. It opens **centred** rather than at the left edge: the subject
of both posters is the middle of the frame, and a viewer that starts on the
margin reads as broken. It draws the same `unoptimized` URL the card does, so it
comes out of the cache the preload already warmed.

**`unoptimized` is why the preload has to match.** The card bypasses
`/_next/image` and fetches the raw file; a warm-up that asked the optimiser
would have populated a variant nothing ever requests. `StillPreload` carries the
flag for the same reason it shares `POSTER_SIZES` - a preload is only worth
anything if it asks for the byte-identical URL.

### S06's popup is a picture too

`https://s3.dualstack.us-east-1.amazonaws.com/holotwin.mixie.co/adaptive-loading/la-port/v9w-inst-mo/assets/security-thumbails/cam-07-anomaly.png`, 1254x1254 - square, which is why `poster`
carries its own `width` and `height` rather than the card hardcoding S04's
ratio. CAM-07 on its pole over the southern yard aisle, a crate ringed in red
mid-aisle with **Dwell Time 00:12:37** against a **00:10:00** threshold, and
the panel reading FLAGGED FOR REVIEW.

S06's own `fields[]` are still authored at rest behind the poster, and the
picture shows a dwell breach. That no longer contradicts the command view, because the store
now opens with the two incidents both pictures report - see below.

### S05 and its camera swapped places

S05 is the one anchor no longer standing where `hs-v7.glb` put it. It was
hand-placed at `[-1115.9878, 12.29, -361.1906]`, rotation
`[-3.0383, 0.4875, 3.0931]` - which is where `cp_013`, its own camera, had been
standing. The table above still reports the v7 export; this is the authored
value that replaced it.

**That left the camera inside its own marker.** Anchor and camera held the same
three numbers, so travelling to S05 landed the viewpoint on top of the sphere it
was meant to be looking at. The camera took the anchor's vacated v7 spot,
`[-1122.3207, 6.684, -348.682]`, and the two are 15.10 units apart again.

**The camera's rotation is derived, not eyeballed.** `[0.4213, -0.4328, 0.1858]`
is the XYZ triple that `xyzToYxz` turns into exactly the YXZ pose
`poseLookingAt(camera, anchor)` would return, so the camera points at the anchor
to within 3e-5 rad. L03 is `walkable: false`, so `poseForHotspot` passes an
`eyeOffset` of 0 and the aim runs straight from the camera position rather than
from an eye height above it.

**Authored as `rotation`, though `target` would have been shorter.**
`LayoutCamera` accepts a `target` and `poseForCamera` prefers `rotation` when
both are present. No camera anywhere in `v5.json` uses `target`, and the debug
panel's copy button emits `rotation` - so a lone `target` here would survive
only until the next paste from the panel, then sit in the file being silently
outranked. One convention is worth more than the shorter spelling.

### S05 draws its corridor

The second `demo_zone_geometry`, and the same machinery as S03's:
`…/glb/la-port-zone-c5-crane-geofence-v1.glb`, one node `Virtual Geofence` at
`[-1279.66, 3.05, -25.32]`, 20 verts, authored in world coordinates. It is
emissive red in the bake like the water one, and `ZoneGeofence` repaints it
`#ff453a`, which is the red it is authored to show - see *The colour is
overridden, not re-baked*.

**S05 is red, S03 is green.** The two zones say different things. S03's is a
monitored boundary and draws in the layer's healthy tone, the same green a card
sets a healthy reading in. S05's is a **restricted** area - the one zone in the
layer whose whole meaning is *you may not be in here* - so drawing it in the
same green as the waterside boundary described it as the wrong kind of thing.
`#ff453a` is the red sibling of `#30d158` in the system palette the rest of the
layer's scene colours come from, so the zone stays inside one palette rather
than picking a red of its own.

It is still a colour **for the kind of zone, not for its state**: S05's card
reports four people inside and none in violation, and the corridor is red
throughout. See the same caveat under S03.

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
`…/glb/la-port-zone-c5-unauthorised-ship-optimized.glb`: **0.99 MB** on the
wire, Draco geometry and WebP textures, one node at `[-1627.84, -5.73, 450.37]`,
**35 primitives over 35 materials and 26 images**, 204,862 verts / 110,126 tris.
`KHR_mesh_quantization` as well as Draco, `glTF-Transform v4.5.0`.

**Decoded it is ~23.6 MB, and that is the number that matters.** 19.0 MB of
texture - 26 images, none above 512, priced RGBA + mips the way
`textureBytes()` prices them - and 4.58 MB of vertex and index buffers. It is
mounted outside the streamer, so **none of it is counted in `residentBytes()`**
and no budget in `ChunkManager` sees it. 35 primitives over 35 unshared
materials is 35 draw calls.

*(Re-optimised on 2026-09-22 from the 1.6 MB / 91-primitive / 38-image bake the
earlier figures here described. The `public/` pruning note above still quotes
1.6 MB because that records what was deleted at the time.)*

It is **not** gated on S03, which is the difference between it and the zone.
The craft is in the water whether or not anyone is looking at the waterside
hotspot; the boundary is an overlay that answers to the selection. That split
is also why the two are separate GLBs - the combined bake would have put the
ship inside `ZoneGeofence`, where the material pass would have painted all 91
of its materials green.

**It is not gated on the device.** It was while S03 was off phones; the 35
primitives, 35 materials and 26 images - ~23.6 MB decoded - load on every
device now. See *S03 is back on a phone, from closer*.

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
`…/glb/la-port-zone-c5-water-geofence-v2.glb`, 2 KB, uncompressed, served from
the same bucket as the posters - see *Every demo asset is on the bucket*.

**The GLB is authored in WORLD coordinates.** One node, `Water Geofence`,
carrying its own translation `[-1360.48, -3.13, -43.72]`, so `ZoneGeofence`
mounts it at identity and nothing in the code positions it. 20 verts, 10 tris:
a four-cornered footprint extruded from y -11.82 to y +1.66, four walls and a
lid, no floor. Emissive at strength 2.5 over a base colour at alpha 0.28,
double-sided - a glowing translucent boundary.

**The colour is overridden, not re-baked.** Both GLBs are emissive red
`(1, 0.09, 0.06)`; `ZoneGeofence` sets both `color` and `emissive` to the
hotspot's own `geofence.color`, defaulting to `#30d158`. S03 takes the default,
which is `tones.ok` - the same green a card sets a healthy reading in, so the
monitored boundary reads in the layer's own palette rather than a second red.
S05 authors `#ff453a`, because a restricted area is a different kind of zone -
see *S05 draws its corridor*. Strength, alpha and double-sidedness stay as
authored in both.

**It is a per-zone key, not a per-route constant.** `GEOFENCE_COLOR` used to be
a single `THREE.Color` in the component, which was right while one zone existed
and wrong the moment the second one wanted to differ. The schema's
`geofence: { url, color? }` puts the choice beside the model it recolours, and
the component memoises a `THREE.Color` per value.

**It does not track `zone_status`** - S03's card says ALARM while its zone draws
green, and if a zone is ever meant to answer to its reading, that is a rule to
write rather than a colour to pick.

**It is first-person furniture, and is now mounted like it.** `ZoneGeofence`
draws while `hotspotInfo.hotspotId ?? selectedHotspotId` names a hotspot that
carries a `geofence`, and closing the card clears only the first of those - the
selection is meant to survive, so the anchor stays picked. That is right in the
ground view and wrong the moment the view changes: open S03, close it, go up to
the dollhouse, and the green box was still lying in the water under an overview
that has no anchors in it at all.

The mount was `!activeFloor?.interior` alone, while `HotspotMarkers` two lines
above it had always been `!activeFloor?.interior && viewMode === "firstPerson"`.
A zone is the same kind of thing as a marker - an annotation on the world for
someone standing in it - so it carries the same gate now. Nothing about the
selection changed: come back down and the zone is there again, because the
anchor is still the one that is picked.

| | |
|---|---|
| footprint | 1039 x 116 units, 0.12 km², corners `(-1554, 471) (-1088, -457) (-1192, -510) (-1658, 419)` |
| standing proud | 1.66 above the node baseline; the other 11.8 is below, i.e. under the water |
| the anchor | sits **INSIDE it**, 11.9 units in from the nearest edge |

### v2 is the zone catching up with the anchor

**`hs-v7` moved S03 98 units and left it off its own zone.** The v1 footprint
was drawn around the old anchor - 0.2 units outside its nearest edge, near
enough that the doc called the marker "on the zone". The re-anchor pushed S03
north-west to `[-1626.1896, 10.3445, 421.6853]`, which is **42.8 units clear of
the v1 boundary**: the card would have claimed a monitored zone while its own
marker floated outside the box it drew.

`water-geofence-v2` fixes that by extending the north-west end. Only the two
northern corners moved - `(-1529, 422) -> (-1554, 471)` and
`(-1633, 370) -> (-1658, 419)` - so the quay end is untouched and the zone grew
along its long axis rather than being redrawn.

| | v1 | v2 |
|---|---|---|
| long axis | 984 | **1039** |
| width | 116 | 116 |
| area | 0.115 km² | **0.121 km²** |
| the S03 anchor | 42.8 units outside | **11.9 units inside** |

**Everything else is byte-for-byte the same construction.** Same single node
`Water Geofence` at the same translation `[-1360.48, -3.13, -43.72]`, the same
20 verts and 10 tris, the same y span -11.82 to +1.66, the same
`Water_Geofence_Emissive` at strength 2.5 over alpha 0.28, double-sided. Nothing
in `ZoneGeofence` changed and nothing needed to: the whole edit is four numbers
in the vertex buffer.

**v1 is kept, not overwritten.** `useGLTF` caches by URL and the release path
clears that cache per URL, so a zone replaced in place can be served from cache
after a reload - the same trap the stills carry, for the same reason. Bumping
to `-v2` is what makes the swap take. v1 is not kept beside it - `public/` no
longer holds a demo GLB at all.

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
| S08 | `1 ACTIVE ALERT`, 2 incidents | all `NORMAL`, 0 — now on the `S07` row |

The tell on S04 is that its `event_time` (`2026-09-15 14:42:18`) is the same
timestamp S07's incident carries. The spec's S07 incident **is** S04's
detection, and §5 step 2 has the presenter *trigger* it. A camera already
reporting it would start the demo at step 3.

**Every displaced value is recorded here**, because `v5.json` no longer holds
notes of its own - see *The site files carry no notes*. This table IS the
record; the .docx need not be re-read to rebuild the event state.

| | held-back values |
|---|---|
| S04 | `detected_class` PERSON, `confidence` 97%, `event_time` 2026-09-15 14:42:18, `severity` HIGH, `incident_status` ACTIVE |
| S06 | `event_type` UNATTENDED OBJECT, `detection_time` 2026-09-15 16:21:08, `duration` 00:04:32, `confidence` 91%, `classification` UNCLASSIFIED OBJECT, `review_required` YES, `severity` MEDIUM |
| S07 | SEC-DEMO-0042, RESTRICTED-ZONE INTRUSION, HIGH, source AI VIDEO ANALYTICS via CAM-DEMO-04 at YARD-DEMO-RZ-02, 2026-09-15 14:42:18, `acknowledged` YES, INVESTIGATING |
| S08 | waterside 1 ACTIVE ALERT, restricted zones 1 EVENT, 2 active / 1 high / 1 medium / 0 critical |

S04's `event_time` and S07's match because the spec's S07 incident IS S04's
detection, which is why both are held back to rest together.

Nothing triggers events yet. When that is built, the event state is applied
through `setHotspotFields`, not by editing the file.

---

## 6. Incidents

S07 is **a list, not a record.** The spec's own numbers require it:

- The spec's S08 reports `active_incidents: 2`, one HIGH and one MEDIUM,
  simultaneously.
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

**There is no trigger control on screen any more.** The command view carried a
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

### The day is today, and the clock is gone

**`DEMO_DAY` was `2026-09-15`; it is now resolved at load from `new Date()`.**
A layer whose whole subject is a shift's worth of incidents cannot open on a
date eight days behind the machine showing it - the first thing an operator
reads is a heading, and a stale one says "recording" before anything else has a
chance to say "live".

**The authored times are a SCHEDULE, not a date.** Moving the day forward puts
half the table in the future - a record stamped 17:08 is not something that has
happened at 13:00 - so `DEMO_TIME_SHIFT_MS` slides the whole schedule instead:
one offset, computed once from the newest seeded stamp, that lands it
`NEWEST_AGO_MS` (15 minutes) before now. Everything after it is in the past by
construction, relative gaps between records are exactly as authored, and the
rehearsed story still runs in the order it was written.

**`parseDemoTime` applies the shift to authored stamps only.** The two shapes
this layer stores are already distinguishable: `YYYY-MM-DD HH:MM:SS` is
authored, and an ISO string with a `T` is what a live action writes through
`appendAudit`. A live entry is a real instant and must not move. The seeded
audit log used to build `${DEMO_DAY}T${hms}.000Z` - a `T` *and* a `Z`, so it was
both taking the live path and being read as UTC against event times read as
local. It writes the authored shape now, which fixes a timezone skew between a
record and its own log that nothing had noticed.

**`formatClock` and `formatStamp` became `formatAgo`** (since removed: see "No
clock times or ages in the security layer"). `4:21 PM` is a fact
about a rehearsal, not about the run being watched: it is wrong by a few hours
for most of the day, and it is the one reading in the card that a viewer can
check against their own clock and catch out. `18 min ago` / `3 hr ago` /
`2 days ago` is also simply the reading a queue wants - triage is about age, not
about wall-clock. It degrades correctly at the edges too: a negative gap, which
is what a just-triggered event produces, reads `just now`.

**The prior shift is six records, not fifteen.** `PAST_INCIDENTS` kept
`SEC-DEMO-0035` to `0040` and the seal-tamper escalation that was `0034` was
renumbered into that range, so the six stay contiguous and a live run still
picks up at `0041` through `INCIDENT_ID_START`. Fifteen closed records made the
**Past** tab a scroll rather than a glance, and the day they described ran from
05:12 - which, once the schedule is anchored to "just before now", would have
reached back past midnight. Six spans about six hours and still carries one
CRITICAL escalation with its de-escalation, which is the only part of the
history the demo actually narrates.

### S01-S07 are internal references

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
pill, the expanded detail's severity value, and the command view's per-system status lines. Those
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
Record, Type, Severity, Status, Source, Source ID, Location and Assigned team.
`Event time` and `Closed in` were removed with every other time reading.

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
| Audit · N | opens that incident's log in a dialog, N being how much is in it |

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

`history` is kept separate from `incidents` on purpose: the queue is what the
command view's counters are derived from and what the incident list works through, so folding closed history
into it would open the demo with a backlog already done and a resolved count
that never moves. Resolving a live incident retires a copy into `history`.

### Audit history

`audit` is an append-only log of the whole session, oldest first, unlike the
queue which reads newest-first as a worklist. It records `event_triggered`,
`incident_raised`, `incident_acknowledged`, `incident_escalated`,
`incident_resolved` and `demo_reset`.

It starts with a prior shift: **6 closed incidents and 38 log entries**,
5 to 8 lines each, numbered 0035-0040 so a live run picks up at 0041 and the
sequence reads continuously. It was fifteen records reaching back to 05:12 - see
*The day is today, and the clock is gone* for why it is six.

Both are GENERATED from one `PAST_INCIDENTS` table, which describes each past
incident and the steps it went through. Two hand-written lists would drift the
first time either was edited, and a log that disagrees with the record it
describes is worse than no log. Each record's severity is walked forward through
its own escalations, so the record and its log can never disagree about where it
finished.

The day is shaped to read like a real one rather than a uniform sample: several
routine things closed in minutes, and one seal alert that ran 49 minutes through
escalation to CRITICAL and back. That alert is the reason the trim kept the
record it did - it is the only one whose log has a shape. Most lines are `incident_note` observations
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

### The dashboard reads at arm's length

The merged card was drawn at the sizes the field grid uses, and a grid of
readings and a dashboard are not the same reading task: a grid is looked AT, one
row at a time, and a dashboard is scanned. At 9.5-12.5px the capability lines,
the counter captions, the chips and the incident rows were all legible and none
of them were *glanceable*, which on the one card meant to answer "is anything
wrong" is the whole job.

**Everything came up one step, and the card came out wider.** The security
centre is `min(880px, 100vw - 32px)` against every other security card's 760,
because six two-column capability lines at a readable size do not fit 620
without wrapping the state off the end of the label. The rest, in order of how
much it moved:

| | before | now |
|---|---|---|
| section label | 10px | 11.5px |
| capability label / state | 12.5 / 11.5px | 13.5 / 12.5px |
| counter caption / number | 9.5 / 21px | 10.5 / 26px |
| chips, filters, actions | 10.5-11px | 12-12.5px |
| incident row: time / title / source | 11 / 12.5 / 10.5px | 12.5 / 14 / 12px |
| expanded detail: label / value | 10.5 / 12px | 11.5 / 14px |
| audit log: time / line | 10 / 11px | 11.5 / 12.5px |
| field grid: label / value | 10.5 / 18px | 11.5 / 19px |

**A zero is faint.** `CounterTile` dims its caption and drops its number to
`--nav-text-faint` at 0.5 opacity when the count is zero. Four tiles of equal
weight made "0 critical" as loud as "2 active", which is the opposite of what a
counter row is for - the eye should land on the number that is not zero.

**"Event" became "alert".** `statusFor` wrote `1 event · HIGH` on a capability
line, and "event" is the word §5 uses for *the thing a presenter triggers*,
which is not what the line reports: it reports how many incidents from that
system are still open. `alert` says the same thing in the same width without
borrowing the trigger's word. `CapabilityLine` is still the only place it
appears; the counters below say `incidents`, which is the record, and the two
are deliberately different words for deliberately different things.

**Counts came out of the tab labels and back beside them.** `Current 2` /
`Past 15` put a number inside a control's name, so the tab read as "the
Current-2 tab" and changed its own label whenever anything was resolved. They
went to a `2 open · 15 closed` aside on the heading row, which separated the
number from the thing it counted by a whole line. `Chip` now takes a `count` and
draws it as **its own pill inside the chip**, dimmer than the label and tinted
with the chip's own state. The tab is still named `Past`; the number is a
reading on it rather than part of what it is called, and it sits where it is
being read. `The day · Sep 15, 2026` lost its prefix for the same reason and
gained `N shown`, which is the one number the filters above it actually change.

**No operator beside a row.** `IncidentRow` drew the owning actor's avatar at
its right edge, after the severity pill. Removed, with the `ownerOf` lookup
behind it: a queue row answers *what happened, how bad, how long ago*, and who
owns it is a fourth thing competing at the end of a line that already truncates.
`SECURITY_ACTORS` and the per-entry `actor` are untouched, and the **audit trail
still carries an avatar per line** - that is where "who did this" is the
question being asked, rather than a label on a headline.

**Names were shortened for the list, not for the card.** `name` is what the
Resources tree prints - uppercase, tracked, truncated inside a 52px-indented
row - and `AI Anomaly / Unattended Object` had no chance in it. The seven are
`Access Control`, `Container Screening`, `Waterside Perimeter`, `Video
Analytics`, `Restricted Zone`, `Unattended Object` and `Security Dashboard`.
`popupTitle` is untouched and still carries the full name, because the card
header has 880px and a truncated heading is the one place a long name actually
costs something. `SECURITY_EVENT_GROUPS[].title` took the same six, so the
**All sources** filter and the Resources row say the same word for the same
hotspot.

### The command view

`incidentCounts()` derives the ten readings from the incident list rather than
storing them, and the card recomputes them on every change: the per system status
lines follow the category of each incident's source, so raising an S01 event
moves "Access Control" and nothing else, reporting the worst open severity rather
than the most recent. §8 requires "S08 counts/status update when demo incidents
change state", and a second copy of a number that must agree with a list is a
number that will eventually disagree with it. Since the merge, the list it is
derived from sits directly underneath it on the same card.

**The ten readings are not a field grid.** S07 is the one hotspot whose card does
not print `fields[]` through the generic two-column grid. The ten are two
different kinds of thing, and as ten identical label-above-value rows the card's
two questions — *is everything up* and *how much is open* — had to be picked
apart by reading the labels. `SecurityCommandView` splits them on the authored
field name, which is the same key `commandViewFields` derives against:

| | |
|---|---|
| `*_status` | **Systems** — six lines, a name against a state, two columns |
| `*_incidents` | **Open incidents** — four tiles, one large number each |

A capability line is CAPS with a dot in its own colour, by the same rule the
field grid follows: a toned value is a status flag, and flags are caps. A line
that has gone to "2 ALERTS · HIGH" ends in a severity word, so its explicit
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

### The feeds are fetched before they are asked for

S04 and S06 play `s04-video.mp4` (990 KB) and `s06-video.mp4` (660 KB) from
S3. A `<video>` only starts downloading when the popup mounts, so every first
open waited on the network, and `s04-video.mp4` is not fast-start (its `moov`
index sits after `mdat`), which costs a further round trip to the end of the
file before the first frame.

`StillPreload`, once `ready` (the loader is done), calls `warmClip` for every
`clip.url`: one `fetch` per URL, the body kept as a `Blob` and exposed as an
object URL in `clipBlobs`, with the in-flight promise in `clipLoads` so nothing
is fetched twice. The bucket answers `Access-Control-Allow-Origin: *`, which is
what lets a `fetch` read it. `ClipBlock` takes its `src` from `useClipSrc`:
the object URL when the clip is warm, nothing while its fetch is still in
flight (then the object URL when it lands, so the open does not start a second
download), and the plain S3 URL when no warm-up was started or it failed.

Re-encoding `s04-video.mp4` fast-start (`-movflags +faststart`) would still
help the cold path - a popup opened before the loader finishes - but is an
asset change outside this repo.

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

### Moving a CP or an HS from the app

`?debug=true` already carried a camera editor: pick a resource, arm **edit
camera**, drag the six inputs, **Save…** writes the block into the site file.
It could not touch two of the three things this layer is made of - a security
row's camera, or **any** anchor position - so re-placing an `hs_sNN` meant
editing JSON against numbers computed offline.

**Both halves are editable now, through TWO independent sets of inputs.** The
panel carries a `cp` block and an `hs` block, each with its own rows and its own
Edit toggle. Both can be armed at once, and neither ever writes to the other.

| | what it edits | how you move it |
|---|---|---|
| **cp** | `…[id].camera` position + rotation | fly the camera, or drag `cp x/y/z/pitch/yaw/roll` |
| **hs** | `…[id].position` | drag `hs x/y/z`, or **hs drop to navmesh** |

**This reverses the single-select the panel shipped with, and the reversal was
earned.** The first version had two input groups, which was confusing for a good
reason: an `ax/ay/az` group in its own folder meant the `x/y/z` a presenter was
already watching kept reporting the camera while anchor mode was armed. The fix
chosen then was one `x/y/z` behind an `off / camera (cp) / anchor (hs)` select.

That fix had a worse failure mode, and S05 is the record of it. With one row and
one **copy** button, what the clipboard holds is whatever the select last
pointed at - and the button most often reached for copies the *camera* pose. An
anchor placed from that clipboard lands exactly on the camera. S05's marker and
its CP traded places three times over one session and twice ended up sharing a
position to four decimal places, which puts the viewpoint inside the sphere it
is meant to be looking at. Two labelled blocks cannot produce that paste: the
rows say `cp` or `hs` in their own names, and so does each copy button.

**`place at camera` is gone.** It set the anchor to the camera's position -
the one action whose whole purpose was to make the two identical. Nothing
replaced it; **hs drop to navmesh** and **hs reset** stay, because neither can
collapse the pair.

`pitch/yaw/roll` are still camera-only. A hotspot's `rotation` is documented in
`schema.ts` as data only - the marker is a sphere and nothing renders with it -
so an anchor has no orientation to edit, and the panel offers no rows that would
do nothing.

**Arming one no longer disarms the other.** `setCameraEdit` and `setAnchorEdit`
each set their own flag and stop there. They were mutually exclusive so the two
would not fight over one drag; with a row per block there is no shared drag left
to fight over.

**An anchor edit is a DRAFT until it is saved.** It lives in
`debugStore.anchorDraft` as `{ id, position }`, and `hotspot-markers` draws that
row's disc at the draft instead of its authored position - so the marker itself
is the feedback, moving under the cursor. **hs reset** drops the draft and the
disc snaps back; a save clears it because the file now says the same thing.

### Two panels, both shut

The Leva panel is two folders, `navigation` and `camera and anchor`, and both
open collapsed. Nothing in either is needed to watch the demo - they are
authoring tools - and a panel that opens showing twenty rows over the scene is
one a presenter has to close before every run-through.

`navigation` holds the navmesh overlay, its occlusion toggle and the triangle
count. `camera and anchor` holds `fov` and the two blocks above it.

**The left-hand popup is gone.** `DebugCameraEditor` was a fixed card at
`left-3 top-3` duplicating the panel's readouts and carrying the only **Save…**
in the layer. It is deleted, and saving moved into the panel as `cp save` and
`hs save`: the first click arms and prints the path it would write, a second
click within 6 s commits, and anything else lets it lapse. `saveCamera` and
`saveAnchor` are unchanged - only what calls them moved.

### What the helper is for

An anchor is a bead the size of a coin somewhere in a terminal a kilometre
across, and the thing being judged is never the bead on its own - it is
**whether the camera paired with it actually shows it**. That is a relationship
between two points and a direction, and none of it is visible in the scene:
the CP is where the camera IS, so it is off screen by definition, and the bead
gives no clue how far away or how far off-axis it sits.

`DebugAnchorHelper` draws that relationship. It mounts on `debug`, renders
through walls at `depthTest: false`, and every part answers one of the questions
this layer kept having to answer offline:

| | | answers |
|---|---|---|
| octahedron + three 6-unit axes | on the anchor | where the anchor is, when the marker is too small or behind something |
| **drop line to y 0** | anchor → ground | how high it floats - the thing that put S05 above its own corridor lid |
| cross + 12-unit forward ray | on the CP | where the camera stands and which way it looks |
| **sight line** | CP → anchor | the two together: a long line means a distant shot, a line at an angle to the ray means an off-centre one |

The panel puts a number on the same picture - `range · Nh / Nv`, and
`OUT OF FRAME` when the anchor leaves the authored FOV. That readout is the same
arithmetic §4's CP table is built from, `poseForCamera` to YXZ and then the
forward vector, so the panel and the table cannot disagree.

**Every S03 and S05 problem in this document is one the helper would have shown
at a glance**: an anchor 42.8 units outside its own zone, a camera 706 units
away pointing 26 degrees wide, an anchor and a CP that both drifted above a
corridor that stands 6.1 high. All of them were found by exporting numbers and
computing off-centre angles in a scratch script. The helper is that script,
drawn in the scene, while the thing is still movable.

**The save route learned three things.** `/api/debug/camera` was scoped to
`v1`-`v3` and wrote `layouts` or `hotspots` only:

- `SITE_IDS` now includes `v4` and `v5`, without which nothing on this route
  could be saved at all.
- `kind: "security"` reaches `securityHotspots[]`.
- `field: "position"` writes the anchor instead of the camera. `"camera"` stays
  the default, so every existing caller is unaffected, and `field: "position"`
  on a layout is refused - a layout has no anchor.

It is still `NODE_ENV !== "development"` → 404, still rewrites the whole
document with `JSON.stringify(doc, null, 2)`, and `v5.json` round-trips through
that **byte-identically**, so a save shows up as the four lines it changed.

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

- **S03's `mobileCamera` is not checked on a real phone yet.** The numbers say
  the craft is clear of fog and inside the 545 m disc; what is unconfirmed is
  the framing at a portrait aspect, and that nothing in the stream stands
  between the camera and the craft.

- **`stream.mobileFarScale` is now a lever nothing pulls.** Still read by
  `mobileProfile` and still in the schema; no site file sets it. It is safe to
  author again now that `residentCapBytes()` bounds the result - the far edge
  thins instead of the tab dying - but nothing needs it.

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
- **Highlighting**, as distinct from filtering. The spec's S08 Expected interaction says
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
