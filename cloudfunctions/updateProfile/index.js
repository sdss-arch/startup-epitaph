const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 更新个人资料。
 *
 * 为什么资料修改要走云函数，而不是客户端 where().update()：
 *
 * 权益字段（isVip / vipExpireAt / projectsCount）只能由服务端写：
 *   - isVip / vipExpireAt  → 支付回调（见 createOrder 的注释）
 *   - projectsCount        → publishProject / deleteProject 增减
 * 本函数只接受白名单里的三个资料字段，其余一律丢弃。
 *
 * 但白名单本身不够，这一点是踩过坑才补上的：
 * users 集合曾经配成「仅创建者可写」，而那个权限允许本人写任意字段，
 * 于是调试器里一句
 *   wx.cloud.database().collection('users')
 *     .doc('<自己的记录>').update({ isVip: true })
 * 完全绕开本函数照样生效——白名单管的是「走哪个入口」，
 * 权限管的是「能不能绕过入口」，当时只做了前者。
 *
 * 现在 users 已锁成客户端完全不可写（见 docs/部署指南.md 第五节），
 * 本函数是改资料的唯一路径，白名单因此才真正有意义。
 * scripts/check.ps1 第 16 项会持续确认客户端没有别的地方在写 users。
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
