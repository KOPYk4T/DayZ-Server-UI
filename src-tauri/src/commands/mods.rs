//! Mod detection — inventory of what's installed on the server and
//! how much of it is wired up through `cfgeconomycore.xml` (PDR
//! §9.9 / Phase 9a).
//!
//! Detection fidelity depends on the profile mode:
//! - **Local**: we can see the server root on disk, so we enumerate
//!   every top-level `@*` folder, count `.pbo` addons inside, and
//!   cross-reference `keys/*.bikey` to see whether each mod's key
//!   is installed.
//! - **SFTP**: we only have the pulled mission + profiles + the
//!   root-level `serverDZ.cfg`. We can still list mods registered
//!   through `cfgeconomycore.xml`, but we can't see addon / key
//!   folders on the remote. UI shows a banner explaining the
//!   limitation.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::mission::{import as ce_import_mod, MissionContext};
use crate::parsers::cfg_economy_core::EconomyCore;
use crate::parsers::detect::CeFileKind;
use crate::profiles::ConnectionMode;
use crate::sftp;
use crate::state::AppState;

/// Workspace-relative folder where SFTP pulls cache each mod's XML
/// fragments (anything under `@ModName/` except `addons/` and
/// `keys/`). Populated on every pull so the Mods page can preview
/// available CE files offline.
pub const MOD_CE_CACHE_DIR: &str = ".dzmgr/mod-ce-cache";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum KnownModKind {
    TraderPlus,
    Expansion,
    DrJones,
    CommunityFramework,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModInfo {
    /// Canonical display name — `@`-prefix stripped from the folder
    /// name, or the CE folder name when we have no folder on disk.
    pub name: String,
    /// Original folder name (with `@` prefix) when detected on disk.
    /// Empty when the mod is only known via CE registration.
    pub folder_name: String,
    /// Absolute path on disk, or empty for SFTP-only detection.
    pub path: String,
    /// Number of `.pbo` addons found anywhere under the mod folder.
    pub addon_count: usize,
    /// Number of `.bikey` entries in `<root>/keys/` whose name case-
    /// insensitively contains the mod's display name. Best-effort.
    pub bikey_count: usize,
    /// Categorisation so the UI can surface "editor coming" hints
    /// for mods we know how to configure.
    pub known: KnownModKind,
    /// CE folder(s) this mod registers in `cfgeconomycore.xml`. Often
    /// empty for mods that don't extend the Central Economy (UI-only
    /// mods, script-only mods, etc.).
    pub ce_folders: Vec<String>,
    /// Summary of CE-importable XML fragments shipped in the mod's
    /// own folder (typically under `@ModName/files/`). `None` when
    /// nothing was found or the folder wasn't accessible. Used by
    /// the Mods page to nudge users toward the Import flow for mods
    /// that haven't been registered yet.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ce_availability: Option<ModCeAvailability>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModCeAvailability {
    /// Total CE-importable files found in the mod folder.
    pub file_count: usize,
    /// Sum of `<type>` records across every `types` file shipped by
    /// this mod. Zero for mods that only add events / spawnables /
    /// presets.
    pub types_record_count: usize,
    /// Per-kind breakdown for the UI summary, e.g. `{"types": 12,
    /// "spawnabletypes": 3}`.
    pub by_kind: HashMap<String, usize>,
    /// Absolute local filesystem path the [`ce_import_scan`] command
    /// can hand to the existing import flow. For local-mode profiles
    /// this is the mod folder on disk; for SFTP profiles it's the
    /// workspace-cached copy under `.dzmgr/mod-ce-cache/<ModName>`.
    pub source_path: String,
    /// True when we think this mod's CE fragments are already
    /// registered in `cfgeconomycore.xml` — rough heuristic based on
    /// having at least one CE folder registered for this mod.
    pub already_registered: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModsScan {
    /// Sorted by display name. SFTP profiles still see full addon /
    /// key counts — the pull now enumerates the remote server's
    /// `@*` folders and `keys/*.bikey` files and saves the inventory
    /// under `.dzmgr/remote-mods.json` so this scan works offline.
    pub mods: Vec<ModInfo>,
    /// CE folders we found in `cfgeconomycore.xml` that don't
    /// resolve to any mod — typical for hand-authored custom
    /// overrides the user added manually.
    pub orphan_ce_folders: Vec<String>,
    /// DayZ-Expansion sub-module inventory, if the server's profile
    /// folder contains an `ExpansionMod/` settings tree. Per-sub-mod
    /// editors will dispatch on these names in a future release.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expansion: Option<ExpansionInventory>,
    /// Source of the disk-mod inventory we merged with CE folders.
    /// Useful for the UI when it needs to hint that the workspace
    /// cache is stale (pull again) or that nothing is on record yet.
    pub inventory_source: InventorySource,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum InventorySource {
    /// Local-mode profile: scanner read live files off the disk.
    LocalDisk,
    /// SFTP-mode profile: scanner read the snapshot written by the
    /// last pull.
    RemoteSnapshot,
    /// SFTP-mode profile, no snapshot on disk — the workspace hasn't
    /// been pulled since the feature landed. UI shows a "pull to see
    /// full mod list" hint. Falls back to CE-folders only.
    Missing,
}

/// One per-sub-module settings file — e.g. `CoreSettings.json`,
/// `AISettings.json`, `MarketSettings.json` — living directly in
/// `ExpansionMod/Settings/`. Each is an editable JSON document with a
/// flat PascalCase schema and an `m_Version` field. These are the
/// primary Expansion config files operators tune.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpansionSettingsFile {
    /// Short display name derived from the file stem —
    /// `"CoreSettings.json"` → `"Core"`. Falls back to the full stem
    /// when the file doesn't end with `Settings`.
    pub name: String,
    /// Raw filename with extension — e.g. `CoreSettings.json`.
    pub file_name: String,
    /// Workspace-relative forward-slashed path — e.g.
    /// `profiles/ExpansionMod/Settings/CoreSettings.json`.
    pub relative_path: String,
    pub size_bytes: u64,
}

/// A data folder under `ExpansionMod/` that is NOT `Settings/` — e.g.
/// `AI/`, `Market/`, `Quests/`, `Traders/`. These hold content that
/// needs dedicated editors (trader price tables, quest definitions,
/// AI patrol patterns). For now they're read-only inventory.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpansionDataFolder {
    /// Folder name under `ExpansionMod/` — e.g. `Market`, `Quests`.
    pub name: String,
    /// Workspace-relative path.
    pub relative_path: String,
    /// Total `.json` files under the folder (recursive).
    pub file_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpansionInventory {
    /// Workspace-relative path to the Expansion settings root —
    /// `profiles/ExpansionMod`. Always set; inventory exists only
    /// when this folder is present.
    pub settings_root: String,
    /// Editable per-sub-module settings files. Sorted by display
    /// name.
    pub settings_files: Vec<ExpansionSettingsFile>,
    /// Content / data folders under `ExpansionMod/` other than
    /// `Settings/`. Sorted alphabetically.
    pub data_folders: Vec<ExpansionDataFolder>,
    /// Settings / config files sitting directly in `ExpansionMod/`
    /// (not under `Settings/` or a data folder). Some Expansion
    /// versions park shared JSON here.
    pub top_level_files: usize,
}

#[tauri::command]
pub async fn mods_scan(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<ModsScan> {
    let profile = {
        let store = state.profiles.lock().await;
        store.get(&id)?
    };
    let workspace = state.workspace_for(&id);
    if !workspace.exists() {
        return Err(AppError::Sync(
            "workspace does not exist — pull first".into(),
        ));
    }
    let ctx = MissionContext::resolve(&workspace, &profile)?;

    // --- CE folders from cfgeconomycore.xml ---------------------
    let cfg = EconomyCore::parse_file(&ctx.cfgeconomycore_path)?;
    let blocks = cfg.ce_blocks();
    // `custom` is the user's hand-authored override folder and gets
    // a special sort slot everywhere else in the app; don't count
    // it as a mod.
    let ce_folders: Vec<String> = blocks
        .into_iter()
        .map(|b| b.folder)
        .filter(|f| !f.eq_ignore_ascii_case("custom"))
        .collect();

    // --- Disk / remote-snapshot mod inventory --------------------
    // Local profiles scan the live disk; SFTP profiles read the
    // snapshot the last pull wrote into `.dzmgr/remote-mods.json`.
    // Either way we end up with the same shape so merging with CE
    // folders works identically.
    let (disk_mods, inventory_source) = match profile.mode {
        ConnectionMode::Local => {
            let root = profile
                .local
                .as_ref()
                .and_then(|l| Some(PathBuf::from(&l.root_path)))
                .filter(|p| p.exists());
            let mods = root.map(|p| scan_disk_mods(&p)).unwrap_or_default();
            (mods, InventorySource::LocalDisk)
        }
        ConnectionMode::Sftp => match sftp::load_remote_mods(&workspace) {
            Some(inv) => (disk_mods_from_remote(&inv), InventorySource::RemoteSnapshot),
            None => (Vec::new(), InventorySource::Missing),
        },
    };

    // --- Merge ---------------------------------------------------
    let mut mods = merge_scan(&disk_mods, &ce_folders);

    // --- Per-mod CE file availability ----------------------------
    // For each mod, check whether its own folder ships types /
    // events / spawnabletypes fragments. Prefer the live disk path
    // in local mode; fall back to the workspace CE cache populated
    // by the most recent SFTP pull.
    for m in &mut mods {
        m.ce_availability = scan_mod_ce_availability(&workspace, m);
    }

    // --- DayZ-Expansion sub-mod inventory -----------------------
    // Read from the workspace, which holds whatever was last pulled,
    // so this works in both local AND SFTP mode. `ExpansionMod/`
    // sits under the server's profiles folder on standard installs.
    let expansion = scan_expansion_submodules(&workspace, &profile.paths.profiles_relative);

    // Orphan = CE folder with no matching mod. Works the same in
    // both modes now that the inventory is complete.
    let orphan_ce_folders: Vec<String> = ce_folders
        .iter()
        .filter(|f| !mods.iter().any(|m| m.ce_folders.iter().any(|cf| cf == *f)))
        .cloned()
        .collect();

    Ok(ModsScan {
        mods,
        orphan_ce_folders,
        expansion,
        inventory_source,
    })
}

/// Translate the pull-time remote snapshot into the `DiskMod` shape
/// that `merge_scan` already understands. Paths are kept verbatim —
/// the UI shows them with a "remote" qualifier so users know these
/// aren't local.
fn disk_mods_from_remote(inv: &sftp::RemoteModInventory) -> Vec<DiskMod> {
    inv.mods
        .iter()
        .map(|m| {
            let display_name = m.folder_name.trim_start_matches('@').to_string();
            let mod_lc = display_name.to_ascii_lowercase();
            let bikey_count = inv
                .bikey_names
                .iter()
                .filter(|k| {
                    k.starts_with(&mod_lc)
                        || k.contains(&mod_lc)
                        || mod_lc.contains(k.as_str())
                })
                .count();
            DiskMod {
                folder_name: m.folder_name.clone(),
                display_name,
                path: PathBuf::from(&m.remote_path),
                addon_count: m.pbo_count,
                bikey_count,
            }
        })
        .collect()
}

// ---------- Disk enumeration ----------

struct DiskMod {
    folder_name: String,
    display_name: String,
    path: PathBuf,
    addon_count: usize,
    bikey_count: usize,
}

fn scan_disk_mods(root: &Path) -> Vec<DiskMod> {
    let Ok(rd) = std::fs::read_dir(root) else {
        return Vec::new();
    };

    // Collect bikey file basenames (lowercase, without `.bikey`) once
    // so the per-mod loop below is cheap.
    let bikey_names = list_bikey_names(&root.join("keys"));

    let mut out = Vec::new();
    for entry in rd.flatten() {
        let Ok(ft) = entry.file_type() else { continue };
        if !ft.is_dir() {
            continue;
        }
        let folder_name = entry.file_name().to_string_lossy().into_owned();
        if !folder_name.starts_with('@') {
            continue;
        }
        let display_name = folder_name.trim_start_matches('@').to_string();
        let path = entry.path();
        let addon_count = count_pbos(&path);
        let bikey_count = bikey_names
            .iter()
            .filter(|k| {
                // Loose match: the key's filename commonly contains a
                // version suffix (e.g. `@CF_1_32_0.bikey`). We accept
                // any bikey whose stem starts with the mod's display
                // name, case-insensitive.
                let mod_lc = display_name.to_ascii_lowercase();
                k.starts_with(&mod_lc)
                    || k.contains(&mod_lc)
                    || mod_lc.contains(k.as_str())
            })
            .count();
        out.push(DiskMod {
            folder_name,
            display_name,
            path,
            addon_count,
            bikey_count,
        });
    }
    out
}

fn count_pbos(dir: &Path) -> usize {
    let mut count = 0;
    for entry in walkdir::WalkDir::new(dir)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            if entry
                .path()
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| s.eq_ignore_ascii_case("pbo"))
                .unwrap_or(false)
            {
                count += 1;
            }
        }
    }
    count
}

