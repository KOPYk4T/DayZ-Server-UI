//! Animal & infected territory definition files. Each file under
//! `<mission>/env/` defines one category of entity (bear, wolf,
//! cattle, zombie, …). Schema observed across all ~13 vanilla
//! files:
//!
//! ```xml
//! <territory-type>
//!   <territory color="864420070">
//!     <zone name="Graze" smin="0" smax="0" dmin="0" dmax="0" x="…" z="…" r="…"/>
//!     …
//!   </territory>
//! </territory-type>
//! ```
//!
//! Each `<territory>` is a cluster of circular `<zone>`s. Zone
//! `name` is semantic — animals use `Rest`/`Graze`/`Water`, infected
//! files use `InfectedVillageTier1`/`InfectedIndustrial` etc. The
//! `color` attribute is an RGBA packed-integer DayZ uses when
//! rendering the debug overlay — we preserve it verbatim so
//! round-trips stay byte-identical.
//!
//! Numeric attributes are floats because the vanilla files mix
//! integer coordinates like `x="7560"` with fractional ones like
//! `x="5593.11"`.

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

#[derive(Debug, Default, Clone, Serialize, Deserialize, PartialEq)]
pub struct TerritoryFile {
    pub territories: Vec<Territory>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, PartialEq)]
pub struct Territory {
    /// Preserved verbatim — DayZ treats this as a packed colour for
    /// its internal debug overlay. The wire format is a single large
    /// integer (often a 32-bit ARGB value). We don't try to decode
    /// it; we just preserve the exact original string so operators
    /// who set custom colours don't lose them.
    pub color: String,
    pub zones: Vec<Zone>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, PartialEq)]
pub struct Zone {
    pub name: String,
    /// Coordinates in world metres. Bohemia writes them as floats.
    pub x: f64,
    pub z: f64,
    /// Zone radius in metres.
    pub r: f64,
    /// Timing pair — rarely used in vanilla animal territories but
    /// present in all files. Preserved so non-zero values in modded
    /// territory sets round-trip correctly.
    #[serde(default)]
    pub smin: f64,
    #[serde(default)]
    pub smax: f64,
    /// Density pair — for infected territories `dmin`/`dmax` is the
    /// min/max infected count to spawn in this zone. For animals the
    /// pair is usually 0/0 but we still preserve it.
    #[serde(default)]
    pub dmin: f64,
    #[serde(default)]
    pub dmax: f64,
}

// ---------- Raw wire types (serde) ----------

#[derive(Debug, Default, Deserialize)]
#[serde(rename = "territory-type")]
struct RawFile {
    #[serde(rename = "territory", default)]
    territories: Vec<RawTerritory>,
}

#[derive(Debug, Default, Deserialize)]
struct RawTerritory {
    #[serde(rename = "@color", default)]
    color: String,
    #[serde(rename = "zone", default)]
    zones: Vec<RawZone>,
}

#[derive(Debug, Default, Deserialize)]
struct RawZone {
    #[serde(rename = "@name", default)]
    name: String,
    #[serde(rename = "@x", default)]
    x: f64,
    #[serde(rename = "@z", default)]
    z: f64,
    #[serde(rename = "@r", default)]
    r: f64,
    #[serde(rename = "@smin", default)]
    smin: f64,
    #[serde(rename = "@smax", default)]
    smax: f64,
    #[serde(rename = "@dmin", default)]
    dmin: f64,
    #[serde(rename = "@dmax", default)]
    dmax: f64,
}

// ---------- Parse ----------

pub fn parse_bytes(bytes: &[u8]) -> AppResult<TerritoryFile> {
    let text = std::str::from_utf8(bytes)
        .map_err(|e| AppError::Internal(format!("territories: {e}")))?;
    let raw: RawFile = quick_xml::de::from_str(text)
        .map_err(|e| AppError::Internal(format!("territories: {e}")))?;
    let territories = raw
        .territories
        .into_iter()
        .map(|t| Territory {
            color: t.color,
            zones: t
                .zones
                .into_iter()
                .map(|z| Zone {
                    name: z.name,
                    x: z.x,
                    z: z.z,
                    r: z.r,
                    smin: z.smin,
                    smax: z.smax,
                    dmin: z.dmin,
                    dmax: z.dmax,
                })
                .collect(),
        })
        .collect();
    Ok(TerritoryFile { territories })
}

pub fn parse_file(path: &Path) -> AppResult<TerritoryFile> {
    parse_bytes(&fs::read(path)?)
}

// ---------- Serialize ----------

