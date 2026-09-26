const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    stats: {
      totalProjects: 0,
      totalCost: 0,
      totalViews: 0,
      totalLikes: 0,
      industryStats: [],
      loading: true
    }
  },

  onLoad() {
    this.loadStatistics();
  },

  async loadStatistics() {
    this.setData({ 'stats.loading': true });
    try {
      const projectsRes = await db.collection('projects').get();
      const projects = projectsRes.data;

      let totalCost = 0;
      let totalViews = 0;
      let totalLikes = 0;
      const industryMap = {};

      projects.forEach(project => {
        totalCost += project.cost || 0;
        totalViews += project.views || 0;
        totalLikes += project.likes || 0;

        if (project.industry) {
          if (industryMap[project.industry]) {
            industryMap[project.industry]++;
          } else {
            industryMap[project.industry] = 1;
          }
        }
      });

      const industryStats = Object.keys(industryMap).map(industry => ({
        name: industry,
        count: industryMap[industry]
      })).sort((a, b) => b.count - a.count);

      this.setData({
        stats: {
          totalProjects: projects.length,
          totalCost: totalCost,
          totalViews: totalViews,
          totalLikes: totalLikes,
          industryStats: industryStats,
          loading: false
        }
      });
    } catch (err) {
      console.error('加载统计数据失败：', err);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      this.setData({ 'stats.loading': false });
    }
  }
});
