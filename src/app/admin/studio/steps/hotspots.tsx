"use client";

/**
 * Step 5 — the resources table, and the two things the brief actually asks of
 * it: a configurable title, and an order you choose.
 *
 * BOTH ARE STORED IN NON-OBVIOUS PLACES, which is why this step is worth
 * having rather than editing the JSON:
 *
 *   the title      is TWO fields. `name` labels the marker and the row in the
 *                  Resources panel; `popupTitle` heads the data card that
 *                  opens when it is tapped. They are usually related and
 *                  deliberately not the same string — "Main Channel" against
 *                  "Main Channel / Vessel Traffic".
 *
 *   the order      is the ORDER OF THE ARRAY. `config/index.ts` derives each
 *                  layout's child list by filtering `hotspots[]` in table
 *                  order, so there is no sort key to set and no other way to
 *                  reorder the panel. The arrows here move the row.
 *
 *   the parent     is `layoutId` on the child, stated once. Re-parenting also
 *                  moves the row next to its new siblings, because a row left
 *                  stranded mid-table shows up in a position nobody chose.
 */

import { useMemo, useState } from "react";
import type { FieldType, HotspotIcon, Tone } from "@/config/schema";
import { useDraftStore } from "../draft-store";
import {
  addField,
  addHotspot,
  deleteHotspot,
  HOTSPOT_ICONS,
  moveField,
  moveRow,
  patchField,
  patchHotspot,
  removeField,
  renameHotspot,
  reparentHotspot,
  setHotspotCamera,
} from "../mutations";
import { isPlaceholder, yxzToXyz } from "../pose";
import { sameSelection, useViewerStore } from "../viewer-store";
import {
  Button,
  Empty,
  Note,
  Panel,
  Row,
  Select,
  TextField,
  Vec3Field,
} from "../ui";
import { CameraEditor } from "../ui/camera-editor";

const FIELD_TYPES: FieldType[] = [
  "string",
  "integer",
  "decimal",
  "percentage",
  "enum",
  "boolean",
  "datetime",
  "duration",
];

const TONES: (Tone | "")[] = ["", "ok", "warn", "alert"];

