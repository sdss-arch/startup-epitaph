# 更新日志

本项目的所有 notable 变更记录在此文件。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [未发布]

这一版的主题是**让文档与实现对齐**，以及修掉一批「界面正常但功能从未工作过」的缺陷。

### 新增 · 埋点（原稿声称有、代码里没有）

- `cloudfunctions/trackEvent/` —— 埋点写入通道。事件白名单 + 批量上限 20 +
  属性数量与长度限制 + 身份由 `cloud.getWXContext()` 取
- `miniprogram/utils/track.js` —— 客户端封装。队列攒 5 条或 8 秒上报，
  切后台强制 flush，**永不影响主流程**
- `miniprogram/utils/constants.js` —— 受控词表与 `TRACK_EVENTS` 的唯一来源
- `miniprogram/utils/format.js` —— 时间／金额／时长的统一口径
- **19 个事件，分 5 组**：消费 5 / 互动 5 / 供给 4 / 商业 4 / 诊断 1
- `docs/product/埋点方案.md` —— 事件字典、上报时机、属性、身份哈希、
  **刻意不埋的清单**

### 新增 · 根因／死因两层

`failureReason` 从单字段改为「根因 + 死因」两层结构，
词表取自 CB Insights 2024 年 431 家样本统计：

- `causeRoot` 13 项受控词表、`causeSymptom` 12 项，**均必填**
- 落地范围：数据模型、发布表单、编辑表单、详情页、数据看板、搜索筛选
- 演示数据同样满足两层结构（否则会稀释线上根因分布）
- **健康度指标「死因单一化率 ≤ 30%」**：一旦超过，说明用户不理解
  根因与死因的区别，该改的是引导文案和词表，不是数据本身

这条改动的来源是竞品调研，不是设计偏好：
「资金耗尽」在 70% 的案例里出现，但它几乎总是最后死因而非根本问题。

### 新增 · 云函数

| 函数 | 存在的理由 |
|:--|:--|
| `recordInteraction` | 浏览量与点赞必须在服务端计数（详见下方修复） |
| `getStatistics` | 聚合必须放服务端（详见下方修复） |
| `updateProfile` | 资料修改必须走服务端字段白名单（详见下方安全） |
| `trackEvent` | 埋点通道，客户端不可写 |

### 修复 · 三类「静默失效」

这三处的共同特征：**界面上一切正常，功能从来没工作过。**

- **浏览量永远是 0。** 客户端执行 `projects.doc(id).update({views: _.inc(1)})`，
  但 `projects` 的写权限是「仅创建者」——A 用户看 B 用户的项目时必然被拒。
  旧代码用 `try/catch` 把错误吞成一行日志。现改为服务端计数 +
  按「用户+项目+自然日」去重（新增 `project_views` 集合）
- **点赞数漂移，甚至变成负数。** 旧代码先插 `likes` 文档、再更新 `projects.likes`，
  两个请求不是事务，中间失败就永久不一致；`_.inc(-1)` 在计数已错乱时能减成负数。
  现改为同一事务内变更，计数带下限保护
- **数据看板永久少 20 条。** `statistics.js` 直接 `db.collection('projects').get()`，
  而小程序端 SDK 单次上限 20 条。一个以聚合为唯一职责的页面，
  从第一天起算的就是错数。现改为服务端 `count()` + 分页扫描，
  超过 `MAX_SCAN` 时返回 `truncated` 标记而不是假装是全量

### 修复 · 安全

