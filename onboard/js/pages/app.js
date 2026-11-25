/**
 * 初见 Onboard · 主界面外壳
 *
 * 负责：登录 / 创建工作空间 / 导航切换 / 页面标题 / 修改密码 / 退出登录。
 * 页面能不能打开，一律由 js/core/permissions.js 判定 —— 隐藏导航只是"不给你看入口"，
 * 真正的拦截在 route() 里：直接改地址栏访问同样会被拒绝。
 */
(function (root) {
  var O = root.Onboard;
  O.pages = O.pages || {};

  var PAGE_TITLES = {
    overview: '工作概览',
    chat: '员工问答',
    leave: '年假',
    leaveadmin: '年假管理',
    tickets: '我的工单',
    faq: '常见问题',
    org: '组织架构',
    policies: '制度中心',
    knowledge: '制度知识库',
    staff: '员工管理',
    hr: '员工与制度',
    ops: '回答质量',
    learn: '学习中心',
    accounts: '账号与权限'
  };

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
    el.deniedText = document.getElementById('deniedText');
    el.deniedHome = document.getElementById('deniedHome');

    bindAuthForms();
    bindShell();

    var seedState = O.seed.build();
    O.store.init(seedState).then(function (info) {
      // localStorage 不可用（隐私/无痕窗口、浏览器限制）时存储会降级为内存：
      // 页面一切正常，但刷新就全丢。必须明确告诉用户，不能静默。
      if (info && info.available === false) showStorageWarning();

      // 老工作空间可能是在新集合（如年假明细）出现之前播种的：
      // applySeed 只补"本地还没有的"集合，绝不覆盖已有数据。
      O.store.applySeed(seedState);
      O.store.scheduleServerSync();

      O.auth.migrate();        // 老账号的角色名、启用状态迁移
      ensureSampleAccounts();  // 补齐示例账号

      var session = O.auth.currentUser();
      if (session) {
        if (session.enabled === false) {
          O.auth.clearCurrentUser();
          showLogin();
          O.components.toast.show('该账号已停用，请联系系统管理员', 'warn');
        } else {
          enterApp(session, false);
        }
      } else if (O.auth.hasAccounts()) {
        showLogin();
      } else {
        showSetup();
      }
    });
  }

  /** 存储降级为内存时页面顶部的常驻提示条 */
  function showStorageWarning() {
    try { console.warn('[初见] localStorage 不可用，已降级为内存存储：刷新或关闭页面后，本次所有改动都会丢失'); } catch (e) { /* ignore */ }
    var bar = document.createElement('div');
    bar.className = 'storage-warn';
    bar.textContent = '⚠ 当前浏览器无法持久保存数据（可能是隐私 / 无痕窗口）：刷新或关闭页面后，本次的改动会全部丢失。请改用普通窗口，或用 node server.js 打开本站。';
    document.body.appendChild(bar);
  }

  /**
   * 补齐示例账号。
   * 工作空间可能是在示例账号这个功能之前创建的，那样系统里一个员工账号都没有，
   * 登录页上写着的 E1001 就登不进去。这里做一次补齐，已存在的账号不会被覆盖。
   */
  function ensureSampleAccounts() {
    if (!O.auth.hasAccounts()) return;   // 还没创建工作空间，等创建流程自己处理
    var employees = O.auth.accounts().filter(function (a) { return a.role === '员工'; });
    if (employees.length) return;

    var created = O.auth.provisionSampleAccounts();
    if (created.length) {
      console.log('[初见] 已补齐示例账号：' + created.map(function (a) {
        return a.username + '(' + a.role + ')';
      }).join('、'));
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

    // 每次回到登录页都确认一遍示例账号还在
    ensureSampleAccounts();

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
    document.getElementById('userMeta').textContent =
      (user.dept || '—') + ' · ' + O.permissions.roleName(user.role);
    var avatar = document.getElementById('userAvatar');
    avatar.textContent = (user.name || '初').charAt(0);

    var welcomeTitle = document.getElementById('welcomeTitle');
    var welcomeText = document.getElementById('welcomeText');
    if (welcomeTitle) welcomeTitle.textContent = '欢迎回来，' + user.name;
    if (welcomeText) {
      var ws = O.auth.workspace();
      welcomeText.textContent = '欢迎使用初见onboard。' +
        (ws ? '当前工作空间：' + ws.name + '。' : '') +
        '当前身份：' + O.permissions.roleName(user.role) + '。';
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

    if (O.pages.accounts && O.pages.accounts.init) {
      O.pages.accounts.init(user);
    }

    if (O.pages.staff && O.pages.staff.init) {
      O.pages.staff.init(user);
    }

    if (O.pages.org && O.pages.org.init) {
      O.pages.org.init(user);
    }

    if (O.pages.policies && O.pages.policies.init) {
      O.pages.policies.init(user);
    }

    if (O.pages.leave && O.pages.leave.init) {
      O.pages.leave.init(user);
    }

    if (O.pages.leaveadmin && O.pages.leaveadmin.init) {
      O.pages.leaveadmin.init(user);
    }

    if (O.pages.knowledge && O.pages.knowledge.init) {
      O.pages.knowledge.init(user);
    }

    applyNavPermissions();

    // 落地页：按角色决定他能进的第一个页面
    if (isFreshLogin || !window.location.hash || window.location.hash === '#/') {
      window.location.hash = '#/' + O.permissions.homePage(user);
    }
    route();
  }

  /** 导航栏只显示这个角色能进的页面（入口隐藏，权限拦截在 route()） */
  function applyNavPermissions() {
    var allowed = O.permissions.allowedPages(currentUser);
    O.dom.$$('#sideMenu a[data-pane]').forEach(function (a) {
      a.hidden = allowed.indexOf(a.getAttribute('data-pane')) < 0;
    });
    O.dom.$$('#sideMenu .nav-group-title').forEach(function (t) {
      t.hidden = false;
    });
  }

  function logout(message) {
    O.auth.clearCurrentUser();
    currentUser = null;
    showLogin();
    if (message) O.components.toast.show(message, 'warn');
  }

  /* ---------------------------------------------------------
   * 导航与路由（这里是权限真正生效的地方）
   * ------------------------------------------------------- */
  function route() {
    if (!currentUser) return;

    // 登录期间账号被停用 → 立刻退出。
    // 这里重新读一次账号记录，不能用登录时缓存在内存里的那份，
    // 否则管理员在别处停用了他，本机这边还当自己是正常状态。
    var live = O.auth.findById(currentUser.id);
    if (!live || live.enabled === false) {
      logout('该账号已停用，已退出登录');
      return;
    }
    currentUser = live;

    var hash = (window.location.hash || '').replace('#/', '');
    var target = PAGE_TITLES[hash] ? hash : '';

    if (!target) {
      target = O.permissions.homePage(currentUser);
      window.location.hash = '#/' + target;
      return;
    }

    // 没有权限 → 直接拒绝，不显示那个页面
    if (!O.permissions.canView(currentUser, target)) {
      showDenied(target);
      return;
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

    if (O.pages.staff && O.pages.staff.onShow) {
      O.pages.staff.onShow(target);
    }

    if (O.pages.org && O.pages.org.onShow) {
      O.pages.org.onShow(target);
    }

    if (O.pages.policies && O.pages.policies.onShow) {
      O.pages.policies.onShow(target);
    }

    if (O.pages.leave && O.pages.leave.onShow) {
      O.pages.leave.onShow(target);
    }

    if (O.pages.leaveadmin && O.pages.leaveadmin.onShow) {
      O.pages.leaveadmin.onShow(target);
    }

    if (O.pages.knowledge && O.pages.knowledge.onShow) {
      O.pages.knowledge.onShow(target);
    }
  }

  /** 无权访问时显示的拒绝页 */
  function showDenied(target) {
    O.dom.$$('.pane').forEach(function (pane) {
      pane.classList.toggle('is-active', pane.id === 'pane-denied');
    });
    O.dom.$$('#sideMenu a').forEach(function (a) {
      a.classList.remove('is-active');
    });
    el.pageTitle.textContent = '无权访问';
    if (el.deniedText) {
      el.deniedText.textContent = O.permissions.denyMessage(currentUser, target);
    }
    if (el.deniedHome) {
      el.deniedHome.setAttribute('href', '#/' + O.permissions.homePage(currentUser));
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
