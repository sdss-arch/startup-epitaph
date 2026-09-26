const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { OPENID } = wxContext;
  const { projectData } = event;

  try {
    const projectRes = await db.collection('projects').add({
      data: {
        ...projectData,
        views: 0,
        likes: 0,
        status: 'failed',
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
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
