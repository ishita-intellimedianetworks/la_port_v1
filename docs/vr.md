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

   Both views: Home, First Person, Dollhouse, Info, Map, Resources, Hide icons,
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
   - **Resources:** layouts, then hotspots. Selecting one travels there. Its
     icon is lucide `Images`, the reference's Layouts ("gallery") glyph.
   - **Hide icons:** puts the bar away, as the ARCHVIZ reference's "Hide bar"
     does. A hidden bar has no button to bring it back, so B or Y (the upper
     face button on either controller) does. A new view (dollhouse or first
     person) starts with the bar up.
   - **Exit:** ends the session.

   Hovering a button with the ray shows its name in a pill above the bar.

Each view's instructions open by themselves once per session. Info reopens them.

**The two requested changes from the 3D:**

- **Resources is a bar button.** There is no side flap.
- **Walking is by controller, not pathfinding:**

  | input | action |
  |---|---|
  | left stick | walk where you look, flattened to the floor |
  | left grip, held | run (4x) |
  | right stick left / right | snap turn 30 degrees about the head |
  | right stick up / down | scroll the card or list the ray is over |
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
  head-locked view.
- **Instructions:** the dark `InstructionsOverlay` card: a centred title and
  muted subtitle, uppercase group labels ("Controllers", "Buttons"), two columns
  of glass tiles and a glass action button. As in the reference, a control
  (stick, grip, trigger) is named in blue text, and a bar button is shown as
  its own icon in a round chip.
- **Resources:** the same tiles for rows.

## Hotspot cards: each route's own 3D card

Pressing a marker opens that route's own 3D hotspot card, rebuilt in uikit. Each
tree's bridge hands the headset its card as `Card`, together with the open
`hotspotInfo` (`destId`, `index`, `hotspotId`) as `card`. The HUD renders it
with the same props the flat `HotspotDataCard` takes.

| route | VR card | what it carries over from the 3D card |
|---|---|---|
| v2, v3 | `src/vr/cards/simple-card.tsx` | header, journey, two-column fields with tone colours and meters |
| v4 | `src/terminal-v4/vr/hotspot-card.tsx` | the above plus alert banner, still beside the first four fields, poster card, S08 capabilities and counters, S07 incident centre (tabs, severity chips, source and sort menus, day heading, expandable rows with Acknowledge / Escalate / De-escalate / Resolve / audit trail / View location), source incident rows, audit log |
| v5 | `src/terminal-v5/vr/hotspot-card.tsx` | the v4 set in v5's design (its field sizes, uppercase labels, `CardHeader` on security cards), plus the designed security layouts (clip or still panel beside a hero tile, reading rows and the alerts list; or the hero, identity grid and stat tiles), the live clip with its LIVE badge and play/pause, the S07 command-and-incident view side by side with the detail strip, and the poster with press-to-enlarge |

The pieces they share (card glass, header and close button, fields, meters,
section labels, alert banner, journey, still, clip, poster, chips, pills,
actions, avatars) are in `src/vr/ui/card-kit.tsx`. Sizes are the 3D desktop
sizes (`S = 1`).

What differs from the flat card, and why:

- **No frosted blur.** The card glass is `#090b0f` at 0.82 instead of 0.48
  over a 30 px blur.
- **Panel size.** Every panel is short and scrolls. v5's 80 vw x 80 vh card is
  46% x 38% of the head-locked view (S07's two columns each scroll), v4's 620 px
  card 34% x 36%, v2 / v3's 32% x 36%, the audit log 26% x 32%, the map 42%
  tall, Resources 40% and the instructions 44%. A poster is at most 46% wide
  (80% enlarged). A card
  as big as the flat one wraps round the edge of a headset's view. Everything
  past that height scrolls: drag it with the trigger, or push the right stick up
  or down while the ray is over it (`stick-scroll.ts`).
- **Red close button.** Every card and panel has a red round close button on
  its top-right corner (`RedClose`), in place of the close buttons that were in
  the headers.
- **Text never overlaps.** uikit keeps text in a row from shrinking below its
  longest word, so a long ID or status pushed into the next column. `VrText`
  sets `minWidth: 0`, so every line wraps inside its own column. A card's
  whole body scrolls as one, including v5's hero tile and Alerts list and the
  S07 incident column, so nothing can run past a short card's edge.
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
  head-locked panels and the rig itself.

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
  `src/streaming/reach.ts`). Everything nearer is drawn, if only at a low
  texture rung, which does not count as missing. It resets to "unknown" when
  the manager is disposed.
