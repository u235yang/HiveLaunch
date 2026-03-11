use std::{hash::Hash, path::PathBuf};

use serde::{Deserialize, Serialize};

use crate::executors::BaseCodingAgent;

/// Cache key for executor discovered options
/// Combines path, command configuration, and executor type
#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ExecutorConfigCacheKey {
    /// Working directory path (None for global)
    pub path: Option<PathBuf>,
    /// Command configuration key (derived from env vars, base command)
    pub cmd_key: String,
    /// Base executor type (opencode, claude, etc.)
    pub base_executor: BaseCodingAgent,
}

impl ExecutorConfigCacheKey {
    /// Create a new cache key
    pub fn new(path: Option<&PathBuf>, cmd_key: String, base_executor: BaseCodingAgent) -> Self {
        Self {
            path: path.map(|p| p.clone()),
            cmd_key,
            base_executor,
        }
    }
}
