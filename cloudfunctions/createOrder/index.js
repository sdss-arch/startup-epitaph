const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * VIP 订单创建。
 *
 * ⚠️ 支付尚未接入，因此本函数**只建待支付订单，不发放任何权益**。
 *
 * 上一版这里把 status 直接写成 'paid' 并立刻置 isVip: true，
 * 意味着点一下按钮就能拿到永久 VIP。这比「订单参数可伪造」严重得多——
 * 价格本来就是服务端查表得来的（不可伪造），
 * 真正的缺陷是整条支付链路根本不存在。
 *
 * 接入支付时需要补的部分（见 docs/发布检查清单.md）：
 *   1. 调 cloud.cloudPay.unifiedOrder 拿到 prepay_id
 *   2. 客户端 wx.requestPayment 发起支付
 *   3. 新增 payNotify 云函数接收支付回调，回调里校验
 *      out_trade_no 与金额一致后，才把 status 改为 'paid' 并发放 isVip
 *   4. 回调必须做幂等：同一 out_trade_no 只发放一次
 * 权益发放逻辑建议直接抽出去给 payNotify 复用，不要留在本函数。
 */

const PLAN_CONFIG = {
  month: { amount: 1900, name: '月度会员', duration: 30 },
  year: { amount: 19900, name: '年度会员', duration: 365 }
};

/** 同一用户同一套餐存在未完成订单时不再重复创建 */
const MAX_PENDING_PER_PLAN = 1;

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const OPENID = wxContext.OPENID;

  if (!OPENID) {
    return { success: false, error: '未登录' };
  }

  try {
    const plan = event && event.plan;
    const config = PLAN_CONFIG[plan];
    if (!config) {
      return { success: false, error: '无效的套餐' };
    }

    const pendingRes = await db.collection('orders').where({
      userId: OPENID,
      type: 'vip',
      plan: plan,
      status: 'pending'
    }).get();

    if (pendingRes.data.length >= MAX_PENDING_PER_PLAN) {
      return {
        success: false,
        error: '你已有一笔待支付的订单，请先完成支付或等待超时释放'
      };
    }

    // 订单号是可追溯的财务凭证，用 crypto 而不是 Math.random
    const orderId = 'ORDER_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex');
    const now = new Date();
    const expireAt = new Date(now.getTime() + config.duration * 24 * 60 * 60 * 1000);

    await db.collection('orders').add({
      data: {
        _id: orderId,
        orderNo: orderId,
        type: 'vip',
        plan: plan,
        amount: config.amount,
        // 未接入支付前只能是 pending。绝不能在没有收到支付回调的情况下写 paid。
        status: 'pending',
        planName: config.name,
        // 权益到期时间。支付成功时才由 payNotify 依据它写入 users.vipExpireAt，
        // 这里只作为订单快照留存
        vipDurationDays: config.duration,
        expectedExpireAt: expireAt,
        userId: OPENID,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });

    return {
      success: true,
      orderId: orderId,
      amount: config.amount,
      planName: config.name,
      // 明确告诉客户端：钱还没付，权益也没发
      paymentRequired: true,
      message: '订单已创建，支付功能尚未接入，权益暂未发放'
    };
  } catch (err) {
    console.error('创建订单失败：', err);
    return { success: false, error: err.message };
  }
};
