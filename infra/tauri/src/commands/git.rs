// F3: Git Operations Commands
// Git 操作相关命令 - Push/PR/Merge/Rebase/Diff

use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

// ============ 数据类型 ============

/// 文件变更信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDiff {
    pub path: String,
    pub status: FileStatus,
    pub additions: usize,
    pub deletions: usize,
    pub diff: Option<String>,
}

/// 文件状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FileStatus {
    Added,
    Modified,
    Deleted,
    Renamed,
    Untracked,
}

/// 分支状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchStatus {
    pub commits_ahead: usize,
    pub commits_behind: usize,
    pub has_uncommitted_changes: bool,
    pub conflicted_files: Vec<String>,
    pub current_branch: String,
    pub is_rebase_in_progress: bool,
    pub is_merge_in_progress: bool,
    pub conflict_op: Option<String>,  // "rebase" | "merge" | "cherry_pick" | "revert"
    pub target_branch: String,  // 目标分支名称
}

/// Commit 信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
}

/// Push 结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushResult {
    pub success: bool,
    pub message: String,
    pub remote_url: Option<String>,
}

/// PR 信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullRequestInfo {
    pub url: String,
    pub number: Option<i32>,
    pub title: Option<String>,
}

/// Commit 结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitResult {
    pub success: bool,
    pub message: String,
    pub hash: Option<String>,
}

/// 分支信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
}

// ============ Git 操作函数 ============

/// 获取 Worktree 的文件变更
pub fn get_workspace_diff(worktree_path: &PathBuf) -> Result<Vec<FileDiff>, String> {
    info!("Getting diff for worktree: {:?}", worktree_path);

    let status_output = Command::new("git")
        .arg("status")
        .arg("--porcelain")
        .arg("--untracked-files=all")
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to run git status: {}", e))?;

    if !status_output.status.success() {
        return Err(format!(
            "git status failed: {}",
            String::from_utf8_lossy(&status_output.stderr)
        ));
    }

    let status_text = String::from_utf8_lossy(&status_output.stdout);
    let mut diffs = Vec::new();

    for line in status_text.lines() {
        let Some((file_status, path)) = parse_status_line(line) else {
            continue;
        };

        let diff = if file_status == FileStatus::Untracked {
            get_untracked_file_diff(worktree_path, &path).ok()
        } else {
            get_file_diff(worktree_path, &path).ok()
        };

        let (additions, deletions) = diff
            .as_ref()
            .map(|d| count_diff_changes(d))
            .unwrap_or((0, 0));

        diffs.push(FileDiff {
            path,
            status: file_status,
            additions,
            deletions,
            diff,
        });
    }

    Ok(diffs)
}

