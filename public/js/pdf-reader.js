(function () {
  let pdfjsPromise;

  function loadPdfJs() {
    if (!pdfjsPromise) {
      // Some embedded mobile browsers used by WeChat do not provide the
      // promise helpers required by recent PDF.js builds.
      if (!Promise.withResolvers) {
        Promise.withResolvers = function withResolvers() {
          let resolve;
          let reject;
          const promise = new Promise((resolvePromise, rejectPromise) => {
            resolve = resolvePromise;
            reject = rejectPromise;
          });
          return { promise, resolve, reject };
        };
      }
      if (!Promise.try) {
        Promise.try = function promiseTry(callback, ...args) {
          return new Promise((resolve, reject) => {
            try {
              resolve(callback(...args));
            } catch (error) {
              reject(error);
            }
          });
        };
      }
      if (!AbortSignal.any) {
        AbortSignal.any = function abortSignalAny(signals) {
          const controller = new AbortController();
          const abort = (event) => controller.abort(event?.target?.reason);
          signals.forEach((signal) => {
            if (signal.aborted) {
              abort({ target: signal });
            } else {
              signal.addEventListener('abort', abort, { once: true });
            }
          });
          return controller.signal;
        };
      }
      pdfjsPromise = import('/pdfjs/legacy/pdf.min.mjs').then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/legacy/pdf.worker.min.mjs';
        return pdfjs;
      });
    }

    return pdfjsPromise;
  }

  class PdfReader {
    constructor(options) {
      this.canvas = options.canvas;
      this.container = options.container;
      this.pageInput = options.pageInput;
      this.pageNumberDisplay = options.pageNumberDisplay;
      this.pageCount = options.pageCount;
      this.status = options.status;
      this.previousButton = options.previousButton;
      this.nextButton = options.nextButton;
      this.zoomOutButton = options.zoomOutButton;
      this.zoomInButton = options.zoomInButton;
      this.fitWidthButton = options.fitWidthButton;
      this.fitPageButton = options.fitPageButton;
      this.emptyState = options.emptyState;
      this.pdf = null;
      this.pageNumber = 1;
      this.scale = 1;
      this.fitMode = 'page';
      this.renderToken = 0;
      this.renderRequestId = 0;
      this.renderTask = null;
      this.busy = false;

      this.previousButton?.addEventListener('click', () => this.goToPage(this.pageNumber - 1));
      this.nextButton?.addEventListener('click', () => this.goToPage(this.pageNumber + 1));
      this.zoomOutButton?.addEventListener('click', () => this.setScale(this.scale - 0.15));
      this.zoomInButton?.addEventListener('click', () => this.setScale(this.scale + 0.15));
      this.fitWidthButton?.addEventListener('click', () => {
        this.fitMode = 'width';
        this.renderPage();
      });
      this.fitPageButton?.addEventListener('click', () => {
        this.fitMode = 'page';
        this.renderPage();
      });
      this.pageInput?.addEventListener('change', () => {
        this.goToPage(Number(this.pageInput.value) || 1);
      });
      this.container?.addEventListener('wheel', (event) => {
        if (!event.ctrlKey) {
          return;
        }

        event.preventDefault();
        this.setScale(this.scale + (event.deltaY < 0 ? 0.1 : -0.1));
      }, { passive: false });
      window.addEventListener('resize', () => {
        if (this.pdf && this.fitMode !== 'custom') {
          this.renderPage();
        }
      });
    }

    async load(url) {
      const token = ++this.renderToken;
      this.setBusy(true);

      try {
        const pdfjs = await loadPdfJs();
        const pdf = await loadPdfDocument(pdfjs, url);

        if (token !== this.renderToken) {
          await pdf.destroy();
          return;
        }

        this.pdf = pdf;
        this.pageNumber = 1;
        this.fitMode = 'page';
        this.pageCount.textContent = String(pdf.numPages);
        this.emptyState.hidden = true;
        this.canvas.hidden = false;
        await this.renderPage();
      } catch (error) {
        if (token !== this.renderToken) {
          return;
        }

        this.pdf = null;
        this.canvas.hidden = true;
        this.emptyState.hidden = false;
        this.emptyState.textContent = 'PDF 加载失败，请重新上传文件。';
        this.pageCount.textContent = '0';
        this.status.textContent = '加载失败';
      } finally {
        if (token === this.renderToken) {
          this.setBusy(false);
        }
      }
    }

    clear(message = '请上传一个 PDF 开始演示') {
      this.renderToken += 1;
      this.renderRequestId += 1;
      this.renderTask?.cancel?.();
      this.renderTask = null;
      this.pdf = null;
      this.canvas.hidden = true;
      this.emptyState.hidden = false;
      this.emptyState.textContent = message;
      this.pageInput.value = '1';
      if (this.pageNumberDisplay) this.pageNumberDisplay.textContent = '1';
      this.pageCount.textContent = '0';
      this.status.textContent = '等待文件';
      this.setBusy(false);
    }

    async renderPage() {
      if (!this.pdf) {
        return;
      }

      const token = this.renderToken;
      const requestId = ++this.renderRequestId;
      this.renderTask?.cancel?.();
      this.renderTask = null;
      this.setBusy(true);
      const page = await this.pdf.getPage(this.pageNumber);

      if (token !== this.renderToken || requestId !== this.renderRequestId) {
        return;
      }

      const baseViewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(280, this.container.clientWidth - 36);
      const availableHeight = Math.max(280, this.container.clientHeight - 36);
      const widthScale = availableWidth / baseViewport.width;
      const pageScale = Math.min(widthScale, availableHeight / baseViewport.height);
      const scale = this.fitMode === 'width'
        ? Math.max(0.35, widthScale)
        : this.fitMode === 'page'
          ? Math.max(0.35, pageScale)
          : this.scale;
      const viewport = page.getViewport({ scale });
      const context = this.canvas.getContext('2d', { alpha: false });
      const outputScale = window.devicePixelRatio || 1;

      this.canvas.width = Math.floor(viewport.width * outputScale);
      this.canvas.height = Math.floor(viewport.height * outputScale);
      this.canvas.style.width = `${Math.floor(viewport.width)}px`;
      this.canvas.style.height = `${Math.floor(viewport.height)}px`;
      context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, viewport.width, viewport.height);

      this.status.textContent = `第 ${this.pageNumber} 页`;
      if (this.pageInput) this.pageInput.value = String(this.pageNumber);
      if (this.pageNumberDisplay) this.pageNumberDisplay.textContent = String(this.pageNumber);
      this.updateNavigation();
      const renderTask = page.render({ canvasContext: context, viewport });
      this.renderTask = renderTask;
      try {
        await renderTask.promise;
        if (token === this.renderToken && requestId === this.renderRequestId && this.fitMode === 'custom') {
          this.scale = scale;
        }
      } catch (error) {
        const cancelled = error?.name === 'RenderingCancelledException' || requestId !== this.renderRequestId || token !== this.renderToken;
        if (!cancelled) {
          this.status.textContent = '渲染失败';
          console.error('PDF page render failed:', error);
        }
      } finally {
        if (this.renderTask === renderTask) this.renderTask = null;
        if (requestId === this.renderRequestId) this.setBusy(false);
      }
    }

    async goToPage(pageNumber) {
      if (!this.pdf) {
        return;
      }

      this.pageNumber = Math.min(Math.max(1, pageNumber), this.pdf.numPages);
      await this.renderPage();
    }

    setScale(scale) {
      this.fitMode = 'custom';
      this.scale = Math.min(3, Math.max(0.35, scale));
      this.renderPage();
    }

    setBusy(busy) {
      this.busy = busy;
      this.updateNavigation();
    }

    updateNavigation() {
      const disabled = this.busy || !this.pdf;

      if (this.previousButton) {
        this.previousButton.disabled = disabled || this.pageNumber <= 1;
      }

      if (this.nextButton) {
        this.nextButton.disabled = disabled || this.pageNumber >= this.pdf.numPages;
      }

      [
        this.zoomOutButton,
        this.zoomInButton,
        this.fitWidthButton,
        this.fitPageButton
      ].forEach((button) => {
        if (button) {
          button.disabled = disabled;
        }
      });

      if (this.pageInput) {
        this.pageInput.disabled = this.busy || !this.pdf;
      }
    }
  }

  class ContinuousPdfReader {
    constructor(options) {
      this.container = options.container;
      this.emptyState = options.emptyState;
      this.pdf = null;
      this.pageNodes = [];
      this.renderToken = 0;
      this.observer = null;
      this.resizeTimer = 0;
      this.scrollFrame = 0;
      this.pendingLoad = null;
      this.renderQueue = [];
      this.activeRenders = 0;
      this.maxConcurrentRenders = 2;
      // Canvas backing stores use roughly four bytes per pixel.
      this.maxCanvasPixels = 10 * 1024 * 1024;
      this.pageUseSequence = 0;
      this.suspended = false;
      this.destroyTimer = 0;
      this.documentKeepAliveMs = 5 * 60 * 1000;

      window.addEventListener('resize', () => {
        window.clearTimeout(this.resizeTimer);
        this.resizeTimer = window.setTimeout(() => this.refreshVisiblePages(), 150);
      });
      window.addEventListener('scroll', () => this.scheduleViewportMaintenance(), { passive: true });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.suspend();
        } else if (this.container.getClientRects().length) {
          this.resume();
        }
      });
    }

    async load(url) {
      if (url === this.pendingLoad) {
        if (this.pdf) {
          this.resume();
        } else if (this.suspended) {
          this.pendingLoad = null;
          return this.load(url);
        }
        return;
      }

      const token = ++this.renderToken;
      await this.destroyDocument();
      this.pendingLoad = url;
      this.suspended = false;
      this.emptyState.hidden = false;
      this.emptyState.textContent = '正在加载 PDF';

      try {
        const pdfjs = await loadPdfJs();
        const pdf = await loadPdfDocument(pdfjs, url);

        if (token !== this.renderToken) {
          await pdf.destroy();
          return;
        }

        this.removeRenderedPages();
        this.pdf = pdf;
        this.pageNodes = [];
        this.pageUseSequence = 0;
        this.container.scrollTop = 0;
        const firstPage = await pdf.getPage(1);
        if (token !== this.renderToken) {
          firstPage.cleanup();
          return;
        }
        const firstViewport = firstPage.getViewport({ scale: 1 });
        const defaultAspectRatio = `${firstViewport.width} / ${firstViewport.height}`;
        firstPage.cleanup();

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const section = document.createElement('section');
          const canvas = document.createElement('canvas');
          const pageStatus = document.createElement('span');

          section.className = 'continuous-page';
          section.style.aspectRatio = defaultAspectRatio;
          canvas.className = 'continuous-page-canvas';
          canvas.hidden = true;
          canvas.width = 1;
          canvas.height = 1;
          pageStatus.className = 'continuous-page-status';
          pageStatus.textContent = pageNumber === 1 ? '正在打开第 1 页' : `第 ${pageNumber} 页加载中`;
          section.append(canvas, pageStatus);
          this.container.appendChild(section);
          this.pageNodes.push({ pageNumber, section, canvas, pageStatus, rendered: false, rendering: false, queued: false, renderTask: null, page: null, renderVersion: 0, lastUsedAt: 0 });
        }

        await this.waitForStableLayout(token);
        if (token !== this.renderToken) {
          return;
        }

        this.emptyState.hidden = true;
        // Give the first page exclusive access to the network and worker. On
        // non-linearized PDFs, rendering nearby pages in parallel delays the
        // first useful frame substantially on mobile connections.
        await this.renderPage(this.pageNodes[0], token);
        if (token !== this.renderToken || this.suspended) {
          return;
        }
        this.observePages();
        this.refreshVisiblePages();
      } catch (error) {
        if (token !== this.renderToken) {
          return;
        }

        console.error('Audience PDF load failed:', error);
        const failedPdf = this.pdf;
        this.pdf = null;
        this.pendingLoad = null;
        this.removeRenderedPages();
        this.pageNodes = [];
        await failedPdf?.destroy?.();
        this.emptyState.hidden = false;
        this.emptyState.textContent = 'PDF 加载失败，请重新打开。';
      }
    }

    async waitForStableLayout(token) {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        if (token !== this.renderToken) {
          return;
        }

        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        if (width > 0 && height > 0) {
          return;
        }

        await new Promise((resolve) => window.setTimeout(resolve, 50));
      }
    }

    clear(message = '正在等待演讲者上传 PDF') {
      this.renderToken += 1;
      this.pendingLoad = null;
      this.destroyDocument();
      this.emptyState.hidden = false;
      this.emptyState.textContent = message;
    }

    removeRenderedPages() {
      this.pageNodes.forEach((node) => {
        this.releasePage(node);
        node.section.remove();
      });
    }

    observePages() {
      this.observer?.disconnect();

      if (!window.IntersectionObserver) {
        this.refreshVisiblePages();
        return;
      }

      this.observer = new IntersectionObserver(
        (entries) => {
          entries
            .filter((entry) => entry.isIntersecting)
            .forEach((entry) => {
              const node = this.pageNodes.find((item) => item.section === entry.target);
              if (node) {
                this.touchPage(node);
                this.enqueuePage(node, this.renderToken);
              }
            });
          this.scheduleViewportMaintenance();
        },
        {
          root: null,
          rootMargin: '480px 0px'
        }
      );

      this.pageNodes.forEach((node) => this.observer.observe(node.section));
    }

    enqueuePage(node, token) {
      if (!node || node.rendered || node.rendering || node.queued || token !== this.renderToken || this.suspended) return;
      node.queued = true;
      this.renderQueue.push({ node, token });
      this.pumpRenderQueue();
    }

    pumpRenderQueue() {
      while (!this.suspended && this.activeRenders < this.maxConcurrentRenders && this.renderQueue.length) {
        const job = this.renderQueue.shift();
        job.node.queued = false;
        if (job.token !== this.renderToken || job.node.rendered || job.node.rendering) continue;
        this.activeRenders += 1;
        this.renderPage(job.node, job.token).finally(() => {
          this.activeRenders = Math.max(0, this.activeRenders - 1);
          this.pumpRenderQueue();
        });
      }
    }

    async renderPage(node, token) {
      if (!this.pdf || token !== this.renderToken || node.rendered || node.rendering) {
        return;
      }

      node.rendering = true;
      node.section.classList.add('is-loading');
      node.section.classList.remove('is-rendered', 'is-error');
      node.pageStatus.hidden = false;
      node.pageStatus.textContent = node.pageNumber === 1 ? '正在打开第 1 页' : `第 ${node.pageNumber} 页加载中`;
      const nodeVersion = node.renderVersion;
      let page = null;
      let renderTask = null;

      try {
        page = await this.pdf.getPage(node.pageNumber);
        node.page = page;
        if (token !== this.renderToken || nodeVersion !== node.renderVersion || this.suspended) {
          return;
        }

        const baseViewport = page.getViewport({ scale: 1 });
        const availableWidth = Math.max(240, this.container.clientWidth - 24);
        const scale = availableWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });
        const deviceScale = Math.min(window.devicePixelRatio || 1, 1.5);
        const pixelBudgetScale = Math.sqrt(1800000 / Math.max(1, viewport.width * viewport.height));
        const outputScale = Math.max(1, Math.min(deviceScale, pixelBudgetScale));
        const context = node.canvas.getContext('2d', { alpha: false });

        node.canvas.width = Math.floor(viewport.width * outputScale);
        node.canvas.height = Math.floor(viewport.height * outputScale);
        node.canvas.style.width = `${Math.floor(viewport.width)}px`;
        node.canvas.style.height = `${Math.floor(viewport.height)}px`;
        context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, viewport.width, viewport.height);
        renderTask = page.render({ canvasContext: context, viewport });
        node.renderTask = renderTask;
        await renderTask.promise;
        if (token !== this.renderToken || nodeVersion !== node.renderVersion || this.suspended) return;
        node.section.style.aspectRatio = `${baseViewport.width} / ${baseViewport.height}`;
        node.canvas.hidden = false;
        node.pageStatus.hidden = true;
        node.section.classList.remove('is-loading');
        node.section.classList.add('is-rendered');
        node.rendered = true;
        this.touchPage(node);
        this.enforceCanvasBudget();
      } catch (error) {
        const cancelled = error?.name === 'RenderingCancelledException' || token !== this.renderToken || this.suspended;
        if (!cancelled) {
          node.section.classList.remove('is-loading');
          node.section.classList.add('is-error');
          node.pageStatus.hidden = false;
          node.pageStatus.textContent = `第 ${node.pageNumber} 页加载失败，请稍后重试`;
          console.error(`Audience PDF page ${node.pageNumber} render failed:`, error);
        }
      } finally {
        if (node.renderTask === renderTask) node.renderTask = null;
        page?.cleanup?.();
        if (node.page === page) node.page = null;
        if (nodeVersion === node.renderVersion) node.rendering = false;
      }
    }

    refreshVisiblePages() {
      if (!this.pdf || this.suspended) return;
      const visibleNodes = this.pageNodes.filter((node) => {
        const rect = node.section.getBoundingClientRect();
        return rect.bottom > -480 && rect.top < window.innerHeight + 480;
      });
      visibleNodes.forEach((node) => {
        this.touchPage(node);
        this.enqueuePage(node, this.renderToken);
      });
      this.enforceCanvasBudget();
    }

    scheduleViewportMaintenance() {
      if (this.scrollFrame || this.suspended) return;
      this.scrollFrame = window.requestAnimationFrame(() => {
        this.scrollFrame = 0;
        this.refreshVisiblePages();
      });
    }

    touchPage(node) {
      node.lastUsedAt = ++this.pageUseSequence;
    }

    isNearViewport(node) {
      const rect = node.section.getBoundingClientRect();
      return rect.bottom > -480 && rect.top < window.innerHeight + 480;
    }

    getCanvasPixels(node) {
      return node.canvas.width > 1 && node.canvas.height > 1
        ? node.canvas.width * node.canvas.height
        : 0;
    }

    enforceCanvasBudget() {
      let totalPixels = this.pageNodes.reduce((total, node) => total + this.getCanvasPixels(node), 0);
      if (totalPixels <= this.maxCanvasPixels) return;

      const candidates = this.pageNodes
        // Keep the opening spread hot so returning to the top is immediate.
        .filter((node) => node.pageNumber > 2 && node.rendered && !node.rendering && !this.isNearViewport(node))
        .sort((left, right) => left.lastUsedAt - right.lastUsedAt);

      for (const node of candidates) {
        if (totalPixels <= this.maxCanvasPixels) break;
        totalPixels -= this.getCanvasPixels(node);
        this.releasePage(node);
      }
    }

    releasePage(node) {
      node.renderVersion += 1;
      this.renderQueue = this.renderQueue.filter((job) => job.node !== node);
      node.renderTask?.cancel?.();
      node.renderTask = null;
      node.page?.cleanup?.();
      node.page = null;
      node.rendered = false;
      node.rendering = false;
      node.queued = false;
      node.lastUsedAt = 0;
      node.section.classList.remove('is-loading', 'is-rendered', 'is-error');
      node.pageStatus.hidden = false;
      node.pageStatus.textContent = `第 ${node.pageNumber} 页加载中`;
      node.canvas.hidden = true;
      node.canvas.width = 1;
      node.canvas.height = 1;
      node.canvas.style.width = '';
      node.canvas.style.height = '';
    }

    suspend() {
      if (this.suspended) return;
      this.suspended = true;
      this.observer?.disconnect();
      this.renderQueue = [];
      this.pageNodes.forEach((node) => this.releasePage(node));
      window.clearTimeout(this.destroyTimer);
      this.destroyTimer = window.setTimeout(() => {
        if (this.suspended) this.destroyDocument(true);
      }, this.documentKeepAliveMs);
    }

    resume() {
      window.clearTimeout(this.destroyTimer);
      if (!this.pdf) {
        const url = this.pendingLoad;
        this.pendingLoad = null;
        if (url) this.load(url);
        return;
      }
      this.suspended = false;
      this.observePages();
      this.refreshVisiblePages();
    }

    async destroyDocument(preserveUrl = false) {
      window.clearTimeout(this.destroyTimer);
      this.observer?.disconnect();
      this.renderQueue = [];
      this.removeRenderedPages();
      this.pageNodes = [];
      const pdf = this.pdf;
      this.pdf = null;
      if (!preserveUrl) this.pendingLoad = null;
      try {
        await pdf?.destroy?.();
      } catch (error) {
        console.warn('Audience PDF cleanup failed:', error);
      }
    }
  }

  async function loadPdfDocument(pdfjs, url) {
    const options = {
      cMapUrl: '/pdfjs/cmaps/',
      cMapPacked: true,
      disableAutoFetch: true,
      disableStream: true,
      rangeChunkSize: 1024 * 1024
    };
    return pdfjs.getDocument({ ...options, url }).promise;
  }

  window.LivePdfReader = PdfReader;
  window.ContinuousPdfReader = ContinuousPdfReader;
})();
