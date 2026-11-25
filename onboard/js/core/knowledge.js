/**
 * 初见 Onboard · 制度知识库（浏览器端核心逻辑）
 *
 * 服务端负责文件存储、解析和鉴权；这里负责：
 *  - 带上身份证明调用知识库接口
 *  - 把已发布的文档转成检索器认识的「制度 + 条款」
 *
 * 身份证明：X-Onboard-Proof = sha256(salt + '::' + passwordHash)。
 * 它只出现在请求头里，不进 URL —— 直接打开下载地址拿不到证明，因此下不了原件。
 */
(function (root) {
  var O = root.Onboard;

  var CATEGORIES = ['公司制度', '入职指南', '报销制度', '请假制度', '部门制度', '福利保障'];

  var STATUS = {
    queued: { label: '排队中', tone: 'muted' },
    parsing: { label: '解析中', tone: 'info' },
    pending: { label: '待发布', tone: 'warn' },
    failed: { label: '失败', tone: 'danger' },
    published: { label: '已发布', tone: 'ok' },
    unpublished: { label: '已下架', tone: 'muted' }
  };

  var TABS = [
    { key: 'all', label: '全部', match: function () { return true; } },
    { key: 'published', label: '已发布', match: function (s) { return s === 'published'; } },
    { key: 'pending', label: '待发布', match: function (s) { return s === 'queued' || s === 'parsing' || s === 'pending'; } },
    { key: 'failed', label: '失败', match: function (s) { return s === 'failed'; } },
    { key: 'unpublished', label: '已下架', match: function (s) { return s === 'unpublished'; } }
  ];

  var MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
  var ALLOWED_EXT = ['.pdf', '.docx', '.txt', '.md'];

  /** 已发布文档缓存（供员工问答使用） */
  var cache = {
    version: 0,
    dept: '',
    docs: [],
    policies: [],
    loadedAt: 0
  };

  /**
   * 当前「查看身份」。
   *
   * 制度中心的列表、详情、下载，以及员工问答的取用，
   * 都以这个身份为准 —— 服务端按它判断谁能看哪份制度，
   * 前端不再自己写一套适用范围过滤。
   */
  var acting = { employeeId: null, name: '', dept: '', explicit: false };

  function setActing(employee) {
    if (!employee) return acting;
    acting = {
      employeeId: employee.id || null,
      name: employee.name || '',
      dept: String(employee.dept || '').trim(),
      explicit: true
    };
    return acting;
  }

  function getActing() {
    // 没显式设置过就退回当前登录账号自己的身份
    if (acting.explicit) return acting;
    var account = currentAccount();
    if (!account) return acting;
    return {
      employeeId: account.employeeId || null,
      name: account.name || '',
      dept: String(account.dept || '').trim(),
      explicit: false
    };
  }

  function esc(s) { return O.dom.escapeHtml(s); }

  function sha256Hex(text) {
    return O.sha256.hash(String(text || ''));
  }

  function currentAccount() {
    var user = O.auth && O.auth.currentUser ? O.auth.currentUser() : null;
    if (!user) return null;
    // 用最新的账号记录（角色/启用状态可能刚被改过）
    return (O.auth.findById(user.id) || user);
  }

  /** 拼上身份请求头 */
  function authHeaders(extra) {
    var account = currentAccount();
    var headers = extra || {};
    if (!account || !account.salt || !account.passwordHash) {
      return headers;
    }
    headers['X-Onboard-Account'] = account.id;
    headers['X-Onboard-Proof'] = sha256Hex(account.salt + '::' + account.passwordHash);
    return headers;
  }

  function request(url, options) {
    var opts = options || {};
    var headers = authHeaders(opts.headers || {});
    if (opts.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      return fetch(url, {
        method: opts.method || 'GET',
        headers: headers,
        body: JSON.stringify(opts.json)
      });
    }
    if (opts.body !== undefined) {
      return fetch(url, { method: opts.method || 'POST', headers: headers, body: opts.body });
    }
    return fetch(url, { method: opts.method || 'GET', headers: headers });
  }

  function parseResponse(res) {
    return res.text().then(function (text) {
      var data = null;
      try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
      if (!res.ok) {
        var message = (data && data.error) ? data.error : ('请求失败（HTTP ' + res.status + '）');
        var err = new Error(message);
        err.status = res.status;
        throw err;
      }
      return data || {};
    });
  }

  /* ---------------------------------------------------------
   * 接口
   * ------------------------------------------------------- */

  function listDocs() {
    return request('/api/kb/docs').then(parseResponse);
  }

  function previewDoc(id) {
    return request('/api/kb/docs/' + encodeURIComponent(id) + '/preview').then(parseResponse);
  }

  function retryDoc(id) {
    return request('/api/kb/docs/' + encodeURIComponent(id) + '/retry', { method: 'POST' }).then(parseResponse);
  }

  function publishDoc(id) {
    return request('/api/kb/docs/' + encodeURIComponent(id) + '/publish', { method: 'POST' }).then(parseResponse);
  }

  function unpublishDoc(id) {
    return request('/api/kb/docs/' + encodeURIComponent(id) + '/unpublish', { method: 'POST' }).then(parseResponse);
  }

  /**
   * 上传：文件本身作为 body，元数据放请求头（不走 multipart）。
   * 打开页面前先 syncNow 一次，保证服务端拿到的账号/角色是最新的。
   */
  function uploadDoc(file, meta) {
    var headers = authHeaders({
      'X-KB-Meta': btoa(unescape(encodeURIComponent(JSON.stringify(meta))))
    });
    headers['Content-Type'] = 'application/octet-stream';
    return fetch('/api/kb/docs', { method: 'POST', headers: headers, body: file })
      .then(parseResponse);
  }

  /** 当前查看身份对应的查询参数（服务端据此判断可见范围） */
  function actingQuery() {
    var who = getActing();
    return who && who.employeeId ? ('?employeeId=' + encodeURIComponent(who.employeeId)) : '';
  }

  /** 制度中心：当前身份能看到的全部制度（服务端已按同一套规则过滤） */
  function visiblePolicies() {
    return request('/api/kb/visible' + actingQuery()).then(parseResponse);
  }

  /** 制度正文预览：基线示例制度和知识库文档都走这个接口 */
  function previewPolicy(id) {
    return request('/api/kb/policy/' + encodeURIComponent(id) + '/preview' + actingQuery())
      .then(parseResponse);
  }

  /** 下载原件：权限规则与列表、详情一致 */
  function downloadPolicy(id, originalName) {
    return request('/api/kb/policy/' + encodeURIComponent(id) + '/file' + actingQuery())
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (text) {
            var data = null;
            try { data = text ? JSON.parse(text) : null; } catch (e) { /* ignore */ }
            throw new Error((data && data.error) || ('下载失败（HTTP ' + res.status + '）'));
          });
        }
        return res.blob().then(function (blob) {
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = originalName || ('制度原文' + (blob.type === 'application/pdf' ? '.pdf' : ''));
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        });
      });
  }

  /** 下载原始文件（管理后台用）：走带请求头的 fetch，拿到 blob 再触发浏览器保存 */
  function downloadDoc(id, originalName) {
    return request('/api/kb/docs/' + encodeURIComponent(id) + '/file').then(function (res) {
      if (!res.ok) {
        return res.text().then(function (text) {
          var data = null;
          try { data = text ? JSON.parse(text) : null; } catch (e) { /* ignore */ }
          throw new Error((data && data.error) || ('下载失败（HTTP ' + res.status + '）'));
        });
      }
      return res.blob().then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = originalName || ('制度原文' + (blob.type === 'application/pdf' ? '.pdf' : ''));
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      });
    });
  }

  /* ---------------------------------------------------------
   * 已发布文档 → 制度 / 条款
   * ------------------------------------------------------- */

  function blockText(block) {
    if (!block) return '';
    if (block.type === 'table') {
      return (block.rows || []).map(function (row) { return (row || []).join(' '); }).join('。');
    }
    return String(block.text || '');
  }

  /** 把 blocks 切成一段一段的检索单元（表格整块保留，不拆行） */
  function chunkBlocks(blocks, maxChars) {
    var chunks = [];
    var current = { heading: '', parts: [] };
    var currentLength = 0;
    // 文档大标题（第一个标题）作为没有小标题时的兜底
    var docHeading = '';

    function flush() {
      var text = current.parts.join('\n').trim();
      if (text) {
        chunks.push({ heading: current.heading || docHeading || '正文', text: text });
      }
      current = { heading: '', parts: [] };
      currentLength = 0;
    }

    (blocks || []).forEach(function (block) {
      if (block.type === 'heading') {
        var headingText = String(block.text || '').trim();
        if (!docHeading) docHeading = headingText;
        flush();
        current.heading = headingText;
        return;
      }
      var text = blockText(block);
      if (!text) return;
      if (currentLength + text.length > maxChars && current.parts.length) flush();
      current.parts.push(text);
      currentLength += text.length;
    });
    flush();
    return chunks;
  }

  /** 去掉标题里的编号前缀：一、 第3条 （一） 1. 2) */
  function stripNumbering(text) {
    return String(text || '')
      .replace(/^\s*(?:第\s*[0-9一二三四五六七八九十百]+\s*[条章节部分]?|[0-9]+\s*[.、)）]|[一二三四五六七八九十百]+\s*[、.）)]|[（(]\s*[一二三四五六七八九十百0-9]+\s*[)）])\s*/, '')
      .trim();
  }

  /**
   * 从标题、表格表头里提取检索关键词。
   *
   * 上传文档没有人工整理的「关键词 / 常见问法」字段，而检索器给这两个字段的权重最高
   * （keywords 3.0、questions 2.6）。不补的话，知识库里的制度几乎永远排在示例制度后面。
   * 这里只从文档自己的标题和表头里取词，不凭空生成问句。
   */
  function deriveKeywords(doc, chunk) {
    var words = [];
    function push(text) {
      var value = stripNumbering(text);
      if (!value || value.length > 24) return;
      if (value.length >= 2) words.push(value);
    }

    push(chunk.heading);
    push(doc.title);
    if (doc.category) push(doc.category);

    // 表格：把表头单元格也当作关键词（「标准」「每日标准」这类词员工常直接问）
    (doc.blocks || []).forEach(function (block) {
      if (block.type !== 'table' || !block.rows || !block.rows.length) return;
      var head = block.rows[0] || [];
      head.forEach(function (cell) {
        var value = String(cell || '').trim();
        if (value && value.length >= 2 && value.length <= 12) words.push(value);
      });
    });

    // 去重
    var seen = {};
    var out = [];
    words.forEach(function (w) {
      if (seen[w]) return;
      seen[w] = true;
      out.push(w);
    });
    return out.slice(0, 12);
  }

  /**
   * 文档 → policy（带 clauses）
   * 条款号用「第 N 段」，不编造制度条款号，保证引用可核对。
   */
  function docToPolicy(doc) {
    var chunks = chunkBlocks(doc.blocks || [], 500);
    if (!chunks.length) return null;

    var owner = doc.scope === 'dept' ? (doc.dept || '指定部门') : '全体员工';
    var summary = (doc.blocks || []).slice(0, 3).map(blockText).filter(Boolean).join(' ').slice(0, 160);

    var clauses = chunks.map(function (chunk, index) {
      return {
        id: 'KB-' + doc.id + '-P' + (index + 1),
        no: '第 ' + (index + 1) + ' 段',
        heading: chunk.heading || '正文',
        text: chunk.text,
        keywords: deriveKeywords(doc, chunk),
        questions: [],
        mustCite: true,
        note: '来自制度知识库上传文档（' + (doc.originalName || '') + '）'
      };
    });

    return {
      id: 'KB-' + doc.id,
      code: doc.id,
      title: doc.title,
      category: doc.category,
      owner: owner,
      version: doc.version,
      effectiveDate: doc.effectiveDate,
      status: '生效中',
      source: '制度知识库',
      scope: doc.scope,
      dept: doc.dept,
      tags: [doc.category, '制度知识库'].filter(Boolean),
      summary: summary,
      clauses: clauses
    };
  }

  /**
   * 拉取已发布制度（问答取用）。
   *
   * 可见范围完全由服务端判断（和制度中心的列表、详情、下载同一套规则），
   * 前端不再自己过滤适用范围 —— 免得两处各写一套、越走越偏。
   */
  function refreshPublished() {
    var who = getActing();
    return request('/api/kb/published' + actingQuery()).then(parseResponse).then(function (data) {
      var docs = (data && data.docs) || [];
      var policies = docs.map(docToPolicy).filter(Boolean);
      cache = {
        version: (data && data.version) || 0,
        dept: (data && data.identity && data.identity.dept) || who.dept || '',
        docs: docs,
        policies: policies,
        loadedAt: Date.now()
      };
      return cache;
    }).catch(function (error) {
      // 拉取失败不要影响问答：清空缓存并把错误抛给调用方决定是否提示
      cache = { version: 0, dept: '', docs: [], policies: [], loadedAt: 0 };
      throw error;
    });
  }

  function publishedPolicies() {
    return cache.policies || [];
  }

  function publishedVersion() {
    return cache.version || 0;
  }

  /* ---------------------------------------------------------
   * 上传前的本地校验
   * ------------------------------------------------------- */

  function fileExt(name) {
    var text = String(name || '');
    var i = text.lastIndexOf('.');
    return i >= 0 ? text.slice(i).toLowerCase() : '';
  }

  function validateUpload(file, meta) {
    if (!file) return { ok: false, field: 'file', message: '请选择要上传的文件' };
    var ext = fileExt(file.name);
    if (ALLOWED_EXT.indexOf(ext) < 0) {
      return { ok: false, field: 'file', message: '只支持 PDF、Word(.docx)、TXT、Markdown 文件' };
    }
    if (ext === '.doc') {
      return { ok: false, field: 'file', message: '暂不支持旧版 .doc，请用 Word 另存为 .docx 后上传' };
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return { ok: false, field: 'file', message: '文件超过 20MB，请压缩后再上传' };
    }
    if (file.size === 0) return { ok: false, field: 'file', message: '文件是空的' };

    if (!String(meta.title || '').trim()) return { ok: false, field: 'title', message: '请填写制度名称' };
    if (CATEGORIES.indexOf(meta.category) < 0) return { ok: false, field: 'category', message: '请选择制度分类' };
    if (meta.scope !== 'all' && meta.scope !== 'dept') {
      return { ok: false, field: 'scope', message: '请选择适用范围' };
    }
    if (meta.scope === 'dept' && !String(meta.dept || '').trim()) {
      return { ok: false, field: 'dept', message: '选择了指定部门，请填写部门名称' };
    }
    if (!String(meta.version || '').trim()) return { ok: false, field: 'version', message: '请填写版本号' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(meta.effectiveDate || ''))) {
      return { ok: false, field: 'effectiveDate', message: '请选择生效日期' };
    }
    return { ok: true };
  }

  O.knowledge = {
    CATEGORIES: CATEGORIES,
    STATUS: STATUS,
    TABS: TABS,
    MAX_UPLOAD_BYTES: MAX_UPLOAD_BYTES,
    ALLOWED_EXT: ALLOWED_EXT,
    listDocs: listDocs,
    previewDoc: previewDoc,
    retryDoc: retryDoc,
    publishDoc: publishDoc,
    unpublishDoc: unpublishDoc,
    uploadDoc: uploadDoc,
    downloadDoc: downloadDoc,
    visiblePolicies: visiblePolicies,
    previewPolicy: previewPolicy,
    downloadPolicy: downloadPolicy,
    setActing: setActing,
    getActing: getActing,
    refreshPublished: refreshPublished,
    publishedPolicies: publishedPolicies,
    publishedVersion: publishedVersion,
    docToPolicy: docToPolicy,
    validateUpload: validateUpload,
    fileExt: fileExt,
    esc: esc
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
