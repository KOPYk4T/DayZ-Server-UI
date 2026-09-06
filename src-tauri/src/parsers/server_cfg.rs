//! `serverDZ.cfg` segment parser + writer (PDR §7 / Phase 7b).
//!
//! Arma config syntax is small enough to parse by hand:
//!
//! ```text
//! hostname = "My DayZ Server";   // comment
//! maxPlayers = 60;
//! motd[] = {
//!   "Welcome!",
//!   "Rules: no cheating"
//! };
//! class Missions {
//!   class DayZ {
//!     template = "dayzOffline.chernarusplus";
//!   };
//! };
//! ```
//!
//! We only segment the file — we don't structurally parse class
//! bodies. The motivation is **round-trip safety**: on save, every
//! span we don't understand is re-emitted verbatim, so the user's
//! custom `class BattlEye` / `class CustomMissions` blocks never get
//! reformatted or corrupted. Editable segments are flat `key = value;`
//! scalars and `key[] = {…};` arrays at the top level only.
//!
//! The parser walks character-by-character, respecting:
//! - `"..."` strings (with `""` as escape for an embedded quote)
//! - `// ...` line comments
//! - `/* ... */` block comments
//! - `{ ... }` bracket nesting (class bodies OR array bodies)
//! - `;` statement terminators at bracket-depth 0
//!
//! Anything between two `;` terminators (after stripping leading
//! whitespace) becomes one segment: a Scalar, Array, ClassBlock, or
//! Raw fallback depending on its leading tokens.

use std::path::Path;

use crate::domain::{CfgSegment, CfgValueKind, ServerCfg};
use crate::error::{AppError, AppResult};

// ---------- Public API ----------

pub fn parse_file(path: &Path) -> AppResult<ServerCfg> {
    let bytes = std::fs::read(path)?;
    let text = std::str::from_utf8(&bytes)
        .map_err(|e| AppError::Internal(format!("{}: non-utf8: {e}", path.display())))?;
    parse_text(text)
        .map_err(|e| AppError::Internal(format!("parsing {}: {e}", path.display())))
}

pub fn parse_text(text: &str) -> Result<ServerCfg, String> {
    let chunks = chunk_top_level(text)?;
    let mut segments = Vec::new();
    // `pending_comments` accumulates `//` or `/* */` lines that
    // appear between statements — they attach to the NEXT real
    // statement as `leading_comments`. Blank lines flush them out
    // as their own Comment segments so the original layout survives.
    let mut pending_comments: Vec<String> = Vec::new();

    for chunk in chunks {
        match chunk {
            Chunk::Blank => {
                // Flush any buffered comments as standalone Comment
                // segments so they appear above the blank line in
                // the reconstructed file.
                flush_comments_as_segments(&mut pending_comments, &mut segments);
                segments.push(CfgSegment::Blank);
            }
            Chunk::Comment(text) => {
                pending_comments.push(text);
            }
            Chunk::Statement { body, trailing_comment } => {
                let seg = classify_statement(body, &mut pending_comments, trailing_comment);
                segments.push(seg);
            }
        }
    }
    // Any trailing unattached comments get flushed at end-of-file.
    flush_comments_as_segments(&mut pending_comments, &mut segments);

    Ok(ServerCfg { segments })
}

// ---------- Tokenising / chunking ----------

enum Chunk {
    Blank,
    Comment(String),
    Statement {
        body: String,
        trailing_comment: Option<String>,
    },
}

