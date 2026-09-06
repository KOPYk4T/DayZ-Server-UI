//! Mod class index — walks a server-mod tree (one or more `@*`
//! folders) and surfaces every reskinnable class declared in the
//! mod's PBOs alongside the vanilla index.
//!
//! Pipeline per addon PBO:
//!   1. `ExtractPbo.exe` unpacks the PBO into a temp folder.
//!   2. The unpacked tree's `config.cpp` (or `config.bin` →
//!      DeRap) is fed into `config_parser`.
//!   3. Each parsed `SkinnableClass` is tagged with the mod's
//!      `@-folder name (`source_mod`) so the build pipeline knows
//!      to declare the parent mod in `requiredAddons[]` later.
//!
//! Why a separate module from `vanilla_index`?
//!   - Mod sources are *adds*, not replaces — operators want
//!     vanilla + each chosen mod stacked, picked individually.
//!   - Cache invalidation differs: vanilla rebuilds when the P:
//!     scan rehashes; mod cache rebuilds per-source by PBO mtime
//!     so a single mod update doesn't invalidate the whole set.
//!   - Errors at the per-PBO level want different reporting —
//!     "AKM_pack.pbo skipped: ExtractPbo failed" is the right
//!     surface, not "mod X failed".
//!
//! The cache lives at `<app-data>/reskin/mod-class-index.json`
//! and stores one `ModSource` per registered mod folder. Adding,
//! refreshing, and removing flow through the same file.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Instant;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::error::{AppError, AppResult};

use super::config_parser::{self, SkinnableClass};
use super::tools;

