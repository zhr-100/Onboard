/**
 * 初见 Onboard · 业务词典
 *
 * 没有分词库，靠这张表把员工的口语问法映射到统一的业务概念上。
 * 三个列表：
 *   stopwords   —— 提问里没有信息量的词（"请问""怎么"），打分时剔除
 *   genericTerms —— 泛用词（"流程""申请"），不算数、不参与覆盖率统计
 *   domainTerms —— 业务词，每个词本身就是一个概念
 *   synonymGroups —— 同义概念组，组内任一说法都指向 canonical
 */
(function (root) {
  var O = root.Onboard;
  O.nlp = O.nlp || {};

  var stopwords = [
    '的', '了', '吗', '呢', '吧', '啊', '呀', '哦', '嗯', '哈',
    '请问', '想问', '想了解', '咨询', '问一下', '一下', '我想问', '我想知道', '我想了解',
    '我们', '咱们', '公司', '你们', '他们',
    '怎么', '如何', '什么', '哪些', '哪个', '多少', '几个', '几天', '几天时间', '几点', '几号',
    '可以', '能不能', '是否', '能否', '可以吗', '有没有', '是不是',
    '为什么', '为啥', '咋', '怎样',
    '是', '有', '在', '和', '与', '或', '都', '也', '还', '就', '要', '会', '能', '给',
    '我', '你', '他', '她', '它', '咱', '的',
    '现在', '目前', '目前', '今天', '明天', '昨天',
    '规定', '制度', '政策', '条款', '标准', '要求', '办法', '流程', '手续',
    '申请', '办理', '相关', '有关', '情况', '问题', '内容', '信息', '方式',
    '需要', '应该', '必须', '可以的话', '如果', '这个', '那个', '一下的'
  ];

  var genericTerms = [
    '流程', '手续', '规定', '制度', '政策', '条款', '标准', '要求', '办法',
    '申请', '办理', '相关', '有关', '情况', '问题', '内容', '信息', '方式',
    '时间', '日期', '地点', '地方', '东西', '人员', '部分', '以下', '以上',
    '具体', '详细', '怎么', '如何', '多少', '几天', '几个'
  ];

  var domainTerms = [
    '年假', '年休假', '调休', '加班', '加班费', '考勤', '打卡', '迟到', '早退', '旷工',
    '产假', '陪产假', '陪产', '婚假', '丧假', '病假', '事假', '法定假日', '公众假期',
    '社保', '公积金', '五险一金', '商业保险', '补充医疗',
    '试用期', '转正', '离职', '辞职', '离职证明', '解除劳动合同',
    '报销', '发票', '差旅', '差旅费', '出差', '费用', '补贴', '津贴', '年终奖',
    '工资', '薪资', '薪酬', '发薪日', '绩效', '考核', '提成',
    '合同', '劳动合同', '保密', '竞业', '培训', '内部转岗', '晋升',
    '工牌', '门禁', '邮箱', 'VPN', '账号', '权限', 'VPN账号', 'IT服务台',
    '福利', '体检', '团建', '工位', '班车', '停车', '食堂',
    '入职', '报到', '入职手续', '入职材料', '转正答辩', '导师', '试用期考核',
    '转人工', '人工客服', '找HR', '找hr'
  ];

  var synonymGroups = [
    { canonical: '年假', variants: ['年休假', '带薪年假', '年假天数', '休假天数', '剩余年假', '年休', 'annual leave', '年假余额', '还有几天年假', '年假有几天'] },
    { canonical: '结转', variants: ['跨年结转', '年假结转', '结转年假', '跨年用', '能不能跨年', '过期作废', '作废'] },
    { canonical: '调休', variants: ['调休假', '倒休', '补休', '调休申请'] },
    { canonical: '产假', variants: ['产假工资', '生育假', '生育津贴', '产假待遇', '哺乳假'] },
    { canonical: '陪产假', variants: ['陪产', '陪产假天数', '陪产假期'] },
    { canonical: '婚假', variants: ['结婚假', '婚礼假'] },
    { canonical: '病假', variants: ['请病假', '生病请假', '病假申请', '医疗期'] },
    { canonical: '事假', variants: ['请事假', '事假申请', '个人事假'] },
    { canonical: '加班', variants: ['加班费', '加班申请', '加班调休', '加班工资', '加班费怎么算'] },
    { canonical: '考勤', variants: ['打卡', '考勤打卡', '打卡记录', '迟到早退', '旷工'] },
    { canonical: '社保', variants: ['五险一金', '社保公积金', '社会保险', '养老保险', '医疗保险'] },
    { canonical: '公积金', variants: ['住房公积金', '公积金比例'] },
    { canonical: '试用期', variants: ['试用期中', '试用期时长', '试用期考核', '试用期工资'] },
    { canonical: '转正', variants: ['转正流程', '转正申请', '转正答辩', '提前转正'] },
    { canonical: '离职', variants: ['辞职', '离职手续', '离职流程', '离职证明', '离职通知'] },
    { canonical: '报销', variants: ['费用报销', '报账', '发票报销', '差旅报销', '费用申请', '报销单'] },
    { canonical: '差旅', variants: ['出差', '差旅费', '差旅标准', '住宿标准', '出差报销'] },
    { canonical: '薪酬', variants: ['工资', '薪资', '薪水', '薪酬结构', '薪酬体系'] },
    { canonical: '发薪日', variants: ['什么时候发工资', '几号发工资', '发工资日期'] },
    { canonical: '年终奖', variants: ['年终奖发放', '十三薪', '年终奖金'] },
    { canonical: '入职', variants: ['报到', '入职手续', '新员工', '入职流程', '入职材料', '入职办理'] },
    { canonical: '合同', variants: ['劳动合同', '签合同', '合同签署', '合同续签'] },
    { canonical: '保密', variants: ['保密协议', '保密义务', '竞业限制', '竞业协议'] },
    { canonical: '培训', variants: ['培训课程', '内部培训', '报销培训费'] },
    { canonical: '绩效', variants: ['绩效考核', '绩效评估', '绩效面谈', '打分'] },
    { canonical: '工牌', variants: ['工牌挂失', '挂失工牌', '补办工牌', '工牌转借', '刷卡', '工卡'] },
    { canonical: '门禁', variants: ['门禁卡', '门禁权限', '门禁开通', '刷不开门禁', '调岗权限'] },
    { canonical: '邮箱', variants: ['企业邮箱', '邮件账号', '邮箱权限'] },
    { canonical: 'VPN', variants: ['vpn账号', '远程办公', '远程访问', 'vpn申请'] },
    { canonical: '账号权限', variants: ['系统权限', '账号申请', '开通权限', '权限申请'] },
    { canonical: '福利', variants: ['员工福利', '福利有哪些', '公司福利'] },
    { canonical: '体检', variants: ['年度体检', '体检安排', '健康体检'] },
    { canonical: '班车站点', variants: ['班车', '通勤班车', '班车时间'] },
    { canonical: '停车位', variants: ['停车', '车位申请', '停车场'] },
    { canonical: '食堂', variants: ['员工餐厅', '餐补', '饭补'] },
    { canonical: '转人工', variants: ['人工客服', '找hr', '找人力资源', '转人工服务', '人工服务'] },
    { canonical: '满1年', variants: ['满一年', '满1年工龄', '入职满一年'] },
    { canonical: '满3年', variants: ['满三年', '满3年工龄', '入职满三年'] },
    { canonical: '满5年', variants: ['满五年', '满5年工龄', '入职满五年'] }
  ];

  var dict = {};
  var canonicalMap = {};
  var groupMap = {};

  function addTerm(term, entry) {
    if (!term) return;
    var t = String(term).toLowerCase().trim();
    if (!t || t.length < 2) return;
    if (dict[t]) return;
    dict[t] = entry;
  }

  function rebuild(extraTerms) {
    dict = {};
    canonicalMap = {};
    groupMap = {};

    // 先建同义词组：组里的所有说法统一指向 canonical。
    // 顺序很重要 —— 「年休假」既在业务词表里、又是「年假」组的成员，
    // 必须让同义组的 canonical 生效，否则「年假」和「年休假」会变成两个不同的键。
    synonymGroups.forEach(function (g) {
      groupMap[g.canonical] = g.canonical;
      var all = [g.canonical].concat(g.variants || []);
      all.forEach(function (v) {
        var key = String(v).toLowerCase().trim();
        if (key.length < 2) return;
        // 同一个说法只允许属于一个概念，否则检索时会把两个主题混成一个词
        if (dict[key] && dict[key].group !== g.canonical && dict[key].role === 'synonym') {
          console.warn('[词典] 「' + key + '」同时出现在「' + dict[key].group + '」和「' + g.canonical + '」里，已归到「' + g.canonical + '」');
        }
        dict[key] = { term: key, canonical: g.canonical, group: g.canonical, role: 'synonym' };
        canonicalMap[key] = g.canonical;
        groupMap[key] = g.canonical;
      });
    });

    domainTerms.forEach(function (t) {
      var key = t.toLowerCase();
      if (dict[key]) return;
      dict[key] = { term: key, canonical: key, group: key, role: 'domain' };
      canonicalMap[key] = key;
      groupMap[key] = key;
    });

    stopwords.forEach(function (t) {
      var key = String(t).toLowerCase().trim();
      if (key.length < 2) return;
      if (!dict[key]) dict[key] = { term: key, canonical: key, group: key, role: 'stopword' };
    });

    genericTerms.forEach(function (t) {
      var key = String(t).toLowerCase().trim();
      if (key.length < 2) return;
      if (!dict[key]) dict[key] = { term: key, canonical: key, group: key, role: 'generic' };
    });

    // 制度数据里人工整理的关键词 / 标题也进词典，提高口语问法的召回
    (extraTerms || []).forEach(function (t) {
      var key = String(t).toLowerCase().trim();
      if (key.length < 2) return;
      if (!dict[key]) dict[key] = { term: key, canonical: key, group: key, role: 'domain' };
    });
  }

  rebuild([]);

  O.nlp.lexicon = {
    stopwords: stopwords,
    genericTerms: genericTerms,
    domainTerms: domainTerms,
    synonymGroups: synonymGroups,
    rebuild: rebuild,
    get dict() { return dict; },
    isStopword: function (term) {
      var e = dict[String(term).toLowerCase()];
      return !!(e && e.role === 'stopword');
    },
    isGeneric: function (term) {
      var e = dict[String(term).toLowerCase()];
      return !!(e && e.role === 'generic');
    },
    canonicalOf: function (term) {
      var e = dict[String(term).toLowerCase()];
      if (e) return e.canonical;
      return canonicalMap[String(term).toLowerCase()] || String(term).toLowerCase();
    },
    isKnownConcept: function (term) {
      var e = dict[String(term).toLowerCase()];
      return !!(e && (e.role === 'domain' || e.role === 'synonym'));
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
