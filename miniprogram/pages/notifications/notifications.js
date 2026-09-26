const app = getApp();
const db = wx.cloud.database();
const track = require('../../utils/track.js');

/** 通知类型 -> 图标。必须在 JS 里查好再给模板 */
const TYPE_ICONS = {
  comment: '💬',
  like: '❤️',
  favorite: '⭐',
  consultation: '🎯',
  vip: '👑',
  order: '🧾',
  system: '🔔'
};

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
    this.setData({ notifications: [], hasMore: true });
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
    if (!app.globalData.openid) {
      this.setData({ loading: false, hasMore: false });
      return;
    }

    this.setData({ loading: true });

    try {
      // 收件人过滤无条件生效。
      // 原实现是「先探测有没有我的通知，有才加过滤」，
      // 对零通知的新用户过滤整个失效，会列出全库所有人的消息
      let query = db.collection('notifications').where({
        recipientId: app.globalData.openid
      });

      if (this.data.activeTab === 'unread') {
        query = query.where({ read: false });
      }

      const res = await query
        .orderBy('createdAt', 'desc')
        .skip(this.data.notifications.length)
        .limit(this.data.pageSize)
        .get();

      // 图标与时间在 JS 里算好。
      // WXML 的数据绑定不支持调用 JS 函数，
      // 模板里写 {{getTypeIcon(item.type)}} 只会渲染成空白——
      // 此前每条通知的类型图标和时间戳都是空的
      const rows = res.data.map((item) => Object.assign({}, item, {
        icon: TYPE_ICONS[item.type] || TYPE_ICONS.system,
        timeText: this.formatTime(item.createdAt)
      }));

      this.setData({
        notifications: [...this.data.notifications, ...rows],
        hasMore: rows.length === this.data.pageSize
      });

      this.updateUnreadBadge();
    } catch (err) {
      console.error('加载通知失败：', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async openNotification(e) {
    const id = e.currentTarget.dataset.id;
    const item = e.currentTarget.dataset.item;

    track.track('notification_click', {
      type: item.type,
      wasUnread: !item.read
    });

    if (!item.read) {
      try {
        await db.collection('notifications').doc(id).update({
          data: { read: true }
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
        url: `/pages/detail/detail?id=${item.relatedId}&entry=from_notification`
      });
      return;
    }

    if (item.relatedType === 'consultation' && item.relatedId) {
      // 咨询详情页尚未实现。原先这里只弹一个「查看咨询详情」的 toast，
      // 界面上却带一个暗示可跳转的「›」，属于承诺了不存在的能力。
      // 明确告知用户暂时无法查看，比做一个假入口好
      wx.showToast({
        title: '咨询详情页尚未开放',
        icon: 'none',
        duration: 2000
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
      wx.removeTabBarBadge({ index: 3 });
    }
  },

  formatTime(dateStr) {
    if (!dateStr) {
      return '';
    }
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return '';
    }
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
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
});
