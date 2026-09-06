//! `cfgeconomycore.xml` round-tripping parser.
//!
//! This file is the Central Economy orchestrator: it lists the CE folders
//! Bohemia / mods / us contribute, and what the files in each folder are.
//! PDR §9.10: the user should rarely see this file, but the app must
//! manage it so custom override files are registered.
//!
//! We parse into a minimal element tree so we can emit the file back
//! without losing blocks we don't understand (defaults, multipliers, mod
//! registrations). Round-trip preservation matters here.

use std::io::Cursor;
use std::path::Path;

use quick_xml::events::{BytesEnd, BytesStart, BytesText, Event};
use quick_xml::Reader;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

#[derive(Debug, Default, Clone)]
pub struct EconomyCore {
    /// Top-level root name (normally `economy_core`).
    pub root_name: String,
    pub root_attrs: Vec<(String, String)>,
    /// Children of the root, preserved in order.
    pub children: Vec<Node>,
}

#[derive(Debug, Clone)]
pub enum Node {
    Element(Element),
    Text(String),
    Comment(String),
}

#[derive(Debug, Clone)]
pub struct Element {
    pub name: String,
    pub attrs: Vec<(String, String)>,
    pub children: Vec<Node>,
    pub self_closing: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CeFile {
    pub name: String,
    #[serde(rename = "type")]
    pub file_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CeBlock {
    pub folder: String,
    pub files: Vec<CeFile>,
}

impl EconomyCore {
    pub fn empty() -> Self {
        Self {
            root_name: "economy_core".into(),
            root_attrs: Vec::new(),
            children: Vec::new(),
        }
    }

    pub fn parse_file(path: &Path) -> AppResult<Self> {
        if !path.exists() {
            return Ok(Self::empty());
        }
        let bytes = std::fs::read(path)?;
        Self::parse_bytes(&bytes).map_err(|e| AppError::Internal(format!(
            "parsing cfgeconomycore.xml {}: {e}",
            path.display()
        )))
    }

    pub fn parse_bytes(bytes: &[u8]) -> Result<Self, String> {
        let mut reader = Reader::from_reader(bytes);
        reader.config_mut().trim_text(false);

        let mut buf = Vec::new();
        let mut root: Option<Element> = None;
        let mut stack: Vec<Element> = Vec::new();

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(e)) => {
                    let elem = element_from(&e, false)?;
                    stack.push(elem);
                }
                Ok(Event::Empty(e)) => {
                    let elem = element_from(&e, true)?;
                    if stack.is_empty() {
                        root = Some(elem);
                    } else {
                        stack.last_mut().unwrap().children.push(Node::Element(elem));
                    }
                }
                Ok(Event::End(_)) => {
                    let done = stack.pop().ok_or_else(|| "unbalanced end tag".to_string())?;
                    if stack.is_empty() {
                        root = Some(done);
                    } else {
                        stack.last_mut().unwrap().children.push(Node::Element(done));
                    }
                }
                Ok(Event::Text(t)) => {
                    let s = t.unescape().map_err(|e| e.to_string())?.into_owned();
                    if !s.trim().is_empty() {
                        if let Some(top) = stack.last_mut() {
                            top.children.push(Node::Text(s));
                        }
                    }
                }
                Ok(Event::Comment(t)) => {
                    let s = t.unescape().map_err(|e| e.to_string())?.into_owned();
                    if let Some(top) = stack.last_mut() {
                        top.children.push(Node::Comment(s));
                    }
                }
                Ok(Event::Eof) => break,
                Ok(_) => {}
                Err(e) => return Err(e.to_string()),
            }
            buf.clear();
        }

