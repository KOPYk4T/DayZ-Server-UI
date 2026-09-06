//! `cfglimitsdefinition.xml` → LimitsDefinition (PDR §5.3, §9.4).
//!
//! Declares the valid set of categories, tags, usage-flags, and
//! value-flags (tiers) that every `types.xml` entry is allowed to
//! reference. If a type uses a usage tag CE can't find here, that item
//! is effectively invisible to the building-loot spawn system.
//!
//! Unlike types / events / spawnabletypes, this file is a **singleton**
//! — DayZ has no `<ce folder="…"><file type="limits"/></ce>`
//! mechanism for merging overrides. Edits go directly into the file.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LimitName {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LimitFlag {
    pub name: String,
    /// Bitmask used by the CE at runtime for efficient flag checks.
    /// Optional because some mod / legacy files omit it — CE still loads
    /// the entry and assigns an implicit value.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LimitsDefinition {
    pub categories: Vec<LimitName>,
    pub tags: Vec<LimitName>,
    pub usageflags: Vec<LimitFlag>,
    pub valueflags: Vec<LimitFlag>,
}

impl LimitsDefinition {
    pub fn category_names(&self) -> impl Iterator<Item = &str> {
        self.categories.iter().map(|c| c.name.as_str())
    }
    pub fn tag_names(&self) -> impl Iterator<Item = &str> {
        self.tags.iter().map(|t| t.name.as_str())
    }
    pub fn usage_names(&self) -> impl Iterator<Item = &str> {
        self.usageflags.iter().map(|u| u.name.as_str())
    }
    pub fn value_names(&self) -> impl Iterator<Item = &str> {
        self.valueflags.iter().map(|v| v.name.as_str())
    }
}
