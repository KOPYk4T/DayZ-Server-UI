//! Pull/push orchestration.
//!
//! - A "pull" mirrors the server's mpmissions + profiles folders into the
//!   user's local workspace, stamps a git commit "pull @ <ts>", and writes
//!   a `last-pull.json` with per-file hashes.
//! - A "push" diffs HEAD against `last-pull.json`, uploads added/modified,
//!   removes deleted, then writes `last-push.json` and tags the commit.
//! - For local-folder mode, "remote" is a path on disk. For SFTP mode,
//!   it is the SSH server.

pub mod backup;
pub mod diff;
pub mod reconcile;
pub mod snapshot;

use std::path::{Path, PathBuf};
use std::sync::Arc;

use chrono::Utc;
use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};
use crate::git_ops;
use crate::profiles::{ConnectionMode, ProfileStore, ServerProfile};
use crate::sftp;

use self::diff::DiffSummary;
use self::snapshot::{FileSnapshot, Snapshot};

pub const WORKSPACE_META_DIR: &str = ".dzmgr";
pub const LAST_PULL_FILE: &str = "last-pull.json";
pub const LAST_PUSH_FILE: &str = "last-push.json";

/// Root-level single-file rels that sync alongside the mpmissions /
/// profiles trees. These are treated as individual files (not
/// directories) by the pull/push code paths.
pub const ROOT_FILE_RELS: &[&str] = &["serverDZ.cfg", "server.cfg"];

/// Relative paths inside the workspace that sync with the remote. The
/// actual mpmissions/profiles folder names depend on the profile's
/// `paths` configuration. Root-level files (`serverDZ.cfg` etc.) are
/// included so they round-trip through pull, diff, and push.
pub fn workspace_relative_paths(profile: &ServerProfile) -> Vec<PathBuf> {
    let mut rels = vec![
        PathBuf::from(&profile.paths.mpmissions_relative),
        PathBuf::from(&profile.paths.profiles_relative),
    ];
    for f in ROOT_FILE_RELS {
        rels.push(PathBuf::from(f));
    }
    rels
}

fn fwd_slash(s: &str) -> String {
    s.replace('\\', "/").trim_matches('/').to_string()
}

fn profiles_canon(profile: &ServerProfile) -> String {
    fwd_slash(&profile.paths.profiles_relative)
}

/// Profiles folder name on the local dedicated server.
pub fn profiles_on_local(profile: &ServerProfile) -> String {
    profile
        .paths
        .local_profiles_relative
        .as_deref()
        .map(fwd_slash)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| profiles_canon(profile))
}

fn rewrite_prefix(path: &str, from: &str, to: &str) -> String {
    let p = fwd_slash(path);
    if from.is_empty() || from == to {
        return p;
    }
    if p == from {
        return to.to_string();
    }
    let prefix = format!("{from}/");
    if let Some(rest) = p.strip_prefix(&prefix) {
        if to.is_empty() {
            return rest.to_string();
        }
        return format!("{to}/{rest}");
    }
    p
}

/// Workspace-relative path as it appears under the local server root.
pub fn rel_on_local_server(profile: &ServerProfile, work_rel: &str) -> String {
    rewrite_prefix(work_rel, &profiles_canon(profile), &profiles_on_local(profile))
}

/// Local-server-relative path as it appears in the workspace.
pub fn rel_from_local_server(profile: &ServerProfile, local_rel: &str) -> String {
    rewrite_prefix(local_rel, &profiles_on_local(profile), &profiles_canon(profile))
}

fn local_server_rels(profile: &ServerProfile) -> Vec<PathBuf> {
    workspace_relative_paths(profile)
        .into_iter()
        .map(|r| {
            PathBuf::from(rel_on_local_server(
                profile,
                &r.to_string_lossy().replace('\\', "/"),
            ))
        })
        .collect()
}

fn snapshot_keys_to_workspace(profile: &ServerProfile, mut snap: Snapshot) -> Snapshot {
    let mut files = std::collections::BTreeMap::new();
    for (k, v) in snap.files {
        files.insert(rel_from_local_server(profile, &k), v);
    }
    snap.files = files;
    snap
}

