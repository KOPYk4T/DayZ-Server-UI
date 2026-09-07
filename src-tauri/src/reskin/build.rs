//! Reskin build pipeline.
//!
//! Orchestrates the full happy path from wizard state → signed PBO
//! ready to drop into a server mod tree:
//!
//! 1. Stage the mod folder under `<app-data>/reskin/builds/<modName>/`.
//! 2. For each image-override slot: copy or shell `ImageToPAA` to
//!    produce `<stem>_<selection>_co.paa` in the addon's `data/`.
//!    Procedural (colour) overrides need no file step — they land
//!    in the config directly.
//! 3. Emit `config.cpp` with a minimal `CfgPatches` block and the
//!    cloned class under the original container. The generated
//!    `hiddenSelectionsTextures[]` merges image paths, procedural
//!    strings, and vanilla passthroughs in the right slot order.
//! 4. Shell `MakePbo` against the addon folder → produces
//!    `<addon>.pbo` next to it.
//! 5. Sign with `DSSignFile` using the first `.biprivatekey` next
//!    to the resolved signer (DayZ Tools / Locate / bundled);
//!    copy the matching `.bikey` into `keys/` so public servers
//!    that enforce signatures accept it.
//!
//! The caller receives a log of each step so the UI can surface a
//! timeline + final summary.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::time::Instant;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

use super::config_parser::SkinnableClass;
use super::registry::{
    ConfigClassEntry, ConfigClassKind, ExternalPboEntry, ReskinEntry, ReskinRegistry,
};
use super::tools;

