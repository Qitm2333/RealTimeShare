(function () {
  const pdfInput = document.getElementById('pdfInput');
  const pdfRemove = document.getElementById('pdfRemove');
  const pdfStatus = document.getElementById('pdfStatus');
  const pdfReader = new window.LivePdfReader({
    canvas: document.getElementById('pdfCanvas'),
    container: document.getElementById('pdfViewport'),
    pageInput: document.getElementById('pdfPageInput'),
    pageCount: document.getElementById('pdfPageCount'),
    status: pdfStatus,
    previousButton: document.getElementById('pdfPrevious'),
    nextButton: document.getElementById('pdfNext'),
    zoomOutButton: document.getElementById('pdfZoomOut'),
    zoomInButton: document.getElementById('pdfZoomIn'),
    fitWidthButton: document.getElementById('pdfFitWidth'),
    fitPageButton: document.getElementById('pdfFitPage'),
    emptyState: document.getElementById('emptyState')
  });
  const connectionStatus = document.getElementById('connectionStatus');
  const danmuLayer = document.getElementById('danmuLayer');
  const effectLayer = document.getElementById('effectLayer');
  const toast = document.getElementById('toast');
  const giftCount = document.getElementById('giftCount');
  const topGiftIcon = document.getElementById('topGiftIcon');
  const topGiftLabel = document.getElementById('topGiftLabel');
  const topGiftCount = document.getElementById('topGiftCount');
  const heatCount = document.getElementById('heatCount');
  const comboBadge = document.getElementById('comboBadge');
  const passwordDialog = document.getElementById('passwordDialog');
  const passwordForm = document.getElementById('passwordForm');
  const passwordInput = document.getElementById('passwordInput');
  const passwordError = document.getElementById('passwordError');
  const qrToggle = document.getElementById('qrToggle');
  const qrCard = document.getElementById('qrCard');
  const qrClose = document.getElementById('qrClose');
  const qrImage = document.getElementById('qrImage');
  const qrUrlInput = document.getElementById('qrUrlInput');
  const qrUrlSelect = document.getElementById('qrUrlSelect');
  const qrSave = document.getElementById('qrSave');
  const qrHint = document.getElementById('qrHint');
  const giftToggle = document.getElementById('giftToggle');
  const audienceModeToggle = document.getElementById('audienceModeToggle');
  const pollStartButton = document.getElementById('pollStart');
  const pollEndButton = document.getElementById('pollEnd');
  let activePoll;
  const pollCard = document.createElement('aside');
  pollCard.className = 'poll-card';
  pollCard.hidden = true;
  document.querySelector('.stage')?.appendChild(pollCard);

  const trackCount = 5;
  const manualAudienceUrlKey = 'live-share-manual-audience-url';
  const giftEffectsEnabledKey = 'live-share-gift-effects-enabled';
  const trackBusyUntil = Array.from({ length: trackCount }, () => 0);
  const recentEffects = [];
  let giftList = [];
  let giftsById = {};
  let documentInfo;
  let websocket;
  let giftEffectsEnabled = localStorage.getItem(giftEffectsEnabledKey) !== 'false';
  let connectionText = '未连接';
  let audienceCount = 0;
  let audienceMode = 'reader';
  let lastStats;
  let fullscreenUiTimer;

  function renderPoll(poll) {
    activePoll = poll;
    pollCard.hidden = !poll;
    if (!poll) return;
    const total = Number(poll.total || 0);
    pollCard.innerHTML = `<strong>${poll.question}</strong>${poll.options.map((option, index) => `<div class="poll-result"><span>${option}</span><span>${total ? Math.round((poll.counts[index] || 0) / total * 100) : 0}%</span></div>`).join('')}<small>已参与 ${total} 人</small>`;
    pollEndButton.disabled = Boolean(poll.ended);
  }

  function setConnectionStatus(text) {
    connectionText = text;
    connectionStatus.textContent = `${connectionText} · 观众 ${audienceCount} 人在线`;
  }

  function setAudienceCount(count) {
    audienceCount = Math.max(0, Number(count) || 0);
    connectionStatus.textContent = `${connectionText} · 观众 ${audienceCount} 人在线`;
  }

  function isPresentationFullscreen() {
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const screenHeight = window.screen?.height || 0;
    const browserFullscreen = screenHeight > 0 && viewportHeight >= screenHeight - 24;

    return Boolean(document.fullscreenElement) || browserFullscreen;
  }

  function revealFullscreenUi() {
    const isFullscreen = isPresentationFullscreen();
    const stage = document.querySelector('.stage');
    stage?.classList.toggle('is-presentation-fullscreen', isFullscreen);

    if (!isFullscreen) {
      stage?.classList.remove('is-ui-hidden');
      window.clearTimeout(fullscreenUiTimer);
      return;
    }

    stage?.classList.remove('is-ui-hidden');
    window.clearTimeout(fullscreenUiTimer);
    fullscreenUiTimer = window.setTimeout(() => {
      stage?.classList.add('is-ui-hidden');
    }, 1800);
  }

  function handleFullscreenPointer(event) {
    if (!isPresentationFullscreen()) {
      return;
    }

    const edgeDistance = Math.min(event.clientY, window.innerHeight - event.clientY);
    if (edgeDistance < 88) {
      revealFullscreenUi();
    }
  }

  function handlePdfKey(event) {
    if (!passwordDialog.hidden || event.target?.closest?.('.qr-panel, .pdf-toolbar, button, input')) {
      return;
    }

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === ' ') {
      event.preventDefault();
      pdfReader.goToPage(Number(document.getElementById('pdfPageInput').value) + 1);
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'PageUp') {
      event.preventDefault();
      pdfReader.goToPage(Number(document.getElementById('pdfPageInput').value) - 1);
    }
  }

  async function checkSession() {
    try {
      const response = await fetch('/api/session');
      const session = await response.json();
      return Boolean(session.authenticated);
    } catch (error) {
      return false;
    }
  }

  async function loadGifts() {
    try {
      const response = await fetch('/api/gifts');
      if (!response.ok) {
        throw new Error('Gift configuration failed');
      }

      const data = await response.json();
      applyGifts(data.gifts || []);
    } catch (error) {
      toast.textContent = '互动配置加载失败';
    }
  }

  function applyGifts(nextGifts) {
    giftList = Array.isArray(nextGifts) ? nextGifts : [];
    giftsById = Object.fromEntries(giftList.map((gift) => [gift.id, gift]));
    if (lastStats) {
      updateStats(lastStats);
    }
  }

  function formatBytes(bytes) {
    if (bytes < 1024 * 1024) {
      return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }

    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function applyDocument(nextDocument) {
    documentInfo = nextDocument || { available: false };
    pdfRemove.disabled = !documentInfo.available;
    pdfStatus.textContent = documentInfo.available ? '已就绪' : '未打开';

    if (!documentInfo.available) {
      pdfReader.clear();
      return;
    }

    pdfReader.load(`/document/current.pdf?v=${encodeURIComponent(documentInfo.updatedAt || Date.now())}`);
  }

  async function loadDocument() {
    try {
      const response = await fetch('/api/document');
      if (!response.ok) {
        throw new Error('Document status failed');
      }

      applyDocument(await response.json());
    } catch (error) {
      applyDocument({ available: false });
      toast.textContent = 'PDF 状态加载失败';
    }
  }

  async function uploadPdf(file) {
    if (!file) {
      return;
    }

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.textContent = '请选择 PDF 文件';
      return;
    }

    pdfInput.disabled = true;
    pdfRemove.disabled = true;
    pdfStatus.textContent = `正在上传 · ${formatBytes(file.size)}`;

    try {
      const response = await fetch('/api/document', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/pdf',
          'X-File-Name': encodeURIComponent(file.name)
        },
        body: file
      });

      if (!response.ok) {
        throw new Error('PDF upload failed');
      }

      const data = await response.json();
      applyDocument(data.document);
      toast.textContent = 'PDF 已上传';
    } catch (error) {
      toast.textContent = 'PDF 上传失败，请重试';
      await loadDocument();
    } finally {
      pdfInput.disabled = false;
    }
  }

  function normalizeAudienceUrl(value) {
    const text = String(value || '').trim();
    if (!text) {
      return '';
    }

    if (/^https?:\/\//i.test(text)) {
      return text;
    }

    return `http://${text}`;
  }

  function setQrHint(text, tone = '') {
    qrHint.textContent = text;
    qrHint.className = `qr-hint ${tone}`.trim();
  }

  function renderQrCode(url) {
    const normalizedUrl = normalizeAudienceUrl(url);
    qrUrlInput.value = normalizedUrl;

    if (!normalizedUrl) {
      qrImage.removeAttribute('src');
      setQrHint('没有可用地址，请手动输入观众端地址。', 'is-warning');
      return;
    }

    qrImage.src = `/api/qr-code.svg?data=${encodeURIComponent(normalizedUrl)}`;
    setQrHint('自动识别局域网地址；不准时可手动输入。');
  }

  function setAudienceUrlOptions(urls) {
    const uniqueUrls = urls.filter(Boolean).filter((url, index, list) => list.indexOf(url) === index);
    qrUrlSelect.textContent = '';

    uniqueUrls.forEach((url) => {
      const option = document.createElement('option');
      option.value = url;
      option.textContent = url;
      qrUrlSelect.appendChild(option);
    });

    qrUrlSelect.hidden = uniqueUrls.length < 2;
  }

  async function loadAudienceUrls() {
    const savedUrl = normalizeAudienceUrl(localStorage.getItem(manualAudienceUrlKey));

    try {
      const response = await fetch('/api/audience-url');
      if (!response.ok) {
        throw new Error('Audience URL is locked');
      }

      const data = await response.json();
      const urls = (data.urls || []).map(normalizeAudienceUrl).filter(Boolean);
      const fallbackUrl = `${location.protocol}//${location.host}/audience`;
      const allUrls = [savedUrl, ...urls, fallbackUrl].filter(Boolean);
      const uniqueUrls = allUrls.filter((url, index, list) => list.indexOf(url) === index);

      setAudienceUrlOptions(uniqueUrls);
      renderQrCode(uniqueUrls[0]);
    } catch (error) {
      const fallbackUrl = savedUrl || `${location.protocol}//${location.host}/audience`;
      setAudienceUrlOptions([fallbackUrl]);
      renderQrCode(fallbackUrl);
      setQrHint('自动识别失败，已使用当前访问地址；也可以手动输入。', 'is-warning');
    }
  }

  function setQrExpanded(expanded) {
    qrCard.hidden = !expanded;
    qrToggle.setAttribute('aria-expanded', String(expanded));

    if (expanded && !qrUrlInput.value) {
      loadAudienceUrls();
    }
  }

  function chooseTrack() {
    const now = Date.now();
    let index = trackBusyUntil.findIndex((busyUntil) => busyUntil <= now);

    if (index < 0) {
      index = trackBusyUntil.indexOf(Math.min(...trackBusyUntil));
    }

    trackBusyUntil[index] = now + 1300;
    return index;
  }

  function addDanmu(message) {
    const item = document.createElement('div');
    const track = chooseTrack();
    const layerHeight = danmuLayer.clientHeight;
    const trackHeight = Math.max(46, Math.floor(layerHeight / trackCount));
    const top = Math.min(layerHeight - 46, track * trackHeight + 8);

    item.className = 'danmu';
    item.textContent = `${message.user}: ${message.content}`;
    item.style.top = `${top}px`;
    item.style.animationDuration = `${8 + Math.random() * 2.5}s`;

    danmuLayer.appendChild(item);
    item.addEventListener('animationend', () => item.remove(), { once: true });
  }

  function addEffect(message) {
    const gift = giftsById[message.effect];

    if (!gift) {
      return;
    }

    if (!giftEffectsEnabled) {
      toast.textContent = `${message.user} ${gift.toast}，本场第 ${message.count || 1} 个`;
      recordEffectBurst(message.effect);
      return;
    }

    const item = document.createElement('div');
    const arc = document.createElement('span');
    const symbol = document.createElement('span');
    const effectConfig = getEffectConfig(gift);
    const spin = gift.motion === 'throw' ? 620 + Math.random() * 220 : 180 + Math.random() * 160;

    item.className = `gift-effect gift-${gift.id} motion-${gift.motion}`;
    item.style.left = effectConfig.left;
    item.style.bottom = effectConfig.bottom;
    item.style.setProperty('--effect-duration', `${effectConfig.duration}s`);
    item.style.setProperty('--arc-height', effectConfig.arcHeight);
    item.style.setProperty('--rise-height', effectConfig.riseHeight);
    item.style.setProperty('--drift-x', effectConfig.driftX);
    item.style.setProperty('--throw-x', effectConfig.throwX);
    item.style.setProperty('--fall-y', effectConfig.fallY);
    item.style.setProperty('--spin-mid', `${Math.round(spin * 0.52)}deg`);
    item.style.setProperty('--spin-end', `${Math.round(spin)}deg`);
    item.style.setProperty('--gift-start', gift.colors[0]);
    item.style.setProperty('--gift-end', gift.colors[1]);

    arc.className = 'effect-arc';
    symbol.className = 'effect-symbol';
    symbol.textContent = gift.icon;
    arc.appendChild(symbol);
    item.appendChild(arc);
    addEffectParticles(item, gift);

    effectLayer.appendChild(item);
    item.addEventListener(
      'animationend',
      (event) => {
        if (event.target === item) {
          item.remove();
        }
      },
      { once: true }
    );
    window.setTimeout(() => item.remove(), Math.ceil(effectConfig.duration * 1000) + 300);
    toast.textContent = `${message.user} ${gift.toast}，本场第 ${message.count || 1} 个`;
    recordEffectBurst(message.effect);
  }

  function getEffectConfig(gift) {
    const side = Math.random() > 0.5 ? 1 : -1;
    const random = (min, max) => min + Math.random() * (max - min);

    if (gift.id === 'rose') {
      return {
        left: 'calc(100vw + 54px)',
        bottom: `${random(8, 28)}vh`,
        arcHeight: `${-(28 + Math.random() * 20)}vh`,
        riseHeight: '0vh',
        driftX: '0vw',
        throwX: '-112vw',
        duration: random(1.45, 1.95)
      };
    }

    if (gift.motion === 'throw' || gift.motion === 'bloom') {
      return {
        left: '-54px',
        bottom: `${random(8, 28)}vh`,
        arcHeight: `${-(28 + Math.random() * 20)}vh`,
        riseHeight: '0vh',
        driftX: '0vw',
        throwX: '112vw',
        duration: random(1.45, 1.95)
      };
    }

    const configs = {
      pulse: {
        left: `${random(18, 82)}vw`,
        bottom: `${random(16, 44)}vh`,
        riseHeight: `${-random(3, 8)}vh`,
        driftX: `${side * random(1, 4)}vw`,
        fallY: '0vh',
        duration: random(1.05, 1.3)
      },
      float: {
        left: `${random(12, 86)}vw`,
        bottom: '-24px',
        riseHeight: `${-random(48, 68)}vh`,
        driftX: `${side * random(5, 13)}vw`,
        fallY: `${-random(40, 56)}vh`,
        duration: random(1.85, 2.35)
      },
      sparkle: {
        left: `${random(18, 82)}vw`,
        bottom: `${random(26, 70)}vh`,
        riseHeight: '0vh',
        driftX: '0vw',
        fallY: '0vh',
        duration: random(0.9, 1.15)
      },
      burst: {
        left: `${random(18, 82)}vw`,
        bottom: '-28px',
        riseHeight: `${-random(36, 52)}vh`,
        driftX: `${side * random(4, 12)}vw`,
        fallY: `${-random(18, 30)}vh`,
        duration: random(1.25, 1.55)
      }
    };

    return {
      arcHeight: '0vh',
      throwX: '0vw',
      ...configs[gift.motion]
    };
  }

  function addEffectParticles(item, gift) {
    const particleCount = {
      pulse: 3,
      float: 5,
      sparkle: 7,
      burst: 9
    }[gift.motion] || 0;

    for (let index = 0; index < particleCount; index += 1) {
      const particle = document.createElement('span');
      const angle = (360 / particleCount) * index + Math.random() * 20;
      const distance = getParticleDistance(gift, Math.random());
      const delay = Math.random() * 0.22;

      particle.className = 'effect-particle';
      particle.textContent = getParticleIcon(gift, index);
      particle.style.setProperty('--particle-x', `${Math.cos((angle * Math.PI) / 180) * distance}px`);
      particle.style.setProperty('--particle-y', `${Math.sin((angle * Math.PI) / 180) * distance}px`);
      particle.style.setProperty('--particle-delay', `${delay}s`);
      item.appendChild(particle);
    }
  }

  function getParticleDistance(gift, value) {
    if (gift.motion === 'pulse') {
      return 18 + value * 18;
    }

    if (gift.motion === 'burst') {
      return 34 + value * 42;
    }

    return 24 + value * 34;
  }

  function getParticleIcon(gift, index) {
    if (gift.motion === 'burst') {
      return ['•', '✦', '●'][index % 3];
    }

    if (gift.motion === 'sparkle') {
      return index % 2 ? '✦' : '·';
    }

    if (gift.motion === 'float') {
      return '♥';
    }

    if (gift.motion === 'pulse') {
      return '〰';
    }

    return '•';
  }

  function updateStats(stats) {
    lastStats = stats;
    const danmu = Number(stats?.danmu || 0);
    const giftStats = stats?.gifts || {};
    const giftTotal = giftList.reduce((total, gift) => total + Number(giftStats[gift.id] || 0), 0);
    const topGift = giftList.reduce(
      (top, gift) => {
        const count = Number(giftStats[gift.id] || 0);
        return count > top.count ? { gift, count } : top;
      },
      { gift: giftList[0], count: 0 }
    );

    setCount(giftCount, giftTotal);
    setTopGift(topGift.gift, topGift.count);
    setCount(heatCount, giftTotal + danmu);
  }

  function setTopGift(gift, count) {
    if (!gift) {
      setCount(topGiftCount, 0);
      return;
    }

    topGiftIcon.textContent = gift.icon;
    topGiftLabel.textContent = gift.name;
    setCount(topGiftCount, count);
  }

  function setCount(element, value) {
    if (element.textContent === String(value)) {
      return;
    }

    element.textContent = value;
    const item = element.closest('.score-item');
    item.classList.remove('is-bumping');
    void item.offsetWidth;
    item.classList.add('is-bumping');
    window.setTimeout(() => item.classList.remove('is-bumping'), 280);
  }

  function recordEffectBurst(effect) {
    const now = Date.now();
    recentEffects.push({ effect, time: now });

    while (recentEffects.length && now - recentEffects[0].time > 4800) {
      recentEffects.shift();
    }

    if (recentEffects.length >= 5) {
      const counts = recentEffects.reduce((result, item) => {
        result[item.effect] = (result[item.effect] || 0) + 1;
        return result;
      }, {});
      const [effect, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [];
      const gift = giftsById[effect];
      const label = gift && count >= Math.ceil(recentEffects.length / 2) ? gift.combo : '现场互动爆发';
      showComboBadge(`${label} x${recentEffects.length}`);
    }
  }

  function showComboBadge(text) {
    comboBadge.textContent = text;
    comboBadge.hidden = false;
    comboBadge.style.animation = 'none';
    void comboBadge.offsetWidth;
    comboBadge.style.animation = '';
    window.clearTimeout(showComboBadge.timer);
    showComboBadge.timer = window.setTimeout(() => {
      comboBadge.hidden = true;
    }, 900);
  }

  function setGiftEffectsEnabled(enabled) {
    giftEffectsEnabled = enabled;
    localStorage.setItem(giftEffectsEnabledKey, String(enabled));
    giftToggle.textContent = enabled ? '礼物开' : '礼物关';
    giftToggle.classList.toggle('is-on', enabled);
    giftToggle.setAttribute('aria-pressed', String(enabled));

    if (!enabled) {
      effectLayer.textContent = '';
    }
  }

  function setAudienceMode(mode) {
    audienceMode = mode === 'reader' ? 'reader' : 'interaction';
    audienceModeToggle.textContent = audienceMode === 'reader' ? '允许阅读' : '仅互动';
    audienceModeToggle.classList.toggle('is-reader', audienceMode === 'reader');
    audienceModeToggle.setAttribute('aria-pressed', String(audienceMode === 'reader'));
  }

  async function toggleAudienceMode() {
    const nextMode = audienceMode === 'reader' ? 'interaction' : 'reader';

    try {
      const response = await fetch('/api/audience-mode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ mode: nextMode })
      });

      if (!response.ok) {
        throw new Error('Audience mode update failed');
      }

      setAudienceMode(nextMode);
      toast.textContent = nextMode === 'reader' ? '观众可以阅读当前 PDF' : '观众仅可参与互动';
    } catch (error) {
      toast.textContent = '观众模式切换失败';
    }
  }

  function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    websocket = new WebSocket(`${protocol}://${location.host}`);

    websocket.addEventListener('open', () => {
      websocket.send(JSON.stringify({ type: 'role', role: 'presenter' }));
      setConnectionStatus('已连接');
    });

    websocket.addEventListener('message', (event) => {
      let message;

      try {
        message = JSON.parse(event.data);
      } catch (error) {
        return;
      }

      if (message.type === 'danmu') {
        addDanmu(message);
      }

      if (message.type === 'effect') {
        addEffect(message);
      }

      if (message.type === 'stats') {
        updateStats(message.stats);
      }

      if (message.type === 'config' && message.status === 'gifts') {
        applyGifts(message.gifts);
      }

      if (message.type === 'document') {
        applyDocument(message.document);
      }

      if (message.type === 'system' && message.status === 'audience-mode') {
        setAudienceMode(message.mode);
      }

      if (message.type === 'system' && message.status === 'clients') {
        setAudienceCount(message.clients);
      }

      if (['poll-start', 'poll-update', 'poll-end', 'poll-state'].includes(message.type)) {
        renderPoll(message.poll);
      }
      if (message.type === 'poll-close') {
        renderPoll(null);
      }
    });

    websocket.addEventListener('close', () => {
      setConnectionStatus('重连中');
      setTimeout(connectWebSocket, 1200);
    });

    websocket.addEventListener('error', () => {
      setConnectionStatus('连接异常');
    });
  }

  function unlockPresenter() {
    passwordDialog.hidden = true;
    document.documentElement.requestFullscreen?.().catch(() => {});
  }

  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          password: passwordInput.value
        })
      });

      if (!response.ok) {
        throw new Error('Wrong password');
      }

      unlockPresenter();
      await loadDocument();
      await loadAudienceUrls();
    } catch (error) {
      passwordError.hidden = false;
      passwordInput.select();
    }
  });

  document.addEventListener('keydown', handlePdfKey);
  document.addEventListener('fullscreenchange', revealFullscreenUi);
  window.addEventListener('resize', revealFullscreenUi);
  window.addEventListener('pointermove', handleFullscreenPointer);
  pdfInput.addEventListener('change', () => uploadPdf(pdfInput.files?.[0]));
  pollStartButton.addEventListener('click', () => {
    const question = window.prompt('请输入投票问题');
    if (!question || !websocket || websocket.readyState !== WebSocket.OPEN) return;
    const options = window.prompt('请输入选项，用逗号分隔（至少 2 项）')?.split(',').map((item) => item.trim()).filter(Boolean);
    if (!options || options.length < 2) return;
    websocket.send(JSON.stringify({ type: 'poll-start', question, options }));
  });
  pollEndButton.addEventListener('click', () => websocket?.send(JSON.stringify({ type: 'poll-end' })));
  pdfRemove.addEventListener('click', async () => {
    if (!documentInfo?.available || !window.confirm('确定移除当前 PDF 吗？')) {
      return;
    }

    const response = await fetch('/api/document', { method: 'DELETE' });
    if (response.ok) {
      applyDocument((await response.json()).document);
      toast.textContent = '当前 PDF 已移除';
    } else {
      toast.textContent = 'PDF 移除失败';
    }
  });
  audienceModeToggle.addEventListener('click', toggleAudienceMode);
  qrToggle.addEventListener('click', () => setQrExpanded(qrCard.hidden));
  qrClose.addEventListener('click', () => setQrExpanded(false));
  qrUrlSelect.addEventListener('change', () => renderQrCode(qrUrlSelect.value));
  qrUrlInput.addEventListener('input', () => renderQrCode(qrUrlInput.value));
  qrSave.addEventListener('click', () => {
    const url = normalizeAudienceUrl(qrUrlInput.value);
    localStorage.setItem(manualAudienceUrlKey, url);
    setAudienceUrlOptions([url, ...Array.from(qrUrlSelect.options).map((option) => option.value)]);
    renderQrCode(url);
    setQrHint('已保存手动地址，刷新后会优先使用。');
  });
  qrImage.addEventListener('error', () => {
    setQrHint('二维码生成失败，请检查地址后重试。', 'is-warning');
  });
  giftToggle.addEventListener('click', () => setGiftEffectsEnabled(!giftEffectsEnabled));
  setGiftEffectsEnabled(giftEffectsEnabled);
  setAudienceMode(audienceMode);
  revealFullscreenUi();

  Promise.all([checkSession(), loadGifts()]).then(async ([authenticated]) => {
    if (authenticated) {
      passwordDialog.hidden = true;
      await loadDocument();
      await loadAudienceUrls();
    }
    connectWebSocket();
  });
})();
