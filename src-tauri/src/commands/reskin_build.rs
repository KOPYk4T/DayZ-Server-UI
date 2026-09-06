//! Tauri commands for the reskin registry + build pipeline.

use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::error::{AppError, AppResult};
use crate::reskin::build::{self, ReskinBuildResult};
use crate::reskin::registry::{
    self, ConfigClassEntry, ExternalPboEntry, ReskinEntry, ReskinRegistry,
};
use crate::reskin::tools;
use crate::state::AppState;

#[tauri::command]
pub async fn reskin_registry_get(
    state: State<'_, AppState>,
) -> AppResult<ReskinRegistry> {
    registry::load(&state.app_data_dir)
}

#[tauri::command]
pub async fn reskin_registry_upsert(
    entry: ReskinEntry,
    state: State<'_, AppState>,
) -> AppResult<ReskinEntry> {
    registry::upsert(&state.app_data_dir, entry)
}

#[tauri::command]
pub async fn reskin_registry_remove(
    classname: String,
    state: State<'_, AppState>,
) -> AppResult<bool> {
    registry::remove(&state.app_data_dir, &classname)
}

#[tauri::command]
pub async fn reskin_registry_set_mod_name(
    mod_name: String,
    state: State<'_, AppState>,
) -> AppResult<ReskinRegistry> {
    registry::set_mod_name(&state.app_data_dir, &mod_name)
}

#[tauri::command]
pub async fn reskin_build_all(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<ReskinBuildResult> {
    let reg = registry::load(&state.app_data_dir)?;
    let tools_dir = tools::resolve_tools_dir(&app);
    build::build_from_registry(&state.app_data_dir, &tools_dir, &reg)
}

#[tauri::command]
pub async fn reskin_open_build(
    mod_path: String,
    app: AppHandle,
) -> AppResult<()> {
    let path = std::path::PathBuf::from(&mod_path);
    if !path.exists() {
        return Err(AppError::Internal(format!(
            "build not found at {mod_path}"
        )));
    }
    app.opener()
        .open_path(path.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(())
}

// ---------- External PBOs ----------

/// Register a user-supplied `.pbo` as part of the modpack. The file
/// must exist and end in `.pbo` — we do a minimal sanity check and
/// capture the current size for display. The frontend passes an
/// absolute path from the file picker.
#[tauri::command]
pub async fn reskin_external_pbo_add(
    source_path: String,
    display_name: Option<String>,
    notes: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<ExternalPboEntry> {
    let path = std::path::PathBuf::from(&source_path);
    if !path.is_file() {
        return Err(AppError::Internal(format!(
            "file not found: {source_path}"
        )));
    }
    let ext_ok = path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.eq_ignore_ascii_case("pbo"))
        .unwrap_or(false);
    if !ext_ok {
        return Err(AppError::Internal(format!(
            "expected a .pbo file, got: {source_path}"
        )));
    }
    let size_bytes = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    let display = display_name
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("pbo")
                .to_string()
        });
    let entry = ExternalPboEntry {
        id: String::new(),
        display_name: display,
        source_path,
        include: true,
        notes: notes.unwrap_or_default(),
        added_at: String::new(),
        size_bytes,
    };
    registry::upsert_external_pbo(&state.app_data_dir, entry)
}

#[tauri::command]
pub async fn reskin_external_pbo_update(
    entry: ExternalPboEntry,
    state: State<'_, AppState>,
) -> AppResult<ExternalPboEntry> {
    registry::upsert_external_pbo(&state.app_data_dir, entry)
}

#[tauri::command]
pub async fn reskin_external_pbo_remove(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<bool> {
    registry::remove_external_pbo(&state.app_data_dir, &id)
}

#[tauri::command]
pub async fn reskin_external_pbo_set_include(
    id: String,
    include: bool,
    state: State<'_, AppState>,
) -> AppResult<bool> {
    registry::set_external_pbo_include(&state.app_data_dir, &id, include)
}

// ---------- Config classes ----------

#[tauri::command]
pub async fn reskin_config_class_upsert(
    entry: ConfigClassEntry,
    state: State<'_, AppState>,
) -> AppResult<ConfigClassEntry> {
    registry::upsert_config_class(&state.app_data_dir, entry)
}

#[tauri::command]
pub async fn reskin_config_class_remove(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<bool> {
    registry::remove_config_class(&state.app_data_dir, &id)
}
