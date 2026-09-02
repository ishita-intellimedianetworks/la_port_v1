import { Suspense } from "react";
import TerminalExperienceV3 from "@/terminal-v3";

/**
 * /v3 — a clone of /v2 that is free to stop being one.
 *
 * WHY THIS IS NOT `<TerminalExperience streamVariant="v3" />`. `/` and `/v2`
 * are the same component tree told apart by one prop, which is exactly right
 * for them: they exist to be a fair comparison of two BAKES, so sharing every
 * line of rendering code is the guarantee that nothing else drifted. `/v3` is
 * for the opposite job — changing the rendering itself — and a prop cannot
 * express that, because the moment the tree branches on it the frozen route is
 * one bad `if` away from breaking.
 *
 * So this route imports `@/terminal-v3`, a full fork of `@/terminal` that was
 * byte-identical when it was made. Edit anything under `src/terminal-v3/`
 * freely; `/` and `/v2` cannot see it. What the two forks still share is the
 * layer below the scene — `@/shared`, `@/streaming`, `@/config`, and one
 * `site.json` — so cameras, hotspots, layouts and the map stay in step, and a
 * change THERE does reach all three routes.
 *
 * The bake follows the same rule: variant `v3` resolves to `site.json >
 * streamV3` if that block is ever authored, and otherwise to whatever `/v2`
 * resolved to. Today nothing is authored, so this streams the v2 bake — the
 * instanced, animated-water set — and the two routes should look identical.
 * Point `NEXT_PUBLIC_STREAM_BASE_V3` at a different prefix, or author
 * `streamV3`, to break that tie deliberately.
 */
export default function V3() {
  return (
    <Suspense fallback={null}>
      <TerminalExperienceV3 streamVariant="v3" />
    </Suspense>
  );
}
