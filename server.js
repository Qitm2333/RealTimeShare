const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const QRCode = require('qrcode');
const { WebSocket, WebSocketServer } = require('ws');
const { csvPath, loadGifts } = require('./config/gift-config');

const PORT = Number(process.env.PORT || 3000);
const PRESENTER_PASSWORD = process.env.PRESENTER_PASSWORD || '123456';
const DANMU_COOLDOWN_MS = 1200;
const QUICK_DANMU_COOLDOWN_MS = 900;
const EFFECT_COOLDOWN_MS = 120;
const MAX_CONTENT_LENGTH = 80;
const MAX_USER_LENGTH = 18;
const MAX_PDF_SIZE = 100 * 1024 * 1024;
const SESSION_COOKIE = 'presenter_auth';
const SESSION_TOKEN = crypto.randomBytes(24).toString('hex');

const app = express();
const publicDir = path.join(__dirname, 'public');
const pdfjsDir = path.join(publicDir, 'pdfjs');
const dataDir = path.join(__dirname, 'data');
const currentPdfPath = path.join(dataDir, 'current.pdf');
const usersPath = path.join(dataDir, 'users.json');
const interactionStatePath = path.join(dataDir, 'interaction-state.json');
const lotteryHistoryPath = path.join(dataDir, 'lottery-history.json');

const quickPhrases = [
  { id: 'sustain-iteration', text: '持续迭代', image: '/assets/quick-phrases/sustain-iteration.png' },
  { id: 'think-different', text: '想不一样，做不一样', image: '/assets/quick-phrases/think-different.png' },
  { id: 'capture-possibility', text: '捕捉更多可能', image: '/assets/quick-phrases/capture-possibility.png' },
  { id: 'passion-continues', text: '让热爱持续发生', image: '/assets/quick-phrases/passion-continues.png' },
  { id: 'detail-feeling', text: '对细节有感觉', image: '/assets/quick-phrases/detail-feeling.png' },
  { id: 'change-continues', text: '让改变持续发生', image: '/assets/quick-phrases/change-continues.png' },
  { id: 'see-hear-more', text: '看见更多，听见更多', image: '/assets/quick-phrases/see-hear-more.png' },
  { id: 'redefine', text: '重新定义', image: '/assets/quick-phrases/redefine.png' },
  { id: 'think-do-more', text: '多想一点，多做一点', image: '/assets/quick-phrases/think-do-more.png' },
  { id: 'new-angle', text: '换个角度再想想', image: '/assets/quick-phrases/new-angle.png' }
];
const quickPhrasesById = new Map(quickPhrases.map((phrase) => [phrase.id, phrase]));

fs.mkdirSync(dataDir, { recursive: true });

let gifts = loadGifts();
let validEffectIds = new Set(gifts.map((gift) => gift.id));
let audienceMode = 'reader';
let activePoll = null;
let documentState = readDocumentState();
const users = loadUsers();

function loadUsers() {
  try {
    const parsed = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
    return new Map(
      Object.entries(parsed)
        .filter(([id, user]) => /^u_[a-f0-9]{16}$/.test(id) && user && typeof user === 'object')
        .map(([id, user]) => [id, {
          userId: id,
          nickname: cleanString(user.nickname, '匿名', MAX_USER_LENGTH),
          createdAt: Number(user.createdAt) || Date.now(),
          lastSeenAt: Number(user.lastSeenAt) || 0
        }])
    );
  } catch (error) {
    return new Map();
  }
}

function persistUsers() {
  const tempPath = `${usersPath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(Object.fromEntries(users), null, 2));
  fs.renameSync(tempPath, usersPath);
}

function createUserId() {
  let userId;
  do {
    userId = `u_${crypto.randomBytes(8).toString('hex')}`;
  } while (users.has(userId));
  return userId;
}

function shortUserId(userId) {
  return String(userId || '').replace(/^u_/, '').slice(0, 6).toUpperCase();
}

function userLabel(nickname, userId) {
  const shortId = shortUserId(userId);
  return shortId ? `${nickname} · #${shortId}` : nickname;
}

