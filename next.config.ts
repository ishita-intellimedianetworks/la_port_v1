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
};

export default nextConfig;
