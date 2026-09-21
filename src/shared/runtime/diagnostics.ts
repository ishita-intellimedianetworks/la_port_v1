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
