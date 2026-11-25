/**
 * 初见 Onboard · 样例制度自检
 *
 * 检查 samples/ 目录下的示例制度：
 *  1. 必需章节是否齐全；
 *  2. 开头是否声明「模拟制度」；
 *  3. 算例中的算术是否正确；
 *  4. 标题能否被知识库解析器识别为 heading（识别不到就退化成普通段落，结构会丢）。
 *
 * 用法：node tools/check-samples.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SAMPLES = path.join(ROOT, 'samples');

// 复用知识库真实的 Markdown 解析器，避免自检逻辑与线上解析脱节
const parser = require(path.join(ROOT, 'server', 'kb-parsers', 'text.js'));

/** 每份制度必须具备的章节关键词 */
const REQUIRED_SECTIONS = [
  '目的与适用范围',
  '职责分工',
  '具体标准',
  '审批分级',
  '所需材料',
  '办理流程与时限',
  '例外与特殊情形',
  '核对示例',
  '咨询渠道'
];

/** 每份制度必须包含的声明 */
const REQUIRED_PHRASES = [
  '模拟制度，非任何真实公司的正式政策',
  '本模拟公司的管理设定，不是法定标准'
];

/**
 * 算例自检：每条规则形如 { desc, expr, expected }
 * expr 用 eval 在受控作用域里求值（只读数字运算，不涉及外部输入）
 */
