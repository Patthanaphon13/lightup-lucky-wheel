/*
 * ข้อมูลกลางของเกมวงล้อ — ใช้ร่วมกันระหว่างจอทีวี (tv.html) และหน้าทีมงาน (control.html)
 * เก็บทุกอย่างไว้ใน localStorage ของเบราว์เซอร์ ไม่ต้องใช้อินเทอร์เน็ต
 *
 *   lw.config  ตั้งค่า + รายการรางวัล   (หน้าทีมงานเป็นคนเขียน)
 *   lw.log     ประวัติการหมุนทุกครั้ง     (จอทีวีเป็นคนเขียน) — จำนวนที่แจกไปแล้วนับจากตรงนี้
 *   lw.live    สถานะจอทีวีตอนนี้         (จอทีวีเป็นคนเขียน)
 *   lw.cmd     คำสั่งจากหน้าทีมงานถึงจอทีวี
 *   lw.beat    สัญญาณว่าจอทีวียังเปิดอยู่
 */
const LW = (() => {
  const K = { config: 'lw.config', log: 'lw.log', live: 'lw.live', cmd: 'lw.cmd', beat: 'lw.beat', owner: 'lw.owner' };

  // ประเภทรางวัล
  const TIERS = {
    none:    { label: 'ไม่ได้รางวัล',  short: 'ขอบคุณ' },
    again:   { label: 'หมุนอีกครั้ง',  short: 'หมุนใหม่' },
    common:  { label: 'ธรรมดา',       short: 'ธรรมดา' },
    rare:    { label: 'หายาก',        short: 'หายาก' },
    jackpot: { label: 'แจ็คพอต',      short: 'แจ็คพอต' },
  };

  // รูป QR ที่ใช้เมื่อไม่ได้อัปโหลดรูปเองในหน้าทีมงาน (เปลี่ยนไฟล์ assets/qr.png ได้)
  const DEFAULT_QR = 'assets/qr.png';
  const qrSrc = (s) => s.qrImage || DEFAULT_QR;

  // สีช่องวงล้ออัตโนมัติ ตาม CI (ไม่มีสีทอง)
  const AUTO_COLORS = ['#1C1C26', '#FF3EA5', '#14141C', '#8B5CF6'];

  // ข้อมูลตัวอย่าง — แก้ได้ทั้งหมดในหน้าทีมงาน
  const DEFAULT_CONFIG = {
    settings: {
      title: 'หมุนวงล้อ ลุ้นรางวัล',
      subtitle: 'สแกน QR ร่วมกิจกรรม แล้วรับสิทธิ์หมุน 1 ครั้ง',
      steps: ['สแกน QR ด้วยมือถือ', 'ร่วมกิจกรรมให้ครบ', 'โชว์หน้าจอให้ทีมงาน แล้วหมุนได้เลย'],
      qrImage: '',
      qrCaption: 'สแกนเพื่อร่วมสนุก',
      pin: '1234',
      requireUnlock: true,
      sound: true,
      spinSeconds: 6,
      resultSeconds: 10,
      idleSeconds: 60,
      fx: 'full', // เอฟเฟกต์พื้นหลัง: full = เต็ม, lite = เบา (คอมสเปกต่ำ), off = ปิด
    },
    prizes: [
      { id: 'p1', name: 'ขอบคุณที่ร่วมสนุก', tier: 'none',    weight: 20, stock: null, minSpin: 0,  color: '' },
      { id: 'p2', name: 'สติกเกอร์',         tier: 'common',  weight: 30, stock: null, minSpin: 0,  color: '' },
      { id: 'p3', name: 'พวงกุญแจ',          tier: 'common',  weight: 20, stock: 150,  minSpin: 0,  color: '' },
      { id: 'p4', name: 'หมุนอีกครั้ง',       tier: 'again',   weight: 8,  stock: null, minSpin: 0,  color: '' },
      { id: 'p5', name: 'ถุงผ้า',            tier: 'common',  weight: 12, stock: 80,   minSpin: 0,  color: '' },
      { id: 'p6', name: 'แก้วน้ำ',           tier: 'rare',    weight: 6,  stock: 40,   minSpin: 0,  color: '' },
      { id: 'p7', name: 'เสื้อยืด',          tier: 'rare',    weight: 3,  stock: 20,   minSpin: 0,  color: '' },
      { id: 'p8', name: 'หูฟังไร้สาย',        tier: 'jackpot', weight: 1,  stock: 2,    minSpin: 50, color: '' },
    ],
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      alert('บันทึกข้อมูลไม่สำเร็จ (พื้นที่เก็บข้อมูลเต็ม) — ลองใช้รูป QR ที่เล็กลง');
      return false;
    }
  }

  // เติมค่าที่ขาดจากค่าเริ่มต้น เผื่อไฟล์ตั้งค่าเก่าหรือไฟล์ที่นำเข้ามาไม่ครบ
  function normalize(cfg) {
    const base = clone(DEFAULT_CONFIG);
    if (!cfg || typeof cfg !== 'object') return base;
    const settings = Object.assign(base.settings, cfg.settings || {});
    if (!['full', 'lite', 'off'].includes(settings.fx)) settings.fx = 'full';
    const prizes = Array.isArray(cfg.prizes) ? cfg.prizes.map((p, i) => ({
      id: p.id || 'p' + Date.now().toString(36) + i,
      name: String(p.name ?? 'รางวัล'),
      tier: TIERS[p.tier] ? p.tier : 'common',
      weight: Math.max(0, Number(p.weight) || 0),
      stock: p.stock === null || p.stock === '' || p.stock === undefined ? null : Math.max(0, Math.floor(Number(p.stock) || 0)),
      minSpin: Math.max(0, Math.floor(Number(p.minSpin) || 0)),
      color: p.color || '',
    })) : base.prizes;
    return { settings, prizes };
  }

  const getConfig = () => normalize(read(K.config, null));
  const setConfig = (cfg) => write(K.config, normalize(cfg));
  const resetConfig = () => write(K.config, clone(DEFAULT_CONFIG));

  const getLog = () => read(K.log, []);
  const clearLog = () => write(K.log, []);
  function addLog(entry) {
    const log = getLog();
    log.push(entry);
    write(K.log, log);
    return log;
  }

  function countGiven(log) {
    const c = {};
    for (const e of log) c[e.prizeId] = (c[e.prizeId] || 0) + 1;
    return c;
  }

  // เหลือกี่ชิ้น (null = ไม่จำกัด)
  function remaining(prize, given) {
    if (prize.stock == null) return null;
    return Math.max(0, prize.stock - (given[prize.id] || 0));
  }

  // รางวัลที่ "ตอนนี้" มีสิทธิ์ออก และโอกาสจริงเป็นเปอร์เซ็นต์
  function odds(cfg, log) {
    const given = countGiven(log);
    const spins = log.length;
    const rows = cfg.prizes.map((p) => {
      const left = remaining(p, given);
      let reason = '';
      if (p.weight <= 0) reason = 'โอกาสเป็น 0';
      else if (left === 0) reason = 'ของหมดแล้ว';
      else if (spins < p.minSpin) reason = `ออกได้หลังหมุนครบ ${p.minSpin} ครั้ง`;
      return { prize: p, left, given: given[p.id] || 0, active: !reason, reason, chance: 0 };
    });
    const total = rows.reduce((s, r) => s + (r.active ? r.prize.weight : 0), 0);
    rows.forEach((r) => { r.chance = r.active && total ? (r.prize.weight / total) * 100 : 0; });
    return { rows, total };
  }

  function random() {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] / 4294967296;
  }

  // สุ่มรางวัลตามน้ำหนัก — คืนค่า null ถ้าไม่มีรางวัลเหลือให้สุ่ม
  function pick(cfg, log) {
    const { rows, total } = odds(cfg, log);
    if (!total) return null;
    let x = random() * total;
    for (const r of rows) {
      if (!r.active) continue;
      x -= r.prize.weight;
      if (x < 0) return r.prize;
    }
    return rows.filter((r) => r.active).pop().prize;
  }

  // ทดลองสุ่มโดยไม่บันทึกจริง เพื่อดูว่ารางวัลออกบ่อยแค่ไหน
  function simulate(cfg, startLog, times) {
    const log = startLog.slice();
    const result = {};
    let empty = 0;
    for (let i = 0; i < times; i++) {
      const p = pick(cfg, log);
      if (!p) { empty++; continue; }
      result[p.id] = (result[p.id] || 0) + 1;
      log.push({ prizeId: p.id });
    }
    return { result, empty };
  }

  function sliceColor(prize, index) {
    if (prize.color) return prize.color;
    return AUTO_COLORS[index % AUTO_COLORS.length];
  }

  // ---- สื่อสารระหว่างหน้าต่าง ----
  function send(cmd, data) {
    write(K.cmd, { cmd, data: data || null, ts: Date.now(), n: Math.random() });
  }
  function onChange(handler) {
    window.addEventListener('storage', (e) => {
      if (!e.key || !e.key.startsWith('lw.')) return;
      let value = null;
      try { value = e.newValue ? JSON.parse(e.newValue) : null; } catch (err) { /* ข้ามข้อมูลเสีย */ }
      handler(e.key, value);
    });
  }

  const getLive = () => read(K.live, { phase: 'attract', unlocked: false });
  const setLive = (live) => write(K.live, live);
  const beat = () => { try { localStorage.setItem(K.beat, String(Date.now())); } catch (e) { /* ไม่เป็นไร */ } };
  const tvAlive = () => Date.now() - Number(localStorage.getItem(K.beat) || 0) < 3500;

  // ---- จอ ----
  // true = ต่อทีวีแบบ "ขยาย" (Extend) แล้ว · false = จอเดียว หรือแบบ "ทำซ้ำ" (ลูกค้าจะเห็นทุกอย่าง) · null = เบราว์เซอร์ตรวจไม่ได้
  const screenExtended = () => ('isExtended' in screen ? !!screen.isExtended : null);

  // เปิดจอวงล้อ — ถ้าเจอจอที่สอง จะวางหน้าต่างไว้บนทีวีให้เลย (เบราว์เซอร์อาจถามสิทธิ์ "จัดการหน้าต่าง" ครั้งแรก ให้กดอนุญาต)
  async function openTv() {
    let features = 'popup,width=1280,height=720';
    let placed = false;
    if (screenExtended() && 'getScreenDetails' in window) {
      try {
        const d = await window.getScreenDetails();
        const tv = d.screens.find((s) => s !== d.currentScreen) || null;
        if (tv) {
          features = `popup,left=${tv.availLeft},top=${tv.availTop},width=${tv.availWidth},height=${tv.availHeight}`;
          placed = true;
        }
      } catch (e) { /* ไม่ได้รับสิทธิ์ — เปิดแบบปกติแล้วให้ลากเอง */ }
    }
    const w = window.open('tv.html', 'lw-tv', features);
    if (w && placed) {
      try { w.moveTo(Number(features.match(/left=(-?\d+)/)[1]), Number(features.match(/top=(-?\d+)/)[1])); } catch (e) { /* ไม่เป็นไร */ }
    }
    return placed;
  }

  // ครั้งแรกที่เปิด: บันทึกข้อมูลตัวอย่างไว้
  if (localStorage.getItem(K.config) == null) resetConfig();

  return {
    K, TIERS, AUTO_COLORS, DEFAULT_CONFIG, DEFAULT_QR, qrSrc, clone,
    getConfig, setConfig, resetConfig, normalize,
    getLog, addLog, clearLog, countGiven, remaining, odds, pick, simulate, sliceColor,
    send, onChange, getLive, setLive, beat, tvAlive, screenExtended, openTv,
  };
})();
