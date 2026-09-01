"use client";

/**
 * Step 8 — check it, then write it.
 *
 * The validator here is the same one `config/index.ts` runs at load, moved
 * forward: the runtime prints its complaints to a console nobody is watching,
 * and a studio that lets you save a file it already knows is broken has failed
 * at the only thing it is for. Errors block the write; warnings do not, because
 * "this layout has no camera yet" is a description of unfinished work rather
 * than of a wrong file.
 *
 * THREE WAYS OUT, in descending order of convenience and ascending order of
 * where they work:
 *
 *   Save to disk   POSTs to `/api/admin/site`, which refuses outside
 *                  `next dev`. Backs the old file up first.
 *   Download       the same bytes through the browser. Works anywhere.
 *   Copy           for pasting into a diff or a message.
 */

import { useMemo, useState } from "react";
import { BASELINE, useDraftStore } from "../draft-store";
import { serialise, validate } from "../validate";
import { Button, Group, Note, Panel } from "../ui";

/** A shallow tally of what moved, so the author can see the shape of the
 *  change without reading 3,500 lines of JSON. Deliberately shallow: this is
 *  an orientation aid, not a diff tool — the real diff is `git diff` after the
 *  save. */
function summarise(draft: typeof BASELINE) {
  const changes: string[] = [];
  const before = BASELINE;

  const layoutsBefore = new Map(before.layouts.map((l) => [l.id, l]));
  const layoutsAfter = new Map(draft.layouts.map((l) => [l.id, l]));
  const added = draft.layouts.filter((l) => !layoutsBefore.has(l.id)).map((l) => l.id);
  const removed = before.layouts.filter((l) => !layoutsAfter.has(l.id)).map((l) => l.id);
  const movedCameras = draft.layouts.filter((l) => {
    const was = layoutsBefore.get(l.id);
    return was && JSON.stringify(was.camera) !== JSON.stringify(l.camera);
  });

  if (added.length) changes.push(`${added.length} layout(s) added: ${added.join(", ")}`);
  if (removed.length) changes.push(`${removed.length} layout(s) removed: ${removed.join(", ")}`);
  if (movedCameras.length) {
    changes.push(`${movedCameras.length} layout camera(s) moved: ${movedCameras.map((l) => l.id).join(", ")}`);
  }

  const hotspotsBefore = new Map(before.hotspots.map((h) => [h.id, h]));
  const hotspotsAfter = new Map(draft.hotspots.map((h) => [h.id, h]));
  const hsAdded = draft.hotspots.filter((h) => !hotspotsBefore.has(h.id)).map((h) => h.id);
  const hsRemoved = before.hotspots.filter((h) => !hotspotsAfter.has(h.id)).map((h) => h.id);
  const hsChanged = draft.hotspots.filter((h) => {
    const was = hotspotsBefore.get(h.id);
    return was && JSON.stringify(was) !== JSON.stringify(h);
  });
  if (hsAdded.length) changes.push(`${hsAdded.length} resource(s) added: ${hsAdded.join(", ")}`);
  if (hsRemoved.length) changes.push(`${hsRemoved.length} resource(s) removed: ${hsRemoved.join(", ")}`);
  if (hsChanged.length) changes.push(`${hsChanged.length} resource(s) edited`);

  // Ordering is data here, so a pure reorder is a real change and has to show.
  const orderBefore = before.hotspots.map((h) => h.id).join(",");
  const orderAfter = draft.hotspots.map((h) => h.id).join(",");
  if (orderBefore !== orderAfter && !hsAdded.length && !hsRemoved.length) {
    changes.push("resource ORDER changed — this is what the panel lists by");
  }

  for (const key of ["cameras", "lights", "sky", "world", "assets", "zones", "globals"] as const) {
    if (JSON.stringify(before[key]) !== JSON.stringify(draft[key])) changes.push(`${key} changed`);
  }
  if (before.startLayoutId !== draft.startLayoutId) {
    changes.push(`opens on ${before.startLayoutId} → ${draft.startLayoutId}`);
  }

  return changes;
}

