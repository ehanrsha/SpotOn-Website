// "How it works" card: the real SpotOn app inside an iPhone 17 Pro frame.
//
// Each step has a screen recording (features-app/<id>.mp4), a poster frame (<id>.webp)
// and a tap timeline in features-app/taps.json: { "<id>": [{ "t": sec, "x": 0..1, "y": 0..1 }] }
// in screen coordinates. A step plays its recording once and rests on the last frame;
// a white press circle appears at each tap, slightly ahead of the app's response.
// Changing step slides the phones like Apple's iPhone Air "closer look": the leaving
// phone and its soft backing layer drift off at different speeds while the new ones
// arrive from the other side.

type Tap = { t: number; x: number; y: number; x2?: number; y2?: number; d?: number };
const BASE = '/media/features-app';
const EASE = 'cubic-bezier(.32, .72, 0, 1)';
const LEAD = 0.12;   // show the press circle this long before the app reacts

export function initFeatures() {
  const card = document.querySelector<HTMLElement>('[data-fx]');
  if (!card) return;
  const slides = Array.from(card.querySelectorAll<HTMLElement>('[data-slide]'));
  const pillsEl = card.querySelector<HTMLElement>('[data-fx-pills]')!;
  const pills = Array.from(pillsEl.querySelectorAll<HTMLButtonElement>('.fx-pill'));
  const descs = Array.from(card.querySelectorAll<HTMLElement>('[data-desc]'));
  const prevs = Array.from(card.querySelectorAll<HTMLButtonElement>('[data-fx-prev]'));
  const nexts = Array.from(card.querySelectorAll<HTMLButtonElement>('[data-fx-next]'));
  const N = slides.length;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let taps: Record<string, Tap[]> = {};
  fetch(`${BASE}/taps.json`).then((r) => (r.ok ? r.json() : {})).then((j) => (taps = j)).catch(() => {});

  const parts = (s: HTMLElement) => ({
    device: s.querySelector<HTMLElement>('.fx-device')!,
    backer: s.querySelector<HTMLElement>('.fx-backer')!,
    video: s.querySelector<HTMLVideoElement>('.fx-video')!,
    tapLayer: s.querySelector<HTMLElement>('.fx-taps')!,
    id: s.dataset.id!,
  });

  // ── Playback ──
  let raf = 0;
  const stop = (s: HTMLElement) => {
    const { video, tapLayer } = parts(s);
    cancelAnimationFrame(raf);
    video.pause();
    tapLayer.replaceChildren();
  };
  const ensureSrc = (s: HTMLElement) => {
    const { video, id } = parts(s);
    if (!video.src) { video.src = `${BASE}/${id}.mp4`; video.preload = 'auto'; }
  };
  const play = (s: HTMLElement) => {
    const { video, tapLayer, id } = parts(s);
    if (reduce) return;
    ensureSrc(s);
    try { video.currentTime = 0; } catch { /* not loaded yet */ }
    const list = (taps[id] ?? []).slice().sort((a, b) => a.t - b.t);
    let next = 0;
    video.onplaying = () => video.classList.add('is-on');
    const tick = () => {
      const t = video.currentTime;
      while (next < list.length && t >= list[next].t - LEAD) {
        const tap = list[next++];
        const dot = document.createElement('span');
        dot.className = 'fx-tap';
        dot.style.left = `${tap.x * 100}%`;
        dot.style.top = `${tap.y * 100}%`;
        if (tap.x2 !== undefined && tap.y2 !== undefined) {
          // A swipe: the press dot rides along with the finger, then lifts away.
          dot.classList.add('is-drag');
          dot.animate(
            [
              { left: `${tap.x * 100}%`, top: `${tap.y * 100}%`, opacity: 0, transform: 'scale(.6)' },
              { left: `${tap.x * 100}%`, top: `${tap.y * 100}%`, opacity: 1, transform: 'scale(.9)', offset: 0.15 },
              { left: `${tap.x2 * 100}%`, top: `${tap.y2 * 100}%`, opacity: 1, transform: 'scale(.9)', offset: 0.8 },
              { left: `${tap.x2 * 100}%`, top: `${tap.y2 * 100}%`, opacity: 0, transform: 'scale(1.2)' },
            ],
            { duration: ((tap.d ?? 0.5) + 0.45) * 1000, easing: 'cubic-bezier(.45,0,.2,1)' },
          ).onfinish = () => dot.remove();
        } else {
          dot.addEventListener('animationend', () => dot.remove());
        }
        tapLayer.append(dot);
      }
      if (!video.ended) raf = requestAnimationFrame(tick);
    };
    const p = video.play();
    if (p) p.then(() => { raf = requestAnimationFrame(tick); }).catch(() => {});
    // Warm up the neighbours so the next step starts instantly.
    const k = slides.indexOf(s);
    [k + 1, k - 1].forEach((j) => slides[j] && ensureSrc(slides[j]));
  };

  // ── Layered slide ──
  const slideOut = (s: HTMLElement, dir: number) => {
    const { device, backer } = parts(s);
    s.classList.add('is-leaving');
    const o = { duration: 620, easing: EASE, fill: 'forwards' as const };
    device.animate([{ transform: 'none', opacity: 1 }, { transform: `translateX(${-dir * 26}%) scale(.94)`, opacity: 0 }], o);
    const a = backer.animate(
      [{ transform: 'none', opacity: 0 }, { opacity: 0.9, offset: 0.35 }, { transform: `translateX(${-dir * 70}%)`, opacity: 0 }],
      { ...o, duration: 700 },
    );
    a.onfinish = () => {
      s.classList.remove('is-leaving');
      device.getAnimations().forEach((x) => x.cancel());
      a.cancel();
    };
  };
  const slideIn = (s: HTMLElement, dir: number) => {
    const { device, backer } = parts(s);
    s.classList.add('is-active');
    const o = { duration: 760, easing: EASE, delay: 90, fill: 'backwards' as const };
    backer.animate(
      [{ transform: `translateX(${dir * 85}%)`, opacity: 0 }, { opacity: 0.9, offset: 0.4 }, { transform: `translateX(${dir * 9}%)`, opacity: 0 }],
      { ...o, delay: 0, duration: 820 },
    );
    return device.animate([{ transform: `translateX(${dir * 34}%) scale(.94)`, opacity: 0 }, { transform: 'none', opacity: 1 }], o).finished;
  };

  // ── Step state ──
  let cur = 0;
  let started = false;
  const setUI = (k: number) => {
    pills.forEach((b, i) => b.setAttribute('aria-pressed', String(i === k)));
    descs.forEach((d, i) => d.classList.toggle('is-active', i === k));
    prevs.forEach((b) => (b.disabled = k === 0));
    nexts.forEach((b) => (b.disabled = k === N - 1));
    if (pillsEl.scrollWidth > pillsEl.clientWidth + 2) {
      const b = pills[k];
      pillsEl.scrollTo({ left: b.offsetLeft - (pillsEl.clientWidth - b.offsetWidth) / 2, behavior: 'smooth' });
    }
  };

  const go = async (k: number) => {
    k = Math.max(0, Math.min(N - 1, k));
    if (k === cur) { stop(slides[k]); play(slides[k]); return; }   // re-tap replays
    const from = slides[cur];
    const to = slides[k];
    const dir = k > cur ? 1 : -1;
    cur = k;
    setUI(k);
    stop(from);
    from.classList.remove('is-active');
    parts(to).video.classList.remove('is-on');
    if (reduce) { to.classList.add('is-active'); return; }
    slideOut(from, dir);
    await slideIn(to, dir).catch(() => {});
    if (cur === k) play(to);
  };

  setUI(0);
  pills.forEach((b, k) => b.addEventListener('click', () => go(k)));
  prevs.forEach((b) => b.addEventListener('click', () => go(cur - 1)));
  nexts.forEach((b) => b.addEventListener('click', () => go(cur + 1)));

  // Start the first recording once the card is properly in view; pause when it leaves.
  new IntersectionObserver((entries) => {
    const e = entries[0];
    if (e.isIntersecting && !started) { started = true; play(slides[cur]); }
    else if (!e.isIntersecting && started) { stop(slides[cur]); started = false; }
  }, { threshold: 0.55 }).observe(card);

  // Swipe the stage on touch screens.
  let x0: number | null = null;
  const stage = card.querySelector<HTMLElement>('.fx-stage')!;
  stage.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 40) go(cur + (dx < 0 ? 1 : -1));
  });
}
