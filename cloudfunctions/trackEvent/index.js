const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 埋点写入通道。
 *
 * 为什么必须走云函数、且 events 集合客户端完全不可写：
 * 当前架构允许客户端直接写业务集合。如果埋点集合同样开放，
 * 任何人打开调试器就能伪造「我读了 1000 篇」，
 * 于是阅读渗透率、人均月阅读条数、次月留存率同时失效——
 * 一个能自己造数的指标体系，等于没有指标体系。
 *
 * 三重防御（缺一不可）：
 *   1. 集合权限：events 不允许客户端写（部署指南 §五）
 *   2. 事件白名单：只接受下方 EVENT_WHITELIST 内的名字
 *   3. 身份不信客户端：OPENID 一律从 getWXContext() 取，
 *      客户端传上来的任何身份字段都被丢弃
 */

/** 事件白名单。必须与 miniprogram/utils/constants.js 的 TRACK_EVENTS 保持一致。 */
const EVENT_WHITELIST = [
  'app_launch',
  'project_view',
  'search_submit',
  'search_result_click',
  'root_cause_filter',
  'project_like',
  'project_favorite',
  'comment_submit',
  'share_click',
  'notification_click',
  'publish_start',
  'publish_success',
  'publish_abandon',
  'publish_error',
  'consult_page_view',
  'order_submit',
  'vip_page_view',
  'vip_order_submit',
  'debug_entry_click'
];

/** 单次调用最多接受的事件数，防止有人构造 1 万条把集合打爆 */
const MAX_BATCH = 20;
/** 单个属性值最大长度，防止超长文本撑爆文档 */
const MAX_VALUE_LEN = 200;
/** 单个事件最多携带的属性数 */
const MAX_PROPS = 8;

/**
 * 身份哈希盐。
 *
 * 优先读环境变量 TRACK_SALT。未配置时退化为 appid，
 * 保证 clone 下来就能跑，但会削弱不可逆性——
 * 上线前必须在云函数环境变量里配一个随机盐。
 * 见 docs/product/埋点方案.md 第五节。
 */
const SALT = process.env.TRACK_SALT || '';

/** openid -> 稳定假名。同一用户跨月仍是同一个值，留存率才算得出来。 */
function hashOpenid(openid, salt) {
  return crypto
    .createHash('sha256')
    .update(salt + '|' + openid)
    .digest('hex')
    .slice(0, 16);
}

/**
 * 属性清洗：只保留标量，丢弃嵌套对象与超长值。
 * 埋点属性一旦开始塞对象，指标口径就会变得不可验证。
 */
function sanitizeProps(input) {
  const out = {};
  if (!input || typeof input !== 'object') {
    return out;
  }
  const keys = Object.keys(input).slice(0, MAX_PROPS);
  for (const key of keys) {
    const value = input[key];
    if (value === null || value === undefined) {
      continue;
    }
    const type = typeof value;
    if (type === 'string') {
      out[key] = value.slice(0, MAX_VALUE_LEN);
    } else if (type === 'number') {
      // NaN / Infinity 会在 JSON 序列化时变成 null，直接丢掉
      if (isFinite(value)) {
        out[key] = value;
      }
    } else if (type === 'boolean') {
      out[key] = value;
    }
  }
  return out;
}

exports.main = async (event) => {
  // 埋点失败绝不能影响调用方，因此这里不向外抛错，只做尽力写入
  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;

    // 未登录上下文直接丢弃，不写脏数据
    if (!openid) {
      return { ok: true, accepted: 0 };
    }

    const incoming = event && Array.isArray(event.events) ? event.events : [];
    if (incoming.length === 0) {
      return { ok: true, accepted: 0 };
    }

    const uid = hashOpenid(openid, SALT || wxContext.APPID);
    const now = db.serverDate();
    const accepted = [];

    for (const item of incoming.slice(0, MAX_BATCH)) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      // 白名单外的名字直接丢弃，不报错也不记录
      if (EVENT_WHITELIST.indexOf(item.event) === -1) {
        continue;
      }
      accepted.push({
        event: item.event,
        uid: uid,
        // 页面级上下文，与事件属性合并成扁平结构，便于直接聚合
        props: Object.assign({}, sanitizeProps(item.ctx), sanitizeProps(item.props)),
        // 客户端时间仅作参考，统计口径一律以 createdAt 为准，
        // 否则改手机时间就能伪造「本月活跃」
        clientTs: typeof item.ts === 'number' ? item.ts : 0,
        createdAt: now
      });
    }

    if (accepted.length > 0) {
      await db.collection('events').add({ data: accepted });
    }

    return { ok: true, accepted: accepted.length };
  } catch (err) {
    console.error('[trackEvent] 写入失败：', err);
    return { ok: true, accepted: 0 };
  }
};
