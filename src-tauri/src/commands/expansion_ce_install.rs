//! Install Expansion's CE content into a pulled mission.
//!
//! Follows Expansion's own installation guide:
//!  1. Copy `expansion_ce/` (types + spawnabletypes + events) into
//!     `mpmissions/<map>/`.
//!  2. Register that folder in `cfgeconomycore.xml` via a new
//!     `<ce folder="expansion_ce">` block. The `custom` folder
//!     anchor stays last per the Phase 2 invariant.
//!  3. Append the Expansion vehicle / loot event-spawn blocks to
//!     `cfgeventspawns.xml` by name — existing same-name events
//!     are left untouched.
//!
//! Source of truth is the upstream Expansion repo:
//!
//!   https://github.com/ExpansionModTeam/DayZ-Expansion-Missions
//!
//! …specifically `Template/<Map>/` on the `master` branch. Install
//! fetches the XML fresh every time so operators always land on
//! the current upstream. Install is idempotent: re-running after
//! an Expansion bump re-copies the CE files and appends any newly
//! added event spawn groups.

use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::time::Duration;

use serde::Serialize;
use tauri::State;

use crate::domain::ItemSource;
use crate::error::{AppError, AppResult};
use crate::git_ops;
use crate::mission::MissionContext;
use crate::parsers::cfg_economy_core::{CeFile, EconomyCore};
use crate::parsers::cfg_eventspawns_xml;
use crate::profiles::MapId;
use crate::state::AppState;

// ---------- Upstream source ----------

const UPSTREAM_BASE: &str =
    "https://raw.githubusercontent.com/ExpansionModTeam/DayZ-Expansion-Missions/refs/heads/master/Template";

const FETCH_TIMEOUT: Duration = Duration::from_secs(30);

const CE_FOLDER: &str = "expansion_ce";
const TYPES_FILE: &str = "expansion_types.xml";
const SPAWNABLE_FILE: &str = "expansion_spawnabletypes.xml";
const EVENTS_FILE: &str = "expansion_events.xml";
const EVENTSPAWNS_FILE: &str = "cfgeventspawns.xml";
const CE_TYPES_REL: &str = "expansion_ce/expansion_types.xml";
const CE_SPAWNABLE_REL: &str = "expansion_ce/expansion_spawnabletypes.xml";
const CE_EVENTS_REL: &str = "expansion_ce/expansion_events.xml";

/// Maps the profile's `MapId` to the folder name under
/// `Template/` in the upstream repo. Livonia is named `Livonia`
/// in the upstream tree even though its classname is `enoch`.
fn template_dir_for(map: MapId) -> &'static str {
    match map {
        MapId::Chernarusplus => "Chernarus",
        MapId::Enoch => "Livonia",
        MapId::Sakhal => "Sakhal",
        MapId::Custom => "Chernarus",
    }
}

// ---------- Public command surface ----------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpansionCeStatus {
    /// Upstream folder this install would pull from, given the
    /// profile's map. Surfaced so the UI can say *where* the files
    /// come from (and warn about `MapId::Custom` falling back).
    pub upstream_template: String,
    pub upstream_base: String,
    pub types_file_exists: bool,
    pub spawnable_types_file_exists: bool,
    pub events_file_exists: bool,
    /// `<ce folder="expansion_ce">` is present with all 3 files in
    /// cfgeconomycore.xml.
    pub registered_in_cfg: bool,
    /// Sentinel: upstream's `cfgeventspawns.xml` always contains
    /// at least `VehicleUAZ` — if present in the workspace file
    /// we treat the eventspawns merge as done. Install reports
    /// the exact added/skipped list when run.
    pub eventspawns_sentinel_present: bool,
    /// Composite: all 4 components are in place.
    pub fully_installed: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpansionCeInstallReport {
    pub upstream_template: String,
    pub wrote_types: bool,
    pub wrote_spawnable_types: bool,
    pub wrote_events: bool,
    pub registered_in_cfg: bool,
    pub eventspawns_added: Vec<String>,
    pub eventspawns_skipped: Vec<String>,
    /// Set when the install had to rewrite cfgeventspawns.xml to
    /// repair the upstream trailing-whitespace attribute bug (even
    /// when no new events were appended). Signals the operator
    /// that something was fixed.
    pub eventspawns_file_repaired: bool,
    /// Byte sizes of the three CE files after install — so the UI
    /// can show "484 types · 98 spawnabletypes · 13 events"-style
    /// summary without re-parsing on the frontend.
    pub types_bytes: u64,
    pub spawnable_types_bytes: u64,
    pub events_bytes: u64,
}

