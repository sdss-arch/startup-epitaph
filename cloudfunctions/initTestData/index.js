const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  try {
    // 测试项目数据
    const testProjects = [
      {
        title: '在线教育平台',
        description: '一款针对K12教育的在线学习平台，包含直播课程、录播回放、作业批改等功能。',
        industry: '教育',
        duration: 18,
        teamSize: 8,
        cost: 500000,
        failureReason: '市场竞争激烈，获客成本过高，无法盈利。主要竞争对手包括猿辅导、作业帮等巨头，用户获取成本超过200元/人，LTV不足以覆盖CAC。',
        lessonsLearned: '创业之前要充分研究市场，选择竞争格局相对清晰的赛道，避免直接与巨头正面竞争。同时需要设计更高效的获客渠道。',
        marketPotential: '在线教育市场仍然巨大，但需要找到差异化的细分领域切入，例如职业教育、素质教育等。',
        tags: ['在线教育', 'K12', '直播'],
        views: 1256,
        likes: 86,
        photos: [],
        status: 'failed',
        createdAt: new Date('2024-06-15'),
        updatedAt: new Date('2024-06-15')
      },
      {
        title: '社区电商平台',
        description: '基于社区团长的社交电商平台，主要销售生鲜食品和日用品，通过社群裂变获客。',
        industry: '电商',
        duration: 12,
        teamSize: 6,
        cost: 350000,
        failureReason: '供应链管理困难，品控问题频发，用户复购率低。同时资金链断裂，无法继续补贴运营。',
        lessonsLearned: '重资产模式需要谨慎，供应链能力是核心竞争力，在没有足够资源支撑的情况下不要轻易尝试。',
        marketPotential: '社区团购仍有市场空间，但需要更精细化的运营和更强的供应链管理能力。',
        tags: ['社区团购', '社交电商', '生鲜'],
        views: 980,
        likes: 52,
        photos: [],
        status: 'failed',
        createdAt: new Date('2024-08-20'),
        updatedAt: new Date('2024-08-20')
      },
      {
        title: '智能健康设备',
        description: '一款结合AI算法的智能血压计，提供健康分析和建议，配套APP使用。',
        industry: '医疗健康',
        duration: 24,
        teamSize: 12,
        cost: 1200000,
        failureReason: '硬件研发成本超出预期，生产良率低，且医疗产品认证周期漫长。同时用户对医疗产品接受度谨慎，市场推广困难。',
        lessonsLearned: '医疗健康领域创业门槛极高，需要充分了解监管政策，做好长期投入准备。建议从软件或服务类产品切入。',
        marketPotential: '人口老龄化趋势下，健康管理需求巨大，但需要找到更轻资产的商业模式。',
        tags: ['医疗健康', '智能硬件', 'AI'],
        views: 1540,
        likes: 98,
        photos: [],
        status: 'failed',
        createdAt: new Date('2024-04-10'),
        updatedAt: new Date('2024-04-10')
      },
      {
        title: '职场社交应用',
        description: '面向职业人士的社交平台，提供人脉拓展、行业交流、求职招聘等功能。',
        industry: '社交',
        duration: 15,
        teamSize: 5,
        cost: 280000,
        failureReason: '用户增长困难，社交产品冷启动是最大难题。已有LinkedIn和脉脉占据市场，差异化竞争困难。',
        lessonsLearned: '社交类产品需要独特的切入点和强大的运营能力，否则很难在巨头缝隙中生存。',
        marketPotential: '垂直领域的职场社交仍有机会，例如特定行业、特定职业群体的精准社交。',
        tags: ['社交', '职场', '人脉'],
        views: 765,
        likes: 41,
        photos: [],
        status: 'failed',
        createdAt: new Date('2024-09-05'),
        updatedAt: new Date('2024-09-05')
      },
      {
        title: 'SaaS项目管理工具',
        description: '针对中小团队的轻量化项目管理工具，包含任务分配、进度追踪、团队协作等功能。',
        industry: '企业服务',
        duration: 20,
        teamSize: 7,
        cost: 420000,
        failureReason: '付费转化困难，中小企业对价格敏感，且已有飞书、钉钉、Notion等成熟产品竞争。',
        lessonsLearned: 'SaaS产品需要找到真正的痛点，且具备不可替代性，否则用户很难付费。',
        marketPotential: '企业服务市场持续增长，但需要聚焦垂直行业或深度解决某一具体问题。',
        tags: ['SaaS', '项目管理', '企业服务'],
        views: 1120,
        likes: 67,
        photos: [],
        status: 'failed',
        createdAt: new Date('2024-07-22'),
        updatedAt: new Date('2024-07-22')
      },
      {
        title: '闲置物品交易小程序',
        description: '基于地理位置的闲置物品交易平台，主打本地社区闲置流转。',
        industry: '本地生活',
        duration: 8,
        teamSize: 4,
        cost: 150000,
        failureReason: '闲鱼和转转已占据市场主导，用户习惯难改。同时信任机制建立困难，交易频次低。',
        lessonsLearned: '二手交易市场需要强大的信用体系和运营投入，小团队很难与巨头竞争。',
        marketPotential: '垂直细分品类的二手交易仍有机会，例如二手奢侈品、二手母婴用品等。',
        tags: ['二手', '闲置', '本地'],
        views: 630,
        likes: 34,
        photos: [],
        status: 'failed',
        createdAt: new Date('2024-10-08'),
        updatedAt: new Date('2024-10-08')
      }
    ];

    // 测试导师数据
    const testAdvisors = [
      {
        name: '张明',
        avatar: '',
        title: '连续创业者，前教育科技公司创始人',
        bio: '曾创办在线教育公司，运营18个月后关闭。现在在一家VC做投资顾问，专注教育科技领域。',
        industry: '教育',
        tags: ['教育科技', '在线教育', 'K12'],
        price: 99,
        rating: 4.9,
        consultCount: 28,
        isVip: true,
        status: 'active',
        sort: 1,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      },
      {
        name: '李华',
        avatar: '',
        title: '前电商平台产品负责人',
        bio: '曾在知名电商平台负责产品，参与过社区团购项目，有丰富的供应链管理经验。',
        industry: '电商',
        tags: ['电商', '供应链', '社区团购'],
        price: 129,
        rating: 4.8,
        consultCount: 35,
        isVip: true,
        status: 'active',
        sort: 2,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      },
      {
        name: '王芳',
        avatar: '',
        title: '医疗健康领域创业者',
        bio: '在医疗健康领域有8年经验，曾创办智能硬件公司，熟悉医疗产品注册和监管政策。',
        industry: '医疗健康',
        tags: ['医疗健康', '智能硬件', '医疗器械'],
        price: 149,
        rating: 5.0,
        consultCount: 15,
        isVip: true,
        status: 'active',
        sort: 3,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      },
      {
        name: '赵伟',
        avatar: '',
        title: '社交产品增长专家',
        bio: '曾在大厂负责社交产品增长，熟悉用户增长和社群运营，帮助多个项目实现冷启动。',
        industry: '社交',
        tags: ['社交', '增长', '冷启动'],
        price: 89,
        rating: 4.7,
        consultCount: 42,
        isVip: false,
        status: 'active',
        sort: 4,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      },
      {
        name: '孙莉',
        avatar: '',
        title: 'SaaS产品专家',
        bio: '10年企业服务经验，曾主导过多款SaaS产品设计，擅长产品定位和商业化策略。',
        industry: '企业服务',
        tags: ['SaaS', '企业服务', '产品设计'],
        price: 159,
        rating: 4.9,
        consultCount: 23,
        isVip: true,
        status: 'active',
        sort: 5,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      },
      {
        name: '钱强',
        avatar: '',
        title: '本地生活创业老兵',
        bio: '深耕本地生活领域多年，有丰富的地推和商户运营经验，了解三四线城市市场特点。',
        industry: '本地生活',
        tags: ['本地生活', '地推', '运营'],
        price: 79,
        rating: 4.6,
        consultCount: 18,
        isVip: false,
        status: 'active',
        sort: 6,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    ];

    // 先检查 projects 集合是否已有数据
    const projectsRes = await db.collection('projects').limit(1).get();
    if (projectsRes.data.length === 0) {
      // 批量插入测试项目
      for (const project of testProjects) {
        await db.collection('projects').add({
          data: project
        });
      }
    }

    // 先检查 advisors 集合是否已有数据
    const advisorsRes = await db.collection('advisors').limit(1).get();
    if (advisorsRes.data.length === 0) {
      // 批量插入测试导师
      for (const advisor of testAdvisors) {
        await db.collection('advisors').add({
          data: advisor
        });
      }
    }

    return {
      success: true,
      message: `测试数据初始化完成`,
      count: {
        projects: projectsRes.data.length === 0 ? testProjects.length : 0,
        advisors: advisorsRes.data.length === 0 ? testAdvisors.length : 0
      }
    };
  } catch (err) {
    console.error(err);
    return {
      success: false,
      error: err.message
    };
  }
};