/// 获取单个文件的 diff
fn get_file_diff(worktree_path: &PathBuf, file_path: &str) -> Result<String, String> {
    let output = Command::new("git")
        .arg("diff")
        .arg("HEAD")
        .arg("--patch")
        .arg("--")
        .arg(file_path)
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to run git diff: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

fn get_untracked_file_diff(worktree_path: &PathBuf, file_path: &str) -> Result<String, String> {
    let null_device = if cfg!(windows) { "NUL" } else { "/dev/null" };
    let output = Command::new("git")
        .arg("diff")
        .arg("--no-index")
        .arg("--patch")
        .arg("--")
        .arg(null_device)
        .arg(file_path)
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to run git diff --no-index: {}", e))?;

    if output.status.success() || output.status.code() == Some(1) {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

fn parse_status_line(line: &str) -> Option<(FileStatus, String)> {
    if line.len() < 3 {
        return None;
    }

    let status_code = &line[..2];
    let raw_path = line[3..].trim();
    let path = if status_code.contains('R') && raw_path.contains(" -> ") {
        raw_path.split(" -> ").last()?.to_string()
    } else {
        raw_path.to_string()
    };

    if path.is_empty() {
        return None;
    }

    let mut chars = status_code.chars();
    let x = chars.next().unwrap_or(' ');
    let y = chars.next().unwrap_or(' ');
    let file_status = if x == '?' && y == '?' {
        FileStatus::Untracked
    } else if x == 'R' || y == 'R' {
        FileStatus::Renamed
    } else if x == 'D' || y == 'D' {
        FileStatus::Deleted
    } else if x == 'A' || y == 'A' {
        FileStatus::Added
    } else {
        FileStatus::Modified
    };

    Some((file_status, path))
}

/// 统计 diff 中的 additions 和 deletions
fn count_diff_changes(diff: &str) -> (usize, usize) {
    let mut additions = 0;
    let mut deletions = 0;

    for line in diff.lines() {
        if line.starts_with('+') && !line.starts_with("+++") {
            additions += 1;
        } else if line.starts_with('-') && !line.starts_with("---") {
            deletions += 1;
        }
    }

    (additions, deletions)
}

/// 获取分支状态
pub fn get_branch_status(worktree_path: &PathBuf, target_branch: &str) -> Result<BranchStatus, String> {
    info!(
        "Getting branch status for {:?} against {}",
        worktree_path, target_branch
    );

    // 获取当前分支名
    let branch_output = Command::new("git")
        .arg("branch")
        .arg("--show-current")
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to get current branch: {}", e))?;

    let current_branch = String::from_utf8_lossy(&branch_output.stdout).trim().to_string();

    // 获取 ahead commits
    let ahead_output = Command::new("git")
        .arg("rev-list")
        .arg("--count")
        .arg(format!("{}..HEAD", target_branch))
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to count ahead commits: {}", e))?;

    let commits_ahead = String::from_utf8_lossy(&ahead_output.stdout)
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

    let commits_behind = String::from_utf8_lossy(&behind_output.stdout)
        .trim()
        .parse()
        .unwrap_or(0);

    // 检查是否有未提交的更改
    let status_output = Command::new("git")
        .arg("status")
        .arg("--porcelain")
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to check uncommitted changes: {}", e))?;

    let has_uncommitted_changes = !String::from_utf8_lossy(&status_output.stdout)
        .trim()
        .is_empty();

    // 获取冲突文件
    let conflicted_files = get_conflicted_files(worktree_path)?;

    // 检查是否在 rebase 中
    let is_rebase_in_progress = worktree_path
        .join(".git")
        .join("rebase-merge")
        .exists()
        || worktree_path
            .join(".git")
            .join("rebase-apply")
            .exists();

    // 检查是否在 merge 中
    let is_merge_in_progress = worktree_path
        .join(".git")
        .join("MERGE_HEAD")
        .exists();

    // 检测冲突操作类型
    let conflict_op = detect_conflict_op(worktree_path, is_rebase_in_progress, is_merge_in_progress);

    Ok(BranchStatus {
        commits_ahead,
        commits_behind,
        has_uncommitted_changes,
        conflicted_files,
        current_branch,
        is_rebase_in_progress,
        is_merge_in_progress,
        conflict_op,
        target_branch: target_branch.to_string(),
    })
}

/// 获取冲突文件列表
fn get_conflicted_files(worktree_path: &PathBuf) -> Result<Vec<String>, String> {
    let output = Command::new("git")
        .arg("diff")
        .arg("--name-only")
        .arg("--diff-filter=U")
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to get conflicted files: {}", e))?;

    let files: Vec<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .collect();

    Ok(files)
}

/// 检测当前冲突操作类型
fn detect_conflict_op(
    worktree_path: &PathBuf,
    is_rebase_in_progress: bool,
    is_merge_in_progress: bool,
) -> Option<String> {
    // 检查 cherry-pick
    let is_cherry_pick_in_progress = worktree_path
        .join(".git")
        .join("CHERRY_PICK_HEAD")
        .exists();

    // 检查 revert
    let is_revert_in_progress = worktree_path
        .join(".git")
        .join("REVERT_HEAD")
        .exists();

    if is_rebase_in_progress {
        Some("rebase".to_string())
    } else if is_merge_in_progress {
        Some("merge".to_string())
    } else if is_cherry_pick_in_progress {
        Some("cherry_pick".to_string())
    } else if is_revert_in_progress {
        Some("revert".to_string())
    } else {
        None
    }
}

/// Push 到远程仓库
pub fn push_to_remote(worktree_path: &PathBuf, remote: &str, branch: &str) -> Result<PushResult, String> {
    info!("Pushing to {}/{} from {:?}", remote, branch, worktree_path);

    let output = Command::new("git")
        .arg("push")
        .arg(remote)
        .arg(branch)
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to run git push: {}", e))?;

    if output.status.success() {
        // 获取 remote URL
        let url_output = Command::new("git")
            .arg("remote")
            .arg("get-url")
            .arg(remote)
            .current_dir(worktree_path)
            .output()
            .ok();

        let remote_url = url_output.and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                None
            }
        });

        Ok(PushResult {
            success: true,
            message: "Push successful".to_string(),
            remote_url,
        })
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        error!("Push failed: {}", stderr);
        Ok(PushResult {
            success: false,
            message: stderr.to_string(),
            remote_url: None,
        })
    }
}

