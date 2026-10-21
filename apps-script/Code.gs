/**
 * Literacy Day 2026 — Voting House
 * Backend Google Apps Script. Database = Google Sheet tempat script ini dipasang.
 *
 * Sheet yang dibuat otomatis:
 *   Houses   : ID | Nama House | Tipe Display
 *   Votes    : Waktu | Peran | Kode | House ID | Nama House | Tipe Display | Device ID | Vote ID
 *   Settings : Kunci | Nilai | Keterangan
 *   NIS      : (opsional) daftar NIS siswa. Jika diisi, hanya 4 digit terakhir yang terdaftar boleh memilih.
 */

// ====== WAJIB DIGANTI sebelum deploy ======
const ADMIN_PASSWORD = 'ganti-password-admin';
// ==========================================

const DEFAULT_SETTINGS = [
  ['CLOSE_TIME', '2026-10-22T14:00:00+07:00', 'Waktu voting ditutup (format ISO, WIB = +07:00)'],
  ['TEACHER_CODE', '2026', 'Kode verifikasi untuk guru'],
  ['NIS_UNIQUE', 'FALSE', 'TRUE = satu 4 digit NIS hanya bisa dipakai memilih sekali'],
];

const HEADERS = {
  Houses: ['ID', 'Nama House', 'Tipe Display'],
  Votes: ['Waktu', 'Peran', 'Kode', 'House ID', 'Nama House', 'Tipe Display', 'Device ID', 'Vote ID'],
  Settings: ['Kunci', 'Nilai', 'Keterangan'],
  NIS: ['NIS (lengkap atau 4 digit terakhir). Kosongkan sheet ini jika tidak ingin membatasi.'],
};

/** Jalankan sekali dari editor Apps Script untuk membuat semua sheet + memberi izin akses. */
function setup() {
  Object.keys(HEADERS).forEach(getSheet_);
}

// ---------------------------------------------------------------- HTTP

function doGet(e) {
  return respond_(() => {
    const action = (e && e.parameter && e.parameter.action) || 'config';
    if (action === 'config') return publicConfig_();
    if (action === 'results') return publicResults_();
    return fail_('unknown_action');
  });
}

function doPost(e) {
  return respond_(() => {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action === 'vote') return vote_(body);
    if (String(body.action || '').indexOf('admin_') === 0) return admin_(body);
    return fail_('unknown_action');
  });
}

