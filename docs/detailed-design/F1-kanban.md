# [R1] 看板系统需求（当前实现对齐版）

## 范围
- 项目级看板任务管理
- 任务状态流转与执行联动
- 任务详情面板与执行信息展示

## 功能需求
- 支持任务新增、编辑、删除
- 支持任务状态在 `todo/inprogress/inreview/done/cancelled` 间流转
- 支持任务列表检索与项目切换
- 支持任务详情中查看执行进度与结果
- 支持在任务上下文触发执行流程

## 数据与状态要求
- 任务实体至少包含标题、描述、状态、所属项目、更新时间
- 任务状态变化需可追踪，并与执行状态保持可解释一致性
- 执行会话与任务存在关联关系

## 集成要求
- 与 `features/kanban` 模块一致
- 与 `features/agent-execution` 模块联动
- 与 worktree/Git 流程联动

## 概念定义
- `task` 指看板上的一张卡片，是任务编排与状态跟踪单元
- `workspace` 指 `task` 的执行环境容器
- `worktree` 指 `normal` 模式下 `workspace` 对应的 Git 工作目录实现
- `session` 指运行在 `workspace` 内的一次 agent 会话
- `execution_process` 指 `session` 内的一次具体执行过程

## 对齐 vibekanban 的执行模型
- 执行隔离以 `workspace/worktree` 为边界，不以 `task` 为边界
- `task` 不共享单个 `session`
- `session` 必须绑定到单一 `workspace`
- `normal` 模式下，一个正在执行的 `task` 默认对应一个主 `workspace`，该 `workspace` 对应一个独立 `worktree`
- `direct` 模式仅作为兼容模式保留，不作为默认主路径

## 关系约束
- 一个 `task` 可以存在多个 `workspace`，但任一时刻必须有且仅有一个 `active_workspace`
- 一个 `workspace` 可以存在多个 `session`，但任一时刻必须有且仅有一个 `active_session`
- 用户进入 `task` 详情时，默认恢复 `task.active_workspace -> active_session`
- 禁止通过“最新创建的 workspace 或 session”隐式决定当前上下文
- 新建 `workspace` 必须显式标记用途：`primary`、`retry`、`fork`

## 上下文继承规则
- `task` 级连续性通过 `task` 自身的摘要与活动日志承接，不通过共享 `session` 承接
- `workspace` 级连续性通过同一 `worktree` 的文件状态、分支状态和目录环境承接
- `session` 级连续性仅在同一 `workspace` 内成立
- review 后返工时，优先复用原 `workspace`，并在该 `workspace` 上恢复或新建 `session`
- 只有在明确需要分叉实现方案时，才允许创建新的 `workspace`

## normal 模式要求
- 创建 `task` 执行时，默认创建独立 `worktree`
- `workspace` 必须记录对应的 `branch`、`working_dir`、创建来源
- 新 `worktree` 创建后，应支持按白名单继承项目级规则文件
- 默认继承范围至少包括：`CLAUDE.md`、`AGENTS.md`、`opencode.json`、`.opencode/oh-my-opencode.jsonc`、`.opencode/skills/**`
- 未提交的本地项目规则不会通过 Git 自动继承，需通过显式复制策略处理

## 任务活动日志
- 系统需为每张 `task` 维护结构化活动日志，而不是仅依赖 `session` 历史
- 活动日志至少记录：开始执行、进度更新、完成、失败、发起 review、要求返工、合并完成、清理完成
- 每条活动日志应关联 `task_id`、`workspace_id`、`session_id`、摘要、时间戳
- 本地执行模式下，即使没有完整平台级 session history，也必须能从活动日志恢复任务脉络

## 生命周期要求
- 执行开始后，`task` 状态流转为 `inprogress`
- agent 自报完成后，`task` 状态先进入 `inreview`，不得直接进入 `done`
- review 通过后，方可进入 `done`
- review 不通过时，应在原 `workspace` 上继续修订，而不是隐式切换到其他 `workspace`
- 合并完成后，系统应支持显式清理 `workspace`、关闭 `session`、归档执行记录

