//! `events.xml` → DynamicEvent domain type (PDR §5.3).
//!
//! An event defines a dynamic economy population rule: helicopters,
//! police cars, shipwrecks, wolves, infected hordes, etc. Each event
//! can "spawn" a set of **children** (classnames of the primary object
//! and any loot containers) either at fixed map positions (listed in
//! `cfgeventspawns.xml`) or at random coordinates.

use serde::{Deserialize, Serialize};

use crate::domain::ItemSource;

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub struct EventFlags {
    pub deletable: u8,
    pub init_random: u8,
    pub remove_damaged: u8,
}

/// Values accepted by DayZ for `<position>` in `events.xml`.
///
/// - `fixed` — spawn positions are in `cfgeventspawns.xml`.
/// - `random` — random location per spawn.
/// - `player` — spawns around each player (infected hordes).
/// - `uniform` — uniform distribution across the map.
///
/// Historical bug: we only modelled Fixed + Random and silently
/// mapped every other value to Fixed on load, then wrote it back
/// as `fixed`. That silently rewrites vanilla `<position>player</position>`
/// on infected events into `fixed`, which DayZ then crashes on
/// during CE load because there are no fixed positions for those
/// events. All four variants are first-class now.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PositionKind {
    #[default]
    Fixed,
    Random,
    Player,
    Uniform,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EventLimit {
    #[default]
    Mixed,
    Child,
    Parent,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EventChild {
    #[serde(default)]
    pub lootmax: i64,
    #[serde(default)]
    pub lootmin: i64,
    #[serde(default)]
    pub max: i64,
    #[serde(default)]
    pub min: i64,
    /// Classname reference — must resolve in the merged items registry
    /// for the server to actually spawn something here.
    #[serde(rename = "type")]
    pub type_name: String,
}

impl EventChild {
    pub fn blank() -> Self {
        Self {
            lootmax: 1,
            lootmin: 1,
            max: 1,
            min: 1,
            type_name: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DynamicEvent {
    /// Event name (unique key).
    pub name: String,
    #[serde(default)]
    pub nominal: i64,
    #[serde(default)]
    pub min: i64,
    #[serde(default)]
    pub max: i64,
    #[serde(default)]
    pub lifetime: i64,
    #[serde(default)]
    pub restock: i64,
    #[serde(default)]
    pub saferadius: i64,
    #[serde(default)]
    pub distanceradius: i64,
    #[serde(default)]
    pub cleanupradius: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub secondary: Option<String>,
    #[serde(default)]
    pub flags: EventFlags,
    #[serde(default)]
    pub position: PositionKind,
    #[serde(default)]
    pub limit: EventLimit,
    /// 0 or 1. Kept as i64 because future DayZ versions may extend the enum.
    #[serde(default)]
    pub active: i64,
    #[serde(default)]
    pub children: Vec<EventChild>,
    /// `<extended><childrenEx>…</childrenEx></extended>` — optional
    /// mod-added extension seen in some cargo-style events.
    #[serde(default)]
    pub children_ex: Vec<EventChild>,

    #[serde(default)]
    pub source: ItemSource,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mod_id: Option<String>,
    /// Workspace-relative authoritative file path, slash-joined. Empty
    /// for items not yet persisted.
    #[serde(default)]
    pub file: String,
}

impl DynamicEvent {
    pub fn minimal(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            nominal: 1,
            min: 1,
            max: 1,
            lifetime: 900,
            restock: 0,
            saferadius: 500,
            distanceradius: 1000,
            cleanupradius: 400,
            secondary: None,
            flags: EventFlags {
                deletable: 1,
                init_random: 0,
                remove_damaged: 1,
            },
            position: PositionKind::Fixed,
            limit: EventLimit::Mixed,
            active: 1,
            children: Vec::new(),
            children_ex: Vec::new(),
            source: ItemSource::Custom,
            mod_id: None,
            file: String::new(),
        }
    }
}

// ---------- cfgeventspawns.xml companion ----------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EventPosition {
    pub x: f64,
    /// Terrain elevation. DayZ's CE **requires** `y` on vehicle
    /// events (it uses it to ground-clamp on spawn); stripping it
    /// on round-trip crashes the server on boot. Kept as a plain
    /// f64 with a 0.0 default so legacy files without `y=` still
    /// parse; writers always emit it.
    #[serde(default)]
    pub y: f64,
    pub z: f64,
    /// Yaw in degrees; -1 = random on spawn.
    #[serde(default = "default_angle")]
    pub a: f64,
    /// Optional group tag (rarely used, mostly in Livonia/Sakhal).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
}

fn default_angle() -> f64 {
    -1.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventSpawnGroup {
    /// Event name; must match a `DynamicEvent.name`.
    pub event_name: String,
    #[serde(default)]
    pub positions: Vec<EventPosition>,
    /// Source + provenance, same as DynamicEvent.
    #[serde(default)]
    pub source: ItemSource,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mod_id: Option<String>,
    #[serde(default)]
    pub file: String,
}
