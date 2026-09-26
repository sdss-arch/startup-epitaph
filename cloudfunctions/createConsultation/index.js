const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { advisorId, advisorName, price } = event;

  try {
    const consultationId = `CONSULT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const consultation = {
      _id: consultationId,
      advisorId: advisorId,
      advisorName: advisorName,
      price: price,
      status: 'confirmed',
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    };

    await db.collection('consultations').add({ data: consultation });

    // 发送通知
    try {
      await db.collection('notifications').add({
        data: {
          type: 'consultation',
          title: '咨询预约成功',
          content: `您已成功预约${advisorName}的咨询服务，导师将会与您联系确认具体时间`,
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
      message: '预约成功'
    };
  } catch (err) {
    console.error('创建咨询订单失败：', err);
    return { success: false, error: err.message };
  }
};
