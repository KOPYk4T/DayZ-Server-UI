//! Unified events + event-spawns registry.
//!
//! **Event definitions** (`events.xml`):
//!   - Vanilla baseline from `db/events.xml`.
//!   - Overrides from every `<ce folder="…"><file type="events"/></ce>`
//!     registration in cfgeconomycore (supported by DayZ CE).
//!   - Operator edits go to `custom/events_custom.xml`, auto-
//!     registered in cfgeconomycore. Dedup step drops entries that
//!     match the baseline to keep the override file minimal.
//!
//! **Event spawn positions** (`cfgeventspawns.xml`):
//!   DayZ's CE **does not** honour `<file type="eventposdef">` in
//!   cfgeconomycore custom folders — Bohemia feedback T161291,
//!   open since 2021 and still unimplemented. The only way to get
//!   DayZ to load additional spawn positions is to edit the
//!   mission-side `cfgeventspawns.xml` directly. So we do exactly
//!   that: position upserts write back into the vanilla file, and
//!   a per-profile edits ledger at `<app_data>/edits/<id>.json`
//!   records each addition / removal so a future pull or mod
//!   reinstall can be reconciled without losing the operator's
//!   work.
//!
//! If a stale `custom/cfgeventspawns_custom.xml` exists from a
//! previous version of this app, the upsert path migrates its
//! positions into vanilla and removes the dead registration.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::domain::{DynamicEvent, EventSpawnGroup, ItemSource};
use crate::edits::{self, EditsLedger, PositionRef};
use crate::error::{AppError, AppResult};
use crate::parsers::cfg_economy_core::{CeFile, EconomyCore};
use crate::parsers::{cfg_eventspawns_xml, events_xml};
use crate::validation::{Issue, Severity};

use super::MissionContext;

pub const CUSTOM_EVENTS_FILE: &str = "events_custom.xml";
pub const CUSTOM_SPAWNS_FILE: &str = "cfgeventspawns_custom.xml";

pub struct EventsRegistry {
    pub events: HashMap<String, DynamicEvent>,
    pub spawns: HashMap<String, EventSpawnGroup>,
    pub files_loaded: Vec<FileOrigin>,
    /// Per-file parse failures — surfaced as Error-severity issues so
    /// one broken mod file doesn't brick the whole Events page.
    pub load_errors: Vec<Issue>,
}

#[derive(Debug, Clone)]
pub struct FileOrigin {
    pub path: PathBuf,
    pub source: ItemSource,
    pub relative: String,
    pub kind: &'static str, // "events" | "eventposdef"
    pub count: usize,
}

