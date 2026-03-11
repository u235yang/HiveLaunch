# Bee Platform - AI 开发规则

**语言**: 中文

---

## 文档定位

`CLAUDE.md` 是本仓库的统一工程约束，给 AI 与开发者提供同一套决策边界，目标是：
- 降低跨端实现偏差（Web / Desktop / Mobile）
- 统一 API / 传输 / 日志 / 排障策略
- 在变更前就避免已知故障模式

---

## 技术栈与架构基线

### 技术栈

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

### 架构原则

- 后端常驻本机：`localhost:3847`
- 无远程业务后端：数据默认本地
- Web 端通过 rewrites 代理到 `3847`
- Desktop 端直连 `3847`
- Mobile 端默认走局域网；跨网络通过 relay(`:3848`) 仅做加密转发

---

## 目录与依赖边界

### 目录约定

```
bee-kanban/
├── apps/
│   ├── web/              # Next.js 前端
│   │   └── app/          # 仅页面层，禁止业务 API
│   └── mobile/           # 移动端入口
├── features/
│   └── {feature}/
│       ├── ui/
│       ├── hooks/
│       └── lib/
├── infra/
│   ├── tauri/            # Rust HTTP Server (:3847)
│   └── db/
├── packages/
│   ├── shared-types/
│   └── shared-ui/
├── templates/          # 场景模板真源目录（规则见 templates/CLAUDE.md）
└── docs/
```

### 强制边界

- `apps/web/app` 只放页面，不写 API routes
- `packages/*` 禁止依赖 `apps/*` 与 `features/*`
- Feature 间共享能力通过 `features/shared/*`

### Path Alias

- `@/*` → `./apps/web/*`
- `@/features/*` → `./features/*`
- `@shared/types` → `./packages/shared-types/src`
- `@shared/ui` → `./packages/shared-ui/src`

### 模板 skills 真源规则

- `templates/*/template.json` 必须声明 `skills` 字段（`string[]`）
- 模板中的 `skills` 是能力真源；数据库中的 `global_swarms.skills_json` 仅作运行期投影与缓存
- 官方蜂群初始化时，必须从模板 `skills` 回填 `global_swarms.skills_json`
- 创建项目前后与项目写入阶段，技能同步检查必须基于模板声明与本机已安装状态对比
- 模板未声明 `skills` 时使用空数组，禁止依赖数据库历史值推断模板技能
- 新增模板或升级模板时，必须同时维护 `skills` 字段，禁止省略

---

## 编码规范与红线

### 语言规范

- TypeScript: `strict: true`，禁止 `any`
- React/Next: 函数组件 + Hooks + App Router
- Rust: `Result` + `?`，禁止 `unwrap()`

### 多语言（i18n）规范

- 可见文案必须可国际化：禁止在 UI 组件中硬编码中文/英文文案
- Web 端统一使用 `next-intl`（`apps/web/messages/*.json`）；仅过渡场景可用 `txt(zh, en)`，并需后续收敛到词典
- 词典 key 使用“功能域分组”命名（如 `execution.running`、`conversation.emptyMessage`），禁止用整句做 key
- 以 `zh-CN` 为产品文案基线，`en-US` 保持语义对齐，不做直译腔；产品术语需全局一致（如 Worktree、Agent、Scaffold）
- 动态文案必须使用参数化插值，禁止字符串拼接构造句子（例如状态、数量、错误原因）
- 以下内容不进词典：错误码、协议字段、日志前缀、接口路径、代码标识符
- 交付前必须覆盖检查：空态、按钮、Toast、标题、占位符、状态文案、Tooltip、错误提示

### 主题与配色规范（Web）