        let root = root.ok_or_else(|| "document has no root".to_string())?;
        Ok(Self {
            root_name: root.name,
            root_attrs: root.attrs,
            children: root.children,
        })
    }

    pub fn write_file(&self, path: &Path) -> AppResult<()> {
        let text = self.serialize()?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(path, text)?;
        Ok(())
    }

    pub fn serialize(&self) -> AppResult<String> {
        let mut writer = quick_xml::Writer::new_with_indent(Cursor::new(Vec::new()), b' ', 4);

        let mut start = BytesStart::new(self.root_name.as_str());
        for (k, v) in &self.root_attrs {
            start.push_attribute((k.as_str(), v.as_str()));
        }
        writer
            .write_event(Event::Start(start))
            .map_err(|e| AppError::Internal(e.to_string()))?;

        for child in &self.children {
            write_node(&mut writer, child)?;
        }

        writer
            .write_event(Event::End(BytesEnd::new(self.root_name.as_str())))
            .map_err(|e| AppError::Internal(e.to_string()))?;

        let bytes = writer.into_inner().into_inner();
        let body = String::from_utf8(bytes).map_err(|e| AppError::Internal(e.to_string()))?;
        let mut out = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        out.push_str(body.trim_start());
        if !out.ends_with('\n') {
            out.push('\n');
        }
        Ok(out)
    }

    /// Move the `<ce folder="{folder}">` block to the end of the
    /// document so its files load AFTER every preceding `<ce>` block.
    /// Returns true if the document was modified.
    ///
    /// Load-order invariant: DayZ's CE processes `<ce>` blocks in
    /// document order, and a later `<type>` / `<event>` entry with the
    /// same name replaces an earlier one. For our own `custom/`
    /// overrides to actually override mod defaults, custom MUST be the
    /// last ce block — so every mutation of cfgeconomycore.xml calls
    /// this afterwards.
    pub fn move_folder_to_end(&mut self, folder: &str) -> bool {
        let pos = self.children.iter().position(|n| match n {
            Node::Element(e) if e.name == "ce" => attr(e, "folder") == Some(folder),
            _ => false,
        });
        let Some(pos) = pos else {
            return false;
        };
        // Already last among ce blocks? Then no move needed.
        let already_last = self.children.iter().skip(pos + 1).all(|n| match n {
            Node::Element(e) => e.name != "ce",
            _ => true,
        });
        if already_last {
            return false;
        }
        let node = self.children.remove(pos);
        self.children.push(node);
        true
    }

    /// Remove every `<ce folder="…">` block whose folder attribute
    /// matches `pred`. Returns the number of blocks actually removed.
    /// Surrounding whitespace / text / comments between blocks are kept.
    pub fn remove_ce_blocks<F>(&mut self, mut pred: F) -> usize
    where
        F: FnMut(&str) -> bool,
    {
        let before = self.children.len();
        self.children.retain(|n| match n {
            Node::Element(e) if e.name == "ce" => {
                let folder = attr(e, "folder").unwrap_or("");
                !pred(folder)
            }
            _ => true,
        });
        before - self.children.len()
    }

    /// Remove individual `<file>` entries from `<ce>` blocks. `pred`
    /// receives the block's folder attribute and the file it's
    /// deciding on. Returns the number of file entries removed.
    /// Empty `<ce>` blocks left by the removal are NOT pruned —
    /// call `remove_ce_blocks` separately if that's desired.
    pub fn remove_ce_files<F>(&mut self, mut pred: F) -> usize
    where
        F: FnMut(&str, &CeFile) -> bool,
    {
        let mut removed = 0;
        for node in self.children.iter_mut() {
            let Node::Element(ce) = node else { continue };
            if ce.name != "ce" {
                continue;
            }
            let folder = attr(ce, "folder").unwrap_or("").to_string();
            ce.children.retain(|n| match n {
                Node::Element(file_el) if file_el.name == "file" => {
                    let cef = CeFile {
                        name: attr(file_el, "name").unwrap_or_default().to_string(),
                        file_type: attr(file_el, "type")
                            .unwrap_or_default()
                            .to_string(),
                    };
                    if pred(&folder, &cef) {
                        removed += 1;
                        false
                    } else {
                        true
                    }
                }
                _ => true,
            });
        }
        removed
    }

    /// Enumerate the `<ce folder="…">` blocks and their file children.
    pub fn ce_blocks(&self) -> Vec<CeBlock> {
        self.children
            .iter()
            .filter_map(|n| match n {
                Node::Element(e) if e.name == "ce" => Some(e),
                _ => None,
            })
            .map(|e| {
                let folder = attr(e, "folder").unwrap_or_default().to_string();
                let files = e
                    .children
                    .iter()
                    .filter_map(|n| match n {
                        Node::Element(ce) if ce.name == "file" => Some(ce),
                        _ => None,
                    })
                    .map(|file_el| CeFile {
                        name: attr(file_el, "name").unwrap_or_default().to_string(),
                        file_type: attr(file_el, "type").unwrap_or_default().to_string(),
                    })
                    .collect();
                CeBlock { folder, files }
            })
            .collect()
    }

    /// Ensure a `<ce folder="{folder}"><file name="…" type="…"/>…</ce>`
    /// block exists with the requested file entries. Returns whether the
    /// document was mutated.
    pub fn ensure_ce_block(&mut self, folder: &str, wanted: &[CeFile]) -> bool {
        let mut changed = false;
        let idx = self.children.iter().position(|n| match n {
            Node::Element(e) if e.name == "ce" => {
                attr(e, "folder") == Some(folder)
            }
            _ => false,
        });

        if let Some(pos) = idx {
            if let Node::Element(e) = &mut self.children[pos] {
                for w in wanted {
                    let present = e.children.iter().any(|n| match n {
                        Node::Element(fe) if fe.name == "file" => {
                            attr(fe, "name") == Some(&w.name)
                                && attr(fe, "type") == Some(&w.file_type)
                        }
                        _ => false,
                    });
                    if !present {
                        e.children.push(Node::Element(Element {
                            name: "file".into(),
                            attrs: vec![
                                ("name".into(), w.name.clone()),
                                ("type".into(), w.file_type.clone()),
                            ],
                            children: Vec::new(),
                            self_closing: true,
                        }));
                        changed = true;
                    }
                }
            }
        } else {
            // Insert a fresh block.
            let children = wanted
                .iter()
                .map(|w| {
                    Node::Element(Element {
                        name: "file".into(),
                        attrs: vec![
                            ("name".into(), w.name.clone()),
                            ("type".into(), w.file_type.clone()),
                        ],
                        children: Vec::new(),
                        self_closing: true,
                    })
                })
                .collect();
            self.children.push(Node::Element(Element {
                name: "ce".into(),
                attrs: vec![("folder".into(), folder.to_string())],
                children,
                self_closing: false,
            }));
            changed = true;
        }
        changed
    }
}

