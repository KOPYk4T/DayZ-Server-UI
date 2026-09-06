//! `mapgrouppos.xml` aggregate + placement parser (PDR §8 / Phase 8b + 8c).
//!
//! Real vanilla shape (from `examples/mapgrouppos.xml`):
//!
//! ```xml
//! <map>
//!   <group name="Land_Misc_FeedShack"
//!          pos="80.262581 113.793480 4422.178223"
//!          rpy="-0.0 0.0 -70.01"
//!          a="160.01"/>
//! </map>
//! ```
//!
//! `pos` is space-separated `x y z` where **y is elevation** in
//! metres — DayZ's world is horizontal `(x, z)`. Chernarus has
//! ~11 700 placements (DayZ 1.26). We expose two parsers:
//!   - `count_by_group_*` — cheap hash count per prototype.
//!   - `list_placements_*` — full `(name, x, y, z)` tuples. `y`
//!     powers the nearest-neighbour height suggester when the
//!     Expansion editors drop a new pin — no other source of
//!     truth for terrain elevation is available client-side.

use std::collections::HashMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

use quick_xml::events::Event;
use quick_xml::Reader;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Placement {
    pub name: String,
    pub x: f64,
    /// Elevation in metres. Powers the Expansion editors'
    /// nearest-building Y-suggester when placing a new NPC / trader.
    pub y: f64,
    pub z: f64,
}

pub fn count_by_group_file(path: &Path) -> AppResult<HashMap<String, usize>> {
    let bytes = std::fs::read(path)?;
    count_by_group_bytes(&bytes)
        .map_err(|e| AppError::Internal(format!("parsing {}: {e}", path.display())))
}

