/**
 * 初见 Onboard · 检索参数
 *
 * 所有阈值集中在这里，运营后台（第 4 步）可以直接调整并用历史日志回放对比。
 */
(function (root) {
  var O = root.Onboard;
  O.nlp = O.nlp || {};

  var DEFAULT = {
    /** 绝对门槛：最高分低于此值 → 判定「没找到」 */
    absMin: 0.42,
    /** 相对门槛：最高分 < 次高分 × 该系数 → 判定「问法模糊」 */
    relMin: 1.15,
    /** 覆盖率门槛：命中词 / 提问实词（按词的重要程度加权）低于此值 → 判定「没找到」 */
    coverageMin: 0.38,
    /** 最多给几条依据 */
    topK: 3,

    bm25: { k1: 1.5, b: 0.6, normK: 1.8 },

    /** 字段权重：条款里哪个字段命中更可信 */
    fieldWeights: {
      keywords: 3.0,
      questions: 2.6,
      heading: 2.4,
      policyTitle: 1.6,
      policyTags: 1.4,
      text: 1.0,
      summary: 0.8
    },

    /**
     * 加成项。除了基于词的 BM25，还用「字符二元组相似度」来比对：
     * 中文里同一个意思往往有多种说法（"有几天" / "有多少天"），
     * 比字符片段比比分词更稳，也不需要任何分词库。
     */
    bonus: {
      phrase: 0.30,        // 问法里的业务词原样出现在条款正文
      synonym: 0.15,       // 提问用词属于已知业务概念
      questionSim: 0.55,   // 与条款「常见问法」的字面相似度
      keywordSim: 0.35,    // 与条款关键词的字面相似度
      headingSim: 0.12     // 与条款小标题的字面相似度
    },

    penalty: {
      shortClause: 0.10,   // 条款正文过短，信息量不足
      inactivePolicy: 0.50 // 制度已废止
    },

    minClauseLength: 20,  // 少于这个字数的条款扣分
    maxExcerptSentences: 3,
    maxBullets: 2
  };

  var config = JSON.parse(JSON.stringify(DEFAULT));

  function loadOverride() {
    try {
      var raw = root.localStorage && root.localStorage.getItem('onboard.v1.retrievalConfig');
      if (!raw) return false;
      var saved = JSON.parse(raw);
      for (var k in saved) {
        if (Object.prototype.hasOwnProperty.call(saved, k) && DEFAULT[k] !== undefined) {
          config[k] = saved[k];
        }
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function saveOverride(partial) {
    try {
      if (!root.localStorage) return false;
      root.localStorage.setItem('onboard.v1.retrievalConfig', JSON.stringify(partial));
      for (var k in partial) {
        if (Object.prototype.hasOwnProperty.call(partial, k)) config[k] = partial[k];
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function resetOverride() {
    try {
      if (root.localStorage) root.localStorage.removeItem('onboard.v1.retrievalConfig');
    } catch (e) { /* ignore */ }
    config = JSON.parse(JSON.stringify(DEFAULT));
  }

  O.nlp.config = config;
  O.nlp.configApi = {
    DEFAULT: DEFAULT,
    loadOverride: loadOverride,
    saveOverride: saveOverride,
    resetOverride: resetOverride
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
