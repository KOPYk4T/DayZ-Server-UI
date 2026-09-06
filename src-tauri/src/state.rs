use std::path::PathBuf;
use std::sync::Arc;

use tokio::sync::{Mutex, RwLock};

use crate::profiles::ProfileStore;

/// App-wide state held by Tauri `State<AppState>`. Thin wrapper so commands
/// can grab the profile store and figure out workspace paths without
/// every file poking at the filesystem directly.
pub struct AppState {
    pub app_data_dir: PathBuf,
    pub profiles: Arc<Mutex<ProfileStore>>,
    /// Currently-active profile id. The frontend mirrors its
    /// profile-store selection here so headless backend callers
    /// (CLI, capability checks, future scheduled tasks) resolve the
    /// same profile the user is looking at. RwLock instead of
    /// Mutex because reads massively outnumber writes — every
    /// capability poll reads, only an explicit profile-switch writes.
    pub active_profile_id: Arc<RwLock<Option<String>>>,
}

impl AppState {
    pub fn workspaces_root(&self) -> PathBuf {
        self.app_data_dir.join("workspaces")
    }

    pub fn workspace_for(&self, profile_id: &str) -> PathBuf {
        self.workspaces_root().join(profile_id)
    }

    pub fn config_dir(&self) -> PathBuf {
        self.app_data_dir.join("config")
    }

    pub fn profiles_file(&self) -> PathBuf {
        self.config_dir().join("profiles.json")
    }

    /// Directory for per-profile edit ledgers — tracks in-place
    /// mutations the app has made to mission files so a pull / mod
    /// update doesn't silently wipe operator customisations. See
    /// `crate::edits` for the semantics.
    pub fn edits_dir(&self) -> PathBuf {
        self.app_data_dir.join("edits")
    }

    pub fn backups_root(&self) -> PathBuf {
        self.app_data_dir.join("backups")
    }

    pub fn backups_for(&self, profile_id: &str) -> PathBuf {
        self.backups_root().join(profile_id)
    }
}
