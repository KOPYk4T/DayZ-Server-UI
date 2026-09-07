//! Shared tool-path resolution for the reskin addon.
//!
//! Desktop UX, in order:
//! 1. Setup → Locate (`tool_overrides.json` in AppData).
//! 2. Optional bundled `tools/` next to the install (CI / portable).
//! 3. Auto-detect DayZ Tools / Arma 3 Tools from Steam libraries.
//!
//! Operators should never copy Bohemia binaries into the git repo.
//! Mikero tools (MakePbo, DeRap) are not on Steam — those stay
//! Locate-or-bundle.

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
    resolve_exe(
        app_data_dir,
        "image_to_paa",
        image_to_paa_exe(tools_dir),
        || detect_dayz_tools_exe(&["ImageToPAA", "ImageToPAA.exe"]),
    )
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
    resolve_exe(
        app_data_dir,
        "ds_sign",
        ds_sign_file_exe(tools_dir),
        || detect_dsutils_exe("DSSignFile.exe"),
    )
}

pub fn ds_create_key_exe(tools_dir: &Path) -> PathBuf {
    tools_dir.join("DsUtils").join("DSCreateKey.exe")
}

pub fn ds_create_key_exe_resolved(
    app_data_dir: &Path,
    tools_dir: &Path,
) -> PathBuf {
    resolve_exe(
        app_data_dir,
        "ds_create_key",
        ds_create_key_exe(tools_dir),
        || detect_dsutils_exe("DSCreateKey.exe"),
    )
}

/// First `.biprivatekey` next to the resolved signer, then bundled
/// `tools/DsUtils`, then AppData `keys/`. Matches how people already
/// keep keys inside DayZ Tools.
pub fn find_private_key(app_data_dir: &Path, tools_dir: &Path) -> Option<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(p) = ds_sign_file_exe_resolved(app_data_dir, tools_dir).parent() {
        dirs.push(p.to_path_buf());
    }
    if let Some(p) = ds_create_key_exe_resolved(app_data_dir, tools_dir).parent() {
        dirs.push(p.to_path_buf());
    }
    dirs.push(tools_dir.join("DsUtils"));
    dirs.push(app_data_dir.join("keys"));
    dirs.dedup();
    dirs.into_iter().find_map(|d| first_biprivatekey(&d))
}

fn first_biprivatekey(dir: &Path) -> Option<PathBuf> {
    let rd = std::fs::read_dir(dir).ok()?;
    rd.flatten().map(|e| e.path()).find(|p| {
        p.extension()
            .and_then(|s| s.to_str())
            .is_some_and(|s| s.eq_ignore_ascii_case("biprivatekey"))
    })
}

fn resolve_exe(
    app_data_dir: &Path,
    override_id: &str,
    bundled: PathBuf,
    detect: impl FnOnce() -> Option<PathBuf>,
) -> PathBuf {
    if let Some(p) = crate::commands::tool_overrides::override_for(app_data_dir, override_id) {
        if p.is_file() {
            return p;
        }
    }
    if bundled.is_file() {
        return bundled;
    }
    detect().unwrap_or(bundled)
}

fn detect_dsutils_exe(file_name: &str) -> Option<PathBuf> {
    steam_library_roots().into_iter().find_map(|root| {
        let dayz = root
            .join("steamapps")
            .join("common")
            .join("DayZ Tools")
            .join("Bin")
            .join("DsUtils")
            .join(file_name);
        if dayz.is_file() {
            return Some(dayz);
        }
        let arma = root
            .join("steamapps")
            .join("common")
            .join("Arma 3 Tools")
            .join("DSUtils")
            .join(file_name);
        arma.is_file().then_some(arma)
    })
}

fn detect_dayz_tools_exe(parts: &[&str]) -> Option<PathBuf> {
    steam_library_roots().into_iter().find_map(|root| {
        let mut p = root
            .join("steamapps")
            .join("common")
            .join("DayZ Tools")
            .join("Bin");
        for part in parts {
            p.push(part);
        }
        p.is_file().then_some(p)
    })
}

fn steam_library_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    for key in ["ProgramFiles(x86)", "ProgramFiles"] {
        if let Ok(pf) = std::env::var(key) {
            let steam = PathBuf::from(pf).join("Steam");
            let vdf = steam.join("steamapps").join("libraryfolders.vdf");
            if steam.is_dir() {
                push_unique(&mut roots, steam);
            }
            if let Ok(text) = std::fs::read_to_string(vdf) {
                for lib in parse_steam_library_paths(&text) {
                    push_unique(&mut roots, lib);
                }
            }
        }
    }
    roots
}

fn push_unique(out: &mut Vec<PathBuf>, p: PathBuf) {
    if !out.iter().any(|e| e == &p) {
        out.push(p);
    }
}

/// Pulls `"path" "D:\\SteamLibrary"` entries out of Steam's
/// `libraryfolders.vdf`. Loose enough for the few layouts Steam
/// has shipped; unknown keys are ignored.
fn parse_steam_library_paths(vdf: &str) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut rest = vdf;
    while let Some(i) = rest.find("\"path\"") {
        rest = &rest[i + 6..];
        let Some(start) = rest.find('"') else { break };
        rest = &rest[start + 1..];
        let Some(end) = rest.find('"') else { break };
        let raw = rest[..end].replace("\\\\", "\\");
        if !raw.is_empty() {
            out.push(PathBuf::from(raw));
        }
        rest = &rest[end + 1..];
    }
    out
}

pub fn extract_pbo_exe_resolved(
    app_data_dir: &Path,
    tools_dir: &Path,
) -> PathBuf {
    crate::commands::tool_overrides::override_for(app_data_dir, "extract_pbo")
        .unwrap_or_else(|| extract_pbo_exe(tools_dir))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_steam_libraryfolders_vdf() {
        let vdf = r#"
"libraryfolders"
{
	"0"
	{
		"path"		"C:\\Program Files (x86)\\Steam"
	}
	"1"
	{
		"path"		"D:\\SteamLibrary"
	}
}
"#;
        let libs = parse_steam_library_paths(vdf);
        assert_eq!(
            libs,
            vec![
                PathBuf::from(r"C:\Program Files (x86)\Steam"),
                PathBuf::from(r"D:\SteamLibrary"),
            ]
        );
    }
}
