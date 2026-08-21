#!/usr/bin/env node
/**
 * holotwin-bake — produces a `<name>.preview.bin` point-cloud sidecar from
 * a binary GLB. Ported from ARCHVIZ_WITH_EXTERIOR with KHR_draco_mesh_compression
 * support added (this project's GLBs are Draco-compressed; positions decode
 * via the `draco3d` package already in node_modules).
 *
 * Usage:  node scripts/holotwin-bake.cjs path/to/model.glb [pointCount=30000]
 *
 * Format (LE) — decoded by src/.../loading-screen/utils/core/previewLoader.ts:
 *   Header (16): "HTWN" | uint32 version=1 | uint32 pointCount | uint32 flags=0
 *   Bounds (24): float32 minX,minY,minZ,maxX,maxY,maxZ
 *   Points  (8 per): uint16[3] quantized pos | int8[2] octahedral normal
 */
'use strict';
const fs = require('fs');
const path = require('path');

const COMP = {
  5120: { Ctor: Int8Array,    bytes: 1 },
  5121: { Ctor: Uint8Array,   bytes: 1 },
  5122: { Ctor: Int16Array,   bytes: 2 },
  5123: { Ctor: Uint16Array,  bytes: 2 },
  5125: { Ctor: Uint32Array,  bytes: 4 },
  5126: { Ctor: Float32Array, bytes: 4 },
};
const TYPE_N = { SCALAR:1, VEC2:2, VEC3:3, VEC4:4, MAT2:4, MAT3:9, MAT4:16 };

function parseGLB(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('Not a binary GLB');
  if (dv.getUint32(4, true) !== 2) throw new Error('Unsupported GLB version');
  let off = 12, json = null, bin = null;
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const data = buf.subarray(off + 8, off + 8 + len);
    if      (type === 0x4E4F534A) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004E4942) bin  = data;
    off += 8 + len;
  }
  if (!json) throw new Error('Missing JSON chunk');
  return { json, bin };
}

// glTF normalized integer → float divisors (per spec §3.6.2.2)
const NORM_DIV = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535, 5125: 4294967295 };

function applyNormalization(raw, componentType) {
  const div = NORM_DIV[componentType];
  if (!div) return raw; // float32 — no-op
  const out = new Float32Array(raw.length);
  const signed = componentType === 5120 || componentType === 5122; // Int8, Int16
  for (let i = 0; i < raw.length; i++) {
    out[i] = signed ? Math.max(-1.0, raw[i] / div) : raw[i] / div;
  }
  return out;
}

function readAccessor(gltf, bin, idx) {
  const acc = gltf.accessors[idx];
  if (acc.sparse) throw new Error(`Accessor ${idx}: sparse accessors not supported`);
  if (acc.bufferView == null) {
    return new Float32Array(acc.count * TYPE_N[acc.type]);
  }
  const view = gltf.bufferViews[acc.bufferView];
  const ct = COMP[acc.componentType];
  const n  = TYPE_N[acc.type];
  const elBytes = ct.bytes * n;
  if ((view.buffer || 0) !== 0) {
    throw new Error(`Accessor ${idx}: references buffer ${view.buffer}, only buffer 0 is available`);
  }
  const stride = view.byteStride || elBytes;
  const base   = (view.byteOffset || 0) + (acc.byteOffset || 0);
  let raw;
  if (stride === elBytes) {
    raw = new ct.Ctor(bin.buffer.slice(bin.byteOffset + base, bin.byteOffset + base + acc.count * elBytes));
  } else {
    const readerName =
      ct.Ctor === Float32Array ? 'getFloat32' :
      ct.Ctor === Uint16Array  ? 'getUint16'  :
      ct.Ctor === Uint32Array  ? 'getUint32'  :
      ct.Ctor === Int16Array   ? 'getInt16'   :
      ct.Ctor === Int8Array    ? 'getInt8'    : 'getUint8';
    raw = new ct.Ctor(acc.count * n);
    const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
    for (let i = 0; i < acc.count; i++) {
      for (let c = 0; c < n; c++) {
        raw[i * n + c] = dv[readerName](base + i * stride + c * ct.bytes, true);
      }
    }
  }
  return acc.normalized ? applyNormalization(raw, acc.componentType) : raw;
}

