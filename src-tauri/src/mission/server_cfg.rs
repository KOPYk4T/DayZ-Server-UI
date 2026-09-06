//! Singleton loader for `serverDZ.cfg` (PDR §7 / Phase 7b).
//!
//! Unlike the CE XML files, `serverDZ.cfg` doesn't live in a fixed
//! spot — different server setups keep it in different places. We
//! walk a short list of candidate paths and pick the first match.
//! If none exist, the editor can still work on an empty config that
//! gets written to the conventional location (`<workspace>/serverDZ.cfg`).

use std::path::{Path, PathBuf};

use crate::domain::ServerCfg;
use crate::error::AppResult;
use crate::parsers::server_cfg;

use super::MissionContext;

/// Ordered search path for the config. First-match wins.
pub fn candidate_paths(ctx: &MissionContext) -> Vec<PathBuf> {
    let ws = &ctx.workspace;
    let profiles_rel_parent = ctx
        .workspace
        .join("profiles")
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| ws.clone());
    let profiles_dir = ctx.workspace.join("profiles");
    vec![
        ws.join("serverDZ.cfg"),
        ws.join("server.cfg"),
        profiles_dir.join("serverDZ.cfg"),
        profiles_dir.join("server.cfg"),
        profiles_rel_parent.join("serverDZ.cfg"),
    ]
}

/// Resolve the existing path, or the default write location when
/// none exists yet (workspace root).
pub fn path(ctx: &MissionContext) -> PathBuf {
    for p in candidate_paths(ctx) {
        if p.exists() {
            return p;
        }
    }
    ctx.workspace.join("serverDZ.cfg")
}

pub fn load(ctx: &MissionContext) -> AppResult<ServerCfg> {
    let p = path(ctx);
    if p.exists() {
        server_cfg::parse_file(&p)
    } else {
        Ok(ServerCfg::default())
    }
}

pub fn save(ctx: &MissionContext, cfg: &ServerCfg) -> AppResult<()> {
    let p = path(ctx);
    server_cfg::write(&p, cfg)
}

/// Workspace-relative display path for the UI.
pub fn display_path(ctx: &MissionContext, p: &Path) -> String {
    p.strip_prefix(&ctx.workspace)
        .map(|r| r.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| p.to_string_lossy().replace('\\', "/"))
}
