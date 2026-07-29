# PromptHub Operations Skill

用于维护 PromptHub 提示词收藏站及其浏览器扩展的 Codex Skill。

## 能力范围

- 识别、校验、去重并修复提示词收藏数据。
- 保证 GitHub 主站先写入、国内站延迟 30 分钟发布的同步顺序。
- 维护提示词解析、详情页编辑、同步状态文案和扩展更新边界。
- 检查国内站性能、缓存、安全头和上线结果。
- 验证发布前后的 GitHub 状态、站点资源和测试结果。
- 约束 X 集成：禁止网页端自动扫描；仅在官方 API 配置完成后采用增量读取。

## 目录

| 路径 | 用途 |
| --- | --- |
| `SKILL.md` | Codex 执行规则与工作流。 |
| `references/` | 数据同步、发布验证和 X 合规参考。 |
| `scripts/verify-prompthub.ps1` | 运行项目测试、Git 差异检查和远端主分支核验。 |
| `dist/prompthub-skill.zip` | 可携带的 Skill 安装包。 |

## 使用

在 Codex 中使用 `$prompthub-operations`，例如：

```text
Use $prompthub-operations to verify the PromptHub collection sync and release the approved change.
```

验证当前 PromptHub 项目：

```powershell
.\scripts\verify-prompthub.ps1 -ProjectPath <PromptHub repository path>
```

## 数据与安全约束

- `data/collections.json` 的 GitHub `main` 版本是唯一权威数据源。
- 浏览器本地存储只允许保存短暂重试队列和本机凭据，不能作为跨设备收藏库。
- 不把 Token、Cookie、浏览器会话或私钥加入 Skill、压缩包或 Git 仓库。
- 国内站必须使用本地发布的数据，不让访问者依赖 GitHub Raw。
