/**
 * 初见 Onboard · 制度中心（员工端）
 *
 * 员工在这里查公司制度：卡片列表 + 分类筛选 + 名称搜索 + 正文预览。
 *
 * 关键约定：**谁能看到哪份制度完全由服务端判断**
 * （server/knowledge.js 里的 visibilityOf，列表 / 详情 / 下载 / 问答共用）。
 * 这个页面只负责展示服务端返回的结果，不再自己写一套适用范围过滤，
 * 免得两处各写一套、越走越偏。
 */
(function (root) {
  var O = root.Onboard;
  O.pages = O.pages || {};

  var panel = null;
  var currentUser = null;
  var el = {};

  var state = {
    items: [],
    identity: { employeeId: null, name: '', dept: '' },
    hasSample: false,
    category: '',
    keyword: '',
    loading: false,
    detailId: null,
    detail: null
  };

  function esc(s) { return O.dom.escapeHtml(s); }

  function init(user) {
    currentUser = user;
    panel = document.getElementById('policiesPanel');
    bindStatic();
    if (!panel) return;

    if (!O.store || O.store.mode !== 'server') {
      panel.innerHTML =
        '<div class="empty">' +
          '<div class="empty-icon">🔌</div>' +
          '<div class="empty-title">制度中心需要本地服务</div>' +
          '<div class="empty-desc">请在项目文件夹里运行 <b>node server.js</b>，然后打开 <b>http://localhost:3000</b>。</div>' +
        '</div>';
      return;
    }

    // 重新登录时把上次留下的弹窗关掉
    if (el.modal) el.modal.hidden = true;
    state.detailId = null;
    state.detail = null;

    renderShell();
    refresh();
  }

  function onShow(pane) {
    if (pane !== 'policies') {
      if (el.modal && !el.modal.hidden) closeDetailModal();
      return;
    }
    if (!O.store || O.store.mode !== 'server') return;
    refresh();
  }

  function liveUser() {
    if (!currentUser) return null;
    return O.auth.findById(currentUser.id) || currentUser;
  }

  /* ---------------------------------------------------------
   * 页面骨架
   * ------------------------------------------------------- */

  function renderShell() {
    panel.innerHTML =
      '<div class="pol-banner">' +
        '<div class="pol-banner-text">' +
          '<h2>每一项制度，都有清晰的依据</h2>' +
          '<p id="polBannerDesc">正在确认你的可见范围…</p>' +
        '</div>' +
      '</div>' +
      '<div class="pol-toolbar">' +
        '<select class="select pol-filter" id="polCategoryFilter" aria-label="按分类筛选"></select>' +
        '<input class="input pol-search" id="polSearch" type="search" placeholder="按制度名称搜索" aria-label="按制度名称搜索">' +
        '<span class="pol-count" id="polCount"></span>' +
      '</div>' +
      '<div id="polBody"></div>' +
      '<p class="text-xs text-muted pol-footnote" id="polFootnote"></p>';

    el.categoryFilter = document.getElementById('polCategoryFilter');
    el.search = document.getElementById('polSearch');
    el.bannerDesc = document.getElementById('polBannerDesc');
    el.count = document.getElementById('polCount');
    el.body = document.getElementById('polBody');
    el.footnote = document.getElementById('polFootnote');

    // 列表内容会反复替换，事件只在容器上绑一次
    O.dom.on(el.body, 'click', '[data-open]', function (event, btn) {
      openDetailModal(btn.getAttribute('data-open'));
    });

    el.categoryFilter.addEventListener('change', function () {
      state.category = el.categoryFilter.value;
      renderBody();
    });

    el.search.addEventListener('input', function () {
      state.keyword = el.search.value.trim();
      renderBody();
    });
  }

  /* ---------------------------------------------------------
   * 数据
   * ------------------------------------------------------- */

  /** 制度中心永远以「当前登录用户本人」的身份查看（不是问答里可切换的模拟身份） */
  function setActingSelf() {
    var user = liveUser();
    if (!user || !O.knowledge || !O.knowledge.setActing) return;
    var employees = O.store.get('employees') || [];
    var mine = user.employeeId
      ? employees.filter(function (e) { return e.id === user.employeeId; })[0]
      : null;
    O.knowledge.setActing(mine || {
      id: null,
      name: user.name || '',
      dept: user.dept || ''
    });
  }

  function refresh() {
    if (state.loading) return Promise.resolve();
    setActingSelf();
    state.loading = true;
    var ready = O.store.syncNow ? O.store.syncNow() : Promise.resolve();
    return ready.then(function () {
      return O.knowledge.visiblePolicies();
    }).then(function (data) {
      state.items = (data && data.items) || [];
      state.identity = (data && data.identity) || state.identity;
      state.hasSample = !!(data && data.hasSample);
      state.loading = false;
      renderBanner();
      fillCategories();
      renderBody();
      renderFootnote();
      if (state.detailId) refreshDetail();
    }).catch(function (error) {
      state.loading = false;
      renderError(error);
    });
  }

  function renderBanner() {
    var dept = state.identity && state.identity.dept ? state.identity.dept : '未分配部门';
    var name = state.identity && state.identity.name ? state.identity.name : '';
    el.bannerDesc.innerHTML =
      '你所在的部门是 <b>' + esc(dept) + '</b>' +
      (name ? '（' + esc(name) + '）' : '') +
      '，可查看<b>全员</b>及<b>本部门</b>的有效制度。';
  }

  function fillCategories() {
    var seen = {};
    var list = [];
    state.items.forEach(function (item) {
      var c = item.category || '未分类';
      if (seen[c]) return;
      seen[c] = true;
      list.push(c);
    });
    var options = ['<option value="">全部分类</option>'].concat(list.map(function (c) {
      return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
    }));
    var current = state.category;
    el.categoryFilter.innerHTML = options.join('');
    if (current && list.indexOf(current) >= 0) el.categoryFilter.value = current;
    else state.category = '';
  }

  function matchesFilters(item) {
    if (state.category && (item.category || '未分类') !== state.category) return false;
    if (state.keyword) {
      var text = String(item.title || '').toLowerCase();
      if (text.indexOf(state.keyword.toLowerCase()) < 0) return false;
    }
    return true;
  }

  function renderBody() {
    var list = state.items.filter(matchesFilters);
    el.count.textContent = list.length === state.items.length
      ? ('共 ' + list.length + ' 份')
      : ('共 ' + list.length + ' 份（全部 ' + state.items.length + ' 份）');

    if (!state.items.length) {
      el.body.innerHTML =
        '<div class="empty">' +
          '<div class="empty-icon">📄</div>' +
          '<div class="empty-title">暂时没有你可以查看的制度</div>' +
          '<div class="empty-desc">' +
            '制度发布后才会出现在这里。如果你觉得应该有制度但没看到，' +
            '可能是还没发布、尚未生效，或者不适用于你所在的部门 —— ' +
            '需要的话可以转人工找 HR 确认。' +
          '</div>' +
        '</div>';
      return;
    }

    if (!list.length) {
      el.body.innerHTML =
        '<div class="empty">' +
          '<div class="empty-icon">🔍</div>' +
          '<div class="empty-title">没有符合条件的制度</div>' +
          '<div class="empty-desc">换个分类或搜索词试试，也可以清空筛选查看全部 ' + state.items.length + ' 份制度。</div>' +
        '</div>';
      return;
    }

    el.body.innerHTML = '<div class="pol-grid">' + list.map(cardHtml).join('') + '</div>';
  }

  function cardHtml(item) {
    var scopeClass = item.scope === 'all' ? 'is-all' : 'is-dept';
    return '' +
      '<article class="pol-card">' +
        '<div class="pol-card-top">' +
          '<span class="pol-file-icon" aria-hidden="true">' + fileIcon(item.ext) + '</span>' +
          '<span class="pol-scope ' + scopeClass + '">' + esc(item.scopeLabel || '全员可见') + '</span>' +
        '</div>' +
        '<div class="pol-category">' + esc(item.category || '未分类') + '</div>' +
        '<h3 class="pol-title">' + esc(item.title) + '</h3>' +
        '<dl class="pol-meta">' +
          '<div><dt>版本</dt><dd>' + esc(item.version || '—') + '</dd></div>' +
          '<div><dt>生效日期</dt><dd>' + esc(item.effectiveDate || '—') + '</dd></div>' +
        '</dl>' +
        '<button class="btn btn-ghost btn-sm pol-open" type="button" data-open="' + esc(item.id) + '">查看制度正文</button>' +
      '</article>';
  }

  function fileIcon(ext) {
    switch (String(ext || '').toLowerCase()) {
      case '.pdf': return '📕';
      case '.docx': return '📘';
      case '.txt': return '📄';
      case '.md': return '📝';
      default: return '📄';
    }
  }

  function renderFootnote() {
    if (!state.hasSample) {
      el.footnote.hidden = true;
      el.footnote.textContent = '';
      return;
    }
    el.footnote.hidden = false;
    el.footnote.innerHTML =
      '提示：标题里带「<b>示例</b>」的制度为演示内容，<b>仅用于演示，正式使用前由管理员替换</b>。';
  }

  function renderError(error) {
    if (!el.body) return;
    var message = (error && error.message) ? error.message : '读取失败';
    var hint;
    if (error && error.status === 401) {
      hint = '登录状态已失效，请重新登录。';
    } else if (error && error.status === 403) {
      hint = '你的角色没有查看制度的权限。';
    } else {
      hint = '请确认 node server.js 还在运行，然后刷新页面。';
    }
    el.body.innerHTML =
      '<div class="empty">' +
        '<div class="empty-icon">⚠️</div>' +
        '<div class="empty-title">' + esc(message) + '</div>' +
        '<div class="empty-desc">' + esc(hint) + '</div>' +
      '</div>';
  }

  /* ---------------------------------------------------------
   * 详情
   * ------------------------------------------------------- */

  function openDetailModal(id) {
    state.detailId = id;
    state.detail = null;
    el.detailTitle.textContent = '制度正文';
    el.detailMeta.innerHTML = '<p class="text-muted">加载中…</p>';
    el.detailBody.innerHTML = '';
    el.downloadBtn.hidden = true;
    el.modal.hidden = false;
    loadDetail(id);
  }

  function closeDetailModal() {
    el.modal.hidden = true;
    state.detailId = null;
    state.detail = null;
  }

  function loadDetail(id) {
    return O.knowledge.previewPolicy(id).then(function (data) {
      if (state.detailId !== id) return;
      state.detail = data;
      renderDetail(data);
    }).catch(function (error) {
      if (state.detailId !== id) return;
      el.detailMeta.innerHTML =
        '<div class="form-error">' + esc((error && error.message) || '读取失败') + '</div>';
    });
  }

  function refreshDetail() {
    if (!state.detailId) return;
    var item = state.items.filter(function (x) { return x.id === state.detailId; })[0];
    if (!item) {
      closeDetailModal();
      return;
    }
    if (state.detail) {
      state.detail.item = item;
      renderDetail(state.detail);
    }
  }

  function renderDetail(data) {
    var item = data.item || {};
    el.detailTitle.textContent = item.title || '制度正文';

    var rows = [
      ['分类', item.category],
      ['适用范围', item.scopeLabel],
      ['版本', item.version],
      ['生效日期', item.effectiveDate],
      ['来源', item.source === 'sample' ? '公司制度库（示例）' : '制度知识库']
    ];
    if (item.originalName) rows.push(['原始文件', item.originalName]);

    el.detailMeta.innerHTML =
      '<dl class="dl kb-detail-dl">' +
        rows.map(function (row) {
          var value = (row[1] === undefined || row[1] === null || row[1] === '') ? '—' : row[1];
          return '<dt>' + esc(row[0]) + '</dt><dd>' + esc(value) + '</dd>';
        }).join('') +
      '</dl>';

    var blocks = data.blocks || [];
    if (!blocks.length) {
      el.detailBody.innerHTML = '<div class="kb-preview-empty">这份制度暂时没有可显示的正文内容。</div>';
    } else {
      el.detailBody.innerHTML = '<div class="kb-preview">' + blocks.map(blockHtml).join('') + '</div>';
    }

    el.downloadBtn.hidden = !item.hasFile;
  }

  function blockHtml(block) {
    if (block.type === 'heading') {
      var level = Math.min(Math.max(Number(block.level || 1), 1), 4);
      return '<h' + level + ' class="kb-preview-h">' + esc(block.text) + '</h' + level + '>';
    }
    if (block.type === 'table') {
      return '<table class="kb-preview-table"><tbody>' +
        (block.rows || []).map(function (row, index) {
          var tag = index === 0 ? 'th' : 'td';
          return '<tr>' + (row || []).map(function (cell) {
            return '<' + tag + '>' + esc(cell) + '</' + tag + '>';
          }).join('') + '</tr>';
        }).join('') +
        '</tbody></table>';
    }
    if (block.type === 'layout') {
      return '<pre class="kb-preview-layout">' + esc(block.text) + '</pre>';
    }
    return '<p class="kb-preview-p">' + esc(block.text) + '</p>';
  }

  function downloadOriginal() {
    if (!state.detail || !state.detail.item) return;
    var item = state.detail.item;
    O.knowledge.downloadPolicy(item.id, item.originalName).catch(function (error) {
      O.components.toast.show((error && error.message) || '下载失败', 'warn');
    });
  }

  /* ---------------------------------------------------------
   * 静态绑定
   * ------------------------------------------------------- */

  function bindStatic() {
    if (el.bound) return;
    el.bound = true;

    el.modal = document.getElementById('policyDetailModal');
    if (!el.modal) return;

    el.detailTitle = document.getElementById('policyDetailTitle');
    el.detailMeta = document.getElementById('policyDetailMeta');
    el.detailBody = document.getElementById('policyDetailBody');
    el.detailClose = document.getElementById('policyDetailClose');
    el.detailCancel = document.getElementById('policyDetailCancel');
    el.downloadBtn = document.getElementById('policyDownloadBtn');

    el.detailClose.addEventListener('click', closeDetailModal);
    el.detailCancel.addEventListener('click', closeDetailModal);
    el.modal.addEventListener('click', function (event) {
      if (event.target === el.modal) closeDetailModal();
    });
    el.downloadBtn.addEventListener('click', downloadOriginal);
  }

  O.pages.policies = { init: init, onShow: onShow };
})(typeof globalThis !== 'undefined' ? globalThis : this);
