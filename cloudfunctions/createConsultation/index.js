const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 咨询预约。
 *
 * 价格与导师姓名一律从 advisors 集合读取，不接受客户端传值。
 * 原实现 `const { advisorId, advisorName, price } = event` 三项全信客户端，
 * 构造一次调用即可 price: 0 下单。定价是商业模式的底线，不能由购买方决定。
 *
 * 与 createOrder 同样的口径：支付未接入，因此
 *   - 状态为 pending_payment，不是 confirmed
 *   - 不创建 orders 记录（接入支付后由本函数补建）
 */

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const OPENID = wxContext.OPENID;

  if (!OPENID) {
    return { success: false, error: '未登录' };
  }

  try {
    const advisorId = event && event.advisorId;
    if (!advisorId || typeof advisorId !== 'string') {
      return { success: false, error: '缺少导师 ID' };
    }

    const advisorRes = await db.collection('advisors').doc(advisorId).get();
    const advisor = advisorRes.data;

    if (!advisor) {
      return { success: false, error: '该导师不存在或已下架' };
    }

    // 服务端定价。VIP 折扣同样在服务端算，避免客户端传入折后价。
    let price = Number(advisor.price);
    if (!isFinite(price) || price <= 0) {
      return { success: false, error: '导师定价异常，请稍后再试' };
    }

    const userRes = await db.collection('users').where({ _openid: OPENID }).limit(1).get();
    const isVip = !!(userRes.data[0] && userRes.data[0].isVip);
    const originalPrice = price;
    if (isVip) {
      price = Math.floor(price * 0.8);
    }

    const consultationId =
      'CONSULT_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex');

    await db.collection('consultations').add({
      data: {
        _id: consultationId,
        advisorId: advisorId,
        // 姓名与定价快照：导师改名或调价不影响历史订单
        advisorName: advisor.name || '',
        originalPrice: originalPrice,
        price: price,
        discountApplied: isVip,
        userId: OPENID,
        // 未接入支付，不能直接 confirmed
        status: 'pending_payment',
        rating: null,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });

    try {
      await db.collection('notifications').add({
        data: {
          type: 'consultation',
          title: '咨询已提交',
          content: '你的咨询已提交，支付完成后导师会与你联系确认时间。',
          recipientId: OPENID,
          relatedId: consultationId,
          relatedType: 'consultation',
          read: false,
          createdAt: db.serverDate()
        }
      });
    } catch (e) {
      // 通知失败不影响主流程
      console.error('发送通知失败：', e);
    }

    return {
      success: true,
      consultationId: consultationId,
      price: price,
      originalPrice: originalPrice,
      paymentRequired: true,
      message: '预约已提交，支付功能尚未接入'
    };
  } catch (err) {
    console.error('创建咨询订单失败：', err);
    return { success: false, error: err.message };
  }
};