| 漏洞 | 利用方式 | 修复 |
|:--|:--|:--|
| **越权提权** | 调试器里 `collection('users').where({_openid: 我}).update({isVip: true})`，而 `isVip` 是咨询 8 折的唯一判据 | 资料修改走 `updateProfile`，只接受 3 字段白名单；`isVip` / `vipExpireAt` 只能由支付回调写 |
| **订单一建即发权益** | 点「立即开通」即拿到 `status: 'paid'` + `isVip: true` | `status` 恒为 `pending`，**不发放任何权益**；接入支付后由 `payNotify` 改写 |
| **咨询定价可伪造** | `createConsultation` 三项全信客户端，构造 `price: 0` 下单 | 姓名与定价一律从 `advisors` 读；VIP 8 折在服务端算 |
| **伪造站内通知（钓鱼链路）** | `sendNotification` 接受任意 `recipientId` / `title` / `content`，可往别人通知列表塞伪造的「VIP开通成功」 | `recipientId` 强制等于调用者自己；文案由服务端模板渲染；`type` 白名单 + 频率限制 |
| **字段注入** | `publishProject` / `updateProject` 整体展开 `projectData`，可注入 `_openid`（冒领所有权）、`views`、`likes`、`status`、`createdAt` | 新增 `schema.js` 字段白名单，只接受 12 个投稿字段 |
| **演示数据无闸门** | `initTestData` 任何用户可调；界面「重置」承诺删除数据但实际没删 | 加 `ALLOW_SEED_DATA` 环境变量闸门；真正实现 `deleteOld`（只清 `isDemo: true`）；演示数据打标记 |
| **订单号可预测** | `Math.random` 生成财务凭证 | 改用 `crypto.randomBytes` |

### 修复 · 页面缺陷

- **WXML 不能调用 JS 函数**：`notifications` 的类型图标与时间、
  `statistics` 的占比条、`consulting` 的价格全部渲染为空白。
  一律改为在 `setData` 前算好
- **首页「全部」标签实际按 `views` 排序**，而 `views` 长期为 0，
  等于随机顺序。改为「全部(`createdAt` desc) / 热门(`views` desc) /
  最多致敬(`likes` desc)」三档
- **搜索页行业词表只有 7 项**，而发布页有 15 项——
  意味着 8 个分类投完之后永远筛不出来。两页现共用 `INDUSTRIES`
- **正则元字符未转义**：用户输入 `(` 会让 `db.RegExp` 抛错，搜索按钮失灵
- **`notifications` 收件人过滤有条件**：「先探测有没有我的通知，有才加过滤」，
  对零通知的新用户会列出全库所有人的消息。改为无条件生效
- **分页偏移量用 `list.length` 当 `skip`**：少返回一次就错位。
  改为独立维护的 `data.offset`
- **删除条目后偏移量不减**：删除第 2 页一条后下拉会重复显示第 1 页内容
- **Bootstrap 4 配色**：`consulting.wxss` 抄了 `#d4edda` / `#155724` /
  `#d1ecf1` / `#0c5460`（青蓝色相 188.6°，低于旧检查的 200° 门槛所以漏检）。
  已全部换为棕米系
- **无评分导师默认 `rating: 5.0`**：等于替导师伪造口碑。改为显示 `—`
- **`avatar: ''` 渲染成裂图**：`<image src="">` 会裂。
  改为用姓氏首字占位
- **`formatDuration` 非法值返回 0 个月**：会被误读成「立项当月就死」。改为返回 `—`
- **静默登录建号字段不一致**：`login` 云函数与 `app.js` 兜底建号写的字段不同，
  会出现「有的用户有 nickname、有的没有」。两处已统一

### 文档

- **重写 `docs/数据模型.md`** —— 从 5 个集合补到 11 个，
  按「谁能写」分组，标注每个集合配错权限的后果
- **重写 `docs/部署指南.md`** —— 11 个集合 + 12 个云函数 + 权限总表 +
  双账号实测清单 + 云函数环境变量
- **重写 `docs/商业化.md`** —— **删除「首年 ¥50 万、次年 ¥250 万」的盈利预测**，
  换成定价依据与可检验的推导链；砍掉广告变现并说明理由
- **新增 `docs/product/埋点方案.md`**
- **新增 `.github/需求评审模板.md`** —— 逼你先回答「它服务于哪个指标或假设」
- **更新 `docs/发布检查清单.md`** —— 权限表补 `events` / `project_views` /
  `notifications`，回归项 18 → 21
- **更新 `docs/product/指标体系.md` / `用户旅程.md`** ——
  删掉指向未产出文档的死链，改为显式列出「尚未产出」及其影响；
  H1–H5 补上各自的度量事件
- **重写 `scripts/check.ps1`** —— 从 8 项扩到 **15 项**，
  新增 6 项专门防「文档声称 A、代码里是 B」：埋点事件名双向校验、
  云函数交叉校验、两份 `schema.js` 哈希比对、集合 ↔ 数据模型、
  部署指南 ↔ 云函数与集合、README 数量声明
