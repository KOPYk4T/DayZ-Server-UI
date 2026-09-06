//! Item (types.xml) Tauri commands (PDR §9.1).

use serde::Serialize;
use tauri::State;

use crate::domain::ItemType;
use crate::error::{AppError, AppResult};
use crate::git_ops;
use crate::mission::items as items_mod;
use crate::mission::limits as limits_mod;
use crate::mission::MissionContext;
use crate::state::AppState;
use crate::validation::{items as items_validation, Issue};

/// What the Items page lists at load — all effective items plus the file
/// provenance (so the UI can surface "loaded X items from N files").
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemsSnapshot {
    pub items: Vec<ItemType>,
    pub files: Vec<FileOriginOut>,
    pub validation: Vec<Issue>,
    pub categories: Vec<String>,
    pub usages: Vec<String>,
    pub values: Vec<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileOriginOut {
    pub relative: String,
    pub source: crate::domain::ItemSource,
    pub count: usize,
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
pub async fn items_list(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<ItemsSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    let registry = items_mod::load(&ctx)?;

    let mut items: Vec<ItemType> = registry.items.into_values().collect();
    items.sort_by(|a, b| a.name.cmp(&b.name));

    // Surface per-file parse failures at the top so users see them first.
    let mut validation = registry.load_errors.clone();
    // Items also get cross-referenced against cfglimitsdefinition.xml
    // so unknown usage/value/category/tag names surface as warnings.
    let limits = limits_mod::load(&ctx).ok();
    validation.extend(items_validation::validate_with_limits(
        &items,
        limits.as_ref(),
    ));

    let categories = derive_unique(&items, |it| it.category.iter().cloned().collect());
    let usages = derive_unique(&items, |it| it.usage.clone());
    let values = derive_unique(&items, |it| it.value.clone());
    let tags = derive_unique(&items, |it| it.tags.clone());

    Ok(ItemsSnapshot {
        items,
        files: registry
            .files_loaded
            .into_iter()
            .map(|f| FileOriginOut {
                relative: f.relative,
                source: f.source,
                count: f.count,
            })
            .collect(),
        validation,
        categories,
        usages,
        values,
        tags,
    })
}

#[tauri::command]
pub async fn items_get(
    id: String,
    name: String,
    state: State<'_, AppState>,
) -> AppResult<ItemType> {
    let ctx = ctx_for(&id, &state).await?;
    let registry = items_mod::load(&ctx)?;
    registry
        .items
        .get(&name)
        .cloned()
        .ok_or_else(|| AppError::Internal(format!("item '{name}' not found")))
}

#[tauri::command]
pub async fn items_upsert(
    id: String,
    items: Vec<ItemType>,
    state: State<'_, AppState>,
) -> AppResult<ItemsSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    items_mod::upsert_into_custom(&ctx, &items)?;
    let names: Vec<String> = items.iter().map(|i| i.name.clone()).collect();
    auto_commit(&ctx, &format!("edit(items): upsert {}", names.join(", ")))?;
    items_list(id, state).await
}

#[tauri::command]
pub async fn items_delete(
    id: String,
    names: Vec<String>,
    state: State<'_, AppState>,
) -> AppResult<ItemsSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    let removed = items_mod::remove_from_custom(&ctx, &names)?;
    if removed > 0 {
        auto_commit(
            &ctx,
            &format!("edit(items): remove {}", names.join(", ")),
        )?;
    }
    items_list(id, state).await
}

#[tauri::command]
pub async fn items_disable(
    id: String,
    names: Vec<String>,
    state: State<'_, AppState>,
) -> AppResult<ItemsSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    // Build disable overrides preserving any existing tags/usage/values
    // so the CE footprint doesn't change unexpectedly.
    let registry = items_mod::load(&ctx)?;
    let updates: Vec<ItemType> = names
        .iter()
        .filter_map(|n| registry.items.get(n).cloned())
        .map(|mut it| {
            it.nominal = 0;
            it.min = 0;
            it
        })
        .collect();
    items_mod::upsert_into_custom(&ctx, &updates)?;
    auto_commit(
        &ctx,
        &format!("edit(items): disable {}", names.join(", ")),
    )?;
    items_list(id, state).await
}

#[tauri::command]
pub async fn items_raw_xml(
    id: String,
    name: String,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let ctx = ctx_for(&id, &state).await?;
    let registry = items_mod::load(&ctx)?;
    let it = registry
        .items
        .get(&name)
        .ok_or_else(|| AppError::Internal(format!("item '{name}' not found")))?;
    items_mod::raw_xml_for(it)
}

#[tauri::command]
pub async fn items_serialize_preview(
    _id: String,
    items: Vec<ItemType>,
) -> AppResult<String> {
    crate::parsers::types_xml::serialize_items(&items)
}

fn derive_unique<F>(items: &[ItemType], mut f: F) -> Vec<String>
where
    F: FnMut(&ItemType) -> Vec<String>,
{
    let mut set = std::collections::BTreeSet::new();
    for it in items {
        for v in f(it) {
            set.insert(v);
        }
    }
    set.into_iter().collect()
}

fn auto_commit(ctx: &MissionContext, message: &str) -> AppResult<()> {
    // Best-effort: if the workspace isn't a git repo (shouldn't happen
    // post-pull, but be defensive) commit silently via ensure_repo.
    git_ops::commit_all(&ctx.workspace, message)?;
    Ok(())
}
