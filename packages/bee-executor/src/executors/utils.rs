use std::{
    collections::HashMap,
    num::NonZeroUsize,
    sync::{Arc, Mutex, OnceLock},
    time::{Duration, Instant},
};

use lru::LruCache;

use super::BaseCodingAgent;
use super::SlashCommandDescription;
use crate::{
    executor_discovery::ExecutorConfigCacheKey,
    model_selector::{ExecutorAgentInfo, ExecutorDiscoveredOptions},
};

/// Parsed slash command with name and arguments.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SlashCommandCall<'a> {
    /// The command name in lowercase (without the leading slash)
    pub name: String,
    /// The arguments after the command name
    pub arguments: &'a str,
}

/// Parse a slash command from a prompt string.
///
/// Returns `Some(T)` if the prompt starts with a slash command,
/// or `None` if it doesn't look like a slash command.
///
/// The return type `T` must implement `From<SlashCommandCall>`.
pub fn parse_slash_command<'a, T>(prompt: &'a str) -> Option<T>
where
    T: From<SlashCommandCall<'a>>,
{
    let trimmed = prompt.trim_start();
    let without_slash = trimmed.strip_prefix('/')?;
    let mut parts = without_slash.splitn(2, |ch: char| ch.is_whitespace());
    let name = parts.next()?.trim().to_lowercase();
    if name.is_empty() {
        return None;
    }
    let arguments = parts.next().map(|s| s.trim()).unwrap_or("");
    Some(T::from(SlashCommandCall { name, arguments }))
}

pub const SLASH_COMMANDS_CACHE_CAPACITY: usize = 32;
const TTL: Duration = Duration::from_secs(60 * 5);

/// Reorder slash commands to prioritize compact then review.
#[must_use]
pub fn reorder_slash_commands(
    commands: impl IntoIterator<Item = SlashCommandDescription>,
) -> Vec<SlashCommandDescription> {
    let mut compact_command = None;
    let mut review_commands = None;
    let mut remaining_commands = Vec::new();

    for command in commands {
        match command.name.as_str() {
            "compact" => compact_command = Some(command),
            "review" => review_commands = Some(command),
            _ => remaining_commands.push(command),
        }
    }

    compact_command
        .into_iter()
        .chain(review_commands)
        .chain(remaining_commands)
        .collect()
}

// ============================================================================
// Executor Options Cache (for discover_options)
// ============================================================================

pub const EXECUTOR_OPTIONS_CACHE_CAPACITY: usize = 64;
const EXECUTOR_OPTIONS_TTL: Duration = Duration::from_mins(5);

struct OptionsCacheEntry {
    cached_at: Instant,
    value: Arc<ExecutorDiscoveredOptions>,
}

pub struct ExecutorOptionsCache {
    cache: Mutex<LruCache<ExecutorConfigCacheKey, OptionsCacheEntry>>,
    ttl: Duration,
}

impl ExecutorOptionsCache {
    pub fn new(capacity: usize, ttl: Duration) -> Self {
        Self {
            cache: Mutex::new(LruCache::new(
                NonZeroUsize::new(capacity).unwrap_or_else(|| NonZeroUsize::new(1).unwrap()),
            )),
            ttl,
        }
    }

    #[must_use]
    pub fn get(&self, key: &ExecutorConfigCacheKey) -> Option<Arc<ExecutorDiscoveredOptions>> {
        let mut cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        let entry = cache.get(key)?;
        let value = entry.value.clone();
        let expired = entry.cached_at.elapsed() > self.ttl;
        if expired {
            cache.pop(key);
            None
        } else {
            Some(value)
        }
    }

    pub fn put(&self, key: ExecutorConfigCacheKey, value: ExecutorDiscoveredOptions) {
        let mut cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        cache.put(
            key,
            OptionsCacheEntry {
                cached_at: Instant::now(),
                value: Arc::new(value),
            },
        );
    }

    /// Invalidate a specific cache entry
    pub fn invalidate(&self, key: &ExecutorConfigCacheKey) {
        let mut cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        cache.pop(key);
    }
}

/// Get the global executor options cache (singleton)
pub fn executor_options_cache() -> &'static ExecutorOptionsCache {
    static INSTANCE: OnceLock<ExecutorOptionsCache> = OnceLock::new();
    INSTANCE.get_or_init(|| {
        ExecutorOptionsCache::new(EXECUTOR_OPTIONS_CACHE_CAPACITY, EXECUTOR_OPTIONS_TTL)
    })
}

