/**
 * 全局共享常量 —— 受控词表与埋点事件名。
 *
 * 这里的每一项都有产品决策依据，改动前请先读：
 *   - docs/product/竞品分析.md 第三节（根因/死因两层的来源）
 *   - docs/product/指标体系.md 第二节（每个事件服务于哪个指标）
 *   - docs/product/埋点方案.md  （事件字典与上报时机）
 *
 * 设计约定：
 *   1. 入库一律用 code（英文短横线），展示一律用 label（中文）。
 *      code 是稳定键，改 label 不会破坏历史数据。
 *   2. 词表禁止在页面里私自扩充。新增词条必须先进这里，
 *      再更新 docs/product/埋点方案.md，否则 check.ps1 会报错。
 */

/**
 * 根因（causeRoot）受控词表。
 *
 * 来源：CB Insights 失败原因分类体系（2021 Top 12，样本 110+；
 * 2024 年 431 家样本版把「资金耗尽」重分类为症状，根因首位是
 * 产品市场匹配失败 43%）。
 *
 * 为什么要受控：自由文本会导致 70% 的记录退化成「钱烧完了」，
 * 而「资金耗尽」几乎总是最后死因而非根本问题。
 * 详见 docs/product/竞品分析.md 第三节。
 */
const CAUSE_ROOTS = [
  { code: 'no_market_demand', label: '没有市场需求', desc: '做的东西没有人要' },
  { code: 'pmf_failure', label: '产品市场匹配失败', desc: '有需求但产品没接住' },
  { code: 'business_model_invalid', label: '商业模式不成立', desc: '单笔生意算不过账' },
  { code: 'beaten_by_competitor', label: '被竞品击败', desc: '被更快或更便宜的对手挤掉' },
  { code: 'timing_wrong', label: '时机错误', desc: '进入得太早或太晚' },
  { code: 'unit_economics_unsustainable', label: '单位经济不可持续', desc: '每多卖一单亏一单' },
  { code: 'pricing_or_cost', label: '定价或成本问题', desc: '价格定错或成本失控' },
  { code: 'product_quality_poor', label: '产品本身不好', desc: '东西做出来不好用' },
  { code: 'team_issues', label: '团队问题', desc: '能力或结构不匹配' },
  { code: 'internal_conflict', label: '内部冲突', desc: '决策瘫痪' },
  { code: 'legal_compliance_risk', label: '合规/法律风险', desc: '牌照、数据或条款问题' },
  { code: 'failed_to_pivot', label: '无法及时转型', desc: '信号已现但没有转向' },
  { code: 'other', label: '其他', desc: '以上都不贴合，选这项并在下方补充说明' }
];

/**
 * 死因（causeSymptom）受控词表。
 *
 * 与根因分开的原因：同一个根因会以不同死因收场，
 * 而同一个死因（最常见是资金耗尽）会横跨多个根因。
 * 分开存才能做出「资金耗尽 → 根因分布」这张最关键的表。
 */
const CAUSE_SYMPTOMS = [
  { code: 'ran_out_of_money', label: '资金耗尽' },
  { code: 'nobody_paid', label: '无人付费' },
  { code: 'low_retention', label: '留存低' },
  { code: 'growth_stalled', label: '增长停滞' },
  { code: 'rising_cac', label: '流量成本上升' },
  { code: 'negative_gross_margin', label: '毛利为负' },
  { code: 'execution_stalled', label: '执行停滞' },
  { code: 'decision_paralysis', label: '决策瘫痪' },
  { code: 'account_frozen', label: '账户冻结' },
  { code: 'cash_burn_accelerated', label: '现金消耗加速' },
  { code: 'regulatory_shutdown', label: '监管关停' },
  { code: 'other', label: '其他' }
];

/** 行业分类。发布页与搜索页必须共用同一份，否则会出现「投了搜不到」。 */
const INDUSTRIES = [
  '互联网', '电商', '教育', '医疗健康', '金融',
  '社交', '游戏', '本地生活', '企业服务', '人工智能',
  '区块链', '物联网', '新能源', '新零售', '其他'
];

/**
 * 埋点事件名白名单。
 *
 * 这是 `docs/product/指标体系.md` 里每个指标的数据来源。
 * scripts/check.ps1 会做双向校验：
 *   - 代码里 track() 传入的名字必须在此列表内
 *   - 此列表里的每个名字必须至少被代码引用一次
 * 所以删事件 = 同时改这里 + 改指标体系，否则 CI 会红。
 */
const TRACK_EVENTS = [
  // 消费组 —— 服务「复盘阅读渗透率」「人均月阅读条数」「搜索使用率」
  'app_launch',
  'project_view',
  'search_submit',
  'search_result_click',
  'root_cause_filter',

  // 互动组 —— 服务「致敬率」「评论率」「分享率」
  'project_like',
  'project_favorite',
  'comment_submit',
  'share_click',
  'notification_click',

  // 供给组 —— 服务「供给转化率」「内容结构完整率」
  'publish_start',
  'publish_success',
  'publish_abandon',
  'publish_error',

  // 商业组 —— 服务「咨询下单转化率」「VIP 转化率」
  'consult_page_view',
  'order_submit',
  'vip_page_view',
  'vip_order_submit',

  // 诊断组 —— 指标体系里的健康度告警「调试入口残留在正式版」
  'debug_entry_click'
];

/** code -> label 映射，避免每个页面重复写 find */
function buildLabelMap(list) {
  const map = {};
  for (const item of list) { map[item.code] = item.label; }
  return map;
}

const CAUSE_ROOT_LABELS = buildLabelMap(CAUSE_ROOTS);
const CAUSE_SYMPTOM_LABELS = buildLabelMap(CAUSE_SYMPTOMS);

/** 取根因中文名；未命中返回 code 本身，便于排查脏数据而不是静默显示空白 */
function causeRootLabel(code) {
  return CAUSE_ROOT_LABELS[code] || code || '';
}

function causeSymptomLabel(code) {
  return CAUSE_SYMPTOM_LABELS[code] || code || '';
}

module.exports = {
  CAUSE_ROOTS,
  CAUSE_SYMPTOMS,
  INDUSTRIES,
  TRACK_EVENTS,
  causeRootLabel,
  causeSymptomLabel
};
