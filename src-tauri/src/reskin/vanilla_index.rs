//! Vanilla class index — walks `P:\DZ\` for every addon's
//! `config.cpp` (or `config.bin`, via DeRap) and records every class
//! that exposes at least one `hiddenSelections*` array.
//!
//! The index is cached to `<app-data>/reskin/vanilla-class-index.json`
//! so subsequent launches don't pay the full P: scan. A hash of the
//! (addon-name, config.bin-mtime, config.cpp-mtime) tuples for every
//! addon decides whether the cache is still valid; when the operator
//! runs Extract Game Data again after a DayZ update, the hash shifts
//! and the next build picks up the change.
//!
//! This module never writes to P: — when only `config.bin` exists for
//! an addon, DeRap is invoked with a temp-dir destination so the P:
//! drive stays as the operator left it.

use std::path::{Path, PathBuf};
use std::process::Command;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::error::{AppError, AppResult};

use super::config_parser::{self, SkinnableClass};
use super::tools;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VanillaClassIndex {
    /// RFC3339 timestamp of the build.
    pub built_at: String,
    /// Absolute path of the P:\DZ\ root this index scanned.
    pub dz_root: String,
    /// Stable hash of the scanned addon inventory + mtimes. When
    /// this shifts the cache is stale and must rebuild.
    pub inventory_hash: String,
    pub addon_count: u32,
    pub class_count: u32,
    pub classes: Vec<SkinnableClass>,
    /// Addons we skipped with reasons — so the UI can surface "2
    /// addons failed, here's why" instead of silently eating errors.
    #[serde(default)]
    pub skipped: Vec<SkippedAddon>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedAddon {
    pub addon: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexBuildSummary {
    pub addon_count: u32,
    pub class_count: u32,
    pub skipped: u32,
    pub duration_ms: u64,
    pub cache_path: String,
}

pub fn cache_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("reskin").join("vanilla-class-index.json")
}

pub fn dz_root() -> PathBuf {
    PathBuf::from("P:\\DZ")
}

pub fn build_index(app_data_dir: &Path, tools_dir: &Path) -> AppResult<IndexBuildSummary> {
    let started = std::time::Instant::now();
    let dz = dz_root();
    if !dz.is_dir() {
        return Err(AppError::Internal(format!(
            "P:\\DZ\\ not found — mount the P: drive and extract game data before building the vanilla index"
        )));
    }

    let derap = tools::derap_exe(tools_dir);
    let derap_available = derap.is_file();

    let mut classes: Vec<SkinnableClass> = Vec::new();
    let mut skipped: Vec<SkippedAddon> = Vec::new();
    let mut inventory: Vec<(String, u64, u64)> = Vec::new();
    let mut addon_count: u32 = 0;

    // Walk every directory under P:\DZ\ recursively — DayZ's Extract
    // Game Data can nest addons several levels deep (e.g.
    // `weapons/firearms/akm/config.cpp`), so a shallow scan misses
    // most of them. Each directory containing a `config.cpp` or a
    // `config.bin` counts as one addon.
    let walker = walkdir::WalkDir::new(&dz).follow_links(false);
    for entry in walker.into_iter().filter_map(Result::ok) {
        if !entry.file_type().is_dir() {
            continue;
        }
        let dir = entry.path();
        let cpp_path = dir.join("config.cpp");
        let bin_path = dir.join("config.bin");

        let has_cpp = cpp_path.is_file();
        let has_bin = bin_path.is_file();
        if !has_cpp && !has_bin {
            continue;
        }

        let addon_name = dir
            .strip_prefix(&dz)
            .ok()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|| dir.to_string_lossy().into_owned());

        addon_count += 1;
        let cpp_mtime = cpp_path.metadata().and_then(|m| m.modified()).ok();
        let bin_mtime = bin_path.metadata().and_then(|m| m.modified()).ok();
        inventory.push((
            addon_name.clone(),
            mtime_to_u64(cpp_mtime),
            mtime_to_u64(bin_mtime),
        ));

        let cpp_text = if has_cpp {
            match std::fs::read_to_string(&cpp_path) {
                Ok(text) => text,
                Err(e) => {
                    skipped.push(SkippedAddon {
                        addon: addon_name,
                        reason: format!("read config.cpp failed: {e}"),
                    });
                    continue;
                }
            }
        } else if has_bin {
            if !derap_available {
                skipped.push(SkippedAddon {
                    addon: addon_name,
                    reason: "only config.bin present and DeRap.exe is missing".into(),
                });
                continue;
            }
            match derap_to_string(&derap, &bin_path) {
                Ok(text) => text,
                Err(e) => {
                    skipped.push(SkippedAddon {
                        addon: addon_name,
                        reason: format!("DeRap failed: {e}"),
                    });
                    continue;
                }
            }
        } else {
            continue;
        };

        let parsed = config_parser::parse(&cpp_text);
        classes.extend(parsed);
    }

    let class_count = classes.len() as u32;
    let skipped_count = skipped.len() as u32;
    let inventory_hash = hash_inventory(&inventory);

    let index = VanillaClassIndex {
        built_at: Utc::now().to_rfc3339(),
        dz_root: dz.to_string_lossy().into_owned(),
        inventory_hash,
        addon_count,
        class_count,
        classes,
        skipped,
    };

    let cache = cache_path(app_data_dir);
    if let Some(parent) = cache.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&cache, serde_json::to_vec_pretty(&index)?)?;

    Ok(IndexBuildSummary {
        addon_count,
        class_count,
        skipped: skipped_count,
        duration_ms: started.elapsed().as_millis() as u64,
        cache_path: cache.to_string_lossy().into_owned(),
    })
}

pub fn load_index(app_data_dir: &Path) -> AppResult<Option<VanillaClassIndex>> {
    let cache = cache_path(app_data_dir);
    if !cache.is_file() {
        return Ok(None);
    }
    let bytes = std::fs::read(&cache)?;
    if bytes.is_empty() {
        return Ok(None);
    }
    let index: VanillaClassIndex = serde_json::from_slice(&bytes)?;
    Ok(Some(index))
}

fn mtime_to_u64(t: Option<std::time::SystemTime>) -> u64 {
    t.and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn hash_inventory(inventory: &[(String, u64, u64)]) -> String {
    let mut sorted = inventory.to_vec();
    sorted.sort_by(|a, b| a.0.cmp(&b.0));
    let mut hasher = Sha256::new();
    for (name, cpp_mtime, bin_mtime) in &sorted {
        hasher.update(name.as_bytes());
        hasher.update(b"\0");
        hasher.update(cpp_mtime.to_le_bytes());
        hasher.update(bin_mtime.to_le_bytes());
    }
    format!("{:x}", hasher.finalize())
}

fn derap_to_string(derap_exe: &Path, bin_path: &Path) -> AppResult<String> {
    // DeRap writes the output as `<basename>.cpp` in the destination
    // folder — so hand it a fresh temp dir, run, then read the
    // `config.cpp` it produced. `-P` suppresses the "press any key"
    // pause; `-s` silences noise.
    let tmp = tempfile::tempdir()?;
    let output = Command::new(derap_exe)
        .arg("-P")
        .arg("-s")
        .arg(bin_path)
        .arg(tmp.path())
        .output()
        .map_err(|e| AppError::Internal(format!("spawn DeRap failed: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Internal(format!(
            "DeRap exited {}: {}",
            output.status,
            stderr.trim()
        )));
    }
    let produced = tmp.path().join("config.cpp");
    let text = std::fs::read_to_string(&produced)
        .map_err(|e| AppError::Internal(format!("DeRap output unreadable: {e}")))?;
    Ok(text)
}
