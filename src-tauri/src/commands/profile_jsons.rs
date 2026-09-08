//! Catalog of mod JSON files under the server Profiles folder.
//!
//! Scans `<workspace>/<profilesRelative>/**/*.json`, applies a
//! settings-vs-noise heuristic, then layers operator include/exclude
//! overrides from `.dzmgr/profile-jsons.json`.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::State;
use walkdir::WalkDir;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

const OVERRIDES_FILE: &str = ".dzmgr/profile-jsons.json";
const SIZE_CAP: u64 = 256 * 1024;

const SKIP_WALK: &[&str] = &["users", "battleye", ".git", ".dzmgr"];
const NOISE_SEGMENTS: &[&str] = &["logs", "log", "cache", "backups", "backup"];
const SETTINGS_PARENTS: &[&str] = &["settings", "config", "configs"];
const EXPANSION_DEDICATED: &[(&str, &str)] = &[
    ("market", "/app/mods/expansion/market"),
    ("traders", "/app/mods/expansion/traders"),
    ("quests", "/app/mods/expansion/quests"),
    ("loadouts", "/app/mods/expansion/loadouts"),
    ("ai", "/app/mods/expansion"),
];

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileJsonOverrides {
    #[serde(default)]
    pub include: BTreeSet<String>,
    #[serde(default)]
    pub exclude: BTreeSet<String>,
}

impl ProfileJsonOverrides {
    fn path_for(workspace: &Path) -> PathBuf {
        workspace.join(OVERRIDES_FILE)
    }

    pub fn load(workspace: &Path) -> AppResult<Self> {
        let path = Self::path_for(workspace);
        if !path.exists() {
            return Ok(Self::default());
        }
        let raw = std::fs::read_to_string(&path)?;
        serde_json::from_str(&raw).map_err(|e| {
            AppError::Internal(format!("parse {}: {e}", path.display()))
        })
    }

