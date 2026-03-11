// Swarm Config I/O - 蜂群配置文件读写
// 独立模块，不依赖 Tauri，可被 HTTP Server 和 Tauri Commands 共享

use log::{info, warn};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

// 导入 dirs crate 用于获取用户目录
use dirs;

// ========== 数据结构 ==========

/// 蜂群配置写入请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WriteSwarmConfigRequest {
    /// 项目路径 (repo_path)
    pub repo_path: String,
    /// oh-my-opencode.jsonc 内容
    pub oh_my_opencode_json: Option<String>,
    /// opencode.json 内容
    pub opencode_json: Option<String>,
    /// CLAUDE.md 内容（项目规则文档）
    pub claude_md: Option<String>,
    /// AGENTS.md 内容（Agent 说明，可选）
    pub agents_md: Option<String>,
    /// 蜂群 ID（用于定位 skills 目录）
    pub swarm_id: Option<String>,
    /// 是否包含项目模板
    #[serde(default)]
    pub include_template: bool,
    /// 项目模板 Git 仓库地址
    pub template_git_url: Option<String>,
    /// 项目模板分支
    pub template_branch: Option<String>,
}

/// 蜂群配置写入结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WriteSwarmConfigResult {
    pub success: bool,
    pub message: String,
    pub files_written: Vec<String>,
    pub dirs_created: Vec<String>,
}

// ========== 核心函数（非 Tauri 依赖）==========

/// 将蜂群配置写入项目目录
///
/// 种子模式：配置复制后归项目所有
/// - 写入 .opencode/oh-my-opencode.jsonc
/// - 写入 opencode.json（项目根目录）
/// - 写入 CLAUDE.md（根目录）
/// - 写入 AGENTS.md（根目录，可选）
/// - 复制 skills/ 目录
pub fn write_swarm_config_to_project(
    request: &WriteSwarmConfigRequest,
) -> Result<WriteSwarmConfigResult, String> {
    info!("Writing swarm config to project: {:?}", request.repo_path);
    info!(
        "[swarm_config_io] payload summary repo_path={}, has_oh_my_opencode_json={}, has_opencode_json={}, has_claude_md={}, has_agents_md={}, swarm_id={:?}",
        request.repo_path,
        request
            .oh_my_opencode_json
            .as_ref()
            .is_some_and(|v| !v.trim().is_empty()),
        request
            .opencode_json
            .as_ref()
            .is_some_and(|v| !v.trim().is_empty()),
        request.claude_md.as_ref().is_some_and(|v| !v.trim().is_empty()),
        request.agents_md.as_ref().is_some_and(|v| !v.trim().is_empty()),
        request.swarm_id
    );

    let repo_path = PathBuf::from(&request.repo_path);
    let opencode_dir = repo_path.join(".opencode");

    // 1. 确保 .opencode 目录存在
    if !opencode_dir.exists() {
        fs::create_dir_all(&opencode_dir)
            .map_err(|e| format!("Failed to create .opencode directory: {}", e))?;
        info!("Created .opencode directory: {:?}", opencode_dir);
    }

    let mut files_written = Vec::new();
    let mut dirs_created = Vec::new();

    // 2. 写入 oh-my-opencode.jsonc
    if let Some(content) = &request.oh_my_opencode_json {
        if !content.trim().is_empty() {
            let file_path = opencode_dir.join("oh-my-opencode.jsonc");
            fs::write(&file_path, content)
                .map_err(|e| format!("Failed to write oh-my-opencode.jsonc: {}", e))?;
            files_written.push(".opencode/oh-my-opencode.jsonc".to_string());
            info!("Written: {:?}", file_path);
        }
    }

    // 3. 写入 opencode.json（项目根目录）
    if let Some(content) = &request.opencode_json {
        if !content.trim().is_empty() {
            let file_path = repo_path.join("opencode.json");
            let normalized_content = normalize_opencode_json(content);
            info!(
                "[swarm_config_io] writing opencode.json to {:?}, content_len={}",
                file_path,
                normalized_content.len()
            );
            fs::write(&file_path, normalized_content)
                .map_err(|e| format!("Failed to write opencode.json: {}", e))?;
            let file_exists = file_path.exists();
            info!(
                "[swarm_config_io] opencode.json write completed, exists_after_write={}",
                file_exists
            );
            files_written.push("opencode.json".to_string());
            info!("Written: {:?}", file_path);
        } else {
            info!("[swarm_config_io] opencode_json content is empty, skip write");
        }
    } else {
        info!("[swarm_config_io] opencode_json missing in request, skip write");
    }

    // 4. 写入 CLAUDE.md（项目根目录）
    if let Some(content) = &request.claude_md {
        if !content.trim().is_empty() {
            let file_path = repo_path.join("CLAUDE.md");
            fs::write(&file_path, content)
                .map_err(|e| format!("Failed to write CLAUDE.md: {}", e))?;
            files_written.push("CLAUDE.md".to_string());
            info!("Written: {:?}", file_path);
        }
    }

    // 5. 写入 AGENTS.md（项目根目录，可选）
    if let Some(content) = &request.agents_md {
        if !content.trim().is_empty() {
            let file_path = repo_path.join("AGENTS.md");
            fs::write(&file_path, content)
                .map_err(|e| format!("Failed to write AGENTS.md: {}", e))?;
            files_written.push("AGENTS.md".to_string());
            info!("Written: {:?}", file_path);
        }
    }

    // 6. 复制 Skills 目录（如果指定了 swarm_id）
    if let Some(swarm_id) = &request.swarm_id {
        let skills_src = get_swarm_skills_dir(swarm_id);
        if skills_src.exists() {
            let skills_dst = opencode_dir.join("skills");
            copy_dir_all(&skills_src, &skills_dst)
                .map_err(|e| format!("Failed to copy skills directory: {}", e))?;
            dirs_created.push(".opencode/skills/".to_string());
            info!("Copied skills from {:?} to {:?}", skills_src, skills_dst);
        } else {
            info!("No skills directory found at {:?}", skills_src);
        }
    }

    // 7. 克隆项目模板（如果指定）
    // 注意：Git 克隆是可选功能，目前暂不实现
    if request.include_template {
        if let Some(git_url) = &request.template_git_url {
            warn!(
                "Git template cloning not implemented yet. URL: {}, Branch: {:?}",
                git_url, request.template_branch
            );
            // TODO: 实现 Git 克隆逻辑
        }
    }

    let result = WriteSwarmConfigResult {
        success: true,
        message: format!(
            "Successfully written {} files, {} directories",
            files_written.len(),
            dirs_created.len()
        ),
        files_written,
        dirs_created,
    };

    info!("Swarm config write result: {:?}", result);
    Ok(result)
}

