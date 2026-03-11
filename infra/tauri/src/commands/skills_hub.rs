use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledSkill {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillsHubStatus {
    pub hub_dir: String,
    pub exists: bool,
    pub lock_file_exists: bool,
    pub installed_skills: Vec<InstalledSkill>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillsCommandResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
}

pub fn default_skills_hub_dir() -> PathBuf {
    if let Some(home) = dirs::home_dir() {
        return home.join(".hivelaunch").join("skills-hub");
    }
    PathBuf::from(".hivelaunch").join("skills-hub")
}

pub fn resolve_skills_hub_dir(skills_hub_dir: Option<&str>) -> PathBuf {
    if let Some(dir) = skills_hub_dir {
        if !dir.trim().is_empty() {
            return PathBuf::from(dir);
        }
    }
    default_skills_hub_dir()
}

pub fn list_installed_skills(hub_dir: &Path) -> Result<Vec<InstalledSkill>, String> {
    let skills_dir = hub_dir.join(".agents").join("skills");
    if !skills_dir.exists() {
        return Ok(Vec::new());
    }

    let mut installed = Vec::new();
    let entries = fs::read_dir(&skills_dir)
        .map_err(|e| format!("Failed to read skills directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read skill entry: {}", e))?;
        let file_type = entry
            .file_type()
            .map_err(|e| format!("Failed to read skill file type: {}", e))?;
        if !file_type.is_dir() {
            continue;
        }
        let path = entry.path();
        let skill_md = path.join("skill.md");
        if !skill_md.exists() {
            continue;
        }
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            installed.push(InstalledSkill {
                name: name.to_string(),
                path: path.to_string_lossy().to_string(),
            });
        }
    }

    installed.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(installed)
}

pub fn get_skills_hub_status(hub_dir: &Path) -> Result<SkillsHubStatus, String> {
    let installed_skills = list_installed_skills(hub_dir)?;
    Ok(SkillsHubStatus {
        hub_dir: hub_dir.to_string_lossy().to_string(),
        exists: hub_dir.exists(),
        lock_file_exists: hub_dir.join("skills-lock.json").exists(),
        installed_skills,
    })
}

fn ensure_hub_dir(hub_dir: &Path) -> Result<(), String> {
    if !hub_dir.exists() {
        fs::create_dir_all(hub_dir)
            .map_err(|e| format!("Failed to create skills hub directory: {}", e))?;
    }
    Ok(())
}

fn validate_text_input(value: &str, field: &str, max_len: usize) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err(format!("{} is required", field));
    }
    if value.len() > max_len {
        return Err(format!("{} is too long", field));
    }
    Ok(())
}

fn write_mock_install(hub_dir: &Path, skill: &str) -> Result<(), String> {
    let skill_dir = hub_dir.join(".agents").join("skills").join(skill);
    fs::create_dir_all(&skill_dir).map_err(|e| format!("Failed to create mock skill directory: {}", e))?;
    fs::write(skill_dir.join("skill.md"), format!("# {}", skill))
        .map_err(|e| format!("Failed to write mock skill: {}", e))?;
    let lock_path = hub_dir.join("skills-lock.json");
    fs::write(
        &lock_path,
        serde_json::to_string_pretty(&json!({
            "version": 1,
            "skills": [skill]
        }))
        .map_err(|e| format!("Failed to serialize lock file: {}", e))?,
    )
    .map_err(|e| format!("Failed to write lock file: {}", e))?;
    Ok(())
}

fn write_mock_remove(hub_dir: &Path, skill: &str) -> Result<(), String> {
    let skill_dir = hub_dir.join(".agents").join("skills").join(skill);
    if skill_dir.exists() {
        fs::remove_dir_all(skill_dir).map_err(|e| format!("Failed to remove mock skill directory: {}", e))?;
    }
    Ok(())
}

