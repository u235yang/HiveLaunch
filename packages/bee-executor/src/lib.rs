pub mod actions;
pub mod approvals;
pub mod command;
pub mod env;
pub mod executor_discovery;
pub mod executors;
pub mod logs;
pub mod mcp_config;
pub mod model_selector;
pub mod profile;
pub mod stdout_dup;

// Re-exports for external crates
pub use env::ExecutionEnv;
pub use executors::{
    BaseCodingAgent, CodingAgent, CancellationToken, ExecutorError, ExecutorExitResult, SpawnedChild,
    StandardCodingAgentExecutor,
};
pub use logs::NormalizedEntry;
pub use model_selector::{
    ExecutorAgentInfo, ExecutorDiscoveredOptions, ModelInfo, ModelProvider,
    ModelSelectorConfig, PermissionPolicy, ReasoningOption,
};
pub use profile::{ExecutorConfigs, ExecutorProfileId};
