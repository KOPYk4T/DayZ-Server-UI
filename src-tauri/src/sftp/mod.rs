//! SFTP transport — real russh + russh-sftp wiring.
//!
//! Sibling to the local-folder transport in `sync/mod.rs`. These three
//! entry points (`probe`, `pull_paths`, `push_diff`) are the contract
//! the rest of the app depends on — see their stub predecessors for
//! the why. Each call opens its own SSH connection and closes it on
//! return; we don't pool connections yet because a sync is bursty and
//! latency-dominated by file I/O, not TCP setup.

pub(crate) mod client;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Instant;

use russh_sftp::client::SftpSession;
use russh_sftp::protocol::FileType;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::error::{AppError, AppResult};
use crate::profiles::ServerProfile;
use crate::sync::diff::{ChangeKind, DiffSummary};

pub use client::{format_fingerprint, join_remote};

pub struct ConnectionProbe {
    pub latency_ms: u64,
    pub fingerprint: String,
}

// ---------- Probe ----------

/// Open a connection, authenticate, capture the server fingerprint,
/// and close. Does NOT enforce fingerprint matching — the caller
/// (`commands::connection`) reads the returned fingerprint and decides
/// whether it matches what's stored, so it can surface
/// `fingerprint_changed: true` to the UI.
pub async fn probe(
    profile: &ServerProfile,
    password: Option<String>,
    key_passphrase: Option<String>,
) -> AppResult<ConnectionProbe> {
    let start = Instant::now();
    let (handle, fingerprint) =
        client::connect(profile, password, key_passphrase).await?;
    // Open and immediately drop an SFTP session to confirm the SSH
    // user can actually reach the sftp subsystem — catches servers
    // where SSH login succeeds but SFTP is disabled (rare but
    // survivable failure mode).
    let _sftp = client::open_sftp(&handle).await?;
    let latency_ms = start.elapsed().as_millis() as u64;
    // Best-effort close.
    let _ = handle
        .disconnect(russh::Disconnect::ByApplication, "", "en")
        .await;
    Ok(ConnectionProbe {
        latency_ms,
        fingerprint,
    })
}

// ---------- Pull ----------

/// One remote path that pull skipped over because the server refused
/// the operation. Typical cause on real hosts: a file the game server
/// is holding open (`areaflags.map` under AMP / Pterodactyl / similar
/// embedded SSH panels returns `Failure: I/O error` on open while
/// listing it fine). Reported back to the caller so the UI can surface
/// a warning without failing the whole pull.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedItem {
    /// Remote path as we tried to open it. Forward slashes, possibly
    /// absolute (depends on the profile's `remote_root`).
    pub path: String,
    /// Raw error string from the SFTP server.
    pub reason: String,
}

