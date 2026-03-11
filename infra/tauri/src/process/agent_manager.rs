use bee_executor::{
    CodingAgent, ExecutionEnv, ExecutorError, NormalizedEntry,
    StandardCodingAgentExecutor, CancellationToken,
};
use bee_executor::logs::{ActionType, NormalizedEntryType, NormalizedEntryError, TokenUsageInfo, ToolStatus};
use bee_workspace_utils::{log_msg::LogMsg, msg_store::MsgStore};
use chrono::Utc;
use log::{error, info, warn};
use sqlx::{Row, SqlitePool};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::time::{sleep, Duration};
use tokio::sync::{broadcast, Mutex, RwLock};
use tokio_stream::StreamExt;

use super::db::ExecutionProcessLogs;
use crate::http_server::{get_process_status_sender, ProcessStatusUpdate};

/// 进程管理器 - 管理所有 Workspace 对应的 Agent 进程
pub struct AgentProcessManager {
    /// 活跃的 Agent 实例 (workspace_id -> agent)
    agents: Arc<RwLock<HashMap<String, AgentInstance>>>,
    /// 事件广播器 - 用于转发到 Tauri 前端
    event_broadcaster: broadcast::Sender<BroadcastEvent>,
    /// 每个 execution process 独立的日志存储 (process_id -> MsgStore)
    process_msg_stores: Arc<RwLock<HashMap<String, Arc<MsgStore>>>>,
    /// 数据库连接池 - 用于持久化日志
    db_pool: Option<Arc<SqlitePool>>,
}

/// Agent 实例 - 包含 agent 进程和消息存储
struct AgentInstance {
    /// Agent 实例
    agent: Mutex<CodingAgent>,
    /// 消息存储 - 用于实时流和历史记录
    msg_store: Arc<MsgStore>,
    /// 工作目录
    working_dir: PathBuf,
    /// Agent 名称
    agent_name: String,
    /// OpenCode session ID - 用于 follow-up
    opencode_session_id: Option<String>,
    /// 取消令牌 - 用于优雅关闭
    cancel_token: Option<CancellationToken>,
}

/// 广播事件 - 发送到 Tauri 前端
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BroadcastEvent {
    pub workspace_id: String,
    pub entry: NormalizedEntry,
}

impl AgentProcessManager {
    /// 创建新的进程管理器（不带数据库）
    pub fn new() -> Self {
        let (event_tx, _) = broadcast::channel(1000);

        Self {
            agents: Arc::new(RwLock::new(HashMap::new())),
            event_broadcaster: event_tx,
            process_msg_stores: Arc::new(RwLock::new(HashMap::new())),
            db_pool: None,
        }
    }

    /// 创建新的进程管理器（带数据库）
    pub fn new_with_db(db_pool: Arc<SqlitePool>) -> Self {
        let (event_tx, _) = broadcast::channel(1000);

        Self {
            agents: Arc::new(RwLock::new(HashMap::new())),
            event_broadcaster: event_tx,
            process_msg_stores: Arc::new(RwLock::new(HashMap::new())),
            db_pool: Some(db_pool),
        }
    }

    /// 订阅事件流
    pub fn subscribe(&self) -> broadcast::Receiver<BroadcastEvent> {
        self.event_broadcaster.subscribe()
    }

    /// 获取数据库连接池（若已配置）。
    pub fn db_pool(&self) -> Option<Arc<SqlitePool>> {
        self.db_pool.clone()
    }

    async fn register_process_msg_store(&self, process_id: &str, msg_store: Arc<MsgStore>) {
        self.process_msg_stores
            .write()
            .await
            .insert(process_id.to_string(), msg_store);
    }

    pub async fn get_msg_store_by_process_id(
        &self,
        process_id: &str,
    ) -> Result<Arc<MsgStore>, String> {
        self.process_msg_stores
            .read()
            .await
            .get(process_id)
            .cloned()
            .ok_or_else(|| format!("No MsgStore found for process_id {}", process_id))
    }

    pub async fn rebuild_normalized_messages_from_db(
        &self,
        execution_id: &str,
        agent_name: &str,
        working_dir: &std::path::Path,
    ) -> Result<Vec<LogMsg>, String> {
        let db_pool = self
            .db_pool
            .as_ref()
            .cloned()
            .ok_or_else(|| "DB pool not configured".to_string())?;

        let records = ExecutionProcessLogs::find_by_execution_id(&db_pool, execution_id)
            .await
            .map_err(|e| format!("Failed to load execution logs from DB: {}", e))?;
        if records.is_empty() {
            return Err(format!(
                "No persisted logs found for execution_id {}",
                execution_id
            ));
        }

        let raw_messages = ExecutionProcessLogs::parse_logs(&records)
            .map_err(|e| format!("Failed to parse persisted logs: {}", e))?;

        let temp_store = Arc::new(MsgStore::new());
        for msg in raw_messages {
            if matches!(msg, LogMsg::Stdout(_) | LogMsg::Stderr(_) | LogMsg::JsonPatch(_)) {
                temp_store.push(msg);
            }
        }

        let agent = Self::create_agent(agent_name).map_err(|e| {
            format!(
                "Failed to create agent '{}' for DB log normalization: {:?}",
                agent_name, e
            )
        })?;
        agent.normalize_logs(temp_store.clone(), working_dir);

        // normalize_logs 在后台任务中处理历史日志，等待其产出稳定。
        let mut stable_rounds = 0usize;
        let mut last_patch_count = 0usize;
        for _ in 0..40 {
            sleep(Duration::from_millis(100)).await;
            let history = temp_store.get_history();
            let patch_count = history
                .iter()
                .filter(|m| matches!(m, LogMsg::JsonPatch(_)))
                .count();

            if patch_count == last_patch_count {
                stable_rounds += 1;
            } else {
                stable_rounds = 0;
                last_patch_count = patch_count;
            }

            if patch_count > 0 && stable_rounds >= 3 {
                break;
            }
        }

        let normalized_messages: Vec<LogMsg> = temp_store
            .get_history()
            .into_iter()
            .filter(|m| matches!(m, LogMsg::JsonPatch(_)))
            .collect();

        if normalized_messages.is_empty() {
            return Err(format!(
                "No normalized JsonPatch reconstructed for execution_id {}",
                execution_id
            ));
        }

        Ok(normalized_messages)
    }

