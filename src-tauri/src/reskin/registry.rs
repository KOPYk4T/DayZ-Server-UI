//! Persistent reskin registry — a single JSON file tracking every
//! reskin the operator has authored, plus the mod name they want
//! everything packed under.
//!
//! Stored at `<app-data>/reskin/registry.json`. Loaded on demand,
//! rewritten in full on every mutation — the dataset is tiny (one
//! entry per reskin class) so simplicity beats streaming writes.
//!
//! The registry is the single source of truth for the build step:
//! `build_from_registry` reads it and emits one class per entry into
//! the same mod folder, instead of the previous one-off "build from
//! wizard state" flow.

use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

use super::build::{ProceduralColor, ReskinMode};
use super::config_parser::SkinnableClass;

pub const DEFAULT_MOD_NAME: &str = "@OperatorReskins";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReskinRegistry {
    #[serde(default = "default_mod_name")]
    pub mod_name: String,
    #[serde(default)]
    pub reskins: Vec<ReskinEntry>,
    /// User-supplied `.pbo` files bundled into the same mod output —
    /// content mods / maps / tweaks the operator wants alongside
    /// their reskins. Copied verbatim into `<mod>/addons/` at build.
    #[serde(default)]
    pub external_pbos: Vec<ExternalPboEntry>,
    /// Author-written `config.cpp` class blocks. Emitted after the
    /// auto-generated reskin blocks into the same config.cpp so a
    /// server-modpack ships one PBO with both.
    #[serde(default)]
    pub config_classes: Vec<ConfigClassEntry>,
}

fn default_mod_name() -> String {
    DEFAULT_MOD_NAME.to_string()
}

