/**
 * 初见 Onboard · 示例数据播种
 *
 * 数据基线只读地放在 data/*.js 里（永远不修改），
 * HR 后台改动只写进浏览器本地存储，这样示例数据随时可以一键恢复。
 */
(function (root) {
  var O = root.Onboard;

  function data() {
    return root.OnboardData || {};
  }

  function clone(list) {
    return O.util && O.util.deepCopy ? O.util.deepCopy(list || []) : JSON.parse(JSON.stringify(list || []));
  }

  function build() {
    var d = data();
    var balances = clone(d.leaveBalances);
    return {
      policies: clone(d.policies),
      employees: clone(d.employees),
      // 部门以名册里的部门为准；这里只存「管理员手动新增」的部门
      departments: [],
      leaveBalances: balances,
      leaveRecords: clone(d.leaveRecords),
      // 年假台账流水：初始建账由基线台账生成，余额 = 所有流水之和
      leaveLedger: buildLedger(balances),
      tickets: clone(d.tickets),
      onboardingTasks: clone(d.onboardingTasks),
      onboardingTemplates: clone(d.onboardingTemplates),
      questionLogs: [],
      chatSessions: [],
      accounts: [],
      workspace: null
    };
  }

  /** 制度按 id 索引 */
  function policyMap() {
    var map = {};
    (O.store.get('policies') || []).forEach(function (p) { map[p.id] = p; });
    return map;
  }

  function employeeMap() {
    var map = {};
    (O.store.get('employees') || []).forEach(function (e) { map[e.id] = e; });
    return map;
  }

  /**
   * 年假台账的示例流水。
   *
   * 优先用 data/leave.js 里的 leaveLedgerSamples（每人 2-4 条、余额各不相同、
   * 含 0.5 天的半天余额）；没有计划的员工退回基线台账派生的单条初始建账。
   *
   * 流水 id 以 LVL-S- 开头、原因以「示例：」开头 ——
   * 重新生成示例数据时靠这个标记整体替换，
   * 而 HR 自己做的调整（adjust）和导入对账（reconcile）流水一律保留。
   */
  function buildLedger(balances, samples) {
    var plan = samples || (data().leaveLedgerSamples) || [];
    var entries = [];

    // 有示例计划的员工：按计划生成完整流水序列
    var planned = {};
    plan.forEach(function (p) {
      planned[p.employeeId + '|' + p.year] = p;
      (p.flows || []).forEach(function (f, i) {
        entries.push({
          id: 'LVL-S-' + p.employeeId + '-' + p.year + '-' + (i + 1),
          employeeId: p.employeeId,
          year: Number(p.year),
          type: i === 0 ? 'init' : 'adjust',
          delta: Number(f.delta) || 0,
          reason: f.reason,
          operator: '系统初始化',
          operatorId: '',
          createdAt: f.at
        });
      });
    });

    // 其余有基线台账的员工：生成单条初始建账
    (balances || []).forEach(function (b) {
      if (planned[b.employeeId + '|' + b.year]) return;
      var entitled = Number(b.entitled) || 0;
      var carried = Number(b.carriedOver) || 0;
      var total = entitled + carried;
      entries.push({
        id: 'LVL-INIT-' + b.employeeId + '-' + b.year,
        employeeId: b.employeeId,
        year: Number(b.year),
        type: 'init',
        delta: total,
        reason: '初始建账：' + b.year + ' 年度应得 ' + entitled + ' 天' +
          (carried ? '，含上年结转 ' + carried + ' 天' : '') +
          '，年假额度 ' + total + ' 天',
        operator: '系统初始化',
        operatorId: '',
        createdAt: (b.updatedAt || '2026-06-18') + 'T09:00:00.000Z'
      });
    });

    return entries;
  }

  O.seed = {
    build: build,
    policyMap: policyMap,
    employeeMap: employeeMap,
    buildLedger: buildLedger,
    meta: function () { return (data().meta) || {}; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
