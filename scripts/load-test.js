const { performance } = require('perf_hooks');
const { WebSocket } = require('ws');

const DEFAULTS = {
  url: 'http://127.0.0.1:3000',
  audiences: 150,
  timeoutMs: 60000,
  scenario: 'mixed',
  burstDelayMs: 0,
  giftsPerUser: 10,
  giftIntervalMs: 150,
  danmuPerUser: 3,
  danmuIntervalMs: 1250,
  password: '123456'
};

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (name === '--url' && value) options.url = value.replace(/\/$/, '');
    else if (name === '--audiences' && value) options.audiences = Number(value);
    else if (name === '--timeout-ms' && value) options.timeoutMs = Number(value);
    else if (name === '--scenario' && value) options.scenario = value;
    else if (name === '--burst-delay-ms' && value) options.burstDelayMs = Number(value);
    else if (name === '--gifts-per-user' && value) options.giftsPerUser = Number(value);
    else if (name === '--gift-interval-ms' && value) options.giftIntervalMs = Number(value);
    else if (name === '--danmu-per-user' && value) options.danmuPerUser = Number(value);
    else if (name === '--danmu-interval-ms' && value) options.danmuIntervalMs = Number(value);
    else if (name === '--password' && value) options.password = value;
    else if (name === '--help') options.help = true;
    else throw new Error(`Unknown or incomplete argument: ${name}`);
    if (name !== '--help') index += 1;
  }

  if (!Number.isInteger(options.audiences) || options.audiences < 1 || options.audiences > 2000) {
    throw new Error('--audiences must be an integer from 1 to 2000');
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1000) {
    throw new Error('--timeout-ms must be at least 1000');
  }
  if (!['mixed', 'danmu', 'gifts'].includes(options.scenario)) {
    throw new Error('--scenario must be mixed, danmu, or gifts');
  }
  if (!Number.isFinite(options.burstDelayMs) || options.burstDelayMs < 0) {
    throw new Error('--burst-delay-ms must be zero or greater');
  }
  if (!Number.isInteger(options.giftsPerUser) || options.giftsPerUser < 1) {
    throw new Error('--gifts-per-user must be a positive integer');
  }
  if (!Number.isInteger(options.danmuPerUser) || options.danmuPerUser < 1) {
    throw new Error('--danmu-per-user must be a positive integer');
  }
  if (!Number.isFinite(options.giftIntervalMs) || options.giftIntervalMs < 120) {
    throw new Error('--gift-interval-ms must be at least 120');
  }
  if (!Number.isFinite(options.danmuIntervalMs) || options.danmuIntervalMs < 1200) {
    throw new Error('--danmu-interval-ms must be at least 1200');
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/load-test.js [options]

Options:
  --url URL             Server URL (default: ${DEFAULTS.url})
  --audiences COUNT     Concurrent audience clients (default: ${DEFAULTS.audiences})
  --timeout-ms MS       Timeout for each phase (default: ${DEFAULTS.timeoutMs})
  --scenario NAME       mixed, danmu, or gifts (default: ${DEFAULTS.scenario})
  --burst-delay-ms MS   Pause after identities before the burst (default: 0)
  --gifts-per-user N    Repeated gift clicks per user (default: ${DEFAULTS.giftsPerUser})
  --gift-interval-ms MS Delay between gift waves (default: ${DEFAULTS.giftIntervalMs})
  --danmu-per-user N    Repeated danmu per user (default: ${DEFAULTS.danmuPerUser})
  --danmu-interval-ms MS Delay between danmu waves (default: ${DEFAULTS.danmuIntervalMs})
  --password PASSWORD   Presenter password (default: ${DEFAULTS.password})
  --help                Show this help

The default test connects and identifies every audience member, then sends
repeated danmu and gift waves at the server cooldown limits. It exits non-zero
on any missing connection, identity, interaction, stats update, cooldown, or
protocol error.`);
}

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function summarize(values) {
  return {
    min: values.length ? Math.min(...values) : null,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: values.length ? Math.max(...values) : null
  };
}

function aggregateCooldowns(clients) {
  return clients.reduce((totals, client) => ({
    danmu: totals.danmu + client.cooldowns.danmu,
    gifts: totals.gifts + client.cooldowns.gifts,
    other: totals.other + client.cooldowns.other
  }), { danmu: 0, gifts: 0, other: 0 });
}

function waitForCondition(predicate, label, timeoutMs) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve(Date.now() - startedAt);
      } else if (Date.now() - startedAt >= timeoutMs) {
        clearInterval(timer);
        reject(new Error(`Timeout waiting for ${label}`));
      }
    }, 10);
  });
}

class LoadClient {
  constructor(url, cookie = '') {
    this.identity = null;
    this.latestStats = null;
    this.cooldowns = { danmu: 0, gifts: 0, other: 0 };
    this.protocolErrors = [];
    this.listeners = new Set();
    this.ws = new WebSocket(url, cookie ? { headers: { Cookie: cookie } } : undefined);
    this.opened = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WebSocket open timeout')), 15000);
      this.ws.once('open', () => {
        clearTimeout(timer);
        resolve();
      });
      this.ws.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    this.ws.on('message', (data) => this.handleMessage(data));
  }

  handleMessage(data) {
    let message;
    try {
      message = JSON.parse(String(data));
    } catch (error) {
      this.protocolErrors.push('invalid-json');
      return;
    }
    if (message.type === 'identity') this.identity = message.user;
    if (message.type === 'stats') this.latestStats = message.stats;
    if (message.type === 'system' && message.status === 'cooldown') {
      if (message.scope === 'danmu') this.cooldowns.danmu += 1;
      else if (message.scope === 'effect') this.cooldowns.gifts += 1;
      else this.cooldowns.other += 1;
    }
    if (message.type === 'system' && ['invalid', 'audience-required', 'identity-required'].includes(message.status)) {
      this.protocolErrors.push(message.status);
    }
    this.listeners.forEach((listener) => listener(message));
  }

  send(payload) {
    this.ws.send(JSON.stringify(payload));
  }

  close() {
    if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
      this.ws.close();
    }
  }
}

async function login(httpUrl, password) {
  const response = await fetch(`${httpUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  if (!response.ok) throw new Error(`Presenter login failed with HTTP ${response.status}`);
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) throw new Error('Presenter login did not return a session cookie');
  return setCookie.split(';')[0];
}

