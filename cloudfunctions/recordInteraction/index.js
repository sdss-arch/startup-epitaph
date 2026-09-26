const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 阅读与致敬的服务端计数。
 *
 * 为什么不能由客户端直接写：
 *
 * 1. 权限规则不允许。projects 集合的写权限是
 *    「仅创建者(doc._openid == auth.openid)」，而 A 用户浏览 B 用户的项目时，
 *    客户端执行 projects.doc(id).update({ views: _.inc(1) }) 必然被拒绝。
 *    旧代码用 try/catch 把这个错误吞成一行日志，结果是
 *    **浏览量从来没有涨过**，而界面看起来一切正常。
 *
 * 2. 点赞计数器会漂移。旧代码先插 likes 文档、再更新 projects.likes，
 *    两次请求不是事务。中间失败就永久不一致；
 *    而 _.inc(-1) 在计数已经错乱时能把 likes 减成负数。
 *
 * 3. 浏览量可以无限刷。指标体系里明写了「不追 PV 作为成功指标」，
 *    但只要计数在客户端，随便写个循环就能刷出十万浏览。
 *
 * 这里的处理：
 *   - 计数一律走服务端，绕过集合权限
 *   - 阅读按「用户 + 项目 + 自然日」去重，重复进入不重复计数
 *   - 点赞/取消在同一事务里完成计数与文档增删，不可能不一致
 *   - 单次调用只处理一个动作，参数用白名单校验
 */

/** 去重窗口：同一人同一项目一天内只计一次阅读 */
const VIEW_DEDUP_DAYS = 1;

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const OPENID = wxContext.OPENID;

  if (!OPENID) {
    return { success: false, error: '未登录' };
  }

  const action = event && event.action;
  const projectId = event && event.projectId;

  if (typeof projectId !== 'string' || !projectId) {
    return { success: false, error: '缺少项目 ID' };
  }

  try {
    if (action === 'view') {
      return await recordView(OPENID, projectId);
    }
    if (action === 'like') {
      return await setLike(OPENID, projectId, true);
    }
    if (action === 'unlike') {
      return await setLike(OPENID, projectId, false);
    }
    return { success: false, error: '不支持的操作' };
  } catch (err) {
    console.error('[recordInteraction] 失败：', err);
    return { success: false, error: err.message };
  }
};

/**
 * 阅读计数 + 去重。
 * 去重键不含 openid 明文，只用哈希，和埋点口径保持一致。
 */
async function recordView(OPENID, projectId) {
  const projectRes = await db.collection('projects').doc(projectId).get();
  if (!projectRes.data) {
    return { success: false, error: '项目不存在' };
  }

  const uid = hashUid(OPENID);
  const dayKey = dayBucket();
  const viewKey = uid + '|' + projectId + '|' + dayKey;

  // 已存在今日阅读记录则不重复计数
  const existing = await db.collection('project_views').where({
    _id: viewKey
  }).get();

  if (existing.data.length > 0) {
    return { success: true, counted: false, views: projectRes.data.views || 0 };
  }

  await db.collection('project_views').add({
    data: {
      _id: viewKey,
      projectId: projectId,
      day: dayKey,
      createdAt: db.serverDate()
    }
  });

  await db.collection('projects').doc(projectId).update({
    data: { views: _.inc(1) }
  });

  return { success: true, counted: true, views: (projectRes.data.views || 0) + 1 };
}

/** 点赞与取消。计数与 likes 文档在同一个事务里变更 */
async function setLike(OPENID, projectId, liked) {
  const projectRes = await db.collection('projects').doc(projectId).get();
  if (!projectRes.data) {
    return { success: false, error: '项目不存在' };
  }

  const tx = await db.startTransaction();
  try {
    const likesCol = tx.collection('likes');
    const existing = await likesCol.where({
      projectId: projectId,
      _openid: OPENID
    }).get();

    const already = existing.data.length > 0;

    if (liked && !already) {
      await likesCol.add({
        data: { projectId: projectId, createdAt: db.serverDate() }
      });
    } else if (!liked && already) {
      await likesCol.doc(existing.data[0]._id).remove();
    } else {
      // 状态已经一致，不做任何写入，避免计数被重复加减
      await tx.rollback();
      return {
        success: true,
        changed: false,
        likes: projectRes.data.likes || 0
      };
    }

    const delta = liked ? 1 : -1;
    // 下限保护：即使历史数据已经错乱，也不会把计数减成负数
    const nextLikes = Math.max(0, (projectRes.data.likes || 0) + delta);
    const adjust = nextLikes - (projectRes.data.likes || 0);

    await tx.collection('projects').doc(projectId).update({
      data: { likes: _.inc(adjust) }
    });

    await tx.commit();

    return { success: true, changed: true, likes: nextLikes };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

function hashUid(openid) {
  return crypto
    .createHash('sha256')
    .update((process.env.TRACK_SALT || '') + '|' + openid)
    .digest('hex')
    .slice(0, 16);
}

function dayBucket() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
