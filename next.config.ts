import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

function lanOrigins(): string[] {
  const out = new Set<string>();
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
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
  allowedDevOrigins: lanOrigins(),

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "s3.dualstack.us-east-1.amazonaws.com",
        pathname: "/holotwin.mixie.co/**",
      },
    ],
  },

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
