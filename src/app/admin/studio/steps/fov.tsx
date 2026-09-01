"use client";

/**
 * Step 6 — field of view.
 *
 * ONE NUMBER FOR THE WHOLE SITE, and that is the thing worth knowing about it:
 * `world.fov` is applied to the Canvas camera at creation AND re-asserted by
 * the camera store onto whatever camera the scene registers, so the dollhouse,
 * the walking view and every authored camera share it. There is no per-camera
 * override to reach for, which means moving this re-frames all forty shots at
 * once — a change to make before the cameras are dialled, not after.
 *
 * The viewport applies it live, so the slider re-frames the actual picture
 * rather than a number that will re-frame it later. That is the only honest
 * way to pick it: the authoring cameras carried a 32° yfov, the site ships 35,
 * and the difference between those is a judgement about how much of the
 * terminal is in shot, not an arithmetic one.
 */

import { useDraftStore } from "../draft-store";
import { poseForCamera } from "../pose";
import { useViewerStore } from "../viewer-store";
import { Button, Group, Note, Panel, Row, Slider } from "../ui";

/** Common reference angles, so the slider has landmarks rather than being a
 *  bare range. Roughly: telephoto → normal → wide. */
const PRESETS = [
  { fov: 15, label: "15° — long lens" },
  { fov: 24, label: "24°" },
  { fov: 32, label: "32° — authoring cameras" },
  { fov: 35, label: "35° — shipped" },
  { fov: 50, label: "50° — natural" },
  { fov: 70, label: "70° — wide" },
];

export function FovStep() {
  const fov = useDraftStore((s) => s.draft.world.fov);
  const layouts = useDraftStore((s) => s.draft.layouts);
  const dollhouse = useDraftStore((s) => s.draft.cameras.dollhouse);
  const update = useDraftStore((s) => s.update);
  const requestFly = useViewerStore((s) => s.requestFly);

  const setFov = (next: number) =>
    update(
      (d) => {
        d.world.fov = Math.round(next * 100) / 100;
      },
      // Dragging the slider is one gesture. Each pixel of travel pushing an
      // undo entry would bury the value it started from.
      { history: false },
    );

  return (
    <Panel
      title="6 · Field of view"
      description="One angle for every camera in the site. The viewport applies it live — check it against a few authored shots before moving on."
    >
      <Group title="world.fov">
        <Row label="Vertical FOV" hint="degrees">
          <Slider value={fov} min={5} max={110} step={0.5} suffix="°" onChange={setFov} />
        </Row>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {PRESETS.map((preset) => (
            <Button
              key={preset.fov}
              small
              tone={Math.abs(fov - preset.fov) < 0.01 ? "primary" : "default"}
              onClick={() =>
                update((d) => {
                  d.world.fov = preset.fov;
                })
              }
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </Group>

      <Group title="Check it against a shot">
        <p className="text-xs leading-relaxed text-slate-400">
          Fly to a camera and move the slider. Anything that framed correctly at one angle needs
          re-checking at another — a narrower field pulls the subject in and crops the context, and
          on the overview it decides how much of the terminal is visible at all.
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Button small onClick={() => requestFly(dollhouse)}>
            Dollhouse
          </Button>
          {layouts.slice(0, 12).map((layout) => (
            <Button key={layout.id} small onClick={() => requestFly(poseForCamera(layout.camera))}>
              {layout.id}
            </Button>
          ))}
        </div>
      </Group>

      <Note>
        The dollhouse camera&apos;s framing is a function of BOTH this and its distance from the
        zone centre. Widening the field here opens that shot without moving the camera, which is
        usually the better fix — pulling the camera back also changes what the orbit pivots
        around.
      </Note>
    </Panel>
  );
}