// ============================================================================
// Global Model Cache (进程级缓存，无 TTL)
// ============================================================================

/// 全局模型缓存键 - 只按 executor 区分
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct GlobalModelCacheKey {
    pub executor: BaseCodingAgent,
}

impl GlobalModelCacheKey {
    pub fn new(executor: BaseCodingAgent) -> Self {
        Self { executor }
    }
}

/// 全局模型缓存条目
struct GlobalModelCacheEntry {
    cached_at: Instant,
    value: Arc<ExecutorDiscoveredOptions>,
}

/// 全局模型缓存（无 TTL，进程级）
pub struct GlobalModelCache {
    cache: Mutex<HashMap<GlobalModelCacheKey, GlobalModelCacheEntry>>,
}

impl GlobalModelCache {
    pub fn new() -> Self {
        Self {
            cache: Mutex::new(HashMap::new()),
        }
    }

    #[must_use]
    pub fn get(&self, executor: BaseCodingAgent) -> Option<Arc<ExecutorDiscoveredOptions>> {
        let key = GlobalModelCacheKey::new(executor);
        let cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        cache.get(&key).map(|entry| entry.value.clone())
    }

    pub fn put(&self, executor: BaseCodingAgent, value: ExecutorDiscoveredOptions) {
        let key = GlobalModelCacheKey::new(executor);
        let mut cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        cache.insert(
            key,
            GlobalModelCacheEntry {
                cached_at: Instant::now(),
                value: Arc::new(value),
            },
        );
    }

    /// Invalidate a specific executor's cache
    pub fn invalidate(&self, executor: BaseCodingAgent) {
        let key = GlobalModelCacheKey::new(executor);
        let mut cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        cache.remove(&key);
    }

    /// Invalidate all cached models
    pub fn invalidate_all(&self) {
        let mut cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        cache.clear();
    }
}

/// Get the global model cache (singleton)
pub fn global_model_cache() -> &'static GlobalModelCache {
    static INSTANCE: OnceLock<GlobalModelCache> = OnceLock::new();
    INSTANCE.get_or_init(|| GlobalModelCache::new())
}

// ============================================================================
// Global Agent Cache (进程级缓存，无 TTL，与 Model 缓存独立)
// ============================================================================

/// 全局 Agent 缓存键 - 只按 executor 区分
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct GlobalAgentCacheKey {
    pub executor: BaseCodingAgent,
}

impl GlobalAgentCacheKey {
    pub fn new(executor: BaseCodingAgent) -> Self {
        Self { executor }
    }
}

/// 全局 Agent 缓存条目
struct GlobalAgentCacheEntry {
    cached_at: Instant,
    value: Arc<Vec<ExecutorAgentInfo>>,
}

/// 全局 Agent 缓存（无 TTL，进程级，与 Model 缓存独立）
pub struct GlobalAgentCache {
    cache: Mutex<HashMap<GlobalAgentCacheKey, GlobalAgentCacheEntry>>,
}

impl GlobalAgentCache {
    pub fn new() -> Self {
        Self {
            cache: Mutex::new(HashMap::new()),
        }
    }

    #[must_use]
    pub fn get(&self, executor: BaseCodingAgent) -> Option<Arc<Vec<ExecutorAgentInfo>>> {
        let key = GlobalAgentCacheKey::new(executor);
        let cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        cache.get(&key).map(|entry| entry.value.clone())
    }

    pub fn put(&self, executor: BaseCodingAgent, value: Vec<ExecutorAgentInfo>) {
        let key = GlobalAgentCacheKey::new(executor);
        let mut cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        cache.insert(
            key,
            GlobalAgentCacheEntry {
                cached_at: Instant::now(),
                value: Arc::new(value),
            },
        );
    }

    /// Invalidate a specific executor's agent cache
    pub fn invalidate(&self, executor: BaseCodingAgent) {
        let key = GlobalAgentCacheKey::new(executor);
        let mut cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        cache.remove(&key);
    }

    /// Invalidate all cached agents
    pub fn invalidate_all(&self) {
        let mut cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        cache.clear();
    }
}

/// Get the global agent cache (singleton)
pub fn global_agent_cache() -> &'static GlobalAgentCache {
    static INSTANCE: OnceLock<GlobalAgentCache> = OnceLock::new();
    INSTANCE.get_or_init(|| GlobalAgentCache::new())
}
