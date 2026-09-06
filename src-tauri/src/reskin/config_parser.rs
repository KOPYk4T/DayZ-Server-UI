//! Minimal parser for Bohemia-style `config.cpp` files.
//!
//! The goal is **not** a full config parser — just enough to walk the
//! nested `class` structure and pull out the string-array fields the
//! reskin addon cares about:
//!
//! - `hiddenSelections[]`
//! - `hiddenSelectionsTextures[]`
//! - `hiddenSelectionsMaterials[]`
//!
//! Everything else (scalars, sub-expressions, `class X;` forward
//! declarations, macros) is recognised only well enough to skip past.
//! A class that doesn't mention any of the three arrays doesn't show
//! up in the output at all — the index is deliberately narrow to the
//! "skinnable" surface.
//!
//! Input is assumed to be valid config.cpp as emitted by DeRap or
//! produced by DayZ Tools' Extract Game Data. Nothing here tries to
//! recover from malformed input beyond logging-and-skipping.

use serde::{Deserialize, Serialize};

/// One class that exposes at least one of the hiddenSelections
/// arrays. The parent chain is captured so the wizard can validate
/// "this class inherits from something scriptable" without a second
/// pass.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkinnableClass {
    /// The classname as it appears on `class NAME` — this is the
    /// string operators reference from `types.xml`.
    pub name: String,
    /// Parent class, when declared via `class NAME: PARENT`. Often
    /// absent for leaf item classes that inherit by elevation.
    pub parent: Option<String>,
    /// Outer classes this class nests inside, outer-most first.
    /// e.g. `["CfgVehicles"]` for most weapon/clothing classes.
    pub containers: Vec<String>,
    pub hidden_selections: Vec<String>,
    pub hidden_selections_textures: Vec<String>,
    pub hidden_selections_materials: Vec<String>,
    /// Source mod that contributed this class. `None` for vanilla
    /// classes pulled from `P:\DZ\`. Populated with the mod's
    /// @-folder name (e.g. `@ExpansionMod`) when the class came
    /// from a scanned mod PBO. Skipped on (de)serialise when
    /// absent so existing cached vanilla indexes keep loading.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_mod: Option<String>,
}

pub fn parse(input: &str) -> Vec<SkinnableClass> {
    let stripped = strip_comments(input);
    let tokens = tokenize(&stripped);
    let mut parser = Parser::new(&tokens);
    parser.parse_block(&mut Vec::new())
}

#[derive(Debug, Clone, PartialEq)]
enum Tok<'a> {
    Ident(&'a str),
    /// A quoted string literal, unescaped.
    Str(String),
    LBrace,
    RBrace,
    LBracket,
    RBracket,
    LParen,
    RParen,
    Colon,
    Semi,
    Comma,
    Eq,
    /// Anything we don't care about (numbers, operators) — kept as
    /// raw slices so the parser can skim past them.
    Other(&'a str),
}

fn strip_comments(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = String::with_capacity(input.len());
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        // Line comment.
        if b == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'/' {
            while i < bytes.len() && bytes[i] != b'\n' {
                i += 1;
            }
            continue;
        }
        // Block comment.
        if b == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'*' {
            i += 2;
            while i + 1 < bytes.len() && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                i += 1;
            }
            i = (i + 2).min(bytes.len());
            continue;
        }
        // String — preserved verbatim, even if it looks like a
        // comment start inside.
        if b == b'"' {
            out.push('"');
            i += 1;
            while i < bytes.len() {
                let c = bytes[i];
                out.push(c as char);
                i += 1;
                if c == b'"' {
                    // Doubled quotes inside strings are rare in
                    // config.cpp — we treat a single `"` as the
                    // terminator.
                    break;
                }
            }
            continue;
        }
        out.push(b as char);
        i += 1;
    }
    out
}