const ARITHMETIC_RULES = [
  {
    file: '01-示例报销制度-云启科技.md',
    desc: '示例1：上海住宿 4 晚 × 580 + 餐补 3 天 × 100 + 交通 260',
    expr: '4 * 580 + 3 * 100 + 260',
    expected: 2880
  },
  {
    file: '01-示例报销制度-云启科技.md',
    desc: '示例2：场地 12800 + 餐饮 4000',
    expr: '12800 + 4000',
    expected: 16800
  },
  {
    file: '01-示例报销制度-云启科技.md',
    desc: '示例2：餐饮人均 4000 ÷ 20',
    expr: '4000 / 20',
    expected: 200
  },
  {
    file: '02-示例请假制度-云启科技.md',
    desc: '示例2：2026 年 5/6 至 5/7 共 2 个工作日（5/6 周三）',
    expr: '(function(){let n=0;for(let d=6;d<=7;d++){const w=new Date(2026,4,d).getDay();if(w!==0&&w!==6)n++;}return n;})()',
    expected: 2
  },
  {
    file: '02-示例请假制度-云启科技.md',
    desc: '示例3：2026 年 6/1 至 6/26 共 20 个工作日（6/1 为周一）',
    expr: '(function(){let n=0;for(let d=1;d<=26;d++){const w=new Date(2026,5,d).getDay();if(w!==0&&w!==6)n++;}return n;})()',
    expected: 20
  },
  {
    file: '03-示例年假制度-云启科技.md',
    desc: '示例2：入职 5/1，剩余 8 个月 × 10 天 ÷ 12',
    expr: '10 * 8 / 12',
    expected: 6.666666666666667
  },
  {
    file: '03-示例年假制度-云启科技.md',
    desc: '示例3：可用 = 15 − 8 − 2',
    expr: '15 - 8 - 2',
    expected: 5
  },
  {
    file: '03-示例年假制度-云启科技.md',
    desc: '示例4：折算天数 = 15 × 8 ÷ 12',
    expr: '15 * 8 / 12',
    expected: 10
  },
  {
    file: '03-示例年假制度-云启科技.md',
    desc: '示例4：折现金额 = 4 × 20000 ÷ 21.75',
    expr: '4 * 20000 / 21.75',
    expected: 3678.160919540229
  },
  {
    file: '04-示例入职指南-云启科技.md',
    desc: '示例3：4/10 入职当月 15 日前 → 5 月起缴纳',
    expr: '10 + 1',
    expected: 11
  },
  {
    file: '04-示例入职指南-云启科技.md',
    desc: '示例3：4/20 入职 → 增员顺延至 5 月 → 6 月起缴纳',
    expr: '20 + 1 + 1',
    expected: 22
  },
  {
    file: '05-示例产品部制度-云启科技.md',
    desc: '示例2：60 人日容量 × 80%',
    expr: '60 * 0.8',
    expected: 48
  },
  {
    file: '05-示例产品部制度-云启科技.md',
    desc: '示例2：44 + 6 = 50 人日，占容量 83.3%',
    expr: '(44 + 6) / 60 * 100',
    expected: 83.33333333333333
  },
  {
    file: '05-示例产品部制度-云启科技.md',
    desc: '示例3：错误率升幅 0.92% − 0.30%',
    expr: '0.92 - 0.30',
    expected: 0.62
  },
  {
    file: '05-示例产品部制度-云启科技.md',
    desc: '示例3：核心流程完成率降幅 96.1% − 92.4%',
    expr: '96.1 - 92.4',
    expected: 3.7
  },
  {
    file: '06-示例技术部制度-云启科技.md',
    desc: '示例3：P0 止损 20:10 + 30 分钟',
    expr: '10 + 30',
    expected: 40
  },
  {
    file: '06-示例技术部制度-云启科技.md',
    desc: '示例3：P0 恢复 4 小时',
    expr: '20 + 60 * 4',
    expected: 260
  },
  {
    file: '06-示例技术部制度-云启科技.md',
    desc: '示例4：错误率升幅 1.7% − 0.4%',
    expr: '1.7 - 0.4',
    expected: 1.3
  },
  {
    file: '07-示例销售部制度-云启科技.md',
    desc: '示例1：折扣 (100 − 78) ÷ 100',
    expr: '(100 - 78) / 100 * 100',
    expected: 22
  },
  {
    file: '07-示例销售部制度-云启科技.md',
    desc: '示例1：三笔加权平均折扣 (600 − 486) ÷ 600',
    expr: '(600 - 486) / 600 * 100',
    expected: 19
  },
  {
    file: '07-示例销售部制度-云启科技.md',
    desc: '示例2：账期 5/20 到期，逾期 60 日为 7/19',
    expr: '20 + 30 + 30',
    expected: 80
  },
  {
    file: '07-示例销售部制度-云启科技.md',
    desc: '示例3：账龄 1–2 年计提 20 万 × 30%',
    expr: '200000 * 0.3',
    expected: 60000
  },
  {
    file: '07-示例销售部制度-云启科技.md',
    desc: '示例3：账龄 1 年以内计提 20 万 × 5%',
    expr: '200000 * 0.05',
    expected: 10000
  },
  {
    file: '08-示例财务部制度-云启科技.md',
    desc: '示例3：超支 8 万 ÷ 200 万',
    expr: '8 / 200 * 100',
    expected: 4
  },
  {
    file: '08-示例财务部制度-云启科技.md',
    desc: '示例3：超支 12 万 ÷ 200 万',
    expr: '12 / 200 * 100',
    expected: 6
  },
  {
    file: '08-示例财务部制度-云启科技.md',
    desc: '示例3：超支 34 万 ÷ 200 万',
    expr: '34 / 200 * 100',
    expected: 17
  },
  {
    file: '08-示例财务部制度-云启科技.md',
    desc: '示例2：2026 年 5/20 为周三，付款批次 5/28 截单为 5/26',
    expr: '(function(){const d=new Date(2026,4,20).getDay();return d===3?26:0;})()',
    expected: 26
  },
  {
    file: '09-示例人力资源部制度-云启科技.md',
    desc: '示例1：加权总分 4×40% + 2×25% + 4×20% + 4×15%',
    expr: '4 * 0.4 + 2 * 0.25 + 4 * 0.2 + 4 * 0.15',
    expected: 3.5
  },
  {
    file: '09-示例人力资源部制度-云启科技.md',
    desc: '示例2：调薪 20 万 → 22.8 万的幅度',
    expr: '(22.8 - 20) / 20 * 100',
    expected: 14
  },
  {
    file: '09-示例人力资源部制度-云启科技.md',
    desc: '示例2：调薪 20 万 → 23.4 万的幅度',
    expr: '(23.4 - 20) / 20 * 100',
    expected: 17
  },
  {
    file: '09-示例人力资源部制度-云启科技.md',
    desc: '示例4：竞业补偿 40000 × 30%',
    expr: '40000 * 0.3',
    expected: 12000
  },
  {
    file: '09-示例人力资源部制度-云启科技.md',
    desc: '示例5：5/10 接受 Offer + 7 日失效',
    expr: '10 + 7',
    expected: 17
  }
];

