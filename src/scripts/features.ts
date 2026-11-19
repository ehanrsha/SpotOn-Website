import { PoseScrubber } from './poseScrubber';

export function initFeatures() {
  const track = document.querySelector<HTMLElement>('[data-fx-track]');
  const sticky = document.querySelector<HTMLElement>('[data-fx-sticky]');
  if (!track || !sticky) return;

  const stills = Array.from(sticky.querySelectorAll<HTMLImageElement>('.fx-still'));
  const pillsEl = sticky.querySelector<HTMLElement>('[data-fx-pills]')!;
  const pills = Array.from(pillsEl.querySelectorAll<HTMLButtonElement>('.fx-pill'));
  const descs = Array.from(sticky.querySelectorAll<HTMLElement>('[data-desc]'));
  const prev = sticky.querySelector<HTMLButtonElement>('[data-fx-prev]')!;
  const next = sticky.querySelector<HTMLButtonElement>('[data-fx-next]')!;
  const N = stills.length;

  const clips = Array.from({ length: N - 1 }, (_, i) => `/media/features/conn-${i + 1}.mp4`);
  const clipsMobile = Array.from({ length: N - 1 }, (_, i) => `/media/features/conn-${i + 1}-m.mp4`);

  let active = 0;
  const setActive = (k: number) => {
    active = k;
    pills.forEach((b, i) => b.setAttribute('aria-pressed', String(i === k)));
    descs.forEach((d, i) => d.classList.toggle('is-active', i === k));
    prev.disabled = k === 0;
    next.disabled = k === N - 1;
    // mobile chip row: keep the active chip centred (scroll the row only, never the page)
    if (pillsEl.scrollWidth > pillsEl.clientWidth + 2) {
      const b = pills[k];
      pillsEl.scrollTo({ left: b.offsetLeft - (pillsEl.clientWidth - b.offsetWidth) / 2, behavior: 'smooth' });
    }
  };

  setActive(0);
  const scrubber = new PoseScrubber({ track, sticky, stills, clips, clipsMobile, onStep: (k) => setActive(k) });

  pills.forEach((b, k) => b.addEventListener('click', () => scrubber.scrollToStep(k)));
  prev.addEventListener('click', () => scrubber.scrollToStep(active - 1));
  next.addEventListener('click', () => scrubber.scrollToStep(active + 1));
}