// ── Draco (KHR_draco_mesh_compression) ───────────────────────────────────────
// Decodes the primitive's compressed bufferView and returns float positions +
// triangle indices. GetAttributeFloatForAllPoints dequantizes Draco's internal
// quantization; if the glTF POSITION accessor is itself a normalized integer
// type (KHR_mesh_quantization), the decoded values are normalized the same way
// the plain-accessor path does it (the de-normalizing scale lives in the node
// transform, which collectTris applies).
function decodeDraco(gltf, bin, prim, decoderModule) {
  const ext = prim.extensions.KHR_draco_mesh_compression;
  const view = gltf.bufferViews[ext.bufferView];
  const bytes = bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);

  const decoder = new decoderModule.Decoder();
  const dbuf = new decoderModule.DecoderBuffer();
  dbuf.Init(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), bytes.byteLength);
  try {
    if (decoder.GetEncodedGeometryType(dbuf) !== decoderModule.TRIANGULAR_MESH) {
      throw new Error('not a triangular mesh');
    }
    const mesh = new decoderModule.Mesh();
    const status = decoder.DecodeBufferToMesh(dbuf, mesh);
    if (!status.ok() || mesh.ptr === 0) throw new Error(`decode failed: ${status.error_msg()}`);

    const attr = decoder.GetAttributeByUniqueId(mesh, ext.attributes.POSITION);
    const numPoints = mesh.num_points();
    const fa = new decoderModule.DracoFloat32Array();
    decoder.GetAttributeFloatForAllPoints(mesh, attr, fa);
    let pos = new Float32Array(numPoints * 3);
    for (let i = 0; i < numPoints * 3; i++) pos[i] = fa.GetValue(i);
    decoderModule.destroy(fa);

    const posAccessor = gltf.accessors[prim.attributes.POSITION];
    if (posAccessor.normalized) pos = applyNormalization(pos, posAccessor.componentType);

    const numFaces = mesh.num_faces();
    const ind = new Uint32Array(numFaces * 3);
    const ia = new decoderModule.DracoInt32Array();
    for (let f = 0; f < numFaces; f++) {
      decoder.GetFaceFromMesh(mesh, f, ia);
      ind[f * 3]     = ia.GetValue(0);
      ind[f * 3 + 1] = ia.GetValue(1);
      ind[f * 3 + 2] = ia.GetValue(2);
    }
    decoderModule.destroy(ia);
    decoderModule.destroy(mesh);
    return { pos, ind };
  } finally {
    decoderModule.destroy(dbuf);
    decoderModule.destroy(decoder);
  }
}

// mat4 (column-major)
function mIdent() { const m=new Float64Array(16); m[0]=m[5]=m[10]=m[15]=1; return m; }
function mTRS(t=[0,0,0], r=[0,0,0,1], s=[1,1,1]) {
  const [x,y,z,w]=r, x2=x+x,y2=y+y,z2=z+z;
  const xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2;
  const wx=w*x2,wy=w*y2,wz=w*z2;
  const m=new Float64Array(16);
  m[0]=(1-(yy+zz))*s[0]; m[1]=(xy+wz)*s[0]; m[2]=(xz-wy)*s[0]; m[3]=0;
  m[4]=(xy-wz)*s[1]; m[5]=(1-(xx+zz))*s[1]; m[6]=(yz+wx)*s[1]; m[7]=0;
  m[8]=(xz+wy)*s[2]; m[9]=(yz-wx)*s[2]; m[10]=(1-(xx+yy))*s[2]; m[11]=0;
  m[12]=t[0]; m[13]=t[1]; m[14]=t[2]; m[15]=1;
  return m;
}
function mFromArr(a){ const m=new Float64Array(16); for(let i=0;i<16;i++) m[i]=a[i]; return m; }
function mMul(a,b){
  const o=new Float64Array(16);
  for(let i=0;i<4;i++) for(let j=0;j<4;j++){
    let s=0; for(let k=0;k<4;k++) s+=a[i+k*4]*b[k+j*4];
    o[i+j*4]=s;
  }
  return o;
}
function tVec(m,x,y,z){
  const w=m[3]*x+m[7]*y+m[11]*z+m[15];
  return [(m[0]*x+m[4]*y+m[8]*z+m[12])/w,(m[1]*x+m[5]*y+m[9]*z+m[13])/w,(m[2]*x+m[6]*y+m[10]*z+m[14])/w];
}
function nodeMat(n){ return n.matrix ? mFromArr(n.matrix) : mTRS(n.translation, n.rotation, n.scale); }

