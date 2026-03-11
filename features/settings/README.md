# Settings Feature - 全局设置管理

## 目录结构

- `ui/`: 设置页面组件
  - `SettingsPage.tsx`: 设置页面主组件
  - `WorktreeSettingsSection.tsx`: Worktree 设置组件
- `lib/`: 工具函数
  - `settings-api.ts`: Tauri 命令封装

## 功能

- **Worktree 设置**
  - 分支前缀配置
  - Worktree 目录配置（全局）
  
## 相关 PRD

- F3-agent-execution.md: 5.6 节 Worktree 目录配置
- P10-settings.md: 设置页面设计