fn list_bikey_names(keys_dir: &Path) -> Vec<String> {
    let Ok(rd) = std::fs::read_dir(keys_dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in rd.flatten() {
        let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
        if let Some(stem) = name.strip_suffix(".bikey") {
            out.push(stem.to_string());
        }
    }
    out
}

// ---------- DayZ-Expansion inventory ----------

/// Scan `<workspace>/<profiles_relative>/ExpansionMod/` and split
/// the tree into editable settings files (`Settings/*Settings.json`
/// and similar at the top-level) plus content-data folders (`AI/`,
/// `Market/`, `Quests/`, `Traders/`, …). Returns `None` when the
/// folder is absent — either Expansion isn't installed, or the
/// workspace hasn't been pulled yet.
fn scan_expansion_submodules(
    workspace: &Path,
    profiles_relative: &str,
) -> Option<ExpansionInventory> {
    let root = workspace.join(profiles_relative).join("ExpansionMod");
    if !root.is_dir() {
        return None;
    }
    let profiles_trim = profiles_relative.trim_end_matches('/');
    let rel_prefix = format!("{profiles_trim}/ExpansionMod");

    let mut settings_files: Vec<ExpansionSettingsFile> = Vec::new();
    let mut data_folders: Vec<ExpansionDataFolder> = Vec::new();
    let mut top_level_files = 0usize;

    // Settings/ subfolder — canonical home of *Settings.json files.
    let settings_dir = root.join("Settings");
    if settings_dir.is_dir() {
        if let Ok(rd) = std::fs::read_dir(&settings_dir) {
            for entry in rd.flatten() {
                let file_name = entry.file_name().to_string_lossy().into_owned();
                if !file_name.to_ascii_lowercase().ends_with(".json") {
                    continue;
                }
                let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                settings_files.push(ExpansionSettingsFile {
                    name: display_name_from_settings_file(&file_name),
                    relative_path: format!("{rel_prefix}/Settings/{file_name}"),
                    file_name,
                    size_bytes: size,
                });
            }
        }
    }
    settings_files
        .sort_by(|a, b| a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase()));

    // Top-level children other than Settings/ — data folders + loose files.
    if let Ok(rd) = std::fs::read_dir(&root) {
        for entry in rd.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.eq_ignore_ascii_case("Settings") {
                continue;
            }
            match entry.file_type() {
                Ok(ft) if ft.is_dir() => {
                    let rel = format!("{rel_prefix}/{name}");
                    data_folders.push(ExpansionDataFolder {
                        name,
                        relative_path: rel,
                        file_count: count_json_files(&entry.path()),
                    });
                }
                Ok(ft) if ft.is_file() => {
                    if name.to_ascii_lowercase().ends_with(".json") {
                        top_level_files += 1;
                    }
                }
                _ => {}
            }
        }
    }
    data_folders
        .sort_by(|a, b| a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase()));

    Some(ExpansionInventory {
        settings_root: rel_prefix,
        settings_files,
        data_folders,
        top_level_files,
    })
}

