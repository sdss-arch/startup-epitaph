const app = getApp();
const db = wx.cloud.database();
const track = require('../../utils/track.js');

Page({
  data: {
    currentPlan: 'year',
    loading: false,
    userVip: null,
    faqList: [
      {
        q: 'VIP 现在到底能用什么？',
        a: '目前只有两项：咨询服务 8 折，以及个人主页的 VIP 标识。'
          + '浏览、立碑、搜索、查看根因分布都免费且不限次数。',
        expanded: false
      },
      {
        q: '为什么不能直接开通？',
        a: '微信支付还没接。现阶段点击只会生成一笔待支付订单，不会扣款，'
          + '也不会开通会员。接入支付回调之后才会真正发放权益。',
        expanded: false
      },
      {
        q: '会员到期后怎么办？',
        a: '到期后咨询恢复全价，已发布的项目与浏览、收藏、致敬记录不受影响。'
          + '所有核心能力本来就不收费，所以到期不会失去任何东西。',
        expanded: false
      }
    ]
  },

  onLoad() {
    // 商业漏斗的第一步
    track.track('vip_page_view', { entry: this.data.currentPlan });
    this.checkVipStatus();
  },

  async checkVipStatus() {
    if (!app.globalData.openid) return;

    try {
      const userRes = await db.collection('users')
        .where({ _openid: app.globalData.openid })
        .limit(1)
        .get();

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
    this.setData({ currentPlan: e.currentTarget.dataset.plan });
  },

  purchase() {
    if (this.data.loading) {
      return;
    }

    const planName = this.data.currentPlan === 'year' ? '年度会员 ¥199' : '月度会员 ¥19';

    wx.showModal({
      title: '确认创建订单',
      content: '将创建一笔' + planName + '的待支付订单。'
        + '支付功能尚未接入，不会扣款，也不会开通会员。',
      success: async (res) => {
        if (!res.confirm) {
          return;
        }

        this.setData({ loading: true });
        try {
          const result = await wx.cloud.callFunction({
            name: 'createOrder',
            data: { plan: this.data.currentPlan }
          });

          if (result.result && result.result.success) {
            // 记录下单意向。VIP 转化率 = vip_order_submit / vip_page_view，
            // 但支付未接入，所以这个数只能看作「购买意愿」而非「转化」
            track.track('vip_order_submit', {
              plan: this.data.currentPlan,
              amount: result.result.amount,
              // 明确标记未支付，避免日后把两者混在一个漏斗里算
              paid: false
            });

            wx.showToast({
              title: '订单已创建，未支付',
              icon: 'none',
              duration: 2500
            });
          } else {
            wx.showToast({
              title: (result.result && result.result.error) || '下单失败',
              icon: 'none',
              duration: 2500
            });
          }
        } catch (err) {
          console.error('下单失败：', err);
          wx.showToast({ title: '网络异常，请重试', icon: 'none' });
        } finally {
          this.setData({ loading: false });
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
