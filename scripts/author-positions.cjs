#!/usr/bin/env node
/**
 * author-positions — writes the layout camera poses and hotspot positions into
 * layouts.json / hotspots.json.
 *
 * LAYOUT CAMERAS are the poses already authored against this exact village
 * model in the HoloTwin reference projects (see REGISTERED_POSES below). They
 * were framed by hand in-scene, so they sit on walkable ground and look at
 * something — far better than anything generated.
 *
 * HOTSPOT MARKERS are derived, because the reference never authored any (every
 * `hotspot` field in its scenes.json is null).
 *
 * The data model comes straight from the handoff §4: a LAYOUT owns
 * `camera_position` + `camera_target` and a list of `hotspots[]`; a HOTSPOT
 * owns only a position. So one camera serves ALL of its layout's markers —
 * there is no per-hotspot camera. §5 makes the consequence explicit: every
 * hotspot must be "physically reachable/visible from its parent Layout".
 *
 * Markers are therefore placed IN FRONT of their layout's camera: ringed around
 * the point that camera is actually looking at, inside its field of view, and
 * snapped onto the navmesh. Aerial layouts work the same way — their markers
 * still sit on the ground, just further out, because that is where the camera
 * is pointed.
 *
 * All of it is provisional and gets replaced by the real authoring pass against
 * the Everport model (docs/05-assets-and-authoring.md).
 *
 * Usage:  node scripts/author-positions.cjs [--seed 7]
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SCENE = path.join(ROOT, "src/config/scene.json");
const LAYOUTS = path.join(ROOT, "src/config/layouts.json");
const HOTSPOTS = path.join(ROOT, "src/config/hotspots.json");

// ── Registered poses ─────────────────────────────────────────────────────────
//
// Every pose below was authored in-scene against olympic-village-v3.glb and
// read back out of a reference project's scenes.json. Ordered north → south by
// Z so L01..L10 read as a walk through the site.
//
// `source` records where each came from, so they can be re-verified.

const REGISTERED_POSES = [
  {
    layout: "L01",
    source: "scenes.json · global `entry` camera",
    position: [0, 60, 90],
    rotation: [-0.45, 0, 0],
    aerial: true,
  },
  {
    layout: "L02",
    source: "holotwin-la-v3 · restaurants/restaurant-1 (Village Restaurant)",
    position: [33.3674, 0, -22.4692],
    rotation: [-0.0003, -0.65, 0],
  },
  {
    layout: "L03",
    source: "holotwin-la-v3 · transport/transport-1 (Village Bus Station)",
    position: [21.3311, 0, -9.4886],
    rotation: [-0.0002, 0.2536, 0],
  },
  {
    layout: "L04",
    source: "holotwin-la-v3 · wellness/wellness-1 (Wellness Centre)",
    position: [-33.2061, 0, -8.6444],
    rotation: [0.1377, 0.7678, 0],
  },
  {
    layout: "L05",
    source: "holotwin-la-olympics-frontend · practice/practice-1",
    position: [35.5551, 0, 2.9908],
    rotation: [0.133, -2.5249, 0],
  },
  {
    layout: "L06",
    source: "holotwin-la--full-village · monument/monument-1 (= the village start pose)",
    position: [22.1736, 0, 13.0198],
    rotation: [-0.0002, 2.0908, 0],
  },
  {
    layout: "L07",
    source: "holotwin-la-v3 · practice/practice-1 (Practice Venue)",
    position: [33.4011, 0, 13.9222],
    rotation: [0.0403, -1.7714, 0],
  },
  {
    layout: "L08",
    source: "holotwin-la-v3 · restaurants/cafe-1 (Village Café)",
    position: [37.0814, 0, 40.7116],
    rotation: [-0.0002, -2.5937, 0],
  },
  {
    layout: "L09",
    source: "holotwin-la-v3 · hostel/hostel-1 (Athletes' Hostel)",
    position: [-22.7186, 0, 41.5066],
    rotation: [0.0958, -2.2831, 0],
  },
  {
    layout: "L10",
    source: "scenes.json · global `dollHouseCamera`",
    position: [0, 180, 320],
    rotation: [-0.5, 0, 0],
    aerial: true,
  },
];

// ── Tuning for marker placement ──────────────────────────────────────────────

/** Hotspot discs float this far above the surface so they read from a distance. */
const MARKER_LIFT = 1.2;
/** Eye height above the walkable surface, matching scene.json world.eyeHeight. */
const EYE = 1.828;
/** Preferred distance band from a ground camera to its markers, world units.
 *  Relaxed automatically when too little walkable ground falls in that band —
 *  several of these cameras face open water or a gap, with the nearest walkable
 *  point 30-45 units out. */