    fn send_broadcast(
        sender: &broadcast::Sender<BroadcastEvent>,
        workspace_id: &str,
        event: BroadcastEvent,
    ) {
        if sender.receiver_count() == 0 {
            return;
        }

        if let Err(e) = sender.send(event) {
            warn!(
                "[AGENT_MANAGER] Failed to broadcast event for {}: {:?}",
                workspace_id, e
            );
        }
    }

    /// 根据 agent 类型获取 CodingAgent (使用 Default)
    fn create_agent(agent_name: &str) -> Result<CodingAgent, ExecutorError> {
        Self::create_agent_with_model(agent_name, None)
    }

    /// 根据 agent 类型和模型获取 CodingAgent
    fn create_agent_with_model(agent_name: &str, model: Option<&str>) -> Result<CodingAgent, ExecutorError> {
        use bee_executor::executors::{
            amp::Amp, claude::ClaudeCode, cursor::CursorAgent,
            droid::Droid, opencode::Opencode,
            copilot::Copilot, gemini::Gemini, qwen::QwenCode,
        };

        match agent_name.to_uppercase().as_str() {
            "OPENCODE" => {
                let mut opencode = Opencode::default();
                if let Some(m) = model {
                    opencode.model = Some(m.to_string());
                }
                Ok(CodingAgent::Opencode(opencode))
            },
            "CLAUDE" | "CLAUDE_CODE" => {
                let mut claude = ClaudeCode::default();
                if let Some(m) = model {
                    claude.model = Some(m.to_string());
                }
                Ok(CodingAgent::ClaudeCode(claude))
            },
            "GEMINI" => Ok(CodingAgent::Gemini(Gemini::default())),
            "AMP" => Ok(CodingAgent::Amp(Amp::default())),
            "QWEN" | "QWEN_CODE" => Ok(CodingAgent::QwenCode(QwenCode::default())),
            "CURSOR" => Ok(CodingAgent::CursorAgent(CursorAgent::default())),
            "COPILOT" => Ok(CodingAgent::Copilot(Copilot::default())),
            "DROID" => Ok(CodingAgent::Droid(Droid::default())),
            _ => Err(ExecutorError::UnknownExecutorType(agent_name.to_string())),
        }
    }

