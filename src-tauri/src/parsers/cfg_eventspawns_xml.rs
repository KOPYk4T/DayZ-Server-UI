//! `cfgeventspawns.xml` round-trip parser (PDR §5.3 EventSpawnGroup).
//!
//! Root is `<eventposdef>`; each `<event name="…">` contains `<pos …/>`
//! children with `x`, `y`, `z`, `a` and an optional `group` attribute.
//!
//! **`y` matters.** Vanilla DayZ and Expansion both read `y` on
//! vehicle events to ground-clamp the spawn. Silently dropping it
//! on round-trip crashes the server when CE loads the event pool.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::domain::{EventPosition, EventSpawnGroup, ItemSource};
use crate::error::{AppError, AppResult};

// ---------- XML schema ----------

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename = "eventposdef")]
struct File {
    #[serde(rename = "event", default)]
    events: Vec<XmlGroup>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct XmlGroup {
    #[serde(rename = "@name")]
    name: String,
    #[serde(rename = "pos", default)]
    positions: Vec<XmlPos>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct XmlPos {
    #[serde(rename = "@x", deserialize_with = "de_f64_lenient")]
    x: f64,
    /// Terrain elevation. Historically absent on some community
    /// files — default to 0.0 on read — but we always emit it
    /// on write to avoid the CE-crash-on-missing-y foot-gun.
    #[serde(
        rename = "@y",
        default,
        deserialize_with = "de_f64_lenient"
    )]
    y: f64,
    #[serde(rename = "@z", deserialize_with = "de_f64_lenient")]
    z: f64,
    #[serde(
        rename = "@a",
        default = "default_angle",
        deserialize_with = "de_f64_lenient"
    )]
    a: f64,
    #[serde(rename = "@group", default, skip_serializing_if = "Option::is_none")]
    group: Option<String>,
}

fn default_angle() -> f64 {
    -1.0
}

/// Whitespace-tolerant f64 parser for XML attribute values.
///
/// Upstream tooling occasionally emits values like `x="1234.5 "` with
/// a trailing space inside the quoted attribute (seen in the
/// Expansion `cfgeventspawns.xml` Template). Stock serde f64 parsing
/// errors with "invalid float literal" on those. Trim + parse keeps
/// the file readable instead of bricking the whole Events page.
fn de_f64_lenient<'de, D>(d: D) -> Result<f64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let s: String = serde::Deserialize::deserialize(d)?;
    let trimmed = s.trim();
    trimmed
        .parse::<f64>()
        .map_err(|e| serde::de::Error::custom(format!("invalid float `{s}`: {e}")))
}

// ---------- Public API ----------

pub fn parse_file(
    path: &Path,
    workspace: &Path,
    source: ItemSource,
) -> AppResult<Vec<EventSpawnGroup>> {
    let bytes = std::fs::read(path)?;
    let rel = rel_slash(workspace, path);
    parse_bytes(&bytes, source, &rel)
        .map_err(|e| AppError::Internal(format!("parsing {}: {e}", path.display())))
}

pub fn parse_bytes(
    bytes: &[u8],
    source: ItemSource,
    file: &str,
) -> Result<Vec<EventSpawnGroup>, String> {
    let text = std::str::from_utf8(bytes).map_err(|e| e.to_string())?;
    let parsed: File = quick_xml::de::from_str(text).map_err(|e| e.to_string())?;
    Ok(parsed
        .events
        .into_iter()
        .map(|g| EventSpawnGroup {
            event_name: g.name,
            positions: g
                .positions
                .into_iter()
                .map(|p| EventPosition {
                    x: p.x,
                    y: p.y,
                    z: p.z,
                    a: p.a,
                    group: p.group.filter(|s| !s.is_empty()),
                })
                .collect(),
            source,
            mod_id: None,
            file: file.to_string(),
        })
        .collect())
}

pub fn serialize(groups: &[EventSpawnGroup]) -> AppResult<String> {
    // Skip event groups with zero positions — the vanilla
    // cfgeventspawns already registers them (e.g. animal / infected
    // events driven by cfgeventgroups), and writing a bare
    // `<event name="X"/>` into the custom file just bloats the
    // override without adding information.
    let doc = File {
        events: groups
            .iter()
            .filter(|g| !g.positions.is_empty())
            .map(|g| XmlGroup {
                name: g.event_name.clone(),
                positions: g
                    .positions
                    .iter()
                    .map(|p| XmlPos {
                        x: p.x,
                        y: p.y,
                        z: p.z,
                        a: p.a,
                        group: p.group.clone(),
                    })
                    .collect(),
            })
            .collect(),
    };
    let mut out = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    let body = quick_xml::se::to_string(&doc)
        .map_err(|e| AppError::Internal(format!("serializing cfgeventspawns.xml: {e}")))?;
    out.push_str(&super::pretty::pretty(&body));
    if !out.ends_with('\n') {
        out.push('\n');
    }
    Ok(out)
}

