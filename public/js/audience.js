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
  const pollSubmit = document.getElementById('pollSubmit');
  const identityDialog = document.getElementById('identityDialog');
  const identityForm = document.getElementById('identityForm');
  const identityNickname = document.getElementById('identityNickname');
  const randomNickname = document.getElementById('randomNickname');
  const identitySubmit = document.getElementById('identitySubmit');
  const identityHint = document.getElementById('identityHint');
  const identityChip = document.getElementById('identityChip');
  const nicknameDisplay = document.getElementById('nicknameDisplay');
  const userIdDisplay = document.getElementById('userIdDisplay');
  const lotteryWinnerDialog = document.getElementById('lotteryWinnerDialog');
  const lotteryWinnerClose = document.getElementById('lotteryWinnerClose');
  const lotteryWinnerName = document.getElementById('lotteryWinnerName');
  let activePoll = null;
  let pendingVoteIndex = null;
  let selectedVoteIndex = null;
  let voteSuccessTimer = 0;
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
  let resetRequired = false;
  let randomNicknameRequested = false;
  const sensoryAdjectives = ['美味的', '香甜的', '酥脆的', '冰凉的', '温热的', '柔软的', '清新的', '辛辣的', '酸爽的', '浓郁的', '丝滑的', '闪亮的', '轻盈的', '热烈的', '安静的', '迷人的', '巧克力味的', '薄荷味的', '奶油香的', '阳光晒过的'];
  const sensoryObjects = ['烧鸡', '西瓜', '巧克力', '柠檬', '爆米花', '云朵', '月亮', '蜜桃', '海盐', '可颂', '草莓', '雪糕', '咖啡', '橘子', '薯片', '葡萄', '芒果', '奶酪', '棉花糖', '小夜灯'];

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
    randomNicknameRequested = false;
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
    const downloadDisabled = documentInfo.audienceMode !== 'reader';
    downloadButton.classList.toggle('is-disabled', downloadDisabled);
    downloadButton.setAttribute('aria-disabled', String(downloadDisabled));
    downloadButton.tabIndex = downloadDisabled ? -1 : 0;
    updateViewState(activeView);

    if (!documentInfo.available) {
      pdfReader.clear();
      return;
    }

    if (activeView === 'reader') {
      pdfReader.load(`/document/current.pdf?v=${encodeURIComponent(documentInfo.updatedAt || Date.now())}`);
    }
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
    if (!activePoll) {
      window.clearTimeout(voteSuccessTimer);
      selectedVoteIndex = null;
      pollDialog.hidden = true;
      pollDialog.setAttribute('aria-hidden', 'true');
      pollQuestion.textContent = '';
      pollOptions.textContent = '';
      pollStatus.textContent = '';
      pollStatus.classList.remove('is-success');
      return;
    }
    const savedVotes = loadPollVotes();
    const hasVoted = Boolean(activePoll.hasVoted) || Object.prototype.hasOwnProperty.call(savedVotes, activePoll.id);
    if (!identityConfirmed || hasVoted || activePoll.ended) {
      selectedVoteIndex = null;
      pollDialog.hidden = true;
      pollDialog.setAttribute('aria-hidden', 'true');
      return;
    }
    pollDialog.hidden = false;
    pollDialog.setAttribute('aria-hidden', 'false');
    pollQuestion.textContent = activePoll.question || '现场投票';
    pollOptions.textContent = '';
    pollStatus.classList.remove('is-success');
    const options = Array.isArray(activePoll.options) ? activePoll.options : [];
    if (selectedVoteIndex === null || selectedVoteIndex >= options.length) {
      selectedVoteIndex = null;
    }
    options.forEach((option, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = option;
      button.disabled = hasVoted || pendingVoteIndex !== null || Boolean(activePoll.ended);
      button.classList.toggle('is-selected', selectedVoteIndex === index);
      button.addEventListener('click', () => {
        if (!isConnected() || hasVoted || pendingVoteIndex !== null) return;
        selectedVoteIndex = index;
        pollOptions.querySelectorAll('button').forEach((optionButton, optionIndex) => {
          optionButton.classList.toggle('is-selected', optionIndex === selectedVoteIndex);
        });
        pollSubmit.disabled = false;
        pollStatus.textContent = '已选择，请提交';
      });
      pollOptions.appendChild(button);
    });
    pollSubmit.disabled = hasVoted || pendingVoteIndex !== null || activePoll.ended || selectedVoteIndex === null;
    pollStatus.textContent = activePoll.ended ? '投票已结束' : hasVoted ? '已提交' : selectedVoteIndex === null ? '' : '已选择，请提交';
  }

  function submitVote() {
    if (!activePoll || selectedVoteIndex === null || pendingVoteIndex !== null || !isConnected()) return;
    pendingVoteIndex = selectedVoteIndex;
    pollSubmit.disabled = true;
    pollOptions.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    pollStatus.textContent = '正在提交…';
    websocket.send(JSON.stringify({ type: 'poll-vote', pollId: activePoll.id, optionIndex: pendingVoteIndex }));
  }

  function showVoteSuccess(pollId, optionIndex) {
    savePollVote(pollId, optionIndex);
    pendingVoteIndex = null;
    selectedVoteIndex = optionIndex;
    pollDialog.hidden = false;
    pollDialog.setAttribute('aria-hidden', 'false');
    pollOptions.querySelectorAll('button').forEach((button, index) => {
      button.disabled = true;
      button.classList.toggle('is-selected', index === optionIndex);
    });
    pollSubmit.disabled = true;
    pollStatus.textContent = '投票成功';
    pollStatus.classList.add('is-success');
    window.clearTimeout(voteSuccessTimer);
    voteSuccessTimer = window.setTimeout(() => showPoll(null), 1400);
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
      if (message.type === 'poll-voted') { showVoteSuccess(message.pollId, message.optionIndex); }
      if (message.type === 'poll-vote-rejected') {
        pendingVoteIndex = null;
        selectedVoteIndex = null;
        pollStatus.classList.remove('is-success');
        if (message.reason === 'already-voted' && activePoll) {
          savePollVote(message.pollId, message.optionIndex);
          showPoll(null);
        } else if (activePoll) {
          showPoll(activePoll);
          pollStatus.textContent = message.reason === 'invalid-vote' ? '投票已失效，请重新选择' : '提交失败，请重试';
        }
      }
      if (message.type === 'poll-close') { pendingVoteIndex = null; showPoll(null); }
      if (message.type === 'lottery-result') showLotteryWinner(message.result);
      if (message.type === 'system' && message.status === 'identity-required') {
        identityConfirmed = false;
        identitySubmitting = false;
        controls.forEach((control) => { control.disabled = true; });
        showIdentityDialog();
      }
      if (message.type === 'system' && message.status === 'session-reset') {
        resetRequired = true;
        pendingVoteIndex = null;
        showPoll(null);
        controls.forEach((control) => { control.disabled = true; });
        localStorage.removeItem('live-share-identity');
        localStorage.removeItem('live-share-poll-votes');
        identity = { userId: '', nickname: '' };
        identityReady = false;
        identityConfirmed = false;
        identitySubmitting = false;
        identityChip.hidden = true;
        nickname.value = '';
        setStatus('现场已重置', 'is-offline');
        showIdentityDialog();
        websocket.close(4001, 'session-reset');
      }
    });

    websocket.addEventListener('close', () => {
      if (resetRequired) return;
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

  pollSubmit.addEventListener('click', submitVote);

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
    identityHint.textContent = resetRequired
      ? '现场已重置，请关闭本页面并重新扫码入场。'
      : identity.userId
        ? '此浏览器已绑定现场身份，昵称不可修改。'
        : identitySubmitting
          ? '正在确认你的身份，请稍候。'
          : '请输入昵称，之后会自动记住你的身份。';
    identityNickname.value = identity.nickname || nickname.value || '';
    updateIdentityDialogState();
    if (resetRequired) {
      identityNickname.readOnly = true;
      randomNickname.hidden = true;
      identitySubmit.disabled = true;
      identitySubmit.textContent = '请重新扫码';
    } else {
      window.setTimeout(() => identityNickname.focus(), 0);
    }
  }

  function showLotteryWinner(result) {
    const winners = Array.isArray(result?.winners) ? result.winners : [];
    const winner = winners.find((item) => item?.userId === identity.userId);
    if (!winner || !lotteryWinnerDialog) return;
    lotteryWinnerName.textContent = winner.nickname || '感官幸运用户';
    lotteryWinnerDialog.hidden = false;
    lotteryWinnerDialog.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => lotteryWinnerClose?.focus(), 0);
  }

  function hideLotteryWinner() {
    if (!lotteryWinnerDialog) return;
    lotteryWinnerDialog.hidden = true;
    lotteryWinnerDialog.setAttribute('aria-hidden', 'true');
  }

  function makeRandomNickname() {
    const adjective = sensoryAdjectives[Math.floor(Math.random() * sensoryAdjectives.length)];
    const object = sensoryObjects[Math.floor(Math.random() * sensoryObjects.length)];
    const name = `${adjective}${object}`;
    randomNicknameRequested = true;
    identityNickname.value = name;
  }

  identityForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (resetRequired) return;
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
      websocket.send(JSON.stringify({ type: 'identify', userId: identity.userId || '', nickname: nextNickname, randomNickname: randomNicknameRequested }));
    } else {
      identityHint.textContent = '等待连接现场…';
    }
  });
  randomNickname.addEventListener('click', makeRandomNickname);
  identityNickname.addEventListener('input', () => {
    randomNicknameRequested = false;
  });
  lotteryWinnerClose?.addEventListener('click', hideLotteryWinner);
  lotteryWinnerDialog?.addEventListener('click', (event) => {
    if (event.target === lotteryWinnerDialog) hideLotteryWinner();
  });

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
  downloadButton.addEventListener('click', (event) => {
    if (documentInfo?.audienceMode !== 'reader') event.preventDefault();
  });
})();
