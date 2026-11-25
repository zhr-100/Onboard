/**
 * 制度知识库 · PDF 文字提取
 *
 * 零 npm 依赖：调用本机 pdftotext（Xpdf 或 Poppler 均可）。
 *  - 有文字层的 PDF：按版面提取文字（-layout 尽量保留表格列对齐）
 *  - 扫描件 / 纯图片 PDF：没有文字层，明确失败并提示需要先 OCR
 *  - 加密 / 损坏 PDF：返回可读的失败原因
 *
 * 安全：固定参数数组、固定输出文件、超时；不拼接 shell 命令。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const PDF_TIMEOUT_MS = 60000;
const MAX_OUTPUT_CHARS = 5 * 1024 * 1024;

function fail(message) {
  var err = new Error(message);
  err.friendly = true;
  throw err;
}

function existingFile(candidate) {
  if (!candidate) return null;
  try {
    if (fs.statSync(candidate).isFile()) return candidate;
  } catch (e) { /* ignore */ }
  return null;
}

/** 找 pdftotext：配置 > 环境变量 > PATH > Git for Windows 常见位置 */
function findPdftotext(customPath) {
  var fromConfig = existingFile(String(customPath || '').trim());
  if (fromConfig) return fromConfig;

  var fromEnv = existingFile(String(process.env.PDFTOTEXT_PATH || '').trim());
  if (fromEnv) return fromEnv;

  var exeNames = process.platform === 'win32' ? ['pdftotext.exe', 'pdftotext'] : ['pdftotext'];
  var dirs = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (var i = 0; i < dirs.length; i++) {
    for (var j = 0; j < exeNames.length; j++) {
      var hit = existingFile(path.join(dirs[i], exeNames[j]));
      if (hit) return hit;
    }
  }

  var common = [
    'C:\\Program Files\\Git\\ucrt64\\bin\\pdftotext.exe',
    'C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe',
    'C:\\Program Files\\Git\\usr\\bin\\pdftotext.exe',
    'C:\\Program Files\\poppler\\Library\\bin\\pdftotext.exe',
    '/usr/bin/pdftotext',
    '/usr/local/bin/pdftotext',
    '/opt/homebrew/bin/pdftotext'
  ];
  for (var k = 0; k < common.length; k++) {
    var found = existingFile(common[k]);
    if (found) return found;
  }
  return null;
}

function runPdftotext(tool, inputPath, outputPath) {
  return new Promise(function (resolve, reject) {
    execFile(tool, ['-layout', '-enc', 'UTF-8', '-q', inputPath, outputPath], {
      timeout: PDF_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    }, function (error, stdout, stderr) {
      if (error) {
        var msg = String(stderr || '').trim();
        var friendly = new Error('');
        friendly.friendly = true;
        if (error.killed || (error.signal && error.signal !== 'SIGTERM')) {
          friendly.message = 'PDF 解析超时，文件可能过大或结构异常';
          reject(friendly);
          return;
        }
        if (/password|encrypt|encrypted/i.test(msg)) {
          friendly.message = 'PDF 已加密，无法读取文字，请解除密码后重试';
          reject(friendly);
          return;
        }
        friendly.message = 'PDF 解析失败：' + (msg || '文件可能损坏');
        reject(friendly);
        return;
      }
      resolve();
    });
  });
}

function countReplacement(text) {
  var hits = 0;
  for (var i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 0xfffd) hits += 1;
  }
  return hits;
}

function parse(filePath, tempOutputPath, options) {
  options = options || {};
  var tool = findPdftotext(options.pdftotextPath);
  if (!tool) {
    fail('未找到 PDF 解析工具 pdftotext。请安装 Poppler/Xpdf，或在 config.json 的 parsing.pdftotext 填可执行文件路径后重启服务。');
  }

  return runPdftotext(tool, filePath, tempOutputPath).then(function () {
    var text;
    try {
      text = fs.readFileSync(tempOutputPath, 'utf8');
    } catch (e) {
      fail('PDF 解析失败：没有生成文字结果，文件可能损坏');
    }

    text = text.replace(/^\uFEFF/, '').replace(/\u0000/g, '').replace(/\r\n?/g, '\n');
    if (text.length > MAX_OUTPUT_CHARS) {
      fail('PDF 提取出的文字过多（超过 5MB），请拆分文件后再上传');
    }

    var pages = text.split('\f').map(function (p) { return p.trim(); }).filter(Boolean);
    if (!pages.length) {
      fail('未提取到文字：这可能是扫描版 PDF 或纯图片文档，需要先做文字识别（OCR）后再上传');
    }

    var joined = pages.join('\n\n');
    var replacement = countReplacement(joined);
    if (replacement > Math.max(5, Math.floor(joined.length * 0.08))) {
      fail('PDF 字体缺少可用的文字映射，提取结果大量乱码；请导出为带文字层的 PDF 或改传 Word/TXT');
    }

    var blocks = pages.map(function (page) {
      return { type: 'layout', text: page };
    });

    return {
      blocks: blocks,
      text: joined,
      stats: { chars: joined.length, tables: 0, paragraphs: pages.length },
      warnings: ['PDF 按版面文字提取，复杂表格可能以空格对齐显示；请在预览中核对']
    };
  }).finally(function () {
    try { fs.unlinkSync(tempOutputPath); } catch (e) { /* ignore */ }
  });
}

module.exports = {
  parse: parse,
  findPdftotext: findPdftotext
};
