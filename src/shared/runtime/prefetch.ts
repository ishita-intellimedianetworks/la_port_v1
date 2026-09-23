const inFlight = new Set<string>();
const done     = new Set<string>();
const queue: string[] = [];
/** Enough to keep the pipe busy behind a queue of small files, few enough that
 *  `priority: "low"` still means what it says next to the streamer's own
 *  fetches. One at a time could not drain a view's worth of rungs in the time
 *  the dollhouse is up. */
const MAX_PARALLEL = 4;
let active = 0;

async function pump(): Promise<void> {
  if (active >= MAX_PARALLEL) return;
  active++;
  try {
    while (queue.length) {
      const url = queue.shift()!;
      if (!url || done.has(url) || inFlight.has(url)) continue;
      inFlight.add(url);
      try {
        await fetch(url, { priority: "low", cache: "force-cache" } as RequestInit);
        done.add(url);
      } catch {
      } finally {
        inFlight.delete(url);
      }
    }
  } finally {
    active--;
  }
}

export function prefetchUrls(urls: (string | undefined | null)[]): void {
  for (const url of urls) {
    if (!url) continue;
    if (done.has(url) || inFlight.has(url)) continue;
    if (queue.includes(url)) continue;
    queue.push(url);
  }
  for (let i = 0; i < MAX_PARALLEL; i++) void pump();
}

/** Reset the prefetch tracker — useful in tests / hot-reload. */
export function _resetPrefetch(): void {
  inFlight.clear();
  done.clear();
  queue.length = 0;
  active = 0;
}
