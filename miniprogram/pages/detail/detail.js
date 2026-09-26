const app = getApp();
const db = wx.cloud.database();
const track = require('../../utils/track.js');
const { causeRootLabel, causeSymptomLabel } = require('../../utils/constants.js');
const { formatDate } = require('../../utils/format.js');

Page({
  data: {
    projectId: '',
    project: null,
    rootCauseLabel: '',
    symptomLabel: '',
    comments: [],
    liked: false,
    favorited: false,
    commentContent: '',
    submitting: false,
    loading: true,
    loadError: '',
    // 阅读来源。direct / from_share / 其他渠道
    entry: 'direct'
  },

  onLoad(options) {
    this.setData({ projectId: options.id });

    // 分享来源标记。指标体系里「分享带来的阅读」这一项
    // 依赖 project_view 的 entry 属性，此前分享路径没有带任何来源信息，
    // 导致这个指标在设计上就无法计算
    const scene = options.scene || options.entry || '';
    this.setData({ entry: scene });

    this.loadProject();
    this.loadComments();
    this.checkLike();
    this.checkFavorite();
  },

  async loadProject() {
    this.setData({ loading: true, loadError: '' });
    try {
      const res = await db.collection('projects').doc(this.data.projectId).get();
      const project = res.data;

      // 确保有默认值
      project.views = project.views || 0;
      project.likes = project.likes || 0;
      project.photos = project.photos || [];
      project.tags = project.tags || [];

      // code -> 中文标签在展示层翻译
      this.setData({
        project: project,
        rootCauseLabel: causeRootLabel(project.causeRoot),
        symptomLabel: causeSymptomLabel(project.causeSymptom)
      });

      // 消费侧核心事件。北极星 MVPR 就是按月统计这个事件去重后的项目数，
      // 所以它必须在「确实读到了内容」之后才上报
      track.track('project_view', {
        projectId: this.data.projectId,
        entry: this.data.entry || 'direct',
        industry: project.industry,
        causeRoot: project.causeRoot || 'none'
      });

      // 计数交给服务端。客户端 projects.doc(id).update 会被集合权限拒绝
      // （写权限是「仅创建者」，而这条记录属于别人），旧代码正是因此
      // 吞掉了错误，导致浏览量永远是 0
      try {
        const countRes = await wx.cloud.callFunction({
          name: 'recordInteraction',
          data: { action: 'view', projectId: this.data.projectId }
        });
        if (countRes.result && countRes.result.success) {
          this.setData({ 'project.views': countRes.result.views });
        }
      } catch (countErr) {
        // 计数失败不影响阅读本身
        console.log('浏览计数失败，不影响阅读');
      }

      this.setData({ loading: false });
    } catch (err) {
      console.error('加载项目失败：', err);
      // 之前这里只弹一个 toast，页面会永远停在「加载中...」，
      // 用户既看不到内容也没有重试入口
      this.setData({ loading: false, loadError: '项目不存在或已删除' });
    }
  },

  async loadComments() {
    try {
      const res = await db.collection('comments').where({
        projectId: this.data.projectId
      }).orderBy('createdAt', 'desc').get();

      const comments = res.data.map(item => {
        item.createdAtText = formatDate(item.createdAt);
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
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    const willLike = !this.data.liked;
    // 乐观更新：先动界面，再等服务端确认。
    // 交互延迟直接影响「致敬率」，让用户等网络是不划算的
    this.setData({
      liked: willLike,
      'project.likes': Math.max(0, this.data.project.likes + (willLike ? 1 : -1))
    });

    try {
      const res = await wx.cloud.callFunction({
        name: 'recordInteraction',
        data: {
          action: willLike ? 'like' : 'unlike',
          projectId: this.data.projectId
        }
      });

      if (!res.result || !res.result.success) {
        throw new Error((res.result && res.result.error) || '操作失败');
      }

      // 用服务端返回的真实计数覆盖乐观值，避免长期漂移
      this.setData({ 'project.likes': res.result.likes });

      if (willLike) {
        track.track('project_like', {
          projectId: this.data.projectId,
          causeRoot: this.data.project.causeRoot || 'none'
        });
        wx.showToast({ title: '已致敬', icon: 'success' });
      }
    } catch (err) {
      console.error('操作失败：', err);
      // 回滚
      this.setData({
        liked: !willLike,
        'project.likes': this.data.project.likes + (willLike ? -1 : 1)
      });
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  async toggleFavorite() {
    if (!app.globalData.openid) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    // 收藏只写自己创建的文档，集合权限允许客户端直接写，
    // 因此不需要走云函数
    const willFavorite = !this.data.favorited;
    this.setData({ favorited: willFavorite });

    try {
      if (willFavorite) {
        await db.collection('favorites').add({
          data: { projectId: this.data.projectId, createdAt: db.serverDate() }
        });
      } else {
        await db.collection('favorites').where({
          projectId: this.data.projectId,
          _openid: app.globalData.openid
        }).remove();
      }

      if (willFavorite) {
        track.track('project_favorite', { projectId: this.data.projectId });
        wx.showToast({ title: '已收藏', icon: 'success' });
      } else {
        wx.showToast({ title: '已取消收藏', icon: 'success' });
      }
    } catch (err) {
      console.error('收藏操作失败：', err);
      this.setData({ favorited: !willFavorite });
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  onCommentInput(e) {
    this.setData({ commentContent: e.detail.value });
  },

  async submitComment() {
    if (!app.globalData.openid) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    if (!this.data.commentContent.trim()) return;

    this.setData({ submitting: true });

    try {
      const userRes = await db.collection('users')
        .where({ _openid: app.globalData.openid })
        .limit(1).get();

      const nickname = (userRes.data[0] && userRes.data[0].nickname) || '匿名';

      await db.collection('comments').add({
        data: {
          projectId: this.data.projectId,
          content: this.data.commentContent,
          nickname,
          createdAt: db.serverDate()
        }
      });

      const content = this.data.commentContent;
      this.setData({ commentContent: '' });
      wx.showToast({ title: '发送成功', icon: 'success' });

      track.track('comment_submit', {
        projectId: this.data.projectId,
        length: content.length
      });

      this.loadComments();
    } catch (err) {
      console.error('发送失败：', err);
      wx.showToast({ title: '发送失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  onShareAppMessage() {
    // 分享动作本身上报。分享率 = share_click / project_view
    track.track('share_click', {
      projectId: this.data.projectId,
      channel: 'chat'
    });

    return {
      title: `${this.data.project.title} - 创业墓志铭`,
      path: '/pages/detail/detail?id=' + this.data.projectId
    };
  },

  onShareTimeline() {
    track.track('share_click', {
      projectId: this.data.projectId,
      channel: 'timeline'
    });

    return {
      title: `${this.data.project.title} - 创业墓志铭`,
      // 带 from 参数，让落地页能识别来源。
      // 此前分享路径不带任何来源标记，导致「分享带来的阅读」无法归因
      query: 'id=' + this.data.projectId + '&entry=from_share'
    };
  },

  previewPhoto(e) {
    const index = e.currentTarget.dataset.index;
    wx.previewImage({
      urls: this.data.project.photos,
      current: this.data.project.photos[index]
    });
  },

  onRetry() {
    this.loadProject();
  }
});