async function getGiftIds(httpUrl) {
  const response = await fetch(`${httpUrl}/api/gifts`);
  if (!response.ok) throw new Error(`Gift configuration failed with HTTP ${response.status}`);
  const payload = await response.json();
  const ids = Array.isArray(payload.gifts) ? payload.gifts.map((gift) => gift.id).filter(Boolean) : [];
  if (!ids.length) throw new Error('No enabled gifts were returned by the server');
  return ids;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const wsUrl = options.url.replace(/^http/, 'ws');
  const runId = Date.now().toString(36).slice(-6);
  const runStartedAt = performance.now();
  const giftIds = await getGiftIds(options.url);
  const cookie = await login(options.url, options.password);
  const presenter = new LoadClient(wsUrl, cookie);
  const audiences = Array.from({ length: options.audiences }, () => new LoadClient(wsUrl));
  const allClients = [presenter, ...audiences];

  const expectedDanmu = options.scenario === 'gifts' ? 0 : options.audiences * options.danmuPerUser;
  const expectedGifts = options.scenario === 'danmu' ? 0 : options.audiences * options.giftsPerUser;
  const result = {
    runId,
    targetUrl: options.url,
    audienceCount: options.audiences,
    scenario: options.scenario,
    perUser: {
      danmu: expectedDanmu > 0 ? options.danmuPerUser : 0,
      gifts: expectedGifts > 0 ? options.giftsPerUser : 0
    },
    expectedInteractions: expectedDanmu + expectedGifts,
    giftTypes: giftIds,
    phasesMs: {},
    received: { danmu: 0, gifts: 0 },
    latencyMs: { danmu: [], gifts: [] }
  };

  try {
    const connectStartedAt = performance.now();
    await Promise.all(allClients.map((client) => client.opened));
    result.phasesMs.connect = Math.round(performance.now() - connectStartedAt);

    presenter.send({ type: 'role', role: 'presenter' });
    audiences.forEach((client, index) => {
      client.send({ type: 'role', role: 'audience' });
      client.send({ type: 'identify', nickname: `LT${runId}${String(index + 1).padStart(3, '0')}` });
    });

    const identifyStartedAt = performance.now();
    await waitForCondition(
      () => audiences.every((client) => client.identity),
      `${options.audiences} audience identities`,
      options.timeoutMs
    );
    result.phasesMs.identify = Math.round(performance.now() - identifyStartedAt);

    await waitForCondition(() => presenter.latestStats, 'initial presenter stats', options.timeoutMs);
    const baseline = {
      danmu: Number(presenter.latestStats.totals?.danmu || 0),
      gifts: Number(presenter.latestStats.totals?.gifts || 0)
    };
    result.baselineTotals = baseline;
    const danmuPrefix = `LT:${runId}:D:`;
    const giftSentAtByNickname = new Map();

    presenter.listeners.add((message) => {
      const receivedAt = Date.now();
      if (message.type === 'danmu' && message.content?.startsWith(danmuPrefix)) {
        const sentAt = Number(message.content.split(':').at(-1));
        result.received.danmu += 1;
        if (Number.isFinite(sentAt)) result.latencyMs.danmu.push(receivedAt - sentAt);
      }
      if (message.type === 'effect' && giftSentAtByNickname.has(message.nickname)) {
        const sentTimes = giftSentAtByNickname.get(message.nickname);
        const sentAt = sentTimes.shift();
        result.received.gifts += 1;
        if (Number.isFinite(sentAt)) result.latencyMs.gifts.push(receivedAt - sentAt);
      }
    });

    if (options.burstDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, options.burstDelayMs));
    }

    const burstStartedAt = performance.now();
    const sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
    const sendDanmuWaves = async () => {
      if (expectedDanmu === 0) return;
      for (let wave = 0; wave < options.danmuPerUser; wave += 1) {
        audiences.forEach((client, index) => {
          const sentAt = Date.now();
          client.send({ type: 'danmu', content: `${danmuPrefix}${wave}:${index}:${sentAt}` });
        });
        if (wave + 1 < options.danmuPerUser) await sleep(options.danmuIntervalMs);
      }
    };
    const sendGiftWaves = async () => {
      if (expectedGifts === 0) return;
      for (let wave = 0; wave < options.giftsPerUser; wave += 1) {
        audiences.forEach((client, index) => {
          const nickname = client.identity.nickname;
          const sentTimes = giftSentAtByNickname.get(nickname) || [];
          sentTimes.push(Date.now());
          giftSentAtByNickname.set(nickname, sentTimes);
          client.send({ type: 'effect', effect: giftIds[(index + wave) % giftIds.length] });
        });
        if (wave + 1 < options.giftsPerUser) await sleep(options.giftIntervalMs);
      }
    };

    await Promise.all([sendDanmuWaves(), sendGiftWaves()]);

    await waitForCondition(
      () => {
        const cooldowns = aggregateCooldowns(audiences);
        return result.received.danmu + cooldowns.danmu === expectedDanmu
          && result.received.gifts + cooldowns.gifts === expectedGifts;
      },
      `${expectedDanmu} danmu and ${expectedGifts} gift outcomes`,
      options.timeoutMs
    );
    result.phasesMs.burstDelivery = Math.round(performance.now() - burstStartedAt);

    result.cooldownResponses = aggregateCooldowns(audiences);

    await waitForCondition(() => {
      const totals = presenter.latestStats?.totals || {};
      return Number(totals.danmu) >= baseline.danmu + result.received.danmu
        && Number(totals.gifts) >= baseline.gifts + result.received.gifts;
    }, 'final interaction totals', options.timeoutMs);

    result.finalTotals = presenter.latestStats.totals;
    result.latencyMs = {
      danmu: summarize(result.latencyMs.danmu),
      gifts: summarize(result.latencyMs.gifts)
    };
    result.protocolErrors = audiences.flatMap((client) => client.protocolErrors);
    result.totalElapsedMs = Math.round(performance.now() - runStartedAt);
    const cooldownTotal = Object.values(result.cooldownResponses).reduce((sum, count) => sum + count, 0);
    result.status = cooldownTotal === 0 && result.protocolErrors.length === 0 ? 'PASS' : 'FAIL';

    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'PASS') process.exitCode = 1;
  } catch (error) {
    result.finalTotals = presenter.latestStats?.totals || null;
    result.latencyMs = {
      danmu: summarize(result.latencyMs.danmu),
      gifts: summarize(result.latencyMs.gifts)
    };
    result.cooldownResponses = aggregateCooldowns(audiences);
    result.protocolErrors = audiences.flatMap((client) => client.protocolErrors);
    result.totalElapsedMs = Math.round(performance.now() - runStartedAt);
    result.status = 'FAIL';
    result.error = error.message;
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  } finally {
    allClients.forEach((client) => client.close());
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'FAIL', error: error.stack || error.message }, null, 2));
  process.exitCode = 1;
});
