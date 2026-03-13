# HiveLaunch Windows 平台规则

## 1. 目标与范围

本规则定义 Windows 平台上的开发工作流、命令行工具使用和常见问题解决方案。适用于：

- 使用 PowerShell/CMD 执行项目命令
- GitHub CLI (gh) 在项目中的使用
- Tauri + Node.js 跨平台开发

> **前提条件**：已在 Windows 上安装并认证 gh CLI（参考 [GitHub CLI 官方文档](https://cli.github.com/manual/)）。

---

## 2. GitHub CLI (gh) 使用

### 2.1 创建 PR

PowerShell 对引号处理有特殊规则，推荐以下方式：

```powershell
# 推荐方式：使用 --body-file 避免 PowerShell 引号问题
gh pr create --base dev --title "fix(scope): 简短描述" --body-file .pr-body.md

# 避免：内联 body 可能因引号解析问题失败
gh pr create --base dev --title "标题" --body "内容"
```

### 2.2 查看 PR 状态

```powershell
# 查看 PR 详情
gh pr view <PR号>

# 查看 PR 合并状态
gh pr view <PR号> --json mergedAt,state

# 查看当前分支关联的 PR
gh pr view --web
```

### 2.3 Token 权限

确保 gh CLI token 具有以下权限：
- `repo`：完整仓库访问
- `workflow`：触发/管理 GitHub Actions

---

## 3. PowerShell 命令执行特性

### 3.1 命令连接符

```powershell
# ❌ 避免：&& 在 CMD 中有效，PowerShell 5.x 不支持
command1 && command2

# ✅ 推荐：使用分号或 PowerShell 7+ 的 &&
command1; command2
```

### 3.2 引号处理

PowerShell 对嵌套引号解析复杂：

```powershell
# ❌ 可能失败：多层嵌套引号
gh pr create --title "fix: \"quoted\" text" --body "..."

# ✅ 推荐：使用文件传递复杂内容
gh pr create --title "fix: quoted text" --body-file .pr-body.md
```

### 3.3 路径分隔符

- Windows 使用反斜杠 `\`，但 Node.js 和大多数工具接受正斜杠 `/`
- 项目配置中优先使用正斜杠以保持跨平台一致性

---

## 4. Node.js child_process 配置

### 4.1 spawn 配置（Windows 必须）

Windows 上执行复杂命令必须启用 `shell: true`：

```javascript
// ✅ Windows 兼容配置
const { spawn } = require('node:child_process')
const child = spawn('pnpm tauri dev --config infra/tauri/tauri.conf.json', {
  stdio: 'inherit',
  shell: true,  // Windows 必须，否则 EINVAL 错误
  env: { ...process.env, TAURI_APP_PATH: 'infra/tauri' }
})
child.on('exit', (code) => process.exit(code ?? 0))
```

### 4.2 环境变量设置

```javascript
// ✅ 跨平台环境变量
env: { ...process.env, TAURI_APP_PATH: 'infra/tauri' }

// ❌ 避免：Windows 不支持 inline 环境变量设置
// TAURI_APP_PATH=infra/tauri pnpm tauri dev
```

---

## 5. Tauri 配置

### 5.1 项目路径

项目 Tauri 配置位于 `infra/tauri/`：

```bash
# 开发命令
pnpm dev:desktop

# 等价于（内部已配置 TAURI_APP_PATH）
pnpm tauri dev --config infra/tauri/tauri.conf.json
```

### 5.2 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| `EINVAL` spawn 错误 | 未设置 `shell: true` | 使用 `dev:desktop` 脚本 |
| 找不到 tauri.conf.json | 路径未正确传递 | 确保 `TAURI_APP_PATH=infra/tauri` |
| PowerShell 引号解析失败 | 嵌套引号问题 | 使用 `--body-file` 传递内容 |

---

## 6. 开发工作流建议

### 6.1 分支切换

```powershell
# 保存当前工作
git stash

# 切换分支
git checkout dev

# 恢复工作
git stash pop
```

### 6.2 同步远程分支

```powershell
# 拉取最新代码
git pull origin dev

# 查看分支状态
git status
```

---

## 7. 快速参考

| 场景 | 命令 |
|------|------|
| 启动桌面开发 | `pnpm dev:desktop` |
| 创建 PR | `gh pr create --base dev --title "..." --body-file .pr-body.md` |
| 查看 PR 状态 | `gh pr view <PR号>` |
| 查看分支状态 | `git status` |
| 切换分支 | `git checkout <branch>` |
