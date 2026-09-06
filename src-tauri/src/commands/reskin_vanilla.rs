//! Tauri commands for the vanilla class index (Reskin addon).

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::error::AppResult;
use crate::reskin::config_parser::SkinnableClass;
use crate::reskin::mod_index;
use crate::reskin::registry::{self, ConfigClassEntry, ConfigClassKind};
use crate::reskin::tools;
use crate::reskin::vanilla_index::{
    self, IndexBuildSummary, SkippedAddon, VanillaClassIndex,
};
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VanillaIndexStatus {
    pub cached: bool,
    pub built_at: Option<String>,
    pub addon_count: u32,
    pub class_count: u32,
    pub skipped: Vec<SkippedAddon>,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ClassSource {
    /// Class parsed from vanilla DayZ `.cpp` files on the P: drive.
    Vanilla,
    /// Class the operator authored in the modpack's Config Classes
    /// page (`kind === "new"`). Derived from a vanilla parent, so
    /// selections inherit from there for reskin purposes.
    Modpack,
    /// Class extracted from a third-party mod's PBO via the mod
    /// scanner. Includes both reskinnable items the mod added (new
    /// classes) and ones it customised. The class's `source_mod`
    /// field carries the `@-folder name`.
    Mod,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VanillaClassSummary {
    pub name: String,
    pub parent: Option<String>,
    pub container: Option<String>,
    pub selection_count: u32,
    /// True when the class has at least one hidden-selection slot
    /// that the reskin wizard can target. Animals, some vehicles,
    /// and most script base classes are `false` — they show in the
    /// browser for reference but can't be recoloured through the
    /// reskin flow.
    #[serde(default)]
    pub reskinnable: bool,
    #[serde(default)]
    pub source: Option<ClassSource>,
    /// `@-folder name` when `source == Mod`. Lets the UI render
    /// "AKM (from @ExpansionMod)" so operators can tell where a
    /// reskinnable came from when multiple mod sources contribute
    /// classes with overlapping names.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_mod: Option<String>,
}

#[tauri::command]
pub async fn reskin_vanilla_index_status(
    state: State<'_, AppState>,
) -> AppResult<VanillaIndexStatus> {
    let loaded = vanilla_index::load_index(&state.app_data_dir)?;
    Ok(match loaded {
        Some(idx) => VanillaIndexStatus {
            cached: true,
            built_at: Some(idx.built_at),
            addon_count: idx.addon_count,
            class_count: idx.class_count,
            skipped: idx.skipped,
        },
        None => VanillaIndexStatus {
            cached: false,
            built_at: None,
            addon_count: 0,
            class_count: 0,
            skipped: Vec::new(),
        },
    })
}

#[tauri::command]
pub async fn reskin_vanilla_index_build(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<IndexBuildSummary> {
    let tools_dir = tools::resolve_tools_dir(&app);
    vanilla_index::build_index(&state.app_data_dir, &tools_dir)
}

#[tauri::command]
pub async fn reskin_vanilla_class_list(
    state: State<'_, AppState>,
) -> AppResult<Vec<VanillaClassSummary>> {
    let vanilla = vanilla_index::load_index(&state.app_data_dir)?;
    let reg = registry::load(&state.app_data_dir)?;

    let mut out: Vec<VanillaClassSummary> = Vec::new();
    if let Some(idx) = vanilla.as_ref() {
        for c in &idx.classes {
            let sel = c
                .hidden_selections
                .len()
                .max(c.hidden_selections_textures.len())
                .max(c.hidden_selections_materials.len())
                as u32;
            out.push(VanillaClassSummary {
                name: c.name.clone(),
                parent: c.parent.clone(),
                container: c.containers.last().cloned(),
                selection_count: sel,
                reskinnable: sel > 0,
                source: Some(ClassSource::Vanilla),
                source_mod: None,
            });
        }
    }

    // Merge in modpack classes (kind == New only). Skip names that
    // collide with vanilla — the vanilla shape wins, otherwise
    // picking them as a reskin source would use wrong selections.
    let vanilla_names: std::collections::HashSet<String> = vanilla
        .as_ref()
        .map(|idx| idx.classes.iter().map(|c| c.name.clone()).collect())
        .unwrap_or_default();
    for cc in &reg.config_classes {
        if !matches!(cc.effective_kind(), ConfigClassKind::New) {
            continue;
        }
        if vanilla_names.contains(&cc.classname) {
            continue;
        }
        // A modpack class's selection count mirrors its parent's,
        // since reskinning one means reskinning what the parent
        // exposes. Look the parent up in the vanilla index to carry
        // that count over; fall back to 0 when the parent isn't
        // recognised.
        let sel = vanilla
            .as_ref()
            .and_then(|idx| idx.classes.iter().find(|c| c.name == cc.parent))
            .map(|p| {
                p.hidden_selections
                    .len()
                    .max(p.hidden_selections_textures.len())
                    .max(p.hidden_selections_materials.len()) as u32
            })
            .unwrap_or(0);
        out.push(VanillaClassSummary {
            name: cc.classname.clone(),
            parent: Some(cc.parent.clone()).filter(|p| !p.is_empty()),
            container: Some(cc.container.clone()).filter(|c| !c.is_empty()),
            selection_count: sel,
            reskinnable: sel > 0,
            source: Some(ClassSource::Modpack),
            source_mod: None,
        });
    }

    // Merge in classes scanned from third-party mod PBOs. The mod
    // scanner yields BOTH overrides of vanilla classes and brand-new
    // classes the mod introduced (e.g. a custom AKM variant). On
    // collision with vanilla we prefer vanilla — picking the mod
    // shape would target the mod's selection arrays, which usually
    // match vanilla but in rare cases differ in count/order. On
    // collision with a previously-added modpack class (operator's
    // own) we also prefer the existing entry to avoid surprises.
    let known_names: std::collections::HashSet<String> =
        out.iter().map(|c| c.name.clone()).collect();
    let mod_idx = mod_index::load_index(&state.app_data_dir).unwrap_or_default();
    for src in &mod_idx.sources {
        for c in &src.classes {
            if known_names.contains(&c.name) {
                continue;
            }
            let sel = c
                .hidden_selections
                .len()
                .max(c.hidden_selections_textures.len())
                .max(c.hidden_selections_materials.len()) as u32;
            out.push(VanillaClassSummary {
                name: c.name.clone(),
                parent: c.parent.clone(),
                container: c.containers.last().cloned(),
                selection_count: sel,
                reskinnable: sel > 0,
                source: Some(ClassSource::Mod),
                source_mod: c
                    .source_mod
                    .clone()
                    .or(Some(src.display_name.clone())),
            });
        }
    }

    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

#[tauri::command]
pub async fn reskin_vanilla_class_get(
    name: String,
    state: State<'_, AppState>,
) -> AppResult<Option<SkinnableClass>> {
    // 1. Check the operator's modpack classes first (kind == New).
    //    A user-authored SuperBear inherits its parent's selections,
    //    so we synthesise a SkinnableClass by cloning the parent's
    //    shape and replacing the name + container.
    let reg = registry::load(&state.app_data_dir)?;
    let user_match = reg.config_classes.iter().find(|cc| {
        matches!(cc.effective_kind(), ConfigClassKind::New)
            && cc.classname == name
    });
    let vanilla = vanilla_index::load_index(&state.app_data_dir)?;

    if let Some(cc) = user_match {
        if let Some(idx) = vanilla.as_ref() {
            if let Some(parent) =
                idx.classes.iter().find(|c| c.name == cc.parent)
            {
                return Ok(Some(synthesise_from_parent(cc, parent)));
            }
        }
        // No vanilla parent found — still return something so the UI
        // can show the class; selections list empty, operator won't
        // be able to reskin it without a known parent anyway.
        return Ok(Some(SkinnableClass {
            name: cc.classname.clone(),
            parent: Some(cc.parent.clone()).filter(|p| !p.is_empty()),
            containers: vec![cc.container.clone()],
            hidden_selections: Vec::new(),
            hidden_selections_textures: Vec::new(),
            hidden_selections_materials: Vec::new(),
            source_mod: None,
        }));
    }

    if let Some(idx) = vanilla {
        if let Some(c) = idx.classes.into_iter().find(|c| c.name == name) {
            return Ok(Some(c));
        }
    }

    // Fall back to mod sources. The wizard's "edit selections" path
    // calls this on click; without this branch a class that only
    // exists in a mod returns None and the UI can't open it.
    let mod_idx =
        mod_index::load_index(&state.app_data_dir).unwrap_or_default();
    for src in mod_idx.sources {
        if let Some(c) = src.classes.into_iter().find(|c| c.name == name) {
            return Ok(Some(c));
        }
    }
    Ok(None)
}

/// Build a `SkinnableClass` for a user-authored modpack class that
/// inherits from a known vanilla parent. Keeps the parent's selection
/// arrays (reskinning the derived class means overriding the same
/// slots the parent exposes) but re-writes the name and container so
/// downstream code treats it as a distinct addressable class.
fn synthesise_from_parent(
    cc: &ConfigClassEntry,
    parent: &SkinnableClass,
) -> SkinnableClass {
    SkinnableClass {
        name: cc.classname.clone(),
        parent: Some(cc.parent.clone()),
        containers: if cc.container.is_empty() {
            parent.containers.clone()
        } else {
            vec![cc.container.clone()]
        },
        hidden_selections: parent.hidden_selections.clone(),
        hidden_selections_textures: parent.hidden_selections_textures.clone(),
        hidden_selections_materials: parent.hidden_selections_materials.clone(),
        source_mod: parent.source_mod.clone(),
    }
}

#[tauri::command]
pub async fn reskin_vanilla_index_load(
    state: State<'_, AppState>,
) -> AppResult<Option<VanillaClassIndex>> {
    vanilla_index::load_index(&state.app_data_dir)
}
