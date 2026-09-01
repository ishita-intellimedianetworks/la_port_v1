"use client";

/**
 * Step 3 — import poses from a GLB.
 *
 * This is the step that replaces the tool the site's cameras were actually
 * built with: open `/extract-pos`, upload `la-port-zone-c5-cp-v3.glb`, copy a
 * `cp_NNN` block out of a `<pre>`, paste it into `site.json`, and remember that
 * the tool prints XYZ while `cameras.*` stores YXZ. Every `_note` in the
 * cameras block is a record of someone doing that by hand and leaving a warning
 * for the next person.
 *
 * Here the same file is read, every node listed with its WORLD transform, and
 * each row given a destination. The two conversions that used to be manual —
 * the world-matrix pass and the euler order — are handled by `extract.ts` and
 * `mutations.ts` respectively, so neither is a thing anybody has to remember.
 *
 * BULK MAPPING is the common case: a cp file holds ten cameras that belong to
 * L01–L10 in order. `sortByTrailingNumber` is what makes that trustworthy —
 * glTF preserves authoring order, so a plain listing puts `cp_010` second and
 * silently mis-assigns eight cameras.
 */

import { useMemo, useRef, useState } from "react";
import type { Vec3 } from "@/config/schema";
import { useDraftStore } from "../draft-store";
import { extractNodes, sortByTrailingNumber, type ExtractedNode } from "../extract";
import { addHotspot, addLayout, setHotspotCamera, setLayoutCamera } from "../mutations";
import { Button, Empty, Group, Note, Panel, Row, Select, TextField } from "../ui";

/** What one extracted node becomes. The destination is per row, because a
 *  single file routinely carries both the camera helpers and the marker
 *  dummies. */
type Destination =
  | { kind: "skip" }
  | { kind: "layoutCamera"; layoutId: string }
  | { kind: "layoutPosition"; layoutId: string }
  | { kind: "hotspotCamera"; hotspotId: string }
  | { kind: "hotspotPosition"; hotspotId: string }
  | { kind: "newLayout" }
  | { kind: "newHotspot"; layoutId: string };

function encode(destination: Destination): string {
  switch (destination.kind) {
    case "skip":
      return "skip";
    case "newLayout":
      return "new-layout";
    case "newHotspot":
      return `new-hotspot:${destination.layoutId}`;
    case "layoutCamera":
      return `layout-camera:${destination.layoutId}`;
    case "layoutPosition":
      return `layout-position:${destination.layoutId}`;
    case "hotspotCamera":
      return `hotspot-camera:${destination.hotspotId}`;
    case "hotspotPosition":
      return `hotspot-position:${destination.hotspotId}`;
  }
}

function decode(value: string): Destination {
  const [kind, id] = value.split(":");
  switch (kind) {
    case "new-layout":
      return { kind: "newLayout" };
    case "new-hotspot":
      return { kind: "newHotspot", layoutId: id };
    case "layout-camera":
      return { kind: "layoutCamera", layoutId: id };
    case "layout-position":
      return { kind: "layoutPosition", layoutId: id };
    case "hotspot-camera":
      return { kind: "hotspotCamera", hotspotId: id };
    case "hotspot-position":
      return { kind: "hotspotPosition", hotspotId: id };
    default:
      return { kind: "skip" };
  }
}

