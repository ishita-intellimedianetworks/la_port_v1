"use client";

/**
 * The studio shell: a step bar across the top, the viewport under it, and the
 * current step's form under that.
 *
 * The shape is the 3di admin's scene editor — numbered steps along the top,
 * one `aspect-video` viewer, the step's table beneath it, Back and the primary
 * action pinned to the bottom corners — because that is the tool this one sits
 * beside, and two admin tools for the same kind of work should not need to be
 * learned twice.
 *
 * TWO DEPARTURES FROM IT, both deliberate:
 *
 *   The canvas is mounted ONCE, by the page, and handed in here. The 3di steps
 *   each build their own `CanvasWithWrapper`, so moving between them
 *   re-downloads the model, re-compiles its shaders and discards the vantage
 *   you had just lined up. Every step here is a judgement made by LOOKING —
 *   is that camera framing the crane, is that bead on the quay — so the view
 *   survives the step change.
 *
 *   The viewer takes the SPARE height rather than a fixed 16:9 block, and the
 *   form scrolls beneath it. A step with two controls gets a big picture; the
 *   thirty-row resources table gets its list, with the model still in shot
 *   while a marker is dragged. It can also be given the whole pane, since some
 *   judgements are only about the picture.
 *
 * AND IT DOES NOT EXIST UNTIL A MODEL DOES. An empty canvas invites you to
 * start working in it, and every gesture in it would be meaningless — placing,
 * framing and judging a light all mean looking at geometry. So step 1 gets the
 * whole pane to add a model in, and the viewport appears when it lands.
 *
 * ONE GESTURE. You orbit; the viewport reports where the camera is and what it
 * is centred on; a button in the panel takes one of those. There was a
 * transform gizmo and a click-the-model place mode as well, and three ways to
 * move a thing meant three sets of rules about which was armed and what a drag
 * meant in each. They are gone.
 *
 * LAYERS FOLLOW THE STEP. Forty markers and three camera gizmos drawn at once
 * is a scene you cannot read, so entering a step turns on what that step is
 * about and turns off the rest. The toolbar still overrides it — this is a
 * default per step, not a lock.
 *
 * The steps split three ways: 1–5 are the spatial work, which is what a
 * viewport is for; lighting is the whole-scene look, judged against content
 * that already exists; review is the way out.
 */

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useDraftStore } from "./draft-store";
import { useViewerStore } from "./viewer-store";
import { CamerasStep } from "./steps/cameras";
import { HotspotsStep } from "./steps/hotspots";
import { ImportStep } from "./steps/import";
import { LightingStep } from "./steps/lighting";
import { ResourcesStep } from "./steps/resources";
import { ReviewStep } from "./steps/review";
import { SceneStep } from "./steps/scene";
import { validate } from "./validate";
import { Button } from "./ui";

const STEPS = [
  { id: "scene", n: 1, label: "Model", group: "place" },
  { id: "cameras", n: 2, label: "Cameras", group: "place" },
  { id: "import", n: 3, label: "Import", group: "place" },
  { id: "resources", n: 4, label: "Layouts", group: "place" },
  { id: "hotspots", n: 5, label: "Hotspots", group: "place" },
  { id: "lighting", n: 6, label: "Lighting", group: "extra" },
  { id: "review", n: 7, label: "Review & save", group: "save" },
] as const;

/** What each step is about, drawn and nothing else. */
const STEP_LAYERS: Record<
  (typeof STEPS)[number]["id"],
  { showSceneCameras: boolean; showLayouts: boolean; showHotspots: boolean }
> = {
  scene: { showSceneCameras: false, showLayouts: false, showHotspots: false },
  cameras: { showSceneCameras: true, showLayouts: false, showHotspots: false },
  import: { showSceneCameras: false, showLayouts: true, showHotspots: true },
  resources: { showSceneCameras: false, showLayouts: true, showHotspots: false },
  hotspots: { showSceneCameras: false, showLayouts: false, showHotspots: true },
  lighting: { showSceneCameras: false, showLayouts: false, showHotspots: false },
  review: { showSceneCameras: false, showLayouts: true, showHotspots: true },
};

type StepId = (typeof STEPS)[number]["id"];

/** One step in the bar. daisyUI's `step` shape: a numbered disc with its label
 *  beside it, green once reached, joined to its neighbour by a rule. */
