require('dotenv').config();
const pool = require('./db');
const { createClient } = require('@supabase/supabase-js');

async function testPostgres() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() AS time');
    console.log('✅ PostgreSQL connected:', result.rows[0].time);
    client.release();
  } catch (err) {
    console.error('❌ PostgreSQL connection failed:', err.message);
  }
}

async function testSupabaseClient() {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    // Use REST API health check via storage ping
    const { error } = await supabase.auth.getSession();
    if (error) throw error;
    console.log('✅ Supabase client connected');
  } catch (err) {
    console.error('❌ Supabase client failed:', err.message);
  }
}

(async () => {
  console.log('Testing connections...\n');
  await testPostgres();
  await testSupabaseClient();
  process.exit(0);
})();
