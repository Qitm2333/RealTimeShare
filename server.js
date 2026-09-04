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
let gifts = loadGifts();
let validEffectIds = new Set(gifts.map((gift) => gift.id));
let audienceMode = 'reader';
let documentState = readDocumentState();

app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));
app.use('/css', express.static(path.join(publicDir, 'css')));
app.use('/js', express.static(path.join(publicDir, 'js')));
app.use('/pdfjs', express.static(pdfjsDir));

fs.mkdirSync(dataDir, { recursive: true });

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
        cookies[part.slice(0, separatorIndex)] = decodeURIComponent(part.slice(separatorIndex + 1));
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

  const user = cleanString(message.user, '匿名', MAX_USER_LENGTH);

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

    const rawName = decodeURIComponent(String(req.headers['x-file-name'] || 'current.pdf'));
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
const stats = {
  gifts: Object.fromEntries(gifts.map((gift) => [gift.id, 0])),
  danmu: 0
};

function broadcast(payload) {
  const data = JSON.stringify(payload);

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

function getAudienceCount() {
  return Array.from(clients).filter((client) => client.role === 'audience').length;
}

function broadcastAudienceCount() {
  broadcast({ type: 'system', status: 'clients', clients: getAudienceCount() });
}

wss.on('connection', (ws) => {
  ws.role = 'unknown';
  ws.lastDanmuAt = 0;
  ws.lastEffectAt = 0;
  clients.add(ws);

  ws.send(JSON.stringify({ type: 'system', status: 'connected', clients: getAudienceCount() }));
  ws.send(JSON.stringify({ type: 'stats', stats }));
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
      ws.role = rawMessage.role === 'presenter' ? 'presenter' : 'audience';
      broadcastAudienceCount();
      return;
    }

    const message = normalizeMessage(raw);

    if (!message) {
      ws.send(JSON.stringify({ type: 'system', status: 'invalid' }));
      return;
    }

    if (message.type === 'danmu' && now - ws.lastDanmuAt < DANMU_COOLDOWN_MS) {
      ws.send(JSON.stringify({ type: 'system', status: 'cooldown', scope: 'danmu' }));
      return;
    }

    if (message.type === 'effect' && now - ws.lastEffectAt < EFFECT_COOLDOWN_MS) {
      ws.send(JSON.stringify({ type: 'system', status: 'cooldown', scope: 'effect' }));
      return;
    }

    if (message.type === 'danmu') {
      ws.lastDanmuAt = now;
      stats.danmu += 1;
    }

    if (message.type === 'effect') {
      ws.lastEffectAt = now;
      stats.gifts[message.effect] += 1;
      message.count = stats.gifts[message.effect];
    }

    broadcast(message);
    broadcast({ type: 'stats', stats });
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
    Object.keys(stats.gifts).forEach((id) => {
      if (!nextIds.has(id)) {
        delete stats.gifts[id];
      }
    });
    nextGifts.forEach((gift) => {
      if (!Object.prototype.hasOwnProperty.call(stats.gifts, gift.id)) {
        stats.gifts[gift.id] = 0;
      }
    });

    broadcast({ type: 'config', status: 'gifts', gifts });
    broadcast({ type: 'stats', stats });
    console.log(`Gift configuration reloaded: ${gifts.length} enabled`);
  } catch (error) {
    console.error(`Gift configuration reload failed: ${error.message}`);
  }
});