fn tokenize(input: &str) -> Vec<Tok<'_>> {
    let bytes = input.as_bytes();
    let mut out: Vec<Tok> = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b.is_ascii_whitespace() {
            i += 1;
            continue;
        }
        // Preprocessor / directive line — skip to end of line.
        if b == b'#' {
            while i < bytes.len() && bytes[i] != b'\n' {
                i += 1;
            }
            continue;
        }
        match b {
            b'{' => {
                out.push(Tok::LBrace);
                i += 1;
            }
            b'}' => {
                out.push(Tok::RBrace);
                i += 1;
            }
            b'[' => {
                out.push(Tok::LBracket);
                i += 1;
            }
            b']' => {
                out.push(Tok::RBracket);
                i += 1;
            }
            b'(' => {
                out.push(Tok::LParen);
                i += 1;
            }
            b')' => {
                out.push(Tok::RParen);
                i += 1;
            }
            b':' => {
                out.push(Tok::Colon);
                i += 1;
            }
            b';' => {
                out.push(Tok::Semi);
                i += 1;
            }
            b',' => {
                out.push(Tok::Comma);
                i += 1;
            }
            b'=' => {
                out.push(Tok::Eq);
                i += 1;
            }
            b'"' => {
                i += 1;
                let start = i;
                while i < bytes.len() && bytes[i] != b'"' {
                    i += 1;
                }
                let s = &input[start..i.min(input.len())];
                out.push(Tok::Str(s.to_string()));
                if i < bytes.len() {
                    i += 1; // skip closing quote
                }
            }
            c if c.is_ascii_alphabetic() || c == b'_' => {
                let start = i;
                while i < bytes.len()
                    && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_')
                {
                    i += 1;
                }
                let s = &input[start..i];
                out.push(Tok::Ident(s));
            }
            _ => {
                let start = i;
                while i < bytes.len() && !is_punct_or_whitespace(bytes[i]) {
                    i += 1;
                }
                let s = &input[start..i];
                if !s.is_empty() {
                    out.push(Tok::Other(s));
                } else {
                    // Guarantee progress on weird single chars.
                    i += 1;
                }
            }
        }
    }
    out
}

fn is_punct_or_whitespace(b: u8) -> bool {
    b.is_ascii_whitespace()
        || matches!(
            b,
            b'{' | b'}' | b'[' | b']' | b'(' | b')' | b':' | b';' | b',' | b'=' | b'"' | b'#'
        )
}

struct Parser<'a> {
    toks: &'a [Tok<'a>],
    pos: usize,
}

