const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();

  const {
    type,
    title,
    content,
    recipientId,
    relatedId,
    relatedType,
    data
  } = event;

  try {
    const notification = {
      type: type || 'system',
      title: title,
      content: content,
      recipientId: recipientId,
      relatedId: relatedId || null,
      relatedType: relatedType || null,
      data: data || {},
      read: false,
      createdAt: db.serverDate()
    };

    const result = await db.collection('notifications').add({
      data: notification
    });

    return {
      success: true,
      notificationId: result._id
    };
  } catch (err) {
    console.error('发送通知失败：', err);
    return {
      success: false,
      error: err.message
    };
  }
};
