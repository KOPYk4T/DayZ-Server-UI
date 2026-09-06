//! Capability tier model — the prep dependency graph the UI gates on.
//!
//! The app is a stack of capabilities, each gated by prerequisites
//! the operator has to explicitly initiate. We model that explicitly
//! so editors can render a clean "Locked" state with the unmet
//! prerequisites listed, instead of breaking with empty-state noise.
//!
//! Five tiers, each owning a chunk of prep:
//!
//!   T1 CONNECTION    — profile exists + connection works + workDir set
//!   T2 WORKSPACE     — mission files pulled at least once
//!   T3 GAME_DATA     — DePbo tools + P: drive + extracted DayZ + index
//!   T4 MODS          — mod folders scanned + their CE files imported
//!   T5 BUILD_TOOLS   — MakePbo / DSSignFile / ImageToPAA + signing key
//!
//! Each tier resolves to a `TierState` (`Ready / Stale / Todo / Warn /
//! Blocked`). The state machine is deliberately small — frontend code
//! just renders the variant.
//!
//! `capabilities_status` is the one round-trip the UI calls on every
//! Setup-page render and on capability-aware navigation; it batches
//! the per-tier checks so we don't fan out N independent queries
//! that would all need the same profile + reskin env probes.

use std::path::PathBuf;

use chrono::{DateTime, Duration, Utc};
use serde::Serialize;
use tauri::{AppHandle, State};

use crate::error::AppResult;
use crate::reskin::{mod_index, tools, vanilla_index};
use crate::state::AppState;

/// Tier identifier. Encoded as `lowercase_with_underscores` so it
/// shows up as a plain string in JSON and routes can declare their
/// dependencies as a small enum on the TS side.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CapabilityTier {
    Connection,
    Workspace,
    GameData,
    Mods,
    BuildTools,
}

/// Aggregate readiness of one tier. Granular enough to drive the
/// three UI states we render (Locked / Active / Stale) without
/// over-modelling per-step quirks.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TierState {
    /// All required steps complete + recent. Editors gating on this
    /// tier render normally.
    Ready,
    /// Required steps complete but some data is old enough to warn
    /// about (P: drive index >30d, last pull >7d, …). Editors render
    /// but can show a "consider refreshing" banner.
    Stale,
    /// At least one required step is unrun. Editors that gate on
    /// this tier render the Locked state.
    Todo,
    /// A step ran but failed or surfaced a warning the operator
    /// should look at (missing tool, unmounted P: drive after a
    /// previous successful index, …). Editors gate as if Todo.
    Warn,
    /// A previous tier in the chain isn't ready, so this one can't
    /// be evaluated yet. Surfaced separately so the UI can render a
    /// "blocked by Tier N" message rather than a generic Todo.
    Blocked,
}