impl Default for ReskinRegistry {
    fn default() -> Self {
        Self {
            mod_name: DEFAULT_MOD_NAME.to_string(),
            reskins: Vec::new(),
            external_pbos: Vec::new(),
            config_classes: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalPboEntry {
    /// Stable id used for remove / toggle. Generated at add time —
    /// we don't rely on the source path so re-adding from a moved
    /// path produces a distinct row rather than silently replacing.
    pub id: String,
    /// Operator-chosen label. Defaults to the file stem when the
    /// frontend doesn't pass a custom one.
    pub display_name: String,
    /// Absolute filesystem path to the source `.pbo`. Read at build
    /// time, not cached — pointing at a network share is fine as
    /// long as the share is mounted when building.
    pub source_path: String,
    /// `true` → copy into the build. Flipping to `false` leaves the
    /// row in place so the operator can toggle without losing their
    /// chosen display name / notes.
    #[serde(default = "default_true")]
    pub include: bool,
    /// Optional notes the operator wrote themselves — "fixes AKM
    /// recoil", "friend's map mod" — plain text, preserved
    /// verbatim.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub notes: String,
    pub added_at: String,
    /// File size captured at add time. Displayed in the UI; not
    /// used for validation because operators may swap the file
    /// between add and build.
    pub size_bytes: u64,
}

/// Explicit intent for a config-class entry. Matters because the two
/// shapes have very different downstream effects:
///
/// - `New` introduces a brand-new class symbol. Downstream views that
///   enumerate classes (the reskin wizard's class picker, the auto-
///   generated types.xml, CfgPatches.weapons[]) include it.
/// - `Override` rewrites an existing class of the same name, so it
///   does NOT create a new symbol — it's just modifying configuration
///   of something that's already in the game.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ConfigClassKind {
    New,
    Override,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigClassEntry {
    pub id: String,
    /// Short label shown in lists — typically equals the classname
    /// but can be free-form ("SuperBear (boss variant)").
    pub display_name: String,
    /// The new / overridden class symbol, e.g. `SuperBear`. Same
    /// validation as reskin classnames: starts with a letter, no
    /// spaces, no punctuation beyond `_`.
    pub classname: String,
    /// Parent class this extends — `Animal_UrsusArctos`,
    /// `DZ_LightAI_Base`, etc. Required when `kind == New`, ignored
    /// when `kind == Override`.
    pub parent: String,
    /// Config container — `CfgVehicles`, `CfgWeapons`, `CfgAmmo`,
    /// `CfgMagazines`. Defaults to `CfgVehicles` because that's
    /// where animals / vehicles / most entities live.
    #[serde(default = "default_container")]
    pub container: String,
    /// Whether this introduces a new class or overrides an existing
    /// one. `None` in persisted data (pre-kind entries) is resolved
    /// at load time by inferring from the parent field.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<ConfigClassKind>,
    /// The body that goes between the class's braces. Free-form
    /// config.cpp — operator is expected to know the syntax. No
    /// escaping is applied; whatever they write lands verbatim.
    pub body: String,
    pub created_at: String,
    pub updated_at: String,
}

impl ConfigClassEntry {
    /// Kind with back-fill: respects an explicitly-set `kind`, or
    /// infers from the parent field when absent (pre-kind entries).
    /// Parent that's empty or equal to the classname → Override;
    /// otherwise New.
    pub fn effective_kind(&self) -> ConfigClassKind {
        if let Some(k) = self.kind {
            return k;
        }
        let p = self.parent.trim();
        if p.is_empty() || p.eq_ignore_ascii_case(&self.classname) {
            ConfigClassKind::Override
        } else {
            ConfigClassKind::New
        }
    }
}

fn default_true() -> bool {
    true
}
fn default_container() -> String {
    "CfgVehicles".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReskinEntry {
    pub source: SkinnableClass,
    pub new_classname: String,
    pub mode: ReskinMode,
    #[serde(default)]
    pub slots: Vec<SlotOverrideEntry>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlotOverrideEntry {
    pub slot_index: u32,
    pub selection: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_file: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_color: Option<ProceduralColor>,
}

pub fn registry_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("reskin").join("registry.json")
}

pub fn load(app_data_dir: &Path) -> AppResult<ReskinRegistry> {
    let path = registry_path(app_data_dir);
    if !path.is_file() {
        return Ok(ReskinRegistry::default());
    }
    let bytes = std::fs::read(&path)?;
    if bytes.is_empty() {
        return Ok(ReskinRegistry::default());
    }
    let reg: ReskinRegistry = serde_json::from_slice(&bytes)?;
    Ok(reg)
}

pub fn save(app_data_dir: &Path, reg: &ReskinRegistry) -> AppResult<()> {
    let path = registry_path(app_data_dir);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let bytes = serde_json::to_vec_pretty(reg)?;
    std::fs::write(&path, bytes)?;
    Ok(())
}

/// Add or replace a reskin. Classname is the natural key — upserting
/// with an existing classname overwrites that entry. Returns the
/// saved entry.
pub fn upsert(
    app_data_dir: &Path,
    mut entry: ReskinEntry,
) -> AppResult<ReskinEntry> {
    let mut reg = load(app_data_dir)?;
    let now = Utc::now().to_rfc3339();
    let existing = reg
        .reskins
        .iter_mut()
        .find(|e| e.new_classname.eq_ignore_ascii_case(&entry.new_classname));
    match existing {
        Some(e) => {
            // Preserve original created_at; refresh updated_at.
            entry.created_at = e.created_at.clone();
            entry.updated_at = now;
            *e = entry.clone();
        }
        None => {
            if entry.created_at.is_empty() {
                entry.created_at = now.clone();
            }
            entry.updated_at = now;
            reg.reskins.push(entry.clone());
        }
    }
    save(app_data_dir, &reg)?;
    Ok(entry)
}

pub fn remove(
    app_data_dir: &Path,
    new_classname: &str,
) -> AppResult<bool> {
    let mut reg = load(app_data_dir)?;
    let before = reg.reskins.len();
    reg.reskins
        .retain(|e| !e.new_classname.eq_ignore_ascii_case(new_classname));
    if reg.reskins.len() == before {
        return Ok(false);
    }
    save(app_data_dir, &reg)?;
    Ok(true)
}

pub fn set_mod_name(
    app_data_dir: &Path,
    mod_name: &str,
) -> AppResult<ReskinRegistry> {
    if !is_valid_mod_name(mod_name) {
        return Err(AppError::Internal(format!(
            "invalid mod folder name: {mod_name}"
        )));
    }
    let mut reg = load(app_data_dir)?;
    reg.mod_name = mod_name.to_string();
    save(app_data_dir, &reg)?;
    Ok(reg)
}

// ---------- External PBO list ----------

pub fn upsert_external_pbo(
    app_data_dir: &Path,
    mut entry: ExternalPboEntry,
) -> AppResult<ExternalPboEntry> {
    let mut reg = load(app_data_dir)?;
    let now = Utc::now().to_rfc3339();
    // If the caller didn't assign an id, mint one now. Use the
    // timestamp — good enough for a local-only, small-N list. The
    // dedup rule below protects against collisions.
    if entry.id.is_empty() {
        entry.id = now.clone();
    }
    // Prevent double-adding the exact same source path (by path +
    // size, which catches moves to an identical copy). Caller can
    // still add two distinct .pbos with the same display name.
    if let Some(existing) = reg
        .external_pbos
        .iter_mut()
        .find(|e| e.id == entry.id)
    {
        entry.added_at = existing.added_at.clone();
        *existing = entry.clone();
    } else {
        if entry.added_at.is_empty() {
            entry.added_at = now;
        }
        reg.external_pbos.push(entry.clone());
    }
    save(app_data_dir, &reg)?;
    Ok(entry)
}

pub fn remove_external_pbo(app_data_dir: &Path, id: &str) -> AppResult<bool> {
    let mut reg = load(app_data_dir)?;
    let before = reg.external_pbos.len();
    reg.external_pbos.retain(|e| e.id != id);
    if reg.external_pbos.len() == before {
        return Ok(false);
    }
    save(app_data_dir, &reg)?;
    Ok(true)
}

pub fn set_external_pbo_include(
    app_data_dir: &Path,
    id: &str,
    include: bool,
) -> AppResult<bool> {
    let mut reg = load(app_data_dir)?;
    let Some(entry) = reg.external_pbos.iter_mut().find(|e| e.id == id) else {
        return Ok(false);
    };
    if entry.include == include {
        return Ok(false);
    }
    entry.include = include;
    save(app_data_dir, &reg)?;
    Ok(true)
}

// ---------- Config class list ----------

pub fn upsert_config_class(
    app_data_dir: &Path,
    mut entry: ConfigClassEntry,
) -> AppResult<ConfigClassEntry> {
    if !is_valid_classname(&entry.classname) {
        return Err(AppError::Internal(format!(
            "invalid classname: {}",
            entry.classname
        )));
    }
    let mut reg = load(app_data_dir)?;
    let now = Utc::now().to_rfc3339();
    if entry.id.is_empty() {
        entry.id = now.clone();
    }
    // Upsert by id when the frontend sent one (edit flow), otherwise
    // append. We do NOT dedup by classname — two entries with the
    // same classname is a build-time error; the UI warns but the
    // registry just tracks what the operator wrote.
    if let Some(existing) = reg
        .config_classes
        .iter_mut()
        .find(|e| e.id == entry.id)
    {
        entry.created_at = existing.created_at.clone();
        entry.updated_at = now;
        *existing = entry.clone();
    } else {
        if entry.created_at.is_empty() {
            entry.created_at = now.clone();
        }
        entry.updated_at = now;
        reg.config_classes.push(entry.clone());
    }
    save(app_data_dir, &reg)?;
    Ok(entry)
}

pub fn remove_config_class(app_data_dir: &Path, id: &str) -> AppResult<bool> {
    let mut reg = load(app_data_dir)?;
    let before = reg.config_classes.len();
    reg.config_classes.retain(|e| e.id != id);
    if reg.config_classes.len() == before {
        return Ok(false);
    }
    save(app_data_dir, &reg)?;
    Ok(true)
}

fn is_valid_classname(s: &str) -> bool {
    let mut chars = s.chars();
    match chars.next() {
        Some(c) if c.is_ascii_alphabetic() => {}
        _ => return false,
    }
    chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

fn is_valid_mod_name(s: &str) -> bool {
    if !s.starts_with('@') || s.len() < 2 {
        return false;
    }
    s.chars()
        .skip(1)
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn sample_entry(classname: &str) -> ReskinEntry {
        ReskinEntry {
            source: SkinnableClass {
                name: "AKM".into(),
                parent: Some("Rifle_Base".into()),
                containers: vec!["CfgWeapons".into()],
                hidden_selections: vec!["camo1".into()],
                hidden_selections_textures: vec!["dz\\weapons\\akm_co.paa".into()],
                hidden_selections_materials: vec![],
                source_mod: None,
            },
            new_classname: classname.into(),
            mode: ReskinMode::Coexist,
            slots: vec![],
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn upsert_inserts_then_updates_by_classname() {
        let td = TempDir::new().unwrap();
        let dir = td.path();
        upsert(dir, sample_entry("AKM_A")).unwrap();
        upsert(dir, sample_entry("AKM_B")).unwrap();
        let reg = load(dir).unwrap();
        assert_eq!(reg.reskins.len(), 2);

        // Re-upsert first classname → replaced in place, not appended.
        let mut updated = sample_entry("AKM_A");
        updated.source.name = "AKM_v2".into();
        upsert(dir, updated).unwrap();

        let reg = load(dir).unwrap();
        assert_eq!(reg.reskins.len(), 2);
        let a = reg
            .reskins
            .iter()
            .find(|e| e.new_classname == "AKM_A")
            .unwrap();
        assert_eq!(a.source.name, "AKM_v2");
    }

    #[test]
    fn remove_drops_by_classname_case_insensitive() {
        let td = TempDir::new().unwrap();
        let dir = td.path();
        upsert(dir, sample_entry("AKM_A")).unwrap();
        assert!(remove(dir, "akm_a").unwrap());
        assert!(!remove(dir, "akm_a").unwrap()); // second call is a no-op
        assert!(load(dir).unwrap().reskins.is_empty());
    }

    #[test]
    fn set_mod_name_validates_and_persists() {
        let td = TempDir::new().unwrap();
        let dir = td.path();
        set_mod_name(dir, "@MyReskins").unwrap();
        assert_eq!(load(dir).unwrap().mod_name, "@MyReskins");

        assert!(set_mod_name(dir, "NoAtSign").is_err());
        assert!(set_mod_name(dir, "@has spaces").is_err());
    }

    #[test]
    fn default_registry_loads_for_missing_file() {
        let td = TempDir::new().unwrap();
        let reg = load(td.path()).unwrap();
        assert_eq!(reg.mod_name, DEFAULT_MOD_NAME);
        assert!(reg.reskins.is_empty());
    }
}