function StepButton({
  step,
  state,
  problem,
  onClick,
}: {
  step: (typeof STEPS)[number];
  state: "done" | "current" | "todo";
  problem: "error" | "warning" | null;
  onClick: () => void;
}) {
  const disc =
    state === "current"
      ? "bg-[#0457a9] text-white ring-2 ring-[#0457a9]/40"
      : state === "done"
        ? "bg-[#22c55e] text-[#111827]"
        : "bg-[#374151] text-slate-400";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex shrink-0 items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-[#1f2937] ${
        state === "current" ? "bg-[#1f2937]" : ""
      }`}
    >
      <span
        className={`relative flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition ${disc}`}
      >
        {step.n}
        {problem && (
          <span
            className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-[#111827] ${
              problem === "error" ? "bg-[#ef4444]" : "bg-[#f59e0b]"
            }`}
            title={problem === "error" ? "Has errors" : "Has warnings"}
          />
        )}
      </span>
      <span
        className={`whitespace-nowrap text-xs font-medium transition ${
          state === "current" ? "text-slate-100" : "text-slate-400 group-hover:text-slate-200"
        }`}
      >
        {step.label}
      </span>
    </button>
  );
}

function Rule() {
  return <span className="h-px w-4 shrink-0 bg-[#4b5563]" />;
}

/** The controls that belong to the VIEWPORT rather than to any one step —
 *  what is drawn, how big, and what a click does. They sit over the canvas
 *  because they are properties of looking, not of the file. */