const GROUND_NEAR = 6;
const GROUND_FAR = 45;
/** Minimum separation between two markers of the same layout, so they read as
 *  distinct points rather than one blob. */
const MIN_SEPARATION_GROUND = 5;
const MIN_SEPARATION_AERIAL = 20;
/** A camera further than this from the navmesh is an aerial/overview pose. */
const AERIAL_SNAP_LIMIT = 40;
/**
 * Half-angle of the cone a marker must fall inside to count as visible. The
 * canvas camera is 55° vertical, which is ~43° horizontal half-angle on a 16:9
 * viewport; 35° keeps markers comfortably inside frame on narrower windows too.
 */
const FOV_HALF = 0.61;
/** How far along the view ray the authored `camera_target` is placed. */
const TARGET_DISTANCE = 24;

// ── Camera maths ─────────────────────────────────────────────────────────────

/**
 * Unit forward vector for a YXZ euler (pitch, yaw). Three.js cameras look down
 * -Z, so this is R(yaw) * R(pitch) applied to (0, 0, -1). Getting the sign
 * wrong here aims every camera 180° away from its subject.
 */
function forward(pitch, yaw) {
  return [
    -Math.cos(pitch) * Math.sin(yaw),
    Math.sin(pitch),
    -Math.cos(pitch) * Math.cos(yaw),
  ];
}

/** Is `point` in front of the camera and inside its FOV cone? */
function visibleFrom(eye, fwd, point) {
  const d = [point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  if (len < 1e-6) return false;
  const dot = (d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2]) / len;
  if (dot <= 0) return false; // behind the camera
  return Math.acos(Math.min(1, dot)) <= FOV_HALF;
}

// ── Deterministic PRNG, so re-running produces the same result ───────────────

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Minimal GLB reader (this navmesh is uncompressed float positions) ────────

function parseGLB(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("not a binary GLB");
  let off = 12;
  let json = null;
  let bin = null;
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString("utf8"));
    else if (type === 0x004e4942) bin = data;
    off += 8 + len;
  }
  if (!json || !bin) throw new Error("GLB missing a chunk");
  return { json, bin };
}

/** Every navmesh vertex, in world space. */
function readNavVertices(glbPath) {
  const { json, bin } = parseGLB(fs.readFileSync(glbPath));
  const out = [];

  for (const node of json.nodes) {
    if (node.mesh == null) continue;
    const t = node.translation || [0, 0, 0];
    for (const prim of json.meshes[node.mesh].primitives) {
      const acc = json.accessors[prim.attributes.POSITION];
      if (acc.componentType !== 5126) {
        throw new Error("expected float32 POSITION — this navmesh is quantised");
      }
      const view = json.bufferViews[acc.bufferView];
      const base = (view.byteOffset || 0) + (acc.byteOffset || 0);
      const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
      const stride = view.byteStride || 12;
      for (let i = 0; i < acc.count; i++) {
        out.push([
          dv.getFloat32(base + i * stride, true) + t[0],
          dv.getFloat32(base + i * stride + 4, true) + t[1],
          dv.getFloat32(base + i * stride + 8, true) + t[2],
        ]);
      }
    }
  }
  return out;
}

