//! `cfggameplay.json` — mission-side gameplay tuning knobs.
//!
//! Lives at `mpmissions/<map>/cfggameplay.json`. Covers sprint stamina
//! curves, base-building collision checks, drowning speeds, hit
//! indicators, map privacy, vehicle decay, etc. Every shipped section
//! is typed below; every UNKNOWN field passes through opaquely via
//! `[extra: string]: unknown` indexes so mod-added and future Bohemia
//! fields survive editing untouched.
//!
//! Reference: Bohemia wiki, DayZ 1.29 mission template.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::error::{AppError, AppResult};

// ---------- Stamina / player movement ----------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct StaminaData {
    #[serde(rename = "sprintStaminaModifierErc", skip_serializing_if = "Option::is_none")]
    pub sprint_erc: Option<f64>,
    #[serde(rename = "sprintStaminaModifierCro", skip_serializing_if = "Option::is_none")]
    pub sprint_cro: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stamina_weight_limit_threshold: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stamina_max: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stamina_kg_to_stamina_percent_penalty: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stamina_min_cap: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sprint_swimming_stamina_modifier: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sprint_ladder_stamina_modifier: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub melee_stamina_modifier: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub obstacle_traversal_stamina_modifier: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hold_breath_stamina_modifier: Option<f64>,
    /// Any field not explicitly modelled above — preserved on save.
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ShockHandlingData {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shock_refill_speed_conscious: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shock_refill_speed_unconscious: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allow_refill_speed_modifier: Option<bool>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MovementData {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_to_strafe_jog: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rotation_speed_jog: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_to_sprint: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_to_strafe_sprint: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rotation_speed_sprint: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allow_stamina_affect_inertia: Option<bool>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DrowningData {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stamina_depletion_speed: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub health_depletion_speed: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shock_depletion_speed: Option<f64>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WeaponObstructionData {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub static_mode: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dynamic_mode: Option<i64>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PlayerData {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disable_personal_light: Option<bool>,
    #[serde(rename = "StaminaData", skip_serializing_if = "Option::is_none")]
    pub stamina_data: Option<StaminaData>,
    #[serde(rename = "ShockHandlingData", skip_serializing_if = "Option::is_none")]
    pub shock_handling_data: Option<ShockHandlingData>,
    #[serde(rename = "MovementData", skip_serializing_if = "Option::is_none")]
    pub movement_data: Option<MovementData>,
    #[serde(rename = "DrowningData", skip_serializing_if = "Option::is_none")]
    pub drowning_data: Option<DrowningData>,
    #[serde(rename = "WeaponObstructionData", skip_serializing_if = "Option::is_none")]
    pub weapon_obstruction_data: Option<WeaponObstructionData>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

// ---------- General / worlds / base building / UI / map / vehicle ----------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct GeneralData {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disable_base_damage: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disable_container_damage: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disable_respawn_dialog: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disable_respawn_in_unconsciousness: Option<bool>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WorldsData {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lighting_config: Option<i64>,
    /// Scripts that run when the world boots. Array of classnames.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub object_spawners_arr: Option<Vec<String>>,
    /// 12 values, one per month. Typical vanilla shape.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub environment_min_temps: Option<Vec<f64>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub environment_max_temps: Option<Vec<f64>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wetness_weight_modifiers: Option<Vec<f64>>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct HologramData {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disable_is_colliding_bbox_check: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disable_is_colliding_player_check: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disable_is_clipping_roof_check: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disable_is_base_viable_check: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disable_is_colliding_g_plot_check: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disable_is_colliding_angle_check: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disable_is_placement_permitted_check: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disable_height_placement_check: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disable_is_underwater_check: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disable_is_in_terrain_check: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disable_cold_area_building_check: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disallowed_types_in_underground: Option<Vec<String>>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ConstructionData {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disable_perform_roof_check: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disable_is_colliding_check: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disable_distance_check: Option<bool>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct BaseBuildingData {
    #[serde(rename = "HologramData", skip_serializing_if = "Option::is_none")]
    pub hologram_data: Option<HologramData>,
    #[serde(rename = "ConstructionData", skip_serializing_if = "Option::is_none")]
    pub construction_data: Option<ConstructionData>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct HitIndicationData {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hit_direction_override_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hit_direction_behaviour: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hit_direction_style: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hit_direction_indicator_color_str: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hit_direction_max_duration: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hit_direction_break_point_relative: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hit_direction_scatter: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hit_indication_post_process_enabled: Option<bool>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct UIData {
    #[serde(rename = "use3DMap", skip_serializing_if = "Option::is_none")]
    pub use_3d_map: Option<bool>,
    #[serde(rename = "HitIndicationData", skip_serializing_if = "Option::is_none")]
    pub hit_indication_data: Option<HitIndicationData>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MapData {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ignore_map_ownership: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ignore_nav_items_ownership: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_player_position: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_nav_info: Option<bool>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct VehicleData {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub boat_decay_multiplier: Option<f64>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

// ---------- Root ----------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct CfgGameplay {
    /// Bohemia's file-format version. Kept so we round-trip instead
    /// of silently writing an outdated number on save.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<i64>,
    #[serde(rename = "GeneralData", skip_serializing_if = "Option::is_none")]
    pub general_data: Option<GeneralData>,
    #[serde(rename = "PlayerData", skip_serializing_if = "Option::is_none")]
    pub player_data: Option<PlayerData>,
    #[serde(rename = "WorldsData", skip_serializing_if = "Option::is_none")]
    pub worlds_data: Option<WorldsData>,
    #[serde(rename = "BaseBuildingData", skip_serializing_if = "Option::is_none")]
    pub base_building_data: Option<BaseBuildingData>,
    #[serde(rename = "UIData", skip_serializing_if = "Option::is_none")]
    pub ui_data: Option<UIData>,
    #[serde(rename = "MapData", skip_serializing_if = "Option::is_none")]
    pub map_data: Option<MapData>,
    #[serde(rename = "VehicleData", skip_serializing_if = "Option::is_none")]
    pub vehicle_data: Option<VehicleData>,
    /// Anything not modelled explicitly above — future Bohemia
    /// sections, mod-added ones, everything. Preserved on save so
    /// editing never silently drops fields we haven't caught up to.
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl CfgGameplay {
    pub fn parse(raw: &str) -> AppResult<Self> {
        serde_json::from_str(raw).map_err(|e| {
            AppError::Internal(format!("parse cfggameplay.json: {e}"))
        })
    }

    /// Serialize with tab indentation (matches Bohemia's shipped
    /// formatting — tabs, not spaces — so git diffs stay small).
    pub fn to_json(&self) -> AppResult<String> {
        let value = serde_json::to_value(self)
            .map_err(|e| AppError::Internal(format!("serialize cfggameplay.json: {e}")))?;
        let formatter = serde_json::ser::PrettyFormatter::with_indent(b"\t");
        let mut buf = Vec::new();
        let mut ser = serde_json::Serializer::with_formatter(&mut buf, formatter);
        value.serialize(&mut ser).map_err(|e| {
            AppError::Internal(format!("serialize cfggameplay.json: {e}"))
        })?;
        let mut s = String::from_utf8(buf).map_err(|e| {
            AppError::Internal(format!("serialize cfggameplay.json: {e}"))
        })?;
        if !s.ends_with('\n') {
            s.push('\n');
        }
        Ok(s)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{
    "version": 123,
    "GeneralData": {
        "disableBaseDamage": false,
        "disableContainerDamage": false
    },
    "PlayerData": {
        "StaminaData": {
            "staminaMax": 100.0,
            "sprintStaminaModifierErc": 1.0,
            "obstacleTraversalStaminaModifier": 1.0
        }
    },
    "WorldsData": {
        "environmentMinTemps": [-3, -2, 0, 4, 9, 14, 18, 17, 13, 11, 9, 0]
    },
    "ModAddedSection": {
        "someModSpecificField": true
    }
}
"#;

    #[test]
    fn parse_round_trips_known_fields() {
        let parsed = CfgGameplay::parse(SAMPLE).unwrap();
        assert_eq!(parsed.version, Some(123));
        assert_eq!(
            parsed.general_data.as_ref().and_then(|g| g.disable_base_damage),
            Some(false),
        );
        assert_eq!(
            parsed
                .player_data
                .as_ref()
                .and_then(|p| p.stamina_data.as_ref())
                .and_then(|s| s.stamina_max),
            Some(100.0),
        );
        assert_eq!(
            parsed
                .worlds_data
                .as_ref()
                .and_then(|w| w.environment_min_temps.as_ref())
                .map(|v| v.len()),
            Some(12),
        );
    }

    #[test]
    fn parse_preserves_unknown_top_level_sections() {
        let parsed = CfgGameplay::parse(SAMPLE).unwrap();
        assert!(parsed.extra.contains_key("ModAddedSection"));
        let out = parsed.to_json().unwrap();
        assert!(
            out.contains("ModAddedSection"),
            "mod-added section dropped on save:\n{out}",
        );
        assert!(out.contains("someModSpecificField"));
    }

    #[test]
    fn round_trip_preserves_unknown_nested_fields() {
        // A cfggameplay.json with a PlayerData.StaminaData field we
        // don't model (e.g. a future Bohemia knob). Must round-trip.
        let src = r#"{
    "PlayerData": {
        "StaminaData": {
            "staminaMax": 100.0,
            "someFutureField": "hello"
        }
    }
}
"#;
        let parsed = CfgGameplay::parse(src).unwrap();
        let out = parsed.to_json().unwrap();
        assert!(out.contains("someFutureField"), "nested unknown dropped:\n{out}");
        assert!(out.contains("hello"));
    }

    #[test]
    fn empty_object_parses_cleanly() {
        let parsed = CfgGameplay::parse("{}").unwrap();
        assert!(parsed.version.is_none());
        assert!(parsed.general_data.is_none());
    }

    #[test]
    fn serialize_uses_tab_indent_like_bohemia() {
        let parsed = CfgGameplay::parse(r#"{"version": 123}"#).unwrap();
        let out = parsed.to_json().unwrap();
        assert!(out.contains("\t\"version\""), "tabs not used:\n{out}");
    }

    /// Locked-in regression against the real vanilla Chernarus+ 1.29
    /// `cfggameplay.json`. Every top-level section must round-trip,
    /// and the output must still contain key fields that DayZ reads.
    #[test]
    fn parses_real_vanilla_chernarus_sample() {
        let Ok(src) = std::fs::read_to_string("../examples/cfggameplay.json")
        else {
            // Sample not checked in — fine, skip.
            return;
        };
        let parsed = CfgGameplay::parse(&src).unwrap();
        assert!(parsed.version.is_some());
        assert!(parsed.player_data.is_some());
        assert!(parsed.worlds_data.is_some());
        assert!(parsed.base_building_data.is_some());
        assert!(parsed.ui_data.is_some());

        let out = parsed.to_json().unwrap();
        // Spot check key fields survive the round-trip.
        for fragment in [
            "\"StaminaData\"",
            "\"staminaMax\"",
            "\"HologramData\"",
            "\"HitIndicationData\"",
            "\"environmentMinTemps\"",
        ] {
            assert!(
                out.contains(fragment),
                "vanilla fragment {fragment} missing from round-trip:\n{out}",
            );
        }
    }
}
