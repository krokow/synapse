// Fond animé : nœuds reliés par des lignes néon où circulent des impulsions.
// Optimisé : 30 i/s max, halos pré-rendus (pas de shadowBlur), pause si onglet caché ou fiche ouverte.

export function startBackground(canvas) {
  const ctx = canvas.getContext('2d', { alpha: true });
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COLORS = ['255,42,109', '5,217,232', '5,217,232', '249,240,2'];
  const LINK = 150;
  const LINK2 = LINK * LINK;
  const FRAME_MS = 1000 / 30;
  let w = 0, h = 0, nodes = [], pulses = [], raf = 0, last = 0;

  // Halo pré-rendu par couleur : un drawImage coûte bien moins qu'un shadowBlur.
  const sprites = new Map();
  for (const c of new Set(COLORS)) {
    const s = document.createElement('canvas');
    s.width = s.height = 32;
    const g = s.getContext('2d');
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, `rgba(${c},1)`);
    grad.addColorStop(0.18, `rgba(${c},0.9)`);
    grad.addColorStop(0.4, `rgba(${c},0.25)`);
    grad.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    sprites.set(c, s);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    // Sur mobile, la barre d'adresse change la hauteur au défilement : on garde alors les nœuds.
    const keep = nodes.length && Math.abs(window.innerWidth - w) < 50;
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (keep) return draw();
    const n = Math.round(Math.max(16, Math.min(48, (w * h) / 30000)));
    nodes = Array.from({ length: n }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.44,
      vy: (Math.random() - 0.5) * 0.44,
      r: 1 + Math.random() * 1.6,
      c: COLORS[Math.floor(Math.random() * COLORS.length)],
      glow: 0,
    }));
    pulses = [];
    draw();
  }

  function spawnPulse() {
    const a = nodes[Math.floor(Math.random() * nodes.length)];
    const near = nodes.filter((b) => b !== a && (a.x - b.x) ** 2 + (a.y - b.y) ** 2 < LINK2);
    if (!near.length) return;
    const b = near[Math.floor(Math.random() * near.length)];
    pulses.push({ a, b, t: 0, speed: 0.016 + Math.random() * 0.024, c: Math.random() < 0.5 ? COLORS[0] : COLORS[1] });
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1;
    // Lignes regroupées par opacité (3 paliers) : 3 stroke() au lieu d'un par ligne.
    const buckets = [[], [], []];
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const d2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
        if (d2 < LINK2) buckets[Math.min(2, Math.floor((d2 / LINK2) * 3))].push(a, b);
      }
    }
    [0.16, 0.1, 0.05].forEach((alpha, k) => {
      const list = buckets[k];
      if (!list.length) return;
      ctx.strokeStyle = `rgba(5,217,232,${alpha})`;
      ctx.beginPath();
      for (let i = 0; i < list.length; i += 2) {
        ctx.moveTo(list[i].x, list[i].y);
        ctx.lineTo(list[i + 1].x, list[i + 1].y);
      }
      ctx.stroke();
    });
    for (const p of pulses) {
      const t0 = Math.max(0, p.t - 0.25);
      const x = p.a.x + (p.b.x - p.a.x) * p.t;
      const y = p.a.y + (p.b.y - p.a.y) * p.t;
      ctx.strokeStyle = `rgba(${p.c},0.55)`;
      ctx.beginPath();
      ctx.moveTo(p.a.x + (p.b.x - p.a.x) * t0, p.a.y + (p.b.y - p.a.y) * t0);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.drawImage(sprites.get(p.c), x - 6, y - 6, 12, 12);
    }
    for (const n of nodes) {
      const size = (n.r + n.glow * 2) * 6;
      ctx.globalAlpha = 0.45 + n.glow * 0.55;
      ctx.drawImage(sprites.get(n.c), n.x - size / 2, n.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }

  function step(now) {
    raf = requestAnimationFrame(step);
    if (now - last < FRAME_MS) return;
    last = now;
    if (document.body.classList.contains('modal-open')) return;
    for (const n of nodes) {
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < 0 || n.x > w) n.vx *= -1;
      if (n.y < 0 || n.y > h) n.vy *= -1;
      n.glow *= 0.88;
    }
    if (pulses.length < 8 && Math.random() < 0.12) spawnPulse();
    pulses = pulses.filter((p) => {
      p.t += p.speed;
      if (p.t >= 1) {
        p.b.glow = 1;
        return false;
      }
      return true;
    });
    draw();
  }

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });
  document.addEventListener('visibilitychange', () => {
    if (reduce) return;
    cancelAnimationFrame(raf);
    if (!document.hidden) raf = requestAnimationFrame(step);
  });

  resize();
  if (!reduce) raf = requestAnimationFrame(step);
}
