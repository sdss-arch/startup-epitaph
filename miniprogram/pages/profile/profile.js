const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    userInfo: null,
    initLoading: false,
    resetLoading: false,
    unreadCount: 0
  },

  onLoad() {
    this.loadUserInfo();
    this.loadUnreadCount();
  },

  onShow() {
    if (app.globalData.userInfo) {
      this.setData({ userInfo: app.globalData.userInfo });
    }
    this.loadUnreadCount();
  },

  async loadUserInfo() {
    if (!app.globalData.openid) return;

    try {
      const res = await db.collection('users').where({ _openid: app.globalData.openid }).get();

      if (res.data.length > 0) {
        this.setData({ userInfo: res.data[0] });
        app.globalData.userInfo = res.data[0];
      }
    } catch (err) {
      console.error('加载用户信息失败：', err);
    }
  },

  async loadUnreadCount() {
    try {
      let query = db.collection('notifications');

      // 如果有 openid，先尝试按 recipientId 查询
      if (app.globalData.openid) {
        try {
          const testRes = await db.collection('notifications')
            .where({
              recipientId: app.globalData.openid
            })
            .limit(1)
            .get();

          if (testRes.data.length > 0) {
            query = query.where({
              recipientId: app.globalData.openid
            });
          }
        } catch (e) {
          // 如果查询失败，回退到查询所有
        }
      }

      const res = await query.where({
        read: false
      }).count();

      this.setData({
        unreadCount: res.total
      });

      if (res.total > 0) {
        wx.setTabBarBadge({
          index: 3,
          text: String(res.total > 99 ? '99+' : res.total)
        });
      }
    } catch (err) {
      console.error('加载未读消息数失败：', err);
    }
  },

  goToNotifications() {
    wx.navigateTo({
      url: '/pages/notifications/notifications'
    });
  },

  goToVip() {
    wx.navigateTo({
      url: '/pages/vip/vip'
    });
  },

  goToConsulting() {
    wx.navigateTo({
      url: '/pages/consulting/consulting'
    });
  },

  goToMyProjects() {
    wx.navigateTo({
      url: '/pages/my-projects/my-projects'
    });
  },

  goToFavorites() {
    wx.navigateTo({
      url: '/pages/favorites/favorites'
    });
  },

  goToStatistics() {
    wx.navigateTo({
      url: '/pages/statistics/statistics'
    });
  },

  editProfile() {
    wx.navigateTo({
      url: '/pages/edit-profile/edit-profile'
    });
  },

  async initTestData() {
    this.setData({ initLoading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'initTestData',
        data: {
          deleteOld: false
        }
      });

      if (res.result.success) {
        wx.showToast({
          title: res.result.message,
          icon: 'success',
          duration: 2000
        });

        // 刷新用户信息
        setTimeout(() => {
          this.loadUserInfo();
        }, 1000);
      } else {
        throw new Error(res.result.error);
      }
    } catch (err) {
      console.error('初始化测试数据失败：', err);
      wx.showToast({
        title: '初始化失败',
        icon: 'none'
      });
    } finally {
      this.setData({ initLoading: false });
    }
  },

  async resetTestData() {
    wx.showModal({
      title: '确认重置',
      content: '这将删除你的所有数据并重新初始化，确认继续吗？',
      success: async (res) => {
        if (res.confirm) {
          this.setData({ resetLoading: true });

          try {
            const res = await wx.cloud.callFunction({
              name: 'initTestData',
              data: {
                deleteOld: true
              }
            });

            if (res.result.success) {
              wx.showToast({
                title: res.result.message,
                icon: 'success',
                duration: 2000
              });

              // 刷新用户信息
              setTimeout(() => {
                this.loadUserInfo();
              }, 1000);
            } else {
              throw new Error(res.result.error);
            }
          } catch (err) {
            console.error('重置测试数据失败：', err);
            wx.showToast({
              title: '重置失败',
              icon: 'none'
            });
          } finally {
            this.setData({ resetLoading: false });
          }
        }
      }
    });
  }
});
