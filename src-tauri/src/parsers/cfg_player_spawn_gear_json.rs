//! `cfgPlayerSpawnGear.json` parser (PDR §9.7 / Phase 6a).
//!
//! The file's schema has drifted across DayZ versions and mods
//! extend it further. Strategy: decode the top-level structure
//! permissively (every field `#[serde(default)]`, common alias
//! names accepted), then recursively walk each loadout's
//! item-pool subtrees as `serde_json::Value` to collect
//! classnames without caring about exact field names. This lets
//! the reader survive schema drift — worst case, an unknown
//! shape shows up with empty items but the rest of the loadout
//! still renders.

use std::path::Path;

use serde::Deserialize;
use serde_json::{json, Value};

use crate::domain::{
    GearLoadout, PlayerSpawnGear, SpawnEntry, SpawnKit, SpawnKitItem, SpawnKitPocket,
    SpawnKitSlot,
};
use crate::error::{AppError, AppResult};

// ---------- Raw schema (permissive) ----------

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
struct RawFile {
    version: Option<String>,
    #[serde(alias = "Loadouts")]
    loadouts: Vec<RawLoadout>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct RawLoadout {
    #[serde(alias = "character_types", alias = "CharacterTypes")]
    character_types: Vec<String>,
    // Attachment slot entries may appear under any of these names
    // depending on DayZ version. All get treated as attachment slots.
    #[serde(
        alias = "discrete_set",
        alias = "attachments",
        alias = "attachmentSlots",
        alias = "attachment_slots",
        alias = "DiscreteSet"
    )]
    discrete_set: Vec<Value>,
    cargo: Vec<Value>,
}

// ---------- Public API ----------

pub fn parse_file(path: &Path) -> AppResult<PlayerSpawnGear> {
    let bytes = std::fs::read(path)?;
    parse_bytes(&bytes).map_err(|e| {
        AppError::Internal(format!("parsing {}: {e}", path.display()))
    })
}

pub fn parse_bytes(bytes: &[u8]) -> Result<PlayerSpawnGear, String> {
    let value: Value =
        serde_json::from_slice(bytes).map_err(|e| e.to_string())?;
    if looks_like_spawn_preset(&value) {
        let loadout = parse_spawn_preset_value(&value)?;
        return Ok(PlayerSpawnGear {
            version: None,
            loadouts: vec![loadout],
        });
    }
    let raw: RawFile =
        serde_json::from_value(value).map_err(|e| e.to_string())?;
    let loadouts = raw
        .loadouts
        .into_iter()
        .map(convert_loadout)
        .collect();
    Ok(PlayerSpawnGear {
        version: raw.version,
        loadouts,
    })
}

/// DayZ 1.24+ preset from `cfggameplay.json` →
/// `PlayerData.spawnGearPresetFiles`. One file = one loadout.
/// Slots live under `attachmentSlotItemSets`; cargo under
/// `discreteUnsortedItemSets`. Classnames are `itemType`.
fn looks_like_spawn_preset(v: &Value) -> bool {
    v.get("attachmentSlotItemSets").is_some()
        || v.get("discreteUnsortedItemSets").is_some()
}

#[derive(Debug, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct RawSpawnPreset {
    character_types: Vec<String>,
    attachment_slot_item_sets: Vec<RawSlotSet>,
    discrete_unsorted_item_sets: Vec<Value>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct RawSlotSet {
    slot_name: String,
    discrete_item_sets: Vec<Value>,
}

