# HiveLaunch 编码规范规则

## 1. 目录与依赖边界

### 1.1 目录约定

```text
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
└── templates/
```

### 1.2 强制边界

- `apps/web/app` 只放页面，不写 API routes
- `packages/*` 禁止依赖 `apps/*` 与 `features/*`
- Feature 间共享能力通过 `features/shared/*`

### 1.3 Path Alias

- `@/*` → `./apps/web/*`
- `@/features/*` → `./features/*`
- `@shared/types` → `./packages/shared-types/src`
- `@shared/ui` → `./packages/shared-ui/src`

### 1.4 模板 skills 真源规则

- `templates/*/template.json` 必须声明 `skills` 字段（`string[]`）
- 模板 `skills` 是能力真源，`global_swarms.skills_json` 仅作运行期投影与缓存
- 官方蜂群初始化时必须从模板 `skills` 回填数据库
- 创建项目前后与项目写入阶段，技能同步检查基于模板声明与本机安装状态比对
- 模板未声明 `skills` 时使用空数组，禁止依赖数据库历史值推断

## 2. 语言与实现规范

- TypeScript 使用 `strict: true`，禁止 `any`
- React/Next 使用函数组件 + Hooks + App Router
- Rust 使用 `Result` + `?`，禁止 `unwrap()`

## 3. i18n 规则

- 可见文案必须国际化，禁止在 UI 组件硬编码中文/英文
- Web 端统一使用 `next-intl`（`apps/web/messages/*.json`）
- 词典 key 使用功能域命名（如 `execution.running`），禁止整句做 key
- 动态文案必须参数化插值，禁止字符串拼接造句
- 错误码、协议字段、日志前缀、接口路径、代码标识符不进词典

## 4. 主题与配色规则（Web）

- 主题切换统一使用 `html.dark`，禁止组件内自建主题状态
- 配色统一语义 token，禁止硬编码 `#hex`、`rgb()`、`hsl()`
- 优先语义类：`bg-background`、`text-foreground`、`border-border`
- 业务代码禁止直接使用固定明暗色阶类（如 `bg-white`、`text-black`、`border-gray-*`、`text-slate-*`）
- 新增或改造组件优先复用 `@shared/ui`
- 焦点样式必须可见且跨主题一致，使用 `ring` token

## 5. 命名规范

- 文件：`kebab-case`
- 组件：`PascalCase`
- 函数：`camelCase`
- 常量：`UPPER_SNAKE_CASE`

## 6. 禁止事项（命中即阻断）

- `as any` / `@ts-ignore`
- 空 `catch`
- `console.log`
- 通过删除测试来“修复”问题
- 业务逻辑通过 Tauri IPC(`invoke`) 实现
