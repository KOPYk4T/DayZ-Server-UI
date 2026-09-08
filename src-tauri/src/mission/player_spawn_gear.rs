//! Starting-gear loader.
//!
//! DayZ 1.24+ reads `cfggameplay.json` → `PlayerData.spawnGearPresetFiles`
//! (usually `spawnPresets/SurvivorPreset.json`). Older missions still
//! use a single `cfgPlayerSpawnGear.json` in the mission root. We
//! prefer the live cfggameplay list so a server that never created
//! the legacy file still shows the gear players actually spawn with.

use crate::domain::{PlayerSpawnGear, SpawnKit};
use crate::error::AppResult;
use crate::parsers::cfg_player_spawn_gear_json;

use super::{cfg_gameplay, MissionContext};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GearFileSource {
    SpawnPresets,
    CfgPlayerSpawnGear,
    Missing,
}

impl GearFileSource {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::SpawnPresets => "spawnPresets",
            Self::CfgPlayerSpawnGear => "cfgPlayerSpawnGear",
            Self::Missing => "missing",
        }
    }
}

pub fn path(ctx: &MissionContext) -> std::path::PathBuf {
    // Casing varies in the wild — some missions carry lowercase
    // `cfgplayerspawngear.json`. Prefer the canonical PascalCase
    // first, fall back to a case-insensitive scan of the root.
    let canonical = ctx.mission_root.join("cfgPlayerSpawnGear.json");
    if canonical.exists() {
        return canonical;
    }
    if let Ok(rd) = std::fs::read_dir(&ctx.mission_root) {
        for entry in rd.flatten() {
            let name = entry.file_name();
            let name_lower = name.to_string_lossy().to_ascii_lowercase();
            if name_lower == "cfgplayerspawngear.json" {
                return entry.path();
            }
        }
    }
    canonical
}

/// Paths listed in `cfggameplay.json` `spawnGearPresetFiles`, resolved
/// against the mission root. Missing files are skipped.
pub fn spawn_preset_paths(ctx: &MissionContext) -> Vec<std::path::PathBuf> {
    let Ok(Some(cfg)) = cfg_gameplay::load(ctx) else {
        return Vec::new();
    };
    let Some(player) = cfg.player_data.as_ref() else {
        return Vec::new();
    };
    let Some(files) = player.spawn_gear_preset_files.as_ref() else {
        return Vec::new();
    };
    files
        .iter()
        .filter_map(|rel| {
            let trimmed = rel.trim();
            if trimmed.is_empty() {
                return None;
            }
            let p = ctx.mission_root.join(trimmed);
            if p.exists() {
                Some(p)
            } else {
                None
            }
        })
        .collect()
}

pub fn resolve_source(ctx: &MissionContext) -> GearFileSource {
    if !spawn_preset_paths(ctx).is_empty() {
        return GearFileSource::SpawnPresets;
    }
    if path(ctx).exists() {
        return GearFileSource::CfgPlayerSpawnGear;
    }
    GearFileSource::Missing
}

pub fn load_kits(ctx: &MissionContext) -> AppResult<Vec<SpawnKit>> {
    let mut kits = Vec::new();
    for p in spawn_preset_paths(ctx) {
        let rel = p
            .strip_prefix(&ctx.workspace)
            .map(|r| r.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|_| p.to_string_lossy().replace('\\', "/"));
        kits.push(cfg_player_spawn_gear_json::parse_spawn_kit_file(&p, rel)?);
    }
    Ok(kits)
}

pub fn save_kits(ctx: &MissionContext, kits: &[SpawnKit]) -> AppResult<()> {
    let listed: Vec<String> = spawn_preset_paths(ctx)
        .into_iter()
        .map(|p| {
            p.strip_prefix(&ctx.workspace)
                .map(|r| r.to_string_lossy().replace('\\', "/"))
                .unwrap_or_else(|_| p.to_string_lossy().replace('\\', "/"))
        })
        .collect();
    for kit in kits {
        let rel = kit.rel_path.replace('\\', "/");
        if !listed.iter().any(|l| l == &rel) {
            return Err(crate::error::AppError::Internal(format!(
                "refusing to write {rel} — not listed in cfggameplay spawnGearPresetFiles"
            )));
        }
        let mut p = ctx.workspace.clone();
        for part in rel.split(['/', '\\']) {
            if part.is_empty() || part == "." {
                continue;
            }
            if part == ".." {
                return Err(crate::error::AppError::Internal(
                    "spawn kit path must stay inside the workspace".into(),
                ));
            }
            p.push(part);
        }
        cfg_player_spawn_gear_json::write_spawn_kit_file(&p, kit)?;
    }
    Ok(())
}

pub fn load(ctx: &MissionContext) -> AppResult<PlayerSpawnGear> {
    match resolve_source(ctx) {
        GearFileSource::SpawnPresets => {
            let mut merged = PlayerSpawnGear::default();
            for p in spawn_preset_paths(ctx) {
                let one = cfg_player_spawn_gear_json::parse_file(&p)?;
                merged.loadouts.extend(one.loadouts);
            }
            Ok(merged)
        }
        GearFileSource::CfgPlayerSpawnGear => {
            cfg_player_spawn_gear_json::parse_file(&path(ctx))
        }
        GearFileSource::Missing => Ok(PlayerSpawnGear::default()),
    }
}

/// Resolve `init.c` inside the mission root. Like `cfgPlayerSpawnGear.json`,
/// we fall back to a case-insensitive match since a few missions ship
/// `Init.c` or similar.
pub fn init_c_path(ctx: &MissionContext) -> std::path::PathBuf {
    let canonical = ctx.mission_root.join("init.c");
    if canonical.exists() {
        return canonical;
    }
    if let Ok(rd) = std::fs::read_dir(&ctx.mission_root) {
        for entry in rd.flatten() {
            let name = entry.file_name();
            if name.to_string_lossy().to_ascii_lowercase() == "init.c" {
                return entry.path();
            }
        }
    }
    canonical
}

pub fn write_json(
    ctx: &MissionContext,
    text: &str,
) -> AppResult<std::path::PathBuf> {
    let p = path(ctx);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&p, text)?;
    Ok(p)
}

/// Typed save — serialize the domain model and write.
/// Only valid for the legacy single-file source. Spawn presets are
/// a different schema; writing `cfgPlayerSpawnGear.json` would be
/// ignored by the engine.
pub fn save(ctx: &MissionContext, model: &PlayerSpawnGear) -> AppResult<()> {
    cfg_player_spawn_gear_json::write(&path(ctx), model)
}
