//! Spawnables + random presets Tauri commands (PDR §9.3).
//!
//! Two registries, one command surface (they share a file/folder
//! layout and cross-reference each other).

use std::collections::{HashMap, HashSet};

use serde::Serialize;
use tauri::State;

use crate::domain::{ItemSource, PresetKind, RandomPreset, SpawnableType};
use crate::error::{AppError, AppResult};
use crate::git_ops;
use crate::mission::{
    items as items_mod, loadouts as loadouts_mod, MissionContext,
};
use crate::state::AppState;
use crate::validation::{loadouts as loadouts_validation, Issue};

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
pub struct LoadoutsFileOrigin {
    pub relative: String,
    pub source: ItemSource,
    pub kind: String,
    pub count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadoutsSnapshot {
    pub spawnables: Vec<SpawnableType>,
    pub presets: Vec<RandomPreset>,
    pub files: Vec<LoadoutsFileOrigin>,
    pub validation: Vec<Issue>,
    pub known_classnames: Vec<String>,
    /// Preset names split by kind so the UI can drive the "attachments vs cargo"
    /// picker without re-filtering on every render.
    pub preset_names_attachments: Vec<String>,
    pub preset_names_cargo: Vec<String>,
}

#[tauri::command]
pub async fn loadouts_list(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<LoadoutsSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    snapshot(&ctx)
}

#[tauri::command]
pub async fn spawnables_get(
    id: String,
    name: String,
    state: State<'_, AppState>,
) -> AppResult<SpawnableType> {
    let ctx = ctx_for(&id, &state).await?;
    let registry = loadouts_mod::load(&ctx)?;
    registry
        .spawnables
        .get(&name)
        .cloned()
        .ok_or_else(|| AppError::Internal(format!("spawnable '{name}' not found")))
}

#[tauri::command]
pub async fn spawnables_upsert(
    id: String,
    spawnables: Vec<SpawnableType>,
    state: State<'_, AppState>,
) -> AppResult<LoadoutsSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    loadouts_mod::upsert_spawnables(&ctx, &spawnables)?;
    let names: Vec<String> = spawnables.iter().map(|s| s.name.clone()).collect();
    git_ops::commit_all(
        &ctx.workspace,
        &format!("edit(spawnables): upsert {}", names.join(", ")),
    )?;
    snapshot(&ctx)
}

#[tauri::command]
pub async fn spawnables_delete(
    id: String,
    names: Vec<String>,
    state: State<'_, AppState>,
) -> AppResult<LoadoutsSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    let removed = loadouts_mod::remove_spawnables(&ctx, &names)?;
    if removed > 0 {
        git_ops::commit_all(
            &ctx.workspace,
            &format!("edit(spawnables): remove {}", names.join(", ")),
        )?;
    }
    snapshot(&ctx)
}

#[tauri::command]
pub async fn spawnables_raw_xml(
    id: String,
    name: String,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let ctx = ctx_for(&id, &state).await?;
    let registry = loadouts_mod::load(&ctx)?;
    let s = registry
        .spawnables
        .get(&name)
        .ok_or_else(|| AppError::Internal(format!("spawnable '{name}' not found")))?;
    loadouts_mod::raw_xml_for_spawnable(s)
}

#[tauri::command]
pub async fn presets_get(
    id: String,
    name: String,
    state: State<'_, AppState>,
) -> AppResult<RandomPreset> {
    let ctx = ctx_for(&id, &state).await?;
    let registry = loadouts_mod::load(&ctx)?;
    registry
        .presets
        .get(&name)
        .cloned()
        .ok_or_else(|| AppError::Internal(format!("preset '{name}' not found")))
}

#[tauri::command]
pub async fn presets_upsert(
    id: String,
    presets: Vec<RandomPreset>,
    state: State<'_, AppState>,
) -> AppResult<LoadoutsSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    loadouts_mod::upsert_presets(&ctx, &presets)?;
    let names: Vec<String> = presets.iter().map(|p| p.name.clone()).collect();
    git_ops::commit_all(
        &ctx.workspace,
        &format!("edit(presets): upsert {}", names.join(", ")),
    )?;
    snapshot(&ctx)
}

#[tauri::command]
pub async fn presets_delete(
    id: String,
    names: Vec<String>,
    state: State<'_, AppState>,
) -> AppResult<LoadoutsSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    let removed = loadouts_mod::remove_presets(&ctx, &names)?;
    if removed > 0 {
        git_ops::commit_all(
            &ctx.workspace,
            &format!("edit(presets): remove {}", names.join(", ")),
        )?;
    }
    snapshot(&ctx)
}

#[tauri::command]
pub async fn presets_raw_xml(
    id: String,
    name: String,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let ctx = ctx_for(&id, &state).await?;
    let registry = loadouts_mod::load(&ctx)?;
    let p = registry
        .presets
        .get(&name)
        .ok_or_else(|| AppError::Internal(format!("preset '{name}' not found")))?;
    loadouts_mod::raw_xml_for_preset(p)
}

fn snapshot(ctx: &MissionContext) -> AppResult<LoadoutsSnapshot> {
    let registry = loadouts_mod::load(ctx)?;
    let items = items_mod::load(ctx).ok();
    let known: HashSet<String> = items
        .as_ref()
        .map(|r| r.items.keys().cloned().collect())
        .unwrap_or_default();

    let presets_by_kind: HashMap<String, PresetKind> = registry
        .presets
        .values()
        .map(|p| (p.name.clone(), p.kind))
        .collect();

    let mut spawnables: Vec<SpawnableType> = registry.spawnables.into_values().collect();
    spawnables.sort_by(|a, b| a.name.cmp(&b.name));
    let mut presets: Vec<RandomPreset> = registry.presets.into_values().collect();
    presets.sort_by(|a, b| a.name.cmp(&b.name));

    let validation_spawnables =
        loadouts_validation::validate_spawnables(&spawnables, &known, &presets_by_kind);
    let validation_presets =
        loadouts_validation::validate_presets(&presets, &known);
    // Surface per-file parse failures at the top so users see them first.
    let mut validation = registry.load_errors.clone();
    validation.extend(validation_spawnables);
    validation.extend(validation_presets);

    let mut known_sorted: Vec<String> = known.into_iter().collect();
    known_sorted.sort();

    let preset_names_attachments: Vec<String> = presets
        .iter()
        .filter(|p| p.kind == PresetKind::Attachments)
        .map(|p| p.name.clone())
        .collect();
    let preset_names_cargo: Vec<String> = presets
        .iter()
        .filter(|p| p.kind == PresetKind::Cargo)
        .map(|p| p.name.clone())
        .collect();

    Ok(LoadoutsSnapshot {
        spawnables,
        presets,
        files: registry
            .files_loaded
            .into_iter()
            .map(|f| LoadoutsFileOrigin {
                relative: f.relative,
                source: f.source,
                kind: f.kind.to_string(),
                count: f.count,
            })
            .collect(),
        validation,
        known_classnames: known_sorted,
        preset_names_attachments,
        preset_names_cargo,
    })
}
