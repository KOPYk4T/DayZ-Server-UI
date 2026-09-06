//! Parser + writer for DayZ-Expansion trader-NPC placement files.
//!
//! File lives at `mpmissions/<map>/expansion/traders/*.map` and is
//! plain text, one trader per line. Blank lines and `//` comments are
//! preserved so round-trip doesn't destroy operator annotations.
//!
//! Line format (from the Expansion wiki):
//!
//! ```text
//! <TraderEntityClassName>.<TraderFileName>|<X Y Z>|<yaw pitch roll>|<gear>
//! ```
//!
//! Example:
//! ```text
//! ExpansionTraderDenis.Weapons|11833.5 140.6 12469.4|110 0 0|Jeans_Blue,TSHirt_Blue
//! ```
//!
//! The `<gear>` field is comma-delimited and supports three special
//! prefixes that must keep their literal form:
//!   - `name:Mark` — forces NPC display name
//!   - `loadout:MyTraderLoadout` — references `AI/Loadouts/*.json`
//!     (the rest of `gear` is then ignored by the mod)
//!   - `faction:Guards` — AI trader faction override
//!
//! Individual gear entries may carry attachments joined with `+`, e.g.
//! `AKM+Mag_AKM_30Rnd+KobraOptic`. We preserve the raw string so the
//! UI can parse attachments out of it without losing round-trip
//! fidelity for unusual formatting.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TraderPlacement {
    /// NPC prefab class — e.g. `ExpansionTraderDenis`,
    /// `ExpansionTraderAIBoris`.
    pub entity_class: String,
    /// Matches a JSON file stem under `profiles/ExpansionMod/Traders/`.
    pub trader_file: String,
    pub position: [f64; 3],
    pub orientation: [f64; 3],
    /// Raw gear tokens in source order — we preserve the exact string
    /// so round-trip doesn't reorder or re-normalise. Typed views
    /// derive `name` / `loadout` / `faction` from this lazily.
    pub gear: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind", content = "value")]
