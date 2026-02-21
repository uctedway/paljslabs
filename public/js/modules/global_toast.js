(function attachGlobalToast() {
  if (typeof window === 'undefined') return;
  if (window.AppToast) return;

  var container = null;
  var timer = null;

  function ensureContainer() {
    if (container) return container;
    container = document.createElement('div');
    container.className = 'app-toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'true');
    document.body.appendChild(container);
    return container;
  }

  function clearTimer() {
    if (!timer) return;
    window.clearTimeout(timer);
    timer = null;
  }

  function removeToast(toastEl) {
    if (!toastEl) return;
    toastEl.classList.remove('is-visible');
    window.setTimeout(function () {
      if (toastEl && toastEl.parentNode) {
        toastEl.parentNode.removeChild(toastEl);
      }
    }, 180);
  }

  function show(message, options) {
    var text = String(message || '').trim();
    if (!text) return;

    var opts = options || {};
    var type = String(opts.type || 'info').toLowerCase();
    var duration = Number(opts.duration || 2200);
    if (!Number.isFinite(duration) || duration < 800) duration = 2200;

    var root = ensureContainer();
    clearTimer();
    root.innerHTML = '';

    var toastEl = document.createElement('div');
    toastEl.className = 'app-toast app-toast--' + type;
    toastEl.textContent = text;
    root.appendChild(toastEl);

    window.requestAnimationFrame(function () {
      toastEl.classList.add('is-visible');
    });

    timer = window.setTimeout(function () {
      removeToast(toastEl);
    }, duration);
  }

  window.AppToast = { show: show };
})();
