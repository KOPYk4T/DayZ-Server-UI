//! Schema + cross-reference checks for events and their spawn positions.

use std::collections::HashSet;

use crate::domain::{DynamicEvent, EventLimit, EventSpawnGroup, PositionKind};

use super::{Issue, Severity};

pub fn validate(
    events: &[DynamicEvent],
    spawns: &[EventSpawnGroup],
    known_classnames: &HashSet<String>,
) -> Vec<Issue> {
    let mut issues = Vec::new();

    // Duplicate event names.
    let mut seen: std::collections::HashMap<&str, usize> =
        std::collections::HashMap::new();
    for (idx, e) in events.iter().enumerate() {
        if let Some(prev) = seen.insert(e.name.as_str(), idx) {
            issues.push(Issue {
                severity: Severity::Error,
                code: "events.duplicate-name".into(),
                message: format!(
                    "event name '{}' appears more than once (positions {}, {})",
                    e.name,
                    prev + 1,
                    idx + 1
                ),
                file: e.file.clone(),
                entity: Some(e.name.clone()),
            });
        }
    }

    // Index spawn groups by event name for cross-ref.
    let spawn_index: std::collections::HashMap<&str, &EventSpawnGroup> =
        spawns.iter().map(|g| (g.event_name.as_str(), g)).collect();
    let event_name_set: HashSet<&str> =
        events.iter().map(|e| e.name.as_str()).collect();

    // Per-event checks.
    for e in events {
        let entity = Some(e.name.clone());

        if e.name.trim().is_empty() {
            issues.push(Issue {
                severity: Severity::Error,
                code: "events.empty-name".into(),
                message: "event name is empty".into(),
                file: e.file.clone(),
                entity: None,
            });
        }

        if e.nominal < 0 {
            issues.push(Issue {
                severity: Severity::Error,
                code: "events.negative-nominal".into(),
                message: format!("nominal must be >= 0, got {}", e.nominal),
                file: e.file.clone(),
                entity: entity.clone(),
            });
        }

        if e.min > e.nominal && e.nominal > 0 {
            issues.push(Issue {
                severity: Severity::Warning,
                code: "events.min-exceeds-nominal".into(),
                message: format!(
                    "min ({}) exceeds nominal ({})",
                    e.min, e.nominal
                ),
                file: e.file.clone(),
                entity: entity.clone(),
            });
        }

        if e.lifetime < 60 && e.lifetime != 0 {
            issues.push(Issue {
                severity: Severity::Warning,
                code: "events.tiny-lifetime".into(),
                message: format!("lifetime ({}) under 60s — usually a typo", e.lifetime),
                file: e.file.clone(),
                entity: entity.clone(),
            });
        }

        if e.max > 0 && e.max < e.min {
            issues.push(Issue {
                severity: Severity::Warning,
                code: "events.max-below-min".into(),
                message: format!("max ({}) below min ({})", e.max, e.min),
                file: e.file.clone(),
                entity: entity.clone(),
            });
        }

        if e.saferadius < e.distanceradius {
            issues.push(Issue {
                severity: Severity::Warning,
                code: "events.saferadius-below-distanceradius".into(),
                message: format!(
                    "saferadius ({}) should be >= distanceradius ({}) so events don't overlap existing objects",
                    e.saferadius, e.distanceradius
                ),
                file: e.file.clone(),
                entity: entity.clone(),
            });
        }

        // Children must reference a known classname.
        for (ci, c) in e.children.iter().chain(e.children_ex.iter()).enumerate() {
            if c.type_name.trim().is_empty() {
                issues.push(Issue {
                    severity: Severity::Error,
                    code: "events.empty-child".into(),
                    message: format!("child #{} has empty type", ci + 1),
                    file: e.file.clone(),
                    entity: entity.clone(),
                });
            } else if !known_classnames.is_empty()
                && !known_classnames.contains(&c.type_name)
            {
                issues.push(Issue {
                    severity: Severity::Warning,
                    code: "events.unknown-child-classname".into(),
                    message: format!(
                        "child type '{}' isn't registered in any loaded types.xml — may be a mod class without CE metadata",
                        c.type_name
                    ),
                    file: e.file.clone(),
                    entity: entity.clone(),
                });
            }
        }

        // Fixed-position events should have matching spawn entries.
        //
        // Exception: `limit="custom"` events are script-placed — infected
        // territories, animal zones, mod-defined spawners — so they
        // intentionally have no cfgeventspawns positions even when they
        // are marked position="fixed". Flagging them here would spam the
        // Health tab with false positives on every vanilla Infected* and
        // Animal* event.
        if matches!(e.position, PositionKind::Fixed)
            && e.active != 0
            && !matches!(e.limit, EventLimit::Custom)
        {
            match spawn_index.get(e.name.as_str()) {
                Some(g) if g.positions.is_empty() => issues.push(Issue {
                    severity: Severity::Warning,
                    code: "events.fixed-no-positions".into(),
                    message:
                        "fixed-position event has a spawn entry but no positions inside — CE won't spawn it"
                            .into(),
                    file: e.file.clone(),
                    entity: entity.clone(),
                }),
                None => issues.push(Issue {
                    severity: Severity::Warning,
                    code: "events.missing-spawn-entry".into(),
                    message:
                        "fixed-position event has no entry in cfgeventspawns.xml — it won't spawn anywhere"
                            .into(),
                    file: e.file.clone(),
                    entity: entity.clone(),
                }),
                _ => {}
            }
        }
    }

    // Spawn entries without a matching event.
    for g in spawns {
        if !event_name_set.contains(g.event_name.as_str()) {
            issues.push(Issue {
                severity: Severity::Warning,
                code: "events.orphan-spawn-entry".into(),
                message: format!(
                    "cfgeventspawns has positions for '{}' but no matching event exists",
                    g.event_name
                ),
                file: g.file.clone(),
                entity: Some(g.event_name.clone()),
            });
        }
    }

    issues
}
