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
    leaveBalances: 'onboard.v1.leaveBalances',
    tickets: 'onboard.v1.tickets',
    onboardingTasks: 'onboard.v1.onboardingTasks',
    onboardingTemplates: 'onboard.v1.onboardingTemplates',
    questionLogs: 'onboard.v1.questionLogs',
    chatSessions: 'onboard.v1.chatSessions',
    accounts: 'onboard.v1.accounts',
    workspace: 'onboard.v1.workspace',
    prefs: 'onboard.v1.prefs'
  };

  var COLLECTIONS = [
    'policies', 'employees', 'leaveBalances', 'tickets',
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

  function set(name, value) {
    writeRaw(KEYS[name], JSON.stringify(value));
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
    notify('*');
    scheduleServerSync();
  }

  function applySeed(seedState) {
    COLLECTIONS.forEach(function (name) {
      var value = seedState[name];
      if (value === undefined) return;
      writeRaw(KEYS[name], JSON.stringify(value));
    });
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

    // http 模式：优先尝试从服务端读取持久化状态
    return fetch('/api/state', { headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (data && data.policies) {
          mode = 'server';
          COLLECTIONS.forEach(function (name) {
            if (data[name] !== undefined) writeRaw(KEYS[name], JSON.stringify(data[name]));
          });
          if (data.workspace) writeRaw(KEYS.workspace, JSON.stringify(data.workspace));
          if (data.prefs) writeRaw(KEYS.prefs, JSON.stringify(data.prefs));
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
      fetch('/api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state())
      }).catch(function () { /* 落盘失败不影响本地使用 */ });
    }, 400);
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
    get mode() { return mode; },
    get available() { return localAvailable; }
  };

  O.util = O.util || {};
  O.util.deepCopy = deepCopy;
})(typeof globalThis !== 'undefined' ? globalThis : this);
