const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    currentPlan: 'year',
    loading: false,
    userVip: null,
    faqList: [
      {
        q: 'VIP会员有什么用？',
        a: 'VIP会员可以无限制浏览全部项目，下载深度分析报告，享受咨询服务折扣等特权。',
        expanded: false
      },
      {
        q: '如何取消订阅？',
        a: '你可以在微信支付管理中随时取消自动续费，取消后会员权益在有效期内仍然有效。',
        expanded: false
      },
      {
        q: '可以退款吗？',
        a: '会员开通后7天内如未使用付费功能，可以申请全额退款，请联系客服处理。',
        expanded: false
      }
    ]
  },

  onLoad() {
    this.checkVipStatus();
  },

  async checkVipStatus() {
    if (!app.globalData.openid) return;

    try {
      const userRes = await db.collection('users').where({
        _openid: app.globalData.openid
      }).get();

      if (userRes.data.length > 0) {
        const user = userRes.data[0];
        this.setData({
          userVip: {
            isVip: user.isVip || false,
            vipExpireAt: user.vipExpireAt || null
          }
        });
      }
    } catch (err) {
      console.error('获取VIP状态失败：', err);
    }
  },

  selectPlan(e) {
    const plan = e.currentTarget.dataset.plan;
    this.setData({ currentPlan: plan });
  },

  async purchase() {
    if (this.data.loading) return;

    wx.showModal({
      title: '确认开通',
      content: '本功能为演示版本，开通后将立即激活VIP权限（无需真实支付），确认开通吗？',
      success: async (res) => {
        if (res.confirm) {
          this.setData({ loading: true });
          try {
            const res = await wx.cloud.callFunction({
              name: 'createOrder',
              data: {
                plan: this.data.currentPlan
              }
            });

            if (res.result.success) {
              wx.showToast({
                title: '开通成功',
                icon: 'success'
              });

              setTimeout(() => {
                this.checkVipStatus();
              }, 1500);
            } else {
              throw new Error(res.result.error);
            }
          } catch (err) {
            console.error('开通失败：', err);
            wx.showToast({
              title: '开通失败，请重试',
              icon: 'none'
            });
          } finally {
            this.setData({ loading: false });
          }
        }
      }
    });
  },

  toggleFaq(e) {
    const index = e.currentTarget.dataset.index;
    const key = `faqList[${index}].expanded`;
    this.setData({
      [key]: !this.data.faqList[index].expanded
    });
  }
});
