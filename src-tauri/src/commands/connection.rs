use std::path::PathBuf;
use std::time::Instant;

use chrono::Utc;
use russh_sftp::protocol::FileType;
use serde::Serialize;
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::profiles::secrets::ProfileSecrets;
use crate::profiles::{secrets, ConnectionMode, ProfileDraft, ServerProfile};
use crate::sftp::{self, client};
use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestResult {
    pub ok: bool,
    pub message: String,
    pub fingerprint: Option<String>,
    pub fingerprint_changed: bool,
    pub latency_ms: Option<u64>,
}

#[tauri::command]
pub async fn connection_test(
    id: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<ConnectionTestResult> {
    let profile = {
        let store = state.profiles.lock().await;
        store.get(&id)?
    };

    match profile.mode {
        ConnectionMode::Local => {
            let root = profile
                .local
                .as_ref()
                .map(|l| PathBuf::from(&l.root_path))
                .ok_or_else(|| AppError::InvalidProfile("local mode requires root_path".into()))?;

            let start = Instant::now();
            if !root.exists() {
                return Ok(ConnectionTestResult {
                    ok: false,
                    message: format!("path does not exist: {}", root.display()),
                    fingerprint: None,
                    fingerprint_changed: false,
                    latency_ms: None,
                });
            }
            let mission = root.join(&profile.paths.mpmissions_relative);
            let profiles_dir = root.join(&profile.paths.profiles_relative);
            let mut problems = Vec::new();
            if !mission.exists() {
                problems.push(format!(
                    "mpmissions not found: {}",
                    mission.display()
                ));
            }
            if !profiles_dir.exists() {
                problems.push(format!(
                    "profiles not found: {}",
                    profiles_dir.display()
                ));
            }
            let latency = start.elapsed().as_millis() as u64;
            if problems.is_empty() {
                Ok(ConnectionTestResult {
                    ok: true,
                    message: "local folder ok".into(),
                    fingerprint: None,
                    fingerprint_changed: false,
                    latency_ms: Some(latency),
                })
            } else {
                Ok(ConnectionTestResult {
                    ok: false,
                    message: problems.join("; "),
                    fingerprint: None,
                    fingerprint_changed: false,
                    latency_ms: Some(latency),
                })
            }
        }

        ConnectionMode::Sftp => {
            let password = secrets::get_password(&app, &profile.id).ok().flatten();
            let key_passphrase = secrets::get_key_passphrase(&app, &profile.id).ok().flatten();
            let start = Instant::now();
            match sftp::probe(&profile, password, key_passphrase).await {
                Ok(probe) => {
                    let prior = profile
                        .sftp
                        .as_ref()
                        .and_then(|s| s.known_host_fingerprint.clone());
                    let changed = match prior.as_deref() {
                        Some(p) => p != probe.fingerprint,
                        None => false,
                    };
                    if prior.is_none() {
                        let mut store = state.profiles.lock().await;
                        let _ = store.set_fingerprint(&profile.id, probe.fingerprint.clone());
                    }
                    Ok(ConnectionTestResult {
                        ok: !changed,
                        message: if changed {
                            "host key changed — refusing. Edit profile to accept the new key.".into()
                        } else {
                            format!("connected in {}ms", probe.latency_ms)
                        },
                        fingerprint: Some(probe.fingerprint),
                        fingerprint_changed: changed,
                        latency_ms: Some(probe.latency_ms),
                    })
                }
                Err(err) => Ok(ConnectionTestResult {
                    ok: false,
                    message: err.to_string(),
                    fingerprint: None,
                    fingerprint_changed: false,
                    latency_ms: Some(start.elapsed().as_millis() as u64),
                }),
            }
        }
    }
}

/// Test a connection against an in-memory profile draft, without
/// requiring it to be saved first. Used by the profile form so users
/// can validate credentials and paths before creating / updating.
///
/// Secret precedence:
///   - Supplied `secrets` wins when its field is `Some` and non-empty.
///   - Otherwise, if `existing_id` is provided, falls back to the
///     keychain for that profile (edit flow: the user may be tweaking
///     paths without re-entering the password).
///   - Otherwise, no secret is passed — auth will fail with a clear
///     error if the draft needs one.
#[tauri::command]
pub async fn connection_test_draft(
    draft: ProfileDraft,
    secrets: Option<ProfileSecrets>,
    existing_id: Option<String>,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<ConnectionTestResult> {
    draft.validate()?;
    let synthetic = draft_to_profile(&draft, existing_id.as_deref(), &state).await;

    match synthetic.mode {
        ConnectionMode::Local => {
            let root = synthetic
                .local
                .as_ref()
                .map(|l| PathBuf::from(&l.root_path))
                .ok_or_else(|| AppError::InvalidProfile("local mode requires root_path".into()))?;

            let start = Instant::now();
            if !root.exists() {
                return Ok(ConnectionTestResult {
                    ok: false,
                    message: format!("path does not exist: {}", root.display()),
                    fingerprint: None,
                    fingerprint_changed: false,
                    latency_ms: None,
                });
            }
            let mission = root.join(&synthetic.paths.mpmissions_relative);
            let profiles_dir = root.join(&synthetic.paths.profiles_relative);
            let mut problems = Vec::new();
            if !mission.exists() {
                problems.push(format!("mpmissions not found: {}", mission.display()));
            }
            if !profiles_dir.exists() {
                problems.push(format!("profiles not found: {}", profiles_dir.display()));
            }
            let latency = start.elapsed().as_millis() as u64;
            if problems.is_empty() {
                Ok(ConnectionTestResult {
                    ok: true,
                    message: "local folder ok".into(),
                    fingerprint: None,
                    fingerprint_changed: false,
                    latency_ms: Some(latency),
                })
            } else {
                Ok(ConnectionTestResult {
                    ok: false,
                    message: problems.join("; "),
                    fingerprint: None,
                    fingerprint_changed: false,
                    latency_ms: Some(latency),
                })
            }
        }

        ConnectionMode::Sftp => {
            let (password, key_passphrase) =
                resolve_secrets(&app, secrets.as_ref(), existing_id.as_deref());
            let start = Instant::now();
            match sftp::probe(&synthetic, password, key_passphrase).await {
                Ok(probe) => {
                    // The draft's known fingerprint is whatever was set on
                    // the existing profile; the form doesn't edit it.
                    let prior = synthetic
                        .sftp
                        .as_ref()
                        .and_then(|s| s.known_host_fingerprint.clone());
                    let changed = match prior.as_deref() {
                        Some(p) => p != probe.fingerprint,
                        None => false,
                    };
                    Ok(ConnectionTestResult {
                        ok: !changed,
                        message: if changed {
                            "host key changed — save the profile to accept the new key, or investigate first.".into()
                        } else if prior.is_none() {
                            format!(
                                "connected in {}ms — fingerprint will be trusted on save",
                                probe.latency_ms
                            )
                        } else {
                            format!("connected in {}ms", probe.latency_ms)
                        },
                        fingerprint: Some(probe.fingerprint),
                        fingerprint_changed: changed,
                        latency_ms: Some(probe.latency_ms),
                    })
                }
                Err(err) => Ok(ConnectionTestResult {
                    ok: false,
                    message: err.to_string(),
                    fingerprint: None,
                    fingerprint_changed: false,
                    latency_ms: Some(start.elapsed().as_millis() as u64),
                }),
            }
        }
    }
}

// ---------- SFTP browse ----------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteEntry {
    pub name: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowseResult {
    /// The absolute (or home-relative) directory we ended up listing.
    /// Equal to the requested path when the server returns it; may
    /// differ if the server canonicalised it.
    pub path: String,
    pub entries: Vec<RemoteEntry>,
    /// True when the requested path was empty and we fell back to the
    /// server's default working directory. UI uses this to show "your
    /// login home" in place of a blank path.
    pub is_home_fallback: bool,
}

/// List the contents of a remote directory on the server described by
/// an in-memory profile draft. Used by the profile form's folder
/// browser so users can visually pick the server root / mission /
/// profiles paths.
///
/// `path` may be:
///   - Empty → start from the profile's `remote_root` if set, else
///     the session's default CWD (typically the SSH login home).
///   - Absolute → listed verbatim.
///   - Relative → resolved against `remote_root` if set, else the
///     SSH session CWD.
#[tauri::command]
pub async fn sftp_browse_draft(
    draft: ProfileDraft,
    secrets: Option<ProfileSecrets>,
    existing_id: Option<String>,
    path: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<BrowseResult> {
    draft.validate()?;
    if !matches!(draft.mode, ConnectionMode::Sftp) {
        return Err(AppError::InvalidProfile(
            "browse is SFTP-only — local mode uses the OS folder picker".into(),
        ));
    }
    let synthetic = draft_to_profile(&draft, existing_id.as_deref(), &state).await;
    let (password, key_passphrase) =
        resolve_secrets(&app, secrets.as_ref(), existing_id.as_deref());

    let (handle, _fingerprint) =
        client::connect(&synthetic, password, key_passphrase).await?;
    let sftp = client::open_sftp(&handle).await?;

    let (requested_path, is_home_fallback) = match path.trim() {
        "" => match synthetic
            .sftp
            .as_ref()
            .and_then(|s| s.remote_root.as_deref())
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            Some(root) => (root.to_string(), false),
            None => (".".to_string(), true),
        },
        p => (p.to_string(), false),
    };

    // Canonicalise so the returned path is always absolute. Matters
    // for the "." home fallback: the user needs a real path string
    // (e.g. `/home/admin`) to save as the server root, otherwise the
    // UI has nothing meaningful to bind to. If the server's SFTP
    // subsystem doesn't implement SSH_FXP_REALPATH we fall back to
    // the user-typed string.
    let list_path = sftp
        .canonicalize(&requested_path)
        .await
        .unwrap_or(requested_path);

    let entries_raw = sftp
        .read_dir(&list_path)
        .await
        .map_err(|e| AppError::Sftp(format!("read_dir {list_path}: {e}")))?;

    let mut entries: Vec<RemoteEntry> = Vec::new();
    for e in entries_raw {
        let name: String = e.file_name();
        if name == "." || name == ".." {
            continue;
        }
        let ft = e.file_type();
        let meta = e.metadata();
        entries.push(RemoteEntry {
            name,
            is_dir: matches!(ft, FileType::Dir),
            is_symlink: matches!(ft, FileType::Symlink),
            size: meta.size.unwrap_or(0),
        });
    }

    // Dirs first, then files — each block alphabetical.
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase()),
    });

    let _ = handle
        .disconnect(russh::Disconnect::ByApplication, "", "en")
        .await;

    Ok(BrowseResult {
        path: list_path,
        entries,
        is_home_fallback,
    })
}

