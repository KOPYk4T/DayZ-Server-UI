//! `cfgrandompresets.xml` — reusable item pools (PDR §5.3).
//!
//! Two flavours: `<cargo>` presets live inside a container's inventory
//! (e.g. "random civilian magazines"), `<attachments>` presets slot on
//! to a weapon / clothing parent (e.g. "random scope variants"). The
//! distinction matters because spawnabletypes reference presets from
//! either an `<attachments>` or `<cargo>` group and should only pull
//! from the matching kind.

use serde::{Deserialize, Serialize};

use crate::domain::ItemSource;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PresetKind {
    #[default]
    Cargo,
    Attachments,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetItem {
    pub name: String,
    #[serde(default = "default_one")]
    pub chance: f64,
}

fn default_one() -> f64 {
    1.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RandomPreset {
    pub name: String,
    pub kind: PresetKind,
    /// Base chance that the preset is used when referenced. 0.0–1.0.
    #[serde(default = "default_one")]
    pub chance: f64,
    #[serde(default)]
    pub items: Vec<PresetItem>,
    #[serde(default)]
    pub source: ItemSource,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mod_id: Option<String>,
    #[serde(default)]
    pub file: String,
}

impl RandomPreset {
    pub fn minimal(name: impl Into<String>, kind: PresetKind) -> Self {
        Self {
            name: name.into(),
            kind,
            chance: 1.0,
            items: Vec::new(),
            source: ItemSource::Custom,
            mod_id: None,
            file: String::new(),
        }
    }
}
