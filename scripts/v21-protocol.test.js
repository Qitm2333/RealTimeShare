const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { WebSocket } = require('ws');

const root = path.join(__dirname, '..');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function availablePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function runLoad(url) {
  const child = spawn(process.execPath, [path.join(__dirname, 'load-test.js'), '--url', url, '--audiences', '150', '--gifts-per-user', '20'], { cwd: root, windowsHide: true });
  let output = '';
  let errors = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const timer = setTimeout(() => child.kill(), 90000);
  try {
    const [code] = await once(child, 'exit');
    assert.equal(code, 0, errors || output);
    const result = JSON.parse(output);
    assert.equal(result.status, 'PASS');
    assert.deepEqual(result.received, { danmu: 450, gifts: 3000 });
    console.log(`Load ${result.danmuMode}: 150 users, 450 danmu, 3000 gifts, P95 ${result.latencyMs.danmu.p95}/${result.latencyMs.gifts.p95}ms`);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

test('preset sentence, authorization, cooldown, persistence and 150-user bursts', { timeout: 120000 }, async () => {
  fs.mkdirSync(path.join(root, '.qa-server'), { recursive: true });
  const dataDir = fs.mkdtempSync(path.join(root, '.qa-server', 'v21-protocol-'));
  const port = await availablePort();
  const url = `http://127.0.0.1:${port}`;
  let server;
  let log = '';
  const sockets = [];
  const start = async (host) => {
    server = spawn(process.execPath, [path.join(root, 'server.js')], {
      cwd: root,
      env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, LISTEN_HOST: host, SESSION_TOKEN: 'v21-test-session', PRESENTER_PASSWORD: '123456' },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      windowsHide: true
    });
    server.stdout.on('data', (chunk) => { log += chunk; });
    server.stderr.on('data', (chunk) => { log += chunk; });
    for (let index = 0; index < 100; index += 1) {
      if (server.exitCode !== null) throw new Error(log);
      try {
        const response = await fetch(`${url}/api/desktop-health`);
        const health = await response.json();
        if (health.pid === server.pid && health.listenAddress === host) return;
      } catch (_) {}
      await pause(50);
    }
    throw new Error(`Server startup timeout: ${log}`);
  };
  const stop = async () => {
    sockets.splice(0).forEach((client) => client.ws.terminate());
    if (server && server.exitCode === null) {
      const exit = once(server, 'exit');
      server.send({ type: 'desktop:shutdown' });
      await exit;
    }
  };
  const connect = async (cookie = '', identity = null) => {
    const ws = new WebSocket(url.replace('http', 'ws'), cookie ? { headers: { Cookie: cookie } } : {});
    const messages = [];
    ws.on('message', (data) => messages.push(JSON.parse(String(data))));
    const client = { ws, messages,
      send: (payload) => ws.send(JSON.stringify(payload)),
      wait: async (match) => {
        for (let i = 0; i < 250; i += 1) {
          const index = messages.findIndex(match);
          if (index >= 0) return messages.splice(index, 1)[0];
          await pause(20);
        }
        throw new Error('WebSocket expected message timeout');
      }
    };
    sockets.push(client);
    await once(ws, 'open');
    client.send({ type: 'role', role: cookie ? 'presenter' : 'audience' });
    if (!cookie) {
      client.send({ type: 'identify', nickname: 'v21测试', ...identity });
      client.identity = (await client.wait((message) => message.type === 'identity')).user;
    }
    return client;
  };
  try {
    await start('127.0.0.1');
    const login = await fetch(`${url}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: '123456' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const put = (endpoint, body, auth = cookie) => fetch(`${url}/api/${endpoint}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: auth }, body: JSON.stringify(body) });
    assert.equal((await put('preset-danmu', { text: '擅自更改' }, '')).status, 401);
    assert.equal((await put('preset-danmu', { text: '   ' })).status, 400);
    assert.equal((await put('preset-danmu', { text: '一起为演讲者点赞' })).status, 200);
    assert.equal((await put('danmu-mode', { mode: 'preset' })).status, 200);
    const failedSavePath = path.join(dataDir, 'preset-danmu.json.tmp');
    fs.mkdirSync(failedSavePath);
    assert.equal((await put('preset-danmu', { text: '保存失败的句子' })).status, 500);
    assert.equal((await (await fetch(`${url}/api/preset-danmu`)).json()).text, '一起为演讲者点赞');
    fs.rmdirSync(failedSavePath);
    const phrases = (await (await fetch(`${url}/api/quick-phrases`)).json()).phrases;
    assert.equal(phrases.length, 10);
    assert.ok(phrases.every((phrase) => phrase.image));
    const presenter = await connect(cookie);
    const audience = await connect();
    audience.send({ type: 'danmu', content: '不允许的任意内容' });
    await audience.wait((message) => message.type === 'system' && message.status === 'danmu-mode');
    audience.send({ type: 'danmu', content: '一起为演讲者点赞' });
    await presenter.wait((message) => message.type === 'danmu' && message.content === '一起为演讲者点赞');
    const reconnect = await connect('', { userId: audience.identity.userId, sessionId: audience.identity.sessionId });
    reconnect.send({ type: 'danmu', content: '一起为演讲者点赞' });
    const cooldown = await reconnect.wait((message) => message.type === 'system' && message.status === 'cooldown');
    assert.equal(cooldown.scope, 'danmu');
    assert.ok(cooldown.retryAfterMs > 0 && cooldown.retryAfterMs <= 3000);
    reconnect.send({ type: 'quick-danmu', phraseId: phrases[0].id });
    await presenter.wait((message) => message.type === 'quick-danmu' && message.phraseId === phrases[0].id);
    assert.equal((await put('preset-danmu', { text: '恭喜获奖！' })).status, 200);
    await audience.wait((message) => message.type === 'config' && message.status === 'preset-danmu' && message.text === '恭喜获奖！');
    audience.send({ type: 'danmu', content: '一起为演讲者点赞' });
    await audience.wait((message) => message.type === 'system' && message.status === 'danmu-mode');
    await pause(cooldown.retryAfterMs + 30);
    audience.send({ type: 'danmu', content: '恭喜获奖！' });
    await presenter.wait((message) => message.type === 'danmu' && message.content === '恭喜获奖！');
    assert.equal((await runLoad(url)).danmuMode, 'preset');
    // Stop immediately after delivery, while the 100ms persistence timer can
    // still be pending. Desktop IPC shutdown must flush this last interaction.
    const lastAudience = await connect();
    lastAudience.send({ type: 'danmu', content: '恭喜获奖！' });
    await presenter.wait((message) => message.type === 'danmu' && message.userId === lastAudience.identity.userId);
    await stop();
    const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'interaction-state.json'), 'utf8'));
    assert.equal(saved.users[lastAudience.identity.userId].danmuCount, 1);
    assert.equal(saved.totals.gifts, 3000);
    await start('127.0.0.1');
    assert.equal((await (await fetch(`${url}/api/session`, { headers: { Cookie: cookie } })).json()).authenticated, true);
    assert.equal((await (await fetch(`${url}/api/preset-danmu`)).json()).text, '恭喜获奖！');
    assert.equal((await (await fetch(`${url}/api/danmu-mode`, { headers: { Cookie: cookie } })).json()).mode, 'preset');
    assert.equal((await put('danmu-mode', { mode: 'free' })).status, 200);
    assert.equal((await runLoad(url)).danmuMode, 'free');
    assert.equal((await put('danmu-filter', { words: ['屏蔽词'] })).status, 200);
    const freeAudience = await connect();
    freeAudience.send({ type: 'danmu', content: '含屏蔽词的内容' });
    await freeAudience.wait((message) => message.type === 'system' && message.status === 'blocked');
    console.log(`Protocol data: ${dataDir}`);
  } finally {
    await stop();
  }
});
