require('dotenv').config();
const { Pool, types } = require('pg');

// Agar pg tidak mengkonversi timestamp ke timezone lokal
// Type OID 1114 = timestamp without time zone
types.setTypeParser(1114, (val) => val);

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }, // required for Supabase
});

module.exports = pool;
