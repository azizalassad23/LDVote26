// Setelah jam tutup: ambil hasil akhir dari Apps Script lalu simpan ke data/results.json,
// supaya semua pengunjung membaca hasil dari GitHub Pages, bukan dari Apps Script.
//   node scripts/publish-results.mjs
// lalu commit & push data/results.json.
import { readFileSync, writeFileSync } from 'node:fs';

const cfg = readFileSync(new URL('../assets/config.js', import.meta.url), 'utf8');
const apiUrl = (cfg.match(/API_URL:\s*'([^']+)'/) || [])[1];
if (!apiUrl) throw new Error('API_URL di assets/config.js masih kosong');

let data;
for (let i = 1; i <= 10 && !data; i++) {
  try {
    const json = await (await fetch(apiUrl + '?action=results&t=' + Date.now())).json();
    if (json.ok) data = json;
    else if (json.error === 'not_closed') throw new Error('Voting belum ditutup (tutup ' + json.closeTime + ')');
  } catch (e) {
    if (String(e.message).startsWith('Voting belum')) throw e;
    console.log(`percobaan ${i} gagal, mengulang…`);
    await new Promise((r) => setTimeout(r, 3000));
  }
}
if (!data) throw new Error('Gagal mengambil hasil dari Apps Script');

writeFileSync(new URL('../data/results.json', import.meta.url), JSON.stringify(data, null, 2) + '\n');
const top = data.results[0];
console.log(`data/results.json: ${data.total} suara, teratas ${top ? top.name + ' (' + top.votes + ')' : '-'}`);
