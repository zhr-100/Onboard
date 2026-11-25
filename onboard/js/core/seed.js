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
   * 初始余额 = 应得 + 上年结转（可休的额度）。
   * 已休、已预约的天数是「已经用掉的」，不是「有多少额度」，不进初始余额。
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
          (carried ? '，含上年结转 ' + carried + ' 天' : ''),
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
