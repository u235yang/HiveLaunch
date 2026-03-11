// 独立的 HTTP 服务器入口
// 运行方式: cargo run --bin http-server
// 或: pnpm dev:api

#![allow(unused)]

mod commands;
mod process;
mod http_server;
mod swarm_config_io;

use std::sync::Arc;
use tokio::sync::RwLock;

use http_server::start_http_server;
use process::AgentProcessManager;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logger
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .init();

    // 从环境变量读取配置
    // 默认使用 infra/db/hivelaunch.db（与 Next.js API 共享）
    let db_path = std::env::var("DB_PATH")
        .unwrap_or_else(|_| "../db/hivelaunch.db".to_string());
    let port = std::env::var("PORT")
        .unwrap_or_else(|_| "3847".to_string())
        .parse::<u16>()
        .unwrap_or(3847);

    println!("Starting HiveLaunch HTTP Server...");
    println!("Database path: {}", db_path);
    println!("Server will be available at: http://0.0.0.0:{}", port);

    // 初始化数据库连接池
    let db_pool = match process::db::init_db_pool(&db_path).await {
        Ok(pool) => {
            println!("[MAIN] Database connected: {}", db_path);
            Some(Arc::new(pool))
        }
        Err(e) => {
            eprintln!("[MAIN] Failed to connect to database: {}", e);
            println!("[MAIN] Continuing without database persistence");
            None
        }
    };

    // 创建 AgentProcessManager（带或不带数据库）
    let process_manager = if let Some(pool) = db_pool {
        Arc::new(RwLock::new(AgentProcessManager::new_with_db(pool)))
    } else {
        Arc::new(RwLock::new(AgentProcessManager::new()))
    };

    // 启动 HTTP Server (阻塞)
    if let Err(e) = start_http_server(port, process_manager).await {
        eprintln!("HTTP server error: {}", e);
    }

    Ok(())
}