function createInteractionState() {
  return {
    version: 1,
    sessionId: `session_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    totals: { danmu: 0, gifts: 0, giftById: {} },
    users: {}
  };
}

function loadInteractionState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(interactionStatePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid interaction state');
    const state = createInteractionState();
    // Accept both the current { totals: {...} } shape and the pre-persistence
    // top-level { gifts: {...}, danmu: number } shape.
    const rawTotals = parsed.totals && typeof parsed.totals === 'object' ? parsed.totals : parsed;
    const legacyGiftMap = rawTotals.gifts && typeof rawTotals.gifts === 'object' ? rawTotals.gifts : {};
    const rawGiftMap = rawTotals.giftById && typeof rawTotals.giftById === 'object' ? rawTotals.giftById : legacyGiftMap;
    state.sessionId = String(parsed.sessionId || state.sessionId);
    state.startedAt = Number(parsed.startedAt) || state.startedAt;
    state.updatedAt = Number(parsed.updatedAt) || state.updatedAt;
    state.totals.giftById = Object.fromEntries(
      Object.entries(rawGiftMap)
        .filter(([id]) => typeof id === 'string' && id.length <= 80)
        .map(([id, count]) => [id, Math.max(0, Number(count) || 0)])
    );
    state.users = Object.fromEntries(
      Object.entries(parsed.users || {})
        .filter(([id, user]) => user && /^u_[a-f0-9]{16}$/.test(id))
        .map(([id, user]) => {
          const userGifts = Object.fromEntries(
            Object.entries(user.gifts || {})
              .filter(([giftId]) => typeof giftId === 'string' && giftId.length <= 80)
              .map(([giftId, count]) => [giftId, Math.max(0, Number(count) || 0)])
          );
          const giftCount = Math.max(
            0,
            Number(user.giftCount) || 0,
            Object.values(userGifts).reduce((total, count) => total + count, 0)
          );
          return [id, {
            userId: id,
            nickname: cleanString(user.nickname, '匿名', MAX_USER_LENGTH),
            danmuCount: Math.max(0, Number(user.danmuCount) || 0),
            giftCount,
            gifts: userGifts,
            lastInteractionAt: Number(user.lastInteractionAt) || 0
          }];
        })
    );
    const giftTotalFromMap = Object.values(state.totals.giftById).reduce((total, count) => total + count, 0);
    const giftTotalFromUsers = Object.values(state.users).reduce((total, user) => total + user.giftCount, 0);
    const danmuTotalFromUsers = Object.values(state.users).reduce((total, user) => total + user.danmuCount, 0);
    const persistedGiftTotal = typeof rawTotals.gifts === 'number' ? Number(rawTotals.gifts) : 0;
    state.totals.gifts = Math.max(0, persistedGiftTotal || 0, giftTotalFromMap, giftTotalFromUsers);
    state.totals.danmu = Math.max(0, Number(rawTotals.danmu) || 0, danmuTotalFromUsers);
    return state;
  } catch (error) {
    return createInteractionState();
  }
}

function persistInteractionState() {
  interactionState.updatedAt = Date.now();
  const tempPath = `${interactionStatePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(interactionState, null, 2));
  fs.renameSync(tempPath, interactionStatePath);
}

function loadLotteryHistory() {
  try {
    const parsed = JSON.parse(fs.readFileSync(lotteryHistoryPath, 'utf8'));
    return Array.isArray(parsed)
      ? parsed
        .filter((draw) => draw && typeof draw === 'object' && Array.isArray(draw.winners))
        .slice(-100)
      : [];
  } catch (error) {
    return [];
  }
}

function persistLotteryHistory() {
  const tempPath = `${lotteryHistoryPath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(lotteryHistory.slice(-100), null, 2));
  fs.renameSync(tempPath, lotteryHistoryPath);
}

const interactionState = loadInteractionState();
const lotteryHistory = loadLotteryHistory();

app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));
app.use('/css', express.static(path.join(publicDir, 'css')));
app.use('/js', express.static(path.join(publicDir, 'js')));
app.use('/assets', express.static(path.join(publicDir, 'assets')));
app.use('/pdfjs', express.static(pdfjsDir));

function readDocumentState() {
  if (!fs.existsSync(currentPdfPath)) {
    return {
      available: false,
      name: '',
      size: 0,
      updatedAt: null
    };
  }

  const file = fs.statSync(currentPdfPath);
  return {
    available: true,
    name: 'current.pdf',
    size: file.size,
    updatedAt: file.mtimeMs
  };
}

function parseCookies(req) {
  return String(req.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex > -1) {
        const key = part.slice(0, separatorIndex).trim();
        const value = part.slice(separatorIndex + 1).trim();
        try {
          cookies[key] = decodeURIComponent(value);
        } catch (error) {
          cookies[key] = value;
        }
      }
      return cookies;
    }, {});
}

function isPresenterAuthenticated(req) {
  return parseCookies(req)[SESSION_COOKIE] === SESSION_TOKEN;
}

function requirePresenter(req, res, next) {
  if (isPresenterAuthenticated(req)) {
    next();
    return;
  }

  res.status(401).json({ error: 'unauthorized' });
}

function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  Object.values(interfaces).forEach((entries) => {
    (entries || []).forEach((entry) => {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push(entry.address);
      }
    });
  });

  return addresses;
}

function cleanString(value, fallback, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return (text || fallback).slice(0, maxLength);
}

function normalizeMessage(raw) {
  let message;

  try {
    message = JSON.parse(raw);
  } catch (error) {
    return null;
  }

  if (!message || typeof message !== 'object') {
    return null;
  }

  const user = cleanString(message.nickname || message.user, '匿名', MAX_USER_LENGTH);

  if (message.type === 'danmu') {
    const content = cleanString(message.content, '', MAX_CONTENT_LENGTH);
    if (!content) {
      return null;
    }

    return {
      type: 'danmu',
      content,
      user,
      createdAt: Date.now()
    };
  }

  if (message.type === 'quick-danmu' && quickPhrasesById.has(message.phraseId)) {
    const phrase = quickPhrasesById.get(message.phraseId);
    return {
      type: 'quick-danmu',
      phraseId: phrase.id,
      content: phrase.text,
      user,
      createdAt: Date.now()
    };
  }

  if (message.type === 'effect' && validEffectIds.has(message.effect)) {
    return {
      type: 'effect',
      effect: message.effect,
      user,
      createdAt: Date.now()
    };
  }

  return null;
}

function normalizePollOptions(rawOptions) {
  if (!Array.isArray(rawOptions)) return [];
  const seen = new Set();
  return rawOptions
    .map((option) => cleanString(option, '', 40))
    .filter((option) => {
      const key = option.toLocaleLowerCase();
      if (!option || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

function ensureInteractionUser(userId, nickname) {
  if (!/^u_[a-f0-9]{16}$/.test(String(userId || ''))) return null;
  const canonicalNickname = cleanString(nickname, '匿名', MAX_USER_LENGTH);
  const existing = interactionState.users[userId];
  if (existing) {
    existing.nickname = canonicalNickname || existing.nickname;
    return existing;
  }

  const user = {
    userId,
    nickname: canonicalNickname,
    danmuCount: 0,
    giftCount: 0,
    gifts: {},
    lastInteractionAt: 0
  };
  interactionState.users[userId] = user;
  return user;
}

function getRanking() {
  const totalGifts = Number(interactionState.totals.gifts || 0);
  const totalDanmu = Number(interactionState.totals.danmu || 0);

  const ranking = Object.values(interactionState.users)
    .filter((user) => Number(user.giftCount || 0) + Number(user.danmuCount || 0) > 0)
    .map((user) => {
      const giftShare = totalGifts > 0 ? Number(user.giftCount || 0) / totalGifts : 0;
      const danmuShare = totalDanmu > 0 ? Number(user.danmuCount || 0) / totalDanmu : 0;
      const giftWeight = giftShare * 50;
      const danmuWeight = danmuShare * 50;
      return {
        userId: user.userId,
        nickname: user.nickname,
        shortId: shortUserId(user.userId),
        label: userLabel(user.nickname, user.userId),
        giftCount: Number(user.giftCount || 0),
        danmuCount: Number(user.danmuCount || 0),
        giftWeight,
        danmuWeight,
        score: giftWeight + danmuWeight,
        lastInteractionAt: Number(user.lastInteractionAt || 0)
      };
    })
    .sort((a, b) => b.score - a.score || b.giftCount - a.giftCount || b.danmuCount - a.danmuCount || b.lastInteractionAt - a.lastInteractionAt || a.userId.localeCompare(b.userId));

  ranking.forEach((user, index) => { user.rank = index + 1; });
  return ranking;
}

function getPublicStatsPayload() {
  const gifts = { ...interactionState.totals.giftById };
  return {
    gifts,
    danmu: interactionState.totals.danmu,
    totals: {
      gifts: interactionState.totals.gifts,
      danmu: interactionState.totals.danmu
    }
  };
}

function getPresenterStatsPayload() {
  return {
    ...getPublicStatsPayload(),
    ranking: getRanking()
  };
}

function broadcastToPresenters(payload) {
  const data = JSON.stringify(payload);
  clients.forEach((client) => {
    if (client.role === 'presenter' && client.readyState === WebSocket.OPEN) client.send(data);
  });
}

function sendToRole(role, payload) {
  const data = JSON.stringify(payload);
  clients.forEach((client) => {
    if (client.role === role && client.readyState === WebSocket.OPEN) client.send(data);
  });
}

function sendToClient(ws, payload) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function sendPollError(ws, reason, poll = activePoll) {
  sendToClient(ws, {
    type: 'poll-error',
    reason,
    pollId: poll?.id || null,
    poll: poll ? getPollPayload(poll) : null
  });
}

function broadcastStats() {
  broadcast({ type: 'stats', stats: getPublicStatsPayload() });
  broadcastToPresenters({ type: 'interaction-ranking', stats: getPresenterStatsPayload() });
}

app.post('/api/login', (req, res) => {
  if (req.body?.password !== PRESENTER_PASSWORD) {
    res.status(401).json({ ok: false });
    return;
  }

  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(SESSION_TOKEN)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`
  );
  res.json({ ok: true });
});

