const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 静默登录：换取 openid，不弹授权框。
 *
 * 返回值说明：
 *   - openid 必须回给客户端，因为客户端要用它做 users 集合的 _openid 查询
 *   - unionid 不返回。它是跨应用统一标识，本项目没有任何需要它的场景，
 *     返回它只是徒增敏感数据面。
 *   - 不返回任何服务端凭证。客户端拿不到 AppSecret。
 */

exports.main = async () => {
  const wxContext = cloud.getWXContext();
  const OPENID = wxContext.OPENID;

  if (!OPENID) {
    return { error: '未获取到用户标识' };
  }

  try {
    const userRes = await db.collection('users').where({
      _openid: OPENID
    }).limit(1).get();

    if (userRes.data.length === 0) {
      // 建号路径必须唯一且字段完整。
      // 字段与 miniprogram/app.js 的兜底建号保持一致，
      // 否则会出现「有的用户有 nickname、有的没有」的脏数据。
      await db.collection('users').add({
        data: {
          nickname: '匿名创业者',
          avatarUrl: '',
          bio: '这里记录着创业的故事',
          projectsCount: 0,
          isVip: false,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });
    }

    return {
      openid: OPENID,
      appid: wxContext.APPID
    };
  } catch (err) {
    console.error(err);
    return {
      error: err.message
    };
  }
};
