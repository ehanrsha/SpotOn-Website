// Support video: plays (muted, looped) only while in view.
export function initSupport() {
  const video = document.querySelector<HTMLVideoElement>('[data-support-video]');
  if (!video) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; // poster only
  new IntersectionObserver(
    (entries) => {
      const vis = entries.some((e) => e.isIntersecting);
      if (vis) video.play().catch(() => {});
      else video.pause();
    },
    { threshold: 0.25 },
  ).observe(video);
}
