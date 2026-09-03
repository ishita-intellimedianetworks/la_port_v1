import { Suspense } from "react";
import TerminalExperienceV3 from "@/terminal-v3";

/**
 * /v3 — a clone of /v2 that is free to stop being one.
 *
 * `/` and `/v2` share one component tree and differ by a prop, because they
 * exist to compare two bakes. This route imports `@/terminal-v3`, a full fork,
 * so its rendering can change without touching theirs — and it reads
 * `config/sites/v3.json`, its own complete document, so its cameras, sky and
 * streaming numbers are its own too. Still shared, as CODE: `@/shared`,
 * `@/streaming` and `@/config`.
 */
export default function V3() {
  return (
    <Suspense fallback={null}>
      <TerminalExperienceV3 site="v3" />
    </Suspense>
  );
}
