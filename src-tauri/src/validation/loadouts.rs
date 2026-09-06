//! Schema + cross-ref checks for spawnables and random presets (PDR §12.3).

use std::collections::{HashMap, HashSet};

use crate::domain::{PresetKind, RandomPreset, SpawnableType};

use super::{Issue, Severity};

pub fn validate_spawnables(
    spawnables: &[SpawnableType],
    known_classnames: &HashSet<String>,
    presets_by_name: &HashMap<String, PresetKind>,
) -> Vec<Issue> {
    let mut issues = Vec::new();

    let mut seen: HashMap<&str, usize> = HashMap::new();
    for (idx, s) in spawnables.iter().enumerate() {
        if let Some(prev) = seen.insert(s.name.as_str(), idx) {
            issues.push(Issue {
                severity: Severity::Error,
                code: "spawnables.duplicate-name".into(),
                message: format!(
                    "spawnable '{}' defined more than once (positions {}, {})",
                    s.name,
                    prev + 1,
                    idx + 1
                ),
                file: s.file.clone(),
                entity: Some(s.name.clone()),
            });
        }

        let entity = Some(s.name.clone());

        if s.name.trim().is_empty() {
            issues.push(Issue {
                severity: Severity::Error,
                code: "spawnables.empty-name".into(),
                message: "spawnable name is empty".into(),
                file: s.file.clone(),
                entity: None,
            });
        }

        // Parent classname should resolve in the items registry — otherwise
        // the loadout never fires because CE doesn't spawn the parent.
        if !known_classnames.is_empty() && !known_classnames.contains(&s.name) {
            issues.push(Issue {
                severity: Severity::Warning,
                code: "spawnables.unknown-parent-classname".into(),
                message: format!(
                    "parent classname '{}' isn't in any loaded types.xml — the loadout will never fire unless a mod defines it",
                    s.name
                ),
                file: s.file.clone(),
                entity: entity.clone(),
            });
        }

        for (gi, g) in s.attachments.iter().enumerate() {
            check_group_chance(
                &mut issues,
                &s.file,
                &entity,
                "attachments",
                gi,
                g.chance,
            );
            for (ii, it) in g.items.iter().enumerate() {
                check_item(
                    &mut issues,
                    &s.file,
                    &entity,
                    "attachments",
                    gi,
                    ii,
                    it,
                    PresetKind::Attachments,
                    known_classnames,
                    presets_by_name,
                );
            }
        }
        for (gi, g) in s.cargo.iter().enumerate() {
            check_group_chance(
                &mut issues,
                &s.file,
                &entity,
                "cargo",
                gi,
                g.chance,
            );
            for (ii, it) in g.items.iter().enumerate() {
                check_item(
                    &mut issues,
                    &s.file,
                    &entity,
                    "cargo",
                    gi,
                    ii,
                    it,
                    PresetKind::Cargo,
                    known_classnames,
                    presets_by_name,
                );
            }
        }
    }

    issues
}

#[allow(clippy::too_many_arguments)]
fn check_item(
    issues: &mut Vec<Issue>,
    file: &str,
    entity: &Option<String>,
    group_kind: &str,
    group_idx: usize,
    item_idx: usize,
    item: &crate::domain::SpawnableItem,
    expected_preset_kind: PresetKind,
    known_classnames: &HashSet<String>,
    presets_by_name: &HashMap<String, PresetKind>,
) {
    if !(0.0..=1.0).contains(&item.chance) {
        issues.push(Issue {
            severity: Severity::Warning,
            code: "spawnables.chance-out-of-range".into(),
            message: format!(
                "{group_kind}[{}] item {} chance {} is outside 0..1",
                group_idx + 1,
                item_idx + 1,
                item.chance
            ),
            file: file.to_string(),
            entity: entity.clone(),
        });
    }

    if let Some(preset_name) = &item.preset {
        match presets_by_name.get(preset_name) {
            None => issues.push(Issue {
                severity: Severity::Warning,
                code: "spawnables.unknown-preset".into(),
                message: format!(
                    "{group_kind}[{}] item {} references preset '{preset_name}' that isn't defined in any loaded cfgrandompresets.xml",
                    group_idx + 1,
                    item_idx + 1
                ),
                file: file.to_string(),
                entity: entity.clone(),
            }),
            Some(&kind) if kind != expected_preset_kind => issues.push(Issue {
                severity: Severity::Warning,
                code: "spawnables.preset-kind-mismatch".into(),
                message: format!(
                    "{group_kind}[{}] item {} references preset '{preset_name}' but it's defined as {:?}, not {:?}",
                    group_idx + 1,
                    item_idx + 1,
                    kind,
                    expected_preset_kind
                ),
                file: file.to_string(),
                entity: entity.clone(),
            }),
            _ => {}
        }
        return;
    }

    if item.name.trim().is_empty() {
        issues.push(Issue {
            severity: Severity::Error,
            code: "spawnables.empty-item".into(),
            message: format!(
                "{group_kind}[{}] item {} has neither a name nor a preset",
                group_idx + 1,
                item_idx + 1
            ),
            file: file.to_string(),
            entity: entity.clone(),
        });
    } else if !known_classnames.is_empty() && !known_classnames.contains(&item.name) {
        issues.push(Issue {
            severity: Severity::Warning,
            code: "spawnables.unknown-item-classname".into(),
            message: format!(
                "{group_kind}[{}] item {} references classname '{}' not in any loaded types.xml",
                group_idx + 1,
                item_idx + 1,
                item.name
            ),
            file: file.to_string(),
            entity: entity.clone(),
        });
    }
}