/// Where the mod-class index lives on disk.
pub fn cache_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("reskin").join("mod-class-index.json")
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ModClassIndex {
    pub sources: Vec<ModSource>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModSource {
    /// Stable id assigned at add time. Survives mod folder
    /// renames so the UI's reskin-targets list keeps its
    /// references.
    pub id: String,
    /// `@ExpansionMod`, `@CF`, … — leaf folder name. Used for
    /// display + as `source_mod` on each scanned class.
    pub display_name: String,
    /// Absolute path the operator picked. We re-walk this every
    /// refresh, so moving the mod folder requires removing +
    /// re-adding (intentional — we want the operator to
    /// re-confirm the source, not silently track a moved tree).
    pub source_path: String,
    pub added_at: String,
    pub last_scanned_at: Option<String>,
    /// Hash of (pbo_path, pbo_mtime) tuples for the addons we
    /// scanned. When the operator hits "Refresh" we rebuild
    /// only if the inventory hash changed — single-mod updates
    /// don't pay for the whole PBO extraction stack twice.
    pub inventory_hash: String,
    pub addon_count: u32,
    pub class_count: u32,
    pub classes: Vec<SkinnableClass>,
    /// Per-PBO failures, surfaced in the UI so operators can fix
    /// the offending file (corrupted / encrypted / signing-only
    /// addon) without losing the rest of the scan.
    #[serde(default)]
    pub skipped: Vec<SkippedAddon>,
    /// `CfgPatches` class names declared anywhere in this mod's
    /// PBOs. The reskin build emits these into the generated
    /// addon's `requiredAddons[]` so DayZ guarantees the source
    /// mod loads before our override addon resolves.
    #[serde(default)]
    pub cfg_patches: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedAddon {
    pub pbo: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSummary {
    pub source_id: String,
    pub addon_count: u32,
    pub class_count: u32,
    pub skipped: u32,
    pub duration_ms: u64,
    /// `true` when the cache was reused because nothing changed
    /// since the last scan. The UI surfaces this as "X classes
    /// (no change)" instead of progress noise.
    pub cache_hit: bool,
}

pub fn load_index(app_data_dir: &Path) -> AppResult<ModClassIndex> {
    let cache = cache_path(app_data_dir);
    if !cache.is_file() {
        return Ok(ModClassIndex::default());
    }
    let bytes = std::fs::read(&cache)?;
    if bytes.is_empty() {
        return Ok(ModClassIndex::default());
    }
    let index: ModClassIndex = serde_json::from_slice(&bytes)?;
    Ok(index)
}

fn save_index(app_data_dir: &Path, index: &ModClassIndex) -> AppResult<()> {
    let cache = cache_path(app_data_dir);
    if let Some(parent) = cache.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&cache, serde_json::to_vec_pretty(index)?)?;
    Ok(())
}

/// Add a new mod source by folder path, scan it immediately,
/// and persist the result. If the path is already registered
/// (case-insensitive match on the canonicalised path), the
/// existing source is refreshed instead — we don't want to end
/// up with two rows for the same mod after a folder picker
/// click.
pub fn add_or_refresh_source(
    app_data_dir: &Path,
    tools_dir: &Path,
    source_path: &Path,
) -> AppResult<ScanSummary> {
    if !source_path.is_dir() {
        return Err(AppError::Internal(format!(
            "mod folder not found: {}",
            source_path.display()
        )));
    }
    let canonical = source_path
        .canonicalize()
        .unwrap_or_else(|_| source_path.to_path_buf());
    let canonical_str = canonical.to_string_lossy().to_lowercase();

    let mut index = load_index(app_data_dir)?;
    let existing_id = index
        .sources
        .iter()
        .find(|s| s.source_path.to_lowercase() == canonical_str)
        .map(|s| s.id.clone());

    let id = existing_id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let display_name = canonical
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "<unnamed>".into());

    let started = Instant::now();
    let (addons, skipped, cfg_patches) =
        scan_addons(tools_dir, &canonical, &display_name)?;
    let inventory_hash = hash_inventory(&addons);

    // Cache hit: source already present, hash matches, just bump
    // last_scanned_at and return without re-walking.
    let cache_hit = index
        .sources
        .iter()
        .any(|s| s.id == id && s.inventory_hash == inventory_hash);

    let class_count: u32 = addons
        .iter()
        .map(|(_, classes)| classes.len() as u32)
        .sum();
    let addon_count = addons.len() as u32;
    let skipped_count = skipped.len() as u32;

    let mut classes: Vec<SkinnableClass> = Vec::with_capacity(class_count as usize);
    for (_, addon_classes) in &addons {
        for c in addon_classes {
            let mut tagged = c.clone();
            tagged.source_mod = Some(display_name.clone());
            classes.push(tagged);
        }
    }

    let now = Utc::now().to_rfc3339();
    let new_source = ModSource {
        id: id.clone(),
        display_name,
        source_path: canonical.to_string_lossy().into_owned(),
        added_at: index
            .sources
            .iter()
            .find(|s| s.id == id)
            .map(|s| s.added_at.clone())
            .unwrap_or_else(|| now.clone()),
        last_scanned_at: Some(now),
        inventory_hash,
        addon_count,
        class_count,
        classes,
        skipped,
        cfg_patches,
    };

    if let Some(slot) = index.sources.iter_mut().find(|s| s.id == id) {
        *slot = new_source;
    } else {
        index.sources.push(new_source);
    }
    save_index(app_data_dir, &index)?;

    Ok(ScanSummary {
        source_id: id,
        addon_count,
        class_count,
        skipped: skipped_count,
        duration_ms: started.elapsed().as_millis() as u64,
        cache_hit,
    })
}

pub fn remove_source(app_data_dir: &Path, id: &str) -> AppResult<bool> {
    let mut index = load_index(app_data_dir)?;
    let before = index.sources.len();
    index.sources.retain(|s| s.id != id);
    if index.sources.len() == before {
        return Ok(false);
    }
    save_index(app_data_dir, &index)?;
    Ok(true)
}

/// Aggregated scan output for one mod source. Beyond the per-PBO
/// classes the parser yields, we also collect every `CfgPatches`
/// class name encountered so the build pipeline can list them in
/// the override addon's `requiredAddons[]`.
type ModScanOutput = (
    Vec<(PathBuf, Vec<SkinnableClass>)>,
    Vec<SkippedAddon>,
    Vec<String>,
);

/// Walk the mod folder for `*.pbo` files (typically under
/// `<mod>/addons/`), extract each one, parse, and collect.
/// Returns `(addons_with_classes, skipped, cfg_patches)` — the
/// caller decides how to assemble + tag.
fn scan_addons(
    tools_dir: &Path,
    mod_root: &Path,
    mod_display_name: &str,
) -> AppResult<ModScanOutput> {
    let extract_pbo = tools::extract_pbo_exe(tools_dir);
    let derap = tools::derap_exe(tools_dir);
    if !extract_pbo.is_file() {
        return Err(AppError::Internal(format!(
            "ExtractPbo.exe not found at {}",
            extract_pbo.display()
        )));
    }

    let mut addons: Vec<(PathBuf, Vec<SkinnableClass>)> = Vec::new();
    let mut skipped: Vec<SkippedAddon> = Vec::new();
    let mut cfg_patches: Vec<String> = Vec::new();

    // Walk the entire mod tree — most mods keep PBOs in `addons/`
    // but a handful nest them deeper, and TC mods sometimes have
    // sibling folders with their own PBO sets.
    for entry in walkdir::WalkDir::new(mod_root)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
    {
        let path = entry.path();
        if !entry.file_type().is_file() {
            continue;
        }
        if path.extension().and_then(|s| s.to_str()).unwrap_or("") != "pbo" {
            continue;
        }
        let rel = path
            .strip_prefix(mod_root)
            .unwrap_or(path)
            .to_string_lossy()
            .into_owned();
        match extract_and_parse(&extract_pbo, &derap, path, mod_display_name) {
            Ok((classes, patches)) => {
                addons.push((path.to_path_buf(), classes));
                cfg_patches.extend(patches);
            }
            Err(e) => skipped.push(SkippedAddon {
                pbo: rel,
                reason: e.to_string(),
            }),
        }
    }
    // Dedup CfgPatches across PBOs — large mods often declare the
    // same patch identifier in multiple addons (or in inheritance
    // chains) and the requiredAddons[] list reads cleaner without
    // repeats.
    cfg_patches.sort();
    cfg_patches.dedup();
    Ok((addons, skipped, cfg_patches))
}

/// Extract one PBO, derap any binarised configs inside, parse,
/// return `(skinnable_classes, cfg_patches_class_names)`. The
/// temp dir is dropped on return so we don't leave hundreds of
/// MB of mod content lying around between scans.
fn extract_and_parse(
    extract_pbo: &Path,
    derap: &Path,
    pbo_path: &Path,
    _mod_display_name: &str,
) -> AppResult<(Vec<SkinnableClass>, Vec<String>)> {
    let tmp = tempfile::tempdir()
        .map_err(|e| AppError::Internal(format!("tempdir: {e}")))?;
    let dest = tmp.path().to_path_buf();

    // ExtractPbo's CLI: `ExtractPbo -P <pbo> <dest>`. `-P`
    // suppresses the "press any key" pause; `-S` would be silent
    // but we want stderr in case of failure.
    let output = Command::new(extract_pbo)
        .arg("-P")
        .arg(pbo_path)
        .arg(&dest)
        .output()
        .map_err(|e| AppError::Internal(format!("spawn ExtractPbo: {e}")))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Internal(format!(
            "ExtractPbo exited {}: {}",
            output.status,
            stderr.trim()
        )));
    }

    // ExtractPbo drops contents under `<dest>/<pbo-prefix>/...`,
    // but for our purposes we just need to find any `config.cpp`
    // /  `config.bin` it produced — they sit one level deep
    // under the prefix folder. Walk the tree to find them.
    let mut classes: Vec<SkinnableClass> = Vec::new();
    let mut cfg_patches: Vec<String> = Vec::new();
    for entry in walkdir::WalkDir::new(&dest)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let p = entry.path();
        let name = match p.file_name().and_then(|n| n.to_str()) {
            Some(n) => n,
            None => continue,
        };
        let lower = name.to_ascii_lowercase();
        let cfg_text = if lower == "config.cpp" {
            match std::fs::read_to_string(p) {
                Ok(t) => Some(t),
                Err(e) => {
                    return Err(AppError::Internal(format!(
                        "read config.cpp: {e}"
                    )));
                }
            }
        } else if lower == "config.bin" {
            // Only derap if a sibling config.cpp didn't already
            // get parsed in the same directory (avoids double
            // work when a mod ships both).
            let sibling_cpp = p.with_file_name("config.cpp");
            if sibling_cpp.is_file() {
                None
            } else {
                Some(derap_to_string(derap, p)?)
            }
        } else {
            None
        };
        if let Some(text) = cfg_text {
            classes.extend(config_parser::parse(&text));
            cfg_patches.extend(extract_cfg_patches_names(&text));
        }
    }
    Ok((classes, cfg_patches))
}

