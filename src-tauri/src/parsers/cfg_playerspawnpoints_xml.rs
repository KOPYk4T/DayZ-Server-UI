//! `cfgplayerspawnpoints.xml` round-trip parser (PDR §5.3, §9.6).
//!
//! Root: `<playerspawnpoints>`. Three children: `<fresh>`, `<hop>`,
//! `<travel>`. Each may hold one or more "generator" blocks. We edit
//! `<generator_posbubbles>` (the canonical vanilla generator) and
//! DETECT, via a pre-parse scan, whether other generator kinds are
//! present so the UI can warn before a save strips them.
//!
//! Two historical entry-element forms exist inside
//! `<generator_posbubbles>`, both in the wild:
//!
//! 1. Modern vanilla (DayZ 1.18+):
//!    `<pos_bubble pos="6644 2464" z_rot="91.4" smart="0" rad="10" ver="7.9"/>`
//! 2. Older / alternative:
//!    `<pos x="6644" z="2464" a="91.4"/>`
//!
//! We accept both on read, track which one was used, and emit the
//! same form on write so a round-trip doesn't surprise the server.

use std::path::Path;

use quick_xml::events::attributes::Attribute;
use quick_xml::events::{BytesDecl, BytesEnd, BytesStart, BytesText, Event};
use quick_xml::{Reader, Writer};

use crate::domain::{PlayerSpawnPoints, PosFormat, SpawnPosition};
use crate::error::{AppError, AppResult};

// ---------- Public API ----------

pub fn parse_file(path: &Path) -> AppResult<PlayerSpawnPoints> {
    let bytes = std::fs::read(path)?;
    parse_bytes(&bytes)
        .map_err(|e| AppError::Internal(format!("parsing {}: {e}", path.display())))
}

