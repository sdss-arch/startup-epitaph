const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { OPENID } = wxContext;
  const { projectId, projectData } = event;

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
        error: '无权编辑该项目'
      };
    }

    await db.collection('projects').doc(projectId).update({
      data: {
        ...projectData,
        updatedAt: db.serverDate()
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
