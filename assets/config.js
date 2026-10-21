// Konfigurasi halaman voting.
// Tempel URL Web App Apps Script (berakhiran /exec) di API_URL.
// Selama API_URL kosong, halaman berjalan dalam MODE DEMO (data hanya tersimpan di browser).
window.APP_CONFIG = {
  API_URL: '',

  // Hanya dipakai di mode demo. Jam tutup yang berlaku diatur dari halaman admin.
  DEMO_CLOSE_TIME: '2026-10-22T14:00:00+07:00',
  DEMO_ADMIN_PASSWORD: 'admin',
};
