//! Territory editor commands — both geometry (`db/env/*.xml`) and
//! behaviour (`cfgenvironment.xml`). The pair only makes sense
//! together, so every read returns a joined snapshot and every
//! write re-reads both sides before returning.

use serde::Serialize;
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::git_ops;
use crate::mission::{
    cfgenvironment as env_mod, territories as terr_mod, MissionContext,
};
use crate::parsers::cfgenvironment_xml::{CfgEnvironment, TerritoryBinding};
use crate::parsers::territories_xml::{Territory, TerritoryFile, Zone};
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
pub struct TerritoriesSnapshot {
    pub files: Vec<terr_mod::TerritoryFileEntry>,
    /// Parsed cfgenvironment — `None` when the mission doesn't ship
    /// one (in which case no zones actually spawn, even if files
    /// exist).
    pub environment: Option<CfgEnvironment>,
    pub missing_environment: bool,
}

fn snapshot(ctx: &MissionContext) -> AppResult<TerritoriesSnapshot> {
    let files = terr_mod::list(ctx)?;
    let environment = env_mod::load(ctx)?;
    let missing_environment = environment.is_none();
    Ok(TerritoriesSnapshot {
        files,
        environment,
        missing_environment,
    })
}

#[tauri::command]
pub async fn territories_list(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<TerritoriesSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    snapshot(&ctx)
}

#[tauri::command]
pub async fn territories_update(
    id: String,
    filename: String,
    data: TerritoryFile,
    state: State<'_, AppState>,
) -> AppResult<TerritoriesSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    terr_mod::save(&ctx, &filename, &data)?;
    git_ops::commit_all(
        &ctx.workspace,
        &format!("edit(territories): {filename}"),
    )?;
    snapshot(&ctx)
}

#[tauri::command]
pub async fn cfgenvironment_update(
    id: String,
    data: CfgEnvironment,
    state: State<'_, AppState>,
) -> AppResult<TerritoriesSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    env_mod::save(&ctx, &data)?;
    git_ops::commit_all(&ctx.workspace, "edit(territories): cfgenvironment.xml")?;
    snapshot(&ctx)
}

/// Wire up a brand-new animal / infected category end-to-end:
///
/// 1. Writes a `<stem>_territories.xml` geometry file with ONE
///    starter zone at roughly the middle of a Chernarus-sized map.
///    An empty file landed the operator in a chicken-and-egg state:
///    the layer showed no rendered circles, so they couldn't click
///    anything to start editing. A visible starter zone is the
///    discoverable nudge.
/// 2. Appends `<file path="env/<stem>.xml"/>` to cfgenvironment,
///    creating the env file fresh if none exists.
/// 3. Appends the caller-supplied `<territory>` binding.
///
/// One git commit for the whole transaction so `git log` reads
/// cleanly. Filename is sanitised on the mission side before being
/// joined to any path.
#[tauri::command]
pub async fn territories_add_animal(
    id: String,
    filename: String,
    binding: TerritoryBinding,
    state: State<'_, AppState>,
) -> AppResult<TerritoriesSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    // Seed the file with a starter zone so the operator has
    // something draggable to work with the moment the category
    // appears. Dropping at (7500, 7500) with r=150 puts it roughly
    // centre-screen on Chernarus and within-bounds on every vanilla
    // map (Livonia / Sakhal are smaller at 12800m, so 7500 is still
    // inside their playfields). The operator drags / resizes or
    // deletes it; this is just a visible starting point.
    let starter = TerritoryFile {
        territories: vec![Territory {
            color: "0".into(),
            zones: vec![Zone {
                name: "Zone".into(),
                x: 7500.0,
                z: 7500.0,
                r: 150.0,
                smin: 0.0,
                smax: 0.0,
                dmin: 0.0,
                dmax: 0.0,
            }],
        }],
    };
    terr_mod::save(&ctx, &filename, &starter)?;

    // Splice into cfgenvironment.
    let mut env = env_mod::load(&ctx)?.unwrap_or_default();
    let stem = filename.trim_end_matches(".xml").to_string();
    let rel_path = env_mod::env_path_for_stem(&stem);
    if !env.file_paths.iter().any(|p| p == &rel_path) {
        env.file_paths.push(rel_path);
    }
    // Force the binding's file_usable to match the new stem so the
    // game can link them — callers occasionally leave it blank when
    // they don't know the convention.
    let mut binding = binding;
    if binding.file_usable.is_empty() {
        binding.file_usable = stem;
    }
    env.bindings.push(binding);
    env_mod::save(&ctx, &env)?;

    git_ops::commit_all(
        &ctx.workspace,
        &format!("add(territories): {filename}"),
    )?;
    snapshot(&ctx)
}

/// Remove an animal / infected category end-to-end: delete the
/// geometry file, strip the matching `<file path>` and any binding
/// whose `file_usable` points at this stem. No-op when the file
/// isn't there — the caller might be cleaning up a half-created
/// entry.
#[tauri::command]
pub async fn territories_remove_animal(
    id: String,
    filename: String,
    state: State<'_, AppState>,
) -> AppResult<TerritoriesSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    let stem = filename.trim_end_matches(".xml").to_string();
    let rel_path = env_mod::env_path_for_stem(&stem);

    // Delete the geometry file — tolerate missing.
    let geom_path = terr_mod::env_dir(&ctx).join(sanitise(&filename));
    if geom_path.is_file() {
        std::fs::remove_file(&geom_path)?;
    }

    // Update cfgenvironment if present.
    if let Some(mut env) = env_mod::load(&ctx)? {
        env.file_paths.retain(|p| p != &rel_path);
        env.bindings.retain(|b| b.file_usable != stem);
        env_mod::save(&ctx, &env)?;
    }

    git_ops::commit_all(
        &ctx.workspace,
        &format!("remove(territories): {filename}"),
    )?;
    snapshot(&ctx)
}

/// Local mirror of the filename sanitisation in `mission::territories`
/// so `remove_file` can't escape the env dir if the frontend passes
/// a traversal-style input.
fn sanitise(name: &str) -> String {
    let base = std::path::Path::new(name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    if base.ends_with("_territories.xml")
        && !base.contains('/')
        && !base.contains('\\')
    {
        base.to_string()
    } else {
        "unknown_territories.xml".to_string()
    }
}
