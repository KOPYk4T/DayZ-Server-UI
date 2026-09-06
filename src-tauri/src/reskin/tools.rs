//! Shared tool-path resolution for the reskin addon.
//!
//! The environment probe in `commands::reskin_env` and the vanilla
//! index builder both need to find bundled tools (`DeRap.exe`, later
//! `ImageToPAA.exe`, `MakePbo.exe`, etc.). They share this resolver
//! so there's one source of truth for where `tools/` lives.

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

/// Resolve the tools directory. Priority:
///
/// 1. `DZMGR_TOOLS_DIR` env var — override for power users or CI.
/// 2. Tauri resource dir + `/tools` (release/bundled builds).
/// 3. Walk up from the exe location looking for a `tools/` sibling —
///    handles dev builds launched deep under `target/debug/`.
/// 4. Walk up from the current working directory — last-resort for
///    unusual launches.
pub fn resolve_tools_dir(app: &AppHandle) -> PathBuf {
    if let Ok(env) = std::env::var("DZMGR_TOOLS_DIR") {
        let p = PathBuf::from(env);
        if p.exists() {
            return p;
        }
    }

    if let Ok(resource) = app.path().resource_dir() {
        let candidate = resource.join("tools");
        if candidate.exists() {
            return candidate;
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(found) = walk_up_for_tools(&exe) {
            return found;
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        if let Some(found) = walk_up_for_tools(&cwd) {
            return found;
        }
    }

    // Fallback — return a path that definitely won't exist so callers
    // surface "tools_dir_exists: false" rather than silently reading
    // under some random cwd.
    PathBuf::from("tools")
}

fn walk_up_for_tools(start: &Path) -> Option<PathBuf> {
    let mut current = start;
    loop {
        let candidate = current.join("tools");
        if candidate.is_dir() {
            return Some(candidate);
        }
        match current.parent() {
            Some(parent) => current = parent,
            None => return None,
        }
    }
}

pub fn derap_exe(tools_dir: &Path) -> PathBuf {
    tools_dir.join("DePboTools").join("bin").join("DeRap.exe")
}

/// Same as `derap_exe`, but consults the tool-overrides registry
/// first. New code paths (capability checks, the build pipeline)
/// should use `*_resolved` variants so operators with the tool
/// installed elsewhere can point the app at it via Setup → "Locate
/// exe…" instead of being forced to copy it into `tools/`.
pub fn derap_exe_resolved(app_data_dir: &Path, tools_dir: &Path) -> PathBuf {
    crate::commands::tool_overrides::override_for(app_data_dir, "derap")
        .unwrap_or_else(|| derap_exe(tools_dir))
}

pub fn image_to_paa_exe(tools_dir: &Path) -> PathBuf {
    tools_dir.join("ImageToPAA").join("ImageToPAA.exe")
}

pub fn image_to_paa_exe_resolved(
    app_data_dir: &Path,
    tools_dir: &Path,
) -> PathBuf {
    crate::commands::tool_overrides::override_for(app_data_dir, "image_to_paa")
        .unwrap_or_else(|| image_to_paa_exe(tools_dir))
}

pub fn make_pbo_exe(tools_dir: &Path) -> PathBuf {
    tools_dir.join("DePboTools").join("bin").join("MakePbo.exe")
}

pub fn make_pbo_exe_resolved(
    app_data_dir: &Path,
    tools_dir: &Path,
) -> PathBuf {
    crate::commands::tool_overrides::override_for(app_data_dir, "make_pbo")
        .unwrap_or_else(|| make_pbo_exe(tools_dir))
}

/// Mikero's PBO unpacker — pulls files out of a binarised `.pbo`
/// into a destination directory. Used by the mod scanner to read
/// `config.bin` (and any siblings) out of a mod's addons before
/// handing them to DeRap + the config parser.
pub fn extract_pbo_exe(tools_dir: &Path) -> PathBuf {
    tools_dir
        .join("DePboTools")
        .join("bin")
        .join("ExtractPbo.exe")
}

pub fn ds_sign_file_exe(tools_dir: &Path) -> PathBuf {
    tools_dir.join("DsUtils").join("DSSignFile.exe")
}

pub fn ds_sign_file_exe_resolved(
    app_data_dir: &Path,
    tools_dir: &Path,
) -> PathBuf {
    crate::commands::tool_overrides::override_for(app_data_dir, "ds_sign")
        .unwrap_or_else(|| ds_sign_file_exe(tools_dir))
}

pub fn ds_create_key_exe(tools_dir: &Path) -> PathBuf {
    tools_dir.join("DsUtils").join("DSCreateKey.exe")
}

pub fn extract_pbo_exe_resolved(
    app_data_dir: &Path,
    tools_dir: &Path,
) -> PathBuf {
    crate::commands::tool_overrides::override_for(app_data_dir, "extract_pbo")
        .unwrap_or_else(|| extract_pbo_exe(tools_dir))
}
