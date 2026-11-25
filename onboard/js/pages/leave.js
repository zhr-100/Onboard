/**
 * 初见 Onboard · 我的年假页
 *
 * 设计原则（与全站一致）：
 *  - 页面只展示 HR 台账记录（leaveBalances / leaveRecords），不做任何推算 ——
 *    额度档位、结转规则是「制度标准」，余额明细是「HR 记录的事实」，两者分开呈现；
 *    标准用依据卡引用《年假与假期管理规定》原文，员工可以逐字核对。
 *  - 身份规则与问答页一致：员工 / HR 账号锁定本人；
 *    管理账号没有员工档案，进入「演示身份」预览（可以切换，仅示例数据）。
 *  - 「申请休假」复用转人工弹窗，提交前再核一次 action.handoff 权限。
 *  - 结转提醒按制度第 3.1 条计算：上年结转须在「台账年度」的 3 月 31 日前用完，
 *    过期后「可用」不再计入这部分（页面明确说明，不悄悄扣）。
 */
(function (root) {
  var O = root.Onboard;
  O.pages = O.pages || {};

  var panel = null;
  var currentUser = null;
  /** 本页私有的 DOM 缓存与绑定状态 */
  var el = {};

  /** 本页固定引用的制度条款（直引，不来自检索，没有命中度） */
  var CITED_CLAUSE_IDS = ['POL-HR-001-C01', 'POL-HR-001-C02'];

  function esc(s) { return O.dom.escapeHtml(s); }

  function init(user) {
    currentUser = user;
    panel = document.getElementById('leavePanel');
    if (panel) render();
  }

  function onShow(pane) {
    if (pane === 'leave') render();
  }

  /** 实时读一次当前账号：角色和启用状态可能刚被别人改过 */
  function liveUser() {
    if (!currentUser) return null;
    return O.auth.findById(currentUser.id) || currentUser;
  }

  /* ---------------------------------------------------------
   * 身份：本人 或 演示身份（仅无员工档案的管理账号）
   * ------------------------------------------------------- */

  function employees() {
    return O.store.get('employees') || [];
  }

  function identity() {
    var user = liveUser();
    if (!user) return null;

    if (user.employeeId) {
      var self = employees().filter(function (e) { return e.id === user.employeeId; })[0];
      if (self) return { employee: self, preview: false };
      // 账号还挂着员工编号，但名册里已经没有这个人：降级为演示身份，避免白屏
    }

    var picked = null;
    var select = document.getElementById('leaveIdentity');
    if (select && select.value) {
      picked = employees().filter(function (e) { return e.id === select.value; })[0];
    }
    if (!picked) {
      picked = employees().filter(function (e) { return e.status === '在职'; })[0] || employees()[0];
    }
    if (!picked) return null;
    return { employee: picked, preview: true };
  }

  /* ---------------------------------------------------------
   * 数据读取（只读台账，不推算）
   * ------------------------------------------------------- */

  /** 该员工台账里最新一年的余额（示例台账只覆盖一个年度，取最新保证跨年也能打开） */
  function balanceOf(employeeId) {
    var list = (O.store.get('leaveBalances') || []).filter(function (b) {
      return b.employeeId === employeeId;
    });
    if (!list.length) return null;
    list.sort(function (a, b) { return (b.year || 0) - (a.year || 0); });
    return list[0];
  }

  function recordsOf(employeeId, year) {
    var list = (O.store.get('leaveRecords') || []).filter(function (r) {
      return r.employeeId === employeeId && Number(r.year) === Number(year);
    });
    list.sort(function (a, b) {
      var d = String(b.startDate).localeCompare(String(a.startDate));
      return d !== 0 ? d : String(b.endDate || '').localeCompare(String(a.endDate || ''));
    });
    return list;
  }

  function todayString() {
    return O.format.date(new Date());
  }

  /**
   * 两个不同的截止日，别混成一个：
   *
   * 1) 结转截止 —— 台账里 carriedOver 是「上一年结转过来」的天数，
   *    按第 3.1 条须在**台账年度的 3 月 31 日**前用完，逾期作废。
   * 2) 作废截止 —— 台账年度自己应得、还没休完的部分，
   *    可以结转到**次年**、须在次年 3 月 31 日前用完，逾期作废。
   *
   * 只提醒前者的话，"再不休就作废"这条最有用的提醒永远不会出现。
   */
  function carryoverState(balance) {
    var days = Number(balance.carriedOver) || 0;
    var deadline = balance.year + '-03-31';
    var today = todayString();
    if (days <= 0) {
      return { kind: 'none', days: 0, deadline: deadline };
    }
    if (today <= deadline) {
      return {
        kind: 'active', days: days, deadline: deadline,
        left: O.format.daysBetween(today, deadline)
      };
    }
    return { kind: 'expired', days: days, deadline: deadline };
  }

  /** 本年度未休完的部分：什么时候作废（次年 3 月 31 日） */
  function forfeitState(balance, carry, available) {
    var days = Math.max(0, Number(available) || 0);
    var deadline = (Number(balance.year) + 1) + '-03-31';
    var today = todayString();
    if (days <= 0) return { kind: 'none', days: 0, deadline: deadline };
    if (today <= deadline) {
      return {
        kind: 'active', days: days, deadline: deadline,
        left: O.format.daysBetween(today, deadline)
      };
    }
    return { kind: 'expired', days: days, deadline: deadline };
  }

  /**
   * 可用 = 应得 + 结转 − 已用 − 已预约。
   * 结转已过期时不计入可用（页面横幅明确说明，不悄悄扣）。
   */
  function availableOf(balance, carry) {
    var carryDays = carry.kind === 'active' ? carry.days : 0;
    var rest = (Number(balance.entitled) || 0) + carryDays -
      (Number(balance.used) || 0) - (Number(balance.booked) || 0);
    return Math.max(0, rest);
  }

  /** 制度直引的依据卡（无检索命中度） */
  function citations() {
    var policies = O.store.get('policies') || [];
    var policy = policies.filter(function (p) { return p.id === 'POL-HR-001'; })[0];
    if (!policy) return [];
    var cites = [];
    (policy.clauses || []).forEach(function (clause) {
      if (CITED_CLAUSE_IDS.indexOf(clause.id) < 0) return;
      cites.push({
        clauseId: clause.id,
        policyTitle: policy.title,
        clauseNo: clause.no,
        version: policy.version,
        clauseHeading: clause.heading,
        excerpt: O.format.truncate(clause.text, 80),
        fullText: clause.text,
        source: '示例制度库',
        policyOwner: policy.owner,
        effectiveDate: policy.effectiveDate
      });
    });
    return cites;
  }

  /* ---------------------------------------------------------
   * 渲染
   * ------------------------------------------------------- */

  function render() {
    if (!panel) return;

    var user = liveUser();
    if (!O.permissions.can(user, 'view.leave')) {
      panel.innerHTML =
        '<div class="empty">' +
          '<div class="empty-icon">🔐</div>' +
          '<div class="empty-title">无权查看年假</div>' +
          '<div class="empty-desc">请联系系统管理员调整你的账号角色。</div>' +
        '</div>';
      return;
    }

    O.components.citation.bind();

    var who = identity();
    if (!who) {
      panel.innerHTML =
        '<div class="empty">' +
          '<div class="empty-icon">📅</div>' +
          '<div class="empty-title">没有可查看的员工</div>' +
          '<div class="empty-desc">名册里还没有员工，请先在「员工管理」中添加。</div>' +
        '</div>';
      return;
    }

    var balance = balanceOf(who.employee.id);
    if (!balance) {
      // 基线台账里没有这个人的记录（HR 还没录入）。
      // 台账区块只依赖流水账，不该被基线台账缺失连累 —— 照样显示，
      // 没记录就显示空状态，而不是整页消失。
      panel.innerHTML = previewBar(who) + ledgerSection(who);
      bindPanelEvents();
      return;
    }

    var carry = carryoverState(balance);
    var available = availableOf(balance, carry);
    var forfeit = forfeitState(balance, carry, available);
    var records = recordsOf(who.employee.id, balance.year);
    var done = records.filter(function (r) { return r.status === '已完成'; }).length;
    var booked = records.filter(function (r) { return r.status === '已预约'; }).length;

    panel.innerHTML =
      previewBar(who) +
      ledgerSection(who) +
      carryBanner(carry) +
      forfeitBanner(forfeit) +
      '<div class="leave-cards">' +
        balanceCard('应得（当年度）', balance.entitled, carrySub(carry), 'blue') +
        balanceCard('已用', balance.used, '已完成 ' + done + ' 笔', 'gray') +
        balanceCard('已预约', balance.booked, '待开始 ' + booked + ' 笔', 'orange') +
        balanceCard('可用', available, availableSub(balance, carry), 'green') +
      '</div>' +
      carryNote(balance, carry) +
      '<div class="leave-section">' +
        '<div class="leave-section-head">' +
          '<h3>假期明细（' + esc(balance.year) + ' 年 · 年假）</h3>' +
          '<button class="btn btn-primary btn-sm" id="leaveApplyBtn" type="button">申请休假</button>' +
        '</div>' +
        recordsTable(records) +
      '</div>' +
      ledgerNote(balance) +
      '<div id="leaveCites"></div>';

    renderCitations();
    bindPanelEvents();
  }

  /* ---------------------------------------------------------
   * 我的年假台账（各年度剩余年假 + 最后更新 + 流水）
   * ------------------------------------------------------- */

  /**
   * 台账行：**只按当前登录账号取数**。
   *
   * 员工账号走 O.leave.myRows(liveUser()) —— 那个函数不接受员工编号参数，
   * 自己从账号记录里取，页面改不了也传不进来别人的编号。
   * 只有管理员的「演示身份」预览才会按预览对象取（那是管理视角，合法）。
   */
  function myLedgerRows(who) {
    if (who.preview) return O.leave.rowsFor(who.employee.id);
    return O.leave.myRows(liveUser());
  }

  function ledgerSection(who) {
    var rows = myLedgerRows(who);
    return '' +
      '<div class="leave-section leave-ledger-section">' +
        '<div class="leave-section-head">' +
          '<h3>我的年假台账</h3>' +
        '</div>' +
        '<div class="card">' +
          O.components.ledger.tableHtml(rows, {
            showEmployee: false,
            emptyText: '请联系 HR 录入你的年假数据；没有记录不代表余额为零。',
            detailAttr: 'data-my-ledger-detail'
          }) +
        '</div>' +
        '<div id="myLedgerDetail"></div>' +
        '<p class="text-xs text-muted leave-note">' +
          '余额由 HR 维护。余额等于所有流水的合计，历史变动始终保留。' +
          '台账余额是 HR 记录的年假额度；下方的「可用」还要再扣掉已休与已预约的天数，两者口径不同。' +
        '</p>' +
      '</div>';
  }

  /** 展开某个年度的流水明细 */
  function openMyLedgerDetail(year) {
    var box = document.getElementById('myLedgerDetail');
    if (!box) return;

    // 只认当前登录账号 —— 和 myRows 同一套身份来源
    var entries = O.leave.myEntries(liveUser(), Number(year));
    if (!entries.length) {
      box.innerHTML = '';
      return;
    }

    var already = box.getAttribute('data-year') === String(year);
    if (already) {
      box.innerHTML = '';
      box.removeAttribute('data-year');
      return;
    }

    box.setAttribute('data-year', String(year));
    box.innerHTML =
      '<div class="leave-detail">' +
        '<div class="leave-detail-head">' + esc(year) + ' 年度变更记录</div>' +
        O.components.ledger.entriesHtml(entries) +
      '</div>';
  }

  function previewBar(who) {
    if (!who.preview) return '';
    var options = employees().map(function (e) {
      return '<option value="' + esc(e.id) + '"' + (e.id === who.employee.id ? ' selected' : '') + '>' +
        esc(e.name + ' · ' + e.dept) + '</option>';
    }).join('');
    return '' +
      '<div class="leave-preview">' +
        '<span class="leave-preview-icon" aria-hidden="true">👁</span>' +
        '<div class="leave-preview-text">' +
          '<strong>管理员演示身份</strong>' +
          '<span>你的账号没有关联员工档案，正在预览「' + esc(who.employee.name) + '」的年假示例数据。' +
          '员工账号登录时只能看到自己的余额，不能切换。</span>' +
        '</div>' +
        '<select class="select" id="leaveIdentity" aria-label="切换演示身份">' + options + '</select>' +
      '</div>';
  }

  function carryBanner(carry) {
    if (carry.kind === 'active') {
      return '' +
        '<div class="leave-banner is-warn">' +
          '<strong>别浪费结转额度：</strong>上年结转的 ' + esc(carry.days) + ' 天年假须在 ' +
          esc(carry.deadline) + ' 前使用，还剩 ' + esc(carry.left) + ' 天，逾期作废、不折现（制度第 3.1 条）。' +
        '</div>';
    }
    if (carry.kind === 'expired') {
      return '' +
        '<div class="leave-banner is-info">' +
          '<strong>结转已过期：</strong>上年结转的 ' + esc(carry.days) + ' 天年假已过 ' +
          esc(carry.deadline) + ' 使用期限，按制度第 3.1 条作废、不折现；下方「可用」已不计入这部分。' +
        '</div>';
    }
    return '';
  }

  /** 本年度未休完的部分：逾期作废提醒 */
  function forfeitBanner(forfeit) {
    if (forfeit.kind === 'active') {
      return '' +
        '<div class="leave-banner is-info">' +
          '<strong>本年度剩余年假 ' + esc(forfeit.days) + ' 天：</strong>可结转至 ' +
          esc(forfeit.deadline) + ' 前使用，还剩 ' + esc(forfeit.left) +
          ' 天；逾期未休作废、不另行折现补偿（制度第 3.1 条）。' +
        '</div>';
    }
    if (forfeit.kind === 'expired') {
      return '' +
        '<div class="leave-banner is-warn">' +
          '<strong>年度余额已过期：</strong>本年度剩余 ' + esc(forfeit.days) +
          ' 天年假已过 ' + esc(forfeit.deadline) + ' 使用期限；请联系 HR 核对台账是否已更新到最新年度。' +
        '</div>';
    }
    return '';
  }

  function carrySub(carry) {
    if (carry.kind === 'active') return '含上年结转 ' + carry.days + ' 天';
    if (carry.kind === 'expired') return '结转 ' + carry.days + ' 天已过期作废';
    return '无上年结转';
  }

  function availableSub(balance, carry) {
    var parts = ['应得 ' + balance.entitled];
    if (carry.kind === 'active') parts.push('结转 ' + carry.days);
    parts.push('− 已用 ' + balance.used, '− 已预约 ' + balance.booked);
    if (carry.kind === 'expired') parts.push('（结转 ' + carry.days + ' 天已过期，未计入）');
    return '= ' + parts.join(' ');
  }

  function balanceCard(title, value, sub, tone) {
    return '' +
      '<div class="leave-card tone-' + tone + '">' +
        '<div class="leave-card-title">' + esc(title) + '</div>' +
        '<div class="leave-card-value">' + esc(Number(value) || 0) + '<span class="leave-card-unit">天</span></div>' +
        '<div class="leave-card-sub">' + esc(sub || '—') + '</div>' +
      '</div>';
  }

  function carryNote(balance, carry) {
    if (carry.kind === 'expired') {
      return '<p class="text-xs text-muted leave-note">说明：台账「应得」为当年度额度，上年结转部分按制度已过期作废，不计入可用余额。</p>';
    }
    return '';
  }

  function recordsTable(records) {
    if (!records.length) {
      return '' +
        '<div class="empty">' +
          '<div class="empty-icon">🗒</div>' +
          '<div class="empty-title">暂无假期明细</div>' +
          '<div class="empty-desc">还没有年假使用记录；提交申请并由 HR 审批后会显示在这里。</div>' +
        '</div>';
    }
    var rows = records.map(function (r) {
      var range = r.startDate === r.endDate
        ? esc(r.startDate)
        : esc(r.startDate) + ' ~ ' + esc(r.endDate);
      var tone = r.status === '已预约' ? 'info' : 'muted';
      return '' +
        '<tr>' +
          '<td>' + range + '</td>' +
          '<td>' + esc(r.days) + ' 天</td>' +
          '<td><span class="badge badge-' + tone + '">' + esc(r.status) + '</span></td>' +
          '<td>' + esc(r.approver || '—') + '</td>' +
          '<td class="leave-record-note">' + esc(r.note || '—') + '</td>' +
        '</tr>';
    }).join('');
    return '' +
      '<div class="table-wrap"><table class="tbl leave-table">' +
        '<thead><tr><th>日期</th><th>天数</th><th>状态</th><th>审批人</th><th>备注</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table></div>';
  }

  function ledgerNote(balance) {
    return '' +
      '<p class="text-xs text-muted leave-note">' +
        '余额与明细来自 HR 年假台账（示例数据 · 记录更新于 ' + esc(balance.updatedAt || '—') + '）。' +
        '额度档位与结转规则依据《年假与假期管理规定》第 3.1 条，申请与审批流程见第 3.2 条；' +
        '正式申请请在 OA 系统「假期申请」提交，或点上方「申请休假」由 HR 协助办理。' +
      '</p>';
  }

  function noLedgerHtml(who) {
    return '' +
      previewBar(who) +
      '<div class="empty">' +
        '<div class="empty-icon">📅</div>' +
        '<div class="empty-title">暂无年假记录</div>' +
        '<div class="empty-desc">请联系 HR 录入你的年假数据；没有记录不代表余额为零。</div>' +
      '</div>';
  }

  function renderCitations() {
    var box = document.getElementById('leaveCites');
    if (!box) return;
    var cites = citations();
    if (!cites.length) return;
    var wrap = O.components.citation.render(cites, '制度依据');
    if (wrap) box.appendChild(wrap);
  }

  /* ---------------------------------------------------------
   * 申请休假 → 转人工
   * ------------------------------------------------------- */

  function openApply() {
    // 权限在系统内部再核一次：按钮藏了也不能绕过
    if (!O.permissions.can(liveUser(), 'action.handoff')) {
      O.components.toast.show('当前角色没有转人工的权限', 'warn');
      return;
    }
    var who = identity();
    var prefill = '我想申请年假：计划 ' +
      (who && who.employee ? who.employee.name : '本人') +
      ' 在 ____ 年 __ 月 __ 日至 __ 月 __ 日休假，共 __ 天，请协助确认余额并走 OA 审批。';
    O.components.ticket.openHandoff({
      question: prefill,
      category: '假期福利',
      onSubmit: function (text, category) { createLeaveTicket(text, category); }
    });
  }

  function createLeaveTicket(question, category) {
    var who = identity();
    var employee = who ? who.employee : null;
    var now = new Date();
    var due = new Date(now.getTime() + 2 * 86400000);
    var ticket = {
      id: O.format.createId('TK'),
      employeeId: employee ? employee.id : null,
      employeeName: employee ? employee.name : (currentUser ? currentUser.name : ''),
      title: question.length > 24 ? question.slice(0, 24) + '…' : question,
      category: category || '假期福利',
      source: '员工转人工',
      question: question,
      aiSummary: '员工在年假页提交休假申请，已转 HR 协助确认余额与 OA 审批。',
      status: '待处理',
      priority: '普通',
      assignee: 'HR-王芳',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      dueAt: due.toISOString(),
      channel: '网页',
      resolution: null,
      linkedQuestionIds: [],
      rating: null,
      messages: [
        {
          id: 'M1', authorType: 'employee', authorName: employee ? employee.name : '员工',
          content: question, at: now.toISOString(), visibleToEmployee: true
        },
        {
          id: 'M2', authorType: 'system', authorName: '系统',
          content: '已创建工单并通知 HR-王芳', at: new Date(now.getTime() + 1000).toISOString(), visibleToEmployee: false
        }
      ]
    };

    var tickets = O.store.get('tickets') || [];
    tickets.push(ticket);
    O.store.set('tickets', tickets);

    O.components.toast.show('已转给 HR，工单号 ' + ticket.id, 'ok');
    window.location.hash = '#/tickets';
  }

  /* ---------------------------------------------------------
   * 事件（render 重建 DOM 后重新挂）
   * ------------------------------------------------------- */

  function bindPanelEvents() {
    var applyBtn = document.getElementById('leaveApplyBtn');
    if (applyBtn) applyBtn.addEventListener('click', openApply);

    var select = document.getElementById('leaveIdentity');
    if (select) {
      select.addEventListener('change', render);
    }

    // 「查看 N 条流水」：展开本年度的流水明细。
    // 委托绑在 panel 上，而 panel 不会被替换 —— 所以**只能绑一次**。
    // 每次 render 都绑一遍会让监听器越积越多，点一下触发好几次，
    // 展开/收起被连着触发几次，结果又回到「收起」的样子。
    if (el.detailBound) return;
    el.detailBound = true;
    O.dom.on(panel, 'click', '[data-my-ledger-detail]', function (event, btn) {
      openMyLedgerDetail(btn.getAttribute('data-my-ledger-detail'));
    });
  }

  O.pages.leave = { init: init, onShow: onShow };
})(typeof globalThis !== 'undefined' ? globalThis : this);
