//! "Import mod CE files" pipeline.
//!
//! A mod typically ships a `files/` folder with per-category XML
//! subfolders (e.g. MMG: `files/types/Types.xml`,
//! `files/spawnabletypes/Spawnable.xml`). The recommended way to load
//! them on the server is to copy the files into the mission folder and
//! register each one in `cfgeconomycore.xml` — never to paste contents
//! into vanilla files.
//!
//! This module does both sides of that transaction:
//!   1. `scan` walks a source directory, detects CE file kinds, and
//!      returns a preview plan.
//!   2. `apply` copies selected files into a destination folder under
//!      the mission root and updates `cfgeconomycore.xml` with the
//!      matching `<ce folder="…"><file … type="…"/></ce>` blocks.
//!
//! Anything the app doesn't recognise as a CE file is skipped by
//! default — the user can still toggle it on if they know what they're
//! doing.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

use crate::error::{AppError, AppResult};
use crate::parsers::cfg_economy_core::{CeFile, EconomyCore};
use crate::parsers::detect::{self, CeFileKind, ClassificationSignal};

use super::MissionContext;

/// Default destination-folder name proposal: snake-case of the source
/// folder name, with `_ce` suffix to avoid collisions with a mod's raw
/// asset folder.
pub fn default_dest_folder(source: &Path) -> String {
    let stem = source
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("mod");
    let base = sanitize_folder_name(stem);
    if base == "files" {
        // Very common: user picked the generic `files/` folder. Try the
        // parent (usually the mod name) instead.
        if let Some(parent) = source.parent() {
            if let Some(name) = parent.file_name().and_then(|s| s.to_str()) {
                return format!("{}_ce", sanitize_folder_name(name));
            }
        }
    }
    if base.is_empty() {
        "mod_ce".into()
    } else {
        format!("{base}_ce")
    }
}

fn sanitize_folder_name(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '_' })
        .collect::<String>()
        .trim_matches('_')
        .to_string()
}

// ---------- Scan ----------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedFile {
    /// Workspace-agnostic absolute source path.
    pub source_path: String,
    /// Path relative to the source root, forward-slash-joined. This is
    /// what we preserve under the destination folder.
    pub relative_path: String,
    pub kind: CeFileKind,
    pub kind_label: &'static str,
    pub importable: bool,
    pub size_bytes: u64,
    /// For `<types>` files, count of top-level `<type>` records. 0 for
    /// other kinds (not yet parsed).
    pub record_count: usize,
    /// How the classifier arrived at `kind`. Lets the UI flag
    /// `FilenameMismatch` cases ("this file is named `_types.xml`
    /// but contains `<events>` — import anyway?") without us having
    /// to duplicate the detection logic on the frontend.
    pub classification: ClassificationSignal,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPlan {
    pub source_root: String,
    pub suggested_dest_folder: String,
    pub files: Vec<ScannedFile>,
    /// Count of files the app knows how to register by default.
    pub importable_count: usize,
    /// Count of files whose kind is unknown (e.g. random readmes).
    pub unknown_count: usize,
}

pub fn scan(source: &Path) -> AppResult<ImportPlan> {
    if !source.exists() {
        return Err(AppError::Sync(format!(
            "source folder does not exist: {}",
            source.display()
        )));
    }
    if !source.is_dir() {
        return Err(AppError::Sync(format!(
            "source must be a folder: {}",
            source.display()
        )));
    }

    let mut files = Vec::new();
    for entry in WalkDir::new(source)
        .follow_links(false)
        .max_depth(6)
        .into_iter()
        .filter_map(|e| e.ok())
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
        if ext != "xml" {
            continue;
        }
        let rel = match p.strip_prefix(source) {
            Ok(r) => r.to_path_buf(),
            Err(_) => continue,
        };
        // Read once, classify filename + content together, reuse the
        // bytes for record counting. Saves a double file-read on
        // large types fragments without sacrificing the accurate
        // content signal.
        let fname = p
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or_default();
        let bytes = std::fs::read(p).ok();
        let (kind, classification) = match bytes.as_deref() {
            Some(b) => detect::classify(fname, b),
            None => (CeFileKind::Unknown, ClassificationSignal::Unknown),
        };
        let size = std::fs::metadata(p).map(|m| m.len()).unwrap_or(0);
        let record_count = if matches!(kind, CeFileKind::Types) {
            bytes
                .as_deref()
                .map(detect::count_types_records)
                .unwrap_or(0)
        } else {
            0
        };
        files.push(ScannedFile {
            source_path: p.to_string_lossy().into_owned(),
            relative_path: rel_slash(&rel),
            kind,
            kind_label: kind.label(),
            importable: kind.is_importable(),
            size_bytes: size,
            record_count,
            classification,
        });
    }

    files.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));

    let importable_count = files.iter().filter(|f| f.importable).count();
    let unknown_count = files
        .iter()
        .filter(|f| matches!(f.kind, CeFileKind::Unknown))
        .count();

    Ok(ImportPlan {
        source_root: source.to_string_lossy().into_owned(),
        suggested_dest_folder: default_dest_folder(source),
        files,
        importable_count,
        unknown_count,
    })
}