impl<'a> Parser<'a> {
    fn new(toks: &'a [Tok<'a>]) -> Self {
        Self { toks, pos: 0 }
    }

    fn peek(&self) -> Option<&Tok<'a>> {
        self.toks.get(self.pos)
    }

    fn advance(&mut self) -> Option<&Tok<'a>> {
        let t = self.toks.get(self.pos)?;
        self.pos += 1;
        Some(t)
    }

    /// Parse statements at the current brace level, recording any
    /// classes that have at least one hiddenSelections* array.
    /// `containers` is the stack of enclosing classes (outer first).
    fn parse_block(&mut self, containers: &mut Vec<String>) -> Vec<SkinnableClass> {
        let mut out = Vec::new();
        while let Some(tok) = self.peek().cloned() {
            match tok {
                Tok::RBrace => break,
                Tok::Ident(w) if w == "class" => {
                    self.advance();
                    out.extend(self.parse_class_statement(containers));
                }
                _ => {
                    // Anything else at block scope: either a
                    // scalar assignment, an array assignment we
                    // don't care about, or a macro invocation. Eat
                    // tokens until the next `;` or `}`.
                    self.skip_statement();
                }
            }
        }
        out
    }

    fn parse_class_statement(
        &mut self,
        containers: &mut Vec<String>,
    ) -> Vec<SkinnableClass> {
        // `class NAME[: PARENT] { ... };`  OR  `class NAME;`
        let name = match self.advance().cloned() {
            Some(Tok::Ident(n)) => n.to_string(),
            _ => {
                // Malformed — recover.
                self.skip_statement();
                return Vec::new();
            }
        };

        let mut parent: Option<String> = None;
        if matches!(self.peek(), Some(Tok::Colon)) {
            self.advance();
            if let Some(Tok::Ident(p)) = self.advance().cloned() {
                parent = Some(p.to_string());
            }
        }

        match self.peek() {
            Some(Tok::Semi) => {
                // Forward declaration.
                self.advance();
                Vec::new()
            }
            Some(Tok::LBrace) => {
                self.advance();
                self.parse_class_body(&name, parent, containers)
            }
            _ => {
                self.skip_statement();
                Vec::new()
            }
        }
    }

    fn parse_class_body(
        &mut self,
        class_name: &str,
        parent: Option<String>,
        containers: &mut Vec<String>,
    ) -> Vec<SkinnableClass> {
        let mut hidden_selections = Vec::new();
        let mut hidden_selections_textures = Vec::new();
        let mut hidden_selections_materials = Vec::new();
        let mut nested_results: Vec<SkinnableClass> = Vec::new();

        while let Some(tok) = self.peek().cloned() {
            match tok {
                Tok::RBrace => {
                    self.advance();
                    // Optional trailing `;` after `}`.
                    if matches!(self.peek(), Some(Tok::Semi)) {
                        self.advance();
                    }
                    break;
                }
                Tok::Ident(w) if w == "class" => {
                    self.advance();
                    containers.push(class_name.to_string());
                    nested_results
                        .extend(self.parse_class_statement(containers));
                    containers.pop();
                }
                Tok::Ident(key) => {
                    self.advance();
                    if matches!(self.peek(), Some(Tok::LBracket)) {
                        // `key[] = {...};`
                        self.advance();
                        // Expect `]`
                        if matches!(self.peek(), Some(Tok::RBracket)) {
                            self.advance();
                        }
                        if matches!(self.peek(), Some(Tok::Eq)) {
                            self.advance();
                        }
                        let values = self.parse_array_values();
                        match key {
                            "hiddenSelections" => hidden_selections = values,
                            "hiddenSelectionsTextures" => {
                                hidden_selections_textures = values
                            }
                            "hiddenSelectionsMaterials" => {
                                hidden_selections_materials = values
                            }
                            _ => {}
                        }
                        if matches!(self.peek(), Some(Tok::Semi)) {
                            self.advance();
                        }
                    } else {
                        // Scalar assignment or unknown — skim past.
                        self.skip_statement();
                    }
                }
                _ => {
                    self.skip_statement();
                }
            }
        }

        let mut out = nested_results;
        // Only emit classes that actually expose a "skinnable" shape —
        // i.e. at least one hidden-selection array is populated. The
        // P: drive parse would otherwise produce tens of thousands of
        // entries (damage pools, anim pool classes, movement
        // configs, …) that are never anything an operator wants to
        // pick as a reskin source. Classes with no selection arrays
        // but that do matter operationally (animals, vehicles without
        // camo) reach the Classes page through a separate merge on
        // the frontend side: we pull the names from the mission's
        // types.xml registry so the list scope matches the Items
        // page.
        if !hidden_selections.is_empty()
            || !hidden_selections_textures.is_empty()
            || !hidden_selections_materials.is_empty()
        {
            out.push(SkinnableClass {
                name: class_name.to_string(),
                parent,
                containers: containers.clone(),
                hidden_selections,
                hidden_selections_textures,
                hidden_selections_materials,
                source_mod: None,
            });
        }
        out
    }

    /// Consume a `{ "a", "b", { "nested" }, ... };` value list,
    /// flattening nested braces. Returns just the string literals.
    fn parse_array_values(&mut self) -> Vec<String> {
        let mut out = Vec::new();
        if !matches!(self.peek(), Some(Tok::LBrace)) {
            return out;
        }
        self.advance();
        let mut depth = 1;
        while depth > 0 {
            let Some(tok) = self.advance().cloned() else {
                break;
            };
            match tok {
                Tok::LBrace => depth += 1,
                Tok::RBrace => depth -= 1,
                Tok::Str(s) => out.push(s),
                _ => {}
            }
        }
        out
    }

    fn skip_statement(&mut self) {
        // Eat tokens until the next `;` at current-or-lesser brace
        // depth. Respects nested `{ ... }` so we don't accidentally
        // escape into the parent class.
        let mut depth = 0i32;
        while let Some(tok) = self.advance().cloned() {
            match tok {
                Tok::LBrace => depth += 1,
                Tok::RBrace => {
                    if depth == 0 {
                        // The statement was really a block that just
                        // closed — rewind and let the caller handle
                        // the `}`.
                        self.pos -= 1;
                        return;
                    }
                    depth -= 1;
                }
                Tok::Semi if depth == 0 => return,
                _ => {}
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_single_top_level_class() {
        let cpp = r#"
            class AKM: Rifle_Base {
                hiddenSelections[] = {"camo1"};
                hiddenSelectionsTextures[] = {"dz/weapons/ak/data/akm_co.paa"};
            };
        "#;
        let classes = parse(cpp);
        assert_eq!(classes.len(), 1);
        let c = &classes[0];
        assert_eq!(c.name, "AKM");
        assert_eq!(c.parent.as_deref(), Some("Rifle_Base"));
        assert_eq!(c.hidden_selections, vec!["camo1"]);
        assert_eq!(
            c.hidden_selections_textures,
            vec!["dz/weapons/ak/data/akm_co.paa"]
        );
        assert!(c.hidden_selections_materials.is_empty());
    }

    #[test]
    fn nests_record_containers() {
        let cpp = r#"
            class CfgVehicles {
                class AKM {
                    hiddenSelections[] = {"camo1"};
                };
                class AK74 {
                    scope = 2;
                };
            };
        "#;
        let classes = parse(cpp);
        assert_eq!(classes.len(), 1);
        assert_eq!(classes[0].name, "AKM");
        assert_eq!(classes[0].containers, vec!["CfgVehicles"]);
    }

    #[test]
    fn skips_classes_without_skinnable_arrays() {
        // The P: drive parse is scoped to classes with at least one
        // hidden-selection slot. Anything else would swamp the list
        // with tens of thousands of internal pool / config classes
        // that aren't meaningful entities. Non-reskinnable entries
        // that ARE operationally relevant (animals, vehicles without
        // camo) reach the Classes page through a separate types.xml
        // merge on the frontend — the scope there matches what the
        // Items page lists.
        let cpp = r#"
            class Foo { scope = 1; };
            class Bar: Foo { };
        "#;
        assert!(parse(cpp).is_empty());
    }

    #[test]
    fn ignores_forward_declarations() {
        let cpp = r#"
            class Base;
            class Foo: Base {
                hiddenSelections[] = {"camo1"};
            };
        "#;
        let out = parse(cpp);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].name, "Foo");
    }

    #[test]
    fn tolerates_comments_and_macros() {
        let cpp = r#"
            // comment
            #define FOO bar
            /* block
               comment */
            class AKM {
                // inner comment
                hiddenSelections[] = {"camo1"}; // trailing
                hiddenSelectionsMaterials[] = {"dz/ak/ak_material.rvmat"};
            };
        "#;
        let out = parse(cpp);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].name, "AKM");
        assert_eq!(out[0].hidden_selections_materials.len(), 1);
    }

    #[test]
    fn handles_multi_value_arrays() {
        let cpp = r#"
            class PlateCarrierVest {
                hiddenSelections[] = { "camo1", "camo2", "camo3" };
                hiddenSelectionsTextures[] = {
                    "dz/vest/plate_green_co.paa",
                    "dz/vest/plate_side_co.paa",
                    "dz/vest/plate_emblem_co.paa"
                };
            };
        "#;
        let out = parse(cpp);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].hidden_selections.len(), 3);
        assert_eq!(out[0].hidden_selections_textures.len(), 3);
    }
}
