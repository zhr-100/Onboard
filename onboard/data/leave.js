/**
 * 示例年假明细数据（虚构示例，仅用于演示，不对应任何真实人员）
 * 数据集：onboard-demo-v1
 *
 * 与 data/employees.js 里的 leaveBalances 台账一一对应：
 * 每个员工「已完成」记录的 days 之和 = 台账 used，「已预约」之和 = 台账 booked。
 * 页面展示余额与明细时以此为账，不做任何推算。
 */
(function (root) {
  root.OnboardData = root.OnboardData || {};
  root.OnboardData.leaveRecords = [
    /* E1001 张小雨 · used 3, booked 2 */
    { id: "LR-E1001-01", employeeId: "E1001", year: 2026, type: "年假",
      startDate: "2026-01-30", endDate: "2026-01-30", days: 1, status: "已完成",
      approver: "李强", appliedAt: "2026-01-26", source: "OA 假期申请", note: "" },
    { id: "LR-E1001-02", employeeId: "E1001", year: 2026, type: "年假",
      startDate: "2026-04-03", endDate: "2026-04-04", days: 2, status: "已完成",
      approver: "李强", appliedAt: "2026-03-30", source: "OA 假期申请", note: "" },
    { id: "LR-E1001-03", employeeId: "E1001", year: 2026, type: "年假",
      startDate: "2026-12-24", endDate: "2026-12-25", days: 2, status: "已预约",
      approver: "李强", appliedAt: "2026-11-20", source: "OA 假期申请", note: "圣诞节前错峰休假" },

    /* E1002 李文博 · used 5, booked 1 */
    { id: "LR-E1002-01", employeeId: "E1002", year: 2026, type: "年假",
      startDate: "2026-02-09", endDate: "2026-02-11", days: 3, status: "已完成",
      approver: "张海", appliedAt: "2026-02-02", source: "OA 假期申请", note: "" },
    { id: "LR-E1002-02", employeeId: "E1002", year: 2026, type: "年假",
      startDate: "2026-07-16", endDate: "2026-07-17", days: 2, status: "已完成",
      approver: "张海", appliedAt: "2026-07-10", source: "OA 假期申请", note: "" },
    { id: "LR-E1002-03", employeeId: "E1002", year: 2026, type: "年假",
      startDate: "2026-12-28", endDate: "2026-12-28", days: 1, status: "已预约",
      approver: "张海", appliedAt: "2026-11-18", source: "OA 假期申请", note: "" },

    /* E1003 王思远 · used 8, booked 3 */
    { id: "LR-E1003-01", employeeId: "E1003", year: 2026, type: "年假",
      startDate: "2026-03-16", endDate: "2026-03-18", days: 3, status: "已完成",
      approver: "张海", appliedAt: "2026-03-09", source: "OA 假期申请", note: "" },
    { id: "LR-E1003-02", employeeId: "E1003", year: 2026, type: "年假",
      startDate: "2026-05-25", endDate: "2026-05-26", days: 2, status: "已完成",
      approver: "张海", appliedAt: "2026-05-18", source: "OA 假期申请", note: "" },
    { id: "LR-E1003-03", employeeId: "E1003", year: 2026, type: "年假",
      startDate: "2026-10-12", endDate: "2026-10-14", days: 3, status: "已完成",
      approver: "张海", appliedAt: "2026-09-28", source: "OA 假期申请", note: "" },
    { id: "LR-E1003-04", employeeId: "E1003", year: 2026, type: "年假",
      startDate: "2026-12-28", endDate: "2026-12-30", days: 3, status: "已预约",
      approver: "张海", appliedAt: "2026-11-13", source: "OA 假期申请", note: "连续 3 天，部门负责人已复核" },

    /* E1004 陈静 · used 4, booked 0 */
    { id: "LR-E1004-01", employeeId: "E1004", year: 2026, type: "年假",
      startDate: "2026-04-10", endDate: "2026-04-10", days: 1, status: "已完成",
      approver: "赵敏", appliedAt: "2026-04-07", source: "OA 假期申请", note: "" },
    { id: "LR-E1004-02", employeeId: "E1004", year: 2026, type: "年假",
      startDate: "2026-08-20", endDate: "2026-08-21", days: 2, status: "已完成",
      approver: "赵敏", appliedAt: "2026-08-14", source: "OA 假期申请", note: "" },
    { id: "LR-E1004-03", employeeId: "E1004", year: 2026, type: "年假",
      startDate: "2026-09-25", endDate: "2026-09-25", days: 1, status: "已完成",
      approver: "赵敏", appliedAt: "2026-09-21", source: "OA 假期申请", note: "" },

    /* E1005 孙悦 · used 2, booked 2 */
    { id: "LR-E1005-01", employeeId: "E1005", year: 2026, type: "年假",
      startDate: "2026-06-05", endDate: "2026-06-05", days: 1, status: "已完成",
      approver: "赵敏", appliedAt: "2026-06-02", source: "OA 假期申请", note: "" },
    { id: "LR-E1005-02", employeeId: "E1005", year: 2026, type: "年假",
      startDate: "2026-09-04", endDate: "2026-09-04", days: 1, status: "已完成",
      approver: "赵敏", appliedAt: "2026-09-01", source: "OA 假期申请", note: "" },
    { id: "LR-E1005-03", employeeId: "E1005", year: 2026, type: "年假",
      startDate: "2026-12-14", endDate: "2026-12-15", days: 2, status: "已预约",
      approver: "赵敏", appliedAt: "2026-11-16", source: "OA 假期申请", note: "" },

    /* E1006 周颖（HR管理员） · used 12, booked 1 */
    { id: "LR-E1006-01", employeeId: "E1006", year: 2026, type: "年假",
      startDate: "2026-01-26", endDate: "2026-01-30", days: 5, status: "已完成",
      approver: "刘洋", appliedAt: "2026-01-15", source: "OA 假期申请", note: "含上年结转额度" },
    { id: "LR-E1006-02", employeeId: "E1006", year: 2026, type: "年假",
      startDate: "2026-04-27", endDate: "2026-04-30", days: 4, status: "已完成",
      approver: "刘洋", appliedAt: "2026-04-17", source: "OA 假期申请", note: "" },
    { id: "LR-E1006-03", employeeId: "E1006", year: 2026, type: "年假",
      startDate: "2026-08-03", endDate: "2026-08-05", days: 3, status: "已完成",
      approver: "刘洋", appliedAt: "2026-07-27", source: "OA 假期申请", note: "" },
    { id: "LR-E1006-04", employeeId: "E1006", year: 2026, type: "年假",
      startDate: "2026-12-21", endDate: "2026-12-21", days: 1, status: "已预约",
      approver: "刘洋", appliedAt: "2026-11-19", source: "OA 假期申请", note: "" },

    /* E1007 吴宇 · 入职未满 1 年，暂无额度，无明细 */

    /* E1008 郑凯（产品运营） · used 6, booked 1 */
    { id: "LR-E1008-01", employeeId: "E1008", year: 2026, type: "年假",
      startDate: "2026-02-02", endDate: "2026-02-04", days: 3, status: "已完成",
      approver: "李强", appliedAt: "2026-01-26", source: "OA 假期申请", note: "" },
    { id: "LR-E1008-02", employeeId: "E1008", year: 2026, type: "年假",
      startDate: "2026-06-15", endDate: "2026-06-16", days: 2, status: "已完成",
      approver: "李强", appliedAt: "2026-06-09", source: "OA 假期申请", note: "" },
    { id: "LR-E1008-03", employeeId: "E1008", year: 2026, type: "年假",
      startDate: "2026-10-26", endDate: "2026-10-26", days: 1, status: "已完成",
      approver: "李强", appliedAt: "2026-10-22", source: "OA 假期申请", note: "" },
    { id: "LR-E1008-04", employeeId: "E1008", year: 2026, type: "年假",
      startDate: "2026-12-07", endDate: "2026-12-07", days: 1, status: "已预约",
      approver: "李强", appliedAt: "2026-11-17", source: "OA 假期申请", note: "" },

    /* E1009 林雪 · used 7, booked 0 */
    { id: "LR-E1009-01", employeeId: "E1009", year: 2026, type: "年假",
      startDate: "2026-01-19", endDate: "2026-01-21", days: 3, status: "已完成",
      approver: "赵敏", appliedAt: "2026-01-12", source: "OA 假期申请", note: "含上年结转额度" },
    { id: "LR-E1009-02", employeeId: "E1009", year: 2026, type: "年假",
      startDate: "2026-05-11", endDate: "2026-05-12", days: 2, status: "已完成",
      approver: "赵敏", appliedAt: "2026-05-06", source: "OA 假期申请", note: "" },
    { id: "LR-E1009-03", employeeId: "E1009", year: 2026, type: "年假",
      startDate: "2026-09-07", endDate: "2026-09-08", days: 2, status: "已完成",
      approver: "赵敏", appliedAt: "2026-08-31", source: "OA 假期申请", note: "" },

    /* E1010 何俊 · used 9, booked 2 */
    { id: "LR-E1010-01", employeeId: "E1010", year: 2026, type: "年假",
      startDate: "2026-02-23", endDate: "2026-02-27", days: 5, status: "已完成",
      approver: "张海", appliedAt: "2026-02-10", source: "OA 假期申请", note: "含上年结转额度" },
    { id: "LR-E1010-02", employeeId: "E1010", year: 2026, type: "年假",
      startDate: "2026-07-27", endDate: "2026-07-30", days: 4, status: "已完成",
      approver: "张海", appliedAt: "2026-07-17", source: "OA 假期申请", note: "" },
    { id: "LR-E1010-03", employeeId: "E1010", year: 2026, type: "年假",
      startDate: "2026-12-16", endDate: "2026-12-17", days: 2, status: "已预约",
      approver: "张海", appliedAt: "2026-11-21", source: "OA 假期申请", note: "" },

    /* E1011 马丽 · used 3, booked 1 */
    { id: "LR-E1011-01", employeeId: "E1011", year: 2026, type: "年假",
      startDate: "2026-03-30", endDate: "2026-03-31", days: 2, status: "已完成",
      approver: "赵敏", appliedAt: "2026-03-24", source: "OA 假期申请", note: "使用了上年结转额度" },
    { id: "LR-E1011-02", employeeId: "E1011", year: 2026, type: "年假",
      startDate: "2026-08-14", endDate: "2026-08-14", days: 1, status: "已完成",
      approver: "赵敏", appliedAt: "2026-08-11", source: "OA 假期申请", note: "" },
    { id: "LR-E1011-03", employeeId: "E1011", year: 2026, type: "年假",
      startDate: "2026-12-02", endDate: "2026-12-02", days: 1, status: "已预约",
      approver: "赵敏", appliedAt: "2026-11-18", source: "OA 假期申请", note: "" },

    /* E1012 高鹏 · 已离职，used 18（离职前休假，余额已随离职结算） */
    { id: "LR-E1012-01", employeeId: "E1012", year: 2026, type: "年假",
      startDate: "2026-01-12", endDate: "2026-01-16", days: 5, status: "已完成",
      approver: "刘洋", appliedAt: "2025-12-30", source: "OA 假期申请", note: "" },
    { id: "LR-E1012-02", employeeId: "E1012", year: 2026, type: "年假",
      startDate: "2026-03-02", endDate: "2026-03-06", days: 5, status: "已完成",
      approver: "刘洋", appliedAt: "2026-02-20", source: "OA 假期申请", note: "" },
    { id: "LR-E1012-03", employeeId: "E1012", year: 2026, type: "年假",
      startDate: "2026-04-13", endDate: "2026-04-17", days: 5, status: "已完成",
      approver: "刘洋", appliedAt: "2026-04-01", source: "OA 假期申请", note: "" },
    { id: "LR-E1012-04", employeeId: "E1012", year: 2026, type: "年假",
      startDate: "2026-05-18", endDate: "2026-05-19", days: 2, status: "已完成",
      approver: "刘洋", appliedAt: "2026-05-12", source: "OA 假期申请", note: "" },
    { id: "LR-E1012-05", employeeId: "E1012", year: 2026, type: "年假",
      startDate: "2026-06-01", endDate: "2026-06-01", days: 1, status: "已完成",
      approver: "刘洋", appliedAt: "2026-05-26", source: "OA 假期申请", note: "离职前最后一天休假" }
  ];

  /**
   * 年假台账的示例流水（虚构示例，仅用于演示）
   *
   * 每名员工 2 到 4 条流水，余额 = 所有流水之和。
   * 余额各不相同，并且出现 0.5 天 —— 年假本来就以半天为最小单位
   * （见《年假与假期管理规定（示例）》第 3.2 条）。
   *
   * 流水 id 以 LVL-S- 开头、原因以「示例：」开头：
   * 重新生成示例数据时靠这个标记识别并整体替换，
   * 而 HR 自己做的调整和导入对账流水一律保留。
   */
  root.OnboardData.leaveLedgerSamples = [
    {
      employeeId: "E1001", year: 2026, target: 12, flows: [
        { delta: 15, reason: "示例：年初发放 15 天", at: "2026-01-05T09:00:00.000Z" },
        { delta: -2, reason: "示例：已休 2 天", at: "2026-03-16T09:00:00.000Z" },
        { delta: -1, reason: "示例：已休 1 天", at: "2026-05-18T09:00:00.000Z" }
      ]
    },
    {
      employeeId: "E1002", year: 2026, target: 10, flows: [
        { delta: 15, reason: "示例：年初发放 15 天", at: "2026-01-05T09:00:00.000Z" },
        { delta: -3, reason: "示例：已休 3 天", at: "2026-02-23T09:00:00.000Z" },
        { delta: -2, reason: "示例：已休 2 天", at: "2026-04-13T09:00:00.000Z" }
      ]
    },
    {
      employeeId: "E1003", year: 2026, target: 7.5, flows: [
        { delta: 15, reason: "示例：年初发放 15 天", at: "2026-01-05T09:00:00.000Z" },
        { delta: -5, reason: "示例：已休 5 天", at: "2026-03-16T09:00:00.000Z" },
        { delta: -2.5, reason: "示例：已休 2.5 天", at: "2026-06-08T09:00:00.000Z" }
      ]
    },
    {
      employeeId: "E1004", year: 2026, target: 5, flows: [
        { delta: 10, reason: "示例：年初发放 10 天", at: "2026-01-05T09:00:00.000Z" },
        { delta: -3, reason: "示例：已休 3 天", at: "2026-02-09T09:00:00.000Z" },
        { delta: -2, reason: "示例：已休 2 天", at: "2026-05-06T09:00:00.000Z" }
      ]
    },
    {
      employeeId: "E1005", year: 2026, target: 11, flows: [
        { delta: 12, reason: "示例：年初发放 12 天", at: "2026-01-05T09:00:00.000Z" },
        { delta: -1, reason: "示例：已休 1 天", at: "2026-04-20T09:00:00.000Z" }
      ]
    },
    {
      employeeId: "E1006", year: 2026, target: 8.5, flows: [
        { delta: 20, reason: "示例：年初发放 20 天", at: "2026-01-05T09:00:00.000Z" },
        { delta: -8, reason: "示例：已休 8 天", at: "2026-02-02T09:00:00.000Z" },
        { delta: -2, reason: "示例：已休 2 天", at: "2026-04-06T09:00:00.000Z" },
        { delta: -1.5, reason: "示例：已休 1.5 天", at: "2026-07-13T09:00:00.000Z" }
      ]
    },
    {
      employeeId: "E1007", year: 2026, target: 2.5, flows: [
        { delta: 5, reason: "示例：年初发放 5 天", at: "2026-01-05T09:00:00.000Z" },
        { delta: -2.5, reason: "示例：已休 2.5 天", at: "2026-03-02T09:00:00.000Z" }
      ]
    },
    {
      employeeId: "E1008", year: 2026, target: 6.5, flows: [
        { delta: 10, reason: "示例：年初发放 10 天", at: "2026-01-05T09:00:00.000Z" },
        { delta: -2, reason: "示例：已休 2 天", at: "2026-02-16T09:00:00.000Z" },
        { delta: -1.5, reason: "示例：已休 1.5 天", at: "2026-05-25T09:00:00.000Z" }
      ]
    },
    {
      employeeId: "E1009", year: 2026, target: 13, flows: [
        { delta: 15, reason: "示例：年初发放 15 天", at: "2026-01-05T09:00:00.000Z" },
        { delta: -2, reason: "示例：已休 2 天", at: "2026-04-06T09:00:00.000Z" }
      ]
    },
    {
      employeeId: "E1010", year: 2026, target: 4.5, flows: [
        { delta: 10, reason: "示例：年初发放 10 天", at: "2026-01-05T09:00:00.000Z" },
        { delta: -4, reason: "示例：已休 4 天", at: "2026-03-23T09:00:00.000Z" },
        { delta: -1.5, reason: "示例：已休 1.5 天", at: "2026-06-15T09:00:00.000Z" }
      ]
    },
    {
      employeeId: "E1011", year: 2026, target: 9.5, flows: [
        { delta: 12, reason: "示例：年初发放 12 天", at: "2026-01-05T09:00:00.000Z" },
        { delta: -2.5, reason: "示例：已休 2.5 天", at: "2026-03-30T09:00:00.000Z" }
      ]
    },
    {
      employeeId: "E1012", year: 2026, target: 3.5, flows: [
        { delta: 8, reason: "示例：年初发放 8 天", at: "2026-01-05T09:00:00.000Z" },
        { delta: -3, reason: "示例：已休 3 天", at: "2026-02-16T09:00:00.000Z" },
        { delta: -1.5, reason: "示例：已休 1.5 天", at: "2026-04-13T09:00:00.000Z" }
      ]
    }
  ];
})(typeof globalThis !== 'undefined' ? globalThis : this);
