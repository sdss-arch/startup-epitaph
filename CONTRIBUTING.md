# 贡献指南

感谢你愿意为这个项目花时间。这份文档说明怎么把改动提交进来。

## 环境准备

1. Fork 本仓库
2. 克隆到本地

   ```bash
   git clone git@github.com:<你的用户名>/<仓库名>.git
   cd <仓库名>
   ```

3. 安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html) 稳定版
4. 导入项目，填入你自己的 AppID，并开通云开发环境

详见 [README 快速开始](README.md#快速开始)。

## 分支规范

| 类型 | 命名 | 用途 |
|:--|:--|:--|
| 功能 | `feat/简短描述` | 新功能 |
| 修复 | `fix/简短描述` | 修 Bug |
| 重构 | `refactor/简短描述` | 不改行为的结构调整 |
| 文档 | `docs/简短描述` | 只改文档 |
| 杂项 | `chore/简短描述` | 构建、依赖、配置 |

- 从 `main` 切分支
- 一个 PR 只做一件事
- 分支用完及时删

## 提交信息

采用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)：

```
<类型>(<范围>): <简短描述>

<可选正文>

<可选脚注>
```

类型：`feat` `fix` `docs` `style` `refactor` `perf` `test` `chore` `revert` `build` `ci`

例子：

```
feat(detail): 项目详情页增加失败原因的时间线展示
fix(publish): 修复标签数为 0 时表单校验误报的问题
docs(readme): 补充云数据库权限配置说明
ci: 增加 JSON 合法性与密钥泄露检查
```

## 提交前自检

```bash
# 确认没有误提交本地文件
git status

# 确认密钥、node_modules、.env 之类没进暂存区
git diff --cached --name-only

# 确认没有引入 CRLF 混乱（仓库统一 LF）
git diff --check
```

必须做到：

- [ ] `project.private.config.json` 未被提交（在 `.gitignore` 中）
- [ ] 没有 `node_modules/`、`.env`、`*.key`
- [ ] 新增代码通过 CI 检查
- [ ] 涉及界面的改动遵循现有配色，**未引入蓝紫色**

## Pull Request

标题沿用提交信息规范，例如：

```
fix(search): 修复行业筛选在无结果时白屏的问题
```

正文请说明：

1. **改了什么** —— 一两句话说清
2. **为什么改** —— 关联的 Issue 编号（`Closes #12`）
3. **怎么验证** —— 复现步骤与预期结果
4. **截图** —— 界面改动请附前后对比

## 代码风格

- 缩进 2 空格，行尾 LF，文件末尾换行
- 文件编码 UTF-8 无 BOM
- 遵循现有代码风格，不做无关的大范围格式化
- 注释写「为什么」，不写「做了什么」

## 报告 Bug

请用 [Bug 反馈模板](.github/ISSUE_TEMPLATE/bug_report.yml)，务必包含：

- 微信开发者工具版本、基础库版本
- 复现步骤
- 完整报错信息
- 预期行为

## 认领任务

Issue 标签 `good first issue` 和 `help wanted` 适合新贡献者。
认领前先留言，避免多人重复劳动。

## 行为准则

参与即表示同意 [行为准则](CODE_OF_CONDUCT.md)。
