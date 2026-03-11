// Tauri commands will be organized by feature
// mod commands;
// mod process;

// pub use commands::*;

mod commands;
mod process;
mod http_server;
pub mod swarm_config_io;

use std::sync::Arc;
use tauri::{Manager, RunEvent};
use tokio::sync::RwLock;

use commands::{
    // Worktree commands
    create_git_worktree, get_branch_diff_stats, get_worktree_status, list_git_worktrees,
    remove_git_worktree,
    // Agent execution commands
    start_agent_execution, stop_agent_execution, send_agent_prompt,
    send_agent_follow_up, get_agent_status, get_active_agents, spawn_agent_process,
    get_available_agents,
    // Git operations commands
    git_get_diff, git_get_branch_status, git_push, git_create_pr,
    git_rebase, git_abort_rebase, git_continue_rebase, git_merge, git_get_commits,
    git_commit, git_get_current_branch, git_list_branches, git_force_push,
    git_abort_merge, git_is_merge_in_progress,
    // Settings commands
    get_global_settings, save_global_settings, get_workspace_dir, set_workspace_dir,
    // Swarm config commands
    write_swarm_config_to_project, read_project_config, save_project_config_file,
};
use process::AgentProcessManager;
use http_server::start_http_server;

/// 创建生命周期管理插件 - 处理启动和退出事件
fn create_lifecycle_plugin(
    process_manager: Arc<RwLock<AgentProcessManager>>,
) -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("lifecycle")
        .setup(move |app, _api| {
            // 启动时：清理孤儿进程
            let pm = app.state::<Arc<RwLock<AgentProcessManager>>>().inner().clone();
            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new().unwrap();
                rt.block_on(async move {
                    let manager = pm.read().await;
                    if let Err(e) = manager.cleanup_orphan_executions().await {
                        log::error!("Failed to cleanup orphan executions: {}", e);
                    }
                });
            });
            Ok(())
        })
        .on_event(move |app, event| {
            // 退出时：终止所有进程
            if let RunEvent::Exit = event {
                let pm = app.state::<Arc<RwLock<AgentProcessManager>>>().inner().clone();
                // 使用 block_on 同步执行，确保退出前完成清理
                let rt = tokio::runtime::Handle::current();
                rt.block_on(async {
                    let manager = pm.read().await;
                    if let Err(e) = manager.kill_all_running_processes().await {
                        log::error!("Failed to kill all running processes: {}", e);
                    }
                });
            }
        })
        .build()
}

// Mobile entry point for Android/iOS
#[cfg_attr(target_os = "android", tauri::mobile_entry_point)]
pub fn run_app() {
    // Initialize logger with info level
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .init();

    let db_path = std::env::var("DB_PATH")
        .unwrap_or_else(|_| "../db/hivelaunch.db".to_string());
    let db_pool = match tokio::runtime::Runtime::new() {
        Ok(rt) => match rt.block_on(process::db::init_db_pool(&db_path)) {
            Ok(pool) => Some(Arc::new(pool)),
            Err(e) => {
                log::error!("[MAIN] Failed to connect to database: {}", e);
                None
            }
        },
        Err(e) => {
            log::error!("[MAIN] Failed to create runtime for database init: {}", e);
            None
        }
    };

    let process_manager = if let Some(pool) = db_pool {
        Arc::new(RwLock::new(AgentProcessManager::new_with_db(pool)))
    } else {
        Arc::new(RwLock::new(AgentProcessManager::new()))
    };

    // 克隆 manager 用于 HTTP Server
    let process_manager_for_http = process_manager.clone();
    // 克隆 manager 用于生命周期插件
    let process_manager_for_lifecycle = process_manager.clone();

    // 启动 HTTP Server (在后台线程运行)
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            if let Err(e) = start_http_server(3847, process_manager_for_http).await {
                log::error!("HTTP server error: {}", e);
            }
        });
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(create_lifecycle_plugin(process_manager_for_lifecycle))
        .manage(process_manager)
        .invoke_handler(tauri::generate_handler![
            // Worktree commands
            create_git_worktree,
            remove_git_worktree,
            get_worktree_status,
            get_branch_diff_stats,
            list_git_worktrees,
            // Agent execution commands
            start_agent_execution,
            stop_agent_execution,
            send_agent_prompt,
            send_agent_follow_up,
            get_agent_status,
            get_active_agents,
            get_available_agents,
            // Git operations commands
            git_get_diff,
            git_get_branch_status,
            git_push,
            git_force_push,
            git_create_pr,
            git_rebase,
            git_abort_rebase,
            git_continue_rebase,
            git_merge,
            git_get_commits,
            git_commit,
            git_get_current_branch,
            git_list_branches,
            git_abort_merge,
            git_is_merge_in_progress,
            // Settings commands
            get_global_settings,
            save_global_settings,
            get_workspace_dir,
            set_workspace_dir,
            // Swarm config commands
            write_swarm_config_to_project,
            read_project_config,
            save_project_config_file,
            // Legacy execution command (kept for compatibility)
            spawn_agent_process,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
