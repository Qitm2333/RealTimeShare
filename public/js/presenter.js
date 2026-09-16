(function () {
  const pdfInput = document.getElementById('pdfInput');
  const pdfFileButton = document.getElementById('pdfFileButton');
  const sessionReset = document.getElementById('sessionReset');
  const pdfStatus = document.getElementById('pdfStatus');
  const pdfUploadProgress = document.getElementById('pdfUploadProgress');
  const pdfUploadPercent = document.getElementById('pdfUploadPercent');
  const pdfUploadProgressTrack = document.getElementById('pdfUploadProgressTrack');
  const pdfUploadProgressBar = document.getElementById('pdfUploadProgressBar');
  const pdfReader = new window.LivePdfReader({
    canvas: document.getElementById('pdfCanvas'),
    container: document.getElementById('pdfViewport'),
    pageInput: document.getElementById('pdfPageInput'),
    pageNumberDisplay: document.getElementById('pdfPageNumber'),
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
  const audienceReadToggle = document.getElementById('audienceReadToggle');
  const audienceModeToggle = document.getElementById('audienceModeToggle');
  const pollToggle = document.getElementById('pollToggle');
  const pollPanel = document.getElementById('pollPanel');
  const pollClose = document.getElementById('pollClose');
  const pollPresets = document.getElementById('pollPresets');
  const pollHome = document.getElementById('pollHome');
  const pollEmpty = document.getElementById('pollEmpty');
  const pollContentList = document.getElementById('pollContentList');
  const pollCreate = document.getElementById('pollCreate');
  const pollEditButton = document.getElementById('pollEditButton');
  const pollStartSaved = document.getElementById('pollStartSaved');
  const pollQuestionInput = document.getElementById('pollQuestionInput');
  const pollMaxSelections = document.getElementById('pollMaxSelections');
  const pollOptionsInput = document.getElementById('pollOptionsInput');
  const pollAddOption = document.getElementById('pollAddOption');
  const pollEditor = document.getElementById('pollEditor');
  const pollCancel = document.getElementById('pollCancel');
  const pollSave = document.getElementById('pollSave');
  const pollLaunch = document.getElementById('pollLaunch');
  const pollExport = document.getElementById('pollExport');
  const pollImport = document.getElementById('pollImport');
  const pollClipboardStatus = document.getElementById('pollClipboardStatus');
  const pollEndButton = document.getElementById('pollEnd');
  const pollClearButton = document.getElementById('pollClear');
  const pollLive = document.getElementById('pollLive');
  const toolsScrim = pollPanel.querySelector('[data-tools-close]');
  const toolsCard = pollPanel.querySelector('.tools-card');
  const toolTabs = Array.from(pollPanel.querySelectorAll('[data-tool-tab]'));
  const toolViews = Array.from(pollPanel.querySelectorAll('[data-tool-view]'));
  const rankingSummary = document.getElementById('rankingSummary');
  const rankingList = document.getElementById('rankingList');
  const lotterySummary = document.getElementById('lotterySummary');
  const lotteryCountOptions = document.getElementById('lotteryCountOptions');
  const lotteryDraw = document.getElementById('lotteryDraw');
  const lotteryResult = document.getElementById('lotteryResult');
  const lotteryRoller = document.getElementById('lotteryRoller');
  const lotteryRollerName = document.getElementById('lotteryRollerName');
  const presenterLotteryDialog = document.getElementById('presenterLotteryDialog');
  const presenterLotteryWinners = document.getElementById('presenterLotteryWinners');
  const presenterLotteryAck = document.getElementById('presenterLotteryAck');
  let activePoll;
  let selectedPreset = 0;
  let pollPresetsData = [];
  try {
    const savedPresets = JSON.parse(localStorage.getItem('live-share-poll-presets') || '[]');
    pollPresetsData = Array.isArray(savedPresets) ? savedPresets : [];
  } catch (error) {
    pollPresetsData = [];
  }
  let activeTool = 'poll';
  let latestRankingStats = { totals: { gifts: 0, danmu: 0 }, ranking: [] };
  let lotteryResultData = null;
  let toolsPreviousFocus = null;
  let toolsQrWasExpanded = false;
  let pollLaunchPending = false;
  let pollEditing = false;
  let lotterySelectedCount = 1;
  let lotteryRollTimer = 0;
  let lotteryRollNames = [];
  let lotteryRollStartedAt = 0;
  let lotteryRollFinishTimer = 0;
  let lotteryRollSequence = 0;
  const lotteryRollMinDuration = 1800;

  function setLotteryDrawLabel(label) {
    const text = lotteryDraw.querySelector('span:last-child');
    if (text) text.textContent = label;
    else lotteryDraw.textContent = label;
  }

  function setLotteryCount(count) {
    const value = String(Math.min(3, Math.max(1, Number(count) || 1)));
    lotterySelectedCount = Number(value);
    lotteryCountOptions.querySelectorAll('[data-lottery-count]').forEach((button) => {
      const selected = button.dataset.lotteryCount === value;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function setLotteryControlsEnabled(enabled) {
    lotteryDraw.disabled = !enabled;
    lotteryCountOptions.querySelectorAll('[data-lottery-count]').forEach((button) => {
      button.disabled = !enabled;
    });
  }

  const trackCount = 5;
  const manualAudienceUrlKey = 'live-share-manual-audience-url';
  const giftEffectsEnabledKey = 'live-share-gift-effects-enabled';
  const trackBusyUntil = Array.from({ length: trackCount }, () => 0);
  const recentEffects = [];
  let giftList = [];
  let giftsById = {};
  let quickPhrasesById = {};
  let documentInfo;
  let websocket;
  let giftEffectsEnabled = localStorage.getItem(giftEffectsEnabledKey) !== 'false';
  let connectionText = '未连接';
  let audienceCount = 0;
  let audienceMode = 'reader';
  let audienceReadingEnabled = true;
  let lastStats;
  let fullscreenUiTimer;
  let lastFullscreenState = false;
  let fullscreenLayoutFrame = 0;

  function renderPoll(poll) {
    activePoll = poll && poll.id ? poll : null;
    const hasPoll = Boolean(activePoll);
    if (hasPoll) pollEditing = false;
    pollLive.hidden = !hasPoll;
    pollHome.hidden = hasPoll || pollEditing;
    pollEditor.hidden = hasPoll || !pollEditing;
    pollEndButton.hidden = !hasPoll || Boolean(activePoll.ended);
    pollClearButton.hidden = !hasPoll || !activePoll.ended;
    pollLaunch.disabled = false;
    pollStartSaved.disabled = false;
    pollLaunch.textContent = '发起投票';
    pollStartSaved.textContent = '发起投票';
    pollLaunchPending = false;
    pollEndButton.disabled = false;
    pollClearButton.disabled = false;
    pollImport.disabled = hasPoll;
    if (!hasPoll) {
      pollLive.textContent = '';
      return;
    }

    const options = Array.isArray(activePoll.options) ? activePoll.options : [];
    const counts = Array.isArray(activePoll.counts) ? activePoll.counts : [];
    const total = Math.max(0, Number(activePoll.total || 0));
    pollLive.textContent = '';
    const title = document.createElement('strong');
    title.textContent = activePoll.question || '投票结果';
    pollLive.appendChild(title);
    options.forEach((option, index) => {
      const percent = total ? Math.round((Number(counts[index] || 0) / total) * 100) : 0;
      const row = document.createElement('div');
      row.className = 'poll-result';
      const label = document.createElement('span');
      label.textContent = option;
      const value = document.createElement('span');
      value.textContent = `${percent}%`;
      const bar = document.createElement('div');
      bar.className = 'poll-result-bar';
      const fill = document.createElement('span');
      fill.style.width = `${percent}%`;
      bar.appendChild(fill);
      row.append(label, value, bar);
      pollLive.appendChild(row);
    });
  }

  function handlePollError(message) {
    pollLaunchPending = false;
    pollLaunch.disabled = false;
    pollStartSaved.disabled = false;
    pollLaunch.textContent = '发起投票';
    pollStartSaved.textContent = '发起投票';
    pollEndButton.disabled = false;
    pollClearButton.disabled = false;

    const messages = {
      'invalid-poll': '问题和选项填写不完整',
      'already-active': '当前已有进行中的投票',
      'no-active-poll': '当前没有进行中的投票',
      'already-ended': '这场投票已经结束'
    };
    toast.textContent = messages[message?.reason] || '投票操作失败';

    // When the server has a newer poll state, prefer it over the local editor
    // so a stale presenter tab cannot accidentally overwrite an active poll.
    if (message?.poll) {
      renderPoll(message.poll);
    } else if (message?.reason === 'no-active-poll') {
      renderPoll(null);
    }
  }

  function requestRankingStats() {
    if (websocket?.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify({ type: 'interaction-ranking-request' }));
    }
  }

  function setToolTab(tool) {
    const nextTool = ['poll', 'ranking', 'lottery'].includes(tool) ? tool : 'poll';
    activeTool = nextTool;
    toolTabs.forEach((tab) => {
      const active = tab.dataset.toolTab === nextTool;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    toolViews.forEach((view) => {
      view.hidden = view.dataset.toolView !== nextTool;
    });
    if (nextTool === 'ranking' || nextTool === 'lottery') requestRankingStats();
  }

  function formatUserLabel(user) {
    if (!user) return '匿名';
    if (user.label) return String(user.label);
    const nickname = user.nickname || '匿名';
    const shortId = user.shortId || (user.userId ? String(user.userId).replace(/^u_/, '').slice(0, 6).toUpperCase() : '');
    return shortId ? `${nickname} · #${shortId}` : nickname;
  }

  function renderRanking(statsPayload = latestRankingStats) {
    latestRankingStats = statsPayload && typeof statsPayload === 'object' ? statsPayload : latestRankingStats;
    const totals = latestRankingStats.totals || { gifts: 0, danmu: 0 };
    const ranking = Array.isArray(latestRankingStats.ranking) ? latestRankingStats.ranking : [];
    const giftTotal = Math.max(0, Number(totals.gifts || 0));
    const danmuTotal = Math.max(0, Number(totals.danmu || 0));
    rankingSummary.textContent = `礼物 ${giftTotal} · 弹幕 ${danmuTotal} · ${ranking.length} 位参与者`;
    const eligibleCount = Math.max(0, Number(latestRankingStats.lottery?.eligibleCount ?? ranking.length));
    lotterySummary.textContent = eligibleCount ? `可抽取用户 ${eligibleCount} 位 · 礼物 ${giftTotal} · 弹幕 ${danmuTotal}` : '暂无已入场用户';
    setLotteryControlsEnabled(eligibleCount > 0 && websocket?.readyState === WebSocket.OPEN);
    rankingList.textContent = '';
    if (!ranking.length) {
      const empty = document.createElement('p');
      empty.className = 'tool-empty';
      empty.textContent = '暂无互动数据';
      rankingList.appendChild(empty);
      return;
    }
    ranking.slice(0, 20).forEach((user, index) => {
      const row = document.createElement('div');
      row.className = 'ranking-row';
      const rank = document.createElement('b');
      rank.className = 'ranking-rank';
      rank.textContent = `#${user.rank || index + 1}`;
      const info = document.createElement('div');
      info.className = 'ranking-user';
      const name = document.createElement('strong');
      name.textContent = formatUserLabel(user);
      if (user.userId) name.title = `${user.nickname || '匿名'} · ${user.userId}`;
      const counts = document.createElement('small');
      counts.textContent = `礼物 ${Number(user.giftCount || 0)} · 弹幕 ${Number(user.danmuCount || 0)}`;
      info.append(name, counts);
      const score = document.createElement('strong');
      score.className = 'ranking-score';
      score.textContent = `${Number(user.score || 0).toFixed(1)}%`;
      row.append(rank, info, score);
      rankingList.appendChild(row);
    });
  }

  function renderLotteryResult(result) {
    lotteryResultData = result || null;
    lotteryResult.hidden = !lotteryResultData;
    lotteryResult.textContent = '';
    const eligibleCount = Math.max(0, Number(latestRankingStats.lottery?.eligibleCount ?? latestRankingStats.ranking?.length ?? 0));
    setLotteryControlsEnabled(eligibleCount > 0 && websocket?.readyState === WebSocket.OPEN);
    setLotteryDrawLabel('开始抽奖');
    if (!lotteryResultData) return;
    const title = document.createElement('strong');
    title.textContent = `中奖用户${result.winners?.length ? ` · ${result.winners.length} 位` : ''}`;
    lotteryResult.appendChild(title);
    (Array.isArray(result.winners) ? result.winners : []).forEach((winner) => {
      const row = document.createElement('div');
      row.className = 'lottery-winner';
      row.textContent = `${formatUserLabel(winner)} · 权重 ${Number(winner.score || 0).toFixed(1)}%`;
      lotteryResult.appendChild(row);
    });
  }

  function showPresenterLotteryWinner(result) {
    if (!presenterLotteryDialog || !presenterLotteryWinners) return;
    presenterLotteryWinners.textContent = '';
    (Array.isArray(result?.winners) ? result.winners : []).forEach((winner) => {
      const row = document.createElement('div');
      row.className = 'presenter-lottery-winner';
      const name = document.createElement('strong');
      name.textContent = winner.nickname || '匿名';
      const id = document.createElement('span');
      id.textContent = winner.shortId ? `ID ${winner.shortId}` : '';
      row.append(name, id);
      presenterLotteryWinners.appendChild(row);
    });
    presenterLotteryDialog.hidden = false;
    presenterLotteryDialog.setAttribute('aria-hidden', 'false');
  }

  function hidePresenterLotteryWinner() {
    if (!presenterLotteryDialog) return;
    presenterLotteryDialog.hidden = true;
    presenterLotteryDialog.setAttribute('aria-hidden', 'true');
  }

  function stopLotteryRoll() {
    window.clearInterval(lotteryRollTimer);
    window.clearTimeout(lotteryRollFinishTimer);
    lotteryRollTimer = 0;
    lotteryRollFinishTimer = 0;
    lotteryRollStartedAt = 0;
    lotteryRollSequence += 1;
    lotteryRoller.hidden = true;
  }

  function startLotteryRoll() {
    const ranking = Array.isArray(latestRankingStats.ranking) ? latestRankingStats.ranking : [];
    lotteryRollNames = ranking.map((user) => formatUserLabel(user)).filter(Boolean);
    if (!lotteryRollNames.length) lotteryRollNames = ['美味的烧鸡', '巧克力味的西瓜', '冰凉的月亮'];
    lotteryRoller.hidden = false;
    lotteryRollStartedAt = Date.now();
    lotteryRollSequence += 1;
    let index = Math.floor(Math.random() * lotteryRollNames.length);
    lotteryRollerName.textContent = lotteryRollNames[index];
    window.clearInterval(lotteryRollTimer);
    lotteryRollTimer = window.setInterval(() => {
      index = (index + 1 + Math.floor(Math.random() * Math.max(1, lotteryRollNames.length - 1))) % lotteryRollNames.length;
      lotteryRollerName.textContent = lotteryRollNames[index];
    }, 95);
  }

  function finishLotteryRoll(callback) {
    const sequence = lotteryRollSequence;
    const remaining = Math.max(0, lotteryRollMinDuration - (Date.now() - lotteryRollStartedAt));
    window.clearTimeout(lotteryRollFinishTimer);
    lotteryRollFinishTimer = window.setTimeout(() => {
      if (sequence === lotteryRollSequence) callback();
    }, remaining);
  }

  function normalizeSelectionCount(value, optionCount) {
    const count = Number(value);
    return Number.isInteger(count) ? Math.min(Math.max(1, count), Math.max(1, optionCount)) : 1;
  }

  function renderPresets() {
    const container = pollContentList || pollPresets;
    if (!container) return;
    container.textContent = '';
    const saved = pollPresetsData.map((preset, index) => ({ preset, index })).filter(({ preset }) => preset?.question && Array.isArray(preset.options) && preset.options.length >= 2);
    if (saved.length && !saved.some(({ index }) => index === selectedPreset)) selectedPreset = saved[0].index;
    pollEmpty.hidden = saved.length > 0;
    pollEditButton.hidden = saved.length === 0;
    pollStartSaved.hidden = saved.length === 0;
    pollCreate.textContent = saved.length ? '新建' : '创建投票';
    saved.forEach(({ preset, index }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `poll-content-card${index === selectedPreset ? ' is-active' : ''}`;
      const title = document.createElement('strong');
      title.textContent = preset.question;
      const options = document.createElement('span');
      const maxSelections = normalizeSelectionCount(preset.maxSelections, preset.options.length);
      options.textContent = `${maxSelections === 1 ? '单选' : `选 ${maxSelections} 项`} · ${preset.options.join(' · ')}`;
      button.append(title, options);
      button.addEventListener('click', () => {
        selectedPreset = index;
        loadSelectedPreset();
        renderPresets();
      });
      container.appendChild(button);
    });
  }

  function loadSelectedPreset() {
    const preset = pollPresetsData[selectedPreset] || {};
    pollQuestionInput.value = preset.question || '';
    renderOptionInputs(preset.options || [], preset.maxSelections || 1);
  }

  function setPollEditing(editing) {
    pollEditing = Boolean(editing) && !activePoll;
    pollHome.hidden = Boolean(activePoll) || pollEditing;
    pollEditor.hidden = Boolean(activePoll) || !pollEditing;
    if (pollEditing) {
      loadSelectedPreset();
      window.requestAnimationFrame(() => pollQuestionInput.focus());
    } else {
      renderPresets();
    }
  }

  function getSelectedPoll() {
    const question = pollQuestionInput.value.replace(/\s+/g, ' ').trim().slice(0, 120);
    const options = getPollOptions();
    const maxSelections = normalizeSelectionCount(pollMaxSelections.value, options.length);
    return { question, options, maxSelections };
  }

  function getPollClipboardData() {
    if (activePoll) {
      return {
        question: String(activePoll.question || '').trim(),
        options: Array.isArray(activePoll.options) ? activePoll.options.map((option) => String(option || '').trim()).filter(Boolean).slice(0, 6) : [],
        maxSelections: normalizeSelectionCount(activePoll.maxSelections, activePoll.options?.length || 1)
      };
    }

    if (pollEditing) {
      return getSelectedPoll();
    }

    const preset = pollPresetsData[selectedPreset] || {};
    return {
      question: String(preset.question || '').trim(),
      options: Array.isArray(preset.options) ? preset.options.map((option) => String(option || '').trim()).filter(Boolean).slice(0, 6) : [],
      maxSelections: normalizeSelectionCount(preset.maxSelections, preset.options?.length || 1)
    };
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (error) {
        // Fall back for HTTP/LAN pages where Clipboard API permission is unavailable.
      }
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('clipboard_unavailable');
  }

  async function exportPollJson() {
    const data = getPollClipboardData();
    if (!data.question || data.options.length < 2) {
      if (pollClipboardStatus) pollClipboardStatus.textContent = '请先填写完整投票后再复制';
      toast.textContent = '请先选择或填写一个完整投票';
      return;
    }

    try {
      await copyTextToClipboard(`${JSON.stringify(data, null, 2)}\n`);
      if (pollClipboardStatus) pollClipboardStatus.textContent = `已复制 · ${data.options.length} 个选项`;
      toast.textContent = '投票 JSON 已复制';
    } catch (error) {
      if (pollClipboardStatus) pollClipboardStatus.textContent = '复制失败，请检查剪贴板权限';
      toast.textContent = '复制失败，请检查剪贴板权限';
    }
  }

  async function readClipboardText() {
    if (navigator.clipboard?.readText) {
      try {
        return await navigator.clipboard.readText();
      } catch (error) {
        // Fall back to a native paste prompt when clipboard permission is blocked.
      }
    }

    const pasted = window.prompt('请粘贴投票 JSON');
    if (pasted === null) {
      throw new Error('clipboard_cancelled');
    }
    return pasted;
  }

  async function importPollJson() {
    if (activePoll) {
      toast.textContent = '请先结束并关闭当前投票';
      return;
    }

    try {
      const raw = await readClipboardText();
      const parsed = JSON.parse(raw);
      const question = String(parsed?.question || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      const seen = new Set();
      const options = (Array.isArray(parsed?.options) ? parsed.options : [])
        .map((option) => String(option || '').replace(/\s+/g, ' ').trim().slice(0, 40))
        .filter((option) => option && !seen.has(option.toLocaleLowerCase()) && seen.add(option.toLocaleLowerCase()))
        .slice(0, 6);
      if (!question || options.length < 2) {
        throw new Error('invalid_poll_json');
      }
      const maxSelections = normalizeSelectionCount(parsed?.maxSelections, options.length);

      setPollEditing(true);
      pollQuestionInput.value = question;
      renderOptionInputs(options, maxSelections);
      if (pollClipboardStatus) pollClipboardStatus.textContent = `已导入 · ${options.length} 个选项，请确认后保存`;
      toast.textContent = '已读取剪贴板，请确认后保存';
    } catch (error) {
      if (pollClipboardStatus) pollClipboardStatus.textContent = error.message === 'clipboard_cancelled'
        ? '已取消导入'
        : '导入失败：JSON 无效';
      toast.textContent = error.message === 'clipboard_cancelled'
        ? '已取消粘贴'
        : 'JSON 无效，请使用包含 question 和 options 的投票配置';
    }
  }

  function launchPoll(question, options, maxSelections = 1) {
    if (pollLaunchPending) return;
    if (!question || options.length < 2) {
      toast.textContent = '请先填写问题和至少两个选项';
      return;
    }
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
      toast.textContent = '互动服务未连接';
      return;
    }
    pollLaunchPending = true;
    pollLaunch.disabled = true;
    pollStartSaved.disabled = true;
    pollLaunch.textContent = '发起中…';
    pollStartSaved.textContent = '发起中…';
    websocket.send(JSON.stringify({ type: 'poll-start', question, options, maxSelections }));
  }

  function getPollOptions() {
    const seen = new Set();
    return Array.from(pollOptionsInput.querySelectorAll('input'))
      .map((input) => input.value.replace(/\s+/g, ' ').trim())
      .filter((option) => {
        const key = option.toLocaleLowerCase();
        if (!option || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 6);
  }
  function getPollOptionDrafts() { return Array.from(pollOptionsInput.querySelectorAll('input')).map((input) => input.value).slice(0, 6); }
  function refreshOptionLabels() {
    const rows = pollOptionsInput.querySelectorAll('.poll-option-row');
    rows.forEach((row, index) => {
      row.querySelector('input').placeholder = `选项 ${index + 1}`;
      row.querySelector('button').disabled = rows.length <= 2;
    });
    pollAddOption.disabled = rows.length >= 6;
    const previous = Math.min(Math.max(1, Number(pollMaxSelections.value) || 1), rows.length);
    pollMaxSelections.textContent = '';
    for (let count = 1; count <= rows.length; count += 1) {
      const option = document.createElement('option');
      option.value = String(count);
      option.textContent = count === 1 ? '单选' : `${count} 选`;
      pollMaxSelections.appendChild(option);
    }
    pollMaxSelections.value = String(previous);
  }
  function renderOptionInputs(options = [], maxSelections = 1) {
    pollOptionsInput.textContent = '';
    const values = Array.isArray(options) && options.length ? options : ['', ''];
    values.slice(0, 6).forEach((value) => {
      const row = document.createElement('div');
      row.className = 'poll-option-row';
      const input = document.createElement('input');
      input.maxLength = 40;
      input.value = value;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.addEventListener('click', () => { row.remove(); refreshOptionLabels(); });
      row.append(input, remove);
      pollOptionsInput.appendChild(row);
    });
    refreshOptionLabels();
    pollMaxSelections.value = String(normalizeSelectionCount(maxSelections, pollOptionsInput.querySelectorAll('.poll-option-row').length));
  }

  function setToolsOpen(expanded) {
    const next = Boolean(expanded);
    if (next === !pollPanel.hidden) {
      return;
    }

    if (next) {
      toolsPreviousFocus = document.activeElement;
      toolsQrWasExpanded = !qrCard.hidden;
      document.body.classList.add('tools-open');
      setQrExpanded(true);
      pollPanel.hidden = false;
      pollPanel.setAttribute('aria-hidden', 'false');
      pollToggle.setAttribute('aria-expanded', 'true');
      pollToggle.classList.add('is-open');
      revealFullscreenUi();
      setToolTab(activeTool);
      if (!activePoll) renderPresets();
      window.requestAnimationFrame(() => toolsCard?.focus({ preventScroll: true }));
      return;
    }

    pollPanel.hidden = true;
    document.body.classList.remove('tools-open');
    setQrExpanded(toolsQrWasExpanded);
    pollPanel.setAttribute('aria-hidden', 'true');
    pollToggle.setAttribute('aria-expanded', 'false');
    pollToggle.classList.remove('is-open');
    revealFullscreenUi();
    if (toolsPreviousFocus && typeof toolsPreviousFocus.focus === 'function') {
      toolsPreviousFocus.focus({ preventScroll: true });
    }
    toolsPreviousFocus = null;
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
    const displayModeFullscreen = window.matchMedia?.('(display-mode: fullscreen)').matches;

    return Boolean(document.fullscreenElement) || browserFullscreen || displayModeFullscreen;
  }

  function revealFullscreenUi() {
    const isFullscreen = isPresentationFullscreen();
    const stage = document.querySelector('.stage');
    stage?.classList.toggle('is-presentation-fullscreen', isFullscreen);

    if (isFullscreen !== lastFullscreenState) {
      lastFullscreenState = isFullscreen;
      window.cancelAnimationFrame(fullscreenLayoutFrame);
      fullscreenLayoutFrame = window.requestAnimationFrame(() => {
        if (pdfReader.pdf && !pdfReader.busy && pdfReader.fitMode !== 'custom') {
          void pdfReader.renderPage().catch(() => {});
        }
      });
    }

    if (!isFullscreen) {
      stage?.classList.remove('is-ui-hidden');
      window.clearTimeout(fullscreenUiTimer);
      return;
    }

    stage?.classList.remove('is-ui-hidden');
    window.clearTimeout(fullscreenUiTimer);
    if (!pollPanel.hidden) {
      return;
    }
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
      pdfReader.goToPage(pdfReader.pageNumber + 1);
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'PageUp') {
      event.preventDefault();
      pdfReader.goToPage(pdfReader.pageNumber - 1);
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

  async function loadQuickPhrases() {
    try {
      const response = await fetch('/api/quick-phrases');
      if (!response.ok) throw new Error('Quick phrase configuration failed');
      const data = await response.json();
      const phrases = Array.isArray(data.phrases) ? data.phrases : [];
      quickPhrasesById = Object.fromEntries(phrases.map((phrase) => [phrase.id, phrase]));
    } catch (error) {
      quickPhrasesById = {};
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
    if (typeof documentInfo.audienceMode === 'string') setAudienceMode(documentInfo.audienceMode);
    if (typeof documentInfo.audienceReadingEnabled === 'boolean') setAudienceReadingEnabled(documentInfo.audienceReadingEnabled);
    if (pdfFileButton) pdfFileButton.textContent = documentInfo.available ? '替换 PDF' : '上传 PDF';
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
    if (pdfFileButton) pdfFileButton.classList.add('is-busy');
    pdfStatus.textContent = `正在上传 · ${formatBytes(file.size)}`;
    setPdfUploadProgress(0);

    try {
      const data = await uploadPdfWithProgress(file);
      applyDocument(data.document);
      toast.textContent = 'PDF 已上传';
    } catch (error) {
      toast.textContent = 'PDF 上传失败，请重试';
      await loadDocument();
    } finally {
      pdfInput.disabled = false;
      if (pdfFileButton) pdfFileButton.classList.remove('is-busy');
      if (pdfUploadProgress) {
        window.setTimeout(() => setPdfUploadProgress(null), 450);
      }
    }
  }

  function setPdfUploadProgress(value) {
    if (!pdfUploadProgress || !pdfUploadPercent || !pdfUploadProgressTrack || !pdfUploadProgressBar) return;
    if (value === null || value === undefined) {
      pdfUploadProgress.hidden = true;
      return;
    }

    const percent = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    pdfUploadProgress.hidden = false;
    pdfUploadPercent.textContent = `${percent}%`;
    pdfUploadProgressTrack.setAttribute('aria-valuenow', String(percent));
    pdfUploadProgressBar.style.width = `${percent}%`;
  }

  function uploadPdfWithProgress(file) {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('PUT', '/api/document');
      request.setRequestHeader('Content-Type', 'application/pdf');
      request.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
      request.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          setPdfUploadProgress((event.loaded / event.total) * 100);
        }
      });
      request.addEventListener('load', () => {
        if (request.status < 200 || request.status >= 300) {
          reject(new Error('PDF upload failed'));
          return;
        }
        try {
          setPdfUploadProgress(100);
          resolve(JSON.parse(request.responseText));
        } catch (error) {
          reject(error);
        }
      });
      request.addEventListener('error', () => reject(new Error('PDF upload failed')));
      request.addEventListener('abort', () => reject(new Error('PDF upload aborted')));
      request.send(file);
    });
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
    item.textContent = message.content;
    item.style.top = `${top}px`;
    item.style.animationDuration = `${8 + Math.random() * 2.5}s`;

    danmuLayer.appendChild(item);
    item.addEventListener('animationend', () => item.remove(), { once: true });
  }

  function addQuickDanmu(message) {
    const phrase = quickPhrasesById[message.phraseId];
    if (!phrase) return;
    if (!giftEffectsEnabled) {
      toast.textContent = phrase.text;
      return;
    }

    const item = document.createElement('div');
    const image = document.createElement('img');
    const track = chooseTrack();

    item.className = 'quick-danmu';
    item.style.left = `calc(100% - 150px - ${Math.round(Math.random() * 6)}vw)`;
    item.style.top = `${8 + track * 13 + Math.random() * 3}vh`;
    item.style.animationDuration = `${6.2 + Math.random() * 1.4}s`;
    image.src = phrase.image;
    image.alt = phrase.text;
    item.appendChild(image);
    effectLayer.appendChild(item);
    item.addEventListener('animationend', () => item.remove(), { once: true });
    window.setTimeout(() => item.remove(), 8500);
    toast.textContent = phrase.text;
  }

  function addEffect(message) {
    const gift = giftsById[message.effect];

    if (!gift) {
      return;
    }

    if (!giftEffectsEnabled) {
      toast.textContent = `${gift.toast}，本场第 ${message.count || 1} 个`;
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
    toast.textContent = `${gift.toast}，本场第 ${message.count || 1} 个`;
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
    const danmu = Math.max(0, Number(stats?.totals?.danmu ?? stats?.danmu ?? 0) || 0);
    const giftStats = stats?.gifts || {};
    const persistedGiftTotal = Number(stats?.totals?.gifts);
    const giftTotal = Number.isFinite(persistedGiftTotal)
      ? Math.max(0, persistedGiftTotal)
      : giftList.reduce((total, gift) => total + Number(giftStats[gift.id] || 0), 0);
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

  function clearSessionEffects() {
    effectLayer.textContent = '';
    recentEffects.length = 0;
    comboBadge.hidden = true;
    renderLotteryResult(null);
  }

  function setAudienceMode(mode) {
    audienceMode = mode === 'reader' ? 'reader' : 'interaction';
    audienceModeToggle.classList.toggle('is-enabled', audienceMode === 'reader');
    audienceModeToggle.setAttribute('aria-pressed', String(audienceMode === 'reader'));
    audienceModeToggle.title = audienceMode === 'reader' ? '观众可以下载 PDF' : '观众只能在线阅读';
    audienceModeToggle.disabled = !audienceReadingEnabled;
  }

  function setAudienceReadingEnabled(enabled) {
    audienceReadingEnabled = Boolean(enabled);
    audienceReadToggle.classList.toggle('is-enabled', audienceReadingEnabled);
    audienceReadToggle.setAttribute('aria-pressed', String(audienceReadingEnabled));
    audienceReadToggle.title = audienceReadingEnabled ? '观众可以阅读 PDF' : '观众无法阅读 PDF';
    audienceModeToggle.disabled = !audienceReadingEnabled;
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
      toast.textContent = nextMode === 'reader' ? '观众可以下载当前 PDF' : '观众只能在线阅读';
    } catch (error) {
      toast.textContent = '下载权限切换失败';
    }
  }

  async function toggleAudienceReading() {
    const enabled = !audienceReadingEnabled;

    try {
      const response = await fetch('/api/audience-reading', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ enabled })
      });

      if (!response.ok) throw new Error('Audience reading update failed');
      const result = await response.json();
      setAudienceReadingEnabled(result.enabled);
      toast.textContent = result.enabled ? '观众可以阅读当前 PDF' : '已关闭观众阅读';
    } catch (error) {
      toast.textContent = '阅读权限切换失败';
    }
  }

  async function resetSession() {
    const confirmed = window.confirm('确定重置现场吗？\n\n将移除当前 PDF，并清空本场弹幕、礼物、投票和用户数据。已保存的投票内容会保留。观众需要重新扫码入场。');
    if (!confirmed) return;

    sessionReset.disabled = true;
    sessionReset.textContent = '重置中…';
    try {
      const response = await fetch('/api/session/reset', { method: 'POST' });
      if (!response.ok) throw new Error('Session reset failed');
      const result = await response.json();
      applyDocument(result.document);
      updateStats(result.stats);
      clearSessionEffects();
      toast.textContent = '现场已重置，请观众重新扫码入场';
    } catch (error) {
      toast.textContent = '重置失败，请重试';
    } finally {
      sessionReset.disabled = false;
      sessionReset.textContent = '重置现场';
    }
  }

  function connectWebSocket() {
    if (websocket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(websocket.readyState)) return;
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

      if (message.type === 'quick-danmu') {
        addQuickDanmu(message);
      }

      if (message.type === 'effect') {
        addEffect(message);
      }

      if (message.type === 'stats') {
        updateStats(message.stats);
      }

      if (message.type === 'interaction-ranking') {
        renderRanking(message.stats);
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

      if (message.type === 'system' && message.status === 'audience-reading') {
        setAudienceReadingEnabled(message.enabled);
      }

      if (message.type === 'system' && message.status === 'session-reset') {
        clearSessionEffects();
      }

      if (message.type === 'system' && message.status === 'clients') {
        setAudienceCount(message.clients);
      }

      if (message.type === 'system' && message.status === 'unauthorized') {
        setConnectionStatus('请先登录');
      }

      if (['poll-start', 'poll-update', 'poll-end', 'poll-state'].includes(message.type)) {
        renderPoll(message.poll);
      }
      if (message.type === 'poll-error') {
        handlePollError(message);
      }
      if (message.type === 'poll-close') {
        renderPoll(null);
      }

      if (message.type === 'lottery-result') {
        finishLotteryRoll(() => {
          stopLotteryRoll();
          renderLotteryResult(message.result);
          showPresenterLotteryWinner(message.result);
          setToolTab('lottery');
          const winners = Array.isArray(message.result?.winners) ? message.result.winners : [];
          toast.textContent = winners.length ? winners.map(formatUserLabel).join('、') + ' 中奖' : '抽奖完成';
        });
      }

      if (message.type === 'lottery-error') {
        finishLotteryRoll(() => {
          stopLotteryRoll();
          toast.textContent = message.reason === 'no-participants' ? '暂无已入场用户' : '抽奖参数无效';
          setLotteryDrawLabel('开始抽奖');
          const eligibleCount = Math.max(0, Number(latestRankingStats.lottery?.eligibleCount ?? latestRankingStats.ranking?.length ?? 0));
          setLotteryControlsEnabled(eligibleCount > 0 && websocket?.readyState === WebSocket.OPEN);
        });
      }
    });

    websocket.addEventListener('close', () => {
      stopLotteryRoll();
      setConnectionStatus('重连中');
      pollLaunchPending = false;
      pollLaunch.disabled = false;
      pollStartSaved.disabled = false;
      pollLaunch.textContent = '发起投票';
      pollStartSaved.textContent = '发起投票';
      pollEndButton.disabled = false;
      pollClearButton.disabled = false;
      setLotteryControlsEnabled(false);
      setLotteryDrawLabel('开始抽奖');
      setTimeout(connectWebSocket, 1200);
    });

    websocket.addEventListener('error', () => {
      stopLotteryRoll();
      setConnectionStatus('连接异常');
      pollLaunchPending = false;
      pollLaunch.disabled = false;
      pollStartSaved.disabled = false;
      pollLaunch.textContent = '发起投票';
      pollStartSaved.textContent = '发起投票';
      pollEndButton.disabled = false;
      pollClearButton.disabled = false;
      setLotteryControlsEnabled(false);
      setLotteryDrawLabel('开始抽奖');
    });
  }

  function unlockPresenter() {
    passwordDialog.hidden = true;
    revealFullscreenUi();
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
      connectWebSocket();
    } catch (error) {
      passwordError.hidden = false;
      passwordInput.select();
    }
  });

  document.addEventListener('keydown', handlePdfKey);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !pollPanel.hidden) {
      event.preventDefault();
      setToolsOpen(false);
    }
  });
  document.addEventListener('fullscreenchange', revealFullscreenUi);
  window.addEventListener('resize', revealFullscreenUi);
  window.addEventListener('pointermove', handleFullscreenPointer);
  pdfInput.addEventListener('change', () => uploadPdf(pdfInput.files?.[0]));
  pollToggle.addEventListener('click', () => setToolsOpen(pollPanel.hidden));
  pollClose.addEventListener('click', () => setToolsOpen(false));
  toolsScrim.addEventListener('click', () => setToolsOpen(false));
  toolTabs.forEach((tab) => tab.addEventListener('click', () => setToolTab(tab.dataset.toolTab)));
  pollCreate.addEventListener('click', () => {
    const emptyIndex = pollPresetsData.findIndex((preset) => !preset?.question);
    if (emptyIndex < 0 && pollPresetsData.length >= 6) {
      toast.textContent = '最多保留 6 个投票';
      return;
    }
    selectedPreset = emptyIndex >= 0 ? emptyIndex : pollPresetsData.length;
    setPollEditing(true);
  });
  pollEditButton.addEventListener('click', () => setPollEditing(true));
  pollCancel.addEventListener('click', () => setPollEditing(false));
  pollStartSaved.addEventListener('click', () => {
    loadSelectedPreset();
    const { question, options, maxSelections } = getSelectedPoll();
    launchPoll(question, options, maxSelections);
  });
  pollAddOption.addEventListener('click', () => {
    if (pollOptionsInput.querySelectorAll('input').length < 6) {
      renderOptionInputs([...getPollOptionDrafts(), ''], pollMaxSelections.value);
    }
  });
  pollSave.addEventListener('click', () => {
    const { question, options, maxSelections } = getSelectedPoll();
    if (!question || options.length < 2) {
      toast.textContent = '请先填写问题和至少两个选项';
      return;
    }
    pollPresetsData[selectedPreset] = { question, options, maxSelections };
    localStorage.setItem('live-share-poll-presets', JSON.stringify(pollPresetsData));
    setPollEditing(false);
    toast.textContent = '投票已保存';
  });
  pollLaunch.addEventListener('click', () => {
    const { question, options, maxSelections } = getSelectedPoll();
    launchPoll(question, options, maxSelections);
  });
  pollExport.addEventListener('click', exportPollJson);
  pollImport.addEventListener('click', importPollJson);
  pollEndButton.addEventListener('click', () => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
      toast.textContent = '互动服务未连接';
      return;
    }
    pollEndButton.disabled = true;
    websocket.send(JSON.stringify({ type: 'poll-end' }));
  });
  pollClearButton.addEventListener('click', () => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
      toast.textContent = '互动服务未连接';
      return;
    }
    pollClearButton.disabled = true;
    websocket.send(JSON.stringify({ type: 'poll-close' }));
  });
  lotteryDraw.addEventListener('click', () => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) { toast.textContent = '互动服务未连接'; return; }
    setLotteryControlsEnabled(false);
    setLotteryDrawLabel('抽奖中…');
    startLotteryRoll();
    websocket.send(JSON.stringify({ type: 'lottery-draw', count: lotterySelectedCount, excludePrevious: true }));
  });
  lotteryCountOptions.addEventListener('click', (event) => {
    const button = event.target.closest('[data-lottery-count]');
    if (!button || lotteryDraw.disabled) return;
    setLotteryCount(button.dataset.lotteryCount);
  });
  presenterLotteryAck?.addEventListener('click', hidePresenterLotteryWinner);
  presenterLotteryDialog?.addEventListener('click', (event) => {
    if (event.target === presenterLotteryDialog) hidePresenterLotteryWinner();
  });
  setLotteryCount(1);
  sessionReset.addEventListener('click', resetSession);
  audienceReadToggle.addEventListener('click', toggleAudienceReading);
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
  setAudienceReadingEnabled(audienceReadingEnabled);
  setAudienceMode(audienceMode);
  revealFullscreenUi();

  Promise.all([checkSession(), loadGifts(), loadQuickPhrases()]).then(async ([authenticated]) => {
    if (authenticated) {
      passwordDialog.hidden = true;
      await loadDocument();
      await loadAudienceUrls();
    }
    if (authenticated) connectWebSocket();
  });
})();
