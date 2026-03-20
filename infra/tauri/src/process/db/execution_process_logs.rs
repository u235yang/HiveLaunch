//! Execution process logs persistence module.
//!
//! This module provides functionality to persist and retrieve execution logs
//! in JSONL format to/from SQLite database.
//!
//! # Design
//!
//! Similar to vibe-kanban's approach:
//! - Each log message (LogMsg) is serialized as a single JSON line
//! - Lines are appended to the database in order
//! - Historical logs can be retrieved and parsed back into LogMsg

use serde::{Deserialize, Serialize};
use sqlx::{SqlitePool, Row};
use bee_workspace_utils::log_msg::LogMsg;

/// Database record for execution process logs.
///
/// Each record contains a single JSONL line representing one `LogMsg`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionProcessLogs {
    /// The execution process ID this log belongs to
    pub execution_id: String,
    /// A single JSONL line (serialized LogMsg with newline)
    pub logs: String,
    /// Size in bytes of the log line
    pub byte_size: i64,
    /// Timestamp when this log was inserted
    pub inserted_at: String,
}

impl ExecutionProcessLogs {
    /// Append a JSONL line to the logs for an execution process.
    ///
    /// # Arguments
    ///
    /// * `pool` - SQLite connection pool
    /// * `execution_id` - The execution process ID
    /// * `jsonl_line` - A single JSONL line (should include newline)
    ///
    /// # Example
    ///
    /// ```ignore
    /// let jsonl = serde_json::to_string(&log_msg)?;
    /// ExecutionProcessLogs::append_log_line(&pool, "exec-123", &format!("{}\n", jsonl)).await?;
    /// ```
    pub async fn append_log_line(
        pool: &SqlitePool,
        execution_id: &str,
        jsonl_line: &str,
    ) -> Result<(), sqlx::Error> {
        // Guard against orphan logs: only allow append when execution_process exists.
        let exists: Option<i64> = sqlx::query_scalar(
            r#"SELECT 1 FROM execution_processes WHERE id = $1 LIMIT 1"#,
        )
        .bind(execution_id)
        .fetch_optional(pool)
        .await?;
        if exists.is_none() {
            return Err(sqlx::Error::RowNotFound);
        }

        let byte_size = jsonl_line.len() as i64;
        sqlx::query(
            r#"INSERT INTO execution_process_logs (execution_id, logs, byte_size, inserted_at)
               VALUES ($1, $2, $3, datetime('now', 'subsec'))"#,
        )
        .bind(execution_id)
        .bind(jsonl_line)
        .bind(byte_size)
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Find all logs for an execution process.
    ///
    /// Returns logs in chronological order (oldest first).
    pub async fn find_by_execution_id(
        pool: &SqlitePool,
        execution_id: &str,
    ) -> Result<Vec<Self>, sqlx::Error> {
        let rows = sqlx::query(
            r#"SELECT execution_id, logs, byte_size, inserted_at
               FROM execution_process_logs
               WHERE execution_id = $1
               ORDER BY inserted_at ASC"#,
        )
        .bind(execution_id)
        .fetch_all(pool)
        .await?;

        let records = rows
            .iter()
            .map(|row| Self {
                execution_id: row.get("execution_id"),
                logs: row.get("logs"),
                byte_size: row.get("byte_size"),
                inserted_at: row.get("inserted_at"),
            })
            .collect();

        Ok(records)
    }

    /// Parse JSONL logs back into a vector of raw log strings.
    ///
    /// This is useful for reconstructing the log history without
    /// deserializing to specific types.
    pub fn parse_logs_to_strings(records: &[Self]) -> Vec<String> {
        records
            .iter()
            .flat_map(|record| {
                record
                    .logs
                    .lines()
                    .filter(|line| !line.trim().is_empty())
                    .map(|s| s.to_string())
            })
            .collect()
    }

    /// Parse JSONL logs back into typed `LogMsg` values.
    pub fn parse_logs(records: &[Self]) -> Result<Vec<LogMsg>, serde_json::Error> {
        let mut parsed = Vec::new();
        for line in Self::parse_logs_to_strings(records) {
            let msg: LogMsg = serde_json::from_str(&line)?;
            parsed.push(msg);
        }
        Ok(parsed)
    }
}

/// Initialize the SQLite connection pool.
///
/// # Arguments
///
/// * `database_url` - Path to the SQLite database file
///
/// # Example
///
/// ```ignore
/// let pool = init_db_pool("/path/to/hivelaunch.db").await?;
/// ```
pub async fn init_db_pool(database_url: &str) -> Result<SqlitePool, sqlx::Error> {
    let options = sqlx::sqlite::SqliteConnectOptions::new()
        .filename(database_url)
        .create_if_missing(true);

    let pool = SqlitePool::connect_with(options).await?;

    // Run migrations (ensure execution_process_logs table exists)
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS execution_process_logs (
            execution_id TEXT NOT NULL,
            logs TEXT NOT NULL,
            byte_size INTEGER NOT NULL,
            inserted_at TEXT NOT NULL
        )"#,
    )
    .execute(&pool)
    .await?;

