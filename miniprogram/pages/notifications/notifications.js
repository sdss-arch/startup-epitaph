const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    activeTab: 'all',
    notifications: [],
    loading: false,
    hasMore: true,
    pageSize: 20
  },

  onLoad() {
    this.loadNotifications();
  },

  onPullDownRefresh() {
    this.setData({
      notifications: [],
      hasMore: true
    });
    this.loadNotifications().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadNotifications();
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({
      activeTab: tab,
      notifications: [],
      hasMore: true
    });
    this.loadNotifications();
  },

  async loadNotifications() {
    if (this.data.loading || !this.data.hasMore) return;

    this.setData({ loading: true });

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

      if (this.data.activeTab === 'unread') {
        query = query.where({
          read: false
        });
      }

      const res = await query
        .orderBy('createdAt', 'desc')
        .skip(this.data.notifications.length)
        .limit(this.data.pageSize)
        .get();

      this.setData({
        notifications: [...this.data.notifications, ...res.data],
        hasMore: res.data.length === this.data.pageSize
      });

      this.updateUnreadBadge();
    } catch (err) {
      console.error('加载通知失败：', err);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  async openNotification(e) {
    const id = e.currentTarget.dataset.id;
    const item = e.currentTarget.dataset.item;

    if (!item.read) {
      try {
        await db.collection('notifications').doc(id).update({
          data: {
            read: true
          }
        });

        const notifications = this.data.notifications.map(n => {
          if (n._id === id) {
            return { ...n, read: true };
          }
          return n;
        });

        this.setData({ notifications });
        this.updateUnreadBadge();
      } catch (err) {
        console.error('标记已读失败：', err);
      }
    }

    if (item.relatedType === 'project' && item.relatedId) {
      wx.navigateTo({
        url: `/pages/detail/detail?id=${item.relatedId}`
      });
    } else if (item.relatedType === 'consultation' && item.relatedId) {
      wx.showToast({
        title: '查看咨询详情',
        icon: 'none'
      });
    }
  },

  updateUnreadBadge() {
    const unreadCount = this.data.notifications.filter(n => !n.read).length;
    if (unreadCount > 0) {
      wx.setTabBarBadge({
        index: 3,
        text: String(unreadCount > 99 ? '99+' : unreadCount)
      });
    } else {
      wx.removeTabBarBadge({
        index: 3
      });
    }
  },

  getTypeIcon(type) {
    const iconMap = {
      'comment': '💬',
      'like': '❤️',
      'favorite': '⭐',
      'consultation': '🎯',
      'vip': '👑',
      'system': '🔔'
    };
    return iconMap[type] || '🔔';
  },

  formatTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) {
      return '刚刚';
    } else if (diff < 3600000) {
      return Math.floor(diff / 60000) + '分钟前';
    } else if (diff < 86400000) {
      return Math.floor(diff / 3600000) + '小时前';
    } else if (diff < 604800000) {
      return Math.floor(diff / 86400000) + '天前';
    } else {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }
});
