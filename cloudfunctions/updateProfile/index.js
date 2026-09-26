const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 更新个人资料。
 *
 * 为什么资料修改要走云函数，而不是客户端 where().update()：
 *
 * users 集合对客户端开放写权限（仅创建者可写）。页面里虽然只显式传了
 * 3 个字段，但那只约束了这个页面——任何人打开调试器执行
 *   wx.cloud.database().collection('users')
 *     .where({ _openid: '<自己的 openid>' })
 *     .update({ data: { isVip: true } })
 * 就能给自己打上会员标记。而 isVip 是咨询 8 折的唯一判据，
 * 于是这是一条完整的提权路径。
 *
 * 权益字段（isVip / vipExpireAt / projectsCount）只能由服务端写：
 *   - isVip / vipExpireAt  → 支付回调（见 createOrder 的注释）
 *   - projectsCount        → publishProject / deleteProject 增减
 * 本函数只接受白名单里的三个资料字段，其余一律丢弃。
 */

const ALLOWED = {
  nickname: { max: 20 },
  bio: { max: 100 },
  avatarUrl: { max: 500 }
};

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const OPENID = wxContext.OPENID;

  if (!OPENID) {
    return { success: false, error: '未登录' };
  }

  try {
    const patch = {};
    const input = (event && event.profile) || {};

    for (const key of Object.keys(ALLOWED)) {
      if (typeof input[key] !== 'string') {
        continue;
      }
      const value = input[key].trim().slice(0, ALLOWED[key].max);
      if (key === 'nickname' && !value) {
        return { success: false, error: '昵称不能为空' };
      }
      patch[key] = value;
    }

    if (Object.keys(patch).length === 0) {
      return { success: false, error: '没有可更新的内容' };
    }

    const userRes = await db.collection('users').where({ _openid: OPENID }).limit(1).get();

    if (userRes.data.length === 0) {
      return { success: false, error: '用户不存在' };
    }

    await db.collection('users').doc(userRes.data[0]._id).update({
      data: Object.assign({}, patch, { updatedAt: db.serverDate() })
    });

    return { success: true, profile: patch };
  } catch (err) {
    console.error('[updateProfile] 失败：', err);
    return { success: false, error: err.message };
  }
};
