// The room as plain geometry, with no DOM use, so the browser and the light-baking script (tools/bake-room.ts) build identical vertices.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const H = 3.4, X = 5, ZB = -4.2, ZF = 7;
export const PANEL = { w: 3.3, d: 2.1, y: H - 0.02, z: -0.4 };
/** The same unit mounted in the back wall as a window; d is its height. */
export const WINDOW = { w: 3.3, d: 2.1, y: 1.95, z: ZB + 0.02 };
/** A smaller window in the right-hand wall, used on the other floors of the building. d is its height. */
export const SIDE = { w: 2.64, d: 1.68, y: 1.75, x: X - 0.02, z: 0.25 };
export type Mount = 'ceiling' | 'wall' | 'side';

export const PALETTE = {
  wall: '#cfc6b6', ceil: '#e8e2d8', floor: '#8d6443', trim: '#e3ddd1', linen: '#d6ccba', cushion: '#b5845a', slat: '#5f3c24', oak: '#7a5233', ink: '#1b1a18',
  stone: '#b9b0a2', leaf: '#3c5a30', rug: '#a79680', art: '#a58b6e', soil: '#2b2119', shade: '#efe6d6',
} as const;
export type Key = keyof typeof PALETTE;
/** Surfaces that catch sunlight but do not block it. */
export const NO_CAST: Key[] = ['wall', 'ceil', 'floor', 'trim', 'rug', 'slat', 'ink', 'art', 'soil', 'shade'];

/** @param d target edge length in metres. Large values give the low-detail version used for the other storeys. */
/** Where the main room's plants stand: x, z, model, scale, turn. */
export const PLANTS: [number, number, string, number, number][] = [[-3.55, -2.85, 'potted_plant_01', 1.45, .6], [3.85, 4.1, 'potted_plant_02', 1.7, 2.1], [-2.3, -3.4, 'potted_plant_02', 1.35, 1.2]];

/** Scanned furniture in the main room: model, x, z, turn. */
export const FURNITURE: [string, number, number, number][] = [['mid_century_lounge_chair', -2.9, 2, .9]];