function collectTris(gltf, bin, decoderModule) {
  const tris = [];
  let skipped = 0;
  const scene = gltf.scenes[gltf.scene || 0];

  const visit = (idx, parent) => {
    const node = gltf.nodes[idx];
    const world = mMul(parent, nodeMat(node));

    if (node.mesh != null) {
      for (const prim of gltf.meshes[node.mesh].primitives) {
        if (prim.mode != null && prim.mode !== 4) continue;
        if (prim.attributes.POSITION == null) continue;

        try {
          let pos, ind;
          if (prim.extensions?.KHR_draco_mesh_compression) {
            ({ pos, ind } = decodeDraco(gltf, bin, prim, decoderModule));
          } else {
            pos = readAccessor(gltf, bin, prim.attributes.POSITION);
            ind = prim.indices != null ? readAccessor(gltf, bin, prim.indices) : null;
          }
          const triCount = ind ? ind.length / 3 : pos.length / 9;
          for (let i = 0; i < triCount; i++) {
            const a = ind ? ind[i*3]   : i*3;
            const b = ind ? ind[i*3+1] : i*3+1;
            const c = ind ? ind[i*3+2] : i*3+2;
            tris.push([
              tVec(world, pos[a*3], pos[a*3+1], pos[a*3+2]),
              tVec(world, pos[b*3], pos[b*3+1], pos[b*3+2]),
              tVec(world, pos[c*3], pos[c*3+1], pos[c*3+2]),
            ]);
          }
        } catch (e) {
          skipped++;
          if (skipped <= 10) console.warn(`[bake] skipping primitive in mesh ${node.mesh}: ${e.message}`);
        }
      }
    }

    if (node.children) for (const c of node.children) visit(c, world);
  };

  for (const r of scene.nodes) visit(r, mIdent());
  if (skipped > 0) console.warn(`[bake] skipped ${skipped} primitives due to accessor errors`);
  return tris;
}

function triArea([a,b,c]) {
  const ax=b[0]-a[0],ay=b[1]-a[1],az=b[2]-a[2];
  const bx=c[0]-a[0],by=c[1]-a[1],bz=c[2]-a[2];
  const cx=ay*bz-az*by, cy=az*bx-ax*bz, cz=ax*by-ay*bx;
  return 0.5*Math.sqrt(cx*cx+cy*cy+cz*cz);
}
function faceN([a,b,c]) {
  const ax=b[0]-a[0],ay=b[1]-a[1],az=b[2]-a[2];
  const bx=c[0]-a[0],by=c[1]-a[1],bz=c[2]-a[2];
  let nx=ay*bz-az*by, ny=az*bx-ax*bz, nz=ax*by-ay*bx;
  const l=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
  return [nx/l, ny/l, nz/l];
}

function sample(tris, count) {
  let total = 0;
  const cdf = new Float64Array(tris.length);
  for (let i = 0; i < tris.length; i++) { total += triArea(tris[i]); cdf[i] = total; }
  if (total === 0) throw new Error('zero surface area');
  const points = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = Math.random() * total;
    let lo = 0, hi = cdf.length - 1;
    while (lo < hi) { const m = (lo+hi)>>1; if (cdf[m] < r) lo = m+1; else hi = m; }
    const tri = tris[lo];
    let u = Math.random(), v = Math.random();
    if (u + v > 1) { u = 1-u; v = 1-v; }
    const w = 1 - u - v;
    points[i*3]   = tri[0][0]*w + tri[1][0]*u + tri[2][0]*v;
    points[i*3+1] = tri[0][1]*w + tri[1][1]*u + tri[2][1]*v;
    points[i*3+2] = tri[0][2]*w + tri[1][2]*u + tri[2][2]*v;
    const n = faceN(tri);
    normals[i*3]   = n[0];
    normals[i*3+1] = n[1];
    normals[i*3+2] = n[2];
  }
  return { points, normals };
}