export function ReviewStep({ onGoToStep }: { onGoToStep: (step: string) => void }) {
  const draft = useDraftStore((s) => s.draft);
  const dirty = useDraftStore((s) => s.dirty);
  const reset = useDraftStore((s) => s.reset);
  const markSaved = useDraftStore((s) => s.markSaved);

  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [showJson, setShowJson] = useState(false);

  const problems = useMemo(() => validate(draft), [draft]);
  const errors = problems.filter((p) => p.level === "error");
  const warnings = problems.filter((p) => p.level === "warning");
  const changes = useMemo(() => summarise(draft), [draft]);
  const json = useMemo(() => serialise(draft), [draft]);

  const save = async () => {
    setBusy(true);
    setStatus("Writing…");
    try {
      const response = await fetch("/api/admin/site", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: json,
      });
      const body = (await response.json()) as { ok?: boolean; path?: string; error?: string };
      if (!response.ok) {
        setStatus(body.error ?? `Write failed (${response.status}).`);
      } else {
        markSaved();
        setStatus(
          `Written to ${body.path}. The previous file is in .site-backups/. ` +
            `Reload / or /v2 to see it — the config is imported at module load.`,
        );
      }
    } catch (error) {
      setStatus(`Write failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "site.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus("Downloaded site.json — drop it over src/config/site.json.");
  };

  return (
    <Panel
      title="8 · Review & save"
      description="The checks config/index.ts runs at load, run before the write instead of after the read."
      actions={
        <>
          <Button onClick={download}>Download</Button>
          <Button
            onClick={() => {
              void navigator.clipboard.writeText(json);
              setStatus("Copied to the clipboard.");
            }}
          >
            Copy
          </Button>
          <Button tone="primary" onClick={save} disabled={busy || !!errors.length}>
            {busy ? "Writing…" : "Save to disk"}
          </Button>
        </>
      }
    >
      {status && (
        <p className="mb-4 rounded border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
          {status}
        </p>
      )}

      <Group title={`Errors — ${errors.length}`}>
        {errors.length ? (
          <ul className="space-y-1.5">
            {errors.map((problem, i) => (
              <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-red-200">
                <button
                  type="button"
                  className="mt-0.5 shrink-0 rounded bg-red-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-red-200 hover:bg-red-500/35"
                  onClick={() => onGoToStep(problem.step)}
                >
                  {problem.step}
                </button>
                <span>{problem.message}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-emerald-300">
            None. Every id is well-formed and unique, every reference resolves, and the hero
            container agrees across all its mentions.
          </p>
        )}
      </Group>

      <Group title={`Warnings — ${warnings.length}`}>
        {warnings.length ? (
          <ul className="space-y-1.5">
            {warnings.map((problem, i) => (
              <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-amber-200/90">
                <button
                  type="button"
                  className="mt-0.5 shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-200 hover:bg-amber-500/30"
                  onClick={() => onGoToStep(problem.step)}
                >
                  {problem.step}
                </button>
                <span>{problem.message}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-400">None.</p>
        )}
      </Group>

      <Group title="What changed against the shipped file">
        {changes.length ? (
          <ul className="space-y-1 text-xs text-slate-300">
            {changes.map((change, i) => (
              <li key={i}>· {change}</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-400">Nothing — the draft matches site.json as it ships.</p>
        )}
      </Group>

      <Group
        title="Output"
        right={
          <button
            type="button"
            className="text-[10px] font-normal normal-case text-sky-300 hover:text-sky-200"
            onClick={() => setShowJson((v) => !v)}
          >
            {showJson ? "hide" : "show"} JSON ({(json.length / 1024).toFixed(0)} KB)
          </button>
        }
      >
        {showJson ? (
          <pre className="max-h-96 overflow-auto rounded bg-black/60 p-3 font-mono text-[10px] leading-relaxed text-slate-300">
            {json}
          </pre>
        ) : (
          <p className="text-xs leading-relaxed text-slate-400">
            The draft is written back as the WHOLE document, including every key the studio has no
            UI for — <code className="font-mono">stream</code>,{" "}
            <code className="font-mono">streamV2</code>, <code className="font-mono">map</code>,{" "}
            <code className="font-mono">copy</code> and every{" "}
            <code className="font-mono">_note</code>. It is edited in place rather than rebuilt, so
            nothing the studio does not understand is lost.
          </p>
        )}
      </Group>

      <Note>
        Saving to disk only works under <code className="font-mono">next dev</code> — the endpoint
        refuses otherwise, since a deployed build has no <code className="font-mono">src/</code>{" "}
        beside it and this rewrites the entire site configuration. Download does the same job
        anywhere.
      </Note>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-[11px] text-slate-500">
          {dirty ? "Unsaved changes, kept in this browser." : "In step with the last save."}
        </span>
        <Button
          tone="danger"
          small
          onClick={() => {
            if (window.confirm("Discard the draft and reload site.json as it ships?")) reset();
          }}
        >
          Discard draft
        </Button>
      </div>
    </Panel>
  );
}