// ========== 辅助函数 ==========

/// 获取蜂群的 skills 目录路径
fn get_swarm_skills_dir(swarm_id: &str) -> PathBuf {
    // Skills 存储在 ~/.hivelaunch/swarms/{swarm_id}/skills/
    if let Some(home) = dirs::home_dir() {
        home.join(".hivelaunch")
            .join("swarms")
            .join(swarm_id)
            .join("skills")
    } else {
        PathBuf::from("/tmp/.hivelaunch")
            .join("swarms")
            .join(swarm_id)
            .join("skills")
    }
}

fn normalize_opencode_json(content: &str) -> String {
    let mut value = match serde_json::from_str::<Value>(content) {
        Ok(v) => v,
        Err(_) => return content.to_string(),
    };

    if let Some(servers_value) = value
        .get_mut("mcp")
        .and_then(|mcp| mcp.get_mut("servers"))
    {
        if let Value::Array(servers_array) = servers_value {
            let mut servers_object = serde_json::Map::new();
            for (idx, server) in servers_array.iter().enumerate() {
                if let Value::Object(mut server_obj) = server.clone() {
                    let name = server_obj
                        .remove("name")
                        .and_then(|v| v.as_str().map(ToOwned::to_owned))
                        .unwrap_or_else(|| format!("server_{}", idx + 1));
                    servers_object.insert(name, Value::Object(server_obj));
                }
            }
            *servers_value = Value::Object(servers_object);
        }
    }

    serde_json::to_string_pretty(&value).unwrap_or_else(|_| content.to_string())
}

/// 递归复制目录
fn copy_dir_all(src: &PathBuf, dst: &PathBuf) -> Result<(), String> {
    if !dst.exists() {
        fs::create_dir_all(dst)
            .map_err(|e| format!("Failed to create directory {:?}: {}", dst, e))?;
    }

    for entry in fs::read_dir(src).map_err(|e| format!("Failed to read directory {:?}: {}", src, e))? {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let ty = entry.file_type().map_err(|e| format!("Failed to get file type: {}", e))?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if ty.is_dir() {
            copy_dir_all(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)
                .map_err(|e| format!("Failed to copy {:?} to {:?}: {}", src_path, dst_path, e))?;
        }
    }

    Ok(())
}
