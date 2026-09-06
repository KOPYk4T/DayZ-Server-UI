//! Reskin addon — texture-only mod authoring for DayZ.
//!
//! Runtime responsibilities (current iteration):
//! - Scan the operator's P: drive for vanilla DayZ classes that expose
//!   `hiddenSelections[]`, store a compact index to disk.
//! - Future: wizard-driven clone + PNG→PAA + config.cpp emit + PBO
//!   pack + sign. See `project_addon_architecture.md` memory for the
//!   payment-gate contract.

pub mod build;
pub mod config_parser;
pub mod mod_index;
pub mod registry;
pub mod tools;
pub mod vanilla_index;
