const { causeRootLabel, causeSymptomLabel } = require('../../utils/constants.js');

Page({
  data: {
    stats: {
      totalProjects: 0,
      withRootCause: 0,
      totalCost: 0,
      totalViews: 0,
      totalLikes: 0,
      truncated: false,
      scanned: 0,
      rootCauseRate: '0%',
      industryStats: [],
      rootCauseStats: [],
      symptomStats: [],
      loading: true,
      error: ''
    }
  },

  onLoad() {
    this.loadStatistics();
  },

  async loadStatistics() {
    this.setData({ 'stats.loading': true, 'stats.error': '' });
    try {
      // 必须走云函数：小程序端 SDK 单次最多返回 20 条，
      // 直接查库会让「项目总数」被永久锁死在 20
      const res = await wx.cloud.callFunction({
        name: 'getStatistics',
        data: {}
      });

      if (!res.result || !res.result.success) {
        throw new Error((res.result && res.result.error) || '聚合失败');
      }

      const d = res.result.data;

      // 占比全部在 JS 里算好。
      // WXML 的数据绑定不支持调用 JS 函数，
      // 模板里写 barWidth(item) 只会渲染成空白。
      this.setData({
        stats: {
          totalProjects: d.totalProjects,
          withRootCause: d.withRootCause,
          totalCost: d.totalCost,
          totalViews: d.totalViews,
          totalLikes: d.totalLikes,
          truncated: d.truncated,
          scanned: d.scanned,
          rootCauseRate: pct(d.withRootCause, d.totalProjects),
          industryStats: withPercent(d.industryStats),
          rootCauseStats: withLabels(d.rootCauseStats, causeRootLabel),
          symptomStats: withLabels(d.symptomStats, causeSymptomLabel),
          loading: false,
          error: ''
        }
      });
    } catch (err) {
      console.error('加载统计数据失败：', err);
      this.setData({
        'stats.loading': false,
        'stats.error': '数据加载失败，请下拉重试'
      });
    }
  },

  onPullDownRefresh() {
    this.loadStatistics().then(() => wx.stopPullDownRefresh());
  },

  onRetry() {
    this.loadStatistics();
  }
});

/** code -> 中文标签，并预计算占比字符串 */
function withLabels(list, labelFn) {
  const rows = withPercent(list);
  return rows.map((row) => Object.assign({}, row, { label: labelFn(row.key) }));
}

function withPercent(list) {
  const items = list || [];
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return items.map((item) => ({
    key: item.key,
    count: item.count,
    percentText: pct(item.count, total)
  }));
}

function pct(part, whole) {
  if (!whole) {
    return '0%';
  }
  return Math.round((part / whole) * 100) + '%';
}
