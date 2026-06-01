'use client';

/* ============================================================
   Presentation · Confetti feedback
   Pixel-square burst painted on a throwaway full-screen canvas.
   Imperative side effect, triggered by the UI in response to
   use-case rewards.
   ============================================================ */

export function fireConfetti(opts = {}) {
  const colors = opts.colors || ['#ff9900', '#36c5f0', '#2bd576', '#ff5c8a', '#9b6dff', '#ffd23f'];
  const n = opts.count || 90;
  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:fixed;inset:0;z-index:9800;pointer-events:none;image-rendering:pixelated;';
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  function size() { cv.width = window.innerWidth; cv.height = window.innerHeight; }
  size();
  const ox = (opts.x != null ? opts.x : .5) * cv.width;
  const oy = (opts.y != null ? opts.y : .42) * cv.height;
  const parts = Array.from({ length: n }).map(() => {
    const ang = Math.random() * Math.PI * 2;
    const spd = 4 + Math.random() * 9;
    return {
      x: ox, y: oy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 6,
      sz: (Math.random() < .5 ? 5 : 8), c: colors[(Math.random() * colors.length) | 0],
      life: 1, rot: 0,
    };
  });
  let raf, frame = 0;
  function step() {
    frame++; ctx.clearRect(0, 0, cv.width, cv.height);
    let alive = false;
    for (const p of parts) {
      p.vy += .42; p.vx *= .99; p.x += p.vx; p.y += p.vy;
      p.life -= .009;
      if (p.life > 0 && p.y < cv.height + 20) {
        alive = true;
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.4));
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x | 0, p.y | 0, p.sz, p.sz);
      }
    }
    ctx.globalAlpha = 1;
    if (alive && frame < 240) raf = requestAnimationFrame(step);
    else { cancelAnimationFrame(raf); cv.remove(); }
  }
  step();
}
