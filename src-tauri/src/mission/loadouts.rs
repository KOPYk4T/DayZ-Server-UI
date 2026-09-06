//! Unified spawnables + random-presets registry (PDR §9.3).
//!
//! Mirrors `mission::items` / `mission::events`:
//! - Vanilla baselines from `<mission>/cfgspawnabletypes.xml` and
//!   `<mission>/cfgrandompresets.xml`.
//! - Overrides from every `<ce folder="…"><file type="spawnabletypes"/></ce>`
//!   and `<file type="randompresets"/>` registration.
//! - Late sources win; custom writes land in
//!   `custom/spawnabletypes_custom.xml` and
//!   `custom/cfgrandompresets_custom.xml`, auto-registered in
//!   cfgeconomycore.xml on first save and anchored last via
//!   `move_folder_to_end` (see load-order invariant).

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::domain::{ItemSource, RandomPreset, SpawnableType};
use crate::error::AppResult;
use crate::parsers::cfg_economy_core::{CeFile, EconomyCore};
use crate::parsers::{cfg_randompresets_xml, cfg_spawnabletypes_xml};
use crate::validation::{Issue, Severity};

use super::MissionContext;

pub const CUSTOM_SPAWNABLES_FILE: &str = "spawnabletypes_custom.xml";
pub const CUSTOM_PRESETS_FILE: &str = "cfgrandompresets_custom.xml";

pub struct LoadoutsRegistry {
    /// Keyed by spawnable classname.
    pub spawnables: HashMap<String, SpawnableType>,
    /// Keyed by preset name. Note: preset namespaces for attachments
    /// vs cargo are shared by vanilla convention — name collisions
    /// across kinds are rare but technically allowed, so we store the
    /// LATER-loaded one (kind-aware resolution happens at validation).
    pub presets: HashMap<String, RandomPreset>,
    pub files_loaded: Vec<FileOrigin>,
    /// Per-file parse failures. Surfaced to the UI as Error-severity
    /// validation issues so one broken mod file can't brick the whole
    /// Loadouts page.
    pub load_errors: Vec<Issue>,
}

#[derive(Debug, Clone)]
pub struct FileOrigin {
    pub path: PathBuf,
    pub source: ItemSource,
    pub relative: String,
    pub kind: &'static str, // "spawnabletypes" | "randompresets"
    pub count: usize,
}

