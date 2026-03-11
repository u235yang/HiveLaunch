use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::executors::SlashCommandDescription;

/// Provider information
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ModelProvider {
    /// Provider identifier
    pub id: String,
    /// Display name
    pub name: String,
}

/// Basic model information
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ModelInfo {
    /// Model identifier
    pub id: String,
    /// Display name
    pub name: String,
    /// Provider this model belongs to
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_id: Option<String>,
    /// Configurable reasoning options if supported
    #[serde(default)]
    pub reasoning_options: Vec<ReasoningOption>,
}

/// Reasoning option (simple selectable choice).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ReasoningOption {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub is_default: bool,
}

/// Available agent option provided by an executor.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ExecutorAgentInfo {
    pub id: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default)]
    pub is_default: bool,
}

/// Permission policy for tool operations
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(use_ts_enum)]
pub enum PermissionPolicy {
    #[default]
    /// Skip all permission checks
    Auto,
    /// Require approval for risky operations
    Supervised,
    /// Plan mode before execution (executor-defined meaning)
    Plan,
}

/// Full model selector configuration
#[derive(Debug, Clone, Serialize, Deserialize, TS, Default)]
pub struct ModelSelectorConfig {
    /// Available providers
    pub providers: Vec<ModelProvider>,
    /// Available models
    pub models: Vec<ModelInfo>,
    /// Global default model (format: provider_id/model_id)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_model: Option<String>,
    /// Available agents
    pub agents: Vec<ExecutorAgentInfo>,
    /// Supported permission policies
    pub permissions: Vec<PermissionPolicy>,
}

/// Discovered options for an executor
#[derive(Debug, Clone, Serialize, Deserialize, TS, Default)]
pub struct ExecutorDiscoveredOptions {
    /// Model selector configuration
    pub model_selector: ModelSelectorConfig,
    /// Available slash commands
    pub slash_commands: Vec<SlashCommandDescription>,
    /// Whether models are still being discovered
    #[serde(default)]
    pub loading_models: bool,
    /// Whether agents are still being discovered
    #[serde(default)]
    pub loading_agents: bool,
    /// Whether slash commands are still being discovered
    #[serde(default)]
    pub loading_slash_commands: bool,
    /// Error message if discovery failed
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl ExecutorDiscoveredOptions {
    pub fn with_loading(mut self, loading: bool) -> Self {
        self.loading_models = loading;
        self.loading_agents = loading;
        self.loading_slash_commands = loading;
        self
    }

    /// Create options with default model selector config (empty but with default permissions)
    pub fn with_default_model_selector(mut self) -> Self {
        self.model_selector = ModelSelectorConfig {
            providers: vec![],
            models: vec![],
            agents: vec![],
            permissions: vec![
                PermissionPolicy::Auto,
                PermissionPolicy::Supervised,
                PermissionPolicy::Plan,
            ],
            default_model: None,
        };
        self
    }
}

/// Create a ModelSelectorConfig with OpenCode default models
pub fn opencode_default_model_selector() -> ModelSelectorConfig {
    ModelSelectorConfig {
        providers: vec![
            ModelProvider {
                id: "openai".to_string(),
                name: "OpenAI".to_string(),
            },
            ModelProvider {
                id: "anthropic".to_string(),
                name: "Anthropic".to_string(),
            },
            ModelProvider {
                id: "google".to_string(),
                name: "Google".to_string(),
            },
            ModelProvider {
                id: "deepseek".to_string(),
                name: "DeepSeek".to_string(),
            },
        ],
        models: vec![
            // OpenAI models
            ModelInfo {
                id: "o1".to_string(),
                name: "o1".to_string(),
                provider_id: Some("openai".to_string()),
                reasoning_options: vec![],
            },
            ModelInfo {
                id: "o1-mini".to_string(),
                name: "o1-mini".to_string(),
                provider_id: Some("openai".to_string()),
                reasoning_options: vec![],
            },
            ModelInfo {
                id: "gpt-4o".to_string(),
                name: "GPT-4o".to_string(),
                provider_id: Some("openai".to_string()),
                reasoning_options: vec![],
            },
            ModelInfo {
                id: "gpt-4o-mini".to_string(),
                name: "GPT-4o Mini".to_string(),
                provider_id: Some("openai".to_string()),
                reasoning_options: vec![],
            },
            // Anthropic models
            ModelInfo {
                id: "claude-sonnet-4-20250514".to_string(),
                name: "Claude Sonnet 4".to_string(),
                provider_id: Some("anthropic".to_string()),
                reasoning_options: vec![],
            },
            ModelInfo {
                id: "claude-haiku-3-20250520".to_string(),
                name: "Claude Haiku 3".to_string(),
                provider_id: Some("anthropic".to_string()),
                reasoning_options: vec![],
            },
            // Google models
            ModelInfo {
                id: "gemini-2.0-flash-exp".to_string(),
                name: "Gemini 2.0 Flash".to_string(),
                provider_id: Some("google".to_string()),
                reasoning_options: vec![],
            },
            // DeepSeek models
            ModelInfo {
                id: "deepseek-chat".to_string(),
                name: "DeepSeek Chat".to_string(),
                provider_id: Some("deepseek".to_string()),
                reasoning_options: vec![],
            },
            ModelInfo {
                id: "deepseek-coder".to_string(),
                name: "DeepSeek Coder".to_string(),
                provider_id: Some("deepseek".to_string()),
                reasoning_options: vec![],
            },
        ],
        default_model: Some("claude-sonnet-4-20250514".to_string()),
        agents: vec![],
        permissions: vec![
            PermissionPolicy::Auto,
            PermissionPolicy::Supervised,
            PermissionPolicy::Plan,
        ],
    }
}

/// Create a ModelSelectorConfig with Claude Code default models
pub fn claude_default_model_selector() -> ModelSelectorConfig {
    ModelSelectorConfig {
        providers: vec![ModelProvider {
            id: "anthropic".to_string(),
            name: "Anthropic".to_string(),
        }],
        models: vec![
            ModelInfo {
                id: "claude-opus-4-6".to_string(),
                name: "Opus".to_string(),
                provider_id: Some("anthropic".to_string()),
                reasoning_options: vec![],
            },
            ModelInfo {
                id: "claude-opus-4-6-20251106".to_string(),
                name: "Opus 4 (Latest)".to_string(),
                provider_id: Some("anthropic".to_string()),
                reasoning_options: vec![],
            },
            ModelInfo {
                id: "claude-sonnet-4-20250514".to_string(),
                name: "Sonnet".to_string(),
                provider_id: Some("anthropic".to_string()),
                reasoning_options: vec![],
            },
            ModelInfo {
                id: "claude-sonnet-4-5-20250929".to_string(),
                name: "Sonnet 4 (Latest)".to_string(),
                provider_id: Some("anthropic".to_string()),
                reasoning_options: vec![],
            },
            ModelInfo {
                id: "claude-haiku-3-20250520".to_string(),
                name: "Haiku".to_string(),
                provider_id: Some("anthropic".to_string()),
                reasoning_options: vec![],
            },
            ModelInfo {
                id: "claude-haiku-3-5-20241022".to_string(),
                name: "Haiku 3.5".to_string(),
                provider_id: Some("anthropic".to_string()),
                reasoning_options: vec![],
            },
        ],
        default_model: Some("claude-sonnet-4-20250514".to_string()),
        agents: vec![],
        permissions: vec![
            PermissionPolicy::Auto,
            PermissionPolicy::Supervised,
            PermissionPolicy::Plan,
        ],
    }
}
