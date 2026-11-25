/**
 * 初见 Onboard · 制度知识库页（HR管理员 / 系统管理员）
 *
 * 页面只做展示和交互，真正的校验与权限判定在服务端（server/knowledge.js）：
 *  - 列表、上传、预览、发布、下架、重试、下载都要带身份证明；
 *  - 没登录 / 角色不对，服务端直接拒绝。
 *
 * 解析在服务端后台跑（worker 线程），页面每 3 秒轮询一次状态，
 * 所以上传后页面不会卡住，解析结果会自动出现。
 */
(function (root) {
  var O = root.Onboard;
  O.pages = O.pages || {};

  var POLL_MS = 3000;

  var panel = null;
  var currentUser = null;
  var el = {};
  var pollTimer = null;

  var state = {
    docs: [],
    version: 0,
    tab: 'all',
    category: '',
    dept: '',
    keyword: '',
    loading: false,
    polling: false,
    pdftotextAvailable: true,
    detailId: null,
    detail: null
  };

  function esc(s) { return O.dom.escapeHtml(s); }

  function init(user) {
    currentUser = user;
    panel = document.getElementById('knowledgePanel');
    bindStatic();
    if (!panel) return;

    // 文件模式下没有服务端，制度上传/下载/解析都做不了，直接说明原因
    if (!O.store || O.store.mode !== 'server') {
      panel.innerHTML =
        '<div class="empty">' +
          '<div class="empty-icon">🔌</div>' +
          '<div class="empty-title">制度知识库需要本地服务</div>' +
          '<div class="empty-desc">' +
            '请在项目文件夹里运行 <b>node server.js</b>，然后打开 <b>http://localhost:3000</b>。' +
            '上传、后台解析和原件下载都在服务端完成，文件模式下无法使用。' +
          '</div>' +
        '</div>';
      return;
    }

    // 重新登录时把上次留下的弹窗关掉，避免盖在新页面上
    if (el.modal) el.modal.hidden = true;
    if (el.uploadModal) el.uploadModal.hidden = true;
    state.detailId = null;
    state.detail = null;

    renderShell();
    syncAndRefresh();
    startPolling();
  }

  function onShow(pane) {
    if (pane !== 'knowledge') {
      // 离开知识库时关掉弹窗（路由切页不会自动清 DOM）
      if (el.modal && !el.modal.hidden) closeDetailModal();
      if (el.uploadModal && !el.uploadModal.hidden) closeUploadModal();
      return;
    }
    if (!O.store || O.store.mode !== 'server') return;
    // 进页面时同步一次账号状态，保证服务端拿到的是最新的角色
    syncAndRefresh();
  }

  /** 先同步账号状态，再拉列表；服务端鉴权依赖前者 */
  function syncAndRefresh() {
    var ready = O.store.syncNow ? O.store.syncNow() : Promise.resolve();
    return ready.then(function () {
      return refresh(true);
    });
  }

  function liveUser() {
    if (!currentUser) return null;
    return O.auth.findById(currentUser.id) || currentUser;
  }

  function canManage() {
    return O.permissions.can(liveUser(), 'manage.hr');
  }

  /* ---------------------------------------------------------
   * 页面骨架（只建一次，避免轮询时输入框失焦）
   * ------------------------------------------------------- */

  function renderShell() {
    panel.innerHTML =
      '<div class="kb-toolbar">' +
        '<div class="kb-tabs" id="kbTabs"></div>' +
        '<div class="kb-filters">' +
          '<select class="select kb-filter" id="kbCategoryFilter" aria-label="按分类筛选"></select>' +
          '<select class="select kb-filter" id="kbDeptFilter" aria-label="按适用范围筛选"></select>' +
          '<input class="input kb-search" id="kbSearch" type="search" placeholder="按制度名称搜索" aria-label="按制度名称搜索">' +
          '<button class="btn btn-primary btn-sm" id="kbUploadBtn" type="button">＋ 上传制度</button>' +
        '</div>' +
      '</div>' +
      '<div id="kbBody"></div>' +
      '<p class="text-xs text-muted kb-footnote">' +
        '说明：只有<b>已发布</b>、<b>在有效期内</b>（生效日期不晚于今天）、且<b>适用该员工部门</b>的制度，才会用于回答员工的问题。' +
        '扫描件 PDF 没有文字层，需要先做文字识别（OCR）再上传。' +
      '</p>';

    el.tabs = document.getElementById('kbTabs');
    el.categoryFilter = document.getElementById('kbCategoryFilter');
    el.deptFilter = document.getElementById('kbDeptFilter');
    el.search = document.getElementById('kbSearch');
    el.uploadBtn = document.getElementById('kbUploadBtn');
    el.body = document.getElementById('kbBody');

    fillFilters();

    // 列表内容会反复替换，事件只在容器上绑一次
    O.dom.on(el.body, 'click', '[data-detail]', function (event, btn) {
      openDetailModal(btn.getAttribute('data-detail'));
    });

    O.dom.on(el.tabs, 'click', '[data-tab]', function (event, btn) {
      state.tab = btn.getAttribute('data-tab');
      renderTabs();
      renderBody();
    });

    el.categoryFilter.addEventListener('change', function () {
      state.category = el.categoryFilter.value;
      renderBody();
    });

    el.deptFilter.addEventListener('change', function () {
      state.dept = el.deptFilter.value;
      renderBody();
    });

    el.search.addEventListener('input', function () {
      state.keyword = el.search.value.trim();
      renderBody();
    });

    el.uploadBtn.addEventListener('click', openUploadModal);
  }

  function fillFilters() {
    var categories = ['<option value="">全部分类</option>'].concat(
      O.knowledge.CATEGORIES.map(function (c) {
        return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
      })
    );
    el.categoryFilter.innerHTML = categories.join('');

    // 部门选项：名册里的部门 + 已上传文档里出现过的部门
    var seen = {};
    var deptNames = [];
    O.staff.departments().concat(state.docs.map(function (d) { return d.scope === 'dept' ? d.dept : ''; }))
      .forEach(function (d) {
        d = String(d || '').trim();
        if (!d || seen[d]) return;
        seen[d] = true;
        deptNames.push(d);
      });

    var depts = ['<option value="">全部适用范围</option>', '<option value="__all__">全员</option>']
      .concat(deptNames.map(function (d) {
        return '<option value="dept:' + esc(d) + '">' + esc(d) + '</option>';
      }));
    el.deptFilter.innerHTML = depts.join('');
  }

  /* ---------------------------------------------------------
   * 数据
   * ------------------------------------------------------- */

  function refresh(isManual) {
    if (state.loading) return Promise.resolve();
    state.loading = true;
    return O.knowledge.listDocs().then(function (data) {
      state.docs = (data && data.docs) || [];
      state.version = (data && data.version) || 0;
      state.pdftotextAvailable = data && data.pdftotextAvailable !== false;
      state.loading = false;
      renderTabs();
      renderBody();
      if (state.detailId) refreshDetailMeta();
      if (isManual) fillFilters();
    }).catch(function (error) {
      state.loading = false;
      renderError(error);
    });
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      var shell = document.getElementById('appShell');
      if (!shell || shell.hidden) return;
      var pane = document.getElementById('pane-knowledge');
      if (!pane || !pane.classList.contains('is-active')) return;
      if (!O.auth.currentUser()) return;
      if (state.loading) return;
      refresh(false);
    }, POLL_MS);
  }

  /* ---------------------------------------------------------
   * 渲染：状态标签 + 列表
   * ------------------------------------------------------- */

  function tabCount(key) {
    var tab = O.knowledge.TABS.filter(function (t) { return t.key === key; })[0];
    if (!tab) return 0;
    return state.docs.filter(function (d) { return tab.match(d.status); }).length;
  }

  function renderTabs() {
    if (!el.tabs) return;
    el.tabs.innerHTML = O.knowledge.TABS.map(function (tab) {
      var count = tabCount(tab.key);
      return '<button class="kb-tab' + (state.tab === tab.key ? ' is-active' : '') + '" type="button" data-tab="' + esc(tab.key) + '">' +
        esc(tab.label) + '<span class="kb-tab-count">' + count + '</span></button>';
    }).join('');
  }

  function matchesFilters(doc) {
    var tab = O.knowledge.TABS.filter(function (t) { return t.key === state.tab; })[0];
    if (tab && !tab.match(doc.status)) return false;
    if (state.category && doc.category !== state.category) return false;
    if (state.dept === '__all__' && doc.scope !== 'all') return false;
    if (state.dept && state.dept.indexOf('dept:') === 0) {
      if (doc.scope !== 'dept' || doc.dept !== state.dept.slice(5)) return false;
    }
    if (state.keyword) {
      var text = String(doc.title || '').toLowerCase();
      if (text.indexOf(state.keyword.toLowerCase()) < 0) return false;
    }
    return true;
  }

  function renderBody() {
    if (!el.body) return;
    var docs = state.docs.filter(matchesFilters);

    if (!state.docs.length) {
      el.body.innerHTML =
        '<div class="empty">' +
          '<div class="empty-icon">📚</div>' +
          '<div class="empty-title">还没有上传制度</div>' +
          '<div class="empty-desc">点击右上角「上传制度」，上传公司的 PDF / Word / 文本制度。解析确认无误后发布，才会用于员工问答。</div>' +
        '</div>';
      return;
    }

    if (!docs.length) {
      el.body.innerHTML =
        '<div class="empty">' +
          '<div class="empty-icon">🔍</div>' +
          '<div class="empty-title">没有符合条件的制度</div>' +
          '<div class="empty-desc">换个状态标签、分类或搜索词试试。</div>' +
        '</div>';
      return;
    }

    var rows = docs.map(function (doc) {
      return '<tr>' +
        '<td><div class="kb-doc-name">' + esc(doc.title) + '</div>' +
          '<div class="kb-doc-file">' + esc(doc.originalName || '') + '</div></td>' +
        '<td>' + esc(doc.category) + '</td>' +
        '<td>' + esc(scopeText(doc)) + '</td>' +
        '<td class="mono">' + esc(doc.version) + '</td>' +
        '<td class="mono">' + esc(doc.effectiveDate) + '</td>' +
        '<td>' + statusCell(doc) + '</td>' +
        '<td class="text-xs text-muted">' + esc(O.format.dateTime(doc.updatedAt)) + '</td>' +
        '<td><button class="btn btn-ghost btn-sm" data-detail="' + esc(doc.id) + '">查看详情</button></td>' +
      '</tr>';
    }).join('');

    el.body.innerHTML =
      '<div class="card">' +
        '<div class="card-head">' +
          '<h3>制度列表</h3>' +
          '<span class="badge badge-muted">共 ' + docs.length + ' 条</span>' +
        '</div>' +
        '<div class="table-wrap">' +
          '<table class="tbl">' +
            '<thead><tr>' +
              '<th>制度名称</th><th>分类</th><th>适用范围</th><th>版本</th><th>生效日期</th><th>状态</th><th>更新时间</th><th>操作</th>' +
            '</tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>';
  }

  function scopeText(doc) {
    if (doc.scope === 'all') return '全员';
    return (doc.dept || '—') + ' 专属';
  }

  function statusCell(doc) {
    var info = O.knowledge.STATUS[doc.status] || { label: doc.status, tone: 'muted' };
    var html = '<span class="badge badge-' + info.tone + '">' + esc(info.label) + '</span>';
    if (doc.status === 'published' && isFuture(doc.effectiveDate)) {
      html += ' <span class="badge badge-info">未生效</span>';
    }
    return html;
  }

  function isFuture(dateStr) {
    var today = new Date();
    function pad(n) { return n < 10 ? '0' + n : String(n); }
    var todayStr = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());
    return String(dateStr || '') > todayStr;
  }

  function renderError(error) {
    if (!el.body) return;
    var message = (error && error.message) ? error.message : '读取失败';
    var hint;
    if (error && error.status === 401) {
      hint = '身份信息已失效，请退出登录后重新进入。';
    } else if (error && error.status === 403) {
      hint = '你的角色没有管理制度的权限。';
    } else if (root.location && root.location.protocol === 'file:') {
      hint = '制度知识库需要本地服务：请在项目文件夹里运行 node server.js，然后打开 http://localhost:3000 。';
      message = '当前是文件模式，无法连接本地服务';
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
   * 上传
   * ------------------------------------------------------- */

  function openUploadModal() {
    if (!canManage()) {
      O.components.toast.show('你的角色没有上传制度的权限', 'warn');
      return;
    }
    el.file.value = '';
    el.title.value = '';
    el.version.value = '';
    el.dept.value = '';
    el.scope.value = 'all';
    el.deptField.hidden = true;
    el.error.hidden = true;
    el.submit.disabled = false;
    el.submit.textContent = '上传并解析';
    el.category.value = O.knowledge.CATEGORIES[0];

    var today = new Date();
    function pad(n) { return n < 10 ? '0' + n : String(n); }
    el.effectiveDate.value = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());

    el.fileHint.textContent = state.pdftotextAvailable
      ? '支持 PDF、Word(.docx)、TXT、Markdown，单个文件不超过 20MB。旧版 .doc 请先另存为 .docx。'
      : '注意：没有找到 PDF 解析工具（pdftotext），PDF 上传后会解析失败。TXT / Word(.docx) 不受影响。';

    el.uploadModal.hidden = false;
    setTimeout(function () { el.title.focus(); }, 40);
  }

  function closeUploadModal() {
    el.uploadModal.hidden = true;
  }

  function submitUpload() {
    var file = el.file.files && el.file.files[0];
    var meta = {
      title: el.title.value.trim(),
      category: el.category.value,
      scope: el.scope.value,
      dept: el.dept.value.trim(),
      version: el.version.value.trim(),
      effectiveDate: el.effectiveDate.value,
      originalName: file ? file.name : ''
    };

    var check = O.knowledge.validateUpload(file, meta);
    if (!check.ok) {
      showUploadError(check.message);
      return;
    }

    el.submit.disabled = true;
    el.submit.textContent = '上传中…';

    // 先把账号状态同步到服务端，保证鉴权用的是最新角色
    var ready = O.store.syncNow ? O.store.syncNow() : Promise.resolve({ ok: true });
    ready.then(function () {
      return O.knowledge.uploadDoc(file, meta);
    }).then(function (data) {
      closeUploadModal();
      O.components.toast.show('已上传「' + (data.doc ? data.doc.title : meta.title) + '」，正在后台解析', 'ok');
      refresh(true);
    }).catch(function (error) {
      el.submit.disabled = false;
      el.submit.textContent = '上传并解析';
      showUploadError((error && error.message) ? error.message : '上传失败');
    });
  }

  function showUploadError(message) {
    el.error.textContent = message;
    el.error.hidden = false;
  }

  /* ---------------------------------------------------------
   * 详情与预览
   * ------------------------------------------------------- */

  function openDetailModal(id) {
    state.detailId = id;
    state.detail = null;
    el.detailTitle.textContent = '制度详情';
    el.detailMeta.innerHTML = '<p class="text-muted">加载中…</p>';
    el.detailPreview.innerHTML = '';
    el.modal.hidden = false;

    loadDetail(id);
  }

  function closeDetailModal() {
    el.modal.hidden = true;
    state.detailId = null;
    state.detail = null;
  }

  function loadDetail(id) {
    return O.knowledge.previewDoc(id).then(function (data) {
      if (state.detailId !== id) return;
      state.detail = data;
      renderDetail(data);
    }).catch(function (error) {
      if (state.detailId !== id) return;
      el.detailMeta.innerHTML = '<div class="form-error">' + esc((error && error.message) || '读取失败') + '</div>';
    });
  }

  /** 轮询时只刷新状态，保留已经加载好的预览 */
  function refreshDetailMeta() {
    if (!state.detailId) return;
    var doc = state.docs.filter(function (d) { return d.id === state.detailId; })[0];
    if (!doc) return;
    if (state.detail) {
      state.detail.doc = doc;
      renderDetail(state.detail);
    }
    // 从排队中/解析中变成待发布了，把预览拉出来
    if (doc.status === 'pending' && state.detail && state.detail.missing) {
      loadDetail(doc.id);
    }
  }

  function renderDetail(data) {
    var doc = data.doc || {};
    el.detailTitle.textContent = doc.title || '制度详情';

    var metaRows = [
      ['分类', doc.category],
      ['适用范围', scopeText(doc)],
      ['版本', doc.version],
      ['生效日期', doc.effectiveDate],
      ['原始文件', doc.originalName],
      ['文件大小', formatSize(doc.size)],
      ['上传人', doc.uploadedBy ? doc.uploadedBy.name : '—'],
      ['上传时间', O.format.dateTime(doc.uploadedAt)],
      ['解析统计', (doc.stats && doc.stats.chars ? doc.stats.chars + ' 字' : '—') +
        (doc.stats && doc.stats.tables ? ' · ' + doc.stats.tables + ' 个表格' : '')]
    ];

    var html =
      '<div class="kb-detail-status">' + statusCell(doc) +
        (doc.status === 'published' && isFuture(doc.effectiveDate)
          ? '<span class="kb-detail-tip">已发布但尚未生效，员工问答暂不会引用。</span>' : '') +
      '</div>' +
      '<dl class="dl kb-detail-dl">' +
        metaRows.map(function (row) {
          return '<dt>' + esc(row[0]) + '</dt><dd>' + esc(row[1] === undefined || row[1] === null || row[1] === '' ? '—' : row[1]) + '</dd>';
        }).join('') +
      '</dl>';

    if (doc.error) {
      html += '<div class="form-error kb-detail-error">' + esc(doc.error) + '</div>';
    }

    if (doc.warnings && doc.warnings.length) {
      html += '<div class="kb-detail-warn">' + doc.warnings.map(function (w) {
        return '<div>· ' + esc(w) + '</div>';
      }).join('') + '</div>';
    }

    el.detailMeta.innerHTML = html;
    el.detailPreview.innerHTML = renderPreview(data);
    updateDetailButtons(doc);
  }

  function formatSize(bytes) {
    var n = Number(bytes || 0);
    if (!n) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  function renderPreview(data) {
    var blocks = data.blocks || [];
    if (!blocks.length) {
      var msg = data.missing
        ? (data.doc && data.doc.status === 'failed'
          ? '解析失败，没有可预览的内容。可以点「重试解析」。'
          : '还没有解析结果，请稍候。')
        : '没有可预览的内容。';
      return '<div class="kb-preview-empty">' + esc(msg) + '</div>';
    }

    var html = '<div class="kb-preview">';
    blocks.forEach(function (block) {
      if (block.type === 'heading') {
        var level = Math.min(Math.max(Number(block.level || 1), 1), 4);
        html += '<h' + level + ' class="kb-preview-h">' + esc(block.text) + '</h' + level + '>';
      } else if (block.type === 'table') {
        html += '<table class="kb-preview-table"><tbody>';
        (block.rows || []).forEach(function (row, index) {
          var tag = index === 0 ? 'th' : 'td';
          html += '<tr>' + (row || []).map(function (cell) {
            return '<' + tag + '>' + esc(cell) + '</' + tag + '>';
          }).join('') + '</tr>';
        });
        html += '</tbody></table>';
      } else if (block.type === 'layout') {
        html += '<pre class="kb-preview-layout">' + esc(block.text) + '</pre>';
      } else {
        html += '<p class="kb-preview-p">' + esc(block.text) + '</p>';
      }
    });
    html += '</div>';

    if (data.truncated) {
      html += '<p class="text-xs text-muted kb-preview-note">内容较长，预览已截断。需要核对完整内容请下载原件。</p>';
    }
    return html;
  }

  function updateDetailButtons(doc) {
    el.publishBtn.hidden = !(doc.status === 'pending' || doc.status === 'unpublished');
    el.unpublishBtn.hidden = doc.status !== 'published';
    el.retryBtn.hidden = doc.status !== 'failed';
    el.publishBtn.textContent = doc.status === 'unpublished' ? '重新发布' : '发布';
  }

  /* ---------------------------------------------------------
   * 详情操作
   * ------------------------------------------------------- */

  function act(action) {
    var id = state.detailId;
    if (!id) return;
    var call = action === 'retry' ? O.knowledge.retryDoc
      : action === 'publish' ? O.knowledge.publishDoc
        : O.knowledge.unpublishDoc;
    call(id).then(function () {
      var messages = {
        retry: '已重新排队，正在重新解析',
        publish: '已发布，员工问答现在会引用这条制度',
        unpublish: '已下架，员工问答不再引用这条制度'
      };
      O.components.toast.show(messages[action] || '操作完成', 'ok');
      refresh(false);
      loadDetail(id);
    }).catch(function (error) {
      O.components.toast.show((error && error.message) || '操作失败', 'warn');
      refresh(false);
    });
  }

  function downloadOriginal() {
    var id = state.detailId;
    if (!id) return;
    var doc = state.detail && state.detail.doc;
    O.knowledge.downloadDoc(id, doc ? doc.originalName : '').catch(function (error) {
      O.components.toast.show((error && error.message) || '下载失败', 'warn');
    });
  }

  /* ---------------------------------------------------------
   * 静态绑定
   * ------------------------------------------------------- */

  function bindStatic() {
    if (el.bound) return;
    el.bound = true;

    el.modal = document.getElementById('kbDetailModal');
    el.uploadModal = document.getElementById('kbUploadModal');
    if (!el.modal || !el.uploadModal) return;

    el.detailTitle = document.getElementById('kbDetailTitle');
    el.detailMeta = document.getElementById('kbDetailMeta');
    el.detailPreview = document.getElementById('kbDetailPreview');
    el.detailClose = document.getElementById('kbDetailClose');
    el.detailCancel = document.getElementById('kbDetailCancel');
    el.publishBtn = document.getElementById('kbPublishBtn');
    el.unpublishBtn = document.getElementById('kbUnpublishBtn');
    el.retryBtn = document.getElementById('kbRetryBtn');
    el.downloadBtn = document.getElementById('kbDownloadBtn');

    el.file = document.getElementById('kbFile');
    el.fileHint = document.getElementById('kbFileHint');
    el.title = document.getElementById('kbTitle');
    el.category = document.getElementById('kbCategory');
    el.scope = document.getElementById('kbScope');
    el.dept = document.getElementById('kbDept');
    el.deptField = document.getElementById('kbDeptField');
    el.version = document.getElementById('kbVersion');
    el.effectiveDate = document.getElementById('kbEffectiveDate');
    el.error = document.getElementById('kbUploadError');
    el.submit = document.getElementById('kbUploadSubmit');

    el.uploadClose = document.getElementById('kbUploadClose');
    el.uploadCancel = document.getElementById('kbUploadCancel');

    // 分类下拉的选项：固定六类
    el.category.innerHTML = O.knowledge.CATEGORIES.map(function (c) {
      return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
    }).join('');

    el.detailClose.addEventListener('click', closeDetailModal);
    el.detailCancel.addEventListener('click', closeDetailModal);
    el.modal.addEventListener('click', function (event) {
      if (event.target === el.modal) closeDetailModal();
    });

    el.publishBtn.addEventListener('click', function () { act('publish'); });
    el.unpublishBtn.addEventListener('click', function () { act('unpublish'); });
    el.retryBtn.addEventListener('click', function () { act('retry'); });
    el.downloadBtn.addEventListener('click', downloadOriginal);

    el.uploadClose.addEventListener('click', closeUploadModal);
    el.uploadCancel.addEventListener('click', closeUploadModal);
    el.uploadModal.addEventListener('click', function (event) {
      if (event.target === el.uploadModal) closeUploadModal();
    });
    el.submit.addEventListener('click', submitUpload);

    el.scope.addEventListener('change', function () {
      el.deptField.hidden = el.scope.value !== 'dept';
    });

    // 选好文件后自动填制度名称和版本默认值
    el.file.addEventListener('change', function () {
      var file = el.file.files && el.file.files[0];
      if (!file) return;
      if (!el.title.value.trim()) {
        el.title.value = file.name.replace(/\.[^.]+$/, '').slice(0, 100);
      }
      if (!el.version.value.trim()) el.version.value = 'v1.0';
    });

    ['kbTitle', 'kbVersion', 'kbDept', 'kbEffectiveDate'].forEach(function (id) {
      var input = document.getElementById(id);
      if (!input) return;
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          el.submit.click();
        }
      });
    });
  }

  O.pages.knowledge = { init: init, onShow: onShow };
})(typeof globalThis !== 'undefined' ? globalThis : this);
