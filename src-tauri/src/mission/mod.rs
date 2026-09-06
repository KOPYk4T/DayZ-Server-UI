//! Mission-folder awareness: given a workspace + profile, compute the set
//! of files that feed the Central Economy, parse them, and present a
//! unified view that editors can query and write against.

pub mod buildings;
pub mod cfg_gameplay;
pub mod cfgenvironment;
pub mod events;
pub mod globals;
pub mod import;
pub mod items;
pub mod limits;
pub mod loadouts;
pub mod player_spawn_gear;
pub mod player_spawns;
pub mod server_cfg;
pub mod territories;

use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};
use crate::profiles::ServerProfile;

/// Bundles the workspace paths the app touches for a given profile.
pub struct MissionContext {
    pub workspace: PathBuf,
    pub mission_root: PathBuf,
    pub custom_dir: PathBuf,
    pub db_dir: PathBuf,
    pub cfgeconomycore_path: PathBuf,
}

impl MissionContext {
    pub fn resolve(workspace: &Path, profile: &ServerProfile) -> AppResult<Self> {
        let mission_root = workspace.join(&profile.paths.mpmissions_relative);
        if !mission_root.exists() {
            return Err(AppError::Sync(format!(
                "mission folder not found — pull first: {}",
                mission_root.display()
            )));
        }
        let custom_dir = mission_root.join("custom");
        let db_dir = mission_root.join("db");
        let cfgeconomycore_path = mission_root.join("cfgeconomycore.xml");
        Ok(Self {
            workspace: workspace.to_path_buf(),
            mission_root,
            custom_dir,
            db_dir,
            cfgeconomycore_path,
        })
    }

    pub fn ensure_custom_dir(&self) -> AppResult<()> {
        std::fs::create_dir_all(&self.custom_dir).map_err(Into::into)
    }
}
