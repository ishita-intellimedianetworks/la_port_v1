"use client";

/**
 * Step 2 — the three cameras no layout owns.
 *
 * `cameras.dollhouse` is the overview orbit, `cameras.spawn` is where first
 * person begins and where Home returns to, and `cameras.firstPerson` is where
 * the bottom bar's circle drops the player. Everything ELSE the experience
 * flies to is a layout's camera or a hotspot's, authored in steps 4 and 5 —
 * there is deliberately no `cameras.entry` here, because the opening pose is
 * a layout named by `startLayoutId` rather than a fourth pose to keep in step.
 *
 * The workflow this step exists for: orbit until the shot is right, press
 * "Set from view". That replaces reading a `cp_NNN` node out of `/extract-pos`
 * and hand-reordering XYZ to YXZ, which is what every `_note` in this block of
 * `site.json` is a record of somebody doing — carefully, and with a warning
 * attached for the next person.
 */

import type { CameraPose, LayoutCamera } from "@/config/schema";
import { useDraftStore } from "../draft-store";
import { sameSelection, useViewerStore } from "../viewer-store";
import { Button, Group, Note, Panel, Row } from "../ui";
import { CameraEditor } from "../ui/camera-editor";

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
  const livePose = useViewerStore((s) => s.livePose);

  return (
    <Panel
      title="2 · Cameras"
      description="Orbit the viewport until the shot is right, then capture it. Preview seats the viewport exactly where the runtime will."
    >
      <Group title="Viewport">
        <Row label="Live pose" hint="what Set from view writes">
          <p className="rounded border border-white/10 bg-black/40 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-slate-300">
            pos [{livePose.position.map((n) => n.toFixed(1)).join(", ")}]
            <br />
            rot [{livePose.rotation.map((n) => n.toFixed(3)).join(", ")}] YXZ
          </p>
        </Row>
      </Group>

      {SLOTS.map((slot) => {
        const pose = draft.cameras[slot.id];
        const isSelected = sameSelection(selection, { kind: "sceneCamera", id: slot.id });

        if (!pose) {
          return (
            <Group key={slot.id} title={slot.title}>
              <p className="text-xs leading-relaxed text-slate-400">{slot.blurb}</p>
              <Button
                tone="primary"
                small
                onClick={() =>
                  update((d) => {
                    d.cameras[slot.id] = {
                      position: livePose.position,
                      rotation: livePose.rotation,
                    };
                  })
                }
              >
                Add from current view
              </Button>
            </Group>
          );
        }

        return (
          <Group key={slot.id} title={slot.title}>
            <p className="text-xs leading-relaxed text-slate-400">{slot.blurb}</p>
            <CameraEditor
              camera={pose}
              form="yxz"
              selected={isSelected}
              onSelect={() => select({ kind: "sceneCamera", id: slot.id })}
              // `firstPerson` is the only optional one — the schema marks it
              // so, and removing either of the others leaves the runtime with
              // nowhere to open or nowhere to land.
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
                  // The editor hands back a `LayoutCamera`; this block stores
                  // a `CameraPose`, which is the same two fields with the
                  // rotation required. A slot in `yxz` form never produces a
                  // `target`, so the cast is safe by construction.
                  d.cameras[slot.id] = {
                    position: next.position,
                    rotation: next.rotation ?? [0, 0, 0],
                  } satisfies CameraPose;
                })
              }
            />
          </Group>
        );
      })}

      <Note>
        These three are stored as YXZ eulers — the order the runtime applies
        straight to the camera. The layout and resource cameras in steps 4 and 5 are stored as
        XYZ, the order a GLB tool prints. The studio converts at the boundary, so never paste a
        rotation from one section into the other.
      </Note>
    </Panel>
  );
}
