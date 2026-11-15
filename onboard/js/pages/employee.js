/**
 * 初见 Onboard · 员工端页面逻辑
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
    sessionId: null
  };

  var el = {};

  /* ---------------------------------------------------------
   * 启动
   * ------------------------------------------------------- */
  function boot() {
    el.chatScroll = document.getElementById('chatScroll');
    el.chatInput = document.getElementById('chatInput');
    el.chatSend = document.getElementById('chatSend');
    el.employeeSelect = document.getElementById('employeeSelect');
    el.userAvatar = document.getElementById('userAvatar');
    el.quickChips = document.getElementById('quickChips');
    el.ticketList = document.getElementById('ticketList');
    el.backendBtn = document.getElementById('backendBtn');
    el.backendMenu = document.getElementById('backendMenu');
    el.storageBanner = document.getElementById('storageBanner');

    O.components.citation.bind();
    O.components.ticket.bindModal();

    var closeBtn = document.getElementById('handoffClose');
    if (closeBtn) closeBtn.addEventListener('click', O.components.ticket.closeHandoff);

    O.store.init(O.seed.build()).then(function (info) {
      if (!O.store.available && el.storageBanner) el.storageBanner.hidden = false;
      O.nlp.configApi.loadOverride();
      initEmployees();
      renderQuickChips();
      bindEvents();
      route();
      if (!restoreSession()) renderWelcome();
      renderTicketList();
    });
  }

  function initEmployees() {
    var employees = O.store.get('employees') || [];
    el.employeeSelect.innerHTML = employees.map(function (e) {
      return '<option value="' + O.dom.escapeHtml(e.id) + '">' +
        O.dom.escapeHtml(e.name + ' · ' + e.dept) + '（示例）</option>';
    }).join('');

    var current = employees.filter(function (e) { return e.status === '在职'; })[0] || employees[0];
    if (current) {
      state.employeeId = current.id;
      state.employee = current;
      el.employeeSelect.value = current.id;
    }
    updateAvatar();
  }

  function updateAvatar() {
    if (!state.employee) return;
    el.userAvatar.textContent = state.employee.avatarText || state.employee.name.charAt(0);
    el.userAvatar.style.background = state.employee.avatarColor || 'var(--navy-700)';
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
      var q = btn.getAttribute('data-q');
      goChat();
      ask(q);
    });

    el.employeeSelect.addEventListener('change', function () {
      var employees = O.store.get('employees') || [];
      var found = employees.filter(function (e) { return e.id === el.employeeSelect.value; })[0];
      if (!found) return;
      state.employeeId = found.id;
      state.employee = found;
      updateAvatar();
      if (!restoreSession()) renderWelcome();
      renderTicketList();
    });

    var sidebarHandoff = document.getElementById('sidebarHandoff');
    if (sidebarHandoff) {
      sidebarHandoff.addEventListener('click', function () {
        openHandoff('');
      });
    }

    el.backendBtn.addEventListener('click', function (event) {
      event.stopPropagation();
      var open = el.backendMenu.style.display === 'none' || !el.backendMenu.style.display;
      el.backendMenu.style.display = open ? 'block' : 'none';
    });

    O.dom.on(el.backendMenu, 'click', '[data-backend]', function (event, btn) {
      var kind = btn.getAttribute('data-backend');
      el.backendMenu.style.display = 'none';
      var map = {
        hr: { step: '第 3 步', name: 'HR 后台', detail: '管理员工、制度、年假、工单和入职任务' },
        ops: { step: '第 4 步', name: '运营后台', detail: '观察回答质量、定位知识缺口并持续优化' },
        learn: { step: '第 5 步', name: '学习后台', detail: '讲清这个产品的设计理念与实现思路' }
      };
      var info = map[kind];
      O.components.toast.show(info.name + ' 将在' + info.step + '交付（' + info.detail + '）', 'warn');
    });

    document.addEventListener('click', function () {
      el.backendMenu.style.display = 'none';
    });

    window.addEventListener('hashchange', route);
  }

  /* ---------------------------------------------------------
   * 路由
   * ------------------------------------------------------- */
  function route() {
    var hash = (window.location.hash || '#/chat').replace('#/', '');
    var map = {
      chat: 'chat', leave: 'leave', tickets: 'tickets', faq: 'faq'
    };
    var target = map[hash] || 'chat';

    ['chat', 'leave', 'tickets', 'faq'].forEach(function (name) {
      var view = document.getElementById('view-' + name);
      if (view) view.classList.toggle('is-active', name === target);
    });
    O.dom.$$('#topNav a').forEach(function (a) {
      a.classList.toggle('is-active', a.getAttribute('data-route') === target);
    });

    if (target === 'tickets') renderTicketList();
  }

  function goChat() {
    if (window.location.hash !== '#/chat') window.location.hash = '#/chat';
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
      var search = null;
      var answer;

      if (intent === 'chitchat') {
        search = { state: 'no_evidence', query: { tokens: [], keys: [] }, candidates: [], top: null, matchedTerms: [] };
        answer = O.nlp.answerer.build({ query: question, intent: intent, search: search });
      } else if (intent === 'handoff') {
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
    // 用候选条款自己的原文来组织答案
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

  // 候选条目在渲染时只保留了展示用的字段，这里从制度库里取回完整条款
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

  O.pages.employee = { init: boot, ask: ask };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
