//! Unified ItemType registry: merges the vanilla `db/types.xml` with any
//! override / mod types-style files registered in `cfgeconomycore.xml`.
//!
//! Rules (PDR §9.1 "Override writing rule"):
//! - Vanilla `db/types.xml` is **never written**.
//! - Our writes always go to `custom/types_custom.xml`.
//! - An override's `<type name="...">` **replaces** the vanilla entry with
//!   the same name. Late sources win. For display, the effective item is
//!   what the CE engine would end up with after all overrides.
//! - The UI still needs to know the *source* of every effective item
//!   (vanilla / mod / custom) so it can warn before touching vanilla.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::domain::{ItemSource, ItemType};
use crate::error::{AppError, AppResult};
use crate::parsers::cfg_economy_core::{CeFile, EconomyCore};
use crate::parsers::types_xml;
use crate::validation::{Issue, Severity};

use super::MissionContext;

/// The canonical override path we write to. Relative to `custom/`.
pub const CUSTOM_TYPES_FILE: &str = "types_custom.xml";

pub struct ItemsRegistry {
    /// Effective state — vanilla merged with overrides, keyed by classname.
    pub items: HashMap<String, ItemType>,
    /// Where each effective item's authoritative XML entry lives (the
    /// winning file — may be vanilla OR an override).
    pub files_loaded: Vec<FileOrigin>,
    /// Per-file parse failures so one broken mod file doesn't brick the
    /// whole Items page. Surfaces as Error-severity validation issues.
    pub load_errors: Vec<Issue>,
}

#[derive(Debug, Clone)]
pub struct FileOrigin {
    pub path: PathBuf,
    pub source: ItemSource,
    pub relative: String,
    pub count: usize,
}

pub fn load(ctx: &MissionContext) -> AppResult<ItemsRegistry> {
    let mut effective: HashMap<String, ItemType> = HashMap::new();
    let mut files_loaded: Vec<FileOrigin> = Vec::new();
    let mut load_errors: Vec<Issue> = Vec::new();

    // 1. Vanilla baseline.
    let vanilla = ctx.db_dir.join("types.xml");
    if vanilla.exists() {
        let rel = rel_slash(&ctx.workspace, &vanilla);
        match types_xml::parse_file(&vanilla, &ctx.workspace, ItemSource::Vanilla) {
            Ok(items) => {
                let count = items.len();
                for it in items {
                    effective.insert(it.name.clone(), it);
                }
                files_loaded.push(FileOrigin {
                    path: vanilla.clone(),
                    source: ItemSource::Vanilla,
                    relative: rel,
                    count,
                });
            }
            Err(e) => record_parse_error(&mut load_errors, &rel, &e),
        }
    }

    // 2. Overrides: every `<ce folder="…"><file name="…" type="types"/></ce>`
    // entry in cfgeconomycore.xml. Folder `custom` is "our" overrides;
    // everything else is mod overrides (expansion_ce / dayz-expansion / etc.)
    if ctx.cfgeconomycore_path.exists() {
        let eco = EconomyCore::parse_file(&ctx.cfgeconomycore_path)?;
        for block in eco.ce_blocks() {
            for f in block.files.iter().filter(|f| f.file_type == "types") {
                let path = ctx.mission_root.join(&block.folder).join(&f.name);
                if !path.exists() {
                    log::warn!(
                        "cfgeconomycore references missing file: {}",
                        path.display()
                    );
                    continue;
                }
                let source = if block.folder == "custom" {
                    ItemSource::Custom
                } else {
                    ItemSource::Mod
                };
                let rel = rel_slash(&ctx.workspace, &path);
                match types_xml::parse_file(&path, &ctx.workspace, source) {
                    Ok(items) => {
                        let count = items.len();
                        for mut it in items {
                            if matches!(source, ItemSource::Mod) {
                                it.mod_id = Some(block.folder.clone());
                            }
                            effective.insert(it.name.clone(), it);
                        }
                        files_loaded.push(FileOrigin {
                            path: path.clone(),
                            source,
                            relative: rel,
                            count,
                        });
                    }
                    Err(e) => record_parse_error(&mut load_errors, &rel, &e),
                }
            }
        }
    }

    Ok(ItemsRegistry {
        items: effective,
        files_loaded,
        load_errors,
    })
}

