import * as THREE from 'three';

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
export const smooth = (t: number) => t * t * t * (t * (6 * t - 15) + 10);
export const up = (p: number, a: number, b: number) => smooth(seg(p, a, b));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Six moments of one day; `tod` runs 0 (dawn) to 1 (night). */
const KEYS = [
  { top: '#2c2f63', hor: '#ff8f5a', gain: 1.7, sun: [0.7, 0.55, -0.15], key: '#ff9a5a', keyI: 3.0, rect: '#ffb27e', rectI: 5, amb: 0.3 },
  { top: '#6b9be0', hor: '#ffdcb0', gain: 3.2, sun: [0.5, 0.72, -0.18], key: '#ffd9a8', keyI: 6.5, rect: '#ffe3c4', rectI: 9, amb: 0.55 },
  { top: '#5a9bf0', hor: '#eaf3ff', gain: 5.2, sun: [-0.4, 0.85, -0.2], key: '#fff3dc', keyI: 11, rect: '#fff6ea', rectI: 15, amb: 0.85 },
  { top: '#6a6a9e', hor: '#ffa552', gain: 2.7, sun: [-0.72, 0.5, -0.2], key: '#ff9d4a', keyI: 6, rect: '#ffb877', rectI: 7, amb: 0.45 },
  { top: '#191b44', hor: '#f2683c', gain: 1.0, sun: [-0.8, 0.42, -0.12], key: '#e2572b', keyI: 1.2, rect: '#d97a55', rectI: 2.4, amb: 0.16 },
  { top: '#070a1c', hor: '#1d2148', gain: 0.4, sun: [-0.9, -0.25, 0.1], key: '#000000', keyI: 0, rect: '#8088c0', rectI: 0.9, amb: 0.06 },
].map(k => ({ ...k, top: new THREE.Color(k.top), hor: new THREE.Color(k.hor), key: new THREE.Color(k.key), rect: new THREE.Color(k.rect), sun: new THREE.Vector3(...(k.sun as [number, number, number])).normalize() }));

export const sky = { top: new THREE.Color(), hor: new THREE.Color(), key: new THREE.Color(), rect: new THREE.Color(), sun: new THREE.Vector3(0, 1, 0), gain: 0, keyI: 0, rectI: 0, amb: 0 };

export function sampleSky(tod: number) {
  const x = clamp(tod) * (KEYS.length - 1), i = Math.min(KEYS.length - 2, Math.floor(x)), t = smooth(x - i), a = KEYS[i], b = KEYS[i + 1];
  sky.top.lerpColors(a.top, b.top, t); sky.hor.lerpColors(a.hor, b.hor, t); sky.key.lerpColors(a.key, b.key, t); sky.rect.lerpColors(a.rect, b.rect, t);
  sky.sun.lerpVectors(a.sun, b.sun, t).normalize();
  sky.gain = lerp(a.gain, b.gain, t); sky.keyI = lerp(a.keyI, b.keyI, t); sky.rectI = lerp(a.rectI, b.rectI, t); sky.amb = lerp(a.amb, b.amb, t);
  return sky;
}

