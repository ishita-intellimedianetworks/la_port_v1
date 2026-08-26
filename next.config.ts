import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/**
 * Every LAN address this machine currently answers on.
 *
 * `next dev` refuses to serve `/_next/*` to a browser whose Host header is not
 * localhost, so opening the app on a phone over Wi-Fi blocks EVERY chunk —
 * three, r3f, gsap, the lot. The page shell still renders (it is server-side),
 * so the symptom is a loading screen frozen at 0%: the canvas never mounts, the
 * render loop never starts, and the progress bar is written from inside that
 * loop. It looks like a broken model and is actually a blocked script.
 *
 * Detected rather than hardcoded, because a DHCP lease changing would silently
 * bring the whole thing back. Add more with DEV_ORIGINS=host-a,host-b for a
 * tunnel or a hostname this cannot see (ngrok, a `.local` mDNS name).
 */
function lanOrigins(): string[] {
  const out = new Set<string>();
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      // IPv4, and not the loopback that is allowed anyway.
      if (a.family === "IPv4" && !a.internal) out.add(a.address);
    }
  }
  for (const extra of (process.env.DEV_ORIGINS ?? "").split(",")) {
    const host = extra.trim();
    if (host) out.add(host);
  }
  return [...out];
}

const nextConfig: NextConfig = {
  // Dev-only; it has no effect on `next build` / `next start`.
  allowedDevOrigins: lanOrigins(),

  /**
   * Let the browser keep the baked chunk set in DEV.
   *
   * `next start` already serves everything under `public/` as
   * `max-age=31536000, immutable` (next/dist/server/lib/router-server.js), so a
   * chunk the streamer evicts and re-mounts costs nothing in production. In DEV
   * the same files go out as `no-cache, must-revalidate`, which turns every
   * re-mount into a network round-trip — and the streamer re-mounts constantly
   * by design. That makes the dev build feel far heavier than the shipped one
   * and quietly distorts any profiling done against it.
   *
   * One hour rather than `immutable` because these files ARE replaced by a
   * re-bake in the adaptive repo and the names do not change: a stale asset
   * clears on its own within the hour, or immediately on a hard reload.
   * Next only applies this when nothing else has already set the header.
   */
  async headers() {
    if (process.env.NODE_ENV !== "development") return [];
    return [
      {
        source: "/assets/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600" }],
      },
    ];
  },
};

export default nextConfig;