pub fn load(ctx: &MissionContext) -> AppResult<EventsRegistry> {
    let mut events: HashMap<String, DynamicEvent> = HashMap::new();
    let mut spawns: HashMap<String, EventSpawnGroup> = HashMap::new();
    let mut files_loaded = Vec::new();
    let mut load_errors = Vec::new();

    // 1. Vanilla baseline.
    let vanilla_events = ctx.db_dir.join("events.xml");
    if vanilla_events.exists() {
        let rel = rel_slash(&ctx.workspace, &vanilla_events);
        match events_xml::parse_file(&vanilla_events, &ctx.workspace, ItemSource::Vanilla) {
            Ok(list) => {
                let count = list.len();
                for e in list {
                    events.insert(e.name.clone(), e);
                }
                files_loaded.push(FileOrigin {
                    path: vanilla_events.clone(),
                    source: ItemSource::Vanilla,
                    relative: rel,
                    kind: "events",
                    count,
                });
            }
            Err(e) => record_parse_error(&mut load_errors, "events", &rel, &e),
        }
    }

    let vanilla_spawns = ctx.mission_root.join("cfgeventspawns.xml");
    if vanilla_spawns.exists() {
        let rel = rel_slash(&ctx.workspace, &vanilla_spawns);
        match cfg_eventspawns_xml::parse_file(
            &vanilla_spawns,
            &ctx.workspace,
            ItemSource::Vanilla,
        ) {
            Ok(list) => {
                let count = list.len();
                for g in list {
                    spawns.insert(g.event_name.clone(), g);
                }
                files_loaded.push(FileOrigin {
                    path: vanilla_spawns.clone(),
                    source: ItemSource::Vanilla,
                    relative: rel,
                    kind: "eventposdef",
                    count,
                });
            }
            Err(e) => record_parse_error(&mut load_errors, "eventposdef", &rel, &e),
        }
    }

    // 2. Overrides registered in cfgeconomycore.xml.
    if ctx.cfgeconomycore_path.exists() {
        let eco = EconomyCore::parse_file(&ctx.cfgeconomycore_path)?;
        for block in eco.ce_blocks() {
            for f in &block.files {
                let path = ctx.mission_root.join(&block.folder).join(&f.name);
                if !path.exists() {
                    log::warn!(
                        "cfgeconomycore references missing file: {}",
                        path.display()
                    );
                    continue;
                }
                let source = if block.folder == "custom" {
                    ItemSource::Custom
                } else {
                    ItemSource::Mod
                };
                let rel = rel_slash(&ctx.workspace, &path);
                match f.file_type.as_str() {
                    "events" => match events_xml::parse_file(&path, &ctx.workspace, source) {
                        Ok(list) => {
                            let count = list.len();
                            for mut e in list {
                                if matches!(source, ItemSource::Mod) {
                                    e.mod_id = Some(block.folder.clone());
                                }
                                events.insert(e.name.clone(), e);
                            }
                            files_loaded.push(FileOrigin {
                                path: path.clone(),
                                source,
                                relative: rel,
                                kind: "events",
                                count,
                            });
                        }
                        Err(e) => record_parse_error(&mut load_errors, "events", &rel, &e),
                    },
                    "eventposdef" => {
                        match cfg_eventspawns_xml::parse_file(&path, &ctx.workspace, source) {
                            Ok(list) => {
                                let count = list.len();
                                for mut g in list {
                                    if matches!(source, ItemSource::Mod) {
                                        g.mod_id = Some(block.folder.clone());
                                    }
                                    spawns.insert(g.event_name.clone(), g);
                                }
                                files_loaded.push(FileOrigin {
                                    path: path.clone(),
                                    source,
                                    relative: rel,
                                    kind: "eventposdef",
                                    count,
                                });
                            }
                            Err(e) => record_parse_error(
                                &mut load_errors,
                                "eventposdef",
                                &rel,
                                &e,
                            ),
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    Ok(EventsRegistry {
        events,
        spawns,
        files_loaded,
        load_errors,
    })
}

fn record_parse_error(
    out: &mut Vec<Issue>,
    kind: &str,
    file: &str,
    err: &AppError,
) {
    log::error!("failed to parse {kind} file {file}: {err}");
    out.push(Issue {
        severity: Severity::Error,
        code: format!("events.parse-failed.{kind}"),
        message: format!(
            "could not parse {file}: {err}. The file was skipped — other {kind} entries are unaffected, but this file's contents won't apply on the server."
        ),
        file: file.to_string(),
        entity: None,
    });
}

/// Upsert the caller's changes into the mission files.
///
/// Event *definitions* are routed to `custom/events_custom.xml` (the
/// `events` file type is a supported CE override). Event *spawn
/// positions* are written IN PLACE to the mission-side
/// `cfgeventspawns.xml` — CE's custom-folder mechanism ignores
/// `eventposdef` so the only option DayZ honours is mutating the
/// main file. Each write also updates the edits ledger so a future
/// pull can reapply the delta.
///
/// `edits_dir` + `profile_id` point at the per-profile ledger file.
pub fn upsert_into_custom(
    ctx: &MissionContext,
    event_updates: &[DynamicEvent],
    spawn_updates: &[EventSpawnGroup],
    edits_dir: &Path,
    profile_id: &str,
) -> AppResult<()> {
    ctx.ensure_custom_dir()?;

    // One-shot: migrate any legacy `cfgeventspawns_custom.xml`
    // content into vanilla and rip the unsupported registration
    // out of cfgeconomycore. Runs every call but is idempotent.
    let mut ledger = edits::load(edits_dir, profile_id);
    migrate_legacy_custom_eventspawns(ctx, &mut ledger)?;

    // ---------- Event definitions ----------
    let events_baseline = load_non_custom_events_baseline(ctx)?;
    let events_path = ctx.custom_dir.join(CUSTOM_EVENTS_FILE);
    let mut custom_events = if events_path.exists() {
        events_xml::parse_file(&events_path, &ctx.workspace, ItemSource::Custom)?
    } else {
        Vec::new()
    };

    let mut index: HashMap<String, usize> = custom_events
        .iter()
        .enumerate()
        .map(|(i, e)| (e.name.clone(), i))
        .collect();
    for u in event_updates {
        let mut e = u.clone();
        e.source = ItemSource::Custom;
        e.file = rel_slash(&ctx.workspace, &events_path);
        e.mod_id = None;
        if let Some(&i) = index.get(&e.name) {
            custom_events[i] = e;
        } else {
            index.insert(e.name.clone(), custom_events.len());
            custom_events.push(e);
        }
    }

    // Drop entries whose content matches the effective baseline
    // (vanilla + non-custom CE sources) so events_custom.xml only
    // holds real overrides.
    let before = custom_events.len();
    custom_events.retain(|e| match events_baseline.get(&e.name) {
        Some(baseline_event) => !event_content_equal(baseline_event, e),
        None => true,
    });
    let pruned = before != custom_events.len();

    if !event_updates.is_empty() || pruned {
        events_xml::write_events(&events_path, &custom_events)?;
    }

    // ---------- Spawn positions (in place, mission-side) ----------
    if !spawn_updates.is_empty() {
        let vanilla_path = ctx.mission_root.join("cfgeventspawns.xml");
        let mut existing = if vanilla_path.exists() {
            cfg_eventspawns_xml::parse_file(
                &vanilla_path,
                &ctx.workspace,
                ItemSource::Vanilla,
            )?
        } else {
            Vec::new()
        };

        let mut idx: HashMap<String, usize> = existing
            .iter()
            .enumerate()
            .map(|(i, g)| (g.event_name.clone(), i))
            .collect();

        for u in spawn_updates {
            let old_positions: Vec<crate::domain::EventPosition> = idx
                .get(&u.event_name)
                .map(|&i| existing[i].positions.clone())
                .unwrap_or_default();
            let new_positions = u.positions.clone();

            // Record the delta before mutating the file so the
            // ledger captures exactly what changed on this save.
            for p in &new_positions {
                if !old_positions.iter().any(|op| pos_equal(op, p)) {
                    ledger
                        .eventspawns
                        .record_addition(to_position_ref(&u.event_name, p));
                }
            }
            for p in &old_positions {
                if !new_positions.iter().any(|np| pos_equal(np, p)) {
                    ledger
                        .eventspawns
                        .record_removal(to_position_ref(&u.event_name, p));
                }
            }

            // Apply the update to the in-memory view.
            if let Some(&i) = idx.get(&u.event_name) {
                existing[i].positions = new_positions;
            } else {
                // Brand-new event that vanilla cfgeventspawns
                // didn't have — add a fresh entry. The vanilla
                // file still stores it; keeping every spawn in
                // one place avoids the custom-file trap.
                let mut g = u.clone();
                g.source = ItemSource::Vanilla;
                g.file = rel_slash(&ctx.workspace, &vanilla_path);
                g.mod_id = None;
                idx.insert(u.event_name.clone(), existing.len());
                existing.push(g);
            }
        }
        cfg_eventspawns_xml::write_groups(&vanilla_path, &existing)?;
    }

    edits::save(edits_dir, profile_id, &ledger)?;

    // Only register the events override file (type="events" is
    // supported). Position registrations are deliberately NOT
    // added — DayZ ignores `eventposdef` custom-folder entries.
    ensure_registered(ctx, !event_updates.is_empty() || pruned)?;

    Ok(())
}

fn to_position_ref(
    event_name: &str,
    p: &crate::domain::EventPosition,
) -> PositionRef {
    PositionRef {
        event_name: event_name.to_string(),
        x: p.x,
        y: p.y,
        z: p.z,
        a: p.a,
        group: p.group.clone(),
    }
}

/// Move any positions sitting in the legacy
/// `custom/cfgeventspawns_custom.xml` into the main
/// `cfgeventspawns.xml`, record them as ledger additions, then
/// delete the orphan file and strip its registration from
/// cfgeconomycore. Idempotent — once there's no custom file and no
/// registration, this is a no-op.
fn migrate_legacy_custom_eventspawns(
    ctx: &MissionContext,
    ledger: &mut EditsLedger,
) -> AppResult<()> {
    let custom_path = ctx.custom_dir.join(CUSTOM_SPAWNS_FILE);
    let had_file = custom_path.exists();
    if had_file {
        let custom_groups = cfg_eventspawns_xml::parse_file(
            &custom_path,
            &ctx.workspace,
            ItemSource::Custom,
        )
        .unwrap_or_default();

        if !custom_groups.is_empty() {
            let vanilla_path = ctx.mission_root.join("cfgeventspawns.xml");
            let mut vanilla = if vanilla_path.exists() {
                cfg_eventspawns_xml::parse_file(
                    &vanilla_path,
                    &ctx.workspace,
                    ItemSource::Vanilla,
                )?
            } else {
                Vec::new()
            };
            let mut idx: HashMap<String, usize> = vanilla
                .iter()
                .enumerate()
                .map(|(i, g)| (g.event_name.clone(), i))
                .collect();

            let mut changed = false;
            for g in custom_groups {
                for p in &g.positions {
                    if let Some(&i) = idx.get(&g.event_name) {
                        if !vanilla[i].positions.iter().any(|vp| pos_equal(vp, p)) {
                            vanilla[i].positions.push(p.clone());
                            ledger
                                .eventspawns
                                .record_addition(to_position_ref(&g.event_name, p));
                            changed = true;
                        }
                    } else {
                        // Event didn't exist in vanilla at all.
                        let mut moved = g.clone();
                        moved.positions = vec![p.clone()];
                        moved.source = ItemSource::Vanilla;
                        moved.file = rel_slash(&ctx.workspace, &vanilla_path);
                        moved.mod_id = None;
                        idx.insert(g.event_name.clone(), vanilla.len());
                        vanilla.push(moved);
                        ledger
                            .eventspawns
                            .record_addition(to_position_ref(&g.event_name, p));
                        changed = true;
                    }
                }
            }

            if changed {
                cfg_eventspawns_xml::write_groups(&vanilla_path, &vanilla)?;
            }
        }

        // Even if the file was empty, remove it — it's unused.
        let _ = std::fs::remove_file(&custom_path);
    }

    // Strip the unsupported `eventposdef` registration. DayZ silently
    // ignores it, but leaving it around invites confusion and may
    // trigger partial CE-load bugs on some versions.
    if ctx.cfgeconomycore_path.exists() {
        let mut eco = EconomyCore::parse_file(&ctx.cfgeconomycore_path)?;
        let before = eco.ce_blocks();
        let dropped = eco.remove_ce_files(|block_folder, file| {
            block_folder == "custom"
                && file.name == CUSTOM_SPAWNS_FILE
                && file.file_type == "eventposdef"
        });
        if dropped > 0 {
            // Keep `custom` last (Phase-2 invariant) after editing.
            eco.move_folder_to_end("custom");
            eco.write_file(&ctx.cfgeconomycore_path)?;
            let after = eco.ce_blocks();
            if after.len() != before.len() {
                log::info!("unregistered {} dead eventposdef entries", dropped);
            }
        }
    }

    Ok(())
}

pub fn remove_from_custom(
    ctx: &MissionContext,
    event_names: &[String],
) -> AppResult<usize> {
    let mut removed = 0;

    let events_path = ctx.custom_dir.join(CUSTOM_EVENTS_FILE);
    if events_path.exists() {
        let mut existing =
            events_xml::parse_file(&events_path, &ctx.workspace, ItemSource::Custom)?;
        let before = existing.len();
        existing.retain(|e| !event_names.iter().any(|n| n == &e.name));
        removed += before - existing.len();
        events_xml::write_events(&events_path, &existing)?;
    }

    let spawns_path = ctx.custom_dir.join(CUSTOM_SPAWNS_FILE);
    if spawns_path.exists() {
        let mut existing = cfg_eventspawns_xml::parse_file(
            &spawns_path,
            &ctx.workspace,
            ItemSource::Custom,
        )?;
        let before = existing.len();
        existing.retain(|g| !event_names.iter().any(|n| n == &g.event_name));
        let diff = before - existing.len();
        if diff > 0 {
            cfg_eventspawns_xml::write_groups(&spawns_path, &existing)?;
        }
    }

    Ok(removed)
}

pub fn ensure_registered(
    ctx: &MissionContext,
    events: bool,
) -> AppResult<()> {
    if !events {
        return Ok(());
    }
    let wanted = [CeFile {
        name: CUSTOM_EVENTS_FILE.into(),
        file_type: "events".into(),
    }];
    let mut eco = if ctx.cfgeconomycore_path.exists() {
        EconomyCore::parse_file(&ctx.cfgeconomycore_path)?
    } else {
        EconomyCore::empty()
    };
    let added = eco.ensure_ce_block("custom", &wanted);
    // Custom block must be last so our overrides win over mod defaults
    // (DayZ loads ce blocks in document order). See items::ensure_registered.
    let moved = eco.move_folder_to_end("custom");
    if added || moved {
        eco.write_file(&ctx.cfgeconomycore_path)?;
    }
    Ok(())
}

pub fn raw_xml_for_event(event: &DynamicEvent) -> AppResult<String> {
    let s = events_xml::serialize(std::slice::from_ref(event))?;
    Ok(s.lines()
        .filter(|l| !l.trim_start().starts_with("<?xml"))
        .collect::<Vec<_>>()
        .join("\n"))
}

fn rel_slash(root: &Path, path: &Path) -> String {
    match path.strip_prefix(root) {
        Ok(rel) => rel
            .components()
            .map(|c| c.as_os_str().to_string_lossy().into_owned())
            .collect::<Vec<_>>()
            .join("/"),
        Err(_) => path.to_string_lossy().replace('\\', "/"),
    }
}

/// Exact-value equality for two event positions. Used to skip
/// writing vanilla-round-tripped positions into the custom file.
/// f64 `==` is intentional — we preserve the parsed floats byte-for-
/// byte, so unmodified vanilla entries compare equal and get
/// filtered out.
fn pos_equal(
    a: &crate::domain::EventPosition,
    b: &crate::domain::EventPosition,
) -> bool {
    a.x == b.x && a.y == b.y && a.z == b.z && a.a == b.a && a.group == b.group
}

/// Outcome of reapplying the edits ledger to a freshly pulled
/// `cfgeventspawns.xml`. Surfaced to the UI as a post-pull toast
/// ("reapplied N edits from your ledger"). Skipped entries are
/// already-present additions or already-absent removals — no-ops.
#[derive(Debug, Clone, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconcileReport {
    pub added: Vec<PositionRef>,
    pub removed: Vec<PositionRef>,
    pub skipped_additions: Vec<PositionRef>,
    pub skipped_removals: Vec<PositionRef>,
}

impl ReconcileReport {
    pub fn is_noop(&self) -> bool {
        self.added.is_empty() && self.removed.is_empty()
    }
}

/// Reapply the edits ledger against the mission's current
/// `cfgeventspawns.xml`. Idempotent — entries already in the
/// desired state are counted as skipped. Called after every pull
/// so a fresh workspace ends up with the operator's edits
/// re-stamped onto whatever the server shipped.
pub fn reconcile_eventspawns(
    ctx: &MissionContext,
    edits_dir: &Path,
    profile_id: &str,
) -> AppResult<ReconcileReport> {
    let ledger = edits::load(edits_dir, profile_id);
    let mut report = ReconcileReport::default();
    if ledger.is_empty() {
        return Ok(report);
    }

    let path = ctx.mission_root.join("cfgeventspawns.xml");
    let mut existing = if path.exists() {
        cfg_eventspawns_xml::parse_file(
            &path,
            &ctx.workspace,
            ItemSource::Vanilla,
        )?
    } else {
        Vec::new()
    };
    let mut changed = false;

    // Additions: add each if absent.
    for a in &ledger.eventspawns.additions {
        let pos_value = crate::domain::EventPosition {
            x: a.x,
            y: a.y,
            z: a.z,
            a: a.a,
            group: a.group.clone(),
        };
        let group_idx = existing
            .iter()
            .position(|g| g.event_name == a.event_name);
        match group_idx {
            Some(i) => {
                if existing[i].positions.iter().any(|p| pos_equal(p, &pos_value)) {
                    report.skipped_additions.push(a.clone());
                } else {
                    existing[i].positions.push(pos_value);
                    report.added.push(a.clone());
                    changed = true;
                }
            }
            None => {
                // Event itself disappeared from vanilla. Create a
                // fresh entry — the user's intent to have this
                // position survives regardless of upstream changes.
                let mut g = EventSpawnGroup {
                    event_name: a.event_name.clone(),
                    positions: vec![pos_value],
                    source: ItemSource::Vanilla,
                    mod_id: None,
                    file: rel_slash(&ctx.workspace, &path),
                };
                g.positions[0].group = a.group.clone();
                existing.push(g);
                report.added.push(a.clone());
                changed = true;
            }
        }
    }

    // Removals: strip each if present.
    for r in &ledger.eventspawns.removals {
        let pos_value = crate::domain::EventPosition {
            x: r.x,
            y: r.y,
            z: r.z,
            a: r.a,
            group: r.group.clone(),
        };
        let mut did_remove = false;
        if let Some(g) = existing
            .iter_mut()
            .find(|g| g.event_name == r.event_name)
        {
            let before = g.positions.len();
            g.positions.retain(|p| !pos_equal(p, &pos_value));
            did_remove = g.positions.len() != before;
        }
        if did_remove {
            report.removed.push(r.clone());
            changed = true;
        } else {
            report.skipped_removals.push(r.clone());
        }
    }

    if changed {
        cfg_eventspawns_xml::write_groups(&path, &existing)?;
    }
    Ok(report)
}

/// Build the "not-custom" events baseline: vanilla `db/events.xml`
/// plus every events file registered in cfgeconomycore under a
/// folder other than `custom`. Later entries overwrite earlier ones
/// by name — matches DayZ's own load order so we dedup against the
/// same effective state the server sees.
fn load_non_custom_events_baseline(
    ctx: &MissionContext,
) -> AppResult<HashMap<String, DynamicEvent>> {
    let mut baseline: HashMap<String, DynamicEvent> = HashMap::new();

    let vanilla_path = ctx.db_dir.join("events.xml");
    if vanilla_path.exists() {
        for e in events_xml::parse_file(
            &vanilla_path,
            &ctx.workspace,
            ItemSource::Vanilla,
        )? {
            baseline.insert(e.name.clone(), e);
        }
    }

    if ctx.cfgeconomycore_path.exists() {
        let core = EconomyCore::parse_file(&ctx.cfgeconomycore_path)?;
        for block in core.ce_blocks() {
            if block.folder == "custom" {
                continue;
            }
            let folder_path = ctx.mission_root.join(&block.folder);
            for file in block.files {
                if file.file_type != "events" {
                    continue;
                }
                let events_path = folder_path.join(&file.name);
                if !events_path.exists() {
                    continue;
                }
                if let Ok(entries) = events_xml::parse_file(
                    &events_path,
                    &ctx.workspace,
                    ItemSource::Mod,
                ) {
                    for e in entries {
                        baseline.insert(e.name.clone(), e);
                    }
                }
            }
        }
    }

    Ok(baseline)
}

/// Compare two events by content — ignoring metadata fields
/// (`source`, `mod_id`, `file`) that track origin, not semantics.
/// Used to prune custom-file entries that match the effective
/// baseline (vanilla + non-custom CE sources) so we only persist
/// the operator's actual edits.
fn event_content_equal(a: &DynamicEvent, b: &DynamicEvent) -> bool {
    if a.name != b.name
        || a.nominal != b.nominal
        || a.min != b.min
        || a.max != b.max
        || a.lifetime != b.lifetime
        || a.restock != b.restock
        || a.saferadius != b.saferadius
        || a.distanceradius != b.distanceradius
        || a.cleanupradius != b.cleanupradius
        || a.secondary != b.secondary
        || a.flags.deletable != b.flags.deletable
        || a.flags.init_random != b.flags.init_random
        || a.flags.remove_damaged != b.flags.remove_damaged
        || a.position != b.position
        || a.limit != b.limit
        || a.active != b.active
    {
        return false;
    }
    children_equal(&a.children, &b.children)
        && children_equal(&a.children_ex, &b.children_ex)
}

fn children_equal(
    a: &[crate::domain::EventChild],
    b: &[crate::domain::EventChild],
) -> bool {
    a.len() == b.len()
        && a.iter().zip(b.iter()).all(|(x, y)| {
            x.type_name == y.type_name
                && x.max == y.max
                && x.min == y.min
                && x.lootmax == y.lootmax
                && x.lootmin == y.lootmin
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{EventPosition, EventSpawnGroup};
    use std::fs;
    use tempfile::TempDir;

    fn ctx_in(td: &TempDir) -> MissionContext {
        let workspace = td.path().to_path_buf();
        let mission_root = workspace.join("mpmissions/dayzOffline.chernarusplus");
        let custom_dir = mission_root.join("custom");
        let db_dir = mission_root.join("db");
        let cfgeconomycore_path = mission_root.join("cfgeconomycore.xml");
        fs::create_dir_all(&mission_root).unwrap();
        fs::create_dir_all(&custom_dir).unwrap();
        fs::create_dir_all(&db_dir).unwrap();
        // Seed a minimal cfgeconomycore so ensure_registered can
        // round-trip without blowing up.
        fs::write(
            &cfgeconomycore_path,
            "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\" ?>\n<economy_core>\n</economy_core>\n",
        )
        .unwrap();
        MissionContext {
            workspace,
            mission_root,
            custom_dir,
            db_dir,
            cfgeconomycore_path,
        }
    }

    fn pos(x: f64, y: f64, z: f64, a: f64) -> EventPosition {
        EventPosition { x, y, z, a, group: None }
    }

    fn group(name: &str, positions: Vec<EventPosition>) -> EventSpawnGroup {
        EventSpawnGroup {
            event_name: name.to_string(),
            positions,
            source: ItemSource::Vanilla,
            mod_id: None,
            file: String::new(),
        }
    }

    fn write_vanilla_eventspawns(ctx: &MissionContext, body: &str) {
        let path = ctx.mission_root.join("cfgeventspawns.xml");
        fs::write(&path, body).unwrap();
    }

    fn edits_dir(td: &TempDir) -> std::path::PathBuf {
        td.path().join("edits")
    }

    /// Core: a new position lands in the main `cfgeventspawns.xml`
    /// (not a custom file — CE doesn't honour that), and the edit
    /// ledger records it as an addition so future reconciliation
    /// can re-apply it after a pull overwrites the file.
    #[test]
    fn upsert_writes_new_position_into_vanilla_and_ledger() {
        let td = TempDir::new().unwrap();
        let ctx = ctx_in(&td);
        let edits = edits_dir(&td);
        write_vanilla_eventspawns(
            &ctx,
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<eventposdef>
  <event name="VehicleMH6Helicopter">
    <pos x="4169.207031" y="338.414795" z="10990.304688" a="71.035965" />
  </event>
</eventposdef>
"#,
        );

        let incoming = group(
            "VehicleMH6Helicopter",
            vec![
                // Existing vanilla position, unchanged.
                pos(4169.207031, 338.414795, 10990.304688, 71.035965),
                // Operator's new one.
                pos(4511.0, 123.0, 10167.0, -1.0),
            ],
        );

        upsert_into_custom(&ctx, &[], &[incoming], &edits, "p1").unwrap();

        // Main file must contain both.
        let vanilla_path = ctx.mission_root.join("cfgeventspawns.xml");
        let written = fs::read_to_string(&vanilla_path).unwrap();
        assert!(written.contains("4169.207031"));
        assert!(written.contains("x=\"4511\""));
        // No custom file.
        assert!(
            !ctx.custom_dir.join(CUSTOM_SPAWNS_FILE).exists(),
            "should not create cfgeventspawns_custom.xml",
        );
        // Ledger captured the delta.
        let ledger = crate::edits::load(&edits, "p1");
        assert_eq!(ledger.eventspawns.additions.len(), 1);
        assert_eq!(
            ledger.eventspawns.additions[0].event_name,
            "VehicleMH6Helicopter",
        );
        assert_eq!(ledger.eventspawns.additions[0].x, 4511.0);
        assert!(ledger.eventspawns.removals.is_empty());
    }

    /// Removing a vanilla position: main file loses it, ledger
    /// records a removal so reconcile can strip it again if a fresh
    /// pull brings it back.
    #[test]
    fn upsert_records_removal_when_vanilla_position_drops() {
        let td = TempDir::new().unwrap();
        let ctx = ctx_in(&td);
        let edits = edits_dir(&td);
        write_vanilla_eventspawns(
            &ctx,
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<eventposdef>
  <event name="VehicleUAZ">
    <pos x="1.0" y="2.0" z="3.0" a="0.0" />
    <pos x="10.0" y="20.0" z="30.0" a="0.0" />
  </event>
</eventposdef>
"#,
        );
        // Caller sends only one of the two positions.
        let incoming = group("VehicleUAZ", vec![pos(1.0, 2.0, 3.0, 0.0)]);
        upsert_into_custom(&ctx, &[], &[incoming], &edits, "p1").unwrap();

        let written = fs::read_to_string(ctx.mission_root.join("cfgeventspawns.xml"))
            .unwrap();
        assert!(written.contains("x=\"1\""));
        assert!(!written.contains("x=\"10\""));

        let ledger = crate::edits::load(&edits, "p1");
        assert_eq!(ledger.eventspawns.removals.len(), 1);
        assert_eq!(ledger.eventspawns.removals[0].x, 10.0);
        assert!(ledger.eventspawns.additions.is_empty());
    }

    /// Any legacy `cfgeventspawns_custom.xml` written by earlier
    /// versions of this app gets migrated into the main file on
    /// the first save. The unsupported `<file type="eventposdef">`
    /// registration in cfgeconomycore gets stripped.
    #[test]
    fn upsert_migrates_legacy_custom_file_into_vanilla() {
        let td = TempDir::new().unwrap();
        let ctx = ctx_in(&td);
        let edits = edits_dir(&td);
        write_vanilla_eventspawns(
            &ctx,
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<eventposdef>
  <event name="VehicleUAZ">
    <pos x="1.0" y="2.0" z="3.0" a="0.0" />
  </event>
</eventposdef>
"#,
        );
        // Seed a stale custom file with a user-added position.
        fs::write(
            ctx.custom_dir.join(CUSTOM_SPAWNS_FILE),
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<eventposdef>
  <event name="VehicleUAZ">
    <pos x="99.0" y="99.0" z="99.0" a="0.0" />
  </event>
</eventposdef>
"#,
        )
        .unwrap();
        // Register the dead eventposdef entry.
        fs::write(
            &ctx.cfgeconomycore_path,
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<economy_core>
  <ce folder="custom">
    <file name="events_custom.xml" type="events"/>
    <file name="cfgeventspawns_custom.xml" type="eventposdef"/>
  </ce>
</economy_core>
"#,
        )
        .unwrap();

        // Trigger an empty save — the migration must still run.
        upsert_into_custom(&ctx, &[], &[], &edits, "p1").unwrap();

        // Custom file gone.
        assert!(
            !ctx.custom_dir.join(CUSTOM_SPAWNS_FILE).exists(),
            "stale custom file should be deleted",
        );
        // Main file got the migrated position.
        let vanilla_body = fs::read_to_string(
            ctx.mission_root.join("cfgeventspawns.xml"),
        )
        .unwrap();
        assert!(
            vanilla_body.contains("x=\"99\""),
            "migrated position missing from vanilla:\n{vanilla_body}",
        );
        // eventposdef registration gone.
        let eco = fs::read_to_string(&ctx.cfgeconomycore_path).unwrap();
        assert!(
            !eco.contains("cfgeventspawns_custom.xml"),
            "dead eventposdef registration not stripped:\n{eco}",
        );
        // Events registration (supported) kept.
        assert!(eco.contains("events_custom.xml"));
        // Ledger recorded the migration as an addition.
        let ledger = crate::edits::load(&edits, "p1");
        assert_eq!(ledger.eventspawns.additions.len(), 1);
        assert_eq!(ledger.eventspawns.additions[0].x, 99.0);
    }

    const VANILLA_EVENTS_XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<events>
  <event name="VehicleUAZ">
    <nominal>5</nominal>
    <min>1</min>
    <max>7</max>
    <lifetime>300</lifetime>
    <restock>0</restock>
    <saferadius>500</saferadius>
    <distanceradius>500</distanceradius>
    <cleanupradius>200</cleanupradius>
    <flags deletable="0" init_random="0" remove_damaged="1"/>
    <position>fixed</position>
    <limit>mixed</limit>
    <active>1</active>
    <children>
      <child lootmax="0" lootmin="0" max="1" min="1" type="Offroad_UAZ"/>
    </children>
  </event>
  <event name="InfectedArmy">
    <nominal>20</nominal>
    <min>10</min>
    <max>40</max>
    <lifetime>180</lifetime>
    <restock>0</restock>
    <saferadius>50</saferadius>
    <distanceradius>60</distanceradius>
    <cleanupradius>100</cleanupradius>
    <flags deletable="0" init_random="0" remove_damaged="0"/>
    <position>player</position>
    <limit>child</limit>
    <active>1</active>
  </event>
</events>
"#;

    fn write_vanilla_events_xml(ctx: &MissionContext, body: &str) {
        fs::write(ctx.db_dir.join("events.xml"), body).unwrap();
    }

    fn dyn_event(name: &str) -> DynamicEvent {
        // Round-trips a vanilla entry through the parser so its
        // struct shape matches what a real load produces.
        let xml = format!(
            r#"<?xml version="1.0"?><events>{}</events>"#,
            VANILLA_EVENTS_XML
                .split_once(&format!("<event name=\"{name}\">"))
                .map(|(_, rest)| {
                    let body = rest
                        .split_once("</event>")
                        .map(|(a, _)| a)
                        .unwrap_or("");
                    format!("<event name=\"{name}\">{body}</event>")
                })
                .unwrap(),
        );
        events_xml::parse_bytes(xml.as_bytes(), ItemSource::Vanilla, "t")
            .unwrap()
            .into_iter()
            .next()
            .unwrap()
    }

    /// Regression: the map-save flow ships the entire event table
    /// to the backend even when only positions changed. If we write
    /// all 70 vanilla events into `events_custom.xml`, DayZ's CE
    /// init crashes on boot. Backend must dedup against the
    /// baseline and skip writing entries that match vanilla.
    #[test]
    fn upsert_skips_events_that_match_vanilla() {
        let td = TempDir::new().unwrap();
        let ctx = ctx_in(&td);
        write_vanilla_events_xml(&ctx, VANILLA_EVENTS_XML);

        // Caller sends both vanilla events unchanged (simulating
        // the map-save flow sending the whole merged list).
        let edits = edits_dir(&td);
        upsert_into_custom(
            &ctx,
            &[dyn_event("VehicleUAZ"), dyn_event("InfectedArmy")],
            &[],
            &edits,
            "p1",
        )
        .unwrap();

        let custom_path = ctx.custom_dir.join(CUSTOM_EVENTS_FILE);
        if custom_path.exists() {
            let body = fs::read_to_string(&custom_path).unwrap();
            assert!(
                !body.contains("<event name=\"VehicleUAZ\">"),
                "vanilla-unchanged event leaked into custom:\n{body}",
            );
            assert!(
                !body.contains("<event name=\"InfectedArmy\">"),
                "vanilla-unchanged event leaked into custom:\n{body}",
            );
        }
    }

    /// Regression: prior buggy saves left a bloated custom events
    /// file on disk. Subsequent saves (even ones that add no new
    /// events — e.g. map-page position-only edit) must prune those
    /// entries so the file doesn't shadow the baseline any more.
    #[test]
    fn upsert_prunes_stale_custom_events_that_match_baseline() {
        let td = TempDir::new().unwrap();
        let ctx = ctx_in(&td);
        write_vanilla_events_xml(&ctx, VANILLA_EVENTS_XML);

        // Seed a bloated custom file (every vanilla event cloned).
        let seeded = dyn_event("VehicleUAZ");
        let seeded_body = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<events>
  <event name="VehicleUAZ">
    <nominal>{}</nominal>
    <min>{}</min>
    <max>{}</max>
    <lifetime>{}</lifetime>
    <restock>{}</restock>
    <saferadius>{}</saferadius>
    <distanceradius>{}</distanceradius>
    <cleanupradius>{}</cleanupradius>
    <flags deletable="{}" init_random="{}" remove_damaged="{}"/>
    <position>{}</position>
    <limit>{}</limit>
    <active>{}</active>
    <children>
      <child lootmax="0" lootmin="0" max="1" min="1" type="Offroad_UAZ"/>
    </children>
  </event>
</events>
"#,
            seeded.nominal,
            seeded.min,
            seeded.max,
            seeded.lifetime,
            seeded.restock,
            seeded.saferadius,
            seeded.distanceradius,
            seeded.cleanupradius,
            seeded.flags.deletable,
            seeded.flags.init_random,
            seeded.flags.remove_damaged,
            match seeded.position {
                crate::domain::PositionKind::Fixed => "fixed",
                crate::domain::PositionKind::Random => "random",
                crate::domain::PositionKind::Player => "player",
                crate::domain::PositionKind::Uniform => "uniform",
            },
            match seeded.limit {
                crate::domain::EventLimit::Mixed => "mixed",
                crate::domain::EventLimit::Child => "child",
                crate::domain::EventLimit::Parent => "parent",
                crate::domain::EventLimit::Custom => "custom",
            },
            seeded.active,
        );
        let custom_path = ctx.custom_dir.join(CUSTOM_EVENTS_FILE);
        fs::write(&custom_path, &seeded_body).unwrap();

        // Now save WITHOUT any event updates (e.g. map flow that
        // only edits spawn positions). The stale custom entry
        // should still get pruned.
        let edits = edits_dir(&td);
        upsert_into_custom(&ctx, &[], &[], &edits, "p1").unwrap();

        let after = fs::read_to_string(&custom_path).unwrap_or_default();
        assert!(
            !after.contains("<event name=\"VehicleUAZ\">"),
            "stale vanilla-clone not pruned on save:\n{after}",
        );
    }

    /// After a pull replaces cfgeventspawns.xml with the server's
    /// copy (losing the operator's custom position), reconcile
    /// reapplies the ledger addition to restore it.
    #[test]
    fn reconcile_reapplies_ledger_additions_after_pull() {
        let td = TempDir::new().unwrap();
        let ctx = ctx_in(&td);
        let edits = edits_dir(&td);

        // First save: add a position and let the ledger record it.
        write_vanilla_eventspawns(
            &ctx,
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<eventposdef>
  <event name="VehicleUAZ">
    <pos x="1.0" y="2.0" z="3.0" a="0.0" />
  </event>
</eventposdef>
"#,
        );
        let incoming = group(
            "VehicleUAZ",
            vec![
                pos(1.0, 2.0, 3.0, 0.0),
                pos(500.0, 50.0, 500.0, -1.0),
            ],
        );
        upsert_into_custom(&ctx, &[], &[incoming], &edits, "p1").unwrap();

        // Simulate a pull: server's cfgeventspawns.xml overwrites
        // the workspace version, dropping the user's added position.
        write_vanilla_eventspawns(
            &ctx,
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<eventposdef>
  <event name="VehicleUAZ">
    <pos x="1.0" y="2.0" z="3.0" a="0.0" />
  </event>
</eventposdef>
"#,
        );

        let report = reconcile_eventspawns(&ctx, &edits, "p1").unwrap();
        assert_eq!(report.added.len(), 1);
        assert_eq!(report.added[0].x, 500.0);
        assert!(report.removed.is_empty());

        let vanilla =
            fs::read_to_string(ctx.mission_root.join("cfgeventspawns.xml")).unwrap();
        assert!(
            vanilla.contains("x=\"500\""),
            "reconciled position missing:\n{vanilla}",
        );

        // Second reconcile is idempotent — nothing to do.
        let r2 = reconcile_eventspawns(&ctx, &edits, "p1").unwrap();
        assert!(r2.is_noop(), "reconcile should be idempotent: {r2:?}");
    }

    /// Symmetric case: operator removed a vanilla position, Bohemia
    /// ships an update that restores it, reconcile strips it again.
    #[test]
    fn reconcile_reapplies_ledger_removals_after_pull() {
        let td = TempDir::new().unwrap();
        let ctx = ctx_in(&td);
        let edits = edits_dir(&td);

        write_vanilla_eventspawns(
            &ctx,
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<eventposdef>
  <event name="VehicleUAZ">
    <pos x="1.0" y="2.0" z="3.0" a="0.0" />
    <pos x="10.0" y="20.0" z="30.0" a="0.0" />
  </event>
</eventposdef>
"#,
        );
        // Operator removes the second position.
        upsert_into_custom(
            &ctx,
            &[],
            &[group("VehicleUAZ", vec![pos(1.0, 2.0, 3.0, 0.0)])],
            &edits,
            "p1",
        )
        .unwrap();

        // Server ships an update that puts the position back.
        write_vanilla_eventspawns(
            &ctx,
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<eventposdef>
  <event name="VehicleUAZ">
    <pos x="1.0" y="2.0" z="3.0" a="0.0" />
    <pos x="10.0" y="20.0" z="30.0" a="0.0" />
  </event>
</eventposdef>
"#,
        );

        let report = reconcile_eventspawns(&ctx, &edits, "p1").unwrap();
        assert_eq!(report.removed.len(), 1);
        assert_eq!(report.removed[0].x, 10.0);
        let vanilla =
            fs::read_to_string(ctx.mission_root.join("cfgeventspawns.xml")).unwrap();
        assert!(!vanilla.contains("x=\"10\""));
    }
}