/// Per-step row inside a tier — what the Setup page renders as a
/// checklist line. Frontend keys on `id` so it can attach inline
/// "run this step" actions without parsing the label string.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityStep {
    pub id: String,
    pub label: String,
    pub state: TierState,
    /// One-line summary for the row. e.g. "Indexed 3 weeks ago" or
    /// "Missing: ImageToPAA.exe". Empty when the row is purely
    /// nominal (no extra info to show).
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityTierStatus {
    pub tier: CapabilityTier,
    pub state: TierState,
    /// Human-readable label for the section header.
    pub title: String,
    /// One-liner shown beneath the title in the Setup hub.
    pub description: String,
    /// Page routes that gate on this tier becoming `Ready`. The
    /// frontend uses this to render "Unlocks: Items, Events, …" so
    /// operators see consequences before they take action.
    pub unlocks: Vec<String>,
    pub steps: Vec<CapabilityStep>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilitiesStatus {
    pub tiers: Vec<CapabilityTierStatus>,
    /// `true` when every non-optional tier is `Ready`. The header
    /// pill in Setup uses this for its overall "ready to edit"
    /// indicator.
    pub all_required_ready: bool,
}

/// Threshold for marking the P: drive vanilla index as stale.
/// 30 days roughly tracks DayZ's monthly experimental cadence.
const P_DRIVE_INDEX_STALE_DAYS: i64 = 30;

/// Threshold for marking the workspace pull as stale. Operators
/// pull weekly-ish; older than that and the workspace probably
/// drifted from the live server.
const PULL_STALE_DAYS: i64 = 7;

#[tauri::command]
pub async fn capabilities_status(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<CapabilitiesStatus> {
    // Resolve the profile via the shared active-profile id the
    // frontend keeps synced with its store. Falls back to the first
    // profile if nothing's set (cold-start headless callers, tests).
    let active_id = state.active_profile_id.read().await.clone();
    let profile = {
        let store = state.profiles.lock().await;
        match active_id {
            Some(id) => store.get(&id).ok(),
            None => store.list().into_iter().next(),
        }
    };

    let tools_dir = tools::resolve_tools_dir(&app);

    let connection = build_connection_tier(profile.as_ref());
    let workspace = build_workspace_tier(profile.as_ref(), &state, &connection);
    let game_data = build_game_data_tier(
        &state.app_data_dir,
        &state,
        &tools_dir,
        profile.as_ref(),
    );
    let mods = build_mods_tier(&state, profile.as_ref(), &workspace);

    let tiers = vec![connection, workspace, game_data, mods];
    // Required = anything that isn't purely optional. All five tiers
    // are conditionally required (different routes need different
    // ones), so for the aggregate "ready to edit" pill we use a
    // permissive heuristic: T1+T2 ready means basic editing works.
    // The Setup UI renders per-tier readiness independently anyway.
    let all_required_ready = tiers
        .iter()
        .take(2) // T1 + T2 only — Game-data / Mods / Build-tools are optional for the basic editing flow
        .all(|t| matches!(t.state, TierState::Ready | TierState::Stale));
    Ok(CapabilitiesStatus {
        tiers,
        all_required_ready,
    })
}

// ---------- Tier 1: Connection ----------

fn build_connection_tier(
    profile: Option<&crate::profiles::ServerProfile>,
) -> CapabilityTierStatus {
    let mut steps = Vec::new();

    let profile_step = match profile {
        Some(p) => CapabilityStep {
            id: "profile".into(),
            label: "Active profile".into(),
            state: TierState::Ready,
            detail: format!(
                "{} · {}",
                p.name,
                match p.mode {
                    crate::profiles::ConnectionMode::Sftp => "SFTP",
                    crate::profiles::ConnectionMode::Local => "Local folder",
                }
            ),
        },
        None => CapabilityStep {
            id: "profile".into(),
            label: "Active profile".into(),
            state: TierState::Todo,
            detail: "No profile yet — create one and pick a connection.".into(),
        },
    };

    // Connection check — Ready when the profile has any successful
    // pull recorded (you can't pull without a working connection),
    // Todo otherwise. Works for both SFTP and Local modes uniformly.
    let connection_check_step = match profile {
        Some(p) if p.last_pull_at.is_some() => CapabilityStep {
            id: "connection_check".into(),
            label: "Check connection".into(),
            state: TierState::Ready,
            detail: "Verified — at least one successful pull on record.".into(),
        },
        Some(_) => CapabilityStep {
            id: "connection_check".into(),
            label: "Check connection".into(),
            state: TierState::Todo,
            detail: "Run a connection test from the profile editor, or pull mission files to verify.".into(),
        },
        None => CapabilityStep {
            id: "connection_check".into(),
            label: "Check connection".into(),
            state: TierState::Blocked,
            detail: "Pick a profile first.".into(),
        },
    };

    // Order: profile → connection check.
    // The "Working directory" step lives under "Build tools"; it
    // only matters when packing a server modpack / reskin, not for
    // the basic edit-and-pull flow this tier gates.
    steps.push(profile_step.clone());
    steps.push(connection_check_step);

    let state = match profile_step.state {
        TierState::Ready => TierState::Ready,
        _ => TierState::Todo,
    };

    CapabilityTierStatus {
        tier: CapabilityTier::Connection,
        state,
        title: "Connection".into(),
        description: "Pick a profile and confirm it can talk to the server.".into(),
        unlocks: vec![
            "/app/sync".into(),
            "/app/profiles".into(),
        ],
        steps,
    }
}

// ---------- Tier 2: Workspace ----------

fn build_workspace_tier(
    profile: Option<&crate::profiles::ServerProfile>,
    state: &State<'_, AppState>,
    connection: &CapabilityTierStatus,
) -> CapabilityTierStatus {
    if !matches!(connection.state, TierState::Ready) {
        return CapabilityTierStatus {
            tier: CapabilityTier::Workspace,
            state: TierState::Blocked,
            title: "Workspace".into(),
            description: "Mission files pulled at least once.".into(),
            unlocks: editor_routes_under_mission_world(),
            steps: vec![CapabilityStep {
                id: "pull".into(),
                label: "Pull from server".into(),
                state: TierState::Blocked,
                detail: "Set up a profile first.".into(),
            }],
        };
    }
    let p = profile.expect("connection ready implies a profile is set");
    let workspace = state.workspace_for(&p.id);
    let workspace_exists = workspace.exists();
    let last_pull = p.last_pull_at;

    let pull_state = match (workspace_exists, last_pull) {
        (false, _) | (_, None) => TierState::Todo,
        (true, Some(t)) => {
            if Utc::now() - t > Duration::days(PULL_STALE_DAYS) {
                TierState::Stale
            } else {
                TierState::Ready
            }
        }
    };
    let pull_detail = match last_pull {
        Some(t) => format!("Last pulled {}", relative_time(t)),
        None => "Never pulled.".into(),
    };

    let steps = vec![CapabilityStep {
        id: "pull".into(),
        label: "Pull mission files".into(),
        state: pull_state,
        detail: pull_detail,
    }];

    CapabilityTierStatus {
        tier: CapabilityTier::Workspace,
        state: pull_state,
        title: "Create workspace".into(),
        description: "Pull the server files needed for the base functionality of the editor — items, events, loadouts, and so on. Pulling at least once creates a local workspace and unlocks the editor.".into(),
        unlocks: editor_routes_under_mission_world(),
        steps,
    }
}

fn editor_routes_under_mission_world() -> Vec<String> {
    vec![
        "/app/items".into(),
        "/app/events".into(),
        "/app/loadouts".into(),
        "/app/gear-sets".into(),
        "/app/server-config".into(),
        "/app/gameplay".into(),
        "/app/globals".into(),
        "/app/player-spawns".into(),
        "/app/buildings".into(),
        "/app/ignorelist".into(),
        "/app/map".into(),
        "/app/zones-tiers".into(),
        "/app/health".into(),
    ]
}

// ---------- Tier 3: Create mod + reskins (P: drive + DePbo) ----------

fn build_game_data_tier(
    app_data_dir: &std::path::Path,
    state: &State<'_, AppState>,
    tools_dir: &std::path::Path,
    profile: Option<&crate::profiles::ServerProfile>,
) -> CapabilityTierStatus {
    // This tier is the operator's one-stop view of everything the
    // Serverpack + Reskin flow needs: where the build lands, the
    // P: drive + extracted game data, the vanilla class index, and
    // every external tool the build pipeline shells out to (Mikero
    // DePbo for reads; MakePbo / DSSignFile / ImageToPAA for the
    // emit + sign + texture-convert steps). DeRap is intentionally
    // double-listed under "Vanilla data readers" too so the
    // operator can find it under either heading; both rows share
    // the same on-disk probe so their state never drifts.
    let dz_root = vanilla_index::dz_root();
    let p_drive_present = dz_root.is_dir();

    let cache = vanilla_index::cache_path(&state.app_data_dir);
    let index = if cache.is_file() {
        vanilla_index::load_index(&state.app_data_dir).ok().flatten()
    } else {
        None
    };

    let p_drive_step = CapabilityStep {
        id: "p_drive".into(),
        label: "P: drive mounted with DayZ data".into(),
        state: if p_drive_present {
            TierState::Ready
        } else {
            TierState::Todo
        },
        detail: if p_drive_present {
            "P:\\DZ\\ found.".into()
        } else {
            "P:\\DZ\\ not found. Mount the P: drive and extract DayZ game data.".into()
        },
    };

    let index_step = match (&index, p_drive_present) {
        (Some(idx), _) => {
            let built = DateTime::parse_from_rfc3339(&idx.built_at)
                .map(|d| d.with_timezone(&Utc))
                .ok();
            let stale = built
                .map(|t| Utc::now() - t > Duration::days(P_DRIVE_INDEX_STALE_DAYS))
                .unwrap_or(false);
            CapabilityStep {
                id: "vanilla_index".into(),
                label: "Index the vanilla gamefiles to find reskinnable classes".into(),
                state: if stale {
                    TierState::Stale
                } else {
                    TierState::Ready
                },
                detail: format!(
                    "Indexed {} classes from {} addons{}",
                    idx.class_count,
                    idx.addon_count,
                    built
                        .map(|t| format!(" · {}", relative_time(t)))
                        .unwrap_or_default(),
                ),
            }
        }
        (None, true) => CapabilityStep {
            id: "vanilla_index".into(),
            label: "Index reskinnable vanilla classes".into(),
            state: TierState::Todo,
            detail: "Walks P:\\DZ\\ for every class with hiddenSelections so the reskin browser can target it.".into(),
        },
        (None, false) => CapabilityStep {
            id: "vanilla_index".into(),
            label: "Index reskinnable vanilla classes".into(),
            state: TierState::Blocked,
            detail: "Mount the P: drive and extract DayZ first.".into(),
        },
    };

    // Working directory — convenience-only. Not gating the tier (a
    // build can still land in app data if unset), so we exclude it
    // from the aggregate state below. Lives here, alongside the
    // game-data steps, because the operator sets it expressly to
    // route serverpack / reskin builds into their server tree.
    let work_dir_step = match profile {
        Some(p) if p.work_dir.is_some() => CapabilityStep {
            id: "work_dir".into(),
            label: "Working directory (optional)".into(),
            state: TierState::Ready,
            detail: p.work_dir.clone().unwrap_or_default(),
        },
        Some(_) => CapabilityStep {
            id: "work_dir".into(),
            label: "Working directory (optional)".into(),
            state: TierState::Todo,
            detail:
                "Builds land in app data by default. Set a folder if you want them in your server tree instead."
                    .into(),
        },
        None => CapabilityStep {
            id: "work_dir".into(),
            label: "Working directory (optional)".into(),
            state: TierState::Blocked,
            detail: "Pick a profile first.".into(),
        },
    };

    // DeRap — the Mikero "read" tool. The vanilla indexer above
    // shells out to it for binarised config.bin files; without it
    // the index can still build, but every binarised config it
    // hits gets skipped (some addons ship config.bin, not config.cpp).
    // Emit/build tools (MakePbo, DSSignFile, ImageToPAA) live in
    // the Build tools tier so read vs. write split is clean.
    let derap_path = tools::derap_exe_resolved(app_data_dir, tools_dir);
    let derap_present = derap_path.is_file();
    let derap_step = CapabilityStep {
        id: "derap".into(),
        label: "Mikero DePbo (DeRap) — read binarised configs".into(),
        state: if derap_present {
            TierState::Ready
        } else {
            TierState::Todo
        },
        detail: if derap_present {
            format!("Detected: {}", derap_path.display())
        } else {
            "Not detected. Install DePbo, or click Locate to point at an existing exe.".into()
        },
    };

    // ---- Build / write tools (also enumerated below as the
    // Serverpack & Reskin creation tier's emit side) ----
    let image_to_paa_step =
        tool_present_step("image_to_paa", "ImageToPAA",
            tools::image_to_paa_exe_resolved(app_data_dir, tools_dir));
    let make_pbo_step =
        tool_present_step("make_pbo", "MakePbo",
            tools::make_pbo_exe_resolved(app_data_dir, tools_dir));
    let ds_sign_step =
        tool_present_step("ds_sign", "DSSignFile",
            tools::ds_sign_file_exe_resolved(app_data_dir, tools_dir));
    let signing_key_step = signing_key_step(tools_dir);

    // Aggregate: tier is Ready when every gating row is Ready/Stale.
    // The work_dir row is excluded because it's convenience-only —
    // a build still works without it (falls back to app data). The
    // signing key is also excluded from the gate: PBOs build fine
    // without it, they just won't be signed.
    let states = [
        p_drive_step.state,
        index_step.state,
        derap_step.state,
        image_to_paa_step.state,
        make_pbo_step.state,
        ds_sign_step.state,
    ];
    let tier_state = if states
        .iter()
        .all(|s| matches!(s, TierState::Ready | TierState::Stale))
    {
        if states.iter().any(|s| matches!(s, TierState::Stale)) {
            TierState::Stale
        } else {
            TierState::Ready
        }
    } else {
        TierState::Todo
    };

    CapabilityTierStatus {
        tier: CapabilityTier::GameData,
        state: tier_state,
        title: "Serverpack & Reskin".into(),
        description:
            "Tools + game data needed to reskin items and pack a server modpack. Read with DeRap, emit with MakePbo / DSSignFile / ImageToPAA.".into(),
        unlocks: vec![
            "/app/zones-tiers".into(),
            "/app/reskin/classes".into(),
            "/app/reskin/wizard".into(),
            "/app/reskin/library".into(),
        ],
        // Order: where the build lands → what we read from → what we
        // read it with → what we extracted out of it → what we emit
        // with → what we sign it with.
        steps: vec![
            work_dir_step,
            p_drive_step,
            derap_step,
            index_step,
            image_to_paa_step,
            make_pbo_step,
            ds_sign_step,
            signing_key_step,
        ],
    }
}

/// Helper — build the standard "tool exe present?" row used by
/// every tool-on-disk check. Centralises the Ready/Todo + detail
/// strings so the two tiers that probe the same exe (Serverpack &
/// Reskin creation, Vanilla data readers) emit identical rows.
fn tool_present_step(
    id: &str,
    label: &str,
    path: PathBuf,
) -> CapabilityStep {
    let present = path.is_file();
    CapabilityStep {
        id: id.into(),
        label: label.into(),
        state: if present {
            TierState::Ready
        } else {
            TierState::Todo
        },
        detail: if present {
            format!("Detected: {}", path.display())
        } else {
            "Not detected. Install the tool, or click Locate to point at an existing exe.".into()
        },
    }
}

/// Helper — `signing_key` row. Exposed so the same row state shows
/// up wherever the tier-list wants to surface PBO signing health.
fn signing_key_step(tools_dir: &std::path::Path) -> CapabilityStep {
    let key_dir = tools_dir.join("DsUtils");
    let key_present = std::fs::read_dir(&key_dir)
        .map(|rd| {
            rd.flatten().any(|e| {
                e.path()
                    .extension()
                    .and_then(|s| s.to_str())
                    .map(|s| s.eq_ignore_ascii_case("biprivatekey"))
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false);
    CapabilityStep {
        id: "signing_key".into(),
        label: "Signing key".into(),
        state: if key_present {
            TierState::Ready
        } else {
            TierState::Warn
        },
        detail: if key_present {
            "`.biprivatekey` found in tools/DsUtils/.".into()
        } else {
            "No `.biprivatekey` — built PBOs won't be signed. verifySignatures=2 servers will reject them.".into()
        },
    }
}

// ---------- Tier 4: Mod support ----------

fn build_mods_tier(
    state: &State<'_, AppState>,
    profile: Option<&crate::profiles::ServerProfile>,
    workspace: &CapabilityTierStatus,
) -> CapabilityTierStatus {
    if !matches!(workspace.state, TierState::Ready | TierState::Stale) {
        return CapabilityTierStatus {
            tier: CapabilityTier::Mods,
            state: TierState::Blocked,
            title: "Mod support".into(),
            description:
                "Discover mods on disk, then import their CE files so their items spawn."
                    .into(),
            unlocks: vec!["/app/mods".into(), "/app/reskin/mod-sources".into()],
            steps: vec![
                CapabilityStep {
                    id: "discover_mods".into(),
                    label: "Discover mods".into(),
                    state: TierState::Blocked,
                    detail: "Pull the workspace first.".into(),
                },
                CapabilityStep {
                    id: "import_mod_xml".into(),
                    label: "Import mod XML".into(),
                    state: TierState::Blocked,
                    detail: "Pull the workspace first.".into(),
                },
                CapabilityStep {
                    id: "scan_autoimport".into(),
                    label: "Scan & auto-import mod XML".into(),
                    state: TierState::Blocked,
                    detail: "Pull the workspace first.".into(),
                },
            ],
        };
    }

    // Number of mods registered in the reskin mod-index — proxy for
    // "you've discovered your mod tree at least once". Independent
    // from CE imports below.
    let mod_idx = mod_index::load_index(&state.app_data_dir)
        .unwrap_or_default();
    let mod_source_count = mod_idx.sources.len();

    // Mod CE imports — count of registered mod CE files per profile.
    // Mirrors the `ce_imports_list` flow but doesn't go through the
    // command, so we don't pay the IPC round-trip the frontend
    // would. Failures (workspace half-set-up) silently count as 0;
    // the workspace tier check above already covers the prerequisite.
    let ce_imports_count = profile
        .and_then(|p| {
            let workspace = state.workspace_for(&p.id);
            crate::mission::MissionContext::resolve(&workspace, p).ok()
        })
        .and_then(|ctx| crate::mission::import::list_ce_imports(&ctx).ok())
        .map(|v| v.len())
        .unwrap_or(0);

    // Step 1 — Discover mods on disk. Ready when at least one mod
    // folder has been registered (operator clicked "Pick folder"
    // on the installed-mods scanner). Independent from imports.
    let discover_step = CapabilityStep {
        id: "discover_mods".into(),
        label: "Auto-discover mods".into(),
        state: if mod_source_count > 0 {
            TierState::Ready
        } else {
            TierState::Todo
        },
        detail: if mod_source_count > 0 {
            format!(
                "{} mod folder{} indexed.",
                mod_source_count,
                plural(mod_source_count)
            )
        } else {
            "Will try to find auto-find mods by walking through `@*` mod directories and index their PBOs.".into()
        },
    };

    // Step 2 — Manual import of a single XML file. Always available;
    // we don't track per-file imports separately so this step's
    // state is "todo" until at least one mod has CE files registered
    // via the existing flow.
    let import_step = CapabilityStep {
        id: "import_mod_xml".into(),
        label: "Manually discover mods".into(),
        state: if ce_imports_count > 0 {
            TierState::Ready
        } else {
            TierState::Todo
        },
        detail: if ce_imports_count > 0 {
            format!(
                "{} mod{} registered in cfgeconomycore.xml.",
                ce_imports_count,
                plural(ce_imports_count)
            )
        } else {
            "Pick a types.xml / events.xml from a mod and register it manually.".into()
        },
    };

    // Step 3 — Auto-import: walk discovered mods' folders and
    // ingest every CE file at once. Ready means "everything any
    // discovered mod ships is registered" — which we can't tell
    // perfectly, so for now: Ready iff both Discover and Import
    // are Ready. Cheaper-to-maintain heuristic that matches what
    // operators expect from a "scan & autoimport" button.
    let auto_step = CapabilityStep {
        id: "scan_autoimport".into(),
        label: "Scan & auto-import mod XML".into(),
        state: if matches!(discover_step.state, TierState::Ready)
            && matches!(import_step.state, TierState::Ready)
        {
            TierState::Ready
        } else {
            TierState::Todo
        },
        detail: "One click: walk every discovered mod's folder and register its CE files in cfgeconomycore.xml.".into(),
    };

    let tier_state = if matches!(discover_step.state, TierState::Ready)
        || matches!(import_step.state, TierState::Ready)
    {
        TierState::Ready
    } else {
        TierState::Todo
    };

    CapabilityTierStatus {
        tier: CapabilityTier::Mods,
        state: tier_state,
        title: "Mod support".into(),
        description:
            "Discover the server's mods, then import their CE files so their items spawn and their classes are reskinnable."
                .into(),
        unlocks: vec!["/app/mods".into(), "/app/reskin/mod-sources".into()],
        steps: vec![discover_step, import_step, auto_step],
    }
}

fn plural(n: usize) -> &'static str {
    if n == 1 {
        ""
    } else {
        "s"
    }
}


// ---------- Helpers ----------

/// Touch-up of `formatRelativeTime` from the frontend so backend
/// callers (and the JSON payload) carry pre-formatted strings the
/// UI doesn't have to re-localise. Frontend can still override by
/// reading the raw timestamp from the source query if needed.
fn relative_time(t: DateTime<Utc>) -> String {
    let delta = Utc::now().signed_duration_since(t);
    let secs = delta.num_seconds();
    if secs < 60 {
        return "just now".into();
    }
    if secs < 3600 {
        let m = secs / 60;
        return format!("{m}m ago");
    }
    if secs < 86_400 {
        let h = secs / 3600;
        return format!("{h}h ago");
    }
    let d = secs / 86_400;
    if d < 30 {
        return format!("{d}d ago");
    }
    let mo = d / 30;
    if mo < 12 {
        return format!("{mo}mo ago");
    }
    format!("{}y ago", d / 365)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Plural helper handles the three boundary cases the format
    /// strings need without us inlining ternaries everywhere.
    #[test]
    fn plural_helper_basic() {
        assert_eq!(plural(0), "s");
        assert_eq!(plural(1), "");
        assert_eq!(plural(2), "s");
    }

    /// Recently-built indexes shouldn't be flagged stale; old ones
    /// should. Catches off-by-one bugs in the threshold check.
    #[test]
    fn relative_time_renders_recent_and_old() {
        let recent = relative_time(Utc::now() - Duration::minutes(5));
        assert!(recent.contains("m ago"));
        let old = relative_time(Utc::now() - Duration::days(40));
        assert!(old.contains("mo ago"));
    }
}
