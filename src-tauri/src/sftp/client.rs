//! SSH / SFTP client wiring for russh + russh-sftp.
//!
//! This module is intentionally kept small: it exposes `connect` which
//! returns an authenticated SSH `Handle` and the server's SHA256
//! fingerprint, plus `open_sftp` which opens an SFTP subsystem on an
//! existing handle. The higher-level `probe` / `pull_paths` /
//! `push_diff` helpers in the parent module orchestrate these.

use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use base64::engine::general_purpose::STANDARD_NO_PAD;
use base64::Engine;
use russh::client::{Config, Handle, Handler};
use russh::keys::ssh_key::PublicKey;
use russh::keys::{HashAlg, PrivateKeyWithHashAlg};
use russh_sftp::client::SftpSession;
use sha2::{Digest, Sha256};

use crate::error::{AppError, AppResult};
use crate::profiles::{AuthType, ServerProfile};

/// Timeout applied to the initial TCP + SSH handshake. Kept short so a
/// misconfigured host doesn't hang the UI.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);

/// Handler implementation for russh. We don't enforce fingerprint
/// matching inside the handler — we capture the server's key and let
/// the caller decide (see `FingerprintCapture`). This is what lets
/// `probe` surface `fingerprint_changed=true` to the UI even on a
/// mismatched key, while `pull` / `push` refuse to proceed.
#[derive(Clone)]
pub struct ClientHandler {
    pub captured: Arc<Mutex<Option<String>>>,
}

impl Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        let fp = format_fingerprint(server_public_key);
        if let Ok(mut g) = self.captured.lock() {
            *g = Some(fp);
        }
        Ok(true)
    }
}

/// Format an SSH public key as `SHA256:<base64>` — matches what OpenSSH
/// prints with `-o FingerprintHash=sha256`.
pub fn format_fingerprint(key: &PublicKey) -> String {
    let encoded = match key.to_bytes() {
        Ok(b) => b,
        Err(_) => return "SHA256:<unavailable>".into(),
    };
    let mut hasher = Sha256::new();
    hasher.update(&encoded);
    let digest = hasher.finalize();
    format!("SHA256:{}", STANDARD_NO_PAD.encode(digest))
}

/// Opens a TCP / SSH connection and authenticates the user. Returns
/// the authenticated handle along with the server fingerprint that the
/// handler captured during the handshake.
pub async fn connect(
    profile: &ServerProfile,
    password: Option<String>,
    key_passphrase: Option<String>,
) -> AppResult<(Handle<ClientHandler>, String)> {
    let sftp = profile
        .sftp
        .as_ref()
        .ok_or_else(|| AppError::InvalidProfile("profile has no SFTP block".into()))?;

    let config = Arc::new(Config {
        inactivity_timeout: Some(Duration::from_secs(60)),
        ..Default::default()
    });
    let captured = Arc::new(Mutex::new(None));
    let handler = ClientHandler {
        captured: captured.clone(),
    };

    let addr = (sftp.host.as_str(), sftp.port);
    let connect_fut = russh::client::connect(config, addr, handler);
    let mut handle = tokio::time::timeout(CONNECT_TIMEOUT, connect_fut)
        .await
        .map_err(|_| {
            AppError::Connection(format!(
                "timed out connecting to {}:{} (15s)",
                sftp.host, sftp.port
            ))
        })?
        .map_err(|e| map_ssh_err(e, &sftp.host, sftp.port))?;

    // Auth. russh's AuthResult::success() returns true on ok.
    let authed = match sftp.auth_type {
        AuthType::Password => {
            let pw = password.ok_or_else(|| {
                AppError::Connection(
                    "password auth selected but no password supplied".into(),
                )
            })?;
            handle
                .authenticate_password(&sftp.username, pw)
                .await
                .map_err(|e| AppError::Ssh(format!("password auth: {e}")))?
        }
        AuthType::PrivateKey => {
            let key_path = sftp.private_key_path.as_deref().ok_or_else(|| {
                AppError::InvalidProfile(
                    "privateKey auth selected but privateKeyPath not set".into(),
                )
            })?;
            let pk = russh::keys::load_secret_key(
                key_path,
                key_passphrase.as_deref(),
            )
            .map_err(|e| {
                AppError::Ssh(format!("load private key {key_path}: {e}"))
            })?;
            handle
                .authenticate_publickey(
                    &sftp.username,
                    PrivateKeyWithHashAlg::new(Arc::new(pk), Some(HashAlg::Sha256)),
                )
                .await
                .map_err(|e| AppError::Ssh(format!("publickey auth: {e}")))?
        }
    };
    if !authed.success() {
        return Err(AppError::Connection(format!(
            "authentication rejected for user '{}'",
            sftp.username
        )));
    }

    let fp = captured
        .lock()
        .ok()
        .and_then(|g| g.clone())
        .ok_or_else(|| AppError::Ssh("handshake finished without a fingerprint".into()))?;
    Ok((handle, fp))
}

