//! Extract vanilla `.paa` textures to editable PNGs for the reskin
//! wizard. Bohemia's ImageToPAA handles the conversion cleanly in
//! both directions — PAA → PNG is just `ImageToPAA.exe <in.paa>
//! <out.png>`. TexView is used as a fallback if the primary tool
//! refuses (older ImageToPAA builds are write-only).
//!
//! Extracted files land under `<app-data>/reskin/extracted/<class>/`
//! with deterministic names (`<slot>_<selection>.png`), so a second
//! extract for the same slot overwrites rather than accumulating
//! stale copies. The wizard auto-fills the slot's override source
//! with the extracted path so the user can open → edit → save and
//! the build step reads the edited file in place.

use std::path::PathBuf;
use std::process::Command;

use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::error::{AppError, AppResult};
use crate::reskin::tools;
use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedTexture {
    pub source_paa: String,
    pub extracted_png: String,
}

#[tauri::command]
pub async fn reskin_extract_texture(
    class_name: String,
    slot_index: u32,
    selection: String,
    texture_path: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<ExtractedTexture> {
    // Reject non-file texture references early so the user gets a
    // clear message instead of "file not found". Two common cases:
    //   - empty string → slot has no vanilla texture at all
    //   - `#(...)color(...)` → Bohemia's procedural solid-colour
    //     texture, no .paa exists on disk
    let raw = texture_path.trim();
    if raw.is_empty() {
        return Err(AppError::Internal(
            "this slot has no vanilla texture to extract — pick a replacement image directly with 'Pick image'.".into(),
        ));
    }
    if raw.starts_with('#') {
        return Err(AppError::Internal(format!(
            "this slot uses a procedural colour texture ({raw}), not a .paa file. Pick a replacement image directly with 'Pick image'.",
        )));
    }

    // Texture paths live in P:\ with backslash separators. Some
    // configs emit forward slashes, so normalise both. Strip any
    // leading separator to keep the join clean.
    let normalised = raw.replace('/', "\\");
    let trimmed = normalised.trim_start_matches('\\');
    let source_paa = PathBuf::from(format!("P:\\{trimmed}"));
    if !source_paa.is_file() {
        return Err(AppError::Internal(format!(
            "vanilla texture not found at {} — is the P: drive mounted and extracted?",
            source_paa.display()
        )));
    }

    let tools_dir = tools::resolve_tools_dir(&app);
    let image_to_paa = tools::image_to_paa_exe(&tools_dir);
    if !image_to_paa.is_file() {
        return Err(AppError::Internal(
            "ImageToPAA.exe missing — check tools/ImageToPAA/".into(),
        ));
    }

    let dest_dir = state
        .app_data_dir
        .join("reskin")
        .join("extracted")
        .join(sanitise(&class_name));
    std::fs::create_dir_all(&dest_dir)?;
    let slot_label = if selection.trim().is_empty() {
        format!("slot{slot_index}")
    } else {
        sanitise(&selection)
    };
    let dest = dest_dir.join(format!("{slot_index:02}_{slot_label}.png"));

    // Remove any stale extract so we can detect whether the tool
    // actually produced a file this run.
    let _ = std::fs::remove_file(&dest);

    // Primary path — ImageToPAA is bidirectional in modern builds.
    let primary = Command::new(&image_to_paa)
        .arg(&source_paa)
        .arg(&dest)
        .output();

    // Fallback — some ImageToPAA builds only write PAAs. TexView in
    // the same folder can save as PNG when handed the right flags.
    if !dest.is_file() {
        let texview = tools_dir.join("ImageToPAA").join("TexView.exe");
        if texview.is_file() {
            let _ = Command::new(&texview)
                .arg("-c")
                .arg(&source_paa)
                .arg(&dest)
                .output();
        }
    }

    if !dest.is_file() {
        let reason = match primary {
            Ok(out) if !out.status.success() => {
                let stderr = String::from_utf8_lossy(&out.stderr);
                format!("ImageToPAA exited {}: {}", out.status, stderr.trim())
            }
            Ok(_) => "ImageToPAA ran but produced no output".into(),
            Err(e) => format!("spawn ImageToPAA failed: {e}"),
        };
        return Err(AppError::Internal(format!(
            "PAA → PNG conversion failed. {}. You can open the .paa manually with TexView at {}",
            reason,
            source_paa.display()
        )));
    }

    Ok(ExtractedTexture {
        source_paa: source_paa.to_string_lossy().into_owned(),
        extracted_png: dest.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub async fn reskin_reveal_extracted(
    app: AppHandle,
    state: State<'_, AppState>,
    class_name: Option<String>,
) -> AppResult<()> {
    let mut dir = state.app_data_dir.join("reskin").join("extracted");
    if let Some(n) = class_name.as_deref() {
        dir = dir.join(sanitise(n));
    }
    if !dir.exists() {
        std::fs::create_dir_all(&dir)?;
    }
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(())
}

fn sanitise(s: &str) -> String {
    s.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect()
}
