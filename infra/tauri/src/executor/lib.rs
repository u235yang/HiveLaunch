// Re-export workspace utilities
pub mod workspace_utils {
    pub mod approvals;
    pub mod diff;
    pub mod log_msg;
    pub mod msg_store;
    pub mod path;
    pub mod process;
    pub mod shell;
    pub mod stream_lines;
}

pub mod approvals;
pub mod command;
pub mod env;
pub mod executors;
pub mod logs;
pub mod stdout_dup;

// Re-export commonly used types
pub use approvals::ExecutorApprovalError;
pub use approvals::ExecutorApprovalService;
pub use command::CmdOverrides;
pub use command::CommandBuildError;
pub use command::CommandBuilder;
pub use env::ExecutionEnv;
pub use executors::CodingAgent;
pub use executors::ExecutorError;
pub use executors::SpawnedChild;
pub use executors::StandardCodingAgentExecutor;
pub use logs::NormalizedEntry;
pub use logs::NormalizedConversation;
pub use logs::NormalizedEntryType;
pub use workspace_utils::msg_store::MsgStore;
pub use workspace_utils::log_msg::LogMsg;
