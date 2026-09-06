//! Mission-side DayZ-Expansion data access — the counterpart to the
//! profile-side `expansion_*` commands in `commands::mods`.
//!
//! Expansion splits its config across two trees:
//!   - `<workspace>/<profiles_relative>/ExpansionMod/` — global
//!     settings, market categories, trader price tables, AI loadouts.
//!     Handled by `commands::mods::expansion_*`.
//!   - `<workspace>/<mpmissions_relative>/expansion/` — per-mission
//!     placements: trader NPC `.map` files, `traderzones/*.json`,
//!     quest definitions, safezone settings, spawn selection. Handled
//!     **here**.
//!
//! The two are kept separate because the sandboxing rule is different
//! — we can't reuse `resolve_expansion_path` without weakening its
//! profile-root invariant.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::parsers::expansion_trader_map::{
    self, TraderMapFile, TraderMapLine, TraderPlacement,
};
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpansionMissionFolder {
    /// Folder name under `<mission>/expansion/` — e.g. `traders`,
    /// `traderzones`, `quests`, `settings`.
    pub name: String,
    /// Workspace-relative forward-slashed path.
    pub relative_path: String,
    /// Total files under the folder (recursive).
    pub file_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpansionMissionInventory {
    /// Workspace-relative path to the mission's expansion root, e.g.
    /// `mpmissions/dayzOffline.chernarusplus/expansion`. Always set
    /// when the inventory is present; `None` when the folder doesn't
    /// exist (Expansion mission-side content not installed).
    pub mission_expansion_root: String,
    pub folders: Vec<ExpansionMissionFolder>,
}

/// List the top-level folders under `mpmissions/<map>/expansion/`.
/// Returns `None` when the folder doesn't exist yet.
#[tauri::command]
pub async fn expansion_mission_scan(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<Option<ExpansionMissionInventory>> {
    let profile = {
        let store = state.profiles.lock().await;
        store.get(&id)?
    };
    let workspace = state.workspace_for(&id);
    let mission_rel = profile.paths.mpmissions_relative.trim_end_matches('/');
    let rel_prefix = format!("{mission_rel}/expansion");
    let root = workspace.join(&rel_prefix);
    if !root.is_dir() {
        return Ok(None);
    }

    let mut folders: Vec<ExpansionMissionFolder> = Vec::new();
    if let Ok(rd) = std::fs::read_dir(&root) {
        for entry in rd.flatten() {
            let ft = match entry.file_type() {
                Ok(ft) => ft,
                Err(_) => continue,
            };
            if !ft.is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            let path = entry.path();
            folders.push(ExpansionMissionFolder {
                relative_path: format!("{rel_prefix}/{name}"),
                name,
                file_count: count_files_recursive(&path),
            });
        }
    }
    folders.sort_by(|a, b| a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase()));

    Ok(Some(ExpansionMissionInventory {
        mission_expansion_root: rel_prefix,
        folders,
    }))
}

fn count_files_recursive(dir: &Path) -> usize {
    let mut n = 0;
    let rd = match std::fs::read_dir(dir) {
        Ok(rd) => rd,
        Err(_) => return 0,
    };
    for e in rd.flatten() {
        match e.file_type() {
            Ok(ft) if ft.is_dir() => n += count_files_recursive(&e.path()),
            Ok(ft) if ft.is_file() => n += 1,
            _ => {}
        }
    }
    n
}

// ---------- Directory listing ----------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissionDirEntry {
    pub relative_path: String,
    pub name: String,
    pub is_dir: bool,
    pub size_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extension: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissionDirListing {
    pub relative_path: String,
    pub entries: Vec<MissionDirEntry>,
}

#[tauri::command]
pub async fn expansion_mission_list_dir(
    id: String,
    relative_path: String,
    state: State<'_, AppState>,
) -> AppResult<MissionDirListing> {
    let profile = {
        let store = state.profiles.lock().await;
        store.get(&id)?
    };
    let workspace = state.workspace_for(&id);
    let full = resolve_mission_expansion_path(
        &workspace,
        &profile.paths.mpmissions_relative,
        &relative_path,
    )?;
    if !full.is_dir() {
        return Err(AppError::InvalidProfile(format!(
            "not a directory: {relative_path}"
        )));
    }

    let mut entries = Vec::new();
    for entry in std::fs::read_dir(&full)?.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let rel = format!("{}/{}", relative_path.trim_end_matches('/'), name);
        let extension = entry
            .path()
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_ascii_lowercase());
        entries.push(MissionDirEntry {
            relative_path: rel,
            name,
            is_dir: meta.is_dir(),
            size_bytes: if meta.is_file() { meta.len() } else { 0 },
            extension,
        });
    }
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase()),
    });

    Ok(MissionDirListing {
        relative_path: relative_path.trim_end_matches('/').to_string(),
        entries,
    })
}

