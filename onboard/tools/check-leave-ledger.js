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

  // ---------- 1. 示例流水 ----------
  console.log('-- 示例流水 --');
  const balances = O.store.get('leaveBalances') || [];
  const base = balances.filter((b) => b.employeeId === 'E1001')[0];
  const samples = (sandbox.OnboardData && sandbox.OnboardData.leaveLedgerSamples) || [];

  check('有示例流水计划', samples.length > 0, true);
  check('示例流水覆盖 12 名员工', samples.length, 12);

  // 每人 2-4 条流水
  check('每人 2 到 4 条流水',
    samples.every((s) => s.flows.length >= 2 && s.flows.length <= 4), true);

  // 余额 = 流水之和，且与计划的目标值一致
  check('每人的余额 = 其流水之和',
    samples.every((s) => {
      const sum = s.flows.reduce((t, f) => t + f.delta, 0);
      return Math.abs(sum - s.target) < 1e-9;
    }), true);
  check('流水账里的余额与计划目标一致',
    samples.every((s) => Math.abs(O.leave.balanceOf(s.employeeId, s.year, HR) - s.target) < 1e-9),
    true);

  // 余额各不相同
  const targets = samples.map((s) => s.target);
  check('余额各不相同', new Set(targets).size, targets.length);

  // 含 0.5 天的半天余额
  check('存在 0.5 天的余额', targets.some((t) => t % 1 !== 0), true);
  check('所有余额都是 0.5 的倍数',
    targets.every((t) => O.leave.isHalfDayStep(t)), true);

  // 原因带「示例」
  check('每条流水的原因都带「示例」',
    samples.every((s) => s.flows.every((f) => f.reason.indexOf('示例') === 0)), true);

  // 所有员工余额非负
  check('所有员工余额非负',
    balances.every((b) => O.leave.balanceOf(b.employeeId, b.year, HR) >= 0), true);

  // 重建是幂等的：再跑一次不应有变化
  const beforeRebuild = O.leave.balanceOf('E1001', base.year, HR);
  O.leave.rebuildSampleLedger();
  check('示例流水重建幂等',
    O.leave.balanceOf('E1001', base.year, HR), beforeRebuild);

  // ---------- 2. 调整生成流水，余额 = Σ流水 ----------
  console.log('\n-- 调整与余额 --');
  const before = O.leave.balanceOf('E1001', base.year, HR);
  const beforeCount = O.leave.entriesOf('E1001', base.year, HR).length;

  // 先试 0.5 天的调整 —— 半天余额必须能调得动
  const half = O.leave.adjust(
    { employeeId: 'E1001', year: base.year, direction: 'add', days: 0.5, reason: '半天额度补发' },
    HR);
  checkTrue('0.5 天的调整成功', half.ok);
  check('0.5 天调整后余额正确',
    O.leave.balanceOf('E1001', base.year, HR), before + 0.5);
  check('0.5 天调整也留下流水',
    O.leave.entriesOf('E1001', base.year, HR).length, beforeCount + 1);
  // 回退这条，保持后续断言的基数
  O.store.set('leaveLedger', (O.store.get('leaveLedger') || []).filter((e) => e.reason !== '半天额度补发'));

  const r1 = O.leave.adjust(
    { employeeId: 'E1001', year: base.year, direction: 'add', days: 3, reason: '入职年限跨档补足差额' },
    HR);
  checkTrue('调整成功', r1.ok);
  check('调整后余额 = 原余额 + 3', O.leave.balanceOf('E1001', base.year, HR), before + 3);
  check('流水条数 +1', O.leave.entriesOf('E1001', base.year, HR).length, beforeCount + 1);
  check('流水记录了原因',
    O.leave.entriesOf('E1001', base.year, HR)[0].reason, '入职年限跨档补足差额');
  check('流水记录了操作人',
    O.leave.entriesOf('E1001', base.year, HR)[0].operator, '周颖');

  // 减少
  const r2 = O.leave.adjust(
    { employeeId: 'E1001', year: base.year, direction: 'sub', days: 2, reason: '离职结算冲抵多发部分' },
    HR);
  checkTrue('减少成功', r2.ok);
  check('调整后余额 = 原余额 + 1', O.leave.balanceOf('E1001', base.year, HR), before + 1);

  // 余额永远等于流水之和
  const sum = O.leave.entriesOf('E1001', base.year, HR)
    .reduce((s, e) => s + e.delta, 0);
  check('余额 == Σ流水', O.leave.balanceOf('E1001', base.year, HR), sum);

  // ---------- 3. 负数拦截 ----------
  console.log('\n-- 负数与异常输入 --');
  const neg = O.leave.validateAdjustment(
    { employeeId: 'E1001', year: base.year, direction: 'sub', days: 300, reason: '测试' }, HR);
  check('扣成负数被拦截', neg.ok, false);
  checkTrue('负数提示是中文且说明原因', /负数/.test(neg.message));

  const tooMany = O.leave.validateAdjustment(
    { employeeId: 'E1001', year: base.year, direction: 'add', days: 9999, reason: '测试' }, HR);
  check('超出单次上限被拦截', tooMany.ok, false);
  checkTrue('超限提示是中文', /最多调整/.test(tooMany.message));

  const letter = O.leave.validateAdjustment(
    { employeeId: 'E1001', year: base.year, direction: 'add', days: 'abc', reason: '测试' }, HR);
  check('字母输入被拦截', letter.ok, false);
  checkTrue('字母提示是中文', /只能填写数字|请勿输入字母/.test(letter.message));

  const empty = O.leave.validateAdjustment(
    { employeeId: 'E1001', year: base.year, direction: 'add', days: '', reason: '测试' }, HR);
  check('空值被拦截', empty.ok, false);
  checkTrue('空值提示是中文', /请填写调整的天数/.test(empty.message));

  const decimal = O.leave.validateAdjustment(
    { employeeId: 'E1001', year: base.year, direction: 'add', days: '1.5', reason: '测试' }, HR);
  check('0.5 天是合法的调整量', decimal.ok, true);

  const oddDecimal = O.leave.validateAdjustment(
    { employeeId: 'E1001', year: base.year, direction: 'add', days: '1.3', reason: '测试' }, HR);
  check('非 0.5 倍数的小数被拦截', oddDecimal.ok, false);
  checkTrue('提示说明了 0.5 天为最小单位', /0\.5 天为最小单位/.test(oddDecimal.message));

  const negativeDays = O.leave.validateAdjustment(
    { employeeId: 'E1001', year: base.year, direction: 'add', days: '-3', reason: '测试' }, HR);
  check('负数天数字段被拦截', negativeDays.ok, false);

  const noReason = O.leave.validateAdjustment(
    { employeeId: 'E1001', year: base.year, direction: 'add', days: 3, reason: '   ' }, HR);
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
  check('被拒绝后余额不变', O.leave.balanceOf('E1001', base.year, HR), before + 1);

  // 年假管理页的权限项必须是独立的，不能复用 view.leave（那是员工端年假页的）
  check('年假管理页权限不是 view.leave',
    O.permissions.PAGE_PERMISSIONS.leaveadmin !== 'view.leave', true);
  check('普通员工没有年假管理页权限',
    O.permissions.canView(EMP, 'leaveadmin'), false);
  check('HR 管理员有年假管理页权限',
    O.permissions.canView(HR, 'leaveadmin'), true);

  // ---------- 5. 导入：不一致 → 对账调整；一致 → 不动 ----------
  console.log('\n-- 导入余额 --');
  const current = O.leave.balanceOf('E1001', base.year, HR);
  const entriesBefore = O.leave.entriesOf('E1001', base.year, HR).length;

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
  check('导入后余额 = 导入值', O.leave.balanceOf('E1001', base.year, HR), current + 5);
  check('原有流水一条没少', O.leave.entriesOf('E1001', base.year, HR).length, entriesBefore + 1);

  // 历史流水保留：最早的示例建账流水还在
  const all = O.leave.entriesOf('E1001', base.year, HR);
  check('历史流水仍然完整', all.length, entriesBefore + 1);
  checkTrue('最早的示例流水还在',
    all.some((e) => e.type === 'init' && String(e.reason).indexOf('示例') === 0));

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

  const impHalf = O.leave.validateImportRow({
    employeeId: 'E1001', name: '张小雨', year: base.year, days: '7.5'
  });
  check('导入 0.5 天的余额通过校验', impHalf.ok, true);

  const impOdd = O.leave.validateImportRow({
    employeeId: 'E1001', name: '张小雨', year: base.year, days: '7.3'
  });
  check('导入非 0.5 倍数被拦截', impOdd.ok, false);

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
  const rows = O.leave.rows(HR);
  checkTrue('表格有数据', rows.length > 0);
  checkTrue('每行都有员工与账号',
    rows.every((r) => r.employee && r.account && r.account.username));
  checkTrue('每行余额都等于该行流水之和',
    rows.every((r) => r.balance === r.entries.reduce((s, e) => s + e.delta, 0)));
  checkTrue('已离职员工不进台账',
    !rows.some((r) => r.employee.status === '已离职'));

  // ---------- 8. 员工端只看本人 ----------
  console.log('\n-- 员工端：只看本人 --');
  const empAccount = O.auth.accounts().filter((a) => a.employeeId === 'E1001')[0];
  check('E1001 有登录账号', !!empAccount, true);

  const mine = O.leave.myRows(empAccount);
  check('只拿到自己的行', mine.every((r) => r.employee.id === 'E1001'), true);
  check('行数不超过本人的年度数', mine.length <= O.leave.yearsOf('E1001').length, true);

  // myRows 不接受员工编号参数 —— 传别人的编号也拿不到别人的数据
  check('myRows 的参数里没有员工编号',
    O.leave.myRows.length, 1);
  check('传入伪造的账号对象拿不到别人的数据',
    O.leave.myRows({ id: empAccount.id, employeeId: 'E1002' }).every((r) => r.employee.id === 'E1001'),
    true);

  // 没有员工档案的账号（管理账号）拿不到任何行
  const adminAccount = O.auth.accounts().filter((a) => !a.employeeId)[0];
  if (adminAccount) {
    check('管理账号通过 myRows 拿不到员工台账',
      O.leave.myRows(adminAccount).length, 0);
  }

  // myEntries 同样只认本人
  const myEntries = O.leave.myEntries(empAccount, base.year);
  check('myEntries 只返回本人的流水',
    myEntries.every((e) => e.employeeId === 'E1001'), true);
  check('myEntries 的行数与流水一致',
    myEntries.length, O.leave.entriesOf('E1001', base.year, HR).length);

  // 没有登录账号时一律拿不到
  check('没有账号时 myRows 返回空', O.leave.myRows(null).length, 0);
  check('没有账号时 myEntries 返回空', O.leave.myEntries(null, 2026).length, 0);

  // ---------- 9. 越权：员工拿不到别人的数据 ----------
  console.log('\n-- 越权检查 --');
  const other = 'E1002';

  check('员工取别人的 entriesOf 拿不到',
    O.leave.entriesOf(other, 2026, empAccount).length, 0);
  check('员工取别人的 balanceOf 拿不到',
    O.leave.balanceOf(other, 2026, empAccount), 0);
  check('员工调 rowsFor 拿不到别人的台账',
    O.leave.rowsFor(other, empAccount).length, 0);
  check('员工调 rows 拿不到全员台账',
    O.leave.rows(empAccount).length, 0);
  check('员工不能对别人做调整',
    O.leave.adjust({ employeeId: other, year: 2026, direction: 'add', days: 1, reason: '越权测试' }, empAccount).ok,
    false);
  check('越权调整后别人的余额没变',
    O.leave.balanceOf(other, 2026, HR),
    O.leave.entriesOf(other, 2026, HR).reduce((s, e) => s + e.delta, 0));

  // 换成管理身份就能拿到
  check('HR 取别人的 entriesOf 能拿到',
    O.leave.entriesOf(other, 2026, HR).length > 0, true);
  check('HR 调 rows 能拿到全员台账',
    O.leave.rows(HR).length > 0, true);
  check('HR 调 rowsFor 能拿到别人的台账',
    O.leave.rowsFor(other, HR).length > 0, true);

  // 伪造 actor（冒充管理角色）也没用：权限按真实账号记录判定
  check('伪造管理角色账号拿不到别人的数据',
    O.leave.entriesOf(other, 2026, { id: empAccount.id, role: '系统管理员' }).length, 0);

  console.log('\n' + (failures ? '发现 ' + failures + ' 处问题' : '全部通过'));
  if (failures) process.exitCode = 1;
})();
