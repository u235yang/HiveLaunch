use std::{path::Path, sync::Arc, time::Duration};

use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
use derivative::Derivative;
use futures::StreamExt;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tokio::{io::AsyncBufReadExt, process::Command};
use ts_rs::TS;
use bee_workspace_utils::msg_store::MsgStore;

use crate::{
    approvals::ExecutorApprovalService,
    command::{CmdOverrides, CommandBuildError, CommandBuilder, apply_overrides},
    env::ExecutionEnv,
    executor_discovery::ExecutorConfigCacheKey,
    executors::{
        AppendPrompt, AvailabilityInfo, BaseCodingAgent, ExecutorError, ExecutorExitResult, SpawnedChild,
        SlashCommandDescription, StandardCodingAgentExecutor, opencode::types::OpencodeExecutorEvent,
    },
    executors::utils::{executor_options_cache, global_agent_cache, global_model_cache, reorder_slash_commands},
    logs::utils::patch,
    model_selector::{
        opencode_default_model_selector, ExecutorAgentInfo, ExecutorDiscoveredOptions, ModelInfo, ModelProvider,
    },
    stdout_dup::create_stdout_pipe_writer,
};

mod models;
mod normalize_logs;
mod sdk;
mod slash_commands;
mod types;

use sdk::{LogWriter, RunConfig, generate_server_password, run_session, run_slash_command};
use slash_commands::{OpencodeSlashCommand, hardcoded_slash_commands};

#[derive(Derivative, Clone, Serialize, Deserialize, TS, JsonSchema)]
#[derivative(Debug, PartialEq, Default)]
pub struct Opencode {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub variant: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "mode")]
    pub agent: Option<String>,
    /// Auto-approve agent actions
    #[serde(default = "default_to_true")]
    pub auto_approve: bool,
    /// Enable auto-compaction when the context length approaches the model's context window limit
    #[serde(default = "default_to_true")]
    pub auto_compact: bool,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
    #[serde(skip)]
    #[ts(skip)]
    #[derivative(Debug = "ignore", PartialEq = "ignore")]
    pub approvals: Option<Arc<dyn ExecutorApprovalService>>,
}

/// Represents a spawned OpenCode server with its base URL
struct OpencodeServer {
    #[allow(unused)]
    child: Option<AsyncGroupChild>,
    base_url: String,
    server_password: ServerPassword,
}

impl Drop for OpencodeServer {
    fn drop(&mut self) {
        // kill the process properly using the kill helper as the native kill_on_drop doesn't work reliably causing orphaned processes and memory leaks
        if let Some(mut child) = self.child.take() {
            tokio::spawn(async move {
                let _ = bee_workspace_utils::process::kill_process_group(&mut child).await;
            });
        }
    }
}

type ServerPassword = String;

impl Opencode {
    fn normalize_opencode_config_file(&self, current_dir: &Path) {
        let config_path = current_dir.join("opencode.json");
        let content = match std::fs::read_to_string(&config_path) {
            Ok(content) => content,
            Err(err) => {
                if err.kind() != std::io::ErrorKind::NotFound {
                    tracing::warn!(
                        "[opencode config normalize] failed to read {}: {}",
                        config_path.display(),
                        err
                    );
                }
                return;
            }
        };

        if content.trim().is_empty() {
            return;
        }

        let mut value = match serde_json::from_str::<Value>(&content) {
            Ok(value) => value,
            Err(err) => {
                tracing::warn!(
                    "[opencode config normalize] invalid json {}: {}",
                    config_path.display(),
                    err
                );
                return;
            }
        };

        let Some(servers_value) = value
            .get_mut("mcp")
            .and_then(Value::as_object_mut)
            .and_then(|mcp| mcp.get_mut("servers"))
        else {
            return;
        };

        let Value::Array(servers_array) = servers_value else {
            return;
        };

        let mut servers_object = Map::new();
        for (idx, server) in servers_array.iter().enumerate() {
            if let Value::Object(mut server_obj) = server.clone() {
                let name = server_obj
                    .remove("name")
                    .and_then(|v| v.as_str().map(ToOwned::to_owned))
                    .filter(|v| !v.trim().is_empty())
                    .unwrap_or_else(|| format!("server_{}", idx + 1));
                servers_object.insert(name, Value::Object(server_obj));
            }
        }
        *servers_value = Value::Object(servers_object);

        match serde_json::to_string_pretty(&value) {
            Ok(normalized) => {
                if let Err(err) = std::fs::write(&config_path, normalized) {
                    tracing::warn!(
                        "[opencode config normalize] failed to write {}: {}",
                        config_path.display(),
                        err
                    );
                } else {
                    tracing::info!(
                        "[opencode config normalize] normalized mcp.servers to object for {}",
                        config_path.display()
                    );
                }
            }
            Err(err) => {
                tracing::warn!(
                    "[opencode config normalize] failed to serialize {}: {}",
                    config_path.display(),
                    err
                );
            }
        }
    }

