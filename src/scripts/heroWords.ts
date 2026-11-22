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
// Southern schools first (expansion priority). UF is always shown first (it's in the markup).
const CAMPUS: Item[] = [
  'UF', 'FSU', 'UCF', 'UMiami', 'USF', 'FIU', 'Georgia Tech', 'Emory', 'UGA',
  'UT Austin', 'Texas A&M', 'Rice', 'Alabama', 'Auburn', 'LSU', 'Ole Miss',
  'Tennessee', 'Vanderbilt', 'Clemson', 'South Carolina',
].map((word) => ({ word }));

const rand = (n: number) => Math.floor(Math.random() * n);
const shuffle = <T,>(a: T[]) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

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
  // Every slot starts on item 0 (what the markup shows). Each slot draws its next word from a
  // shuffled bag, refilled when empty, never containing the word currently on screen.
  const slot = (el: HTMLElement, items: Item[], afterEl: HTMLElement | null) => ({ el, items, afterEl, i: 0, bag: [] as number[] });
  const slots = [
    slot(q('event'), EVENT, root.querySelector<HTMLElement>('[data-after="event"]')),
    slot(q('dist'), DISTANCE, root.querySelector<HTMLElement>('[data-after="dist"]')),
    slot(q('campus'), CAMPUS, null),
  ];
  // initial tints in markup: mint, sky, lime -> continue with the rest of the palette
  let tint = 3;
  let timer = 0;
  let onScreen = true;
  let last = -1;

  const change = () => {
    // A random pill changes each time, but never the same pill twice in a row.
    let n = rand(slots.length - (last < 0 ? 0 : 1));
    if (last >= 0 && n >= last) n++;
    last = n;
    const s = slots[n];
    if (!s.bag.length) s.bag = shuffle(s.items.map((_, k) => k).filter((k) => k !== s.i));
    s.i = s.bag.pop()!;
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
