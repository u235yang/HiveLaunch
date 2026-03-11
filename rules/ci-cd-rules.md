# HiveLaunch CI/CD 规则

## 1. 目标与范围

本规则用于统一 HiveLaunch 在 GitHub 上的持续集成（CI）与持续交付（CD）行为，覆盖以下端与产物：

- Web（Next.js）
- API（Rust HTTP Server，端口 3847）
- Desktop（Tauri）
- Mobile（Android / iOS，已预置独立移动端工作流）

## 2. 基础原则

- 所有业务变更必须通过 Pull Request 合并到 `main`，禁止直接推送到 `main`。
- CI 负责“质量验证”，CD 负责“发布交付”，两者严格分离。
- 未通过 CI 的提交不得进入发布流程。
- 所有发布必须可追溯到 Git 提交与版本标签。
- 密钥与签名材料仅通过 GitHub Secrets / Environments 管理，禁止入库。

## 3. 分支与版本策略

- `main`：生产稳定分支，仅接收来自 `dev` 的发布型 PR。
- `dev`：团队集成主线，所有功能在该分支完成集成验证。
- `feature/*`：功能分支，建议通过 git worktree 从 `dev` 拉出开发。
- `hotfix/*`：紧急修复分支，建议从 `main` 拉出，修复后回灌 `dev`。
- 版本标签使用语义化版本：`vMAJOR.MINOR.PATCH`（示例：`v0.5.2`）。

推荐流转路径：

- 日常功能：`dev -> worktree(feature/*) -> PR 到 dev -> dev PR 到 main`
- 紧急修复：`main -> worktree(hotfix/*) -> PR 到 main -> 回灌 PR 到 dev`

## 4. CI 触发规则

满足以下任一条件触发 CI：

- `pull_request` 指向 `dev` 或 `main`
- `push` 到 `dev` 或 `main`
- `workflow_dispatch` 手动触发

建议采用路径过滤，减少无效构建：

- 仅文档变更（`*.md`）可跳过重型构建。
- Web 相关路径变更时，运行 Web 校验与构建。
- `infra/tauri` 与 Rust 包变更时，运行 Rust 校验与 Desktop 构建校验。

## 5. CI 必过门禁

PR 合并前至少满足以下检查全部通过：

### 5.0 提交状态判定（必须全部满足）

一次代码变更只有在以下条件全部满足时，才视为“符合提交状态”：

- 代码评审通过：至少 1 名 reviewer 批准（Owner 文件可加严）。
- CI 门禁全绿：本文件第 5.1~5.4 的硬性检查全部通过。
- 分支最新：分支与 `main` 同步后仍能通过同样门禁，禁止“旧基线绿灯”。
- 变更可追溯：PR 描述必须包含“变更目标、风险点、验证结果”三段信息。
- 无阻断级问题：不存在 P0/P1 缺陷、构建中断、核心路径不可用。

### 5.1 Web 门禁

- `pnpm lint`
- `pnpm typecheck`
- `pnpm --filter @hivelaunch/web test:run`
- `pnpm --filter @hivelaunch/web build`

### 5.2 Rust/API 门禁

- `cargo check --manifest-path infra/tauri/Cargo.toml`
- `cargo test --manifest-path infra/tauri/Cargo.toml`
- 必要时校验 `http-server` 构建

### 5.3 Desktop 门禁（构建校验）

- `pnpm tauri build --debug` 或等价校验命令（按 CI 资源评估）
- 若签名材料缺失，至少完成无签名构建验证

### 5.4 规则红线门禁（代码规范阻断）

以下命中任一条，PR 必须阻断：

- TypeScript 出现 `as any` 或 `@ts-ignore`
- 业务代码出现 `console.log`
- Rust 业务代码出现 `unwrap()`
- 新增 UI 可见文案未国际化（未接入 `next-intl` 或既定词典）
- 新增业务组件使用硬编码颜色（如 `#hex`、`bg-white`、`text-black`、`border-gray-*`）

说明：5.4 建议通过静态扫描在 CI 中自动阻断，避免依赖人工 review 兜底。

## 6. CD 触发规则

满足以下条件之一触发 CD：

- 推送版本标签（`v*`）触发正式发布流程
- 手动触发 `workflow_dispatch` 并选择目标环境（staging / production）

不建议使用 `push main` 直接触发生产发布。

### 6.1 测试版本发布策略

- 测试版本允许从 `dev` 或 `main` 的提交产出，不要求先进入正式发布。
- 测试版本通过 `release.yml` 的 `workflow_dispatch` 触发，并填写测试标签（如 `v0.5.2-rc.1`、`v0.5.2-beta.1`）。
- 也可直接推送测试标签（匹配 `v*`）触发发布，但需保证标签与目标提交一一对应、可追溯。
- 正式版本仍建议仅从 `main` 发布，标签使用无后缀语义化版本（如 `v0.5.2`）。
- 仅需环境联调而不产出 Release 资产时，优先使用 `manual-deploy.yml`，通过 `git_ref` 指向 `dev/main` 并部署到 `staging`。

