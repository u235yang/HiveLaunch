use log::{error, info, warn};
use std::{
    path::{Path, PathBuf},
    process::Command,
};

pub struct WorktreeManager {
    git_repo_path: PathBuf,
}

impl WorktreeManager {
    pub fn new(git_repo_path: PathBuf) -> Self {
        WorktreeManager { git_repo_path }
    }

    pub fn create_worktree(&self, name: &str, branch: &str) -> Result<PathBuf, String> {
        info!(
            "Attempting to create worktree '{}' on branch '{}' in {:?}",
            name, branch, self.git_repo_path
        );
        let worktree_path = self.git_repo_path.join("..").join(name); // Worktree will be created next to the main repo

        let output = Command::new("git")
            .arg("worktree")
            .arg("add")
            .arg(&worktree_path)
            .arg(branch)
            .current_dir(&self.git_repo_path)
            .output()
            .map_err(|e| format!("Failed to execute git worktree add command: {}", e))?;

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

    pub fn remove_worktree(&self, name: &str) -> Result<(), String> {
        info!(
            "Attempting to remove worktree '{}' from {:?}",
            name, self.git_repo_path
        );
        let worktree_path = self.git_repo_path.join("..").join(name);

        if !worktree_path.exists() {
            warn!(
                "Worktree path {:?} does not exist. Skipping removal.",
                worktree_path
            );
            return Ok(());
        }

        let output = Command::new("git")
            .arg("worktree")
            .arg("remove")
            .arg(&worktree_path)
            .current_dir(&self.git_repo_path)
            .output()
            .map_err(|e| format!("Failed to execute git worktree remove command: {}", e))?;

        if output.status.success() {
            info!(
                "Successfully removed worktree at {:?}. Output: {}",
                worktree_path,
                String::from_utf8_lossy(&output.stdout)
            );
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            error!("Failed to remove worktree: {}", stderr);
            Err(format!("Failed to remove worktree: {}", stderr))
        }
    }

    pub fn get_worktree_status(&self, worktree_path: &Path) -> Result<String, String> {
        info!(
            "Attempting to get status for worktree at {:?}",
            worktree_path
        );

        let output = Command::new("git")
            .arg("status")
            .current_dir(worktree_path)
            .output()
            .map_err(|e| format!("Failed to execute git status command: {}", e))?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            info!(
                "Successfully retrieved status for worktree at {:?}. Output: {}",
                worktree_path, stdout
            );
            Ok(stdout)
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            error!(
                "Failed to get status for worktree at {:?}: {}",
                worktree_path, stderr
            );
            Err(format!("Failed to get status: {}", stderr))
        }
    }
}