- 主题切换统一使用 `html.dark` class，禁止组件内自建主题状态
- 配色统一走语义 token，禁止直接在业务组件硬编码 `#hex`、`rgb()`、`hsl()`
- 基础 token 统一定义在 `apps/web/app/globals.css`：`background`、`foreground`、`card`、`popover`、`muted`、`accent`、`destructive`、`border`、`input`、`ring`
- 品牌色使用 `primary` 及 `primary-foreground`，状态色使用 `destructive` 等语义色，禁止新增仅某单页使用的私有颜色名
- Tailwind class 优先使用语义类：`bg-background`、`text-foreground`、`border-border`、`bg-card`、`text-muted-foreground`
- 业务代码禁止直接使用 `bg-white`、`text-black`、`border-gray-*`、`text-slate-*` 等固定明暗色阶类；仅设计稿/原型目录允许例外
- 允许使用调色阶仅限品牌色场景（如图表、渐变、强调标签），其余场景优先语义 token
- 如确需调色阶，必须同时给出 dark 对应语义与对比度校验，不得只写浅色态
- 任何浅色样式都必须有深色等价语义；禁止“hover 才可见”的颜色组合
- 对比度要求按 WCAG 2.2 AA：正文文本至少 `4.5:1`，大号文本与关键 UI 边界至少 `3:1`
- 输入框、按钮、卡片、弹层在 light/dark 下都必须同时验证：默认态、hover、focus、disabled、error
- 焦点样式必须可见且跨主题一致，使用 `ring` token，禁止移除 focus 可视反馈
- 新增或改造组件时，优先复用 `@shared/ui` 组件与其变体，不重复造轮子
- `@shared/ui` 基础组件必须默认使用语义 token（如 `bg-background`、`border-input`、`ring-offset-background`），禁止内置亮色硬编码
- 提交前必须执行暗黑回归扫描：检查是否存在新增 `bg-white|text-black|border-gray|text-slate|ring-offset-white` 等直写类
- PR 自检必须包含主题检查：浅色/深色截图或录屏、关键路径可读性、状态色可辨识、无硬编码颜色回归

### 命名规范

- 文件：`kebab-case`
- 组件：`PascalCase`
- 函数：`camelCase`
- 常量：`UPPER_SNAKE_CASE`

### 禁止事项

- `as any` / `@ts-ignore`
- 空 `catch`
- `console.log`
- 通过删除测试来“修复”问题
- 业务逻辑通过 Tauri IPC(`invoke`) 实现

---

## API 与传输规则

### 统一原则

- 业务逻辑统一走 HTTP API（Web / Desktop / Mobile 一致）
- Tauri IPC 仅用于系统能力（文件选择、通知、窗口控制）

### 传输一致性（direct / relay）

- relay 只改变传输路径，不改变业务语义
- 同一会话内，HTTP 与实时流必须同源
- 连接模式必须由统一传输层决定，业务代码禁止自行拼接 API/WS 地址
- direct/relay 切换必须触发旧连接失效与新连接重建
- 模型发现、会话历史、运行流共享同一传输快照（mode + backend + session）

### 端口约定

- Web Dev: `3000`
- Rust API: `3847`
- relay: `3848`

---

## 远程访问故障复盘规则（新增）

### 已确认根因（本次）

移动端模型加载 WebSocket 不工作，根因不是模型接口本身，而是 relay 连接阶段失败：
1. Mobile 的 `device_id` / `pairing_key` 与 Desktop 注册不一致或已过期
2. `Connect` 连续失败后触发 `RATE_LIMITED`
3. 由于会话未建立，后续模型发现 `WsOpen` 不会进入业务链路

### 强制防护规则

- 遇到以下错误视为“认证级致命错误”，必须抑制自动重连风暴：  
  `DEVICE_NOT_FOUND` / `INVALID_PAIRING_KEY` / `PAIRING_KEY_EXPIRED` / `PAIRING_COOLDOWN` / `RATE_LIMITED`
- 致命错误后，仅允许以下事件恢复重连：  
  1) 用户主动重连；2) 凭证更新（storage 变更）；3) 显式调用 connect
- 对用户侧错误文案必须可操作：明确提示“去 Desktop 重新生成配对码并同步到 Mobile”

### 日志规范（排障必备）

- relay 连接链路日志前缀：`[relay-transport]`
- 模型发现 WS 日志前缀：`[model-discovery][ws]`
- 至少记录：`connect_success / connect_failed / relay_error / ws_open_request / ws_open_ack / socket_close`
- 日志中避免输出敏感值（pairing_key、token）

### 标准排障顺序

1. 看 relay 管理面错误码分布（是否 `PAIRING_KEY_EXPIRED` / `INVALID_PAIRING_KEY`）
2. 确认 Mobile 当前凭证是否与 Desktop 最新凭证一致
3. 验证是否已建立 relay 会话（session/token）
4. 再验证模型 WS 路径是否真正发起（`/api/agents/discovered-options/ws`）
5. 最后才检查模型发现接口与后端实现

---

## 开发命令

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

## 工具使用建议

- 不确定 API 用法：优先查 Context7
- 需要仓库级知识：查 DeepWiki
- 需要社区实现与案例：查 Exa

---

## 参考文档

- `docs/多端架构方案.md`
- `docs/detailed-design/`
- `docs/remote-access-highlevel.md`
- `docs/remote-access-prd.md`
- `docs/remote-access/technology-verification.md`
- `docs/remote-access/server-admin-ui.md`
- `docs/remote-access/_tracker.md`
- `docs/troubleshooting.md`
- `templates/CLAUDE.md`