app.get('/api/session', (req, res) => {
  res.json({
    authenticated: isPresenterAuthenticated(req)
  });
});

function getDocumentPayload() {
  return {
    ...documentState,
    audienceMode
  };
}

function getPollPayload(poll = activePoll) {
  if (!poll) return null;
  return {
    id: poll.id,
    question: poll.question,
    options: poll.options.slice(),
    counts: poll.counts.slice(),
    total: poll.total,
    ended: Boolean(poll.ended),
    startedAt: poll.startedAt,
    endedAt: poll.endedAt || null
  };
}

function getAudiencePollPayload(poll = activePoll, userId = null) {
  if (!poll) return null;
  const selectedOptionIndex = userId && poll.voters instanceof Map ? poll.voters.get(userId) : undefined;
  return {
    id: poll.id,
    question: poll.question,
    options: poll.options.slice(),
    ended: Boolean(poll.ended),
    startedAt: poll.startedAt,
    hasVoted: Number.isInteger(selectedOptionIndex),
    selectedOptionIndex: Number.isInteger(selectedOptionIndex) ? selectedOptionIndex : null
  };
}

function persistPollState() {
  const payload = activePoll
    ? {
        ...getPollPayload(),
        voters: Object.fromEntries(activePoll.voters || [])
      }
    : null;
  const tempPath = path.join(dataDir, 'poll-state.json.tmp');
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2));
  fs.renameSync(tempPath, path.join(dataDir, 'poll-state.json'));
}

