/**
 * 初见 Onboard · 本地数据存储层
 *
 * 设计要点：
 * 1. 主存储用 localStorage —— Chrome / Edge / Firefox 在 file:// 下可用，
 *    且所有 file:// 页面共享同一份，正好满足员工端与后台页之间的数据共享。
 * 2. Safari / 无痕模式下 localStorage 会抛错，此时降级为内存存储，
 *    并在页面顶部显示提示条，引导用户改用 node server.js 启动。
 * 3. 通过 http:// 打开（node server.js）时，额外把状态落盘到服务端
 *    data/runtime-state.json，浏览器刷新与重启服务后数据都不会丢。
 */
(function (root) {
  var O = root.Onboard;

  var KEYS = {
    seeded: 'onboard.v1.seeded',
    policies: 'onboard.v1.policies',
    employees: 'onboard.v1.employees',
    departments: 'onboard.v1.departments',
    leaveBalances: 'onboard.v1.leaveBalances',
    tickets: 'onboard.v1.tickets',
    onboardingTasks: 'onboard.v1.onboardingTasks',
    onboardingTemplates: 'onboard.v1.onboardingTemplates',
    questionLogs: 'onboard.v1.questionLogs',
    chatSessions: 'onboard.v1.chatSessions',
    accounts: 'onboard.v1.accounts',
    workspace: 'onboard.v1.workspace',
    prefs: 'onboard.v1.prefs',
    updatedAt: 'onboard.v1.stateUpdatedAt'
  };

  var COLLECTIONS = [
    'policies', 'employees', 'departments', 'leaveBalances', 'tickets',
    'onboardingTasks', 'onboardingTemplates', 'questionLogs', 'chatSessions',
    'accounts'
  ];

  var memoryStore = {};
  var localAvailable = false;
  var mode = 'local';
  var listeners = [];
  var serverSyncTimer = null;

  try {
    var probe = '__onboard_probe__';
    root.localStorage.setItem(probe, '1');
    root.localStorage.removeItem(probe);
    localAvailable = true;
  } catch (e) {
    localAvailable = false;
  }

  function readRaw(key) {
    if (localAvailable) {
      try { return root.localStorage.getItem(key); } catch (e) { /* 落到内存 */ }
    }
    return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
  }

  function writeRaw(key, value) {
    if (localAvailable) {
      try {
        root.localStorage.setItem(key, value);
        return true;
      } catch (e) {
        localAvailable = false;
      }
    }
    memoryStore[key] = value;
    return false;
  }

  function removeRaw(key) {
    if (localAvailable) {
      try { root.localStorage.removeItem(key); } catch (e) { /* ignore */ }
    }
    delete memoryStore[key];
  }

  function deepCopy(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(deepCopy);
    var out = {};
    for (var k in value) {
      if (Object.prototype.hasOwnProperty.call(value, k)) out[k] = deepCopy(value[k]);
    }
    return out;
  }

  function get(name) {
    var raw = readRaw(KEYS[name]);
    if (raw === null || raw === undefined) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  /** 记录「本地最后一次改动」的时间，用来和服务端状态比谁更新 */
  function touchLocalUpdated() {
    writeRaw(KEYS.updatedAt, String(Date.now()));
  }

  function localUpdatedAt() {
    var raw = readRaw(KEYS.updatedAt);
    return raw ? (Number(raw) || 0) : 0;
  }

  function set(name, value) {
    writeRaw(KEYS[name], JSON.stringify(value));
    touchLocalUpdated();
    notify(name);
    scheduleServerSync();
  }

  function state() {
    var out = {};
    COLLECTIONS.forEach(function (name) {
      out[name] = get(name) || [];
    });
    out.prefs = get('prefs') || {};
    out.workspace = get('workspace') || null;
    return out;
  }

  function notify(name) {
    listeners.forEach(function (fn) {
      try { fn(name); } catch (e) { console.error(e); }
    });
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  /** 重新播种：清空全部本地数据并写回示例数据 */
  function reset(seedState) {
    COLLECTIONS.forEach(function (name) { removeRaw(KEYS[name]); });
    removeRaw(KEYS.seeded);
    applySeed(seedState);
    touchLocalUpdated();
    notify('*');
    scheduleServerSync();
  }

  /**
   * 播种示例数据。
   * 重要：只补"本地还没有的"那几项，绝不覆盖已有数据。
   * 否则「已播种」标记一旦丢失（例如换了浏览器或清了部分缓存），
   * 用户已经创建的账号、提出的工单就会被空的示例数据冲掉。
   */
  function applySeed(seedState) {
    COLLECTIONS.forEach(function (name) {
      var value = seedState[name];
      if (value === undefined) return;
      if (readRaw(KEYS[name]) !== null) return;   // 已经有数据了，保持不动
      writeRaw(KEYS[name], JSON.stringify(value));
    });
    if (seedState.workspace && readRaw(KEYS.workspace) === null) {
      writeRaw(KEYS.workspace, JSON.stringify(seedState.workspace));
    }
    writeRaw(KEYS.seeded, JSON.stringify({ at: new Date().toISOString(), dataset: 'onboard-demo-v1' }));
  }

  /**
   * 初始化。seedState 由 seed.js 提供。
   * 返回 Promise，resolve 后 mode / available 已确定。
   */
  function init(seedState) {
    var isHttp = (root.location && root.location.protocol === 'http:');
    if (!isHttp) {
      mode = 'local';
      if (!readRaw(KEYS.seeded)) applySeed(seedState);
      bindCrossTab();
      return Promise.resolve({ mode: mode, available: localAvailable });
    }

    // http 模式：优先尝试从服务端读取持久化状态。
    // 关键：先比较「本地最后改动时间」和「服务端保存时间」，谁新用谁 ——
    // 否则服务端文件一旦落后（服务停过、PUT 失败过、文件被删），
    // 一次页面刷新就会把浏览器里的新数据整个冲掉。
    return fetch('/api/state', { headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (data && data.policies) {
          mode = 'server';
          var serverSavedAt = Number(data.savedAt) || 0;
          if (localUpdatedAt() > serverSavedAt) {
            // 本地比服务端新：保留本地数据，并立刻推回服务端（自愈，重建状态文件）
            scheduleServerSync();
          } else {
            COLLECTIONS.forEach(function (name) {
              if (data[name] !== undefined) writeRaw(KEYS[name], JSON.stringify(data[name]));
            });
            if (data.workspace) writeRaw(KEYS.workspace, JSON.stringify(data.workspace));
            if (data.prefs) writeRaw(KEYS.prefs, JSON.stringify(data.prefs));
          }
          writeRaw(KEYS.seeded, JSON.stringify({ at: new Date().toISOString(), dataset: 'onboard-demo-v1', via: 'server' }));
        } else {
          mode = 'local';
          if (!readRaw(KEYS.seeded)) applySeed(seedState);
        }
        bindCrossTab();
        return { mode: mode, available: localAvailable };
      })
      .catch(function () {
        mode = 'local';
        if (!readRaw(KEYS.seeded)) applySeed(seedState);
        bindCrossTab();
        return { mode: mode, available: localAvailable };
      });
  }

  /** 跨标签页 / 跨页面同步 */
  function bindCrossTab() {
    if (typeof root.addEventListener !== 'function') return;
    root.addEventListener('storage', function (event) {
      if (!event.key || event.key.indexOf('onboard.v1.') !== 0) return;
      notify(event.key.replace('onboard.v1.', ''));
    });
  }

  /** 服务端落盘（仅 http 模式），做合并节流 */
  function scheduleServerSync() {
    if (mode !== 'server' || typeof fetch !== 'function') return;
    if (serverSyncTimer) clearTimeout(serverSyncTimer);
    serverSyncTimer = setTimeout(function () {
      serverSyncTimer = null;
      putState(Date.now(), 2);
    }, 400);
  }

  /**
   * 立刻把当前状态推给服务端，返回 Promise。
   * 知识库的鉴权依赖服务端的账号数据，所以进知识库页面前要先同步一次，
   * 避免服务端还拿着旧的角色/启用状态。
   */
  function syncNow() {
    if (mode !== 'server' || typeof fetch !== 'function') {
      return Promise.resolve({ ok: false, error: '当前不是服务模式' });
    }
    if (serverSyncTimer) {
      clearTimeout(serverSyncTimer);
      serverSyncTimer = null;
    }
    return fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign(state(), { savedAt: Date.now() }))
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return { ok: true };
    }).catch(function (err) {
      notifySyncError();
      return { ok: false, error: err && err.message ? err.message : '同步失败' };
    });
  }

  function putState(savedAt, retriesLeft) {
    if (mode !== 'server' || typeof fetch !== 'function') return;
    fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign(state(), { savedAt: savedAt }))
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
    }).catch(function () {
      // 落盘失败：本地数据还在、不影响使用，但不能悄悄吞掉 ——
      // 提示一次，并自动重试，避免“服务停了一段时间，改动悄悄丢了”
      notifySyncError();
      if (retriesLeft > 0) {
        setTimeout(function () { putState(Date.now(), retriesLeft - 1); }, 3000);
      }
    });
  }

  var syncErrorNotifiedAt = 0;

  function notifySyncError() {
    var now = Date.now();
    if (now - syncErrorNotifiedAt < 60000) return;   // 一分钟内最多提示一次
    syncErrorNotifiedAt = now;
    try {
      if (root.console && root.console.warn) {
        root.console.warn('[初见] 数据落盘到服务端失败：本地改动仍可用，正在自动重试；请确认 node server.js 还在运行');
      }
    } catch (e) { /* ignore */ }
    if (O.components && O.components.toast && root.document) {
      O.components.toast.show('数据落盘到服务端失败，正在自动重试；期间请保持 node server.js 运行', 'warn');
    }
  }

  /** 清理过长的历史数据，避免本地存储无限增长 */
  function trim() {
    var logs = get('questionLogs');
    if (logs && logs.length > 500) set('questionLogs', logs.slice(logs.length - 500));
    var sessions = get('chatSessions');
    if (sessions && sessions.length > 20) set('chatSessions', sessions.slice(sessions.length - 20));
  }

  O.store = {
    KEYS: KEYS,
    COLLECTIONS: COLLECTIONS,
    get: get,
    set: set,
    state: state,
    init: init,
    reset: reset,
    subscribe: subscribe,
    trim: trim,
    scheduleServerSync: scheduleServerSync,
    syncNow: syncNow,
    get mode() { return mode; },
    get available() { return localAvailable; }
  };

  O.util = O.util || {};
  O.util.deepCopy = deepCopy;
})(typeof globalThis !== 'undefined' ? globalThis : this);
