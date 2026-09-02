/**
 * POST /api/debug/camera — write one camera back into `site.json`.
 *
 * The last step of the `?debug=true` framing loop. Everything before it is
 * live: arm the editor, drag the camera onto the shot, read the numbers. This
 * is what makes the shot survive a reload, without the copy-into-an-editor-
 * find-the-right-row-paste round trip that is where a transposed digit gets in.
 *
 * DEV ONLY, and 404 rather than 403 when it is not — a 403 tells a prober the
 * endpoint exists. There is no auth here and there should not be: it writes a
 * source file in the working tree, which is meaningful only on a machine that
 * HAS the working tree. `next build` still emits the route, so the guard is the
 * whole security model and it is checked before anything is read.
 *
 * WHAT IT WRITES. `layouts[id].camera` or `hotspots[id].camera`, and nothing
 * else — the request names a row and a pose, never a path or a field. `rotation`
 * is taken as the **XYZ** the file stores (see `poseForCamera`); converting from
 * the runtime's YXZ is the client's job, because the client is the only side
 * holding a camera to convert from.
 *
 * WHY THE WHOLE FILE IS RE-SERIALISED. `site.json` is already 2-space
 * `JSON.stringify` output, so a parse/stringify round trip reproduces it byte
 * for byte apart from the edit — verified, not assumed. A targeted text patch
 * would avoid the round trip but has to find the right row by regex in a
 * 107 KB file where ids repeat across two tables, which is a worse failure mode
 * than a reformat.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** Where the one data file lives, relative to the dev server's cwd. */
const SITE_JSON = path.join(process.cwd(), "src", "config", "site.json");

type Vec3 = [number, number, number];

interface CameraRow {
  id: string;
  name?: string;
  camera?: { position: Vec3; rotation?: Vec3; target?: Vec3 };
}

interface SiteDoc {
  layouts: CameraRow[];
  hotspots: CameraRow[];
}

/** A triple of finite numbers, or null. Rejects NaN and Infinity explicitly:
 *  both survive `typeof === "number"` and both serialise to `null`, which would
 *  put a camera in the file that config cannot read back. */
function vec3(value: unknown): Vec3 | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  if (!value.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  return [value[0], value[1], value[2]] as Vec3;
}

/**
 * Set a row's camera, keeping the key where the schema puts it.
 *
 * A row that already has one is mutated in place, so its position is whatever
 * it already was. A row getting its FIRST camera — every hotspot, which ship
 * inheriting their layout's — has the key inserted right after `rotation`,
 * where `HotspotConfig` declares it, rather than appended after the `fields`
 * array. Purely so the diff a person reviews is three lines next to the
 * position they belong with, instead of a block hanging off the end of a
 * 40-line table of readings.
 */
function withCamera(row: CameraRow, camera: { position: Vec3; rotation: Vec3 }): CameraRow {
  if (row.camera) return { ...row, camera };

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value;
    if (key === "rotation") out.camera = camera;
  }
  // No `rotation` to anchor to (a layout row) — the key simply goes last.
  if (!out.camera) out.camera = camera;
  return out as unknown as CameraRow;
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return new Response("Not found", { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Body is not JSON" }, { status: 400 });
  }

  const { kind, id, position, rotation } = (body ?? {}) as Record<string, unknown>;

  if (kind !== "layout" && kind !== "hotspot") {
    return Response.json({ ok: false, error: `Unknown kind "${String(kind)}"` }, { status: 400 });
  }
  if (typeof id !== "string" || !id) {
    return Response.json({ ok: false, error: "Missing id" }, { status: 400 });
  }
  const pos = vec3(position);
  const rot = vec3(rotation);
  if (!pos || !rot) {
    return Response.json(
      { ok: false, error: "position and rotation must each be three finite numbers" },
      { status: 400 },
    );
  }

  let raw: string;
  try {
    raw = await readFile(SITE_JSON, "utf8");
  } catch (e) {
    return Response.json(
      { ok: false, error: `Cannot read site.json — ${(e as Error).message}` },
      { status: 500 },
    );
  }

  let doc: SiteDoc;
  try {
    doc = JSON.parse(raw) as SiteDoc;
  } catch (e) {
    return Response.json(
      { ok: false, error: `site.json is not valid JSON — ${(e as Error).message}` },
      { status: 500 },
    );
  }

  const table = kind === "layout" ? doc.layouts : doc.hotspots;
  const index = Array.isArray(table) ? table.findIndex((r) => r.id === id) : -1;
  if (index < 0) {
    return Response.json({ ok: false, error: `No ${kind} "${id}" in site.json` }, { status: 404 });
  }
  const row = table[index];

  // Reported back so the client can say what it replaced. A hotspot that had no
  // camera was INHERITING its layout's; that is a different edit from replacing
  // one, and the operator should be told which they just made.
  const previous = row.camera ?? null;

  // `target` and `rotation` are the two authored forms and exactly one may be
  // set (see `LayoutCamera`) — writing a rotation onto a row authored with a
  // target has to drop the target, or `poseForCamera` keeps honouring the old
  // one and the save looks like it did nothing.
  table[index] = withCamera(row, { position: pos, rotation: rot });

  const next = JSON.stringify(doc, null, 2) + "\n";
  try {
    await writeFile(SITE_JSON, next, "utf8");
  } catch (e) {
    return Response.json(
      { ok: false, error: `Cannot write site.json — ${(e as Error).message}` },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    path: `${kind === "layout" ? "layouts" : "hotspots"}[${id}].camera`,
    created: previous === null,
    previous,
  });
}