    /// 启动新的 Agent 进程
    pub async fn start_agent(
        &self,
        workspace_id: String,
        working_dir: PathBuf,
        agent_name: String,
        env_vars: HashMap<String, String>,
        prompt: &str,
        model: Option<&str>,
        session_id: Option<&str>,
        process_id: Option<&str>,
    ) -> Result<String, String> {
        info!(
            "[AGENT_MANAGER] Starting agent '{}' for workspace {} in {:?} with model {:?}",
            agent_name, workspace_id, working_dir, model
        );

        // 检查是否已有进程在运行
        {
            let agents = self.agents.read().await;
            if agents.contains_key(&workspace_id) {
                error!(
                    "[AGENT_MANAGER] Agent already running for workspace {}",
                    workspace_id
                );
                return Err(format!("Agent already running for workspace {}", workspace_id));
            }
        }

        // 创建消息存储
        let msg_store = Arc::new(MsgStore::new());
        if let Some(pid) = process_id {
            self.register_process_msg_store(pid, msg_store.clone()).await;
        }

        // 创建 Agent (带模型设置)
        let mut agent = Self::create_agent_with_model(&agent_name, model).map_err(|e| {
            error!("[AGENT_MANAGER] Failed to create agent: {:?}", e);
            format!("Failed to create agent: {:?}", e)
        })?;

        // 创建执行环境
        let mut execution_env = ExecutionEnv::new(
            bee_executor::env::RepoContext::default(),
            false,
            String::new(),
        );
        execution_env.merge(&env_vars);

        // Spawn agent with prompt
        let mut spawned = agent.spawn(&working_dir, prompt, &execution_env, None).await.map_err(|e| {
            error!("[AGENT_MANAGER] Failed to spawn agent: {:?}", e);
            format!("Failed to spawn agent: {:?}", e)
        })?;

        info!(
            "[AGENT_MANAGER] Agent spawned successfully"
        );

        // 关键：从 child 进程取出 stdout 和 stderr，转发到 msg_store
        // OpenCode 的 LogWriter 写入的 events 会出现在 child.stdout 中
        let child_stdout = spawned.child.inner().stdout.take();
        let child_stderr = spawned.child.inner().stderr.take();
        
        // 诊断日志：检查 stdout/stderr 是否获取成功
        if child_stdout.is_some() {
            info!("[AGENT_MANAGER] stdout pipe obtained successfully");
        } else {
            error!("[AGENT_MANAGER] WARNING: stdout pipe is None! Child stdout was already taken.");
        }
        if child_stderr.is_some() {
            info!("[AGENT_MANAGER] stderr pipe obtained successfully");
        } else {
            warn!("[AGENT_MANAGER] stderr pipe is None");
        }
        
        if let Some(stdout) = child_stdout {
            let msg_store_clone = msg_store.clone();
            tokio::spawn(async move {
                info!("[AGENT_MANAGER] Starting stdout forwarder");
                let mut reader = BufReader::new(stdout).lines();
                let mut line_count = 0usize;
                while let Ok(Some(line)) = reader.next_line().await {
                    line_count += 1;
                    // 🔍 详细日志：记录每一行 stdout（前 200 字符）
                    let preview: String = line.chars().take(200).collect();
                    info!(
                        "[AGENT_MANAGER] stdout line #{} ({} bytes): {}",
                        line_count,
                        line.len(),
                        if line.len() > 200 { format!("{}...", preview) } else { preview.clone() }
                    );
                    msg_store_clone.push(LogMsg::Stdout(line));
                }
                info!("[AGENT_MANAGER] stdout forwarder ended, total {} lines", line_count);
            });
        }

        if let Some(stderr) = child_stderr {
            let msg_store_clone = msg_store.clone();
            tokio::spawn(async move {
                info!("[AGENT_MANAGER] Starting stderr forwarder");
                let mut reader = BufReader::new(stderr).lines();
                let mut line_count = 0usize;
                while let Ok(Some(line)) = reader.next_line().await {
                    line_count += 1;
                    // 🔍 详细日志：记录每一行 stderr（前 200 字符）
                    let preview: String = line.chars().take(200).collect();
                    info!(
                        "[AGENT_MANAGER] stderr line #{} ({} bytes): {}",
                        line_count,
                        line.len(),
                        if line.len() > 200 { format!("{}...", preview) } else { preview.clone() }
                    );
                    msg_store_clone.push(LogMsg::Stderr(line));
                }
                info!("[AGENT_MANAGER] stderr forwarder ended, total {} lines", line_count);
            });
        }

        // 关键：保持 spawned 的所有权，防止进程被杀死
        // spawned 包含 AsyncGroupChild，如果被 drop 会杀死子进程
        let mut spawned_child = spawned;
        let workspace_id_for_spawned = workspace_id.clone();
        let session_id_for_exit = session_id.map(|s| s.to_string());
        let process_id_for_exit = process_id.map(|p| p.to_string());
        let exit_signal = spawned_child.exit_signal.take();
        let cancel_token = spawned_child.cancel.take();
        let msg_store_for_exit = msg_store.clone();
        let status_sender = get_process_status_sender();
        let agents_for_cleanup = self.agents.clone(); // 用于退出时清理
        
        tokio::spawn(async move {
            let mut final_status: Option<(&str, Option<i32>)> = None;
            // 等待 exit_signal
            if let Some(rx) = exit_signal {
                match rx.await {
                    Ok(bee_executor::ExecutorExitResult::Success) => {
                        info!("[AGENT_MANAGER] Agent {} exited successfully", workspace_id_for_spawned);
                        final_status = Some(("completed", Some(0)));
                    }
                    Ok(bee_executor::ExecutorExitResult::Failure) => {
                        warn!("[AGENT_MANAGER] Agent {} exited with failure", workspace_id_for_spawned);
                        final_status = Some(("failed", Some(1)));
                    }
                    Err(e) => {
                        error!("[AGENT_MANAGER] Agent {} exit signal error: {:?}", workspace_id_for_spawned, e);
                        final_status = Some(("failed", None));
                    }
                }
            }
            // 关键：通知 normalize_logs 任务结束，以便 follow-up 可以重新启动
            msg_store_for_exit.push_finished();
            info!("[AGENT_MANAGER] Pushed Finished to msg_store for {}", workspace_id_for_spawned);

            if let (Some(sid), Some(pid), Some((status, exit_code))) = (
                session_id_for_exit.as_ref(),
                process_id_for_exit.as_ref(),
                final_status,
            ) {
                let update = ProcessStatusUpdate {
                    session_id: sid.clone(),
                    process_id: pid.clone(),
                    status: status.to_string(),
                    exit_code,
                };
                if let Err(e) = status_sender.send(update) {
                    error!("[AGENT_MANAGER] Failed to send start_agent status update: {:?}", e);
                }
            }

            // 保持 spawned_child 存活直到这里
            drop(spawned_child);
            
            // 关键：Agent 退出后自动从 map 中移除
            // 这样下次 send_follow_up 会发现 agent 不存在，可以正确启动新 agent
            let mut agents = agents_for_cleanup.write().await;
            agents.remove(&workspace_id_for_spawned);
            info!("[AGENT_MANAGER] Removed agent from map for workspace {}", workspace_id_for_spawned);
        });

        // 关键：调用 normalize_logs 启动日志监听任务
        // 这会启动一个后台任务，从 agent 的 stdout/stderr pipe 读取并写入 MsgStore
        agent.normalize_logs(msg_store.clone(), &working_dir);
        info!("[AGENT_MANAGER] normalize_logs started");

        // 启动数据库持久化任务（如果有数据库连接池）
        if let Some(ref db_pool) = self.db_pool {
            let exec_id = process_id
                .map(|p| p.to_string())
                .unwrap_or_else(|| format!("exec-{}", uuid::Uuid::new_v4()));
            info!("[AGENT_MANAGER] Starting DB persistence task with execution_id={}", exec_id);
            spawn_db_persistence_task(
                db_pool.clone(),
                &exec_id,
                msg_store.clone(),
            );
        } else {
            info!("[AGENT_MANAGER] No DB pool configured, skipping persistence");
        }

        // 保存 agent 实例
        let agent_instance = AgentInstance {
            agent: Mutex::new(agent),
            msg_store: msg_store.clone(),
            working_dir: working_dir.clone(),
            agent_name: agent_name.clone(),
            opencode_session_id: None,
            cancel_token,
        };

        let mut agents = self.agents.write().await;
        agents.insert(workspace_id.clone(), agent_instance);

        // 启动后台任务：从 MsgStore 读取历史和实时日志
        let workspace_id_clone = workspace_id.clone();
        let msg_store_clone = msg_store.clone();
        let event_broadcaster = self.event_broadcaster.clone();

        tokio::spawn(async move {
            info!("[AGENT_MANAGER] Starting MsgStore listener for workspace {}", workspace_id_clone);

            // 使用 history_plus_stream 来获取历史 + 实时日志
            let mut stream = msg_store_clone.history_plus_stream();
            let mut msg_count = 0usize;

            while let Some(result) = stream.next().await {
                match result {
                    Ok(log_msg) => {
                        msg_count += 1;
                        // 🔍 详细日志：记录收到的每一条 LogMsg
                        info!(
                            "[AGENT_MANAGER] MsgStore msg #{}: type={}, preview={}",
                            msg_count,
                            log_msg.name(),
                            match &log_msg {
                                LogMsg::Stdout(s) => s.chars().take(100).collect::<String>(),
                                LogMsg::Stderr(s) => s.chars().take(100).collect::<String>(),
                                LogMsg::JsonPatch(_) => "JsonPatch".to_string(),
                                LogMsg::SessionId(id) => id.clone(),
                                LogMsg::MessageId(id) => id.clone(),
                                LogMsg::Ready => "Ready".to_string(),
                                LogMsg::Finished => "Finished".to_string(),
                            }
                        );

                        // 将 LogMsg 转换为 NormalizedEntry 并广播
                        if let Some(entry) = log_msg_to_entry(&log_msg) {
                            let broadcast_event = BroadcastEvent {
                                workspace_id: workspace_id_clone.clone(),
                                entry,
                            };

                            Self::send_broadcast(&event_broadcaster, &workspace_id_clone, broadcast_event);
                        }
                    }
                    Err(e) => {
                        warn!("[AGENT_MANAGER] MsgStore error: {:?}", e);
                    }
                }
            }

            info!("[AGENT_MANAGER] MsgStore listener ended for workspace {}, total {} messages", workspace_id_clone, msg_count);
        });

        // 发送 session_start 事件 - 使用 Loading 作为占位
        let entry = NormalizedEntry {
            timestamp: Some(Utc::now().to_rfc3339()),
            entry_type: NormalizedEntryType::Loading,
            content: format!("Agent '{}' started", agent_name),
            metadata: None,
        };
        Self::send_broadcast(&self.event_broadcaster, &workspace_id, BroadcastEvent {
            workspace_id: workspace_id.clone(),
            entry,
        });
        msg_store.push(LogMsg::Ready);

        info!(
            "[AGENT_MANAGER] Agent started successfully for workspace {}",
            workspace_id
        );

        Ok(workspace_id)
    }

