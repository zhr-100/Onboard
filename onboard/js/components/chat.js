/**
 * 初见 Onboard · 消息渲染
 */
(function (root) {
  var O = root.Onboard;
  O.components = O.components || {};

  function esc(s) { return O.dom.escapeHtml(s); }

  function renderUser(text) {
    var el = document.createElement('div');
    el.className = 'msg user';
    el.innerHTML =
      '<div class="msg-row">' +
        '<div class="msg-body">' +
          '<div class="msg-name">我</div>' +
          '<div class="bubble">' + esc(text) + '</div>' +
        '</div>' +
        '<div class="msg-avatar user">我</div>' +
      '</div>';
    return el;
  }

  function renderTyping() {
    var el = document.createElement('div');
    el.className = 'msg assistant';
    el.innerHTML =
      '<div class="msg-row">' +
        '<div class="msg-avatar">初</div>' +
        '<div class="msg-body">' +
          '<div class="msg-name">初见助手</div>' +
          '<div class="bubble"><div class="typing"><i></i><i></i><i></i></div></div>' +
        '</div>' +
      '</div>';
    return el;
  }

  function renderNoEvidence(answer, opts) {
    var terms = (answer.matchedTerms || []).map(function (t) {
      return '<span class="term-tag">' + esc(t) + '</span>';
    }).join('');

    return '' +
      '<div class="nofind">' +
        '<div class="nofind-head"><span aria-hidden="true">🔍</span><span>没找到相关规定</span></div>' +
        '<div class="nofind-text">' + esc(answer.hint || '') + '</div>' +
        '<div class="nofind-terms">' +
          '<span class="nofind-terms-label">已检索的关键词：</span>' +
          (terms || '<span class="term-tag">（无有效关键词）</span>') +
        '</div>' +
        '<div class="nofind-actions">' +
          '<button class="btn btn-primary btn-sm" data-action="handoff">转人工</button>' +
          '<button class="btn btn-ghost btn-sm" data-action="rewrite">换个说法再问</button>' +
        '</div>' +
      '</div>';
  }

  function renderAmbiguous(answer, opts) {
    var items = (answer.candidates || []).map(function (c, i) {
      return '' +
        '<button class="ambiguous-item" type="button" data-action="pick" data-index="' + i + '">' +
          '<div class="amb-title">' + esc(c.clauseNo) + '「' + esc(c.clauseHeading) + '」 · 《' + esc(c.policyTitle) + '》</div>' +
          '<div class="amb-text">' + esc(c.excerpt) + '</div>' +
        '</button>';
    }).join('');

    return '' +
      '<div class="nofind" style="border-color:var(--border-strong);background:var(--surface-2)">' +
        '<div class="nofind-head" style="color:var(--text-2)"><span aria-hidden="true">🤔</span><span>请确认你说的是哪一条</span></div>' +
        '<div class="ambiguous-list">' + items + '</div>' +
        '<div class="nofind-actions">' +
          '<button class="btn btn-primary btn-sm" data-action="handoff">转人工</button>' +
        '</div>' +
      '</div>';
  }

  function renderActions(answer, opts) {
    var actions = [];
    if (answer.state === 'hit') {
      actions.push('<button class="act" data-action="feedback" data-value="helpful">有帮助</button>');
      actions.push('<button class="act" data-action="feedback" data-value="unhelpful">没帮助</button>');
      actions.push('<button class="act" data-action="copy">复制依据</button>');
      actions.push('<button class="act" data-action="rewrite">继续追问</button>');
    } else if (answer.state === 'ambiguous') {
      actions.push('<button class="act" data-action="rewrite">换个说法再问</button>');
      actions.push('<button class="act" data-action="handoff">转人工</button>');
    } else if (answer.state === 'partial') {
      actions.push('<button class="act" data-action="feedback" data-value="helpful">有帮助</button>');
      actions.push('<button class="act" data-action="feedback" data-value="unhelpful">没帮助</button>');
      actions.push('<button class="act" data-action="handoff">转人工</button>');
    }
    return actions.length ? '<div class="msg-actions">' + actions.join('') + '</div>' : '';
  }

  /**
   * opts: { logId, onHandoff, onPick, onFeedback, onRewrite }
   */
  function renderAssistant(answer, opts) {
    opts = opts || {};
    var el = document.createElement('div');
    el.className = 'msg assistant';

    var inner = '';
    inner += '<p>' + esc(answer.text) + '</p>';

    if (answer.bullets && answer.bullets.length) {
      inner += '<ul class="answer-points">' +
        answer.bullets.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') +
        '</ul>';
    }

    if (answer.hint) {
      inner += '<div class="answer-note">' + esc(answer.hint) + '</div>';
    }

    if (answer.disclaimer) {
      inner += '<div class="answer-note">' + esc(answer.disclaimer) + '</div>';
    }

    if (answer.state === 'no_evidence') {
      inner += renderNoEvidence(answer, opts);
    } else if (answer.state === 'ambiguous') {
      inner += renderAmbiguous(answer, opts);
    }

    el.innerHTML =
      '<div class="msg-row">' +
        '<div class="msg-avatar">初</div>' +
        '<div class="msg-body">' +
          '<div class="msg-name">初见助手</div>' +
          '<div class="bubble">' + inner + '</div>' +
          '<div class="msg-actions-wrap">' + renderActions(answer, opts) + '</div>' +
        '</div>' +
      '</div>';

    // 依据卡（要挂真实 DOM 节点，展开/收起才方便）
    if (answer.citations && answer.citations.length) {
      var cit = O.components.citation.render(
        answer.citations,
        answer.state === 'partial' ? '相关条款（没有完整覆盖你的问题）' : '依据'
      );
      if (cit) {
        var bubble = el.querySelector('.bubble');
        bubble.insertBefore(cit, bubble.querySelector('.msg-actions-wrap') || null);
      }
    }

    // 事件
    el.addEventListener('click', function (event) {
      var btn = event.target.closest ? event.target.closest('[data-action]') : null;
      if (!btn) return;
      var action = btn.getAttribute('data-action');
      if (action === 'handoff' && opts.onHandoff) {
        opts.onHandoff(answer);
      } else if (action === 'rewrite' && opts.onRewrite) {
        opts.onRewrite();
      } else if (action === 'pick' && opts.onPick) {
        var idx = parseInt(btn.getAttribute('data-index'), 10);
        opts.onPick(answer.candidates[idx], answer);
      } else if (action === 'feedback' && opts.onFeedback) {
        var value = btn.getAttribute('data-value');
        btn.parentNode.querySelectorAll('[data-action="feedback"]').forEach(function (b) {
          b.classList.remove('is-on');
        });
        btn.classList.add('is-on');
        opts.onFeedback(value, answer, opts.logId);
      } else if (action === 'copy') {
        var text = (answer.citations || []).map(function (c) {
          return '《' + c.policyTitle + '》' + c.clauseNo + ' ' + c.clauseHeading + '\n' + c.fullText;
        }).join('\n\n');
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () {
            O.components.toast.show('依据已复制到剪贴板', 'ok');
          }).catch(function () {
            O.components.toast.show('复制失败，请手动选择文本', 'warn');
          });
        } else {
          O.components.toast.show('当前浏览器不支持一键复制', 'warn');
        }
      }
    });

    return el;
  }

  O.components.chat = {
    renderUser: renderUser,
    renderAssistant: renderAssistant,
    renderTyping: renderTyping
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
