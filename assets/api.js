// Penghubung ke backend Apps Script (Google Sheet). Tanpa API_URL, memakai database demo di localStorage.
(function () {
  'use strict';
  const cfg = window.APP_CONFIG || {};
  const API_URL = String(cfg.API_URL || '').trim();
  const demo = !/^https:\/\/script\.google(usercontent)?\.com\//.test(API_URL);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function request(params, body, tries) {
    let lastErr;
    for (let i = 0; i < tries; i++) {
      try {
        const res = body
          ? await fetch(API_URL, {
              method: 'POST',
              // text/plain agar tidak memicu preflight CORS yang tidak didukung Apps Script.
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify(body),
            })
          : await fetch(API_URL + '?' + new URLSearchParams(Object.assign({ t: Date.now() }, params)), { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
      } catch (err) {
        lastErr = err;
        if (i < tries - 1) await sleep(700 * Math.pow(2, i));
      }
    }
    const err = new Error('network');
    err.cause = lastErr;
    throw err;
  }

  const remote = {
    config: () => request({ action: 'config' }, null, 3),
    results: () => request({ action: 'results' }, null, 3),
    async vote(payload) {
      // voteId membuat retry aman: server tidak menghitung suara yang sama dua kali.
      for (let i = 0; i < 3; i++) {
        const res = await request(null, Object.assign({ action: 'vote' }, payload), 4);
        if (res.error !== 'busy') return res;
        await sleep(1200 * (i + 1));
      }
      return { ok: false, error: 'busy' };
    },
    admin: (action, data) => request(null, Object.assign({ action }, data), 2),
  };

  // ------------------------------------------------------------ Mode demo
  const DB_KEY = 'ld2026.demo.db';
  const loadDb = () => {
    let db = null;
    try { db = JSON.parse(localStorage.getItem(DB_KEY)); } catch (e) { /* abaikan */ }
    return db || {
      houses: [
        { id: 'H1', name: 'Enggang', display: 'Rumah Panjang Dayak' },
        { id: 'H2', name: 'Siger', display: 'Kain Tapis Lampung' },
        { id: 'H3', name: 'Rencong', display: 'Tari Saman Aceh' },
        { id: 'H4', name: 'Gadang', display: 'Kuliner Minangkabau' },
        { id: 'H5', name: 'Tongkonan', display: 'Upacara Adat Toraja' },
        { id: 'H6', name: 'Cenderawasih', display: 'Musik Tifa Papua' },
      ],
      votes: [],
      settings: { closeTime: cfg.DEMO_CLOSE_TIME, teacherCode: '2026', nisUnique: false },
    };
  };
  const saveDb = (db) => { try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) { /* abaikan */ } };
  const isClosed = (db) => Date.now() >= new Date(db.settings.closeTime).getTime();
  const tally = (db) => {
    const counts = {};
    db.houses.forEach((h) => { counts[h.id] = 0; });
    let siswa = 0;
    let guru = 0;
    db.votes.forEach((v) => {
      if (!(v.houseId in counts)) return;
      counts[v.houseId]++;
      if (v.role === 'guru') guru++; else siswa++;
    });
    const results = db.houses
      .map((h, i) => ({ id: h.id, name: h.name, display: h.display, votes: counts[h.id], order: i }))
      .sort((a, b) => b.votes - a.votes || a.order - b.order)
      .map(({ order, ...h }) => h);
    return { total: siswa + guru, siswa, guru, results };
  };
  const adminData = (db) => Object.assign({
    ok: true, serverTime: new Date().toISOString(), closed: isClosed(db), settings: db.settings, nisCount: 0, houses: db.houses,
  }, tally(db));

  const local = {
    async config() {
      await sleep(250);
      const db = loadDb();
      return { ok: true, serverTime: new Date().toISOString(), closeTime: new Date(db.settings.closeTime).toISOString(), closed: isClosed(db), houses: db.houses };
    },
    async results() {
      await sleep(350);
      const db = loadDb();
      if (!isClosed(db)) return { ok: false, error: 'not_closed' };
      return Object.assign({ ok: true, closeTime: db.settings.closeTime, generatedAt: new Date().toISOString() }, tally(db));
    },
    async vote(p) {
      await sleep(500);
      const db = loadDb();
      if (isClosed(db)) return { ok: false, error: 'closed' };
      if (p.role === 'siswa' && !/^\d{4}$/.test(p.code)) return { ok: false, error: 'nis_format' };
      if (p.role === 'guru' && p.code !== db.settings.teacherCode) return { ok: false, error: 'teacher_invalid' };
      if (p.role === 'siswa' && db.settings.nisUnique && db.votes.some((v) => v.role === 'siswa' && v.code === p.code)) {
        return { ok: false, error: 'nis_used' };
      }
      const house = db.houses.find((h) => h.id === p.houseId);
      if (!house) return { ok: false, error: 'house_invalid' };
      const at = new Date().toISOString();
      db.votes.push({ at, role: p.role, code: p.role === 'siswa' ? p.code : 'GURU', houseId: house.id });
      saveDb(db);
      return { ok: true, house, at };
    },
    async admin(action, data) {
      await sleep(300);
      const db = loadDb();
      if (data.password !== cfg.DEMO_ADMIN_PASSWORD) return { ok: false, error: 'unauthorized' };
      if (action === 'admin_login') return { ok: true };
      if (action === 'admin_save_houses') {
        db.houses = data.houses
          .map((h) => ({ id: h.id || 'H' + Math.random().toString(36).slice(2, 10), name: String(h.name).trim(), display: String(h.display).trim() }))
          .filter((h) => h.name);
        saveDb(db);
      }
      if (action === 'admin_save_settings') {
        if (isNaN(new Date(data.closeTime).getTime())) return { ok: false, error: 'bad_close_time' };
        if (!String(data.teacherCode).trim()) return { ok: false, error: 'bad_teacher_code' };
        db.settings = { closeTime: data.closeTime, teacherCode: String(data.teacherCode).trim(), nisUnique: !!data.nisUnique };
        saveDb(db);
      }
      return adminData(db);
    },
  };

  window.Api = Object.assign({ demo }, demo ? local : remote);
})();
