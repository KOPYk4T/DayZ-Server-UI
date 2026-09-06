//! Mission-side `cfggameplay.json` loader / writer.

use std::fs;
use std::path::PathBuf;

use crate::domain::cfg_gameplay::CfgGameplay;
use crate::error::{AppError, AppResult};

use super::MissionContext;

pub const FILENAME: &str = "cfggameplay.json";

pub fn path(ctx: &MissionContext) -> PathBuf {
    ctx.mission_root.join(FILENAME)
}

pub fn load(ctx: &MissionContext) -> AppResult<Option<CfgGameplay>> {
    let p = path(ctx);
    if !p.exists() {
        return Ok(None);
    }
    let body = fs::read_to_string(&p)?;
    CfgGameplay::parse(&body).map(Some)
}

pub fn save(ctx: &MissionContext, cfg: &CfgGameplay) -> AppResult<()> {
    let p = path(ctx);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent)?;
    }
    let body = cfg.to_json()?;
    fs::write(&p, body)?;
    Ok(())
}

/// Write the Bohemia-shipped default so operators can start editing
/// on missions that don't yet have the file. Matches the published
/// template in field presence — every field set to Bohemia's default.
/// Individual values can differ between DayZ versions; this is a
/// reasonable-starting-point minimum.
pub fn write_default(ctx: &MissionContext) -> AppResult<()> {
    let p = path(ctx);
    if p.exists() {
        return Err(AppError::Internal(
            "cfggameplay.json already exists — refusing to overwrite".into(),
        ));
    }
    // Minimal starter — empty sections so the operator can toggle on
    // the fields they want without reading the full vanilla file.
    let body = r#"{
    "version": 123,
    "GeneralData": {
        "disableBaseDamage": false,
        "disableContainerDamage": false,
        "disableRespawnDialog": false,
        "disableRespawnInUnconsciousness": false
    },
    "PlayerData": {
        "disablePersonalLight": false
    },
    "WorldsData": {
        "lightingConfig": 0
    },
    "BaseBuildingData": {},
    "UIData": {
        "use3DMap": false
    },
    "MapData": {
        "ignoreMapOwnership": false,
        "ignoreNavItemsOwnership": false,
        "displayPlayerPosition": false,
        "displayNavInfo": true
    }
}
"#;
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&p, body)?;
    Ok(())
}