/// `"CoreSettings.json"` → `"Core"`, `"AISettings.json"` → `"AI"`.
/// Falls back to the whole stem when the file doesn't end with
/// `Settings`.
fn display_name_from_settings_file(file_name: &str) -> String {
    let stem = file_name.strip_suffix(".json").unwrap_or(file_name);
    stem.strip_suffix("Settings")
        .filter(|s| !s.is_empty())
        .unwrap_or(stem)
        .to_string()
}

// ---------- Per-mod CE availability ----------

/// Pick the best-available local filesystem root for a mod's CE
/// fragments and delegate to `mission::import::scan`. Returns
/// `None` when no root exists or the scan finds no CE-importable
/// files.
fn scan_mod_ce_availability(workspace: &Path, mod_info: &ModInfo) -> Option<ModCeAvailability> {
    let source = pick_mod_source(workspace, mod_info)?;
    let plan = ce_import_mod::scan(&source).ok()?;
    if plan.importable_count == 0 {
        return None;
    }

    let mut by_kind: HashMap<String, usize> = HashMap::new();
    let mut types_records = 0usize;
    for f in &plan.files {
        if !f.importable {
            continue;
        }
        *by_kind.entry(f.kind_label.to_string()).or_insert(0) += 1;
        if matches!(f.kind, CeFileKind::Types) {
            types_records += f.record_count;
        }
    }

    Some(ModCeAvailability {
        file_count: plan.importable_count,
        types_record_count: types_records,
        by_kind,
        source_path: source.to_string_lossy().into_owned(),
        already_registered: !mod_info.ce_folders.is_empty(),
    })
}

