//! Lightweight "what kind of CE file is this?" detector.
//!
//! Reads just the first start element of an XML file and maps it to the
//! known CE file types. Works on files too big to fully parse (shouldn't
//! happen for types/spawnabletypes, but helps us stay robust on weird
//! inputs).

use std::path::Path;

use quick_xml::events::Event;
use quick_xml::Reader;
use serde::Serialize;

use crate::error::AppResult;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CeFileKind {
    /// `<types>` — types.xml / *_types.xml
    Types,
    /// `<spawnabletypes>` — cfgspawnabletypes.xml and friends
    Spawnabletypes,
    /// `<events>` — events.xml (dynamic event definitions)
    Events,
    /// `<eventposdef>` — cfgeventspawns.xml (positions per event)
    Eventposdef,
    /// `<randompresets>` — cfgrandompresets.xml
    Randompresets,
    /// `<economy_core>` — the orchestrator itself; we never want to import this.
    EconomyCore,
    /// Anything else — will be skipped by default (raw-copy opt-in in a later phase).
    Unknown,
}

impl CeFileKind {
    /// Value used for the `type="…"` attribute in cfgeconomycore's `<file>`
    /// registration. Returns None for kinds that shouldn't be registered.
    pub fn ce_type_attr(self) -> Option<&'static str> {
        match self {
            CeFileKind::Types => Some("types"),
            CeFileKind::Spawnabletypes => Some("spawnabletypes"),
            CeFileKind::Events => Some("events"),
            CeFileKind::Eventposdef => Some("eventposdef"),
            CeFileKind::Randompresets => Some("randompresets"),
            CeFileKind::EconomyCore | CeFileKind::Unknown => None,
        }
    }

    pub fn is_importable(self) -> bool {
        self.ce_type_attr().is_some()
    }

    pub fn label(self) -> &'static str {
        match self {
            CeFileKind::Types => "types",
            CeFileKind::Spawnabletypes => "spawnabletypes",
            CeFileKind::Events => "events",
            CeFileKind::Eventposdef => "event positions",
            CeFileKind::Randompresets => "random presets",
            CeFileKind::EconomyCore => "economy core (orchestrator)",
            CeFileKind::Unknown => "unknown",
        }
    }
}

/// How the classifier arrived at its answer. Shown in the import UI
/// as evidence — an operator reviewing a fragment before apply wants
/// to know whether we trusted the filename, the content, or both.
/// Mismatches flag human-attention cases ("this file is named
/// `_types.xml` but contains `<events>` — is that intentional?").
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ClassificationSignal {
    /// Filename and content both point at the same kind. Highest
    /// confidence — the default case for well-formed files.
    FilenameAgreed,
    /// Content matched a known kind; filename was ambiguous
    /// (doesn't contain a recognised keyword). Still safe to
    /// import — content is the authoritative signal.
    Content,
    /// Filename matched a known kind but content was unparseable or
    /// `Unknown`. We'll surface this as a warning; operator can
    /// still force-import after eye-balling the file.
    FilenameOnly,
    /// Filename and content disagree — probably a bug in the mod,
    /// or an operator renamed a file in a way that mischaracterises
    /// it. We keep the **content** kind (it's authoritative for
    /// parsing) but warn loudly.
    FilenameMismatch,
    /// Neither signal matched anything we recognise.
    Unknown,
}

/// Combined filename + content classifier. The content reading is
/// authoritative for the returned `CeFileKind`; the `signal`
/// describes how the filename hint reinforces or contradicts it.
pub fn classify_path(path: &Path) -> AppResult<(CeFileKind, ClassificationSignal)> {
    let bytes = std::fs::read(path)?;
    let fname = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    Ok(classify(fname, &bytes))
}

