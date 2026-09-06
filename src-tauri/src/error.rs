use serde::Serialize;
use thiserror::Error;

/// The single error type returned from Tauri commands. `serde(tag="kind")`
/// means the frontend receives `{ kind, message, detail? }` — matching
/// `AppError` in `src/types/ipc.ts`.
#[derive(Debug, Error)]
pub enum AppError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),

    #[error("serde: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("keychain: {0}")]
    Keychain(String),

    #[error("profile not found: {0}")]
    ProfileNotFound(String),

    #[error("profile already exists: {0}")]
    ProfileAlreadyExists(String),

    #[error("invalid profile: {0}")]
    InvalidProfile(String),

    #[error("connection: {0}")]
    Connection(String),

    #[error("sftp: {0}")]
    Sftp(String),

    #[error("ssh: {0}")]
    Ssh(String),

    #[error("git: {0}")]
    Git(String),

    #[error("sync: {0}")]
    Sync(String),

    #[error("not implemented: {0}")]
    NotImplemented(&'static str),

    #[error("internal: {0}")]
    Internal(String),
}

impl AppError {
    pub fn kind(&self) -> &'static str {
        match self {
            AppError::Io(_) => "io",
            AppError::Serde(_) => "serde",
            AppError::Keychain(_) => "keychain",
            AppError::ProfileNotFound(_) => "profile_not_found",
            AppError::ProfileAlreadyExists(_) => "profile_exists",
            AppError::InvalidProfile(_) => "invalid_profile",
            AppError::Connection(_) => "connection",
            AppError::Sftp(_) => "sftp",
            AppError::Ssh(_) => "ssh",
            AppError::Git(_) => "git",
            AppError::Sync(_) => "sync",
            AppError::NotImplemented(_) => "not_implemented",
            AppError::Internal(_) => "internal",
        }
    }
}

impl From<git2::Error> for AppError {
    fn from(e: git2::Error) -> Self { AppError::Git(e.message().to_string()) }
}

impl From<anyhow::Error> for AppError {
    fn from(e: anyhow::Error) -> Self { AppError::Internal(e.to_string()) }
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self { AppError::Connection(e.to_string()) }
}

impl From<image::ImageError> for AppError {
    fn from(e: image::ImageError) -> Self { AppError::Internal(format!("image: {e}")) }
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut s = ser.serialize_struct("AppError", 3)?;
        s.serialize_field("kind", self.kind())?;
        s.serialize_field("message", &self.to_string())?;
        let detail: Option<String> = None;
        s.serialize_field("detail", &detail)?;
        s.end()
    }
}

pub type AppResult<T> = std::result::Result<T, AppError>;
