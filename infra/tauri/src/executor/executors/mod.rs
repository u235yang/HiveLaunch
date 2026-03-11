use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use command_group::AsyncGroupChild;
use futures::stream::BoxStream;
use futures_io::Error as FuturesIoError;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use ts_rs::TS;
use crate::workspace_utils::msg_store::MsgStore;

pub mod opencode;
pub mod utils;

// Re-export Opencode
pub use opencode::Opencode;

/// Base coding agent types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "snake_case")]
pub enum BaseCodingAgent {
    Opencode,
    ClaudeCode,
    Codex,
    Cursor,
    Copilot,
    Gemini,
    Qwen,
    Amp,
    Droid,
}

/// Coding agent enum
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "snake_case")]
pub enum CodingAgent {
    Opencode(Opencode),
    ClaudeCode,
    Codex,
    Cursor,
    Copilot,
    Gemini,
    Qwen,
    Amp,
    Droid,
}

impl CodingAgent {
    pub fn as_base(&self) -> BaseCodingAgent {
        match self {
            CodingAgent::Opencode(_) => BaseCodingAgent::Opencode,
            CodingAgent::ClaudeCode => BaseCodingAgent::ClaudeCode,
            CodingAgent::Codex => BaseCodingAgent::Codex,
            CodingAgent::Cursor => BaseCodingAgent::Cursor,
            CodingAgent::Copilot => BaseCodingAgent::Copilot,
            CodingAgent::Gemini => BaseCodingAgent::Gemini,
            CodingAgent::Qwen => BaseCodingAgent::Qwen,
            CodingAgent::Amp => BaseCodingAgent::Amp,
            CodingAgent::Droid => BaseCodingAgent::Droid,
        }
    }
}

impl From<Opencode> for CodingAgent {
    fn from(executor: Opencode) -> Self {
        CodingAgent::Opencode(executor)
    }
}

impl std::fmt::Display for BaseCodingAgent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BaseCodingAgent::Opencode => write!(f, "opencode"),
            BaseCodingAgent::ClaudeCode => write!(f, "claude_code"),
            BaseCodingAgent::Codex => write!(f, "codex"),
            BaseCodingAgent::Cursor => write!(f, "cursor"),
            BaseCodingAgent::Copilot => write!(f, "copilot"),
            BaseCodingAgent::Gemini => write!(f, "gemini"),
            BaseCodingAgent::Qwen => write!(f, "qwen"),
            BaseCodingAgent::Amp => write!(f, "amp"),
            BaseCodingAgent::Droid => write!(f, "droid"),
        }
    }
}

#[derive(Debug, Error)]
pub enum ExecutorError {
    #[error("Follow-up is not supported: {0}")]
    FollowUpNotSupported(String),
    #[error(transparent)]
    SpawnError(#[from] FuturesIoError),
    #[error("Unknown executor type: {0}")]
    UnknownExecutorType(String),
    #[error("I/O error: {0}")]
    Io(std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    CommandBuild(#[from] CommandBuildError),
    #[error("Executable `{program}` not found in PATH")]
    ExecutableNotFound { program: String },
    #[error("Setup helper not supported")]
    SetupHelperNotSupported,
    #[error("Auth required: {0}")]
    AuthRequired(String),
}

impl From<crate::approvals::ExecutorApprovalError> for ExecutorError {
    fn from(err: crate::approvals::ExecutorApprovalError) -> Self {
        ExecutorError::Io(std::io::Error::other(err.to_string()))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct SlashCommandDescription {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS, JsonSchema)]
pub struct AppendPrompt(pub Option<String>);

impl AppendPrompt {
    pub fn get(&self) -> Option<String> {
        self.0.clone()
    }

    pub fn combine_prompt(&self, prompt: &str) -> String {
        match self.0.clone() {
            Some(value) => format!("{prompt}{value}"),
            None => prompt.to_string(),
        }
    }
}

impl Default for AppendPrompt {
    fn default() -> Self {
        Self(None)
    }
}

/// Result communicated through the exit signal
#[derive(Debug, Clone, Copy)]
pub enum ExecutorExitResult {
    Success,
    Failure,
}

/// Optional exit notification from an executor.
pub type ExecutorExitSignal = tokio::sync::oneshot::Receiver<ExecutorExitResult>;

/// Cancellation token for requesting graceful shutdown of an executor.
pub type CancellationToken = tokio_util::sync::CancellationToken;

#[derive(Debug)]
pub struct SpawnedChild {
    pub child: AsyncGroupChild,
    pub exit_signal: Option<ExecutorExitSignal>,
    pub cancel: Option<CancellationToken>,
}

impl From<AsyncGroupChild> for SpawnedChild {
    fn from(child: AsyncGroupChild) -> Self {
        Self {
            child,
            exit_signal: None,
            cancel: None,
        }
    }
}

// Re-use CommandBuildError from command module
use crate::command::CommandBuildError;
use crate::approvals::ExecutorApprovalService;
use futures::StreamExt;

#[async_trait]
pub trait StandardCodingAgentExecutor: Send + Sync {
    fn use_approvals(&mut self, _approvals: Arc<dyn crate::approvals::ExecutorApprovalService>) {}

    async fn available_slash_commands(
        &self,
        _current_dir: &Path,
    ) -> Result<futures::stream::BoxStream<'static, json_patch::Patch>, ExecutorError> {
        Ok(futures::stream::once(async { json_patch::Patch(vec![]) }).boxed())
    }

    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError>;

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
        reset_to_message_id: Option<&str>,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError>;

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, worktree_path: &Path);

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf>;

    fn get_availability_info(&self) -> AvailabilityInfo {
        let config_files_found = self
            .default_mcp_config_path()
            .map(|path| path.exists())
            .unwrap_or(false);

        if config_files_found {
            AvailabilityInfo::InstallationFound
        } else {
            AvailabilityInfo::NotFound
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum AvailabilityInfo {
    LoginDetected { last_auth_timestamp: i64 },
    InstallationFound,
    NotFound,
}

impl AvailabilityInfo {
    pub fn is_available(&self) -> bool {
        matches!(
            self,
            AvailabilityInfo::LoginDetected { .. } | AvailabilityInfo::InstallationFound
        )
    }
}

// Re-export ExecutionEnv
pub use crate::env::ExecutionEnv;
