import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createProduct, panes, W } from './product';
import { buildRoom, H, NO_CAST, PALETTE, PANEL, SIDE, WINDOW, X, ZF, type Key, type Mount } from './room';
import { artTexture, clamp, lerp, plasterTexture, sampleSky, seg, skyUniforms, smooth, up, weaveTexture, woodTexture } from './shared';

const PZ = PANEL.z, MOUNT = PANEL.y, WINY = WINDOW.y, WZ = WINDOW.z, STAGE_Y = 1.84, STOREY = H + 0.85; // two 0.42 slabs plus a gap: overlapping slabs share a front face and flicker

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
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;

  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x000000, .0055);
  const camera = new THREE.PerspectiveCamera(40, 1, .1, 800);
  const envTex = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;

  // ---- room: all fill light is pre-computed per vertex (tools/bake-room.ts), so the only live light is the sun ----
  const bakeU = { uPanel: { value: new THREE.Color(0, 0, 0) }, uAmb: { value: new THREE.Color(0, 0, 0) }, uMaxA: { value: new DataView(hiBuf).getFloat32(0, true) }, uMaxB: { value: new DataView(hiBuf).getFloat32(4, true) }, uSat: { value: .34 }, uVig: { value: .5 }, uRes: { value: new THREE.Vector2(1, 1) } };
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
  const plaster = plasterTexture(), weave = weaveTexture(), rugMap = weaveTexture(); plaster.repeat.set(.4, .4); weave.repeat.set(7, 7); rugMap.repeat.set(3, 3);
  const glossy: THREE.MeshStandardMaterial[] = [], gloss = (m: THREE.MeshStandardMaterial) => { m.envMap = envTex; glossy.push(m); return m; };
  const col = (k: Key) => new THREE.Color(PALETTE[k]);
  const mats: Record<Key, THREE.Material> = {
    wall: matte({ color: col('wall'), map: plaster }), ceil: matte({ color: col('ceil'), map: plaster }), trim: matte({ color: col('trim') }),
    floor: gloss(baked({ map: floorMap, roughness: .38 })), rug: matte({ color: col('rug'), map: rugMap }),
    linen: matte({ color: col('linen'), map: weave }), cushion: matte({ color: col('cushion'), map: weave }),
    slat: gloss(baked({ map: slatMap, roughness: .55 })), oak: gloss(baked({ map: oakMap, roughness: .48 })), ink: gloss(baked({ color: col('ink'), roughness: .35 })),
    stone: gloss(baked({ color: col('stone'), roughness: .55 })), leaf: matte({ color: col('leaf'), side: THREE.DoubleSide }), soil: matte({ color: col('soil') }),
    art: matte({ map: artTexture() }), shade: matte({ color: col('shade'), side: THREE.DoubleSide }),
  };
  const room = new THREE.Group(); scene.add(room);
  let off = 8;
  for (const { key, geo } of buildRoom(.1, mount)) {
    const n = geo.attributes.position.count; geo.setAttribute('aBake', new THREE.BufferAttribute(new Uint8Array(hiBuf, off, n * 4), 4, true)); off += n * 4;
    const m = new THREE.Mesh(geo, mats[key]); m.receiveShadow = true; m.matrixAutoUpdate = false; room.add(m);
  }
  if (off !== hiBuf.byteLength) throw new Error('bake data does not match the room; rerun tools/bake-room.ts');
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0) });
  for (const y of [1, 1.7, 2.4]) { const b = new THREE.Mesh(new THREE.BoxGeometry(.02, .012, 2.2), glow); b.position.set(X - .32, y - .032, -2.3); room.add(b); }

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
  sun.shadow.mapSize.setScalar(capture ? 4096 : coarse || weak ? 1024 : 2048); sun.shadow.radius = 2.5; sun.shadow.bias = -.0005; sun.shadow.normalBias = .025;
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 34 });
  const shape = new THREE.Shape([[-20, -20], [20, -20], [20, 20], [-20, 20]].map(([a, b]) => new THREE.Vector2(a, b)));
  const holeZ = wall ? WINY : PZ;
  for (const p of panes()) { const h = new THREE.Path(); h.moveTo(p.x - p.w / 2, p.z - p.d / 2 + holeZ); h.lineTo(p.x + p.w / 2, p.z - p.d / 2 + holeZ); h.lineTo(p.x + p.w / 2, p.z + p.d / 2 + holeZ); h.lineTo(p.x - p.w / 2, p.z + p.d / 2 + holeZ); shape.holes.push(h); }
  const maskGeo = new THREE.ShapeGeometry(shape); if (!wall) maskGeo.rotateX(Math.PI / 2);
  const mask = new THREE.Mesh(maskGeo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide })); if (wall) mask.position.z = WZ - .03; else mask.position.y = H + .03; mask.castShadow = true; scene.add(mask);
  // the shadow map draws the low-detail room: same silhouettes, a fraction of the triangles
  const casters = new THREE.Mesh(mergeGeometries(buildRoom(.4, mount).filter(p => !NO_CAST.includes(p.key)).map(p => p.geo), false)!, mask.material); casters.castShadow = true; casters.matrixAutoUpdate = false; room.add(casters);

  // ---- light shafts, dust, stage glow ----
  const beamU = { uBeam: { value: 0 }, uColor: { value: new THREE.Color(1, .85, .6) } };
  const beamMat = new THREE.ShaderMaterial({
    uniforms: beamU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying float vY; varying vec3 vN, vV; void main(){ vY=-position.y; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'uniform float uBeam; uniform vec3 uColor; varying float vY; varying vec3 vN, vV; void main(){ float a=pow(1.-clamp(vY,0.,1.),1.3)*pow(abs(dot(normalize(vN),normalize(vV))),1.6); gl_FragColor=vec4(uColor*a*uBeam*1.5,1.); }',
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
  const allPanes = panes(), dummy = new THREE.Object3D(), y0 = layers[frameIdx].y0, sideScale = SIDE.w / PANEL.w;
  const TINTS = ['#fff0dc', '#ffb27e', '#ff9a5a', '#ffc48a', '#dfeaff', '#ff8f5a', '#ffcfa0', '#e8f0ff'];
  type Floor = { k: number; m: Mount; tint: string; x: number; z: number; near: boolean };
  const floors: Floor[] = [-3, -2, -1, 1, 2, 3, 4, 5].map((k, i) => ({ k, m: i % 2 ? 'side' : 'ceiling', tint: TINTS[i], x: 0, z: 0, near: true }));
  // the neighbouring buildings are the same stack of lit rooms
  [[-22, -14, 3], [22, -14, 4], [-14, -32, 9], [-40, -58, 11], [-6, -60, 13], [42, -60, 10]].forEach(([x, z, top], b) => { for (let k = -8; k <= top; k++) floors.push({ k, m: (k + b) % 2 ? 'side' : 'ceiling', tint: TINTS[((k + 8) * 3 + b * 5) % 8], x, z, near: false }); });
  for (const [m, buf] of [['ceiling', loBuf], ['side', loSideBuf]] as const) {
    const geo = mergeGeometries(buildRoom(.4, m).map(p => { p.geo.deleteAttribute('uv'); return p.geo; }), false)!, list = floors.filter(x => x.m === m), scale = new DataView(buf).getFloat32(0, true);
    if (4 + geo.attributes.position.count * 6 !== buf.byteLength) throw new Error('storey bake data does not match; rerun tools/bake-room.ts');
    geo.setAttribute('color', new THREE.BufferAttribute(new Uint16Array(buf.slice(4)), 3, true));
    const rooms = new THREE.InstancedMesh(geo, storeyMat, list.length); rooms.frustumCulled = false; city.add(rooms);
    list.forEach((x, i) => { dummy.position.set(x.x, x.k * STOREY, x.z); dummy.rotation.set(0, 0, 0, 'XYZ'); dummy.scale.setScalar(1); dummy.updateMatrix(); rooms.setMatrixAt(i, dummy.matrix); rooms.setColorAt(i, new THREE.Color(x.tint).multiplyScalar(scale * (x.near ? 1 : .6))); });
  }
  const panesIM = new THREE.InstancedMesh(new THREE.BoxGeometry(1, .02, 1), paneMat, allPanes.length * floors.length); panesIM.frustumCulled = false; city.add(panesIM);
  const shaftGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, -.5, 0), patchGeo = new THREE.PlaneGeometry(1, 1), cityBeams: THREE.ShaderMaterial[] = [], cityPatches: THREE.MeshBasicMaterial[] = [];
  let pi = 0;
  for (const f of floors) {
    const onSide = f.m === 'side', sc = onSide ? sideScale : 1, tint = new THREE.Color(f.tint), Y = f.k * STOREY;
    if (f.near) {
      const fr = layers[frameIdx].obj.clone(); fr.traverse(o => { o.castShadow = false; });
      if (onSide) { fr.position.set(SIDE.x + y0 * sc, Y + SIDE.y, SIDE.z); fr.rotation.set(0, Math.PI / 2, -Math.PI / 2, 'ZYX'); fr.scale.setScalar(sc); } else fr.position.set(0, Y + MOUNT + y0, PZ);
      city.add(fr);
    }
    // sunlight through each side window: a shaft per pane and the patch it lands on, at this floor's own hour
    const S = new THREE.Vector3(.75, .42 + (f.k & 3) * .07, -.25).normalize();
    const shaft = beamMat.clone(), patch = new THREE.MeshBasicMaterial({ color: tint, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false });
    if (f.near && onSide) { shaft.uniforms.uColor.value.copy(tint); cityBeams.push(shaft); cityPatches.push(patch); }
    for (const p of allPanes) {
      if (onSide) { dummy.position.set(f.x + SIDE.x - .005, Y + SIDE.y + p.z * sc, f.z + SIDE.z - p.x * sc); dummy.rotation.set(0, Math.PI / 2, -Math.PI / 2, 'ZYX'); } else { dummy.position.set(f.x + p.x, Y + MOUNT - .005, f.z + p.z + PZ); dummy.rotation.set(0, 0, 0, 'XYZ'); }
      dummy.scale.set(p.w * sc, 1, p.d * sc); dummy.updateMatrix(); panesIM.setMatrixAt(pi, dummy.matrix); panesIM.setColorAt(pi++, tint);
      if (f.near && onSide) {
        const px = SIDE.x, h = SIDE.y + p.z * sc, py = Y + h, pz = SIDE.z - p.x * sc, pw = p.w * sc, ph = p.d * sc, t = h / S.y;
        const a = new THREE.Mesh(shaftGeo, shaft), b = new THREE.Mesh(patchGeo, patch);
        a.matrixAutoUpdate = b.matrixAutoUpdate = a.frustumCulled = b.frustumCulled = false;
        a.matrix.set(0, S.x * t, 0, px, 0, S.y * t, ph, py, pw, S.z * t, 0, pz, 0, 0, 0, 1);
        b.matrix.set(0, -S.x / S.y * ph, 0, px - S.x * t, 0, 0, 1, Y + .03, pw, -S.z / S.y * ph, 0, pz - S.z * t, 0, 0, 0, 1);
        city.add(a, b);
      }
    }
  }
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
  const v = new THREE.Vector3(), right = new THREE.Vector3(), a1 = new THREE.Vector3(), a2 = new THREE.Vector3(), dullC = new THREE.Color(.62, .68, .78), warm = new THREE.Color(1, .82, .55), paneSky = new THREE.Color(1, .86, .66), sunlit = new THREE.Color(6, 5, 3.6); // the other storeys are in sunlight while the city is dark

  function resize() {
    width = canvas.clientWidth; height = canvas.clientHeight; portrait = width < height;
    renderer.setPixelRatio(dpr); renderer.setSize(width, height, false); bakeU.uRes.value.set(width * dpr, height * dpr);
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
    root.rotation.x = wall ? -Math.PI / 2 * (flown < 1 ? up(flown, .45, .95) : 1 - dn) : 0;
    spin.rotation.y = (1 - smooth(flown)) * 2.6 + up(p, .45, .67) * Math.PI * 2;
    root.rotation.z = Math.sin(flown * Math.PI) * .1; spin.rotation.x = e * .22; product.explode(e);

    // day
    const ignite = up(p, .225, .29), tod = pw(TOD, p), s = sampleSky(tod), lit = 1 - stage; curTod = tod;
    if (wall) s.sun.set(s.sun.x * .5, Math.min(.36, Math.max(.2, s.sun.y * .5)), -.8).normalize(); // the sun stands outside the back wall and crosses it through the day
    product.power(Math.max(ignite, stage) * (1 - e * .55)); skyUniforms.uGain.value = (s.gain * .42 * ignite + .012) * (1 - e * .6); skyUniforms.uTime.value = time;
    const night = up(p, .86, 1), floorsIn = up(p, .88, .96);
    const dome = (skyDome.material as THREE.ShaderMaterial).uniforms; dome.uTop.value.copy(s.top); dome.uHor.value.copy(s.hor);
    s.top.lerp(paneSky, floorsIn); s.hor.lerp(paneSky, floorsIn); skyUniforms.uGain.value = lerp(skyUniforms.uGain.value, 2.4, floorsIn); // from outside, this room's panes read like the others
    bakeU.uPanel.value.copy(s.rect).multiplyScalar(s.rectI * ignite * lit * .38).lerp(sunlit, floorsIn);
    bakeU.uAmb.value.copy(dullC).multiplyScalar(lerp(2.4, .2 + s.amb * .75, ignite) * lit * (1 - floorsIn * .8));
    room.visible = stage < .995;
    sun.color.copy(s.key); sun.intensity = s.keyI * 1.7 * ignite * lit; sun.position.copy(sun.target.position).addScaledVector(s.sun, 18);
    for (const m of glossy) m.envMapIntensity = (.03 + s.amb * .2 * ignite) * lit;
    for (const m of productMats) m.envMapIntensity = lerp(.35, .95, Math.max(ignite, stage));
    glow.color.setRGB(3.4, 2, 1).multiplyScalar(night + .06);
    const beam = ignite * (.13 - .05 * up(p, .7, .8)) * lit * (1 - night) * (1 - e * .4);
    beamU.uBeam.value = beam; beamU.uColor.value.copy(s.key); dustU.uA.value = beam * 1.1; dustU.uTime.value = time; glowU.uA.value = stage * .34;
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
    if (wall) halo.position.set(0, WINY, WZ + .1); else halo.position.set(0, by - .1, PZ); halo.material.color.copy(s.rect).lerp(warm, .3); halo.material.opacity = clamp(skyUniforms.uGain.value * .09) * lit * (1 - night); halo.visible = halo.material.opacity > .004;
    // the building reveal
    city.visible = skyDome.visible = p > .86;
    if (city.visible) { storeyMat.color.setScalar(5.5 * (floorsIn + .03)); paneMat.color.setScalar(3 * (floorsIn + .02)); for (const m of cityBeams) m.uniforms.uBeam.value = floorsIn * .55; for (const m of cityPatches) m.opacity = floorsIn * .8; }
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
    get tod() { return curTod; },
    render: () => renderer.render(scene, camera),
    /** Step down on slow machines, never below one render pixel per CSS pixel. Returns false when nothing is left to drop. */
    degrade() {
      if (dpr > 1) { dpr = 1; resize(); return true; }
      if (sun.shadow.mapSize.x > 1024) { sun.shadow.mapSize.set(1024, 1024); sun.shadow.map?.dispose(); sun.shadow.map = null as never; lastSun = ''; return true; }
      return false;
    },
  };
}