// ---------- Wire types ----------

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ReskinMode {
    Coexist,
    Replace,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProceduralColor {
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub a: f32,
    #[serde(default)]
    pub r#type: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReskinBuildResult {
    pub mod_path: String,
    pub pbo_path: String,
    pub addon_name: String,
    pub classes_written: Vec<String>,
    pub textures_converted: u32,
    pub signed: bool,
    pub duration_ms: u64,
    /// Path to the types.xml the build emitted alongside the mod.
    /// Picked up by the existing "Import mod CE files" flow so the
    /// reskin shows up in the Items list after importing.
    pub types_xml_path: String,
    /// Count of user-supplied `.pbo` files copied into
    /// `<mod>/addons/` alongside the auto-packed one.
    #[serde(default)]
    pub external_pbos_copied: u32,
    /// Count of author-written config class blocks appended to the
    /// generated `config.cpp`.
    #[serde(default)]
    pub config_classes_written: u32,
    pub notes: Vec<String>,
    pub log: Vec<String>,
}

// ---------- Entry point ----------

/// Build the operator's reskin mod from the persistent registry. One
/// PBO containing every registered class. Safe to re-run — the build
/// dir is wiped on each invocation so stale textures or classes can't
/// survive after a delete in the UI.
pub fn build_from_registry(
    app_data_dir: &Path,
    tools_dir: &Path,
    registry: &ReskinRegistry,
) -> AppResult<ReskinBuildResult> {
    let started = Instant::now();
    let mut log: Vec<String> = Vec::new();
    let mut notes: Vec<String> = Vec::new();

    // Validation. Modpack builds are valid when the registry has ANY
    // content — a reskin, a config-class override, or an external PBO
    // on its own all produce a useful mod.
    let included_external: Vec<&ExternalPboEntry> = registry
        .external_pbos
        .iter()
        .filter(|e| e.include)
        .collect();
    if registry.reskins.is_empty()
        && registry.config_classes.is_empty()
        && included_external.is_empty()
    {
        return Err(AppError::Internal(
            "modpack is empty — add a reskin, a config class, or an external PBO before building"
                .into(),
        ));
    }
    let mod_name = registry.mod_name.trim();
    if !is_valid_mod_name(mod_name) {
        return Err(AppError::Internal(format!(
            "invalid mod folder name: {mod_name}"
        )));
    }
    for entry in &registry.reskins {
        if !is_valid_classname(&entry.new_classname) {
            return Err(AppError::Internal(format!(
                "invalid classname in registry: {}",
                entry.new_classname
            )));
        }
        if entry.new_classname.eq_ignore_ascii_case(&entry.source.name) {
            return Err(AppError::Internal(format!(
                "reskin `{}` has the same classname as its source",
                entry.new_classname
            )));
        }
    }

    // Resolve tool paths (Locate → bundled → DayZ Tools).
    let image_to_paa = tools::image_to_paa_exe_resolved(app_data_dir, tools_dir);
    let make_pbo = tools::make_pbo_exe_resolved(app_data_dir, tools_dir);
    let ds_sign = tools::ds_sign_file_exe_resolved(app_data_dir, tools_dir);
    for (name, path) in [
        ("ImageToPAA.exe", &image_to_paa),
        ("MakePbo.exe", &make_pbo),
    ] {
        if !path.is_file() {
            return Err(AppError::Internal(format!(
                "{name} missing at {}",
                path.display()
            )));
        }
    }

    let addon_name = snake_case(mod_name.trim_start_matches('@'));
    let mod_root = app_data_dir
        .join("reskin")
        .join("builds")
        .join(mod_name);
    let addons_dir = mod_root.join("addons");
    let addon_src = addons_dir.join(&addon_name);
    let addon_data = addon_src.join("data");
    let keys_dir = mod_root.join("keys");

    // Clean existing build so stale files don't survive a rebuild.
    if mod_root.exists() {
        std::fs::remove_dir_all(&mod_root)?;
        log.push(format!("cleaned previous build at {}", mod_root.display()));
    }
    std::fs::create_dir_all(&addon_data)?;
    std::fs::create_dir_all(&keys_dir)?;
    log.push(format!("staged {}", mod_root.display()));

    // Walk every entry, convert textures, and collect the per-slot
    // output strings the config.cpp emitter needs.
    let mut textures_converted = 0u32;
    let mut compiled: Vec<CompiledEntry> = Vec::with_capacity(registry.reskins.len());
    for entry in &registry.reskins {
        let mut slot_emits: Vec<SlotEmit> = Vec::new();
        for s in &entry.slots {
            if let Some(sf) = s.source_file.as_deref() {
                let src = PathBuf::from(sf);
                if !src.is_file() {
                    return Err(AppError::Internal(format!(
                        "override source not found for `{}` slot {}: {}",
                        entry.new_classname,
                        s.slot_index,
                        src.display()
                    )));
                }
                let rel_data = format!(
                    "{stem}_{slot}_co.paa",
                    stem = snake_case(&entry.new_classname),
                    slot = safe_slot_name(&s.selection, s.slot_index)
                );
                let dst_paa = addon_data.join(&rel_data);
                convert_to_paa(&image_to_paa, &src, &dst_paa, &mut log)?;
                textures_converted += 1;
                slot_emits.push(SlotEmit {
                    slot_index: s.slot_index,
                    selection: s.selection.clone(),
                    texture_ref: format!("{addon_name}\\data\\{rel_data}"),
                });
            } else if let Some(color) = s.source_color.as_ref() {
                slot_emits.push(SlotEmit {
                    slot_index: s.slot_index,
                    selection: s.selection.clone(),
                    texture_ref: format_procedural(color),
                });
            }
        }
        compiled.push(CompiledEntry {
            entry: entry.clone(),
            slot_emits,
        });
    }

    // Compute extra `requiredAddons[]` from any mod-sourced reskins.
    // When a reskin's source class came from a third-party mod (e.g.
    // an Expansion AKM variant), DayZ must load that mod before our
    // override addon resolves — otherwise the parent class is
    // unknown and the engine refuses to load the patch. We look the
    // mod's CfgPatches identifiers up via the mod_index cache.
    let extra_required = collect_required_addons(app_data_dir, &compiled);

    // Emit the aggregated config.cpp. Reskin blocks + user-authored
    // config classes land in the same file, grouped by container.
    let config_text = emit_config(
        &addon_name,
        &compiled,
        &registry.config_classes,
        &extra_required,
    );
    let cfg_path = addon_src.join("config.cpp");
    std::fs::write(&cfg_path, &config_text)?;
    log.push(format!("wrote {}", cfg_path.display()));

    // $PBOPREFIX$.txt — see comment below the pack step.
    let prefix_path = addon_src.join("$PBOPREFIX$.txt");
    std::fs::write(&prefix_path, &addon_name)?;
    log.push(format!("wrote {} = {}", prefix_path.display(), addon_name));

    // Optional top-level mod.cpp — small metadata blob helps the
    // Steam/Workshop UI and some server tools group the mod.
    let mod_cpp = mod_root.join("mod.cpp");
    std::fs::write(
        &mod_cpp,
        format!(
            "name = \"{display}\";\npicture = \"\";\naction = \"\";\nactionName = \"\";\ndescription = \"Reskin library generated by DayZ ServerUI ({count} reskin{s}).\";\n",
            display = mod_name.trim_start_matches('@'),
            count = registry.reskins.len(),
            s = if registry.reskins.len() == 1 { "" } else { "s" },
        ),
    )?;
    log.push(format!("wrote {}", mod_cpp.display()));

    // Pack the addon into a PBO.
    //
    // MakePbo validates every texture reference in config.cpp against
    // the P: drive — not against the source folder it's currently
    // packing. That means a ref like `operatorreskins\data\foo.paa`
    // has to resolve to `P:\operatorreskins\data\foo.paa` for the
    // validator to pass. We solve that the standard DayZ-modding way:
    // mirror the staged addon to `P:\<addon>\` just for the pack, run
    // MakePbo from there, then remove the P: copy. The source folder
    // layout also means MakePbo auto-detects the prefix as the folder
    // name under P:, which matches the config refs by construction.
    let pbo_path = addons_dir.join(format!("{addon_name}.pbo"));
    let p_stage = PathBuf::from(format!("P:\\{addon_name}"));
    if p_stage.exists() {
        std::fs::remove_dir_all(&p_stage).ok();
    }
    copy_dir_all(&addon_src, &p_stage)?;
    log.push(format!("mirrored to {} for P: packing", p_stage.display()));

    let pack_result = run_make_pbo(&make_pbo, &p_stage, &addons_dir, &mut log);

    if p_stage.exists() {
        std::fs::remove_dir_all(&p_stage).ok();
    }
    pack_result?;

    if !pbo_path.is_file() {
        return Err(AppError::Internal(format!(
            "MakePbo ran but {} was not produced",
            pbo_path.display()
        )));
    }

    // Sign (optional — if a private key exists).
    let signed = match tools::find_private_key(app_data_dir, tools_dir) {
        Some(key) => {
            if ds_sign.is_file() {
                run_ds_sign(&ds_sign, &key, &pbo_path, &mut log)?;
                let public_key = derive_public_key_path(&key);
                if public_key.is_file() {
                    let dest = keys_dir.join(
                        public_key
                            .file_name()
                            .unwrap_or_else(|| std::ffi::OsStr::new("reskin.bikey")),
                    );
                    std::fs::copy(&public_key, &dest)?;
                    log.push(format!("copied public key to {}", dest.display()));
                } else {
                    notes.push(format!(
                        "private key at {} has no matching .bikey beside it",
                        key.display()
                    ));
                }
                true
            } else {
                notes.push(
                    "DSSignFile.exe missing — PBO packed but not signed. Install DayZ Tools or Locate the exe in Setup.".into(),
                );
                false
            }
        }
        None => {
            notes.push(
                "no .biprivatekey next to DSSignFile — PBO packed but not signed. Public servers with verifySignatures=2 will reject it.".into(),
            );
            false
        }
    };

    // Copy user-supplied external `.pbo` files into `<mod>/addons/`
    // alongside the one we just packed. `.bisign` / `.bikey`
    // siblings are pulled in too so a pre-signed external PBO keeps
    // its trust chain — the operator can always drop the source key
    // into the same folder as the `.pbo` and we'll carry it along.
    let mut external_pbos_copied = 0u32;
    let mut copied_names: Vec<String> = Vec::new();
    let main_pbo_name = pbo_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    for ext in &included_external {
        let src = PathBuf::from(&ext.source_path);
        if !src.is_file() {
            notes.push(format!(
                "external PBO missing at build time — skipped: {}",
                ext.source_path
            ));
            continue;
        }
        let file_name = src
            .file_name()
            .and_then(|s| s.to_str())
            .ok_or_else(|| {
                AppError::Internal(format!(
                    "external PBO has no filename: {}",
                    ext.source_path
                ))
            })?
            .to_string();
        if file_name.eq_ignore_ascii_case(main_pbo_name) {
            return Err(AppError::Internal(format!(
                "external PBO filename collides with the packed addon: {file_name}. \
                 Rename the external file or change the modpack name."
            )));
        }
        if copied_names
            .iter()
            .any(|n| n.eq_ignore_ascii_case(&file_name))
        {
            return Err(AppError::Internal(format!(
                "two external PBOs share the same filename: {file_name}"
            )));
        }
        let dst = addons_dir.join(&file_name);
        std::fs::copy(&src, &dst)?;
        external_pbos_copied += 1;
        copied_names.push(file_name.clone());
        log.push(format!(
            "copied external PBO {} → {}",
            src.display(),
            dst.display()
        ));
        // Sibling .bisign (signature) — critical for servers with
        // verifySignatures=2 to accept the PBO.
        let bisign = src.with_extension("pbo.bisign");
        if bisign.is_file() {
            let dst_sig = addons_dir.join(
                bisign
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or(""),
            );
            std::fs::copy(&bisign, &dst_sig)?;
            log.push(format!("copied {} → {}", bisign.display(), dst_sig.display()));
        } else {
            notes.push(format!(
                "external PBO {file_name} has no .bisign — it will be rejected by verifySignatures=2. \
                 Sign it yourself or place the original .bisign next to the source."
            ));
        }
        // Sibling .bikey (public key) — if present, carry it into
        // the modpack's keys/ so DayZ can verify. Missing .bikey is
        // a warning, not an error (the key might already live in a
        // different mod's keys/ on the server).
        if let Some(parent) = src.parent() {
            if let Ok(entries) = std::fs::read_dir(parent) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    let is_bikey = p
                        .extension()
                        .and_then(|s| s.to_str())
                        .map(|s| s.eq_ignore_ascii_case("bikey"))
                        .unwrap_or(false);
                    if !is_bikey {
                        continue;
                    }
                    let name = match p.file_name().and_then(|s| s.to_str()) {
                        Some(n) => n,
                        None => continue,
                    };
                    let dst_key = keys_dir.join(name);
                    if dst_key.is_file() {
                        continue; // already carried by another external PBO
                    }
                    std::fs::copy(&p, &dst_key)?;
                    log.push(format!("copied {} → {}", p.display(), dst_key.display()));
                }
            }
        }
    }

    // Aggregated types.xml — one <type> per reskin class using the
    // source-class category guess. Import it via the Items page.
    let types_xml_path = mod_root.join("types.xml");
    let types_xml = emit_types_xml_multi(&compiled);
    std::fs::write(&types_xml_path, types_xml)?;
    log.push(format!("wrote {}", types_xml_path.display()));

    let replace_classes: Vec<String> = compiled
        .iter()
        .filter(|c| matches!(c.entry.mode, ReskinMode::Replace))
        .map(|c| c.entry.source.name.clone())
        .collect();
    if !replace_classes.is_empty() {
        notes.push(format!(
            "Replace mode reskins — add to the CE ignore list so only the reskin spawns: {}",
            replace_classes.join(", ")
        ));
    }

    let mut classes_written: Vec<String> = compiled
        .iter()
        .map(|c| c.entry.new_classname.clone())
        .collect();
    // User-authored classes join the roster so the build-result UI
    // can show the operator every symbol their mod now exposes.
    for cc in &registry.config_classes {
        classes_written.push(cc.classname.clone());
    }

    Ok(ReskinBuildResult {
        mod_path: mod_root.to_string_lossy().into_owned(),
        pbo_path: pbo_path.to_string_lossy().into_owned(),
        addon_name,
        classes_written,
        textures_converted,
        signed,
        duration_ms: started.elapsed().as_millis() as u64,
        types_xml_path: types_xml_path.to_string_lossy().into_owned(),
        external_pbos_copied,
        config_classes_written: registry.config_classes.len() as u32,
        notes,
        log,
    })
}