pub enum TraderMapLine {
    Placement(TraderPlacement),
    /// Either a literal blank line or a `//` comment — preserved so
    /// saves don't scramble operator structure.
    Other(String),
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TraderMapFile {
    pub lines: Vec<TraderMapLine>,
}

impl TraderMapFile {
    /// Only the `Placement` entries, in source order. Convenience for
    /// the UI which usually ignores comments.
    pub fn placements(&self) -> impl Iterator<Item = &TraderPlacement> {
        self.lines.iter().filter_map(|l| match l {
            TraderMapLine::Placement(p) => Some(p),
            _ => None,
        })
    }
}

pub fn parse(src: &str) -> TraderMapFile {
    let mut lines = Vec::new();
    for raw in src.lines() {
        let trimmed = raw.trim();
        if trimmed.is_empty() || trimmed.starts_with("//") {
            lines.push(TraderMapLine::Other(raw.to_string()));
            continue;
        }
        match parse_line(trimmed) {
            Some(p) => lines.push(TraderMapLine::Placement(p)),
            None => lines.push(TraderMapLine::Other(raw.to_string())),
        }
    }
    TraderMapFile { lines }
}

fn parse_line(line: &str) -> Option<TraderPlacement> {
    let parts: Vec<&str> = line.split('|').collect();
    if parts.len() < 3 {
        return None;
    }
    let (entity_class, trader_file) = split_entity(parts[0])?;
    let position = parse_vec3(parts[1])?;
    let orientation = parse_vec3(parts[2])?;
    let gear = if parts.len() >= 4 {
        parts[3]
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect()
    } else {
        Vec::new()
    };
    Some(TraderPlacement {
        entity_class,
        trader_file,
        position,
        orientation,
        gear,
    })
}

fn split_entity(head: &str) -> Option<(String, String)> {
    let head = head.trim();
    let dot = head.find('.')?;
    let entity = head[..dot].trim();
    let file = head[dot + 1..].trim();
    if entity.is_empty() || file.is_empty() {
        return None;
    }
    Some((entity.to_string(), file.to_string()))
}

fn parse_vec3(s: &str) -> Option<[f64; 3]> {
    let parts: Vec<&str> = s.split_ascii_whitespace().collect();
    if parts.len() != 3 {
        return None;
    }
    let x = parts[0].parse::<f64>().ok()?;
    let y = parts[1].parse::<f64>().ok()?;
    let z = parts[2].parse::<f64>().ok()?;
    Some([x, y, z])
}

pub fn serialize(file: &TraderMapFile) -> String {
    let mut out = String::new();
    for (i, line) in file.lines.iter().enumerate() {
        match line {
            TraderMapLine::Placement(p) => {
                out.push_str(&format_placement(p));
            }
            TraderMapLine::Other(raw) => {
                out.push_str(raw);
            }
        }
        if i + 1 < file.lines.len() {
            out.push('\n');
        }
    }
    out
}

fn format_placement(p: &TraderPlacement) -> String {
    let pos = format_vec3(&p.position);
    let ori = format_vec3(&p.orientation);
    let gear = p.gear.join(",");
    if gear.is_empty() {
        format!(
            "{}.{}|{}|{}|",
            p.entity_class, p.trader_file, pos, ori
        )
    } else {
        format!(
            "{}.{}|{}|{}|{}",
            p.entity_class, p.trader_file, pos, ori, gear
        )
    }
}

fn format_vec3(v: &[f64; 3]) -> String {
    // 3 decimal places matches the precision typical in Expansion's
    // shipped trader files and keeps diffs small.
    format!("{:.3} {:.3} {:.3}", v[0], v[1], v[2])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_canonical_line() {
        let src =
            "ExpansionTraderDenis.Weapons|11833.576 140.605 12469.492|110 0 0|Jeans_Blue,TSHirt_Blue";
        let f = parse(src);
        let ps: Vec<_> = f.placements().collect();
        assert_eq!(ps.len(), 1);
        let p = ps[0];
        assert_eq!(p.entity_class, "ExpansionTraderDenis");
        assert_eq!(p.trader_file, "Weapons");
        assert!((p.position[0] - 11833.576).abs() < 1e-3);
        assert!((p.position[1] - 140.605).abs() < 1e-3);
        assert!((p.position[2] - 12469.492).abs() < 1e-3);
        assert_eq!(p.orientation, [110.0, 0.0, 0.0]);
        assert_eq!(p.gear, vec!["Jeans_Blue", "TSHirt_Blue"]);
    }

    #[test]
    fn parses_ai_line_with_keywords_and_attachments() {
        let src =
            "ExpansionTraderAIDenis.Weapons|11833 140 12469|110 0 0|name:Mark,loadout:MyTraderLoadout,faction:Guards,AKM+Mag_AKM_30Rnd+KobraOptic";
        let f = parse(src);
        let ps: Vec<_> = f.placements().collect();
        assert_eq!(ps.len(), 1);
        let p = ps[0];
        assert_eq!(p.entity_class, "ExpansionTraderAIDenis");
        assert_eq!(
            p.gear,
            vec![
                "name:Mark",
                "loadout:MyTraderLoadout",
                "faction:Guards",
                "AKM+Mag_AKM_30Rnd+KobraOptic",
            ]
        );
    }

    #[test]
    fn preserves_blank_lines_and_comments() {
        let src = "// Weapons trader near GM\n\nExpansionTraderDenis.Weapons|0 0 0|0 0 0|";
        let f = parse(src);
        assert_eq!(f.lines.len(), 3);
        assert!(matches!(f.lines[0], TraderMapLine::Other(_)));
        assert!(matches!(f.lines[1], TraderMapLine::Other(_)));
        assert!(matches!(f.lines[2], TraderMapLine::Placement(_)));
    }

    #[test]
    fn empty_gear_field_round_trips() {
        let src = "ExpansionTraderDenis.Weapons|1 2 3|0 0 0|";
        let f = parse(src);
        let out = serialize(&f);
        assert_eq!(out, "ExpansionTraderDenis.Weapons|1.000 2.000 3.000|0.000 0.000 0.000|");
    }

    #[test]
    fn malformed_line_is_preserved_as_other() {
        let src = "not a trader line";
        let f = parse(src);
        assert_eq!(f.lines.len(), 1);
        assert!(matches!(f.lines[0], TraderMapLine::Other(_)));
    }

    #[test]
    fn round_trip_preserves_structure() {
        let src = "// Header\nExpansionTraderDenis.Weapons|100.000 50.000 200.000|90.000 0.000 0.000|Jeans_Blue\n\n// End";
        let f = parse(src);
        let out = serialize(&f);
        assert_eq!(out, src);
    }

    #[test]
    fn roundtrip_multiple_placements_preserves_order() {
        let src = "ExpansionTraderDenis.Weapons|0.000 0.000 0.000|0.000 0.000 0.000|\nExpansionTraderAIBoris.Clothing|100.000 50.000 200.000|45.000 0.000 0.000|name:Cece";
        let f = parse(src);
        let ps: Vec<_> = f.placements().collect();
        assert_eq!(ps.len(), 2);
        assert_eq!(ps[0].entity_class, "ExpansionTraderDenis");
        assert_eq!(ps[1].entity_class, "ExpansionTraderAIBoris");
        let out = serialize(&f);
        assert_eq!(out, src);
    }
}
