//! Tauri commands for the `cfgignorelist.xml` editor.

use serde::Serialize;
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::git_ops;
use crate::mission::MissionContext;
use crate::parsers::cfg_ignorelist_xml::{self, IgnoreList};
use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IgnoreListSnapshot {
    pub classnames: Vec<String>,
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
pub async fn cfg_ignorelist_get(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<IgnoreListSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    let path = ctx.mission_root.join("cfgignorelist.xml");
    let file_display = path.to_string_lossy().into_owned();
    if !path.exists() {
        return Ok(IgnoreListSnapshot {
            classnames: Vec::new(),
            file_display,
            file_exists: false,
        });
    }
    let list = cfg_ignorelist_xml::parse_file(&path)?;
    Ok(IgnoreListSnapshot {
        classnames: list.classnames,
        file_display,
        file_exists: true,
    })
}

#[tauri::command]
pub async fn cfg_ignorelist_update(
    id: String,
    classnames: Vec<String>,
    state: State<'_, AppState>,
) -> AppResult<IgnoreListSnapshot> {
    let ctx = ctx_for(&id, &state).await?;
    let path = ctx.mission_root.join("cfgignorelist.xml");
    // De-dupe while preserving order — duplicates in the ignore list
    // are harmless but noisy in git diffs.
    let mut seen = std::collections::HashSet::new();
    let mut cleaned = Vec::with_capacity(classnames.len());
    for name in classnames {
        let trimmed = name.trim().to_string();
        if trimmed.is_empty() {
            continue;
        }
        if seen.insert(trimmed.clone()) {
            cleaned.push(trimmed);
        }
    }
    let list = IgnoreList {
        classnames: cleaned.clone(),
    };
    cfg_ignorelist_xml::write_file(&path, &list)?;
    git_ops::commit_all(&ctx.workspace, "edit(cfgignorelist): update")?;
    Ok(IgnoreListSnapshot {
        classnames: cleaned,
        file_display: path.to_string_lossy().into_owned(),
        file_exists: true,
    })
}
