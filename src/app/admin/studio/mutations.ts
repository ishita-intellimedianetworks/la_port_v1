"use client";

/**
 * Every write the studio makes to the draft, in one place.
 *
 * The panels and the viewport are two front ends onto the same edits — a
 * hotspot's position can be typed into a number field, dragged with the
 * transform gizmo, clicked onto the model in place mode, or imported from a
 * GLB node. Four call sites, one behaviour, so the rule that a scene camera
 * stores YXZ while a layout camera stores XYZ is written down once here rather
 * than four times where it can be got right three times.
 *
 * Every function goes through `update()`, which clones, so none of them may
 * hold onto the object it was handed.
 */

import type {
  HotspotConfig,
  LayoutCamera,
  LayoutRow,
  SiteConfig,
  Vec3,
  ZoneKey,
} from "@/config/schema";
import { useDraftStore } from "./draft-store";
import { roundVec } from "./pose";
import type { Selection } from "./viewer-store";

type Update = (recipe: (draft: SiteConfig) => void, opts?: { history?: boolean }) => void;

const update: Update = (recipe, opts) => useDraftStore.getState().update(recipe, opts);

// ── Writing a position ────────────────────────────────────────────────────────

/**
 * Move whatever is selected to `position`.
 *
 * `history: false` is the drag case — one gesture, one undo step. The gizmo
 * calls this on every pointer move and once more on release WITH history, so
 * undo lands the user back where the drag started rather than one frame into
 * it.
 */
export function moveSelection(selection: Selection, position: Vec3, history = true) {
  const p = roundVec(position);
  update((draft) => {
    if (selection.kind === "sceneCamera") {
      const pose = draft.cameras[selection.id];
      if (pose) pose.position = p;
      return;
    }
    if (selection.kind === "layout") {
      const layout = draft.layouts.find((l) => l.id === selection.id);
      if (!layout) return;
      if (selection.part === "camera") layout.camera.position = p;
      else layout.position = p;
      return;
    }
    if (selection.kind === "hotspot") {
      const hotspot = draft.hotspots.find((h) => h.id === selection.id);
      if (!hotspot) return;
      if (selection.part === "camera") {
        // A hotspot with no camera of its own is viewed from its layout's.
        // Dragging its camera handle is the act of GIVING it one, so create it
        // here rather than silently doing nothing.
        hotspot.camera = { ...(hotspot.camera ?? { position: p }), position: p };
      } else {
        hotspot.position = p;
      }
    }
  }, { history });
}

// ── Writing a pose ────────────────────────────────────────────────────────────

/**
 * Write a captured viewpoint into the selection.
 *
 * TWO EULER ORDERS, and this is the only place that has to know which is
 * which: `cameras.*` is applied to the camera verbatim as YXZ, while a layout
 * or hotspot camera goes through `poseForCamera`, which reorders XYZ → YXZ.
 * The caller therefore hands over BOTH readings of the same orientation and
 * this picks; asking the caller to pick is how the two ends up transposed.
 *
 * An authored `target` is DROPPED when a rotation is written, because the two
 * forms are exclusive — `poseForCamera` takes `rotation` first, so leaving a
 * stale target behind would leave a value in the file that no longer describes
 * anything.
 */
export function captureSelection(
  selection: Selection,
  reading: { position: Vec3; yxz: Vec3; xyz: Vec3 },
) {
  update((draft) => {
    if (selection.kind === "sceneCamera") {
      const pose = draft.cameras[selection.id];
      if (!pose) return;
      pose.position = reading.position;
      pose.rotation = reading.yxz;
      return;
    }
    if (selection.kind === "layout") {
      const layout = draft.layouts.find((l) => l.id === selection.id);
      if (!layout) return;
      if (selection.part === "camera") {
        layout.camera = { position: reading.position, rotation: reading.xyz };
      } else {
        layout.position = reading.position;
      }
      return;
    }
    if (selection.kind === "hotspot") {
      const hotspot = draft.hotspots.find((h) => h.id === selection.id);
      if (!hotspot) return;
      if (selection.part === "camera") {
        hotspot.camera = { position: reading.position, rotation: reading.xyz };
      } else {
        hotspot.position = reading.position;
      }
    }
  });
}

