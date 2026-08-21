# HoloTwin LA Port — Planning Docs

Planning set for `la_port_v1` (Next.js 16 + React 19 + R3F 9 + three 0.185).
Written **before** implementation. Nothing in `src/` has been changed yet.

| Doc | What it covers |
|---|---|
| [00-build-status.md](./00-build-status.md) | What is built and running today |
| [01-experience-flow.md](./01-experience-flow.md) | The 5-step user flow and the phase state machine that drives it |
| [03-data-contract.md](./03-data-contract.md) | The single `port-config.json` — schema, worked examples, L01–L10 / H01–H30 index |
| [05-assets-and-authoring.md](./05-assets-and-authoring.md) | GLB / navmesh / preview.bin / floorplan pipeline, authoring routes, spatial QA |
| [06-open-questions.md](./06-open-questions.md) | Blockers, assumptions taken, decisions needed from you |

## Sources this plan was built from

- `../../HoloTwin_LA_Port_Developer_Handoff_L01-L10_H01-H30.docx` — interaction contract, layout/hotspot spec, data model, spatial QA checklist
- `../../HoloTwin_LA_Port_All_Data_Points_L01-L10_H01-H30.docx` — exact field names, types, sample values, hero-container consistency table
- `../../HoloTwin_LA_Port_Layout_Hotspot_Map.png` — planning/reference map (**not** GIS coordinates — see 05)
- `E:\Ishita Files\LA-OLYMPICS-FRONTEND\holotwin-la-v3-sofi` — reference implementation for both UI and code

## Read this first

Two things shape the whole build (details in [06](./06-open-questions.md)):

1. **Base model — decided.** No Everport terminal GLB exists on disk yet, so the
   build stands on the existing **LA Olympics village model** (`olympic-village-v3.glb`
   + its Recast navmesh + `village.preview.bin` + `village.png` floorplan) from the
   reference app. Real geometry, real navmesh, real point-cloud preview from day one.
   The Everport model swaps in later through `assets.*` in `port-config.json`.
2. **Every L01–L10 / H01–H30 world coordinate is unknown.** The handoff is explicit
   that the annotated map is not GIS data and positions must be authored against the
   3D model. Milestone M5 is that authoring pass, and it is repeatable — it runs once
   on the stand-in model and again when the real one arrives.
