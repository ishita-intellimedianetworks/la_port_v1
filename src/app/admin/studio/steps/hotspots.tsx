"use client";

/**
 * Step 5 — where each hotspot SITS, and what looks at it.
 *
 * That is the whole step. The card it opens — its heading, its icon, the
 * fields it lists — is the site's UI and is authored elsewhere; what needs a
 * viewport is the two things you cannot judge from a number: whether the
 * marker is on the right quay, and whether the camera that flies to it frames
 * anything worth arriving at.
 *
 * THREE THINGS ARE STORED IN NON-OBVIOUS PLACES, which is why this is a step
 * rather than a JSON edit:
 *
 *   the name       labels the marker in the scene and the row in the panel.
 *                  It is `name`, not `popupTitle` — that second string heads
 *                  the data card, is usually related and deliberately not the
 *                  same, and is not this tool's business.
 *
 *   the order      is the ORDER OF THE ARRAY. `config/index.ts` derives each
 *                  layout's child list by filtering `hotspots[]` in table
 *                  order, so there is no sort key to set and no other way to
 *                  reorder the panel. Drag a row by its grip.
 *
 *   the parent     is `layoutId` on the child, stated once. Re-parenting also
 *                  moves the row next to its new siblings, because a row left
 *                  stranded mid-table shows up in a position nobody chose.
 */

import { useMemo, useState } from "react";
import { Eye, MapPin, Trash2 } from "lucide-react";
import { useDraftStore } from "../draft-store";
import {
  addHotspot,
  deleteHotspot,
  patchHotspot,
  renameHotspot,
  reorderRow,
  reparentHotspot,
  setHotspotCamera,
} from "../mutations";
import { isPlaceholder, poseForCamera, yxzToXyz } from "../pose";
import { sameSelection, useViewerStore } from "../viewer-store";
import { Button, Empty, IconButton, Panel, Row, Select, TextField, Vec3Field } from "../ui";
import { CameraEditor } from "../ui/camera-editor";
import { SortableList } from "../ui/sortable-list";

