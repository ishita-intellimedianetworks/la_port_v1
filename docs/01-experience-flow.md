# 01 — Experience Flow

The flow you specified, mapped to a single phase machine. Every overlay, camera
and input mode in the app is a function of `phase` + `isReady`.

```
        assets stream in                    user taps "Enter"        user double-clicks the model
LOADING ───────────────► INSTRUCTIONS ─────────────────────► DOLLHOUSE ──────────────────────────► FIRST_PERSON
  bar + point-cloud         2-card panel over the             orbit / zoom the             walk, teleport, map,
  + dither reveal           frozen dollhouse pose             whole terminal               layouts, hotspots
                                                                   ▲                              │
                                                                   └──────────────────────────────┘
                                                                     "Dollhouse" button (blackout swap)
```

`type Phase = "loading" | "instructions" | "dollhouse" | "firstPerson"`

---

## 1. Loading — bar + shader effect

Ported wholesale from the reference (`shared/ui/molecules/loading-screen/`). Four
pieces that share **one uniform** so the bar and the visual effect cannot drift:

| Piece | File (reference) | Role |
|---|---|---|
| `HoloTwinHud` | `holotwin-hud.tsx` | DOM-only overlay: title, progress track, `%`, brand footer. Reads `revealProgress` from the store, **not** drei's raw progress — so the bar cannot hit 100% before the effect finishes. |
| `HoloTwinPreview` | `utils/core/HoloTwinPreview.ts` | `THREE.Points` of the model's baked point cloud, additive-blended, custom GLSL. Density grows with download progress — a recognisable silhouette from frame 1, no scattered particles. |
| `patchMeshForReveal` | `utils/core/patchMeshForReveal.ts` | `onBeforeCompile` hook on every GLB material: per-pixel world-position hash → `discard` while `uGlobalAlpha < pixelHash`. Materials stay **opaque** the whole time (no transparent queue, no depth sorting, no wall pop-in). |
| `crossfadeReveal` | `utils/core/crossfadeReveal.ts` | Animates `uGlobalAlpha` 0→1 over 3.5 s with smootherstep. Point cloud fades out and mesh dithers in off the *same* uniform. |

Sequencing (from `use-scene-loading.ts`), all gates must open before the reveal fires:

```
navReady && modelLoaded && previewReady && assetsWarmed
  → progressStore.setProgress(100)
  → wait for smoothed revealProgress >= 0.995   (bar visually catches up)
  → 300 ms beat
  → crossfadeReveal(3500 ms)   → onRevealDone → phase = "instructions"
```

The veil behind the HUD thins from opaque to `0.22` alpha over the first 35% of
raw download, so the silhouette is on show for essentially the whole load.

**Progress is byte-accurate**, not file-count: a streamed `fetch` + `content-length`
warm pass writes `prefetchProgress`, blended 50/50 with drei's model progress by a
`ProgressSmoother` running inside `useFrame`.

## 2. Instructions → Dollhouse

`InstructionsOverlay` (shared molecule) in `contained` + `dark` variant, over the
already-visible dollhouse pose. Port-specific copy:

- 🔄 **Rotate** — drag to orbit the terminal; scroll / pinch to zoom
- 🖱️ **Double-click** — drop into first-person on the quay

Button: **Enter Terminal View**. Tapping it sets a persisted `instructionsSeen`
flag (zustand + localStorage) so returning visitors land straight in `dollhouse`.

`DollhouseCamera` behaviour (ported from `scene-content/components/dollhouse-camera/`):

- Orbit pivots on the **model bounding-box centre**, spherical θ/φ, damping as a
  per-second decay constant (rate 5) so it is refresh-rate independent
- Tilt clamped to 5°–85°; zoom bounds widened at seed time to include the authored
  radius, so zoom-out always returns to the opening framing
- `interactive={false}` until the reveal completes — the pose holds, input is dead
- Soft edge-feather uniform on: the model rim dissolves into the backdrop in
  dollhouse, sharp in first-person

## 3. Double-click → First person

Double-click on the dollhouse model starts a 1.6 s fly-in (position lerp +
quaternion slerp, smootherstep, driven in `useFrame` — no tween lib). At
`1 - FADE_MS/1600` through the arc it cues the blackout, so the fade-in finishes
exactly as the camera arrives. Under the black the phase flips and the player
controller takes the pose.

Guards: drag threshold 10 px / 300 ms so an orbit drag never registers as a
double-click.

In first-person, double-click on the ground is the walk gesture
(`use-double-click-nav.ts`): raycast → on-mesh check (±2 units) → walk to the exact
point, or snap to the nearest navmesh point within 30 units, else ignore.

## 4. First person — map, layouts, hotspots, back to dollhouse

Left edge rail (`Sidebar` pattern), each item a square flap flush to the border:

| Flap | Behaviour |
|---|---|
| **Map** | Opens the resizable minimap window — floor-plan PNG + world bounds, click to walk, live player pin, A* route polyline + ETA pill |
| **Layouts** | The L01–L10 list. Selecting one teleports/walks to its authored `camera` pose and auto-opens nothing else. Grouped by zone (waterside / yard / landside / rail / executive) |
| **Hotspots** | The H01–H30 list scoped to the current layout, each row opens the same popup a 3D marker click opens |
| **Dollhouse** | Returns to the orbit overview via the blackout swap (`triggerFloorTransition`) |

Panels are mutually exclusive: opening one closes the others, and **any walk
closes all of them** (the rail slides off the left edge while moving, back in
after 300 ms of continuous stillness — so a brief arrival settle never flashes a
panel).

### Hotspot interaction contract (from the handoff, §2)

1. Hotspot click opens **one consistent popup component** — never per-hotspot bespoke UI
2. Clicking outside closes it
3. Where a hotspot represents a physical asset, that asset **highlights in 3D** while its popup is open
4. Simulated numbers carry a **Demo Data** badge unless bound to a live source
5. IDs stay exactly `L01`–`L10` / `H01`–`H30` — never renamed during implementation
6. The hero container `EGHU4829136` keeps the same ID and a consistent state across H09 → H14 → H24 → H30

Markers themselves are ported from `hotspot-markers/hotspot.tsx`: solid white
centre disc + thin outer ring at the authored rotation, `depthTest: false` so
they read through geometry, ring pulse on hover, generous invisible box collider,
`Html` name pill anchored at marker centre and lifted in **screen space** so it is
always above the marker from any angle. Tap-to-reveal with a 2.2 s auto-hide
covers touch, which has no hover.

## 5. One JSON for everything

`src/data/port-config.json` is the single source of truth — models, navmesh,
preview, floorplan, lights, cameras, all ten layouts, all thirty hotspots and
every popup field. A thin adapter (`src/data/config-adapter.ts`) types it and
derives lookup maps. Nothing else in the app hardcodes a URL, a pose or a value.
Full schema in [03-data-contract.md](./03-data-contract.md).
