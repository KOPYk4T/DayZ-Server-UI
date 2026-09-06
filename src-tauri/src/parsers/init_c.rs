//! `init.c` gear-call scanner (PDR §9.7 / Phase 6c).
//!
//! Pragmatic regex-free scanner. Walks the mission's `init.c`
//! line-by-line and extracts the string literals passed to these
//! common legacy gear-spawning calls:
//!
//! - `CreateInInventory("Classname")`
//! - `CreateAttachment("Classname")`
//!
//! Also detects `string <name>[] = { "A", "B", "C" }` style arrays —
//! when one of these is passed to `CreateInInventory` (e.g.
//! `CreateInInventory(shirtColors[idx])`), each element gets pulled
//! into the result too so the importer doesn't miss randomised
//! pools.
//!
//! Full flow analysis (tracking which slot each call targets) is
//! explicitly out of scope — the generated JSON dumps everything
//! into a single cargo pool as a starting point. Users refine in
//! the 6b editor once that ships.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitCCall {
    pub line_number: usize,
    pub kind: InitCCallKind,
    pub classname: String,
    pub context_line: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum InitCCallKind {
    CreateInInventory,
    CreateAttachment,
    /// Classname came from a string-array element — likely part of a
    /// random pool. Still valid, just flagged so the UI can show it
    /// differently.
    ArrayElement,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StringArrayDecl {
    pub name: String,
    pub line_number: usize,
    pub values: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitCScan {
    /// Workspace-relative path to the scanned file. Empty if the
    /// file doesn't exist.
    pub file_display: String,
    pub file_exists: bool,
    pub total_lines: usize,
    pub calls: Vec<InitCCall>,
    pub arrays: Vec<StringArrayDecl>,
    /// Unique classname union across calls + referenced arrays,
    /// insertion order preserved.
    pub classnames: Vec<String>,
}

// ---------- Public API ----------

pub fn scan_file(path: &Path) -> AppResult<InitCScan> {
    if !path.exists() {
        return Ok(InitCScan {
            file_display: path.display().to_string(),
            file_exists: false,
            ..Default::default()
        });
    }
    let bytes = std::fs::read(path)?;
    let text = String::from_utf8_lossy(&bytes);
    let mut scan = scan_text(&text);
    scan.file_display = path.display().to_string();
    scan.file_exists = true;
    Ok(scan)
}

pub fn scan_text(text: &str) -> InitCScan {
    let mut calls: Vec<InitCCall> = Vec::new();
    let mut arrays: Vec<StringArrayDecl> = Vec::new();

    let lines: Vec<&str> = text.lines().collect();
    for (idx, raw) in lines.iter().enumerate() {
        let ln = idx + 1;
        let line = raw.trim();
        if line.is_empty() || line.starts_with("//") {
            continue;
        }

        // Detect string-array declarations. The pattern is sloppy by
        // design — Enfusion scripts have a few variants and we don't
        // want to miss one by being too strict.
        if let Some(decl) = try_parse_string_array(line, ln) {
            arrays.push(decl);
            continue;
        }

        // CreateInInventory("Classname") / CreateAttachment("Classname")
        scan_call(line, "CreateInInventory(", InitCCallKind::CreateInInventory, ln, &mut calls);
        scan_call(line, "CreateAttachment(", InitCCallKind::CreateAttachment, ln, &mut calls);
    }

    // Expand array references: if a CreateInInventory / CreateAttachment
    // line names a known array (e.g. `CreateInInventory(shirtColors[idx])`),
    // pull each element out as its own call. Cheap substring check —
    // good enough for the starter-JSON pass.
    for (idx, raw) in lines.iter().enumerate() {
        let ln = idx + 1;
        let line = raw.trim();
        if !(line.contains("CreateInInventory(") || line.contains("CreateAttachment(")) {
            continue;
        }
        for arr in &arrays {
            let needle = format!("{}[", arr.name);
            if line.contains(&needle) {
                for v in &arr.values {
                    calls.push(InitCCall {
                        line_number: ln,
                        kind: InitCCallKind::ArrayElement,
                        classname: v.clone(),
                        context_line: line.to_string(),
                    });
                }
            }
        }
    }

    // Dedup (line_number, kind, classname). Not strictly required but
    // keeps the UI output clean.
    calls.sort_by(|a, b| {
        a.line_number
            .cmp(&b.line_number)
            .then(a.classname.cmp(&b.classname))
    });
    calls.dedup_by(|a, b| {
        a.line_number == b.line_number
            && a.kind == b.kind
            && a.classname == b.classname
    });

    // Union classname list in first-seen order.
    let mut seen = std::collections::HashSet::new();
    let mut classnames = Vec::new();
    for c in &calls {
        if seen.insert(c.classname.clone()) {
            classnames.push(c.classname.clone());
        }
    }

    InitCScan {
        file_display: String::new(),
        file_exists: true,
        total_lines: lines.len(),
        calls,
        arrays,
        classnames,
    }
}

// ---------- Parse helpers ----------

fn scan_call(
    line: &str,
    needle: &str,
    kind: InitCCallKind,
    line_number: usize,
    out: &mut Vec<InitCCall>,
) {
    let mut cursor = 0usize;
    while let Some(pos) = line[cursor..].find(needle) {
        let after = cursor + pos + needle.len();
        // Skip whitespace.
        let rest = &line[after..];
        let trimmed = rest.trim_start();
        if let Some(stripped) = trimmed.strip_prefix('"') {
            if let Some(end_q) = stripped.find('"') {
                let cn = &stripped[..end_q];
                if !cn.is_empty() && is_reasonable_classname(cn) {
                    out.push(InitCCall {
                        line_number,
                        kind,
                        classname: cn.to_string(),
                        context_line: line.to_string(),
                    });
                }
            }
        }
        cursor = after;
    }
}

/// Classnames in DayZ are alphanumeric + underscore, usually
/// PascalCase. Reject strings that obviously aren't classnames (e.g.
/// empty, contain whitespace, or look like file paths) so we don't
/// drag noise into the importer.
fn is_reasonable_classname(s: &str) -> bool {
    !s.is_empty()
        && s.len() < 128
        && !s.contains(' ')
        && !s.contains('/')
        && !s.contains('\\')
        && !s.contains('.')
        && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// Parse `string <name>[] = { "A", "B", "C" };` (whitespace-tolerant).
/// Returns None if the line doesn't match.
fn try_parse_string_array(line: &str, line_number: usize) -> Option<StringArrayDecl> {
    let after_string = line.strip_prefix("string ")?;
    let eq_pos = after_string.find('=')?;
    let name_part = after_string[..eq_pos].trim();
    let name = name_part
        .strip_suffix("[]")
        .map(|s| s.trim())
        .unwrap_or(name_part);
    if name.is_empty() {
        return None;
    }
    if !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return None;
    }

    let after_eq = &after_string[eq_pos + 1..];
    let open = after_eq.find('{')?;
    let close = after_eq.find('}')?;
    if close <= open {
        return None;
    }
    let inside = &after_eq[open + 1..close];

    let values: Vec<String> = inside
        .split(',')
        .filter_map(|chunk| {
            let t = chunk.trim();
            if t.starts_with('"') && t.ends_with('"') && t.len() >= 2 {
                Some(t[1..t.len() - 1].to_string())
            } else {
                None
            }
        })
        .filter(|v| is_reasonable_classname(v))
        .collect();

    if values.is_empty() {
        return None;
    }
    Some(StringArrayDecl {
        name: name.to_string(),
        line_number,
        values,
    })
}

// ---------- Starter-JSON generator ----------

/// Produce a minimal `cfgPlayerSpawnGear.json` seeded with the
/// classnames the scanner found, all in a single default cargo
/// pool. Chance is 1.0 so every item spawns on every fresh
/// character until the user edits it down.
pub fn starter_json_from_scan(scan: &InitCScan) -> String {
    let items_json: Vec<String> = scan
        .classnames
        .iter()
        .map(|n| format!("\"{}\"", n.replace('"', "\\\"")))
        .collect();
    let children = items_json.join(", ");
    format!(
        r#"{{
  "version": "1.0",
  "loadouts": [
    {{
      "characterTypes": [],
      "discreteSet": [],
      "cargo": [
        {{
          "chance": 1.0,
          "complexChildrenTypes": [
            {{ "chance": 1.0, "children": [{children}] }}
          ]
        }}
      ]
    }}
  ]
}}
"#
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r##"
class CustomMission: MissionServer
{
    override void StartingEquipSetup(PlayerBase player, bool clothesChosen)
    {
        EntityAI itemClothing;
        EntityAI itemEnt;
        ItemBase itemBs;

        if (clothesChosen) return;

        string chemlightArray[] = { "Chemlight_White", "Chemlight_Yellow", "Chemlight_Green" };
        int rndIndex = Math.RandomInt(0, 3);

        itemClothing = player.FindAttachmentBySlotName("Body");
        if (itemClothing)
        {
            itemEnt = itemClothing.GetInventory().CreateInInventory(chemlightArray[rndIndex]);
            itemEnt = itemClothing.GetInventory().CreateInInventory("Rag");
            if (Class.CastTo(itemBs, itemEnt))
                itemBs.SetQuantity(4);
        }

        itemEnt = player.GetInventory().CreateInInventory("HandcuffKeys");
        itemEnt = player.GetInventory().CreateInInventory("Matchbox");
        // CreateInInventory("Commented_Out")  — should NOT be picked up
        player.FindAttachmentBySlotName("Head").GetInventory().CreateAttachment("Mich2001Helmet_ARMY");
    }
}
"##;

    #[test]
    fn picks_up_direct_createininventory_strings() {
        let s = scan_text(SAMPLE);
        let got: Vec<&str> = s
            .calls
            .iter()
            .filter(|c| c.kind == InitCCallKind::CreateInInventory)
            .map(|c| c.classname.as_str())
            .collect();
        assert!(got.contains(&"Rag"));
        assert!(got.contains(&"HandcuffKeys"));
        assert!(got.contains(&"Matchbox"));
    }

    #[test]
    fn picks_up_createattachment_strings() {
        let s = scan_text(SAMPLE);
        let atts: Vec<&str> = s
            .calls
            .iter()
            .filter(|c| c.kind == InitCCallKind::CreateAttachment)
            .map(|c| c.classname.as_str())
            .collect();
        assert_eq!(atts, vec!["Mich2001Helmet_ARMY"]);
    }

    #[test]
    fn expands_string_array_references() {
        let s = scan_text(SAMPLE);
        assert_eq!(s.arrays.len(), 1);
        assert_eq!(s.arrays[0].name, "chemlightArray");
        assert_eq!(s.arrays[0].values.len(), 3);

        // Chemlight_* should appear as ArrayElement calls.
        let array_els: Vec<&str> = s
            .calls
            .iter()
            .filter(|c| c.kind == InitCCallKind::ArrayElement)
            .map(|c| c.classname.as_str())
            .collect();
        assert!(array_els.contains(&"Chemlight_White"));
        assert!(array_els.contains(&"Chemlight_Yellow"));
        assert!(array_els.contains(&"Chemlight_Green"));
    }

    #[test]
    fn skips_commented_out_calls() {
        let s = scan_text(SAMPLE);
        let has_commented = s
            .calls
            .iter()
            .any(|c| c.classname == "Commented_Out");
        assert!(!has_commented, "commented // calls must be skipped");
    }

    #[test]
    fn union_classnames_are_unique_and_ordered() {
        let s = scan_text(SAMPLE);
        // No duplicates.
        let uniq: std::collections::HashSet<_> = s.classnames.iter().collect();
        assert_eq!(uniq.len(), s.classnames.len());
    }

    #[test]
    fn starter_json_contains_every_classname() {
        let s = scan_text(SAMPLE);
        let json = starter_json_from_scan(&s);
        for cn in &s.classnames {
            assert!(
                json.contains(&format!("\"{cn}\"")),
                "starter JSON should contain {cn}",
            );
        }
        // Sanity: valid JSON after generation.
        let _: serde_json::Value =
            serde_json::from_str(&json).expect("generated JSON must parse");
    }

    #[test]
    fn ignores_noisy_quoted_strings() {
        let noisy = r#"
            string path = "file/with/slashes.json";
            itemClothing = player.FindAttachmentBySlotName("Body");
            player.GetInventory().CreateInInventory("");
            player.GetInventory().CreateInInventory("Classname With Spaces");
            player.GetInventory().CreateInInventory("LegitClass");
        "#;
        let s = scan_text(noisy);
        let names: Vec<&str> =
            s.calls.iter().map(|c| c.classname.as_str()).collect();
        assert_eq!(names, vec!["LegitClass"]);
    }
}
