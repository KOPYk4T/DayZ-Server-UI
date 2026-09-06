//! Event / cfgeventspawns Tauri commands (PDR §9.2).

use std::collections::HashSet;

use serde::Serialize;
use tauri::State;

use crate::domain::{DynamicEvent, EventSpawnGroup};
use crate::error::{AppError, AppResult};
use crate::git_ops;
use crate::mission::{events as events_mod, items as items_mod, MissionContext};
use crate::state::AppState;
use crate::validation::{events as events_validation, Issue};

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
pub struct EventsSnapshot {
    pub events: Vec<DynamicEvent>,
    pub spawns: Vec<EventSpawnGroup>,
    pub files: Vec<FileOriginOut>,
    pub validation: Vec<Issue>,
    /// Every classname seen in the items registry — for autocomplete.
    pub known_classnames: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileOriginOut {
    pub relative: String,
    pub source: crate::domain::ItemSource,
    pub kind: String,
    pub count: usize,
}

#[tauri::command]
pub async fn events_list(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<EventsSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    snapshot(&ctx)
}

#[tauri::command]
pub async fn events_get(
    id: String,
    name: String,
    state: State<'_, AppState>,
) -> AppResult<EventPayload> {
    let ctx = ctx_for(&id, &state).await?;
    let registry = events_mod::load(&ctx)?;
    let event = registry
        .events
        .get(&name)
        .cloned()
        .ok_or_else(|| AppError::Internal(format!("event '{name}' not found")))?;
    let spawns = registry.spawns.get(&name).cloned();
    Ok(EventPayload { event, spawns })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventPayload {
    pub event: DynamicEvent,
    pub spawns: Option<EventSpawnGroup>,
}

#[tauri::command]
pub async fn events_upsert(
    id: String,
    events: Vec<DynamicEvent>,
    spawns: Vec<EventSpawnGroup>,
    state: State<'_, AppState>,
) -> AppResult<EventsSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    let edits_dir = state.edits_dir();
    events_mod::upsert_into_custom(&ctx, &events, &spawns, &edits_dir, &id)?;
    let names: Vec<String> = events
        .iter()
        .map(|e| e.name.clone())
        .chain(spawns.iter().map(|g| g.event_name.clone()))
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    git_ops::commit_all(
        &ctx.workspace,
        &format!("edit(events): upsert {}", names.join(", ")),
    )?;
    snapshot(&ctx)
}

#[tauri::command]
pub async fn events_delete(
    id: String,
    names: Vec<String>,
    state: State<'_, AppState>,
) -> AppResult<EventsSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    let removed = events_mod::remove_from_custom(&ctx, &names)?;
    if removed > 0 {
        git_ops::commit_all(
            &ctx.workspace,
            &format!("edit(events): remove {}", names.join(", ")),
        )?;
    }
    snapshot(&ctx)
}

#[tauri::command]
pub async fn events_raw_xml(
    id: String,
    name: String,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let ctx = ctx_for(&id, &state).await?;
    let registry = events_mod::load(&ctx)?;
    let e = registry
        .events
        .get(&name)
        .ok_or_else(|| AppError::Internal(format!("event '{name}' not found")))?;
    events_mod::raw_xml_for_event(e)
}

fn snapshot(ctx: &MissionContext) -> AppResult<EventsSnapshot> {
    let registry = events_mod::load(ctx)?;
    let items = items_mod::load(ctx).ok();
    let known: HashSet<String> = items
        .as_ref()
        .map(|r| r.items.keys().cloned().collect())
        .unwrap_or_default();

    let mut events: Vec<DynamicEvent> = registry.events.into_values().collect();
    events.sort_by(|a, b| a.name.cmp(&b.name));
    let mut spawns: Vec<EventSpawnGroup> = registry.spawns.into_values().collect();
    spawns.sort_by(|a, b| a.event_name.cmp(&b.event_name));

    // Surface per-file parse failures at the top so users see them first.
    let mut validation = registry.load_errors.clone();
    validation.extend(events_validation::validate(&events, &spawns, &known));
    let mut known_sorted: Vec<String> = known.into_iter().collect();
    known_sorted.sort();

    Ok(EventsSnapshot {
        events,
        spawns,
        files: registry
            .files_loaded
            .into_iter()
            .map(|f| FileOriginOut {
                relative: f.relative,
                source: f.source,
                kind: f.kind.to_string(),
                count: f.count,
            })
            .collect(),
        validation,
        known_classnames: known_sorted,
    })
}
