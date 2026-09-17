(function () {
  const displayGrid = document.getElementById('displayGrid');
  const refreshDisplays = document.getElementById('refreshDisplays');
  const startForm = document.getElementById('startForm');
  const passwordInput = document.getElementById('passwordInput');
  const startButton = document.getElementById('startButton');
  const startError = document.getElementById('startError');
  const minimizeWindow = document.getElementById('minimizeWindow');
  const closeWindow = document.getElementById('closeWindow');
  let displays = [];
  let selectedDisplayId = '';

  function selectDisplay(displayId) {
    selectedDisplayId = String(displayId);
    displayGrid.querySelectorAll('.display-option').forEach((button) => {
      const selected = button.dataset.displayId === selectedDisplayId;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-checked', String(selected));
    });
  }

  function renderDisplays() {
    displayGrid.textContent = '';
    if (!displays.length) {
      const empty = document.createElement('div');
      empty.className = 'display-empty';
      empty.textContent = '未检测到可用显示器';
      displayGrid.appendChild(empty);
      return;
    }

    displays.forEach((display, index) => {
      const button = document.createElement('button');
      const preview = document.createElement('span');
      const meta = document.createElement('span');
      const name = document.createElement('strong');
      const details = document.createElement('small');
      button.type = 'button';
      button.className = 'display-option';
      button.dataset.displayId = display.id;
      button.setAttribute('role', 'radio');
      preview.className = 'display-preview';
      preview.textContent = String(index + 1);
      meta.className = 'display-meta';
      name.textContent = `${display.label}${display.primary ? ' · 主屏幕' : ''}`;
      details.textContent = `${display.bounds.width} × ${display.bounds.height} · ${Math.round(display.scaleFactor * 100)}%`;
      meta.append(name, details);
      button.append(preview, meta);
      button.addEventListener('click', () => selectDisplay(display.id));
      displayGrid.appendChild(button);
    });
    selectDisplay(selectedDisplayId || displays.find((display) => display.primary)?.id || displays[0].id);
  }

  async function loadDisplays() {
    refreshDisplays.disabled = true;
    try {
      displays = window.desktopOverlay
        ? await window.desktopOverlay.listDisplays()
        : [{ id: 'preview', label: '桌面预览', primary: true, bounds: { width: 1920, height: 1080 }, scaleFactor: 1 }];
      renderDisplays();
    } catch (error) {
      displays = [];
      renderDisplays();
    } finally {
      refreshDisplays.disabled = false;
    }
  }

  startForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    startError.hidden = true;
    startButton.disabled = true;
    startButton.textContent = '正在开始';
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput.value })
      });
      if (!response.ok) throw new Error('password');
      if (!window.desktopOverlay) throw new Error('desktop');
      await window.desktopOverlay.start(selectedDisplayId);
    } catch (error) {
      startError.textContent = error.message === 'password'
        ? '密码不正确'
        : '桌面互动启动失败，请重试';
      startError.hidden = false;
      passwordInput.select();
      startButton.disabled = false;
      startButton.textContent = '开始互动';
    }
  });

  refreshDisplays.addEventListener('click', loadDisplays);
  minimizeWindow.addEventListener('click', () => window.desktopOverlay?.minimize());
  closeWindow.addEventListener('click', () => window.desktopOverlay?.quit());
  loadDisplays();
})();
