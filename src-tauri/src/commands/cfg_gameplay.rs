//! Tauri commands for the `cfggameplay.json` typed editor.

use serde::Serialize;
use tauri::State;

use crate::domain::cfg_gameplay::CfgGameplay;
use crate::error::{AppError, AppResult};
use crate::git_ops;
use crate::mission::{cfg_gameplay as cfg_gameplay_mod, MissionContext};
use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CfgGameplaySnapshot {
    /// `None` when the mission has no `cfggameplay.json` — the UI
    /// offers a "create default" button in that case.
    pub data: Option<CfgGameplay>,
    /// Resolved absolute path, for operator-level visibility.
    pub file_display: String,
    pub file_exists: bool,
}

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
pub async fn cfg_gameplay_get(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<CfgGameplaySnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    let path = cfg_gameplay_mod::path(&ctx);
    let data = cfg_gameplay_mod::load(&ctx)?;
    Ok(CfgGameplaySnapshot {
        data,
        file_display: path.to_string_lossy().into_owned(),
        file_exists: path.exists(),
    })
}

#[tauri::command]
pub async fn cfg_gameplay_update(
    id: String,
    data: CfgGameplay,
    state: State<'_, AppState>,
) -> AppResult<CfgGameplaySnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    cfg_gameplay_mod::save(&ctx, &data)?;
    git_ops::commit_all(&ctx.workspace, "edit(cfggameplay): update")?;
    let path = cfg_gameplay_mod::path(&ctx);
    Ok(CfgGameplaySnapshot {
        data: Some(data),
        file_display: path.to_string_lossy().into_owned(),
        file_exists: true,
    })
}

#[tauri::command]
pub async fn cfg_gameplay_create_default(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<CfgGameplaySnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    cfg_gameplay_mod::write_default(&ctx)?;
    git_ops::commit_all(
        &ctx.workspace,
        "create(cfggameplay): scaffolded from Bohemia defaults",
    )?;
    let data = cfg_gameplay_mod::load(&ctx)?;
    let path = cfg_gameplay_mod::path(&ctx);
    Ok(CfgGameplaySnapshot {
        data,
        file_display: path.to_string_lossy().into_owned(),
        file_exists: true,
    })
}
