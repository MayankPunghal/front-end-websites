// Path-traces the room's light into per-vertex data: run `node tools/bake-room.ts` after changing room.ts.
// Output: public/sunrooof/bake/{hi,lo}.bin. Channel A is light from the SUNROOOF panel (direct plus two bounces, RGB).
// Channel B is the dim light entering from the open front of the room (used before the panel switches on).
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import fs from 'node:fs';
import { buildRoom, PALETTE, PANEL, SIDE, WINDOW, type Key, type Mount } from '../src/sites/sunrooof/three/room.ts';

const HI = +(process.env.HI || 0.1), LO = 0.4, OUT = 'public/sunrooof/bake';
fs.mkdirSync(OUT, { recursive: true });

function bake(d: number, panelRays: number, gather: number, mount: Mount) {
  const t0 = Date.now(), parts = buildRoom(d, mount), onWall = mount === 'wall', onSide = mount === 'side', em = onSide ? SIDE : PANEL;
  const merged = mergeGeometries(parts.map(p => { const g = p.geo.clone(); g.deleteAttribute('uv'); return g; }), false)!;
  const N = merged.attributes.position.count, P = merged.attributes.position.array as Float32Array, Nn = merged.attributes.normal.array as Float32Array;
  const alb = new Float32Array(N * 3); let o = 0;
  for (const p of parts) { const c = new THREE.Color(PALETTE[p.key as Key]); for (let i = 0; i < p.geo.attributes.position.count; i++, o++) alb.set([c.r, c.g, c.b], o * 3); }
  const bvh = new MeshBVH(merged, { maxLeafTris: 8, strategy: 0 });
  const idx = merged.index!.array;
  console.log(`d=${d}: ${N} vertices, ${idx.length / 3} triangles`);

  const ray = new THREE.Ray(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), bary = new THREE.Vector3(), tri = new THREE.Triangle();
  const trace = (x: number, y: number, z: number, dx: number, dy: number, dz: number, far = Infinity) => { ray.origin.set(x, y, z); ray.direction.set(dx, dy, dz); return bvh.raycastFirst(ray, THREE.DoubleSide, 0, far) as THREE.Intersection | null; };
  // cosine-weighted direction around n
  const cosDir = (nx: number, ny: number, nz: number, u: number, v: number, out: number[]) => {
    const r = Math.sqrt(u), t = 2 * Math.PI * v, lx = r * Math.cos(t), ly = r * Math.sin(t), lz = Math.sqrt(Math.max(0, 1 - u));
    const sg = nz >= 0 ? 1 : -1, k = -1 / (sg + nz), m = nx * ny * k;
    out[0] = lx * (1 + sg * nx * nx * k) + ly * m + lz * nx;
    out[1] = lx * sg * m + ly * (sg + ny * ny * k) + lz * ny;
    out[2] = -lx * sg * nx - ly * ny + lz * nz;
    const l = Math.hypot(out[0], out[1], out[2]) || 1; out[0] /= l; out[1] /= l; out[2] /= l;
  };

  // smooth the noisy bounce light across connected vertices; direct light keeps its shadow edges
  const smooth = (v: Float32Array, ch: number, iter: number) => {
    for (let it = 0; it < iter; it++) {
      const sum = new Float32Array(v.length), cnt = new Uint16Array(N);
      for (let i = 0; i < idx.length; i += 3) for (let e = 0; e < 3; e++) { const p = idx[i + e], q = idx[i + (e + 1) % 3]; for (let k = 0; k < ch; k++) { sum[p * ch + k] += v[q * ch + k]; sum[q * ch + k] += v[p * ch + k]; } cnt[p]++; cnt[q]++; }
      for (let i = 0; i < N; i++) if (cnt[i]) for (let k = 0; k < ch; k++) v[i * ch + k] = v[i * ch + k] * 0.4 + sum[i * ch + k] / cnt[i] * 0.6;
    }
  };

  const sampleAt = (hit: THREE.Intersection, src: Float32Array, ch: number, out: number[]) => {
    const f = hit.face!; a.fromArray(P, f.a * 3); b.fromArray(P, f.b * 3); c.fromArray(P, f.c * 3);
    tri.set(a, b, c).getBarycoord(hit.point, bary);
    for (let k = 0; k < ch; k++) out[k] = src[f.a * ch + k] * bary.x + src[f.b * ch + k] * bary.y + src[f.c * ch + k] * bary.z;
    return f;
  };

  // Vertices buried inside another object read black and would bleed into their neighbours as dark seams, so they borrow light from visible ones.
  const back = new Uint16Array(N);
  const fill = (v: Float32Array, ch: number) => {
    const known = new Uint8Array(N); for (let i = 0; i < N; i++) known[i] = back[i] > buriedAt ? 0 : 1;
    for (let it = 0; it < 8; it++) {
      const sum = new Float32Array(v.length), cnt = new Uint16Array(N);
      for (let i = 0; i < idx.length; i += 3) for (let e = 0; e < 3; e++) for (const [p, q] of [[idx[i + e], idx[i + (e + 1) % 3]], [idx[i + (e + 1) % 3], idx[i + e]]]) if (!known[p] && known[q]) { for (let k = 0; k < ch; k++) sum[p * ch + k] += v[q * ch + k]; cnt[p]++; }
      for (let i = 0; i < N; i++) if (cnt[i]) { for (let k = 0; k < ch; k++) v[i * ch + k] = sum[i * ch + k] / cnt[i]; known[i] = 1; }
    }
  };

  // A0: direct light from the panel, stratified over its area
  const E0 = new Float32Array(N), area = em.w * em.d, rows = Math.ceil(Math.sqrt(panelRays));
  let rng = 12345; const rnd = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };
  for (let i = 0; i < N; i++) {
    const x = P[i * 3] + Nn[i * 3] * 2e-3, y = P[i * 3 + 1] + Nn[i * 3 + 1] * 2e-3, z = P[i * 3 + 2] + Nn[i * 3 + 2] * 2e-3; let e = 0;
    for (let r = 0; r < rows; r++) for (let s = 0; s < rows; s++) {
      const lx = ((r + rnd()) / rows - 0.5) * em.w, off = ((s + rnd()) / rows - 0.5) * em.d, dx = (onSide ? SIDE.x : lx) - x, dy = (onWall ? WINDOW.y + off : onSide ? SIDE.y + off : PANEL.y) - y, dz = (onWall ? WINDOW.z : onSide ? SIDE.z + lx : PANEL.z + off) - z, d2 = dx * dx + dy * dy + dz * dz, len = Math.sqrt(d2);
      const cr = (dx * Nn[i * 3] + dy * Nn[i * 3 + 1] + dz * Nn[i * 3 + 2]) / len, ce = (onWall ? -dz : onSide ? dx : dy) / len;
      if (cr <= 0 || ce <= 0) continue;
      const hit = trace(x, y, z, dx / len, dy / len, dz / len); if (!hit || hit.distance > len - 0.01) e += cr * ce / Math.max(d2, 0.02);
    }
    E0[i] = e * area / (rows * rows) / Math.PI;
    if (i % 60000 === 0) console.log(`  direct ${i}/${N} ${Math.round((Date.now() - t0) / 1000)}s`);
  }

  // A1, A2: gather bounced light (RGB). B: light from the open front, plus one bounce.
  const dir = [0, 0, 0], val = [0, 0, 0];
  const A = new Float32Array(N * 3), last = new Float32Array(N * 3), B0 = new Float32Array(N), B1 = new Float32Array(N);
  for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) { A[i * 3 + k] = E0[i]; last[i * 3 + k] = E0[i]; }
  const grows = Math.ceil(Math.sqrt(gather)), buriedAt = grows * grows * 0.35;
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const x = P[i * 3] + Nn[i * 3] * 2e-3, y = P[i * 3 + 1] + Nn[i * 3 + 1] * 2e-3, z = P[i * 3 + 2] + Nn[i * 3 + 2] * 2e-3;
      let r = 0, g = 0, bl = 0, front = 0;
      for (let u = 0; u < grows; u++) for (let v = 0; v < grows; v++) {
        cosDir(Nn[i * 3], Nn[i * 3 + 1], Nn[i * 3 + 2], (u + rnd()) / grows, (v + rnd()) / grows, dir);
        const hit = trace(x, y, z, dir[0], dir[1], dir[2]);
        if (!hit) { if (pass === 0 && dir[2] > 0) front += Math.min(1, dir[2] * 1.4); continue; }
        const f = sampleAt(hit, last, 3, val);
        if (pass === 0 && dir[0] * Nn[f.a * 3] + dir[1] * Nn[f.a * 3 + 1] + dir[2] * Nn[f.a * 3 + 2] > 0) back[i]++;
        r += val[0] * alb[f.a * 3]; g += val[1] * alb[f.a * 3 + 1]; bl += val[2] * alb[f.a * 3 + 2];
      }
      const n = grows * grows; next[i * 3] = r / n; next[i * 3 + 1] = g / n; next[i * 3 + 2] = bl / n; if (pass === 0) B0[i] = front / n;
      if (i % 60000 === 0) console.log(`  bounce ${pass + 1} ${i}/${N} ${Math.round((Date.now() - t0) / 1000)}s`);
    }
    fill(next, 3); smooth(next, 3, d < 0.2 ? 5 : 1); if (pass === 0) { fill(B0, 1); smooth(B0, 1, d < 0.2 ? 3 : 1); }
    for (let i = 0; i < A.length; i++) { A[i] += next[i]; last[i] = next[i]; }
  }
  for (let i = 0; i < N; i++) {
    const x = P[i * 3] + Nn[i * 3] * 2e-3, y = P[i * 3 + 1] + Nn[i * 3 + 1] * 2e-3, z = P[i * 3 + 2] + Nn[i * 3 + 2] * 2e-3; let s = 0;
    for (let u = 0; u < 5; u++) for (let v = 0; v < 5; v++) { cosDir(Nn[i * 3], Nn[i * 3 + 1], Nn[i * 3 + 2], (u + rnd()) / 5, (v + rnd()) / 5, dir); const hit = trace(x, y, z, dir[0], dir[1], dir[2]); if (hit) { const f = sampleAt(hit, B0, 1, val); s += val[0] * (alb[f.a * 3] + alb[f.a * 3 + 1] + alb[f.a * 3 + 2]) / 3; } }
    B1[i] = B0[i] + s / 25;
  }
  fill(A, 3); fill(B1, 1); smooth(B1, 1, d < 0.2 ? 30 : 2); // this light is dim and flat, so noise in it shows as blotches on the walls
  console.log(`  done in ${Math.round((Date.now() - t0) / 1000)}s`);
  return { N, A, B: B1, alb, parts };
}