function loadPollState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dataDir, 'poll-state.json'), 'utf8'));
    if (!parsed || !parsed.id || !Array.isArray(parsed.options) || parsed.options.length < 2) return null;
    const options = normalizePollOptions(parsed.options);
    if (options.length < 2) return null;
    const rawCounts = Array.isArray(parsed.counts) ? parsed.counts : [];
    const voters = new Map(
      Object.entries(parsed.voters || {})
        .filter(([id, index]) => /^u_[a-f0-9]{16}$/.test(id) && Number.isInteger(Number(index)) && Number(index) >= 0 && Number(index) < options.length)
        .map(([id, index]) => [id, Number(index)])
    );
    let counts = options.map((_, index) => Math.max(0, Number(rawCounts[index]) || 0));
    if (voters.size) {
      counts = options.map((_, index) => 0);
      voters.forEach((index) => { counts[index] += 1; });
    }
    const question = cleanString(parsed.question, '', 120);
    if (!question) return null;
    return {
      id: String(parsed.id),
      question,
      options,
      counts,
      total: counts.reduce((total, count) => total + count, 0),
      voters,
      startedAt: Number(parsed.startedAt) || Date.now(),
      endedAt: parsed.endedAt ? Number(parsed.endedAt) : null,
      ended: Boolean(parsed.ended)
    };
  } catch (error) {
    return null;
  }
}

activePoll = loadPollState();

app.get('/api/document', (req, res) => {
  res.json(getDocumentPayload());
});

app.put(
  '/api/document',
  requirePresenter,
  express.raw({ type: 'application/pdf', limit: MAX_PDF_SIZE }),
  (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length < 5 || req.body.subarray(0, 5).toString() !== '%PDF-') {
      res.status(400).json({ error: 'invalid_pdf' });
      return;
    }

    let rawName = String(req.headers['x-file-name'] || 'current.pdf');
    try {
      rawName = decodeURIComponent(rawName);
    } catch (error) {
      // Keep a safe fallback when a malformed header is supplied.
      rawName = 'current.pdf';
    }
    const name = path.basename(rawName).replace(/[^\w\u4e00-\u9fff .()\-]/g, '_').slice(0, 120) || 'current.pdf';
    const tempPath = `${currentPdfPath}.tmp`;

    try {
      fs.writeFileSync(tempPath, req.body);
      if (fs.existsSync(currentPdfPath)) {
        fs.rmSync(currentPdfPath);
      }
      fs.renameSync(tempPath, currentPdfPath);
      documentState = {
        available: true,
        name,
        size: req.body.length,
        updatedAt: Date.now()
      };
      broadcast({ type: 'document', document: getDocumentPayload() });
      res.json({ ok: true, document: getDocumentPayload() });
    } catch (error) {
      if (fs.existsSync(tempPath)) {
        fs.rmSync(tempPath);
      }
      res.status(500).json({ error: 'document_save_failed' });
    }
  }
);