/// A sentinel Expansion-only event name that upstream has always
/// shipped. Used by the status check to detect "eventspawns merge
/// was done at some point". Matches the `cfgeventspawns.xml`
/// fragment in the Expansion Template repo.
const EVENTSPAWN_SENTINEL: &str = "VehicleUAZ";

#[tauri::command]
pub async fn expansion_ce_status(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<ExpansionCeStatus> {
    let (ctx, map) = ctx_for(&id, &state).await?;
    status_from_ctx(&ctx, map)
}

#[tauri::command]
pub async fn expansion_ce_install(
    id: String,
    state: State<'_, AppState>,
) -> AppResult<ExpansionCeInstallReport> {
    let (ctx, map) = ctx_for(&id, &state).await?;
    let template = template_dir_for(map).to_string();
    let fetched = fetch_bundle(&template).await?;
    let report = install_into_mission(&ctx.mission_root, &template, &fetched)?;
    let touched = report.wrote_types
        || report.wrote_spawnable_types
        || report.wrote_events
        || report.registered_in_cfg
        || !report.eventspawns_added.is_empty()
        || report.eventspawns_file_repaired;
    if touched {
        let _ = git_ops::commit_all(
            &ctx.workspace,
            "install(expansion-ce): types + spawnabletypes + events + eventspawns (upstream)",
        );
    }
    Ok(report)
}

// ---------- Context helpers ----------

async fn ctx_for(
    id: &str,
    state: &State<'_, AppState>,
) -> AppResult<(MissionContext, MapId)> {
    let profile = {
        let store = state.profiles.lock().await;
        store.get(id)?
    };
    let workspace = state.workspace_for(id);
    if !workspace.exists() {
        return Err(AppError::Sync(
            "workspace does not exist — pull first".into(),
        ));
    }
    let map = profile.map;
    let ctx = MissionContext::resolve(&workspace, &profile)?;
    Ok((ctx, map))
}

// ---------- Status ----------

fn status_from_ctx(
    ctx: &MissionContext,
    map: MapId,
) -> AppResult<ExpansionCeStatus> {
    let ce_dir = ctx.mission_root.join(CE_FOLDER);
    let types_file_exists = ce_dir.join(TYPES_FILE).exists();
    let spawnable_types_file_exists = ce_dir.join(SPAWNABLE_FILE).exists();
    let events_file_exists = ce_dir.join(EVENTS_FILE).exists();

    let registered_in_cfg = check_registered(&ctx.mission_root)?;

    let eventspawns_sentinel_present =
        eventspawns_contains(&ctx.mission_root, EVENTSPAWN_SENTINEL)?;

    let fully_installed = types_file_exists
        && spawnable_types_file_exists
        && events_file_exists
        && registered_in_cfg
        && eventspawns_sentinel_present;

    Ok(ExpansionCeStatus {
        upstream_template: template_dir_for(map).to_string(),
        upstream_base: UPSTREAM_BASE.to_string(),
        types_file_exists,
        spawnable_types_file_exists,
        events_file_exists,
        registered_in_cfg,
        eventspawns_sentinel_present,
        fully_installed,
    })
}

fn check_registered(mission_root: &Path) -> AppResult<bool> {
    let path = mission_root.join("cfgeconomycore.xml");
    if !path.exists() {
        return Ok(false);
    }
    let core = EconomyCore::parse_file(&path)?;
    let block = core
        .ce_blocks()
        .into_iter()
        .find(|b| b.folder == CE_FOLDER);
    match block {
        Some(b) => {
            let has_all = [
                (TYPES_FILE, "types"),
                (SPAWNABLE_FILE, "spawnabletypes"),
                (EVENTS_FILE, "events"),
            ]
            .iter()
            .all(|(name, ty)| {
                b.files
                    .iter()
                    .any(|f| f.name == *name && f.file_type == *ty)
            });
            Ok(has_all)
        }
        None => Ok(false),
    }
}

fn eventspawns_contains(mission_root: &Path, event_name: &str) -> AppResult<bool> {
    let path = mission_root.join(EVENTSPAWNS_FILE);
    if !path.exists() {
        return Ok(false);
    }
    let existing = cfg_eventspawns_xml::parse_bytes(
        &fs::read(&path)?,
        ItemSource::Vanilla,
        EVENTSPAWNS_FILE,
    )
    .map_err(|e| {
        AppError::Internal(format!("parsing cfgeventspawns.xml: {e}"))
    })?;
    Ok(existing.iter().any(|g| g.event_name == event_name))
}

// ---------- Fetch ----------

struct FetchedBundle {
    types: String,
    spawnable_types: String,
    events: String,
    eventspawns: String,
}

async fn fetch_bundle(template: &str) -> AppResult<FetchedBundle> {
    let client = reqwest::Client::builder()
        .user_agent("dayz-config-manager")
        .timeout(FETCH_TIMEOUT)
        .build()
        .map_err(AppError::from)?;

    // Each file goes through `fetch_with_retry` so a single TLS
    // reset / CDN blip on any one of the four doesn't blow up the
    // install. We still issue them in parallel — retries are per-
    // file and `try_join!` only fails after a file has exhausted
    // every attempt.
    let (types, spawnable_types, events, eventspawns) = tokio::try_join!(
        fetch_with_retry(&client, template, CE_TYPES_REL),
        fetch_with_retry(&client, template, CE_SPAWNABLE_REL),
        fetch_with_retry(&client, template, CE_EVENTS_REL),
        fetch_with_retry(&client, template, EVENTSPAWNS_FILE),
    )?;

    // Upstream Expansion Templates ship with attribute values that
    // carry trailing whitespace (e.g. `x="2514.898438 "`). DayZ's
    // native CE parser rejects those with "invalid float literal"
    // and crashes on boot — we normalise before anything touches
    // disk. See `sanitize_attr_whitespace` docstring for details.
    Ok(FetchedBundle {
        types: sanitize_attr_whitespace(&types),
        spawnable_types: sanitize_attr_whitespace(&spawnable_types),
        events: sanitize_attr_whitespace(&events),
        eventspawns: sanitize_attr_whitespace(&eventspawns),
    })
}

/// Strip trailing whitespace inside quoted attribute values.
///
/// Scans char-by-char tracking whether we're inside a `"..."`
/// quoted span, and when we hit a closing quote, pops any
/// preceding spaces/tabs from the output buffer. Leading
/// whitespace inside quotes is left alone — upstream doesn't emit
/// that, and stripping it would be a behavioural change.
///
/// **Why this matters**: the Expansion upstream repo currently has
/// ~162 attribute values across its Chernarus template with a
/// trailing space before the closing quote (widest offenders are
/// `expansion_types.xml` and `expansion_spawnabletypes.xml`). DayZ
/// accepts quoted strings for numeric attributes and converts them
/// via `strtod`/equivalent, which errors on trailing whitespace and
/// bubbles up as an unrecoverable CE load failure.
fn sanitize_attr_whitespace(src: &str) -> String {
    let mut out = String::with_capacity(src.len());
    let mut in_quote = false;
    for ch in src.chars() {
        if ch == '"' {
            if in_quote {
                while matches!(out.as_bytes().last(), Some(b' ' | b'\t')) {
                    out.pop();
                }
            }
            in_quote = !in_quote;
        }
        out.push(ch);
    }
    out
}

async fn fetch_one(
    client: &reqwest::Client,
    template: &str,
    rel: &str,
) -> AppResult<String> {
    let url = format!("{UPSTREAM_BASE}/{template}/{rel}");
    let resp = client.get(&url).send().await.map_err(|e| {
        AppError::Connection(format!("fetch {url}: {e}"))
    })?;
    if !resp.status().is_success() {
        return Err(AppError::Connection(format!(
            "GET {url} returned HTTP {}",
            resp.status()
        )));
    }
    resp.text().await.map_err(|e| {
        AppError::Connection(format!("read body of {url}: {e}"))
    })
}

/// Wrap `fetch_one` with bounded retry + exponential backoff. The
/// raw-githubusercontent CDN occasionally drops TLS handshakes
/// mid-flight; one transient failure used to abort the whole
/// install because `try_join!` cancelled the other in-flight
/// fetches as soon as any branch errored. A few automatic retries
/// at sub-second intervals make the install reliable on flaky
/// networks without making the operator click "Retry" themselves.
///
/// Retries cover both transport errors (TLS reset, timeout, DNS
/// blip) and 5xx responses. 4xx responses are NOT retried — those
/// are real "path doesn't exist upstream" failures and retrying
/// wouldn't change the outcome.
async fn fetch_with_retry(
    client: &reqwest::Client,
    template: &str,
    rel: &str,
) -> AppResult<String> {
    // Three attempts total with 250 ms → 750 ms → 1.5 s backoff.
    // Total worst-case wait before erroring is ~2.5 s on top of
    // whatever the per-request timeout consumes.
    const ATTEMPTS: usize = 3;
    let mut last_err: Option<AppError> = None;
    for attempt in 0..ATTEMPTS {
        if attempt > 0 {
            let delay = Duration::from_millis(250 * (1 << (attempt - 1)) * 3);
            tokio::time::sleep(delay).await;
        }
        match fetch_one(client, template, rel).await {
            Ok(body) => return Ok(body),
            Err(e) => {
                // Don't retry on permanent failures — only on
                // transport / 5xx-style transient ones. We rely
                // on the formatted message containing "HTTP 4xx"
                // to detect 4xx; that's the exact format
                // `fetch_one` emits.
                let msg = format!("{e}");
                let is_4xx = msg.contains("returned HTTP 4");
                last_err = Some(e);
                if is_4xx {
                    break;
                }
                log::warn!(
                    "expansion-ce fetch attempt {} of {} failed for {}/{}: {}",
                    attempt + 1,
                    ATTEMPTS,
                    template,
                    rel,
                    msg,
                );
            }
        }
    }
    Err(last_err.unwrap_or_else(|| {
        AppError::Connection("fetch_with_retry: no attempts".into())
    }))
}

// ---------- Install (pure, accepts fetched bytes) ----------

fn install_into_mission(
    mission_root: &Path,
    template: &str,
    bundle: &FetchedBundle,
) -> AppResult<ExpansionCeInstallReport> {
    let ce_dir = mission_root.join(CE_FOLDER);
    fs::create_dir_all(&ce_dir)?;

    let types_path = ce_dir.join(TYPES_FILE);
    let spawnable_path = ce_dir.join(SPAWNABLE_FILE);
    let events_path = ce_dir.join(EVENTS_FILE);

    let wrote_types = write_if_differs(&types_path, &bundle.types)?;
    let wrote_spawnable_types =
        write_if_differs(&spawnable_path, &bundle.spawnable_types)?;
    let wrote_events = write_if_differs(&events_path, &bundle.events)?;

    let registered_in_cfg = register_in_cfg(mission_root)?;

    let EventspawnsMergeReport {
        added: eventspawns_added,
        skipped: eventspawns_skipped,
        wrote_file: eventspawns_wrote,
    } = merge_eventspawns(mission_root, &bundle.eventspawns)?;
    // Repair-only write = wrote the file but added nothing new.
    let eventspawns_file_repaired =
        eventspawns_wrote && eventspawns_added.is_empty();

    let types_bytes = fs::metadata(&types_path).map(|m| m.len()).unwrap_or(0);
    let spawnable_types_bytes =
        fs::metadata(&spawnable_path).map(|m| m.len()).unwrap_or(0);
    let events_bytes = fs::metadata(&events_path).map(|m| m.len()).unwrap_or(0);

    Ok(ExpansionCeInstallReport {
        upstream_template: template.to_string(),
        wrote_types,
        wrote_spawnable_types,
        wrote_events,
        registered_in_cfg,
        eventspawns_added,
        eventspawns_skipped,
        eventspawns_file_repaired,
        types_bytes,
        spawnable_types_bytes,
        events_bytes,
    })
}

fn write_if_differs(path: &Path, content: &str) -> AppResult<bool> {
    if path.exists() {
        let on_disk = fs::read_to_string(path)?;
        if on_disk == content {
            return Ok(false);
        }
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, content)?;
    Ok(true)
}

fn register_in_cfg(mission_root: &Path) -> AppResult<bool> {
    let path = mission_root.join("cfgeconomycore.xml");
    let mut core = if path.exists() {
        EconomyCore::parse_file(&path)?
    } else {
        EconomyCore::empty()
    };
    let wanted = [
        CeFile {
            name: TYPES_FILE.into(),
            file_type: "types".into(),
        },
        CeFile {
            name: SPAWNABLE_FILE.into(),
            file_type: "spawnabletypes".into(),
        },
        CeFile {
            name: EVENTS_FILE.into(),
            file_type: "events".into(),
        },
    ];
    let changed_block = core.ensure_ce_block(CE_FOLDER, &wanted);
    // Keep the `custom` anchor last per the Phase 2 invariant.
    let moved = core.move_folder_to_end("custom");
    let changed = changed_block || moved;
    if changed {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        core.write_file(&path)?;
    }
    Ok(changed)
}

struct EventspawnsMergeReport {
    added: Vec<String>,
    skipped: Vec<String>,
    wrote_file: bool,
}

fn merge_eventspawns(
    mission_root: &Path,
    bundle_content: &str,
) -> AppResult<EventspawnsMergeReport> {
    let path = mission_root.join(EVENTSPAWNS_FILE);
    let had_file = path.exists();
    let raw_existing = if had_file {
        fs::read_to_string(&path)?
    } else {
        default_eventspawns_doc()
    };
    // Sanitize the existing file too — a prior run of the installer
    // (before this fix) left the upstream trailing-whitespace
    // attribute bug on disk. Running install again repairs it.
    let existing_text = sanitize_attr_whitespace(&raw_existing);
    let existing_was_repaired = had_file && existing_text != raw_existing;

    // Event names already present in the workspace file — detected
    // via the typed parser so whitespace / attribute order don't
    // matter.
    let existing_names: HashSet<String> = match cfg_eventspawns_xml::parse_bytes(
        existing_text.as_bytes(),
        ItemSource::Vanilla,
        EVENTSPAWNS_FILE,
    ) {
        Ok(groups) => groups.into_iter().map(|g| g.event_name).collect(),
        Err(_) => Default::default(),
    };

    let blocks = split_event_blocks(bundle_content);
    let mut added = Vec::new();
    let mut skipped = Vec::new();
    let mut insertions = String::new();
    for (name, block) in &blocks {
        if existing_names.contains(name) {
            skipped.push(name.clone());
        } else {
            if !insertions.is_empty() {
                insertions.push('\n');
            }
            insertions.push_str(block);
            added.push(name.clone());
        }
    }

    let wrote_file = if !added.is_empty() {
        let new_text = insert_before_closing(&existing_text, &insertions)?;
        fs::write(&path, new_text)?;
        true
    } else if existing_was_repaired {
        // Nothing new to add, but the existing file carried the
        // upstream bug — write the sanitized version back so the
        // server can boot.
        fs::write(&path, existing_text)?;
        true
    } else {
        false
    };

    Ok(EventspawnsMergeReport {
        added,
        skipped,
        wrote_file,
    })
}

fn default_eventspawns_doc() -> String {
    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\" ?>\n<eventposdef>\n</eventposdef>\n"
        .to_string()
}

fn insert_before_closing(doc: &str, insertion: &str) -> AppResult<String> {
    let idx = doc.rfind("</eventposdef>").ok_or_else(|| {
        AppError::Internal(
            "cfgeventspawns.xml missing </eventposdef> — file corrupted?"
                .into(),
        )
    })?;
    let mut out = String::with_capacity(doc.len() + insertion.len() + 4);
    out.push_str(&doc[..idx]);
    if !out.ends_with('\n') {
        out.push('\n');
    }
    out.push_str(insertion);
    if !insertion.ends_with('\n') {
        out.push('\n');
    }
    out.push_str(&doc[idx..]);
    Ok(out)
}

/// Extract each `<event name="…">…</event>` block verbatim from a
/// fragment, returning `(name, raw_text_with_leading_indent)`.
/// Byte-level scan preserves indentation, attribute quoting, and
/// position comments so the inserted text blends into the host
/// file's formatting.
fn split_event_blocks(src: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let bytes = src.as_bytes();
    let mut cursor = 0usize;
    while cursor < bytes.len() {
        let Some(open) = find_subseq(bytes, cursor, b"<event ") else {
            break;
        };
        let Some(close_start) = find_subseq(bytes, open, b"</event>") else {
            break;
        };
        let end = close_start + b"</event>".len();
        let block = &src[open..end];
        let name = extract_event_name(block).unwrap_or_default();
        let line_start = find_line_start(src, open);
        let indented = format!("{}{}", &src[line_start..open], block);
        if !name.is_empty() {
            out.push((name, indented));
        }
        cursor = end;
    }
    out
}

fn find_subseq(bytes: &[u8], from: usize, needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || from > bytes.len() {
        return None;
    }
    bytes[from..]
        .windows(needle.len())
        .position(|w| w == needle)
        .map(|p| p + from)
}

fn find_line_start(src: &str, pos: usize) -> usize {
    let bytes = src.as_bytes();
    let mut i = pos;
    while i > 0 && bytes[i - 1] != b'\n' {
        i -= 1;
    }
    i
}

fn extract_event_name(block: &str) -> Option<String> {
    let after = block.strip_prefix("<event ")?;
    let marker = "name=\"";
    let at = after.find(marker)?;
    let rest = &after[at + marker.len()..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

// ---------- Tests ----------

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    const SAMPLE_BUNDLE: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<eventposdef>
    <event name="VehicleUAZ">
        <pos x="5419.17" y="333.42" z="9886.76" a="178.72" />
    </event>
    <event name="VehicleVodnik">
        <pos x="567.56" y="503.95" z="13655.63" a="0.00" />
    </event>
    <event name="VehicleBus">
        <pos x="3366.00" y="1.95" z="2099.00" a="45.00" />
    </event>
</eventposdef>
"#;

    fn write(p: &Path, s: &str) {
        if let Some(parent) = p.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(p, s).unwrap();
    }

    #[test]
    fn template_dir_mapping_covers_every_map() {
        assert_eq!(template_dir_for(MapId::Chernarusplus), "Chernarus");
        assert_eq!(template_dir_for(MapId::Enoch), "Livonia");
        assert_eq!(template_dir_for(MapId::Sakhal), "Sakhal");
        // Custom is an intentional fallback — document + enforce.
        assert_eq!(template_dir_for(MapId::Custom), "Chernarus");
    }

    #[test]
    fn split_event_blocks_captures_all_names() {
        let blocks = split_event_blocks(SAMPLE_BUNDLE);
        assert_eq!(blocks.len(), 3);
        let names: Vec<_> = blocks.iter().map(|(n, _)| n.as_str()).collect();
        assert_eq!(names, ["VehicleUAZ", "VehicleVodnik", "VehicleBus"]);
        for (_, block) in &blocks {
            let trimmed = block.trim_start();
            assert!(trimmed.starts_with("<event "));
            assert!(block.ends_with("</event>"));
        }
    }

    #[test]
    fn insert_before_closing_preserves_prefix_and_suffix() {
        let doc = "<eventposdef>\n  <event name=\"A\"/>\n</eventposdef>\n";
        let added = "  <event name=\"B\"/>";
        let out = insert_before_closing(doc, added).unwrap();
        let a_at = out.find("name=\"A\"").unwrap();
        let b_at = out.find("name=\"B\"").unwrap();
        let close_at = out.find("</eventposdef>").unwrap();
        assert!(a_at < b_at && b_at < close_at);
    }

    #[test]
    fn write_if_differs_skips_on_byte_equal() {
        let td = TempDir::new().unwrap();
        let p = td.path().join("a.xml");
        assert!(write_if_differs(&p, "hello").unwrap());
        assert!(!write_if_differs(&p, "hello").unwrap());
        assert!(write_if_differs(&p, "there").unwrap());
        assert_eq!(fs::read_to_string(&p).unwrap(), "there");
    }

    #[test]
    fn register_in_cfg_is_idempotent() {
        let td = TempDir::new().unwrap();
        let root = td.path();
        assert!(register_in_cfg(root).unwrap());
        assert!(check_registered(root).unwrap());
        assert!(!register_in_cfg(root).unwrap());
    }

    #[test]
    fn register_in_cfg_keeps_custom_block_last() {
        let td = TempDir::new().unwrap();
        let root = td.path();
        let initial = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<economy_core>
    <ce folder="db">
        <file name="types.xml" type="types" />
    </ce>
    <ce folder="custom">
        <file name="custom_types.xml" type="types" />
    </ce>
</economy_core>"#;
        write(&root.join("cfgeconomycore.xml"), initial);
        register_in_cfg(root).unwrap();
        let out = fs::read_to_string(root.join("cfgeconomycore.xml")).unwrap();
        let expansion_at = out.find("\"expansion_ce\"").unwrap();
        let custom_at = out.find("\"custom\"").unwrap();
        assert!(expansion_at < custom_at, "expected expansion_ce before custom:\n{out}");
    }

    #[test]
    fn merge_eventspawns_appends_new_blocks() {
        let td = TempDir::new().unwrap();
        let root = td.path();
        let seed = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<eventposdef>
    <event name="VehicleCivilianSedan">
        <pos x="1.0" z="1.0" a="0.0" />
    </event>
</eventposdef>
"#;
        write(&root.join(EVENTSPAWNS_FILE), seed);
        let report = merge_eventspawns(root, SAMPLE_BUNDLE).unwrap();
        assert!(report.skipped.is_empty());
        assert_eq!(report.added, ["VehicleUAZ", "VehicleVodnik", "VehicleBus"]);
        assert!(report.wrote_file);
        let out = fs::read_to_string(root.join(EVENTSPAWNS_FILE)).unwrap();
        assert!(out.contains("VehicleCivilianSedan"));
        assert!(out.contains("VehicleUAZ"));
        assert!(out.contains("VehicleVodnik"));
    }

    #[test]
    fn merge_eventspawns_skips_existing_name() {
        let td = TempDir::new().unwrap();
        let root = td.path();
        let seed = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<eventposdef>
    <event name="VehicleUAZ">
        <pos x="9.0" z="9.0" a="0.0" />
    </event>
</eventposdef>
"#;
        write(&root.join(EVENTSPAWNS_FILE), seed);
        let report = merge_eventspawns(root, SAMPLE_BUNDLE).unwrap();
        assert!(report.skipped.contains(&"VehicleUAZ".to_string()));
        assert!(!report.added.contains(&"VehicleUAZ".to_string()));
        assert!(report.added.contains(&"VehicleVodnik".to_string()));
        // Seed's custom position preserved.
        let out = fs::read_to_string(root.join(EVENTSPAWNS_FILE)).unwrap();
        assert!(out.contains("x=\"9.0\""));
    }

    #[test]
    fn merge_eventspawns_creates_file_when_missing() {
        let td = TempDir::new().unwrap();
        let root = td.path();
        let report = merge_eventspawns(root, SAMPLE_BUNDLE).unwrap();
        assert_eq!(report.added.len(), 3);
        assert!(report.skipped.is_empty());
        assert!(report.wrote_file);
        assert!(root.join(EVENTSPAWNS_FILE).exists());
    }

    /// Regression: upstream Expansion files have attribute values
    /// like `x="2514.898438 "` with trailing whitespace. DayZ's CE
    /// parser rejects those. `sanitize_attr_whitespace` must trim.
    #[test]
    fn sanitize_attr_whitespace_trims_trailing_ws() {
        let src = r#"<pos x="1.0 " y="2.0" z="3.0 " a=" 4.0 "/>"#;
        let out = sanitize_attr_whitespace(src);
        // Trailing whitespace trimmed everywhere; leading kept.
        assert_eq!(
            out,
            r#"<pos x="1.0" y="2.0" z="3.0" a=" 4.0"/>"#,
        );
        assert!(!out.contains(" \""));
    }

    /// Regression: an existing cfgeventspawns.xml previously
    /// written by a buggy installer can still carry the upstream
    /// trailing-whitespace bug. Re-running merge must repair it
    /// even when no new event blocks are being added.
    #[test]
    fn merge_eventspawns_repairs_existing_file_on_reinstall() {
        let td = TempDir::new().unwrap();
        let root = td.path();
        // Seed has the upstream whitespace bug AND every bundled
        // event already present (so `added` stays empty).
        let seed = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<eventposdef>
    <event name="VehicleUAZ">
        <pos x="2514.898438 " y="190.0 " z="5272.0" a="95.0 " />
    </event>
    <event name="VehicleVodnik">
        <pos x="1.0" y="2.0" z="3.0" a="0.0" />
    </event>
    <event name="VehicleBus">
        <pos x="4.0" y="5.0" z="6.0" a="0.0" />
    </event>
</eventposdef>
"#;
        write(&root.join(EVENTSPAWNS_FILE), seed);
        let report = merge_eventspawns(root, SAMPLE_BUNDLE).unwrap();
        assert!(
            report.added.is_empty(),
            "sample bundle events are all present — nothing new to add",
        );
        assert!(
            report.wrote_file,
            "existing file had upstream whitespace bug — must be rewritten",
        );
        let out = fs::read_to_string(root.join(EVENTSPAWNS_FILE)).unwrap();
        assert!(
            !out.contains(" \""),
            "trailing whitespace inside quotes not cleaned up:\n{out}",
        );
    }

    #[test]
    fn install_into_mission_is_idempotent() {
        let td = TempDir::new().unwrap();
        let root = td.path();
        let bundle = FetchedBundle {
            types: "<types></types>\n".into(),
            spawnable_types: "<spawnabletypes></spawnabletypes>\n".into(),
            events: "<events></events>\n".into(),
            eventspawns: SAMPLE_BUNDLE.to_string(),
        };
        let r1 = install_into_mission(root, "Chernarus", &bundle).unwrap();
        assert!(r1.wrote_types && r1.wrote_spawnable_types && r1.wrote_events);
        assert!(r1.registered_in_cfg);
        assert_eq!(r1.eventspawns_added.len(), 3);

        let r2 = install_into_mission(root, "Chernarus", &bundle).unwrap();
        assert!(!r2.wrote_types);
        assert!(!r2.wrote_spawnable_types);
        assert!(!r2.wrote_events);
        assert!(!r2.registered_in_cfg);
        assert!(r2.eventspawns_added.is_empty());
        assert_eq!(r2.eventspawns_skipped.len(), 3);
    }
}
