/**
 * 检索回归测试题（虚构示例，仅用于验证检索准确率）
 * 数据集：onboard-demo-v1
 */
(function (root) {
  root.OnboardData = root.OnboardData || {};
  root.OnboardData.meta = {
    dataset: "onboard-demo-v1",
    isSample: true,
    note: "全部人员、制度、工单均为虚构示例数据，不代表任何真实企业制度",
    version: "1.0.0",
    generatedAt: "2026-06-18"
  };

  root.OnboardData.testcases = [
    {
      id: "TC-01",
      q: "年假有多少天",
      expect: "hit",
      expectClauseNo: "第 3.1 条",
      expectClauseHeading: "年假天数",
      note: "高频问题，应命中年假天数条款"
    },
    {
      id: "TC-02",
      q: "年假怎么申请，要提前几天提交",
      expect: "hit",
      expectClauseNo: "第 3.2 条",
      expectClauseHeading: "年假申请与审批",
      note: "测申请流程与提前天数"
    },
    {
      id: "TC-03",
      q: "剩余年假能结转到明年吗",
      expect: "hit",
      expectClauseNo: "第 3.1 条",
      expectClauseHeading: "年假天数",
      note: "测结转规则，关键词为剩余年假"
    },
    {
      id: "TC-04",
      q: "怎么请病假，需要交什么证明",
      expect: "hit",
      expectClauseNo: "第 4.2 条",
      expectClauseHeading: "请假类型与天数",
      note: "测病假申请与证明材料"
    },
    {
      id: "TC-05",
      q: "病假期间的工资怎么发",
      expect: "hit",
      expectClauseNo: "第 5.1 条",
      expectClauseHeading: "请假期间工资与出勤",
      note: "测请假期间工资标准"
    },
    {
      id: "TC-06",
      q: "上班打卡时间是几点到几点",
      expect: "hit",
      expectClauseNo: "第 2.1 条",
      expectClauseHeading: "工作时间与班次",
      note: "测工作时间与弹性到岗"
    },
    {
      id: "TC-07",
      q: "迟到一次会被扣多少钱",
      expect: "hit",
      expectClauseNo: "第 3.1 条",
      expectClauseHeading: "迟到、早退与漏打卡",
      note: "测迟到处理标准"
    },
    {
      id: "TC-08",
      q: "忘记打卡了怎么补卡",
      expect: "hit",
      expectClauseNo: "第 3.3 条",
      expectClauseHeading: "考勤异常申诉与补卡",
      note: "测补卡申诉流程"
    },
    {
      id: "TC-09",
      q: "加班费怎么算",
      expect: "hit",
      expectClauseNo: "第 3.2 条",
      expectClauseHeading: "工作日加班与加班费",
      note: "测工作日加班费倍数"
    },
    {
      id: "TC-10",
      q: "周末加班是双倍还是能换成调休",
      expect: "hit",
      expectClauseNo: "第 3.3 条",
      expectClauseHeading: "休息日与法定节假日加班",
      note: "测休息日加班与调休的取舍"
    },
    {
      id: "TC-11",
      q: "调休有没有时间限制，过期了还能用吗",
      expect: "hit",
      expectClauseNo: "第 4.1 条",
      expectClauseHeading: "调休规则与有效期",
      note: "测调休有效期"
    },
    {
      id: "TC-12",
      q: "试用期最长是几个月",
      expect: "hit",
      expectClauseNo: "第 3.1 条",
      expectClauseHeading: "试用期时长",
      note: "测试用期长度上限"
    },
    {
      id: "TC-13",
      q: "试用期工资打几折",
      expect: "hit",
      expectClauseNo: "第 3.2 条",
      expectClauseHeading: "试用期薪酬",
      note: "测试用期工资下限"
    },
    {
      id: "TC-14",
      q: "每月几号发工资",
      expect: "hit",
      expectClauseNo: "第 3.2 条",
      expectClauseHeading: "发薪日",
      note: "测发薪日"
    },
    {
      id: "TC-15",
      q: "工资条在哪里可以查看",
      expect: "hit",
      expectClauseNo: "第 3.3 条",
      expectClauseHeading: "工资条与个税查询",
      note: "测工资条与个税查询入口"
    },
    {
      id: "TC-16",
      q: "出差住宿标准是多少",
      expect: "hit",
      expectClauseNo: "第 3.3 条",
      expectClauseHeading: "差旅费标准",
      note: "测差旅住宿与餐补标准"
    },
    {
      id: "TC-17",
      q: "报销的发票抬头要怎么写",
      expect: "hit",
      expectClauseNo: "第 3.2 条",
      expectClauseHeading: "发票与凭证要求",
      note: "测发票抬头与凭证要求"
    },
    {
      id: "TC-18",
      q: "入职需要准备哪些材料",
      expect: "hit",
      expectClauseNo: "第 3.2 条",
      expectClauseHeading: "入职材料清单",
      note: "测入职材料清单"
    },
    {
      id: "TC-19",
      q: "工牌丢了怎么挂失补办",
      expect: "hit",
      expectClauseNo: "第 3.1 条",
      expectClauseHeading: "工牌管理与挂失",
      note: "测工牌挂失与补办"
    },
    {
      id: "TC-20",
      q: "公司代码可以带回家继续写吗",
      expect: "hit",
      expectClauseNo: "第 3.5 条",
      expectClauseHeading: "办公设备与资产",
      note: "测代码与设备带离办公场所的限制"
    },
    {
      id: "TC-21",
      q: "公司停车场怎么用",
      expect: "no_evidence",
      note: "制度库中没有停车场管理规定，应返回无依据"
    },
    {
      id: "TC-22",
      q: "健身房几点关门",
      expect: "no_evidence",
      note: "制度库中没有健身房管理规定，应返回无依据"
    },
    {
      id: "TC-23",
      q: "宠物能带进办公室吗",
      expect: "no_evidence",
      note: "制度库中没有宠物管理规定，应返回无依据"
    },
    {
      id: "TC-24",
      q: "食堂有素食吗",
      expect: "no_evidence",
      note: "制度库中没有食堂管理规定，应返回无依据"
    },
    {
      id: "TC-25",
      q: "附近哪里有停车场",
      expect: "no_evidence",
      note: "制度库中不涉及周边位置信息，应返回无依据"
    },
    {
      id: "TC-26",
      q: "过生日会准备礼物吗",
      expect: "no_evidence",
      note: "制度库中没有员工关怀管理规定，应返回无依据"
    },
    {
      id: "TC-27",
      q: "可以养猫吗",
      expect: "no_evidence",
      note: "制度库中没有饲养管理规定，应返回无依据"
    },
    {
      id: "TC-28",
      q: "屋里太闷窗户能打开通风吗",
      expect: "no_evidence",
      note: "制度库中没有办公环境管理规定，应返回无依据"
    },
    {
      id: "TC-29",
      q: "楼下车位紧张怎么解决",
      expect: "no_evidence",
      note: "制度库中没有停车位管理规定，应返回无依据"
    },
    {
      id: "TC-30",
      q: "上下班有班车接送吗",
      expect: "no_evidence",
      note: "制度库中没有班车管理规定，应返回无依据"
    },
    {
      id: "TC-31",
      q: "年假和调休有什么不一样，可以先休调休再休年假吗",
      expect: "partial",
      note: "同时问了年假和调休两件事，制度里没有一条直接说明两者区别，应分别给出两条相关条款并说明没有完整覆盖"
    },
    {
      id: "TC-32",
      q: "离职要办什么手续",
      expect: "ambiguous",
      note: "离职手续分散在两套不同的制度里且分数接近，需要向员工澄清问的是哪一条"
    }
  ];
})(typeof globalThis !== 'undefined' ? globalThis : this);
