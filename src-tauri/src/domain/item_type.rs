//! Represents a single `<type>` element in `types.xml` (PDR §5.3).
//!
//! The XML wire format is handled by `parsers::types_xml`. This type is the
//! canonical in-memory / IPC shape.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub struct ItemFlags {
    pub count_in_cargo: u8,
    pub count_in_hoarder: u8,
    pub count_in_map: u8,
    pub count_in_player: u8,
    pub crafted: u8,
    pub deloot: u8,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ItemSource {
    Vanilla,
    Mod,
    Custom,
}

impl Default for ItemSource {
    fn default() -> Self { ItemSource::Vanilla }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemType {
    pub name: String,
    #[serde(default)]
    pub nominal: i64,
    #[serde(default)]
    pub lifetime: i64,
    #[serde(default)]
    pub restock: i64,
    #[serde(default)]
    pub min: i64,
    #[serde(default = "default_neg_one")]
    pub quantmin: i64,
    #[serde(default = "default_neg_one")]
    pub quantmax: i64,
    #[serde(default)]
    pub cost: i64,
    #[serde(default)]
    pub flags: ItemFlags,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub usage: Vec<String>,
    #[serde(default)]
    pub value: Vec<String>,
    #[serde(default)]
    pub source: ItemSource,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mod_id: Option<String>,
    /// Where the authoritative XML lives. Empty string for items that exist only in memory.
    /// Workspace-relative, forward-slash-separated path.
    #[serde(default)]
    pub file: String,
}

fn default_neg_one() -> i64 { -1 }

impl ItemType {
    pub fn minimal(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            nominal: 0,
            lifetime: 14_400,
            restock: 1_800,
            min: 0,
            quantmin: -1,
            quantmax: -1,
            cost: 100,
            flags: ItemFlags {
                count_in_cargo: 0,
                count_in_hoarder: 0,
                count_in_map: 1,
                count_in_player: 0,
                crafted: 0,
                deloot: 0,
            },
            category: None,
            tags: Vec::new(),
            usage: Vec::new(),
            value: Vec::new(),
            source: ItemSource::Custom,
            mod_id: None,
            file: String::new(),
        }
    }

    /// "Disable" a type without deleting it — PDR §9.1 Disable action.
    /// Produces an override that zeros out spawn participation.
    pub fn disabled(name: impl Into<String>) -> Self {
        let mut it = Self::minimal(name);
        it.nominal = 0;
        it.min = 0;
        it.lifetime = 3_600;
        it
    }
}
