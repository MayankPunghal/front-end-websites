// Logo loader: plays the original site's Lottie (amber sunrise wordmark on dark). Only fetched when the loader is actually shown (first visit per session).
const box = document.querySelector<HTMLElement>('[data-loader-anim]');
if (box && document.documentElement.classList.contains('loading')) {
  import('lottie-web/build/player/lottie_light').then(({ default: lottie }) => {
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const a = lottie.loadAnimation({ container: box, renderer: 'svg', loop: false, autoplay: !calm, path: '/brand/loader.json' });
    if (calm) a.addEventListener('DOMLoaded', () => a.goToAndStop(a.totalFrames - 1, true));
  }).catch(() => {});
}