## 设计目标
- 与 vibekanban 保持一致：`task` 负责编排，`workspace/worktree` 负责隔离，`session` 负责单次会话
- 避免同一张卡片下多个执行分支共享一个 `session`
- 避免用户进入卡片时误接到错误的 `workspace/session` 上下文
- 为后续接入 task summary 或 memory overlay 预留稳定边界

## 当前落地状态（2026-03）
### 已实现
- `tasks.active_workspace_id` 与 `tasks.active_session_id` 已落库，并参与任务详情恢复链路
- 卡片重新进入时，前端优先恢复 `task.active_workspace -> task.active_session`，不再默认依赖 `latest workspace/latest session`
- `task_activity_logs` 已落库并提供读取接口，任务详情面板可展示最近活动
- `normal` 模式创建独立 `worktree/workspace` 后，会按白名单继承项目级规则文件：
  - `CLAUDE.md`
  - `AGENTS.md`
  - `opencode.json`
  - `.opencode/oh-my-opencode.jsonc`
  - `.opencode/skills/**`
- `workspace.role` 与 `source_workspace_id` 已落库并在 UI 中展示
- `sessions.attempt_no`、`sessions.parent_session_id`、`sessions.status` 已落库
  - 新建同一 `workspace` 下的后续 `session` 时，`attempt_no` 会递增
  - 新 `session` 会通过 `parent_session_id` 指向上一个 `session`
  - 被修订替代的父 `session` 会更新为 `closed`
- `workspace cleanup` 已收敛成 archive 语义
  - 仅允许 `done/cancelled` 的卡片执行 cleanup
  - cleanup 后会将 `workspace.archived=1`
  - cleanup 目标 `workspace` 下的 `session` 会统一关闭
  - 若 cleanup 的是当前主执行线，会自动切换到其他可用 `workspace`，否则清空 active 指针
- 卡片重新进入时，默认恢复会跳过 archived `workspace`
- `session` 恢复优先选择非 `closed` 会话，只有在没有 open session 时才回退到最新历史会话
- 任务详情面板已将可执行 `workspace` 与 archived 历史分区展示，避免归档记录继续混入主执行列表
- archived 历史区已支持折叠/展开，默认折叠
- `done/cancelled` 卡片已支持批量 cleanup 当前全部 live `workspace`
- 前端已将 `workspace` 选择规则与 `session` 恢复规则抽成可测试的纯函数，避免恢复逻辑继续散落在组件/hook 内部
- `KanbanBoard` 组件测试已覆盖：
  - reopen 时恢复 `activeWorkspace`
  - `activeWorkspace` 指向 archived 记录时回退到 live workspace
  - cleanup 当前选中 `workspace` 后自动切换到下一个 live workspace
- review 后的“继续修订”已收敛为：
  - 复用原 `workspace`
  - 清空当前 `active_session`
  - 在同一 `workspace` 上创建新的 `session`
- 后端已保证同一 `task` 最终只保留一个 `primary workspace`
  - 新建新的 `primary workspace` 时，旧 `primary` 会自动降级为 `fork`
- 任务详情 UI 已展示：
  - `workspace role`
  - `source workspace`
  - `revision` 轮次（基于活动日志中的 `session_started/revision_session_started`）
- `tasks.last_attempt_summary` 与 `tasks.attempt_count` 已落库并返回前端
  - `attempt_count` 表示该卡片累计创建过多少个 `session`
  - `last_attempt_summary` 记录最近一次重要执行事件摘要
  - 当前已在任务详情顶部展示

### 已验证
- Web 前端类型检查通过：`pnpm exec tsc -p apps/web/tsconfig.json --noEmit`
- Rust 编译检查通过：`cargo check --manifest-path infra/tauri/Cargo.toml`
- 前端组件测试通过：
  - `pnpm --dir apps/web exec vitest run tests/components/TaskPanel.test.tsx`
  - `pnpm --dir apps/web exec vitest run tests/components/KanbanBoard.test.tsx`
  - `pnpm --dir apps/web exec vitest run tests/utils/workspace-selection.test.ts tests/utils/session-recovery.test.ts`
