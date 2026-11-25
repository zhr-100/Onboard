/**
 * 初见 Onboard · 年假台账（流水账）逻辑自检
 *
 * 覆盖需求里最容易出错的几条：
 *  1. 余额 == 所有流水之和；
 *  2. 每次调整生成一条流水，历史流水只增不改不删；
 *  3. 余额不能扣成负数；
 *  4. 字母、空值、小数、负数等异常输入都有中文提示；
 *  5. 导入与现有余额不一致时生成「对账调整」流水，而不是覆盖；
 *  6. 导入值与现有余额一致时不动账。
 *
 * 用法：node tools/check-leave-ledger.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function makeStorage() {
  const data = {};
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _dump: () => data
  };
}

/** 载入网页端脚本，返回一个可用的沙箱 */
function makeSandbox() {
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    localStorage: makeStorage(),
    location: { protocol: 'file:', hash: '' },
    navigator: { userAgent: 'node' }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  const scripts = [
    'data/policies.js',
    'data/employees.js',
    'data/leave.js',
    'data/tickets.js',
    'js/core/namespace.js',
    'js/core/dom.js',
    'js/core/format.js',
    'js/core/sha256.js',
    'js/core/store.js',
    'js/core/seed.js',
    'js/core/permissions.js',
    'js/core/auth.js',
    'js/core/staff.js',
    'js/core/leave.js'
  ];
  scripts.forEach((rel) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel });
  });
  return sandbox;
}

let failures = 0;
function check(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log('  ✓ ' + desc);
  } else {
    console.log('  ✗ ' + desc + '：实际 ' + JSON.stringify(actual) + '，期望 ' + JSON.stringify(expected));
    failures += 1;
  }
}

function checkTrue(desc, value) {
  check(desc, !!value, true);
}

