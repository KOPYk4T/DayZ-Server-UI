//! Singleton loader for `globals.xml` (PDR §5.6 / Phase 7a).
//!
//! Lives under `mpmissions/<mission>/db/globals.xml`. No CE override
//! system — edits write directly; pre-save git commit is the safety
//! net.

use crate::domain::Globals;
use crate::error::AppResult;
use crate::parsers::globals_xml;

use super::MissionContext;

pub fn path(ctx: &MissionContext) -> std::path::PathBuf {
    ctx.db_dir.join("globals.xml")
}

pub fn load(ctx: &MissionContext) -> AppResult<Globals> {
    let p = path(ctx);
    if p.exists() {
        globals_xml::parse_file(&p)
    } else {
        Ok(Globals::default())
    }
}

pub fn save(ctx: &MissionContext, g: &Globals) -> AppResult<()> {
    globals_xml::write(&path(ctx), g)
}
