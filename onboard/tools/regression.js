/**
 * 初见 Onboard · 检索准确率回归测试
 *
 * 用法：
 *   node tools/regression.js
 *   node tools/regression.js --verbose    打印每一条题的详情
 *
 * 它会拿 data/testcases.js 里的题目跑一遍检索，看结果符不符合预期。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const verbose = process.argv.includes('--verbose');

const SCRIPTS = [
  'js/core/namespace.js',
  'js/core/format.js',
  'js/core/store.js',
  'js/core/seed.js',
  'js/nlp/config.js',
  'js/nlp/lexicon.js',
  'js/nlp/tokenizer.js',
  'js/nlp/retriever.js',
  'js/nlp/intent.js',
  'js/nlp/answerer.js',
  'data/policies.js',
  'data/employees.js',
  'data/tickets.js',
  'data/testcases.js'
];

const ctx = { console: console, process: process };
ctx.globalThis = ctx;
vm.createContext(ctx);
SCRIPTS.forEach(function (rel) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    console.error('缺少文件：' + rel);
    process.exit(1);
  }
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: rel });
});

const O = ctx.Onboard;
const policies = ctx.OnboardData.policies || [];
const testcases = ctx.OnboardData.testcases || [];

const corpus = O.nlp.retriever.build(policies);

let pass = 0;
let fail = 0;
const failures = [];

testcases.forEach(function (tc) {
  const intent = O.nlp.intent.detect(tc.q);
  const search = O.nlp.retriever.search(corpus, tc.q, O.nlp.config);
  const answer = O.nlp.answerer.build({ query: tc.q, intent: intent, search: search });

  const problems = [];

  if (answer.state !== tc.expect) {
    problems.push('状态应为 ' + tc.expect + '，实际 ' + answer.state);
  }

  if (tc.expect === 'hit') {
    const hit = answer.citations[0];
    if (!hit) {
      problems.push('没有产出依据');
    } else {
      if (tc.expectClauseNo && hit.clauseNo !== tc.expectClauseNo) {
        problems.push('依据条款号应为 ' + tc.expectClauseNo + '，实际 ' + hit.clauseNo);
      }
      if (tc.expectClauseHeading && hit.clauseHeading !== tc.expectClauseHeading) {
        problems.push('依据条款标题应为 ' + tc.expectClauseHeading + '，实际 ' + hit.clauseHeading);
      }
    }
  }

  if (tc.expect === 'partial' && !answer.citations.length) {
    problems.push('部分找到时至少要给出 1 条相关条款');
  }

  if (tc.expect === 'no_evidence' && answer.citations.length) {
    problems.push('没找到时不应给依据');
  }

  if (problems.length) {
    fail += 1;
    failures.push({ id: tc.id, q: tc.q, problems: problems, state: answer.state, top: search.top ? search.top.score : 0, cov: search.top ? search.top.coverage : 0, matched: answer.matchedTerms });
  } else {
    pass += 1;
  }

  if (verbose) {
    console.log(
      (problems.length ? '✗' : '✓') + ' ' + tc.id + '  ' + tc.q +
      '  → ' + answer.state +
      '  意图=' + intent +
      '  分=' + (search.top ? search.top.score.toFixed(2) : '0') +
      '  覆盖=' + (search.top ? (search.top.coverage * 100).toFixed(0) + '%' : '0%') +
      (problems.length ? '  << ' + problems.join('；') : '')
    );
  }
});

console.log('');
console.log('制度 ' + policies.length + ' 个，条款 ' +
  policies.reduce(function (a, p) { return a + (p.clauses || []).length; }, 0) + ' 条，测试题 ' + testcases.length + ' 条');
console.log('通过 ' + pass + ' 条，未通过 ' + fail + ' 条');

if (failures.length) {
  console.log('');
  console.log('未通过的题目：');
  failures.forEach(function (f) {
    console.log('  ' + f.id + '  ' + f.q);
    console.log('      实际状态=' + f.state + '  分=' + f.top.toFixed(2) + '  覆盖=' + (f.cov * 100).toFixed(0) + '%');
    console.log('      命中词=' + (f.matched || []).join('、'));
    f.problems.forEach(function (p) { console.log('      - ' + p); });
  });
  process.exitCode = 1;
}