/**
 * 与基线制度（data/policies.js）的一致性检查。
 *
 * 基线制度是系统里长期存在的那份，新写的样例制度不能与它给出矛盾答案 ——
 * 员工问同一个问题，不能从两份制度里拿到两个数字。
 * 每条规则：{ desc, file, mustContain: [...], mustNotContain: [...] }
 */
const CONSISTENCY_RULES = [
  {
    desc: '年假档位与基线一致（10 / 15 / 20 天）',
    file: '03-示例年假制度-云启科技.md',
    mustContain: ['满 1 年未满 3 年 | 10 天', '满 3 年未满 5 年 | 15 天', '满 5 年及以上 | 20 天']
  },
  {
    desc: '年假结转截止日与基线一致（次年 3 月 31 日）',
    file: '03-示例年假制度-云启科技.md',
    mustContain: ['次年 3 月 31 日', '3 月 31 日']
  },
  {
    desc: '离职折算口径与基线一致（实际工作月数、21.75）',
    file: '03-示例年假制度-云启科技.md',
    mustContain: ['实际工作月数', '21.75']
  },
  {
    desc: '年假申请时限与基线一致（提前 2 个工作日、1-3 天主管审批、超 3 天两级复核）',
    file: '03-示例年假制度-云启科技.md',
    mustContain: ['2 个工作日', '直属主管', '部门负责人']
  },
  {
    desc: '病假材料时限与基线一致（返岗后 3 个工作日）',
    file: '02-示例请假制度-云启科技.md',
    mustContain: ['3 个工作日']
  },
  {
    desc: '病假工资口径与基线一致（70%，超 15 个工作日 60%，不低于最低工资）',
    file: '02-示例请假制度-云启科技.md',
    mustContain: ['70%', '60%', '最低工资标准']
  },
  {
    desc: '法定节假日 11 天与基线一致',
    file: '02-示例请假制度-云启科技.md',
    mustContain: ['11 天']
  },
  {
    desc: '住宿标准与基线一致（600 / 450 / 350 元）',
    file: '01-示例报销制度-云启科技.md',
    mustContain: ['600 元', '450 元', '350 元']
  },
  {
    desc: '餐补与市内交通包干口径与基线一致（100 元/天）',
    file: '01-示例报销制度-云启科技.md',
    mustContain: ['100 元包干'],
    // 只禁止把餐补写成城市分档；示例里的其它金额（如发票金额 120 元）不算冲突
    mustNotContain: ['一线城市 | 150 元', '二线城市 | 120 元']
  },
  {
    desc: '新员工材料时限与基线一致（入职后 5 个工作日）',
    file: '04-示例入职指南-云启科技.md',
    mustContain: ['入职后 5 个工作日']
  },
  {
    desc: '入职材料清单与基线一致（身份证、银行卡、学历学位、离职证明、体检报告、授权书）',
    file: '04-示例入职指南-云启科技.md',
    mustContain: ['身份证', '银行卡', '离职证明', '体检报告']
  }
];

function approxEqual(a, b) {
  return Math.abs(a - b) < 1e-6;
}

function listSamples() {
  if (!fs.existsSync(SAMPLES)) return [];
  return fs.readdirSync(SAMPLES)
    .filter((f) => /\.md$|\.txt$/.test(f))
    .sort();
}

let failures = 0;
const files = listSamples();

