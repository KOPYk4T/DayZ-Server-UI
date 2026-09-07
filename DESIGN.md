---
name: DayZ ServerUI
description: Field-kit desktop tool for DayZ server config. Black canvas, paper ink, rust only on action.
colors:
  field: "#0c0c0b"
  panel: "#161615"
  overlay: "#1d1d1b"
  void: "#080808"
  paper: "#f3f2ee"
  mute: "#a8a7a1"
  rust: "#d47028"
  rust-ink: "#0c0c0b"
  danger: "#c24a33"
  border: "#f3f2ee1f"
typography:
  page:
    fontFamily: "Oswald, IBM Plex Sans, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "0.04em"
  section:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.01em"
  body:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  hint:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  eyebrow:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.12em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "2px"
  md: "4px"
  lg: "6px"
spacing:
  tight: "8px"
  group: "12px"
  section: "40px"
  page: "32px"
components:
  button-primary:
    backgroundColor: "{colors.rust}"
    textColor: "{colors.rust-ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    typography: "{typography.body}"
  button-secondary:
    backgroundColor: "{colors.overlay}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    typography: "{typography.body}"
  page-title:
    textColor: "{colors.paper}"
    typography: "{typography.page}"
  section-title:
    textColor: "{colors.paper}"
    typography: "{typography.section}"
---

## Overview

DayZ ServerUI is a dark-first desktop tool. The scene is a night desk: near-black field, paper-white ink, one rust mark on the thing you are about to do. Neutrals stay achromatic so size, weight, and space carry hierarchy before color does.

Use the CSS utilities `.type-page`, `.type-section`, `.type-body`, `.type-hint`, `.type-eyebrow`, and `.type-mono`. Oswald is reserved for the page name. Everything else is IBM Plex Sans. Paths and codes are JetBrains Mono.

## Colors

| Role | Token | Use |
|---|---|---|
| Field | `--background` `#0c0c0b` | App canvas |
| Panel | `--card` `#161615` | Sticky header, cards |
| Overlay | `--popover` `#1d1d1b` | Dialogs, menus |
| Void | `--sidebar` `#080808` | Left rail |
| Paper | `--foreground` `#f3f2ee` | Titles, section names |
| Mute | `--muted-foreground` `#a8a7a1` | Hints, paths, inactive |
| Rust | `--primary` `#d47028` | Primary button, selection, focus ring |
| Danger | `--destructive` `#c24a33` | Errors, conflicts |

Olive brand swatches remain in `:root` for rare legacy call sites. Do not use them for body, labels, or chrome. Do not wash surfaces with rust or olive radials.

## Typography

Fixed rem ramp (ratio ~1.17). Do not use `clamp()` in product UI.

- **Page** (`.type-page`): Oswald, 1.25rem, uppercase. Once per screen, in `PageHeader`.
- **Section** (`.type-section`): IBM Plex Semibold, 0.875rem, sentence case, paper. Form blocks, card titles, "Places".
- **Body** (`.type-body`): IBM Plex Regular, 0.875rem. Explanations up to 65ch.
- **Hint** (`.type-hint`): 0.75rem mute. Supporting lines under a section.
- **Eyebrow** (`.type-eyebrow`): rare. One kicker per page at most. Never on every section.
- **Mono** (`.type-mono`): paths, IDs, diffs.

Sidebar menu labels are IBM Plex, not Oswald.

## Elevation

Sidebar (void) → field → panel → overlay. Borders are 12% paper, not colored accents. Sticky header uses `shadow-sticky`. No side-stripe rust bars. No glass.

## Components

- **Primary button**: rust fill, black ink. The next write (Sync to local, Confirm, Save).
- **Secondary / outline**: paper on dark, no rust border.
- **PageHeader**: paper title, mute icon and description, no left rust bar.
- **Cards**: `rounded-md`, hairline border, no nested cards.
- **Inputs**: mute placeholders that still clear 4.5:1 (`#a8a7a1` on field).
- **Active nav**: light wash (`sidebar-accent`), not a rust pill.

## Do's and Don'ts

**Do**

- Leave rust for the primary action and real selection
- Separate sections with ~40px, group related controls with 8–12px
- Title sections in sentence case at paper weight
- Keep copy short and literal (Workspace, Local server, Remote)

**Don't**

- Paint headings, icons, or step numbers rust
- Use Oswald on UI chrome
- Repeat 10px uppercase labels as a section system
- Add colored left borders to cards or callouts
- Wrap every cluster in a card