/// Try several locations for a mod's CE content, in order:
/// 1. Live mod folder on disk (local-mode profiles have this).
/// 2. The workspace cache populated by SFTP pull
///    (`<workspace>/.dzmgr/mod-ce-cache/<ModName>/`).
/// Returns the first path that exists and is a directory.
fn pick_mod_source(workspace: &Path, mod_info: &ModInfo) -> Option<PathBuf> {
    if !mod_info.path.is_empty() {
        let p = PathBuf::from(&mod_info.path);
        if p.is_dir() {
            return Some(p);
        }
    }
    if !mod_info.folder_name.is_empty() {
        let cached = workspace
            .join(MOD_CE_CACHE_DIR)
            .join(&mod_info.folder_name);
        if cached.is_dir() {
            return Some(cached);
        }
    }
    None
}

fn count_json_files(dir: &Path) -> usize {
    walkdir::WalkDir::new(dir)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| s.eq_ignore_ascii_case("json"))
                .unwrap_or(false)
        })
        .count()
}

// ---------- DayZ-Expansion: read / write single settings file ----------

#[tauri::command]
pub async fn expansion_settings_read(
    id: String,
    relative_path: String,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let profile = {
        let store = state.profiles.lock().await;
        store.get(&id)?
    };
    let workspace = state.workspace_for(&id);
    let full = resolve_expansion_path(&workspace, &profile.paths.profiles_relative, &relative_path)?;
    std::fs::read_to_string(&full).map_err(Into::into)
}

