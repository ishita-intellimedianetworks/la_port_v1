"use client";

/**
 * The `?debug=true` camera card — the whole framing loop in one place.
 *
 *   land on a camera  →  Edit  →  drag it onto the shot  →  Copy or Save
 *
 * It appears only when there IS an authored camera in play (a resource you
 * travelled to, or the layout you are standing in) and names it, so the row
 * about to be edited is stated before anything moves. The numbers on it are the
 * numbers that get saved — position and an XYZ rotation, the form the site
 * file stores — rather than a second rendering of them, so what you read is
 * what lands in the file.
 *
 * WHY EDITING IS ARMED RATHER THAN ALWAYS ON. The card is up while you walk,
 * because its numbers are also the readout of where you are. Inputs that both
 * report and teleport are a trap: a stray drag on `y` in a panel you were
 * reading puts the camera underground. **Edit** is the deliberate act, and the
 * button stays lit while armed because leaving it on and forgetting is the
 * other half of the same trap.
 *
 * WHY SAVE ASKS. It rewrites a source file in the working tree, and because
 * every module imports the site config, the dev server reloads the page the
 * moment it lands. Both facts are on the confirm row: an edit that silently
 * discards an unsaved sibling edit, or that appears to crash the app, is worse
 * than one extra click. Saving a HOTSPOT camera is called out separately —
 * every hotspot ships without one and inherits its layout's, so the first save
 * on one is an ADD, and from then on that resource stops following its layout.
 *
 * IT WRITES THIS MODEL'S FILE AND ONLY THIS MODEL'S. Each route reads a
 * complete document of its own (`config/sites/<id>.json`), so a framing dialled
 * against this bake lands in this bake's file and the other routes do not move.
 * That used to be the opposite: one shared `site.json` meant every save here
 * re-aimed all three, which the confirm row had to warn about.
 */

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
  // These two ids ARE the camera target — `cameraTargetFor` takes them rather
  // than reading the store, so the subscription and the derivation are the same
  // two values and cannot drift apart.
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

  // Travelling somewhere else drops a half-finished save rather than leaving a
  // confirm row pointing at a row you have since left. Adjusted DURING render
  // against the previous key rather than in an effect: an effect would paint
  // one frame of the old row's confirmation under the new row's name.
  const [prevKey, setPrevKey] = useState(targetKey);
  if (targetKey !== prevKey) {
    setPrevKey(targetKey);
    setStage("idle");
    setMessage("");
    setCopied(false);
  }

  // The live readout. Held while a save is in flight so the numbers on screen
  // stay the numbers being written — the page is about to reload anyway, and a
  // value ticking under a confirmation is the one thing that would make it
  // unclear what was confirmed.
  // Kept in a ref because the poll below is set up once and must not be torn
  // down and rebuilt every time the stage changes — restarting the interval on
  // each keystroke of state would make the readout stutter.
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
          {/* Which file, and that the page will reload — neither is guessable
              from the button. The file is named because each model has its own
              and the save reaches only that one; it used to reach all three. */}
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
