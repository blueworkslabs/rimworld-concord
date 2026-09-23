// Play explainer loops only while visible; respect reduced-motion (controls, no autoplay).
(() => {
  const videos = [...document.querySelectorAll('video[data-loop]')];
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (const v of videos) {
    v.muted = true;
    v.playsInline = true;
    if (still) { v.controls = true; v.removeAttribute('autoplay'); }
  }
  if (still || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (e.isIntersecting) e.target.play().catch(() => { e.target.controls = true; });
      else e.target.pause();
    }
  }, {threshold: 0.35});
  videos.forEach(v => io.observe(v));
})();
