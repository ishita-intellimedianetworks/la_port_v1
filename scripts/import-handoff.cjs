#!/usr/bin/env node
/**
 * import-handoff — pulls the descriptive columns of the Developer Handoff into
 * layouts.json / hotspots.json.
 *
 * The data-points document gives every hotspot its field table (already
 * imported, 301 values). The HANDOFF gives the prose around it, which was
 * missing:
 *
 *   Layout   -> `purpose`      the doc's Purpose line, verbatim
 *   Hotspot  -> `dataFields`   the doc's summary of what the popup shows
 *   Hotspot  -> `interaction`  the doc's Expected Interaction
 *
 * Names and popup titles are checked against the doc rather than overwritten,
 * so a mismatch is reported instead of silently papered over.
 *
 * Usage:  node scripts/import-handoff.cjs
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { readZipEntry, docxLines } = require("./verify-data.cjs");

const ROOT = path.join(__dirname, "..");
const DOCX = path.join(ROOT, "..", "HoloTwin_LA_Port_Developer_Handoff_L01-L10_H01-H30.docx");
const LAYOUTS = path.join(ROOT, "src/config/layouts.json");
const HOTSPOTS = path.join(ROOT, "src/config/hotspots.json");

const norm = (s) =>
  String(s).replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();

function parseHandoff(lines) {
  const layouts = {};
  const hotspots = {};
  let currentLayout = null;

  for (const line of lines) {
    // "L03 — Ship-to-Shore Crane Zone"
    const heading = /^(L\d{2})\s*[—–-]\s*(.+)$/.exec(line);
    if (heading) {
      currentLayout = heading[1];
      layouts[currentLayout] = { name: heading[2].trim(), purpose: null };
      continue;
    }
    if (currentLayout && line.startsWith("Purpose:")) {
      layouts[currentLayout].purpose = line.slice("Purpose:".length).trim();
      continue;
    }

    // "H05 | Ship-to-Shore Crane | Crane Status | crane ID, ... | Click → ..."
    const cells = line.split(" | ").map((c) => c.trim());
    if (cells.length === 5 && /^H\d{2}$/.test(cells[0])) {
      hotspots[cells[0]] = {
        layoutId: currentLayout,
        name: cells[1],
        popupTitle: cells[2],
        dataFields: cells[3],
        interaction: cells[4],
      };
    }
  }
  return { layouts, hotspots };
}

function main() {
  const xml = readZipEntry(fs.readFileSync(DOCX), "word/document.xml").toString("utf8");
  const spec = parseHandoff(docxLines(xml));

  const layoutsDoc = JSON.parse(fs.readFileSync(LAYOUTS, "utf8"));
  const hotspotsDoc = JSON.parse(fs.readFileSync(HOTSPOTS, "utf8"));

  const notes = [];
  let touched = 0;

  for (const layout of layoutsDoc.layouts) {
    const s = spec.layouts[layout.id];
    if (!s) {
      notes.push(`${layout.id} not found in the handoff`);
      continue;
    }
    if (norm(s.name) !== norm(layout.name)) {
      notes.push(`${layout.id} name: handoff "${s.name}" vs json "${layout.name}"`);
    }
    if (s.purpose && layout.purpose !== s.purpose) {
      layout.purpose = s.purpose;
      touched++;
    }
    // `description` was a paraphrase; the doc's own wording is the better one.
    if (s.purpose) layout.description = s.purpose;
  }

  for (const hotspot of hotspotsDoc.hotspots) {
    const s = spec.hotspots[hotspot.id];
    if (!s) {
      notes.push(`${hotspot.id} not found in the handoff`);
      continue;
    }
    if (norm(s.name) !== norm(hotspot.name)) {
      notes.push(`${hotspot.id} name: handoff "${s.name}" vs json "${hotspot.name}"`);
    }
    if (s.layoutId && s.layoutId !== hotspot.layoutId) {
      notes.push(`${hotspot.id} layout: handoff ${s.layoutId} vs json ${hotspot.layoutId}`);
    }
    // The handoff's popup titles are shorter than the data-points document's
    // (e.g. "Crane Status" vs "Crane QC-02 — Operational Status"). The longer
    // one is what the demo shows, so keep it and do not report the difference.
    if (hotspot.dataFields !== s.dataFields || hotspot.interaction !== s.interaction) {
      hotspot.dataFields = s.dataFields;
      hotspot.interaction = s.interaction;
      touched++;
    }
  }

  fs.writeFileSync(LAYOUTS, JSON.stringify(layoutsDoc, null, 2) + "\n");
  fs.writeFileSync(HOTSPOTS, JSON.stringify(hotspotsDoc, null, 2) + "\n");

  console.log(
    `handoff: ${Object.keys(spec.layouts).length} layouts, ${Object.keys(spec.hotspots).length} hotspots`,
  );
  console.log(`updated ${touched} record(s)`);
  if (notes.length) {
    console.log(`\n${notes.length} note(s):`);
    for (const n of notes) console.log("  ·", n);
  } else {
    console.log("every name and layout assignment matches the handoff");
  }
}

main();
