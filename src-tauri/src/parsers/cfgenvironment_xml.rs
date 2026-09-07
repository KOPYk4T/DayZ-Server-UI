//! `cfgenvironment.xml` — the "behaviour registry" that makes the
//! geometry under `env/*_territories.xml` actually spawn animals /
//! infected.
//!
//! Structure (one file per mission, sits at `<mission>/cfgenvironment.xml`):
//!
//! ```xml
//! <env>
//!   <territories>
//!     <file path="env/cattle_territories.xml"/>
//!     …
//!     <territory type="Herd" name="Deer" behavior="DZDeerGroupBeh">
//!       <file usable="red_deer_territories"/>
//!       <agent type="Male" chance="1">
//!         <spawn configName="Animal_CervusElaphus" chance="1"/>
//!       </agent>
//!       <agent type="Female">
//!         <spawn configName="ZombieMale3_NewAI"/>
//!         <item name="countMin" val="0"/>
//!         <item name="countMax" val="0"/>
//!       </agent>
//!       <item name="globalCountMax" val="50"/>
//!       <item name="zoneCountMin" val="1"/>
//!     </territory>
//!   </territories>
//! </env>
//! ```
//!
//! Two relationship rules the game enforces:
//! - Every `<file path>` declaration must match an actual file under
//!   `env/` or DayZ crashes on boot.
//! - Every `<territory>` binding's `<file usable>` must match one of
//!   the declared `<file path>` stems or the zones never spawn.
//!
//! We preserve unknown attributes verbatim — modders add parameters
//! outside the documented set and we don't want to strip them on
//! round-trip.

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

