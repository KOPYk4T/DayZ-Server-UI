use tauri::State;

use crate::error::{AppError, AppResult};
use crate::git_ops;
use crate::mission::{events as events_mod, MissionContext};
use crate::profiles::{secrets, ConnectionMode};
use crate::state::AppState;
use crate::sync;
use crate::sync::diff::DiffSummary;
use crate::sync::reconcile::{ReviewPlan, SyncSide};

#[tauri::command]
pub async fn sync_status(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<sync::WorkspaceStatus> {
    let profile = {
        let store = state.profiles.lock().await;
        store.get(&id)?
    };
    let workspace = state.workspace_for(&id);
    sync::status_for(&profile, &workspace).await
}

#[tauri::command]
pub async fn sync_pull(
    id: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<sync::PullResult> {
    let profile = {
        let store = state.profiles.lock().await;
        store.get(&id)?
    };
    let workspace = state.workspace_for(&id);
    let (password, pass) = secrets_for(&app, &profile.mode, &profile.id);
    let mut result =
        sync::pull(&profile, &workspace, state.profiles.clone(), password, pass)
            .await?;

    // A successful pull overwrote the mission tree with whatever the
    // server shipped. Reapply any ledger-tracked edits to
    // cfgeventspawns.xml so operator customisations survive. Failure
    // here must not bubble up — the pull itself succeeded and the
    // user's data is safe; we just couldn't reapply their ledger.
    if let Ok(ctx) = MissionContext::resolve(&workspace, &profile) {
        let edits_dir = state.edits_dir();
        match events_mod::reconcile_eventspawns(&ctx, &edits_dir, &id) {
            Ok(report) => {
                if !report.is_noop() {
                    let _ = git_ops::commit_all(
                        &workspace,
                        &format!(
                            "reconcile(eventspawns): +{} / -{} from edits ledger",
                            report.added.len(),
                            report.removed.len(),
                        ),
                    );
                }
                result.reconciled = Some(report);
            }
            Err(e) => {
                log::warn!("post-pull reconcile failed: {e}");
            }
        }
    }

    Ok(result)
}

#[tauri::command]
pub async fn sync_push(
    id: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<sync::PushResult> {
    let profile = {
        let store = state.profiles.lock().await;
        store.get(&id)?
    };
    let workspace = state.workspace_for(&id);
    let backups_dir = state.backups_for(&id);
    let (password, pass) = secrets_for(&app, &profile.mode, &profile.id);
    sync::push(
        &profile,
        &workspace,
        &backups_dir,
        state.profiles.clone(),
        password,
        pass,
    )
    .await
}

#[tauri::command]
pub async fn sync_backups_list(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<sync::backup::BackupEntry>> {
    sync::backup::list(&state.backups_for(&id))
}

#[tauri::command]
pub async fn sync_backup_open(
    id: String,
    backup_id: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    use tauri_plugin_opener::OpenerExt;
    let dir = state.backups_for(&id).join(&backup_id);
    if !dir.exists() {
        return Err(crate::error::AppError::Internal(format!(
            "backup not found: {}",
            dir.display()
        )));
    }
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn sync_local_diff(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<DiffSummary> {
    let profile = {
        let store = state.profiles.lock().await;
        store.get(&id)?
    };
    let workspace = state.workspace_for(&id);
    sync::local_diff(&profile, &workspace)
}

#[tauri::command]
pub async fn sync_diff_against_remote(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<DiffSummary> {
    // For Phase 1, "against remote" == local-diff. A real remote-aware
    // diff (compare HEAD tree to remote-fetched snapshot) is Phase 2+.
    sync_local_diff(id, state).await
}

#[tauri::command]
pub async fn sync_probe(
    id: String,
    side: SyncSide,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<ReviewPlan> {
    let profile = {
        let store = state.profiles.lock().await;
        store.get(&id)?
    };
    let workspace = state.workspace_for(&id);
    match side {
        SyncSide::Local => sync::probe_local(&profile, &workspace),
        SyncSide::Remote => {
            let (password, pass) = secrets_for(&app, &profile.mode, &profile.id);
            sync::probe_remote(&profile, &workspace, password, pass).await
        }
    }
}

#[tauri::command]
pub async fn sync_write(
    id: String,
    side: SyncSide,
    paths: Vec<String>,
    adopt_paths: Vec<String>,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<sync::PushResult> {
    let profile = {
        let store = state.profiles.lock().await;
        store.get(&id)?
    };
    let workspace = state.workspace_for(&id);
    let backups_dir = state.backups_for(&id);
    if !adopt_paths.is_empty() {
        match side {
            SyncSide::Local => {
                sync::apply_adopt_from_local(&profile, &workspace, &adopt_paths)?;
            }
            SyncSide::Remote => {
                let (password, pass) = secrets_for(&app, &profile.mode, &profile.id);
                crate::sftp::download_rels(
                    &profile,
                    &workspace,
                    &adopt_paths,
                    password,
                    pass,
                )
                .await?;
            }
        }
    }
    match side {
        SyncSide::Local => {
            let (uploaded, deleted, backup) =
                sync::write_to_local(&profile, &workspace, &backups_dir, &paths)?;
            {
                let mut s = state.profiles.lock().await;
                s.mark_pushed(&id)?;
            }
            Ok(sync::PushResult {
                profile_id: id,
                uploaded_count: uploaded,
                deleted_count: deleted,
                total_bytes: 0,
                git_commit: String::new(),
                completed_at: chrono::Utc::now().to_rfc3339(),
                backup,
            })
        }
        SyncSide::Remote => {
            let (password, pass) = secrets_for(&app, &profile.mode, &profile.id);
            sync::write_to_remote(
                &profile,
                &workspace,
                state.profiles.clone(),
                password,
                pass,
                &paths,
            )
            .await
        }
    }
}

#[tauri::command]
pub async fn sync_fetch(
    id: String,
    side: SyncSide,
    adopt_paths: Vec<String>,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<u32> {
    let profile = {
        let store = state.profiles.lock().await;
        store.get(&id)?
    };
    let workspace = state.workspace_for(&id);
    let n = match side {
        SyncSide::Local => sync::apply_adopt_from_local(&profile, &workspace, &adopt_paths)?,
        SyncSide::Remote => {
            let (password, pass) = secrets_for(&app, &profile.mode, &profile.id);
            crate::sftp::download_rels(&profile, &workspace, &adopt_paths, password, pass)
                .await?
        }
    };
    let _ = git_ops::commit_all(
        &workspace,
        &format!("fetch from {side:?} @ {}", chrono::Utc::now().to_rfc3339()),
    );
    Ok(n)
}

#[tauri::command]
pub async fn sync_reset(
    id: String,
    side: SyncSide,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<sync::PullResult> {
    let profile = {
        let store = state.profiles.lock().await;
        store.get(&id)?
    };
    let workspace = state.workspace_for(&id);
    match side {
        SyncSide::Local => {
            sync::reset_from_local(&profile, &workspace, state.profiles.clone()).await
        }
        SyncSide::Remote => {
            let (password, pass) = secrets_for(&app, &profile.mode, &profile.id);
            let mut result = sync::pull(
                &profile,
                &workspace,
                state.profiles.clone(),
                password,
                pass,
            )
            .await?;
            if let Ok(ctx) = MissionContext::resolve(&workspace, &profile) {
                let edits_dir = state.edits_dir();
                if let Ok(report) =
                    events_mod::reconcile_eventspawns(&ctx, &edits_dir, &id)
                {
                    result.reconciled = Some(report);
                }
            }
            Ok(result)
        }
    }
}

#[tauri::command]
pub async fn sync_bootstrap(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<Option<sync::PullResult>> {
    let profile = {
        let store = state.profiles.lock().await;
        store.get(&id)?
    };
    let workspace = state.workspace_for(&id);
    let rels = sync::workspace_relative_paths(&profile);
    let has_mission = rels.iter().any(|r| workspace.join(r).exists());
    if has_mission {
        return Ok(None);
    }
    if sync::local_server_root(&profile).is_none() {
        return Ok(None);
    }
    let result =
        sync::reset_from_local(&profile, &workspace, state.profiles.clone()).await?;
    Ok(Some(result))
}

#[tauri::command]
pub async fn sync_file_preview(
    id: String,
    side: SyncSide,
    path: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<FilePreview> {
    let profile = {
        let store = state.profiles.lock().await;
        store.get(&id)?
    };
    let workspace = state.workspace_for(&id);
    let rel = std::path::PathBuf::from(&path);
    let work_path = workspace.join(&rel);
    let workspace_text = read_text_lossy(&work_path);
    let dest_text = match side {
        SyncSide::Local => {
            let root = sync::local_server_root(&profile).ok_or_else(|| {
                AppError::Sync("Local server is not set".into())
            })?;
            read_text_lossy(&root.join(sync::rel_on_local_server(&profile, &path)))
        }
        SyncSide::Remote => {
            let (password, pass) = secrets_for(&app, &profile.mode, &profile.id);
            let preview_root = workspace
                .join(sync::WORKSPACE_META_DIR)
                .join("preview");
            let _ = std::fs::remove_dir_all(&preview_root);
            let _ = std::fs::create_dir_all(&preview_root);
            crate::sftp::download_rels(
                &profile,
                &preview_root,
                std::slice::from_ref(&path),
                password,
                pass,
            )
            .await
            .ok();
            read_text_lossy(&preview_root.join(&rel))
        }
    };
    let binary = workspace_text.is_none() && dest_text.is_none();
    Ok(FilePreview {
        path,
        workspace_text,
        dest_text,
        binary,
    })
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePreview {
    pub path: String,
    pub workspace_text: Option<String>,
    pub dest_text: Option<String>,
    pub binary: bool,
}

fn read_text_lossy(path: &std::path::Path) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    if bytes.contains(&0) {
        return None;
    }
    Some(String::from_utf8_lossy(&bytes).into_owned())
}

fn secrets_for(
    app: &tauri::AppHandle,
    mode: &ConnectionMode,
    id: &str,
) -> (Option<String>, Option<String>) {
    if matches!(mode, ConnectionMode::Sftp) {
        let p = secrets::get_password(app, id).ok().flatten();
        let k = secrets::get_key_passphrase(app, id).ok().flatten();
        (p, k)
    } else {
        (None, None)
    }
}
