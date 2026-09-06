//! Per-profile ledger of edits the operator has made to mission
//! files that live outside the CE custom-folder override system.
//!
//! **Why it exists.** DayZ's Central Economy silently ignores the
//! `eventposdef` file type in cfgeconomycore custom folders
//! (Bohemia feedback ticket T161291, open since 2021 — not
//! implemented as of 2025). The only way to add event spawn
//! positions that DayZ actually loads is to edit the mission-side
//! `cfgeventspawns.xml` directly. That in turn means the operator's
//! edits are vulnerable to being overwritten on:
//!
//!   - a fresh pull from the server (replaces the whole workspace),
//!   - a Bohemia mission-template bump (rare — cfgeventspawns.xml
//!     is rarely touched, but possible),
//!   - a re-install of DayZ-Expansion CE (our installer is
//!     append-only for cfgeventspawns.xml, so this case is safe
//!     today, but the ledger insulates us from regressions).
//!
//! The ledger is an authoritative, *outside-the-workspace* record
//! of every in-place edit the app has made. After any event that
//! may have overwritten the mission files (pull / reinstall) the
//! app reconciles: additions missing from the pulled file get
//! re-applied, removals that came back get re-stripped. Operators
//! can inspect the ledger, prune entries, or zero it out if they
//! want to abandon their overrides.
//!
//! Storage: `<app_data>/edits/<profile_id>.json`. One file per
//! profile. Versioned (`version: 1`) so future schema changes can
//! migrate forward without losing history.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::AppResult;

pub const LEDGER_VERSION: u32 = 1;

/// A single position's identity within an event — the quadruple
/// DayZ's CE actually consumes. `group` is preserved opaquely.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PositionRef {
    pub event_name: String,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub a: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
}

impl PositionRef {
    /// Exact f64 identity. We preserve the parsed floats byte-for-
    /// byte through the parser, so "same position" means same
    /// values — no epsilon needed. Group is compared structurally.
    pub fn matches(&self, other: &Self) -> bool {
        self.event_name == other.event_name
            && self.x == other.x
            && self.y == other.y
            && self.z == other.z
            && self.a == other.a
            && self.group == other.group
    }
}

/// Delta applied to `cfgeventspawns.xml` since the pristine
/// baseline. Both sides are *sets* — duplicate entries are
/// collapsed. `additions` and `removals` are mutually exclusive
/// for the same `PositionRef` (the app reconciles on every write).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventspawnsDelta {
    pub additions: Vec<PositionRef>,
    pub removals: Vec<PositionRef>,
}

impl EventspawnsDelta {
    /// Record a position the operator added. If the same position
    /// was previously in `removals` (i.e. the operator is undoing
    /// their own removal), the removal is cancelled instead of
    /// stacking a no-op addition on top.
    pub fn record_addition(&mut self, pos: PositionRef) {
        if let Some(i) = self.removals.iter().position(|p| p.matches(&pos)) {
            self.removals.remove(i);
            return;
        }
        if !self.additions.iter().any(|p| p.matches(&pos)) {
            self.additions.push(pos);
        }
    }

    /// Record a position the operator removed. Mirror of
    /// `record_addition` — cancels a prior addition rather than
    /// tracking a net-zero pair.
    pub fn record_removal(&mut self, pos: PositionRef) {
        if let Some(i) = self.additions.iter().position(|p| p.matches(&pos)) {
            self.additions.remove(i);
            return;
        }
        if !self.removals.iter().any(|p| p.matches(&pos)) {
            self.removals.push(pos);
        }
    }
}

/// The full per-profile ledger. Kept small on purpose — event
/// definition overrides still go through the supported `events`
/// file type in `events_custom.xml`, so only the *unsupported*
/// surface (event spawn positions) needs tracking here.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditsLedger {
    pub version: u32,
    pub eventspawns: EventspawnsDelta,
}