pub fn load(ctx: &MissionContext) -> AppResult<LoadoutsRegistry> {
    let mut spawnables: HashMap<String, SpawnableType> = HashMap::new();
    let mut presets: HashMap<String, RandomPreset> = HashMap::new();
    let mut files_loaded = Vec::new();
    let mut load_errors = Vec::new();

    // Vanilla baselines (these live at mission root, not under db/).
    let vanilla_spawnables = ctx.mission_root.join("cfgspawnabletypes.xml");
    if vanilla_spawnables.exists() {
        let rel = rel_slash(&ctx.workspace, &vanilla_spawnables);
        match cfg_spawnabletypes_xml::parse_file(
            &vanilla_spawnables,
            &ctx.workspace,
            ItemSource::Vanilla,
        ) {
            Ok(list) => {
                let count = list.len();
                for s in list {
                    spawnables.insert(s.name.clone(), s);
                }
                files_loaded.push(FileOrigin {
                    path: vanilla_spawnables.clone(),
                    source: ItemSource::Vanilla,
                    relative: rel,
                    kind: "spawnabletypes",
                    count,
                });
            }
            Err(e) => record_parse_error(&mut load_errors, "spawnabletypes", &rel, &e),
        }
    }

    let vanilla_presets = ctx.mission_root.join("cfgrandompresets.xml");
    if vanilla_presets.exists() {
        let rel = rel_slash(&ctx.workspace, &vanilla_presets);
        match cfg_randompresets_xml::parse_file(
            &vanilla_presets,
            &ctx.workspace,
            ItemSource::Vanilla,
        ) {
            Ok(list) => {
                let count = list.len();
                for p in list {
                    presets.insert(p.name.clone(), p);
                }
                files_loaded.push(FileOrigin {
                    path: vanilla_presets.clone(),
                    source: ItemSource::Vanilla,
                    relative: rel,
                    kind: "randompresets",
                    count,
                });
            }
            Err(e) => record_parse_error(&mut load_errors, "randompresets", &rel, &e),
        }
    }

    // Overrides through cfgeconomycore.
    if ctx.cfgeconomycore_path.exists() {
        let eco = EconomyCore::parse_file(&ctx.cfgeconomycore_path)?;
        for block in eco.ce_blocks() {
            for f in &block.files {
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
                match f.file_type.as_str() {
                    "spawnabletypes" => {
                        match cfg_spawnabletypes_xml::parse_file(&path, &ctx.workspace, source) {
                            Ok(list) => {
                                let count = list.len();
                                for mut s in list {
                                    if matches!(source, ItemSource::Mod) {
                                        s.mod_id = Some(block.folder.clone());
                                    }
                                    spawnables.insert(s.name.clone(), s);
                                }
                                files_loaded.push(FileOrigin {
                                    path: path.clone(),
                                    source,
                                    relative: rel,
                                    kind: "spawnabletypes",
                                    count,
                                });
                            }
                            Err(e) => record_parse_error(
                                &mut load_errors,
                                "spawnabletypes",
                                &rel,
                                &e,
                            ),
                        }
                    }
                    "randompresets" => {
                        match cfg_randompresets_xml::parse_file(&path, &ctx.workspace, source) {
                            Ok(list) => {
                                let count = list.len();
                                for mut p in list {
                                    if matches!(source, ItemSource::Mod) {
                                        p.mod_id = Some(block.folder.clone());
                                    }
                                    presets.insert(p.name.clone(), p);
                                }
                                files_loaded.push(FileOrigin {
                                    path: path.clone(),
                                    source,
                                    relative: rel,
                                    kind: "randompresets",
                                    count,
                                });
                            }
                            Err(e) => record_parse_error(
                                &mut load_errors,
                                "randompresets",
                                &rel,
                                &e,
                            ),
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    Ok(LoadoutsRegistry {
        spawnables,
        presets,
        files_loaded,
        load_errors,
    })
}

fn record_parse_error(
    out: &mut Vec<Issue>,
    kind: &str,
    file: &str,
    err: &crate::error::AppError,
) {
    log::error!("failed to parse {kind} file {file}: {err}");
    out.push(Issue {
        severity: Severity::Error,
        code: format!("loadouts.parse-failed.{kind}"),
        message: format!(
            "could not parse {file}: {err}. The file was skipped — other {kind} entries are unaffected, but this file's contents won't apply on the server. Check the file for unusual characters or ask the mod author."
        ),
        file: file.to_string(),
        entity: None,
    });
}

/// Upsert spawnable types into `custom/spawnabletypes_custom.xml`.
pub fn upsert_spawnables(
    ctx: &MissionContext,
    updates: &[SpawnableType],
) -> AppResult<()> {
    if updates.is_empty() {
        return Ok(());
    }
    ctx.ensure_custom_dir()?;
    let path = ctx.custom_dir.join(CUSTOM_SPAWNABLES_FILE);
    let mut current = if path.exists() {
        cfg_spawnabletypes_xml::parse_file(&path, &ctx.workspace, ItemSource::Custom)?
    } else {
        Vec::new()
    };
    let mut index: HashMap<String, usize> = current
        .iter()
        .enumerate()
        .map(|(i, s)| (s.name.clone(), i))
        .collect();
    for u in updates {
        let mut s = u.clone();
        s.source = ItemSource::Custom;
        s.file = rel_slash(&ctx.workspace, &path);
        s.mod_id = None;
        if let Some(&i) = index.get(&s.name) {
            current[i] = s;
        } else {
            index.insert(s.name.clone(), current.len());
            current.push(s);
        }
    }
    cfg_spawnabletypes_xml::write_types(&path, &current)?;
    ensure_registered(ctx, true, false)?;
    Ok(())
}

/// Upsert presets into `custom/cfgrandompresets_custom.xml`.
pub fn upsert_presets(
    ctx: &MissionContext,
    updates: &[RandomPreset],
) -> AppResult<()> {
    if updates.is_empty() {
        return Ok(());
    }
    ctx.ensure_custom_dir()?;
    let path = ctx.custom_dir.join(CUSTOM_PRESETS_FILE);
    let mut current = if path.exists() {
        cfg_randompresets_xml::parse_file(&path, &ctx.workspace, ItemSource::Custom)?
    } else {
        Vec::new()
    };
    let mut index: HashMap<String, usize> = current
        .iter()
        .enumerate()
        .map(|(i, p)| (p.name.clone(), i))
        .collect();
    for u in updates {
        let mut p = u.clone();
        p.source = ItemSource::Custom;
        p.file = rel_slash(&ctx.workspace, &path);
        p.mod_id = None;
        if let Some(&i) = index.get(&p.name) {
            current[i] = p;
        } else {
            index.insert(p.name.clone(), current.len());
            current.push(p);
        }
    }
    cfg_randompresets_xml::write_presets(&path, &current)?;
    ensure_registered(ctx, false, true)?;
    Ok(())
}

pub fn remove_spawnables(ctx: &MissionContext, names: &[String]) -> AppResult<usize> {
    let path = ctx.custom_dir.join(CUSTOM_SPAWNABLES_FILE);
    if !path.exists() {
        return Ok(0);
    }
    let mut current =
        cfg_spawnabletypes_xml::parse_file(&path, &ctx.workspace, ItemSource::Custom)?;
    let before = current.len();
    current.retain(|s| !names.iter().any(|n| n == &s.name));
    let removed = before - current.len();
    cfg_spawnabletypes_xml::write_types(&path, &current)?;
    Ok(removed)
}

pub fn remove_presets(ctx: &MissionContext, names: &[String]) -> AppResult<usize> {
    let path = ctx.custom_dir.join(CUSTOM_PRESETS_FILE);
    if !path.exists() {
        return Ok(0);
    }
    let mut current =
        cfg_randompresets_xml::parse_file(&path, &ctx.workspace, ItemSource::Custom)?;
    let before = current.len();
    current.retain(|p| !names.iter().any(|n| n == &p.name));
    let removed = before - current.len();
    cfg_randompresets_xml::write_presets(&path, &current)?;
    Ok(removed)
}

pub fn ensure_registered(
    ctx: &MissionContext,
    spawnables: bool,
    presets: bool,
) -> AppResult<()> {
    let mut wanted = Vec::new();
    if spawnables {
        wanted.push(CeFile {
            name: CUSTOM_SPAWNABLES_FILE.into(),
            file_type: "spawnabletypes".into(),
        });
    }
    if presets {
        wanted.push(CeFile {
            name: CUSTOM_PRESETS_FILE.into(),
            file_type: "randompresets".into(),
        });
    }
    if wanted.is_empty() {
        return Ok(());
    }
    let mut eco = if ctx.cfgeconomycore_path.exists() {
        EconomyCore::parse_file(&ctx.cfgeconomycore_path)?
    } else {
        EconomyCore::empty()
    };
    let added = eco.ensure_ce_block("custom", &wanted);
    let moved = eco.move_folder_to_end("custom");
    if added || moved {
        eco.write_file(&ctx.cfgeconomycore_path)?;
    }
    Ok(())
}

pub fn raw_xml_for_spawnable(s: &SpawnableType) -> AppResult<String> {
    let out = cfg_spawnabletypes_xml::serialize(std::slice::from_ref(s))?;
    Ok(out
        .lines()
        .filter(|l| !l.trim_start().starts_with("<?xml"))
        .collect::<Vec<_>>()
        .join("\n"))
}

pub fn raw_xml_for_preset(p: &RandomPreset) -> AppResult<String> {
    let out = cfg_randompresets_xml::serialize(std::slice::from_ref(p))?;
    Ok(out
        .lines()
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
