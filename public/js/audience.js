(function () {
  const connectionStatus = document.getElementById('connectionStatus');
  const nickname = document.getElementById('nickname');
  const messageInput = document.getElementById('messageInput');
  const sendButton = document.getElementById('sendButton');
  const freeDanmuComposer = document.getElementById('freeDanmuComposer');
  const danmuModeHint = document.getElementById('danmuModeHint');
  const quickPhraseGrid = document.getElementById('quickPhraseGrid');
  const effectGrid = document.getElementById('effectGrid');
  const quickPhraseTitle = document.getElementById('quickPhraseTitle');
  const interactionPanel = document.getElementById('interactionPanel');
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
  const lotteryWinnerAck = document.getElementById('lotteryWinnerAck');
  const lotteryWinnerName = document.getElementById('lotteryWinnerName');
  const lotteryWinnerId = document.getElementById('lotteryWinnerId');
  let activePoll = null;
  let pendingVoteIndices = null;
  let selectedVoteIndices = [];
  let voteSuccessTimer = 0;
  let giftList = [];
  let giftsById = {};
  let effectControls = [];
  let quickPhraseList = [];
  let quickPhraseControls = [];
  const controls = [sendButton];
  const danmuCooldownMs = 3000;
  const quickPhraseCooldownMs = 950;
  const effectTapGapMs = 150;
  let websocket;
  let danmuCooldownTimer;
  let danmuCooldownEndsAt = 0;
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
  let danmuMode = 'free';
  let presetDanmuText = '';
  const sensoryAdjectives = ['美味的', '香甜的', '酥脆的', '冰凉的', '温热的', '柔软的', '清新的', '辛辣的', '酸爽的', '浓郁的', '丝滑的', '闪亮的', '轻盈的', '热烈的', '安静的', '迷人的', '巧克力味的', '薄荷味的', '奶油香的', '阳光晒过的'];
  const sensoryObjects = ['烧鸡', '西瓜', '巧克力', '柠檬', '爆米花', '云朵', '月亮', '蜜桃', '海盐', '可颂', '草莓', '雪糕', '咖啡', '橘子', '薯片', '葡萄', '芒果', '奶酪', '棉花糖', '小夜灯'];

  function loadIdentity() {
    try {
      const saved = JSON.parse(localStorage.getItem(identityStorageKey) || 'null');
      if (!saved || typeof saved !== 'object') return { userId: '', nickname: '' };
      const savedNickname = String(saved.nickname || '').replace(/\s+/g, ' ').trim().slice(0, 18);
      const savedUserId = /^u_[a-f0-9]{16}$/.test(String(saved.userId || '')) ? String(saved.userId) : '';
      const savedSessionId = typeof saved.sessionId === 'string' ? saved.sessionId : '';
      return savedNickname && savedUserId
        ? { userId: savedUserId, nickname: savedNickname, sessionId: savedSessionId }
        : { userId: '', nickname: savedNickname, sessionId: savedSessionId };
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
      button.className = 'quick-phrase-button';
      button.type = 'button';
      button.setAttribute('aria-label', phrase.text);
      button.title = phrase.text;
      button.disabled = true;
      if (phrase.image) {
        const image = document.createElement('img');
        image.src = phrase.image;
        image.alt = '';
        image.loading = 'lazy';
        button.appendChild(image);
      } else {
        button.classList.add('is-text');
        button.textContent = phrase.text;
      }
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

  function applyDanmuMode(mode) {
    danmuMode = mode === 'preset' ? 'preset' : 'free';
    const presetMode = danmuMode === 'preset';
    freeDanmuComposer.hidden = false;
    messageInput.readOnly = presetMode;
    messageInput.setAttribute('aria-readonly', String(presetMode));
    if (presetMode) {
      messageInput.value = presetDanmuText;
      messageInput.placeholder = '等待演讲者设置预设弹幕';
    } else {
      messageInput.value = '';
      messageInput.placeholder = '发一句现场弹幕';
    }
    quickPhraseTitle.textContent = '高级预设弹幕';
    danmuModeHint.textContent = '点击发送图片弹幕';
    quickPhraseGrid.setAttribute('aria-label', '高级预设弹幕列表');
    refreshDanmuCooldown();
  }

  function applyPresetDanmu(text) {
    presetDanmuText = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (danmuMode === 'preset') messageInput.value = presetDanmuText;
    refreshDanmuCooldown();
  }

  function isConnected() {
    return websocket?.readyState === WebSocket.OPEN;
  }

  function showPoll(poll) {
    const previousPollId = activePoll?.id || null;
    activePoll = poll && poll.id ? poll : null;
    if (activePoll?.id !== previousPollId) {
      selectedVoteIndices = [];
      pendingVoteIndices = null;
    }
    if (!activePoll) {
      window.clearTimeout(voteSuccessTimer);
      selectedVoteIndices = [];
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
      selectedVoteIndices = [];
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
    const maxSelections = Math.min(Math.max(1, Number(activePoll.maxSelections) || 1), Math.max(1, options.length));
    selectedVoteIndices = selectedVoteIndices.filter((index) => Number.isInteger(index) && index >= 0 && index < options.length).slice(0, maxSelections);
    const updateSelectionState = () => {
      pollOptions.querySelectorAll('button').forEach((optionButton, optionIndex) => {
        optionButton.classList.toggle('is-selected', selectedVoteIndices.includes(optionIndex));
        optionButton.setAttribute('aria-pressed', String(selectedVoteIndices.includes(optionIndex)));
      });
      const complete = selectedVoteIndices.length === maxSelections;
      pollSubmit.disabled = !complete;
      pollStatus.textContent = maxSelections === 1
        ? selectedVoteIndices.length ? '已选择，请提交' : ''
        : complete
          ? `已选 ${maxSelections} 项，请提交`
          : `请选择 ${maxSelections} 项（已选 ${selectedVoteIndices.length} 项）`;
    };
    options.forEach((option, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = option;
      button.disabled = hasVoted || pendingVoteIndices !== null || Boolean(activePoll.ended);
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        if (!isConnected() || hasVoted || pendingVoteIndices !== null) return;
        if (selectedVoteIndices.includes(index)) {
          selectedVoteIndices = selectedVoteIndices.filter((selectedIndex) => selectedIndex !== index);
        } else if (maxSelections === 1) {
          selectedVoteIndices = [index];
        } else if (selectedVoteIndices.length < maxSelections) {
          selectedVoteIndices = [...selectedVoteIndices, index];
        }
        updateSelectionState();
      });
      pollOptions.appendChild(button);
    });
    updateSelectionState();
  }

  function submitVote() {
    const required = Math.min(Math.max(1, Number(activePoll?.maxSelections) || 1), Math.max(1, activePoll?.options?.length || 1));
    if (!activePoll || selectedVoteIndices.length !== required || pendingVoteIndices !== null || !isConnected()) return;
    pendingVoteIndices = selectedVoteIndices.slice();
    pollSubmit.disabled = true;
    pollOptions.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    pollStatus.textContent = '正在提交…';
    websocket.send(JSON.stringify({ type: 'poll-vote', pollId: activePoll.id, optionIndices: pendingVoteIndices }));
  }

  function showVoteSuccess(pollId, optionIndices) {
    const selections = Array.isArray(optionIndices) ? optionIndices : [optionIndices].filter(Number.isInteger);
    savePollVote(pollId, selections);
    pendingVoteIndices = null;
    selectedVoteIndices = selections;
    pollDialog.hidden = false;
    pollDialog.setAttribute('aria-hidden', 'false');
    pollOptions.querySelectorAll('button').forEach((button, index) => {
      button.disabled = true;
      button.classList.toggle('is-selected', selectedVoteIndices.includes(index));
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

  function savePollVote(pollId, optionIndices) {
    const votes = loadPollVotes(); votes[pollId] = optionIndices; localStorage.setItem('live-share-poll-votes', JSON.stringify(votes));
  }

  function refreshDanmuCooldown() {
    window.clearTimeout(danmuCooldownTimer);
    const remainingMs = Math.max(0, danmuCooldownEndsAt - Date.now());
    sendButton.disabled = remainingMs > 0 || !isConnected() || !identityConfirmed || (danmuMode === 'preset' && !presetDanmuText);
    sendButton.textContent = remainingMs ? `发送 ${Math.ceil(remainingMs / 1000)}s` : '发送';
    if (remainingMs) {
      sendButton.setAttribute('aria-label', `弹幕冷却中，还需 ${Math.ceil(remainingMs / 1000)} 秒`);
      danmuCooldownTimer = window.setTimeout(refreshDanmuCooldown, Math.min(250, remainingMs));
    } else {
      sendButton.removeAttribute('aria-label');
    }
  }

  function setDanmuCooldown(durationMs = danmuCooldownMs) {
    danmuCooldownEndsAt = Date.now() + durationMs;
    refreshDanmuCooldown();
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
    if (payload?.type === 'danmu' && Date.now() < danmuCooldownEndsAt) {
      setStatus('弹幕冷却中，请稍后再发', '');
      return false;
    }
    if (!identityConfirmed) {
      showIdentityDialog();
      return false;
    }
    if (!isConnected()) {
      setStatus('未连接', 'is-offline');
      return false;
    }

    websocket.send(JSON.stringify({ ...payload, user: getUser() }));

    if (options.cooldown === 'danmu') {
      setDanmuCooldown();
    }
    return true;
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

  function connectWebSocket() {
    if (websocket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(websocket.readyState)) return;
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    websocket = new WebSocket(`${protocol}://${location.host}`);

    controls.forEach((control) => {
      control.disabled = true;
    });

    websocket.addEventListener('open', () => {
      websocket.send(JSON.stringify({ type: 'role', role: 'audience' }));
      if (identityReady) websocket.send(JSON.stringify({ type: 'identify', userId: identity.userId, nickname: getUser(), sessionId: identity.sessionId || '' }));
      setStatus('已连接', 'is-online');
      refreshDanmuCooldown();
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
        setDanmuCooldown(Number(message.retryAfterMs) || danmuCooldownMs);
      }

      if (message.type === 'system' && message.status === 'cooldown' && message.scope === 'quick-danmu') {
        setStatus('快捷用语冷却中', '');
      }

      if (message.type === 'config' && message.status === 'danmu-mode') {
        applyDanmuMode(message.mode);
      }

      if (message.type === 'config' && message.status === 'preset-danmu') {
        applyPresetDanmu(message.text);
      }

      if (message.type === 'config' && message.status === 'quick-phrases') {
        quickPhraseList = Array.isArray(message.phrases) ? message.phrases : [];
        renderQuickPhraseButtons();
        quickPhraseControls.forEach((control) => {
          control.disabled = !isConnected() || !identityConfirmed;
        });
      }

      if (message.type === 'system' && message.status === 'danmu-mode') {
        applyDanmuMode(message.mode);
        setStatus('预设弹幕已更新，请重新发送', '');
      }

      if (message.type === 'identity' && message.user) {
        saveIdentity(message.user);
        identityDialog.hidden = true;
        identityDialog.setAttribute('aria-hidden', 'true');
        controls.forEach((control) => { control.disabled = false; });
        refreshDanmuCooldown();
        if (activePoll) showPoll(activePoll);
      }

      if (message.type === 'config' && message.status === 'gifts') {
        applyGifts(message.gifts);
      }

      if (['poll-start', 'poll-state'].includes(message.type)) showPoll(message.poll);
      if (message.type === 'poll-end') { pendingVoteIndices = null; showPoll(null); }
      if (message.type === 'poll-voted') { showVoteSuccess(message.pollId, message.optionIndices); }
      if (message.type === 'poll-vote-rejected') {
        pendingVoteIndices = null;
        selectedVoteIndices = [];
        pollStatus.classList.remove('is-success');
        if (message.reason === 'already-voted' && activePoll) {
          savePollVote(message.pollId, message.optionIndices || []);
          showPoll(null);
        } else if (activePoll) {
          showPoll(activePoll);
          pollStatus.textContent = message.reason === 'invalid-vote' ? '投票已失效，请重新选择' : '提交失败，请重试';
        }
      }
      if (message.type === 'poll-close') { pendingVoteIndices = null; showPoll(null); }
      if (message.type === 'lottery-result') showLotteryWinner(message.result);
      if (message.type === 'system' && message.status === 'identity-required') {
        identityConfirmed = false;
        identitySubmitting = false;
        controls.forEach((control) => { control.disabled = true; });
        showIdentityDialog();
      }
      if (message.type === 'system' && message.status === 'session-reset') {
        resetRequired = true;
        pendingVoteIndices = null;
        showPoll(null);
        controls.forEach((control) => { control.disabled = true; });
        localStorage.removeItem('live-share-identity');
        localStorage.removeItem('live-share-poll-votes');
        identity = { userId: '', nickname: '', sessionId: '' };
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
      pendingVoteIndices = null;
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

    if (send({ type: 'danmu', content }, { cooldown: 'danmu' }) && danmuMode === 'free') messageInput.value = '';
    messageInput.focus();
  });

  pollSubmit.addEventListener('click', submitVote);

  nickname.value = identity.nickname || '';
  applyDanmuMode('free');
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
    const shortId = winner.shortId || String(winner.userId || '').replace(/^u_/, '').slice(0, 6).toUpperCase() || '未知';
    lotteryWinnerName.textContent = winner.nickname || '匿名';
    if (lotteryWinnerId) lotteryWinnerId.textContent = `ID ${shortId}`;
    lotteryWinnerDialog.hidden = false;
    lotteryWinnerDialog.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => lotteryWinnerAck?.focus(), 0);
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
      websocket.send(JSON.stringify({ type: 'identify', userId: identity.userId || '', nickname: nextNickname, randomNickname: randomNicknameRequested, sessionId: identity.sessionId || '' }));
    } else {
      identityHint.textContent = '等待连接现场…';
    }
  });
  randomNickname.addEventListener('click', makeRandomNickname);
  identityNickname.addEventListener('input', () => {
    randomNicknameRequested = false;
  });
  lotteryWinnerAck?.addEventListener('click', hideLotteryWinner);

  messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendButton.click();
    }
  });

  Promise.all([loadGifts(), loadQuickPhrases()]).then(() => {
    if (!identityReady) showIdentityDialog();
    connectWebSocket();
  });

  nickname.readOnly = true;
})();
