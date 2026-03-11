use std::{env, sync::OnceLock};

use directories::ProjectDirs;

// 只包含我们需要的模块
pub mod approvals;
pub mod assets;
pub mod diff;
pub mod log_msg;
pub mod msg_store;
pub mod path;
pub mod process;
pub mod shell;
pub mod stream_lines;

// 临时注释掉不需要的模块，避免编译错误
// pub mod browser;
// pub mod jwt;
// pub mod port_file;
// pub mod response;
// pub mod sentry;
// pub mod text;
// pub mod tokio;
// pub mod version;

/// Cache for WSL2 detection result
static WSL2_CACHE: OnceLock<bool> = OnceLock::new();

/// Check if running in WSL2 (cached)
pub fn is_wsl2() -> bool {
    *WSL2_CACHE.get_or_init(|| {
        if std::env::var("WSL_DISTRO_NAME").is_ok() || std::env::var("WSLENV").is_ok() {
            tracing::debug!("WSL2 detected via environment variables");
            return true;
        }
        if let Ok(version) = std::fs::read_to_string("/proc/version")
            && (version.contains("WSL2") || version.contains("microsoft"))
        {
            tracing::debug!("WSL2 detected via /proc/version");
            return true;
        }
        tracing::debug!("WSL2 not detected");
        false
    })
}

pub fn cache_dir() -> std::path::PathBuf {
    let proj = if cfg!(debug_assertions) {
        ProjectDirs::from("ai", "bloop-dev", env!("CARGO_PKG_NAME"))
            .expect("OS didn't give us a home directory")
    } else {
        ProjectDirs::from("ai", "bloop", env!("CARGO_PKG_NAME"))
            .expect("OS didn't give us a home directory")
    };
    proj.cache_dir().to_path_buf()
}
