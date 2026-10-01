# VR routes: `/v2/vr`, `/v3/vr`, `/v4/vr`, `/v5/vr`

Every variant has a separate VR page that opens the same scene in a WebXR
headset. The VR basics come from the 3di admin frontend
(`3di-admin-frontend/src/components/vr/experience/`).

**The VR pages are separate, and the 3D is untouched.** Everything VR lives in
`src/vr/` and in a `vr/` folder inside each tree. The VR page mounts the tree's
own `TerminalProvider` and `SceneGraph` unchanged. It does NOT mount the flat
`Overlays`: of the 3D UI it shows only the HoloTwin loader (`VrLoader`, the same
`HoloTwinHud` with the same completion rule, `revealProgress >= 0.999` and
`othersCached`). Nothing under
`/v2` to `/v5` imports VR code, and no 3D file needs a VR branch.

Branch: `feature-vr`.

**A headset opening `/vN` is sent to `/vN/vr`.** `src/proxy.ts` (Next 16's
renamed middleware) matches only `/v2` to `/v5` and redirects when the user
agent is a headset browser: Meta Quest (`OculusBrowser`, `Quest`), Pico,
Wolvic, Firefox Reality, Samsung Internet for Gear VR (`Mobile VR`). The query
string is kept. Adding `?flat` keeps the flat page in a headset. Vision Pro
Safari reports a desktop Mac user agent, so it is not redirected.

## Sequence

1. **Page.** It shows the 3D loader and nothing else: no bottom bar, flap,
   minimap or instructions card. When the loader has faded out and the scene is
   ready, an **Enter VR** popup covers the page (a dark card in the reference's
   style, with no controls list). A browser without WebXR
   gets "Use a VR headset" in place of the button.
2. **Doll House View.** Enter VR puts the headset at the site's dollhouse
   camera, looking over the terminal. Its instructions panel opens first:
   "Doll House View", with a full-width "Start exploring" button.
