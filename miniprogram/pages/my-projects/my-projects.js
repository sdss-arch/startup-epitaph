const app = getApp();
const db = wx.cloud.database();
const { formatDate, formatDuration, formatAmount } = require('../../utils/format.js');
const { causeRootLabel, causeSymptomLabel } = require('../../utils/constants.js');

Page({
  data: {
    projects: [],
    loading: false,
    hasMore: true,
    pageSize: 10,
    offset: 0,
    loadError: '',
    notLoggedIn: false,
    deletingId: ''
  },

  onLoad() {
    this.loadMyProjects();
  },

  onShow() {
    // 旧代码这里是 `if (projects.length > 0) this.loadMyProjects()`，
    // 而 loadMyProjects 用 projects.length 当 skip 且直接 concat，
    // 于是每次从详情页返回都会把整页再追加一遍——项目数看起来会自己长大。
    // 现在 onShow 走 refresh()，先清空再拉第一页
    if (this._loadedOnce) {
      this.refresh();
    }
    this._loadedOnce = true;
  },

  onPullDownRefresh() {
    this.refresh().then(function () {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMyProjects();
    }
  },

  refresh() {
    this.setData({
      projects: [],
      hasMore: true,
      offset: 0,
      loadError: ''
    });
    return this.loadMyProjects();
  },

  async loadMyProjects() {
    if (!app.globalData.openid) {
      this.setData({ notLoggedIn: true, loading: false });
      return;
    }

    if (this.data.loading || !this.data.hasMore) {
      return;
    }

    this.setData({ loading: true });

    try {
      const offset = this.data.offset;
      // 自己的项目按发布时间倒序最符合直觉。
      // 旧代码按 views 排序，而 views 长期为 0，实际是随机顺序
      const res = await db.collection('projects')
        .where({ _openid: app.globalData.openid })
        .orderBy('createdAt', 'desc')
        .skip(offset)
        .limit(this.data.pageSize)
        .get();

      const projects = res.data.map(function (item) {
        return {
          _id: item._id,
          title: item.title || '（未命名项目）',
          description: item.description || '',
          industry: item.industry || '其他',
          cover: (item.photos && item.photos[0]) || '',
          photoCount: (item.photos && item.photos.length) || 0,
          views: item.views || 0,
          likes: item.likes || 0,
          costText: formatAmount(item.cost),
          durationText: formatDuration(item.duration),
          teamSize: item.teamSize || 0,
          // 这里也展示根因，让用户看到「自己填的分类」，
          // 顺便形成「发布时选对了没有」的自查闭环
          rootCauseText: causeRootLabel(item.causeRoot),
          symptomText: causeSymptomLabel(item.causeSymptom),
          hasCause: !!item.causeRoot,
          createdAtText: formatDate(item.createdAt)
        };
      });

      this.setData({
        projects: this.data.projects.concat(projects),
        offset: offset + res.data.length,
        hasMore: res.data.length === this.data.pageSize
      });
    } catch (err) {
      console.error('加载项目失败：', err);
      this.setData({ loadError: '加载失败，请下拉重试' });
    } finally {
      this.setData({ loading: false });
    }
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: '/pages/detail/detail?id=' + id
    });
  },

  goToEdit(e) {
    e.stopPropagation();
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: '/pages/edit-project/edit-project?id=' + id
    });
  },

  deleteProject(e) {
    e.stopPropagation();
    const id = e.currentTarget.dataset.id;
    const index = e.currentTarget.dataset.index;

    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，已产生的浏览与致敬记录会一并消失。确定删除吗？',
      confirmText: '删除',
      confirmColor: '#8b4513',
      success: (res) => {
        if (res.confirm) {
          this.doDelete(id, index);
        }
      }
    });
  },

  async doDelete(id, index) {
    this.setData({ deletingId: id });
    wx.showLoading({ title: '删除中...' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'deleteProject',
        data: { projectId: id }
      });

      if (!res.result || !res.result.success) {
        throw new Error((res.result && res.result.error) || '删除失败');
      }

      const newProjects = this.data.projects.slice();
      newProjects.splice(index, 1);

      this.setData({
        projects: newProjects,
        // 同步回退偏移量。少减这一行的话，用户删掉第 2 页的一条后
        // 继续下拉，会因为偏移量整体前移一格而把第 1 页的某条重复显示出来
        offset: Math.max(0, this.data.offset - 1)
      });

      if (app.globalData.userInfo) {
        app.updateUserInfo({
          projectsCount: Math.max(0, (app.globalData.userInfo.projectsCount || 0) - 1)
        });
      }

      wx.showToast({ title: '已删除', icon: 'success' });
    } catch (err) {
      console.error('删除失败：', err);
      wx.showToast({
        title: (err && err.message) || '删除失败',
        icon: 'none',
        duration: 2500
      });
    } finally {
      wx.hideLoading();
      this.setData({ deletingId: '' });
    }
  },

  goToPublish() {
    wx.switchTab({
      url: '/pages/publish/publish'
    });
  },

  onRetry() {
    this.refresh();
  }
});
