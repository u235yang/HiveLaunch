use std::{
    collections::HashMap,
    process::{Child, Command},
    sync::{Arc, Mutex},
};
use log::{info, warn, error};

pub struct ProcessManager {
    processes: Arc<Mutex<HashMap<u32, Child>>>,
}

impl ProcessManager {
    pub fn new() -> Self {
        ProcessManager {
            processes: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn spawn_process(
        &self,
        command_str: String,
        args: Vec<String>,
        workdir: String,
    ) -> Result<u32, String> {
        info!(
            "Attempting to spawn process: {} with args: {:?} in workdir: {}",
            command_str, args, workdir
        );

        let mut command = Command::new(&command_str);
        command.args(&args).current_dir(&workdir);

        match command.spawn() {
            Ok(child) => {
                let pid = child.id();
                let mut processes = self.processes.lock().map_err(|e| format!("Failed to acquire processes lock: {}", e))?;
                processes.insert(pid, child);
                info!("Process spawned successfully with PID: {}", pid);
                Ok(pid)
            }
            Err(e) => {
                error!("Failed to spawn process: {}", e);
                Err(format!("Failed to spawn process: {}", e))
            }
        }
    }

    pub fn kill_process(&self, pid: u32) -> Result<(), String> {
        info!("Attempting to kill process with PID: {}", pid);
        let mut processes = self.processes.lock().map_err(|e| format!("Failed to acquire processes lock: {}", e))?;
        if let Some(mut child) = processes.remove(&pid) {
            match child.kill() {
                Ok(_) => {
                    info!("Process with PID {} killed successfully.", pid);
                    Ok(())
                }
                Err(e) => {
                    error!("Failed to kill process with PID {}: {}", pid, e);
                    Err(format!("Failed to kill process with PID {}: {}", pid, e))
                }
            }
        } else {
            warn!("Process with PID {} not found or already exited.", pid);
            Err(format!("Process with PID {} not found or already exited.", pid))
        }
    }

    pub fn get_process_status(&self, pid: u32) -> Result<String, String> {
        info!("Attempting to get status for process with PID: {}", pid);
        let mut processes = self.processes.lock().map_err(|e| format!("Failed to acquire processes lock: {}", e))?;
        if let Some(child) = processes.get_mut(&pid) {
            match child.try_wait() {
                Ok(Some(status)) => {
                    let exit_status = if status.success() {
                        "exited successfully".to_string()
                    } else {
                        format!("exited with error: {:?}", status.code())
                    };
                    warn!("Process with PID {} {}. Removing from manager.", pid, exit_status);
                    processes.remove(&pid); // Remove dead process
                    Ok(format!("Process {} {}", pid, exit_status))
                }
                Ok(None) => {
                    info!("Process with PID {} is still running.", pid);
                    Ok(format!("Process {} is running", pid))
                }
                Err(e) => {
                    error!("Failed to get status for process with PID {}: {}", pid, e);
                    Err(format!("Failed to get status for process with PID {}: {}", pid, e))
                }
            }
        } else {
            warn!("Process with PID {} not found in manager.", pid);
            Ok(format!("Process {} not found", pid))
        }
    }
}
