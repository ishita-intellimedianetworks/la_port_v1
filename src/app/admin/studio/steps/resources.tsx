"use client";

/**
 * Step 4 — the layouts table: the PARENTS in the resource tree.
 *
 * A layout is one saved viewpoint plus the resources filed under it, and the
 * Resources panel renders exactly that nesting. But the file stores no tree:
 * `layouts` and `hotspots` are sibling arrays joined by `hotspots[].layoutId`,
 * and `config/index.ts` rebuilds the nesting at import. So parentage is set on
 * the CHILD, in step 5 — this step owns everything else about the parent.
 *
 * ORDER IS DATA. The order of this table is the order the panel lists zones
 * and layouts in; there is no sort key, so the arrows here are the only way to
 * change it.
 */

import { useState } from "react";
import type { ZoneKey } from "@/config/schema";
import { useDraftStore } from "../draft-store";
import {
  addLayout,
  deleteLayout,
  moveRow,
  patchLayout,
  renameLayout,
  setLayoutCamera,
} from "../mutations";
import { isPlaceholder } from "../pose";
import { sameSelection, useViewerStore } from "../viewer-store";
import {
  Button,
  Empty,
  Note,
  Panel,
  Row,
  Select,
  TextArea,
  TextField,
  Toggle,
  Vec3Field,
} from "../ui";
import { CameraEditor } from "../ui/camera-editor";

