//! `types.xml` reader / writer.
//!
//! Produces and consumes [`ItemType`] values. The wire format follows
//! Bohemia's vanilla layout (PDR §5.3 and Appendix B-D) — see the unit
//! tests at the bottom of this file for a round-trip example.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::domain::{ItemFlags, ItemSource, ItemType};
use crate::error::{AppError, AppResult};

// ---------- XML schema (serde shape) ----------

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename = "types")]
struct TypesFile {
    #[serde(rename = "type", default)]
    types: Vec<XmlType>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct XmlType {
    #[serde(rename = "@name")]
    name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    nominal: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    lifetime: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    restock: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    min: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    quantmin: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    quantmax: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    cost: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    flags: Option<XmlFlags>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    category: Option<XmlNamed>,
    #[serde(rename = "usage", default, skip_serializing_if = "Vec::is_empty")]
    usage: Vec<XmlNamed>,
    #[serde(rename = "value", default, skip_serializing_if = "Vec::is_empty")]
    value: Vec<XmlNamed>,
    #[serde(rename = "tag", default, skip_serializing_if = "Vec::is_empty")]
    tag: Vec<XmlNamed>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct XmlNamed {
    #[serde(rename = "@name")]
    name: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct XmlFlags {
    #[serde(rename = "@count_in_cargo", default)]
    count_in_cargo: u8,
    #[serde(rename = "@count_in_hoarder", default)]
    count_in_hoarder: u8,
    #[serde(rename = "@count_in_map", default)]
    count_in_map: u8,
    #[serde(rename = "@count_in_player", default)]
    count_in_player: u8,
    #[serde(rename = "@crafted", default)]
    crafted: u8,
    #[serde(rename = "@deloot", default)]
    deloot: u8,
}

// ---------- Public API ----------

/// Parse a single `types.xml` (or a `types_custom.xml`) file into
/// [`ItemType`]s tagged with the given source and file path. Paths are
/// recorded workspace-relative, forward-slash-joined, as metadata so the
/// UI can show where a type lives without exposing it on save.
pub fn parse_file(path: &Path, workspace: &Path, source: ItemSource) -> AppResult<Vec<ItemType>> {
    let bytes = std::fs::read(path)?;
    let rel = relative_path_slash(workspace, path);
    parse_bytes(&bytes, source, &rel).map_err(|e| AppError::Internal(format!(
        "parsing {}: {e}",
        path.display()
    )))
}

pub fn parse_bytes(
    bytes: &[u8],
    source: ItemSource,
    file: &str,
) -> Result<Vec<ItemType>, String> {
    let text = std::str::from_utf8(bytes).map_err(|e| e.to_string())?;
    let parsed = parse_tolerant(text)?;
    Ok(parsed
        .types
        .into_iter()
        .map(|t| from_xml(t, source, file))
        .collect())
}

/// Parse a types document, wrapping `<type>` fragments in a synthetic
/// `<types>` root when the real root is missing. Many mods ship loose
/// `<type>…</type>` elements expecting the operator to paste them
/// into vanilla `types.xml`; our "Import mod CE files" flow registers
/// them as standalone files, so a strict-only parser would silently
/// produce zero items.
///
/// `quick_xml::de::from_str` is too permissive to trial-parse with:
/// when the root element name mismatches it happily returns an empty
/// collection rather than failing. So we detect the root shape first,
/// then either hand the text straight to the parser (well-formed
/// types.xml) or wrap + hand off (fragment shape).
fn parse_tolerant(text: &str) -> Result<TypesFile, String> {
    if has_types_root(text) {
        return quick_xml::de::from_str::<TypesFile>(text).map_err(|e| e.to_string());
    }
    // Fragment path: preserve any XML prologue, wrap the rest in
    // `<types>`, re-parse. If the wrapped content has no `<type>`
    // children the parser returns an empty list — that's the right
    // answer for a file genuinely free of type data.
    let (prologue, body) = split_xml_prologue(text);
    let wrapped = format!("{prologue}<types>\n{body}\n</types>");
    quick_xml::de::from_str::<TypesFile>(&wrapped).map_err(|e| e.to_string())
}

/// True when the first element in `text` is `<types>`. Skips the XML
/// prologue, leading comments, and DOCTYPE declarations so a header
/// comment doesn't misroute a well-formed file into the fragment
/// path.
fn has_types_root(text: &str) -> bool {
    let mut cur = text.trim_start();
    loop {
        if let Some(rest) = cur.strip_prefix("<?xml") {
            let after = match rest.find("?>") {
                Some(i) => &rest[i + "?>".len()..],
                None => return false,
            };
            cur = after.trim_start();
            continue;
        }
        if let Some(rest) = cur.strip_prefix("<!--") {
            let after = match rest.find("-->") {
                Some(i) => &rest[i + "-->".len()..],
                None => return false,
            };
            cur = after.trim_start();
            continue;
        }
        if let Some(rest) = cur.strip_prefix("<!") {
            // DOCTYPE or similar — skip to the closing `>`.
            let after = match rest.find('>') {
                Some(i) => &rest[i + 1..],
                None => return false,
            };
            cur = after.trim_start();
            continue;
        }
        return cur.starts_with("<types>")
            || cur.starts_with("<types ")
            || cur.starts_with("<types/>");
    }
}

/// Split an XML text into `(prologue_including_trailing_newline,
/// body)`. Prologue is the optional `<?xml …?>` declaration; body is
/// everything after it with leading whitespace trimmed. When no
/// prologue is present the prologue slice is empty.
fn split_xml_prologue(text: &str) -> (&str, &str) {
    let trimmed = text.trim_start();
    let leading = &text[..text.len() - trimmed.len()];
    if let Some(rest) = trimmed.strip_prefix("<?xml") {
        if let Some(close) = rest.find("?>") {
            // end = offset in `text` of the char after `?>`
            let end = leading.len() + "<?xml".len() + close + "?>".len();
            let body = text[end..].trim_start();
            return (&text[..end], body);
        }
    }
    ("", trimmed)
}

pub fn serialize_items(items: &[ItemType]) -> AppResult<String> {
    let doc = TypesFile {
        types: items.iter().map(to_xml).collect(),
    };
    let mut out = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    let body = quick_xml::se::to_string(&doc)
        .map_err(|e| AppError::Internal(format!("serializing types.xml: {e}")))?;
    out.push_str(&super::pretty::pretty(&body));
    if !out.ends_with('\n') {
        out.push('\n');
    }
    Ok(out)
}

pub fn write_items(path: &Path, items: &[ItemType]) -> AppResult<()> {
    let text = serialize_items(items)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, text)?;
    Ok(())
}

// ---------- Converters ----------

fn from_xml(x: XmlType, source: ItemSource, file: &str) -> ItemType {
    ItemType {
        name: x.name,
        nominal: x.nominal.unwrap_or(0),
        lifetime: x.lifetime.unwrap_or(0),
        restock: x.restock.unwrap_or(0),
        min: x.min.unwrap_or(0),
        quantmin: x.quantmin.unwrap_or(-1),
        quantmax: x.quantmax.unwrap_or(-1),
        cost: x.cost.unwrap_or(0),
        flags: x.flags.map(flags_from_xml).unwrap_or_default(),
        category: x.category.map(|c| c.name),
        tags: x.tag.into_iter().map(|n| n.name).collect(),
        usage: x.usage.into_iter().map(|n| n.name).collect(),
        value: x.value.into_iter().map(|n| n.name).collect(),
        source,
        mod_id: None,
        file: file.to_string(),
    }
}

fn to_xml(it: &ItemType) -> XmlType {
    XmlType {
        name: it.name.clone(),
        nominal: Some(it.nominal),
        lifetime: Some(it.lifetime),
        restock: Some(it.restock),
        min: Some(it.min),
        quantmin: Some(it.quantmin),
        quantmax: Some(it.quantmax),
        cost: Some(it.cost),
        flags: Some(flags_to_xml(&it.flags)),
        category: it.category.clone().map(|name| XmlNamed { name }),
        usage: it
            .usage
            .iter()
            .map(|name| XmlNamed { name: name.clone() })
            .collect(),
        value: it
            .value
            .iter()
            .map(|name| XmlNamed { name: name.clone() })
            .collect(),
        tag: it
            .tags
            .iter()
            .map(|name| XmlNamed { name: name.clone() })
            .collect(),
    }
}

fn flags_from_xml(f: XmlFlags) -> ItemFlags {
    ItemFlags {
        count_in_cargo: f.count_in_cargo,
        count_in_hoarder: f.count_in_hoarder,
        count_in_map: f.count_in_map,
        count_in_player: f.count_in_player,
        crafted: f.crafted,
        deloot: f.deloot,
    }
}

fn flags_to_xml(f: &ItemFlags) -> XmlFlags {
    XmlFlags {
        count_in_cargo: f.count_in_cargo,
        count_in_hoarder: f.count_in_hoarder,
        count_in_map: f.count_in_map,
        count_in_player: f.count_in_player,
        crafted: f.crafted,
        deloot: f.deloot,
    }
}

// ---------- Helpers ----------

fn relative_path_slash(root: &Path, path: &Path) -> String {
    match path.strip_prefix(root) {
        Ok(rel) => rel
            .components()
            .map(|c| c.as_os_str().to_string_lossy().into_owned())
            .collect::<Vec<_>>()
            .join("/"),
        Err(_) => path.to_string_lossy().replace('\\', "/"),
    }
}

// ---------- Tests ----------

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<types>
  <type name="AK101">
    <nominal>5</nominal>
    <lifetime>14400</lifetime>
    <restock>1800</restock>
    <min>2</min>
    <quantmin>-1</quantmin>
    <quantmax>-1</quantmax>
    <cost>100</cost>
    <flags count_in_cargo="0" count_in_hoarder="0" count_in_map="1" count_in_player="0" crafted="0" deloot="0"/>
    <category name="weapons"/>
    <usage name="Military"/>
    <usage name="Police"/>
    <value name="Tier3"/>
    <value name="Tier4"/>
    <tag name="shelves"/>
  </type>
</types>
"#;

    #[test]
    fn round_trip_preserves_fields() {
        let items = parse_bytes(SAMPLE.as_bytes(), ItemSource::Vanilla, "db/types.xml").unwrap();
        assert_eq!(items.len(), 1);
        let it = &items[0];
        assert_eq!(it.name, "AK101");
        assert_eq!(it.nominal, 5);
        assert_eq!(it.lifetime, 14_400);
        assert_eq!(it.quantmin, -1);
        assert_eq!(it.flags.count_in_map, 1);
        assert_eq!(it.category.as_deref(), Some("weapons"));
        assert_eq!(it.usage, vec!["Military", "Police"]);
        assert_eq!(it.value, vec!["Tier3", "Tier4"]);
        assert_eq!(it.tags, vec!["shelves"]);

        let out = serialize_items(items.as_slice()).unwrap();
        // Re-parse to ensure the output is still valid.
        let again = parse_bytes(out.as_bytes(), ItemSource::Vanilla, "").unwrap();
        assert_eq!(again.len(), 1);
        assert_eq!(again[0].name, "AK101");
        assert_eq!(again[0].flags.count_in_map, 1);
        assert_eq!(again[0].usage, vec!["Military", "Police"]);
    }

    #[test]
    fn output_keeps_numeric_fields_on_one_line() {
        // Enfusion's XML parser reads element text literally, so
        // `<nominal>5\n    </nominal>` makes CE report the value as
        // "not defined". This check guarantees our serializer never
        // emits that shape — it was a real bug that silently broke
        // every types_custom.xml override we wrote.
        let items = parse_bytes(SAMPLE.as_bytes(), ItemSource::Vanilla, "").unwrap();
        let out = serialize_items(items.as_slice()).unwrap();
        for fragment in [
            "<nominal>5</nominal>",
            "<lifetime>14400</lifetime>",
            "<min>2</min>",
            "<quantmin>-1</quantmin>",
            "<quantmax>-1</quantmax>",
            "<cost>100</cost>",
        ] {
            assert!(
                out.contains(fragment),
                "serializer must emit `{fragment}` inline. Full output:\n{out}"
            );
        }
    }

    #[test]
    fn parses_fragment_without_types_root() {
        // Real-world mods ship loose <type> fragments expecting the
        // operator to paste them into vanilla types.xml. Our "Import
        // mod CE files" flow registers them as standalone files so
        // the parser has to accept the fragment shape.
        let fragment = r#"<type name="Helipolice_SIB4">
    <nominal>0</nominal>
    <lifetime>3888000</lifetime>
    <flags count_in_cargo="0" count_in_hoarder="0" count_in_map="1" count_in_player="0" crafted="0" deloot="0"/>
</type>
<type name="HeliSIB_UH1D">
    <nominal>0</nominal>
    <lifetime>3888000</lifetime>
    <flags count_in_cargo="0" count_in_hoarder="0" count_in_map="1" count_in_player="0" crafted="0" deloot="0"/>
</type>"#;
        let items = parse_bytes(
            fragment.as_bytes(),
            ItemSource::Mod,
            "heli_ce/types.xml",
        )
        .unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].name, "Helipolice_SIB4");
        assert_eq!(items[1].name, "HeliSIB_UH1D");
        assert_eq!(items[1].lifetime, 3_888_000);
    }

    #[test]
    fn parses_fragment_with_xml_prologue() {
        let fragment = r#"<?xml version="1.0" encoding="UTF-8"?>
<type name="HeliMI17_SIB">
    <nominal>0</nominal>
    <lifetime>3888000</lifetime>
    <flags count_in_cargo="0" count_in_hoarder="0" count_in_map="1" count_in_player="0" crafted="0" deloot="0"/>
</type>"#;
        let items = parse_bytes(fragment.as_bytes(), ItemSource::Mod, "").unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].name, "HeliMI17_SIB");
    }

    #[test]
    fn strict_parse_of_well_formed_file_still_wins() {
        // The tolerant path must not re-wrap a file that already had
        // a `<types>` root — otherwise we'd double-wrap and the
        // outer quick_xml parse would produce nothing.
        let items = parse_bytes(SAMPLE.as_bytes(), ItemSource::Vanilla, "").unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].name, "AK101");
    }

    #[test]
    fn file_with_no_type_elements_returns_empty_without_error() {
        // Non-types content registered as type="types" in
        // cfgeconomycore is operator error, not a parser bug. We
        // return an empty list and trust the "0 items loaded from
        // this file" surface in the UI's files-loaded panel to make
        // the mismatch visible without lighting up a red validation
        // error on every refresh.
        let junk = "<something><not-a-type/></something>";
        let items =
            parse_bytes(junk.as_bytes(), ItemSource::Mod, "weird.xml").unwrap();
        assert!(items.is_empty());
    }

    #[test]
    fn fragment_with_leading_comment_still_parses() {
        let fragment = r#"<!-- Mod: HelisSIB pack, v1.2 -->
<type name="HeliXH9_SIB">
    <nominal>0</nominal>
    <lifetime>3888000</lifetime>
    <flags count_in_cargo="0" count_in_hoarder="0" count_in_map="1" count_in_player="0" crafted="0" deloot="0"/>
</type>"#;
        let items = parse_bytes(fragment.as_bytes(), ItemSource::Mod, "").unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].name, "HeliXH9_SIB");
    }

    #[test]
    fn well_formed_file_with_header_comment_is_not_rewrapped() {
        // Regression: a header comment before `<types>` must not push
        // the file into the fragment path — `quick_xml` handles
        // comments natively so the strict parse works as-is.
        let src = r#"<?xml version="1.0" encoding="UTF-8"?>
<!-- Vanilla chernarus types, trimmed for test -->
<types>
    <type name="AK101">
        <nominal>5</nominal>
        <lifetime>14400</lifetime>
        <restock>1800</restock>
        <min>2</min>
        <quantmin>-1</quantmin>
        <quantmax>-1</quantmax>
        <cost>100</cost>
        <flags count_in_cargo="0" count_in_hoarder="0" count_in_map="1" count_in_player="0" crafted="0" deloot="0"/>
    </type>
</types>"#;
        let items = parse_bytes(src.as_bytes(), ItemSource::Vanilla, "").unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].name, "AK101");
    }
}