    fn is_db_locked_error(err: &ExecutorError) -> bool {
        let message = err.to_string();
        message.contains("database is locked")
    }

    /// Convert a string to Title Case (e.g., "sisyphus" -> "Sisyphus")
    fn to_title_case(s: &str) -> String {
        let mut result = String::with_capacity(s.len());
        let mut capitalize_next = true;
        for c in s.chars() {
            if c == '_' || c == '-' {
                result.push(' ');
                capitalize_next = true;
            } else if capitalize_next {
                result.push(c.to_ascii_uppercase());
                capitalize_next = false;
            } else {
                result.push(c);
            }
        }
        result
    }

    fn build_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        // Use globally installed opencode (from npm package opencode-ai)
        let builder = CommandBuilder::new("opencode")
            // Pass hostname/port as separate args so OpenCode treats them as explicitly set
            // (it checks `process.argv.includes(\"--port\")` / `\"--hostname\"`).
            .extend_params(["serve", "--hostname", "127.0.0.1", "--port", "0"]);
        apply_overrides(builder, &self.cmd)
    }

    /// Compute a cache key for model context windows based on configuration that can affect the list of available models.
    fn compute_models_cache_key(&self) -> String {
        serde_json::to_string(&self.cmd).unwrap_or_default()
    }

    /// Common boilerplate for spawning an OpenCode server process.
    async fn spawn_server_process(
        &self,
        current_dir: &Path,
        env: &ExecutionEnv,
    ) -> Result<(AsyncGroupChild, ServerPassword), ExecutorError> {
        self.normalize_opencode_config_file(current_dir);
        let command_parts = self.build_command_builder()?.build_initial()?;
        let (program_path, args) = command_parts.into_resolved().await?;

        tracing::info!("[spawn_server_process] program={}, args={:?}, cwd={}", 
            program_path.display(), args, current_dir.display());
        let server_password = generate_server_password();

        let mut command = Command::new(&program_path);
        command
            .kill_on_drop(true)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .current_dir(current_dir)
            .env("NPM_CONFIG_LOGLEVEL", "error")
            .env("NODE_NO_WARNINGS", "1")
            .env("NO_COLOR", "1")
            // 设置密码，让服务器需要 Basic Auth
            .env("OPENCODE_SERVER_USERNAME", "opencode")
            .env("OPENCODE_SERVER_PASSWORD", &server_password)
            .args(&args);

        env.clone()
            .with_profile(&self.cmd)
            .apply_to_command(&mut command);

        let mut child = match command.group_spawn() {
            Ok(c) => c,
            Err(e) => {
                tracing::error!("[spawn_server_process] Failed to spawn: {}", e);
                return Err(ExecutorError::Io(std::io::Error::other(e)));
            }
        };

        tracing::info!("[spawn_server_process] Spawned successfully, child_pid={:?}", 
            child.inner().id());

        Ok((child, server_password))
    }

    /// Handles process spawning, waiting for the server URL
    async fn spawn_server(
        &self,
        current_dir: &Path,
        env: &ExecutionEnv,
    ) -> Result<OpencodeServer, ExecutorError> {
        let (mut child, server_password) = self.spawn_server_process(current_dir, env).await?;
        let server_stdout = child.inner().stdout.take().ok_or_else(|| {
            ExecutorError::Io(std::io::Error::other("OpenCode server missing stdout"))
        })?;

        // Also capture stderr to debug why server might exit
        let server_stderr = child.inner().stderr.take();
        if let Some(stderr) = server_stderr {
            let dir_clone = current_dir.to_path_buf();
            tokio::spawn(async move {
                use tokio::io::AsyncBufReadExt;
                let mut reader = tokio::io::BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    tracing::warn!("[opencode stderr] {}: {}", dir_clone.display(), line);
                }
            });
        }

        let base_url = wait_for_server_url(server_stdout, None).await?;

        Ok(OpencodeServer {
            child: Some(child),
            base_url,
            server_password,
        })
    }

    /// Discover available models and providers from OpenCode server
    async fn discover_models_and_providers(
        &self,
        current_dir: &Path,
    ) -> Result<(Vec<ModelProvider>, Vec<ModelInfo>), ExecutorError> {
        use crate::executors::opencode::sdk;
        use crate::env::RepoContext;

        let env = ExecutionEnv::new(RepoContext::default(), false, String::new());
        let server = self.spawn_server(current_dir, &env).await?;

        // Build authenticated client (same pattern as discover_commands)
        let directory = current_dir.to_string_lossy().to_string();
        let client = reqwest::Client::builder()
            .default_headers(sdk::build_default_headers(&directory, &server.server_password))
            .build()
            .map_err(|err| ExecutorError::Io(std::io::Error::other(err)))?;

        // Get providers
        let providers_response = sdk::list_providers(&client, &server.base_url, &directory).await?;

        // Convert to ModelSelector format
        let providers: Vec<ModelProvider> = providers_response
            .all
            .iter()
            .filter(|p| providers_response.connected.contains(&p.id))
            .map(|p| ModelProvider {
                id: p.id.clone(),
                name: p.name.clone(),
            })
            .collect();

        let models: Vec<ModelInfo> = providers_response
            .all
            .iter()
            .filter(|p| providers_response.connected.contains(&p.id))
            .flat_map(|p| {
                p.models.keys().map(|model_id| ModelInfo {
                    id: model_id.clone(),
                    name: model_id.clone(),
                    provider_id: Some(p.id.clone()),
                    reasoning_options: vec![],
                })
            })
            .collect();

        Ok((providers, models))
    }

    /// Discover all options (models, providers, slash commands, agents) in a single server launch
    /// This is more efficient than calling discover_models_and_providers and discover_slash_commands separately
    async fn discover_all(
        &self,
        current_dir: &Path,
    ) -> Result<(Vec<ModelProvider>, Vec<ModelInfo>, Vec<SlashCommandDescription>, Vec<ExecutorAgentInfo>), ExecutorError> {
        use crate::env::RepoContext;
        use crate::executors::opencode::sdk;
        use crate::executors::opencode::slash_commands;

        let env = ExecutionEnv::new(RepoContext::default(), false, String::new());
        let server = self.spawn_server(current_dir, &env).await?;

        let directory = current_dir.to_string_lossy().to_string();
        let client = reqwest::Client::builder()
            .default_headers(sdk::build_default_headers(&directory, &server.server_password))
            .build()
            .map_err(|err| ExecutorError::Io(std::io::Error::other(err)))?;

        let providers_result = {
            let mut attempt = 0;
            loop {
                match sdk::list_providers(&client, &server.base_url, &directory).await {
                    Ok(result) => break Ok(result),
                    Err(err) => {
                        if attempt >= 2 || !Self::is_db_locked_error(&err) {
                            break Err(err);
                        }
                        attempt += 1;
                        tokio::time::sleep(Duration::from_millis(200 * attempt as u64)).await;
                    }
                }
            }
        };

        let commands_result = {
            let mut attempt = 0;
            loop {
                match sdk::discover_commands(&server, current_dir).await {
                    Ok(result) => break Ok(result),
                    Err(err) => {
                        if attempt >= 2 || !Self::is_db_locked_error(&err) {
                            break Err(err);
                        }
                        attempt += 1;
                        tokio::time::sleep(Duration::from_millis(200 * attempt as u64)).await;
                    }
                }
            }
        };

        // 🔹 并行获取 agents
        let agents_result = {
            let mut attempt = 0;
            loop {
                match sdk::list_agents(&client, &server.base_url, &directory).await {
                    Ok(result) => break Ok(result),
                    Err(err) => {
                        if attempt >= 2 || !Self::is_db_locked_error(&err) {
                            break Err(err);
                        }
                        attempt += 1;
                        tokio::time::sleep(Duration::from_millis(200 * attempt as u64)).await;
                    }
                }
            }
        };

        // Process providers
        let (providers, models) = match providers_result {
            Ok(providers_response) => {
                let providers: Vec<ModelProvider> = providers_response
                    .all
                    .iter()
                    .filter(|p| providers_response.connected.contains(&p.id))
                    .map(|p| ModelProvider {
                        id: p.id.clone(),
                        name: p.name.clone(),
                    })
                    .collect();

                let models: Vec<ModelInfo> = providers_response
                    .all
                    .iter()
                    .filter(|p| providers_response.connected.contains(&p.id))
                    .flat_map(|p| {
                        p.models.keys().map(|model_id| ModelInfo {
                            id: model_id.clone(),
                            name: model_id.clone(),
                            provider_id: Some(p.id.clone()),
                            reasoning_options: vec![],
                        })
                    })
                    .collect();

                (providers, models)
            }
            Err(e) => {
                tracing::warn!("[discover_all] Failed to fetch providers: {}", e);
                (vec![], vec![])
            }
        };

        // Process slash commands
        let slash_commands = match commands_result {
            Ok(commands) => {
                let defaults = slash_commands::hardcoded_slash_commands();
                let mut seen: std::collections::HashSet<String> = 
                    defaults.iter().map(|cmd| cmd.name.clone()).collect();

                let commands = commands
                    .into_iter()
                    .map(|cmd| {
                        let name = cmd.name.trim_start_matches('/').to_string();
                        SlashCommandDescription {
                            name,
                            description: cmd.description,
                        }
                    })
                    .filter(|cmd| seen.insert(cmd.name.clone()))
                    .chain(defaults)
                    .collect::<Vec<_>>();

                reorder_slash_commands(commands)
            }
            Err(e) => {
                tracing::warn!("[discover_all] Failed to fetch slash commands: {}", e);
                slash_commands::hardcoded_slash_commands()
            }
        };

        // 🔹 Process agents（确定默认 agent：sisyphus > build）
        let agents = match agents_result {
            Ok(agents_response) => {
                let default_agent_name = if agents_response
                    .iter()
                    .any(|a| a.name.eq_ignore_ascii_case("sisyphus"))
                {
                    "sisyphus"
                } else {
                    "build"
                };
                
                agents_response
                    .into_iter()
                    .map(|agent| ExecutorAgentInfo {
                        id: agent.name.clone(),
                        label: Self::to_title_case(&agent.name),
                        description: agent.description,
                        is_default: agent.name.eq_ignore_ascii_case(default_agent_name),
                    })
                    .collect()
            }
            Err(e) => {
                tracing::warn!("[discover_all] Failed to fetch agents: {}", e);
                vec![]
            }
        };

        Ok((providers, models, slash_commands, agents))
    }

    /// 独立获取 agents（用于单独刷新 agent 缓存）
    async fn discover_agents_only(&self, current_dir: &Path) -> Result<Vec<ExecutorAgentInfo>, ExecutorError> {
        use crate::env::RepoContext;
        use crate::executors::opencode::sdk;

        let env = ExecutionEnv::new(RepoContext::default(), false, String::new());
        let server = self.spawn_server(current_dir, &env).await?;

        let directory = current_dir.to_string_lossy().to_string();
        let client = reqwest::Client::builder()
            .default_headers(sdk::build_default_headers(&directory, &server.server_password))
            .build()
            .map_err(|err| ExecutorError::Io(std::io::Error::other(err)))?;

        let agents_response = sdk::list_agents(&client, &server.base_url, &directory).await?;

        // 确定默认 agent
        let default_agent_name = if agents_response
            .iter()
            .any(|a| a.name.eq_ignore_ascii_case("sisyphus"))
        {
            "sisyphus"
        } else {
            "build"
        };

        Ok(agents_response
            .into_iter()
            .map(|agent| ExecutorAgentInfo {
                id: agent.name.clone(),
                label: Self::to_title_case(&agent.name),
                description: agent.description,
                is_default: agent.name.eq_ignore_ascii_case(default_agent_name),
            })
            .collect())
    }

    async fn spawn_inner(
        &self,
        current_dir: &Path,
        prompt: &str,
        resume_session: Option<&str>,
        env: &ExecutionEnv,
        agent_override: Option<&str>,
    ) -> Result<SpawnedChild, ExecutorError> {
        let slash_command = OpencodeSlashCommand::parse(prompt);
        let combined_prompt = if slash_command.is_some() {
            prompt.to_string()
        } else {
            self.append_prompt.combine_prompt(prompt)
        };

        let (mut child, server_password) = self.spawn_server_process(current_dir, env).await?;
        let server_stdout = child.inner().stdout.take().ok_or_else(|| {
            ExecutorError::Io(std::io::Error::other("OpenCode server missing stdout"))
        })?;

        let stdout = create_stdout_pipe_writer(&mut child)?;
        let log_writer = LogWriter::new(stdout);

        let (exit_signal_tx, exit_signal_rx) = tokio::sync::oneshot::channel();
        let cancel = tokio_util::sync::CancellationToken::new();

        // Prepare config values that will be moved into the spawned task
        let directory = current_dir.to_string_lossy().to_string();
        let approvals = if self.auto_approve {
            None
        } else {
            self.approvals.clone()
        };
        // Use agent_override if provided, otherwise use self.agent
        let agent = agent_override.map(|a| a.to_string()).or(self.agent.clone());
        let model = self.model.clone();
        let model_variant = self.variant.clone();
        let auto_approve = self.auto_approve;
        let resume_session_id = resume_session.map(|s| s.to_string());
        let models_cache_key = self.compute_models_cache_key();
        let cancel_for_task = cancel.clone();
        let commit_reminder = env.commit_reminder;
        let commit_reminder_prompt = env.commit_reminder_prompt.clone();
        let repo_context = env.repo_context.clone();

        tokio::spawn(async move {
            // Wait for server to print listening URL
            let base_url = match wait_for_server_url(server_stdout, Some(log_writer.clone())).await
            {
                Ok(url) => {
                    tracing::info!("[spawn_inner] Got base_url from server: {}", url);
                    url
                },
                Err(err) => {
                    tracing::error!("[spawn_inner] Failed to get server URL: {}", err);
                    let _ = log_writer
                        .log_error(format!("OpenCode startup error: {err}"))
                        .await;
                    let _ = exit_signal_tx.send(ExecutorExitResult::Failure);
                    return;
                }
            };

            let config = RunConfig {
                base_url,
                directory,
                prompt: combined_prompt,
                resume_session_id,
                model,
                model_variant,
                agent,
                approvals,
                auto_approve,
                server_password,
                models_cache_key,
                commit_reminder,
                commit_reminder_prompt,
                repo_context,
            };

            let result = match slash_command {
                Some(command) => {
                    run_slash_command(config, log_writer.clone(), command, cancel_for_task).await
                }
                None => run_session(config, log_writer.clone(), cancel_for_task).await,
            };
            let exit_result = match result {
                Ok(()) => ExecutorExitResult::Success,
                Err(err) => {
                    let _ = log_writer
                        .log_error(format!("OpenCode executor error: {err}"))
                        .await;
                    ExecutorExitResult::Failure
                }
            };
            let _ = exit_signal_tx.send(exit_result);
        });

        Ok(SpawnedChild {
            child,
            exit_signal: Some(exit_signal_rx),
            cancel: Some(cancel),
        })
    }
}

