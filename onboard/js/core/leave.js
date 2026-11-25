/**
 * 初见 Onboard · 年假台账核心逻辑
 *
 * 设计要点：
 *  1. 余额不是存下来的数字，而是**所有流水之和**。
 *     任何一次调整、任何一次导入对账，都会留下一条流水；
 *     流水只能追加，不能修改、不能删除 —— 历史变动始终保留。
 *  2. 初始余额来自基线台账（leaveBalances），首次使用时落成一条「初始建账」流水，
 *     这样从第一天起余额就有据可查，而不是凭空出现。
 *  3. 员工端年假页（js/pages/leave.js）读的仍是基线台账；
 *     本模块维护的是 HR 侧的账，两者通过「初始建账」流水对齐。
 *  4. 所有写入都要过权限校验（manage.hr），并记录操作人。
 */
(function (root) {
  var O = root.Onboard;

  /** 流水类型 */
  var TYPES = {
    init: { label: '初始建账', tone: 'muted' },
    adjust: { label: '调整', tone: 'info' },
    reconcile: { label: '对账调整', tone: 'warn' }
  };

  /** 余额上限：超过这个数多半是输入错误 */
  var MAX_BALANCE_DAYS = 366;

  function esc(s) { return O.dom.escapeHtml(s); }

  /* ---------------------------------------------------------
   * 读取
   * ------------------------------------------------------- */

  function ledger() {
    return O.store.get('leaveLedger') || [];
  }

  function saveLedger(list) {
    O.store.set('leaveLedger', list);
  }

  /** 某员工某年度的全部流水，按时间倒序（新的在前） */
  function entriesOf(employeeId, year) {
    return ledger().filter(function (e) {
      return e.employeeId === employeeId && Number(e.year) === Number(year);
    }).sort(function (a, b) {
      var d = String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      return d !== 0 ? d : String(b.id || '').localeCompare(String(a.id || ''));
    });
  }

  /** 某员工某年度的余额 = 所有流水之和 */
  function balanceOf(employeeId, year) {
    return entriesOf(employeeId, year).reduce(function (sum, e) {
      return sum + (Number(e.delta) || 0);
    }, 0);
  }

  /** 有台账记录的年度，倒序 */
  function yearsOf(employeeId) {
    var seen = {};
    var years = [];
    ledger().forEach(function (e) {
      if (e.employeeId !== employeeId) return;
      var y = Number(e.year);
      if (!y || seen[y]) return;
      seen[y] = true;
      years.push(y);
    });
    return years.sort(function (a, b) { return b - a; });
  }

  /** 该员工是否有任何年度的流水 */
  function hasLedger(employeeId) {
    return ledger().some(function (e) { return e.employeeId === employeeId; });
  }

  /**
   * 列出全部「员工 × 年度」台账行。
   * 员工来自名册（有账号的才列出来 —— 账号才是 HR 维护的对象），
   * 年度来自该员工的流水。
   */
  function rows() {
    var employees = O.staff.employees();
    var list = [];

    employees.forEach(function (emp) {
      var account = O.staff.accountOf(emp);
      if (!account) return;           // 还没有登录账号，不进入 HR 台账
      if (emp.status === '已离职') return;

      var years = yearsOf(emp.id);
      if (!years.length) {
        // 没有流水的员工：仍列出来，余额显示为 0，方便 HR 知道还可以给谁建账
        list.push(makeRow(emp, account, currentYear()));
        return;
      }
      years.forEach(function (y) {
        list.push(makeRow(emp, account, y));
      });
    });

    list.sort(function (a, b) {
      var byName = String(a.employee.name || '').localeCompare(
        String(b.employee.name || ''), 'zh-Hans-CN');
      if (byName !== 0) return byName;
      return b.year - a.year;
    });
    return list;
  }

  function makeRow(employee, account, year) {
    var entries = entriesOf(employee.id, year);
    var balance = entries.reduce(function (s, e) { return s + (Number(e.delta) || 0); }, 0);
    var last = entries[0] || null;
    return {
      employee: employee,
      account: account,
      year: year,
      balance: balance,
      entryCount: entries.length,
      lastAt: last ? (last.createdAt || '') : '',
      lastReason: last ? (last.reason || '') : '',
      entries: entries
    };
  }

  function currentYear() {
    return new Date().getFullYear();
  }

  /* ---------------------------------------------------------
   * 初始建账
   * ------------------------------------------------------- */

  /**
   * 为还没有任何流水的员工建立初始账。
   * 初始余额来自基线台账 leaveBalances（entitled + carriedOver），
   * 已休、已预约的天数不进初始余额 —— 那是「用掉了多少」，不是「有多少额度」。
   */
  function ensureInitial(employeeId, year, actor) {
    if (hasLedger(employeeId)) return null;

    var base = (O.store.get('leaveBalances') || []).filter(function (b) {
      return b.employeeId === employeeId && Number(b.year) === Number(year);
    })[0];

    var entitled = base ? (Number(base.entitled) || 0) : 0;
    var carried = base ? (Number(base.carriedOver) || 0) : 0;
    var total = entitled + carried;

    var entry = {
      id: O.format.createId('LVL'),
      employeeId: employeeId,
      year: Number(year),
      type: 'init',
      delta: total,
      reason: base
        ? ('初始建账：' + year + ' 年度应得 ' + entitled + ' 天' +
          (carried ? '，含上年结转 ' + carried + ' 天' : ''))
        : ('初始建账：' + year + ' 年度暂记 0 天，等待 HR 调整'),
      operator: actor ? (actor.name || '') : '系统',
      operatorId: actor ? (actor.id || '') : '',
      createdAt: new Date().toISOString()
    };

    var list = ledger();
    list.push(entry);
    saveLedger(list);
    return entry;
  }

  /* ---------------------------------------------------------
   * 调整
   * ------------------------------------------------------- */

  /**
   * 校验调整输入。
   * 返回 { ok, message, value } —— message 一律是中文，可直接显示给 HR。
   */
  function validateAdjustment(input) {
    var employeeId = String((input && input.employeeId) || '').trim();
    var year = Number(input && input.year);
    var direction = String((input && input.direction) || '').trim();
    var daysRaw = input && input.days;
    var reason = String((input && input.reason) || '').trim();

    if (!employeeId) {
      return { ok: false, field: 'employeeId', message: '请选择要调整的员工' };
    }
    var employee = O.staff.employees().filter(function (e) {
      return e.id === employeeId;
    })[0];
    if (!employee) {
      return { ok: false, field: 'employeeId', message: '找不到这位员工，可能已从名册中删除' };
    }

    if (!year || year < 2000 || year > 2100 || !/^\d{4}$/.test(String(year))) {
      return { ok: false, field: 'year', message: '年度必须是 2000 到 2100 之间的四位年份' };
    }

    if (direction !== 'add' && direction !== 'sub') {
      return { ok: false, field: 'direction', message: '请选择增加或减少' };
    }

    // 天数：只接受正整数。字母、空值、小数、负数都要给中文提示。
    var text = daysRaw === null || daysRaw === undefined ? '' : String(daysRaw).trim();
    if (text === '') {
      return { ok: false, field: 'days', message: '请填写调整的天数' };
    }
    if (!/^\d+$/.test(text)) {
      if (/^-?\d+(\.\d+)?$/.test(text)) {
        return { ok: false, field: 'days', message: '天数必须是整数，不能是小数或负数' };
      }
      return { ok: false, field: 'days', message: '天数只能填写数字，请勿输入字母或其它字符' };
    }
    var days = Number(text);
    if (days <= 0) {
      return { ok: false, field: 'days', message: '天数必须大于 0，减少请直接选「减少」' };
    }
    if (days > MAX_BALANCE_DAYS) {
      return { ok: false, field: 'days', message: '一次最多调整 ' + MAX_BALANCE_DAYS + ' 天，请核对是否填错' };
    }

    if (!reason) {
      return { ok: false, field: 'reason', message: '请填写调整原因，这是必填项' };
    }
    if (reason.length > 200) {
      return { ok: false, field: 'reason', message: '调整原因不能超过 200 个字' };
    }

    var delta = direction === 'add' ? days : -days;

    // 余额不能因为「减少」而变成负数
    var current = balanceOf(employeeId, year);
    if (current + delta < 0) {
      return {
        ok: false,
        field: 'days',
        message: '调整后余额会变成 ' + (current + delta) + ' 天。当前余额为 ' + current +
          ' 天，本次减少 ' + days + ' 天会扣成负数，请核对天数'
      };
    }

    return {
      ok: true,
      value: {
        employeeId: employeeId,
        year: year,
        delta: delta,
        direction: direction,
        days: days,
        reason: reason,
        employee: employee
      }
    };
  }

  /** 执行调整：写一条流水，返回结果 */
  function adjust(input, actor) {
    if (!canManage(actor)) {
      return { ok: false, message: '你的角色没有管理年假的权限' };
    }
    var check = validateAdjustment(input);
    if (!check.ok) return check;

    var v = check.value;
    var list = ledger();
    var entry = {
      id: O.format.createId('LVL'),
      employeeId: v.employeeId,
      year: v.year,
      type: 'adjust',
      delta: v.delta,
      reason: v.reason,
      operator: actor ? (actor.name || '') : '系统',
      operatorId: actor ? (actor.id || '') : '',
      createdAt: new Date().toISOString()
    };
    list.push(entry);
    saveLedger(list);

    return {
      ok: true,
      entry: entry,
      balance: balanceOf(v.employeeId, v.year),
      message: (v.delta > 0 ? '已增加 ' : '已减少 ') + v.days + ' 天'
    };
  }

  /* ---------------------------------------------------------
   * 导入余额
   * ------------------------------------------------------- */

  /** 导入模板的列 */
  var IMPORT_COLUMNS = ['员工编号', '姓名', '年度', '年假天数'];

  /** 下载模板 */
  function templateRows() {
    var rowsData = [IMPORT_COLUMNS];
    var base = (O.store.get('leaveBalances') || [])[0];
    rowsData.push([
      base ? base.employeeId : 'E1001',
      '张小雨',
      base ? base.year : currentYear(),
      base ? (Number(base.entitled) || 0) + (Number(base.carriedOver) || 0) : 15
    ]);
    rowsData.push(['E1002', '李文博', currentYear(), 18]);
    rowsData.push(['E1003', '王思远', currentYear(), 20]);
    return rowsData;
  }

  /**
   * 校验导入的一行。
   * 重点：与现有余额不一致时**不覆盖**，而是生成一条「对账调整」流水。
   */
  function validateImportRow(row) {
    var employeeId = String(row.employeeId || '').trim();
    var name = String(row.name || '').trim();
    var yearText = String(row.year || '').trim();
    var daysText = String(row.days === null || row.days === undefined ? '' : row.days).trim();

    if (!employeeId) {
      return { ok: false, reason: '员工编号为空' };
    }
    var employee = O.staff.employees().filter(function (e) {
      return String(e.id).toLowerCase() === employeeId.toLowerCase();
    })[0];
    if (!employee) {
      return { ok: false, reason: '员工编号 ' + employeeId + ' 在名册中不存在' };
    }
    if (name && name !== employee.name) {
      return {
        ok: false,
        reason: '姓名与名册不一致：名册里是「' + employee.name + '」，表格里是「' + name + '」'
      };
    }

    if (!yearText) {
      return { ok: false, reason: '年度为空' };
    }
    if (!/^\d{4}$/.test(yearText)) {
      return { ok: false, reason: '年度「' + yearText + '」不是四位年份，请填 2026 这样的数字' };
    }
    var year = Number(yearText);
    if (year < 2000 || year > 2100) {
      return { ok: false, reason: '年度「' + yearText + '」超出 2000 至 2100 的范围' };
    }

    // 天数：非负整数。负数、字母、空值、小数都要明确提示。
    if (daysText === '') {
      return { ok: false, reason: '年假天数为空' };
    }
    if (!/^\d+$/.test(daysText)) {
      if (/^-?\d+(\.\d+)?$/.test(daysText)) {
        return { ok: false, reason: '年假天数「' + daysText + '」不是整数' };
      }
      return { ok: false, reason: '年假天数「' + daysText + '」不是数字，请只填数字' };
    }
    var days = Number(daysText);
    if (days > MAX_BALANCE_DAYS) {
      return { ok: false, reason: '年假天数「' + daysText + '」超过 ' + MAX_BALANCE_DAYS + ' 天，请核对' };
    }

    var current = balanceOf(employee.id, year);
    var diff = days - current;

    return {
      ok: true,
      employee: employee,
      employeeId: employee.id,
      year: year,
      current: current,
      incoming: days,
      diff: diff,
      // 不一致 → 对账调整；一致 → 无需变动
      action: diff === 0 ? 'none' : 'reconcile',
      reason: diff === 0
        ? '导入余额与现有余额一致，无需调整'
        : ('导入对账：账面 ' + current + ' 天，导入 ' + days + ' 天，差额 ' +
          (diff > 0 ? '+' : '') + diff + ' 天')
    };
  }

  /**
   * 校验整批导入行。
   * 返回 { entries, valid, invalid, fatal }
   */
  function validateImportRows(rows) {
    if (!rows || !rows.length) {
      return { fatal: '模板里没有数据行（第一行是表头，不算数据）' };
    }
    if (rows.length > 500) {
      return { fatal: '一次最多导入 500 行，当前 ' + rows.length + ' 行，请拆分文件' };
    }

    var seen = {};
    var entries = rows.map(function (r, i) {
      var result = validateImportRow(r);
      result.lineNo = i + 2;
      if (!result.ok) return result;

      var key = result.employeeId + '#' + result.year;
      if (seen[key]) {
        return {
          ok: false,
          lineNo: result.lineNo,
          reason: '与第 ' + seen[key] + ' 行是同一位员工的同一年度，请合并成一行'
        };
      }
      seen[key] = result.lineNo;
      return result;
    });

    return {
      entries: entries,
      valid: entries.filter(function (e) { return e.ok; }),
      invalid: entries.filter(function (e) { return !e.ok; })
    };
  }

  /**
   * 确认导入：只对有差额的行生成「对账调整」流水。
   * 一致的行不动（不产生流水），差额行产生一条，历史全部保留。
   */
  function applyImport(entries, actor) {
    if (!canManage(actor)) {
      return { ok: false, message: '你的角色没有管理年假的权限' };
    }
    var usable = (entries || []).filter(function (e) {
      return e && e.ok && e.action === 'reconcile';
    });
    if (!usable.length) {
      return { ok: false, message: '没有需要调整的余额（导入值与账面余额都一致）' };
    }

    var list = ledger();
    var now = new Date().toISOString();
    var created = [];

    usable.forEach(function (e) {
      var entry = {
        id: O.format.createId('LVL'),
        employeeId: e.employeeId,
        year: e.year,
        type: 'reconcile',
        delta: e.diff,
        reason: e.reason,
        operator: actor ? (actor.name || '') : '系统',
        operatorId: actor ? (actor.id || '') : '',
        createdAt: now
      };
      list.push(entry);
      created.push(entry);
    });

    saveLedger(list);
    return { ok: true, created: created, count: created.length };
  }

  /* ---------------------------------------------------------
   * 权限
   * ------------------------------------------------------- */

  function canManage(actor) {
    return O.permissions.can(actor, 'manage.leave');
  }

  O.leave = {
    TYPES: TYPES,
    MAX_BALANCE_DAYS: MAX_BALANCE_DAYS,
    IMPORT_COLUMNS: IMPORT_COLUMNS,
    ledger: ledger,
    entriesOf: entriesOf,
    balanceOf: balanceOf,
    yearsOf: yearsOf,
    hasLedger: hasLedger,
    rows: rows,
    currentYear: currentYear,
    ensureInitial: ensureInitial,
    validateAdjustment: validateAdjustment,
    adjust: adjust,
    templateRows: templateRows,
    validateImportRow: validateImportRow,
    validateImportRows: validateImportRows,
    applyImport: applyImport,
    canManage: canManage,
    esc: esc
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
