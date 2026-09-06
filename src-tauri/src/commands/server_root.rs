//! Server-root auto-detection for profile setup.
//!
//! Given an arbitrary folder path, enumerate the missions under
//! `mpmissions/` and guess which top-level folders look like DayZ
//! server profile directories. The frontend uses the result to
//! populate dropdowns on the profile creation form so users don't
//! have to type the relative paths by hand.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::AppResult;
use crate::profiles::MapId;
use crate::sync::ROOT_FILE_RELS;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MissionCandidate {
    /// Workspace-relative path with forward slashes.
    pub relative_path: String,
    /// Best-guess map id for this mission based on folder name —
    /// lets the UI pre-fill the Map dropdown. `None` when the
    /// folder name doesn't match a known vanilla map.
    pub map_hint: Option<MapId>,
    /// Which marker files convinced us this is a mission folder.
    pub markers: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileCandidate {
    pub relative_path: String,
    pub markers: Vec<String>,
    /// 0..3 — more markers means higher confidence. UI can sort by
    /// this so the most likely folder lands at the top.
    pub confidence: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerRootScan {
    /// The path we scanned — echoed back so the frontend can
    /// double-check alignment with its form state.
    pub root_path: String,
    pub root_exists: bool,
    /// True when `serverDZ.cfg` (or `server.cfg`) sits in the root.
    pub server_cfg_found: bool,
    /// Empty when `mpmissions/` doesn't exist in the root.
    pub mpmissions_dir_exists: bool,
    pub missions: Vec<MissionCandidate>,
    pub profile_folders: Vec<ProfileCandidate>,
}

#[tauri::command]
pub async fn server_root_scan(root_path: String) -> AppResult<ServerRootScan> {
    let root = PathBuf::from(&root_path);
    // Short-circuit so the UI gets a clean `rootExists:false` echo
    // instead of a filesystem error toast when the user is mid-typing.
    if !root.exists() {
        return Ok(ServerRootScan {
            root_path,
            root_exists: false,
            server_cfg_found: false,
            mpmissions_dir_exists: false,
            missions: Vec::new(),
            profile_folders: Vec::new(),
        });
    }

    let server_cfg_found = ROOT_FILE_RELS.iter().any(|rel| root.join(rel).exists());

    let mpmissions_dir = root.join("mpmissions");
    let mpmissions_dir_exists = mpmissions_dir.is_dir();
    let missions = if mpmissions_dir_exists {
        scan_missions(&mpmissions_dir)
    } else {
        Vec::new()
    };

    let profile_folders = scan_profile_folders(&root);

    Ok(ServerRootScan {
        root_path,
        root_exists: true,
        server_cfg_found,
        mpmissions_dir_exists,
        missions,
        profile_folders,
    })
}

// ---------- Missions ----------

fn scan_missions(mpmissions_dir: &Path) -> Vec<MissionCandidate> {
    let Ok(rd) = std::fs::read_dir(mpmissions_dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in rd.flatten() {
        let is_dir = entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false);
        if !is_dir {
            continue;
        }
        let path = entry.path();
        let markers = mission_markers(&path);
        if markers.is_empty() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        let map_hint = MapId::from_folder_name(&name);
        out.push(MissionCandidate {
            relative_path: format!("mpmissions/{name}"),
            map_hint,
            markers,
        });
    }
    out.sort_by(|a, b| {
        a.map_hint
            .is_none()
            .cmp(&b.map_hint.is_none())
            .then_with(|| a.relative_path.cmp(&b.relative_path))
    });
    out
}

const MISSION_ROOT_MARKERS: &[&str] =
    &["init.c", "cfgeconomycore.xml", "cfgplayerspawnpoints.xml"];
const MISSION_DB_MARKERS: &[&str] = &["types.xml", "globals.xml", "events.xml"];

/// Linear scan of the mission dir looking only for the handful of
/// marker files. Tracks each marker with a bool so we can stop
/// scanning once every marker is found — critical on mission dirs
/// whose `db/` dump can hold thousands of files.
fn mission_markers(dir: &Path) -> Vec<String> {
    let mut out = Vec::new();
    let mut saw = [false; 3];
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten() {
            let fname_os = e.file_name();
            let fname = fname_os.to_string_lossy();
            for (i, m) in MISSION_ROOT_MARKERS.iter().enumerate() {
                if !saw[i] && fname.eq_ignore_ascii_case(m) {
                    saw[i] = true;
                    out.push((*m).to_string());
                    break;
                }
            }
            if saw.iter().all(|x| *x) {
                break;
            }
        }
    }
    // `db/` existence is checked directly rather than looked for as
    // an entry in the loop above — otherwise the loop can't early-
    // break without knowing db/ status, and would scan the whole
    // mission dir every time db/ happened to be missing.
    let db_dir = dir.join("db");
    if db_dir.is_dir() {
        if let Ok(rd) = std::fs::read_dir(&db_dir) {
            let mut saw_db_marker = [false; 3];
            for e in rd.flatten() {
                let fname_os = e.file_name();
                let fname = fname_os.to_string_lossy();
                for (i, m) in MISSION_DB_MARKERS.iter().enumerate() {
                    if !saw_db_marker[i] && fname.eq_ignore_ascii_case(m) {
                        saw_db_marker[i] = true;
                        out.push(format!("db/{m}"));
                        break;
                    }
                }
                if saw_db_marker.iter().all(|x| *x) {
                    break;
                }
            }
        }
    }
    out
}

// ---------- Profile folders ----------

/// Names of top-level folders that are definitely NOT profile
/// directories — skip these up front so the candidate list stays
/// clean. Mod folders (`@*`) are filtered separately by prefix.
const NON_PROFILE_DIR_NAMES: &[&str] = &[
    "mpmissions",
    "keys",
    "addons",
    "battleye",
    "bliss",
    "dta",
    "db",
    ".git",
    ".dzmgr",
    "mods",
];

fn scan_profile_folders(root: &Path) -> Vec<ProfileCandidate> {
    let Ok(rd) = std::fs::read_dir(root) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in rd.flatten() {
        let is_dir = entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false);
        if !is_dir {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('@') {
            continue;
        }
        let lower = name.to_ascii_lowercase();
        if NON_PROFILE_DIR_NAMES.contains(&lower.as_str()) {
            continue;
        }
        let (markers, confidence) = profile_markers(&entry.path());
        if confidence == 0 {
            continue;
        }
        out.push(ProfileCandidate {
            relative_path: name,
            markers,
            confidence,
        });
    }
    out.sort_by(|a, b| {
        b.confidence
            .cmp(&a.confidence)
            .then_with(|| a.relative_path.cmp(&b.relative_path))
    });
    out
}

fn profile_markers(dir: &Path) -> (Vec<String>, u32) {
    let mut markers = Vec::new();
    let mut score = 0u32;

    let name_lower = dir
        .file_name()
        .map(|n| n.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    if name_lower == "profiles" || name_lower == "profile" {
        markers.push("folder named 'profile(s)'".into());
        score += 2;
    }

    // Probe battleye/ directly — otherwise the file-marker loop
    // below can't early-break when battleye/ is absent, and profile
    // dirs often carry thousands of .RPT / .log files.
    if dir.join("battleye").is_dir() {
        markers.push("battleye/".into());
        score += 1;
    }

    if let Ok(rd) = std::fs::read_dir(dir) {
        let mut saw_rpt = false;
        let mut saw_console = false;
        let mut saw_crash = false;
        for e in rd.flatten() {
            if e.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                continue;
            }
            let fname_os = e.file_name();
            let fname = fname_os.to_string_lossy();
            let lower = fname.to_ascii_lowercase();
            if !saw_rpt && lower.ends_with(".rpt") {
                markers.push("*.RPT".into());
                saw_rpt = true;
                score += 1;
            }
            if !saw_console && lower.starts_with("console") && lower.ends_with(".log") {
                markers.push("console.log".into());
                saw_console = true;
                score += 1;
            }
            if !saw_crash && lower.starts_with("crash_") {
                markers.push("crash_*.txt".into());
                saw_crash = true;
                score += 1;
            }
            if saw_rpt && saw_console && saw_crash {
                break;
            }
        }
    }

    (markers, score)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn touch(p: &Path) {
        if let Some(parent) = p.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(p, b"").unwrap();
    }

    #[test]
    fn detects_vanilla_chernarus_mission() {
        let td = TempDir::new().unwrap();
        let mp = td.path().join("mpmissions/dayzOffline.chernarusplus");
        touch(&mp.join("init.c"));
        touch(&mp.join("cfgeconomycore.xml"));
        let r = scan_missions(&td.path().join("mpmissions"));
        assert_eq!(r.len(), 1);
        assert_eq!(
            r[0].relative_path,
            "mpmissions/dayzOffline.chernarusplus"
        );
        assert_eq!(r[0].map_hint, Some(MapId::Chernarusplus));
        assert!(r[0].markers.iter().any(|m| m == "init.c"));
    }

    #[test]
    fn map_id_from_folder_name_handles_known_variants() {
        assert_eq!(
            MapId::from_folder_name("dayzOffline.chernarusplus"),
            Some(MapId::Chernarusplus)
        );
        assert_eq!(
            MapId::from_folder_name("dayzOffline.enoch"),
            Some(MapId::Enoch)
        );
        assert_eq!(
            MapId::from_folder_name("community.livonia.template"),
            Some(MapId::Enoch)
        );
        assert_eq!(
            MapId::from_folder_name("dayzOffline.sakhal"),
            Some(MapId::Sakhal)
        );
        assert_eq!(MapId::from_folder_name("mod.custom.whatever"), None);
    }

    #[test]
    fn detects_multiple_missions_sorted_known_first() {
        let td = TempDir::new().unwrap();
        touch(&td.path().join("mpmissions/mod.custom.chernarusplus/init.c"));
        touch(&td.path().join("mpmissions/dayzOffline.enoch/init.c"));
        touch(&td.path().join("mpmissions/someMod.zzz/init.c"));
        let r = scan_missions(&td.path().join("mpmissions"));
        assert_eq!(r.len(), 3);
        assert!(r[0].map_hint.is_some());
        assert!(r[1].map_hint.is_some());
        assert!(r[2].map_hint.is_none());
    }

    #[test]
    fn skips_mpmissions_entries_without_markers() {
        let td = TempDir::new().unwrap();
        fs::create_dir_all(td.path().join("mpmissions/empty-folder")).unwrap();
        touch(&td.path().join("mpmissions/legit.chernarusplus/init.c"));
        let r = scan_missions(&td.path().join("mpmissions"));
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].relative_path, "mpmissions/legit.chernarusplus");
    }

    #[test]
    fn mission_db_markers_picked_up() {
        let td = TempDir::new().unwrap();
        let mp = td.path().join("mpmissions/dayzOffline.chernarusplus");
        touch(&mp.join("init.c"));
        touch(&mp.join("db/types.xml"));
        touch(&mp.join("db/events.xml"));
        let r = scan_missions(&td.path().join("mpmissions"));
        assert_eq!(r.len(), 1);
        assert!(r[0].markers.iter().any(|m| m == "db/types.xml"));
        assert!(r[0].markers.iter().any(|m| m == "db/events.xml"));
    }

    #[test]
    fn detects_profile_folders_by_rpt_and_battleye() {
        let td = TempDir::new().unwrap();
        fs::create_dir_all(td.path().join("profiles/battleye")).unwrap();
        touch(&td.path().join("profiles/DayZServer_x64.RPT"));
        touch(&td.path().join("profiles/console_2026-04-18.log"));
        fs::create_dir_all(td.path().join("profiles2")).unwrap();
        touch(&td.path().join("profiles2/DayZServer_x64.RPT"));
        fs::create_dir_all(td.path().join("mpmissions")).unwrap();
        fs::create_dir_all(td.path().join("keys")).unwrap();
        fs::create_dir_all(td.path().join("@ExpansionMod")).unwrap();
        fs::create_dir_all(td.path().join("random-empty-dir")).unwrap();

        let r = scan_profile_folders(td.path());
        let names: Vec<_> = r.iter().map(|p| p.relative_path.as_str()).collect();
        assert!(names.contains(&"profiles"));
        assert!(names.contains(&"profiles2"));
        assert!(!names.iter().any(|n| *n == "mpmissions"));
        assert!(!names.iter().any(|n| n.starts_with('@')));
        assert!(!names.iter().any(|n| *n == "random-empty-dir"));

        assert_eq!(r[0].relative_path, "profiles");
        assert!(r[0].confidence > r[1].confidence);
    }

    #[tokio::test]
    async fn scan_command_composes_results() {
        let td = TempDir::new().unwrap();
        touch(&td.path().join("serverDZ.cfg"));
        touch(&td.path().join("mpmissions/dayzOffline.chernarusplus/init.c"));
        fs::create_dir_all(td.path().join("profiles/battleye")).unwrap();
        touch(&td.path().join("profiles/DayZServer_x64.RPT"));

        let r = server_root_scan(td.path().to_string_lossy().to_string())
            .await
            .unwrap();

        assert!(r.root_exists);
        assert!(r.server_cfg_found);
        assert!(r.mpmissions_dir_exists);
        assert_eq!(r.missions.len(), 1);
        assert_eq!(
            r.missions[0].relative_path,
            "mpmissions/dayzOffline.chernarusplus"
        );
        assert_eq!(r.profile_folders.len(), 1);
        assert_eq!(r.profile_folders[0].relative_path, "profiles");
    }

    #[tokio::test]
    async fn scan_returns_gracefully_when_root_missing() {
        let r = server_root_scan("/definitely/does/not/exist/dzcm".into())
            .await
            .unwrap();
        assert!(!r.root_exists);
        assert!(r.missions.is_empty());
    }
}