- `VrFog` sets the fog's far edge to that distance, kept between 60% and 100%
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
depth precision grows with the near plane (15x and 2.5x). The head-locked
panels at 2 m are unaffected. In the dollhouse a controller held closer than
1.5 m is clipped, and in first person a wall closer than 0.25 m.

Checked and ruled out as causes: the streamed KTX2 textures carry full mip
chains (a 512 px texture has 10 levels) and are sampled with 8x anisotropy;
the edge feather is a smooth fade with no dithering and is off in VR; the
loading reveal's hashed discard ends fully opaque.

**Phone streaming** (`setVrStreaming` in `src/streaming/config.ts`, turned on
by `useVrStreaming` in each tree's `vr/index.tsx` while the page is mounted):
`detectProfile` answers "mobile", so every view resolves the way it does on a
phone and `ChunkManager` gets the phone budgets:

- the far band pulled in (`MOBILE.farScale`, or the site's `mobileFarScale`),
  and the fog edge with it, starting at 70% of the unload radius
- texture rungs capped at 512 / 256 / 128 px for near / mid / far
- far chunks mounted at the far LOD and sharpened only as they come near
  (`residentTier: far`, `sharpestTier: mid`), within a 240 MB budget
- 4 chunk mounts per tick, half the texture upgrades
- plus, for VR only: no transmission pass and `adaptiveDpr: false`, so
  `AdaptiveQuality` is not mounted. Three cannot resize the headset's
  framebuffer mid-session.

`isMobileDevice()` still reads the real device, so hotspot travel keeps the
desktop camera poses.

## Map

The Map button opens `MapPanel` (`src/vr/ui/map-panel.tsx`), drawn in the flat
`Minimap`'s design: the glass panel, a "Map" header with the round close
button, a Category row (chips in place of the dropdown), the plan in a rounded
frame, the selected destination's name and distance with a Teleport button,
and the "N on map" list with numbered bubbles (blue selected, green where you
are) and distances.

- **Plan and bounds** are the tree's own `minimapData` (from `useScene`), placed
  exactly as `worldToPixel` places them.
- **The player** is the head, not the 3D player: a cyan dot with a white ring
  and a view cone turned with the head's yaw, sampled ten times a second.
- **Destinations** are the active floor's `dests` per category, pinned at their
  hotspot (or camera) position. Selecting one and pressing Teleport runs the
  same probe-and-teleport fade as Home. There is no Start (walk) button: VR
  moves by stick, not pathfinding.
- The plan is not zoomable or draggable, and has no crowd-flow legend.

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

## Two fixes outside `src/vr`

- **The fade polls on a timer.** `useFadeTransition` waited for the scene
  (First Person's dressing, Dollhouse's model key, the first Home's stream)
  by polling on `requestAnimationFrame`. A page presenting to a headset gets no
  window animation frames, so in VR that blackout never lowered. It polls every
  16 ms with `setTimeout` now, which the flat pages cannot tell apart.
- **Markers take a shared scale.** Each tree's `hotspot.tsx` sizes a marker to
  a constant screen size from the camera's fov and the canvas height. The XR
  fov is about 100 degrees, so in the headset they came out large. The final
  scale is multiplied by `markerScale.value`
  (`src/shared/runtime/marker-scale.ts`), which is 1 everywhere except while a
  VR session runs, when `VrSession` sets it to 0.65.

## Known limits

- The dollhouse is the site's aerial dollhouse pose at full scale, not the
  reference's tabletop model. The streamer tiers by camera distance, so a
  scaled model would not stream correctly.
- The fog's 60% floor and its speeds are first guesses, not yet tuned in a
  headset.
- There is no Security button on the VR bar, and markers have no hover label
  in the headset.
- The cards are not yet seen in a headset. The clip and still textures load
  cross-origin from the stream bucket, which serves CORS for the chunks.
- Stick walking checks the floor with `probeFloorY` at the 3D player's
  position, not the physical head, so room-scale steps are not clamped.