/// 创建 Pull Request (使用 gh CLI)
pub fn create_pull_request(
    worktree_path: &PathBuf,
    title: &str,
    body: Option<&str>,
    base_branch: &str,
    head_branch: &str,
) -> Result<PullRequestInfo, String> {
    info!(
        "Creating PR: {} -> {} from {:?}",
        head_branch, base_branch, worktree_path
    );

    let mut cmd = Command::new("gh");
    cmd.arg("pr")
        .arg("create")
        .arg("--title")
        .arg(title)
        .arg("--base")
        .arg(base_branch)
        .arg("--head")
        .arg(head_branch)
        .current_dir(worktree_path);

    if let Some(b) = body {
        cmd.arg("--body").arg(b);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run gh pr create: {}. Make sure gh CLI is installed.", e))?;

    if output.status.success() {
        let url = String::from_utf8_lossy(&output.stdout).trim().to_string();

        // 解析 PR 号
        let number = url
            .split('/')
            .last()
            .and_then(|s| s.parse().ok());

        Ok(PullRequestInfo {
            url,
            number,
            title: Some(title.to_string()),
        })
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to create PR: {}", stderr))
    }
}

/// Rebase 到目标分支
pub fn rebase_onto(worktree_path: &PathBuf, target_branch: &str) -> Result<(), String> {
    info!("Rebasing onto {} from {:?}", target_branch, worktree_path);

    // 先 fetch 最新的 target branch
    let fetch_output = Command::new("git")
        .arg("fetch")
        .arg("origin")
        .arg(target_branch)
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to fetch: {}", e))?;

    if !fetch_output.status.success() {
        warn!(
            "Fetch warning: {}",
            String::from_utf8_lossy(&fetch_output.stderr)
        );
    }

    // 执行 rebase
    let rebase_output = Command::new("git")
        .arg("rebase")
        .arg(format!("origin/{}", target_branch))
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to run git rebase: {}", e))?;

    if rebase_output.status.success() {
        info!("Rebase successful");
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&rebase_output.stderr);
        if stderr.contains("CONFLICT") {
            Err(format!("Rebase has conflicts. Please resolve manually.\n{}", stderr))
        } else {
            Err(format!("Rebase failed: {}", stderr))
        }
    }
}

