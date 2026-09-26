# 更新日志

本项目的所有 notable 变更记录在此文件。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [未发布]

### 计划中

- [ ] 接入微信支付官方校验，替换当前可伪造的订单创建逻辑
- [ ] 商业化集合（`orders` / `advisors` / `consultations`）建表脚本
- [ ] 演示数据打 `isDemo` 标记，首页自动过滤
- [ ] 单元测试接入（当前 CI 仅做静态检查）

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

- ⚠️ 支付未接入官方校验，`createOrder` / `createConsultation`
  仅凭客户端参数即可创建订单。上线前必须处理，见
  [发布检查清单](docs/发布检查清单.md)
- ⚠️ 个人中心的调试工具（含演示数据初始化与重置）在正式版必须移除
- 演示数据会覆盖正式数据，`initTestData` 云函数需在发布前从云端删除

[未发布]: https://github.com/sdss-arch/startup-epitaph/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/sdss-arch/startup-epitaph/releases/tag/v0.1.0
