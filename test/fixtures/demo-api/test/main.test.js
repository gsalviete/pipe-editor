const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

test('API returns its service name', { timeout: 5000 }, async (t) => {
  const server = spawn(process.execPath, ['src/main.js'], { env: { ...process.env, PORT: '0' } });
  t.after(() => server.kill());
  const port = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.stdout.once('data', (data) => resolve(Number(String(data).trim().split(' ').pop())));
    server.once('exit', (code) => reject(new Error('Server exited: ' + code)));
  });
  const response = await fetch(`http://127.0.0.1:${port}`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { service: 'demo-api', status: 'ok' });
});
