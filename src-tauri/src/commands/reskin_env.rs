//! Environment probe for the Reskin addon.
//!
//! The reskin pipeline shells out to Bohemia tools (DayZ Tools /
//! Locate) and Mikero packers, and reads vanilla DayZ data from the
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
    /// `.biprivatekey` found next to DSSignFile, in bundled
    /// `tools/DsUtils`, or in AppData `keys/`.
    pub private_key_present: bool,
    /// Absolute path of that key when present.
    pub signing_key_path: Option<String>,
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
    state: State<'_, AppState>,
) -> AppResult<ReskinEnvironment> {
    let tools_dir = tools::resolve_tools_dir(&app);
    let app_data = &state.app_data_dir;
    let tools_dir_exists = tools_dir.exists();

    let tools: Vec<ToolStatus> = TOOLS
        .iter()
        .map(|(id, display, rel)| {
            let candidate = resolved_tool_path(id, app_data, &tools_dir);
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

    let p_drive = probe_p_drive(app_data, &tools_dir);

    // "Ready" = required emit tools + P: data. A missing bundled
    // `tools/` folder is fine when DayZ Tools / Locate filled the
    // Bohemia slots. Mikero extras (pboProject, DeRap) stay optional.
    let required_ids = ["imageToPaa", "makePbo", "dsSignFile", "dsCreateKey"];
    let required_present = required_ids
        .iter()
        .all(|id| tools.iter().any(|t| t.id == *id && t.present));
    let ready = required_present
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

fn resolved_tool_path(id: &str, app_data: &Path, tools_dir: &Path) -> PathBuf {
    match id {
        "imageToPaa" => tools::image_to_paa_exe_resolved(app_data, tools_dir),
        "makePbo" => tools::make_pbo_exe_resolved(app_data, tools_dir),
        "deRap" => tools::derap_exe_resolved(app_data, tools_dir),
        "dsSignFile" => tools::ds_sign_file_exe_resolved(app_data, tools_dir),
        "dsCreateKey" => tools::ds_create_key_exe_resolved(app_data, tools_dir),
        _ => tools_dir.join(
            TOOLS
                .iter()
                .find(|(tid, _, _)| *tid == id)
                .map(|(_, _, rel)| *rel)
                .unwrap_or(id),
        ),
    }
}

fn probe_p_drive(app_data: &Path, tools_dir: &Path) -> PDriveStatus {
    let p_root = PathBuf::from("P:\\");
    let mounted = std::fs::metadata(&p_root).is_ok();
    let has_scripts = p_root.join("scripts").is_dir();
    let has_dz = p_root.join("DZ").is_dir();
    let signing_key_path = tools::find_private_key(app_data, tools_dir)
        .map(|p| p.to_string_lossy().into_owned());

    PDriveStatus {
        mounted,
        has_scripts,
        has_dz,
        private_key_present: signing_key_path.is_some(),
        signing_key_path,
    }
}
