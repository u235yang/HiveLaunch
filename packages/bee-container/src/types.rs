// bee-container types
// 核心类型定义，基于 vibe-kanban 迁移

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

/// Container error type
#[derive(Debug, thiserror::Error)]
pub enum ContainerError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Workspace not found: {0}")]
    WorkspaceNotFound(String),

    #[error("Execution error: {0}")]
    Execution(String),

    #[error("Other error: {0}")]
    Other(#[from] anyhow::Error),
}

/// Execution process status
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionProcessStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
    Cancelled,
}

/// Execution process run reason
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionProcessRunReason {
    SetupScript,
    CodingAgent,
    CleanupScript,
    DevServer,
    ArchiveScript,
}

/// Execution context - holds current execution state
#[derive(Debug, Clone)]
pub struct ExecutionContext {
    pub workspace: Workspace,
    pub execution_process: ExecutionProcess,
    pub session: Session,
}

/// Workspace - represents a working directory for agent execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: Uuid,
    pub name: String,
    pub path: PathBuf,
    pub branch: String,
    pub base_branch: Option<String>,
    pub container_ref: Option<PathBuf>,
}

/// Session - represents an agent session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub created_at: DateTime<Utc>,
}

/// ExecutionProcess - represents a single execution attempt
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionProcess {
    pub id: Uuid,
    pub session_id: Uuid,
    pub status: ExecutionProcessRunReason,
    pub run_reason: ExecutionProcessRunReason,
}

/// Execution start request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartExecutionRequest {
    pub workspace_id: String,
    pub working_dir: String,
    pub agent_name: String,
    pub prompt: String,
    pub env_vars: std::collections::HashMap<String, String>,
}

/// Execution result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionResult {
    pub execution_id: String,
    pub status: ExecutionProcessStatus,
}
