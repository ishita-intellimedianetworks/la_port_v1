"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Glasses } from "lucide-react";
import { useSite } from "@/config/context";
import { useVrBridge } from "./bridge";
import { enterVr, xrStore } from "./xr-store";

type Support = "checking" | "supported" | "unsupported";

const subscribe = (cb: () => void) => xrStore.subscribe(cb);
const presentingNow = () => xrStore.getState().session != null;
const presentingOnServer = () => false;

export function EnterVrPrompt() {
  const bridge = useVrBridge();
  const title = useSite().scene.meta.label;
  const presenting = useSyncExternalStore(subscribe, presentingNow, presentingOnServer);
  const [support, setSupport] = useState<Support>("checking");
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const xr = typeof navigator !== "undefined" ? navigator.xr : undefined;
    (xr ? xr.isSessionSupported("immersive-vr") : Promise.resolve(false))
      .then((ok) => !cancelled && setSupport(ok ? "supported" : "unsupported"))
      .catch(() => !cancelled && setSupport("unsupported"));
    return () => {
      cancelled = true;
    };
  }, []);

  if (presenting || !bridge.ready || bridge.loader.show) return null;

  const enter = () => {
    if (entering) return;
    setError(null);
    setEntering(true);
    bridge.prepare();
    enterVr()
      .catch((e: unknown) => {
        console.error("[vr] could not start the VR session", e);
        setError(e instanceof Error && e.message ? e.message : "The headset did not start a VR session.");
      })
      .finally(() => setEntering(false));
  };

  return (
    <>
      <div className="fixed inset-0 z-[20000] bg-black/80 backdrop-blur-sm" />
      <div className="fixed inset-0 z-[20001] flex items-center justify-center p-6">
        <div
          className="w-full max-w-sm overflow-hidden rounded-2xl"
          style={{
            background: "rgba(9,11,15,0.86)",
            border: "1.5px solid rgba(255,255,255,0.22)",
            boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
          }}
        >
          <div className="flex flex-col items-center gap-6 px-8 py-10 text-center text-white">
            <span
              className="flex h-16 w-16 items-center justify-center rounded-full"
              style={{ background: "rgba(0,113,227,0.18)", color: "#2997ff" }}
            >
              <Glasses size={30} strokeWidth={1.8} />
            </span>

            <div className="flex flex-col items-center gap-2">
              <span
                className="nav-body text-[11px] font-semibold uppercase tracking-[0.2em]"
                style={{ color: "#2997ff" }}
              >
                VR Experience
              </span>
              {title && <h1 className="nav-display text-2xl font-semibold leading-tight">{title}</h1>}
            </div>

            {support !== "unsupported" && (
              <button
                type="button"
                onClick={enter}
                disabled={support === "checking" || entering}
                className="nav-body w-full cursor-pointer rounded-xl py-3 text-[15px] font-bold transition-opacity disabled:cursor-default disabled:opacity-45"
                style={{ background: "#0071e3", color: "#ffffff" }}
              >
                {entering ? "Starting..." : "Enter VR"}
              </button>
            )}

            {support === "unsupported" && (
              <p className="nav-body text-sm leading-relaxed">
                Use a VR headset to view this experience. Open this page in the headset&apos;s browser.
              </p>
            )}

            {error && (
              <p className="nav-body text-sm leading-relaxed" style={{ color: "#ff5c5c" }}>
                VR did not start: {error}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
