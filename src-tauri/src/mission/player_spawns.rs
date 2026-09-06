//! Singleton loader for `cfgplayerspawnpoints.xml` (PDR §9.6).
//!
//! No CE override mechanism for this file — edits go straight in.
//! Pre-save git commit is the safety net.

use crate::domain::PlayerSpawnPoints;
use crate::error::AppResult;
use crate::parsers::cfg_playerspawnpoints_xml;

use super::MissionContext;

pub fn path(ctx: &MissionContext) -> std::path::PathBuf {
    ctx.mission_root.join("cfgplayerspawnpoints.xml")
}

pub fn load(ctx: &MissionContext) -> AppResult<PlayerSpawnPoints> {
    let p = path(ctx);
    if p.exists() {
        cfg_playerspawnpoints_xml::parse_file(&p)
    } else {
        Ok(PlayerSpawnPoints::default())
    }
}

pub fn save(ctx: &MissionContext, sp: &PlayerSpawnPoints) -> AppResult<()> {
    cfg_playerspawnpoints_xml::write(&path(ctx), sp)
}


