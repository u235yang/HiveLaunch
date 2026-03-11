// HiveLaunch HTTP Server
// 内嵌 HTTP Server 用于 Agent 执行 API

/// 设为 true 时仅打印与 slash commands 相关的日志，便于定位问题；定位完成后改回 false 即可恢复全部日志
const SLASH_DEBUG_ONLY: bool = false;

macro_rules! log_other {
    (info, $($t:tt)*) => {
        if !SLASH_DEBUG_ONLY {
            log::info!($($t)*);
        }
    };
    (warn, $($t:tt)*) => {
        if !SLASH_DEBUG_ONLY {
            log::warn!($($t)*);
        }
    };
    (debug, $($t:tt)*) => {
        if !SLASH_DEBUG_ONLY {
            log::debug!($($t)*);
        }
    };
    (error, $($t:tt)*) => {
        if !SLASH_DEBUG_ONLY {
            log::error!($($t)*);
        }
    };
}

use axum::{
    extract::{ConnectInfo, State, Path, WebSocketUpgrade, Query},
    response::{Json, IntoResponse},
    routing::{delete, get, options, post, put},
    Router,
};
use axum::http::{StatusCode, header, HeaderName, HeaderValue};
use axum::extract::ws::Message;
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_ENGINE};
use sha2::{Digest, Sha256};
use std::net::SocketAddr;
use std::path::{Path as StdPath, PathBuf};
use std::sync::{Arc, LazyLock, RwLock as StdRwLock};
use std::collections::HashMap;
use std::{fs, io};
use tokio::sync::{RwLock, broadcast, mpsc};
use std::process::Command;
use tower_http::cors::CorsLayer;

use crate::process::agent_manager::{AgentProcessManager, parse_json_entry};
use crate::process::db::ExecutionProcessLogs;
use crate::commands::worktree::{WorktreeManager, WorktreeInfo, WorktreeStatus, BranchDiffStats};
use crate::commands::git::{GitBranch, list_branches, get_workspace_diff, FileStatus as GitFileStatus};
use crate::commands::settings::{GlobalSettings, load_settings, save_settings};
use crate::commands::skills_hub::{
    get_skills_hub_status, resolve_skills_hub_dir, skills_install, skills_remove,
    skills_repo_list, skills_search_api, skills_update,
};
use crate::commands::swarm_config::{
    ProjectConfig, SaveProjectConfigRequest, SaveProjectConfigResult, read_project_config, save_project_config_file,
};
use crate::swarm_config_io::{WriteSwarmConfigRequest, WriteSwarmConfigResult, write_swarm_config_to_project};
use futures_util::{SinkExt, StreamExt as FuturesStreamExt};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, Message as TunnelMessage},
};

fn summarize_patch_for_log(patch: &json_patch::Patch) -> String {
    let value = match serde_json::to_value(patch) {
        Ok(v) => v,
        Err(_) => return "unserializable patch".to_string(),
    };
    let Some(ops) = value.as_array() else {
        return "patch not array".to_string();
    };
    if ops.is_empty() {
        return "empty patch".to_string();
    }

    let summary = ops
        .iter()
        .take(2)
        .map(|op| {
            let op_name = op.get("op").and_then(|v| v.as_str()).unwrap_or("?");
            let path = op.get("path").and_then(|v| v.as_str()).unwrap_or("?");
            let value_type = op
                .get("value")
                .and_then(|v| v.get("type"))
                .and_then(|v| v.as_str())
                .unwrap_or("-");
            format!("{op_name} {path} value.type={value_type}")
        })
        .collect::<Vec<_>>()
        .join(" | ");

    if ops.len() > 2 {
        format!("{summary} | ... total_ops={}", ops.len())
    } else {
        format!("{summary} | total_ops={}", ops.len())
    }
}

/// Generic API Response wrapper
#[derive(serde::Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            message: None,
        }
    }
    
    pub fn error(message: &str) -> Self {
        Self {
            success: false,
            data: None,
            message: Some(message.to_string()),
        }
    }
}

