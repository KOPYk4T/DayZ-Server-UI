//! Minimal XML pretty-printer used after quick-xml serde-serialises our
//! CE documents on a single line. It indents per tag depth and **keeps
//! text-content elements on one line** — i.e. `<nominal>100</nominal>`
//! stays `<nominal>100</nominal>`, not split into
//! `<nominal>100\n    </nominal>`.
//!
//! Why it matters: DayZ's Enfusion XML parser treats all whitespace
//! inside an element as part of the text value, so a value of
//! `"100\n    "` fails integer parsing and the field ends up "not
//! defined". Getting this wrong silently breaks every numeric override
//! written to `custom/types_custom.xml` or `custom/events_custom.xml`.

pub fn pretty(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + s.len() / 8);
    let bytes = s.as_bytes();
    let mut i = 0;
    let mut depth: i32 = 0;
    // True when the last tag we emitted at this level was an open tag
    // (or we just appended text content inside one). A close tag that
    // follows either case must stay on the same line — i.e. not be
    // prefixed with `\n` + indent — otherwise whitespace bleeds into
    // the element's text content.
    let mut inline_close_ok = false;

    while i < bytes.len() {
        if bytes[i] == b'<' {
            let is_close = bytes.get(i + 1) == Some(&b'/');
            let start = i;
            let mut j = i + 1;
            let mut self_close = false;
            while j < bytes.len() && bytes[j] != b'>' {
                if bytes[j] == b'/' && bytes.get(j + 1) == Some(&b'>') {
                    self_close = true;
                    break;
                }
                j += 1;
            }
            let tag_end = if self_close { j + 1 } else { j };
            if tag_end >= bytes.len() {
                out.push_str(&s[start..]);
                break;
            }

            let tag = &s[start..=tag_end];

            if is_close {
                depth -= 1;
                if !inline_close_ok {
                    out.push('\n');
                    indent(&mut out, depth);
                }
                out.push_str(tag);
                inline_close_ok = false;
            } else if self_close {
                if !out.is_empty() {
                    out.push('\n');
                    indent(&mut out, depth);
                }
                out.push_str(tag);
                // A self-closing tag among other children: subsequent
                // siblings should go on new indented lines.
                inline_close_ok = false;
            } else {
                if !out.is_empty() {
                    out.push('\n');
                    indent(&mut out, depth);
                }
                out.push_str(tag);
                depth += 1;
                // Next close tag may stay inline (empty element case);
                // appending text below will also keep this true.
                inline_close_ok = true;
            }

            i = tag_end + 1;
        } else {
            out.push(bytes[i] as char);
            // Text content INSIDE an open element — the pending close
            // tag should stay on the same line as this text. Crucially,
            // we do NOT reset inline_close_ok to false here.
            i += 1;
        }
    }
    out
}

fn indent(out: &mut String, depth: i32) {
    for _ in 0..depth.max(0) {
        out.push_str("    ");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_text_content_inline_with_closing_tag() {
        // Regression test: this is the bug that caused "NOT DEFINED"
        // for every numeric field in VPPAdmin after pushing customs.
        let src = "<types><type name=\"X\"><nominal>100</nominal><lifetime>14400</lifetime></type></types>";
        let out = pretty(src);
        assert!(
            out.contains("<nominal>100</nominal>"),
            "nominal text content must stay on one line, got:\n{out}"
        );
        assert!(
            out.contains("<lifetime>14400</lifetime>"),
            "lifetime text content must stay on one line, got:\n{out}"
        );
        // Text must NEVER end with whitespace before the closing tag —
        // Enfusion treats the whole text node literally.
        assert!(
            !out.contains("100\n"),
            "text node may not be followed by a newline before `</`, got:\n{out}"
        );
        assert!(
            !out.contains("14400\n"),
            "text node may not be followed by a newline before `</`, got:\n{out}"
        );
    }

    #[test]
    fn indents_nested_element_children() {
        let src = "<types><type name=\"X\"><nominal>5</nominal></type></types>";
        let out = pretty(src);
        // `<types>` at depth 0; `<type>` at depth 1 (4 spaces);
        // `<nominal>` at depth 2 (8 spaces).
        assert!(out.contains("\n    <type "), "type should be indented 4:\n{out}");
        assert!(
            out.contains("\n        <nominal>"),
            "nominal should be indented 8:\n{out}"
        );
    }

    #[test]
    fn self_closing_tags_on_their_own_line() {
        let src = "<root><flags a=\"1\"/><category name=\"weapons\"/></root>";
        let out = pretty(src);
        assert!(
            out.contains("\n    <flags a=\"1\"/>"),
            "self-closing tag should be on its own indented line:\n{out}"
        );
        assert!(
            out.contains("\n    <category name=\"weapons\"/>"),
            "self-closing tag should be on its own indented line:\n{out}"
        );
    }
}