/// Open an SFTP subsystem channel on an existing SSH handle.
pub async fn open_sftp(
    handle: &Handle<ClientHandler>,
) -> AppResult<SftpSession> {
    let channel = handle
        .channel_open_session()
        .await
        .map_err(|e| AppError::Ssh(format!("channel open: {e}")))?;
    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|e| AppError::Sftp(format!("request sftp subsystem: {e}")))?;
    SftpSession::new(channel.into_stream())
        .await
        .map_err(|e| AppError::Sftp(format!("sftp session init: {e}")))
}

/// Read a file by running `cat` over a fresh SSH exec channel, as a
/// fallback for when SFTP `open` fails. Managed game panels (AMP,
/// Pterodactyl, …) often block SFTP reads of files the game server
/// holds open while leaving shell access untouched, so this path
/// works where the SFTP one doesn't.
///
/// Escaping policy: the path is wrapped in POSIX single quotes with
/// any embedded `'` replaced by `'\''`. `cat --` stops option parsing
/// so filenames that start with `-` are still safe.
///
/// Returns the file's byte contents. Errors out with the stderr text
/// on non-zero exit so the caller can surface a useful message.
pub async fn exec_cat_file(
    handle: &Handle<ClientHandler>,
    remote_path: &str,
) -> AppResult<Vec<u8>> {
    use russh::ChannelMsg;

    let channel = handle
        .channel_open_session()
        .await
        .map_err(|e| AppError::Ssh(format!("open exec channel: {e}")))?;
    let quoted = format!("'{}'", remote_path.replace('\'', "'\\''"));
    let cmd = format!("cat -- {quoted}");
    channel
        .exec(true, cmd.as_bytes())
        .await
        .map_err(|e| AppError::Ssh(format!("exec cat: {e}")))?;

    let mut stdout: Vec<u8> = Vec::new();
    let mut stderr: Vec<u8> = Vec::new();
    let mut exit_status: Option<u32> = None;
    let mut eof_seen = false;

    // Keep pumping until the remote side tells us it's done. russh's
    // `wait()` yields channel messages in order; ExitStatus + Eof
    // together signal the command has finished. Some servers send
    // only one of the two, so bail on either.
    let mut chan = channel;
    while let Some(msg) = chan.wait().await {
        match msg {
            ChannelMsg::Data { data } => stdout.extend_from_slice(&data[..]),
            ChannelMsg::ExtendedData { data, ext } => {
                if ext == 1 {
                    stderr.extend_from_slice(&data[..]);
                }
            }
            ChannelMsg::ExitStatus { exit_status: s } => {
                exit_status = Some(s);
                if eof_seen {
                    break;
                }
            }
            ChannelMsg::Eof => {
                eof_seen = true;
                if exit_status.is_some() {
                    break;
                }
            }
            ChannelMsg::Close => break,
            _ => {}
        }
    }

    match exit_status {
        Some(0) => Ok(stdout),
        Some(code) => {
            let hint = String::from_utf8_lossy(&stderr).trim().to_string();
            Err(AppError::Sftp(format!(
                "cat {remote_path} exited {code}{}",
                if hint.is_empty() { String::new() } else { format!(": {hint}") }
            )))
        }
        None => Err(AppError::Sftp(format!(
            "cat {remote_path}: channel closed without exit status"
        ))),
    }
}

/// Enforce that the profile's stored fingerprint matches the one we
/// just observed. `probe` skips this (so the UI can surface the
/// mismatch to the user); `pull` / `push` call it strictly.
pub fn verify_fingerprint_strict(
    profile: &ServerProfile,
    observed: &str,
) -> AppResult<()> {
    let Some(sftp) = profile.sftp.as_ref() else {
        return Ok(());
    };
    let Some(expected) = sftp.known_host_fingerprint.as_deref() else {
        // First connection — caller should have gone through probe first
        // to capture and persist the fingerprint. Refuse to proceed
        // blind so we never sync to an unverified host.
        return Err(AppError::Connection(format!(
            "no host fingerprint on file for {}:{} — run Test connection first",
            sftp.host, sftp.port
        )));
    };
    if expected != observed {
        return Err(AppError::Connection(format!(
            "host fingerprint mismatch: expected {expected}, got {observed}"
        )));
    }
    Ok(())
}

/// Translate a russh handshake error into our AppError, with a hint
/// about the most common failure causes.
fn map_ssh_err(e: russh::Error, host: &str, port: u16) -> AppError {
    let s = e.to_string();
    let hint = if s.contains("Connection refused") || s.contains("refused") {
        " (is the SSH daemon running on the target?)"
    } else if s.contains("No route") || s.contains("unreachable") {
        " (check host / firewall)"
    } else {
        ""
    };
    AppError::Ssh(format!("connect {host}:{port}: {s}{hint}"))
}

// ---------- Path utilities ----------