/// 中止 Rebase
pub fn abort_rebase(worktree_path: &PathBuf) -> Result<(), String> {
    let output = Command::new("git")
        .arg("rebase")
        .arg("--abort")
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to abort rebase: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// 继续 Rebase (解决冲突后)
pub fn continue_rebase(worktree_path: &PathBuf) -> Result<(), String> {
    let output = Command::new("git")
        .arg("rebase")
        .arg("--continue")
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to continue rebase: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Merge 到目标分支
pub fn merge_branch(worktree_path: &PathBuf, target_branch: &str) -> Result<(), String> {
    info!("Merging into {} from {:?}", target_branch, worktree_path);

    let output = Command::new("git")
        .arg("merge")
        .arg("--no-ff")
        .arg(format!("origin/{}", target_branch))
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to run git merge: {}", e))?;

    if output.status.success() {
        info!("Merge successful");
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("CONFLICT") {
            Err(format!("Merge has conflicts. Please resolve manually.\n{}", stderr))
        } else {
            Err(format!("Merge failed: {}", stderr))
        }
    }
}

/// 获取最近的 commits
pub fn get_recent_commits(worktree_path: &PathBuf, count: usize) -> Result<Vec<CommitInfo>, String> {
    let output = Command::new("git")
        .arg("log")
        .arg(format!("-{}", count))
        .arg("--pretty=format:%H|%h|%s|%an|%ar")
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to get commits: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let commits: Vec<CommitInfo> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(5, '|').collect();
            if parts.len() == 5 {
                Some(CommitInfo {
                    hash: parts[0].to_string(),
                    short_hash: parts[1].to_string(),
                    message: parts[2].to_string(),
                    author: parts[3].to_string(),
                    date: parts[4].to_string(),
                })
            } else {
                None
            }
        })
        .collect();

    Ok(commits)
}

/// 提交当前变更
pub fn commit_changes(worktree_path: &PathBuf, message: &str) -> Result<CommitResult, String> {
    info!("Committing changes in {:?} with message: {}", worktree_path, message);

    // 检查是否有需要提交的变更
    let status_output = Command::new("git")
        .arg("status")
        .arg("--porcelain")
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to run git status: {}", e))?;

    if !status_output.status.success() {
        return Err(format!(
            "git status failed: {}",
            String::from_utf8_lossy(&status_output.stderr)
        ));
    }

    let has_changes = !String::from_utf8_lossy(&status_output.stdout).trim().is_empty();
    if !has_changes {
        return Ok(CommitResult {
            success: true,
            message: "No changes to commit".to_string(),
            hash: None,
        });
    }

    // git add .
    let add_output = Command::new("git")
        .arg("add")
        .arg("-A")
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to git add: {}", e))?;

    if !add_output.status.success() {
        return Err(format!(
            "git add failed: {}",
            String::from_utf8_lossy(&add_output.stderr)
        ));
    }

    // git commit -m "message"
    let commit_output = Command::new("git")
        .arg("commit")
        .arg("-m")
        .arg(message)
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to git commit: {}", e))?;

    if commit_output.status.success() {
        // 获取刚创建的 commit hash
        let hash_output = Command::new("git")
            .arg("rev-parse")
            .arg("HEAD")
            .current_dir(worktree_path)
            .output()
            .ok();

        let hash = hash_output.and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                None
            }
        });

        Ok(CommitResult {
            success: true,
            message: "Commit successful".to_string(),
            hash,
        })
    } else {
        let stderr = String::from_utf8_lossy(&commit_output.stderr);
        // 可能没有变更（already up to date）
        if stderr.contains("nothing to commit") {
            return Ok(CommitResult {
                success: true,
                message: "Nothing to commit".to_string(),
                hash: None,
            });
        }
        Err(format!("Commit failed: {}", stderr))
    }
}

/// 获取当前分支名
pub fn get_current_branch(worktree_path: &PathBuf) -> Result<String, String> {
    let output = Command::new("git")
        .arg("branch")
        .arg("--show-current")
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to get current branch: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// 列出所有分支
pub fn list_branches(worktree_path: &PathBuf) -> Result<Vec<GitBranch>, String> {
    let output = Command::new("git")
        .arg("branch")
        .arg("-a")
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to list branches: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(stderr.to_string());
    }

    // 获取当前分支
    let current = get_current_branch(worktree_path).unwrap_or_default();

    let mut branches: Vec<GitBranch> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| {
            let name = line.trim().trim_start_matches('*').trim().to_string();
            if name.is_empty() {
                return None;
            }

            let is_remote = name.starts_with("remotes/") || name.starts_with("origin/");
            let clean_name = name
                .trim_start_matches("remotes/")
                .trim_start_matches("origin/")
                .trim_start_matches("HEAD -> ")
                .to_string();

            let is_current = clean_name == current;

            Some(GitBranch {
                name: clean_name,
                is_current,
                is_remote,
            })
        })
        .collect();

    // 如果 git branch -a 没有返回任何分支，但有当前分支（可能是 bare repo 或 worktree）
    if branches.is_empty() && !current.is_empty() {
        branches.push(GitBranch {
            name: current.clone(),
            is_current: true,
            is_remote: false,
        });
    }

    Ok(branches)
}

