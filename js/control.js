// หน้าทีมงาน — ควบคุมจอทีวี ตั้งค่ารางวัล ดูประวัติ
(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Number(n).toLocaleString('th-TH');

  let saved = LW.getConfig();   // ค่าที่บันทึกแล้ว (จอทีวีใช้ค่านี้)
  let draft = LW.clone(saved);  // ค่าที่กำลังแก้
  let dirty = false;
  let tab = 'control';

  // ---------- PIN ----------
  function checkAuth() {
    const ok = sessionStorage.getItem('lw.auth') === '1';
    document.body.classList.toggle('locked', !ok);
    if (!ok) setTimeout(() => $('#pinInput').focus(), 50);
  }
  $('#pinForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if ($('#pinInput').value === String(saved.settings.pin)) {
      sessionStorage.setItem('lw.auth', '1');
      $('#pinError').textContent = '';
      checkAuth();
    } else {
      $('#pinError').textContent = 'รหัสไม่ถูกต้อง';
      $('#pinInput').select();
    }
  });

  // ---------- แท็บ ----------
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    $$('#tabs button').forEach((x) => x.classList.toggle('active', x === b));
    $$('.tab-page').forEach((p) => p.classList.toggle('active', p.dataset.page === tab));
    renderAll();
  });

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function setDirty(v) {
    dirty = v;
    $('#saveBar').classList.toggle('show', v);
  }

  // ---------- ควบคุม ----------
  const PHASE_TEXT = {
    attract: 'รอลูกค้าสแกน QR',
    ready: 'พร้อมหมุน',
    spinning: 'กำลังหมุน...',
    result: 'กำลังแสดงผลรางวัล',
    empty: 'ของรางวัลหมดแล้ว',
  };

  function renderStatus() {
    const alive = LW.tvAlive();
    const st = $('#tvStatus');
    st.classList.toggle('on', alive);
    st.classList.toggle('off', !alive);
    st.lastChild.textContent = alive ? ' จอทีวีเชื่อมต่อแล้ว' : ' ยังไม่ได้เปิดจอทีวี';

    const live = LW.getLive();
    const big = $('#bigAction');
    if (!alive) {
      $('#phaseText').textContent = 'ยังไม่ได้เปิดจอทีวี';
      big.textContent = 'เปิดจอทีวี';
      big.disabled = false;
      big.dataset.act = 'open';
    } else {
      let text = PHASE_TEXT[live.phase] || '—';
      if (live.phase === 'result' && live.unlocked) text += ' (ได้หมุนอีกครั้ง)';
      $('#phaseText').textContent = text;
      const map = {
        attract: ['ปลดล็อกสิทธิ์หมุน', 'unlock', false],
        ready: ['หมุนเลย', 'spin', false],
        spinning: ['กำลังหมุน...', '', true],
        result: ['ปิดหน้าประกาศผล', 'close', false],
        empty: ['ของรางวัลหมดแล้ว', '', true],
      };
      const [label, act, disabled] = map[live.phase] || map.attract;
      big.textContent = label;
      big.dataset.act = act;
      big.disabled = disabled;
    }
    $('#spinNow').disabled = !alive || live.phase === 'spinning' || live.phase === 'empty';
    $('#lockBtn').disabled = !alive || !live.unlocked;
    $('#closeResult').disabled = !alive || live.phase !== 'result';
  }

  function renderControl() {
    renderStatus();
    const log = LW.getLog();
    const { rows } = LW.odds(saved, log);
    const last = log[log.length - 1];
    $('#lastResult').innerHTML = last
      ? `${esc(last.name)}<small>ครั้งที่ ${fmt(last.no || log.length)} · ${new Date(last.t).toLocaleTimeString('th-TH')} · ${esc(LW.TIERS[last.tier] ? LW.TIERS[last.tier].label : '')}</small>`
      : 'ยังไม่มีการหมุน';
    $('#statSpins').textContent = fmt(log.length);
    $('#statGiven').textContent = fmt(log.filter((e) => e.tier !== 'none' && e.tier !== 'again').length);

    $('#stockList').innerHTML = rows.map((r, i) => {
      const p = r.prize;
      const pct = r.left == null ? 100 : p.stock ? (r.left / p.stock) * 100 : 0;
      const leftText = r.left == null ? '∞' : fmt(r.left);
      const sub = r.left == null ? 'ไม่จำกัด' : `จาก ${fmt(p.stock)}`;
      return `<div class="stock-item ${r.left === 0 ? 'out' : ''}">
        <div class="stock-top">
          <span class="stock-name"><span class="sw" style="background:${esc(LW.sliceColor(p, i))}"></span>${esc(p.name)}</span>
          <span class="stock-left">${leftText} <small>${sub}</small></span>
        </div>
        <div class="bar"><span style="width:${pct}%"></span></div>
        <div class="stock-meta">
          <span>แจกแล้ว ${fmt(r.given)}</span>
          <span class="${r.active ? '' : 'warn'}">${r.active ? `โอกาสตอนนี้ ${r.chance.toFixed(1)}%` : r.reason}</span>
        </div>
      </div>`;
    }).join('');
  }

  function act(a, data) {
    if (a === 'open') openTv();
    else if (a) LW.send(a, data);
    setTimeout(renderStatus, 150);
  }

  // ปุ่มที่เพิ่งกดจะไม่ค้างโฟกัส — ไม่งั้นกด Space ทีหลังจะกดปุ่มนั้นซ้ำอีกรอบ
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setTimeout(() => b.blur(), 0);
  });
  $('#bigAction').addEventListener('click', (e) => act(e.currentTarget.dataset.act));
  // ปลดล็อกและหมุนในคำสั่งเดียว (ส่งสองคำสั่งติดกัน คำสั่งแรกอาจหายได้)
  $('#spinNow').addEventListener('click', () => act('spin', { unlock: true }));
  $('#lockBtn').addEventListener('click', () => act('lock'));
  $('#closeResult').addEventListener('click', () => act('close'));

  function openTv() {
    if (LW.tvAlive() && !confirm('จอวงล้อเปิดอยู่แล้ว ต้องการเปิดใหม่ไหม?\n(หน้าต่างเดิมจะโหลดใหม่ และต้องคลิกที่ทีวีอีกครั้งเพื่อเต็มจอ)')) return;
    LW.openTv().then((placed) => {
      if (placed) toast('เปิดจอวงล้อบนทีวีแล้ว — คลิกที่ทีวีหนึ่งครั้งเพื่อเต็มจอ');
      else toast('ลากหน้าต่างวงล้อไปไว้ที่ทีวี แล้วคลิกหนึ่งครั้ง');
    });
  }
  $('#openTv').addEventListener('click', openTv);

  // ---------- เช็กจอ: กันลูกค้าเห็นหน้าทีมงาน ----------
  function renderScreen() {
    const ext = LW.screenExtended();
    document.body.classList.toggle('not-extended', ext === false);
    const line = $('#screenLine');
    if (ext === true) line.innerHTML = '<span class="ok">✓ ต่อทีวีแบบขยาย (Extend) แล้ว</span> — ทีวีแสดงคนละภาพกับจอนี้ ลูกค้าไม่เห็นหน้าทีมงาน';
    else if (ext === false) line.innerHTML = '<span class="bad">✕ ยังไม่ได้ต่อทีวีแบบขยาย</span> — กด Windows + P แล้วเลือก "ขยาย (Extend)"';
    else line.textContent = 'เบราว์เซอร์นี้ตรวจจอไม่ได้ — ใช้ Chrome หรือ Edge จะเช็กได้อัตโนมัติ';
  }
  if (screen.addEventListener) screen.addEventListener('change', renderScreen);
  setInterval(renderScreen, 2000);
  $('#identify').addEventListener('click', () => {
    if (!LW.tvAlive()) { toast('ยังไม่ได้เปิดจอทีวี'); return; }
    LW.send('identify');
    toast('ดูที่ทีวี — ต้องขึ้นว่า "นี่คือจอลูกค้า"');
  });

  document.addEventListener('keydown', (e) => {
    if (tab !== 'control' || document.body.classList.contains('locked')) return;
    if (e.target.matches('input, select, textarea')) return;
    if (e.key === 'u' || e.key === 'U') { e.preventDefault(); act('unlock'); }
    if (e.key === ' ') {
      e.preventDefault();
      const live = LW.getLive();
      act(live.phase === 'result' ? 'close' : live.phase === 'attract' ? 'unlock' : 'spin');
    }
  });

  // ---------- รางวัล ----------
  const TIER_OPTIONS = Object.entries(LW.TIERS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');

  function renderPrizes() {
    const given = LW.countGiven(LW.getLog());
    $('#prizeRows').innerHTML = draft.prizes.map((p, i) => `
      <tr data-id="${esc(p.id)}">
        <td><div class="move"><button data-move="-1" title="เลื่อนขึ้น">▲</button><button data-move="1" title="เลื่อนลง">▼</button></div></td>
        <td><input type="text" data-f="name" value="${esc(p.name)}" maxlength="40"></td>
        <td><select data-f="tier" class="tier-select t-${p.tier}">${TIER_OPTIONS}</select></td>
        <td><input type="number" data-f="weight" min="0" step="1" value="${p.weight}"></td>
        <td class="chance"></td>
        <td><input type="number" data-f="stock" min="0" step="1" value="${p.stock == null ? '' : p.stock}" placeholder="∞"></td>
        <td class="given">${fmt(given[p.id] || 0)} / <span class="left"></span></td>
        <td><input type="number" data-f="minSpin" min="0" step="1" value="${p.minSpin}"></td>
        <td><div class="color-cell"><input type="color" data-f="color" value="${esc(LW.sliceColor(p, i))}"><button class="auto" data-auto title="ใช้สีอัตโนมัติตาม CI">${p.color ? 'อัตโนมัติ' : ''}</button></div></td>
        <td><button class="btn btn-icon btn-danger" data-del title="ลบรางวัลนี้">✕</button></td>
      </tr>`).join('');
    $$('#prizeRows tr').forEach((tr, i) => { tr.querySelector('[data-f="tier"]').value = draft.prizes[i].tier; });
    updateChances();
  }

  function updateChances() {
    const { rows } = LW.odds(draft, LW.getLog());
    rows.forEach((r) => {
      const tr = $(`#prizeRows tr[data-id="${CSS.escape(r.prize.id)}"]`);
      if (!tr) return;
      tr.classList.toggle('inactive', !r.active);
      tr.querySelector('.chance').innerHTML = r.active ? `${r.chance.toFixed(r.chance < 1 ? 2 : 1)}%` : `0%<span class="why">${esc(r.reason)}</span>`;
      tr.querySelector('.left').textContent = r.left == null ? '∞' : fmt(r.left);
    });
  }

  function prizeOf(el) {
    const tr = el.closest('tr[data-id]');
    return tr ? draft.prizes.find((p) => p.id === tr.dataset.id) : null;
  }

  $('#prizeRows').addEventListener('input', (e) => {
    const p = prizeOf(e.target);
    const f = e.target.dataset.f;
    if (!p || !f) return;
    const v = e.target.value;
    if (f === 'name') p.name = v;
    else if (f === 'tier') { p.tier = v; e.target.className = `tier-select t-${v}`; }
    else if (f === 'weight') p.weight = Math.max(0, Number(v) || 0);
    else if (f === 'stock') p.stock = v === '' ? null : Math.max(0, Math.floor(Number(v) || 0));
    else if (f === 'minSpin') p.minSpin = Math.max(0, Math.floor(Number(v) || 0));
    else if (f === 'color') { p.color = v; e.target.nextElementSibling.textContent = 'อัตโนมัติ'; }
    setDirty(true);
    updateChances();
  });

  $('#prizeRows').addEventListener('click', (e) => {
    const p = prizeOf(e.target);
    if (!p) return;
    const i = draft.prizes.indexOf(p);
    if (e.target.closest('[data-del]')) {
      if (draft.prizes.length <= 2) { toast('ต้องมีรางวัลอย่างน้อย 2 รายการ'); return; }
      if (!confirm(`ลบรางวัล "${p.name}" ?`)) return;
      draft.prizes.splice(i, 1);
    } else if (e.target.closest('[data-move]')) {
      const j = i + Number(e.target.closest('[data-move]').dataset.move);
      if (j < 0 || j >= draft.prizes.length) return;
      [draft.prizes[i], draft.prizes[j]] = [draft.prizes[j], draft.prizes[i]];
    } else if (e.target.closest('[data-auto]')) {
      p.color = '';
    } else return;
    setDirty(true);
    renderPrizes();
  });

  $('#addPrize').addEventListener('click', () => {
    if (draft.prizes.length >= 16) { toast('ใส่ได้สูงสุด 16 รางวัล (ช่องจะเล็กเกินไป)'); return; }
    draft.prizes.push({ id: 'p' + Date.now().toString(36), name: 'รางวัลใหม่', tier: 'common', weight: 10, stock: null, minSpin: 0, color: '' });
    setDirty(true);
    renderPrizes();
    const inputs = $$('#prizeRows input[data-f="name"]');
    inputs[inputs.length - 1].select();
  });

  $('#simulate').addEventListener('click', () => {
    const times = Number($('#simTimes').value);
    const { result, empty } = LW.simulate(LW.normalize(draft), LW.getLog(), times);
    const max = Math.max(1, ...Object.values(result));
    let html = draft.prizes.map((p) => {
      const c = result[p.id] || 0;
      return `<div class="sim-row"><span>${esc(p.name)}</span><div class="bar"><span style="width:${(c / max) * 100}%"></span></div><span class="v">${fmt(c)} ครั้ง (${((c / times) * 100).toFixed(1)}%)</span></div>`;
    }).join('');
    if (empty) html += `<p class="small" style="color:#FDA4AF">มี ${fmt(empty)} ครั้งที่หมุนไม่ได้เพราะของรางวัลหมด</p>`;
    $('#simResult').innerHTML = html;
  });

  // ---------- ตั้งค่า ----------
  function renderSettings() {
    const s = draft.settings;
    $$('[data-set]').forEach((el) => {
      const k = el.dataset.set;
      if (el.type === 'checkbox') el.checked = !!s[k];
      else el.value = s[k];
    });
    $$('[data-step]').forEach((el) => { el.value = s.steps[Number(el.dataset.step)] || ''; });
    renderQrPreview();
  }
  function renderQrPreview() {
    const box = $('#qrPreview');
    const src = draft.settings.qrImage;
    box.classList.toggle('empty', !src);
    box.innerHTML = src ? `<img src="${esc(src)}" alt="QR">` : 'ยังไม่มีรูป QR';
  }

  $('[data-page="settings"]').addEventListener('input', (e) => {
    const el = e.target;
    const s = draft.settings;
    if (el.dataset.set) {
      const k = el.dataset.set;
      s[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
    } else if (el.dataset.step) {
      s.steps[Number(el.dataset.step)] = el.value;
    } else return;
    setDirty(true);
  });

  $('#qrFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      // ย่อรูปให้เล็กลง จะได้เก็บในเครื่องได้
      const max = 600;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const x = c.getContext('2d');
      x.imageSmoothingEnabled = false;
      x.drawImage(img, 0, 0, c.width, c.height);
      draft.settings.qrImage = c.toDataURL('image/png');
      URL.revokeObjectURL(img.src);
      renderQrPreview();
      setDirty(true);
    };
    img.onerror = () => toast('เปิดรูปนี้ไม่ได้');
    img.src = URL.createObjectURL(file);
  });
  $('#qrRemove').addEventListener('click', () => {
    draft.settings.qrImage = '';
    renderQrPreview();
    setDirty(true);
  });

  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

  $('#exportConfig').addEventListener('click', () => {
    download(`wheel-settings-${stamp()}.json`, JSON.stringify(saved, null, 2), 'application/json');
  });
  $('#importConfig').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    file.text().then((t) => {
      const cfg = LW.normalize(JSON.parse(t));
      if (!confirm(`นำเข้าการตั้งค่า (${cfg.prizes.length} รางวัล) แทนค่าปัจจุบัน?`)) return;
      LW.setConfig(cfg);
      reloadSaved();
      toast('นำเข้าเรียบร้อย');
    }).catch(() => toast('ไฟล์นี้ไม่ใช่ไฟล์ตั้งค่าของวงล้อ'));
  });
  $('#resetConfig').addEventListener('click', () => {
    if (!confirm('คืนค่าตัวอย่างทั้งหมด? รางวัลและข้อความที่ตั้งไว้จะหายไป (ประวัติการหมุนยังอยู่)')) return;
    LW.resetConfig();
    reloadSaved();
    toast('คืนค่าตัวอย่างแล้ว');
  });

  // ---------- บันทึก ----------
  function validate(cfg) {
    if (cfg.prizes.length < 2) return 'ต้องมีรางวัลอย่างน้อย 2 รายการ';
    if (cfg.prizes.some((p) => !p.name.trim())) return 'มีรางวัลที่ยังไม่ได้ใส่ชื่อ';
    if (!cfg.prizes.some((p) => p.weight > 0)) return 'ต้องมีอย่างน้อย 1 รางวัลที่โอกาสมากกว่า 0';
    if (!String(cfg.settings.pin).trim()) return 'รหัส PIN ห้ามว่าง';
    return '';
  }
  $('#save').addEventListener('click', () => {
    draft.prizes.forEach((p) => { p.name = p.name.trim(); });
    const err = validate(draft);
    if (err) { toast(err); return; }
    LW.setConfig(draft);
    reloadSaved();
    toast('บันทึกแล้ว จอทีวีอัปเดตแล้ว');
  });
  $('#discard').addEventListener('click', () => {
    reloadSaved();
    toast('ยกเลิกการแก้ไขแล้ว');
  });
  function reloadSaved() {
    saved = LW.getConfig();
    draft = LW.clone(saved);
    setDirty(false);
    renderAll();
  }
  window.addEventListener('beforeunload', (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  // ---------- ประวัติ ----------
  function renderHistory() {
    const log = LW.getLog();
    $('#historyCount').textContent = `ทั้งหมด ${fmt(log.length)} ครั้ง`;
    $('#historyRows').innerHTML = log.length
      ? log.slice().reverse().map((e, i) => `<tr>
          <td>${fmt(e.no || log.length - i)}</td>
          <td>${new Date(e.t).toLocaleString('th-TH')}</td>
          <td>${esc(e.name)}</td>
          <td class="tier">${esc(LW.TIERS[e.tier] ? LW.TIERS[e.tier].label : e.tier)}</td>
        </tr>`).join('')
      : '<tr class="empty-row"><td colspan="4">ยังไม่มีการหมุน</td></tr>';
  }

  $('#exportCsv').addEventListener('click', () => {
    const log = LW.getLog();
    const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const lines = [['ครั้งที่', 'วันที่', 'เวลา', 'รางวัล', 'ประเภท'].map(q).join(',')];
    log.forEach((e, i) => {
      const d = new Date(e.t);
      lines.push([e.no || i + 1, d.toLocaleDateString('th-TH'), d.toLocaleTimeString('th-TH'), e.name, LW.TIERS[e.tier] ? LW.TIERS[e.tier].label : e.tier].map(q).join(','));
    });
    // ﻿ ทำให้ Excel อ่านภาษาไทยได้ถูกต้อง
    download(`wheel-history-${stamp()}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  });
  $('#clearLog').addEventListener('click', () => {
    const n = LW.getLog().length;
    if (!confirm(`ล้างประวัติทั้งหมด ${fmt(n)} ครั้ง?\nจำนวนของรางวัลที่แจกไปแล้วจะกลับเป็น 0\n(แนะนำให้กด "ดาวน์โหลด Excel" เก็บไว้ก่อน)`)) return;
    LW.clearLog();
    renderAll();
    toast('ล้างประวัติแล้ว');
  });

  // ---------- อัปเดตอัตโนมัติ ----------
  function renderAll() {
    if (tab === 'control') renderControl();
    if (tab === 'prizes') renderPrizes();
    if (tab === 'settings') renderSettings();
    if (tab === 'history') renderHistory();
    renderStatus();
  }

  LW.onChange((key) => {
    if (key === LW.K.config) {
      // อีกหน้าต่างหนึ่งบันทึกค่า — ถ้าที่นี่ไม่ได้แก้อะไรค้างไว้ ให้โหลดค่าใหม่
      saved = LW.getConfig();
      if (!dirty) { draft = LW.clone(saved); renderAll(); }
    } else if (key === LW.K.log) {
      if (tab === 'control') renderControl();
      if (tab === 'history') renderHistory();
      if (tab === 'prizes') updateChances();
    } else if (key === LW.K.live) {
      renderStatus();
      if (tab === 'control') renderControl();
    }
  });
  setInterval(renderStatus, 1000);

  checkAuth();
  renderAll();
  renderScreen();
})();