export function ResourcesStep() {
  const draft = useDraftStore((s) => s.draft);
  const selection = useViewerStore((s) => s.selection);
  const select = useViewerStore((s) => s.select);
  const setMode = useViewerStore((s) => s.setMode);
  const mode = useViewerStore((s) => s.mode);
  const livePose = useViewerStore((s) => s.livePose);

  const [open, setOpen] = useState<string | null>(draft.layouts[0]?.id ?? null);

  const zoneOptions = (Object.keys(draft.zones) as ZoneKey[]).map((zone) => ({
    value: zone,
    label: draft.zones[zone].label,
  }));

  return (
    <Panel
      title="4 · Layouts"
      description="The parents in the resource tree — one saved viewpoint each. Resources are filed under them in step 5."
      actions={
        <Button
          tone="primary"
          onClick={() => {
            // Seeded from the current view rather than the origin: a new
            // layout with a placeholder camera is one the runtime silently
            // redirects to the start pose, which looks like the button did
            // nothing.
            const id = addLayout({
              camera: { position: livePose.position, rotation: livePose.rotation },
            });
            setOpen(id);
            select({ kind: "layout", id, part: "camera" });
          }}
        >
          Add layout here
        </Button>
      }
    >
      {!draft.layouts.length && <Empty>No layouts yet. “Add layout here” captures the current view.</Empty>}

      <div className="space-y-2">
        {draft.layouts.map((layout, index) => {
          const isOpen = open === layout.id;
          const children = draft.hotspots.filter((h) => h.layoutId === layout.id);
          const zone = draft.zones[layout.zone];

          return (
            <div key={layout.id} className="rounded-lg border border-white/10 bg-white/[0.02]">
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  onClick={() => setOpen(isOpen ? null : layout.id)}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: zone?.color ?? "#64748b" }}
                  />
                  <span className="font-mono text-xs text-slate-400">{layout.id}</span>
                  <span className="truncate text-sm text-slate-100">{layout.name}</span>
                  <span className="shrink-0 text-[10px] text-slate-500">
                    {children.length} resource{children.length === 1 ? "" : "s"}
                    {layout.walkable ? " · walkable" : " · aerial"}
                    {isPlaceholder(layout.camera.position) && " · no camera"}
                  </span>
                </button>
                <Button small tone="ghost" title="Move up" onClick={() => moveRow("layouts", layout.id, -1)} disabled={index === 0}>
                  ↑
                </Button>
                <Button
                  small
                  tone="ghost"
                  title="Move down"
                  onClick={() => moveRow("layouts", layout.id, 1)}
                  disabled={index === draft.layouts.length - 1}
                >
                  ↓
                </Button>
              </div>

              {isOpen && (
                <div className="space-y-3 border-t border-white/10 px-4 py-4">
                  <Row label="Id" hint="primary key — renaming carries every reference with it">
                    <div className="flex gap-2">
                      <TextField
                        value={layout.id}
                        mono
                        onChange={(next) => {
                          if (next && next !== layout.id) {
                            renameLayout(layout.id, next);
                            setOpen(next);
                          }
                        }}
                      />
                    </div>
                  </Row>
                  <Row label="Name">
                    <TextField value={layout.name} onChange={(name) => patchLayout(layout.id, { name })} />
                  </Row>
                  <Row label="Zone" hint="the category the panel files it under">
                    <Select
                      value={layout.zone}
                      options={zoneOptions}
                      onChange={(zoneKey) => patchLayout(layout.id, { zone: zoneKey })}
                    />
                  </Row>
                  <Row label="Description">
                    <TextArea
                      value={layout.description}
                      rows={2}
                      onChange={(description) => patchLayout(layout.id, { description })}
                    />
                  </Row>

                  <Row label="Marker position" hint="where the layout itself sits">
                    <Vec3Field
                      value={layout.position}
                      step={0.1}
                      onChange={(position) => patchLayout(layout.id, { position })}
                    />
                  </Row>

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <Button
                      small
                      tone={sameSelection(selection, { kind: "layout", id: layout.id, part: "position" }) ? "primary" : "default"}
                      onClick={() => select({ kind: "layout", id: layout.id, part: "position" })}
                    >
                      Select marker
                    </Button>
                    <Button
                      small
                      tone={mode === "place" ? "primary" : "default"}
                      onClick={() => {
                        select({ kind: "layout", id: layout.id, part: "position" });
                        setMode(mode === "place" ? "orbit" : "place");
                      }}
                      title="Click the model in the viewport to drop the marker there"
                    >
                      {mode === "place" ? "Placing…" : "Place by clicking"}
                    </Button>
                    <Toggle
                      checked={layout.walkable}
                      label="Walkable"
                      onChange={(walkable) => patchLayout(layout.id, { walkable })}
                    />
                    <Toggle
                      checked={layout.exactPose ?? false}
                      label="Keep authored Y"
                      onChange={(exactPose) => patchLayout(layout.id, { exactPose })}
                    />
                  </div>

                  {layout.walkable && (
                    <Note>
                      Walkable means the runtime treats this as a first-person entry point and
                      paths to it across the navmesh. Every layout in this site is an aerial
                      framing; a walkable pose that misses the navmesh strands the player, so
                      check it is on the mesh before shipping.
                    </Note>
                  )}

                  <div className="pt-1">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Camera — shared by every resource under this layout that has none of its own
                    </p>
                    <CameraEditor
                      camera={layout.camera}
                      form="xyz"
                      selected={sameSelection(selection, { kind: "layout", id: layout.id, part: "camera" })}
                      onSelect={() => select({ kind: "layout", id: layout.id, part: "camera" })}
                      onChange={(camera) => setLayoutCamera(layout.id, camera)}
                    />
                  </div>

                  <div className="flex justify-between pt-2">
                    <span className="text-[11px] text-slate-500">
                      {children.length
                        ? `Deleting removes ${children.length} resource${children.length === 1 ? "" : "s"} with it.`
                        : "No resources filed under this layout."}
                    </span>
                    <Button
                      small
                      tone="danger"
                      onClick={() => {
                        deleteLayout(layout.id);
                        setOpen(null);
                      }}
                    >
                      Delete layout
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5">
        <Note>
          Deleting a layout deletes its resources too. `hotspots[].layoutId` is a foreign key, and
          an orphaned resource is the one edit the runtime validator complains about on every page
          load.
        </Note>
      </div>
    </Panel>
  );
}
