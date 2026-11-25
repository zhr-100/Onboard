/**
 * 初见 Onboard · 答案拼装
 *
 * 原则：答案里的每一句话都来自制度原文，不做自由发挥。
 * 只有三种结果 —— 有依据 / 没找到 / 问法模糊，任何一种都不给"编出来的规定"。
 */
(function (root) {
  var O = root.Onboard;
  O.nlp = O.nlp || {};

  // 只按句号、问号、感叹号断句。
  // 分号不断 —— 「满 1 年 10 天；满 3 年 15 天」是一整条规则，拆开就答不对题了。
  var SENTENCE_DELIMITERS = '。！？!?\n';

  /** 切句，保留句末标点 */
  function splitSentences(text) {
    var out = [];
    var buf = '';
    var s = String(text || '');
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      buf += ch;
      if (SENTENCE_DELIMITERS.indexOf(ch) >= 0) {
        var t = buf.trim();
        if (t) out.push(t);
        buf = '';
      }
    }
    var rest = buf.trim();
    if (rest) out.push(rest);
    return out;
  }

  /**
   * 从条款原文里挑出最相关的几句话
   * 返回 { conclusion, bullets, excerpt }
   *
   * 判定规则：
   *   制度条款通常「第一句就是规则本身」，所以默认用第一句当结论；
   *   但如果后面某一句明显更贴合你的问题（命中更多），就用那句当结论。
   */
  function extract(text, needleKeys, maxTotal) {
    var parts = splitSentences(text);
    if (!parts.length) return { conclusion: '', bullets: [], excerpt: '' };

    var set = {};
    (needleKeys || []).forEach(function (k) { set[k] = true; });

    var scored = parts.map(function (s, i) {
      var hit = 0;
      O.nlp.tokenizer.tokenize(s).tokens.forEach(function (tk) {
        if (tk.role === 'stopword' || tk.role === 'generic') return;
        if (tk.t.length < 2) return;
        if (set[tk.canonical] || set[tk.t]) hit += 1;
      });
      return { s: s, i: i, hit: hit };
    });

    var maxHit = scored.reduce(function (m, x) { return Math.max(m, x.hit); }, 0);
    var conclusionIdx = 0;
    if (maxHit > scored[0].hit) {
      for (var i = 0; i < scored.length; i++) {
        if (scored[i].hit === maxHit) { conclusionIdx = i; break; }
      }
    }

    // 摘录：结论 + 其余命中较高的句子，保持原文顺序
    var chosen = [conclusionIdx];
    var byHit = scored.slice().sort(function (a, b) {
      if (b.hit !== a.hit) return b.hit - a.hit;
      return a.i - b.i;
    });
    byHit.forEach(function (x) {
      if (chosen.length >= Math.max(1, maxTotal)) return;
      if (chosen.indexOf(x.i) < 0) chosen.push(x.i);
    });
    chosen.sort(function (a, b) { return a - b; });

    return {
      conclusion: scored[conclusionIdx].s,
      bullets: chosen.filter(function (i) { return i !== conclusionIdx; })
        .map(function (i) { return scored[i].s; }),
      excerpt: chosen.map(function (i) { return scored[i].s; }).join('')
    };
  }

  function makeCitation(candidate, cfg, fallbackKeys) {
    var clause = candidate.clause;
    var policy = candidate.policy;
    var keys = (candidate.matchedKeys && candidate.matchedKeys.length)
      ? candidate.matchedKeys
      : (fallbackKeys || []);
    var picked = extract(clause.text || '', keys, cfg.maxExcerptSentences);
    return {
      policyId: policy.id,
      policyCode: policy.code,
      policyTitle: policy.title,
      policyCategory: policy.category,
      policyOwner: policy.owner,
      version: policy.version,
      effectiveDate: policy.effectiveDate,
      clauseId: clause.id,
      clauseNo: clause.no,
      clauseHeading: clause.heading,
      excerpt: picked.excerpt,
      fullText: clause.text,
      score: Math.round(candidate.score * 100) / 100,
      coverage: Math.round(candidate.coverage * 100) / 100,
      // 基线制度来自示例数据；知识库上传的制度自己带来源标记
      source: policy.source || '示例制度库'
    };
  }

  /**
   * 主入口
   * opts: { query, intent, search }
   */
  function build(opts) {
    var cfg = O.nlp.config;
    var query = opts.query;
    var intent = opts.intent || 'policy';
    var search = opts.search;
    var fallbackKeys = (search.query && search.query.keys) || [];

    if (intent === 'chitchat') {
      return {
        state: 'chitchat',
        text: '你好，我是初见助手，可以帮你查公司制度、假期规定和报销流程。有什么想问的，直接说就行。',
        bullets: [],
        citations: [],
        candidates: [],
        matchedTerms: [],
        confidence: 1,
        handoffToHuman: false,
        hint: ''
      };
    }

    if (intent === 'handoff') {
      return {
        state: 'handoff',
        text: '好的，我已经准备好转人工了。请在下面补充一句你的问题，HR 同事会尽快回复你。',
        bullets: [],
        citations: [],
        candidates: [],
        matchedTerms: [],
        confidence: 1,
        handoffToHuman: true,
        hint: ''
      };
    }

    if (search.state === 'hit') {
      var top = search.top;
      var citations = search.candidates.slice(0, cfg.topK).map(function (c) {
        return makeCitation(c, cfg, fallbackKeys);
      });
      var topCitation = citations[0];
      var picked = extract(top.clause.text || '', top.matchedKeys || fallbackKeys, cfg.maxExcerptSentences);

      var text = '根据《' + topCitation.policyTitle + '》（' + topCitation.version +
        '）' + topCitation.clauseNo + '「' + topCitation.clauseHeading + '」：' + picked.conclusion;

      var bullets = picked.bullets.slice(0, cfg.maxBullets);
      var hint = '';
      if (intent === 'leave') {
        hint = '以上是公司制度里的规则。查询你个人还有多少天年假的功能将在下一步上线。';
      }

      return {
        state: 'hit',
        text: text,
        bullets: bullets,
        citations: citations,
        candidates: [],
        matchedTerms: search.matchedTerms,
        confidence: Math.round(top.score * 100) / 100,
        coverage: Math.round(top.coverage * 100) / 100,
        handoffToHuman: false,
        hint: hint,
        disclaimer: '如与你的具体情况有关，请联系 HR 确认。'
      };
    }

    if (search.state === 'partial') {
      var partials = (search.partialCandidates || []).map(function (c) {
        return makeCitation(c, cfg, fallbackKeys);
      });
      // 问题里提到、但制度没有覆盖到的业务概念
      var covered = {};
      partials.forEach(function (p) { covered[p.clauseId] = true; });
      var missing = [];
      (search.query.conceptTokens || []).forEach(function (tk) {
        if (missing.indexOf(tk.t) < 0) missing.push(tk.t);
      });
      var missingText = missing.length
        ? '你问题里提到的「' + missing.join('、') + '」，我在现行制度里没有找到对应条款。'
        : '';

      return {
        state: 'partial',
        text: '我找到了和你这个问题相关的 ' + partials.length + ' 条规定，但制度里没有一条能完整回答你的整个问题。',
        bullets: [],
        citations: partials,
        candidates: [],
        matchedTerms: search.matchedTerms,
        confidence: Math.round(search.top.score * 100) / 100,
        handoffToHuman: true,
        hint: missingText + '下面是可以逐字核对的条款；没覆盖到的部分，建议直接转给 HR 确认。'
      };
    }

    if (search.state === 'ambiguous') {
      var cands = search.candidates.slice(0, 3).map(function (c) {
        var cit = makeCitation(c, cfg, fallbackKeys);
        return {
          policyId: cit.policyId,
          policyCode: cit.policyCode,
          policyTitle: cit.policyTitle,
          policyCategory: cit.policyCategory,
          policyOwner: cit.policyOwner,
          effectiveDate: cit.effectiveDate,
          source: cit.source,
          version: cit.version,
          clauseNo: cit.clauseNo,
          clauseHeading: cit.clauseHeading,
          excerpt: cit.excerpt,
          fullText: cit.fullText,
          clauseId: cit.clauseId,
          matchedKeys: c.matchedKeys,
          score: cit.score
        };
      });
      return {
        state: 'ambiguous',
        text: '我找到了几条可能相关的规定，但不确定你问的是哪一条，麻烦你确认一下：',
        bullets: [],
        citations: [],
        candidates: cands,
        matchedTerms: search.matchedTerms,
        confidence: Math.round(search.top.score * 100) / 100,
        handoffToHuman: true,
        hint: ''
      };
    }

    // 没找到
    var note = '为了不给你不准确的信息，没有查到相关规定的部分我不会凭猜测回答。';
    if (search.inactiveHits && search.inactiveHits.length) {
      var ih = search.inactiveHits[0];
      note = '另外，检索到《' + ih.policy.title + '》里有相近的条款，但该制度当前状态是「' +
        ih.policy.status + '」，不能作为依据。';
    }

    return {
      state: 'no_evidence',
      text: '抱歉，我在现行制度里没有找到能回答这个问题的条款。',
      bullets: [],
      citations: [],
      candidates: [],
      matchedTerms: search.matchedTerms,
      confidence: Math.round((search.top ? search.top.score : 0) * 100) / 100,
      handoffToHuman: true,
      hint: note,
      extraNote: ''
    };
  }

  /** 用户在"问法模糊"里点了某一条候选后，直接把这一条作为依据给出答案 */
  function buildForCandidate(candidate, search, opts) {
    var cfg = O.nlp.config;
    var fallbackKeys = (search.query && search.query.keys) || [];
    var citation = makeCitation(candidate, cfg, fallbackKeys);
    var picked = extract(candidate.clause.text || '',
      candidate.matchedKeys || fallbackKeys, cfg.maxExcerptSentences);
    return {
      state: 'hit',
      text: '根据《' + citation.policyTitle + '》（' + citation.version + '）' +
        citation.clauseNo + '「' + citation.clauseHeading + '」：' + picked.conclusion,
      bullets: picked.bullets.slice(0, cfg.maxBullets),
      citations: [citation],
      candidates: [],
      matchedTerms: search.matchedTerms,
      confidence: Math.round(candidate.score * 100) / 100,
      handoffToHuman: false,
      hint: '',
      disclaimer: '如与你的具体情况有关，请联系 HR 确认。'
    };
  }

  O.nlp.answerer = {
    build: build,
    buildForCandidate: buildForCandidate,
    splitSentences: splitSentences,
    extract: extract
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
