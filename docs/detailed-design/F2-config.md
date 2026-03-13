# [R2] 蜂群配置管理需求（当前实现对齐版）

## 范围
- 项目级蜂群配置管理
- 配置写入与读取能力
- Skills 与 MCP 相关配置落地

## 功能需求
- 支持蜂群列表、绑定与切换
- 支持写入以下配置到项目目录：
  - `.opencode/oh-my-opencode.jsonc`
  - `opencode.json`
  - `CLAUDE.md`
  - `AGENTS.md`
  - `.opencode/skills/`
- 支持读取项目现有配置并回显
- 支持基础字段编辑与保存

## 合并与写入要求
- 配置写入按项目范围生效
- 配置缺失时允许部分写入，不阻塞整体流程
- Skills 目录按蜂群来源复制到项目目录

## 集成要求
- 前端模块：`features/swarm-config`
- Rust 能力：`read_project_config`、`write_swarm_config_to_project`

## 非目标
- 不包含 UI 原型、截图映射、设计过程记录
- 不包含未落地的远期配置中心功能
