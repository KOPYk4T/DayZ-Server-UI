//! Pre-push safety net for local-mode pushes.
//!
//! Before the push overwrites or deletes files under the configured
//! server root, we copy the current on-disk versions of those specific
//! files into `<app_data>/backups/<profile_id>/<timestamp>/`. Only
//! touched files are backed up — not the entire server tree — so the
//! snapshot scales with the size of the change, not the size of the
//! mission.
//!
//! Each backup writes a `manifest.json` listing the relative paths and
//! the change kind, so restores / audits can reconstruct what the push
//! was about to do. The `keep` policy prunes the oldest backups once
//! the per-profile count exceeds the retention limit (default 10).
//!
//! SFTP mode isn't backed up: pulling the server copy over the wire
//! before a push is slow enough to break the push UX, and the user
//! still has the workspace git history as a fallback.

use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::AppResult;

use super::diff::{ChangeKind, DiffSummary};

pub const DEFAULT_KEEP: usize = 10;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    pub id: String,
    pub timestamp: String,
    pub path: String,
    pub file_count: u32,
    pub bytes: u64,
    #[serde(default)]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    timestamp: String,
    files: Vec<ManifestEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestEntry {
    rel: String,
    kind: String,
    bytes: u64,
    /// `true` when the backup copy exists under the timestamp dir.
    /// `false` when the file was about to be added by the push and
    /// therefore didn't exist on the server yet — listed for audit
    /// but no file was archived.
    captured: bool,
}

/// Snapshot destination files that are about to be overwritten or
/// deleted, into `<backups>/<timestamp>/`. `timestamp` is supplied so
/// callers can share one stamp across related artefacts.
pub fn capture_before_push(
    profile_backups_dir: &Path,
    server_root: &Path,
    diff: &DiffSummary,
    timestamp: DateTime<Utc>,
) -> AppResult<Option<BackupEntry>> {
    if diff.changes.is_empty() {
        return Ok(None);
    }
    let stamp = timestamp.format("%Y%m%dT%H%M%SZ").to_string();
    let backup_dir = profile_backups_dir.join(&stamp);
    std::fs::create_dir_all(&backup_dir)?;

    let mut files = Vec::with_capacity(diff.changes.len());
    let mut captured_count = 0u32;
    let mut captured_bytes = 0u64;

    for change in &diff.changes {
        let rel = PathBuf::from(&change.path);
        let src = server_root.join(&rel);
        let kind = match change.kind {
            ChangeKind::Added => "added",
            ChangeKind::Modified => "modified",
            ChangeKind::Deleted => "deleted",
        };

        if src.is_file() {
            let dst = backup_dir.join(&rel);
            if let Some(parent) = dst.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let bytes = std::fs::copy(&src, &dst)?;
            captured_count += 1;
            captured_bytes += bytes;
            files.push(ManifestEntry {
                rel: change.path.clone(),
                kind: kind.into(),
                bytes,
                captured: true,
            });
        } else {
            files.push(ManifestEntry {
                rel: change.path.clone(),
                kind: kind.into(),
                bytes: 0,
                captured: false,
            });
        }
    }

    let manifest = Manifest {
        timestamp: timestamp.to_rfc3339(),
        files,
    };
    let bytes = serde_json::to_vec_pretty(&manifest)?;
    std::fs::write(backup_dir.join("manifest.json"), bytes)?;

    Ok(Some(BackupEntry {
        id: stamp.clone(),
        timestamp: timestamp.to_rfc3339(),
        path: backup_dir.to_string_lossy().into_owned(),
        file_count: captured_count,
        bytes: captured_bytes,
        note: None,
    }))
}

/// Delete all but the `keep` most-recent backups for a profile. Quiet
/// on missing dirs so first-push-with-empty-diff case is a no-op.
pub fn prune(profile_backups_dir: &Path, keep: usize) -> AppResult<()> {
    if !profile_backups_dir.exists() {
        return Ok(());
    }
    let mut entries: Vec<PathBuf> = std::fs::read_dir(profile_backups_dir)?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .map(|e| e.path())
        .collect();
    entries.sort(); // timestamp-sortable names, oldest first
    while entries.len() > keep {
        let victim = entries.remove(0);
        let _ = std::fs::remove_dir_all(&victim);
    }
    Ok(())
}

