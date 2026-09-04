(function () {
  const connectionStatus = document.getElementById('connectionStatus');
  const nickname = document.getElementById('nickname');
  const messageInput = document.getElementById('messageInput');
  const sendButton = document.getElementById('sendButton');
  const effectGrid = document.getElementById('effectGrid');
  const readerPanel = document.getElementById('readerPanel');
  const downloadButton = document.getElementById('downloadButton');
  const interactionPanel = document.getElementById('interactionPanel');
  const interactionTab = document.getElementById('interactionTab');
  const readerTab = document.getElementById('readerTab');
  const pollDialog = document.getElementById('pollDialog');
  const pollQuestion = document.getElementById('pollQuestion');
  const pollOptions = document.getElementById('pollOptions');
  const pollStatus = document.getElementById('pollStatus');
  let activePoll = null;
  const pdfReader = new window.ContinuousPdfReader({
    container: document.getElementById('readerViewport'),
    emptyState: document.getElementById('readerEmpty')
  });
  let giftList = [];
  let giftsById = {};
  let effectControls = [];
  const controls = [sendButton];
  let documentInfo = { available: false, audienceMode: 'reader' };

  const danmuCooldownMs = 1300;
  const effectTapGapMs = 150;
  let websocket;
  let danmuCooldownTimer;
  let lastEffectTapAt = 0;
  let activeView = 'interaction';
  const identityStorageKey = 'live-share-identity';
  let identity = loadIdentity();

  function loadIdentity() {
    try {
      const saved = JSON.parse(localStorage.getItem(identityStorageKey) || 'null');
      return saved && typeof saved === 'object' ? saved : { userId: '', nickname: '' };
    } catch (error) {
      return { userId: '', nickname: '' };
    }
  }

  function saveIdentity(nextIdentity) {
    identity = nextIdentity;
    localStorage.setItem(identityStorageKey, JSON.stringify(identity));
    nickname.value = identity.nickname || '';
  }

  function renderGiftButtons() {
    effectGrid.textContent = '';
    effectControls = [];
    controls.length = 1;

    giftList.forEach((gift) => {
      const button = document.createElement('button');
      const icon = document.createElement('span');
      const label = document.createElement('strong');

      button.className = `effect-button gift-${gift.id}`;
      button.type = 'button';
      button.style.setProperty('--gift-start', gift.colors[0]);
      button.style.setProperty('--gift-end', gift.colors[1]);
      button.disabled = true;
      icon.textContent = gift.icon;
      label.textContent = gift.action;

      button.append(icon, label);
      button.addEventListener('click', () => sendGift(gift));
      effectGrid.appendChild(button);
      effectControls.push(button);
      controls.push(button);
    });
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
      setStatus('互动配置异常', 'is-offline');
    }
  }

  function applyGifts(nextGifts) {
    giftList = Array.isArray(nextGifts) ? nextGifts : [];
    giftsById = Object.fromEntries(giftList.map((gift) => [gift.id, gift]));
    renderGiftButtons();
    effectControls.forEach((control) => {
      control.disabled = !isConnected();
    });
  }

  function applyDocumentState(nextDocument) {
    documentInfo = nextDocument || { available: false, audienceMode: 'reader' };

    readerPanel.hidden = !documentInfo.available || activeView !== 'reader';
    interactionPanel.hidden = activeView !== 'interaction';
    readerTab.disabled = !documentInfo.available;
    downloadButton.hidden = !documentInfo.available;
    updateViewState(activeView);

    if (!documentInfo.available) {
      pdfReader.clear();
      return;
    }

    pdfReader.load(`/document/current.pdf?v=${encodeURIComponent(documentInfo.updatedAt || Date.now())}`);
  }

  async function loadDocumentState() {
    try {
      const response = await fetch('/api/document');
      if (!response.ok) {
        throw new Error('Document status failed');
      }

      applyDocumentState(await response.json());
    } catch (error) {
      applyDocumentState({ available: false, audienceMode: 'reader' });
    }
  }

  function getUser() {
    return (nickname.value || '匿名').replace(/\s+/g, ' ').trim().slice(0, 18) || '匿名';
  }

  function setStatus(text, className) {
    if (!connectionStatus) {
      return;
    }

    connectionStatus.textContent = text;
    connectionStatus.className = `status ${className || ''}`.trim();
  }

  function isConnected() {
    return websocket?.readyState === WebSocket.OPEN;
  }

  function showPoll(poll) {
    activePoll = poll;
    pollDialog.hidden = !poll;
    if (!poll) return;
    pollQuestion.textContent = poll.question;
    pollOptions.textContent = '';
    poll.options.forEach((option, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = option;
      button.addEventListener('click', () => { websocket?.send(JSON.stringify({ type: 'poll-vote', optionIndex: index })); pollStatus.textContent = '已提交'; [...pollOptions.children].forEach((item) => { item.disabled = true; }); });
      pollOptions.appendChild(button);
    });
    pollStatus.textContent = poll.ended ? '投票已结束' : '';
  }

  function setDanmuCooldown() {
    sendButton.disabled = true;

    clearTimeout(danmuCooldownTimer);
    danmuCooldownTimer = setTimeout(() => {
      sendButton.disabled = !isConnected();
    }, danmuCooldownMs);
  }

  function send(payload, options = {}) {
    if (!isConnected()) {
      setStatus('未连接', 'is-offline');
      return;
    }

    websocket.send(JSON.stringify({ ...payload, user: getUser() }));

    if (options.cooldown === 'danmu') {
      setDanmuCooldown();
    }
  }

  function sendGift(gift) {
    if (Date.now() - lastEffectTapAt < effectTapGapMs) {
      return;
    }

    lastEffectTapAt = Date.now();
    send({ type: 'effect', effect: gift.id });
  }

  function setActiveView(view) {
    activeView = view === 'reader' ? 'reader' : 'interaction';
    updateViewState(activeView);

    if (activeView === 'reader' && documentInfo.available) {
      readerPanel.hidden = false;
      pdfReader.load(`/document/current.pdf?v=${encodeURIComponent(documentInfo.updatedAt || Date.now())}`);
    }
  }

  function updateViewState(view) {
    const isReader = view === 'reader';
    interactionPanel.hidden = isReader;
    readerPanel.hidden = !isReader || !documentInfo.available;
    interactionTab.classList.toggle('is-active', !isReader);
    readerTab.classList.toggle('is-active', isReader);
    interactionTab.setAttribute('aria-selected', String(!isReader));
    readerTab.setAttribute('aria-selected', String(isReader));
  }

  function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    websocket = new WebSocket(`${protocol}://${location.host}`);

    controls.forEach((control) => {
      control.disabled = true;
    });

    websocket.addEventListener('open', () => {
      websocket.send(JSON.stringify({ type: 'role', role: 'audience' }));
      websocket.send(JSON.stringify({ type: 'identify', userId: identity.userId, nickname: getUser() }));
      setStatus('已连接', 'is-online');
      sendButton.disabled = false;
      effectControls.forEach((control) => {
        control.disabled = false;
      });
    });

    websocket.addEventListener('message', (event) => {
      let message;

      try {
        message = JSON.parse(event.data);
      } catch (error) {
        return;
      }

      if (message.type === 'system' && message.status === 'cooldown' && message.scope === 'danmu') {
        setStatus('稍后再发', '');
      }

      if (message.type === 'identity' && message.user) {
        saveIdentity(message.user);
      }

      if (message.type === 'config' && message.status === 'gifts') {
        applyGifts(message.gifts);
      }

      if (message.type === 'document') {
        applyDocumentState(message.document);
      }

      if (message.type === 'system' && message.status === 'audience-mode') {
        applyDocumentState({ ...documentInfo, audienceMode: message.mode });
      }
      if (['poll-start', 'poll-state'].includes(message.type)) showPoll(message.poll);
      if (message.type === 'poll-end') showPoll(null);
      if (message.type === 'poll-voted') pollStatus.textContent = '已提交';
      if (message.type === 'poll-close') showPoll(null);
    });

    websocket.addEventListener('close', () => {
      setStatus('重连中', 'is-offline');
      controls.forEach((control) => {
        control.disabled = true;
      });
      setTimeout(connectWebSocket, 1200);
    });

    websocket.addEventListener('error', () => {
      setStatus('连接异常', 'is-offline');
    });
  }

  sendButton.addEventListener('click', () => {
    const content = messageInput.value.replace(/\s+/g, ' ').trim().slice(0, 80);

    if (!content) {
      messageInput.focus();
      return;
    }

    send({ type: 'danmu', content }, { cooldown: 'danmu' });
    messageInput.value = '';
    messageInput.focus();
  });

  nickname.value = identity.nickname || '';
  nickname.addEventListener('change', () => {
    if (identity.userId && isConnected()) {
      websocket.send(JSON.stringify({ type: 'identify', userId: identity.userId, nickname: getUser() }));
    }
  });

  messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendButton.click();
    }
  });

  interactionTab.addEventListener('click', () => setActiveView('interaction'));
  readerTab.addEventListener('click', () => setActiveView('reader'));

  Promise.all([loadGifts(), loadDocumentState()]).then(() => {
    setActiveView('interaction');
    connectWebSocket();
  });
})();