pub fn write_groups(path: &Path, groups: &[EventSpawnGroup]) -> AppResult<()> {
    let text = serialize(groups)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, text)?;
    Ok(())
}

fn rel_slash(root: &Path, path: &Path) -> String {
    match path.strip_prefix(root) {
        Ok(rel) => rel
            .components()
            .map(|c| c.as_os_str().to_string_lossy().into_owned())
            .collect::<Vec<_>>()
            .join("/"),
        Err(_) => path.to_string_lossy().replace('\\', "/"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<eventposdef>
  <event name="StaticHeliCrash">
    <pos x="1234.5" z="6789.1" a="-1"/>
    <pos x="200" z="300" a="45" group="heli_1"/>
  </event>
</eventposdef>
"#;

    #[test]
    fn round_trip() {
        let groups =
            parse_bytes(SAMPLE.as_bytes(), ItemSource::Vanilla, "cfgeventspawns.xml").unwrap();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].event_name, "StaticHeliCrash");
        assert_eq!(groups[0].positions.len(), 2);
        assert_eq!(groups[0].positions[0].a, -1.0);
        assert_eq!(groups[0].positions[1].group.as_deref(), Some("heli_1"));

        let out = serialize(groups.as_slice()).unwrap();
        let again = parse_bytes(out.as_bytes(), ItemSource::Vanilla, "").unwrap();
        assert_eq!(again[0].positions[1].group.as_deref(), Some("heli_1"));
    }

    /// Regression: the Expansion Template's cfgeventspawns.xml ships
    /// some positions with trailing whitespace inside the quoted
    /// attribute (e.g. `x="2514.898438 "`). Stock serde f64 rejects
    /// that — our `de_f64_lenient` trims first.
    #[test]
    fn parses_attributes_with_trailing_whitespace() {
        let src = r#"<?xml version="1.0" encoding="UTF-8"?>
<eventposdef>
  <event name="VehicleFoo">
    <pos x="2514.898438 " y="180.0" z="100.5 " a=" 45.0 "/>
  </event>
</eventposdef>
"#;
        let groups = parse_bytes(src.as_bytes(), ItemSource::Vanilla, "t").unwrap();
        assert_eq!(groups.len(), 1);
        let p = &groups[0].positions[0];
        assert!((p.x - 2514.898438).abs() < 1e-6);
        assert!((p.z - 100.5).abs() < 1e-6);
        assert!((p.a - 45.0).abs() < 1e-6);
    }

    /// Regression: CE-load crash when the custom cfgeventspawns
    /// stripped `y` off vehicle positions. Round-trip must preserve
    /// the y coordinate byte-identical to what came in (up to f64
    /// precision).
    #[test]
    fn preserves_y_on_round_trip() {
        let src = r#"<?xml version="1.0" encoding="UTF-8"?>
<eventposdef>
  <event name="VehicleUAZ">
    <pos x="5419.167969" y="333.421509" z="9886.763672" a="178.721161"/>
  </event>
</eventposdef>
"#;
        let groups = parse_bytes(src.as_bytes(), ItemSource::Vanilla, "t").unwrap();
        assert_eq!(groups[0].positions[0].y, 333.421509);
        let out = serialize(&groups).unwrap();
        assert!(
            out.contains("y=\"333.421509\""),
            "serialized output missing y=, got:\n{out}",
        );
        let again = parse_bytes(out.as_bytes(), ItemSource::Vanilla, "t").unwrap();
        assert_eq!(again[0].positions[0].y, 333.421509);
    }

    /// Regression: writing a group with zero positions produced
    /// `<event name="X"/>` in the custom file and bloated it with
    /// every vanilla event name whose positions we loaded from the
    /// base cfgeventspawns.xml. Those bare entries triggered a CE
    /// load path that crashed on boot.
    #[test]
    fn empty_groups_are_skipped_on_serialize() {
        let groups = vec![
            EventSpawnGroup {
                event_name: "AnimalCow".into(),
                positions: Vec::new(),
                source: ItemSource::Custom,
                mod_id: None,
                file: "x".into(),
            },
            EventSpawnGroup {
                event_name: "VehicleUAZ".into(),
                positions: vec![EventPosition {
                    x: 1.0,
                    y: 2.0,
                    z: 3.0,
                    a: 0.0,
                    group: None,
                }],
                source: ItemSource::Custom,
                mod_id: None,
                file: "x".into(),
            },
        ];
        let out = serialize(&groups).unwrap();
        assert!(!out.contains("AnimalCow"), "empty group leaked:\n{out}");
        assert!(out.contains("VehicleUAZ"));
    }
}