pub fn count_by_group_bytes(bytes: &[u8]) -> Result<HashMap<String, usize>, String> {
    let mut reader = Reader::from_reader(bytes);
    reader.config_mut().trim_text(true);
    let mut counts: HashMap<String, usize> = HashMap::new();
    let mut buf = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buf)
            .map_err(|e| format!("xml read: {e}"))?
        {
            Event::Start(e) | Event::Empty(e) => {
                let name = std::str::from_utf8(e.name().as_ref())
                    .unwrap_or("")
                    .to_ascii_lowercase();
                if name == "group" {
                    if let Some(g) = attr_name(&e) {
                        *counts.entry(g).or_insert(0) += 1;
                    }
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(counts)
}

fn attr_name(e: &quick_xml::events::BytesStart<'_>) -> Option<String> {
    for attr in e.attributes().flatten() {
        let key = std::str::from_utf8(attr.key.as_ref())
            .unwrap_or("")
            .to_ascii_lowercase();
        if key == "name" {
            return attr.unescape_value().ok().map(|c| c.into_owned());
        }
    }
    None
}

// ---------- Placement list (coordinate-emitting) ----------

pub fn list_placements_file(path: &Path) -> AppResult<Vec<Placement>> {
    let bytes = std::fs::read(path)?;
    list_placements_bytes(&bytes)
        .map_err(|e| AppError::Internal(format!("parsing {}: {e}", path.display())))
}

pub fn list_placements_bytes(bytes: &[u8]) -> Result<Vec<Placement>, String> {
    let mut reader = Reader::from_reader(bytes);
    reader.config_mut().trim_text(true);
    let mut out = Vec::new();
    let mut buf = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buf)
            .map_err(|e| format!("xml read: {e}"))?
        {
            Event::Start(e) | Event::Empty(e) => {
                let name = std::str::from_utf8(e.name().as_ref())
                    .unwrap_or("")
                    .to_ascii_lowercase();
                if name == "group" {
                    if let Some(placement) = parse_placement(&e) {
                        out.push(placement);
                    }
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(out)
}

fn parse_placement(e: &quick_xml::events::BytesStart<'_>) -> Option<Placement> {
    let mut group_name: Option<String> = None;
    let mut pos_raw: Option<String> = None;
    for attr in e.attributes().flatten() {
        let key = std::str::from_utf8(attr.key.as_ref())
            .unwrap_or("")
            .to_ascii_lowercase();
        match key.as_str() {
            "name" => {
                group_name = attr.unescape_value().ok().map(|c| c.into_owned());
            }
            "pos" => {
                pos_raw = attr.unescape_value().ok().map(|c| c.into_owned());
            }
            _ => {}
        }
    }
    let name = group_name?;
    let pos = pos_raw?;
    // pos is space-separated "x y z" with y being elevation.
    let parts: Vec<&str> = pos.split_ascii_whitespace().collect();
    if parts.len() < 3 {
        return None;
    }
    let x = parts[0].parse::<f64>().ok()?;
    let y = parts[1].parse::<f64>().ok()?;
    let z = parts[2].parse::<f64>().ok()?;
    Some(Placement { name, x, y, z })
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<map>
    <group name="Land_House_1W01" pos="5234.12 0.0 12345.67" rpy="0 0 0"/>
    <group name="Land_House_1W01" pos="5300.0 0.0 12400.0"/>
    <group name="Land_House_2W01" pos="5500.0 0.0 12700.0"/>
    <group name="Land_Military_Barracks" pos="3000 0 4500"/>
    <group name="Land_Military_Barracks" pos="3100 0 4600"/>
    <group name="Land_Military_Barracks" pos="3200 0 4700"/>
</map>
"#;

    #[test]
    fn counts_by_group_name() {
        let counts = count_by_group_bytes(SAMPLE.as_bytes()).unwrap();
        assert_eq!(counts.get("Land_House_1W01").copied(), Some(2));
        assert_eq!(counts.get("Land_House_2W01").copied(), Some(1));
        assert_eq!(counts.get("Land_Military_Barracks").copied(), Some(3));
    }

    #[test]
    fn empty_map_returns_empty_counts() {
        let counts = count_by_group_bytes(b"<map></map>").unwrap();
        assert!(counts.is_empty());
    }

    #[test]
    fn ignores_groups_without_name_attr() {
        let src = r#"<map>
            <group pos="0 0 0"/>
            <group name="Valid" pos="1 1 1"/>
        </map>"#;
        let counts = count_by_group_bytes(src.as_bytes()).unwrap();
        assert_eq!(counts.len(), 1);
        assert_eq!(counts.get("Valid").copied(), Some(1));
    }

    #[test]
    fn handles_both_self_closing_and_explicit_close_tags() {
        let src = r#"<map>
            <group name="A" pos="0 0 0"/>
            <group name="B" pos="1 1 1"></group>
        </map>"#;
        let counts = count_by_group_bytes(src.as_bytes()).unwrap();
        assert_eq!(counts.get("A").copied(), Some(1));
        assert_eq!(counts.get("B").copied(), Some(1));
    }

    // ---------- Placement (coordinate) tests ----------

    const SAMPLE_WITH_COORDS: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<map>
    <group name="Land_Misc_FeedShack" pos="80.262581 113.793480 4422.178223" rpy="-0 0 -70" a="160"/>
    <group name="Land_Shed_W2" pos="174.522446 103.526039 2380.768066" rpy="0 0 160" a="-70"/>
    <group name="Land_Village_Pub" pos="238.902985 316.285614 7505.139160"/>
</map>
"#;

    #[test]
    fn list_placements_extracts_xyz() {
        let placements = list_placements_bytes(SAMPLE_WITH_COORDS.as_bytes()).unwrap();
        assert_eq!(placements.len(), 3);
        assert_eq!(placements[0].name, "Land_Misc_FeedShack");
        assert!((placements[0].x - 80.262581).abs() < 1e-4);
        assert!((placements[0].y - 113.793480).abs() < 1e-4);
        assert!((placements[0].z - 4422.178223).abs() < 1e-4);
        assert_eq!(placements[2].name, "Land_Village_Pub");
        assert!((placements[2].x - 238.902985).abs() < 1e-4);
        assert!((placements[2].y - 316.285614).abs() < 1e-4);
        assert!((placements[2].z - 7505.139160).abs() < 1e-4);
    }

    #[test]
    fn list_placements_skips_malformed_pos() {
        let src = r#"<map>
            <group name="OK" pos="10 20 30"/>
            <group name="NoPos"/>
            <group name="ShortPos" pos="10 20"/>
            <group name="Garbage" pos="a b c"/>
            <group name="Valid" pos="100 200 300"/>
        </map>"#;
        let placements = list_placements_bytes(src.as_bytes()).unwrap();
        let names: Vec<&str> = placements.iter().map(|p| p.name.as_str()).collect();
        assert_eq!(names, vec!["OK", "Valid"]);
    }

    /// Integration test against the user's real vanilla sample.
    /// Skips when the sample isn't checked in.
    #[test]
    fn parses_real_vanilla_chernarus_mapgrouppos() {
        let path = std::path::Path::new("../../examples/mapgrouppos.xml");
        if !path.exists() {
            eprintln!("skipping: no sample at {}", path.display());
            return;
        }
        let placements = list_placements_file(path).expect("sample parses");
        assert!(
            placements.len() >= 10_000,
            "expected 10k+ placements, got {}",
            placements.len()
        );
        // Sanity: every placement's (x, z) should fall inside
        // Chernarus (0..15360). Off-world coords usually signal a
        // parsing axis mix-up (x/y/z ordering).
        for p in placements.iter().take(500) {
            assert!(
                p.x >= 0.0 && p.x <= 15360.0,
                "placement {} has x={} out of Chernarus bounds",
                p.name,
                p.x,
            );
            assert!(
                p.z >= 0.0 && p.z <= 15360.0,
                "placement {} has z={} out of Chernarus bounds",
                p.name,
                p.z,
            );
        }

        // count-by-group agrees with list-placement length.
        let counts = count_by_group_file(path).unwrap();
        let total: usize = counts.values().sum();
        assert_eq!(total, placements.len());
    }
}