- Rust 定向测试通过：
  - `create_task_workspace_should_keep_single_primary_role`
  - `create_session_should_increment_attempt_and_link_parent_session`
  - `count_workspace_session_starts_should_include_revision_sessions`
  - `delete_workspace_should_archive_and_switch_active_workspace`
  - `delete_workspace_should_reject_non_terminal_task_status`

### 与原设计的偏差
- 当前实现同时支持两条修订路径：
  - `revision = 同 workspace 上的新 session`
  - `retry workspace = 从当前 workspace 派生的新 worktree/workspace`，`role=retry`
- 当前 `retry workspace` 入口落在 `pending` 卡片详情中，基于当前选中的 live workspace 创建
- 文档里提到 `last_attempt_summary / attempt_count / cleanup_status / execution_mode` 等字段
  - 当前只真实落地了 `active_workspace_id`、`active_session_id`、`last_attempt_summary`、`attempt_count`、`role`、`source_workspace_id`、`task_activity_logs`、`sessions.attempt_no`、`sessions.parent_session_id`、`sessions.status`
  - 其余仍属于后续阶段

### 尚未实现
- 浏览器级端到端集成测试

## 最小数据模型变更
- `tasks` 新增 `active_workspace_id`，用于显式指向当前主执行环境
- `tasks` 新增 `active_session_id`，用于显式指向当前主会话
- `tasks` 新增 `last_attempt_summary`，用于承接卡片级最近一次执行摘要
- `tasks` 新增 `attempt_count`，用于统计该卡片已发生的执行尝试次数
- `tasks` 新增 `execution_mode`，枚举值至少包括 `normal`、`direct`
- `workspaces` 新增 `role`，枚举值至少包括 `primary`、`retry`、`fork`
- `workspaces` 新增 `source_workspace_id`，用于标记该执行环境的来源
- `workspaces` 新增 `cleanup_status`，用于区分可清理、已清理、保留中
- `sessions` 新增 `attempt_no`，用于表示该 `workspace` 下的第几次会话尝试
- `sessions` 新增 `parent_session_id`，用于串联同一 `workspace` 下的修订关系
- `sessions` 新增 `status`，用于区分运行中、待 review、已关闭、失败
- 新增 `task_activity_logs` 表，字段至少包括 `id`、`task_id`、`workspace_id`、`session_id`、`event_type`、`summary`、`metadata`、`created_at`

## API 与查询约束
- 获取卡片详情时，必须同时返回 `active_workspace_id`、`active_session_id`、最近一次活动日志摘要
- 获取 `task` 的执行上下文时，默认以 `active_workspace_id` 为入口，不再以“最新创建时间”推断
- 创建 `workspace` 时，必须显式传入 `role` 与可选的 `source_workspace_id`
- 创建 `session` 时，必须显式传入 `workspace_id`，并允许可选的 `parent_session_id`
- `review -> revise` 流程必须落活动日志，且不得偷偷切换到其他 `workspace`
- 清理 `workspace` 前，必须校验关联 `task` 已进入 `done` 或 `cancelled`

## 前端改造任务
- 任务详情面板顶部增加卡片执行上下文展示：`task`、`status`、`workspace`、`branch`、`session`
- 进入卡片时，优先恢复 `active_workspace -> active_session`，不再默认选择最新 `workspace`
- 当卡片存在多个 `workspace` 时，UI 必须显式展示其 `role`，避免把 `retry/fork` 误当作主线
- 提供明确入口区分三类操作：继续当前会话、在当前 `workspace` 开新会话、创建新的 `workspace`
- 对 `review not pass` 场景提供“在原 workspace 继续修订”的固定入口
- 对已完成卡片提供显式 cleanup 操作，而不是依赖隐式清理

