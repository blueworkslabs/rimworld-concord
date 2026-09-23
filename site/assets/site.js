// Playback is opt-in, including without JavaScript and under reduced motion.
// Leaving the viewport or tab pauses playback; returning never overrides a pause.
(() => {
  const videos = [...document.querySelectorAll('video[data-loop]')];
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  videos.forEach(v => { v.muted = true; v.playsInline = true; v.controls = true; });
  const pauseAll = () => videos.forEach(v => v.pause());
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseAll(); });
  motion.addEventListener('change', () => { if (motion.matches) pauseAll(); });
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting || e.intersectionRatio < 0.35) e.target.pause();
    }
  }, {threshold: 0.35});
  videos.forEach(v => io.observe(v));
})();
