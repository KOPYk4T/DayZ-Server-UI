//! `cfgspawnabletypes.xml` round-trip parser (PDR §5.3, §9.3).

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::domain::{
    AttachmentGroup, CargoGroup, ItemSource, SpawnableItem, SpawnableType,
};
use crate::error::{AppError, AppResult};

// ---------- XML schema ----------

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename = "spawnabletypes")]
struct File {
    #[serde(rename = "type", default)]
    types: Vec<XmlType>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct XmlType {
    #[serde(rename = "@name")]
    name: String,
    #[serde(rename = "@hoarder", default, skip_serializing_if = "Option::is_none")]
    hoarder: Option<u8>,
    #[serde(rename = "attachments", default)]
    attachments: Vec<XmlGroup>,
    #[serde(rename = "cargo", default)]
    cargo: Vec<XmlGroup>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct XmlGroup {
    /// Optional on the wire — vanilla cfgspawnabletypes.xml and many mod
    /// files omit `chance=`, which CE reads as 1.0. Keeping this required
    /// was the cause of the "missing field @chance" parse error that
    /// blanked the Loadouts page on vanilla Chernarus.
    #[serde(rename = "@chance", default, skip_serializing_if = "Option::is_none")]
    chance: Option<f64>,
    #[serde(
        rename = "@slotName",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    slot_name: Option<String>,
    #[serde(rename = "item", default)]
    items: Vec<XmlItem>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct XmlItem {
    #[serde(rename = "@name", default, skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(rename = "@chance", default, skip_serializing_if = "Option::is_none")]
    chance: Option<f64>,
    #[serde(rename = "@preset", default, skip_serializing_if = "Option::is_none")]
    preset: Option<String>,
}

// ---------- Public API ----------

pub fn parse_file(
    path: &Path,
    workspace: &Path,
    source: ItemSource,
) -> AppResult<Vec<SpawnableType>> {
    let bytes = std::fs::read(path)?;
    let rel = rel_slash(workspace, path);
    parse_bytes(&bytes, source, &rel)
        .map_err(|e| AppError::Internal(format!("parsing {}: {e}", path.display())))
}

pub fn parse_bytes(
    bytes: &[u8],
    source: ItemSource,
    file: &str,
) -> Result<Vec<SpawnableType>, String> {
    let text = std::str::from_utf8(bytes).map_err(|e| e.to_string())?;
    let parsed: File = quick_xml::de::from_str(text).map_err(|e| e.to_string())?;
    Ok(parsed
        .types
        .into_iter()
        .map(|t| SpawnableType {
            name: t.name,
            hoarder: t.hoarder.unwrap_or(0) == 1,
            attachments: t
                .attachments
                .into_iter()
                .map(|g| AttachmentGroup {
                    chance: g.chance.unwrap_or(1.0),
                    slot_name: g.slot_name,
                    items: g.items.into_iter().map(item_from).collect(),
                })
                .collect(),
            cargo: t
                .cargo
                .into_iter()
                .map(|g| CargoGroup {
                    chance: g.chance.unwrap_or(1.0),
                    items: g.items.into_iter().map(item_from).collect(),
                })
                .collect(),
            source,
            mod_id: None,
            file: file.to_string(),
        })
        .collect())
}

fn item_from(it: XmlItem) -> SpawnableItem {
    SpawnableItem {
        name: it.name.unwrap_or_default(),
        chance: it.chance.unwrap_or(1.0),
        preset: it.preset,
    }
}

fn item_to(it: &SpawnableItem) -> XmlItem {
    if let Some(preset) = &it.preset {
        XmlItem {
            name: None,
            chance: Some(it.chance).filter(|c| (c - 1.0).abs() > f64::EPSILON),
            preset: Some(preset.clone()),
        }
    } else {
        XmlItem {
            name: Some(it.name.clone()),
            chance: Some(it.chance),
            preset: None,
        }
    }
}

pub fn serialize(types: &[SpawnableType]) -> AppResult<String> {
    let doc = File {
        types: types
            .iter()
            .map(|t| XmlType {
                name: t.name.clone(),
                hoarder: if t.hoarder { Some(1) } else { None },
                attachments: t
                    .attachments
                    .iter()
                    .map(|g| XmlGroup {
                        chance: Some(g.chance),
                        slot_name: g.slot_name.clone(),
                        items: g.items.iter().map(item_to).collect(),
                    })
                    .collect(),
                cargo: t
                    .cargo
                    .iter()
                    .map(|g| XmlGroup {
                        chance: Some(g.chance),
                        slot_name: None,
                        items: g.items.iter().map(item_to).collect(),
                    })
                    .collect(),
            })
            .collect(),
    };
    let mut out = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    let body = quick_xml::se::to_string(&doc).map_err(|e| {
        AppError::Internal(format!("serializing cfgspawnabletypes.xml: {e}"))
    })?;
    out.push_str(&super::pretty::pretty(&body));
    if !out.ends_with('\n') {
        out.push('\n');
    }
    Ok(out)
}

pub fn write_types(path: &Path, types: &[SpawnableType]) -> AppResult<()> {
    let text = serialize(types)?;
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
<spawnabletypes>
  <type name="M4A1">
    <attachments chance="0.50" slotName="optic">
      <item name="ACOGOptic" chance="1.00"/>
    </attachments>
    <attachments chance="0.80">
      <item preset="weaponMagSTANAG"/>
    </attachments>
    <cargo chance="0.30">
      <item name="Mag_STANAG_30Rnd" chance="1.00"/>
    </cargo>
  </type>
</spawnabletypes>
"#;

    #[test]
    fn group_chance_is_optional_defaults_to_one() {
        // Vanilla and mods routinely omit `chance=` on groups. Keeping
        // it required caused "missing field @chance" errors that blanked
        // the Loadouts page.
        let src = r#"<?xml version="1.0" encoding="UTF-8"?>
<spawnabletypes>
  <type name="LooseCrate">
    <cargo>
      <item name="Can_Beans" chance="1.00"/>
    </cargo>
    <attachments>
      <item name="Strap" chance="1.00"/>
    </attachments>
  </type>
</spawnabletypes>
"#;
        let types = parse_bytes(src.as_bytes(), ItemSource::Vanilla, "").unwrap();
        assert_eq!(types.len(), 1);
        assert_eq!(types[0].cargo.len(), 1);
        assert_eq!(types[0].cargo[0].chance, 1.0);
        assert_eq!(types[0].attachments.len(), 1);
        assert_eq!(types[0].attachments[0].chance, 1.0);
    }

    #[test]
    fn round_trip_preserves_groups_and_preset_refs() {
        let types = parse_bytes(
            SAMPLE.as_bytes(),
            ItemSource::Vanilla,
            "cfgspawnabletypes.xml",
        )
        .unwrap();
        assert_eq!(types.len(), 1);
        let t = &types[0];
        assert_eq!(t.name, "M4A1");
        assert_eq!(t.attachments.len(), 2);
        assert_eq!(t.attachments[0].slot_name.as_deref(), Some("optic"));
        assert_eq!(t.attachments[0].items.len(), 1);
        assert_eq!(t.attachments[0].items[0].name, "ACOGOptic");
        assert_eq!(t.attachments[1].items[0].preset.as_deref(), Some("weaponMagSTANAG"));
        assert_eq!(t.cargo.len(), 1);

        let out = serialize(types.as_slice()).unwrap();
        let again = parse_bytes(out.as_bytes(), ItemSource::Vanilla, "").unwrap();
        assert_eq!(again[0].attachments.len(), 2);
        assert_eq!(
            again[0].attachments[1].items[0].preset.as_deref(),
            Some("weaponMagSTANAG")
        );
        // Ensure output keeps attributes inline (no whitespace bleed).
        assert!(
            out.contains("<item name=\"ACOGOptic\""),
            "item name attr should stay inline, got:\n{out}"
        );
    }
}
