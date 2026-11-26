/**
 * 初见 Onboard · 年假台账表格（共享组件）
 *
 * 员工端「我的年假」和 HR 后台「年假管理」用**同一份**渲染代码 ——
 * 两边看到的表格形式必须一模一样，否则用户会以为是两个不同的账。
 *
 * 只负责生成 HTML，不负责取数，也不负责开弹窗：
 * 取数在 js/core/leave.js（那里做身份检查），弹窗在各页面自己处理。
 */
(function (root) {
  var O = root.Onboard;
  O.components = O.components || {};

  function esc(s) { return O.dom.escapeHtml(s); }

  /**
   * 台账表格。
   *
   * @param {Array} rows  台账行（每行含 year / balance / entryCount / lastAt / entries）
   * @param {Object} opts
   *   - showEmployee  是否显示「员工」列（HR 后台要，员工端不要）
   *   - emptyText     没有记录时的空状态文案
   *   - detailAttr    「查看 N 条流水」按钮上的 data 属性名，默认 data-ledger-detail
   *   - detailKey     按钮上写什么值，默认用年度；
   *                    HR 后台一行可能有多个员工，用函数生成「员工ID|年度」
   * @returns {string} HTML
   */
  function tableHtml(rows, opts) {
    opts = opts || {};
    var list = rows || [];

    if (!list.length) {
      return '' +
        '<div class="empty">' +
          '<div class="empty-icon">📒</div>' +
          '<div class="empty-title">暂无年假记录</div>' +
          '<div class="empty-desc">' + esc(opts.emptyText || '请联系 HR 录入你的年假数据；没有记录不代表余额为零。') + '</div>' +
        '</div>';
    }

    var showEmployee = opts.showEmployee !== false;
    var attr = opts.detailAttr || 'data-ledger-detail';
    var keyOf = opts.detailKey || function (row) { return row.year; };

    var body = list.map(function (row) {
      var count = row.entryCount || 0;
      var changeCell;
      if (!count) {
        changeCell = '<span class="text-xs text-muted">暂无流水</span>';
      } else {
        changeCell =
          '<button class="la-link" type="button" ' + attr + '="' + esc(keyOf(row)) + '">' +
            '查看 ' + count + ' 条流水' +
          '</button>';
      }

      var employeeCell = '';
      if (showEmployee) {
        employeeCell =
          '<td>' +
            '<div class="la-emp">' +
              '<span class="avatar avatar-sm" style="background:' + esc(row.employee.avatarColor || '#2F6BFF') + '">' +
                esc(row.employee.avatarText || (row.employee.name || '员').charAt(0)) +
              '</span>' +
              '<span class="la-emp-text">' +
                '<span class="la-emp-name">' + esc(row.employee.name) + '</span>' +
                '<span class="la-emp-account mono">' + esc(row.account.username) + '</span>' +
              '</span>' +
            '</div>' +
          '</td>';
      }

      return '' +
        '<tr>' +
          employeeCell +
          '<td class="mono">' + row.year + ' 年度</td>' +
          '<td class="la-balance">' + esc(O.leave.formatDays(row.balance)) + ' 天</td>' +
          '<td class="mono text-xs text-muted">' + esc(row.lastAt ? O.format.dateTime(row.lastAt) : '—') + '</td>' +
          '<td>' + changeCell + '</td>' +
        '</tr>';
    }).join('');

    var head = showEmployee ? '<th>员工</th>' : '';

    return '' +
      '<div class="table-wrap"><table class="tbl la-table">' +
        '<thead><tr>' + head +
          '<th>年假</th><th>年假余额</th><th>最后更新</th><th>变更记录</th>' +
        '</tr></thead>' +
        '<tbody>' + body + '</tbody>' +
      '</table></div>';
  }

  /**
   * 流水明细表格。
   * @param {Array} entries 流水
   */
  function entriesHtml(entries) {
    var list = entries || [];
    if (!list.length) {
      return '' +
        '<div class="empty">' +
          '<div class="empty-icon">🧾</div>' +
          '<div class="empty-title">暂无流水</div>' +
          '<div class="empty-desc">这一年还没有任何余额变动记录。</div>' +
        '</div>';
    }

    var rows = list.map(function (e) {
      var type = O.leave.TYPES[e.type] || { label: e.type, tone: 'muted' };
      var delta = Number(e.delta) || 0;
      var deltaText = (delta > 0 ? '+' : '') + O.leave.formatDays(delta) + ' 天';
      var deltaTone = delta > 0 ? 'ok' : (delta < 0 ? 'danger' : 'muted');
      return '' +
        '<tr>' +
          '<td class="mono text-xs text-muted">' + esc(O.format.dateTime(e.createdAt)) + '</td>' +
          '<td><span class="badge badge-' + type.tone + '">' + esc(type.label) + '</span></td>' +
          '<td class="la-delta la-delta-' + deltaTone + '">' + esc(deltaText) + '</td>' +
          '<td class="la-reason">' + esc(e.reason || '—') + '</td>' +
          '<td class="text-xs text-muted">' + esc(e.operator || '—') + '</td>' +
        '</tr>';
    }).join('');

    return '' +
      '<div class="table-wrap"><table class="tbl la-entries">' +
        '<thead><tr><th>时间</th><th>类型</th><th>增减</th><th>原因</th><th>操作人</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table></div>' +
      '<p class="text-xs text-muted la-detail-note">流水只增不改不删，历史变动始终保留。</p>';
  }

  O.components.ledger = {
    tableHtml: tableHtml,
    entriesHtml: entriesHtml
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
