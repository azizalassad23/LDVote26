// Panel admin: kelola daftar house, jam tutup, kode guru, dan pantau suara.
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const PASS_KEY = 'ld2026.admin';
  const ERRORS = {
    unauthorized: 'Password salah.',
    bad_close_time: 'Waktu tutup tidak valid.',
    bad_teacher_code: 'Kode guru tidak boleh kosong.',
    network: 'Gagal terhubung ke server.',
  };
  const errorText = (code) => ERRORS[code] || 'Terjadi kesalahan (' + code + ').';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtNum = (n) => new Intl.NumberFormat('id-ID').format(n);
  const fmtDateTime = (ms) => new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).format(ms) + ' WIB';
  const WIB = 7 * 3600 * 1000;
  const toWibInput = (iso) => new Date(new Date(iso).getTime() + WIB).toISOString().slice(0, 16);
  const fromWibInput = (v) => v + ':00+07:00';

  let password = '';
  let data = null;
  let offset = 0;
  let dirty = false;

  function session(value) {
    try {
      if (value === undefined) return sessionStorage.getItem(PASS_KEY) || '';
      if (value) sessionStorage.setItem(PASS_KEY, value); else sessionStorage.removeItem(PASS_KEY);
    } catch (e) { /* abaikan */ }
    return '';
  }

  let toastTimer;
  function toast(msg, isError) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.toggle('is-error', !!isError);
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-on'), 3200);
  }

  async function call(action, extra, btn) {
    if (btn) btn.classList.add('is-loading');
    try {
      const res = await Api.admin(action, Object.assign({ password }, extra || {}));
      if (!res.ok && res.error === 'unauthorized' && action !== 'admin_login') logout();
      return res;
    } catch (e) {
      return { ok: false, error: 'network' };
    } finally {
      if (btn) btn.classList.remove('is-loading');
    }
  }

  // ------------------------------------------------------------ Login
  async function login(pass, silent) {
    password = pass;
    const res = await call('admin_login', null, $('#loginBtn'));
    if (!res.ok) {
      password = '';
      session(null);
      if (!silent) {
        $('#loginError').textContent = errorText(res.error);
        $('#loginError').hidden = false;
      }
      return;
    }
    session(pass);
    $('#viewLogin').hidden = true;
    $('#viewAdmin').hidden = false;
    await load();
  }

  function logout() {
    password = '';
    session(null);
    $('#viewAdmin').hidden = true;
    $('#viewLogin').hidden = false;
    $('#password').value = '';
  }

  // ------------------------------------------------------------ Data
  async function load(btn) {
    const res = await call('admin_data', null, btn);
    if (!res.ok) return toast(errorText(res.error), true);
    apply(res, true);
  }

  function apply(res, resetForms) {
    data = res;
    offset = new Date(res.serverTime).getTime() - Date.now();
    if (resetForms || !dirty) {
      renderEditor(res.houses); // urutan asli = urutan tampil di halaman voting
      dirty = false;
    }
    if (resetForms) {
      $('#closeInput').value = toWibInput(res.settings.closeTime);
      $('#teacherInput').value = res.settings.teacherCode;
      $('#nisUniqueInput').checked = !!res.settings.nisUnique;
    }
    renderStatus();
    renderLive();
  }

  function renderStatus() {
    if (!data) return;
    const close = new Date(data.settings.closeTime).getTime();
    const left = close - (Date.now() + offset);
    const open = left > 0;
    $('#kvStatus').innerHTML = open ? '<span class="pill pill--open">● Dibuka</span>' : '<span class="pill pill--closed">● Ditutup</span>';
    $('#kvClose').textContent = fmtDateTime(close);
    if (open) {
      const t = Math.floor(left / 1000);
      $('#kvLeft').textContent = [Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60].map((n) => String(n).padStart(2, '0')).join(':');
    } else {
      $('#kvLeft').textContent = 'Hasil sudah tampil publik';
    }
    $('#kvTotal').textContent = fmtNum(data.total);
    $('#kvRoles').textContent = fmtNum(data.siswa) + ' / ' + fmtNum(data.guru);
    $('#kvNis').textContent = data.nisCount ? fmtNum(data.nisCount) + ' NIS terdaftar' : 'Tidak dibatasi';
    $('#statusSub').textContent = open
      ? 'Voting sedang berlangsung. Hasil akan tampil di halaman publik setelah jam tutup.'
      : 'Voting sudah ditutup. Pemenang dan rekap suara tampil di halaman publik.';
  }

  function renderLive() {
    const list = data.results;
    const top = list.length ? list[0].votes : 0;
    $('#liveList').innerHTML = list.length
      ? list.map((h) => {
          const rank = list.findIndex((x) => x.votes === h.votes) + 1;
          const pct = data.total ? Math.round((h.votes / data.total) * 1000) / 10 : 0;
          return `<li class="rank${top > 0 && h.votes === top ? ' is-top' : ''}">
            <span class="rank__pos">${rank}</span>
            <div class="rank__info"><p class="rank__name">${esc(h.name)}</p><p class="rank__display">${esc(h.display || '—')}</p></div>
            <div class="rank__votes"><b>${fmtNum(h.votes)}</b><span>${pct}%</span></div>
            <div class="bar"><i style="width:${pct}%"></i></div>
          </li>`;
        }).join('')
      : '<li class="empty">Belum ada house.</li>';
  }

  // ------------------------------------------------------------ Editor house
  function rowHtml(h) {
    return `<li class="edit-row" data-id="${esc(h.id || '')}">
      <input class="input" data-k="name" value="${esc(h.name)}" placeholder="Nama house" aria-label="Nama house" maxlength="80">
      <input class="input" data-k="display" value="${esc(h.display)}" placeholder="Tipe display" aria-label="Tipe display" maxlength="120">
      <button class="icon-btn" type="button" data-remove aria-label="Hapus house">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>
      </button>
    </li>`;
  }

  function renderEditor(houses) {
    $('#editList').innerHTML = houses.map(rowHtml).join('');
  }

  function readEditor() {
    return Array.from(document.querySelectorAll('#editList .edit-row')).map((row) => ({
      id: row.dataset.id || '',
      name: row.querySelector('[data-k="name"]').value.trim(),
      display: row.querySelector('[data-k="display"]').value.trim(),
    }));
  }

  // "Nama House - Tipe Display" → pemisah pertama berupa tanda hubung/en dash/em dash.
  function parseLines(text) {
    return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const m = line.match(/^(.*?)\s*[-–—]\s+(.*)$/) || line.match(/^(.*?)\s+[-–—]\s*(.*)$/);
      return m ? { name: m[1].trim(), display: m[2].trim() } : { name: line, display: '' };
    });
  }

  function addFromBulk(replace) {
    const rows = parseLines($('#bulkInput').value);
    if (!rows.length) return toast('Isi dulu daftarnya, satu house per baris.', true);
    if (replace) {
      if (!confirm('Ganti seluruh daftar house di editor dengan ' + rows.length + ' baris ini? (Belum tersimpan sampai tekan Simpan)')) return;
      renderEditor(rows);
    } else {
      $('#editList').insertAdjacentHTML('beforeend', rows.map(rowHtml).join(''));
    }
    $('#bulkInput').value = '';
    dirty = true;
    toast(rows.length + ' house ditambahkan ke editor. Jangan lupa Simpan.');
  }

  async function saveHouses() {
    const houses = readEditor();
    if (houses.some((h) => !h.name)) return toast('Ada baris dengan nama house kosong.', true);
    const names = houses.map((h) => h.name.toLowerCase());
    if (names.some((n, i) => names.indexOf(n) !== i)) return toast('Ada nama house yang sama.', true);
    const removed = (data ? data.results : []).filter((r) => r.votes > 0 && !houses.some((h) => h.id === r.id));
    if (removed.length && !confirm('House berikut sudah punya suara dan akan dihapus dari hitungan:\n' + removed.map((r) => '• ' + r.name + ' (' + r.votes + ' suara)').join('\n') + '\n\nLanjutkan?')) return;
    const res = await call('admin_save_houses', { houses }, $('#saveHouses'));
    if (!res.ok) return toast(errorText(res.error), true);
    dirty = false;
    apply(res, false); // editor diisi ulang dengan ID baru dari server
    toast('Daftar house tersimpan (' + houses.length + ' house).');
  }

  async function saveSettings() {
    const v = $('#closeInput').value;
    if (!v) return toast('Isi waktu tutup voting.', true);
    const res = await call('admin_save_settings', {
      closeTime: fromWibInput(v),
      teacherCode: $('#teacherInput').value.trim(),
      nisUnique: $('#nisUniqueInput').checked,
    }, $('#saveSettings'));
    if (!res.ok) return toast(errorText(res.error), true);
    apply(res, true);
    toast('Pengaturan tersimpan.');
  }

  // ------------------------------------------------------------ Mulai
  function bind() {
    $('#loginForm').addEventListener('submit', (e) => {
      e.preventDefault();
      $('#loginError').hidden = true;
      login($('#password').value);
    });
    $('#logoutBtn').addEventListener('click', logout);
    $('#refreshBtn').addEventListener('click', (e) => load(e.currentTarget));
    $('#addRow').addEventListener('click', () => {
      $('#editList').insertAdjacentHTML('beforeend', rowHtml({ name: '', display: '' }));
      $('#editList').lastElementChild.querySelector('input').focus();
      dirty = true;
    });
    $('#editList').addEventListener('input', () => { dirty = true; });
    $('#editList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove]');
      if (!btn) return;
      btn.closest('.edit-row').remove();
      dirty = true;
    });
    $('#bulkAdd').addEventListener('click', () => addFromBulk(false));
    $('#bulkReplace').addEventListener('click', () => addFromBulk(true));
    $('#saveHouses').addEventListener('click', saveHouses);
    $('#saveSettings').addEventListener('click', saveSettings);
    $('#resetDevice').addEventListener('click', () => {
      try { localStorage.removeItem('ld2026.vote'); } catch (e) { /* abaikan */ }
      document.cookie = 'ld2026_voted=; max-age=0; path=/';
      toast('Status voting perangkat ini sudah direset.');
    });
  }

  bind();
  if (Api.demo) $('#demoBanner').hidden = false;
  setInterval(renderStatus, 1000);
  setInterval(async () => {
    if (!password || document.hidden) return;
    const res = await call('admin_data');
    if (res.ok) apply(res, false);
  }, 30000);

  const saved = session();
  if (saved) login(saved, true);
})();
