/**
 * 初见 Onboard · DOM 工具
 */
(function (root) {
  var O = root.Onboard;

  var ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  /** HTML 转义，所有拼进 innerHTML 的用户/制度文本都必须过一遍 */
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, function (ch) {
      return ESCAPE_MAP[ch];
    });
  }

  function $(selector, context) {
    return (context || document).querySelector(selector);
  }

  function $$(selector, context) {
    return Array.prototype.slice.call((context || document).querySelectorAll(selector));
  }

  /**
   * 建元素：h('div', {class:'x', onclick:fn}, ['文本', h('span')])
   * 属性名 on* 视为事件，其余走 setAttribute；value/class/checked 用 property。
   */
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    var key;
    if (attrs) {
      for (key in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, key)) continue;
        var val = attrs[key];
        if (val === null || val === undefined || val === false) continue;
        if (key.indexOf('on') === 0 && typeof val === 'function') {
          el.addEventListener(key.slice(2).toLowerCase(), val);
        } else if (key === 'class' || key === 'className') {
          el.className = val;
        } else if (key === 'text') {
          el.textContent = val;
        } else if (key === 'html') {
          el.innerHTML = val;
        } else if (key === 'value') {
          el.value = val;
        } else if (key === 'checked' || key === 'disabled' || key === 'selected') {
          el[key] = !!val;
        } else if (key === 'style' && typeof val === 'object') {
          for (var s in val) { if (val[s] !== null && val[s] !== undefined) el.style[s] = val[s]; }
        } else {
          el.setAttribute(key, val);
        }
      }
    }
    appendChildren(el, children);
    return el;
  }

  function appendChildren(el, children) {
    if (children === null || children === undefined) return;
    if (Array.isArray(children)) {
      children.forEach(function (c) { appendChildren(el, c); });
      return;
    }
    if (children instanceof Node) {
      el.appendChild(children);
      return;
    }
    el.appendChild(document.createTextNode(String(children)));
  }

  /** 事件委托：on(container, 'click', '.btn', handler) */
  function on(container, type, selector, handler) {
    container.addEventListener(type, function (event) {
      var target = event.target;
      while (target && target !== container) {
        if (target.matches && target.matches(selector)) {
          handler.call(target, event, target);
          return;
        }
        target = target.parentNode;
      }
    });
  }

  function clear(el) {
    while (el && el.firstChild) el.removeChild(el.firstChild);
    return el;
  }

  function scrollToBottom(el, smooth) {
    if (!el) return;
    if (smooth === false) {
      el.scrollTop = el.scrollHeight;
      return;
    }
    try {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } catch (e) {
      el.scrollTop = el.scrollHeight;
    }
  }

  O.dom = {
    h: h,
    $: $,
    $$: $$,
    on: on,
    clear: clear,
    escapeHtml: escapeHtml,
    scrollToBottom: scrollToBottom
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
