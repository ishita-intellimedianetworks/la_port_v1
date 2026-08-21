#!/usr/bin/env node
/**
 * verify-data — checks layouts.json / hotspots.json against the source spec
 * document, so drift between the two is caught rather than discovered in a demo.
 *
 * It reads the .docx directly (a docx is a zip holding word/document.xml), so
 * there is no intermediate export to go stale. No dependencies.
 *
 * Usage:  node scripts/verify-data.cjs
 * Exits non-zero when anything is missing or mismatched.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const DOCX = path.join(
  ROOT,
  "..",
  "HoloTwin_LA_Port_All_Data_Points_L01-L10_H01-H30.docx",
);
const HANDOFF = path.join(
  ROOT,
  "..",
  "HoloTwin_LA_Port_Developer_Handoff_L01-L10_H01-H30.docx",
);
const LAYOUTS = path.join(ROOT, "src/config/layouts.json");
const HOTSPOTS = path.join(ROOT, "src/config/hotspots.json");
const SCENE = path.join(ROOT, "src/config/scene.json");

// ── Minimal zip reader ───────────────────────────────────────────────────────

/** Pull one file out of a zip by name. Handles stored and deflated entries. */
function readZipEntry(buf, wanted) {
  // Walk back from the end for the End Of Central Directory signature.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip (no EOCD)");

  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) throw new Error("bad central directory");
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOff = buf.readUInt32LE(ptr + 42);
    const name = buf.toString("utf8", ptr + 46, ptr + 46 + nameLen);

    if (name === wanted) {
      // The local header repeats the name/extra lengths, and they can differ
      // from the central directory's — always read them from the local header.
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const raw = buf.subarray(start, start + compSize);
      return method === 0 ? raw : zlib.inflateRawSync(raw);
    }
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${wanted} not found in zip`);
}

// ── docx → lines ─────────────────────────────────────────────────────────────

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };

const decode = (t) =>
  t.replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m]).replace(/&#(\d+);/g, (_, n) =>
    String.fromCharCode(Number(n)),
  );

/**
 * Flatten document.xml into lines, keeping table structure: one line per
 * paragraph, and one line per table ROW with its cells joined by " | ".
 *
 * A regex sweep over the whole file cannot do this — paragraphs nest inside
 * table cells, so any single replace of </w:p> either shreds the rows or merges
 * every paragraph into one line. This walks the tags instead, tracking whether
 * it is currently inside a cell.
 */
function docxLines(xml) {
  const lines = [];
  let cells = [];
  let buf = "";
  let cellDepth = 0;
  let textDepth = 0;

  const endCell = () => {
    cells.push(buf.replace(/\s+/g, " ").trim());
    buf = "";
  };
  const endRow = () => {
    if (cells.length) lines.push(cells.join(" | "));
    cells = [];
  };
  const endParagraph = () => {
    const text = buf.replace(/\s+/g, " ").trim();
    if (text) lines.push(text);
    buf = "";
  };

  const token = /<([^>]+)>|([^<]+)/g;
  let m;
  while ((m = token.exec(xml)) !== null) {
    if (m[2] !== undefined) {
      // Only text inside <w:t> is document content; field codes and the like
      // live in other elements and would otherwise leak into the output.
      if (textDepth > 0) buf += decode(m[2]);
      continue;
    }

    const tag = m[1];
    const name = tag.replace(/^\//, "").split(/[\s/]/)[0];
    const closing = tag.startsWith("/");
    const selfClosing = tag.endsWith("/");

    if (name === "w:t" && !selfClosing) {
      textDepth += closing ? -1 : 1;
    } else if (name === "w:tc" && !selfClosing) {
      if (closing) {
        endCell();
        cellDepth--;
      } else {
        cellDepth++;
      }
    } else if (name === "w:tr" && closing) {
      endRow();
    } else if (name === "w:p" && closing) {
      // A paragraph break inside a cell is a space, not a new line.
      if (cellDepth > 0) buf += " ";
      else endParagraph();
    } else if (name === "w:tab" || name === "w:br") {
      buf += " ";
    }
  }
  endParagraph();

  return lines.map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/** Pull the H01-H30 blocks (title + field table) out of the spec document. */
function parseSpec(lines) {
  const spec = {};
  let current = null;

  for (const line of lines) {
    const heading = /^(H\d{2})\s*[—–-]\s*(.+)$/.exec(line);
    if (heading) {
      current = heading[1];
      spec[current] = { name: heading[2].trim(), title: null, fields: [] };
      continue;
    }
    if (!current) continue;

    if (line.startsWith("Popup title:")) {
      spec[current].title = line.slice("Popup title:".length).trim();
      continue;
    }

    const cells = line.split(" | ").map((c) => c.trim());
    if (cells.length === 3 && cells[0] !== "Field Name") {
      spec[current].fields.push({ name: cells[0], type: cells[1], value: cells[2] });
    }
  }
  return spec;
}

/** The handoff's prose columns: a Purpose per layout, and per hotspot the data
 *  summary + Expected Interaction. */
function parseHandoff(lines) {
  const layouts = {};
  const hotspots = {};
  let current = null;

  for (const line of lines) {
    const heading = /^(L\d{2})\s*[—–-]\s*(.+)$/.exec(line);
    if (heading) {
      current = heading[1];
      layouts[current] = { name: heading[2].trim(), purpose: null };
      continue;
    }
    if (current && line.startsWith("Purpose:")) {
      layouts[current].purpose = line.slice("Purpose:".length).trim();
      continue;
    }
    const cells = line.split(" | ").map((c) => c.trim());
    if (cells.length === 5 && /^H\d{2}$/.test(cells[0])) {
      hotspots[cells[0]] = {
        layoutId: current,
        name: cells[1],
        dataFields: cells[3],
        interaction: cells[4],
      };
    }
  }
  return { layouts, hotspots };
}

// ── Compare ──────────────────────────────────────────────────────────────────

const normalise = (s) =>
  String(s)
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

function main() {
  const xml = readZipEntry(fs.readFileSync(DOCX), "word/document.xml").toString("utf8");
  const spec = parseSpec(docxLines(xml));

  const scene = JSON.parse(fs.readFileSync(SCENE, "utf8"));
  const layouts = JSON.parse(fs.readFileSync(LAYOUTS, "utf8")).layouts;
  const hotspots = JSON.parse(fs.readFileSync(HOTSPOTS, "utf8")).hotspots;
  const byId = Object.fromEntries(hotspots.map((h) => [h.id, h]));

  const problems = [];
  const warn = [];

  // ── Structural completeness ────────────────────────────────────────────────
  for (let i = 1; i <= 10; i++) {
    const id = `L${String(i).padStart(2, "0")}`;
    const l = layouts.find((x) => x.id === id);
    if (!l) {
      problems.push(`${id} missing from layouts.json`);
      continue;
    }
    for (const key of ["name", "zone", "description", "position", "camera", "hotspots"]) {
      if (l[key] == null) problems.push(`${id} has no ${key}`);
    }
    if (!l.hotspots?.length) problems.push(`${id} lists no hotspots`);
  }

  for (let i = 1; i <= 30; i++) {
    const id = `H${String(i).padStart(2, "0")}`;
    const h = byId[id];
    if (!h) {
      problems.push(`${id} missing from hotspots.json`);
      continue;
    }
    for (const key of ["layoutId", "name", "popupTitle", "icon", "dataSource", "position", "rotation", "fields"]) {
      if (h[key] == null) problems.push(`${id} has no ${key}`);
    }
    if (!h.fields?.length) problems.push(`${id} has no fields`);
  }

  // ── Against the spec document ──────────────────────────────────────────────
  for (const id of Object.keys(spec).sort()) {
    const s = spec[id];
    const h = byId[id];
    if (!h) continue;

    if (s.title && normalise(s.title) !== normalise(h.popupTitle)) {
      problems.push(`${id} popupTitle "${h.popupTitle}" != spec "${s.title}"`);
    }

    const specNames = s.fields.map((f) => f.name);
    const mineNames = h.fields.map((f) => f.name);

    for (const n of specNames) {
      if (!mineNames.includes(n)) problems.push(`${id} missing spec field "${n}"`);
    }
    for (const n of mineNames) {
      // Extra fields are allowed but worth surfacing.
      if (!specNames.includes(n)) warn.push(`${id} has field "${n}" not in the spec`);
    }

    // Values: the spec is the source of truth for what the demo says.
    for (const sf of s.fields) {
      const mf = h.fields.find((f) => f.name === sf.name);
      if (!mf) continue;
      const printed =
        typeof mf.value === "number" && mf.decimals != null
          ? mf.value.toFixed(mf.decimals)
          : String(mf.value);
      const mineValue = mf.unit ? `${printed} ${mf.unit}` : printed;
      if (normalise(sf.value) !== normalise(mineValue) && normalise(sf.value) !== normalise(printed)) {
        warn.push(`${id}.${sf.name}: spec "${sf.value}" vs json "${mineValue}"`);
      }
    }
  }

  // ── Cross-hotspot invariants (spec "Hero Container Journey" table) ─────────
  const hero = scene.globals.heroContainerId;
  const HERO_STATE = { H09: "ON VESSEL", H14: "YARD STORAGE", H24: "SCHEDULED" };
  for (const [id, state] of Object.entries(HERO_STATE)) {
    const h = byId[id];
    if (!h) continue;
    const idField = h.fields.find((f) => f.ref === "hero");
    if (!idField) problems.push(`${id} has no field marked ref:"hero"`);
    else if (idField.value !== hero) {
      problems.push(`${id} hero field reads "${idField.value}", expected "${hero}"`);
    }
    const hasState = h.fields.some((f) => normalise(f.value) === normalise(state));
    if (!hasState) problems.push(`${id} does not carry the expected state "${state}"`);
  }

  // ── Cross-hotspot identifier chains ───────────────────────────────────────
  // A `ref` marks a field as naming one of the demo's canonical identifiers.
  // These are the values that TRAVEL between hotspots — the hero container
  // across L03->L04->L06->L08->L09->L10, crane QC-02 from the berth to the
  // executive journey, and so on. If one drifts, the demo tells two different
  // stories about the same object, which is exactly what handoff §2 forbids.
  const canonical = { hero, ...(scene.globals.assets ?? {}) };
  const chains = {};

  for (const h of hotspots) {
    for (const f of h.fields) {
      if (!f.ref) continue;
      const expected = canonical[f.ref];
      if (expected === undefined) {
        problems.push(`${h.id}.${f.name} has ref:"${f.ref}", which scene.globals does not define`);
        continue;
      }
      if (String(f.value) !== String(expected)) {
        problems.push(
          `${h.id}.${f.name} is ref:"${f.ref}" but reads "${f.value}" (expected "${expected}")`,
        );
      }
      (chains[f.ref] ??= new Set()).add(h.id);
    }
  }

  // Every declared identifier has to actually appear somewhere, or it is a
  // stale entry pretending the demo still uses it.
  for (const key of Object.keys(canonical)) {
    if (!chains[key]) problems.push(`scene.globals declares "${key}" but no field references it`);
  }

  // ── Against the handoff document ──────────────────────────────────────────
  // The data-points doc owns the field tables; the handoff owns the prose. Both
  // have to be present and both have to match.
  const handoffXml = readZipEntry(fs.readFileSync(HANDOFF), "word/document.xml").toString("utf8");
  const handoff = parseHandoff(docxLines(handoffXml));

  for (const l of layouts) {
    const h = handoff.layouts[l.id];
    if (!h) {
      problems.push(`${l.id} is missing from the handoff document`);
      continue;
    }
    if (!l.purpose) problems.push(`${l.id} has no purpose`);
    else if (normalise(l.purpose) !== normalise(h.purpose)) {
      problems.push(`${l.id} purpose does not match the handoff`);
    }
    if (normalise(l.name) !== normalise(h.name)) {
      warn.push(`${l.id} name: handoff "${h.name}" vs json "${l.name}"`);
    }
  }

  for (const h of hotspots) {
    const s = handoff.hotspots[h.id];
    if (!s) {
      problems.push(`${h.id} is missing from the handoff document`);
      continue;
    }
    if (!h.interaction) problems.push(`${h.id} has no interaction`);
    else if (normalise(h.interaction) !== normalise(s.interaction)) {
      problems.push(`${h.id} interaction does not match the handoff`);
    }
    if (!h.dataFields) problems.push(`${h.id} has no dataFields summary`);
    else if (normalise(h.dataFields) !== normalise(s.dataFields)) {
      problems.push(`${h.id} dataFields summary does not match the handoff`);
    }
    if (s.layoutId && s.layoutId !== h.layoutId) {
      problems.push(`${h.id} sits under ${h.layoutId}; the handoff puts it under ${s.layoutId}`);
    }
    // The two documents word a couple of names differently (H14, H24); the
    // data-points doc is the one the demo shows, so this is a note, not a fail.
    if (normalise(s.name) !== normalise(h.name)) {
      warn.push(`${h.id} name: handoff "${s.name}" vs json "${h.name}"`);
    }
  }

  // ── Topic coverage ────────────────────────────────────────────────────────
  // The handoff's "Data Fields" column is the TOPIC list — what each popup must
  // show. The data-points document supplies sample values for those topics. So
  // every topic needs a field, and a topic with none is a hole in the demo, not
  // a formatting nit.
  //
  // The two documents name several things differently; those are declared here
  // rather than guessed, so only genuine holes are reported.
  const TOPIC_ALIASES = {
    "crane allocation": ["active_cranes", "assigned_cranes"],
    "container count": ["containers", "containers_in_stack"],
    "exception count": ["exceptions"],
    "current utilization": ["yard_occupancy"],
    recommendation: ["recommended_action"],
    "journey timeline": ["__journey__"],
    "vessel side": ["assigned_vessel"],
    "active status": ["crane_status"],
    warning: ["warning_level"],
    "access rule": ["access_status"],
    rail: ["on_dock_rail", "rail_trains_active"],
    "crane count": ["post_panamax_cranes"],
    "truck/rail": ["truck_id", "rail_option"],
    status: ["status", "vessel_status", "berth_status", "queue_status", "current_status",
             "overall_status", "quay_status", "track_status", "transfer_status",
             "facility_status", "operational_status", "traffic_condition"],
  };

  const words = (s) =>
    String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);

  for (const h of hotspots) {
    if (!h.dataFields) continue;
    const names = h.fields.map((f) => f.name);
    const vocab = new Set(h.fields.flatMap((f) => [...words(f.name), ...words(f.label)]));
    if (h.journey) vocab.add("__journey__");

    for (const topic of h.dataFields.split(/,\s*/).map((t) => t.trim()).filter(Boolean)) {
      const alias = TOPIC_ALIASES[topic.toLowerCase()];
      if (alias) {
        if (alias.some((n) => names.includes(n) || (n === "__journey__" && h.journey))) continue;
      }
      const tw = words(topic).filter((w) => w.length > 2);
      const hit =
        (tw.length > 0 && tw.every((w) => vocab.has(w))) ||
        tw.some((w) => w.length > 3 && vocab.has(w));
      if (!hit) {
        problems.push(
          `${h.id} has no field for the handoff topic "${topic}" — the doc requires it`,
        );
      }
    }
  }

  // Topics present but still awaiting a value from the source documents.
  for (const h of hotspots) {
    for (const f of h.fields) {
      if (f.pending) {
        warn.push(`${h.id}.${f.name} awaits a value — the handoff requires the topic, neither doc supplies one`);
      }
    }
  }

  // ── Handoff §4 shape + §5 visibility ──────────────────────────────────────
  // "Verify every H01-H30 is physically reachable/visible from its parent
  // Layout." One camera per layout serves all of its markers, so this is a
  // real geometric check, not a formality.
  const FOV_HALF = 0.61; // ~35°, inside the canvas camera's 55° vertical FOV
  const eyeHeight = scene.world.eyeHeight;

  for (const l of layouts) {
    if (!l.camera?.position || !l.camera?.target) {
      problems.push(`${l.id} camera must be { position, target } per handoff §4`);
      continue;
    }

    const aerial = l.walkable === false;
    const eye = [
      l.camera.position[0],
      l.camera.position[1] + (aerial ? 0 : eyeHeight),
      l.camera.position[2],
    ];
    const d = [
      l.camera.target[0] - eye[0],
      l.camera.target[1] - eye[1],
      l.camera.target[2] - eye[2],
    ];
    const len = Math.hypot(d[0], d[1], d[2]);
    if (len < 1e-6) {
      problems.push(`${l.id} camera target sits on top of its position`);
      continue;
    }
    const fwd = d.map((v) => v / len);

    for (const hid of l.hotspots) {
      const h = byId[hid];
      if (!h?.position) continue;
      const m = [h.position[0] - eye[0], h.position[1] - eye[1], h.position[2] - eye[2]];
      const mlen = Math.hypot(m[0], m[1], m[2]);
      const dot = (m[0] * fwd[0] + m[1] * fwd[1] + m[2] * fwd[2]) / mlen;
      if (dot <= 0) {
        problems.push(`${hid} is BEHIND ${l.id}'s camera`);
      } else if (Math.acos(Math.min(1, dot)) > FOV_HALF) {
        const deg = Math.round((Math.acos(Math.min(1, dot)) * 180) / Math.PI);
        problems.push(`${hid} is ${deg}° off ${l.id}'s view axis — outside the frame`);
      }
    }
  }

  // A hotspot is a marker, not a viewpoint (handoff §4).
  for (const h of hotspots) {
    if (h.camera) problems.push(`${h.id} carries a camera; hotspots are markers only`);
  }

  // ── scene.globals is the single source of truth ───────────────────────────
  // These constants are mirrored into hotspot fields. Asserting they agree is
  // what stops globals from becoming decorative config nobody maintains.
  const GLOBAL_MIRRORS = [
    ["H01", "vessel_name", scene.globals.vessel.name],
    ["H01", "imo_number", scene.globals.vessel.imo],
    ["H08", "vessel_name", scene.globals.vessel.name],
    ["H08", "imo_number", scene.globals.vessel.imo],
    ["H02", "operator", scene.globals.terminal.operator],
    ["H02", "berths", scene.globals.terminal.berths],
    ["H02", "terminal_area_acres", scene.globals.terminal.areaAcres],
    ["H02", "total_berth_length_ft", scene.globals.terminal.berthLengthFt],
    ["H02", "number_of_berths", scene.globals.terminal.berthCount],
    ["H02", "water_depth_ft", scene.globals.terminal.waterDepthFt],
    ["H02", "post_panamax_cranes", scene.globals.terminal.postPanamaxCranes],
    ["H02", "reefer_plugs", scene.globals.terminal.reeferPlugs],
    ["H02", "on_dock_rail", scene.globals.terminal.onDockRail],
    ["H02", "amp_available", scene.globals.terminal.ampAvailable],
    ["H26", "terminal_area_acres", scene.globals.terminal.areaAcres],
    ["H26", "berths", scene.globals.terminal.berths],
    ["H26", "berth_count", scene.globals.terminal.berthCount],
    ["H26", "total_berth_length_ft", scene.globals.terminal.berthLengthFt],
    ["H26", "water_depth_ft", scene.globals.terminal.waterDepthFt],
    ["H26", "post_panamax_cranes", scene.globals.terminal.postPanamaxCranes],
    ["H26", "reefer_plugs", scene.globals.terminal.reeferPlugs],
  ];
  for (const [id, name, expected] of GLOBAL_MIRRORS) {
    const h = byId[id];
    if (!h) continue;
    const f = h.fields.find((x) => x.name === name);
    if (!f) {
      problems.push(`${id} has no field "${name}" to mirror scene.globals`);
    } else if (normalise(f.value) !== normalise(expected)) {
      problems.push(
        `${id}.${name} is "${f.value}" but scene.globals says "${expected}"`,
      );
    }
  }

  // L09 must never be described as Everport-only (handoff §3, §5).
  const l09 = layouts.find((l) => l.id === "L09");
  if (l09 && !/TICTF/i.test(l09.name)) {
    problems.push("L09 name must identify the shared TICTF facility");
  }

  // ── Report ─────────────────────────────────────────────────────────────────
  const specFieldCount = Object.values(spec).reduce((a, v) => a + v.fields.length, 0);
  const jsonFieldCount = hotspots.reduce((a, h) => a + h.fields.length, 0);

  console.log(`data points doc: ${Object.keys(spec).length} hotspots, ${specFieldCount} fields`);
  console.log(`handoff doc:     ${Object.keys(handoff.layouts).length} layouts, ${Object.keys(handoff.hotspots).length} hotspots`);
  console.log(`json:            ${layouts.length} layouts, ${hotspots.length} hotspots, ${jsonFieldCount} fields`);

  const chainRows = Object.entries(chains).sort((a, b) => b[1].size - a[1].size);
  console.log(`
identifier chains (values that travel between hotspots):`);
  for (const [key, ids] of chainRows) {
    const where = [...ids].sort();
    console.log(`  ${key.padEnd(11)} ${String(canonical[key]).padEnd(14)} ${where.join(" ")}`);
  }

  if (warn.length) {
    console.log(`\n${warn.length} note(s):`);
    for (const w of warn) console.log("  ·", w);
  }

  if (problems.length) {
    console.log(`\n${problems.length} PROBLEM(S):`);
    for (const p of problems) console.log("  ✗", p);
    process.exitCode = 1;
  } else {
    console.log("\n✓ all layouts and hotspots match the spec document");
  }
}

// Exported so other scripts can read the spec documents without duplicating
// the zip + document.xml walk.
module.exports = { readZipEntry, docxLines, parseSpec };

if (require.main === module) main();
