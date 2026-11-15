/**
 * 初见 Onboard · 账号与权限页（仅系统管理员）
 *
 * 这里只是"管理入口"，真正的权限判定在 js/core/permissions.js。
 * 页面本身也会被 route() 拦住 —— 就算手动改地址栏进来，也会被拒绝。
 */
(function (root) {
  var O = root.Onboard;
  O.pages = O.pages || {};

  var panel = null;
  var currentUser = null;

  function esc(s) { return O.dom.escapeHtml(s); }

  function init(user) {
    currentUser = user;
    panel = document.getElementById('accountsPanel');
    if (panel) render();
  }

  function onShow(pane) {
    if (pane === 'accounts') render();
  }

  function canManage() {
    return O.permissions.can(currentUser, 'manage.accounts');
  }

  function render() {
    if (!panel) return;
    if (!canManage()) {
      panel.innerHTML =
        '<div class="empty">' +
          '<div class="empty-icon">🔐</div>' +
          '<div class="empty-title">无权管理账号</div>' +
          '<div class="empty-desc">只有系统管理员可以管理账号。</div>' +
        '</div>';
      return;
    }

    var accounts = O.auth.accounts().slice().sort(function (a, b) {
      if (a.role !== b.role) {
        var order = O.permissions.ROLES;
        return order.indexOf(a.role) - order.indexOf(b.role);
      }
      return a.username.localeCompare(b.username);
    });

    var rows = accounts.map(function (a) {
      var enabled = a.enabled !== false;
      var isSelf = currentUser && a.id === currentUser.id;
      return '' +
        '<tr>' +
          '<td>' + esc(a.name) + (isSelf ? ' <span class="badge badge-info">当前登录</span>' : '') + '</td>' +
          '<td class="mono">' + esc(a.username) + '</td>' +
          '<td>' + esc(a.dept || '—') + '</td>' +
          '<td>' +
            '<select class="select" data-role-for="' + esc(a.id) + '"' + (isSelf ? ' disabled' : '') + ' style="min-width:130px">' +
              O.permissions.ROLES.map(function (r) {
                return '<option value="' + esc(r) + '"' + (r === a.role ? ' selected' : '') + '>' + esc(r) + '</option>';
              }).join('') +
            '</select>' +
          '</td>' +
          '<td>' +
            '<label class="switch-row">' +
              '<input type="checkbox" data-enable-for="' + esc(a.id) + '"' + (enabled ? ' checked' : '') + '>' +
              '<span>' + (enabled ? '已启用' : '已停用') + '</span>' +
            '</label>' +
          '</td>' +
          '<td class="text-xs text-muted">' + esc(O.format.date(a.createdAt)) + '</td>' +
        '</tr>';
    }).join('');

    panel.innerHTML =
      '<div class="card">' +
        '<div class="card-head">' +
          '<h3>账号列表</h3>' +
          '<span class="badge badge-muted">共 ' + accounts.length + ' 个账号</span>' +
          '<div class="spacer"></div>' +
          '<button class="btn btn-ghost btn-sm" id="restoreSamples">补齐示例账号</button>' +
        '</div>' +
        '<div class="table-wrap">' +
          '<table class="tbl">' +
            '<thead><tr>' +
              '<th>姓名</th><th>账号</th><th>部门</th><th>角色</th><th>是否启用</th><th>创建时间</th>' +
            '</tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>' +

      '<div class="card" style="margin-top:16px">' +
        '<div class="card-head"><h3>四种角色能做什么</h3></div>' +
        '<div class="table-wrap">' +
          '<table class="tbl">' +
            '<thead><tr><th>角色</th><th>可以打开的页面</th><th>可以做的操作</th></tr></thead>' +
            '<tbody>' + roleRows() + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>' +

      '<p class="text-xs text-muted" style="margin-top:16px;line-height:1.8">' +
        '说明：上表只是给人看的说明。系统真正的判断写在 js/core/permissions.js，' +
        '页面跳转和操作执行都会去那里核对 —— 就算手动输入地址栏访问没有权限的页面，也会被拒绝。' +
        '被停用的账号无法登录；如果账号在登录期间被停用，下次操作时会自动退出。' +
      '</p>';

    bindPanel();
  }

  function roleRows() {
    var pageNames = O.permissions.PAGE_NAMES;
    return O.permissions.ROLES.map(function (role) {
      var perms = O.permissions.ROLE_PERMISSIONS[role] || [];
      var pages = [];
      var actions = [];
      perms.forEach(function (p) {
        if (p.indexOf('view.') === 0) {
          var page = Object.keys(O.permissions.PAGE_PERMISSIONS).filter(function (k) {
            return O.permissions.PAGE_PERMISSIONS[k] === p;
          })[0];
          if (page) pages.push(pageNames[page]);
        } else {
          actions.push(ACTION_NAMES[p] || p);
        }
      });
      return '<tr><td><strong>' + esc(role) + '</strong></td>' +
        '<td>' + esc(pages.join('、') || '—') + '</td>' +
        '<td>' + esc(actions.join('、') || '—') + '</td></tr>';
    }).join('');
  }

  var ACTION_NAMES = {
    'action.handoff': '转人工',
    'action.feedback': '回答反馈',
    'manage.hr': '管理员工与制度',
    'manage.retrieval': '调整检索参数',
    'manage.accounts': '管理账号'
  };

  function bindPanel() {
    O.dom.on(panel, 'change', '[data-enable-for]', function (event, input) {
      var id = input.getAttribute('data-enable-for');
      var enabled = input.checked;
      if (!enabled && isLastEnabledAdmin(id)) {
        input.checked = true;
        O.components.toast.show('不能停用最后一个已启用的系统管理员', 'warn');
        return;
      }
      O.auth.setEnabled(id, enabled);
      O.components.toast.show(enabled ? '账号已启用' : '账号已停用，该账号将无法登录', enabled ? 'ok' : 'warn');
      render();
    });

    O.dom.on(panel, 'change', '[data-role-for]', function (event, select) {
      var id = select.getAttribute('data-role-for');
      var role = select.value;
      var result = O.auth.setRole(id, role);
      if (!result.ok) {
        O.components.toast.show(result.message, 'warn');
        render();
        return;
      }
      O.components.toast.show('角色已改为「' + role + '」', 'ok');
      render();
    });

    var restore = document.getElementById('restoreSamples');
    if (restore) {
      restore.addEventListener('click', function () {
        var created = O.auth.provisionSampleAccounts();
        if (created.length) {
          O.components.toast.show('已补齐 ' + created.length + ' 个示例账号', 'ok');
        } else {
          O.components.toast.show('示例账号都在，无需补齐', 'warn');
        }
        render();
      });
    }
  }

  /** 停用之后会不会一个系统管理员都不剩 */
  function isLastEnabledAdmin(id) {
    var admins = O.auth.accounts().filter(function (a) {
      return a.role === '系统管理员' && a.enabled !== false && a.id !== id;
    });
    return admins.length === 0;
  }

  O.pages.accounts = { init: init, onShow: onShow };
})(typeof globalThis !== 'undefined' ? globalThis : this);
