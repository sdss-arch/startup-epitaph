const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    projects: [],
    loading: false,
    hasMore: true,
    pageSize: 10
  },

  onLoad() {
    this.loadFavorites();
  },

  onPullDownRefresh() {
    this.setData({
      projects: [],
      hasMore: true
    });
    this.loadFavorites().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadFavorites();
    }
  },

  async loadFavorites() {
    if (!app.globalData.openid) return;

    if (this.data.loading || !this.data.hasMore) return;

    this.setData({ loading: true });

    try {
      let favoritesQuery = db.collection('favorites')
        .where({
          _openid: app.globalData.openid
        });

      // 尝试排序，如果失败就不排序
      try {
        favoritesQuery = favoritesQuery.orderBy('createdAt', 'desc');
      } catch (err) {
        console.log('收藏排序字段不存在');
      }

      const favoritesRes = await favoritesQuery
        .skip(this.data.projects.length)
        .limit(this.data.pageSize)
        .get();

      if (favoritesRes.data.length === 0) {
        this.setData({
          hasMore: false,
          loading: false
        });
        return;
      }

      const projectIds = favoritesRes.data.map(item => item.projectId);

      const projectsRes = await db.collection('projects')
        .where({
          _id: _.in(projectIds)
        })
        .get();

      const projects = projectsRes.data.map(item => {
        if (item.createdAt) {
          const date = new Date(item.createdAt);
          item.createdAtText = this.formatDate(date);
        } else {
          item.createdAtText = '很久以前';
        }
        item.views = item.views || 0;
        item.likes = item.likes || 0;
        item.photos = item.photos || [];
        return item;
      });

      const sortedProjects = projectIds.map(id =>
        projects.find(p => p._id === id)
      ).filter(Boolean);

      this.setData({
        projects: [...this.data.projects, ...sortedProjects],
        hasMore: favoritesRes.data.length === this.data.pageSize
      });
    } catch (err) {
      console.error('加载收藏失败：', err);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  formatDate(date) {
    if (!date || isNaN(date.getTime())) {
      return '很久以前';
    }
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return '今天';
    if (days === 1) return '昨天';
    if (days < 7) return `${days}天前`;
    if (days < 30) return `${Math.floor(days / 7)}周前`;
    if (days < 365) return `${Math.floor(days / 30)}个月前`;
    return `${Math.floor(days / 365)}年前`;
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}`
    });
  }
});