## 7. CD 发布门禁

CD 开始前必须满足：

- 对应提交在 `main` 上且 CI 全部通过
- 版本号与标签格式合法
- 目标环境审批通过（GitHub Environment Protection）
- 发布说明（Release Notes）已准备完成
- 变更回滚路径清晰（上一个稳定标签可一键回退）

## 8. 环境与权限策略

- `staging`：预发布验证环境，可手动触发
- `production`：正式发布环境，必须受审批保护
- 使用最小权限原则：
  - CI 默认只读权限
  - 发布 job 仅授予必要写权限
  - 禁止在非发布 job 中使用生产密钥

## 9. 多端落地说明

### 9.1 当前已纳入 CI/CD 主线

- Web
- API（Rust HTTP Server）
- Desktop（Tauri）

### 9.2 Mobile（Android / iOS）

移动端已通过 `mobile-ci-cd.yml` 预置 CI/CD。未接入 `apps/mobile` 时工作流自动跳过；接入后自动启用质量门禁与发布链路：

- CI：支持 React Native/Expo（Node）与 Flutter 两类质量检查
- CD：支持 Android Release 构建与 iOS Release 构建，并上传 Release 资产
- 触发：`dev/main` 的 PR/Push 做质量校验，`v*` 标签或手动触发执行移动端发布
- 产物：Android APK 与 iOS build 目录按 tag 打包归档
- 与 Web/Desktop 共享版本号策略与发布说明

## 10. 失败处理与回滚

- CI 失败：禁止合并，修复后重新触发。
- CD 失败：保留失败日志与产物信息，不覆盖上一稳定版本。
- 生产事故：通过回滚到上一个稳定标签恢复，并补充事后复盘。

### 10.1 GitHub Actions 配额/计费限制处理

- 若工作流在数秒内失败，且注解提示“account payments failed”或“spending limit needs to be increased”，按平台额度问题处理。
- 该类失败不应直接判定为仓库脚本故障，应先在组织/仓库 Billing 与 Actions 配额页面恢复可用额度。
- 额度恢复后，按顺序重跑 `CI`、`Manual Deploy`、`Release`，再判断是否存在真实流程缺陷。

## 11. 最小工作流建议

建议至少维护以下四个工作流文件：

- `ci.yml`：PR 到 `dev/main` 与 `push dev/main` 的质量门禁
- `release.yml`：标签发布流程
- `manual-deploy.yml`：手动部署到 staging / production
- `mobile-ci-cd.yml`：移动端质量校验与标签发布流程

## 12. 分支保护建议（GitHub Settings 必配）

`dev` 与 `main` 分支都建议开启保护项，确保“提交状态”被平台强约束：

- Require a pull request before merging（禁止直推）
- Require approvals（至少 1 人）
- Require status checks to pass before merging（勾选全部 CI 检查）
- Require branches to be up to date before merging
- Require conversation resolution before merging
- Include administrators（管理员同样受限）

分支保护建议差异：

- `dev`：允许接收 `feature/*` 与 `hotfix` 回灌 PR，要求 CI 全绿即可合并。
- `main`：仅允许接收来自 `dev` 的 PR，并保留环境审批与发布门禁。

建议将以下检查名设为 Required：

- `policy-guard`
- `changes`
- `web-quality`
- `rust-quality`
- `desktop-smoke`（若路径命中时执行）

## 13. `gh` 命令操作范围

为避免误操作，GitHub CLI（`gh`）在本仓库内按以下边界执行：

- 允许查询类操作：`gh pr view/list`、`gh run view/list`、`gh api` 只读查询。
- 允许协作类操作：`gh pr create`、`gh pr edit`、`gh pr comment`、`gh pr checks`。
- 允许合并类操作：仅对已完成审查结论的 PR 使用 `gh pr merge`，默认合并到 `main`，禁止绕过分支策略直接推送。
- 禁止风险类操作：禁止删除仓库、修改可见性、覆盖标签、强制改写历史等高风险仓库级命令。
- 受限场景说明：PR 作者不能用 `gh pr review --approve` 审批自己的 PR；如需合并，必须在 PR 记录中明确审查结论与风险说明。
- 审计要求：所有 `gh` 写操作应在 PR 描述或评论中留下“变更目标、风险点、验证结果”。

---

本文件是 HiveLaunch 仓库 CI/CD 执行规则基线。后续若新增移动端工程或 relay 服务发布链路，需同步更新本规则。
