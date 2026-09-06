//! `mapgroupproto.xml` aggregate parser (PDR §8 / Phase 8a).
//!
//! Real vanilla structure (from `examples/mapgroupproto.xml`):
//!
//! ```xml
//! <prototype>
//!   <defaults>…</defaults>
//!   <group name="Land_Shed_M1" lootmax="2">
//!     <usage name="Industrial"/>   <!-- GROUP-level -->
//!     <usage name="Farm"/>
//!     <value name="Unique"/>       <!-- GROUP-level (when present) -->
//!     <container name="lootFloor" lootmax="2">
//!       <category name="tools"/>   <!-- CONTAINER-level -->
//!       <category name="containers"/>
//!       <tag name="ground"/>
//!       <tag name="floor"/>
//!       <point pos="0.5 -1.1 0.8" range="0.5" height="1.4"/>
//!     </container>
//!   </group>
//! </prototype>
//! ```
//!
//! Key things that bit us on the first pass:
//!   - Root element is `<prototype>`, not `<map>`. Doesn't matter
//!     for an event walker but worth noting.
//!   - `<usage>` and `<value>` live at the **group** level, NOT
//!     inside `<container>`. Vanilla Chernarus rarely uses `<value>`
//!     at all (we've seen only `Unique`).
//!   - `<category>` and `<tag>` live at the **container** level.
//!   - `<point>` (coordinates) lives at the container level. We
//!     count them but don't store coords — vanilla Chernarus has
//!     tens of thousands and a count is plenty for diagnostics.

use std::collections::HashSet;
use std::path::Path;

use quick_xml::events::Event;
use quick_xml::Reader;

use crate::domain::{BuildingPrototype, BuildingsData};
use crate::error::{AppError, AppResult};

pub fn parse_file(path: &Path) -> AppResult<BuildingsData> {
    let bytes = std::fs::read(path)?;
    parse_bytes(&bytes).map_err(|e| {
        AppError::Internal(format!("parsing {}: {e}", path.display()))
    })
}

