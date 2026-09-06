//! `events.xml` round-trip parser (PDR §5.3, §9.2).

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::domain::{
    DynamicEvent, EventChild, EventFlags, EventLimit, ItemSource, PositionKind,
};
use crate::error::{AppError, AppResult};

// ---------- XML schema ----------

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename = "events")]
struct EventsFile {
    #[serde(rename = "event", default)]
    events: Vec<XmlEvent>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct XmlEvent {
    #[serde(rename = "@name")]
    name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    nominal: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    min: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    max: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    lifetime: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    restock: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    saferadius: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    distanceradius: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    cleanupradius: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    secondary: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    flags: Option<XmlEventFlags>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    position: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    limit: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    active: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    children: Option<XmlChildren>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    extended: Option<XmlExtended>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct XmlEventFlags {
    #[serde(rename = "@deletable", default)]
    deletable: u8,
    #[serde(rename = "@init_random", default)]
    init_random: u8,
    #[serde(rename = "@remove_damaged", default)]
    remove_damaged: u8,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct XmlChildren {
    #[serde(rename = "child", default)]
    items: Vec<XmlChild>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct XmlChild {
    #[serde(rename = "@lootmax", default)]
    lootmax: i64,
    #[serde(rename = "@lootmin", default)]
    lootmin: i64,
    #[serde(rename = "@max", default)]
    max: i64,
    #[serde(rename = "@min", default)]
    min: i64,
    #[serde(rename = "@type")]
    r#type: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct XmlExtended {
    #[serde(rename = "childrenEx", default, skip_serializing_if = "Option::is_none")]
    children_ex: Option<XmlChildrenEx>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct XmlChildrenEx {
    #[serde(rename = "childEx", default)]
    items: Vec<XmlChild>,
}

// ---------- Public API ----------

pub fn parse_file(
    path: &Path,
    workspace: &Path,
    source: ItemSource,
) -> AppResult<Vec<DynamicEvent>> {
    let bytes = std::fs::read(path)?;
    let rel = rel_slash(workspace, path);
    parse_bytes(&bytes, source, &rel).map_err(|e| {
        AppError::Internal(format!("parsing {}: {e}", path.display()))
    })
}

pub fn parse_bytes(
    bytes: &[u8],
    source: ItemSource,
    file: &str,
) -> Result<Vec<DynamicEvent>, String> {
    let text = std::str::from_utf8(bytes).map_err(|e| e.to_string())?;
    let parsed = parse_tolerant(text)?;
    Ok(parsed
        .events
        .into_iter()
        .map(|e| from_xml(e, source, file))
        .collect())
}

/// Mirrors the fragment-tolerance in `types_xml::parse_bytes`: mods
/// occasionally ship loose `<event>…</event>` blocks without an
/// `<events>` root, expecting the operator to paste them into the
/// vanilla file. Our "Import mod CE files" flow registers them as
/// standalone files, so the parser has to accept both shapes.
fn parse_tolerant(text: &str) -> Result<EventsFile, String> {
    if has_events_root(text) {
        return quick_xml::de::from_str::<EventsFile>(text).map_err(|e| e.to_string());
    }
    let (prologue, body) = split_xml_prologue(text);
    let wrapped = format!("{prologue}<events>\n{body}\n</events>");
    quick_xml::de::from_str::<EventsFile>(&wrapped).map_err(|e| e.to_string())
}

fn has_events_root(text: &str) -> bool {
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
            let after = match rest.find('>') {
                Some(i) => &rest[i + 1..],
                None => return false,
            };
            cur = after.trim_start();
            continue;
        }
        return cur.starts_with("<events>")
            || cur.starts_with("<events ")
            || cur.starts_with("<events/>");
    }
}

fn split_xml_prologue(text: &str) -> (&str, &str) {
    let trimmed = text.trim_start();
    let leading = &text[..text.len() - trimmed.len()];
    if let Some(rest) = trimmed.strip_prefix("<?xml") {
        if let Some(close) = rest.find("?>") {
            let end = leading.len() + "<?xml".len() + close + "?>".len();
            let body = text[end..].trim_start();
            return (&text[..end], body);
        }
    }
    ("", trimmed)
}

pub fn serialize(events: &[DynamicEvent]) -> AppResult<String> {
    let doc = EventsFile {
        events: events.iter().map(to_xml).collect(),
    };
    let mut out = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    let body = quick_xml::se::to_string(&doc)
        .map_err(|e| AppError::Internal(format!("serializing events.xml: {e}")))?;
    out.push_str(&super::pretty::pretty(&body));
    if !out.ends_with('\n') {
        out.push('\n');
    }
    Ok(out)
}

pub fn write_events(path: &Path, events: &[DynamicEvent]) -> AppResult<()> {
    let text = serialize(events)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, text)?;
    Ok(())
}

// ---------- Converters ----------

fn from_xml(e: XmlEvent, source: ItemSource, file: &str) -> DynamicEvent {
    let children = e
        .children
        .map(|c| c.items.into_iter().map(child_from_xml).collect())
        .unwrap_or_default();
    let children_ex = e
        .extended
        .and_then(|ext| ext.children_ex)
        .map(|c| c.items.into_iter().map(child_from_xml).collect())
        .unwrap_or_default();

    DynamicEvent {
        name: e.name,
        nominal: e.nominal.unwrap_or(0),
        min: e.min.unwrap_or(0),
        max: e.max.unwrap_or(0),
        lifetime: e.lifetime.unwrap_or(0),
        restock: e.restock.unwrap_or(0),
        saferadius: e.saferadius.unwrap_or(0),
        distanceradius: e.distanceradius.unwrap_or(0),
        cleanupradius: e.cleanupradius.unwrap_or(0),
        secondary: e.secondary.filter(|s| !s.trim().is_empty()),
        flags: e
            .flags
            .map(|f| EventFlags {
                deletable: f.deletable,
                init_random: f.init_random,
                remove_damaged: f.remove_damaged,
            })
            .unwrap_or_default(),
        position: match e.position.as_deref() {
            Some("fixed") | None => PositionKind::Fixed,
            Some("random") => PositionKind::Random,
            Some("player") => PositionKind::Player,
            Some("uniform") => PositionKind::Uniform,
            // Unknown future / modded value — don't silently rewrite
            // it to `fixed` (that crashes DayZ when the event type
            // doesn't have fixed positions; e.g. infected events use
            // `player`). `fixed` remains the conservative fallback
            // but any forthcoming variants we learn about should land
            // here as their own match arm.
            Some(_) => PositionKind::Fixed,
        },
        limit: match e.limit.as_deref() {
            Some("mixed") | None => EventLimit::Mixed,
            Some("child") => EventLimit::Child,
            Some("parent") => EventLimit::Parent,
            Some("custom") => EventLimit::Custom,
            Some(_) => EventLimit::Mixed,
        },
        active: e.active.unwrap_or(1),
        children,
        children_ex,
        source,
        mod_id: None,
        file: file.to_string(),
    }
}

fn child_from_xml(c: XmlChild) -> EventChild {
    EventChild {
        lootmax: c.lootmax,
        lootmin: c.lootmin,
        max: c.max,
        min: c.min,
        type_name: c.r#type,
    }
}

fn to_xml(e: &DynamicEvent) -> XmlEvent {
    XmlEvent {
        name: e.name.clone(),
        nominal: Some(e.nominal),
        min: Some(e.min),
        max: Some(e.max),
        lifetime: Some(e.lifetime),
        restock: Some(e.restock),
        saferadius: Some(e.saferadius),
        distanceradius: Some(e.distanceradius),
        cleanupradius: Some(e.cleanupradius),
        secondary: e.secondary.clone(),
        flags: Some(XmlEventFlags {
            deletable: e.flags.deletable,
            init_random: e.flags.init_random,
            remove_damaged: e.flags.remove_damaged,
        }),
        position: Some(match e.position {
            PositionKind::Fixed => "fixed".to_string(),
            PositionKind::Random => "random".to_string(),
            PositionKind::Player => "player".to_string(),
            PositionKind::Uniform => "uniform".to_string(),
        }),
        limit: Some(match e.limit {
            EventLimit::Mixed => "mixed".to_string(),
            EventLimit::Child => "child".to_string(),
            EventLimit::Parent => "parent".to_string(),
            EventLimit::Custom => "custom".to_string(),
        }),
        active: Some(e.active),
        children: if e.children.is_empty() {
            None
        } else {
            Some(XmlChildren {
                items: e.children.iter().map(child_to_xml).collect(),
            })
        },
        extended: if e.children_ex.is_empty() {
            None
        } else {
            Some(XmlExtended {
                children_ex: Some(XmlChildrenEx {
                    items: e.children_ex.iter().map(child_to_xml).collect(),
                }),
            })
        },
    }
}

fn child_to_xml(c: &EventChild) -> XmlChild {
    XmlChild {
        lootmax: c.lootmax,
        lootmin: c.lootmin,
        max: c.max,
        min: c.min,
        r#type: c.type_name.clone(),
    }
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
<events>
  <event name="StaticHeliCrash">
    <nominal>6</nominal>
    <min>4</min>
    <max>0</max>
    <lifetime>3600</lifetime>
    <restock>60</restock>
    <saferadius>500</saferadius>
    <distanceradius>3000</distanceradius>
    <cleanupradius>400</cleanupradius>
    <secondary></secondary>
    <flags deletable="1" init_random="0" remove_damaged="1"/>
    <position>fixed</position>
    <limit>mixed</limit>
    <active>1</active>
    <children>
      <child lootmax="0" lootmin="0" max="0" min="0" type="Land_Wreck_UH1Y"/>
    </children>
  </event>
</events>
"#;

    #[test]
    fn round_trip_preserves_fields() {
        let events = parse_bytes(SAMPLE.as_bytes(), ItemSource::Vanilla, "db/events.xml").unwrap();
        assert_eq!(events.len(), 1);
        let e = &events[0];
        assert_eq!(e.name, "StaticHeliCrash");
        assert_eq!(e.nominal, 6);
        assert_eq!(e.flags.deletable, 1);
        assert_eq!(e.position, PositionKind::Fixed);
        assert_eq!(e.children.len(), 1);
        assert_eq!(e.children[0].type_name, "Land_Wreck_UH1Y");

        let out = serialize(events.as_slice()).unwrap();
        let again = parse_bytes(out.as_bytes(), ItemSource::Vanilla, "").unwrap();
        assert_eq!(again[0].children[0].type_name, "Land_Wreck_UH1Y");
        assert_eq!(again[0].flags.deletable, 1);
    }

    /// Regression: vanilla events.xml uses `<position>player</position>`
    /// (infected around-player spawns) and `<position>uniform</position>`
    /// (terrain-distributed). We historically silently mapped both to
    /// `Fixed` and re-serialised as `fixed` — that crashes DayZ on CE
    /// load because those events have no fixed positions. All four
    /// variants must round-trip exactly.
    #[test]
    fn preserves_player_and_uniform_position_kinds() {
        let src = r#"<?xml version="1.0" encoding="UTF-8"?>
<events>
  <event name="InfectedArmy">
    <nominal>20</nominal>
    <min>10</min>
    <max>40</max>
    <lifetime>180</lifetime>
    <restock>0</restock>
    <saferadius>50</saferadius>
    <distanceradius>60</distanceradius>
    <cleanupradius>100</cleanupradius>
    <flags deletable="0" init_random="0" remove_damaged="0"/>
    <position>player</position>
    <limit>child</limit>
    <active>1</active>
  </event>
  <event name="AmbientHen">
    <nominal>3</nominal>
    <min>0</min>
    <max>50</max>
    <lifetime>180</lifetime>
    <restock>60</restock>
    <saferadius>0</saferadius>
    <distanceradius>80</distanceradius>
    <cleanupradius>120</cleanupradius>
    <flags deletable="0" init_random="0" remove_damaged="0"/>
    <position>uniform</position>
    <limit>mixed</limit>
    <active>1</active>
  </event>
</events>
"#;
        let events = parse_bytes(src.as_bytes(), ItemSource::Vanilla, "").unwrap();
        assert_eq!(events[0].position, PositionKind::Player);
        assert_eq!(events[1].position, PositionKind::Uniform);
        let out = serialize(events.as_slice()).unwrap();
        assert!(
            out.contains("<position>player</position>"),
            "player position must round-trip. Full output:\n{out}",
        );
        assert!(
            out.contains("<position>uniform</position>"),
            "uniform position must round-trip. Full output:\n{out}",
        );
        // And it must NOT quietly convert either to `fixed`.
        let fixed_count = out.matches("<position>fixed</position>").count();
        assert_eq!(
            fixed_count, 0,
            "no event should have been rewritten to fixed:\n{out}",
        );
    }

    #[test]
    fn output_keeps_numeric_fields_on_one_line() {
        // See the same assertion in types_xml tests — Enfusion reads
        // text content literally, so CE silently ignores a field when
        // whitespace is mixed into it.
        let events = parse_bytes(SAMPLE.as_bytes(), ItemSource::Vanilla, "").unwrap();
        let out = serialize(events.as_slice()).unwrap();
        for fragment in [
            "<nominal>6</nominal>",
            "<min>4</min>",
            "<lifetime>3600</lifetime>",
            "<saferadius>500</saferadius>",
            "<position>fixed</position>",
            "<limit>mixed</limit>",
            "<active>1</active>",
        ] {
            assert!(
                out.contains(fragment),
                "serializer must emit `{fragment}` inline. Full output:\n{out}"
            );
        }
    }

    #[test]
    fn parses_fragment_without_events_root() {
        // Mods frequently ship loose <event> blocks expecting the
        // operator to paste them into vanilla events.xml. Auto-
        // wrapping the fragment lets CE import register them as
        // standalone files and still surface the events in the UI.
        let fragment = r#"<event name="HelisSIB_Spawn">
    <nominal>6</nominal>
    <min>4</min>
    <max>8</max>
    <lifetime>3600</lifetime>
    <restock>0</restock>
    <saferadius>500</saferadius>
    <distanceradius>500</distanceradius>
    <cleanupradius>0</cleanupradius>
    <secondary></secondary>
    <flags deletable="0" init_random="0" remove_damaged="1"/>
    <position>fixed</position>
    <limit>custom</limit>
    <active>1</active>
    <children>
        <child lootmax="0" lootmin="0" max="1" min="1" type="HeliSIB_UH1D"/>
    </children>
</event>"#;
        let events = parse_bytes(
            fragment.as_bytes(),
            ItemSource::Mod,
            "heli_ce/events.xml",
        )
        .unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].name, "HelisSIB_Spawn");
        assert_eq!(events[0].children.len(), 1);
        assert_eq!(events[0].children[0].type_name, "HeliSIB_UH1D");
    }

    #[test]
    fn parses_fragment_with_prologue_and_comment() {
        let fragment = r#"<?xml version="1.0" encoding="UTF-8"?>
<!-- Helis SIB events pack -->
<event name="HelisSIB_Police">
    <nominal>3</nominal>
    <min>1</min>
    <max>4</max>
    <lifetime>1800</lifetime>
    <restock>0</restock>
    <saferadius>500</saferadius>
    <distanceradius>500</distanceradius>
    <cleanupradius>0</cleanupradius>
    <secondary></secondary>
    <flags deletable="0" init_random="0" remove_damaged="1"/>
    <position>fixed</position>
    <limit>custom</limit>
    <active>1</active>
    <children>
        <child lootmax="0" lootmin="0" max="1" min="1" type="Helipolice_SIB4"/>
    </children>
</event>"#;
        let events = parse_bytes(fragment.as_bytes(), ItemSource::Mod, "").unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].name, "HelisSIB_Police");
    }
}
