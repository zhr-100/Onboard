/**
 * 初见 Onboard · 员工管理页（HR管理员 / 系统管理员）
 *
 * 页面只负责展示和收集输入，真正的校验和权限判定在 js/core/staff.js：
 *  - HR管理员只能新增「员工」角色；
 *  - 只有系统管理员能新增 HR管理员、产品运营、系统管理员；
 *  - 即使绕过页面直接调用接口，这些规则同样会被核对。
 */
(function (root) {
  var O = root.Onboard;
  O.pages = O.pages || {};

  var panel = null;
  var currentUser = null;
  /** 正在编辑的员工编号 */
  var editingId = null;

  var el = {};

  function esc(s) { return O.dom.escapeHtml(s); }

  function init(user) {
    currentUser = user;
    panel = document.getElementById('staffPanel');
    bindStatic();
    if (panel) render();
  }

  function onShow(pane) {
    if (pane === 'staff') render();
  }

  /** 实时读一次当前账号：角色和启用状态可能刚被别人改过 */
  function liveUser() {
    if (!currentUser) return null;
    return O.auth.findById(currentUser.id) || currentUser;
  }

  /* ---------------------------------------------------------
   * 名册表格
   * ------------------------------------------------------- */

  function render() {
    if (!panel) return;
    if (!O.staff.canManage(liveUser())) {
      panel.innerHTML =
        '<div class="empty">' +
          '<div class="empty-icon">🔐</div>' +
          '<div class="empty-title">无权管理员工</div>' +
          '<div class="empty-desc">只有 HR管理员 和 系统管理员 可以管理员工。</div>' +
        '</div>';
      return;
    }

    var employees = O.staff.employees().slice().sort(function (a, b) {
      return String(a.id).localeCompare(String(b.id));
    });

    var rows = employees.map(function (e) {
      var account = O.staff.accountOf(e);
      var disabled = account && account.enabled === false;
      return '' +
        '<tr>' +
          '<td>' +
            '<div class="staff-cell">' +
              '<span class="avatar" style="background:' + esc(e.avatarColor || '#2F6BFF') + '">' + esc(e.avatarText || (e.name || '员').charAt(0)) + '</span>' +
              '<span class="staff-name">' + esc(e.name) + '</span>' +
            '</div>' +
          '</td>' +
          '<td class="mono">' + esc(e.id) + '</td>' +
          '<td>' + esc(e.dept || '—') + '</td>' +
          '<td>' + (account ? esc(account.role) : '<span class="badge badge-muted">未开通账号</span>') + '</td>' +
          '<td>' + statusBadges(e, disabled) + '</td>' +
          '<td><button class="btn btn-ghost btn-sm" data-edit="' + esc(e.id) + '">编辑</button></td>' +
        '</tr>';
    }).join('');

    panel.innerHTML =
      '<div class="card">' +
        '<div class="card-head">' +
          '<h3>员工名册</h3>' +
          '<span class="badge badge-muted">共 ' + employees.length + ' 人</span>' +
          '<div class="spacer"></div>' +
          '<button class="btn btn-ghost btn-sm" id="staffImportBtn">批量导入</button>' +
          '<button class="btn btn-primary btn-sm" id="staffCreateBtn">＋ 新增员工</button>' +
        '</div>' +
        '<div class="table-wrap">' +
          '<table class="tbl">' +
            '<thead><tr>' +
              '<th>员工</th><th>员工编号</th><th>部门</th><th>角色</th><th>状态</th><th>操作</th>' +
            '</tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>' +
      '<p class="text-xs text-muted" style="margin-top:16px;line-height:1.8">' +
        '说明：新增员工会同时开通登录账号，员工编号就是登录名，创建后不可修改；' +
        '初始密码至少 6 位。HR管理员只能新增「员工」角色，管理类角色需由系统管理员创建。' +
      '</p>';

    var createBtn = document.getElementById('staffCreateBtn');
    if (createBtn) createBtn.addEventListener('click', openCreateModal);

    var importBtn = document.getElementById('staffImportBtn');
    if (importBtn) importBtn.addEventListener('click', openImportModal);

    O.dom.on(panel, 'click', '[data-edit]', function (event, btn) {
      openEditModal(btn.getAttribute('data-edit'));
    });
  }

  /** 在职状态徽章 +（如停用）账号停用徽章 */
  function statusBadges(employee, disabled) {
    var map = {
      '在职': 'badge-ok',
      '试用期': 'badge-info',
      '已离职': 'badge-muted'
    };
    var cls = map[employee.status] || 'badge-muted';
    var html = '<span class="badge ' + cls + '">' + esc(employee.status || '未知') + '</span>';
    if (disabled) html += ' <span class="badge badge-warn">账号已停用</span>';
    return html;
  }

  /* ---------------------------------------------------------
   * 新增员工弹窗
   * ------------------------------------------------------- */

  function openCreateModal() {
    var user = liveUser();
    var roles = O.staff.assignableRoles(user);

    fillDeptOptions();
    el.createName.value = '';
    el.createCode.value = '';
    el.createDept.value = '';
    el.createPassword.value = '';
    el.createError.hidden = true;

    // 角色选项按当前身份收敛：HR管理员只能看到「员工」
    el.createRole.innerHTML = roles.map(function (r) {
      return '<option value="' + esc(r) + '">' + esc(r) + '</option>';
    }).join('');
    if (!roles.length) {
      el.createRole.innerHTML = '<option value="">（无可用角色）</option>';
    }
    var hint = el.createRoleHint;
    if (hint) {
      hint.hidden = !(user && user.role === 'HR管理员');
      hint.textContent = 'HR管理员只能新增「员工」角色；如需开通 HR管理员、产品运营等账号，请联系系统管理员。';
    }

    el.createModal.hidden = false;
    setTimeout(function () { el.createName.focus(); }, 40);
  }

  function submitCreate() {
    var input = {
      name: el.createName.value,
      employeeId: el.createCode.value,
      dept: el.createDept.value,
      role: el.createRole.value,
      password: el.createPassword.value
    };
    var result = O.staff.createEmployee(input, liveUser());
    if (!result.ok) {
      showCreateError(result.message);
      var bad = { name: el.createName, employeeId: el.createCode, dept: el.createDept, role: el.createRole, password: el.createPassword }[result.field];
      if (bad) bad.focus();
      return;
    }
    el.createModal.hidden = true;
    O.components.toast.show('已创建员工「' + result.employee.name + '」（编号 ' + result.employee.id + '），登录名即员工编号', 'ok');
    render();
  }

  /* ---------------------------------------------------------
   * 编辑员工弹窗
   * ------------------------------------------------------- */

  function openEditModal(id) {
    var employee = O.staff.findEmployee(id);
    if (!employee) return;
    var account = O.staff.accountOf(employee);
    editingId = id;

    fillDeptOptions();
    el.editName.value = employee.name;
    el.editCode.value = employee.id;
    el.editDept.value = employee.dept || '';
    el.editPassword.value = '';
    el.editError.hidden = true;

    // 角色、员工编号建好后不能改，这里只展示
    el.editRole.value = account ? account.role : '（未开通账号）';

    if (account) {
      el.editAccountRow.hidden = false;
      el.editEnabled.checked = account.enabled !== false;
      el.editEnabledText.textContent = account.enabled !== false ? '已启用' : '已停用';
      el.editPasswordRow.hidden = false;
      el.editNoAccount.hidden = true;
    } else {
      el.editAccountRow.hidden = true;
      el.editPasswordRow.hidden = true;
      el.editNoAccount.hidden = false;
    }

    el.editModal.hidden = false;
    setTimeout(function () { el.editName.focus(); }, 40);
  }

  function submitEdit() {
    if (!editingId) return;
    var patch = {
      name: el.editName.value,
      dept: el.editDept.value,
      enabled: el.editAccountRow.hidden ? undefined : el.editEnabled.checked,
      newPassword: el.editPasswordRow.hidden ? '' : el.editPassword.value
    };
    var result = O.staff.updateEmployee(editingId, patch, liveUser());
    if (!result.ok) {
      showEditError(result.message);
      var bad = { name: el.editName, dept: el.editDept, password: el.editPassword }[result.field];
      if (bad) bad.focus();
      return;
    }
    var employee = O.staff.findEmployee(editingId);
    el.editModal.hidden = true;
    O.components.toast.show(
      '已保存对「' + (employee ? employee.name : '') + '」的修改' + (result.passwordReset ? '，密码已重置' : ''),
      'ok'
    );
    render();
  }

  /* ---------------------------------------------------------
   * 批量导入
   * ------------------------------------------------------- */

  /** 预览通过校验的行，确认导入时才真正写入 */
  var importState = { entries: [] };

  function openImportModal() {
    importState.entries = [];
    el.importPick.hidden = false;
    el.importPreview.hidden = true;
    el.importResult.hidden = true;
    el.importSubmit.hidden = true;
    el.importDone.hidden = true;
    el.importCancel.textContent = '取消';
    el.importError.hidden = true;
    el.importFile.value = '';
    el.importModal.hidden = false;
  }

  /** 下载模板：带 BOM 的 CSV，Excel / WPS 打开中文不乱码 */
  function downloadTemplate() {
    var rows = [
      ['姓名', '员工编号', '部门', '角色', '初始密码'],
      ['张示例', 'E9999', '产品部', '员工', 'abc12345']
    ];
    var text = O.csv.BOM + O.csv.stringify(rows);
    var blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '员工导入模板.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /**
   * 读文件文本：优先按 UTF-8 严格解码，失败（多半是 Excel 存成了 GBK）再退 GBK，
   * 避免中文变成乱码。
   */
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

      // 按表头映射列，容忍列顺序不同和多余的列
      var header = rows[0].map(function (h) { return String(h).trim(); });
      var idx = {};
      ['姓名', '员工编号', '部门', '角色', '初始密码'].forEach(function (name) {
        idx[name] = header.indexOf(name);
      });
      var missing = ['姓名', '员工编号', '部门', '角色'].filter(function (name) {
        return idx[name] < 0;
      });
      if (missing.length) {
        showImportError('模板缺少必需的列：' + missing.join('、') + '（请使用页面提供的模板）');
        return;
      }

      var entries = rows.slice(1).map(function (cells, i) {
        return {
          lineNo: i + 2,
          name: cell(cells, idx['姓名']),
          employeeId: cell(cells, idx['员工编号']),
          dept: cell(cells, idx['部门']),
          role: cell(cells, idx['角色']),
          password: idx['初始密码'] >= 0 ? cell(cells, idx['初始密码']) : ''
        };
      });
      if (!entries.length) {
        showImportError('模板里没有数据行（第一行是表头，不算数据）');
        return;
      }
      if (entries.length > 500) {
        showImportError('一次最多导入 500 行，当前 ' + entries.length + ' 行，请拆分文件');
        return;
      }

      var result = O.staff.validateImportRows(entries, liveUser());
      if (result && result.fatal) {
        showImportError(result.fatal);
        return;
      }
      importState.entries = result;
      renderImportPreview();
    }).catch(function () {
      showImportError('文件读取失败，请重试');
    });
  }

  function cell(cells, i) {
    return (i >= 0 && cells[i] !== undefined) ? String(cells[i]) : '';
  }

  function renderImportPreview() {
    var entries = importState.entries;
    var valid = entries.filter(function (e) { return e.ok; }).length;
    var bad = entries.length - valid;

    el.importSummary.innerHTML =
      '共 <b>' + entries.length + '</b> 行 · ' +
      '<span class="badge badge-ok">通过 ' + valid + ' 行</span> ' +
      '<span class="badge ' + (bad ? 'badge-danger' : 'badge-muted') + '">有问题 ' + bad + ' 行</span>';

    el.importRows.innerHTML = entries.map(function (e) {
      var pwd = e.useDefaultPassword
        ? '<span class="text-xs text-muted">默认 ' + esc(O.staff.DEFAULT_IMPORT_PASSWORD) + '</span>'
        : '已填写';
      var verdict = e.ok
        ? '<span class="badge badge-ok">通过</span>'
        : '<span class="badge badge-danger">未通过</span><div class="text-xs text-muted" style="margin-top:4px;max-width:260px">' + esc(e.reason) + '</div>';
      return '' +
        '<tr' + (e.ok ? '' : ' class="staff-row-bad"') + '>' +
          '<td class="mono">' + e.lineNo + '</td>' +
          '<td>' + esc(e.name || '—') + '</td>' +
          '<td class="mono">' + esc(e.code || '—') + '</td>' +
          '<td>' + esc(e.dept || '—') + '</td>' +
          '<td>' + esc(e.role || '—') + '</td>' +
          '<td>' + pwd + '</td>' +
          '<td>' + verdict + '</td>' +
        '</tr>';
    }).join('');

    el.importPick.hidden = true;
    el.importPreview.hidden = false;
    el.importResult.hidden = true;
    el.importSubmit.hidden = false;
    el.importSubmit.disabled = valid === 0;
    el.importSubmit.textContent = valid ? '确认导入（' + valid + ' 行）' : '没有可导入的行';
  }

  function submitImport() {
    var result = O.staff.importEmployees(importState.entries, liveUser());
    if (!result.ok) {
      showImportError(result.message);
      return;
    }

    var skipped = result.skipped || [];
    el.importResultSummary.innerHTML =
      '导入完成：成功 <b>' + result.imported + '</b> 行' +
      (skipped.length ? '，跳过 <b>' + skipped.length + '</b> 行' : '，没有跳过任何行');

    if (skipped.length) {
      el.importSkipped.innerHTML = skipped.map(function (s) {
        return '<tr><td class="mono">' + esc(String(s.lineNo)) + '</td><td>' + esc(s.reason) + '</td></tr>';
      }).join('');
      el.importSkippedWrap.hidden = false;
    } else {
      el.importSkippedWrap.hidden = true;
    }

    el.importPick.hidden = true;
    el.importPreview.hidden = true;
    el.importResult.hidden = false;
    el.importSubmit.hidden = true;
    el.importDone.hidden = false;
    el.importCancel.textContent = '关闭';
  }

  function showImportError(message) {
    el.importError.textContent = message;
    el.importError.hidden = false;
  }

  /* ---------------------------------------------------------
   * 公共小件
   * ------------------------------------------------------- */

  /** 部门输入框的候选：预置五个 + 名册里出现过的部门 */
  function fillDeptOptions() {
    var options = O.staff.departments().map(function (d) {
      return '<option value="' + esc(d) + '"></option>';
    }).join('');
    el.deptOptions.innerHTML = options;
  }

  function showCreateError(message) {
    el.createError.textContent = message;
    el.createError.hidden = false;
  }

  function showEditError(message) {
    el.editError.textContent = message;
    el.editError.hidden = false;
  }

  /** 静态绑定一次（init 每次登录都会调用，避免重复挂监听） */
  function bindStatic() {
    if (el.bound) return;
    el.bound = true;

    el.createModal = document.getElementById('staffCreateModal');
    el.createClose = document.getElementById('staffCreateClose');
    el.createCancel = document.getElementById('staffCreateCancel');
    el.createSubmitBtn = document.getElementById('staffCreateSubmit');
    el.createName = document.getElementById('staffName');
    el.createCode = document.getElementById('staffCode');
    el.createDept = document.getElementById('staffDept');
    el.createRole = document.getElementById('staffRole');
    el.createRoleHint = document.getElementById('staffRoleHint');
    el.createPassword = document.getElementById('staffPassword');
    el.createError = document.getElementById('staffCreateError');
    el.deptOptions = document.getElementById('staffDeptOptions');

    el.editModal = document.getElementById('staffEditModal');
    el.editClose = document.getElementById('staffEditClose');
    el.editCancel = document.getElementById('staffEditCancel');
    el.editSubmitBtn = document.getElementById('staffEditSubmit');
    el.editName = document.getElementById('staffEditName');
    el.editCode = document.getElementById('staffEditCode');
    el.editDept = document.getElementById('staffEditDept');
    el.editRole = document.getElementById('staffEditRole');
    el.editAccountRow = document.getElementById('staffEditAccountRow');
    el.editEnabled = document.getElementById('staffEditEnabled');
    el.editEnabledText = document.getElementById('staffEditEnabledText');
    el.editPasswordRow = document.getElementById('staffEditPasswordRow');
    el.editPassword = document.getElementById('staffEditPassword');
    el.editNoAccount = document.getElementById('staffEditNoAccount');
    el.editError = document.getElementById('staffEditError');

    if (!el.createModal || !el.editModal) return;

    el.createClose.addEventListener('click', function () { el.createModal.hidden = true; });
    el.createCancel.addEventListener('click', function () { el.createModal.hidden = true; });
    el.createSubmitBtn.addEventListener('click', submitCreate);
    el.createModal.addEventListener('click', function (event) {
      if (event.target === el.createModal) el.createModal.hidden = true;
    });

    el.editClose.addEventListener('click', function () { el.editModal.hidden = true; });
    el.editCancel.addEventListener('click', function () { el.editModal.hidden = true; });
    el.editSubmitBtn.addEventListener('click', submitEdit);
    el.editModal.addEventListener('click', function (event) {
      if (event.target === el.editModal) el.editModal.hidden = true;
    });

    el.editEnabled.addEventListener('change', function () {
      el.editEnabledText.textContent = el.editEnabled.checked ? '已启用' : '已停用';
    });

    // 批量导入弹窗
    el.importModal = document.getElementById('staffImportModal');
    el.importClose = document.getElementById('staffImportClose');
    el.importCancel = document.getElementById('staffImportCancel');
    el.importPick = document.getElementById('staffImportPick');
    el.importPreview = document.getElementById('staffImportPreview');
    el.importResult = document.getElementById('staffImportResult');
    el.importTplBtn = document.getElementById('staffImportTplBtn');
    el.importPickBtn = document.getElementById('staffImportPickBtn');
    el.importFile = document.getElementById('staffImportFile');
    el.importError = document.getElementById('staffImportError');
    el.importSummary = document.getElementById('staffImportSummary');
    el.importRows = document.getElementById('staffImportRows');
    el.importSubmit = document.getElementById('staffImportSubmit');
    el.importDone = document.getElementById('staffImportDone');
    el.importResultSummary = document.getElementById('staffImportResultSummary');
    el.importSkippedWrap = document.getElementById('staffImportSkippedWrap');
    el.importSkipped = document.getElementById('staffImportSkipped');

    if (el.importModal) {
      el.importClose.addEventListener('click', closeImportModal);
      el.importCancel.addEventListener('click', closeImportModal);
      el.importModal.addEventListener('click', function (event) {
        if (event.target === el.importModal) closeImportModal();
      });
      el.importTplBtn.addEventListener('click', downloadTemplate);
      el.importPickBtn.addEventListener('click', function () { el.importFile.click(); });
      el.importFile.addEventListener('change', handleImportFile);
      el.importSubmit.addEventListener('click', submitImport);
      el.importDone.addEventListener('click', function () {
        closeImportModal();
        render();
      });
    }

    function closeImportModal() {
      el.importModal.hidden = true;
    }

    // 弹窗里按 Enter 直接提交
    ['staffName', 'staffCode', 'staffDept', 'staffRole', 'staffPassword'].forEach(function (id) {
      var input = document.getElementById(id);
      if (!input) return;
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') { event.preventDefault(); el.createSubmitBtn.click(); }
      });
    });
    ['staffEditName', 'staffEditDept', 'staffEditPassword'].forEach(function (id) {
      var input = document.getElementById(id);
      if (!input) return;
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') { event.preventDefault(); el.editSubmitBtn.click(); }
      });
    });
  }

  O.pages.staff = { init: init, onShow: onShow };
})(typeof globalThis !== 'undefined' ? globalThis : this);