pub async fn status_for(
    profile: &ServerProfile,
    workspace: &Path,
) -> AppResult<WorkspaceStatus> {
    let exists = workspace.exists();
    let last_pull = load_snapshot(workspace, LAST_PULL_FILE).ok().flatten();
    let last_push = load_snapshot(workspace, LAST_PUSH_FILE).ok().flatten();

    let (head_commit, last_pushed_commit, unpushed_count, dirty) = if exists
        && workspace.join(".git").exists()
    {
        let head = git_ops::head_commit(workspace).ok();
        let pushed = last_push.as_ref().map(|s| s.git_commit.clone());
        let unpushed = match pushed.as_deref() {
            Some(p) => git_ops::commits_between(workspace, p).unwrap_or(0),
            None => head.as_ref().map(|_| 1).unwrap_or(0),
        };
        let dirty = git_ops::is_dirty(workspace).unwrap_or(false);
        (head, pushed, unpushed, dirty)
    } else {
        (None, None, 0, false)
    };

    Ok(WorkspaceStatus {
        profile_id: profile.id.clone(),
        workspace_path: workspace.to_string_lossy().into_owned(),
        exists,
        last_pull_at: last_pull.as_ref().map(|s| s.captured_at.to_rfc3339()),
        last_push_at: last_push.as_ref().map(|s| s.captured_at.to_rfc3339()),
        dirty,
        unpushed_count: unpushed_count as u32,
        head_commit,
        last_pushed_commit,
        local_server_path: local_server_root(profile)
            .map(|p| p.to_string_lossy().into_owned()),
        local_server_exists: local_server_root(profile)
            .map(|p| p.exists())
            .unwrap_or(false),
        has_sftp: matches!(profile.mode, ConnectionMode::Sftp) && profile.sftp.is_some(),
        remote_label: match profile.mode {
            ConnectionMode::Sftp => profile
                .sftp
                .as_ref()
                .map(|s| format!("{}@{}:{}", s.username, s.host, s.port))
                .unwrap_or_else(|| "SFTP".into()),
            ConnectionMode::Local => profile
                .local
                .as_ref()
                .map(|l| l.root_path.clone())
                .unwrap_or_default(),
        },
    })
}

pub async fn pull(
    profile: &ServerProfile,
    workspace: &Path,
    store: Arc<Mutex<ProfileStore>>,
    password: Option<String>,
    key_passphrase: Option<String>,
) -> AppResult<PullResult> {
    std::fs::create_dir_all(workspace)?;
    let rels = workspace_relative_paths(profile);

    let (files_count, total_bytes, skipped, sftp_layout) = match profile.mode {
        ConnectionMode::Local => {
            let (f, b) = pull_local(profile, workspace, &rels).await?;
            (f, b, Vec::new(), None)
        }
        ConnectionMode::Sftp => {
            let (f, b, s, report) =
                sftp::pull_paths(profile, workspace, &rels, password, key_passphrase)
                    .await?;
            (f, b, s, Some(report))
        }
    };

    git_ops::ensure_repo(workspace)?;
    let commit =
        git_ops::commit_all(workspace, &format!("pull @ {}", Utc::now().to_rfc3339()))?;

    let snapshot = snapshot::capture(workspace, &rels, commit.clone())?;
    save_snapshot(workspace, LAST_PULL_FILE, &snapshot)?;

    {
        let mut s = store.lock().await;
        s.mark_pulled(&profile.id)?;
    }

    Ok(PullResult {
        profile_id: profile.id.clone(),
        workspace_path: workspace.to_string_lossy().into_owned(),
        files_count: files_count as u32,
        total_bytes,
        git_commit: commit,
        completed_at: Utc::now().to_rfc3339(),
        skipped,
        sftp_layout,
        reconciled: None,
    })
}

