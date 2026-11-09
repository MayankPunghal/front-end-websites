// Desktop: pin a section and let vertical scrolling drive its row sideways (as on the original's team / architects rows).
import { motion } from './motion';
export function hscroll(section: HTMLElement, track: HTMLElement, top = 72) {
  motion().then(({ gsap, mm }) => {
    mm.add('(min-width: 62rem) and (prefers-reduced-motion: no-preference)', () => {
      section.classList.add('is-pinned');
      const dist = () => track.scrollWidth - innerWidth + 96;
      gsap.to(track, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: section, start: `top top+=${top}`, end: () => '+=' + dist(), pin: true, scrub: 1, invalidateOnRefresh: true, anticipatePin: 1 } });
      return () => section.classList.remove('is-pinned');
    });
  });
}
