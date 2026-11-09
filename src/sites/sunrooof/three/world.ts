import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { createProduct, panes, HEIGHT, W, D } from './product';
import { clamp, grainTexture, lerp, sampleSky, seg, sky, skyUniforms, smooth, up, windowTexture, woodTexture } from './shared';

const H = 3.4, X = 5, ZB = -4.2, ZF = 7, PZ = -0.4, MOUNT = H - HEIGHT, STOREY = H + 0.42;

/** Dull room to product arrival, sunrise, exploded midday, bright noon, evening, then the building section at night. */
const CAMERA: [number, [number, number, number], [number, number, number], number][] = [
  [0, [0, 1.3, 6.5], [0, 1.95, -2], 40],
  [.1, [0, 1.3, 6.3], [0, 2.05, -2], 40],
  [.22, [-.5, 1.2, 5.6], [0, 2.4, -1.2], 42],
  [.33, [-1.5, 1.05, 4.5], [0, 2.75, -.4], 46],
  [.41, [.8, .95, 3.1], [0, 3, -.4], 50],
  [.5, [0, 1.8, 6.2], [0, 1.85, -.4], 36],
  [.62, [.5, 1.7, 6], [0, 1.85, -.4], 36],
  [.71, [1.2, 1.2, 5.2], [0, 2.3, -.8], 44],
  [.79, [2.6, 1.25, 5], [-.5, 1.75, -1.4], 44],
  [.87, [-2.4, 1.4, 5.8], [.2, 1.95, -1.5], 42],
  [.93, [-.5, 1.5, 15], [0, 2.1, 0], 38],
  [1, [-11, -2, 47], [-6, 9, 0], 31],
];

const TOD: [number, number][] = [[0, 0], [.3, 0], [.41, .36], [.7, .4], [.79, .4], [.86, .6], [.92, .8], [1, 1]];
const pw = (t: [number, number][], p: number) => { for (let i = 0; i < t.length - 1; i++) if (p <= t[i + 1][0]) return lerp(t[i][1], t[i + 1][1], smooth(seg(p, t[i][0], t[i + 1][0]))); return t[t.length - 1][1]; };

const stage0 = (p: number) => up(p, .42, .47) * (1 - up(p, .65, .71));

