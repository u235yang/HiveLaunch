# HiveLaunch 技术栈与架构基线规则

## 1. 目标

统一 Web / Desktop / Mobile 的技术选型与版本边界，避免跨端实现偏差与隐性升级风险。

## 2. 技术栈基线

| 层级 | 技术 | 版本 |
|------|------|------|
| 桌面端 | Tauri | v2.0 |
| 前端 | Next.js + React + TypeScript | 15.x / 19.x / 5.9.x |
| 状态 | Zustand + Immer | 5.x / 11.x |
| 表单 | React Hook Form + Zod | 7.x / 3.x |
| 样式 | Tailwind CSS + shadcn/ui | 3.4.x |
| 拖拽 | @dnd-kit | 6.x / 10.x |
| AI 对话 | @assistant-ui/react | 0.12.x |
| 图表 | Recharts | 3.x |
| 数据库 | SQLite + sqlx | 0.8 |
| Rust 异步 | tokio + axum + sqlx | 1.x / 0.7 / 0.8 |

## 3. 架构原则

- 后端常驻本机：`localhost:3847`
- 无远程业务后端：数据默认本地
- Web 端通过 rewrites 代理到 `3847`
- Desktop 端直连 `3847`
- Mobile 端默认走局域网；跨网络通过 relay(`:3848`) 做加密转发

## 4. API 与传输统一原则

- 业务逻辑统一走 HTTP API（Web / Desktop / Mobile 一致）
- Tauri IPC 仅用于系统能力（文件选择、通知、窗口控制）
- relay 只改变传输路径，不改变业务语义
- 同一会话内，HTTP 与实时流必须同源
- direct/relay 切换必须触发旧连接失效与新连接重建
- 模型发现、会话历史、运行流共享同一传输快照（mode + backend + session）

## 5. 端口约定

- Web Dev: `3000`
- Rust API: `3847`
- relay: `3848`

## 6. 变更要求

- 调整技术栈版本或架构策略时，必须同步更新本文件与对应实现。
- 引入新基础依赖前，需评估对 Web / Desktop / Mobile 三端一致性的影响。
