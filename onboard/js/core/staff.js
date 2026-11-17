/**
 * 初见 Onboard · 员工管理（核心逻辑）
 *
 * 员工名册存在 store.employees 里，登录账号存在 store.accounts 里，
 * 两者通过「员工编号」关联（账号的 employeeId / username 就是员工的编号）。
 *
 * 权限规则和页面无关，写在这里，调用时一定会核对：
 *  - 有 manage.hr 权限（HR管理员、系统管理员）才能增改员工；
 *  - HR管理员只能新增「员工」角色；
 *  - 只有系统管理员能新增 HR管理员、产品运营、系统管理员。
 */
(function (root) {
  var O = root.Onboard;

  /** 预置的五个示例部门 */
  var PRESET_DEPARTMENTS = ['产品部', '技术部', '销售部', '财务部', '人力资源部'];

  /** 新员工头像从这些颜色里按姓名稳定取色 */
  var AVATAR_COLORS = [
    '#2F6BFF', '#00A870', '#7A5AF8', '#E8833A', '#0EA5A5',
    '#E5484D', '#3B82F6', '#F2A900', '#8B5CF6', '#10B981', '#6366F1'
  ];

  function employees() {
    return O.store.get('employees') || [];
  }

  function saveEmployees(list) {
    O.store.set('employees', list);
  }

  function findEmployee(id) {
    return employees().filter(function (e) { return e.id === id; })[0] || null;
  }

  /** 这个员工对应的登录账号（没有就是 null） */
  function accountOf(employee) {
    if (!employee || !employee.id) return null;
    var code = String(employee.id).toLowerCase();
    return O.auth.accounts().filter(function (a) {
      if (a.employeeId && String(a.employeeId).toLowerCase() === code) return true;
      return a.username === code;
    })[0] || null;
  }

  /** 部门候选：预置五个 + 名册里已经出现过的部门，去重后返回 */
  function departments() {
    var seen = {};
    var out = [];
    PRESET_DEPARTMENTS.concat(employees().map(function (e) { return e.dept; }))
      .forEach(function (d) {
        d = String(d || '').trim();
        if (!d || seen[d]) return;
        seen[d] = true;
        out.push(d);
      });
    return out;
  }

  /** 这个人有没有管理员工的权限 */
  function canManage(actor) {
    return O.permissions.can(actor, 'manage.hr');
  }

  /**
   * 这个人能给新员工分配哪些角色：
   * 系统管理员可以分配全部四种；HR管理员只能分配「员工」。
   */
  function assignableRoles(actor) {
    if (!actor || actor.enabled === false) return [];
    if (actor.role === '系统管理员') return O.permissions.ROLES.slice();
    if (actor.role === 'HR管理员') return ['员工'];
    return [];
  }

  function pickColor(name) {
    var sum = 0;
    var text = String(name || '');
    for (var i = 0; i < text.length; i++) sum += text.charCodeAt(i);
    return AVATAR_COLORS[sum % AVATAR_COLORS.length];
  }

  /** 编号有没有和名册或账号撞上（账号的 username 就是编号的小写形式） */
  function codeTaken(code) {
    var lower = String(code || '').toLowerCase();
    if (employees().some(function (e) { return String(e.id).toLowerCase() === lower; })) return true;
    return O.auth.accounts().some(function (a) {
      if (a.username === lower) return true;
      return a.employeeId && String(a.employeeId).toLowerCase() === lower;
    });
  }

  /* ---------------------------------------------------------
   * 新增员工
   * ------------------------------------------------------- */

  function validateNew(input, actor) {
    var name = String(input.name || '').trim();
    var code = String(input.employeeId || '').trim();
    var dept = String(input.dept || '').trim();
    var password = String(input.password || '');

    if (!canManage(actor)) {
      return { ok: false, message: '你的角色没有管理员工的权限' };
    }
    if (!name) return { ok: false, field: 'name', message: '请填写姓名' };
    if (name.length > 20) return { ok: false, field: 'name', message: '姓名不能超过 20 个字' };
    if (!code) return { ok: false, field: 'employeeId', message: '请填写员工编号' };
    if (!/^[A-Za-z0-9-]{2,20}$/.test(code)) {
      return { ok: false, field: 'employeeId', message: '员工编号须为 2-20 位字母或数字（可含减号）' };
    }
    if (codeTaken(code)) {
      return { ok: false, field: 'employeeId', message: '这个员工编号已存在' };
    }
    if (!dept) return { ok: false, field: 'dept', message: '请填写部门（可从已有部门里选，也可输入新部门）' };
    if (dept.length > 20) return { ok: false, field: 'dept', message: '部门名不能超过 20 个字' };
    if (assignableRoles(actor).indexOf(input.role) < 0) {
      var tip = actor && actor.role === 'HR管理员'
        ? 'HR管理员只能新增「员工」角色，管理类角色请联系系统管理员创建'
        : '你的角色没有分配「' + input.role + '」的权限';
      return { ok: false, field: 'role', message: tip };
    }
    if (!password) return { ok: false, field: 'password', message: '请填写初始密码' };
    if (password.length < O.auth.MIN_PASSWORD) {
      return { ok: false, field: 'password', message: '初始密码至少 ' + O.auth.MIN_PASSWORD + ' 位' };
    }
    if (password.length > 64) return { ok: false, field: 'password', message: '初始密码最多 64 位' };

    return { ok: true, name: name, code: code, dept: dept, password: password, role: input.role };
  }

  /**
   * 新增员工：一次创建名册记录 + 登录账号。
   * 员工编号同时是登录账号，创建之后不能再改。
   */
  function createEmployee(input, actor) {
    var check = validateNew(input, actor);
    if (!check.ok) return check;

    var now = new Date().toISOString();

    var employee = {
      id: check.code,
      name: check.name,
      avatarText: check.name.charAt(0),
      avatarColor: pickColor(check.name),
      dept: check.dept,
      title: '',
      email: '',
      phone: '',
      joinDate: now.slice(0, 10),
      employmentType: '正式员工',
      manager: '',
      status: '在职',
      onboardingPlanId: null,
      policyAcks: [],
      isSample: false,
      createdAt: now
    };
    var roster = employees();
    roster.push(employee);
    saveEmployees(roster);

    var salt = O.sha256.randomSalt();
    var account = {
      id: O.format.createId('U'),
      name: check.name,
      username: check.code.toLowerCase(),
      employeeId: check.code,
      dept: check.dept,
      role: check.role,
      enabled: true,
      status: '正常',
      salt: salt,
      passwordHash: O.auth.hashPassword(salt, check.password),
      isOwner: false,
      isSample: false,
      createdAt: now,
      lastLoginAt: null
    };
    var list = O.auth.accounts();
    list.push(account);
    O.store.set('accounts', list);

    return { ok: true, employee: employee, account: account };
  }

  /* ---------------------------------------------------------
   * 编辑员工（姓名、部门、启用/停用、重置密码）
   * ------------------------------------------------------- */

  /**
   * patch: { name, dept, enabled, newPassword }
   *  - enabled 只对有登录账号的员工生效
   *  - newPassword 留空表示不改
   * 员工编号不在可改之列 —— 它同时是登录账号，建好后不能动。
   */
  function updateEmployee(id, patch, actor) {
    if (!canManage(actor)) return { ok: false, message: '你的角色没有管理员工的权限' };
    var employee = findEmployee(id);
    if (!employee) return { ok: false, message: '找不到这个员工' };

    var name = String(patch.name || '').trim();
    var dept = String(patch.dept || '').trim();
    if (!name) return { ok: false, field: 'name', message: '请填写姓名' };
    if (name.length > 20) return { ok: false, field: 'name', message: '姓名不能超过 20 个字' };
    if (!dept) return { ok: false, field: 'dept', message: '请填写部门' };
    if (dept.length > 20) return { ok: false, field: 'dept', message: '部门名不能超过 20 个字' };

    var password = String(patch.newPassword || '');
    if (password) {
      if (password.length < O.auth.MIN_PASSWORD) {
        return { ok: false, field: 'password', message: '新密码至少 ' + O.auth.MIN_PASSWORD + ' 位' };
      }
      if (password.length > 64) return { ok: false, field: 'password', message: '新密码最多 64 位' };
    }

    var account = accountOf(employee);
    if (patch.enabled !== undefined && patch.enabled !== null && !account) {
      return { ok: false, message: '这位员工还没有登录账号，不存在启用/停用' };
    }
    if (account && patch.enabled === false) {
      if (actor && account.id === actor.id) {
        return { ok: false, message: '不能停用你自己的账号' };
      }
      if (account.role === '系统管理员' && !hasOtherEnabledAdmin(account.id)) {
        return { ok: false, message: '不能停用最后一个已启用的系统管理员' };
      }
    }

    var now = new Date().toISOString();

    var roster = employees();
    var target = roster.filter(function (e) { return e.id === id; })[0];
    target.name = name;
    target.dept = dept;
    target.avatarText = name.charAt(0);
    target.updatedAt = now;
    saveEmployees(roster);

    if (account) {
      var list = O.auth.accounts();
      var acc = list.filter(function (a) { return a.id === account.id; })[0];
      acc.name = name;
      acc.dept = dept;
      if (patch.enabled !== undefined && patch.enabled !== null) {
        acc.enabled = !!patch.enabled;
        acc.status = patch.enabled ? '正常' : '已停用';
      }
      if (password) {
        acc.salt = O.sha256.randomSalt();
        acc.passwordHash = O.auth.hashPassword(acc.salt, password);
        acc.passwordResetAt = now;
      }
      acc.updatedAt = now;
      O.store.set('accounts', list);
    }

    return { ok: true, passwordReset: !!password };
  }

  /** 除了这个账号之外，还有没有别的已启用系统管理员 */
  function hasOtherEnabledAdmin(accountId) {
    return O.auth.accounts().some(function (a) {
      return a.role === '系统管理员' && a.enabled !== false && a.id !== accountId;
    });
  }

  /* ---------------------------------------------------------
   * 批量导入
   * ------------------------------------------------------- */

  /** 批量导入时，初始密码留空的行统一用这个默认值（与示例账号一致，仅本地演示用） */
  var DEFAULT_IMPORT_PASSWORD = 'onboard123';

  /**
   * 校验批量导入的行（只校验，不写入）。
   * rows: [{ lineNo, name, employeeId, dept, role, password }]（原始字符串，lineNo 是文件里的行号）
   * 返回 [{ lineNo, name, code, dept, role, password, useDefaultPassword, ok, reason }]
   */
  function validateImportRows(rows, actor) {
    if (!canManage(actor)) {
      return { fatal: '你的角色没有管理员工的权限' };
    }

    var seenCodes = {};

    return (rows || []).map(function (r) {
      var reasons = [];
      var name = String(r.name || '').trim();
      var code = String(r.employeeId || '').trim();
      var dept = String(r.dept || '').trim();
      var role = String(r.role || '').trim();
      var password = String(r.password || '');

      if (!name) reasons.push('姓名为空');
      else if (name.length > 20) reasons.push('姓名超过 20 个字');

      if (!code) reasons.push('员工编号为空');
      else if (!/^[A-Za-z0-9-]{2,20}$/.test(code)) reasons.push('员工编号须为 2-20 位字母或数字');
      else if (codeTaken(code)) reasons.push('员工编号已存在');
      else {
        var key = code.toLowerCase();
        if (seenCodes[key]) reasons.push('员工编号与第 ' + seenCodes[key] + ' 行重复');
        else seenCodes[key] = r.lineNo;
      }

      if (!dept) reasons.push('部门为空');
      else if (dept.length > 20) reasons.push('部门名超过 20 个字');

      if (!role) reasons.push('角色为空');
      else if (O.permissions.ROLES.indexOf(role) < 0) {
        reasons.push('角色不合法（应为：' + O.permissions.ROLES.join('、') + '）');
      } else if (assignableRoles(actor).indexOf(role) < 0) {
        reasons.push(actor.role === 'HR管理员'
          ? 'HR管理员只能导入「员工」角色'
          : '你的角色没有分配「' + role + '」的权限');
      }

      var useDefault = password === '';
      if (!useDefault && password.length < O.auth.MIN_PASSWORD) {
        reasons.push('初始密码不足 ' + O.auth.MIN_PASSWORD + ' 位');
      } else if (!useDefault && password.length > 64) {
        reasons.push('初始密码超过 64 位');
      }

      return {
        lineNo: r.lineNo,
        name: name,
        code: code,
        dept: dept,
        role: role,
        password: useDefault ? DEFAULT_IMPORT_PASSWORD : password,
        useDefaultPassword: useDefault,
        ok: reasons.length === 0,
        reason: reasons.join('；')
      };
    });
  }

  /**
   * 真正写入（确认导入之后才调用）。
   * 只收「预览通过」的行；写入前每行再走一遍 createEmployee 的完整校验 ——
   * 预览和确认之间名册可能被别人改过，不能只信预览时的结果。
   * 返回 { ok, imported, skipped: [{ lineNo, reason }] }
   */
  function importEmployees(entries, actor) {
    if (!canManage(actor)) {
      return { ok: false, message: '你的角色没有管理员工的权限' };
    }

    var imported = 0;
    var skipped = [];

    (entries || []).forEach(function (e) {
      if (!e || !e.ok) {
        skipped.push({ lineNo: e ? e.lineNo : '?', reason: (e && e.reason) || '未通过校验' });
        return;
      }
      var result = createEmployee({
        name: e.name,
        employeeId: e.code,
        dept: e.dept,
        role: e.role,
        password: e.password
      }, actor);
      if (result.ok) imported++;
      else skipped.push({ lineNo: e.lineNo, reason: result.message });
    });

    return { ok: true, imported: imported, skipped: skipped };
  }

  O.staff = {
    PRESET_DEPARTMENTS: PRESET_DEPARTMENTS,
    DEFAULT_IMPORT_PASSWORD: DEFAULT_IMPORT_PASSWORD,
    employees: employees,
    findEmployee: findEmployee,
    accountOf: accountOf,
    departments: departments,
    canManage: canManage,
    assignableRoles: assignableRoles,
    createEmployee: createEmployee,
    updateEmployee: updateEmployee,
    validateImportRows: validateImportRows,
    importEmployees: importEmployees
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