/// Diagnostic report from the SFTP pull — which directories we
/// checked for root files, what was in each, and what happened to
/// each root-file candidate. Lets the UI answer "where did it look?"
/// without requiring a separate diagnostic round-trip.
#[derive(Debug, Clone, serde::Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SftpLayoutReport {
    /// Each candidate server-root directory we listed, in the order
    /// tried. `listed == false` means the read_dir failed (typical:
    /// the directory doesn't exist or the user can't read it).
    pub candidates: Vec<CandidateDir>,
    /// Root files (`serverDZ.cfg`, `server.cfg`, …) with their
    /// outcome.
    pub root_files: Vec<RootFileStatus>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateDir {
    pub dir: String,
    pub listed: bool,
    pub entry_count: usize,
    /// Up to ~20 entries for the UI to show as a preview — enough to
    /// spot whether this directory looks like a DayZ install
    /// (`mpmissions`, `keys`, `@*` folders). Full listing stays
    /// server-side to keep the IPC payload modest.
    pub sample_entries: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RootFileStatus {
    /// Name as listed in `ROOT_FILE_RELS` — the case the UI / code
    /// expects.
    pub name: String,
    /// `"pulled"`, `"skipped"`, or `"notFound"`.
    pub status: String,
    /// Absolute-ish remote path we ended up using — empty when the
    /// file wasn't found in any candidate directory.
    #[serde(skip_serializing_if = "String::is_empty")]
    pub remote_path: String,
    /// Error text when `status != "pulled"`. Empty for success.
    #[serde(skip_serializing_if = "String::is_empty")]
    pub reason: String,
}

/// Recursively pull each top-level relative path listed in `rels`
/// from the remote server into the local workspace, preserving the
/// directory structure. Returns `(file_count, total_bytes, skipped)`.
/// Individual file errors become skipped entries — only a fatal setup
/// error (auth / fingerprint / top-level stat) bails out.
pub async fn pull_paths(
    profile: &ServerProfile,
    workspace: &Path,
    rels: &[PathBuf],
    password: Option<String>,
    key_passphrase: Option<String>,
) -> AppResult<(usize, u64, Vec<SkippedItem>, SftpLayoutReport)> {
    let (handle, fingerprint) =
        client::connect(profile, password, key_passphrase).await?;
    client::verify_fingerprint_strict(profile, &fingerprint)?;
    let sftp = client::open_sftp(&handle).await?;

    let mut total_files = 0usize;
    let mut total_bytes = 0u64;
    let mut skipped: Vec<SkippedItem> = Vec::new();

    // List every candidate server-root directory once and build a
    // case-insensitive lookup. Real-world DayZ hosts put the install
    // in different places relative to the SSH login home, so we try
    // several — see `server_root_candidates` for the ordering. This
    // also fixes case-sensitivity on Linux (`serverDZ.cfg` vs
    // `serverdz.cfg`) since we key on lowercase names.
    let (root_listings, candidates_tried) =
        list_root_candidates(&sftp, profile).await;
    let mut report = SftpLayoutReport {
        candidates: candidates_tried,
        root_files: Vec::new(),
    };

    for rel in rels {
        let is_root_file = rel.parent().map(|p| p.as_os_str().is_empty()).unwrap_or(true);

        // For root-level rels, resolve their actual case against the
        // server's directory listings before stat'ing. For nested
        // rels, use the path as configured — the user typed those.
        let remote = if is_root_file {
            match resolve_root_rel(rel, profile, &root_listings) {
                Some(s) => s,
                None => {
                    let name = rel.to_string_lossy().into_owned();
                    report.root_files.push(RootFileStatus {
                        name: name.clone(),
                        status: "notFound".into(),
                        remote_path: String::new(),
                        reason: "not present in any scanned directory".into(),
                    });
                    skipped.push(SkippedItem {
                        path: name,
                        reason: "not found at server root".into(),
                    });
                    continue;
                }
            }
        } else {
            client::resolve_remote(profile, rel)
        };
        let local_path = workspace.join(rel);

        let meta = match sftp.metadata(&remote).await {
            Ok(m) => m,
            Err(e) => {
                if is_root_file {
                    let name = rel.to_string_lossy().into_owned();
                    report.root_files.push(RootFileStatus {
                        name: name.clone(),
                        status: "skipped".into(),
                        remote_path: remote.clone(),
                        reason: format!("stat failed: {e}"),
                    });
                    skipped.push(SkippedItem {
                        path: remote.clone(),
                        reason: format!("stat failed: {e}"),
                    });
                    continue;
                }
                return Err(AppError::Sftp(format!(
                    "stat {remote}: {e}"
                )));
            }
        };

        if meta.is_dir() {
            if local_path.exists() {
                std::fs::remove_dir_all(&local_path)?;
            }
            std::fs::create_dir_all(&local_path)?;
            let (f, b) = pull_tree(&sftp, &remote, &local_path, &mut skipped).await?;
            total_files += f;
            total_bytes += b;
        } else if meta.is_regular() {
            if let Some(parent) = local_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            if local_path.exists() {
                std::fs::remove_file(&local_path)?;
            }
            match download_file(&sftp, &remote, &local_path).await {
                Ok(n) => {
                    total_files += 1;
                    total_bytes += n;
                    if is_root_file {
                        let name = rel.to_string_lossy().into_owned();
                        report.root_files.push(RootFileStatus {
                            name,
                            status: "pulled".into(),
                            remote_path: remote.clone(),
                            reason: String::new(),
                        });
                    }
                }
                Err(sftp_err) => {
                    // Managed game panels (AMP / Pterodactyl / …) often
                    // block SFTP `open` on files the DayZ server holds
                    // live, returning `Failure: I/O error`. The same
                    // file is usually readable via shell `cat` on the
                    // same SSH session, so retry that way for small
                    // root files like `serverDZ.cfg`. If exec also
                    // fails (SFTP-only accounts, permission, …) we
                    // fall back to the original SFTP error so the
                    // skipped reason stays meaningful.
                    let attempt_fallback = is_root_file;
                    let outcome = if attempt_fallback {
                        match client::exec_cat_file(&handle, &remote).await {
                            Ok(bytes) => {
                                if let Some(parent) = local_path.parent() {
                                    std::fs::create_dir_all(parent)?;
                                }
                                std::fs::write(&local_path, &bytes)?;
                                Ok(bytes.len() as u64)
                            }
                            Err(exec_err) => {
                                // Combine both errors so the UI can
                                // show why the fallback didn't save
                                // the day.
                                Err(format!(
                                    "{sftp_err} · shell fallback also failed: {exec_err}"
                                ))
                            }
                        }
                    } else {
                        Err(sftp_err.to_string())
                    };

                    match outcome {
                        Ok(n) => {
                            total_files += 1;
                            total_bytes += n;
                            if is_root_file {
                                let name = rel.to_string_lossy().into_owned();
                                report.root_files.push(RootFileStatus {
                                    name,
                                    status: "pulled".into(),
                                    remote_path: remote.clone(),
                                    reason: "via shell fallback (panel blocked SFTP open)".into(),
                                });
                            }
                        }
                        Err(reason) => {
                            if is_root_file {
                                let name = rel.to_string_lossy().into_owned();
                                report.root_files.push(RootFileStatus {
                                    name,
                                    status: "skipped".into(),
                                    remote_path: remote.clone(),
                                    reason: reason.clone(),
                                });
                            }
                            skipped.push(SkippedItem {
                                path: remote.clone(),
                                reason,
                            });
                        }
                    }
                }
            }
        }
    }

    // Build a snapshot of what's installed on the server — `@ModName`
    // folders, their `.pbo` addon counts, `keys/*.bikey` names — so
    // the Mods page can show full detail even in SFTP mode (no need
    // to download hundreds of MB of `.pbo` content). We anchor the
    // enumeration at whichever candidate dir looks most like a DayZ
    // install (has `mpmissions/`, `keys/`, or `@*` folders), so the
    // mod scan works even when the user didn't configure a remote
    // root. Saved to `<workspace>/.dzmgr/remote-mods.json`.
    let install_root = pick_install_root(&root_listings).to_string();
    match enumerate_remote_mods(&sftp, &install_root, workspace, &mut skipped).await {
        Ok(inv) => {
            if let Err(e) = save_remote_mods(workspace, &inv) {
                skipped.push(SkippedItem {
                    path: REMOTE_MODS_FILE.into(),
                    reason: format!("saving mod inventory: {e}"),
                });
            }
        }
        Err(e) => {
            // Not fatal: the Mods page falls back to CE-registered
            // folders only. Log as a skipped entry so the user knows
            // why their Mods panel might look incomplete.
            skipped.push(SkippedItem {
                path: "<remote mod enumeration>".into(),
                reason: e.to_string(),
            });
        }
    }

    let _ = handle
        .disconnect(russh::Disconnect::ByApplication, "", "en")
        .await;
    Ok((total_files, total_bytes, skipped, report))
}

/// Recursive tree download. Returns `(file_count, total_bytes)`.
/// Uses a manual work-queue to keep the future sized (recursive
/// async functions don't infer bounds well on stable Rust).
///
/// Individual file errors and per-directory `read_dir` errors are
/// appended to `skipped` instead of aborting the walk. The pull as a
/// whole still succeeds; callers surface the skipped list as a
/// warning to the user.
async fn pull_tree(
    sftp: &SftpSession,
    remote_root: &str,
    local_root: &Path,
    skipped: &mut Vec<SkippedItem>,
) -> AppResult<(usize, u64)> {
    let mut queue: Vec<(String, PathBuf)> =
        vec![(remote_root.to_string(), local_root.to_path_buf())];
    let mut files = 0usize;
    let mut bytes = 0u64;

    while let Some((remote_dir, local_dir)) = queue.pop() {
        let entries = match sftp.read_dir(&remote_dir).await {
            Ok(v) => v,
            Err(e) => {
                skipped.push(SkippedItem {
                    path: remote_dir.clone(),
                    reason: format!("read_dir: {e}"),
                });
                continue;
            }
        };
        for entry in entries {
            let name = entry.file_name();
            if name == "." || name == ".." {
                continue;
            }
            let remote_path = format!("{}/{}", remote_dir.trim_end_matches('/'), name);
            let local_path = local_dir.join(&name);
            let ft = entry.file_type();
            match ft {
                FileType::Dir => {
                    if let Err(e) = std::fs::create_dir_all(&local_path) {
                        skipped.push(SkippedItem {
                            path: remote_path.clone(),
                            reason: format!("local mkdir: {e}"),
                        });
                        continue;
                    }
                    queue.push((remote_path, local_path));
                }
                FileType::File | FileType::Symlink => {
                    // Symlinks: follow and download the target so the
                    // local workspace stays self-contained. DayZ
                    // configs occasionally use symlinks.
                    match download_file(sftp, &remote_path, &local_path).await {
                        Ok(n) => {
                            files += 1;
                            bytes += n;
                        }
                        Err(e) => {
                            skipped.push(SkippedItem {
                                path: remote_path,
                                reason: e.to_string(),
                            });
                        }
                    }
                }
                _ => {
                    // Sockets / devices / etc. — skip silently, they
                    // shouldn't appear in a mission folder.
                }
            }
        }
    }
    Ok((files, bytes))
}

async fn download_file(
    sftp: &SftpSession,
    remote_path: &str,
    local_path: &Path,
) -> AppResult<u64> {
    let mut file = sftp
        .open(remote_path)
        .await
        .map_err(|e| AppError::Sftp(format!("open {remote_path}: {e}")))?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf)
        .await
        .map_err(|e| AppError::Sftp(format!("read {remote_path}: {e}")))?;
    if let Some(parent) = local_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(local_path, &buf)?;
    Ok(buf.len() as u64)
}

