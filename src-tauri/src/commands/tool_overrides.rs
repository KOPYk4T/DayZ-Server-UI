//! Per-tool path overrides — let operators point the app at exes
//! they already have installed elsewhere, instead of forcing
//! everything under `tools/<vendor>/bin/`.
//!
//! Backed by `<app_data>/tool_overrides.json`:
//!
//!   {
//!     "make_pbo": "C:\\Tools\\Mikero\\MakePbo.exe",
//!     "ds_sign": "C:\\Tools\\Mikero\\DsUtils\\DSSignFile.exe"
//!   }
//!
//! `tools::resolved_exe(id, app_data_dir, tools_dir)` is the read
//! side: it checks the override map first, falls back to the
//! bundled path so existing wiring keeps working when no override
//! is set. The Setup hub renders one row per tool; clicking
//! "Locate" runs `tool_override_set` with the picked path.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// Stable IDs for every tool the override file recognises. New
/// tools land here as they're added; the file is forward-
/// compatible because unknown keys are ignored on load.
pub const TOOL_IDS: &[&str] = &[
    "derap",         // Mikero DePbo / DeRap.exe
    "extract_pbo",   // Mikero ExtractPbo.exe
    "make_pbo",      // Mikero MakePbo.exe
    "image_to_paa",  // BI ImageToPAA.exe
    "ds_sign",       // BI DSSignFile.exe
    "ds_create_key", // BI DSCreateKey.exe
];

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ToolOverrides {
    /// Tool id → absolute exe path. Keys outside `TOOL_IDS` are
    /// preserved on round-trip (forward compat with future
    /// versions adding more tools).
    #[serde(flatten)]
    pub paths: BTreeMap<String, String>,
}

fn overrides_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("tool_overrides.json")
}

pub fn load(app_data_dir: &Path) -> ToolOverrides {
    let p = overrides_path(app_data_dir);
    if !p.is_file() {
        return ToolOverrides::default();
    }
    match std::fs::read(&p) {
        Ok(bytes) if bytes.is_empty() => ToolOverrides::default(),
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
        Err(_) => ToolOverrides::default(),
    }
}

fn save(app_data_dir: &Path, ov: &ToolOverrides) -> AppResult<()> {
    let p = overrides_path(app_data_dir);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&p, serde_json::to_vec_pretty(ov)?)?;
    Ok(())
}

/// Read-side helper: returns the override path for a tool if set,
/// else `None`. Exposed so other modules (e.g. `tools.rs`) can
/// thread overrides through without depending on `tauri::State`.
pub fn override_for(app_data_dir: &Path, tool_id: &str) -> Option<PathBuf> {
    load(app_data_dir)
        .paths
        .get(tool_id)
        .map(PathBuf::from)
}

#[tauri::command]
pub async fn tool_overrides_get(
    state: State<'_, AppState>,
) -> AppResult<ToolOverrides> {
    Ok(load(&state.app_data_dir))
}

#[tauri::command]
pub async fn tool_override_set(
    tool_id: String,
    path: String,
    state: State<'_, AppState>,
) -> AppResult<ToolOverrides> {
    if !TOOL_IDS.iter().any(|id| *id == tool_id) {
        return Err(AppError::Internal(format!(
            "unknown tool id: {tool_id}"
        )));
    }
    let pb = PathBuf::from(path.trim());
    if !pb.is_file() {
        return Err(AppError::Internal(format!(
            "file not found: {}",
            pb.display()
        )));
    }
    let mut ov = load(&state.app_data_dir);
    ov.paths.insert(tool_id, pb.to_string_lossy().into_owned());
    save(&state.app_data_dir, &ov)?;
    Ok(ov)
}

#[tauri::command]
pub async fn tool_override_clear(
    tool_id: String,
    state: State<'_, AppState>,
) -> AppResult<ToolOverrides> {
    let mut ov = load(&state.app_data_dir);
    ov.paths.remove(&tool_id);
    save(&state.app_data_dir, &ov)?;
    Ok(ov)
}