console.log('== 样例制度自检 ==\n');
console.log('样例文件数：' + files.length + '\n');

files.forEach((name) => {
  const full = path.join(SAMPLES, name);
  const text = fs.readFileSync(full, 'utf8');
  const problems = [];

  // 1. 声明
  REQUIRED_PHRASES.forEach((phrase) => {
    if (text.indexOf(phrase) < 0) problems.push('缺少声明：' + phrase);
  });

  // 2. 章节
  REQUIRED_SECTIONS.forEach((section) => {
    if (text.indexOf(section) < 0) problems.push('缺少章节：' + section);
  });

  // 3. 文件信息字段
  ['文件编号', '版本', '演示生效日期', '适用范围', '制度维护部门', '变更摘要'].forEach((field) => {
    if (text.indexOf(field) < 0) problems.push('缺少文件信息字段：' + field);
  });

  // 4. 解析器能否正确识别结构
  let parsed = null;
  try {
    parsed = parser.parse(fs.readFileSync(full), name.endsWith('.md') ? '.md' : '.txt');
  } catch (e) {
    problems.push('解析失败：' + e.message);
  }
  if (parsed) {
    const headings = parsed.blocks.filter((b) => b.type === 'heading');
    const tables = parsed.blocks.filter((b) => b.type === 'table');
    if (headings.length < 10) {
      problems.push('标题识别过少（' + headings.length + ' 个），结构可能未正确解析');
    }
    if (!tables.length) {
      problems.push('未识别到表格');
    }
    if (parsed.warnings && parsed.warnings.length) {
      problems.push('解析告警：' + parsed.warnings.join('；'));
    }
    console.log(
      '  ' + name +
      ' → 标题 ' + headings.length +
      ' · 表格 ' + tables.length +
      ' · 段落 ' + parsed.stats.paragraphs +
      ' · 字数 ' + parsed.stats.chars
    );
  }

  if (problems.length) {
    failures += 1;
    problems.forEach((p) => console.log('    ✗ ' + p));
  } else {
    console.log('    ✓ 结构检查通过');
  }
});

// 算例自检
console.log('\n== 算例算术自检 ==\n');
ARITHMETIC_RULES.forEach((rule) => {
  const full = path.join(SAMPLES, rule.file);
  if (!fs.existsSync(full)) {
    console.log('  ✗ 文件不存在：' + rule.file);
    failures += 1;
    return;
  }
  let value;
  try {
    // eslint-disable-next-line no-new-func
    value = Function('"use strict"; return (' + rule.expr + ');')();
  } catch (e) {
    console.log('  ✗ 表达式错误：' + rule.expr);
    failures += 1;
    return;
  }
  if (approxEqual(value, rule.expected)) {
    console.log('  ✓ ' + rule.desc + ' = ' + value);
  } else {
    console.log('  ✗ ' + rule.desc + '：算得 ' + value + '，期望 ' + rule.expected);
    failures += 1;
  }
});

console.log('\n== 与基线制度的一致性自检 ==\n');
CONSISTENCY_RULES.forEach((rule) => {
  const full = path.join(SAMPLES, rule.file);
  if (!fs.existsSync(full)) {
    console.log('  ✗ 文件不存在：' + rule.file);
    failures += 1;
    return;
  }
  const text = fs.readFileSync(full, 'utf8');
  const problems = [];
  (rule.mustContain || []).forEach((phrase) => {
    if (text.indexOf(phrase) < 0) problems.push('缺少口径：' + phrase);
  });
  (rule.mustNotContain || []).forEach((phrase) => {
    if (text.indexOf(phrase) >= 0) problems.push('出现冲突口径：' + phrase);
  });
  if (problems.length) {
    console.log('  ✗ ' + rule.desc);
    problems.forEach((p) => console.log('      ' + p));
    failures += 1;
  } else {
    console.log('  ✓ ' + rule.desc);
  }
});

console.log('\n' + (failures ? '发现 ' + failures + ' 处问题' : '全部通过'));
if (failures) process.exitCode = 1;