export function HotspotsStep() {
  const draft = useDraftStore((s) => s.draft);
  const selection = useViewerStore((s) => s.selection);
  const select = useViewerStore((s) => s.select);
  const mode = useViewerStore((s) => s.mode);
  const setMode = useViewerStore((s) => s.setMode);
  const livePose = useViewerStore((s) => s.livePose);

  const [open, setOpen] = useState<string | null>(null);
  /** Show one layout's children, or all of them. Thirty resources across ten
   *  layouts is a long scroll to hunt through. */
  const [layoutFilter, setLayoutFilter] = useState<string>("");

  const layoutOptions = useMemo(
    () => draft.layouts.map((l) => ({ value: l.id, label: `${l.id} — ${l.name}` })),
    [draft.layouts],
  );

  /** Rows IN TABLE ORDER — which is display order, so the list has to show
   *  them exactly as stored rather than grouped or sorted for tidiness. */
  const rows = draft.hotspots
    .map((hotspot, index) => ({ hotspot, index }))
    .filter(({ hotspot }) => !layoutFilter || hotspot.layoutId === layoutFilter);

  return (
    <Panel
      title="5 · Resources"
      description="Titles, order, parentage and per-resource cameras. The order of this list is the order the Resources panel shows."
      actions={
        <Button
          tone="primary"
          disabled={!draft.layouts.length}
          onClick={() => {
            const layoutId = layoutFilter || draft.layouts[0].id;
            const id = addHotspot(layoutId);
            setOpen(id);
            select({ kind: "hotspot", id, part: "position" });
            // Straight into place mode — a new resource at the origin has its
            // marker suppressed, so the next thing anyone wants is to put it
            // somewhere.
            setMode("place");
          }}
        >
          Add resource
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

      {!rows.length && <Empty>No resources here yet.</Empty>}

      <div className="space-y-2">
        {rows.map(({ hotspot, index }) => {
          const isOpen = open === hotspot.id;
          const zone = draft.zones[draft.layouts.find((l) => l.id === hotspot.layoutId)?.zone ?? "waterside"];

          return (
            <div key={hotspot.id} className="rounded-lg border border-white/10 bg-white/[0.02]">
              <div className="flex items-center gap-2 px-3 py-2">
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
                    {hotspot.layoutId} · {hotspot.icon} · {hotspot.fields.length} fields
                    {isPlaceholder(hotspot.position) && " · unplaced"}
                    {hotspot.camera && " · own camera"}
                  </span>
                </button>
                {/* Index in the FULL table, not the filtered view — moving a
                    row past a hidden sibling is still a move, and pretending
                    otherwise would make the arrows lie. */}
                <Button
                  small
                  tone="ghost"
                  title="Move earlier in the list"
                  onClick={() => moveRow("hotspots", hotspot.id, -1)}
                  disabled={index === 0}
                >
                  ↑
                </Button>
                <Button
                  small
                  tone="ghost"
                  title="Move later in the list"
                  onClick={() => moveRow("hotspots", hotspot.id, 1)}
                  disabled={index === draft.hotspots.length - 1}
                >
                  ↓
                </Button>
              </div>

              {isOpen && (
                <div className="space-y-3 border-t border-white/10 px-4 py-4">
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
                  <Row label="Marker title" hint="labels the marker and the panel row">
                    <TextField value={hotspot.name} onChange={(name) => patchHotspot(hotspot.id, { name })} />
                  </Row>
                  <Row label="Card title" hint="heads the data card the marker opens">
                    <TextField
                      value={hotspot.popupTitle}
                      onChange={(popupTitle) => patchHotspot(hotspot.id, { popupTitle })}
                    />
                  </Row>
                  <Row label="Icon">
                    <Select
                      value={hotspot.icon}
                      options={HOTSPOT_ICONS.map((icon) => ({ value: icon, label: icon }))}
                      onChange={(icon) => patchHotspot(hotspot.id, { icon: icon as HotspotIcon })}
                    />
                  </Row>

                  <Row label="Position">
                    <Vec3Field
                      value={hotspot.position}
                      step={0.1}
                      onChange={(position) => patchHotspot(hotspot.id, { position })}
                    />
                  </Row>
                  <Row label="Rotation" hint="data only — the marker bead is a sphere">
                    <Vec3Field
                      value={hotspot.rotation}
                      step={0.01}
                      onChange={(rotation) => patchHotspot(hotspot.id, { rotation })}
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
                    <Button small tone="danger" onClick={() => { deleteHotspot(hotspot.id); setOpen(null); }}>
                      Delete
                    </Button>
                  </div>

                  <div className="pt-2">
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
                      <div className="rounded border border-dashed border-white/15 px-3 py-3">
                        <p className="mb-2 text-[11px] text-slate-500">
                          Viewed from {hotspot.layoutId}&apos;s camera. Give it one to frame this
                          resource on its own.
                        </p>
                        <Button
                          small
                          onClick={() =>
                            setHotspotCamera(hotspot.id, {
                              position: livePose.position,
                              // The live pose is YXZ; a resource camera is
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

                  <div className="pt-2">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Card fields — shown in this order
                      </p>
                      <Button small onClick={() => addField(hotspot.id)}>
                        Add field
                      </Button>
                    </div>
                    {!hotspot.fields.length ? (
                      <Empty>No fields — the card opens with a title and nothing under it.</Empty>
                    ) : (
                      <div className="space-y-1.5">
                        {hotspot.fields.map((field, fieldIndex) => (
                          <div
                            key={`${field.name}-${fieldIndex}`}
                            className="grid grid-cols-[1fr_1fr_7rem_1fr_4rem_5rem_auto] items-center gap-1.5"
                          >
                            <TextField
                              value={field.name}
                              mono
                              onChange={(name) => patchField(hotspot.id, fieldIndex, { name })}
                            />
                            <TextField
                              value={field.label}
                              onChange={(label) => patchField(hotspot.id, fieldIndex, { label })}
                            />
                            <Select
                              value={field.type}
                              options={FIELD_TYPES.map((t) => ({ value: t, label: t }))}
                              onChange={(type) => patchField(hotspot.id, fieldIndex, { type: type as FieldType })}
                            />
                            <TextField
                              value={String(field.value)}
                              onChange={(raw) => {
                                // Numeric types are stored as numbers, so the
                                // runtime's formatters (decimals, meters,
                                // units) have something to work with. A
                                // half-typed "1." stays a string until it
                                // parses, exactly as NumberField does.
                                const numeric = field.type === "integer" || field.type === "decimal" || field.type === "percentage";
                                const parsed = Number(raw);
                                patchField(hotspot.id, fieldIndex, {
                                  value: numeric && raw.trim() !== "" && Number.isFinite(parsed) ? parsed : raw,
                                });
                              }}
                            />
                            <TextField
                              value={field.unit ?? ""}
                              mono
                              onChange={(unit) => patchField(hotspot.id, fieldIndex, { unit: unit || undefined })}
                            />
                            <Select
                              value={field.tone ?? ""}
                              options={TONES.map((t) => ({ value: t, label: t || "auto" }))}
                              onChange={(tone) =>
                                patchField(hotspot.id, fieldIndex, { tone: (tone || undefined) as Tone | undefined })
                              }
                            />
                            <span className="flex gap-0.5">
                              <Button small tone="ghost" onClick={() => moveField(hotspot.id, fieldIndex, -1)} disabled={fieldIndex === 0}>
                                ↑
                              </Button>
                              <Button
                                small
                                tone="ghost"
                                onClick={() => moveField(hotspot.id, fieldIndex, 1)}
                                disabled={fieldIndex === hotspot.fields.length - 1}
                              >
                                ↓
                              </Button>
                              <Button small tone="ghost" onClick={() => removeField(hotspot.id, fieldIndex)}>
                                ✕
                              </Button>
                            </span>
                          </div>
                        ))}
                        <p className="pt-1 text-[10px] text-slate-500">
                          name · label · type · value · unit · tone. A blank tone is resolved from
                          the value against <code className="font-mono">site.tones</code>.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5">
        <Note>
          A resource marked <code className="font-mono">ref: &quot;hero&quot;</code> must carry the
          hero container id from step 1 — the whole H09 → H14 → H24 → H30 story is asserted equal
          against it at load. The review step lists any that disagree.
        </Note>
      </div>
    </Panel>
  );
}