export function buildRoom(d: number, mount: Mount = 'ceiling') {
  let seed = 7; const rnd = (a = 0, b = 1) => { seed = (seed * 1664525 + 1013904223) >>> 0; return a + (seed / 4294967296) * (b - a); };
  const fine = d < 0.2, bins = new Map<Key, THREE.BufferGeometry[]>();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  const add = (k: Key, g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => {
    q.setFromEuler(e.set(rx, ry, rz, 'YXZ')); g.applyMatrix4(m.compose(new THREE.Vector3(x, y, z), q, one));
    if (k !== 'art') worldUV(g);
    (bins.get(k) ?? bins.set(k, []).get(k)!).push(g);
  };

  /** Rounded box with denser rows at the edges; `puff` bulges the faces like upholstery. */
  function soft(w: number, h: number, z: number, r = 0.02, puff = 0) {
    const size = [w, h, z], half = size.map(s => s / 2), segs = size.map(s => Math.max(fine ? 8 : 4, Math.min(fine ? 40 : 8, Math.ceil(s / d) + (fine ? 6 : 0))));
    const g = new THREE.BoxGeometry(w, h, z, segs[0], segs[1], segs[2]), p = g.attributes.position, n = g.attributes.normal;
    const remap = (v: number, i: number) => { const a = Math.abs(v) / half[i], edge = 3 / segs[i] * 2, band = Math.min(.45, r / half[i]), o = a < 1 - edge ? a / (1 - edge) * (1 - band) : (1 - band) + (a - (1 - edge)) / edge * band; return Math.sign(v) * o * half[i]; };
    const v = new THREE.Vector3(), c = new THREE.Vector3(), dir = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.set(remap(p.getX(i), 0), remap(p.getY(i), 1), remap(p.getZ(i), 2));
      c.set(THREE.MathUtils.clamp(v.x, -half[0] + r, half[0] - r), THREE.MathUtils.clamp(v.y, -half[1] + r, half[1] - r), THREE.MathUtils.clamp(v.z, -half[2] + r, half[2] - r));
      dir.subVectors(v, c); const face = new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i));
      if (dir.lengthSq() < 1e-9) dir.copy(face); dir.normalize();
      const out = c.clone().addScaledVector(dir, r);
      // the bulge fades to zero where the rounded edge starts, so neighbouring faces stay joined
      if (puff) { const k = (1 - (c.x / (half[0] - r)) ** 2 * (face.x ? 0 : 1)) * (1 - (c.y / (half[1] - r)) ** 2 * (face.y ? 0 : 1)) * (1 - (c.z / (half[2] - r)) ** 2 * (face.z ? 0 : 1)); out.addScaledVector(face, puff * Math.max(0, k)); }
      p.setXYZ(i, out.x, out.y, out.z); n.setXYZ(i, dir.x, dir.y, dir.z);
    }
    if (puff) { g.computeVertexNormals(); smoothSeams(g); }
    return g;
  }
  const box = (w: number, h: number, z: number) => new THREE.BoxGeometry(w, h, z, Math.max(1, Math.ceil(w / d)), Math.max(1, Math.ceil(h / d)), Math.max(1, Math.ceil(z / d)));
  const lathe = (pts: [number, number][], seg = fine ? 40 : 10) => { const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg); return g; };
  const rod = (r: number, len: number) => lathe([[0, 0], [r, 0], [r, len], [0, len]], fine ? 10 : 4);

  // ---- shell ----
  const DEPTH = ZF - ZB, CZ = (ZF + ZB) / 2, T = 0.3;
  add('floor', box(X * 2 + 0.6, 0.42, DEPTH), 0, -0.21, CZ);
  add('ceil', box(X * 2 + 0.6, 0.42, DEPTH), 0, H + 0.21, CZ);
  add('wall', box(T, H, DEPTH), -X - T / 2, H / 2, CZ); add('wall', box(T, H, DEPTH), X + T / 2, H / 2, CZ);
  add('wall', box(X * 2, H, T), 0, H / 2, ZB - T / 2);
  // skirting and door
  add('trim', box(X * 2, 0.14, 0.025), 0, 0.07, ZB + 0.0125); add('trim', box(0.025, 0.14, DEPTH), -X + 0.0125, 0.07, CZ); add('trim', box(0.025, 0.14, DEPTH), X - 0.0125, 0.07, CZ);
  add('oak', soft(0.05, 2.4, 1.05, 0.006), X - 0.03, 1.2, 2.3); for (const s of [-1, 1]) add('trim', box(0.05, 2.455, 0.09), X - 0.03, 1.2275, 2.3 + s * 0.57); add('trim', box(0.05, 0.09, 1.23), X - 0.03, 2.5, 2.3);
  add('ink', rod(0.012, 0.13), X - 0.1, 1.05, 1.92, 0, 0, Math.PI / 2);

  // ---- rug ----
  add('rug', soft(5.6, 0.024, 4.2, 0.01), 0.3, 0.012, 0.9);

  // ---- sofa ----
  // one L-shaped body with cushions fitted against each other
  const SX0 = 1.76, SX1 = 2.84, SZ0 = -1.26, SZ1 = 2.55, RX0 = -0.6, DEEP = 1.04;
  const blk = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, r = 0.05, puff = 0) => add('linen', soft(x1 - x0, y1 - y0, z1 - z0, r, puff), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  blk(SX0, SX1 - 0.01, 0.1, 0.38, SZ0 + 0.01, SZ1 - 0.01); blk(RX0 + 0.01, SX0 + 0.05, 0.1, 0.38, SZ0 + 0.01, SZ0 + DEEP);
  blk(SX1 - 0.2, SX1, 0.1, 0.86, SZ0, SZ1, 0.06); blk(RX0, SX1 - 0.19, 0.1, 0.86, SZ0, SZ0 + 0.2, 0.06);
  blk(SX0, SX1 - 0.005, 0.1, 0.64, SZ1 - 0.2, SZ1, 0.07); blk(RX0, RX0 + 0.2, 0.1, 0.64, SZ0 + 0.005, SZ0 + DEEP, 0.07);
  for (const [x, z] of [[SX0 + 0.08, SZ1 - 0.08], [SX1 - 0.08, SZ1 - 0.08], [SX1 - 0.08, SZ0 + 0.08], [RX0 + 0.08, SZ0 + 0.08], [RX0 + 0.08, SZ0 + DEEP - 0.08], [SX0 + 0.08, SZ0 + DEEP - 0.08]]) add('ink', rod(0.018, 0.1), x, 0, z);
  const seat = (x0: number, x1: number, z0: number, z1: number) => blk(x0, x1, 0.37, 0.58, z0, z1, 0.07, 0.03);
  seat(SX0, SX1 - 0.2, SZ0 + 0.2, SZ0 + DEEP);
  const longZ0 = SZ0 + DEEP, longL = (SZ1 - 0.2 - longZ0) / 3, shortX0 = RX0 + 0.2, shortL = (SX0 - shortX0) / 2;
  for (let i = 0; i < 3; i++) { seat(SX0, SX1 - 0.2, longZ0 + i * longL, longZ0 + (i + 1) * longL); add('linen', soft(0.2, 0.5, longL, 0.09, 0.05), 2.53, 0.82, longZ0 + (i + 0.5) * longL, 0, 0, -0.14); }
  for (let i = 0; i < 2; i++) { seat(shortX0 + i * shortL, shortX0 + (i + 1) * shortL, SZ0 + 0.2, SZ0 + DEEP); add('linen', soft(shortL, 0.5, 0.2, 0.09, 0.05), shortX0 + (i + 0.5) * shortL, 0.82, SZ0 + 0.31, 0, 0.14); }
  add('linen', soft(0.2, 0.5, DEEP - 0.22, 0.09, 0.05), 2.53, 0.82, SZ0 + 0.2 + (DEEP - 0.2) / 2, 0, 0, -0.14);
  add('cushion', soft(0.5, 0.5, 0.14, 0.06, 0.07), 0.3, 0.84, -0.72, 0.12, 0.28, 0.1); add('cushion', soft(0.14, 0.46, 0.46, 0.06, 0.06), 2.3, 0.84, -0.1, 0.2, 0, -0.3); add('rug', soft(0.14, 0.42, 0.42, 0.05, 0.06), 2.3, 0.82, 1.9, -0.2, 0, -0.34);

  // ---- coffee table, with objects ----
  add('oak', lathe([[0, 0.02], [0.72, 0.02], [0.7, 0.05], [0.62, 0.34], [0.84, 0.36], [0.86, 0.39], [0.84, 0.42], [0, 0.42]]), -0.2, 0, 0.95);
  if (fine) {
    add('ink', soft(0.42, 0.04, 0.3, 0.005), 0.12, 0.44, 1.18, 0.3); add('art', soft(0.34, 0.03, 0.25, 0.005), 0.13, 0.475, 1.17, 0.5);
    add('stone', lathe([[0, 0], [0.09, 0], [0.19, 0.06], [0.24, 0.16], [0.225, 0.16], [0.17, 0.075], [0, 0.03]]), -0.3, 0.42, 0.85);
    for (let i = 0; i < 5; i++) add('ink', new THREE.SphereGeometry(0.04, 10, 8), -0.3 + rnd(-0.08, 0.08), 0.49, 0.85 + rnd(-0.08, 0.08));
  }

  // ---- lounge chair: the main room uses a scanned model instead (FURNITURE) ----
  if (!fine) {
  const cx = -3, cz = 2.3, cr = 0.55, at = (lx: number, lz: number): [number, number] => [cx + lx * Math.cos(cr) + lz * Math.sin(cr), cz - lx * Math.sin(cr) + lz * Math.cos(cr)];
  for (const [lx, lz] of [[-0.4, 0.38], [0.4, 0.38], [-0.4, -0.38], [0.4, -0.38]]) { const [ax, az] = at(lx, lz); add('oak', soft(0.05, 0.36, 0.05, 0.015), ax, 0.18, az, cr); }
  for (const s of [-1, 1]) { const [ax, az] = at(0, s * 0.42); add('oak', soft(0.9, 0.05, 0.06, 0.015), ax, 0.56, az, cr); }
  let [ax, az] = at(0, 0); add('cushion', soft(0.8, 0.15, 0.78, 0.06, 0.03), ax, 0.42, az, cr);
  [ax, az] = at(-0.4, 0); add('cushion', soft(0.14, 0.62, 0.76, 0.06, 0.04), ax, 0.76, az, cr, 0, 0.2);

  }

  // ---- back wall: art and console ----
  const artY = 1.85;
  if (mount !== 'wall') { add('oak', soft(2.2, 1.44, 0.04, 0.008), 0.2, artY, ZB + 0.03); add('trim', soft(2.1, 1.34, 0.01, 0.002), 0.2, artY, ZB + 0.055); add('art', soft(1.7, 0.96, 0.01, 0.002), 0.2, artY, ZB + 0.063); }
  add('oak', soft(3.2, 0.52, 0.46, 0.012), 0.2, 0.34, ZB + 0.26); for (const s of [-1.05, -0.35, 0.35, 1.05]) add('ink', box(0.012, 0.44, 0.005), 0.2 + s * 0.76 + 0.38 * Math.sign(s) * 0, 0.34, ZB + 0.492);
  for (const x of [-1.2, 1.6]) add('ink', rod(0.018, 0.08), x, 0, ZB + 0.26);
  if (fine) {
    add('stone', lathe([[0, 0], [0.08, 0], [0.13, 0.12], [0.1, 0.3], [0.05, 0.4], [0.06, 0.46], [0, 0.46]]), -0.9, 0.6, ZB + 0.26);
    add('ink', rod(0.008, 0.42), 1.35, 0.6, ZB + 0.26); add('stone', lathe([[0, 0], [0.11, 0], [0.11, 0.03], [0, 0.03]]), 1.35, 0.6, ZB + 0.26);
    add('shade', lathe([[0.14, 0], [0.09, 0.24]], 32), 1.35, 1.0, ZB + 0.26);
    for (let i = 0; i < 4; i++) { const t = 0.05 + i * 0.012; add(i % 2 ? 'cushion' : 'stone', soft(0.3, 0.035, 0.22, 0.004), 0.42, 0.615 + i * 0.038, ZB + 0.24, t); }
  }

  // ---- left wall: slats and screen ----
  for (let i = 0; i < 26; i++) add('slat', soft(0.06, H - 0.02, 0.1, 0.008), -X + 0.05, H / 2, ZB + 0.4 + i * 0.17);
  add('ink', soft(0.04, 1.25, 2.2, 0.01), -X + 0.13, 1.6, 2.5);

  // ---- right wall: shelves ----
  for (const y of [1, 1.7, 2.4]) {
    add('oak', soft(0.34, 0.05, 2.3, 0.008), X - 0.17, y, -2.3);
    if (!fine) continue;
    let z = -3.34;
    while (z < -1.3) {
      if (rnd() < 0.55) { const n = 3 + Math.floor(rnd(0, 5)); for (let i = 0; i < n; i++) { const b = 0.03 + rnd(0, 0.02), h = 0.2 + rnd(0, 0.09); add((['linen', 'cushion', 'slat', 'stone'] as Key[])[Math.floor(rnd(0, 4))], soft(0.18, h, b, 0.003), X - 0.16, y + 0.025 + h / 2, z); z += b + 0.002; } z += 0.1; }
      else { const h = 0.16 + rnd(0, 0.16), r = 0.06 + rnd(0, 0.05); add(rnd() > 0.5 ? 'stone' : 'ink', lathe([[0, 0], [r * 0.7, 0], [r, h * 0.45], [r * 0.5, h * 0.85], [r * 0.55, h], [0, h]]), X - 0.17, y + 0.025, z + r); z += r * 2 + 0.14; }
    }
  }

  // ---- plants ----
  const plant = (x: number, z: number, s: number) => {
    add('stone', lathe([[0, 0], [0.2 * s, 0], [0.28 * s, 0.48 * s], [0.265 * s, 0.5 * s], [0.19 * s, 0.04 * s], [0, 0.04 * s]]), x, 0, z);
    add('soil', lathe([[0, 0], [0.26 * s, 0]], fine ? 24 : 6), x, 0.44 * s, z);
    const N = fine ? 26 : 8, tall = 2 * s;
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N, a = i * 2.39996, len = (0.95 - 0.35 * t) * s * (fine ? 1 : 1.5), wid = 0.34 * s * (fine ? 1 : 1.7);
      const base = 0.5 * s + (0.35 + 0.65 * t) * (tall - 0.9 * s), lean = 0.55 + (1 - t) * 0.55 + rnd(-0.12, 0.12);
      add('leaf', rod(0.008 * s, base - 0.44 * s), x + Math.cos(a) * 0.03, 0.44 * s, z + Math.sin(a) * 0.03, 0, Math.sin(a) * 0.1, -Math.cos(a) * 0.1);
      const g = new THREE.PlaneGeometry(wid, len, fine ? 4 : 2, fine ? 10 : 3), p = g.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const u = p.getX(v) / (wid / 2), k = Math.max(0, p.getY(v) / len + 0.5), half = Math.sin(Math.PI * Math.pow(k, 0.7));
        const fold = Math.abs(u) * half * wid * 0.16, droop = k * k * len * 0.42, wave = Math.sin(k * 14 + u * 2) * 0.008 * s * Math.abs(u);
        p.setXYZ(v, u * half * wid / 2, k * len * (1 - k * 0.2), fold - droop + wave);
      }
      g.computeVertexNormals(); add('leaf', g, x + Math.cos(a) * 0.03, base, z + Math.sin(a) * 0.03, -a + Math.PI / 2, -lean - Math.PI / 2 + 1.2);
    }
  };
  if (!fine) { plant(-3.55, -2.85, 1.15); if (mount !== 'side') plant(3.85, 4.1, 1); plant(-2.3, ZB + 0.8, 0.6); }

  const parts = (Object.keys(PALETTE) as Key[]).filter(k => bins.has(k)).map(key => ({ key, geo: mergeGeometries(bins.get(key)!, false)! }));
  return parts;
}

/** Texture space in metres, projected along each face's main axis, so grain and weave keep one scale everywhere. */
/** BoxGeometry repeats vertices along its edges; averaging their normals hides the crease between faces. */
function smoothSeams(g: THREE.BufferGeometry) {
  const p = g.attributes.position, n = g.attributes.normal, sum = new Map<string, number[]>(), key = (i: number) => `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
  for (let i = 0; i < p.count; i++) { const v = sum.get(key(i)) ?? [0, 0, 0]; v[0] += n.getX(i); v[1] += n.getY(i); v[2] += n.getZ(i); sum.set(key(i), v); }
  for (let i = 0; i < p.count; i++) { const [x, y, z] = sum.get(key(i))!, l = Math.hypot(x, y, z) || 1; n.setXYZ(i, x / l, y / l, z / l); }
}

function worldUV(g: THREE.BufferGeometry) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, p.getZ(i), p.getX(i)); else if (ax >= az) uv.setXY(i, p.getZ(i), p.getY(i)); else uv.setXY(i, p.getX(i), p.getY(i));
  }
}