#[tauri::command]
pub async fn expansion_settings_write(
    id: String,
    relative_path: String,
    content: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let profile = {
        let store = state.profiles.lock().await;
        store.get(&id)?
    };
    // Validate JSON round-trip before writing so we don't commit a
    // syntactically broken settings file that would crash the DayZ
    // server on next boot. We don't care about shape — just that it
    // parses — because the server does the schema check itself.
    let parsed: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| AppError::InvalidProfile(format!("invalid JSON: {e}")))?;
    if !parsed.is_object() {
        return Err(AppError::InvalidProfile(
            "top-level value must be a JSON object".into(),
        ));
    }

    let workspace = state.workspace_for(&id);
    let full = resolve_expansion_path(&workspace, &profile.paths.profiles_relative, &relative_path)?;
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&full, &content)?;

    // Auto-commit under the workspace, same pattern as the typed
    // editors. Commit message names the file so `git log` stays
    // useful.
    let filename = std::path::Path::new(&relative_path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("settings.json");
    crate::git_ops::ensure_repo(&workspace)?;
    crate::git_ops::commit_all(
        &workspace,
        &format!("edit(expansion): {filename}"),
    )?;
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpansionDirEntry {
    /// Workspace-relative forward-slashed path — suitable to pass
    /// back to `expansion_list_dir` / `expansion_settings_read`.
    pub relative_path: String,
    /// Last path component.
    pub name: String,
    /// `true` for a directory, `false` for a file.
    pub is_dir: bool,
    /// 0 for directories.
    pub size_bytes: u64,
    /// JSON files get an extra `.json` hint in the UI; other files
    /// are greyed-out and non-editable. Directories are null.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extension: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpansionDirListing {
    /// Canonical forward-slashed relative path of the directory we
    /// just listed. Useful for breadcrumb rendering when the caller
    /// passed e.g. a trailing slash.
    pub relative_path: String,
    pub entries: Vec<ExpansionDirEntry>,
}

/// List one directory under `ExpansionMod/`. Used by the Expansion
/// data browser so the user can drill into `Market/`, `Traders/`,
/// `Quests/*/`, etc. without leaving the app. Sandboxed exactly the
/// same way as the read / write commands.
#[tauri::command]
pub async fn expansion_list_dir(
    id: String,
    relative_path: String,
    state: State<'_, AppState>,
) -> AppResult<ExpansionDirListing> {
    let profile = {
        let store = state.profiles.lock().await;
        store.get(&id)?
    };
    let workspace = state.workspace_for(&id);
    let full = resolve_expansion_path(
        &workspace,
        &profile.paths.profiles_relative,
        &relative_path,
    )?;
    if !full.is_dir() {
        return Err(AppError::InvalidProfile(format!(
            "not a directory: {relative_path}"
        )));
    }

    let mut entries = Vec::new();
    let rd = std::fs::read_dir(&full)?;
    for entry in rd.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let rel = format!(
            "{}/{}",
            relative_path.trim_end_matches('/'),
            name
        );
        let extension = entry
            .path()
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_ascii_lowercase());
        entries.push(ExpansionDirEntry {
            relative_path: rel,
            name,
            is_dir: meta.is_dir(),
            size_bytes: if meta.is_file() { meta.len() } else { 0 },
            extension,
        });
    }

    // Directories first, then files, each block alphabetical.
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase()),
    });

    Ok(ExpansionDirListing {
        relative_path: relative_path.trim_end_matches('/').to_string(),
        entries,
    })
}

