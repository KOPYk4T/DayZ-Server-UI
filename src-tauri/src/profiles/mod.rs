//! Server profile store.
//!
//! Persists non-secret profile metadata to `<app_data>/config/profiles.json`.
//! Secrets (SFTP password, key passphrase) live in the OS keychain and are
//! accessed through [`secrets`].

pub mod secrets;

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionMode {
    Sftp,
    Local,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AuthType {
    Password,
    PrivateKey,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MapId {
    Chernarusplus,
    Enoch,
    Sakhal,
    Custom,
}

impl MapId {
    /// Guess the vanilla map ID from a mission folder name. Livonia
    /// maps to `Enoch` because Bohemia's internal ID for Livonia is
    /// `enoch`. Returns `None` for modded / custom templates.
    pub fn from_folder_name(name: &str) -> Option<Self> {
        let lower = name.to_ascii_lowercase();
        if lower.contains("chernarus") {
            return Some(MapId::Chernarusplus);
        }
        if lower.contains("enoch") || lower.contains("livonia") {
            return Some(MapId::Enoch);
        }
        if lower.contains("sakhal") {
            return Some(MapId::Sakhal);
        }
        None
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpConnection {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: AuthType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub private_key_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub known_host_fingerprint: Option<String>,
    /// Optional absolute path on the server that all relative mission
    /// / profile / root-file paths are resolved against. Leave unset
    /// to let the SSH session's default working directory (usually
    /// the login user's home) decide. Set to e.g. `/opt/dayz` when
    /// the server install lives outside the login home.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remote_root: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalConnection {
    pub root_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfilePaths {
    pub mpmissions_relative: String,
    pub profiles_relative: String,
    /// Folder name on the local dedicated server when it differs from
    /// `profiles_relative` (workspace + SFTP). Example: remote
    /// `profiles`, local `instances`. `None` means the same name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub local_profiles_relative: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModRef {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(default)]
    pub detected_files: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteCommand {
    pub label: String,
    pub cmd: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteCommands {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub restart: Option<String>,
    #[serde(default)]
    pub custom: Vec<RemoteCommand>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerProfile {
    pub id: String,
    pub name: String,
    pub mode: ConnectionMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sftp: Option<SftpConnection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub local: Option<LocalConnection>,
    pub paths: ProfilePaths,
    pub map: MapId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_map_id: Option<String>,
    /// World-metre extent override for `map == Custom`. Lets
    /// operators with non-vanilla terrains set the map canvas and
    /// bounds correctly. Ignored unless `map` is `Custom`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_map_size_m: Option<u32>,
    /// Absolute local path where profile outputs land — modpack
    /// builds, CE-zone PBOs, extracted files. `None` = fall back
    /// to the app's data directory. Kept optional so existing
    /// profiles deserialise without migration; legacy builds keep
    /// writing to app data until the operator opts in.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub work_dir: Option<String>,
    #[serde(default)]
    pub mods: Vec<ModRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remote_commands: Option<RemoteCommands>,
    pub created_at: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_pull_at: Option<DateTime<Utc>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_push_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileDraft {
    pub name: String,
    pub mode: ConnectionMode,
    #[serde(default)]
    pub sftp: Option<SftpConnection>,
    #[serde(default)]
    pub local: Option<LocalConnection>,
    pub paths: ProfilePaths,
    pub map: MapId,
    #[serde(default)]
    pub custom_map_id: Option<String>,
    #[serde(default)]
    pub custom_map_size_m: Option<u32>,
    #[serde(default)]
    pub work_dir: Option<String>,
    #[serde(default)]
    pub remote_commands: Option<RemoteCommands>,
}

impl ProfileDraft {
    pub fn validate(&self) -> AppResult<()> {
        let name = self.name.trim();
        if name.is_empty() {
            return Err(AppError::InvalidProfile("name is required".into()));
        }
        match self.mode {
            ConnectionMode::Sftp => {
                let s = self
                    .sftp
                    .as_ref()
                    .ok_or_else(|| AppError::InvalidProfile("sftp connection required".into()))?;
                if s.host.trim().is_empty() {
                    return Err(AppError::InvalidProfile("host is required".into()));
                }
                if s.username.trim().is_empty() {
                    return Err(AppError::InvalidProfile("username is required".into()));
                }
                if s.auth_type == AuthType::PrivateKey
                    && s.private_key_path.as_deref().map(|p| p.trim()).unwrap_or("").is_empty()
                {
                    return Err(AppError::InvalidProfile(
                        "private key path is required".into(),
                    ));
                }
            }
            ConnectionMode::Local => {
                let l = self
                    .local
                    .as_ref()
                    .ok_or_else(|| AppError::InvalidProfile("local connection required".into()))?;
                if l.root_path.trim().is_empty() {
                    return Err(AppError::InvalidProfile("root path is required".into()));
                }
            }
        }
        if self.paths.mpmissions_relative.trim().is_empty() {
            return Err(AppError::InvalidProfile("mpmissions path is required".into()));
        }
        if self.paths.profiles_relative.trim().is_empty() {
            return Err(AppError::InvalidProfile("profiles path is required".into()));
        }
        if matches!(self.map, MapId::Custom)
            && self.custom_map_id.as_deref().map(|s| s.trim()).unwrap_or("").is_empty()
        {
            return Err(AppError::InvalidProfile("custom map id is required".into()));
        }
        if let Some(w) = self.work_dir.as_deref() {
            let trimmed = w.trim();
            if !trimmed.is_empty() && !std::path::Path::new(trimmed).is_absolute() {
                return Err(AppError::InvalidProfile(
                    "workDir must be an absolute path (leave blank to use app data)".into(),
                ));
            }
        }
        Ok(())
    }
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct ProfilesDoc {
    #[serde(default)]
    profiles: Vec<ServerProfile>,
}

pub struct ProfileStore {
    path: PathBuf,
    by_id: HashMap<String, ServerProfile>,
}

impl ProfileStore {
    pub fn load(path: PathBuf) -> AppResult<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let doc: ProfilesDoc = if path.exists() {
            let bytes = std::fs::read(&path)?;
            if bytes.is_empty() {
                ProfilesDoc::default()
            } else {
                serde_json::from_slice(&bytes)?
            }
        } else {
            ProfilesDoc::default()
        };
        let mut by_id = HashMap::new();
        for p in doc.profiles {
            by_id.insert(p.id.clone(), p);
        }
        Ok(Self { path, by_id })
    }

    pub fn list(&self) -> Vec<ServerProfile> {
        let mut v: Vec<_> = self.by_id.values().cloned().collect();
        v.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        v
    }

    pub fn get(&self, id: &str) -> AppResult<ServerProfile> {
        self.by_id
            .get(id)
            .cloned()
            .ok_or_else(|| AppError::ProfileNotFound(id.to_string()))
    }

    pub fn create(&mut self, draft: ProfileDraft) -> AppResult<ServerProfile> {
        draft.validate()?;
        if self
            .by_id
            .values()
            .any(|p| p.name.eq_ignore_ascii_case(&draft.name))
        {
            return Err(AppError::ProfileAlreadyExists(draft.name.clone()));
        }
        let id = Uuid::new_v4().to_string();
        let profile = ServerProfile {
            id: id.clone(),
            name: draft.name,
            mode: draft.mode,
            sftp: draft.sftp,
            local: draft.local,
            paths: draft.paths,
            map: draft.map,
            custom_map_id: draft.custom_map_id,
            custom_map_size_m: draft.custom_map_size_m,
            work_dir: draft.work_dir.and_then(non_empty),
            mods: Vec::new(),
            remote_commands: draft.remote_commands,
            created_at: Utc::now(),
            last_pull_at: None,
            last_push_at: None,
        };
        self.by_id.insert(id.clone(), profile.clone());
        self.persist()?;
        Ok(profile)
    }

    pub fn update(&mut self, id: &str, draft: ProfileDraft) -> AppResult<ServerProfile> {
        draft.validate()?;
        let mut existing = self
            .by_id
            .get(id)
            .cloned()
            .ok_or_else(|| AppError::ProfileNotFound(id.to_string()))?;

        if self
            .by_id
            .values()
            .any(|p| p.id != id && p.name.eq_ignore_ascii_case(&draft.name))
        {
            return Err(AppError::ProfileAlreadyExists(draft.name.clone()));
        }

        existing.name = draft.name;
        existing.mode = draft.mode;
        existing.sftp = draft.sftp;
        existing.local = draft.local;
        existing.paths = draft.paths;
        existing.map = draft.map;
        existing.custom_map_id = draft.custom_map_id;
        existing.custom_map_size_m = draft.custom_map_size_m;
        existing.work_dir = draft.work_dir.and_then(non_empty);
        existing.remote_commands = draft.remote_commands;

        self.by_id.insert(id.to_string(), existing.clone());
        self.persist()?;
        Ok(existing)
    }

    pub fn duplicate(&mut self, id: &str) -> AppResult<ServerProfile> {
        let source = self.get(id)?;
        let mut copy = source;
        copy.id = Uuid::new_v4().to_string();
        copy.name = uniquify_name(&copy.name, &self.by_id);
        copy.created_at = Utc::now();
        copy.last_pull_at = None;
        copy.last_push_at = None;
        self.by_id.insert(copy.id.clone(), copy.clone());
        self.persist()?;
        Ok(copy)
    }

    pub fn delete(&mut self, id: &str) -> AppResult<()> {
        if self.by_id.remove(id).is_none() {
            return Err(AppError::ProfileNotFound(id.to_string()));
        }
        self.persist()?;
        Ok(())
    }

    pub fn mark_pulled(&mut self, id: &str) -> AppResult<()> {
        if let Some(p) = self.by_id.get_mut(id) {
            p.last_pull_at = Some(Utc::now());
            self.persist()?;
        }
        Ok(())
    }

    pub fn mark_pushed(&mut self, id: &str) -> AppResult<()> {
        if let Some(p) = self.by_id.get_mut(id) {
            p.last_push_at = Some(Utc::now());
            self.persist()?;
        }
        Ok(())
    }

    pub fn set_fingerprint(&mut self, id: &str, fingerprint: String) -> AppResult<()> {
        if let Some(p) = self.by_id.get_mut(id) {
            if let Some(sftp) = p.sftp.as_mut() {
                sftp.known_host_fingerprint = Some(fingerprint);
                self.persist()?;
            }
        }
        Ok(())
    }

    fn persist(&self) -> AppResult<()> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let doc = ProfilesDoc {
            profiles: self.by_id.values().cloned().collect(),
        };
        let bytes = serde_json::to_vec_pretty(&doc)?;
        atomic_write(&self.path, &bytes)?;
        Ok(())
    }
}

/// Trim + discard blank strings so `workDir: ""` from the form
/// round-trips to `None` rather than a bogus "empty path" value.
fn non_empty(s: String) -> Option<String> {
    let t = s.trim();
    if t.is_empty() {
        None
    } else {
        Some(t.to_string())
    }
}

fn atomic_write(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, bytes)?;
    if path.exists() {
        let _ = std::fs::remove_file(path);
    }
    std::fs::rename(&tmp, path)?;
    Ok(())
}

fn uniquify_name(base: &str, existing: &HashMap<String, ServerProfile>) -> String {
    let names: Vec<&str> = existing.values().map(|p| p.name.as_str()).collect();
    let mut candidate = format!("{base} (copy)");
    let mut n = 2;
    while names.iter().any(|n2| n2.eq_ignore_ascii_case(&candidate)) {
        candidate = format!("{base} (copy {n})");
        n += 1;
    }
    candidate
}