app.delete('/api/document', requirePresenter, (req, res) => {
  try {
    if (fs.existsSync(currentPdfPath)) {
      fs.rmSync(currentPdfPath);
    }
    documentState = readDocumentState();
    broadcast({ type: 'document', document: getDocumentPayload() });
    res.json({ ok: true, document: getDocumentPayload() });
  } catch (error) {
    res.status(500).json({ error: 'document_delete_failed' });
  }
});

app.get('/document/current.pdf', (req, res) => {
  if (!documentState.available) {
    res.status(404).send('PDF is not available');
    return;
  }

  const download = req.query.download === '1';
  const fileName = documentState.name || 'document.pdf';
  const contentDisposition = download
    ? `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    : 'inline';

  res.sendFile(currentPdfPath, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDisposition,
      'Cache-Control': 'no-store'
    }
  });
});

app.post('/api/audience-mode', requirePresenter, (req, res) => {
  const mode = req.body?.mode;
  if (mode !== 'reader' && mode !== 'interaction') {
    res.status(400).json({ error: 'invalid_mode' });
    return;
  }

  audienceMode = mode;
  broadcast({ type: 'system', status: 'audience-mode', mode: audienceMode });
  res.json({ ok: true, mode: audienceMode });
});

app.get('/api/gifts', (req, res) => {
  res.json({ gifts });
});

app.get('/api/quick-phrases', (req, res) => {
  res.json({ phrases: quickPhrases });
});

app.get('/api/audience-url', requirePresenter, (req, res) => {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const requestHost = req.headers.host;
  const currentUrl = requestHost ? `${protocol}://${requestHost}/audience` : null;
  const lanUrls = getLanAddresses().map((address) => `http://${address}:${PORT}/audience`);
  const urls = [...lanUrls, currentUrl].filter(Boolean).filter((url, index, list) => list.indexOf(url) === index);

  res.json({
    urls,
    currentUrl,
    lanUrls
  });
});

app.get('/api/qr-code.svg', requirePresenter, async (req, res) => {
  const data = String(req.query.data || '').trim();

  if (!data || data.length > 500) {
    res.status(400).send('Invalid QR code data');
    return;
  }

  try {
    const svg = await QRCode.toString(data, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 220,
      color: {
        dark: '#111827',
        light: '#ffffff'
      }
    });

    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(svg);
  } catch (error) {
    res.status(500).send('QR code generation failed');
  }
});

app.get(['/', '/presenter'], (req, res) => {
  res.sendFile(path.join(publicDir, 'presenter.html'));
});

app.get('/audience', (req, res) => {
  res.sendFile(path.join(publicDir, 'audience.html'));
});

const server = app.listen(PORT, '0.0.0.0', () => {
  const addresses = getLanAddresses();

  console.log(`Live interaction share is running on port ${PORT}`);
  console.log(`Presenter: http://localhost:${PORT}/`);
  console.log(`Audience:  http://localhost:${PORT}/audience`);

  addresses.forEach((address) => {
    console.log(`LAN presenter: http://${address}:${PORT}/`);
    console.log(`LAN audience:  http://${address}:${PORT}/audience`);
  });
});

const wss = new WebSocketServer({ server });
const clients = new Set();
const stats = interactionState.totals;
stats.giftById = stats.giftById || {};
gifts.forEach((gift) => {
  if (!Object.prototype.hasOwnProperty.call(stats.giftById, gift.id)) stats.giftById[gift.id] = 0;
});
const userCooldowns = new Map();

function getUserCooldown(userId) {
  if (!userCooldowns.has(userId)) userCooldowns.set(userId, { danmuAt: 0, quickDanmuAt: 0, effectAt: 0 });
  return userCooldowns.get(userId);
}

function recordInteraction(ws, message) {
  if (ws.role !== 'audience' || !ws.userId) return;
  const user = ensureInteractionUser(ws.userId, ws.nickname);
  if (!user) return;
  const now = Date.now();
  user.lastInteractionAt = now;

  if (message.type === 'danmu' || message.type === 'quick-danmu') {
    stats.danmu += 1;
    user.danmuCount += 1;
  }

  if (message.type === 'effect') {
    stats.gifts += 1;
    stats.giftById[message.effect] = Number(stats.giftById[message.effect] || 0) + 1;
    user.giftCount += 1;
    user.gifts[message.effect] = Number(user.gifts[message.effect] || 0) + 1;
  }

  try {
    persistInteractionState();
  } catch (error) {
    console.error(`Interaction state persistence failed: ${error.message}`);
  }
}