/** Nearest navmesh vertex to (x, z) — keeps every hotspot on walkable ground. */
function snapToNav(points, x, z) {
  let best = points[0];
  let bestD = Infinity;
  for (const p of points) {
    const d = (p[0] - x) ** 2 + (p[2] - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return { point: best, dist: Math.sqrt(bestD) };
}

const round = (v) => Math.round(v * 10000) / 10000;
const round3 = (v) => v.map(round);

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const seedArg = process.argv.indexOf("--seed");
  const seed = seedArg > -1 ? Number(process.argv[seedArg + 1]) : 7;
  const rand = mulberry32(seed);

  const scene = JSON.parse(fs.readFileSync(SCENE, "utf8"));
  const layoutsDoc = JSON.parse(fs.readFileSync(LAYOUTS, "utf8"));
  const hotspotsDoc = JSON.parse(fs.readFileSync(HOTSPOTS, "utf8"));

  const navPath = path.join(ROOT, "public", scene.assets.navmeshUrl);
  const verts = readNavVertices(navPath);
  console.log(`navmesh: ${verts.length} vertices from ${scene.assets.navmeshUrl}`);

  const centre = verts.reduce(
    (acc, p) => [acc[0] + p[0] / verts.length, 0, acc[2] + p[2] / verts.length],
    [0, 0, 0],
  );
  const groundY = verts[0][1];

  const poseFor = new Map(REGISTERED_POSES.map((p) => [p.layout, p]));
  const hotspotById = new Map(hotspotsDoc.hotspots.map((h) => [h.id, h]));

  let invisible = 0;

  for (const layout of layoutsDoc.layouts) {
    const pose = poseFor.get(layout.id);
    if (!pose) throw new Error(`no registered pose for ${layout.id}`);

    const nearest = snapToNav(verts, pose.position[0], pose.position[2]);
    const aerial = pose.aerial || nearest.dist > AERIAL_SNAP_LIMIT;

    const [pitch, yaw] = pose.rotation;
    const fwd = forward(pitch, yaw);
    // Ground cameras are authored at floor level; the runtime adds eye height
    // when it seats them, so the visibility maths has to add it too.
    const eye = [
      pose.position[0],
      aerial ? pose.position[1] : pose.position[1] + EYE,
      pose.position[2],
    ];

    // The handoff models a layout camera as position + target. Keep the
    // authored aim exactly by projecting a target along the view ray.
    layout.camera = {
      position: round3(pose.position),
      target: round3([
        eye[0] + fwd[0] * TARGET_DISTANCE,
        eye[1] + fwd[1] * TARGET_DISTANCE,
        eye[2] + fwd[2] * TARGET_DISTANCE,
      ]),
    };
    layout.position = round3([nearest.point[0], nearest.point[1], nearest.point[2]]);
    layout.poseSource = pose.source;
    if (aerial) {
      layout.walkable = false;
      layout.exactPose = true;
    }

    // ── Where the markers go ───────────────────────────────────────────────
    // Rather than guessing a distance and hoping there is ground there, take
    // the navmesh vertices that are ACTUALLY visible from this camera and pick
    // from those. Visibility is then guaranteed, not approximated — which
    // matters because several of these cameras face open water, with the
    // nearest walkable point 30-45 units away.
    const markerLift = MARKER_LIFT;
    const viewBearing = Math.atan2(fwd[0], fwd[2]);

    const visible = [];
    for (const v of verts) {
      const marker = [v[0], v[1] + markerLift, v[2]];
      if (!visibleFrom(eye, fwd, marker)) continue;
      const dx = marker[0] - eye[0];
      const dz = marker[2] - eye[2];
      // Signed bearing offset, wrapped to (-π, π], so sorting fans the markers
      // left-to-right across the view.
      let offset = Math.atan2(dx, dz) - viewBearing;
      while (offset > Math.PI) offset -= Math.PI * 2;
      while (offset < -Math.PI) offset += Math.PI * 2;
      visible.push({ marker, offset, distance: Math.hypot(dx, dz) });
    }

    const count = layout.hotspots.length;
    const separation = aerial ? MIN_SEPARATION_AERIAL : MIN_SEPARATION_GROUND;

    // Prefer a comfortable distance band, but keep everything if that would
    // leave too few candidates to spread across.
    let pool = aerial
      ? visible
      : visible.filter((c) => c.distance >= GROUND_NEAR && c.distance <= GROUND_FAR);
    if (pool.length < count * 4) pool = visible;
    pool.sort((a, b) => a.offset - b.offset);

    const taken = [];
    layout.hotspots.forEach((id, k) => {
      const hotspot = hotspotById.get(id);
      if (!hotspot) throw new Error(`layout ${layout.id} references missing ${id}`);

      let chosen = null;
      if (pool.length) {
        // Fan across the visible arc, then walk outward from that index for the
        // first candidate far enough from the markers already placed.
        const target = Math.round(((k + 0.5) / count) * (pool.length - 1));
        for (let step = 0; step < pool.length; step++) {
          for (const idx of [target + step, target - step]) {
            if (idx < 0 || idx >= pool.length) continue;
            const cand = pool[idx].marker;
            const clear = taken.every(
              (t) => Math.hypot(t[0] - cand[0], t[2] - cand[2]) >= separation,
            );
            if (clear) {
              chosen = cand;
              break;
            }
          }
          if (chosen) break;
        }
        // Everything was too close together — accept the fanned index anyway.
        if (!chosen) chosen = pool[target].marker;
      }

      if (!chosen) {
        // No walkable ground in view at all. Put the marker on the view axis so
        // it is at least on screen, and report it.
        const run = Math.hypot(fwd[0], fwd[2]) || 1;
        chosen = [
          eye[0] + (fwd[0] / run) * 12,
          groundY + markerLift,
          eye[2] + (fwd[2] / run) * 12,
        ];
        invisible++;
      }

      taken.push(chosen);
      hotspot.position = round3(chosen);
      // -90° about X lays the disc flat on the ground; the second term only
      // varies which way the ring's seam points.
      hotspot.rotation = round3([-Math.PI / 2, rand() * Math.PI * 2, 0]);
      // Per handoff §4 a hotspot has no camera of its own — it is seen from its
      // layout's. Strip any left over from an earlier shape.
      delete hotspot.camera;
    });
  }

  if (invisible) console.log(`WARNING: ${invisible} marker(s) could not be placed in view`);

  layoutsDoc._note =
    "Layout cameras are poses authored in-scene against olympic-village-v3.glb, taken from the " +
    "HoloTwin reference projects (see poseSource on each). Applied by scripts/author-positions.cjs. " +
    "Replaced by the real authoring pass against the Everport model.";
  hotspotsDoc._note =
    "A hotspot is a MARKER only — per handoff §4 it has no camera of its own; it is viewed from " +
    "its layout's camera, which several markers share. Positions are derived, not authored: each " +
    "marker is placed in front of its layout's camera, inside its field of view, and snapped to " +
    "the navmesh (scripts/author-positions.cjs). Field values are demo data unless dataSource is " +
    "'static'.";

  fs.writeFileSync(LAYOUTS, JSON.stringify(layoutsDoc, null, 2) + "\n");
  fs.writeFileSync(HOTSPOTS, JSON.stringify(hotspotsDoc, null, 2) + "\n");

  console.log(`\nseed ${seed} — ${layoutsDoc.layouts.length} layouts, ${hotspotsDoc.hotspots.length} hotspots\n`);
  for (const l of layoutsDoc.layouts) {
    const p = l.camera.position;
    const kind = l.walkable === false ? "aerial" : "ground";
    console.log(
      `  ${l.id}  ${l.zone.padEnd(10)} ${kind}  ` +
        `[${p[0].toFixed(1)}, ${p[1].toFixed(1)}, ${p[2].toFixed(1)}]  ${l.hotspots.join(" ")}`,
    );
  }
}

main();
