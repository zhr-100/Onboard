/**
 * 初见 Onboard · 转人工弹窗与工单卡片
 */
(function (root) {
  var O = root.Onboard;
  O.components = O.components || {};

  function esc(s) { return O.dom.escapeHtml(s); }

  var CATEGORIES = ['假期福利', '考勤管理', '薪酬福利', '入职管理', '报销与差旅', '办公与IT', '行为合规', '其他'];

  /** 打开转人工弹窗 */
  function openHandoff(options) {
    options = options || {};
    var mask = document.getElementById('handoffModal');
    var question = document.getElementById('handoffQuestion');
    var category = document.getElementById('handoffCategory');
    var note = document.getElementById('handoffNote');

    if (!mask || !question) return;

    question.value = options.question || '';
    if (category) {
      category.innerHTML = CATEGORIES.map(function (c) {
        return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
      }).join('');
      if (options.category) category.value = options.category;
    }
    if (note) {
      note.textContent = options.question
        ? '我们会把你这个问题转给 HR，同时保留刚才的检索记录，方便同事快速了解背景。'
        : '请描述一下你的问题，HR 同事会在工作时间内回复。';
    }

    mask.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(function () { question.focus(); }, 30);

    mask.__onSubmit = options.onSubmit;
  }

  function closeHandoff() {
    var mask = document.getElementById('handoffModal');
    if (!mask) return;
    mask.hidden = true;
    document.body.style.overflow = '';
  }

  function bindModal() {
    var mask = document.getElementById('handoffModal');
    if (!mask) return;
    mask.addEventListener('click', function (event) {
      if (event.target === mask) closeHandoff();
    });
    var cancel = document.getElementById('handoffCancel');
    if (cancel) cancel.addEventListener('click', closeHandoff);
    var submit = document.getElementById('handoffSubmit');
    if (submit) {
      submit.addEventListener('click', function () {
        var question = document.getElementById('handoffQuestion');
        var category = document.getElementById('handoffCategory');
        var text = (question.value || '').trim();
        if (!text) {
          O.components.toast.show('请先写下你的问题', 'warn');
          question.focus();
          return;
        }
        var handler = mask.__onSubmit;
        closeHandoff();
        if (handler) handler(text, category ? category.value : '其他');
      });
    }
  }

  function timeline(ticket) {
    var msgs = (ticket.messages || []).filter(function (m) {
      return m.visibleToEmployee !== false;
    });
    if (!msgs.length) return '';
    return msgs.map(function (m) {
      var cls = m.authorType === 'hr' ? 'hr' : (m.authorType === 'system' ? 'system' : '');
      var label = m.authorType === 'hr' ? (m.authorName || 'HR') :
        (m.authorType === 'system' ? '系统' : (m.authorName || '我'));
      return '' +
        '<div class="tl-item">' +
          '<div class="tl-dot ' + cls + '">' + (m.authorType === 'hr' ? 'HR' : (m.authorType === 'system' ? '系' : '我')) + '</div>' +
          '<div class="tl-content">' +
            '<div class="tl-meta">' + esc(label) + ' · ' + esc(O.format.dateTime(m.at)) + '</div>' +
            '<div class="tl-text">' + esc(m.content) + '</div>' +
          '</div>' +
        '</div>';
    }).join('');
  }

  /** 单个工单卡片 */
  function renderCard(ticket) {
    var el = document.createElement('div');
    el.className = 'ticket';
    var tone = O.format.statusTone(ticket.status);
    var last = (ticket.messages || [])[ticket.messages.length - 1];

    el.innerHTML =
      '<div class="ticket-head">' +
        '<div style="flex:1;min-width:0">' +
          '<div class="ticket-title">' + esc(ticket.title) + '</div>' +
          '<div class="ticket-meta">' +
            esc(ticket.category) + ' · 编号 ' + esc(ticket.id) + ' · 创建于 ' + esc(O.format.dateTime(ticket.createdAt)) +
            (ticket.assignee ? ' · 负责人 ' + esc(ticket.assignee) : '') +
          '</div>' +
        '</div>' +
        '<span class="badge badge-' + tone + '">' + esc(ticket.status) + '</span>' +
        '<span class="badge badge-' + O.format.priorityTone(ticket.priority) + '">' + esc(ticket.priority) + '</span>' +
      '</div>' +
      '<div class="ticket-body" hidden>' +
        (ticket.question ? '<div class="tl-meta" style="margin-top:16px">我的问题</div><div class="tl-text">' + esc(ticket.question) + '</div>' : '') +
        '<div class="timeline">' + timeline(ticket) + '</div>' +
        (ticket.resolution ? '<div class="tl-meta">处理结果</div><div class="tl-text">' + esc(ticket.resolution) + '</div>' : '') +
        (last ? '' : '') +
      '</div>';

    el.querySelector('.ticket-head').addEventListener('click', function () {
      var body = el.querySelector('.ticket-body');
      body.hidden = !body.hidden;
    });
    return el;
  }

  function renderList(tickets) {
    var list = tickets || [];
    var wrap = document.createElement('div');
    if (!list.length) {
      wrap.innerHTML =
        '<div class="empty">' +
          '<div class="empty-icon">📮</div>' +
          '<div class="empty-title">还没有工单</div>' +
          '<div class="empty-desc">在问答页面点击「转人工」，HR 同事会在这里回复你。</div>' +
        '</div>';
      return wrap;
    }
    list.forEach(function (t) { wrap.appendChild(renderCard(t)); });
    return wrap;
  }

  O.components.ticket = {
    openHandoff: openHandoff,
    closeHandoff: closeHandoff,
    bindModal: bindModal,
    renderCard: renderCard,
    renderList: renderList,
    CATEGORIES: CATEGORIES
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
