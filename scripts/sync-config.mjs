// Salin daftar house + jam tutup dari Apps Script ke data/config.json (disajikan GitHub Pages).
// Jalankan setiap kali daftar house atau jam tutup diubah di panel admin:
//   node scripts/sync-config.mjs
// lalu commit & push data/config.json.
import { readFileSync, writeFileSync } from 'node:fs';

const cfg = readFileSync(new URL('../assets/config.js', import.meta.url), 'utf8');
const apiUrl = (cfg.match(/API_URL:\s*'([^']+)'/) || [])[1];
if (!apiUrl) throw new Error('API_URL di assets/config.js masih kosong');

// Apps Script kadang menjawab halaman error saat sibuk; coba ulang beberapa kali.
let data;
for (let i = 1; i <= 8 && !data; i++) {
  try {
    const json = await (await fetch(apiUrl + '?action=config&t=' + Date.now())).json();
    if (json.ok) data = json;
  } catch (e) {
    console.log(`percobaan ${i} gagal, mengulang…`);
    await new Promise((r) => setTimeout(r, 3000));
  }
}
if (!data) throw new Error('Gagal mengambil config dari Apps Script');

const out = { closeTime: data.closeTime, houses: data.houses, syncedAt: new Date().toISOString() };
writeFileSync(new URL('../data/config.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(`data/config.json: ${out.houses.length} house, tutup ${out.closeTime}`);
