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
    return {
      policies: clone(d.policies),
      employees: clone(d.employees),
      // 部门以名册里的部门为准；这里只存「管理员手动新增」的部门
      departments: [],
      leaveBalances: clone(d.leaveBalances),
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

  O.seed = {
    build: build,
    policyMap: policyMap,
    employeeMap: employeeMap,
    meta: function () { return (data().meta) || {}; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
