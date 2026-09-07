//! Files the dedicated process writes while it runs. Not mission config.
//! Kept out of workspace git, snapshots, and copy/reset trees.

pub const GITIGNORE_MARK_START: &str = "# >>> dayz-serverui noise";
pub const GITIGNORE_MARK_END: &str = "# <<< dayz-serverui noise";

pub const GITIGNORE_BLOCK: &str = "\
# >>> dayz-serverui noise
# Runtime output from the dedicated process. Not mission config.
*.RPT
*.rpt
*.ADM
*.adm
*.log
*.mdmp
*.dmp
logs/
Logs/
log/
# <<< dayz-serverui noise
";

/// Workspace- or tree-relative path, either slash style.
pub fn is_runtime_noise(rel: &str) -> bool {
    let key = rel.replace('\\', "/");
    for part in key.split('/') {
        if part.is_empty() {
            continue;
        }
        let lower = part.to_ascii_lowercase();
        if lower == "logs" || lower == "log" {
            return true;
        }
    }
    let name = key
        .rsplit('/')
        .next()
        .unwrap_or(&key)
        .to_ascii_lowercase();
    matches_noise_filename(&name)
}

fn matches_noise_filename(name: &str) -> bool {
    name.ends_with(".rpt")
        || name.ends_with(".adm")
        || name.ends_with(".log")
        || name.ends_with(".mdmp")
        || name.ends_with(".dmp")
}

#[cfg(test)]
mod tests {
    use super::is_runtime_noise;

    #[test]
    fn rpt_and_adm_are_noise() {
        assert!(is_runtime_noise(
            "profiles/server/DayZServer_x64_2026-01-01_12-00-00.RPT"
        ));
        assert!(is_runtime_noise("profiles/server/DayZServer_x64.ADM"));
    }

    #[test]
    fn log_folders_are_noise() {
        assert!(is_runtime_noise("profiles/ExpansionMod/Logs/ai.log"));
        assert!(is_runtime_noise(r"profiles\server\logs\trace.txt"));
        assert!(is_runtime_noise(
            "instance/BlankSoftware/Core/Logs/Log_2026-09-04_15-55-18.log"
        ));
    }

    #[test]
    fn mission_config_is_kept() {
        assert!(!is_runtime_noise(
            "mpmissions/dayzOffline.enoch/db/types.xml"
        ));
        assert!(!is_runtime_noise("serverDZ.cfg"));
        assert!(!is_runtime_noise("profiles/server/Users/Survivor.dayz"));
        assert!(!is_runtime_noise("profiles/BattlEye/BEServer_x64.cfg"));
    }
}
