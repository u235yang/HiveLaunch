//! Cross-platform shell command utilities

use std::{
    collections::HashSet,
    env::{join_paths, split_paths},
    ffi::{OsStr, OsString},
    path::{Path, PathBuf},
};

/// Returns the appropriate shell command and argument for the current platform.
pub fn get_shell_command() -> (String, &'static str) {
    if cfg!(windows) {
        ("cmd".into(), "/C")
    } else {
        ("sh".into(), "-c")
    }
}

/// Returns the path to an interactive shell for the current platform.
pub async fn get_interactive_shell() -> PathBuf {
    if cfg!(windows) {
        PathBuf::from("cmd.exe")
    } else {
        PathBuf::from("/bin/sh")
    }
}

/// Resolve an executable by name from PATH.
pub async fn resolve_executable_path(executable: &str) -> Option<PathBuf> {
    if executable.trim().is_empty() {
        return None;
    }

    let path = Path::new(executable);
    if path.is_absolute() && path.is_file() {
        return Some(path.to_path_buf());
    }

    // Simple which implementation
    let executable = executable.to_string();
    let result = tokio::task::spawn_blocking(move || {
        let path_var = match std::env::var_os("PATH") {
            Some(v) => v,
            None => return None,
        };
        let paths = split_paths(&path_var);
        
        for dir in paths {
            let full_path = dir.join(&executable);
            if full_path.is_file() {
                return Some(full_path);
            }
        }
        None
    }).await.ok().flatten();

    result
}

pub fn resolve_executable_path_blocking(executable: &str) -> Option<PathBuf> {
    let executable = executable.to_string();
    tokio::runtime::Handle::current()
        .block_on(resolve_executable_path(&executable))
}

/// Merge two PATH strings into a single, de-duplicated PATH.
pub fn merge_paths(primary: impl AsRef<OsStr>, secondary: impl AsRef<OsStr>) -> OsString {
    let mut seen = HashSet::<PathBuf>::new();
    let mut merged = Vec::<PathBuf>::new();

    for p in split_paths(primary.as_ref()).chain(split_paths(secondary.as_ref())) {
        if !p.as_os_str().is_empty() && seen.insert(p.clone()) {
            merged.push(p);
        }
    }

    join_paths(merged).unwrap_or_default()
}