## 后端改造任务
- 为 `tasks/workspaces/sessions` 增加上述状态字段与索引
- 调整任务详情查询，返回 `active_workspace`、`active_session`、最近活动日志
- 调整 session 恢复逻辑，按 `task.active_workspace_id` 定位，而非按最新 `workspace/session`
- 在创建 `normal` 模式 `workspace` 时，统一经过 worktree 创建与规则文件继承流程
- 补充活动日志写入节点：执行开始、执行结束、进入 review、review 驳回、修订开始、合并完成、清理完成
- 为 cleanup 增加后端校验，避免清理仍在执行中的 `workspace`

## 实施顺序
1. 补齐 `tasks` 上的 `active_workspace_id`、`active_session_id`、`execution_mode`
2. 改造任务详情恢复逻辑，停止使用“latest workspace/latest session”作为默认恢复规则
3. 增加 `task_activity_logs`，先覆盖开始、完成、失败、review 驳回四类事件
4. 收敛 `normal` 模式为默认主路径，并补齐规则文件白名单继承
5. 在 UI 中显式展示 `workspace role` 与当前主执行线
6. 最后补 cleanup 与 archive 流程，完成生命周期闭环

## 数据库 Schema 草案
```sql
alter table tasks add column active_workspace_id text null;
alter table tasks add column active_session_id text null;
alter table tasks add column last_attempt_summary text null;
alter table tasks add column attempt_count integer not null default 0;
alter table tasks add column execution_mode text not null default 'normal';

alter table workspaces add column role text not null default 'primary';
alter table workspaces add column source_workspace_id text null;
alter table workspaces add column cleanup_status text not null default 'active';

alter table sessions add column attempt_no integer not null default 1;
alter table sessions add column parent_session_id text null;
alter table sessions add column status text not null default 'running';

create table task_activity_logs (
  id text primary key,
  task_id text not null,
  workspace_id text null,
  session_id text null,
  event_type text not null,
  summary text not null,
  metadata text null,
  created_at text not null
);

create index idx_tasks_active_workspace_id on tasks(active_workspace_id);
create index idx_tasks_active_session_id on tasks(active_session_id);
create index idx_workspaces_task_role on workspaces(task_id, role);
create index idx_sessions_workspace_attempt on sessions(workspace_id, attempt_no);
create index idx_task_activity_logs_task_created on task_activity_logs(task_id, created_at desc);
```

## 字段语义约束
- `tasks.active_workspace_id` 必须指向属于该 `task` 的 `workspace`
- `tasks.active_session_id` 必须指向属于 `active_workspace_id` 的 `session`
- `workspaces.role=primary` 表示当前主执行线；同一 `task` 同时最多存在一个主执行线
- `workspaces.role=retry` 表示基于主执行线的修订环境
- `workspaces.role=fork` 表示显式分叉出来的实验环境
- `workspaces.cleanup_status` 至少包括 `active`、`ready_for_cleanup`、`cleaned`
- `sessions.status` 至少包括 `running`、`inreview`、`closed`、`failed`
- `task_activity_logs.metadata` 用于记录文件清单、review 结论、merge 信息、cleanup 结果等结构化扩展信息

## 迁移策略
- 历史数据迁移时，为每个 `task` 选择一个已有 `workspace` 作为 `active_workspace_id`
- 选择规则应优先使用当前处于执行中的 `workspace`；若无明确执行中记录，则回退为最近活跃的 `workspace`
- `active_session_id` 迁移时优先选择 `active_workspace` 下最近一次未关闭 `session`
- 对没有 `workspace` 的历史 `task`，允许 `active_workspace_id` 为空，直到首次执行时再补齐
- 历史 `session` 默认 `attempt_no=1`
- 历史 `workspace` 默认 `role=primary`，后续由业务流转逐步纠正

## 里程碑拆分
### M1：上下文恢复收敛
- 为 `tasks` 增加 `active_workspace_id`、`active_session_id`、`execution_mode`
- 改造任务详情查询接口
- 改造前端卡片进入逻辑
- 验收标准：进入卡片时不再使用“latest workspace/latest session”作为默认恢复策略

