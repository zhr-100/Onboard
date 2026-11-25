/**
 * 初见 Onboard · file://（双击打开）模式的冒烟测试
 *
 * 浏览器没法在自动化里开 file://，所以这里用 Node 模拟一个最小环境：
 * 一个内存版 localStorage + location.protocol = 'file:'，
 * 把网页端的脚本按 index.html 里的顺序跑一遍，然后检查关键状态。
 *
 * 用法：node tools/check-file-mode.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

// 与 index.html 里的引入顺序保持一致
const SCRIPTS = [
  'data/policies.js',
  'data/employees.js',
  'data/leave.js',
  'data/tickets.js',
  'data/testcases.js',
  'js/core/namespace.js',
  'js/core/dom.js',
  'js/core/format.js',
  'js/core/sha256.js',
  'js/core/store.js',
  'js/core/seed.js',
  'js/core/permissions.js',
  'js/core/auth.js',
  'js/core/staff.js',
  'js/core/knowledge.js',
  'js/core/csv.js'
];

function makeStorage() {
  const data = {};
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _dump: () => data
  };
}

function run(label, preloaded) {
  const storage = makeStorage();
  if (preloaded) {
    Object.keys(preloaded).forEach((k) => storage.setItem(k, JSON.stringify(preloaded[k])));
  }

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    localStorage: storage,
    location: { protocol: 'file:', hash: '' },
    navigator: { userAgent: 'node' },
    document: undefined,
    fetch: undefined
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  SCRIPTS.forEach((rel) => {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) throw new Error('缺少脚本：' + rel);
    vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: rel });
  });

  const O = sandbox.Onboard;
  const seedState = O.seed.build();

  return O.store.init(seedState).then((info) => {
    // app.js 启动时也会补种一次
    O.store.applySeed(seedState);

    const records = O.store.get('leaveRecords') || [];
    const balances = O.store.get('leaveBalances') || [];
    const employees = O.store.get('employees') || [];

    return {
      label,
      mode: info.mode,
      available: info.available,
      leaveRecords: records.length,
      leaveBalances: balances.length,
      employees: employees.length,
      storageKeys: Object.keys(storage._dump()).length
    };
  });
}

// 明细与台账是否对得上账：已完成之和 = used，已预约之和 = booked
function reconcile() {
  const sandbox = {
    console, setTimeout, clearTimeout,
    localStorage: makeStorage(),
    location: { protocol: 'file:', hash: '' },
    navigator: { userAgent: 'node' }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  ['data/policies.js', 'data/employees.js', 'data/leave.js', 'data/tickets.js',
    'js/core/namespace.js', 'js/core/dom.js', 'js/core/format.js',
    'js/core/store.js', 'js/core/seed.js'].forEach((rel) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel });
  });
  const O = sandbox.Onboard;
  const balances = O.store.get('leaveBalances') || [];
  const records = O.store.get('leaveRecords') || [];

  const problems = [];
  balances.forEach((b) => {
    const mine = records.filter((r) => r.employeeId === b.employeeId && Number(r.year) === Number(b.year));
    const used = mine.filter((r) => r.status === '已完成').reduce((s, r) => s + (Number(r.days) || 0), 0);
    const booked = mine.filter((r) => r.status === '已预约').reduce((s, r) => s + (Number(r.days) || 0), 0);
    if (used !== (Number(b.used) || 0)) {
      problems.push(`${b.employeeId}：明细已完成 ${used} 天 ≠ 台账 used ${b.used} 天`);
    }
    if (booked !== (Number(b.booked) || 0)) {
      problems.push(`${b.employeeId}：明细已预约 ${booked} 天 ≠ 台账 booked ${b.booked} 天`);
    }
  });
  return problems;
}

(async function main() {
  console.log('== file:// 模式冒烟测试 ==\n');

  // 场景 1：全新环境（双击第一次打开）
  const fresh = await run('全新环境');
  console.log('全新环境：', fresh);

  // 场景 2：老工作空间（年假明细出现之前就播种过，集合是空的）
  const legacy = await run('老工作空间（明细为空壳）', {
    leaveRecords: [],
    employees: [{ id: 'E1001', name: '张小雨', dept: '产品部', status: '在职' }],
    accounts: []
  });
  console.log('老工作空间：', legacy);

  const problems = reconcile();
  console.log('\n== 明细与台账对账 ==');
  if (problems.length) {
    problems.forEach((p) => console.log('  ✗ ' + p));
    process.exitCode = 1;
  } else {
    console.log('  ✓ 全部员工：已完成天数 = 台账 used，已预约天数 = 台账 booked');
  }

  // 断言
  const ok =
    fresh.mode === 'local' &&
    fresh.leaveRecords === 38 &&
    fresh.leaveBalances === 12 &&
    fresh.employees === 12 &&
    legacy.leaveRecords === 38 &&
    problems.length === 0;

  console.log('\n' + (ok ? '全部通过' : '存在失败项'));
  if (!ok) process.exitCode = 1;
})();