fn parse_spawn_preset_value(v: &Value) -> Result<GearLoadout, String> {
    let raw: RawSpawnPreset =
        serde_json::from_value(v.clone()).map_err(|e| e.to_string())?;
    let attachment_entries: Vec<SpawnEntry> = raw
        .attachment_slot_item_sets
        .into_iter()
        .map(|slot| {
            let label = if slot.slot_name.is_empty() {
                "(unnamed slot)".into()
            } else {
                slot.slot_name
            };
            let mut items = Vec::new();
            for set in &slot.discrete_item_sets {
                collect_classnames(set, &mut items);
            }
            dedup_items(&mut items);
            SpawnEntry {
                label,
                chance: 1.0,
                items,
            }
        })
        .collect();
    let cargo_entries: Vec<SpawnEntry> = raw
        .discrete_unsorted_item_sets
        .iter()
        .map(|set| {
            let label = set
                .get("name")
                .and_then(|x| x.as_str())
                .filter(|s| !s.is_empty())
                .unwrap_or("cargo")
                .to_string();
            let mut items = Vec::new();
            collect_classnames(set, &mut items);
            dedup_items(&mut items);
            SpawnEntry {
                label,
                chance: 1.0,
                items,
            }
        })
        .collect();

    let mut seen = std::collections::HashSet::new();
    let mut classnames = Vec::new();
    for e in attachment_entries.iter().chain(cargo_entries.iter()) {
        for n in &e.items {
            if seen.insert(n.clone()) {
                classnames.push(n.clone());
            }
        }
    }

    Ok(GearLoadout {
        character_types: raw.character_types,
        attachment_entries,
        cargo_entries,
        classnames,
    })
}

fn dedup_items(items: &mut Vec<String>) {
    let mut seen = std::collections::HashSet::new();
    items.retain(|s| seen.insert(s.clone()));
}

fn convert_loadout(l: RawLoadout) -> GearLoadout {
    let attachment_entries: Vec<SpawnEntry> = l
        .discrete_set
        .iter()
        .map(|v| convert_entry(v, default_slot_label(v)))
        .collect();
    let cargo_entries: Vec<SpawnEntry> =
        l.cargo.iter().map(|v| convert_entry(v, "cargo".into())).collect();

    // Dedup classnames across all entries for this loadout. Keep
    // insertion order so the UI shows deterministic lists.
    let mut seen = std::collections::HashSet::new();
    let mut classnames = Vec::new();
    for e in attachment_entries.iter().chain(cargo_entries.iter()) {
        for n in &e.items {
            if seen.insert(n.clone()) {
                classnames.push(n.clone());
            }
        }
    }

    GearLoadout {
        character_types: l.character_types,
        attachment_entries,
        cargo_entries,
        classnames,
    }
}

/// Build a SpawnEntry from an arbitrary JSON value. Picks a chance
/// and recursively harvests classnames out of any `children` /
/// `type` / `items` arrays regardless of nesting depth.
fn convert_entry(v: &Value, label: String) -> SpawnEntry {
    let chance = extract_chance(v);
    let mut items = Vec::new();
    collect_classnames(v, &mut items);
    // Dedup in place preserving order.
    let mut seen = std::collections::HashSet::new();
    items.retain(|s| seen.insert(s.clone()));
    SpawnEntry {
        label,
        chance,
        items,
    }
}

fn default_slot_label(v: &Value) -> String {
    for key in [
        "slotName",
        "slot_name",
        "slotID",
        "slotId",
        "name",
    ] {
        if let Some(s) = v.get(key).and_then(|x| x.as_str()) {
            if !s.is_empty() {
                return s.to_string();
            }
        }
    }
    "(unnamed slot)".into()
}

fn extract_chance(v: &Value) -> f64 {
    v.get("chance")
        .and_then(|x| x.as_f64())
        .unwrap_or(1.0)
}

