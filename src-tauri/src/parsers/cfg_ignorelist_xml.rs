//! `cfgignorelist.xml` — list of class names the CE should NOT
//! spawn even if they appear in types.xml. Simple shape:
//!
//! ```xml
//! <ignore>
//!   <type name="Bandage"/>
//! </ignore>
//! ```
//!
//! Order is preserved on round-trip so operator-added grouping
//! stays stable in git diffs.

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct IgnoreList {
    pub classnames: Vec<String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename = "ignore", default)]
struct RawIgnore {
    #[serde(rename = "type", default)]
    types: Vec<RawType>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct RawType {
    #[serde(rename = "@name")]
    name: String,
}

pub fn parse_bytes(bytes: &[u8]) -> AppResult<IgnoreList> {
    let text = std::str::from_utf8(bytes)
        .map_err(|e| AppError::Internal(format!("cfgignorelist: {e}")))?;
    let parsed: RawIgnore = quick_xml::de::from_str(text)
        .map_err(|e| AppError::Internal(format!("cfgignorelist: {e}")))?;
    let classnames = parsed
        .types
        .into_iter()
        .filter_map(|t| {
            let n = t.name.trim();
            if n.is_empty() {
                None
            } else {
                Some(n.to_string())
            }
        })
        .collect();
    Ok(IgnoreList { classnames })
}

pub fn parse_file(path: &Path) -> AppResult<IgnoreList> {
    let bytes = fs::read(path)?;
    parse_bytes(&bytes)
}

pub fn serialize(list: &IgnoreList) -> String {
    let mut out = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\" ?>\n<ignore>\n",
    );
    for name in &list.classnames {
        out.push('\t');
        out.push_str(&format!("<type name=\"{}\"/>\n", xml_escape(name)));
    }
    out.push_str("</ignore>\n");
    out
}

pub fn write_file(path: &Path, list: &IgnoreList) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serialize(list))?;
    Ok(())
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<ignore>
    <type name="Bandage"></type>
    <type name="BandanaMask_BlackPattern"/>
    <type name="Flaregun"/>
</ignore>
"#;

    #[test]
    fn parse_captures_classnames() {
        let list = parse_bytes(SAMPLE.as_bytes()).unwrap();
        assert_eq!(list.classnames.len(), 3);
        assert_eq!(list.classnames[0], "Bandage");
        assert_eq!(list.classnames[2], "Flaregun");
    }

    #[test]
    fn serialize_round_trips_order() {
        let list = parse_bytes(SAMPLE.as_bytes()).unwrap();
        let out = serialize(&list);
        assert!(out.contains("<type name=\"Bandage\"/>"));
        assert!(out.contains("<type name=\"Flaregun\"/>"));
        // Parse the output again and confirm stability.
        let again = parse_bytes(out.as_bytes()).unwrap();
        assert_eq!(again.classnames, list.classnames);
    }

    #[test]
    fn escape_special_chars() {
        let list = IgnoreList {
            classnames: vec!["Has\"Quote".into(), "Has<Angle".into()],
        };
        let out = serialize(&list);
        assert!(out.contains("Has&quot;Quote"));
        assert!(out.contains("Has&lt;Angle"));
    }

    #[test]
    fn empty_root_parses() {
        let list = parse_bytes(b"<ignore></ignore>").unwrap();
        assert!(list.classnames.is_empty());
    }
}
