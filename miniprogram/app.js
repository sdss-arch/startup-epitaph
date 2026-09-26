const track = require('./utils/track.js');

App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
      return;
    }

    wx.cloud.init({
      // 占位符：部署前必须换成你自己的云开发环境 ID，见 docs/部署指南.md 第三节
      env: 'cloud1-xxxxxxxx',
      traceUser: true
    });

    // 北极星 MVPR 的分母来源之一，也是次月留存率的唯一事件源
    track.track('app_launch', {
      // 冷启动还是热启动，用来判断「重新打开」和「切回前台」要不要计入活跃
      launchMode: this.getLaunchMode()
    });

    this.checkLogin();
  },

  onHide() {
    // 切后台时强制上报，否则用户被杀进程会丢掉这一批事件
    track.flush();
  },

  globalData: {
    userInfo: null,
    openid: null,
    appInitialized: false,
    /**
     * 运行环境标记。
     * 调试入口（初始化测试数据）必须靠它隔离——小程序没有编译期宏区分
     * 体验版和正式版，只能在运行时判断，否则任何人打开正式版都能写入演示数据。
     * 上线前把这个值改成 'production'，或改为读环境变量注入。
     */
    env: 'development'
  },

  /** 当前是小程序开发工具、体验版还是正式版 */
  getEnvVersion() {
    try {
      return wx.getAccountInfoSync().miniProgram.envVersion; // develop / trial / release
    } catch (err) {
      return 'develop';
    }
  },

  /** 正式版才认为不可信；开发与体验版保留调试工具方便自测 */
  isProduction() {
    return this.globalData.env === 'production' || this.getEnvVersion() === 'release';
  },

  getLaunchMode() {
    // 2.10.0 起支持 onLaunch 的 launchScene，旧基础库退回 'unknown'
    try {
      return (wx.getLaunchOptionsSync && wx.getLaunchOptionsSync().scene) || 'unknown';
    } catch (err) {
      return 'unknown';
    }
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
        return;
      }

      // 这里曾经有一段「客户端兜底建号」：查不到就自己 add 一条。
      // 它有两个问题，第二个是安全问题：
      //   1. 建号路径有两条，字段一旦不同步就会出现脏数据
      //      （有的用户有 nickname、有的没有）
      //   2. 只要客户端还需要往 users 里 add，users 就必须配成
      //      「仅创建者可写」；而那个权限等于允许任何人执行
      //      db.collection('users').doc(自己).update({ isVip: true })
      //      ——updateProfile 的字段白名单拦不住绕过它直接调数据库的写法。
      //
      // 所以这里不兜底。建号只有 login 云函数一条路径，
      // 代价是 users 集合可以彻底锁成客户端不可写。
      // 查不到说明 login 建号失败，属于异常，该暴露而不是被掩盖。
      console.error(
        '[云函数] [login] 已返回 openid，但 users 里查不到对应记录。' +
        '建号只应由 login 云函数完成，请检查该函数是否部署成功。'
      );
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
