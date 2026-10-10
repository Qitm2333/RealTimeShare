const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

function desktopFixture({ authorized = async () => true, failLan = false, wrongLanBinding = false } = {}) {
  const processes = [];
  const windows = [];
  const handlers = new Map();
  const app = new EventEmitter();
  app.isPackaged = true;
  app.commandLine = { appendSwitch() {} };
  app.getPath = () => 'test-data';
  app.whenReady = () => new Promise(() => {});
  app.quit = () => app.emit('before-quit', { preventDefault() {} });
  const display = { id: '1', bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1080 } };
  class Window extends EventEmitter {
    constructor() {
      super(); this.destroyed = false; this.visible = true; windows.push(this);
      this.webContents = new EventEmitter();
      this.webContents.send = () => {};
      this.webContents.reloadIgnoringCache = () => {};
    }
    loadURL() { return Promise.resolve(); }
    loadFile() {}
    show() { this.visible = true; }
    hide() { this.visible = false; }
    focus() {}
    isDestroyed() { return this.destroyed; }
    isVisible() { return this.visible; }
    isAlwaysOnTop() { return true; }
    getBounds() { return display.bounds; }
    setBounds() {}
    setAlwaysOnTop() {}
    setVisibleOnAllWorkspaces() {}
    setIgnoreMouseEvents() {}
    moveTop() {}
    destroy() { this.destroyed = true; this.emit('closed'); }
  }
  const modules = {
    electron: {
      app, BrowserWindow: Window, dialog: { showErrorBox() {} },
      ipcMain: { handle: (name, handler) => handlers.set(name, handler), on() {} },
      screen: { getAllDisplays: () => [display], getPrimaryDisplay: () => display, getCursorScreenPoint: () => ({ x: 50, y: 50 }) }
    },
    './firewall': { createFirewallAccess: () => authorized },
    child_process: { spawn: (_executable, _args, options) => {
      const child = new EventEmitter();
      child.pid = 1000 + processes.length;
      child.exitCode = failLan && options.env.LISTEN_HOST === '0.0.0.0' ? 1 : null;
      child.signalCode = null;
      child.connected = true;
      child.send = (_message, callback) => { child.exitCode = 0; child.emit('exit'); callback?.(); };
      child.host = options.env.LISTEN_HOST;
      child.token = options.env.SESSION_TOKEN;
      child.kill = () => { child.killed = true; child.signalCode = 'SIGTERM'; child.emit('exit'); return true; };
      processes.push(child);
      return child;
    } },
    http: { get: (_url, callback) => {
      const request = new EventEmitter(); request.setTimeout = () => {}; request.destroy = () => {};
      queueMicrotask(() => {
        const response = new EventEmitter(); response.statusCode = 200; response.setEncoding = () => {};
        callback(response);
        const process = processes.at(-1);
        const listenAddress = wrongLanBinding && process.host === '0.0.0.0' ? '127.0.0.1' : process.host;
        response.emit('data', JSON.stringify({ service: 'realtime-share', pid: process.pid, listenAddress }));
        response.emit('end');
      });
      return request;
    } },
    net: { createServer: () => {
      const server = new EventEmitter(); server.unref = () => {};
      server.listen = (_port, _host, done) => queueMicrotask(done);
      server.close = (done) => done(); return server;
    } }
  };
  const context = vm.createContext({
    require: (name) => modules[name] || require(name),
    __dirname: path.join(__dirname, '..', 'electron'),
    process: { platform: 'win32', execPath: 'test.exe', env: {}, stdout: { write() {} }, stderr: { write() {} } },
    console: { error() {} }, Buffer, Date,
    setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {},
    module: { exports: {} }
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  vm.runInContext(source + '\nmodule.exports = { ensureServer, createStartWindow };', context);
  const init = async () => { context.module.exports.createStartWindow(); await context.module.exports.ensureServer(); };
  return { app, processes, windows, init, start: () => handlers.get('desktop:start')({}, '1'), stop: () => handlers.get('desktop:stop')() };
}

test('EXE boot stays loopback; authorization rejected keeps the start window', async () => {
  let checks = 0;
  const fixture = desktopFixture({ authorized: async () => { checks += 1; return false; } });
  await fixture.init();
  assert.equal(checks, 0);
  assert.equal(fixture.processes[0].host, '127.0.0.1');
  const result = await fixture.start();
  assert.equal(result.ok, false);
  assert.equal(fixture.windows.length, 1);
  assert.equal(fixture.windows[0].visible, true);
  assert.equal(fixture.processes.length, 1);
  fixture.app.quit();
});

test('retry after cancellation starts only after approval; exit returns to loopback', async () => {
  let allowed = false;
  const fixture = desktopFixture({ authorized: async () => allowed });
  await fixture.init();
  assert.equal((await fixture.start()).ok, false);
  allowed = true;
  assert.equal((await fixture.start()).ok, true);
  assert.equal(fixture.windows.length, 4);
  assert.equal(fixture.windows[0].visible, false);
  assert.equal((await fixture.start()).ok, false);
  assert.equal((await fixture.stop()).ok, true);
  assert.deepEqual(fixture.processes.map((child) => child.host), ['127.0.0.1', '0.0.0.0', '127.0.0.1']);
  assert.equal(new Set(fixture.processes.map((child) => child.token)).size, 1);
  assert.ok(fixture.processes.slice(0, 2).every((child) => !child.killed));
  assert.equal(fixture.windows[0].visible, true);
  fixture.app.quit();
});

test('LAN startup failure rolls back without entering interaction', async () => {
  const fixture = desktopFixture({ failLan: true });
  await fixture.init();
  assert.equal((await fixture.start()).ok, false);
  assert.deepEqual(fixture.processes.map((child) => child.host), ['127.0.0.1', '0.0.0.0', '127.0.0.1']);
  assert.equal(fixture.windows.length, 1);
  assert.equal(fixture.windows[0].visible, true);
  fixture.app.quit();
});

test('LAN startup with a loopback health response cannot enter interaction', async () => {
  const fixture = desktopFixture({ wrongLanBinding: true });
  await fixture.init();
  assert.equal((await fixture.start()).ok, false);
  assert.deepEqual(fixture.processes.map((child) => child.host), ['127.0.0.1', '0.0.0.0', '127.0.0.1']);
  assert.equal(fixture.windows.length, 1);
  assert.equal(fixture.windows[0].visible, true);
  fixture.app.quit();
});

test('quit while authorization is pending cannot reopen the LAN service', async () => {
  let approve;
  const fixture = desktopFixture({ authorized: () => new Promise((resolve) => { approve = resolve; }) });
  await fixture.init();
  const starting = fixture.start();
  assert.equal((await fixture.start()).ok, false);
  fixture.app.quit();
  approve(true);
  assert.equal((await starting).ok, false);
  assert.equal(fixture.processes.length, 1);
  assert.equal(fixture.windows.length, 1);
});