fn format_tail(captured: Vec<String>) -> String {
    captured
        .into_iter()
        .rev()
        .take(12)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n")
}

async fn wait_for_server_url(
    stdout: tokio::process::ChildStdout,
    log_writer: Option<LogWriter>,
) -> Result<String, ExecutorError> {
    let mut lines = tokio::io::BufReader::new(stdout).lines();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(180);
    let mut captured: Vec<String> = Vec::new();

    loop {
        if tokio::time::Instant::now() > deadline {
            return Err(ExecutorError::Io(std::io::Error::other(format!(
                "Timed out waiting for OpenCode server to print listening URL.\nServer output tail:\n{}",
                format_tail(captured)
            ))));
        }

        let line = match tokio::time::timeout_at(deadline, lines.next_line()).await {
            Ok(Ok(Some(line))) => line,
            Ok(Ok(None)) => {
                return Err(ExecutorError::Io(std::io::Error::other(format!(
                    "OpenCode server exited before printing listening URL.\nServer output tail:\n{}",
                    format_tail(captured)
                ))));
            }
            Ok(Err(err)) => return Err(ExecutorError::Io(err)),
            Err(_) => continue,
        };

        if let Some(log_writer) = &log_writer {
            log_writer
                .log_event(&OpencodeExecutorEvent::StartupLog {
                    message: line.clone(),
                })
                .await?;
        }
        if captured.len() < 64 {
            captured.push(line.clone());
        }

        if let Some(url) = line.trim().strip_prefix("opencode server listening on ") {
            // Keep draining stdout to avoid backpressure on the server, but don't block startup.
            tokio::spawn(async move {
                let mut lines = tokio::io::BufReader::new(lines.into_inner()).lines();
                while let Ok(Some(_)) = lines.next_line().await {}
            });
            return Ok(url.trim().to_string());
        }
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Opencode {
    fn use_approvals(&mut self, approvals: Arc<dyn ExecutorApprovalService>) {
        self.approvals = Some(approvals);
    }

    async fn discover_options(
        &self,
        workdir: Option<&Path>,
        _repo_path: Option<&Path>,
    ) -> Result<futures::stream::BoxStream<'static, json_patch::Patch>, ExecutorError> {
        use crate::model_selector::ExecutorDiscoveredOptions;

        let defaults = hardcoded_slash_commands();
        let this = self.clone();
        let current_dir = workdir.map(|p| p.to_path_buf());
        let base_executor = BaseCodingAgent::Opencode;

        // 🔹 检查独立的 Model 缓存
        let model_cache = global_model_cache();
        let model_cached = model_cache.get(base_executor);
        
        // 🔹 检查独立的 Agent 缓存
        let agent_cache = global_agent_cache();
        let agent_cached = agent_cache.get(base_executor);

        // 🔹 两者都有缓存 → 直接返回合并结果
        if let (Some(model_opts), Some(agents)) = (&model_cached, &agent_cached) {
            tracing::info!("[discover_options] Both caches hit for executor: {:?}", base_executor);
            let mut opts = model_opts.as_ref().clone();
            opts.model_selector.agents = agents.as_ref().clone();
            return Ok(Box::pin(futures::stream::once(async move {
                patch::executor_discovered_options(opts.with_loading(false))
            })));
        }

        // 🔹 缓存未命中 - 返回 loading 状态
        let initial_options = ExecutorDiscoveredOptions {
            model_selector: opencode_default_model_selector(),
            slash_commands: defaults.clone(),
            loading_models: model_cached.is_none(),
            loading_agents: agent_cached.is_none(),
            loading_slash_commands: model_cached.is_none(),
            error: None,
        };
        let initial = patch::executor_discovered_options(initial_options);

        // 🔹 异步发现（按需获取）
        let discovery_stream = futures::stream::once(async move {
            let mut model_selector = opencode_default_model_selector();
            let mut slash_commands = defaults.clone();
            let mut agents = vec![];

            if let Some(dir) = &current_dir {
                tracing::info!("[discover_options] Starting discovery for dir: {}", dir.display());
                
                // 🔹 Model 缓存未命中 → 获取 models/commands（agents 也会一起获取）
                if model_cached.is_none() {
                    match this.discover_all(dir).await {
                        Ok((providers, models, commands, discovered_agents)) => {
                            tracing::info!("[discover_options] Discovered {} providers, {} models, {} commands, {} agents",
                                providers.len(), models.len(), commands.len(), discovered_agents.len());
                            model_selector.providers = providers;
                            model_selector.models = models;
                            slash_commands = commands;
                            agents = discovered_agents;

                            // 🔹 存入独立的 Model 缓存
                            let opts = ExecutorDiscoveredOptions {
                                model_selector: model_selector.clone(),
                                slash_commands: slash_commands.clone(),
                                loading_models: false,
                                loading_agents: false,
                                loading_slash_commands: false,
                                error: None,
                            };
                            global_model_cache().put(base_executor, opts);
                            
                            // 🔹 存入独立的 Agent 缓存
                            global_agent_cache().put(base_executor, agents.clone());
                            tracing::info!("[discover_options] Cached both model and agent data for executor: {:?}", base_executor);
                        }
                        Err(e) => {
                            tracing::warn!("[discover_options] Failed to discover OpenCode options: {}", e);
                        }
                    }
                } else {
                    // 🔹 使用缓存的 models/commands
                    if let Some(cached) = &model_cached {
                        model_selector = cached.model_selector.clone();
                        slash_commands = cached.slash_commands.clone();
                    }
                    
                    // 🔹 Agent 缓存未命中 → 单独获取 agents
                    if agent_cached.is_none() {
                        match this.discover_agents_only(dir).await {
                            Ok(discovered_agents) => {
                                tracing::info!("[discover_options] Discovered {} agents", discovered_agents.len());
                                agents = discovered_agents;
                                
                                // 🔹 存入独立的 Agent 缓存
                                global_agent_cache().put(base_executor, agents.clone());
                                tracing::info!("[discover_options] Cached agents for executor: {:?}", base_executor);
                            }
                            Err(e) => {
                                tracing::warn!("[discover_options] Failed to discover agents: {}", e);
                            }
                        }
                    }
                }
            } else {
                tracing::warn!("[discover_options] No current_dir provided, using defaults");
            }

            // 🔹 如果 agent 缓存有数据，使用缓存
            if agents.is_empty() {
                if let Some(cached_agents) = agent_cached {
                    agents = cached_agents.as_ref().clone();
                }
            }

            model_selector.agents = agents;

            let final_options = ExecutorDiscoveredOptions {
                model_selector,
                slash_commands,
                loading_models: false,
                loading_agents: false,
                loading_slash_commands: false,
                error: None,
            };

            patch::executor_discovered_options(final_options)
        });

        Ok(Box::pin(
            futures::stream::once(async move { initial }).chain(discovery_stream),
        ))
    }

    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
        agent: Option<&str>,
    ) -> Result<SpawnedChild, ExecutorError> {
        let env = setup_permissions_env(self.auto_approve, env);
        let env = setup_compaction_env(self.auto_compact, &env);
        self.spawn_inner(current_dir, prompt, None, &env, agent).await
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
        _reset_to_message_id: Option<&str>,
        env: &ExecutionEnv,
        model: Option<&str>,
        agent: Option<&str>,
    ) -> Result<SpawnedChild, ExecutorError> {
        // 如果传入新 model 或 agent，创建新的 Opencode 实例
        if model.is_some() || agent.is_some() {
            let mut new_self = self.clone();
            if let Some(m) = model {
                new_self.model = Some(m.to_string());
            }
            if let Some(a) = agent {
                new_self.agent = Some(a.to_string());
            }
            let env = setup_permissions_env(new_self.auto_approve, env);
            let env = setup_compaction_env(new_self.auto_compact, &env);
            return new_self.spawn_inner(current_dir, prompt, Some(session_id), &env, None).await;
        }
        let env = setup_permissions_env(self.auto_approve, env);
        let env = setup_compaction_env(self.auto_compact, &env);
        self.spawn_inner(current_dir, prompt, Some(session_id), &env, None)
            .await
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, worktree_path: &Path) {
        normalize_logs::normalize_logs(msg_store, worktree_path);
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        #[cfg(not(windows))]
        {
            let base_dirs = xdg::BaseDirectories::with_prefix("opencode");
            // First try opencode.json, then opencode.jsonc
            base_dirs
                .get_config_file("opencode.json")
                .filter(|p| p.exists())
                .or_else(|| base_dirs.get_config_file("opencode.jsonc"))
        }
        #[cfg(windows)]
        {
            let config_dir = std::env::var("XDG_CONFIG_HOME")
                .map(std::path::PathBuf::from)
                .ok()
                .or_else(|| dirs::home_dir().map(|p| p.join(".config")))
                .map(|p| p.join("opencode"))?;

            let path = Some(config_dir.join("opencode.json"))
                .filter(|p| p.exists())
                .unwrap_or_else(|| config_dir.join("opencode.jsonc"));
            Some(path)
        }
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        let mcp_config_found = self
            .default_mcp_config_path()
            .map(|p| p.exists())
            .unwrap_or(false);

        // Check multiple installation indicator paths:
        // 1. XDG config dir: $XDG_CONFIG_HOME/opencode
        // 2. XDG data dir: $XDG_DATA_HOME/opencode
        // 3. XDG state dir: $XDG_STATE_HOME/opencode
        // 4. OpenCode CLI home: ~/.opencode
        #[cfg(not(windows))]
        let installation_indicator_found = {
            let base_dirs = xdg::BaseDirectories::with_prefix("opencode");

            let config_dir_exists = base_dirs
                .get_config_home()
                .map(|config| config.exists())
                .unwrap_or(false);

            let data_dir_exists = base_dirs
                .get_data_home()
                .map(|data| data.exists())
                .unwrap_or(false);

            let state_dir_exists = base_dirs
                .get_state_home()
                .map(|state| state.exists())
                .unwrap_or(false);

            config_dir_exists || data_dir_exists || state_dir_exists
        };

        #[cfg(windows)]
        let installation_indicator_found = std::env::var("XDG_CONFIG_HOME")
            .ok()
            .map(std::path::PathBuf::from)
            .and_then(|p| p.join("opencode").exists().then_some(()))
            .or_else(|| {
                dirs::home_dir()
                    .and_then(|p| p.join(".config").join("opencode").exists().then_some(()))
            })
            .is_some();

        let home_opencode_exists = dirs::home_dir()
            .map(|home| home.join(".opencode").exists())
            .unwrap_or(false);

        if mcp_config_found || installation_indicator_found || home_opencode_exists {
            AvailabilityInfo::InstallationFound
        } else {
            AvailabilityInfo::NotFound
        }
    }
}

