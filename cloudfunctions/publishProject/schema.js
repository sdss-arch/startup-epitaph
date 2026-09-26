/**
 * 项目字段校验器。
 *
 * 为什么服务端必须再校验一遍（客户端 publish.js 已经校验过）：
 * 客户端校验只是交互优化，不是安全边界。任何人可以跳过页面，
 * 直接 wx.cloud.callFunction 传任意 JSON。原先这里是
 *   data: { ...projectData, views: 0, likes: 0, ... }
 * 客户端对象整体展开入库，意味着可以注入 _openid（冒领所有权）、
 * views、likes、status、createdAt 等任意字段。
 *
 * 因此这里的规则是：只接受白名单字段、逐个校验、其余一律丢弃。
 *
 * 注意：云函数按目录独立部署，无法引用仓库根目录的公共文件，
 * 所以本文件与 updateProject/schema.js 保持同步。
 * 改动其中一份必须同步另一份，scripts/check.ps1 会比对两者的哈希。
 */

const INDUSTRIES = [
  '互联网', '电商', '教育', '医疗健康', '金融',
  '社交', '游戏', '本地生活', '企业服务', '人工智能',
  '区块链', '物联网', '新能源', '新零售', '其他'
];

/** 根因受控词表。来源见 docs/product/竞品分析.md 第三节 */
const CAUSE_ROOTS = [
  'no_market_demand', 'pmf_failure', 'business_model_invalid',
  'beaten_by_competitor', 'timing_wrong', 'unit_economics_unsustainable',
  'pricing_or_cost', 'product_quality_poor', 'team_issues',
  'internal_conflict', 'legal_compliance_risk', 'failed_to_pivot', 'other'
];

const CAUSE_SYMPTOMS = [
  'ran_out_of_money', 'nobody_paid', 'low_retention', 'growth_stalled',
  'rising_cac', 'negative_gross_margin', 'execution_stalled',
  'decision_paralysis', 'account_frozen', 'cash_burn_accelerated',
  'regulatory_shutdown', 'other'
];

const LIMITS = {
  title: 40,
  description: 200,
  failureReason: 2000,
  lessonsLearned: 2000,
  marketPotential: 500,
  tagLength: 12,
  maxTags: 5,
  maxPhotos: 9,
  maxCost: 100000000,   // 1 亿元，够用了，再大就是填错了
  maxDuration: 3650,    // 10 年
  maxTeamSize: 10000
};

function str(value, max) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().slice(0, max);
}

function positiveInt(value, max) {
  const n = Number(value);
  if (!isFinite(n) || n < 0) {
    return null;
  }
  return Math.min(Math.floor(n), max);
}

/**
 * 校验并归一化投稿数据。
 * @returns {{ok: true, data: object} | {ok: false, error: string}}
 */
function validateProject(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: '数据格式错误' };
  }

  const title = str(input.title, LIMITS.title);
  if (!title) {
    return { ok: false, error: '请填写项目名称' };
  }

  const description = str(input.description, LIMITS.description);
  if (!description) {
    return { ok: false, error: '请填写项目简介' };
  }

  if (INDUSTRIES.indexOf(input.industry) === -1) {
    return { ok: false, error: '请选择有效的行业分类' };
  }

  // 根因是本项目的核心结构，必须落在受控词表内。
  // 自由文本会让我们重新掉回「70% 都是钱烧完了」那个坑。
  if (CAUSE_ROOTS.indexOf(input.causeRoot) === -1) {
    return { ok: false, error: '请选择失败的根本原因' };
  }
  if (CAUSE_SYMPTOMS.indexOf(input.causeSymptom) === -1) {
    return { ok: false, error: '请选择最终表现出来的死因' };
  }

  const failureReason = str(input.failureReason, LIMITS.failureReason);
  if (!failureReason) {
    return { ok: false, error: '请填写失败的具体过程' };
  }

  const lessonsLearned = str(input.lessonsLearned, LIMITS.lessonsLearned);
  if (!lessonsLearned) {
    return { ok: false, error: '请填写经验教训' };
  }

  const duration = positiveInt(input.duration, LIMITS.maxDuration);
  if (duration === null || duration === 0) {
    return { ok: false, error: '请填写有效的持续时间' };
  }

  const teamSize = positiveInt(input.teamSize, LIMITS.maxTeamSize);
  if (teamSize === null || teamSize === 0) {
    return { ok: false, error: '请填写有效的团队规模' };
  }

  const cost = positiveInt(input.cost, LIMITS.maxCost);
  if (cost === null) {
    return { ok: false, error: '请填写有效的投入金额' };
  }

  const tags = Array.isArray(input.tags)
    ? input.tags
        .map((t) => str(t, LIMITS.tagLength))
        .filter((t) => t.length > 0)
        .slice(0, LIMITS.maxTags)
    : [];

  // 照片必须是云存储 fileID，否则可以塞任意外部地址
  const photos = Array.isArray(input.photos)
    ? input.photos
        .filter((p) => typeof p === 'string' && p.startsWith('cloud://'))
        .slice(0, LIMITS.maxPhotos)
    : [];

  return {
    ok: true,
    data: {
      title: title,
      description: description,
      industry: input.industry,
      causeRoot: input.causeRoot,
      causeSymptom: input.causeSymptom,
      failureReason: failureReason,
      lessonsLearned: lessonsLearned,
      marketPotential: str(input.marketPotential, LIMITS.marketPotential),
      duration: duration,
      teamSize: teamSize,
      cost: cost,
      tags: tags,
      photos: photos
    }
  };
}

module.exports = {
  validateProject: validateProject,
  INDUSTRIES: INDUSTRIES,
  CAUSE_ROOTS: CAUSE_ROOTS,
  CAUSE_SYMPTOMS: CAUSE_SYMPTOMS
};
