/**
 * 制度知识库 · 解析 worker
 *
 * 在独立 worker_threads 线程里读取并解析文件，主线程只负责状态和轮询接口，
 * 页面不会因为 PDF/Word 解析而卡住。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { parentPort, workerData } = require('worker_threads');

const textParser = require('./kb-parsers/text');
const docxParser = require('./kb-parsers/docx');
const pdfParser = require('./kb-parsers/pdf');

const MAX_TEXT_CHARS = 5 * 1024 * 1024;
const MAX_BLOCKS = 50000;

function finishError(error) {
  var message = (error && error.friendly) ? error.message : ('解析失败：' + ((error && error.message) || '未知错误'));
  if (parentPort) parentPort.postMessage({ ok: false, error: message });
}

function writeResult(result) {
  if (!result || !result.blocks || !result.blocks.length) {
    throw new Error('文件里没有提取到文字');
  }
  if (result.blocks.length > MAX_BLOCKS) {
    throw new Error('文档内容块过多，请拆分文件后再上传');
  }
  var text = String(result.text || '');
  if (text.length > MAX_TEXT_CHARS) {
    throw new Error('提取出的文字超过 5MB，请拆分文件后再上传');
  }

  var payload = JSON.stringify({
    blocks: result.blocks,
    text: text,
    stats: result.stats || {},
    warnings: result.warnings || []
  });

  var tmp = workerData.outputPath + '.tmp';
  fs.writeFileSync(tmp, payload, 'utf8');
  fs.renameSync(tmp, workerData.outputPath);
  return payload.length;
}

function run() {
  var ext = String(workerData.ext || '').toLowerCase();
  var filePath = workerData.filePath;

  if (ext === '.pdf') {
    return pdfParser.parse(filePath, workerData.tmpPath, {
      pdftotextPath: workerData.pdftotextPath
    });
  }

  if (ext === '.txt' || ext === '.md' || ext === '.markdown') {
    return textParser.parse(fs.readFileSync(filePath), ext);
  }

  if (ext === '.docx') {
    return docxParser.parse(fs.readFileSync(filePath));
  }

  throw new Error('不支持的文件格式：' + ext);
}

async function main() {
  var result = await run();
  writeResult(result);
  if (parentPort) {
    parentPort.postMessage({
      ok: true,
      stats: result.stats || {},
      warnings: result.warnings || []
    });
  }
}

main().catch(function (error) {
  try { console.error('[kb-parse-worker] ' + (error && error.stack ? error.stack : error)); } catch (e) { /* ignore */ }
  finishError(error);
});