/// Walk the source and split into top-level chunks. A cleaner
/// state-based scanner — we're always at one of:
///   - `AtLineStart` — the current logical line is blank so far;
///     a `//` / `/* */` here emits a standalone Comment chunk, a
///     `\n` here emits Blank.
///   - `InStatement` — accumulating a statement; `;` at depth 0
///     terminates and emits a Statement chunk. Comments encountered
///     stay inside `cur` so they ride along (class bodies etc.).
fn chunk_top_level(text: &str) -> Result<Vec<Chunk>, String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut depth: i32 = 0;
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0usize;

    // True when we're at the start of a fresh logical line AND `cur`
    // has no statement content accumulated yet AND we're at depth 0.
    // `//`, `/* */`, and `\n` here all produce standalone chunks.
    let at_line_start = |cur: &str, depth: i32| depth == 0 && cur.trim().is_empty();

    while i < chars.len() {
        let c = chars[i];

        // Handle whitespace and newlines first, so we emit Blank
        // chunks at exactly the right time without duplicating.
        if c == '\n' {
            // If cur is empty at depth 0, this is a blank line.
            if at_line_start(&cur, depth) {
                out.push(Chunk::Blank);
                i += 1;
                continue;
            }
            // Otherwise swallow the newline into the statement so
            // multiline arrays / class bodies keep their formatting.
            cur.push('\n');
            i += 1;
            continue;
        }

        // `//` line comment.
        if c == '/' && i + 1 < chars.len() && chars[i + 1] == '/' {
            let start = i;
            while i < chars.len() && chars[i] != '\n' {
                i += 1;
            }
            let slice: String = chars[start..i].iter().collect();
            if at_line_start(&cur, depth) {
                // Standalone comment line — emit and also consume
                // the trailing `\n` so it doesn't count as a Blank.
                out.push(Chunk::Comment(slice));
                if i < chars.len() && chars[i] == '\n' {
                    i += 1;
                }
            } else {
                // Mid-statement / inside class body: embed verbatim.
                cur.push_str(&slice);
            }
            continue;
        }

        // `/* … */` block comment.
        if c == '/' && i + 1 < chars.len() && chars[i + 1] == '*' {
            let start = i;
            i += 2;
            while i + 1 < chars.len() && !(chars[i] == '*' && chars[i + 1] == '/') {
                i += 1;
            }
            if i + 1 < chars.len() {
                i += 2; // consume the closing `*/`
            } else {
                return Err("unterminated block comment".into());
            }
            let slice: String = chars[start..i].iter().collect();
            // Check if the block comment stood alone on its line at
            // depth 0 — in that case, treat as standalone Comment.
            if at_line_start(&cur, depth) {
                out.push(Chunk::Comment(slice));
            } else {
                cur.push_str(&slice);
            }
            continue;
        }

        // String literal — always embed verbatim, Arma `""` escape.
        if c == '"' {
            cur.push('"');
            i += 1;
            while i < chars.len() {
                let x = chars[i];
                if x == '"' {
                    if i + 1 < chars.len() && chars[i + 1] == '"' {
                        cur.push('"');
                        cur.push('"');
                        i += 2;
                        continue;
                    }
                    cur.push('"');
                    i += 1;
                    break;
                }
                cur.push(x);
                i += 1;
            }
            continue;
        }

        match c {
            '{' => {
                depth += 1;
                cur.push(c);
            }
            '}' => {
                depth -= 1;
                if depth < 0 {
                    return Err("unbalanced '}' at top level".into());
                }
                cur.push(c);
            }
            ';' if depth == 0 => {
                cur.push(';');
                let body = cur.trim().to_string();
                if !body.is_empty() {
                    out.push(Chunk::Statement {
                        body,
                        trailing_comment: None,
                    });
                }
                cur.clear();
                // Look ahead on the SAME line for a trailing `//` to
                // attach to the statement we just emitted.
                let mut j = i + 1;
                while j < chars.len() && chars[j] != '\n' && chars[j].is_whitespace() {
                    j += 1;
                }
                if j + 1 < chars.len() && chars[j] == '/' && chars[j + 1] == '/' {
                    let start = j;
                    while j < chars.len() && chars[j] != '\n' {
                        j += 1;
                    }
                    let c_slice: String = chars[start..j].iter().collect();
                    if let Some(Chunk::Statement { trailing_comment, .. }) = out.last_mut() {
                        *trailing_comment = Some(c_slice);
                    }
                }
                i = j;
                continue;
            }
            _ => {
                cur.push(c);
            }
        }

        i += 1;
    }

    if !cur.trim().is_empty() {
        return Err(format!(
            "unterminated statement: '{}'",
            cur.trim().chars().take(80).collect::<String>()
        ));
    }
    if depth != 0 {
        return Err(format!("unbalanced braces at EOF (depth {depth})"));
    }
    Ok(out)
}

// ---------- Statement classification ----------

