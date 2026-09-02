"use client";

/**
 * The checks `config/index.ts` runs at load, run here instead — before the file
 * is written rather than after it is opened.
 *
 * They are the same checks deliberately, and in the same order: primary-key
 * format, primary-key uniqueness, foreign-key integrity, and the demo's one
 * cross-row invariant. The runtime prints them to a console nobody is watching
 * at 2 a.m.; a studio that lets you save a file it already knows is broken has
 * failed at the only thing it is for.
 *
 * A few extras exist here that the runtime cannot usefully raise — an
 * unauthored `[0,0,0]` pose, a layout with no resources — because they are
 * warnings about work that is not finished, not errors about a file that is
 * wrong. The two are separated by `level` and the review step ships on
 * warnings but not on errors.
 */

import type { SiteConfig } from "@/config/schema";
import { isPlaceholder } from "./pose";

export type Problem = {
  level: "error" | "warning";
  /** Where in the studio to go to fix it — the step id. */
  step: string;
  message: string;
};

/** The id shapes the runtime asserts. Widening these is a RUNTIME change (see
 *  `config/index.ts`), so the studio reports rather than silently permits. */
const LAYOUT_ID = /^L(0[1-9]|10)$/;
const HOTSPOT_ID = /^H(0[1-9]|[12]\d|30)$/;

export function validate(draft: SiteConfig): Problem[] {
  const problems: Problem[] = [];
  const error = (step: string, message: string) => problems.push({ level: "error", step, message });
  const warn = (step: string, message: string) => problems.push({ level: "warning", step, message });

  // ── Layouts ────────────────────────────────────────────────────────────────
  const layoutIds = new Set<string>();
  for (const layout of draft.layouts) {
    if (layoutIds.has(layout.id)) error("resources", `Duplicate layout id "${layout.id}".`);
    layoutIds.add(layout.id);

    if (!LAYOUT_ID.test(layout.id)) {
      warn(
        "resources",
        `Layout id "${layout.id}" is outside L01–L10, which config/index.ts asserts at load. ` +
          `The app still runs and prints the complaint to the console.`,
      );
    }
    if (!layout.name.trim()) warn("resources", `Layout ${layout.id} has no name.`);
    if (!draft.zones[layout.zone]) {
      error("resources", `Layout ${layout.id} is in zone "${layout.zone}", which is not defined.`);
    }
    if (isPlaceholder(layout.camera.position)) {
      warn("resources", `Layout ${layout.id} has no camera yet — travelling to it lands on the start pose.`);
    }
    if (layout.walkable && isPlaceholder(layout.position)) {
      warn("resources", `Layout ${layout.id} is walkable but has no position.`);
    }
    if (!draft.hotspots.some((h) => h.layoutId === layout.id)) {
      warn("hotspots", `Layout ${layout.id} has no resources filed under it.`);
    }
  }

  if (!draft.layouts.length) error("resources", "There are no layouts.");

  // ── The site record's one foreign key ──────────────────────────────────────
  if (!layoutIds.has(draft.startLayoutId)) {
    error(
      "scene",
      `startLayoutId "${draft.startLayoutId}" names no layout — the experience has nowhere to open on.`,
    );
  }

  // ── Hotspots ───────────────────────────────────────────────────────────────
  const hotspotIds = new Set<string>();
  for (const hotspot of draft.hotspots) {
    if (hotspotIds.has(hotspot.id)) error("hotspots", `Duplicate hotspot id "${hotspot.id}".`);
    hotspotIds.add(hotspot.id);

    if (!HOTSPOT_ID.test(hotspot.id)) {
      warn(
        "hotspots",
        `Hotspot id "${hotspot.id}" is outside H01–H30, which config/index.ts asserts at load.`,
      );
    }
    if (!layoutIds.has(hotspot.layoutId)) {
      error("hotspots", `Hotspot ${hotspot.id} names unknown layout "${hotspot.layoutId}".`);
    }
    if (!hotspot.popupTitle.trim()) {
      warn("hotspots", `Hotspot ${hotspot.id} has no popup title — its card opens unheaded.`);
    }
    if (isPlaceholder(hotspot.position)) {
      warn("hotspots", `Hotspot ${hotspot.id} sits at the origin, so its marker is suppressed.`);
    }

    // The demo's one cross-row invariant: every mention of the hero container
    // is the same container, so the H09 → H14 → H24 → H30 story cannot fork.
    for (const field of hotspot.fields) {
      if (field.ref === "hero" && field.value !== draft.globals.heroContainerId) {
        error(
          "hotspots",
          `Hotspot ${hotspot.id} field "${field.name}" is marked hero but reads "${field.value}" ` +
            `(expected "${draft.globals.heroContainerId}").`,
        );
      }
    }

    // Journeys are foreign keys too, and a dangling step is a dead end in the
    // one narrative the demo is built around.
    for (const step of hotspot.journey ?? []) {
      if (!layoutIds.has(step.layoutId)) {
        error("hotspots", `Hotspot ${hotspot.id} journey step "${step.stage}" names unknown layout "${step.layoutId}".`);
      }
      if (!hotspotIds.has(step.hotspotId) && !draft.hotspots.some((h) => h.id === step.hotspotId)) {
        error("hotspots", `Hotspot ${hotspot.id} journey step "${step.stage}" names unknown hotspot "${step.hotspotId}".`);
      }
    }
  }

  // ── Scene record ───────────────────────────────────────────────────────────
  if (!draft.assets.modelUrl) warn("scene", "No model URL is set.");
  if (draft.world.fov <= 0 || draft.world.fov >= 180) {
    error("scene", `Field of view ${draft.world.fov}° is not a usable angle.`);
  }
  for (const id of ["dollhouse", "spawn", "firstPerson"] as const) {
    const pose = draft.cameras[id];
    if (pose && isPlaceholder(pose.position) && id !== "firstPerson") {
      warn("cameras", `cameras.${id} is still at the origin.`);
    }
  }

  return problems;
}

/** The JSON that goes to disk. Two-space indent and a trailing newline, so a
 *  save produces the smallest possible git diff against the shipped file. */
export function serialise(draft: SiteConfig): string {
  return `${JSON.stringify(draft, null, 2)}\n`;
}
