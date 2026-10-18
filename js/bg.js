// Fond animé : nœuds reliés par des lignes néon où circulent des impulsions.

export function startBackground(canvas) {
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COLORS = ['255,42,109', '5,217,232', '5,217,232', '249,240,2'];
  const LINK = 160;
  let w = 0, h = 0, nodes = [], pulses = [], raf = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.max(18, Math.min(70, (w * h) / 22000)));
    nodes = Array.from({ length: n }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.22,
      r: 1 + Math.random() * 1.6,
      c: COLORS[Math.floor(Math.random() * COLORS.length)],
      glow: 0,
    }));
    pulses = [];
    if (reduce) draw();
  }

  function spawnPulse() {
    const a = nodes[Math.floor(Math.random() * nodes.length)];
    const near = nodes.filter((b) => b !== a && Math.hypot(a.x - b.x, a.y - b.y) < LINK);
    if (!near.length) return;
    const b = near[Math.floor(Math.random() * near.length)];
    pulses.push({ a, b, t: 0, speed: 0.008 + Math.random() * 0.012, c: Math.random() < 0.5 ? COLORS[0] : COLORS[1] });
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < LINK) {
          ctx.strokeStyle = `rgba(5,217,232,${(1 - d / LINK) * 0.16})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    for (const p of pulses) {
      const x = p.a.x + (p.b.x - p.a.x) * p.t;
      const y = p.a.y + (p.b.y - p.a.y) * p.t;
      ctx.strokeStyle = `rgba(${p.c},0.55)`;
      ctx.beginPath();
      ctx.moveTo(p.a.x + (p.b.x - p.a.x) * Math.max(0, p.t - 0.25), p.a.y + (p.b.y - p.a.y) * Math.max(0, p.t - 0.25));
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = `rgba(${p.c},0.95)`;
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const n of nodes) {
      const g = n.glow;
      ctx.fillStyle = `rgba(${n.c},${0.35 + g * 0.6})`;
      ctx.shadowColor = `rgba(${n.c},0.9)`;
      ctx.shadowBlur = 6 + g * 14;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + g * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  function step() {
    for (const n of nodes) {
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < 0 || n.x > w) n.vx *= -1;
      if (n.y < 0 || n.y > h) n.vy *= -1;
      n.glow *= 0.94;
    }
    if (pulses.length < 10 && Math.random() < 0.06) spawnPulse();
    pulses = pulses.filter((p) => {
      p.t += p.speed;
      if (p.t >= 1) {
        p.b.glow = 1;
        return false;
      }
      return true;
    });
    draw();
    raf = requestAnimationFrame(step);
  }

  window.addEventListener('resize', () => {
    clearTimeout(resize._t);
    resize._t = setTimeout(resize, 150);
  });
  document.addEventListener('visibilitychange', () => {
    if (reduce) return;
    cancelAnimationFrame(raf);
    if (!document.hidden) raf = requestAnimationFrame(step);
  });

  resize();
  if (!reduce) raf = requestAnimationFrame(step);
}