fn classify_statement(
    body: String,
    pending_comments: &mut Vec<String>,
    trailing_comment: Option<String>,
) -> CfgSegment {
    // Strip the trailing `;` we always keep on the body.
    let trimmed = body.trim_end_matches(';').trim();
    let leading_comments = std::mem::take(pending_comments);

    // `class Name { … }` possibly with `: Base` inheritance.
    if let Some(rest) = trimmed.strip_prefix("class ") {
        // The body up to first '{' is the name (with optional `: Base`).
        let brace = rest.find('{');
        if let Some(bpos) = brace {
            let header = rest[..bpos].trim();
            let (name, base) = if let Some(colon) = header.find(':') {
                (
                    header[..colon].trim().to_string(),
                    Some(header[colon + 1..].trim().to_string()),
                )
            } else {
                (header.to_string(), None)
            };
            return CfgSegment::ClassBlock {
                name,
                base,
                raw: format!("{trimmed};"),
                leading_comments,
            };
        }
    }

    // Scalar: `key = value`
    //   - Array (`key[] = { … }`) is detected first by `[]` before `=`
    if let Some(eq_pos) = find_top_equals(trimmed) {
        let lhs = trimmed[..eq_pos].trim();
        let rhs = trimmed[eq_pos + 1..].trim();
        if let Some(key) = lhs.strip_suffix("[]").map(str::trim) {
            // Array form: `rhs` should be `{ e1, e2, … }`.
            let elements = parse_array_body(rhs);
            return CfgSegment::Array {
                key: key.to_string(),
                elements,
                leading_comments,
                trailing_comment,
            };
        }
        return CfgSegment::Scalar {
            key: lhs.to_string(),
            raw_value: rhs.to_string(),
            value_kind: classify_value_kind(rhs),
            leading_comments,
            trailing_comment,
        };
    }

    // Fallback: unknown statement shape, preserve verbatim.
    CfgSegment::Raw {
        text: format!("{trimmed};"),
    }
}

/// Find the first `=` that isn't inside a string or brackets. We use
/// this to split `key[] = { ... }` (the first `=` is the assignment)
/// from equals signs that might appear inside the value.
fn find_top_equals(s: &str) -> Option<usize> {
    let chars: Vec<char> = s.chars().collect();
    let mut i = 0usize;
    let mut depth = 0i32;
    while i < chars.len() {
        let c = chars[i];
        if c == '"' {
            i += 1;
            while i < chars.len() {
                if chars[i] == '"' {
                    if i + 1 < chars.len() && chars[i + 1] == '"' {
                        i += 2;
                        continue;
                    }
                    i += 1;
                    break;
                }
                i += 1;
            }
            continue;
        }
        if c == '{' || c == '(' || c == '[' {
            depth += 1;
        } else if c == '}' || c == ')' || c == ']' {
            depth -= 1;
        } else if c == '=' && depth == 0 {
            return Some(i);
        }
        i += 1;
    }
    None
}

/// Given `{ "a", "b", 3 }`, return `["\"a\"", "\"b\"", "3"]`.
/// Strings are kept with quotes preserved (including any `""` escapes).
fn parse_array_body(s: &str) -> Vec<String> {
    let trimmed = s.trim().trim_start_matches('{').trim_end_matches('}').trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut depth = 0i32;
    let mut i = 0usize;
    let chars: Vec<char> = trimmed.chars().collect();
    while i < chars.len() {
        let c = chars[i];
        if c == '"' {
            cur.push('"');
            i += 1;
            while i < chars.len() {
                if chars[i] == '"' {
                    if i + 1 < chars.len() && chars[i + 1] == '"' {
                        cur.push('"');
                        cur.push('"');
                        i += 2;
                        continue;
                    }
                    cur.push('"');
                    i += 1;
                    break;
                }
                cur.push(chars[i]);
                i += 1;
            }
            continue;
        }
        if c == '{' {
            depth += 1;
            cur.push(c);
        } else if c == '}' {
            depth -= 1;
            cur.push(c);
        } else if c == ',' && depth == 0 {
            let val = cur.trim().to_string();
            if !val.is_empty() {
                out.push(val);
            }
            cur.clear();
        } else {
            cur.push(c);
        }
        i += 1;
    }
    let tail = cur.trim().to_string();
    if !tail.is_empty() {
        out.push(tail);
    }
    out
}

fn classify_value_kind(s: &str) -> CfgValueKind {
    let t = s.trim();
    if t.starts_with('"') {
        return CfgValueKind::String;
    }
    if let Ok(_) = t.parse::<i64>() {
        return CfgValueKind::Integer;
    }
    if let Ok(_) = t.parse::<f64>() {
        return CfgValueKind::Float;
    }
    CfgValueKind::Ident
}

fn flush_comments_as_segments(pending: &mut Vec<String>, out: &mut Vec<CfgSegment>) {
    for c in pending.drain(..) {
        out.push(CfgSegment::Comment { text: c });
    }
}

// ---------- Writer ----------

