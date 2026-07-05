require('dotenv').config();
const app = require('./src/app');
const { spawn } = require('child_process');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PREDICT_PORT = process.env.PREDICT_PORT || 5001;

// Auto-start Flask prediction server
const pythonCmd = process.env.PYTHON_PATH || (process.platform === 'win32' ? 'python' : 'python3');
const flaskScript = path.join(__dirname, 'src', 'python', 'predict_server.py');

const flaskServer = spawn(pythonCmd, [flaskScript], {
  env: { ...process.env, PREDICT_PORT: String(PREDICT_PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

flaskServer.stdout.on('data', (d) => console.log('[Flask]', d.toString().trim()));
flaskServer.stderr.on('data', (d) => {
  const msg = d.toString().trim();
  // Flask menulis startup log ke stderr — filter pesan normal
  if (msg && !msg.includes('WARNING') && !msg.includes('Serving Flask') && !msg.includes(' * Running')) {
    console.error('[Flask]', msg);
  }
});
flaskServer.on('close', (code) => console.log(`[Flask] Server berhenti (code ${code})`));

// Matikan Flask saat Node.js berhenti
const killFlask = () => { try { flaskServer.kill(); } catch (_) {} };
process.on('exit', killFlask);
process.on('SIGINT', () => { killFlask(); process.exit(0); });
process.on('SIGTERM', () => { killFlask(); process.exit(0); });

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Flask prediction server starting on port ${PREDICT_PORT}...`);
});
