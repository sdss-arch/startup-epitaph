const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { OPENID } = wxContext;
  const { projectId } = event;

  try {
    // 验证项目是否属于当前用户
    const projectRes = await db.collection('projects').doc(projectId).get();

    if (!projectRes.data) {
      return {
        success: false,
        error: '项目不存在'
      };
    }

    if (projectRes.data._openid !== OPENID) {
      return {
        success: false,
        error: '无权删除该项目'
      };
    }

    // 删除项目
    await db.collection('projects').doc(projectId).remove();

    // 删除项目相关的点赞、评论、收藏
    await db.collection('likes').where({
      projectId: projectId
    }).remove();

    await db.collection('comments').where({
      projectId: projectId
    }).remove();

    await db.collection('favorites').where({
      projectId: projectId
    }).remove();

    // 更新用户项目数
    await db.collection('users').where({
      _openid: OPENID
    }).update({
      data: {
        projectsCount: _.inc(-1)
      }
    });

    return {
      success: true,
      projectId: projectId
    };
  } catch (err) {
    console.error(err);
    return {
      success: false,
      error: err.message
    };
  }
};
