//! Buildings (`mapgroupproto.xml`) Tauri commands (PDR §8 / Phase 8a — read-only).

use serde::Serialize;
use tauri::State;

use crate::domain::BuildingsData;
use crate::error::{AppError, AppResult};
use crate::mission::{buildings as buildings_mod, MissionContext};
use crate::parsers::mapgrouppos_xml::{self, Placement};
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
pub struct BuildingsSnapshot {
    pub data: BuildingsData,
    pub missing_file: bool,
    pub file_display: String,
    /// True when `mapgrouppos.xml` (placements) wasn't found next to
    /// mapgroupproto.xml. The UI surfaces this separately so users
    /// know why placement counts are zero.
    pub missing_pos_file: bool,
    pub pos_file_display: String,
    pub total_containers: usize,
    pub total_points: usize,
}

#[tauri::command]
pub async fn buildings_get(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<BuildingsSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    let proto = buildings_mod::path(&ctx);
    let pos = buildings_mod::pos_path(&ctx);
    let missing_file = !proto.exists();
    let missing_pos_file = !pos.exists();
    let data = buildings_mod::load(&ctx)?;
    let rel_of = |p: &std::path::Path| {
        p.strip_prefix(&ctx.workspace)
            .map(|r| r.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|_| p.to_string_lossy().replace('\\', "/"))
    };
    let total_containers: usize =
        data.prototypes.iter().map(|p| p.container_count).sum();
    let total_points: usize = data.prototypes.iter().map(|p| p.point_count).sum();
    Ok(BuildingsSnapshot {
        data,
        missing_file,
        file_display: rel_of(&proto),
        missing_pos_file,
        pos_file_display: rel_of(&pos),
        total_containers,
        total_points,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildingPlacementsSnapshot {
    pub placements: Vec<Placement>,
    pub missing_file: bool,
    pub file_display: String,
}

/// Returns the full `(name, x, z)` list from `mapgrouppos.xml`. Kept
/// separate from `buildings_get` because the list is large (~11k
/// placements for vanilla Chernarus) and only the Map layer needs
/// it — the Buildings table only needs counts.
#[tauri::command]
pub async fn buildings_placements_get(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<BuildingPlacementsSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    let pos = buildings_mod::pos_path(&ctx);
    let missing_file = !pos.exists();
    let placements = if pos.exists() {
        mapgrouppos_xml::list_placements_file(&pos)?
    } else {
        Vec::new()
    };
    let file_display = pos
        .strip_prefix(&ctx.workspace)
        .map(|r| r.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| pos.to_string_lossy().replace('\\', "/"));
    Ok(BuildingPlacementsSnapshot {
        placements,
        missing_file,
        file_display,
    })
}
