"use client";

/**
 * /admin — the site studio.
 *
 * Eight steps over one viewport, authoring `src/config/site.json`: the model,
 * the three scene cameras, imported poses, the layouts table, the resources
 * table, the field of view, the whole lighting look, and a validated save.
 *
 * It replaces four separate motions that used to produce this file — framing a
 * camera in the running app and copying it out of a console log, running
 * `/extract-pos` over a cp GLB and hand-reordering its eulers, dialling the
 * `?debug=true` panel and transcribing three read-outs, and editing 3,500 lines
 * of JSON directly for everything else. Every `_note` block in `site.json` is a
 * record of somebody doing one of those carefully and leaving a warning for the
 * next person.
 *
 * The existing `/admin/bounds` is untouched and still does its own job: render
 * the model top-down and calibrate the aerial against it.
 *
 * THE CANVAS IS DYNAMIC AND CLIENT-ONLY. R3F reaches for `window` while
 * building its store, and there is nothing to server-render in a WebGL
 * viewport; loading it under `ssr: false` also keeps three, drei and the
 * loaders out of the bundle for anyone who never opens this route.
 */

import dynamic from "next/dynamic";
import { StudioShell } from "./studio/shell";

const StudioViewer = dynamic(() => import("./studio/viewer").then((m) => m.StudioViewer), {
  ssr: false,
  // The phase before the model's own loader: three, drei and the GLTF/Draco/
  // KTX2 loaders being fetched. Same shape as the overlay that follows it, so
  // the two read as one wait rather than two false starts.
  loading: () => (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-[#05070c]">
      <span className="h-9 w-9 animate-spin rounded-full border-2 border-[#4b5563] border-t-[#22c55e]" />
      <p className="text-[11px] text-slate-300">Starting the viewport…</p>
    </div>
  ),
});

export default function AdminStudioPage() {
  return (
    <main className="h-dvh w-full overflow-hidden">
      <StudioShell viewport={<StudioViewer />} />
    </main>
  );
}
