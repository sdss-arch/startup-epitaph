const app = getApp();
const db = wx.cloud.database();
const { CAUSE_ROOTS, CAUSE_SYMPTOMS, INDUSTRIES } = require('../../utils/constants.js');

/**
 * 编辑页。
 *
 * 埋点说明：本页刻意不上报事件。
 * 19 个事件是为「获客—消费—供给—商业化」漏斗设计的，
 * 而「编辑」属于存量内容维护，不在任何一条漏斗上。
 * 与其硬塞进 publish_success（会污染供给转化率），
 * 不如等真的要用「编辑率 / 补全率」这个指标时，
 * 再往 utils/constants.js 里正式登记一个事件。
 */
Page({
  data: {
    projectId: '',
    // 词表与发布页共用一份，避免「发布页能选、编辑页显示不出」
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
    loading: true,
    loadError: '',
    uploadingPhoto: false
  },

  onLoad(options) {
    this.setData({ projectId: options.id });
    this.loadProject();
  },

  async loadProject() {
    this.setData({ loading: true, loadError: '' });
    try {
      const res = await db.collection('projects').doc(this.data.projectId).get();
      const project = res.data || {};

      const industryIndex = INDUSTRIES.indexOf(project.industry);
      const rootIndex = this.data.causeRoots.findIndex(function (r) {
        return r.code === project.causeRoot;
      });
      const symptomIndex = this.data.causeSymptoms.findIndex(function (s) {
        return s.code === project.causeSymptom;
      });

      this.setData({
        formData: {
          title: project.title || '',
          industry: project.industry || INDUSTRIES[0],
          // 旧数据没有这两个字段（根因两层是后加的），
          // 这里显式补成空串而不是 undefined，
          // 否则 picker 拿到的 value 会是 undefined 而显示第一项
          causeRoot: project.causeRoot || '',
          causeSymptom: project.causeSymptom || '',
          description: project.description || '',
          // String(undefined) 会得到字符串 "undefined"，
          // 直接进 input 框用户会看到一个莫名其妙的值
          duration: project.duration == null ? '' : String(project.duration),
          teamSize: project.teamSize == null ? '' : String(project.teamSize),
          cost: project.cost == null ? '' : String(project.cost),
          failureReason: project.failureReason || '',
          lessonsLearned: project.lessonsLearned || '',
          marketPotential: project.marketPotential || '',
          tags: project.tags || [],
          photos: project.photos || []
        },
        industryIndex: industryIndex >= 0 ? industryIndex : 0,
        // -1 表示「这项还没填」，picker 会显示占位提示而不是默认第一项
        rootIndex: rootIndex,
        symptomIndex: symptomIndex
      });
    } catch (err) {
      console.error('加载项目失败：', err);
      this.setData({ loadError: '项目加载失败，可能已被删除' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onRetry() {
    this.loadProject();
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
        const tempFilePaths = res.tempFiles.map(function (item) {
          return item.tempFilePath;
        });
        that.uploadPhotos(tempFilePaths);
      }
    });
  },

  async uploadPhotos(tempFilePaths) {
    this.setData({ uploadingPhoto: true });

    const uploadPromises = tempFilePaths.map(function (filePath, index) {
      const cloudPath = 'project-photos/' + app.globalData.openid + '/' + Date.now() + '-' + index + '.png';
      return wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath
      });
    });

    try {
      const uploadResults = await Promise.all(uploadPromises);
      const fileIDs = uploadResults.map(function (result) {
        return result.fileID;
      });

      this.setData({
        'formData.photos': this.data.formData.photos.concat(fileIDs)
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
    const photos = this.data.formData.photos.slice();
    photos.splice(index, 1);
    this.setData({
      'formData.photos': photos
    });
  },

  validateForm() {
    const f = this.data.formData;
    const rules = [
      ['title', '请输入项目名称'],
      ['description', '请输入项目简介'],
      ['causeRoot', '请选择失败的根本原因'],
      ['causeSymptom', '请选择最终的死因'],
      ['failureReason', '请输入失败原因分析'],
      ['lessonsLearned', '请输入经验教训']
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
    if (!this.validateForm()) return;
    if (this.data.submitting) return;

    this.setData({ submitting: true });

    try {
      const projectData = Object.assign({}, this.data.formData, {
        duration: parseInt(this.data.formData.duration, 10),
        teamSize: parseInt(this.data.formData.teamSize, 10),
        cost: parseInt(this.data.formData.cost, 10)
      });

      // 服务端 schema.js 会再校验一遍并只取白名单字段，
      // 所以这里即使被篡改也写不进 _openid / views / likes
      const res = await wx.cloud.callFunction({
        name: 'updateProject',
        data: {
          projectId: this.data.projectId,
          projectData: projectData
        }
      });

      if (res.result && res.result.success) {
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        });

        setTimeout(function () {
          wx.navigateBack();
        }, 800);
        return;
      }

      // 展示服务端给的具体原因，而不是笼统的「保存失败」
      wx.showToast({
        title: (res.result && res.result.error) || '保存失败',
        icon: 'none',
        duration: 2500
      });
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
