// Scroll reveals: [data-reveal] fades/rises/unblurs in once, staggered by data-reveal-delay (ms).
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));

const show = (el: HTMLElement) => {
  el.classList.add('is-in');
  // Once finished, drop the attribute so the element carries no leftover transition-delay or will-change.
  const done = (e: TransitionEvent) => {
    if (e.target !== el || e.propertyName !== 'opacity') return;
    el.removeEventListener('transitionend', done);
    el.removeAttribute('data-reveal');
    el.style.removeProperty('--reveal-delay');
    el.classList.remove('is-in');
  };
  if (!reduce) el.addEventListener('transitionend', done);
};

if (reduce || !('IntersectionObserver' in window)) {
  els.forEach((el) => el.classList.add('is-in'));
} else {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        io.unobserve(entry.target);
        show(entry.target as HTMLElement);
      }
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.01 },
  );
  for (const el of els) {
    const d = el.dataset.revealDelay;
    if (d) el.style.setProperty('--reveal-delay', `${d}ms`);
    io.observe(el);
  }
}
