import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { brushedTexture, lerp, skyMaterial, woodTexture } from './shared';

// An illustrative SUNROOOF unit, modelled from the exploded view in the brand's own product film.
export const W = 3.3, D = 2.1, HEIGHT = 0.36, MUNTIN = 0.07;

export const LAYERS = ['Housing', 'Thermal fins', 'Light source', 'Advanced optics', 'Special lenses', 'Sky surface', 'Design frame'] as const;

/** Pane rectangles of the 3 x 3 frame, in the unit's local x/z. */
export const panes = () => {
  const out: { x: number; z: number; w: number; d: number }[] = [];
  const w = (W - MUNTIN * 4) / 3, d = (D - MUNTIN * 4) / 3;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) out.push({ x: -W / 2 + MUNTIN + w / 2 + i * (w + MUNTIN), z: -D / 2 + MUNTIN + d / 2 + j * (d + MUNTIN), w, d });
  return out;
};

export function createProduct() {
  const root = new THREE.Group(), spin = new THREE.Group(); root.add(spin);
  const layers: { name: string; obj: THREE.Object3D; y0: number; y1: number }[] = [];
  const add = (name: string, obj: THREE.Object3D, y0: number, y1: number) => { obj.position.y = y0; spin.add(obj); layers.push({ name, obj, y0, y1 }); };

  const box = (w: number, h: number, d: number, m: THREE.Material, r = 0.012) => { const b = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), m); b.castShadow = true; return b; };
  const dots = (geo: THREE.BufferGeometry, m: THREE.Material, nx: number, nz: number, y = 0) => {
    const im = new THREE.InstancedMesh(geo, m, nx * nz), o = new THREE.Object3D(); let n = 0;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { o.position.set(lerp(-W / 2 + .14, W / 2 - .14, i / (nx - 1)), y, lerp(-D / 2 + .14, D / 2 - .14, j / (nz - 1))); o.updateMatrix(); im.setMatrixAt(n++, o.matrix); }
    return im;
  };

  // housing
  const brushed = brushedTexture(), metal = new THREE.MeshStandardMaterial({ color: '#c9c3b8', metalness: 1, roughness: .55, roughnessMap: brushed, envMapIntensity: .6 });
  const housing = box(W + .1, .2, D + .1, metal, .035); add(LAYERS[0], housing, HEIGHT - .1, 1.42);

  // thermal fins
  const dark = new THREE.MeshStandardMaterial({ color: '#2a2b2d', metalness: .9, roughness: .4 });
  const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(.02, .045, D - .1), dark, 44), o = new THREE.Object3D();
  for (let i = 0; i < 44; i++) { o.position.set(lerp(-W / 2 + .06, W / 2 - .06, i / 43), 0, 0); o.updateMatrix(); fins.setMatrixAt(i, o.matrix); }
  add(LAYERS[1], fins, .2, 1.0);

  // light source
  const engine = new THREE.Group(), led = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4, 2.6), toneMapped: false });
  engine.add(box(W, .016, D, new THREE.MeshStandardMaterial({ color: '#16211c', roughness: .6, metalness: .3 }), .006), dots(new THREE.CylinderGeometry(.022, .022, .014, 10), led, 26, 16, -.014));
  add(LAYERS[2], engine, .15, .58);

  // advanced optics and special lenses: clear sheets with lit edges
  const glass = () => new THREE.MeshPhysicalMaterial({ color: '#dff1ff', transparent: true, opacity: .2, roughness: .06, metalness: 0, envMapIntensity: 2.2, depthWrite: false, side: THREE.DoubleSide });
  const edge = new THREE.LineBasicMaterial({ color: new THREE.Color(.8, 1.6, 2.6), toneMapped: false });
  const sheet = () => { const m = new THREE.Mesh(new THREE.BoxGeometry(W, .012, D), glass()); m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), edge)); return m; };
  const optics = new THREE.Group(), ribMat = glass(); ribMat.opacity = .34;
  const ribs = new THREE.InstancedMesh(new THREE.BoxGeometry(W - .12, .012, .018), ribMat, 26);
  for (let i = 0; i < 26; i++) { o.position.set(0, -.012, lerp(-D / 2 + .08, D / 2 - .08, i / 25)); o.updateMatrix(); ribs.setMatrixAt(i, o.matrix); }
  optics.add(sheet(), ribs); add(LAYERS[3], optics, .115, .14);

  const lensGeo = new THREE.SphereGeometry(.058, 14, 8); lensGeo.scale(1, .42, 1);
  const lensMat = glass(); lensMat.opacity = .42;
  const lenses = new THREE.Group(); lenses.add(sheet(), dots(lensGeo, lensMat, 22, 14, -.01)); add(LAYERS[4], lenses, .085, -.28);

  // sky surface: top reads as a glowing plate, underside is the live sky
  const plate = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.4, 1.25), toneMapped: false }), side = new THREE.MeshStandardMaterial({ color: '#efe9de' });
  add(LAYERS[5], new THREE.Mesh(new THREE.BoxGeometry(W - .02, .02, D - .02), [side, side, plate, skyMaterial, side, side]), .055, -.74);

  // design frame
  const wood = woodTexture([146, 94, 58]); wood.repeat.set(1.2, .4);
  const woodMat = new THREE.MeshStandardMaterial({ map: wood, roughness: .62, metalness: 0 });
  const frame = new THREE.Group(), T = .05;
  const bar = (w: number, d: number, x: number, z: number) => { const b = box(w, T, d, woodMat, .01); b.position.set(x, 0, z); frame.add(b); };
  bar(W + .1, MUNTIN + .05, 0, -D / 2 - .025); bar(W + .1, MUNTIN + .05, 0, D / 2 + .025); bar(MUNTIN + .05, D, -W / 2 - .025, 0); bar(MUNTIN + .05, D, W / 2 + .025, 0);
  const pw = (W - MUNTIN * 4) / 3, pd = (D - MUNTIN * 4) / 3;
  for (const s of [-1, 1]) { bar(MUNTIN, D, s * (pw + MUNTIN) / 2, 0); bar(W, MUNTIN, 0, s * (pd + MUNTIN) / 2); }
  add(LAYERS[6], frame, T / 2, -1.28);

  return {
    root, spin, layers,
    explode(e: number) { for (const l of layers) l.obj.position.y = lerp(l.y0, l.y1, e); },
    power(k: number) { led.color.setRGB(3.2 * k + .04, 2.6 * k + .04, 1.7 * k + .04); plate.color.setRGB(1.5 * k + .1, 1.4 * k + .1, 1.25 * k + .1); },
  };
}