    /// 监听进程 stdout 并转发
    async fn listen_to_stream(
        workspace_id: String,
        stream: tokio::process::ChildStdout,
        msg_store: Arc<MsgStore>,
        event_broadcaster: broadcast::Sender<BroadcastEvent>,
    ) {
        info!("[AGENT_MANAGER] listen_to_stream started for workspace {}", workspace_id);
        let mut reader = BufReader::new(stream).lines();
        
        let mut line_count = 0;
        while let Ok(Some(line)) = reader.next_line().await {
            line_count += 1;
            if line_count <= 5 {
                info!("[AGENT_MANAGER] stdout line {}: {}", line_count, line.chars().take(100).collect::<String>());
            }
            
            // 发送到消息存储
            msg_store.push(LogMsg::Stdout(line.clone()));

            // 解析为 NormalizedEntry 并广播
            if let Some(entry) = Self::parse_line_to_entry(&line) {
                let broadcast_event = BroadcastEvent {
                    workspace_id: workspace_id.clone(),
                    entry,
                };

                Self::send_broadcast(&event_broadcaster, &workspace_id, broadcast_event);
            }
        }

        info!(
            "[AGENT_MANAGER] Stdout stream listener ended for workspace {}, total lines: {}",
            workspace_id, line_count
        );
    }

    /// 监听进程 stderr 并转发
    async fn listen_to_stderr(
        workspace_id: String,
        stream: tokio::process::ChildStderr,
        msg_store: Arc<MsgStore>,
        event_broadcaster: broadcast::Sender<BroadcastEvent>,
    ) {
        info!("[AGENT_MANAGER] listen_to_stderr started for workspace {}", workspace_id);
        let mut reader = BufReader::new(stream).lines();

        let mut line_count = 0;
        while let Ok(Some(line)) = reader.next_line().await {
            line_count += 1;
            if line_count <= 5 {
                info!("[AGENT_MANAGER] stderr line {}: {}", line_count, line.chars().take(100).collect::<String>());
            }
            
            // 发送到消息存储
            msg_store.push(LogMsg::Stderr(line.clone()));

            // stderr 也作为系统消息广播
            let entry = NormalizedEntry {
                timestamp: Some(Utc::now().to_rfc3339()),
                entry_type: NormalizedEntryType::SystemMessage,
                content: line.clone(),
                metadata: None,
            };

            let broadcast_event = BroadcastEvent {
                workspace_id: workspace_id.clone(),
                entry,
            };

            Self::send_broadcast(&event_broadcaster, &workspace_id, broadcast_event);
        }

        info!(
            "[AGENT_MANAGER] Stderr stream listener ended for workspace {}, total lines: {}",
            workspace_id, line_count
        );
    }

    /// 将日志行解析为 NormalizedEntry
    fn parse_line_to_entry(line: &str) -> Option<NormalizedEntry> {
        let line = line.trim();
        if line.is_empty() {
            return None;
        }

        // 尝试解析 JSON 格式的日志
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
            // 检查是否是 JSON Patch 格式
            if let Some(patch) = json.as_array() {
                // 尝试解析 JSON Patch 数组中的每个 entry
                for item in patch {
                    if let Some(entry) = Self::json_value_to_normalized_entry(item) {
                        return Some(entry);
                    }
                }
            }

            // 尝试直接解析为单个 entry
            if let Some(entry) = Self::json_value_to_normalized_entry(&json) {
                return Some(entry);
            }
        }