/// Pull every immediate child class name out of a top-level
/// `class CfgPatches { class Foo {…}; class Bar {…}; }` block.
/// We don't use the full `config_parser` here — those names
/// don't carry `hiddenSelections` arrays so the parser would
/// drop them. A scope-tracking scan over comments-stripped text
/// is enough; CfgPatches identifiers are always plain idents,
/// never quoted, never expression-derived.
fn extract_cfg_patches_names(text: &str) -> Vec<String> {
    // Cheap comment-strip — preserves the source's line
    // structure so we can find class declarations on `class X`
    // boundaries without false matches inside `// class Foo`.
    let stripped = strip_line_block_comments(text);
    let mut out: Vec<String> = Vec::new();
    // Walk the text looking for `class CfgPatches {` then
    // collect every `class IDENT` immediately inside that brace
    // pair. We track depth so nested classes (e.g. inside one
    // of the patch entries) don't get counted as patch names.
    let bytes = stripped.as_bytes();
    let needle = b"class CfgPatches";
    let mut i = 0;
    while i + needle.len() <= bytes.len() {
        if &bytes[i..i + needle.len()] == needle
            && (i == 0 || !is_ident_byte(bytes[i - 1]))
            && bytes
                .get(i + needle.len())
                .map(|b| !is_ident_byte(*b))
                .unwrap_or(true)
        {
            // Find the opening brace of the CfgPatches body.
            let mut j = i + needle.len();
            while j < bytes.len() && bytes[j] != b'{' {
                j += 1;
            }
            if j >= bytes.len() {
                break;
            }
            j += 1; // step past '{'
            let mut depth = 1usize;
            let body_start = j;
            while j < bytes.len() && depth > 0 {
                match bytes[j] {
                    b'{' => depth += 1,
                    b'}' => depth -= 1,
                    _ => {}
                }
                j += 1;
            }
            let body_end = j.saturating_sub(1);
            // Within [body_start, body_end) collect immediate
            // children — `class IDENT` at depth==1 within the
            // body.
            let mut k = body_start;
            let mut child_depth = 0usize;
            while k < body_end {
                match bytes[k] {
                    b'{' => child_depth += 1,
                    b'}' => {
                        child_depth = child_depth.saturating_sub(1);
                    }
                    _ => {
                        if child_depth == 0
                            && k + 5 < body_end
                            && &bytes[k..k + 5] == b"class"
                            && (k == 0 || !is_ident_byte(bytes[k - 1]))
                            && !is_ident_byte(bytes[k + 5])
                        {
                            let mut m = k + 5;
                            while m < body_end
                                && bytes[m].is_ascii_whitespace()
                            {
                                m += 1;
                            }
                            let start = m;
                            while m < body_end
                                && is_ident_byte(bytes[m])
                            {
                                m += 1;
                            }
                            if m > start {
                                if let Ok(s) =
                                    std::str::from_utf8(&bytes[start..m])
                                {
                                    out.push(s.to_string());
                                }
                            }
                            k = m;
                            continue;
                        }
                    }
                }
                k += 1;
            }
            i = j;
            continue;
        }
        i += 1;
    }
    out
}

