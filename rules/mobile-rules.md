# HiveLaunch 移动端开发规则

## 1. 目标

统一移动端（iOS / Android）与 Web / Desktop 的技术实现规范，确保跨端一致性、可维护性与安全性。

## 2. 技术栈基线

| 层级 | 技术 | 版本 |
|------|------|------|
| 框架 | Tauri | 2.0 |
| 移动端运行时 | WebView (Android) / WKWebView (iOS) | 系统自带 |
| 前端语言 | TypeScript | 5.x |
| Rust 后端 | tokio + axum + sqlx | 1.x / 0.7 / 0.8 |

## 3. 目录结构

```text
apps/mobile/
├── src-tauri/           # Rust 后端（Tauri 命令）
│   ├── src/
│   │   ├── lib.rs       # 库入口
│   │   └── main.rs      # 程序入口
│   ├── capabilities/   # Tauri 权限配置
│   └── tauri.conf.json  # Tauri 配置
└── package.json         # 移动端 NPM 包配置
```

## 4. API 调用统一原则

### 4.1 业务请求必须走统一 API 层

- 移动端所有业务逻辑请求必须复用 `features/agent-execution/api/` 下的统一 API 客户端
- **禁止**在移动端代码中直接使用 `fetch` 或 `axios` 发起业务请求
- 统一 API 层处理：请求头注入、错误包装、日志、响应解析

### 4.2 示例

```ts
// ❌ 错误：直接 fetch
await fetch(resolveHttpUrl(`/api/execution-processes/${id}/stop`), {
  method: 'POST',
})

// ✅ 正确：复用统一 API
import { executionProcessesApi } from '@/features/agent-execution/api/sessions'
await executionProcessesApi.stop(id)
```

### 4.3 Tauri IPC 仅用于系统能力

- Tauri `invoke` 仅用于系统级能力：文件选择、通知、窗口控制、设备信息
- 业务数据请求**禁止**走 Tauri IPC，必须走 HTTP API

## 5. 传输层规范

### 5.1 连接模式

- **直连模式（direct）**：移动端与后端在同一局域网时，直连 `http://<backend-ip>:3847`
- ** relay 模式**：跨网络时通过 relay (`http://<relay-ip>:3848`) 加密转发

### 5.2 模式切换

- `direct` / `relay` 切换时必须触发旧连接失效并重建新连接
- 切换时需同步更新 HTTP 与 WebSocket 两类连接的端点

### 5.3 端口约定

- Rust API: `3847`
- relay: `3848`

## 6. 错误处理规范

### 6.1 统一错误类型

- 使用 `features/agent-execution/api/sessions.ts` 中定义的 `ApiError` 类
- 错误需包含：`message`、`status`、`errorData`

### 6.2 错误捕获

- 所有 API 调用必须 `try/catch`
- 捕获后统一日志前缀：`[Mobile] <功能描述> failed:`
- 用户可见错误需透出给 UI 层处理

## 7. 日志规范

### 7.1 日志前缀

- 移动端日志统一使用 `[Mobile]` 前缀
- 格式：`[Mobile] <模块> <操作>: <详情>`

### 7.2 日志内容

- 请求发起：`[Mobile] API <METHOD> <url>`
- 请求响应：`[Mobile] API <status> <url>`
- 错误发生：`[Mobile] Error <message>`

## 8. 变更要求

- 调整移动端技术选型时，必须同步更新本文件与 `tech-stack-rules.md`
- 引入新的 Tauri 插件前，需评估对跨端一致性的影响
- 移动端代码变更后需执行：`pnpm typecheck`、`pnpm lint`