### M2：活动日志落地
- 新增 `task_activity_logs`
- 在执行开始、完成、失败、review 驳回节点写日志
- 在任务详情面板展示最近一次尝试摘要
- 验收标准：本地执行模式下能从卡片层看到完整执行脉络摘要

### M3：normal 模式主路径化
- 将 `normal` 模式作为默认执行方式
- 在创建 `workspace` 时统一走 worktree 创建流程
- 增加规则文件白名单继承
- 验收标准：新建执行环境默认是独立 worktree，且项目规则文件可控继承

### M4：多执行线显式化
- 为 `workspace` 增加 `role`
- UI 区分 `primary`、`retry`、`fork`
- 为 review 驳回提供“原 workspace 修订”入口
- 验收标准：用户可以明确看出当前卡片在哪条执行线上继续工作

### M5：清理与归档闭环
- 增加 cleanup 状态与后端校验
- 增加显式 cleanup 操作
- 合并后归档日志与关闭会话
- 验收标准：已完成卡片可以安全清理 worktree/workspace，且保留必要执行记录

## 开发任务清单
### 后端
- 增加数据库迁移与回填脚本
- 更新 `task`/`workspace`/`session` 的 shared types
- 调整任务详情 API 返回结构
- 调整 session 恢复逻辑与创建逻辑
- 增加 task activity log 写入与读取接口
- 增加 cleanup 校验与执行接口

### 前端
- 调整 `KanbanBoard` 的任务切换与恢复逻辑
- 调整任务详情面板顶部上下文展示
- 增加 `workspace role` 标识与切换提示
- 增加“继续当前会话 / 当前 workspace 新会话 / 新建 workspace”入口
- 增加活动日志摘要展示
- 增加 cleanup 入口与状态提示

### 执行层
- 调整 `normal` 模式为默认路径
- 抽象 worktree 创建后的规则文件继承步骤
- 在 review 驳回后优先复用原 `workspace`
- 在会话结束时同步更新 `task.active_workspace_id`、`task.active_session_id`、`last_attempt_summary`

## 模块级改造映射
### 前端模块
- [KanbanBoard.tsx](/Users/nikcel/hive/apps/web/components/kanban/KanbanBoard.tsx)
  - 改造任务切换后的恢复逻辑，优先读取 `task.active_workspace_id`
  - 删除“默认选择第一个 workspace 即当前上下文”的隐式行为
  - 在卡片详情入口处区分 `primary/retry/fork`
  - 将 cleanup 操作和 review 后修订入口挂到卡片级交互中
- [TaskPanel.tsx](/Users/nikcel/hive/features/kanban/ui/TaskDetailPanel/TaskPanel.tsx)
  - 增加当前主执行线展示
  - 展示最近一次 attempt 摘要和活动日志列表
  - 展示 `workspace.role`、`branch`、`session status`
- [useTaskExecutionV2.ts](/Users/nikcel/hive/features/agent-execution/hooks/useTaskExecutionV2.ts)
  - 恢复逻辑从“按 workspace 拉最新 session”调整为“按 task.active_workspace -> active_session”
  - review 驳回后优先在原 `workspace` 上开新 `session`
  - 创建 `workspace/session` 后回写 task 主执行指针
- [workspace-creator.ts](/Users/nikcel/hive/features/agent-execution/lib/workspace-creator.ts)
  - 补齐规则文件白名单继承
  - 将 `normal` 模式创建流程收敛为默认主路径

### 后端模块
- [http_server.rs](/Users/nikcel/hive/infra/tauri/src/http_server.rs)
  - 扩展 `GET /api/tasks/:id/workspaces` 的返回结构，支持主执行线字段
  - 扩展 `POST /api/tasks/:id/workspaces`，要求接收 `role/source_workspace_id`
  - 扩展 `POST /api/sessions`，接收 `parent_session_id`
  - 调整 `get_sessions`、`session_follow_up`、任务详情相关查询逻辑，使其支持 `active_workspace_id/active_session_id`
  - 增加 `task_activity_logs` 读写接口
  - 增加 cleanup 校验接口
