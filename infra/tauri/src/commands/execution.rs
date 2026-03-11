// Legacy execution command - kept for compatibility
// New implementation uses agent_execution.rs

use log::{error, info};
use std::path::PathBuf;
use tauri::State;

use crate::process::agent_manager::AgentProcessManager;

#[tauri::command]
pub async fn spawn_agent_process(
    process_manager: State<'_, AgentProcessManager>,
    agent_type: String,
    prompt: String,
    worktree_path: PathBuf,
) -> Result<String, String> {
    info!(
        "Attempting to spawn agent process: {} with prompt: {} in worktree: {:?}",
        agent_type, prompt, worktree_path
    );

    // Ensure the worktree directory exists and is a valid directory
    if !worktree_path.is_dir() {
        error!("Worktree path {:?} is not a valid directory.", worktree_path);
        return Err(format!(
            "Worktree path {:?} is not a valid directory.",
            worktree_path
        ));
    }

    // Generate a workspace ID from the worktree path
    let workspace_id = worktree_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let mut env_vars = std::collections::HashMap::new();
    env_vars.insert("NO_COLOR".to_string(), "1".to_string());

    // Use new agent manager
    process_manager
        .start_agent(
            workspace_id,
            worktree_path,
            agent_type,
            env_vars,
            &prompt,
            None, // model - use default
            None, // session_id
            None, // process_id
        )
        .await
        .map_err(|e| {
            error!("Failed to spawn agent process: {}", e);
            format!("Failed to spawn agent process: {}", e)
        })
}
