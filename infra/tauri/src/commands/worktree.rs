// F3: Worktree Commands - Git Worktree 管理
// 用于创建和管理隔离的工作空间

use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::commands::settings::load_settings;

/// Worktree 创建结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeInfo {
    pub id: String,
    pub path: String,
    pub branch: String,
    pub base_branch: Option<String>,  // 目标分支（用户选择的分支）
}

/// 创建 git worktree 的参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateWorktreeRequest {
    pub repo_path: String,
    pub branch: String,
    pub base_branch: Option<String>,
    /// 自定义 worktree 目录（可选，覆盖全局设置）
    pub workspace_dir: Option<String>,
}

/// Worktree 管理器
pub struct WorktreeManager {
    /// Git 仓库路径
    git_repo_path: PathBuf,
    /// 自定义 worktree 目录（可选）
    /// 如果为 None，则使用默认的 <repo>/.hive-worktrees/
    custom_worktree_dir: Option<PathBuf>,
}

impl WorktreeManager {
    /// 创建 WorktreeManager
    /// 
    /// # Arguments
    /// * `git_repo_path` - Git 仓库根目录
    /// * `custom_worktree_dir` - 可选的自定义 worktree 目录
    pub fn new(git_repo_path: PathBuf, custom_worktree_dir: Option<PathBuf>) -> Self {
        WorktreeManager { 
            git_repo_path,
            custom_worktree_dir,
        }
    }

    /// 根据全局设置创建 WorktreeManager
    pub fn new_with_global_settings(git_repo_path: PathBuf) -> Self {
        // 读取全局设置
        let settings = load_settings();
        
        // 如果全局设置了 worktree 目录，则使用它
        let custom_dir = settings.workspace_dir.map(PathBuf::from);
        
        Self::new(git_repo_path, custom_dir)
    }
    
    /// 获取 worktree 基础目录
    /// 
    /// 优先级:
    /// 1. 自定义目录（传入的参数）+ project_name 子目录
    /// 2. 全局设置中的 workspace_dir + project_name 子目录
    /// 3. 默认: <repo_path>/.hive-worktrees/
    fn get_worktrees_base_dir(&self, project_name: &str) -> PathBuf {
        if let Some(ref dir) = self.custom_worktree_dir {
            // 拼接 project_name 作为子目录，与 settings.rs 保持一致
            return dir.join(project_name);
        }
        
        // 默认使用仓库目录下的 .hive-worktrees
        self.git_repo_path.join(".hive-worktrees")
    }

    /// 创建新的 worktree
    /// 
    /// # Arguments
    /// * `name` - worktree 目录名
    /// * `branch` - 分支名（如果不存在会自动创建）
    /// * `base_branch` - 基于哪个分支创建（可选）
    pub fn create_worktree(
        &self,
        name: &str,
        branch: &str,
        base_branch: Option<&str>,
    ) -> Result<PathBuf, String> {
        info!(
            "Creating worktree '{}' on branch '{}' (base: {:?}) in {:?}",
            name, branch, base_branch, self.git_repo_path
        );

        // 验证仓库路径存在
        if !self.git_repo_path.exists() {
            return Err(format!("Repository path does not exist: {:?}", self.git_repo_path));
        }

        // 获取 worktree 基础目录
        let worktrees_dir = self.get_worktrees_base_dir(name);
        
        if !worktrees_dir.exists() {
            std::fs::create_dir_all(&worktrees_dir)
                .map_err(|e| format!("Failed to create worktrees directory: {}", e))?;
        }
        let worktree_path = worktrees_dir.join(name);

        // 检查 worktree 是否已存在
        if worktree_path.exists() {
            return Err(format!("Worktree already exists: {:?}", worktree_path));
        }

        // 构建命令
        let mut cmd = Command::new("git");
        cmd.arg("worktree").arg("add");

        // 如果指定了 base_branch，先检查分支是否存在
        let branch_exists = self.branch_exists(branch)?;
        
        if !branch_exists {
            // 分支不存在，基于 base 创建新分支
            cmd.arg("-b").arg(branch);
        }
        
        // 添加 worktree 路径
        cmd.arg(&worktree_path);
        
        // 如果是基于某个分支创建，且新分支不存在，使用 base 作为起点
        if !branch_exists {
            if let Some(base) = base_branch {
                if base != "HEAD" {
                    cmd.arg(base);
                }
            }
        }

        cmd.current_dir(&self.git_repo_path);

        let output = cmd
            .output()
            .map_err(|e| format!("Failed to execute git worktree add: {}", e))?;

        if output.status.success() {
            info!(
                "Successfully created worktree at {:?} for branch {}. Output: {}",
                worktree_path,
                branch,
                String::from_utf8_lossy(&output.stdout)
            );
            Ok(worktree_path)
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            error!("Failed to create worktree: {}", stderr);
            Err(format!("Failed to create worktree: {}", stderr))
        }
    }

