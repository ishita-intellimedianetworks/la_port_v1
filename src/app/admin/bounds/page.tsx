"use client";

/**
 * /admin/bounds — render the terminal top-down, then calibrate the site aerial
 * against it.
 *
 * Two steps, in order:
 *
 *   1. RENDER    the model through an ortho frustum locked to the bbox the
 *                RUNTIME uses (manifest.worldMin/Max). The resulting PNG is 1:1
 *                with world coordinates by construction — see render-floor.ts.
 *
 *   2. CALIBRATE the site aerial by laying that render on top of it and lining
 *                up the quay. The site image has no world coordinates of its
 *                own; the render does, so it acts as the stencil and the site
 *                bounds fall out arithmetically — see calibrate.ts.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as THREE from "three";
import { scene as siteScene } from "@/config";
import {
  derive, loadGlb, maxTextureSize, measureBbox, pixelDimsFor, renderTopDown,
  type Bbox, type RenderMode, type WorldBbox,
} from "./render-floor";
import {
  calibrate, initialPlacement, scalePlacement, toJson, type Placement,
} from "./calibrate";

const MODEL_URL = siteScene.assets.modelUrl;
const SLUG = (siteScene as { stream?: { slug?: string } }).stream?.slug ?? "";
const MANIFEST_URL = SLUG ? `/assets/${SLUG}/assets/manifest.json` : "";

/**
 * The walkable zone — the navmesh AABB in world space (node translation
 * [-1082.053, _, 56.300] plus its local extents +/-420.270 x +/-494.624).
 * Drawn over the calibration so you can see where map clicks will resolve.
 */
const ZONE = { minX: -1502.324, maxX: -661.783, minZ: -438.324, maxZ: 550.924 };

const PPM_PRESETS = [0.65, 1.31, 2.62, 4];
const VIEW_W = 1180;

/** A render plus its decoded bitmap, so the calibration canvas can composite it. */
interface Plan {
  url: string;
  bytes: number;
  w: number;
  h: number;
  img: HTMLImageElement;
}

const r = (n: number, d = 2) => {
  const k = Math.pow(10, d);
  return Math.round(n * k) / k;
};

