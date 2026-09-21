const inFlight = new Set<string>();
const done     = new Set<string>();
const queue: string[] = [];
let pumping = false;

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
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
  pumping = false;
}

export function prefetchUrls(urls: (string | undefined | null)[]): void {
  for (const url of urls) {
    if (!url) continue;
    if (done.has(url) || inFlight.has(url)) continue;
    if (queue.includes(url)) continue;
    queue.push(url);
  }
  void pump();
}

/** Reset the prefetch tracker — useful in tests / hot-reload. */
export function _resetPrefetch(): void {
  inFlight.clear();
  done.clear();
  queue.length = 0;
  pumping = false;
}
