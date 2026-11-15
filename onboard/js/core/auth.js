/**
 * 初见 Onboard · 账号与登录
 *
 * 账号保存在浏览器本地（localStorage）；用 node server.js 打开时会同步落到
 * data/runtime-state.json，浏览器清缓存也不会丢。
 *
 * 密码只存「随机盐 + 哈希」，不存明文。
 */
(function (root) {
  var O = root.Onboard;

  var MIN_PASSWORD = 6;
  var ROLES = ['管理员', 'HR', '产品运营', '员工'];
  var SESSION_KEY = 'onboard.v1.session';
  var WORKSPACE_KEY = 'onboard.v1.workspace';

  function accounts() {
    return O.store.get('accounts') || [];
  }

  function saveAccounts(list) {
    O.store.set('accounts', list);
  }

  function hasAccounts() {
    return accounts().length > 0;
  }

  function normalizeUsername(value) {
    return String(value || '').trim().toLowerCase();
  }

  function hashPassword(salt, password) {
    return O.sha256.hash(salt + '::' + password);
  }

  /**
   * 检查表单填得对不对
   * 返回 { ok, message, field }
   */
  function validate(input) {
    var name = String(input.name || '').trim();
    var username = normalizeUsername(input.username);
    var password = String(input.password || '');
    var confirm = input.confirmPassword;

    if (!name) return { ok: false, field: 'name', message: '请填写姓名' };
    if (name.length > 20) return { ok: false, field: 'name', message: '姓名不能超过 20 个字' };
    if (!username) return { ok: false, field: 'username', message: '请填写账号' };
    if (username.length < 3) return { ok: false, field: 'username', message: '账号至少 3 个字符' };
    if (username.length > 20) return { ok: false, field: 'username', message: '账号最多 20 个字符' };
    if (!/^[a-z0-9_.@-]+$/.test(username)) {
      return { ok: false, field: 'username', message: '账号只能包含字母、数字、下划线、点、@ 和减号' };
    }
    if (accounts().some(function (a) { return a.username === username; })) {
      return { ok: false, field: 'username', message: '这个账号已经存在' };
    }
    if (!password) return { ok: false, field: 'password', message: '请填写密码' };
    if (password.length < MIN_PASSWORD) {
      return { ok: false, field: 'password', message: '密码至少 ' + MIN_PASSWORD + ' 位' };
    }
    if (password.length > 64) return { ok: false, field: 'password', message: '密码最多 64 位' };
    if (confirm !== undefined && confirm !== null && confirm !== password) {
      return { ok: false, field: 'confirmPassword', message: '两次输入的密码不一致' };
    }
    return { ok: true };
  }

  /** 创建第一个管理员（也就是创建工作空间） */
  function createWorkspace(input) {
    var check = validate(input);
    if (!check.ok) return check;

    var name = String(input.name || '').trim();
    var dept = String(input.dept || '').trim() || '总部';
    var username = normalizeUsername(input.username);
    var salt = O.sha256.randomSalt();

    var account = {
      id: O.format.createId('U'),
      name: name,
      username: username,
      dept: dept,
      role: ROLES[0],
      salt: salt,
      passwordHash: hashPassword(salt, input.password),
      status: '正常',
      isOwner: true,
      createdAt: new Date().toISOString(),
      lastLoginAt: null
    };

    var list = accounts();
    list.push(account);
    saveAccounts(list);

    var workspace = {
      id: O.format.createId('WS'),
      name: name + '的工作空间',
      ownerId: account.id,
      createdAt: new Date().toISOString()
    };
    O.store.set('workspace', workspace);

    setCurrentUser(account.id);
    return { ok: true, account: account, workspace: workspace };
  }

  function findByUsername(username) {
    var target = normalizeUsername(username);
    return accounts().filter(function (a) { return a.username === target; })[0] || null;
  }

  function findById(id) {
    return accounts().filter(function (a) { return a.id === id; })[0] || null;
  }

  /**
   * 改一个账号并立刻保存。
   * 注意：accounts() 每次都会从存储里重新解析一份新对象，
   * 所以必须"读出来 → 改 → 把同一份数组写回去"，否则改动会丢。
   */
  function updateAccount(id, mutate) {
    var list = accounts();
    var found = list.filter(function (a) { return a.id === id; })[0];
    if (!found) return null;
    mutate(found);
    saveAccounts(list);
    return found;
  }

  /** 登录 */
  function login(username, password) {
    var account = findByUsername(username);
    if (!account) return { ok: false, message: '账号不存在' };
    if (account.status === '已停用') return { ok: false, message: '这个账号已停用' };
    if (hashPassword(account.salt, password) !== account.passwordHash) {
      return { ok: false, message: '账号或密码不对' };
    }
    updateAccount(account.id, function (a) {
      a.lastLoginAt = new Date().toISOString();
    });
    setCurrentUser(account.id);
    return { ok: true, account: account };
  }

  /** 修改密码 */
  function changePassword(accountId, oldPassword, newPassword) {
    var account = findById(accountId);
    if (!account) return { ok: false, message: '找不到这个账号' };
    if (hashPassword(account.salt, oldPassword) !== account.passwordHash) {
      return { ok: false, message: '原密码不正确' };
    }
    if (!newPassword) return { ok: false, message: '请填写新密码' };
    if (String(newPassword).length < MIN_PASSWORD) {
      return { ok: false, message: '新密码至少 ' + MIN_PASSWORD + ' 位' };
    }
    if (String(newPassword).length > 64) return { ok: false, message: '新密码最多 64 位' };

    var updated = updateAccount(accountId, function (a) {
      a.salt = O.sha256.randomSalt();
      a.passwordHash = hashPassword(a.salt, newPassword);
      a.passwordChangedAt = new Date().toISOString();
    });
    return updated ? { ok: true, message: '密码已修改' } : { ok: false, message: '保存失败，请重试' };
  }

  /* ---------------- 登录状态 ---------------- */

  function setCurrentUser(accountId) {
    try {
      if (root.sessionStorage) root.sessionStorage.setItem(SESSION_KEY, accountId);
      else O.store.set('prefs', mergePrefs({ session: accountId }));
    } catch (e) {
      O.store.set('prefs', mergePrefs({ session: accountId }));
    }
  }

  function readSessionId() {
    try {
      if (root.sessionStorage) return root.sessionStorage.getItem(SESSION_KEY);
    } catch (e) { /* ignore */ }
    var prefs = O.store.get('prefs') || {};
    return prefs.session || null;
  }

  function mergePrefs(patch) {
    var prefs = O.store.get('prefs') || {};
    for (var k in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, k)) prefs[k] = patch[k];
    }
    O.store.set('prefs', prefs);
    return prefs;
  }

  function currentUser() {
    var id = readSessionId();
    if (!id) return null;
    return findById(id);
  }

  function clearCurrentUser() {
    try {
      if (root.sessionStorage) root.sessionStorage.removeItem(SESSION_KEY);
    } catch (e) { /* ignore */ }
    var prefs = O.store.get('prefs') || {};
    delete prefs.session;
    O.store.set('prefs', prefs);
  }

  function workspace() {
    return O.store.get('workspace') || null;
  }

  O.auth = {
    MIN_PASSWORD: MIN_PASSWORD,
    ROLES: ROLES,
    accounts: accounts,
    hasAccounts: hasAccounts,
    findByUsername: findByUsername,
    validate: validate,
    createWorkspace: createWorkspace,
    login: login,
    changePassword: changePassword,
    currentUser: currentUser,
    setCurrentUser: setCurrentUser,
    clearCurrentUser: clearCurrentUser,
    workspace: workspace
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
