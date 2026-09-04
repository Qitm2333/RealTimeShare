(function () {
  const keys = new Set(['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'ArrowLeft', 'ArrowUp', 'PageUp']);

  window.addEventListener('keydown', (event) => {
    if (!keys.has(event.key)) {
      return;
    }

    event.preventDefault();
    window.parent.postMessage({ type: 'slide-key', key: event.key }, window.location.origin);
  });
})();
