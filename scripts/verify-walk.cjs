/**
 * verify-walk — can the player actually WALK between the ground layout cameras?
 *
 * The travel rows offer a walk only when both ends sit on the navmesh, but
 * "on the navmesh" is not the same as "reachable": a camera can stand on an
 * island of mesh with no route to the rest. This resolves every ground-to-
 * ground pair and fails loudly if any of them cannot be walked, so a re-author
 * that strands a pose is caught here rather than by a boot icon that does
 * nothing when tapped.
 *
 * Aerial cameras are excluded by definition — they teleport.
 */
const fs = require("fs");
const path = require("path");
const THREE = require("three");
const { Pathfinding } = require("three-pathfinding");

const ROOT = path.join(__dirname, "..");
const scene = JSON.parse(fs.readFileSync(path.join(ROOT, "src/config/scene.json"), "utf8"));
const layouts = JSON.parse(fs.readFileSync(path.join(ROOT, "src/config/layouts.json"), "utf8")).layouts;

function parseGLB(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 12, json = null, bin = null;
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString("utf8"));
    else if (type === 0x004e4942) bin = data;
    off += 8 + len;
  }
  return { json, bin };
}

const { json, bin } = parseGLB(fs.readFileSync(path.join(ROOT, "public", scene.assets.navmeshUrl)));
const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
const readAcc = (i, comps) => {
  const acc = json.accessors[i], view = json.bufferViews[acc.bufferView];
  const base = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const out = [];
  const size = acc.componentType === 5126 ? 4 : acc.componentType === 5125 ? 4 : 2;
  const stride = view.byteStride || size * comps;
  for (let n = 0; n < acc.count; n++)
    for (let c = 0; c < comps; c++) {
      const o = base + n * stride + c * size;
      out.push(acc.componentType === 5126 ? dv.getFloat32(o, true)
        : acc.componentType === 5125 ? dv.getUint32(o, true) : dv.getUint16(o, true));
    }
  return out;
};

const pos = [], idx = [];
for (const node of json.nodes) {
  if (node.mesh == null) continue;
  const t = node.translation || [0, 0, 0];
  for (const prim of json.meshes[node.mesh].primitives) {
    const off = pos.length / 3;
    const p = readAcc(prim.attributes.POSITION, 3);
    for (let i = 0; i < p.length; i += 3) pos.push(p[i] + t[0], p[i + 1] + t[1], p[i + 2] + t[2]);
    for (const v of readAcc(prim.indices, 1)) idx.push(v + off);
  }
}

const geom = new THREE.BufferGeometry();
geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
geom.setIndex(idx);

const pf = new Pathfinding();
pf.setZoneData("level", Pathfinding.createZone(geom));
console.log(`navmesh: ${pos.length / 3} verts, ${idx.length / 3} tris, ${pf.zones.level.groups.length} group(s)\n`);

const ground = layouts.filter((l) => l.walkable !== false);
const fly = layouts.filter((l) => l.walkable === false);
console.log(`fly cameras (teleport-only): ${fly.map((l) => l.id).join(", ")}`);
console.log(`ground cameras (walkable):   ${ground.map((l) => l.id).join(", ")}\n`);

let ok = 0; const fail = [];
for (const a of ground) for (const b of ground) {
  if (a.id === b.id) continue;
  const va = new THREE.Vector3(...a.camera.position);
  const vb = new THREE.Vector3(...b.camera.position);
  const ga = pf.getGroup("level", va, true);
  const node = ga != null ? pf.getClosestNode(va, "level", ga, true) : null;
  const p = node ? pf.findPath(node.centroid, vb, "level", ga) : null;
  if (p && p.length) ok++; else fail.push(`${a.id}->${b.id}`);
}
const total = ground.length * (ground.length - 1);
console.log(`walk routes: ${ok}/${total} resolve`);
if (fail.length) console.log("  FAILED: " + fail.join(", "));

if (fail.length) process.exit(1);
console.log();
console.log(String.fromCharCode(10003) + ' every ground layout can be walked to from every other');
