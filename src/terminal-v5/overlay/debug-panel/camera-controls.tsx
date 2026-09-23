"use client";

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
  saveCamera,
  type CameraTarget,
} from "./camera-json";
import {
  activeAnchorTarget,
  formatAnchorPatch,
  formatFraming,
  framingFor,
  saveAnchor,
} from "./anchor-json";
import type { Vec3 } from "@/config/schema";
import { isMobileDevice } from "@/streaming/config";

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

const POLL_MS = 120;

const EDIT_QUIET_MS = 400;

const ARM_MS = 6000;

const DONE_MS = 4000;

type Setter = (patch: Record<string, unknown>) => void;

const round = (n: number, d = 3) => Number(n.toFixed(d));

export default function DebugCameraControls() {
  const { playerControllerRef } = useTerminalUi();
  const setFov = useCameraStore((s) => s.setFov);
  const site = useSite();
  const fovSeed = useCameraStore((s) => s.fovSeed);
  const setShowNavmesh = useDebugStore((s) => s.setShowNavmesh);
  const setNavmeshDepth = useDebugStore((s) => s.setNavmeshDepth);
  const navmeshTriangles = useDebugStore((s) => s.navmeshTriangles);
  const setCameraEdit = useDebugStore((s) => s.setCameraEdit);
  const cameraEdit = useDebugStore((s) => s.cameraEdit);
  const setAnchorEdit = useDebugStore((s) => s.setAnchorEdit);
  const anchorEdit = useDebugStore((s) => s.anchorEdit);
  const setShowAnchorHelper = useDebugStore((s) => s.setShowAnchorHelper);
  const showAnchorHelper = useDebugStore((s) => s.showAnchorHelper);

  const setRef = useRef<Setter>(() => {});
  const push = useCallback<Setter>((patch) => setRef.current(patch), []);

  const cpQuietRef = useRef(0);
  const hsQuietRef = useRef(0);
  const armedRef = useRef<"cp" | "hs" | null>(null);
  const armTimerRef = useRef(0);

  const eyeHeight = useCallback(() => {
    const ctrl = playerControllerRef.current;
    if (!ctrl) return 0;
    return ctrl.getPosition().y - ctrl.getFootPosition().y;
  }, [playerControllerRef]);

  const disarm = useCallback(() => {
    armedRef.current = null;
    window.clearTimeout(armTimerRef.current);
  }, []);

  const arm = useCallback(
    (which: "cp" | "hs", label: string) => {
      armedRef.current = which;
      window.clearTimeout(armTimerRef.current);
      armTimerRef.current = window.setTimeout(() => {
        armedRef.current = null;
        push({ [`${which} status`]: "—" });
      }, ARM_MS);
      push({ [`${which} status`]: label });
    },
    [push],
  );

  const applyEdit = useCallback(
    (
      patch: Partial<{ x: number; y: number; z: number; pitch: number; yaw: number; roll: number }>,
    ) => {
      const ctrl = playerControllerRef.current;
      const camera = useCameraStore.getState().camera;
      if (!ctrl || !camera) return;
      cpQuietRef.current = performance.now();

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

  const anchorNow = useCallback((): Vec3 | null => {
    const target = activeAnchorTarget(site);
    if (!target) return null;
    const draft = useDebugStore.getState().anchorDraft;
    return draft && draft.id === target.id ? draft.position : target.position;
  }, [site]);

  const applyAnchor = useCallback(
    (patch: Partial<{ ax: number; ay: number; az: number }>) => {
      const target = activeAnchorTarget(site);
      const base = anchorNow();
      if (!target || !base) return;
      hsQuietRef.current = performance.now();
      useDebugStore.getState().setAnchorDraft({
        id: target.id,
        position: [patch.ax ?? base[0], patch.ay ?? base[1], patch.az ?? base[2]],
      });
    },
    [site, anchorNow],
  );

  const editCp =
    (key: "x" | "y" | "z" | "pitch" | "yaw" | "roll") =>
    (v: number, _path: string, ctx?: { fromPanel?: boolean }) => {
      if (!ctx?.fromPanel) return;
      if (!useDebugStore.getState().cameraEdit) return;
      applyEdit({ [key]: v });
    };

  const editHs =
    (key: "ax" | "ay" | "az") =>
    (v: number, _path: string, ctx?: { fromPanel?: boolean }) => {
      if (!ctx?.fromPanel) return;
      if (!useDebugStore.getState().anchorEdit) return;
      applyAnchor({ [key]: v });
    };

  const anchorToFloor = useCallback(() => {
    const ctrl = playerControllerRef.current;
    const target = activeAnchorTarget(site);
    const base = anchorNow();
    if (!ctrl || !target || !base) return;
    const y = ctrl.probeFloorY(base[0], base[2], base[1]);
    if (y == null) return;
    hsQuietRef.current = performance.now();
    useDebugStore.getState().setAnchorDraft({ id: target.id, position: [base[0], y, base[2]] });
  }, [site, playerControllerRef, anchorNow]);

  const resetAnchor = useCallback(() => {
    useDebugStore.getState().setAnchorDraft(null);
    hsQuietRef.current = 0;
  }, []);

  const copyAnchor = useCallback(() => {
    const target = activeAnchorTarget(site);
    const base = anchorNow();
    if (!target || !base) return;
    const text = formatAnchorPatch(target, base);
    console.log(`[debug] anchor\n${text}`);
    navigator.clipboard?.writeText(text).catch(() => {});
    push({ "hs status": "copied" });
    window.setTimeout(() => push({ "hs status": "—" }), 1600);
  }, [site, anchorNow, push]);

  const resetToAuthored = useCallback(() => {
    const ctrl = playerControllerRef.current;
    const target = activeCameraTarget(site);
    if (!ctrl || !target) return;

    const pose =
      target.kind === "hotspot"
        ? site.poseForHotspot(target.id, isMobileDevice())
        : site.poseForLayout(target.id);
    const [x, authoredY, z] = pose.position;
    const h = eyeHeight();
    const footGuess = authoredY ? authoredY - h : 0;
    const y =
      target.aerial && authoredY ? authoredY - h : ctrl.probeFloorY(x, z, footGuess) ?? footGuess;

    cpQuietRef.current = performance.now();
    ctrl.teleportTo([x, y, z], pose.rotation);
  }, [site, playerControllerRef, eyeHeight]);

  const copyPose = useCallback(() => {
    const camera = useCameraStore.getState().camera;
    if (!camera) return;
    const text = formatCameraPatch(buildCameraPatch(camera), activeCameraTarget(site));
    console.log("[debug] camera\n" + text);
    navigator.clipboard?.writeText(text).catch(() => {});
    push({ "cp status": "copied" });
    window.setTimeout(() => push({ "cp status": "—" }), 1600);
  }, [site, push]);

  const saveCp = useCallback(async () => {
    const target = activeCameraTarget(site);
    const camera = useCameraStore.getState().camera;
    if (!target || !camera) {
      push({ "cp status": "no camera row" });
      return;
    }
    if (armedRef.current !== "cp") {
      arm("cp", `click again → ${target.path}`);
      return;
    }
    disarm();
    push({ "cp status": "saving…" });
    const res = await saveCamera(site.id, target, buildCameraPatch(camera));
    push({
      "cp status": res.ok ? `✓ ${res.created ? "added" : "updated"} ${res.path}` : `✕ ${res.error}`,
    });
    if (res.ok) window.setTimeout(() => push({ "cp status": "—" }), DONE_MS);
  }, [site, push, arm, disarm]);

  const saveHs = useCallback(async () => {
    const target = activeAnchorTarget(site);
    const base = anchorNow();
    if (!target || !base) {
      push({ "hs status": "no anchor row" });
      return;
    }
    if (armedRef.current !== "hs") {
      arm("hs", `click again → ${target.path}`);
      return;
    }
    disarm();
    push({ "hs status": "saving…" });
    const res = await saveAnchor(site.id, target, base);
    push({
      "hs status": res.ok ? `✓ ${res.created ? "added" : "updated"} ${res.path}` : `✕ ${res.error}`,
    });
    if (res.ok) {
      useDebugStore.getState().setAnchorDraft(null);
      window.setTimeout(() => push({ "hs status": "—" }), DONE_MS);
    }
  }, [site, anchorNow, push, arm, disarm]);

  const [, setTyped] = useControls(() => ({
    navigation: folder(
      {
        "show navmesh": {
          value: false,
          hint: "the walkable surface, in green over the ground it describes",
          onChange: (v: boolean, _p: string, ctx?: { fromPanel?: boolean }) => {
            if (ctx?.fromPanel) setShowNavmesh(v);
          },
        },
        "occlude navmesh": {
          value: false,
          hint: "let the world hide the overlay — off, it draws through walls",
          onChange: (v: boolean, _p: string, ctx?: { fromPanel?: boolean }) => {
            if (ctx?.fromPanel) setNavmeshDepth(v);
          },
        },
        "navmesh mesh": { value: "waiting…", editable: false },
      },
      { collapsed: true },
    ),

    "camera and anchor": folder(
      {
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

        "cp row": { value: "—", editable: false },
        "cp edit": {
          value: false,
          hint: "move the live camera from the cp rows below",
          onChange: (v: boolean, _p: string, ctx?: { fromPanel?: boolean }) => {
            if (ctx?.fromPanel) setCameraEdit(v);
          },
        },
        "cp x": { value: 0, step: 0.25, onChange: editCp("x") },
        "cp y": { value: 0, step: 0.25, hint: "EYE height, not foot", onChange: editCp("y") },
        "cp z": { value: 0, step: 0.25, onChange: editCp("z") },
        "cp pitch": { value: 0, min: -89, max: 89, step: 0.5, onChange: editCp("pitch") },
        "cp yaw": { value: 0, min: -180, max: 180, step: 0.5, onChange: editCp("yaw") },
        "cp roll": { value: 0, min: -180, max: 180, step: 0.5, onChange: editCp("roll") },
        "cp reset to authored": button(() => resetToAuthored()),
        "cp copy": button(() => copyPose()),
        "cp save": button(() => {
          void saveCp();
        }),
        "cp status": { value: "—", editable: false },

        "hs row": { value: "—", editable: false },
        "hs framing": { value: "—", editable: false },
        "hs edit": {
          value: false,
          hint: "move the marker from the hs rows below — never the camera",
          onChange: (v: boolean, _p: string, ctx?: { fromPanel?: boolean }) => {
            if (!ctx?.fromPanel) return;
            setAnchorEdit(v);
            if (v) setShowAnchorHelper(true);
          },
        },
        "hs x": { value: 0, step: 0.25, onChange: editHs("ax") },
        "hs y": { value: 0, step: 0.25, hint: "the marker's own Y", onChange: editHs("ay") },
        "hs z": { value: 0, step: 0.25, onChange: editHs("az") },
        "hs helper": {
          value: false,
          hint: "axes on the anchor, its drop line, the CP and the sight line between them",
          onChange: (v: boolean, _p: string, ctx?: { fromPanel?: boolean }) => {
            if (ctx?.fromPanel) setShowAnchorHelper(v);
          },
        },
        "hs drop to navmesh": button(() => anchorToFloor()),
        "hs reset": button(() => resetAnchor()),
        "hs copy": button(() => copyAnchor()),
        "hs save": button(() => {
          void saveHs();
        }),
        "hs status": { value: "—", editable: false },
      },
      { collapsed: true },
    ),
  }));

  useEffect(() => {
    setRef.current = setTyped as unknown as Setter;
  }, [setTyped]);

  useEffect(() => () => window.clearTimeout(armTimerRef.current), []);

  useEffect(() => {
    push({
      "navmesh mesh":
        navmeshTriangles === null ? "waiting…" : `${navmeshTriangles.toLocaleString()} triangles`,
    });
  }, [navmeshTriangles, push]);

  useEffect(() => {
    push({ "cp edit": cameraEdit });
  }, [cameraEdit, push]);

  useEffect(() => {
    push({ "hs edit": anchorEdit });
  }, [anchorEdit, push]);

  useEffect(() => {
    push({ "hs helper": showAnchorHelper });
  }, [showAnchorHelper, push]);

  useEffect(() => {
    let lastCpRow: string | null = null;
    let lastHsRow: string | null = null;
    let lastFraming: string | null = null;
    const id = window.setInterval(() => {
      const camera = useCameraStore.getState().camera;
      if (!camera) return;

      const target: CameraTarget | null = activeCameraTarget(site);
      const cpRow = target ? `${target.kind} ${target.id} · ${target.name}` : "— free camera —";
      if (cpRow !== lastCpRow) {
        lastCpRow = cpRow;
        push({ "cp row": cpRow });
      }

      const anchorTarget = activeAnchorTarget(site);
      const hsRow = anchorTarget
        ? `${anchorTarget.kind === "security" ? "security" : "hotspot"} ${anchorTarget.id} · ${anchorTarget.name}`
        : "— no hotspot picked —";
      if (hsRow !== lastHsRow) {
        lastHsRow = hsRow;
        push({ "hs row": hsRow });
      }

      const state = useDebugStore.getState();
      const at = anchorTarget
        ? state.anchorDraft && state.anchorDraft.id === anchorTarget.id
          ? state.anchorDraft.position
          : anchorTarget.position
        : null;

      const framing =
        anchorTarget && at
          ? anchorTarget.camera
            ? formatFraming(framingFor(anchorTarget.camera, at, site.scene.world.fov))
            : "no camera on this row"
          : "—";
      if (framing !== lastFraming) {
        lastFraming = framing;
        push({ "hs framing": framing });
      }

      const now = performance.now();

      if (now - cpQuietRef.current >= EDIT_QUIET_MS) {
        const pose = readPose(camera);
        push({
          "cp x": round(pose.position[0]),
          "cp y": round(pose.position[1]),
          "cp z": round(pose.position[2]),
          "cp pitch": round(pose.rotation[0] * DEG, 2),
          "cp yaw": round(pose.rotation[1] * DEG, 2),
          "cp roll": round(pose.rotation[2] * DEG, 2),
        });
      }

      if (at && now - hsQuietRef.current >= EDIT_QUIET_MS) {
        push({ "hs x": round(at[0]), "hs y": round(at[1]), "hs z": round(at[2]) });
      }
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [site, push]);

  return null;
}
