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
   * 年假台账的初始流水。
   *
   * 从基线台账（leaveBalances）动态生成，而不是写死一份文件 ——
   * 这样台账改了，流水跟着改，两边永远不会对不上。
   *
   * 初始余额 = 应得 + 上年结转，这是**年假额度**。
   *
   * 为什么不含已用、已预约：流水账记的是「HR 维护的额度变动」，
   * 它不会随员工休假自动变化 —— 休假记录在基线台账的 used/booked 里。
   * 员工端的「可用」= 额度 − 已用 − 已预约，两个口径在页面上分开说明。
   */
  function buildLedger(balances) {
    var entries = [];
    (balances || []).forEach(function (b) {
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