// ---------- Root-file case-insensitive resolution ----------

/// Snapshot of a directory that might be the DayZ install root,
/// keyed by lowercase filename → actual on-disk casing. We may keep
/// listings for several candidate directories during one pull because
/// different hosts put the DayZ install in different places relative
/// to the SSH login user's home.
struct RootListing {
    base: String,
    by_lower: HashMap<String, String>,
}

/// Ordered list of candidate directories that could hold
/// `serverDZ.cfg`, `@ModName/` folders, and `keys/`. We try each in
/// sequence until one answers. Covers three host layouts:
///
/// 1. **Explicit remote root** — the user filled in the `Server root
///    path` field on the profile, e.g. `/opt/dayz`.
/// 2. **Inferred from mission path** — the profile's mpmissions path
///    is `dayz/mpmissions/chernarusplus`, so the install root is
///    `dayz/`. Covers managed hosts (AMP / Pterodactyl) that drop the
///    SSH user in their home directory with the server install one
///    level deeper.
/// 3. **SSH session CWD** — last-resort `.`, for hosts where the SSH
///    login lands you straight in the install directory.
fn server_root_candidates(profile: &ServerProfile) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut push = |s: String| {
        if !s.is_empty() && !out.contains(&s) {
            out.push(s);
        }
    };

    // 1. Explicit override.
    if let Some(root) = profile
        .sftp
        .as_ref()
        .and_then(|s| s.remote_root.as_deref())
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        push(root.trim_end_matches('/').to_string());
    }

    // 2. Derived from mpmissions_relative. Strip from the first
    //    `mpmissions` segment onwards — what remains is the install
    //    root relative to SSH CWD. Handles forward and back slashes.
    let mp_rel = profile.paths.mpmissions_relative.replace('\\', "/");
    let lower = mp_rel.to_ascii_lowercase();
    if let Some(idx) = lower.find("mpmissions") {
        let parent = mp_rel[..idx].trim_end_matches('/');
        if parent.is_empty() {
            push(".".to_string());
        } else {
            push(parent.to_string());
        }
    }

    // 3. CWD fallback.
    push(".".to_string());
    out
}

