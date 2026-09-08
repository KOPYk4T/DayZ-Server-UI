//! Typed domain model shared by parsers, validators, and Tauri commands.
//!
//! Every entity here mirrors a frontend type declared in `src/types/ipc.ts`.
//! Keep the two in sync — the serde attributes define the wire format.

pub mod buildings;
pub mod cfg_gameplay;
pub mod dynamic_event;
pub mod globals;
pub mod item_type;
pub mod limits_definition;
pub mod player_spawn;
pub mod player_spawn_gear;
pub mod random_preset;
pub mod server_cfg;
pub mod spawnable_type;

pub use buildings::{BuildingPrototype, BuildingsData};
pub use dynamic_event::{
    DynamicEvent, EventChild, EventFlags, EventLimit, EventPosition, EventSpawnGroup,
    PositionKind,
};
pub use globals::{GlobalVar, GlobalVarType, Globals};
pub use item_type::{ItemFlags, ItemSource, ItemType};
pub use limits_definition::{LimitFlag, LimitName, LimitsDefinition};
pub use player_spawn::{PlayerSpawnPoints, PosFormat, SpawnPosition};
pub use player_spawn_gear::{
    GearLoadout, PlayerSpawnGear, SpawnEntry, SpawnKit, SpawnKitItem, SpawnKitPocket,
    SpawnKitSlot,
};
pub use random_preset::{PresetItem, PresetKind, RandomPreset};
pub use server_cfg::{CfgSegment, CfgValueKind, ServerCfg};
pub use spawnable_type::{
    AttachmentGroup, CargoGroup, SpawnableItem, SpawnableType,
};
