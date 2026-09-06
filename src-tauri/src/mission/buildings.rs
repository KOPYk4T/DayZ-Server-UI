//! Mission loader for `mapgroupproto.xml` + `mapgrouppos.xml`
//! (PDR §8 / Phase 8a + 8b).
//!
//! In vanilla setups both files live inside the map's PBO addon —
//! admins who want custom loot spawning extract them into the
//! mission root. The mapgrouppos.xml file is optional; when absent,
//! placement counts stay 0.

use crate::domain::BuildingsData;
use crate::error::AppResult;
use crate::parsers::{mapgrouppos_xml, mapgroupproto_xml};

use super::MissionContext;

pub fn path(ctx: &MissionContext) -> std::path::PathBuf {
    resolve_case_insensitive(&ctx.mission_root, "mapgroupproto.xml")
}

pub fn pos_path(ctx: &MissionContext) -> std::path::PathBuf {
    resolve_case_insensitive(&ctx.mission_root, "mapgrouppos.xml")
}

fn resolve_case_insensitive(
    root: &std::path::Path,
    canonical_name: &str,
) -> std::path::PathBuf {
    let canonical = root.join(canonical_name);
    if canonical.exists() {
        return canonical;
    }
    let needle = canonical_name.to_ascii_lowercase();
    if let Ok(rd) = std::fs::read_dir(root) {
        for entry in rd.flatten() {
            if entry.file_name().to_string_lossy().to_ascii_lowercase() == needle {
                return entry.path();
            }
        }
    }
    canonical
}

pub fn load(ctx: &MissionContext) -> AppResult<BuildingsData> {
    let proto_path = path(ctx);
    let mut data = if proto_path.exists() {
        mapgroupproto_xml::parse_file(&proto_path)?
    } else {
        BuildingsData::default()
    };

    let pp = pos_path(ctx);
    if pp.exists() {
        let counts = mapgrouppos_xml::count_by_group_file(&pp)?;
        let known: std::collections::HashSet<String> =
            data.prototypes.iter().map(|p| p.name.clone()).collect();

        let mut total: usize = 0;
        let mut unknown: Vec<String> = Vec::new();
        for (group, count) in &counts {
            total += *count;
            if !known.contains(group) {
                unknown.push(group.clone());
            }
        }
        unknown.sort();
        data.total_placements = total;
        data.unknown_placement_groups = unknown;

        for proto in data.prototypes.iter_mut() {
            if let Some(c) = counts.get(&proto.name) {
                proto.placement_count = *c;
            }
        }
    }
    Ok(data)
}