/// Build a lowercase lookup table of every candidate server-root
/// directory we could reasonably talk to. Listings that fail (dir
/// missing / permission) are silently dropped — we'll try the next
/// candidate.
async fn list_root_candidates(
    sftp: &SftpSession,
    profile: &ServerProfile,
) -> (Vec<RootListing>, Vec<CandidateDir>) {
    let mut listings = Vec::new();
    let mut diag = Vec::new();
    for base in server_root_candidates(profile) {
        let entries = sftp.read_dir(&base).await;
        match entries {
            Ok(entries) => {
                let mut by_lower = HashMap::new();
                let mut sample: Vec<String> = Vec::new();
                for e in entries {
                    let name = e.file_name();
                    if name == "." || name == ".." {
                        continue;
                    }
                    if sample.len() < 20 {
                        sample.push(name.clone());
                    }
                    by_lower.insert(name.to_ascii_lowercase(), name);
                }
                diag.push(CandidateDir {
                    dir: base.clone(),
                    listed: true,
                    entry_count: by_lower.len(),
                    sample_entries: sample,
                });
                listings.push(RootListing { base, by_lower });
            }
            Err(_) => {
                diag.push(CandidateDir {
                    dir: base,
                    listed: false,
                    entry_count: 0,
                    sample_entries: Vec::new(),
                });
            }
        }
    }
    (listings, diag)
}

fn resolve_root_rel(
    rel: &Path,
    profile: &ServerProfile,
    listings: &[RootListing],
) -> Option<String> {
    let want = rel.file_name()?.to_string_lossy().to_ascii_lowercase();
    for listing in listings {
        if let Some(actual) = listing.by_lower.get(&want) {
            let base = listing.base.trim_end_matches('/');
            return Some(if base == "." || base.is_empty() {
                actual.clone()
            } else {
                format!("{base}/{actual}")
            });
        }
    }
    // Final fallback — let the caller surface a skipped entry if the
    // stat fails against the configured casing.
    Some(client::resolve_remote(profile, rel))
}

