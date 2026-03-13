# [R0] HiveLaunch 需求总览（当前实现基线）

## 文档目标
- 仅保留已落地功能需求
- 移除设计稿、UI 图和原型描述
- 将需求表述与当前仓库实现保持一致

## 产品定位
HiveLaunch 是本地优先的 AI 开发工具，核心能力为看板执行、蜂群配置、远程访问与项目创建流程。

## 当前实现范围

### [R1] 看板与任务执行
- 项目看板支持任务增删改查与状态流转（`todo`、`inprogress`、`inreview`、`done`、`cancelled`）
- 任务支持触发执行、查看执行日志、发送 Follow-up
- 执行流程与 worktree / Git 操作联动

### [R2] 蜂群配置管理
- 支持蜂群列表、项目绑定、配置回显
- 支持将 `CLAUDE.md`、`AGENTS.md`、`opencode.json`、`.opencode/oh-my-opencode.jsonc` 写入项目
- 支持将技能同步到项目 `.opencode/skills/`

### [R3] 执行器与运行时
- 支持多执行器可用性探测与选择
- 支持执行过程流式日志与工具调用事件展示
- 支持执行中断与执行后续操作链路

### [R4] 项目创建与脚手架现状
- `/projects/new` 已支持项目创建主流程，并可应用蜂群能力
- `/scaffold` 页面当前为占位页（文案提示开发中）
- 模板注册表当前仅包含 Expo 模板基线，其他模板未纳入当前交付承诺

### [R6] Token 用量现状
- `/token-usage` 路由已存在
- 当前页面展示占位统计卡片（默认值为 0）与开发中文案
- 尚未形成真实统计数据链路与明细查询能力

### [R10] 设置模块
- 设置页已包含远程访问、Skills、蜂群配置、工作区相关入口
- 远程访问支持启停、配对信息展示、直连/Relay 切换与连通性测试

### [R12] OpenCode 配置可视化现状
- 已在蜂群预览中提供只读可视化配置预览能力
- 项目创建与项目设置页支持配置文本编辑与应用
- 尚未提供独立的“配置可视化编辑器页面”产品入口

## 不纳入当前基线
- 组织/成员/权限等团队协作能力
- 未实现的模板类型与自动初始化流程
- 仅用于设计过程的视觉/原型文档

## 验收基线
- Web 路由存在：`/projects`、`/projects/new`、`/settings`、`/scaffold`、`/token-usage`
- `features` 模块存在：`kanban`、`swarm-config`、`agent-execution`、`scaffold`、`settings`、`token-usage`
- Rust HTTP 服务存在任务执行、配置写入、远程访问等 API 端点
