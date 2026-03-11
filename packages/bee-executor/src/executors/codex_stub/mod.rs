// Codex stub - 提供 LogWriter 供其他模块使用
// Codex executor 本身已禁用

use std::sync::Arc;
use tokio::io::{AsyncWrite, AsyncWriteExt, BufWriter};

/// LogWriter stub for ClaudeCode executor
#[derive(Clone)]
pub struct LogWriter {
    writer: Arc<tokio::sync::Mutex<BufWriter<std::pin::Pin<Box<dyn AsyncWrite + Send + Unpin>>>>>,
}

impl LogWriter {
    pub fn new(writer: impl AsyncWrite + Send + Unpin + 'static) -> Self {
        Self {
            writer: Arc::new(tokio::sync::Mutex::new(BufWriter::new(Box::pin(writer)))),
        }
    }

    pub async fn log_raw(&self, raw: &str) -> Result<(), crate::executors::ExecutorError> {
        let mut guard = self.writer.lock().await;
        guard
            .write_all(raw.as_bytes())
            .await
            .map_err(|e| crate::executors::ExecutorError::Io(e))?;
        guard
            .write_all(b"\n")
            .await
            .map_err(|e| crate::executors::ExecutorError::Io(e))?;
        guard
            .flush()
            .await
            .map_err(|e| crate::executors::ExecutorError::Io(e))?;
        Ok(())
    }
}
