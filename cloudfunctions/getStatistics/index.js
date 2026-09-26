const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 平台数据聚合。
 *
 * 为什么必须放服务端，而不是页面里直接查：
 * 小程序端 SDK 的 get() 单次最多返回 20 条。原先 statistics.js
 * 直接 db.collection('projects').get() 然后取 length 当「项目总数」，
 * 于是这个数字被永久锁死在 min(20, N)，总投入/总浏览/总致敬
 * 也全是前 20 条的部分和——一个以聚合为唯一职责的页面，
 * 从第一天起算的就是错数。
 *
 * 指标口径说明：
 *   - 项目总数用 count()，是精确值
 *   - 总投入 / 总浏览 / 总致敬需要遍历全量，用服务端分页
 *   - 遍历上限 MAX_SCAN，超过后 totalCost 等为「前 MAX_SCAN 条之和」，
 *     并通过 truncated 标记告知前端，避免把部分和当全量展示
 */

const PAGE_SIZE = 100;
/** 单次聚合最多扫描多少条。留出余量，同时避免云函数超时 */
const MAX_SCAN = 2000;

exports.main = async () => {
  try {
    const projects = db.collection('projects');
    const countRes = await projects.count();
    const totalProjects = countRes.total;

    let scanned = 0;
    let totalCost = 0;
    let totalViews = 0;
    let totalLikes = 0;
    /** 有根因的记录数 —— 北极星 MVPR 的质量门槛就是它 */
    let withRootCause = 0;

    const industryMap = {};
    const rootCauseMap = {};
    const symptomMap = {};

    while (scanned < Math.min(totalProjects, MAX_SCAN)) {
      const res = await projects.skip(scanned).limit(PAGE_SIZE).get();
      const batch = res.data;
      if (batch.length === 0) {
        break;
      }

      for (const p of batch) {
        totalCost += toNumber(p.cost);
        totalViews += toNumber(p.views);
        totalLikes += toNumber(p.likes);

        if (p.industry) {
          industryMap[p.industry] = (industryMap[p.industry] || 0) + 1;
        }
        // 根因是本项目的核心结构，缺根因的记录单独计数，
        // 不混进分布里——否则「有多少条数据」和「有多少条可用数据」
        // 这两个问题会得到同一个答案
        if (p.causeRoot) {
          withRootCause++;
          rootCauseMap[p.causeRoot] = (rootCauseMap[p.causeRoot] || 0) + 1;
        }
        if (p.causeSymptom) {
          symptomMap[p.causeSymptom] = (symptomMap[p.causeSymptom] || 0) + 1;
        }
      }

      scanned += batch.length;
      if (batch.length < PAGE_SIZE) {
        break;
      }
    }

    return {
      success: true,
      data: {
        totalProjects: totalProjects,
        withRootCause: withRootCause,
        totalCost: totalCost,
        totalViews: totalViews,
        totalLikes: totalLikes,
        truncated: totalProjects > scanned,
        scanned: scanned,
        industryStats: toSortedList(industryMap),
        rootCauseStats: toSortedList(rootCauseMap),
        symptomStats: toSortedList(symptomMap)
      }
    };
  } catch (err) {
    console.error('[getStatistics] 聚合失败：', err);
    return { success: false, error: err.message };
  }
};

function toNumber(value) {
  const n = Number(value);
  return isFinite(n) ? n : 0;
}

function toSortedList(map) {
  return Object.keys(map)
    .map((key) => ({ key: key, count: map[key] }))
    .sort((a, b) => b.count - a.count);
}
