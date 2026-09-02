"use client";

/**
 * Step 2 — the three cameras no layout owns, added one at a time.
 *
 * `cameras.dollhouse` is the overview orbit, `cameras.spawn` is where first
 * person begins and where Home returns to, and `cameras.firstPerson` is where
 * the bottom bar's circle drops the player. Everything ELSE the experience
 * flies to is a layout's camera or a hotspot's, authored in steps 4 and 5 —
 * there is deliberately no `cameras.entry` here, because the opening pose is a
 * layout named by `startLayoutId` rather than a fourth pose to keep in step.
 *
 * ONE GESTURE, ONE BUTTON. Orbit until the shot is right, press "Use this
 * position & rotation". That replaces reading a `cp_NNN` node out of
 * `/extract-pos` and hand-reordering XYZ to YXZ, which is what every `_note`
 * in this block of `site.json` is a record of somebody doing — carefully, and
 * with a warning attached for the next person.
 */

import type { CameraPose, LayoutCamera } from "@/config/schema";
import { useDraftStore } from "../draft-store";
import { sameSelection, useViewerStore } from "../viewer-store";
import { Group, Note, Panel, Row, Select } from "../ui";
import { AddCamera, CameraEditor } from "../ui/camera-editor";

const SLOTS = [
  {
    id: "dollhouse" as const,
    title: "Dollhouse orbit",
    blurb:
      "The overview vantage. Its position sets the orbit's radius and angle for good; the rotation only holds until the model's bounds land, after which the orbit re-aims at the zone centre every frame.",
  },
  {
    id: "spawn" as const,
    title: "First-person spawn",
    blurb:
      "Where the walking view lands after the fly-in, and where Home returns to. It is also the point the streamer fills in around while the entry blackout is up, so moving it changes what has finished loading when the fade lifts.",
  },
  {
    id: "firstPerson" as const,
    title: "First-person drop",
    blurb:
      "Where the bottom bar's First Person circle puts the player. This one must be ON the navmesh — spawn is not, which is exactly why the two are separate poses rather than one.",
  },
];

export function CamerasStep() {
  const draft = useDraftStore((s) => s.draft);
  const update = useDraftStore((s) => s.update);
  const selection = useViewerStore((s) => s.selection);
  const select = useViewerStore((s) => s.select);

  return (
    <Panel
      title="2 · Cameras"
      description="Orbit the viewport until the shot is right, then take it. Preview seats the viewport exactly where the runtime will."
    >
      <Group title="Opening shot">
        <Row
          label="Opens on"
          hint="startLayoutId — a foreign key into the layouts table, not a fourth pose"
        >
          <Select
            value={draft.startLayoutId}
            options={draft.layouts.map((l) => ({ value: l.id, label: `${l.id} — ${l.name}` }))}
            onChange={(startLayoutId) =>
              update((d) => {
                d.startLayoutId = startLayoutId;
              })
            }
          />
        </Row>
      </Group>

      {SLOTS.map((slot) => {
        const pose = draft.cameras[slot.id];

        return (
          <Group key={slot.id} title={slot.title}>
            <p className="text-xs leading-relaxed text-slate-400">{slot.blurb}</p>
            {pose ? (
              <CameraEditor
                camera={pose}
                form="yxz"
                selected={sameSelection(selection, { kind: "sceneCamera", id: slot.id })}
                onSelect={() => select({ kind: "sceneCamera", id: slot.id })}
                // `firstPerson` is the only optional one — the schema marks it
                // so, and removing either of the others leaves the runtime
                // with nowhere to open or nowhere to land.
                onClear={
                  slot.id === "firstPerson"
                    ? () =>
                        update((d) => {
                          delete d.cameras.firstPerson;
                        })
                    : undefined
                }
                onChange={(next: LayoutCamera) =>
                  update((d) => {
                    // The editor hands back a `LayoutCamera`; this block
                    // stores a `CameraPose`, which is the same two fields with
                    // the rotation required. A slot in `yxz` form never
                    // produces a `target`, so the cast is safe by
                    // construction.
                    d.cameras[slot.id] = {
                      position: next.position,
                      rotation: next.rotation ?? [0, 0, 0],
                    } satisfies CameraPose;
                  })
                }
              />
            ) : (
              <AddCamera
                form="yxz"
                onAdd={(next) =>
                  update((d) => {
                    d.cameras[slot.id] = {
                      position: next.position,
                      rotation: next.rotation ?? [0, 0, 0],
                    } satisfies CameraPose;
                  })
                }
              />
            )}
          </Group>
        );
      })}

      <Note>
        These three are stored as YXZ eulers — the order the runtime applies straight to the
        camera. The layout and hotspot cameras in steps 4 and 5 are stored as XYZ, the order a GLB
        tool prints. The studio converts at the boundary, so never paste a rotation from one
        section into the other.
      </Note>
    </Panel>
  );
}
