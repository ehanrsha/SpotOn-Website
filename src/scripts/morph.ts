// Morph clip: plays once when >= 50% visible, then offers a replay button.
export function initMorph() {
  const media = document.querySelector<HTMLElement>('[data-morph]');
  const video = media?.querySelector<HTMLVideoElement>('.morph-video');
  const replay = media?.querySelector<HTMLButtonElement>('.replay');
  if (!media || !video || !replay) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; // poster only

  const mobile = matchMedia('(max-width: 734px)').matches;
  let failed = false;
  let started = false;

  video.loop = false;
  video.src = mobile ? '/media/morph/morph-9x16.mp4' : '/media/morph/morph-16x9.mp4';
  video.addEventListener('error', () => { failed = true; media.classList.remove('is-playing'); });
  video.addEventListener('playing', () => { media.classList.add('is-playing'); replay.hidden = true; });
  video.addEventListener('ended', () => { replay.hidden = false; });

  const play = () => {
    if (failed) return;
    const p = video.play();
    if (p && p.catch) p.catch(() => {});
  };

  replay.addEventListener('click', () => {
    replay.hidden = true;
    try { video.currentTime = 0; } catch { /* ignore */ }
    play();
  });

  new IntersectionObserver(
    (entries, io) => {
      if (entries.some((e) => e.isIntersecting) && !started) {
        started = true;
        io.disconnect();
        play();
      }
    },
    { threshold: 0.5 },
  ).observe(media);
}
