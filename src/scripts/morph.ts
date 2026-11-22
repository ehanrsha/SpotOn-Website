// "One app. Every spot." scroll sequence (AirPods-page style).
// The pinned canvas draws frame round(progress * (N - 1)) of a pre-rendered sequence,
// scaled to cover the viewport. Frames load in order once the section is near, and the
// nearest loaded frame is drawn until the exact one arrives.

const FRAMES = 91;
const MOBILE = '(max-width: 734px)';

export function initMorph() {
  const track = document.querySelector<HTMLElement>('[data-mx]');
  if (!track) return;
  const canvas = track.querySelector<HTMLCanvasElement>('[data-mx-canvas]')!;
  const poster = track.querySelector<HTMLImageElement>('[data-mx-poster]')!;
  const head = track.querySelector<HTMLElement>('[data-mx-head]')!;
  const ctx = canvas.getContext('2d');
  const variant = matchMedia(MOBILE).matches ? 'mobile' : 'desktop';
  const src = (i: number) => `/media/morph-3d/${variant}/${String(i + 1).padStart(3, '0')}.webp`;

  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !ctx) {
    poster.src = src(60);   // both phones side by side, no motion
    return;
  }
  poster.src = src(0);

  const frames: (HTMLImageElement | null)[] = new Array(FRAMES).fill(null);
  let started = false;
  const load = async () => {
    if (started) return;
    started = true;
    for (let i = 0; i < FRAMES; i++) {
      const img = new Image();
      img.src = src(i);
      try { await img.decode(); frames[i] = img; } catch { /* skip */ }
      draw();   // no-op once the exact current frame is on screen
    }
  };

  let current = 0;
  let drawn = -1;
  const nearest = (i: number) => {
    for (let d = 0; d < FRAMES; d++) {
      if (frames[i - d]) return frames[i - d];
      if (frames[i + d]) return frames[i + d];
    }
    return null;
  };

  const size = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    drawn = -1;
    draw();
  };

  const draw = () => {
    const img = nearest(current);
    if (!img || (drawn === current && img === frames[current])) return;
    const cw = canvas.width, ch = canvas.height;
    const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);   // cover
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.fillStyle = '#F7F7F4';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
    drawn = frames[current] ? current : -1;
    canvas.classList.add('is-ready');
  };

  let ticking = false;
  const update = () => {
    ticking = false;
    const r = track.getBoundingClientRect();
    const span = r.height - innerHeight;
    const p = Math.min(1, Math.max(0, -r.top / span));
    current = Math.round(p * (FRAMES - 1));
    // Headline rises and fades over the first quarter, as the first phone comes up.
    const t = Math.min(1, p / 0.25);
    head.style.opacity = String(1 - t);
    head.style.transform = `translate3d(0, ${-t * 60}px, 0)`;
    draw();
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };

  new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) load();
  }, { rootMargin: '150% 0px' }).observe(track);

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => { size(); update(); });
  size();
  update();
}