// ---------- helpers ----------

async fn draft_to_profile(
    draft: &ProfileDraft,
    existing_id: Option<&str>,
    state: &State<'_, AppState>,
) -> ServerProfile {
    // Carry the known-host fingerprint from the saved profile so we can
    // flag fingerprint drift even during in-dialog tests.
    let known_host = if let Some(id) = existing_id {
        let store = state.profiles.lock().await;
        store
            .get(id)
            .ok()
            .and_then(|p| p.sftp.as_ref().and_then(|s| s.known_host_fingerprint.clone()))
    } else {
        None
    };

    let sftp = draft.sftp.clone().map(|mut s| {
        if s.known_host_fingerprint.is_none() {
            s.known_host_fingerprint = known_host.clone();
        }
        s
    });

    ServerProfile {
        id: existing_id
            .map(str::to_owned)
            .unwrap_or_else(|| "__draft__".into()),
        name: draft.name.clone(),
        mode: draft.mode,
        sftp,
        local: draft.local.clone(),
        paths: draft.paths.clone(),
        map: draft.map,
        custom_map_id: draft.custom_map_id.clone(),
        custom_map_size_m: draft.custom_map_size_m,
        work_dir: draft.work_dir.clone(),
        mods: Vec::new(),
        remote_commands: draft.remote_commands.clone(),
        created_at: Utc::now(),
        last_pull_at: None,
        last_push_at: None,
    }
}

fn resolve_secrets(
    app: &tauri::AppHandle,
    supplied: Option<&ProfileSecrets>,
    existing_id: Option<&str>,
) -> (Option<String>, Option<String>) {
    let from_supplied = |f: &dyn Fn(&ProfileSecrets) -> Option<String>| -> Option<String> {
        supplied.and_then(f).filter(|s| !s.is_empty())
    };
    let password = from_supplied(&|s| s.password.clone()).or_else(|| {
        existing_id.and_then(|id| secrets::get_password(app, id).ok().flatten())
    });
    let key_passphrase = from_supplied(&|s| s.key_passphrase.clone()).or_else(|| {
        existing_id.and_then(|id| secrets::get_key_passphrase(app, id).ok().flatten())
    });
    (password, key_passphrase)
}
