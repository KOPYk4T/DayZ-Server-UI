use tauri::State;
use tauri_plugin_opener::OpenerExt;

use crate::error::{AppError, AppResult};
use crate::profiles::secrets::ProfileSecrets;
use crate::profiles::{secrets, AuthType, ConnectionMode, ProfileDraft, ServerProfile};
use crate::state::AppState;

#[tauri::command]
pub async fn profiles_list(state: State<'_, AppState>) -> AppResult<Vec<ServerProfile>> {
    let store = state.profiles.lock().await;
    Ok(store.list())
}

/// Set the active profile id in shared backend state. The frontend
/// calls this immediately after every profile-store change so any
/// subsequent backend command (capability checks, future scheduled
/// tasks) resolves the same profile the user sees in the UI. Pass
/// `null` to clear (logout / no profile selected).
#[tauri::command]
pub async fn profiles_set_active(
    id: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    // Validate the id corresponds to a real profile so we don't
    // store dangling references that confuse later lookups.
    if let Some(id) = id.as_deref() {
        let store = state.profiles.lock().await;
        store.get(id)?;
    }
    let mut active = state.active_profile_id.write().await;
    *active = id;
    Ok(())
}

/// Read the current active profile id back. Useful for verifying
/// the sync is working from devtools; backend commands generally
/// read `state.active_profile_id` directly.
#[tauri::command]
pub async fn profiles_get_active(
    state: State<'_, AppState>,
) -> AppResult<Option<String>> {
    let active = state.active_profile_id.read().await;
    Ok(active.clone())
}

#[tauri::command]
pub async fn profiles_get(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<ServerProfile> {
    let store = state.profiles.lock().await;
    store.get(&id)
}

#[tauri::command]
pub async fn profiles_create(
    draft: ProfileDraft,
    secrets: ProfileSecrets,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<ServerProfile> {
    // Fail loudly rather than silently creating an unusable profile —
    // without a secret present, the vault store is a no-op and the
    // first Pull errors with a confusing "no password supplied".
    require_secret_for_new_sftp(&draft, &secrets)?;
    let profile = {
        let mut store = state.profiles.lock().await;
        store.create(draft)?
    };
    crate::profiles::secrets::store(&app, &profile.id, &secrets)?;
    Ok(profile)
}

fn require_secret_for_new_sftp(
    draft: &ProfileDraft,
    secrets: &ProfileSecrets,
) -> AppResult<()> {
    if !matches!(draft.mode, ConnectionMode::Sftp) {
        return Ok(());
    }
    let Some(sftp) = draft.sftp.as_ref() else {
        return Ok(());
    };
    match sftp.auth_type {
        AuthType::Password => {
            if secrets
                .password
                .as_deref()
                .map(str::is_empty)
                .unwrap_or(true)
            {
                return Err(AppError::InvalidProfile(
                    "password is required for SFTP + password auth — fill it in before saving".into(),
                ));
            }
        }
        AuthType::PrivateKey => {
            // Key passphrase is optional; nothing to check.
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn profiles_update(
    id: String,
    draft: ProfileDraft,
    secrets: Option<ProfileSecrets>,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<ServerProfile> {
    let profile = {
        let mut store = state.profiles.lock().await;
        store.update(&id, draft)?
    };
    if let Some(s) = secrets {
        crate::profiles::secrets::store(&app, &profile.id, &s)?;
    }
    Ok(profile)
}

#[tauri::command]
pub async fn profiles_duplicate(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<ServerProfile> {
    let mut store = state.profiles.lock().await;
    store.duplicate(&id)
}

#[tauri::command]
pub async fn profiles_delete(
    id: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    {
        let mut store = state.profiles.lock().await;
        store.delete(&id)?;
    }
    // best-effort secret cleanup
    let _ = secrets::clear_all(&app, &id);
    Ok(())
}

#[tauri::command]
pub async fn profiles_secrets_presence(
    id: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<secrets::SecretsPresence> {
    // Guard: only report presence for known profile ids.
    {
        let store = state.profiles.lock().await;
        store.get(&id)?;
    }
    Ok(secrets::presence(&app, &id))
}

#[tauri::command]
pub async fn profiles_open_workspace(
    id: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let workspace = state.workspace_for(&id);
    if !workspace.exists() {
        std::fs::create_dir_all(&workspace)?;
    }
    app.opener()
        .open_path(workspace.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| crate::error::AppError::Internal(e.to_string()))?;
    Ok(())
}
