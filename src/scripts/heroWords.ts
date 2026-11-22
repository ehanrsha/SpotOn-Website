// Hero headline: three "pills" (event, distance, campus) that take turns swapping their word.
// Width animates to the new word, colours cross-fade, old word slides up/out while the new one rises in.
type Item = { word: string; after?: string };
type Tint = { bg: string; dot: string };

const TINTS: Tint[] = [
  { bg: '#CDEFE4', dot: '#14B88A' }, // mint
  { bg: '#DCEBFB', dot: '#2F80ED' }, // sky
  { bg: '#D9F5D6', dot: '#22C55E' }, // lime
  { bg: '#FBDCC6', dot: '#F97316' }, // peach
  { bg: '#FCDDEB', dot: '#EC4899' }, // pink
  { bg: '#E6E0FB', dot: '#7C5CE6' }, // lilac
  { bg: '#FBF0C4', dot: '#EAB308' }, // butter
];

const EVENT: Item[] = ['Gameday', 'Graduation', 'Class', 'Concert', 'Move-in day', 'Homecoming', 'Finals week', 'Tailgate'].map((word) => ({ word, after: 'parking' }));
const DISTANCE: Item[] = ['4 minutes', '100 steps', '0.2 miles', '2 blocks', '3 minutes', '300 feet', '1 block', '5 minutes'].map((word) => ({ word, after: 'away' }));
const CAMPUS: Item[] = ['UF', 'Ohio State', 'UT Austin', 'Michigan', 'UCLA', 'Georgia Tech', 'Alabama', 'USC', 'FSU', 'Penn State', 'NYU', 'Miami'].map((word) => ({ word }));

// The highlight and the words share one soft curve: the pill grows while the new word
// rises into it, and the text after the pill glides along. Lines never re-wrap (see Hero.astro).
const DUR_W = 720;
const DUR_T = 600;
const EASE = 'cubic-bezier(.32,.72,0,1)';

function swapText(pw: HTMLElement, text: string) {
  const old = pw.querySelector<HTMLElement>('.pw-cur');
  if (!old || old.textContent === text) return;
  const from = pw.getBoundingClientRect().width;

  // measure the new word with a hidden clone
  const probe = document.createElement('span');
  probe.className = 'pw-cur pw-probe';
  probe.textContent = text;
  pw.appendChild(probe);
  pw.style.width = 'auto';
  const to = probe.getBoundingClientRect().width;
  probe.remove();

  const next = document.createElement('span');
  next.className = 'pw-cur';
  next.textContent = text;
  pw.appendChild(next);
  old.classList.remove('pw-cur');
  old.classList.add('pw-old');

  pw.style.width = from + 'px';
  const opts = { duration: DUR_T, easing: EASE, fill: 'both' as FillMode };
  old.animate(
    [{ opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }, { opacity: 0, transform: 'translateY(-.35em)', filter: 'blur(3px)' }],
    opts,
  );
  next.animate(
    [{ opacity: 0, transform: 'translateY(.45em)', filter: 'blur(3px)' }, { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }],
    opts,
  );
  const w = pw.animate([{ width: from + 'px' }, { width: to + 'px' }], { duration: DUR_W, easing: EASE, fill: 'forwards' });
  w.onfinish = () => {
    old.remove();
    next.getAnimations().forEach((a) => a.cancel());
    w.cancel();
    pw.style.width = '';
  };
}

export function initHeroWords() {
  const root = document.querySelector<HTMLElement>('[data-hero-words]');
  if (!root) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const q = (k: string) => root.querySelector<HTMLElement>(`[data-pill="${k}"]`)!;
  const slots = [
    { el: q('event'), items: EVENT, i: 0, afterEl: root.querySelector<HTMLElement>('[data-after="event"]') },
    { el: q('campus'), items: CAMPUS, i: 0, afterEl: null as HTMLElement | null },
    { el: q('dist'), items: DISTANCE, i: 0, afterEl: root.querySelector<HTMLElement>('[data-after="dist"]') },
  ];
  // initial tints in markup: mint, sky, lime -> continue with the rest of the palette
  let tint = 3;
  let step = 0;
  let timer = 0;
  let onScreen = true;

  const change = () => {
    const s = slots[step % slots.length];
    step++;
    s.i = (s.i + 1) % s.items.length;
    const item = s.items[s.i];
    swapText(s.el.querySelector<HTMLElement>('.pw')!, item.word);
    if (s.afterEl && item.after) swapText(s.afterEl, item.after);
    const t = TINTS[tint % TINTS.length];
    tint++;
    s.el.style.setProperty('--pill-bg', t.bg);
    s.el.style.setProperty('--pill-dot', t.dot);
  };

  const tick = () => {
    change();
    timer = window.setTimeout(tick, 1900);
  };
  const start = (delay: number) => {
    clearTimeout(timer);
    timer = window.setTimeout(tick, delay);
  };
  const stop = () => clearTimeout(timer);
  const sync = () => (onScreen && !document.hidden ? start(1900) : stop());

  new IntersectionObserver((es) => {
    onScreen = es[es.length - 1].isIntersecting;
    sync();
  }).observe(root);
  document.addEventListener('visibilitychange', sync);
  start(2200);
}