function octEncode(nx, ny, nz) {
  const norm = Math.abs(nx) + Math.abs(ny) + Math.abs(nz) || 1;
  let ox = nx / norm, oy = ny / norm;
  if (nz < 0) {
    const tx = (1 - Math.abs(oy)) * (ox >= 0 ? 1 : -1);
    const ty = (1 - Math.abs(ox)) * (oy >= 0 ? 1 : -1);
    ox = tx; oy = ty;
  }
  return [
    Math.max(-127, Math.min(127, Math.round(ox * 127))),
    Math.max(-127, Math.min(127, Math.round(oy * 127))),
  ];
}

function writeBin(outPath, points, normals) {
  const count = points.length / 3;
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  for (let i = 0; i < count; i++) {
    const x = points[i*3], y = points[i*3+1], z = points[i*3+2];
    if (x<minX) minX=x; if (x>maxX) maxX=x;
    if (y<minY) minY=y; if (y>maxY) maxY=y;
    if (z<minZ) minZ=z; if (z>maxZ) maxZ=z;
  }
  const rX = (maxX-minX)||1, rY = (maxY-minY)||1, rZ = (maxZ-minZ)||1;
  const out = Buffer.alloc(40 + count * 8);
  out.write('HTWN', 0, 4, 'ascii');
  out.writeUInt32LE(1, 4);
  out.writeUInt32LE(count, 8);
  out.writeUInt32LE(0, 12);
  out.writeFloatLE(minX,16); out.writeFloatLE(minY,20); out.writeFloatLE(minZ,24);
  out.writeFloatLE(maxX,28); out.writeFloatLE(maxY,32); out.writeFloatLE(maxZ,36);
  let off = 40;
  for (let i = 0; i < count; i++) {
    const x = points[i*3], y = points[i*3+1], z = points[i*3+2];
    out.writeUInt16LE(Math.max(0, Math.min(65535, Math.round(((x-minX)/rX)*65535))), off);
    out.writeUInt16LE(Math.max(0, Math.min(65535, Math.round(((y-minY)/rY)*65535))), off+2);
    out.writeUInt16LE(Math.max(0, Math.min(65535, Math.round(((z-minZ)/rZ)*65535))), off+4);
    const [ex, ey] = octEncode(normals[i*3], normals[i*3+1], normals[i*3+2]);
    out.writeInt8(ex, off+6);
    out.writeInt8(ey, off+7);
    off += 8;
  }
  fs.writeFileSync(outPath, out);
  return out.length;
}

(async () => {
  const inFile = process.argv[2];
  const pointCount = parseInt(process.argv[3] || '30000', 10);
  if (!inFile) { console.error('usage: node scripts/holotwin-bake.cjs <input.glb> [pointCount=30000]'); process.exit(1); }
  const abs = path.resolve(inFile);
  console.log(`[bake] reading ${abs}`);
  const buf = fs.readFileSync(abs);
  const { json, bin } = parseGLB(buf);
  console.log(`[bake] glTF: ${json.meshes?.length || 0} meshes, ${json.nodes?.length || 0} nodes`);

  let decoderModule = null;
  if (json.extensionsUsed?.includes('KHR_draco_mesh_compression')) {
    const draco3d = require('draco3d');
    decoderModule = await draco3d.createDecoderModule({});
    console.log('[bake] draco decoder ready');
  }

  const tris = collectTris(json, bin, decoderModule);
  console.log(`[bake] collected ${tris.length} triangles`);
  const { points, normals } = sample(tris, pointCount);
  console.log(`[bake] sampled ${pointCount} points`);
  const out = abs.replace(/\.glb$/i, '.preview.bin');
  const bytes = writeBin(out, points, normals);
  // Sanity: report bounds so a bad bake (e.g. undecoded compression) is obvious.
  let mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];
  for (let i=0;i<points.length;i+=3) for (let c=0;c<3;c++){
    if (points[i+c]<mn[c]) mn[c]=points[i+c];
    if (points[i+c]>mx[c]) mx[c]=points[i+c];
  }
  console.log(`[bake] bounds min [${mn.map(v=>v.toFixed(1))}] max [${mx.map(v=>v.toFixed(1))}]`);
  console.log(`[bake] wrote ${out} (${(bytes/1024).toFixed(1)} KB)`);
})();
