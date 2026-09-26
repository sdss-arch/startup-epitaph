const app = getApp();
const db = wx.cloud.database();
const track = require('../../utils/track.js');
const { formatDate } = require('../../utils/format.js');

/**
 * 咨询状态映射。
 *
 * pending_payment 是 createConsultation 现在真正会写下的状态——
 * 支付未接入，不能像旧代码那样直接标成 confirmed 然后告诉用户
 * 「预约成功」。虚报成功状态会让用户白等一场。
 */
const STATUS_MAP = {
  pending_payment: '待支付',
  pending: '待确认',
  confirmed: '已确认',
  completed: '已完成',
  cancelled: '已取消'
};

Page({
  data: {
    advisors: [],
    myConsultList: [],
    loading: false,
    submitting: false,
    userIsVip: false,
    // advisors 集合为空（还没建集合，或演示数据未初始化）时的空状态。
    // 之前这里没有任何提示，页面只剩一个标题，用户会以为功能坏了
    hasAdvisors: true
  },

  onLoad() {
    // 原始导师数据只存在实例上，不进 data：
    // data 里的对象会被 setData 序列化一遍再传给视图层，
    // 而且 VIP 状态异步回来时需要用原价重算展示价
    this._rawAdvisors = [];

    // 商业漏斗第一步。咨询下单转化率 = order_submit / consult_page_view
    track.track('consult_page_view', { source: 'tab' });

    this.loadAdvisors();
    this.loadMyConsultList();
  },

  onShow() {
    // 会员状态和咨询记录都要刷新：用户可能刚在 VIP 页下单，
    // 也可能刚提交完咨询又切回来。旧代码在提交后用 setTimeout(1500)
    // 猜一个刷新时机，切走得快就漏掉了
    this.checkVipStatus();
    this.loadMyConsultList();
  },

  async onPullDownRefresh() {
    // consulting.json 里开了 enablePullDownRefresh 但没有实现这个方法，
    // 下拉会转圈一直不停
    await Promise.all([
      this.loadAdvisors(),
      this.loadMyConsultList(),
      this.checkVipStatus()
    ]);
    wx.stopPullDownRefresh();
  },

  /**
   * 把原始导师数据 + 当前会员状态渲染成视图层需要的样子。
   * 展示用的价格在这里算，只是为了显示；真正的定价在
   * createConsultation 里由服务端重算，客户端传什么都会被忽略。
   */
  _renderAdvisors() {
    const isVip = this.data.userIsVip;
    const list = this._rawAdvisors.map(function (item) {
      const origin = Number(item.price) || 0;
      const displayPrice = isVip ? Math.floor(origin * 0.8) : origin;
      return {
        _id: item._id,
        name: item.name || '',
        // avatar 为空时 <image> 会渲染成裂图，改为显示姓氏首字
        avatar: item.avatar || '',
        initial: (item.name || '?').charAt(0),
        title: item.title || '',
        industry: item.industry || '',
        tags: item.tags || [],
        bio: item.bio || '',
        // 评分没有就显示 '—'，不要默认 5.0。
        // 给人一个没产生过的满分，等于伪造口碑
        ratingText: item.rating ? String(item.rating) : '—',
        consultCount: item.consultCount || 0,
        price: origin,
        displayPrice: displayPrice,
        discounted: isVip && displayPrice < origin,
        isVip: !!item.isVip
      };
    });

    this.setData({
      advisors: list,
      hasAdvisors: list.length > 0
    });
  },

  async checkVipStatus() {
    if (!app.globalData.openid) {
      this._renderAdvisors();
      return;
    }

    try {
      const userRes = await db.collection('users')
        .where({ _openid: app.globalData.openid })
        .limit(1)
        .get();

      const user = userRes.data[0];
      const isVip = !!(user && user.isVip);
      if (isVip !== this.data.userIsVip) {
        this.setData({ userIsVip: isVip });
        this._renderAdvisors();
      }
    } catch (err) {
      console.error('获取VIP状态失败：', err);
    }
  },

  async loadAdvisors() {
    this.setData({ loading: true });

    try {
      const res = await db.collection('advisors')
        .where({ status: 'active' })
        .orderBy('sort', 'asc')
        .limit(50)
        .get();

      this._rawAdvisors = res.data || [];
      this._renderAdvisors();
    } catch (err) {
      console.error('加载导师失败：', err);
      this.setData({
        advisors: [],
        hasAdvisors: false
      });
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadMyConsultList() {
    if (!app.globalData.openid) return;

    try {
      const res = await db.collection('consultations')
        .where({
          _openid: app.globalData.openid
        })
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();

      const list = res.data.map(function (item) {
        return {
          _id: item._id,
          advisorName: item.advisorName || '（导师信息已删除）',
          // 服务端返回的实际成交价，不是页面上那个估算价
          price: item.price,
          discounted: !!item.discountApplied,
          status: item.status,
          statusText: STATUS_MAP[item.status] || item.status || '未知',
          timeText: formatDate(item.createdAt)
        };
      });

      this.setData({ myConsultList: list });
    } catch (err) {
      console.error('加载咨询记录失败：', err);
    }
  },

  startConsult(e) {
    if (this.data.submitting) {
      return;
    }

    if (!app.globalData.openid) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    const advisorId = e.currentTarget.dataset.id;
    const advisor = this.data.advisors.find(function (a) {
      return a._id === advisorId;
    });

    if (!advisor) return;

    wx.showModal({
      title: '确认预约',
      content: `将提交一笔 ¥${advisor.displayPrice} 的咨询预约。`
        + (this.data.userIsVip ? '（VIP 8 折）' : '，开通 VIP 可享 8 折')
        + '\n支付功能尚未接入，不会扣款，提交后状态为「待支付」。',
      confirmText: '提交',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.createConsultation(advisor);
        }
      }
    });
  },

  async createConsultation(advisor) {
    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中...' });

    try {
      // 只传 ID。姓名和价格都从 advisors 读，
      // 传价格等于把定价权交给购买方
      const res = await wx.cloud.callFunction({
        name: 'createConsultation',
        data: { advisorId: advisor._id }
      });

      const result = res.result || {};
      if (!result.success) {
        throw new Error(result.error || '提交失败');
      }

      track.track('order_submit', {
        type: 'consultation',
        advisorId: advisor._id,
        amount: result.price,
        paid: false
      });

      wx.showToast({
        title: '已提交，等待支付接入',
        icon: 'none',
        duration: 2500
      });

      await this.loadMyConsultList();
    } catch (err) {
      console.error('预约失败：', err);
      wx.showToast({
        title: (err && err.message) || '预约失败',
        icon: 'none',
        duration: 2500
      });
    } finally {
      wx.hideLoading();
      this.setData({ submitting: false });
    }
  }
});
