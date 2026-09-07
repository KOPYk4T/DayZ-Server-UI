# Product

## Register

product

## Users

DayZ dedicated-server operators. They work at a desk, often late, with a Steam install or a host panel open. They know mission folders, `types.xml`, and SFTP. They do not want to learn a new product vocabulary.

## Product Purpose

Edit Central Economy and server config in a local workspace, then move a reviewed diff to the dedicated folder on this PC and, when ready, to Remote over SFTP. Success is a change that can be tested locally and pushed without hand-editing XML or guessing which copy of a file is live.

## Brand Personality

Field kit. Quiet. Exact.

The interface should feel like a loadout bench: black surface, paper labels, one warning color. Confidence comes from hierarchy and review, not from decoration.

## Anti-references

- Olive-washed "tactical" dashboards and game-launcher chrome
- Rust orange used as body text, section numbers, or page-title paint
- SaaS card grids (icon + heading + blurb, repeated)
- Tiny uppercase eyebrows on every section
- Display type (Oswald) on buttons, sidebar labels, or form headings

## Design Principles

- Hierarchy by type and space, not by hue
- Accent only for the next action, the current selection, or a real state
- Same words in nav, headings, and empty states (Workspace, Local server, Remote)
- Review before write: the operator always sees the diff
- Familiar desktop-tool affordances; invent nothing for flavor

## Accessibility & Inclusion

Aim for WCAG 2.2 AA on text: body and hints ≥4.5:1 against their surface. Respect `prefers-reduced-motion`. Do not encode meaning in rust alone; pair color with a label or icon. Keep zoom and rem-based type intact.