fn run_skills_command(hub_dir: &Path, args: &[String]) -> Result<SkillsCommandResult, String> {
    ensure_hub_dir(hub_dir)?;

    if std::env::var("BEE_SKILLS_MOCK").ok().as_deref() == Some("1") {
        let head = args.first().map(String::as_str).unwrap_or("");
        if head == "find" {
            return Ok(SkillsCommandResult {
                success: true,
                stdout: "vercel-react-best-practices\nzustand-state-management\ntanstack-query-best-practices".to_string(),
                stderr: String::new(),
                exit_code: Some(0),
            });
        }
        if head == "add" && args.iter().any(|arg| arg == "--list") {
            return Ok(SkillsCommandResult {
                success: true,
                stdout: "vercel-react-best-practices\nzustand-state-management".to_string(),
                stderr: String::new(),
                exit_code: Some(0),
            });
        }
        if head == "add" {
            let skill = args
                .windows(2)
                .find(|window| window[0] == "--skill")
                .map(|window| window[1].clone())
                .ok_or_else(|| "skill is required".to_string())?;
            write_mock_install(hub_dir, &skill)?;
            return Ok(SkillsCommandResult {
                success: true,
                stdout: format!("Installed {}", skill),
                stderr: String::new(),
                exit_code: Some(0),
            });
        }
        if head == "remove" {
            let skill = args.get(1).ok_or_else(|| "skill is required".to_string())?;
            write_mock_remove(hub_dir, skill)?;
            return Ok(SkillsCommandResult {
                success: true,
                stdout: format!("Removed {}", skill),
                stderr: String::new(),
                exit_code: Some(0),
            });
        }
        if head == "update" {
            return Ok(SkillsCommandResult {
                success: true,
                stdout: "Updated skills".to_string(),
                stderr: String::new(),
                exit_code: Some(0),
            });
        }
    }

    let output = Command::new("npx")
        .arg("skills")
        .args(args)
        .current_dir(hub_dir)
        .output()
        .map_err(|e| format!("Failed to run skills command: {}", e))?;

    Ok(SkillsCommandResult {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
        exit_code: output.status.code(),
    })
}

pub fn skills_find(hub_dir: &Path, query: &str) -> Result<SkillsCommandResult, String> {
    validate_text_input(query, "query", 200)?;
    run_skills_command(hub_dir, &[String::from("find"), query.trim().to_string()])
}

pub fn skills_repo_list(hub_dir: &Path, repo: &str) -> Result<SkillsCommandResult, String> {
    validate_text_input(repo, "repo", 300)?;
    run_skills_command(
        hub_dir,
        &[String::from("add"), repo.trim().to_string(), String::from("--list")],
    )
}

pub fn skills_install(
    hub_dir: &Path,
    repo: &str,
    skill: &str,
    agent: Option<&str>,
) -> Result<SkillsCommandResult, String> {
    validate_text_input(repo, "repo", 300)?;
    validate_text_input(skill, "skill", 200)?;
    let mut args = vec![
        String::from("add"),
        repo.trim().to_string(),
        String::from("--skill"),
        skill.trim().to_string(),
        String::from("--agent"),
        agent.unwrap_or("opencode").trim().to_string(),
        String::from("--copy"),
        String::from("-y"),
    ];
    if args[5].is_empty() {
        args[5] = "opencode".to_string();
    }
    run_skills_command(hub_dir, &args)
}

pub fn skills_remove(hub_dir: &Path, skill: &str) -> Result<SkillsCommandResult, String> {
    validate_text_input(skill, "skill", 200)?;
    run_skills_command(hub_dir, &[String::from("remove"), skill.trim().to_string()])
}

pub fn skills_update(hub_dir: &Path) -> Result<SkillsCommandResult, String> {
    run_skills_command(hub_dir, &[String::from("update")])
}

