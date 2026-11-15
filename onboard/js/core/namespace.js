/**
 * 初见 Onboard · 全局命名空间
 * 所有脚本用 classic script 方式加载（file:// 协议下 ES Module 会被浏览器拦截），
 * 统一挂在 window.Onboard 下。
 */
(function (root) {
  var O = root.Onboard = root.Onboard || {};

  O.version = '0.1.0';
  O.step = 1;
  O.productName = '初见 Onboard';

  O.env = {
    isBrowser: typeof document !== 'undefined',
    isNode: !!(typeof process !== 'undefined' && process.versions && process.versions.node),
    protocol: (typeof location !== 'undefined' && location.protocol) || 'file:'
  };

  /** 子模块挂载点 */
  O.modules = {};

  /** 简单日志，浏览器里输出到 Console，Node 里输出到 stdout */
  O.log = function () {
    if (!O.env.isBrowser) {
      console.log.apply(console, arguments);
      return;
    }
    console.log.apply(console, arguments);
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
