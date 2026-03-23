# Bee Platform - AI 开发规则（索引）

**语言**: 中文

---

## 文档定位

`AGENTS.md` 只保留最重要、最高优先级的决策边界。  
详细规则统一放在 `rules/`，按问题类型按需加载。

---

## 最高优先级红线

- 禁止直推 `main`，所有业务改动必须通过 PR。
- 禁止 `as any`、`@ts-ignore`、空 `catch`、`console.log`、Rust `unwrap()`。
- 可见文案必须国际化，禁止硬编码中英文文案。
- 业务代码统一走 HTTP API；Tauri IPC 仅用于系统能力。
- 业务组件禁止硬编码颜色，统一使用语义 token。

---

## 引用章节（规则索引）

### 遇到什么问题，去看哪个规则文件

| 问题类型 | 规则文件 |
|---|---|
| 技术栈版本、端口、跨端架构、传输一致性 | [`rules/tech-stack-rules.md`](./rules/tech-stack-rules.md) |
| 移动端开发规范（API 调用统一、Tauri IPC 使用、传输层） | [`rules/mobile-rules.md`](./rules/mobile-rules.md) |
| 目录边界、编码规范、i18n、主题配色、命名与禁用项 | [`rules/coding-rules.md`](./rules/coding-rules.md) |
| PR 流程、分支策略、CI/CD 门禁、发布与回滚 | [`rules/ci-cd-rules.md`](./rules/ci-cd-rules.md) |
| 远程访问故障、relay 认证错误、日志与排障路径 | [`rules/remote-access-rules.md`](./rules/remote-access-rules.md) |
| 模板体系专项规则 | [`templates/AGENTS.md`](./templates/AGENTS.md) |

---

## 贡献与交付最低要求

- 变更前先命中索引文件，按对应规则实现。
- 提交前至少执行：`pnpm lint`、`pnpm typecheck`。
- PR 描述必须包含：变更目标、风险点、验证结果。
- 合并前确保 CI 全绿，且分支与目标分支保持最新。

---

## 常用命令

```bash
pnpm dev:web
pnpm dev:rust
pnpm dev
pnpm build
pnpm tauri build
pnpm lint
pnpm typecheck
```

---

## 参考文档

- `docs/多端架构方案.md`
- `docs/detailed-design/`
- `docs/remote-access-highlevel.md`
- `docs/remote-access-prd.md`
- `docs/remote-access/technology-verification.md`
- `docs/remote-access/connection-modes.md`