/// Pick the first candidate server-root listing that actually looks
/// like a DayZ install — i.e. contains `mpmissions/`, `@*/`,
/// `keys/`, or `serverDZ.cfg`. Used to anchor the remote mod
/// enumeration when no `remote_root` was configured. Returns the
/// listing's base path; falls back to `.` when nothing smelled
/// right.
fn pick_install_root<'a>(listings: &'a [RootListing]) -> &'a str {
    for listing in listings {
        let smells_like_dayz = listing.by_lower.contains_key("mpmissions")
            || listing.by_lower.contains_key("keys")
            || listing.by_lower.contains_key("serverdz.cfg")
            || listing.by_lower.contains_key("server.cfg")
            || listing.by_lower.keys().any(|k| k.starts_with('@'));
        if smells_like_dayz {
            return listing.base.as_str();
        }
    }
    listings.first().map(|l| l.base.as_str()).unwrap_or(".")
}

// ---------- Remote mod inventory ----------

pub const REMOTE_MODS_FILE: &str = ".dzmgr/remote-mods.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RemoteModInventory {
    pub generated_at: String,
    pub mods: Vec<RemoteMod>,
    /// Lowercase `.bikey` filename stems from the server's `keys/`
    /// folder. Empty when the server has no `keys/` folder at the
    /// configured root (rare).
    pub bikey_names: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteMod {
    /// Folder name on the remote — includes the `@` prefix.
    pub folder_name: String,
    /// Remote absolute (or root-relative) path to the mod folder.
    pub remote_path: String,
    /// Total number of `.pbo` files the mod ships (recursive). Counted
    /// via remote `read_dir`, not downloaded.
    pub pbo_count: usize,
}

/// Workspace cache directory for mod CE fragments downloaded during
/// SFTP pulls. Kept in sync with the constant in `commands::mods` —
/// see that module for details.
const MOD_CE_CACHE_DIR: &str = ".dzmgr/mod-ce-cache";

async fn enumerate_remote_mods(
    sftp: &SftpSession,
    base: &str,
    workspace: &Path,
    skipped: &mut Vec<SkippedItem>,
) -> AppResult<RemoteModInventory> {
    let entries = sftp
        .read_dir(base)
        .await
        .map_err(|e| AppError::Sftp(format!("read_dir {base}: {e}")))?;

    let mut mods = Vec::new();
    let mut bikey_names = Vec::new();

    // Wipe the cache so stale files from previous pulls don't linger.
    // It's cheap to rebuild — per-mod folders are tens of KB at most.
    let cache_root = workspace.join(MOD_CE_CACHE_DIR);
    if cache_root.exists() {
        let _ = std::fs::remove_dir_all(&cache_root);
    }

    for entry in entries {
        let name = entry.file_name();
        if name == "." || name == ".." {
            continue;
        }
        let ft = entry.file_type();
        let remote_path = if base == "." || base.is_empty() {
            name.clone()
        } else {
            format!("{}/{}", base.trim_end_matches('/'), name)
        };

        if name.starts_with('@') && matches!(ft, FileType::Dir) {
            let pbo_count = count_remote_pbos(sftp, &remote_path).await;
            // Mirror the mod's XML fragments (CE templates shipped
            // under `files/`, `CE/`, or wherever) into the workspace
            // cache so the Mods page can preview & import them
            // offline. Skips `addons/` (pbo content, heavy) and
            // `keys/` (bikeys, not CE).
            let mod_cache = cache_root.join(&name);
            if let Err(e) =
                download_mod_ce_files(sftp, &remote_path, &mod_cache).await
            {
                skipped.push(SkippedItem {
                    path: remote_path.clone(),
                    reason: format!("mod CE cache: {e}"),
                });
            }
            mods.push(RemoteMod {
                folder_name: name,
                remote_path,
                pbo_count,
            });
        } else if name.eq_ignore_ascii_case("keys") && matches!(ft, FileType::Dir) {
            if let Ok(key_entries) = sftp.read_dir(&remote_path).await {
                for k in key_entries {
                    let kname = k.file_name();
                    if kname == "." || kname == ".." {
                        continue;
                    }
                    let lower = kname.to_ascii_lowercase();
                    if let Some(stem) = lower.strip_suffix(".bikey") {
                        bikey_names.push(stem.to_string());
                    }
                }
            }
        }
    }

    mods.sort_by(|a, b| {
        a.folder_name
            .to_ascii_lowercase()
            .cmp(&b.folder_name.to_ascii_lowercase())
    });
    bikey_names.sort();
    bikey_names.dedup();

    Ok(RemoteModInventory {
        generated_at: chrono::Utc::now().to_rfc3339(),
        mods,
        bikey_names,
    })
}

