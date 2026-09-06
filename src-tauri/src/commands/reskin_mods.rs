//! Reskin mod-source commands — manage a list of modded `@*`
//! folders that contribute reskinnable classes alongside vanilla.
//!
//! Each call funnels through `reskin::mod_index` which owns the
//! cache file format + scanning pipeline. These commands are pure
//! request/response wrappers so the frontend can:
//!   - Add a mod folder (also doubles as "refresh existing")
//!   - List currently registered sources + their classes
//!   - Remove a source by id

use std::path::PathBuf;

use tauri::{AppHandle, State};

use crate::error::{AppError, AppResult};
use crate::reskin::mod_index::{
    self, ModClassIndex, ScanSummary,
};
use crate::reskin::tools;
use crate::state::AppState;

#[tauri::command]
pub async fn reskin_mods_list(
    state: State<'_, AppState>,
) -> AppResult<ModClassIndex> {
    mod_index::load_index(&state.app_data_dir)
}

/// Add (or refresh) a mod folder. The frontend usually reaches
/// here via a folder-picker dialog → absolute path → this call.
/// `app` is needed because `tools::resolve_tools_dir` consults
/// the Tauri resource dir for the bundled DePboTools.
#[tauri::command]
pub async fn reskin_mods_add(
    folder: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<ScanSummary> {
    let path = PathBuf::from(folder);
    if !path.is_dir() {
        return Err(AppError::Internal(format!(
            "mod folder not found: {}",
            path.display()
        )));
    }
    let tools_dir = tools::resolve_tools_dir(&app);
    mod_index::add_or_refresh_source(&state.app_data_dir, &tools_dir, &path)
}

#[tauri::command]
pub async fn reskin_mods_remove(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<bool> {
    mod_index::remove_source(&state.app_data_dir, &id)
}
