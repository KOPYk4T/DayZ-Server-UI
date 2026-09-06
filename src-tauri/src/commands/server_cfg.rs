//! `serverDZ.cfg` Tauri commands (PDR §7 / Phase 7b).

use serde::Serialize;
use tauri::State;

use crate::domain::ServerCfg;
use crate::error::{AppError, AppResult};
use crate::git_ops;
use crate::mission::{server_cfg as scfg_mod, MissionContext};
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
pub struct ServerCfgSnapshot {
    pub data: ServerCfg,
    pub missing_file: bool,
    pub file_display: String,
    /// All candidate paths we looked at — shown in the UI so users
    /// with a non-standard layout can see where we searched.
    pub searched_paths: Vec<String>,
}

#[tauri::command]
pub async fn server_cfg_get(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<ServerCfgSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    let p = scfg_mod::path(&ctx);
    let missing_file = !p.exists();
    let data = scfg_mod::load(&ctx)?;
    let file_display = scfg_mod::display_path(&ctx, &p);
    let searched_paths = scfg_mod::candidate_paths(&ctx)
        .into_iter()
        .map(|p| scfg_mod::display_path(&ctx, &p))
        .collect();
    Ok(ServerCfgSnapshot {
        data,
        missing_file,
        file_display,
        searched_paths,
    })
}

#[tauri::command]
pub async fn server_cfg_update(
    id: String,
    data: ServerCfg,
    state: State<'_, AppState>,
) -> AppResult<ServerCfgSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    scfg_mod::save(&ctx, &data)?;
    git_ops::commit_all(&ctx.workspace, "edit(server-cfg): serverDZ.cfg")?;
    server_cfg_get(id, state).await
}