/// Caps applied when mirroring a mod's CE fragments into the
/// workspace cache — defensive ceilings so a weird mod can't chew
/// through an unbounded amount of disk. CE fragments in practice
/// are tens of KB; these thresholds cover vanilla DayZ-Expansion
/// (≈300 files / ≈2 MB across the Bundle) with headroom.
const MOD_CE_CACHE_FILE_LIMIT: usize = 2_000;
const MOD_CE_CACHE_BYTES_LIMIT: u64 = 50 * 1024 * 1024; // 50 MB

/// Download every XML file under a remote mod folder into a local
/// cache directory, preserving relative paths. Skips `addons/` (PBO
/// content) and `keys/` (.bikey files — these stay in the server
/// root, not per-mod). Used so the Mods page can scan available CE
/// fragments offline and hand them to the import flow without a
/// second remote round-trip.
async fn download_mod_ce_files(
    sftp: &SftpSession,
    remote_root: &str,
    local_root: &Path,
) -> AppResult<()> {
    let mut queue: Vec<(String, PathBuf)> =
        vec![(remote_root.to_string(), local_root.to_path_buf())];
    let mut files_written = 0usize;
    let mut bytes_written = 0u64;

    while let Some((dir, local_dir)) = queue.pop() {
        let entries = match sftp.read_dir(&dir).await {
            Ok(v) => v,
            Err(_) => continue,
        };
        for entry in entries {
            let name = entry.file_name();
            if name == "." || name == ".." {
                continue;
            }
            let lower = name.to_ascii_lowercase();
            let path = format!("{}/{}", dir.trim_end_matches('/'), name);
            match entry.file_type() {
                FileType::Dir => {
                    // Skip the big / irrelevant branches.
                    if lower == "addons" || lower == "keys" {
                        continue;
                    }
                    queue.push((path, local_dir.join(&name)));
                }
                FileType::File | FileType::Symlink => {
                    if !lower.ends_with(".xml") {
                        continue;
                    }
                    if files_written >= MOD_CE_CACHE_FILE_LIMIT
                        || bytes_written >= MOD_CE_CACHE_BYTES_LIMIT
                    {
                        return Ok(()); // ceiling reached — stop quietly
                    }
                    let dest = local_dir.join(&name);
                    if let Some(parent) = dest.parent() {
                        std::fs::create_dir_all(parent)?;
                    }
                    // Reuse the existing SFTP read-to-local helper.
                    match download_file(sftp, &path, &dest).await {
                        Ok(n) => {
                            files_written += 1;
                            bytes_written = bytes_written.saturating_add(n);
                        }
                        Err(_) => {
                            // Individual failures aren't fatal — mod
                            // files are opportunistic cache data. A
                            // locked / unreadable file just won't be
                            // previewable on the Mods page.
                        }
                    }
                }
                _ => {}
            }
        }
    }
    Ok(())
}

/// Recursive `.pbo` counter — walks the mod folder tree with SFTP
/// `read_dir` and counts files ending in `.pbo` (case-insensitive).
/// Does not download any file content; we only need the count.
async fn count_remote_pbos(sftp: &SftpSession, root: &str) -> usize {
    // Iterative walk to keep the async future sized (same pattern as
    // pull_tree). Panics are not a concern — failed reads just stop
    // counting deeper into that branch.
    let mut count = 0usize;
    let mut queue: Vec<String> = vec![root.to_string()];
    while let Some(dir) = queue.pop() {
        let entries = match sftp.read_dir(&dir).await {
            Ok(v) => v,
            Err(_) => continue,
        };
        for e in entries {
            let name = e.file_name();
            if name == "." || name == ".." {
                continue;
            }
            let path = format!("{}/{}", dir.trim_end_matches('/'), name);
            match e.file_type() {
                FileType::Dir => queue.push(path),
                FileType::File | FileType::Symlink => {
                    if name.to_ascii_lowercase().ends_with(".pbo") {
                        count += 1;
                    }
                }
                _ => {}
            }
        }
    }
    count
}

fn save_remote_mods(workspace: &Path, inv: &RemoteModInventory) -> AppResult<()> {
    let path = workspace.join(REMOTE_MODS_FILE);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let bytes = serde_json::to_vec_pretty(inv)?;
    std::fs::write(&path, bytes)?;
    Ok(())
}

/// Read the remote-mods snapshot written by the last SFTP pull.
/// Returns `None` when the file is absent or unreadable — callers fall
/// back to the CE-folders-only view.
pub fn load_remote_mods(workspace: &Path) -> Option<RemoteModInventory> {
    let bytes = std::fs::read(workspace.join(REMOTE_MODS_FILE)).ok()?;
    serde_json::from_slice(&bytes).ok()
}

// ---------- Push ----------

