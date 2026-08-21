# 05 — Assets & Authoring

## Asset set

Every asset is referenced from `port-config.json` → `assets`. Nothing is imported
by path from component code.

| Asset | Path | Purpose | Interim source |
|---|---|---|---|
| Terminal GLB | `/models/<name>.glb` | The world | `olympic-village-v3.glb` (8.9 MB) |
| Navmesh GLB | `/models/navmesh/<name>-navmesh.glb` | Walkable surface for A* | `olympic-village-navmesh-recast-v1.glb` |
| Point-cloud preview | `/models/<name>.preview.bin` | Loading-screen silhouette | `village.preview.bin` (392 KB) |
| Floorplan PNG | `/floorplan/<name>.png` | Minimap base | `village.png` |
| HDRI | `/env.hdr` | Image-based lighting | `env.hdr` |

All five are copied from `holotwin-la-v3-sofi/public/` in M2.

### `.preview.bin` format

Produced by `scripts/holotwin-bake.cjs`, decoded by `previewLoader.ts`:

```
Header (16 B): "HTWN" | uint32 version=1 | uint32 pointCount | uint32 flags=0
Bounds (24 B): float32 minX,minY,minZ,maxX,maxY,maxZ
Points (8 B each): uint16[3] quantised position | int8[2] octahedral normal
```

Roughly 30,000 points ≈ 240 KB — small enough to arrive before the GLB, which is
the whole point: the silhouette is on screen from frame 1.

```bash
npm run bake -- public/models/everport-terminal-v1.glb 30000
```

The baker handles `KHR_draco_mesh_compression`, so it works on already-compressed
delivery GLBs.

### GLB preparation checklist (for the real Everport model)

1. **Node naming discipline** — every asset a hotspot points at needs a stable,
   unique node name matching its `linkedAssetId`: `QC-01`…`QC-08`, `B226`,
   `TH-024`, `TICTF-L04`, yard blocks `A12`, `C08`, and the hero container
   `EGHU4829136`. Without these, asset highlighting cannot work.
2. Scale/units: 1 unit = 1 metre preferred; if not, record the real ratio in
   `world.siteSpanUnits` so distances and ETAs read correctly.
3. Y-up, -Z forward, transforms applied, modifiers applied.
4. Draco or meshopt compression, KTX2/Basis textures, texture sizes capped.
5. Separate navmesh export — a simplified walkable-surface mesh covering the
   quay apron, yard aisles, gate area and rail interface. Keep it **clean**:
   do not include roofs, stacks or water. A clean navmesh is why we can delete
   the reference app's height-band and slope guards.
6. Top-down orthographic render at a known world extent → floorplan PNG; record
   the `{minX, maxX, minZ, maxZ}` it covers.

## Authoring the coordinates

> **Handoff §3, verbatim:** the attached annotated map is a planning/reference map.
> Its marker positions are not GIS coordinates. Developers must place each
> Layout/Hotspot at the corresponding physical asset in the existing 3D model and
> record the actual HoloTwin XYZ/camera coordinates.
>
> **Handoff §5:** record final world-space XYZ coordinates after placement; do not
> use screenshot pixels as runtime coordinates.

So `HoloTwin_LA_Port_Layout_Hotspot_Map.png` tells us **what goes near what** —
L01 at the channel mouth, L02–L04 down the berth face, L05–L07 through the yard
north→south, L08 at the landside gate, L09 at the rail interface, L10 elevated —
and nothing about where in world space.

### The `/author` route (M5)

A dev-only page mounted on the same scene:

- **Pose capture** — live camera position + YXZ euler printed in exact
  `port-config.json` shape, with a copy button. Same idea as the reference's
  `?debug=true` dollhouse logger and its `/extract-pos` page, which reads world
  transforms after a forced `updateMatrixWorld(true)` pass (local transforms
  silently misreport nested nodes — a real trap worth repeating here).
- **Click-to-place** — raycast the model, capture `{position, rotation}` for the
  selected hotspot id; the disc orientation comes from the hit-face normal.
- **Labelled capture** — a dropdown of the ten layout ids and thirty hotspot ids
  so each capture is bound to its stable ID before it is recorded.
- **Export** — merges captures into the loaded config and offers the full JSON
  for paste-back into `src/data/port-config.json`.

The route is excluded from the production build.

### Placement order

Walk the demo the way a viewer will:

```
L01 channel/arrival → L02 berth face → L03 crane zone → L04 vessel working face
   → L05 north yard → L06 central yard → L07 south yard
   → L08 truck gate → L09 TICTF rail interface → L10 elevated executive view
```

Place each layout's camera first, then its hotspots from where that camera sits —
that is the only way to satisfy "every hotspot is reachable/visible from its
parent layout".

## Spatial QA checklist

Straight from handoff §5, to be run at the end of M5 and again at M8:

- [ ] Every L01–L10 marker verified against the 3D model
- [ ] Every H01–H30 physically reachable or visible from its parent layout,
      unless intentionally configured as an overview/logical hotspot
      (H02, H25, H26–H29 are legitimately logical)
- [ ] No hotspot placed outside the red project boundary, except the shared
      TICTF interface at L09
- [ ] L09 labelled "TICTF / Everport Rail Interface" everywhere in the UI —
      never "Everport rail yard"
- [ ] H30 demonstrates the same hero container across multiple layouts
- [ ] Final world-space XYZ recorded in `port-config.json`; no screenshot pixels
- [ ] Every `linkedAssetId` resolves to a real node in the GLB
- [ ] Demo Data badge present on every `dataSource: "demo"` popup
- [ ] Static infrastructure figures match the published values
      (205 acres, 5,800 ft, 3 berths, 8 post-Panamax cranes, 560 reefer plugs,
      TICTF 8 loading / 10 storage / 2 arrival-departure tracks)

## Verified reference facts (handoff §6)

Keep these exact — they are the `dataSource: "static"` values:

- Everport Terminal Services, Berths 226–236, Terminal Island
- 205 acres · 5,800 ft total berth length · 3 berths · 47 ft water depth
- 8 post-Panamax cranes · 560 reefer plugs · on-dock rail · AMP available
- Wheeled and grounded operation, electric tophandlers
- TICTF is **shared** with Yusen: 8 loading tracks, 10 adjacent storage tracks,
  2 dedicated arrival/departure tracks, switching tracks, derail operation,
  compressed-air infrastructure
- Site bounded by the Main Channel, Yusen/YTI, LAXT/ExxonMobil and Cannery
  Street, with UPRR rail infrastructure