function drawLottery(count, excludePrevious = true) {
  const requestedCount = Math.min(10, Math.max(1, Number(count) || 1));
  const previousWinners = new Set(
    excludePrevious
      ? lotteryHistory
        .filter((draw) => draw.sessionId === interactionState.sessionId)
        .flatMap((draw) => (Array.isArray(draw.winners) ? draw.winners.map((winner) => winner.userId) : []))
      : []
  );
  const ranking = getRanking();
  let candidates = ranking.filter((user) => !previousWinners.has(user.userId));
  if (!candidates.length && excludePrevious) candidates = ranking.slice();
  if (!candidates.length) return null;

  const winners = [];
  while (winners.length < requestedCount && candidates.length) {
    const weighted = candidates.map((user) => ({
      user,
      weight: Math.max(1, Math.round((user.giftWeight + user.danmuWeight) * 1000000))
    }));
    const totalWeight = weighted.reduce((total, item) => total + item.weight, 0);
    let cursor = crypto.randomInt(1, totalWeight + 1);
    let pickedIndex = weighted.length - 1;
    for (let index = 0; index < weighted.length; index += 1) {
      cursor -= weighted[index].weight;
      if (cursor <= 0) {
        pickedIndex = index;
        break;
      }
    }
    winners.push(weighted[pickedIndex].user);
    candidates = candidates.filter((user) => user.userId !== weighted[pickedIndex].user.userId);
  }

  const result = {
    drawId: `draw_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    sessionId: interactionState.sessionId,
    createdAt: Date.now(),
    requestedCount,
    eligibleCount: ranking.length,
    drawnCount: winners.length,
    winners: winners.map((winner) => ({
      rank: winner.rank,
      userId: winner.userId,
      nickname: winner.nickname,
      shortId: winner.shortId,
      label: winner.label,
      giftCount: winner.giftCount,
      danmuCount: winner.danmuCount,
      score: winner.score
    }))
  };
  lotteryHistory.push(result);
  persistLotteryHistory();
  return result;
}

function broadcast(payload) {
  const data = JSON.stringify(payload);

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

function getAudienceCount() {
  return new Set(Array.from(clients).filter((client) => client.role === 'audience' && client.userId).map((client) => client.userId)).size;
}

function broadcastAudienceCount() {
  broadcast({ type: 'system', status: 'clients', clients: getAudienceCount() });
}

wss.on('connection', (ws, req) => {
  ws.role = 'unknown';
  ws.presenterAuthorized = isPresenterAuthenticated(req);
  ws.lastDanmuAt = 0;
  ws.lastQuickDanmuAt = 0;
  ws.lastEffectAt = 0;
  ws.userId = null;
  ws.nickname = '匿名';
  clients.add(ws);

  ws.send(JSON.stringify({ type: 'system', status: 'connected', clients: getAudienceCount() }));
  ws.send(JSON.stringify({ type: 'stats', stats: getPublicStatsPayload() }));
  ws.send(JSON.stringify({ type: 'document', document: getDocumentPayload() }));
  ws.send(JSON.stringify({ type: 'config', status: 'gifts', gifts }));
  ws.send(JSON.stringify({ type: 'system', status: 'audience-mode', mode: audienceMode }));
  broadcastAudienceCount();

  ws.on('message', (raw) => {
    const now = Date.now();
    let rawMessage;

    try {
      rawMessage = JSON.parse(raw);
    } catch (error) {
      rawMessage = null;
    }

    if (rawMessage?.type === 'role') {
      const requestedRole = rawMessage.role === 'presenter' || rawMessage.role === 'audience' ? rawMessage.role : null;
      if (!requestedRole) {
        sendToClient(ws, { type: 'system', status: 'invalid-role' });
        return;
      }
      if (ws.role !== 'unknown' && ws.role !== requestedRole) {
        sendToClient(ws, { type: 'system', status: 'role-locked' });
        return;
      }
      if (requestedRole === 'presenter' && !ws.presenterAuthorized) {
        sendToClient(ws, { type: 'system', status: 'unauthorized' });
        ws.role = 'unknown';
        return;
      }

      ws.role = requestedRole;
      broadcastAudienceCount();
      if (ws.role === 'presenter') {
        sendToClient(ws, { type: 'interaction-ranking', stats: getPresenterStatsPayload() });
        if (activePoll) sendToClient(ws, { type: 'poll-state', poll: getPollPayload() });
      }
      return;
    }

    if (rawMessage?.type === 'identify' && ws.role === 'audience') {
      if (ws.userId) {
        const current = users.get(ws.userId) || {
          userId: ws.userId,
          nickname: ws.nickname,
          createdAt: 0,
          lastSeenAt: Date.now()
        };
        sendToClient(ws, {
          type: 'identity',
          user: {
            ...current,
            shortId: shortUserId(current.userId),
            label: userLabel(current.nickname, current.userId)
          }
        });
        return;
      }
      const requestedId = typeof rawMessage.userId === 'string' && /^u_[a-f0-9]{16}$/.test(rawMessage.userId)
        ? rawMessage.userId
        : null;
      const existing = requestedId ? users.get(requestedId) : null;
      const userId = existing ? requestedId : createUserId();
      const nickname = existing ? existing.nickname : cleanString(rawMessage.nickname, '匿名', MAX_USER_LENGTH);
      const now = Date.now();
      const user = { userId, nickname, createdAt: users.get(userId)?.createdAt || now, lastSeenAt: now };
      users.set(userId, user);
      persistUsers();
      ws.userId = userId;
      ws.nickname = nickname;
      const interactionUser = ensureInteractionUser(userId, nickname);
      if (interactionUser && interactionUser.nickname !== nickname) interactionUser.nickname = nickname;
      persistInteractionState();
      sendToClient(ws, { type: 'identity', user: { ...user, shortId: shortUserId(userId), label: userLabel(nickname, userId) } });
      if (activePoll && !activePoll.ended) {
        sendToClient(ws, { type: 'poll-state', poll: getAudiencePollPayload(activePoll, userId) });
      } else if (activePoll?.ended) {
        sendToClient(ws, { type: 'poll-end', pollId: activePoll.id });
      }
      broadcastAudienceCount();
      return;
    }

    if (rawMessage?.type === 'identify') {
      sendToClient(ws, { type: 'system', status: 'audience-required' });
      return;
    }

    if (rawMessage?.type === 'poll-start' && ws.role === 'presenter') {
      const question = cleanString(rawMessage.question, '', 120);
      const options = normalizePollOptions(rawMessage.options);
      if (!question || options.length < 2) {
        sendPollError(ws, 'invalid-poll');
        return;
      }
      if (activePoll && !activePoll.ended) {
        sendPollError(ws, 'already-active');
        return;
      }
      activePoll = {
        id: `poll_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        question,
        options,
        counts: options.map(() => 0),
        total: 0,
        voters: new Map(),
        startedAt: Date.now(),
        ended: false,
        endedAt: null
      };
      persistPollState();
      sendToRole('presenter', { type: 'poll-start', poll: getPollPayload() });
      sendToRole('audience', { type: 'poll-start', poll: getAudiencePollPayload(activePoll) });
      return;
    }

    if (rawMessage?.type === 'poll-start') {
      sendToClient(ws, { type: 'system', status: 'presenter-required' });
      return;
    }

    if (rawMessage?.type === 'poll-end' && ws.role === 'presenter') {
      if (!activePoll) {
        sendPollError(ws, 'no-active-poll', null);
        return;
      }
      if (activePoll.ended) {
        sendPollError(ws, 'already-ended');
        return;
      }
      activePoll.ended = true;
      activePoll.endedAt = Date.now();
      persistPollState();
      sendToRole('presenter', { type: 'poll-end', poll: getPollPayload() });
      sendToRole('audience', { type: 'poll-end', pollId: activePoll.id });
      return;
    }

    if (rawMessage?.type === 'poll-end') {
      sendToClient(ws, { type: 'system', status: 'presenter-required' });
      return;
    }

    if (rawMessage?.type === 'poll-close' && ws.role === 'presenter') {
      if (!activePoll) {
        sendPollError(ws, 'no-active-poll', null);
        return;
      }
      activePoll = null;
      persistPollState();
      sendToRole('presenter', { type: 'poll-close' });
      sendToRole('audience', { type: 'poll-close' });
      return;
    }

    if (rawMessage?.type === 'poll-close') {
      sendToClient(ws, { type: 'system', status: 'presenter-required' });
      return;
    }

    if (rawMessage?.type === 'poll-vote') {
      if (ws.role !== 'audience') {
        sendToClient(ws, { type: 'poll-vote-rejected', reason: 'audience-required' });
        return;
      }
      if (!ws.userId) {
        sendToClient(ws, { type: 'poll-vote-rejected', reason: 'identity-required' });
        return;
      }
      if (!activePoll) {
        sendToClient(ws, { type: 'poll-vote-rejected', reason: 'no-active-poll' });
        return;
      }
      if (activePoll.ended) {
        sendToClient(ws, { type: 'poll-vote-rejected', pollId: activePoll.id, reason: 'poll-ended' });
        return;
      }
      const optionIndex = Number(rawMessage.optionIndex);
      if (rawMessage.pollId !== activePoll.id || !Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= activePoll.options.length) {
        sendToClient(ws, { type: 'poll-vote-rejected', pollId: activePoll.id, reason: 'invalid-vote' });
        return;
      }
      if (activePoll.voters.has(ws.userId)) {
        sendToClient(ws, { type: 'poll-vote-rejected', pollId: activePoll.id, reason: 'already-voted', optionIndex: activePoll.voters.get(ws.userId) });
        return;
      }
      activePoll.voters.set(ws.userId, optionIndex);
      activePoll.counts[optionIndex] += 1;
      activePoll.total += 1;
      persistPollState();
      sendToRole('presenter', { type: 'poll-update', poll: getPollPayload() });
      sendToClient(ws, { type: 'poll-voted', pollId: activePoll.id, optionIndex });
      return;
    }

    if (rawMessage?.type === 'interaction-ranking-request' && ws.role === 'presenter') {
      ws.send(JSON.stringify({ type: 'interaction-ranking', stats: getPresenterStatsPayload() }));
      return;
    }

    if (rawMessage?.type === 'interaction-ranking-request') {
      sendToClient(ws, { type: 'system', status: 'presenter-required' });
      return;
    }

    if (rawMessage?.type === 'lottery-draw' && ws.role === 'presenter') {
      const count = rawMessage.count === undefined ? 1 : Number(rawMessage.count);
      if (!Number.isInteger(count) || count < 1 || count > 10) {
        ws.send(JSON.stringify({ type: 'lottery-error', reason: 'invalid-count' }));
        return;
      }
      const result = drawLottery(count, rawMessage.excludePrevious !== false);
      if (!result) {
        ws.send(JSON.stringify({ type: 'lottery-error', reason: 'no-participants' }));
        return;
      }
      sendToRole('presenter', { type: 'lottery-result', result });
      return;
    }

    if (rawMessage?.type === 'lottery-draw') {
      sendToClient(ws, { type: 'system', status: 'presenter-required' });
      return;
    }

    if (rawMessage?.type === 'danmu' || rawMessage?.type === 'quick-danmu' || rawMessage?.type === 'effect') {
      if (ws.role !== 'audience') {
        sendToClient(ws, { type: 'system', status: 'audience-required' });
        return;
      }
      if (!ws.userId) {
        sendToClient(ws, { type: 'system', status: 'identity-required' });
        return;
      }
    }

    const message = normalizeMessage(raw);

    if (!message) {
      ws.send(JSON.stringify({ type: 'system', status: 'invalid' }));
      return;
    }

    if (ws.role !== 'audience') {
      sendToClient(ws, { type: 'system', status: 'audience-required' });
      return;
    }

    message.userId = ws.userId;
    message.nickname = ws.nickname;
    message.user = ws.nickname;
    message.label = userLabel(ws.nickname, ws.userId);

    const cooldown = ws.userId ? getUserCooldown(ws.userId) : ws;
    if (message.type === 'danmu' && now - cooldown.danmuAt < DANMU_COOLDOWN_MS) {
      ws.send(JSON.stringify({ type: 'system', status: 'cooldown', scope: 'danmu' }));
      return;
    }

    if (message.type === 'quick-danmu' && now - cooldown.quickDanmuAt < QUICK_DANMU_COOLDOWN_MS) {
      ws.send(JSON.stringify({ type: 'system', status: 'cooldown', scope: 'quick-danmu' }));
      return;
    }

    if (message.type === 'effect' && now - cooldown.effectAt < EFFECT_COOLDOWN_MS) {
      ws.send(JSON.stringify({ type: 'system', status: 'cooldown', scope: 'effect' }));
      return;
    }

    if (message.type === 'danmu') {
      cooldown.danmuAt = now;
    }

    if (message.type === 'quick-danmu') {
      cooldown.quickDanmuAt = now;
    }

    if (message.type === 'effect') {
      cooldown.effectAt = now;
    }

    recordInteraction(ws, message);
    if (message.type === 'effect') message.count = stats.giftById[message.effect];
    broadcast(message);
    broadcastStats();
  });

  ws.on('close', () => {
    clients.delete(ws);
    broadcastAudienceCount();
  });
});

fs.watchFile(csvPath, { interval: 500 }, () => {
  try {
    const nextGifts = loadGifts();
    const nextIds = new Set(nextGifts.map((gift) => gift.id));

    gifts = nextGifts;
    validEffectIds = nextIds;
    nextGifts.forEach((gift) => {
      if (!Object.prototype.hasOwnProperty.call(stats.giftById, gift.id)) stats.giftById[gift.id] = 0;
    });

    broadcast({ type: 'config', status: 'gifts', gifts });
    persistInteractionState();
    broadcastStats();
    console.log(`Gift configuration reloaded: ${gifts.length} enabled`);
  } catch (error) {
    console.error(`Gift configuration reload failed: ${error.message}`);
  }
});
