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

  var el = {};
  var currentUser = null;

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

    bindAuthForms();
    bindShell();

    O.store.init(O.seed.build()).then(function () {
      var session = O.auth.currentUser();
      if (session) {
        enterApp(session);
      } else if (O.auth.hasAccounts()) {
        showLogin();
      } else {
        showSetup();
      }
    });
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
    setTimeout(function () { document.getElementById('setupName').focus(); }, 40);
  }

  function showLogin() {
    el.appShell.hidden = true;
    el.authScreen.hidden = false;
    el.paneSetup.hidden = true;
    el.paneLogin.hidden = false;
    el.loginError.hidden = true;
    setTimeout(function () { document.getElementById('loginUsername').focus(); }, 40);
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
        enterApp(result.account);
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
        var result = O.auth.login(username, password);
        if (!result.ok) {
          showError(el.loginError, result.message);
          return;
        }
        el.loginError.hidden = true;
        document.getElementById('loginPassword').value = '';
        enterApp(result.account);
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

    var forgot = document.getElementById('forgotLink');
    if (forgot) {
      forgot.addEventListener('click', function () {
        O.components.toast.show('这是本机演示版：可以在浏览器里清除本站数据后重新创建工作空间', 'warn');
      });
    }
  }

  function capitalize(text) {
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
  }

  /* ---------------------------------------------------------
   * 进入主界面
   * ------------------------------------------------------- */
  function enterApp(user) {
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

    if (!window.location.hash || window.location.hash === '#/') {
      window.location.hash = '#/overview';
    }
    route();
  }

  function logout() {
    O.auth.clearCurrentUser();
    currentUser = null;
    el.appShell.hidden = true;
    el.authScreen.hidden = false;
    el.paneLogin.hidden = false;
    el.paneSetup.hidden = true;
    el.loginError.hidden = true;
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
    setTimeout(function () { document.getElementById('loginUsername').focus(); }, 40);
  }

  /* ---------------------------------------------------------
   * 导航
   * ------------------------------------------------------- */
  function route() {
    var hash = (window.location.hash || '#/overview').replace('#/', '');
    var target = PAGE_TITLES[hash] ? hash : 'overview';

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
    el.appShell.hidden = true;
    el.authScreen.hidden = false;
    el.paneLogin.hidden = false;
    el.paneSetup.hidden = true;
    el.loginError.hidden = true;
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
