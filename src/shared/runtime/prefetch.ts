/**
 * Low-priority byte-level prefetch — primes the browser HTTP cache so a
 * subsequent `useGLTF(url)` parses from cache instead of network.
 *
 *   - Same idea as the interior `prefetchBytes` in `terminal/index.tsx`.
 *   - Uses `fetch(url, { priority: "low" })` so the request doesn't compete
 *     with the foreground download (the model the user is actually looking at).
 *   - We do NOT call `useGLTF.preload` — that would parse the GLB and allocate
 *     GPU resources before they're needed, defeating the point of staggered
 *     download.
 *   - Sequential queue: fires one URL at a time. Mirrors "mount one at a time
 *     just like interior" — we never have more than one prefetch in flight,
 *     so a slow connection can't get DoS'd by a long apartment list.
 */

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
      // priority hint is non-standard but supported in Chromium; harmless
      // elsewhere. cache: "force-cache" lets the browser reuse a previously
      // fetched copy if one exists.
      await fetch(url, { priority: "low", cache: "force-cache" } as RequestInit);
      done.add(url);
    } catch {
      // Non-fatal — when the actual GLB load happens it'll retry on its own.
    } finally {
      inFlight.delete(url);
    }
  }
  pumping = false;
}

/**
 * Enqueue one or more URLs for sequential, low-priority byte prefetch.
 * Already-fetched / in-flight URLs are skipped silently.
 */
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
