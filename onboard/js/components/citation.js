/**
 * 初见 Onboard · 依据卡
 *
 * 每条依据都必须能被员工逐字核对：制度名 + 条款号 + 版本号 + 制度原文。
 */
(function (root) {
  var O = root.Onboard;
  O.components = O.components || {};

  var bound = false;

  function esc(s) { return O.dom.escapeHtml(s); }

  function renderOne(cit) {
    var fullId = 'full-' + cit.clauseId;
    return '' +
      '<div class="citation" data-citation="' + esc(cit.clauseId) + '">' +
        '<button class="citation-head" type="button" aria-expanded="false">' +
          '<span class="citation-caret" aria-hidden="true">▶</span>' +
          '<span class="citation-title">《' + esc(cit.policyTitle) + '》</span>' +
          '<span class="citation-meta">' +
            '<span class="citation-no">' + esc(cit.clauseNo) + '</span>' +
            '<span class="citation-ver">' + esc(cit.version) + '</span>' +
          '</span>' +
        '</button>' +
        '<div class="citation-body">' +
          '<div class="citation-heading">' + esc(cit.clauseHeading || '') + '</div>' +
          '<div class="citation-text">' + esc(cit.excerpt || '') + '</div>' +
          '<button class="citation-more" type="button" data-target="' + esc(fullId) + '">查看该条完整原文 ▾</button>' +
          '<div class="citation-full" id="' + esc(fullId) + '" hidden>' +
            '<div class="citation-full-label">《' + esc(cit.policyTitle) + '》' + esc(cit.clauseNo) + ' · 原文全文</div>' +
            '<div>' + esc(cit.fullText || '') + '</div>' +
          '</div>' +
          '<div class="citation-source">来源：' + esc(cit.source || '示例制度库') +
            ' · 部门：' + esc(cit.policyOwner || '—') +
            ' · 生效日期：' + esc(cit.effectiveDate || '—') +
            ' · 命中度 ' + Math.round((cit.score || 0) * 100) + '%</div>' +
        '</div>' +
      '</div>';
  }

  function render(citations, label) {
    var list = citations || [];
    if (!list.length) return null;
    var wrap = document.createElement('div');
    wrap.className = 'citations';
    wrap.innerHTML =
      '<div class="citations-head">' +
        '<span>' + esc(label || '依据') + '</span>' +
        '<span class="citations-count">' + list.length + '</span>' +
        '<span class="citations-tip">点开可以核对制度原文</span>' +
      '</div>' +
      list.map(renderOne).join('');
    return wrap;
  }

  function bind() {
    if (bound || !root.document) return;
    bound = true;
    root.document.addEventListener('click', function (event) {
      var head = event.target.closest ? event.target.closest('.citation-head') : null;
      if (head) {
        var box = head.parentNode;
        var open = box.classList.toggle('is-open');
        head.setAttribute('aria-expanded', open ? 'true' : 'false');
        return;
      }
      var more = event.target.closest ? event.target.closest('.citation-more') : null;
      if (more) {
        var target = root.document.getElementById(more.getAttribute('data-target'));
        if (!target) return;
        var visible = !target.hasAttribute('hidden');
        if (visible) {
          target.setAttribute('hidden', 'hidden');
          more.textContent = '查看该条完整原文 ▾';
        } else {
          target.removeAttribute('hidden');
          more.textContent = '收起完整原文 ▴';
        }
      }
    });
  }

  O.components.citation = { render: render, bind: bind };
})(typeof globalThis !== 'undefined' ? globalThis : this);
