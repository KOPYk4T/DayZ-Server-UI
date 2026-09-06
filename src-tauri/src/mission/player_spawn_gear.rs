//! Singleton loader for `cfgPlayerSpawnGear.json` (PDR §9.7 / Phase 6).
//!
//! DayZ's starting-gear config. Lives in the mission root alongside
//! `cfgeconomycore.xml` and `init.c`. Phase 6a is read-only — no
//! write path yet; that lands in 6b once the editor surface is
//! designed.

use crate::domain::PlayerSpawnGear;
use crate::error::AppResult;
use crate::parsers::cfg_player_spawn_gear_json;

use super::MissionContext;

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

pub fn load(ctx: &MissionContext) -> AppResult<PlayerSpawnGear> {
    let p = path(ctx);
    if p.exists() {
        cfg_player_spawn_gear_json::parse_file(&p)
    } else {
        Ok(PlayerSpawnGear::default())
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
pub fn save(ctx: &MissionContext, model: &PlayerSpawnGear) -> AppResult<()> {
    cfg_player_spawn_gear_json::write(&path(ctx), model)
}