impl EditsLedger {
    pub fn new() -> Self {
        Self {
            version: LEDGER_VERSION,
            eventspawns: EventspawnsDelta::default(),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.eventspawns.additions.is_empty()
            && self.eventspawns.removals.is_empty()
    }
}

/// Compute the on-disk path to a profile's ledger file, given the
/// top-level edits directory. `edits_dir` is typically
/// `<app_data>/edits`; the caller ensures the directory exists
/// before writing.
pub fn ledger_path(edits_dir: &Path, profile_id: &str) -> PathBuf {
    edits_dir.join(format!("{profile_id}.json"))
}

/// Read the ledger file for a profile, or return an empty ledger
/// if the file doesn't exist / fails to parse. Invalid ledgers
/// are logged and replaced rather than aborting the app — the
/// worst case is the operator's history is lost, which is
/// recoverable, and failing loud would block every save.
pub fn load(edits_dir: &Path, profile_id: &str) -> EditsLedger {
    let path = ledger_path(edits_dir, profile_id);
    if !path.exists() {
        return EditsLedger::new();
    }
    match fs::read_to_string(&path) {
        Ok(body) => match serde_json::from_str::<EditsLedger>(&body) {
            Ok(mut l) => {
                if l.version == 0 {
                    l.version = LEDGER_VERSION;
                }
                l
            }
            Err(e) => {
                log::warn!(
                    "ledger {} invalid ({e}); starting fresh",
                    path.display()
                );
                EditsLedger::new()
            }
        },
        Err(_) => EditsLedger::new(),
    }
}

pub fn save(edits_dir: &Path, profile_id: &str, ledger: &EditsLedger) -> AppResult<()> {
    fs::create_dir_all(edits_dir)?;
    let path = ledger_path(edits_dir, profile_id);
    let body = serde_json::to_string_pretty(ledger).map_err(|e| {
        crate::error::AppError::Internal(format!("serialize ledger: {e}"))
    })?;
    fs::write(&path, body)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(event: &str, x: f64, y: f64, z: f64, a: f64) -> PositionRef {
        PositionRef {
            event_name: event.to_string(),
            x,
            y,
            z,
            a,
            group: None,
        }
    }

    #[test]
    fn record_addition_dedups() {
        let mut d = EventspawnsDelta::default();
        d.record_addition(p("Heli", 1.0, 2.0, 3.0, 4.0));
        d.record_addition(p("Heli", 1.0, 2.0, 3.0, 4.0));
        assert_eq!(d.additions.len(), 1);
    }

    #[test]
    fn record_addition_cancels_matching_removal() {
        let mut d = EventspawnsDelta::default();
        d.record_removal(p("Heli", 1.0, 2.0, 3.0, 4.0));
        d.record_addition(p("Heli", 1.0, 2.0, 3.0, 4.0));
        assert!(d.removals.is_empty());
        assert!(d.additions.is_empty(), "add+remove must net to zero");
    }

    #[test]
    fn record_removal_cancels_matching_addition() {
        let mut d = EventspawnsDelta::default();
        d.record_addition(p("Heli", 1.0, 2.0, 3.0, 4.0));
        d.record_removal(p("Heli", 1.0, 2.0, 3.0, 4.0));
        assert!(d.additions.is_empty());
        assert!(d.removals.is_empty());
    }

    #[test]
    fn record_removal_dedups() {
        let mut d = EventspawnsDelta::default();
        d.record_removal(p("Heli", 1.0, 2.0, 3.0, 4.0));
        d.record_removal(p("Heli", 1.0, 2.0, 3.0, 4.0));
        assert_eq!(d.removals.len(), 1);
    }

    #[test]
    fn save_and_load_round_trip() {
        let td = tempfile::TempDir::new().unwrap();
        let mut ledger = EditsLedger::new();
        ledger
            .eventspawns
            .record_addition(p("Heli", 1.0, 2.0, 3.0, 4.0));
        ledger
            .eventspawns
            .record_removal(p("UAZ", 10.0, 20.0, 30.0, 40.0));
        save(td.path(), "profile-a", &ledger).unwrap();
        let loaded = load(td.path(), "profile-a");
        assert_eq!(loaded.version, LEDGER_VERSION);
        assert_eq!(loaded.eventspawns.additions.len(), 1);
        assert_eq!(loaded.eventspawns.removals.len(), 1);
        assert!(
            loaded.eventspawns.additions[0].matches(&p("Heli", 1.0, 2.0, 3.0, 4.0))
        );
    }

    #[test]
    fn load_missing_file_returns_empty_ledger() {
        let td = tempfile::TempDir::new().unwrap();
        let ledger = load(td.path(), "nobody");
        assert!(ledger.is_empty());
        assert_eq!(ledger.version, LEDGER_VERSION);
    }

    #[test]
    fn load_invalid_ledger_falls_back_to_empty() {
        let td = tempfile::TempDir::new().unwrap();
        let path = ledger_path(td.path(), "profile-a");
        fs::write(&path, "not json at all").unwrap();
        let ledger = load(td.path(), "profile-a");
        assert!(ledger.is_empty());
    }
}