function maxOf(v: Float32Array) { let m = 1e-6; const s = Array.from(v).sort((a, b) => a - b); m = s[Math.floor(s.length * 0.9995)] || m; return m; }

for (const [mount, tag] of [['ceiling', ''], ['wall', '-wall'], ['side', '-side']] as const) {
// hi: square-root encoded, 4 bytes per vertex after an 8-byte header
if (mount !== 'side') {
  const { N, A, B } = bake(HI, 36, 64, mount);
  const maxA = maxOf(A), maxB = maxOf(B), buf = Buffer.alloc(8 + N * 4);
  buf.writeFloatLE(maxA, 0); buf.writeFloatLE(maxB, 4);
  for (let i = 0; i < N; i++) { for (let k = 0; k < 3; k++) buf[8 + i * 4 + k] = Math.min(255, Math.round(Math.sqrt(A[i * 3 + k] / maxA) * 255)); buf[8 + i * 4 + 3] = Math.min(255, Math.round(Math.sqrt(B[i] / maxB) * 255)); }
  fs.writeFileSync(`${OUT}/hi${tag}.bin`, buf); console.log(`hi${tag}.bin`, (buf.length / 1048576).toFixed(2), 'MB', { maxA, maxB });
}
// lo: final surface colour for the other storeys, 16-bit linear RGB
if (mount !== 'wall') {
  const { N, A, alb } = bake(LO, 16, 36, mount);
  const c = new Float32Array(N * 3); for (let i = 0; i < N * 3; i++) c[i] = A[i] * alb[i];
  const m = maxOf(c), u = new Uint16Array(N * 3); for (let i = 0; i < N * 3; i++) u[i] = Math.min(65535, Math.round(c[i] / m * 65535));
  const buf = Buffer.alloc(4 + u.byteLength); buf.writeFloatLE(m, 0); Buffer.from(u.buffer).copy(buf, 4);
  fs.writeFileSync(`${OUT}/lo${tag}.bin`, buf); console.log(`lo${tag}.bin`, (buf.length / 1048576).toFixed(2), 'MB', { m });
}
}
