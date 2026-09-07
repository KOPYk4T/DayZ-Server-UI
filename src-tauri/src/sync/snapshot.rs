use std::collections::BTreeMap;
use std::io::Read;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSnapshot {
    pub size: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub captured_at: DateTime<Utc>,
    pub git_commit: String,
    /// Workspace-relative path -> file metadata. Paths use forward slashes.
    pub files: BTreeMap<String, FileSnapshot>,
}

pub fn capture(workspace: &Path, rels: &[PathBuf], git_commit: String) -> AppResult<Snapshot> {
    capture_under(workspace, rels, git_commit)
}

/// Hash the same relative trees under an arbitrary root (workspace,
/// local server, or a temp fetch). Keys stay workspace-relative.
pub fn capture_under(root: &Path, rels: &[PathBuf], git_commit: String) -> AppResult<Snapshot> {
    let mut files = BTreeMap::new();
    for rel in rels {
        let dir = root.join(rel);
        if !dir.exists() {
            continue;
        }
        walk(root, &dir, &mut files)?;
    }
    Ok(Snapshot {
        captured_at: Utc::now(),
        git_commit,
        files,
    })
}

fn walk(
    workspace_root: &Path,
    dir: &Path,
    out: &mut BTreeMap<String, FileSnapshot>,
) -> AppResult<()> {
    for entry in walkdir::WalkDir::new(dir)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let p = entry.path();
        let rel = match p.strip_prefix(workspace_root) {
            Ok(r) => r,
            Err(_) => continue,
        };
        let key = rel
            .components()
            .map(|c| c.as_os_str().to_string_lossy().into_owned())
            .collect::<Vec<_>>()
            .join("/");
        if crate::runtime_noise::is_runtime_noise(&key) {
            continue;
        }
        let meta = std::fs::metadata(p)?;
        let sha256 = hash_file(p)?;
        out.insert(
            key,
            FileSnapshot {
                size: meta.len(),
                sha256,
            },
        );
    }
    Ok(())
}

fn hash_file(path: &Path) -> AppResult<String> {
    let mut f = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}
