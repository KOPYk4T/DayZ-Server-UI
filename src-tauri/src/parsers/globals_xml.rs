//! `globals.xml` round-trip parser (PDR §5.6 / Phase 7a).
//!
//! Flat XML: `<economy><var name="…" type="…" value="…"/>…</economy>`.
//! Some mission packs drop the `<economy>` wrapper and have bare
//! `<var>` elements at the root — we accept both. Order is preserved
//! on write.

use std::path::Path;

use quick_xml::events::{BytesDecl, BytesEnd, BytesStart, Event};
use quick_xml::{Reader, Writer};

use crate::domain::{GlobalVar, GlobalVarType, Globals};
use crate::error::{AppError, AppResult};

// ---------- Public API ----------

pub fn parse_file(path: &Path) -> AppResult<Globals> {
    let bytes = std::fs::read(path)?;
    parse_bytes(&bytes)
        .map_err(|e| AppError::Internal(format!("parsing {}: {e}", path.display())))
}

pub fn parse_bytes(bytes: &[u8]) -> Result<Globals, String> {
    let mut reader = Reader::from_reader(bytes);
    reader.config_mut().trim_text(true);

    let mut vars = Vec::new();
    let mut buf = Vec::new();
    loop {
        match reader
            .read_event_into(&mut buf)
            .map_err(|e| format!("xml read: {e}"))?
        {
            Event::Empty(e) | Event::Start(e) => {
                if local_name(e.name().as_ref()) == "var" {
                    vars.push(parse_var(&e)?);
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(Globals { vars })
}

pub fn serialize(g: &Globals) -> AppResult<String> {
    let mut w = Writer::new_with_indent(Vec::new(), b' ', 4);
    w.write_event(Event::Decl(BytesDecl::new("1.0", Some("UTF-8"), None)))
        .map_err(serialize_err)?;

    let root = BytesStart::new("economy");
    w.write_event(Event::Start(root)).map_err(serialize_err)?;

    for v in &g.vars {
        let mut el = BytesStart::new("var");
        el.push_attribute(("name", v.name.as_str()));
        el.push_attribute(("type", v.var_type.to_xml_code()));
        el.push_attribute(("value", v.value.as_str()));
        w.write_event(Event::Empty(el)).map_err(serialize_err)?;
    }

    w.write_event(Event::End(BytesEnd::new("economy")))
        .map_err(serialize_err)?;

    let bytes = w.into_inner();
    let mut text = String::from_utf8(bytes)
        .map_err(|e| AppError::Internal(format!("globals.xml: non-utf8 output: {e}")))?;
    if !text.ends_with('\n') {
        text.push('\n');
    }
    Ok(text)
}

pub fn write(path: &Path, g: &Globals) -> AppResult<()> {
    let text = serialize(g)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, text)?;
    Ok(())
}

// ---------- Parse helpers ----------

fn parse_var(e: &BytesStart<'_>) -> Result<GlobalVar, String> {
    let mut name = None;
    let mut type_str = String::new();
    let mut value = String::new();
    for attr in e.attributes().flatten() {
        let key = std::str::from_utf8(attr.key.as_ref())
            .unwrap_or("")
            .to_ascii_lowercase();
        let val = attr
            .unescape_value()
            .map_err(|err| format!("attr decode {key}: {err}"))?
            .into_owned();
        match key.as_str() {
            "name" => name = Some(val),
            "type" => type_str = val,
            "value" => value = val,
            _ => {}
        }
    }
    let name = name.ok_or_else(|| "globals.xml: <var> missing name".to_string())?;
    Ok(GlobalVar {
        name,
        var_type: GlobalVarType::from_xml_code(&type_str),
        value,
    })
}

fn local_name(name: &[u8]) -> String {
    let raw = std::str::from_utf8(name).unwrap_or("");
    match raw.rsplit_once(':') {
        Some((_, local)) => local.to_ascii_lowercase(),
        None => raw.to_ascii_lowercase(),
    }
}

fn serialize_err(e: quick_xml::Error) -> AppError {
    AppError::Internal(format!("serializing globals.xml: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<economy>
    <var name="CleanupAvoidanceRadius" type="0" value="2"/>
    <var name="CleanupLifetimeDeadInfected" type="0" value="7200"/>
    <var name="CleanupLifetimeDeadPlayer" type="0" value="600"/>
    <var name="CleanupLifetimeDefault" type="0" value="2700"/>
    <var name="TimeLogin" type="0" value="0"/>
    <var name="TimeLogout" type="0" value="30"/>
    <var name="FloatThing" type="1" value="0.5"/>
    <var name="StringThing" type="2" value="hello"/>
</economy>
"#;

    #[test]
    fn parses_flat_economy_shape() {
        let g = parse_bytes(SAMPLE.as_bytes()).unwrap();
        assert_eq!(g.vars.len(), 8);
        assert_eq!(g.vars[0].name, "CleanupAvoidanceRadius");
        assert_eq!(g.vars[0].var_type, GlobalVarType::Integer);
        assert_eq!(g.vars[0].value, "2");
        assert_eq!(g.vars[6].name, "FloatThing");
        assert_eq!(g.vars[6].var_type, GlobalVarType::Float);
        assert_eq!(g.vars[7].var_type, GlobalVarType::String);
        assert_eq!(g.vars[7].value, "hello");
    }

    #[test]
    fn accepts_missing_economy_wrapper() {
        // Some mission packs drop the root wrapper — our event-walker
        // happily picks up the bare <var> elements anyway.
        let src = r#"<?xml version="1.0"?>
<var name="TimeLogin" type="0" value="0"/>
<var name="TimeLogout" type="0" value="30"/>"#;
        let g = parse_bytes(src.as_bytes()).unwrap();
        assert_eq!(g.vars.len(), 2);
    }

    #[test]
    fn round_trip_preserves_order_and_formatting() {
        let g = parse_bytes(SAMPLE.as_bytes()).unwrap();
        let out = serialize(&g).unwrap();
        let again = parse_bytes(out.as_bytes()).unwrap();
        assert_eq!(again.vars.len(), g.vars.len());
        for (a, b) in g.vars.iter().zip(again.vars.iter()) {
            assert_eq!(a.name, b.name);
            assert_eq!(a.var_type, b.var_type);
            assert_eq!(a.value, b.value);
        }
        assert!(out.contains("<economy>"));
        assert!(out.contains("<var name=\"TimeLogin\" type=\"0\" value=\"0\"/>"));
    }

    #[test]
    fn unknown_type_code_falls_back_to_integer() {
        let src = r#"<?xml version="1.0"?>
<economy><var name="Odd" type="99" value="1"/></economy>"#;
        let g = parse_bytes(src.as_bytes()).unwrap();
        assert_eq!(g.vars[0].var_type, GlobalVarType::Integer);
    }

    #[test]
    fn empty_economy_parses_to_zero_vars() {
        let g = parse_bytes(b"<?xml version=\"1.0\"?><economy></economy>").unwrap();
        assert!(g.vars.is_empty());
    }
}
