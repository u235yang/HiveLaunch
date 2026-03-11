# HiveLaunch CI/CD 规则

## 1. 目标与范围

本规则用于统一 HiveLaunch 在 GitHub 上的持续集成（CI）与持续交付（CD）行为，覆盖以下端与产物：

- Web（Next.js）
- API（Rust HTTP Server，端口 3847）
- Desktop（Tauri）
- Mobile（Android / iOS，当前仓库未落地工程目录，暂不纳入第一阶段自动发布）

## 2. 基础原则

- 所有业务变更必须通过 Pull Request 合并到 `main`，禁止直接推送到 `main`。
- CI 负责“质量验证”，CD 负责“发布交付”，两者严格分离。
- 未通过 CI 的提交不得进入发布流程。
- 所有发布必须可追溯到 Git 提交与版本标签。
- 密钥与签名材料仅通过 GitHub Secrets / Environments 管理，禁止入库。

## 3. 分支与版本策略

- `main`：稳定主干，仅接收通过审查且 CI 全绿的 PR。
- `feature/*`：功能分支，开发与自测使用。
- `hotfix/*`：紧急修复分支，流程与功能分支一致，但优先级更高。
- 版本标签使用语义化版本：`vMAJOR.MINOR.PATCH`（示例：`v0.5.2`）。

## 4. CI 触发规则

满足以下任一条件触发 CI：

- `pull_request` 指向 `main`
- `push` 到 `main`
- `workflow_dispatch` 手动触发

建议采用路径过滤，减少无效构建：

- 仅文档变更（`*.md`）可跳过重型构建。
- Web 相关路径变更时，运行 Web 校验与构建。
- `infra/tauri` 与 Rust 包变更时，运行 Rust 校验与 Desktop 构建校验。

## 5. CI 必过门禁

PR 合并前至少满足以下检查全部通过：

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

## 6. CD 触发规则

满足以下条件之一触发 CD：

- 推送版本标签（`v*`）触发正式发布流程
- 手动触发 `workflow_dispatch` 并选择目标环境（staging / production）

不建议使用 `push main` 直接触发生产发布。

## 7. CD 发布门禁

CD 开始前必须满足：

- 对应提交在 `main` 上且 CI 全部通过
- 版本号与标签格式合法
- 目标环境审批通过（GitHub Environment Protection）
- 发布说明（Release Notes）已准备完成

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

当前仓库未包含 `apps/mobile`、`android`、`ios` 工程目录，因此暂不进入第一阶段自动发布。移动端接入后按以下原则补齐：

- Android：构建 APK/AAB，签名材料走 Secrets
- iOS：使用 macOS Runner，证书与描述文件走 Encrypted Secrets
- 与 Web/Desktop 共享版本号策略与发布说明

## 10. 失败处理与回滚

- CI 失败：禁止合并，修复后重新触发。
- CD 失败：保留失败日志与产物信息，不覆盖上一稳定版本。
- 生产事故：通过回滚到上一个稳定标签恢复，并补充事后复盘。

## 11. 最小工作流建议

建议至少维护以下三个工作流文件：

- `ci.yml`：PR 与 main 的质量门禁
- `release.yml`：标签发布流程
- `manual-deploy.yml`：手动部署到 staging / production

---

本文件是 HiveLaunch 仓库 CI/CD 执行规则基线。后续若新增移动端工程或 relay 服务发布链路，需同步更新本规则。