3. **Home position.** Pulling the trigger twice (the double click), or pressing
   Home on the bar, goes down to the home position (the floor's start pose)
   through the flat experience's own fade. The **First Person View**
   instructions open ("Start walking").
4. **Bottom bar**, the same buttons as the 3D bar, with Resources moved into
   it:

   First person: Home, First Person, Dollhouse, Info, Map, Resources, Hide icons,
   Exit. From the dollhouse, a button that travels first enters first person
   (`handleEnterFirstPerson`, the same entry as Home) at its destination: First
   Person at the first-person pose, a Resources layout or map pin at that
   destination's camera, and a hotspot at its layout's camera, after which the
   travel to the hotspot runs once first person is up (`runQueued`). Dollhouse
   is lit while you are in it.

   - **Home:** in the dollhouse it goes down to the home position; in first
     person it returns there.
   - **First Person:** the first-person pose.
   - **Dollhouse:** back up to the dollhouse view.
   - **Info:** that view's instructions again.
   - **Map:** the flat minimap's plan with the player and the floor's
     destinations; see "Map" below.
   - **Resources:** the flat Resources tree: Security first (v4 / v5), then
     the layouts. A group's chevron button opens it in place, showing its
     hotspots indented beneath; pressing a layout's name travels there, and
     pressing Security opens it. Selecting a
     hotspot travels there. Its icon is lucide `Images`, the reference's
     Layouts ("gallery") glyph.
   - **Hide icons:** puts the bar away, as the ARCHVIZ reference's "Hide bar"
     does. A hidden bar has no button to bring it back, so B or Y (the upper
     face button on either controller) does. A new view (dollhouse or first
     person) starts with the bar up.
   - **Exit:** ends the session.

   The dollhouse bar has only Home, Info, Hide icons and Exit
   (`DOLLHOUSE_BAR` in `ui/panels.tsx`), and its instructions list only those.

   Pointing at a button brightens its glass ring and shows its name in a glass
   pill just above that button (`IconButton`'s `label`).

Each view's instructions open by themselves once per session. Info reopens them.

**The two requested changes from the 3D:**

- **Resources is a bar button.** There is no side flap.
- **Walking is by controller, not pathfinding:**

  | input | action |
  |---|---|
  | left stick | walk where you look, flattened to the floor |
  | left grip, held | run (4x) |
  | right stick left / right | snap turn 30 degrees about the head |
  | right stick up / down | scroll the card or list the ray last pointed at |
  | trigger held and moved over a card or list | drag it to scroll, 1:1 |
  | trigger | press a hotspot marker, a button or a menu row |
  | either stick left / right (dollhouse) | turn round the terminal's centre, a full 360 degrees, 60 degrees a second |
  | trigger twice (dollhouse) | go to the home position |
| B or Y | show the bar again after Hide icons |

**Orbiting the dollhouse** (`rig.tsx`). The pivot is the model's centre, the
`center` of the bounds the scene publishes to the shared `useWorldStore` (the
same bounds the flat `DollhouseCamera` reads), so the turn swings round the
middle of the terminal. Until those bounds exist it falls back to
where the dollhouse camera's line of sight meets the ground (the home
position's height, 20-4000 units ahead, or 300 when the camera looks nearly
level), and moves to the centre once they arrive. Entering the dollhouse puts you 40% nearer the pivot than the flat
dollhouse camera (`orbitNear: 0.6`). The stick only turns: a full circle round
the pivot at the height you entered at. There is no rise and fall, and the
view is never tilted.

**Your height is held in the dollhouse.** The rig used to cancel the head's
vertical movement every frame to keep the eye at the authored height. The
correction reaches the headset one frame late, so every nod shook the whole
model up and down. The height is now taken once, on entering the dollhouse, and
not corrected again; a physical head movement moves your view as it should.

The orbit stays until the view changes; coming back to the dollhouse starts
from the authored pose again.

## The in-headset UI matches the 3D

The panels use the flat UI's glass rather than a VR style of their own
(`src/vr/ui/tokens.ts` holds the values):

- **Bar:** `/v5`'s flat `BottomBar`, the same in the dollhouse and in first
  person: separate round glass buttons with no pill behind them, the
  `--nav-glass` tint (`#090b0f`) with the `--nav-border` hairline (white at
  0.14), white glyphs at 0.86, a small grow on hover, and the `--nav-accent`
  blue fill for the view you are in (Dollhouse, while in the dollhouse). The
  flat bar's frost is a CSS `backdrop-filter`; a headset has no backdrop to
  blur, so the tint is 0.6 instead of 0.52 to keep the glyphs readable. The
  hovered button's name shows as plain text above it. Hide icons and Exit are
  the VR additions, in the same style (Exit red on hover). It sits 30% up the
  panel view (see "Panels sit in the room").
- **Instructions:** laid out as the reference's VR instructions
  (`components-v5/vr/instructions`): a dark glass panel (`INSTR` in
  `ui/panels.tsx`) with the title top left, one table of rows, and a
  full-width blue button at the bottom ("Start walking" / "Start exploring").
  Each row names the control in the left column, in blue text for a stick,
  grip or trigger, or as the bar button's own icon in a round chip, and says
  what it does in white text beside it. The button is the bright blue
  `#2997ff`; the deeper `#0071e3` read as dark in the headset. Each view lists only its own controls
  and buttons, so nothing listed is missing from where you stand.
- **Resources:** `/v5`'s flat `HotspotsFlap` panel at its desktop sizes
  (`FLAP` and `TRAVEL` in `ui/panels.tsx`): the card glass 340 px wide with
  14 px corners, the flap's label as its header, and each group a 32 px
  chevron button (a square hover fill, 8 px corners; down when open, dimmed
  right when shut) beside a `TravelRow`: white at 0.05 with a white 0.12 border,
  16 px corners, 14 px padding and a 13.5 px semi-bold uppercase name. Open
  groups list their hotspots as the same rows, 52 px in. A disabled hotspot
  shows at 0.4. The flat panel's search field and ground-view (walk) button are
  left out: the headset has no keyboard, and hotspot travel in VR always lands
  first person.

## Why colours looked washed out

uikit draws a container's panels in batches keyed by nesting depth, and inside
a batch it only orders panels by depth (`patchIndex`); siblings at the same
depth come out in whatever order they were allocated. Every glass background
here (`Glass`, and `Surface` which wraps it) is an absolutely positioned
sibling of the content it sits behind, so a red close disc, a blue button, a
blue active chip or a pin could be drawn under the 62%-black glass instead of
over it, and read as grey-red or dark blue. `Glass` now sets `zIndexOffset: -1`
on its layers, which puts them at their parent's depth: parents draw before
children, so every glass layer is behind everything it frames. Icons on the
bar are drawn at full opacity.

## Hotspot cards: each route's own 3D card

Pressing a marker opens that route's own 3D hotspot card, rebuilt in uikit. Each
tree's bridge hands the headset its card as `Card`, together with the open
`hotspotInfo` (`destId`, `index`, `hotspotId`) as `card`. The HUD renders it
with the same props the flat `HotspotDataCard` takes.

| route | VR card | what it carries over from the 3D card |
|---|---|---|
| v2, v3 | `src/vr/cards/simple-card.tsx` | header, journey, two-column fields with tone colours and meters |
| v4 | `src/terminal-v4/vr/hotspot-card.tsx` | the above plus alert banner, still above the fields, poster card, S08 capabilities and counters, S07 incident centre (tabs, severity chips, source and sort menus, day heading, expandable rows with Acknowledge / Escalate / De-escalate / Resolve / audit trail / View location), source incident rows, audit log |
| v5 | `src/terminal-v5/vr/hotspot-card.tsx` | the v4 set in v5's design (its field sizes, uppercase labels, `CardHeader` on security cards), plus the designed security layouts (clip or still panel above a hero tile, reading rows and the alerts list; or the hero, identity grid and stat tiles), the live clip with its LIVE badge and play/pause, the S07 command view above the incident list and its detail strip, and the poster with press-to-enlarge |

The pieces they share (card glass, header and close button, fields, meters,
section labels, alert banner, journey, still, clip, poster, chips, pills,
actions, avatars) are in `src/vr/ui/card-kit.tsx`. Sizes are the 3D desktop
sizes (`S = 1`).

What differs from the flat card, and why:

- **No frosted blur.** The card glass is `#090b0f` at 0.82 instead of 0.48
  over a 30 px blur.
- **Panel size.** Every panel is short and scrolls. v5's 80 vw x 80 vh card is
  34% wide and at most 40% tall, v4's 620 px card 34% x 36%, v2 / v3's 32% x 36%, the audit log 26% x 32%, the map 42%
  tall, Resources 340 px x 40% and the instructions 760 px x 44%. A poster is at most 46% wide
  (80% enlarged). A card
  as big as the flat one wraps round the edge of a headset's view. Everything
  past that height scrolls with the right stick (`stick-scroll.ts`).
- **One column.** The flat v5 card sets media beside the readings, and S07's
  command view beside the incident list. At headset size those columns were too
  narrow and the text piled up, so every card is one column: media on top, then
  the hero tile, readings and alerts; S07's systems and counters above its
  incidents. Grids are two columns at most (`CARD_COLUMNS`), the incident
  detail strip included.
- **Scrolling: drag or stick** (`stick-scroll.ts`). uikit's own drag-to-scroll
  flung the list on after release and stretched it past its ends, so with a
  ray a small wrist movement left the list gliding and presses missed.
  `useScrollArea` keeps the drag but passes it through `onScroll`: a drag
  moves the list 1:1 with the ray, clamped to its ends, and the fling that
  follows (uikit calls `onScroll` with no event for it) is refused. Rows
  (`Row`, `PressRow`, the map's pin list) select on release, and only when the
  list moved less than 14 px since the press (`usePress`), so a drag never
  picks the row it started on. The right stick scrolls the list the ray last
  pointed at, even after the ray drifts off it, with an eased response (the
  push squared) and the speed smoothed in over about 80 ms, up to 1500 px a
  second.
- **Red close button.** Every card and panel has a red round close button
  (`RedClose`, 32 px, a solid bright red `#ff2b2b` disc with a white X and no
  ring, which at headset resolution blended into a greyish edge) inside its
  top-right corner, 12 px in from both edges.
  The card and panel headers keep room for it on the right (`CLOSE.size`), so
  a long title wraps before it reaches the button.
- **Labels sit in the middle of their colour.** uikit lays a box out left to
  right by default, so a fixed-width box such as the 76 px severity box put
  "MEDIUM" against its left edge, and letter spacing added a gap after the
  last letter. `Pill` centres its text both ways and cancels the trailing
  gap (`marginRight` of minus the spacing); the severity box, chip counts,
  action buttons and avatars all centre the same way. The font was checked:
  in uikit's 1.2x line box, capitals already sit on its centre.
- **Text never overlaps.** uikit keeps text in a row from shrinking below its
  longest word, so a long ID or status pushed into the next column. `VrText`
  sets `minWidth: 0`, so every line wraps inside its own column. A card's
  whole body scrolls as one, so nothing can run past a short card's edge.
- **Dropdowns open inline.** The source and sort menus push the list down
  instead of floating over it.
- **The audit log replaces the card** while it is open, rather than stacking a
  second dialog over it. Closing it returns to the card.
- **Avatars** show initials without the hover name.
- **The still's tilt** is a uikit `transformRotateY`, not a CSS perspective.

**Markers follow you as on the flat page.** The flat `Overlays` latches
`currentDest` from the player's position every 200 ms, and v2 and v3 show a
layout's markers only while it is latched. The VR page has no `Overlays`, so
`useDestLatch` (`src/vr/dest-latch.ts`) runs the same poll from each tree's
bridge: the same 0.8-unit reach, `setAtHome`, and closing the card when the
latched layout changes.

A headset cannot blur what is behind a panel, so the fills are the 3D values
made a little more opaque (panel black at 0.62, tiles black at 0.4, chips at
0.72) to keep text readable over a bright scene.

## How it moves the headset without touching the 3D

`@react-three/xr`'s `<XROrigin>` reparents the XR camera under a group. That
would have needed the 3D player controller swapped out. Instead, the VR rig
(`src/vr/rig.tsx`) moves the WebXR **reference space**:

- **Follow the 3D player.** Each frame the rig reads where the tree's own
  `PlayerController` wants the eye (`getPosition`, `getFootPosition`,
  `getRotationY`). In the dollhouse it reads the site's `dollHouseCamera` pose
  instead.
- **Offset the reference space.** It sets
  `gl.xr.setReferenceSpace(base.getOffsetReferenceSpace(rig.inverse))`, so the
  headset's world pose is `rig * pose`.
- **Teleports.** When the followed pose jumps by more than 2 units or 0.2 rad
  (a CP / HS / Home / First Person teleport), the rig realigns so the head lands
  on it facing the authored yaw.
- **Walking.** Small moves just translate the rig.
- **Stick walking** moves the 3D player itself. It calls `teleportTo` on the
  handle with the step, after checking `probeFloorY`, so the step stays on the
  navmesh and the rig follows.

**Why this keeps the 3D code working as it is:**

- **The camera.** The XR camera has no parent, so its position is the head's
  real world position. Streaming, the aerial/ground switch, the sky dome, the
  shadow follow and marker sizing all read it exactly as they read the flat
  camera.
- **Navigation.** `use-layout-navigation`, Home, First Person and v5's nearby
  poll all drive the tree's own `PlayerController`, and the headset follows.
- **Hotspot clicks.** The markers are meshes with an invisible collider, so a
  controller ray raises the same `onClick`.

**Two safeguards.** The 3D `PlayerController` and `DollhouseCamera` write the
camera's position and rotation every frame, and in the headset those writes are
the player's pose, not the head's.

- `rig.tsx` sets `gl.xr.getCamera().matrixAutoUpdate = false` for the session.
  Three sets that matrix from the viewer pose itself.
- `HeadPose` (`session.tsx`) sets the scene camera's `matrixAutoUpdate = false`
  for the session too, and at the start of every frame (`useFrame` priority
  -1, before any scene code) writes the XR viewer pose into its `matrix`,
  `matrixWorld` and `matrixWorldInverse`. The 3D writes still land in
  `position` and `rotation`, where the 3D code keeps its own state. Everything
  that reads the camera's world matrix then sees the real head: the streamer's
  frustum and distances, the sky dome, the shadow follow, marker sizing, the
  panels' follow and the rig itself.

  Without it the model flickered. The streamer's `camera.updateMatrixWorld()`
  at 10 Hz recomposed the matrix from the player's pose, so some frames read
  the head and others the player: chunks outside the player's (not the
  head's) view unloaded as you looked around, the panels were placed in front
  of the player's facing, and in the dollhouse the rig's height tracking moved
  the world up and down on each tick.

## Fog and streaming load in the headset

A headset draws every frame twice and shows a dropped frame as judder, so the
VR page streams more gently and hides whatever is not loaded yet.

**Fog follows the loading** (`src/vr/fog.tsx`, first person only):

- `ChunkManager` publishes, every tick, the surface distance to the nearest
  chunk with no geometry on screen yet (`streamReach` in
  `src/vr/engine/stream.ts`). Everything nearer is drawn, if only at a low
  texture rung, which does not count as missing. It resets to "unknown" when
  the manager is disposed.
- `VrFog` sets the fog's far edge to that distance, kept between 75% and 100%
  of the view's own fog edge (the phone profile's, see below; 600 m where the
  view authors none), and its near edge to 45% of it. It closes in at 1.5x a
  second when something near is still loading and opens again at 25 m/s as
  loading catches up, and never comes nearer than 75% of the view's own edge,
  so the edge does not pump. A reading older than 2 s counts as fully loaded.
- It tunes the scene's existing fog (the tree's `StreamFog`), or adds its own
  when the view has none, and puts everything back when you leave first person
  or VR.
