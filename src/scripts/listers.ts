// Listers carousel: native scroll-snap; adds prev/next buttons, end-state disabling, and mouse drag.
export function initListers() {
  const rail = document.querySelector<HTMLElement>('[data-rail]');
  const prev = document.querySelector<HTMLButtonElement>('[data-prev]');
  const next = document.querySelector<HTMLButtonElement>('[data-next]');
  if (!rail || !prev || !next) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let ticking = false;
  initScrollIn(rail, reduce);
  initVideos(rail, reduce);

  const update = () => {
    ticking = false;
    const max = rail.scrollWidth - rail.clientWidth;
    prev.disabled = rail.scrollLeft <= 2;
    next.disabled = rail.scrollLeft >= max - 2;
  };
  rail.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener('resize', update);
  update();

  const step = (dir: number) => {
    const card = rail.querySelector<HTMLElement>('.lcard');
    if (!card) return;
    const gap = parseFloat(getComputedStyle(rail).columnGap) || 20;
    rail.scrollBy({ left: dir * (card.offsetWidth + gap), behavior: reduce ? 'auto' : 'smooth' });
  };
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  rail.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  });

  // Mouse drag-to-scroll (touch already scrolls natively). Snap is suspended while dragging
  // and restored on release, so the browser's own snap animation supplies the settle.
  let down = false, startX = 0, startLeft = 0, moved = 0;
  rail.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    down = true; moved = 0; startX = e.clientX; startLeft = rail.scrollLeft;
  });
  addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - startX;
    moved = Math.max(moved, Math.abs(dx));
    if (moved > 4 && !rail.classList.contains('is-dragging')) rail.classList.add('is-dragging');
    if (rail.classList.contains('is-dragging')) rail.scrollLeft = startLeft - dx;
  });
  const end = () => {
    if (!down) return;
    down = false;
    rail.classList.remove('is-dragging');
  };
  addEventListener('pointerup', end);
  addEventListener('pointercancel', end);
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));

// Scroll-driven blur-up: each card's media rises out of a blur as the carousel enters the viewport.
function initScrollIn(rail: HTMLElement, reduce: boolean) {
  if (reduce) return;
  const cards = [...rail.querySelectorAll<HTMLElement>('[data-lcard]')];
  const items = cards.map((c) => ({
    tile: c.querySelector<HTMLElement>('[data-ltile]')!,
    cap: c.querySelector<HTMLElement>('[data-lcap]')!,
  }));
  const N = cards.length;
  const STAG = 0.08;
  let raf = 0;
  const frame = () => {
    raf = 0;
    const vh = innerHeight;
    const top = rail.getBoundingClientRect().top;
    // 0 when the rail top is at the viewport bottom, 1 at 65% of the viewport height
    const p = clamp((vh - top) / (vh * 0.35));
    items.forEach((it, i) => {
      const pi = clamp((p - i * STAG) / (1 - (N - 1) * STAG));
      const pc = clamp((pi - 0.15) / 0.85);
      const e = 1 - Math.pow(1 - pi, 3);
      const ec = 1 - Math.pow(1 - pc, 3);
      it.tile.style.opacity = String(e);
      it.tile.style.transform = `translate3d(0, ${(1 - e) * 60}px, 0)`;
      it.tile.style.filter = e >= 0.999 ? 'none' : `blur(${(1 - e) * 16}px)`;
      it.cap.style.opacity = String(ec);
      it.cap.style.transform = `translate3d(0, ${(1 - ec) * 24}px, 0)`;
    });
  };
  const req = () => { if (!raf) raf = requestAnimationFrame(frame); };
  addEventListener('scroll', req, { passive: true });
  addEventListener('resize', req);
  frame();
}

// Card videos play only while >=50% visible; card 2 (camera opening) restarts each time it comes into view.
function initVideos(rail: HTMLElement, reduce: boolean) {
  const videos = rail.querySelectorAll<HTMLVideoElement>('video[data-lvideo]');
  if (reduce || !videos.length) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const v = e.target as HTMLVideoElement;
        if (e.isIntersecting) {
          if (v.dataset.lvideo === '2') { try { v.currentTime = 0; } catch {} }
          v.play().catch(() => {});
        } else v.pause();
      }
    },
    { threshold: 0.5 },
  );
  videos.forEach((v) => io.observe(v));
}
