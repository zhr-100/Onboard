/**
 * 初见 Onboard · 年假管理页（HR 后台）
 *
 * 由 js/pages/app.js 在登录成功后调用 init()，导航切换时调用 onShow()。
 *
 * 三块内容：
 *  1. 台账表格：员工（姓名 + 账号）、年假、剩余年假（天）、最后更新时间、变更记录入口；
 *  2. 「调整年假」：选员工、年度、增加或减少、原因（必填），每次生成一条流水；
 *  3. 「导入余额」：下载模板 → 上传 → 预览校验 → 确认后才写入；
 *     与现有余额不一致时生成「对账调整」流水，不覆盖。
 *
 * 余额永远是「所有流水之和」，历史流水只增不改不删。
 */
(function (root) {
  var O = root.Onboard;
  O.pages = O.pages || {};

  var panel = null;
  var currentUser = null;
  var el = {};

  /** 流水详情弹窗当前查看的流水 */
  var detailState = { entries: [], title: '' };
  /** 导入预览暂存 */
  var importState = { entries: [], valid: [], invalid: [] };

  function esc(s) { return O.dom.escapeHtml(s); }

  function init(user) {
    currentUser = user;
    panel = document.getElementById('leaveAdminPanel');
    bindStatic();
    if (panel) render();
  }

  function onShow(pane) {
    if (pane === 'leaveadmin') render();
    else closeOtherModals();
  }

  /**
   * 三个弹窗共用同一个 .modal-mask 遮罩。
   * 同时打开会互相盖住（后开的把先开的压住，点不动的按钮就是这么来的），
   * 所以每次打开一个之前，先把**其它**都关掉 —— 不能连自己一起关，
   * 否则 openImportModal 里会把刚要开的那个也关掉。
   */
  function closeOtherModals(except) {
    [el.detailModal, el.adjustModal, el.importModal].forEach(function (m) {
      if (m && m !== except) m.hidden = true;
    });
    document.body.style.overflow = '';
  }

  /** 实时读一次当前账号：角色和启用状态可能刚被别人改过 */
  function liveUser() {
    if (!currentUser) return null;
    return O.auth.findById(currentUser.id) || currentUser;
  }

  function canManage() {
    return O.leave.canManage(liveUser());
  }

  /* ---------------------------------------------------------
   * 渲染主表
   * ------------------------------------------------------- */

  function render() {
    if (!panel) return;

    var user = liveUser();
    if (!canManage()) {
      panel.innerHTML =
        '<div class="empty">' +
          '<div class="empty-icon">🔐</div>' +
          '<div class="empty-title">无权管理年假台账</div>' +
          '<div class="empty-desc">年假台账由 HR 维护，需要年假管理权限。请联系 HR 或系统管理员。</div>' +
        '</div>';
      return;
    }

    var rows = O.leave.rows(liveUser());
    var manage = canManage();

    panel.innerHTML =
      '<div class="la-toolbar">' +
        '<div class="la-toolbar-left">' +
          '<h3 class="la-toolbar-title">年假台账</h3>' +
          '<span class="badge badge-muted">共 ' + rows.length + ' 条</span>' +
        '</div>' +
        '<div class="la-toolbar-right">' +
          '<button class="btn btn-ghost btn-sm" id="laImportBtn" type="button">导入余额</button>' +
          '<button class="btn btn-primary btn-sm" id="laAdjustBtn" type="button">调整年假</button>' +
        '</div>' +
      '</div>' +

      (rows.length ? tableHtml(rows) : emptyHtml()) +

      '<div class="la-note">' +
        '<div>余额由 <b>HR 维护</b>；每次调整都会生成一条流水，余额等于所有流水的合计。</div>' +
        '<div>导入余额会生成<b>对账调整</b>流水，<b>历史变动始终保留</b>，不会覆盖已有记录。</div>' +
      '</div>';

    var adjustBtn = document.getElementById('laAdjustBtn');
    if (adjustBtn) adjustBtn.addEventListener('click', openAdjustModal);
    var importBtn = document.getElementById('laImportBtn');
    if (importBtn) importBtn.addEventListener('click', openImportModal);

    // 委托绑在 panel 上（panel 不会被替换），所以只能绑一次 ——
    // 每次 render 都绑一遍会让监听器越积越多，点一下触发好几次。
    if (el.detailBound) return;
    el.detailBound = true;
    O.dom.on(panel, 'click', '[data-ledger-detail]', function (event, btn) {
      openDetailModal(btn.getAttribute('data-ledger-detail'));
    });
  }

  function emptyHtml() {
    return '' +
      '<div class="empty">' +
        '<div class="empty-icon">📅</div>' +
        '<div class="empty-title">还没有年假台账</div>' +
        '<div class="empty-desc">名册里还没有员工，或员工都还没有建立年假账。点右上角「调整年假」即可为第一位员工建账。</div>' +
      '</div>';
  }

  /** 台账表格：与员工端「我的年假」用同一份渲染代码 */
  function tableHtml(rows) {
    return '' +
      '<div class="card">' +
        O.components.ledger.tableHtml(rows, {
          showEmployee: true,
          emptyText: '还没有年假台账。点右上角「调整年假」即可为第一位员工建账。',
          detailAttr: 'data-ledger-detail',
          detailKey: function (row) { return row.employee.id + '|' + row.year; }
        }) +
      '</div>';
  }

  /* ---------------------------------------------------------
   * 流水详情
   * ------------------------------------------------------- */

  function openDetailModal(key) {
    closeOtherModals(el.detailModal);

    var parts = String(key || '').split('|');
    var employeeId = parts[0];
    var year = Number(parts[1]);
    var entries = O.leave.entriesOf(employeeId, year, liveUser());
    var employee = O.staff.employees().filter(function (e) {
      return e.id === employeeId;
    })[0];

    detailState.entries = entries;
    detailState.title = (employee ? employee.name : employeeId) + ' · ' + year + ' 年度';

    el.detailTitle.textContent = '变更记录';
    el.detailMeta.innerHTML =
      '<p class="text-muted">' + esc(detailState.title) + ' · 余额 ' +
      esc(O.leave.balanceOf(employeeId, year, liveUser())) + ' 天 · 共 ' + entries.length + ' 条流水</p>';
    el.detailBody.innerHTML = entries.length ? entriesTable(entries) : emptyEntriesHtml();
    el.detailModal.hidden = false;
  }

  function emptyEntriesHtml() {
    return '<div class="empty"><div class="empty-icon">🧾</div>' +
      '<div class="empty-title">暂无流水</div>' +
      '<div class="empty-desc">这位员工这一年还没有任何余额变动记录。</div></div>';
  }

  function entriesTable(entries) {
    return O.components.ledger.entriesHtml(entries);
  }

  function closeDetailModal() {
    el.detailModal.hidden = true;
  }

  /* ---------------------------------------------------------
   * 调整年假
   * ------------------------------------------------------- */

  function openAdjustModal() {
    if (!canManage()) {
      O.components.toast.show('你的角色没有管理年假的权限', 'warn');
      return;
    }

    // 三个弹窗共用同一个遮罩层，同时打开会互相盖住
    closeOtherModals(el.adjustModal);

    var employees = O.staff.employees().filter(function (e) {
      return e.status !== '已离职' && O.staff.accountOf(e);
    });
    if (!employees.length) {
      O.components.toast.show('名册里还没有在职员工，无法调整年假', 'warn');
      return;
    }

    el.adjustEmployee.innerHTML = employees.map(function (e) {
      var account = O.staff.accountOf(e);
      return '<option value="' + esc(e.id) + '">' +
        esc(e.name + ' · ' + (account ? account.username : e.id) + ' · ' + (e.dept || '—')) +
        '</option>';
    }).join('');

    el.adjustYear.innerHTML = yearOptions();
    el.adjustDirection.value = 'add';
    el.adjustDays.value = '';
    el.adjustReason.value = '';
    el.adjustError.hidden = true;
    el.adjustPreview.hidden = true;
    el.adjustModal.hidden = false;
    setTimeout(function () { el.adjustDays.focus(); }, 40);
  }

  /** 年度选项：该员工已有账的年度 + 当前年度 */
  function yearOptions() {
    var employeeId = el.adjustEmployee.value;
    var years = O.leave.yearsOf(employeeId);
    var current = O.leave.currentYear();
    if (years.indexOf(current) < 0) years.unshift(current);
    years = years.filter(function (y, i, arr) { return arr.indexOf(y) === i; })
      .sort(function (a, b) { return b - a; });
    return years.map(function (y) {
      return '<option value="' + y + '">' + y + ' 年度</option>';
    }).join('');
  }

  function closeAdjustModal() {
    el.adjustModal.hidden = true;
  }

  /** 实时预览：改完天数就告诉 HR 调整后余额是多少 */
  function previewAdjust() {
    var input = readAdjustInput();
    var check = O.leave.validateAdjustment(input, liveUser());
    if (!check.ok) {
      el.adjustPreview.hidden = true;
      return;
    }
    var current = O.leave.balanceOf(input.employeeId, input.year, liveUser());
    var after = current + check.value.delta;
    el.adjustPreview.hidden = false;
    el.adjustPreview.innerHTML =
      '当前余额 <b>' + current + ' 天</b> → 调整后 <b class="la-delta la-delta-' +
      (check.value.delta > 0 ? 'ok' : 'danger') + '">' + after + ' 天</b>' +
      '（本次 ' + (check.value.delta > 0 ? '增加 ' : '减少 ') + check.value.days + ' 天）';
  }

  function readAdjustInput() {
    return {
      employeeId: el.adjustEmployee.value,
      year: Number(el.adjustYear.value),
      direction: el.adjustDirection.value,
      days: el.adjustDays.value,
      reason: el.adjustReason.value
    };
  }

  function submitAdjust() {
    var input = readAdjustInput();
    var check = O.leave.validateAdjustment(input, liveUser());
    if (!check.ok) {
      showAdjustError(check.message);
      if (check.field && el['adjust' + capitalize(check.field)]) {
        el['adjust' + capitalize(check.field)].focus();
      }
      return;
    }

    var result = O.leave.adjust(input, liveUser());
    if (!result.ok) {
      showAdjustError(result.message);
      return;
    }

    closeAdjustModal();
    O.components.toast.show(result.message + '，当前余额 ' + result.balance + ' 天', 'ok');
    render();
  }

  function showAdjustError(message) {
    el.adjustError.textContent = message;
    el.adjustError.hidden = false;
  }

  function capitalize(text) {
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
  }

  /* ---------------------------------------------------------
   * 导入余额
   * ------------------------------------------------------- */

  function openImportModal() {
    if (!canManage()) {
      O.components.toast.show('你的角色没有管理年假的权限', 'warn');
      return;
    }
    closeOtherModals(el.importModal);
    importState = { entries: [], valid: [], invalid: [] };
    el.importPick.hidden = false;
    el.importPreview.hidden = true;
    el.importResult.hidden = true;
    el.importSubmit.hidden = true;
    el.importError.hidden = true;
    el.importFile.value = '';
    el.importModal.hidden = false;
  }

  function closeImportModal() {
    el.importModal.hidden = true;
  }

  /** 下载模板：带 BOM 的 CSV，Excel / WPS 打开中文不乱码 */
  function downloadTemplate() {
    var text = O.csv.BOM + O.csv.stringify(O.leave.templateRows());
    var blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '年假余额导入模板.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /** 读文件文本：UTF-8 优先，失败退 GBK（与员工导入一致） */
  function readFileText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var text;
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(reader.result);
        } catch (e) {
          try { text = new TextDecoder('gbk').decode(reader.result); }
          catch (e2) { text = new TextDecoder('utf-8').decode(reader.result); }
        }
        resolve(text);
      };
      reader.onerror = function () { reject(reader.error || new Error('文件读取失败')); };
      reader.readAsArrayBuffer(file);
    });
  }

  function handleImportFile() {
    var file = el.importFile.files && el.importFile.files[0];
    if (!file) return;
    el.importError.hidden = true;

    if (file.size > 1024 * 1024) {
      showImportError('文件太大（超过 1MB），请拆分成几个小文件再导入');
      return;
    }

    readFileText(file).then(function (text) {
      var rows = O.csv.parse(text);
      if (!rows.length) {
        showImportError('文件是空的');
        return;
      }

      var header = rows[0].map(function (h) { return String(h).trim(); });
      var idx = {};
      O.leave.IMPORT_COLUMNS.forEach(function (name) {
        idx[name] = header.indexOf(name);
      });
      var missing = O.leave.IMPORT_COLUMNS.filter(function (name) {
        return idx[name] < 0;
      });
      if (missing.length) {
        showImportError('模板缺少必需的列：' + missing.join('、') + '（请使用页面提供的模板）');
        return;
      }

      var list = rows.slice(1).map(function (cells, i) {
        return {
          lineNo: i + 2,
          employeeId: cell(cells, idx['员工编号']),
          name: cell(cells, idx['姓名']),
          year: cell(cells, idx['年度']),
          days: cell(cells, idx['年假天数'])
        };
      });
      if (!list.length) {
        showImportError('模板里没有数据行（第一行是表头，不算数据）');
        return;
      }

      var result = O.leave.validateImportRows(list);
      if (result.fatal) {
        showImportError(result.fatal);
        return;
      }

      importState.entries = result.entries;
      importState.valid = result.valid;
      importState.invalid = result.invalid;
      renderImportPreview();
    }).catch(function () {
      showImportError('文件读取失败，请重试');
    });
  }

  function cell(cells, i) {
    return (i >= 0 && cells[i] !== undefined) ? String(cells[i]) : '';
  }

  function renderImportPreview() {
    var valid = importState.valid;
    var invalid = importState.invalid;
    var willChange = valid.filter(function (e) { return e.action === 'reconcile'; });
    var same = valid.filter(function (e) { return e.action === 'none'; });

    el.importSummary.innerHTML =
      '共 <b>' + importState.entries.length + '</b> 行 · ' +
      '<span class="badge badge-ok">通过 ' + valid.length + ' 行</span> ' +
      '<span class="badge ' + (invalid.length ? 'badge-danger' : 'badge-muted') + '">有问题 ' + invalid.length + ' 行</span>';

    var rowsHtml = importState.entries.map(function (e) {
      if (!e.ok) {
        return '' +
          '<tr class="la-row-bad">' +
            '<td class="mono">' + e.lineNo + '</td>' +
            '<td colspan="5"><span class="badge badge-danger">未通过</span> ' +
              '<span class="text-xs text-muted">' + esc(e.reason) + '</span></td>' +
          '</tr>';
      }
      var verdict = e.action === 'reconcile'
        ? '<span class="badge badge-warn">生成对账调整</span> <span class="text-xs text-muted">' +
          esc(e.reason) + '</span>'
        : '<span class="badge badge-muted">余额一致，不变动</span>';
      return '' +
        '<tr>' +
          '<td class="mono">' + e.lineNo + '</td>' +
          '<td>' + esc(e.employee.name) + '</td>' +
          '<td class="mono">' + esc(e.employeeId) + '</td>' +
          '<td class="mono">' + e.year + '</td>' +
          '<td class="mono">' + e.current + ' 天</td>' +
          '<td class="mono">' + e.incoming + ' 天</td>' +
          '<td class="la-delta la-delta-' + (e.diff > 0 ? 'ok' : 'danger') + '">' +
            (e.diff > 0 ? '+' : '') + e.diff + ' 天</td>' +
          '<td>' + verdict + '</td>' +
        '</tr>';
    }).join('');

    el.importRows.innerHTML = rowsHtml;
    el.importPick.hidden = true;
    el.importPreview.hidden = false;
    el.importResult.hidden = true;
    el.importSubmit.hidden = false;
    el.importSubmit.disabled = willChange.length === 0;
    el.importSubmit.textContent = willChange.length
      ? '确认导入（生成 ' + willChange.length + ' 条对账调整流水）'
      : '余额全部一致，无需调整';
    el.importHint.textContent = same.length
      ? ('其中 ' + same.length + ' 行导入值与现有余额一致，不会产生流水。')
      : '';
  }

  function submitImport() {
    var result = O.leave.applyImport(importState.entries, liveUser());
    if (!result.ok) {
      showImportError(result.message);
      return;
    }

    el.importSummary.innerHTML =
      '共 <b>' + importState.entries.length + '</b> 行 · ' +
      '<span class="badge badge-ok">通过 ' + importState.valid.length + ' 行</span> ' +
      '<span class="badge ' + (importState.invalid.length ? 'badge-danger' : 'badge-muted') + '">有问题 ' + importState.invalid.length + ' 行</span>';
    el.importPreview.hidden = true;
    el.importResult.hidden = false;
    el.importSubmit.hidden = true;
    el.importResultSummary.innerHTML =
      '导入完成：生成 <b>' + result.count + '</b> 条对账调整流水。' +
      '原有流水全部保留，余额已按「所有流水之和」重新计算。';
    el.importResultDetail.innerHTML = result.created.map(function (e) {
      return '<li>' + esc(e.reason) + '（' + esc(O.format.dateTime(e.createdAt)) + '）</li>';
    }).join('');
    render();
  }

  function showImportError(message) {
    el.importError.textContent = message;
    el.importError.hidden = false;
  }

  /* ---------------------------------------------------------
   * 静态绑定
   * ------------------------------------------------------- */

  function bindStatic() {
    if (el.bound) return;
    el.bound = true;

    el.detailModal = document.getElementById('laDetailModal');
    el.detailTitle = document.getElementById('laDetailTitle');
    el.detailMeta = document.getElementById('laDetailMeta');
    el.detailBody = document.getElementById('laDetailBody');

    el.adjustModal = document.getElementById('laAdjustModal');
    el.adjustEmployee = document.getElementById('laAdjustEmployee');
    el.adjustYear = document.getElementById('laAdjustYear');
    el.adjustDirection = document.getElementById('laAdjustDirection');
    el.adjustDays = document.getElementById('laAdjustDays');
    el.adjustReason = document.getElementById('laAdjustReason');
    el.adjustPreview = document.getElementById('laAdjustPreview');
    el.adjustError = document.getElementById('laAdjustError');

    el.importModal = document.getElementById('laImportModal');
    el.importPick = document.getElementById('laImportPick');
    el.importPreview = document.getElementById('laImportPreview');
    el.importResult = document.getElementById('laImportResult');
    el.importFile = document.getElementById('laImportFile');
    el.importSummary = document.getElementById('laImportSummary');
    el.importRows = document.getElementById('laImportRows');
    el.importSubmit = document.getElementById('laImportSubmit');
    el.importHint = document.getElementById('laImportHint');
    el.importError = document.getElementById('laImportError');
    el.importResult = document.getElementById('laImportResult');
    el.importResultSummary = document.getElementById('laImportResultSummary');
    el.importResultDetail = document.getElementById('laImportResultDetail');

    if (!el.detailModal) return;

    // 详情
    var detailClose = document.getElementById('laDetailClose');
    if (detailClose) detailClose.addEventListener('click', closeDetailModal);
    var detailCancel = document.getElementById('laDetailCancel');
    if (detailCancel) detailCancel.addEventListener('click', closeDetailModal);
    el.detailModal.addEventListener('click', function (event) {
      if (event.target === el.detailModal) closeDetailModal();
    });

    // 调整
    var adjustClose = document.getElementById('laAdjustClose');
    if (adjustClose) adjustClose.addEventListener('click', closeAdjustModal);
    var adjustCancel = document.getElementById('laAdjustCancel');
    if (adjustCancel) adjustCancel.addEventListener('click', closeAdjustModal);
    var adjustSubmit = document.getElementById('laAdjustSubmit');
    if (adjustSubmit) adjustSubmit.addEventListener('click', submitAdjust);
    el.adjustModal.addEventListener('click', function (event) {
      if (event.target === el.adjustModal) closeAdjustModal();
    });

    el.adjustEmployee.addEventListener('change', function () {
      el.adjustYear.innerHTML = yearOptions();
      previewAdjust();
    });
    el.adjustYear.addEventListener('change', previewAdjust);
    el.adjustDirection.addEventListener('change', previewAdjust);
    el.adjustDays.addEventListener('input', previewAdjust);
    el.adjustReason.addEventListener('input', function () {
      if (!el.adjustError.hidden) el.adjustError.hidden = true;
    });
    ['laAdjustDays', 'laAdjustReason'].forEach(function (id) {
      var input = document.getElementById(id);
      if (!input) return;
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          adjustSubmit.click();
        }
      });
    });

    // 导入
    var importClose = document.getElementById('laImportClose');
    if (importClose) importClose.addEventListener('click', closeImportModal);
    var importCancel = document.getElementById('laImportCancel');
    if (importCancel) importCancel.addEventListener('click', closeImportModal);
    var importSubmit = document.getElementById('laImportSubmit');
    if (importSubmit) importSubmit.addEventListener('click', submitImport);
    var templateBtn = document.getElementById('laTemplateBtn');
    if (templateBtn) templateBtn.addEventListener('click', downloadTemplate);
    el.importModal.addEventListener('click', function (event) {
      if (event.target === el.importModal) closeImportModal();
    });
    el.importFile.addEventListener('change', handleImportFile);
  }

  O.pages.leaveadmin = { init: init, onShow: onShow };
})(typeof globalThis !== 'undefined' ? globalThis : this);