/// Sandbox `relative_path` to the workspace's `ExpansionMod/` tree so
/// the read/write commands can't stray outside. Rejects `..`,
/// absolute paths, and anything pointing above the settings root.
fn resolve_expansion_path(
    workspace: &Path,
    profiles_relative: &str,
    relative_path: &str,
) -> AppResult<PathBuf> {
    if relative_path.contains("..") {
        return Err(AppError::InvalidProfile(
            "relative path must not contain `..`".into(),
        ));
    }
    let profiles_trim = profiles_relative.trim_end_matches('/');
    let expansion_root = format!("{profiles_trim}/ExpansionMod");
    let expected_prefix = format!("{expansion_root}/");
    let norm = relative_path.trim_end_matches('/').replace('\\', "/");
    // Accept either the root itself (so the browser can list top-level
    // folders) or anything inside it.
    if norm != expansion_root && !norm.starts_with(&expected_prefix) {
        return Err(AppError::InvalidProfile(format!(
            "path must live under {expected_prefix}"
        )));
    }
    Ok(workspace.join(&norm))
}

// ---------- Known-mod classification ----------

fn classify(display_name: &str, ce_folders: &[String]) -> KnownModKind {
    let name = display_name.to_ascii_lowercase();
    let mut corpus = name.clone();
    for f in ce_folders {
        corpus.push(' ');
        corpus.push_str(&f.to_ascii_lowercase());
    }
    // Check the longer / more specific patterns first so we don't
    // misclassify a mod that just happens to contain a substring.
    if corpus.contains("traderplus") || corpus.contains("trader_plus") {
        return KnownModKind::TraderPlus;
    }
    if corpus.contains("expansion") {
        return KnownModKind::Expansion;
    }
    if corpus.contains("communityframework")
        || name == "cf"
        || corpus.contains("community-framework")
        || corpus.contains("community_framework")
    {
        return KnownModKind::CommunityFramework;
    }
    // Dr Jones' classic trader is usually just `@Trader` (no plus
    // suffix). Matching is looser — if the folder name is exactly
    // "trader" (not traderplus) OR CE folders include `Trader` as a
    // standalone.
    if name == "trader" || ce_folders.iter().any(|f| f.eq_ignore_ascii_case("Trader")) {
        return KnownModKind::DrJones;
    }
    KnownModKind::Other
}

// ---------- Merge ----------

