const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { OPENID } = wxContext;

  try {
    const userRes = await db.collection('users').where({
      _openid: OPENID
    }).get();

    if (userRes.data.length === 0) {
      await db.collection('users').add({
        data: {
          nickname: '匿名创业者',
          avatarUrl: '',
          bio: '这里记录着创业的故事',
          projectsCount: 0,
          createdAt: db.serverDate()
        }
      });
    }

    return {
      openid: OPENID,
      appid: wxContext.APPID,
      unionid: wxContext.UNIONID
    };
  } catch (err) {
    console.error(err);
    return {
      error: err.message
    };
  }
};
