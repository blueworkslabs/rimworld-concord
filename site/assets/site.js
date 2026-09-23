// Initial HTML is paused with native controls, including when JavaScript is unavailable.
(() => {
  const videos = [...document.querySelectorAll('video[data-loop]')];
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const visible = new Set();
  const sync = v => {
    if (motion.matches || document.hidden || !visible.has(v)) v.pause();
    else v.play().catch(() => {}); // Native controls remain available if autoplay is blocked.
  };
  videos.forEach(v => { v.muted = true; v.playsInline = true; v.controls = true; });
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (e.isIntersecting && e.intersectionRatio >= 0.35) visible.add(e.target);
      else visible.delete(e.target);
      sync(e.target);
    }
  }, {threshold: 0.35});
  videos.forEach(v => io.observe(v));
  motion.addEventListener('change', () => videos.forEach(sync));
  document.addEventListener('visibilitychange', () => videos.forEach(sync));
})();