- The camera's far plane follows the fog (in 25 m steps, 5% past it). Three
  then draws nothing hidden by the fog, which cuts draw calls for both eyes, and
  the headset's depth range shrinks with it.

**Near planes.** The camera's 0.1 m near plane leaves the depth buffer too
coarse at distance to separate stacked surfaces (road markings on pavement,
roofs on walls). A headset never holds still, and each eye resolves them
differently, so they shimmer. In VR the near plane is 1.5 m in the dollhouse,
where everything is hundreds of metres off, and 0.25 m in first person:
depth precision grows with the near plane (15x and 2.5x). The panels at 2 m
are unaffected. In the dollhouse a controller held closer than
1.5 m is clipped, and in first person a wall closer than 0.25 m.

Checked and ruled out as causes: the streamed KTX2 textures carry full mip
chains (a 512 px texture has 10 levels) and are sampled with 8x anisotropy;
the edge feather is a smooth fade with no dithering and is off in VR; the
loading reveal's hashed discard ends fully opaque.

**Phone streaming** (`setVrStreaming` in `src/vr/engine/stream.ts`, turned on
by `useVrStreaming` in each tree's `vr/index.tsx` while the page is mounted):
`detectProfile` answers "mobile", so every view resolves the way it does on a
phone and `ChunkManager` gets the phone budgets:

- the far band pulled in (`MOBILE.farScale`, or the site's `mobileFarScale`),
  and the fog edge with it, starting at 70% of the unload radius
- a 240 MB resident budget, 4 chunk mounts per tick, half the texture upgrades
- plus, for VR only: no transmission pass and `adaptiveDpr: false`, so
  `AdaptiveQuality` is not mounted. Three cannot resize the headset's
  framebuffer mid-session.

**VR quality** (`vrStreamConfig` and `VR` in `src/vr/engine/stream.ts`) is set on top
of the phone profile, the same on every route:

| View | Distance from the head | Geometry | Texture |
|---|---|---|---|
| First person (and aerial) | 0-75 m | medium LOD | 256 px |
| | 75 m to the load edge (about 500 m) | lowest LOD | 128 px |
| Dollhouse | the whole terminal | lowest LOD | 128 px |

First person sets the bands to 25 / 75 m, caps geometry at `mid`
(`sharpestTier`) and the rungs at 256 / 256 / 128. The dollhouse caps geometry
at `far` and every rung at 128. VR also turns off the phone's 15 MB download
budget (`wireBudgetMB: 0`), which would otherwise pin textures to the cheapest
rung for the rest of the session.

The kept-resident mode on /v2-/v5 only ever sharpened a loaded chunk, so a piece
seen at medium stayed medium. VR sets `coarsenResident`, and
`ChunkManager.shouldCoarsen` then also swaps a chunk down when it is sharper
than the view's cap (entering the dollhouse) or has left its band by more than
the site's hysteresis (walking away). Sharpening is still served first each
tick. The flat pages never set the flag, so they behave as before.

`isMobileDevice()` still reads the real device, so hotspot travel keeps the
desktop camera poses.

## Map

The plan is the site file's `map.plan` (every route authors one), the same
image and bounds the flat `Minimap` draws; the scene's `minimapData` is only
the fallback. It used to be the only source, and it needs a floor
`floorPlanUrl` no route sets, so the bridge had no map and the bar showed no
Map button.

The Map button opens `MapPanel` (`src/vr/ui/map-panel.tsx`), laid out as the
reference's VR map (`components-v5/vr/map-panel` in ARCHVIZ_WITH_EXTERIOR):

- **The plan travels.** Point anywhere on it and pull the trigger: the point
  is turned back into world X and Z through the plan's bounds, and
  `VrMap.travelTo` probes the floor there and teleports with the same fade as
  Home, keeping the current heading. A white ring follows the ray over the
  plan. Where there is no floor to stand on, a red ring with a cross marks the
  spot for 1.6 s and the hint beneath reads "You can't stand there - try
  another spot"; otherwise it reads "Point anywhere on the plan and pull the
  trigger to travel."
- **The player** is the flat minimap's own marker (`drawPlayerFOV`), drawn once
  onto a canvas at the VR map's scale and shown as an image turned with the
  head's yaw: the cyan dot with its white ring and glow, and the 60-degree view
  cone fading from cyan to clear with its two edge lines. uikit's SVG fills
  paths flat and has no gradient or glow, which is why the old marker looked
  different.
- **Pills** above the plan are the Resources groups, in the Resources panel's
  order: Security first (v4 / v5), then each layout, in one row that scrolls
  sideways when dragged with the trigger (`useDragScroll`, clamped at both
  ends; the right stick stays with the list below). A pill selects on release,
  and only when the row did not move, so a drag never switches the group. The chosen group's
  hotspots show as numbered pins on the plan at their marker positions and as
  a numbered list beneath it, with no distances; a layout also gets a "Go to"
  row at the top, marked Here when you are at it. Pressing a pin or a hotspot
  row goes to that hotspot (`goToHotspot`), the "Go to" row travels to the
  layout.

## Layout

```
src/vr/                        shared by all four variants
  xr-store.ts                  the XR store (kept on globalThis), enterVr(), exitVr()
  bridge.tsx                   VrBridge: what a tree hands the headset (view, poses, actions)
  create-bridge.ts             createVrBridge / layoutGroups / dressingSettled
  session.tsx                  <VrSession>: <XR>; while presenting, head pose + rig + fog + HUD + blackout
  fog.tsx                      VrFog: fog and far plane at the streamer's loaded reach;
                               the near planes (1.5 m dollhouse, 0.25 m first person)
  vr-streaming.ts              useVrStreaming: the lighter stream config while a VR page is mounted
  rig.tsx                      reference-space rig: follows the 3D player, stick walk, snap turn
  hud.tsx                      the sequence: view instructions, double trigger, menus, bar
  vr-loader.tsx                the 3D HoloTwin loader, alone: the page's only 3D UI
  enter-vr-prompt.tsx          DOM Enter VR popup, shown once the loader is gone
  ui/tokens.ts                 sizes, the 3D glass colours and opacities, pointer order
  ui/text.tsx                  VrText: folds glyphs the MSDF atlas lacks; preloads the font
  ui/primitives.tsx            HeadLocked, Glass, Panel, IconButton, Row, IconChip, Tile,
                               GroupLabel, GlassButton, PanelHeader, List, Divider
  ui/panels.tsx                BottomBar, InstructionsPanel, ResourcesPanel
  ui/card-kit.tsx              the 3D hotspot card's pieces in uikit
  ui/map-panel.tsx             MapPanel: the flat minimap's design, plan + player + pins
  cards/simple-card.tsx        the v2 / v3 hotspot card
  dest-latch.ts                useDestLatch: the flat page's currentDest poll

src/terminal*/vr/
  index.tsx                    the VR page's tree: SiteProvider + TerminalProvider + bridge
                               + Canvas(<VrSession><SceneGraph/></VrSession>) + VrLoader
                               + EnterVrPrompt
  bridge.tsx                   feeds createVrBridge from that tree's useLayoutNavigation,
                               nav-ui-store, UI context and (v4 / v5) security store;
                               runs useDestLatch
  hotspot-card.tsx             (v4, v5) that tree's hotspot card in uikit

src/app/v{2,3,4,5}/vr/page.tsx the routes
```

`src/terminal` is the v2 tree.

**What each tree's bridge supplies**

| | first-person pose | on First Person | on Home / Dollhouse | security group | security row |
|---|---|---|---|---|---|
| v2 | `site.scene.cameras.firstPerson` | - | - | - | - |
| v3 | `FIRST_PERSON_VIEW` | `enterGroundView` | - | - | - |
| v4 | `FIRST_PERSON_VIEW` | `enterGroundView`, `armStandingAmbient` | security `reset` | yes | travels, then opens the card |
| v5 | `FIRST_PERSON_VIEW` | `enterGroundView`, `armStandingAmbient` | security `reset` | yes | travels |

These copy each tree's own `handleHome` / `handleFirstPerson` / `onDollhouse` in
`overlays.tsx` and its `HotspotsFlap` rows. Change one there, and change its
bridge too.

## Starting a session (`xr-store.ts`, `enterVr`)

The browser allows one immersive session per page, and `@react-three/xr`
records a session only once its setup has finished. A session whose setup threw
was therefore left running unseen, and every later Enter VR failed with "an
active immersive session already exists". `enterVr` avoids that:

- repeat clicks while a request is pending are ignored
- every session `requestSession` creates is recorded, and one the page still
  holds is ended before a new request
- a session whose setup failed is ended before the error is shown
- the store survives dev hot reloads
- `VrSession` ends the session when the page unmounts

The error text shows on the popup and is logged as
`[vr] could not start the VR session`.

## Libraries

| package | version | why |
|---|---|---|
| `@react-three/xr` | 6.6.30 | `createXRStore`, `<XR>`, `useXRInputSourceState`, controller rays that raise R3F pointer events |
| `@react-three/uikit` | 1.0.76 | in-headset panels |
| `@react-three/uikit-lucide` | 1.0.76 | the same lucide icons the 3D uses |

## Verified so far

- `tsc --noEmit` is clean, and the VR code lints clean.
- All eight routes (`/vN` and `/vN/vr`) compile and server-render with a 200.
- **Not yet run in a browser or a headset.** On a desktop over `localhost`,
  `@react-three/xr` offers its Meta Quest emulator when there is no WebXR, which
  is the first place to try Enter VR.

**Settling behind the blackout** (`Blackout` in `session.tsx`). On the phone
profile a place is first drawn at the far LOD and the 128 px rung, then
sharpened as it comes near. A jump down from the dollhouse (First Person, Home)
or across the site (a map teleport) sends every chunk round you through that
at once, and the flat fade gives up after 1.5 s, so the swaps played out in
view as flicker. In VR the blackout now stays up after the fade lowers until
the stream settles: nothing nearer than 40 m is missing geometry, and the
chunks still wanting a sharper LOD or rung are down to 4 or 5% of their peak.
It lifts after at least 0.4 s and at most 6 s.

## Markers in the headset

`VrMarkers` (`src/vr/markers.tsx`, mounted by the session) handles the tree's
own markers from outside, without any change to the tree's marker files:

- **Finding them.** Every 0.5 s it walks the scene for the meshes each tree's
  `hotspot.tsx` names `hotspot_core` and `hotspot_hover_collider`. The core's
  parent is the group the marker sizes each frame, and that group's parent sits
  at the hotspot's position, which names it: the nearest of the site's
  hotspots and security hotspots within 0.5 units.
- **Smaller.** A marker sizes itself to a constant screen size from the camera's
  fov and the canvas height. The XR fov is about 100 degrees, so in the headset
  they came out large. `VrMarkers` hooks `scene.onBeforeRender`, which runs
  after every `useFrame`, and takes each sizing group to 0.65 of what the
  marker set, once per frame, then refreshes its world matrix. The hook is
  removed when the session ends.
- **Hover label.** The flat name pill is drei `Html`, a DOM element the headset
  never draws. Each frame `VrMarkers` casts each controller's ray (from the
  XRFrame, in the rig's reference space) against the colliders. While one is
  hit it draws a glass pill with the name just above the bead, facing the head,
  drawn over the scene, and scaled with distance so it reads the same size near
  or far. It is hidden during the blackout.

## Panels sit in the room

Every panel used to be head-locked: a uikit `Fullscreen` redrawn from the head
pose each frame. When a headset misses a frame it shows the last one again,
warped as if everything in it were fixed in the room. Head-locked content is
not, so every dropped frame made the panels swim and shimmer, worst towards
the edges of the view.

`HeadLocked` (`src/vr/ui/primitives.tsx`) now places a plain uikit root in the
room instead, sized exactly as the `Fullscreen` was (the camera's height at
2 m, its aspect, one layout pixel per renderer pixel), so every layout reads
the same. The root follows the head's position, since a stick walk or jump
must carry it, but not its turn: it stays where it is until you have turned
more than 30 degrees away, then swings back in front at 4x a second and stops
within 3 degrees (`FOLLOW` in `tokens.ts`). A panel opens straight ahead;
`yawOffset` can set one aside.

## Why the headset flickers: the model

The manifests on the stream bucket give each route's model as the streamer sees
it. At the lowest detail level, which is what the dollhouse draws everywhere
and first person draws past 75 m:

| route | pieces | full detail | lowest detail | 6 heaviest pieces | draw calls | pieces with a real low LOD |
|---|---|---|---|---|---|---|
| v2 | 730 | 2.7 M tris | 2.2 M tris | 32% | ~2,500 | 37 |
| v3 | 661 | 9.4 M | 6.4 M | 50% | ~3,700 | 96 |
| v4 | 674 | 9.3 M | 6.3 M | 51% | ~3,260 | 98 |
| v5 | 652 | 9.3 M | 6.3 M | 51% | ~3,260 | 98 |

A headset draws every frame twice, once per eye, at 72 to 90 frames a second.
A Quest is comfortable at roughly 1 to 2 million triangles and a few hundred
draw calls a frame, both eyes together. The dollhouse asks for about 12.6
million triangles and 6,500 draw calls. Every frame it misses is shown again,
warped, which is the flicker. Three.js's WebGL renderer has no multiview
(drawing both eyes in one pass) to halve that; only its WebGPU renderer does.

What the numbers say about the bake (v5; v3 and v4 match):

- **The lowest LOD is not a low LOD.** The median piece keeps 97% of its
  full-detail triangles at "far". Only 98 of 652 pieces drop below half.
- **Six pieces are half the model.** c0 to c5 (145 x 80 x 81 m each, 44
  materials each, in a line: most likely the ship-to-shore cranes) carry about
  782k triangles at full detail and 530k at the lowest, 3.2 M together. Thin
  lattice is also the geometry that shimmers most in a headset.
- **Flat ground carries tens of thousands of triangles.** Single-material
  pieces at height 0 (c9 to c14, c22, c25 to c27 and more) hold 50k to 124k
  triangles each with no reduction at any tier.
- **Many small pieces.** 488 pieces are under 5,000 triangles, each at least
  one draw call. Culling small pieces by their size on screen was measured
  against the manifest and removes under 10% of draw calls and no triangles
  worth having, so it is not done: the weight is in the large pieces.

What the model needs for VR, as bake targets:

1. **A real far LOD:** about 10% of full detail, whole model under about
   800k triangles. The dollhouse and first person past 75 m draw only this.
2. **Cranes (c0 to c5):** a VR LOD of 30k to 50k triangles each, with the
   lattice as a few alpha-tested cards rather than modelled members.
3. **Ground:** flat areas as the fewest triangles that hold their shape, with
   road markings and paint baked into the ground texture. Where a marking must
   stay geometry, lift it at least 5 cm off the surface so the two never fight
   for the same depth.
4. **Draw calls:** merge static pieces that share a material, and atlas the
   small materials, to bring the whole model to a few hundred draw calls.
5. **Glass:** single-sided, never stacked pane on pane, and as few separate
   transparent meshes as possible, so their draw order cannot change as the
   head moves.

The code side does what it can without a new bake: shadows are off by default
in VR (a shadow re-fit redraws the whole model once more on the frame it
happens; `VrNoShadows` in `src/vr/shadows.tsx` turns `castShadow` off on every
light for the session and restores it on exit), and panels sit in the room.

## The VR model budget

Measured in a headset with a diagnostics panel (since removed): 43 frames a
second against a
120 Hz display, a worst frame of 248 ms, 14.2 million triangles and 8,000 draw
calls (both eyes counted). That is five to ten times what a standalone headset
draws comfortably.

Most of it was not in the 6.3 M counted above. 450 pieces are placed as
instances (`palette.glb` plus `instances.bin`): 21,252 copies in all, and
45.9 M triangles if every copy is drawn. c33 alone is a 21k-triangle model
placed 185 times. In the kept-resident mode the instance layer synced every
copy of every piece once and drew all of them every frame, from anywhere, at
their only level of detail; one `InstancedMesh` spans the whole terminal, so
frustum culling never drops a copy.

Three changes follow:

- **The headset runs at its lowest refresh rate** (`frameRate: "low"` in
  `xr-store.ts`, 72 Hz on a Quest). At 120 Hz each frame has 8.3 ms; at 72 Hz
  it has 13.9 ms, and a missed frame is reprojected over a shorter gap.
- **A triangle and draw-call budget** (`computeAllowed` in `chunk-manager.ts`,
  resident mode, only when `coarsenResident` is set, which only
  `vrStreamConfig` does). Each tick every piece is costed: its triangles at the
  tier it would wear and one draw call per material, plus, for an instanced
  piece, each placed copy at its palette model's triangle count
  (`InstanceLayer.entryTriangles`). Pieces are ranked by how much of the view
  they cover for their cost (angular size squared over triangles, with pieces
  already shown held 30% higher so the set does not flicker at the edge of the
  budget) and taken in that order until the budget is spent. Pieces left out
  are unloaded, not mounted, left out of the instance layer (`syncInstances`
  now rebuilds it from the allowed set) and left out of the load edge the fog
  follows.
- **The budget is 1.5 M triangles and 700 draw calls**, one eye's worth
  (`VR_BUDGET` in `src/vr/engine/stream.ts`). Tested in the headset, it
  stopped the flicker.

What it costs: with the budget on, the model is visibly incomplete. The
dollhouse cannot show all six cranes (3.2 M between them) and every container
at once, and in first person distant pieces drop out beyond what is near. That
is the trade until the model is re-baked to the targets above; with a model
under about 800k triangles and a few hundred draw calls, the budget stops
leaving anything out.

## Simplifying the model as it loads

The bake's low LODs are not low (97% of full detail) and its repeated models
exist at one detail only, so in VR the model is simplified in the browser as
it arrives (`src/vr/engine/simplify.ts`, meshoptimizer's simplifier, already a
dependency). Nothing is re-baked or uploaded, and the flat pages never load
the simplifier: it is imported on demand, only while `vrStreamingOn()`.

- **Pieces at the lowest tier** (`far`: everything in the dollhouse, and past
  75 m in first person) are cut to 25% of their triangles, stopping early if
  the shape would move by more than 1% of the mesh's size. Mesh borders are
  locked, so pieces and materials still meet without cracks. Near and mid
  tiers keep full detail.
- **Repeated models** (`palette.glb`: containers, vehicles and the rest of the
  21,252 placed copies) are cut to 35% within 0.5% of their size, once, when
  the palette loads. Every copy shares the result.
- **When:** `ChunkManager.mount` simplifies a piece right after it downloads,
  before it is revealed and before `freeCpuArrays` drops its vertex data, so
  the work is done once per piece and kept with the cached copy. Meshes under
  2,000 triangles are left alone. The work runs mesh by mesh and yields to the
  next frame after every 6 ms, so a large piece does not stall the headset.
- **The budget counts the result** (`simplifiedTriangles`), so the same
  1.5 M-triangle budget holds roughly three to four times as much of the model.

## The transition blackout

The black sphere that covers a jump was 0.25 m across, while the VR near plane
is 1.5 m in the dollhouse and 0.25 m in first person: in the dollhouse it was
clipped away entirely, and in first person it sat on the near plane where it
could flash. It is now a unit sphere scaled to twice the near plane (at least
0.5 m) every frame.

While the view is held black for loading, `LoadingRing`
(`src/vr/loading-ring.tsx`) shows a progress ring 2.5 m ahead instead of
words: a faint full track, a blue arc that fills clockwise from the top as
pieces arrive (the share loaded since the hold began, eased so it never runs
backwards), a white dot circling the ring every 1.4 s so it reads as working
even when the count stalls, and the percentage in the middle. It drifts after
the head rather than being locked to it, like the panels.

## Hooks outside `src/vr`

No file in any tree outside its `vr/` folder carries VR code. The VR page
mounts the tree's own provider and `SceneGraph`, and everything VR does to
them happens from `src/vr` and the tree's `vr/` folder.

Outside the trees, the streamer calls into `src/vr/engine/stream.ts` (the VR
flag, the VR stream quality, the load edge). Every value there is inert until
a VR page sets it, so the normal routes behave exactly as before:

| File | What it calls |
|---|---|
| `src/streaming/config.ts` | `vrStreamingOn()` in `detectProfile`, and `vrStreamConfig(...)` around the ground, aerial and dollhouse resolvers |
| `src/streaming/chunk-manager.ts` | `publishStreamReach` / `clearStreamReach` (the nearest-missing-piece scan runs only while `vrStreamingOn()`), and `shouldCoarsen`, which does nothing unless the config carries `coarsenResident` (only `vrStreamConfig` sets it); the budget (`computeAllowed`, `VR_BUDGET`), also only under `coarsenResident`; `simplifyChunk` after a download, only while `vrStreamingOn()` |
| `src/shared/ui/screens/fade-screen/use-fade-transition.ts` | `vrStreamingOn()`, to pick its poll (below) |

- **The fade polls on a timer.** `useFadeTransition` waited for the scene
  (First Person's dressing, Dollhouse's model key, the first Home's stream)
  by polling on `requestAnimationFrame`. A page presenting to a headset gets no
  window animation frames, so in VR that blackout never lowered. On a VR page
  it now polls every 16 ms with `setTimeout`; every other page still polls on
  `requestAnimationFrame`, exactly as before.

Removed from the trees: an unused VR player swap in `scene/index.tsx` and a
VR-only hide of the dollhouse instructions card in `overlays.tsx` (both read
`useIsVr()`, whose provider was never mounted, so neither ever ran), the
`!vr` guard on `AdaptiveQuality` (`vrStreamConfig` already turns
`adaptiveDpr` off), and the world-position reads in `scene-lights.tsx`,
`sky-dome.tsx` and `hotspot.tsx`. In the headset those now read
`camera.position`, the player's eye point, rather than the tracked head that
`HeadPose` writes into the camera's matrix. They differ only by a room-scale
step, which neither a sky dome nor the shadow follow's margin shows. `src/vr/player-controller.tsx` and
`src/vr/vr-mode.tsx` went with them.

## Known limits

- The dollhouse is the site's aerial dollhouse pose at full scale, not the
  reference's tabletop model. The streamer tiers by camera distance, so a
  scaled model would not stream correctly.
- The fog's 75% floor and its speeds are first guesses, not yet tuned in a
  headset.
- There is no Security button on the VR bar.
- The cards are not yet seen in a headset. The clip and still textures load
  cross-origin from the stream bucket, which serves CORS for the chunks.
- Stick walking checks the floor with `probeFloorY` at the 3D player's
  position, not the physical head, so room-scale steps are not clamped.
