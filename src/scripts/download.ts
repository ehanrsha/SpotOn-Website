// CTA image: scale .94 -> 1 and fade in, linked to scroll position while it is on screen.
export function initDownload() {
  const wrap = document.querySelector<HTMLElement>('[data-cta-img]');
  const img = wrap?.querySelector<HTMLImageElement>('img');
  if (!wrap || !img) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let on = false;
  let ticking = false;
  const clamp = (x: number) => Math.min(1, Math.max(0, x));

  const update = () => {
    ticking = false;
    const r = wrap.getBoundingClientRect();
    const vh = innerHeight;
    // 0 when the top edge enters the viewport bottom, 1 once ~55% of the way up
    const t = clamp((vh - r.top) / (vh * 0.55));
    const e = 1 - Math.pow(1 - t, 3);
    img.style.opacity = String(clamp(t * 1.6));
    img.style.transform = `scale(${(0.94 + 0.06 * e).toFixed(4)})`;
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };

  new IntersectionObserver(
    (entries) => {
      const v = entries[0].isIntersecting;
      if (v && !on) { addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onScroll); }
      if (!v && on) { removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); }
      on = v;
      if (v) update();
    },
    { rootMargin: '10% 0px' },
  ).observe(wrap);
  update();
}