/// Apply a diff against the remote server. `DiffSummary` was computed
/// by `sync::diff` comparing the current workspace against the
/// last-pull snapshot.
pub async fn push_diff(
    profile: &ServerProfile,
    workspace: &Path,
    diff: &DiffSummary,
    password: Option<String>,
    key_passphrase: Option<String>,
) -> AppResult<(usize, usize, u64)> {
    let (handle, fingerprint) =
        client::connect(profile, password, key_passphrase).await?;
    client::verify_fingerprint_strict(profile, &fingerprint)?;
    let sftp = client::open_sftp(&handle).await?;

    let mut uploaded = 0usize;
    let mut deleted = 0usize;
    let mut total_bytes = 0u64;

    for change in &diff.changes {
        let local = workspace.join(&change.path);
        let remote = client::resolve_remote_str(profile, &change.path);
        match change.kind {
            ChangeKind::Added | ChangeKind::Modified => {
                let bytes = upload_file(&sftp, &local, &remote).await?;
                uploaded += 1;
                total_bytes += bytes;
            }
            ChangeKind::Deleted => {
                // Ignore NotFound — the file may have been deleted
                // manually since we staged the diff.
                match sftp.remove_file(&remote).await {
                    Ok(_) => {
                        deleted += 1;
                    }
                    Err(e) => {
                        let msg = format!("{e}");
                        if !msg.contains("No such file")
                            && !msg.contains("NoSuchFile")
                            && !msg.contains("not found")
                        {
                            return Err(AppError::Sftp(format!(
                                "remove {remote}: {msg}"
                            )));
                        }
                    }
                }
            }
        }
    }

    let _ = handle
        .disconnect(russh::Disconnect::ByApplication, "", "en")
        .await;
    Ok((uploaded, deleted, total_bytes))
}

async fn upload_file(
    sftp: &SftpSession,
    local_path: &Path,
    remote_path: &str,
) -> AppResult<u64> {
    let bytes = std::fs::read(local_path)?;
    // Ensure parent dirs exist on the remote. SFTP has no mkdir -p,
    // so walk parents and create what's missing; ignore "already
    // exists" errors.
    if let Some(parent) = parent_of(remote_path) {
        ensure_remote_dir(sftp, &parent).await?;
    }
    let mut file = sftp
        .create(remote_path)
        .await
        .map_err(|e| AppError::Sftp(format!("create {remote_path}: {e}")))?;
    file.write_all(&bytes)
        .await
        .map_err(|e| AppError::Sftp(format!("write {remote_path}: {e}")))?;
    file.shutdown()
        .await
        .map_err(|e| AppError::Sftp(format!("close {remote_path}: {e}")))?;
    Ok(bytes.len() as u64)
}

/// Returns the parent directory of a remote path (forward-slash only).
/// `None` if the path is root-level.
fn parent_of(remote_path: &str) -> Option<String> {
    let idx = remote_path.rfind('/')?;
    if idx == 0 {
        return None; // e.g. "/foo" → no parent to create
    }
    Some(remote_path[..idx].to_string())
}

