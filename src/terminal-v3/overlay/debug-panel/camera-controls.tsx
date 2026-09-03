"use client";

/**
 * The `?debug=true` panel's VIEW and CAMERA folders — everything that is not a
 * light.
 *
 * `view` is two knobs the lighting folders cannot stand in for: the field of
 * view, which decides how much of the terminal a framing actually holds, and
 * the navmesh overlay, which used to come on with `?debug=true` itself and made
 * the whole site green while you were trying to judge a sun angle.
 *
 * `camera` is a live two-way binding to the camera on screen. Drag `x`, `y`, `z`
 * or one of the three angles and the view moves as you drag; walk away from the
 * pose and the numbers follow. That is the loop the framing work needs — the
 * alternative was editing the site file, reloading, travelling back to the
 * resource, and judging the change against a memory of the last one.
 *
 * HOW THE TWO-WAY BINDING AVOIDS FIGHTING ITSELF
 * ----------------------------------------------
 *  - Every `onChange` is guarded on `ctx.fromPanel`. Leva fires them for a
 *    programmatic `set()` too, so without the guard the readback would look
 *    like an edit and teleport the player once per poll.
 *  - Readback is polled, not per-frame: `set()` re-renders inputs, and doing
 *    that 60 times a second to show a number nobody is reading is waste.
 *  - Readback pauses for a moment after any edit. A drag applies instantly, so
 *    the poll would usually push the identical value back — but `y` does not
 *    round-trip exactly on walkable ground (the controller re-seats it on the
 *    navmesh), and pushing the seated value back mid-drag drags against you.
 *
 * WHY WRITES GO THROUGH `teleportTo` AND NOT `camera.position.set`
 * ---------------------------------------------------------------
 * The player controller owns the camera and rewrites it every frame from its
 * own `pos` / `rot` refs, so a direct write to the three.js object survives
 * exactly one frame. `teleportTo` sets both, which is why it is also what
 * `goToLayout` uses. It takes a FOOT position and adds the eye height back, so
 * the y here — an EYE height, because that is what a the site file camera stores
 * — has the controller's own camera height taken off first.
 */

import { useCallback, useEffect, useRef } from "react";
import { button, folder, useControls } from "leva";
import { useSite } from "@/config/context";
import { useCameraStore } from "@/shared/stores/camera-store";
import { useTerminalUi } from "../../context/ui-context";
import { useDebugStore } from "../../stores/debug-store";
import {
  activeCameraTarget,
  buildCameraPatch,
  formatCameraPatch,
  readPose,
  type CameraTarget,
} from "./camera-json";

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

/** How often the panel re-reads the camera, ms. Fast enough to read as live
 *  while walking, slow enough that it is not re-rendering inputs every frame. */
const POLL_MS = 120;

/** How long after an edit the readback stays quiet, ms. Long enough to cover a
 *  drag's pointer-move cadence, short enough that letting go feels immediate. */
const EDIT_QUIET_MS = 400;

/** Leva's setter, addressed by flat leaf key — same shape the lighting folder
 *  uses, and for the same reason (`folder()` namespaces the store path, not the
 *  key you address). */
type Setter = (patch: Record<string, unknown>) => void;

const round = (n: number, d = 3) => Number(n.toFixed(d));

