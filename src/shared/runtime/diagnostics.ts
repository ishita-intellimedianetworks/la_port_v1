/**
 * Dev-only render / store-write counters.
 *
 * A frozen page is almost always one of two things: a render storm (something
 * re-rendering thousands of times a second) or a blocked main thread. These
 * counters tell the two apart — they print once a second to the console, which
 * `next dev` mirrors into .next/dev/logs, so the answer is readable without a
 * debugger attached.
 *
 * Enabled by `?diag=true`. Compiled out of production by the NODE_ENV check.
 */

const counts = new Map<string, number>();
let started = false;

const enabled = () =>
  process.env.NODE_ENV !== "production" &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("diag") === "true";

function start() {
  if (started || !enabled()) return;
  started = true;
  setInterval(() => {
    if (counts.size === 0) return;
    const line = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}=${v}`)
      .join("  ");
    counts.clear();
    console.log("[diag/sec]", line);
  }, 1000);
}

/** Count one occurrence of `label` in the current second. */
export function tick(label: string) {
  if (!enabled()) return;
  start();
  counts.set(label, (counts.get(label) ?? 0) + 1);
}
