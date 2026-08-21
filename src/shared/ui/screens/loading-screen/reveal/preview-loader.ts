import * as THREE from 'three';

/**
 * Decoder for the .preview.bin format produced by holotwin-bake.cjs.
 *
 * Format (LE):
 *   Header (16): "HTWN" | uint32 version=1 | uint32 pointCount | uint32 flags=0
 *   Bounds (24): float32 minX,minY,minZ,maxX,maxY,maxZ
 *   Points  (8 per): uint16[3] quantized pos | int8[2] octahedral normal
 */

export interface PreviewBin {
  geometry: THREE.BufferGeometry;
  pointCount: number;
  bounds: { min: THREE.Vector3; max: THREE.Vector3 };
}

export async function loadPreviewBin(url: string): Promise<PreviewBin> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`preview fetch failed: ${res.status}`);
  return parsePreviewBin(await res.arrayBuffer());
}

export function parsePreviewBin(buf: ArrayBuffer): PreviewBin {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'HTWN') throw new Error('Invalid preview.bin (bad magic)');
  const version = dv.getUint32(4, true);
  if (version !== 1) throw new Error(`Unsupported preview version ${version}`);
  const count = dv.getUint32(8, true);

  const minX = dv.getFloat32(16, true), minY = dv.getFloat32(20, true), minZ = dv.getFloat32(24, true);
  const maxX = dv.getFloat32(28, true), maxY = dv.getFloat32(32, true), maxZ = dv.getFloat32(36, true);
  const rX = (maxX - minX) || 1, rY = (maxY - minY) || 1, rZ = (maxZ - minZ) || 1;

  const positions = new Float32Array(count * 3);
  const normals   = new Float32Array(count * 3);
  let off = 40;
  for (let i = 0; i < count; i++) {
    positions[i * 3]     = (dv.getUint16(off,     true) / 65535) * rX + minX;
    positions[i * 3 + 1] = (dv.getUint16(off + 2, true) / 65535) * rY + minY;
    positions[i * 3 + 2] = (dv.getUint16(off + 4, true) / 65535) * rZ + minZ;
    const ex = dv.getInt8(off + 6) / 127;
    const ey = dv.getInt8(off + 7) / 127;
    const [nx, ny, nz] = octDecode(ex, ey);
    normals[i * 3]     = nx;
    normals[i * 3 + 1] = ny;
    normals[i * 3 + 2] = nz;
    off += 8;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aNormal',  new THREE.Float32BufferAttribute(normals, 3));
  return {
    geometry,
    pointCount: count,
    bounds: {
      min: new THREE.Vector3(minX, minY, minZ),
      max: new THREE.Vector3(maxX, maxY, maxZ),
    },
  };
}

/**
 * Concatenate several PreviewBin parts into one — used to unify multi-floor
 * previews so they reveal/crossfade as a single point cloud sharing one
 * material (one uTime, one uReveal). Bounds are the union of all parts.
 *
 * Parts must already be in the same world coordinate space (the baker
 * preserves the source GLB's world transform, so stacked floors line up).
 */
export function mergePreviews(parts: PreviewBin[]): PreviewBin {
  if (parts.length === 0) throw new Error('mergePreviews: no parts');
  if (parts.length === 1) return parts[0];

  let totalCount = 0;
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of parts) {
    totalCount += p.pointCount;
    min.min(p.bounds.min);
    max.max(p.bounds.max);
  }

  const positions = new Float32Array(totalCount * 3);
  const normals   = new Float32Array(totalCount * 3);
  let off = 0;
  for (const p of parts) {
    const pos  = (p.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    const norm = (p.geometry.getAttribute('aNormal')  as THREE.BufferAttribute).array as Float32Array;
    positions.set(pos, off);
    normals.set(norm,  off);
    off += p.pointCount * 3;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aNormal',  new THREE.Float32BufferAttribute(normals, 3));

  return { geometry, pointCount: totalCount, bounds: { min, max } };
}

function octDecode(ex: number, ey: number): [number, number, number] {
  let nz = 1 - Math.abs(ex) - Math.abs(ey);
  let nx = ex, ny = ey;
  if (nz < 0) {
    const tx = (1 - Math.abs(ny)) * (nx >= 0 ? 1 : -1);
    const ty = (1 - Math.abs(nx)) * (ny >= 0 ? 1 : -1);
    nx = tx; ny = ty;
  }
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  return [nx / len, ny / len, nz / len];
}