(async function main() {
  console.log('== 年假台账（流水账）逻辑自检 ==\n');

  const sandbox = makeSandbox();
  const O = sandbox.Onboard;
  const seedState = O.seed.build();
  await O.store.init(seedState);
  O.store.applySeed(seedState);

  // 台账只列「有登录账号」的在职员工，这里补上示例账号
  O.auth.provisionSampleAccounts();
  O.store.set('accounts', O.auth.accounts());

  const HR = { id: 'acc-hr', name: '周颖', role: 'HR管理员', employeeId: 'E1006', enabled: true, salt: 's', passwordHash: 'h' };
  const EMP = { id: 'acc-emp', name: '张三', role: '员工', employeeId: 'E1001', enabled: true, salt: 's', passwordHash: 'h' };

  // ---------- 1. 初始建账 ----------
  console.log('-- 初始建账 --');
  const balances = O.store.get('leaveBalances') || [];
  const base = balances.filter((b) => b.employeeId === 'E1001')[0];
  const expectedInit = base.entitled + base.carriedOver;
  check('E1001 初始余额 = 应得 + 结转',
    O.leave.balanceOf('E1001', base.year), expectedInit);
  check('初始流水条数', O.leave.entriesOf('E1001', base.year).length, 1);
  check('初始流水类型', O.leave.entriesOf('E1001', base.year)[0].type, 'init');

  // ---------- 2. 调整生成流水，余额 = Σ流水 ----------
  console.log('\n-- 调整与余额 --');
  const before = O.leave.balanceOf('E1001', base.year);
  const r1 = O.leave.adjust(
    { employeeId: 'E1001', year: base.year, direction: 'add', days: 3, reason: '入职年限跨档补足差额' },
    HR);
  checkTrue('调整成功', r1.ok);
  check('调整后余额 = 原余额 + 3', O.leave.balanceOf('E1001', base.year), before + 3);
  check('流水条数 +1', O.leave.entriesOf('E1001', base.year).length, 2);
  check('流水记录了原因',
    O.leave.entriesOf('E1001', base.year)[0].reason, '入职年限跨档补足差额');
  check('流水记录了操作人',
    O.leave.entriesOf('E1001', base.year)[0].operator, '周颖');

  // 减少
  const r2 = O.leave.adjust(
    { employeeId: 'E1001', year: base.year, direction: 'sub', days: 2, reason: '离职结算冲抵多发部分' },
    HR);
  checkTrue('减少成功', r2.ok);
  check('调整后余额 = 原余额 + 1', O.leave.balanceOf('E1001', base.year), before + 1);

  // 余额永远等于流水之和
  const sum = O.leave.entriesOf('E1001', base.year)
    .reduce((s, e) => s + e.delta, 0);
  check('余额 == Σ流水', O.leave.balanceOf('E1001', base.year), sum);

  // ---------- 3. 负数拦截 ----------
  console.log('\n-- 负数与异常输入 --');
  const neg = O.leave.validateAdjustment(
    { employeeId: 'E1001', year: base.year, direction: 'sub', days: 300, reason: '测试' });
  check('扣成负数被拦截', neg.ok, false);
  checkTrue('负数提示是中文且说明原因', /负数/.test(neg.message));

  const tooMany = O.leave.validateAdjustment(
    { employeeId: 'E1001', year: base.year, direction: 'add', days: 9999, reason: '测试' });
  check('超出单次上限被拦截', tooMany.ok, false);
  checkTrue('超限提示是中文', /最多调整/.test(tooMany.message));

  const letter = O.leave.validateAdjustment(
    { employeeId: 'E1001', year: base.year, direction: 'add', days: 'abc', reason: '测试' });
  check('字母输入被拦截', letter.ok, false);
  checkTrue('字母提示是中文', /只能填写数字|请勿输入字母/.test(letter.message));

  const empty = O.leave.validateAdjustment(
    { employeeId: 'E1001', year: base.year, direction: 'add', days: '', reason: '测试' });
  check('空值被拦截', empty.ok, false);
  checkTrue('空值提示是中文', /请填写调整的天数/.test(empty.message));

  const decimal = O.leave.validateAdjustment(
    { employeeId: 'E1001', year: base.year, direction: 'add', days: '1.5', reason: '测试' });
  check('小数被拦截', decimal.ok, false);
  checkTrue('小数提示是中文', /整数/.test(decimal.message));

  const negativeDays = O.leave.validateAdjustment(
    { employeeId: 'E1001', year: base.year, direction: 'add', days: '-3', reason: '测试' });
  check('负数天数字段被拦截', negativeDays.ok, false);

  const noReason = O.leave.validateAdjustment(
    { employeeId: 'E1001', year: base.year, direction: 'add', days: 3, reason: '   ' });
  check('原因为空被拦截', noReason.ok, false);
  checkTrue('原因必填提示是中文', /原因/.test(noReason.message));

  // ---------- 4. 权限 ----------
  console.log('\n-- 权限 --');
  check('HR 管理员有年假管理权限', O.leave.canManage(HR), true);
  check('普通员工没有年假管理权限', O.leave.canManage(EMP), false);

  const denied = O.leave.adjust(
    { employeeId: 'E1001', year: base.year, direction: 'add', days: 1, reason: '测试' },
    EMP);
  check('普通员工不能调整', denied.ok, false);
  checkTrue('拒绝提示是中文', /权限/.test(denied.message));
  check('被拒绝后余额不变', O.leave.balanceOf('E1001', base.year), before + 1);

  // 年假管理页的权限项必须是独立的，不能复用 view.leave（那是员工端年假页的）
  check('年假管理页权限不是 view.leave',
    O.permissions.PAGE_PERMISSIONS.leaveadmin !== 'view.leave', true);
  check('普通员工没有年假管理页权限',
    O.permissions.canView(EMP, 'leaveadmin'), false);
  check('HR 管理员有年假管理页权限',
    O.permissions.canView(HR, 'leaveadmin'), true);

  // ---------- 5. 导入：不一致 → 对账调整；一致 → 不动 ----------
  console.log('\n-- 导入余额 --');
  const current = O.leave.balanceOf('E1001', base.year);
  const entriesBefore = O.leave.entriesOf('E1001', base.year).length;

  // 与现有余额不一致
  const diff = O.leave.validateImportRow({
    employeeId: 'E1001', name: '张小雨', year: base.year, days: String(current + 5)
  });
  check('不一致的行通过校验', diff.ok, true);
  check('处理方式是对账调整', diff.action, 'reconcile');
  check('差额计算正确', diff.diff, 5);

  // 与现有余额一致
  const same = O.leave.validateImportRow({
    employeeId: 'E1001', name: '张小雨', year: base.year, days: String(current)
  });
  check('一致的行通过校验', same.ok, true);
  check('一致的行不产生流水', same.action, 'none');

  // 确认导入
  const applied = O.leave.applyImport([diff], HR);
  checkTrue('导入成功', applied.ok);
  check('生成 1 条对账调整流水', applied.count, 1);
  check('流水类型是对账调整', applied.created[0].type, 'reconcile');
  check('导入后余额 = 导入值', O.leave.balanceOf('E1001', base.year), current + 5);
  check('原有流水一条没少', O.leave.entriesOf('E1001', base.year).length, entriesBefore + 1);

  // 历史流水保留：最早的初始建账还在
  const all = O.leave.entriesOf('E1001', base.year);
  check('历史流水仍然完整', all.length, entriesBefore + 1);
  checkTrue('最早的初始建账流水还在',
    all.some((e) => e.type === 'init' && e.delta === expectedInit));

  // ---------- 6. 导入的异常输入 ----------
  console.log('\n-- 导入异常输入 --');
  const impLetter = O.leave.validateImportRow({
    employeeId: 'E1001', name: '张小雨', year: base.year, days: '十'
  });
  check('导入字母被拦截', impLetter.ok, false);
  checkTrue('导入字母提示是中文', /不是数字/.test(impLetter.reason));

  const impEmpty = O.leave.validateImportRow({
    employeeId: 'E1001', name: '张小雨', year: base.year, days: ''
  });
  check('导入空值被拦截', impEmpty.ok, false);
  checkTrue('导入空值提示是中文', /为空/.test(impEmpty.reason));

  const impNegative = O.leave.validateImportRow({
    employeeId: 'E1001', name: '张小雨', year: base.year, days: '-5'
  });
  check('导入负数被拦截', impNegative.ok, false);

  const impNoEmp = O.leave.validateImportRow({
    employeeId: 'E9999', name: '不存在', year: base.year, days: '10'
  });
  check('导入不存在的员工被拦截', impNoEmp.ok, false);
  checkTrue('导入提示是中文', /名册中不存在/.test(impNoEmp.reason));

  const impBadYear = O.leave.validateImportRow({
    employeeId: 'E1001', name: '张小雨', year: '2026年', days: '10'
  });
  check('导入非法年度被拦截', impBadYear.ok, false);
  checkTrue('年度提示是中文', /不是四位年份/.test(impBadYear.reason));

  // ---------- 7. 表格行 ----------
  console.log('\n-- 台账表格 --');
  const rows = O.leave.rows();
  checkTrue('表格有数据', rows.length > 0);
  checkTrue('每行都有员工与账号',
    rows.every((r) => r.employee && r.account && r.account.username));
  checkTrue('每行余额都等于该行流水之和',
    rows.every((r) => r.balance === r.entries.reduce((s, e) => s + e.delta, 0)));
  checkTrue('已离职员工不进台账',
    !rows.some((r) => r.employee.status === '已离职'));

  console.log('\n' + (failures ? '发现 ' + failures + ' 处问题' : '全部通过'));
  if (failures) process.exitCode = 1;
})();