// ---------- Raw read / write ----------

#[tauri::command]
pub async fn expansion_mission_read(
    id: String,
    relative_path: String,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let profile = {
        let store = state.profiles.lock().await;
        store.get(&id)?
    };
    let workspace = state.workspace_for(&id);
    let full = resolve_mission_expansion_path(
        &workspace,
        &profile.paths.mpmissions_relative,
        &relative_path,
    )?;
    std::fs::read_to_string(&full).map_err(Into::into)
}

#[tauri::command]
pub async fn expansion_mission_write(
    id: String,
    relative_path: String,
    content: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let profile = {
        let store = state.profiles.lock().await;
        store.get(&id)?
    };
    let workspace = state.workspace_for(&id);
    let full = resolve_mission_expansion_path(
        &workspace,
        &profile.paths.mpmissions_relative,
        &relative_path,
    )?;
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&full, &content)?;

    let filename = Path::new(&relative_path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("file");
    crate::git_ops::ensure_repo(&workspace)?;
    crate::git_ops::commit_all(&workspace, &format!("edit(expansion-mission): {filename}"))?;
    Ok(())
}

// ---------- Trader .map placements (typed round-trip) ----------

#[tauri::command]
pub async fn trader_placements_read(
    id: String,
    relative_path: String,
    state: State<'_, AppState>,
) -> AppResult<TraderMapFile> {
    let profile = {
        let store = state.profiles.lock().await;
        store.get(&id)?
    };
    let workspace = state.workspace_for(&id);
    let full = resolve_mission_expansion_path(
        &workspace,
        &profile.paths.mpmissions_relative,
        &relative_path,
    )?;
    let src = std::fs::read_to_string(&full)?;
    Ok(expansion_trader_map::parse(&src))
}

#[tauri::command]
pub async fn trader_placements_write(
    id: String,
    relative_path: String,
    file: TraderMapFile,
    state: State<'_, AppState>,
) -> AppResult<()> {
    // Reject obviously malformed placements (empty entity class or
    // trader file). Anything else — including custom gear keywords —
    // is left to the user; we only guard against corruption that would
    // produce unparseable lines on reload.
    for line in &file.lines {
        if let TraderMapLine::Placement(p) = line {
            validate_placement(p)?;
        }
    }

    let profile = {
        let store = state.profiles.lock().await;
        store.get(&id)?
    };
    let workspace = state.workspace_for(&id);
    let full = resolve_mission_expansion_path(
        &workspace,
        &profile.paths.mpmissions_relative,
        &relative_path,
    )?;
    let serialized = expansion_trader_map::serialize(&file);
    // Sanity round-trip: the file we're about to write must re-parse
    // to the exact same set of placements. Catches bugs in the
    // serializer before they clobber the user's file.
    let reparsed = expansion_trader_map::parse(&serialized);
    if count_placements(&reparsed) != count_placements(&file) {
        return Err(AppError::Internal(
            "internal: serialized trader .map lost placements on re-parse".into(),
        ));
    }

    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&full, &serialized)?;

    let filename = Path::new(&relative_path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("traders.map");
    crate::git_ops::ensure_repo(&workspace)?;
    crate::git_ops::commit_all(&workspace, &format!("edit(trader-placements): {filename}"))?;
    Ok(())
}

