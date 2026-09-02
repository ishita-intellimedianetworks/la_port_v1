"use client";

/**
 * One camera.
 *
 * THE WHOLE INTERACTION IS: fly the viewport to the shot you want, then press
 * one button. Everything else here is secondary and is folded away, because a
 * camera is a thing you AIM, not a thing you type — and a panel that puts six
 * numbers in front of you invites you to try.
 *
 * Used by the Cameras step for the three `cameras.*` poses and by the Layouts
 * and Hotspots steps for their per-row cameras, because it is the same job
 * every time. What differs is only the STORAGE FORM, expressed as the `form`
 * prop rather than duplicated:
 *
 *   "yxz"  `cameras.dollhouse | spawn | firstPerson` — applied to the camera
 *          verbatim, so the numbers here are the numbers the runtime uses.
 *   "xyz"  `layouts[].camera` and `hotspots[].camera` — the order
 *          `/extract-pos` prints, reordered by `poseForCamera` on the way in.
 *
 * Rotation is shown in DEGREES while the file stores RADIANS. Not cosmetic:
 * nobody can look at `-1.7747` and say whether the camera faces the quay. The
 * conversion happens at the input boundary only, so what is stored is
 * untouched.
 */

import { useState } from "react";
import { Camera, ChevronRight, Crosshair, Eye, Trash2 } from "lucide-react";
import type { CameraPose, LayoutCamera, Vec3 } from "@/config/schema";
import { poseForCamera, toDeg, toRad, yxzToXyz } from "../pose";
import { useViewerStore } from "../viewer-store";
import { Button, NumberField, Row, Vec3Field } from ".";

export type CameraForm = "yxz" | "xyz";

/** Radians in the file, degrees in the box. */
function DegreesField({ value, onChange }: { value: Vec3; onChange: (value: Vec3) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {(["X", "Y", "Z"] as const).map((axis, i) => (
        <span key={axis} className="relative">
          <span className="pointer-events-none absolute left-2 top-1/2 z-10 -translate-y-1/2 text-[10px] font-bold text-slate-400">
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

/** Read the viewport into a camera of this form.
 *
 *  `livePose` is stored YXZ, because that is what a camera IS. A `yxz` slot
 *  therefore takes it verbatim and an `xyz` slot takes the reorder — one
 *  quaternion, two readings, so the two forms cannot describe different aims. */
export function poseFromView(form: CameraForm): LayoutCamera {
  const live = useViewerStore.getState().livePose;
  return form === "yxz"
    ? { position: live.position, rotation: live.rotation }
    : { position: live.position, rotation: yxzToXyz(live.rotation) };
}

/** The empty state: no camera here yet, and the one button that makes one. */
export function AddCamera({
  form,
  onAdd,
  hint,
}: {
  form: CameraForm;
  onAdd: (camera: LayoutCamera) => void;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-[#6b7280] px-4 py-5 text-center">
      <Camera size={22} className="text-[#4ade80]" />
      <p className="text-[11px] leading-relaxed text-slate-300">
        {hint ?? "Not set yet."} Orbit and zoom the viewport until the shot is right, then take it.
      </p>
      <Button tone="primary" small onClick={() => onAdd(poseFromView(form))}>
        Use this position &amp; rotation
      </Button>
    </div>
  );
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
  const [numbers, setNumbers] = useState(false);

  const stored = camera as LayoutCamera;
  /** The pose the RUNTIME will apply, whichever form this is stored in — what
   *  "Preview" flies to, so the viewport shows the actual shot. */
  const runtimePose: CameraPose = form === "yxz" ? (camera as CameraPose) : poseForCamera(stored);
  /** A handful of authored cameras aim by naming a point instead of an angle.
   *  Nothing here writes that form, but it reads and preserves it. */
  const usesTarget = !!stored.target && !stored.rotation;

  return (
    <div
      className={`rounded-lg border ${
        selected ? "border-[#22c55e] bg-[#22c55e]/10" : "border-[#4b5563] bg-[#0b1220]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <p className="min-w-0 flex-1 font-mono text-[11px] leading-relaxed text-slate-200">
          {stored.position.map((n) => n.toFixed(1)).join(", ")}
          <span className="mx-1.5 text-slate-500">·</span>
          {usesTarget
            ? `looks at ${stored.target!.map((n) => n.toFixed(0)).join(", ")}`
            : (stored.rotation ?? [0, 0, 0]).map((n) => `${toDeg(n).toFixed(1)}°`).join(" ")}
        </p>
        <Button
          tone="primary"
          small
          onClick={() => onChange(poseFromView(form))}
          title="Write the viewport's current position and aim into this camera"
        >
          Use this position &amp; rotation
        </Button>
        <Button
          small
          onClick={() => requestFly(runtimePose)}
          title="Seat the viewport exactly where this camera sits at runtime"
        >
          <Eye size={13} /> Preview
        </Button>
        {onSelect && (
          <Button
            small
            tone={selected ? "primary" : "default"}
            onClick={onSelect}
            title="Highlight this camera in the viewport"
          >
            <Crosshair size={14} />
          </Button>
        )}
        {onClear && (
          <Button small tone="danger" onClick={onClear} title="Remove this camera">
            <Trash2 size={14} />
          </Button>
        )}
      </div>

      <button
        type="button"
        className="flex w-full items-center gap-1 border-t border-[#374151] px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400 transition hover:text-white"
        onClick={() => setNumbers(!numbers)}
      >
        <ChevronRight size={11} className={`transition-transform ${numbers ? "rotate-90" : ""}`} />
        Numbers
      </button>

      {numbers && (
        <div className="space-y-2 border-t border-[#374151] px-3 py-3">
          <Row label="Position" hint="world units">
            <Vec3Field
              value={stored.position}
              step={0.1}
              onChange={(position) => onChange({ ...stored, position })}
            />
          </Row>
          {usesTarget ? (
            <Row label="Look at" hint="rotation derived from this point">
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
      )}
    </div>
  );
}
