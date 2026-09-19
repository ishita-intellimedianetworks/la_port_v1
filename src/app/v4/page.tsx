import { Suspense } from "react";
import TerminalExperienceV4 from "@/terminal-v4";

/**
 * /v4 — a clone of /v3 that is free to stop being one.
 *
 * Made the way /v3 was: a byte-identical copy of the tree above it, forked so
 * it can diverge. This route imports `@/terminal-v4`, a full fork, so its
 * rendering can change without touching `/v3`'s — and it reads
 * `config/sites/v4.json`, its own complete document, so its cameras, sky and
 * streaming numbers are its own too. Still shared, as CODE: `@/shared`,
 * `@/streaming` and `@/config`.
 */
export default function V4() {
  return (
    <Suspense fallback={null}>
      <TerminalExperienceV4 site="v4" />
    </Suspense>
  );
}