/// Recursive walk that pulls every classname out of the tree.
///
/// Rules:
/// - `children: [...]` — every string in the array gets pushed.
/// - `type: "Classname"` — single string gets pushed.
/// - Any other key is recursed into so we find nested pools (mods
///   sometimes stack `complexChildrenTypes` inside `items` inside
///   another `complexChildrenTypes`). Plain strings at arbitrary
///   positions are NOT pushed, so slot names / labels don't leak
///   into the classname list.
fn collect_classnames(v: &Value, out: &mut Vec<String>) {
    match v {
        Value::Array(arr) => {
            for x in arr {
                collect_classnames(x, out);
            }
        }
        Value::Object(map) => {
            for (k, val) in map {
                match k.as_str() {
                    "children" => {
                        if let Value::Array(arr) = val {
                            for x in arr {
                                if let Value::String(s) = x {
                                    out.push(s.clone());
                                }
                            }
                        }
                    }
                    // `type` = older cfgPlayerSpawnGear.json.
                    // `itemType` = cfggameplay spawnGearPresetFiles
                    // (SurvivorPreset.json and friends).
                    "type" | "itemType" => {
                        if let Value::String(s) = val {
                            out.push(s.clone());
                        }
                    }
                    _ => {}
                }
                // Always recurse too, so nested children pools are
                // found regardless of container name.
                collect_classnames(val, out);
            }
        }
        _ => {}
    }
}

// ---------- Writer ----------

/// Serialize the typed `PlayerSpawnGear` domain back to the modern
/// camelCase JSON shape DayZ 1.18+ expects.
///
/// **Lossy for mod extensions.** Fields not represented in the
/// typed domain are stripped — this is a deliberate tradeoff for
/// Phase 6b so the editor surface stays simple. Users with heavily
/// mod-extended files should back up before saving; a round-trip
/// via this writer will emit only the standard fields.
pub fn serialize(model: &PlayerSpawnGear) -> AppResult<String> {
    let loadouts: Vec<Value> = model
        .loadouts
        .iter()
        .map(serialize_loadout)
        .collect();
    let doc = json!({
        "version": model.version.as_deref().unwrap_or("1.0"),
        "loadouts": loadouts,
    });
    serde_json::to_string_pretty(&doc)
        .map(|s| format!("{s}\n"))
        .map_err(|e| AppError::Internal(format!("serializing cfgPlayerSpawnGear: {e}")))
}

pub fn write(path: &Path, model: &PlayerSpawnGear) -> AppResult<()> {
    let text = serialize(model)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, text)?;
    Ok(())
}

fn serialize_loadout(l: &GearLoadout) -> Value {
    json!({
        "characterTypes": l.character_types,
        "discreteSet": l.attachment_entries.iter().map(serialize_attachment_entry).collect::<Vec<_>>(),
        "cargo": l.cargo_entries.iter().map(serialize_cargo_entry).collect::<Vec<_>>(),
    })
}

fn serialize_attachment_entry(e: &SpawnEntry) -> Value {
    json!({
        "slotName": e.label,
        "chance": round_chance(e.chance),
        "complexChildrenTypes": [{
            "chance": 1.0,
            "children": e.items,
        }],
    })
}

fn serialize_cargo_entry(e: &SpawnEntry) -> Value {
    json!({
        "chance": round_chance(e.chance),
        "complexChildrenTypes": [{
            "chance": 1.0,
            "children": e.items,
        }],
    })
}

/// Clamp / round chance so it renders with a reasonable number of
/// decimals in the output file (no `0.3000000000000001`).
fn round_chance(c: f64) -> f64 {
    let clamped = c.clamp(0.0, 1.0);
    (clamped * 1000.0).round() / 1000.0
}

fn round_attr(v: f64) -> f64 {
    (v * 1000.0).round() / 1000.0
}

fn item_from_value(v: &Value) -> Option<SpawnKitItem> {
    let item_type = v.get("itemType")?.as_str()?.to_string();
    if item_type.is_empty() {
        return None;
    }
    let attrs = v.get("attributes");
    let num = |key: &str, default: f64| {
        attrs
            .and_then(|a| a.get(key))
            .and_then(|x| x.as_f64())
            .unwrap_or(default)
    };
    Some(SpawnKitItem {
        item_type,
        spawn_weight: v.get("spawnWeight").and_then(|x| x.as_i64()).unwrap_or(1),
        health_min: num("healthMin", 1.0),
        health_max: num("healthMax", 1.0),
        quantity_min: num("quantityMin", 1.0),
        quantity_max: num("quantityMax", 1.0),
        quick_bar_slot: v.get("quickBarSlot").and_then(|x| x.as_i64()).unwrap_or(-1),
    })
}