fn check_group_chance(
    issues: &mut Vec<Issue>,
    file: &str,
    entity: &Option<String>,
    group_kind: &str,
    group_idx: usize,
    chance: f64,
) {
    if !(0.0..=1.0).contains(&chance) {
        issues.push(Issue {
            severity: Severity::Warning,
            code: "spawnables.group-chance-out-of-range".into(),
            message: format!(
                "{group_kind} group #{} chance {chance} outside 0..1",
                group_idx + 1
            ),
            file: file.to_string(),
            entity: entity.clone(),
        });
    }
}

pub fn validate_presets(
    presets: &[RandomPreset],
    known_classnames: &HashSet<String>,
) -> Vec<Issue> {
    let mut issues = Vec::new();

    let mut seen: HashMap<(&str, PresetKind), usize> = HashMap::new();
    for (idx, p) in presets.iter().enumerate() {
        if let Some(prev) = seen.insert((p.name.as_str(), p.kind), idx) {
            issues.push(Issue {
                severity: Severity::Error,
                code: "presets.duplicate-name".into(),
                message: format!(
                    "preset '{}' ({:?}) defined more than once (positions {}, {})",
                    p.name,
                    p.kind,
                    prev + 1,
                    idx + 1
                ),
                file: p.file.clone(),
                entity: Some(p.name.clone()),
            });
        }

        let entity = Some(p.name.clone());
        if p.name.trim().is_empty() {
            issues.push(Issue {
                severity: Severity::Error,
                code: "presets.empty-name".into(),
                message: "preset name is empty".into(),
                file: p.file.clone(),
                entity: None,
            });
        }

        if !(0.0..=1.0).contains(&p.chance) {
            issues.push(Issue {
                severity: Severity::Warning,
                code: "presets.chance-out-of-range".into(),
                message: format!("base chance {} outside 0..1", p.chance),
                file: p.file.clone(),
                entity: entity.clone(),
            });
        }

        if p.items.is_empty() {
            issues.push(Issue {
                severity: Severity::Warning,
                code: "presets.empty-items".into(),
                message: "preset has no items — references to it will never roll anything"
                    .into(),
                file: p.file.clone(),
                entity: entity.clone(),
            });
        }

        for (ii, it) in p.items.iter().enumerate() {
            if !(0.0..=1.0).contains(&it.chance) {
                issues.push(Issue {
                    severity: Severity::Warning,
                    code: "presets.item-chance-out-of-range".into(),
                    message: format!(
                        "item {} chance {} outside 0..1",
                        ii + 1,
                        it.chance
                    ),
                    file: p.file.clone(),
                    entity: entity.clone(),
                });
            }
            if !known_classnames.is_empty() && !known_classnames.contains(&it.name) {
                issues.push(Issue {
                    severity: Severity::Warning,
                    code: "presets.unknown-item-classname".into(),
                    message: format!(
                        "item {} classname '{}' not in any loaded types.xml",
                        ii + 1,
                        it.name
                    ),
                    file: p.file.clone(),
                    entity: entity.clone(),
                });
            }
        }
    }

    issues
}
