//! `mapgroupproto.xml` domain — building prototypes and their loot
//! point summaries (PDR §8 / Phase 8a).
//!
//! The source file is potentially huge (10MB+ for vanilla Chernarus)
//! because it lists every `<point pos="x y z"/>` for every container
//! in every building. The admin-relevant information is aggregate:
//! which usage zones and tiers each building *covers*, how many
//! loot points it has, etc. We throw away the individual point
//! coordinates on parse — that saves memory and keeps IPC payloads
//! reasonable. Phase 8b will add `mapgrouppos.xml` (placement) and
//! a tier-coverage heatmap if needed.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildingPrototype {
    /// Enfusion class name, e.g. `Land_House_1W01`.
    pub name: String,
    /// How many `<container>` blocks the prototype has. Each
    /// container is a loot-bearing slot with its own category / tier
    /// filters.
    pub container_count: usize,
    /// Summed `<point>` count across all containers. Ball-park for
    /// "how much loot can this building hold at once" (subject to
    /// CE's per-usage cap).
    pub point_count: usize,
    /// Union of `<category name="…"/>` across all containers.
    pub categories: Vec<String>,
    /// Union of `<tag name="…"/>` across all containers.
    pub tags: Vec<String>,
    /// Union of `<usage name="…"/>` across all containers.
    pub usages: Vec<String>,
    /// Union of `<value name="…"/>` across all containers. Values
    /// are tier names (`Tier1`..`Tier4`).
    pub values: Vec<String>,
    /// Count of times this prototype appears in `mapgrouppos.xml`
    /// — i.e. how many instances of this building are placed on
    /// the map. 0 when mapgrouppos.xml is missing / the prototype
    /// isn't placed anywhere.
    #[serde(default)]
    pub placement_count: usize,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildingsData {
    pub prototypes: Vec<BuildingPrototype>,
    /// Total placements across the map. Same as the sum of
    /// `prototypes[].placement_count` plus placements whose group
    /// didn't match any known prototype (mod buildings).
    #[serde(default)]
    pub total_placements: usize,
    /// Names of placement groups that don't resolve to a prototype
    /// in `prototypes`. Usually mod-added buildings whose proto
    /// lives in a mod PBO and isn't extracted. UI surfaces this as
    /// an informational badge.
    #[serde(default)]
    pub unknown_placement_groups: Vec<String>,
}
