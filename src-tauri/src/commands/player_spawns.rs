//! Player spawn point Tauri commands (PDR §9.6).

use serde::Serialize;
use tauri::State;

use crate::domain::PlayerSpawnPoints;
use crate::error::{AppError, AppResult};
use crate::git_ops;
use crate::mission::{player_spawns as ps_mod, MissionContext};
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
pub struct PlayerSpawnsSnapshot {
    pub data: PlayerSpawnPoints,
    pub missing_file: bool,
}

#[tauri::command]
pub async fn player_spawns_get(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<PlayerSpawnsSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    let missing_file = !ps_mod::path(&ctx).exists();
    let data = ps_mod::load(&ctx)?;
    Ok(PlayerSpawnsSnapshot { data, missing_file })
}

#[tauri::command]
pub async fn player_spawns_update(
    id: String,
    data: PlayerSpawnPoints,
    state: State<'_, AppState>,
) -> AppResult<PlayerSpawnsSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    ps_mod::save(&ctx, &data)?;
    git_ops::commit_all(
        &ctx.workspace,
        "edit(player-spawns): cfgplayerspawnpoints.xml",
    )?;
    Ok(PlayerSpawnsSnapshot {
        data,
        missing_file: false,
    })
}
