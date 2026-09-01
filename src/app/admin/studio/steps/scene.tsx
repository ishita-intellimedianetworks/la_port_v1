"use client";

/**
 * Step 1 — the scene itself: which model the studio is looking at, and the
 * handful of site-record fields everything downstream depends on.
 *
 * IT COMES FIRST BECAUSE NOTHING ELSE WORKS WITHOUT IT. Placing a hotspot,
 * framing a camera and judging a light all mean looking at geometry; with no
 * model loaded the remaining seven steps are number entry against a black
 * rectangle.
 *
 * And loading it is not a formality here. `assets.modelUrl` points at
 * `/models/la-port-zone-c5-25-compressed.glb`, which a checkout does NOT ship:
 * the terminal streams distance-tiered chunks instead, and that GLB lives in
 * the bake repo. So "pick a file from disk" is the ordinary path rather than a
 * fallback, and this step says so instead of leaving the author to work it out
 * from a 404.
 */

import { useRef } from "react";
import { useDraftStore } from "../draft-store";
import { useViewerStore } from "../viewer-store";
import { Button, Group, Note, Panel, Row, Select, TextField, Toggle } from "../ui";

export function SceneStep() {
  const draft = useDraftStore((s) => s.draft);
  const update = useDraftStore((s) => s.update);
  const model = useViewerStore((s) => s.model);
  const setModel = useViewerStore((s) => s.setModel);
  const bounds = useViewerStore((s) => s.bounds);
  const requestFrame = useViewerStore((s) => s.requestFrame);
  const fileInput = useRef<HTMLInputElement>(null);

  const span = bounds
    ? {
        x: bounds.max[0] - bounds.min[0],
        y: bounds.max[1] - bounds.min[1],
        z: bounds.max[2] - bounds.min[2],
      }
    : null;

  return (
    <Panel
      title="1 · Scene"
      description="Point the studio at a model, then set the site record everything else hangs off."
      actions={
        <Button onClick={requestFrame} disabled={!bounds}>
          Frame model
        </Button>
      }
    >
      <Group title="Model">
        <Note>
          A checkout ships no whole-zone GLB — the terminal streams chunks, and{" "}
          <code className="font-mono">assets.modelUrl</code> names a file that lives in the bake
          repo. Picking it from disk is the normal way in; the URL button is for a build that does
          serve one.
        </Note>

        <Row label="Model URL" hint="assets.modelUrl">
          <TextField
            value={draft.assets.modelUrl}
            mono
            onChange={(modelUrl) =>
              update((d) => {
                d.assets.modelUrl = modelUrl;
              })
            }
          />
        </Row>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            tone="primary"
            onClick={() =>
              setModel({
                kind: "url",
                url: draft.assets.modelUrl,
                label: draft.assets.modelUrl,
              })
            }
            disabled={!draft.assets.modelUrl}
          >
            Load from URL
          </Button>
          <Button onClick={() => fileInput.current?.click()}>Pick GLB from disk…</Button>
          {model.kind !== "none" && (
            <Button tone="ghost" onClick={() => setModel({ kind: "none" })}>
              Unload
            </Button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept=".glb,.gltf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setModel({ kind: "file", url: URL.createObjectURL(file), label: file.name });
              // Let the same file be picked twice in a row — otherwise the
              // input holds the old value and the change event never fires.
              e.target.value = "";
            }}
          />
        </div>

        <p className="pt-1 text-xs text-slate-400">
          {model.kind === "none" ? (
            "Nothing loaded."
          ) : (
            <>
              Showing <span className="font-mono text-slate-200">{model.label}</span>
              {span && (
                <>
                  {" "}
                  — {span.x.toFixed(0)} × {span.y.toFixed(0)} × {span.z.toFixed(0)} world units,
                  centred near{" "}
                  <span className="font-mono">
                    [{((bounds!.min[0] + bounds!.max[0]) / 2).toFixed(0)},{" "}
                    {((bounds!.min[1] + bounds!.max[1]) / 2).toFixed(0)},{" "}
                    {((bounds!.min[2] + bounds!.max[2]) / 2).toFixed(0)}]
                  </span>
                </>
              )}
            </>
          )}
        </p>
      </Group>

      <Group title="Site record">
        <Row label="Site id" hint="meta.id">
          <TextField
            value={draft.meta.id}
            mono
            onChange={(id) =>
              update((d) => {
                d.meta.id = id;
              })
            }
          />
        </Row>
        <Row label="Label" hint="meta.label">
          <TextField
            value={draft.meta.label}
            onChange={(label) =>
              update((d) => {
                d.meta.label = label;
              })
            }
          />
        </Row>
        <Row
          label="Opens on"
          hint="startLayoutId — a foreign key into the layouts table, not a fourth camera"
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
        <Row label="Hero container" hint="globals.heroContainerId — asserted equal on every field marked ref: hero">
          <TextField
            value={draft.globals.heroContainerId}
            mono
            onChange={(heroContainerId) =>
              update((d) => {
                d.globals.heroContainerId = heroContainerId;
              })
            }
          />
        </Row>
      </Group>

      <Group title="Assets">
        <Row label="Preview cloud" hint="assets.previewUrl — must be baked FROM the model above">
          <TextField
            value={draft.assets.previewUrl}
            mono
            onChange={(previewUrl) =>
              update((d) => {
                d.assets.previewUrl = previewUrl;
              })
            }
          />
        </Row>
        <Row label="Environment HDRI" hint="assets.envFile — lights the studio viewport too">
          <TextField
            value={draft.assets.envFile}
            mono
            onChange={(envFile) =>
              update((d) => {
                d.assets.envFile = envFile;
              })
            }
          />
        </Row>
        <Row label="Eye height" hint="world.eyeHeight — added to a ground camera on arrival">
          <TextField
            value={String(draft.world.eyeHeight)}
            mono
            onChange={(value) => {
              const parsed = Number(value);
              if (Number.isFinite(parsed)) {
                update((d) => {
                  d.world.eyeHeight = parsed;
                });
              }
            }}
          />
        </Row>
        <div className="pt-1">
          <Toggle
            checked={draft.world.shadows}
            label="Cast shadows (world.shadows)"
            onChange={(shadows) =>
              update((d) => {
                d.world.shadows = shadows;
              })
            }
          />
        </div>
      </Group>
    </Panel>
  );
}
