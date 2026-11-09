// Inertial wheel scrolling (Lenis): the wheel eases toward its target at display rate instead of stepping. Mouse/trackpad only: touch stays native, and reduced-motion users keep the browser's own scrolling.
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

if (!matchMedia('(prefers-reduced-motion: reduce)').matches && matchMedia('(pointer: fine)').matches) {
  const lenis = new Lenis({
    lerp: 0.06, wheelMultiplier: 0.85, anchors: true,
    // modal dialogs, the menu overlay and form controls keep their own wheel behaviour
    prevent: node => !!node.closest('dialog, .menu, select, textarea, [data-lenis-prevent]'),
  });
  const frame = (t: number) => { lenis.raf(t); requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
  (window as any).__lenis = lenis;
}