// ---------- Apply ----------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportRequest {
    pub source_root: String,
    pub dest_folder: String,
    /// Workspace-relative source paths the caller wants imported. Kinds
    /// whose `importable` is false are rejected server-side.
    pub relative_paths: Vec<String>,
    #[serde(default)]
    pub overwrite: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub imported_count: u32,
    pub skipped_count: u32,
    pub cfgeconomycore_updated: bool,
    pub dest_folder: String,
    /// One line per file, for display.
    pub entries: Vec<ImportEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportEntry {
    pub source: String,
    pub destination: String,
    pub kind: CeFileKind,
    pub status: ImportStatus,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ImportStatus {
    Imported,
    Skipped,
    Failed,
}

pub fn apply(ctx: &MissionContext, req: &ImportRequest) -> AppResult<ImportResult> {
    let source_root = PathBuf::from(&req.source_root);
    if !source_root.is_dir() {
        return Err(AppError::Sync(format!(
            "source root does not exist: {}",
            source_root.display()
        )));
    }
    let dest_folder = sanitize_folder_name(&req.dest_folder);
    if dest_folder.is_empty() {
        return Err(AppError::InvalidProfile(
            "destination folder name is required".into(),
        ));
    }
    let dest_root = ctx.mission_root.join(&dest_folder);
    std::fs::create_dir_all(&dest_root)?;

    let mut entries = Vec::new();
    let mut imported = 0u32;
    let mut skipped = 0u32;

    // Group by subdirectory under dest_folder so we emit one `<ce>` block
    // per physical folder — cfgeconomycore's preferred layout.
    let mut groups: BTreeMap<String, Vec<CeFile>> = BTreeMap::new();

    for rel in &req.relative_paths {
        let norm = rel.replace('\\', "/");
        let src_path = source_root.join(&norm);
        let dest_path = dest_root.join(&norm);

        if !src_path.exists() || !src_path.is_file() {
            entries.push(ImportEntry {
                source: src_path.to_string_lossy().into_owned(),
                destination: dest_path.to_string_lossy().into_owned(),
                kind: CeFileKind::Unknown,
                status: ImportStatus::Failed,
                message: Some("source file missing at apply time".into()),
            });
            skipped += 1;
            continue;
        }

        // Match scan's classifier so any file the preview marked
        // importable actually imports. Using `detect_file` here
        // (content-only) silently rejects files whose content parser
        // stumbles over BOMs or stray prologues even when the
        // filename clearly identifies them — the preview said yes
        // and apply said "unknown".
        let kind = detect::classify_path(&src_path)
            .map(|(k, _sig)| k)
            .unwrap_or(CeFileKind::Unknown);
        let type_attr = match kind.ce_type_attr() {
            Some(t) => t,
            None => {
                entries.push(ImportEntry {
                    source: src_path.to_string_lossy().into_owned(),
                    destination: dest_path.to_string_lossy().into_owned(),
                    kind,
                    status: ImportStatus::Skipped,
                    message: Some(format!("skipped (not a CE file: {})", kind.label())),
                });
                skipped += 1;
                continue;
            }
        };

        if dest_path.exists() && !req.overwrite {
            entries.push(ImportEntry {
                source: src_path.to_string_lossy().into_owned(),
                destination: dest_path.to_string_lossy().into_owned(),
                kind,
                status: ImportStatus::Skipped,
                message: Some("destination exists (enable overwrite to replace)".into()),
            });
            skipped += 1;
            continue;
        }

        if let Some(parent) = dest_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(&src_path, &dest_path)?;
        imported += 1;

        // Compute cfgeconomycore registration fields.
        let (subdir, filename) = split_subdir(&norm);
        let ce_folder = if subdir.is_empty() {
            dest_folder.clone()
        } else {
            format!("{dest_folder}/{subdir}")
        };
        groups
            .entry(ce_folder)
            .or_default()
            .push(CeFile {
                name: filename,
                file_type: type_attr.to_string(),
            });

        entries.push(ImportEntry {
            source: src_path.to_string_lossy().into_owned(),
            destination: dest_path.to_string_lossy().into_owned(),
            kind,
            status: ImportStatus::Imported,
            message: None,
        });
    }

    // Update cfgeconomycore.xml.
    let mut eco_doc = if ctx.cfgeconomycore_path.exists() {
        EconomyCore::parse_file(&ctx.cfgeconomycore_path)?
    } else {
        EconomyCore::empty()
    };
    let mut changed = false;
    for (folder, files) in &groups {
        if eco_doc.ensure_ce_block(folder, files) {
            changed = true;
        }
    }
    // Newly-imported mod blocks must not land *after* an existing
    // `<ce folder="custom">` — otherwise the mod's defaults would
    // overwrite any user overrides present. Keep custom last.
    if eco_doc.move_folder_to_end("custom") {
        changed = true;
    }
    if changed {
        eco_doc.write_file(&ctx.cfgeconomycore_path)?;
    }

    Ok(ImportResult {
        imported_count: imported,
        skipped_count: skipped,
        cfgeconomycore_updated: changed,
        dest_folder,
        entries,
    })
}

// ---------- List & uninstall ----------

/// A user-facing "mod import" — one per top-level folder registered in
/// `cfgeconomycore.xml`. A mod that spans multiple sub-blocks (e.g.
/// MMG with `mmg_ce/types` and `mmg_ce/spawnabletypes`) collapses into
/// one entry keyed by its top-level folder `mmg_ce`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CeImportEntry {
    pub folder_top: String,
    /// The `<ce folder="…">` blocks contributing to this group.
    pub blocks: Vec<CeBlockInfo>,
    /// Does `<mission>/<folder_top>/` exist on disk?
    pub mission_dir_exists: bool,
    pub total_files: u32,
    pub total_bytes: u64,
    /// Our own overrides folder — removing it wipes all user overrides,
    /// so the UI gates that destructively.
    pub is_custom: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CeBlockInfo {
    pub folder: String,
    pub files: Vec<CeFileStatus>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CeFileStatus {
    pub name: String,
    #[serde(rename = "fileType")]
    pub file_type: String,
    pub exists_on_disk: bool,
    pub size_bytes: u64,
}

pub fn list_ce_imports(ctx: &MissionContext) -> AppResult<Vec<CeImportEntry>> {
    if !ctx.cfgeconomycore_path.exists() {
        return Ok(Vec::new());
    }
    let eco = EconomyCore::parse_file(&ctx.cfgeconomycore_path)?;
    let blocks = eco.ce_blocks();

    let mut groups: BTreeMap<String, Vec<CeBlockInfo>> = BTreeMap::new();
    for b in blocks {
        let top = top_folder(&b.folder);
        let info = CeBlockInfo {
            folder: b.folder.clone(),
            files: b
                .files
                .into_iter()
                .map(|f| {
                    let rel = if b.folder.is_empty() {
                        f.name.clone()
                    } else {
                        format!("{}/{}", b.folder, f.name)
                    };
                    let path = ctx.mission_root.join(&rel);
                    let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                    CeFileStatus {
                        name: f.name,
                        file_type: f.file_type,
                        exists_on_disk: path.is_file(),
                        size_bytes: size,
                    }
                })
                .collect(),
        };
        groups.entry(top).or_default().push(info);
    }

    let mut out = Vec::new();
    for (top, blocks) in groups {
        let mission_dir = ctx.mission_root.join(&top);
        let total_files: u32 = blocks
            .iter()
            .map(|b| b.files.len() as u32)
            .sum();
        let total_bytes: u64 = blocks
            .iter()
            .flat_map(|b| b.files.iter())
            .map(|f| f.size_bytes)
            .sum();
        out.push(CeImportEntry {
            is_custom: top == "custom",
            mission_dir_exists: mission_dir.is_dir(),
            folder_top: top,
            blocks,
            total_files,
            total_bytes,
        });
    }

    // Custom comes last so the destructive option is visually de-emphasised.
    out.sort_by(|a, b| match (a.is_custom, b.is_custom) {
        (true, false) => std::cmp::Ordering::Greater,
        (false, true) => std::cmp::Ordering::Less,
        _ => a.folder_top.cmp(&b.folder_top),
    });
    Ok(out)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveImportRequest {
    pub folder_top: String,
    #[serde(default)]
    pub delete_files: bool,
    /// Extra guardrail for `custom/` — the UI sets this to true only
    /// after a secondary confirmation.
    #[serde(default)]
    pub allow_custom: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveImportResult {
    pub folder_top: String,
    pub blocks_removed: u32,
    pub files_deleted: u32,
    pub directory_removed: bool,
    pub cfgeconomycore_updated: bool,
}

pub fn remove_ce_import(
    ctx: &MissionContext,
    req: &RemoveImportRequest,
) -> AppResult<RemoveImportResult> {
    let top = sanitize_folder_name(&req.folder_top);
    if top.is_empty() {
        return Err(AppError::InvalidProfile(
            "folder name is required".into(),
        ));
    }
    if top == "custom" && !req.allow_custom {
        return Err(AppError::InvalidProfile(
            "removing the custom override folder requires explicit confirmation"
                .into(),
        ));
    }

    // Defense-in-depth: make sure the target directory is really inside
    // the mission root (no `..`, no absolute path escape).
    let mission_dir = ctx.mission_root.join(&top);
    let mission_canonical = ctx
        .mission_root
        .canonicalize()
        .unwrap_or_else(|_| ctx.mission_root.clone());
    let dir_canonical = mission_dir
        .canonicalize()
        .unwrap_or_else(|_| mission_dir.clone());
    if !dir_canonical.starts_with(&mission_canonical) {
        return Err(AppError::InvalidProfile(
            "target folder escapes the mission root".into(),
        ));
    }

    // 1. Update cfgeconomycore.xml: remove every <ce folder> where folder
    //    is `top` or begins with `top/`.
    let mut eco = if ctx.cfgeconomycore_path.exists() {
        EconomyCore::parse_file(&ctx.cfgeconomycore_path)?
    } else {
        EconomyCore::empty()
    };
    let top_prefix = format!("{top}/");
    let blocks_removed = eco.remove_ce_blocks(|folder| {
        folder == top || folder.starts_with(&top_prefix)
    });
    let cfg_updated = blocks_removed > 0;
    if cfg_updated {
        eco.write_file(&ctx.cfgeconomycore_path)?;
    }

    // 2. Optionally delete the on-disk files (the entire <mission>/<top>/ tree).
    let mut files_deleted = 0u32;
    let mut directory_removed = false;
    if req.delete_files && mission_dir.is_dir() {
        files_deleted = count_files(&mission_dir);
        std::fs::remove_dir_all(&mission_dir)?;
        directory_removed = true;
    }

    Ok(RemoveImportResult {
        folder_top: top,
        blocks_removed: blocks_removed as u32,
        files_deleted,
        directory_removed,
        cfgeconomycore_updated: cfg_updated,
    })
}

fn top_folder(folder: &str) -> String {
    folder
        .split('/')
        .next()
        .unwrap_or(folder)
        .to_string()
}

fn count_files(dir: &Path) -> u32 {
    WalkDir::new(dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .count() as u32
}

fn split_subdir(rel: &str) -> (String, String) {
    let parts: Vec<&str> = rel.split('/').collect();
    if parts.len() == 1 {
        return (String::new(), parts[0].to_string());
    }
    let filename = parts[parts.len() - 1].to_string();
    let subdir = parts[..parts.len() - 1].join("/");
    (subdir, filename)
}

fn rel_slash(path: &Path) -> String {
    path.components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn suggests_dest_folder_from_mod_name() {
        assert_eq!(default_dest_folder(Path::new("C:/mods/MMG")), "mmg_ce");
        assert_eq!(default_dest_folder(Path::new("C:/mods/MMG/files")), "mmg_ce");
    }

    #[test]
    fn splits_subdir_correctly() {
        assert_eq!(split_subdir("types/Foo.xml"), ("types".into(), "Foo.xml".into()));
        assert_eq!(split_subdir("Foo.xml"), (String::new(), "Foo.xml".into()));
        assert_eq!(
            split_subdir("a/b/c/File.xml"),
            ("a/b/c".into(), "File.xml".into())
        );
    }

    fn mk_ctx(workspace: &Path) -> MissionContext {
        let mission_root = workspace.join("mpmissions/m");
        std::fs::create_dir_all(&mission_root).unwrap();
        MissionContext {
            workspace: workspace.to_path_buf(),
            mission_root: mission_root.clone(),
            custom_dir: mission_root.join("custom"),
            db_dir: mission_root.join("db"),
            cfgeconomycore_path: mission_root.join("cfgeconomycore.xml"),
        }
    }

    #[test]
    fn apply_falls_back_to_filename_when_content_detection_returns_unknown() {
        // Hard guarantee that the filename fallback path works. We
        // write a file whose contents `detect_bytes` cannot read as
        // anything meaningful (no root element — just a prologue).
        // Without the fix, apply would reject both files as
        // "unknown" even though scan flagged them importable via
        // filename.
        let td = tempfile::TempDir::new().unwrap();
        let ws = td.path();
        let ctx = mk_ctx(ws);
        let src = ws.join("malformed_mod");
        std::fs::create_dir_all(&src).unwrap();
        // Only the XML declaration — no root element. `detect_bytes`
        // returns `Unknown` for this input (see the unit test in
        // parsers/detect.rs). Filename identifies it clearly.
        std::fs::write(
            src.join("events.xml"),
            b"<?xml version=\"1.0\"?>\n",
        )
        .unwrap();
        // Confirm our preconditions — content detection alone is
        // inadequate here, filename detection is the saving grace.
        let content_only =
            crate::parsers::detect::detect_bytes(b"<?xml version=\"1.0\"?>\n");
        assert_eq!(content_only, crate::parsers::detect::CeFileKind::Unknown);

        let req = ImportRequest {
            source_root: src.to_string_lossy().into_owned(),
            dest_folder: "broken_ce".into(),
            relative_paths: vec!["events.xml".into()],
            overwrite: false,
        };
        let result = apply(&ctx, &req).unwrap();
        assert_eq!(
            result.imported_count, 1,
            "classify_path's filename fallback should keep this file importable; entries = {:?}",
            result.entries
        );
        assert!(result.cfgeconomycore_updated);
    }

    #[test]
    fn apply_imports_files_whose_content_detection_stumbles_but_filename_is_clear()
     {
        // Regression: the preview (scan) uses filename-or-content.
        // Apply used to use content-only, which silently rejected any
        // file where quick_xml tripped on the first read — users saw
        // "events.xml imported" in the preview and "imported 0 files"
        // after pressing apply.
        //
        // Here we write an `events.xml` whose first bytes are a UTF-8
        // BOM before the XML prologue — plenty of text editors save
        // files this way. The content-only detector returns Unknown
        // on some quick_xml configurations; the filename is the
        // authoritative signal.
        let td = tempfile::TempDir::new().unwrap();
        let ws = td.path();
        let ctx = mk_ctx(ws);

        // Source folder with two files: one events, one types.
        let src = ws.join("src_mod");
        std::fs::create_dir_all(&src).unwrap();
        let mut bom_events: Vec<u8> = vec![0xEF, 0xBB, 0xBF];
        bom_events.extend_from_slice(
            br#"<?xml version="1.0"?>
<events>
    <event name="MyEvent"></event>
</events>
"#,
        );
        std::fs::write(src.join("events.xml"), &bom_events).unwrap();
        std::fs::write(
            src.join("types.xml"),
            br#"<?xml version="1.0"?>
<types>
    <type name="MyItem"><nominal>5</nominal></type>
</types>
"#,
        )
        .unwrap();

        let req = ImportRequest {
            source_root: src.to_string_lossy().into_owned(),
            dest_folder: "mymod_ce".into(),
            relative_paths: vec!["events.xml".into(), "types.xml".into()],
            overwrite: false,
        };
        let result = apply(&ctx, &req).unwrap();
        assert_eq!(
            result.imported_count, 2,
            "both files should import; entries = {:?}",
            result.entries
        );
        assert_eq!(result.skipped_count, 0);
        assert!(result.cfgeconomycore_updated);
        // Both files land under the new dest folder.
        assert!(ctx
            .mission_root
            .join("mymod_ce/events.xml")
            .is_file());
        assert!(ctx
            .mission_root
            .join("mymod_ce/types.xml")
            .is_file());
        // cfgeconomycore picked up a new <ce folder="mymod_ce"> block
        // with both file entries.
        let eco =
            std::fs::read_to_string(&ctx.cfgeconomycore_path).unwrap();
        assert!(eco.contains("folder=\"mymod_ce\""));
        assert!(eco.contains("name=\"events.xml\""));
        assert!(eco.contains("name=\"types.xml\""));
    }
}
