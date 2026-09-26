/**
 * 时间格式化 —— 全站唯一口径。
 *
 * 为什么要抽出来：改动之前这个仓库里有 4 份互不相同的 formatDate，
 * 结果同一个项目在「我的项目」里显示 2024-6-15，在「我的收藏」里
 * 显示「2年前」。用户会认为数据错了，实际上只是两处代码不一样。
 * 展示不一致比少一个功能更伤信任。
 *
 * 口径约定：
 *   1. 项目、咨询这类「回顾性内容」一律显示绝对日期 YYYY-M-D。
 *      2024-6-15 比「2年前」信息量更大，且不会随时间漂移。
 *   2. 相对时间（刚刚 / 3 小时前）只用在通知这类时效性内容上。
 *   3. 月日不补零。中文语境下 2024-6-15 比 2024-06-15 更自然，
 *      但年份为 0 的脏数据要挡住，不能输出 0-0-0。
 */

/** 把云数据库的各种时间表示统一成 Date，失败返回 null */
function toDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  // 云函数里用 new Date() 构造的字段，取出来可能是 { $date: ... }
  if (typeof value === 'object' && value.$date) {
    return toDate(value.$date);
  }

  if (typeof value === 'string') {
    // iOS 不支持 '2024-06-15T00:00:00Z' 这种带连字符的短格式，
    // 直接 new Date() 会得到 Invalid Date，只能先换成斜杠
    const normalized = value
      .replace(/-/g, '/')
      .replace(/(\.\d+)?Z?$/, '');
    const parsed = new Date(normalized);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

/**
 * 绝对日期，YYYY-M-D。解析失败一律返回 '很久以前'，不返回空串。
 */
function formatDate(value) {
  const date = toDate(value);
  if (!date) {
    return '很久以前';
  }
  const year = date.getFullYear();
  // 1970 年以下的负年份一律当脏数据处理
  if (year < 1970) {
    return '很久以前';
  }
  return `${year}-${date.getMonth() + 1}-${date.getDate()}`;
}

/**
 * 相对时间。用于通知等时效性内容，超过 30 天回落到绝对日期。
 * 这样「3 天前」不会在一个月后变成「很久以前」而失去意义。
 */
function formatRelative(value) {
  const date = toDate(value);
  if (!date) {
    return '很久以前';
  }

  const diff = Date.now() - date.getTime();
  if (diff < 0) {
    // 服务端时间与客户端时钟不一致时不要显示负数间隔
    return formatDate(date);
  }

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 30 * day) return `${Math.floor(diff / day)} 天前`;
  return formatDate(date);
}

/**
 * 时长（项目存活月数）。非法值返回 '—' 而不是 0 个月，
 * 0 个月会被误读成「立项当月就死了」，那是完全不同的结论。
 */
function formatDuration(months) {
  const n = Number(months);
  if (!isFinite(n) || n <= 0) {
    return '—';
  }
  return `${Math.round(n)} 个月`;
}

/** 金额。带千分位，非法值返回 '—' */
function formatAmount(yuan) {
  const n = Number(yuan);
  if (!isFinite(n) || n < 0) {
    return '—';
  }
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

module.exports = {
  toDate,
  formatDate,
  formatRelative,
  formatDuration,
  formatAmount
};
