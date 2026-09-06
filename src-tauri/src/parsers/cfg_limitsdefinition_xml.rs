//! `cfglimitsdefinition.xml` round-trip parser (PDR §5.3, §9.4).
//!
//! Root: `<lists>`. Four container children in fixed order:
//! `<categories>`, `<tags>`, `<usageflags>`, `<valueflags>`.
//! Each container holds named entries; usage/value entries may also
//! carry a numeric bitmask `value=`.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::domain::{LimitFlag, LimitName, LimitsDefinition};
use crate::error::{AppError, AppResult};

// ---------- XML schema ----------

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename = "lists")]
struct File {
    #[serde(default)]
    categories: CategoriesBlock,
    #[serde(default)]
    tags: TagsBlock,
    #[serde(default)]
    usageflags: UsageFlagsBlock,
    #[serde(default)]
    valueflags: ValueFlagsBlock,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct CategoriesBlock {
    #[serde(rename = "category", default)]
    items: Vec<XmlNamed>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct TagsBlock {
    #[serde(rename = "tag", default)]
    items: Vec<XmlNamed>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct UsageFlagsBlock {
    #[serde(rename = "usage", default)]
    items: Vec<XmlFlag>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct ValueFlagsBlock {
    #[serde(rename = "value", default)]
    items: Vec<XmlFlag>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct XmlNamed {
    #[serde(rename = "@name")]
    name: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct XmlFlag {
    #[serde(rename = "@name")]
    name: String,
    #[serde(rename = "@value", default, skip_serializing_if = "Option::is_none")]
    value: Option<i64>,
}

// ---------- Public API ----------

pub fn parse_file(path: &Path) -> AppResult<LimitsDefinition> {
    let bytes = std::fs::read(path)?;
    parse_bytes(&bytes)
        .map_err(|e| AppError::Internal(format!("parsing {}: {e}", path.display())))
}

pub fn parse_bytes(bytes: &[u8]) -> Result<LimitsDefinition, String> {
    let text = std::str::from_utf8(bytes).map_err(|e| e.to_string())?;
    let parsed: File = quick_xml::de::from_str(text).map_err(|e| e.to_string())?;
    Ok(LimitsDefinition {
        categories: parsed
            .categories
            .items
            .into_iter()
            .map(|n| LimitName { name: n.name })
            .collect(),
        tags: parsed
            .tags
            .items
            .into_iter()
            .map(|n| LimitName { name: n.name })
            .collect(),
        usageflags: parsed
            .usageflags
            .items
            .into_iter()
            .map(|f| LimitFlag {
                name: f.name,
                value: f.value,
            })
            .collect(),
        valueflags: parsed
            .valueflags
            .items
            .into_iter()
            .map(|f| LimitFlag {
                name: f.name,
                value: f.value,
            })
            .collect(),
    })
}

pub fn serialize(def: &LimitsDefinition) -> AppResult<String> {
    let doc = File {
        categories: CategoriesBlock {
            items: def
                .categories
                .iter()
                .map(|c| XmlNamed { name: c.name.clone() })
                .collect(),
        },
        tags: TagsBlock {
            items: def
                .tags
                .iter()
                .map(|t| XmlNamed { name: t.name.clone() })
                .collect(),
        },
        usageflags: UsageFlagsBlock {
            items: def
                .usageflags
                .iter()
                .map(|u| XmlFlag {
                    name: u.name.clone(),
                    value: u.value,
                })
                .collect(),
        },
        valueflags: ValueFlagsBlock {
            items: def
                .valueflags
                .iter()
                .map(|v| XmlFlag {
                    name: v.name.clone(),
                    value: v.value,
                })
                .collect(),
        },
    };
    let mut out = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    let body = quick_xml::se::to_string(&doc).map_err(|e| {
        AppError::Internal(format!("serializing cfglimitsdefinition.xml: {e}"))
    })?;
    out.push_str(&super::pretty::pretty(&body));
    if !out.ends_with('\n') {
        out.push('\n');
    }
    Ok(out)
}

pub fn write_def(path: &Path, def: &LimitsDefinition) -> AppResult<()> {
    let text = serialize(def)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, text)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<lists>
  <categories>
    <category name="weapons"/>
    <category name="food"/>
  </categories>
  <tags>
    <tag name="shelves"/>
    <tag name="floor"/>
  </tags>
  <usageflags>
    <usage name="Military" value="1"/>
    <usage name="Police" value="2"/>
    <usage name="Hunting"/>
  </usageflags>
  <valueflags>
    <value name="Tier1" value="1"/>
    <value name="Tier4" value="8"/>
  </valueflags>
</lists>
"#;

    #[test]
    fn round_trip_preserves_all_lists() {
        let def = parse_bytes(SAMPLE.as_bytes()).unwrap();
        assert_eq!(def.categories.len(), 2);
        assert_eq!(def.tags.len(), 2);
        assert_eq!(def.usageflags.len(), 3);
        assert_eq!(def.usageflags[0].value, Some(1));
        assert_eq!(def.usageflags[2].value, None, "optional value attr");
        assert_eq!(def.valueflags.len(), 2);
        assert_eq!(def.valueflags[1].name, "Tier4");

        let out = serialize(&def).unwrap();
        let again = parse_bytes(out.as_bytes()).unwrap();
        assert_eq!(again, def, "round-trip equality");
    }
}