pub fn serialize(cfg: &ServerCfg) -> String {
    let mut out = String::new();
    let mut prev_blank = true; // suppress a leading blank
    for seg in &cfg.segments {
        match seg {
            CfgSegment::Blank => {
                if !out.ends_with("\n\n") {
                    // ensure one blank line
                    if !out.ends_with('\n') {
                        out.push('\n');
                    }
                    out.push('\n');
                }
                prev_blank = true;
            }
            CfgSegment::Comment { text } => {
                out.push_str(text.trim_end());
                out.push('\n');
                prev_blank = false;
            }
            CfgSegment::Scalar {
                key,
                raw_value,
                leading_comments,
                trailing_comment,
                ..
            } => {
                for c in leading_comments {
                    out.push_str(c.trim_end());
                    out.push('\n');
                }
                out.push_str(&format!("{key} = {raw_value};"));
                if let Some(tc) = trailing_comment {
                    out.push(' ');
                    out.push_str(tc.trim_end());
                }
                out.push('\n');
                prev_blank = false;
            }
            CfgSegment::Array {
                key,
                elements,
                leading_comments,
                trailing_comment,
            } => {
                for c in leading_comments {
                    out.push_str(c.trim_end());
                    out.push('\n');
                }
                if elements.is_empty() {
                    out.push_str(&format!("{key}[] = {{}};"));
                } else if elements.len() == 1 {
                    out.push_str(&format!("{key}[] = {{ {} }};", elements[0]));
                } else {
                    out.push_str(&format!("{key}[] =\n{{\n"));
                    for (i, el) in elements.iter().enumerate() {
                        out.push_str("    ");
                        out.push_str(el);
                        if i + 1 < elements.len() {
                            out.push(',');
                        }
                        out.push('\n');
                    }
                    out.push_str("};");
                }
                if let Some(tc) = trailing_comment {
                    out.push(' ');
                    out.push_str(tc.trim_end());
                }
                out.push('\n');
                prev_blank = false;
            }
            CfgSegment::ClassBlock {
                raw,
                leading_comments,
                ..
            } => {
                for c in leading_comments {
                    out.push_str(c.trim_end());
                    out.push('\n');
                }
                out.push_str(raw.trim_end());
                if !out.ends_with('\n') {
                    out.push('\n');
                }
                prev_blank = false;
            }
            CfgSegment::Raw { text } => {
                out.push_str(text.trim_end());
                out.push('\n');
                prev_blank = false;
            }
        }
    }
    let _ = prev_blank;
    if !out.ends_with('\n') {
        out.push('\n');
    }
    out
}

pub fn write(path: &Path, cfg: &ServerCfg) -> AppResult<()> {
    let text = serialize(cfg);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, text)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"hostname = "My DayZ Server";   // server name shown in the browser
password = "";                  // join password
passwordAdmin = "secret";
maxPlayers = 60;
verifySignatures = 2;

motd[] =
{
    "Welcome to the server!",
    "Rule 1: no cheating"
};
motdInterval = 1;

// BattlEye configuration below
class BattlEye
{
    something = 1;
};

