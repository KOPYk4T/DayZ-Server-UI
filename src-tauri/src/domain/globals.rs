//! `globals.xml` domain — DayZ Central Economy global tuning.
//!
//! Lives at `mpmissions/<mission>/db/globals.xml`. A flat list of
//! `<var name="…" type="…" value="…"/>` entries that control
//! server-wide economy behaviour (cleanup timers, login/logout
//! protection, animal / zombie tuning, etc.).
//!
//! DayZ's type attribute conventionally takes three values:
//!   `0` — integer (most entries)
//!   `1` — float
//!   `2` — string
//! We preserve the literal string form of `value` so the writer
//! round-trips formatting exactly (leading zeros, trailing decimals).

use serde::{Deserialize, Serialize};

#[derive(
    Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq,
)]
#[serde(rename_all = "camelCase")]
pub enum GlobalVarType {
    #[default]
    Integer,
    Float,
    String,
}

impl GlobalVarType {
    pub fn from_xml_code(s: &str) -> Self {
        match s.trim() {
            "1" => Self::Float,
            "2" => Self::String,
            _ => Self::Integer,
        }
    }
    pub fn to_xml_code(self) -> &'static str {
        match self {
            Self::Integer => "0",
            Self::Float => "1",
            Self::String => "2",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalVar {
    pub name: String,
    #[serde(rename = "varType")]
    pub var_type: GlobalVarType,
    /// Literal textual value from the XML. The editor may render a
    /// number input based on `var_type`, but we store the string so
    /// formatting round-trips exactly.
    pub value: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Globals {
    pub vars: Vec<GlobalVar>,
}
