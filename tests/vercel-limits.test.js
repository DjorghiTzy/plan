// Paket Hobby Vercel membatasi 12 fungsi per deployment (berkas api/*.js + middleware).
// Lebih dari itu, deployment gagal sebelum dibangun. Fitur baru masuk ke fungsi yang ada.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('jumlah fungsi Vercel tetap dalam batas paket Hobby (maks. 12)', () => {
  const api = fs.readdirSync(path.join(ROOT, 'api')).filter((f) => f.endsWith('.js') && !f.startsWith('_'));
  const middleware = fs.existsSync(path.join(ROOT, 'middleware.js')) ? 1 : 0;
  assert.ok(api.length + middleware <= 12, `${api.length} berkas api + ${middleware} middleware = ${api.length + middleware}: ${api.join(', ')}`);
});

test('setiap fungsi di vercel.json benar-benar ada', () => {
  const conf = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  for (const file of Object.keys(conf.functions || {})) assert.ok(fs.existsSync(path.join(ROOT, file)), file);
});

test('data desa (cuaca BMKG) ikut terbawa ke fungsi coach', () => {
  const conf = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  assert.equal(conf.functions['api/coach.js'].includeFiles, 'api/_lib/data/**');
  const size = fs.statSync(path.join(ROOT, 'api/_lib/data/desa.txt.gz')).size;
  assert.ok(size > 300000 && size < 2000000, `${size} byte`);
});
