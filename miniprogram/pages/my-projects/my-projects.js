const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    projects: [],
    loading: false,
    hasMore: true,
    pageSize: 10
  },

  onLoad() {
    this.loadMyProjects();
  },

  onShow() {
    if (this.data.projects.length > 0) {
      this.loadMyProjects();
    }
  },

  onPullDownRefresh() {
    this.setData({
      projects: [],
      hasMore: true
    });
    this.loadMyProjects().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMyProjects();
    }
  },

  async loadMyProjects() {
    if (!app.globalData.openid) return;

    if (this.data.loading || !this.data.hasMore) return;

    this.setData({ loading: true });

    try {
      let query = db.collection('projects')
        .where({
          _openid: app.globalData.openid
        });

      // 尝试排序，如果失败就不排序
      try {
        query = query.orderBy('views', 'desc');
      } catch (err) {
        console.log('排序字段不存在，使用默认顺序');
      }

      const res = await query
        .skip(this.data.projects.length)
        .limit(this.data.pageSize)
        .get();

      const projects = res.data.map(item => {
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
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}-${month}-${day}`;
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}`
    });
  },

  goToEdit(e) {
    e.stopPropagation();
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/edit-project/edit-project?id=${id}`
    });
  },

  deleteProject(e) {
    e.stopPropagation();
    const id = e.currentTarget.dataset.id;
    const index = e.currentTarget.dataset.index;

    wx.showModal({
      title: '确认删除',
      content: '删除后将无法恢复，确定要删除这个项目吗？',
      success: async (res) => {
        if (res.confirm) {
          await this.doDelete(id, index);
        }
      }
    });
  },

  async doDelete(id, index) {
    wx.showLoading({ title: '删除中...' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'deleteProject',
        data: {
          projectId: id
        }
      });

      if (res.result.success) {
        const newProjects = [...this.data.projects];
        newProjects.splice(index, 1);
        this.setData({ projects: newProjects });

        if (app.globalData.userInfo) {
          app.updateUserInfo({
            projectsCount: (app.globalData.userInfo.projectsCount || 0) - 1
          });
        }

        wx.hideLoading();
        wx.showToast({
          title: '已删除',
          icon: 'success'
        });
      } else {
        throw new Error(res.result.error || '删除失败');
      }
    } catch (err) {
      console.error('删除失败：', err);
      wx.hideLoading();
      wx.showToast({
        title: '删除失败',
        icon: 'none'
      });
    }
  },

  goToPublish() {
    wx.switchTab({
      url: '/pages/publish/publish'
    });
  }
});