/// Force Push 到远程仓库
pub fn force_push_to_remote(worktree_path: &PathBuf, remote: &str, branch: &str) -> Result<PushResult, String> {
    info!("Force pushing to {}/{} from {:?}", remote, branch, worktree_path);

    let output = Command::new("git")
        .arg("push")
        .arg("--force")
        .arg(remote)
        .arg(branch)
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to run git push --force: {}", e))?;

    if output.status.success() {
        // 获取 remote URL
        let url_output = Command::new("git")
            .arg("remote")
            .arg("get-url")
            .arg(remote)
            .current_dir(worktree_path)
            .output()
            .ok();

        let remote_url = url_output.and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                None
            }
        });

        Ok(PushResult {
            success: true,
            message: "Force push successful".to_string(),
            remote_url,
        })
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        error!("Force push failed: {}", stderr);
        Ok(PushResult {
            success: false,
            message: stderr.to_string(),
            remote_url: None,
        })
    }
}

/// 中止 Merge
pub fn abort_merge(worktree_path: &PathBuf) -> Result<(), String> {
    info!("Aborting merge in {:?}", worktree_path);

    let output = Command::new("git")
        .arg("merge")
        .arg("--abort")
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to abort merge: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // 如果没有 merge 在进行中，git merge --abort 会返回错误
        if stderr.contains("There is no merge to abort") {
            Ok(())
        } else {
            Err(format!("Abort merge failed: {}", stderr))
        }
    }
}

/// 检测是否在 Merge 中
pub fn is_merge_in_progress(worktree_path: &PathBuf) -> bool {
    // 检查 .git/MERGE_HEAD 是否存在
    worktree_path.join(".git").join("MERGE_HEAD").exists()
}

// ============ Tauri Commands ============

#[tauri::command]
pub async fn git_get_diff(worktree_path: String) -> Result<Vec<FileDiff>, String> {
    get_workspace_diff(&PathBuf::from(worktree_path))
}

#[tauri::command]
pub async fn git_get_branch_status(
    worktree_path: String,
    target_branch: String,
) -> Result<BranchStatus, String> {
    get_branch_status(&PathBuf::from(worktree_path), &target_branch)
}

#[tauri::command]
pub async fn git_push(
    worktree_path: String,
    remote: String,
    branch: String,
) -> Result<PushResult, String> {
    push_to_remote(&PathBuf::from(worktree_path), &remote, &branch)
}

#[tauri::command]
pub async fn git_create_pr(
    worktree_path: String,
    title: String,
    body: Option<String>,
    base_branch: String,
    head_branch: String,
) -> Result<PullRequestInfo, String> {
    create_pull_request(
        &PathBuf::from(worktree_path),
        &title,
        body.as_deref(),
        &base_branch,
        &head_branch,
    )
}

#[tauri::command]
pub async fn git_rebase(worktree_path: String, target_branch: String) -> Result<(), String> {
    rebase_onto(&PathBuf::from(worktree_path), &target_branch)
}

#[tauri::command]
pub async fn git_abort_rebase(worktree_path: String) -> Result<(), String> {
    abort_rebase(&PathBuf::from(worktree_path))
}

#[tauri::command]
pub async fn git_continue_rebase(worktree_path: String) -> Result<(), String> {
    continue_rebase(&PathBuf::from(worktree_path))
}

#[tauri::command]
pub async fn git_merge(worktree_path: String, target_branch: String) -> Result<(), String> {
    merge_branch(&PathBuf::from(worktree_path), &target_branch)
}

#[tauri::command]
pub async fn git_get_commits(worktree_path: String, count: usize) -> Result<Vec<CommitInfo>, String> {
    get_recent_commits(&PathBuf::from(worktree_path), count)
}