/// `mkdir -p` for SFTP. Walks parent components and creates each in
/// order; swallows "already exists" errors.
async fn ensure_remote_dir(sftp: &SftpSession, remote_dir: &str) -> AppResult<()> {
    // Split on '/' and rebuild progressively. Absolute paths start
    // with an empty first component which we preserve as the leading
    // slash.
    let absolute = remote_dir.starts_with('/');
    let mut accum = String::new();
    let parts: Vec<&str> = remote_dir
        .split('/')
        .filter(|s| !s.is_empty())
        .collect();
    for (i, part) in parts.iter().enumerate() {
        if i == 0 && absolute {
            accum.push('/');
        } else if i > 0 {
            accum.push('/');
        }
        accum.push_str(part);
        match sftp.create_dir(&accum).await {
            Ok(_) => {}
            Err(e) => {
                let msg = e.to_string();
                if !msg.contains("Failure")
                    && !msg.contains("already exists")
                    && !msg.contains("File already exists")
                {
                    // Not a harmless "already there" — report it.
                    return Err(AppError::Sftp(format!(
                        "mkdir {accum}: {msg}"
                    )));
                }
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::profiles::{
        AuthType, ConnectionMode, MapId, ProfilePaths, SftpConnection,
    };
    use chrono::Utc;

    fn sftp_profile(remote_root: Option<&str>, mpmissions: &str) -> ServerProfile {
        ServerProfile {
            id: "t".into(),
            name: "t".into(),
            mode: ConnectionMode::Sftp,
            sftp: Some(SftpConnection {
                host: "h".into(),
                port: 22,
                username: "u".into(),
                auth_type: AuthType::Password,
                private_key_path: None,
                known_host_fingerprint: None,
                remote_root: remote_root.map(str::to_owned),
            }),
            local: None,
            paths: ProfilePaths {
                mpmissions_relative: mpmissions.into(),
                profiles_relative: "profiles".into(),
            },
            map: MapId::Chernarusplus,
            custom_map_id: None,
            custom_map_size_m: None,
            work_dir: None,
            mods: Vec::new(),
            remote_commands: None,
            created_at: Utc::now(),
            last_pull_at: None,
            last_push_at: None,
        }
    }

    #[test]
    fn server_root_candidates_with_explicit_remote_root() {
        let p = sftp_profile(Some("/opt/dayz"), "mpmissions/chernarusplus");
        let cands = server_root_candidates(&p);
        assert_eq!(cands[0], "/opt/dayz");
        assert!(cands.contains(&".".to_string()));
    }

    #[test]
    fn server_root_candidates_infer_from_mission_path() {
        // Mission path one level deep under SSH CWD → install root
        // is that first segment.
        let p = sftp_profile(None, "dayz/mpmissions/dayzOffline.chernarusplus");
        let cands = server_root_candidates(&p);
        assert_eq!(cands[0], "dayz");
        assert!(cands.contains(&".".to_string()));
    }

    #[test]
    fn server_root_candidates_mission_at_cwd() {
        // Mission path directly under SSH CWD → candidate is `.`.
        let p = sftp_profile(None, "mpmissions/chernarusplus");
        let cands = server_root_candidates(&p);
        assert_eq!(cands, vec![".".to_string()]);
    }

    #[test]
    fn server_root_candidates_absolute_mission_path() {
        let p = sftp_profile(None, "/opt/dayz/mpmissions/chernarusplus");
        let cands = server_root_candidates(&p);
        assert_eq!(cands[0], "/opt/dayz");
    }

    #[test]
    fn server_root_candidates_dedup_and_order() {
        // Explicit root + mission path derive to the same thing →
        // single entry, no duplicates.
        let p = sftp_profile(Some("dayz"), "dayz/mpmissions/chernarusplus");
        let cands = server_root_candidates(&p);
        assert_eq!(cands[0], "dayz");
        assert_eq!(cands.iter().filter(|c| *c == "dayz").count(), 1);
    }

    #[test]
    fn resolve_root_rel_finds_casing_in_first_matching_listing() {
        let listings = vec![
            RootListing {
                base: "/opt/dayz".into(),
                by_lower: [
                    ("mpmissions".into(), "mpmissions".into()),
                    ("serverdz.cfg".into(), "ServerDZ.cfg".into()),
                ]
                .into_iter()
                .collect(),
            },
            RootListing {
                base: ".".into(),
                by_lower: HashMap::new(),
            },
        ];
        let p = sftp_profile(Some("/opt/dayz"), "mpmissions/chernarusplus");
        let resolved =
            resolve_root_rel(&PathBuf::from("serverDZ.cfg"), &p, &listings).unwrap();
        assert_eq!(resolved, "/opt/dayz/ServerDZ.cfg");
    }

    #[test]
    fn resolve_root_rel_tries_second_listing_when_first_empty() {
        let listings = vec![
            RootListing {
                base: ".".into(),
                by_lower: HashMap::new(),
            },
            RootListing {
                base: "dayz".into(),
                by_lower: [("serverdz.cfg".into(), "serverDZ.cfg".into())]
                    .into_iter()
                    .collect(),
            },
        ];
        let p = sftp_profile(None, "dayz/mpmissions/x");
        let resolved =
            resolve_root_rel(&PathBuf::from("serverDZ.cfg"), &p, &listings).unwrap();
        assert_eq!(resolved, "dayz/serverDZ.cfg");
    }

    #[test]
    fn pick_install_root_prefers_dir_with_dayz_markers() {
        let listings = vec![
            RootListing {
                base: ".".into(),
                by_lower: [("readme.md".into(), "README.md".into())]
                    .into_iter()
                    .collect(),
            },
            RootListing {
                base: "dayz".into(),
                by_lower: [
                    ("mpmissions".into(), "mpmissions".into()),
                    ("keys".into(), "keys".into()),
                    ("@dayzexpansion".into(), "@DayZExpansion".into()),
                ]
                .into_iter()
                .collect(),
            },
        ];
        assert_eq!(pick_install_root(&listings), "dayz");
    }

    #[test]
    fn parent_of_handles_leading_slash_paths() {
        assert_eq!(
            parent_of("/opt/dayz/mpmissions/db/types.xml"),
            Some("/opt/dayz/mpmissions/db".to_string()),
        );
    }

    #[test]
    fn parent_of_root_level_is_none() {
        assert_eq!(parent_of("/types.xml"), None);
    }

    #[test]
    fn parent_of_relative_base() {
        assert_eq!(
            parent_of("dayz/mpmissions/types.xml"),
            Some("dayz/mpmissions".to_string()),
        );
    }
}
