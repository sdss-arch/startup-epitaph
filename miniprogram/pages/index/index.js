const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    projects: [],
    currentFilter: 'all',
    loading: false,
    hasMore: true,
    pageSize: 10
  },

  onLoad() {
    this.loadProjects();
  },

  onPullDownRefresh() {
    this.setData({
      projects: [],
      hasMore: true
    });
    this.loadProjects().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadProjects();
    }
  },

  setFilter(e) {
    const filter = e.currentTarget.dataset.filter;
    this.setData({
      currentFilter: filter,
      projects: [],
      hasMore: true
    });
    this.loadProjects();
  },

  async loadProjects() {
    if (this.data.loading || !this.data.hasMore) return;

    this.setData({ loading: true });

    try {
      let query = db.collection('projects');

      // 先尝试按 createdAt 排序，如果失败就不排序
      try {
        if (this.data.currentFilter === 'recent') {
          query = query.orderBy('createdAt', 'desc');
        } else if (this.data.currentFilter === 'hot') {
          query = query.orderBy('likes', 'desc');
        } else {
          query = query.orderBy('views', 'desc');
        }
      } catch (err) {
        console.log('排序字段不存在，使用默认顺序');
      }

      const res = await query
        .skip(this.data.projects.length)
        .limit(this.data.pageSize)
        .get();

      const projects = res.data.map(item => {
        // 安全地处理日期
        if (item.createdAt) {
          const date = new Date(item.createdAt);
          item.createdAtText = this.formatDate(date);
        } else {
          item.createdAtText = '很久以前';
        }
        // 确保有默认值
        item.views = item.views || 0;
        item.likes = item.likes || 0;
        item.photos = item.photos || [];
        return item;
      });

      this.setData({
        projects: [...this.data.projects, ...projects],
        hasMore: projects.length === this.data.pageSize
      });
    } catch (err) {
      console.error('加载项目失败：', err);
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