fn validate_placement(p: &TraderPlacement) -> AppResult<()> {
    if p.entity_class.trim().is_empty() {
        return Err(AppError::InvalidProfile(
            "trader placement has empty entity class".into(),
        ));
    }
    if p.trader_file.trim().is_empty() {
        return Err(AppError::InvalidProfile(
            "trader placement has empty trader file reference".into(),
        ));
    }
    if p.entity_class.contains('.') {
        return Err(AppError::InvalidProfile(format!(
            "trader placement entity class must not contain '.': {}",
            p.entity_class
        )));
    }
    if p.entity_class.contains('|') || p.trader_file.contains('|') {
        return Err(AppError::InvalidProfile(
            "trader placement class / file must not contain '|'".into(),
        ));
    }
    Ok(())
}

fn count_placements(f: &TraderMapFile) -> usize {
    f.placements().count()
}

// ---------- Sandbox ----------

/// Sandbox `relative_path` to the workspace's mission-expansion root.
/// Rejects `..`, absolute paths, and anything pointing outside
/// `<mpmissions_relative>/expansion/`.
fn resolve_mission_expansion_path(
    workspace: &Path,
    mpmissions_relative: &str,
    relative_path: &str,
) -> AppResult<PathBuf> {
    if relative_path.contains("..") {
        return Err(AppError::InvalidProfile(
            "relative path must not contain `..`".into(),
        ));
    }
    let mission_trim = mpmissions_relative.trim_end_matches('/');
    let root = format!("{mission_trim}/expansion");
    let expected_prefix = format!("{root}/");
    let norm = relative_path.trim_end_matches('/').replace('\\', "/");
    if norm != root && !norm.starts_with(&expected_prefix) {
        return Err(AppError::InvalidProfile(format!(
            "path must live under {expected_prefix}"
        )));
    }
    Ok(workspace.join(&norm))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn sandbox_accepts_paths_under_expansion() {
        let td = TempDir::new().unwrap();
        let p = resolve_mission_expansion_path(
            td.path(),
            "mpmissions/dayzOffline.chernarusplus",
            "mpmissions/dayzOffline.chernarusplus/expansion/traders/foo.map",
        )
        .unwrap();
        assert!(p.starts_with(td.path()));
    }

    #[test]
    fn sandbox_rejects_dotdot() {
        let td = TempDir::new().unwrap();
        let err = resolve_mission_expansion_path(
            td.path(),
            "mpmissions/dayzOffline.chernarusplus",
            "mpmissions/../other/expansion/x",
        )
        .unwrap_err();
        assert!(matches!(err, AppError::InvalidProfile(_)));
    }

    #[test]
    fn sandbox_rejects_outside_paths() {
        let td = TempDir::new().unwrap();
        let err = resolve_mission_expansion_path(
            td.path(),
            "mpmissions/dayzOffline.chernarusplus",
            "mpmissions/dayzOffline.chernarusplus/db/types.xml",
        )
        .unwrap_err();
        assert!(matches!(err, AppError::InvalidProfile(_)));
    }

    #[test]
    fn count_files_recursive_sums_subfolders() {
        let td = TempDir::new().unwrap();
        fs::create_dir_all(td.path().join("a/b")).unwrap();
        fs::write(td.path().join("a/x.map"), "").unwrap();
        fs::write(td.path().join("a/b/y.map"), "").unwrap();
        fs::write(td.path().join("a/b/z.json"), "").unwrap();
        assert_eq!(count_files_recursive(&td.path().join("a")), 3);
    }
}