- **`.github/workflows/ci.yml` 新增 `syntax` job** —— ubuntu runner 上
  `node --check` 硬门禁 + WXML 事件绑定与 JS 方法交叉校验

### 已知问题

- ⚠️ `events` 集合**没有任何查询界面**：数据进了库但看不到，
  北极星指标目前算不出来
- ⚠️ 埋点**未运行时验证**，且 `TRACK_SALT` 未配置
  （身份哈希暂用公开 `APPID` 加盐）
- ⚠️ 支付未接入，订单只到 `pending`，权益不发放
- ⚠️ 无内容审核、举报、评论删除机制
- ⚠️ 搜索关键词只匹配标题，不匹配「失败过程」正文——
  而 P0 用户的真实表达恰恰是问题描述而非标题
- ⚠️ 搜索结果 50 条硬截断，无分页，界面不提示
- ⚠️ `initTestData` 仍需在云端删除
- ⚠️ 隐私政策、用户协议、社区规范未产出

---

## [0.1.0] - 2026-09-26

首个可运行版本。

### 新增

**小程序（13 个页面）**

- 首页：项目卡片流，全部／最新／热门排序，下拉刷新与上拉分页
- 项目详情：完整档案、点赞致敬、收藏、评论、浏览量、分享转发
- 搜索：关键词检索与行业分类筛选
- 立碑发布：带校验的完整表单、照片上传、标签管理
- 编辑项目、我的项目、我的收藏
- 个人中心、编辑资料、消息通知
- 数据看板：项目总数、总投入、总浏览、总致敬、行业分布
- 创业咨询、VIP 会员

**云函数（8 个）**

- `login` 静默登录换取 openid
- `publishProject` / `updateProject` / `deleteProject` 项目增改删
- `initTestData` 演示数据初始化
- `createOrder` / `createConsultation` 订单创建
- `sendNotification` 消息通知

**工程化**

- `.gitignore`、`.gitattributes`、`.editorconfig` —— 统一 LF、UTF-8 无 BOM
- `scripts/check.ps1` —— 8 项自检：JSON 合法性、编码、换行、末尾换行、
  行尾空格、密钥泄露、页面四件套完整性、静态资源引用、配色合规
- CI 三道关：项目自检、gitleaks 密钥扫描、主包体积检查
- Issue / PR 模板，PR 模板内置配色与密钥自检项
- `README.md`、`CONTRIBUTING.md`、`CODE_OF_CONDUCT.md`、`SECURITY.md`

**文档**

- `docs/产品需求.md` 产品定位与功能规格
- `docs/部署指南.md` 从零到上线的完整步骤与排错
- `docs/数据模型.md` 5 个集合的字段定义
- `docs/设计规范.md` 配色、字体、组件、图标、文案规范
- `docs/商业化.md` 变现路径与合规提示
- `docs/发布检查清单.md` 上架前必处理项

### 修复

- TabBar 图标缺失：原 8 个 PNG 均为 0 字节空文件，app 实际无法正常显示
  TabBar 图标。已按 81×81 重新绘制（墓碑／放大镜／方尖碑／人物，
  未选中 `#8b7355`、选中 `#2c2416`），并在 `app.json` 中补齐
  `iconPath` / `selectedIconPath`
- `profile.wxml` 「创业咨询」菜单图标为损坏字符（U+FFFD），
  实际渲染为方框，已替换为 💬
- 全仓库 CRLF 统一为 LF，清除 22 处行尾空格，补齐 37 个缺失的末尾换行

### 已知问题

> 本节中「支付未接入」「调试工具残留」「`initTestData` 需删除」
> 三项已在[未发布](#未发布)中修复或加上了运行时闸门。
> 「仅凭客户端参数即可创建订单」升级为「一建即发权益」，已修复为只建待支付订单。

- ⚠️ 支付未接入官方校验，`createOrder` / `createConsultation`
  仅凭客户端参数即可创建订单。上线前必须处理，见
  [发布检查清单](docs/发布检查清单.md)
- ⚠️ 个人中心的调试工具（含演示数据初始化与重置）在正式版必须移除
- 演示数据会覆盖正式数据，`initTestData` 云函数需在发布前从云端删除

[未发布]: https://github.com/sdss-arch/startup-epitaph/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/sdss-arch/startup-epitaph/releases/tag/v0.1.0
