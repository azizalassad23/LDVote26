// Halaman voting: verifikasi → pilih house → kirim; setelah jam tutup menampilkan pemenang dan rekap suara.
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const VOTE_KEY = 'ld2026.vote';
  const DEVICE_KEY = 'ld2026.device';
  const VOTE_COOKIE = 'ld2026_voted';
  const VIEWS = ['viewLoading', 'viewVote', 'viewVoted', 'viewResults', 'viewError'];

  const ERRORS = {
    closed: 'Voting sudah ditutup.',
    nis_format: 'NIS harus berupa 4 angka.',
    nis_invalid: '4 angka terakhir NIS tidak terdaftar. Periksa kembali NIS-mu.',
    nis_used: 'NIS ini sudah digunakan untuk memilih.',
    teacher_invalid: 'Kode guru salah.',
    house_invalid: 'House tidak ditemukan. Muat ulang halaman lalu coba lagi.',
    busy: 'Server sedang ramai. Tunggu sebentar lalu coba lagi.',
    network: 'Gagal terhubung ke server. Periksa koneksi internet lalu coba lagi.',
  };
  const errorText = (code) => ERRORS[code] || 'Terjadi kesalahan (' + code + '). Coba lagi.';

  const state = {
    offset: 0,        // selisih jam server − jam perangkat
    closeAt: 0,
    houses: [],
    role: 'siswa',
    code: '',
    houseId: null,
    resultsRequested: false,
  };

  // ------------------------------------------------------------ Penyimpanan perangkat
  function readStore(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  function writeStore(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* abaikan */ }
  }
  function votedRecord() {
    const rec = readStore(VOTE_KEY);
    if (rec) return rec;
    return document.cookie.split('; ').some((c) => c.indexOf(VOTE_COOKIE + '=') === 0) ? {} : null;
  }
  function markVoted(rec) {
    writeStore(VOTE_KEY, rec);
    document.cookie = VOTE_COOKIE + '=1; max-age=' + 60 * 60 * 24 * 90 + '; path=/; SameSite=Lax';
  }
  function randomId() {
    return window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
  function deviceId() {
    let id = readStore(DEVICE_KEY);
    if (!id) { id = randomId(); writeStore(DEVICE_KEY, id); }
    return id;
  }

  // ------------------------------------------------------------ Util
  const now = () => Date.now() + state.offset;
  const pad = (n) => String(n).padStart(2, '0');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtNum = (n) => new Intl.NumberFormat('id-ID').format(n);
  const fmtTime = (ms) => new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).format(ms) + ' WIB';
  const fmtDateTime = (ms) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta' }).format(ms) + ' WIB';
  function split(ms) {
    const t = Math.max(0, Math.floor(ms / 1000));
    return { h: Math.floor(t / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
  }

  function show(view) {
    VIEWS.forEach((id) => { $('#' + id).hidden = id !== view; });
  }
  function showError(msg, retry) {
    $('#errorText').textContent = msg;
    $('#retryBtn').onclick = retry || (() => location.reload());
    show('viewError');
  }

  function applyConfig(cfg) {
    state.offset = new Date(cfg.serverTime).getTime() - Date.now();
    state.closeAt = new Date(cfg.closeTime).getTime();
    state.houses = cfg.houses || [];
    $('#votedClose').textContent = fmtTime(state.closeAt);
  }

  // ------------------------------------------------------------ Status & hitung mundur
  function tick() {
    const left = state.closeAt - now();
    const stage = $('#stage');
    if (left <= 0) {
      stage.classList.add('is-closed');
      $('#stageLabel').textContent = 'Voting Ditutup';
      $('#stageTime').innerHTML = 'Hasil akhir · ditutup <strong>' + esc(fmtTime(state.closeAt)) + '</strong>';
      if (!state.resultsRequested) loadResults();
      return;
    }
    stage.classList.remove('is-closed');
    $('#stageLabel').textContent = 'Voting Dibuka';
    const t = split(left);
    $('#stageTime').innerHTML = 'Ditutup ' + esc(fmtTime(state.closeAt)) + ' · sisa <strong>' + pad(t.h) + ':' + pad(t.m) + ':' + pad(t.s) + '</strong>';
    const cd = $('#votedCountdown');
    ['h', 'm', 's'].forEach((u) => { cd.querySelector('[data-unit="' + u + '"]').textContent = pad(t[u]); });
  }

  // ------------------------------------------------------------ Langkah 1: identitas
  function setRole(role) {
    state.role = role;
    document.querySelectorAll('.segmented button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.role === role)));
    const input = $('#codeInput');
    input.value = '';
    input.classList.remove('is-invalid');
    $('#identityError').hidden = true;
    if (role === 'siswa') {
      $('#codeLabel').textContent = '4 Angka Terakhir NIS';
      $('#codeHint').innerHTML = 'Contoh: NIS 2526<b>0123</b> → ketik <b>0123</b>';
      input.type = 'text';
      input.maxLength = 4;
      input.placeholder = '0000';
    } else {
      $('#codeLabel').textContent = 'Kode Verifikasi Guru';
      $('#codeHint').textContent = 'Masukkan kode yang dibagikan panitia untuk guru.';
      input.type = 'password';
      input.maxLength = 12;
      input.placeholder = '••••';
    }
    input.focus({ preventScroll: true });
  }

  function identityError(msg) {
    const el = $('#identityError');
    el.textContent = msg;
    el.hidden = false;
    $('#codeInput').classList.add('is-invalid');
    $('#codeInput').focus();
  }

  function goStep(n, scroll) {
    $('#stepIdentity').hidden = n !== 1;
    $('#stepHouse').hidden = n !== 2;
    $('#stepDot1').className = n === 1 ? 'is-active' : 'is-done';
    $('#stepDot2').className = n === 2 ? 'is-active' : '';
    if (n === 2) {
      $('#whoText').innerHTML = state.role === 'siswa'
        ? 'Memilih sebagai <b>Siswa</b> · NIS <b>…' + esc(state.code) + '</b>'
        : 'Memilih sebagai <b>Guru</b>';
      renderHouses();
    }
    if (scroll !== false) $('.steps').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ------------------------------------------------------------ Langkah 2: pilih house
  function renderHouses() {
    const list = $('#houseList');
    if (!state.houses.length) {
      list.innerHTML = '<p class="empty">Daftar house belum tersedia. Coba muat ulang beberapa saat lagi.</p>';
      return;
    }
    list.innerHTML = state.houses.map((h, i) => `
      <label class="house">
        <input type="radio" name="house" value="${esc(h.id)}" ${h.id === state.houseId ? 'checked' : ''}>
        <span class="house__body">
          <span class="house__num">${pad(i + 1)}</span>
          <span class="house__check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg></span>
          <span class="house__name">${esc(h.name)}</span>
          <span class="house__display"><span class="tag">Tipe Display</span><strong>${esc(h.display || '—')}</strong></span>
        </span>
      </label>`).join('');
    updateChoice();
  }

  function selectedHouse() {
    return state.houses.find((h) => h.id === state.houseId) || null;
  }

  function updateChoice() {
    const h = selectedHouse();
    $('#choiceText').textContent = h ? h.name + (h.display ? ' — ' + h.display : '') : 'Belum memilih';
    $('#openConfirm').disabled = !h;
  }

  function openConfirm() {
    const h = selectedHouse();
    if (!h) return;
    $('#confirmName').textContent = h.name;
    $('#confirmDisplay').textContent = h.display || '—';
    $('#confirmError').hidden = true;
    $('#confirmDialog').showModal();
  }

  async function submitVote() {
    const btn = $('#submitVote');
    const h = selectedHouse();
    if (!h || btn.classList.contains('is-loading')) return;
    btn.classList.add('is-loading');
    btn.textContent = 'Mengirim…';
    $('#cancelVote').disabled = true;
    let res;
    try {
      res = await Api.vote({ role: state.role, code: state.code, houseId: h.id, deviceId: deviceId(), voteId: randomId() });
    } catch (e) {
      res = { ok: false, error: 'network' };
    }
    btn.classList.remove('is-loading');
    btn.textContent = 'Ya, Kirim';
    $('#cancelVote').disabled = false;

    if (res.ok) {
      markVoted({ house: res.house, at: res.at, role: state.role });
      $('#confirmDialog').close();
      showVoted(readStore(VOTE_KEY));
      return;
    }
    if (res.error === 'closed') {
      $('#confirmDialog').close();
      loadResults();
      return;
    }
    if (['nis_format', 'nis_invalid', 'nis_used', 'teacher_invalid'].indexOf(res.error) >= 0) {
      $('#confirmDialog').close();
      goStep(1);
      identityError(errorText(res.error));
      return;
    }
    const el = $('#confirmError');
    el.textContent = errorText(res.error);
    el.hidden = false;
  }

  function showVoted(rec) {
    const house = rec && rec.house;
    $('#votedName').textContent = house ? house.name : 'Suara tercatat';
    $('#votedDisplay').textContent = house && house.display ? 'Tipe display: ' + house.display : '';
    show('viewVoted');
  }

  function showVoteForm() {
    goStep(1, false);
    show('viewVote');
  }

  // ------------------------------------------------------------ Hasil
  async function loadResults() {
    state.resultsRequested = true;
    if ($('#viewResults').hidden) show('viewLoading');
    let res;
    try {
      res = await Api.results();
    } catch (e) {
      showError(errorText('network'), loadResults);
      return;
    }
    if (res.ok) {
      renderResults(res);
      return;
    }
    if (res.error === 'not_closed') {
      // Jam perangkat lebih cepat atau admin memperpanjang waktu: sinkronkan ulang.
      try {
        applyConfig(await Api.config());
      } catch (e) { /* coba lagi nanti */ }
      if (state.closeAt > now()) {
        state.resultsRequested = false;
        if (votedRecord()) showVoted(readStore(VOTE_KEY)); else showVoteForm();
      } else {
        setTimeout(loadResults, 3000);
      }
      return;
    }
    showError(errorText(res.error), loadResults);
  }

  function renderResults(r) {
    const list = r.results || [];
    const total = r.total || 0;
    const top = list.length ? list[0].votes : 0;
    const winners = top > 0 ? list.filter((h) => h.votes === top) : [];
    const pct = (v) => (total ? Math.round((v / total) * 1000) / 10 : 0);

    $('#winnerEyebrow').textContent = winners.length > 1 ? 'Hasil Seri — Pemenang Bersama' : 'Pemenang Voting House';
    $('#winnerList').innerHTML = winners.length
      ? winners.map((w) => `
        <div>
          <h2 class="winner__name">${esc(w.name)}</h2>
          <p class="winner__display">${esc(w.display || '')}</p>
          <span class="winner__votes"><b>${fmtNum(w.votes)}</b> suara · ${pct(w.votes)}%</span>
        </div>`).join('')
      : '<h2 class="winner__name">Belum ada suara</h2>';

    $('#statTotal').textContent = fmtNum(total);
    $('#statSiswa').textContent = fmtNum(r.siswa || 0);
    $('#statGuru').textContent = fmtNum(r.guru || 0);

    // Peringkat kompetisi: nilai sama = peringkat sama (1, 1, 3, …).
    $('#rankList').innerHTML = list.length
      ? list.map((h) => {
          const rank = list.findIndex((x) => x.votes === h.votes) + 1;
          return `
          <li class="rank${top > 0 && h.votes === top ? ' is-top' : ''}">
            <span class="rank__pos">${rank}</span>
            <div class="rank__info">
              <p class="rank__name">${esc(h.name)}</p>
              <p class="rank__display">${esc(h.display || '—')}</p>
            </div>
            <div class="rank__votes"><b>${fmtNum(h.votes)}</b><span>${pct(h.votes)}%</span></div>
            <div class="bar" aria-hidden="true"><i data-w="${pct(h.votes)}"></i></div>
          </li>`;
        }).join('')
      : '<li class="empty">Belum ada house terdaftar.</li>';

    $('#resultsNote').textContent = 'Voting ditutup ' + fmtDateTime(new Date(r.closeTime).getTime()) +
      '. Data diambil langsung dari database pada ' + fmtDateTime(new Date(r.generatedAt).getTime()) + '.';

    show('viewResults');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.querySelectorAll('.bar i').forEach((el) => { el.style.width = el.dataset.w + '%'; });
    }));
  }

  // ------------------------------------------------------------ Akses admin tersembunyi: ketuk lambang 5× cepat
  function setupSecretAdmin() {
    const emblem = $('#emblem');
    let taps = [];
    emblem.addEventListener('click', () => {
      const t = Date.now();
      taps = taps.filter((x) => t - x < 2500).concat(t);
      emblem.classList.remove('is-poked');
      void emblem.offsetWidth;
      emblem.classList.add('is-poked');
      if (taps.length >= 5) location.href = 'admin.html';
    });
  }

  // ------------------------------------------------------------ Mulai
  function bind() {
    document.querySelectorAll('.segmented button').forEach((b) => b.addEventListener('click', () => setRole(b.dataset.role)));
    $('#codeInput').addEventListener('input', (e) => {
      if (state.role === 'siswa') e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
      e.target.classList.remove('is-invalid');
      $('#identityError').hidden = true;
    });
    $('#stepIdentity').addEventListener('submit', (e) => {
      e.preventDefault();
      const code = $('#codeInput').value.trim();
      if (state.role === 'siswa' && !/^\d{4}$/.test(code)) return identityError(errorText('nis_format'));
      if (state.role === 'guru' && !code) return identityError('Kode guru wajib diisi.');
      state.code = code;
      goStep(2);
    });
    $('#changeIdentity').addEventListener('click', () => goStep(1));
    $('#houseList').addEventListener('change', (e) => {
      if (e.target.name !== 'house') return;
      state.houseId = e.target.value;
      updateChoice();
    });
    $('#openConfirm').addEventListener('click', openConfirm);
    $('#submitVote').addEventListener('click', submitVote);
    setupSecretAdmin();
  }

  async function refreshConfig() {
    if (state.resultsRequested) return;
    try {
      const cfg = await Api.config();
      if (!cfg.ok) return;
      applyConfig(cfg);
      // Perubahan daftar house dari admin langsung terlihat oleh yang sedang memilih.
      const onHouseStep = !$('#viewVote').hidden && !$('#stepHouse').hidden;
      if (onHouseStep && !$('#confirmDialog').open) {
        if (!state.houses.some((h) => h.id === state.houseId)) state.houseId = null;
        renderHouses();
      }
    } catch (e) { /* lanjut dengan data lama */ }
  }

  async function init() {
    if (Api.demo) $('#demoBanner').hidden = false;
    bind();
    let cfg;
    try {
      cfg = await Api.config();
    } catch (e) {
      showError(errorText('network'), () => location.reload());
      return;
    }
    if (!cfg.ok) {
      showError(errorText(cfg.error || 'server_error'), () => location.reload());
      return;
    }
    applyConfig(cfg);
    if (!cfg.closed) {
      if (votedRecord()) showVoted(readStore(VOTE_KEY)); else showVoteForm();
    }
    tick(); // jika sudah lewat jam tutup, tick() langsung memuat hasil
    setInterval(tick, 1000);
    setInterval(refreshConfig, 60000);
  }

  init();
})();
