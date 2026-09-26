const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { plan } = event;

  try {
    const planConfig = {
      month: {
        amount: 1900,
        name: '月度会员',
        duration: 30
      },
      year: {
        amount: 19900,
        name: '年度会员',
        duration: 365
      }
    };

    const config = planConfig[plan];
    if (!config) {
      return { success: false, error: '无效的套餐' };
    }

    const orderId = `ORDER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    const expireAt = new Date(now.getTime() + config.duration * 24 * 60 * 60 * 1000);

    const order = {
      _id: orderId,
      orderNo: orderId,
      type: 'vip',
      plan: plan,
      amount: config.amount,
      status: 'paid',
      userId: wxContext.OPENID,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    };

    await db.collection('orders').add({ data: order });

    // 激活用户VIP
    const userRes = await db.collection('users').where({
      _openid: wxContext.OPENID
    }).get();

    if (userRes.data.length > 0) {
      await db.collection('users').doc(userRes.data[0]._id).update({
        data: {
          isVip: true,
          vipExpireAt: expireAt,
          updatedAt: db.serverDate()
        }
      });
    } else {
      await db.collection('users').add({
        data: {
          isVip: true,
          vipExpireAt: expireAt,
          projectsCount: 0,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });
    }

    // 发送通知
    try {
      await db.collection('notifications').add({
        data: {
          type: 'system',
          title: 'VIP会员开通成功',
          content: `恭喜您成功开通${config.name}，有效期至${expireAt.getFullYear()}-${String(expireAt.getMonth() + 1).padStart(2, '0')}-${String(expireAt.getDate()).padStart(2, '0')}`,
          recipientId: wxContext.OPENID,
          read: false,
          createdAt: db.serverDate()
        }
      });
    } catch (e) {
      console.error('发送通知失败：', e);
    }

    return {
      success: true,
      message: 'VIP开通成功'
    };
  } catch (err) {
    console.error('创建订单失败：', err);
    return { success: false, error: err.message };
  }
};
