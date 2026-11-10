import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createProduct, panes, W } from './product';
import { buildRoom, H, NO_CAST, PALETTE, PLANTS, FURNITURE, PANEL, SIDE, WINDOW, X, ZB, ZF, type Key, type Mount } from './room';
import { artTexture, clamp, lerp, plasterTexture, sampleSky, seg, skyUniforms, smooth, up, wearTexture, weaveTexture, woodTexture } from './shared';

const PZ = PANEL.z, MOUNT = PANEL.y, WINY = WINDOW.y, WZ = WINDOW.z, STAGE_Y = 1.84, STOREY = H + 0.85; // two 0.42 slabs plus a gap: overlapping slabs share a front face and flicker

/** Dull room to product arrival, sunrise, exploded midday, bright noon, evening, then the building section at night. */
const CAMERA: [number, [number, number, number], [number, number, number], number][] = [
  [0, [0, 1.3, 6.5], [0, 1.95, -2], 40],
  [.1, [0, 1.3, 6.3], [0, 2.05, -2], 40],
  [.22, [-.5, 1.2, 6.2], [0, 1.9, -1.2], 50],
  [.33, [-1.3, 1.15, 6.4], [.1, 1.85, -.6], 54],
  [.41, [.9, 1.1, 6], [.2, 1.85, -.4], 56],
  [.5, [0, 1.8, 6.2], [0, 1.85, -.4], 47],
  [.62, [.5, 1.7, 6], [0, 1.85, -.4], 47],
  [.71, [1.2, 1.2, 5.2], [0, 2.3, -.8], 44],
  [.79, [2.6, 1.25, 5], [-.5, 1.75, -1.4], 44],
  [.87, [-2.4, 1.4, 5.8], [.2, 1.95, -1.5], 42],
  [.93, [-.5, 1.5, 15], [0, 2.1, 0], 38],
  [1, [-8, -1, 33], [-3.5, 8, 0], 35],
];

/** Camera for the window version: only the shots that looked up at the ceiling change. */
const CAMERA_WALL: typeof CAMERA = CAMERA.map(k => k.slice() as typeof k);
for (const [i, t] of [[2, [0, 1.9, -3]], [3, [0, 1.9, -4]], [4, [0, 1.7, -4]], [7, [0, 1.9, -3.5]], [8, [-.5, 1.6, -2.5]], [9, [.2, 1.75, -2.5]]] as [number, [number, number, number]][]) CAMERA_WALL[i][2] = t;

const TOD: [number, number][] = [[0, 0], [.3, 0], [.41, .36], [.7, .4], [.79, .4], [.86, .6], [.92, .8], [1, 1]];
const pw = (t: [number, number][], p: number) => { for (let i = 0; i < t.length - 1; i++) if (p <= t[i + 1][0]) return lerp(t[i][1], t[i + 1][1], smooth(seg(p, t[i][0], t[i + 1][0]))); return t[t.length - 1][1]; };
// the room goes fully dark before the product comes down, so the exploded stack never meets the furniture
const stageAt = (p: number) => up(p, .405, .45) * (1 - up(p, .665, .71));

