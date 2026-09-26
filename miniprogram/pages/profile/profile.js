const app = getApp();
const db = wx.cloud.database();
const track = require('../../utils/track.js');

Page({
  data: {
    userInfo: null,
    initLoading: false,
    resetLoading: false,
    unreadCount: 0,
    // 调试工具只在开发/体验版显示。
    // 此前 profile.wxml 的注释写着「仅开发环境显示」，
    // 但模板里没有任何 wx:if，正式版里任何用户都能点
    showDebug: false
  },

  onLoad() {
    this.loadUserInfo();
    this.loadUnreadCount();
  },

  onShow() {
    if (app.globalData.userInfo) {
      this.setData({ userInfo: app.globalData.userInfo });
    }
    // 每次进入都重新判断，正式版切过来时立刻收起调试入口
    this.setData({ showDebug: !app.isProduction() });
    this.loadUnreadCount();
  },

  async loadUserInfo() {
    if (!app.globalData.openid) return;

    try {
      const res = await db.collection('users')
        .where({ _openid: app.globalData.openid })
        .limit(1)
        .get();

      if (res.data.length > 0) {
        this.setData({ userInfo: res.data[0] });
        app.globalData.userInfo = res.data[0];
      }
    } catch (err) {
      console.error('加载用户信息失败：', err);
    }
  },

  async loadUnreadCount() {
    if (!app.globalData.openid) {
      return;
    }

    try {
      // 收件人过滤必须无条件生效。
      // 原实现是「先探测有没有我的通知，有才加过滤」，
      // 于是对任何一条通知都没有的新用户（也就是所有新用户），
      // 过滤条件整个失效，未读数会统计到全库所有人的头上。
      // 这是典型的 fail-open：出错时往「看得更多」的方向倒。
      const res = await db.collection('notifications').where({
        recipientId: app.globalData.openid,
        read: false
      }).count();

      this.setData({ unreadCount: res.total });

      if (res.total > 0) {
        wx.setTabBarBadge({
          index: 3,
          text: String(res.total > 99 ? '99+' : res.total)
        });
      } else {
        wx.removeTabBarBadge({ index: 3 });
      }
    } catch (err) {
      console.error('加载未读消息数失败：', err);
    }
  },

  goToNotifications() {
    wx.navigateTo({ url: '/pages/notifications/notifications' });
  },

  goToVip() {
    wx.navigateTo({ url: '/pages/vip/vip' });
  },

  goToConsulting() {
    wx.navigateTo({ url: '/pages/consulting/consulting' });
  },

  goToMyProjects() {
    wx.navigateTo({ url: '/pages/my-projects/my-projects' });
  },

  goToFavorites() {
    wx.navigateTo({ url: '/pages/favorites/favorites' });
  },

  goToStatistics() {
    wx.navigateTo({ url: '/pages/statistics/statistics' });
  },

  editProfile() {
    wx.navigateTo({ url: '/pages/edit-profile/edit-profile' });
  },

  async initTestData() {
    // 这个事件本身就是一道金丝雀：
    // 指标体系里的健康度告警「调试入口残留在正式版」，
    // 判定条件就是 debug_entry_click 有量。
    // 只要它在正式环境出现任意一条，就说明门禁失效了
    track.track('debug_entry_click', { action: 'init' });

    this.setData({ initLoading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'initTestData',
        data: { deleteOld: false }
      });

      if (res.result && res.result.success) {
        wx.showToast({
          title: res.result.message,
          icon: 'none',
          duration: 2500
        });
      } else {
        // 直接展示服务端原因。之前这里 throw 之后被 catch 吞成
        // 「初始化失败」四个字，用户看不到真正的原因
        // （比如没配 ALLOW_SEED_DATA 环境变量）
        wx.showToast({
          title: (res.result && res.result.error) || '初始化失败',
          icon: 'none',
          duration: 2500
        });
      }
    } catch (err) {
      console.error('初始化测试数据失败：', err);
      wx.showToast({ title: '网络异常，请重试', icon: 'none' });
    } finally {
      this.setData({ initLoading: false });
    }
  },

  async resetTestData() {
    track.track('debug_entry_click', { action: 'reset' });

    wx.showModal({
      title: '确认重置',
      // 措辞必须和实际行为一致。
      // 原文写的是「删除你的所有数据」，但函数只清理带 isDemo 标记的演示数据，
      // 你的真实投稿不受影响——这个区别必须说清楚
      content: '将删除全部演示数据（6 个示例项目与导师）并重新写入。'
        + '你自己发布的项目不受影响。确认继续吗？',
      success: async (res) => {
        if (!res.confirm) {
          return;
        }

        this.setData({ resetLoading: true });

        try {
          const result = await wx.cloud.callFunction({
            name: 'initTestData',
            data: { deleteOld: true }
          });

          if (result.result && result.result.success) {
            const c = result.result.count || {};
            wx.showToast({
              title: '已清理 ' + (c.projectsRemoved || 0) + ' 个演示项目',
              icon: 'none',
              duration: 2500
            });
          } else {
            wx.showToast({
              title: (result.result && result.result.error) || '重置失败',
              icon: 'none',
              duration: 2500
            });
          }
        } catch (err) {
          console.error('重置测试数据失败：', err);
          wx.showToast({ title: '网络异常，请重试', icon: 'none' });
        } finally {
          this.setData({ resetLoading: false });
        }
      }
    });
  }
});
