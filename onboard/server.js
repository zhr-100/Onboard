/**
 * 初见 Onboard · 本地服务（零依赖，只用 Node 内置模块）
 *
 * 用法：
 *   cd onboard
 *   node server.js
 *   浏览器打开 http://localhost:3000
 *
 * 这个服务做两件事：
 *   1. 把网站文件正常提供出来（比 file:// 打开更接近真实部署）
 *   2. 提供 /api/* 接口，把员工在网页里做的改动落到本地文件，
 *      以后接真实大模型时，密钥也只在这个服务端读取，不会出现在网页里
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const url = require('url');

const { createKnowledgeService } = require('./server/knowledge');

const ROOT = __dirname;

/* ---------------------------------------------------------
 * 配置：密钥只在这里读取，绝不会返回给浏览器
 * ------------------------------------------------------- */
function readConfig() {
  const fallback = {
    server: { port: 3000, host: '127.0.0.1' },
    llm: { enabled: false, apiKey: '', model: 'claude-sonnet-5-5', baseUrl: 'https://api.anthropic.com' },
    retrieval: { absMin: 0.42, relMin: 1.35, coverageMin: 0.6, topK: 3 },
    storage: { stateFile: 'data/runtime-state.json' },
    parsing: { pdftotext: '' }
  };
  try {
    const raw = fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      server: Object.assign({}, fallback.server, parsed.server || {}),
      llm: Object.assign({}, fallback.llm, parsed.llm || {}),
      retrieval: Object.assign({}, fallback.retrieval, parsed.retrieval || {}),
      storage: Object.assign({}, fallback.storage, parsed.storage || {}),
      parsing: Object.assign({}, fallback.parsing, parsed.parsing || {})
    };
  } catch (e) {
    console.log('提示：没有读到 config.json，已使用默认配置（不影响使用）。');
    return fallback;
  }
}

const CONFIG = readConfig();
const STATE_FILE = path.join(ROOT, CONFIG.storage.stateFile);

/* ---------------------------------------------------------
 * 静态文件
 * ------------------------------------------------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function safeJoin(root, target) {
  const resolved = path.resolve(root, '.' + path.normalize('/' + target));
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

/**
 * 这些路径不允许通过静态路由访问。
 *
 * 之前静态路由会把项目目录下的任意文件都吐出去，包括 config.json（密钥）
 * 和 data/runtime-state.json（账号哈希），知识库的原始文件也同样危险。
 * 命中一律 404 —— 不告诉对方"这个文件存在但没权限"。
 */
const DENY_EXACT = new Set([
  'config.json',
  'config.example.json',
  'data/runtime-state.json',
  'data/runtime-state.json.tmp'
]);

function isDeniedPath(pathname) {
  // 先把 URL 路径规范化：反斜杠统一、折叠 ..，避免 /data/../data/kb 这种绕法
  const normalized = path.posix.normalize(
    String(pathname || '').replace(/\\/g, '/').replace(/^\/+/, '')
  ).replace(/^\/+/, '').toLowerCase();
  if (!normalized || normalized === '.') return false;

  const segments = normalized.split('/');
  // 以点开头的目录/文件（.git、.claude 等）一律拒绝
  if (segments.some(function (s) { return s.startsWith('.') && s.length > 1; })) return true;
  if (DENY_EXACT.has(normalized)) return true;
  // 知识库私有目录：原件、解析结果、元数据
  if (segments[0] === 'data' && segments[1] === 'kb') return true;
  return false;
}

function sendFile(res, filePath) {
  fs.readFile(filePath, function (err, data) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 找不到这个页面</h1><p>请回到 <a href="/">首页</a>。</p>');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
}

/* ---------------------------------------------------------
 * 状态持久化
 * ------------------------------------------------------- */
function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {
    return null;
  }
}

function writeState(state) {
  const tmp = STATE_FILE + '.tmp';
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, STATE_FILE); // 原子替换，避免写到一半的坏文件
}

/* ---------------------------------------------------------
 * 服务端检索（与网页端共用同一份代码和同一份数据）
 * ------------------------------------------------------- */
const SCRIPTS = [
  'js/core/namespace.js',
  'js/core/format.js',
  'js/core/store.js',
  'js/core/seed.js',
  'js/core/permissions.js',
  'js/nlp/config.js',
  'js/nlp/lexicon.js',
  'js/nlp/tokenizer.js',
  'js/nlp/retriever.js',
  'js/nlp/intent.js',
  'js/nlp/answerer.js',
  'data/policies.js',
  'data/employees.js',
  'data/leave.js',
  'data/tickets.js'
];

