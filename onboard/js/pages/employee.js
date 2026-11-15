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
    ready: false
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
  }

  /** 切换到某个页面时由外壳调用 */
  function onShow(pane) {
    if (pane === 'tickets') renderTicketList();
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
        return;
      }
    }

    var current = employees.filter(function (e) { return e.status === '在职'; })[0] || employees[0];
    if (current) {
      state.employeeId = current.id;
      state.employee = current;
      el.employeeSelect.value = current.id;
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
      if (!restoreSession()) renderWelcome();
      renderTicketList();
    });
  }

  /* ---------------------------------------------------------
   * 问答
   * ------------------------------------------------------- */
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

  function corpus() {
    var policies = O.store.get('policies') || [];
    var sig = policies.length + ':' + JSON.stringify(policies).length;
    if (!state.corpus || state.corpusSig !== sig) {
      state.corpus = O.nlp.retriever.build(policies);
      state.corpusSig = sig;
    }
    return state.corpus;
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
        onHandoff: function (a) { openHandoff(question, a, logId); },
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
      onHandoff: function (a) { openHandoff(built.text, a, logId); },
      onPick: function () { },
      onFeedback: function (value, a, id) { setFeedback(id, value); },
      onRewrite: function () { el.chatInput.focus(); }
    });
    el.chatScroll.appendChild(assistantEl);
    O.dom.scrollToBottom(el.chatScroll);
    pushSession({ role: 'assistant', text: built.text, at: new Date().toISOString(), answer: built, logId: logId });
  }

  function candidateClause(candidate) {
    var policies = O.store.get('policies') || [];
    for (var i = 0; i < policies.length; i++) {
      var clauses = policies[i].clauses || [];
      for (var j = 0; j < clauses.length; j++) {
        if (clauses[j].id === candidate.clauseId) return clauses[j];
      }
    }
    return { id: candidate.clauseId, no: candidate.clauseNo, heading: candidate.clauseHeading, text: candidate.fullText };
  }

  function candidatePolicy(candidate) {
    var policies = O.store.get('policies') || [];
    for (var i = 0; i < policies.length; i++) {
      var clauses = policies[i].clauses || [];
      for (var j = 0; j < clauses.length; j++) {
        if (clauses[j].id === candidate.clauseId) return policies[i];
      }
    }
    return {
      id: '', code: '', title: candidate.policyTitle, category: '', owner: '',
      version: candidate.version, effectiveDate: ''
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
          onHandoff: function (a) { openHandoff(m.text, a, m.logId); },
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
