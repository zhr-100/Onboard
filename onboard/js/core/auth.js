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
  var SESSION_KEY = 'onboard.v1.session';
  var WORKSPACE_KEY = 'onboard.v1.workspace';
  /** 示例账号统一使用的演示密码（仅用于本地演示数据） */
  var SAMPLE_PASSWORD = 'onboard123';
  /** 登录失败时统一使用这句，不区分"账号不存在"和"密码不对" */
  var LOGIN_FAILED = '账号或密码不正确，请重新输入';
  /** 账号被停用时的提示 */
  var ACCOUNT_DISABLED = '该账号已停用，请联系系统管理员';

  /**
   * 示例账号清单：员工编号即登录名，密码统一。
   * 覆盖四种角色，方便直接演示权限差异。
   */
  var SAMPLE_ACCOUNTS = [
    { employeeId: 'E1001', role: '员工' },
    { employeeId: 'E1002', role: '员工' },
    { employeeId: 'E1003', role: '员工' },
    { employeeId: 'E1006', role: 'HR管理员' },
    { employeeId: 'E1008', role: '产品运营' }
  ];

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
      employeeId: null,
      dept: dept,
      role: '系统管理员',
      enabled: true,
      status: '正常',
      salt: salt,
      passwordHash: hashPassword(salt, input.password),
      isOwner: true,
      isSample: false,
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

    // 示例员工账号属于示例数据的一部分，和示例制度、示例工单一样，创建时一并生成
    provisionSampleAccounts();

    setCurrentUser(account.id);
    return { ok: true, account: account, workspace: workspace };
  }

  /**
   * 为示例员工开通账号（仅演示数据）。
   * 覆盖四种角色，员工编号即登录名，密码统一，便于演示时快速切换身份。
   */
  function provisionSampleAccounts() {
    var employees = O.store.get('employees') || [];
    var list = accounts();
    var salt = O.sha256.randomSalt();
    var hash = hashPassword(salt, SAMPLE_PASSWORD);
    var created = [];

    SAMPLE_ACCOUNTS.forEach(function (spec) {
      var e = employees.filter(function (x) { return x.id === spec.employeeId; })[0];
      if (!e) return;
      if (list.some(function (a) { return a.username === normalizeUsername(e.id); })) return;
      var acc = {
        id: O.format.createId('U'),
        name: e.name,
        username: normalizeUsername(e.id),
        employeeId: e.id,
        dept: e.dept,
        role: spec.role,
        enabled: true,
        status: '正常',
        salt: salt,
        passwordHash: hash,
        isOwner: false,
        isSample: true,
        createdAt: new Date().toISOString(),
        lastLoginAt: null
      };
      list.push(acc);
      created.push(acc);
    });

    if (created.length) saveAccounts(list);
    return created;
  }

  /**
   * 老数据迁移：
   *  - 早期版本的角色叫「管理员」，现在统一叫「系统管理员」
   *  - 补上「是否启用」字段
   * 迁移后老账号不会被锁在门外。
   */
  function migrate() {
    var list = accounts();
    var changed = false;

    list.forEach(function (a) {
      if (a.role === '管理员') {
        a.role = '系统管理员';
        changed = true;
      }
      if (a.enabled === undefined) {
        a.enabled = a.status !== '已停用';
        changed = true;
      }
      if (!a.enabled && a.status !== '已停用') {
        a.status = '已停用';
        changed = true;
      }
      if (a.enabled && a.status !== '正常') {
        a.status = '正常';
        changed = true;
      }
    });

    if (changed) saveAccounts(list);
    return changed;
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

  /**
   * 登录
   * scope: 'employee' 员工登录（用员工编号或员工账号）
   *        'admin'    管理后台（用管理账号）
   *
   * 失败时一律返回同一句提示，不告诉对方"账号不存在"还是"密码不对"。
   */
  function login(username, password, scope) {
    var input = normalizeUsername(username);
    var list = accounts();
    var account = null;

    if (scope === 'employee') {
      // 员工入口：属于员工名册的账号（HR、产品运营本身也是员工，也能从这里进）
      account = list.filter(function (a) {
        if (!a.employeeId) return false;
        if (a.username === input) return true;
        return normalizeUsername(a.employeeId) === input;
      })[0] || null;
    } else {
      // 管理入口：管理侧账号（管理员、HR、产品运营），系统管理员没有员工编号
      account = list.filter(function (a) {
        return a.role !== '员工' && a.username === input;
      })[0] || null;
    }

    // 账号不存在 / 密码不对：统一提示，不告诉对方是哪边错了
    if (!account || hashPassword(account.salt, password) !== account.passwordHash) {
      return { ok: false, message: LOGIN_FAILED };
    }

    // 密码对了，但账号被停用：明确告知
    if (account.enabled === false) {
      return { ok: false, message: ACCOUNT_DISABLED };
    }

    updateAccount(account.id, function (a) {
      a.lastLoginAt = new Date().toISOString();
    });
    setCurrentUser(account.id);
    return { ok: true, account: account };
  }

  /** 账号是否启用 */
  function isEnabled(accountId) {
    var a = findById(accountId);
    return !!a && a.enabled !== false;
  }

  /** 启用 / 停用账号 */
  function setEnabled(accountId, enabled) {
    return updateAccount(accountId, function (a) {
      a.enabled = !!enabled;
      a.status = enabled ? '正常' : '已停用';
      a.updatedAt = new Date().toISOString();
    });
  }

  /** 修改账号的角色 */
  function setRole(accountId, role) {
    if ((O.permissions ? O.permissions.ROLES : []).indexOf(role) < 0) {
      return { ok: false, message: '角色不存在' };
    }
    var updated = updateAccount(accountId, function (a) {
      a.role = role;
      a.updatedAt = new Date().toISOString();
    });
    return updated ? { ok: true, account: updated } : { ok: false, message: '找不到这个账号' };
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
    SAMPLE_PASSWORD: SAMPLE_PASSWORD,
    LOGIN_FAILED: LOGIN_FAILED,
    ACCOUNT_DISABLED: ACCOUNT_DISABLED,
    accounts: accounts,
    hasAccounts: hasAccounts,
    findByUsername: findByUsername,
    findById: findById,
    validate: validate,
    createWorkspace: createWorkspace,
    provisionSampleAccounts: provisionSampleAccounts,
    migrate: migrate,
    login: login,
    changePassword: changePassword,
    isEnabled: isEnabled,
    setEnabled: setEnabled,
    setRole: setRole,
    currentUser: currentUser,
    setCurrentUser: setCurrentUser,
    clearCurrentUser: clearCurrentUser,
    workspace: workspace,
    /** 是不是员工身份（决定能进哪些区域） */
    isEmployee: function (user) { return !!user && user.role === '员工'; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
