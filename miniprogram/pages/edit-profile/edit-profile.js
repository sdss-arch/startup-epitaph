const app = getApp();

Page({
  data: {
    userInfo: null,
    nickname: '',
    bio: '',
    avatarUrl: '',
    submitting: false
  },

  onLoad() {
    this.loadUserInfo();
  },

  loadUserInfo() {
    if (app.globalData.userInfo) {
      this.setData({
        userInfo: app.globalData.userInfo,
        nickname: app.globalData.userInfo.nickname || '',
        bio: app.globalData.userInfo.bio || '',
        avatarUrl: app.globalData.userInfo.avatarUrl || ''
      });
    }
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value });
  },

  onBioInput(e) {
    this.setData({ bio: e.detail.value });
  },

  chooseAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        this.uploadAvatar(tempFilePath);
      }
    });
  },

  uploadAvatar(filePath) {
    wx.showLoading({ title: '上传中...' });

    const cloudPath = `avatars/${app.globalData.openid}_${Date.now()}.png`;

    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath,
      success: (res) => {
        this.setData({
          avatarUrl: res.fileID
        });
        wx.hideLoading();
      },
      fail: (err) => {
        console.error('上传失败：', err);
        wx.hideLoading();
        wx.showToast({
          title: '上传失败',
          icon: 'none'
        });
      }
    });
  },

  validateForm() {
    if (!this.data.nickname.trim()) {
      wx.showToast({
        title: '请输入昵称',
        icon: 'none'
      });
      return false;
    }
    return true;
  },

  async submit() {
    if (!this.validateForm()) return;

    this.setData({ submitting: true });

    try {
      // 走云函数而不是客户端直写。
      // users 集合对客户端开放写权限，页面里只传 3 个字段并不能阻止
      // 别人从调试器直接改自己的 isVip —— 那是会员 8 折的唯一判据。
      // 详见 cloudfunctions/updateProfile/index.js 的说明
      const res = await wx.cloud.callFunction({
        name: 'updateProfile',
        data: {
          profile: {
            nickname: this.data.nickname,
            bio: this.data.bio,
            avatarUrl: this.data.avatarUrl
          }
        }
      });

      if (!res.result || !res.result.success) {
        // 展示服务端给的具体原因，而不是统一一句「保存失败」
        wx.showToast({
          title: (res.result && res.result.error) || '保存失败',
          icon: 'none'
        });
        return;
      }

      app.updateUserInfo(res.result.profile);

      wx.showToast({
        title: '保存成功',
        icon: 'success'
      });

      setTimeout(() => {
        wx.navigateBack();
      }, 1200);
    } catch (err) {
      console.error('保存失败：', err);
      wx.showToast({
        title: '网络异常，请重试',
        icon: 'none'
      });
    } finally {
      this.setData({ submitting: false });
    }
  }
});
