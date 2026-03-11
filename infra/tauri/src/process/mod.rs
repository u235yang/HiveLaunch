// F3: Process Management Module
// 进程管理模块 - 管理 Agent 执行进程

pub mod agent_manager;
pub mod worktree;
pub mod db;

// Re-export AgentProcessManager
pub use agent_manager::AgentProcessManager;

// Re-export bee_executor types
// pub use bee_executor::CodingAgent;  // 未使用
// pub use bee_executor::StandardCodingAgentExecutor;  // 未使用
pub use bee_executor::NormalizedEntry as ExecutorNormalizedEntry;
pub use bee_executor::SpawnedChild;
pub use bee_executor::ExecutorError;
pub use bee_executor::ExecutionEnv;