- [queries.ts](/Users/nikcel/hive/features/kanban/db/queries.ts)
  - 增加 task 详情聚合查询，返回主执行线与最近活动日志
  - 减少前端对“latest workspace/latest session”推断的依赖
- [index.ts](/Users/nikcel/hive/packages/shared-types/src/index.ts)
  - 为 `Task`、`Workspace`、`Session` 增加新字段定义
- [agent_manager.rs](/Users/nikcel/hive/infra/tauri/src/process/agent_manager.rs)
  - 保持 `workspace_id` 作为运行时隔离键
  - 在 process 完成后回调任务主执行线与活动日志更新链路

### 配置与规则继承模块
- [swarm_config_io.rs](/Users/nikcel/hive/infra/tauri/src/swarm_config_io.rs)
  - 复用现有项目配置写入能力
  - 为新 worktree 的规则文件复制提供可复用入口
- [opencode.rs](/Users/nikcel/hive/packages/bee-executor/src/executors/opencode.rs)
  - 保持基于当前工作目录读取 `opencode.json`
  - 配合 worktree 继承策略验证规则文件是否已落到目标目录

## 分阶段代码任务
### Phase 1：主执行线指针
- 修改 shared types
- 修改数据库迁移
- 修改任务详情查询与返回结构
- 修改 `KanbanBoard` 恢复逻辑

### Phase 2：活动日志与 attempt 语义
- 增加 `task_activity_logs`
- 在 `useTaskExecutionV2`、`http_server.rs` 写关键事件
- 在 `TaskPanel` 展示最近 attempt 摘要

### Phase 3：normal 模式收敛
- 修改 `workspace-creator.ts`
- 修改相关 API 入参
- 增加规则白名单复制
- 增加 worktree 失败后的降级与提示

### Phase 4：review/retry/fork 生命周期
- 增加 `workspace.role`
- 在 UI 增加三类入口
- 在后端增加 role/source 校验
- 在 review 驳回时固定走原 `workspace`

### Phase 5：cleanup 与归档
- 增加 cleanup 状态
- 增加 cleanup API 和前端入口
- 完成后的会话关闭、日志归档、worktree 清理

## 测试建议
- 单元测试：验证 `task.active_workspace_id` 与 `active_session_id` 的恢复优先级
- 单元测试：验证 `workspace.role` 的约束逻辑与状态流转
- 集成测试：创建 task -> 创建 workspace -> 创建 session -> review 驳回 -> 在原 workspace 修订
- 集成测试：创建 fork workspace 后，进入卡片默认仍恢复 primary workspace
- 集成测试：cleanup 仅对 `done/cancelled` 卡片开放
- 回归测试：`direct` 模式在兼容保留期内仍能完成基本执行流程

## Phase 1 Patch Plan
### 目标
- 建立 `task -> active_workspace -> active_session` 的主恢复链路
- 停止依赖“最新 workspace/latest session”推断当前上下文
- 不在 Phase 1 处理活动日志、retry/fork、cleanup，仅完成主执行线收敛

### 代码改动范围
- [index.ts](/Users/nikcel/hive/packages/shared-types/src/index.ts)
- [http_server.rs](/Users/nikcel/hive/infra/tauri/src/http_server.rs)
- [KanbanBoard.tsx](/Users/nikcel/hive/apps/web/components/kanban/KanbanBoard.tsx)
- [useTaskExecutionV2.ts](/Users/nikcel/hive/features/agent-execution/hooks/useTaskExecutionV2.ts)
- 任务详情相关查询与返回结构所在模块

### Step 1：扩展 shared types
- 在 `Task` 中新增：
  - `active_workspace_id?: string`
  - `active_session_id?: string`
  - `execution_mode?: 'normal' | 'direct'`