export default function BoundsPage() {
  // ── Step 1: render ─────────────────────────────────────────────────────────
  const sceneRef = useRef<THREE.Object3D | null>(null);
  const [glbBbox, setGlbBbox] = useState<WorldBbox | null>(null);
  const [manifestBbox, setManifestBbox] = useState<WorldBbox | null>(null);
  const [bboxSource, setBboxSource] = useState<"manifest" | "glb">("manifest");
  const [ppm, setPpm] = useState(1.31);
  const [mode, setMode] = useState<RenderMode>("native");
  const [opaque, setOpaque] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const bbox: Bbox | null = useMemo(() => {
    const raw = bboxSource === "manifest" ? manifestBbox : glbBbox;
    return raw ? derive(raw) : null;
  }, [bboxSource, manifestBbox, glbBbox]);

  const dims = bbox ? pixelDimsFor(bbox, ppm) : null;
  // Lazy initialiser, not an effect: the probe touches `document`, so it has to
  // be guarded for SSR, but it never changes afterwards. Nothing renders from it
  // until `bbox` arrives (client-only, via the manifest fetch), so the server's
  // placeholder can't reach the HTML and mismatch on hydration.
  const [maxTex] = useState(() => (typeof window === "undefined" ? 16384 : maxTextureSize()));
  const tooBig = !!dims && (dims.w > maxTex || dims.h > maxTex);

  // Pull the runtime's bbox straight from the stream manifest. This is the
  // number streamed-model reports via onBounds, so rendering to it is what
  // makes the image agree with what the minimap believes.
  useEffect(() => {
    if (!MANIFEST_URL) return;
    let alive = true;
    fetch(MANIFEST_URL)
      .then((res) => res.json())
      .then((m: { worldMin: number[]; worldMax: number[] }) => {
        if (!alive) return;
        setManifestBbox({
          minX: m.worldMin[0], maxX: m.worldMax[0],
          minY: m.worldMin[1], maxY: m.worldMax[1],
          minZ: m.worldMin[2], maxZ: m.worldMax[2],
        });
      })
      .catch((e) => setStatus(`manifest fetch failed: ${e}`));
    return () => { alive = false; };
  }, []);

  const loadModel = useCallback(async (src: File | string) => {
    setBusy(true);
    setStatus("loading model…");
    try {
      const obj = await loadGlb(src);
      sceneRef.current = obj;
      setGlbBbox(measureBbox(obj));
      setStatus("model loaded");
    } catch (e) {
      setStatus(`load failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const doRender = useCallback(async () => {
    if (!sceneRef.current || !bbox || !dims) return;
    setBusy(true);
    setStatus("rendering…");
    try {
      const out = await renderTopDown(
        sceneRef.current, bbox, dims.w, dims.h, mode, opaque ? "#0b1020" : null,
      );
      // Decode here rather than in an effect: the calibration canvas needs the
      // bitmap and the URL together, and awaiting the decode keeps them in one
      // state update instead of two renders with a half-ready overlay.
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error("decode failed"));
        img.src = out.url;
      });
      setPlan((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { ...out, img };
      });
      setStatus(`rendered ${out.w}x${out.h} · ${(out.bytes / 1e6).toFixed(2)} MB`);
    } catch (e) {
      setStatus(`render failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [bbox, dims, mode, opaque]);

  // ── Step 2: calibrate ──────────────────────────────────────────────────────
  const [siteImg, setSiteImg] = useState<HTMLImageElement | null>(null);
  const [override, setOverride] = useState<Placement | null>(null);
  const [overlayAlpha, setOverlayAlpha] = useState(0.55);
  const [guessMpp, setGuessMpp] = useState(0.5);
  const [showZone, setShowZone] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const loadSite = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setSiteImg(img);
      setOverride(null);
      setStatus(`site image ${img.naturalWidth}x${img.naturalHeight}`);
    };
    img.src = url;
  }, []);

  // Placement is DERIVED, with an optional user override. That avoids seeding
  // state from an effect (which would cascade a render on every load) and makes
  // "reset" a matter of dropping the override.
  const seed = useCallback((): Placement | null => (
    siteImg && bbox
      ? initialPlacement(siteImg.naturalWidth, siteImg.naturalHeight, bbox, guessMpp)
      : null
  ), [siteImg, bbox, guessMpp]);

  const placement = override ?? seed();

  const updatePlacement = useCallback((fn: (p: Placement) => Placement) => {
    setOverride((prev) => {
      const base = prev ?? seed();
      return base ? fn(base) : null;
    });
  }, [seed]);

  const result = useMemo(() => {
    if (!siteImg || !bbox || !placement) return null;
    return calibrate(siteImg.naturalWidth, siteImg.naturalHeight, placement, bbox);
  }, [siteImg, bbox, placement]);

  const viewScale = siteImg ? VIEW_W / siteImg.naturalWidth : 1;

  const redraw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv || !siteImg) return;
    const dispH = Math.round(siteImg.naturalHeight * viewScale);
    if (cv.width !== VIEW_W || cv.height !== dispH) {
      cv.width = VIEW_W;
      cv.height = dispH;
    }
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(siteImg, 0, 0, cv.width, cv.height);

    if (!plan || !placement) return;
    const x = placement.ox * viewScale;
    const y = placement.oy * viewScale;
    const w = placement.ow * viewScale;
    const h = placement.oh * viewScale;

    ctx.save();
    ctx.globalAlpha = overlayAlpha;
    if (placement.rotDeg) {
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate((placement.rotDeg * Math.PI) / 180);
      ctx.translate(-(x + w / 2), -(y + h / 2));
    }
    ctx.drawImage(plan.img, x, y, w, h);
    ctx.restore();

    // Model outline
    ctx.save();
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();

    // Walkable zone — where map clicks will resolve.
    if (showZone && bbox) {
      const mppX = bbox.dx / placement.ow;
      const mppZ = bbox.dz / placement.oh;
      const zx0 = (placement.ox + (bbox.maxX - ZONE.maxX) / mppX) * viewScale;
      const zx1 = (placement.ox + (bbox.maxX - ZONE.minX) / mppX) * viewScale;
      const zy0 = (placement.oy + (bbox.maxZ - ZONE.maxZ) / mppZ) * viewScale;
      const zy1 = (placement.oy + (bbox.maxZ - ZONE.minZ) / mppZ) * viewScale;
      ctx.save();
      ctx.strokeStyle = "#4ade80";
      ctx.lineWidth = 2;
      ctx.strokeRect(zx0, zy0, zx1 - zx0, zy1 - zy0);
      ctx.fillStyle = "#4ade80";
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.fillText("walkable zone (clickable)", zx0 + 6, zy0 + 16);
      ctx.restore();
    }
  }, [siteImg, viewScale, placement, plan, overlayAlpha, showZone, bbox]);

  useEffect(() => { redraw(); }, [redraw]);

  // Drag to move.
  const dragRef = useRef({ on: false, sx: 0, sy: 0, ox: 0, oy: 0 });

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!placement) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { on: true, sx: e.clientX, sy: e.clientY, ox: placement.ox, oy: placement.oy };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d.on) return;
    const dx = (e.clientX - d.sx) / viewScale;
    const dy = (e.clientY - d.sy) / viewScale;
    updatePlacement((p) => ({ ...p, ox: d.ox + dx, oy: d.oy + dy }));
  };
  const onPointerUp = () => { dragRef.current.on = false; };

  // Wheel scales about the placement's centre, so zooming and nudging don't fight.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      updatePlacement((p) => scalePlacement(p, e.deltaY < 0 ? 1.02 : 1 / 1.02));
    };
    cv.addEventListener("wheel", onWheel, { passive: false });
    return () => cv.removeEventListener("wheel", onWheel);
  }, [updatePlacement]);

  // Arrow keys nudge (shift = coarse); [ ] scale.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 20 : 2;
      const k = e.key;
      if (k === "ArrowLeft") updatePlacement((p) => ({ ...p, ox: p.ox - step }));
      else if (k === "ArrowRight") updatePlacement((p) => ({ ...p, ox: p.ox + step }));
      else if (k === "ArrowUp") updatePlacement((p) => ({ ...p, oy: p.oy - step }));
      else if (k === "ArrowDown") updatePlacement((p) => ({ ...p, oy: p.oy + step }));
      else if (k === "[") updatePlacement((p) => scalePlacement(p, e.shiftKey ? 0.98 : 0.998));
      else if (k === "]") updatePlacement((p) => scalePlacement(p, e.shiftKey ? 1.02 : 1.002));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [updatePlacement]);

  const jsonOut = useMemo(() => {
    if (!result || !placement || !siteImg) return "";
    return toJson(result, placement, siteImg.naturalWidth, siteImg.naturalHeight, "/floorplan/everport-site.webp");
  }, [result, placement, siteImg]);

  // ── UI ─────────────────────────────────────────────────────────────────────
  const box = "rounded-lg border border-neutral-800 bg-neutral-900 p-4";
  const btn = "rounded px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40";
  const btnP = `${btn} bg-blue-600 text-white hover:bg-blue-500`;
  const btnG = `${btn} bg-neutral-800 text-neutral-200 hover:bg-neutral-700`;
  const label = "block text-[11px] font-semibold uppercase tracking-wide text-neutral-500 mb-1.5";

  return (
    <div className="min-h-screen bg-neutral-950 p-6 text-neutral-100">
      <div className="mx-auto max-w-[1260px] space-y-5">
        <header>
          <h1 className="text-lg font-semibold">Bounds &amp; Calibrate</h1>
          <p className="mt-1 text-xs text-neutral-500">
            Render the model top-down at exact world scale, then align the site aerial to it.
          </p>
          {status && <p className="mt-2 font-mono text-[11px] text-amber-400">{status}</p>}
        </header>

        {/* ── Step 1 ── */}
        <section className={box}>
          <h2 className="mb-3 text-sm font-semibold">1 · Render the model</h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <span className={label}>Model</span>
              <button className={btnP} disabled={busy} onClick={() => loadModel(MODEL_URL)}>
                Load project model
              </button>
              <input
                type="file"
                accept=".glb"
                disabled={busy}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) loadModel(f); e.target.value = ""; }}
                className="mt-2 block w-full text-[11px] text-neutral-400 file:mr-2 file:rounded file:border-0 file:bg-neutral-800 file:px-2 file:py-1 file:text-[11px] file:text-neutral-200"
              />
              <p className="mt-1 font-mono text-[10px] break-all text-neutral-600">{MODEL_URL}</p>
            </div>

            <div>
              <span className={label}>Bbox source</span>
              <div className="flex gap-2">
                <button
                  className={bboxSource === "manifest" ? btnP : btnG}
                  onClick={() => setBboxSource("manifest")}
                  disabled={!manifestBbox}
                >
                  Manifest
                </button>
                <button
                  className={bboxSource === "glb" ? btnP : btnG}
                  onClick={() => setBboxSource("glb")}
                  disabled={!glbBbox}
                >
                  GLB
                </button>
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-neutral-500">
                Manifest is what the runtime reports via <code>onBounds</code>. Use it
                unless you know otherwise.
              </p>
            </div>

            <div>
              <span className={label}>Pixels per metre</span>
              <div className="flex flex-wrap gap-1.5">
                {PPM_PRESETS.map((p) => (
                  <button key={p} className={ppm === p ? btnP : btnG} onClick={() => setPpm(p)}>{p}</button>
                ))}
                <input
                  type="number" min={0.1} max={50} step={0.01} value={ppm}
                  onChange={(e) => setPpm(Math.max(0.1, Math.min(50, +e.target.value || 1)))}
                  className="w-20 rounded bg-neutral-800 px-2 py-1 text-xs"
                />
              </div>
              {dims && (
                <p className={`mt-1.5 font-mono text-[10px] ${tooBig ? "text-red-400" : "text-neutral-500"}`}>
                  {dims.w} x {dims.h} px {tooBig ? `· EXCEEDS GPU LIMIT ${maxTex}` : ""}
                </p>
              )}
            </div>

            <div>
              <span className={label}>Style</span>
              <div className="flex gap-2">
                <button className={mode === "native" ? btnP : btnG} onClick={() => setMode("native")}>Native</button>
                <button className={mode === "silhouette" ? btnP : btnG} onClick={() => setMode("silhouette")}>Schematic</button>
              </div>
              <label className="mt-2 flex items-center gap-2 text-[11px] text-neutral-400">
                <input type="checkbox" checked={opaque} onChange={(e) => setOpaque(e.target.checked)} />
                Opaque background
              </label>
              <button
                className={`${btnP} mt-2 w-full`}
                disabled={busy || !bbox || !glbBbox || tooBig}
                onClick={doRender}
              >
                Render
              </button>
            </div>
          </div>

          {bbox && (
            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-neutral-800 pt-3 font-mono text-[11px] text-neutral-400 md:grid-cols-4">
              <div>X <span className="text-neutral-200">{r(bbox.minX)} … {r(bbox.maxX)}</span></div>
              <div>Z <span className="text-neutral-200">{r(bbox.minZ)} … {r(bbox.maxZ)}</span></div>
              <div>span <span className="text-neutral-200">{r(bbox.dx)} x {r(bbox.dz)} m</span></div>
              <div>aspect <span className="text-neutral-200">{r(bbox.aspect, 4)}</span></div>
            </div>
          )}

          {manifestBbox && glbBbox && (
            <p className="mt-2 text-[10px] text-neutral-500">
              GLB bbox differs from manifest by{" "}
              <span className="font-mono text-amber-400">
                X {r(Math.abs(glbBbox.minX - manifestBbox.minX))}/{r(Math.abs(glbBbox.maxX - manifestBbox.maxX))} m,
                {" "}Z {r(Math.abs(glbBbox.minZ - manifestBbox.minZ))}/{r(Math.abs(glbBbox.maxZ - manifestBbox.maxZ))} m
              </span>
              {" "}— this gap is why the source matters.
            </p>
          )}

          {plan && (
            <div className="mt-4 flex items-start gap-4 border-t border-neutral-800 pt-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={plan.url} alt="model render" className="max-h-[260px] rounded border border-neutral-800 bg-[#0b1020]" />
              <div className="space-y-2">
                <p className="font-mono text-[11px] text-neutral-400">
                  {plan.w} x {plan.h} · {(plan.bytes / 1e6).toFixed(2)} MB
                </p>
                <a className={btnG} href={plan.url} download={`terminal-plan.${plan.w}x${plan.h}.png`}>
                  Download PNG
                </a>
              </div>
            </div>
          )}
        </section>

        {/* ── Step 2 ── */}
        <section className={box}>
          <h2 className="mb-3 text-sm font-semibold">2 · Calibrate the site aerial</h2>

          <div className="mb-3 flex flex-wrap items-end gap-4">
            <div>
              <span className={label}>Site image</span>
              <input
                type="file" accept="image/*"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) loadSite(f); e.target.value = ""; }}
                className="block text-[11px] text-neutral-400 file:mr-2 file:rounded file:border-0 file:bg-neutral-800 file:px-2 file:py-1 file:text-[11px] file:text-neutral-200"
              />
            </div>
            <div>
              <span className={label}>Start scale (m/px)</span>
              <input
                type="number" step={0.01} min={0.01} value={guessMpp}
                onChange={(e) => setGuessMpp(Math.max(0.01, +e.target.value || 0.5))}
                className="w-24 rounded bg-neutral-800 px-2 py-1 text-xs"
              />
            </div>
            <div>
              <span className={label}>Overlay opacity</span>
              <input
                type="range" min={0} max={1} step={0.05} value={overlayAlpha}
                onChange={(e) => setOverlayAlpha(+e.target.value)}
                className="w-40 align-middle"
              />
            </div>
            <div>
              <span className={label}>Rotation (diagnostic)</span>
              <input
                type="range" min={-15} max={15} step={0.25}
                value={placement?.rotDeg ?? 0}
                onChange={(e) => { const v = +e.target.value; updatePlacement((p) => ({ ...p, rotDeg: v })); }}
                className="w-40 align-middle"
              />
              <span className="ml-2 font-mono text-[11px] text-neutral-300">{r(placement?.rotDeg ?? 0)}°</span>
            </div>
            <label className="flex items-center gap-2 text-[11px] text-neutral-400">
              <input type="checkbox" checked={showZone} onChange={(e) => setShowZone(e.target.checked)} />
              Show walkable zone
            </label>
            <button className={btnG} onClick={() => setOverride(null)} disabled={!siteImg || !bbox}>
              Reset placement
            </button>
          </div>

          <p className="mb-2 text-[11px] text-neutral-500">
            Drag to move · wheel to scale · arrows nudge (shift = coarse) · [ ] to scale.
            Align on the <span className="text-neutral-300">quay line</span> — a long straight
            edge pins scale and position far better than a corner.
          </p>

          {!siteImg && <p className="py-10 text-center text-xs text-neutral-600">Load a site image to begin.</p>}
          {!plan && siteImg && (
            <p className="py-2 text-center text-xs text-amber-500">
              Render the model first — it is the alignment stencil.
            </p>
          )}

          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="w-full cursor-move rounded border border-neutral-800"
            style={{ display: siteImg ? "block" : "none", touchAction: "none" }}
          />

          {result && (
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5 font-mono text-[11px]">
                <div className="text-neutral-400">
                  m/px X <span className="text-neutral-100">{r(result.metresPerPixelX, 5)}</span>
                  {"   "}Z <span className="text-neutral-100">{r(result.metresPerPixelZ, 5)}</span>
                </div>
                <div className={result.agreementPct > 99 ? "text-green-400" : result.agreementPct > 97 ? "text-amber-400" : "text-red-400"}>
                  scale agreement {r(result.agreementPct, 2)}%
                  {result.agreementPct <= 99 && " — alignment off, or image non-uniformly stretched"}
                </div>
                <div className="text-neutral-400">
                  site spans <span className="text-neutral-100">{r(result.spanX, 0)} x {r(result.spanZ, 0)} m</span>
                </div>
                {!!placement?.rotDeg && (
                  <div className="text-red-400">
                    rotation {r(placement.rotDeg)}° — bounds cannot express this. Straighten the image first.
                  </div>
                )}
              </div>
              <div>
                <textarea
                  readOnly value={jsonOut}
                  className="h-44 w-full rounded bg-neutral-950 p-2 font-mono text-[10px] text-neutral-300"
                />
                <button className={`${btnG} mt-1.5`} onClick={() => navigator.clipboard.writeText(jsonOut)}>
                  Copy JSON
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