pub fn list(profile_backups_dir: &Path) -> AppResult<Vec<BackupEntry>> {
    if !profile_backups_dir.exists() {
        return Ok(Vec::new());
    }
    let mut out: Vec<BackupEntry> = Vec::new();
    for entry in std::fs::read_dir(profile_backups_dir)? {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let id = match path.file_name().and_then(|s| s.to_str()) {
            Some(s) => s.to_string(),
            None => continue,
        };
        let manifest_path = path.join("manifest.json");
        let (timestamp, file_count, bytes) = if manifest_path.exists() {
            match std::fs::read(&manifest_path).ok().and_then(|b| {
                serde_json::from_slice::<Manifest>(&b).ok()
            }) {
                Some(m) => {
                    let captured: Vec<&ManifestEntry> =
                        m.files.iter().filter(|f| f.captured).collect();
                    let bytes: u64 = captured.iter().map(|f| f.bytes).sum();
                    (m.timestamp, captured.len() as u32, bytes)
                }
                None => (String::new(), 0, 0),
            }
        } else {
            (String::new(), 0, 0)
        };
        out.push(BackupEntry {
            id,
            timestamp,
            path: path.to_string_lossy().into_owned(),
            file_count,
            bytes,
            note: None,
        });
    }
    out.sort_by(|a, b| b.id.cmp(&a.id)); // newest first
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync::diff::{ChangeKind as CK, FileChange};
    use tempfile::TempDir;

    fn touch(path: &Path, content: &[u8]) {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(path, content).unwrap();
    }

    fn diff_with(changes: Vec<(&str, CK)>) -> DiffSummary {
        DiffSummary {
            changes: changes
                .into_iter()
                .map(|(p, k)| FileChange {
                    path: p.into(),
                    kind: k,
                    old_size: None,
                    new_size: None,
                    old_hash: None,
                    new_hash: None,
                })
                .collect(),
            ..DiffSummary::default()
        }
    }

    #[test]
    fn capture_copies_modified_and_deleted_files_not_added() {
        let td = TempDir::new().unwrap();
        let server = td.path().join("srv");
        let backups = td.path().join("bk");

        touch(&server.join("a.xml"), b"old-a");
        touch(&server.join("b.xml"), b"old-b");
        // c.xml is being ADDED — doesn't exist on server yet.

        let diff = diff_with(vec![
            ("a.xml", CK::Modified),
            ("b.xml", CK::Deleted),
            ("c.xml", CK::Added),
        ]);

        let ts = Utc::now();
        let entry = capture_before_push(&backups, &server, &diff, ts)
            .unwrap()
            .unwrap();
        assert_eq!(entry.file_count, 2);

        let backup_dir = PathBuf::from(&entry.path);
        assert!(backup_dir.join("a.xml").exists());
        assert!(backup_dir.join("b.xml").exists());
        assert!(!backup_dir.join("c.xml").exists());
        assert!(backup_dir.join("manifest.json").exists());

        let m: Manifest = serde_json::from_slice(
            &std::fs::read(backup_dir.join("manifest.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(m.files.len(), 3);
        assert!(m.files.iter().find(|f| f.rel == "c.xml").unwrap().captured == false);
    }

    #[test]
    fn capture_returns_none_on_empty_diff() {
        let td = TempDir::new().unwrap();
        let entry = capture_before_push(
            &td.path().join("bk"),
            &td.path().join("srv"),
            &DiffSummary::default(),
            Utc::now(),
        )
        .unwrap();
        assert!(entry.is_none());
    }

    #[test]
    fn prune_removes_oldest_over_keep() {
        let td = TempDir::new().unwrap();
        let dir = td.path().join("bk");
        for stamp in ["20200101T000000Z", "20200102T000000Z", "20200103T000000Z"] {
            std::fs::create_dir_all(dir.join(stamp)).unwrap();
        }
        prune(&dir, 2).unwrap();
        assert!(!dir.join("20200101T000000Z").exists());
        assert!(dir.join("20200102T000000Z").exists());
        assert!(dir.join("20200103T000000Z").exists());
    }

    #[test]
    fn list_returns_entries_sorted_newest_first() {
        let td = TempDir::new().unwrap();
        let server = td.path().join("srv");
        let backups = td.path().join("bk");
        touch(&server.join("a.xml"), b"x");
        let older = Utc::now() - chrono::Duration::seconds(10);
        let newer = Utc::now();
        capture_before_push(
            &backups,
            &server,
            &diff_with(vec![("a.xml", CK::Modified)]),
            older,
        )
        .unwrap();
        capture_before_push(
            &backups,
            &server,
            &diff_with(vec![("a.xml", CK::Modified)]),
            newer,
        )
        .unwrap();
        let entries = list(&backups).unwrap();
        assert_eq!(entries.len(), 2);
        // Newest first.
        assert!(entries[0].id > entries[1].id);
    }
}