    /// 删除 worktree
    pub fn remove_worktree(&self, name: &str) -> Result<(), String> {
        info!("Removing worktree '{}' from {:?}", name, self.git_repo_path);

        // 获取 worktree 基础目录
        let worktrees_dir = self.get_worktrees_base_dir(name);
        let worktree_path = worktrees_dir.join(name);

        if !worktree_path.exists() {
            warn!("Worktree path {:?} does not exist. Skipping removal.", worktree_path);
            return Ok(());
        }

        let output = Command::new("git")
            .arg("worktree")
            .arg("remove")
            .arg("--force") // 强制删除，即使有未提交的更改
            .arg(&worktree_path)
            .current_dir(&self.git_repo_path)
            .output()
            .map_err(|e| format!("Failed to execute git worktree remove: {}", e))?;

        if output.status.success() {
            info!(
                "Successfully removed worktree at {:?}. Output: {}",
                worktree_path,
                String::from_utf8_lossy(&output.stdout)
            );

            // 尝试删除空目录
            if let Err(e) = std::fs::remove_dir(&worktree_path) {
                warn!("Failed to remove worktree directory (may not be empty): {}", e);
            }

            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            error!("Failed to remove worktree: {}", stderr);
            Err(format!("Failed to remove worktree: {}", stderr))
        }
    }

    /// 获取 worktree 状态
    pub fn get_worktree_status(&self, worktree_path: &Path) -> Result<WorktreeStatus, String> {
        info!("Getting status for worktree at {:?}", worktree_path);

        let output = Command::new("git")
            .arg("status")
            .arg("--porcelain") // 机器可读格式
            .current_dir(worktree_path)
            .output()
            .map_err(|e| format!("Failed to execute git status: {}", e))?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let has_changes = !stdout.trim().is_empty();

            Ok(WorktreeStatus {
                has_uncommitted_changes: has_changes,
                files_changed: stdout.lines().count(),
            })
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            error!("Failed to get status: {}", stderr);
            Err(format!("Failed to get status: {}", stderr))
        }
    }

    /// 获取分支与目标分支的差异统计
    pub fn get_branch_diff_stats(
        &self,
        worktree_path: &Path,
        target_branch: &str,
    ) -> Result<BranchDiffStats, String> {
        // 获取 ahead commits
        let ahead_output = Command::new("git")
            .arg("rev-list")
            .arg("--count")
            .arg(format!("{}..HEAD", target_branch))
            .current_dir(worktree_path)
            .output()
            .map_err(|e| format!("Failed to count ahead commits: {}", e))?;

        let ahead = String::from_utf8_lossy(&ahead_output.stdout)
            .trim()
            .parse()
            .unwrap_or(0);

        // 获取 behind commits
        let behind_output = Command::new("git")
            .arg("rev-list")
            .arg("--count")
            .arg(format!("HEAD..{}", target_branch))
            .current_dir(worktree_path)
            .output()
            .map_err(|e| format!("Failed to count behind commits: {}", e))?;

        let behind = String::from_utf8_lossy(&behind_output.stdout)
            .trim()
            .parse()
            .unwrap_or(0);

        Ok(BranchDiffStats {
            commits_ahead: ahead,
            commits_behind: behind,
        })
    }

    /// 检查分支是否存在
    fn branch_exists(&self, branch: &str) -> Result<bool, String> {
        let output = Command::new("git")
            .arg("branch")
            .arg("--list")
            .arg(branch)
            .current_dir(&self.git_repo_path)
            .output()
            .map_err(|e| format!("Failed to check branch existence: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(!stdout.trim().is_empty())
    }

    /// 列出所有 worktrees
    pub fn list_worktrees(&self) -> Result<Vec<WorktreeEntry>, String> {
        let output = Command::new("git")
            .arg("worktree")
            .arg("list")
            .arg("--porcelain")
            .current_dir(&self.git_repo_path)
            .output()
            .map_err(|e| format!("Failed to list worktrees: {}", e))?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            parse_worktree_list(&stdout)
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("Failed to list worktrees: {}", stderr))
        }
    }
}

