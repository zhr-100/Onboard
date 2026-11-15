/**
 * 初见 Onboard · 格式化工具
 */
(function (root) {
  var O = root.Onboard;

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    var d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  /** 2026-06-18 */
  function date(value) {
    var d = toDate(value);
    if (!d) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** 2026-06-18 15:40 */
  function dateTime(value) {
    var d = toDate(value);
    if (!d) return '';
    return date(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /** 3 分钟前 / 2 天前 */
  function relative(value) {
    var d = toDate(value);
    if (!d) return '';
    var diff = Date.now() - d.getTime();
    var min = Math.floor(diff / 60000);
    if (min < 1) return '刚刚';
    if (min < 60) return min + ' 分钟前';
    var hour = Math.floor(min / 60);
    if (hour < 24) return hour + ' 小时前';
    var day = Math.floor(hour / 24);
    if (day < 30) return day + ' 天前';
    return date(d);
  }

  /** 工单状态 → 徽章色调 */
  function statusTone(status) {
    switch (status) {
      case '已解决': return 'ok';
      case '已关闭': return 'muted';
      case '处理中': return 'info';
      case '待员工补充': return 'warn';
      case '待处理': return 'danger';
      default: return 'muted';
    }
  }

  function priorityTone(priority) {
    return priority === '紧急' ? 'danger' : 'muted';
  }

  /** 两个日期相差的天数（按自然日） */
  function daysBetween(from, to) {
    var a = toDate(from), b = toDate(to);
    if (!a || !b) return 0;
    var ms = b.setHours(0, 0, 0, 0) - a.setHours(0, 0, 0, 0);
    return Math.round(ms / 86400000);
  }

  /** 入职年限（用于对应年假档位） */
  function yearsOfService(joinDate, now) {
    var a = toDate(joinDate), b = toDate(now || new Date());
    if (!a || !b) return 0;
    var years = b.getFullYear() - a.getFullYear();
    var m = b.getMonth() - a.getMonth();
    if (m < 0 || (m === 0 && b.getDate() < a.getDate())) years -= 1;
    return years < 0 ? 0 : years;
  }

  var idSeq = 0;
  /** 生成带日期前缀的唯一 ID */
  function createId(prefix) {
    idSeq += 1;
    var d = new Date();
    var stamp = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
    return (prefix || 'ID') + '-' + stamp + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '-' + idSeq;
  }

  function truncate(text, max) {
    var s = String(text || '');
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  O.format = {
    date: date,
    dateTime: dateTime,
    relative: relative,
    statusTone: statusTone,
    priorityTone: priorityTone,
    daysBetween: daysBetween,
    yearsOfService: yearsOfService,
    createId: createId,
    truncate: truncate
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