pub fn classify(file_name: &str, bytes: &[u8]) -> (CeFileKind, ClassificationSignal) {
    let by_filename = detect_by_filename(file_name);
    let by_content = detect_bytes(bytes);
    let signal = match (by_filename, by_content) {
        (CeFileKind::Unknown, CeFileKind::Unknown) => ClassificationSignal::Unknown,
        (CeFileKind::Unknown, _) => ClassificationSignal::Content,
        (_, CeFileKind::Unknown) => ClassificationSignal::FilenameOnly,
        (fn_kind, ct_kind) if fn_kind == ct_kind => ClassificationSignal::FilenameAgreed,
        _ => ClassificationSignal::FilenameMismatch,
    };
    // Trust content over filename when both are present but disagree.
    // The XML shape is what actually gets parsed by the server; a
    // misleading filename is just cosmetic.
    let kind = match by_content {
        CeFileKind::Unknown => by_filename,
        other => other,
    };
    (kind, signal)
}

/// Map a filename to a CE kind on substring hints alone. Case-
/// insensitive. This is the PDR's "filename first" fast-path — kept
/// as a separate function so callers that really do want
/// content-only classification (legacy tests, UI-only preview
/// without parsing) can opt out.
pub fn detect_by_filename(file_name: &str) -> CeFileKind {
    let n = file_name.to_ascii_lowercase();
    // Ordered most-specific first so e.g. `cfgspawnabletypes.xml`
    // doesn't match `types` before `spawnabletypes`.
    if n.contains("spawnabletypes") {
        return CeFileKind::Spawnabletypes;
    }
    if n.contains("randompresets") {
        return CeFileKind::Randompresets;
    }
    if n.contains("eventposdef") || n.contains("eventspawns") {
        return CeFileKind::Eventposdef;
    }
    if n.contains("economycore") || n.contains("economy_core") {
        return CeFileKind::EconomyCore;
    }
    if n.contains("events") {
        return CeFileKind::Events;
    }
    if n.contains("types") {
        return CeFileKind::Types;
    }
    CeFileKind::Unknown
}

/// Classify a file by reading just its first element tag.
pub fn detect_file(path: &Path) -> AppResult<CeFileKind> {
    let bytes = std::fs::read(path)?;
    Ok(detect_bytes(&bytes))
}

pub fn detect_bytes(bytes: &[u8]) -> CeFileKind {
    let mut reader = Reader::from_reader(bytes);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                let name = std::str::from_utf8(e.name().as_ref())
                    .unwrap_or("")
                    .to_ascii_lowercase();
                return match name.as_str() {
                    "types" => CeFileKind::Types,
                    "spawnabletypes" => CeFileKind::Spawnabletypes,
                    "events" => CeFileKind::Events,
                    "eventposdef" => CeFileKind::Eventposdef,
                    "randompresets" => CeFileKind::Randompresets,
                    "economy_core" | "ce" => CeFileKind::EconomyCore,
                    _ => CeFileKind::Unknown,
                };
            }
            Ok(Event::Eof) => return CeFileKind::Unknown,
            Ok(_) => {}
            Err(_) => return CeFileKind::Unknown,
        }
        buf.clear();
    }
}