function ViewportToolbar() {
  const viewer = useViewerStore((s) => s);

  return (
    <div className="pointer-events-auto absolute left-3 top-3 flex flex-wrap items-center gap-1.5 rounded-lg border border-[#4b5563] bg-[#111827]/85 px-2 py-1.5 backdrop-blur">
      <Button small tone={viewer.showLayouts ? "default" : "ghost"} onClick={() => viewer.toggle("showLayouts")}>
        Layouts
      </Button>
      <Button small tone={viewer.showHotspots ? "default" : "ghost"} onClick={() => viewer.toggle("showHotspots")}>
        Resources
      </Button>
      <Button
        small
        tone={viewer.showSceneCameras ? "default" : "ghost"}
        onClick={() => viewer.toggle("showSceneCameras")}
      >
        Cameras
      </Button>
      <Button small tone={viewer.showGrid ? "default" : "ghost"} onClick={() => viewer.toggle("showGrid")}>
        Grid
      </Button>
      <Rule />
      <label className="flex items-center gap-1.5 text-[10px] text-slate-400" title="Marker radius in world units">
        size
        <input
          type="range"
          className="h-1 w-20 cursor-pointer appearance-none rounded-full bg-[#4b5563] accent-[#0457a9]"
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
    selection.kind === "sceneCamera" ? `cameras.${selection.id}` : `${selection.id} · ${selection.part}`;

  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 flex items-center gap-2 rounded-lg border border-[#0457a9] bg-[#111827]/85 px-3 py-1.5 text-xs text-slate-100 backdrop-blur">
      <span className="font-mono">{label}</span>
      <button type="button" className="text-slate-400 hover:text-white" onClick={() => clear({ kind: "none" })} title="Deselect">
        ✕
      </button>
    </div>
  );
}

export function StudioShell({ viewport }: { viewport: React.ReactNode }) {
  const [step, setStep] = useState<StepId>("scene");
  /** Fold the form away when the answer is entirely in the picture — lining a
   *  camera up, reading a sun angle. The step bar and the footer stay, so it
   *  is a bigger view rather than a different mode. */
  const [panelOpen, setPanelOpen] = useState(true);
  const hasModel = useViewerStore((s) => s.model.kind !== "none");
  const setLayers = useViewerStore((s) => s.setLayers);

  // Draw what this step is about. Depending on `step` alone and not on the
  // layer values is the point: a manual toggle afterwards must survive until
  // the step actually changes, which it would not if this re-ran on its own
  // output.
  useEffect(() => {
    setLayers(STEP_LAYERS[step]);
  }, [step, setLayers]);
  const draft = useDraftStore((s) => s.draft);
  const dirty = useDraftStore((s) => s.dirty);
  const undo = useDraftStore((s) => s.undo);
  const redo = useDraftStore((s) => s.redo);
  const canUndo = useDraftStore((s) => s.past.length > 0);
  const canRedo = useDraftStore((s) => s.future.length > 0);

  // Cheap enough to run on every draft change — the whole document is a few
  // hundred rows — and it is what puts the dot on the step bar, so a problem
  // introduced in step 2 is visible while working in step 5.
  const problems = validate(draft);
  const errorSteps = new Set(problems.filter((p) => p.level === "error").map((p) => p.step));
  const warningSteps = new Set(problems.filter((p) => p.level === "warning").map((p) => p.step));

  const index = STEPS.findIndex((s) => s.id === step);
  const stateOf = (i: number) => (i === index ? "current" : i < index ? "done" : "todo");
  const problemOf = (id: string) =>
    errorSteps.has(id) ? ("error" as const) : warningSteps.has(id) ? ("warning" as const) : null;

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[#111827] text-slate-200">
      {/* ── Title bar ─────────────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[#374151] px-4 py-2.5">
        <div className="flex items-baseline gap-3">
          <h1 className="text-sm font-semibold text-slate-100">Site studio</h1>
          <span className="text-[11px] text-slate-500">{draft.meta.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              dirty ? "bg-[#f59e0b]/15 text-[#f59e0b]" : "bg-[#22c55e]/15 text-[#22c55e]"
            }`}
          >
            {dirty ? "draft — unsaved" : "in step with site.json"}
          </span>
          <Button small tone="ghost" onClick={undo} disabled={!canUndo} title="Undo">
            ↶ Undo
          </Button>
          <Button small tone="ghost" onClick={redo} disabled={!canRedo} title="Redo">
            ↷ Redo
          </Button>
        </div>
      </header>

      {/* ── Steps ─────────────────────────────────────────────────────────── */}
      <nav className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[#374151] px-4 py-2">
        {STEPS.filter((s) => s.group === "place").map((entry, i, all) => (
          <div key={entry.id} className="flex items-center gap-1">
            <StepButton
              step={entry}
              state={stateOf(STEPS.indexOf(entry))}
              problem={problemOf(entry.id)}
              onClick={() => setStep(entry.id)}
            />
            {i < all.length - 1 && <Rule />}
          </div>
        ))}

        <span className="mx-3 h-6 w-px shrink-0 bg-[#4b5563]" />
        <span className="shrink-0 pr-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Extras
        </span>
        {STEPS.filter((s) => s.group === "extra").map((entry) => (
          <StepButton
            key={entry.id}
            step={entry}
            state={stateOf(STEPS.indexOf(entry))}
            problem={problemOf(entry.id)}
            onClick={() => setStep(entry.id)}
          />
        ))}

        <span className="mx-3 h-6 w-px shrink-0 bg-[#4b5563]" />
        {STEPS.filter((s) => s.group === "save").map((entry) => (
          <StepButton
            key={entry.id}
            step={entry}
            state={stateOf(STEPS.indexOf(entry))}
            problem={problemOf(entry.id)}
            onClick={() => setStep(entry.id)}
          />
        ))}
      </nav>

      {/* ── Viewer + step ─────────────────────────────────────────────────── */}
      <div className="mx-auto flex w-full min-h-0 max-w-[100rem] flex-1 flex-col gap-3 px-4 py-3">
        {hasModel && (
          <div className="relative min-h-[16rem] flex-1 overflow-hidden rounded-lg border border-[#374151] bg-black">
            {viewport}
            <div className="pointer-events-none absolute inset-0">
              <ViewportToolbar />
              <SelectionReadout />
              <button
                type="button"
                onClick={() => setPanelOpen(!panelOpen)}
                title={panelOpen ? "Hide the form and fill the pane" : "Show the form"}
                className="pointer-events-auto absolute bottom-3 right-3 flex items-center gap-1.5 rounded-lg border border-[#4b5563] bg-[#111827]/85 px-2.5 py-1.5 text-[11px] text-slate-300 backdrop-blur transition hover:text-white"
              >
                {panelOpen ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
                {panelOpen ? "Bigger view" : "Show form"}
              </button>
            </div>
          </div>
        )}

        <div
          className={`shrink-0 overflow-y-auto rounded-lg border border-[#374151] bg-[#1f2937] ${
            // With no model this pane IS the page — step 1's drop box wants the
            // room. With one, it is the smaller half of a split.
            !hasModel ? "min-h-0 flex-1" : panelOpen ? "max-h-[34vh]" : "hidden"
          }`}
        >
          {step === "scene" && <SceneStep />}
          {step === "cameras" && <CamerasStep />}
          {step === "import" && <ImportStep />}
          {step === "resources" && <ResourcesStep />}
          {step === "hotspots" && <HotspotsStep />}
            {step === "lighting" && <LightingStep />}
          {step === "review" && <ReviewStep onGoToStep={(id) => setStep(id as StepId)} />}
        </div>

        <div className="flex shrink-0 items-center justify-between">
          <Button
            wide
            tone="danger"
            disabled={index === 0}
            onClick={() => setStep(STEPS[Math.max(0, index - 1)].id)}
          >
            Back
          </Button>
          <Button
            wide
            tone="primary"
            disabled={index === STEPS.length - 1}
            onClick={() => setStep(STEPS[Math.min(STEPS.length - 1, index + 1)].id)}
          >
            {index === STEPS.length - 2 ? "Review & save →" : "Next →"}
          </Button>
        </div>
      </div>
    </div>
  );
}
