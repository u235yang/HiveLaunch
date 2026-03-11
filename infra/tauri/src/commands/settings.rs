// F3: Settings Commands - 全局设置管理
// 用于管理应用全局配置，包括 worktree 目录等

use log::{error, info};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// 全局设置结构
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GlobalSettings {
    /// Git Worktree 存储根目录
    /// None 表示使用默认位置（仓库目录下的 .hive-worktrees）
    pub workspace_dir: Option<String>,
    /// 分支前缀
    pub branch_prefix: Option<String>,
    pub skills_hub_dir: Option<String>,
}

/// 获取配置文件路径
fn get_config_file_path() -> PathBuf {
    // 使用 XDG 标准配置目录
    let config_dir = if let Some(xdg) = std::env::var("XDG_CONFIG_HOME").ok() {
        PathBuf::from(xdg)
    } else if let Some(home) = dirs::home_dir() {
        home.join(".config")
    } else {
        PathBuf::from(".")
    };

    let bee_config_dir = config_dir.join("hivelaunch");

    // 确保目录存在
    if !bee_config_dir.exists() {
        let _ = fs::create_dir_all(&bee_config_dir);
    }

    bee_config_dir.join("settings.json")
}

/// 加载全局设置
pub fn load_settings() -> GlobalSettings {
    let config_path = get_config_file_path();

    if !config_path.exists() {
        return GlobalSettings::default();
    }

    match fs::read_to_string(&config_path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(e) => {
            error!("Failed to read settings file: {}", e);
            GlobalSettings::default()
        }
    }
}

/// 保存全局设置
pub fn save_settings(settings: &GlobalSettings) -> Result<(), String> {
    let config_path = get_config_file_path();

    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&config_path, content)
        .map_err(|e| format!("Failed to write settings file: {}", e))?;

    info!("Settings saved to {:?}", config_path);
    Ok(())
}

/// 获取 worktree 基础目录
///
/// 优先级:
/// 1. 全局设置中的 workspace_dir
/// 2. 默认位置
pub fn get_worktree_base_dir(global_workspace_dir: Option<&str>, project_name: &str) -> PathBuf {
    if let Some(dir) = global_workspace_dir {
        if !dir.is_empty() {
            // 用户配置了自定义目录，使用 project_name 子目录
            return PathBuf::from(dir).join(project_name);
        }
    }

    // 默认位置（在调用方传入的 repo_path 下）
    // 这个默认逻辑在实际创建 worktree 时处理
    PathBuf::new()
}

// ============ Tauri Commands ============

/// 获取全局设置
#[tauri::command]
pub fn get_global_settings() -> GlobalSettings {
    load_settings()
}

/// 保存全局设置
#[tauri::command]
pub fn save_global_settings(settings: GlobalSettings) -> Result<(), String> {
    save_settings(&settings)
}

/// 获取 worktree 目录配置
#[tauri::command]
pub fn get_workspace_dir() -> Option<String> {
    load_settings().workspace_dir
}

/// 设置 worktree 目录配置
#[tauri::command]
pub fn set_workspace_dir(dir: Option<String>) -> Result<(), String> {
    let mut settings = load_settings();
    settings.workspace_dir = dir;
    save_settings(&settings)
}