fn is_valid_mod_name(s: &str) -> bool {
    if !s.starts_with('@') || s.len() < 2 {
        return false;
    }
    s.chars()
        .skip(1)
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

struct CompiledEntry {
    entry: ReskinEntry,
    slot_emits: Vec<SlotEmit>,
}

// ---------- Internals ----------

struct SlotEmit {
    slot_index: u32,
    #[allow(dead_code)]
    selection: String,
    /// Final string that lands in `hiddenSelectionsTextures[]` —
    /// either a `mod\data\file.paa` relative path or a procedural
    /// string.
    texture_ref: String,
}

/// Build the aggregated config.cpp for the modpack: reskin blocks +
/// user-authored config-class blocks. `CfgPatches` declares every new
/// classname across both sources. For each config container
/// (`CfgVehicles`, `CfgWeapons`, …) we emit the forward decls for
/// parents (deduplicated) followed by the reskin blocks then the
/// user blocks — keeping everything deterministic so diffs between
/// builds stay readable.
fn emit_config(
    addon_name: &str,
    compiled: &[CompiledEntry],
    config_classes: &[ConfigClassEntry],
    extra_required_addons: &[String],
) -> String {
    // CfgPatches.weapons[] must name every new symbol the addon
    // introduces — reskin clones AND config classes whose intent is
    // "new". Override-kind entries rewrite an existing class, so
    // they stay out of CfgPatches.
    let mut weapon_names: Vec<String> = Vec::new();
    for c in compiled {
        weapon_names.push(c.entry.new_classname.clone());
    }
    for cc in config_classes {
        if matches!(cc.effective_kind(), ConfigClassKind::Override) {
            continue;
        }
        weapon_names.push(cc.classname.clone());
    }
    let weapon_list = weapon_names
        .iter()
        .map(|n| format!("\"{}\"", escape_cpp(n)))
        .collect::<Vec<_>>()
        .join(", ");

    // Group both sources by container. BTreeMap keeps output
    // deterministic so diffs stay readable.
    let mut reskin_by: BTreeMap<String, Vec<&CompiledEntry>> = BTreeMap::new();
    for c in compiled {
        let container = c
            .entry
            .source
            .containers
            .first()
            .cloned()
            .unwrap_or_else(|| "CfgVehicles".to_string());
        reskin_by.entry(container).or_default().push(c);
    }
    let mut classes_by: BTreeMap<String, Vec<&ConfigClassEntry>> = BTreeMap::new();
    for cc in config_classes {
        let container = if cc.container.trim().is_empty() {
            "CfgVehicles".to_string()
        } else {
            cc.container.trim().to_string()
        };
        classes_by.entry(container).or_default().push(cc);
    }

    // Build the requiredAddons[] list. `DZ_Data` is the vanilla
    // baseline every reskin needs; `extra_required_addons` carries
    // CfgPatches identifiers from mods whose classes we're
    // reskinning, so DayZ knows to load them first.
    let mut required: Vec<String> = vec!["DZ_Data".to_string()];
    for n in extra_required_addons {
        if !required.iter().any(|r| r == n) {
            required.push(n.clone());
        }
    }
    let required_list = required
        .iter()
        .map(|n| format!("\"{}\"", escape_cpp(n)))
        .collect::<Vec<_>>()
        .join(", ");

    let mut body = String::new();
    body.push_str(&format!(
        "class CfgPatches {{\n    class {addon} {{\n        units[] = {{}};\n        weapons[] = {{{weapons}}};\n        requiredVersion = 0.1;\n        requiredAddons[] = {{{required}}};\n    }};\n}};\n\n",
        addon = addon_name,
        weapons = weapon_list,
        required = required_list,
    ));

    // Union of container keys, stable order.
    let mut containers: Vec<String> = reskin_by.keys().cloned().collect();
    for k in classes_by.keys() {
        if !containers.iter().any(|c| c == k) {
            containers.push(k.clone());
        }
    }
    containers.sort();

    for container in &containers {
        body.push_str(&format!("class {container} {{\n"));
        // Forward decls — union of reskin parents (source names) and
        // user-class parents. Deduplicated.
        let mut seen_parents: Vec<String> = Vec::new();
        let empty_reskin: Vec<&CompiledEntry> = Vec::new();
        let empty_classes: Vec<&ConfigClassEntry> = Vec::new();
        let reskins_here: &Vec<&CompiledEntry> =
            reskin_by.get(container).unwrap_or(&empty_reskin);
        let classes_here: &Vec<&ConfigClassEntry> =
            classes_by.get(container).unwrap_or(&empty_classes);

        for c in reskins_here {
            let parent = &c.entry.source.name;
            if !seen_parents.iter().any(|p| p == parent) {
                seen_parents.push(parent.clone());
                body.push_str(&format!("    class {parent};\n"));
            }
        }
        for cc in classes_here {
            // Overrides don't need a forward decl — they redefine a
            // class that's already declared elsewhere in the config.
            if matches!(cc.effective_kind(), ConfigClassKind::Override) {
                continue;
            }
            let parent = cc.parent.trim();
            if parent.is_empty() {
                continue;
            }
            if !seen_parents.iter().any(|p| p.eq_ignore_ascii_case(parent)) {
                seen_parents.push(parent.to_string());
                body.push_str(&format!("    class {parent};\n"));
            }
        }
        for c in reskins_here {
            body.push_str(&emit_class_block(c));
        }
        for cc in classes_here {
            body.push_str(&emit_user_class_block(cc));
        }
        body.push_str("};\n\n");
    }

    body
}

/// Render a user-authored class block. The body is taken verbatim —
/// the operator is expected to know config.cpp syntax. We only handle
/// the `class Name: Parent { … }` framing so they don't have to
/// repeat it for every entry. The `kind` field (falling back to
/// parent-shape inference for pre-kind entries) decides between
/// a derived class and a pure override.
fn emit_user_class_block(cc: &ConfigClassEntry) -> String {
    let body = cc.body.trim();
    let body_indented = if body.is_empty() {
        String::new()
    } else {
        body.lines()
            .map(|l| {
                if l.is_empty() {
                    String::new()
                } else {
                    format!("    {l}")
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    };
    let header = match cc.effective_kind() {
        ConfigClassKind::Override => {
            // Pure override — the parent is implicit (the class being
            // redefined). `class Name { … }` makes the engine merge
            // this block into the existing class of the same name.
            format!("    class {name} {{\n", name = cc.classname)
        }
        ConfigClassKind::New => {
            let parent = cc.parent.trim();
            if parent.is_empty() {
                // New with no parent is rarely useful but technically
                // valid — emit as a top-level class declaration.
                format!("    class {name} {{\n", name = cc.classname)
            } else {
                format!(
                    "    class {name}: {parent} {{\n",
                    name = cc.classname,
                    parent = parent,
                )
            }
        }
    };
    if body_indented.is_empty() {
        format!("{header}    }};\n")
    } else {
        format!("{header}{body_indented}\n    }};\n")
    }
}

fn emit_class_block(c: &CompiledEntry) -> String {
    let src = &c.entry.source;
    let width = src
        .hidden_selections
        .len()
        .max(src.hidden_selections_textures.len())
        .max(
            c.slot_emits
                .iter()
                .map(|s| s.slot_index as usize + 1)
                .max()
                .unwrap_or(0),
        );
    let mut lines: Vec<String> = Vec::with_capacity(width);
    for i in 0..width {
        if let Some(over) = c.slot_emits.iter().find(|s| s.slot_index as usize == i) {
            lines.push(format!(
                "            \"{}\"",
                escape_cpp(&over.texture_ref)
            ));
        } else if let Some(van) = src.hidden_selections_textures.get(i) {
            lines.push(format!("            \"{}\"", escape_cpp(van)));
        } else {
            lines.push("            \"\"".into());
        }
    }
    let selections = src
        .hidden_selections
        .iter()
        .map(|s| format!("\"{}\"", escape_cpp(s)))
        .collect::<Vec<_>>()
        .join(", ");
    format!(
        "    class {new_name}: {parent} {{\n        scope = 2;\n        displayName = \"{new_name}\";\n        hiddenSelections[] = {{{selections}}};\n        hiddenSelectionsTextures[] = {{\n{textures}\n        }};\n    }};\n",
        new_name = c.entry.new_classname,
        parent = src.name,
        selections = selections,
        textures = lines.join(",\n"),
    )
}

fn emit_types_xml_multi(compiled: &[CompiledEntry]) -> String {
    let mut out = String::new();
    out.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    out.push_str("<types>\n");
    for c in compiled {
        let category = guess_category(&c.entry.source);
        out.push_str(&format!(
            "\t<type name=\"{name}\">\n\
             \t\t<nominal>0</nominal>\n\
             \t\t<lifetime>14400</lifetime>\n\
             \t\t<restock>0</restock>\n\
             \t\t<min>0</min>\n\
             \t\t<quantmin>-1</quantmin>\n\
             \t\t<quantmax>-1</quantmax>\n\
             \t\t<cost>100</cost>\n\
             \t\t<flags count_in_cargo=\"0\" count_in_hoarder=\"0\" count_in_map=\"1\" count_in_player=\"0\" crafted=\"0\" deloot=\"0\"/>\n\
             \t\t<category name=\"{category}\"/>\n\
             \t</type>\n",
            name = escape_xml(&c.entry.new_classname),
            category = escape_xml(category),
        ));
    }
    out.push_str("</types>\n");
    out
}

fn convert_to_paa(
    image_to_paa: &Path,
    src: &Path,
    dst: &Path,
    log: &mut Vec<String>,
) -> AppResult<()> {
    let ext = src
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();
    if ext == "paa" {
        std::fs::copy(src, dst)?;
        log.push(format!(
            "copied already-PAA {} → {}",
            src.display(),
            dst.display()
        ));
        return Ok(());
    }

    let output = Command::new(image_to_paa)
        .arg(src)
        .arg(dst)
        .output()
        .map_err(|e| AppError::Internal(format!("spawn ImageToPAA: {e}")))?;
    require_success("ImageToPAA", &output)?;
    if !dst.is_file() {
        return Err(AppError::Internal(format!(
            "ImageToPAA ran on {} but {} wasn't produced",
            src.display(),
            dst.display()
        )));
    }
    log.push(format!(
        "converted {} → {}",
        src.display(),
        dst.display()
    ));
    Ok(())
}

/// For each compiled reskin whose source class came from a third-
/// party mod, look up the mod's CfgPatches identifiers via the
/// scanner cache and union them. The build's generated config.cpp
/// declares these in `requiredAddons[]` so the engine loads the
/// source mod before the override patch resolves. Mods we no
/// longer have an index entry for (operator removed the source)
/// are silently skipped — the build still emits the override and
/// the operator gets a runtime error if the parent isn't loaded,
/// which matches what they'd see today without this feature.
fn collect_required_addons(
    app_data_dir: &Path,
    compiled: &[CompiledEntry],
) -> Vec<String> {
    let mod_idx = match super::mod_index::load_index(app_data_dir) {
        Ok(idx) => idx,
        Err(_) => return Vec::new(),
    };
    let mut needed_mod_names: std::collections::HashSet<String> =
        std::collections::HashSet::new();
    for c in compiled {
        if let Some(m) = c.entry.source.source_mod.as_deref() {
            needed_mod_names.insert(m.to_string());
        }
    }
    let mut out: Vec<String> = Vec::new();
    for src in &mod_idx.sources {
        if !needed_mod_names.contains(&src.display_name) {
            continue;
        }
        for p in &src.cfg_patches {
            if !out.iter().any(|x| x == p) {
                out.push(p.clone());
            }
        }
    }
    out
}

fn run_make_pbo(
    make_pbo: &Path,
    src_folder: &Path,
    dst_folder: &Path,
    log: &mut Vec<String>,
) -> AppResult<()> {
    // `-P` = don't pause waiting for a keypress on exit. Source is
    // the addon folder; destination is where the .pbo lands.
    let output = Command::new(make_pbo)
        .arg("-P")
        .arg(src_folder)
        .arg(dst_folder)
        .output()
        .map_err(|e| AppError::Internal(format!("spawn MakePbo: {e}")))?;
    require_success("MakePbo", &output)?;
    log.push(format!(
        "packed {} → {}/",
        src_folder.display(),
        dst_folder.display()
    ));
    Ok(())
}

fn run_ds_sign(
    ds_sign: &Path,
    private_key: &Path,
    pbo: &Path,
    log: &mut Vec<String>,
) -> AppResult<()> {
    // DSSignFile arg order: <privateKey> <pboFile> → writes .bisign
    // adjacent to the PBO.
    let output = Command::new(ds_sign)
        .arg(private_key)
        .arg(pbo)
        .output()
        .map_err(|e| AppError::Internal(format!("spawn DSSignFile: {e}")))?;
    require_success("DSSignFile", &output)?;
    log.push(format!(
        "signed {} with {}",
        pbo.display(),
        private_key.display()
    ));
    Ok(())
}

/// Coarse category guess used to seed the types.xml stub. Inspected
/// from the source class's container or parent chain. Operators can
/// retune freely — this is just the "probably right" starting point
/// so the CE accepts the entry and the item shows up in the right
/// section of the Items editor.
fn guess_category(source: &SkinnableClass) -> &'static str {
    let haystack = format!(
        "{} {} {}",
        source.containers.join(" "),
        source.parent.as_deref().unwrap_or(""),
        source.name,
    )
    .to_lowercase();
    if haystack.contains("weapon") || haystack.contains("rifle") || haystack.contains("pistol") {
        "weapons"
    } else if haystack.contains("clothing")
        || haystack.contains("apparel")
        || haystack.contains("jacket")
        || haystack.contains("vest")
        || haystack.contains("helmet")
        || haystack.contains("shirt")
        || haystack.contains("pants")
        || haystack.contains("boots")
    {
        "clothes"
    } else if haystack.contains("food") || haystack.contains("edible") || haystack.contains("drink")
    {
        "food"
    } else if haystack.contains("explosive") || haystack.contains("grenade") {
        "explosives"
    } else if haystack.contains("container") || haystack.contains("backpack") {
        "containers"
    } else {
        "clothes"
    }
}

fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn copy_dir_all(src: &Path, dst: &Path) -> AppResult<()> {
    std::fs::create_dir_all(dst)?;
    for entry in walkdir::WalkDir::new(src).into_iter().filter_map(Result::ok) {
        let path = entry.path();
        let rel = match path.strip_prefix(src) {
            Ok(r) => r,
            Err(_) => continue,
        };
        let target = dst.join(rel);
        if entry.file_type().is_dir() {
            std::fs::create_dir_all(&target)?;
        } else if entry.file_type().is_file() {
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(path, &target)?;
        }
    }
    Ok(())
}

fn derive_public_key_path(private: &Path) -> PathBuf {
    private.with_extension("bikey")
}

fn require_success(tool: &str, out: &Output) -> AppResult<()> {
    if out.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&out.stderr);
    let stdout = String::from_utf8_lossy(&out.stdout);
    Err(AppError::Internal(format!(
        "{tool} exited with {}. stderr: {} stdout: {}",
        out.status,
        stderr.trim(),
        stdout.trim()
    )))
}

fn is_valid_classname(s: &str) -> bool {
    let mut chars = s.chars();
    match chars.next() {
        Some(c) if c.is_ascii_alphabetic() => {}
        _ => return false,
    }
    chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

fn snake_case(s: &str) -> String {
    // ASCII-simple: lowercase, replace non-alnum with underscore,
    // collapse repeats, trim underscores.
    let mut out = String::with_capacity(s.len());
    let mut last_us = false;
    for c in s.chars() {
        if c.is_ascii_alphanumeric() {
            for lc in c.to_lowercase() {
                out.push(lc);
            }
            last_us = false;
        } else if !last_us {
            out.push('_');
            last_us = true;
        }
    }
    out.trim_matches('_').to_string()
}

fn safe_slot_name(selection: &str, index: u32) -> String {
    if selection.trim().is_empty() {
        format!("slot{index}")
    } else {
        snake_case(selection)
    }
}

fn escape_cpp(s: &str) -> String {
    // Minimal escape — backslashes are path separators in DayZ
    // configs, so they pass through unchanged; only quotes need
    // doubling. (Bohemia's config parser uses `""` as the literal
    // `"` inside a string.)
    s.replace('"', "\"\"")
}

fn format_procedural(c: &ProceduralColor) -> String {
    let fmt = |v: f32| {
        let clamped = v.clamp(0.0, 1.0);
        let s = format!("{clamped:.3}");
        // Strip trailing zeros but keep at least one decimal.
        let trimmed = s.trim_end_matches('0').trim_end_matches('.');
        if trimmed.contains('.') {
            trimmed.to_string()
        } else {
            format!("{trimmed}.0")
        }
    };
    let kind = if c.r#type.is_empty() { "CO" } else { c.r#type.as_str() };
    format!(
        "#(argb,8,8,3)color({},{},{},{},{})",
        fmt(c.r),
        fmt(c.g),
        fmt(c.b),
        fmt(c.a),
        kind
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_source() -> SkinnableClass {
        SkinnableClass {
            name: "AKM".into(),
            parent: Some("Rifle_Base".into()),
            containers: vec!["CfgVehicles".into()],
            hidden_selections: vec!["camo1".into(), "camo2".into()],
            hidden_selections_textures: vec![
                "dz\\weapons\\ak\\akm_co.paa".into(),
                "dz\\weapons\\ak\\akm_mag_co.paa".into(),
            ],
            hidden_selections_materials: vec![],
            source_mod: None,
        }
    }

    fn sample_entry(name: &str) -> ReskinEntry {
        ReskinEntry {
            source: sample_source(),
            new_classname: name.into(),
            mode: ReskinMode::Coexist,
            slots: vec![],
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn emit_config_interleaves_overrides_and_vanilla() {
        let compiled = vec![CompiledEntry {
            entry: sample_entry("AKM_Reskin"),
            slot_emits: vec![SlotEmit {
                slot_index: 0,
                selection: "camo1".into(),
                texture_ref: "operator_reskins\\data\\akm_reskin_camo1_co.paa".into(),
            }],
        }];
        let cpp = emit_config("operator_reskins", &compiled, &[], &[]);
        assert!(cpp.contains("class AKM_Reskin: AKM"));
        assert!(cpp.contains("operator_reskins\\data\\akm_reskin_camo1_co.paa"));
        assert!(cpp.contains("dz\\weapons\\ak\\akm_mag_co.paa"));
        assert!(cpp.contains("class CfgPatches"));
    }

    #[test]
    fn emit_config_groups_by_container_and_dedups_forward_decls() {
        let mut e1 = sample_entry("AKM_A");
        let mut e2 = sample_entry("AKM_B");
        let mut e3 = sample_entry("GlockReskin");
        e1.source.containers = vec!["CfgWeapons".into()];
        e2.source.containers = vec!["CfgWeapons".into()];
        e3.source.containers = vec!["CfgWeapons".into()];
        e3.source.name = "Glock_19".into();
        let compiled = vec![
            CompiledEntry { entry: e1, slot_emits: vec![] },
            CompiledEntry { entry: e2, slot_emits: vec![] },
            CompiledEntry { entry: e3, slot_emits: vec![] },
        ];
        let cpp = emit_config("operator_reskins", &compiled, &[], &[]);
        // Only one forward decl for AKM even though two entries use it.
        let akm_decls = cpp.matches("class AKM;").count();
        assert_eq!(akm_decls, 1);
        assert!(cpp.contains("class Glock_19;"));
        assert!(cpp.contains("class AKM_A: AKM"));
        assert!(cpp.contains("class AKM_B: AKM"));
        assert!(cpp.contains("class GlockReskin: Glock_19"));
    }

    #[test]
    fn emit_types_xml_multi_writes_one_type_per_entry() {
        let compiled = vec![
            CompiledEntry { entry: sample_entry("AKM_A"), slot_emits: vec![] },
            CompiledEntry { entry: sample_entry("AKM_B"), slot_emits: vec![] },
        ];
        let xml = emit_types_xml_multi(&compiled);
        assert!(xml.contains("<type name=\"AKM_A\">"));
        assert!(xml.contains("<type name=\"AKM_B\">"));
        assert_eq!(xml.matches("<type ").count(), 2);
    }

    #[test]
    fn snake_case_drops_symbols_and_lowercases() {
        assert_eq!(snake_case("OperatorReskins"), "operatorreskins");
        assert_eq!(snake_case("Hot Pink v2"), "hot_pink_v2");
        assert_eq!(snake_case("__weird__"), "weird");
    }

    #[test]
    fn format_procedural_matches_bohemia_syntax() {
        let c = ProceduralColor {
            r: 0.5,
            g: 0.25,
            b: 0.125,
            a: 1.0,
            r#type: "CO".into(),
        };
        assert_eq!(
            format_procedural(&c),
            "#(argb,8,8,3)color(0.5,0.25,0.125,1.0,CO)"
        );
    }

    #[test]
    fn valid_classname_accepts_standard_names_rejects_junk() {
        assert!(is_valid_classname("AKM_Reskin"));
        assert!(is_valid_classname("A"));
        assert!(!is_valid_classname(""));
        assert!(!is_valid_classname("1AKM"));
        assert!(!is_valid_classname("AKM-Reskin"));
        assert!(!is_valid_classname("AKM Reskin"));
    }

    #[test]
    fn emit_config_appends_user_classes_alongside_reskins() {
        let compiled = vec![CompiledEntry {
            entry: sample_entry("AKM_Reskin"),
            slot_emits: vec![],
        }];
        let classes = vec![
            ConfigClassEntry {
                id: "c1".into(),
                display_name: "SuperBear".into(),
                classname: "SuperBear".into(),
                parent: "Animal_UrsusArctos".into(),
                container: "CfgVehicles".into(),
                kind: Some(ConfigClassKind::New),
                body: "scope = 2;\nhealth = 2000;".into(),
                created_at: "".into(),
                updated_at: "".into(),
            },
            ConfigClassEntry {
                id: "c2".into(),
                display_name: "TankerHelmet override".into(),
                classname: "TankerHelmet".into(),
                parent: "TankerHelmet".into(), // pure override
                container: "CfgVehicles".into(),
                kind: Some(ConfigClassKind::Override),
                body: "weight = 100;".into(),
                created_at: "".into(),
                updated_at: "".into(),
            },
        ];
        let cpp = emit_config("server_modpack", &compiled, &classes, &[]);
        assert!(cpp.contains("class AKM_Reskin: AKM"));
        assert!(cpp.contains("class Animal_UrsusArctos;"));
        assert!(cpp.contains("class SuperBear: Animal_UrsusArctos"));
        assert!(cpp.contains("health = 2000"));
        // Pure override: no `: Parent` and no forward decl for self.
        assert!(cpp.contains("class TankerHelmet {\n"));
        assert!(!cpp.contains("class TankerHelmet;\n"));
        // CfgPatches weapons[] lists the derived class but not the pure override.
        assert!(cpp.contains("\"AKM_Reskin\""));
        assert!(cpp.contains("\"SuperBear\""));
        assert!(!cpp.contains("\"TankerHelmet\""));
    }

    #[test]
    fn emit_user_class_block_indents_body_and_trims() {
        let cc = ConfigClassEntry {
            id: "".into(),
            display_name: "".into(),
            classname: "Foo".into(),
            parent: "Bar".into(),
            container: "CfgVehicles".into(),
            kind: Some(ConfigClassKind::New),
            body: "scope = 2;\n\nhealth = 9000;".into(),
            created_at: "".into(),
            updated_at: "".into(),
        };
        let block = emit_user_class_block(&cc);
        assert!(block.contains("class Foo: Bar {"));
        assert!(block.contains("    scope = 2;"));
        assert!(block.contains("    health = 9000;"));
        assert!(block.ends_with("    };\n"));
    }

    #[test]
    fn effective_kind_infers_override_from_empty_or_self_parent() {
        // Pre-kind registries don't serialise `kind`, so load-time
        // behaviour must match what the old heuristic did: empty
        // parent or `parent == classname` = override, everything
        // else = new.
        let mut cc = ConfigClassEntry {
            id: "".into(),
            display_name: "".into(),
            classname: "Foo".into(),
            parent: "".into(),
            container: "CfgVehicles".into(),
            kind: None,
            body: "".into(),
            created_at: "".into(),
            updated_at: "".into(),
        };
        assert_eq!(cc.effective_kind(), ConfigClassKind::Override);
        cc.parent = "Foo".into();
        assert_eq!(cc.effective_kind(), ConfigClassKind::Override);
        cc.parent = "Animal_UrsusArctos".into();
        assert_eq!(cc.effective_kind(), ConfigClassKind::New);
        // Explicit kind beats inference — a "New" classname that
        // happens to equal its parent gets treated as New.
        cc.parent = "Foo".into();
        cc.kind = Some(ConfigClassKind::New);
        assert_eq!(cc.effective_kind(), ConfigClassKind::New);
    }

    #[test]
    fn emit_config_with_only_config_classes_still_emits_cfg_patches() {
        let classes = vec![ConfigClassEntry {
            id: "c1".into(),
            display_name: "".into(),
            classname: "NewThing".into(),
            parent: "Some_Base".into(),
            container: "CfgVehicles".into(),
            kind: Some(ConfigClassKind::New),
            body: "".into(),
            created_at: "".into(),
            updated_at: "".into(),
        }];
        let cpp = emit_config("server_modpack", &[], &classes, &[]);
        assert!(cpp.contains("class CfgPatches"));
        assert!(cpp.contains("\"NewThing\""));
        assert!(cpp.contains("class Some_Base;"));
        assert!(cpp.contains("class NewThing: Some_Base"));
    }

    #[test]
    fn guess_category_weapons_from_container() {
        let cls = SkinnableClass {
            name: "AKM".into(),
            parent: Some("Rifle_Base".into()),
            containers: vec!["CfgWeapons".into()],
            hidden_selections: vec![],
            hidden_selections_textures: vec![],
            hidden_selections_materials: vec![],
            source_mod: None,
        };
        assert_eq!(guess_category(&cls), "weapons");
    }

    #[test]
    fn guess_category_clothes_from_name() {
        let cls = SkinnableClass {
            name: "TankerHelmet".into(),
            parent: None,
            containers: vec!["CfgVehicles".into()],
            hidden_selections: vec![],
            hidden_selections_textures: vec![],
            hidden_selections_materials: vec![],
            source_mod: None,
        };
        assert_eq!(guess_category(&cls), "clothes");
    }
}
