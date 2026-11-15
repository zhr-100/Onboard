/**
 * 初见 Onboard · 主界面外壳
 *
 * 负责：登录 / 创建工作空间 / 导航切换 / 页面标题 / 修改密码 / 退出登录。
 * 问答页和工单页的业务逻辑在 js/pages/employee.js 里。
 */
(function (root) {
  var O = root.Onboard;
  O.pages = O.pages || {};

  var PAGE_TITLES = {
    overview: '工作概览',
    chat: '员工问答',
    leave: '年假',
    tickets: '我的工单',
    faq: '常见问题',
    hr: '员工与制度',
    ops: '回答质量',
    learn: '学习中心'
  };

  /** 只有管理身份能进的页面 */
  var ADMIN_PANES = ['hr', 'ops', 'learn'];

  var el = {};
  var currentUser = null;
  /** 当前登录入口：'employee' 员工登录 / 'admin' 管理后台 */
  var loginScope = 'employee';

  var SCOPE_TEXT = {
    employee: {
      title: '员工登录',
      desc: '用员工编号或员工账号登录。',
      label: '员工编号 / 员工账号',
      placeholder: '例如：E1001'
    },
    admin: {
      title: '管理后台',
      desc: '用管理账号登录，进入管理工作区。',
      label: '管理账号',
      placeholder: '例如：admin'
    }
  };

  /* ---------------------------------------------------------
   * 启动
   * ------------------------------------------------------- */
  function boot() {
    el.authScreen = document.getElementById('authScreen');
    el.appShell = document.getElementById('appShell');
    el.paneSetup = document.getElementById('paneSetup');
    el.paneLogin = document.getElementById('paneLogin');
    el.setupError = document.getElementById('setupError');
    el.loginError = document.getElementById('loginError');
    el.pwdModal = document.getElementById('pwdModal');
    el.pwdError = document.getElementById('pwdError');
    el.pageTitle = document.getElementById('pageTitle');
    el.pageDate = document.getElementById('pageDate');
    el.authFoot = document.getElementById('authFoot');
    el.forgotNote = document.getElementById('forgotNote');
    el.employeeDemoHint = document.getElementById('employeeDemoHint');

    bindAuthForms();
    bindShell();

    O.store.init(O.seed.build()).then(function () {
      ensureSampleEmployees();

      var session = O.auth.currentUser();
      if (session) {
        enterApp(session, false);
      } else if (O.auth.hasAccounts()) {
        showLogin();
      } else {
        showSetup();
      }
    });
  }

  /**
   * 补齐示例员工账号。
   * 工作空间可能是在"示例员工账号"这个功能之前创建的（或者创建时没勾选），
   * 那样系统里就一个员工账号都没有，文档里写的 E1001 登不进去。
   * 这里做一次补齐：只要一个员工账号都没有，就补上那几个示例账号。
   * 已经存在的账号不会被覆盖。
   */
  function ensureSampleEmployees() {
    if (!O.auth.hasAccounts()) return;   // 还没创建工作空间，等创建流程自己处理
    var employees = O.auth.accounts().filter(function (a) { return a.role === '员工'; });
    if (employees.length) return;

    var created = O.auth.provisionSampleEmployees();
    if (created.length) {
      console.log('[初见] 已补齐示例员工账号：' + created.map(function (a) { return a.username; }).join('、'));
      O.components.toast.show(
        '已为示例员工开通演示账号（' + created.map(function (a) { return a.username; }).join('、') + '）',
        'ok'
      );
    }
  }

  /* ---------------------------------------------------------
   * 认证页
   * ------------------------------------------------------- */
  function showSetup() {
    el.appShell.hidden = true;
    el.authScreen.hidden = false;
    el.paneSetup.hidden = false;
    el.paneLogin.hidden = true;
    el.setupError.hidden = true;
    el.authFoot.textContent = '本机首次使用：创建第一个管理账号，之后账号由管理员分配。';
    setTimeout(function () { document.getElementById('setupName').focus(); }, 40);
  }

  function showLogin() {
    el.appShell.hidden = true;
    el.authScreen.hidden = false;
    el.paneSetup.hidden = true;
    el.paneLogin.hidden = false;
    el.loginError.hidden = true;
    el.authFoot.textContent = '账号由公司管理员分配，无公开注册。';
    if (el.forgotNote) el.forgotNote.hidden = true;

    // 每次回到登录页都确认一遍示例员工账号还在
    // （老工作空间是在这个功能之前创建的，登录页上写的 E1001 就登不进去）
    ensureSampleEmployees();

    var showPwd = document.getElementById('showPassword');
    if (showPwd) {
      showPwd.checked = false;
      var pwdInput = document.getElementById('loginPassword');
      if (pwdInput) pwdInput.type = 'password';
    }
    var userInput = document.getElementById('loginUsername');
    var pwd = document.getElementById('loginPassword');
    if (userInput) userInput.value = '';
    if (pwd) pwd.value = '';

    applyScope(loginScope);
    setTimeout(function () { document.getElementById('loginUsername').focus(); }, 40);
  }

  /** 切换登录入口 */
  function applyScope(scope) {
    loginScope = scope === 'admin' ? 'admin' : 'employee';
    var text = SCOPE_TEXT[loginScope];

    O.dom.$$('.login-tab').forEach(function (tab) {
      var on = tab.getAttribute('data-scope') === loginScope;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    document.getElementById('loginTitle').textContent = text.title;
    document.getElementById('loginDesc').textContent = text.desc;
    document.getElementById('loginUsernameLabel').textContent = text.label;
    var input = document.getElementById('loginUsername');
    if (input) input.placeholder = text.placeholder;

    // 示例账号提示只在员工入口下出现
    if (el.employeeDemoHint) {
      el.employeeDemoHint.hidden = loginScope !== 'employee';
    }
  }

  function showError(node, message) {
    if (!node) return;
    node.textContent = message;
    node.hidden = false;
  }

  function bindAuthForms() {
    var setupSubmit = document.getElementById('setupSubmit');
    if (setupSubmit) {
      setupSubmit.addEventListener('click', function () {
        var sample = document.getElementById('setupSample');
        var input = {
          name: document.getElementById('setupName').value,
          dept: document.getElementById('setupDept').value,
          username: document.getElementById('setupUsername').value,
          password: document.getElementById('setupPassword').value,
          confirmPassword: document.getElementById('setupConfirm').value
        };
        var result = O.auth.createWorkspace(input);
        if (!result.ok) {
          showError(el.setupError, result.message);
          var bad = document.getElementById(result.field === 'confirmPassword' ? 'setupConfirm' : 'setup' + capitalize(result.field));
          if (bad) bad.focus();
          return;
        }
        enterApp(result.account, true);
        O.components.toast.show('工作空间已创建，欢迎加入', 'ok');
      });
    }

    // 回车即提交
    ['setupName', 'setupDept', 'setupUsername', 'setupPassword', 'setupConfirm'].forEach(function (id) {
      var input = document.getElementById(id);
      if (!input) return;
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          setupSubmit.click();
        }
      });
    });

    var loginSubmit = document.getElementById('loginSubmit');
    if (loginSubmit) {
      loginSubmit.addEventListener('click', function () {
        var username = document.getElementById('loginUsername').value;
        var password = document.getElementById('loginPassword').value;
        var result = O.auth.login(username, password, loginScope);
        if (!result.ok) {
          showError(el.loginError, result.message);
          return;
        }
        el.loginError.hidden = true;
        document.getElementById('loginPassword').value = '';
        enterApp(result.account, true);
      });
    }

    // 登录入口切换：员工登录 / 管理后台
    O.dom.on(el.authScreen, 'click', '.login-tab', function (event, tab) {
      applyScope(tab.getAttribute('data-scope'));
      el.loginError.hidden = true;
    });

    // 显示密码
    var showPwd = document.getElementById('showPassword');
    if (showPwd) {
      showPwd.addEventListener('change', function () {
        var input = document.getElementById('loginPassword');
        if (input) input.type = showPwd.checked ? 'text' : 'password';
      });
    }

    // 忘记密码：只给出统一提示，不提供任何自助重置入口
    var forgot = document.getElementById('forgotLink');
    if (forgot) {
      forgot.addEventListener('click', function () {
        if (el.forgotNote) el.forgotNote.hidden = false;
      });
    }

    ['loginUsername', 'loginPassword'].forEach(function (id) {
      var input = document.getElementById(id);
      if (!input) return;
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          loginSubmit.click();
        }
      });
    });
  }

  function capitalize(text) {
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
  }

  /* ---------------------------------------------------------
   * 进入主界面
   * ------------------------------------------------------- */
  function enterApp(user, isFreshLogin) {
    currentUser = user;
    el.authScreen.hidden = true;
    el.appShell.hidden = false;

    document.getElementById('userName').textContent = user.name;
    document.getElementById('userMeta').textContent = (user.dept || '—') + ' · ' + (user.role || '—');
    var avatar = document.getElementById('userAvatar');
    avatar.textContent = (user.name || '初').charAt(0);

    var welcomeTitle = document.getElementById('welcomeTitle');
    var welcomeText = document.getElementById('welcomeText');
    if (welcomeTitle) welcomeTitle.textContent = '欢迎回来，' + user.name;
    if (welcomeText) {
      var ws = O.auth.workspace();
      welcomeText.textContent = '欢迎使用初见onboard。' +
        (ws ? '当前工作空间：' + ws.name + '。' : '') +
        '这里是工作概览，接下来的每一步都会围绕它展开。';
    }

    var date = document.getElementById('pageDate');
    if (date) {
      var d = new Date();
      var week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
      date.textContent = d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 · 星期' + week;
    }

    if (O.pages.employee && O.pages.employee.init) {
      O.pages.employee.init(user);
    }

    // 员工身份看不到「管理」区的入口
    var isEmployee = O.auth.isEmployee(user);
    O.dom.$$('#sideMenu [data-role="admin"]').forEach(function (node) {
      node.hidden = isEmployee;
    });

    // 员工直接进「员工问答」，管理账号进「工作概览」。
    // 只有"刚刚登录成功"时才重置落地页；刷新页面时保留原来停在哪一页。
    if (isFreshLogin) {
      window.location.hash = isEmployee ? '#/chat' : '#/overview';
    } else if (!window.location.hash || window.location.hash === '#/') {
      window.location.hash = isEmployee ? '#/chat' : '#/overview';
    }
    route();
  }

  function logout() {
    O.auth.clearCurrentUser();
    currentUser = null;
    showLogin();
  }

  /* ---------------------------------------------------------
   * 导航
   * ------------------------------------------------------- */
  function route() {
    var hash = (window.location.hash || '#/overview').replace('#/', '');
    var target = PAGE_TITLES[hash] ? hash : 'overview';

    // 员工身份进不了管理区
    if (currentUser && O.auth.isEmployee(currentUser) && ADMIN_PANES.indexOf(target) >= 0) {
      target = 'chat';
      window.location.hash = '#/chat';
    }

    O.dom.$$('.pane').forEach(function (pane) {
      pane.classList.toggle('is-active', pane.id === 'pane-' + target);
    });

    O.dom.$$('#sideMenu a').forEach(function (a) {
      a.classList.toggle('is-active', a.getAttribute('data-pane') === target);
    });

    el.pageTitle.textContent = PAGE_TITLES[target];

    if (O.pages.employee && O.pages.employee.onShow) {
      O.pages.employee.onShow(target);
    }
  }

  function bindShell() {
    window.addEventListener('hashchange', route);

    var logoutBtn = document.getElementById('btnLogout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        logout();
      });
    }

    var pwdBtn = document.getElementById('btnChangePwd');
    if (pwdBtn) {
      pwdBtn.addEventListener('click', openPasswordModal);
    }

    var close = document.getElementById('pwdClose');
    var cancel = document.getElementById('pwdCancel');
    var submit = document.getElementById('pwdSubmit');
    if (close) close.addEventListener('click', closePasswordModal);
    if (cancel) cancel.addEventListener('click', closePasswordModal);
    if (submit) submit.addEventListener('click', changePassword);

    el.pwdModal.addEventListener('click', function (event) {
      if (event.target === el.pwdModal) closePasswordModal();
    });
  }

  /* ---------------------------------------------------------
   * 修改密码
   * ------------------------------------------------------- */
  function openPasswordModal() {
    el.pwdModal.hidden = false;
    el.pwdError.hidden = true;
    document.getElementById('pwdOld').value = '';
    document.getElementById('pwdNew').value = '';
    document.getElementById('pwdConfirm').value = '';
    setTimeout(function () { document.getElementById('pwdOld').focus(); }, 40);
  }

  function closePasswordModal() {
    el.pwdModal.hidden = true;
  }

  function changePassword() {
    var oldPwd = document.getElementById('pwdOld').value;
    var newPwd = document.getElementById('pwdNew').value;
    var confirm = document.getElementById('pwdConfirm').value;

    if (!currentUser) return;
    if (newPwd !== confirm) {
      showError(el.pwdError, '两次输入的新密码不一致');
      return;
    }
    var result = O.auth.changePassword(currentUser.id, oldPwd, newPwd);
    if (!result.ok) {
      showError(el.pwdError, result.message);
      return;
    }
    var username = currentUser.username;
    closePasswordModal();
    O.auth.clearCurrentUser();
    currentUser = null;
    showLogin();
    document.getElementById('loginUsername').value = username;
    O.components.toast.show('密码已修改，请用新密码登录', 'ok');
  }

  O.pages.app = {
    boot: boot,
    route: route,
    logout: logout,
    getUser: function () { return currentUser; }
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
