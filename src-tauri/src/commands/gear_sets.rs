//! Gear Sets Tauri commands (PDR §9.7 / Phase 6a — read-only).

use serde::Serialize;
use tauri::State;

use crate::domain::{PlayerSpawnGear, SpawnKit};
use crate::error::{AppError, AppResult};
use crate::git_ops;
use crate::mission::{player_spawn_gear as psg_mod, MissionContext};
use crate::parsers::init_c;
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
pub struct GearSetsSnapshot {
    pub data: PlayerSpawnGear,
    pub missing_file: bool,
    /// `spawnPresets` | `cfgPlayerSpawnGear` | `missing`
    pub source: String,
    /// Absolute-ish file path (workspace-relative preferable but we
    /// only need it for display hints — the frontend doesn't open it).
    pub file_display: String,
    /// Unique classnames across every loadout — front-end surfaces
    /// how many of them are recognised by the Items registry (Phase
    /// 6b will add cross-ref validation).
    pub all_classnames: Vec<String>,
    /// Populated when `source` is `spawnPresets`. Empty otherwise.
    pub kits: Vec<SpawnKit>,
}

#[tauri::command]
pub async fn gear_sets_get(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<GearSetsSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    let source = psg_mod::resolve_source(&ctx);
    let data = psg_mod::load(&ctx)?;
    let missing_file = source == psg_mod::GearFileSource::Missing;

    // Union of every classname referenced by every loadout.
    let mut seen = std::collections::HashSet::new();
    let mut all_classnames = Vec::new();
    for l in &data.loadouts {
        for n in &l.classnames {
            if seen.insert(n.clone()) {
                all_classnames.push(n.clone());
            }
        }
    }
    all_classnames.sort();

    let file_display = match source {
        psg_mod::GearFileSource::SpawnPresets => psg_mod::spawn_preset_paths(&ctx)
            .into_iter()
            .map(|p| {
                p.strip_prefix(&ctx.workspace)
                    .map(|r| r.to_string_lossy().replace('\\', "/"))
                    .unwrap_or_else(|_| p.to_string_lossy().replace('\\', "/"))
            })
            .collect::<Vec<_>>()
            .join(", "),
        _ => {
            let p = psg_mod::path(&ctx);
            p.strip_prefix(&ctx.workspace)
                .map(|r| r.to_string_lossy().replace('\\', "/"))
                .unwrap_or_else(|_| p.to_string_lossy().replace('\\', "/"))
        }
    };

    let kits = if source == psg_mod::GearFileSource::SpawnPresets {
        psg_mod::load_kits(&ctx)?
    } else {
        Vec::new()
    };

    Ok(GearSetsSnapshot {
        data,
        missing_file,
        source: source.as_str().into(),
        file_display,
        all_classnames,
        kits,
    })
}

#[tauri::command]
pub async fn gear_sets_update(
    id: String,
    data: PlayerSpawnGear,
    state: State<'_, AppState>,
) -> AppResult<GearSetsSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    if psg_mod::resolve_source(&ctx) == psg_mod::GearFileSource::SpawnPresets {
        return Err(AppError::Internal(
            "this mission uses spawn presets — call gear_sets_update_kits".into(),
        ));
    }
    psg_mod::save(&ctx, &data)?;
    git_ops::commit_all(
        &ctx.workspace,
        "edit(gear-sets): cfgPlayerSpawnGear.json",
    )?;
    // Re-read to produce a fresh snapshot (picks up any formatting
    // changes from the serializer, keeps the frontend in sync).
    gear_sets_get(id, state).await
}

#[tauri::command]
pub async fn gear_sets_update_kits(
    id: String,
    kits: Vec<SpawnKit>,
    state: State<'_, AppState>,
) -> AppResult<GearSetsSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    if psg_mod::resolve_source(&ctx) != psg_mod::GearFileSource::SpawnPresets {
        return Err(AppError::Internal(
            "this mission has no spawnGearPresetFiles — use gear_sets_update".into(),
        ));
    }
    psg_mod::save_kits(&ctx, &kits)?;
    git_ops::commit_all(
        &ctx.workspace,
        "edit(gear-sets): spawn preset kit",
    )?;
    gear_sets_get(id, state).await
}

#[tauri::command]
pub async fn gear_sets_scan_init_c(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<init_c::InitCScan> {
    let ctx = ctx_for(&id, &state).await?;
    let p = psg_mod::init_c_path(&ctx);
    let mut scan = init_c::scan_file(&p)?;
    // Prefer a workspace-relative display path over the absolute one.
    scan.file_display = p
        .strip_prefix(&ctx.workspace)
        .map(|r| r.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| p.to_string_lossy().replace('\\', "/"));
    Ok(scan)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateFromInitCResult {
    pub written_path: String,
    pub classnames_count: usize,
    /// Set to true if the target file already existed — callers can
    /// warn the user before clobbering. (The command overwrites on
    /// success; the frontend gates behind a confirm dialog.)
    pub overwrote_existing: bool,
}

#[tauri::command]
pub async fn gear_sets_generate_from_init_c(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<GenerateFromInitCResult> {
    let ctx = ctx_for(&id, &state).await?;
    let init_path = psg_mod::init_c_path(&ctx);
    if !init_path.exists() {
        return Err(AppError::Internal(format!(
            "init.c not found at {} — cannot import",
            init_path.display()
        )));
    }
    let scan = init_c::scan_file(&init_path)?;
    if scan.classnames.is_empty() {
        return Err(AppError::Internal(
            "init.c scan found no CreateInInventory / CreateAttachment \
             calls — nothing to import. You may need to define gear in \
             cfgPlayerSpawnGear.json by hand."
                .into(),
        ));
    }

    let json = init_c::starter_json_from_scan(&scan);
    let target = psg_mod::path(&ctx);
    let overwrote_existing = target.exists();
    let written = psg_mod::write_json(&ctx, &json)?;

    git_ops::commit_all(
        &ctx.workspace,
        "gear-sets: generate cfgPlayerSpawnGear.json from init.c",
    )?;

    let rel = written
        .strip_prefix(&ctx.workspace)
        .map(|r| r.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| written.to_string_lossy().replace('\\', "/"));

    Ok(GenerateFromInitCResult {
        written_path: rel,
        classnames_count: scan.classnames.len(),
        overwrote_existing,
    })
}
