const db = wx.cloud.database();
const _ = db.command;
const track = require('../../utils/track.js');
const { INDUSTRIES, CAUSE_ROOTS, causeRootLabel } = require('../../utils/constants.js');

/** 搜索结果上限。超过这个量级应该改走云函数分页 */
const MAX_RESULTS = 50;

Page({
  data: {
    keyword: '',
    selectedIndustry: '',
    selectedRoot: '',
    // 行业列表复用发布页的同一份词表。
    // 此前这里硬编码了 7 个行业，而发布页有 15 个，
    // 意味着「企业服务/人工智能/区块链/物联网/新能源/新零售」等
    // 8 个分类投完之后在搜索里永远筛不出来
    industries: INDUSTRIES,
    // 根因筛选是根因两层结构带来的直接能力：
    // 「我想看所有因为没有市场需求而死的项目」
    rootCauses: CAUSE_ROOTS.map((item) => ({
      code: item.code,
      label: item.label
    })),
    results: [],
    searched: false,
    loading: false,
    lastResultCount: 0
  },

  onLoad() {
    // 搜索页是 tab 页，重复进入时清空上一次的结果，
    // 否则用户会看到上次的搜索结果以为没生效
    this.setData({
      keyword: '',
      selectedIndustry: '',
      selectedRoot: '',
      results: [],
      searched: false,
      lastResultCount: 0
    });
  },

  onInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onClearInput() {
    this.setData({
      keyword: '',
      results: [],
      searched: false,
      lastResultCount: 0
    });
  },

  selectIndustry(e) {
    const code = e.currentTarget.dataset.code;
    const next = this.data.selectedIndustry === code ? '' : code;
    this.setData({ selectedIndustry: next });
    track.track('root_cause_filter', {
      dimension: 'industry',
      value: next || 'all'
    });
    if (this.hasQuery()) {
      this.search();
    }
  },

  selectRoot(e) {
    const code = e.currentTarget.dataset.code;
    const next = this.data.selectedRoot === code ? '' : code;
    this.setData({ selectedRoot: next });
    // 根因是本项目的核心检索维度，单独记一个事件。
    // 「有多少人真的在按根因检索」直接决定这个结构化设计值不值
    track.track('root_cause_filter', {
      dimension: 'cause_root',
      value: next || 'all'
    });
    if (this.hasQuery()) {
      this.search();
    }
  },

  hasQuery() {
    return !!(this.data.keyword || this.data.selectedIndustry || this.data.selectedRoot);
  },

  /** 转义正则元字符。用户输入 `(` 会让 db.RegExp 直接抛错，页面搜索按钮会失灵 */
  escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  async search() {
    if (!this.hasQuery()) {
      return;
    }

    const keyword = this.data.keyword.trim();
    const industry = this.data.selectedIndustry;
    const root = this.data.selectedRoot;
    const startedAt = Date.now();

    this.setData({ searched: true, loading: true });

    try {
      let query = db.collection('projects');
      const conditions = [];

      if (keyword) {
        conditions.push({
          title: db.RegExp({
            regexp: this.escapeRegExp(keyword),
            options: 'i'
          })
        });
      }

      if (industry) {
        conditions.push({ industry: industry });
      }

      if (root) {
        conditions.push({ causeRoot: root });
      }

      if (conditions.length > 0) {
        query = query.where(_.and(conditions));
      }

      query = query.orderBy('views', 'desc');

      const res = await query.limit(MAX_RESULTS).get();

      const results = res.data.map(item => {
        item.views = item.views || 0;
        item.likes = item.likes || 0;
        item.photos = item.photos || [];
        item.rootCauseText = causeRootLabel(item.causeRoot);
        return item;
      });

      this.setData({ results, lastResultCount: results.length });

      // 搜索成功率与「搜索无结果率」两个指标的分母都来自这条事件。
      // 0 结果必须上报，否则最需要被发现的词表缺口在数据里看不见
      track.track('search_submit', {
        keyword: keyword,
        hasKeyword: !!keyword,
        industry: industry || 'all',
        causeRoot: root || 'all',
        resultCount: results.length,
        success: results.length > 0,
        durationMs: Date.now() - startedAt
      });
    } catch (err) {
      console.error('搜索失败：', err);
      track.track('search_submit', {
        keyword: keyword,
        industry: industry || 'all',
        causeRoot: root || 'all',
        resultCount: 0,
        success: false,
        error: true
      });
      this.setData({ results: [], lastResultCount: 0 });
      wx.showToast({
        title: '搜索失败，请重试',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    const causeRoot = e.currentTarget.dataset.root || 'none';
    // 搜索成功率之外还要看「搜索之后有没有真的点进去」。
    // 搜到但全都不点，说明结果排序或标题没解决判断问题
    track.track('search_result_click', {
      projectId: id,
      causeRoot: causeRoot,
      position: e.currentTarget.dataset.index
    });
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}&entry=from_search`
    });
  }
});