    pub fn save(&self, workspace: &Path) -> AppResult<()> {
        let path = Self::path_for(workspace);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let serialized = serde_json::to_string_pretty(self).map_err(|e| {
            AppError::Internal(format!("serialise profile-jsons.json: {e}"))
        })?;
        std::fs::write(&path, serialized)?;
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum JsonOverride {
    Include,
    Exclude,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileJsonFile {
    pub name: String,
    pub file_name: String,
    pub relative_path: String,
    pub size_bytes: u64,
    pub auto_on: bool,
    pub reason: String,
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub override_state: Option<JsonOverride>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dedicated_route: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileJsonGroup {
    pub folder: String,
    pub files: Vec<ProfileJsonFile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileJsonCatalog {
    pub profiles_root: String,
    pub missing: bool,
    pub groups: Vec<ProfileJsonGroup>,
    pub enabled_count: usize,
    pub total_count: usize,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum OverrideAction {
    Include,
    Exclude,
    Auto,
}

async fn workspace_and_profiles(
    id: &str,
    state: &State<'_, AppState>,
) -> AppResult<(PathBuf, String)> {
    let profile = {
        let store = state.profiles.lock().await;
        store.get(id)?
    };
    let workspace = state.workspace_for(id);
    if !workspace.exists() {
        return Err(AppError::Sync(
            "workspace does not exist — pull first".into(),
        ));
    }
    Ok((
        workspace,
        profile.paths.profiles_relative.trim_end_matches('/').to_string(),
    ))
}

#[tauri::command]
pub async fn profile_jsons_scan(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<ProfileJsonCatalog> {
    let (workspace, profiles_rel) = workspace_and_profiles(&id, &state).await?;
    let root = workspace.join(&profiles_rel);
    if !root.exists() {
        return Ok(ProfileJsonCatalog {
            profiles_root: profiles_rel,
            missing: true,
            groups: Vec::new(),
            enabled_count: 0,
            total_count: 0,
        });
    }
    let overrides = ProfileJsonOverrides::load(&workspace)?;
    Ok(scan_profiles(&workspace, &profiles_rel, &overrides))
}

#[tauri::command]
pub async fn profile_jsons_set_override(
    id: String,
    relative_path: String,
    action: OverrideAction,
    state: State<'_, AppState>,
) -> AppResult<ProfileJsonCatalog> {
    let (workspace, profiles_rel) = workspace_and_profiles(&id, &state).await?;
    let norm = normalize_rel(&relative_path);
    resolve_profiles_path(&workspace, &profiles_rel, &norm)?;
    let mut overrides = ProfileJsonOverrides::load(&workspace)?;
    overrides.include.remove(&norm);
    overrides.exclude.remove(&norm);
    match action {
        OverrideAction::Include => {
            overrides.include.insert(norm);
        }
        OverrideAction::Exclude => {
            overrides.exclude.insert(norm);
        }
        OverrideAction::Auto => {}
    }
    overrides.save(&workspace)?;
    Ok(scan_profiles(&workspace, &profiles_rel, &overrides))
}

#[tauri::command]
pub async fn profile_jsons_reset_overrides(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<ProfileJsonCatalog> {
    let (workspace, profiles_rel) = workspace_and_profiles(&id, &state).await?;
    ProfileJsonOverrides::default().save(&workspace)?;
    Ok(scan_profiles(
        &workspace,
        &profiles_rel,
        &ProfileJsonOverrides::default(),
    ))
}

#[tauri::command]
pub async fn profile_jsons_read(
    id: String,
    relative_path: String,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let (workspace, profiles_rel) = workspace_and_profiles(&id, &state).await?;
    let full = resolve_profiles_path(&workspace, &profiles_rel, &relative_path)?;
    std::fs::read_to_string(&full).map_err(Into::into)
}

#[tauri::command]
pub async fn profile_jsons_write(
    id: String,
    relative_path: String,
    content: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let parsed: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| AppError::InvalidProfile(format!("invalid JSON: {e}")))?;
    if !parsed.is_object() {
        return Err(AppError::InvalidProfile(
            "top-level value must be a JSON object".into(),
        ));
    }

    let (workspace, profiles_rel) = workspace_and_profiles(&id, &state).await?;
    let full = resolve_profiles_path(&workspace, &profiles_rel, &relative_path)?;
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&full, &content)?;

    let filename = Path::new(&relative_path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("settings.json");
    crate::git_ops::ensure_repo(&workspace)?;
    crate::git_ops::commit_all(&workspace, &format!("edit(mod-settings): {filename}"))?;
    Ok(())
}

#[tauri::command]
pub async fn profile_jsons_delete(
    id: String,
    relative_path: String,
    state: State<'_, AppState>,
) -> AppResult<ProfileJsonCatalog> {
    let (workspace, profiles_rel) = workspace_and_profiles(&id, &state).await?;
    let catalog = delete_profile_json(&workspace, &profiles_rel, &relative_path)?;
    let filename = Path::new(&relative_path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("settings.json");
    crate::git_ops::ensure_repo(&workspace)?;
    crate::git_ops::commit_all(&workspace, &format!("delete(mod-settings): {filename}"))?;
    Ok(catalog)
}

fn delete_profile_json(
    workspace: &Path,
    profiles_rel: &str,
    relative_path: &str,
) -> AppResult<ProfileJsonCatalog> {
    let norm = normalize_rel(relative_path);
    let full = resolve_profiles_path(workspace, profiles_rel, &norm)?;
    if !full.is_file() {
        return Err(AppError::InvalidProfile(format!("file not found: {norm}")));
    }
    std::fs::remove_file(&full)?;
    let mut overrides = ProfileJsonOverrides::load(workspace)?;
    overrides.include.remove(&norm);
    overrides.exclude.remove(&norm);
    overrides.save(workspace)?;
    Ok(scan_profiles(workspace, profiles_rel, &overrides))
}

fn scan_profiles(
    workspace: &Path,
    profiles_rel: &str,
    overrides: &ProfileJsonOverrides,
) -> ProfileJsonCatalog {
    let root = workspace.join(profiles_rel);
    let mut files: Vec<ProfileJsonFile> = Vec::new();

    for entry in WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            if !e.file_type().is_dir() {
                return true;
            }
            let name = e.file_name().to_string_lossy();
            !SKIP_WALK.iter().any(|s| name.eq_ignore_ascii_case(s))
        })
        .flatten()
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy();
        if !name.to_ascii_lowercase().ends_with(".json") {
            continue;
        }
        let rel = match entry.path().strip_prefix(workspace) {
            Ok(p) => normalize_rel(&p.to_string_lossy()),
            Err(_) => continue,
        };
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        let (auto_on, reason, dedicated) = classify(&rel, size, entry.path());
        let override_state = if overrides.include.contains(&rel) {
            Some(JsonOverride::Include)
        } else if overrides.exclude.contains(&rel) {
            Some(JsonOverride::Exclude)
        } else {
            None
        };
        let enabled = match override_state {
            Some(JsonOverride::Include) => true,
            Some(JsonOverride::Exclude) => false,
            None => auto_on,
        };
        files.push(ProfileJsonFile {
            name: display_name(&name),
            file_name: name.to_string(),
            relative_path: rel,
            size_bytes: size,
            auto_on,
            reason: reason.to_string(),
            enabled,
            override_state,
            dedicated_route: dedicated.map(|s| s.to_string()),
        });
    }

    files.sort_by(|a, b| {
        a.relative_path
            .to_ascii_lowercase()
            .cmp(&b.relative_path.to_ascii_lowercase())
    });

    let mut groups: Vec<ProfileJsonGroup> = Vec::new();
    for file in files {
        let folder = first_folder(profiles_rel, &file.relative_path);
        if let Some(g) = groups.last_mut().filter(|g| g.folder == folder) {
            g.files.push(file);
        } else {
            groups.push(ProfileJsonGroup {
                folder,
                files: vec![file],
            });
        }
    }

    let total_count = groups.iter().map(|g| g.files.len()).sum();
    let enabled_count = groups
        .iter()
        .flat_map(|g| g.files.iter())
        .filter(|f| f.enabled)
        .count();

    ProfileJsonCatalog {
        profiles_root: profiles_rel.to_string(),
        missing: false,
        groups,
        enabled_count,
        total_count,
    }
}

fn first_folder(profiles_rel: &str, relative_path: &str) -> String {
    let prefix = format!("{profiles_rel}/");
    let rest = relative_path.strip_prefix(&prefix).unwrap_or(relative_path);
    rest.split('/').next().unwrap_or(rest).to_string()
}

fn display_name(file_name: &str) -> String {
    let stem = file_name
        .strip_suffix(".json")
        .or_else(|| file_name.strip_suffix(".JSON"))
        .unwrap_or(file_name);
    for suffix in ["Settings", "settings", "Config", "config"] {
        if let Some(stripped) = stem.strip_suffix(suffix) {
            if !stripped.is_empty() {
                return stripped.to_string();
            }
        }
    }
    stem.to_string()
}

fn classify(rel: &str, size: u64, path: &Path) -> (bool, &'static str, Option<&'static str>) {
    let lower = rel.replace('\\', "/").to_ascii_lowercase();
    let file_name = Path::new(rel)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let parent = Path::new(rel)
        .parent()
        .and_then(|p| p.file_name())
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    if let Some(route) = dedicated_route(&lower) {
        return (false, "has a dedicated editor", Some(route));
    }
    if NOISE_SEGMENTS.iter().any(|seg| path_has_segment(&lower, seg)) {
        return (false, "logs / cache / backup", None);
    }

    let settings_name = file_name.ends_with("settings.json") || file_name.ends_with("config.json");
    let settings_parent = SETTINGS_PARENTS.contains(&parent.as_str());

    if size > SIZE_CAP && !settings_name {
        return (false, "larger than 256 KB", None);
    }

    if settings_name {
        return (true, "filename looks like settings", None);
    }
    if settings_parent && size <= SIZE_CAP {
        if looks_like_array(path) {
            return (false, "JSON array, not an object", None);
        }
        return (true, "lives in a Settings / Config folder", None);
    }
    if size <= SIZE_CAP && looks_like_object(path) && !looks_like_array(path) {
        // Small object sitting in a mod folder — still off by default
        // unless it smelled like settings. Keep the catalog honest.
        return (false, "not a settings-style filename", None);
    }
    (false, "not a settings-style filename", None)
}

fn dedicated_route(lower_rel: &str) -> Option<&'static str> {
    // `…/expansionmod/market/…`
    let marker = "/expansionmod/";
    let idx = lower_rel.find(marker)?;
    let rest = &lower_rel[idx + marker.len()..];
    let folder = rest.split('/').next().unwrap_or("");
    EXPANSION_DEDICATED
        .iter()
        .find(|(name, _)| *name == folder)
        .map(|(_, route)| *route)
}

fn path_has_segment(lower: &str, seg: &str) -> bool {
    lower.split('/').any(|s| s == seg)
}

fn looks_like_array(path: &Path) -> bool {
    first_json_token(path) == Some('[')
}

fn looks_like_object(path: &Path) -> bool {
    first_json_token(path) == Some('{')
}

fn first_json_token(path: &Path) -> Option<char> {
    let bytes = std::fs::read(path).ok()?;
    let take = bytes.len().min(2048);
    let text = std::str::from_utf8(&bytes[..take]).ok()?;
    text.chars().find(|c| !c.is_whitespace())
}

fn normalize_rel(p: &str) -> String {
    p.replace('\\', "/").trim_end_matches('/').to_string()
}

fn resolve_profiles_path(
    workspace: &Path,
    profiles_rel: &str,
    relative_path: &str,
) -> AppResult<PathBuf> {
    if relative_path.contains("..") {
        return Err(AppError::InvalidProfile(
            "relative path must not contain `..`".into(),
        ));
    }
    let norm = normalize_rel(relative_path);
    if !norm.to_ascii_lowercase().ends_with(".json") {
        return Err(AppError::InvalidProfile(
            "path must be a .json file".into(),
        ));
    }
    let prefix = format!("{}/", profiles_rel.trim_end_matches('/'));
    if !norm.starts_with(&prefix) && norm != profiles_rel {
        return Err(AppError::InvalidProfile(format!(
            "path must live under {prefix}"
        )));
    }
    Ok(workspace.join(&norm))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;

    fn write(path: &Path, body: &str) {
        if let Some(p) = path.parent() {
            fs::create_dir_all(p).unwrap();
        }
        let mut f = fs::File::create(path).unwrap();
        f.write_all(body.as_bytes()).unwrap();
    }

    #[test]
    fn settings_filename_is_auto_on() {
        let td = tempfile::tempdir().unwrap();
        let ws = td.path();
        write(
            &ws.join("profiles/ExpansionMod/Settings/CoreSettings.json"),
            r#"{"m_Version":1}"#,
        );
        write(
            &ws.join("profiles/ExpansionMod/Market/Ammo.json"),
            r#"{"Items":[]}"#,
        );
        write(
            &ws.join("profiles/VPPAdminTools/Config/Foo.json"),
            r#"{"enabled":true}"#,
        );
        write(&ws.join("profiles/Users/steam/foo.json"), r#"{}"#);

        let cat = scan_profiles(ws, "profiles", &ProfileJsonOverrides::default());
        assert!(!cat.missing);
        let all: Vec<_> = cat.groups.iter().flat_map(|g| g.files.iter()).collect();
        let core = all
            .iter()
            .find(|f| f.file_name == "CoreSettings.json")
            .unwrap();
        assert!(core.auto_on);
        assert!(core.enabled);
        let ammo = all.iter().find(|f| f.file_name == "Ammo.json").unwrap();
        assert!(!ammo.auto_on);
        assert_eq!(
            ammo.dedicated_route.as_deref(),
            Some("/app/mods/expansion/market")
        );
        let vpp = all.iter().find(|f| f.file_name == "Foo.json").unwrap();
        assert!(vpp.auto_on);
        assert!(all.iter().all(|f| !f.relative_path.contains("/Users/")));
    }

    #[test]
    fn include_override_enables_auto_off() {
        let td = tempfile::tempdir().unwrap();
        let ws = td.path();
        write(
            &ws.join("profiles/FooMod/odd.json"),
            r#"{"x":1}"#,
        );
        let mut ov = ProfileJsonOverrides::default();
        ov.include
            .insert("profiles/FooMod/odd.json".into());
        let cat = scan_profiles(ws, "profiles", &ov);
        let f = &cat.groups[0].files[0];
        assert!(!f.auto_on);
        assert!(f.enabled);
        assert_eq!(f.override_state, Some(JsonOverride::Include));
    }

    #[test]
    fn display_name_strips_suffix() {
        assert_eq!(display_name("CoreSettings.json"), "Core");
        assert_eq!(display_name("AIConfig.json"), "AI");
        assert_eq!(display_name("notes.json"), "notes");
    }

    #[test]
    fn delete_removes_file_and_override() {
        let td = tempfile::tempdir().unwrap();
        let ws = td.path();
        write(&ws.join("profiles/FooMod/odd.json"), r#"{"x":1}"#);
        let mut ov = ProfileJsonOverrides::default();
        ov.include.insert("profiles/FooMod/odd.json".into());
        ov.save(ws).unwrap();

        let cat = delete_profile_json(ws, "profiles", "profiles/FooMod/odd.json").unwrap();
        assert_eq!(cat.total_count, 0);
        assert!(!ws.join("profiles/FooMod/odd.json").exists());
        let loaded = ProfileJsonOverrides::load(ws).unwrap();
        assert!(!loaded.include.contains("profiles/FooMod/odd.json"));
    }
}