export async function createWorld(canvas: HTMLCanvasElement, capture = false, mount: Mount = 'ceiling') {
  const wall = mount === 'wall', cams = wall ? CAMERA_WALL : CAMERA;
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const [hiBuf, loBuf, loSideBuf] = await Promise.all([wall ? 'hi-wall' : 'hi', 'lo', 'lo-side'].map(n => fetch(`${base}/sunrooof/bake/${n}.bin`).then(r => { if (!r.ok) throw new Error(n); return r.arrayBuffer(); })));
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const coarse = matchMedia('(pointer: coarse)').matches, gl = renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
  // integrated graphics cannot fill a high-density screen at this shading cost
  const weak = !capture && !!info && /intel|uhd|iris|mali|adreno|powervr|swiftshader/i.test(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
  renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;

  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x000000, .0055);
  const camera = new THREE.PerspectiveCamera(40, 1, .1, 800);
  const envTex = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;

  // ---- room: all fill light is pre-computed per vertex (tools/bake-room.ts), so the only live light is the sun ----
  const bakeU = { uPanel: { value: new THREE.Color(0, 0, 0) }, uAmb: { value: new THREE.Color(0, 0, 0) }, uMaxA: { value: new DataView(hiBuf).getFloat32(0, true) }, uMaxB: { value: new DataView(hiBuf).getFloat32(4, true) }, uSat: { value: .34 }, uVig: { value: .34 }, uRes: { value: new THREE.Vector2(1, 1) } };
  const withBake = <T extends THREE.Material>(m: T) => {
    m.dithering = true; // no film grain any more, and dark gradients would band without this
    m.onBeforeCompile = s => {
      Object.assign(s.uniforms, bakeU);
      s.vertexShader = 'attribute vec4 aBake; varying vec4 vBake;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvBake = aBake;');
      s.fragmentShader = 'uniform vec3 uPanel, uAmb; uniform vec2 uRes; uniform float uMaxA, uMaxB, uSat, uVig; varying vec4 vBake;\n' + s.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += material.diffuseColor * (vBake.rgb * vBake.rgb * uMaxA * uPanel + vBake.a * vBake.a * uMaxB * uAmb);').replace('#include <opaque_fragment>', 'outgoingLight = pow(max(outgoingLight, vec3(0.)) / .18, vec3(1.24)) * .18; outgoingLight = mix(vec3(dot(outgoingLight, vec3(.2126, .7152, .0722))), outgoingLight, uSat); vec2 vq = gl_FragCoord.xy / uRes - .5; outgoingLight *= 1. - uVig * smoothstep(.25, .85, dot(vq, vq) * 2.);\n#include <opaque_fragment>'); // the colour grade lives here because a full-screen pass costs too much
    };
    return m;
  };
  // matte surfaces cover most of the screen, so they use the cheap shader; only glossy ones pay for reflections
  const matte = (o: THREE.MeshLambertMaterialParameters) => withBake(new THREE.MeshLambertMaterial(o));
  const baked = (o: THREE.MeshStandardMaterialParameters) => withBake(new THREE.MeshStandardMaterial(o));
  const floorMap = woodTexture([176, 128, 86]); floorMap.repeat.set(.7, .7);
  const slatMap = woodTexture([120, 78, 48]); slatMap.rotation = Math.PI / 2; slatMap.repeat.set(.6, .6);
  const oakMap = woodTexture([150, 104, 66]); oakMap.repeat.set(.9, .9);
  const wear = wearTexture(); wear.repeat.set(.7, .7);
  const plaster = plasterTexture(), weave = weaveTexture(), rugMap = weaveTexture(); plaster.repeat.set(.4, .4); weave.repeat.set(7, 7); rugMap.repeat.set(3, 3);
  const texLoader = new THREE.TextureLoader(), scan = (id: string, tile: number) => Promise.all(['diff', 'nor', 'rough'].map(n => texLoader.loadAsync(`${base}/sunrooof/tex/${id}_${n}.jpg`))).then(([map, normalMap, roughnessMap]) => { map.colorSpace = THREE.SRGBColorSpace; for (const t of [map, normalMap, roughnessMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.setScalar(1 / tile); t.anisotropy = 8; } return { map, normalMap, roughnessMap, roughness: 1 }; });
  const [plasterScan, woodScan, linenScan, velvetScan] = await Promise.all([scan('painted_plaster_wall', 2.5), scan('wood_floor', 2.2), scan('rough_linen', .6), scan('velour_velvet', .5)]);
  const stripeCanvas = document.createElement('canvas'); stripeCanvas.width = 256; stripeCanvas.height = 4; { const g = stripeCanvas.getContext('2d')!; g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 4); g.fillStyle = '#f5f1ea'; g.fillRect(128, 0, 128, 4); g.fillStyle = '#ebe5db'; g.fillRect(127, 0, 2, 4); g.fillRect(255, 0, 1, 4); }
  const stripes = new THREE.CanvasTexture(stripeCanvas); stripes.colorSpace = THREE.SRGBColorSpace; stripes.wrapS = stripes.wrapT = THREE.RepeatWrapping; stripes.repeat.set(1 / .9, 1); stripes.anisotropy = 8;
  const walnutScan = await scan('wood_floor', .5);
  // the painting: a canvas weave under painterly strokes
  const art = artTexture(); { const c = art.image as HTMLCanvasElement, g = c.getContext('2d')!, px = g.getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < 2600; i++) { const x = Math.random() * c.width, y = Math.random() * c.height, k = (Math.floor(y) * c.width + Math.floor(x)) * 4, d = (Math.random() - .5) * 46, a = Math.random() * Math.PI; g.strokeStyle = `rgba(${px[k] + d},${px[k + 1] + d},${px[k + 2] + d},.55)`; g.lineWidth = 2 + Math.random() * 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * (8 + Math.random() * 26), y + Math.sin(a) * (4 + Math.random() * 10)); g.stroke(); } art.needsUpdate = true; }
  const glossy: THREE.MeshStandardMaterial[] = [], gloss = (m: THREE.MeshStandardMaterial) => { m.envMap = envTex; glossy.push(m); return m; };
  const col = (k: Key) => new THREE.Color(PALETTE[k]);
  const mats: Record<Key, THREE.Material> = {
    wall: baked({ color: col('wall'), map: stripes, normalMap: plasterScan.normalMap, normalScale: new THREE.Vector2(.45, .45), roughnessMap: plasterScan.roughnessMap, roughness: .95 }), ceil: baked({ color: col('ceil'), normalMap: plasterScan.normalMap, normalScale: new THREE.Vector2(.3, .3), roughnessMap: plasterScan.roughnessMap, roughness: .95 }), trim: matte({ color: col('trim') }),
    floor: gloss(baked({ ...woodScan })), rug: baked({ color: '#efe4d2', ...linenScan }),
    linen: baked({ color: '#f2e2c8', ...linenScan }), cushion: baked({ color: col('cushion'), ...velvetScan }),
    slat: gloss(baked({ map: slatMap, roughness: .55 })), oak: gloss(baked({ ...walnutScan, color: '#a9805c' })), ink: gloss(baked({ color: col('ink'), roughness: .35 })),
    stone: gloss(baked({ color: col('stone'), roughness: .55 })), leaf: matte({ color: col('leaf'), side: THREE.DoubleSide }), soil: matte({ color: col('soil') }),
    art: baked({ map: art, bumpMap: art, bumpScale: 1.5, normalMap: linenScan.normalMap, normalScale: new THREE.Vector2(.5, .5), roughness: .88 }), shade: matte({ color: col('shade'), side: THREE.DoubleSide }),
  };
  const room = new THREE.Group(); scene.add(room);
  let off = 8;
  for (const { key, geo } of buildRoom(.1, mount)) {
    const n = geo.attributes.position.count; geo.setAttribute('aBake', new THREE.BufferAttribute(new Uint8Array(hiBuf, off, n * 4), 4, true)); off += n * 4;
    const m = new THREE.Mesh(geo, mats[key]); m.name = key; m.receiveShadow = true; m.matrixAutoUpdate = false; room.add(m);
  }
  if (off !== hiBuf.byteLength) throw new Error('bake data does not match the room; rerun tools/bake-room.ts');
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0) });
  for (const y of [1, 1.7, 2.4]) { const b = new THREE.Mesh(new THREE.BoxGeometry(.02, .012, 2.2), glow); b.position.set(X - .32, y - .032, -2.3); room.add(b); }

  // ---- hanging planters and the soft sheen of the panel on the floor ----
  const hangers = new THREE.Group(); scene.add(hangers);
  let seed = 11; const rn = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  const hangMats = [new THREE.MeshStandardMaterial({ color: '#a4603c', roughness: .88, envMap: envTex }), new THREE.MeshStandardMaterial({ color: '#7a6a54', roughness: .9, envMap: envTex }), new THREE.MeshStandardMaterial({ color: '#1f4a1c', roughness: .5, side: THREE.DoubleSide, envMap: envTex })], [potM, cordM, leafM] = hangMats;
  const potG = new THREE.LatheGeometry([[0, 0], [.1, 0], [.15, .12], [.17, .24], [.18, .25], [.15, .25], [0, .2]].map(([a, b]) => new THREE.Vector2(a, b)), 28), cordG = new THREE.CylinderGeometry(.005, .005, 1, 6), leafG = new THREE.SphereGeometry(1, 8, 6).scale(.04, .004, .085), up3 = new THREE.Vector3(0, 1, 0), hold = new THREE.Object3D();
  const baskets: number[][] = [];
  for (const [x, z, drop] of [[-3, -.4, 1.05], [3, -.4, .85], [-3.1, 1.7, .8], [3.1, 1.7, 1.1]]) {
    const y = H - drop - .25, pot = new THREE.Mesh(potG, potM); pot.position.set(x, y, z); hangers.add(pot);
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2, from = new THREE.Vector3(x + Math.cos(a) * .17, y + .25, z + Math.sin(a) * .17), to = new THREE.Vector3(x, H, z), d = to.clone().sub(from), c = new THREE.Mesh(cordG, cordM); c.position.copy(from).addScaledVector(d, .5); c.scale.y = d.length(); c.quaternion.setFromUnitVectors(up3, d.normalize()); hangers.add(c); }
    baskets.push([x, y, z]);
  }
  // scanned plants: photo textures, cut-out leaves that also cut their shadows
  const gltf = new GLTFLoader(), model = (id: string, dir = 'plants') => gltf.loadAsync(id.includes('/') ? `${base}/sunrooof/models/${id}.glb` : `${base}/sunrooof/${dir}/${id}/${id}_2k.gltf`).then(g => { g.scene.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; m.castShadow = m.receiveShadow = true; const mt = m.material as THREE.MeshStandardMaterial; mt.envMap = envTex; if (id.includes('/')) { mt.metalness = 0; mt.metalnessMap = null; } if (mt.alphaTest) mt.side = THREE.DoubleSide; if (!hangMats.includes(mt)) hangMats.push(mt); }); return g.scene; });
  const [fern, ...pots] = await Promise.all(['potted_plant_02', ...PLANTS.filter(p => mount !== 'side' || p[2] !== 'potted_plant_02').map(p => p[2])].map(id => model(id)));
  pots.forEach((g, i) => { const [x, z, id, k, ry] = PLANTS.filter(p => mount !== 'side' || p[2] !== 'potted_plant_02')[i]; g.position.set(x, 0, z); if (id === 'calathea_orbifolia_01') { const pot = new THREE.Mesh(potG, potM); pot.scale.setScalar(2.2); pot.position.set(x, 0, z); pot.castShadow = pot.receiveShadow = true; room.add(pot); g.position.y = .5; } g.scale.setScalar(k); g.rotation.y = ry; room.add(g); });
  baskets.forEach(([x, y, z], i) => { const g = fern.clone(); g.position.set(x, y + .1, z); g.scale.setScalar(.48 + i * .03); g.rotation.y = i * 1.9; hangers.add(g); });
  // the light bake predates the furniture, so each piece gets a soft contact shadow
  const blobCanvas = document.createElement('canvas'); blobCanvas.width = blobCanvas.height = 128; { const g = blobCanvas.getContext('2d')!, gr = g.createRadialGradient(64, 64, 8, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,.75)'); gr.addColorStop(.6, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  const blobMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(blobCanvas), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), box3 = new THREE.Box3(), size3 = new THREE.Vector3();
  const ground = (g: THREE.Object3D) => { g.updateMatrixWorld(true); box3.setFromObject(g).getSize(size3); const c = box3.getCenter(new THREE.Vector3()), b = new THREE.Mesh(new THREE.PlaneGeometry(size3.x * 1.25, size3.z * 1.25).rotateX(-Math.PI / 2), blobMat); b.position.set(c.x, .028, c.z); room.add(b); };
  (await Promise.all(FURNITURE.map(([id]) => model(id, 'models')))).forEach((g, i) => { const [, x, z, ry, w] = FURNITURE[i]; g.scale.setScalar(w); g.rotation.y = ry; g.position.set(x, 0, z); g.updateMatrixWorld(true); g.position.y -= box3.setFromObject(g).min.y - .024; room.add(g); ground(g); });

  // ---- walnut console with scanned ceramic vases ----
  const walnut = new THREE.MeshStandardMaterial({ ...walnutScan, color: '#7a5236', envMap: envTex, envMapIntensity: .4 }), darkMetal = new THREE.MeshStandardMaterial({ color: '#1c1a18', metalness: .8, roughness: .35, envMap: envTex });
  hangMats.push(walnut, darkMetal);
  const piece = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; room.add(o); return o; };
  piece(new THREE.BoxGeometry(2.8, .5, .42), walnut, .2, .33, ZB + .24);
  for (const dx of [-.7, 0, .7]) piece(new THREE.BoxGeometry(.006, .44, .004), darkMetal, .2 + dx, .33, ZB + .452);
  for (const [dx, dz] of [[-1.3, -.15], [1.3, -.15], [-1.3, .15], [1.3, .15]]) piece(new THREE.BoxGeometry(.03, .08, .03), darkMetal, .2 + dx, .04, ZB + .24 + dz);
  const [vaseA, vaseB] = await Promise.all(['ceramic_vase_02', 'ceramic_vase_03'].map(id => model(id, 'models')));
  vaseA.position.set(-.75, .58, ZB + .24); vaseA.scale.setScalar(1.2); vaseB.position.set(1.15, .58, ZB + .22); vaseB.scale.setScalar(1.4); vaseB.rotation.y = 1; room.add(vaseA, vaseB);
  for (let i = 0; i < 3; i++) piece(new THREE.BoxGeometry(.32 - i * .03, .035, .24 - i * .02), new THREE.MeshStandardMaterial({ color: ['#3b4a56', '#c9b79c', '#7d3b2c'][i], roughness: .8, envMap: envTex }), .35, .6 + i * .036, ZB + .24).rotation.y = i * .12;

  // ---- library: the whole right wall in dark walnut, filled with books, a brass rail and a ladder ----
  {
    const LX = X, D = .38, Z0 = ZB + .02, Z1 = 3.6, cols = 9, cw = (Z1 - Z0) / cols, rows = 8, rh = (H - .12) / rows, T = .03;
    const dark = new THREE.MeshStandardMaterial({ ...walnutScan, color: '#4a3020', envMap: envTex, envMapIntensity: .35 }); hangMats.push(dark);
    piece(new THREE.BoxGeometry(.02, H, Z1 - Z0), dark, LX - .01, H / 2, (Z0 + Z1) / 2);
    for (let c = 0; c <= cols; c++) piece(new THREE.BoxGeometry(D, H, T), dark, LX - D / 2, H / 2, Z0 + c * cw);
    for (let r = 0; r <= rows; r++) piece(new THREE.BoxGeometry(D, T, Z1 - Z0), dark, LX - D / 2, .06 + r * rh, (Z0 + Z1) / 2);
    piece(new THREE.BoxGeometry(D + .04, .12, Z1 - Z0 + .04), dark, LX - D / 2, .06, (Z0 + Z1) / 2);
    // warm strip lights under each shelf
    const strip = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .72, .42).multiplyScalar(1.6), toneMapped: false });
    for (let r = 1; r <= rows; r++) { const o = new THREE.Mesh(new THREE.BoxGeometry(.012, .006, Z1 - Z0 - .1), strip); o.position.set(LX - D + .05, .06 + r * rh - T / 2 - .004, (Z0 + Z1) / 2); room.add(o); }
    // books: cloth and leather bindings, a printed spine, standing, stacked or leaning
    const spineCanvas = document.createElement('canvas'); spineCanvas.width = 64; spineCanvas.height = 256; { const g = spineCanvas.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 256); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 0, 64, 10); g.fillRect(0, 246, 64, 10); g.fillStyle = 'rgba(255,214,140,.9)'; g.fillRect(6, 30, 52, 3); g.fillRect(6, 38, 52, 1.5); g.fillRect(6, 214, 52, 1.5); g.fillRect(6, 220, 52, 3); g.fillStyle = 'rgba(255,214,140,.7)'; for (let i = 0; i < 9; i++) g.fillRect(20, 80 + i * 10, 24, 4); }
    const spine = new THREE.CanvasTexture(spineCanvas); spine.colorSpace = THREE.SRGBColorSpace;
    const bookMat = new THREE.MeshStandardMaterial({ map: spine, normalMap: linenScan.normalMap, normalScale: new THREE.Vector2(.6, .6), roughness: .75, envMap: envTex, envMapIntensity: .3 }); hangMats.push(bookMat);
    const COLS = ['#5a1f1b', '#1f3a2e', '#20304a', '#7a5a2a', '#3a2418', '#8a7a62', '#4b4f2a', '#2a2a2e', '#6e3b2a', '#b4a07a', '#3e1e2c', '#556b6e'];
    const books = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bookMat, 2600), hold = new THREE.Object3D(), col = new THREE.Color(); let n = 0;
    let seed2 = 7; const rr = () => (seed2 = seed2 * 16807 % 2147483647) / 2147483647;
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      const y0 = .06 + r * rh + T / 2, zs = Z0 + c * cw + T / 2 + .02, ze = Z0 + (c + 1) * cw - T / 2 - .02; let z = zs;
      while (z < ze - .05 && n < 2590) {
        const pick = rr();
        if (pick < .08) { // a small stack lying flat
          const k = 2 + Math.floor(rr() * 4); let y = y0; for (let i = 0; i < k; i++) { const t = .03 + rr() * .03, w = .2 + rr() * .06; hold.position.set(LX - D / 2 - .02, y + t / 2, z + .13); hold.rotation.set(0, rr() * .2 - .1, Math.PI / 2); hold.scale.set(t, w, .26); hold.updateMatrix(); books.setMatrixAt(n, hold.matrix); books.setColorAt(n++, col.set(COLS[Math.floor(rr() * COLS.length)])); y += t; } z += .3;
        } else if (pick < .13) { z += .1 + rr() * .12; // a gap
        } else {
          const t = .022 + rr() * .035, h = Math.min(rh - .05, .2 + rr() * .14), d = .18 + rr() * .09, lean = z + t > ze - .1 && rr() < .5 ? .25 : 0;
          hold.position.set(LX - D + d / 2 + .04, y0 + h / 2, z + t / 2); hold.rotation.set(lean, 0, 0); hold.scale.set(d, h, t); hold.updateMatrix(); books.setMatrixAt(n, hold.matrix);
          books.setColorAt(n++, col.set(COLS[Math.floor(rr() * COLS.length)]).multiplyScalar(.8 + rr() * .4)); z += t + .002;
        }
      }
    }
    books.count = n; books.castShadow = books.receiveShadow = true; room.add(books);
    const brass = new THREE.MeshStandardMaterial({ color: '#b08a4a', metalness: 1, roughness: .3, envMap: envTex }); hangMats.push(brass);
    const rail = piece(new THREE.CylinderGeometry(.012, .012, Z1 - Z0, 12), brass, LX - D - .06, 2.55, (Z0 + Z1) / 2); rail.rotation.x = Math.PI / 2;
    const ladder = new THREE.Group(); ladder.position.set(LX - D - .55, 0, .4); ladder.rotation.z = .2; room.add(ladder);
    for (const dz of [-.22, .22]) { const o = new THREE.Mesh(new THREE.BoxGeometry(.045, 2.75, .035), dark); o.position.set(0, 1.37, dz); o.castShadow = true; ladder.add(o); }
    for (let i = 0; i < 9; i++) { const o = new THREE.Mesh(new THREE.CylinderGeometry(.014, .014, .44, 10), brass); o.rotation.x = Math.PI / 2; o.position.set(0, .28 + i * .29, 0); ladder.add(o); }
  }
  pots.forEach(ground);
  const sheenCanvas = document.createElement('canvas'); sheenCanvas.width = sheenCanvas.height = 256; { const g = sheenCanvas.getContext('2d')!, gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.5, 'rgba(255,255,255,.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }
  const sheen = new THREE.Mesh(new THREE.PlaneGeometry(9, 7).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sheenCanvas), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false })); sheen.position.set(0, .004, PZ + .8); scene.add(sheen);

  // ---- product ----
  const product = createProduct(), { root, spin, layers } = product; scene.add(root); root.visible = false;
  const frameIdx = layers.length - 1, productMats: THREE.MeshStandardMaterial[] = [];
  layers.forEach((l, i) => l.obj.traverse(o => {
    (o as THREE.Mesh).castShadow = i === frameIdx;
    for (const m of [(o as THREE.Mesh).material].flat() as THREE.MeshStandardMaterial[]) if (m && (m.toneMapped = true) && m.isMeshStandardMaterial) { m.envMap = envTex; m.needsUpdate = true; productMats.push(m); }
  }));
  // flies in below the ceiling line, then lifts straight up into place
  const flight = new THREE.CatmullRomCurve3((wall ? [[1.4, 2.4, 11.5], [-1, 2.45, 5.6], [.6, 2.2, 1.6], [0, WINY, WZ + 1.4], [0, WINY, WZ]] : [[1.4, 2.4, 11.5], [-1, 2.45, 5.6], [.6, 2.3, 1.6], [0, 2.3, PZ], [0, MOUNT, PZ]]).map(a => new THREE.Vector3(...(a as [number, number, number]))));

  // ---- live sun, shaped by the panes ----
  const sun = new THREE.DirectionalLight('#ffffff', 0); sun.castShadow = true; sun.target.position.set(0, 0, PZ); scene.add(sun, sun.target);
  sun.shadow.mapSize.setScalar(capture ? 2048 : coarse || weak ? 1024 : 2048); sun.shadow.radius = 10; // light from a large panel has wide, soft edges
  sun.shadow.bias = -.0005; sun.shadow.normalBias = .025;
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 34 });
  const shape = new THREE.Shape([[-20, -20], [20, -20], [20, 20], [-20, 20]].map(([a, b]) => new THREE.Vector2(a, b)));
  const holeZ = wall ? WINY : PZ;
  for (const p of panes()) { const h = new THREE.Path(); h.moveTo(p.x - p.w / 2, p.z - p.d / 2 + holeZ); h.lineTo(p.x + p.w / 2, p.z - p.d / 2 + holeZ); h.lineTo(p.x + p.w / 2, p.z + p.d / 2 + holeZ); h.lineTo(p.x - p.w / 2, p.z + p.d / 2 + holeZ); shape.holes.push(h); }
  const maskGeo = new THREE.ShapeGeometry(shape); if (!wall) maskGeo.rotateX(Math.PI / 2);
  const mask = new THREE.Mesh(maskGeo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide })); if (wall) mask.position.z = WZ - .03; else mask.position.y = H + .03; mask.castShadow = true; scene.add(mask);
  // the mask sits so close to the wall tops that shadow bias lets a line of sun through; cover them from higher up
  if (!wall) for (const s of [-1, 1]) { const cap = new THREE.Mesh(new THREE.BoxGeometry(1.4, .02, 40), mask.material); cap.position.set(s * (SIDE.x - .4), H + .6, 0); cap.castShadow = true; scene.add(cap); }
  // the shadow map draws the low-detail room: same silhouettes, a fraction of the triangles
  // most of the main room is models now; with the window mount there may be nothing left to cast
  const castGeos = buildRoom(.1, mount).filter(p => !NO_CAST.includes(p.key)).map(p => p.geo);
  if (castGeos.length) { const casters = new THREE.Mesh(mergeGeometries(castGeos, false)!, mask.material); casters.castShadow = true; casters.matrixAutoUpdate = false; room.add(casters); }

  // ---- light shafts, dust, stage glow ----
  const beamU = { uBeam: { value: 0 }, uColor: { value: new THREE.Color(1, .85, .6) } };
  const managed = (fs: string) => fs.replace(/}\s*$/, ' gl_FragColor.rgb = pow(max(gl_FragColor.rgb, 0.), vec3(1.6));\n#include <colorspace_fragment>\n}');
  const beamMat = new THREE.ShaderMaterial({
    uniforms: beamU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying float vY; varying vec2 vE; varying vec3 vN, vV; void main(){ vY=-position.y; vE=uv; vec3 q=position; q.xz*=1.+vY*.55; vec4 mv=modelViewMatrix*vec4(q,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'uniform float uBeam; uniform vec3 uColor; varying float vY; varying vec2 vE; varying vec3 vN, vV; void main(){ float a=pow(1.-clamp(vY,0.,1.),1.1)*pow(abs(dot(normalize(vN),normalize(vV))),1.2)*smoothstep(0.,.5,min(vE.x,1.-vE.x)); gl_FragColor=vec4(uColor*a*uBeam*1.5,1.); }',
  });
  const beamBits = panes().map(p => { const g = new THREE.BoxGeometry(p.w, 1, p.d); g.translate(0, -.5, 0); const m = new THREE.Mesh(g, beamMat); m.matrixAutoUpdate = false; m.frustumCulled = false; m.userData.pane = p; scene.add(m); return m; });
  const N = coarse ? 160 : 320, pts = new Float32Array(N * 3); for (let i = 0; i < N; i++) { pts[i * 3] = Math.random() * 7 - 3.5; pts[i * 3 + 1] = Math.random() * H; pts[i * 3 + 2] = Math.random() * 6 - 3.2; }
  const dustG = new THREE.BufferGeometry(); dustG.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const dustU = { uTime: { value: 0 }, uA: { value: 0 }, uColor: beamU.uColor, uDpr: { value: 1 } };
  const dust = new THREE.Points(dustG, new THREE.ShaderMaterial({
    uniforms: dustU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'uniform float uTime, uDpr; void main(){ vec3 p=position; p.x+=sin(uTime*.1+p.z*2.)*.25; p.y=mod(p.y+uTime*.03,3.3); p.z+=cos(uTime*.08+p.x)*.25; vec4 mv=modelViewMatrix*vec4(p,1.); gl_PointSize=(8.*uDpr)/-mv.z; gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'uniform float uA; uniform vec3 uColor; void main(){ float d=length(gl_PointCoord-.5); gl_FragColor=vec4(uColor*smoothstep(.5,.0,d)*uA,1.); }',
  }));
  dust.frustumCulled = false; scene.add(dust);
  const glowU = { uA: { value: 0 } };
  const stageFloor = new THREE.Mesh(new THREE.PlaneGeometry(9, 7), new THREE.ShaderMaterial({ uniforms: glowU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }', fragmentShader: 'uniform float uA; varying vec2 vUv; void main(){ float d=length((vUv-.5)*vec2(1.,1.25))*2.; gl_FragColor=vec4(sqrt(vec3(1.,.74,.46)*pow(max(0.,1.-d),2.2)*uA)*.7,1.); }' }));
  stageFloor.rotation.x = -Math.PI / 2; stageFloor.position.set(0, .01, PZ); scene.add(stageFloor);

  // ---- the building at the end: every storey is the same furnished, pre-lit room ----
  const city = new THREE.Group(); city.visible = false; scene.add(city);
  const storeyMat = new THREE.MeshBasicMaterial({ vertexColors: true }), paneMat = new THREE.MeshBasicMaterial();
  const dummy = new THREE.Object3D(), frameMat = new THREE.MeshBasicMaterial();
  storeyMat.side = THREE.DoubleSide; // some rooms are mirrored
  const grid = (c: number, r: number, w: number, d: number) => { const M = .07, pw = (w - M * (c + 1)) / c, pd = (d - M * (r + 1)) / r, out: { x: number; z: number; w: number; d: number }[] = []; for (let i = 0; i < c; i++) for (let j = 0; j < r; j++) out.push({ x: -w / 2 + M + pw / 2 + i * (pw + M), z: -d / 2 + M + pd / 2 + j * (pd + M), w: pw, d: pd }); return out; };
  // every room has its own colour of light, brightness, and arrangement of panels
  const VIBES: [string, number][] = [['#fff0dc', 1], ['#ffb27e', .95], ['#7fd6cf', .85], ['#b8e0a8', .9], ['#ffb3c1', .9], ['#c8b4ff', .8], ['#cfe6ff', 1.05], ['#ff8f5a', .8], ['#ffd36e', 1], ['#e8f0ff', .75], ['#f2c6a0', 1.1], ['#9fb8ff', .85]];
  const GRIDS = [[3, 3, 1], [2, 1, .8], [4, 1, .75], [2, 2, .7], [3, 2, .9], [1, 1, .55], [5, 2, 1], [1, 3, .6], [6, 1, .9], [2, 3, .8]];
  type Floor = { k: number; m: Mount; x: number; z: number; near: boolean; h: number; b: number };
  const floorAt = (k: number, x: number, z: number, near: boolean, b: number): Floor => { const h = Math.abs(k * 31 + b * 17 + 7); return { k, m: h % 5 < 2 ? 'side' : 'ceiling', x, z, near, h, b }; };
  const floors: Floor[] = [-3, -2, -1, 1, 2, 3, 4, 5].map(k => floorAt(k, 0, 0, true, -1));
  // the neighbouring buildings are stacks of the same kinds of room
  [[-22, -14, 3], [22, -14, 4], [-14, -32, 9], [-40, -58, 11], [-6, -60, 13], [42, -60, 10]].forEach(([x, z, top], b) => { for (let k = -8; k <= top; k++) floors.push(floorAt(k, x, z, false, b)); });
  const vibe = (f: Floor) => VIBES[f.h % VIBES.length], layout = (f: Floor) => { const [c, r, k] = GRIDS[(f.h * 7 + f.b + 1) % GRIDS.length], w = (f.m === 'side' ? SIDE.w : PANEL.w) * k, d = (f.m === 'side' ? SIDE.d : PANEL.d) * k; return { w, d, panes: grid(c, r, w, d) }; };
  for (const [m, buf] of [['ceiling', loBuf], ['side', loSideBuf]] as const) {
    const geo = mergeGeometries(buildRoom(.4, m).map(p => { p.geo.deleteAttribute('uv'); return p.geo; }), false)!, list = floors.filter(x => x.m === m), scale = new DataView(buf).getFloat32(0, true);
    if (4 + geo.attributes.position.count * 6 !== buf.byteLength) throw new Error('storey bake data does not match; rerun tools/bake-room.ts');
    geo.setAttribute('color', new THREE.BufferAttribute(new Uint16Array(buf.slice(4)), 3, true));
    const rooms = new THREE.InstancedMesh(geo, storeyMat, list.length); rooms.frustumCulled = false; city.add(rooms);
    list.forEach((x, i) => { dummy.position.set(x.x, x.k * STOREY, x.z); dummy.rotation.set(0, 0, 0, 'XYZ'); dummy.scale.set(m === 'ceiling' && x.h % 2 ? -1 : 1, 1, 1); dummy.updateMatrix(); rooms.setMatrixAt(i, dummy.matrix); rooms.setColorAt(i, new THREE.Color(vibe(x)[0]).multiplyScalar(scale * (x.near ? 1 : .6) * vibe(x)[1])); });
  }
  const paneBox = new THREE.BoxGeometry(1, .02, 1), panesIM = new THREE.InstancedMesh(paneBox, paneMat, floors.reduce((n, x) => n + layout(x).panes.length, 0)), backIM = new THREE.InstancedMesh(paneBox, frameMat, floors.length); panesIM.frustumCulled = backIM.frustumCulled = false; city.add(panesIM, backIM);
  const shaftGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, -.5, 0), patchGeo = new THREE.PlaneGeometry(1, 1), cityBeams: THREE.ShaderMaterial[] = [], cityPatches: THREE.MeshBasicMaterial[] = [];
  let pi = 0;
  floors.forEach((fl, fi) => {
    const onSide = fl.m === 'side', tint = new THREE.Color(vibe(fl)[0]), Y = fl.k * STOREY, L = layout(fl);
    // a wooden backing shows between the panes; flush with the wall or ceiling
    if (onSide) { dummy.position.set(fl.x + SIDE.x + .008, Y + SIDE.y, fl.z + SIDE.z); dummy.rotation.set(0, Math.PI / 2, -Math.PI / 2, 'ZYX'); } else { dummy.position.set(fl.x, Y + MOUNT + .008, fl.z + PZ); dummy.rotation.set(0, 0, 0, 'XYZ'); }
    dummy.scale.set(L.w + .16, 1, L.d + .16); dummy.updateMatrix(); backIM.setMatrixAt(fi, dummy.matrix);
    const lit = fl.near && onSide, S = new THREE.Vector3(.75, .42 + (fl.k & 3) * .07, -.25).normalize();
    const shaft = beamMat.clone(), patch = new THREE.MeshBasicMaterial({ color: tint, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false });
    if (lit) { shaft.uniforms.uColor.value.copy(tint); cityBeams.push(shaft); cityPatches.push(patch); }
    for (const p of L.panes) {
      if (onSide) { dummy.position.set(fl.x + SIDE.x - .005, Y + SIDE.y + p.z, fl.z + SIDE.z - p.x); dummy.rotation.set(0, Math.PI / 2, -Math.PI / 2, 'ZYX'); } else { dummy.position.set(fl.x + p.x, Y + MOUNT - .005, fl.z + p.z + PZ); dummy.rotation.set(0, 0, 0, 'XYZ'); }
      dummy.scale.set(p.w, 1, p.d); dummy.updateMatrix(); panesIM.setMatrixAt(pi, dummy.matrix); panesIM.setColorAt(pi++, tint);
      if (lit) {
        const px = SIDE.x, h = SIDE.y + p.z, py = Y + h, pz = SIDE.z - p.x, t = h / S.y;
        const a = new THREE.Mesh(shaftGeo, shaft), b = new THREE.Mesh(patchGeo, patch);
        a.matrixAutoUpdate = b.matrixAutoUpdate = a.frustumCulled = b.frustumCulled = false;
        a.matrix.set(0, S.x * -t, 0, px, 0, S.y * -t * -1, p.d, py, p.w, S.z * -t, 0, pz, 0, 0, 0, 1);
        b.matrix.set(0, -S.x / S.y * p.d, 0, px - S.x * t, 0, 0, 1, Y + .03, p.w, -S.z / S.y * p.d, 0, pz - S.z * t, 0, 0, 0, 1);
        city.add(a, b);
      }
    }
  });
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() } }, vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }', fragmentShader: 'uniform vec3 uTop, uHor; varying vec3 vP; void main(){ gl_FragColor=vec4(mix(uHor,uTop,smoothstep(-.05,.55,vP.y))*.14,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}' })); skyDome.visible = false; scene.add(skyDome);

  // ---- one pass straight to the screen: tone mapping happens in each material, so there are no full-screen passes to pay for; a soft sprite stands in for bloom ----
  const haloCanvas = document.createElement('canvas'); haloCanvas.width = haloCanvas.height = 128;
  { const g = haloCanvas.getContext('2d')!, r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.35, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(haloCanvas), blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true, toneMapped: false, fog: false })); halo.scale.setScalar(9); scene.add(halo);
  // compile every shader now, so the product and the building do not stall the scroll when they first appear
  root.visible = city.visible = skyDome.visible = true; renderer.compile(scene, camera); root.visible = city.visible = skyDome.visible = false;

  // ---- frame update ----
  // the camera's progress along its path is blurred, so it accelerates and brakes gently through every key
  const uTab = (() => {
    const N = 2048, R = 56; let a = Float32Array.from({ length: N + 1 }, (_, j) => { const q = j / N; let i = 0; while (i < cams.length - 2 && q > cams[i + 1][0]) i++; return i + clamp((q - cams[i][0]) / (cams[i + 1][0] - cams[i][0])); });
    for (let pass = 0; pass < 3; pass++) { const b = new Float32Array(N + 1); for (let i = 0; i <= N; i++) { let t = 0; for (let j = -R; j <= R; j++) t += a[Math.min(N, Math.max(0, i + j))]; b[i] = t / (2 * R + 1); } a = b; }
    return a;
  })();
  const n = cams.length, posC = new THREE.CatmullRomCurve3(cams.map(k => new THREE.Vector3(...k[1]))), tgtC = new THREE.CatmullRomCurve3(cams.map(k => new THREE.Vector3(...k[2])));
  const tgt = new THREE.Vector3(), mouse = { x: 0, y: 0, mx: 0, my: 0 }; addEventListener('pointermove', e => { mouse.mx = e.clientX / innerWidth - .5; mouse.my = e.clientY / innerHeight - .5; }, { passive: true });
  // never below one render pixel per CSS pixel: a blurry frame reads worse than a slightly slower one
  let dpr = Math.min(devicePixelRatio, weak ? 1 : 1.5), width = 2, height = 2, portrait = false, time = 0, curTod = 0, lastSun = '';
  const v = new THREE.Vector3(), right = new THREE.Vector3(), a1 = new THREE.Vector3(), a2 = new THREE.Vector3(), dullC = new THREE.Color(.74, .71, .67), warm = new THREE.Color(1, .82, .55), paneSky = new THREE.Color(1, .86, .66), finalSun = new THREE.Vector3(.35, .62, -.2), finalSunW = new THREE.Vector3(.1, .34, -.8), sunlit = new THREE.Color(6, 5, 3.6); // the other storeys are in sunlight while the city is dark

  // film finish for the captured frames: gentle bloom, a filmic curve, split toning and slight lens fringing
  beamMat.fragmentShader = managed(beamMat.fragmentShader); beamMat.needsUpdate = true; for (const m of cityBeams) { m.fragmentShader = beamMat.fragmentShader; m.needsUpdate = true; }
  for (const m of [dust.material, stageFloor.material, skyDome.material] as THREE.ShaderMaterial[]) { m.fragmentShader = managed(m.fragmentShader); m.needsUpdate = true; }
  let composer: EffectComposer | null = null;
  if (capture) {
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    composer.addPass(new RenderPass(scene, camera));
    const ao = new GTAOPass(scene, camera, 1, 1); ao.blendIntensity = .75; ao.updateGtaoMaterial({ radius: .45, distanceExponent: 1.2, thickness: 1, scale: 1, samples: 16 });
    // glows and light shafts must not count as surfaces for the shading
    const aoRender = ao.render.bind(ao), hid: THREE.Object3D[] = [];
    ao.render = (...args: Parameters<typeof aoRender>) => { scene.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material; if (o.visible && m && !Array.isArray(m) && ((m.transparent && !m.depthWrite) || m.colorWrite === false || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite)) { o.visible = false; hid.push(o); } }); aoRender(...args); for (const o of hid) o.visible = true; hid.length = 0; };
    composer.addPass(ao);
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), .16, .5, .95));
    composer.addPass(new OutputPass());
    composer.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null } }, vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }', fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec2 d=vUv-.5; vec3 c=texture2D(tDiffuse,vUv).rgb; c.r=texture2D(tDiffuse,vUv-d*.0012).r; c.b=texture2D(tDiffuse,vUv+d*.0012).b; c=mix(c,c*c*(3.-2.*c),.2); float l=dot(c,vec3(.2126,.7152,.0722)); c+=mix(vec3(-.008,0.,.014),vec3(.016,.006,-.012),smoothstep(.15,.85,l)); c=c*.97+.012; gl_FragColor=vec4(clamp(c,0.,1.),1.); }' }));
  }
  function resize() {
    width = canvas.clientWidth; height = canvas.clientHeight; portrait = width < height;
    renderer.setPixelRatio(dpr); renderer.setSize(width, height, false); composer?.setPixelRatio(dpr); composer?.setSize(width, height); bakeU.uRes.value.set(width * dpr, height * dpr);
    dustU.uDpr.value = dpr * height / 800; camera.aspect = width / height;
  }

  function update(p: number, dt: number) {
    time += dt;
    const ux = p * 2048, ui = Math.min(2047, ux | 0), u = (uTab[ui] + (uTab[ui + 1] - uTab[ui]) * (ux - ui)) / (n - 1);
    posC.getPoint(u, camera.position); tgtC.getPoint(u, tgt);
    const stage = stageAt(p), ki = u * (n - 1), k0 = Math.floor(ki), k1 = Math.min(n - 1, k0 + 1);
    camera.fov = lerp(cams[k0][3], cams[k1][3], ki - k0) * (portrait ? lerp(1.42, 2, stage) : 1);
    mouse.x += (mouse.mx - mouse.x) * .05; mouse.y += (mouse.my - mouse.y) * .05; camera.position.x += mouse.x * .16; camera.position.y -= mouse.y * .08;
    camera.position.y += Math.sin(seg(p, .205, .24) * Math.PI) * -.03; camera.lookAt(tgt); camera.updateProjectionMatrix();

    // product: flight, descent to the stage, explode and turn, return
    const flown = seg(p, .08, .21), dn = up(p, .43, .47) * (1 - up(p, .64, .7)), e = up(p, .47, .54) * (1 - up(p, .6, .66));
    root.visible = p > .07;
    if (flown < 1) flight.getPoint(smooth(flown), root.position); else root.position.set(0, lerp(wall ? WINY : MOUNT, STAGE_Y, dn), wall ? lerp(WZ, PZ, dn) : PZ);
    root.rotation.x = wall ? -Math.PI / 2 * (flown < 1 ? up(flown, .4, .7) : 1 - dn) : 0;
    spin.rotation.y = (1 - up(flown, 0, .7)) * 2.6 + // level and square before it reaches the ceiling or wall
       up(p, .45, .67) * Math.PI * 2;
    root.rotation.z = Math.sin(Math.min(flown / .7, 1) * Math.PI) * .1; spin.rotation.x = e * .22; product.explode(e);

    // day
    const ignite = up(p, .225, .29), tod = pw(TOD, p), s = sampleSky(tod), lit = 1 - stage; curTod = tod;
    if (wall) s.sun.set(s.sun.x * .5, Math.min(.36, Math.max(.2, s.sun.y * .5)), -.8).normalize(); // the sun stands outside the back wall and crosses it through the day
    product.power(Math.max(ignite, stage) * (1 - e * .55)); skyUniforms.uGain.value = (s.gain * .42 * ignite + .012) * (1 - e * .6); skyUniforms.uTime.value = time; skyUniforms.uSrc.value = Math.max(ignite, stage) * (1 - e * .35);
    const night = up(p, .86, 1), floorsIn = up(p, .88, .96);
    const dome = (skyDome.material as THREE.ShaderMaterial).uniforms; dome.uTop.value.copy(s.top); dome.uHor.value.copy(s.hor);
    s.top.lerp(paneSky, floorsIn); s.hor.lerp(paneSky, floorsIn); skyUniforms.uGain.value = lerp(skyUniforms.uGain.value, 2.4, floorsIn); s.key.lerp(paneSky, floorsIn); s.keyI = lerp(s.keyI, 9, floorsIn); s.sun.lerp(wall ? finalSunW : finalSun, floorsIn).normalize(); skyUniforms.uKey.value.copy(s.key); // from outside, this room's panes read like the others
    bakeU.uPanel.value.copy(s.rect).multiplyScalar(s.rectI * ignite * lit * .72).lerp(sunlit, floorsIn);
    bakeU.uAmb.value.copy(dullC).multiplyScalar(lerp(2.4, .25 + s.amb * 1.3, ignite) * lit * (1 - floorsIn * .8));
    room.visible = stage < .995;
    sun.color.copy(s.key); sun.intensity = s.keyI * 2.1 * ignite * lit; hangers.visible = room.visible; for (const m of hangMats) m.envMapIntensity = lerp(.04, .3 + s.amb * .95, ignite) * lit; sheen.material.color.copy(s.key); sheen.material.opacity = ignite * lit * (1 - night) * .16; sun.position.copy(sun.target.position).addScaledVector(s.sun, 18);
    for (const m of glossy) m.envMapIntensity = (.03 + s.amb * .2 * ignite) * lit;
    for (const m of productMats) m.envMapIntensity = m.map ? .08 : lerp(.35, .95, Math.max(ignite, stage)); // only the wood has a map; bright reflections wash it out
    glow.color.setRGB(3.4, 2, 1).multiplyScalar(night + .06);
    const dayBeam = ignite * (.17 - .05 * up(p, .7, .8)) * lit * (1 - night) * (1 - e * .4), beam = lerp(dayBeam, wall ? .3 : .15, floorsIn);
    beamU.uBeam.value = beam; beamU.uColor.value.copy(s.key); dustU.uA.value = dayBeam * 1.1; dustU.uTime.value = time; glowU.uA.value = stage * .24;
    stageFloor.visible = stage > .01;
    const by = root.position.y + layers[frameIdx].obj.position.y, dy = Math.max(.05, s.sun.y);
    // the sun mask sits behind the panes: slide it along the ray so light through it passes exactly through them
    if (!wall) { mask.position.x = s.sun.x / dy * (mask.position.y - by); mask.position.z = s.sun.z / dy * (mask.position.y - by); }
    // shafts follow the same sun direction as the light they cast, out to where it lands
    const t = wall ? (ZF - WZ) / -s.sun.z : Math.max(.05, by) / dy, rx = s.sun.x * t, ry = s.sun.y * t, rz = s.sun.z * t;
    for (const b of beamBits) {
      const q = b.userData.pane; b.visible = beam > .002;
      if (wall) b.matrix.set(1, rx, 0, q.x, 0, ry, 1, WINY + q.z, 0, rz, 0, WZ, 0, 0, 0, 1); else b.matrix.set(1, rx, 0, q.x, 0, ry, 0, by, 0, rz, 1, q.z + PZ, 0, 0, 0, 1);
    }
    if (wall) halo.position.set(0, WINY, WZ + .1); else halo.position.set(0, by - .1, PZ); halo.material.color.copy(skyUniforms.uKey.value); halo.material.opacity = skyUniforms.uSrc.value * .26 * lit * Math.max(1 - night, floorsIn); halo.visible = halo.material.opacity > .004;
    // the building reveal
    city.visible = skyDome.visible = p > .86;
    if (city.visible) { storeyMat.color.setScalar(5.5 * (floorsIn + .03)); paneMat.color.setScalar(3 * (floorsIn + .02)); frameMat.color.setRGB(.2, .1, .04).multiplyScalar(floorsIn + .02); for (const m of cityBeams) m.uniforms.uBeam.value = floorsIn * .35; for (const m of cityPatches) m.opacity = floorsIn * .8; }
    (scene.fog as THREE.FogExp2).color.copy(s.hor).multiplyScalar(.1);
    // finish
    bakeU.uSat.value = lerp(.34, 1, ignite); bakeU.uVig.value = lerp(.5, .32, ignite);
    renderer.toneMappingExposure = lerp(.9, 1.15, ignite);
    // shadows only redraw once the sun has moved visibly, because a redraw makes that frame late
    const key = `${sun.position.x.toFixed(1)},${sun.position.z.toFixed(1)},${root.position.y.toFixed(2)}`;
    if (key !== lastSun && sun.intensity > .01) { lastSun = key; renderer.shadowMap.needsUpdate = true; }
  }

  /** Screen position of a layer's right edge, in CSS pixels, for its label. */
  function labelAt(i: number) {
    const l = layers[i]; v.set(0, root.position.y + l.obj.position.y, root.position.z);
    camera.matrixWorld.extractBasis(right, a1, a2); v.addScaledVector(right, W / 2 + .35).project(camera);
    return { x: (v.x + 1) / 2 * width, y: (1 - v.y) / 2 * height };
  }

  return {
    update, resize, labelAt, layers,
    /** For exporting the room to Blender. */
    parts: { scene, camera, room, hangers, root, sun },
    get tod() { return curTod; },
    render: () => composer ? composer.render() : renderer.render(scene, camera),
    /** Step down on slow machines, never below one render pixel per CSS pixel. Returns false when nothing is left to drop. */
    degrade() {
      if (dpr > 1) { dpr = 1; resize(); return true; }
      if (sun.shadow.mapSize.x > 1024) { sun.shadow.mapSize.set(1024, 1024); sun.shadow.map?.dispose(); sun.shadow.map = null as never; lastSun = ''; return true; }
      return false;
    },
  };
}