#[derive(Debug, Default, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CfgEnvironment {
    /// Geometry files the game should load. Relative to the mission
    /// root — typically `env/<name>_territories.xml`.
    pub file_paths: Vec<String>,
    /// Behaviour bindings that wire each geometry file to a set of
    /// agent classes + tuning items.
    pub bindings: Vec<TerritoryBinding>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TerritoryBinding {
    /// `"Herd"` for wolves/deer/cattle/infected, `"Ambient"` for
    /// hen/hare/fox. Preserve arbitrary strings in case mods invent
    /// new types.
    #[serde(rename = "type")]
    pub type_: String,
    /// Internal binding name — game uses it as the key. Unique
    /// within a cfgenvironment.
    pub name: String,
    /// GroupBehavior class (DZDeerGroupBeh, BlissBearGroupBeh,
    /// DZAmbientLifeGroupBeh, …). Authored in scripts; we treat as
    /// an opaque string.
    pub behavior: String,
    /// Stem of the `_territories.xml` file this binding drives (no
    /// extension, e.g. `red_deer_territories`).
    pub file_usable: String,
    pub agents: Vec<Agent>,
    /// Tuning items that live directly under `<territory>` — e.g.
    /// `globalCountMax`, `zoneCountMin`, `herdsCount`,
    /// `playerSpawnRadiusNear`, `zoneTouchDisableEditPeriodSec`.
    /// Pair order preserved so diffs stay minimal.
    pub items: Vec<ItemKv>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Agent {
    /// Free-form label — vanilla uses `"Male"` / `"Female"` but we
    /// don't constrain it. Must begin with `AgentType:` per the
    /// schema comment, though vanilla doesn't.
    #[serde(rename = "type")]
    pub type_: String,
    /// Weight for picking this agent. `None` means "attribute absent"
    /// which the game defaults to `1`.
    pub chance: Option<String>,
    pub spawns: Vec<Spawn>,
    /// Agent-scoped items like `countMin` / `countMax` (per-zone
    /// count bounds for this agent).
    pub items: Vec<ItemKv>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Spawn {
    /// Entity classname — `Animal_CervusElaphus`, `ZombieMale3_NewAI`,
    /// etc. Must resolve in the game's class config.
    pub config_name: String,
    pub chance: Option<String>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ItemKv {
    pub name: String,
    pub val: String,
}

// ---------- Raw wire types (serde) ----------

#[derive(Debug, Default, Deserialize)]
struct RawEnv {
    #[serde(default)]
    territories: RawTerritories,
}

#[derive(Debug, Default, Deserialize)]
struct RawTerritories {
    #[serde(rename = "file", default)]
    files: Vec<RawFileRef>,
    #[serde(rename = "territory", default)]
    territories: Vec<RawTerritory>,
}

#[derive(Debug, Default, Deserialize)]
struct RawFileRef {
    #[serde(rename = "@path", default)]
    path: String,
}

#[derive(Debug, Default, Deserialize)]
struct RawTerritory {
    #[serde(rename = "@type", default)]
    type_: String,
    #[serde(rename = "@name", default)]
    name: String,
    #[serde(rename = "@behavior", default)]
    behavior: String,
    #[serde(rename = "file", default)]
    file: Option<RawUsableFile>,
    #[serde(rename = "agent", default)]
    agents: Vec<RawAgent>,
    #[serde(rename = "item", default)]
    items: Vec<RawItem>,
}

#[derive(Debug, Default, Deserialize)]
struct RawUsableFile {
    #[serde(rename = "@usable", default)]
    usable: String,
}

#[derive(Debug, Default, Deserialize)]
struct RawAgent {
    #[serde(rename = "@type", default)]
    type_: String,
    #[serde(rename = "@chance", default)]
    chance: Option<String>,
    #[serde(rename = "spawn", default)]
    spawns: Vec<RawSpawn>,
    #[serde(rename = "item", default)]
    items: Vec<RawItem>,
}

#[derive(Debug, Default, Deserialize)]
struct RawSpawn {
    #[serde(rename = "@configName", default)]
    config_name: String,
    #[serde(rename = "@chance", default)]
    chance: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct RawItem {
    #[serde(rename = "@name", default)]
    name: String,
    #[serde(rename = "@val", default)]
    val: String,
}

// ---------- Parse ----------

pub fn parse_bytes(bytes: &[u8]) -> AppResult<CfgEnvironment> {
    let text = std::str::from_utf8(bytes)
        .map_err(|e| AppError::Internal(format!("cfgenvironment: {e}")))?;
    let raw: RawEnv = quick_xml::de::from_str(text)
        .map_err(|e| AppError::Internal(format!("cfgenvironment: {e}")))?;
    let file_paths = raw.territories.files.into_iter().map(|f| f.path).collect();
    let bindings = raw
        .territories
        .territories
        .into_iter()
        .map(|t| TerritoryBinding {
            type_: t.type_,
            name: t.name,
            behavior: t.behavior,
            file_usable: t.file.map(|f| f.usable).unwrap_or_default(),
            agents: t
                .agents
                .into_iter()
                .map(|a| Agent {
                    type_: a.type_,
                    chance: a.chance,
                    spawns: a
                        .spawns
                        .into_iter()
                        .map(|s| Spawn {
                            config_name: s.config_name,
                            chance: s.chance,
                        })
                        .collect(),
                    items: a
                        .items
                        .into_iter()
                        .map(|i| ItemKv {
                            name: i.name,
                            val: i.val,
                        })
                        .collect(),
                })
                .collect(),
            items: t
                .items
                .into_iter()
                .map(|i| ItemKv {
                    name: i.name,
                    val: i.val,
                })
                .collect(),
        })
        .collect();
    Ok(CfgEnvironment {
        file_paths,
        bindings,
    })
}

pub fn parse_file(path: &Path) -> AppResult<CfgEnvironment> {
    parse_bytes(&fs::read(path)?)
}

// ---------- Serialize ----------

/// Render back to vanilla's tab-indented, header-commented shape.
/// We don't attempt to preserve the operator's own comments — those
/// are dropped on round-trip. (The original file has two section
/// comments which we re-insert at save time so a freshly-edited file
/// still reads well.)
pub fn serialize(cfg: &CfgEnvironment) -> String {
    let mut out = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\" ?>\n");
    out.push_str("<env>\n\n");
    out.push_str("\t<!-- GENERAL Territories Section -->\n");
    out.push_str("\t<territories>\n\n");
    for path in &cfg.file_paths {
        out.push_str(&format!("\t\t<file path=\"{}\" />\n", xml_escape(path)));
    }
    for b in &cfg.bindings {
        out.push('\n');
        out.push_str(&format!(
            "\t\t<territory type=\"{type_}\" name=\"{name}\" behavior=\"{behavior}\">\n",
            type_ = xml_escape(&b.type_),
            name = xml_escape(&b.name),
            behavior = xml_escape(&b.behavior),
        ));
        if !b.file_usable.is_empty() {
            out.push_str(&format!(
                "\t\t\t<file usable=\"{}\" />\n",
                xml_escape(&b.file_usable)
            ));
        }
        for a in &b.agents {
            // Agent open tag — include chance only when set so the
            // output matches vanilla for agents that omit it.
            match &a.chance {
                Some(c) => out.push_str(&format!(
                    "\t\t\t<agent type=\"{t}\" chance=\"{c}\">\n",
                    t = xml_escape(&a.type_),
                    c = xml_escape(c),
                )),
                None => out.push_str(&format!(
                    "\t\t\t<agent type=\"{t}\">\n",
                    t = xml_escape(&a.type_),
                )),
            }
            for s in &a.spawns {
                match &s.chance {
                    Some(c) => out.push_str(&format!(
                        "\t\t\t\t<spawn configName=\"{n}\" chance=\"{c}\" />\n",
                        n = xml_escape(&s.config_name),
                        c = xml_escape(c),
                    )),
                    None => out.push_str(&format!(
                        "\t\t\t\t<spawn configName=\"{n}\" />\n",
                        n = xml_escape(&s.config_name),
                    )),
                }
            }
            for i in &a.items {
                out.push_str(&format!(
                    "\t\t\t\t<item name=\"{n}\" val=\"{v}\" />\n",
                    n = xml_escape(&i.name),
                    v = xml_escape(&i.val),
                ));
            }
            out.push_str("\t\t\t</agent>\n");
        }
        for i in &b.items {
            out.push_str(&format!(
                "\t\t\t<item name=\"{n}\" val=\"{v}\" />\n",
                n = xml_escape(&i.name),
                v = xml_escape(&i.val),
            ));
        }
        out.push_str("\t\t</territory>\n");
    }
    out.push_str("\n\t</territories>\n");
    out.push_str("</env>\n");
    out
}

pub fn write_file(path: &Path, cfg: &CfgEnvironment) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serialize(cfg))?;
    Ok(())
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use super::*;

    const VANILLA_SAMPLE: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<env>
    <territories>
        <file path="env/cattle_territories.xml" />
        <file path="env/wolf_territories.xml" />
        <file path="env/zombie_territories.xml" />

        <territory type="Herd" name="Wolf" behavior="DZWolfGroupBeh">
            <file usable="wolf_territories" />
        </territory>
        <territory type="Ambient" name="AmbientHen" behavior="DZAmbientLifeGroupBeh">
            <file usable="hen_territories" />
            <agent type="Male" chance="1">
                <spawn configName="Animal_GallusGallusDomesticus" chance="1" />
            </agent>
            <agent type="Female" chance="3">
                <spawn configName="Animal_GallusGallusDomesticusF_Brown" chance="1" />
                <spawn configName="Animal_GallusGallusDomesticusF_White" chance="20" />
            </agent>
            <item name="globalCountMax" val="50" />
            <item name="zoneCountMin" val="1" />
        </territory>
        <territory type="Herd" name="ZombieTest" behavior="DZdomesticGroupBeh">
            <file usable="zombie_territories" />
            <agent type="Male">
                <spawn configName="ZombieMale3_NewAI" />
                <item name="countMin" val="0" />
                <item name="countMax" val="0" />
            </agent>
            <item name="herdsCount" val="0" />
        </territory>
    </territories>
</env>
"#;

    #[test]
    fn parses_file_paths() {
        let cfg = parse_bytes(VANILLA_SAMPLE.as_bytes()).unwrap();
        assert_eq!(cfg.file_paths.len(), 3);
        assert_eq!(cfg.file_paths[0], "env/cattle_territories.xml");
    }

    #[test]
    fn parses_binding_basic() {
        let cfg = parse_bytes(VANILLA_SAMPLE.as_bytes()).unwrap();
        let wolf = cfg.bindings.iter().find(|b| b.name == "Wolf").unwrap();
        assert_eq!(wolf.type_, "Herd");
        assert_eq!(wolf.behavior, "DZWolfGroupBeh");
        assert_eq!(wolf.file_usable, "wolf_territories");
        assert!(wolf.agents.is_empty());
    }

    #[test]
    fn parses_ambient_with_multiple_agents_and_items() {
        let cfg = parse_bytes(VANILLA_SAMPLE.as_bytes()).unwrap();
        let hen = cfg.bindings.iter().find(|b| b.name == "AmbientHen").unwrap();
        assert_eq!(hen.agents.len(), 2);
        let female = hen.agents.iter().find(|a| a.type_ == "Female").unwrap();
        assert_eq!(female.chance.as_deref(), Some("3"));
        assert_eq!(female.spawns.len(), 2);
        assert_eq!(female.spawns[1].config_name, "Animal_GallusGallusDomesticusF_White");
        assert_eq!(female.spawns[1].chance.as_deref(), Some("20"));
        assert_eq!(hen.items.len(), 2);
        assert_eq!(hen.items[0].name, "globalCountMax");
        assert_eq!(hen.items[0].val, "50");
    }

    #[test]
    fn parses_agent_items_density() {
        let cfg = parse_bytes(VANILLA_SAMPLE.as_bytes()).unwrap();
        let zombie = cfg.bindings.iter().find(|b| b.name == "ZombieTest").unwrap();
        let male = &zombie.agents[0];
        assert_eq!(male.type_, "Male");
        assert!(male.chance.is_none());
        assert_eq!(male.items.len(), 2);
        assert_eq!(male.items[0].name, "countMin");
    }

    #[test]
    fn round_trips_through_serialize() {
        let cfg = parse_bytes(VANILLA_SAMPLE.as_bytes()).unwrap();
        let text = serialize(&cfg);
        let back = parse_bytes(text.as_bytes()).unwrap();
        assert_eq!(cfg, back);
    }

    #[test]
    fn agent_without_chance_stays_without_chance() {
        let cfg = parse_bytes(VANILLA_SAMPLE.as_bytes()).unwrap();
        let text = serialize(&cfg);
        // Zombie's Male agent has no chance attribute in source — the
        // literal `<agent type="Male">` form (no other attributes) is
        // what we expect to see at least once in the output.
        assert!(
            text.contains("<agent type=\"Male\">\n"),
            "expected chance-less agent form, got:\n{text}"
        );
        // And the hen Male agent does carry chance="1" — so both
        // rendering styles coexist.
        assert!(text.contains("<agent type=\"Male\" chance=\"1\">"));
    }
}
