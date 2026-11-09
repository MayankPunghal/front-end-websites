// Filter / tab swap: current items fade out, then the new set rises in with a short stagger (instant for reduced motion).
const calm = matchMedia('(prefers-reduced-motion: reduce)');
let run = 0;
export const swap = (els: HTMLElement[], keep: (el: HTMLElement) => boolean, done?: () => void) => {
  const id = ++run, leaving = els.filter(e => !e.hidden && !keep(e));
  const finish = () => {
    if (id !== run) return;
    els.forEach(e => { e.getAnimations().forEach(a => a.cancel()); e.hidden = !keep(e); });
    done?.();
    if (calm.matches) return;
    els.filter(e => !e.hidden).forEach((e, i) => e.animate({ opacity: [0, 1], transform: ['translateY(18px) scale(.97)', 'none'] }, { duration: 620, delay: Math.min(i, 14) * 40, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' }));
  };
  if (calm.matches || !leaving.length) return finish();
  Promise.all(leaving.map(e => e.animate({ opacity: [1, 0], transform: ['none', 'scale(.96)'] }, { duration: 220, easing: 'ease-in', fill: 'forwards' }).finished)).then(finish, finish);
};