fn item_to_value(item: &SpawnKitItem) -> Value {
    json!({
        "itemType": item.item_type,
        "spawnWeight": item.spawn_weight.max(1),
        "attributes": {
            "healthMin": round_attr(item.health_min),
            "healthMax": round_attr(item.health_max),
            "quantityMin": round_attr(item.quantity_min),
            "quantityMax": round_attr(item.quantity_max),
        },
        "quickBarSlot": item.quick_bar_slot,
        "simpleChildrenUseDefaultAttributes": false,
        "simpleChildrenTypes": [],
        "complexChildrenTypes": [],
    })
}

/// Parse one `spawnPresets/*.json` into the editable kit model.
pub fn parse_spawn_kit_file(path: &Path, rel_path: String) -> AppResult<SpawnKit> {
    let bytes = std::fs::read(path)?;
    let v: Value = serde_json::from_slice(&bytes).map_err(|e| {
        AppError::Internal(format!("parsing {}: {e}", path.display()))
    })?;
    let name = v
        .get("name")
        .and_then(|x| x.as_str())
        .unwrap_or("SurvivorPreset")
        .to_string();
    let spawn_weight = v.get("spawnWeight").and_then(|x| x.as_i64()).unwrap_or(1);
    let character_types = v
        .get("characterTypes")
        .and_then(|x| x.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    let worn = v
        .get("attachmentSlotItemSets")
        .and_then(|x| x.as_array())
        .map(|arr| {
            arr.iter()
                .map(|slot| {
                    let slot_name = slot
                        .get("slotName")
                        .and_then(|x| x.as_str())
                        .unwrap_or("")
                        .to_string();
                    let items = slot
                        .get("discreteItemSets")
                        .and_then(|x| x.as_array())
                        .map(|sets| sets.iter().filter_map(item_from_value).collect())
                        .unwrap_or_default();
                    SpawnKitSlot { slot_name, items }
                })
                .collect()
        })
        .unwrap_or_default();
    let pockets = v
        .get("discreteUnsortedItemSets")
        .and_then(|x| x.as_array())
        .map(|arr| {
            arr.iter()
                .map(|set| {
                    let name = set
                        .get("name")
                        .and_then(|x| x.as_str())
                        .unwrap_or("Cargo")
                        .to_string();
                    let spawn_weight =
                        set.get("spawnWeight").and_then(|x| x.as_i64()).unwrap_or(1);
                    let items = set
                        .get("complexChildrenTypes")
                        .and_then(|x| x.as_array())
                        .map(|kids| kids.iter().filter_map(item_from_value).collect())
                        .unwrap_or_default();
                    SpawnKitPocket {
                        name,
                        spawn_weight,
                        items,
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(SpawnKit {
        rel_path,
        name,
        spawn_weight,
        character_types,
        worn,
        pockets,
    })
}

pub fn write_spawn_kit_file(path: &Path, kit: &SpawnKit) -> AppResult<()> {
    let doc = json!({
        "spawnWeight": kit.spawn_weight.max(1),
        "name": kit.name,
        "characterTypes": kit.character_types,
        "attachmentSlotItemSets": kit.worn.iter().map(|slot| {
            json!({
                "slotName": slot.slot_name,
                "discreteItemSets": slot.items.iter().map(item_to_value).collect::<Vec<_>>(),
            })
        }).collect::<Vec<_>>(),
        "discreteUnsortedItemSets": kit.pockets.iter().map(|pocket| {
            json!({
                "name": pocket.name,
                "spawnWeight": pocket.spawn_weight.max(1),
                "attributes": {
                    "healthMin": 1.0,
                    "healthMax": 1.0,
                    "quantityMin": 1.0,
                    "quantityMax": 1.0,
                },
                "quickBarSlot": -1,
                "simpleChildrenUseDefaultAttributes": false,
                "simpleChildrenTypes": [],
                "complexChildrenTypes": pocket.items.iter().map(item_to_value).collect::<Vec<_>>(),
            })
        }).collect::<Vec<_>>(),
    });
    let text = serde_json::to_string_pretty(&doc)
        .map(|s| format!("{s}\n"))
        .map_err(|e| AppError::Internal(format!("serializing spawn preset: {e}")))?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, text)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_VANILLA: &str = r#"{
  "version": "1.0",
  "loadouts": [
    {
      "characterTypes": ["SurvivorM_Mirek", "SurvivorF_Linda"],
      "discreteSet": [
        {
          "slotName": "Head",
          "chance": 0.5,
          "complexChildrenTypes": [
            { "chance": 1.0, "children": ["Shemag_Red", "Shemag_Blue"] }
          ]
        }
      ],
      "cargo": [
        {
          "chance": 0.25,
          "complexChildrenTypes": [
            { "chance": 1.0, "children": ["Rag", "Matchbox"] }
          ]
        }
      ]
    }
  ]
}"#;

    #[test]
    fn parses_vanilla_shape() {
        let g = parse_bytes(SAMPLE_VANILLA.as_bytes()).unwrap();
        assert_eq!(g.version.as_deref(), Some("1.0"));
        assert_eq!(g.loadouts.len(), 1);
        let l = &g.loadouts[0];
        assert_eq!(l.character_types, vec!["SurvivorM_Mirek", "SurvivorF_Linda"]);
        assert_eq!(l.attachment_entries.len(), 1);
        assert_eq!(l.attachment_entries[0].label, "Head");
        assert_eq!(l.attachment_entries[0].chance, 0.5);
        assert_eq!(
            l.attachment_entries[0].items,
            vec!["Shemag_Red", "Shemag_Blue"]
        );
        assert_eq!(l.cargo_entries.len(), 1);
        assert_eq!(l.cargo_entries[0].label, "cargo");
        assert_eq!(l.cargo_entries[0].items, vec!["Rag", "Matchbox"]);
        // classnames = union, dedup'd, order preserved from first appearance.
        assert_eq!(
            l.classnames,
            vec!["Shemag_Red", "Shemag_Blue", "Rag", "Matchbox"]
        );
    }

    #[test]
    fn accepts_snake_case_alias() {
        let src = r#"{
          "version": "1.0",
          "loadouts": [
            {
              "character_types": ["SurvivorM_Boris"],
              "attachments": [
                { "slot_name": "Body", "chance": 1.0,
                  "items": [{ "chance": 1.0, "children": ["GorkaJacket_Autumn"] }] }
              ],
              "cargo": []
            }
          ]
        }"#;
        let g = parse_bytes(src.as_bytes()).unwrap();
        assert_eq!(g.loadouts[0].attachment_entries.len(), 1);
        assert_eq!(g.loadouts[0].attachment_entries[0].label, "Body");
        assert_eq!(
            g.loadouts[0].attachment_entries[0].items,
            vec!["GorkaJacket_Autumn"]
        );
    }

    #[test]
    fn tolerates_unknown_mod_fields() {
        // Mod-authored file with extra fields everywhere.
        let src = r#"{
          "version": "2.0-modA",
          "modMetadata": { "author": "someone" },
          "loadouts": [
            {
              "characterTypes": ["SurvivorM_Oleg"],
              "debugLabel": "winter set",
              "discreteSet": [
                {
                  "slotName": "Back",
                  "chance": 0.8,
                  "quickbarSlot": "",
                  "extraModField": [1, 2, 3],
                  "complexChildrenTypes": [
                    { "chance": 1.0, "children": ["SmershBackpack"] }
                  ]
                }
              ],
              "cargo": []
            }
          ]
        }"#;
        let g = parse_bytes(src.as_bytes()).unwrap();
        assert_eq!(g.loadouts[0].attachment_entries[0].items, vec!["SmershBackpack"]);
    }

    #[test]
    fn missing_slot_name_falls_back_to_unnamed() {
        let src = r#"{
          "loadouts": [{
            "characterTypes": ["SurvivorM_Denis"],
            "discreteSet": [{
              "chance": 1.0,
              "complexChildrenTypes": [
                { "chance": 1.0, "children": ["Armband_White"] }
              ]
            }],
            "cargo": []
          }]
        }"#;
        let g = parse_bytes(src.as_bytes()).unwrap();
        assert_eq!(g.loadouts[0].attachment_entries[0].label, "(unnamed slot)");
    }

    #[test]
    fn empty_file_returns_empty_loadouts() {
        let g = parse_bytes(b"{}").unwrap();
        assert!(g.loadouts.is_empty());
        assert!(g.version.is_none());
    }

    #[test]
    fn parses_cfggameplay_spawn_preset() {
        let src = r#"{
          "spawnWeight": 1,
          "name": "SurvivorPreset",
          "characterTypes": [],
          "attachmentSlotItemSets": [
            {
              "slotName": "Body",
              "discreteItemSets": [
                { "itemType": "Hoodie_Black", "spawnWeight": 1 },
                { "itemType": "Hoodie_Red", "spawnWeight": 1 }
              ]
            }
          ],
          "discreteUnsortedItemSets": [
            {
              "name": "Cargo1",
              "complexChildrenTypes": [
                { "itemType": "Flaregun" },
                { "itemType": "Ammo_Flare" }
              ]
            }
          ]
        }"#;
        let g = parse_bytes(src.as_bytes()).unwrap();
        assert_eq!(g.loadouts.len(), 1);
        let l = &g.loadouts[0];
        assert_eq!(l.attachment_entries[0].label, "Body");
        assert_eq!(
            l.attachment_entries[0].items,
            vec!["Hoodie_Black", "Hoodie_Red"]
        );
        assert_eq!(l.cargo_entries[0].label, "Cargo1");
        assert_eq!(l.cargo_entries[0].items, vec!["Flaregun", "Ammo_Flare"]);
        assert!(l.classnames.contains(&"Flaregun".to_string()));
    }

    #[test]
    fn round_trip_preserves_core_fields() {
        let g = parse_bytes(SAMPLE_VANILLA.as_bytes()).unwrap();
        let out = serialize(&g).unwrap();
        let again = parse_bytes(out.as_bytes()).unwrap();
        assert_eq!(again.version.as_deref(), Some("1.0"));
        assert_eq!(again.loadouts.len(), 1);
        let l = &again.loadouts[0];
        assert_eq!(l.character_types, vec!["SurvivorM_Mirek", "SurvivorF_Linda"]);
        assert_eq!(l.attachment_entries.len(), 1);
        assert_eq!(l.attachment_entries[0].label, "Head");
        assert!((l.attachment_entries[0].chance - 0.5).abs() < f64::EPSILON);
        assert_eq!(
            l.attachment_entries[0].items,
            vec!["Shemag_Red", "Shemag_Blue"],
        );
        assert_eq!(l.cargo_entries.len(), 1);
        assert_eq!(l.cargo_entries[0].items, vec!["Rag", "Matchbox"]);
    }

    #[test]
    fn handles_nested_pool_structure() {
        // Some mod variants nest complexChildrenTypes inside items.
        let src = r#"{
          "loadouts": [{
            "characterTypes": ["SurvivorM_Jose"],
            "cargo": [{
              "chance": 1.0,
              "items": [{
                "chance": 0.5,
                "children": ["Apple", "Pear"],
                "complexChildrenTypes": [
                  { "chance": 1.0, "children": ["CanOpener"] }
                ]
              }]
            }]
          }]
        }"#;
        let g = parse_bytes(src.as_bytes()).unwrap();
        let items = &g.loadouts[0].cargo_entries[0].items;
        assert!(items.contains(&"Apple".to_string()));
        assert!(items.contains(&"Pear".to_string()));
        assert!(items.contains(&"CanOpener".to_string()));
    }
}