/// Merge disk mods with CE folders. Each disk mod claims any CE
/// folder whose name matches its display name case-insensitively,
/// or whose name is contained in the mod's name (or vice-versa).
/// CE folders that match none of the disk mods become synthetic
/// entries (CE-only mods) OR end up in the orphan list — the caller
/// decides based on profile mode.
fn merge_scan(disk: &[DiskMod], ce_folders: &[String]) -> Vec<ModInfo> {
    // Disk-first index: each disk mod starts out with its own CE
    // folder list; we assign CE folders below.
    let mut taken: HashMap<&str, bool> = ce_folders
        .iter()
        .map(|s| (s.as_str(), false))
        .collect();

    let mut mods: Vec<ModInfo> = disk
        .iter()
        .map(|d| {
            let mut ce_for: Vec<String> = Vec::new();
            for f in ce_folders {
                if taken.get(f.as_str()).copied().unwrap_or(false) {
                    continue;
                }
                if ce_matches_mod(f, &d.display_name) {
                    ce_for.push(f.clone());
                    taken.insert(f.as_str(), true);
                }
            }
            let known = classify(&d.display_name, &ce_for);
            ModInfo {
                name: d.display_name.clone(),
                folder_name: d.folder_name.clone(),
                path: d.path.to_string_lossy().into_owned(),
                addon_count: d.addon_count,
                bikey_count: d.bikey_count,
                known,
                ce_folders: ce_for,
                ce_availability: None,
            }
        })
        .collect();

    // Any CE folder still not claimed: a CE-only mod. Surface it as a
    // ModInfo with zero addon / bikey counts so the UI can still show
    // it (and the Orphan detection can decide what to do).
    for f in ce_folders {
        if !taken.get(f.as_str()).copied().unwrap_or(false) {
            let known = classify(f, std::slice::from_ref(f));
            mods.push(ModInfo {
                name: f.clone(),
                folder_name: String::new(),
                path: String::new(),
                addon_count: 0,
                bikey_count: 0,
                known,
                ce_folders: vec![f.clone()],
                ce_availability: None,
            });
        }
    }

    mods.sort_by(|a, b| a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase()));
    mods
}

