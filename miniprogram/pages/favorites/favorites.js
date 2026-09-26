const app = getApp();
const db = wx.cloud.database();
const _ = db.command;
const { formatDate, formatDuration, formatAmount } = require('../../utils/format.js');

Page({
  data: {
    projects: [],
    loading: false,
    hasMore: true,
    pageSize: 10,
    offset: 0,
    loadError: '',
    notLoggedIn: false
  },

  onLoad() {
    this.loadFavorites();
  },

  onShow() {
    // 必须在 onShow 重新拉取而不是只在 onLoad：
    // 用户在详情页点「取消收藏」再返回，收藏夹里那条必须消失。
    // 旧代码没有 onShow，列表会一直留着已取消收藏的条目
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
      this.loadFavorites();
    }
  },

  refresh() {
    this.setData({
      projects: [],
      hasMore: true,
      offset: 0,
      loadError: ''
    });
    return this.loadFavorites();
  },

  async loadFavorites() {
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
      // orderBy 是同步构建器，不会抛错，外层不需要 try/catch
      const favoritesRes = await db.collection('favorites')
        .where({ _openid: app.globalData.openid })
        .orderBy('createdAt', 'desc')
        .skip(offset)
        .limit(this.data.pageSize)
        .get();

      if (favoritesRes.data.length === 0) {
        this.setData({ hasMore: false });
        return;
      }

      const projectIds = favoritesRes.data.map(function (item) {
        return item.projectId;
      });

      const projectsRes = await db.collection('projects')
        .where({ _id: _.in(projectIds) })
        .get();

      // 按收藏时间顺序还原。_.in 查询本身不保证顺序，
      // 直接用 projectsRes.data 会让收藏顺序变得随机
      const sortedProjects = projectIds
        .map(function (id) {
          return projectsRes.data.find(function (p) {
            return p._id === id;
          });
        })
        .filter(Boolean)
        .map(function (item) {
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
            createdAtText: formatDate(item.createdAt)
          };
        });

      this.setData({
        projects: this.data.projects.concat(sortedProjects),
        offset: offset + favoritesRes.data.length,
        hasMore: favoritesRes.data.length === this.data.pageSize
      });
    } catch (err) {
      console.error('加载收藏失败：', err);
      this.setData({ loadError: '收藏加载失败，请下拉重试' });
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

  goToSearch() {
    wx.switchTab({ url: '/pages/search/search' });
  },

  onRetry() {
    this.refresh();
  }
});
