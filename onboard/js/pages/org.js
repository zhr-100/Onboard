/**
 * 初见 Onboard · 组织架构页（员工端目录）
 *
 * 只展示「公司 → 部门 → 成员」的目录：
 *  - 成员来自员工名册，按部门分组；
 *  - 只显示在职、且登录账号未停用的成员；
 *  - 不展示职位（名册里的 title 不用于本页），也不画上下级汇报线 ——
 *    现有数据里没有可靠的汇报关系，本页不做任何推断。
 *
 * 管理入口：有「员工管理」权限的人可以从这里跳转过去；
 * 新增部门同样需要 manage.hr（HR管理员 / 系统管理员），
 * 真正的权限判定在 js/core/staff.js 的 addDepartment 里复核。
 */
(function (root) {
  var O = root.Onboard;
  O.pages = O.pages || {};

  var panel = null;
  var currentUser = null;
  var el = {};

  function esc(s) { return O.dom.escapeHtml(s); }

  function init(user) {
    currentUser = user;
    panel = document.getElementById('orgPanel');
    bindStatic();
    if (panel) render();
  }

  function onShow(pane) {
    if (pane === 'org') render();
  }

  /** 实时读一次当前账号：角色和启用状态可能刚被别人改过 */
  function liveUser() {
    if (!currentUser) return null;
    return O.auth.findById(currentUser.id) || currentUser;
  }

  /* ---------------------------------------------------------
   * 谁算「启用状态的成员」
   * ------------------------------------------------------- */

  function isVisibleMember(employee) {
    if (!employee || !employee.name) return false;
    // 已离职的人不再出现在组织架构里
    if (employee.status === '已离职') return false;
    // 有登录账号但被停用的，视为不可见
    var account = O.staff.accountOf(employee);
    if (account && account.enabled === false) return false;
    return true;
  }

  /* ---------------------------------------------------------
   * 渲染
   * ------------------------------------------------------- */

  function render() {
    if (!panel) return;

    var user = liveUser();
    if (!O.permissions.can(user, 'view.org')) {
      panel.innerHTML =
        '<div class="empty">' +
          '<div class="empty-icon">🔐</div>' +
          '<div class="empty-title">无权查看组织架构</div>' +
          '<div class="empty-desc">请联系系统管理员调整你的账号角色。</div>' +
        '</div>';
      return;
    }

    var employees = O.staff.employees();
    var members = employees.filter(isVisibleMember);

    // 部门名 → 成员列表；部门顺序沿用 staff.departments()，新增的空部门也会出现
    var groups = O.staff.departments().map(function (name) {
      return { name: name, members: [] };
    });
    var groupMap = {};
    groups.forEach(function (g) { groupMap[g.name] = g; });

    members.forEach(function (e) {
      var dept = String(e.dept || '').trim();
      var key = dept || '未分配部门';
      var group = groupMap[key];
      if (!group) {
        group = { name: key, members: [] };
        groupMap[key] = group;
        groups.push(group);
      }
      group.members.push(e);
    });

    var nameSort = function (a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN'); };
    groups.forEach(function (g) { g.members.sort(nameSort); });

    var totalDepts = groups.length;
    var canManage = O.staff.canManage(user);
    var canOpenStaff = O.permissions.canView(user, 'staff');

    var actions = '';
    if (canManage || canOpenStaff) {
      actions = '<div class="org-company-actions">';
      if (canManage) {
        actions += '<button class="btn btn-outline-light btn-sm" id="orgAddDeptBtn" type="button">＋ 新增部门</button>';
      }
      if (canOpenStaff) {
        actions += '<a class="btn btn-outline-light btn-sm" href="#/staff">员工管理</a>';
      }
      actions += '</div>';
    }

    panel.innerHTML =
      '<div class="org-company">' +
        '<span class="org-company-mark" aria-hidden="true">司</span>' +
        '<div class="org-company-text">' +
          '<h3>本公司</h3>' +
          '<p>共 ' + totalDepts + ' 个部门 · ' + members.length + ' 位成员</p>' +
        '</div>' +
        actions +
      '</div>' +

      '<div class="org-grid">' +
        groups.map(deptCard).join('') +
      '</div>' +

      '<p class="text-xs text-muted org-note">' +
        '说明：本页只展示「部门 → 成员」的目录，只显示在职且账号未停用的成员；' +
        '不展示职位，也不表示上下级汇报关系。' +
      '</p>';

    var addBtn = document.getElementById('orgAddDeptBtn');
    if (addBtn) addBtn.addEventListener('click', openDeptModal);
  }

  function deptCard(group) {
    var count = group.members.length;
    var body;
    if (count) {
      body = group.members.map(function (e) {
        var color = e.avatarColor || '#2F6BFF';
        var text = e.avatarText || (e.name || '员').charAt(0);
        return '' +
          '<div class="org-member">' +
            '<span class="avatar" style="background:' + esc(color) + '">' + esc(text) + '</span>' +
            '<span class="org-member-name">' + esc(e.name) + '</span>' +
          '</div>';
      }).join('');
    } else {
      body = '<p class="org-empty">暂无启用的成员</p>';
    }

    return '' +
      '<div class="org-dept">' +
        '<div class="org-dept-head">' +
          '<h3>' + esc(group.name) + '</h3>' +
          '<span class="badge badge-muted">' + count + ' 人</span>' +
        '</div>' +
        '<div class="org-members">' + body + '</div>' +
      '</div>';
  }

  /* ---------------------------------------------------------
   * 新增部门弹窗
   * ------------------------------------------------------- */

  function openDeptModal() {
    if (!O.staff.canManage(liveUser())) {
      O.components.toast.show('你的角色没有新增部门的权限', 'warn');
      return;
    }
    el.name.value = '';
    el.error.hidden = true;
    el.modal.hidden = false;
    setTimeout(function () { el.name.focus(); }, 40);
  }

  function closeDeptModal() {
    el.modal.hidden = true;
  }

  function submitDept() {
    var result = O.staff.addDepartment(el.name.value, liveUser());
    if (!result.ok) {
      el.error.textContent = result.message;
      el.error.hidden = false;
      el.name.focus();
      return;
    }
    closeDeptModal();
    O.components.toast.show('已新增部门「' + result.department.name + '」，可在员工管理里添加成员', 'ok');
    render();
  }

  /** 静态绑定一次（init 每次登录都会调用，避免重复挂监听） */
  function bindStatic() {
    if (el.bound) return;
    el.bound = true;

    el.modal = document.getElementById('deptCreateModal');
    if (!el.modal) return;

    el.name = document.getElementById('deptName');
    el.error = document.getElementById('deptCreateError');
    el.submit = document.getElementById('deptCreateSubmit');
    el.cancel = document.getElementById('deptCreateCancel');
    el.close = document.getElementById('deptCreateClose');

    el.close.addEventListener('click', closeDeptModal);
    el.cancel.addEventListener('click', closeDeptModal);
    el.submit.addEventListener('click', submitDept);
    el.modal.addEventListener('click', function (event) {
      if (event.target === el.modal) closeDeptModal();
    });
    el.name.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        el.submit.click();
      }
    });
  }

  O.pages.org = { init: init, onShow: onShow };
})(typeof globalThis !== 'undefined' ? globalThis : this);
