/**
 * 初见 Onboard · 条款检索与依据判定
 *
 * 打分：BM25（字段加权）+ 几个加成项，输出 0~1 的分数。
 * 判定：三道门槛决定「有依据 / 没找到 / 问法模糊」，任何一道不过都不给答案。
 */
(function (root) {
  var O = root.Onboard;
  O.nlp = O.nlp || {};

  var FIELD_ORDER = ['keywords', 'questions', 'heading', 'policyTitle', 'policyTags', 'text', 'summary'];

  function tok(text) {
    return O.nlp.tokenizer.tokenize(text).tokens;
  }

  /** 建语料库：把每一条「条款」拍平成一个可检索的文档 */
  function build(policies) {
    var list = policies || [];

    // 制度里人工整理的关键词、标题也进词典，提升口语问法的召回率
    var extra = [];
    list.forEach(function (p) {
      (p.tags || []).forEach(function (t) { extra.push(t); });
      if (p.category) extra.push(p.category);
      (p.clauses || []).forEach(function (c) {
        if (c.heading) extra.push(c.heading);
        (c.keywords || []).forEach(function (k) { extra.push(k); });
      });
    });
    O.nlp.lexicon.rebuild(extra);
    O.nlp.tokenizer.refresh();

    var docs = [];
    list.forEach(function (policy) {
      (policy.clauses || []).forEach(function (clause) {
        var fields = {
          keywords: tok((clause.keywords || []).join(' ')),
          questions: tok((clause.questions || []).join(' ')),
          heading: tok(clause.heading || ''),
          policyTitle: tok(policy.title || ''),
          policyTags: tok((policy.tags || []).join(' ')),
          text: tok(clause.text || ''),
          summary: tok(policy.summary || '')
        };

        var counts = {};
        FIELD_ORDER.forEach(function (f) {
          var map = {};
          fields[f].forEach(function (tk) {
            map[tk.canonical] = (map[tk.canonical] || 0) + 1;
          });
          counts[f] = map;
        });

        var len = fields.text.length + fields.keywords.length +
          fields.heading.length + fields.questions.length;

        docs.push({
          clauseId: clause.id,
          policyId: policy.id,
          clause: clause,
          policy: policy,
          fields: fields,
          counts: counts,
          len: len,
          textNorm: O.nlp.tokenizer.compact(clause.text || ''),
          questionForms: (clause.questions || []).map(function (q) { return O.nlp.tokenizer.compact(q); }),
          keywordForms: (clause.keywords || []).map(function (k) { return O.nlp.tokenizer.compact(k); }),
          headingForm: O.nlp.tokenizer.compact(clause.heading || ''),
          questionKeys: Object.keys(counts.questions),
          keywordKeys: Object.keys(counts.keywords)
        });
      });
    });

    var df = {};
    var vocab = {};
    docs.forEach(function (d) {
      var seen = {};
      FIELD_ORDER.forEach(function (f) {
        Object.keys(d.counts[f]).forEach(function (k) { seen[k] = true; });
      });
      d.keys = Object.keys(seen);
      d.keys.forEach(function (k) {
        df[k] = (df[k] || 0) + 1;
        vocab[k] = true;
      });
    });

    var totalLen = docs.reduce(function (a, d) { return a + d.len; }, 0);

    return {
      docs: docs,
      df: df,
      vocab: vocab,
      N: docs.length,
      avgLen: docs.length ? totalLen / docs.length : 1,
      policies: list
    };
  }

  function intersectRatio(a, b) {
    if (!a.length || !b.length) return 0;
    var setB = {};
    b.forEach(function (x) { setB[x] = true; });
    var hit = 0;
    a.forEach(function (x) { if (setB[x]) hit += 1; });
    return hit / a.length;
  }

  /** 给单个条款打分 */
  function scoreDoc(doc, q, corpus, cfg) {
    var fw = cfg.fieldWeights;
    var raw = 0;
    var matched = {};
    var tfAll = {};

    q.keys.forEach(function (key) {
      var tf = 0;
      FIELD_ORDER.forEach(function (f) {
        var c = doc.counts[f][key] || 0;
        if (c) tf += (fw[f] || 0) * c;
      });
      if (tf <= 0) return;
      tfAll[key] = tf;
      matched[key] = true;
      var df = corpus.df[key] || 1;
      var idf = Math.log(1 + (corpus.N - df + 0.5) / (df + 0.5));
      var lenNorm = 1 - cfg.bm25.b + cfg.bm25.b * (doc.len / (corpus.avgLen || 1));
      var k1 = cfg.bm25.k1;
      raw += (q.weight[key] || 1) * idf * (tf * (k1 + 1)) / (tf + k1 * lenNorm);
    });

    if (raw <= 0) return null;

    var conf = raw / (raw + cfg.bm25.normK);
    var score = conf;

    // 加成 1：问法里的业务词原样出现在条款正文里
    var phraseHit = false;
    q.conceptTokens.forEach(function (tk) {
      if (tk.t.length >= 2 && doc.textNorm.indexOf(tk.t) >= 0) { phraseHit = true; }
    });
    if (phraseHit) score += cfg.bonus.phrase;

    // 加成 2：提问用词属于已知业务概念
    score += cfg.bonus.synonym * q.conceptRatio;

    // 加成 3：与条款「常见问法」的字面相似度（最能区分同一制度下的不同条款）
    var questionSim = 0;
    doc.questionForms.forEach(function (form) {
      var s = O.nlp.tokenizer.similarity(q.compact, form);
      if (s > questionSim) questionSim = s;
    });
    score += cfg.bonus.questionSim * questionSim;

    // 加成 4：与条款关键词的字面相似度
    var keywordSim = 0;
    doc.keywordForms.forEach(function (form) {
      var s = O.nlp.tokenizer.similarity(q.compact, form);
      if (s > keywordSim) keywordSim = s;
    });
    score += cfg.bonus.keywordSim * keywordSim;

    // 加成 5：与条款小标题的字面相似度
    score += cfg.bonus.headingSim * O.nlp.tokenizer.similarity(q.compact, doc.headingForm);

    // 扣分：条款正文太短，信息量不足
    if ((doc.clause.text || '').length < cfg.minClauseLength) {
      score -= cfg.penalty.shortClause;
    }
    // 扣分：制度已废止，不能作为依据
    var inactive = doc.policy.status !== '生效中';
    if (inactive) score -= cfg.penalty.inactivePolicy;

    // 覆盖率：命中了多少个查询关键词（按词的重要程度加权）
    var denominator = q.denominatorKeys.length ? q.denominatorKeys : q.keys;
    var totalWeight = 0;
    var hitWeight = 0;
    var conceptTotal = 0;
    var conceptHit = 0;
    denominator.forEach(function (k) {
      var w = (q.keyWeights[k] && q.keyWeights[k].weight) || 1;
      totalWeight += w;
      if (matched[k]) {
        hitWeight += w;
        if (q.keyWeights[k] && q.keyWeights[k].concept) conceptHit += w;
      }
    });
    denominator.forEach(function (k) {
      if (q.keyWeights[k] && q.keyWeights[k].concept) conceptTotal += q.keyWeights[k].weight;
    });

    var coverage = totalWeight ? hitWeight / totalWeight : 0;
    var conceptCoverage = conceptTotal ? conceptHit / conceptTotal : 1;

    return {
      clause: doc.clause,
      policy: doc.policy,
      policyId: doc.policyId,
      clauseId: doc.clauseId,
      score: score,
      raw: raw,
      confidence: conf,
      coverage: coverage,
      conceptCoverage: conceptCoverage,
      questionSim: questionSim,
      keywordSim: keywordSim,
      matchedKeys: Object.keys(matched),
      inactive: inactive
    };
  }

  /** 把提问拆成打分用的结构 */
  function prepareQuery(queryText) {
    var t = O.nlp.tokenizer.tokenize(queryText);
    var keys = O.nlp.tokenizer.contentKeys(t.tokens);
    var keyWeights = O.nlp.tokenizer.contentKeyWeights(t.tokens);
    var weight = {};
    var conceptTokens = [];
    var conceptCount = 0;
    var conceptKeys = [];

    t.tokens.forEach(function (tk) {
      if (tk.role === 'stopword' || tk.role === 'generic') return;
      if (tk.t.length < 2) return;
      var cur = weight[tk.canonical] || 0;
      weight[tk.canonical] = Math.max(cur, tk.w);
      if (tk.role === 'domain' || tk.role === 'synonym') {
        conceptCount += 1;
        if (conceptTokens.indexOf(tk) < 0) conceptTokens.push(tk);
        if (conceptKeys.indexOf(tk.canonical) < 0) conceptKeys.push(tk.canonical);
      }
    });

    return {
      raw: queryText,
      compact: O.nlp.tokenizer.compact(queryText),
      tokens: t.tokens,
      keys: keys,
      keyWeights: keyWeights,
      weight: weight,
      normalized: t.normalized,
      conceptTokens: conceptTokens,
      conceptKeys: conceptKeys,
      conceptRatio: t.tokens.length ? conceptCount / Math.max(1, t.content.length) : 0,
      denominatorKeys: []
    };
  }

  /** 检索主入口 */
  function search(corpus, queryText, cfg) {
    var config = cfg || O.nlp.config;
    var q = prepareQuery(queryText);

    // 覆盖率的分母 = 提问里的全部实词。
    // 这样"只命中一个词"不会被算成命中（例如问了一句制度库里根本没有的事）。
    q.denominatorKeys = q.keys.slice();

    var scored = [];
    var inactiveHits = [];
    corpus.docs.forEach(function (doc) {
      var s = scoreDoc(doc, q, corpus, config);
      if (!s) return;
      if (s.inactive) {
        inactiveHits.push(s);
      } else {
        scored.push(s);
      }
    });

    scored.sort(function (a, b) { return b.score - a.score; });

    var top = scored[0];
    var state = 'no_evidence';
    var partialCandidates = [];

    // 把前几条命中的词合起来看：一个问题可能由不同条款分别回答
    var unionMatched = {};
    scored.slice(0, 5).forEach(function (c) {
      c.matchedKeys.forEach(function (k) { unionMatched[k] = true; });
    });
    var unionCount = Object.keys(unionMatched).length;

    var unionCoverage = 0;
    if (top) {
      var tw = 0, hw = 0;
      q.denominatorKeys.forEach(function (k) {
        var w = (q.keyWeights[k] && q.keyWeights[k].weight) || 1;
        tw += w;
        if (unionMatched[k]) hw += w;
      });
      unionCoverage = tw ? hw / tw : 0;
    }

    var gate = top && top.score >= config.absMin &&
      Math.max(top.coverage, unionCoverage) >= config.coverageMin;

    // 问题里好几个词，但整个制度库里只跟其中一个沾上边 —— 多半是问错了方向。
    // 例外：如果有某条条款的"常见问法"和你的问法几乎一样，那说明问法是对的，
    // 只是提问里的其他词在制度库里没有对应说法。
    var strongSim = 0;
    scored.slice(0, 8).forEach(function (c) {
      var s = Math.max(c.questionSim || 0, c.keywordSim || 0);
      if (s > strongSim) strongSim = s;
    });
    var onlyOneWord = q.denominatorKeys.length >= 3 && unionCount < 2 && strongSim < 0.5;

    if (gate && !onlyOneWord) {
      var conceptCount = q.conceptKeys.length;
      if (conceptCount >= 2 && top.conceptCoverage < 1) {
        // 问题里提到了好几件事，制度只覆盖了其中一部分
        state = 'partial';
        partialCandidates = pickPerConcept(scored, q.conceptKeys);
      } else {
        var second = scored[1];
        // 只有当两条规定来自不同制度、分数又很接近时，才算是"不知道你问的是哪一条"
        if (second && second.score > 0 &&
            top.policyId !== second.policyId &&
            top.score < config.relMin * second.score) {
          state = 'ambiguous';
        } else {
          state = 'hit';
        }
      }
    }

    return {
      state: state,
      query: q,
      candidates: scored,
      partialCandidates: partialCandidates,
      unionMatched: unionMatched,
      unionCount: unionCount,
      unionCoverage: unionCoverage,
      top: top || null,
      inactiveHits: inactiveHits.sort(function (a, b) { return b.score - a.score; }),
      matchedTerms: q.keys
    };
  }

  /** 提问里每个业务概念，各挑一条最贴切的条款 */
  function pickPerConcept(scored, conceptKeys) {
    var out = [];
    (conceptKeys || []).forEach(function (ck) {
      var best = null;
      scored.forEach(function (c) {
        if (c.matchedKeys.indexOf(ck) < 0) return;
        if (!best || c.score > best.score) best = c;
      });
      if (best && out.indexOf(best) < 0) out.push(best);
    });
    if (!out.length && scored.length) out.push(scored[0]);
    return out.sort(function (a, b) { return b.score - a.score; });
  }

  O.nlp.retriever = {
    build: build,
    search: search,
    prepareQuery: prepareQuery
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
