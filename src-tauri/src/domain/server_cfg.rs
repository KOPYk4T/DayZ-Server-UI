//! `serverDZ.cfg` domain — Arma-config-flavoured server configuration
//! (PDR §7 / Phase 7b).
//!
//! We use a **segment-based model** rather than a full Arma-cfg AST.
//! Top-level `key = value;` scalars and `key[] = { … };` arrays are
//! typed and editable; nested `class { … };` blocks and anything we
//! don't understand fully are captured as raw text spans that the
//! writer re-emits verbatim. Comments and blank lines are preserved
//! in order so a round-trip through the editor doesn't rewrite the
//! whole file.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CfgSegment {
    /// Preserved blank line between statements.
    Blank,
    /// A line containing only a `//` comment (or `/* */` comment
    /// spanning a single line). Preserved verbatim.
    #[serde(rename_all = "camelCase")]
    Comment { text: String },
    /// `key = literal;` on a single line. `rawValue` is the exact
    /// text between `=` and `;` (trimmed of surrounding whitespace
    /// but quotes preserved). `valueKind` is a best-effort
    /// classification to help the UI pick an input widget.
    #[serde(rename_all = "camelCase")]
    Scalar {
        key: String,
        raw_value: String,
        value_kind: CfgValueKind,
        leading_comments: Vec<String>,
        trailing_comment: Option<String>,
    },
    /// `key[] = { elem, elem, … };`. Each element is kept as its
    /// raw text form (quotes preserved for strings). Multiline
    /// arrays are flattened to a single logical array on read; on
    /// write we re-emit one element per line when there are >1
    /// elements, otherwise inline.
    #[serde(rename_all = "camelCase")]
    Array {
        key: String,
        elements: Vec<String>,
        leading_comments: Vec<String>,
        trailing_comment: Option<String>,
    },
    /// `class Name { … };` or nested. The body between `{` and `};`
    /// is preserved verbatim (including its own comments and
    /// newlines) because we don't structurally edit class contents
    /// in 7b.
    #[serde(rename_all = "camelCase")]
    ClassBlock {
        name: String,
        /// `class Name : Base { … };` — Arma supports inheritance.
        base: Option<String>,
        /// Full block text INCLUDING the opening `class ... {` line
        /// and the closing `};`. Everything in between is raw.
        raw: String,
        leading_comments: Vec<String>,
    },
    /// Fallback for anything the segmenter can't classify — e.g. a
    /// stray `#include` directive or a malformed statement. Preserved
    /// verbatim as a raw block of lines.
    #[serde(rename_all = "camelCase")]
    Raw { text: String },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum CfgValueKind {
    /// Double-quoted string literal (`"hello"`).
    String,
    /// Integer literal (`60`, `-1`).
    Integer,
    /// Floating-point literal (`0.5`).
    Float,
    /// Bareword / identifier (rare in serverDZ.cfg).
    #[default]
    Ident,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerCfg {
    pub segments: Vec<CfgSegment>,
}
