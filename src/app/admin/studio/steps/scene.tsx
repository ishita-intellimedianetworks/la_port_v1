"use client";

/**
 * Step 1 — drop in something to look at.
 *
 * THE GLB IS A STAND-IN, NOT A SETTING. The terminal never loads a whole-zone
 * model: it streams distance-tiered chunks, chosen per device and per camera
 * distance, so there is no single file to point the runtime at and nothing
 * here is written to `site.json`. What the studio needs is geometry roughly
 * where the real thing will be, so that a camera can be framed against it and
 * a hotspot dropped on the right quay.
 *
 * That is why this is a file picker and not a URL field. A URL implies the
 * value is the answer to something; this one is scaffolding, discarded when
 * the tab closes.
 *
 * It comes first because nothing else works without it. Framing a camera,
 * placing a hotspot and judging a light all mean LOOKING at geometry, so the
 * viewport does not appear until something is loaded.
 *
 * FIELD OF VIEW LIVES HERE TOO, for the same reason it used to have a step of
 * its own and should not have: `world.fov` is ONE number for the whole site —
 * applied to the Canvas camera at creation and re-asserted by the camera store
 * onto whatever camera the scene registers, so the dollhouse, the walking view
 * and all forty authored shots share it. Moving it re-frames every one of
 * them, which makes it a thing to settle BEFORE any camera is taken, not a
 * step to arrive at afterwards.
 */

import { useRef, useState } from "react";
import { Box, Trash2, UploadCloud } from "lucide-react";
import { useDraftStore } from "../draft-store";
import { useViewerStore } from "../viewer-store";
import { Button, Group, Note, Panel, Row, Slider, TextField } from "../ui";

/** The 3di admin's `UploadBox`: one dashed target that takes a drop or a
 *  click. Their version wraps react-dropzone; a single-file picker needs a
 *  file input and two drag handlers, so this one does not. */
function DropBox({ onFile }: { onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl px-6 py-12
        outline-dashed outline-2 transition ${
          over
            ? "bg-[#22c55e]/15 text-slate-50 outline-[#22c55e]"
            : "bg-[#374151] text-slate-200 outline-[#6b7280] hover:outline-[#22c55e]"
        }`}
    >
      <UploadCloud size={28} className="text-slate-400" />
      <p className="text-sm">
        Drag &amp; drop or <span className="font-semibold text-slate-100">choose a GLB</span> to
        look at
      </p>
      <p className="text-[11px] text-slate-400">
        .glb / .gltf — Draco, KTX2 and meshopt all open, same loader as the terminal
      </p>
      <input
        ref={input}
        type="file"
        accept=".glb,.gltf"
        className="hidden"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          // Let the same file be picked twice in a row — otherwise the input
          // holds the old value and the change event never fires.
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** Common reference angles, so the slider has landmarks rather than being a
 *  bare range. Roughly: long lens → normal → wide. */
const FOV_PRESETS = [24, 32, 35, 50, 70];

export function SceneStep() {
  const draft = useDraftStore((s) => s.draft);
  const update = useDraftStore((s) => s.update);
  const model = useViewerStore((s) => s.model);
  const setModel = useViewerStore((s) => s.setModel);
  const bounds = useViewerStore((s) => s.bounds);
  const stats = useViewerStore((s) => s.modelStats);
  const requestFrame = useViewerStore((s) => s.requestFrame);

  const loaded = model.kind !== "none";
  const span = bounds ? ([0, 1, 2] as const).map((i) => bounds.max[i] - bounds.min[i]) : null;

  return (
    <Panel
      title="1 · Model"
      description={
        loaded
          ? "Reference geometry for the steps that follow. Nothing about it is saved."
          : "Drop in a bake to work against. The viewport appears once there is something in it."
      }
      actions={loaded ? <Button onClick={requestFrame}>Frame model</Button> : undefined}
    >
      <Group title="Reference model">
        {!loaded ? (
          <>
            <DropBox
              onFile={(file) =>
                setModel({ kind: "file", url: URL.createObjectURL(file), label: file.name })
              }
            />
            <Note>
              This is scaffolding, not a setting — it is never written to{" "}
              <code className="font-mono">site.json</code> and it goes when the tab closes. The
              terminal streams distance-tiered chunks chosen per device, so there is no one model
              file for it to be. Any bake of the zone will do; the cameras and hotspots you author
              against it are what gets saved.
            </Note>
          </>
        ) : (
          /* Loaded: the 3di admin's preview card — what is in, and one button
             to take it out again. */
          <div className="flex items-center gap-3 rounded-xl border border-[#374151] bg-[#111827] px-4 py-3">
            <Box size={22} className="shrink-0 text-[#22c55e]" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-xs text-slate-100">{model.label}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {span
                  ? `${span[0].toFixed(0)} × ${span[1].toFixed(0)} × ${span[2].toFixed(0)} world units`
                  : "measuring…"}
                {stats && ` · ${stats.meshes} meshes`}
                {stats &&
                  (stats.clips
                    ? ` · ${stats.clips} clip${stats.clips === 1 ? "" : "s"} playing`
                    : " · no baked animation")}
              </p>
            </div>
            <Button tone="danger" small onClick={() => setModel({ kind: "none" })}>
              <Trash2 size={13} /> Remove
            </Button>
          </div>
        )}
      </Group>

      {loaded && (
        <Group title="Field of view">
          <Row label="world.fov" hint="one angle, every camera in the site">
            <Slider
              value={draft.world.fov}
              min={5}
              max={110}
              // WHOLE DEGREES. A fractional field of view is a distinction
              // nobody can see and everybody has to read past: the shipped
              // value is 35, the authoring cameras were 32, and the judgement
              // between them is "how much of the terminal is in shot", which
              // half a degree does not move. It also keeps the slider, the
              // number box and the presets landing on the same values, so a
              // preset stays lit after a nudge.
              step={1}
              suffix="°"
              onChange={(next) =>
                update(
                  (d) => {
                    d.world.fov = Math.round(next);
                  },
                  // Dragging is one gesture. Each pixel of travel pushing an
                  // undo entry would bury the value it started from.
                  { history: false },
                )
              }
            />
          </Row>
          <div className="flex flex-wrap gap-1.5">
            {FOV_PRESETS.map((preset) => (
              <Button
                key={preset}
                small
                tone={Math.round(draft.world.fov) === preset ? "primary" : "default"}
                onClick={() =>
                  update((d) => {
                    d.world.fov = preset;
                  })
                }
              >
                {preset}°
              </Button>
            ))}
          </div>
          <p className="text-[11px] leading-relaxed text-slate-400">
            Settle this before taking any camera — every shot in the site is framed through it,
            so changing it later re-frames all of them at once. The authoring cameras carried 32°;
            the site ships 35°.
          </p>
        </Group>
      )}

      <Group title="Site record">
        <Row label="Label" hint="meta.label — the name this site goes by">
          <TextField
            value={draft.meta.label}
            onChange={(label) =>
              update((d) => {
                d.meta.label = label;
              })
            }
          />
        </Row>
      </Group>
    </Panel>
  );
}
