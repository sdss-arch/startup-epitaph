const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    keyword: '',
    selectedTag: '',
    filterTags: ['互联网', '电商', '教育', '医疗健康', '金融', '社交', '游戏'],
    results: [],
    searched: false
  },

  onInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  selectTag(e) {
    const tag = e.currentTarget.dataset.tag;
    this.setData({
      selectedTag: this.data.selectedTag === tag ? '' : tag
    });
    if (this.data.keyword || this.data.selectedTag) {
      this.search();
    }
  },

  async search() {
    if (!this.data.keyword && !this.data.selectedTag) return;

    this.setData({ searched: true, loading: true });

    try {
      let query = db.collection('projects');
      const conditions = [];

      if (this.data.keyword) {
        conditions.push({
          title: db.RegExp({
            regexp: this.data.keyword,
            options: 'i'
          })
        });
      }

      if (this.data.selectedTag) {
        conditions.push({
          industry: this.data.selectedTag
        });
      }

      if (conditions.length > 0) {
        query = query.where(_.and(conditions));
      }

      // 尝试排序，如果失败就不排序
      try {
        query = query.orderBy('views', 'desc');
      } catch (err) {
        console.log('排序字段不存在，使用默认顺序');
      }

      const res = await query.limit(50).get();

      // 处理结果数据
      const results = res.data.map(item => {
        item.views = item.views || 0;
        item.likes = item.likes || 0;
        item.photos = item.photos || [];
        return item;
      });

      this.setData({ results });
    } catch (err) {
      console.error('搜索失败：', err);
      wx.showToast({
        title: '搜索失败',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}`
    });
  }
});
