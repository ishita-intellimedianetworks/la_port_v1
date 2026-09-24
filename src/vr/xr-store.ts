"use client";

import { createXRStore, type XRStore } from "@react-three/xr";

const RAY = { maxLength: 400, opacity: 0.7, size: 0.008 } as const;

const holder = globalThis as typeof globalThis & {
  __laPortXrStore?: XRStore;
  __laPortXrSession?: XRSession | null;
  __laPortXrTracked?: boolean;
};

export const xrStore: XRStore = (holder.__laPortXrStore ??= createXRStore({
  offerSession: false,
  foveation: 1,
  controller: { grabPointer: false, rayPointer: { rayModel: RAY } },
  hand: { grabPointer: false, touchPointer: false, rayPointer: { rayModel: RAY } },
}));

function trackSessions() {
  const xr = typeof navigator !== "undefined" ? navigator.xr : undefined;
  if (!xr || holder.__laPortXrTracked) return;
  holder.__laPortXrTracked = true;
  const request = xr.requestSession.bind(xr);
  xr.requestSession = async (mode, init) => {
    const session = await request(mode, init);
    holder.__laPortXrSession = session;
    session.addEventListener("end", () => {
      if (holder.__laPortXrSession === session) holder.__laPortXrSession = null;
    });
    return session;
  };
}

function liveSession(): XRSession | null {
  return xrStore.getState().session ?? holder.__laPortXrSession ?? null;
}

let pending: Promise<void> | null = null;

export function enterVr(): Promise<void> {
  if (xrStore.getState().session) return Promise.resolve();
  if (pending) return pending;
  trackSessions();
  pending = (async () => {
    const stranded = liveSession();
    if (stranded) await stranded.end().catch(() => {});
    try {
      await xrStore.enterVR();
    } catch (error) {
      const half = liveSession();
      if (half) await half.end().catch(() => {});
      throw error;
    }
  })().finally(() => {
    pending = null;
  });
  return pending;
}

export function exitVr() {
  liveSession()?.end().catch(() => {});
}