export default function DebugCameraControls() {
  const { playerControllerRef } = useTerminalUi();
  const setFov = useCameraStore((s) => s.setFov);
  // Both the authored poses and the FOV the "reset" buttons mean belong to the
  // model this route is running, not to a shared config.
  const site = useSite();
  const fovSeed = useCameraStore((s) => s.fovSeed);
  const setShowNavmesh = useDebugStore((s) => s.setShowNavmesh);
  const setNavmeshDepth = useDebugStore((s) => s.setNavmeshDepth);
  const navmeshTriangles = useDebugStore((s) => s.navmeshTriangles);
  const setCameraEdit = useDebugStore((s) => s.setCameraEdit);
  const cameraEdit = useDebugStore((s) => s.cameraEdit);

  const setRef = useRef<Setter>(() => {});
  const push = useCallback<Setter>((patch) => setRef.current(patch), []);

  /** Timestamp of the last panel-originated edit — see the quiet window above. */
  const lastEditRef = useRef(0);

  /** The controller's own eye height: the gap between where the camera is and
   *  where the feet are. Read live rather than from config, because each floor
   *  can carry its own. */
  const eyeHeight = useCallback(() => {
    const ctrl = playerControllerRef.current;
    if (!ctrl) return 0;
    return ctrl.getPosition().y - ctrl.getFootPosition().y;
  }, [playerControllerRef]);

  /**
   * Apply a full pose from the panel's current numbers, patching in the one
   * field that just changed.
   *
   * Reads the OTHER five off the live camera rather than off leva state: leva
   * hands a callback only its own value, and the camera is the one place all
   * six are guaranteed to be the values on screen right now.
   */
  const applyEdit = useCallback(
    (patch: Partial<{ x: number; y: number; z: number; pitch: number; yaw: number; roll: number }>) => {
      const ctrl = playerControllerRef.current;
      const camera = useCameraStore.getState().camera;
      if (!ctrl || !camera) return;
      lastEditRef.current = performance.now();

      const pose = readPose(camera);
      const x = patch.x ?? pose.position[0];
      const y = patch.y ?? pose.position[1];
      const z = patch.z ?? pose.position[2];
      const pitch = (patch.pitch ?? pose.rotation[0] * DEG) * RAD;
      const yaw = (patch.yaw ?? pose.rotation[1] * DEG) * RAD;
      const roll = (patch.roll ?? pose.rotation[2] * DEG) * RAD;

      ctrl.teleportTo([x, y - eyeHeight(), z], [pitch, yaw, roll]);
    },
    [playerControllerRef, eyeHeight],
  );

  /** One position/rotation input. Writes only when the edit came from the panel
   *  AND the editor is armed — see `cameraEdit` in the debug store. */
  const edit =
    (key: "x" | "y" | "z" | "pitch" | "yaw" | "roll") =>
    (v: number, _path: string, ctx?: { fromPanel?: boolean }) => {
      if (!ctx?.fromPanel) return;
      if (!useDebugStore.getState().cameraEdit) return;
      applyEdit({ [key]: v });
    };

  /** Send the camera back to the pose the site file authored for wherever it is.
   *  The seating rule matches `goToLayout` exactly: an aerial pose keeps its
   *  authored Y, a ground one is probed onto the navmesh at that XZ. */
  const resetToAuthored = useCallback(() => {
    const ctrl = playerControllerRef.current;
    const target = activeCameraTarget(site);
    if (!ctrl || !target) return;

    const pose =
      target.kind === "hotspot" ? site.poseForHotspot(target.id) : site.poseForLayout(target.id);
    const [x, authoredY, z] = pose.position;
    const h = eyeHeight();
    const footGuess = authoredY ? authoredY - h : 0;
    const y =
      target.aerial && authoredY
        ? authoredY - h
        : ctrl.probeFloorY(x, z, footGuess) ?? footGuess;

    lastEditRef.current = performance.now();
    ctrl.teleportTo([x, y, z], pose.rotation);
  }, [site, playerControllerRef, eyeHeight]);

  /** The same block the camera card copies and the save writes — one builder,
   *  so the three cannot disagree about what "this pose" is. */
  const copyPose = useCallback(() => {
    const camera = useCameraStore.getState().camera;
    if (!camera) return;
    const text = formatCameraPatch(buildCameraPatch(camera), activeCameraTarget(site));
    console.log("[debug] camera\n" + text);
    navigator.clipboard?.writeText(text).catch(() => {});
  }, [site]);

  const [, setTyped] = useControls(() => ({
    view: folder({
      fov: {
        value: fovSeed,
        min: 20,
        max: 110,
        step: 1,
        hint: "vertical field of view — this model's world.fov",
        onChange: (v: number, _p: string, ctx?: { fromPanel?: boolean }) => {
          if (ctx?.fromPanel) setFov(v);
        },
      },
      "reset fov": button(() => {
        setFov(fovSeed);
        push({ fov: fovSeed });
      }),
      "show navmesh": {
        value: false,
        hint: "the walkable surface, in green over the ground it describes",
        onChange: (v: boolean, _p: string, ctx?: { fromPanel?: boolean }) => {
          if (ctx?.fromPanel) setShowNavmesh(v);
        },
      },
      // See `navmeshDepth` in the debug store: the navmesh sits within
      // centimetres of the apron across a kilometre of site, so depth-tested it
      // mostly loses the z-fight and the toggle above looks broken. Drawn
      // through by default; turn this on to see where it floats or sinks.
      "occlude navmesh": {
        value: false,
        hint: "let the world hide the overlay — off, it draws through walls",
        onChange: (v: boolean, _p: string, ctx?: { fromPanel?: boolean }) => {
          if (ctx?.fromPanel) setNavmeshDepth(v);
        },
      },
      // The readout that separates "the overlay is off" from "the overlay is on
      // and there is no mesh behind it" — two identical blank screens.
      "navmesh mesh": { value: "waiting…", editable: false },
    }),

    camera: folder({
      // Which authored block an edit here belongs in. Null while the player is
      // somewhere nobody authored a camera for, and the copy still works then —
      // that is how a new one gets found.
      editing: { value: "—", editable: false },
      "edit camera": {
        value: false,
        hint: "arm the six inputs below; off, they are a live readout",
        onChange: (v: boolean, _p: string, ctx?: { fromPanel?: boolean }) => {
          if (ctx?.fromPanel) setCameraEdit(v);
        },
      },
      // Plain numbers, not sliders: the terminal spans X -1500..-662, and a
      // slider across that range moves ~4 m per pixel. Drag the LABEL for fine
      // control, or type a value.
      x: { value: 0, step: 0.25, onChange: edit("x") },
      y: { value: 0, step: 0.25, hint: "EYE height, as the site file stores it", onChange: edit("y") },
      z: { value: 0, step: 0.25, onChange: edit("z") },
      // Angles ARE bounded, so these are sliders. Degrees, because nobody
      // frames a shot in radians; the export converts back.
      pitch: { value: 0, min: -89, max: 89, step: 0.5, onChange: edit("pitch") },
      yaw: { value: 0, min: -180, max: 180, step: 0.5, onChange: edit("yaw") },
      roll: { value: 0, min: -180, max: 180, step: 0.5, onChange: edit("roll") },
      "reset to authored": button(() => resetToAuthored()),
      // Clipboard AND console, so a declined clipboard permission still leaves
      // the numbers somewhere they can be read off. Saving is NOT here: it
      // rewrites a source file and needs a confirmation, which belongs on the
      // camera card where the row being overwritten is named.
      "copy position + rotation": button(() => copyPose()),
    }),
  }));

  useEffect(() => {
    setRef.current = setTyped as unknown as Setter;
  }, [setTyped]);

  // The navmesh arrives after the panel is built (it streams with the chunks),
  // so the readout is pushed in when it lands rather than seeded.
  useEffect(() => {
    push({
      "navmesh mesh":
        navmeshTriangles === null
          ? "waiting…"
          : `${navmeshTriangles.toLocaleString()} triangles`,
    });
  }, [navmeshTriangles, push]);

  // The arming switch can also be flipped from the camera card, so mirror the
  // store back into the panel rather than letting the checkbox go stale.
  useEffect(() => {
    push({ "edit camera": cameraEdit });
  }, [cameraEdit, push]);

  // The readback. Everything the panel shows about the camera is derived here,
  // so there is exactly one place that decides what "current" means.
  useEffect(() => {
    let lastLabel: string | null = null;
    const id = window.setInterval(() => {
      const camera = useCameraStore.getState().camera;
      if (!camera) return;

      const target: CameraTarget | null = activeCameraTarget(site);
      const label = target ? `${target.kind} ${target.id} · ${target.name}` : "— free camera —";
      if (label !== lastLabel) {
        lastLabel = label;
        push({ editing: label });
      }

      if (performance.now() - lastEditRef.current < EDIT_QUIET_MS) return;
      const pose = readPose(camera);
      push({
        x: round(pose.position[0]),
        y: round(pose.position[1]),
        z: round(pose.position[2]),
        pitch: round(pose.rotation[0] * DEG, 2),
        yaw: round(pose.rotation[1] * DEG, 2),
        roll: round(pose.rotation[2] * DEG, 2),
      });
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [site, push]);

  return null;
}
