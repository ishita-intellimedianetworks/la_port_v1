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

   | view | buttons |
   |---|---|
   | dollhouse | Home, Info, Exit |
   | first person | Home, First Person (walk), Dollhouse, Info, Resources, Exit |

   - **Home:** in the dollhouse it goes down to the home position; in first
     person it returns there.
   - **First Person:** the first-person pose.
   - **Dollhouse:** back up to the dollhouse view.
   - **Info:** that view's instructions again.
   - **Resources:** layouts, then hotspots. Selecting one travels there.
   - **Exit:** ends the session.

Each view's instructions open by themselves once per session. Info reopens them.

**The two requested changes from the 3D:**

- **Resources is a bar button.** There is no side flap.
- **Walking is by controller, not pathfinding:**

  | input | action |
  |---|---|
  | left stick | walk where you look, flattened to the floor |
  | left grip, held | run (4x) |
  | right stick left / right | snap turn 30 degrees about the head |
  | trigger | press a hotspot marker, a button or a menu row |
  | trigger twice (dollhouse) | go to the home position |

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

**One safeguard.** The 3D `PlayerController` and `DollhouseCamera` write the
camera's position every frame. The XR camera has no parent, so three would
recompose its matrix from those writes before rendering and lose head
tracking. `rig.tsx` therefore sets `gl.xr.getCamera().matrixAutoUpdate = false`
for the session. Three sets that matrix from the viewer pose itself.

## Layout

```
src/vr/                        shared by all four variants
  xr-store.ts                  the XR store (kept on globalThis), enterVr(), exitVr()
  bridge.tsx                   VrBridge: what a tree hands the headset (view, poses, actions)
  create-bridge.ts             createVrBridge / layoutGroups / dressingSettled
  session.tsx                  <VrSession>: <XR>; while presenting, rig + HUD + blackout
  rig.tsx                      reference-space rig: follows the 3D player, stick walk, snap turn
  hud.tsx                      the sequence: view instructions, double trigger, menus, bar
  vr-loader.tsx                the 3D HoloTwin loader, alone: the page's only 3D UI
  enter-vr-prompt.tsx          DOM Enter VR popup, shown once the loader is gone
  ui/tokens.ts                 sizes, colours, pointer order
  ui/text.tsx                  VrText: folds glyphs the MSDF atlas lacks; preloads the font
  ui/primitives.tsx            HeadLocked, Glass, Panel, IconButton, Row, PanelHeader, List
  ui/panels.tsx                BottomBar, InstructionsPanel, ResourcesPanel, HotspotPanel

src/terminal*/vr/
  index.tsx                    the VR page's tree: SiteProvider + TerminalProvider + bridge
                               + Canvas(<VrSession><SceneGraph/></VrSession>) + VrLoader
                               + EnterVrPrompt
  bridge.tsx                   feeds createVrBridge from that tree's useLayoutNavigation,
                               nav-ui-store, UI context and (v4 / v5) security store

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

## Known limits

- The dollhouse is the site's aerial dollhouse pose at full scale, not the
  reference's tabletop model. The streamer tiers by camera distance, so a
  scaled model would not stream correctly.
- `AdaptiveQuality` still runs on the VR page and calls `setDpr`. Three
  ignores size changes mid-session with a console warning, and foveation does
  that job in the headset.
- The hotspot card shows fields and the alert banner only: no still, clip,
  poster, journey or security designed layout.
- There is no Map on the VR bar, and markers have no hover label in the
  headset.
- Without the flat `Overlays`, nothing latches `currentDest` from the player's
  position as they walk. So on v2 to v4 the markers stay those of the last
  layout or hotspot travelled to. v5's nearby markers follow the player from
  the scene and are unaffected.
- Stick walking checks the floor with `probeFloorY` at the 3D player's
  position, not the physical head, so room-scale steps are not clamped.
