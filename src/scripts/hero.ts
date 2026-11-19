// Hero: poster -> play the intro clip once -> crossfade to the sharp end-frame still (same box, no size jump).
export function initHero() {
  const media = document.querySelector<HTMLElement>('[data-hero-media]');
  const video = media?.querySelector<HTMLVideoElement>('.hero-video');
  const end = media?.querySelector<HTMLImageElement>('.hero-end');
  if (!media || !video || !end) return;

  let settled = false;
  const showEnd = (noVideo = false) => {
    if (settled) return;
    settled = true;
    media.classList.add(noVideo ? 'no-video' : 'is-ended');
  };

  // If the end still is missing, never show a broken image: keep the poster/video visible instead.
  end.addEventListener('error', () => { end.style.display = 'none'; });

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    video.removeAttribute('autoplay');
    video.pause();
    return showEnd(true);
  }

  video.loop = false;
  video.controls = false;
  video.addEventListener('playing', () => media.classList.add('is-playing'), { once: true });
  video.addEventListener('ended', () => showEnd());
  video.addEventListener('error', () => showEnd(true), true);
  const p = video.play();
  if (p && typeof p.catch === 'function') p.catch(() => showEnd(true));

  // Safety net: stalled network / blocked autoplay -> settle on the still.
  setTimeout(() => { if (!media.classList.contains('is-playing')) showEnd(true); }, 6000);
}
