//! `cfgrandompresets.xml` round-trip parser (PDR §5.3, §9.3).
//!
//! Two root children: `<cargo>` and `<attachments>`. The element name
//! is the preset kind — references from cfgspawnabletypes only pull
//! from the matching kind.
//!
//! The reader is **hand-rolled over quick-xml events** rather than
//! using the serde adapter, because quick-xml's serde deserializer
//! rejects interleaved repeated elements with "duplicate field" — i.e.
//! the legitimate vanilla pattern of `<cargo>…<attachments>…<cargo>…`
//! blew up the whole Loadouts page. The event walker is O(n) and
//! handles any ordering.

use std::path::Path;

use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;
use serde::{Deserialize, Serialize};

use crate::domain::{ItemSource, PresetItem, PresetKind, RandomPreset};
use crate::error::{AppError, AppResult};

// ---------- Serialize-side schema ----------
//
// We still use serde for WRITING — we control the output ordering
// (cargo presets first, then attachments) so serde's repeated-element
// quirk doesn't bite on the output. The reader just doesn't use this.

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename = "randompresets")]
struct File {
    #[serde(rename = "cargo", default)]
    cargo: Vec<XmlPreset>,
    #[serde(rename = "attachments", default)]
    attachments: Vec<XmlPreset>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct XmlPreset {
    #[serde(rename = "@name")]
    name: String,
    #[serde(rename = "@chance", default, skip_serializing_if = "Option::is_none")]
    chance: Option<f64>,
    #[serde(rename = "item", default)]
    items: Vec<XmlItem>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct XmlItem {
    #[serde(rename = "@name")]
    name: String,
    #[serde(rename = "@chance", default, skip_serializing_if = "Option::is_none")]
    chance: Option<f64>,
}

// ---------- Public API ----------

pub fn parse_file(
    path: &Path,
    workspace: &Path,
    source: ItemSource,
) -> AppResult<Vec<RandomPreset>> {
    let bytes = std::fs::read(path)?;
    let rel = rel_slash(workspace, path);
    parse_bytes(&bytes, source, &rel)
        .map_err(|e| AppError::Internal(format!("parsing {}: {e}", path.display())))
}

pub fn parse_bytes(
    bytes: &[u8],
    source: ItemSource,
    file: &str,
) -> Result<Vec<RandomPreset>, String> {
    let mut reader = Reader::from_reader(bytes);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    let mut out: Vec<RandomPreset> = Vec::new();

    // The element name of the preset we're currently inside (if any).
    // None when we're between presets or before reading has started.
    let mut current_kind: Option<PresetKind> = None;
    let mut current_name = String::new();
    let mut current_chance = 1.0;
    let mut current_items: Vec<PresetItem> = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = element_name_lower(&e)?;
                match name.as_str() {
                    "randompresets" => {} // root, ignore
                    "cargo" | "attachments" => {
                        let kind = if name == "cargo" {
                            PresetKind::Cargo
                        } else {
                            PresetKind::Attachments
                        };
                        let (p_name, p_chance) = read_preset_attrs(&e)?;
                        current_kind = Some(kind);
                        current_name = p_name;
                        current_chance = p_chance;
                        current_items.clear();
                    }
                    "item" => {
                        if current_kind.is_some() {
                            current_items.push(read_item(&e)?);
                        }
                    }
                    _ => {} // unknown element — skip
                }
            }
            Ok(Event::Empty(e)) => {
                let name = element_name_lower(&e)?;
                match name.as_str() {
                    "cargo" | "attachments" => {
                        // Empty preset, e.g. `<cargo name="X" chance="1.0"/>`
                        let kind = if name == "cargo" {
                            PresetKind::Cargo
                        } else {
                            PresetKind::Attachments
                        };
                        let (p_name, p_chance) = read_preset_attrs(&e)?;
                        out.push(RandomPreset {
                            name: p_name,
                            kind,
                            chance: p_chance,
                            items: Vec::new(),
                            source,
                            mod_id: None,
                            file: file.to_string(),
                        });
                    }
                    "item" => {
                        if current_kind.is_some() {
                            current_items.push(read_item(&e)?);
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::End(e)) => {
                let name = std::str::from_utf8(e.name().as_ref())
                    .map(|s| s.to_ascii_lowercase())
                    .map_err(|err| err.to_string())?;
                if matches!(name.as_str(), "cargo" | "attachments") {
                    if let Some(kind) = current_kind.take() {
                        out.push(RandomPreset {
                            name: std::mem::take(&mut current_name),
                            kind,
                            chance: current_chance,
                            items: std::mem::take(&mut current_items),
                            source,
                            mod_id: None,
                            file: file.to_string(),
                        });
                        current_chance = 1.0;
                    }
                }
            }
            Ok(Event::Eof) => break,
            Ok(_) => {} // comments, text, PI — ignore
            Err(e) => return Err(e.to_string()),
        }
        buf.clear();
    }

    Ok(out)
}

fn element_name_lower(e: &BytesStart) -> Result<String, String> {
    std::str::from_utf8(e.name().as_ref())
        .map(|s| s.to_ascii_lowercase())
        .map_err(|err| err.to_string())
}

fn read_preset_attrs(e: &BytesStart) -> Result<(String, f64), String> {
    let mut name = String::new();
    let mut chance = 1.0f64;
    for a in e.attributes() {
        let a = a.map_err(|err| err.to_string())?;
        let key = std::str::from_utf8(a.key.as_ref()).map_err(|err| err.to_string())?;
        let val = a.unescape_value().map_err(|err| err.to_string())?;
        match key {
            "name" => name = val.into_owned(),
            "chance" => chance = val.parse().unwrap_or(1.0),
            _ => {}
        }
    }
    Ok((name, chance))
}

fn read_item(e: &BytesStart) -> Result<PresetItem, String> {
    let mut name = String::new();
    let mut chance = 1.0f64;
    for a in e.attributes() {
        let a = a.map_err(|err| err.to_string())?;
        let key = std::str::from_utf8(a.key.as_ref()).map_err(|err| err.to_string())?;
        let val = a.unescape_value().map_err(|err| err.to_string())?;
        match key {
            "name" => name = val.into_owned(),
            "chance" => chance = val.parse().unwrap_or(1.0),
            _ => {}
        }
    }
    Ok(PresetItem { name, chance })
}

pub fn serialize(presets: &[RandomPreset]) -> AppResult<String> {
    let mut doc = File::default();
    for p in presets {
        let xp = XmlPreset {
            name: p.name.clone(),
            chance: Some(p.chance),
            items: p
                .items
                .iter()
                .map(|i| XmlItem {
                    name: i.name.clone(),
                    chance: Some(i.chance),
                })
                .collect(),
        };
        match p.kind {
            PresetKind::Cargo => doc.cargo.push(xp),
            PresetKind::Attachments => doc.attachments.push(xp),
        }
    }
    let mut out = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    let body = quick_xml::se::to_string(&doc).map_err(|e| {
        AppError::Internal(format!("serializing cfgrandompresets.xml: {e}"))
    })?;
    out.push_str(&super::pretty::pretty(&body));
    if !out.ends_with('\n') {
        out.push('\n');
    }
    Ok(out)
}

pub fn write_presets(path: &Path, presets: &[RandomPreset]) -> AppResult<()> {
    let text = serialize(presets)?;
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
<randompresets>
  <cargo name="ciabBase" chance="1.00">
    <item name="Mag_Glock_15Rnd" chance="0.30"/>
    <item name="Mag_CMAG_10Rnd" chance="0.30"/>
  </cargo>
  <attachments name="weaponMagSTANAG" chance="0.80">
    <item name="Mag_STANAG_30Rnd" chance="1.00"/>
  </attachments>
</randompresets>
"#;

    #[test]
    fn round_trip_preserves_kind_and_chances() {
        let presets = parse_bytes(
            SAMPLE.as_bytes(),
            ItemSource::Vanilla,
            "cfgrandompresets.xml",
        )
        .unwrap();
        assert_eq!(presets.len(), 2);
        assert_eq!(presets[0].name, "ciabBase");
        assert_eq!(presets[0].kind, PresetKind::Cargo);
        assert_eq!(presets[0].items.len(), 2);
        assert_eq!(presets[1].name, "weaponMagSTANAG");
        assert_eq!(presets[1].kind, PresetKind::Attachments);

        let out = serialize(presets.as_slice()).unwrap();
        let again = parse_bytes(out.as_bytes(), ItemSource::Vanilla, "").unwrap();
        assert_eq!(again.len(), 2);
        assert_eq!(again[1].kind, PresetKind::Attachments);
    }

    #[test]
    fn interleaved_cargo_and_attachments_parse() {
        // This is the exact shape that blew up the serde-based reader
        // with "duplicate field cargo" — any file where the two
        // element kinds appear in arbitrary order.
        let src = r#"<?xml version="1.0" encoding="UTF-8"?>
<randompresets>
  <cargo name="a" chance="1.00">
    <item name="ItemA" chance="1.00"/>
  </cargo>
  <attachments name="b" chance="0.50">
    <item name="ItemB" chance="1.00"/>
  </attachments>
  <cargo name="c" chance="1.00">
    <item name="ItemC" chance="1.00"/>
  </cargo>
  <attachments name="d" chance="1.00">
    <item name="ItemD" chance="1.00"/>
  </attachments>
  <cargo name="e" chance="1.00"/>
</randompresets>
"#;
        let presets = parse_bytes(src.as_bytes(), ItemSource::Vanilla, "").unwrap();
        let kinds: Vec<_> = presets.iter().map(|p| (p.name.clone(), p.kind)).collect();
        assert_eq!(kinds.len(), 5);
        assert_eq!(
            kinds,
            vec![
                ("a".into(), PresetKind::Cargo),
                ("b".into(), PresetKind::Attachments),
                ("c".into(), PresetKind::Cargo),
                ("d".into(), PresetKind::Attachments),
                ("e".into(), PresetKind::Cargo),
            ]
        );
        // Verify the empty-preset case (`e`) survived too.
        assert!(presets[4].items.is_empty());
    }

    #[test]
    fn missing_preset_chance_defaults_to_one() {
        let src = r#"<?xml version="1.0" encoding="UTF-8"?>
<randompresets>
  <cargo name="noChance">
    <item name="X"/>
  </cargo>
</randompresets>
"#;
        let presets = parse_bytes(src.as_bytes(), ItemSource::Vanilla, "").unwrap();
        assert_eq!(presets[0].chance, 1.0);
        assert_eq!(presets[0].items[0].chance, 1.0);
    }
}