class Missions
{
    class DayZ
    {
        template = "dayzOffline.chernarusplus";
    };
};
"#;

    #[test]
    fn segments_vanilla_shape() {
        let cfg = parse_text(SAMPLE).unwrap();
        let kinds: Vec<&str> = cfg
            .segments
            .iter()
            .map(|s| match s {
                CfgSegment::Blank => "blank",
                CfgSegment::Comment { .. } => "comment",
                CfgSegment::Scalar { .. } => "scalar",
                CfgSegment::Array { .. } => "array",
                CfgSegment::ClassBlock { .. } => "class",
                CfgSegment::Raw { .. } => "raw",
            })
            .collect();
        // Order matters — blanks / comments in the right positions.
        assert!(kinds.contains(&"scalar"));
        assert!(kinds.contains(&"array"));
        assert!(kinds.iter().filter(|k| **k == "class").count() == 2);
        assert!(kinds.contains(&"blank"));
    }

    #[test]
    fn parses_scalars_with_types() {
        let cfg = parse_text(SAMPLE).unwrap();
        let hostname = find_scalar(&cfg, "hostname").unwrap();
        assert_eq!(hostname.1, r#""My DayZ Server""#);
        let max_players = find_scalar(&cfg, "maxPlayers").unwrap();
        assert_eq!(max_players.1, "60");
    }

    #[test]
    fn parses_multiline_array_elements() {
        let cfg = parse_text(SAMPLE).unwrap();
        let motd = find_array(&cfg, "motd").unwrap();
        assert_eq!(motd.len(), 2);
        assert_eq!(motd[0], r#""Welcome to the server!""#);
        assert_eq!(motd[1], r#""Rule 1: no cheating""#);
    }

    #[test]
    fn captures_class_blocks_verbatim() {
        let cfg = parse_text(SAMPLE).unwrap();
        let classes: Vec<_> = cfg
            .segments
            .iter()
            .filter_map(|s| match s {
                CfgSegment::ClassBlock { name, raw, .. } => Some((name.as_str(), raw.as_str())),
                _ => None,
            })
            .collect();
        assert_eq!(classes.len(), 2);
        assert_eq!(classes[0].0, "BattlEye");
        assert!(classes[0].1.contains("something = 1"));
        assert_eq!(classes[1].0, "Missions");
        assert!(classes[1].1.contains("class DayZ"));
        assert!(classes[1].1.contains("dayzOffline.chernarusplus"));
    }

    #[test]
    fn trailing_comments_attach_to_statement() {
        let cfg = parse_text(SAMPLE).unwrap();
        let host = cfg
            .segments
            .iter()
            .find_map(|s| match s {
                CfgSegment::Scalar {
                    key,
                    trailing_comment,
                    ..
                } if key == "hostname" => Some(trailing_comment.clone()),
                _ => None,
            })
            .unwrap();
        assert!(host.unwrap().contains("server name"));
    }

    #[test]
    fn leading_comment_attaches_to_next_class() {
        let cfg = parse_text(SAMPLE).unwrap();
        let leading = cfg
            .segments
            .iter()
            .find_map(|s| match s {
                CfgSegment::ClassBlock {
                    name,
                    leading_comments,
                    ..
                } if name == "BattlEye" => Some(leading_comments.clone()),
                _ => None,
            })
            .unwrap();
        assert_eq!(leading.len(), 1);
        assert!(leading[0].contains("BattlEye configuration"));
    }

    #[test]
    fn round_trip_is_stable() {
        let first = parse_text(SAMPLE).unwrap();
        let text1 = serialize(&first);
        let second = parse_text(&text1).unwrap();
        let text2 = serialize(&second);
        assert_eq!(text1, text2, "round-trip should be stable");

        // Spot-check content preservation.
        assert!(text1.contains(r#"hostname = "My DayZ Server";"#));
        assert!(text1.contains("passwordAdmin = \"secret\";"));
        assert!(text1.contains("motd[]"));
        assert!(text1.contains("class BattlEye"));
        assert!(text1.contains("class DayZ"));
        assert!(text1.contains("dayzOffline.chernarusplus"));
    }

    #[test]
    fn handles_string_with_escaped_quote() {
        let src = r#"hostname = "He said ""hi""";"#;
        let cfg = parse_text(src).unwrap();
        let hn = find_scalar(&cfg, "hostname").unwrap();
        assert_eq!(hn.1, r#""He said ""hi""""#);
    }

    #[test]
    fn value_kinds_are_classified() {
        let src = r#"
            a = 60;
            b = 0.5;
            c = "text";
            d = SomeIdent;
        "#;
        let cfg = parse_text(src).unwrap();
        let find_kind = |k: &str| {
            cfg.segments.iter().find_map(|s| match s {
                CfgSegment::Scalar { key, value_kind, .. } if key == k => Some(*value_kind),
                _ => None,
            })
        };
        assert_eq!(find_kind("a"), Some(CfgValueKind::Integer));
        assert_eq!(find_kind("b"), Some(CfgValueKind::Float));
        assert_eq!(find_kind("c"), Some(CfgValueKind::String));
        assert_eq!(find_kind("d"), Some(CfgValueKind::Ident));
    }

    #[test]
    fn empty_array_parses_and_serialises() {
        let cfg = parse_text("motd[] = {};").unwrap();
        let motd = find_array(&cfg, "motd").unwrap();
        assert!(motd.is_empty());
        let out = serialize(&cfg);
        assert!(out.contains("motd[] = {}"));
    }

    // ---------- helpers ----------

    fn find_scalar<'a>(cfg: &'a ServerCfg, key: &str) -> Option<(&'a str, &'a str)> {
        cfg.segments.iter().find_map(|s| match s {
            CfgSegment::Scalar { key: k, raw_value, .. } if k == key => {
                Some((k.as_str(), raw_value.as_str()))
            }
            _ => None,
        })
    }

    fn find_array<'a>(cfg: &'a ServerCfg, key: &str) -> Option<&'a [String]> {
        cfg.segments.iter().find_map(|s| match s {
            CfgSegment::Array { key: k, elements, .. } if k == key => Some(elements.as_slice()),
            _ => None,
        })
    }
}
