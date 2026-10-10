const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const vm = require('node:vm');

test('QR selects current detected LAN before a cached manual address', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'presenter.js'), 'utf8');
  const start = source.indexOf('  async function loadAudienceUrls()');
  const end = source.indexOf('  function setQrEditing(', start);
  let selected;
  let options;
  const current = 'http://10.13.33.219:3001/audience';
  const cached = 'http://192.168.1.20:3000/audience';
  const context = vm.createContext({
    localStorage: { getItem: () => cached }, manualAudienceUrlKey: 'test',
    normalizeAudienceUrl: (url) => url,
    location: { protocol: 'http:', host: '127.0.0.1:3001' },
    fetch: async () => ({ ok: true, json: async () => ({ urls: [current] }) }),
    setAudienceUrlOptions: (urls) => { options = urls; },
    renderQrCode: (url) => { selected = url; }, setQrHint() {}
  });
  await vm.runInContext(source.slice(start, end) + '\nloadAudienceUrls()', context);
  assert.equal(selected, current);
  assert.ok(options.includes(cached));
});

test('LAN listener serves health and audience through the computer LAN interface', { timeout: 15000 }, async (t) => {
  const addresses = Object.values(os.networkInterfaces()).flat().filter((entry) => entry.family === 'IPv4' && !entry.internal);
  if (!addresses.length) return t.skip('No IPv4 LAN interface available');
  const root = path.join(__dirname, '..');
  const probe = net.createServer();
  probe.listen(0, '0.0.0.0');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  fs.mkdirSync(path.join(root, '.qa-server'), { recursive: true });
  const dataDir = fs.mkdtempSync(path.join(root, '.qa-server', 'v21-lan-'));
  const child = spawn(process.execPath, [path.join(root, 'server.js')], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, LISTEN_HOST: '0.0.0.0' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  try {
    let ready = false;
    for (let index = 0; index < 100; index += 1) {
      if (child.exitCode !== null) throw new Error(output);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/desktop-health`, { signal: AbortSignal.timeout(500) });
        ready = (await response.json()).pid === child.pid;
        if (ready) break;
      } catch (_) {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(ready, output);
    for (const entry of addresses) {
      const base = `http://${entry.address}:${port}`;
      const response = await fetch(`${base}/api/desktop-health`, { signal: AbortSignal.timeout(2000) });
      const health = await response.json();
      assert.equal(response.status, 200);
      assert.equal(health.pid, child.pid);
      assert.equal(health.listenAddress, '0.0.0.0');
      assert.equal((await fetch(`${base}/audience`, { signal: AbortSignal.timeout(2000) })).status, 200);
      console.log(`LAN interface verified: ${base}/audience`);
    }
  } finally {
    if (child.exitCode === null) {
      const exit = once(child, 'exit');
      const timer = setTimeout(() => child.kill(), 3000);
      child.send({ type: 'desktop:shutdown' });
      await exit;
      clearTimeout(timer);
    }
  }
});
