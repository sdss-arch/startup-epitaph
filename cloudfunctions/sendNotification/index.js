const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 站内通知。
 *
 * ⚠️ 安全设计变更（这一版修的是一个高危漏洞）
 *
 * 原实现把 type / title / content / recipientId 全部从客户端接收，
 * 且不做任何鉴权。任何人打开调试器执行：
 *   wx.cloud.callFunction({
 *     name: 'sendNotification',
 *     data: { recipientId: '<别人的 openid>', type: 'system',
 *             title: 'VIP会员开通成功', content: '...' }
 *   })
 * 就能往任意用户的通知列表里塞一条伪造的系统消息。
 * 配合界面上带「›」的样式（暗示可点击跳转），这是一条完整的钓鱼链路。
 *
 * 现在的约束：
 *   1. recipientId 强制等于调用者自己的 OPENID —— 只能给自己发
 *   2. title / content 由服务端模板渲染，客户端**无法自定义任何文案**
 *   3. type 走白名单，且是「客户端有理由主动申请」的那几种
 *   4. 单用户频率限制
 *
 * 真正的系统通知（订单、咨询）由各自的云函数直接写库，
 * 不经过本函数——那条路径是服务端行为，不存在伪造问题。
 */

const TEMPLATES = {
  order_created: {
    title: '订单已创建',
    content: '你的订单已生成，支付功能尚未接入，权益暂未发放。'
  },
  consultation_created: {
    title: '咨询已提交',
    content: '你的咨询已提交，导师回复后会在这里通知你。'
  },
  vip_expiring: {
    title: '会员即将到期',
    content: '你的会员将在 7 天后到期，到期后咨询将恢复原价。'
  }
};

const ALLOWED_TYPES = Object.keys(TEMPLATES);

/** 同一用户 10 分钟内最多 3 条，防止刷集合 */
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 3;

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const OPENID = wxContext.OPENID;

  if (!OPENID) {
    return { success: false, error: '未登录' };
  }

  try {
    const type = (event && event.type) || '';

    if (ALLOWED_TYPES.indexOf(type) === -1) {
      return { success: false, error: '不支持的通知类型' };
    }

    // 客户端若传了 recipientId 且不是自己，直接拒绝。
    // 不静默纠正——静默纠正会让调用方误以为请求成功。
    if (event.recipientId && event.recipientId !== OPENID) {
      console.warn('[sendNotification] 拒绝向他人发送通知：', OPENID);
      return { success: false, error: '只能接收自己的通知' };
    }

    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
    const recentRes = await db.collection('notifications').where({
      recipientId: OPENID,
      createdAt: db.command.gte(since)
    }).count();

    if (recentRes.total >= RATE_LIMIT_MAX) {
      return { success: false, error: '操作过于频繁，请稍后再试' };
    }

    const tpl = TEMPLATES[type];
    const result = await db.collection('notifications').add({
      data: {
        type: type,
        // 文案只来自服务端模板
        title: tpl.title,
        content: tpl.content,
        // 收件人恒为调用者自己
        recipientId: OPENID,
        relatedId: null,
        relatedType: null,
        read: false,
        createdAt: db.serverDate()
      }
    });

    return { success: true, notificationId: result._id };
  } catch (err) {
    console.error('发送通知失败：', err);
    return { success: false, error: err.message };
  }
};