const SKILLS_SEARCH_API: &str = "https://skills.sh/api/search";
const DEFAULT_SEARCH_LIMIT: u32 = 20;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchSkillResult {
    pub owner: String,
    pub repo: String,
    pub skill: String,
    pub installs: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillsSearchApiResponse {
    skills: Vec<SkillsSearchApiSkill>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillsSearchApiSkill {
    skill_id: String,
    source: String,
    installs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillsSearchResult {
    pub success: bool,
    pub results: Vec<SearchSkillResult>,
    pub error: Option<String>,
}

pub async fn skills_search_api(query: &str, limit: Option<u32>) -> Result<SkillsSearchResult, String> {
    let search_query = query.trim();
    if search_query.is_empty() {
        return Ok(SkillsSearchResult {
            success: true,
            results: Vec::new(),
            error: None,
        });
    }

    if std::env::var("BEE_SKILLS_MOCK").ok().as_deref() == Some("1") {
        return Ok(SkillsSearchResult {
            success: true,
            results: vec![
                SearchSkillResult {
                    owner: "vercel-labs".to_string(),
                    repo: "agent-skills".to_string(),
                    skill: "vercel-react-best-practices".to_string(),
                    installs: 181_000,
                },
                SearchSkillResult {
                    owner: "vercel-labs".to_string(),
                    repo: "agent-skills".to_string(),
                    skill: "tanstack-query-best-practices".to_string(),
                    installs: 120_000,
                },
                SearchSkillResult {
                    owner: "vercel-labs".to_string(),
                    repo: "agent-skills".to_string(),
                    skill: "zustand-state-management".to_string(),
                    installs: 95_000,
                },
                SearchSkillResult {
                    owner: "vercel-labs".to_string(),
                    repo: "agent-skills".to_string(),
                    skill: "react-hook-form-zod".to_string(),
                    installs: 88_000,
                },
                SearchSkillResult {
                    owner: "vercel-labs".to_string(),
                    repo: "agent-skills".to_string(),
                    skill: "vercel-react-best-practices-copy".to_string(),
                    installs: 30_000,
                },
                SearchSkillResult {
                    owner: "google-labs-code".to_string(),
                    repo: "stitch-skills".to_string(),
                    skill: "react:components".to_string(),
                    installs: 12_000,
                },
                SearchSkillResult {
                    owner: "community".to_string(),
                    repo: "awesome-skills".to_string(),
                    skill: "react-perf".to_string(),
                    installs: 8_000,
                },
            ],
            error: None,
        });
    }

    let client = Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let limit_value = limit.unwrap_or(DEFAULT_SEARCH_LIMIT).min(100).max(1);
    let url = format!("{}?q={}&limit={}", SKILLS_SEARCH_API, 
        urlencoding::encode(search_query), 
        limit_value
    );

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to call skills search API: {}", e))?;

    if !response.status().is_success() {
        return Ok(SkillsSearchResult {
            success: false,
            results: Vec::new(),
            error: Some(format!("API returned status: {}", response.status())),
        });
    }

    let api_response: SkillsSearchApiResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse API response: {}", e))?;

    let api_results = api_response
        .skills
        .into_iter()
        .filter_map(|item| {
            let (owner, repo) = item.source.split_once('/')?;
            Some(SearchSkillResult {
                owner: owner.to_string(),
                repo: repo.to_string(),
                skill: item.skill_id,
                installs: item.installs,
            })
        })
        .collect();

    Ok(SkillsSearchResult {
        success: true,
        results: api_results,
        error: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn tmp_dir(name: &str) -> PathBuf {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_millis();
        std::env::temp_dir().join(format!("hivelaunch-skills-{}-{}", name, ts))
    }

    #[test]
    fn list_installed_skills_only_returns_valid_skill_dirs() {
        let hub = tmp_dir("list");
        let valid = hub.join(".agents").join("skills").join("valid-skill");
        let invalid = hub.join(".agents").join("skills").join("invalid-skill");
        fs::create_dir_all(&valid).expect("create valid skill dir");
        fs::create_dir_all(&invalid).expect("create invalid skill dir");
        fs::write(valid.join("skill.md"), "ok").expect("write valid skill.md");
        let skills = list_installed_skills(&hub).expect("list installed skills");
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "valid-skill");
        if hub.exists() {
            let _ = fs::remove_dir_all(hub);
        }
    }

    #[test]
    fn mock_install_and_remove_work() {
        let hub = tmp_dir("mock");
        std::env::set_var("BEE_SKILLS_MOCK", "1");
        let install = skills_install(
            &hub,
            "vercel-labs/agent-skills",
            "vercel-react-best-practices",
            Some("opencode"),
        )
        .expect("install skill");
        assert!(install.success);
        let listed = list_installed_skills(&hub).expect("list skills after install");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].name, "vercel-react-best-practices");
        let remove = skills_remove(&hub, "vercel-react-best-practices").expect("remove skill");
        assert!(remove.success);
        let listed_after = list_installed_skills(&hub).expect("list skills after remove");
        assert!(listed_after.is_empty());
        std::env::remove_var("BEE_SKILLS_MOCK");
        if hub.exists() {
            let _ = fs::remove_dir_all(hub);
        }
    }

    #[tokio::test]
    async fn skills_search_api_mock_returns_more_than_six_results() {
        std::env::set_var("BEE_SKILLS_MOCK", "1");
        let result = skills_search_api("react", Some(20))
            .await
            .expect("search skills");
        assert!(result.success);
        assert!(result.results.len() > 6);
        std::env::remove_var("BEE_SKILLS_MOCK");
    }
}
