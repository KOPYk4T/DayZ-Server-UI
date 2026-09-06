//! Environment probe for the Reskin addon.
//!
//! The reskin pipeline shells out to Bohemia + Mikero tools that ship
//! with the app under `tools/`, and reads vanilla DayZ data from the
//! operator's P: drive (Bohemia's Workdrive convention). Before the
//! addon will let the user start a reskin, we need to know:
//!
//! - Each required tool `.exe` is present and findable.
//! - `P:\` is mounted and actually contains unpacked DayZ data
//!   (`P:\scripts\` and `P:\DZ\` — not `P:\DayZ\`, which is the Arma
//!   3 convention and wrong for DayZ).
//!
//! The result of this probe drives a setup-gate UI in the addon's
//! first page: status per tool + per expected P:-drive subdir, plus
//! a hint string the UI turns into actionable guidance.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::error::AppResult;
use crate::reskin::tools;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    pub id: &'static str,
    pub display_name: &'static str,
    /// Relative location the probe expected the tool at, rooted at
    /// the tools directory. Returned so the UI can say "drop
    /// `ImageToPAA.exe` at `tools/ImageToPAA/ImageToPAA.exe`".
    pub expected_relative: String,
    /// Absolute path the probe actually resolved to, when found.
    pub resolved_path: Option<String>,
    pub present: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PDriveStatus {
    /// `true` when any readable entry exists at `P:\`. On Windows
    /// this is the closest approximation to "the drive is mounted".
    pub mounted: bool,
    /// `true` when `P:\scripts\` exists — Enfusion script tree.
    pub has_scripts: bool,
    /// `true` when `P:\DZ\` exists — vanilla addons (configs, p3d,
    /// textures) live under here.
    pub has_dz: bool,
    /// When signing is expected to work the operator needs a
    /// `.biprivatekey`. Surface whether *one* of the bundled ones
    /// is detected so we can warn otherwise.
    pub private_key_present: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReskinEnvironment {
    /// Absolute path the app is using as its tools root. The setup
    /// UI prints this so the operator can check what the app is
    /// looking at.
    pub tools_dir: String,
    pub tools_dir_exists: bool,
    pub tools: Vec<ToolStatus>,
    pub p_drive: PDriveStatus,
    /// Coarse summary — `true` when everything needed to start a
    /// reskin is in place. Used to gate the wizard entry button.
    pub ready: bool,
}

/// Tool definitions as they live inside `tools/`. Each entry is the
/// tool id used by the frontend, a user-facing label, and the path
/// relative to the tools root. The path separator is always `/` in
/// the source — we join through `PathBuf` so Windows backslashes
/// come out correctly.
const TOOLS: &[(&str, &str, &str)] = &[
    (
        "imageToPaa",
        "ImageToPAA",
        "ImageToPAA/ImageToPAA.exe",
    ),
    (
        "makePbo",
        "MakePbo (Mikero)",
        "DePboTools/bin/MakePbo.exe",
    ),
    (
        "pboProject",
        "pboProject (Mikero)",
        "DePboTools/bin/pboProject.exe",
    ),
    (
        "deRap",
        "DeRap (Mikero)",
        "DePboTools/bin/DeRap.exe",
    ),
    (
        "dsSignFile",
        "DSSignFile",
        "DsUtils/DSSignFile.exe",
    ),
    (
        "dsCreateKey",
        "DSCreateKey",
        "DsUtils/DSCreateKey.exe",
    ),
];

#[tauri::command]
pub async fn reskin_env_check(
    app: AppHandle,
    _state: State<'_, AppState>,
) -> AppResult<ReskinEnvironment> {
    let tools_dir = tools::resolve_tools_dir(&app);
    let tools_dir_exists = tools_dir.exists();

    let tools: Vec<ToolStatus> = TOOLS
        .iter()
        .map(|(id, display, rel)| {
            let candidate = tools_dir.join(rel);
            let present = candidate.is_file();
            ToolStatus {
                id,
                display_name: display,
                expected_relative: (*rel).into(),
                resolved_path: if present {
                    Some(candidate.to_string_lossy().into_owned())
                } else {
                    None
                },
                present,
            }
        })
        .collect();

    let p_drive = probe_p_drive(&tools_dir);

    // "Ready" = everything except `pboProject` and `deRap`, which are
    // nice-to-haves (MakePbo is enough to pack, and the DePboTools
    // bundle always ships all of them together anyway). P: drive
    // must have both the scripts tree and DZ tree.
    let required_ids = ["imageToPaa", "makePbo", "dsSignFile", "dsCreateKey"];
    let required_present = required_ids
        .iter()
        .all(|id| tools.iter().any(|t| t.id == *id && t.present));
    let ready = tools_dir_exists
        && required_present
        && p_drive.mounted
        && p_drive.has_scripts
        && p_drive.has_dz;

    Ok(ReskinEnvironment {
        tools_dir: tools_dir.to_string_lossy().into_owned(),
        tools_dir_exists,
        tools,
        p_drive,
        ready,
    })
}

fn probe_p_drive(tools_dir: &Path) -> PDriveStatus {
    let p_root = PathBuf::from("P:\\");
    let mounted = std::fs::metadata(&p_root).is_ok();
    let has_scripts = p_root.join("scripts").is_dir();
    let has_dz = p_root.join("DZ").is_dir();

    // Detect the bundled keypair we know is shipped in tools/DsUtils.
    let private_key_present = tools_dir
        .join("DsUtils")
        .read_dir()
        .map(|it| {
            it.filter_map(Result::ok)
                .any(|e| {
                    e.path()
                        .extension()
                        .and_then(|s| s.to_str())
                        .map(|s| s.eq_ignore_ascii_case("biprivatekey"))
                        .unwrap_or(false)
                })
        })
        .unwrap_or(false);

    PDriveStatus {
        mounted,
        has_scripts,
        has_dz,
        private_key_present,
    }
}
