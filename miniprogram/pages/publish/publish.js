const app = getApp();
const track = require('../../utils/track.js');
const { CAUSE_ROOTS, CAUSE_SYMPTOMS, INDUSTRIES } = require('../../utils/constants.js');

Page({
  data: {
    // 词表来自 utils/constants.js，页面不再各自维护一份
    industries: INDUSTRIES,
    causeRoots: CAUSE_ROOTS,
    causeSymptoms: CAUSE_SYMPTOMS,
    industryIndex: 0,
    rootIndex: -1,
    symptomIndex: -1,
    formData: {
      title: '',
      industry: INDUSTRIES[0],
      causeRoot: '',
      causeSymptom: '',
      description: '',
      duration: '',
      teamSize: '',
      cost: '',
      failureReason: '',
      lessonsLearned: '',
      marketPotential: '',
      tags: [],
      photos: []
    },
    newTag: '',
    submitting: false,
    uploadingPhoto: false,
    // 用户离开页面时若还没提交，记一次放弃。
    // 供给转化率的分母就是这两个数相除
    submitted: false
  },

  onLoad() {
    if (!app.globalData.openid) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      setTimeout(() => {
        wx.switchTab({
          url: '/pages/index/index'
        });
      }, 1500);
      return;
    }

    // 进入发布页 = 漏斗第一步。用 once 保证同一次会话只记一次，
    // 否则用户切到别的 Tab 再回来会重复计数，供给转化率被稀释
    track.once('publish_start', { entry: 'tabbar' });
  },

  onUnload() {
    // 已提交的路径不算放弃
    if (this.data.submitted) {
      return;
    }
    if (this.hasAnyInput()) {
      track.track('publish_abandon', {
        filledFields: this.countFilledFields()
      });
    } else {
      // 什么都没填就退出，说明表单本身门槛太高，
      // 属于 H5「贡献门槛不可接受」的证伪信号
      track.track('publish_abandon', { filledFields: 0, reason: 'immediate_exit' });
    }
  },

  hasAnyInput() {
    return this.countFilledFields() > 0;
  },

  countFilledFields() {
    const f = this.data.formData;
    let n = 0;
    ['title', 'description', 'duration', 'teamSize', 'cost',
      'causeRoot', 'causeSymptom', 'failureReason', 'lessonsLearned'
    ].forEach((key) => {
      if (f[key] && String(f[key]).trim()) {
        n++;
      }
    });
    return n;
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`formData.${field}`]: e.detail.value
    });
  },

  onIndustryChange(e) {
    const index = e.detail.value;
    this.setData({
      industryIndex: index,
      'formData.industry': this.data.industries[index]
    });
  },

  onRootChange(e) {
    const index = e.detail.value;
    this.setData({
      rootIndex: index,
      'formData.causeRoot': this.data.causeRoots[index].code
    });
  },

  onSymptomChange(e) {
    const index = e.detail.value;
    this.setData({
      symptomIndex: index,
      'formData.causeSymptom': this.data.causeSymptoms[index].code
    });
  },

  onTagInput(e) {
    this.setData({ newTag: e.detail.value });
  },

  addTag() {
    const tag = this.data.newTag.trim();
    if (tag && !this.data.formData.tags.includes(tag)) {
      this.setData({
        'formData.tags': [...this.data.formData.tags, tag],
        newTag: ''
      });
    }
  },

  removeTag(e) {
    const index = e.currentTarget.dataset.index;
    const tags = [...this.data.formData.tags];
    tags.splice(index, 1);
    this.setData({
      'formData.tags': tags
    });
  },

  choosePhoto() {
    const that = this;
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      maxDuration: 30,
      camera: 'back',
      success(res) {
        const tempFilePaths = res.tempFiles.map(item => item.tempFilePath);
        that.uploadPhotos(tempFilePaths);
      }
    });
  },

  async uploadPhotos(tempFilePaths) {
    this.setData({ uploadingPhoto: true });

    const uploadPromises = tempFilePaths.map((filePath, index) => {
      const cloudPath = `project-photos/${app.globalData.openid}/${Date.now()}-${index}.png`;

      return wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath,
      });
    });

    try {
      const uploadResults = await Promise.all(uploadPromises);
      const fileIDs = uploadResults.map(result => result.fileID);

      this.setData({
        'formData.photos': [...this.data.formData.photos, ...fileIDs]
      });

      wx.showToast({
        title: '照片上传成功',
        icon: 'success'
      });
    } catch (err) {
      console.error('照片上传失败：', err);
      wx.showToast({
        title: '照片上传失败',
        icon: 'none'
      });
    } finally {
      this.setData({ uploadingPhoto: false });
    }
  },

  previewPhoto(e) {
    const index = e.currentTarget.dataset.index;
    wx.previewImage({
      urls: this.data.formData.photos,
      current: this.data.formData.photos[index]
    });
  },

  removePhoto(e) {
    const index = e.currentTarget.dataset.index;
    const photos = [...this.data.formData.photos];
    photos.splice(index, 1);
    this.setData({
      'formData.photos': photos
    });
  },

  validateForm() {
    const f = this.data.formData;
    // 根因与死因是必填。
    // 这不是形式主义：北极星 MVPR 的质量门槛就是「根因非空」，
    // 根因选填等于让北极星算不出来。
    // 这也是本项目最核心的取舍——见 docs/product/用户旅程.md 的 H5 假设。
    const rules = [
      ['title', '请输入项目名称'],
      ['description', '请输入项目简介'],
      ['causeRoot', '请选择失败的根本原因'],
      ['causeSymptom', '请选择最终的死因'],
      ['failureReason', '请描述失败的具体过程'],
      ['lessonsLearned', '请写下经验教训']
    ];

    for (let i = 0; i < rules.length; i++) {
      const value = f[rules[i][0]];
      if (!value || !String(value).trim()) {
        wx.showToast({ title: rules[i][1], icon: 'none' });
        return false;
      }
    }

    if (!f.duration || isNaN(f.duration) || Number(f.duration) <= 0) {
      wx.showToast({ title: '请输入有效的持续时间（月）', icon: 'none' });
      return false;
    }
    if (!f.teamSize || isNaN(f.teamSize) || Number(f.teamSize) <= 0) {
      wx.showToast({ title: '请输入有效的团队规模（人）', icon: 'none' });
      return false;
    }
    if (f.cost === '' || f.cost === undefined || isNaN(f.cost) || Number(f.cost) < 0) {
      wx.showToast({ title: '请输入有效的投入金额（元）', icon: 'none' });
      return false;
    }

    return true;
  },

  async submit() {
    if (!this.validateForm()) {
      // 校验失败也是漏斗流失，记下来才知道卡在哪一项
      track.track('publish_error', { stage: 'validation', filled: this.countFilledFields() });
      return;
    }

    this.setData({ submitting: true });

    try {
      const projectData = Object.assign({}, this.data.formData, {
        duration: parseInt(this.data.formData.duration, 10),
        teamSize: parseInt(this.data.formData.teamSize, 10),
        cost: parseInt(this.data.formData.cost, 10)
      });

      const res = await wx.cloud.callFunction({
        name: 'publishProject',
        data: { projectData }
      });

      if (res.result && res.result.success) {
        this.setData({ submitted: true });

        // 内容结构完整率 = 三段式齐全。
        // marketPotential 是可选的，所以它单独作为属性上报，
        // 不影响 success 本身
        track.track('publish_success', {
          industry: this.data.formData.industry,
          causeRoot: this.data.formData.causeRoot,
          causeSymptom: this.data.formData.causeSymptom,
          hasMarketPotential: !!this.data.formData.marketPotential.trim(),
          photoCount: this.data.formData.photos.length,
          filledFields: this.countFilledFields()
        });

        wx.showToast({
          title: '发布成功',
          icon: 'success'
        });

        setTimeout(() => {
          wx.switchTab({
            url: '/pages/index/index'
          });
        }, 1500);
        return;
      }

      // 服务端返回了具体原因，直接展示。
      // 此前这里 throw 出去再被 catch 吞成「发布失败」四个字，
      // 用户不知道到底哪里填错了
      const msg = (res.result && res.result.error) || '发布失败';
      track.track('publish_error', { stage: 'server', reason: msg });
      wx.showToast({ title: msg, icon: 'none' });
    } catch (err) {
      console.error('发布失败：', err);
      track.track('publish_error', { stage: 'network' });
      wx.showToast({
        title: '网络异常，请重试',
        icon: 'none'
      });
    } finally {
      this.setData({ submitting: false });
    }
  }
});
