//! `cfgplayerspawnpoints.xml` → PlayerSpawnPoints (PDR §5.3, §9.6).
//!
//! Three spawn kinds: `fresh` (new character), `hop` (cross-server),
//! `travel` (map transition). DayZ supports multiple "generators"
//! per kind — `generator_posbubbles`, `generator_deviate`,
//! `generator_random` — but vanilla Chernarus / Livonia / Sakhal
//! only use `posbubbles` in practice. We surface that list and warn
//! the UI if the file contains generator kinds we don't edit.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SpawnPosition {
    pub x: f64,
    pub z: f64,
    /// Yaw in degrees. 0 = facing north in DayZ's convention.
    #[serde(default)]
    pub a: f64,
}

/// Which entry-element form the source file uses inside
/// `<generator_posbubbles>`. DayZ has two historical variants and we
/// must write back in the same one we read, otherwise the server can
/// fail to pick spawns up.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PosFormat {
    /// Modern vanilla: `<pos_bubble pos="x z" z_rot="yaw" smart="0" rad="10" ver="7.9"/>`.
    #[default]
    PosBubble,
    /// Older / alternative: `<pos x="…" z="…" a="…"/>`.
    Pos,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSpawnPoints {
    /// Fresh (new character) spawn bubbles.
    pub fresh: Vec<SpawnPosition>,
    /// Hop (cross-server join) spawn bubbles.
    pub hop: Vec<SpawnPosition>,
    /// Travel (map transition) spawn bubbles.
    pub travel: Vec<SpawnPosition>,
    /// True when the source file contained generator kinds other than
    /// `generator_posbubbles` (e.g. `generator_deviate`, `generator_random`).
    /// When true, the UI must warn the user that a save from here
    /// strips those blocks — we don't currently round-trip them.
    #[serde(default)]
    pub has_unsupported_generators: bool,
    /// Entry-element form to emit on save; detected from the source
    /// file so round-trips don't silently rewrite the file shape.
    #[serde(default)]
    pub pos_format: PosFormat,
}