/// Worktree 状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeStatus {
    pub has_uncommitted_changes: bool,
    pub files_changed: usize,
}

/// 分支差异统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchDiffStats {
    pub commits_ahead: usize,
    pub commits_behind: usize,
}

/// Worktree 条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeEntry {
    pub path: String,
    pub commit: String,
    pub branch: Option<String>,
}

/// 解析 worktree list 输出
fn parse_worktree_list(output: &str) -> Result<Vec<WorktreeEntry>, String> {
    let mut entries = Vec::new();
    let mut current_entry: Option<WorktreeEntry> = None;

    for line in output.lines() {
        if line.starts_with("worktree ") {
            if let Some(entry) = current_entry.take() {
                entries.push(entry);
            }
            current_entry = Some(WorktreeEntry {
                path: line.strip_prefix("worktree ").unwrap_or("").to_string(),
                commit: String::new(),
                branch: None,
            });
        } else if line.starts_with("HEAD ") && current_entry.is_some() {
            if let Some(ref mut entry) = current_entry {
                entry.commit = line.strip_prefix("HEAD ").unwrap_or("").to_string();
            }
        } else if line.starts_with("branch ") && current_entry.is_some() {
            if let Some(ref mut entry) = current_entry {
                entry.branch = Some(line.strip_prefix("branch ").unwrap_or("").to_string());
            }
        }
    }

    if let Some(entry) = current_entry {
        entries.push(entry);
    }

    Ok(entries)
}

// ============ Tauri Commands ============

/// 创建 git worktree
#[tauri::command]
pub async fn create_git_worktree(
    repo_path: String,
    branch: String,
    base_branch: Option<String>,
    // 自定义 worktree 目录（可选，覆盖全局设置）
    workspace_dir: Option<String>,
) -> Result<WorktreeInfo, String> {
    let custom_dir = workspace_dir.map(PathBuf::from);
    let manager = WorktreeManager::new(PathBuf::from(&repo_path), custom_dir);

    // 生成唯一的 worktree 名称
    let name = format!("ws-{}", uuid::Uuid::new_v4().to_string().split('-').next().unwrap());

    let worktree_path = manager.create_worktree(&name, &branch, base_branch.as_deref())?;

    Ok(WorktreeInfo {
        id: name,
        path: worktree_path.to_string_lossy().to_string(),
        branch,
        base_branch: base_branch,
    })
}

/// 删除 git worktree
#[tauri::command]
pub async fn remove_git_worktree(
    repo_path: String, 
    name: String,
    // 自定义 worktree 目录（可选，覆盖全局设置）
    workspace_dir: Option<String>,
) -> Result<(), String> {
    let custom_dir = workspace_dir.map(PathBuf::from);
    let manager = WorktreeManager::new(PathBuf::from(&repo_path), custom_dir);
    manager.remove_worktree(&name)
}

/// 获取 worktree 状态
#[tauri::command]
pub async fn get_worktree_status(
    repo_path: String,
    worktree_path: String,
) -> Result<WorktreeStatus, String> {
    // 不需要自定义目录，因为 worktree_path 已经直接指定
    let manager = WorktreeManager::new(PathBuf::from(&repo_path), None);
    manager.get_worktree_status(Path::new(&worktree_path))
}

/// 获取分支差异统计
#[tauri::command]
pub async fn get_branch_diff_stats(
    repo_path: String,
    worktree_path: String,
    target_branch: String,
) -> Result<BranchDiffStats, String> {
    let manager = WorktreeManager::new(PathBuf::from(&repo_path), None);
    manager.get_branch_diff_stats(Path::new(&worktree_path), &target_branch)
}

/// 列出所有 worktrees
#[tauri::command]
pub async fn list_git_worktrees(repo_path: String) -> Result<Vec<WorktreeEntry>, String> {
    let manager = WorktreeManager::new(PathBuf::from(&repo_path), None);
    manager.list_worktrees()
}
