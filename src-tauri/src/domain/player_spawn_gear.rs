//! `cfgPlayerSpawnGear.json` → PlayerSpawnGear (PDR §9.7 / Phase 6).
//!
//! DayZ's starting-gear config. Decides what items a freshly-spawned
//! character carries. Matched to a loadout by `characterTypes` (e.g.
//! `SurvivorM_Mirek`, `SurvivorF_Linda`). The file format has drifted
//! across DayZ versions — mods often add their own fields too — so
//! we parse permissively: the top-level structure is typed, but the
//! item-pool recursion uses `serde_json::Value` walking to tolerate
//! unknown shapes.

use serde::{Deserialize, Serialize};

/// Flattened view of one entry inside a loadout — either an
/// attachment-slot or a cargo group. The frontend renders these
/// directly as rows.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnEntry {
    /// For attachment slots: the slot name ("Head", "Body", etc.).
    /// For cargo: the literal string "cargo".
    pub label: String,
    /// Chance 0..1. Merged up from `complexChildrenTypes[*].chance`
    /// when the top-level entry doesn't carry one.
    pub chance: f64,
    /// Every classname referenced anywhere under this entry. May
    /// repeat across entries when nested pools overlap.
    pub items: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GearLoadout {
    /// Character classnames this loadout matches against. Empty means
    /// "default" (applied when no other loadout matches).
    pub character_types: Vec<String>,
    pub attachment_entries: Vec<SpawnEntry>,
    pub cargo_entries: Vec<SpawnEntry>,
    /// Unique union of every item classname referenced by this
    /// loadout's attachments + cargo.
    pub classnames: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSpawnGear {
    /// Header `version` field, if present in the source JSON.
    pub version: Option<String>,
    pub loadouts: Vec<GearLoadout>,
}

/// Editable DayZ 1.24+ spawn preset (`spawnPresets/*.json`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnKit {
    /// Workspace-relative path, e.g. `mpmissions/…/spawnPresets/SurvivorPreset.json`.
    pub rel_path: String,
    pub name: String,
    pub spawn_weight: i64,
    pub character_types: Vec<String>,
    pub worn: Vec<SpawnKitSlot>,
    pub pockets: Vec<SpawnKitPocket>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnKitSlot {
    pub slot_name: String,
    pub items: Vec<SpawnKitItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnKitPocket {
    pub name: String,
    pub spawn_weight: i64,
    pub items: Vec<SpawnKitItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnKitItem {
    pub item_type: String,
    pub spawn_weight: i64,
    pub health_min: f64,
    pub health_max: f64,
    pub quantity_min: f64,
    pub quantity_max: f64,
    pub quick_bar_slot: i64,
}
