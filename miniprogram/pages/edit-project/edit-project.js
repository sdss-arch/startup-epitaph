const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    projectId: '',
    industries: [
      '互联网', '电商', '教育', '医疗健康', '金融',
      '社交', '游戏', '本地生活', '企业服务', '人工智能',
      '区块链', '物联网', '新能源', '新零售', '其他'
    ],
    industryIndex: 0,
    formData: {
      title: '',
      industry: '互联网',
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
    loading: true,
    uploadingPhoto: false
  },

  onLoad(options) {
    this.setData({ projectId: options.id });
    this.loadProject();
  },

  async loadProject() {
    try {
      const res = await db.collection('projects').doc(this.data.projectId).get();
      const project = res.data;

      const industryIndex = this.data.industries.indexOf(project.industry);

      this.setData({
        formData: {
          title: project.title,
          industry: project.industry,
          description: project.description,
          duration: String(project.duration),
          teamSize: String(project.teamSize),
          cost: String(project.cost),
          failureReason: project.failureReason,
          lessonsLearned: project.lessonsLearned,
          marketPotential: project.marketPotential || '',
          tags: project.tags || [],
          photos: project.photos || []
        },
        industryIndex: industryIndex >= 0 ? industryIndex : 0
      });
    } catch (err) {
      console.error('加载项目失败：', err);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
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
    const { title, industry, description, duration, teamSize, cost, failureReason, lessonsLearned } = this.data.formData;

    if (!title.trim()) {
      wx.showToast({ title: '请输入项目名称', icon: 'none' });
      return false;
    }
    if (!description.trim()) {
      wx.showToast({ title: '请输入项目简介', icon: 'none' });
      return false;
    }
    if (!duration || isNaN(duration) || duration <= 0) {
      wx.showToast({ title: '请输入有效的持续时间', icon: 'none' });
      return false;
    }
    if (!teamSize || isNaN(teamSize) || teamSize <= 0) {
      wx.showToast({ title: '请输入有效的团队规模', icon: 'none' });
      return false;
    }
    if (!cost || isNaN(cost) || cost < 0) {
      wx.showToast({ title: '请输入有效的投入金额', icon: 'none' });
      return false;
    }
    if (!failureReason.trim()) {
      wx.showToast({ title: '请输入失败原因分析', icon: 'none' });
      return false;
    }
    if (!lessonsLearned.trim()) {
      wx.showToast({ title: '请输入经验教训', icon: 'none' });
      return false;
    }

    return true;
  },

  async submit() {
    if (!this.validateForm()) return;

    this.setData({ submitting: true });

    try {
      const projectData = {
        ...this.data.formData,
        duration: parseInt(this.data.formData.duration),
        teamSize: parseInt(this.data.formData.teamSize),
        cost: parseInt(this.data.formData.cost)
      };

      const res = await wx.cloud.callFunction({
        name: 'updateProject',
        data: {
          projectId: this.data.projectId,
          projectData: projectData
        }
      });

      if (res.result.success) {
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        });

        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        throw new Error(res.result.error);
      }
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
