//! Validation engine (PDR §12). Phase 2 lands the first tier: syntax &
//! schema checks for `types.xml` files. Cross-ref and CE-balance layers
//! arrive in Phase 5.
//!
//! Every issue produced by this module is a structured record — not a
//! free-form string — so the frontend's Health tab (Phase 5) can filter,
//! group, and offer quick-fix actions.

pub mod events;
pub mod items;
pub mod loadouts;

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Error,
    Warning,
    Info,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    pub severity: Severity,
    pub code: String,
    pub message: String,
    /// Workspace-relative path to the offending file, or empty when the
    /// issue is not file-local.
    pub file: String,
    /// Offending entity identifier (classname / event name / …), or None.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entity: Option<String>,
}