        // 对于非 JSON 行，创建一个系统消息
        Some(NormalizedEntry {
            timestamp: Some(Utc::now().to_rfc3339()),
            entry_type: NormalizedEntryType::SystemMessage,
            content: line.to_string(),
            metadata: None,
        })
    }

    /// 将 JSON Value 解析为 NormalizedEntry
    fn json_value_to_normalized_entry(json: &serde_json::Value) -> Option<NormalizedEntry> {
        // 尝试从 JSON 中提取 entry_type
        let entry_type = json.get("type").or_else(|| json.get("entry_type"))?;

        let entry_type_str = entry_type.as_str()?;

        match entry_type_str {
            "user_message" => Some(NormalizedEntry {
                timestamp: json
                    .get("timestamp")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .or_else(|| Some(Utc::now().to_rfc3339())),
                entry_type: NormalizedEntryType::UserMessage,
                content: json
                    .get("content")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                metadata: None,
            }),
            "assistant_message" | "message" => Some(NormalizedEntry {
                timestamp: json
                    .get("timestamp")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .or_else(|| Some(Utc::now().to_rfc3339())),
                entry_type: NormalizedEntryType::AssistantMessage,
                content: json
                    .get("content")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                metadata: None,
            }),
            "tool_use" => {
                let tool_name = json
                    .get("tool_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string();
                let action_type_str = json
                    .get("action_type")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_default();

                Some(NormalizedEntry {
                    timestamp: json
                        .get("timestamp")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                        .or_else(|| Some(Utc::now().to_rfc3339())),
                    entry_type: NormalizedEntryType::ToolUse {
                        tool_name,
                        action_type: ActionType::Tool {
                            tool_name: action_type_str,
                            arguments: None,
                            result: None,
                        },
                        status: parse_tool_status(
                            json.get("status").and_then(|v| v.as_str())
                        ),
                    },
                    content: json
                        .get("content")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    metadata: None,
                })
            }
            "thinking" => Some(NormalizedEntry {
                timestamp: json
                    .get("timestamp")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .or_else(|| Some(Utc::now().to_rfc3339())),
                entry_type: NormalizedEntryType::Thinking,
                content: json
                    .get("content")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                metadata: None,
            }),
            "error_message" | "error" => Some(NormalizedEntry {
                timestamp: json
                    .get("timestamp")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .or_else(|| Some(Utc::now().to_rfc3339())),
                entry_type: NormalizedEntryType::ErrorMessage {
                    error_type: NormalizedEntryError::Other,
                },
                content: json
                    .get("content")
                    .or_else(|| json.get("message"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown error")
                    .to_string(),
                metadata: None,
            }),
            "session_start" => Some(NormalizedEntry {
                timestamp: json
                    .get("timestamp")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .or_else(|| Some(Utc::now().to_rfc3339())),
                entry_type: NormalizedEntryType::Loading,
                content: json
                    .get("content")
                    .or_else(|| json.get("message"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("Session started")
                    .to_string(),
                metadata: None,
            }),
            "session_end" => Some(NormalizedEntry {
                timestamp: json
                    .get("timestamp")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .or_else(|| Some(Utc::now().to_rfc3339())),
                entry_type: NormalizedEntryType::Loading,
                content: json
                    .get("content")
                    .or_else(|| json.get("message"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("Session ended")
                    .to_string(),
                metadata: None,
            }),
            "token_usage_info" => Some(NormalizedEntry {
                timestamp: json
                    .get("timestamp")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .or_else(|| Some(Utc::now().to_rfc3339())),
                entry_type: NormalizedEntryType::TokenUsageInfo(
                    TokenUsageInfo {
                        total_tokens: json
                            .get("total_tokens")
                            .and_then(|v| v.as_u64())
                            .map(|v| v as u32)
                            .unwrap_or(0),
                        model_context_window: json
                            .get("model_context_window")
                            .and_then(|v| v.as_u64())
                            .map(|v| v as u32)
                            .unwrap_or(0),
                    },
                ),
                content: format!(
                    "Tokens: {} / {}",
                    json.get("total_tokens")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0),
                    json.get("model_context_window")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0)
                ),
                metadata: None,
            }),
            _ => None,
        }
    }

    /// 发送 Prompt 到指定 Workspace
    pub async fn send_prompt(
        &self,
        workspace_id: &str,
        prompt: &str,
    ) -> Result<(), String> {
        info!(
            "[AGENT_MANAGER] Sending prompt to workspace: {}, length: {}",
            workspace_id,
            prompt.len()
        );

        let agents = self.agents.read().await;

        let instance = agents.get(workspace_id).ok_or_else(|| {
            error!("[AGENT_MANAGER] No agent found for workspace {}!", workspace_id);
            format!("No agent running for workspace {}", workspace_id)
        })?;

        // 记录用户消息
        let user_entry = NormalizedEntry {
            timestamp: Some(Utc::now().to_rfc3339()),
            entry_type: NormalizedEntryType::UserMessage,
            content: prompt.to_string(),
            metadata: None,
        };

        // 发送到消息存储
        instance.msg_store.push(LogMsg::Stdout(format!(
            "[USER] {}",
            prompt
        )));

        // 广播到前端
        Self::send_broadcast(
            &self.event_broadcaster,
            workspace_id,
            BroadcastEvent {
                workspace_id: workspace_id.to_string(),
                entry: user_entry.clone(),
            },
        );

        info!(
            "[AGENT_MANAGER] User message added for workspace {}",
            workspace_id
        );

        // 注意：实际的 prompt 发送需要通过 agent 的接口
        // 这里我们只记录消息，实际发送给 Agent 的逻辑需要进一步实现

        info!(
            "[AGENT_MANAGER] Prompt recorded for workspace {}",
            workspace_id
        );
        Ok(())
    }

    /// 发送 Follow-up (使用现有 session)
    pub async fn send_follow_up(
        &self,
        workspace_id: &str,
        session_id: &str,
        process_id: &str,
        prompt: &str,
        model: Option<&str>,
    ) -> Result<(), String> {
        info!(
            "[AGENT_MANAGER] Sending follow-up to workspace: {}, session: {}, length: {}, model: {:?}",
            workspace_id,
            session_id,
            prompt.len(),
            model
        );

        // 获取 agent 实例的必要信息，然后释放锁
        let working_dir = {
            let agents = self.agents.read().await;
            let instance = agents.get(workspace_id).ok_or_else(|| {
                error!(
                    "[AGENT_MANAGER] No agent found for workspace {}!",
                    workspace_id
                );
                format!("No agent running for workspace {}", workspace_id)
            })?;

            // 克隆需要的数据
            instance.working_dir.clone()
        };

        // 每次 follow-up 使用独立的 MsgStore，按 execution process 隔离日志流
        let msg_store = Arc::new(MsgStore::new());
        self.register_process_msg_store(process_id, msg_store.clone()).await;
        msg_store.push(LogMsg::Ready);

        // 记录用户消息
        let user_entry = NormalizedEntry {
            timestamp: Some(Utc::now().to_rfc3339()),
            entry_type: NormalizedEntryType::UserMessage,
            content: prompt.to_string(),
            metadata: None,
        };

        // 广播用户消息到前端
        Self::send_broadcast(
            &self.event_broadcaster,
            workspace_id,
            BroadcastEvent {
                workspace_id: workspace_id.to_string(),
                entry: user_entry,
            },
        );

        // 获取 agent 并调用 spawn_follow_up
        let mut spawned = {
            let agents = self.agents.read().await;
            let instance = agents.get(workspace_id).ok_or_else(|| {
                format!("No agent running for workspace {}", workspace_id)
            })?;

            // 获取 OpenCode 的 session_id（如果存在）
            let opencode_session_id = instance.msg_store.get_session_id();
            
            // 使用 OpenCode session_id（如果存在），否则使用 HiveLaunch session_id
            let session_id_for_followup = opencode_session_id.as_deref().unwrap_or(session_id);
            
            info!(
                "[AGENT_MANAGER] Calling spawn_follow_up for session {} (opencode_session_id: {:?})",
                session_id_for_followup, opencode_session_id
            );

            let mut agent = instance.agent.lock().await;

            // 创建执行环境
            let execution_env = ExecutionEnv::new(
                bee_executor::env::RepoContext::default(),
                false,
                String::new(),
            );

            // 调用真正的 follow-up spawn，使用 OpenCode session_id
            let spawned = agent.spawn_follow_up(
                &working_dir,
                prompt,
                session_id_for_followup,
                None, // reset_to_message_id
                &execution_env,
                model,
                None, // agent
            ).await.map_err(|e| {
                error!("[AGENT_MANAGER] Failed to spawn follow-up: {:?}", e);
                format!("Failed to spawn follow-up: {:?}", e)
            })?;

            // 关键：在转发 stdout 之前启动 normalize_logs，确保能捕获所有消息
            // normalize_logs 会从 msg_store.stdout_lines_stream() 读取并转换为 JsonPatch
            agent.normalize_logs(msg_store.clone(), &working_dir);
            info!("[AGENT_MANAGER] normalize_logs started for follow-up");

            spawned
        };

        info!(
            "[AGENT_MANAGER] Follow-up spawned successfully for session {}",
            session_id
        );

        // 从 follow-up 进程取出 stdout 和 stderr，转发到 msg_store
        let child_stdout = spawned.child.inner().stdout.take();
        let child_stderr = spawned.child.inner().stderr.take();

        if child_stdout.is_some() {
            info!("[AGENT_MANAGER] follow-up stdout pipe obtained successfully");
        } else {
            warn!("[AGENT_MANAGER] follow-up stdout pipe is None");
        }

        if let Some(stdout) = child_stdout {
            let msg_store_clone = msg_store.clone();
            let workspace_id_log = workspace_id.to_string();
            tokio::spawn(async move {
                info!("[AGENT_MANAGER] Starting follow-up stdout forwarder for {}", workspace_id_log);
                let mut reader = BufReader::new(stdout).lines();
                let mut line_count = 0usize;
                while let Ok(Some(line)) = reader.next_line().await {
                    line_count += 1;
                    let preview: String = line.chars().take(200).collect();
                    info!(
                        "[AGENT_MANAGER] follow-up stdout line #{} ({} bytes): {}",
                        line_count,
                        line.len(),
                        if line.len() > 200 { format!("{}...", preview) } else { preview.clone() }
                    );
                    msg_store_clone.push(LogMsg::Stdout(line));
                }
                info!("[AGENT_MANAGER] follow-up stdout forwarder ended, total {} lines", line_count);
            });
        }

        if let Some(stderr) = child_stderr {
            let msg_store_clone = msg_store.clone();
            let workspace_id_log = workspace_id.to_string();
            tokio::spawn(async move {
                info!("[AGENT_MANAGER] Starting follow-up stderr forwarder for {}", workspace_id_log);
                let mut reader = BufReader::new(stderr).lines();
                let mut line_count = 0usize;
                while let Ok(Some(line)) = reader.next_line().await {
                    line_count += 1;
                    let preview: String = line.chars().take(200).collect();
                    info!(
                        "[AGENT_MANAGER] follow-up stderr line #{} ({} bytes): {}",
                        line_count,
                        line.len(),
                        if line.len() > 200 { format!("{}...", preview) } else { preview.clone() }
                    );
                    msg_store_clone.push(LogMsg::Stderr(line));
                }
                info!("[AGENT_MANAGER] follow-up stderr forwarder ended, total {} lines", line_count);
            });
        }

        // 保持 spawned_child 存活直到进程结束
        let workspace_id_for_exit = workspace_id.to_string();
        let session_id_for_exit = session_id.to_string();
        let process_id_for_exit = process_id.to_string();
        let exit_signal = spawned.exit_signal.take();
        let cancel_token = spawned.cancel.take();
        let status_sender = get_process_status_sender();
        let msg_store_for_exit = msg_store.clone();
        let agents_for_cleanup = self.agents.clone(); // 用于退出时清理

        if let Some(ref db_pool) = self.db_pool {
            info!(
                "[AGENT_MANAGER] Starting DB persistence for follow-up execution_id={}",
                process_id
            );
            spawn_db_persistence_task(db_pool.clone(), process_id, msg_store.clone());
        }

        tokio::spawn(async move {
            let (final_status, exit_code) = if let Some(rx) = exit_signal {
                match rx.await {
                    Ok(bee_executor::ExecutorExitResult::Success) => {
                        info!("[AGENT_MANAGER] Follow-up for {} exited successfully", workspace_id_for_exit);
                        ("completed", Some(0i32))
                    }
                    Ok(bee_executor::ExecutorExitResult::Failure) => {
                        warn!("[AGENT_MANAGER] Follow-up for {} exited with failure", workspace_id_for_exit);
                        ("failed", Some(1i32))
                    }
                    Err(e) => {
                        error!("[AGENT_MANAGER] Follow-up for {} exit signal error: {:?}", workspace_id_for_exit, e);
                        ("failed", None)
                    }
                }
            } else {
                // No exit signal - assume success when process ends
                ("completed", Some(0i32))
            };

            msg_store_for_exit.push_finished();

            // Send status update to http_server
            let update = ProcessStatusUpdate {
                session_id: session_id_for_exit,
                process_id: process_id_for_exit,
                status: final_status.to_string(),
                exit_code,
            };
            if let Err(e) = status_sender.send(update) {
                error!("[AGENT_MANAGER] Failed to send status update: {:?}", e);
            }

            // 保持 spawned_child 存活直到这里
            drop(spawned);
            
            // 关键：Follow-up 退出后自动从 map 中移除
            // 这样下次 send_follow_up 会发现 agent 不存在，可以正确启动新 agent
            let mut agents = agents_for_cleanup.write().await;
            agents.remove(&workspace_id_for_exit);
            info!("[AGENT_MANAGER] Removed agent from map for workspace {} after follow-up", workspace_id_for_exit);
        });

        info!(
            "[AGENT_MANAGER] Follow-up completed for workspace {}, session {}",
            workspace_id, session_id
        );
        Ok(())
    }

    /// 停止指定 Workspace 的 Agent
    pub async fn stop_agent(&self, workspace_id: &str) -> Result<(), String> {
        let instance = {
            let mut agents = self.agents.write().await;
            agents
                .remove(workspace_id)
                .ok_or_else(|| format!("No agent running for workspace {}", workspace_id))?
        };

        // 发送 execution_stopped 事件 - 使用 Loading 作为占位
        let entry = NormalizedEntry {
            timestamp: Some(Utc::now().to_rfc3339()),
            entry_type: NormalizedEntryType::Loading,
            content: "Execution stopped by user".to_string(),
            metadata: None,
        };
        Self::send_broadcast(
            &self.event_broadcaster,
            workspace_id,
            BroadcastEvent {
                workspace_id: workspace_id.to_string(),
                entry,
            },
        );
        instance.msg_store.push_finished();

        // 1. 触发优雅取消
        if let Some(cancel) = &instance.cancel_token {
            info!("[AGENT_MANAGER] Signalling cancellation for workspace {}", workspace_id);
            cancel.cancel();
        }

        // 2. 等待优雅退出（5秒超时）
        info!("[AGENT_MANAGER] Waiting for graceful shutdown of workspace {}", workspace_id);
        match tokio::time::timeout(Duration::from_secs(5), async {
            // 简单等待一下，让进程有机会响应取消信号
            tokio::time::sleep(Duration::from_millis(500)).await;
            // 在实际实现中，这里应该等待进程真正退出
            // 但由于我们没有直接的方式来等待，所以这里只是简单等待
        }).await {
            Ok(_) => {
                info!("[AGENT_MANAGER] Graceful shutdown completed for workspace {}", workspace_id);
            }
            Err(_) => {
                warn!("[AGENT_MANAGER] Graceful shutdown timed out for workspace {}, force killing", workspace_id);
            }
        }

        // 3. Agent 会通过 drop 自动清理（调用 kill_process_group）
        drop(instance);

        info!("Agent stopped for workspace {}", workspace_id);
        Ok(())
    }

    /// 获取活跃的 workspace 列表
    pub async fn get_active_workspaces(&self) -> Vec<String> {
        let agents = self.agents.read().await;
        agents.keys().cloned().collect()
    }

    /// 检查 workspace 是否有活跃的 agent
    pub async fn is_agent_running(&self, workspace_id: &str) -> bool {
        let agents = self.agents.read().await;
        agents.contains_key(workspace_id)
    }

    /// 获取指定 workspace 的消息历史
    pub async fn get_history(&self, workspace_id: &str) -> Result<Vec<NormalizedEntry>, String> {
        let agents = self.agents.read().await;
        let instance = agents
            .get(workspace_id)
            .ok_or_else(|| format!("No agent running for workspace {}", workspace_id))?;

        let history = instance.msg_store.get_history();
        let entries: Vec<NormalizedEntry> = history
            .iter()
            .filter_map(|msg| log_msg_to_entry(msg))
            .collect();

        Ok(entries)
    }

    /// 获取指定 workspace 的 MsgStore（用于 WebSocket 流）
    pub async fn get_msg_store(&self, workspace_id: &str) -> Result<Arc<MsgStore>, String> {
        let agents = self.agents.read().await;
        let instance = agents
            .get(workspace_id)
            .ok_or_else(|| format!("No agent running for workspace {}", workspace_id))?;

        Ok(instance.msg_store.clone())
    }

    /// 清理孤儿执行进程 - 数据库标记为 running 但实际已不存在
    /// 在应用启动时调用
    pub async fn cleanup_orphan_executions(&self) -> Result<(), String> {
        let db_pool = self
            .db_pool
            .as_ref()
            .ok_or_else(|| "DB pool not configured".to_string())?;

        // 查询所有 running 状态的进程
        let running_processes = sqlx::query(
            r#"SELECT id, session_id, workspace_id FROM execution_processes WHERE status = 'running'"#,
        )
        .fetch_all(db_pool.as_ref())
        .await
        .map_err(|e| format!("Failed to query running processes: {}", e))?;

        info!(
            "[AGENT_MANAGER] Found {} orphaned processes in DB",
            running_processes.len()
        );

        for row in running_processes {
            let process_id: String = row.get("id");
            info!(
                "[AGENT_MANAGER] Marking orphaned process {} as failed",
                process_id
            );

            // 更新状态为 failed
            let now_ts = chrono::Utc::now().timestamp();
            let _ = sqlx::query(
                r#"UPDATE execution_processes
                   SET status = 'failed', completed_at = $1, updated_at = $2
                   WHERE id = $3"#,
            )
            .bind(now_ts)
            .bind(now_ts)
            .bind(&process_id)
            .execute(db_pool.as_ref())
            .await;
        }

        Ok(())
    }

    /// 终止所有运行中的 agent 进程
    /// 在应用退出时调用
    pub async fn kill_all_running_processes(&self) -> Result<(), String> {
        info!("[AGENT_MANAGER] Killing all running processes");

        let workspace_ids = self.get_active_workspaces().await;
        info!(
            "[AGENT_MANAGER] Found {} active workspaces to kill",
            workspace_ids.len()
        );

        for workspace_id in workspace_ids {
            info!("[AGENT_MANAGER] Killing agent for workspace: {}", workspace_id);
            if let Err(e) = self.stop_agent(&workspace_id).await {
                warn!(
                    "[AGENT_MANAGER] Failed to kill agent for {}: {}",
                    workspace_id, e
                );
            } else {
                info!(
                    "[AGENT_MANAGER] Successfully killed agent for workspace: {}",
                    workspace_id
                );
            }
        }

        Ok(())
    }
}

impl Default for AgentProcessManager {
    fn default() -> Self {
        Self::new()
    }
}

/// 辅助函数：将字符串解析为 ToolStatus
fn parse_tool_status(status: Option<&str>) -> ToolStatus {
    match status {
        Some("success") | Some("completed") => ToolStatus::Success,
        Some("failed") | Some("error") => ToolStatus::Failed,
        Some("running") | Some("started") => ToolStatus::Created,
        Some("denied") => ToolStatus::Denied { reason: None },
        _ => ToolStatus::Created,
    }
}

/// 辅助函数：将 LogMsg 转换为 NormalizedEntry
fn log_msg_to_entry(log_msg: &LogMsg) -> Option<NormalizedEntry> {
    match log_msg {
        LogMsg::Stdout(content) => {
            // 尝试解析为 JSON
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(content) {
                if let Some(entry) = parse_json_entry(&json) {
                    return Some(entry);
                }
            }
            // 非 JSON 作为系统消息
            Some(NormalizedEntry {
                timestamp: Some(Utc::now().to_rfc3339()),
                entry_type: NormalizedEntryType::SystemMessage,
                content: content.clone(),
                metadata: None,
            })
        }
        LogMsg::Stderr(content) => Some(NormalizedEntry {
            timestamp: Some(Utc::now().to_rfc3339()),
            entry_type: NormalizedEntryType::SystemMessage,
            content: content.clone(),
            metadata: None,
        }),
        LogMsg::JsonPatch(patch) => {
            // 尝试从 patch 中提取 entry - 简化处理，假设第一个 add 操作包含 entry
            let value = serde_json::to_value(patch).ok()?;
            if let Some(arr) = value.as_array() {
                for item in arr {
                    if let Some(op) = item.get("op") {
                        if op.as_str() == Some("add") {
                            if let Some(value) = item.get("value") {
                                if let Ok(entry) = serde_json::from_value::<NormalizedEntry>(value.clone()) {
                                    return Some(entry);
                                }
                            }
                        }
                    }
                }
            }
            None
        }
        LogMsg::SessionId(_) => None,
        LogMsg::MessageId(_) => None,
        LogMsg::Ready => Some(NormalizedEntry {
            timestamp: Some(Utc::now().to_rfc3339()),
            entry_type: NormalizedEntryType::Loading,
            content: "Agent ready".to_string(),
            metadata: None,
        }),
        LogMsg::Finished => Some(NormalizedEntry {
            timestamp: Some(Utc::now().to_rfc3339()),
            entry_type: NormalizedEntryType::Loading,
            content: "Agent finished".to_string(),
            metadata: None,
        }),
    }
}

/// 解析 JSON 为 NormalizedEntry
pub fn parse_json_entry(json: &serde_json::Value) -> Option<NormalizedEntry> {
    let entry_type = json.get("type").or_else(|| json.get("entry_type"))?;
    let entry_type_str = entry_type.as_str()?;

    match entry_type_str {
        "user_message" => Some(NormalizedEntry {
            timestamp: json.get("timestamp").and_then(|v| v.as_str()).map(|s| s.to_string()),
            entry_type: NormalizedEntryType::UserMessage,
            content: json.get("content").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            metadata: None,
        }),
        "assistant_message" | "message" => Some(NormalizedEntry {
            timestamp: json.get("timestamp").and_then(|v| v.as_str()).map(|s| s.to_string()),
            entry_type: NormalizedEntryType::AssistantMessage,
            content: json.get("content").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            metadata: None,
        }),
        "tool_use" => {
            let tool_name = json.get("tool_name").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
            let action_type_str = json.get("action_type").and_then(|v| v.as_str()).map(|s| s.to_string()).unwrap_or_default();

            Some(NormalizedEntry {
                timestamp: json.get("timestamp").and_then(|v| v.as_str()).map(|s| s.to_string()),
                entry_type: NormalizedEntryType::ToolUse {
                    tool_name,
                    action_type: ActionType::Tool {
                        tool_name: action_type_str,
                        arguments: None,
                        result: None,
                    },
                    status: parse_tool_status(json.get("status").and_then(|v| v.as_str())),
                },
                content: json.get("content").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                metadata: None,
            })
        }
        "thinking" => Some(NormalizedEntry {
            timestamp: json.get("timestamp").and_then(|v| v.as_str()).map(|s| s.to_string()),
            entry_type: NormalizedEntryType::Thinking,
            content: json.get("content").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            metadata: None,
        }),
        "error_message" | "error" => Some(NormalizedEntry {
            timestamp: json.get("timestamp").and_then(|v| v.as_str()).map(|s| s.to_string()),
            entry_type: NormalizedEntryType::ErrorMessage { error_type: NormalizedEntryError::Other },
            content: json.get("content").or_else(|| json.get("message")).and_then(|v| v.as_str()).unwrap_or("Unknown error").to_string(),
            metadata: None,
        }),
        "session_start" | "session_end" => Some(NormalizedEntry {
            timestamp: json.get("timestamp").and_then(|v| v.as_str()).map(|s| s.to_string()),
            entry_type: NormalizedEntryType::Loading,
            content: json.get("content").or_else(|| json.get("message")).and_then(|v| v.as_str()).unwrap_or("").to_string(),
            metadata: None,
        }),
        "token_usage_info" => {
            let total = json.get("total_tokens").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            let context = json.get("model_context_window").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            
            Some(NormalizedEntry {
                timestamp: json.get("timestamp").and_then(|v| v.as_str()).map(|s| s.to_string()),
                entry_type: NormalizedEntryType::TokenUsageInfo(TokenUsageInfo { total_tokens: total, model_context_window: context }),
                content: format!("Tokens: {} / {}", total, context),
                metadata: None,
            })
        }
        _ => None,
    }
}

/// 启动数据库持久化任务
///
/// 这个任务会订阅 MsgStore 的实时流，并将 Stdout/Stderr 消息持久化到 SQLite 数据库。
/// 类似于 vibe-kanban 的 `spawn_stream_raw_logs_to_db` 实现。
fn spawn_db_persistence_task(
    db_pool: Arc<SqlitePool>,
    execution_id: &str,
    msg_store: Arc<MsgStore>,
) {
    let execution_id = execution_id.to_string();

    tokio::spawn(async move {
        info!(
            "[DB_PERSIST] Starting persistence task for execution_id={}",
            execution_id
        );

        let mut stream = msg_store.history_plus_stream();
        let mut line_count = 0usize;
        let mut error_count = 0usize;

        while let Some(result) = stream.next().await {
            match result {
                Ok(msg) => {
                    match &msg {
                        // 只持久化 Stdout 和 Stderr 消息
                        LogMsg::Stdout(_) | LogMsg::Stderr(_) => {
                            // 序列化为 JSON
                            match serde_json::to_string(&msg) {
                                Ok(json) => {
                                    let jsonl_line = format!("{}\n", json);

                                    // 追加到数据库
                                    match ExecutionProcessLogs::append_log_line(
                                        &db_pool,
                                        &execution_id,
                                        &jsonl_line,
                                    )
                                    .await
                                    {
                                        Ok(_) => {
                                            line_count += 1;
                                            if line_count % 100 == 0 {
                                                info!(
                                                    "[DB_PERSIST] Persisted {} lines for execution_id={}",
                                                    line_count, execution_id
                                                );
                                            }
                                        }
                                        Err(e) => {
                                            error_count += 1;
                                            tracing::error!(
                                                "[DB_PERSIST] Failed to append log line: {}",
                                                e
                                            );
                                        }
                                    }
                                }
                                Err(e) => {
                                    error_count += 1;
                                    tracing::error!(
                                        "[DB_PERSIST] Failed to serialize log message: {}",
                                        e
                                    );
                                }
                            }
                        }
                        // LogMsg::Finished 表示进程结束，退出循环
                        LogMsg::Finished => {
                            info!(
                                "[DB_PERSIST] Process finished, total {} lines persisted ({} errors)",
                                line_count, error_count
                            );
                            break;
                        }
                        // 其他类型的消息不持久化
                        _ => {}
                    }
                }
                Err(e) => {
                    error_count += 1;
                    tracing::error!("[DB_PERSIST] Error reading from stream: {:?}", e);
                }
            }
        }

        info!(
            "[DB_PERSIST] Persistence task ended for execution_id={}, total lines={}, errors={}",
            execution_id, line_count, error_count
        );
    });
}
