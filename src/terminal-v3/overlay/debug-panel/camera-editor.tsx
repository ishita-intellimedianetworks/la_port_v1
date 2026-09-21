"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSite } from "@/config/context";
import { useCameraStore } from "@/shared/stores/camera-store";
import { useNavUiStore } from "../../stores/nav-ui-store";
import { useDebugStore } from "../../stores/debug-store";
import { NAV_GLASS_PANEL } from "../glass-theme";
import {
  buildCameraPatch,
  cameraTargetFor,
  formatCameraPatch,
  saveCamera,
  type CameraPatch,
} from "./camera-json";

/** Matches the debug panel's own readback cadence — fast enough to read as
 *  live while walking, slow enough not to re-render on every frame. */
const POLL_MS = 120;

/** How long a finished save stays on screen before the card goes back to its
 *  buttons. Long enough to read, short enough not to be in the way. */
const DONE_MS = 4000;

type Stage = "idle" | "confirm" | "saving" | "done" | "error";

const fmt = (n: number) => n.toFixed(4);

export function DebugCameraEditor() {
  const site = useSite();
  const selectedHotspotId = useNavUiStore((s) => s.selectedHotspotId);
  const currentDestId = useNavUiStore((s) => s.currentDest?.id ?? null);
  const cameraEdit = useDebugStore((s) => s.cameraEdit);
  const setCameraEdit = useDebugStore((s) => s.setCameraEdit);
  const setPanelCollapsed = useDebugStore((s) => s.setPanelCollapsed);

  const [patch, setPatch] = useState<CameraPatch | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const target = useMemo(
    () => cameraTargetFor(site, selectedHotspotId, currentDestId),
    [site, selectedHotspotId, currentDestId],
  );
  const targetKey = target ? `${target.kind}:${target.id}` : null;

  const [prevKey, setPrevKey] = useState(targetKey);
  if (targetKey !== prevKey) {
    setPrevKey(targetKey);
    setStage("idle");
    setMessage("");
    setCopied(false);
  }

  const held = stage === "confirm" || stage === "saving";
  const heldRef = useRef(held);
  useEffect(() => {
    heldRef.current = held;
  }, [held]);

  useEffect(() => {
    const read = () => {
      if (heldRef.current) return;
      const camera = useCameraStore.getState().camera;
      if (camera) setPatch(buildCameraPatch(camera));
    };
    read();
    const id = window.setInterval(read, POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  const copy = useCallback(() => {
    if (!patch) return;
    const text = formatCameraPatch(patch, target);
    console.log("[debug] camera\n" + text);
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [patch, target]);

  const confirmSave = useCallback(async () => {
    if (!target || !patch) return;
    setStage("saving");
    const result = await saveCamera(site.id, target, patch);
    if (result.ok) {
      setStage("done");
      setMessage(`${result.created ? "Added" : "Updated"} ${result.path}`);
      window.setTimeout(() => setStage("idle"), DONE_MS);
    } else {
      setStage("error");
      setMessage(result.error ?? "Save failed");
    }
  }, [site, target, patch]);

  if (!target || !patch) return null;

  return (
    <div
      className="fixed left-3 top-3 z-[60] w-[268px] rounded-[12px] px-3 py-2.5 font-mono text-[11px] leading-[1.5]"
      style={{ ...NAV_GLASS_PANEL, color: "var(--nav-text-dim)" }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span style={{ color: "var(--nav-text)" }}>{target.path}</span>
        {target.inherited && <span title="this hotspot currently inherits its layout's camera">inherited</span>}
      </div>
      <div className="mb-2 truncate opacity-70">{target.name}</div>

      <Row label="pos" v={patch.position} />
      <Row label="rot" v={patch.rotation} />
      <div className="mb-2 mt-0.5 opacity-50">rotation is XYZ, as the site file stores it</div>

      {stage === "confirm" ? (
        <div>
          <div className="mb-2" style={{ color: "var(--nav-text)" }}>
            {target.inherited
              ? `Add a camera to ${target.id}? It stops following ${target.kind === "hotspot" ? "its layout" : "the default"}.`
              : `Overwrite ${target.path} in sites/${site.id}.json?`}
          </div>
          <div className="mb-2 opacity-60">
            Writes config/sites/{site.id}.json — the page will reload. No other route is touched.
          </div>
          <div className="flex gap-2">
            <Btn onClick={confirmSave} primary>Confirm save</Btn>
            <Btn onClick={() => setStage("idle")}>Cancel</Btn>
          </div>
        </div>
      ) : stage === "saving" ? (
        <div style={{ color: "var(--nav-text)" }}>Saving…</div>
      ) : stage === "done" ? (
        <div style={{ color: "var(--nav-accent)" }}>✓ {message}</div>
      ) : stage === "error" ? (
        <div>
          <div className="mb-2" style={{ color: "var(--nav-danger, #e8453c)" }}>✕ {message}</div>
          <Btn onClick={() => setStage("idle")}>Back</Btn>
        </div>
      ) : (
        <div className="flex gap-2">
          <Btn
            primary={cameraEdit}
            onClick={() => {
              setCameraEdit(!cameraEdit);
              // Popping the panel open is the point of arming: the six
              // draggable inputs live there, not here.
              if (!cameraEdit) setPanelCollapsed(false);
            }}
          >
            {cameraEdit ? "Editing" : "Edit"}
          </Btn>
          <Btn onClick={copy}>{copied ? "Copied" : "Copy"}</Btn>
          <Btn onClick={() => setStage("confirm")}>Save…</Btn>
        </div>
      )}
    </div>
  );
}

function Row({ label, v }: { label: string; v: readonly number[] }) {
  return (
    <div className="flex gap-2">
      <span className="w-6 shrink-0 opacity-50">{label}</span>
      <span className="tabular-nums" style={{ color: "var(--nav-text)" }}>
        {v.map(fmt).join("  ")}
      </span>
    </div>
  );
}

function Btn({
  children,
  onClick,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 cursor-pointer rounded-[8px] px-2 py-[5px] text-[11px] leading-none transition-[filter] hover:brightness-125"
      style={
        primary
          ? { background: "var(--nav-accent)", color: "#fff", border: "1px solid transparent" }
          : { background: "var(--nav-glass)", border: "1px solid var(--nav-border)", color: "inherit" }
      }
    >
      {children}
    </button>
  );
}

export default DebugCameraEditor;
