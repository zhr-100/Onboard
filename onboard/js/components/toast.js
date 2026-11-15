/**
 * 初见 Onboard · 轻提示
 */
(function (root) {
  var O = root.Onboard;
  O.components = O.components || {};

  function wrap() {
    var el = root.document.getElementById('toastWrap');
    if (!el) {
      el = root.document.createElement('div');
      el.id = 'toastWrap';
      el.className = 'toast-wrap';
      root.document.body.appendChild(el);
    }
    return el;
  }

  function show(message, type) {
    if (!root.document) return;
    var el = root.document.createElement('div');
    el.className = 'toast' + (type ? ' toast-' + type : '');
    el.textContent = message;
    wrap().appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transition = 'opacity .25s';
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 260);
    }, 2600);
  }

  O.components.toast = { show: show };
})(typeof globalThis !== 'undefined' ? globalThis : this);
