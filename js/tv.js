// จอทีวี — แสดงวงล้อ สุ่มรางวัล และประกาศผล
(() => {
  const $ = (s) => document.querySelector(s);
  const body = document.body;
  const canvas = $('#wheel');
  const ctx = canvas.getContext('2d');
  const pointer = $('#pointer');

  let cfg = LW.getConfig();
  let phase = 'attract';
  let unlocked = false;
  let rotation = 0;           // องศาที่วงล้อหมุนไปแล้ว (ตามเข็มนาฬิกา)
  let wheelPrizes = cfg.prizes; // รายการที่วาดอยู่บนวงล้อตอนนี้
  let configWaiting = false;  // มีการแก้ตั้งค่าระหว่างหมุน — รอให้หมุนเสร็จก่อนค่อยวาดใหม่
  let lastEntry = null;
  let resultTimer = null;
  let idleTimer = null;

  // ---------- ข้อความบนจอ ----------
  function applyTexts() {
    const s = cfg.settings;
    $('#title').textContent = s.title;
    $('#subtitle').textContent = s.subtitle;
    $('#qrCaption').textContent = s.qrCaption;
    $('#steps').innerHTML = '';
    s.steps.filter(Boolean).forEach((t) => {
      const li = document.createElement('li');
      li.textContent = t;
      $('#steps').appendChild(li);
    });
    renderQr($('#qrBox'), LW.qrSrc(s));
    const mini = $('#miniQr');
    mini.innerHTML = '<div class="qr-box"></div><span></span>';
    renderQr(mini.querySelector('.qr-box'), LW.qrSrc(s));
    mini.querySelector('span').textContent = s.qrCaption;
    renderQr($('#idleQr'), LW.qrSrc(s));
    $('#idleQrCaption').textContent = s.qrCaption;
    body.classList.toggle('no-unlock', !s.requireUnlock);
    body.dataset.fx = s.fx;
  }

  function renderQr(box, src) {
    box.innerHTML = '';
    box.classList.toggle('empty', !src);
    if (src) {
      const img = new Image();
      img.src = src;
      img.alt = 'QR code';
      box.appendChild(img);
    } else {
      box.textContent = 'ยังไม่ได้ใส่รูป QR\nใส่ได้ที่หน้าทีมงาน';
      box.style.whiteSpace = 'pre-line';
    }
  }

  // ---------- ไฟรอบวงล้อ ----------
  function buildLights() {
    const el = $('#lights');
    const n = 36;
    el.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const d = document.createElement('span');
      d.className = 'light';
      d.style.setProperty('--i', i);
      d.style.left = 50 + Math.cos(a) * 47.4 + '%';
      d.style.top = 50 + Math.sin(a) * 47.4 + '%';
      el.appendChild(d);
    }
  }

  // ---------- วาดวงล้อ ----------
  const segmenter = window.Intl && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'word' }) : null;

  function wrapText(text, maxWidth, maxLines) {
    const words = segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : text.split(/(\s+)/);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line + w;
      if (line && ctx.measureText(test.trim()).width > maxWidth) {
        lines.push(line.trim());
        line = w.trimStart();
      } else {
        line = test;
      }
    }
    if (line.trim()) lines.push(line.trim());
    // คำยาวคำเดียวที่ตัดไม่ได้ ก็ต้องย่อตัวหนังสือลงเหมือนกัน
    if (lines.some((l) => ctx.measureText(l).width > maxWidth)) return null;
    return lines.length <= maxLines ? lines : null;
  }

  function star(x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x + r * 0.08, y - r * 0.08, x + r, y);
    ctx.quadraticCurveTo(x + r * 0.08, y + r * 0.08, x, y + r);
    ctx.quadraticCurveTo(x - r * 0.08, y + r * 0.08, x - r, y);
    ctx.quadraticCurveTo(x - r * 0.08, y - r * 0.08, x, y - r);
    ctx.fill();
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const size = Math.round(canvas.getBoundingClientRect().width * dpr);
    if (!size) return;
    if (canvas.width !== size) { canvas.width = size; canvas.height = size; }

    const prizes = wheelPrizes;
    const n = prizes.length;
    const R = size / 2;
    ctx.clearRect(0, 0, size, size);
    if (!n) return;

    const { rows } = LW.odds(cfg, LW.getLog());
    const seg = (Math.PI * 2) / n;
    const fontFamily = getComputedStyle(document.documentElement).getPropertyValue('--font-thai-head');

    prizes.forEach((p, i) => {
      const a0 = -Math.PI / 2 + i * seg;
      const a1 = a0 + seg;
      const row = rows.find((r) => r.prize.id === p.id);
      const soldOut = row && row.left === 0;

      ctx.beginPath();
      ctx.moveTo(R, R);
      ctx.arc(R, R, R, a0, a1);
      ctx.closePath();
      if (p.tier === 'jackpot' && !p.color) {
        const mid = a0 + seg / 2;
        const g = ctx.createLinearGradient(R, R, R + Math.cos(mid) * R, R + Math.sin(mid) * R);
        g.addColorStop(0, '#8B5CF6');
        g.addColorStop(1, '#FF3EA5');
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = LW.sliceColor(p, i);
      }
      ctx.fill();
      if (soldOut) {
        ctx.fillStyle = 'rgba(11, 11, 16, 0.65)';
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = Math.max(1, size * 0.003);
      ctx.stroke();

      // ข้อความในช่อง (เขียนจากขอบนอกเข้าหาตรงกลาง)
      ctx.save();
      ctx.translate(R, R);
      ctx.rotate(a0 + seg / 2);
      const outer = R * 0.84;
      const inner = R * 0.27;
      const maxW = outer - inner;
      const maxH = 2 * R * 0.55 * Math.sin(Math.min(seg / 2, Math.PI / 4));
      let fs = Math.min(R * 0.085, maxH * 0.42);
      let lines = null;
      while (fs > R * 0.03) {
        ctx.font = `700 ${fs}px ${fontFamily}`;
        lines = wrapText(p.name, maxW, 2);
        if (lines && lines.length * fs * 1.15 <= maxH) break;
        fs *= 0.92;
      }
      if (!lines) lines = [p.name];
      ctx.fillStyle = soldOut ? 'rgba(244, 244, 247, 0.4)' : '#F4F4F7';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = fs * 0.3;
      const lh = fs * 1.15;
      lines.forEach((ln, k) => ctx.fillText(ln, outer, (k - (lines.length - 1) / 2) * lh));
      ctx.shadowBlur = 0;

      if (soldOut) {
        ctx.font = `600 ${fs * 0.55}px ${fontFamily}`;
        ctx.fillStyle = 'rgba(244, 63, 94, 0.9)';
        ctx.fillText('หมดแล้ว', outer, (lines.length / 2) * lh + fs * 0.35);
      } else if (p.tier === 'rare' || p.tier === 'jackpot') {
        ctx.fillStyle = p.tier === 'jackpot' ? '#FFFFFF' : '#FF3EA5';
        if (LW.sliceColor(p, i).toUpperCase() === '#FF3EA5') ctx.fillStyle = '#FFFFFF';
        star(R * 0.92, 0, R * 0.035);
      }
      ctx.restore();
    });

    // ขอบนอกไล่สีชมพู→ม่วง
    const ring = ctx.createLinearGradient(0, 0, size, size);
    ring.addColorStop(0, '#FF3EA5');
    ring.addColorStop(1, '#8B5CF6');
    ctx.beginPath();
    ctx.arc(R, R, R - size * 0.006, 0, Math.PI * 2);
    ctx.strokeStyle = ring;
    ctx.lineWidth = size * 0.012;
    ctx.stroke();
  }

  function setRotation(deg) {
    rotation = deg;
    canvas.style.transform = `rotate(${deg}deg)`;
  }

  // ---------- เสียง (สร้างเสียงเอง ไม่ต้องใช้ไฟล์) ----------
  let audio = null;
  function ac() {
    if (!cfg.settings.sound) return null;
    if (!audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audio = new AC();
    }
    if (audio.state === 'suspended') audio.resume();
    return audio;
  }
  function tone(freq, dur, type, vol, delay) {
    const a = ac();
    if (!a) return;
    const t = a.currentTime + (delay || 0);
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  // เสียงไซเรนไต่ระดับขึ้นเรื่อย ๆ ระหว่างวงล้อหมุน ให้ลุ้นขึ้น
  function riser(secs) {
    const a = ac();
    if (!a) return;
    const t = a.currentTime;
    const o = a.createOscillator();
    const lp = a.createBiquadFilter();
    const g = a.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(880, t + secs);
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.exponentialRampToValueAtTime(4000, t + secs);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + secs * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + secs + 0.1);
    o.connect(lp).connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + secs + 0.2);
  }

  const sounds = {
    tick: () => tone(1500, 0.035, 'square', 0.04),
    riser,
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, 'triangle', 0.18, i * 0.09)),
    rare: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.45, 'triangle', 0.2, i * 0.08)),
    jackpot: () => {
      [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.5, 'triangle', 0.2, i * 0.1));
      [2093, 2637, 3136].forEach((f, i) => tone(f, 1.2, 'sine', 0.05, 0.9 + i * 0.12));
    },
    none: () => [440, 349].forEach((f, i) => tone(f, 0.4, 'sine', 0.14, i * 0.18)),
    again: () => [659, 880, 659, 880].forEach((f, i) => tone(f, 0.2, 'square', 0.07, i * 0.1)),
  };

  // ---------- พลุกระดาษ ----------
  const confetti = (() => {
    const cv = $('#confetti');
    const c = cv.getContext('2d');
    const colors = ['#FF3EA5', '#8B5CF6', '#F9A8D4', '#C4B5FD', '#F4F4F7'];
    let parts = [];
    let running = false;

    function burst(count) {
      const w = (cv.width = innerWidth);
      cv.height = innerHeight;
      for (let i = 0; i < count; i++) {
        parts.push({
          x: w / 2 + (Math.random() - 0.5) * w * 0.3,
          y: innerHeight * 0.55,
          vx: (Math.random() - 0.5) * 22,
          vy: -Math.random() * 22 - 8,
          s: Math.random() * 9 + 5,
          r: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.3,
          col: colors[(Math.random() * colors.length) | 0],
          star: Math.random() < 0.15,
        });
      }
      if (!running) { running = true; requestAnimationFrame(step); }
    }
    function step() {
      c.clearRect(0, 0, cv.width, cv.height);
      parts.forEach((p) => {
        p.vy += 0.5; p.vx *= 0.99; p.vy *= 0.99;
        p.x += p.vx; p.y += p.vy; p.r += p.vr;
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.r);
        c.fillStyle = p.col;
        if (p.star) {
          c.beginPath();
          const r = p.s;
          c.moveTo(0, -r); c.quadraticCurveTo(r * .1, -r * .1, r, 0); c.quadraticCurveTo(r * .1, r * .1, 0, r);
          c.quadraticCurveTo(-r * .1, r * .1, -r, 0); c.quadraticCurveTo(-r * .1, -r * .1, 0, -r);
          c.fill();
        } else {
          c.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        }
        c.restore();
      });
      parts = parts.filter((p) => p.y < cv.height + 40);
      if (parts.length) requestAnimationFrame(step);
      else { running = false; c.clearRect(0, 0, cv.width, cv.height); }
    }
    return { burst };
  })();

  // ---------- สถานะ ----------
  function setPhase(p) {
    phase = p;
    body.dataset.phase = p;
    if (active) LW.setLive({ phase, unlocked, last: lastEntry, ts: Date.now() });
    resetIdle();
  }

  // หน้าปกติเมื่อไม่ได้หมุน: ถ้าไม่ต้องปลดล็อก หรือปลดล็อกแล้ว = พร้อมหมุน
  function restingPhase() {
    if (!LW.pick(cfg, LW.getLog())) return 'empty';
    return !cfg.settings.requireUnlock || unlocked ? 'ready' : 'attract';
  }

  function unlock() {
    if (phase === 'spinning') return;
    unlocked = true;
    hideIdle();
    if (phase !== 'result') setPhase(restingPhase());
    else LW.setLive({ phase, unlocked, last: lastEntry, ts: Date.now() });
  }
  function lock() {
    if (phase === 'spinning') return;
    unlocked = false;
    if (phase !== 'result') setPhase(restingPhase());
  }

  function nudge() {
    const el = document.querySelector('.state-attract .qr-card');
    if (!el) return;
    el.classList.remove('nudge');
    void el.offsetWidth;
    el.classList.add('nudge');
  }

  // ---------- หมุน ----------
  function spin() {
    if (!active || phase === 'spinning') return;
    if (phase === 'result') { closeResult(); return; }
    hideIdle();
    if (cfg.settings.requireUnlock && !unlocked) { nudge(); return; }

    const log = LW.getLog();
    const prize = LW.pick(cfg, log);
    if (!prize) { setPhase('empty'); return; }

    // บันทึกผลทันทีที่สุ่มได้ (ถ้าปิดหน้าจอระหว่างหมุน ประวัติก็ยังอยู่)
    lastEntry = { no: log.length + 1, t: Date.now(), prizeId: prize.id, name: prize.name, tier: prize.tier };
    LW.addLog(lastEntry);
    unlocked = prize.tier === 'again';

    wheelPrizes = cfg.prizes;
    draw();
    const n = wheelPrizes.length;
    const index = wheelPrizes.findIndex((p) => p.id === prize.id);
    const seg = 360 / n;
    const jitter = (Math.random() - 0.5) * seg * 0.7;
    const target = (((360 - ((index + 0.5) * seg + jitter)) % 360) + 360) % 360;
    const current = ((rotation % 360) + 360) % 360;
    const delta = (target - current + 360) % 360;
    const secs = Math.max(2, Number(cfg.settings.spinSeconds) || 6);
    const turns = Math.max(3, Math.round(secs * 1.1));
    const from = rotation;
    const to = rotation + turns * 360 + delta;
    const dur = secs * 1000;
    const t0 = performance.now();
    let lastSeg = Math.floor(from / seg);

    setPhase('spinning');
    ac();
    sounds.riser(secs);

    // กันค้าง: ถ้าหน้าต่างถูกย่อหรือถูกบัง เบราว์เซอร์จะหยุดภาพเคลื่อนไหว — ให้จบการหมุนตามเวลาเอง
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setRotation(to);
      setTimeout(() => showResult(prize), 350);
    };
    setTimeout(finish, dur + 600);

    function frame(now) {
      if (done) return;
      const t = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - t, 4);
      setRotation(from + (to - from) * e);
      const s = Math.floor(rotation / seg);
      if (s !== lastSeg) {
        lastSeg = s;
        sounds.tick();
        pointer.classList.remove('tick');
        void pointer.getBoundingClientRect();
        pointer.classList.add('tick');
      }
      if (t < 1) requestAnimationFrame(frame);
      else finish();
    }
    requestAnimationFrame(frame);
  }

  const RESULT_TEXT = {
    jackpot: { head: 'แจ็คพอต! ยินดีด้วย', sub: 'แสดงหน้าจอนี้กับทีมงานเพื่อรับรางวัล' },
    rare:    { head: 'หายากมาก! ยินดีด้วย', sub: 'แสดงหน้าจอนี้กับทีมงานเพื่อรับรางวัล' },
    common:  { head: 'ยินดีด้วย คุณได้รับ', sub: 'แสดงหน้าจอนี้กับทีมงานเพื่อรับรางวัล' },
    again:   { head: 'โชคดีเด้งสอง!', sub: 'ได้สิทธิ์หมุนอีก 1 ครั้ง' },
    none:    { head: 'เสียดายจัง', sub: 'ไว้มาลุ้นกันใหม่นะ' },
  };

  function showResult(prize) {
    const el = $('#result');
    const txt = RESULT_TEXT[prize.tier] || RESULT_TEXT.common;
    el.dataset.tier = prize.tier;
    $('#resultHead').textContent = txt.head;
    $('#resultName').textContent = prize.name;
    $('#resultSub').textContent = txt.sub;
    el.classList.add('show');
    setPhase('result');

    if (prize.tier !== 'none' && cfg.settings.fx !== 'off') {
      const flash = $('#flash');
      flash.classList.remove('go');
      void flash.offsetWidth;
      flash.classList.add('go');
    }

    const fireworks = (n) => window.LWFX && window.LWFX.fireworks(n);
    if (prize.tier === 'jackpot') {
      sounds.jackpot();
      confetti.burst(260);
      setTimeout(() => confetti.burst(200), 700);
      setTimeout(() => confetti.burst(200), 1500);
      fireworks(10);
      setTimeout(() => fireworks(8), 3200);
    } else if (prize.tier === 'rare') { sounds.rare(); confetti.burst(220); fireworks(5); }
    else if (prize.tier === 'common') { sounds.win(); confetti.burst(140); fireworks(2); }
    else if (prize.tier === 'again') { sounds.again(); confetti.burst(70); }
    else sounds.none();

    const secs = Math.max(3, Number(cfg.settings.resultSeconds) || 10) * (prize.tier === 'jackpot' ? 1.5 : 1);
    const bar = $('#resultBar');
    bar.style.transition = 'none';
    bar.style.transform = 'scaleX(1)';
    void bar.offsetWidth;
    bar.style.transition = `transform ${secs}s linear`;
    bar.style.transform = 'scaleX(0)';
    clearTimeout(resultTimer);
    resultTimer = setTimeout(closeResult, secs * 1000);
  }

  function closeResult() {
    clearTimeout(resultTimer);
    $('#result').classList.remove('show');
    if (configWaiting) applyConfig();
    else draw();
    setPhase(restingPhase());
  }

  // ---------- หน้ารอเมื่อไม่มีคนเล่น ----------
  function resetIdle() {
    clearTimeout(idleTimer);
    const secs = Number(cfg.settings.idleSeconds) || 0;
    const waiting = phase === 'attract' || (phase === 'ready' && !cfg.settings.requireUnlock);
    if (secs > 0 && waiting) {
      idleTimer = setTimeout(showIdle, secs * 1000);
    }
  }
  function showIdle() {
    $('#idle').classList.add('show');
    // รอให้หน้ารอจางขึ้นมาจนทึบก่อน แล้วค่อยหยุดวาดของข้างหลัง
    setTimeout(() => { if ($('#idle').classList.contains('show')) body.classList.add('idle-on'); }, 900);
  }
  function hideIdle() {
    body.classList.remove('idle-on');
    $('#idle').classList.remove('show');
    resetIdle();
  }

  // ---------- รับการเปลี่ยนแปลงจากหน้าทีมงาน ----------
  function applyConfig() {
    configWaiting = false;
    cfg = LW.getConfig();
    wheelPrizes = cfg.prizes;
    applyTexts();
    draw();
  }

  LW.onChange((key, value) => {
    if (key === LW.K.config) {
      if (phase === 'spinning' || phase === 'result') { configWaiting = true; return; }
      applyConfig();
      setPhase(restingPhase());
    } else if (key === LW.K.log) {
      if (phase !== 'spinning') { draw(); if (phase !== 'result') setPhase(restingPhase()); }
    } else if (key === LW.K.cmd && value) {
      runCommand(value);
    } else if (key === LW.K.owner) {
      checkOwner();
    }
  });

  // ---------- ใช้จอวงล้อได้ทีละหน้าต่างเดียว ----------
  // ถ้าเผลอเปิดซ้ำ ทั้งสองหน้าต่างจะสุ่มคนละรางวัล — หน้าต่างที่เปิดทีหลังจะหยุดรอ จนกว่าทีมงานจะเลือกใช้หน้าต่างนั้นแทน
  const tvId = Math.random().toString(36).slice(2);
  let active = false;
  function claim() {
    localStorage.setItem(LW.K.owner, tvId);
    active = true;
    $('#dup').classList.remove('show');
    LW.beat();
  }
  function checkOwner() {
    const owner = localStorage.getItem(LW.K.owner);
    if (active && owner && owner !== tvId) {
      active = false;
      $('#dupText').textContent = 'มีจอวงล้อเปิดอยู่อีกหน้าต่างหนึ่ง หน้าต่างนี้จึงหยุดทำงาน';
      $('#dup').classList.add('show');
    }
  }
  window.addEventListener('pagehide', () => {
    if (active && localStorage.getItem(LW.K.owner) === tvId) localStorage.removeItem(LW.K.owner);
  });
  $('#dupTake').addEventListener('click', (e) => { e.stopPropagation(); claim(); setPhase(restingPhase()); });

  // รับคำสั่งจากหน้าทีมงาน — เช็กซ้ำทุกครึ่งวินาทีด้วย เผื่อเบราว์เซอร์ไม่ส่งสัญญาณมา
  let lastCmd = '';
  function runCommand(c) {
    const id = c.ts + ':' + c.n;
    if (id === lastCmd) return;
    lastCmd = id;
    if (!active) return;
    if (Date.now() - c.ts > 5000) return; // คำสั่งเก่าค้างจากรอบก่อน
    const actions = {
      unlock, lock, identify,
      spin: () => { if (c.data && c.data.unlock && phase !== 'spinning' && phase !== 'result') unlocked = true; spin(); },
      close: () => phase === 'result' && closeResult(),
      idle: showIdle,
    };
    if (actions[c.cmd]) actions[c.cmd]();
  }
  // คำสั่งที่ค้างอยู่ก่อนเปิดหน้านี้ (เช่น กด F5) ไม่ต้องทำซ้ำ
  try {
    const c = JSON.parse(localStorage.getItem(LW.K.cmd) || 'null');
    if (c) lastCmd = c.ts + ':' + c.n;
  } catch (e) { /* ข้ามข้อมูลเสีย */ }
  setInterval(() => {
    checkOwner();
    try {
      const c = JSON.parse(localStorage.getItem(LW.K.cmd) || 'null');
      if (c) runCommand(c);
    } catch (e) { /* ข้ามข้อมูลเสีย */ }
  }, 500);

  // ---------- ปุ่มและคีย์บอร์ด ----------
  const SPIN_KEYS = [' ', 'Enter', 'PageDown', 'PageUp', 'ArrowRight', 'ArrowDown'];
  document.addEventListener('keydown', (e) => {
    if ($('#start').classList.contains('hide') === false) { startTv(); return; }
    if (SPIN_KEYS.includes(e.key)) { e.preventDefault(); spin(); }
    else if (e.key === 'Escape' && phase === 'result') closeResult();
    else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    else hideIdle();
  });
  $('#spinBtn').addEventListener('click', spin);
  $('#hub').addEventListener('click', spin);
  $('#result').addEventListener('click', closeResult);
  $('#idle').addEventListener('click', hideIdle);
  let cursorTimer = null;
  document.addEventListener('pointermove', () => {
    resetIdle();
    body.classList.remove('hide-cursor');
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => body.classList.add('hide-cursor'), 2000);
  });

  function identify() {
    const el = $('#identify');
    el.classList.add('show');
    clearTimeout(identify.timer);
    identify.timer = setTimeout(() => el.classList.remove('show'), 3000);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }
  function startTv() {
    $('#start').classList.add('hide');
    ac();
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  }
  $('#start').addEventListener('click', startTv);

  // ---------- เริ่มต้น ----------
  buildLights();
  applyTexts();
  setRotation(0);
  draw();
  if (LW.tvAlive() && localStorage.getItem(LW.K.owner)) {
    $('#dupText').textContent = 'มีจอวงล้อเปิดอยู่แล้วอีกหน้าต่างหนึ่ง';
    $('#dup').classList.add('show');
  } else {
    claim();
  }
  setPhase(restingPhase());
  if (document.fonts) document.fonts.ready.then(draw);
  window.addEventListener('resize', draw);
  setInterval(() => { if (active) LW.beat(); }, 1000);

  // ใช้ตอนทดสอบ / ซ่อมหน้างาน
  window.LWTV = { spin, unlock, lock, closeResult, state: () => ({ phase, unlocked, rotation }) };
})();
