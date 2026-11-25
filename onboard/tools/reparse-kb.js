/**
 * 初见 Onboard · 重新解析知识库文档
 *
 * 用途：样例制度在磁盘上修订后，把已上传文档的解析结果刷新成最新内容，
 * 不用重新上传（知识库没有删除功能，重传会产生重复条目）。
 *
 * 只处理「制度知识库上传文档」这一类：
 *   - 重新读取原始文件；
 *   - 用与上传时完全相同的解析器重新解析；
 *   - 覆盖 data/kb/text/<id>.json；
 *   - 同步更新 docs.json 里的 stats 与 updatedAt。
 *
 * 解析失败或文件缺失时保持原样并报错，不做半成品覆盖。
 *
 * 用法：
 *   node tools/reparse-kb.js            重新解析全部知识库文档
 *   node tools/reparse-kb.js --dry-run  只报告将要做什么，不写盘
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const KB_DIR = path.join(ROOT, 'data', 'kb');
const DOCS_FILE = path.join(KB_DIR, 'docs.json');
const FILES_DIR = path.join(KB_DIR, 'files');
const TEXT_DIR = path.join(KB_DIR, 'text');

const parser = require(path.join(ROOT, 'server', 'kb-parsers', 'text.js'));
const docxParser = require(path.join(ROOT, 'server', 'kb-parsers', 'docx.js'));

const dryRun = process.argv.indexOf('--dry-run') >= 0;

// 样例制度源目录：上传时的快照在 data/kb/files 里，改了 samples/ 不会自动同步，
// 所以重新解析时优先用 samples/ 下的最新源文件。
const SAMPLES_DIR = path.join(ROOT, 'samples');

/** 按原始文件名在 samples/ 里找源文件；找到就用它，否则用知识库里的快照 */
function sourceOf(doc) {
  const inSamples = path.join(SAMPLES_DIR, doc.originalName || '');
  if (doc.originalName && fs.existsSync(inSamples)) return inSamples;
  const stored = path.join(FILES_DIR, doc.storedName);
  return fs.existsSync(stored) ? stored : null;
}

if (!fs.existsSync(DOCS_FILE)) {
  console.error('知识库还没有文档：' + DOCS_FILE);
  process.exit(1);
}

const state = JSON.parse(fs.readFileSync(DOCS_FILE, 'utf8'));
let changed = 0;
let failed = 0;

console.log('== 重新解析知识库文档 ==' + (dryRun ? '（dry-run，不写盘）' : '') + '\n');

state.docs.forEach((doc) => {
  const source = sourceOf(doc);
  const output = path.join(TEXT_DIR, doc.id + '.json');

  if (!source) {
    console.log('  ! ' + (doc.title || doc.id) + '：原始文件缺失，跳过');
    failed += 1;
    return;
  }

  let parsed;
  try {
    parsed = doc.ext === '.docx'
      ? docxParser.parse(fs.readFileSync(source), doc.ext)
      : parser.parse(fs.readFileSync(source), doc.ext);
  } catch (e) {
    console.log('  ✗ ' + (doc.title || doc.id) + '：解析失败（' + e.message + '），保持原样');
    failed += 1;
    return;
  }

  // 解析结果里的标题可能与文档标题不一致时，以文档元数据为准
  const payload = {
    blocks: parsed.blocks,
    text: parsed.text,
    stats: parsed.stats,
    warnings: parsed.warnings
  };

  const before = fs.existsSync(output)
    ? JSON.parse(fs.readFileSync(output, 'utf8'))
    : null;
  const changedContent = !before || before.text !== payload.text;

  if (changedContent) {
    if (!dryRun) {
      // 源文件在 samples/ 下有修订时，把最新内容同步回知识库快照，
      // 保持「原件」与「解析结果」一致（下载到的也是最新版本）。
      const stored = path.join(FILES_DIR, doc.storedName);
      if (source !== stored && fs.existsSync(stored)) {
        fs.copyFileSync(source, stored);
      }
      fs.writeFileSync(output, JSON.stringify(payload), 'utf8');
      doc.stats = parsed.stats;
      doc.warnings = parsed.warnings;
      doc.updatedAt = new Date().toISOString();
    }
    changed += 1;
    console.log(
      '  ↻ ' + (doc.title || doc.id) +
      '：内容有变化，' + parsed.stats.chars + ' 字 · ' +
      parsed.stats.tables + ' 表 · ' + parsed.stats.paragraphs + ' 段' +
      (dryRun ? '（未写盘）' : '，已更新')
    );
  } else {
    console.log('  = ' + (doc.title || doc.id) + '：内容无变化');
  }
});

if (!dryRun && changed > 0) {
  const tmp = DOCS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, DOCS_FILE);
}

console.log('\n更新 ' + changed + ' 份，失败 ' + failed + ' 份');
if (failed > 0) process.exitCode = 1;
