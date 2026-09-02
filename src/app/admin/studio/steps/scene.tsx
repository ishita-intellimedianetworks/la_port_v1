"use client";

/**
 * Step 1 — add the model. Everything else waits on it.
 *
 * PLACING A HOTSPOT, FRAMING A CAMERA AND JUDGING A LIGHT ALL MEAN LOOKING AT
 * GEOMETRY, so with nothing loaded the remaining steps are number entry
 * against a black rectangle. The viewport is therefore not shown at all until
 * a model is added: an empty canvas invites you to start working in it, and
 * every gesture in it would be meaningless.
 *
 * And loading it is not a formality here. `assets.modelUrl` points at
 * `/models/la-port-zone-c5-25-compressed.glb`, which a checkout does NOT ship:
 * the terminal streams distance-tiered chunks instead, and that GLB lives in
 * the bake repo. So a drop zone is the ordinary path rather than a fallback,
 * and the URL is the secondary option under it.
 *
 * The shape is the 3di admin's basic-details step — a drop box that becomes a
 * preview card with a delete button once something is in it, and stacked
 * full-width fields under it. The site record is DELIBERATELY just the label:
 * the ids, the hero container and the asset paths are site.json's own business
 * and are edited there, and a studio that offered them would be a JSON editor
 * with a 3D view attached.
 */

import { useRef, useState } from "react";
import { Box, Trash2, UploadCloud } from "lucide-react";
import { useDraftStore } from "../draft-store";
import { useViewerStore } from "../viewer-store";
import { Button, Group, Note, Panel, Row, TextField } from "../ui";

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
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl px-6 py-10
        outline-dashed outline-2 transition ${
          over
            ? "bg-[#0457a9]/15 text-slate-100 outline-[#0457a9]"
            : "bg-[#374151] text-slate-300 outline-[#4b5563] hover:outline-[#0457a9]"
        }`}
    >
      <UploadCloud size={26} className="text-slate-400" />
      <p className="text-sm">
        Drag &amp; drop or <span className="font-semibold text-slate-100">choose a GLB</span> to add
        the model
      </p>
      <p className="text-[11px] text-slate-500">
        .glb / .gltf — Draco, KTX2 and meshopt all open, same as the terminal
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

export function SceneStep() {
  const draft = useDraftStore((s) => s.draft);
  const update = useDraftStore((s) => s.update);
  const model = useViewerStore((s) => s.model);
  const setModel = useViewerStore((s) => s.setModel);
  const bounds = useViewerStore((s) => s.bounds);
  const stats = useViewerStore((s) => s.modelStats);
  const requestFrame = useViewerStore((s) => s.requestFrame);

  const loaded = model.kind !== "none";
  const span = bounds
    ? ([0, 1, 2] as const).map((i) => bounds.max[i] - bounds.min[i])
    : null;

  return (
    <Panel
      title="1 · Scene"
      description={
        loaded
          ? "The model is in. The viewport above is what every other step edits against."
          : "Add a model. The viewport appears once there is something in it."
      }
      actions={loaded ? <Button onClick={requestFrame}>Frame model</Button> : undefined}
    >
      <Group title="Model">
        {!loaded ? (
          <>
            <DropBox
              onFile={(file) =>
                setModel({ kind: "file", url: URL.createObjectURL(file), label: file.name })
              }
            />

            <div className="flex items-center gap-3 pt-1">
              <span className="h-px flex-1 bg-[#374151]" />
              <span className="text-[10px] uppercase tracking-wider text-slate-500">or</span>
              <span className="h-px flex-1 bg-[#374151]" />
            </div>

            <Row label="Model URL" hint="assets.modelUrl">
              <div className="flex gap-2">
                <TextField
                  value={draft.assets.modelUrl}
                  mono
                  onChange={(modelUrl) =>
                    update((d) => {
                      d.assets.modelUrl = modelUrl;
                    })
                  }
                />
                <Button
                  tone="primary"
                  disabled={!draft.assets.modelUrl}
                  onClick={() =>
                    setModel({
                      kind: "url",
                      url: draft.assets.modelUrl,
                      label: draft.assets.modelUrl,
                    })
                  }
                >
                  Load
                </Button>
              </div>
            </Row>

            <Note>
              A checkout ships no whole-zone GLB — the terminal streams chunks, and{" "}
              <code className="font-mono">assets.modelUrl</code> names a file that lives in the
              bake repo. Dropping it in from disk is the normal way in; the URL is for a build
              that does serve one.
            </Note>
          </>
        ) : (
          /* Loaded: the 3di admin's preview card — what is in, and one button
             to take it out again. */
          <div className="flex items-center gap-3 rounded-xl border border-[#374151] bg-[#111827] px-4 py-3">
            <Box size={22} className="shrink-0 text-[#22c55e]" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-xs text-slate-100">{model.label}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
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
