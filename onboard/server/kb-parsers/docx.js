/**
 * 制度知识库 · .docx 解析
 *
 * 只用 Node 内置模块：
 *  - 读 ZIP 中央目录，取 word/document.xml
 *  - zlib.inflateRawSync 解压
 *  - 按 WordprocessingML 的段落/表格标签提取文字
 *
 * 不支持旧版 .doc（二进制 OLE 格式），调用方会直接拒绝。
 */
'use strict';

const zlib = require('zlib');

const MAX_ENTRIES = 1024;
const MAX_XML_BYTES = 30 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED = 80 * 1024 * 1024;

function fail(message) {
  var err = new Error(message);
  err.friendly = true;
  throw err;
}

function u32(buf, offset) {
  return buf.readUInt32LE(offset);
}

function u16(buf, offset) {
  return buf.readUInt16LE(offset);
}

function findEocd(buf) {
  var min = Math.max(0, buf.length - 22 - 65535);
  for (var i = buf.length - 22; i >= min; i--) {
    if (u32(buf, i) === 0x06054b50) {
      var commentLen = u16(buf, i + 20);
      if (i + 22 + commentLen <= buf.length) return i;
    }
  }
  return -1;
}

function readZipEntries(buf) {
  var eocd = findEocd(buf);
  if (eocd < 0) fail('Word 文件不是有效的 .docx（ZIP 结构损坏）');

  var entryCount = u16(buf, eocd + 10);
  var cdOffset = u32(buf, eocd + 16);
  if (entryCount > MAX_ENTRIES) fail('Word 文件内部条目过多，已拒绝解析');
  if (cdOffset < 0 || cdOffset >= buf.length) fail('Word 文件结构损坏');

  var entries = [];
  var offset = cdOffset;
  for (var i = 0; i < entryCount; i++) {
    if (offset + 46 > buf.length || u32(buf, offset) !== 0x02014b50) {
      fail('Word 文件结构损坏（中央目录不完整）');
    }
    var flags = u16(buf, offset + 8);
    var method = u16(buf, offset + 10);
    var compSize = u32(buf, offset + 20);
    var uncompSize = u32(buf, offset + 24);
    var nameLen = u16(buf, offset + 28);
    var extraLen = u16(buf, offset + 30);
    var commentLen = u16(buf, offset + 32);
    var localOffset = u32(buf, offset + 42);
    var name = buf.slice(offset + 46, offset + 46 + nameLen).toString('utf8');

    entries.push({
      name: name,
      flags: flags,
      method: method,
      compSize: compSize,
      uncompSize: uncompSize,
      localOffset: localOffset
    });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readEntry(buf, entry) {
  if (entry.flags & 0x1) fail('Word 文件已加密，请先解除密码后重试');
  if (entry.uncompSize > MAX_XML_BYTES) fail('Word 正文过大，已拒绝解析');
  if (entry.localOffset + 30 > buf.length || u32(buf, entry.localOffset) !== 0x04034b50) {
    fail('Word 文件结构损坏（本地文件头不完整）');
  }
  var nameLen = u16(buf, entry.localOffset + 26);
  var extraLen = u16(buf, entry.localOffset + 28);
  var dataStart = entry.localOffset + 30 + nameLen + extraLen;
  var dataEnd = dataStart + entry.compSize;
  if (dataEnd > buf.length) fail('Word 文件结构损坏（正文数据越界）');

  var raw = buf.slice(dataStart, dataEnd);
  var out;
  if (entry.method === 0) {
    out = raw;
  } else if (entry.method === 8) {
    try {
      out = zlib.inflateRawSync(raw, { maxOutputLength: MAX_XML_BYTES });
    } catch (e) {
      fail('Word 正文解压失败，文件可能损坏');
    }
  } else {
    fail('Word 文件使用了不支持的压缩方式');
  }
  if (out.length > MAX_XML_BYTES) fail('Word 正文解压后过大，已拒绝解析');
  return out;
}

function findEntry(entries, name) {
  var lower = name.toLowerCase();
  return entries.filter(function (e) { return e.name.toLowerCase() === lower; })[0] || null;
}

function decodeXmlEntities(text) {
  return String(text || '').replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, function (m, entity) {
    if (entity === 'amp') return '&';
    if (entity === 'lt') return '<';
    if (entity === 'gt') return '>';
    if (entity === 'quot') return '"';
    if (entity === 'apos') return "'";
    if (entity.charAt(0) === '#') {
      var code = entity.charAt(1).toLowerCase() === 'x'
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return m;
  });
}

/** 从一段 XML 里按顺序取出文字、制表符和换行 */
function textFromRuns(xml) {
  var out = '';
  var re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab(?:\s[^>]*)?\/>|<w:br(?:\s[^>]*)?\/>|<w:cr(?:\s[^>]*)?\/>/g;
  var m;
  while ((m = re.exec(xml)) !== null) {
    if (m[1] !== undefined) out += decodeXmlEntities(m[1]);
    else if (m[0].indexOf('<w:tab') >= 0) out += '\t';
    else out += '\n';
  }
  return out;
}

/** 段落文字（含制表符/换行） */
function paragraphText(pXml) {
  return textFromRuns(pXml).replace(/\s+$/g, '');
}

function headingLevel(pXml) {
  var pPr = pXml.match(/<w:pPr(?:\s[^>]*)?>([\s\S]*?)<\/w:pPr>/);
  var block = pPr ? pPr[1] : pXml;

  var outline = block.match(/<w:outlineLvl\s+w:val="(\d)"/);
  if (outline) {
    var lvl = Number(outline[1]);
    if (lvl >= 0 && lvl <= 8) return lvl + 1;
  }

  var style = block.match(/<w:pStyle\s+w:val="([^"]+)"/);
  if (style) {
    var val = style[1];
    var heading = val.match(/^(?:Heading|标题|Title)\s*([1-9])?$/i);
    if (heading) return heading[1] ? Number(heading[1]) : 1;
    if (/^(?:Heading|标题|Title)$/i.test(val)) return 1;
  }
  return 0;
}

function findBody(xml) {
  var m = xml.match(/<w:body(?:\s[^>]*)?>([\s\S]*?)<\/w:body>/);
  return m ? m[1] : xml;
}

/** 找顶层表格的结束位置（考虑嵌套 w:tbl） */
function findTableEnd(xml, start) {
  var re = /<w:tbl(?=\s|\/|>)|<\/w:tbl>/g;
  re.lastIndex = start;
  var depth = 0;
  var m;
  while ((m = re.exec(xml)) !== null) {
    if (m[0].indexOf('</') === 0) {
      depth -= 1;
      if (depth === 0) return re.lastIndex;
    } else if (m[0].indexOf('<w:tbl') === 0 && !/\/>\s*$/.test(xml.slice(m.index, m.index + m[0].length + 2))) {
      depth += 1;
    }
  }
  return -1;
}

function parseTableRows(tblXml) {
  var rows = [];
  var trRe = /<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g;
  var m;
  while ((m = trRe.exec(tblXml)) !== null) {
    var rowXml = m[1];
    var cells = [];
    var tcRe = /<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g;
    var c;
    while ((c = tcRe.exec(rowXml)) !== null) {
      var cellXml = c[1];
      var paras = [];
      var pRe = /<w:p(?=\s|\/|>)(?:[^>]*)>([\s\S]*?)<\/w:p>/g;
      var p;
      while ((p = pRe.exec(cellXml)) !== null) {
        var text = paragraphText(p[0]).trim();
        if (text) paras.push(text);
      }
      cells.push(paras.join(' '));
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function parseDocumentXml(xml) {
  var body = findBody(xml);
  var blocks = [];
  var i = 0;

  while (i < body.length) {
    var pStart = body.indexOf('<w:p', i);
    var tblStart = body.indexOf('<w:tbl', i);
    var next = -1;
    var isTable = false;

    if (pStart >= 0 && /^<w:p(?=\s|\/|>)/.test(body.slice(pStart, pStart + 6))) {
      next = pStart;
    }
    if (tblStart >= 0) {
      if (next < 0 || tblStart < next) {
        next = tblStart;
        isTable = true;
      }
    }
    if (next < 0) break;

    if (isTable) {
      var tbEnd = findTableEnd(body, next);
      if (tbEnd < 0) fail('Word 表格结构不完整，文件可能损坏');
      var tblXml = body.slice(next, tbEnd);
      var rows = parseTableRows(tblXml);
      if (rows.length) blocks.push({ type: 'table', rows: rows });
      i = tbEnd;
    } else {
      var openTagEnd = body.indexOf('>', next);
      if (openTagEnd >= 0 && body.charAt(openTagEnd - 1) === '/') {
        i = openTagEnd + 1;
        continue;
      }
      var pEnd = body.indexOf('</w:p>', next);
      if (pEnd < 0) {
        i = next + 4;
        continue;
      }
      pEnd += 6;
      var pXml = body.slice(next, pEnd);
      var text = paragraphText(pXml).trim();
      var level = headingLevel(pXml);
      if (text) {
        if (level) blocks.push({ type: 'heading', level: level, text: text });
        else blocks.push({ type: 'paragraph', text: text });
      }
      i = pEnd;
    }
  }
  return blocks;
}

function blockText(block) {
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
    if (b.type === 'table') tables += 1;
    paragraphs += 1;
    chars += blockText(b).length;
  });
  return { chars: chars, tables: tables, paragraphs: paragraphs };
}

function parse(buffer) {
  var entries = readZipEntries(buffer);
  var total = 0;
  entries.forEach(function (e) { total += e.uncompSize || 0; });
  if (total > MAX_TOTAL_UNCOMPRESSED) fail('Word 文件解压后过大，已拒绝解析');

  var contentTypes = findEntry(entries, '[Content_Types].xml');
  var documentEntry = findEntry(entries, 'word/document.xml');
  if (!contentTypes || !documentEntry) {
    fail('不是有效的 .docx（缺少 Word 正文结构）；旧版 .doc 请另存为 .docx 后上传');
  }

  var xmlBuffer;
  try {
    xmlBuffer = readEntry(buffer, documentEntry);
    // 同时读取 [Content_Types].xml，确认它是正常的 Office Open XML 包
    readEntry(buffer, contentTypes);
  } catch (e) {
    throw e;
  }

  var blocks = parseDocumentXml(xmlBuffer.toString('utf8'));
  if (!blocks.length) fail('Word 文件里没有提取到文字（可能是纯图片或空文档）');

  var text = blocks.map(blockText).filter(Boolean).join('\n\n');
  if (!text.trim()) fail('Word 文件里没有提取到文字（可能是纯图片或空文档）');

  return {
    blocks: blocks,
    text: text,
    stats: statsOf(blocks),
    warnings: []
  };
}

module.exports = { parse: parse };