/** Write a camera onto one layout by id, whatever is selected. */
export function setLayoutCamera(layoutId: string, camera: LayoutCamera) {
  update((draft) => {
    const layout = draft.layouts.find((l) => l.id === layoutId);
    if (layout) layout.camera = camera;
  });
}

/** Write a camera onto one hotspot by id. `null` removes it, which is how a
 *  hotspot goes back to being viewed from its layout's camera. */
export function setHotspotCamera(hotspotId: string, camera: LayoutCamera | null) {
  update((draft) => {
    const hotspot = draft.hotspots.find((h) => h.id === hotspotId);
    if (!hotspot) return;
    if (camera) hotspot.camera = camera;
    else delete hotspot.camera;
  });
}

// ── Layouts ───────────────────────────────────────────────────────────────────

/**
 * The next free layout id.
 *
 * `config/index.ts` asserts every layout id matches `/^L(0[1-9]|10)$/` in dev,
 * so ids above L10 are REPORTED but not rejected — the app still runs and the
 * console says why. Widening that regex is a runtime change and this branch
 * deliberately does not make one; the review step surfaces the same warning so
 * nobody discovers it from a console they were not watching.
 */
export function nextLayoutId(draft: SiteConfig): string {
  const used = new Set(draft.layouts.map((l) => l.id));
  for (let n = 1; n < 100; n += 1) {
    const id = `L${String(n).padStart(2, "0")}`;
    if (!used.has(id)) return id;
  }
  return `L${draft.layouts.length + 1}`;
}

export function nextHotspotId(draft: SiteConfig): string {
  const used = new Set(draft.hotspots.map((h) => h.id));
  for (let n = 1; n < 100; n += 1) {
    const id = `H${String(n).padStart(2, "0")}`;
    if (!used.has(id)) return id;
  }
  return `H${draft.hotspots.length + 1}`;
}

export function addLayout(seed?: Partial<LayoutRow>): string {
  let created = "";
  update((draft) => {
    const id = seed?.id ?? nextLayoutId(draft);
    created = id;
    draft.layouts.push({
      id,
      name: seed?.name ?? `Layout ${id}`,
      zone: seed?.zone ?? (Object.keys(draft.zones)[0] as ZoneKey),
      description: seed?.description ?? "",
      position: seed?.position ?? [0, 0, 0],
      camera: seed?.camera ?? { position: [0, 0, 0], rotation: [0, 0, 0] },
      // Aerial by default: every layout in this site is an overview framing,
      // and `walkable: true` on a pose that is not on the navmesh strands the
      // player. Opting IN is the safe direction.
      walkable: seed?.walkable ?? false,
      ...(seed?.exactPose !== undefined ? { exactPose: seed.exactPose } : { exactPose: true }),
    });
  });
  return created;
}

/** Delete a layout AND its hotspots — `hotspots[].layoutId` is a foreign key,
 *  and orphaning children is the one edit the runtime validator will shout
 *  about on every page load. */
export function deleteLayout(layoutId: string) {
  update((draft) => {
    draft.layouts = draft.layouts.filter((l) => l.id !== layoutId);
    draft.hotspots = draft.hotspots.filter((h) => h.layoutId !== layoutId);
    if (draft.startLayoutId === layoutId) {
      draft.startLayoutId = draft.layouts[0]?.id ?? "";
    }
  });
}

export function patchLayout(layoutId: string, patch: Partial<LayoutRow>, history = true) {
  update((draft) => {
    const index = draft.layouts.findIndex((l) => l.id === layoutId);
    if (index < 0) return;
    draft.layouts[index] = { ...draft.layouts[index], ...patch };
  }, { history });
}

/**
 * Rename a layout, carrying every reference with it.
 *
 * An id is a primary key here, so a rename is not a field edit: `startLayoutId`
 * points at it, every hotspot's `layoutId` points at it, and so does every
 * `journey[].layoutId` step in every hotspot's story. Missing any one of them
 * leaves a dangling foreign key the app reports at load.
 */