pub async fn push(
    profile: &ServerProfile,
    workspace: &Path,
    backups_dir: &Path,
    store: Arc<Mutex<ProfileStore>>,
    password: Option<String>,
    key_passphrase: Option<String>,
) -> AppResult<PushResult> {
    let rels = workspace_relative_paths(profile);
    let last_pull = load_snapshot(workspace, LAST_PULL_FILE)?
        .ok_or_else(|| AppError::Sync("pull before pushing".into()))?;
    let current = snapshot::capture(workspace, &rels, String::new())?;
    let diff = diff::compute_against(&last_pull, &current);

    // Capture the destination-side state of files that are about to
    // change. Local mode only — SFTP would have to download each file
    // first, which is too slow for an interactive push flow.
    let backup_entry = if matches!(profile.mode, ConnectionMode::Local) {
        if let Some(local) = profile.local.as_ref() {
            let server_root = PathBuf::from(&local.root_path);
            if server_root.exists() {
                let entry = backup::capture_before_push(
                    backups_dir,
                    &server_root,
                    &diff,
                    Utc::now(),
                )?;
                let _ = backup::prune(backups_dir, backup::DEFAULT_KEEP);
                entry
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    };

    let (uploaded, deleted, total_bytes) = match profile.mode {
        ConnectionMode::Local => push_local(profile, workspace, &diff).await?,
        ConnectionMode::Sftp => {
            sftp::push_diff(profile, workspace, &diff, password, key_passphrase).await?
        }
    };

    let commit =
        git_ops::commit_all(workspace, &format!("push @ {}", Utc::now().to_rfc3339()))?;

    let mut snap = snapshot::capture(workspace, &rels, commit.clone())?;
    snap.git_commit = commit.clone();
    save_snapshot(workspace, LAST_PUSH_FILE, &snap)?;
    save_snapshot(workspace, LAST_PULL_FILE, &snap)?; // push also re-bases pull snapshot

    {
        let mut s = store.lock().await;
        s.mark_pushed(&profile.id)?;
    }

    Ok(PushResult {
        profile_id: profile.id.clone(),
        uploaded_count: uploaded as u32,
        deleted_count: deleted as u32,
        total_bytes,
        git_commit: commit,
        completed_at: Utc::now().to_rfc3339(),
        backup: backup_entry,
    })
}

pub fn local_diff(profile: &ServerProfile, workspace: &Path) -> AppResult<DiffSummary> {
    let rels = workspace_relative_paths(profile);
    let last_pull = load_snapshot(workspace, LAST_PULL_FILE)?
        .ok_or_else(|| AppError::Sync("no pull snapshot yet — pull first".into()))?;
    let current = snapshot::capture(workspace, &rels, String::new())?;
    Ok(diff::compute_against(&last_pull, &current))
}

// ---------- Local-mode transport ----------

async fn pull_local(
    profile: &ServerProfile,
    workspace: &Path,
    rels: &[PathBuf],
) -> AppResult<(usize, u64)> {
    let root = profile
        .local
        .as_ref()
        .map(|l| PathBuf::from(&l.root_path))
        .ok_or_else(|| AppError::InvalidProfile("local mode requires root_path".into()))?;

    if !root.exists() {
        return Err(AppError::Sync(format!(
            "local root does not exist: {}",
            root.display()
        )));
    }

    let mut files = 0usize;
    let mut bytes = 0u64;

    for rel in rels {
        let src_rel = rel_on_local_server(profile, &rel.to_string_lossy().replace('\\', "/"));
        let src = root.join(src_rel);
        let dst = workspace.join(rel);
        if !src.exists() {
            // Missing root-level optional files (e.g. `server.cfg`
            // when the server uses `serverDZ.cfg`) aren't a problem
            // — just skip. We only log at warn for non-trivial
            // top-level rels so the log isn't noisy.
            if !is_optional_missing(rel) {
                log::warn!("pull: source path missing: {}", src.display());
            }
            continue;
        }
        if src.is_file() {
            if let Some(parent) = dst.parent() {
                std::fs::create_dir_all(parent)?;
            }
            if dst.exists() {
                std::fs::remove_file(&dst)?;
            }
            std::fs::copy(&src, &dst)?;
            files += 1;
            bytes += std::fs::metadata(&src).map(|m| m.len()).unwrap_or(0);
            continue;
        }
        if dst.exists() {
            remove_dir_contents(&dst)?;
        } else {
            std::fs::create_dir_all(&dst)?;
        }
        let (f, b) = copy_tree(&src, &dst)?;
        files += f;
        bytes += b;
    }
    Ok((files, bytes))
}

/// True when a missing rel is known to be optional — silences the
/// warn-log for e.g. `server.cfg` when the server uses the modern
/// `serverDZ.cfg` variant.
fn is_optional_missing(rel: &Path) -> bool {
    let name = rel
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    ROOT_FILE_RELS.contains(&name)
}

async fn push_local(
    profile: &ServerProfile,
    workspace: &Path,
    diff: &DiffSummary,
) -> AppResult<(usize, usize, u64)> {
    let root = profile
        .local
        .as_ref()
        .map(|l| PathBuf::from(&l.root_path))
        .ok_or_else(|| AppError::InvalidProfile("local mode requires root_path".into()))?;

    if !root.exists() {
        return Err(AppError::Sync(format!(
            "local root does not exist: {}",
            root.display()
        )));
    }

    let mut uploaded = 0usize;
    let mut deleted = 0usize;
    let mut bytes = 0u64;

    for change in &diff.changes {
        let rel = PathBuf::from(&change.path);
        let src = workspace.join(&rel);
        let dst = root.join(rel_on_local_server(profile, &change.path));
        match change.kind {
            diff::ChangeKind::Deleted => {
                if dst.exists() {
                    std::fs::remove_file(&dst)?;
                    deleted += 1;
                }
            }
            diff::ChangeKind::Added | diff::ChangeKind::Modified => {
                if let Some(parent) = dst.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                std::fs::copy(&src, &dst)?;
                uploaded += 1;
                bytes += std::fs::metadata(&src).map(|m| m.len()).unwrap_or(0);
            }
        }
    }

    Ok((uploaded, deleted, bytes))
}

// ---------- Generic helpers ----------

fn copy_tree(src: &Path, dst: &Path) -> AppResult<(usize, u64)> {
    std::fs::create_dir_all(dst)?;
    let mut files = 0usize;
    let mut bytes = 0u64;
    for entry in walkdir::WalkDir::new(src).into_iter().filter_map(|e| e.ok()) {
        let rel = entry.path().strip_prefix(src).unwrap_or(entry.path());
        let target = dst.join(rel);
        if entry.file_type().is_dir() {
            std::fs::create_dir_all(&target)?;
        } else if entry.file_type().is_file() {
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(entry.path(), &target)?;
            files += 1;
            bytes += entry.metadata().map(|m| m.len()).unwrap_or(0);
        }
    }
    Ok((files, bytes))
}

fn remove_dir_contents(path: &Path) -> AppResult<()> {
    if !path.exists() {
        return Ok(());
    }
    for entry in std::fs::read_dir(path)? {
        let entry = entry?;
        let p = entry.path();
        if p.is_dir() {
            std::fs::remove_dir_all(&p)?;
        } else {
            std::fs::remove_file(&p)?;
        }
    }
    Ok(())
}

/// DayZ dedicated folder used to test. `work_dir` on the profile.
/// Local-mode profiles fall back to the profile folder so Sync to local
/// still works when Local server was never set separately.
pub fn local_server_root(profile: &ServerProfile) -> Option<PathBuf> {
    let from_work = profile
        .work_dir
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(PathBuf::from);
    if from_work.is_some() {
        return from_work;
    }
    if matches!(profile.mode, ConnectionMode::Local) {
        return profile.local.as_ref().and_then(|l| {
            let t = l.root_path.trim();
            if t.is_empty() {
                None
            } else {
                Some(PathBuf::from(t))
            }
        });
    }
    None
}

pub fn map_locked_io(err: std::io::Error, dest: &Path) -> AppError {
    let locked = matches!(err.raw_os_error(), Some(32) | Some(33) | Some(5))
        || err.kind() == std::io::ErrorKind::PermissionDenied;
    if locked {
        AppError::Sync(format!(
            "file locked — stop the dedicated server and retry: {}",
            dest.display()
        ))
    } else {
        err.into()
    }
}

pub fn copy_file_locked(src: &Path, dst: &Path) -> AppResult<()> {
    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if dst.exists() {
        std::fs::remove_file(dst).map_err(|e| map_locked_io(e, dst))?;
    }
    std::fs::copy(src, dst).map_err(|e| map_locked_io(e, dst))?;
    Ok(())
}

pub fn empty_snapshot() -> Snapshot {
    Snapshot {
        captured_at: Utc::now(),
        git_commit: String::new(),
        files: Default::default(),
    }
}

/// Three-way against the local dedicated server (disk).
pub fn probe_local(profile: &ServerProfile, workspace: &Path) -> AppResult<reconcile::ReviewPlan> {
    let root = local_server_root(profile).ok_or_else(|| {
        AppError::Sync("set Local server on the profile first".into())
    })?;
    if !root.exists() {
        return Err(AppError::Sync(format!(
            "Local server path does not exist: {}",
            root.display()
        )));
    }
    let rels = workspace_relative_paths(profile);
    let base = load_snapshot(workspace, LAST_PULL_FILE)?.unwrap_or_else(empty_snapshot);
    let dest_raw = snapshot::capture_under(&root, &local_server_rels(profile), String::new())?;
    let dest = snapshot_keys_to_workspace(profile, dest_raw);
    let work = snapshot::capture(workspace, &rels, String::new())?;
    Ok(reconcile::classify(&base, &dest, &work))
}

pub fn apply_adopt_from_local(
    profile: &ServerProfile,
    workspace: &Path,
    paths: &[String],
) -> AppResult<u32> {
    let root = local_server_root(profile).ok_or_else(|| {
        AppError::Sync("set Local server on the profile first".into())
    })?;
    let mut n = 0u32;
    for p in paths {
        let src = root.join(rel_on_local_server(profile, p));
        let dst = workspace.join(p);
        if !src.exists() {
            if dst.exists() {
                if dst.is_dir() {
                    std::fs::remove_dir_all(&dst).map_err(|e| map_locked_io(e, &dst))?;
                } else {
                    std::fs::remove_file(&dst).map_err(|e| map_locked_io(e, &dst))?;
                }
                n += 1;
            }
            continue;
        }
        copy_file_locked(&src, &dst)?;
        n += 1;
    }
    Ok(n)
}

pub fn write_to_local(
    profile: &ServerProfile,
    workspace: &Path,
    backups_dir: &Path,
    paths: &[String],
) -> AppResult<(u32, u32, Option<backup::BackupEntry>)> {
    let root = local_server_root(profile).ok_or_else(|| {
        AppError::Sync("set Local server on the profile first".into())
    })?;
    let rels = workspace_relative_paths(profile);
    let last_pull = load_snapshot(workspace, LAST_PULL_FILE)?.unwrap_or_else(empty_snapshot);
    let current = snapshot::capture(workspace, &rels, String::new())?;
    let full = diff::compute_against(&last_pull, &current);
    let allow: std::collections::HashSet<&str> = paths.iter().map(String::as_str).collect();
    let mut filtered = full.clone();
    filtered.changes.retain(|c| allow.contains(c.path.as_str()));
    filtered.added_count = filtered
        .changes
        .iter()
        .filter(|c| matches!(c.kind, diff::ChangeKind::Added))
        .count() as u32;
    filtered.modified_count = filtered
        .changes
        .iter()
        .filter(|c| matches!(c.kind, diff::ChangeKind::Modified))
        .count() as u32;
    filtered.deleted_count = filtered
        .changes
        .iter()
        .filter(|c| matches!(c.kind, diff::ChangeKind::Deleted))
        .count() as u32;

    let backup_entry = if root.exists() {
        let mut backup_diff = filtered.clone();
        for c in &mut backup_diff.changes {
            c.path = rel_on_local_server(profile, &c.path);
        }
        backup::capture_before_push(backups_dir, &root, &backup_diff, Utc::now())?
    } else {
        None
    };
    let _ = backup::prune(backups_dir, backup::DEFAULT_KEEP);

    let mut uploaded = 0u32;
    let mut deleted = 0u32;
    for change in &filtered.changes {
        let rel = PathBuf::from(&change.path);
        let src = workspace.join(&rel);
        let dst = root.join(rel_on_local_server(profile, &change.path));
        match change.kind {
            diff::ChangeKind::Deleted => {
                if dst.exists() {
                    std::fs::remove_file(&dst).map_err(|e| map_locked_io(e, &dst))?;
                    deleted += 1;
                }
            }
            diff::ChangeKind::Added | diff::ChangeKind::Modified => {
                copy_file_locked(&src, &dst)?;
                uploaded += 1;
            }
        }
    }

    let commit = git_ops::commit_all(
        workspace,
        &format!("sync to local @ {}", Utc::now().to_rfc3339()),
    )?;
    let mut snap = snapshot::capture(workspace, &rels, commit)?;
    snap.git_commit = snap.git_commit.clone();
    save_snapshot(workspace, LAST_PULL_FILE, &snap)?;
    save_snapshot(workspace, LAST_PUSH_FILE, &snap)?;
    Ok((uploaded, deleted, backup_entry))
}

/// Mirror Local server → workspace (Reset from local).
pub async fn reset_from_local(
    profile: &ServerProfile,
    workspace: &Path,
    store: Arc<Mutex<ProfileStore>>,
) -> AppResult<PullResult> {
    let root = local_server_root(profile).ok_or_else(|| {
        AppError::Sync("set Local server on the profile first".into())
    })?;
    let mut synthetic = profile.clone();
    synthetic.mode = ConnectionMode::Local;
    synthetic.local = Some(crate::profiles::LocalConnection {
        root_path: root.to_string_lossy().into_owned(),
    });
    pull(&synthetic, workspace, store, None, None).await
}

pub async fn probe_remote(
    profile: &ServerProfile,
    workspace: &Path,
    password: Option<String>,
    key_passphrase: Option<String>,
) -> AppResult<reconcile::ReviewPlan> {
    if !matches!(profile.mode, ConnectionMode::Sftp) {
        return Err(AppError::Sync("Remote is not SFTP on this profile".into()));
    }
    let rels = workspace_relative_paths(profile);
    let base = load_snapshot(workspace, LAST_PULL_FILE)?.unwrap_or_else(empty_snapshot);
    let work = snapshot::capture(workspace, &rels, String::new())?;
    let listed = sftp::list_remote_rel_paths(
        profile,
        &rels,
        password.clone(),
        key_passphrase.clone(),
    )
    .await?;
    let mut keys: Vec<String> = base.files.keys().cloned().collect();
    for k in work.files.keys() {
        if !keys.contains(k) {
            keys.push(k.clone());
        }
    }
    let dest_only: Vec<String> = listed
        .into_iter()
        .filter(|p| !keys.iter().any(|k| k == p))
        .collect();
    let mut remote_files =
        sftp::hash_remote_files(profile, &keys, password, key_passphrase).await?;
    for p in dest_only {
        remote_files.entry(p).or_insert(FileSnapshot {
            size: 0,
            sha256: "remote-only".into(),
        });
    }
    let dest = Snapshot {
        captured_at: Utc::now(),
        git_commit: String::new(),
        files: remote_files,
    };
    Ok(reconcile::classify(&base, &dest, &work))
}

pub async fn write_to_remote(
    profile: &ServerProfile,
    workspace: &Path,
    store: Arc<Mutex<ProfileStore>>,
    password: Option<String>,
    key_passphrase: Option<String>,
    paths: &[String],
) -> AppResult<PushResult> {
    let rels = workspace_relative_paths(profile);
    let last_pull = load_snapshot(workspace, LAST_PULL_FILE)?
        .ok_or_else(|| AppError::Sync("import or Reset from Local first".into()))?;
    let current = snapshot::capture(workspace, &rels, String::new())?;
    let mut diff = diff::compute_against(&last_pull, &current);
    let allow: std::collections::HashSet<&str> = paths.iter().map(String::as_str).collect();
    if !allow.is_empty() {
        diff.changes.retain(|c| allow.contains(c.path.as_str()));
    }
    let (uploaded, deleted, total_bytes) =
        sftp::push_diff(profile, workspace, &diff, password, key_passphrase).await?;
    let commit =
        git_ops::commit_all(workspace, &format!("push @ {}", Utc::now().to_rfc3339()))?;
    let mut snap = snapshot::capture(workspace, &rels, commit.clone())?;
    snap.git_commit = commit.clone();
    save_snapshot(workspace, LAST_PUSH_FILE, &snap)?;
    save_snapshot(workspace, LAST_PULL_FILE, &snap)?;
    {
        let mut s = store.lock().await;
        s.mark_pushed(&profile.id)?;
    }
    Ok(PushResult {
        profile_id: profile.id.clone(),
        uploaded_count: uploaded as u32,
        deleted_count: deleted as u32,
        total_bytes,
        git_commit: commit,
        completed_at: Utc::now().to_rfc3339(),
        backup: None,
    })
}

fn save_snapshot(workspace: &Path, filename: &str, snap: &Snapshot) -> AppResult<()> {
    let meta = workspace.join(WORKSPACE_META_DIR);
    std::fs::create_dir_all(&meta)?;
    let path = meta.join(filename);
    let bytes = serde_json::to_vec_pretty(snap)?;
    std::fs::write(path, bytes)?;
    Ok(())
}

fn load_snapshot(workspace: &Path, filename: &str) -> AppResult<Option<Snapshot>> {
    let path = workspace.join(WORKSPACE_META_DIR).join(filename);
    if !path.exists() {
        return Ok(None);
    }
    let bytes = std::fs::read(path)?;
    if bytes.is_empty() {
        return Ok(None);
    }
    let snap: Snapshot = serde_json::from_slice(&bytes)?;
    Ok(Some(snap))
}

// ---------- Wire types ----------

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceStatus {
    pub profile_id: String,
    pub workspace_path: String,
    pub exists: bool,
    pub last_pull_at: Option<String>,
    pub last_push_at: Option<String>,
    pub dirty: bool,
    pub unpushed_count: u32,
    pub head_commit: Option<String>,
    pub last_pushed_commit: Option<String>,
    pub local_server_path: Option<String>,
    pub local_server_exists: bool,
    pub has_sftp: bool,
    pub remote_label: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullResult {
    pub profile_id: String,
    pub workspace_path: String,
    pub files_count: u32,
    pub total_bytes: u64,
    pub git_commit: String,
    pub completed_at: String,
    /// Files the remote refused during pull (typically binaries the
    /// game server is holding open — AMP / Pterodactyl panels return
    /// `Failure: I/O error` on those). Empty on a clean pull.
    #[serde(default)]
    pub skipped: Vec<sftp::SkippedItem>,
    /// SFTP-only: diagnostic report of which server-root directories
    /// were scanned, what was found, and which root-level files were
    /// pulled vs skipped. Lets the UI explain "where did it look?"
    /// with a concrete answer. `None` for local-mode pulls.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sftp_layout: Option<sftp::SftpLayoutReport>,
    /// Summary of what the edits-ledger reconciler reapplied to
    /// the mission's cfgeventspawns.xml after the pull. `None`
    /// when there's no mission context yet (partial pulls) or
    /// nothing to reconcile.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reconciled: Option<crate::mission::events::ReconcileReport>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushResult {
    pub profile_id: String,
    pub uploaded_count: u32,
    pub deleted_count: u32,
    pub total_bytes: u64,
    pub git_commit: String,
    pub completed_at: String,
    /// Destination-side backup captured right before the push (local
    /// mode only). `None` when SFTP, when the server root was
    /// missing, or when the diff was empty.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub backup: Option<backup::BackupEntry>,
}

pub use self::diff::ChangeKind;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::profiles::{
        ConnectionMode, LocalConnection, MapId, ProfilePaths, ServerProfile,
    };
    use tempfile::TempDir;

    fn touch(p: &Path, content: &[u8]) {
        if let Some(parent) = p.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(p, content).unwrap();
    }

    fn profile_with_root(root: &Path) -> ServerProfile {
        ServerProfile {
            id: "t".into(),
            name: "t".into(),
            mode: ConnectionMode::Local,
            sftp: None,
            local: Some(LocalConnection {
                root_path: root.to_string_lossy().into_owned(),
            }),
            paths: ProfilePaths {
                mpmissions_relative: "mpmissions/m".into(),
                profiles_relative: "profiles".into(),
                local_profiles_relative: None,
            },
            map: MapId::Chernarusplus,
            custom_map_id: None,
            custom_map_size_m: None,
            work_dir: None,
            mods: Vec::new(),
            remote_commands: None,
            created_at: chrono::Utc::now(),
            last_pull_at: None,
            last_push_at: None,
        }
    }

    #[test]
    fn workspace_relative_paths_includes_root_files() {
        let td = TempDir::new().unwrap();
        let profile = profile_with_root(td.path());
        let rels = workspace_relative_paths(&profile);
        let names: Vec<String> =
            rels.iter().map(|p| p.to_string_lossy().into_owned()).collect();
        assert!(names.iter().any(|n| n.contains("mpmissions/m")));
        assert!(names.iter().any(|n| n == "profiles"));
        assert!(names.iter().any(|n| n == "serverDZ.cfg"));
        assert!(names.iter().any(|n| n == "server.cfg"));
    }

    #[tokio::test]
    async fn pull_local_copies_server_cfg_into_workspace() {
        let td = TempDir::new().unwrap();
        let root = td.path().join("srv");
        let ws = td.path().join("ws");
        touch(
            &root.join("serverDZ.cfg"),
            b"hostname = \"Test Server\";\n",
        );
        touch(&root.join("mpmissions/m/init.c"), b"// mission");
        std::fs::create_dir_all(root.join("profiles")).unwrap();
        let profile = profile_with_root(&root);
        let rels = workspace_relative_paths(&profile);
        let (files, _bytes) = pull_local(&profile, &ws, &rels).await.unwrap();
        assert!(files >= 2, "should have pulled at least cfg + init.c");
        let cfg = ws.join("serverDZ.cfg");
        assert!(cfg.exists(), "serverDZ.cfg should land at workspace root");
        let contents = std::fs::read_to_string(&cfg).unwrap();
        assert!(contents.contains("Test Server"));
    }

    #[tokio::test]
    async fn pull_local_silently_skips_missing_optional_root_files() {
        let td = TempDir::new().unwrap();
        let root = td.path().join("srv");
        let ws = td.path().join("ws");
        // No serverDZ.cfg / server.cfg on the server — just the
        // mission tree. Pull must not error out.
        touch(&root.join("mpmissions/m/init.c"), b"// mission");
        std::fs::create_dir_all(root.join("profiles")).unwrap();
        let profile = profile_with_root(&root);
        let rels = workspace_relative_paths(&profile);
        let result = pull_local(&profile, &ws, &rels).await.unwrap();
        let _ = result;
        assert!(!ws.join("serverDZ.cfg").exists());
    }

    #[tokio::test]
    async fn pull_local_captures_cfgenvironment_and_db_env() {
        // Regression guard: the territory editor depends on both
        // `<mission>/cfgenvironment.xml` and every `db/env/*.xml`
        // landing in the workspace after a pull. They sit inside the
        // mission tree, so the recursive copy should pick them up —
        // this test makes sure nobody introduces a filter that
        // accidentally excludes them.
        let td = TempDir::new().unwrap();
        let root = td.path().join("srv");
        let ws = td.path().join("ws");
        touch(&root.join("serverDZ.cfg"), b"hostname = \"t\";\n");
        touch(&root.join("mpmissions/m/init.c"), b"// mission");
        touch(
            &root.join("mpmissions/m/cfgenvironment.xml"),
            b"<env><territories/></env>",
        );
        touch(
            &root.join("mpmissions/m/db/env/bear_territories.xml"),
            b"<territory-type/>",
        );
        touch(
            &root.join("mpmissions/m/db/env/wolf_territories.xml"),
            b"<territory-type/>",
        );
        std::fs::create_dir_all(root.join("profiles")).unwrap();

        let profile = profile_with_root(&root);
        let rels = workspace_relative_paths(&profile);
        pull_local(&profile, &ws, &rels).await.unwrap();

        let env = ws.join("mpmissions/m/cfgenvironment.xml");
        let bear = ws.join("mpmissions/m/db/env/bear_territories.xml");
        let wolf = ws.join("mpmissions/m/db/env/wolf_territories.xml");
        assert!(env.is_file(), "cfgenvironment.xml must land in workspace");
        assert!(bear.is_file(), "bear_territories.xml must land in workspace");
        assert!(wolf.is_file(), "wolf_territories.xml must land in workspace");

        // The snapshot must also track them so a push can spot changes.
        let snap = snapshot::capture(&ws, &rels, String::new()).unwrap();
        assert!(snap.files.contains_key("mpmissions/m/cfgenvironment.xml"));
        assert!(
            snap.files.contains_key("mpmissions/m/db/env/bear_territories.xml")
        );
    }

    #[tokio::test]
    async fn push_local_writes_territory_edits_back_to_server() {
        // Round-trip: pull → edit → push → expect server to reflect.
        let td = TempDir::new().unwrap();
        let root = td.path().join("srv");
        let ws = td.path().join("ws");
        touch(&root.join("mpmissions/m/init.c"), b"// mission");
        touch(
            &root.join("mpmissions/m/cfgenvironment.xml"),
            b"<env><territories/></env>",
        );
        touch(
            &root.join("mpmissions/m/db/env/bear_territories.xml"),
            b"<territory-type/>",
        );
        std::fs::create_dir_all(root.join("profiles")).unwrap();

        let profile = profile_with_root(&root);
        let rels = workspace_relative_paths(&profile);

        // Pull, then take a snapshot (so diff has a baseline).
        pull_local(&profile, &ws, &rels).await.unwrap();
        let baseline = snapshot::capture(&ws, &rels, String::new()).unwrap();

        // Edit both territory-related files locally.
        std::fs::write(
            ws.join("mpmissions/m/cfgenvironment.xml"),
            b"<env><territories><file path=\"env/bear_territories.xml\"/></territories></env>",
        )
        .unwrap();
        std::fs::write(
            ws.join("mpmissions/m/db/env/bear_territories.xml"),
            b"<territory-type><territory color=\"1\"/></territory-type>",
        )
        .unwrap();
        // Drop in a brand-new territory file too — push must detect added files.
        touch(
            &ws.join("mpmissions/m/db/env/unicorn_territories.xml"),
            b"<territory-type/>",
        );

        let current = snapshot::capture(&ws, &rels, String::new()).unwrap();
        let d = diff::compute_against(&baseline, &current);
        assert!(d.modified_count >= 2, "expected cfgenvironment + bear edits");
        assert!(d.added_count >= 1, "expected unicorn as added");

        push_local(&profile, &ws, &d).await.unwrap();

        // Server reflects all three.
        let env = std::fs::read_to_string(
            root.join("mpmissions/m/cfgenvironment.xml"),
        )
        .unwrap();
        assert!(env.contains("bear_territories.xml"));
        let bear = std::fs::read_to_string(
            root.join("mpmissions/m/db/env/bear_territories.xml"),
        )
        .unwrap();
        assert!(bear.contains("color=\"1\""));
        assert!(
            root.join("mpmissions/m/db/env/unicorn_territories.xml").is_file(),
            "new territory file must reach the server"
        );
    }

    #[tokio::test]
    async fn pull_local_replaces_existing_workspace_server_cfg() {
        let td = TempDir::new().unwrap();
        let root = td.path().join("srv");
        let ws = td.path().join("ws");
        touch(&root.join("serverDZ.cfg"), b"new = 1;\n");
        touch(&root.join("mpmissions/m/init.c"), b"// mission");
        std::fs::create_dir_all(root.join("profiles")).unwrap();
        // Pre-existing workspace copy with different content.
        touch(&ws.join("serverDZ.cfg"), b"stale = 0;\n");
        let profile = profile_with_root(&root);
        let rels = workspace_relative_paths(&profile);
        pull_local(&profile, &ws, &rels).await.unwrap();
        let contents = std::fs::read_to_string(ws.join("serverDZ.cfg")).unwrap();
        assert!(contents.contains("new = 1"));
    }

    #[test]
    fn remaps_instances_to_profiles() {
        let mut p = profile_with_root(Path::new("."));
        p.paths.local_profiles_relative = Some("instances".into());
        assert_eq!(
            rel_on_local_server(&p, "profiles/Users/x.xml"),
            "instances/Users/x.xml"
        );
        assert_eq!(
            rel_from_local_server(&p, "instances/Users/x.xml"),
            "profiles/Users/x.xml"
        );
        assert_eq!(
            rel_on_local_server(&p, "mpmissions/m/types.xml"),
            "mpmissions/m/types.xml"
        );
        assert_eq!(rel_on_local_server(&p, "profiles"), "instances");
    }
}