fn record_parse_error(out: &mut Vec<Issue>, file: &str, err: &AppError) {
    log::error!("failed to parse types.xml file {file}: {err}");
    out.push(Issue {
        severity: Severity::Error,
        code: "items.parse-failed".into(),
        message: format!(
            "could not parse {file}: {err}. The file was skipped — other entries are unaffected, but this file's contents won't apply on the server."
        ),
        file: file.to_string(),
        entity: None,
    });
}

/// Upsert a list of items into `custom/types_custom.xml`. Existing entries
/// by name are replaced, new entries appended. Ensures `cfgeconomycore.xml`
/// registers the override file (idempotent).
pub fn upsert_into_custom(ctx: &MissionContext, updates: &[ItemType]) -> AppResult<()> {
    ctx.ensure_custom_dir()?;
    let custom_path = ctx.custom_dir.join(CUSTOM_TYPES_FILE);

    let mut current = if custom_path.exists() {
        types_xml::parse_file(&custom_path, &ctx.workspace, ItemSource::Custom)?
    } else {
        Vec::new()
    };

    let mut index: HashMap<String, usize> = current
        .iter()
        .enumerate()
        .map(|(i, it)| (it.name.clone(), i))
        .collect();

    for u in updates {
        let mut next = u.clone();
        next.source = ItemSource::Custom;
        next.file = rel_slash(&ctx.workspace, &custom_path);
        next.mod_id = None;
        if let Some(i) = index.get(&next.name).copied() {
            current[i] = next;
        } else {
            index.insert(next.name.clone(), current.len());
            current.push(next);
        }
    }

    types_xml::write_items(&custom_path, &current)?;
    ensure_registered(ctx)?;
    Ok(())
}

/// Delete items from `custom/types_custom.xml` by classname. Silently
/// ignores names that aren't present in the override file — we cannot
/// remove vanilla-defined items, only stop overriding them (callers who
/// want "disable" behavior should use [`disable_in_custom`]).
pub fn remove_from_custom(ctx: &MissionContext, names: &[String]) -> AppResult<usize> {
    let custom_path = ctx.custom_dir.join(CUSTOM_TYPES_FILE);
    if !custom_path.exists() {
        return Ok(0);
    }
    let mut current = types_xml::parse_file(&custom_path, &ctx.workspace, ItemSource::Custom)?;
    let before = current.len();
    current.retain(|it| !names.iter().any(|n| n == &it.name));
    let removed = before - current.len();
    types_xml::write_items(&custom_path, &current)?;
    Ok(removed)
}

/// Register our override file in cfgeconomycore.xml if it isn't already.
/// Creates the file from an `<economy_core/>` stub when the user hasn't
/// got one yet (very rare — vanilla always ships one).
pub fn ensure_registered(ctx: &MissionContext) -> AppResult<()> {
    let mut eco = if ctx.cfgeconomycore_path.exists() {
        EconomyCore::parse_file(&ctx.cfgeconomycore_path)?
    } else {
        EconomyCore::empty()
    };
    let added = eco.ensure_ce_block(
        "custom",
        &[CeFile {
            name: CUSTOM_TYPES_FILE.to_string(),
            file_type: "types".to_string(),
        }],
    );
    // Invariant: custom overrides must be the last ce block so they
    // win over any mod registrations (see PDR §9.1 "override writing
    // rule" — DayZ loads ce files in document order).
    let moved = eco.move_folder_to_end("custom");
    if added || moved {
        eco.write_file(&ctx.cfgeconomycore_path)?;
    }
    Ok(())
}

/// Read the raw XML for a single item, emitted in the standard formatting
/// we use on writes. Useful for "Raw XML" drawer (PDR §9.1).
pub fn raw_xml_for(item: &ItemType) -> AppResult<String> {
    let s = types_xml::serialize_items(std::slice::from_ref(item))?;
    // Strip the leading XML declaration so the drawer shows only the
    // `<type>` fragment — less noise for per-item inspection.
    Ok(s.lines()
        .filter(|l| !l.trim_start().starts_with("<?xml"))
        .collect::<Vec<_>>()
        .join("\n"))
}

fn rel_slash(root: &Path, path: &Path) -> String {
    match path.strip_prefix(root) {
        Ok(rel) => rel
            .components()
            .map(|c| c.as_os_str().to_string_lossy().into_owned())
            .collect::<Vec<_>>()
            .join("/"),
        Err(_) => path.to_string_lossy().replace('\\', "/"),
    }
}

// The `AppError` import is used transitively via `?` from sub-calls;
// silence the unused-import lint for dev builds.
#[allow(dead_code)]
fn _unused(_: AppError) {}