- 在 `Workspace` 中预留：
  - `role?: 'primary' | 'retry' | 'fork'`
- 在 `Session` 中预留：
  - `status?: 'running' | 'inreview' | 'closed' | 'failed'`

### Step 2：补任务详情返回字段
- 当前任务详情接口返回内容需补上：
  - `active_workspace_id`
  - `active_session_id`
  - `task_type/execution_mode`
- 若当前接口尚未统一提供这些字段，Phase 1 可接受新增一个“任务执行上下文”查询返回最小集合：
  - `task_id`
  - `active_workspace_id`
  - `active_session_id`
  - `task_type`

### Step 3：后端创建链路回写主执行指针
- 在创建 `workspace` 成功后：
  - 若该 `task` 当前没有 `active_workspace_id`，则自动回写为新 `workspace`
- 在创建 `session` 成功后：
  - 将所属 `task.active_session_id` 回写为新 `session`
  - 若该 `session` 的 `workspace` 不是当前主 `workspace`，则同时更新 `active_workspace_id`
- 回写必须是显式的数据库更新，不依赖前端本地状态

### Step 4：前端进入卡片时按主执行线恢复
- `KanbanBoard` 进入卡片时：
  - 先获取当前 `task.active_workspace_id`
  - 仅当该值为空时，才退回到“展示 workspace 列表但不自动认定主线”
- `selectedWorkspaceId` 的默认值改为：
  - `task.active_workspace_id`
  - 而不是 `workspaceInfos[0].id`

### Step 5：`useTaskExecutionV2` 恢复逻辑改造
- 当前逻辑是：
  - 传入 `initialWorkspaceId`
  - 拉该 workspace 的 sessions
  - 取最新 session
- Phase 1 改为：
  - 若已提供 `task.active_session_id`，优先直接恢复该 session
  - 若仅有 `task.active_workspace_id`，再在该 workspace 下找最近可用 session
  - 若两者都无，保持未初始化状态，等待首次执行
- 该改造要求 `useTaskExecutionV2` 新增参数：
  - `activeSessionId?: string`

### Step 6：兼容回退策略
- 当历史 `task` 没有 `active_workspace_id` 时：
  - 允许前端继续展示 workspace 列表
  - 但界面应标记“未设置主执行线”
- 当 `active_workspace_id` 指向无效记录时：
  - 前端不应 silently 回退到最新 workspace
  - 应改为显示错误或提示用户选择一个 workspace 作为主线

## Phase 1 API 契约草案
### Task DTO
```ts
interface Task {
  id: string
  project_id: string
  title: string | null
  description: string
  status: TaskStatus
  task_type: TaskType
  active_workspace_id?: string
  active_session_id?: string
  execution_mode?: 'normal' | 'direct'
  created_at: string
  updated_at: string
}
```

### Workspace 创建请求
```ts
interface CreateTaskWorkspaceRequest {
  workspace_id?: string
  branch?: string
  base_branch?: string
  agent_working_dir?: string
  setup_completed_at?: string
  agent_cli?: string
  role?: 'primary' | 'retry' | 'fork'
  source_workspace_id?: string
}
```

### useTaskExecutionV2 入参
```ts
interface UseTaskExecutionV2Options {
  taskId?: string
  workspaceId?: string
  activeSessionId?: string
  taskType?: 'normal' | 'direct'
  ...
}
```

## Phase 1 实现检查点
- `Task` 类型变更后，前端编译通过
- 新建卡片首次执行时，`active_workspace_id` 与 `active_session_id` 会被持久化
- 再次打开同一卡片时，前端默认恢复到上次主执行线
- 删除或损坏主执行线记录时，前端不会静默跳到其他 workspace

## Phase 1 回归点
- `direct` 模式首次执行仍可正常创建并恢复会话
- 没有任何历史 workspace 的新卡片不受影响
- 老数据卡片在未迁移 `active_workspace_id` 时不会导致页面崩溃
- 当前依赖 `sessionsApi.getByWorkspace()` 的路径仍可作为降级逻辑存在

