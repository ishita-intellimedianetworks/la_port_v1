"use client";

/**
 * One camera, edited three ways: dial it, capture it from the viewport, or
 * name a point for it to look at.
 *
 * Used by the Cameras step for the three `cameras.*` poses and by the Resources
 * and Hotspots steps for their per-row cameras, because it is the same job
 * every time. What differs is only the STORAGE FORM, and that is expressed as
 * the `form` prop rather than duplicated:
 *
 *   "yxz"  `cameras.dollhouse | spawn | firstPerson` — applied to the camera
 *          verbatim, so the numbers here are the numbers the runtime uses.
 *   "xyz"  `layouts[].camera` and `hotspots[].camera` — the order
 *          `/extract-pos` prints, reordered by `poseForCamera` on the way in.
 *
 * The rotation read-out is in DEGREES while the file stores RADIANS. That is
 * not cosmetic: nobody can look at `-1.7747` and say whether the camera faces
 * the quay, and an authoring tool whose numbers cannot be reasoned about is a
 * JSON editor with extra steps. The conversion happens at the input boundary
 * only, so what is stored is untouched.
 */

import type { CameraPose, LayoutCamera, Vec3 } from "@/config/schema";
import { forwardOf, poseForCamera, roundVec, toDeg, toRad, yxzToXyz } from "../pose";
import { useViewerStore } from "../viewer-store";
import { Button, NumberField, Row, Vec3Field } from ".";

export type CameraForm = "yxz" | "xyz";

/** Radians in the file, degrees in the box. */
function DegreesField({ value, onChange }: { value: Vec3; onChange: (value: Vec3) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {(["X", "Y", "Z"] as const).map((axis, i) => (
        <span key={axis} className="relative">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-500">
            {axis}
          </span>
          <NumberField
            value={toDeg(value[i])}
            step={0.5}
            suffix="°"
            onChange={(deg) => {
              const next: Vec3 = [...value];
              next[i] = toRad(deg);
              onChange(next);
            }}
          />
        </span>
      ))}
    </div>
  );
}

/**
 * A point on the camera's view ray, for switching a camera to the look-at form.
 *
 * 100 units out is arbitrary and that is fine — the runtime derives the same
 * rotation from ANY point on the ray, so the distance carries no information.
 * What matters is that the direction survives the switch, so changing how a
 * camera is STORED never changes the shot.
 */
function targetOnRay(pose: CameraPose): Vec3 {
  const forward = forwardOf(pose.rotation);
  return roundVec([
    pose.position[0] + forward.x * 100,
    pose.position[1] + forward.y * 100,
    pose.position[2] + forward.z * 100,
  ]);
}

export function CameraEditor({
  camera,
  form,
  onChange,
  onSelect,
  selected,
  /** `null` clears the camera. Only passed where absence is meaningful — a
   *  hotspot with no camera of its own is viewed from its layout's. */
  onClear,
}: {
  camera: LayoutCamera | CameraPose;
  form: CameraForm;
  onChange: (camera: LayoutCamera) => void;
  onSelect?: () => void;
  selected?: boolean;
  onClear?: () => void;
}) {
  const requestFly = useViewerStore((s) => s.requestFly);

  const stored = camera as LayoutCamera;
  const usesTarget = !!stored.target && !stored.rotation;

  /** The pose the RUNTIME will apply, whichever form this is stored in — what
   *  "Preview" flies to, so the viewport shows the actual shot. */
  const runtimePose: CameraPose = form === "yxz" ? (camera as CameraPose) : poseForCamera(stored);

  /**
   * Read the viewport camera into this slot.
   *
   * `livePose` is stored YXZ, because that is what a camera IS. A `yxz` slot
   * therefore takes it verbatim and an `xyz` slot takes the reorder — one
   * quaternion, two readings, so the two forms cannot describe different aims.
   */
  const setFromView = () => {
    const live = useViewerStore.getState().livePose;
    onChange(
      form === "yxz"
        ? { position: live.position, rotation: live.rotation }
        : { position: live.position, rotation: yxzToXyz(live.rotation) },
    );
  };

  return (
    <div className={`rounded border p-3 ${selected ? "border-sky-400/60 bg-sky-500/5" : "border-white/10"}`}>
      <div className="mb-3 flex flex-wrap gap-2">
        <Button
          tone="primary"
          small
          onClick={setFromView}
          title="Write the viewport's current position and aim into this camera"
        >
          Set from view
        </Button>
        <Button
          small
          onClick={() => requestFly(runtimePose)}
          title="Seat the viewport exactly where this camera sits at runtime"
        >
          Preview
        </Button>
        {onSelect && (
          <Button small tone={selected ? "primary" : "default"} onClick={onSelect}>
            {selected ? "Selected" : "Select gizmo"}
          </Button>
        )}
        {form === "xyz" && (
          <Button
            small
            tone="ghost"
            title={
              usesTarget
                ? "Freeze the derived aim into an explicit rotation"
                : "Aim by naming a point to look at — the rotation is then derived from it"
            }
            onClick={() => {
              const pose = poseForCamera(stored);
              onChange(
                usesTarget
                  ? { position: stored.position, rotation: yxzToXyz(pose.rotation) }
                  : { position: stored.position, target: targetOnRay(pose) },
              );
            }}
          >
            {usesTarget ? "Use rotation" : "Use look-at target"}
          </Button>
        )}
        {onClear && (
          <Button
            small
            tone="danger"
            onClick={onClear}
            title="Remove this camera — the resource falls back to its layout's"
          >
            Clear
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <Row label="Position" hint="world units">
          <Vec3Field
            value={stored.position}
            step={0.1}
            onChange={(position) => onChange({ ...stored, position })}
          />
        </Row>

        {usesTarget ? (
          <Row label="Look at" hint="rotation derived">
            <Vec3Field
              value={stored.target ?? [0, 0, 0]}
              step={0.1}
              onChange={(target) => onChange({ position: stored.position, target })}
            />
          </Row>
        ) : (
          <Row
            label="Rotation"
            hint={form === "yxz" ? "YXZ, as applied" : "XYZ, as /extract-pos prints"}
          >
            <DegreesField
              value={stored.rotation ?? [0, 0, 0]}
              onChange={(rotation) => onChange({ position: stored.position, rotation })}
            />
          </Row>
        )}
      </div>
    </div>
  );
}