/// Count how many top-level `<type>` elements live inside a `<types>`
/// document. Cheap — it only visits direct children of the root. Returns
/// 0 if the file isn't a `<types>` doc.
pub fn count_types_records(bytes: &[u8]) -> usize {
    let mut reader = Reader::from_reader(bytes);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    let mut depth = 0i32;
    let mut count = 0usize;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                depth += 1;
                if depth == 2 {
                    let name = std::str::from_utf8(e.name().as_ref())
                        .unwrap_or("")
                        .to_ascii_lowercase();
                    if name == "type" {
                        count += 1;
                    }
                }
            }
            Ok(Event::Empty(e)) => {
                if depth == 1 {
                    let name = std::str::from_utf8(e.name().as_ref())
                        .unwrap_or("")
                        .to_ascii_lowercase();
                    if name == "type" {
                        count += 1;
                    }
                }
            }
            Ok(Event::End(_)) => depth -= 1,
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(_) => break,
        }
        buf.clear();
    }
    count
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_common_kinds() {
        assert_eq!(
            detect_bytes(br#"<?xml version="1.0"?><types><type name="A"/></types>"#),
            CeFileKind::Types
        );
        assert_eq!(
            detect_bytes(br#"<spawnabletypes><type name="X"/></spawnabletypes>"#),
            CeFileKind::Spawnabletypes
        );
        assert_eq!(
            detect_bytes(br#"<events><event name="E"/></events>"#),
            CeFileKind::Events
        );
        assert_eq!(
            detect_bytes(br#"<eventposdef><event name="E"/></eventposdef>"#),
            CeFileKind::Eventposdef
        );
        assert_eq!(
            detect_bytes(br#"<randompresets><cargo name="A"/></randompresets>"#),
            CeFileKind::Randompresets
        );
        assert_eq!(
            detect_bytes(br#"<economy_core><ce folder="x"/></economy_core>"#),
            CeFileKind::EconomyCore
        );
        assert_eq!(
            detect_bytes(b"<?xml version=\"1.0\"?>"),
            CeFileKind::Unknown
        );
    }

    #[test]
    fn filename_hint_detects_common_names() {
        assert_eq!(detect_by_filename("types.xml"), CeFileKind::Types);
        assert_eq!(detect_by_filename("mymod_types.xml"), CeFileKind::Types);
        assert_eq!(
            detect_by_filename("cfgspawnabletypes.xml"),
            CeFileKind::Spawnabletypes,
        );
        assert_eq!(
            detect_by_filename("cfgeventspawns.xml"),
            CeFileKind::Eventposdef,
        );
        assert_eq!(
            detect_by_filename("cfgrandompresets.xml"),
            CeFileKind::Randompresets,
        );
        assert_eq!(detect_by_filename("events.xml"), CeFileKind::Events);
        assert_eq!(detect_by_filename("cfgeconomycore.xml"), CeFileKind::EconomyCore);
        assert_eq!(detect_by_filename("random.xml"), CeFileKind::Unknown);
    }

    #[test]
    fn filename_hint_resolves_ambiguous_prefixes() {
        // 'spawnabletypes' is matched before 'types' even though
        // 'types' is a substring.
        assert_eq!(
            detect_by_filename("expansion_spawnabletypes.xml"),
            CeFileKind::Spawnabletypes,
        );
    }

    #[test]
    fn classify_agrees_when_both_signals_match() {
        let (kind, sig) = classify(
            "mymod_types.xml",
            br#"<types><type name="A"/></types>"#,
        );
        assert_eq!(kind, CeFileKind::Types);
        assert_eq!(sig, ClassificationSignal::FilenameAgreed);
    }

    #[test]
    fn classify_content_only_when_filename_is_ambiguous() {
        let (kind, sig) = classify(
            "mymod_data.xml",
            br#"<types><type name="A"/></types>"#,
        );
        assert_eq!(kind, CeFileKind::Types);
        assert_eq!(sig, ClassificationSignal::Content);
    }

    #[test]
    fn classify_filename_only_when_content_is_unknown() {
        let (kind, sig) = classify("mymod_types.xml", b"<something-weird/>");
        assert_eq!(kind, CeFileKind::Types);
        assert_eq!(sig, ClassificationSignal::FilenameOnly);
    }

    #[test]
    fn classify_flags_filename_content_mismatch() {
        // Named `_types.xml` but actually holds an `<events>` doc —
        // content wins for the kind but we flag the divergence.
        let (kind, sig) = classify(
            "mymod_types.xml",
            br#"<events><event name="E"/></events>"#,
        );
        assert_eq!(kind, CeFileKind::Events);
        assert_eq!(sig, ClassificationSignal::FilenameMismatch);
    }

    #[test]
    fn classify_unknown_when_neither_signal_matches() {
        let (kind, sig) = classify("data.xml", b"<foo/>");
        assert_eq!(kind, CeFileKind::Unknown);
        assert_eq!(sig, ClassificationSignal::Unknown);
    }

    #[test]
    fn counts_type_records() {
        let src = br#"<types>
            <type name="A"><nominal>1</nominal></type>
            <type name="B"><nominal>1</nominal></type>
            <type name="C"/>
        </types>"#;
        assert_eq!(count_types_records(src), 3);
    }
}
