"use client";

/**
 * Step 4 — the layouts table: the PARENTS in the hotspot tree.
 *
 * A layout is one saved viewpoint plus the hotspots filed under it, and the
 * Resources panel renders exactly that nesting. But the file stores no tree:
 * `layouts` and `hotspots` are sibling arrays joined by `hotspots[].layoutId`,
 * and `config/index.ts` rebuilds the nesting at import. So parentage is set on
 * the CHILD, in step 5 — this step owns everything else about the parent.
 *
 * ORDER IS DATA. The order of this table is the order the panel lists zones
 * and layouts in; there is no sort key, so dragging a row by its grip is the
 * only way to change it.
 */

import { useState } from "react";
import { ChevronRight, Eye, Trash2 } from "lucide-react";
import type { ZoneKey } from "@/config/schema";
import { useDraftStore } from "../draft-store";
import {
  addLayout,
  deleteLayout,
  patchLayout,
  renameLayout,
  reorderRow,
  setLayoutCamera,
} from "../mutations";
import { isPlaceholder, poseForCamera } from "../pose";
import { sameSelection, useViewerStore } from "../viewer-store";
import {
  Button,
  Empty,
  IconButton,
  Note,
  Panel,
  Row,
  Select,
  TextField,
  Toggle,
  Vec3Field,
} from "../ui";
import { CameraEditor } from "../ui/camera-editor";
import { SortableList } from "../ui/sortable-list";

export function ResourcesStep() {
  const draft = useDraftStore((s) => s.draft);
  const selection = useViewerStore((s) => s.selection);
  const select = useViewerStore((s) => s.select);
  const livePose = useViewerStore((s) => s.livePose);
  const liveTarget = useViewerStore((s) => s.liveTarget);
  const requestFly = useViewerStore((s) => s.requestFly);

  const [open, setOpen] = useState<string | null>(draft.layouts[0]?.id ?? null);

  const zoneOptions = (Object.keys(draft.zones) as ZoneKey[]).map((zone) => ({
    value: zone,
    label: draft.zones[zone].label,
  }));

  return (
    <Panel
      title="4 · Layouts"
      description="One saved viewpoint each, with the hotspots filed under it. Drag a row by its grip to set the order the panel lists them in."
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

      <SortableList
        items={draft.layouts}
        onReorder={(from, to) => reorderRow("layouts", draft.layouts[from].id, to)}
      >
        {(layout, _index, handle) => {
          const isOpen = open === layout.id;
          const children = draft.hotspots.filter((h) => h.layoutId === layout.id);
          const zone = draft.zones[layout.zone];
          const placed = !isPlaceholder(layout.camera.position);

          return (
            <div
              className={`overflow-hidden rounded-lg border bg-[#111827] transition-colors ${
                isOpen ? "border-[#0457a9]" : "border-[#374151] hover:border-[#4b5563]"
              }`}
            >
              <div className={`flex items-center gap-2 px-2 py-2.5 ${isOpen ? "bg-[#0457a9]/10" : ""}`}>
                {handle}
                {/* The whole left side is the disclosure: a chevron that turns,
                    then everything that identifies the row. One target, and it
                    is the obvious one — an "edit" icon off on the right made
                    you hunt for a control the row already was. */}
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  onClick={() => setOpen(isOpen ? null : layout.id)}
                  title={isOpen ? "Collapse" : "Expand"}
                >
                  <ChevronRight
                    size={15}
                    className={`shrink-0 text-slate-500 transition-transform ${isOpen ? "rotate-90" : ""}`}
                  />
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: zone?.color ?? "#64748b" }}
                  />
                  <span className="w-10 shrink-0 font-mono text-xs text-slate-400">{layout.id}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-100">{layout.name}</span>
                  <span className="shrink-0 text-[10px] text-slate-500">
                    {children.length} hotspot{children.length === 1 ? "" : "s"}
                    {layout.walkable ? " · walkable" : " · aerial"}
                  </span>
                  {!placed && (
                    <span className="shrink-0 rounded-full bg-[#f59e0b]/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[#f59e0b]">
                      no camera
                    </span>
                  )}
                </button>

                <IconButton
                  tone="warning"
                  title="Fly the viewport to this layout's camera"
                  disabled={!placed}
                  onClick={() => requestFly(poseForCamera(layout.camera))}
                >
                  <Eye size={14} />
                </IconButton>
                <IconButton
                  tone="danger"
                  title={
                    children.length
                      ? `Delete — takes ${children.length} hotspot(s) with it`
                      : "Delete layout"
                  }
                  onClick={() => {
                    deleteLayout(layout.id);
                    setOpen(null);
                  }}
                >
                  <Trash2 size={13} />
                </IconButton>
              </div>

              {isOpen && (
                <div className="space-y-3 border-t border-[#374151] px-4 py-4">
                  <Row label="Id" hint="primary key — renaming carries every reference with it">
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
                  </Row>
                  <Row label="Name" hint="labels the layout in the scene and the panel">
                    <TextField value={layout.name} onChange={(name) => patchLayout(layout.id, { name })} />
                  </Row>
                  <Row label="Zone" hint="the category the panel files it under">
                    <Select
                      value={layout.zone}
                      options={zoneOptions}
                      onChange={(zoneKey) => patchLayout(layout.id, { zone: zoneKey })}
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
                      tone="primary"
                      // The orbit target is the middle of the view. Centre the
                      // thing, press the button — no mode to arm, and it works
                      // over open water where a click on the model has nothing
                      // to hit.
                      onClick={() => {
                        select({ kind: "layout", id: layout.id, part: "position" });
                        patchLayout(layout.id, { position: liveTarget });
                      }}
                      title="Put the marker at the point the viewport is centred on"
                    >
                      Use this point
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
                      Camera — shared by every hotspot under this layout that has none of its own
                    </p>
                    <CameraEditor
                      camera={layout.camera}
                      form="xyz"
                      selected={sameSelection(selection, { kind: "layout", id: layout.id, part: "camera" })}
                      onSelect={() => select({ kind: "layout", id: layout.id, part: "camera" })}
                      onChange={(camera) => setLayoutCamera(layout.id, camera)}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        }}
      </SortableList>

      <div className="mt-5">
        <Note>
          Deleting a layout deletes its hotspots too. <code className="font-mono">hotspots[].layoutId</code>{" "}
          is a foreign key, and an orphaned hotspot is the one edit the runtime validator complains
          about on every page load.
        </Note>
      </div>
    </Panel>
  );
}
