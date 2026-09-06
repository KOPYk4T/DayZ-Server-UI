//! Singleton loader for `cfglimitsdefinition.xml` (PDR §9.4).
//!
//! Unlike items/events/loadouts, this file has no CE override
//! mechanism — edits go straight into the mission's
//! `cfglimitsdefinition.xml`. Pre-push git commits provide the revert
//! path.

use crate::domain::LimitsDefinition;
use crate::error::AppResult;
use crate::parsers::cfg_limitsdefinition_xml;

use super::MissionContext;

pub fn path(ctx: &MissionContext) -> std::path::PathBuf {
    ctx.mission_root.join("cfglimitsdefinition.xml")
}

pub fn load(ctx: &MissionContext) -> AppResult<LimitsDefinition> {
    let p = path(ctx);
    if p.exists() {
        cfg_limitsdefinition_xml::parse_file(&p)
    } else {
        // Missing file is unusual but not fatal — present an empty
        // definition so the UI can still render and guide the user
        // toward creating entries.
        Ok(LimitsDefinition::default())
    }
}

pub fn save(ctx: &MissionContext, def: &LimitsDefinition) -> AppResult<()> {
    cfg_limitsdefinition_xml::write_def(&path(ctx), def)
}