/// Render a `TerritoryFile` to the same XML shape vanilla ships.
/// Numeric formatting trims trailing zeros so `5300` stays `5300`
/// and `5593.11` stays `5593.11` — matches Bohemia's output and
/// keeps git diffs minimal for unchanged zones.
pub fn serialize(file: &TerritoryFile) -> String {
    let mut out = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    out.push_str("<territory-type>\n");
    for t in &file.territories {
        out.push_str(&format!(
            "    <territory color=\"{}\">\n",
            xml_escape(&t.color)
        ));
        for z in &t.zones {
            out.push_str(&format!(
                "        <zone name=\"{name}\" smin=\"{smin}\" smax=\"{smax}\" dmin=\"{dmin}\" dmax=\"{dmax}\" x=\"{x}\" z=\"{z}\" r=\"{r}\"/>\n",
                name = xml_escape(&z.name),
                smin = fmt_num(z.smin),
                smax = fmt_num(z.smax),
                dmin = fmt_num(z.dmin),
                dmax = fmt_num(z.dmax),
                x = fmt_num(z.x),
                z = fmt_num(z.z),
                r = fmt_num(z.r),
            ));
        }
        out.push_str("    </territory>\n");
    }
    out.push_str("</territory-type>\n");
    out
}

pub fn write_file(path: &Path, file: &TerritoryFile) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serialize(file))?;
    Ok(())
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// Format a float the way vanilla does: integers stay bare (`5300`),
/// fractions keep up to 6 significant digits and lose trailing zeros.
fn fmt_num(n: f64) -> String {
    if n == 0.0 {
        return "0".into();
    }
    if n.fract() == 0.0 && n.abs() < 1e15 {
        return format!("{}", n as i64);
    }
    // Up to 6 decimals, strip trailing zeros + dangling dot.
    let s = format!("{n:.6}");
    let trimmed = s.trim_end_matches('0').trim_end_matches('.');
    trimmed.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    const CATTLE_SAMPLE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<territory-type>
    <territory color="864420070">
        <zone name="Rest" smin="0" smax="0" dmin="0" dmax="0" x="5300.23" z="10531.7" r="90"/>
        <zone name="Graze" smin="0" smax="0" dmin="0" dmax="0" x="5593.11" z="10450.3" r="195"/>
    </territory>
    <territory color="831654630">
        <zone name="Rest" smin="0" smax="0" dmin="0" dmax="0" x="3170.63" z="13704.4" r="112.5"/>
    </territory>
</territory-type>
"#;

    const ZOMBIE_SAMPLE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<territory-type>
    <territory color="2193199729">
        <zone name="InfectedVillageTier1" smin="0" smax="0" dmin="8" dmax="12" x="12913.3" z="8020" r="80"/>
    </territory>
</territory-type>
"#;

    #[test]
    fn parses_cattle_territories() {
        let file = parse_bytes(CATTLE_SAMPLE.as_bytes()).unwrap();
        assert_eq!(file.territories.len(), 2);
        assert_eq!(file.territories[0].color, "864420070");
        assert_eq!(file.territories[0].zones.len(), 2);
        assert_eq!(file.territories[0].zones[0].name, "Rest");
        assert_eq!(file.territories[0].zones[0].x, 5300.23);
        assert_eq!(file.territories[0].zones[0].r, 90.0);
        assert_eq!(file.territories[1].color, "831654630");
    }

    #[test]
    fn parses_zombie_territories_with_density() {
        let file = parse_bytes(ZOMBIE_SAMPLE.as_bytes()).unwrap();
        assert_eq!(file.territories[0].zones[0].dmin, 8.0);
        assert_eq!(file.territories[0].zones[0].dmax, 12.0);
        assert_eq!(file.territories[0].zones[0].name, "InfectedVillageTier1");
    }

    #[test]
    fn round_trips_preserves_values() {
        let file = parse_bytes(CATTLE_SAMPLE.as_bytes()).unwrap();
        let text = serialize(&file);
        let back = parse_bytes(text.as_bytes()).unwrap();
        assert_eq!(file, back);
    }

    #[test]
    fn fmt_num_keeps_integers_bare() {
        assert_eq!(fmt_num(5300.0), "5300");
        assert_eq!(fmt_num(0.0), "0");
        assert_eq!(fmt_num(90.0), "90");
    }

    #[test]
    fn fmt_num_trims_trailing_zeros_on_fractions() {
        assert_eq!(fmt_num(5593.11), "5593.11");
        assert_eq!(fmt_num(112.5), "112.5");
        assert_eq!(fmt_num(10531.7), "10531.7");
    }
}