export function ImportStep() {
  const draft = useDraftStore((s) => s.draft);
  const update = useDraftStore((s) => s.update);

  const [nodes, setNodes] = useState<ExtractedNode[]>([]);
  const [fileName, setFileName] = useState("");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [routes, setRoutes] = useState<Record<string, Destination>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  /** Nodes worth showing: cameras and groups by default, filtered by name.
   *  A terminal GLB has tens of thousands of meshes and listing them all would
   *  make the useful rows unfindable. */
  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const kept = nodes.filter((node) => {
      if (needle) return node.name.toLowerCase().includes(needle);
      return node.isCamera || node.type === "Group" || node.type === "Object3D";
    });
    return sortByTrailingNumber(kept).slice(0, 400);
  }, [nodes, filter]);

  const destinationOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [{ value: "skip", label: "— skip —" }];
    options.push({ value: "new-layout", label: "＋ New layout (camera)" });
    for (const layout of draft.layouts) {
      options.push({ value: encode({ kind: "layoutCamera", layoutId: layout.id }), label: `${layout.id} · camera` });
      options.push({ value: encode({ kind: "layoutPosition", layoutId: layout.id }), label: `${layout.id} · marker position` });
      options.push({ value: encode({ kind: "newHotspot", layoutId: layout.id }), label: `${layout.id} · ＋ new resource` });
    }
    for (const hotspot of draft.hotspots) {
      options.push({ value: encode({ kind: "hotspotPosition", hotspotId: hotspot.id }), label: `${hotspot.id} · position` });
      options.push({ value: encode({ kind: "hotspotCamera", hotspotId: hotspot.id }), label: `${hotspot.id} · camera` });
    }
    return options;
  }, [draft.layouts, draft.hotspots]);

  const load = async (file: File) => {
    setBusy(true);
    setStatus(`Reading ${file.name}…`);
    try {
      const extracted = await extractNodes(file);
      setNodes(extracted);
      setFileName(file.name);
      setRoutes({});
      const cameras = extracted.filter((n) => n.isCamera).length;
      setStatus(`${extracted.length} nodes, ${cameras} of them cameras.`);
    } catch (error) {
      setStatus(`Failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  /** Route every visible camera row onto L01, L02, … in the order their names
   *  number them. The whole point of the step. */
  const autoMapCameras = () => {
    const cameras = rows.filter((node) => node.isCamera);
    const next: Record<string, Destination> = { ...routes };
    draft.layouts.forEach((layout, index) => {
      const node = cameras[index];
      if (node) next[node.name] = { kind: "layoutCamera", layoutId: layout.id };
    });
    setRoutes(next);
    setStatus(
      `Mapped ${Math.min(cameras.length, draft.layouts.length)} cameras onto layouts in name order. ` +
        `Check the pairings before applying.`,
    );
  };

  const applied = Object.values(routes).filter((d) => d.kind !== "skip").length;

  /**
   * Write every routed row into the draft.
   *
   * Order matters: rows creating new rows run FIRST, so a file that adds a
   * layout and then files resources under it works in one pass. Within that,
   * each write goes through the mutation helpers rather than touching the
   * draft directly, so the XYZ convention is applied in exactly one place.
   */
  const apply = () => {
    const entries = rows
      .map((node) => ({ node, destination: routes[node.name] ?? { kind: "skip" as const } }))
      .filter((entry) => entry.destination.kind !== "skip");

    let created = 0;
    for (const { node, destination } of entries) {
      switch (destination.kind) {
        case "newLayout": {
          addLayout({
            name: node.name,
            camera: { position: node.position, rotation: node.rotation },
          });
          created += 1;
          break;
        }
        case "newHotspot": {
          addHotspot(destination.layoutId, {
            name: node.name,
            popupTitle: node.name,
            position: node.position,
            rotation: node.rotation,
          });
          created += 1;
          break;
        }
        case "layoutCamera":
          setLayoutCamera(destination.layoutId, { position: node.position, rotation: node.rotation });
          break;
        case "layoutPosition":
          update((d) => {
            const layout = d.layouts.find((l) => l.id === destination.layoutId);
            if (layout) layout.position = node.position as Vec3;
          });
          break;
        case "hotspotCamera":
          setHotspotCamera(destination.hotspotId, { position: node.position, rotation: node.rotation });
          break;
        case "hotspotPosition":
          update((d) => {
            const hotspot = d.hotspots.find((h) => h.id === destination.hotspotId);
            if (hotspot) {
              hotspot.position = node.position as Vec3;
              hotspot.rotation = node.rotation as Vec3;
            }
          });
          break;
        default:
          break;
      }
    }

    setRoutes({});
    setStatus(`Applied ${entries.length} nodes${created ? ` (${created} new rows)` : ""}.`);
  };

  return (
    <Panel
      title="3 · Import poses"
      description="Read a cp / hotspot GLB and route its nodes onto layouts and resources. World transforms, XYZ eulers — the same convention /extract-pos prints."
      actions={
        <>
          <Button onClick={() => fileInput.current?.click()} disabled={busy}>
            {busy ? "Reading…" : "Open GLB…"}
          </Button>
          <Button tone="primary" onClick={apply} disabled={!applied}>
            Apply {applied || ""}
          </Button>
        </>
      }
    >
      <input
        ref={fileInput}
        type="file"
        accept=".glb,.gltf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void load(file);
          e.target.value = "";
        }}
      />

      {!nodes.length ? (
        <>
          <Note>
            Nodes are read with a full world-matrix pass first. glTF cameras are usually parented
            under rigs, and reading a parented node&apos;s local transform reports a position it is
            not at — the one mistake that makes an imported camera look almost right.
          </Note>
          <div className="mt-4">
            <Empty>No file open. Use “Open GLB…” — the cp file, not the terminal model.</Empty>
          </div>
        </>
      ) : (
        <>
          <Group
            title={`${fileName} — ${nodes.length} nodes`}
            right={
              <Button small onClick={autoMapCameras}>
                Auto-map cameras → layouts
              </Button>
            }
          >
            <Row label="Filter" hint="blank shows cameras and groups only">
              <TextField value={filter} onChange={setFilter} placeholder="cp_" mono />
            </Row>
            <p className="text-xs text-slate-400">{status}</p>
          </Group>

          <div className="overflow-hidden rounded border border-white/10">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/5 text-[10px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-3 py-2">Node</th>
                  <th className="px-3 py-2">Position</th>
                  <th className="px-3 py-2">Rotation (XYZ°)</th>
                  <th className="px-3 py-2 w-56">Destination</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((node) => {
                  const destination = routes[node.name] ?? { kind: "skip" as const };
                  return (
                    <tr key={`${node.name}-${node.position.join()}`} className="border-t border-white/5">
                      <td className="px-3 py-1.5">
                        <span className="font-mono text-slate-200">{node.name}</span>
                        <span className="ml-2 text-[10px] text-slate-500">{node.type}</span>
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[11px] text-slate-400">
                        {node.position.map((n) => n.toFixed(1)).join(", ")}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[11px] text-slate-400">
                        {node.rotation.map((n) => ((n * 180) / Math.PI).toFixed(1)).join(", ")}
                      </td>
                      <td className="px-2 py-1">
                        <Select
                          value={encode(destination)}
                          options={destinationOptions}
                          onChange={(value) =>
                            setRoutes((current) => ({ ...current, [node.name]: decode(value) }))
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {rows.length === 400 && (
            <p className="mt-2 text-[11px] text-slate-500">
              Showing the first 400 matches — narrow the filter to see the rest.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}
