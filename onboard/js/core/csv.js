/**
 * 初见 Onboard · CSV 解析与生成（零依赖）
 *
 * 支持日常够用的那一档：引号包裹、引号转义（""）、字段内逗号/换行、
 * CRLF / LF / CR 换行、UTF-8 BOM。整行空白的行会被忽略。
 */
(function (root) {
  var O = root.Onboard;

  var BOM = '﻿';

  function stripBom(text) {
    text = String(text === null || text === undefined ? '' : text);
    return text.charAt(0) === BOM ? text.slice(1) : text;
  }

  /** 把 CSV 文本解析成二维数组 rows[行][列]，全部是字符串 */
  function parse(text) {
    var src = stripBom(text);
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    var i = 0;

    while (i < src.length) {
      var ch = src.charAt(i);

      if (inQuotes) {
        if (ch === '"') {
          if (src.charAt(i + 1) === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += ch; i++; continue;
      }

      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ',') { row.push(field); field = ''; i++; continue; }
      if (ch === '\r' || ch === '\n') {
        row.push(field); field = '';
        rows.push(row); row = [];
        if (ch === '\r' && src.charAt(i + 1) === '\n') i++;
        i++; continue;
      }
      field += ch; i++;
    }
    if (field !== '' || row.length) {
      row.push(field);
      rows.push(row);
    }

    // 丢掉整行都是空白的行（比如表尾多敲的回车）
    return rows.filter(function (r) {
      return r.some(function (c) { return String(c).trim() !== ''; });
    });
  }

  /** 字段按需加引号 */
  function quote(value) {
    var s = String(value === null || value === undefined ? '' : value);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  /** 生成 CSV 文本（不含 BOM；给 Excel 用时由调用方在开头加 BOM） */
  function stringify(rows) {
    return rows.map(function (row) {
      return row.map(quote).join(',');
    }).join('\r\n');
  }

  O.csv = {
    BOM: BOM,
    parse: parse,
    stringify: stringify
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
