// bee-container: Container Service for Agent Execution
// 基于 vibe-kanban crates/services/src/services/container.rs 和 
// crates/local-deployment/src/container.rs 迁移

pub mod types;
pub mod local;

pub use types::*;
pub use local::LocalContainer;

// Re-exports
pub use bee_workspace_utils::msg_store::MsgStore;
pub use bee_workspace_utils::log_msg::LogMsg;
