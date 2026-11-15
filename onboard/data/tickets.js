/**
 * 示例历史工单数据（虚构示例，仅用于演示，不对应任何真实工单）
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

  root.OnboardData.tickets = [
    {
      id: "TK-20260608-0001",
      employeeId: "E1007",
      employeeName: "吴宇",
      title: "试用期入职第一天忘记打卡，可以补卡吗",
      category: "考勤管理",
      source: "员工转人工",
      question: "我是上周入职的，试用期第一天忘记打卡了，还能补卡吗？会不会被算成旷工？",
      aiSummary: "已命中《考勤与打卡管理规定》第 3.3 条：忘记打卡可在 2 个自然日内提交补卡申请，每月不超过 3 次。",
      status: "已解决",
      priority: "普通",
      assignee: "HR-周颖",
      createdAt: "2026-06-08T09:26:00+08:00",
      updatedAt: "2026-06-08T16:05:00+08:00",
      dueAt: "2026-06-09T18:00:00+08:00",
      channel: "网页",
      resolution: "已引导员工在 OA 提交补卡申请并附情况说明，主管确认属实，该次缺卡不计入迟到早退统计。",
      linkedQuestionIds: ["QLOG-20260608-0001"],
      rating: 5,
      messages: [
        {
          id: "M1",
          authorType: "employee",
          authorName: "吴宇",
          content: "我是上周入职的，试用期第一天忘记打卡了，还能补卡吗？会不会被算成旷工？",
          at: "2026-06-08T09:26:00+08:00",
          visibleToEmployee: true
        },
        {
          id: "M2",
          authorType: "system",
          authorName: "系统",
          content: "已创建工单并通知 HR-周颖",
          at: "2026-06-08T09:26:05+08:00",
          visibleToEmployee: false
        },
        {
          id: "M3",
          authorType: "hr",
          authorName: "HR-周颖",
          content: "您好，忘记打卡可以在 OA 提交补卡申请，写明原因并由主管确认即可，不会算作旷工。您方便的话我现在把操作步骤发给您。",
          at: "2026-06-08T10:12:00+08:00",
          visibleToEmployee: true
        },
        {
          id: "M4",
          authorType: "hr",
          authorName: "HR-周颖",
          content: "内部备注：该员工入职首日尚未完成考勤周期登记，已同步提醒入职专员补录转正前考勤信息。",
          at: "2026-06-08T10:15:00+08:00",
          visibleToEmployee: false
        },
        {
          id: "M5",
          authorType: "system",
          authorName: "系统",
          content: "工单已解决",
          at: "2026-06-08T16:05:00+08:00",
          visibleToEmployee: false
        }
      ]
    },
    {
      id: "TK-20260609-0002",
      employeeId: "E1011",
      employeeName: "马丽",
      title: "报销发票抬头写错了，还能报销吗",
      category: "报销与差旅",
      source: "员工转人工",
      question: "上个月客户那边的发票抬头写成了旧公司名称，这个月还能提交报销吗？需要重开吗？",
      aiSummary: "已命中《报销与差旅费管理规定》第 3.2 条：发票抬头须与公司全称一致，金额超过 500 元需附佐证材料。",
      status: "已关闭",
      priority: "普通",
      assignee: "HR-周颖",
      createdAt: "2026-06-09T14:38:00+08:00",
      updatedAt: "2026-06-11T11:20:00+08:00",
      dueAt: "2026-06-10T18:00:00+08:00",
      channel: "网页",
      resolution: "已答复员工：抬头不符的发票需联系客户重开，重开后可在 OA 重新提交报销。",
      linkedQuestionIds: ["QLOG-20260609-0002"],
      rating: 4,
      messages: [
        {
          id: "M1",
          authorType: "employee",
          authorName: "马丽",
          content: "上个月客户那边的发票抬头写成了旧公司名称，这个月还能提交报销吗？需要重开吗？",
          at: "2026-06-09T14:38:00+08:00",
          visibleToEmployee: true
        },
        {
          id: "M2",
          authorType: "system",
          authorName: "系统",
          content: "已创建工单并通知 HR-周颖",
          at: "2026-06-09T14:38:06+08:00",
          visibleToEmployee: false
        },
        {
          id: "M3",
          authorType: "hr",
          authorName: "HR-周颖",
          content: "您好，报销发票抬头需要与公司全称一致，抬头不符的发票需要联系客户重开；重开后在 OA 重新提交即可，跨年度费用请在次年 1 月 31 日前提交。",
          at: "2026-06-09T15:40:00+08:00",
          visibleToEmployee: true
        },
        {
          id: "M4",
          authorType: "hr",
          authorName: "HR-周颖",
          content: "内部备注：该发票金额为 860 元，超过 500 元需附行程单佐证，已在回复中提醒员工补充。",
          at: "2026-06-09T15:44:00+08:00",
          visibleToEmployee: false
        },
        {
          id: "M5",
          authorType: "system",
          authorName: "系统",
          content: "工单已关闭",
          at: "2026-06-11T11:20:00+08:00",
          visibleToEmployee: false
        }
      ]
    },
    {
      id: "TK-20260610-0003",
      employeeId: "E1005",
      employeeName: "孙悦",
      title: "产假期间工资发放标准咨询",
      category: "假期福利",
      source: "员工转人工",
      question: "请问产假期间工资按什么标准发？",
      aiSummary: "未在现行制度中找到明确规定，已转 HR 人工处理。",
      status: "已解决",
      priority: "普通",
      assignee: "HR-王芳",
      createdAt: "2026-06-10T10:12:00+08:00",
      updatedAt: "2026-06-11T15:40:00+08:00",
      dueAt: "2026-06-12T18:00:00+08:00",
      channel: "网页",
      resolution: "已由 HR 电话答复员工，产假工资按当地社保规定执行，具体以人事专员确认为准。",
      linkedQuestionIds: ["QLOG-20260610-0001"],
      rating: 5,
      messages: [
        {
          id: "M1",
          authorType: "employee",
          authorName: "孙悦",
          content: "请问产假期间工资按什么标准发？",
          at: "2026-06-10T10:12:00+08:00",
          visibleToEmployee: true
        },
        {
          id: "M2",
          authorType: "system",
          authorName: "系统",
          content: "已创建工单并通知 HR-王芳",
          at: "2026-06-10T10:12:05+08:00",
          visibleToEmployee: false
        },
        {
          id: "M3",
          authorType: "hr",
          authorName: "HR-王芳",
          content: "您好，我查一下人事政策，稍后回复您。",
          at: "2026-06-10T11:03:00+08:00",
          visibleToEmployee: true
        },
        {
          id: "M4",
          authorType: "system",
          authorName: "系统",
          content: "工单已解决",
          at: "2026-06-11T15:40:00+08:00",
          visibleToEmployee: false
        }
      ]
    }
  ];
})(typeof globalThis !== 'undefined' ? globalThis : this);
