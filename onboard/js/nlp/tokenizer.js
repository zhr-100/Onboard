/**
 * 初见 Onboard · 中文分词（不依赖任何分词库）
 *
 * 思路：
 *   1. 归一化（全角转半角、去标点）
 *   2. 词典最长匹配（FMM）：业务词典里的词按长度从大到小逐位匹配
 *   3. 没匹配上的连续汉字切成二元组（bigram），英文数字整词保留
 *   4. 停用词 / 泛用词在"打分"阶段剔除，但不从归一化串里删掉
 */
(function (root) {
  var O = root.Onboard;
  O.nlp = O.nlp || {};

  var byFirst = {};
  var dictVersion = 0;
  var lastBuiltVersion = -1;

  var CJK = /[一-龥㐀-䶿]/;

  function isCjk(ch) { return CJK.test(ch); }

  /** 全角转半角、去标点、小写 */
  function normalize(text) {
    var s = String(text === null || text === undefined ? '' : text);
    s = s.replace(/[！-～]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
    });
    s = s.replace(/　/g, ' ');
    s = s.toLowerCase();
    // 只保留中文、字母、数字和少量有意义的符号
    s = s.replace(/[^一-龥㐀-䶿 a-z0-9%\/.\-]/g, ' ');
    return s.replace(/\s+/g, ' ').trim();
  }

  function rebuildIndex() {
    var dict = O.nlp.lexicon.dict;
    byFirst = {};
    Object.keys(dict).forEach(function (term) {
      var c = term.charAt(0);
      if (!byFirst[c]) byFirst[c] = [];
      byFirst[c].push(term);
    });
    Object.keys(byFirst).forEach(function (c) {
      byFirst[c].sort(function (a, b) { return b.length - a.length; });
    });
    dictVersion = Object.keys(dict).length;
    lastBuiltVersion = dictVersion;
  }

  /** 在位置 i 处匹配词典里最长的词 */
  function matchAt(s, i) {
    var candidates = byFirst[s.charAt(i)];
    if (!candidates) return null;
    for (var k = 0; k < candidates.length; k++) {
      var term = candidates[k];
      if (term.length < 2) continue;
      if (s.substr(i, term.length) === term) {
        return { term: term, len: term.length, entry: O.nlp.lexicon.dict[term] };
      }
    }
    return null;
  }

  function splitRun(run) {
    var out = [];
    var buf = '';
    var bufType = null;

    function flush() {
      if (!buf) return;
      if (bufType === 'alnum') {
        out.push({ t: buf, w: 2, type: 'word' });
      } else if (buf.length === 1) {
        out.push({ t: buf, w: 0.6, type: 'gram' });
      } else {
        for (var j = 0; j < buf.length - 1; j++) {
          out.push({ t: buf.substr(j, 2), w: 1, type: 'gram' });
        }
      }
      buf = '';
      bufType = null;
    }

    for (var i = 0; i < run.length; i++) {
      var ch = run.charAt(i);
      var type = isCjk(ch) ? 'cjk' : 'alnum';
      if (type !== bufType) {
        flush();
        bufType = type;
      }
      buf += ch;
    }
    flush();
    return out;
  }

  function pushToken(out, t, w, type, entry) {
    var role = entry ? entry.role : 'gram';
    var canonical = entry ? entry.canonical : t;
    out.push({
      t: t,
      canonical: canonical,
      w: w,
      type: type,
      role: role
    });
  }

  /**
   * 分词主函数
   * 返回 { tokens, content, normalized }
   *   tokens  —— 全部词（打分用）
   *   content —— 只保留有信息量的词（停用词/泛用词/单字已剔除），用于覆盖率与归一化
   */
  function tokenize(text) {
    if (lastBuiltVersion !== dictVersion) rebuildIndex();

    var s = normalize(text);
    var tokens = [];
    var segments = s.split(' ').filter(Boolean);

    segments.forEach(function (seg) {
      var i = 0;
      while (i < seg.length) {
        var hit = matchAt(seg, i);
        if (hit) {
          var role = hit.entry.role;
          var w = (role === 'domain' || role === 'synonym') ? 3 : 1;
          pushToken(tokens, hit.term, w, 'word', hit.entry);
          i += hit.len;
          continue;
        }
        // 收集一段连续未匹配的字符
        var run = '';
        while (i < seg.length) {
          if (matchAt(seg, i)) break;
          run += seg.charAt(i);
          i += 1;
        }
        splitRun(run).forEach(function (tk) {
          pushToken(tokens, tk.t, tk.w, tk.type, null);
        });
      }
    });

    var content = tokens.filter(function (tk) {
      if (tk.role === 'stopword' || tk.role === 'generic') return false;
      if (tk.t.length < 2) return false;
      return true;
    });

    var normalized = content.map(function (tk) { return tk.canonical; })
      .filter(function (v, idx, arr) { return arr.indexOf(v) === idx; })
      .join(' ');

    return { tokens: tokens, content: content, normalized: normalized };
  }

  /** 用于覆盖率统计的词（长度 ≥ 2、不是停用词/泛用词） */
  function contentKeys(tokens) {
    var seen = {};
    var out = [];
    tokens.forEach(function (tk) {
      if (tk.role === 'stopword' || tk.role === 'generic') return;
      if (tk.t.length < 2) return;
      var k = tk.canonical;
      if (seen[k]) return;
      seen[k] = true;
      out.push(k);
    });
    return out;
  }

  /**
   * 内容词 + 每个词的重要程度。
   * 业务概念词（年假、报销、加班…）权重 3，其余普通词权重 1。
   * 覆盖率按这个权重算，避免"只靠一个普通词"被算成命中。
   */
  function contentKeyWeights(tokens) {
    var map = {};
    tokens.forEach(function (tk) {
      if (tk.role === 'stopword' || tk.role === 'generic') return;
      if (tk.t.length < 2) return;
      var k = tk.canonical;
      var w = tk.role === 'domain' || tk.role === 'synonym' ? 3 : 1;
      if (!map[k] || map[k].weight < w) {
        map[k] = { key: k, weight: w, concept: w >= 3, raw: tk.t };
      }
    });
    return map;
  }

  /** 归一化并去掉所有空格，用于字符级比对 */
  function compact(text) {
    return normalize(text).replace(/\s+/g, '');
  }

  /** 字符二元组集合（中文里比整词比对更稳） */
  function bigrams(text) {
    var s = compact(text);
    var set = {};
    if (!s) return set;
    if (s.length === 1) { set[s] = true; return set; }
    for (var i = 0; i < s.length - 1; i++) set[s.substr(i, 2)] = true;
    return set;
  }

  /**
   * Dice 相似度：2 × 交集 ÷ (A+B 的字符二元组数量)
   * 完全一致 = 1，完全不同 = 0。
   */
  function similarity(a, b) {
    var A = bigrams(a);
    var B = bigrams(b);
    var ak = Object.keys(A);
    var bk = Object.keys(B);
    if (!ak.length || !bk.length) return 0;
    var inter = 0;
    for (var i = 0; i < ak.length; i++) {
      if (B[ak[i]]) inter += 1;
    }
    return (2 * inter) / (ak.length + bk.length);
  }

  O.nlp.tokenizer = {
    normalize: normalize,
    compact: compact,
    bigrams: bigrams,
    similarity: similarity,
    tokenize: tokenize,
    contentKeys: contentKeys,
    contentKeyWeights: contentKeyWeights,
    refresh: rebuildIndex
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
