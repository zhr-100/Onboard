/**
 * 初见 Onboard · 员工问答页与工单页
 *
 * 由 js/pages/app.js 在登录成功后调用 init()，导航切换时调用 onShow()。
 */
(function (root) {
  var O = root.Onboard;
  O.pages = O.pages || {};

  var QUICK_QUESTIONS = [
    '年假有多少天',
    '年假能跨年用吗',
    '怎么请病假',
    '加班调休怎么算',
    '报销流程是什么',
    '入职要准备什么材料',
    '试用期怎么算',
    '邮箱账号怎么开通'
  ];

  var state = {
    employeeId: null,
    employee: null,
    corpus: null,
    corpusSig: '',
    sessionId: null,
    ready: false,
    user: null,
    canHandoff: false,
    canFeedback: false
  };

  var el = {};

  /* ---------------------------------------------------------
   * 初始化（登录成功后调用一次）
   * ------------------------------------------------------- */
  function init(user) {
    el.chatScroll = document.getElementById('chatScroll');
    el.chatInput = document.getElementById('chatInput');
    el.chatSend = document.getElementById('chatSend');
    el.employeeSelect = document.getElementById('employeeSelect');
    el.quickChips = document.getElementById('quickChips');
    el.ticketList = document.getElementById('ticketList');
    var handoff = document.getElementById('chatHandoff');

    if (!el.chatScroll) return;

    state.user = user || null;
    // 权限在系统内部判定：这里只是决定要不要画这个按钮
    state.canHandoff = O.permissions.can(state.user, 'action.handoff');
    state.canFeedback = O.permissions.can(state.user, 'action.feedback');
    if (handoff) handoff.hidden = !state.canHandoff;

    O.components.citation.bind();
    O.components.ticket.bindModal();

    var closeBtn = document.getElementById('handoffClose');
    if (closeBtn) closeBtn.addEventListener('click', O.components.ticket.closeHandoff);

    initEmployees(user);
    renderQuickChips();
    bindEvents();

    if (handoff && !handoff.__bound) {
      handoff.__bound = true;
      handoff.addEventListener('click', function () { openHandoff(''); });
    }

    state.ready = true;
    if (!restoreSession()) renderWelcome();
    renderTicketList();
    refreshKnowledge();
    startKnowledgeRefresh();
  }

  /** 页面停留很久时也能感知知识库的发布/下架（每分钟拉一次，失败不影响基线问答） */
  function startKnowledgeRefresh() {
    if (state.kbTimer) clearInterval(state.kbTimer);
    state.kbTimer = setInterval(function () {
      var shell = document.getElementById('appShell');
      if (!shell || shell.hidden) return;
      var pane = document.getElementById('pane-chat');
      if (!pane || !pane.classList.contains('is-active')) return;
      if (!O.store || O.store.mode !== 'server') return;
      if (!O.auth.currentUser()) return;
      refreshKnowledge();
    }, 60000);
  }

  /** 切换到某个页面时由外壳调用 */
  function onShow(pane) {
    if (pane === 'tickets') renderTicketList();
    if (pane === 'chat') refreshKnowledge();
  }

  function initEmployees(user) {
    var employees = O.store.get('employees') || [];
    el.employeeSelect.innerHTML = employees.map(function (e) {
      return '<option value="' + O.dom.escapeHtml(e.id) + '">' +
        O.dom.escapeHtml(e.name + ' · ' + e.dept) + '</option>';
    }).join('');

    // 用员工账号登录时，问答里的身份就是这个员工本人，不能切换
    if (user && user.employeeId) {
      var mine = employees.filter(function (e) { return e.id === user.employeeId; })[0];
      if (mine) {
        state.employeeId = mine.id;
        state.employee = mine;
        el.employeeSelect.value = mine.id;
        el.employeeSelect.hidden = true;
        if (O.knowledge && O.knowledge.setActing) O.knowledge.setActing(mine);
        return;
      }
    }

    var current = employees.filter(function (e) { return e.status === '在职'; })[0] || employees[0];
    if (current) {
      state.employeeId = current.id;
      state.employee = current;
      el.employeeSelect.value = current.id;
      if (O.knowledge && O.knowledge.setActing) O.knowledge.setActing(current);
    }
  }

  function renderQuickChips() {
    el.quickChips.innerHTML = QUICK_QUESTIONS.map(function (q) {
      return '<button class="chip" type="button" data-q="' + O.dom.escapeHtml(q) + '">' +
        O.dom.escapeHtml(q) + '</button>';
    }).join('');
  }

  function bindEvents() {
    el.chatSend.addEventListener('click', function () { ask(el.chatInput.value); });

    el.chatInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        ask(el.chatInput.value);
      }
    });

    el.chatInput.addEventListener('input', function () {
      el.chatInput.style.height = 'auto';
      el.chatInput.style.height = Math.min(140, el.chatInput.scrollHeight) + 'px';
    });

    O.dom.on(el.quickChips, 'click', '[data-q]', function (event, btn) {
      ask(btn.getAttribute('data-q'));
    });

    el.employeeSelect.addEventListener('change', function () {
      var employees = O.store.get('employees') || [];
      var found = employees.filter(function (e) { return e.id === el.employeeSelect.value; })[0];
      if (!found) return;
      state.employeeId = found.id;
      state.employee = found;
      if (O.knowledge && O.knowledge.setActing) O.knowledge.setActing(found);
      if (!restoreSession()) renderWelcome();
      renderTicketList();
      // 换人就要换部门：制度按部门适用，得重新拉一次
      refreshKnowledge();
    });
  }

  /* ---------------------------------------------------------
   * 问答
   * ------------------------------------------------------- */

  /** 当前身份能做的操作（渲染时用） */
  function canFlags() {
    return { handoff: state.canHandoff, feedback: state.canFeedback };
  }

  /** 实时读取当前账号（角色或启用状态可能刚被别人改过） */
  function liveUser() {
    if (!state.user) return null;
    return O.auth.findById(state.user.id) || state.user;
  }

  /**
   * 转人工前再核一次权限。
   * 按钮藏起来只是"不给你看入口"，这里才是真正的拦截。
   */
  function guardHandoff(question, answer, logId) {
    if (!O.permissions.can(liveUser(), 'action.handoff')) {
      O.components.toast.show('当前角色没有转人工的权限', 'warn');
      return;
    }
    openHandoff(question, answer, logId);
  }

  function renderWelcome() {
    var wrap = document.createElement('div');
    wrap.className = 'welcome';
    wrap.innerHTML =
      '<div class="welcome-mark" aria-hidden="true">初</div>' +
      '<h2>你好，我是初见助手</h2>' +
      '<p>公司制度、年假天数、报销流程、入职准备……用平时的说法问我就行。' +
      '每个回答都会附上制度原文，你可以点开逐条核对；查不到依据时，我会直接告诉你"没找到"，不会编。</p>' +
      '<div class="welcome-quick">' +
      QUICK_QUESTIONS.slice(0, 4).map(function (q) {
        return '<button class="chip" type="button" data-q="' + O.dom.escapeHtml(q) + '">' +
          O.dom.escapeHtml(q) + '</button>';
      }).join('') +
      '</div>';
    el.chatScroll.appendChild(wrap);
    O.dom.on(wrap, 'click', '[data-q]', function (event, btn) {
      ask(btn.getAttribute('data-q'));
    });
  }

  /** 基线示例制度 + 知识库里已发布且适用于当前身份的制度 */
  function mergedPolicies() {
    var baseline = O.store.get('policies') || [];
    var kb = (O.knowledge && O.knowledge.publishedPolicies) ? O.knowledge.publishedPolicies() : [];
    if (!kb.length) return baseline;
    return baseline.concat(kb);
  }

  function corpus() {
    var policies = mergedPolicies();
    // 签名必须能反映「内容变了」：制度数量、序列化长度、知识库版本号、
    // 当前部门、今天日期（生效日期按天判断）。只比长度会漏掉同长度改动。
    var sig = policies.length + ':' + JSON.stringify(policies).length + ':' +
      (O.knowledge ? O.knowledge.publishedVersion() : 0) + ':' +
      (state.employee ? state.employee.dept : '') + ':' + todayString();
    if (!state.corpus || state.corpusSig !== sig) {
      state.corpus = O.nlp.retriever.build(policies);
      state.corpusSig = sig;
    }
    return state.corpus;
  }

  function todayString() {
    var d = new Date();
    function pad(n) { return n < 10 ? '0' + n : String(n); }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /**
   * 拉取知识库已发布制度。
   * 可见范围由服务端按「当前查看身份」判断（和制度中心同一套规则），
   * 这里只负责告诉服务端当前是谁。
   */
  function refreshKnowledge() {
    if (!O.knowledge || !O.knowledge.refreshPublished) return Promise.resolve();
    // 只有服务模式才有知识库；双击 index.html 打开时不发请求（也不报错）
    if (!O.store || O.store.mode !== 'server') return Promise.resolve();
    if (state.employee && O.knowledge.setActing) O.knowledge.setActing(state.employee);
    return O.knowledge.refreshPublished().catch(function (error) {
      // 拉不到知识库不影响基线问答，只是没有已发布的新制度
      if (root && root.console && console.warn) {
        console.warn('[初见] 知识库已发布制度拉取失败：' + (error && error.message ? error.message : '未知错误'));
      }
    });
  }

  function ask(text) {
    var question = String(text || '').trim();
    if (!question) return;

    el.chatInput.value = '';
    el.chatInput.style.height = 'auto';

    var userEl = O.components.chat.renderUser(question);
    el.chatScroll.appendChild(userEl);

    var typing = O.components.chat.renderTyping();
    el.chatScroll.appendChild(typing);
    O.dom.scrollToBottom(el.chatScroll);

    var started = Date.now();

    setTimeout(function () {
      if (typing.parentNode) typing.parentNode.removeChild(typing);

      var intent = O.nlp.intent.detect(question);
      var search;
      var answer;

      if (intent === 'chitchat' || intent === 'handoff') {
        search = { state: 'no_evidence', query: { tokens: [], keys: [] }, candidates: [], top: null, matchedTerms: [] };
        answer = O.nlp.answerer.build({ query: question, intent: intent, search: search });
      } else {
        var c = corpus();
        search = O.nlp.retriever.search(c, question, O.nlp.config);
        answer = O.nlp.answerer.build({ query: question, intent: intent, search: search });
      }

      var latency = Date.now() - started;

      var log = {
        id: O.format.createId('QLOG'),
        employeeId: state.employeeId,
        sessionId: state.sessionId,
        question: question,
        normalized: search.query.normalized || '',
        intent: intent,
        hit: answer.state === 'hit',
        noEvidence: answer.state === 'no_evidence',
        confidence: answer.confidence || 0,
        topScore: search.top ? search.top.score : 0,
        candidateCount: search.candidates.length,
        citations: answer.citations || [],
        answer: answer.text,
        handoffToHuman: !!answer.handoffToHuman,
        ticketId: null,
        feedback: null,
        latencyMs: latency,
        engine: 'local-kb',
        matchedTerms: answer.matchedTerms || [],
        createdAt: new Date().toISOString()
      };

      var logId = log.id;
      recordLog(log);

      var assistantEl = O.components.chat.renderAssistant(answer, {
        logId: logId,
        can: canFlags(),
        onHandoff: function (a) { guardHandoff(question, a, logId); },
        onPick: function (candidate, a) { pickCandidate(candidate, a, logId); },
        onFeedback: function (value, a, id) { setFeedback(id, value); },
        onRewrite: function () { el.chatInput.focus(); }
      });
      el.chatScroll.appendChild(assistantEl);
      O.dom.scrollToBottom(el.chatScroll);

      pushSession({ role: 'user', text: question, at: new Date().toISOString() });
      pushSession({ role: 'assistant', text: answer.text, at: new Date().toISOString(), answer: answer, logId: logId });

      if (intent === 'handoff') {
        openHandoff(question, answer, logId);
      }
    }, 260);
  }

  function pickCandidate(candidate, answer, logId) {
    var search = { query: O.nlp.retriever.prepareQuery(''), matchedTerms: answer.matchedTerms || [] };
    var built = O.nlp.answerer.buildForCandidate({
      clause: candidateClause(candidate),
      policy: candidatePolicy(candidate),
      matchedKeys: candidate.matchedKeys,
      score: candidate.score,
      coverage: 1
    }, search, {});

    var assistantEl = O.components.chat.renderAssistant(built, {
      logId: logId,
      can: canFlags(),
      onHandoff: function (a) { guardHandoff(built.text, a, logId); },
      onPick: function () { },
      onFeedback: function (value, a, id) { setFeedback(id, value); },
      onRewrite: function () { el.chatInput.focus(); }
    });
    el.chatScroll.appendChild(assistantEl);
    O.dom.scrollToBottom(el.chatScroll);
    pushSession({ role: 'assistant', text: built.text, at: new Date().toISOString(), answer: built, logId: logId });
  }

  function candidateClause(candidate) {
    var policies = mergedPolicies();
    for (var i = 0; i < policies.length; i++) {
      var clauses = policies[i].clauses || [];
      for (var j = 0; j < clauses.length; j++) {
        if (clauses[j].id === candidate.clauseId) return clauses[j];
      }
    }
    return { id: candidate.clauseId, no: candidate.clauseNo, heading: candidate.clauseHeading, text: candidate.fullText };
  }

  function candidatePolicy(candidate) {
    var policies = mergedPolicies();
    for (var i = 0; i < policies.length; i++) {
      var clauses = policies[i].clauses || [];
      for (var j = 0; j < clauses.length; j++) {
        if (clauses[j].id === candidate.clauseId) return policies[i];
      }
    }
    // 找不到对应制度（例如历史会话里引用了已经删掉的文档）：
    // 用候选自带的元信息兜底，别把部门、生效日期、来源都丢掉。
    return {
      id: candidate.policyId || '', code: candidate.policyCode || '',
      title: candidate.policyTitle || '', category: candidate.policyCategory || '',
      owner: candidate.policyOwner || '', version: candidate.version || '',
      effectiveDate: candidate.effectiveDate || '', source: candidate.source || ''
    };
  }

  /* ---------------------------------------------------------
   * 记录与统计
   * ------------------------------------------------------- */
  function recordLog(log) {
    var logs = O.store.get('questionLogs') || [];
    logs.push(log);
    if (logs.length > 500) logs = logs.slice(logs.length - 500);
    O.store.set('questionLogs', logs);
  }

  function setFeedback(logId, value) {
    var logs = O.store.get('questionLogs') || [];
    var hit = logs.filter(function (l) { return l.id === logId; })[0];
    if (!hit) return;
    hit.feedback = value;
    O.store.set('questionLogs', logs);
    O.components.toast.show(value === 'helpful' ? '感谢反馈，会继续优化' : '已记录，运营会看到这条', 'ok');
  }

  /* ---------------------------------------------------------
   * 工单
   * ------------------------------------------------------- */
  function openHandoff(question, answer, logId) {
    // 权限在系统内部再核一次：按钮藏了也不能绕过
    if (!O.permissions.can(liveUser(), 'action.handoff')) {
      O.components.toast.show('当前角色没有转人工的权限', 'warn');
      return;
    }
    O.components.ticket.openHandoff({
      question: question || '',
      onSubmit: function (text, category) {
        createTicket(text, category, answer, logId);
      }
    });
  }

  function createTicket(question, category, answer, logId) {
    var now = new Date();
    var due = new Date(now.getTime() + 2 * 86400000);
    var ticket = {
      id: O.format.createId('TK'),
      employeeId: state.employeeId,
      employeeName: state.employee ? state.employee.name : '',
      title: question.length > 24 ? question.slice(0, 24) + '…' : question,
      category: category || '其他',
      source: '员工转人工',
      question: question,
      aiSummary: answer && answer.state === 'no_evidence'
        ? '未在现行制度中找到相关规定，已转 HR 人工处理。'
        : (answer && answer.state === 'ambiguous'
          ? '检索到多条相近规定，无法确认，已转 HR 人工处理。'
          : '员工主动转人工。'),
      status: '待处理',
      priority: '普通',
      assignee: 'HR-王芳',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      dueAt: due.toISOString(),
      channel: '网页',
      resolution: null,
      linkedQuestionIds: logId ? [logId] : [],
      rating: null,
      messages: [
        {
          id: 'M1', authorType: 'employee', authorName: state.employee ? state.employee.name : '员工',
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

    if (logId) {
      var logs = O.store.get('questionLogs') || [];
      var hit = logs.filter(function (l) { return l.id === logId; })[0];
      if (hit) {
        hit.ticketId = ticket.id;
        hit.handoffToHuman = true;
        O.store.set('questionLogs', logs);
      }
    }

    O.components.toast.show('已转给 HR，工单号 ' + ticket.id, 'ok');
    renderTicketList();
    window.location.hash = '#/tickets';
  }

  function renderTicketList() {
    if (!el.ticketList) return;
    var tickets = (O.store.get('tickets') || []).filter(function (t) {
      return t.employeeId === state.employeeId;
    });
    tickets.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
    var old = el.ticketList;
    var next = O.components.ticket.renderList(tickets);
    old.parentNode.replaceChild(next, old);
    el.ticketList = next;
  }

  /* ---------------------------------------------------------
   * 会话记录
   * ------------------------------------------------------- */
  function currentSession() {
    var sessions = O.store.get('chatSessions') || [];
    var found = sessions.filter(function (s) { return s.employeeId === state.employeeId; })[0];
    if (found) {
      state.sessionId = found.id;
      return found;
    }
    var created = {
      id: O.format.createId('S'),
      employeeId: state.employeeId,
      title: '我的咨询',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: []
    };
    sessions.push(created);
    O.store.set('chatSessions', sessions);
    state.sessionId = created.id;
    return created;
  }

  function pushSession(message) {
    var session = currentSession();
    session.messages.push(message);
    session.updatedAt = new Date().toISOString();
    if (session.messages.length > 100) session.messages = session.messages.slice(-100);

    var sessions = O.store.get('chatSessions') || [];
    var idx = -1;
    sessions.forEach(function (s, i) { if (s.id === session.id) idx = i; });
    if (idx >= 0) sessions[idx] = session; else sessions.push(session);
    if (sessions.length > 20) sessions = sessions.slice(sessions.length - 20);
    O.store.set('chatSessions', sessions);
  }

  function restoreSession() {
    if (!el.chatScroll) return false;
    O.dom.clear(el.chatScroll);
    var session = currentSession();
    if (!session.messages || !session.messages.length) return false;

    session.messages.forEach(function (m) {
      if (m.role === 'user') {
        el.chatScroll.appendChild(O.components.chat.renderUser(m.text));
      } else if (m.answer) {
        el.chatScroll.appendChild(O.components.chat.renderAssistant(m.answer, {
          logId: m.logId,
          can: canFlags(),
          onHandoff: function (a) { guardHandoff(m.text, a, m.logId); },
          onPick: function (candidate, a) { pickCandidate(candidate, a, m.logId); },
          onFeedback: function (value, a, id) { setFeedback(id || m.logId, value); },
          onRewrite: function () { el.chatInput.focus(); }
        }));
      } else {
        var wrap = document.createElement('div');
        wrap.className = 'msg assistant';
        wrap.innerHTML =
          '<div class="msg-row"><div class="msg-avatar">初</div><div class="msg-body">' +
          '<div class="msg-name">初见助手</div><div class="bubble"><p>' + O.dom.escapeHtml(m.text) + '</p></div>' +
          '</div></div>';
        el.chatScroll.appendChild(wrap);
      }
    });
    O.dom.scrollToBottom(el.chatScroll, false);
    return true;
  }

  O.pages.employee = {
    init: init,
    onShow: onShow,
    ask: ask
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
