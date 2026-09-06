//! Encrypted SFTP credential storage.
//!
//! The entire secrets map (`profile_id → ProfileSecrets`) is stored as a
//! single JSON blob in the Stronghold vault under `vault::KEY_SFTP_SECRETS`.
//! The vault itself is encrypted with a machine-bound key derived from the
//! Windows Machine GUID — see `crate::vault` for details.
//!
//! Callers must not log secret values. Error messages must redact them.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::vault;

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSecrets {
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub key_passphrase: Option<String>,
}

impl ProfileSecrets {
    fn is_empty(&self) -> bool {
        self.password.as_deref().map(str::is_empty).unwrap_or(true)
            && self
                .key_passphrase
                .as_deref()
                .map(str::is_empty)
                .unwrap_or(true)
    }
}

#[derive(Debug, Default, Deserialize, Serialize)]
struct SecretsDoc {
    #[serde(default)]
    secrets: HashMap<String, ProfileSecrets>,
}

// ---------- Internal helpers ----------

fn load_doc(app: &tauri::AppHandle) -> AppResult<SecretsDoc> {
    match vault::read(app, vault::KEY_SFTP_SECRETS)? {
        None => Ok(SecretsDoc::default()),
        Some(bytes) => {
            if bytes.is_empty() {
                return Ok(SecretsDoc::default());
            }
            serde_json::from_slice(&bytes)
                .map_err(|e| AppError::Internal(format!("secrets parse: {e}")))
        }
    }
}

fn save_doc(app: &tauri::AppHandle, doc: &SecretsDoc) -> AppResult<()> {
    let bytes = serde_json::to_vec(doc)
        .map_err(|e| AppError::Internal(format!("secrets serialize: {e}")))?;
    vault::write(app, vault::KEY_SFTP_SECRETS, bytes)
}

// ---------- Public API ----------

pub fn get_password(app: &tauri::AppHandle, profile_id: &str) -> AppResult<Option<String>> {
    let doc = load_doc(app)?;
    Ok(doc
        .secrets
        .get(profile_id)
        .and_then(|s| s.password.clone())
        .filter(|s| !s.is_empty()))
}

pub fn get_key_passphrase(app: &tauri::AppHandle, profile_id: &str) -> AppResult<Option<String>> {
    let doc = load_doc(app)?;
    Ok(doc
        .secrets
        .get(profile_id)
        .and_then(|s| s.key_passphrase.clone())
        .filter(|s| !s.is_empty()))
}

/// Replace both secret fields for a profile. Empty / `None` values
/// clear the corresponding field. Profiles with no secrets end up with
/// no entry in the vault.
pub fn store(
    app: &tauri::AppHandle,
    profile_id: &str,
    secrets: &ProfileSecrets,
) -> AppResult<()> {
    let mut doc = load_doc(app)?;
    let cleaned = ProfileSecrets {
        password: secrets
            .password
            .as_deref()
            .filter(|s| !s.is_empty())
            .map(str::to_owned),
        key_passphrase: secrets
            .key_passphrase
            .as_deref()
            .filter(|s| !s.is_empty())
            .map(str::to_owned),
    };
    if cleaned.is_empty() {
        doc.secrets.remove(profile_id);
    } else {
        doc.secrets.insert(profile_id.to_string(), cleaned);
    }
    save_doc(app, &doc)
}

pub fn clear_all(app: &tauri::AppHandle, profile_id: &str) -> AppResult<()> {
    let mut doc = load_doc(app)?;
    if doc.secrets.remove(profile_id).is_some() {
        save_doc(app, &doc)?;
    }
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretsPresence {
    pub has_password: bool,
    pub has_key_passphrase: bool,
    /// Opaque error string if reading the vault failed entirely —
    /// means the vault is locked or corrupt rather than "nothing stored".
    pub error: Option<String>,
}

pub fn presence(app: &tauri::AppHandle, profile_id: &str) -> SecretsPresence {
    match load_doc(app) {
        Ok(doc) => {
            let entry = doc.secrets.get(profile_id);
            SecretsPresence {
                has_password: entry
                    .and_then(|s| s.password.as_deref())
                    .map(|s| !s.is_empty())
                    .unwrap_or(false),
                has_key_passphrase: entry
                    .and_then(|s| s.key_passphrase.as_deref())
                    .map(|s| !s.is_empty())
                    .unwrap_or(false),
                error: None,
            }
        }
        Err(err) => SecretsPresence {
            has_password: false,
            has_key_passphrase: false,
            error: Some(err.to_string()),
        },
    }
}
