//! Minimal git2 helpers for the workspace's pull/push log.
//!
//! The workspace is a flat git repo (no remote) used only as a safety
//! net. Every save auto-commits; pull/push stamp their own commits.

use std::path::{Path, PathBuf};

use chrono::{TimeZone, Utc};
use git2::{IndexAddOption, Repository, Signature, StatusOptions};
use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::runtime_noise;

const SIG_NAME: &str = "DayZ ServerUI";
const SIG_EMAIL: &str = "noreply@dayz-config-manager.local";

/// Idempotent: initialize the workspace as a git repo if one doesn't
/// already exist, and seed an initial empty commit so HEAD is valid.
pub fn ensure_repo(workspace: &Path) -> AppResult<Repository> {
    let existed = workspace.join(".git").exists();
    let repo = if existed {
        Repository::open(workspace)?
    } else {
        Repository::init(workspace)?
    };
    let ignore_changed = upsert_gitignore(workspace)?;
    let unstaged = unstage_noise(&repo)?;
    if !existed {
        commit_index(&repo, "init")?;
    } else if ignore_changed || unstaged {
        commit_index(&repo, "ignore runtime logs")?;
    }
    Ok(repo)
}

/// Commit every current change. Returns the commit SHA (or the prior HEAD
/// sha if there was nothing to commit).
pub fn commit_all(workspace: &Path, message: &str) -> AppResult<String> {
    let repo = ensure_repo(workspace)?;
    commit_index(&repo, message)
}

pub fn head_commit(workspace: &Path) -> AppResult<String> {
    let repo = Repository::open(workspace)?;
    let head = repo.head()?;
    let commit = head.peel_to_commit()?;
    Ok(commit.id().to_string())
}

pub fn is_dirty(workspace: &Path) -> AppResult<bool> {
    let repo = Repository::open(workspace)?;
    let mut opts = StatusOptions::new();
    opts.include_untracked(true).include_ignored(false);
    let statuses = repo.statuses(Some(&mut opts))?;
    Ok(!statuses.is_empty())
}

/// Count commits between `from` and HEAD (exclusive of `from`). Returns 0
/// when `from` equals HEAD or cannot be resolved.
pub fn commits_between(workspace: &Path, from_sha: &str) -> AppResult<usize> {
    let repo = Repository::open(workspace)?;
    let head = match repo.head() {
        Ok(h) => h.peel_to_commit()?.id(),
        Err(_) => return Ok(0),
    };
    let from = match repo.revparse_single(from_sha) {
        Ok(obj) => obj.id(),
        Err(_) => return Ok(0),
    };
    if from == head {
        return Ok(0);
    }
    let mut walk = repo.revwalk()?;
    walk.push(head)?;
    walk.hide(from)?;
    Ok(walk.count())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceCommit {
    pub sha: String,
    pub message: String,
    pub committed_at: String,
    pub files: Vec<String>,
}

pub fn list_log(workspace: &Path, limit: usize) -> AppResult<Vec<WorkspaceCommit>> {
    let repo = Repository::open(workspace)?;
    let mut walk = repo.revwalk()?;
    walk.push_head()?;
    walk.set_sorting(git2::Sort::TIME)?;
    let mut out = Vec::new();
    for id in walk {
        if out.len() >= limit {
            break;
        }
        let id = id?;
        let commit = repo.find_commit(id)?;
        let message = commit.message().unwrap_or("").trim().to_string();
        if message == "ignore runtime logs" {
            continue;
        }
        let files = commit_files(&repo, &commit)?;
        if files.is_empty() && message != "init" {
            continue;
        }
        let ts = Utc
            .timestamp_opt(commit.time().seconds(), 0)
            .single()
            .map(|d| d.to_rfc3339())
            .unwrap_or_default();
        out.push(WorkspaceCommit {
            sha: id.to_string(),
            message,
            committed_at: ts,
            files,
        });
    }
    Ok(out)
}

pub fn file_at_commit(
    workspace: &Path,
    sha: &str,
    path: &str,
) -> AppResult<(Option<String>, Option<String>)> {
    let repo = Repository::open(workspace)?;
    let commit = repo.revparse_single(sha)?.peel_to_commit()?;
    let tree = commit.tree()?;
    let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());
    let current = blob_text(&repo, &tree, path);
    let parent = parent_tree
        .as_ref()
        .and_then(|t| blob_text(&repo, t, path));
    Ok((current, parent))
}

