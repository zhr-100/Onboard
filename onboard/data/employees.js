/**
 * 示例员工数据（虚构示例，仅用于演示，不对应任何真实人员）
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

  root.OnboardData.employees = [
    {
      id: "E1001",
      name: "张小雨",
      avatarText: "张",
      avatarColor: "#2F6BFF",
      dept: "产品部",
      title: "产品经理",
      email: "zhangxiaoyu@example.com",
      phone: "138****0001",
      joinDate: "2025-03-17",
      employmentType: "正式员工",
      manager: "李强",
      status: "在职",
      onboardingPlanId: "OB-TPL-001",
      policyAcks: [
        { policyId: "POL-HR-001", ackedAt: "2025-03-17" },
        { policyId: "POL-HR-003", ackedAt: "2025-03-17" }
      ],
      isSample: true
    },
    {
      id: "E1002",
      name: "李文博",
      avatarText: "李",
      avatarColor: "#00A870",
      dept: "技术部",
      title: "后端工程师",
      email: "liwenbo@example.com",
      phone: "138****0002",
      joinDate: "2023-04-10",
      employmentType: "正式员工",
      manager: "张海",
      status: "在职",
      onboardingPlanId: "OB-TPL-002",
      policyAcks: [
        { policyId: "POL-HR-001", ackedAt: "2023-04-10" },
        { policyId: "POL-IT-010", ackedAt: "2023-04-10" }
      ],
      isSample: true
    },
    {
      id: "E1003",
      name: "王思远",
      avatarText: "王",
      avatarColor: "#7A5AF8",
      dept: "技术部",
      title: "前端工程师",
      email: "wangsiyuan@example.com",
      phone: "138****0003",
      joinDate: "2021-06-01",
      employmentType: "正式员工",
      manager: "张海",
      status: "在职",
      onboardingPlanId: "OB-TPL-002",
      policyAcks: [
        { policyId: "POL-HR-001", ackedAt: "2021-06-01" },
        { policyId: "POL-HR-009", ackedAt: "2021-06-01" }
      ],
      isSample: true
    },
    {
      id: "E1004",
      name: "陈静",
      avatarText: "陈",
      avatarColor: "#E8833A",
      dept: "市场部",
      title: "市场专员",
      email: "chenjing@example.com",
      phone: "138****0004",
      joinDate: "2022-08-15",
      employmentType: "正式员工",
      manager: "赵敏",
      status: "在职",
      onboardingPlanId: "OB-TPL-001",
      policyAcks: [
        { policyId: "POL-HR-001", ackedAt: "2022-08-15" },
        { policyId: "POL-FIN-007", ackedAt: "2022-08-15" }
      ],
      isSample: true
    },
    {
      id: "E1005",
      name: "孙悦",
      avatarText: "孙",
      avatarColor: "#0EA5A5",
      dept: "销售部",
      title: "客户经理",
      email: "sunyue@example.com",
      phone: "138****0005",
      joinDate: "2024-09-02",
      employmentType: "正式员工",
      manager: "赵敏",
      status: "在职",
      onboardingPlanId: "OB-TPL-003",
      policyAcks: [
        { policyId: "POL-HR-001", ackedAt: "2024-09-02" },
        { policyId: "POL-FIN-007", ackedAt: "2024-09-02" }
      ],
      isSample: true
    },
    {
      id: "E1006",
      name: "周颖",
      avatarText: "周",
      avatarColor: "#E5484D",
      dept: "人力资源部",
      title: "人力资源业务伙伴",
      email: "zhouying@example.com",
      phone: "138****0006",
      joinDate: "2020-03-11",
      employmentType: "正式员工",
      manager: "刘洋",
      status: "在职",
      onboardingPlanId: "OB-TPL-004",
      policyAcks: [
        { policyId: "POL-HR-001", ackedAt: "2020-03-11" },
        { policyId: "POL-HR-005", ackedAt: "2020-03-11" }
      ],
      isSample: true
    },
    {
      id: "E1007",
      name: "吴宇",
      avatarText: "吴",
      avatarColor: "#3B82F6",
      dept: "财务部",
      title: "会计",
      email: "wuyu@example.com",
      phone: "138****0007",
      joinDate: "2025-11-24",
      employmentType: "试用期",
      manager: "刘洋",
      status: "试用期",
      onboardingPlanId: "OB-TPL-004",
      policyAcks: [
        { policyId: "POL-HR-005", ackedAt: "2025-11-24" },
        { policyId: "POL-FIN-007", ackedAt: "2025-11-24" }
      ],
      isSample: true
    },
    {
      id: "E1008",
      name: "郑凯",
      avatarText: "郑",
      avatarColor: "#F2A900",
      dept: "产品部",
      title: "产品设计师",
      email: "zhengkai@example.com",
      phone: "138****0008",
      joinDate: "2023-10-09",
      employmentType: "正式员工",
      manager: "李强",
      status: "在职",
      onboardingPlanId: "OB-TPL-001",
      policyAcks: [
        { policyId: "POL-HR-001", ackedAt: "2023-10-09" },
        { policyId: "POL-IT-010", ackedAt: "2023-10-09" }
      ],
      isSample: true
    },
    {
      id: "E1009",
      name: "林雪",
      avatarText: "林",
      avatarColor: "#8B5CF6",
      dept: "市场部",
      title: "市场经理",
      email: "linxue@example.com",
      phone: "138****0009",
      joinDate: "2021-02-22",
      employmentType: "正式员工",
      manager: "赵敏",
      status: "在职",
      onboardingPlanId: "OB-TPL-001",
      policyAcks: [
        { policyId: "POL-HR-001", ackedAt: "2021-02-22" },
        { policyId: "POL-FIN-007", ackedAt: "2021-02-22" }
      ],
      isSample: true
    },
    {
      id: "E1010",
      name: "何俊",
      avatarText: "何",
      avatarColor: "#10B981",
      dept: "技术部",
      title: "测试工程师",
      email: "hejun@example.com",
      phone: "138****0010",
      joinDate: "2022-05-30",
      employmentType: "正式员工",
      manager: "张海",
      status: "在职",
      onboardingPlanId: "OB-TPL-002",
      policyAcks: [
        { policyId: "POL-HR-003", ackedAt: "2022-05-30" },
        { policyId: "POL-IT-010", ackedAt: "2022-05-30" }
      ],
      isSample: true
    },
    {
      id: "E1011",
      name: "马丽",
      avatarText: "马",
      avatarColor: "#EF4444",
      dept: "销售部",
      title: "销售助理",
      email: "mali@example.com",
      phone: "138****0011",
      joinDate: "2024-05-06",
      employmentType: "正式员工",
      manager: "赵敏",
      status: "在职",
      onboardingPlanId: "OB-TPL-003",
      policyAcks: [
        { policyId: "POL-HR-001", ackedAt: "2024-05-06" },
        { policyId: "POL-FIN-007", ackedAt: "2024-05-06" }
      ],
      isSample: true
    },
    {
      id: "E1012",
      name: "高鹏",
      avatarText: "高",
      avatarColor: "#6366F1",
      dept: "人力资源部",
      title: "招聘专员",
      email: "gaopeng@example.com",
      phone: "138****0012",
      joinDate: "2020-11-16",
      employmentType: "正式员工",
      manager: "刘洋",
      status: "已离职",
      onboardingPlanId: "OB-TPL-004",
      policyAcks: [
        { policyId: "POL-HR-001", ackedAt: "2020-11-16" },
        { policyId: "POL-HR-005", ackedAt: "2020-11-16" }
      ],
      isSample: true
    }
  ];
  root.OnboardData.leaveBalances = [
    {
      id: "LV-E1001-2026",
      employeeId: "E1001",
      year: 2026,
      type: "年假",
      entitled: 10,
      used: 3,
      booked: 2,
      carriedOver: 1,
      unit: "天",
      ruleRef: [
        { min: "满1年", days: 10 },
        { min: "满3年", days: 15 },
        { min: "满5年", days: 20 }
      ],
      updatedAt: "2026-06-18",
      note: "示例数据"
    },
    {
      id: "LV-E1002-2026",
      employeeId: "E1002",
      year: 2026,
      type: "年假",
      entitled: 15,
      used: 5,
      booked: 1,
      carriedOver: 3,
      unit: "天",
      ruleRef: [
        { min: "满1年", days: 10 },
        { min: "满3年", days: 15 },
        { min: "满5年", days: 20 }
      ],
      updatedAt: "2026-06-18",
      note: "示例数据"
    },
    {
      id: "LV-E1003-2026",
      employeeId: "E1003",
      year: 2026,
      type: "年假",
      entitled: 20,
      used: 8,
      booked: 3,
      carriedOver: 0,
      unit: "天",
      ruleRef: [
        { min: "满1年", days: 10 },
        { min: "满3年", days: 15 },
        { min: "满5年", days: 20 }
      ],
      updatedAt: "2026-06-18",
      note: "示例数据"
    },
    {
      id: "LV-E1004-2026",
      employeeId: "E1004",
      year: 2026,
      type: "年假",
      entitled: 15,
      used: 4,
      booked: 0,
      carriedOver: 5,
      unit: "天",
      ruleRef: [
        { min: "满1年", days: 10 },
        { min: "满3年", days: 15 },
        { min: "满5年", days: 20 }
      ],
      updatedAt: "2026-06-18",
      note: "示例数据"
    },
    {
      id: "LV-E1005-2026",
      employeeId: "E1005",
      year: 2026,
      type: "年假",
      entitled: 10,
      used: 2,
      booked: 2,
      carriedOver: 0,
      unit: "天",
      ruleRef: [
        { min: "满1年", days: 10 },
        { min: "满3年", days: 15 },
        { min: "满5年", days: 20 }
      ],
      updatedAt: "2026-06-18",
      note: "示例数据"
    },
    {
      id: "LV-E1006-2026",
      employeeId: "E1006",
      year: 2026,
      type: "年假",
      entitled: 20,
      used: 12,
      booked: 1,
      carriedOver: 4,
      unit: "天",
      ruleRef: [
        { min: "满1年", days: 10 },
        { min: "满3年", days: 15 },
        { min: "满5年", days: 20 }
      ],
      updatedAt: "2026-06-18",
      note: "示例数据"
    },
    {
      id: "LV-E1007-2026",
      employeeId: "E1007",
      year: 2026,
      type: "年假",
      entitled: 0,
      used: 0,
      booked: 0,
      carriedOver: 0,
      unit: "天",
      ruleRef: [
        { min: "满1年", days: 10 },
        { min: "满3年", days: 15 },
        { min: "满5年", days: 20 }
      ],
      updatedAt: "2026-06-18",
      note: "入职未满 1 年，暂无可用年假额度（示例数据）"
    },
    {
      id: "LV-E1008-2026",
      employeeId: "E1008",
      year: 2026,
      type: "年假",
      entitled: 10,
      used: 6,
      booked: 1,
      carriedOver: 2,
      unit: "天",
      ruleRef: [
        { min: "满1年", days: 10 },
        { min: "满3年", days: 15 },
        { min: "满5年", days: 20 }
      ],
      updatedAt: "2026-06-18",
      note: "示例数据"
    },
    {
      id: "LV-E1009-2026",
      employeeId: "E1009",
      year: 2026,
      type: "年假",
      entitled: 20,
      used: 7,
      booked: 0,
      carriedOver: 0,
      unit: "天",
      ruleRef: [
        { min: "满1年", days: 10 },
        { min: "满3年", days: 15 },
        { min: "满5年", days: 20 }
      ],
      updatedAt: "2026-06-18",
      note: "示例数据"
    },
    {
      id: "LV-E1010-2026",
      employeeId: "E1010",
      year: 2026,
      type: "年假",
      entitled: 15,
      used: 9,
      booked: 2,
      carriedOver: 3,
      unit: "天",
      ruleRef: [
        { min: "满1年", days: 10 },
        { min: "满3年", days: 15 },
        { min: "满5年", days: 20 }
      ],
      updatedAt: "2026-06-18",
      note: "示例数据"
    },
    {
      id: "LV-E1011-2026",
      employeeId: "E1011",
      year: 2026,
      type: "年假",
      entitled: 10,
      used: 3,
      booked: 1,
      carriedOver: 1,
      unit: "天",
      ruleRef: [
        { min: "满1年", days: 10 },
        { min: "满3年", days: 15 },
        { min: "满5年", days: 20 }
      ],
      updatedAt: "2026-06-18",
      note: "示例数据"
    },
    {
      id: "LV-E1012-2026",
      employeeId: "E1012",
      year: 2026,
      type: "年假",
      entitled: 20,
      used: 18,
      booked: 0,
      carriedOver: 0,
      unit: "天",
      ruleRef: [
        { min: "满1年", days: 10 },
        { min: "满3年", days: 15 },
        { min: "满5年", days: 20 }
      ],
      updatedAt: "2026-06-18",
      note: "已离职，年假余额已随离职结算（示例数据）"
    }
  ];
  root.OnboardData.onboardingTemplates = [
    {
      id: "OB-TPL-001",
      name: "社招新员工 30 天清单（示例）",
      owner: "人力资源部",
      tasks: [
        { title: "签署《员工手册》确认书", category: "签署文件", owner: "人力资源部", dueOffsetDays: 3 },
        { title: "提交身份证与银行卡信息", category: "材料收集", owner: "入职专员", dueOffsetDays: 5 },
        { title: "签署《保密协议》", category: "签署文件", owner: "人力资源部", dueOffsetDays: 7 },
        { title: "办理门禁卡与办公邮箱开通", category: "权限开通", owner: "信息技术部", dueOffsetDays: 10 },
        { title: "参加入职培训与 30 天融入访谈", category: "培训", owner: "人力资源部", dueOffsetDays: 30 }
      ]
    },
    {
      id: "OB-TPL-002",
      name: "技术岗入职清单（示例）",
      owner: "信息技术部",
      tasks: [
        { title: "提交学历与学位证书", category: "材料收集", owner: "入职专员", dueOffsetDays: 5 },
        { title: "签署劳动合同", category: "签署文件", owner: "人力资源部", dueOffsetDays: 10 },
        { title: "开通代码仓库与 VPN 权限", category: "权限开通", owner: "信息技术部", dueOffsetDays: 7 },
        { title: "配置开发环境与测试账号", category: "权限开通", owner: "研发效能组", dueOffsetDays: 12 },
        { title: "完成信息安全培训", category: "培训", owner: "信息技术部", dueOffsetDays: 20 }
      ]
    },
    {
      id: "OB-TPL-003",
      name: "销售岗入职清单（示例）",
      owner: "销售运营组",
      tasks: [
        { title: "提交上一份工作离职证明", category: "材料收集", owner: "入职专员", dueOffsetDays: 5 },
        { title: "签署劳动合同与保密协议", category: "签署文件", owner: "人力资源部", dueOffsetDays: 10 },
        { title: "学习报销与差旅费标准", category: "培训", owner: "财务部", dueOffsetDays: 15 },
        { title: "完成客户系统与邮箱账号开通", category: "权限开通", owner: "销售运营组", dueOffsetDays: 7 }
      ]
    },
    {
      id: "OB-TPL-004",
      name: "试用期新人引导清单（示例）",
      owner: "人力资源部",
      tasks: [
        { title: "签署劳动合同与录用条件确认书", category: "签署文件", owner: "人力资源部", dueOffsetDays: 10 },
        { title: "完成试用期目标沟通", category: "评估", owner: "直属主管", dueOffsetDays: 30 },
        { title: "试用期中期评估", category: "评估", owner: "直属主管", dueOffsetDays: 60 },
        { title: "提交转正自评表", category: "评估", owner: "员工本人", dueOffsetDays: 120 }
      ]
    }
  ];

  root.OnboardData.onboardingTasks = [
    {
      id: "OBT-E1001-01",
      employeeId: "E1001",
      title: "签署《员工手册》确认书",
      category: "签署文件",
      owner: "人力资源部",
      dueDate: "2025-03-20",
      status: "已完成",
      completedAt: "2025-03-19T16:20:00+08:00",
      relatedPolicyId: "POL-HR-001",
      note: "在 OA 完成电子签"
    },
    {
      id: "OBT-E1001-02",
      employeeId: "E1001",
      title: "提交身份证与银行卡信息",
      category: "材料收集",
      owner: "入职专员",
      dueDate: "2025-03-22",
      status: "已完成",
      completedAt: "2025-03-21T10:05:00+08:00",
      relatedPolicyId: "POL-HR-008",
      note: "扫描件已上传至人事系统"
    },
    {
      id: "OBT-E1001-03",
      employeeId: "E1001",
      title: "签署《保密协议》",
      category: "签署文件",
      owner: "人力资源部",
      dueDate: "2025-03-24",
      status: "已完成",
      completedAt: "2025-03-24T09:30:00+08:00",
      relatedPolicyId: "POL-HR-009",
      note: "入职时签署的历史版本，该制度现已废止"
    },
    {
      id: "OBT-E1001-04",
      employeeId: "E1001",
      title: "办理门禁卡与办公邮箱开通",
      category: "权限开通",
      owner: "信息技术部",
      dueDate: "2025-03-27",
      status: "已完成",
      completedAt: "2025-03-27T14:00:00+08:00",
      relatedPolicyId: "POL-IT-010",
      note: "工牌与邮箱已同步发放"
    },
    {
      id: "OBT-E1001-05",
      employeeId: "E1001",
      title: "参加入职培训与 30 天融入访谈",
      category: "培训",
      owner: "人力资源部",
      dueDate: "2025-04-16",
      status: "已逾期",
      completedAt: null,
      relatedPolicyId: "POL-HR-008",
      note: "示例数据：任务逾期未完成"
    },
    {
      id: "OBT-E1002-01",
      employeeId: "E1002",
      title: "提交学历与学位证书",
      category: "材料收集",
      owner: "入职专员",
      dueDate: "2023-04-15",
      status: "已完成",
      completedAt: "2023-04-14T11:00:00+08:00",
      relatedPolicyId: "POL-HR-008",
      note: "已完成核验"
    },
    {
      id: "OBT-E1002-02",
      employeeId: "E1002",
      title: "签署劳动合同",
      category: "签署文件",
      owner: "人力资源部",
      dueDate: "2023-04-20",
      status: "已完成",
      completedAt: "2023-04-19T15:30:00+08:00",
      relatedPolicyId: "POL-HR-008",
      note: "纸质一式两份已归档"
    },
    {
      id: "OBT-E1002-03",
      employeeId: "E1002",
      title: "开通代码仓库与 VPN 权限",
      category: "权限开通",
      owner: "信息技术部",
      dueDate: "2023-04-17",
      status: "已完成",
      completedAt: "2023-04-17T17:20:00+08:00",
      relatedPolicyId: "POL-IT-010",
      note: "已开启双因素认证"
    },
    {
      id: "OBT-E1003-01",
      employeeId: "E1003",
      title: "签署《保密协议》",
      category: "签署文件",
      owner: "人力资源部",
      dueDate: "2021-06-06",
      status: "已完成",
      completedAt: "2021-06-05T10:12:00+08:00",
      relatedPolicyId: "POL-HR-009",
      note: "入职时签署的历史版本"
    },
    {
      id: "OBT-E1003-02",
      employeeId: "E1003",
      title: "签署劳动合同",
      category: "签署文件",
      owner: "人力资源部",
      dueDate: "2021-06-11",
      status: "已完成",
      completedAt: "2021-06-10T09:45:00+08:00",
      relatedPolicyId: "POL-HR-008",
      note: ""
    },
    {
      id: "OBT-E1004-01",
      employeeId: "E1004",
      title: "提交上一份工作离职证明",
      category: "材料收集",
      owner: "入职专员",
      dueDate: "2022-08-20",
      status: "已完成",
      completedAt: "2022-08-19T15:00:00+08:00",
      relatedPolicyId: "POL-HR-008",
      note: ""
    },
    {
      id: "OBT-E1004-02",
      employeeId: "E1004",
      title: "办理人事档案接收",
      category: "手续办理",
      owner: "人力资源部",
      dueDate: "2022-08-30",
      status: "已完成",
      completedAt: "2022-08-29T11:30:00+08:00",
      relatedPolicyId: "POL-HR-008",
      note: "工龄起算日期已确认"
    },
    {
      id: "OBT-E1005-01",
      employeeId: "E1005",
      title: "签署劳动合同",
      category: "签署文件",
      owner: "人力资源部",
      dueDate: "2024-09-12",
      status: "已完成",
      completedAt: "2024-09-11T10:00:00+08:00",
      relatedPolicyId: "POL-HR-008",
      note: ""
    },
    {
      id: "OBT-E1005-02",
      employeeId: "E1005",
      title: "学习报销与差旅费标准",
      category: "培训",
      owner: "财务部",
      dueDate: "2024-09-09",
      status: "已完成",
      completedAt: "2024-09-09T09:00:00+08:00",
      relatedPolicyId: "POL-FIN-007",
      note: "已完成线上课程"
    },
    {
      id: "OBT-E1006-01",
      employeeId: "E1006",
      title: "签署劳动合同",
      category: "签署文件",
      owner: "人力资源部",
      dueDate: "2020-03-21",
      status: "已完成",
      completedAt: "2020-03-20T14:00:00+08:00",
      relatedPolicyId: "POL-HR-008",
      note: ""
    },
    {
      id: "OBT-E1006-02",
      employeeId: "E1006",
      title: "完成人事档案接收",
      category: "手续办理",
      owner: "人力资源部",
      dueDate: "2020-03-26",
      status: "已完成",
      completedAt: "2020-03-25T16:40:00+08:00",
      relatedPolicyId: "POL-HR-008",
      note: ""
    },
    {
      id: "OBT-E1007-01",
      employeeId: "E1007",
      title: "提交身份证与银行卡信息",
      category: "材料收集",
      owner: "入职专员",
      dueDate: "2025-11-29",
      status: "已完成",
      completedAt: "2025-11-28T11:20:00+08:00",
      relatedPolicyId: "POL-HR-008",
      note: ""
    },
    {
      id: "OBT-E1007-02",
      employeeId: "E1007",
      title: "签署劳动合同与录用条件确认书",
      category: "签署文件",
      owner: "人力资源部",
      dueDate: "2025-12-04",
      status: "已完成",
      completedAt: "2025-12-03T16:10:00+08:00",
      relatedPolicyId: "POL-HR-005",
      note: "试用期员工"
    },
    {
      id: "OBT-E1007-03",
      employeeId: "E1007",
      title: "完成试用期目标沟通",
      category: "评估",
      owner: "直属主管",
      dueDate: "2025-12-24",
      status: "已逾期",
      completedAt: null,
      relatedPolicyId: "POL-HR-005",
      note: "示例数据：任务逾期未完成"
    },
    {
      id: "OBT-E1007-04",
      employeeId: "E1007",
      title: "试用期中期评估",
      category: "评估",
      owner: "直属主管",
      dueDate: "2026-01-23",
      status: "进行中",
      completedAt: null,
      relatedPolicyId: "POL-HR-005",
      note: "示例数据"
    },
    {
      id: "OBT-E1010-01",
      employeeId: "E1010",
      title: "配置测试环境与账号",
      category: "权限开通",
      owner: "研发效能组",
      dueDate: "2022-05-12",
      status: "已完成",
      completedAt: "2022-05-11T10:30:00+08:00",
      relatedPolicyId: "POL-IT-010",
      note: ""
    },
    {
      id: "OBT-E1011-01",
      employeeId: "E1011",
      title: "提交入职材料",
      category: "材料收集",
      owner: "入职专员",
      dueDate: "2024-05-11",
      status: "已完成",
      completedAt: "2024-05-10T10:40:00+08:00",
      relatedPolicyId: "POL-HR-008",
      note: ""
    },
    {
      id: "OBT-E1011-02",
      employeeId: "E1011",
      title: "开通企业邮箱",
      category: "权限开通",
      owner: "信息技术部",
      dueDate: "2024-05-13",
      status: "已完成",
      completedAt: "2024-05-13T09:30:00+08:00",
      relatedPolicyId: "POL-IT-010",
      note: "初始密码首次登录已修改"
    },
    {
      id: "OBT-E1012-01",
      employeeId: "E1012",
      title: "签署劳动合同",
      category: "签署文件",
      owner: "人力资源部",
      dueDate: "2020-11-26",
      status: "已完成",
      completedAt: "2020-11-25T15:00:00+08:00",
      relatedPolicyId: "POL-HR-008",
      note: ""
    },
    {
      id: "OBT-E1012-02",
      employeeId: "E1012",
      title: "离职交接与账号回收确认",
      category: "手续办理",
      owner: "信息技术部",
      dueDate: "2026-04-30",
      status: "已完成",
      completedAt: "2026-04-30T17:50:00+08:00",
      relatedPolicyId: "POL-IT-010",
      note: "门禁、邮箱、VPN 均已停用"
    },
    {
      id: "OBT-E1012-03",
      employeeId: "E1012",
      title: "未休年假折算确认",
      category: "手续办理",
      owner: "人力资源部",
      dueDate: "2026-04-30",
      status: "已完成",
      completedAt: "2026-04-30T18:05:00+08:00",
      relatedPolicyId: "POL-HR-001",
      note: "折算款随最后一笔工资发放"
    }
  ];
})(typeof globalThis !== 'undefined' ? globalThis : this);