    // Create index if not exists
    sqlx::query(
        r#"CREATE INDEX IF NOT EXISTS idx_execution_process_logs_execution_id
           ON execution_process_logs(execution_id)"#,
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS execution_processes (
            id TEXT PRIMARY KEY NOT NULL,
            session_id TEXT NOT NULL,
            workspace_id TEXT NOT NULL,
            run_reason TEXT NOT NULL,
            executor_action TEXT,
            status TEXT NOT NULL,
            exit_code INTEGER,
            dropped INTEGER DEFAULT 0 NOT NULL,
            started_at INTEGER NOT NULL,
            completed_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )"#,
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        r#"CREATE INDEX IF NOT EXISTS idx_execution_processes_session_id
           ON execution_processes(session_id)"#,
    )
    .execute(&pool)
    .await?;

    // ========== Create tables for swarm and project management ==========

    // projects table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            default_agent_cli TEXT DEFAULT 'OPENCODE' NOT NULL,
            default_agent_name TEXT DEFAULT 'sisyphus' NOT NULL,
            repo_path TEXT NOT NULL,
            target_branch TEXT DEFAULT 'main' NOT NULL,
            setup_script TEXT,
            copy_files TEXT,
            workspace_dir TEXT,
            created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
            updated_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL
        )"#,
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY NOT NULL,
            project_id TEXT NOT NULL,
            title TEXT,
            description TEXT NOT NULL,
            status TEXT DEFAULT 'todo' NOT NULL,
            agent_cli TEXT DEFAULT 'OPENCODE' NOT NULL,
            model_id TEXT,
            task_type TEXT DEFAULT 'normal' NOT NULL,
            active_workspace_id TEXT,
            active_session_id TEXT,
            last_attempt_summary TEXT,
            attempt_count INTEGER DEFAULT 0 NOT NULL,
            direct_branch TEXT,
            position INTEGER DEFAULT 0 NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE no action ON DELETE cascade
        )"#,
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        r#"CREATE INDEX IF NOT EXISTS idx_tasks_project_id
           ON tasks(project_id)"#,
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        r#"CREATE INDEX IF NOT EXISTS idx_tasks_project_status
           ON tasks(project_id, status)"#,
    )
    .execute(&pool)
    .await?;

    let task_columns = sqlx::query("PRAGMA table_info(tasks)")
        .fetch_all(&pool)
        .await?;
    let has_active_workspace_id = task_columns.iter().any(|row| {
        row.try_get::<String, _>("name")
            .map(|column| column == "active_workspace_id")
            .unwrap_or(false)
    });
    if !has_active_workspace_id {
        sqlx::query("ALTER TABLE tasks ADD COLUMN active_workspace_id TEXT")
            .execute(&pool)
            .await?;
    }
    let has_active_session_id = task_columns.iter().any(|row| {
        row.try_get::<String, _>("name")
            .map(|column| column == "active_session_id")
            .unwrap_or(false)
    });
    if !has_active_session_id {
        sqlx::query("ALTER TABLE tasks ADD COLUMN active_session_id TEXT")
            .execute(&pool)
            .await?;
    }
    let has_last_attempt_summary = task_columns.iter().any(|row| {
        row.try_get::<String, _>("name")
            .map(|column| column == "last_attempt_summary")
            .unwrap_or(false)
    });
    if !has_last_attempt_summary {
        sqlx::query("ALTER TABLE tasks ADD COLUMN last_attempt_summary TEXT")
            .execute(&pool)
            .await?;
    }
    let has_attempt_count = task_columns.iter().any(|row| {
        row.try_get::<String, _>("name")
            .map(|column| column == "attempt_count")
            .unwrap_or(false)
    });
    if !has_attempt_count {
        sqlx::query("ALTER TABLE tasks ADD COLUMN attempt_count INTEGER DEFAULT 0 NOT NULL")
            .execute(&pool)
            .await?;
    }
    sqlx::query(
        r#"CREATE INDEX IF NOT EXISTS idx_tasks_active_workspace_id
           ON tasks(active_workspace_id)"#,
    )
    .execute(&pool)
    .await?;
    sqlx::query(
        r#"CREATE INDEX IF NOT EXISTS idx_tasks_active_session_id
           ON tasks(active_session_id)"#,
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY NOT NULL,
            task_id TEXT NOT NULL,
            branch TEXT NOT NULL,
            role TEXT DEFAULT 'primary' NOT NULL,
            source_workspace_id TEXT,
            base_branch TEXT,
            agent_working_dir TEXT,
            setup_completed_at INTEGER,
            agent_cli TEXT DEFAULT 'OPENCODE' NOT NULL,
            archived INTEGER DEFAULT 0 NOT NULL,
            pinned INTEGER DEFAULT 0 NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON UPDATE no action ON DELETE cascade
        )"#,
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        r#"CREATE INDEX IF NOT EXISTS idx_workspaces_task_id
           ON workspaces(task_id)"#,
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        r#"CREATE INDEX IF NOT EXISTS idx_workspaces_task_role
           ON workspaces(task_id, role)"#,
    )
    .execute(&pool)
    .await?;

    let workspace_columns = sqlx::query("PRAGMA table_info(workspaces)")
        .fetch_all(&pool)
        .await?;
    let has_role = workspace_columns.iter().any(|row| {
        row.try_get::<String, _>("name")
            .map(|column| column == "role")
            .unwrap_or(false)
    });
    if !has_role {
        sqlx::query("ALTER TABLE workspaces ADD COLUMN role TEXT DEFAULT 'primary' NOT NULL")
            .execute(&pool)
            .await?;
    }
    let has_source_workspace_id = workspace_columns.iter().any(|row| {
        row.try_get::<String, _>("name")
            .map(|column| column == "source_workspace_id")
            .unwrap_or(false)
    });
    if !has_source_workspace_id {
        sqlx::query("ALTER TABLE workspaces ADD COLUMN source_workspace_id TEXT")
            .execute(&pool)
            .await?;
    }

    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY NOT NULL,
            workspace_id TEXT NOT NULL,
            agent_cli TEXT DEFAULT 'OPENCODE' NOT NULL,
            status TEXT DEFAULT 'running' NOT NULL,
            attempt_no INTEGER DEFAULT 1 NOT NULL,
            parent_session_id TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON UPDATE no action ON DELETE cascade,
            FOREIGN KEY (parent_session_id) REFERENCES sessions(id) ON UPDATE no action ON DELETE set null
        )"#,
    )
    .execute(&pool)
    .await?;

    let session_columns = sqlx::query("PRAGMA table_info(sessions)")
        .fetch_all(&pool)
        .await?;
    let has_session_status = session_columns.iter().any(|row| {
        row.try_get::<String, _>("name")
            .map(|column| column == "status")
            .unwrap_or(false)
    });
    if !has_session_status {
        sqlx::query("ALTER TABLE sessions ADD COLUMN status TEXT DEFAULT 'running' NOT NULL")
            .execute(&pool)
            .await?;
    }
    let has_attempt_no = session_columns.iter().any(|row| {
        row.try_get::<String, _>("name")
            .map(|column| column == "attempt_no")
            .unwrap_or(false)
    });
    if !has_attempt_no {
        sqlx::query("ALTER TABLE sessions ADD COLUMN attempt_no INTEGER DEFAULT 1 NOT NULL")
            .execute(&pool)
            .await?;
    }
    let has_parent_session_id = session_columns.iter().any(|row| {
        row.try_get::<String, _>("name")
            .map(|column| column == "parent_session_id")
            .unwrap_or(false)
    });
    if !has_parent_session_id {
        sqlx::query("ALTER TABLE sessions ADD COLUMN parent_session_id TEXT")
            .execute(&pool)
            .await?;
    }

    sqlx::query(
        r#"CREATE INDEX IF NOT EXISTS idx_sessions_workspace_id
           ON sessions(workspace_id)"#,
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        r#"CREATE INDEX IF NOT EXISTS idx_sessions_workspace_attempt
           ON sessions(workspace_id, attempt_no DESC)"#,
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS task_activity_logs (
            id TEXT PRIMARY KEY NOT NULL,
            task_id TEXT NOT NULL,
            workspace_id TEXT,
            session_id TEXT,
            event_type TEXT NOT NULL,
            summary TEXT NOT NULL,
            metadata TEXT,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON UPDATE no action ON DELETE cascade,
            FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON UPDATE no action ON DELETE set null,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON UPDATE no action ON DELETE set null
        )"#,
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        r#"CREATE INDEX IF NOT EXISTS idx_task_activity_logs_task_created
           ON task_activity_logs(task_id, created_at DESC)"#,
    )
    .execute(&pool)
    .await?;

    // project_swarm_bindings table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS project_swarm_bindings (
            id TEXT PRIMARY KEY NOT NULL,
            project_id TEXT NOT NULL,
            swarm_template_id TEXT NOT NULL,
            overrides_json TEXT,
            is_active INTEGER DEFAULT false NOT NULL,
            bound_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
            updated_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE no action ON DELETE cascade
        )"#,
    )
    .execute(&pool)
    .await?;

    let binding_fk_rows = sqlx::query("PRAGMA foreign_key_list(project_swarm_bindings)")
        .fetch_all(&pool)
        .await?;
    let has_global_swarm_fk = binding_fk_rows.iter().any(|row| {
        row.try_get::<String, _>("table")
            .map(|table_name| table_name == "global_swarms")
            .unwrap_or(false)
    });
    let binding_columns = sqlx::query("PRAGMA table_info(project_swarm_bindings)")
        .fetch_all(&pool)
        .await?;
    let has_swarm_template_id = binding_columns.iter().any(|row| {
        row.try_get::<String, _>("name")
            .map(|column| column == "swarm_template_id")
            .unwrap_or(false)
    });
    let has_global_swarm_id = binding_columns.iter().any(|row| {
        row.try_get::<String, _>("name")
            .map(|column| column == "global_swarm_id")
            .unwrap_or(false)
    });
    if has_global_swarm_fk || !has_swarm_template_id || has_global_swarm_id {
        sqlx::query("ALTER TABLE project_swarm_bindings RENAME TO project_swarm_bindings_legacy")
            .execute(&pool)
            .await?;
        sqlx::query(
            r#"CREATE TABLE project_swarm_bindings (
                id TEXT PRIMARY KEY NOT NULL,
                project_id TEXT NOT NULL,
                swarm_template_id TEXT NOT NULL,
                overrides_json TEXT,
                is_active INTEGER DEFAULT false NOT NULL,
                bound_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
                updated_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE no action ON DELETE cascade
            )"#,
        )
        .execute(&pool)
        .await?;
        if has_swarm_template_id {
            sqlx::query(
                r#"INSERT INTO project_swarm_bindings
                   (id, project_id, swarm_template_id, overrides_json, is_active, bound_at, updated_at)
                   SELECT id, project_id, swarm_template_id, overrides_json, is_active, bound_at, updated_at
                   FROM project_swarm_bindings_legacy"#,
            )
            .execute(&pool)
            .await?;
        } else {
            sqlx::query(
                r#"INSERT INTO project_swarm_bindings
                   (id, project_id, swarm_template_id, overrides_json, is_active, bound_at, updated_at)
                   SELECT id, project_id, global_swarm_id, overrides_json, is_active, bound_at, updated_at
                   FROM project_swarm_bindings_legacy"#,
            )
            .execute(&pool)
            .await?;
        }
        sqlx::query("DROP TABLE project_swarm_bindings_legacy")
            .execute(&pool)
            .await?;
    }

    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS images (
            id TEXT PRIMARY KEY NOT NULL,
            file_path TEXT NOT NULL,
            original_name TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            hash TEXT NOT NULL UNIQUE,
            created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL
        )"#,
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS task_images (
            task_id TEXT NOT NULL,
            image_id TEXT NOT NULL,
            created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
            PRIMARY KEY (task_id, image_id),
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON UPDATE no action ON DELETE cascade,
            FOREIGN KEY (image_id) REFERENCES images(id) ON UPDATE no action ON DELETE cascade
        )"#,
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        r#"CREATE INDEX IF NOT EXISTS idx_task_images_task_id
           ON task_images(task_id)"#,
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        r#"CREATE INDEX IF NOT EXISTS idx_task_images_image_id
           ON task_images(image_id)"#,
    )
    .execute(&pool)
    .await?;

    log::info!("[DB] Database pool initialized: {}", database_url);

    Ok(pool)
}