function respond_(fn) {
  let out;
  try {
    out = fn();
  } catch (err) {
    out = { ok: false, error: 'server_error', detail: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function fail_(error, extra) {
  return Object.assign({ ok: false, error: error }, extra || {});
}

// ---------------------------------------------------------------- Public

function publicConfig_() {
  const base = cached_('config', 15, () => {
    const s = getSettings_();
    return { closeTime: closeDate_(s).toISOString(), houses: getHouses_() };
  });
  const now = new Date();
  return {
    ok: true,
    serverTime: now.toISOString(),
    closeTime: base.closeTime,
    closed: now.getTime() >= new Date(base.closeTime).getTime(),
    houses: base.houses,
  };
}

function publicResults_() {
  const s = getSettings_();
  const now = new Date();
  if (now < closeDate_(s)) return fail_('not_closed', { closeTime: closeDate_(s).toISOString() });
  const tally = cached_('results', 20, tally_);
  return Object.assign({ ok: true, closeTime: closeDate_(s).toISOString(), generatedAt: now.toISOString() }, tally);
}

function vote_(b) {
  const s = getSettings_();
  const now = new Date();
  if (now >= closeDate_(s)) return fail_('closed');

  const role = b.role === 'siswa' || b.role === 'guru' ? b.role : null;
  if (!role) return fail_('bad_request');
  const code = String(b.code || '').trim();
  const voteId = String(b.voteId || '').slice(0, 64);
  const deviceId = String(b.deviceId || '').slice(0, 64);
  const cache = CacheService.getScriptCache();

  // Permintaan ulang (retry) dengan voteId yang sama tidak menambah suara.
  if (voteId) {
    const prev = cache.get('vote_' + voteId);
    if (prev) return JSON.parse(prev);
  }

  if (role === 'siswa') {
    if (!/^\d{4}$/.test(code)) return fail_('nis_format');
    const whitelist = getNisWhitelist_();
    if (whitelist && !whitelist[code]) return fail_('nis_invalid');
  } else if (code !== String(s.TEACHER_CODE).trim()) {
    return fail_('teacher_invalid');
  }

  const house = getHouses_().filter((h) => h.id === String(b.houseId))[0];
  if (!house) return fail_('house_invalid');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return fail_('busy');
  let result;
  try {
    if (voteId) {
      const prev = cache.get('vote_' + voteId);
      if (prev) return JSON.parse(prev);
    }
    const sheet = getSheet_('Votes');
    if (role === 'siswa' && isTrue_(s.NIS_UNIQUE)) {
      const last = sheet.getLastRow();
      const rows = last > 1 ? sheet.getRange(2, 2, last - 1, 2).getValues() : [];
      const used = rows.some((r) => r[0] === 'Siswa' && pad4_(r[1]) === code);
      if (used) return fail_('nis_used');
    }
    sheet.appendRow([now, role === 'siswa' ? 'Siswa' : 'Guru', role === 'siswa' ? code : 'GURU',
      house.id, house.name, house.display, deviceId, voteId]);
    SpreadsheetApp.flush();
    result = { ok: true, house: house, at: now.toISOString() };
    if (voteId) cache.put('vote_' + voteId, JSON.stringify(result), 21600);
  } finally {
    lock.releaseLock();
  }
  return result;
}

// ---------------------------------------------------------------- Admin

function admin_(b) {
  if (String(b.password || '') !== ADMIN_PASSWORD) return fail_('unauthorized');
  switch (b.action) {
    case 'admin_login':
      return { ok: true };
    case 'admin_data':
      return adminData_();
    case 'admin_save_houses':
      saveHouses_(b.houses);
      clearCache_();
      return adminData_();
    case 'admin_save_settings': {
      const close = new Date(String(b.closeTime || ''));
      if (isNaN(close.getTime())) return fail_('bad_close_time');
      const teacher = String(b.teacherCode || '').trim();
      if (!teacher) return fail_('bad_teacher_code');
      setSetting_('CLOSE_TIME', String(b.closeTime));
      setSetting_('TEACHER_CODE', teacher);
      setSetting_('NIS_UNIQUE', b.nisUnique ? 'TRUE' : 'FALSE');
      clearCache_();
      return adminData_();
    }
    default:
      return fail_('unknown_action');
  }
}

function adminData_() {
  const s = getSettings_();
  const wl = getNisWhitelist_();
  const now = new Date();
  return Object.assign({
    ok: true,
    serverTime: now.toISOString(),
    closed: now >= closeDate_(s),
    settings: { closeTime: closeDate_(s).toISOString(), teacherCode: String(s.TEACHER_CODE), nisUnique: isTrue_(s.NIS_UNIQUE) },
    nisCount: wl ? Object.keys(wl).length : 0,
    houses: getHouses_(),
  }, tally_());
}

function saveHouses_(list) {
  if (!Array.isArray(list)) throw new Error('Daftar house tidak valid');
  const clean = list
    .map((h) => ({
      id: String(h.id || '').trim() || 'H' + Utilities.getUuid().slice(0, 8),
      name: String(h.name || '').trim().slice(0, 80),
      display: String(h.display || '').trim().slice(0, 120),
    }))
    .filter((h) => h.name);
  const sheet = getSheet_('Houses');
  const last = sheet.getLastRow();
  if (last > 1) sheet.getRange(2, 1, last - 1, 3).clearContent();
  if (clean.length) sheet.getRange(2, 1, clean.length, 3).setValues(clean.map((h) => [h.id, h.name, h.display]));
}

// ---------------------------------------------------------------- Data

function tally_() {
  const houses = getHouses_();
  const sheet = getSheet_('Votes');
  const last = sheet.getLastRow();
  const rows = last > 1 ? sheet.getRange(2, 2, last - 1, 3).getValues() : [];
  const valid = {};
  houses.forEach((h) => { valid[h.id] = 0; });
  let siswa = 0;
  let guru = 0;
  rows.forEach((r) => {
    const id = String(r[2]);
    if (!(id in valid)) return;
    valid[id]++;
    if (r[0] === 'Guru') guru++; else siswa++;
  });
  const results = houses
    .map((h, i) => ({ id: h.id, name: h.name, display: h.display, votes: valid[h.id], order: i }))
    .sort((a, b) => b.votes - a.votes || a.order - b.order)
    .map((h) => ({ id: h.id, name: h.name, display: h.display, votes: h.votes }));
  return { total: siswa + guru, siswa: siswa, guru: guru, results: results };
}

function getHouses_() {
  const sheet = getSheet_('Houses');
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const range = sheet.getRange(2, 1, last - 1, 3);
  const values = range.getValues();
  let patched = false;
  values.forEach((r) => {
    if (String(r[1]).trim() && !String(r[0]).trim()) {
      r[0] = 'H' + Utilities.getUuid().slice(0, 8);
      patched = true;
    }
  });
  if (patched) range.setValues(values); // baris yang ditambah manual di sheet diberi ID otomatis
  return values
    .filter((r) => String(r[1]).trim())
    .map((r) => ({ id: String(r[0]).trim(), name: String(r[1]).trim(), display: String(r[2]).trim() }));
}

function getSettings_() {
  const out = {};
  DEFAULT_SETTINGS.forEach((r) => { out[r[0]] = r[1]; });
  const sheet = getSheet_('Settings');
  const last = sheet.getLastRow();
  if (last > 1) {
    sheet.getRange(2, 1, last - 1, 2).getValues().forEach((r) => {
      const key = String(r[0]).trim();
      if (!key) return;
      out[key] = r[1] instanceof Date ? r[1].toISOString() : String(r[1]).trim();
    });
  }
  return out;
}

function setSetting_(key, value) {
  const sheet = getSheet_('Settings');
  const last = sheet.getLastRow();
  const keys = last > 1 ? sheet.getRange(2, 1, last - 1, 1).getValues().map((r) => String(r[0]).trim()) : [];
  const idx = keys.indexOf(key);
  if (idx >= 0) sheet.getRange(idx + 2, 2).setValue(value);
  else sheet.appendRow([key, value, '']);
}

/** null = tidak ada pembatasan; selain itu objek berisi 4 digit terakhir NIS yang valid. */
function getNisWhitelist_() {
  return cached_('nis', 60, () => {
    const sheet = getSheet_('NIS');
    const last = sheet.getLastRow();
    if (last < 2) return null;
    const set = {};
    sheet.getRange(2, 1, last - 1, 1).getValues().forEach((r) => {
      const digits = String(r[0]).replace(/\D/g, '');
      if (digits) set[pad4_(digits.slice(-4))] = true;
    });
    return Object.keys(set).length ? set : null;
  });
}

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  sheet = ss.insertSheet(name);
  sheet.getRange(1, 1, 1, HEADERS[name].length).setValues([HEADERS[name]]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  // Format teks agar angka seperti "0123" tidak berubah menjadi 123.
  if (name === 'Houses') sheet.getRange('A:C').setNumberFormat('@');
  if (name === 'Votes') sheet.getRange('C:D').setNumberFormat('@');
  if (name === 'NIS') sheet.getRange('A:A').setNumberFormat('@');
  if (name === 'Settings') {
    sheet.getRange('B:B').setNumberFormat('@');
    sheet.getRange(2, 1, DEFAULT_SETTINGS.length, 3).setValues(DEFAULT_SETTINGS);
  }
  return sheet;
}

// ---------------------------------------------------------------- Utils

function closeDate_(s) {
  const d = new Date(s.CLOSE_TIME);
  return isNaN(d.getTime()) ? new Date(DEFAULT_SETTINGS[0][1]) : d;
}

function isTrue_(v) {
  return String(v).trim().toUpperCase() === 'TRUE';
}

function pad4_(v) {
  return ('0000' + String(v).trim()).slice(-4);
}

function cached_(key, seconds, fn) {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const value = fn();
  cache.put(key, JSON.stringify(value), seconds);
  return value;
}

function clearCache_() {
  CacheService.getScriptCache().removeAll(['config', 'results', 'nis']);
}
