/**
 * 埋点上报封装。
 *
 * 三条设计约束（改动前请先读 docs/product/埋点方案.md）：
 *
 * 1. 永不影响主流程。
 *    埋点失败绝不能让用户看到报错。queue 满、函数超时、云端异常，
 *    一律静默丢弃。指标少一条可以接受，页面挂掉不可接受。
 *
 * 2. 客户端不上报 openid。
 *    用户身份由云函数从 cloud.getWXContext() 自行获取，
 *    客户端传上来的身份一律不信（否则任何人可以伪造他人阅读记录，
 *    所有消费侧指标同时失效）。服务端只落 openid 的哈希值。
 *
 * 3. 批量 + 合并。
 *    逐条 callFunction 在低端机上能明显拖慢首屏，因此先进内存队列，
 *    攒够或超时再一次性上报，页面切后台时强制 flush。
 */

const { TRACK_EVENTS } = require('./constants.js');

const FLUSH_THRESHOLD = 5;   // 攒够 5 条立刻上报
const FLUSH_INTERVAL = 8000; // 或最多等 8 秒
const MAX_QUEUE = 50;        // 队列上限，防止用户狂点时无限堆积

let queue = [];
let timer = null;
let context = {}; // 页面级上下文，如 { industry: '电商' }，随事件一起上报

/**
 * 设置后续事件的公共属性。在 Page 的 onLoad 里调一次即可。
 * @param {object} extra
 */
function setContext(extra) {
  context = Object.assign({}, extra);
}

/**
 * 上报一个事件。
 *
 * @param {string} event 事件名，必须在 constants.TRACK_EVENTS 内
 * @param {object} [props] 事件属性。不要放敏感信息，不要放明文 openid。
 */
function track(event, props) {
  // 开发期自检：拼错事件名是埋点最常见的错误，静默丢弃会很难发现
  if (TRACK_EVENTS.indexOf(event) === -1) {
    console.warn('[track] 未登记的事件名：' + event);
    return;
  }
  if (queue.length >= MAX_QUEUE) {
    return;
  }

  queue.push({
    event: event,
    props: props || {},
    ctx: context,
    ts: Date.now()
  });

  if (queue.length >= FLUSH_THRESHOLD) {
    flush();
    return;
  }
  if (!timer) {
    timer = setTimeout(flush, FLUSH_INTERVAL);
  }
}

/** 立即上报队列中的全部事件 */
function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0) {
    return;
  }

  const batch = queue;
  queue = [];

  wx.cloud.callFunction({
    name: 'trackEvent',
    data: { events: batch }
  }).catch(function (err) {
    // 静默失败是设计意图，不打 console 以免干扰真机调试
    console.log('[track] 上报失败（已丢弃）', err && err.errMsg);
  });
}

/**
 * 判断某事件今天是否已报过（用于「进入发布页」这类只需计一次的口径）。
 * 只在单次会话内有效，够用即可，不做持久化。
 */
const fired = {};
function once(event, props) {
  if (fired[event]) {
    return;
  }
  fired[event] = true;
  track(event, props);
}

module.exports = {
  track: track,
  once: once,
  flush: flush,
  setContext: setContext
};
