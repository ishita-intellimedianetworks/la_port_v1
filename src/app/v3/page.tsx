import { Suspense } from "react";
import TerminalExperienceV3 from "@/terminal-v3";

/**
 * /v3 — a clone of /v2 that is free to stop being one.
 *
 * `/` and `/v2` share one component tree and differ by a prop, because they
 * exist to compare two bakes. This route imports `@/terminal-v3`, a full fork,
 * so its rendering can change without touching theirs. Still shared: `@/shared`,
 * `@/streaming`, `@/config` and one `site.json`.
 */
export default function V3() {
  return (
    <Suspense fallback={null}>
      <TerminalExperienceV3 streamVariant="v3" />
    </Suspense>
  );
}