fn element_from(e: &BytesStart, self_closing: bool) -> Result<Element, String> {
    let name = std::str::from_utf8(e.name().as_ref())
        .map_err(|err| err.to_string())?
        .to_string();
    let mut attrs = Vec::new();
    for a in e.attributes() {
        let a = a.map_err(|err| err.to_string())?;
        let key = std::str::from_utf8(a.key.as_ref())
            .map_err(|err| err.to_string())?
            .to_string();
        let val = a.unescape_value().map_err(|err| err.to_string())?.into_owned();
        attrs.push((key, val));
    }
    Ok(Element {
        name,
        attrs,
        children: Vec::new(),
        self_closing,
    })
}

fn attr<'a>(e: &'a Element, key: &str) -> Option<&'a str> {
    e.attrs.iter().find(|(k, _)| k == key).map(|(_, v)| v.as_str())
}

fn write_node<W: std::io::Write>(
    writer: &mut quick_xml::Writer<W>,
    node: &Node,
) -> AppResult<()> {
    match node {
        Node::Text(s) => writer
            .write_event(Event::Text(BytesText::new(s)))
            .map_err(|e| AppError::Internal(e.to_string()))?,
        Node::Comment(s) => writer
            .write_event(Event::Comment(BytesText::new(s)))
            .map_err(|e| AppError::Internal(e.to_string()))?,
        Node::Element(e) => {
            let mut start = BytesStart::new(e.name.as_str());
            for (k, v) in &e.attrs {
                start.push_attribute((k.as_str(), v.as_str()));
            }
            if e.children.is_empty() && e.self_closing {
                writer
                    .write_event(Event::Empty(start))
                    .map_err(|e| AppError::Internal(e.to_string()))?;
            } else {
                writer
                    .write_event(Event::Start(start))
                    .map_err(|e| AppError::Internal(e.to_string()))?;
                for c in &e.children {
                    write_node(writer, c)?;
                }
                writer
                    .write_event(Event::End(BytesEnd::new(e.name.as_str())))
                    .map_err(|e| AppError::Internal(e.to_string()))?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn move_folder_to_end_places_custom_last() {
        // Simulates the exact failure mode the MMG user hit: custom
        // block was created first (vanilla edit), then the MMG import
        // appended mod blocks after it — leaving custom in the middle.
        let src = r#"<?xml version="1.0" encoding="UTF-8"?>
<economy_core>
    <ce folder="custom">
        <file name="types_custom.xml" type="types"/>
    </ce>
    <ce folder="mmg_ce/types">
        <file name="Types.xml" type="types"/>
    </ce>
    <ce folder="mmg_ce/spawnabletypes">
        <file name="Spawnable.xml" type="spawnabletypes"/>
    </ce>
</economy_core>
"#;
        let mut doc = EconomyCore::parse_bytes(src.as_bytes()).unwrap();
        let changed = doc.move_folder_to_end("custom");
        assert!(changed, "custom was not last and should have been moved");

        let blocks = doc.ce_blocks();
        assert_eq!(blocks.len(), 3);
        assert_eq!(
            blocks.last().unwrap().folder,
            "custom",
            "custom must be the final ce block so overrides win"
        );

        // Idempotent: second call should be a no-op.
        assert!(!doc.move_folder_to_end("custom"));

        // Unknown folder: no-op, no panic.
        assert!(!doc.move_folder_to_end("nonexistent"));
    }

    #[test]
    fn round_trip_preserves_unknowns() {
        let src = r#"<?xml version="1.0" encoding="UTF-8"?>
<economy_core>
    <ce folder="expansion_ce">
        <file name="expansion_types.xml" type="types"/>
    </ce>
    <defaults>
        <classes>keep me verbatim</classes>
    </defaults>
</economy_core>
"#;
        let mut doc = EconomyCore::parse_bytes(src.as_bytes()).unwrap();
        assert_eq!(doc.root_name, "economy_core");
        let blocks = doc.ce_blocks();
        assert_eq!(blocks.len(), 1);
        assert_eq!(blocks[0].folder, "expansion_ce");

        let changed = doc.ensure_ce_block(
            "custom",
            &[CeFile {
                name: "types_custom.xml".into(),
                file_type: "types".into(),
            }],
        );
        assert!(changed);
        let blocks = doc.ce_blocks();
        assert_eq!(blocks.len(), 2);
        assert!(blocks.iter().any(|b| b.folder == "custom"));

        let out = doc.serialize().unwrap();
        assert!(out.contains("<ce folder=\"custom\">"));
        assert!(out.contains("keep me verbatim"));
        // Second call should be idempotent.
        let changed2 = doc.ensure_ce_block(
            "custom",
            &[CeFile {
                name: "types_custom.xml".into(),
                file_type: "types".into(),
            }],
        );
        assert!(!changed2);
    }
}
