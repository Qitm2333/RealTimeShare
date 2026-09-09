(function () {
  const connectionStatus = document.getElementById('connectionStatus');
  const nickname = document.getElementById('nickname');
  const messageInput = document.getElementById('messageInput');
  const sendButton = document.getElementById('sendButton');
  const quickPhraseGrid = document.getElementById('quickPhraseGrid');
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
  const identityDialog = document.getElementById('identityDialog');
  const identityForm = document.getElementById('identityForm');
  const identityNickname = document.getElementById('identityNickname');
  const randomNickname = document.getElementById('randomNickname');
  const identitySubmit = document.getElementById('identitySubmit');
  const identityHint = document.getElementById('identityHint');
  const identityChip = document.getElementById('identityChip');
  const nicknameDisplay = document.getElementById('nicknameDisplay');
  const userIdDisplay = document.getElementById('userIdDisplay');
  let activePoll = null;
  let pendingVoteIndex = null;
  const pdfReader = new window.ContinuousPdfReader({
    container: document.getElementById('readerViewport'),
    emptyState: document.getElementById('readerEmpty')
  });
  let giftList = [];
  let giftsById = {};
  let effectControls = [];
  let quickPhraseList = [];
  let quickPhraseControls = [];
  const controls = [sendButton];
  let documentInfo = { available: false, audienceMode: 'reader' };

  const danmuCooldownMs = 1300;
  const quickPhraseCooldownMs = 950;
  const effectTapGapMs = 150;
  let websocket;
  let danmuCooldownTimer;
  let quickPhraseCooldownTimer;
  let lastEffectTapAt = 0;
  let activeView = 'interaction';
  const identityStorageKey = 'live-share-identity';
  let identity = loadIdentity();
  let identityReady = Boolean(identity.userId && identity.nickname);
  let identityConfirmed = false;
  let identitySubmitting = false;
  const randomNames = ['小星星', '小太阳', '小火花', '小月亮', '小海豚', '小树苗', '小鲸鱼', '小橘子'];

  function loadIdentity() {
    try {
      const saved = JSON.parse(localStorage.getItem(identityStorageKey) || 'null');
      if (!saved || typeof saved !== 'object') return { userId: '', nickname: '' };
      const savedNickname = String(saved.nickname || '').replace(/\s+/g, ' ').trim().slice(0, 18);
      const savedUserId = /^u_[a-f0-9]{16}$/.test(String(saved.userId || '')) ? String(saved.userId) : '';
      return savedNickname && savedUserId
        ? { userId: savedUserId, nickname: savedNickname }
        : { userId: '', nickname: savedNickname };
    } catch (error) {
      return { userId: '', nickname: '' };
    }
  }

  function saveIdentity(nextIdentity) {
    identity = nextIdentity;
    identityReady = Boolean(identity.userId && identity.nickname);
    identityConfirmed = identityReady;
    identitySubmitting = false;
    localStorage.setItem(identityStorageKey, JSON.stringify(identity));
    nickname.value = identity.nickname || '';
    nickname.readOnly = true;
    identityChip.hidden = !identityReady;
    nicknameDisplay.textContent = identity.nickname || '';
    const shortId = String(identity.userId || '').replace(/^u_/, '').slice(0, 6).toUpperCase();
    userIdDisplay.textContent = shortId ? `#${shortId}` : '';
    identityChip.title = identity.userId ? `当前身份：${identity.nickname} · ${identity.userId}` : '当前浏览器身份';
    updateIdentityDialogState();
  }

  function updateIdentityDialogState() {
    const hasPersistentIdentity = Boolean(identity.userId);
    const locked = hasPersistentIdentity || identitySubmitting;
    identityNickname.readOnly = locked;
    identityNickname.setAttribute('aria-readonly', String(locked));
    randomNickname.hidden = hasPersistentIdentity;
    randomNickname.disabled = locked;
    identitySubmit.disabled = identitySubmitting;
    identitySubmit.textContent = hasPersistentIdentity ? '确认身份' : '进入互动';
  }

  function renderGiftButtons() {
    effectGrid.textContent = '';
    effectControls = [];

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
    });
    rebuildControls();
  }

  function rebuildControls() {
    controls.length = 1;
    controls.push(...quickPhraseControls, ...effectControls);
  }

  function renderQuickPhraseButtons() {
    quickPhraseGrid.textContent = '';
    quickPhraseControls = [];

    quickPhraseList.forEach((phrase) => {
      const button = document.createElement('button');
      const image = document.createElement('img');
      button.className = 'quick-phrase-button';
      button.type = 'button';
      button.setAttribute('aria-label', phrase.text);
      button.title = phrase.text;
      button.disabled = true;
      image.src = phrase.image;
      image.alt = '';
      image.loading = 'lazy';
      button.appendChild(image);
      button.addEventListener('click', () => sendQuickPhrase(phrase));
      quickPhraseGrid.appendChild(button);
      quickPhraseControls.push(button);
    });
    rebuildControls();
  }

  async function loadQuickPhrases() {
    try {
      const response = await fetch('/api/quick-phrases');
      if (!response.ok) throw new Error('Quick phrase configuration failed');
      const data = await response.json();
      quickPhraseList = Array.isArray(data.phrases) ? data.phrases : [];
      renderQuickPhraseButtons();
      quickPhraseControls.forEach((control) => {
        control.disabled = !isConnected() || !identityConfirmed;
      });
    } catch (error) {
      quickPhraseList = [];
      quickPhraseGrid.textContent = '';
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
      setStatus('互动配置异常', 'is-offline');
    }
  }

  function applyGifts(nextGifts) {
    giftList = Array.isArray(nextGifts) ? nextGifts : [];
    giftsById = Object.fromEntries(giftList.map((gift) => [gift.id, gift]));
    renderGiftButtons();
    quickPhraseControls.forEach((control) => {
      control.disabled = !isConnected() || !identityConfirmed;
    });
    effectControls.forEach((control) => {
      control.disabled = !isConnected() || !identityConfirmed;
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
    activePoll = poll && poll.id ? poll : null;
    pollDialog.hidden = !activePoll || !identityConfirmed;
    pollDialog.setAttribute('aria-hidden', String(pollDialog.hidden));
    if (!activePoll) {
      pollQuestion.textContent = '';
      pollOptions.textContent = '';
      pollStatus.textContent = '';
      return;
    }
    pollQuestion.textContent = activePoll.question || '现场投票';
    pollOptions.textContent = '';
    const savedVotes = loadPollVotes();
    const hasVoted = Boolean(activePoll.hasVoted) || Object.prototype.hasOwnProperty.call(savedVotes, activePoll.id);
    const options = Array.isArray(activePoll.options) ? activePoll.options : [];
    options.forEach((option, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = option;
      button.disabled = hasVoted || pendingVoteIndex !== null || Boolean(activePoll.ended);
      button.classList.toggle('is-selected', Number(activePoll.selectedOptionIndex) === index || savedVotes[activePoll.id] === index);
      button.addEventListener('click', () => {
        if (!isConnected() || hasVoted || pendingVoteIndex !== null) return;
        pendingVoteIndex = index;
        pollStatus.textContent = '正在提交…';
        button.disabled = true;
        websocket.send(JSON.stringify({ type: 'poll-vote', pollId: activePoll.id, optionIndex: index }));
      });
      pollOptions.appendChild(button);
    });
    pollStatus.textContent = activePoll.ended ? '投票已结束' : hasVoted ? '已提交' : '';
  }

  function loadPollVotes() {
    try { return JSON.parse(localStorage.getItem('live-share-poll-votes') || '{}'); } catch (error) { return {}; }
  }

  function savePollVote(pollId, optionIndex) {
    const votes = loadPollVotes(); votes[pollId] = optionIndex; localStorage.setItem('live-share-poll-votes', JSON.stringify(votes));
  }

  function setDanmuCooldown() {
    sendButton.disabled = true;

    clearTimeout(danmuCooldownTimer);
    danmuCooldownTimer = setTimeout(() => {
      sendButton.disabled = !isConnected() || !identityConfirmed;
    }, danmuCooldownMs);
  }

  function setQuickPhraseCooldown() {
    quickPhraseControls.forEach((control) => { control.disabled = true; });
    clearTimeout(quickPhraseCooldownTimer);
    quickPhraseCooldownTimer = setTimeout(() => {
      quickPhraseControls.forEach((control) => {
        control.disabled = !isConnected() || !identityConfirmed;
      });
    }, quickPhraseCooldownMs);
  }

  function send(payload, options = {}) {
    if (!identityConfirmed) {
      showIdentityDialog();
      return;
    }
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

  function sendQuickPhrase(phrase) {
    if (!phrase || Date.now() - lastEffectTapAt < effectTapGapMs) return;
    lastEffectTapAt = Date.now();
    send({ type: 'quick-danmu', phraseId: phrase.id });
    setQuickPhraseCooldown();
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
    if (websocket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(websocket.readyState)) return;
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    websocket = new WebSocket(`${protocol}://${location.host}`);

    controls.forEach((control) => {
      control.disabled = true;
    });

    websocket.addEventListener('open', () => {
      websocket.send(JSON.stringify({ type: 'role', role: 'audience' }));
      if (identityReady) websocket.send(JSON.stringify({ type: 'identify', userId: identity.userId, nickname: getUser() }));
      setStatus('已连接', 'is-online');
      sendButton.disabled = !identityConfirmed;
      quickPhraseControls.forEach((control) => {
        control.disabled = !identityConfirmed;
      });
      effectControls.forEach((control) => {
        control.disabled = !identityConfirmed;
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

      if (message.type === 'system' && message.status === 'cooldown' && message.scope === 'quick-danmu') {
        setStatus('快捷用语冷却中', '');
      }

      if (message.type === 'identity' && message.user) {
        saveIdentity(message.user);
        identityDialog.hidden = true;
        identityDialog.setAttribute('aria-hidden', 'true');
        controls.forEach((control) => { control.disabled = false; });
        if (activePoll) showPoll(activePoll);
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
      if (message.type === 'poll-end') { pendingVoteIndex = null; showPoll(null); }
      if (message.type === 'poll-voted') { pendingVoteIndex = null; savePollVote(message.pollId, message.optionIndex); if (activePoll) showPoll({ ...activePoll, hasVoted: true, selectedOptionIndex: message.optionIndex }); }
      if (message.type === 'poll-vote-rejected') {
        pendingVoteIndex = null;
        if (message.reason === 'already-voted' && activePoll) {
          savePollVote(message.pollId, message.optionIndex);
          showPoll({ ...activePoll, hasVoted: true, selectedOptionIndex: message.optionIndex });
        } else if (activePoll) {
          showPoll(activePoll);
          pollStatus.textContent = message.reason === 'invalid-vote' ? '投票已失效，请重新选择' : '提交失败，请重试';
        }
      }
      if (message.type === 'poll-close') { pendingVoteIndex = null; showPoll(null); }
      if (message.type === 'system' && message.status === 'identity-required') {
        identityConfirmed = false;
        identitySubmitting = false;
        controls.forEach((control) => { control.disabled = true; });
        showIdentityDialog();
      }
    });

    websocket.addEventListener('close', () => {
      setStatus('重连中', 'is-offline');
      controls.forEach((control) => {
        control.disabled = true;
      });
      identityConfirmed = false;
      if (identitySubmitting) {
        identitySubmitting = false;
        updateIdentityDialogState();
        if (!identity.userId) showIdentityDialog();
      }
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
  updateIdentityDialogState();
  if (identityReady) {
    identityChip.hidden = false;
    nicknameDisplay.textContent = identity.nickname;
    userIdDisplay.textContent = `#${String(identity.userId).replace(/^u_/, '').slice(0, 6).toUpperCase()}`;
    identityChip.title = `当前身份：${identity.nickname} · ${identity.userId}`;
  }

  function showIdentityDialog() {
    identityDialog.hidden = false;
    identityDialog.setAttribute('aria-hidden', 'false');
    identityHint.textContent = identity.userId ? '此浏览器已绑定现场身份，昵称不可修改。' : identitySubmitting ? '正在确认你的身份，请稍候。' : '请输入昵称，之后会自动记住你的身份。';
    identityNickname.value = identity.nickname || nickname.value || '';
    updateIdentityDialogState();
    window.setTimeout(() => identityNickname.focus(), 0);
  }

  function makeRandomNickname() {
    const name = `${randomNames[Math.floor(Math.random() * randomNames.length)]}${Math.floor(100 + Math.random() * 900)}`;
    identityNickname.value = name;
  }

  identityForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (identitySubmitting) return;
    const nextNickname = identityNickname.value.replace(/\s+/g, ' ').trim().slice(0, 18);
    if (!nextNickname) return;
    if (identity.userId && nextNickname !== identity.nickname) {
      identityNickname.value = identity.nickname;
      return;
    }
    nickname.value = nextNickname;
    identity.nickname = nextNickname;
    identityReady = Boolean(nextNickname);
    identityConfirmed = false;
    identitySubmitting = true;
    identityHint.textContent = '正在确认你的身份…';
    updateIdentityDialogState();
    controls.forEach((control) => { control.disabled = true; });
    if (isConnected()) {
      websocket.send(JSON.stringify({ type: 'identify', userId: identity.userId || '', nickname: nextNickname }));
    } else {
      identityHint.textContent = '等待连接现场…';
    }
  });
  randomNickname.addEventListener('click', makeRandomNickname);

  messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendButton.click();
    }
  });

  interactionTab.addEventListener('click', () => setActiveView('interaction'));
  readerTab.addEventListener('click', () => setActiveView('reader'));

  Promise.all([loadGifts(), loadQuickPhrases(), loadDocumentState()]).then(() => {
    setActiveView('interaction');
    if (!identityReady) showIdentityDialog();
    connectWebSocket();
  });

  nickname.readOnly = true;
})();
