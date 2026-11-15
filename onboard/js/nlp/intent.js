/**
 * 初见 Onboard · 意图识别（规则优先，不需要大模型）
 */
(function (root) {
  var O = root.Onboard;
  O.nlp = O.nlp || {};

  var HANDOFF = /(转人工|人工客服|人工服务|真人|找\s*hr|找人力资源|客服|投诉|举报)/i;

  var LEAVE = [
    /我(还|到底)?(有|剩|能用|还能用|能休)/,
    /(还剩|剩余|剩)(多少|几)(天|小时)?(的)?(年假|假期|假)/,
    /我的(年假|假期)(余额|还剩|剩多少|能休)/,
    /我有(多少|几)(天)?(年假|假|假期)/,
    /(年假|假期)(余额|还剩)(是)?(多少|几)/,
    /我(的)?年假(还剩|余额)/
  ];

  var CHITCHAT = /^(你好|您好|嗨|hi|hello|在吗|早上好|下午好|晚上好|谢谢|谢谢啦|辛苦|拜拜)[?？。！!\s~～]*$/i;

  function detect(text) {
    var s = String(text || '').trim();
    if (!s) return 'policy';
    if (HANDOFF.test(s)) return 'handoff';
    for (var i = 0; i < LEAVE.length; i++) {
      if (LEAVE[i].test(s)) return 'leave';
    }
    if (CHITCHAT.test(s)) return 'chitchat';
    return 'policy';
  }

  O.nlp.intent = { detect: detect };
})(typeof globalThis !== 'undefined' ? globalThis : this);
