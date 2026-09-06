//! Limits definition Tauri commands (PDR §9.4).

use std::collections::HashMap;

use serde::Serialize;
use tauri::State;

use crate::domain::LimitsDefinition;
use crate::error::{AppError, AppResult};
use crate::git_ops;
use crate::mission::{items as items_mod, limits as limits_mod, MissionContext};
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
pub struct LimitsSnapshot {
    pub definition: LimitsDefinition,
    /// How many items in the registry reference each tag name. Keyed
    /// by name across categories / usages / values / tags; separate
    /// entries per dimension would be nicer but tag namespaces don't
    /// collide in practice.
    pub impact: LimitsImpact,
    pub missing_file: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LimitsImpact {
    pub categories: HashMap<String, u32>,
    pub tags: HashMap<String, u32>,
    pub usageflags: HashMap<String, u32>,
    pub valueflags: HashMap<String, u32>,
    /// Names appearing on items but NOT in the definition — these are
    /// the cross-ref gaps the UI flags red.
    pub orphan_categories: Vec<String>,
    pub orphan_tags: Vec<String>,
    pub orphan_usageflags: Vec<String>,
    pub orphan_valueflags: Vec<String>,
}

#[tauri::command]
pub async fn limits_get(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<LimitsSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    let missing_file = !limits_mod::path(&ctx).exists();
    let definition = limits_mod::load(&ctx)?;
    let impact = compute_impact(&ctx, &definition);
    Ok(LimitsSnapshot {
        definition,
        impact,
        missing_file,
    })
}

#[tauri::command]
pub async fn limits_update(
    id: String,
    definition: LimitsDefinition,
    state: State<'_, AppState>,
) -> AppResult<LimitsSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    limits_mod::save(&ctx, &definition)?;
    git_ops::commit_all(&ctx.workspace, "edit(limits): cfglimitsdefinition.xml")?;
    let impact = compute_impact(&ctx, &definition);
    Ok(LimitsSnapshot {
        definition,
        impact,
        missing_file: false,
    })
}

fn compute_impact(ctx: &MissionContext, def: &LimitsDefinition) -> LimitsImpact {
    let items = items_mod::load(ctx)
        .map(|r| r.items.into_values().collect::<Vec<_>>())
        .unwrap_or_default();

    let defined_categories: std::collections::HashSet<&str> =
        def.category_names().collect();
    let defined_tags: std::collections::HashSet<&str> = def.tag_names().collect();
    let defined_usages: std::collections::HashSet<&str> = def.usage_names().collect();
    let defined_values: std::collections::HashSet<&str> = def.value_names().collect();

    let mut categories: HashMap<String, u32> = def
        .categories
        .iter()
        .map(|c| (c.name.clone(), 0))
        .collect();
    let mut tags: HashMap<String, u32> =
        def.tags.iter().map(|t| (t.name.clone(), 0)).collect();
    let mut usageflags: HashMap<String, u32> = def
        .usageflags
        .iter()
        .map(|u| (u.name.clone(), 0))
        .collect();
    let mut valueflags: HashMap<String, u32> = def
        .valueflags
        .iter()
        .map(|v| (v.name.clone(), 0))
        .collect();

    let mut orphan_categories = std::collections::BTreeSet::new();
    let mut orphan_tags = std::collections::BTreeSet::new();
    let mut orphan_usages = std::collections::BTreeSet::new();
    let mut orphan_values = std::collections::BTreeSet::new();

    for it in &items {
        if let Some(c) = &it.category {
            if defined_categories.contains(c.as_str()) {
                *categories.entry(c.clone()).or_insert(0) += 1;
            } else {
                orphan_categories.insert(c.clone());
            }
        }
        for t in &it.tags {
            if defined_tags.contains(t.as_str()) {
                *tags.entry(t.clone()).or_insert(0) += 1;
            } else {
                orphan_tags.insert(t.clone());
            }
        }
        for u in &it.usage {
            if defined_usages.contains(u.as_str()) {
                *usageflags.entry(u.clone()).or_insert(0) += 1;
            } else {
                orphan_usages.insert(u.clone());
            }
        }
        for v in &it.value {
            if defined_values.contains(v.as_str()) {
                *valueflags.entry(v.clone()).or_insert(0) += 1;
            } else {
                orphan_values.insert(v.clone());
            }
        }
    }

    LimitsImpact {
        categories,
        tags,
        usageflags,
        valueflags,
        orphan_categories: orphan_categories.into_iter().collect(),
        orphan_tags: orphan_tags.into_iter().collect(),
        orphan_usageflags: orphan_usages.into_iter().collect(),
        orphan_valueflags: orphan_values.into_iter().collect(),
    }
}
