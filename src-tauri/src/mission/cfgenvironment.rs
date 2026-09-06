//! Mission-side loader for `<mission>/cfgenvironment.xml`.
//!
//! This file ties the raw territory geometry under `db/env/*.xml` to
//! actual game behaviour (which entities spawn, count limits, etc).
//! If it doesn't exist the territory zones never activate, even
//! though the geometry files parse fine.

use std::path::PathBuf;

use crate::error::AppResult;
use crate::parsers::cfgenvironment_xml::{self, CfgEnvironment};

use super::MissionContext;

pub fn path(ctx: &MissionContext) -> PathBuf {
    ctx.mission_root.join("cfgenvironment.xml")
}

/// `Ok(None)` when the file is absent — missions that don't touch
/// animal spawning can validly omit it, and the frontend surfaces
/// the absence instead of erroring out.
pub fn load(ctx: &MissionContext) -> AppResult<Option<CfgEnvironment>> {
    let p = path(ctx);
    if !p.is_file() {
        return Ok(None);
    }
    Ok(Some(cfgenvironment_xml::parse_file(&p)?))
}

pub fn save(ctx: &MissionContext, cfg: &CfgEnvironment) -> AppResult<PathBuf> {
    let p = path(ctx);
    cfgenvironment_xml::write_file(&p, cfg)?;
    Ok(p)
}

/// Join the `<file path="env/…"/>` stem DayZ expects back to a full
/// geometry filename. Used when adding a custom animal so the tool
/// can spell the new `_territories.xml` file consistently.
pub fn env_path_for_stem(stem: &str) -> String {
    format!("env/{stem}.xml")
}

/// Inverse of `env_path_for_stem` — returns the bare `_territories`
/// stem when given a full `env/…_territories.xml` path. Everything
/// else is passed through unchanged.
pub fn stem_from_env_path(path: &str) -> &str {
    path.strip_prefix("env/")
        .and_then(|rest| rest.strip_suffix(".xml"))
        .unwrap_or(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stem_roundtrip() {
        assert_eq!(env_path_for_stem("wolf_territories"), "env/wolf_territories.xml");
        assert_eq!(stem_from_env_path("env/wolf_territories.xml"), "wolf_territories");
        assert_eq!(stem_from_env_path("unexpected.xml"), "unexpected.xml");
    }
}

