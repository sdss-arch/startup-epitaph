const cloud = require('wx-server-sdk');
const { validateProject } = require('./schema.js');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const OPENID = wxContext.OPENID;

  if (!OPENID) {
    return { success: false, error: '未登录' };
  }

  const projectId = event && event.projectId;

  try {
    if (!projectId || typeof projectId !== 'string') {
      return { success: false, error: '缺少项目 ID' };
    }

    const projectRes = await db.collection('projects').doc(projectId).get();

    if (!projectRes.data) {
      return { success: false, error: '项目不存在' };
    }

    if (projectRes.data._openid !== OPENID) {
      return { success: false, error: '无权编辑该项目' };
    }

    // 与 publishProject 走同一套校验：编辑不能成为绕过约束的后门。
    // 原先是 { ...projectData } 整体展开，授权用户可以借此改写
    // _openid（转移所有权）、views、likes、createdAt。
    const checked = validateProject(event.projectData);
    if (!checked.ok) {
      return { success: false, error: checked.error };
    }

    await db.collection('projects').doc(projectId).update({
      data: Object.assign({}, checked.data, {
        updatedAt: db.serverDate()
        // views / likes / status / createdAt / _openid 刻意不在更新范围内：
        // 浏览与致敬是行为数据，审核状态只能由审核流程改，
        // 所有权更不能通过编辑内容变更。
      })
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
