//! Minimal git2 helpers for the workspace's pull/push log.
//!
//! The workspace is a flat git repo (no remote) used only as a safety
//! net. Every save auto-commits; pull/push stamp their own commits.

use std::path::{Path, PathBuf};

use git2::{IndexAddOption, Repository, Signature, StatusOptions};

use crate::error::{AppError, AppResult};

const SIG_NAME: &str = "DayZ ServerUI";
const SIG_EMAIL: &str = "noreply@dayz-config-manager.local";

/// Idempotent: initialize the workspace as a git repo if one doesn't
/// already exist, and seed an initial empty commit so HEAD is valid.
pub fn ensure_repo(workspace: &Path) -> AppResult<Repository> {
    if workspace.join(".git").exists() {
        return Ok(Repository::open(workspace)?);
    }
    let repo = Repository::init(workspace)?;
    write_gitignore(workspace)?;
    let sig = signature()?;
    {
        let mut index = repo.index()?;
        index.add_all(["."].iter(), IndexAddOption::DEFAULT, None)?;
        index.write()?;
        let tree_id = index.write_tree()?;
        let tree = repo.find_tree(tree_id)?;
        let _ = repo.commit(Some("HEAD"), &sig, &sig, "init", &tree, &[])?;
    }
    Ok(repo)
}

/// Commit every current change. Returns the commit SHA (or the prior HEAD
/// sha if there was nothing to commit).
pub fn commit_all(workspace: &Path, message: &str) -> AppResult<String> {
    let repo = ensure_repo(workspace)?;
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

fn signature<'a>() -> AppResult<Signature<'a>> {
    Signature::now(SIG_NAME, SIG_EMAIL).map_err(AppError::from)
}

fn write_gitignore(workspace: &Path) -> AppResult<()> {
    let path: PathBuf = workspace.join(".gitignore");
    if path.exists() {
        return Ok(());
    }
    let contents = "# dzmgr metadata is tracked — it fingerprints each pull.\n";
    std::fs::write(path, contents)?;
    Ok(())
}