pub fn parse_bytes(bytes: &[u8]) -> Result<BuildingsData, String> {
    let mut reader = Reader::from_reader(bytes);
    reader.config_mut().trim_text(true);

    let mut prototypes: Vec<BuildingPrototype> = Vec::new();
    let mut current: Option<InProgress> = None;
    // Nesting state: we must treat `<usage>` / `<value>` at the
    // group level, and `<category>` / `<tag>` / `<point>` at the
    // container level. Anything inside `<defaults>` at the top is
    // skipped so it doesn't leak into the first real group.
    let mut in_container = false;
    let mut in_defaults = false;
    let mut buf = Vec::new();

    loop {
        match reader
            .read_event_into(&mut buf)
            .map_err(|e| format!("xml read: {e}"))?
        {
            Event::Start(e) | Event::Empty(e) => {
                let name = local_name(e.name().as_ref());
                match name.as_str() {
                    "defaults" => {
                        in_defaults = true;
                    }
                    "group" => {
                        if in_defaults {
                            // <group> inside <defaults> — skip it.
                            continue;
                        }
                        if let Some(group_name) = attr(&e, "name") {
                            current = Some(InProgress::new(group_name));
                        }
                    }
                    "container" => {
                        if in_defaults {
                            continue;
                        }
                        if let Some(p) = current.as_mut() {
                            p.container_count += 1;
                        }
                        in_container = true;
                    }
                    "usage" => {
                        // Group-level: anywhere inside a <group> but
                        // NOT inside <defaults> (which defines
                        // defaults-for-all-groups entries we don't
                        // treat as per-prototype metadata).
                        if in_defaults {
                            continue;
                        }
                        if let Some(nm) = attr(&e, "name") {
                            if let Some(p) = current.as_mut() {
                                p.usages.insert(nm);
                            }
                        }
                    }
                    "value" => {
                        if in_defaults {
                            continue;
                        }
                        if let Some(nm) = attr(&e, "name") {
                            if let Some(p) = current.as_mut() {
                                p.values.insert(nm);
                            }
                        }
                    }
                    "category" => {
                        // Container-level.
                        if in_container {
                            if let Some(nm) = attr(&e, "name") {
                                if let Some(p) = current.as_mut() {
                                    p.categories.insert(nm);
                                }
                            }
                        }
                    }
                    "tag" => {
                        if in_container {
                            if let Some(nm) = attr(&e, "name") {
                                if let Some(p) = current.as_mut() {
                                    p.tags.insert(nm);
                                }
                            }
                        }
                    }
                    "point" => {
                        if in_container {
                            if let Some(p) = current.as_mut() {
                                p.point_count += 1;
                            }
                        }
                    }
                    _ => {}
                }
            }
            Event::End(e) => {
                let name = local_name(e.name().as_ref());
                match name.as_str() {
                    "defaults" => {
                        in_defaults = false;
                    }
                    "container" => {
                        in_container = false;
                    }
                    "group" => {
                        if let Some(p) = current.take() {
                            prototypes.push(p.finish());
                        }
                    }
                    _ => {}
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(BuildingsData {
        prototypes,
        total_placements: 0,
        unknown_placement_groups: Vec::new(),
    })
}

// ---------- Helpers ----------

struct InProgress {
    name: String,
    container_count: usize,
    point_count: usize,
    categories: HashSet<String>,
    tags: HashSet<String>,
    usages: HashSet<String>,
    values: HashSet<String>,
}

impl InProgress {
    fn new(name: String) -> Self {
        Self {
            name,
            container_count: 0,
            point_count: 0,
            categories: HashSet::new(),
            tags: HashSet::new(),
            usages: HashSet::new(),
            values: HashSet::new(),
        }
    }
    fn finish(self) -> BuildingPrototype {
        BuildingPrototype {
            name: self.name,
            container_count: self.container_count,
            point_count: self.point_count,
            categories: sorted(self.categories),
            tags: sorted(self.tags),
            usages: sorted(self.usages),
            values: sorted(self.values),
            // Populated downstream by `mission::buildings::load`
            // once mapgrouppos.xml has been read. 0 means either
            // the pos file is missing or this prototype isn't
            // placed anywhere on the map.
            placement_count: 0,
        }
    }
}

fn sorted(s: HashSet<String>) -> Vec<String> {
    let mut v: Vec<String> = s.into_iter().collect();
    v.sort();
    v
}

fn attr(e: &quick_xml::events::BytesStart<'_>, key: &str) -> Option<String> {
    for attr in e.attributes().flatten() {
        let k = std::str::from_utf8(attr.key.as_ref())
            .unwrap_or("")
            .to_ascii_lowercase();
        if k == key {
            return attr
                .unescape_value()
                .ok()
                .map(|c| c.into_owned());
        }
    }
    None
}

fn local_name(name: &[u8]) -> String {
    let raw = std::str::from_utf8(name).unwrap_or("");
    match raw.rsplit_once(':') {
        Some((_, local)) => local.to_ascii_lowercase(),
        None => raw.to_ascii_lowercase(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Shape mirrors the real vanilla `examples/mapgroupproto.xml`:
    //   root <prototype>, <defaults> header, group-level <usage>/<value>,
    //   container-level <category>/<tag>/<point>.
    const SAMPLE: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<prototype>
    <defaults>
        <default name="group" lootmax="6"/>
        <default name="container" lootmax="4"/>
    </defaults>
    <group name="Land_Shed_M1" lootmax="2">
        <usage name="Industrial"/>
        <usage name="Farm"/>
        <container name="lootFloor" lootmax="2">
            <category name="tools"/>
            <category name="containers"/>
            <tag name="ground"/>
            <tag name="floor"/>
            <point pos="0.5 -1.1 0.8" range="0.5" height="1.4"/>
            <point pos="0.8 -1.1 -0.8" range="0.5" height="1.4"/>
        </container>
    </group>
    <group name="Land_Container_1Mo_DE" lootmax="15">
        <usage name="Military"/>
        <value name="Unique"/>
        <container name="lootFloor" lootmax="15">
            <category name="weapons"/>
            <category name="explosives"/>
            <tag name="floor"/>
            <tag name="shelves"/>
            <tag name="ground"/>
            <point pos="-2.1 -1.0 0.0" range="0.6" height="1.7"/>
            <point pos="-0.5 -1.0 0.0" range="0.9" height="2.0"/>
            <point pos="1.8 -1.0 0.0" range="1.0" height="2.0"/>
        </container>
    </group>
</prototype>
"#;

    #[test]
    fn parses_groups_and_aggregates() {
        let d = parse_bytes(SAMPLE.as_bytes()).unwrap();
        assert_eq!(d.prototypes.len(), 2);

        let shed = &d.prototypes[0];
        assert_eq!(shed.name, "Land_Shed_M1");
        assert_eq!(shed.container_count, 1);
        assert_eq!(shed.point_count, 2);
        assert_eq!(shed.categories, vec!["containers", "tools"]);
        assert_eq!(shed.tags, vec!["floor", "ground"]);
        assert_eq!(shed.usages, vec!["Farm", "Industrial"]);
        assert!(shed.values.is_empty());

        let container = &d.prototypes[1];
        assert_eq!(container.name, "Land_Container_1Mo_DE");
        assert_eq!(container.container_count, 1);
        assert_eq!(container.point_count, 3);
        assert_eq!(container.categories, vec!["explosives", "weapons"]);
        assert_eq!(container.tags, vec!["floor", "ground", "shelves"]);
        assert_eq!(container.usages, vec!["Military"]);
        assert_eq!(container.values, vec!["Unique"]);
    }

    #[test]
    fn group_level_usage_does_not_leak_between_groups() {
        // Before the fix, a parser that ignored nesting would let
        // group-level usage from one prototype drift into the next.
        // Two groups with disjoint usages — if they mix, the
        // parser is wrong.
        let src = r#"<?xml version="1.0"?>
<prototype>
    <group name="A"><usage name="Farm"/><container name="c" lootmax="1"/></group>
    <group name="B"><usage name="Military"/><container name="c" lootmax="1"/></group>
</prototype>"#;
        let d = parse_bytes(src.as_bytes()).unwrap();
        assert_eq!(d.prototypes[0].usages, vec!["Farm"]);
        assert_eq!(d.prototypes[1].usages, vec!["Military"]);
    }

    #[test]
    fn defaults_preamble_is_skipped() {
        // `<usage>` / `<value>` inside <defaults> (if that ever
        // appears) must NOT get attached to the first group.
        let src = r#"<?xml version="1.0"?>
<prototype>
    <defaults>
        <default name="group" lootmax="6"/>
        <usage name="SHOULD_NOT_LEAK"/>
    </defaults>
    <group name="A">
        <usage name="Town"/>
        <container name="c" lootmax="1"/>
    </group>
</prototype>"#;
        let d = parse_bytes(src.as_bytes()).unwrap();
        assert_eq!(d.prototypes[0].usages, vec!["Town"]);
    }

    #[test]
    fn ignores_unknown_top_level_elements() {
        let src = r#"<?xml version="1.0"?>
<prototype>
    <comment>lorem</comment>
    <group name="Thing">
        <usage name="Town"/>
        <container name="c" lootmax="1">
            <category name="tools"/>
        </container>
    </group>
</prototype>"#;
        let d = parse_bytes(src.as_bytes()).unwrap();
        assert_eq!(d.prototypes.len(), 1);
        assert_eq!(d.prototypes[0].usages, vec!["Town"]);
    }

    #[test]
    fn counts_points_without_storing_coordinates() {
        let d = parse_bytes(SAMPLE.as_bytes()).unwrap();
        let total_points: usize = d.prototypes.iter().map(|p| p.point_count).sum();
        assert_eq!(total_points, 5);
    }

    #[test]
    fn empty_prototype_returns_no_groups() {
        let d = parse_bytes(b"<prototype></prototype>").unwrap();
        assert!(d.prototypes.is_empty());
    }

    /// Integration test against the real vanilla Chernarus file the
    /// user dropped into `examples/`. Asserts realistic invariants
    /// observed in that file — don't tighten these without re-checking
    /// the source (the file is 400+ groups, easy to get a spot-check
    /// wrong).
    #[test]
    fn parses_real_vanilla_chernarus_sample() {
        // cargo test runs with cwd = crate root (src-tauri/). The
        // examples/ folder is a sibling of dayz-config-manager/, so
        // the relative path climbs two levels.
        let path = std::path::Path::new("../../examples/mapgroupproto.xml");
        if !path.exists() {
            // Skip when the sample isn't checked in (CI / fresh clone).
            eprintln!("skipping: no sample at {}", path.display());
            return;
        }
        let d = parse_file(path).expect("sample parses");
        assert!(
            d.prototypes.len() >= 200,
            "expected 200+ prototypes, got {}",
            d.prototypes.len()
        );

        // Every group in vanilla Chernarus has at least one <usage>.
        // If we see many zero-usage prototypes, the parser is wrong
        // again — likely regressed the group/container nesting.
        let with_usage = d.prototypes.iter().filter(|p| !p.usages.is_empty()).count();
        assert!(
            with_usage as f64 / d.prototypes.len() as f64 > 0.9,
            "expected >90% of prototypes to have usages, got {}/{}",
            with_usage,
            d.prototypes.len()
        );

        // Spot-check one well-known prototype.
        let shed = d
            .prototypes
            .iter()
            .find(|p| p.name == "Land_Shed_M1")
            .expect("Land_Shed_M1 in sample");
        assert!(shed.usages.contains(&"Industrial".to_string()));
        assert!(shed.usages.contains(&"Farm".to_string()));
        assert!(shed.categories.contains(&"tools".to_string()));
    }

    #[test]
    fn container_level_category_does_not_leak_cross_container() {
        // Two containers in the same group with distinct categories.
        // Union at the group level should include both.
        let src = r#"<?xml version="1.0"?>
<prototype>
    <group name="Multi">
        <usage name="Town"/>
        <container name="a" lootmax="1"><category name="tools"/></container>
        <container name="b" lootmax="1"><category name="food"/></container>
    </group>
</prototype>"#;
        let d = parse_bytes(src.as_bytes()).unwrap();
        assert_eq!(d.prototypes[0].container_count, 2);
        assert_eq!(d.prototypes[0].categories, vec!["food", "tools"]);
    }
}
