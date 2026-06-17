/**
 * Jalankan sekali untuk hash semua password plain-text yang sudah ada di database.
 * Usage: node scripts/hash-existing-passwords.js
 *
 * Script ini aman dijalankan berkali-kali — password yang sudah di-hash (diawali $2b$)
 * akan dilewati secara otomatis.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const pool = require('../src/config/db');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

async function hashExistingPasswords() {
  console.log('Memulai migrasi hash password...');

  const { rows } = await pool.query('SELECT user_id, username, password FROM users');
  console.log(`Ditemukan ${rows.length} user.`);

  let updated = 0;
  let skipped = 0;

  for (const user of rows) {
    if (user.password && user.password.startsWith('$2b$')) {
      console.log(`  SKIP  ${user.username} (sudah di-hash)`);
      skipped++;
      continue;
    }

    const hashed = await bcrypt.hash(user.password, SALT_ROUNDS);
    await pool.query('UPDATE users SET password = $1 WHERE user_id = $2', [hashed, user.user_id]);
    console.log(`  HASH  ${user.username}`);
    updated++;
  }

  console.log(`\nSelesai: ${updated} di-hash, ${skipped} dilewati.`);
  await pool.end();
}

hashExistingPasswords().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
