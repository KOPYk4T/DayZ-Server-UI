//! Encrypted credential storage via iota-stronghold.
//!
//! SFTP secrets are stored in a Stronghold snapshot at
//! `<app_data>/vault.hold`. The snapshot is protected by a
//! machine-bound password derived from the Windows Machine GUID, so
//! the vault is unreadable on a different machine.
//!
//! # Design
//! - `VaultState` is a synchronous wrapper around `iota_stronghold::Stronghold`.
//! - It is registered as Tauri managed state in `lib.rs` setup.
//! - Module-level free functions (`read`, `write`, `erase`) accept
//!   `&AppHandle<R>` and pull the state out of the handle — keeping
//!   call sites in auth.rs / secrets.rs simple.
//! - Every write commits the snapshot to disk immediately (the vault
//!   file is tiny; commit latency is <5 ms).
//!
//! # Key layout (one Stronghold client named "dayz-cfg-mgr")
//!   `"sftp_secrets"` → JSON bytes of the SFTP secrets map

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use iota_stronghold::{KeyProvider, SnapshotPath, Stronghold};
use sha2::{Digest, Sha256};
use tauri::Manager;
use zeroize::Zeroizing;

use crate::error::{AppError, AppResult};

pub const KEY_SFTP_SECRETS: &str = "sftp_secrets";
const CLIENT: &[u8] = b"dayz-cfg-mgr";

// ---------- Machine-bound password ----------

pub fn machine_password() -> Vec<u8> {
    let mut h = Sha256::new();
    h.update(b"dayz-cfg-mgr-vault-v1:");
    h.update(machine_seed());
    h.finalize().to_vec()
}

#[cfg(windows)]
fn machine_seed() -> Vec<u8> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;
    RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(r"SOFTWARE\Microsoft\Cryptography")
        .ok()
        .and_then(|k| k.get_value::<String, _>("MachineGuid").ok())
        .map(|s| s.into_bytes())
        .unwrap_or_else(|| b"windows-fallback-dayz-cfg-mgr".to_vec())
}

#[cfg(not(windows))]
fn machine_seed() -> Vec<u8> {
    b"non-windows-dev-dayz-cfg-mgr".to_vec()
}

// ---------- VaultState ----------

struct VaultInner {
    stronghold: Stronghold,
    path: SnapshotPath,
    keyprovider: KeyProvider,
}

/// Tauri-managed state that wraps the Stronghold vault.
/// Acquire via `app.state::<VaultState>()` or the free functions below.
pub struct VaultState(Mutex<VaultInner>);

impl VaultState {
    /// Open (or create) the vault at `snapshot_path`.
    /// Called once from `lib.rs` setup — blocking is fine there.
    pub fn open(snapshot_path: PathBuf, password: Vec<u8>) -> AppResult<Self> {
        let path = SnapshotPath::from_path(&snapshot_path);
        let stronghold = Stronghold::default();
        let keyprovider = KeyProvider::try_from(Zeroizing::new(password))
            .map_err(|e| AppError::Internal(format!("vault key setup: {e}")))?;

        if path.exists() {
            stronghold
                .load_snapshot(&keyprovider, &path)
                .map_err(|e| AppError::Internal(format!("vault load snapshot: {e}")))?;
            if stronghold.load_client(CLIENT).is_err() {
                // Snapshot exists but our client partition wasn't in it —
                // create it now (forward-compat with partial upgrades).
                stronghold
                    .create_client(CLIENT)
                    .map_err(|e| AppError::Internal(format!("vault create client: {e}")))?;
                stronghold
                    .commit_with_keyprovider(&path, &keyprovider)
                    .map_err(|e| AppError::Internal(format!("vault save: {e}")))?;
            }
        } else {
            stronghold
                .create_client(CLIENT)
                .map_err(|e| AppError::Internal(format!("vault create client: {e}")))?;
            stronghold
                .commit_with_keyprovider(&path, &keyprovider)
                .map_err(|e| AppError::Internal(format!("vault initial save: {e}")))?;
        }

        Ok(Self(Mutex::new(VaultInner {
            stronghold,
            path,
            keyprovider,
        })))
    }

    fn locked<T, F: FnOnce(&VaultInner) -> AppResult<T>>(&self, f: F) -> AppResult<T> {
        let inner = self
            .0
            .lock()
            .map_err(|_| AppError::Internal("vault mutex poisoned".into()))?;
        f(&inner)
    }

    fn client(inner: &VaultInner) -> AppResult<iota_stronghold::Client> {
        inner
            .stronghold
            .get_client(CLIENT)
            .map_err(|e| AppError::Internal(format!("vault get client: {e}")))
    }

    fn commit(inner: &VaultInner) -> AppResult<()> {
        inner
            .stronghold
            .commit_with_keyprovider(&inner.path, &inner.keyprovider)
            .map_err(|e| AppError::Internal(format!("vault commit: {e}")))
    }

    pub fn read(&self, key: &str) -> AppResult<Option<Vec<u8>>> {
        self.locked(|inner| {
            Self::client(inner)?
                .store()
                .get(key.as_bytes())
                .map_err(|e| AppError::Internal(format!("vault read `{key}`: {e}")))
        })
    }

    pub fn write(&self, key: &str, data: Vec<u8>) -> AppResult<()> {
        self.locked(|inner| {
            Self::client(inner)?
                .store()
                .insert(key.as_bytes().to_vec(), data, None)
                .map_err(|e| AppError::Internal(format!("vault write `{key}`: {e}")))?;
            Self::commit(inner)
        })
    }

    pub fn erase(&self, key: &str) -> AppResult<()> {
        self.locked(|inner| {
            Self::client(inner)?
                .store()
                .delete(key.as_bytes())
                .map_err(|e| AppError::Internal(format!("vault erase `{key}`: {e}")))?;
            Self::commit(inner)
        })
    }

    /// One-time migration from pre-Stronghold plaintext JSON files.
    pub fn migrate_plaintext(&self, config_dir: &Path) -> AppResult<()> {
        let secrets_json = config_dir.join("secrets.json");
        if secrets_json.exists() {
            if let Ok(bytes) = std::fs::read(&secrets_json) {
                if self.write(KEY_SFTP_SECRETS, bytes).is_ok() {
                    let _ = std::fs::remove_file(&secrets_json);
                }
            }
        }
        Ok(())
    }
}

// ---------- Free functions (access vault via AppHandle) ----------

pub fn read<R: tauri::Runtime>(app: &tauri::AppHandle<R>, key: &str) -> AppResult<Option<Vec<u8>>> {
    app.state::<VaultState>().read(key)
}

pub fn write<R: tauri::Runtime>(app: &tauri::AppHandle<R>, key: &str, data: Vec<u8>) -> AppResult<()> {
    app.state::<VaultState>().write(key, data)
}

pub fn erase<R: tauri::Runtime>(app: &tauri::AppHandle<R>, key: &str) -> AppResult<()> {
    app.state::<VaultState>().erase(key)
}