/// Best-effort CE-folder → mod match. We don't require exact names
/// because mods pick wildly inconsistent folder conventions (e.g.
/// @DayZ-Expansion registers a bunch of CE folders with names like
/// `ExpansionCoreData`, `DZE_Food`, etc.).
fn ce_matches_mod(ce_folder: &str, mod_name: &str) -> bool {
    let ce = ce_folder.to_ascii_lowercase();
    let m = mod_name.to_ascii_lowercase();
    if ce == m {
        return true;
    }
    // Split mod display name into word-ish pieces and match on any.
    let pieces: Vec<&str> = m
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|p| p.len() >= 3)
        .collect();
    if pieces.is_empty() {
        return ce.contains(&m) || m.contains(&ce);
    }
    pieces.iter().any(|p| ce.contains(p))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn touch(path: &Path) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, b"").unwrap();
    }

    #[test]
    fn scan_disk_enumerates_at_mod_folders_with_pbo_counts() {
        let td = TempDir::new().unwrap();
        let root = td.path();
        touch(&root.join("@TraderPlus/addons/traderplus.pbo"));
        touch(&root.join("@TraderPlus/addons/traderplus_gui.pbo"));
        touch(&root.join("@CF/Addons/CF.pbo"));
        touch(&root.join("keys/traderplus.bikey"));
        touch(&root.join("keys/CF_1_32_0.bikey"));
        // Non-mod dirs must be skipped.
        fs::create_dir_all(root.join("mpmissions")).unwrap();
        fs::create_dir_all(root.join("keys")).unwrap();

        let mods = scan_disk_mods(root);
        let by_name: HashMap<_, _> =
            mods.iter().map(|m| (m.display_name.as_str(), m)).collect();
        assert_eq!(by_name.get("TraderPlus").unwrap().addon_count, 2);
        assert_eq!(by_name.get("TraderPlus").unwrap().bikey_count, 1);
        assert_eq!(by_name.get("CF").unwrap().addon_count, 1);
        // CF_1_32_0.bikey contains "cf" → matches.
        assert!(by_name.get("CF").unwrap().bikey_count >= 1);
    }

    #[test]
    fn classify_known_mods() {
        assert_eq!(
            classify("TraderPlus", &[]),
            KnownModKind::TraderPlus,
        );
        assert_eq!(
            classify("DayZ-Expansion-Core", &[]),
            KnownModKind::Expansion,
        );
        assert_eq!(
            classify("CF", &[]),
            KnownModKind::CommunityFramework,
        );
        assert_eq!(
            classify("Trader", &["Trader".to_string()]),
            KnownModKind::DrJones,
        );
        assert_eq!(
            classify("SomeRandomMod", &[]),
            KnownModKind::Other,
        );
    }

    #[test]
    fn merge_attaches_ce_folders_to_matching_disk_mod() {
        let disk = vec![DiskMod {
            folder_name: "@TraderPlus".into(),
            display_name: "TraderPlus".into(),
            path: PathBuf::from("/fake/@TraderPlus"),
            addon_count: 2,
            bikey_count: 1,
        }];
        let ce = vec![
            "TraderPlus".to_string(),
            "TraderPlusData".to_string(),
            "SomethingUnrelated".to_string(),
        ];
        let merged = merge_scan(&disk, &ce);
        // TraderPlus gets both CE folders whose names contain
        // `traderplus`; SomethingUnrelated becomes its own entry.
        let tp = merged.iter().find(|m| m.name == "TraderPlus").unwrap();
        assert_eq!(tp.ce_folders.len(), 2);
        assert_eq!(tp.known, KnownModKind::TraderPlus);
        assert!(merged.iter().any(|m| m.name == "SomethingUnrelated"));
    }

    #[test]
    fn ce_only_mod_shows_up_with_zero_disk_stats() {
        let merged = merge_scan(&[], &["HardcoreMod".to_string()]);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].name, "HardcoreMod");
        assert_eq!(merged[0].addon_count, 0);
        assert_eq!(merged[0].folder_name, "");
    }

    #[test]
    fn scan_expansion_splits_settings_and_data_folders() {
        let td = TempDir::new().unwrap();
        let ws = td.path();
        // Settings files — each maps to a sub-module in the UI.
        touch(&ws.join("profiles/ExpansionMod/Settings/CoreSettings.json"));
        touch(&ws.join("profiles/ExpansionMod/Settings/AISettings.json"));
        touch(&ws.join("profiles/ExpansionMod/Settings/MarketSettings.json"));
        // Data folders with content JSON.
        touch(&ws.join("profiles/ExpansionMod/Market/Ammo.json"));
        touch(&ws.join("profiles/ExpansionMod/Market/Boats.json"));
        touch(&ws.join("profiles/ExpansionMod/Quests/Quests/Q1.json"));
        touch(&ws.join("profiles/ExpansionMod/Traders/Clothing.json"));
        // Noise at root.
        touch(&ws.join("profiles/ExpansionMod/README.md"));
        touch(&ws.join("profiles/ExpansionMod/shared-notes.json"));

        let inv = scan_expansion_submodules(ws, "profiles").unwrap();
        assert_eq!(inv.settings_root, "profiles/ExpansionMod");
        assert_eq!(inv.top_level_files, 1);

        let setting_names: Vec<_> =
            inv.settings_files.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(setting_names, vec!["AI", "Core", "Market"]);
        assert!(inv
            .settings_files
            .iter()
            .all(|s| s.relative_path.starts_with("profiles/ExpansionMod/Settings/")));

        let folder_names: Vec<_> =
            inv.data_folders.iter().map(|d| d.name.as_str()).collect();
        assert_eq!(folder_names, vec!["Market", "Quests", "Traders"]);
        let by_folder: HashMap<_, _> = inv
            .data_folders
            .iter()
            .map(|d| (d.name.as_str(), d))
            .collect();
        assert_eq!(by_folder.get("Market").unwrap().file_count, 2);
        assert_eq!(by_folder.get("Quests").unwrap().file_count, 1);
    }

    #[test]
    fn display_name_strips_settings_suffix() {
        assert_eq!(display_name_from_settings_file("CoreSettings.json"), "Core");
        assert_eq!(display_name_from_settings_file("AISettings.json"), "AI");
        assert_eq!(
            display_name_from_settings_file("MarketSettings.json"),
            "Market"
        );
        // File with no Settings suffix keeps the whole stem.
        assert_eq!(
            display_name_from_settings_file("MapDataConfig.json"),
            "MapDataConfig"
        );
    }

    #[test]
    fn scan_expansion_returns_none_when_folder_missing() {
        let td = TempDir::new().unwrap();
        let inv = scan_expansion_submodules(td.path(), "profiles");
        assert!(inv.is_none());
    }

    #[test]
    fn disk_mods_without_ce_still_listed() {
        let disk = vec![DiskMod {
            folder_name: "@UiTweaks".into(),
            display_name: "UiTweaks".into(),
            path: PathBuf::from("/fake"),
            addon_count: 1,
            bikey_count: 0,
        }];
        let merged = merge_scan(&disk, &[]);
        assert_eq!(merged.len(), 1);
        assert!(merged[0].ce_folders.is_empty());
    }
}
