use tauri::State;

use crate::error::AppResult;
use crate::git_ops;
use crate::mission::{events as events_mod, MissionContext};
use crate::profiles::{secrets, ConnectionMode};
use crate::state::AppState;
use crate::sync;
use crate::sync::diff::DiffSummary;

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
