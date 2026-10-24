const fs = require('node:fs');
const { spawn } = require('node:child_process');
const token = fs.readFileSync('/run/secrets/lock_token', 'utf8').trim();
if (token.length < 32 || /[\r\n]/.test(token)) throw Error('Invalid lock secret');
const child = spawn(process.execPath, ['lock-server.js'], {
  stdio: 'inherit',
  env: { ...process.env, LOCK_SERVER_TOKEN: token }
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('error', () => process.exit(1));
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
