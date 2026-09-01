/**
 * Read and write `src/config/site.json` from the admin studio.
 *
 * DEVELOPMENT ONLY, and enforced rather than documented: both handlers refuse
 * outside `next dev`. A deployed build serves a read-only bundle — there is no
 * `src/` beside it to write to, and an endpoint that rewrites the site's entire
 * configuration is not something to leave reachable on a public host on the
 * strength of an obscure URL. The studio still works fully in production
 * without it; the review step falls back to downloading the file, which is the
 * same bytes through the browser instead of through the server.
 *
 * The write keeps a timestamped `.bak` beside the file. `site.json` is the
 * whole site — every camera, every hotspot, every note explaining why a number
 * is what it is — and the studio can overwrite all of it in one click. Git is
 * the real safety net, but a backup costs 200 KB and covers the case where the
 * previous state was never committed.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** Resolved from the process working directory, which for `next dev` is the
 *  project root. */
const SITE_PATH = path.join(process.cwd(), "src", "config", "site.json");
const BACKUP_DIR = path.join(process.cwd(), ".site-backups");

function devOnly(): Response | null {
  if (process.env.NODE_ENV === "development") return null;
  return Response.json(
    { error: "The studio can only write to site.json under `next dev`. Use Download instead." },
    { status: 403 },
  );
}

export async function GET() {
  const blocked = devOnly();
  if (blocked) return blocked;
  try {
    const text = await readFile(SITE_PATH, "utf8");
    return new Response(text, { headers: { "content-type": "application/json" } });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body was not JSON." }, { status: 400 });
  }

  // The shape check is deliberately shallow — the studio has already run the
  // full validator and shown the author every problem. What this catches is a
  // request that is not a site document at all, which would otherwise truncate
  // the file to `{}` and lose everything.
  const draft = body as { layouts?: unknown[]; hotspots?: unknown[]; meta?: unknown };
  if (!draft || !Array.isArray(draft.layouts) || !Array.isArray(draft.hotspots) || !draft.meta) {
    return Response.json(
      { error: "That is not a site document — it has no meta, layouts and hotspots." },
      { status: 400 },
    );
  }

  try {
    // Back up what is there BEFORE writing, and let a missing file pass: the
    // very first write in a fresh checkout has nothing to preserve.
    try {
      const existing = await readFile(SITE_PATH, "utf8");
      await mkdir(BACKUP_DIR, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      await writeFile(path.join(BACKUP_DIR, `site.${stamp}.json`), existing, "utf8");
    } catch {
      /* nothing to back up */
    }

    // Two-space indent and a trailing newline — the shipped file's formatting,
    // so a save shows only the values that actually changed in a diff.
    await writeFile(SITE_PATH, `${JSON.stringify(body, null, 2)}\n`, "utf8");
    return Response.json({ ok: true, path: path.relative(process.cwd(), SITE_PATH) });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
