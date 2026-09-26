const app = getApp();
const db = wx.cloud.database();

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
      await db.collection('users').where({
        _openid: app.globalData.openid
      }).update({
        data: {
          nickname: this.data.nickname.trim(),
          bio: this.data.bio.trim(),
          avatarUrl: this.data.avatarUrl,
          updatedAt: db.serverDate()
        }
      });

      app.updateUserInfo({
        nickname: this.data.nickname.trim(),
        bio: this.data.bio.trim(),
        avatarUrl: this.data.avatarUrl
      });

      wx.showToast({
        title: '保存成功',
        icon: 'success'
      });

      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } catch (err) {
      console.error('保存失败：', err);
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      });
    } finally {
      this.setData({ submitting: false });
    }
  }
});
