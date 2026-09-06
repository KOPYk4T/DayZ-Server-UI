//! Territory files under `<mission>/db/env/*.xml`.
//!
//! DayZ ships one file per animal / infected category (`bear_
//! territories.xml`, `wolf_territories.xml`, `zombie_territories.xml`,
//! etc.). We don't hard-code the list — instead we enumerate every
//! `*_territories.xml` inside the directory so mods that add new
//! categories (say `chernarus_unicorn_territories.xml`) show up
//! automatically in the UI.
//!
//! Territories are opt-in on the mission side — the folder may not
//! exist on older templates. When it's missing we return an empty
//! inventory rather than erroring out, matching how the player-
//! spawns code handles its own absent files.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::AppResult;
use crate::parsers::territories_xml::{self, TerritoryFile};

use super::MissionContext;

/// Absolute path to `<mission>/db/env/`. DayZ ships territory
/// geometry files here, and `cfgenvironment.xml`'s `<file
/// path="env/…"/>` attributes are resolved relative to the parent
/// `db/` directory — so writing them at `<mission>/env/` (mission
/// root) would silently break the binding lookup. Every
/// read/write in this module goes through this single helper so
/// the convention can't drift.
pub fn env_dir(ctx: &MissionContext) -> PathBuf {
    ctx.mission_root.join("db").join("env")
}

/// One entry per file found inside `<mission>/db/env/`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerritoryFileEntry {
    /// Base filename (`bear_territories.xml`).
    pub filename: String,
    /// Canonical category derived from the filename stem — `bear`,
    /// `zombie`, `wolf`, etc. Used as a stable key in the UI.
    pub category: String,
    /// Human label used in the UI — "Bear", "Wolf", "Zombie".
    pub display_name: String,
    /// Loaded content. Cheaper to parse everything up-front because
    /// the files are small (< 20 KB each) and the map layer needs
    /// all of them simultaneously anyway.
    pub data: TerritoryFile,
}

pub fn list(ctx: &MissionContext) -> AppResult<Vec<TerritoryFileEntry>> {
    let dir = env_dir(ctx);
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&dir)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n,
            None => continue,
        };
        // Only pick up files matching the `*_territories.xml`
        // convention; stray text files / editor backups are ignored.
        if !name.ends_with("_territories.xml") {
            continue;
        }
        let data = territories_xml::parse_file(&path)?;
        let category = name
            .trim_end_matches("_territories.xml")
            .to_ascii_lowercase();
        let display_name = category
            .split('_')
            .map(title_case_word)
            .collect::<Vec<_>>()
            .join(" ");
        out.push(TerritoryFileEntry {
            filename: name.to_string(),
            category,
            display_name,
            data,
        });
    }
    // Stable alphabetical order so the UI doesn't shuffle tabs
    // between restarts.
    out.sort_by(|a, b| a.category.cmp(&b.category));
    Ok(out)
}

/// Load a single territory file by its filename (e.g.
/// `bear_territories.xml`). Primarily used by the save path; reads
/// also go through `list` for consistency.
pub fn load_one(
    ctx: &MissionContext,
    filename: &str,
) -> AppResult<Option<TerritoryFile>> {
    let path = env_dir(ctx).join(sanitise_filename(filename));
    if !path.is_file() {
        return Ok(None);
    }
    Ok(Some(territories_xml::parse_file(&path)?))
}

pub fn save(
    ctx: &MissionContext,
    filename: &str,
    file: &TerritoryFile,
) -> AppResult<PathBuf> {
    let safe = sanitise_filename(filename);
    let path = env_dir(ctx).join(&safe);
    territories_xml::write_file(&path, file)?;
    Ok(path)
}

/// Reject path traversal — the filename must be a bare basename
/// ending in `_territories.xml`, never `../../anything`.
fn sanitise_filename(filename: &str) -> String {
    let name = Path::new(filename)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    if name.ends_with("_territories.xml") && !name.contains('/') && !name.contains('\\') {
        name.to_string()
    } else {
        // Fallback: still scope to the env dir but with a known-safe
        // default so the caller's bad input can't escape.
        "unknown_territories.xml".to_string()
    }
}

fn title_case_word(word: &str) -> String {
    let mut chars = word.chars();
    match chars.next() {
        Some(c) => c.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::profiles::{
        ConnectionMode, LocalConnection, MapId, ProfilePaths, ServerProfile,
    };
    use tempfile::TempDir;

    fn mk_ctx(workspace: &std::path::Path, mission_rel: &str) -> MissionContext {
        std::fs::create_dir_all(workspace.join(mission_rel)).unwrap();
        let profile = ServerProfile {
            id: "t".into(),
            name: "t".into(),
            mode: ConnectionMode::Local,
            sftp: None,
            local: Some(LocalConnection {
                root_path: workspace.to_string_lossy().into_owned(),
            }),
            paths: ProfilePaths {
                mpmissions_relative: mission_rel.into(),
                profiles_relative: "profiles".into(),
            },
            map: MapId::Chernarusplus,
            custom_map_id: None,
            custom_map_size_m: None,
            work_dir: None,
            mods: Vec::new(),
            remote_commands: None,
            created_at: chrono::Utc::now(),
            last_pull_at: None,
            last_push_at: None,
        };
        MissionContext::resolve(workspace, &profile).unwrap()
    }

    #[test]
    fn save_writes_under_db_env_not_mission_root() {
        // Regression guard: the canonical territory location is
        // <mission>/db/env/, NOT <mission>/env/. If someone re-routes
        // env_dir this test catches it before it ships a broken
        // cfgenvironment round-trip.
        let td = TempDir::new().unwrap();
        let ws = td.path();
        let ctx = mk_ctx(ws, "mpmissions/dayzOffline.chernarusplus");

        let empty = TerritoryFile::default();
        let written = save(&ctx, "super_bear_territories.xml", &empty).unwrap();

        let expected_db_env = ws
            .join("mpmissions/dayzOffline.chernarusplus/db/env/super_bear_territories.xml");
        let forbidden_root_env = ws
            .join("mpmissions/dayzOffline.chernarusplus/env/super_bear_territories.xml");

        assert_eq!(
            written, expected_db_env,
            "save() must return the db/env/ path"
        );
        assert!(expected_db_env.is_file(), "file must land in db/env/");
        assert!(
            !forbidden_root_env.exists(),
            "file must NOT land at mission-root env/"
        );
    }

    #[test]
    fn list_reads_from_db_env_only() {
        let td = TempDir::new().unwrap();
        let ws = td.path();
        let mission_rel = "mpmissions/dayzOffline.chernarusplus";
        let ctx = mk_ctx(ws, mission_rel);

        // Plant a file at the WRONG location (mission root env/) AND
        // at the RIGHT location (db/env/). `list` should only surface
        // the db/env/ one.
        let wrong = ws.join(mission_rel).join("env");
        let right = ws.join(mission_rel).join("db").join("env");
        std::fs::create_dir_all(&wrong).unwrap();
        std::fs::create_dir_all(&right).unwrap();
        std::fs::write(
            wrong.join("rogue_territories.xml"),
            r#"<territory-type/>"#,
        )
        .unwrap();
        std::fs::write(
            right.join("bear_territories.xml"),
            r#"<territory-type/>"#,
        )
        .unwrap();

        let entries = list(&ctx).unwrap();
        let names: Vec<_> =
            entries.iter().map(|e| e.filename.as_str()).collect();
        assert_eq!(names, vec!["bear_territories.xml"]);
    }
}
