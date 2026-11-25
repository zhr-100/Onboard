/**
 * 初见 Onboard · 制度知识库服务
 *
 * 服务端负责：
 *  - 原始文件私有存储（data/kb/files）
 *  - 元数据（data/kb/docs.json）与解析结果（data/kb/text）
 *  - 单并发后台解析队列（worker_threads，页面轮询不会被卡住）
 *  - 知识库 API 的鉴权与权限校验
 *
 * 知识库数据刻意不放进 data/runtime-state.json：浏览器同步会整份覆盖那个文件。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Worker } = require('worker_threads');
const url = require('url');
const querystring = require('querystring');
const pdfParser = require('./kb-parsers/pdf');

const CATEGORIES = ['公司制度', '入职指南', '报销制度', '请假制度', '部门制度', '福利保障'];
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_META_HEADER = 8192;
const MAX_PREVIEW_CHARS = 200000;
const PARSE_TIMEOUT_MS = 90000;
const ID_RE = /^kb_[a-f0-9]{16,40}$/;

const PENDING_STATUSES = ['queued', 'parsing', 'pending'];

function pad(n) { return n < 10 ? '0' + n : String(n); }

function todayLocal() {
  var d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function nowIso() {
  return new Date().toISOString();
}

function friendlyError(message) {
  var err = new Error(message);
  err.friendly = true;
  return err;
}

function validDate(value) {
  var m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  var dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

function safeOriginalName(value) {
  var text = String(value || '').split(/[\\/]/).pop() || '';
  text = text.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (!text) text = 'document';
  if (text.length > 160) {
    var extIndex = text.lastIndexOf('.');
    var ext = extIndex > 0 ? text.slice(extIndex) : '';
    text = text.slice(0, 160 - ext.length) + ext;
  }
  return text;
}

function publicDoc(doc) {
  return {
    id: doc.id,
    title: doc.title,
    category: doc.category,
    scope: doc.scope,
    dept: doc.dept,
    version: doc.version,
    effectiveDate: doc.effectiveDate,
    originalName: doc.originalName,
    ext: doc.ext,
    mime: doc.mime,
    size: doc.size,
    status: doc.status,
    error: doc.error || null,
    warnings: doc.warnings || [],
    stats: doc.stats || {},
    uploadedBy: doc.uploadedBy,
    uploadedAt: doc.uploadedAt,
    updatedAt: doc.updatedAt,
    parseStartedAt: doc.parseStartedAt || null,
    parseFinishedAt: doc.parseFinishedAt || null,
    attempts: doc.attempts || 0,
    publishedAt: doc.publishedAt || null,
    unpublishedAt: doc.unpublishedAt || null
  };
}

function blockText(block) {
  if (!block) return '';
  if (block.type === 'table') {
    return (block.rows || []).map(function (row) { return (row || []).join(' | '); }).join('\n');
  }
  return String(block.text || '');
}

function truncateBlocks(blocks, maxChars) {
  var out = [];
  var total = 0;
  var truncated = false;
  for (var i = 0; i < blocks.length; i++) {
    var block = blocks[i];
    var text = blockText(block);
    if (total + text.length > maxChars) {
      truncated = true;
      break;
    }
    out.push(block);
    total += text.length;
  }
  return { blocks: out, truncated: truncated };
}

function createKnowledgeService(options) {
  var root = options.root;
  var config = options.config || {};
  var readState = options.readState;
  var getPermissions = options.getPermissions;
  var getBaselinePolicies = options.getBaselinePolicies;

  var KB_DIR = path.join(root, 'data', 'kb');
  var DOCS_FILE = path.join(KB_DIR, 'docs.json');
  var FILES_DIR = path.join(KB_DIR, 'files');
  var TEXT_DIR = path.join(KB_DIR, 'text');
  var TMP_DIR = path.join(KB_DIR, 'tmp');
  var WORKER_PATH = path.join(__dirname, 'kb-parse-worker.js');

  var state = null;
  var queue = [];
  var queued = {};
  var busy = false;
  var currentWorker = null;

  /* ---------------- 存储 ---------------- */

  function loadState() {
    if (state) return state;
    ensureDirs();
    try {
      var parsed = JSON.parse(fs.readFileSync(DOCS_FILE, 'utf8'));
      state = {
        schemaVersion: 1,
        kbVersion: Number(parsed.kbVersion) || 0,
        docs: Array.isArray(parsed.docs) ? parsed.docs : []
      };
    } catch (e) {
      state = { schemaVersion: 1, kbVersion: 0, docs: [] };
    }
    return state;
  }

  function saveState() {
    ensureDirs();
    state.kbVersion = (Number(state.kbVersion) || 0) + 1;
    var tmp = DOCS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, DOCS_FILE);
    return state.kbVersion;
  }

  /** 目录可能被手工删掉，这里随时补回来 */
  function ensureDirs() {
    [KB_DIR, FILES_DIR, TEXT_DIR, TMP_DIR].forEach(function (dir) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (e) { /* ignore */ }
    });
  }

  function findDoc(id) {
    loadState();
    return state.docs.filter(function (d) { return d.id === id; })[0] || null;
  }

  function safeKbPath(base, name) {
    var resolved = path.resolve(base, name);
    if (resolved !== base && !resolved.startsWith(base + path.sep)) return null;
    return resolved;
  }

  function filePathOf(doc) {
    if (!doc || !doc.storedName) return null;
    return safeKbPath(FILES_DIR, doc.storedName);
  }

  function textPathOf(id) {
    if (!ID_RE.test(String(id))) return null;
    return safeKbPath(TEXT_DIR, id + '.json');
  }

  function readText(id) {
    var file = textPathOf(id);
    if (!file) return null;
    try {
      var parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!parsed || !Array.isArray(parsed.blocks)) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  /* ---------------- 鉴权 ---------------- */

  function accountsFromState() {
    var runtime = readState();
    if (!runtime || !Array.isArray(runtime.accounts)) return null;
    return runtime.accounts;
  }

  function proofFor(account) {
    return crypto.createHash('sha256')
      .update(String(account.salt || '') + '::' + String(account.passwordHash || ''), 'utf8')
      .digest('hex');
  }

  function safeEqualHex(a, b) {
    var ba, bb;
    try {
      ba = Buffer.from(String(a), 'hex');
      bb = Buffer.from(String(b), 'hex');
    } catch (e) {
      return false;
    }
    if (!ba.length || ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  }

  function authenticate(req) {
    var id = String(req.headers['x-onboard-account'] || '').trim();
    var proof = String(req.headers['x-onboard-proof'] || '').trim();
    if (!id || !proof) return { ok: false, status: 401, error: '未登录或缺少身份信息' };

    var accounts = accountsFromState();
    if (!accounts) return { ok: false, status: 401, error: '服务端还没有账号数据，请刷新页面后重试' };

    var account = accounts.filter(function (a) { return a && a.id === id; })[0];
    if (!account) return { ok: false, status: 401, error: '登录状态无效，请重新登录' };
    if (account.enabled === false) return { ok: false, status: 403, error: '该账号已停用' };
    if (!account.salt || !account.passwordHash) return { ok: false, status: 401, error: '账号数据不完整，请重新登录' };
    if (!safeEqualHex(proofFor(account), proof)) {
      return { ok: false, status: 401, error: '登录状态无效，请重新登录' };
    }
    return { ok: true, account: account };
  }

  function permissionCan(account, permission) {
    try {
      var permissions = getPermissions();
      return !!(permissions && permissions.can(account, permission));
    } catch (e) {
      return false;
    }
  }

  function authorize(req, permission) {
    var auth = authenticate(req);
    if (!auth.ok) return auth;
    if (!permissionCan(auth.account, permission)) {
      return { ok: false, status: 403, error: '你的角色没有这项权限' };
    }
    return auth;
  }

  /** 请求里的「查看身份」：员工编号 */
  function queryEmployeeId(req) {
    try {
      var parsed = url.parse(req.url);
      if (!parsed.query) return '';
      var query = querystring.parse(parsed.query);
      return String(query.employeeId || '').trim();
    } catch (e) {
      return '';
    }
  }

  /* ---------------- HTTP 小工具 ---------------- */

  function sendJson(res, status, payload) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(JSON.stringify(payload));
  }

  function sendError(res, status, message) {
    sendJson(res, status, { ok: false, error: message });
  }

  function readRawBody(req, limit) {
    return new Promise(function (resolve, reject) {
      var declared = Number(req.headers['content-length'] || 0);
      if (declared && declared > limit) {
        var e = friendlyError('文件超过 20MB，无法上传');
        e.statusCode = 413;
        try { req.destroy(); } catch (err) { /* ignore */ }
        reject(e);
        return;
      }

      var chunks = [];
      var total = 0;
      var settled = false;

      function done(err, value) {
        if (settled) return;
        settled = true;
        if (err) reject(err);
        else resolve(value);
      }

      req.on('data', function (chunk) {
        total += chunk.length;
        if (total > limit) {
          var tooBig = friendlyError('文件超过 20MB，无法上传');
          tooBig.statusCode = 413;
          try { req.destroy(); } catch (e) { /* ignore */ }
          done(tooBig);
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', function () {
        done(null, Buffer.concat(chunks));
      });
      req.on('error', function (err) {
        done(err);
      });
    });
  }

  function parseMetadataHeader(req) {
    var raw = String(req.headers['x-kb-meta'] || '');
    if (!raw) return { ok: false, error: '缺少制度信息' };
    if (raw.length > MAX_META_HEADER) return { ok: false, error: '制度信息过长' };
    try {
      var text = Buffer.from(raw, 'base64').toString('utf8');
      var meta = JSON.parse(text);
      return { ok: true, meta: meta };
    } catch (e) {
      return { ok: false, error: '制度信息格式不正确' };
    }
  }

  function validateMeta(raw, originalName) {
    var meta = raw || {};
    var title = String(meta.title || '').trim();
    var category = String(meta.category || '').trim();
    var scope = meta.scope === 'dept' ? 'dept' : (meta.scope === 'all' ? 'all' : '');
    var dept = scope === 'dept' ? String(meta.dept || '').trim() : '';
    var version = String(meta.version || '').trim();
    var effectiveDate = String(meta.effectiveDate || '').trim();

    if (!title) return { ok: false, error: '请填写制度名称' };
    if (title.length > 100) return { ok: false, error: '制度名称不能超过 100 个字' };
    if (CATEGORIES.indexOf(category) < 0) return { ok: false, error: '请选择正确的制度分类' };
    if (!scope) return { ok: false, error: '请选择适用范围' };
    if (scope === 'dept' && !dept) return { ok: false, error: '选择了指定部门，请填写部门名称' };
    if (dept.length > 20) return { ok: false, error: '部门名不能超过 20 个字' };
    if (!version) return { ok: false, error: '请填写版本号' };
    if (version.length > 20) return { ok: false, error: '版本号不能超过 20 个字' };
    if (!validDate(effectiveDate)) return { ok: false, error: '请选择有效的生效日期' };

    return {
      ok: true,
      value: {
        title: title,
        category: category,
        scope: scope,
        dept: scope === 'dept' ? dept : null,
        version: version,
        effectiveDate: effectiveDate,
        originalName: safeOriginalName(originalName)
      }
    };
  }

  /* ---------------- 解析队列 ---------------- */

  function enqueue(id) {
    if (!id || queued[id]) return;
    queued[id] = true;
    queue.push(id);
    setImmediate(processNext);
  }

  function finishQueue() {
    busy = false;
    currentWorker = null;
    processNext();
  }

  function markParseFailed(doc, message) {
    if (!doc) return;
    doc.status = 'failed';
    doc.error = message;
    doc.parseFinishedAt = nowIso();
    doc.updatedAt = nowIso();
    saveState();
  }

  function processNext() {
    if (busy) return;
    loadState();

    var id;
    do {
      id = queue.shift();
      if (id === undefined) return;
      delete queued[id];
    } while (id && !findDoc(id));

    var doc = findDoc(id);
    if (!doc || doc.status !== 'queued') {
      processNext();
      return;
    }

    var source = filePathOf(doc);
    if (!source || !fs.existsSync(source)) {
      markParseFailed(doc, '原始文件丢失，无法解析；请重新上传');
      processNext();
      return;
    }

    busy = true;
    ensureDirs();
    doc.status = 'parsing';
    doc.error = null;
    doc.warnings = [];
    doc.parseStartedAt = nowIso();
    doc.parseFinishedAt = null;
    doc.updatedAt = nowIso();
    doc.attempts = (doc.attempts || 0) + 1;
    saveState();

    var outputPath = textPathOf(id);
    var tmpPath = path.join(TMP_DIR, id + '.pdf.txt');
    try { fs.rmSync(outputPath, { force: true }); } catch (e) { /* ignore */ }

    var finished = false;
    var timer = null;

    var worker = new Worker(WORKER_PATH, {
      workerData: {
        id: id,
        ext: doc.ext,
        filePath: source,
        outputPath: outputPath,
        tmpPath: tmpPath,
        pdftotextPath: config.parsing && config.parsing.pdftotext
      }
    });
    currentWorker = worker;

    function finish(success, message, result) {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      try { worker.terminate(); } catch (e) { /* ignore */ }

      var liveDoc = findDoc(id);
      if (liveDoc) {
        liveDoc.parseFinishedAt = nowIso();
        liveDoc.updatedAt = nowIso();
        if (success) {
          liveDoc.status = 'pending';
          liveDoc.error = null;
          liveDoc.stats = (result && result.stats) || {};
          liveDoc.warnings = (result && result.warnings) || [];
        } else {
          liveDoc.status = 'failed';
          liveDoc.error = message || '解析失败';
        }
      }
      saveState();
      finishQueue();
    }

    worker.on('message', function (msg) {
      if (!msg || typeof msg !== 'object') {
        finish(false, '解析进程返回了无法识别的结果');
        return;
      }
      if (msg.ok) {
        if (!outputPath || !fs.existsSync(outputPath)) {
          finish(false, '解析完成但结果文件缺失，请重试');
          return;
        }
        finish(true, null, msg);
      } else {
        finish(false, msg.error || '解析失败');
      }
    });

    worker.on('error', function (err) {
      finish(false, '解析进程异常：' + ((err && err.message) || '未知错误'));
    });

    worker.on('exit', function (code) {
      if (!finished) {
        finish(false, code === 0 ? '解析进程未返回结果，请重试' : '解析进程异常退出（代码 ' + code + '）');
      }
    });

    timer = setTimeout(function () {
      finish(false, '解析超时（超过 90 秒），文件可能过大或结构异常');
    }, PARSE_TIMEOUT_MS);
  }

  function recoverQueue() {
    loadState();
    var changed = false;
    state.docs.forEach(function (doc) {
      if (doc.status === 'parsing') {
        doc.status = 'queued';
        doc.error = '上次解析被中断，已重新排队';
        doc.updatedAt = nowIso();
        changed = true;
      }
    });
    if (changed) saveState();
    state.docs.forEach(function (doc) {
      if (doc.status === 'queued') enqueue(doc.id);
    });
  }

  /* =========================================================
   * 可见性规则 —— 全系统唯一实现
   *
   * 制度中心的列表、详情、下载，以及智能问答的取用，
   * 全部走这里的 visibilityOf()，任何一处都不自己另写一套。
   *
   * 一份制度对「查看身份」可见，当且仅当：
   *   1. 状态是已发布；
   *   2. 生效日期不晚于今天（在有效期内）；
   *   3. 适用范围是「全员」，或者是该查看身份所在部门的专属制度。
   * ======================================================= */
  function visibilityOf(doc, actingDept, today) {
    if (!doc) return { visible: false, reason: '找不到这份制度' };
    if (doc.status !== 'published') {
      return { visible: false, reason: '还没有发布' };
    }
    if (String(doc.effectiveDate || '') > String(today || '')) {
      return { visible: false, reason: '尚未生效' };
    }
    if (doc.scope === 'all') {
      return { visible: true, reason: '全员可见' };
    }
    if (doc.scope === 'dept') {
      if (String(doc.dept || '') === String(actingDept || '')) {
        return { visible: true, reason: (doc.dept || '') + ' 专属' };
      }
      return { visible: false, reason: '仅适用于' + (doc.dept || '指定部门') };
    }
    return { visible: false, reason: '适用范围未设置' };
  }

  /**
   * 解析「查看身份」：普通员工只能以自己身份查看；
   * 管理角色可以指定某个员工（演示里切换身份用）。
   * 返回 null 表示越权。
   */
  function resolveActing(account, employeeId) {
    var runtime = readState() || {};
    var employees = Array.isArray(runtime.employees) ? runtime.employees : [];

    var wanted = String(employeeId || '').trim();
    if (wanted) {
      var target = employees.filter(function (e) { return e && e.id === wanted; })[0];
      if (!target) return null;
      var isManager = permissionCan(account, 'manage.hr');
      if (!isManager && account.employeeId !== target.id) return null;
      return {
        employeeId: target.id,
        name: target.name || '',
        dept: String(target.dept || '').trim(),
        isSelf: target.id === account.employeeId
      };
    }

    var self = employees.filter(function (e) { return e && e.id === account.employeeId; })[0];
    return {
      employeeId: account.employeeId || null,
      name: (self && self.name) || account.name || '',
      dept: String((self && self.dept) || account.dept || '').trim(),
      isSelf: true
    };
  }

  /** 基线示例制度（data/policies.js / 运行期状态里的 policies） */
  function baselinePolicies() {
    if (typeof getBaselinePolicies === 'function') {
      var list = getBaselinePolicies();
      if (Array.isArray(list) && list.length) return list;
    }
    return [];
  }

  /** 基线制度 → 制度中心的条目（和知识库文档用同一套字段） */
  function sampleItem(policy) {
    return {
      id: policy.id,
      source: 'sample',
      title: policy.title,
      category: policy.category || '公司制度',
      scope: 'all',
      scopeLabel: '全员可见',
      dept: null,
      owner: policy.owner || '',
      version: policy.version || '',
      effectiveDate: policy.effectiveDate || '',
      status: policy.status === '生效中' ? 'published' : 'unpublished',
      hasFile: false,
      ext: '',
      originalName: '',
      isSample: true
    };
  }

  /** 知识库文档 → 制度中心的条目 */
  function kbItem(doc) {
    return {
      id: doc.id,
      source: 'kb',
      title: doc.title,
      category: doc.category || '',
      scope: doc.scope,
      scopeLabel: doc.scope === 'all' ? '全员可见' : ((doc.dept || '') + '专属'),
      dept: doc.dept || null,
      owner: doc.scope === 'all' ? '全体员工' : (doc.dept || ''),
      version: doc.version || '',
      effectiveDate: doc.effectiveDate || '',
      status: doc.status,
      hasFile: true,
      ext: doc.ext || '',
      originalName: doc.originalName || '',
      isSample: false
    };
  }

  /** 所有「制度」，含基线示例制度和知识库文档 */
  function allItems() {
    loadState();
    var samples = baselinePolicies().map(sampleItem);
    var kb = state.docs.map(kbItem);
    return samples.concat(kb);
  }

  /** 按可见性规则过滤出某个查看身份能看到的制度 */
  function visibleItems(acting, today) {
    var dept = acting ? acting.dept : '';
    return allItems().filter(function (item) {
      return visibilityOf(item, dept, today).visible;
    });
  }

  /** 基线制度的正文：条款拆成标题 + 段落 */
  function sampleBlocks(policy) {
    var blocks = [];
    if (policy.summary) blocks.push({ type: 'paragraph', text: policy.summary });
    (policy.clauses || []).forEach(function (clause) {
      var head = [clause.no, clause.heading].filter(Boolean).join(' ');
      if (head) blocks.push({ type: 'heading', level: 2, text: head });
      if (clause.text) blocks.push({ type: 'paragraph', text: clause.text });
    });
    return blocks;
  }

  /* ---------------- API ---------------- */

  function listDocs(req, res) {
    var auth = authorize(req, 'manage.hr');
    if (!auth.ok) return sendError(res, auth.status, auth.error);

    loadState();
    var docs = state.docs.slice().sort(function (a, b) {
      return String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || ''));
    }).map(publicDoc);

    sendJson(res, 200, {
      ok: true,
      version: state.kbVersion,
      docs: docs,
      pdftotextAvailable: !!pdfParser.findPdftotext(config.parsing && config.parsing.pdftotext)
    });
  }

  async function uploadDoc(req, res) {
    var auth = authorize(req, 'manage.hr');
    if (!auth.ok) return sendError(res, auth.status, auth.error);

    var metaHeader = parseMetadataHeader(req);
    if (!metaHeader.ok) return sendError(res, 400, metaHeader.error);

    var rawMeta = metaHeader.meta || {};
    var originalName = safeOriginalName(rawMeta.originalName);
    var ext = (originalName.lastIndexOf('.') >= 0 ? originalName.slice(originalName.lastIndexOf('.')) : '').toLowerCase();
    if (ext === '.doc') {
      return sendError(res, 400, '暂不支持旧版 .doc，请用 Word 另存为 .docx 后上传');
    }
    if (['.pdf', '.docx', '.txt', '.md', '.markdown'].indexOf(ext) < 0) {
      return sendError(res, 400, '只支持 PDF、Word(.docx)、TXT、Markdown 文件');
    }

    var validated = validateMeta(rawMeta, originalName);
    if (!validated.ok) return sendError(res, 400, validated.error);
    var value = validated.value;

    var body;
    try {
      body = await readRawBody(req, MAX_UPLOAD_BYTES);
    } catch (e) {
      return sendError(res, e.statusCode || 400, e.message);
    }

    if (!body.length) return sendError(res, 400, '上传文件是空的');
    if (body.length > MAX_UPLOAD_BYTES) return sendError(res, 413, '文件超过 20MB，无法上传');

    if (ext === '.pdf' && body.slice(0, 5).toString('latin1') !== '%PDF-') {
      return sendError(res, 400, '文件内容不是有效的 PDF');
    }
    if (ext === '.docx' && body.slice(0, 4).toString('hex') !== '504b0304') {
      return sendError(res, 400, '文件内容不是有效的 .docx');
    }
    if (ext === '.docx' && body.indexOf(Buffer.from('word/document.xml')) < 0) {
      return sendError(res, 400, '文件不是完整的 Word 文档（缺少 word/document.xml）');
    }

    var id = 'kb_' + crypto.randomBytes(12).toString('hex');
    var storedName = id + ext;
    var destination = safeKbPath(FILES_DIR, storedName);
    if (!destination) return sendError(res, 500, '存储路径异常');

    try {
      // 目录可能被手工删掉，写之前先补回来
      ensureDirs();
      fs.writeFileSync(destination, body);
    } catch (e) {
      return sendError(res, 500, '保存原始文件失败：' + e.message);
    }

    loadState();
    var now = nowIso();
    var doc = {
      id: id,
      title: value.title,
      category: value.category,
      scope: value.scope,
      dept: value.dept,
      version: value.version,
      effectiveDate: value.effectiveDate,
      originalName: value.originalName,
      ext: ext,
      mime: ext === '.pdf' ? 'application/pdf'
        : ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : (ext === '.txt' ? 'text/plain' : 'text/markdown'),
      size: body.length,
      storedName: storedName,
      status: 'queued',
      error: null,
      warnings: [],
      stats: {},
      uploadedBy: { id: auth.account.id, name: auth.account.name || '' },
      uploadedAt: now,
      updatedAt: now,
      parseStartedAt: null,
      parseFinishedAt: null,
      attempts: 0,
      publishedAt: null,
      unpublishedAt: null
    };
    state.docs.push(doc);
    saveState();
    enqueue(id);

    sendJson(res, 201, { ok: true, doc: publicDoc(doc), version: state.kbVersion });
  }

  function previewDoc(req, res, id) {
    var auth = authorize(req, 'manage.hr');
    if (!auth.ok) return sendError(res, auth.status, auth.error);
    var doc = findDoc(id);
    if (!doc) return sendError(res, 404, '找不到这个制度');

    var text = readText(id);
    if (!text) {
      return sendJson(res, 200, {
        ok: true,
        doc: publicDoc(doc),
        blocks: [],
        stats: doc.stats || {},
        warnings: doc.warnings || [],
        missing: true,
        truncated: false
      });
    }

    var cut = truncateBlocks(text.blocks || [], MAX_PREVIEW_CHARS);
    sendJson(res, 200, {
      ok: true,
      doc: publicDoc(doc),
      blocks: cut.blocks,
      stats: text.stats || doc.stats || {},
      warnings: (text.warnings && text.warnings.length) ? text.warnings : (doc.warnings || []),
      missing: false,
      truncated: cut.truncated
    });
  }

  function retryDoc(req, res, id) {
    var auth = authorize(req, 'manage.hr');
    if (!auth.ok) return sendError(res, auth.status, auth.error);
    var doc = findDoc(id);
    if (!doc) return sendError(res, 404, '找不到这个制度');
    if (doc.status !== 'failed') return sendError(res, 409, '只有解析失败的制度可以重试');

    var source = filePathOf(doc);
    if (!source || !fs.existsSync(source)) {
      return sendError(res, 409, '原始文件丢失，无法重试；请重新上传');
    }
    doc.status = 'queued';
    doc.error = null;
    doc.warnings = [];
    doc.stats = {};
    doc.updatedAt = nowIso();
    doc.parseStartedAt = null;
    doc.parseFinishedAt = null;
    saveState();
    enqueue(id);
    sendJson(res, 200, { ok: true, doc: publicDoc(doc), version: state.kbVersion });
  }

  function publishDoc(req, res, id) {
    var auth = authorize(req, 'manage.hr');
    if (!auth.ok) return sendError(res, auth.status, auth.error);
    var doc = findDoc(id);
    if (!doc) return sendError(res, 404, '找不到这个制度');
    if (doc.status !== 'pending' && doc.status !== 'unpublished') {
      return sendError(res, 409, '当前状态不能发布（需要先解析完成）');
    }
    if (!textPathOf(id) || !fs.existsSync(textPathOf(id))) {
      return sendError(res, 409, '解析结果不存在，不能发布；请重试解析');
    }
    doc.status = 'published';
    doc.publishedAt = nowIso();
    doc.updatedAt = nowIso();
    doc.error = null;
    saveState();
    sendJson(res, 200, { ok: true, doc: publicDoc(doc), version: state.kbVersion });
  }

  function unpublishDoc(req, res, id) {
    var auth = authorize(req, 'manage.hr');
    if (!auth.ok) return sendError(res, auth.status, auth.error);
    var doc = findDoc(id);
    if (!doc) return sendError(res, 404, '找不到这个制度');
    if (doc.status !== 'published') return sendError(res, 409, '只有已发布的制度可以下架');
    doc.status = 'unpublished';
    doc.unpublishedAt = nowIso();
    doc.updatedAt = nowIso();
    saveState();
    sendJson(res, 200, { ok: true, doc: publicDoc(doc), version: state.kbVersion });
  }

  function publishedDocs(req, res) {
    var auth = authorize(req, 'view.chat');
    if (!auth.ok) return sendError(res, auth.status, auth.error);

    var acting = resolveActing(auth.account, queryEmployeeId(req));
    if (!acting) return sendError(res, 403, '不能查看其他员工的制度');

    loadState();
    var today = todayLocal();

    // 和制度中心的列表走同一套规则
    var docs = state.docs.filter(function (doc) {
      return visibilityOf(doc, acting.dept, today).visible;
    }).sort(function (a, b) {
      return String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''));
    }).map(function (doc) {
      var text = readText(doc.id);
      if (!text) return null;
      return {
        id: doc.id,
        title: doc.title,
        category: doc.category,
        scope: doc.scope,
        dept: doc.dept,
        version: doc.version,
        effectiveDate: doc.effectiveDate,
        blocks: text.blocks || [],
        text: text.text || '',
        stats: text.stats || doc.stats || {},
        warnings: text.warnings || doc.warnings || []
      };
    }).filter(Boolean);

    sendJson(res, 200, {
      ok: true,
      version: state.kbVersion,
      identity: acting,
      docs: docs
    });
  }

  /** 制度中心：某个查看身份能看到的全部制度（基线示例 + 知识库已发布） */
  function visiblePolicies(req, res) {
    var auth = authorize(req, 'view.policies');
    if (!auth.ok) return sendError(res, auth.status, auth.error);

    var acting = resolveActing(auth.account, queryEmployeeId(req));
    if (!acting) return sendError(res, 403, '不能查看其他员工的制度');

    var today = todayLocal();
    var items = visibleItems(acting, today).sort(function (a, b) {
      // 生效日期新的排前面；同一天的按标题稳定排序
      var byDate = String(b.effectiveDate || '').localeCompare(String(a.effectiveDate || ''));
      if (byDate !== 0) return byDate;
      return String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hans-CN');
    });

    // 标题里带「示例」的制度要在页面底部提示
    var hasSample = items.some(function (item) {
      return item.isSample || String(item.title || '').indexOf('示例') >= 0;
    });

    sendJson(res, 200, {
      ok: true,
      version: state.kbVersion,
      identity: acting,
      today: today,
      hasSample: hasSample,
      items: items
    });
  }

  /** 制度正文预览：基线示例制度和知识库文档都走这里，权限规则与列表一致 */
  function previewPolicy(req, res, id) {
    var auth = authorize(req, 'view.policies');
    if (!auth.ok) return sendError(res, auth.status, auth.error);

    var acting = resolveActing(auth.account, queryEmployeeId(req));
    if (!acting) return sendError(res, 403, '不能查看其他员工的制度');

    var today = todayLocal();
    var item = allItems().filter(function (x) { return x.id === id; })[0];
    if (!item) return sendError(res, 404, '找不到这份制度');

    var check = visibilityOf(item, acting.dept, today);
    if (!check.visible) {
      return sendError(res, 403, '这份制度当前对你不可见（' + check.reason + '）');
    }

    if (item.source === 'sample') {
      var policy = baselinePolicies().filter(function (p) { return p.id === id; })[0];
      if (!policy) return sendError(res, 404, '找不到这份制度');
      return sendJson(res, 200, {
        ok: true,
        item: item,
        blocks: sampleBlocks(policy),
        stats: {},
        warnings: [],
        truncated: false
      });
    }

    var doc = findDoc(id);
    var text = readText(id);
    var cut = truncateBlocks((text && text.blocks) || [], MAX_PREVIEW_CHARS);
    sendJson(res, 200, {
      ok: true,
      item: item,
      blocks: cut.blocks,
      stats: (text && text.stats) || (doc && doc.stats) || {},
      warnings: (text && text.warnings && text.warnings.length)
        ? text.warnings
        : ((doc && doc.warnings) || []),
      truncated: cut.truncated,
      missing: !text
    });
  }

  /**
   * 下载原件：权限规则与列表、详情完全一致 ——
   * 你在制度中心看得到的，就能下载；看不到的，接口直接拒绝。
   */
  function downloadPolicy(req, res, id) {
    var auth = authorize(req, 'view.policies');
    if (!auth.ok) return sendError(res, auth.status, auth.error);

    var acting = resolveActing(auth.account, queryEmployeeId(req));
    if (!acting) return sendError(res, 403, '不能查看其他员工的制度');

    var today = todayLocal();
    var doc = findDoc(id);
    if (!doc) return sendError(res, 404, '找不到这份制度');

    var check = visibilityOf(kbItem(doc), acting.dept, today);
    if (!check.visible) {
      return sendError(res, 403, '这份制度当前对你不可见（' + check.reason + '）');
    }

    return streamOriginal(res, doc);
  }

  function downloadDoc(req, res, id) {
    var auth = authorize(req, 'manage.hr');
    if (!auth.ok) return sendError(res, auth.status, auth.error);
    var doc = findDoc(id);
    if (!doc) return sendError(res, 404, '找不到这个制度');
    return streamOriginal(res, doc);
  }

  /** 发送原始文件（鉴权已在调用方完成） */
  function streamOriginal(res, doc) {
    var file = filePathOf(doc);
    if (!file || !fs.existsSync(file)) return sendError(res, 404, '原始文件不存在');

    var stat;
    try {
      stat = fs.statSync(file);
      if (!stat.isFile()) return sendError(res, 404, '原始文件不存在');
    } catch (e) {
      return sendError(res, 404, '原始文件不存在');
    }

    var encoded = encodeURIComponent(doc.originalName || ('document' + doc.ext))
      .replace(/['()*]/g, function (ch) { return '%' + ch.charCodeAt(0).toString(16).toUpperCase(); });
    var asciiName = (doc.originalName || ('document' + doc.ext)).replace(/[^\x20-\x7e]/g, '') || ('document' + doc.ext);
    asciiName = asciiName.replace(/["\\]/g, '_');

    res.writeHead(200, {
      'Content-Type': doc.mime || 'application/octet-stream',
      'Content-Length': String(stat.size),
      'Content-Disposition': 'attachment; filename="' + asciiName + '"; filename*=UTF-8\'\'' + encoded,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });

    var stream = fs.createReadStream(file);
    stream.on('error', function () {
      try { res.destroy(); } catch (e) { /* ignore */ }
    });
    stream.pipe(res);
  }

  async function handle(req, res, pathname) {
    try {
      var method = req.method;

      if (pathname === '/api/kb/docs') {
        if (method === 'GET') return listDocs(req, res);
        if (method === 'POST') return await uploadDoc(req, res);
        return sendError(res, 405, '不支持的请求方法');
      }

      if (pathname === '/api/kb/published') {
        if (method === 'GET') return publishedDocs(req, res);
        return sendError(res, 405, '不支持的请求方法');
      }

      // 制度中心：列表 / 正文 / 下载，共用同一套可见性规则
      if (pathname === '/api/kb/visible') {
        if (method === 'GET') return visiblePolicies(req, res);
        return sendError(res, 405, '不支持的请求方法');
      }

      var policyMatch = pathname.match(/^\/api\/kb\/policy\/([^/]+)\/(preview|file)$/);
      if (policyMatch) {
        var policyId = decodeURIComponent(policyMatch[1]);
        if (method !== 'GET') return sendError(res, 405, '不支持的请求方法');
        if (policyMatch[2] === 'preview') return previewPolicy(req, res, policyId);
        return downloadPolicy(req, res, policyId);
      }

      var match = pathname.match(/^\/api\/kb\/docs\/([^/]+)\/(preview|retry|publish|unpublish|file)$/);
      if (match) {
        var id = match[1];
        var action = match[2];
        if (!ID_RE.test(id)) return sendError(res, 404, '找不到这个制度');

        if (action === 'preview') {
          if (method !== 'GET') return sendError(res, 405, '不支持的请求方法');
          return previewDoc(req, res, id);
        }
        if (action === 'file') {
          if (method !== 'GET') return sendError(res, 405, '不支持的请求方法');
          return downloadDoc(req, res, id);
        }
        if (method !== 'POST') return sendError(res, 405, '不支持的请求方法');
        if (action === 'retry') return retryDoc(req, res, id);
        if (action === 'publish') return publishDoc(req, res, id);
        if (action === 'unpublish') return unpublishDoc(req, res, id);
      }

      return sendError(res, 404, '接口不存在');
    } catch (error) {
      try { console.error('[kb] ' + (error && error.stack ? error.stack : error)); } catch (e) { /* ignore */ }
      if (res.headersSent) {
        try { res.destroy(); } catch (e) { /* ignore */ }
        return;
      }
      sendError(res, 500, '知识库服务异常：' + ((error && error.message) || '未知错误'));
    }
  }

  // 启动时恢复中断的解析任务
  recoverQueue();

  return {
    handle: handle,
    CATEGORIES: CATEGORIES,
    PENDING_STATUSES: PENDING_STATUSES,
    _dirs: { KB_DIR: KB_DIR, DOCS_FILE: DOCS_FILE, FILES_DIR: FILES_DIR, TEXT_DIR: TEXT_DIR }
  };
}

module.exports = { createKnowledgeService: createKnowledgeService, CATEGORIES: CATEGORIES };