let sandbox = null;
function getSandbox() {
  if (sandbox) return sandbox;
  const ctx = { console: console, process: process, setTimeout: setTimeout, clearTimeout: clearTimeout };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  SCRIPTS.forEach(function (rel) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) return;
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: rel });
  });
  sandbox = ctx;
  return ctx;
}

function serverAnswer(question) {
  const ctx = getSandbox();
  const O = ctx.Onboard;
  const policies = ctx.OnboardData.policies || [];
  const corpus = O.nlp.retriever.build(policies);
  const intent = O.nlp.intent.detect(question);
  const search = O.nlp.retriever.search(corpus, question, O.nlp.config);
  const answer = O.nlp.answerer.build({ query: question, intent: intent, search: search });
  return { answer: answer, intent: intent, state: answer.state };
}

/* ---------------------------------------------------------
 * 路由
 * ------------------------------------------------------- */
function readBody(req) {
  return new Promise(function (resolve, reject) {
    let body = '';
    req.on('data', function (chunk) {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) {
        reject(new Error('请求内容过大'));
        req.destroy();
      }
    });
    req.on('end', function () {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('请求内容不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

function json(res, code, payload) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

/* ---------------------------------------------------------
 * 制度知识库服务
 * ------------------------------------------------------- */
const knowledge = createKnowledgeService({
  root: ROOT,
  config: CONFIG,
  readState: readState,
  getPermissions: function () {
    return getSandbox().Onboard.permissions;
  },
  // 基线示例制度：优先用运行期状态里的那份（和网页端问答用的是同一份），
  // 没有就用 data/policies.js 里的基线数据。
  getBaselinePolicies: function () {
    var runtime = readState();
    if (runtime && Array.isArray(runtime.policies) && runtime.policies.length) {
      return runtime.policies;
    }
    return (getSandbox().OnboardData.policies) || [];
  }
});

const server = http.createServer(async function (req, res) {
  const parsed = url.parse(req.url);
  let pathname;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('400 请求路径不合法');
  }

  // 制度知识库：独立存储 + 自己的鉴权（请求头证明），不走静态路由
  if (pathname === '/api/kb' || pathname.indexOf('/api/kb/') === 0) {
    return knowledge.handle(req, res, pathname);
  }

  if (pathname === '/api/health') {
    return json(res, 200, {
      ok: true,
      mode: 'server',
      llmEnabled: !!(CONFIG.llm.enabled && CONFIG.llm.apiKey),
      llmModel: CONFIG.llm.model,
      statePath: CONFIG.storage.stateFile
    });
  }

  if (pathname === '/api/state' && req.method === 'GET') {
    const state = readState();
    if (state) return json(res, 200, state);
    // 状态文件还不存在：只返回种子数据，不写盘。
    // 在这里写盘会凭空造出一份“旧状态”，一旦浏览器里有更新的本地数据，
    // 启动时的同步逻辑就可能被这份假旧状态误导。真正的写盘只发生在 PUT。
    const ctx = getSandbox();
    return json(res, 200, ctx.Onboard.seed.build());
  }

  if (pathname === '/api/state' && req.method === 'PUT') {
    try {
      const payload = await readBody(req);
      writeState(payload);
      return json(res, 200, { ok: true });
    } catch (e) {
      return json(res, 400, { ok: false, error: e.message });
    }
  }

  if (pathname === '/api/chat' && req.method === 'POST') {
    try {
      const payload = await readBody(req);
      const result = serverAnswer(String(payload.message || ''));
      return json(res, 200, result);
    } catch (e) {
      return json(res, 500, { ok: false, error: e.message });
    }
  }

  // 静态文件
  let target = pathname === '/' ? '/index.html' : pathname;
  if (isDeniedPath(target)) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end('<h1>404 找不到这个页面</h1><p>请回到 <a href="/">首页</a>。</p>');
  }
  let filePath = safeJoin(ROOT, target);
  if (!filePath) {
    res.writeHead(403);
    return res.end('403');
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  sendFile(res, filePath);
});

server.listen(CONFIG.server.port, CONFIG.server.host, function () {
  const address = 'http://' + CONFIG.server.host + ':' + CONFIG.server.port;
  console.log('');
  console.log('  初见 Onboard · 员工服务助手（演示版）');
  console.log('  ---------------------------------------------');
  console.log('  打开浏览器访问：  ' + address);
  console.log('  数据保存在：      ' + CONFIG.storage.stateFile);
  if (CONFIG.llm.enabled && CONFIG.llm.apiKey) {
    console.log('  大模型：          已启用（' + CONFIG.llm.model + '）');
  } else {
    console.log('  大模型：          密钥未配置，使用本地知识库模式');
    console.log('                    （需要接真实大模型时，在 config.json 里填 llm.apiKey）');
  }
  console.log('  停止服务：        在这个窗口按 Ctrl + C');
  console.log('');
});
