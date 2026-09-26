const cloud = require('wx-server-sdk');
const { validateProject } = require('./schema.js');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const OPENID = wxContext.OPENID;

  if (!OPENID) {
    return { success: false, error: '未登录' };
  }

  // 只接受校验器产出的字段。views / likes / status / createdAt / _openid
  // 一律由服务端决定，客户端传了也不会入库。
  const checked = validateProject(event && event.projectData);
  if (!checked.ok) {
    return { success: false, error: checked.error };
  }

  try {
    const projectRes = await db.collection('projects').add({
      data: Object.assign({}, checked.data, {
        views: 0,
        likes: 0,
        // failed 是唯一合法初始状态。将来若引入「审核中」，
        // 应该由审核流程改写，而不是让投稿方自己声明
        status: 'failed',
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      })
    });

    await db.collection('users').where({
      _openid: OPENID
    }).update({
      data: {
        projectsCount: _.inc(1)
      }
    });

    return {
      success: true,
      projectId: projectRes._id
    };
  } catch (err) {
    console.error(err);
    return {
      success: false,
      error: err.message
    };
  }
};