export function createWorld(canvas: HTMLCanvasElement) {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  RectAreaLightUniformsLib.init();

  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x000000, .0055);
  const camera = new THREE.PerspectiveCamera(40, 1, .1, 800);
  const pmrem = new THREE.PMREMGenerator(renderer), envTex = pmrem.fromScene(new RoomEnvironment(), .04).texture; // set per material: since r163 scene.environment ignores envMapIntensity

  // ---- room ----
  const room = new THREE.Group(); scene.add(room);
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: .92, ...o });
  const grain = grainTexture(), rg = grain.clone(); rg.repeat.set(5, 3); rg.needsUpdate = true;
  const floorMap = woodTexture([168, 122, 82]); floorMap.repeat.set(3, 4);
  const wall = std({ color: '#d6cec0', bumpMap: rg, bumpScale: .5 }), ceil = std({ color: '#e6e0d5' }), linen = std({ color: '#d9d0bf', bumpMap: rg, bumpScale: 1.4 }), cushion = std({ color: '#b98f62', bumpMap: rg, bumpScale: 1.4 });
  const floorMat = std({ map: floorMap, roughness: .42, envMap: envTex, envMapIntensity: .18 });
  const slatMap = woodTexture([96, 60, 36]); slatMap.rotation = Math.PI / 2; slatMap.repeat.set(.4, .2); const slat = std({ map: slatMap, roughness: .6 });
  const oak = std({ color: '#7a5233', roughness: .55 }), ink = std({ color: '#1b1a18', roughness: .4 }), stone = std({ color: '#b9b0a2', roughness: .8 }), leaf = std({ color: '#3f5a33', roughness: .55, side: THREE.DoubleSide });
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, ry = 0, shadow = true) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = shadow; o.receiveShadow = true; room.add(o); return o; };
  const rb = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, ry = 0, r = .05) => mesh(new RoundedBoxGeometry(w, h, d, 4, r), m, x, y, z, ry);
  const plain = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z, 0, false);
  const DEPTH = ZF - ZB, CZ = (ZF + ZB) / 2;
  plain(X * 2 + .6, .42, DEPTH, floorMat, 0, -.21, CZ); plain(X * 2 + .6, .42, DEPTH, ceil, 0, H + .21, CZ);
  plain(.3, H, DEPTH, wall, -X - .15, H / 2, CZ); plain(.3, H, DEPTH, wall, X + .15, H / 2, CZ); plain(X * 2, H, .3, wall, 0, H / 2, ZB - .15);
  // rug, sofa, table, chair
  mesh(new THREE.BoxGeometry(5.6, .02, 4.2), std({ color: '#a89a86', bumpMap: rg, bumpScale: 3 }), .3, .012, .9, 0, false);
  rb(1, .42, 3.5, linen, 2.3, .28, .8); rb(.32, .82, 3.5, linen, 2.72, .5, .8); rb(2.4, .42, 1, linen, 1.2, .28, -.65); rb(2.4, .8, .32, linen, 1.2, .5, -1.0);
  for (const z of [-.05, .85, 1.75]) rb(.86, .22, .86, linen, 2.28, .59, z, 0, .1);
  for (const [x, z, r] of [[2.5, -.1, .2], [2.5, 1.9, -.2], [.5, -.86, 0]]) { const c = rb(.14, .5, .56, cushion, x, .78, z, r, .07); if (x < 1) c.rotation.y = Math.PI / 2; }
  mesh(new THREE.CylinderGeometry(.85, .85, .07, 48), oak, -.2, .4, .95); mesh(new THREE.CylinderGeometry(.62, .7, .36, 48), oak, -.2, .18, .95);
  mesh(new THREE.CylinderGeometry(.2, .14, .16, 24), stone, -.2, .52, .9); mesh(new THREE.BoxGeometry(.42, .05, .3), ink, .15, .46, 1.2, .3);
  rb(.92, .12, .86, cushion, -3, .42, 2.3, .55); rb(.14, .72, .86, cushion, -3.42, .72, 2.06, .55); rb(.9, .05, .05, oak, -3, .24, 2.75, .55);
  // walls: art, slats, shelves
  rb(2.6, 1.3, .05, std({ color: '#b89c7a' }), .2, 1.9, ZB + .05, 0, .01); rb(1.5, 1.05, .02, std({ color: '#8a6d52' }), -.1, 1.9, ZB + .09, 0, .004); rb(.5, 1.05, .02, std({ color: '#cdb695' }), .95, 1.9, ZB + .09, 0, .004);
  rb(3.2, .55, .46, oak, .2, .28, ZB + .26, 0, .02);
  for (let i = 0; i < 26; i++) mesh(new THREE.BoxGeometry(.06, H, .1), slat, -X + .05, H / 2, ZB + .4 + i * .17, 0, false);
  rb(.04, 1.5, 2.5, ink, -X + .15, 1.65, 1.1, 0, .01);
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0), toneMapped: false });
  for (const y of [1, 1.7, 2.4]) { mesh(new THREE.BoxGeometry(.34, .05, 2.3), oak, X - .17, y, -2.3, 0, false); mesh(new THREE.BoxGeometry(.02, .02, 2.2), glow, X - .32, y - .04, -2.3, 0, false); for (let i = 0; i < 4; i++) rb(.2, .2 + (i * 7 % 3) * .09, .22, i % 2 ? stone : oak, X - .17, y + .13, -3.2 + i * .62 + (y * 3 % .2), 0, .03); }
  // plants
  const addPlant = (x: number, z: number, s: number) => {
    mesh(new THREE.CylinderGeometry(.27 * s, .2 * s, .5 * s, 24), stone, x, .25 * s, z);
    const g = new THREE.SphereGeometry(1, 8, 6); g.scale(.1, .012, .42); g.translate(0, 0, .42);
    const n = 90, im = new THREE.InstancedMesh(g, leaf, n), o = new THREE.Object3D();
    for (let i = 0; i < n; i++) { const t = i / n, h = (.55 + t * 1.5) * s; o.position.set(x, h, z); o.rotation.set(-.2 - t * .75 + Math.random() * .3, i * 2.4, 0, 'YXZ'); o.scale.setScalar((1.25 - t * .55) * s); o.updateMatrix(); im.setMatrixAt(i, o.matrix); }
    im.castShadow = im.receiveShadow = true; room.add(im);
  };
  addPlant(-4.1, -3.3, 1.1); addPlant(4.2, 3.4, 1); addPlant(-1.7, ZB + .55, .7);

  // ---- product ----
  const product = createProduct(), { root, spin, layers } = product; scene.add(root); root.visible = false;
  const frameIdx = layers.length - 1;
  layers.forEach((l, i) => l.obj.traverse(o => {
    (o as THREE.Mesh).castShadow = i === frameIdx;
    for (const m of [(o as THREE.Mesh).material].flat() as THREE.MeshStandardMaterial[]) if (m?.isMeshStandardMaterial) { m.envMap = envTex; m.needsUpdate = true; }
  }));
  const flight = new THREE.CatmullRomCurve3([[1.6, 3, 11.5], [-1.2, 2.95, 5.6], [.7, 2.5, 1.6], [0, 2.4, PZ], [0, MOUNT, PZ]].map(a => new THREE.Vector3(...(a as [number, number, number]))));

  // ---- light ----
  const hemi = new THREE.HemisphereLight('#ffffff', '#6f5a45', 0); scene.add(hemi);
  const rect = new THREE.RectAreaLight('#ffffff', 0, W, D); rect.position.set(0, MOUNT - .02, PZ); rect.lookAt(0, 0, PZ); scene.add(rect);
  const sun = new THREE.DirectionalLight('#ffffff', 0); sun.castShadow = true; sun.target.position.set(0, 0, PZ); scene.add(sun, sun.target);
  sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048); sun.shadow.radius = 3; sun.shadow.bias = -.0006; sun.shadow.normalBias = .02;
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 34 });
  const shelf = new THREE.PointLight('#ffb36b', 0, 7, 2); shelf.position.set(X - .8, 1.7, -2.3); scene.add(shelf);

  // ceiling mask: sun only reaches the room through the panes
  const shape = new THREE.Shape([[-20, -20], [20, -20], [20, 20], [-20, 20]].map(([a, b]) => new THREE.Vector2(a, b)));
  for (const p of panes()) { const h = new THREE.Path(); h.moveTo(p.x - p.w / 2, p.z - p.d / 2 + PZ); h.lineTo(p.x + p.w / 2, p.z - p.d / 2 + PZ); h.lineTo(p.x + p.w / 2, p.z + p.d / 2 + PZ); h.lineTo(p.x - p.w / 2, p.z + p.d / 2 + PZ); shape.holes.push(h); }
  const maskGeo = new THREE.ShapeGeometry(shape); maskGeo.rotateX(Math.PI / 2);
  const mask = new THREE.Mesh(maskGeo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide })); mask.position.y = H + .03; mask.castShadow = true; scene.add(mask);

  // ---- light shafts and dust ----
  const beamU = { uBeam: { value: 0 }, uColor: { value: new THREE.Color(1, .85, .6) } };
  const beamMat = new THREE.ShaderMaterial({
    uniforms: beamU, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: 'varying float vY; varying vec3 vN, vV; void main(){ vY=-position.y; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'uniform float uBeam; uniform vec3 uColor; varying float vY; varying vec3 vN, vV; void main(){ float a=pow(1.-clamp(vY,0.,1.),1.5)*pow(abs(dot(normalize(vN),normalize(vV))),1.6); gl_FragColor=vec4(uColor*a*uBeam,1.); }',
  });
  const beamBits = panes().map(p => { const g = new THREE.BoxGeometry(p.w, 1, p.d); g.translate(0, -.5, 0); const m = new THREE.Mesh(g, beamMat); m.matrixAutoUpdate = false; m.frustumCulled = false; m.userData.pane = p; scene.add(m); return m; });
  const N = coarse ? 220 : 520, pts = new Float32Array(N * 3); for (let i = 0; i < N; i++) { pts[i * 3] = Math.random() * 7 - 3.5; pts[i * 3 + 1] = Math.random() * H; pts[i * 3 + 2] = Math.random() * 6 - 3.2; }
  const dustG = new THREE.BufferGeometry(); dustG.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const dustU = { uTime: { value: 0 }, uA: { value: 0 }, uColor: beamU.uColor, uDpr: { value: 1 } };
  const dust = new THREE.Points(dustG, new THREE.ShaderMaterial({
    uniforms: dustU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'uniform float uTime, uDpr; void main(){ vec3 p=position; p.x+=sin(uTime*.1+p.z*2.)*.25; p.y=mod(p.y+uTime*.03,3.3); p.z+=cos(uTime*.08+p.x)*.25; vec4 mv=modelViewMatrix*vec4(p,1.); gl_PointSize=(8.*uDpr)/-mv.z; gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'uniform float uA; uniform vec3 uColor; void main(){ float d=length(gl_PointCoord-.5); gl_FragColor=vec4(uColor*smoothstep(.5,.0,d)*uA,1.); }',
  }));
  dust.frustumCulled = false; scene.add(dust);

  // ---- the building at the end: other storeys and neighbouring towers ----
  const city = new THREE.Group(); city.visible = false; scene.add(city);
  const shellMat = new THREE.MeshBasicMaterial({ color: '#000' }), slabMat = new THREE.MeshBasicMaterial({ color: '#000' }), paneMat = new THREE.MeshBasicMaterial({ color: '#000', toneMapped: false });
  const allPanes = panes(), floors = [-3, -2, -1, 1, 2, 3, 4, 5];
  const panesIM = new THREE.InstancedMesh(new THREE.BoxGeometry(1, .02, 1), paneMat, allPanes.length * floors.length); let pi = 0; const dummy = new THREE.Object3D();
  for (const k of floors) {
    const y = k * STOREY, add = (w: number, h: number, d: number, m: THREE.Material, px: number, py: number, pz: number) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(px, py, pz); city.add(b); };
    add(X * 2 + .6, .42, DEPTH, slabMat, 0, y - .21, CZ); add(.3, H, DEPTH, shellMat, -X - .15, y + H / 2, CZ); add(.3, H, DEPTH, shellMat, X + .15, y + H / 2, CZ); add(X * 2, H, .3, shellMat, 0, y + H / 2, ZB - .15);
    if (k === 5) add(X * 2 + .6, .42, DEPTH, slabMat, 0, y + H + .21, CZ);
    add(3, .8, 1.2, slabMat, -.4, y + .4, .6); add(2, .9, .9, slabMat, 2.4, y + .45, -1.6);
    for (const p of allPanes) { dummy.position.set(p.x, y + MOUNT, p.z + PZ); dummy.scale.set(p.w, 1, p.d); dummy.updateMatrix(); panesIM.setMatrixAt(pi++, dummy.matrix); }
  }
  city.add(panesIM);
  const winTex = windowTexture(), towerMat = new THREE.MeshStandardMaterial({ color: '#10141f', metalness: .7, roughness: .3, emissive: '#ffffff', emissiveMap: winTex, emissiveIntensity: 0, envMapIntensity: .35 });
  [[-20, 0, 12, 100, 14], [21, -2, 13, 96, 16], [-36, -18, 14, 130, 14], [38, -22, 15, 140, 13], [-14, -32, 13, 150, 11], [13, -38, 16, 170, 14], [-56, -40, 16, 120, 16], [58, -44, 18, 150, 16]].forEach(([x, z, w, h, d]) => {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 40, uv.getY(i) * h / 96);
    const t = new THREE.Mesh(g, towerMat); t.position.set(x, h / 2 - 34, z); city.add(t);
  });
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { uTop: skyUniforms.uTop, uHor: skyUniforms.uHor }, vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }', fragmentShader: 'uniform vec3 uTop, uHor; varying vec3 vP; void main(){ gl_FragColor=vec4(mix(uHor,uTop,smoothstep(-.05,.55,vP.y))*.3,1.); }' })); skyDome.visible = false; scene.add(skyDome);

  // ---- post ----
  const target = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: coarse ? 0 : 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, 2, 2);
  gtao.updateGtaoMaterial({ radius: .55, distanceExponent: 1.4, thickness: 1, scale: 1.2, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 }); gtao.blendIntensity = 1;
  const noAO: THREE.Object3D[] = [...beamBits, mask, dust, skyDome]; spin.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material; if (m && !Array.isArray(m) && m.transparent) noAO.push(o); });
  const hide = gtao.overrideVisibility; gtao.overrideVisibility = function () { hide.call(this); noAO.forEach(o => { o.visible = false; }); };
  gtao.enabled = !coarse; composer.addPass(gtao);
  const bloom = new UnrealBloomPass(new THREE.Vector2(2, 2), .22, .55, 1.15); composer.addPass(bloom);
  const grade = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uSat: { value: .4 }, uVig: { value: .35 }, uGr: { value: .03 }, uT: { value: 0 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }', fragmentShader: 'uniform sampler2D tDiffuse; uniform float uSat,uVig,uGr,uT; varying vec2 vUv; float r(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233))+uT)*43758.5453);} void main(){ vec4 c=texture2D(tDiffuse,vUv); float l=dot(c.rgb,vec3(.2126,.7152,.0722)); c.rgb=mix(vec3(l),c.rgb,uSat); vec2 q=vUv-.5; c.rgb*=1.-uVig*smoothstep(.25,.85,dot(q,q)*2.); c.rgb+=(r(vUv)-.5)*uGr*(l+.15); gl_FragColor=c; }' });
  composer.addPass(grade); composer.addPass(new OutputPass());

  // ---- frame update ----
  const n = CAMERA.length, posC = new THREE.CatmullRomCurve3(CAMERA.map(k => new THREE.Vector3(...k[1]))), tgtC = new THREE.CatmullRomCurve3(CAMERA.map(k => new THREE.Vector3(...k[2])));
  const tgt = new THREE.Vector3(), mouse = { x: 0, y: 0, mx: 0, my: 0 }; addEventListener('pointermove', e => { mouse.mx = e.clientX / innerWidth - .5; mouse.my = e.clientY / innerHeight - .5; }, { passive: true });
  let dpr = Math.min(devicePixelRatio, coarse ? 1.5 : 1.75), width = 2, height = 2, portrait = false, time = 0, curTod = 0;
  const v = new THREE.Vector3();

  function resize() {
    width = canvas.clientWidth; height = canvas.clientHeight; portrait = width < height;
    renderer.setPixelRatio(dpr); renderer.setSize(width, height, false); composer.setPixelRatio(dpr); composer.setSize(width, height);
    dustU.uDpr.value = dpr * height / 800; camera.aspect = width / height;
  }

  function update(p: number, dt: number) {
    time += dt;
    // camera
    let i = 0; while (i < n - 2 && p > CAMERA[i + 1][0]) i++;
    const u = (i + clamp((p - CAMERA[i][0]) / (CAMERA[i + 1][0] - CAMERA[i][0]))) / (n - 1);
    posC.getPoint(u, camera.position); tgtC.getPoint(u, tgt);
    const ki = u * (n - 1), k0 = Math.floor(ki), k1 = Math.min(n - 1, k0 + 1); camera.fov = lerp(CAMERA[k0][3], CAMERA[k1][3], smooth(ki - k0)) * (portrait ? lerp(1.42, 2, stage0(p)) : 1);
    mouse.x += (mouse.mx - mouse.x) * .05; mouse.y += (mouse.my - mouse.y) * .05; camera.position.x += mouse.x * .16; camera.position.y -= mouse.y * .08;
    camera.position.y += Math.sin(seg(p, .205, .24) * Math.PI) * -.03; camera.lookAt(tgt); camera.updateProjectionMatrix();

    // product: flight, descent to the stage, explode and turn, return
    const flown = seg(p, .08, .21), stage = up(p, .42, .47) * (1 - up(p, .65, .71)), dn = up(p, .41, .47) * (1 - up(p, .64, .7)), e = up(p, .46, .54) * (1 - up(p, .6, .66));
    root.visible = p > .07;
    if (flown < 1) flight.getPoint(smooth(flown), root.position); else root.position.set(0, MOUNT - dn * 1.25, PZ);
    spin.rotation.y = (1 - smooth(flown)) * 2.6 + up(p, .45, .67) * Math.PI * 2;
    root.rotation.z = Math.sin(flown * Math.PI) * .28; spin.rotation.x = e * .22; product.explode(e);

    // day
    const ignite = up(p, .225, .29), tod = pw(TOD, p), s = sampleSky(tod), off = 1 - stage * .96; curTod = tod;
    product.power(Math.max(ignite, stage) * (1 - e * .62)); skyUniforms.uGain.value = (s.gain * .62 * ignite + .012) * (1 - e * .72); skyUniforms.uTime.value = time;
    const night = up(p, .86, 1), floorsIn = up(p, .88, .96);
    hemi.color.copy(ignite > .01 ? s.rect : sky.rect.clone().set('#9aa6b3')); hemi.color.lerp(new THREE.Color('#9aa6b3'), 1 - ignite);
    hemi.intensity = lerp(.55, .1 + s.amb * .55, ignite) * off;
    rect.color.copy(s.rect); rect.intensity = s.rectI * ignite * off * .8;
    sun.color.copy(s.key); sun.intensity = s.keyI * ignite * (1 - stage); sun.position.copy(sun.target.position).addScaledVector(s.sun, 18);
    sun.castShadow = sun.intensity > .01;
    glow.color.setRGB(3.4, 2, 1).multiplyScalar(night + .06); shelf.intensity = night * 7 + .1;
    const beam = (ignite * (.075 - .03 * up(p, .7, .8)) + stage * .07) * (1 - night) * (1 - e * .55);
    beamU.uBeam.value = beam; beamU.uColor.value.copy(s.rect).lerp(new THREE.Color(1, .82, .55), stage); dustU.uA.value = beam * 2.2; dustU.uTime.value = time;
    const by = root.position.y + layers[frameIdx].obj.position.y, L = Math.max(.05, by), shear = 1 - stage;
    const dx = clamp(s.sun.x / Math.max(.2, s.sun.y), -1.5, 1.5) * shear, dz = clamp(s.sun.z / Math.max(.2, s.sun.y), -1.5, 1.5) * shear;
    for (const b of beamBits) { const q = b.userData.pane; b.visible = beam > .002; b.matrix.set(1, dx * L, 0, q.x, 0, L, 0, by, 0, dz * L, 1, q.z + PZ, 0, 0, 0, 1); }
    // the building reveal
    city.visible = skyDome.visible = p > .86;
    if (city.visible) {
      const fade = floorsIn;
      shellMat.color.setRGB(.95, .55, .3).multiplyScalar(.2 * fade + .02); slabMat.color.setRGB(1, .72, .5).multiplyScalar(.42 * fade + .02);
      paneMat.color.setRGB(s.rect.r, s.rect.g, s.rect.b).multiplyScalar(1.8 * fade + .02); towerMat.emissiveIntensity = night * .55;
    }
    (scene.fog as THREE.FogExp2).color.copy(s.hor).multiplyScalar(.28);
    // finish
    (grade.uniforms.uSat as { value: number }).value = lerp(.32, 1, ignite); (grade.uniforms.uVig as { value: number }).value = lerp(.5, .35, ignite) + stage * .5; (grade.uniforms.uT as { value: number }).value = time % 10;
    bloom.strength = .24; renderer.toneMappingExposure = lerp(.85, 1.15, ignite);
    renderer.shadowMap.needsUpdate = true;
  }

  /** Screen position of a layer's right edge, in CSS pixels, for its label. */
  function labelAt(i: number) {
    const l = layers[i]; v.set(0, root.position.y + l.obj.position.y, root.position.z);
    const right = new THREE.Vector3(); camera.matrixWorld.extractBasis(right, new THREE.Vector3(), new THREE.Vector3());
    v.addScaledVector(right, W / 2 + .35).project(camera);
    return { x: (v.x + 1) / 2 * width, y: (1 - v.y) / 2 * height };
  }

  return {
    update, resize, labelAt, layers,
    get tod() { return curTod; },
    render: () => composer.render(),
    /** Step quality down on slow machines. Returns false when nothing is left to drop. */
    degrade() {
      if (gtao.enabled) { gtao.enabled = false; return true; }
      if (target.samples) { target.samples = 0; composer.renderTarget1.samples = 0; composer.renderTarget2.samples = 0; composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); return true; }
      if (dpr > 1) { dpr = 1; resize(); return true; }
      if (bloom.enabled) { bloom.enabled = false; return true; }
      if (dpr > .7) { dpr = .7; resize(); return true; }
      return false;
    },
  };
}
