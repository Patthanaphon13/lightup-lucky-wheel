// เอฟเฟกต์จอทีวี: แสงระยิบลอยขึ้น (กลายเป็นเส้นแสงพุ่งตอนหมุน), ประกายดาว และพลุดอกไม้ไฟตอนประกาศผล
// ระดับเอฟเฟกต์อ่านจาก <body data-fx="full|lite|off"> (ตั้งได้ในหน้าทีมงาน)
(() => {
  const cv = document.getElementById('fx');
  if (!cv) return;
  const c = cv.getContext('2d');
  const COLORS = ['255,62,165', '139,92,246', '249,168,212', '196,181,253', '244,244,247'];
  const COUNT = { full: 170, lite: 40, off: 0 };
  let w = 0, h = 0, dpr = 1;
  let dots = [];
  let glints = [];
  let speed = 1;
  let started = false;

  // วาดจุดเรืองแสงไว้ล่วงหน้า แล้วค่อยปั๊มซ้ำ — เบาเครื่องกว่าวาดเงาทุกเฟรม
  const sprites = COLORS.map((rgb) => {
    const s = document.createElement('canvas');
    s.width = s.height = 64;
    const x = s.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, `rgba(${rgb},1)`);
    g.addColorStop(0.25, `rgba(${rgb},.6)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    return s;
  });

  // พลุอยู่บนสุด (เหนือหน้าประกาศผล) จึงใช้ canvas แยก
  const fw = document.createElement('canvas');
  fw.className = 'confetti';
  fw.style.zIndex = 13;
  document.body.appendChild(fw);
  const f = fw.getContext('2d');
  let rockets = [];
  let sparks = [];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = cv.width = fw.width = Math.round(innerWidth * dpr);
    h = cv.height = fw.height = Math.round(innerHeight * dpr);
  }

  function makeDot(anywhere) {
    return {
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : h + 20 * dpr,
      r: (Math.random() * 10 + 4) * dpr,
      vy: (Math.random() * 0.35 + 0.12) * dpr,
      vx: (Math.random() - 0.5) * 0.15 * dpr,
      sway: Math.random() * Math.PI * 2,
      tw: Math.random() * Math.PI * 2,
      s: (Math.random() * COLORS.length) | 0,
    };
  }

  // ประกายดาว 4 แฉกสีชมพู (CI: ไม่เกิน 3 ดวงพร้อมกัน)
  function glint() {
    return { x: Math.random() * w, y: Math.random() * h * 0.85, life: 0, max: 90 + Math.random() * 60, r: (Math.random() * 12 + 10) * dpr };
  }

  function star(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x + r * 0.1, y - r * 0.1, x + r, y);
    ctx.quadraticCurveTo(x + r * 0.1, y + r * 0.1, x, y + r);
    ctx.quadraticCurveTo(x - r * 0.1, y + r * 0.1, x - r, y);
    ctx.quadraticCurveTo(x - r * 0.1, y - r * 0.1, x, y - r);
    ctx.fill();
  }

  // ---------- พลุ ----------
  function launch(delay) {
    setTimeout(() => {
      rockets.push({
        x: w * (0.15 + Math.random() * 0.7),
        y: h + 10,
        vy: -(h / 55) * (0.85 + Math.random() * 0.3),
        target: h * (0.15 + Math.random() * 0.35),
        s: (Math.random() * 3) | 0,
      });
    }, delay);
  }
  function explode(r) {
    const n = 90 + ((Math.random() * 50) | 0);
    const power = (Math.random() * 4 + 6) * dpr;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const v = power * (0.6 + Math.random() * 0.5);
      sparks.push({
        x: r.x, y: r.y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: 0, max: 60 + Math.random() * 40,
        s: Math.random() < 0.7 ? r.s : 4,
        r: (Math.random() * 6 + 6) * dpr,
      });
    }
  }
  function fireworks(count) {
    if ((document.body.dataset.fx || 'full') === 'off') return;
    for (let i = 0; i < count; i++) launch(i * 280 + Math.random() * 200);
  }

  function drawFireworks() {
    f.globalCompositeOperation = 'source-over';
    f.clearRect(0, 0, w, h);
    if (!rockets.length && !sparks.length) return;
    f.globalCompositeOperation = 'lighter';
    rockets.forEach((r) => {
      r.y += r.vy;
      r.vy *= 0.985;
      f.globalAlpha = 1;
      f.drawImage(sprites[r.s], r.x - 14 * dpr, r.y - 14 * dpr, 28 * dpr, 28 * dpr);
      f.globalAlpha = 0.5;
      f.drawImage(sprites[r.s], r.x - 6 * dpr, r.y + 10 * dpr, 12 * dpr, 30 * dpr);
      if (r.y <= r.target || r.vy > -2) { r.done = true; explode(r); }
    });
    rockets = rockets.filter((r) => !r.done);
    sparks.forEach((p) => {
      p.life++;
      p.vx *= 0.96; p.vy = p.vy * 0.96 + 0.08 * dpr;
      p.x += p.vx; p.y += p.vy;
      const k = 1 - p.life / p.max;
      f.globalAlpha = Math.max(0, k);
      const r = p.r * (0.4 + k * 0.6);
      f.drawImage(sprites[p.s], p.x - r, p.y - r, r * 2, r * 2);
    });
    sparks = sparks.filter((p) => p.life < p.max);
    f.globalAlpha = 1;
  }

  // ---------- วนวาดทุกเฟรม ----------
  function frame() {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    drawFireworks();
    if (document.body.classList.contains('idle-on')) return;

    const level = document.body.dataset.fx || 'full';
    const target = COUNT[level] ?? COUNT.full;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, w, h);
    if (!target) { dots = []; glints = []; return; }

    // ตอนหมุน แสงพุ่งขึ้นเร็วเป็นเส้น
    const want = document.body.dataset.phase === 'spinning' ? 9 : 1;
    speed += (want - speed) * 0.05;

    while (dots.length < target) dots.push(makeDot(!started));
    if (dots.length > target) dots.length = target;
    started = true;

    c.globalCompositeOperation = 'lighter';
    for (const d of dots) {
      d.sway += 0.01;
      d.tw += 0.03;
      d.y -= d.vy * speed;
      d.x += d.vx + Math.sin(d.sway) * 0.2 * dpr;
      if (d.y < -60 * dpr) Object.assign(d, makeDot(false));
      const a = 0.35 + Math.sin(d.tw) * 0.25;
      if (speed > 2) {
        // เส้นแสงพุ่ง
        const len = d.vy * speed * 14;
        const g = c.createLinearGradient(d.x, d.y, d.x, d.y + len);
        g.addColorStop(0, `rgba(${COLORS[d.s]},${Math.min(1, a + 0.3)})`);
        g.addColorStop(1, `rgba(${COLORS[d.s]},0)`);
        c.strokeStyle = g;
        c.lineWidth = Math.max(1, d.r * 0.22);
        c.beginPath();
        c.moveTo(d.x, d.y);
        c.lineTo(d.x, d.y + len);
        c.stroke();
      }
      c.globalAlpha = a;
      c.drawImage(sprites[d.s], d.x - d.r, d.y - d.r, d.r * 2, d.r * 2);
      c.globalAlpha = 1;
    }

    if (level === 'full') {
      if (glints.length < 3 && Math.random() < 0.015) glints.push(glint());
      c.fillStyle = '#FF3EA5';
      for (const g of glints) {
        g.life++;
        const k = Math.sin((g.life / g.max) * Math.PI);
        c.globalAlpha = k;
        c.drawImage(sprites[0], g.x - g.r * 2, g.y - g.r * 2, g.r * 4, g.r * 4);
        star(c, g.x, g.y, g.r * k);
      }
      glints = glints.filter((g) => g.life < g.max);
    }
    c.globalAlpha = 1;
  }

  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(frame);
  window.LWFX = { fireworks };
})();