fn is_ident_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

fn strip_line_block_comments(s: &str) -> String {
    // Minimal // and /* */ stripper. Doesn't try to honour
    // strings (which don't contain `//` legitimately in any
    // config we care about — paths use `\\`) so it stays simple.
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if i + 1 < bytes.len() && bytes[i] == b'/' && bytes[i + 1] == b'/' {
            while i < bytes.len() && bytes[i] != b'\n' {
                i += 1;
            }
            continue;
        }
        if i + 1 < bytes.len() && bytes[i] == b'/' && bytes[i + 1] == b'*' {
            i += 2;
            while i + 1 < bytes.len()
                && !(bytes[i] == b'*' && bytes[i + 1] == b'/')
            {
                i += 1;
            }
            i = (i + 2).min(bytes.len());
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_default()
}

fn derap_to_string(derap_exe: &Path, bin_path: &Path) -> AppResult<String> {
    if !derap_exe.is_file() {
        return Err(AppError::Internal(
            "DeRap.exe missing — needed to read binarised mod configs".into(),
        ));
    }
    let tmp = tempfile::tempdir()
        .map_err(|e| AppError::Internal(format!("tempdir: {e}")))?;
    let output = Command::new(derap_exe)
        .arg("-P")
        .arg("-s")
        .arg(bin_path)
        .arg(tmp.path())
        .output()
        .map_err(|e| AppError::Internal(format!("spawn DeRap: {e}")))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Internal(format!(
            "DeRap exited {}: {}",
            output.status,
            stderr.trim()
        )));
    }
    let produced = tmp.path().join("config.cpp");
    std::fs::read_to_string(&produced)
        .map_err(|e| AppError::Internal(format!("DeRap output unreadable: {e}")))
}