## 验收清单
- 同一张卡片再次打开时，默认进入上次主执行线，而不是任意最新 `workspace`
- 同一 `workspace` 下多次修订不会与其他 `workspace` 混淆
- 新建分叉执行环境时，UI 能明确显示其不是主线
- `normal` 模式下默认使用独立 worktree
- 本地执行即使没有完整 session history，也能通过活动日志还原最近执行情况
- review 驳回后继续修订时，不会隐式切换到其他 `workspace`
- 完成后的 cleanup 不会误删仍在执行中的 `workspace`

## 方案取舍
- 不采用“同一 `task` 下共享单个 `session`”方案，因为一张卡片可以存在多个 `workspace`，共享 `session` 会把不同执行环境的上下文混在一起
- 不采用“进入卡片时总是恢复最新 `workspace/session`”方案，因为该方案对用户不可预测，容易误接到错误执行线
- 采用“`task` 维护主执行指针，`workspace` 负责隔离，`session` 绑定 `workspace`”方案，因为它与 vibekanban 的工作模型一致，也与 Hive 现有运行时结构兼容
- 保留 `direct` 模式而不是立即删除，是为了避免一次性破坏现有依赖该模式的流程；但产品语义上不再将其作为默认主路径

## 风险与缓解
- 风险：历史数据迁移后，部分 `task` 可能被错误绑定到次要 `workspace`
- 缓解：迁移阶段增加校验脚本，并在 UI 中允许人工切换主执行线
- 风险：`normal` 模式默认化后，worktree 创建失败会影响执行成功率
- 缓解：保留 `direct` 作为降级路径，并增加 worktree 创建失败提示与重试机制
- 风险：规则文件白名单复制可能把不该继承的本地配置带入新环境
- 缓解：默认采用显式白名单，不做目录级无差别复制
- 风险：活动日志若写入不全，会导致 task 级脉络断裂
- 缓解：先覆盖关键状态节点，再补充细粒度事件；缺少日志时回退显示最近 session/process 摘要
- 风险：cleanup 入口若校验不足，可能误清理仍需保留的执行环境
- 缓解：cleanup 必须走后端状态校验，且默认仅对 `done/cancelled` 卡片开放

## 回滚策略
- 若 `active_workspace_id` / `active_session_id` 逻辑上线后出现恢复异常，可临时回退为“按 workspace 查询并人工选择”的保守模式
- 若 `normal` 模式默认化导致 worktree 失败率过高，可短期恢复 `direct` 为默认，同时保留新字段与活动日志结构
- 若 `task_activity_logs` 写入链路不稳定，可先保留表结构，仅在关键节点写入最小日志，不阻塞主执行流程
- 所有新增字段应保持向后兼容，允许旧查询在未使用新字段时继续工作

## 开放问题
- `task` 下是否要严格限制只能有一个 `primary workspace`，还是允许历史上存在多个 `primary` 并在读取时修正
- `review 驳回` 后默认是复用同一 `session` 还是创建新的修订 `session`
- `direct` 模式是否允许进入 `inreview/done` 的完整生命周期，还是仅保留为快速调试模式
- 活动日志的 `metadata` 是否需要尽快结构化为独立字段，而不是先存 JSON 文本
- 规则文件白名单是否需要项目级可配置，而不是写死全局默认值
- cleanup 后是否要保留 `workspace` 元数据记录，还是彻底软删除/硬删除

## 评审重点
- 是否同意将 `task` 明确定义为“看板卡片”，而非更高层项目或更低层 session
- 是否同意以 `workspace/worktree` 作为执行隔离主边界
- 是否同意停止使用“latest workspace/latest session”作为默认恢复规则
- 是否同意将 `normal` 模式提升为默认执行路径
- 是否同意以 `task_activity_logs` 承担 task 级历史脉络，而不是让 `session` 直接承担卡片级历史

## 非目标
- 不定义 UI 样式与页面视觉细节
- 不包含设计稿路径、截图资源、UI 回填描述
