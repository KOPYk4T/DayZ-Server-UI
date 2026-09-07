use serde::Serialize;

use super::snapshot::Snapshot;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ChangeKind {
    Added,
    Modified,
    Deleted,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub path: String,
    pub kind: ChangeKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiffSummary {
    pub changes: Vec<FileChange>,
    pub added_count: u32,
    pub modified_count: u32,
    pub deleted_count: u32,
    pub total_bytes: u64,
}

pub fn compute_against(base: &Snapshot, current: &Snapshot) -> DiffSummary {
    let mut changes = Vec::new();
    let mut added = 0u32;
    let mut modified = 0u32;
    let mut deleted = 0u32;
    let mut bytes = 0u64;

    for (path, cur) in &current.files {
        if crate::runtime_noise::is_runtime_noise(path) {
            continue;
        }
        match base.files.get(path) {
            Some(prev) => {
                if prev.sha256 != cur.sha256 {
                    modified += 1;
                    bytes += cur.size;
                    changes.push(FileChange {
                        path: path.clone(),
                        kind: ChangeKind::Modified,
                        old_size: Some(prev.size),
                        new_size: Some(cur.size),
                        old_hash: Some(prev.sha256.clone()),
                        new_hash: Some(cur.sha256.clone()),
                    });
                }
            }
            None => {
                added += 1;
                bytes += cur.size;
                changes.push(FileChange {
                    path: path.clone(),
                    kind: ChangeKind::Added,
                    old_size: None,
                    new_size: Some(cur.size),
                    old_hash: None,
                    new_hash: Some(cur.sha256.clone()),
                });
            }
        }
    }
    for (path, prev) in &base.files {
        if crate::runtime_noise::is_runtime_noise(path) {
            continue;
        }
        if !current.files.contains_key(path) {
            deleted += 1;
            changes.push(FileChange {
                path: path.clone(),
                kind: ChangeKind::Deleted,
                old_size: Some(prev.size),
                new_size: None,
                old_hash: Some(prev.sha256.clone()),
                new_hash: None,
            });
        }
    }

    changes.sort_by(|a, b| a.path.cmp(&b.path));

    DiffSummary {
        changes,
        added_count: added,
        modified_count: modified,
        deleted_count: deleted,
        total_bytes: bytes,
    }
}
