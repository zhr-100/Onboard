/**
 * 初见 Onboard · 角色与权限
 *
 * 全系统只有这一处定义"谁能看什么、谁能做什么"。
 * 页面跳转、操作执行都会来这里做校验 —— 不是靠隐藏按钮，
 * 而是即使知道地址、知道接口，没有权限一律拒绝。
 */
(function (root) {
  var O = root.Onboard;

  /** 四种角色 */
  var ROLES = ['员工', 'HR管理员', '产品运营', '系统管理员'];

  /** 每个页面需要哪项权限 */
  var PAGE_PERMISSIONS = {
    overview: 'view.overview',
    chat: 'view.chat',
    leave: 'view.leave',
    tickets: 'view.tickets',
    faq: 'view.faq',
    org: 'view.org',
    policies: 'view.policies',
    knowledge: 'view.knowledge',
    staff: 'view.staff',
    hr: 'view.hr',
    ops: 'view.ops',
    learn: 'view.learn',
    accounts: 'view.accounts'
  };

  /** 页面中文名（用于拒绝提示） */
  var PAGE_NAMES = {
    overview: '工作概览',
    chat: '员工问答',
    leave: '年假',
    tickets: '我的工单',
    faq: '常见问题',
    org: '组织架构',
    policies: '制度中心',
    knowledge: '制度知识库',
    staff: '员工管理',
    hr: '员工与制度',
    ops: '回答质量',
    learn: '学习中心',
    accounts: '账号与权限'
  };

  /** 所有权限项 */
  var ALL_PERMISSIONS = Object.keys(PAGE_PERMISSIONS).map(function (k) {
    return PAGE_PERMISSIONS[k];
  }).concat([
    'action.handoff',
    'action.feedback',
    'manage.hr',
    'manage.retrieval',
    'manage.accounts'
  ]);

  /** 角色 → 权限清单 */
  var ROLE_PERMISSIONS = {
    '员工': [
      'view.chat', 'view.leave', 'view.tickets', 'view.faq', 'view.org', 'view.policies',
      'action.handoff', 'action.feedback'
    ],
    'HR管理员': [
      'view.overview', 'view.chat', 'view.leave', 'view.tickets', 'view.faq', 'view.org', 'view.policies',
      'view.staff', 'view.hr', 'view.learn', 'view.knowledge',
      'action.handoff', 'action.feedback', 'manage.hr'
    ],
    '产品运营': [
      'view.overview', 'view.chat', 'view.tickets', 'view.learn', 'view.ops', 'view.org', 'view.policies',
      'action.feedback', 'manage.retrieval'
    ],
    '系统管理员': ALL_PERMISSIONS.slice()
  };

  function permissionsOf(role) {
    return ROLE_PERMISSIONS[role] || [];
  }

  /**
   * 这个人有没有这项权限
   * 账号没启用 = 一律没有权限（即使角色对）
   */
  function can(user, permission) {
    if (!user) return false;
    if (user.enabled === false) return false;
    if (permissionsOf(user.role).indexOf(permission) < 0) return false;
    return true;
  }

  /** 这个人能不能打开这个页面 */
  function canView(user, page) {
    var need = PAGE_PERMISSIONS[page];
    if (!need) return false;
    return can(user, need);
  }

  /** 他能打开哪些页面 */
  function allowedPages(user) {
    return Object.keys(PAGE_PERMISSIONS).filter(function (page) {
      return canView(user, page);
    });
  }

  /** 这个人第一个能进的页面 */
  function homePage(user) {
    var order = ['overview', 'chat', 'leave', 'tickets', 'faq'];
    for (var i = 0; i < order.length; i++) {
      if (canView(user, order[i])) return order[i];
    }
    return 'chat';
  }

  /** 拒绝时给用户看的说法 */
  function denyMessage(user, page) {
    var name = PAGE_NAMES[page] || '该页面';
    var role = (user && user.role) || '未知角色';
    return '你的角色「' + role + '」没有查看「' + name + '」的权限。';
  }

  /** 角色中文名（侧栏显示用） */
  function roleName(role) {
    return ROLES.indexOf(role) >= 0 ? role : '未分配角色';
  }

  O.permissions = {
    ROLES: ROLES,
    PAGE_PERMISSIONS: PAGE_PERMISSIONS,
    PAGE_NAMES: PAGE_NAMES,
    ALL_PERMISSIONS: ALL_PERMISSIONS,
    ROLE_PERMISSIONS: ROLE_PERMISSIONS,
    can: can,
    canView: canView,
    allowedPages: allowedPages,
    homePage: homePage,
    denyMessage: denyMessage,
    roleName: roleName
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
