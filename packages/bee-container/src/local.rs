// Local Container Implementation
// 基于 vibe-kanban crates/local-deployment/src/container.rs 迁移

use std::{path::PathBuf, sync::Arc};
use std::collections::HashMap;
use tokio::sync::{RwLock, broadcast};
use uuid::Uuid;

use crate::types::{ContainerError, Workspace};
use bee_workspace_utils::msg_store::MsgStore;

// Type aliases
type WorkspaceMap = HashMap<String, Workspace>;
type MsgStoreMap = HashMap<Uuid, Arc<MsgStore>>;

/// Local container for agent execution
/// 直接在本地文件系统执行 agent，不需要 Docker
pub struct LocalContainer {
    /// Active workspaces
    workspaces: RwLock<WorkspaceMap>,
    /// Message stores by execution_id
    msg_stores: RwLock<MsgStoreMap>,
    /// Event broadcaster for frontend
    event_broadcaster: broadcast::Sender<()>,
}

impl LocalContainer {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(1000);
        Self {
            workspaces: RwLock::new(WorkspaceMap::new()),
            msg_stores: RwLock::new(MsgStoreMap::new()),
            event_broadcaster: tx,
        }
    }

    /// Create a new workspace
    pub async fn create_workspace(
        &self,
        id: String,
        path: PathBuf,
        branch: String,
        base_branch: Option<String>,
    ) -> Result<Workspace, ContainerError> {
        let workspace = Workspace {
            id: Uuid::new_v4(),
            name: id.clone(),
            path,
            branch,
            base_branch,
            container_ref: None,
        };

        let mut workspaces = self.workspaces.write().await;
        workspaces.insert(id, workspace.clone());
        
        Ok(workspace)
    }

    /// Get workspace by ID
    pub async fn get_workspace(&self, id: &str) -> Option<Workspace> {
        let workspaces = self.workspaces.read().await;
        workspaces.get(id).cloned()
    }

    /// Remove workspace
    pub async fn remove_workspace(&self, id: &str) -> Option<Workspace> {
        let mut workspaces = self.workspaces.write().await;
        workspaces.remove(id)
    }

    /// Start execution in a workspace
    /// 
    /// 注意：这个函数需要外部传入 agent 实例和 spawn 结果
    /// 实际的 agent 启动逻辑应该在调用者中处理
    pub async fn start_execution(
        &self,
        workspace_id: String,
        execution_id: Uuid,
    ) -> Result<(), ContainerError> {
        // 验证 workspace 存在
        let workspace = {
            let workspaces = self.workspaces.read().await;
            workspaces.get(&workspace_id).cloned()
        };

        if workspace.is_none() {
            return Err(ContainerError::WorkspaceNotFound(workspace_id));
        }

        // 创建消息 store
        let msg_store = Arc::new(MsgStore::new());
        {
            let mut stores = self.msg_stores.write().await;
            stores.insert(execution_id, msg_store.clone());
        }

        // 发送 ready 事件
        msg_store.push(bee_workspace_utils::log_msg::LogMsg::Ready);

        Ok(())
    }

    /// Stop execution
    pub async fn stop_execution(&self, execution_id: Uuid) -> Result<(), ContainerError> {
        // 移除消息 store
        let store = {
            let mut stores = self.msg_stores.write().await;
            stores.remove(&execution_id)
        };

        if store.is_none() {
            return Err(ContainerError::Execution("Execution not found".to_string()));
        }

        // 发送 finished 事件
        if let Some(s) = store {
            s.push(bee_workspace_utils::log_msg::LogMsg::Finished);
        }

        Ok(())
    }

    /// Get message store for execution
    pub async fn get_msg_store(&self, execution_id: Uuid) -> Option<Arc<MsgStore>> {
        let stores = self.msg_stores.read().await;
        stores.get(&execution_id).cloned()
    }

    /// Subscribe to events
    pub fn subscribe(&self) -> broadcast::Receiver<()> {
        self.event_broadcaster.subscribe()
    }
}

impl Default for LocalContainer {
    fn default() -> Self {
        Self::new()
    }
}
