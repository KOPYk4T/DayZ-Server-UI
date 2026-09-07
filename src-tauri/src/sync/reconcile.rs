//! File-level three-way classify: base snapshot / live dest / workspace.
//!
//! No XML merge. Same file changed on both sides → conflict.

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use super::snapshot::Snapshot;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ReviewAction {
    Write,
    Adopt,
    Conflict,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SyncSide {
    Local,
    Remote,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewItem {
    pub path: String,
    pub action: ReviewAction,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dest_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReviewPlan {
    pub write: Vec<ReviewItem>,
    pub adopt: Vec<ReviewItem>,
    pub conflicts: Vec<ReviewItem>,
}

impl ReviewPlan {
    pub fn is_clean(&self) -> bool {
        self.write.is_empty() && self.adopt.is_empty() && self.conflicts.is_empty()
    }
}

pub fn classify(base: &Snapshot, dest: &Snapshot, work: &Snapshot) -> ReviewPlan {
    let mut paths = BTreeSet::new();
    paths.extend(base.files.keys().cloned());
    paths.extend(dest.files.keys().cloned());
    paths.extend(work.files.keys().cloned());

    let mut plan = ReviewPlan::default();
    for path in paths {
        let bh = base.files.get(&path).map(|f| f.sha256.as_str());
        let dh = dest.files.get(&path).map(|f| f.sha256.as_str());
        let wh = work.files.get(&path).map(|f| f.sha256.as_str());
        if bh == dh && dh == wh {
            continue;
        }
        let item = ReviewItem {
            path,
            action: ReviewAction::Write,
            base_hash: bh.map(str::to_string),
            dest_hash: dh.map(str::to_string),
            workspace_hash: wh.map(str::to_string),
        };
        let dest_changed = dh != bh;
        let work_changed = wh != bh;
        if dest_changed && work_changed && dh != wh {
            let mut item = item;
            item.action = ReviewAction::Conflict;
            plan.conflicts.push(item);
        } else if dest_changed && !work_changed {
            let mut item = item;
            item.action = ReviewAction::Adopt;
            plan.adopt.push(item);
        } else if work_changed && !dest_changed {
            plan.write.push(item);
        } else if dest_changed && work_changed && dh == wh {
            // Both sides already match; nothing to do.
        } else if work_changed {
            plan.write.push(item);
        } else if dest_changed {
            let mut item = item;
            item.action = ReviewAction::Adopt;
            plan.adopt.push(item);
        }
    }
    plan
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync::snapshot::{FileSnapshot, Snapshot};
    use chrono::Utc;
    use std::collections::BTreeMap;

    fn snap(pairs: &[(&str, &str)]) -> Snapshot {
        let mut files = BTreeMap::new();
        for (p, h) in pairs {
            files.insert(
                (*p).into(),
                FileSnapshot {
                    size: 1,
                    sha256: (*h).into(),
                },
            );
        }
        Snapshot {
            captured_at: Utc::now(),
            git_commit: String::new(),
            files,
        }
    }

    #[test]
    fn workspace_only_is_write() {
        let base = snap(&[("a.xml", "1")]);
        let dest = snap(&[("a.xml", "1")]);
        let work = snap(&[("a.xml", "2")]);
        let p = classify(&base, &dest, &work);
        assert_eq!(p.write.len(), 1);
        assert!(p.adopt.is_empty() && p.conflicts.is_empty());
    }

    #[test]
    fn dest_only_is_adopt() {
        let base = snap(&[("a.xml", "1")]);
        let dest = snap(&[("a.xml", "3")]);
        let work = snap(&[("a.xml", "1")]);
        let p = classify(&base, &dest, &work);
        assert_eq!(p.adopt.len(), 1);
        assert!(p.write.is_empty() && p.conflicts.is_empty());
    }

    #[test]
    fn both_changed_is_conflict() {
        let base = snap(&[("a.xml", "1")]);
        let dest = snap(&[("a.xml", "3")]);
        let work = snap(&[("a.xml", "2")]);
        let p = classify(&base, &dest, &work);
        assert_eq!(p.conflicts.len(), 1);
    }

    #[test]
    fn both_changed_to_same_is_clean() {
        let base = snap(&[("a.xml", "1")]);
        let dest = snap(&[("a.xml", "2")]);
        let work = snap(&[("a.xml", "2")]);
        let p = classify(&base, &dest, &work);
        assert!(p.is_clean());
    }
}
