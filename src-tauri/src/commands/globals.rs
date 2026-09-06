//! Globals (`globals.xml`) Tauri commands (PDR §5.6 / Phase 7a).

use serde::Serialize;
use tauri::State;

use crate::domain::Globals;
use crate::error::{AppError, AppResult};
use crate::git_ops;
use crate::mission::{globals as globals_mod, MissionContext};
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalsSnapshot {
    pub data: Globals,
    pub missing_file: bool,
    pub file_display: String,
}

#[tauri::command]
pub async fn globals_get(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<GlobalsSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    let p = globals_mod::path(&ctx);
    let missing_file = !p.exists();
    let data = globals_mod::load(&ctx)?;
    let file_display = p
        .strip_prefix(&ctx.workspace)
        .map(|r| r.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| p.to_string_lossy().replace('\\', "/"));
    Ok(GlobalsSnapshot {
        data,
        missing_file,
        file_display,
    })
}

#[tauri::command]
pub async fn globals_update(
    id: String,
    data: Globals,
    state: State<'_, AppState>,
) -> AppResult<GlobalsSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    globals_mod::save(&ctx, &data)?;
    git_ops::commit_all(&ctx.workspace, "edit(globals): globals.xml")?;
    globals_get(id, state).await
}
