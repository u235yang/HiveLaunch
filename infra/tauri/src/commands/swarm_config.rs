// F2: Swarm Config Commands - 蜂群配置写入
// 将蜂群配置写入项目目录（种子模式）
// 复制后配置归项目所有，与蜂群完全解耦

use log::info;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

// 导入共享的 I/O 模块（包含类型定义和函数）
use crate::swarm_config_io::{WriteSwarmConfigRequest, WriteSwarmConfigResult, write_swarm_config_to_project as write_swarm_config_io};

// ========== 写入配置 ==========

/// 将蜂群配置写入项目目录
///
/// 种子模式：配置复制后归项目所有
/// - 写入 .opencode/oh-my-opencode.jsonc
/// - 写入 opencode.json（项目根目录）
/// - 写入 CLAUDE.md（根目录）
/// - 写入 AGENTS.md（根目录，可选）
/// - 复制 skills/ 目录
#[tauri::command]
pub async fn write_swarm_config_to_project(
    request: WriteSwarmConfigRequest,
) -> Result<WriteSwarmConfigResult, String> {
    // 直接调用共享的 I/O 模块
    write_swarm_config_io(&request)
}

// ========== 读取配置 ==========

/// 项目配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectConfig {
    pub oh_my_opencode_json: Option<String>,
    pub opencode_json: Option<String>,
    pub claude_md: Option<String>,
    pub agents_md: Option<String>,
    pub skills: Vec<String>,
    pub exists: bool,
}

/// 读取项目配置
/// 
/// 从项目目录读取配置文件内容
#[tauri::command]
pub async fn read_project_config(
    repo_path: String,
) -> Result<ProjectConfig, String> {
    info!("Reading project config from: {:?}", repo_path);

    let repo_path = PathBuf::from(&repo_path);
    let opencode_dir = repo_path.join(".opencode");

    let opencode_path = repo_path.join("opencode.json");

    let mut config = ProjectConfig {
        oh_my_opencode_json: None,
        opencode_json: None,
        claude_md: None,
        agents_md: None,
        skills: Vec::new(),
        exists: opencode_dir.exists() || opencode_path.exists(),
    };

    // 读取 oh-my-opencode.jsonc
    let oh_my_opencode_path = opencode_dir.join("oh-my-opencode.jsonc");
    if oh_my_opencode_path.exists() {
        config.oh_my_opencode_json = Some(
            fs::read_to_string(&oh_my_opencode_path)
                .map_err(|e| format!("Failed to read oh-my-opencode.jsonc: {}", e))?,
        );
    }

    // 读取 opencode.json
    if opencode_path.exists() {
        config.opencode_json = Some(
            fs::read_to_string(&opencode_path)
                .map_err(|e| format!("Failed to read opencode.json: {}", e))?,
        );
    }

    // 读取 CLAUDE.md
    let claude_md_path = repo_path.join("CLAUDE.md");
    if claude_md_path.exists() {
        config.claude_md = Some(
            fs::read_to_string(&claude_md_path)
                .map_err(|e| format!("Failed to read CLAUDE.md: {}", e))?,
        );
    }

    // 读取 AGENTS.md
    let agents_md_path = repo_path.join("AGENTS.md");
    if agents_md_path.exists() {
        config.agents_md = Some(
            fs::read_to_string(&agents_md_path)
                .map_err(|e| format!("Failed to read AGENTS.md: {}", e))?,
        );
    }

    // 列出 skills 目录
    let skills_dir = opencode_dir.join("skills");
    if skills_dir.exists() && skills_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(&skills_dir) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    if let Some(name) = entry.file_name().to_str() {
                        config.skills.push(name.to_string());
                    }
                }
            }
        }
    }

    info!("Project config read: exists={}, skills={:?}", config.exists, config.skills);
    Ok(config)
}

// ========== 保存单个配置文件 ==========

/// 保存项目配置文件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveProjectConfigRequest {
    pub repo_path: String,
    pub config_type: String, // "oh-my-opencode" | "opencode" | "claude-md" | "agents-md"
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveProjectConfigResult {
    pub success: bool,
    pub message: String,
    pub file_path: String,
}

/// 保存项目配置文件
/// 
/// 直接写入项目目录中的配置文件
#[tauri::command]
pub async fn save_project_config_file(
    request: SaveProjectConfigRequest,
) -> Result<SaveProjectConfigResult, String> {
    info!(
        "Saving project config file: {:?} / {}",
        request.repo_path, request.config_type
    );

    let repo_path = PathBuf::from(&request.repo_path);
    let opencode_dir = repo_path.join(".opencode");

    // 确保 .opencode 目录存在
    if !opencode_dir.exists() {
        fs::create_dir_all(&opencode_dir)
            .map_err(|e| format!("Failed to create .opencode directory: {}", e))?;
    }

    let (file_path, file_name) = match request.config_type.as_str() {
        "oh-my-opencode" => (opencode_dir.join("oh-my-opencode.jsonc"), ".opencode/oh-my-opencode.jsonc"),
        "opencode" => (repo_path.join("opencode.json"), "opencode.json"),
        "claude-md" => (repo_path.join("CLAUDE.md"), "CLAUDE.md"),
        "agents-md" => (repo_path.join("AGENTS.md"), "AGENTS.md"),
        _ => return Err(format!("Unknown config type: {}", request.config_type)),
    };

    fs::write(&file_path, &request.content)
        .map_err(|e| format!("Failed to write {}: {}", file_name, e))?;

    info!("Saved: {:?}", file_path);

    Ok(SaveProjectConfigResult {
        success: true,
        message: format!("Successfully saved {}", file_name),
        file_path: file_name.to_string(),
    })
}
