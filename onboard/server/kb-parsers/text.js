/**
 * 制度知识库 · 文本 / Markdown 解析
 *
 * 纯 Node，无第三方依赖。
 * 编码：优先 UTF-8 严格解码，失败后回退 GBK（与员工管理 CSV 导入的容错口径一致）。
 */
'use strict';

const { TextDecoder } = require('util');

var REPLACEMENT_RATIO_LIMIT = 0.08;

function decodeBuffer(buffer) {
  var text;
  var encoding = 'utf-8';
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch (e) {
    try {
      text = new TextDecoder('gbk').decode(buffer);
      encoding = 'gbk';
    } catch (e2) {
      text = new TextDecoder('utf-8').decode(buffer);
    }
  }
  return { text: text.replace(/^﻿/, ''), encoding: encoding };
}

function countReplacement(text) {
  var hits = 0;
  for (var i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 0xfffd) hits += 1;
  }
  return hits;
}

function fail(message) {
  var err = new Error(message);
  err.friendly = true;
  throw err;
}

function normaliseText(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function splitParagraphs(text) {
  return text.split(/\n{2,}/).map(function (p) {
    return p.trim();
  }).filter(Boolean);
}

/**
 * 判断一行是不是标题。
 * 中文制度文本里常见的写法：
 *   一、总则        第一章 总则      1. 总则        1.1 总则        （一）适用范围
 */
function headingLevelOf(line) {
  var text = String(line || '').trim();
  if (!text || text.length > 40) return 0;

  // 以句号等结尾的是带编号的正文整句（如「（一）市内交通：实报实销，凭发票报销。」），
  // 不能当标题 —— 当了标题，这段正文就会从检索文本里丢掉。
  if (/[。！？!?）)]\s*$/.test(text)) return 0;

  var m;
  if ((m = text.match(/^第\s*([0-9一二三四五六七八九十百]+)\s*[章篇部分]\s*(.+)$/))) {
    return { level: 1, text: text };
  }
  if ((m = text.match(/^第\s*([0-9一二三四五六七八九十百]+)\s*条\s*(.+)$/))) {
    return { level: 2, text: text };
  }
  if ((m = text.match(/^([一二三四五六七八九十百]+)\s*[、.．]\s*\S/))) {
    return { level: 2, text: text };
  }
  if ((m = text.match(/^([0-9]{1,2})\s*[、.．]\s*\S/))) {
    return { level: 3, text: text };
  }
  if ((m = text.match(/^([0-9]{1,2}\.[0-9]{1,2})\s+\S/))) {
    return { level: 4, text: text };
  }
  if ((m = text.match(/^[（(]\s*([一二三四五六七八九十百0-9]+)\s*[)）]\s*\S/))) {
    return { level: 4, text: text };
  }
  return 0;
}

/**
 * 纯文本：按空行分段，并把「一、」「第一章」这类行单独拆成标题，
 * 这样预览和检索都能看到制度真实的章节结构。
 */
function parsePlainText(text) {
  var lines = text.split('\n');
  var blocks = [];
  var para = [];

  function flush() {
    if (para.length) {
      blocks.push({ type: 'paragraph', text: para.join('\n').trim() });
      para = [];
    }
  }

  lines.forEach(function (line) {
    var trimmed = line.trim();
    if (!trimmed) {
      flush();
      return;
    }
    var heading = headingLevelOf(trimmed);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', level: heading.level, text: trimmed });
      return;
    }
    para.push(line);
  });
  flush();
  return blocks;
}

function parseMarkdownTable(lines, index) {
  // 形如 | a | b |  +  | --- | --- |
  var first = lines[index];
  if (!first || !first.trim().startsWith('|')) return null;
  var second = lines[index + 1];
  if (!second || !/^\s*\|?[\s:|-]+\|?\s*$/.test(second)) return null;

  function cells(line) {
    var trimmed = line.trim();
    if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
    if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
    return trimmed.split('|').map(function (c) { return c.trim(); });
  }

  var rows = [cells(first)];
  var i = index + 2;
  while (i < lines.length && lines[i].trim().startsWith('|')) {
    rows.push(cells(lines[i]));
    i += 1;
  }
  return { rows: rows, next: i };
}

function parseMarkdown(text) {
  var lines = text.split('\n');
  var blocks = [];
  var para = [];
  var i = 0;

  function flush() {
    if (para.length) {
      blocks.push({ type: 'paragraph', text: para.join('\n').trim() });
      para = [];
    }
  }

  while (i < lines.length) {
    var line = lines[i];
    if (/^\s*```/.test(line)) {
      flush();
      var code = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      if (code.length) blocks.push({ type: 'paragraph', text: code.join('\n') });
      i += 1;
      continue;
    }

    var heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
      i += 1;
      continue;
    }

    var table = parseMarkdownTable(lines, i);
    if (table) {
      flush();
      blocks.push({ type: 'table', rows: table.rows });
      i = table.next;
      continue;
    }

    if (!line.trim()) {
      flush();
      i += 1;
      continue;
    }
    para.push(line);
    i += 1;
  }
  flush();
  return blocks;
}

function blockText(block) {
  if (!block) return '';
  if (block.type === 'table') {
    return (block.rows || []).map(function (row) { return (row || []).join(' | '); }).join('\n');
  }
  return block.text || '';
}

function statsOf(blocks) {
  var chars = 0;
  var tables = 0;
  var paragraphs = 0;
  blocks.forEach(function (b) {
    if (b.type === 'table') {
      tables += 1;
      paragraphs += 1;
    } else {
      paragraphs += 1;
    }
    chars += blockText(b).length;
  });
  return { chars: chars, tables: tables, paragraphs: paragraphs };
}

function blocksToText(blocks) {
  return blocks.map(blockText).filter(Boolean).join('\n\n');
}

/**
 * source: 'text' | 'markdown'
 */
function parse(buffer, ext) {
  var decoded = decodeBuffer(buffer);
  var text = normaliseText(decoded.text);
  if (!text) fail('文件里没有可读取的文字');

  var replacement = countReplacement(text);
  if (replacement > Math.max(3, Math.floor(text.length * REPLACEMENT_RATIO_LIMIT))) {
    fail('文字编码无法识别，合并后出现大量乱码，请另存为 UTF-8 后重试');
  }

  var blocks;
  if (ext === '.md' || ext === '.markdown') {
    blocks = parseMarkdown(text);
  } else {
    blocks = parsePlainText(text);
    // 一整段没有换行结构的文件，退回按空行分段
    if (!blocks.some(function (b) { return b.type === 'heading'; })) {
      blocks = splitParagraphs(text).map(function (p) {
        return { type: 'paragraph', text: p };
      });
    }
  }
  if (!blocks.length) fail('文件里没有可读取的文字');

  var warnings = [];
  if (decoded.encoding === 'gbk') warnings.push('文件不是 UTF-8，已按 GBK 解码，请在预览中确认中文正常');

  return {
    blocks: blocks,
    text: blocksToText(blocks),
    stats: statsOf(blocks),
    warnings: warnings,
    encoding: decoded.encoding
  };
}

module.exports = { parse: parse };
