const app = getApp();
const db = wx.cloud.database();
const track = require('../../utils/track.js');
const { formatDate, formatDuration, formatAmount } = require('../../utils/format.js');

/**
 * 三个排序档位与 orderBy 字段的对应关系。
 *
 * 之前这里写的是「全部 -> orderBy('views')」，标签叫「全部」实际按浏览量排，
 * 而浏览量又因为计数 bug 长期为 0，等于首页所有内容顺序随机。
 * 现在标签与实际排序一一对应，不再有「叫一个名字做另一件事」的档位。
 */
const FILTERS = {
  all: { field: 'createdAt', order: 'desc' },
  hot: { field: 'views', order: 'desc' },
  liked: { field: 'likes', order: 'desc' }
};

Page({
  data: {
    projects: [],
    currentFilter: 'all',
    loading: false,
    hasMore: true,
    pageSize: 10,
    // 独立维护偏移量。旧代码用 this.data.projects.length 当 skip，
    // 一旦某次请求失败或少返回几条，偏移量就和真实位置错位
    offset: 0,
    loadError: ''
  },

  onLoad() {
    this.loadProjects();
  },

  onShow() {
    // 之前只在 onLoad 加载。发布完项目返回首页，列表还是发布前的样子，
    // 用户会以为发布失败了，于是重复发布
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
      this.loadProjects();
    }
  },

  /** 清空后重新拉第一页 */
  refresh() {
    this.setData({
      projects: [],
      hasMore: true,
      offset: 0,
      loadError: ''
    });
    return this.loadProjects();
  },

  setFilter(e) {
    const filter = e.currentTarget.dataset.filter;
    if (!FILTERS[filter] || filter === this.data.currentFilter) {
      return;
    }
    this.setData({ currentFilter: filter });
    this.refresh();
  },

  async loadProjects() {
    if (this.data.loading || !this.data.hasMore) {
      return;
    }

    const conf = FILTERS[this.data.currentFilter] || FILTERS.all;
    this.setData({ loading: true });

    try {
      const query = db.collection('projects');

      // 正式版过滤掉演示数据。initTestData 写入的记录带 isDemo: true，
      // 如果正式版首页混着 6 条「在线教育平台」这类假数据，
      // 真实用户投稿会显得像凑数的
      if (app.isProduction()) {
        query.where({ isDemo: db.command.neq(true) });
      }

      // 注意：orderBy 是同步的查询构建器，不会在这里抛错。
      // 旧代码在它外面套 try/catch 是死代码——字段缺失要等 .get() 才报出来，
      // 真正该兜底的是 get 之后的 catch
      query.orderBy(conf.field, conf.order);

      const offset = this.data.offset;
      const res = await query.skip(offset).limit(this.data.pageSize).get();

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
          createdAtText: formatDate(item.createdAt)
        };
      });

      this.setData({
        projects: this.data.projects.concat(projects),
        // 用实际取到的条数推进偏移量，而不是用当前数组长度
        offset: offset + res.data.length,
        // 少于一页就说明到底了。这里必须看 res.data.length，
        // 用 projects.length 会在脏数据场景下算错
        hasMore: res.data.length === this.data.pageSize
      });
    } catch (err) {
      console.error('加载项目失败：', err);
      this.setData({ loadError: '内容加载失败，请下拉重试' });
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

  onRetry() {
    this.refresh();
  },

  onShareAppMessage() {
    // 首页分享出去的落地页没有 id，走默认首页
    track.track('share_click', { channel: 'chat', from: 'index' });
    return {
      title: '创业墓志铭 —— 记录那些曾经燃烧过的梦想',
      path: '/pages/index/index'
    };
  }
});