export function renameLayout(from: string, to: string) {
  update((draft) => {
    const layout = draft.layouts.find((l) => l.id === from);
    if (!layout || draft.layouts.some((l) => l.id === to)) return;
    layout.id = to;
    if (draft.startLayoutId === from) draft.startLayoutId = to;
    for (const hotspot of draft.hotspots) {
      if (hotspot.layoutId === from) hotspot.layoutId = to;
      for (const step of hotspot.journey ?? []) {
        if (step.layoutId === from) step.layoutId = to;
      }
    }
  });
}

// ── Hotspots ──────────────────────────────────────────────────────────────────

export function addHotspot(layoutId: string, seed?: Partial<HotspotConfig>): string {
  let created = "";
  update((draft) => {
    const id = seed?.id ?? nextHotspotId(draft);
    created = id;
    draft.hotspots.push({
      id,
      layoutId,
      name: seed?.name ?? `Resource ${id}`,
      popupTitle: seed?.popupTitle ?? seed?.name ?? `Resource ${id}`,
      icon: seed?.icon ?? "kpi",
      position: seed?.position ?? [0, 0, 0],
      rotation: seed?.rotation ?? [0, 0, 0],
      fields: seed?.fields ?? [],
      ...(seed?.camera ? { camera: seed.camera } : null),
    });
  });
  return created;
}

export function deleteHotspot(hotspotId: string) {
  update((draft) => {
    draft.hotspots = draft.hotspots.filter((h) => h.id !== hotspotId);
  });
}

export function patchHotspot(hotspotId: string, patch: Partial<HotspotConfig>, history = true) {
  update((draft) => {
    const index = draft.hotspots.findIndex((h) => h.id === hotspotId);
    if (index < 0) return;
    draft.hotspots[index] = { ...draft.hotspots[index], ...patch };
  }, { history });
}

export function renameHotspot(from: string, to: string) {
  update((draft) => {
    const hotspot = draft.hotspots.find((h) => h.id === from);
    if (!hotspot || draft.hotspots.some((h) => h.id === to)) return;
    hotspot.id = to;
    // Journeys name hotspots as well as layouts — the H09 → H14 → H24 → H30
    // story is stored as those ids on each step.
    for (const other of draft.hotspots) {
      for (const step of other.journey ?? []) {
        if (step.hotspotId === from) step.hotspotId = to;
      }
    }
  });
}

// ── Ordering ──────────────────────────────────────────────────────────────────

/**
 * Put a row at `toIndex` in its table — what a drag lands as.
 *
 * ORDER IS DATA HERE. `config/index.ts` derives each layout's child list by
 * filtering `hotspots[]` IN TABLE ORDER, so the order of the hotspots array is
 * literally the order the Resources panel lists them in — there is no separate
 * sort key to set, and no way to reorder the panel other than this.
 *
 * The row is spliced OUT before it is inserted, so `toIndex` is read against
 * the array without it. `SortableList` accounts for that; a caller computing
 * an index by hand has to as well.
 */
export function reorderRow(table: "layouts" | "hotspots", id: string, toIndex: number) {
  update((draft) => {
    const rows = draft[table] as Array<{ id: string }>;
    const from = rows.findIndex((r) => r.id === id);
    if (from < 0) return;
    const [row] = rows.splice(from, 1);
    rows.splice(Math.min(rows.length, Math.max(0, toIndex)), 0, row);
  });
}

/**
 * Re-parent a hotspot, keeping it adjacent to its new siblings.
 *
 * Changing `layoutId` alone is enough for correctness — the parent list is
 * derived from that field — but it would leave the row stranded halfway up a
 * table whose order IS the display order, so the panel would show it in a
 * position nobody chose. Moving it to sit after the last existing sibling is
 * what "it joined that group" looks like.
 */
export function reparentHotspot(hotspotId: string, layoutId: string) {
  update((draft) => {
    const from = draft.hotspots.findIndex((h) => h.id === hotspotId);
    if (from < 0) return;
    const [row] = draft.hotspots.splice(from, 1);
    row.layoutId = layoutId;
    let insertAt = draft.hotspots.length;
    for (let i = draft.hotspots.length - 1; i >= 0; i -= 1) {
      if (draft.hotspots[i].layoutId === layoutId) {
        insertAt = i + 1;
        break;
      }
    }
    draft.hotspots.splice(insertAt, 0, row);
  });
}