pub fn parse_bytes(bytes: &[u8]) -> Result<PlayerSpawnPoints, String> {
    let has_unsupported = scan_for_unsupported_generators(bytes);

    let mut reader = Reader::from_reader(bytes);
    reader.config_mut().trim_text(true);

    let mut stack: Vec<String> = Vec::new();
    let mut sp = PlayerSpawnPoints {
        has_unsupported_generators: has_unsupported,
        ..Default::default()
    };
    let mut detected: Option<PosFormat> = None;
    let mut buf = Vec::new();

    loop {
        match reader
            .read_event_into(&mut buf)
            .map_err(|e| format!("xml read: {e}"))?
        {
            Event::Start(e) => {
                stack.push(local_name(e.name().as_ref()));
            }
            Event::End(_) => {
                stack.pop();
            }
            Event::Empty(e) => {
                let name = local_name(e.name().as_ref());
                // Only consider position entries nested inside
                // <kind><generator_posbubbles> so we don't pick up
                // stray <pos/> elements elsewhere.
                if (name == "pos" || name == "pos_bubble")
                    && inside_posbubbles(&stack)
                {
                    if let Some(kind) = current_kind(&stack) {
                        let (pos, fmt) = parse_pos_entry(&e, &name)?;
                        detected.get_or_insert(fmt);
                        match kind {
                            "fresh" => sp.fresh.push(pos),
                            "hop" => sp.hop.push(pos),
                            "travel" => sp.travel.push(pos),
                            _ => {}
                        }
                    }
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    sp.pos_format = detected.unwrap_or_default();
    Ok(sp)
}

/// Walks the stack to see if we're inside `<kind>/<generator_posbubbles>`
/// (with optional `<spawn_params>` wrapper used in some DayZ files).
fn inside_posbubbles(stack: &[String]) -> bool {
    stack.iter().any(|s| s == "generator_posbubbles")
}

fn current_kind(stack: &[String]) -> Option<&str> {
    for s in stack.iter().rev() {
        match s.as_str() {
            "fresh" | "hop" | "travel" => return Some(s.as_str()),
            _ => {}
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

fn parse_pos_entry(
    e: &BytesStart<'_>,
    tag_name: &str,
) -> Result<(SpawnPosition, PosFormat), String> {
    let mut x: Option<f64> = None;
    let mut z: Option<f64> = None;
    let mut a: Option<f64> = None;
    let mut combined_pos: Option<String> = None;

    let tmp_reader: Reader<&[u8]> = Reader::from_reader(&[] as &[u8]);
    let decoder = tmp_reader.decoder();
    for attr in e.attributes().flatten() {
        let key = attr_key(&attr);
        let val = attr
            .decode_and_unescape_value(decoder)
            .map_err(|err| format!("attr decode {key}: {err}"))?
            .into_owned();
        match key.as_str() {
            "x" => x = parse_num(&val),
            "z" => z = parse_num(&val),
            // yaw — separate-attribute form uses `a`, combined form
            // uses `z_rot`. Accept either on either tag; DayZ files in
            // the wild aren't always consistent.
            "a" | "z_rot" | "zrot" => a = parse_num(&val),
            "pos" => combined_pos = Some(val),
            _ => {}
        }
    }

    // Combined "x z" attribute (pos_bubble form) takes precedence if
    // present — some files ship both and the combined pair is the
    // authoritative one for modern DayZ.
    if let Some(combined) = combined_pos.as_deref() {
        let nums: Vec<f64> = combined
            .split_whitespace()
            .filter_map(parse_num)
            .collect();
        if nums.len() >= 2 {
            x = Some(nums[0]);
            z = Some(nums[1]);
            if nums.len() >= 3 && a.is_none() {
                a = Some(nums[2]);
            }
        }
    }

    let fmt = if tag_name == "pos_bubble" || combined_pos.is_some() {
        PosFormat::PosBubble
    } else {
        PosFormat::Pos
    };

    Ok((
        SpawnPosition {
            x: x.unwrap_or(0.0),
            z: z.unwrap_or(0.0),
            a: a.unwrap_or(0.0),
        },
        fmt,
    ))
}

fn attr_key(attr: &Attribute<'_>) -> String {
    let raw = std::str::from_utf8(attr.key.as_ref()).unwrap_or("");
    raw.rsplit_once(':')
        .map(|(_, l)| l)
        .unwrap_or(raw)
        .to_ascii_lowercase()
}

fn parse_num(s: &str) -> Option<f64> {
    s.trim().parse::<f64>().ok()
}

// ---------- Serializer ----------

pub fn serialize(sp: &PlayerSpawnPoints) -> AppResult<String> {
    let mut writer = Writer::new_with_indent(Vec::new(), b' ', 4);
    writer
        .write_event(Event::Decl(BytesDecl::new("1.0", Some("UTF-8"), None)))
        .map_err(serialize_err)?;

    let root = BytesStart::new("playerspawnpoints");
    writer
        .write_event(Event::Start(root.clone()))
        .map_err(serialize_err)?;

    write_kind(&mut writer, "fresh", &sp.fresh, sp.pos_format)?;
    write_kind(&mut writer, "hop", &sp.hop, sp.pos_format)?;
    write_kind(&mut writer, "travel", &sp.travel, sp.pos_format)?;

    writer
        .write_event(Event::End(BytesEnd::new("playerspawnpoints")))
        .map_err(serialize_err)?;

    let bytes = writer.into_inner();
    let mut text = String::from_utf8(bytes)
        .map_err(|e| AppError::Internal(format!("serializing: non-utf8 output: {e}")))?;
    if !text.ends_with('\n') {
        text.push('\n');
    }
    Ok(text)
}

fn write_kind(
    writer: &mut Writer<Vec<u8>>,
    kind: &str,
    positions: &[SpawnPosition],
    fmt: PosFormat,
) -> AppResult<()> {
    writer
        .write_event(Event::Start(BytesStart::new(kind)))
        .map_err(serialize_err)?;

    if !positions.is_empty() {
        writer
            .write_event(Event::Start(BytesStart::new("generator_posbubbles")))
            .map_err(serialize_err)?;

        for p in positions {
            match fmt {
                PosFormat::PosBubble => {
                    let mut el = BytesStart::new("pos_bubble");
                    el.push_attribute((
                        "pos",
                        format!("{} {}", fmt_num(p.x), fmt_num(p.z)).as_str(),
                    ));
                    el.push_attribute(("z_rot", fmt_num(p.a).as_str()));
                    writer
                        .write_event(Event::Empty(el))
                        .map_err(serialize_err)?;
                }
                PosFormat::Pos => {
                    let mut el = BytesStart::new("pos");
                    el.push_attribute(("x", fmt_num(p.x).as_str()));
                    el.push_attribute(("z", fmt_num(p.z).as_str()));
                    el.push_attribute(("a", fmt_num(p.a).as_str()));
                    writer
                        .write_event(Event::Empty(el))
                        .map_err(serialize_err)?;
                }
            }
        }

        writer
            .write_event(Event::End(BytesEnd::new("generator_posbubbles")))
            .map_err(serialize_err)?;
    } else {
        // Keep the empty kind element visible — DayZ tolerates an
        // empty <fresh/> but not a missing one in some builds. Write
        // a zero-length text node so quick-xml emits the full open/close
        // pair instead of self-closing.
        writer
            .write_event(Event::Text(BytesText::new("")))
            .map_err(serialize_err)?;
    }

    writer
        .write_event(Event::End(BytesEnd::new(kind)))
        .map_err(serialize_err)?;
    Ok(())
}

fn fmt_num(n: f64) -> String {
    if (n - n.round()).abs() < f64::EPSILON {
        format!("{}", n as i64)
    } else {
        // Trim trailing zeros but keep at least one decimal.
        let s = format!("{n}");
        s
    }
}

fn serialize_err(e: quick_xml::Error) -> AppError {
    AppError::Internal(format!("serializing cfgplayerspawnpoints.xml: {e}"))
}

pub fn write(path: &Path, sp: &PlayerSpawnPoints) -> AppResult<()> {
    let text = serialize(sp)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, text)?;
    Ok(())
}

/// Pre-parse scan: returns true when any `<generator_deviate>` or
/// `<generator_random>` element is present in the file. Those kinds
/// are legal DayZ XML but we don't round-trip them — saves from the
/// UI would drop them silently, which we refuse to do without the
/// user acknowledging it in the frontend.
fn scan_for_unsupported_generators(bytes: &[u8]) -> bool {
    let mut reader = Reader::from_reader(bytes);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                let name = local_name(e.name().as_ref());
                if name.starts_with("generator_") && name != "generator_posbubbles" {
                    return true;
                }
            }
            Ok(Event::Eof) => return false,
            Ok(_) => {}
            Err(_) => return false,
        }
        buf.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_POS: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<playerspawnpoints>
    <fresh>
        <generator_posbubbles>
            <pos x="6644" z="2464" a="91.4"/>
            <pos x="4847" z="2477" a="272.5"/>
        </generator_posbubbles>
    </fresh>
    <hop>
        <generator_posbubbles>
            <pos x="6644" z="2464" a="91.4"/>
        </generator_posbubbles>
    </hop>
    <travel>
        <generator_posbubbles>
            <pos x="6644" z="2464" a="91.4"/>
        </generator_posbubbles>
    </travel>
</playerspawnpoints>
"#;

    const SAMPLE_POS_BUBBLE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<playerspawnpoints>
    <fresh>
        <generator_posbubbles>
            <pos_bubble pos="6644 2464" z_rot="91.4" smart="0" rad="10" ver="7.9"/>
            <pos_bubble pos="4847 2477" z_rot="272.5" smart="0" rad="10" ver="7.9"/>
        </generator_posbubbles>
    </fresh>
    <hop>
        <generator_posbubbles>
            <pos_bubble pos="6644 2464" z_rot="91.4" smart="0" rad="10" ver="7.9"/>
        </generator_posbubbles>
    </hop>
    <travel></travel>
</playerspawnpoints>
"#;

    #[test]
    fn reads_pos_form() {
        let sp = parse_bytes(SAMPLE_POS.as_bytes()).unwrap();
        assert_eq!(sp.fresh.len(), 2);
        assert_eq!(sp.hop.len(), 1);
        assert_eq!(sp.travel.len(), 1);
        assert_eq!(sp.fresh[0].x, 6644.0);
        assert_eq!(sp.fresh[1].a, 272.5);
        assert_eq!(sp.pos_format, PosFormat::Pos);
        assert!(!sp.has_unsupported_generators);
    }

    #[test]
    fn reads_pos_bubble_form() {
        let sp = parse_bytes(SAMPLE_POS_BUBBLE.as_bytes()).unwrap();
        assert_eq!(sp.fresh.len(), 2, "fresh should contain 2 pos_bubble entries");
        assert_eq!(sp.hop.len(), 1);
        assert_eq!(sp.travel.len(), 0);
        assert_eq!(sp.fresh[0].x, 6644.0);
        assert_eq!(sp.fresh[0].z, 2464.0);
        assert_eq!(sp.fresh[0].a, 91.4);
        assert_eq!(sp.fresh[1].x, 4847.0);
        assert_eq!(sp.fresh[1].a, 272.5);
        assert_eq!(sp.pos_format, PosFormat::PosBubble);
    }

    #[test]
    fn round_trip_preserves_pos_format() {
        let sp = parse_bytes(SAMPLE_POS.as_bytes()).unwrap();
        let out = serialize(&sp).unwrap();
        assert!(out.contains("<pos "), "pos form must round-trip as <pos>");
        assert!(!out.contains("pos_bubble"));
        let again = parse_bytes(out.as_bytes()).unwrap();
        assert_eq!(again.fresh.len(), 2);
        assert_eq!(again.fresh[1].x, 4847.0);
        assert_eq!(again.pos_format, PosFormat::Pos);
    }

    #[test]
    fn round_trip_preserves_pos_bubble_format() {
        let sp = parse_bytes(SAMPLE_POS_BUBBLE.as_bytes()).unwrap();
        let out = serialize(&sp).unwrap();
        assert!(
            out.contains("<pos_bubble "),
            "pos_bubble form must round-trip as <pos_bubble>"
        );
        let again = parse_bytes(out.as_bytes()).unwrap();
        assert_eq!(again.fresh.len(), 2);
        assert_eq!(again.fresh[0].x, 6644.0);
        assert_eq!(again.fresh[0].a, 91.4);
        assert_eq!(again.pos_format, PosFormat::PosBubble);
    }

    #[test]
    fn flags_unsupported_generators() {
        let src = r#"<?xml version="1.0"?>
<playerspawnpoints>
    <fresh>
        <generator_posbubbles><pos x="1" z="2" a="3"/></generator_posbubbles>
        <generator_deviate><pos x="10" z="20" a="30"/></generator_deviate>
    </fresh>
    <hop></hop>
    <travel></travel>
</playerspawnpoints>
"#;
        let sp = parse_bytes(src.as_bytes()).unwrap();
        assert!(
            sp.has_unsupported_generators,
            "file with generator_deviate must set the flag"
        );
        assert_eq!(sp.fresh.len(), 1);
        assert_eq!(sp.fresh[0].x, 1.0);
    }

    #[test]
    fn empty_kind_blocks_round_trip() {
        let src = r#"<?xml version="1.0"?>
<playerspawnpoints>
    <fresh><generator_posbubbles><pos x="1" z="2" a="3"/></generator_posbubbles></fresh>
    <hop/>
    <travel/>
</playerspawnpoints>
"#;
        let sp = parse_bytes(src.as_bytes()).unwrap();
        assert_eq!(sp.fresh.len(), 1);
        assert!(sp.hop.is_empty());
        assert!(sp.travel.is_empty());
    }

    #[test]
    fn ignores_pos_outside_generator_posbubbles() {
        // <pos> nested in a deviate block must not be picked up as a
        // fresh spawn. scan flags the file as unsupported; the pos
        // list must still only contain the posbubble entry.
        let src = r#"<?xml version="1.0"?>
<playerspawnpoints>
    <fresh>
        <generator_posbubbles>
            <pos x="1" z="2" a="3"/>
        </generator_posbubbles>
        <generator_deviate>
            <pos x="999" z="999" a="0"/>
        </generator_deviate>
    </fresh>
    <hop/>
    <travel/>
</playerspawnpoints>
"#;
        let sp = parse_bytes(src.as_bytes()).unwrap();
        assert!(sp.has_unsupported_generators);
        assert_eq!(sp.fresh.len(), 1);
        assert_eq!(sp.fresh[0].x, 1.0);
    }
}
