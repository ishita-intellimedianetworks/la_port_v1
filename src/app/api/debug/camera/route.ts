import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** The models that have a file, and the only values that may reach a path. */
const SITE_IDS = ["v1", "v2", "v3", "v4", "v5"] as const;
type SiteId = (typeof SITE_IDS)[number];

/** Where one model's document lives, relative to the dev server's cwd. */
const siteFileFor = (id: SiteId) =>
  path.join(process.cwd(), "src", "config", "sites", `${id}.json`);

type Vec3 = [number, number, number];

interface CameraRow {
  id: string;
  name?: string;
  position?: Vec3;
  rotation?: Vec3;
  camera?: { position: Vec3; rotation?: Vec3; target?: Vec3 };
}

interface SiteDoc {
  layouts: CameraRow[];
  hotspots: CameraRow[];
  securityHotspots?: CameraRow[];
}

const TABLE_BY_KIND = {
  layout: "layouts",
  hotspot: "hotspots",
  security: "securityHotspots",
} as const;

type Kind = keyof typeof TABLE_BY_KIND;

function vec3(value: unknown): Vec3 | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  if (!value.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  return [value[0], value[1], value[2]] as Vec3;
}

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

  const { site, kind, id, position, rotation, field } = (body ?? {}) as Record<string, unknown>;

  if (typeof site !== "string" || !(SITE_IDS as readonly string[]).includes(site)) {
    return Response.json(
      { ok: false, error: `Unknown site "${String(site)}" — expected one of ${SITE_IDS.join(", ")}` },
      { status: 400 },
    );
  }
  const siteFile = siteFileFor(site as SiteId);
  const siteName = `sites/${site}.json`;

  if (typeof kind !== "string" || !(kind in TABLE_BY_KIND)) {
    return Response.json({ ok: false, error: `Unknown kind "${String(kind)}"` }, { status: 400 });
  }
  const table_kind = kind as Kind;

  const what = field === undefined ? "camera" : field;
  if (what !== "camera" && what !== "position") {
    return Response.json({ ok: false, error: `Unknown field "${String(field)}"` }, { status: 400 });
  }
  if (what === "position" && table_kind === "layout") {
    return Response.json(
      { ok: false, error: "A layout has no anchor position — it is a camera and a name" },
      { status: 400 },
    );
  }

  if (typeof id !== "string" || !id) {
    return Response.json({ ok: false, error: "Missing id" }, { status: 400 });
  }
  const pos = vec3(position);
  const rot = what === "camera" ? vec3(rotation) : pos;
  if (!pos || !rot) {
    return Response.json(
      { ok: false, error: "position and rotation must each be three finite numbers" },
      { status: 400 },
    );
  }

  let raw: string;
  try {
    raw = await readFile(siteFile, "utf8");
  } catch (e) {
    return Response.json(
      { ok: false, error: `Cannot read ${siteName} — ${(e as Error).message}` },
      { status: 500 },
    );
  }

  let doc: SiteDoc;
  try {
    doc = JSON.parse(raw) as SiteDoc;
  } catch (e) {
    return Response.json(
      { ok: false, error: `${siteName} is not valid JSON — ${(e as Error).message}` },
      { status: 500 },
    );
  }

  const tableName = TABLE_BY_KIND[table_kind];
  const table = doc[tableName];
  const index = Array.isArray(table) ? table.findIndex((r) => r.id === id) : -1;
  if (index < 0) {
    return Response.json(
      { ok: false, error: `No ${kind} "${id}" in ${siteName} › ${tableName}` },
      { status: 404 },
    );
  }
  const rows = table as CameraRow[];
  const row = rows[index];

  const previous = what === "camera" ? (row.camera ?? null) : (row.position ?? null);

  if (what === "camera") {
    rows[index] = withCamera(row, { position: pos, rotation: rot });
  } else {
    row.position = pos;
  }

  const next = JSON.stringify(doc, null, 2) + "\n";
  try {
    await writeFile(siteFile, next, "utf8");
  } catch (e) {
    return Response.json(
      { ok: false, error: `Cannot write ${siteName} — ${(e as Error).message}` },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    path: `${siteName} › ${tableName}[${id}].${what}`,
    created: previous === null,
    previous,
  });
}
