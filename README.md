<div align="center">

# 创业墓志铭

**为失败的创业立一座碑，让教训不再重演。**

[![License](https://img.shields.io/badge/license-MIT-brown.svg)](LICENSE)
[![miniprogram](https://img.shields.io/badge/miniprogram-微信小程序-07C160?logo=wechat)](https://developers.weixin.qq.com/miniprogram/dev/framework/)
[![cloudbase](https://img.shields.io/badge/backend-腾讯云开发-0052D9?logo=tencentcloud)](https://cloud.tencent.com/product/tcb)
[![base library](https://img.shields.io/badge/baselib-2.2.3%2B-07C160)](https://developers.weixin.qq.com/miniprogram/dev/framework/)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brown.svg)
![Issues](https://img.shields.io/badge/issues-welcome-brown.svg)

一个汇集失败创业项目的微信小程序。每一个项目都记录了它是谁、做了什么、
烧了多少钱、怎么死的、以及今天是否还有机会。

</div>

---

## 这是什么

大多数创业复盘散落在朋友圈、知乎回答和关停的公众号里，搜不到、传不下、
更没人看。这个小程序想把它们收拢成一个**结构化的、可检索的墓志铭园**。

每一条记录都包含完整的因果链：

```
项目是谁  →  做了什么  →  花了多少钱  →  死于什么原因  →  留下什么教训  →  今天还有没有机会
```

最后两项是这个项目区别于普通"失败案例合集"的地方：不是单纯记仇，
而是给出**可复用的判断**。

## 核心功能

13 个页面构成完整闭环，无占位页、无死链。

| 模块 | 页面 | 说明 |
|:--|:--|:--|
| **浏览** | 首页 | 项目卡片流，支持全部／最新／热门三种排序，下拉刷新 + 上拉分页 |
| | 项目详情 | 完整档案展示、点赞致敬、收藏、评论、浏览量、分享转发 |
| | 搜索 | 关键词检索 + 行业分类筛选 |
| **贡献** | 立碑发布 | 带校验的完整表单，支持项目照片上传、标签管理 |
| | 编辑项目 | 修改已发布的项目内容与照片 |
| **个人** | 我的 | 资料卡、我的项目、我的收藏、数据看板、消息通知 |
| | 编辑资料 | 昵称、头像、简介 |
| | 我的项目 | 自己发布的项目管理，支持编辑与删除 |
| | 我的收藏 | 收藏列表 |
| | 通知 | 互动消息 |
| **数据** | 数据看板 | 项目总数、总投入、总浏览、总致敬、行业分布 |
| **商业化** | 咨询 | 付费咨询下单 |
| | VIP | 会员权益 |

底部四个 Tab：**墓志铭 · 搜索 · 立碑 · 我的**

## 技术栈

| 层 | 选型 |
|:--|:--|
| 前端 | 微信小程序原生框架（WXML / WXSS / JS），无第三方 UI 库 |
| 登录 | 静默登录，`wx.cloud` 隐式换取 openid，无感知无授权弹窗 |
| 后端 | 腾讯云开发 CloudBase —— 云函数 + 云数据库 + 云存储 |
| 运行时 | 基础库 ≥ 2.2.3，云函数 Node.js，`wx-server-sdk ~2.6.3` |
| 设计 | 复古怀旧风，棕色／米色／灰色系，**严格不使用蓝紫色** |

## 架构

```
创业墓志铭/
├── miniprogram/                 # 小程序主体
│   ├── app.js                    # 启动、云环境初始化、静默登录
│   ├── app.json                  # 页面注册、TabBar、导航栏
│   ├── app.wxss                  # 全局样式与设计变量
│   ├── images/                   # TabBar 图标（8 个，81×81）
│   └── pages/                    # 13 个业务页面
│
├── cloudfunctions/              # 服务端
│   ├── login/                    # 静默登录换取 openid
│   ├── publishProject/           # 发布项目
│   ├── updateProject/            # 更新项目
│   ├── deleteProject/            # 删除项目
│   ├── initTestData/             # 灌入演示数据
│   ├── createOrder/              # VIP 订单
│   ├── createConsultation/       # 咨询订单
│   └── sendNotification/         # 消息通知
│
├── docs/                         # 项目文档
├── .github/                      # Issue 模板、PR 模板、CI
├── project.config.json           # 开发者工具工程配置
└── package.json                  # 仓库元信息
```

数据流：页面 → `wx.cloud.callFunction()` → 云函数 → 云数据库。
云函数通过 `_openid` 字段做数据归属，客户端不持有任何凭证。

## 快速开始

### 环境要求

- [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html) 稳定版
- 基础库 ≥ 2.2.3
- 一个微信小程序账号（[注册](https://mp.weixin.qq.com/)）
- 一个腾讯云账号并开通云开发（[开通](https://cloud.tencent.com/)）

### 两处需要改成你自己的

| 文件 | 字段 | 说明 |
|:--|:--|:--|
| `project.config.json` | `appid` | 换成你的小程序 AppID |
| `miniprogram/app.js` | `wx.cloud.init` 的 `env` | 换成你的云环境 ID |

### 部署步骤

1. 开发者工具 → 导入项目 → 填入你的 AppID
2. 工具栏 → **云开发** → 开通环境 → 记下环境 ID
3. 云开发控制台 → **数据库** → 新建 5 个集合：
   `projects`、`users`、`comments`、`likes`、`favorites`
4. 每个集合权限设为「所有用户可读，仅创建者可写」
5. 开发者工具内右键 `cloudfunctions/<函数名>` →
   **上传并部署：云端安装依赖**（8 个函数全部执行）
6. **编译**运行
7. 首页为空时 → 我的 → 底部调试工具 → 初始化测试数据

完整图文步骤见 **[docs/部署指南.md](docs/部署指南.md)**。

## 数据库

5 个集合，全部通过 `_openid` 归属到用户：

| 集合 | 用途 | 关键字段 |
|:--|:--|:--|
| `projects` | 项目档案 | `title` `industry` `duration` `cost` `teamSize` `failureReason` `lessonsLearned` `marketPotential` `tags` `photos` `status` `views` `likes` |
| `users` | 用户 | `nickname` `avatarUrl` `bio` `projectsCount` `isVip` |
| `comments` | 评论 | `projectId` `content` `nickname` |
| `likes` | 点赞 | `projectId` |
| `favorites` | 收藏 | `projectId` |

完整字段表见 **[docs/数据模型.md](docs/数据模型.md)**。

## 设计规范

完整规范见 **[docs/设计规范.md](docs/设计规范.md)**，核心令牌：

| 用途 | 色值 |
|:--|:--|
| 主色（深棕） | `#2c2416` |
| 背景（米色） | `#f5f0e6` |
| 次要文字（棕） | `#8b7355` |

- 字体以衬线体为主，呼应碑文质感
- 卡片式布局，圆角 + 细分割线
- **不使用蓝紫色**——这是产品的硬性视觉约束，由 CI 自动检查

## 开发

```bash
# 运行项目自检（8 项：JSON、编码、换行、密钥、页面完整性、资源引用、配色）
npm run check

# 或直接
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\check.ps1
```

CI 在每次 push 与 PR 时自动执行三项检查：项目自检、gitleaks 密钥扫描、
主包体积（上限 2 MB）。

## 文档

| 文档 | 内容 |
|:--|:--|
| [docs/产品需求.md](docs/产品需求.md) | 产品定位与功能规格 |
| [docs/部署指南.md](docs/部署指南.md) | 从零到上线的完整步骤与排错 |
| [docs/数据模型.md](docs/数据模型.md) | 集合字段与索引建议 |
| [docs/设计规范.md](docs/设计规范.md) | 配色、字体、组件、图标、文案规范 |
| [docs/商业化.md](docs/商业化.md) | 变现路径与合规提示 |
| [docs/发布检查清单.md](docs/发布检查清单.md) | **上架前必须处理的项** |
| [CHANGELOG.md](CHANGELOG.md) | 版本变更记录 |

## 参与贡献

欢迎提交 Issue 和 Pull Request。开始前请阅读
[贡献指南](CONTRIBUTING.md) 和[行为准则](CODE_OF_CONDUCT.md)。

发现安全问题请勿公开 Issue，见 [SECURITY.md](SECURITY.md)。

## 致谢

感谢每一位愿意公开自己失败经历的人。**公开失败比隐藏失败更需要勇气。**

## 许可

[MIT](LICENSE) © 2026 吃葡萄不吐白菜2