/** The panel surface. The sky is computed from the view ray, so it sits at infinity and shifts as the camera moves: "light coming from far away". */
export const skyUniforms = { uTop: { value: sky.top }, uHor: { value: sky.hor }, uSun: { value: sky.sun }, uGain: { value: 0 }, uTime: { value: 0 } };
export const skyMaterial = new THREE.ShaderMaterial({
  uniforms: skyUniforms,
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: `
    uniform vec3 uTop, uHor, uSun; uniform float uGain, uTime; varying vec3 vW;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
    float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<3;i++){ s+=a*n(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return s; }
    void main(){
      vec3 d = normalize(vW - cameraPosition);
      float y = clamp(d.y, .02, 1.);
      vec2 uv = d.xz / (y + .22);
      float c = smoothstep(.5, .86, fbm(uv * 1.1 + vec2(uTime * .012, uTime * .005)));
      vec3 col = mix(uHor, uTop, smoothstep(.05, .85, y));
      float s = max(dot(d, uSun), 0.);
      col += uHor * pow(s, 7.) * .9 + vec3(1., .94, .84) * pow(s, 90.) * 3.;
      col = mix(col, mix(uHor, vec3(1.), .7), c * .75);
      gl_FragColor = vec4(col * uGain, 1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});

const noiseCanvas = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
};
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export function woodTexture(base = [150, 104, 66]) {
  const t = noiseCanvas(1024, 1024, g => {
    const plank = 128;
    for (let y = 0; y < 1024; y += plank) {
      const off = rnd(-16, 16);
      g.fillStyle = `rgb(${base[0] + off},${base[1] + off * .8},${base[2] + off * .6})`; g.fillRect(0, y, 1024, plank);
      for (let i = 0; i < 90; i++) { const yy = y + rnd(0, plank); g.strokeStyle = `rgba(50,28,12,${rnd(.03, .14)})`; g.lineWidth = rnd(.5, 2); g.beginPath(); g.moveTo(0, yy); g.bezierCurveTo(340, yy + rnd(-8, 8), 680, yy + rnd(-8, 8), 1024, yy); g.stroke(); }
      g.fillStyle = 'rgba(20,10,4,.55)'; g.fillRect(0, y, 1024, 2);
    }
  });
  t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function grainTexture(a = .05) {
  return noiseCanvas(512, 512, g => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 26000; i++) { const v = Math.random() > .5 ? 255 : 0; g.fillStyle = `rgba(${v},${v},${v},${a})`; g.fillRect(rnd(0, 512), rnd(0, 512), rnd(1, 3), rnd(1, 3)); }
  });
}
export function brushedTexture() {
  return noiseCanvas(1024, 256, g => {
    g.fillStyle = '#6a6a6a'; g.fillRect(0, 0, 1024, 256);
    for (let i = 0; i < 1600; i++) { const v = Math.random() > .5 ? 255 : 0; g.fillStyle = `rgba(${v},${v},${v},.05)`; g.fillRect(rnd(-200, 1024), rnd(0, 256), rnd(120, 700), 1); }
  });
}
/** Near-white woven cloth, multiplied over a fabric colour. */
export function weaveTexture() {
  const t = noiseCanvas(256, 256, g => {
    g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 256; i += 4) { g.fillStyle = `rgba(0,0,0,${rnd(.05, .13)})`; g.fillRect(i, 0, 1.5, 256); g.fillStyle = `rgba(0,0,0,${rnd(.05, .13)})`; g.fillRect(0, i, 256, 1.5); }
    for (let i = 0; i < 2400; i++) { g.fillStyle = `rgba(255,255,255,${rnd(.04, .2)})`; g.fillRect(rnd(0, 256), rnd(0, 256), rnd(1, 7), 1); }
  });
  t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** Very soft trowelled mottling for walls and ceiling. */
export function plasterTexture() {
  const t = noiseCanvas(512, 512, g => {
    g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 260; i++) { const x = rnd(0, 512), y = rnd(0, 512), r = rnd(30, 110), v = Math.random() > .5 ? 255 : 150, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${v},${v},${v},.014)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  });
  t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** An abstract painting for the back wall. */
export function artTexture() {
  const t = noiseCanvas(512, 512, g => {
    g.fillStyle = '#d9c8ab'; g.fillRect(0, 0, 512, 512);
    g.fillStyle = '#8c4f2c'; g.beginPath(); g.ellipse(180, 300, 150, 210, .3, 0, 7); g.fill();
    g.fillStyle = '#2f2a26'; g.beginPath(); g.ellipse(330, 210, 110, 170, -.5, 0, 7); g.fill();
    g.fillStyle = '#e9b866'; g.beginPath(); g.arc(120, 130, 58, 0, 7); g.fill();
    for (let i = 0; i < 3000; i++) { const v = Math.random() > .5 ? 255 : 0; g.fillStyle = `rgba(${v},${v},${v},.05)`; g.fillRect(rnd(0, 512), rnd(0, 512), rnd(4, 40), 1); }
  });
  t.colorSpace = THREE.SRGBColorSpace; return t;
}