fn default_to_true() -> bool {
    true
}

fn setup_permissions_env(auto_approve: bool, env: &ExecutionEnv) -> ExecutionEnv {
    let mut env = env.clone();

    let permissions = match env.get("OPENCODE_PERMISSION") {
        Some(existing) => merge_question_deny(existing),
        None => build_default_permissions(auto_approve),
    };

    env.insert("OPENCODE_PERMISSION", &permissions);
    env
}

fn build_default_permissions(auto_approve: bool) -> String {
    if auto_approve {
        r#"{"question":"deny"}"#.to_string()
    } else {
        r#"{"edit":"ask","bash":"ask","webfetch":"ask","doom_loop":"ask","external_directory":"ask","question":"deny"}"#.to_string()
    }
}

fn merge_question_deny(existing_json: &str) -> String {
    let mut permissions: Map<String, serde_json::Value> =
        serde_json::from_str(existing_json.trim()).unwrap_or_default();

    permissions.insert(
        "question".to_string(),
        serde_json::Value::String("deny".to_string()),
    );

    serde_json::to_string(&permissions).unwrap_or_else(|_| r#"{"question":"deny"}"#.to_string())
}

fn setup_compaction_env(auto_compact: bool, env: &ExecutionEnv) -> ExecutionEnv {
    if !auto_compact {
        return env.clone();
    }

    let mut env = env.clone();
    let merged = merge_compaction_config(env.get("OPENCODE_CONFIG_CONTENT").map(String::as_str));
    env.insert("OPENCODE_CONFIG_CONTENT", merged);
    env
}

fn merge_compaction_config(existing_json: Option<&str>) -> String {
    let mut config: Map<String, Value> = existing_json
        .and_then(|value| serde_json::from_str(value.trim()).ok())
        .unwrap_or_default();

    let mut compaction = config
        .remove("compaction")
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();
    compaction.insert("auto".to_string(), Value::Bool(true));
    config.insert("compaction".to_string(), Value::Object(compaction));

    serde_json::to_string(&config).unwrap_or_else(|_| r#"{"compaction":{"auto":true}}"#.to_string())
}