/// HTTP Server 状态
#[derive(Clone)]
pub struct HttpServerState {
    pub process_manager: Arc<RwLock<AgentProcessManager>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RemoteAccessStatusData {
    enabled: bool,
    device_id: Option<String>,
    pairing_key: Option<String>,
    relay_url: Option<String>,
    connection_state: String,
    last_error: Option<String>,
    paired_devices: Vec<RemotePairedDevice>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RemotePairedDevice {
    device_id: String,
    device_name: String,
    paired_at: String,
    last_seen: Option<String>,
}

#[derive(Clone, Default)]
struct RemoteAccessRuntime {
    enabled: bool,
    device_id: Option<String>,
    pairing_key: Option<String>,
    relay_url: Option<String>,
    connection_state: String,
    last_error: Option<String>,
}

#[derive(Deserialize)]
#[serde(tag = "type")]
enum RelayIncomingMessage {
    ConnectResult {
        status: String,
        session_id: Option<String>,
        session_token: Option<String>,
    },
    Error {
        code: String,
        message: String,
    },
    HttpRequest {
        request_id: String,
        method: String,
        url: String,
        query: Option<String>,
        headers: Option<serde_json::Value>,
        body: Option<String>,
    },
    WsOpen {
        request_id: String,
        connection_id: String,
        url: String,
        query: Option<String>,
        headers: Option<serde_json::Value>,
    },
    WsData {
        connection_id: String,
        data: String,
        is_binary: bool,
    },
    WsClose {
        connection_id: String,
        code: Option<u16>,
        reason: Option<String>,
    },
    #[serde(other)]
    Other,
}

#[derive(Serialize)]
struct RelayRegisterMessage {
    #[serde(rename = "type")]
    message_type: String,
    device_id: String,
    pairing_key: String,
    device_name: String,
}

#[derive(Serialize)]
struct RelayConnectMessage {
    #[serde(rename = "type")]
    message_type: String,
    device_id: String,
    pairing_key: String,
    client_info: RelayClientInfo,
}

#[derive(Serialize)]
struct RelayClientInfo {
    device_type: String,
    device_name: String,
    platform: String,
}

#[derive(Serialize)]
struct RelayHeartbeatMessage {
    #[serde(rename = "type")]
    message_type: String,
    session_id: String,
}

#[derive(Serialize)]
struct RelayHttpResponseMessage {
    #[serde(rename = "type")]
    message_type: String,
    request_id: String,
    status: u16,
    headers: serde_json::Value,
    body: String,
}

#[derive(Serialize)]
struct RelayWsOpenAckMessage {
    #[serde(rename = "type")]
    message_type: String,
    request_id: String,
    connection_id: String,
    status: String,
    reason: Option<String>,
}

#[derive(Serialize)]
struct RelayWsDataMessage {
    #[serde(rename = "type")]
    message_type: String,
    session_token: String,
    connection_id: String,
    data: String,
    is_binary: bool,
}

#[derive(Serialize)]
struct RelayWsCloseMessage {
    #[serde(rename = "type")]
    message_type: String,
    session_token: String,
    connection_id: String,
    code: Option<u16>,
    reason: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct ExecuteRequest {
    pub prompt: String,
    pub agent_name: Option<String>,
    pub env_vars: Option<std::collections::HashMap<String, String>>,
    /// 执行的工作目录
    pub working_dir: Option<String>,
    /// 指定模型
    pub model: Option<String>,
    /// 必填：由上游（Next API）传入的会话 ID
    pub session_id: String,
    /// 必填：由上游（Next API）传入的执行进程 ID
    pub process_id: String,
}

#[derive(serde::Deserialize)]
pub struct FollowUpRequest {
    pub session_id: String,
    pub process_id: String,
    pub prompt: String,
    pub model: Option<String>,
    pub image_ids: Option<Vec<String>>,
}

#[derive(serde::Serialize)]
pub struct ExecuteResponse {
    pub session_id: String,
    pub execution_id: String,
    pub status: String,
}

#[derive(serde::Serialize)]
pub struct StopResponse {
    pub success: bool,
    pub message: String,
}

// ============ Projects API Types ============

#[derive(serde::Deserialize)]
pub struct CreateProjectRequest {
    pub id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub repo_path: String,
    pub target_branch: Option<String>,
    pub swarm_id: Option<String>,
    pub template_id: Option<String>,
    pub capability_scope: Option<CreateProjectCapabilityScope>,
    pub capability_overrides: Option<CreateProjectCapabilityOverrides>,
}

#[derive(serde::Deserialize, Clone)]
pub struct CreateProjectCapabilityScope {
    pub agent_config: Option<bool>,
    pub skills: Option<bool>,
    pub rules: Option<bool>,
    pub template: Option<bool>,
}

#[derive(serde::Deserialize, Clone)]
pub struct CreateProjectCapabilityOverrides {
    pub oh_my_opencode_json: Option<String>,
    pub opencode_json: Option<String>,
    pub claude_md: Option<String>,
    pub agents_md: Option<String>,
    pub project_skills: Option<Vec<String>>,
    pub include_template: Option<bool>,
    pub template_git_url: Option<String>,
    pub template_branch: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct UpdateProjectRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub repo_path: Option<String>,
    pub target_branch: Option<String>,
}

#[derive(serde::Deserialize, Clone)]
pub struct ApplyProjectSwarmConfigRequest {
    pub swarm_id: String,
    pub capability_scope: Option<CreateProjectCapabilityScope>,
    pub capability_overrides: Option<CreateProjectCapabilityOverrides>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectResponse {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub repo_path: String,
    pub target_branch: String,
    pub created_at: String,
    pub updated_at: String,
    /// 默认蜂群 ID（来自 project_swarm_bindings 表）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub swarm_id: Option<String>,
    /// 默认蜂群名称
    #[serde(skip_serializing_if = "Option::is_none")]
    pub swarm_name: Option<String>,
    /// 蜂群配置写入信息（仅在创建项目时返回）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config_write: Option<serde_json::Value>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateSummaryResponse {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub phase: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub schema_version: Option<String>,
    pub template_path: String,
    pub source_repo_url: String,
    pub source_ref: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_version: Option<String>,
    pub recommended_swarm_ids: Vec<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateDetailResponse {
    #[serde(flatten)]
    pub summary: TemplateSummaryResponse,
    pub variables: Vec<serde_json::Value>,
    pub files: Vec<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env_example: Option<String>,
    pub runtimes: Vec<serde_json::Value>,
    pub agent_packs: Vec<serde_json::Value>,
    pub skills: Vec<String>,
    pub defaults: Option<serde_json::Value>,
    pub post_clone_script: Vec<String>,
}

#[derive(serde::Deserialize, Clone)]
struct TemplateManifestFile {
    schema_version: Option<String>,
    id: String,
    name: String,
    description: Option<String>,
    category: Option<String>,
    phase: Option<i32>,
    icon: Option<String>,
    source: Option<TemplateSourceFile>,
    variables: Option<Vec<serde_json::Value>>,
    files: Option<Vec<serde_json::Value>>,
    env_example: Option<String>,
    runtimes: Option<Vec<serde_json::Value>>,
    agent_packs: Option<Vec<serde_json::Value>>,
    skills: Option<Vec<String>>,
    defaults: Option<serde_json::Value>,
    recommended_swarms: Option<Vec<TemplateRecommendedSwarmFile>>,
    post_clone_script: Option<Vec<String>>,
}

#[derive(serde::Deserialize, Clone)]
struct TemplateSourceFile {
    repo_url: Option<String>,
    template_path: Option<String>,
    default_ref: Option<String>,
}

#[derive(serde::Deserialize, Clone)]
struct TemplateRegistryIndexFile {
    schema_version: Option<String>,
    version: Option<String>,
    signature: Option<String>,
    source: Option<TemplateSourceFile>,
    templates: Vec<TemplateRegistryEntryFile>,
}

#[derive(serde::Deserialize, Clone)]
struct TemplateRegistryEntryFile {
    id: String,
    manifest_path: Option<String>,
    source: Option<TemplateSourceFile>,
}

#[derive(serde::Deserialize, Clone)]
struct TemplateRecommendedSwarmFile {
    id: Option<String>,
}

struct TemplateSummaryDefaults {
    source_repo_url: String,
    template_path: String,
    source_ref: String,
    source_version: Option<String>,
}

struct RemoteTemplateRegistry {
    registry: TemplateRegistryIndexFile,
    source_version: Option<String>,
}

// ============ Tasks API Types ============

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskRequest {
    pub id: Option<String>,
    #[serde(rename = "projectId")]
    pub project_id: String,
    pub title: Option<String>,
    pub description: String,
    pub status: Option<String>,
    #[serde(rename = "agentCli")]
    pub agent_cli: Option<String>,
    #[serde(rename = "modelId")]
    pub model_id: Option<String>,
    #[serde(rename = "taskType")]
    pub task_type: Option<String>,
    #[serde(rename = "directBranch")]
    pub direct_branch: Option<String>,
    #[serde(rename = "imageIds")]
    pub image_ids: Option<Vec<String>>,
    pub position: Option<i32>,
}

#[derive(serde::Deserialize)]
pub struct UpdateTaskRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    pub agent_cli: Option<String>,
    #[serde(rename = "modelId")]
    pub model_id: Option<String>,
    #[serde(rename = "taskType")]
    pub task_type: Option<String>,
    #[serde(rename = "directBranch")]
    pub direct_branch: Option<String>,
    #[serde(rename = "imageIds")]
    pub image_ids: Option<Vec<String>>,
    pub position: Option<i32>,
}

#[derive(serde::Serialize)]
pub struct TaskResponse {
    pub id: String,
    pub project_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub description: String,
    pub status: String,
    pub agent_cli: String,
    #[serde(rename = "modelId")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_id: Option<String>,
    #[serde(rename = "taskType")]
    pub task_type: String,
    #[serde(rename = "directBranch")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub direct_branch: Option<String>,
    #[serde(rename = "imageIds")]
    #[serde(default)]
    pub image_ids: Vec<String>,
    pub position: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadImageRequest {
    pub filename: String,
    pub data_base64: String,
}

fn sanitize_filename(name: &str) -> String {
    let stem = std::path::Path::new(name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("image");
    let clean: String = stem
        .to_lowercase()
        .chars()
        .map(|c| if c.is_whitespace() { '_' } else { c })
        .filter(|c| c.is_alphanumeric() || *c == '_')
        .collect();
    let max_len = 50;
    if clean.len() > max_len {
        clean[..max_len].to_string()
    } else if clean.is_empty() {
        "image".to_string()
    } else {
        clean
    }
}

fn infer_mime_type(filename: &str) -> Option<String> {
    let extension = std::path::Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match extension.as_str() {
        "png" => Some("image/png".to_string()),
        "jpg" | "jpeg" => Some("image/jpeg".to_string()),
        "gif" => Some("image/gif".to_string()),
        "webp" => Some("image/webp".to_string()),
        "bmp" => Some("image/bmp".to_string()),
        "svg" => Some("image/svg+xml".to_string()),
        _ => None,
    }
}

fn image_cache_dir() -> Result<PathBuf, io::Error> {
    let base = dirs::cache_dir().unwrap_or_else(std::env::temp_dir);
    let dir = base.join("hivelaunch").join("images");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

async fn get_task_image_ids(pool: &SqlitePool, task_id: &str) -> Result<Vec<String>, String> {
    let rows = sqlx::query("SELECT image_id FROM task_images WHERE task_id = $1 ORDER BY created_at ASC")
        .bind(task_id)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to query task images: {}", e))?;
    Ok(rows
        .into_iter()
        .filter_map(|row| row.try_get::<String, _>("image_id").ok())
        .collect())
}

async fn upsert_task_images(pool: &SqlitePool, task_id: &str, image_ids: &[String]) -> Result<(), String> {
    sqlx::query("DELETE FROM task_images WHERE task_id = $1")
        .bind(task_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to clear task images: {}", e))?;
    for image_id in image_ids {
        sqlx::query("INSERT OR IGNORE INTO task_images (task_id, image_id, created_at) VALUES ($1, $2, $3)")
            .bind(task_id)
            .bind(image_id)
            .bind(chrono::Utc::now().timestamp())
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to bind task image: {}", e))?;
    }
    Ok(())
}

async fn reconcile_task_runtime_status(
    pool: &SqlitePool,
    task_id: &str,
    current_status: &str,
) -> Result<String, String> {
    if current_status != "inprogress" {
        return Ok(current_status.to_string());
    }

    let workspace_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(1) FROM workspaces WHERE task_id = $1",
    )
    .bind(task_id)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Failed to query task workspaces: {}", e))?;

    if workspace_count == 0 {
        return Ok("todo".to_string());
    }

    let running_count: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(1)
           FROM execution_processes ep
           INNER JOIN workspaces w ON w.id = ep.workspace_id
           WHERE w.task_id = $1
             AND ep.run_reason = 'codingagent'
             AND ep.status = 'running'
             AND ep.dropped = 0"#,
    )
    .bind(task_id)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Failed to query task running processes: {}", e))?;

    if running_count > 0 {
        Ok("inprogress".to_string())
    } else {
        Ok("pending".to_string())
    }
}

async fn materialize_images_to_worktree(
    pool: &SqlitePool,
    working_dir: &std::path::Path,
    image_ids: &[String],
) -> Result<Vec<String>, String> {
    if image_ids.is_empty() {
        return Ok(Vec::new());
    }
    let cache_dir = image_cache_dir().map_err(|e| format!("Failed to create image cache dir: {}", e))?;
    let images_dir = working_dir.join(".hive-images");
    fs::create_dir_all(&images_dir).map_err(|e| format!("Failed to create worktree image dir: {}", e))?;
    let gitignore_path = images_dir.join(".gitignore");
    if !gitignore_path.exists() {
        fs::write(&gitignore_path, "*\n").map_err(|e| format!("Failed to create image gitignore: {}", e))?;
    }
    let mut relative_paths = Vec::new();
    for image_id in image_ids {
        let row = sqlx::query("SELECT file_path FROM images WHERE id = $1 LIMIT 1")
            .bind(image_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Failed to query image: {}", e))?;
        let Some(row) = row else {
            continue;
        };
        let file_path: String = row.try_get("file_path").map_err(|e| format!("Failed to get image path: {}", e))?;
        let src = cache_dir.join(&file_path);
        let dst = images_dir.join(&file_path);
        if !dst.exists() && src.exists() {
            let _ = fs::copy(&src, &dst);
        }
        if dst.exists() {
            relative_paths.push(format!(".hive-images/{}", file_path));
        }
    }
    Ok(relative_paths)
}

fn append_image_paths_to_prompt(prompt: &str, image_paths: &[String]) -> String {
    if image_paths.is_empty() {
        return prompt.to_string();
    }
    let mut output = String::with_capacity(prompt.len() + 128 + image_paths.len() * 64);
    output.push_str(prompt);
    output.push_str("\n\n请结合以下本地图片文件继续处理：\n");
    for path in image_paths {
        output.push_str("- ");
        output.push_str(path);
        output.push('\n');
    }
    output
}

async fn store_image_bytes(
    pool: &SqlitePool,
    filename: &str,
    bytes: &[u8],
) -> Result<ImageResponse, String> {
    let size_bytes = bytes.len() as u64;
    if size_bytes > 20 * 1024 * 1024 {
        return Err("Image too large, max size is 20MB".to_string());
    }
    let mime_type = infer_mime_type(filename).ok_or_else(|| "Unsupported image format".to_string())?;
    let hash = format!("{:x}", Sha256::digest(bytes));
    if let Some(existing) = sqlx::query(
        "SELECT id, file_path, original_name, mime_type, size_bytes, created_at FROM images WHERE hash = $1 LIMIT 1",
    )
    .bind(&hash)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Failed to query image hash: {}", e))?
    {
        return Ok(ImageResponse {
            id: existing.try_get("id").map_err(|e| format!("Failed to get image id: {}", e))?,
            file_path: existing.try_get("file_path").map_err(|e| format!("Failed to get image path: {}", e))?,
            original_name: existing.try_get("original_name").map_err(|e| format!("Failed to get image original name: {}", e))?,
            mime_type: existing.try_get("mime_type").map_err(|e| format!("Failed to get image mime: {}", e))?,
            size_bytes: existing.try_get("size_bytes").map_err(|e| format!("Failed to get image size: {}", e))?,
            created_at: timestamp_to_iso(existing.try_get("created_at").ok()),
        });
    }
    let ext = std::path::Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png");
    let clean_name = sanitize_filename(filename);
    let file_path = format!("{}_{}.{}", uuid::Uuid::new_v4(), clean_name, ext);
    let cache_dir = image_cache_dir().map_err(|e| format!("Failed to create image cache dir: {}", e))?;
    fs::write(cache_dir.join(&file_path), bytes).map_err(|e| format!("Failed to write image file: {}", e))?;
    let image_id = uuid::Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().timestamp();
    sqlx::query(
        "INSERT INTO images (id, file_path, original_name, mime_type, size_bytes, hash, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(&image_id)
    .bind(&file_path)
    .bind(filename)
    .bind(&mime_type)
    .bind(size_bytes as i64)
    .bind(&hash)
    .bind(created_at)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create image record: {}", e))?;
    Ok(ImageResponse {
        id: image_id,
        file_path,
        original_name: filename.to_string(),
        mime_type,
        size_bytes: size_bytes as i64,
        created_at: timestamp_to_iso(Some(created_at)),
    })
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImageResponse {
    pub id: String,
    pub file_path: String,
    pub original_name: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub created_at: String,
}

// ============ Swarms API Types ============

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SwarmTemplateSourceSummary {
    pub include_template: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template_git_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template_branch: Option<String>,
    pub clone_supported: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SwarmInitPlanSummary {
    pub files: Vec<String>,
    pub directories: Vec<String>,
    pub skill_entries: Vec<String>,
    pub template_source: SwarmTemplateSourceSummary,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SwarmResponse {
    pub id: String,
    pub source_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template_id: Option<String>,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub cli: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_model_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oh_my_opencode_json: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub opencode_json: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skills_json: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agents_json: Option<String>,
    pub mcps_count: i32,
    pub accent: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub claude_md: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agents_md: Option<String>,
    pub include_template: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template_git_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template_branch: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    // Computed fields
    pub skills_count: i32,
    pub agents: Vec<String>,
    pub projects_count: i32,
    pub init_plan: SwarmInitPlanSummary,
}

#[derive(serde::Deserialize)]
pub struct SwarmQuery {
    pub search: Option<String>,
}

// ============ Swarm Bindings API Types ============

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBindingRequest {
    #[serde(alias = "globalSwarmId", alias = "global_swarm_id")]
    pub swarm_template_id: String,
    pub overrides: Option<serde_json::Value>,
    pub is_active: Option<bool>,
}

#[derive(serde::Deserialize)]
pub struct UpdateBindingRequest {
    pub overrides: Option<serde_json::Value>,
    pub is_active: Option<bool>,
    pub activate: Option<bool>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BindingResponse {
    pub id: String,
    pub project_id: String,
    pub swarm_template_id: String,
    pub is_active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub overrides: Option<serde_json::Value>,
    pub bound_at: String,
    pub swarm: SwarmSummary,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SwarmSummary {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub cli: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub defaultModelId: Option<String>,
    pub skillsCount: i32,
    pub agents: Vec<String>,
    pub mcpsCount: i32,
    pub accent: String,
}

// ============ Helper Functions ============

fn timestamp_to_iso(ts: Option<i64>) -> String {
    match ts {
        Some(t) => {
            if t == 0 {
                chrono::Utc::now().to_rfc3339()
            } else {
                chrono::DateTime::from_timestamp(t, 0)
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_else(|| chrono::Utc::now().to_rfc3339())
            }
        }
        None => chrono::Utc::now().to_rfc3339(),
    }
}

const OFFICIAL_SWARM_ID_PREFIX: &str = "official::";
const TEMPLATE_SCHEMA_VERSION: &str = "2.0";
const DEFAULT_TEMPLATE_SOURCE_REPO: &str = "https://github.com/MarcusYuan/HiveLaunch-Templates";
const DEFAULT_TEMPLATE_SOURCE_REF: &str = "main";
const DEFAULT_TEMPLATE_INDEX_URLS: [&str; 1] =
    ["https://raw.githubusercontent.com/MarcusYuan/HiveLaunch-Templates/main/templates/index.json"];
const TEMPLATE_INDEX_CACHE_TTL_SECONDS: i64 = 120;
const TEMPLATE_MANIFEST_CACHE_TTL_SECONDS: i64 = 300;
const TEMPLATE_FILE_CACHE_TTL_SECONDS: i64 = 300;

#[derive(Serialize, Deserialize, Clone)]
struct RemoteTemplateTextCacheEntry {
    status: u16,
    content: Option<String>,
    cached_at: i64,
}

static REMOTE_TEMPLATE_TEXT_CACHE: LazyLock<StdRwLock<HashMap<String, RemoteTemplateTextCacheEntry>>> =
    LazyLock::new(|| StdRwLock::new(HashMap::new()));

fn official_swarm_id(template_id: &str) -> String {
    format!("{}{}", OFFICIAL_SWARM_ID_PREFIX, template_id)
}

fn is_official_swarm_id(swarm_id: &str) -> bool {
    swarm_id.starts_with(OFFICIAL_SWARM_ID_PREFIX)
}

fn normalize_swarm_template_id(swarm_id_or_template_id: &str) -> String {
    swarm_id_or_template_id
        .trim()
        .strip_prefix(OFFICIAL_SWARM_ID_PREFIX)
        .unwrap_or(swarm_id_or_template_id.trim())
        .to_string()
}

fn swarm_source_type(swarm_id: &str) -> String {
    if is_official_swarm_id(swarm_id) {
        "official".to_string()
    } else {
        "custom".to_string()
    }
}

fn has_non_empty(value: Option<&String>) -> bool {
    value.is_some_and(|v| !v.trim().is_empty())
}

fn normalize_asset_path(path: &StdPath) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn collect_template_assets_recursive(
    template_root: &StdPath,
    current_dir: &StdPath,
    files: &mut Vec<String>,
    directories: &mut Vec<String>,
) -> Result<(), String> {
    let mut children = fs::read_dir(current_dir)
        .map_err(|e| format!("Failed to read template directory {}: {}", current_dir.display(), e))?
        .filter_map(|entry| entry.ok().map(|item| item.path()))
        .collect::<Vec<_>>();
    children.sort();

    for child in children {
        if child.is_dir() {
            if let Ok(relative) = child.strip_prefix(template_root) {
                let relative_text = normalize_asset_path(relative);
                if !relative_text.trim().is_empty() {
                    directories.push(format!("{}/", relative_text));
                }
            }
            collect_template_assets_recursive(template_root, &child, files, directories)?;
            continue;
        }

        if child.is_file() {
            if let Ok(relative) = child.strip_prefix(template_root) {
                let relative_text = normalize_asset_path(relative);
                if !relative_text.trim().is_empty() && relative_text != "template.json" {
                    files.push(relative_text);
                }
            }
        }
    }

    Ok(())
}

fn collect_template_assets(template_id: Option<&String>) -> (Vec<String>, Vec<String>) {
    let _ = template_id;
    (Vec::new(), Vec::new())
}

fn append_unique_entries(target: &mut Vec<String>, extra: Vec<String>) {
    for entry in extra {
        if !target.iter().any(|existing| existing == &entry) {
            target.push(entry);
        }
    }
}

fn build_swarm_init_plan(
    template_id: Option<&String>,
    oh_my_opencode_json: Option<&String>,
    opencode_json: Option<&String>,
    claude_md: Option<&String>,
    agents_md: Option<&String>,
    selected_skills: &[String],
    include_template: bool,
    template_git_url: Option<&String>,
    template_branch: Option<&String>,
) -> SwarmInitPlanSummary {
    let mut files = Vec::new();
    let mut directories = Vec::new();
    let mut skill_entries = Vec::new();

    if has_non_empty(oh_my_opencode_json) {
        files.push(".opencode/oh-my-opencode.jsonc".to_string());
    }
    if has_non_empty(opencode_json) {
        files.push("opencode.json".to_string());
    }
    if has_non_empty(claude_md) {
        files.push("CLAUDE.md".to_string());
    }
    if has_non_empty(agents_md) {
        files.push("AGENTS.md".to_string());
    }
    if !selected_skills.is_empty() {
        directories.push(".opencode/skills/".to_string());
        skill_entries = selected_skills
            .iter()
            .map(|skill| format!(".opencode/skills/{}/skill.md", skill))
            .collect();
    }
    let (template_files, template_directories) = collect_template_assets(template_id);
    append_unique_entries(&mut files, template_files);
    append_unique_entries(&mut directories, template_directories);

    let source_git_url = template_git_url
        .and_then(|value| if value.trim().is_empty() { None } else { Some(value.trim().to_string()) });
    let source_branch = template_branch
        .and_then(|value| if value.trim().is_empty() { None } else { Some(value.trim().to_string()) });

    SwarmInitPlanSummary {
        files,
        directories,
        skill_entries,
        template_source: SwarmTemplateSourceSummary {
            include_template,
            template_git_url: source_git_url,
            template_branch: source_branch,
            clone_supported: false,
        },
    }
}

fn resolve_templates_dir() -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(current) = std::env::current_dir() {
        candidates.push(current.join("templates"));
    }
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    if let Some(repo_root) = manifest_dir.parent().and_then(|v| v.parent()) {
        candidates.push(repo_root.join("templates"));
    }
    for path in candidates {
        if path.is_dir() {
            return Ok(path);
        }
    }
    Err("Templates directory not found".to_string())
}

fn normalize_config_path(path: &str) -> String {
    path.replace('\\', "/").trim_start_matches('/').to_string()
}

fn normalize_repo_url(repo_url: &str) -> String {
    repo_url
        .trim()
        .trim_end_matches('/')
        .trim_end_matches(".git")
        .to_string()
}

fn parse_repo_owner_and_name(repo_url: &str) -> Option<(String, String, String)> {
    let normalized = normalize_repo_url(repo_url);
    let candidates = [("https://github.com/", "github.com")];
    for (prefix, host) in candidates {
        if let Some(remain) = normalized.strip_prefix(prefix) {
            let mut parts = remain.split('/').filter(|item| !item.trim().is_empty());
            let owner = parts.next()?.to_string();
            let repo = parts.next()?.to_string();
            if owner.trim().is_empty() || repo.trim().is_empty() {
                return None;
            }
            return Some((host.to_string(), owner, repo));
        }
    }
    None
}

fn build_raw_file_url(repo_url: &str, reference: &str, file_path: &str) -> Option<String> {
    let (host, owner, repo) = parse_repo_owner_and_name(repo_url)?;
    if host != "github.com" {
        return None;
    }
    let path = normalize_config_path(file_path);
    if path.trim().is_empty() {
        return None;
    }
    Some(format!(
        "https://raw.githubusercontent.com/{}/{}/{}/{}",
        owner,
        repo,
        reference.trim(),
        path
    ))
}

fn resolve_template_summary_defaults(
    manifest_source: Option<&TemplateSourceFile>,
    registry_source: Option<&TemplateSourceFile>,
    fallback_template_path: String,
    source_version: Option<String>,
) -> TemplateSummaryDefaults {
    let source_repo_url = manifest_source
        .and_then(|source| source.repo_url.clone())
        .or_else(|| registry_source.and_then(|source| source.repo_url.clone()))
        .unwrap_or_else(|| DEFAULT_TEMPLATE_SOURCE_REPO.to_string());
    let template_path = manifest_source
        .and_then(|source| source.template_path.clone())
        .or_else(|| registry_source.and_then(|source| source.template_path.clone()))
        .unwrap_or(fallback_template_path);
    let source_ref = manifest_source
        .and_then(|source| source.default_ref.clone())
        .or_else(|| registry_source.and_then(|source| source.default_ref.clone()))
        .unwrap_or_else(|| DEFAULT_TEMPLATE_SOURCE_REF.to_string());
    TemplateSummaryDefaults {
        source_repo_url,
        template_path,
        source_ref,
        source_version,
    }
}

fn default_manifest_path(template_id: &str) -> String {
    format!("templates/{}/template.json", template_id.trim())
}

fn derive_template_path(manifest_path: &str, template_id: &str) -> String {
    let normalized = normalize_config_path(manifest_path);
    let parent = StdPath::new(&normalized).parent();
    match parent {
        Some(dir) if !dir.as_os_str().is_empty() => normalize_asset_path(dir),
        _ => format!("templates/{}", template_id.trim()),
    }
}

fn resolve_local_manifest_path(templates_dir: &StdPath, manifest_path: &str) -> PathBuf {
    let normalized = normalize_config_path(manifest_path);
    if let Some(relative) = normalized.strip_prefix("templates/") {
        return templates_dir.join(relative);
    }
    templates_dir.join(normalized)
}

fn resolve_local_template_path(templates_dir: &StdPath, template_path: &str) -> PathBuf {
    let normalized = normalize_config_path(template_path);
    if let Some(relative) = normalized.strip_prefix("templates/") {
        return templates_dir.join(relative);
    }
    templates_dir.join(normalized)
}

fn read_optional_file_content(path: &StdPath) -> Option<String> {
    if !path.is_file() {
        return None;
    }
    fs::read_to_string(path)
        .ok()
        .and_then(|value| if value.trim().is_empty() { None } else { Some(value) })
}

fn sort_template_details(details: &mut Vec<TemplateDetailResponse>) {
    details.sort_by(|a, b| {
        a.summary
            .phase
            .cmp(&b.summary.phase)
            .then_with(|| a.summary.name.cmp(&b.summary.name))
    });
}

fn build_template_summary(
    manifest: &TemplateManifestFile,
    defaults: TemplateSummaryDefaults,
) -> TemplateSummaryResponse {
    let recommended_swarm_ids = manifest
        .recommended_swarms
        .as_ref()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.id.clone())
                .filter(|id| !id.trim().is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    TemplateSummaryResponse {
        id: manifest.id.clone(),
        name: manifest.name.clone(),
        description: manifest.description.clone().unwrap_or_default(),
        category: manifest
            .category
            .clone()
            .unwrap_or_else(|| "general".to_string()),
        phase: manifest.phase.unwrap_or(1),
        icon: manifest.icon.clone(),
        schema_version: manifest.schema_version.clone(),
        template_path: defaults.template_path,
        source_repo_url: defaults.source_repo_url,
        source_ref: defaults.source_ref,
        source_version: defaults.source_version,
        recommended_swarm_ids,
    }
}

fn read_template_manifest(path: &StdPath) -> Result<TemplateManifestFile, String> {
    let raw = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    let manifest = serde_json::from_str::<TemplateManifestFile>(&raw)
        .map_err(|e| format!("Failed to parse {}: {}", path.display(), e))?;
    if manifest.schema_version.as_deref() != Some(TEMPLATE_SCHEMA_VERSION) {
        return Err(format!(
            "Unsupported template schema_version in {}: expected {}, got {:?}",
            path.display(),
            TEMPLATE_SCHEMA_VERSION,
            manifest.schema_version
        ));
    }
    Ok(manifest)
}

fn read_template_registry_from_local(templates_dir: &StdPath) -> Result<TemplateRegistryIndexFile, String> {
    let index_path = templates_dir.join("index.json");
    let raw = fs::read_to_string(&index_path)
        .map_err(|e| format!("Failed to read {}: {}", index_path.display(), e))?;
    let index = serde_json::from_str::<TemplateRegistryIndexFile>(&raw)
        .map_err(|e| format!("Failed to parse {}: {}", index_path.display(), e))?;
    if index.schema_version.as_deref() != Some(TEMPLATE_SCHEMA_VERSION) {
        return Err(format!(
            "Unsupported template index schema_version in {}: expected {}, got {:?}",
            index_path.display(),
            TEMPLATE_SCHEMA_VERSION,
            index.schema_version
        ));
    }
    Ok(index)
}

fn load_all_template_details_from_local() -> Result<Vec<TemplateDetailResponse>, String> {
    let templates_dir = resolve_templates_dir()?;
    let mut result = Vec::new();
    if let Ok(index) = read_template_registry_from_local(templates_dir.as_path()) {
        let source_version = index
            .version
            .clone()
            .or_else(|| Some("local-index".to_string()));
        for template in index.templates {
            let manifest_path = template
                .manifest_path
                .clone()
                .unwrap_or_else(|| default_manifest_path(&template.id));
            let manifest_path_buf = resolve_local_manifest_path(templates_dir.as_path(), &manifest_path);
            if !manifest_path_buf.is_file() {
                continue;
            }
            let manifest = read_template_manifest(&manifest_path_buf)?;
            let fallback_path = derive_template_path(&manifest_path, &template.id);
            let defaults = resolve_template_summary_defaults(
                manifest.source.as_ref(),
                template.source.as_ref().or(index.source.as_ref()),
                fallback_path,
                source_version.clone(),
            );
            let summary = build_template_summary(&manifest, defaults);
            result.push(TemplateDetailResponse {
                summary,
                variables: manifest.variables.unwrap_or_default(),
                files: manifest.files.unwrap_or_default(),
                env_example: manifest.env_example.clone(),
                runtimes: manifest.runtimes.unwrap_or_default(),
                agent_packs: manifest.agent_packs.unwrap_or_default(),
                skills: manifest.skills.unwrap_or_default(),
                defaults: manifest.defaults,
                post_clone_script: manifest.post_clone_script.unwrap_or_default(),
            });
        }
    } else {
        let entries = fs::read_dir(&templates_dir)
            .map_err(|e| format!("Failed to read templates directory {}: {}", templates_dir.display(), e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read template entry: {}", e))?;
            let file_type = entry
                .file_type()
                .map_err(|e| format!("Failed to resolve file type: {}", e))?;
            if !file_type.is_dir() {
                continue;
            }
            let dir_name = entry.file_name().to_string_lossy().to_string();
            let manifest_path = entry.path().join("template.json");
            if !manifest_path.is_file() {
                continue;
            }
            let manifest = read_template_manifest(&manifest_path)?;
            let defaults = resolve_template_summary_defaults(
                manifest.source.as_ref(),
                None,
                format!("templates/{}", dir_name),
                Some("local-filesystem".to_string()),
            );
            let summary = build_template_summary(&manifest, defaults);
            result.push(TemplateDetailResponse {
                summary,
                variables: manifest.variables.unwrap_or_default(),
                files: manifest.files.unwrap_or_default(),
                env_example: manifest.env_example.clone(),
                runtimes: manifest.runtimes.unwrap_or_default(),
                agent_packs: manifest.agent_packs.unwrap_or_default(),
                skills: manifest.skills.unwrap_or_default(),
                defaults: manifest.defaults,
                post_clone_script: manifest.post_clone_script.unwrap_or_default(),
            });
        }
    }

    sort_template_details(&mut result);
    Ok(result)
}

fn resolve_template_index_urls() -> Vec<String> {
    let mut urls = Vec::new();
    if let Ok(value) = std::env::var("BEE_TEMPLATE_INDEX_URL") {
        let text = value.trim();
        if !text.is_empty() {
            urls.push(text.to_string());
        }
    }
    urls.extend(DEFAULT_TEMPLATE_INDEX_URLS.iter().map(|item| item.to_string()));
    urls
}

fn template_remote_cache_dir() -> Result<PathBuf, String> {
    let base = dirs::cache_dir().unwrap_or_else(std::env::temp_dir);
    let dir = base.join("hivelaunch").join("template-http");
    fs::create_dir_all(&dir).map_err(|err| format!("Failed to create template cache dir {}: {}", dir.display(), err))?;
    Ok(dir)
}

fn template_remote_cache_key(url: &str) -> String {
    format!("{:x}", Sha256::digest(url.as_bytes()))
}

fn template_remote_cache_file_path(url: &str) -> Result<PathBuf, String> {
    Ok(template_remote_cache_dir()?.join(format!("{}.json", template_remote_cache_key(url))))
}

fn is_remote_cache_fresh(entry: &RemoteTemplateTextCacheEntry, ttl_seconds: i64) -> bool {
    let now = chrono::Utc::now().timestamp();
    now.saturating_sub(entry.cached_at) <= ttl_seconds
}

fn read_remote_cache_from_memory(url: &str) -> Option<RemoteTemplateTextCacheEntry> {
    REMOTE_TEMPLATE_TEXT_CACHE
        .read()
        .ok()
        .and_then(|cache| cache.get(url).cloned())
}

fn write_remote_cache_to_memory(url: &str, entry: &RemoteTemplateTextCacheEntry) {
    if let Ok(mut cache) = REMOTE_TEMPLATE_TEXT_CACHE.write() {
        cache.insert(url.to_string(), entry.clone());
    }
}

fn read_remote_cache_from_disk(url: &str) -> Option<RemoteTemplateTextCacheEntry> {
    let file_path = template_remote_cache_file_path(url).ok()?;
    if !file_path.is_file() {
        return None;
    }
    let raw = fs::read_to_string(&file_path).ok()?;
    serde_json::from_str::<RemoteTemplateTextCacheEntry>(&raw).ok()
}

fn write_remote_cache_to_disk(url: &str, entry: &RemoteTemplateTextCacheEntry) {
    let Ok(file_path) = template_remote_cache_file_path(url) else {
        return;
    };
    let Ok(raw) = serde_json::to_string(entry) else {
        return;
    };
    let _ = fs::write(file_path, raw);
}

fn map_cached_entry_to_content(
    url: &str,
    entry: &RemoteTemplateTextCacheEntry,
    allow_not_found: bool,
) -> Result<Option<String>, String> {
    if entry.status == reqwest::StatusCode::NOT_FOUND.as_u16() {
        if allow_not_found {
            return Ok(None);
        }
        return Err(format!("Failed to fetch {}: HTTP 404", url));
    }
    if (200..300).contains(&entry.status) {
        return Ok(entry.content.clone());
    }
    Err(format!("Failed to fetch {}: HTTP {}", url, entry.status))
}

async fn fetch_remote_text_cached(
    client: &reqwest::Client,
    url: &str,
    ttl_seconds: i64,
    allow_not_found: bool,
) -> Result<Option<String>, String> {
    let memory_entry = read_remote_cache_from_memory(url);
    if let Some(entry) = &memory_entry {
        if is_remote_cache_fresh(entry, ttl_seconds) {
            return map_cached_entry_to_content(url, entry, allow_not_found);
        }
    }

    let disk_entry = read_remote_cache_from_disk(url);
    if let Some(entry) = &disk_entry {
        write_remote_cache_to_memory(url, entry);
        if is_remote_cache_fresh(entry, ttl_seconds) {
            return map_cached_entry_to_content(url, entry, allow_not_found);
        }
    }

    let stale_entry = memory_entry.or(disk_entry);
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|err| format!("Failed to fetch {}: {}", url, err));

    let response = match response {
        Ok(resp) => resp,
        Err(err) => {
            if let Some(entry) = stale_entry {
                log_other!(warn, "Use stale cache for {} due to fetch error: {}", url, err);
                return map_cached_entry_to_content(url, &entry, allow_not_found);
            }
            return Err(err);
        }
    };

    let status = response.status();
    if status == reqwest::StatusCode::NOT_FOUND && allow_not_found {
        let entry = RemoteTemplateTextCacheEntry {
            status: status.as_u16(),
            content: None,
            cached_at: chrono::Utc::now().timestamp(),
        };
        write_remote_cache_to_memory(url, &entry);
        write_remote_cache_to_disk(url, &entry);
        return Ok(None);
    }
    if !status.is_success() {
        if let Some(entry) = stale_entry {
            log_other!(
                warn,
                "Use stale cache for {} due to HTTP {}",
                url,
                status
            );
            return map_cached_entry_to_content(url, &entry, allow_not_found);
        }
        return Err(format!("Failed to fetch {}: HTTP {}", url, status));
    }

    let body = response
        .text()
        .await
        .map_err(|err| format!("Failed to read {}: {}", url, err))?;
    let content = if body.trim().is_empty() {
        None
    } else {
        Some(body)
    };
    let entry = RemoteTemplateTextCacheEntry {
        status: status.as_u16(),
        content: content.clone(),
        cached_at: chrono::Utc::now().timestamp(),
    };
    write_remote_cache_to_memory(url, &entry);
    write_remote_cache_to_disk(url, &entry);
    Ok(content)
}

fn normalize_etag_version(raw: &str) -> String {
    raw.trim()
        .trim_start_matches("W/")
        .trim_matches('"')
        .to_string()
}

fn resolve_registry_source_version(
    registry: &TemplateRegistryIndexFile,
    etag: Option<String>,
) -> Option<String> {
    registry
        .version
        .clone()
        .or_else(|| etag.and_then(|value| {
            let normalized = normalize_etag_version(&value);
            if normalized.trim().is_empty() {
                None
            } else {
                Some(normalized)
            }
        }))
}

async fn fetch_template_registry_from_remote() -> Result<RemoteTemplateRegistry, String> {
    let client = reqwest::Client::new();
    let mut errors: Vec<String> = Vec::new();
    for url in resolve_template_index_urls() {
        let body = match fetch_remote_text_cached(
            &client,
            &url,
            TEMPLATE_INDEX_CACHE_TTL_SECONDS,
            false,
        )
        .await
        {
            Ok(Some(text)) => text,
            Ok(None) => {
                errors.push(format!("{}: empty response body", url));
                continue;
            }
            Err(err) => {
                errors.push(err);
                continue;
            }
        };
        let parsed = serde_json::from_str::<TemplateRegistryIndexFile>(&body)
            .map_err(|err| format!("{}: {}", url, err))?;
        if parsed.schema_version.as_deref() != Some(TEMPLATE_SCHEMA_VERSION) {
            errors.push(format!(
                "{}: unsupported schema_version {:?}, expected {}",
                url,
                parsed.schema_version,
                TEMPLATE_SCHEMA_VERSION
            ));
            continue;
        }
        if parsed.templates.is_empty() {
            errors.push(format!("{}: empty templates list", url));
            continue;
        }
        let source_version = resolve_registry_source_version(&parsed, None);
        let source_schema_version = parsed.schema_version.clone();
        let source_signature = parsed.signature.clone();
        log_other!(
            info,
            "Loaded remote template index version={:?}, schema_version={:?}, signature_present={}",
            source_version,
            source_schema_version,
            source_signature.as_ref().is_some_and(|value| !value.trim().is_empty())
        );
        return Ok(RemoteTemplateRegistry {
            registry: parsed,
            source_version,
        });
    }
    Err(format!(
        "Failed to load template index from remote sources: {}",
        errors.join(" | ")
    ))
}

async fn load_template_detail_from_remote_entry(
    client: &reqwest::Client,
    registry_source: Option<&TemplateSourceFile>,
    source_version: Option<String>,
    entry: &TemplateRegistryEntryFile,
) -> Result<TemplateDetailResponse, String> {
    let manifest_path = entry
        .manifest_path
        .clone()
        .unwrap_or_else(|| default_manifest_path(&entry.id));
    let source_for_manifest = entry.source.as_ref().or(registry_source);
    let repo_url = source_for_manifest
        .and_then(|source| source.repo_url.clone())
        .unwrap_or_else(|| DEFAULT_TEMPLATE_SOURCE_REPO.to_string());
    let source_ref = source_for_manifest
        .and_then(|source| source.default_ref.clone())
        .unwrap_or_else(|| DEFAULT_TEMPLATE_SOURCE_REF.to_string());
    let raw_manifest_url = build_raw_file_url(&repo_url, &source_ref, &manifest_path)
        .ok_or_else(|| format!("Unsupported template source repo: {}", repo_url))?;
    let body = fetch_remote_text_cached(
        client,
        &raw_manifest_url,
        TEMPLATE_MANIFEST_CACHE_TTL_SECONDS,
        false,
    )
    .await?
    .ok_or_else(|| format!("Template manifest is empty: {}", raw_manifest_url))?;
    let manifest = serde_json::from_str::<TemplateManifestFile>(&body)
        .map_err(|e| format!("Failed to parse template manifest {}: {}", raw_manifest_url, e))?;
    if manifest.schema_version.as_deref() != Some(TEMPLATE_SCHEMA_VERSION) {
        return Err(format!(
            "Unsupported template manifest schema_version {}: expected {}, got {:?}",
            raw_manifest_url,
            TEMPLATE_SCHEMA_VERSION,
            manifest.schema_version
        ));
    }
    let fallback_path = derive_template_path(&manifest_path, &entry.id);
    let defaults = resolve_template_summary_defaults(
        manifest.source.as_ref(),
        source_for_manifest,
        fallback_path,
        source_version,
    );
    let summary = build_template_summary(&manifest, defaults);
    Ok(TemplateDetailResponse {
        summary,
        variables: manifest.variables.unwrap_or_default(),
        files: manifest.files.unwrap_or_default(),
        env_example: manifest.env_example.clone(),
        runtimes: manifest.runtimes.unwrap_or_default(),
        agent_packs: manifest.agent_packs.unwrap_or_default(),
        skills: manifest.skills.unwrap_or_default(),
        defaults: manifest.defaults,
        post_clone_script: manifest.post_clone_script.unwrap_or_default(),
    })
}

async fn load_all_template_details_from_remote() -> Result<Vec<TemplateDetailResponse>, String> {
    let registry_bundle = fetch_template_registry_from_remote().await?;
    let client = reqwest::Client::new();
    let mut result: Vec<TemplateDetailResponse> = Vec::new();
    for entry in registry_bundle.registry.templates {
        match load_template_detail_from_remote_entry(
            &client,
            registry_bundle.registry.source.as_ref(),
            registry_bundle.source_version.clone(),
            &entry,
        )
        .await
        {
            Ok(detail) => result.push(detail),
            Err(err) => {
                log_other!(warn, "skip remote template {} due to error: {}", entry.id, err);
            }
        }
    }
    if result.is_empty() {
        return Err("No valid templates loaded from remote index".to_string());
    }
    sort_template_details(&mut result);
    Ok(result)
}

async fn load_all_template_details() -> Result<Vec<TemplateDetailResponse>, String> {
    load_all_template_details_from_remote().await
}

#[derive(Clone)]
struct TemplateSwarmConfig {
    swarm_id: String,
    template_id: String,
    name: String,
    description: Option<String>,
    oh_my_opencode_json: Option<String>,
    opencode_json: Option<String>,
    claude_md: Option<String>,
    agents_md: Option<String>,
    skills: Vec<String>,
    template_git_url: Option<String>,
    template_branch: Option<String>,
}

async fn read_template_swarm_files(
    summary: &TemplateSummaryResponse,
) -> Result<(Option<String>, Option<String>, Option<String>, Option<String>), String> {
    async fn fetch_template_file(
        client: &reqwest::Client,
        summary: &TemplateSummaryResponse,
        relative_path: &str,
    ) -> Result<Option<String>, String> {
        let normalized_template_path = normalize_config_path(&summary.template_path);
        let normalized_relative_path = normalize_config_path(relative_path);
        let file_path = if normalized_template_path.trim().is_empty() {
            normalized_relative_path
        } else {
            format!(
                "{}/{}",
                normalized_template_path.trim_end_matches('/'),
                normalized_relative_path
            )
        };
        let raw_url = build_raw_file_url(&summary.source_repo_url, &summary.source_ref, &file_path)
            .ok_or_else(|| {
                format!(
                    "Unsupported template source repo: {}",
                    summary.source_repo_url
                )
            })?;
        fetch_remote_text_cached(
            client,
            &raw_url,
            TEMPLATE_FILE_CACHE_TTL_SECONDS,
            true,
        )
        .await
    }

    let client = reqwest::Client::new();
    let oh_my_opencode_json =
        fetch_template_file(&client, summary, ".opencode/oh-my-opencode.jsonc").await?;
    let opencode_json = fetch_template_file(&client, summary, "opencode.json").await?;
    let claude_md = fetch_template_file(&client, summary, "CLAUDE.md").await?;
    let agents_md = fetch_template_file(&client, summary, "AGENTS.md").await?;

    Ok((oh_my_opencode_json, opencode_json, claude_md, agents_md))
}

async fn load_template_swarm_config_by_id(swarm_id: &str) -> Result<TemplateSwarmConfig, String> {
    let template_id = swarm_id
        .strip_prefix(OFFICIAL_SWARM_ID_PREFIX)
        .unwrap_or(swarm_id)
        .to_string();
    let details = load_all_template_details().await?;
    let detail = details
        .into_iter()
        .find(|item| item.summary.id == template_id)
        .ok_or_else(|| "Swarm not found".to_string())?;
    let (oh_my_opencode_json, opencode_json, claude_md, agents_md) =
        read_template_swarm_files(&detail.summary).await?;
    if opencode_json
        .as_ref()
        .map(|content| content.trim().is_empty())
        .unwrap_or(true)
    {
        return Err(format!(
            "Template {} is missing required file: opencode.json",
            detail.summary.id
        ));
    }
    let description = if detail.summary.description.trim().is_empty() {
        None
    } else {
        Some(detail.summary.description.trim().to_string())
    };
    Ok(TemplateSwarmConfig {
        swarm_id: official_swarm_id(&detail.summary.id),
        template_id: detail.summary.id,
        name: detail.summary.name,
        description,
        oh_my_opencode_json,
        opencode_json,
        claude_md,
        agents_md,
        skills: detail.skills,
        template_git_url: Some(detail.summary.source_repo_url),
        template_branch: Some(detail.summary.source_ref),
    })
}

fn build_swarm_response_from_template(
    config: TemplateSwarmConfig,
    projects_count: i32,
) -> SwarmResponse {
    let now = chrono::Utc::now().timestamp();
    let skills_json = if config.skills.is_empty() {
        None
    } else {
        serde_json::to_string(&config.skills).ok()
    };
    let mcps_count = config
        .opencode_json
        .as_ref()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(raw).ok())
        .map(|value| {
            value
                .get("mcp")
                .and_then(|mcp| mcp.get("servers"))
                .and_then(|servers| servers.as_object())
                .map(|servers| servers.len() as i32)
                .unwrap_or(0)
        })
        .unwrap_or(0);
    let init_plan = build_swarm_init_plan(
        Some(&config.template_id),
        config.oh_my_opencode_json.as_ref(),
        config.opencode_json.as_ref(),
        config.claude_md.as_ref(),
        config.agents_md.as_ref(),
        &config.skills,
        false,
        config.template_git_url.as_ref(),
        config.template_branch.as_ref(),
    );
    SwarmResponse {
        id: config.swarm_id,
        source_type: "official".to_string(),
        template_id: Some(config.template_id),
        name: config.name,
        description: config.description,
        cli: "opencode".to_string(),
        default_model_id: None,
        oh_my_opencode_json: config.oh_my_opencode_json,
        opencode_json: config.opencode_json,
        skills_json,
        agents_json: None,
        mcps_count,
        accent: "amber".to_string(),
        claude_md: config.claude_md,
        agents_md: config.agents_md,
        include_template: false,
        template_git_url: config.template_git_url,
        template_branch: config.template_branch,
        created_at: timestamp_to_iso(Some(now)),
        updated_at: timestamp_to_iso(Some(now)),
        skills_count: config.skills.len() as i32,
        agents: Vec::new(),
        projects_count,
        init_plan,
    }
}

fn get_swarm_skills_dir(swarm_id: &str) -> PathBuf {
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

fn copy_dir_recursive(src: &StdPath, dst: &StdPath) -> Result<(), String> {
    if !dst.exists() {
        fs::create_dir_all(dst)
            .map_err(|e| format!("Failed to create directory {:?}: {}", dst, e))?;
    }

    for entry in fs::read_dir(src).map_err(|e| format!("Failed to read directory {:?}: {}", src, e))? {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let entry_type = entry
            .file_type()
            .map_err(|e| format!("Failed to get file type for {:?}: {}", entry.path(), e))?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if entry_type.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)
                .map_err(|e| format!("Failed to copy {:?} to {:?}: {}", src_path, dst_path, e))?;
        }
    }

    Ok(())
}

fn normalize_skill_names(selected_skills: &[String]) -> Vec<String> {
    let mut normalized = Vec::new();
    for item in selected_skills {
        let name = item.trim();
        if name.is_empty() {
            continue;
        }
        if !normalized.iter().any(|existing: &String| existing == name) {
            normalized.push(name.to_string());
        }
    }
    normalized
}

fn sync_swarm_skills_from_hub(swarm_id: &str, selected_skills: &[String]) -> Result<(), String> {
    let settings = load_settings();
    let hub_dir = resolve_skills_hub_dir(settings.skills_hub_dir.as_deref());
    let hub_skills_root = hub_dir.join(".agents").join("skills");
    let swarm_skills_dir = get_swarm_skills_dir(swarm_id);

    if swarm_skills_dir.exists() {
        fs::remove_dir_all(&swarm_skills_dir)
            .map_err(|e| format!("Failed to clean swarm skills directory {:?}: {}", swarm_skills_dir, e))?;
    }

    let normalized = normalize_skill_names(selected_skills);

    if normalized.is_empty() {
        return Ok(());
    }

    fs::create_dir_all(&swarm_skills_dir)
        .map_err(|e| format!("Failed to create swarm skills directory {:?}: {}", swarm_skills_dir, e))?;

    for skill_name in normalized {
        let src = hub_skills_root.join(&skill_name);
        let dst = swarm_skills_dir.join(&skill_name);
        if !src.exists() || !src.is_dir() {
            log_other!(
                warn,
                "[swarm_skills_sync] Skill '{}' not found in Skills Hub at {:?}, skip",
                skill_name,
                src
            );
            continue;
        }
        copy_dir_recursive(&src, &dst)?;
    }

    Ok(())
}

fn sync_project_skills_from_hub(repo_path: &str, selected_skills: &[String]) -> Result<(Vec<String>, Vec<String>), String> {
    let normalized = normalize_skill_names(selected_skills);
    if normalized.is_empty() {
        return Ok((Vec::new(), Vec::new()));
    }
    let settings = load_settings();
    let hub_dir = resolve_skills_hub_dir(settings.skills_hub_dir.as_deref());
    let hub_skills_root = hub_dir.join(".agents").join("skills");
    let project_skills_dir = PathBuf::from(repo_path).join(".opencode").join("skills");
    fs::create_dir_all(&project_skills_dir)
        .map_err(|e| format!("Failed to create project skills directory {:?}: {}", project_skills_dir, e))?;

    let mut copied_skills = Vec::new();
    let mut missing_skills = Vec::new();
    for skill_name in normalized {
        let src = hub_skills_root.join(&skill_name);
        let dst = project_skills_dir.join(&skill_name);
        let src_skill_md = src.join("skill.md");
        if !src.is_dir() || !src_skill_md.is_file() {
            missing_skills.push(skill_name);
            continue;
        }
        if dst.exists() {
            if dst.is_dir() {
                fs::remove_dir_all(&dst)
                    .map_err(|e| format!("Failed to clean skill directory {:?}: {}", dst, e))?;
            } else {
                fs::remove_file(&dst)
                    .map_err(|e| format!("Failed to remove skill file {:?}: {}", dst, e))?;
            }
        }
        copy_dir_recursive(&src, &dst)?;
        copied_skills.push(skill_name);
    }

    Ok((copied_skills, missing_skills))
}

fn require_opencode_json_content(
    raw: Option<String>,
    context: &str,
    template_id: &str,
) -> Result<String, String> {
    match raw {
        Some(content) if !content.trim().is_empty() => Ok(content),
        _ => Err(format!(
            "[{}] Template {} is missing required file: opencode.json",
            context, template_id
        )),
    }
}

// ============ Workspace Management Types ============

#[derive(serde::Deserialize)]
pub struct CreateWorkspaceRequest {
    pub repo_path: String,
    pub branch: String,
    pub base_branch: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct GetWorktreeStatusRequest {
    pub repo_path: String,
    pub worktree_path: String,
}

#[derive(serde::Deserialize)]
pub struct GetDiffStatsRequest {
    pub repo_path: String,
    pub worktree_path: String,
    pub target_branch: String,
}

// ============ Session API Types ============

#[derive(serde::Deserialize)]
pub struct CreateSessionRequest {
    pub workspace_id: String,
    pub executor: Option<String>,
    pub working_dir: Option<String>,
    #[serde(rename = "model")]
    pub model_id: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionFollowUpRequest {
    pub prompt: String,
    pub executor_profile_id: ExecutorProfileId,
    pub model: Option<String>, // 模型字段
    pub agent: Option<String>, // 代理字段
    pub image_ids: Option<Vec<String>>,
    pub retry_process_id: Option<String>,
    pub force_when_dirty: Option<bool>,
    pub perform_git_reset: Option<bool>,
}

#[derive(serde::Deserialize)]
pub struct ExecutorProfileId {
    pub executor: String,
    pub variant: Option<String>,
}

#[derive(serde::Serialize, Clone)]
pub struct Session {
    pub id: String,
    pub workspace_id: String,
    pub executor: Option<String>,
    pub working_dir: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(serde::Serialize, Clone)]
pub struct ExecutionProcess {
    pub id: String,
    pub session_id: String,
    pub run_reason: String,
    pub executor_action: Option<serde_json::Value>,
    pub status: String,
    pub exit_code: Option<i32>,
    pub dropped: bool,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(serde::Deserialize)]
pub struct SessionQuery {
    pub workspace_id: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct ExecutionProcessStreamQuery {
    pub session_id: String,
    pub show_soft_deleted: Option<bool>,
}

// ============ Git API Types ============

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffRequest {
    pub worktree_path: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchStatusRequest {
    pub worktree_path: String,
    pub target_branch: String,
}

#[derive(serde::Serialize)]
pub struct FileDiff {
    pub path: String,
    pub status: String,
    pub additions: i32,
    pub deletions: i32,
    pub diff: Option<String>,
}

#[derive(serde::Serialize)]
pub struct GitBranchStatusResponse {
    pub commits_ahead: i32,
    pub commits_behind: i32,
    pub has_uncommitted_changes: bool,
    pub conflicted_files: Vec<String>,
    pub current_branch: String,
    pub is_rebase_in_progress: bool,
    pub is_merge_in_progress: bool,
    pub conflict_op: Option<String>,
}

/// 查询参数: /api/git/branches?path=xxx
#[derive(serde::Deserialize)]
pub struct GitBranchesQuery {
    pub path: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeListFilesRequest {
    pub worktree_path: String,
    pub path: Option<String>,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeFileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub modified_at: Option<String>,
    pub is_previewable: bool,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeReadFileRequest {
    pub worktree_path: String,
    pub path: String,
    pub max_bytes: Option<usize>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeFilePreview {
    pub path: String,
    pub content: Option<String>,
    pub truncated: bool,
    pub is_binary: bool,
    pub size: u64,
    pub language: Option<String>,
}

// ============ Session API Handlers ============

/// In-memory session storage (simplified - in production would use database)
lazy_static::lazy_static! {
    static ref SESSIONS: Arc<RwLock<std::collections::HashMap<String, Session>>> = 
        Arc::new(RwLock::new(std::collections::HashMap::new()));
    static ref EXECUTION_PROCESSES: Arc<RwLock<std::collections::HashMap<String, Vec<ExecutionProcess>>>> = 
        Arc::new(RwLock::new(std::collections::HashMap::new()));
    /// Broadcast channel for execution process status updates.
    /// Sends (session_id, ExecutionProcess) when a process is created or updated.
    static ref PROCESS_UPDATES: (broadcast::Sender<(String, ExecutionProcess)>, ()) = {
        let (tx, _) = broadcast::channel(64);
        (tx, ())
    };
    /// Channel for process status updates from agent_manager.
    /// Sends (session_id, process_id, new_status, exit_code) when a process exits.
    static ref PROCESS_STATUS_UPDATES: (broadcast::Sender<ProcessStatusUpdate>, broadcast::Receiver<ProcessStatusUpdate>) = {
        let (tx, rx) = broadcast::channel(64);
        (tx, rx)
    };
    static ref REMOTE_ACCESS_RUNTIME: Arc<RwLock<RemoteAccessRuntime>> =
        Arc::new(RwLock::new(RemoteAccessRuntime {
            enabled: false,
            device_id: None,
            pairing_key: None,
            relay_url: None,
            connection_state: "disabled".to_string(),
            last_error: None,
        }));
    static ref REMOTE_ACCESS_TASK: Arc<RwLock<Option<tokio::task::JoinHandle<()>>>> =
        Arc::new(RwLock::new(None));
}

/// Process status update message sent from agent_manager when a process exits.
#[derive(Debug, Clone)]
pub struct ProcessStatusUpdate {
    pub session_id: String,
    pub process_id: String,
    pub status: String,
    pub exit_code: Option<i32>,
}

/// Get a sender for process status updates (used by agent_manager).
pub fn get_process_status_sender() -> broadcast::Sender<ProcessStatusUpdate> {
    PROCESS_STATUS_UPDATES.0.clone()
}

#[derive(Debug, Clone)]
struct DbExecutionContext {
    workspace_id: String,
    session_id: String,
    executor_name: String,
    working_dir: String,
    process_status: String,
}

async fn get_db_pool_from_manager(
    process_manager: &Arc<RwLock<AgentProcessManager>>,
) -> Option<Arc<SqlitePool>> {
    let manager = process_manager.read().await;
    manager.db_pool()
}

async fn load_execution_context_from_db(
    process_manager: &Arc<RwLock<AgentProcessManager>>,
    exec_id: &str,
) -> Option<DbExecutionContext> {
    let pool = get_db_pool_from_manager(process_manager).await?;
    let row = sqlx::query(
        r#"
        SELECT
            ep.workspace_id AS workspace_id,
            ep.session_id AS session_id,
            ep.status AS process_status,
            s.agent_cli AS session_agent_cli,
            w.agent_working_dir AS agent_working_dir
        FROM execution_processes ep
        LEFT JOIN sessions s ON s.id = ep.session_id
        LEFT JOIN workspaces w ON w.id = ep.workspace_id
        WHERE ep.id = $1
        LIMIT 1
        "#,
    )
    .bind(exec_id)
    .fetch_optional(pool.as_ref())
    .await
    .ok()
    .flatten()?;

    let workspace_id: String = row.get("workspace_id");
    let session_id: String = row.get("session_id");
    let process_status: String = row.get("process_status");
    let executor_name = row
        .try_get::<String, _>("session_agent_cli")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| "opencode".to_string());
    let working_dir = row
        .try_get::<String, _>("agent_working_dir")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| "/tmp".to_string());

    Some(DbExecutionContext {
        workspace_id,
        session_id,
        executor_name,
        working_dir,
        process_status,
    })
}

async fn persist_execution_status_to_db(
    process_manager: &Arc<RwLock<AgentProcessManager>>,
    process_id: &str,
    status: &str,
    exit_code: Option<i32>,
) -> Result<(), String> {
    let Some(pool) = get_db_pool_from_manager(process_manager).await else {
        return Ok(());
    };
    let now_ts = chrono::Utc::now().timestamp();
    let completed_at: Option<i64> = match status {
        "completed" | "failed" | "killed" => Some(now_ts),
        _ => None,
    };

    sqlx::query(
        r#"
        UPDATE execution_processes
        SET status = $1,
            exit_code = $2,
            completed_at = COALESCE($3, completed_at),
            updated_at = $4
        WHERE id = $5
        "#,
    )
    .bind(status)
    .bind(exit_code)
    .bind(completed_at)
    .bind(now_ts)
    .bind(process_id)
    .execute(pool.as_ref())
    .await
    .map_err(|e| format!("Failed to persist execution status to DB: {e}"))?;

    Ok(())
}

/// Update execution process status and broadcast the change.
/// This is used by agent_manager to signal process completion/failure.
pub async fn update_execution_process_status(
    session_id: &str,
    process_id: &str,
    new_status: &str,
    exit_code: Option<i32>,
) -> Result<(), String> {
    log_other!(info,
        "[HTTP_SERVER] Updating process {} in session {} to status: {}",
        process_id,
        session_id,
        new_status
    );

    let now = chrono::Utc::now().to_rfc3339();

    // Update the process in EXECUTION_PROCESSES
    let updated_process = {
        let mut processes = EXECUTION_PROCESSES.write().await;
        let Some(session_processes) = processes.get_mut(session_id) else {
            log_other!(info,
                "[HTTP_SERVER] Skip in-memory status update: session {} not found",
                session_id
            );
            return Ok(());
        };

        // Find and update the process
        let Some(process) = session_processes.iter_mut().find(|p| p.id == process_id) else {
            log_other!(info,
                "[HTTP_SERVER] Skip in-memory status update: process {} not found in session {}",
                process_id, session_id
            );
            return Ok(());
        };

        process.status = new_status.to_string();
        process.exit_code = exit_code;
        process.updated_at = now.clone();
        if new_status == "completed" || new_status == "failed" || new_status == "killed" {
            process.completed_at = Some(now);
        }

        log_other!(info,
            "[HTTP_SERVER] Process {} updated: status={}, exit_code={:?}",
            process_id,
            process.status,
            process.exit_code
        );

        process.clone()
    };

    // Broadcast the update via PROCESS_UPDATES
    let _ = PROCESS_UPDATES.0.send((session_id.to_string(), updated_process));

    Ok(())
}

/// Start a background task that listens for process status updates from agent_manager
/// and applies them to DB + in-memory mirrors.
pub fn start_process_status_update_listener(
    process_manager: Arc<RwLock<AgentProcessManager>>,
) {
    let mut rx = PROCESS_STATUS_UPDATES.0.subscribe();

    tokio::spawn(async move {
        log_other!(info, "[HTTP_SERVER] Starting process status update listener");
        loop {
            match rx.recv().await {
                Ok(update) => {
                    log_other!(info,
                        "[HTTP_SERVER] Received status update: session={}, process={}, status={}",
                        update.session_id,
                        update.process_id,
                        update.status
                    );

                    if let Err(e) = persist_execution_status_to_db(
                        &process_manager,
                        &update.process_id,
                        &update.status,
                        update.exit_code,
                    )
                    .await
                    {
                        log::error!("[HTTP_SERVER] Failed to persist process status to DB: {}", e);
                    }

                    // Apply the update
                    if let Err(e) = update_execution_process_status(
                        &update.session_id,
                        &update.process_id,
                        &update.status,
                        update.exit_code,
                    ).await {
                        log::error!("[HTTP_SERVER] Failed to update process status: {}", e);
                    }
                }
                Err(broadcast::error::RecvError::Closed) => {
                    log_other!(warn, "[HTTP_SERVER] Process status update channel closed");
                    break;
                }
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    log_other!(warn, "[HTTP_SERVER] Process status update channel lagged by {} messages", n);
                }
            }
        }
    });
}

async fn create_session(
    Json(payload): Json<CreateSessionRequest>,
) -> Result<Json<ApiResponse<Session>>, String> {
    log_other!(info, "Creating session for workspace: {}, model: {:?}", payload.workspace_id, payload.model_id);

    let session_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let session = Session {
        id: session_id.clone(),
        workspace_id: payload.workspace_id,
        executor: payload.executor,
        working_dir: payload.working_dir,
        model_id: payload.model_id,
        created_at: now.clone(),
        updated_at: now,
    };

    // Store session
    SESSIONS.write().await.insert(session_id.clone(), session.clone());

    // Initialize empty execution processes list for this session
    EXECUTION_PROCESSES.write().await.insert(session_id, vec![]);

    log_other!(info,
        "Session created: id={}, workspace={}, executor={:?}, working_dir={:?}, model_id={:?}",
        session.id,
        session.workspace_id,
        session.executor,
        session.working_dir,
        session.model_id
    );

    Ok(Json(ApiResponse::success(session)))
}

async fn get_sessions(
    State(state): State<HttpServerState>,
    Query(query): Query<SessionQuery>,
) -> Result<Json<ApiResponse<Vec<Session>>>, String> {
    log_other!(info, "[get_sessions] Getting sessions for workspace: {:?}", query.workspace_id);

    // 优先从数据库读取（服务器重启后内存中 SESSIONS 为空）
    if let Some(pool) = get_db_pool_from_manager(&state.process_manager).await {
        log_other!(info, "[get_sessions] Reading sessions from database");

        let result: Vec<Session> = if let Some(workspace_id) = &query.workspace_id {
            // 从数据库查询指定 workspace 的 sessions
            // 注意：数据库列名为 agent_cli，但 Rust 结构体字段名为 executor
            let rows = sqlx::query(
                r#"SELECT id, workspace_id, agent_cli, created_at, updated_at
                   FROM sessions
                   WHERE workspace_id = $1
                   ORDER BY updated_at DESC"#
            )
            .bind(workspace_id)
            .fetch_all(pool.as_ref())  // 使用 pool.as_ref() 获取 &SqlitePool
            .await
            .map_err(|e| format!("Failed to query sessions from DB: {}", e))?;

            rows.into_iter().filter_map(|row| {
                let created_at: Option<i64> = row.try_get("created_at").ok();
                let updated_at: Option<i64> = row.try_get("updated_at").ok();
                Some(Session {
                    id: row.get("id"),
                    workspace_id: row.get("workspace_id"),
                    executor: row.try_get("agent_cli").ok(),  // 将数据库的 agent_cli 映射到 executor 字段
                    working_dir: None,
                    model_id: None,
                    created_at: timestamp_to_iso(created_at),
                    updated_at: timestamp_to_iso(updated_at),
                })
            }).collect()
        } else {
            // 查询所有 sessions
            let rows = sqlx::query(
                r#"SELECT id, workspace_id, agent_cli, created_at, updated_at
                   FROM sessions
                   ORDER BY updated_at DESC"#
            )
            .fetch_all(pool.as_ref())  // 使用 pool.as_ref() 获取 &SqlitePool
            .await
            .map_err(|e| format!("Failed to query all sessions from DB: {}", e))?;

            rows.into_iter().filter_map(|row| {
                let created_at: Option<i64> = row.try_get("created_at").ok();
                let updated_at: Option<i64> = row.try_get("updated_at").ok();
                Some(Session {
                    id: row.get("id"),
                    workspace_id: row.get("workspace_id"),
                    executor: row.try_get("agent_cli").ok(),  // 将数据库的 agent_cli 映射到 executor 字段
                    working_dir: None,
                    model_id: None,
                    created_at: timestamp_to_iso(created_at),
                    updated_at: timestamp_to_iso(updated_at),
                })
            }).collect()
        };

        log_other!(info, "[get_sessions] Returning {} sessions from database", result.len());
        return Ok(Json(ApiResponse::success(result)));
    }

    // Fallback: 从内存中读取（仅当数据库不可用时）
    log_other!(warn, "[get_sessions] Database not available, using in-memory SESSIONS");
    let sessions = SESSIONS.read().await;
    let result: Vec<Session> = if let Some(workspace_id) = query.workspace_id {
        sessions.values()
            .filter(|s| s.workspace_id == workspace_id)
            .cloned()
            .collect()
    } else {
        sessions.values().cloned().collect()
    };

    Ok(Json(ApiResponse::success(result)))
}

async fn get_session(
    Path(session_id): Path<String>,
    State(state): State<HttpServerState>,
) -> Result<Json<ApiResponse<Session>>, String> {
    log_other!(info, "[get_session] Getting session: {}", session_id);

    // 优先从数据库读取（服务器重启后内存中 SESSIONS 为空）
    if let Some(pool) = get_db_pool_from_manager(&state.process_manager).await {
        log_other!(info, "[get_session] Reading session from database");

        let row = sqlx::query(
            r#"SELECT id, workspace_id, agent_cli, created_at, updated_at
               FROM sessions
               WHERE id = $1"#
        )
        .bind(&session_id)
        .fetch_optional(pool.as_ref())
        .await
        .map_err(|e| format!("Failed to query session from DB: {}", e))?;

        if let Some(row) = row {
            let created_at: Option<i64> = row.try_get("created_at").ok();
            let updated_at: Option<i64> = row.try_get("updated_at").ok();
            let session = Session {
                id: row.get("id"),
                workspace_id: row.get("workspace_id"),
                executor: row.try_get("agent_cli").ok(),
                working_dir: None,
                model_id: None,
                created_at: timestamp_to_iso(created_at),
                updated_at: timestamp_to_iso(updated_at),
            };
            return Ok(Json(ApiResponse::success(session)));
        }
    }

    // Fallback: 从内存中读取（仅当数据库不可用时）
    log_other!(warn, "[get_session] Database not available, using in-memory SESSIONS");
    let sessions = SESSIONS.read().await;
    let session = sessions.get(&session_id)
        .cloned()
        .ok_or_else(|| "Session not found".to_string())?;

    Ok(Json(ApiResponse::success(session)))
}

/// Query parameters for session processes
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionProcessesQuery {
    pub show_soft_deleted: Option<bool>,
}

/// Request body for creating execution process
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProcessRequest {
    pub workspace_id: String,
    #[serde(rename = "runReason")]
    pub run_reason: Option<String>,
    pub pid: Option<i32>,
}

/// Get execution processes for a session
async fn get_session_processes(
    Path(session_id): Path<String>,
    Query(query): Query<SessionProcessesQuery>,
    State(state): State<HttpServerState>,
) -> Result<Json<ApiResponse<Vec<ExecutionProcess>>>, String> {
    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;

    let show_deleted = query.show_soft_deleted.unwrap_or(false);

    let rows = if show_deleted {
        sqlx::query(
            "SELECT id, session_id, workspace_id, run_reason, executor_action, status, exit_code, dropped,
                    started_at, completed_at, created_at, updated_at
             FROM execution_processes WHERE session_id = $1 ORDER BY started_at ASC"
        )
        .bind(&session_id)
        .fetch_all(pool.as_ref())
        .await
    } else {
        sqlx::query(
            "SELECT id, session_id, workspace_id, run_reason, executor_action, status, exit_code, dropped,
                    started_at, completed_at, created_at, updated_at
             FROM execution_processes WHERE session_id = $1 AND dropped = 0 ORDER BY started_at ASC"
        )
        .bind(&session_id)
        .fetch_all(pool.as_ref())
        .await
    }.map_err(|e| format!("Failed to fetch execution processes: {}", e))?;

    let processes: Vec<ExecutionProcess> = rows
        .into_iter()
        .filter_map(|row| {
            let executor_action: Option<String> = row.try_get("executor_action").ok();
            let executor_action = executor_action.and_then(|s| serde_json::from_str(&s).ok());

            Some(ExecutionProcess {
                id: row.try_get("id").ok()?,
                session_id: row.try_get("session_id").ok()?,
                run_reason: row.try_get("run_reason").ok()?,
                executor_action,
                status: row.try_get("status").ok()?,
                exit_code: row.try_get("exit_code").ok(),
                dropped: row.try_get::<i32, _>("dropped").unwrap_or(0) == 1,
                started_at: timestamp_to_iso(row.try_get("started_at").ok()),
                completed_at: Some(timestamp_to_iso(row.try_get("completed_at").ok())),
                created_at: timestamp_to_iso(row.try_get("created_at").ok()),
                updated_at: timestamp_to_iso(row.try_get("updated_at").ok()),
            })
        })
        .collect();

    Ok(Json(ApiResponse::success(processes)))
}

/// Create execution process for a session
async fn create_session_process(
    Path(session_id): Path<String>,
    State(state): State<HttpServerState>,
    Json(payload): Json<CreateProcessRequest>,
) -> Result<Json<ApiResponse<ExecutionProcess>>, String> {
    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;

    let uuid_str = uuid::Uuid::new_v4().to_string();
    let uuid_short = &uuid_str[..8];
    let process_id = format!("proc-{}-{}", chrono::Utc::now().timestamp(), uuid_short);
    let now = chrono::Utc::now().timestamp();
    let run_reason = payload.run_reason.unwrap_or_else(|| "codingagent".to_string());

    sqlx::query(
        "INSERT INTO execution_processes (id, session_id, workspace_id, run_reason, status, started_at, created_at, updated_at, dropped)
         VALUES ($1, $2, $3, $4, 'running', $5, $6, $7, 0)"
    )
    .bind(&process_id)
    .bind(&session_id)
    .bind(&payload.workspace_id)
    .bind(&run_reason)
    .bind(now)
    .bind(now)
    .bind(now)
    .execute(pool.as_ref())
    .await
    .map_err(|e| format!("Failed to create execution process: {}", e))?;

    let process = ExecutionProcess {
        id: process_id.clone(),
        session_id,
        run_reason,
        executor_action: None,
        status: "running".to_string(),
        exit_code: None,
        dropped: false,
        started_at: timestamp_to_iso(Some(now)),
        completed_at: None,
        created_at: timestamp_to_iso(Some(now)),
        updated_at: timestamp_to_iso(Some(now)),
    };

    Ok(Json(ApiResponse::success(process)))
}

/// Request body for patching execution process
#[derive(serde::Deserialize)]
pub struct PatchExecutionProcessRequest {
    pub status: String,
    #[serde(rename = "exitCode", alias = "exit_code")]
    pub exit_code: Option<i32>,
}

/// Get single execution process by ID
async fn get_execution_process_by_id(
    Path(process_id): Path<String>,
    State(state): State<HttpServerState>,
) -> Result<Json<ApiResponse<ExecutionProcess>>, String> {
    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;

    let row = sqlx::query(
        "SELECT id, session_id, workspace_id, run_reason, executor_action, status, exit_code, dropped,
                started_at, completed_at, created_at, updated_at
         FROM execution_processes WHERE id = $1 LIMIT 1"
    )
    .bind(&process_id)
    .fetch_optional(pool.as_ref())
    .await
    .map_err(|e| format!("Failed to fetch execution process: {}", e))?;

    match row {
        Some(r) => {
            let executor_action: Option<String> = r.try_get("executor_action").ok();
            let executor_action = executor_action.and_then(|s| serde_json::from_str(&s).ok());

            let process = ExecutionProcess {
                id: r.try_get("id").map_err(|e| format!("Failed to get id: {}", e))?,
                session_id: r.try_get("session_id").map_err(|e| format!("Failed to get session_id: {}", e))?,
                run_reason: r.try_get("run_reason").map_err(|e| format!("Failed to get run_reason: {}", e))?,
                executor_action,
                status: r.try_get("status").map_err(|e| format!("Failed to get status: {}", e))?,
                exit_code: r.try_get("exit_code").ok(),
                dropped: r.try_get::<i32, _>("dropped").unwrap_or(0) == 1,
                started_at: timestamp_to_iso(r.try_get("started_at").ok()),
                completed_at: Some(timestamp_to_iso(r.try_get("completed_at").ok())),
                created_at: timestamp_to_iso(r.try_get("created_at").ok()),
                updated_at: timestamp_to_iso(r.try_get("updated_at").ok()),
            };
            Ok(Json(ApiResponse::success(process)))
        }
        None => Err("Execution process not found".to_string()),
    }
}

/// Patch execution process (update status and exit_code)
async fn patch_execution_process(
    Path(process_id): Path<String>,
    State(state): State<HttpServerState>,
    Json(payload): Json<PatchExecutionProcessRequest>,
) -> Result<Json<ApiResponse<ExecutionProcess>>, String> {
    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;

    let now = chrono::Utc::now().timestamp();
    let is_terminal = ["completed", "failed", "killed"].contains(&payload.status.as_str());
    let completed_at = if is_terminal { Some(now) } else { None };

    let result = sqlx::query(
        "UPDATE execution_processes SET status = $1, exit_code = $2, completed_at = COALESCE($3, completed_at), updated_at = $4
         WHERE id = $5"
    )
    .bind(&payload.status)
    .bind(payload.exit_code)
    .bind(completed_at)
    .bind(now)
    .bind(&process_id)
    .execute(pool.as_ref())
    .await
    .map_err(|e| format!("Failed to update execution process: {}", e))?;

    if result.rows_affected() == 0 {
        return Err("Execution process not found".to_string());
    }

    // Fetch and return updated process
    let row = sqlx::query(
        "SELECT id, session_id, workspace_id, run_reason, executor_action, status, exit_code, dropped,
                started_at, completed_at, created_at, updated_at
         FROM execution_processes WHERE id = $1 LIMIT 1"
    )
    .bind(&process_id)
    .fetch_optional(pool.as_ref())
    .await
    .map_err(|e| format!("Failed to fetch updated execution process: {}", e))?;

    match row {
        Some(r) => {
            let executor_action: Option<String> = r.try_get("executor_action").ok();
            let executor_action = executor_action.and_then(|s| serde_json::from_str(&s).ok());

            let process = ExecutionProcess {
                id: r.try_get("id").map_err(|e| format!("Failed to get id: {}", e))?,
                session_id: r.try_get("session_id").map_err(|e| format!("Failed to get session_id: {}", e))?,
                run_reason: r.try_get("run_reason").map_err(|e| format!("Failed to get run_reason: {}", e))?,
                executor_action,
                status: r.try_get("status").map_err(|e| format!("Failed to get status: {}", e))?,
                exit_code: r.try_get("exit_code").ok(),
                dropped: r.try_get::<i32, _>("dropped").unwrap_or(0) == 1,
                started_at: timestamp_to_iso(r.try_get("started_at").ok()),
                completed_at: Some(timestamp_to_iso(r.try_get("completed_at").ok())),
                created_at: timestamp_to_iso(r.try_get("created_at").ok()),
                updated_at: timestamp_to_iso(r.try_get("updated_at").ok()),
            };
            Ok(Json(ApiResponse::success(process)))
        }
        None => Err("Execution process not found".to_string()),
    }
}

async fn session_follow_up(
    State(state): State<HttpServerState>,
    Path(session_id): Path<String>,
    Json(payload): Json<SessionFollowUpRequest>,
) -> Result<Json<ApiResponse<ExecutionProcess>>, String> {
    log_other!(info, "Session follow-up: session={}, prompt={}, model={:?}", session_id, payload.prompt, payload.model);

    // Get session to find workspace_id
    // 首先尝试从内存获取，如果找不到则从数据库加载
    let session = {
        let sessions = SESSIONS.read().await;
        sessions.get(&session_id).cloned()
    };

    let session = if let Some(s) = session {
        s
    } else {
        // 内存中找不到，尝试从数据库加载
        log_other!(info, "[session_follow_up] Session not found in memory, loading from database: {}", session_id);

        let pool = get_db_pool_from_manager(&state.process_manager)
            .await
            .ok_or("Session not found in memory and database not available")?;

        let row = sqlx::query(
            r#"SELECT id, workspace_id, agent_cli, created_at, updated_at
               FROM sessions
               WHERE id = $1"#
        )
        .bind(&session_id)
        .fetch_optional(pool.as_ref())
        .await
        .map_err(|e| format!("Failed to query session from DB: {}", e))?;

        if let Some(row) = row {
            let created_at: Option<i64> = row.try_get("created_at").ok();
            let updated_at: Option<i64> = row.try_get("updated_at").ok();
            let session_from_db = Session {
                id: row.get("id"),
                workspace_id: row.get("workspace_id"),
                executor: row.try_get("agent_cli").ok(),
                working_dir: None,
                model_id: None,
                created_at: timestamp_to_iso(created_at),
                updated_at: timestamp_to_iso(updated_at),
            };

            // 将从数据库加载的 session 存入内存
            SESSIONS.write().await.insert(session_id.clone(), session_from_db.clone());
            log_other!(info, "[session_follow_up] Loaded session from database and cached: {}", session_id);
            session_from_db
        } else {
            return Err(format!("Session '{}' not found in memory or database", session_id));
        }
    };

    let workspace_id = session.workspace_id.clone();
    // 使用 session 中存储的 model_id 作为后备
    let session_model_id = session.model_id.clone();

    // 确定最终使用的模型：优先使用 payload.model，否则使用 session.model_id
    let effective_model = payload.model.as_ref().or(session_model_id.as_ref());

    // 获取 working_dir：如果 session 没有，则从 workspace 查询
    let working_dir = if let Some(ref wd) = session.working_dir {
        if !wd.trim().is_empty() {
            wd.clone()
        } else {
            // session.working_dir 为空，从 workspace 查询
            resolve_workspace_working_dir(&state, &workspace_id).await
        }
    } else {
        // session.working_dir 为 None，从 workspace 查询
        resolve_workspace_working_dir(&state, &workspace_id).await
    };
    let prompt_for_execution = if let Some(image_ids) = payload.image_ids.as_ref() {
        if image_ids.is_empty() {
            payload.prompt.clone()
        } else {
            let pool = get_db_pool_from_manager(&state.process_manager)
                .await
                .ok_or("Database pool not available")?;
            let image_paths = materialize_images_to_worktree(pool.as_ref(), std::path::Path::new(&working_dir), image_ids).await?;
            append_image_paths_to_prompt(&payload.prompt, &image_paths)
        }
    } else {
        payload.prompt.clone()
    };
    
    // Determine whether this is the first turn in this session.
    let is_first_turn = {
        let processes = EXECUTION_PROCESSES.read().await;
        processes.get(&session_id).map(|v| v.is_empty()).unwrap_or(true)
    };

    // Create execution process record
    let process_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let executor_action = if is_first_turn {
        serde_json::json!({
            "typ": {
                "type": "CodingAgentInitialRequest",
                "prompt": prompt_for_execution.clone(),
                "executor_profile_id": {
                    "executor": payload.executor_profile_id.executor.clone(),
                    "variant": payload.executor_profile_id.variant.clone()
                },
                "working_dir": working_dir,
                "agent": payload.agent
            },
            "next_action": null
        })
    } else {
        serde_json::json!({
            "typ": {
                "type": "CodingAgentFollowUpRequest",
                "prompt": prompt_for_execution.clone(),
                "session_id": session_id.clone(),
                "reset_to_message_id": null,
                "executor_profile_id": {
                    "executor": payload.executor_profile_id.executor.clone(),
                    "variant": payload.executor_profile_id.variant.clone()
                },
                "working_dir": working_dir,
                "model": payload.model,
                "agent": payload.agent
            },
            "next_action": null
        })
    };
    
    let execution_process = ExecutionProcess {
        id: process_id.clone(),
        session_id: session_id.clone(),
        run_reason: "codingagent".to_string(),
        executor_action: Some(executor_action),
        status: "running".to_string(),
        exit_code: None,
        dropped: false,
        started_at: now.clone(),
        completed_at: None,
        created_at: now.clone(),
        updated_at: now,
    };
    
    // Store execution process in memory
    {
        let mut processes = EXECUTION_PROCESSES.write().await;
        processes.entry(session_id.clone())
            .or_insert_with(Vec::new)
            .push(execution_process.clone());
    }
    
    // Store execution process in database
    if let Some(pool) = get_db_pool_from_manager(&state.process_manager).await {
        let now_unix = chrono::Utc::now().timestamp();

        // 先确保 session 在数据库中存在（因为内存中的 session 可能不在数据库中）
        let session_exists: Option<i64> = sqlx::query_scalar(
            "SELECT 1 FROM sessions WHERE id = $1 LIMIT 1"
        )
        .bind(&session_id)
        .fetch_optional(pool.as_ref())
        .await
        .ok()
        .flatten();

        if session_exists.is_none() {
            // Session 不存在，需要先创建
            let agent_cli = session.executor.clone().unwrap_or_else(|| "OPENCODE".to_string());
            if let Err(e) = sqlx::query(
                "INSERT INTO sessions (id, workspace_id, agent_cli, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)"
            )
            .bind(&session_id)
            .bind(&workspace_id)
            .bind(&agent_cli)
            .bind(now_unix)
            .bind(now_unix)
            .execute(pool.as_ref())
            .await {
                log_other!(warn, "Failed to create session in DB: {}", e);
            } else {
                log_other!(info, "Created session in DB: id={}, workspace_id={}", session_id, workspace_id);
            }
        }

        // 现在可以安全地插入 execution_process 记录了
        let executor_action_str = serde_json::to_string(&execution_process.executor_action).unwrap_or_default();
        if let Err(e) = sqlx::query(
            "INSERT INTO execution_processes (id, session_id, workspace_id, run_reason, executor_action, status, started_at, created_at, updated_at, dropped)
             VALUES ($1, $2, $3, $4, $5, 'running', $6, $7, $8, 0)"
        )
        .bind(&process_id)
        .bind(&session_id)
        .bind(&workspace_id)
        .bind(&execution_process.run_reason)
        .bind(executor_action_str)
        .bind(now_unix)
        .bind(now_unix)
        .bind(now_unix)
        .execute(pool.as_ref())
        .await
        {
            log_other!(warn, "Failed to insert execution process into DB: {}", e);
        } else {
            log_other!(info, "Created execution_process in DB: id={}, session_id={}", process_id, session_id);
        }
    }
    
    log_other!(info,
        "Execution process created: id={}, session={}, workspace={}, run_reason={}",
        process_id,
        session_id,
        workspace_id,
        execution_process.run_reason
    );

    // Broadcast process creation to any listening WS handlers
    let _ = PROCESS_UPDATES.0.send((session_id.clone(), execution_process.clone()));
    
    let has_agent = {
        let manager = state.process_manager.read().await;
        manager.get_msg_store(&workspace_id).await.is_ok()
    };

    if !has_agent {
        let agent_name = payload.executor_profile_id.executor.clone();
        let model = effective_model.map(|s| s.as_str());
        log_other!(info,
            "Starting agent for workspace={}, executor={}, working_dir={}, model={:?}",
            workspace_id,
            agent_name,
            working_dir,
            model
        );
        let manager = state.process_manager.read().await;
        manager
            .start_agent(
                workspace_id.clone(),
                std::path::PathBuf::from(&working_dir),
                agent_name,
                std::collections::HashMap::new(),
                &prompt_for_execution,
                model,
                Some(&session_id),
                Some(&process_id),
            )
            .await?;
    } else {
        let agent_name = payload.executor_profile_id.executor.clone();
        let model = effective_model.map(|s| s.as_str());

        let manager = state.process_manager.read().await;
        log_other!(info,
            "Sending follow-up to workspace={}, session={}, process={}",
            workspace_id,
            session_id,
            process_id
        );
        
        // Fallback: if send_follow_up fails (agent no longer exists), start a new agent
        let result = manager
            .send_follow_up(&workspace_id, &session_id, &process_id, &prompt_for_execution, model)
            .await;
            
        if let Err(e) = result {
            // Agent no longer exists, start a new one
            log_other!(warn, 
                "Agent not found for workspace={}, starting new agent: {}", 
                workspace_id, e
            );
            drop(manager); // Release the read lock before acquiring write lock
            
            let manager = state.process_manager.read().await;
            log_other!(info, 
                "Starting new agent with working_dir={}, agent_name={}, model={:?}", 
                working_dir, agent_name, model
            );
            manager
                .start_agent(
                    workspace_id.clone(),
                    std::path::PathBuf::from(working_dir),
                    agent_name,
                    std::collections::HashMap::new(),
                    &prompt_for_execution,
                    model,
                    Some(&session_id),
                    Some(&process_id),
                )
                .await?;
        }
    }
    
    Ok(Json(ApiResponse::success(execution_process)))
}

/// Stream execution processes for a session via WebSocket with JSON Patch format
/// This endpoint ONLY streams ExecutionProcess status changes (create/update).
/// Conversation entries are streamed via the separate /normalized-logs/ws endpoint.
async fn stream_execution_processes_session(
    ws: WebSocketUpgrade,
    Query(query): Query<ExecutionProcessStreamQuery>,
    State(_state): State<HttpServerState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> impl axum::response::IntoResponse {
    log_other!(info,
        "[WS] Execution processes stream request from {} for session: {}",
        addr,
        query.session_id
    );
    ws.on_failed_upgrade(|error| {
        log::error!("[WS] Execution processes upgrade failed: {}", error);
    })
    .on_upgrade(move |socket| handle_execution_processes_ws(socket, query.session_id))
}

async fn handle_execution_processes_ws(
    mut socket: axum::extract::ws::WebSocket,
    session_id: String,
) {
    log_other!(info, "[WS] Execution processes WebSocket connected for session: {}", session_id);
    
    log_other!(info, "[WS] Starting execution processes stream for session: {}", session_id);

    // 1. Send initial snapshot of all execution processes for this session
    let processes_map = {
        let processes = EXECUTION_PROCESSES.read().await;
        let session_processes = processes.get(&session_id).cloned().unwrap_or_default();
        log_other!(info,
            "[WS] Snapshot processes count for session {}: {}",
            session_id,
            session_processes.len()
        );
        let mut map = serde_json::Map::new();
        for p in &session_processes {
            if let Ok(val) = serde_json::to_value(p) {
                map.insert(p.id.clone(), val);
            }
        }
        serde_json::Value::Object(map)
    };
    
    let patch = vec![serde_json::json!({
        "op": "replace",
        "path": "/executionProcesses",
        "value": processes_map
    })];
    
    if socket.send(Message::Text(
        serde_json::json!({ "JsonPatch": patch }).to_string()
    )).await.is_err() {
        log::error!("[WS] Failed to send initial snapshot for session: {}", session_id);
        return;
    }
    log_other!(info, "[WS] Sent initial snapshot for session: {}", session_id);
    
    // 2. Send Ready signal
    if socket.send(Message::Text(
        serde_json::json!({ "Ready": true }).to_string()
    )).await.is_err() {
        log::error!("[WS] Failed to send Ready signal for session: {}", session_id);
        return;
    }
    log_other!(info, "[WS] Sent Ready signal for session: {}", session_id);
    
    // 3. Subscribe to process updates and forward them
    let mut rx = PROCESS_UPDATES.0.subscribe();
    log_other!(info, "[WS] Subscribed to process updates for session: {}", session_id);
    
    loop {
        tokio::select! {
            // Receive process updates from broadcast channel
            result = rx.recv() => {
                match result {
                    Ok((sid, process)) => {
                        // Only forward updates for this session
                        if sid != session_id {
                            continue;
                        }
                        
                        let patch = vec![serde_json::json!({
                            "op": "add",
                            "path": format!("/executionProcesses/{}", process.id),
                            "value": serde_json::to_value(&process).unwrap_or_default()
                        })];
                        
                        if socket.send(Message::Text(
                            serde_json::json!({ "JsonPatch": patch }).to_string()
                        )).await.is_err() {
                            log::error!("[WS] Failed to send process update for session: {}", session_id);
                            break;
                        }
                        log_other!(info, "[WS] Sent process update for {} in session: {}", process.id, session_id);
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        log_other!(warn, "[WS] Process updates lagged by {} messages", n);
                        // Resend full snapshot after lag
                        let processes = EXECUTION_PROCESSES.read().await;
                        let session_processes = processes.get(&session_id).cloned().unwrap_or_default();
                        let mut map = serde_json::Map::new();
                        for p in &session_processes {
                            if let Ok(val) = serde_json::to_value(p) {
                                map.insert(p.id.clone(), val);
                            }
                        }
                        let patch = vec![serde_json::json!({
                            "op": "replace",
                            "path": "/executionProcesses",
                            "value": serde_json::Value::Object(map)
                        })];
                        if socket.send(Message::Text(
                            serde_json::json!({ "JsonPatch": patch }).to_string()
                        )).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        log::error!("[WS] Process updates channel closed unexpectedly");
                        break
                    },
                }
            }
            // Handle WebSocket client messages
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Close(_))) => {
                         log_other!(info, "[WS] Client requested close for session: {}", session_id);
                         break
                    },
                    None => {
                        log_other!(warn, "[WS] Client disconnected (recved None) for session: {}", session_id);
                        break
                    },
                    Some(Ok(Message::Ping(data))) => {
                        let _ = socket.send(Message::Pong(data)).await;
                    }
                    _ => {}
                }
            }
        }
    }
    
    log_other!(info, "[WS] Execution processes WebSocket disconnected for session: {}", session_id);
}

/// Stream normalized logs for a specific execution process via WebSocket.
/// This endpoint streams LogMsg entries from MsgStore using to_ws_message_unchecked(),
/// matching vibe-kanban's per-process log streaming format.
async fn stream_normalized_logs_ws(
    ws: WebSocketUpgrade,
    Path(exec_id): Path<String>,
    State(state): State<HttpServerState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> impl axum::response::IntoResponse {
    log_other!(info,
        "[WS] Normalized logs stream request from {} for exec_id: {}",
        addr,
        exec_id
    );
    ws.on_failed_upgrade(|error| {
        log::error!("[WS] Normalized logs upgrade failed: {}", error);
    })
    .on_upgrade(move |socket| handle_normalized_logs_ws(socket, exec_id, state))
}

/// Stream raw stdout/stderr logs for a specific execution process via WebSocket.
async fn stream_raw_logs_ws(
    ws: WebSocketUpgrade,
    Path(exec_id): Path<String>,
    State(state): State<HttpServerState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> impl axum::response::IntoResponse {
    log_other!(info,
        "[WS] Raw logs stream request from {} for exec_id: {}",
        addr,
        exec_id
    );
    ws.on_failed_upgrade(|error| {
        log::error!("[WS] Raw logs upgrade failed: {}", error);
    })
    .on_upgrade(move |socket| handle_raw_logs_ws(socket, exec_id, state))
}

async fn handle_normalized_logs_ws(
    mut socket: axum::extract::ws::WebSocket,
    exec_id: String,
    state: HttpServerState,
) {
    log_other!(info, "[WS] ===== Normalized logs WebSocket connected for exec_id: {} =====", exec_id);

    // Resolve execution context: exec_id -> session -> workspace/executor/working_dir.
    // For historical records recovered from DB (not present in in-memory maps), fall back to defaults
    // so we can still rebuild normalized logs from persisted execution_process_logs.
    let (workspace_id, session_id, executor_name, working_dir, process_status) =
        if let Some(db_ctx) = load_execution_context_from_db(&state.process_manager, &exec_id).await
        {
            log_other!(info,
                "[WS] DB context loaded: workspace_id={}, session_id={}, executor={}, working_dir={}, status={}",
                db_ctx.workspace_id, db_ctx.session_id, db_ctx.executor_name, db_ctx.working_dir, db_ctx.process_status
            );
            (
                db_ctx.workspace_id,
                db_ctx.session_id,
                db_ctx.executor_name,
                db_ctx.working_dir,
                db_ctx.process_status,
            )
        } else {
            log_other!(warn,
                "[WS] Execution context not found in DB for exec_id {}, fallback to in-memory",
                exec_id
            );
            let processes = EXECUTION_PROCESSES.read().await;
            let mut found_process: Option<(String, ExecutionProcess)> = None;
            for (sid, procs) in processes.iter() {
                if let Some(p) = procs.iter().find(|p| p.id == exec_id) {
                    found_process = Some((sid.clone(), p.clone()));
                    break;
                }
            }
            match found_process {
                Some((sid, process)) => {
                    let sessions = SESSIONS.read().await;
                    match sessions.get(&sid) {
                        Some(session) => (
                            session.workspace_id.clone(),
                            sid,
                            session
                                .executor
                                .clone()
                                .unwrap_or_else(|| "opencode".to_string()),
                            session
                                .working_dir
                                .clone()
                                .unwrap_or_else(|| session.workspace_id.clone()),
                            process.status,
                        ),
                        None => (
                            "unknown_workspace".to_string(),
                            "unknown_session".to_string(),
                            "opencode".to_string(),
                            "/tmp".to_string(),
                            "completed".to_string(),
                        ),
                    }
                }
                None => (
                    "unknown_workspace".to_string(),
                    "unknown_session".to_string(),
                    "opencode".to_string(),
                    "/tmp".to_string(),
                    "completed".to_string(),
                ),
            }
        };
    
    // 优先使用 execution_process 级别 MsgStore
    let msg_store = {
        let manager = state.process_manager.read().await;
        manager.get_msg_store_by_process_id(&exec_id).await.ok()
    };

    // 回退：进程内存不存在时，尝试从 DB 重建 normalized logs（对齐 vibe 语义）
    if msg_store.is_none() {
        log_other!(info,
            "[WS] No in-memory MsgStore for exec_id {}, trying DB fallback reconstruction",
            exec_id
        );
        let manager = state.process_manager.read().await;
        match manager
            .rebuild_normalized_messages_from_db(
                &exec_id,
                &executor_name,
                std::path::Path::new(&working_dir),
            )
            .await
        {
            Ok(messages) => {
                let _ = socket.send(Message::Text(r#"{"Ready":true}"#.to_string())).await;
                for msg in messages {
                    if socket
                        .send(Message::Text(
                            serde_json::to_string(&msg)
                                .unwrap_or_else(|_| r#"{"error":"serialization_failed"}"#.to_string()),
                        ))
                        .await
                        .is_err()
                    {
                        return;
                    }
                }
                let _ = socket.send(Message::Text(r#"{"finished":true}"#.to_string())).await;
                log_other!(info,
                    "[WS] DB fallback normalized logs sent for exec_id: {}, session: {}, workspace: {}",
                    exec_id, session_id, workspace_id
                );
                return;
            }
            Err(e) => {
                log::error!(
                    "[WS] Failed to rebuild normalized logs from DB for exec_id {}: {}",
                    exec_id, e
                );
                let _ = socket.send(Message::Text(
                    serde_json::json!({ "error": "No normalized logs available" }).to_string()
                )).await;
                return;
            }
        }
    }
    let msg_store = msg_store.expect("msg_store checked above");

    // For non-running processes, replay full history first and send `finished` at the very end.
    // This avoids truncation when `Finished` arrives before late JsonPatch entries due async races.
    if process_status != "running" {
        log_other!(info,
            "[WS] Replaying completed process history for exec_id: {}, status: {}",
            exec_id,
            process_status
        );
        let _ = socket
            .send(Message::Text(r#"{"Ready":true}"#.to_string()))
            .await;

        let history = msg_store.get_history();
        let mut sent_patch_count = 0usize;
        for log_msg in history {
            let json = match &log_msg {
                bee_workspace_utils::log_msg::LogMsg::JsonPatch(patch) => {
                    sent_patch_count += 1;
                    log_other!(info,
                        "[WS] Replaying JsonPatch #{} with {} operations, {}",
                        sent_patch_count,
                        patch.0.len(),
                        summarize_patch_for_log(patch)
                    );
                    serde_json::to_string(&log_msg)
                        .unwrap_or_else(|_| r#"{"error":"serialization_failed"}"#.to_string())
                }
                bee_workspace_utils::log_msg::LogMsg::Ready
                | bee_workspace_utils::log_msg::LogMsg::Finished
                | bee_workspace_utils::log_msg::LogMsg::Stdout(_)
                | bee_workspace_utils::log_msg::LogMsg::Stderr(_)
                | bee_workspace_utils::log_msg::LogMsg::SessionId(_)
                | bee_workspace_utils::log_msg::LogMsg::MessageId(_) => {
                    continue;
                }
            };

            if socket.send(Message::Text(json)).await.is_err() {
                return;
            }
        }

        let _ = socket
            .send(Message::Text(r#"{"finished":true}"#.to_string()))
            .await;
        log_other!(info,
            "[WS] Completed process history replay done for exec_id: {}, patches sent: {}",
            exec_id,
            sent_patch_count
        );
        return;
    }
    
    // Stream LogMsg from MsgStore, serializing to match vibe-kanban's format:
    // - LogMsg::JsonPatch(patch) → {"JsonPatch": [...patch ops...]}
    // - LogMsg::Ready → {"Ready": true}
    // - LogMsg::Finished → {"finished": true}
    // Note: We serialize manually instead of using to_ws_message_unchecked() because
    // bee_workspace_utils uses axum 0.8 Message while http_server uses axum 0.7 Message.
    let mut stream = msg_store.history_plus_stream();
    let mut msg_count = 0usize;

    log_other!(info,
        "[WS] Starting to read from history_plus_stream for exec_id: {}, session: {}, workspace: {}",
        exec_id,
        session_id,
        workspace_id
    );

    loop {
        tokio::select! {
            result = stream.next() => {
                match result {
                    Some(Ok(ref log_msg)) => {
                        msg_count += 1;
                        log_other!(info,
                            "[WS] Received msg #{} from stream: type={}",
                            msg_count,
                            log_msg.name()
                        );

                        // Serialize LogMsg to JSON matching vibe-kanban's WS format
                        // IMPORTANT: normalize_logs background task already converts Stdout/Stderr to JsonPatch.
                        // We only forward JsonPatch messages here to avoid duplicates.
                        let json = match log_msg {
                            bee_workspace_utils::log_msg::LogMsg::Ready => {
                                log_other!(info, "[WS] Sending Ready signal");
                                r#"{"Ready":true}"#.to_string()
                            },
                            bee_workspace_utils::log_msg::LogMsg::Finished => {
                                log_other!(info, "[WS] Sending Finished signal");
                                r#"{"finished":true}"#.to_string()
                            },
                            bee_workspace_utils::log_msg::LogMsg::JsonPatch(patch) => {
                                log_other!(info,
                                    "[WS] Sending JsonPatch with {} operations, {}",
                                    patch.0.len(),
                                    summarize_patch_for_log(patch)
                                );
                                serde_json::to_string(log_msg)
                                    .unwrap_or_else(|_| r#"{"error":"serialization_failed"}"#.to_string())
                            }
                            // Skip Stdout/Stderr - they are already converted to JsonPatch by normalize_logs
                            bee_workspace_utils::log_msg::LogMsg::Stdout(s) => {
                                log_other!(info, "[WS] Skipping Stdout ({} chars)", s.len());
                                continue;
                            }
                            bee_workspace_utils::log_msg::LogMsg::Stderr(s) => {
                                log_other!(info, "[WS] Skipping Stderr ({} chars)", s.len());
                                continue;
                            }
                            bee_workspace_utils::log_msg::LogMsg::SessionId(id) => {
                                log_other!(info, "[WS] Skipping SessionId: {}", id);
                                continue;
                            }
                            bee_workspace_utils::log_msg::LogMsg::MessageId(id) => {
                                log_other!(info, "[WS] Skipping MessageId: {}", id);
                                continue;
                            }
                        };
                        
                        if socket.send(Message::Text(json)).await.is_err() {
                            break;
                        }
                        
                        // Close after Finished
                        if matches!(log_msg, bee_workspace_utils::log_msg::LogMsg::Finished) {
                            break;
                        }
                    }
                    Some(Err(e)) => {
                        log_other!(warn, "[WS] Normalized logs stream error: {:?}", e);
                        break;
                    }
                    None => break,
                }
            }
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(Message::Ping(data))) => {
                        let _ = socket.send(Message::Pong(data)).await;
                    }
                    _ => {}
                }
            }
        }
    }
    
    log_other!(info, "[WS] Normalized logs WebSocket disconnected for exec_id: {}", exec_id);
}

async fn handle_raw_logs_ws(
    mut socket: axum::extract::ws::WebSocket,
    exec_id: String,
    state: HttpServerState,
) {
    log_other!(info, "[WS] Raw logs WebSocket connected for exec_id: {}", exec_id);

    let msg_store = {
        let manager = state.process_manager.read().await;
        manager.get_msg_store_by_process_id(&exec_id).await.ok()
    };
    if msg_store.is_none() {
        let pool = match get_db_pool_from_manager(&state.process_manager).await {
            Some(pool) => pool,
            None => {
                let _ = socket
                    .send(Message::Text(
                        serde_json::json!({ "error": "No raw logs available" }).to_string(),
                    ))
                    .await;
                return;
            }
        };
        match ExecutionProcessLogs::find_by_execution_id(pool.as_ref(), &exec_id).await {
            Ok(records) if !records.is_empty() => {
                let messages = ExecutionProcessLogs::parse_logs(&records).unwrap_or_default();
                let _ = socket
                    .send(Message::Text(r#"{"Ready":true}"#.to_string()))
                    .await;
                for msg in messages {
                    if !matches!(
                        msg,
                        bee_workspace_utils::log_msg::LogMsg::Stdout(_)
                            | bee_workspace_utils::log_msg::LogMsg::Stderr(_)
                    ) {
                        continue;
                    }
                    let json = serde_json::to_string(&msg)
                        .unwrap_or_else(|_| r#"{"error":"serialization_failed"}"#.to_string());
                    if socket.send(Message::Text(json)).await.is_err() {
                        return;
                    }
                }
                let _ = socket
                    .send(Message::Text(r#"{"finished":true}"#.to_string()))
                    .await;
                return;
            }
            _ => {
                let _ = socket
                    .send(Message::Text(
                        serde_json::json!({ "error": "No raw logs available" }).to_string(),
                    ))
                    .await;
                return;
            }
        }
    }
    let msg_store = msg_store.expect("msg_store checked above");

    let _ = socket
        .send(Message::Text(r#"{"Ready":true}"#.to_string()))
        .await;

    let mut stream = msg_store.history_plus_stream();
    loop {
        tokio::select! {
            result = stream.next() => {
                match result {
                    Some(Ok(ref log_msg)) => {
                        let maybe_json = match log_msg {
                            bee_workspace_utils::log_msg::LogMsg::Ready => {
                                Some(r#"{"Ready":true}"#.to_string())
                            }
                            bee_workspace_utils::log_msg::LogMsg::Finished => {
                                Some(r#"{"finished":true}"#.to_string())
                            }
                            bee_workspace_utils::log_msg::LogMsg::Stdout(_) |
                            bee_workspace_utils::log_msg::LogMsg::Stderr(_) => {
                                Some(
                                    serde_json::to_string(log_msg)
                                        .unwrap_or_else(|_| r#"{"error":"serialization_failed"}"#.to_string())
                                )
                            }
                            bee_workspace_utils::log_msg::LogMsg::JsonPatch(_) |
                            bee_workspace_utils::log_msg::LogMsg::SessionId(_) |
                            bee_workspace_utils::log_msg::LogMsg::MessageId(_) => None,
                        };

                        if let Some(json) = maybe_json {
                            if socket.send(Message::Text(json)).await.is_err() {
                                break;
                            }
                        }

                        if matches!(log_msg, bee_workspace_utils::log_msg::LogMsg::Finished) {
                            break;
                        }
                    }
                    Some(Err(_)) => break,
                    None => break,
                }
            }
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(Message::Ping(data))) => {
                        let _ = socket.send(Message::Pong(data)).await;
                    }
                    _ => {}
                }
            }
        }
    }

    log_other!(info, "[WS] Raw logs WebSocket disconnected for exec_id: {}", exec_id);
}

// ============ Git API Handlers ============

/// 移除 Windows 长路径前缀 (\\?\)
/// Windows 的 canonicalize() 会返回 \\?\C:\... 格式
/// 在 JSON 序列化后变成 \\\\?\\C:\...，导致路径解析失败
fn normalize_windows_path(path: &str) -> String {
    if path.starts_with("\\\\?\\") {
        path[4..].to_string()
    } else {
        path.to_string()
    }
}

fn to_bad_request(message: impl Into<String>) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, message.into())
}

fn to_internal_error(message: impl Into<String>) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, message.into())
}

fn get_worktree_root(worktree_path: &str) -> Result<PathBuf, (StatusCode, String)> {
    let normalized = normalize_windows_path(worktree_path);
    let root = PathBuf::from(normalized);
    if !root.exists() {
        return Err(to_bad_request("Worktree path does not exist"));
    }
    if !root.is_dir() {
        return Err(to_bad_request("Worktree path is not a directory"));
    }
    root.canonicalize()
        .map_err(|e| to_internal_error(format!("Failed to resolve worktree path: {}", e)))
}

fn validate_relative_path(raw: &str) -> Result<(), (StatusCode, String)> {
    let candidate = StdPath::new(raw);
    if candidate.is_absolute() {
        return Err(to_bad_request("Absolute path is not allowed"));
    }
    for part in candidate.components() {
        if matches!(part, std::path::Component::ParentDir) {
            return Err(to_bad_request("Parent path segment is not allowed"));
        }
    }
    Ok(())
}

fn safe_resolve_path(root: &PathBuf, relative: &str) -> Result<PathBuf, (StatusCode, String)> {
    validate_relative_path(relative)?;
    let relative_path = StdPath::new(relative);
    let joined = root.join(relative_path);
    if !joined.exists() {
        return Err(to_bad_request("Path does not exist"));
    }
    let canonical = joined
        .canonicalize()
        .map_err(|e| to_internal_error(format!("Failed to resolve target path: {}", e)))?;
    if !canonical.starts_with(root) {
        return Err(to_bad_request("Path is outside worktree root"));
    }
    Ok(canonical)
}

fn relative_display_path(root: &PathBuf, target: &PathBuf) -> String {
    target
        .strip_prefix(root)
        .ok()
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_default()
}

fn detect_previewable_extension(path: &StdPath) -> Option<String> {
    let ext = path.extension()?.to_string_lossy().to_lowercase();
    let is_supported = matches!(
        ext.as_str(),
        "ts"
            | "tsx"
            | "js"
            | "jsx"
            | "mjs"
            | "cjs"
            | "json"
            | "md"
            | "mdx"
            | "txt"
            | "css"
            | "scss"
            | "less"
            | "html"
            | "xml"
            | "yaml"
            | "yml"
            | "toml"
            | "rs"
            | "go"
            | "java"
            | "kt"
            | "swift"
            | "py"
            | "sh"
            | "sql"
            | "lock"
    );
    if is_supported {
        Some(ext)
    } else {
        None
    }
}

fn is_binary_content(bytes: &[u8]) -> bool {
    bytes.iter().take(1024).any(|b| *b == 0)
}

async fn worktree_list_files(
    Json(payload): Json<WorktreeListFilesRequest>,
) -> Result<Json<Vec<WorktreeFileEntry>>, (StatusCode, String)> {
    let root = get_worktree_root(&payload.worktree_path)?;
    let requested_path = payload.path.unwrap_or_default();
    let target_dir = if requested_path.trim().is_empty() {
        root.clone()
    } else {
        safe_resolve_path(&root, requested_path.trim())?
    };

    if !target_dir.is_dir() {
        return Err(to_bad_request("Requested path is not a directory"));
    }

    let mut entries = Vec::new();
    let dir_iter = fs::read_dir(&target_dir)
        .map_err(|e| to_internal_error(format!("Failed to read directory: {}", e)))?;
    for item in dir_iter {
        let entry = item.map_err(|e| to_internal_error(format!("Failed to read directory entry: {}", e)))?;
        let file_name = entry.file_name().to_string_lossy().to_string();
        if file_name == ".git" {
            continue;
        }
        let path = entry.path();
        let metadata = entry
            .metadata()
            .map_err(|e| to_internal_error(format!("Failed to read metadata: {}", e)))?;
        let is_dir = metadata.is_dir();
        let rel_path = relative_display_path(&root, &path);
        let modified_at = metadata
            .modified()
            .ok()
            .map(|time| chrono::DateTime::<chrono::Utc>::from(time).to_rfc3339());
        let is_previewable = if is_dir {
            false
        } else {
            detect_previewable_extension(&path).is_some()
        };

        entries.push(WorktreeFileEntry {
            name: file_name,
            path: rel_path,
            is_dir,
            size: if is_dir { None } else { Some(metadata.len()) },
            modified_at,
            is_previewable,
        });
    }

    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(Json(entries))
}

async fn worktree_read_file(
    Json(payload): Json<WorktreeReadFileRequest>,
) -> Result<Json<WorktreeFilePreview>, (StatusCode, String)> {
    let root = get_worktree_root(&payload.worktree_path)?;
    let relative_path = payload.path.trim();
    if relative_path.is_empty() {
        return Err(to_bad_request("File path is required"));
    }
    let target = safe_resolve_path(&root, relative_path)?;
    if !target.is_file() {
        return Err(to_bad_request("Requested path is not a file"));
    }

    let metadata = fs::metadata(&target)
        .map_err(|e| to_internal_error(format!("Failed to read file metadata: {}", e)))?;
    let size = metadata.len();
    let max_bytes = payload.max_bytes.unwrap_or(200_000).clamp(1, 1_000_000);
    let bytes = fs::read(&target).map_err(|e| to_internal_error(format!("Failed to read file: {}", e)))?;
    let is_binary = is_binary_content(&bytes);
    let language = detect_previewable_extension(&target);
    let relative = relative_display_path(&root, &target);

    if is_binary {
        return Ok(Json(WorktreeFilePreview {
            path: relative,
            content: None,
            truncated: false,
            is_binary: true,
            size,
            language,
        }));
    }

    let truncated = bytes.len() > max_bytes;
    let slice = if truncated { &bytes[..max_bytes] } else { &bytes[..] };
    let content = String::from_utf8_lossy(slice).to_string();

    Ok(Json(WorktreeFilePreview {
        path: relative,
        content: Some(content),
        truncated,
        is_binary: false,
        size,
        language,
    }))
}

async fn git_get_diff(
    Json(payload): Json<GitDiffRequest>,
) -> Result<Json<Vec<FileDiff>>, String> {
    log_other!(info, "Getting git diff: path={}", payload.worktree_path);
    
    let path = std::path::Path::new(&payload.worktree_path);
    
    // 检查路径是否存在
    if !path.exists() {
        log_other!(warn, "Git diff path does not exist: {}", payload.worktree_path);
        return Ok(Json(Vec::new()));
    }
    
    // 检查是否是目录
    if !path.is_dir() {
        log_other!(warn, "Git diff path is not a directory: {}", payload.worktree_path);
        return Ok(Json(Vec::new()));
    }
    
    let normalized_path = normalize_windows_path(&payload.worktree_path);
    let worktree = PathBuf::from(normalized_path);

    let diffs = match get_workspace_diff(&worktree) {
        Ok(command_diffs) => command_diffs
            .into_iter()
            .map(|diff| {
                let status = match diff.status {
                    GitFileStatus::Added => "added",
                    GitFileStatus::Modified => "modified",
                    GitFileStatus::Deleted => "deleted",
                    GitFileStatus::Renamed => "renamed",
                    GitFileStatus::Untracked => "untracked",
                };

                FileDiff {
                    path: diff.path,
                    status: status.to_string(),
                    additions: diff.additions as i32,
                    deletions: diff.deletions as i32,
                    diff: diff.diff,
                }
            })
            .collect::<Vec<FileDiff>>(),
        Err(err) => {
            log_other!(warn, "get_workspace_diff failed: {}", err);
            Vec::new()
        }
    };

    Ok(Json(diffs))
}

fn git_path_exists(worktree_path: &str, git_path: &str) -> bool {
    let output = Command::new("git")
        .arg("rev-parse")
        .arg("--git-path")
        .arg(git_path)
        .current_dir(worktree_path)
        .output();

    let Ok(output) = output else {
        return false;
    };
    if !output.status.success() {
        return false;
    }

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        return false;
    }

    PathBuf::from(path).exists()
}

async fn git_get_branch_status(
    Json(payload): Json<GitBranchStatusRequest>,
) -> Result<Json<GitBranchStatusResponse>, String> {
    log_other!(info, "Getting branch status: path={}, target={}", payload.worktree_path, payload.target_branch);
    
    // 获取当前分支
    let branch_output = Command::new("git")
        .arg("branch")
        .arg("--show-current")
        .current_dir(&payload.worktree_path)
        .output()
        .map_err(|e| format!("Failed to get current branch: {}", e))?;
    
    let current_branch = String::from_utf8_lossy(&branch_output.stdout).trim().to_string();
    
    let (commits_ahead, commits_behind) = if payload.target_branch.trim().is_empty() {
        (0, 0)
    } else {
        let rev_list_output = Command::new("git")
            .arg("rev-list")
            .arg("--left-right")
            .arg("--count")
            .arg(format!("{}...{}", current_branch, payload.target_branch))
            .current_dir(&payload.worktree_path)
            .output()
            .map_err(|e| format!("Failed to get rev-list: {}", e))?;

        let rev_list = String::from_utf8_lossy(&rev_list_output.stdout);
        let parts: Vec<&str> = rev_list.split_whitespace().collect();
        let ahead = parts.get(0).and_then(|s| s.parse().ok()).unwrap_or(0);
        let behind = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
        (ahead, behind)
    };
    
    // 检查是否有未提交的更改
    let status_output = Command::new("git")
        .arg("status")
        .arg("--porcelain")
        .current_dir(&payload.worktree_path)
        .output()
        .map_err(|e| format!("Failed to get status: {}", e))?;
    
    let has_uncommitted_changes = !String::from_utf8_lossy(&status_output.stdout).trim().is_empty();
    
    let conflicted_files_output = Command::new("git")
        .arg("diff")
        .arg("--name-only")
        .arg("--diff-filter=U")
        .current_dir(&payload.worktree_path)
        .output()
        .map_err(|e| format!("Failed to get conflicted files: {}", e))?;

    let conflicted_files: Vec<String> = String::from_utf8_lossy(&conflicted_files_output.stdout)
        .lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .map(String::from)
        .collect();

    let is_merge_in_progress = git_path_exists(&payload.worktree_path, "MERGE_HEAD");
    let is_rebase_in_progress =
        git_path_exists(&payload.worktree_path, "REBASE_HEAD")
            || git_path_exists(&payload.worktree_path, "rebase-merge")
            || git_path_exists(&payload.worktree_path, "rebase-apply");

    let conflict_op = if is_rebase_in_progress {
        Some("rebase".to_string())
    } else if is_merge_in_progress {
        Some("merge".to_string())
    } else {
        None
    };

    Ok(Json(GitBranchStatusResponse {
        commits_ahead,
        commits_behind,
        has_uncommitted_changes,
        conflicted_files,
        current_branch,
        is_rebase_in_progress,
        is_merge_in_progress,
        conflict_op,
    }))
}

// ============ Git Branches ============
/// GET /api/git/branches?path=xxx
/// 获取指定仓库的分支列表
async fn git_list_branches(
    Query(params): Query<GitBranchesQuery>,
) -> Result<Json<Vec<GitBranch>>, String> {
    log_other!(info, "Getting branches: path={}", params.path);

    let path = std::path::Path::new(&params.path);

    // 检查路径是否存在
    if !path.exists() {
        log_other!(warn, "Branches path does not exist: {}", params.path);
        return Err(format!("Path does not exist: {}", params.path));
    }

    // 调用 list_branches 函数
    let path_buf = path.to_path_buf();
    match list_branches(&path_buf) {
        Ok(branches) => {
            log_other!(info, "Found {} branches", branches.len());
            Ok(Json(branches))
        }
        Err(e) => {
            log_other!(error, "Failed to list branches: {}", e);
            Err(e)
        }
    }
}

// ============ Git Push ============
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPushRequest {
    pub worktree_path: String,
    pub remote: String,
    pub branch: String,
    pub force: Option<bool>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPullRequest {
    pub worktree_path: String,
    pub remote: Option<String>,
    pub branch: Option<String>,
}

#[derive(serde::Serialize)]
pub struct PushResult {
    pub success: bool,
    pub message: String,
    pub remote_url: Option<String>,
}

#[derive(serde::Serialize)]
pub struct GitOperationErrorResponse {
    pub r#type: String,
    pub message: String,
    pub conflicted_files: Option<Vec<String>>,
}

#[derive(serde::Serialize)]
pub struct GitOperationResponse {
    pub success: bool,
    pub message: Option<String>,
    pub error: Option<GitOperationErrorResponse>,
}

async fn git_push(
    Json(payload): Json<GitPushRequest>,
) -> Result<Json<PushResult>, String> {
    log_other!(info, "Git push: path={}, remote={}, branch={}", payload.worktree_path, payload.remote, payload.branch);

    let mut command = Command::new("git");
    command
        .arg("push")
        .arg(&payload.remote)
        .arg(&payload.branch);
    if payload.force.unwrap_or(false) {
        command.arg("--force-with-lease");
    }

    let output = command
        .current_dir(&payload.worktree_path)
        .output()
        .map_err(|e| format!("Failed to push: {}", e))?;

    let success = output.status.success();
    let message = if success {
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    } else {
        String::from_utf8_lossy(&output.stderr).trim().to_string()
    };

    // 获取 remote URL
    let remote_url = Command::new("git")
        .arg("remote")
        .arg("get-url")
        .arg(&payload.remote)
        .current_dir(&payload.worktree_path)
        .output()
        .ok()
        .and_then(|o| if o.status.success() { Some(String::from_utf8_lossy(&o.stdout).trim().to_string()) } else { None });

    Ok(Json(PushResult { success, message, remote_url }))
}

async fn git_pull(
    Json(payload): Json<GitPullRequest>,
) -> Result<Json<GitOperationResponse>, String> {
    let remote = payload.remote.unwrap_or_else(|| "origin".to_string());
    let branch = if let Some(branch) = payload.branch {
        branch
    } else {
        let branch_output = Command::new("git")
            .arg("rev-parse")
            .arg("--abbrev-ref")
            .arg("HEAD")
            .current_dir(&payload.worktree_path)
            .output()
            .map_err(|e| format!("Failed to resolve current branch: {}", e))?;
        if !branch_output.status.success() {
            let stderr = String::from_utf8_lossy(&branch_output.stderr).trim().to_string();
            let error_message = if stderr.is_empty() {
                "Failed to resolve current branch".to_string()
            } else {
                stderr
            };
            return Ok(Json(GitOperationResponse {
                success: false,
                message: Some(error_message.clone()),
                error: Some(GitOperationErrorResponse {
                    r#type: "pull_failed".to_string(),
                    message: error_message,
                    conflicted_files: None,
                }),
            }));
        }
        String::from_utf8_lossy(&branch_output.stdout).trim().to_string()
    };

    log_other!(info, "Git pull: path={}, remote={}, branch={}", payload.worktree_path, remote, branch);

    let output = Command::new("git")
        .arg("pull")
        .arg(&remote)
        .arg(&branch)
        .current_dir(&payload.worktree_path)
        .output()
        .map_err(|e| format!("Failed to pull: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Ok(Json(GitOperationResponse {
            success: true,
            message: Some(if stdout.is_empty() {
                format!("Pulled {} from {}", branch, remote)
            } else {
                stdout
            }),
            error: None,
        }));
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let conflicted_files_output = Command::new("git")
        .arg("diff")
        .arg("--name-only")
        .arg("--diff-filter=U")
        .current_dir(&payload.worktree_path)
        .output();
    let conflicted_files = conflicted_files_output
        .ok()
        .map(|out| {
            String::from_utf8_lossy(&out.stdout)
                .lines()
                .map(|line| line.trim())
                .filter(|line| !line.is_empty())
                .map(String::from)
                .collect::<Vec<String>>()
        })
        .unwrap_or_default();
    let error_message = if stderr.is_empty() {
        "Pull failed".to_string()
    } else {
        stderr
    };

    Ok(Json(GitOperationResponse {
        success: false,
        message: Some(error_message.clone()),
        error: Some(GitOperationErrorResponse {
            r#type: if conflicted_files.is_empty() {
                "pull_failed".to_string()
            } else {
                "merge_conflicts".to_string()
            },
            message: error_message,
            conflicted_files: if conflicted_files.is_empty() { None } else { Some(conflicted_files) },
        }),
    }))
}

// ============ Git Rebase ============
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRebaseRequest {
    pub worktree_path: String,
    pub target_branch: String,
}

async fn git_rebase(
    Json(payload): Json<GitRebaseRequest>,
) -> Result<Json<GitOperationResponse>, String> {
    log_other!(info, "Git rebase: path={}, target={}", payload.worktree_path, payload.target_branch);
    
    let output = match Command::new("git")
        .arg("rebase")
        .arg(&payload.target_branch)
        .current_dir(&payload.worktree_path)
        .output()
    {
        Ok(output) => output,
        Err(e) => {
            return Ok(Json(GitOperationResponse {
                success: false,
                message: None,
                error: Some(GitOperationErrorResponse {
                    r#type: "rebase_failed".to_string(),
                    message: format!("Failed to rebase: {}", e),
                    conflicted_files: None,
                }),
            }));
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let conflicted_files_output = Command::new("git")
            .arg("diff")
            .arg("--name-only")
            .arg("--diff-filter=U")
            .current_dir(&payload.worktree_path)
            .output();
        let conflicted_files = conflicted_files_output
            .ok()
            .map(|out| {
                String::from_utf8_lossy(&out.stdout)
                    .lines()
                    .map(|line| line.trim())
                    .filter(|line| !line.is_empty())
                    .map(String::from)
                    .collect::<Vec<String>>()
            })
            .unwrap_or_default();

        let error_type = if !conflicted_files.is_empty() {
            "merge_conflicts"
        } else if git_path_exists(&payload.worktree_path, "REBASE_HEAD")
            || git_path_exists(&payload.worktree_path, "rebase-merge")
            || git_path_exists(&payload.worktree_path, "rebase-apply")
        {
            "rebase_in_progress"
        } else {
            "rebase_failed"
        };

        return Ok(Json(GitOperationResponse {
            success: false,
            message: None,
            error: Some(GitOperationErrorResponse {
                r#type: error_type.to_string(),
                message: if stderr.is_empty() { "Rebase failed".to_string() } else { stderr },
                conflicted_files: if conflicted_files.is_empty() { None } else { Some(conflicted_files) },
            }),
        }));
    }

    Ok(Json(GitOperationResponse {
        success: true,
        message: Some(format!("Rebased onto {}", payload.target_branch)),
        error: None,
    }))
}

// ============ Git Merge ============
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitMergeRequest {
    pub worktree_path: String,
    pub target_branch: String,
}

async fn git_merge(
    Json(payload): Json<GitMergeRequest>,
) -> Result<Json<GitOperationResponse>, String> {
    log_other!(info, "Git merge: path={}, target={}", payload.worktree_path, payload.target_branch);
    
    let output = match Command::new("git")
        .arg("merge")
        .arg(&payload.target_branch)
        .current_dir(&payload.worktree_path)
        .output()
    {
        Ok(output) => output,
        Err(e) => {
            return Ok(Json(GitOperationResponse {
                success: false,
                message: None,
                error: Some(GitOperationErrorResponse {
                    r#type: "merge_failed".to_string(),
                    message: format!("Failed to merge: {}", e),
                    conflicted_files: None,
                }),
            }));
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let conflicted_files_output = Command::new("git")
            .arg("diff")
            .arg("--name-only")
            .arg("--diff-filter=U")
            .current_dir(&payload.worktree_path)
            .output();
        let conflicted_files = conflicted_files_output
            .ok()
            .map(|out| {
                String::from_utf8_lossy(&out.stdout)
                    .lines()
                    .map(|line| line.trim())
                    .filter(|line| !line.is_empty())
                    .map(String::from)
                    .collect::<Vec<String>>()
            })
            .unwrap_or_default();

        let error_type = if !conflicted_files.is_empty() {
            "merge_conflicts"
        } else if git_path_exists(&payload.worktree_path, "MERGE_HEAD") {
            "merge_in_progress"
        } else {
            "merge_failed"
        };

        return Ok(Json(GitOperationResponse {
            success: false,
            message: None,
            error: Some(GitOperationErrorResponse {
                r#type: error_type.to_string(),
                message: if stderr.is_empty() { "Merge failed".to_string() } else { stderr },
                conflicted_files: if conflicted_files.is_empty() { None } else { Some(conflicted_files) },
            }),
        }));
    }

    Ok(Json(GitOperationResponse {
        success: true,
        message: Some(format!("Merged {}", payload.target_branch)),
        error: None,
    }))
}

// ============ Git Abort Rebase ============
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitAbortRebaseRequest {
    pub worktree_path: String,
}

async fn git_abort_rebase(
    Json(payload): Json<GitAbortRebaseRequest>,
) -> Result<Json<()>, String> {
    log_other!(info, "Git abort rebase: path={}", payload.worktree_path);
    
    let output = Command::new("git")
        .arg("rebase")
        .arg("--abort")
        .current_dir(&payload.worktree_path)
        .output()
        .map_err(|e| format!("Failed to abort rebase: {}", e))?;

    Ok(Json(()))
}

// ============ Git Abort Merge ============
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitAbortMergeRequest {
    pub worktree_path: String,
}

async fn git_abort_merge(
    Json(payload): Json<GitAbortMergeRequest>,
) -> Result<Json<()>, String> {
    log_other!(info, "Git abort merge: path={}", payload.worktree_path);
    
    let output = Command::new("git")
        .arg("merge")
        .arg("--abort")
        .current_dir(&payload.worktree_path)
        .output()
        .map_err(|e| format!("Failed to abort merge: {}", e))?;

    Ok(Json(()))
}

// ============ Git Continue Rebase ============
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitContinueRebaseRequest {
    pub worktree_path: String,
}

async fn git_continue_rebase(
    Json(payload): Json<GitContinueRebaseRequest>,
) -> Result<Json<()>, String> {
    log_other!(info, "Git continue rebase: path={}", payload.worktree_path);
    
    let output = Command::new("git")
        .arg("rebase")
        .arg("--continue")
        .current_dir(&payload.worktree_path)
        .output()
        .map_err(|e| format!("Failed to continue rebase: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!("Continue rebase failed: {}", stderr));
    }

    Ok(Json(()))
}

// ============ Git Get Commits ============
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitGetCommitsRequest {
    pub worktree_path: String,
    pub count: usize,
}

#[derive(serde::Serialize)]
pub struct CommitInfo {
    pub message: String,
}

async fn git_get_commits(
    Json(payload): Json<GitGetCommitsRequest>,
) -> Result<Json<Vec<CommitInfo>>, String> {
    log_other!(info, "Git get commits: path={}, count={}", payload.worktree_path, payload.count);
    
    let output = Command::new("git")
        .arg("log")
        .arg(format!("-{}", payload.count))
        .arg("--pretty=format:%s")
        .current_dir(&payload.worktree_path)
        .output()
        .map_err(|e| format!("Failed to get commits: {}", e))?;

    let messages: Vec<CommitInfo> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(|line| CommitInfo { message: line.to_string() })
        .collect();

    Ok(Json(messages))
}

// ============ Git Create PR (stub) ============
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCreatePrRequest {
    pub worktree_path: String,
    pub title: String,
    pub body: Option<String>,
    pub base_branch: String,
    pub head_branch: String,
}

#[derive(serde::Serialize)]
pub struct PullRequestInfo {
    pub url: String,
    pub number: Option<u32>,
}

async fn git_create_pr(
    Json(payload): Json<GitCreatePrRequest>,
) -> Result<Json<PullRequestInfo>, String> {
    log_other!(info, "Git create PR: base={}, head={}", payload.base_branch, payload.head_branch);
    
    // TODO: 实现真正的 GitHub PR 创建逻辑
    // 目前返回模拟数据
    Ok(Json(PullRequestInfo {
        url: format!("https://github.com/example/repo/pull/1"),
        number: Some(1),
    }))
}

// ============ Git Commit ============
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitRequest {
    pub worktree_path: String,
    pub message: String,
}

#[derive(serde::Serialize)]
pub struct CommitResult {
    pub success: bool,
    pub message: String,
}

async fn git_commit(
    Json(payload): Json<GitCommitRequest>,
) -> Result<Json<CommitResult>, String> {
    log_other!(info, "Git commit: path={}", payload.worktree_path);
    
    // Stage all changes
    let add_output = Command::new("git")
        .arg("add")
        .arg("-A")
        .current_dir(&payload.worktree_path)
        .output()
        .map_err(|e| format!("Failed to stage changes: {}", e))?;

    // Commit
    let commit_output = Command::new("git")
        .arg("commit")
        .arg("-m")
        .arg(&payload.message)
        .current_dir(&payload.worktree_path)
        .output()
        .map_err(|e| format!("Failed to commit: {}", e))?;

    let success = commit_output.status.success();
    let message = if success {
        String::from_utf8_lossy(&commit_output.stdout).trim().to_string()
    } else {
        String::from_utf8_lossy(&commit_output.stderr).trim().to_string()
    };

    Ok(Json(CommitResult { success, message }))
}

// ============ Settings API Handlers ============

/// GET /api/settings - 获取全局设置
async fn http_get_settings() -> Json<crate::commands::settings::GlobalSettings> {
    Json(crate::commands::settings::load_settings())
}

/// PUT /api/settings - 保存全局设置
async fn http_save_settings(
    Json(settings): Json<crate::commands::settings::GlobalSettings>,
) -> Result<Json<serde_json::Value>, String> {
    crate::commands::settings::save_settings(&settings)?;
    Ok(Json(serde_json::json!({ "success": true })))
}

/// GET /api/settings/workspace - 获取 worktree 目录配置
async fn http_get_settings_workspace() -> Json<Option<String>> {
    Json(crate::commands::settings::load_settings().workspace_dir)
}

/// PUT /api/settings/workspace - 设置 worktree 目录配置
async fn http_save_settings_workspace(
    Json(dir): Json<Option<String>>,
) -> Result<Json<serde_json::Value>, String> {
    let mut settings = crate::commands::settings::load_settings();
    settings.workspace_dir = dir;
    crate::commands::settings::save_settings(&settings)?;
    Ok(Json(serde_json::json!({ "success": true })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillsFindPayload {
    query: String,
    limit: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillsRepoListPayload {
    repo: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillsInstallPayload {
    repo: String,
    skill: String,
    agent: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillsRemovePayload {
    skill: String,
}

#[derive(Deserialize)]
struct SyncProjectSkillsPayload {
    repo_path: String,
    skills: Vec<String>,
}

async fn http_get_skills_hub_status() -> Result<Json<serde_json::Value>, String> {
    let settings = load_settings();
    let hub_dir = resolve_skills_hub_dir(settings.skills_hub_dir.as_deref());
    let status = get_skills_hub_status(&hub_dir)?;
    Ok(Json(serde_json::json!({
        "success": true,
        "data": status
    })))
}

async fn http_skills_find(
    Json(payload): Json<SkillsFindPayload>,
) -> Result<Json<serde_json::Value>, String> {
    let result = skills_search_api(&payload.query, payload.limit).await?;
    Ok(Json(serde_json::json!({
        "success": true,
        "data": result
    })))
}

async fn http_skills_repo_list(
    Json(payload): Json<SkillsRepoListPayload>,
) -> Result<Json<serde_json::Value>, String> {
    let settings = load_settings();
    let hub_dir = resolve_skills_hub_dir(settings.skills_hub_dir.as_deref());
    let result = skills_repo_list(&hub_dir, &payload.repo)?;
    Ok(Json(serde_json::json!({
        "success": true,
        "data": result
    })))
}

async fn http_skills_install(
    Json(payload): Json<SkillsInstallPayload>,
) -> Result<Json<serde_json::Value>, String> {
    let settings = load_settings();
    let hub_dir = resolve_skills_hub_dir(settings.skills_hub_dir.as_deref());
    let result = skills_install(
        &hub_dir,
        &payload.repo,
        &payload.skill,
        payload.agent.as_deref(),
    )?;
    Ok(Json(serde_json::json!({
        "success": true,
        "data": result
    })))
}

async fn http_skills_remove(
    Json(payload): Json<SkillsRemovePayload>,
) -> Result<Json<serde_json::Value>, String> {
    let settings = load_settings();
    let hub_dir = resolve_skills_hub_dir(settings.skills_hub_dir.as_deref());
    let result = skills_remove(&hub_dir, &payload.skill)?;
    Ok(Json(serde_json::json!({
        "success": true,
        "data": result
    })))
}

async fn http_skills_update() -> Result<Json<serde_json::Value>, String> {
    let settings = load_settings();
    let hub_dir = resolve_skills_hub_dir(settings.skills_hub_dir.as_deref());
    let result = skills_update(&hub_dir)?;
    Ok(Json(serde_json::json!({
        "success": true,
        "data": result
    })))
}

// ============ Swarm Config API Handlers ============

/// POST /api/swarm-config/write - 写入蜂群配置到项目
async fn write_swarm_config(
    Json(request): Json<WriteSwarmConfigRequest>,
) -> Result<Json<WriteSwarmConfigResult>, String> {
    write_swarm_config_to_project(&request).map(Json)
}

/// POST /api/swarm-config/read - 读取项目配置
async fn read_swarm_config(
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<ProjectConfig>, String> {
    let repo_path = payload
        .get("repoPath")
        .and_then(|v| v.as_str())
        .ok_or("repoPath is required")?;
    read_project_config(repo_path.to_string()).await.map(Json)
}

/// POST /api/swarm-config/save - 保存单个项目配置文件
async fn save_swarm_config_file(
    Json(request): Json<SaveProjectConfigRequest>,
) -> Result<Json<SaveProjectConfigResult>, String> {
    save_project_config_file(request).await.map(Json)
}

async fn sync_project_skills(
    Json(payload): Json<SyncProjectSkillsPayload>,
) -> Result<Json<serde_json::Value>, String> {
    let repo_path = PathBuf::from(payload.repo_path.trim());
    if payload.skills.is_empty() {
        return Ok(Json(serde_json::json!({
            "success": true,
            "message": "No skills to sync",
            "copied_skills": Vec::<String>::new(),
        })));
    }

    let settings = load_settings();
    let hub_dir = resolve_skills_hub_dir(settings.skills_hub_dir.as_deref());
    let hub_skills_dir = hub_dir.join(".agents").join("skills");
    if !hub_skills_dir.exists() {
        return Err(format!("Skills hub directory not found: {}", hub_skills_dir.display()));
    }

    let project_skills_dir = repo_path.join(".opencode").join("skills");
    fs::create_dir_all(&project_skills_dir)
        .map_err(|e| format!("Failed to create project skills directory: {}", e))?;

    let mut copied_skills: Vec<String> = Vec::new();

    for skill in payload.skills {
        let trimmed = skill.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.contains('/') || trimmed.contains('\\') {
            return Err(format!("Invalid skill name: {}", trimmed));
        }

        let source_dir = hub_skills_dir.join(trimmed);
        if !source_dir.exists() || !source_dir.is_dir() {
            return Err(format!("Skill not found in hub: {}", trimmed));
        }

        let target_dir = project_skills_dir.join(trimmed);
        if target_dir.exists() {
            fs::remove_dir_all(&target_dir)
                .map_err(|e| format!("Failed to replace existing skill {}: {}", trimmed, e))?;
        }

        copy_dir_recursive(&source_dir, &target_dir)?;
        copied_skills.push(trimmed.to_string());
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "message": format!("Synced {} skills", copied_skills.len()),
        "copied_skills": copied_skills,
    })))
}

// ============ Workspace Management Handlers ============

async fn create_workspace(
    Json(payload): Json<CreateWorkspaceRequest>,
) -> Result<Json<WorktreeInfo>, String> {
    log_other!(info, "Creating workspace: repo={}, branch={}", payload.repo_path, payload.branch);
    
    // 检查是否是 GitHub URL，如果是则克隆到本地
    let local_repo_path = if payload.repo_path.starts_with("http") {
        // 是 GitHub URL，需要克隆
        let repo_name = payload.repo_path
            .trim_end_matches(".git")
            .split('/')
            .last()
            .unwrap_or("repo");
        
        // 可通过环境变量 HIVE_WORKTREE_BASE 配置 worktree 基础目录
        // 默认为 /tmp/hive-clones
        let clone_base = std::env::var("HIVE_WORKTREE_BASE")
            .map(PathBuf::from)
            .unwrap_or_else(|_| std::env::temp_dir().join("hive-clones"));
        let local_path = clone_base.join(repo_name);
        
        if !local_path.exists() {
            log_other!(info, "Cloning {} to {:?}", payload.repo_path, local_path);
            
            // 克隆仓库
            let output = Command::new("git")
                .arg("clone")
                .arg(&payload.repo_path)
                .arg(&local_path)
                .output()
                .map_err(|e| format!("Failed to run git clone: {}", e))?;
            
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!("Failed to clone repository: {}", stderr));
            }
        }
        
        local_path.to_string_lossy().to_string()
    } else {
        payload.repo_path.clone()
    };
    
    // 尝试从全局设置获取 worktree 目录
    let settings = crate::commands::settings::load_settings();
    let custom_dir = settings.workspace_dir.map(PathBuf::from);
    
    let manager = WorktreeManager::new(PathBuf::from(&local_repo_path), custom_dir);
    let name = format!("ws-{}", uuid::Uuid::new_v4().to_string().split('-').next().unwrap());
    
    let worktree_path = manager.create_worktree(&name, &payload.branch, payload.base_branch.as_deref())?;
    
    Ok(Json(WorktreeInfo {
        id: name,
        path: worktree_path.to_string_lossy().to_string(),
        branch: payload.branch,
        base_branch: payload.base_branch,
    }))
}

async fn delete_workspace(
    Path(workspace_id): Path<String>,
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, String> {
    let repo_path = payload.get("repo_path")
        .and_then(|v| v.as_str())
        .ok_or("repo_path is required")?;

    log_other!(info, "Deleting workspace: id={}, repo={}", workspace_id, repo_path);

    let manager = WorktreeManager::new(PathBuf::from(repo_path), None);
    manager.remove_worktree(&workspace_id)?;

    Ok(Json(serde_json::json!({"success": true})))
}

/// Get workspace by ID (from database)
async fn get_workspace_by_id(
    Path(workspace_id): Path<String>,
    State(state): State<HttpServerState>,
) -> Result<Json<WorkspaceResponse>, String> {
    log_other!(info, "Getting workspace by id: {}", workspace_id);

    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;

    let row = sqlx::query(
        "SELECT id, task_id, branch, base_branch, agent_working_dir, setup_completed_at, agent_cli, archived, pinned, created_at, updated_at
         FROM workspaces WHERE id = $1"
    )
    .bind(&workspace_id)
    .fetch_optional(pool.as_ref())
    .await
    .map_err(|e| format!("Failed to fetch workspace: {}", e))?;

    match row {
        Some(row) => {
            let setup_ts: Option<i64> = row.try_get("setup_completed_at").ok();
            let workspace = WorkspaceResponse {
                id: row.try_get("id").ok().ok_or("Failed to get id")?,
                task_id: row.try_get("task_id").ok().ok_or("Failed to get task_id")?,
                branch: row.try_get("branch").ok().ok_or("Failed to get branch")?,
                base_branch: row.try_get("base_branch").ok(),
                agent_working_dir: row.try_get("agent_working_dir").ok(),
                setup_completed_at: setup_ts.map(|ts| timestamp_to_iso(Some(ts))),
                agent_cli: row.try_get("agent_cli").ok().ok_or("Failed to get agent_cli")?,
                archived: row.try_get::<i32, _>("archived").unwrap_or(0) == 1,
                pinned: row.try_get::<i32, _>("pinned").unwrap_or(0) == 1,
                created_at: timestamp_to_iso(row.try_get("created_at").ok()),
                updated_at: timestamp_to_iso(row.try_get("updated_at").ok()),
            };
            Ok(Json(workspace))
        }
        None => Err(format!("Workspace not found: {}", workspace_id)),
    }
}

async fn get_workspace_status(
    Json(payload): Json<GetWorktreeStatusRequest>,
) -> Result<Json<WorktreeStatus>, String> {
    log_other!(info, "Getting worktree status: path={}", payload.worktree_path);
    
    let manager = WorktreeManager::new(PathBuf::from(&payload.repo_path), None);
    let status = manager.get_worktree_status(std::path::Path::new(&payload.worktree_path))?;
    
    Ok(Json(status))
}

async fn get_workspace_diff_stats(
    Json(payload): Json<GetDiffStatsRequest>,
) -> Result<Json<BranchDiffStats>, String> {
    log_other!(info, "Getting diff stats: path={}, target={}", payload.worktree_path, payload.target_branch);
    
    let manager = WorktreeManager::new(PathBuf::from(&payload.repo_path), None);
    let stats = manager.get_branch_diff_stats(std::path::Path::new(&payload.worktree_path), &payload.target_branch)?;
    
    Ok(Json(stats))
}

async fn list_workspaces(
    repo_path: Option<String>,
) -> Result<Json<Vec<serde_json::Value>>, String> {
    if let Some(path) = repo_path {
        log_other!(info, "Listing workspaces for repo: {}", path);
        let manager = WorktreeManager::new(PathBuf::from(&path), None);
        let entries = manager.list_worktrees()?;
        
        // WorktreeEntry has path, commit, branch - use path as id
        Ok(Json(entries.into_iter().map(|e| serde_json::json!({
            "id": e.path,  // use path as id
            "path": e.path,
            "branch": e.branch,
        })).collect()))
    } else {
        Ok(Json(vec![]))
    }
}

// ============ Projects API ============

async fn get_projects(
    State(state): State<HttpServerState>,
) -> Result<Json<Vec<ProjectResponse>>, String> {
    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;

    let rows = sqlx::query(
        r#"SELECT p.id, p.name, p.description, p.repo_path, p.target_branch, p.created_at, p.updated_at,
           psb.swarm_template_id
           FROM projects p
           LEFT JOIN project_swarm_bindings psb ON p.id = psb.project_id AND psb.is_active = 1
           ORDER BY p.created_at DESC"#
    )
    .fetch_all(pool.as_ref())
    .await
    .map_err(|e| format!("Failed to fetch projects: {}", e))?;

    let mut projects: Vec<ProjectResponse> = Vec::with_capacity(rows.len());
    for row in rows {
        let swarm_id: Option<String> = row.try_get("swarm_template_id").ok();
        let swarm_name = if let Some(sid) = swarm_id.as_ref() {
            load_template_swarm_config_by_id(sid).await.ok().map(|config| config.name)
        } else {
            None
        };
        let created_at: Option<i64> = row.try_get("created_at").ok();
        let updated_at: Option<i64> = row.try_get("updated_at").ok();
        let repo_path: String = row.get("repo_path");
        projects.push(ProjectResponse {
            id: row.get("id"),
            name: row.get("name"),
            description: row.try_get("description").ok(),
            repo_path: normalize_windows_path(&repo_path),
            target_branch: row.try_get::<String, _>("target_branch").unwrap_or_else(|_| "main".to_string()),
            created_at: timestamp_to_iso(created_at),
            updated_at: timestamp_to_iso(updated_at),
            swarm_id,
            swarm_name,
            config_write: None,
        });
    }

    Ok(Json(projects))
}

async fn get_project_by_id(
    State(state): State<HttpServerState>,
    Path(id): Path<String>,
) -> Result<Json<ProjectResponse>, String> {
    log_other!(info, "[get_project_by_id] Fetching project: {}", id);

    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;

    let row = sqlx::query(
        r#"SELECT p.id, p.name, p.description, p.repo_path, p.target_branch, p.created_at, p.updated_at,
           psb.swarm_template_id
           FROM projects p
           LEFT JOIN project_swarm_bindings psb ON p.id = psb.project_id AND psb.is_active = 1
           WHERE p.id = $1 LIMIT 1"#
    )
    .bind(&id)
    .fetch_optional(pool.as_ref())
    .await
    .map_err(|e| format!("Failed to fetch project: {}", e))?
    .ok_or("Project not found")?;

    let repo_path: String = row.get("repo_path");
    let repo_path_normalized = normalize_windows_path(&repo_path);
    let swarm_id: Option<String> = row.try_get("swarm_template_id").ok();
    let swarm_name = if let Some(sid) = swarm_id.as_ref() {
        load_template_swarm_config_by_id(sid).await.ok().map(|config| config.name)
    } else {
        None
    };

    log_other!(info, "[get_project_by_id] DB result - repo_path: {}, normalized: {}, swarm_id: {:?}, swarm_name: {:?}",
        repo_path, repo_path_normalized, swarm_id, swarm_name);

    let created_at: Option<i64> = row.try_get("created_at").ok();
    let updated_at: Option<i64> = row.try_get("updated_at").ok();

    let response = ProjectResponse {
        id: row.get("id"),
        name: row.get("name"),
        description: row.try_get("description").ok(),
        repo_path: repo_path_normalized,
        target_branch: row.try_get::<String, _>("target_branch").unwrap_or_else(|_| "main".to_string()),
        created_at: timestamp_to_iso(created_at),
        updated_at: timestamp_to_iso(updated_at),
        swarm_id: swarm_id.clone(),
        swarm_name: swarm_name.clone(),
        config_write: None,
    };

    log_other!(info, "[get_project_by_id] Response - repoPath: {}, swarmId: {:?}, swarmName: {:?}",
        response.repo_path, response.swarm_id, response.swarm_name);

    // 序列化后打印，验证 serde rename 是否生效
    let json_str = serde_json::to_string_pretty(&response).unwrap_or_else(|_| "Failed to serialize".to_string());
    log_other!(info, "[get_project_by_id] Serialized JSON:\n{}", json_str);

    Ok(Json(response))
}

async fn get_templates() -> Result<Json<Vec<TemplateSummaryResponse>>, String> {
    let details = load_all_template_details().await?;
    let summaries = details.into_iter().map(|item| item.summary).collect::<Vec<_>>();
    Ok(Json(summaries))
}

async fn get_template_by_id(Path(template_id): Path<String>) -> Result<Json<TemplateDetailResponse>, String> {
    let details = load_all_template_details().await?;
    let template = details
        .into_iter()
        .find(|item| item.summary.id == template_id)
        .ok_or_else(|| "Template not found".to_string())?;
    Ok(Json(template))
}

async fn create_project(
    State(state): State<HttpServerState>,
    Json(payload): Json<CreateProjectRequest>,
) -> Result<Json<ProjectResponse>, String> {
    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;
    let mut tx = pool
        .as_ref()
        .begin()
        .await
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    let project_id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().timestamp();
    let target_branch = payload.target_branch.unwrap_or_else(|| "main".to_string());

    sqlx::query(
        r#"INSERT INTO projects (id, name, description, repo_path, target_branch, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)"#
    )
    .bind(&project_id)
    .bind(&payload.name)
    .bind(&payload.description)
    .bind(&payload.repo_path)
    .bind(&target_branch)
    .bind(now)
    .bind(now)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("Failed to create project: {}", e))?;

    // 获取蜂群名称和配置（如果提供了 swarm_id）
    let (swarm_id, swarm_name) = if let Some(sid) = &payload.swarm_id {
        let template_id = normalize_swarm_template_id(sid);
        let normalized_swarm_id = official_swarm_id(&template_id);
        let template_config = load_template_swarm_config_by_id(&normalized_swarm_id).await?;
        let binding_id = uuid::Uuid::new_v4().to_string();
        log_other!(info, "[create_project] Creating swarm binding - projectId: {}, swarmTemplateId: {}, is_active: 1", project_id, normalized_swarm_id);

        let insert_result = sqlx::query(
            r#"INSERT INTO project_swarm_bindings (id, project_id, swarm_template_id, is_active, bound_at, updated_at)
               VALUES ($1, $2, $3, 1, $4, $4)"#
        )
        .bind(&binding_id)
        .bind(&project_id)
        .bind(&normalized_swarm_id)
        .bind(now)
        .execute(&mut *tx)
        .await;

        match &insert_result {
            Ok(_) => log_other!(info, "[create_project] Swarm binding created successfully"),
            Err(e) => log_other!(error, "[create_project] Failed to create swarm binding: {}", e),
        }

        (Some(normalized_swarm_id), Some(template_config.name))
    } else {
        (None, None)
    };

    // 如果创建了蜂群绑定，直接写入配置到项目目录
    let config_write = if let Some(sid) = &swarm_id {
        if let Ok(config) = load_template_swarm_config_by_id(sid).await {
            log_other!(
                info,
                "[create_project] Swarm config loaded - repo_path={}, has_oh_my_opencode_json={}, has_opencode_json={}, has_claude_md={}, has_agents_md={}",
                payload.repo_path,
                config.oh_my_opencode_json.as_ref().is_some_and(|v| !v.trim().is_empty()),
                config.opencode_json.as_ref().is_some_and(|v| !v.trim().is_empty()),
                config.claude_md.as_ref().is_some_and(|v| !v.trim().is_empty()),
                config.agents_md.as_ref().is_some_and(|v| !v.trim().is_empty())
            );
            let opencode_json = require_opencode_json_content(
                config.opencode_json.clone(),
                "create_project",
                &config.template_id,
            )?;
            let scope = payload.capability_scope.clone();
            let overrides = payload.capability_overrides.clone();
            let apply_agent_config = scope
                .as_ref()
                .and_then(|value| value.agent_config)
                .unwrap_or(true);
            let apply_skills = scope
                .as_ref()
                .and_then(|value| value.skills)
                .unwrap_or(true);
            let apply_rules = scope
                .as_ref()
                .and_then(|value| value.rules)
                .unwrap_or(true);
            let apply_template = scope
                .as_ref()
                .and_then(|value| value.template)
                .unwrap_or(true);
            let swarm_selected_skills = config.skills.clone();
            let override_project_skills = overrides
                .as_ref()
                .and_then(|value| value.project_skills.clone())
                .unwrap_or_default();
            let selected_skills = if apply_skills {
                let source_skills = if override_project_skills.is_empty() {
                    swarm_selected_skills
                } else {
                    override_project_skills
                };
                normalize_skill_names(&source_skills)
            } else {
                Vec::new()
            };

            let selected_oh_my_opencode_json = if apply_agent_config {
                overrides
                    .as_ref()
                    .and_then(|value| value.oh_my_opencode_json.clone())
                    .or(config.oh_my_opencode_json.clone())
            } else {
                None
            };
            let selected_opencode_json = if apply_agent_config {
                overrides
                    .as_ref()
                    .and_then(|value| value.opencode_json.clone())
                    .or(Some(opencode_json.clone()))
            } else {
                None
            };
            let selected_claude_md = if apply_rules {
                overrides
                    .as_ref()
                    .and_then(|value| value.claude_md.clone())
                    .or(config.claude_md.clone())
            } else {
                None
            };
            let selected_agents_md = if apply_rules {
                overrides
                    .as_ref()
                    .and_then(|value| value.agents_md.clone())
                    .or(config.agents_md.clone())
            } else {
                None
            };
            let selected_include_template = if apply_template {
                overrides
                    .as_ref()
                    .and_then(|value| value.include_template)
                    .unwrap_or(false)
            } else {
                false
            };
            let selected_template_git_url = if selected_include_template {
                overrides
                    .as_ref()
                    .and_then(|value| value.template_git_url.clone())
                    .or(config.template_git_url.clone())
            } else {
                None
            };
            let selected_template_branch = if selected_include_template {
                overrides
                    .as_ref()
                    .and_then(|value| value.template_branch.clone())
                    .or(config.template_branch.clone())
            } else {
                None
            };

            // 直接写入配置文件
            let write_request = WriteSwarmConfigRequest {
                repo_path: payload.repo_path.clone(),
                oh_my_opencode_json: selected_oh_my_opencode_json,
                opencode_json: selected_opencode_json,
                claude_md: selected_claude_md,
                agents_md: selected_agents_md,
                swarm_id: None,
                include_template: selected_include_template,
                template_git_url: selected_template_git_url,
                template_branch: selected_template_branch,
            };

            match write_swarm_config_to_project(&write_request) {
                Ok(result) => {
                    let root_opencode_path = std::path::Path::new(&payload.repo_path).join("opencode.json");
                    log_other!(info, "[create_project] Swarm config written to {:?}: {:?}", payload.repo_path, result);
                    log_other!(
                        info,
                        "[create_project] post-write root opencode path: {:?}, exists={}",
                        root_opencode_path,
                        root_opencode_path.exists()
                    );
                    Some(serde_json::json!({
                        "repoPath": &payload.repo_path,
                        "filesWritten": result.files_written,
                        "dirsCreated": result.dirs_created,
                        "skillsSync": if apply_skills {
                            match sync_project_skills_from_hub(&payload.repo_path, &selected_skills) {
                                Ok((copied_skills, missing_skills)) => Some(serde_json::json!({
                                    "requestedSkills": selected_skills,
                                    "copiedSkills": copied_skills,
                                    "missingSkills": missing_skills,
                                })),
                                Err(err) => {
                                    log_other!(error, "[create_project] Failed to sync project skills from hub: {}", err);
                                    Some(serde_json::json!({
                                        "requestedSkills": selected_skills,
                                        "copiedSkills": Vec::<String>::new(),
                                        "missingSkills": selected_skills,
                                    }))
                                }
                            }
                        } else {
                            None
                        },
                        "capabilityScope": {
                            "agentConfig": apply_agent_config,
                            "skills": apply_skills,
                            "rules": apply_rules,
                            "template": apply_template,
                        },
                    }))
                }
                Err(e) => {
                    log_other!(error, "[create_project] Failed to write swarm config: {}", e);
                    tx.rollback()
                        .await
                        .map_err(|rollback_err| format!("Failed to rollback transaction: {}", rollback_err))?;
                    return Err(format!("Failed to write swarm config: {}", e));
                }
            }
        } else {
            None
        }
    } else {
        None
    };

    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit transaction: {}", e))?;

    let response = ProjectResponse {
        id: project_id,
        name: payload.name,
        description: payload.description,
        repo_path: payload.repo_path,
        target_branch,
        created_at: timestamp_to_iso(Some(now)),
        updated_at: timestamp_to_iso(Some(now)),
        swarm_id,
        swarm_name,
        config_write: config_write.map(|v| v.into()),
    };

    // 打印 create_project 返回值用于调试
    log_other!(info, "[create_project] Response with config_write: {}", serde_json::to_string(&response).unwrap_or_default());

    Ok(Json(response))
}

async fn update_project(
    State(state): State<HttpServerState>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateProjectRequest>,
) -> Result<Json<ProjectResponse>, String> {
    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;

    let now = chrono::Utc::now().timestamp();

    // 先获取现有的项目信息（包括 swarm）
    let existing = sqlx::query(
        r#"SELECT p.id, p.name, p.description, p.repo_path, p.target_branch, p.created_at, p.updated_at,
           psb.swarm_template_id
           FROM projects p
           LEFT JOIN project_swarm_bindings psb ON p.id = psb.project_id AND psb.is_active = 1
           WHERE p.id = $1 LIMIT 1"#
    )
    .bind(&id)
    .fetch_optional(pool.as_ref())
    .await
    .map_err(|e| format!("Failed to fetch project: {}", e))?
    .ok_or("Project not found")?;

    let name = payload.name.unwrap_or_else(|| existing.get("name"));
    let description = payload.description.or_else(|| existing.try_get("description").ok());
    let repo_path = payload.repo_path.unwrap_or_else(|| existing.get("repo_path"));
    let target_branch = payload.target_branch.unwrap_or_else(|| existing.try_get::<String, _>("target_branch").unwrap_or_else(|_| "main".to_string()));
    let swarm_id: Option<String> = existing.try_get("swarm_template_id").ok();
    let swarm_name = if let Some(sid) = swarm_id.as_ref() {
        load_template_swarm_config_by_id(sid).await.ok().map(|config| config.name)
    } else {
        None
    };

    sqlx::query(
        r#"UPDATE projects SET name = $1, description = $2, repo_path = $3, target_branch = $4, updated_at = $5
           WHERE id = $6"#
    )
    .bind(&name)
    .bind(&description)
    .bind(&repo_path)
    .bind(&target_branch)
    .bind(now)
    .bind(&id)
    .execute(pool.as_ref())
    .await
    .map_err(|e| format!("Failed to update project: {}", e))?;

    Ok(Json(ProjectResponse {
        id,
        name,
        description,
        repo_path,
        target_branch,
        created_at: timestamp_to_iso(existing.try_get("created_at").ok()),
        updated_at: timestamp_to_iso(Some(now)),
        swarm_id,
        swarm_name,
        config_write: None,
    }))
}

async fn apply_project_swarm_config(
    State(state): State<HttpServerState>,
    Path(project_id): Path<String>,
    Json(payload): Json<ApplyProjectSwarmConfigRequest>,
) -> Result<Json<serde_json::Value>, String> {
    if payload.swarm_id.trim().is_empty() {
        return Err("swarm_id is required".to_string());
    }

    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;
    let now = chrono::Utc::now().timestamp();

    let project_row = sqlx::query_as::<_, (String, String, String)>(
        "SELECT id, name, repo_path FROM projects WHERE id = ? LIMIT 1",
    )
    .bind(&project_id)
    .fetch_optional(pool.as_ref())
    .await
    .map_err(|e| format!("Failed to query project: {}", e))?
    .ok_or("Project not found")?;
    let repo_path = project_row.2;

    let template_id = normalize_swarm_template_id(&payload.swarm_id);
    let normalized_swarm_id = official_swarm_id(&template_id);
    let swarm_config = load_template_swarm_config_by_id(&normalized_swarm_id).await?;

    sqlx::query("UPDATE project_swarm_bindings SET is_active = 0, updated_at = ? WHERE project_id = ?")
        .bind(now)
        .bind(&project_id)
        .execute(pool.as_ref())
        .await
        .map_err(|e| format!("Failed to deactivate previous swarm bindings: {}", e))?;

    let existing_binding_id = sqlx::query_scalar::<_, String>(
        "SELECT id FROM project_swarm_bindings WHERE project_id = ? AND swarm_template_id = ? LIMIT 1"
    )
    .bind(&project_id)
    .bind(&normalized_swarm_id)
    .fetch_optional(pool.as_ref())
    .await
    .map_err(|e| format!("Failed to query existing swarm binding: {}", e))?;

    let binding_id = if let Some(binding_id) = existing_binding_id {
        sqlx::query("UPDATE project_swarm_bindings SET is_active = 1, updated_at = ? WHERE id = ?")
            .bind(now)
            .bind(&binding_id)
            .execute(pool.as_ref())
            .await
            .map_err(|e| format!("Failed to activate existing swarm binding: {}", e))?;
        binding_id
    } else {
        let binding_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO project_swarm_bindings (id, project_id, swarm_template_id, is_active, bound_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)"
        )
        .bind(&binding_id)
        .bind(&project_id)
        .bind(&normalized_swarm_id)
        .bind(now)
        .bind(now)
        .execute(pool.as_ref())
        .await
        .map_err(|e| format!("Failed to create swarm binding: {}", e))?;
        binding_id
    };

    let scope = payload.capability_scope.clone();
    let overrides = payload.capability_overrides.clone();
    let apply_agent_config = scope
        .as_ref()
        .and_then(|value| value.agent_config)
        .unwrap_or(true);
    let apply_skills = scope
        .as_ref()
        .and_then(|value| value.skills)
        .unwrap_or(true);
    let apply_rules = scope
        .as_ref()
        .and_then(|value| value.rules)
        .unwrap_or(true);
    let apply_template = scope
        .as_ref()
        .and_then(|value| value.template)
        .unwrap_or(true);

    let has_template_override = overrides
        .as_ref()
        .is_some_and(|value| {
            value.include_template.unwrap_or(false)
                || value
                    .template_git_url
                    .as_ref()
                    .is_some_and(|v| !v.trim().is_empty())
                || value
                    .template_branch
                    .as_ref()
                    .is_some_and(|v| !v.trim().is_empty())
        });
    if apply_template || has_template_override {
        return Err("Template pull is only supported during project creation".to_string());
    }

    let opencode_json = require_opencode_json_content(
        swarm_config.opencode_json.clone(),
        "apply_project_swarm_config",
        &swarm_config.template_id,
    )?;
    let swarm_selected_skills = swarm_config.skills.clone();
    let override_project_skills = overrides
        .as_ref()
        .and_then(|value| value.project_skills.clone())
        .unwrap_or_default();
    let selected_skills = if apply_skills {
        let source_skills = if override_project_skills.is_empty() {
            swarm_selected_skills
        } else {
            override_project_skills
        };
        normalize_skill_names(&source_skills)
    } else {
        Vec::new()
    };

    let selected_oh_my_opencode_json = if apply_agent_config {
        overrides
            .as_ref()
            .and_then(|value| value.oh_my_opencode_json.clone())
            .or(swarm_config.oh_my_opencode_json.clone())
    } else {
        None
    };
    let selected_opencode_json = if apply_agent_config {
        overrides
            .as_ref()
            .and_then(|value| value.opencode_json.clone())
            .or(Some(opencode_json.clone()))
    } else {
        None
    };
    let selected_claude_md = if apply_rules {
        overrides
            .as_ref()
            .and_then(|value| value.claude_md.clone())
            .or(swarm_config.claude_md.clone())
    } else {
        None
    };
    let selected_agents_md = if apply_rules {
        overrides
            .as_ref()
            .and_then(|value| value.agents_md.clone())
            .or(swarm_config.agents_md.clone())
    } else {
        None
    };
    let selected_include_template = false;
    let selected_template_git_url = if selected_include_template {
        overrides
            .as_ref()
            .and_then(|value| value.template_git_url.clone())
            .or(swarm_config.template_git_url.clone())
    } else {
        None
    };
    let selected_template_branch = if selected_include_template {
        overrides
            .as_ref()
            .and_then(|value| value.template_branch.clone())
            .or(swarm_config.template_branch.clone())
    } else {
        None
    };

    let write_request = WriteSwarmConfigRequest {
        repo_path: repo_path.clone(),
        oh_my_opencode_json: selected_oh_my_opencode_json,
        opencode_json: selected_opencode_json,
        claude_md: selected_claude_md,
        agents_md: selected_agents_md,
        swarm_id: None,
        include_template: selected_include_template,
        template_git_url: selected_template_git_url,
        template_branch: selected_template_branch,
    };
    let write_result = write_swarm_config_to_project(&write_request)
        .map_err(|e| format!("Failed to write swarm config: {}", e))?;

    let skills_sync = if apply_skills {
        match sync_project_skills_from_hub(&repo_path, &selected_skills) {
            Ok((copied_skills, missing_skills)) => Some(serde_json::json!({
                "requestedSkills": selected_skills,
                "copiedSkills": copied_skills,
                "missingSkills": missing_skills,
            })),
            Err(err) => {
                log_other!(error, "[apply_project_swarm_config] Failed to sync project skills from hub: {}", err);
                Some(serde_json::json!({
                    "requestedSkills": selected_skills,
                    "copiedSkills": Vec::<String>::new(),
                    "missingSkills": selected_skills,
                }))
            }
        }
    } else {
        None
    };

    Ok(Json(serde_json::json!({
        "success": true,
        "projectId": project_row.0,
        "projectName": project_row.1,
        "swarmId": swarm_config.swarm_id,
        "bindingId": binding_id,
        "configWrite": {
            "repoPath": repo_path,
            "filesWritten": write_result.files_written,
            "dirsCreated": write_result.dirs_created,
            "skillsSync": skills_sync,
            "capabilityScope": {
                "agentConfig": apply_agent_config,
                "skills": apply_skills,
                "rules": apply_rules,
                "template": apply_template,
            }
        }
    })))
}

async fn delete_project(
    State(state): State<HttpServerState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, String> {
    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;

    let result = sqlx::query("DELETE FROM projects WHERE id = $1")
        .bind(&id)
        .execute(pool.as_ref())
        .await
        .map_err(|e| format!("Failed to delete project: {}", e))?;

    if result.rows_affected() == 0 {
        return Err("Project not found".to_string());
    }

    Ok(Json(serde_json::json!({"success": true})))
}

// ============ Tasks API ============

async fn upload_image(
    State(state): State<HttpServerState>,
    Json(payload): Json<UploadImageRequest>,
) -> Result<Json<ImageResponse>, String> {
    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;
    let bytes = BASE64_ENGINE
        .decode(payload.data_base64.as_bytes())
        .map_err(|e| format!("Invalid image base64: {}", e))?;
    let image = store_image_bytes(pool.as_ref(), &payload.filename, &bytes).await?;
    Ok(Json(image))
}

async fn get_image_by_id(
    State(state): State<HttpServerState>,
    Path(id): Path<String>,
) -> Result<Json<ImageResponse>, String> {
    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;
    let row = sqlx::query(
        "SELECT id, file_path, original_name, mime_type, size_bytes, created_at FROM images WHERE id = $1 LIMIT 1",
    )
    .bind(&id)
    .fetch_optional(pool.as_ref())
    .await
    .map_err(|e| format!("Failed to get image: {}", e))?
    .ok_or("Image not found")?;
    Ok(Json(ImageResponse {
        id: row.try_get("id").map_err(|e| format!("Failed to get image id: {}", e))?,
        file_path: row.try_get("file_path").map_err(|e| format!("Failed to get image path: {}", e))?,
        original_name: row.try_get("original_name").map_err(|e| format!("Failed to get image name: {}", e))?,
        mime_type: row.try_get("mime_type").map_err(|e| format!("Failed to get image mime: {}", e))?,
        size_bytes: row.try_get("size_bytes").map_err(|e| format!("Failed to get image size: {}", e))?,
        created_at: timestamp_to_iso(row.try_get("created_at").ok()),
    }))
}

async fn get_tasks_by_project(
    State(state): State<HttpServerState>,
    Path(project_id): Path<String>,
) -> Result<Json<Vec<TaskResponse>>, String> {
    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;

    let rows = sqlx::query(
        r#"SELECT id, project_id, title, description, status, agent_cli, model_id, position, created_at, updated_at
           FROM tasks WHERE project_id = $1 ORDER BY position ASC"#
    )
    .bind(&project_id)
    .fetch_all(pool.as_ref())
    .await
    .map_err(|e| format!("Failed to fetch tasks: {}", e))?;

    let mut tasks: Vec<TaskResponse> = Vec::with_capacity(rows.len());
    for row in rows {
        let task_id: String = row.get("id");
        let created_at: Option<i64> = row.try_get("created_at").ok();
        let updated_at: Option<i64> = row.try_get("updated_at").ok();
        let db_status: String = row.try_get::<String, _>("status").unwrap_or_else(|_| "todo".to_string());
        let reconciled_status = reconcile_task_runtime_status(pool.as_ref(), &task_id, &db_status).await?;
        if reconciled_status != db_status {
            let now_ts = chrono::Utc::now().timestamp();
            sqlx::query("UPDATE tasks SET status = $1, updated_at = $2 WHERE id = $3")
                .bind(&reconciled_status)
                .bind(now_ts)
                .bind(&task_id)
                .execute(pool.as_ref())
                .await
                .map_err(|e| format!("Failed to reconcile task status: {}", e))?;
        }
        let image_ids = get_task_image_ids(pool.as_ref(), &task_id).await?;
        tasks.push(TaskResponse {
            id: task_id,
            project_id: row.get("project_id"),
            title: row.try_get("title").ok(),
            description: row.get("description"),
            status: reconciled_status,
            agent_cli: row.try_get::<String, _>("agent_cli").unwrap_or_else(|_| "OPENCODE".to_string()),
            model_id: row.try_get("model_id").ok(),
            task_type: row.try_get::<String, _>("task_type").unwrap_or_else(|_| "normal".to_string()),
            direct_branch: row.try_get("direct_branch").ok(),
            image_ids,
            position: row.try_get("position").unwrap_or(0),
            created_at: timestamp_to_iso(created_at),
            updated_at: timestamp_to_iso(updated_at),
        });
    }

    Ok(Json(tasks))
}

async fn get_task_by_id(
    State(state): State<HttpServerState>,
    Path(id): Path<String>,
) -> Result<Json<TaskResponse>, String> {
    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;

    let row = sqlx::query(
        r#"SELECT id, project_id, title, description, status, agent_cli, model_id, task_type, direct_branch, position, created_at, updated_at
           FROM tasks WHERE id = $1 LIMIT 1"#
    )
    .bind(&id)
    .fetch_optional(pool.as_ref())
    .await
    .map_err(|e| format!("Failed to fetch task: {}", e))?
    .ok_or("Task not found")?;

    let created_at: Option<i64> = row.try_get("created_at").ok();
    let updated_at: Option<i64> = row.try_get("updated_at").ok();
    let task_id: String = row.get("id");
    let db_status: String = row.try_get::<String, _>("status").unwrap_or_else(|_| "todo".to_string());
    let reconciled_status = reconcile_task_runtime_status(pool.as_ref(), &task_id, &db_status).await?;
    if reconciled_status != db_status {
        let now_ts = chrono::Utc::now().timestamp();
        sqlx::query("UPDATE tasks SET status = $1, updated_at = $2 WHERE id = $3")
            .bind(&reconciled_status)
            .bind(now_ts)
            .bind(&task_id)
            .execute(pool.as_ref())
            .await
            .map_err(|e| format!("Failed to reconcile task status: {}", e))?;
    }
    let image_ids = get_task_image_ids(pool.as_ref(), &task_id).await?;

    Ok(Json(TaskResponse {
        id: task_id,
        project_id: row.get("project_id"),
        title: row.try_get("title").ok(),
        description: row.get("description"),
        status: reconciled_status,
        agent_cli: row.try_get::<String, _>("agent_cli").unwrap_or_else(|_| "OPENCODE".to_string()),
        model_id: row.try_get("model_id").ok(),
        task_type: row.try_get::<String, _>("task_type").unwrap_or_else(|_| "normal".to_string()),
        direct_branch: row.try_get("direct_branch").ok(),
        image_ids,
        position: row.try_get("position").unwrap_or(0),
        created_at: timestamp_to_iso(created_at),
        updated_at: timestamp_to_iso(updated_at),
    }))
}

async fn create_task(
    State(state): State<HttpServerState>,
    Json(payload): Json<CreateTaskRequest>,
) -> Result<Json<TaskResponse>, String> {
    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;

    let task_id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().timestamp();
    let status = payload.status.unwrap_or_else(|| "todo".to_string());
    let agent_cli = payload.agent_cli.unwrap_or_else(|| "OPENCODE".to_string());
    let position = payload.position.unwrap_or(0);
    let task_type = payload.task_type.unwrap_or_else(|| "normal".to_string());
    let image_ids = payload.image_ids.unwrap_or_default();

    sqlx::query(
        r#"INSERT INTO tasks (id, project_id, title, description, status, agent_cli, model_id, task_type, direct_branch, position, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)"#
    )
    .bind(&task_id)
    .bind(&payload.project_id)
    .bind(&payload.title)
    .bind(&payload.description)
    .bind(&status)
    .bind(&agent_cli)
    .bind(&payload.model_id)
    .bind(&task_type)
    .bind(&payload.direct_branch)
    .bind(position)
    .bind(now)
    .bind(now)
    .execute(pool.as_ref())
    .await
    .map_err(|e| format!("Failed to create task: {}", e))?;

    upsert_task_images(pool.as_ref(), &task_id, &image_ids).await?;

    Ok(Json(TaskResponse {
        id: task_id,
        project_id: payload.project_id,
        title: payload.title,
        description: payload.description,
        status,
        agent_cli,
        model_id: payload.model_id,
        task_type,
        direct_branch: payload.direct_branch,
        image_ids,
        position,
        created_at: timestamp_to_iso(Some(now)),
        updated_at: timestamp_to_iso(Some(now)),
    }))
}

async fn update_task(
    State(state): State<HttpServerState>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateTaskRequest>,
) -> Result<Json<TaskResponse>, String> {
    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;

    let now = chrono::Utc::now().timestamp();

    let existing = sqlx::query("SELECT * FROM tasks WHERE id = $1 LIMIT 1")
        .bind(&id)
        .fetch_optional(pool.as_ref())
        .await
        .map_err(|e| format!("Failed to fetch task: {}", e))?
        .ok_or("Task not found")?;

    let title = payload.title.or_else(|| existing.try_get("title").ok());
    let description = payload.description.unwrap_or_else(|| existing.get("description"));
    let status = payload.status.unwrap_or_else(|| existing.try_get::<String, _>("status").unwrap_or_else(|_| "todo".to_string()));
    let agent_cli = payload.agent_cli.unwrap_or_else(|| existing.try_get::<String, _>("agent_cli").unwrap_or_else(|_| "OPENCODE".to_string()));
    let model_id = payload.model_id.or_else(|| existing.try_get("model_id").ok());
    let task_type = payload.task_type.unwrap_or_else(|| existing.try_get::<String, _>("task_type").unwrap_or_else(|_| "normal".to_string()));
    let direct_branch = payload.direct_branch.or_else(|| existing.try_get("direct_branch").ok());
    let position = payload.position.unwrap_or_else(|| existing.try_get("position").unwrap_or(0));
    let image_ids = if let Some(ids) = payload.image_ids {
        ids
    } else {
        get_task_image_ids(pool.as_ref(), &id).await?
    };

    sqlx::query(
        r#"UPDATE tasks SET title = $1, description = $2, status = $3, agent_cli = $4, model_id = $5, position = $6, updated_at = $7
           WHERE id = $8"#
    )
    .bind(&title)
    .bind(&description)
    .bind(&status)
    .bind(&agent_cli)
    .bind(&model_id)
    .bind(position)
    .bind(now)
    .bind(&id)
    .execute(pool.as_ref())
    .await
    .map_err(|e| format!("Failed to update task: {}", e))?;

    upsert_task_images(pool.as_ref(), &id, &image_ids).await?;

    Ok(Json(TaskResponse {
        id,
        project_id: existing.get("project_id"),
        title,
        description,
        status,
        agent_cli,
        model_id,
        task_type,
        direct_branch,
        image_ids,
        position,
        created_at: timestamp_to_iso(existing.try_get("created_at").ok()),
        updated_at: timestamp_to_iso(Some(now)),
    }))
}

async fn delete_task(
    State(state): State<HttpServerState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, String> {
    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;

    let result = sqlx::query("DELETE FROM tasks WHERE id = $1")
        .bind(&id)
        .execute(pool.as_ref())
        .await
        .map_err(|e| format!("Failed to delete task: {}", e))?;

    if result.rows_affected() == 0 {
        return Err("Task not found".to_string());
    }

    Ok(Json(serde_json::json!({"success": true})))
}

/// Move task request - matches Next.js API format
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveTaskRequest {
    pub destination_status: String,
    pub new_position: i32,
}

/// Git repos query parameters
#[derive(serde::Deserialize)]
pub struct GitReposQuery {
    pub path: Option<String>,
}

/// Git repo entry response
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRepoEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
}

/// Scan directory for Git repositories (max_depth: 0 = only this directory)
fn scan_for_git_repos(dir_path: &std::path::Path, max_depth: u32) -> Vec<GitRepoEntry> {
    let mut results = Vec::new();

    // Check if directory exists
    if !dir_path.exists() {
        return results;
    }

    // Skip directories to ignore
    let dir_name = dir_path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    if dir_name.starts_with('.')
        || dir_name == "node_modules"
        || dir_name == "dist"
        || dir_name == "build"
        || dir_name == "target"
        || dir_name == ".next"
        || dir_name == "out" {
        return results;
    }

    // Read directory entries
    if let Ok(entries) = std::fs::read_dir(dir_path) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();

            // Skip hidden dirs and common build dirs
            if name.starts_with('.')
                || name == "node_modules"
                || name == "dist"
                || name == "build"
                || name == "target"
                || name == ".next"
                || name == "out" {
                continue;
            }

            if path.is_dir() {
                // Check if it's a git repository
                let git_dir = path.join(".git");
                if git_dir.exists() && git_dir.is_dir() {
                    results.push(GitRepoEntry {
                        name: name.clone(),
                        path: normalize_windows_path(&path.to_string_lossy()),
                        is_directory: true,
                    });
                } else if max_depth > 0 {
                    // Recursively scan subdirectories
                    let sub_results = scan_for_git_repos(&path, max_depth - 1);
                    results.extend(sub_results);
                }
            }
        }
    }

    results
}

/// Get list of local Git repositories
async fn get_git_repos(
    Query(query): Query<GitReposQuery>,
) -> Json<ApiResponse<Vec<GitRepoEntry>>> {
    use std::env;

    // Get default home directory
    let default_home = env::var("HOME")
        .or_else(|_| env::var("USERPROFILE"))
        .unwrap_or_else(|_| {
            if cfg!(windows) {
                "C:\\Users".to_string()
            } else {
                "/home".to_string()
            }
        });

    let scan_path = query.path.unwrap_or_else(|| default_home.clone());
    let resolved_path = std::path::Path::new(&scan_path)
        .canonicalize()
        .unwrap_or_else(|_| std::path::PathBuf::from(&scan_path));

    if !resolved_path.exists() || !resolved_path.is_dir() {
        return Json(ApiResponse::<Vec<GitRepoEntry>>::error(
            &format!("Invalid path: {}. Directory not found.", resolved_path.to_string_lossy())
        ));
    }

    // Scan for git repos (max depth 2)
    let repos = scan_for_git_repos(&resolved_path, 2);
    Json(ApiResponse::success(repos))
}

/// Move task to new status and position
async fn move_task(
    State(state): State<HttpServerState>,
    Path(id): Path<String>,
    Json(payload): Json<MoveTaskRequest>,
) -> Result<Json<serde_json::Value>, String> {
    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;

    let now = chrono::Utc::now().timestamp();

    let result = sqlx::query(
        "UPDATE tasks SET status = $1, position = $2, updated_at = $3 WHERE id = $4"
    )
    .bind(&payload.destination_status)
    .bind(payload.new_position)
    .bind(now)
    .bind(&id)
    .execute(pool.as_ref())
    .await
    .map_err(|e| format!("Failed to move task: {}", e))?;

    if result.rows_affected() == 0 {
        return Err("Task not found".to_string());
    }

    Ok(Json(serde_json::json!({"success": true})))
}

/// Workspace response struct
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceResponse {
    pub id: String,
    pub task_id: String,
    pub branch: String,
    pub base_branch: Option<String>,
    pub agent_working_dir: Option<String>,
    pub setup_completed_at: Option<String>,
    pub agent_cli: String,
    pub archived: bool,
    pub pinned: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// Request body for creating task workspace
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskWorkspaceRequest {
    pub workspace_id: Option<String>,
    pub branch: String,
    pub base_branch: Option<String>,
    pub agent_working_dir: Option<String>,
    pub setup_completed_at: Option<i64>,
    pub agent_cli: Option<String>,
}

/// Get workspaces for a task
async fn get_task_workspaces(
    Path(task_id): Path<String>,
    State(state): State<HttpServerState>,
) -> Result<Json<Vec<WorkspaceResponse>>, String> {
    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;

    let rows = sqlx::query(
        "SELECT id, task_id, branch, base_branch, agent_working_dir, setup_completed_at, agent_cli, archived, pinned, created_at, updated_at
         FROM workspaces WHERE task_id = $1 ORDER BY created_at DESC"
    )
    .bind(&task_id)
    .fetch_all(pool.as_ref())
    .await
    .map_err(|e| format!("Failed to fetch workspaces: {}", e))?;

    let workspaces: Vec<WorkspaceResponse> = rows
        .into_iter()
        .filter_map(|row| {
            let setup_ts: Option<i64> = row.try_get("setup_completed_at").ok();
            Some(WorkspaceResponse {
                id: row.try_get("id").ok()?,
                task_id: row.try_get("task_id").ok()?,
                branch: row.try_get("branch").ok()?,
                base_branch: row.try_get("base_branch").ok(),
                agent_working_dir: row.try_get("agent_working_dir").ok(),
                setup_completed_at: setup_ts.map(|ts| timestamp_to_iso(Some(ts))),
                agent_cli: row.try_get("agent_cli").ok()?,
                archived: row.try_get::<i32, _>("archived").unwrap_or(0) == 1,
                pinned: row.try_get::<i32, _>("pinned").unwrap_or(0) == 1,
                created_at: timestamp_to_iso(row.try_get("created_at").ok()),
                updated_at: timestamp_to_iso(row.try_get("updated_at").ok()),
            })
        })
        .collect();

    Ok(Json(workspaces))
}

/// Create workspace for a task
async fn create_task_workspace(
    Path(task_id): Path<String>,
    State(state): State<HttpServerState>,
    Json(payload): Json<CreateTaskWorkspaceRequest>,
) -> Result<Json<WorkspaceResponse>, String> {
    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;

    let workspace_id = payload.workspace_id.unwrap_or_else(|| {
        let uuid_str = uuid::Uuid::new_v4().to_string();
        let uuid_short = &uuid_str[..8];
        format!("ws-{}-{}", chrono::Utc::now().timestamp(), uuid_short)
    });
    let now = chrono::Utc::now().timestamp();
    let agent_cli = payload.agent_cli.unwrap_or_else(|| "OPENCODE".to_string());

    sqlx::query(
        "INSERT INTO workspaces (id, task_id, branch, base_branch, agent_working_dir, setup_completed_at, agent_cli, archived, pinned, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, $8, $9)"
    )
    .bind(&workspace_id)
    .bind(&task_id)
    .bind(&payload.branch)
    .bind(&payload.base_branch)
    .bind(&payload.agent_working_dir)
    .bind(payload.setup_completed_at)
    .bind(&agent_cli)
    .bind(now)
    .bind(now)
    .execute(pool.as_ref())
    .await
    .map_err(|e| format!("Failed to create workspace: {}", e))?;

    Ok(Json(WorkspaceResponse {
        id: workspace_id,
        task_id,
        branch: payload.branch,
        base_branch: payload.base_branch,
        agent_working_dir: payload.agent_working_dir,
        setup_completed_at: payload.setup_completed_at.map(|ts| timestamp_to_iso(Some(ts))),
        agent_cli,
        archived: false,
        pinned: false,
        created_at: timestamp_to_iso(Some(now)),
        updated_at: timestamp_to_iso(Some(now)),
    }))
}

/// Request body for creating workspace session
#[derive(serde::Deserialize)]
pub struct CreateWorkspaceSessionRequest {
    #[serde(rename = "agentCli")]
    pub agent_cli: Option<String>,
}

/// Create session for a workspace (also creates execution process)
async fn create_workspace_session(
    Path(workspace_id): Path<String>,
    State(state): State<HttpServerState>,
    Json(payload): Json<CreateWorkspaceSessionRequest>,
) -> Result<Json<Session>, String> {
    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;

    let uuid_str1 = uuid::Uuid::new_v4().to_string();
    let uuid_short1 = &uuid_str1[..8];
    let session_id = format!("session-{}-{}", chrono::Utc::now().timestamp(), uuid_short1);
    let uuid_str2 = uuid::Uuid::new_v4().to_string();
    let uuid_short2 = &uuid_str2[..8];
    let process_id = format!("proc-{}-{}", chrono::Utc::now().timestamp(), uuid_short2);
    let now = chrono::Utc::now().timestamp();
    let agent_cli = payload.agent_cli.unwrap_or_else(|| "OPENCODE".to_string());

    // Create session
    sqlx::query(
        "INSERT INTO sessions (id, workspace_id, agent_cli, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)"
    )
    .bind(&session_id)
    .bind(&workspace_id)
    .bind(&agent_cli)
    .bind(now)
    .bind(now)
    .execute(pool.as_ref())
    .await
    .map_err(|e| format!("Failed to create session: {}", e))?;

    // Create execution process
    sqlx::query(
        "INSERT INTO execution_processes (id, session_id, workspace_id, run_reason, status, started_at, created_at, updated_at, dropped)
         VALUES ($1, $2, $3, 'codingagent', 'running', $4, $5, $6, 0)"
    )
    .bind(&process_id)
    .bind(&session_id)
    .bind(&workspace_id)
    .bind(now)
    .bind(now)
    .bind(now)
    .execute(pool.as_ref())
    .await
    .map_err(|e| format!("Failed to create execution process: {}", e))?;

    Ok(Json(Session {
        id: session_id,
        workspace_id,
        executor: None,
        working_dir: None,
        model_id: None,
        created_at: timestamp_to_iso(Some(now)),
        updated_at: timestamp_to_iso(Some(now)),
    }))
}

async fn health_check() -> Json<serde_json::Value> {
    Json(serde_json::json!({"status": "ok", "service": "hivelaunch-agent-api"}))
}

/// 获取所有可用的 Agent 列表
async fn get_available_agents() -> Json<Vec<crate::commands::agent_execution::AgentInfo>> {
    Json(crate::commands::agent_execution::get_available_agents())
}

// ============ Model Cache Refresh API ============

/// 刷新指定 executor 的模型缓存请求体
#[derive(Debug, Deserialize)]
struct RefreshModelCacheRequest {
    executor: bee_executor::BaseCodingAgent,
}

/// 刷新指定 executor 的模型缓存响应体
#[derive(Debug, Serialize)]
struct RefreshModelCacheResponse {
    success: bool,
}

/// 刷新指定 executor 的模型缓存
/// POST /api/agents/model-cache/refresh
async fn refresh_model_cache(
    Json(payload): Json<RefreshModelCacheRequest>,
) -> Result<Json<RefreshModelCacheResponse>, String> {
    use bee_executor::executors::utils::global_model_cache;

    use bee_executor::executors::utils::global_agent_cache;

    let cache = global_model_cache();
    cache.invalidate(payload.executor);

    let agent_cache = global_agent_cache();
    agent_cache.invalidate(payload.executor);

    log::info!("[Model Cache] Refreshed cache for executor: {:?}", payload.executor);
    log::info!("[Agent Cache] Refreshed cache for executor: {:?}", payload.executor);

    Ok(Json(RefreshModelCacheResponse { success: true }))
}

/// 🔹 刷新指定 executor 的 agent 缓存（独立缓存)
/// POST /api/agents/agent-cache/refresh
async fn refresh_agent_cache(
    Json(payload): Json<RefreshModelCacheRequest>,
) -> Result<Json<RefreshModelCacheResponse>, String> {
    use bee_executor::executors::utils::global_agent_cache;
    
    let cache = global_agent_cache();
    cache.invalidate(payload.executor);
    
    log::info!("[Agent Cache] Refreshed agent cache for executor: {:?}", payload.executor);
    
    Ok(Json(RefreshModelCacheResponse { success: true }))
}

// ============ Discovered Options WebSocket ============

/// Discovered options WebSocket 查询参数
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct SlashCommandsQuery {
    executor: bee_executor::BaseCodingAgent,
    #[serde(default)]
    workspace_id: Option<String>,
    #[serde(default)]
    repo_id: Option<String>,
    /// Force cache refresh (e.g., "?refresh=1" or "?refresh=<timestamp>")
    #[serde(default)]
    refresh: Option<String>,
}

/// 从 DB 查询 workspace 对应的 agent_working_dir
async fn resolve_slash_workdir(
    state: &HttpServerState,
    workspace_id: &Option<String>,
    repo_id: &Option<String>,
) -> PathBuf {
    if let Some(ws_id) = workspace_id {
        if let Some(pool) = get_db_pool_from_manager(&state.process_manager).await {
            let row = sqlx::query(
                "SELECT agent_working_dir FROM workspaces WHERE id = $1 LIMIT 1",
            )
            .bind(ws_id)
            .fetch_optional(pool.as_ref())
            .await
            .ok()
            .flatten();

            if let Some(row) = row {
                if let Ok(dir) = row.try_get::<String, _>("agent_working_dir") {
                    if !dir.trim().is_empty() {
                        return PathBuf::from(dir);
                    }
                }
            }
        }
    }
    if let Some(project_id) = repo_id {
        if let Some(pool) = get_db_pool_from_manager(&state.process_manager).await {
            let row = sqlx::query("SELECT repo_path FROM projects WHERE id = $1 LIMIT 1")
                .bind(project_id)
                .fetch_optional(pool.as_ref())
                .await
                .ok()
                .flatten();

            if let Some(row) = row {
                if let Ok(dir) = row.try_get::<String, _>("repo_path") {
                    if !dir.trim().is_empty() {
                        return PathBuf::from(dir);
                    }
                }
            }
        }
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

/// 从 workspace 获取 working_dir（返回 String 类型）
async fn resolve_workspace_working_dir(
    state: &HttpServerState,
    workspace_id: &str,
) -> String {
    if let Some(pool) = get_db_pool_from_manager(&state.process_manager).await {
        let row = sqlx::query(
            "SELECT agent_working_dir FROM workspaces WHERE id = $1 LIMIT 1",
        )
        .bind(workspace_id)
        .fetch_optional(pool.as_ref())
        .await
        .ok()
        .flatten();

        if let Some(row) = row {
            if let Ok(dir) = row.try_get::<String, _>("agent_working_dir") {
                if !dir.trim().is_empty() {
                    return dir;
                }
            }
        }
    }
    String::new()
}

/// Discovered options WebSocket 端点 (统一 API - vibe-kanban 风格)
async fn stream_discovered_options_ws(
    ws: WebSocketUpgrade,
    State(state): State<HttpServerState>,
    Query(query): Query<SlashCommandsQuery>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_discovered_options_ws(socket, query, state))
}

async fn handle_discovered_options_ws(
    mut socket: axum::extract::ws::WebSocket,
    query: SlashCommandsQuery,
    state: HttpServerState,
) {
    use bee_executor::{ExecutorConfigs, ExecutorProfileId, StandardCodingAgentExecutor, executor_discovery::ExecutorConfigCacheKey};
    use bee_executor::executors::utils::executor_options_cache;
    use bee_workspace_utils::log_msg::LogMsg;

    let force_refresh = query.refresh.is_some();

    log::info!(
        "[WS] Discovered options WebSocket: executor={:?}, workspace_id={:?}, refresh={:?}",
        query.executor,
        query.workspace_id,
        query.refresh,
    );

    let profiles = ExecutorConfigs::get_cached();
    let profile_id = ExecutorProfileId::new(query.executor);
    let agent = profiles.get_coding_agent_or_default(&profile_id);

    log::info!(
        "[WS] Discovered options: profile_id={:?}, executors_count={}",
        profile_id,
        profiles.executors.len()
    );

    let workdir = resolve_slash_workdir(&state, &query.workspace_id, &query.repo_id).await;

    log::info!("[WS] Discovered options workdir={}", workdir.display());

    // If force refresh, invalidate cache first
    if force_refresh {
        let cache = executor_options_cache();
        let cache_key = ExecutorConfigCacheKey::new(
            Some(&workdir),
            String::new(), // cmd_key will be computed by executor
            query.executor,
        );
        cache.invalidate(&cache_key);
        log::info!("[WS] Force refresh: invalidated cache for {:?}", cache_key);
    }

    match agent.discover_options(Some(&workdir), None).await {
        Ok(mut stream) => {
            // 先推初始 patch
            if let Some(patch) = stream.next().await {
                let patch_json =
                    serde_json::to_string(&LogMsg::JsonPatch(patch)).unwrap_or_default();
                if socket.send(Message::Text(patch_json)).await.is_err() {
                    return;
                }
            }

            let _ = socket.send(Message::Text(r#"{"Ready":true}"#.to_string())).await;

            // 继续推发现阶段的后续 patches
            while let Some(patch) = stream.next().await {
                let patch_json =
                    serde_json::to_string(&LogMsg::JsonPatch(patch)).unwrap_or_default();
                if socket.send(Message::Text(patch_json)).await.is_err() {
                    break;
                }
            }
        }
        Err(e) => {
            log::warn!("[WS] Discovered options stream failed: {}", e);
            let _ = socket.send(Message::Text(r#"{"Ready":true}"#.to_string())).await;
        }
    }

    let _ = socket
        .send(Message::Text(r#"{"finished":true}"#.to_string()))
        .await;
}

async fn execute_agent(
    State(state): State<HttpServerState>,
    Path(workspace_id): Path<String>,
    Json(payload): Json<ExecuteRequest>,
) -> Result<Json<ExecuteResponse>, String> {
    // 获取 working_dir：如果请求中没有提供，则从 workspace 查询
    let working_dir = if let Some(ref wd) = payload.working_dir {
        if !wd.trim().is_empty() {
            wd.clone()
        } else {
            resolve_workspace_working_dir(&state, &workspace_id).await
        }
    } else {
        resolve_workspace_working_dir(&state, &workspace_id).await
    };
    if !std::path::Path::new(&working_dir).is_dir() {
        return Err(format!(
            "Invalid working_dir for workspace_id={}, working_dir={}",
            workspace_id, working_dir
        ));
    }
    if !std::path::Path::new(&working_dir).is_dir() {
        return Err(format!(
            "Invalid working_dir for workspace_id={}, working_dir={}",
            workspace_id, working_dir
        ));
    }
    let agent_name = payload.agent_name.unwrap_or_else(|| "opencode".to_string());
    let env_vars = payload.env_vars.unwrap_or_default();
    let model = payload.model.as_deref();

    log_other!(info, "Starting agent execution: workspace_id={}, prompt={}, model={:?}", workspace_id, payload.prompt, model);

    let request_session_id = payload.session_id.clone();
    let request_process_id = payload.process_id.clone();

    // 重要：在启动 agent 之前，先在数据库中创建 execution_processes 记录
    // 这样 spawn_db_persistence_task 才能成功写入日志
    if let Some(pool) = get_db_pool_from_manager(&state.process_manager).await {
        let now = chrono::Utc::now().timestamp();

        // 先确保 session 在数据库中存在（因为内存中的 session 可能不在数据库中）
        let session_exists: Option<i64> = sqlx::query_scalar(
            "SELECT 1 FROM sessions WHERE id = $1 LIMIT 1"
        )
        .bind(&request_session_id)
        .fetch_optional(&*pool)
        .await
        .ok()
        .flatten();

        if session_exists.is_none() {
            // Session 不存在，需要先创建
            let agent_cli = agent_name.clone();
            if let Err(e) = sqlx::query(
                "INSERT INTO sessions (id, workspace_id, agent_cli, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)"
            )
            .bind(&request_session_id)
            .bind(&workspace_id)
            .bind(&agent_cli)
            .bind(now)
            .bind(now)
            .execute(&*pool)
            .await {
                log_other!(warn, "[execute_agent] Failed to create session in DB: {}", e);
            } else {
                log_other!(info, "[execute_agent] Created session in DB: id={}, workspace_id={}", request_session_id, workspace_id);
            }
        }

        // 现在可以安全地插入 execution_process 记录了
        sqlx::query(
            "INSERT INTO execution_processes (id, session_id, workspace_id, run_reason, status, started_at, created_at, updated_at, dropped)
             VALUES ($1, $2, $3, 'codingagent', 'running', $4, $5, $6, 0)"
        )
        .bind(&request_process_id)
        .bind(&request_session_id)
        .bind(&workspace_id)
        .bind(now)
        .bind(now)
        .bind(now)
        .execute(&*pool)
        .await
        .map_err(|e| format!("Failed to create execution process: {}", e))?;

        log_other!(info, "[execute_agent] Created execution_process record in DB: id={}, session_id={}", request_process_id, request_session_id);
    } else {
        log_other!(warn, "[execute_agent] No DB pool available, execution_process not created in database");
    }

    // 调用 AgentProcessManager 启动 agent (直接传入 prompt)
    log_other!(info, "[execute_agent] Calling start_agent for workspace_id={}", workspace_id);
    let session_id = {
        let manager = state.process_manager.read().await;
        match manager.start_agent(
            workspace_id.clone(),
            std::path::PathBuf::from(working_dir.clone()),
            agent_name.clone(),
            env_vars,
            &payload.prompt,
            model,
            Some(request_session_id.as_str()),
            Some(request_process_id.as_str()),
        ).await {
            Ok(sid) => {
                log_other!(info, "[execute_agent] start_agent succeeded, session_id={}", sid);
                sid
            }
            Err(e) => {
                log::error!("[execute_agent] start_agent failed: {}", e);
                return Err(e.to_string());
            }
        }
    };

    let execution_id = request_process_id;
    let now = chrono::Utc::now().to_rfc3339();

    // Mirror into in-memory session/process state for WS process/history endpoints.
    {
        let mut sessions = SESSIONS.write().await;
        sessions.entry(session_id.clone()).or_insert(Session {
            id: session_id.clone(),
            workspace_id: workspace_id.clone(),
            executor: Some(agent_name.clone()),
            working_dir: Some(working_dir.clone()),
            model_id: None,
            created_at: now.clone(),
            updated_at: now.clone(),
        });
    }
    {
        let mut processes = EXECUTION_PROCESSES.write().await;
        let process = ExecutionProcess {
            id: execution_id.clone(),
            session_id: session_id.clone(),
            run_reason: "codingagent".to_string(),
            executor_action: None,
            status: "running".to_string(),
            exit_code: None,
            dropped: false,
            started_at: now.clone(),
            completed_at: None,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        processes
            .entry(session_id.clone())
            .or_insert_with(Vec::new)
            .push(process.clone());
        let _ = PROCESS_UPDATES.0.send((session_id.clone(), process));
    }

    Ok(Json(ExecuteResponse { session_id, execution_id, status: "started".to_string() }))
}

/// 发送 Follow-up 消息
async fn send_follow_up(
    State(state): State<HttpServerState>,
    Path(workspace_id): Path<String>,
    Json(payload): Json<FollowUpRequest>,
) -> Result<Json<serde_json::Value>, String> {
    log_other!(info, "Sending follow-up to workspace {}: {}", workspace_id, payload.prompt);

    // Upstream process ID is mandatory to keep DB <-> stream mapping consistent.
    let process_id = payload.process_id.clone();
    let session_id = payload.session_id.clone();
    let working_dir = resolve_workspace_working_dir(&state, &workspace_id).await;
    let prompt_for_execution = if let Some(image_ids) = payload.image_ids.as_ref() {
        if image_ids.is_empty() {
            payload.prompt.clone()
        } else {
            let pool = get_db_pool_from_manager(&state.process_manager)
                .await
                .ok_or("Database pool not available")?;
            let image_paths = materialize_images_to_worktree(pool.as_ref(), std::path::Path::new(&working_dir), image_ids).await?;
            append_image_paths_to_prompt(&payload.prompt, &image_paths)
        }
    } else {
        payload.prompt.clone()
    };

    // Get session info for fallback
    let session = {
        let sessions = SESSIONS.read().await;
        sessions.get(&session_id).cloned()
    };

    // 重要：在启动 follow-up 执行之前，先在数据库中创建 execution_processes 记录
    // 这样 spawn_db_persistence_task 才能成功写入日志
    if let Some(pool) = get_db_pool_from_manager(&state.process_manager).await {
        let now_db = chrono::Utc::now().timestamp();

        // 先确保 session 在数据库中存在（因为内存中的 session 可能不在数据库中）
        let session_exists: Option<i64> = sqlx::query_scalar(
            "SELECT 1 FROM sessions WHERE id = $1 LIMIT 1"
        )
        .bind(&session_id)
        .fetch_optional(&*pool)
        .await
        .ok()
        .flatten();

        if session_exists.is_none() {
            // Session 不存在，需要先创建
            let agent_cli = session.as_ref()
                .and_then(|s| s.executor.clone())
                .unwrap_or_else(|| "OPENCODE".to_string());
            if let Err(e) = sqlx::query(
                "INSERT INTO sessions (id, workspace_id, agent_cli, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)"
            )
            .bind(&session_id)
            .bind(&workspace_id)
            .bind(&agent_cli)
            .bind(now_db)
            .bind(now_db)
            .execute(&*pool)
            .await {
                log_other!(warn, "[send_follow_up] Failed to create session in DB: {}", e);
            } else {
                log_other!(info, "[send_follow_up] Created session in DB: id={}, workspace_id={}", session_id, workspace_id);
            }
        }

        // 现在可以安全地插入 execution_process 记录了
        sqlx::query(
            "INSERT INTO execution_processes (id, session_id, workspace_id, run_reason, status, started_at, created_at, updated_at, dropped)
             VALUES ($1, $2, $3, 'codingagent', 'running', $4, $5, $6, 0)"
        )
        .bind(&process_id)
        .bind(&session_id)
        .bind(&workspace_id)
        .bind(now_db)
        .bind(now_db)
        .bind(now_db)
        .execute(&*pool)
        .await
        .map_err(|e| format!("Failed to create execution process: {}", e))?;

        log_other!(info, "[send_follow_up] Created execution_process record in DB: id={}, session_id={}", process_id, session_id);
    } else {
        log_other!(warn, "[send_follow_up] No DB pool available, execution_process not created in database");
    }

    let now = chrono::Utc::now().to_rfc3339();
    {
        let mut processes = EXECUTION_PROCESSES.write().await;
        let process = ExecutionProcess {
            id: process_id.clone(),
            session_id: payload.session_id.clone(),
            run_reason: "codingagent".to_string(),
            executor_action: None,
            status: "running".to_string(),
            exit_code: None,
            dropped: false,
            started_at: now.clone(),
            completed_at: None,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        processes
            .entry(payload.session_id.clone())
            .or_insert_with(Vec::new)
            .push(process.clone());
        let _ = PROCESS_UPDATES.0.send((payload.session_id.clone(), process));
    }

    let manager = state.process_manager.read().await;
    
    // Try to send follow-up first, fallback to starting a new agent if it fails
    let model = payload.model.as_deref();
    let result = manager
        .send_follow_up(&workspace_id, &payload.session_id, &process_id, &prompt_for_execution, model)
        .await;
        
    if let Err(e) = result {
        // Agent not found, try to start a new one
        log_other!(warn, "Agent not found for workspace={}, starting new agent: {}", workspace_id, e);
        
        // Resolve working directory from database using workspace_id
        let resolved_workdir =
            resolve_slash_workdir(&state, &Some(workspace_id.clone()), &None).await;
        let working_dir = if resolved_workdir.to_string_lossy().is_empty() {
            // Fallback to session's working_dir or /tmp
            session
                .as_ref()
                .and_then(|s| s.working_dir.clone())
                .unwrap_or_else(|| "/tmp".to_string())
        } else {
            resolved_workdir.to_string_lossy().to_string()
        };
        
        let agent_name = session
            .as_ref()
            .and_then(|s| s.executor.clone())
            .unwrap_or_else(|| "opencode".to_string());
        
        drop(manager); // Release read lock
        
        let manager = state.process_manager.read().await;
        log_other!(info, "Starting new agent with working_dir={}, agent_name={}, model={:?}", working_dir, agent_name, model);
        manager
            .start_agent(
                workspace_id.clone(),
                std::path::PathBuf::from(working_dir),
                agent_name,
                std::collections::HashMap::new(),
                &prompt_for_execution,
                model,
                Some(&session_id),
                Some(&process_id),
            )
            .await?;
    }

    Ok(Json(serde_json::json!({"status": "ok", "message": "Follow-up sent", "process_id": process_id})))
}

async fn stream_workspace(
    ws: WebSocketUpgrade,
    State(state): State<HttpServerState>,
    Path(workspace_id): Path<String>,
) -> impl axum::response::IntoResponse {
    log_other!(info, "[WS] WebSocket upgrade request for workspace: {}", workspace_id);
    ws.on_upgrade(move |socket| handle_websocket(socket, workspace_id, state))
}

async fn stream_workspace_options(Path(_workspace_id): Path<String>) -> impl IntoResponse {
    // WebSocket CORS 预检请求需要返回正确的 headers
    log_other!(info, "[WS] OPTIONS request received for workspace: {}", _workspace_id);
    (
        StatusCode::NO_CONTENT,
        [(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")],
    )
}

fn log_msg_to_entry_for_ws(
    log_msg: &bee_workspace_utils::log_msg::LogMsg,
) -> Option<bee_executor::logs::NormalizedEntry> {
    use bee_executor::logs::NormalizedEntryType;
    use bee_executor::logs::utils::patch::extract_normalized_entry_from_patch;
    use chrono::Utc;

    match log_msg {
        bee_workspace_utils::log_msg::LogMsg::Ready => Some(bee_executor::logs::NormalizedEntry {
            timestamp: Some(Utc::now().to_rfc3339()),
            entry_type: NormalizedEntryType::Loading,
            content: "Agent ready".to_string(),
            metadata: None,
        }),
        bee_workspace_utils::log_msg::LogMsg::Stdout(content) => {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(content) {
                parse_json_entry(&json)
            } else {
                Some(bee_executor::logs::NormalizedEntry {
                    timestamp: Some(Utc::now().to_rfc3339()),
                    entry_type: NormalizedEntryType::SystemMessage,
                    content: content.clone(),
                    metadata: None,
                })
            }
        }
        bee_workspace_utils::log_msg::LogMsg::Stderr(content) => {
            Some(bee_executor::logs::NormalizedEntry {
                timestamp: Some(Utc::now().to_rfc3339()),
                entry_type: NormalizedEntryType::SystemMessage,
                content: content.clone(),
                metadata: None,
            })
        }
        bee_workspace_utils::log_msg::LogMsg::JsonPatch(patch) => {
            extract_normalized_entry_from_patch(patch).map(|(_, entry)| entry)
        }
        bee_workspace_utils::log_msg::LogMsg::SessionId(_) => None,
        bee_workspace_utils::log_msg::LogMsg::MessageId(_) => None,
        bee_workspace_utils::log_msg::LogMsg::Finished => Some(bee_executor::logs::NormalizedEntry {
            timestamp: Some(Utc::now().to_rfc3339()),
            entry_type: NormalizedEntryType::Loading,
            content: "Execution completed".to_string(),
            metadata: None,
        }),
    }
}

async fn handle_websocket(
    mut socket: axum::extract::ws::WebSocket,
    workspace_id: String,
    state: HttpServerState,
) {
    log_other!(info, "[WS] WebSocket connected for workspace: {}", workspace_id);

    // 获取 MsgStore - 如果不存在则返回错误
    let msg_store = {
        let manager = state.process_manager.read().await;
        match manager.get_msg_store(&workspace_id).await {
            Ok(ms) => ms,
            Err(e) => {
                log::error!("[WS] No MsgStore for workspace {}: {}", workspace_id, e);
                // 发送错误消息然后关闭
                let _ = socket.send(axum::extract::ws::Message::Text(
                    serde_json::json!({
                        "error": "Agent not running",
                        "message": e
                    }).to_string()
                )).await;
                return;
            }
        }
    };

    // 使用 history_plus_stream：先返回历史消息，再继续实时流
    let mut stream = msg_store.history_plus_stream();
    
    loop {
        tokio::select! {
            // 接收 MsgStore 消息（历史 + 实时）
            result = stream.next() => {
                match result {
                    Some(Ok(log_msg)) => {
                        let entry = log_msg_to_entry_for_ws(&log_msg);

                        if let Some(entry) = entry {
                            match serde_json::to_string(&entry) {
                                Ok(json) => {
                                    log_other!(info, "[WS] Sending entry to {}: {:?}", workspace_id, entry.entry_type);
                                    if socket.send(axum::extract::ws::Message::Text(json)).await.is_err() {
                                        break;
                                    }
                                }
                                Err(e) => {
                                    log::error!("Failed to serialize entry: {}", e);
                                }
                            }
                        }
                    }
                    Some(Err(e)) => {
                        log_other!(warn, "[WS] MsgStore stream error for {}: {:?}", workspace_id, e);
                        break;
                    }
                    None => {
                        log_other!(info, "[WS] MsgStore stream ended for workspace: {}", workspace_id);
                        break;
                    }
                }
            }
            // 接收 WebSocket 客户端消息
            msg = socket.recv() => {
                match msg {
                    Some(Ok(axum::extract::ws::Message::Close(_))) | None => {
                        log_other!(info, "[WS] WebSocket closed by client");
                        break;
                    }
                    Some(Ok(axum::extract::ws::Message::Text(text))) => {
                        log_other!(debug, "[WS] Received from client: {}", text);
                    }
                    Some(Ok(axum::extract::ws::Message::Ping(data))) => {
                        let _ = socket.send(axum::extract::ws::Message::Pong(data)).await;
                    }
                    _ => {}
                }
            }
        }
    }

    log_other!(info, "[WS] WebSocket disconnected for workspace: {}", workspace_id);
}

async fn stop_execution(
    State(state): State<HttpServerState>,
    Path(execution_id): Path<String>,
) -> Result<Json<StopResponse>, String> {
    log_other!(info, "Stopping execution: {}", execution_id);

    let context = load_execution_context_from_db(&state.process_manager, &execution_id).await;
    let workspace_id = context
        .as_ref()
        .map(|ctx| ctx.workspace_id.clone())
        .unwrap_or_else(|| execution_id.clone());

    let stop_result = {
        let manager = state.process_manager.read().await;
        manager.stop_agent(&workspace_id).await
    };

    let status_update_result = if let Some(ctx) = &context {
        if ctx.process_status == "running" {
            if let Err(e) = persist_execution_status_to_db(
                &state.process_manager,
                &execution_id,
                "killed",
                None,
            )
            .await
            {
                log_other!(warn, "Failed to persist killed status for {}: {}", execution_id, e);
            }

            if let Err(e) = update_execution_process_status(
                &ctx.session_id,
                &execution_id,
                "killed",
                None,
            )
            .await
            {
                log_other!(warn, "Failed to broadcast killed status for {}: {}", execution_id, e);
            }
        }
        Ok::<(), String>(())
    } else {
        Err("Execution process not found".to_string())
    };

    match (stop_result, status_update_result) {
        (Ok(_), _) => Ok(Json(StopResponse {
            success: true,
            message: "Agent stopped".to_string(),
        })),
        (Err(_), Ok(_)) => Ok(Json(StopResponse {
            success: true,
            message: "Execution marked as killed".to_string(),
        })),
        (Err(stop_error), Err(_)) => Ok(Json(StopResponse {
            success: false,
            message: stop_error,
        })),
    }
}

#[derive(serde::Serialize)]
struct EntriesResponse {
    entries: Vec<serde_json::Value>,
    #[serde(rename = "nextTimestamp")]
    next_timestamp: Option<String>,
    #[serde(rename = "hasMore")]
    has_more: bool,
}

async fn get_entries(
    State(state): State<HttpServerState>,
    Path(workspace_id): Path<String>,
) -> Result<Json<EntriesResponse>, String> {
    log_other!(info, "Getting entries for workspace: {}", workspace_id);
    
    let manager = state.process_manager.read().await;
    let entries = manager.get_history(&workspace_id).await?;
    
    // 转换为 JSON
    let json_entries: Vec<serde_json::Value> = entries
        .into_iter()
        .map(|e| serde_json::to_value(e).ok())
        .flatten()
        .collect();
    
    Ok(Json(EntriesResponse {
        entries: json_entries,
        next_timestamp: None,
        has_more: false,
    }))
}

// ============ Swarms API Handlers ============

async fn get_swarms(
    State(state): State<HttpServerState>,
    Query(query): Query<SwarmQuery>,
) -> Result<Json<Vec<SwarmResponse>>, String> {
    log_other!(info, "Getting swarms, search: {:?}", query.search);

    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;
    let search = query.search.unwrap_or_default();
    let templates = load_all_template_details().await?;
    let mut result = Vec::new();
    for template in templates {
        let keyword = search.trim().to_lowercase();
        if !keyword.is_empty() {
            let name_match = template.summary.name.to_lowercase().contains(&keyword);
            let desc_match = template.summary.description.to_lowercase().contains(&keyword);
            if !name_match && !desc_match {
                continue;
            }
        }
        let swarm_id = official_swarm_id(&template.summary.id);
        let config = load_template_swarm_config_by_id(&swarm_id).await?;
        let projects_count = sqlx::query_scalar::<_, i32>(
            "SELECT COUNT(*) FROM project_swarm_bindings WHERE swarm_template_id = ?"
        )
        .bind(&swarm_id)
        .fetch_one(pool.as_ref())
        .await
        .unwrap_or(0);
        result.push(build_swarm_response_from_template(config, projects_count));
    }
    Ok(Json(result))
}

async fn get_swarm_by_id(
    State(state): State<HttpServerState>,
    Path(swarm_id): Path<String>,
) -> Result<Json<SwarmResponse>, String> {
    log_other!(info, "Getting swarm by id: {}", swarm_id);

    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;
    let config = load_template_swarm_config_by_id(&swarm_id).await?;
    let projects_count = sqlx::query_scalar::<_, i32>(
        "SELECT COUNT(*) FROM project_swarm_bindings WHERE swarm_template_id = ?"
    )
    .bind(&config.swarm_id)
    .fetch_one(pool.as_ref())
    .await
    .unwrap_or(0);
    Ok(Json(build_swarm_response_from_template(config, projects_count)))
}

// ============ Swarm Bindings API Handlers ============

async fn get_project_swarm_bindings(
    State(state): State<HttpServerState>,
    Path(project_id): Path<String>,
) -> Result<Json<Vec<BindingResponse>>, String> {
    log_other!(info, "Getting swarm bindings for project: {}", project_id);

    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;

    let bindings = sqlx::query_as::<_, (String, String, String, Option<String>, bool, i64, i64)>(
        "SELECT b.id, b.project_id, b.swarm_template_id, b.overrides_json, b.is_active, b.bound_at, b.updated_at
         FROM project_swarm_bindings b
         WHERE b.project_id = ?
         ORDER BY b.bound_at DESC"
    )
    .bind(&project_id)
    .fetch_all(pool.as_ref())
    .await
    .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for binding in bindings {
        let config = match load_template_swarm_config_by_id(&binding.2).await {
            Ok(value) => value,
            Err(err) => {
                log_other!(warn, "Binding swarm template not found {}: {}", binding.2, err);
                continue;
            }
        };
        let swarm = build_swarm_response_from_template(config, 0);
        let overrides: Option<serde_json::Value> = binding.3.as_ref()
            .and_then(|s| serde_json::from_str(s).ok());

        result.push(BindingResponse {
            id: binding.0,
            project_id: binding.1,
            swarm_template_id: binding.2,
            is_active: binding.4,
            overrides,
            bound_at: timestamp_to_iso(Some(binding.5)),
            swarm: SwarmSummary {
                id: swarm.id,
                name: swarm.name,
                description: swarm.description,
                cli: swarm.cli,
                defaultModelId: swarm.default_model_id,
                skillsCount: swarm.skills_count,
                agents: swarm.agents,
                mcpsCount: swarm.mcps_count,
                accent: swarm.accent,
            },
        });
    }

    Ok(Json(result))
}

async fn create_swarm_binding(
    State(state): State<HttpServerState>,
    Path(project_id): Path<String>,
    Json(payload): Json<CreateBindingRequest>,
) -> Result<Json<BindingResponse>, String> {
    log_other!(info, "Binding swarm {} to project {}", payload.swarm_template_id, project_id);

    if payload.swarm_template_id.is_empty() {
        return Err("swarm_template_id is required".to_string());
    }

    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();
    let template_id = normalize_swarm_template_id(&payload.swarm_template_id);
    let normalized_swarm_id = official_swarm_id(&template_id);
    let config = load_template_swarm_config_by_id(&normalized_swarm_id).await?;

    let existing_bindings: Vec<(String,)> = sqlx::query_as(
        "SELECT id FROM project_swarm_bindings WHERE project_id = ?"
    )
    .bind(&project_id)
    .fetch_all(pool.as_ref())
    .await
    .map_err(|e| e.to_string())?;

    let has_existing = !existing_bindings.is_empty();
    let is_active = payload.is_active.unwrap_or(!has_existing);
    if is_active {
        sqlx::query("UPDATE project_swarm_bindings SET is_active = 0, updated_at = ? WHERE project_id = ?")
            .bind(now)
            .bind(&project_id)
            .execute(pool.as_ref())
            .await
            .map_err(|e| e.to_string())?;
    }

    let overrides_json = payload.overrides.as_ref()
        .map(|o| serde_json::to_string(o).ok())
        .flatten();

    sqlx::query(
        "INSERT INTO project_swarm_bindings (id, project_id, swarm_template_id, overrides_json, is_active, bound_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(&project_id)
    .bind(&normalized_swarm_id)
    .bind(&overrides_json)
    .bind(is_active)
    .bind(now)
    .bind(now)
    .execute(pool.as_ref())
    .await
    .map_err(|e| e.to_string())?;

    let swarm = build_swarm_response_from_template(config, 0);

    Ok(Json(BindingResponse {
        id,
        project_id,
        swarm_template_id: normalized_swarm_id,
        is_active,
        overrides: payload.overrides,
        bound_at: chrono::Utc::now().to_rfc3339(),
        swarm: SwarmSummary {
            id: swarm.id,
            name: swarm.name,
            description: swarm.description,
            cli: swarm.cli,
            defaultModelId: swarm.default_model_id,
            skillsCount: swarm.skills_count,
            agents: swarm.agents,
            mcpsCount: swarm.mcps_count,
            accent: swarm.accent,
        },
    }))
}

async fn update_swarm_binding(
    State(state): State<HttpServerState>,
    Path((project_id, binding_id)): Path<(String, String)>,
    Json(payload): Json<UpdateBindingRequest>,
) -> Result<Json<serde_json::Value>, String> {
    log_other!(info, "Updating swarm binding: {}", binding_id);

    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;

    if payload.activate.unwrap_or(false) {
        sqlx::query("UPDATE project_swarm_bindings SET is_active = 0 WHERE project_id = ?")
            .bind(&project_id)
            .execute(pool.as_ref())
            .await
            .map_err(|e| e.to_string())?;

        sqlx::query("UPDATE project_swarm_bindings SET is_active = 1, updated_at = ? WHERE id = ?")
            .bind(chrono::Utc::now().timestamp())
            .bind(&binding_id)
            .execute(pool.as_ref())
            .await
            .map_err(|e| e.to_string())?;

        let binding_row = sqlx::query_as::<_, (String, String)>(
            "SELECT swarm_template_id, project_id FROM project_swarm_bindings WHERE id = ?"
        )
        .bind(&binding_id)
        .fetch_optional(pool.as_ref())
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Binding not found".to_string())?;

        let global_swarm_id = binding_row.0;
        let project_id = binding_row.1;
        let config = load_template_swarm_config_by_id(&global_swarm_id).await?;

        // 获取项目路径
        let project = sqlx::query_as::<_, (String,)>(
            "SELECT repo_path FROM projects WHERE id = ?"
        )
        .bind(&project_id)
        .fetch_optional(pool.as_ref())
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;

        let repo_path = project.0;

        // 直接写入配置文件到项目目录
        let opencode_json = require_opencode_json_content(
            config.opencode_json.clone(),
            "update_swarm_binding",
            &config.template_id,
        )?;
        let write_request = WriteSwarmConfigRequest {
            repo_path: repo_path.clone(),
            oh_my_opencode_json: config.oh_my_opencode_json.clone(),
            opencode_json: Some(opencode_json.clone()),
            claude_md: config.claude_md.clone(),
            agents_md: config.agents_md.clone(),
            swarm_id: Some(global_swarm_id.clone()),
            include_template: false,
            template_git_url: None,
            template_branch: None,
        };
        let write_result = write_swarm_config_to_project(&write_request)
            .map_err(|e| format!("Failed to write swarm config: {}", e))?;

        log_other!(info, "Swarm config written to {}: {:?}", repo_path, write_result);

        return Ok(Json(serde_json::json!({
            "success": true,
            "is_active": true,
            "configWrite": {
                "repoPath": repo_path,
                "ohMyOpencodeJson": config.oh_my_opencode_json,
                "opencodeJson": opencode_json,
                "claudeMd": config.claude_md,
                "agentsMd": config.agents_md,
                "filesWritten": write_result.files_written,
                "dirsCreated": write_result.dirs_created,
            }
        })));
    }

    let overrides_json = payload.overrides.as_ref()
        .map(|o| serde_json::to_string(o).ok())
        .flatten();

    sqlx::query(
        "UPDATE project_swarm_bindings SET overrides_json = ?, is_active = ?, updated_at = ? WHERE id = ?"
    )
    .bind(&overrides_json)
    .bind(payload.is_active)
    .bind(chrono::Utc::now().timestamp())
    .bind(&binding_id)
    .execute(pool.as_ref())
    .await
    .map_err(|e| e.to_string())?;

    Ok(Json(serde_json::json!({ "success": true })))
}

async fn delete_swarm_binding(
    State(state): State<HttpServerState>,
    Path((_project_id, binding_id)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, String> {
    log_other!(info, "Deleting swarm binding: {}", binding_id);

    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;

    let result = sqlx::query("DELETE FROM project_swarm_bindings WHERE id = ?")
        .bind(&binding_id)
        .execute(pool.as_ref())
        .await
        .map_err(|e| e.to_string())?;

    if result.rows_affected() == 0 {
        return Err("Binding not found or already deleted".to_string());
    }

    Ok(Json(serde_json::json!({ "success": true })))
}

// ============ Project Swarms API (project_swarms table) ============

/// Project Swarm response - matches Next.js API format
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSwarmResponse {
    pub id: String,
    pub name: String,
    pub description: String,
    pub cli: String,
    pub agents: Vec<String>,
    #[serde(rename = "skillsCount")]
    pub skills_count: i32,
    #[serde(rename = "mcpsCount")]
    pub mcps_count: i32,
    #[serde(rename = "ohMyOpencode")]
    pub oh_my_opencode: String,
    #[serde(rename = "opencodeConfig")]
    pub opencode_config: String,
    pub skills: Vec<String>,
    #[serde(rename = "uploadedSkills")]
    pub uploaded_skills: Vec<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "isActive")]
    pub is_active: bool,
    pub accent: String,
}

/// Request body for creating project swarm
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectSwarmRequest {
    pub id: Option<String>,
    #[serde(rename = "templateId")]
    pub template_id: String,
    pub name: String,
    pub version: Option<String>,
    pub cli: String,
    pub description: Option<String>,
    pub agents: Option<Vec<String>>,
    #[serde(rename = "skillsCount")]
    pub skills_count: Option<i32>,
    #[serde(rename = "mcpsCount")]
    pub mcps_count: Option<i32>,
    #[serde(rename = "ohMyOpencode")]
    pub oh_my_opencode: Option<String>,
    #[serde(rename = "opencodeConfig")]
    pub opencode_config: Option<String>,
    pub skills: Option<Vec<String>>,
    #[serde(rename = "uploadedSkills")]
    pub uploaded_skills: Option<Vec<String>>,
    #[serde(rename = "mergeStrategy")]
    pub merge_strategy: Option<String>,
    pub enabled: Option<bool>,
    pub accent: Option<String>,
}

/// Get project swarms for a project
async fn get_project_swarms(
    Path(project_id): Path<String>,
    State(state): State<HttpServerState>,
) -> Result<Json<Vec<ProjectSwarmResponse>>, String> {
    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;

    let rows = sqlx::query(
        "SELECT id, name, cli, enabled, overrides_json, installed_at FROM project_swarms WHERE project_id = $1 ORDER BY installed_at DESC"
    )
    .bind(&project_id)
    .fetch_all(pool.as_ref())
    .await
    .map_err(|e| format!("Failed to fetch project swarms: {}", e))?;

    let result: Vec<ProjectSwarmResponse> = rows
        .into_iter()
        .filter_map(|row| {
            let overrides_json: Option<String> = row.try_get("overrides_json").ok();
            let overrides: Option<serde_json::Value> = overrides_json.and_then(|s| serde_json::from_str(&s).ok());

            let description = overrides.as_ref().and_then(|o| o.get("description")).and_then(|d| d.as_str()).map(|s| s.to_string()).unwrap_or_default();
            let agents = overrides.as_ref().and_then(|o| o.get("agents")).and_then(|a| a.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
            let skills_count = overrides.as_ref().and_then(|o| o.get("skillsCount").and_then(|s| s.as_i64())).unwrap_or(0) as i32;
            let mcps_count = overrides.as_ref().and_then(|o| o.get("mcpsCount").and_then(|s| s.as_i64())).unwrap_or(0) as i32;
            let oh_my_opencode = overrides.as_ref().and_then(|o| o.get("ohMyOpencode")).and_then(|s| s.as_str()).map(|s| s.to_string()).unwrap_or_default();
            let opencode_config = overrides.as_ref().and_then(|o| o.get("opencodeConfig")).and_then(|s| s.as_str()).map(|s| s.to_string()).unwrap_or_default();
            let skills = overrides.as_ref().and_then(|o| o.get("skills")).and_then(|s| s.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
            let uploaded_skills = overrides.as_ref().and_then(|o| o.get("uploadedSkills")).and_then(|s| s.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
            let accent = overrides.as_ref().and_then(|o| o.get("accent")).and_then(|s| s.as_str()).map(|s| s.to_string()).unwrap_or_else(|| "amber".to_string());

            Some(ProjectSwarmResponse {
                id: row.try_get("id").ok()?,
                name: row.try_get("name").ok()?,
                description,
                cli: row.try_get("cli").ok()?,
                agents,
                skills_count,
                mcps_count,
                oh_my_opencode,
                opencode_config,
                skills,
                uploaded_skills,
                created_at: timestamp_to_iso(row.try_get("installed_at").ok()),
                is_active: row.try_get::<i32, _>("enabled").unwrap_or(0) == 1,
                accent,
            })
        })
        .collect();

    Ok(Json(result))
}

/// Create project swarm
async fn create_project_swarm(
    Path(project_id): Path<String>,
    State(state): State<HttpServerState>,
    Json(payload): Json<CreateProjectSwarmRequest>,
) -> Result<Json<ProjectSwarmResponse>, String> {
    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;

    let swarm_id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().timestamp();
    let enabled = payload.enabled.unwrap_or(true);

    // Build overrides_json
    let overrides = serde_json::json!({
        "description": payload.description.as_ref().unwrap_or(&String::new()),
        "agents": payload.agents.as_ref().unwrap_or(&Vec::new()),
        "skillsCount": payload.skills_count,
        "mcpsCount": payload.mcps_count.unwrap_or(0),
        "ohMyOpencode": payload.oh_my_opencode.as_ref().unwrap_or(&String::new()),
        "opencodeConfig": payload.opencode_config.as_ref().unwrap_or(&String::new()),
        "skills": payload.skills.as_ref().unwrap_or(&Vec::new()),
        "uploadedSkills": payload.uploaded_skills.as_ref().unwrap_or(&Vec::new()),
        "accent": payload.accent.as_ref().unwrap_or(&String::from("amber")),
    });
    let overrides_json = serde_json::to_string(&overrides).map_err(|e| format!("Failed to serialize overrides: {}", e))?;

    // Insert project swarm
    sqlx::query(
        "INSERT INTO project_swarms (id, project_id, template_id, name, version, cli, overrides_json, merge_strategy, enabled, installed_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)"
    )
    .bind(&swarm_id)
    .bind(&project_id)
    .bind(&payload.template_id)
    .bind(&payload.name)
    .bind(payload.version.unwrap_or_else(|| "1.0.0".to_string()))
    .bind(&payload.cli)
    .bind(&overrides_json)
    .bind(payload.merge_strategy.unwrap_or_else(|| "merge".to_string()))
    .bind(enabled)
    .bind(now)
    .bind(now)
    .execute(pool.as_ref())
    .await
    .map_err(|e| format!("Failed to create project swarm: {}", e))?;

    // If enabled, disable other swarms
    if enabled {
        sqlx::query("UPDATE project_swarms SET enabled = 0 WHERE project_id = $1 AND id != $2")
            .bind(&project_id)
            .bind(&swarm_id)
            .execute(pool.as_ref())
            .await
            .map_err(|e| format!("Failed to disable other swarms: {}", e))?;
    }

    Ok(Json(ProjectSwarmResponse {
        id: swarm_id,
        name: payload.name,
        description: payload.description.unwrap_or_default(),
        cli: payload.cli,
        agents: payload.agents.unwrap_or_default(),
        skills_count: payload.skills_count.unwrap_or(0),
        mcps_count: payload.mcps_count.unwrap_or(0),
        oh_my_opencode: payload.oh_my_opencode.unwrap_or_default(),
        opencode_config: payload.opencode_config.unwrap_or_default(),
        skills: payload.skills.unwrap_or_default(),
        uploaded_skills: payload.uploaded_skills.unwrap_or_default(),
        created_at: timestamp_to_iso(Some(now)),
        is_active: enabled,
        accent: payload.accent.unwrap_or_else(|| "amber".to_string()),
    }))
}

/// Request body for updating project swarm
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProjectSwarmRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub enabled: Option<bool>,
    pub accent: Option<String>,
}

/// Get single project swarm
async fn get_project_swarm(
    Path((_project_id, swarm_id)): Path<(String, String)>,
    State(state): State<HttpServerState>,
) -> Result<Json<ProjectSwarmResponse>, String> {
    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;

    let row = sqlx::query(
        "SELECT id, name, cli, enabled, overrides_json, installed_at FROM project_swarms WHERE id = $1 LIMIT 1"
    )
    .bind(&swarm_id)
    .fetch_optional(pool.as_ref())
    .await
    .map_err(|e| format!("Failed to fetch project swarm: {}", e))?
        .ok_or_else(|| "Project swarm not found".to_string())?;

    let overrides_json: Option<String> = row.try_get("overrides_json").ok();
    let overrides: Option<serde_json::Value> = overrides_json.and_then(|s| serde_json::from_str(&s).ok());

    let description = overrides.as_ref().and_then(|o| o.get("description")).and_then(|d| d.as_str()).map(|s| s.to_string()).unwrap_or_default();
    let agents = overrides.as_ref().and_then(|o| o.get("agents")).and_then(|a| a.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
    let skills_count = overrides.as_ref().and_then(|o| o.get("skillsCount").and_then(|s| s.as_i64())).unwrap_or(0) as i32;
    let mcps_count = overrides.as_ref().and_then(|o| o.get("mcpsCount").and_then(|s| s.as_i64())).unwrap_or(0) as i32;
    let oh_my_opencode = overrides.as_ref().and_then(|o| o.get("ohMyOpencode")).and_then(|s| s.as_str()).map(|s| s.to_string()).unwrap_or_default();
    let opencode_config = overrides.as_ref().and_then(|o| o.get("opencodeConfig")).and_then(|s| s.as_str()).map(|s| s.to_string()).unwrap_or_default();
    let skills = overrides.as_ref().and_then(|o| o.get("skills")).and_then(|s| s.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
    let uploaded_skills = overrides.as_ref().and_then(|o| o.get("uploadedSkills")).and_then(|s| s.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
    let accent = overrides.as_ref().and_then(|o| o.get("accent")).and_then(|s| s.as_str()).map(|s| s.to_string()).unwrap_or_else(|| "amber".to_string());

    Ok(Json(ProjectSwarmResponse {
        id: row.try_get("id").map_err(|e| format!("Failed to get id: {}", e))?,
        name: row.try_get("name").map_err(|e| format!("Failed to get name: {}", e))?,
        description,
        cli: row.try_get("cli").map_err(|e| format!("Failed to get cli: {}", e))?,
        agents,
        skills_count,
        mcps_count,
        oh_my_opencode,
        opencode_config,
        skills,
        uploaded_skills,
        created_at: timestamp_to_iso(row.try_get("installed_at").ok()),
        is_active: row.get::<i32, _>("enabled") == 1,
        accent,
    }))
}

/// Update project swarm
async fn update_project_swarm(
    Path((_project_id, swarm_id)): Path<(String, String)>,
    State(state): State<HttpServerState>,
    Json(payload): Json<UpdateProjectSwarmRequest>,
) -> Result<Json<ProjectSwarmResponse>, String> {
    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;

    let now = chrono::Utc::now().timestamp();

    // Get existing swarm to merge overrides
    let existing_row = sqlx::query(
        "SELECT overrides_json FROM project_swarms WHERE id = $1 LIMIT 1"
    )
    .bind(&swarm_id)
    .fetch_optional(pool.as_ref())
    .await
    .map_err(|e| format!("Failed to fetch project swarm: {}", e))?
        .ok_or_else(|| "Project swarm not found".to_string())?;

    let existing_overrides: serde_json::Value = existing_row.try_get::<String, _>("overrides_json")
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(serde_json::json!({}));

    // Merge overrides with new values
    let mut new_overrides = existing_overrides;
    if let Some(description) = &payload.description {
        new_overrides["description"] = serde_json::json!(description);
    }
    if let Some(accent) = &payload.accent {
        new_overrides["accent"] = serde_json::json!(accent);
    }
    let new_overrides_json = serde_json::to_string(&new_overrides).map_err(|e| format!("Failed to serialize overrides: {}", e))?;

    // Update query
    let update_fields = vec![
        ("overrides_json", new_overrides_json),
        ("updated_at", now.to_string()),
    ];

    let mut query_str = "UPDATE project_swarms SET ".to_string();
    let mut param_count = 1;
    let mut bind_values: Vec<Box<dyn sqlx::Encode<sqlx::Sqlite> + Send + Sync>> = Vec::new();

    for (field, _value) in &update_fields {
        if param_count > 1 {
            query_str.push_str(", ");
        }
        query_str.push_str(&format!("{} = ${}", field, param_count));
        param_count += 1;
        // We'll bind later with actual values
    }

    // Handle optional fields
    if let Some(name) = &payload.name {
        query_str.push_str(&format!(", name = ${}", param_count));
        param_count += 1;
    }

    if let Some(enabled) = payload.enabled {
        query_str.push_str(&format!(", enabled = ${}", param_count));
        param_count += 1;
    }

    query_str.push_str(&format!(" WHERE id = ${}", param_count));

    // Execute update with proper binding
    let mut query = sqlx::query(&query_str);
    query = query.bind(&update_fields[0].1).bind(&update_fields[1].1);
    if let Some(name) = &payload.name {
        query = query.bind(name);
    }
    if let Some(enabled) = &payload.enabled {
        query = query.bind(if *enabled { 1 } else { 0 });
    }
    query = query.bind(&swarm_id);

    let result = query.execute(pool.as_ref())
        .await
        .map_err(|e| format!("Failed to update project swarm: {}", e))?;

    if result.rows_affected() == 0 {
        return Err("Project swarm not found".to_string());
    }

    // If enabled, disable other swarms in the same project
    if let Some(true) = payload.enabled {
        // Get project_id from existing row
        let project_row = sqlx::query("SELECT project_id FROM project_swarms WHERE id = $1")
            .bind(&swarm_id)
            .fetch_optional(pool.as_ref())
            .await
            .map_err(|e| format!("Failed to fetch project_id: {}", e))?
            .ok_or_else(|| "Project swarm not found".to_string())?;

        let project_id: String = project_row.get("project_id");
        sqlx::query("UPDATE project_swarms SET enabled = 0 WHERE project_id = $1 AND id != $2")
            .bind(&project_id)
            .bind(&swarm_id)
            .execute(pool.as_ref())
            .await
            .map_err(|e| format!("Failed to disable other swarms: {}", e))?;
    }

    // Fetch and return updated swarm
    let row = sqlx::query(
        "SELECT id, name, cli, enabled, overrides_json, installed_at FROM project_swarms WHERE id = $1 LIMIT 1"
    )
    .bind(&swarm_id)
    .fetch_one(pool.as_ref())
    .await
    .map_err(|e| format!("Failed to fetch updated swarm: {}", e))?;

    let overrides_json: String = row.get("overrides_json");
    let overrides: serde_json::Value = serde_json::from_str(&overrides_json).map_err(|e| format!("Failed to parse overrides: {}", e))?;

    let description = overrides.get("description").and_then(|d| d.as_str()).map(|s| s.to_string()).unwrap_or_default();
    let agents = overrides.get("agents").and_then(|a| a.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
    let skills_count = overrides.get("skillsCount").and_then(|s| s.as_i64()).unwrap_or(0) as i32;
    let mcps_count = overrides.get("mcpsCount").and_then(|s| s.as_i64()).unwrap_or(0) as i32;
    let oh_my_opencode = overrides.get("ohMyOpencode").and_then(|s| s.as_str()).map(|s| s.to_string()).unwrap_or_default();
    let opencode_config = overrides.get("opencodeConfig").and_then(|s| s.as_str()).map(|s| s.to_string()).unwrap_or_default();
    let skills = overrides.get("skills").and_then(|s| s.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
    let uploaded_skills = overrides.get("uploadedSkills").and_then(|s| s.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
    let accent = overrides.get("accent").and_then(|s| s.as_str()).map(|s| s.to_string()).unwrap_or_else(|| "amber".to_string());

    Ok(Json(ProjectSwarmResponse {
        id: row.get("id"),
        name: row.get("name"),
        description,
        cli: row.get("cli"),
        agents,
        skills_count,
        mcps_count,
        oh_my_opencode,
        opencode_config,
        skills,
        uploaded_skills,
        created_at: timestamp_to_iso(row.try_get("installed_at").ok()),
        is_active: row.get::<i32, _>("enabled") == 1,
        accent,
    }))
}

/// Delete project swarm
async fn delete_project_swarm(
    Path((_project_id, swarm_id)): Path<(String, String)>,
    State(state): State<HttpServerState>,
) -> Result<Json<serde_json::Value>, String> {
    let pool = get_db_pool_from_manager(&state.process_manager)
        .await
        .ok_or("Database pool not available")?;

    let result = sqlx::query("DELETE FROM project_swarms WHERE id = $1")
        .bind(&swarm_id)
        .execute(pool.as_ref())
        .await
        .map_err(|e| format!("Failed to delete project swarm: {}", e))?;

    if result.rows_affected() == 0 {
        return Err("Project swarm not found".to_string());
    }

    Ok(Json(serde_json::json!({ "success": true })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EnableRemoteAccessRequest {
    relay_url: Option<String>,
    device_name: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EnableRemoteAccessResponse {
    device_id: String,
    pairing_key: String,
    qr_code_url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SimpleSuccessResponse {
    success: bool,
}

async fn init_remote_access_tables(pool: &SqlitePool) -> Result<(), String> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS remote_access_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            enabled INTEGER NOT NULL,
            device_id TEXT,
            pairing_key TEXT,
            pairing_key_hash TEXT,
            relay_url TEXT,
            updated_at INTEGER NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create remote_access_settings: {}", e))?;
    let _ = sqlx::query("ALTER TABLE remote_access_settings ADD COLUMN pairing_key TEXT")
        .execute(pool)
        .await;
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS remote_access_paired_devices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL UNIQUE,
            device_name TEXT NOT NULL,
            paired_at INTEGER NOT NULL,
            last_seen INTEGER
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create remote_access_paired_devices: {}", e))?;
    Ok(())
}

fn generate_pairing_key() -> String {
    format!("{:06}", uuid::Uuid::new_v4().as_u128() % 1_000_000)
}

fn default_relay_ws_url() -> String {
    std::env::var("BEE_REMOTE_RELAY_WS_URL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "ws://relay.yuantianze.com:3848/ws".to_string())
}

async fn stop_remote_access_task() {
    if let Some(handle) = REMOTE_ACCESS_TASK.write().await.take() {
        handle.abort();
    }
}

async fn spawn_remote_access_task(device_id: String, pairing_key: String, relay_url: String, device_name: String) {
    stop_remote_access_task().await;
    let handle = tokio::spawn(async move {
        let mut backoff_secs = 1_u64;
        loop {
            {
                let runtime = REMOTE_ACCESS_RUNTIME.read().await;
                if !runtime.enabled {
                    break;
                }
            }
            {
                let mut runtime = REMOTE_ACCESS_RUNTIME.write().await;
                runtime.connection_state = "connecting".to_string();
                runtime.last_error = None;
            }
            let connect_result = connect_async(&relay_url).await;
            let (ws_stream, _) = match connect_result {
                Ok(v) => v,
                Err(_) => {
                    {
                        let mut runtime = REMOTE_ACCESS_RUNTIME.write().await;
                        runtime.connection_state = "reconnecting".to_string();
                        runtime.last_error = Some("RELAY_CONNECT_FAILED".to_string());
                    }
                    tokio::time::sleep(std::time::Duration::from_secs(backoff_secs)).await;
                    backoff_secs = (backoff_secs * 2).min(30);
                    continue;
                }
            };
            backoff_secs = 1;
            let (mut writer, mut reader) = futures_util::StreamExt::split(ws_stream);
            let (relay_out_tx, mut relay_out_rx) = mpsc::unbounded_channel::<String>();
            let writer_task = tokio::spawn(async move {
                while let Some(payload) = relay_out_rx.recv().await {
                    if writer.send(TunnelMessage::Text(payload)).await.is_err() {
                        break;
                    }
                }
            });
            let local_ws_connections: Arc<RwLock<HashMap<String, mpsc::UnboundedSender<TunnelMessage>>>> =
                Arc::new(RwLock::new(HashMap::new()));
            let register = RelayRegisterMessage {
                message_type: "Register".to_string(),
                device_id: device_id.clone(),
                pairing_key: pairing_key.clone(),
                device_name: device_name.clone(),
            };
            if let Ok(payload) = serde_json::to_string(&register) {
                let _ = relay_out_tx.send(payload);
            }
            let connect = RelayConnectMessage {
                message_type: "Connect".to_string(),
                device_id: device_id.clone(),
                pairing_key: pairing_key.clone(),
                client_info: RelayClientInfo {
                    device_type: "desktop".to_string(),
                    device_name: device_name.clone(),
                    platform: std::env::consts::OS.to_string(),
                },
            };
            if let Ok(payload) = serde_json::to_string(&connect) {
                let _ = relay_out_tx.send(payload);
            }
            let mut session_id: Option<String> = None;
            let mut session_token: Option<String> = None;
            let mut heartbeat = tokio::time::interval(std::time::Duration::from_secs(30));
            loop {
                tokio::select! {
                    _ = heartbeat.tick() => {
                        if let Some(id) = session_id.as_ref() {
                            let ping = RelayHeartbeatMessage {
                                message_type: "Heartbeat".to_string(),
                                session_id: id.clone(),
                            };
                            if let Ok(payload) = serde_json::to_string(&ping) {
                                if relay_out_tx.send(payload).is_err() {
                                    break;
                                }
                            }
                        }
                    }
                    msg = futures_util::StreamExt::next(&mut reader) => {
                        let Some(Ok(message)) = msg else {
                            break;
                        };
                        if let TunnelMessage::Text(text) = message {
                            if let Ok(incoming) = serde_json::from_str::<RelayIncomingMessage>(&text) {
                                match incoming {
                                    RelayIncomingMessage::ConnectResult { status, session_id: sid, session_token: relay_token } => {
                                        if status == "success" {
                                            session_id = sid;
                                            session_token = relay_token;
                                            let mut runtime = REMOTE_ACCESS_RUNTIME.write().await;
                                            runtime.connection_state = "connected".to_string();
                                            runtime.last_error = None;
                                        } else {
                                            let mut runtime = REMOTE_ACCESS_RUNTIME.write().await;
                                            runtime.connection_state = "reconnecting".to_string();
                                            runtime.last_error = Some("CONNECT_RESULT_NOT_SUCCESS".to_string());
                                            break;
                                        }
                                    }
                                    RelayIncomingMessage::Error { code, message } => {
                                        log::warn!("received relay error message code={} message={}", code, message);
                                        let mut runtime = REMOTE_ACCESS_RUNTIME.write().await;
                                        runtime.connection_state = "reconnecting".to_string();
                                        runtime.last_error = Some(format!("{}: {}", code, message));
                                        break;
                                    }
                                    RelayIncomingMessage::HttpRequest { request_id, method, url, query, headers, body } => {
                                        let (status, response_headers, response_body) = forward_http_to_local(method, url, query, headers, body).await;
                                        let response = RelayHttpResponseMessage {
                                            message_type: "HttpResponse".to_string(),
                                            request_id,
                                            status,
                                            headers: response_headers,
                                            body: response_body,
                                        };
                                        if let Ok(payload) = serde_json::to_string(&response) {
                                            if relay_out_tx.send(payload).is_err() {
                                                break;
                                            }
                                        }
                                    }
                                    RelayIncomingMessage::WsOpen { request_id, connection_id, url, query, headers } => {
                                        let outbound = relay_out_tx.clone();
                                        let local_connections = local_ws_connections.clone();
                                        let relay_session_token = session_token.clone();
                                        tokio::spawn(async move {
                                            handle_ws_open_to_local(
                                                request_id,
                                                connection_id,
                                                url,
                                                query,
                                                headers,
                                                outbound,
                                                local_connections,
                                                relay_session_token,
                                            )
                                            .await;
                                        });
                                    }
                                    RelayIncomingMessage::WsData { connection_id, data, is_binary } => {
                                        let relay_session_token = session_token.clone();
                                        let send_result = forward_ws_data_to_local(
                                            &local_ws_connections,
                                            &connection_id,
                                            data,
                                            is_binary,
                                        )
                                        .await;
                                        if let (Err(err), Some(token)) = (send_result, relay_session_token) {
                                            let close = RelayWsCloseMessage {
                                                message_type: "WsClose".to_string(),
                                                session_token: token,
                                                connection_id,
                                                code: Some(1011),
                                                reason: Some(err),
                                            };
                                            if let Ok(payload) = serde_json::to_string(&close) {
                                                let _ = relay_out_tx.send(payload);
                                            }
                                        }
                                    }
                                    RelayIncomingMessage::WsClose { connection_id, code, reason } => {
                                        close_local_ws_connection(
                                            &local_ws_connections,
                                            &connection_id,
                                            code,
                                            reason,
                                        )
                                        .await;
                                    }
                                    RelayIncomingMessage::Other => {}
                                }
                            }
                        }
                    }
                }
            }
            writer_task.abort();
            close_all_local_ws_connections(&local_ws_connections).await;
            {
                let mut runtime = REMOTE_ACCESS_RUNTIME.write().await;
                runtime.connection_state = "reconnecting".to_string();
                runtime.last_error = Some("RELAY_STREAM_CLOSED".to_string());
            }
            tokio::time::sleep(std::time::Duration::from_secs(backoff_secs)).await;
            backoff_secs = (backoff_secs * 2).min(30);
        }
    });
    *REMOTE_ACCESS_TASK.write().await = Some(handle);
}

async fn forward_http_to_local(
    method: String,
    path: String,
    query: Option<String>,
    headers: Option<serde_json::Value>,
    body: Option<String>,
) -> (u16, serde_json::Value, String) {
    let mut target = format!("http://127.0.0.1:3847{}", path);
    if let Some(q) = query {
        if !q.is_empty() {
            target.push('?');
            target.push_str(&q);
        }
    }
    let method = reqwest::Method::from_bytes(method.as_bytes()).unwrap_or(reqwest::Method::GET);
    let client = reqwest::Client::new();
    let mut request = client.request(method, &target);
    if let Some(obj) = headers.as_ref().and_then(|v| v.as_object()) {
        for (k, v) in obj {
            if let Some(vs) = v.as_str() {
                request = request.header(k, vs);
            }
        }
    }
    if let Some(payload) = body {
        request = request.body(payload);
    }
    match request.send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let mut h = serde_json::Map::new();
            for (k, v) in resp.headers().iter() {
                if let Ok(value) = v.to_str() {
                    h.insert(k.as_str().to_string(), serde_json::Value::String(value.to_string()));
                }
            }
            let text = resp.text().await.unwrap_or_default();
            (status, serde_json::Value::Object(h), text)
        }
        Err(err) => (
            502,
            serde_json::json!({"content-type":"application/json"}),
            serde_json::json!({ "error": format!("FORWARD_FAILED: {}", err) }).to_string(),
        ),
    }
}

fn build_local_ws_target(path: &str, query: Option<&str>) -> String {
    let mut target = format!("ws://127.0.0.1:3847{}", path);
    if let Some(q) = query {
        if !q.is_empty() {
            target.push('?');
            target.push_str(q);
        }
    }
    target
}

async fn handle_ws_open_to_local(
    request_id: String,
    connection_id: String,
    path: String,
    query: Option<String>,
    headers: Option<serde_json::Value>,
    relay_out_tx: mpsc::UnboundedSender<String>,
    local_ws_connections: Arc<RwLock<HashMap<String, mpsc::UnboundedSender<TunnelMessage>>>>,
    relay_session_token: Option<String>,
) {
    let Some(session_token) = relay_session_token else {
        let ack = RelayWsOpenAckMessage {
            message_type: "WsOpenAck".to_string(),
            request_id,
            connection_id,
            status: "error".to_string(),
            reason: Some("SESSION_NOT_READY".to_string()),
        };
        if let Ok(payload) = serde_json::to_string(&ack) {
            let _ = relay_out_tx.send(payload);
        }
        return;
    };

    let target = build_local_ws_target(&path, query.as_deref());
    let mut request = match target.into_client_request() {
        Ok(req) => req,
        Err(err) => {
            let ack = RelayWsOpenAckMessage {
                message_type: "WsOpenAck".to_string(),
                request_id,
                connection_id,
                status: "error".to_string(),
                reason: Some(format!("INVALID_WS_URL: {}", err)),
            };
            if let Ok(payload) = serde_json::to_string(&ack) {
                let _ = relay_out_tx.send(payload);
            }
            return;
        }
    };
    if let Some(header_obj) = headers.as_ref().and_then(|v| v.as_object()) {
        for (k, v) in header_obj {
            if let (Ok(name), Some(value_str)) = (HeaderName::from_bytes(k.as_bytes()), v.as_str()) {
                if let Ok(value) = HeaderValue::from_str(value_str) {
                    request.headers_mut().insert(name, value);
                }
            }
        }
    }

    let connect_result = connect_async(request).await;
    let (local_ws, _) = match connect_result {
        Ok(v) => v,
        Err(err) => {
            let ack = RelayWsOpenAckMessage {
                message_type: "WsOpenAck".to_string(),
                request_id,
                connection_id,
                status: "error".to_string(),
                reason: Some(format!("WS_OPEN_FAILED: {}", err)),
            };
            if let Ok(payload) = serde_json::to_string(&ack) {
                let _ = relay_out_tx.send(payload);
            }
            return;
        }
    };

    let (mut local_writer, mut local_reader) = futures_util::StreamExt::split(local_ws);
    let (local_out_tx, mut local_out_rx) = mpsc::unbounded_channel::<TunnelMessage>();
    tokio::spawn(async move {
        while let Some(msg) = local_out_rx.recv().await {
            if local_writer.send(msg).await.is_err() {
                break;
            }
        }
    });
    local_ws_connections
        .write()
        .await
        .insert(connection_id.clone(), local_out_tx);

    let ack = RelayWsOpenAckMessage {
        message_type: "WsOpenAck".to_string(),
        request_id: request_id.clone(),
        connection_id: connection_id.clone(),
        status: "success".to_string(),
        reason: None,
    };
    if let Ok(payload) = serde_json::to_string(&ack) {
        let _ = relay_out_tx.send(payload);
    }

    let relay_out_tx_cloned = relay_out_tx.clone();
    let connection_id_cloned = connection_id.clone();
    let local_ws_connections_cloned = local_ws_connections.clone();
    tokio::spawn(async move {
        loop {
            match FuturesStreamExt::next(&mut local_reader).await {
                Some(Ok(TunnelMessage::Text(text))) => {
                    let outbound = RelayWsDataMessage {
                        message_type: "WsData".to_string(),
                        session_token: session_token.clone(),
                        connection_id: connection_id_cloned.clone(),
                        data: text.to_string(),
                        is_binary: false,
                    };
                    if let Ok(payload) = serde_json::to_string(&outbound) {
                        if relay_out_tx_cloned.send(payload).is_err() {
                            break;
                        }
                    }
                }
                Some(Ok(TunnelMessage::Binary(bin))) => {
                    let outbound = RelayWsDataMessage {
                        message_type: "WsData".to_string(),
                        session_token: session_token.clone(),
                        connection_id: connection_id_cloned.clone(),
                        data: BASE64_ENGINE.encode(bin),
                        is_binary: true,
                    };
                    if let Ok(payload) = serde_json::to_string(&outbound) {
                        if relay_out_tx_cloned.send(payload).is_err() {
                            break;
                        }
                    }
                }
                Some(Ok(TunnelMessage::Close(_))) => {
                    let close = RelayWsCloseMessage {
                        message_type: "WsClose".to_string(),
                        session_token: session_token.clone(),
                        connection_id: connection_id_cloned.clone(),
                        code: Some(1000),
                        reason: Some("LOCAL_CLOSED".to_string()),
                    };
                    if let Ok(payload) = serde_json::to_string(&close) {
                        let _ = relay_out_tx_cloned.send(payload);
                    }
                    break;
                }
                Some(Ok(TunnelMessage::Ping(_))) | Some(Ok(TunnelMessage::Pong(_))) => {}
                Some(Ok(_)) => {}
                Some(Err(err)) => {
                    let close = RelayWsCloseMessage {
                        message_type: "WsClose".to_string(),
                        session_token: session_token.clone(),
                        connection_id: connection_id_cloned.clone(),
                        code: Some(1011),
                        reason: Some(format!("LOCAL_WS_ERROR: {}", err)),
                    };
                    if let Ok(payload) = serde_json::to_string(&close) {
                        let _ = relay_out_tx_cloned.send(payload);
                    }
                    break;
                }
                None => break,
            }
        }
        local_ws_connections_cloned
            .write()
            .await
            .remove(&connection_id_cloned);
    });
}

async fn forward_ws_data_to_local(
    local_ws_connections: &Arc<RwLock<HashMap<String, mpsc::UnboundedSender<TunnelMessage>>>>,
    connection_id: &str,
    data: String,
    is_binary: bool,
) -> Result<(), String> {
    let sender = {
        let connections = local_ws_connections.read().await;
        connections.get(connection_id).cloned()
    }
    .ok_or_else(|| "WS_CONNECTION_NOT_FOUND".to_string())?;
    let message = if is_binary {
        let decoded = BASE64_ENGINE
            .decode(data.as_bytes())
            .map_err(|err| format!("INVALID_BINARY_PAYLOAD: {}", err))?;
        TunnelMessage::Binary(decoded)
    } else {
        TunnelMessage::Text(data)
    };
    sender
        .send(message)
        .map_err(|_| "LOCAL_WS_SEND_FAILED".to_string())
}

async fn close_local_ws_connection(
    local_ws_connections: &Arc<RwLock<HashMap<String, mpsc::UnboundedSender<TunnelMessage>>>>,
    connection_id: &str,
    _code: Option<u16>,
    _reason: Option<String>,
) {
    let sender = {
        let mut connections = local_ws_connections.write().await;
        connections.remove(connection_id)
    };
    if let Some(s) = sender {
        let _ = s.send(TunnelMessage::Close(None));
    }
}

async fn close_all_local_ws_connections(
    local_ws_connections: &Arc<RwLock<HashMap<String, mpsc::UnboundedSender<TunnelMessage>>>>,
) {
    let senders = {
        let mut connections = local_ws_connections.write().await;
        connections.drain().map(|(_, sender)| sender).collect::<Vec<_>>()
    };
    for sender in senders {
        let _ = sender.send(TunnelMessage::Close(None));
    }
}

async fn enable_remote_access(
    State(state): State<HttpServerState>,
    Json(payload): Json<EnableRemoteAccessRequest>,
) -> Result<Json<EnableRemoteAccessResponse>, String> {
    let relay_url = payload.relay_url.unwrap_or_else(default_relay_ws_url);
    let device_name = payload
        .device_name
        .unwrap_or_else(|| "Bee Desktop".to_string());
    let device_id = uuid::Uuid::new_v4().to_string();
    let pairing_key = generate_pairing_key();
    let pairing_key_hash = format!("{:x}", Sha256::digest(pairing_key.as_bytes()));
    if let Some(pool) = get_db_pool_from_manager(&state.process_manager).await {
        init_remote_access_tables(pool.as_ref()).await?;
        sqlx::query(
            r#"
            INSERT INTO remote_access_settings (id, enabled, device_id, pairing_key, pairing_key_hash, relay_url, updated_at)
            VALUES (1, 1, $1, $2, $3, $4, $5)
            ON CONFLICT(id) DO UPDATE SET
                enabled = excluded.enabled,
                device_id = excluded.device_id,
                pairing_key = excluded.pairing_key,
                pairing_key_hash = excluded.pairing_key_hash,
                relay_url = excluded.relay_url,
                updated_at = excluded.updated_at
            "#,
        )
        .bind(&device_id)
        .bind(&pairing_key)
        .bind(&pairing_key_hash)
        .bind(&relay_url)
        .bind(chrono::Utc::now().timestamp())
        .execute(pool.as_ref())
        .await
        .map_err(|e| format!("Failed to save remote access settings: {}", e))?;
    }
    {
        let mut runtime = REMOTE_ACCESS_RUNTIME.write().await;
        runtime.enabled = true;
        runtime.device_id = Some(device_id.clone());
        runtime.pairing_key = Some(pairing_key.clone());
        runtime.relay_url = Some(relay_url.clone());
        runtime.connection_state = "connecting".to_string();
        runtime.last_error = None;
    }
    spawn_remote_access_task(
        device_id.clone(),
        pairing_key.clone(),
        relay_url.clone(),
        device_name,
    )
    .await;
    let qr_payload = format!(
        "bee://remote-access?device_id={}&pairing_key={}&relay_url={}",
        device_id, pairing_key, relay_url
    );
    Ok(Json(EnableRemoteAccessResponse {
        device_id,
        pairing_key,
        qr_code_url: qr_payload,
    }))
}

async fn disable_remote_access(
    State(state): State<HttpServerState>,
) -> Result<Json<SimpleSuccessResponse>, String> {
    if let Some(pool) = get_db_pool_from_manager(&state.process_manager).await {
        init_remote_access_tables(pool.as_ref()).await?;
        sqlx::query(
            r#"
            INSERT INTO remote_access_settings (id, enabled, device_id, pairing_key, pairing_key_hash, relay_url, updated_at)
            VALUES (1, 0, NULL, NULL, NULL, NULL, $1)
            ON CONFLICT(id) DO UPDATE SET
                enabled = excluded.enabled,
                device_id = excluded.device_id,
                pairing_key = excluded.pairing_key,
                pairing_key_hash = excluded.pairing_key_hash,
                relay_url = excluded.relay_url,
                updated_at = excluded.updated_at
            "#,
        )
        .bind(chrono::Utc::now().timestamp())
        .execute(pool.as_ref())
        .await
        .map_err(|e| format!("Failed to disable remote access: {}", e))?;
    }
    {
        let mut runtime = REMOTE_ACCESS_RUNTIME.write().await;
        runtime.enabled = false;
        runtime.connection_state = "disabled".to_string();
        runtime.pairing_key = None;
        runtime.last_error = None;
    }
    stop_remote_access_task().await;
    Ok(Json(SimpleSuccessResponse { success: true }))
}

async fn get_remote_access_status(
    State(state): State<HttpServerState>,
) -> Result<Json<RemoteAccessStatusData>, String> {
    let runtime = REMOTE_ACCESS_RUNTIME.read().await.clone();
    let mut paired_devices = Vec::new();
    if let Some(pool) = get_db_pool_from_manager(&state.process_manager).await {
        init_remote_access_tables(pool.as_ref()).await?;
        let rows = sqlx::query(
            r#"
            SELECT device_id, device_name, paired_at, last_seen
            FROM remote_access_paired_devices
            ORDER BY paired_at DESC
            "#,
        )
        .fetch_all(pool.as_ref())
        .await
        .map_err(|e| format!("Failed to query paired devices: {}", e))?;
        for row in rows {
            let paired_at = row.try_get::<i64, _>("paired_at").ok();
            let last_seen = row.try_get::<i64, _>("last_seen").ok();
            paired_devices.push(RemotePairedDevice {
                device_id: row.get("device_id"),
                device_name: row.get("device_name"),
                paired_at: timestamp_to_iso(paired_at),
                last_seen: Some(timestamp_to_iso(last_seen)),
            });
        }
    }
    Ok(Json(RemoteAccessStatusData {
        enabled: runtime.enabled,
        device_id: runtime.device_id,
        pairing_key: runtime.pairing_key,
        relay_url: runtime.relay_url,
        connection_state: runtime.connection_state,
        last_error: runtime.last_error,
        paired_devices,
    }))
}

async fn remove_remote_access_paired_device(
    Path(device_id): Path<String>,
    State(state): State<HttpServerState>,
) -> Result<Json<SimpleSuccessResponse>, String> {
    if let Some(pool) = get_db_pool_from_manager(&state.process_manager).await {
        init_remote_access_tables(pool.as_ref()).await?;
        sqlx::query("DELETE FROM remote_access_paired_devices WHERE device_id = $1")
            .bind(device_id)
            .execute(pool.as_ref())
            .await
            .map_err(|e| format!("Failed to delete paired device: {}", e))?;
    }
    Ok(Json(SimpleSuccessResponse { success: true }))
}

async fn regenerate_remote_access_key(
    State(state): State<HttpServerState>,
) -> Result<Json<EnableRemoteAccessResponse>, String> {
    let mut runtime = REMOTE_ACCESS_RUNTIME.write().await;
    let device_id = runtime
        .device_id
        .clone()
        .ok_or_else(|| "Remote access not enabled".to_string())?;
    let relay_url = runtime.relay_url.clone().unwrap_or_else(default_relay_ws_url);
    let pairing_key = generate_pairing_key();
    let pairing_key_hash = format!("{:x}", Sha256::digest(pairing_key.as_bytes()));
    runtime.pairing_key = Some(pairing_key.clone());
    drop(runtime);
    if let Some(pool) = get_db_pool_from_manager(&state.process_manager).await {
        init_remote_access_tables(pool.as_ref()).await?;
        sqlx::query(
            r#"
            INSERT INTO remote_access_settings (id, enabled, device_id, pairing_key, pairing_key_hash, relay_url, updated_at)
            VALUES (1, 1, $1, $2, $3, $4, $5)
            ON CONFLICT(id) DO UPDATE SET
                enabled = excluded.enabled,
                device_id = excluded.device_id,
                pairing_key = excluded.pairing_key,
                pairing_key_hash = excluded.pairing_key_hash,
                relay_url = excluded.relay_url,
                updated_at = excluded.updated_at
            "#,
        )
        .bind(&device_id)
        .bind(&pairing_key)
        .bind(&pairing_key_hash)
        .bind(&relay_url)
        .bind(chrono::Utc::now().timestamp())
        .execute(pool.as_ref())
        .await
        .map_err(|e| format!("Failed to save regenerated key: {}", e))?;
    }
    spawn_remote_access_task(
        device_id.clone(),
        pairing_key.clone(),
        relay_url.clone(),
        "Bee Desktop".to_string(),
    )
    .await;
    let qr_payload = format!(
        "bee://remote-access?device_id={}&pairing_key={}&relay_url={}",
        device_id, pairing_key, relay_url
    );
    Ok(Json(EnableRemoteAccessResponse {
        device_id,
        pairing_key,
        qr_code_url: qr_payload,
    }))
}

async fn restore_remote_access_runtime(
    process_manager: &Arc<RwLock<AgentProcessManager>>,
) -> Result<(), String> {
    let Some(pool) = get_db_pool_from_manager(process_manager).await else {
        return Ok(());
    };
    init_remote_access_tables(pool.as_ref()).await?;
    let row = sqlx::query(
        r#"
        SELECT enabled, device_id, pairing_key, relay_url
        FROM remote_access_settings
        WHERE id = 1
        "#,
    )
    .fetch_optional(pool.as_ref())
    .await
    .map_err(|e| format!("Failed to load remote access settings: {}", e))?;
    let Some(row) = row else {
        return Ok(());
    };
    let enabled = row.try_get::<i64, _>("enabled").unwrap_or(0) == 1;
    let device_id: Option<String> = row.try_get("device_id").ok();
    let pairing_key: Option<String> = row.try_get("pairing_key").ok();
    let relay_url: Option<String> = row.try_get("relay_url").ok();
    {
        let mut runtime = REMOTE_ACCESS_RUNTIME.write().await;
        runtime.enabled = enabled;
        runtime.device_id = device_id.clone();
        runtime.pairing_key = pairing_key.clone();
        runtime.relay_url = relay_url.clone();
        runtime.last_error = None;
        runtime.connection_state = if enabled {
            "connecting".to_string()
        } else {
            "disabled".to_string()
        };
    }
    if enabled {
        if let (Some(device_id), Some(pairing_key), Some(relay_url)) = (device_id, pairing_key, relay_url) {
            spawn_remote_access_task(device_id, pairing_key, relay_url, "Bee Desktop".to_string()).await;
        }
    }
    Ok(())
}

fn create_router(state: HttpServerState) -> Router {
    // 配置 CORS - 允许所有来源访问 + WebSocket 支持
    use tower_http::cors::{Any, CorsLayer};
    use axum::http::{header, Method};
    use std::time::Duration;
    
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS, Method::PUT, Method::PATCH, Method::DELETE])
        .allow_headers(Any)
        .expose_headers(Any)
        .allow_private_network(true)
        .max_age(Duration::from_secs(3600));

    Router::new()
        // Health check
        .route("/health", get(health_check))
        // Agent list
        .route("/api/agents/available", get(get_available_agents))
        // Model cache refresh
        .route("/api/agents/model-cache/refresh", post(refresh_model_cache))
        // 🔹 Agent cache refresh (独立缓存)
        .route("/api/agents/agent-cache/refresh", post(refresh_agent_cache))
        // Projects API
        .route("/api/projects", get(get_projects).post(create_project))
        .route("/api/projects/:id", get(get_project_by_id).put(update_project).delete(delete_project))
        .route("/api/projects/:id/swarm-config/apply", post(apply_project_swarm_config))
        .route("/api/templates", get(get_templates))
        .route("/api/templates/:template_id", get(get_template_by_id))
        // Tasks API
        .route("/api/tasks", post(create_task))
        .route("/api/tasks/:id", get(get_task_by_id).put(update_task).delete(delete_task))
        .route("/api/tasks/:id/move", post(move_task))
        .route("/api/tasks/:id/workspaces", get(get_task_workspaces).post(create_task_workspace))
        .route("/api/projects/:id/tasks", get(get_tasks_by_project).post(create_task))
        .route("/api/images", post(upload_image))
        .route("/api/images/:id", get(get_image_by_id))
        // Swarms API
        .route("/api/swarms", get(get_swarms))
        .route("/api/swarms/:swarm_id", get(get_swarm_by_id))
        // Swarm Bindings API
        .route("/api/projects/:id/swarm-bindings", get(get_project_swarm_bindings).post(create_swarm_binding))
        .route("/api/projects/:id/swarm-bindings/:binding_id", put(update_swarm_binding).delete(delete_swarm_binding))
        // Project Swarms API (project_swarms table)
        .route("/api/projects/:id/swarms", get(get_project_swarms).post(create_project_swarm))
        .route("/api/projects/:id/swarms/:swarmId", get(get_project_swarm).put(update_project_swarm).delete(delete_project_swarm))
        // Discovered options WebSocket (unified API - vibe-kanban style)
        .route("/api/agents/discovered-options/ws", get(stream_discovered_options_ws))
        // Session API (vibe-kanban compatible)
        .route("/api/sessions", get(get_sessions).post(create_session))
        .route("/api/sessions/:session_id", get(get_session))
        .route("/api/sessions/:session_id/follow-up", post(session_follow_up))
        .route("/api/sessions/:id/processes", get(get_session_processes).post(create_session_process))
        // Execution processes streaming (vibe-kanban compatible)
        .route("/api/execution-processes/stream/session/ws", get(stream_execution_processes_session))
        .route("/api/execution-processes/:exec_id/normalized-logs/ws", get(stream_normalized_logs_ws))
        .route("/api/execution-processes/:exec_id/raw-logs/ws", get(stream_raw_logs_ws))
        // Execution process CRUD
        .route("/api/execution-processes/:id", get(get_execution_process_by_id).patch(patch_execution_process))
        .route("/api/execution-processes/:execution_id/stop", post(stop_execution))
        // Workspace management
        .route("/api/workspaces", post(create_workspace))
        .route("/api/workspaces", get(list_workspaces))
        .route("/api/workspaces/:workspace_id", get(get_workspace_by_id).delete(delete_workspace))
        .route("/api/workspaces/:id/sessions", post(create_workspace_session))
        .route("/api/workspaces/status", post(get_workspace_status))
        .route("/api/workspaces/diff-stats", post(get_workspace_diff_stats))
        // Git API
        .route("/api/git/diff", post(git_get_diff))
        .route("/api/git/branches", get(git_list_branches))
        .route("/api/git/branch-status", post(git_get_branch_status))
        .route("/api/git/push", post(git_push))
        .route("/api/git/pull", post(git_pull))
        .route("/api/git/rebase", post(git_rebase))
        .route("/api/git/merge", post(git_merge))
        .route("/api/git/abort-rebase", post(git_abort_rebase))
        .route("/api/git/abort-merge", post(git_abort_merge))
        .route("/api/git/continue-rebase", post(git_continue_rebase))
        .route("/api/git/commits", post(git_get_commits))
        .route("/api/git/pr", post(git_create_pr))
        .route("/api/git/commit", post(git_commit))
        .route("/api/worktree/files", post(worktree_list_files))
        .route("/api/worktree/file-preview", post(worktree_read_file))
        // Settings API
        .route("/api/settings", get(http_get_settings).put(http_save_settings))
        .route("/api/settings/workspace", get(http_get_settings_workspace).put(http_save_settings_workspace))
        .route("/api/settings/skills/status", get(http_get_skills_hub_status))
        .route("/api/settings/skills/find", post(http_skills_find))
        .route("/api/settings/skills/repo-list", post(http_skills_repo_list))
        .route("/api/settings/skills/install", post(http_skills_install))
        .route("/api/settings/skills/remove", post(http_skills_remove))
        .route("/api/settings/skills/update", post(http_skills_update))
        // Swarm Config API
        .route("/api/swarm-config/write", post(write_swarm_config))
        .route("/api/swarm-config/read", post(read_swarm_config))
        .route("/api/swarm-config/save", post(save_swarm_config_file))
        .route("/api/swarm-config/skills/sync", post(sync_project_skills))
        // Agent execution
        .route("/api/workspaces/:workspace_id/execute", post(execute_agent))
        .route("/api/workspaces/:workspace_id/follow-up", post(send_follow_up))
        .route("/api/workspaces/:workspace_id/stream", get(stream_workspace))
        .route("/api/workspaces/:workspace_id/stream", options(stream_workspace_options))
        .route("/api/workspaces/:workspace_id/entries", get(get_entries))
        .route("/api/executions/:execution_id/stop", post(stop_execution))
        // Filesystem API
        .route("/api/filesystem/git-repos", get(get_git_repos))
        // Remote Access API
        .route("/api/remote-access/enable", post(enable_remote_access))
        .route("/api/remote-access/disable", post(disable_remote_access))
        .route("/api/remote-access/status", get(get_remote_access_status))
        .route("/api/remote-access/paired/:device_id", delete(remove_remote_access_paired_device))
        .route("/api/remote-access/regenerate-key", post(regenerate_remote_access_key))
        .with_state(state)
        .layer(cors)
}

pub async fn start_http_server(
    port: u16,
    process_manager: Arc<RwLock<AgentProcessManager>>,
) -> Result<(), Box<dyn std::error::Error>> {
    // Start the process status update listener
    start_process_status_update_listener(process_manager.clone());
    let _ = restore_remote_access_runtime(&process_manager).await;

    let state = HttpServerState { process_manager };
    let app = create_router(state);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    log_other!(info, "Starting HTTP server on http://{}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::{to_bytes, Body};
    use axum::http::{Method, Request};
    use tower::ServiceExt;

    fn test_temp_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("hivelaunch-skills-api-test-{}-{}", name, uuid::Uuid::new_v4()))
    }

    async fn create_test_process_manager_with_db() -> (Arc<RwLock<AgentProcessManager>>, PathBuf) {
        let db_dir = std::env::temp_dir().join(format!("hivelaunch-http-test-db-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&db_dir).expect("create test db dir");
        let db_path = db_dir.join("hivelaunch.db");
        let pool = crate::process::db::init_db_pool(db_path.to_str().expect("db path utf8"))
            .await
            .expect("init sqlite pool");
        let process_manager = Arc::new(RwLock::new(AgentProcessManager::new_with_db(Arc::new(pool))));
        (process_manager, db_dir)
    }

    #[tokio::test]
    async fn skills_endpoints_should_install_and_remove_skill() {
        let _guard = crate::commands::skills_hub::test_env_lock()
            .lock()
            .expect("lock test env for skills endpoints");
        let cfg_dir = test_temp_dir("config");
        let hub_dir = test_temp_dir("hub");
        std::env::set_var("XDG_CONFIG_HOME", &cfg_dir);
        std::env::set_var("BEE_SKILLS_MOCK", "1");

        let process_manager = Arc::new(RwLock::new(AgentProcessManager::new()));
        let app = create_router(HttpServerState { process_manager });

        let save_settings_req = Request::builder()
            .method(Method::PUT)
            .uri("/api/settings")
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({
                    "workspace_dir": null,
                    "branch_prefix": "hive-",
                    "skills_hub_dir": hub_dir.to_string_lossy().to_string()
                })
                .to_string(),
            ))
            .expect("build save settings request");
        let save_resp = app
            .clone()
            .oneshot(save_settings_req)
            .await
            .expect("call save settings");
        assert_eq!(save_resp.status(), StatusCode::OK);

        let install_req = Request::builder()
            .method(Method::POST)
            .uri("/api/settings/skills/install")
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({
                    "repo": "vercel-labs/agent-skills",
                    "skill": "vercel-react-best-practices",
                    "agent": "opencode"
                })
                .to_string(),
            ))
            .expect("build install request");
        let install_resp = app
            .clone()
            .oneshot(install_req)
            .await
            .expect("call install endpoint");
        assert_eq!(install_resp.status(), StatusCode::OK);

        let status_req = Request::builder()
            .method(Method::GET)
            .uri("/api/settings/skills/status")
            .body(Body::empty())
            .expect("build status request");
        let status_resp = app
            .clone()
            .oneshot(status_req)
            .await
            .expect("call status endpoint");
        assert_eq!(status_resp.status(), StatusCode::OK);
        let status_body = to_bytes(status_resp.into_body(), usize::MAX)
            .await
            .expect("read status body");
        let status_json: serde_json::Value =
            serde_json::from_slice(&status_body).expect("parse status json");
        let installed_len = status_json["data"]["installed_skills"]
            .as_array()
            .map(|v| v.len())
            .unwrap_or(0);
        assert_eq!(installed_len, 1);

        let remove_req = Request::builder()
            .method(Method::POST)
            .uri("/api/settings/skills/remove")
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({
                    "skill": "vercel-react-best-practices"
                })
                .to_string(),
            ))
            .expect("build remove request");
        let remove_resp = app
            .clone()
            .oneshot(remove_req)
            .await
            .expect("call remove endpoint");
        assert_eq!(remove_resp.status(), StatusCode::OK);

        let status_req2 = Request::builder()
            .method(Method::GET)
            .uri("/api/settings/skills/status")
            .body(Body::empty())
            .expect("build second status request");
        let status_resp2 = app
            .clone()
            .oneshot(status_req2)
            .await
            .expect("call second status endpoint");
        assert_eq!(status_resp2.status(), StatusCode::OK);
        let status_body2 = to_bytes(status_resp2.into_body(), usize::MAX)
            .await
            .expect("read second status body");
        let status_json2: serde_json::Value =
            serde_json::from_slice(&status_body2).expect("parse second status json");
        let installed_skills2 = status_json2["data"]["installed_skills"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        let removed_skill_exists = installed_skills2.iter().any(|item| {
            item["name"]
                .as_str()
                .map(|name| name == "vercel-react-best-practices")
                .unwrap_or(false)
        });
        assert!(!removed_skill_exists);

        std::env::remove_var("BEE_SKILLS_MOCK");
        std::env::remove_var("XDG_CONFIG_HOME");
        if cfg_dir.exists() {
            let _ = std::fs::remove_dir_all(cfg_dir);
        }
        if hub_dir.exists() {
            let _ = std::fs::remove_dir_all(hub_dir);
        }
    }

    fn create_test_worktree(prefix: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("hive-worktree-files-test-{}-{}", prefix, uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("create test dir");
        dir
    }

    #[tokio::test]
    async fn worktree_files_endpoint_should_list_entries() {
        let worktree = create_test_worktree("list");
        let src_dir = worktree.join("src");
        std::fs::create_dir_all(&src_dir).expect("create src dir");
        std::fs::write(worktree.join("README.md"), "# Bee\n").expect("write readme");
        std::fs::write(worktree.join("binary.bin"), vec![0, 159, 146, 150]).expect("write binary");

        let process_manager = Arc::new(RwLock::new(AgentProcessManager::new()));
        let app = create_router(HttpServerState { process_manager });

        let req = Request::builder()
            .method(Method::POST)
            .uri("/api/worktree/files")
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({
                    "worktreePath": worktree.to_string_lossy().to_string(),
                    "path": ""
                })
                .to_string(),
            ))
            .expect("build list request");

        let resp = app.clone().oneshot(req).await.expect("call list endpoint");
        assert_eq!(resp.status(), StatusCode::OK);
        let body = to_bytes(resp.into_body(), usize::MAX).await.expect("read list body");
        let json: serde_json::Value = serde_json::from_slice(&body).expect("parse list json");
        let entries = json.as_array().expect("list as array");
        assert!(!entries.is_empty());

        let first = entries.first().expect("first entry");
        assert_eq!(first["isDir"], serde_json::Value::Bool(true));
        assert_eq!(first["name"], serde_json::Value::String("src".to_string()));
        let readme = entries
            .iter()
            .find(|item| item["name"] == "README.md")
            .expect("readme entry");
        assert_eq!(readme["isPreviewable"], serde_json::Value::Bool(true));
        let binary = entries
            .iter()
            .find(|item| item["name"] == "binary.bin")
            .expect("binary entry");
        assert_eq!(binary["isPreviewable"], serde_json::Value::Bool(false));

        let _ = std::fs::remove_dir_all(worktree);
    }

    #[tokio::test]
    async fn worktree_file_preview_endpoint_should_support_text_and_binary() {
        let worktree = create_test_worktree("preview");
        std::fs::write(worktree.join("note.md"), "hello world").expect("write note");
        std::fs::write(worktree.join("blob.bin"), vec![0, 1, 2, 3]).expect("write blob");

        let process_manager = Arc::new(RwLock::new(AgentProcessManager::new()));
        let app = create_router(HttpServerState { process_manager });

        let text_req = Request::builder()
            .method(Method::POST)
            .uri("/api/worktree/file-preview")
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({
                    "worktreePath": worktree.to_string_lossy().to_string(),
                    "path": "note.md",
                    "maxBytes": 5
                })
                .to_string(),
            ))
            .expect("build text preview request");
        let text_resp = app.clone().oneshot(text_req).await.expect("call text preview");
        assert_eq!(text_resp.status(), StatusCode::OK);
        let text_body = to_bytes(text_resp.into_body(), usize::MAX).await.expect("read text body");
        let text_json: serde_json::Value = serde_json::from_slice(&text_body).expect("parse text json");
        assert_eq!(text_json["isBinary"], serde_json::Value::Bool(false));
        assert_eq!(text_json["truncated"], serde_json::Value::Bool(true));
        assert_eq!(text_json["content"], serde_json::Value::String("hello".to_string()));

        let binary_req = Request::builder()
            .method(Method::POST)
            .uri("/api/worktree/file-preview")
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({
                    "worktreePath": worktree.to_string_lossy().to_string(),
                    "path": "blob.bin"
                })
                .to_string(),
            ))
            .expect("build binary preview request");
        let binary_resp = app.clone().oneshot(binary_req).await.expect("call binary preview");
        assert_eq!(binary_resp.status(), StatusCode::OK);
        let binary_body = to_bytes(binary_resp.into_body(), usize::MAX).await.expect("read binary body");
        let binary_json: serde_json::Value = serde_json::from_slice(&binary_body).expect("parse binary json");
        assert_eq!(binary_json["isBinary"], serde_json::Value::Bool(true));
        assert_eq!(binary_json["content"], serde_json::Value::Null);

        let _ = std::fs::remove_dir_all(worktree);
    }

    #[tokio::test]
    async fn worktree_file_preview_should_reject_parent_path() {
        let worktree = create_test_worktree("security");
        std::fs::write(worktree.join("safe.txt"), "safe").expect("write safe");

        let process_manager = Arc::new(RwLock::new(AgentProcessManager::new()));
        let app = create_router(HttpServerState { process_manager });

        let req = Request::builder()
            .method(Method::POST)
            .uri("/api/worktree/file-preview")
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::json!({
                    "worktreePath": worktree.to_string_lossy().to_string(),
                    "path": "../safe.txt"
                })
                .to_string(),
            ))
            .expect("build security request");
        let resp = app.clone().oneshot(req).await.expect("call security preview");
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

        let _ = std::fs::remove_dir_all(worktree);
    }

    #[tokio::test]
    async fn templates_endpoints_should_return_list_and_detail() {
        let process_manager = Arc::new(RwLock::new(AgentProcessManager::new()));
        let app = create_router(HttpServerState { process_manager });

        let list_req = Request::builder()
            .method(Method::GET)
            .uri("/api/templates")
            .body(Body::empty())
            .expect("build template list request");
        let list_resp = app.clone().oneshot(list_req).await.expect("call template list");
        assert_eq!(list_resp.status(), StatusCode::OK);
        let list_body = to_bytes(list_resp.into_body(), usize::MAX)
            .await
            .expect("read template list body");
        let list_json: serde_json::Value =
            serde_json::from_slice(&list_body).expect("parse template list json");
        let list = list_json.as_array().expect("template list should be array");
        assert!(!list.is_empty());

        let first_id = list
            .first()
            .and_then(|v| v.get("id"))
            .and_then(|v| v.as_str())
            .expect("first template id exists")
            .to_string();

        let detail_req = Request::builder()
            .method(Method::GET)
            .uri(format!("/api/templates/{}", first_id))
            .body(Body::empty())
            .expect("build template detail request");
        let detail_resp = app
            .clone()
            .oneshot(detail_req)
            .await
            .expect("call template detail");
        assert_eq!(detail_resp.status(), StatusCode::OK);
        let detail_body = to_bytes(detail_resp.into_body(), usize::MAX)
            .await
            .expect("read template detail body");
        let detail_json: serde_json::Value =
            serde_json::from_slice(&detail_body).expect("parse template detail json");
        assert_eq!(
            detail_json["id"].as_str(),
            Some(first_id.as_str())
        );
        assert!(detail_json["sourceRepoUrl"].is_string());
        assert!(detail_json["templatePath"].is_string());
    }

    #[tokio::test]
    async fn swarms_endpoint_should_seed_official_and_block_official_delete() {
        let (process_manager, db_dir) = create_test_process_manager_with_db().await;
        let app = create_router(HttpServerState { process_manager });

        let list_req = Request::builder()
            .method(Method::GET)
            .uri("/api/swarms")
            .body(Body::empty())
            .expect("build swarms list request");
        let list_resp = app.clone().oneshot(list_req).await.expect("call swarms list");
        assert_eq!(list_resp.status(), StatusCode::OK);
        let list_body = to_bytes(list_resp.into_body(), usize::MAX)
            .await
            .expect("read swarms list body");
        let list_json: serde_json::Value =
            serde_json::from_slice(&list_body).expect("parse swarms list json");
        let list = list_json.as_array().expect("swarms list should be array");
        assert!(!list.is_empty());

        let official = list
            .iter()
            .find(|item| item["sourceType"] == "official")
            .expect("official swarm exists");
        let official_id = official["id"]
            .as_str()
            .expect("official id should be string")
            .to_string();
        assert!(official_id.starts_with("official::"));
        assert!(is_official_swarm_id(&official_id));

        if db_dir.exists() {
            let _ = std::fs::remove_dir_all(db_dir);
        }
    }

    #[test]
    fn build_template_summary_should_apply_defaults() {
        let manifest = TemplateManifestFile {
            schema_version: Some(TEMPLATE_SCHEMA_VERSION.to_string()),
            id: "demo".to_string(),
            name: "Demo".to_string(),
            description: None,
            category: None,
            phase: None,
            icon: None,
            source: None,
            variables: None,
            files: None,
            env_example: None,
            runtimes: None,
            agent_packs: None,
            skills: None,
            defaults: None,
            recommended_swarms: Some(vec![TemplateRecommendedSwarmFile {
                id: Some("swarm-a".to_string()),
            }]),
            post_clone_script: None,
        };
        let summary = build_template_summary(
            &manifest,
            TemplateSummaryDefaults {
                source_repo_url: DEFAULT_TEMPLATE_SOURCE_REPO.to_string(),
                template_path: "templates/demo-template".to_string(),
                source_ref: DEFAULT_TEMPLATE_SOURCE_REF.to_string(),
                source_version: Some("test-version".to_string()),
            },
        );
        assert_eq!(summary.template_path, "templates/demo-template");
        assert_eq!(summary.source_ref, DEFAULT_TEMPLATE_SOURCE_REF);
        assert_eq!(summary.source_version, Some("test-version".to_string()));
        assert_eq!(summary.recommended_swarm_ids, vec!["swarm-a".to_string()]);
        assert_eq!(summary.phase, 1);
        assert_eq!(summary.category, "general");
    }
}
