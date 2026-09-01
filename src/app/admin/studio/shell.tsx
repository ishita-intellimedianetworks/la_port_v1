"use client";

/**
 * The studio shell: a step rail on the left, the step's panel beside it, and
 * ONE viewport filling the rest.
 *
 * The layout is the argument. Steps are panels next to a persistent canvas
 * rather than pages that own one, because every step is a judgement made by
 * LOOKING — is that camera framing the crane, is that bead on the quay, is
 * that sun angle right. A wizard that swapped the canvas between steps would
 * re-download the model, re-compile its shaders and throw away the vantage the
 * author had just lined up, four times a minute.
 *
 * The steps are ordered by dependency, not by importance: nothing can be
 * placed before a model is loaded (1), cameras are worth capturing before
 * layouts refer to them (2–4), resources hang off layouts (5), and the two
 * whole-scene knobs (6–7) are judged against content that already exists. The
 * rail lets you jump anywhere regardless — the order is advice, and the review
 * step's links skip straight to whatever is wrong.
 */

import { useState } from "react";
import { useDraftStore } from "./draft-store";
import { useViewerStore } from "./viewer-store";
import { CamerasStep } from "./steps/cameras";
import { FovStep } from "./steps/fov";
import { HotspotsStep } from "./steps/hotspots";
import { ImportStep } from "./steps/import";
import { LightingStep } from "./steps/lighting";
import { ResourcesStep } from "./steps/resources";
import { ReviewStep } from "./steps/review";
import { SceneStep } from "./steps/scene";
import { validate } from "./validate";
import { Button } from "./ui";