#[tauri::command]
pub async fn git_commit(worktree_path: String, message: String) -> Result<CommitResult, String> {
    commit_changes(&PathBuf::from(worktree_path), &message)
}

#[tauri::command]
pub async fn git_get_current_branch(worktree_path: String) -> Result<String, String> {
    get_current_branch(&PathBuf::from(worktree_path))
}

#[tauri::command]
pub async fn git_list_branches(worktree_path: String) -> Result<Vec<GitBranch>, String> {
    list_branches(&PathBuf::from(worktree_path))
}

#[tauri::command]
pub async fn git_force_push(
    worktree_path: String,
    remote: String,
    branch: String,
) -> Result<PushResult, String> {
    force_push_to_remote(&PathBuf::from(worktree_path), &remote, &branch)
}

#[tauri::command]
pub async fn git_abort_merge(worktree_path: String) -> Result<(), String> {
    abort_merge(&PathBuf::from(worktree_path))
}

#[tauri::command]
pub async fn git_is_merge_in_progress(worktree_path: String) -> Result<bool, String> {
    Ok(is_merge_in_progress(&PathBuf::from(worktree_path)))
}

/// 中止冲突 (通用 - 支持 rebase/merge/cherry-pick/revert)
pub fn abort_conflicts(worktree_path: &PathBuf) -> Result<(), String> {
    info!("Aborting conflicts in {:?}", worktree_path);

    // 检测当前冲突类型
    let is_rebase = worktree_path.join(".git").join("rebase-merge").exists()
        || worktree_path.join(".git").join("rebase-apply").exists();
    let is_merge = worktree_path.join(".git").join("MERGE_HEAD").exists();
    let is_cherry_pick = worktree_path.join(".git").join("CHERRY_PICK_HEAD").exists();
    let is_revert = worktree_path.join(".git").join("REVERT_HEAD").exists();

    if is_rebase {
        abort_rebase(worktree_path)
    } else if is_merge {
        abort_merge(worktree_path)
    } else if is_cherry_pick {
        abort_cherry_pick(worktree_path)
    } else if is_revert {
        abort_revert(worktree_path)
    } else {
        Err("No conflict operation in progress".to_string())
    }
}

/// 中止 Cherry-pick
fn abort_cherry_pick(worktree_path: &PathBuf) -> Result<(), String> {
    let output = Command::new("git")
        .arg("cherry-pick")
        .arg("--abort")
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to abort cherry-pick: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("No cherry-pick in progress") {
            Ok(())
        } else {
            Err(format!("Abort cherry-pick failed: {}", stderr))
        }
    }
}

/// 中止 Revert
fn abort_revert(worktree_path: &PathBuf) -> Result<(), String> {
    let output = Command::new("git")
        .arg("revert")
        .arg("--abort")
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to abort revert: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("No revert in progress") {
            Ok(())
        } else {
            Err(format!("Abort revert failed: {}", stderr))
        }
    }
}

/// 继续 Merge (解决冲突后)
pub fn continue_merge(worktree_path: &PathBuf) -> Result<(), String> {
    info!("Continuing merge in {:?}", worktree_path);

    // 检查是否还有未解决的冲突
    let conflicted_files = get_conflicted_files(worktree_path)?;
    if !conflicted_files.is_empty() {
        return Err(format!(
            "Please resolve all conflicts first. Conflicted files: {}",
            conflicted_files.join(", ")
        ));
    }

    // 创建合并提交
    let output = Command::new("git")
        .arg("commit")
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to continue merge: {}", e))?;

    if output.status.success() {
        info!("Merge completed successfully");
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Continue merge failed: {}", stderr))
    }
}

#[tauri::command]
pub async fn git_abort_conflicts(worktree_path: String) -> Result<(), String> {
    abort_conflicts(&PathBuf::from(worktree_path))
}

#[tauri::command]
pub async fn git_continue_merge(worktree_path: String) -> Result<(), String> {
    continue_merge(&PathBuf::from(worktree_path))
}
