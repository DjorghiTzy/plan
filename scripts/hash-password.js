#!/usr/bin/env node
/**
 * Buat hash kata sandi untuk variabel lingkungan LOGIN_PASSWORD_HASH.
 * Kata sandi dibaca dari masukan tersembunyi (tidak tersimpan di riwayat terminal).
 *
 *   npm run hash-password
 */
'use strict';

const readline = require('node:readline');
const { hashPassword } = require('../api/_lib/auth');

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = rl._writeToOutput.bind(rl);
    rl._writeToOutput = (s) => write(s.includes(question) ? s : '*'.repeat(s.length === 1 ? 1 : 0));
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

(async () => {
  const pw = process.stdin.isTTY
    ? await ask('Kata sandi: ')
    : require('node:fs').readFileSync(0, 'utf8').replace(/\r?\n$/, '');
  if (pw.length < 8) {
    console.error('Kata sandi minimal 8 karakter.');
    process.exit(1);
  }
  console.log('\nSalin baris ini ke Vercel → Settings → Environment Variables:\n');
  console.log(`LOGIN_PASSWORD_HASH=${await hashPassword(pw)}`);
})();
