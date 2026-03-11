// F3: Agent Execution Commands
// Tauri 命令 - Agent 执行相关的 IPC 接口

use crate::process::agent_manager::AgentProcessManager;
use log::info;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, State};

// ============ 数据类型 ============

/// Agent 信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub capabilities: Vec<String>,
    pub is_available: bool,
}

/// 启动 Agent 的请求参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartAgentRequest {
    pub workspace_id: String,
    pub working_dir: String,
    pub agent_name: String,
    pub env_vars: Option<HashMap<String, String>>,
    pub prompt: String,
}

/// 发送 Prompt 的请求参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendPromptRequest {
    pub workspace_id: String,
    pub prompt: String,
}

/// 发送 Follow-up 的请求参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendFollowUpRequest {
    pub workspace_id: String,
    pub session_id: String,
    pub prompt: String,
    pub model: Option<String>,
}

/// Agent 状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStatus {
    pub workspace_id: String,
    pub is_running: bool,
    pub session_id: Option<String>,
}

// ============ Tauri Commands ============

/// 启动 Agent 执行
#[tauri::command]
pub async fn start_agent_execution(
    request: StartAgentRequest,
    process_manager: State<'_, AgentProcessManager>,
    app_handle: AppHandle,
) -> Result<String, String> {
    info!(
        "Starting agent execution for workspace: {}",
        request.workspace_id
    );

    let working_dir = PathBuf::from(&request.working_dir);
    let env_vars = request.env_vars.unwrap_or_default();

    // 启动 agent
    let session_id = process_manager
        .start_agent(
            request.workspace_id.clone(),
            working_dir,
            request.agent_name,
            env_vars,
            &request.prompt,
            None, // model - use default
            None, // session_id
            None, // process_id
        )
        .await?;

    // 启动事件转发任务
    let workspace_id = request.workspace_id.clone();
    let mut rx = process_manager.subscribe();
    
    tokio::spawn(async move {
        while let Ok(event) = rx.recv().await {
            if event.workspace_id == workspace_id {
                // 发送到前端
                if let Err(e) = app_handle.emit(&format!("agent:execution:{}", workspace_id), &event.entry) {
                    log::error!("Failed to emit event: {}", e);
                }
            }
        }
    });

    Ok(session_id)
}

/// 发送 Prompt
#[tauri::command]
pub async fn send_agent_prompt(
    request: SendPromptRequest,
    process_manager: State<'_, AgentProcessManager>,
) -> Result<(), String> {
    info!(
        "Sending prompt to workspace: {}",
        request.workspace_id
    );

    process_manager
        .send_prompt(&request.workspace_id, &request.prompt)
        .await
}

/// 发送 Follow-up
#[tauri::command]
pub async fn send_agent_follow_up(
    request: SendFollowUpRequest,
    process_manager: State<'_, AgentProcessManager>,
) -> Result<(), String> {
    info!(
        "Sending follow-up to workspace {}, session {}",
        request.workspace_id, request.session_id
    );

    // Generate a process ID for this follow-up (used for status tracking)
    let process_id = uuid::Uuid::new_v4().to_string();
    let model = request.model.as_deref();

    process_manager
        .send_follow_up(&request.workspace_id, &request.session_id, &process_id, &request.prompt, model)
        .await
}

/// 停止 Agent 执行
#[tauri::command]
pub async fn stop_agent_execution(
    workspace_id: String,
    process_manager: State<'_, AgentProcessManager>,
) -> Result<(), String> {
    info!("Stopping agent for workspace: {}", workspace_id);

    process_manager.stop_agent(&workspace_id).await
}

/// 获取 Agent 状态
#[tauri::command]
pub async fn get_agent_status(
    workspace_id: String,
    process_manager: State<'_, AgentProcessManager>,
) -> Result<AgentStatus, String> {
    let is_running = process_manager.is_agent_running(&workspace_id).await;

    Ok(AgentStatus {
        workspace_id,
        is_running,
        session_id: None, // TODO: 从 manager 获取
    })
}

/// 获取所有活跃的 Agents
#[tauri::command]
pub async fn get_active_agents(
    process_manager: State<'_, AgentProcessManager>,
) -> Result<Vec<String>, String> {
    Ok(process_manager.get_active_workspaces().await)
}

/// 获取所有可用的 Agent 列表
#[tauri::command]
pub fn get_available_agents() -> Vec<AgentInfo> {
    let agents: Vec<(String, String, String, Vec<String>)> = vec![
        (
            "opencode".to_string(),
            "OpenCode".to_string(),
            "OpenCode AI 编程助手".to_string(),
            vec!["session_fork".to_string(), "context_usage".to_string()],
        ),
        (
            "claude".to_string(),
            "Claude".to_string(),
            "Anthropic Claude Code".to_string(),
            vec!["session_fork".to_string(), "context_usage".to_string()],
        ),
        (
            "cursor".to_string(),
            "Cursor".to_string(),
            "AI 驱动的代码编辑器".to_string(),
            vec!["setup_helper".to_string()],
        ),
        (
            "qwen".to_string(),
            "Qwen".to_string(),
            "阿里云通义千问".to_string(),
            vec!["session_fork".to_string()],
        ),
        (
            "copilot".to_string(),
            "Copilot".to_string(),
            "GitHub Copilot".to_string(),
            vec![],
        ),
        (
            "droid".to_string(),
            "Droid".to_string(),
            "Google AI for Android".to_string(),
            vec![],
        ),
        (
            "gemini".to_string(),
            "Gemini".to_string(),
            "Google Gemini".to_string(),
            vec!["session_fork".to_string()],
        ),
        (
            "amp".to_string(),
            "Amp".to_string(),
            " Anthropic AMP".to_string(),
            vec!["session_fork".to_string()],
        ),
    ];

    agents
        .into_iter()
        .map(|(id, name, description, capabilities)| {
            // 检查可用性
            let is_available = check_agent_availability(&id);
            AgentInfo {
                id,
                name,
                description,
                capabilities,
                is_available,
            }
        })
        .collect()
}

/// 检查 Agent 是否可用（已安装）
fn check_agent_availability(agent_id: &str) -> bool {
    // 简单检查：agent 的可执行文件是否在 PATH 中
    // 实际应该调用 bee_executor 的 get_availability_info 方法
    match agent_id {
        "opencode" => which::which("opencode").is_ok(),
        "claude" => which::which("claude").is_ok() || which::which("claude-code").is_ok(),
        "cursor" => which::which("cursor").is_ok(),
        "qwen" => which::which("qwen").is_ok() || which::which("qwen-code").is_ok(),
        "copilot" => which::which("copilot").is_ok(),
        "droid" => which::which("droid").is_ok(),
        "gemini" => which::which("gemini").is_ok(),
        "amp" => which::which("amp").is_ok(),
        _ => false,
    }
}
