# 06 — Open Questions, Assumptions, Decisions

## Decided

**Base model — settled.** Build on the existing **LA Olympics village model**
(`olympic-village-v3.glb` + Recast navmesh + `village.preview.bin` + `village.png`)
from `holotwin-la-v3-sofi`. It gives real geometry, a real navmesh and a real
baked point cloud, so the entire pipeline — loading shader, dollhouse orbit,
walking, minimap, hotspot placement — is exercised for real rather than against
a greybox. The Everport GLB swaps in later through `assets.*` in
`port-config.json` plus a re-run of the authoring pass (M9).

Consequence to be aware of: the ten layouts and thirty hotspots will initially sit
on village geometry, not port geometry. They will be *placed sensibly* (waterside
run, yard run, gate, rail, elevated overview) but they are provisional, and every
coordinate is re-authored when the real model lands. That is expected and cheap —
M5 is a repeatable pass, not one-time work.

## Assumptions taken (flag any that are wrong)

1. **Single scene, no venue switching.** The reference app carries a floor/venue
   swap system with fade transitions, GLTF eviction and cache warming. A single
   terminal does not need it, so it is dropped — which removes a large amount of
   the reference's complexity. If the demo later needs a second site, the
   transition machinery can be re-ported.

2. **Desktop-first, landscape mobile supported.** Same posture as the reference
   (which force-locks landscape on touch). No portrait layout is planned.

3. **No VR/XR.** The reference has a full `@react-three/xr` experience under
   `components/vr/`. Nothing in the port handoff calls for it. Not ported.

4. **All values baked into JSON, no backend.** The data-points doc is explicit
   that everything except published infrastructure facts is synthetic. The
   `dataSource: "live"` slot exists so a telemetry adapter can be added later
   without touching the UI.

5. **Numbers are static, not simulated.** The docs say demo values may be
   simulated. The plan renders them as authored constants with a Demo Data badge.
   If you want live-looking drift (moves/hour ticking, crane telemetry animating),
   say so — it is a small addition at M7 but it changes the popup renderer.

6. **English only, no i18n scaffolding.**

## Needs your input

### Q1 — Should demo values animate?

Static authored values, or gentle simulated drift on the operational fields
(`moves_per_hour`, `hoist_height_m`, `trolley_position_m`, queue counts)?
Drift makes the demo feel alive; static keeps it honest and matches the docs
literally. Default if you do not answer: **static**.

### Q2 — Layouts panel: teleport or walk?

The handoff calls a Layout "a named walk/teleport destination". Ten layouts
spread across a 205-acre terminal means walking between them is slow even at 5×.
Default if you do not answer: **teleport with a blackout**, with walking reserved
for double-click within a layout. Alternative: walk when the target is within
~80 units, teleport beyond.

### Q3 — H30 Cargo Journey behaviour

The handoff says the camera "can jump through L04 → L05/L06 → L08/L09". Should
selecting a journey step:
(a) jump the camera to that layout and open the relevant hotspot, or
(b) stay put and just highlight the step in the timeline?
Default: **(a)**, since it is the strongest demo moment in the spec.

### Q4 — Where does the Everport GLB come from, and when?

The plan's M9 is small, but it needs the model plus a clean navmesh export and a
top-down floorplan render. Knowing the ETA and who is producing it decides whether
M5 is worth doing twice or should wait.

### Q5 — Anything from the reference UI you specifically want kept or dropped?

Deliberately dropped so far: crowd flow, event-day feed, transit/transport
timetables, seat maps, furniture swaps, lighting studio, venue tabs. All are
guest-experience features with no operational-twin equivalent. Say the word if
any of them should stay (the crowd-flow heatmap, for instance, maps reasonably
onto yard congestion).

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Real Everport GLB arrives with unnamed nodes | Asset highlight (handoff §2) cannot work | Node-naming requirement is written into doc 05 — send it to the modeller **now**, not at delivery |
| Navmesh comes back polluted (covering stacks/roofs) | Walking breaks; we would need the reference's height-band + slope guards back | Specify a clean walkable-surface-only export up front |
| 30 hotspots × ~10 fields authored by hand | Transcription errors in demo values | Load-time validation + the hero-container invariant catch the ones that matter; the rest get a read-through against the docx at M8 |
| Terminal model is large (205 acres) | Load time, VRAM, mobile crashes | Draco/meshopt + KTX2 at delivery, DPR clamp, device tiering, `three-performance` audit at M8 |
