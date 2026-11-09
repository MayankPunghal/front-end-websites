// How it works: one product on a dark stage. Scroll opens it, then steps through its layers.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { createProduct } from './three/product';
import { clamp, sampleSky, seg, skyUniforms, smooth } from './three/shared';

const sec = document.querySelector<HTMLElement>('[data-parts]')!;
const parts = [...sec.querySelectorAll<HTMLElement>('[data-part]')];
const show = (i: number) => parts.forEach((el, k) => el.toggleAttribute('data-on', k === i));
const io = new IntersectionObserver(es => es.forEach(e => { const v = e.target as HTMLVideoElement; if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }), { threshold: .3 });
document.querySelectorAll('[data-v]').forEach(v => io.observe(v));

if (!document.documentElement.classList.contains('is-3d')) {
  sec.style.height = 'auto';
  sec.querySelector<HTMLElement>('.parts__pin')!.style.cssText = 'position:static;height:auto;display:block;padding-block:8rem 4rem';
  sec.querySelector<HTMLElement>('.parts__copy')!.style.height = 'auto';
  parts.forEach(p => { p.style.cssText = 'position:static;translate:none;opacity:1;visibility:visible;margin-bottom:3rem'; });
  sec.querySelector('canvas')!.remove();
  dispatchEvent(new Event('scene-ready'));
} else {
  const canvas = sec.querySelector('canvas')!, coarse = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false }); renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 1.2;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, 1, .1, 60);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture; scene.environmentIntensity = .75;
  const key = new THREE.DirectionalLight('#fff0dc', 2.5); key.position.set(-4, 3, 6); scene.add(key);
  const product = createProduct(); product.power(.42); scene.add(product.root);
  sampleSky(.4); skyUniforms.uGain.value = 1.1;
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: coarse ? 0 : 4 }));
  composer.addPass(new RenderPass(scene, camera)); composer.addPass(new UnrealBloomPass(new THREE.Vector2(2, 2), .18, .5, 1.2)); composer.addPass(new OutputPass());
  let target = 0, p = 0, time = 0, last = performance.now(), wide = true;
  const read = () => { target = clamp(-sec.getBoundingClientRect().top / (sec.offsetHeight - innerHeight)); };
  const size = () => { const w = canvas.clientWidth, h = canvas.clientHeight, d = Math.min(devicePixelRatio, 1.75); wide = w > h; renderer.setPixelRatio(d); renderer.setSize(w, h, false); composer.setPixelRatio(d); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); read(); };
  addEventListener('scroll', read, { passive: true }); addEventListener('resize', size); size();
  const L = product.layers.length, OPEN = .16;
  const frame = () => {
    product.explode(smooth(seg(p, 0, OPEN))); product.spin.rotation.y = p * Math.PI * 3 + .5; product.spin.rotation.x = .24 * smooth(seg(p, 0, OPEN));
    const idx = p < OPEN ? -1 : Math.min(L - 1, Math.floor((p - OPEN) / (1 - OPEN) * L));
    product.layers.forEach((l, i) => { l.obj.position.z += ((i === idx ? 1 : 0) - l.obj.position.z) * .12; });
    const focus = idx < 0 ? .1 : product.layers[idx].obj.position.y;
    camera.position.set(wide ? -2.2 : 0, focus * .55 + (wide ? 1 : .2), (wide ? 11 : 17) - (idx < 0 ? 0 : 1)); camera.lookAt(wide ? -2.2 : 0, focus * .55 - (wide ? 0 : .9), 0);
    show(idx + 1); skyUniforms.uTime.value = time;
    composer.render();
  };
  const tick = (now: number) => { requestAnimationFrame(tick); const dt = Math.min(.05, (now - last) / 1000); last = now; time += dt; if (sec.getBoundingClientRect().bottom < 0) return; p += (target - p) * (1 - Math.exp(-dt * 6)); frame(); };
  frame(); dispatchEvent(new Event('scene-ready')); requestAnimationFrame(tick);
}