export function HotspotsStep() {
  const draft = useDraftStore((s) => s.draft);
  const selection = useViewerStore((s) => s.selection);
  const select = useViewerStore((s) => s.select);
  const mode = useViewerStore((s) => s.mode);
  const setMode = useViewerStore((s) => s.setMode);
  const livePose = useViewerStore((s) => s.livePose);
  const requestFly = useViewerStore((s) => s.requestFly);

  const [open, setOpen] = useState<string | null>(null);
  /** Show one layout's children, or all of them. Thirty hotspots across ten
   *  layouts is a long scroll to hunt through. */
  const [layoutFilter, setLayoutFilter] = useState<string>("");

  const layoutOptions = useMemo(
    () => draft.layouts.map((l) => ({ value: l.id, label: `${l.id} — ${l.name}` })),
    [draft.layouts],
  );

  /** Rows IN TABLE ORDER — which is display order, so the list has to show
   *  them exactly as stored rather than grouped or sorted for tidiness. */
  const rows = draft.hotspots.filter((h) => !layoutFilter || h.layoutId === layoutFilter);

  return (
    <Panel
      title="5 · Hotspots"
      description="Where each hotspot sits, and what flies to it. Drag a row by its grip to set the order the panel lists them in."
      actions={
        <Button
          tone="primary"
          disabled={!draft.layouts.length}
          onClick={() => {
            const layoutId = layoutFilter || draft.layouts[0].id;
            const id = addHotspot(layoutId);
            setOpen(id);
            select({ kind: "hotspot", id, part: "position" });
            // Straight into place mode — a new hotspot at the origin has its
            // marker suppressed, so the next thing anyone wants is to put it
            // somewhere.
            setMode("place");
          }}
        >
          Add hotspot
        </Button>
      }
    >
      <div className="mb-4 flex items-center gap-3">
        <span className="text-xs text-slate-400">Show</span>
        <div className="w-64">
          <Select
            value={layoutFilter}
            options={[{ value: "", label: "All layouts" }, ...layoutOptions]}
            onChange={setLayoutFilter}
          />
        </div>
        {mode === "place" && (
          <Button small tone="primary" onClick={() => setMode("orbit")}>
            Placing — click the model, or stop
          </Button>
        )}
      </div>

      {!rows.length && <Empty>No hotspots here yet.</Empty>}

      <SortableList
        items={rows}
        onReorder={(from, to) => {
          // Indices are into the FILTERED list; the array being reordered is
          // the whole table. Landing "at filtered position `to`" means landing
          // where that row currently is in the full array — which is the right
          // answer whether the drag went up or down, since `reorderRow` splices
          // the row out before it inserts.
          reorderRow("hotspots", rows[from].id, draft.hotspots.indexOf(rows[to]));
        }}
      >
        {(hotspot, _index, handle) => {
          const isOpen = open === hotspot.id;
          const zone = draft.zones[draft.layouts.find((l) => l.id === hotspot.layoutId)?.zone ?? "waterside"];
          const unplaced = isPlaceholder(hotspot.position);

          return (
            <div className="rounded-lg border border-[#374151] bg-[#111827]">
              <div className="flex items-center gap-1.5 px-2 py-2">
                {handle}
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  onClick={() => {
                    setOpen(isOpen ? null : hotspot.id);
                    select({ kind: "hotspot", id: hotspot.id, part: "position" });
                  }}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: zone?.color ?? "#64748b" }}
                  />
                  <span className="font-mono text-xs text-slate-400">{hotspot.id}</span>
                  <span className="truncate text-sm text-slate-100">{hotspot.name}</span>
                  <span className="shrink-0 text-[10px] text-slate-500">
                    {hotspot.layoutId}
                    {hotspot.camera ? " · own camera" : " · layout camera"}
                  </span>
                  {unplaced && (
                    <span className="shrink-0 rounded-full bg-[#f59e0b]/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[#f59e0b]">
                      unplaced
                    </span>
                  )}
                </button>

                <IconButton
                  tone="warning"
                  title="Fly the viewport to what looks at this hotspot"
                  onClick={() =>
                    requestFly(
                      poseForCamera(
                        hotspot.camera ??
                          draft.layouts.find((l) => l.id === hotspot.layoutId)!.camera,
                      ),
                    )
                  }
                >
                  <Eye size={14} />
                </IconButton>
                <IconButton
                  tone={mode === "place" && sameSelection(selection, { kind: "hotspot", id: hotspot.id, part: "position" }) ? "primary" : "accent"}
                  title="Place by clicking the model"
                  onClick={() => {
                    select({ kind: "hotspot", id: hotspot.id, part: "position" });
                    setMode("place");
                  }}
                >
                  <MapPin size={13} />
                </IconButton>
                <IconButton
                  tone="danger"
                  title="Delete hotspot"
                  onClick={() => {
                    deleteHotspot(hotspot.id);
                    setOpen(null);
                  }}
                >
                  <Trash2 size={13} />
                </IconButton>
              </div>

              {isOpen && (
                <div className="space-y-3 border-t border-[#374151] px-4 py-4">
                  <Row label="Id" hint="primary key — journeys reference it">
                    <TextField
                      value={hotspot.id}
                      mono
                      onChange={(next) => {
                        if (next && next !== hotspot.id) {
                          renameHotspot(hotspot.id, next);
                          setOpen(next);
                        }
                      }}
                    />
                  </Row>
                  <Row label="Parent layout" hint="the only place parentage is stated">
                    <Select
                      value={hotspot.layoutId}
                      options={layoutOptions}
                      onChange={(layoutId) => reparentHotspot(hotspot.id, layoutId)}
                    />
                  </Row>
                  <Row label="Name" hint="labels the marker in the scene and the row in the panel">
                    <TextField value={hotspot.name} onChange={(name) => patchHotspot(hotspot.id, { name })} />
                  </Row>

                  <Row label="Position">
                    <Vec3Field
                      value={hotspot.position}
                      step={0.1}
                      onChange={(position) => patchHotspot(hotspot.id, { position })}
                    />
                  </Row>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      small
                      tone={
                        sameSelection(selection, { kind: "hotspot", id: hotspot.id, part: "position" })
                          ? "primary"
                          : "default"
                      }
                      onClick={() => select({ kind: "hotspot", id: hotspot.id, part: "position" })}
                    >
                      Select marker
                    </Button>
                    <Button
                      small
                      onClick={() => {
                        select({ kind: "hotspot", id: hotspot.id, part: "position" });
                        setMode(mode === "place" ? "orbit" : "place");
                      }}
                    >
                      {mode === "place" ? "Stop placing" : "Place by clicking"}
                    </Button>
                  </div>

                  <div className="pt-1">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Own camera
                    </p>
                    {hotspot.camera ? (
                      <CameraEditor
                        camera={hotspot.camera}
                        form="xyz"
                        selected={sameSelection(selection, { kind: "hotspot", id: hotspot.id, part: "camera" })}
                        onSelect={() => select({ kind: "hotspot", id: hotspot.id, part: "camera" })}
                        onChange={(camera) => setHotspotCamera(hotspot.id, camera)}
                        onClear={() => setHotspotCamera(hotspot.id, null)}
                      />
                    ) : (
                      <div className="rounded-lg border border-dashed border-[#4b5563] px-3 py-3">
                        <p className="mb-2 text-[11px] text-slate-500">
                          Flies to {hotspot.layoutId}&apos;s camera. Give it one of its own to
                          frame this hotspot instead.
                        </p>
                        <Button
                          small
                          onClick={() =>
                            setHotspotCamera(hotspot.id, {
                              position: livePose.position,
                              // The live pose is YXZ; a hotspot camera is
                              // stored XYZ. `CameraEditor` does this reorder
                              // for its own capture button, and so does this.
                              rotation: yxzToXyz(livePose.rotation),
                            })
                          }
                        >
                          Add camera from current view
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        }}
      </SortableList>
    </Panel>
  );
}
