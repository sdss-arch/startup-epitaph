App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'cloud1-1go1y6jsc1082bd7',
        traceUser: true
      });
    }
    this.checkLogin();
  },

  globalData: {
    userInfo: null,
    openid: null,
    appInitialized: false
  },

  async checkLogin() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'login',
        data: {}
      });

      console.log('[云函数] [login] 调用成功：', res);
      this.globalData.openid = res.result.openid;
      await this.getUserInfo();
    } catch (err) {
      console.error('[云函数] [login] 调用失败：', err);
    } finally {
      this.globalData.appInitialized = true;
    }
  },

  async getUserInfo() {
    if (!this.globalData.openid) return;

    try {
      const db = wx.cloud.database();
      const res = await db.collection('users').where({
        _openid: this.globalData.openid
      }).get();

      if (res.data.length > 0) {
        this.globalData.userInfo = res.data[0];
      } else {
        // 如果用户不存在，创建一个默认用户
        await db.collection('users').add({
          data: {
            projectsCount: 0,
            isVip: false,
            createdAt: db.serverDate(),
            updatedAt: db.serverDate()
          }
        });
        // 重新获取用户信息
        const newUserRes = await db.collection('users').where({
          _openid: this.globalData.openid
        }).get();
        if (newUserRes.data.length > 0) {
          this.globalData.userInfo = newUserRes.data[0];
        }
      }
    } catch (err) {
      console.error('获取用户信息失败：', err);
    }
  },

  updateUserInfo(info) {
    this.globalData.userInfo = {
      ...this.globalData.userInfo,
      ...info
    };
  }
});