/// Convert a workspace-relative path to an SFTP remote path, joined
/// against a base (which may be absolute or home-relative). Always
/// produces forward slashes — Windows backslashes are rewritten.
pub fn join_remote(base: &str, rel: &Path) -> String {
    let rel_str = rel.to_string_lossy().replace('\\', "/");
    let base_trimmed = base.trim_end_matches('/');
    if rel_str.is_empty() {
        base_trimmed.to_string()
    } else {
        format!("{base_trimmed}/{}", rel_str.trim_start_matches('/'))
    }
}

/// Turn a workspace path (e.g. `mpmissions/dayzOffline.chernarusplus`)
/// into the absolute or home-relative string the SFTP server expects.
///
///  - If the workspace path is already absolute (`/opt/...`), pass it
///    through verbatim — explicit absolute paths win.
///  - Otherwise, if the profile has a `remote_root` configured, join
///    under that root.
///  - Otherwise, fall back to the raw relative path (resolved against
///    the SSH session CWD — the user's home in most cases).
pub fn resolve_remote(profile: &ServerProfile, rel: &Path) -> String {
    let as_fwd = rel.to_string_lossy().replace('\\', "/");
    if as_fwd.starts_with('/') {
        return as_fwd;
    }
    if let Some(root) = profile
        .sftp
        .as_ref()
        .and_then(|s| s.remote_root.as_deref())
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        return join_remote(root, rel);
    }
    as_fwd
}

/// Same as [`resolve_remote`] but takes a plain `&str` workspace path
/// (e.g. a `FileChange.path`).
pub fn resolve_remote_str(profile: &ServerProfile, rel: &str) -> String {
    let p = std::path::Path::new(rel);
    resolve_remote(profile, p)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::profiles::{ConnectionMode, MapId, ProfilePaths};
    use chrono::Utc;
    use std::path::PathBuf;

    fn sftp_profile(remote_root: Option<&str>) -> ServerProfile {
        ServerProfile {
            id: "t".into(),
            name: "t".into(),
            mode: ConnectionMode::Sftp,
            sftp: Some(SftpConnection {
                host: "h".into(),
                port: 22,
                username: "u".into(),
                auth_type: AuthType::Password,
                private_key_path: None,
                known_host_fingerprint: None,
                remote_root: remote_root.map(str::to_owned),
            }),
            local: None,
            paths: ProfilePaths {
                mpmissions_relative: String::new(),
                profiles_relative: String::new(),
            },
            map: MapId::Chernarusplus,
            custom_map_id: None,
            custom_map_size_m: None,
            work_dir: None,
            mods: Vec::new(),
            remote_commands: None,
            created_at: Utc::now(),
            last_pull_at: None,
            last_push_at: None,
        }
    }

    #[test]
    fn resolve_remote_prepends_root_for_relative_paths() {
        let p = sftp_profile(Some("/opt/dayz"));
        let r = PathBuf::from("mpmissions").join("dayzOffline.chernarusplus");
        assert_eq!(
            resolve_remote(&p, &r),
            "/opt/dayz/mpmissions/dayzOffline.chernarusplus"
        );
    }

    #[test]
    fn resolve_remote_passes_absolute_through() {
        let p = sftp_profile(Some("/opt/dayz"));
        let r = PathBuf::from("/var/lib/dayz/mpmissions/x");
        assert_eq!(resolve_remote(&p, &r), "/var/lib/dayz/mpmissions/x");
    }

    #[test]
    fn resolve_remote_without_root_falls_back_to_relative() {
        let p = sftp_profile(None);
        let r = PathBuf::from("profiles");
        assert_eq!(resolve_remote(&p, &r), "profiles");
    }

    #[test]
    fn resolve_remote_trims_empty_root_string() {
        let p = sftp_profile(Some("   "));
        let r = PathBuf::from("profiles");
        assert_eq!(resolve_remote(&p, &r), "profiles");
    }

    use crate::profiles::SftpConnection;

    #[test]
    fn join_remote_forward_slashes_on_windows_paths() {
        let p = PathBuf::from("types.xml");
        assert_eq!(join_remote("/opt/dayz", &p), "/opt/dayz/types.xml");
    }

    #[test]
    fn join_remote_handles_nested_paths() {
        let p = PathBuf::from("db")
            .join("types.xml");
        assert!(join_remote("mpmissions", &p).ends_with("mpmissions/db/types.xml"));
    }

    #[test]
    fn join_remote_trims_trailing_slash() {
        assert_eq!(
            join_remote("/opt/dayz/", &PathBuf::from("x")),
            "/opt/dayz/x"
        );
    }

    #[test]
    fn join_remote_accepts_relative_base() {
        // Home-relative base (no leading slash) — the SSH server
        // resolves against the login user's home directory.
        assert_eq!(
            join_remote("dayz", &PathBuf::from("types.xml")),
            "dayz/types.xml"
        );
    }
}
