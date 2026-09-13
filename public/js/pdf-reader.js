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
      this.pendingLoad = null;

      window.addEventListener('resize', () => {
        window.clearTimeout(this.resizeTimer);
        this.resizeTimer = window.setTimeout(() => this.renderVisiblePages(), 120);
      });
    }

    async load(url) {
      if (url === this.pendingLoad) {
        if (this.pdf) {
          this.renderVisiblePages();
        }
        return;
      }

      const token = ++this.renderToken;
      this.pendingLoad = url;
      this.emptyState.hidden = false;
      this.emptyState.textContent = '正在加载 PDF';

      try {
        const pdfjs = await loadPdfJs();
        const pdf = await loadPdfDocument(pdfjs, url);

        if (token !== this.renderToken) {
          return;
        }

        this.removeRenderedPages();
        this.pdf = pdf;
        this.pageNodes = [];
        this.container.scrollTop = 0;

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const section = document.createElement('section');
          const canvas = document.createElement('canvas');

          section.className = 'continuous-page';
          section.style.aspectRatio = `${baseViewport.width} / ${baseViewport.height}`;
          canvas.className = 'continuous-page-canvas';
          section.append(canvas);
          this.container.appendChild(section);
          this.pageNodes.push({ pageNumber, section, canvas, rendered: false, rendering: false });
        }

        await this.waitForStableLayout(token);
        if (token !== this.renderToken) {
          return;
        }

        this.emptyState.hidden = true;
        await this.renderPage(this.pageNodes[0], token);
        this.observePages();
      } catch (error) {
        if (token !== this.renderToken) {
          return;
        }

        console.error('Audience PDF load failed:', error);
        this.pdf = null;
        this.pendingLoad = null;
        this.removeRenderedPages();
        this.pageNodes = [];
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
      this.pdf = null;
      this.pendingLoad = null;
      this.observer?.disconnect();
      this.removeRenderedPages();
      this.pageNodes = [];
      this.emptyState.hidden = false;
      this.emptyState.textContent = message;
    }

    removeRenderedPages() {
      this.pageNodes.forEach((node) => node.section.remove());
    }

    observePages() {
      this.observer?.disconnect();

      if (!window.IntersectionObserver) {
        this.pageNodes.forEach((node) => this.renderPage(node, this.renderToken));
        return;
      }

      this.observer = new IntersectionObserver(
        (entries) => {
          entries
            .filter((entry) => entry.isIntersecting)
            .forEach((entry) => {
              const node = this.pageNodes.find((item) => item.section === entry.target);
              if (node) {
                this.renderPage(node, this.renderToken);
              }
            });
        },
        {
          root: this.container,
          rootMargin: '520px 0px'
        }
      );

      this.pageNodes.forEach((node) => this.observer.observe(node.section));
    }

    async renderPage(node, token) {
      if (!this.pdf || token !== this.renderToken || node.rendered || node.rendering) {
        return;
      }

      node.rendering = true;

      try {
        const page = await this.pdf.getPage(node.pageNumber);
        if (token !== this.renderToken) {
          return;
        }

        const baseViewport = page.getViewport({ scale: 1 });
        const availableWidth = Math.max(240, this.container.clientWidth - 24);
        const scale = availableWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const context = node.canvas.getContext('2d', { alpha: false });

        node.canvas.width = Math.floor(viewport.width * outputScale);
        node.canvas.height = Math.floor(viewport.height * outputScale);
        node.canvas.style.width = `${Math.floor(viewport.width)}px`;
        node.canvas.style.height = `${Math.floor(viewport.height)}px`;
        context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, viewport.width, viewport.height);
        await page.render({ canvasContext: context, viewport }).promise;
        node.section.style.aspectRatio = `${baseViewport.width} / ${baseViewport.height}`;
        node.rendered = true;
      } finally {
        node.rendering = false;
      }
    }

    renderVisiblePages() {
      if (!this.pdf) {
        return;
      }

      this.pageNodes.forEach((node) => {
        node.rendered = false;
      });

      this.pageNodes
        .filter((node) => {
          const rect = node.section.getBoundingClientRect();
          return rect.bottom > -520 && rect.top < window.innerHeight + 520;
        })
        .forEach((node) => this.renderPage(node, this.renderToken));
    }
  }

  async function loadPdfDocument(pdfjs, url) {
    const options = {
      cMapUrl: '/pdfjs/cmaps/',
      cMapPacked: true
    };

    try {
      return await pdfjs.getDocument({ ...options, url }).promise;
    } catch (initialError) {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        throw initialError;
      }

      const data = new Uint8Array(await response.arrayBuffer());
      return pdfjs.getDocument({ ...options, data }).promise;
    }
  }

  window.LivePdfReader = PdfReader;
  window.ContinuousPdfReader = ContinuousPdfReader;
})();
