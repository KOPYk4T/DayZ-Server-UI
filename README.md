# DayZ ServerUI

A desktop tool for editing DayZ dedicated server configuration without
hand-editing XML. Point it at a server, pull the config into a local
workspace, edit through typed forms and an interactive map, and push a
reviewed diff back.

Built with [Tauri 2](https://v2.tauri.app/) (Rust backend) and React +
TypeScript on the frontend.

## What it does (and doesn't)

**Does:**

- Edits Central Economy (CE) configuration — `types.xml`, `events.xml`,
  loadouts, limits, player spawns, globals, gear sets, `serverDZ.cfg`,
  and more — through typed forms validated against the schema.
- Treats your workspace as a git-tracked folder, so every save is
  reversible and every push is diff-reviewed before it touches a
  server.
- Works against a local folder or an SFTP-reachable server, with the
  same UI either way.
- Parses vanilla and mod CE files side by side, tagging each item and
  event with its source, and can register/unregister a mod's CE
  fragments in `cfgeconomycore.xml` cleanly.
- Visualises player spawns, event positions, and loot-tier zones on an
  interactive map instead of raw coordinates in an XML attribute.
- **Builds a real, signed mod PBO** via the optional Reskin module —
  see the exception below.

**Doesn't:**

- **Author a genuinely new item from scratch.** A brand-new model,
  animations, and scripts still have to be made in the Enfusion
  Workbench — this tool can't create geometry or behavior that isn't
  already in the game or an installed mod.
- **Replace DayZ Tools or an in-game admin spawn menu** — the CE
  editors change config, not live game state.

**Exception — the Reskin module:** unlike the CE editors, Reskin
*does* produce a new, distinct classname: it clones an existing
vanilla or mod item's config, swaps in a custom texture or colour, and
packs + signs a real `.pbo` (via the third-party tools below) that you
drop into your server's mod folder. That new classname is a genuine
in-game item — it just inherits its model, hitbox, and stats from the
item it was cloned from rather than having new geometry or scripts of
its own. Everywhere else in the app (Items, Events, Loadouts, etc.),
"editing config" means exactly that — no PBOs are built or signed.

If a classname you add here isn't defined by the loaded game or an
installed mod, the CE will quietly ignore it: no error, no spawns.

## Core workflow: pull / edit / push

1. **Pull** copies the mission folder, profiles folder, and root
   `serverDZ.cfg` into a local workspace, and initialises that
   workspace as its own git repo on first use.
2. **Edit** through the sidebar editors. Every save commits to the
   workspace git with a descriptive message, so changes are auditable
   and revertable independent of the server.
3. **Review & push** opens a full diff of everything that changed
   since the last push; confirming writes it to the server (or local
   folder) and commits a `push @ <timestamp>` marker.

Nothing reaches the server until the Push step, and pushes to a local
folder additionally snapshot the files they're about to overwrite
under an app-data backups directory before doing any work.

## Features

Domain editors (one per CE file / server system):

- **Dashboard** — cross-file overview and health summary
- **Items** (`types.xml`) — economy tuning, nominal/min, flags, tiers
- **Events** — dynamic event definitions and spawn positions
- **Loadouts** — spawnable types and random presets
- **Gear Sets**
- **Globals** (`globals.xml`)
- **Player Spawns**
- **Zones & Tiers** — loot-tier map overlay
- **Buildings** — static loot placement
- **Server Config** (`serverDZ.cfg`)
- **Ignorelist**
- **Health & Lint** — cross-file validation, run on every save
- **Map** — interactive Leaflet view of the terrain, spawns, events,
  and zones

Workspace & connection:

- **Profiles** — one per server; local folder or SFTP, credentials
  stored in an encrypted, machine-bound Stronghold vault
- **Sync** — diff review, push, workspace/git history, pre-push
  backups
- **Setup** — prerequisite checks (e.g. the DayZ Tools `P:` drive)

Optional modules (toggle in Settings → Modules):

- **Mods** — import a mod's CE files, browse installed mods, manage
  DayZ Expansion submodules (map, market, quests, notifications, …)
- **Reskin** — clone a vanilla/mod item with a custom texture or
  colour, bundle author-written config-class overrides and external
  PBOs, and pack + sign the result into a real server mod (requires
  Bohemia's and Mikero's tools — see Credits below)

## Project structure

```
src/                      React + TypeScript frontend
  features/<domain>/      One folder per editor or workflow area
                           (items, events, loadouts, map, sync, mods, …)
  addons/                 Self-registering optional modules (Mods, Reskin);
                           see below — never hardcode addon routes elsewhere
  components/             Shared UI (shadcn/radix-based)
  stores/                 Zustand state
  hooks/                  Shared React hooks
  lib/                    Frontend utilities

src-tauri/                Rust backend
  src/commands/           Tauri command handlers — the IPC surface the
                           frontend calls (one file roughly per domain:
                           items.rs, events.rs, loadouts.rs, sync.rs, …)
  src/domain/             Typed Rust models for each config concept
                           (item_type, dynamic_event, server_cfg, …)
  src/parsers/            Round-tripping parsers for each on-disk format —
                           preserve comments/whitespace/unknown keys on
                           write-back rather than regenerating the file
  src/vault.rs            Encrypted SFTP credential storage (Stronghold)
```

### Addon architecture

**Mods** and **Reskin** are registered as addons (`src/addons/*.addon.tsx`)
rather than being wired directly into the app shell. Each addon
contributes its own routes and sidebar section and is toggled on/off
from Settings → Modules; `App.tsx` and `Sidebar.tsx` render whatever's
enabled without knowing about specific addons. All modules are enabled
by default — this is a fully open build with no licensing or paywall.

## Running from source

Prerequisites:

- [Node.js](https://nodejs.org/) 20+ and [pnpm](https://pnpm.io/)
- The [Rust toolchain](https://www.rust-lang.org/tools/install) and the
  [Tauri 2 system dependencies](https://v2.tauri.app/start/prerequisites/)
  for your OS.

```sh
pnpm install
pnpm tauri dev      # run the app in development
pnpm tauri build    # produce a release bundle
```

Frontend-only scripts (`pnpm dev`, `pnpm build`, `pnpm lint`) are also
available for working on the UI without the Rust shell.

A few backend unit tests look for real vanilla sample files (e.g.
`../examples/cfggameplay.json`) that aren't part of this repo; they
skip themselves automatically when the file isn't present, so
`cargo test` is safe to run from a fresh clone.

## Credits & third-party tools

- **[DayZ Expansion](https://github.com/salutesh/DayZ-Expansion-Scripts)**
  (by [ExpansionModTeam](https://github.com/ExpansionModTeam) /
  [salutesh](https://github.com/salutesh)) — the Mods module's
  Expansion editors (map, market, traders, quests, loadouts, AI
  patrols, safezones, and settings) target this mod's config format.
  DayZ ServerUI is an independent tool and isn't affiliated with or
  endorsed by the Expansion team.
- **[Mikero's Tools](https://mikero.bytex.digital/)** — the Reskin
  module shells out to Mikero's `DeRap`, `ExtractPbo`, and `MakePbo`
  to read and pack `.pbo` addons. These are separate, third-party
  executables you supply yourself under `tools/DePboTools/` (or point
  the app at via Setup); they are **not** bundled with or distributed
  by this repository.
- **Bohemia Interactive's Arma 3 Tools** — Reskin also uses BI's
  [ImageToPAA / TexView 2](https://community.bistudio.com/wiki/ImageToPAA)
  for texture conversion and [DSUtils](https://community.bistudio.com/wiki/DSUtils)
  (`DSSignFile`, `DSCreateKey`) to sign the resulting mod, same as any
  other Arma/DayZ addon. Also supplied by you, not bundled here.

## License

Licensed under either of

- MIT license ([LICENSE-MIT](LICENSE-MIT))
- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE))

at your option.
