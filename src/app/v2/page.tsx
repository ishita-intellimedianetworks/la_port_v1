import { Suspense } from "react";
import TerminalExperience from "@/terminal";

/**
 * /v2 — the same terminal component tree, running the SECOND model.
 *
 * `/` is deliberately frozen: it runs `config/sites/v1.json` (the object-chunked
 * v5-obj bake) with `render` authored to reproduce exactly what the engine did
 * before the streaming work existed. This route runs `config/sites/v2.json` —
 * the instanced, animated-water bake — with the transmission pass gated off,
 * progressive textures on, and the pixel-ratio governor running.
 *
 * The two documents are COMPLETE and independent: v2.json carries its own
 * cameras, hotspots, layouts and map, and started as a copy of v1's, so the
 * routes still compare like for like — but retuning one can no longer move the
 * other. What is shared is the component tree, and the ONLY thing this file
 * does is name the model.
 *
 * Both resolve at import, so opening the two in adjacent tabs streams two
 * different manifests from two different prefixes in the same browser.
 */
export default function V2() {
  return (
    <Suspense fallback={null}>
      <TerminalExperience site="v2" />
    </Suspense>
  );
}
