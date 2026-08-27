import { Suspense } from "react";
import TerminalExperience from "@/terminal";

/**
 * /v2 — the same terminal, streaming the SECOND bake.
 *
 * `/` is deliberately frozen: it streams `site.json > stream` (the object-chunked
 * v5-obj set) with `render` authored to reproduce exactly what the engine did
 * before the streaming work existed. This route streams `streamV2` merged over
 * it — the instanced, animated-water bake — with the transmission pass gated
 * off, progressive textures on, and the pixel-ratio governor running.
 *
 * Everything else is shared: one `site.json`, one set of cameras, hotspots,
 * layouts and map, one component tree. The ONLY thing this file does is pass a
 * variant id, which is what makes the two routes a fair comparison rather than
 * two builds that drifted apart.
 *
 * Both variants resolve at import, so opening the two in adjacent tabs streams
 * two different manifests from two different prefixes in the same browser.
 */
export default function V2() {
  return (
    <Suspense fallback={null}>
      <TerminalExperience streamVariant="v2" />
    </Suspense>
  );
}
