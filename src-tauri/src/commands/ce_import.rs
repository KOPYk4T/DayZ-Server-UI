//! Tauri commands for "Import mod CE files" (see `mission::import`).
//!
//! Two-step flow so the UI can show a scan preview before committing:
//!   1. `ce_import_scan(id, source_dir)` — walks the source folder,
//!      returns an [`ImportPlan`] the user reviews.
//!   2. `ce_import_apply(id, request)` — copies selected files and
//!      updates `cfgeconomycore.xml`. Commits to git.

use std::path::PathBuf;

use tauri::State;

use crate::error::{AppError, AppResult};
use crate::git_ops;
use crate::mission::import::{
    self, CeImportEntry, ImportPlan, ImportRequest, ImportResult,
    RemoveImportRequest, RemoveImportResult,
};
use crate::mission::MissionContext;
use crate::state::AppState;

async fn ctx_for(id: &str, state: &State<'_, AppState>) -> AppResult<MissionContext> {
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
    MissionContext::resolve(&workspace, &profile)
}

#[tauri::command]
pub async fn ce_import_scan(
    id: String,
    source_dir: String,
    state: State<'_, AppState>,
) -> AppResult<ImportPlan> {
    let _ctx = ctx_for(&id, &state).await?; // validates workspace exists
    import::scan(&PathBuf::from(source_dir))
}

#[tauri::command]
pub async fn ce_import_apply(
    id: String,
    request: ImportRequest,
    state: State<'_, AppState>,
) -> AppResult<ImportResult> {
    let ctx = ctx_for(&id, &state).await?;
    let result = import::apply(&ctx, &request)?;

    // Commit the mission-folder changes (files copied + cfgeconomycore).
    let msg = format!(
        "ce: import {} file(s) into {}",
        result.imported_count, result.dest_folder
    );
    git_ops::commit_all(&ctx.workspace, &msg)?;

    Ok(result)
}

#[tauri::command]
pub async fn ce_imports_list(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<CeImportEntry>> {
    let ctx = ctx_for(&id, &state).await?;
    import::list_ce_imports(&ctx)
}

#[tauri::command]
pub async fn ce_imports_remove(
    id: String,
    request: RemoveImportRequest,
    state: State<'_, AppState>,
) -> AppResult<RemoveImportResult> {
    let ctx = ctx_for(&id, &state).await?;
    let result = import::remove_ce_import(&ctx, &request)?;

    let msg = if result.directory_removed {
        format!(
            "ce: uninstall {} ({} file(s), {} block(s))",
            result.folder_top, result.files_deleted, result.blocks_removed
        )
    } else {
        format!(
            "ce: unregister {} ({} block(s) removed)",
            result.folder_top, result.blocks_removed
        )
    };
    git_ops::commit_all(&ctx.workspace, &msg)?;

    Ok(result)
}