fn commit_files(repo: &Repository, commit: &git2::Commit) -> AppResult<Vec<String>> {
    let tree = commit.tree()?;
    let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());
    let diff = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), None)?;
    let mut files = Vec::new();
    for delta in diff.deltas() {
        if let Some(path) = delta.new_file().path().or(delta.old_file().path()) {
            let rel = path.to_string_lossy();
            if crate::runtime_noise::is_runtime_noise(&rel) {
                continue;
            }
            files.push(rel.into_owned());
        }
    }
    Ok(files)
}

fn blob_text(repo: &Repository, tree: &git2::Tree, path: &str) -> Option<String> {
    let entry = tree.get_path(Path::new(path)).ok()?;
    let obj = entry.to_object(repo).ok()?;
    let blob = obj.as_blob()?;
    if blob.content().contains(&0) {
        return None;
    }
    Some(String::from_utf8_lossy(blob.content()).into_owned())
}

fn signature<'a>() -> AppResult<Signature<'a>> {
    Signature::now(SIG_NAME, SIG_EMAIL).map_err(AppError::from)
}

fn commit_index(repo: &Repository, message: &str) -> AppResult<String> {
    let mut index = repo.index()?;
    index.add_all(["."].iter(), IndexAddOption::DEFAULT, None)?;
    index.write()?;
    let tree_id = index.write_tree()?;
    let tree = repo.find_tree(tree_id)?;
    let head_commit = match repo.head() {
        Ok(head) => head.peel_to_commit().ok(),
        Err(_) => None,
    };
    if let Some(parent) = &head_commit {
        if parent.tree_id() == tree_id {
            return Ok(parent.id().to_string());
        }
    }
    let sig = signature()?;
    let parents: Vec<&git2::Commit> = head_commit.as_ref().map(|c| vec![c]).unwrap_or_default();
    let commit = repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &parents)?;
    Ok(commit.to_string())
}

fn upsert_gitignore(workspace: &Path) -> AppResult<bool> {
    let path: PathBuf = workspace.join(".gitignore");
    let existing = std::fs::read_to_string(&path).unwrap_or_default();
    let block = runtime_noise::GITIGNORE_BLOCK.trim_end();
    let next = if let (Some(start), Some(end_mark)) = (
        existing.find(runtime_noise::GITIGNORE_MARK_START),
        existing.find(runtime_noise::GITIGNORE_MARK_END),
    ) {
        let end = end_mark + runtime_noise::GITIGNORE_MARK_END.len();
        let mut s = String::new();
        s.push_str(&existing[..start]);
        s.push_str(block);
        s.push('\n');
        let rest = existing[end..].trim_start_matches(['\r', '\n']);
        s.push_str(rest);
        if !s.ends_with('\n') {
            s.push('\n');
        }
        s
    } else {
        let mut s = existing;
        if !s.is_empty() && !s.ends_with('\n') {
            s.push('\n');
        }
        if s.is_empty() {
            s.push_str("# dzmgr metadata is tracked — it fingerprints each pull.\n");
        }
        s.push_str(block);
        s.push('\n');
        s
    };
    if path.exists() && next == std::fs::read_to_string(&path).unwrap_or_default() {
        return Ok(false);
    }
    std::fs::write(&path, next)?;
    Ok(true)
}

fn unstage_noise(repo: &Repository) -> AppResult<bool> {
    let mut index = repo.index()?;
    let paths: Vec<PathBuf> = index
        .iter()
        .filter_map(|e| {
            let p = String::from_utf8_lossy(&e.path);
            if runtime_noise::is_runtime_noise(&p) {
                Some(PathBuf::from(p.as_ref()))
            } else {
                None
            }
        })
        .collect();
    if paths.is_empty() {
        return Ok(false);
    }
    for p in &paths {
        index.remove_path(p)?;
    }
    index.write()?;
    Ok(true)
}
