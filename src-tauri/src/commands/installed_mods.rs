//! Installed-mods scan — discover the operator's `@*` folders and
//! summarise what each one ships.
//!
//! This is the Tier-4 initiator the Setup hub calls. Three jobs:
//!
//!   1. Walk the supplied root (the server install or any folder
//!      containing `@*` mod directories) and list every mod found.
//!   2. For each mod, peek at its file tree to tell the operator
//!      what kind of imports apply: PBOs (always), CE files
//!      (types.xml / events.xml under the mod's CE / db / addons
//!      tree → drives the "Import CE files" flow), key files
//!      (drives the BattlEye keys folder).
//!   3. Cross-reference each mod against the existing reskin
//!      mod-index cache so the UI can show "Already scanned for
//!      reskinnable classes" / "Not scanned yet" without us re-
//!      walking the PBOs.
//!
//! Deliberately read-only — running this command never imports
//! anything. The Setup hub renders the result as a per-mod row
//! with explicit buttons that fan out to the existing flows
//! (`reskin_mods_add`, `ce_import_*`, …).

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::error::{AppError, AppResult};
use crate::parsers::detect::{detect_by_filename, CeFileKind};
use crate::profiles::ConnectionMode;
use crate::reskin::mod_index;
use crate::state::AppState;

/// Workspace-relative directory where SFTP pulls cache each remote
/// mod's CE XMLs (`<workspace>/.dzmgr/mod-ce-cache/@ModName/`).
/// Mirrors the constant in `commands::mods` and `sftp::mod` — same
/// value, kept colocated so the discovery flow can walk it.
const MOD_CE_CACHE_DIR: &str = ".dzmgr/mod-ce-cache";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledMod {
    /// Folder name including the `@` prefix (`@ExpansionMod`).
    pub display_name: String,
    /// Absolute folder path on disk.
    pub source_path: String,
    /// Number of `*.pbo` files found anywhere under the mod.
    pub pbo_count: u32,
    /// Total bytes across all PBOs — useful for progress estimates
    /// when the operator clicks "Scan for reskinnable classes".
    pub pbo_bytes: u64,
    /// True when the mod ships a `keys/` folder containing a
    /// `.bikey` — relevant for BattlEye-enforced servers.
    pub has_bikey: bool,
    /// True when the mod ships CE-flavoured files (types.xml /
    /// events.xml / cfgspawnabletypes.xml etc.) anywhere under it.
    /// Drives the "Import CE files" hint in the UI.
    pub has_ce_files: bool,
    /// True when the reskin mod-index already has a source row for
    /// this folder. Lets the UI render "Already scanned" instead
    /// of "Scan now" for previously-indexed mods.
    pub reskin_scanned: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledModsScan {
    /// Absolute path the scan walked. Echoed back so the UI can
    /// confirm what was scanned.
    pub root: String,
    pub mods: Vec<InstalledMod>,
    /// Reasons we skipped potential candidates — for now just
    /// permission errors on individual folders. Empty on a clean
    /// scan.
    pub warnings: Vec<String>,
}

/// Scan an arbitrary folder for `@*` mod directories. The folder
/// is typically the server's install root (which contains
/// `@ExpansionMod`, `@CF`, etc. as siblings) or a workshop
/// download dir. We don't recurse — `@*` folders sit at depth 1
/// in every layout we've seen.
#[tauri::command]
pub async fn installed_mods_scan(
    root: String,
    _app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<InstalledModsScan> {
    let root_path = PathBuf::from(&root);
    if !root_path.is_dir() {
        return Err(AppError::Internal(format!(
            "folder not found: {}",
            root_path.display()
        )));
    }

    // Pull the existing reskin mod-index once so we can flag
    // already-scanned mods. Comparison is case-insensitive on
    // canonicalised paths to match how the index dedupes.
    let scanned: std::collections::HashSet<String> =
        mod_index::load_index(&state.app_data_dir)
            .map(|idx| {
                idx.sources
                    .into_iter()
                    .map(|s| s.source_path.to_lowercase())
                    .collect()
            })
            .unwrap_or_default();

    let mut mods: Vec<InstalledMod> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();

    // Walk the tree looking for `@*` folders at any depth — but
    // never recurse INTO an `@*` folder (each mod is treated as an
    // opaque unit). Bounded depth so a misclick on the user's home
    // dir doesn't hang the scanner. Real-world layouts that need
    // depth > 1: workshop content (depth 4), DayZSALauncher's
    // `!Workshop/` (depth 2), Sausage's `mods/` (depth 2).
    //
    // Implementation note: we have to iterate the walker manually
    // and call `skip_current_dir()` after yielding an `@*` entry.
    // `filter_entry` would skip the @ folder ENTIRELY (no yield AND
    // no descent), which is why the previous filter-based version
    // returned 0 mods every time.
    const MAX_DEPTH: usize = 6;
    let mut found: std::collections::BTreeSet<PathBuf> =
        std::collections::BTreeSet::new();
    let mut walker = walkdir::WalkDir::new(&root_path)
        .follow_links(false)
        .max_depth(MAX_DEPTH)
        .into_iter();
    loop {
        let entry = match walker.next() {
            Some(Ok(e)) => e,
            Some(Err(e)) => {
                warnings.push(format!("walk: {e}"));
                continue;
            }
            None => break,
        };
        if !entry.file_type().is_dir() {
            continue;
        }
        let path = entry.path();
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n,
            None => continue,
        };
        if !name.starts_with('@') {
            continue;
        }
        // Treat the mod as a leaf — don't descend into its tree.
        walker.skip_current_dir();
        // Defensive — `walkdir` shouldn't yield the same path twice
        // with `follow_links(false)`, but canonicalising before
        // insertion guarantees no duplicate rows when the tree
        // contains junctions / symlinks.
        let key = path
            .canonicalize()
            .unwrap_or_else(|_| path.to_path_buf());
        if !found.insert(key.clone()) {
            continue;
        }
        match summarise_mod(path, &scanned) {
            Ok(summary) => mods.push(summary),
            Err(e) => warnings.push(format!("{name}: {e}")),
        }
    }

    // Sort alphabetically — operators tend to remember mods by
    // name, not load order, so name-sorted is the friendliest
    // browse experience here. The actual `-mod=` load order is
    // managed separately on the server.
    mods.sort_by(|a, b| a.display_name.cmp(&b.display_name));

    Ok(InstalledModsScan {
        root: root_path.to_string_lossy().into_owned(),
        mods,
        warnings,
    })
}

/// Profile-aware variant of `installed_mods_scan`. Picks the right
/// directory to walk based on the active profile's connection mode:
///
/// - **Local** profiles: scan `profile.local.root_path` (the operator's
///   actual server install). They can still call the path-taking
///   variant if they want to scan a different folder.
/// - **SFTP** profiles: scan `<workspace>/.dzmgr/mod-ce-cache/`, the
///   directory `sync_pull` populates with each remote mod's CE
///   XMLs. The cached `@ModName` folders look identical to a local
///   install for our purposes, so the rest of the scan + per-mod
///   register flow works unchanged.
///
/// Returns an error with a clear hint when neither source is
/// available (no local root configured / no pull yet on SFTP).
#[tauri::command]
pub async fn installed_mods_scan_for_profile(
    profile_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<InstalledModsScan> {
    let profile = {
        let store = state.profiles.lock().await;
        store.get(&profile_id)?
    };

    let root = match profile.mode {
        ConnectionMode::Local => {
            let p = profile
                .local
                .as_ref()
                .map(|l| l.root_path.trim().to_string())
                .filter(|s| !s.is_empty())
                .ok_or_else(|| {
                    AppError::Internal(
                        "Local profile has no root path set — open the profile and pick the server folder.".into(),
                    )
                })?;
            if !PathBuf::from(&p).is_dir() {
                return Err(AppError::Internal(format!(
                    "Profile root path does not exist: {p}"
                )));
            }
            p
        }
        ConnectionMode::Sftp => {
            let cache = state
                .workspace_for(&profile_id)
                .join(MOD_CE_CACHE_DIR);
            if !cache.is_dir() {
                return Err(AppError::Internal(
                    "No mod cache yet — pull the workspace first. SFTP profiles populate the local mod cache during pull.".into(),
                ));
            }
            cache.to_string_lossy().into_owned()
        }
    };

    installed_mods_scan(root, app, state).await
}

fn summarise_mod(
    path: &Path,
    scanned: &std::collections::HashSet<String>,
) -> AppResult<InstalledMod> {
    let canonical = path
        .canonicalize()
        .unwrap_or_else(|_| path.to_path_buf());
    let canonical_str = canonical.to_string_lossy().to_lowercase();

    let mut pbo_count: u32 = 0;
    let mut pbo_bytes: u64 = 0;
    let mut has_bikey = false;
    let mut has_ce_files = false;

    for entry in walkdir::WalkDir::new(path)
        .follow_links(false)
        .into_iter()
        .filter_map(|r| r.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let p = entry.path();
        let ext = p
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_ascii_lowercase())
            .unwrap_or_default();
        let stem_lower = p
            .file_name()
            .and_then(|s| s.to_str())
            .map(|s| s.to_ascii_lowercase())
            .unwrap_or_default();
        match ext.as_str() {
            "pbo" => {
                pbo_count += 1;
                pbo_bytes += entry
                    .metadata()
                    .map(|m| m.len())
                    .unwrap_or(0);
            }
            "bikey" => {
                has_bikey = true;
            }
            "xml" => {
                // Match by the same filename heuristics the CE
                // import flow uses (`detect_by_filename`) so prefix-
                // and suffix-tagged variants like
                // `expansion_types.xml` / `mymod_events.xml` /
                // `cfgspawnabletypes_extra.xml` register as CE
                // files. The previous exact-match against a tiny
                // allowlist missed every mod that namespaces its
                // XMLs, which is most of them in practice.
                let kind = detect_by_filename(&stem_lower);
                if !matches!(
                    kind,
                    CeFileKind::Unknown | CeFileKind::EconomyCore
                ) {
                    has_ce_files = true;
                }
            }
            _ => {}
        }
    }

    let display_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("@unknown")
        .to_string();

    Ok(InstalledMod {
        display_name,
        source_path: canonical.to_string_lossy().into_owned(),
        pbo_count,
        pbo_bytes,
        has_bikey,
        has_ce_files,
        reskin_scanned: scanned.contains(&canonical_str),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Folders that don't start with `@` should be ignored — the
    /// scanner is specifically about Arma/DayZ-convention mod
    /// directories. Keeps non-mod siblings (`mpmissions/`,
    /// `keys/`, `addons/`) out of the result.
    #[test]
    fn summarise_finds_pbo_count_and_bytes() {
        let td = tempfile::tempdir().unwrap();
        let mod_root = td.path().join("@MyMod");
        std::fs::create_dir_all(mod_root.join("addons")).unwrap();
        std::fs::write(mod_root.join("addons/a.pbo"), b"123").unwrap();
        std::fs::write(mod_root.join("addons/b.pbo"), b"456789").unwrap();
        std::fs::create_dir_all(mod_root.join("keys")).unwrap();
        std::fs::write(mod_root.join("keys/x.bikey"), b"").unwrap();
        std::fs::write(mod_root.join("addons/types.xml"), b"<types/>").unwrap();

        let scanned = std::collections::HashSet::new();
        let s = summarise_mod(&mod_root, &scanned).unwrap();
        assert_eq!(s.display_name, "@MyMod");
        assert_eq!(s.pbo_count, 2);
        assert_eq!(s.pbo_bytes, 9);
        assert!(s.has_bikey);
        assert!(s.has_ce_files);
        assert!(!s.reskin_scanned);
    }

    /// `reskin_scanned` should flip to true when the mod's
    /// canonicalised path is already in the reskin index. Keeps
    /// the UI from offering "Scan" twice for the same mod.
    #[test]
    fn summarise_marks_reskin_scanned_when_indexed() {
        let td = tempfile::tempdir().unwrap();
        let mod_root = td.path().join("@AlreadyScanned");
        std::fs::create_dir_all(&mod_root).unwrap();

        let canonical = mod_root.canonicalize().unwrap();
        let mut set = std::collections::HashSet::new();
        set.insert(canonical.to_string_lossy().to_lowercase());

        let s = summarise_mod(&mod_root, &set).unwrap();
        assert!(s.reskin_scanned);
    }
}