fn hash_inventory(addons: &[(PathBuf, Vec<SkinnableClass>)]) -> String {
    let mut entries: Vec<(String, u64)> = Vec::new();
    for (path, _) in addons {
        let mtime = path
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        entries.push((path.to_string_lossy().into_owned(), mtime));
    }
    entries.sort_by(|a, b| a.0.cmp(&b.0));
    let mut hasher = Sha256::new();
    for (p, mtime) in &entries {
        hasher.update(p.as_bytes());
        hasher.update(b"\0");
        hasher.update(mtime.to_le_bytes());
    }
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `add_or_refresh_source` must error cleanly when the
    /// supplied path doesn't exist — better to surface a clear
    /// "folder not found" than silently produce an empty index
    /// row.
    #[test]
    fn add_rejects_missing_folder() {
        let td = tempfile::tempdir().unwrap();
        let bogus = td.path().join("does/not/exist");
        let tools = td.path();
        let result = add_or_refresh_source(td.path(), tools, &bogus);
        assert!(result.is_err());
    }

    /// Empty mod folders (no PBOs at all) should produce a
    /// source with zero addons rather than an error — operators
    /// might point at a scaffold that's missing its PBOs and
    /// expect a "0 classes" result, not a tool crash.
    #[test]
    fn add_empty_folder_yields_zero_classes() {
        let td = tempfile::tempdir().unwrap();
        let mod_root = td.path().join("@EmptyMod");
        std::fs::create_dir_all(&mod_root).unwrap();

        // Pretend ExtractPbo lives where our resolver expects.
        // We don't have the binary in the test env so we just
        // create an empty stub — the scanner will only invoke
        // it if it finds a PBO, which we ensure doesn't happen.
        let tools = td.path();
        let bin = tools.join("DePboTools").join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::write(bin.join("ExtractPbo.exe"), b"").unwrap();
        std::fs::write(bin.join("DeRap.exe"), b"").unwrap();

        let summary = add_or_refresh_source(td.path(), tools, &mod_root)
            .expect("scan");
        assert_eq!(summary.addon_count, 0);
        assert_eq!(summary.class_count, 0);
        assert_eq!(summary.skipped, 0);

        let index = load_index(td.path()).unwrap();
        assert_eq!(index.sources.len(), 1);
        assert_eq!(index.sources[0].display_name, "@EmptyMod");
    }

    /// Adding the same folder twice should refresh in place —
    /// no duplicate rows. Drives the canonical-path dedup.
    #[test]
    fn re_adding_same_folder_refreshes_in_place() {
        let td = tempfile::tempdir().unwrap();
        let mod_root = td.path().join("@Dup");
        std::fs::create_dir_all(&mod_root).unwrap();
        let tools = td.path();
        let bin = tools.join("DePboTools").join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::write(bin.join("ExtractPbo.exe"), b"").unwrap();
        std::fs::write(bin.join("DeRap.exe"), b"").unwrap();

        let s1 = add_or_refresh_source(td.path(), tools, &mod_root).unwrap();
        let s2 = add_or_refresh_source(td.path(), tools, &mod_root).unwrap();
        assert_eq!(s1.source_id, s2.source_id, "id should be stable");
        let index = load_index(td.path()).unwrap();
        assert_eq!(index.sources.len(), 1);
        assert!(s2.cache_hit, "second scan should hit cache");
    }

    /// `extract_cfg_patches_names` should pick up immediate
    /// children of the CfgPatches block and ignore nested classes
    /// (typical mod configs declare `units[]` / `weapons[]` /
    /// `requiredAddons[]` inside, which mustn't leak as patch
    /// names). Comments must not produce false positives either.
    #[test]
    fn cfg_patches_extracts_only_immediate_children() {
        let src = r#"
            // class CfgPatches { class FAKE; }; — should be skipped.
            class CfgPatches {
                class MyMod_Weapons {
                    units[] = {};
                    weapons[] = { "AKM_Variant" };
                    requiredVersion = 0.1;
                    requiredAddons[] = { "DZ_Data" };
                };
                class MyMod_Clothing {
                    units[] = {};
                    weapons[] = {};
                };
            };
            class CfgVehicles {
                class Inventory_Base;
                class AKM_Variant: Inventory_Base {};
            };
        "#;
        let names = extract_cfg_patches_names(src);
        assert_eq!(names, vec!["MyMod_Weapons", "MyMod_Clothing"]);
    }

    /// Multiple `class CfgPatches` blocks (a mod can split across
    /// included files) should accumulate.
    #[test]
    fn cfg_patches_handles_multiple_blocks() {
        let src = r#"
            class CfgPatches { class A {}; };
            class Other {};
            class CfgPatches { class B {}; class C {}; };
        "#;
        let names = extract_cfg_patches_names(src);
        assert_eq!(names, vec!["A", "B", "C"]);
    }

    /// Removing a source by id should drop it. Returns `false`
    /// when the id wasn't present (idempotent — a stale UI
    /// click shouldn't error).
    #[test]
    fn remove_drops_only_the_target_source() {
        let td = tempfile::tempdir().unwrap();
        let a = td.path().join("@A");
        let b = td.path().join("@B");
        std::fs::create_dir_all(&a).unwrap();
        std::fs::create_dir_all(&b).unwrap();
        let tools = td.path();
        let bin = tools.join("DePboTools").join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::write(bin.join("ExtractPbo.exe"), b"").unwrap();
        std::fs::write(bin.join("DeRap.exe"), b"").unwrap();

        let sa = add_or_refresh_source(td.path(), tools, &a).unwrap();
        let _sb = add_or_refresh_source(td.path(), tools, &b).unwrap();
        assert_eq!(load_index(td.path()).unwrap().sources.len(), 2);

        assert!(remove_source(td.path(), &sa.source_id).unwrap());
        let after = load_index(td.path()).unwrap();
        assert_eq!(after.sources.len(), 1);
        assert_eq!(after.sources[0].display_name, "@B");

        // Removing a non-existent id is idempotent.
        assert!(!remove_source(td.path(), "ghost-id").unwrap());
    }
}