const STEPS = [
  { id: "scene", n: 1, label: "Scene", blurb: "Model & site record" },
  { id: "cameras", n: 2, label: "Cameras", blurb: "Dollhouse, spawn, drop" },
  { id: "import", n: 3, label: "Import", blurb: "Poses from a GLB" },
  { id: "resources", n: 4, label: "Layouts", blurb: "Parents & their cameras" },
  { id: "hotspots", n: 5, label: "Resources", blurb: "Titles, order, parentage" },
  { id: "fov", n: 6, label: "Field of view", blurb: "One angle, whole site" },
  { id: "lighting", n: 7, label: "Lighting", blurb: "Sky, lights, grade" },
  { id: "review", n: 8, label: "Review & save", blurb: "Validate, write site.json" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

/** The controls that belong to the VIEWPORT rather than to any one step —
 *  what is drawn, how big, and what a click does. They sit over the canvas
 *  because they are properties of looking, not of the file. */
function ViewportToolbar() {
  const viewer = useViewerStore((s) => s);

  return (
    <div className="pointer-events-auto absolute left-3 top-3 flex flex-wrap items-center gap-1.5 rounded-lg border border-white/10 bg-black/70 px-2 py-1.5 backdrop-blur">
      <Button
        small
        tone={viewer.mode === "place" ? "primary" : "ghost"}
        title="Click the model to move the selected marker there"
        onClick={() => viewer.setMode(viewer.mode === "place" ? "orbit" : "place")}
      >
        {viewer.mode === "place" ? "Placing" : "Place"}
      </Button>
      <Button
        small
        tone={viewer.gizmo ? "primary" : "ghost"}
        title="Drag the selected marker with a transform gizmo"
        onClick={() => viewer.setGizmo(!viewer.gizmo)}
      >
        Drag
      </Button>
      <span className="mx-1 h-4 w-px bg-white/15" />
      <Button small tone={viewer.showLayouts ? "default" : "ghost"} onClick={() => viewer.toggle("showLayouts")}>
        Layouts
      </Button>
      <Button small tone={viewer.showHotspots ? "default" : "ghost"} onClick={() => viewer.toggle("showHotspots")}>
        Resources
      </Button>
      <Button small tone={viewer.showSceneCameras ? "default" : "ghost"} onClick={() => viewer.toggle("showSceneCameras")}>
        Cameras
      </Button>
      <Button small tone={viewer.showGrid ? "default" : "ghost"} onClick={() => viewer.toggle("showGrid")}>
        Grid
      </Button>
      <span className="mx-1 h-4 w-px bg-white/15" />
      <label className="flex items-center gap-1.5 text-[10px] text-slate-400" title="Marker radius in world units">
        size
        <input
          type="range"
          className="h-1 w-20 cursor-pointer appearance-none rounded bg-white/15 accent-sky-400"
          min={0.5}
          max={40}
          step={0.5}
          value={viewer.markerScale}
          onChange={(e) => viewer.setMarkerScale(Number(e.target.value))}
        />
      </label>
      <Button small tone="ghost" onClick={viewer.requestFrame} title="Frame the whole model">
        Frame
      </Button>
    </div>
  );
}

/** What is selected, said in words — the gizmo alone does not tell you whether
 *  you are about to move L04's camera or its marker. */
function SelectionReadout() {
  const selection = useViewerStore((s) => s.selection);
  const clear = useViewerStore((s) => s.select);
  if (selection.kind === "none") return null;

  const label =
    selection.kind === "sceneCamera"
      ? `cameras.${selection.id}`
      : `${selection.id} · ${selection.part}`;

  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 flex items-center gap-2 rounded-lg border border-sky-400/40 bg-black/70 px-3 py-1.5 text-xs text-sky-100 backdrop-blur">
      <span className="font-mono">{label}</span>
      <button
        type="button"
        className="text-slate-400 hover:text-white"
        onClick={() => clear({ kind: "none" })}
        title="Deselect"
      >
        ✕
      </button>
    </div>
  );
}

export function StudioShell({ viewport }: { viewport: React.ReactNode }) {
  const [step, setStep] = useState<StepId>("scene");
  const draft = useDraftStore((s) => s.draft);
  const dirty = useDraftStore((s) => s.dirty);
  const undo = useDraftStore((s) => s.undo);
  const redo = useDraftStore((s) => s.redo);
  const canUndo = useDraftStore((s) => s.past.length > 0);
  const canRedo = useDraftStore((s) => s.future.length > 0);

  // Cheap enough to run on every draft change — the whole document is a few
  // hundred rows — and it is what puts the error dot on the rail, so a problem
  // introduced in step 2 is visible while working in step 5.
  const problems = validate(draft);
  const errorSteps = new Set(problems.filter((p) => p.level === "error").map((p) => p.step));
  const warningSteps = new Set(problems.filter((p) => p.level === "warning").map((p) => p.step));

  const index = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="flex h-full min-h-0 w-full bg-[#070b12] text-slate-200">
      {/* ── Rail ─────────────────────────────────────────────────────────── */}
      <nav className="flex w-56 shrink-0 flex-col border-r border-white/10">
        <div className="border-b border-white/10 px-4 py-4">
          <h1 className="text-sm font-semibold text-white">Site studio</h1>
          <p className="mt-0.5 text-[10px] leading-tight text-slate-500">
            {draft.meta.label}
            <br />
            {dirty ? "draft — unsaved" : "in step with site.json"}
          </p>
        </div>

        <ol className="min-h-0 flex-1 overflow-y-auto py-2">
          {STEPS.map((entry) => {
            const active = entry.id === step;
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => setStep(entry.id)}
                  className={`flex w-full items-start gap-2.5 px-4 py-2 text-left transition ${
                    active ? "bg-sky-500/15 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                      active ? "bg-sky-400 text-slate-900" : "bg-white/10 text-slate-400"
                    }`}
                  >
                    {entry.n}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      {entry.label}
                      {errorSteps.has(entry.id) && (
                        <span className="h-1.5 w-1.5 rounded-full bg-red-400" title="Has errors" />
                      )}
                      {!errorSteps.has(entry.id) && warningSteps.has(entry.id) && (
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Has warnings" />
                      )}
                    </span>
                    <span className="block truncate text-[10px] text-slate-500">{entry.blurb}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="space-y-2 border-t border-white/10 px-3 py-3">
          <div className="flex gap-1.5">
            <Button small onClick={undo} disabled={!canUndo} title="Undo">
              ↶ Undo
            </Button>
            <Button small onClick={redo} disabled={!canRedo} title="Redo">
              ↷ Redo
            </Button>
          </div>
          <div className="flex gap-1.5">
            <Button
              small
              tone="ghost"
              disabled={index === 0}
              onClick={() => setStep(STEPS[Math.max(0, index - 1)].id)}
            >
              ← Back
            </Button>
            <Button
              small
              tone="primary"
              disabled={index === STEPS.length - 1}
              onClick={() => setStep(STEPS[Math.min(STEPS.length - 1, index + 1)].id)}
            >
              Next →
            </Button>
          </div>
        </div>
      </nav>

      {/* ── Step panel ───────────────────────────────────────────────────── */}
      <div className="flex w-[26rem] min-w-0 shrink-0 flex-col border-r border-white/10">
        {step === "scene" && <SceneStep />}
        {step === "cameras" && <CamerasStep />}
        {step === "import" && <ImportStep />}
        {step === "resources" && <ResourcesStep />}
        {step === "hotspots" && <HotspotsStep />}
        {step === "fov" && <FovStep />}
        {step === "lighting" && <LightingStep />}
        {step === "review" && <ReviewStep onGoToStep={(id) => setStep(id as StepId)} />}
      </div>

      {/* ── Viewport ─────────────────────────────────────────────────────── */}
      <div className="relative min-w-0 flex-1">
        {viewport}
        <div className="pointer-events-none absolute inset-0">
          <ViewportToolbar />
          <SelectionReadout />
        </div>
      </div>
    </div>
  );
}
