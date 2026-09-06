//! Syntax + schema checks for `types.xml` items (PDR §12.1, §12.2, partial §12.4).
//!
//! We already know the file is XML-well-formed at this point (parsing
//! would have failed upstream otherwise). What we check here are *schema*
//! rules — bounds, enum memberships, and the handful of CE-balance rules
//! that are cheap to evaluate without the full cross-ref index.

use std::collections::HashSet;

use crate::domain::{ItemType, LimitsDefinition};

use super::{Issue, Severity};

pub fn validate(items: &[ItemType]) -> Vec<Issue> {
    validate_with_limits(items, None)
}

/// Extended validation that cross-refs every item's `category`, `tag`,
/// `usage`, and `value` against the provided `cfglimitsdefinition`. An
/// item referencing a name that isn't declared there is effectively
/// invisible to CE's spawn logic for that dimension — we surface these
/// as warnings so they're easy to find and fix.
pub fn validate_with_limits(
    items: &[ItemType],
    limits: Option<&LimitsDefinition>,
) -> Vec<Issue> {
    let mut issues = validate_core(items);
    if let Some(def) = limits {
        issues.extend(validate_against_limits(items, def));
    }
    issues
}

fn validate_core(items: &[ItemType]) -> Vec<Issue> {
    let mut issues = Vec::new();

    let mut seen = std::collections::HashMap::<&str, usize>::new();
    for (idx, it) in items.iter().enumerate() {
        let entity = it.name.clone();

        if let Some(prev_idx) = seen.insert(it.name.as_str(), idx) {
            issues.push(Issue {
                severity: Severity::Error,
                code: "items.duplicate-name".into(),
                message: format!(
                    "classname '{}' appears more than once (positions {}, {})",
                    it.name,
                    prev_idx + 1,
                    idx + 1
                ),
                file: it.file.clone(),
                entity: Some(entity.clone()),
            });
        }

        if it.name.trim().is_empty() {
            issues.push(Issue {
                severity: Severity::Error,
                code: "items.empty-name".into(),
                message: "classname is empty".into(),
                file: it.file.clone(),
                entity: None,
            });
        }

        if it.nominal < 0 {
            issues.push(Issue {
                severity: Severity::Error,
                code: "items.negative-nominal".into(),
                message: format!("nominal must be >= 0, got {}", it.nominal),
                file: it.file.clone(),
                entity: Some(entity.clone()),
            });
        }

        if it.min < 0 {
            issues.push(Issue {
                severity: Severity::Error,
                code: "items.negative-min".into(),
                message: format!("min must be >= 0, got {}", it.min),
                file: it.file.clone(),
                entity: Some(entity.clone()),
            });
        }

        if it.min > it.nominal && it.nominal > 0 {
            issues.push(Issue {
                severity: Severity::Warning,
                code: "items.min-exceeds-nominal".into(),
                message: format!(
                    "min ({}) exceeds nominal ({}) — CE may never reach equilibrium",
                    it.min, it.nominal
                ),
                file: it.file.clone(),
                entity: Some(entity.clone()),
            });
        }

        if it.lifetime < 60 && it.lifetime != 0 {
            issues.push(Issue {
                severity: Severity::Warning,
                code: "items.tiny-lifetime".into(),
                message: format!(
                    "lifetime ({}) under 60s — usually a typo",
                    it.lifetime
                ),
                file: it.file.clone(),
                entity: Some(entity.clone()),
            });
        }

        if it.nominal > 1_000 {
            issues.push(Issue {
                severity: Severity::Warning,
                code: "items.huge-nominal".into(),
                message: format!(
                    "nominal ({}) is unusually high — likely breaks economy",
                    it.nominal
                ),
                file: it.file.clone(),
                entity: Some(entity.clone()),
            });
        }

        if it.usage.len() > 4 {
            issues.push(Issue {
                severity: Severity::Warning,
                code: "items.too-many-usage".into(),
                message: format!(
                    "{} usage tags; vanilla CE caps at 4",
                    it.usage.len()
                ),
                file: it.file.clone(),
                entity: Some(entity.clone()),
            });
        }

        for (idx, q) in [("quantmin", it.quantmin), ("quantmax", it.quantmax)] {
            if q < -1 || q > 100 {
                issues.push(Issue {
                    severity: Severity::Error,
                    code: format!("items.invalid-{idx}"),
                    message: format!("{idx} must be -1 or 0..100, got {q}"),
                    file: it.file.clone(),
                    entity: Some(entity.clone()),
                });
            }
        }

        for (field, v) in [
            ("count_in_cargo", it.flags.count_in_cargo),
            ("count_in_hoarder", it.flags.count_in_hoarder),
            ("count_in_map", it.flags.count_in_map),
            ("count_in_player", it.flags.count_in_player),
            ("crafted", it.flags.crafted),
            ("deloot", it.flags.deloot),
        ] {
            if v > 1 {
                issues.push(Issue {
                    severity: Severity::Error,
                    code: format!("items.invalid-flag-{field}"),
                    message: format!("flag {field} must be 0 or 1, got {v}"),
                    file: it.file.clone(),
                    entity: Some(entity.clone()),
                });
            }
        }
    }

    issues
}

fn validate_against_limits(items: &[ItemType], def: &LimitsDefinition) -> Vec<Issue> {
    let categories: HashSet<&str> = def.category_names().collect();
    let tags: HashSet<&str> = def.tag_names().collect();
    let usages: HashSet<&str> = def.usage_names().collect();
    let values: HashSet<&str> = def.value_names().collect();

    let mut issues = Vec::new();

    for it in items {
        let entity = Some(it.name.clone());

        if let Some(c) = &it.category {
            if !categories.contains(c.as_str()) {
                issues.push(Issue {
                    severity: Severity::Warning,
                    code: "items.unknown-category".into(),
                    message: format!(
                        "category '{c}' isn't declared in cfglimitsdefinition.xml — CE won't recognise this item's category dimension. Add it on the Zones & Tiers page or change this item's category."
                    ),
                    file: it.file.clone(),
                    entity: entity.clone(),
                });
            }
        }

        for t in &it.tags {
            if !tags.contains(t.as_str()) {
                issues.push(Issue {
                    severity: Severity::Warning,
                    code: "items.unknown-tag".into(),
                    message: format!(
                        "tag '{t}' isn't declared in cfglimitsdefinition.xml — CE will ignore this tag when placing this item."
                    ),
                    file: it.file.clone(),
                    entity: entity.clone(),
                });
            }
        }

        for u in &it.usage {
            if !usages.contains(u.as_str()) {
                issues.push(Issue {
                    severity: Severity::Warning,
                    code: "items.unknown-usage".into(),
                    message: format!(
                        "usage '{u}' isn't declared in cfglimitsdefinition.xml — CE will not spawn this item in any '{u}' zone because the flag doesn't exist."
                    ),
                    file: it.file.clone(),
                    entity: entity.clone(),
                });
            }
        }

        for v in &it.value {
            if !values.contains(v.as_str()) {
                issues.push(Issue {
                    severity: Severity::Warning,
                    code: "items.unknown-value".into(),
                    message: format!(
                        "value tier '{v}' isn't declared in cfglimitsdefinition.xml — CE will treat this item as having no tier gating."
                    ),
                    file: it.file.clone(),
                    entity: entity.clone(),
                });
            }
        }
    }

    issues
}
