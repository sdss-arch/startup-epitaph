const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    advisors: [],
    myConsultList: [],
    loading: false,
    userIsVip: false
  },

  onLoad() {
    this.loadAdvisors();
    this.loadMyConsultList();
    this.checkVipStatus();
  },

  onShow() {
    this.checkVipStatus();
  },

  async checkVipStatus() {
    if (!app.globalData.openid) return;

    try {
      const userRes = await db.collection('users').where({
        _openid: app.globalData.openid
      }).get();

      if (userRes.data.length > 0) {
        this.setData({
          userIsVip: userRes.data[0].isVip || false
        });
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
        .get();

      this.setData({
        advisors: res.data || []
      });
    } catch (err) {
      console.error('加载导师失败：', err);
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

      const list = res.data.map(item => {
        const statusMap = {
          pending: '待确认',
          confirmed: '已确认',
          completed: '已完成',
          cancelled: '已取消'
        };

        let timeText = '';
        if (item.createdAt) {
          const date = new Date(item.createdAt);
          timeText = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
        }

        return {
          ...item,
          statusText: statusMap[item.status] || item.status,
          timeText: timeText
        };
      });

      this.setData({
        myConsultList: list
      });
    } catch (err) {
      console.error('加载咨询记录失败：', err);
    }
  },



  async startConsult(e) {
    if (!app.globalData.openid) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    const advisorId = e.currentTarget.dataset.id;
    const advisor = this.data.advisors.find(a => a._id === advisorId);

    if (!advisor) return;

    let price = advisor.price;
    if (this.data.userIsVip) {
      price = Math.floor(price * 0.8);
    }

    wx.showModal({
      title: '确认咨询',
      content: `将花费¥${price}进行咨询，${this.data.userIsVip ? '已享受VIP折扣' : '开通VIP可享8折优惠'}`,
      confirmText: '确认',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.createConsultation(advisor, price);
        }
      }
    });
  },

  async createConsultation(advisor, price) {
    wx.showModal({
      title: '确认预约',
      content: '本功能为演示版本，预约后将立即确认（无需真实支付），确认预约吗？',
      success: async (confirmRes) => {
        if (confirmRes.confirm) {
          wx.showLoading({ title: '预约中...' });
          try {
            const res = await wx.cloud.callFunction({
              name: 'createConsultation',
              data: {
                advisorId: advisor._id,
                advisorName: advisor.name,
                price: price
              }
            });

            if (res.result.success) {
              wx.hideLoading();
              wx.showToast({
                title: '预约成功',
                icon: 'success'
              });

              setTimeout(() => {
                this.loadMyConsultList();
              }, 1500);
            } else {
              throw new Error(res.result.error);
            }
          } catch (err) {
            wx.hideLoading();
            console.error('预约失败：', err);
            wx.showToast({
              title: '预约失败',
              icon: 'none'
            });
          }
        }
      }
    });
  }
});
