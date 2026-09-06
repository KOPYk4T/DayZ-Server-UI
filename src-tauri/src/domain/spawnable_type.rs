//! `cfgspawnabletypes.xml` — per-container loadouts (PDR §5.3, §9.3).
//!
//! Each `<type name="X">` entry says "when CE spawns a `X`, fill it
//! with this." Loadouts are split into `<attachments>` groups (for
//! weapon slots, clothing slots — directly attached items) and `<cargo>`
//! groups (items in the container's inventory).
//!
//! Each group carries a `chance` (the group itself rolls to decide
//! whether to try filling its slot at all), a list of items, and
//! optionally references a random preset by name instead of spelling
//! the items inline.

use serde::{Deserialize, Serialize};

use crate::domain::ItemSource;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnableItem {
    /// Classname reference. Empty when `preset` is set.
    #[serde(default)]
    pub name: String,
    /// 0.0–1.0 probability.
    #[serde(default = "default_one")]
    pub chance: f64,
    /// Random-preset reference. When set, the preset's items are rolled
    /// as a pool; `name` can stay empty.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preset: Option<String>,
}

fn default_one() -> f64 {
    1.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentGroup {
    pub chance: f64,
    /// Documentation hint for the slot (optic / mag / buttstock / …).
    /// CE ignores it; the value is for human readers of the XML.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub slot_name: Option<String>,
    #[serde(default)]
    pub items: Vec<SpawnableItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CargoGroup {
    pub chance: f64,
    #[serde(default)]
    pub items: Vec<SpawnableItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnableType {
    /// Parent classname — the container / weapon / vehicle / wreck the
    /// loadout applies to. Must resolve to an entry in types.xml for
    /// the loadout to actually fire.
    pub name: String,
    /// `hoarder="1"` in the XML — some vanilla entries mark themselves
    /// as hoarder items so CE counts them differently.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub hoarder: bool,
    #[serde(default)]
    pub attachments: Vec<AttachmentGroup>,
    #[serde(default)]
    pub cargo: Vec<CargoGroup>,
    #[serde(default)]
    pub source: ItemSource,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mod_id: Option<String>,
    #[serde(default)]
    pub file: String,
}

impl SpawnableType {
    pub fn minimal(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            hoarder: false,
            attachments: Vec::new(),
            cargo: Vec::new(),
            source: ItemSource::Custom,
            mod_id: None,
            file: String::new(),
        }
    }
}
