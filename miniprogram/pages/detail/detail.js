const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    projectId: '',
    project: null,
    comments: [],
    liked: false,
    favorited: false,
    commentContent: '',
    submitting: false
  },

  onLoad(options) {
    this.setData({ projectId: options.id });
    this.loadProject();
    this.loadComments();
    this.checkLike();
    this.checkFavorite();
  },

  async loadProject() {
    try {
      const res = await db.collection('projects').doc(this.data.projectId).get();
      const project = res.data;

      // 确保有默认值
      project.views = project.views || 0;
      project.likes = project.likes || 0;
      project.photos = project.photos || [];
      project.tags = project.tags || [];

      this.setData({ project });

      // 尝试更新浏览量，但不要因为这个失败
      try {
        await db.collection('projects').doc(this.data.projectId).update({
          data: {
            views: _.inc(1)
          }
        });
      } catch (viewErr) {
        console.log('更新浏览量失败，但不影响使用');
      }
    } catch (err) {
      console.error('加载项目失败：', err);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  async loadComments() {
    try {
      let query = db.collection('comments').where({
        projectId: this.data.projectId
      });

      // 尝试排序，如果失败就不排序
      try {
        query = query.orderBy('createdAt', 'desc');
      } catch (err) {
        console.log('评论排序字段不存在');
      }

      const res = await query.get();

      const comments = res.data.map(item => {
        if (item.createdAt) {
          const date = new Date(item.createdAt);
          item.createdAtText = this.formatDate(date);
        } else {
          item.createdAtText = '很久以前';
        }
        return item;
      });

      this.setData({ comments });
    } catch (err) {
      console.error('加载评论失败：', err);
    }
  },

  async checkLike() {
    if (!app.globalData.openid) return;

    try {
      const res = await db.collection('likes')
        .where({
          projectId: this.data.projectId,
          _openid: app.globalData.openid
        })
        .get();

      this.setData({ liked: res.data.length > 0 });
    } catch (err) {
      console.error('检查点赞失败：', err);
    }
  },

  async checkFavorite() {
    if (!app.globalData.openid) return;

    try {
      const res = await db.collection('favorites')
        .where({
          projectId: this.data.projectId,
          _openid: app.globalData.openid
        })
        .get();

      this.setData({ favorited: res.data.length > 0 });
    } catch (err) {
      console.error('检查收藏失败：', err);
    }
  },

  async toggleLike() {
    if (!app.globalData.openid) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    try {
      if (this.data.liked) {
        await db.collection('likes')
          .where({
            projectId: this.data.projectId,
            _openid: app.globalData.openid
          })
          .remove();

        await db.collection('projects').doc(this.data.projectId).update({
          data: { likes: _.inc(-1) }
        });

        this.setData({
          liked: false,
          'project.likes': this.data.project.likes - 1
        });
      } else {
        await db.collection('likes').add({
          data: {
            projectId: this.data.projectId,
            createdAt: db.serverDate()
          }
        });

        await db.collection('projects').doc(this.data.projectId).update({
          data: { likes: _.inc(1) }
        });

        this.setData({
          liked: true,
          'project.likes': this.data.project.likes + 1
        });

        wx.showToast({
          title: '已致敬',
          icon: 'success'
        });
      }
    } catch (err) {
      console.error('操作失败：', err);
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      });
    }
  },

  async toggleFavorite() {
    if (!app.globalData.openid) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    try {
      if (this.data.favorited) {
        await db.collection('favorites')
          .where({
            projectId: this.data.projectId,
            _openid: app.globalData.openid
          })
          .remove();

        this.setData({ favorited: false });
        wx.showToast({
          title: '已取消收藏',
          icon: 'success'
        });
      } else {
        await db.collection('favorites').add({
          data: {
            projectId: this.data.projectId,
            createdAt: db.serverDate()
          }
        });

        this.setData({ favorited: true });
        wx.showToast({
          title: '已收藏',
          icon: 'success'
        });
      }
    } catch (err) {
      console.error('收藏操作失败：', err);
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      });
    }
  },

  onCommentInput(e) {
    this.setData({ commentContent: e.detail.value });
  },

  async submitComment() {
    if (!app.globalData.openid) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    if (!this.data.commentContent.trim()) return;

    this.setData({ submitting: true });

    try {
      const userRes = await db.collection('users')
        .where({ _openid: app.globalData.openid })
        .get();

      const nickname = userRes.data[0]?.nickname || '匿名';

      await db.collection('comments').add({
        data: {
          projectId: this.data.projectId,
          content: this.data.commentContent,
          nickname,
          createdAt: db.serverDate()
        }
      });

      this.setData({ commentContent: '' });
      wx.showToast({
        title: '发送成功',
        icon: 'success'
      });

      this.loadComments();
    } catch (err) {
      console.error('发送失败：', err);
      wx.showToast({
        title: '发送失败',
        icon: 'none'
      });
    } finally {
      this.setData({ submitting: false });
    }
  },

  onShareAppMessage() {
    return {
      title: `${this.data.project.title} - 创业墓志铭`,
      path: '/pages/detail/detail?id=' + this.data.projectId
    };
  },

  onShareTimeline() {
    return {
      title: `${this.data.project.title} - 创业墓志铭`
    };
  },

  previewPhoto(e) {
    const index = e.currentTarget.dataset.index;
    wx.previewImage({
      urls: this.data.project.photos,
      current: this.data.project.photos[index]
    });
  },

  formatDate(date) {
    if (!date || isNaN(date.getTime())) {
      return '很久以前';
    }
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}-${month}-${day}`;
  }
});
