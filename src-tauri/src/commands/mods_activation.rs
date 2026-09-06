//! Per-profile mod activation store.
//!
//! Lives at `<workspace>/.dzmgr/mods.json`. Persists the operator's
//! claim about which detected mods are *running on boot* (activation
//! state) plus any mods they added manually that the scanner
//! couldn't detect automatically. The server's real `mod=""` launch
//! parameter is unreachable from the app — this file is the best-
//! effort record we can build UI off.
//!
//! Default activation is "on" the first time a detected mod is seen;
//! subsequent scans preserve whatever the operator set.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::sync::WORKSPACE_META_DIR;

pub const ACTIVATION_FILE: &str = ".dzmgr/mods.json";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ActivationState {
    On,
    Off,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserAddedMod {
    /// Slug, must match `^[a-z0-9_-]+$`.
    pub id: String,
    pub display_name: String,
    /// Workspace-relative path to the folder the operator chose.
    pub folder_path: String,
    /// ISO-8601 UTC timestamp of creation — for audit only.
    pub created_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModsActivationStore {
    /// Map `mod_id` → on/off. `BTreeMap` so JSON output is stable
    /// across saves (reduces git-diff noise).
    #[serde(default)]
    pub activation: BTreeMap<String, ActivationState>,
    #[serde(default)]
    pub user_added: Vec<UserAddedMod>,
}

impl ModsActivationStore {
    /// Path to the activation file for a given workspace.
    fn path_for(workspace: &Path) -> PathBuf {
        workspace.join(ACTIVATION_FILE)
    }

    /// Read-or-create. An absent file is treated as an empty store —
    /// not an error — so first-time access on a workspace that never
    /// wrote activation state works without special-casing on the
    /// frontend.
    pub fn load(workspace: &Path) -> AppResult<Self> {
        let path = Self::path_for(workspace);
        if !path.exists() {
            return Ok(Self::default());
        }
        let raw = std::fs::read_to_string(&path)?;
        serde_json::from_str(&raw).map_err(|e| {
            AppError::Internal(format!(
                "parse {}: {e}",
                path.display(),
            ))
        })
    }

    pub fn save(&self, workspace: &Path) -> AppResult<()> {
        let path = Self::path_for(workspace);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let serialized = serde_json::to_string_pretty(self)
            .map_err(|e| AppError::Internal(format!("serialise mods.json: {e}")))?;
        std::fs::write(&path, serialized)?;
        Ok(())
    }

    pub fn set(&mut self, id: &str, state: ActivationState) {
        self.activation.insert(id.to_string(), state);
    }

    pub fn get(&self, id: &str) -> ActivationState {
        // Default is "on" — detected mods are active unless the
        // operator explicitly turned them off. Matches the PDR.
        self.activation
            .get(id)
            .copied()
            .unwrap_or(ActivationState::On)
    }
}

// ---------- Tauri commands ----------

#[tauri::command]
pub async fn mods_activation_get(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<ModsActivationStore> {
    let workspace = state.workspace_for(&id);
    if !workspace.exists() {
        // No workspace pulled yet — return an empty store. The UI
        // just shows defaults and save-on-first-toggle creates the
        // file under .dzmgr/.
        return Ok(ModsActivationStore::default());
    }
    ModsActivationStore::load(&workspace)
}

#[tauri::command]
pub async fn mods_activation_set(
    id: String,
    mod_id: String,
    active: bool,
    state: State<'_, AppState>,
) -> AppResult<ModsActivationStore> {
    ensure_slug(&mod_id)?;
    let workspace = state.workspace_for(&id);
    if !workspace.exists() {
        return Err(AppError::Sync(
            "workspace does not exist — pull first".into(),
        ));
    }
    let mut store = ModsActivationStore::load(&workspace)?;
    store.set(
        &mod_id,
        if active {
            ActivationState::On
        } else {
            ActivationState::Off
        },
    );
    store.save(&workspace)?;
    Ok(store)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserAddedModInput {
    pub id: String,
    pub display_name: String,
    pub folder_path: String,
}

#[tauri::command]
pub async fn mods_activation_add_user_mod(
    id: String,
    spec: UserAddedModInput,
    state: State<'_, AppState>,
) -> AppResult<ModsActivationStore> {
    ensure_slug(&spec.id)?;
    if spec.display_name.trim().is_empty() {
        return Err(AppError::InvalidProfile(
            "display name must not be empty".into(),
        ));
    }
    // The folder path must resolve under the workspace — catches both
    // path traversal and obvious typos before they hit disk.
    validate_folder_path(&spec.folder_path)?;

    let workspace = state.workspace_for(&id);
    if !workspace.exists() {
        return Err(AppError::Sync(
            "workspace does not exist — pull first".into(),
        ));
    }
    let mut store = ModsActivationStore::load(&workspace)?;
    if store.user_added.iter().any(|u| u.id == spec.id)
        || store.activation.contains_key(&spec.id)
    {
        return Err(AppError::InvalidProfile(format!(
            "a mod with id '{}' already exists",
            spec.id
        )));
    }
    store.user_added.push(UserAddedMod {
        id: spec.id.clone(),
        display_name: spec.display_name.trim().to_string(),
        folder_path: spec.folder_path,
        created_at: now_iso(),
    });
    // Default-on so the UI doesn't need a separate enable step.
    store.set(&spec.id, ActivationState::On);
    store.save(&workspace)?;
    Ok(store)
}

/// Convert an absolute folder path (typically from the native
/// file-picker dialog) into a workspace-relative path suitable for
/// persisting in `user_added[].folder_path`. Errors when the path
/// sits outside the profile's workspace, so the UI gets a clear
/// rejection instead of a traversal surprise later.
#[tauri::command]
pub async fn mods_activation_to_relative_path(
    id: String,
    absolute_path: String,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let workspace = state.workspace_for(&id);
    let canonical_workspace = std::fs::canonicalize(&workspace).map_err(|_| {
        AppError::Sync(format!(
            "workspace path is not resolvable: {}",
            workspace.display()
        ))
    })?;
    let picked = PathBuf::from(&absolute_path);
    let canonical_picked = std::fs::canonicalize(&picked).map_err(|_| {
        AppError::InvalidProfile(format!(
            "picked folder doesn't exist: {absolute_path}"
        ))
    })?;
    let rel = canonical_picked
        .strip_prefix(&canonical_workspace)
        .map_err(|_| {
            AppError::InvalidProfile(format!(
                "picked folder is not inside the workspace ({})",
                canonical_workspace.display()
            ))
        })?;
    // Normalise to forward slashes — the rest of the app is
    // workspace-relative with `/` separators regardless of platform.
    let rel_str = rel.to_string_lossy().replace('\\', "/");
    if rel_str.is_empty() {
        return Err(AppError::InvalidProfile(
            "picked folder is the workspace root — pick a subfolder".into(),
        ));
    }
    Ok(rel_str)
}

#[tauri::command]
pub async fn mods_activation_remove_user_mod(
    id: String,
    mod_id: String,
    state: State<'_, AppState>,
) -> AppResult<ModsActivationStore> {
    ensure_slug(&mod_id)?;
    let workspace = state.workspace_for(&id);
    if !workspace.exists() {
        return Err(AppError::Sync(
            "workspace does not exist — pull first".into(),
        ));
    }
    let mut store = ModsActivationStore::load(&workspace)?;
    let before = store.user_added.len();
    store.user_added.retain(|u| u.id != mod_id);
    if store.user_added.len() == before {
        return Err(AppError::InvalidProfile(format!(
            "no user-added mod with id '{mod_id}'"
        )));
    }
    // Clear activation record too — a future detected mod with the
    // same id shouldn't inherit a stale on/off state.
    store.activation.remove(&mod_id);
    store.save(&workspace)?;
    Ok(store)
}

// ---------- Helpers ----------

fn ensure_slug(s: &str) -> AppResult<()> {
    if s.is_empty() {
        return Err(AppError::InvalidProfile("mod id must not be empty".into()));
    }
    if !s
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-')
    {
        return Err(AppError::InvalidProfile(format!(
            "mod id '{s}' must match [a-z0-9_-]+"
        )));
    }
    Ok(())
}

fn validate_folder_path(rel: &str) -> AppResult<()> {
    if rel.contains("..") {
        return Err(AppError::InvalidProfile(
            "folder path must not contain '..'".into(),
        ));
    }
    if rel.starts_with('/') || rel.starts_with('\\') {
        return Err(AppError::InvalidProfile(
            "folder path must be workspace-relative (no leading slash)".into(),
        ));
    }
    // Can't write into the app's own metadata directory, either.
    if rel.replace('\\', "/").starts_with(&format!("{WORKSPACE_META_DIR}/")) {
        return Err(AppError::InvalidProfile(format!(
            "folder path must not live under {WORKSPACE_META_DIR}/"
        )));
    }
    Ok(())
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn load_returns_empty_when_file_absent() {
        let td = TempDir::new().unwrap();
        let store = ModsActivationStore::load(td.path()).unwrap();
        assert!(store.activation.is_empty());
        assert!(store.user_added.is_empty());
    }

    #[test]
    fn roundtrip_preserves_entries() {
        let td = TempDir::new().unwrap();
        let mut store = ModsActivationStore::default();
        store.set("expansion", ActivationState::On);
        store.set("traderplus", ActivationState::Off);
        store.user_added.push(UserAddedMod {
            id: "mymod".into(),
            display_name: "My Mod".into(),
            folder_path: "custom/mymod".into(),
            created_at: "2026-04-01T00:00:00Z".into(),
        });
        store.save(td.path()).unwrap();
        let loaded = ModsActivationStore::load(td.path()).unwrap();
        assert_eq!(loaded.get("expansion"), ActivationState::On);
        assert_eq!(loaded.get("traderplus"), ActivationState::Off);
        assert_eq!(loaded.user_added.len(), 1);
        assert_eq!(loaded.user_added[0].id, "mymod");
    }

    #[test]
    fn unknown_id_defaults_to_on() {
        let store = ModsActivationStore::default();
        assert_eq!(store.get("never-seen"), ActivationState::On);
    }

    #[test]
    fn ensure_slug_rejects_invalid_chars() {
        assert!(ensure_slug("Expansion").is_err()); // uppercase
        assert!(ensure_slug("my mod").is_err()); // space
        assert!(ensure_slug("mod.dot").is_err());
        assert!(ensure_slug("").is_err());
        assert!(ensure_slug("valid_id-99").is_ok());
    }

    #[test]
    fn validate_folder_path_rejects_traversal() {
        assert!(validate_folder_path("mpmissions/foo/../bar").is_err());
        assert!(validate_folder_path("/abs/path").is_err());
        assert!(validate_folder_path("\\abs\\path").is_err());
        assert!(validate_folder_path(".dzmgr/sneaky").is_err());
        assert!(validate_folder_path("mpmissions/chernarus/custom/mymod").is_ok());
    }
}
